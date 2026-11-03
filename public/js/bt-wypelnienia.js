// Replay modułu Backtest (1.5.0): silnik wypełnień. Czysty moduł (bez DOM, bez I/O), działa w przeglądarce i w Node.
// Liczy na strumieniu bazowym z bt-swieca.js (1s w oknie prawdziwych sekund, 1m poza nim), nigdy na sekundach syntetyzowanych z 1m (§5).
// Reguły (§7 [S] i karta B2 [B]):
// - market: natychmiast po last.price, entryT = last.t; last = { t: chwila bieżąca (kursor), price: zamknięcie ostatniej widocznej świecy bazowej };
// - limit i TP: przy dotknięciu po cenie limitu, także przy luce; stop (wejście i SL): po cenie wyzwolenia, przy luce po open świecy (gorsza cena);
// - SL i TP w tej samej świecy → SL; w świecy wejścia sprawdzany jest tylko SL;
// - jedna pozycja na instrument, ale od 1.7-2 z wieloma wejściami (dokładki, netting przeciwnym zleceniem, odwrócenie; P3), ES/NQ/MES/MNQ niezależnie; wypełnienie wejścia anuluje tylko przeciwne oczekujące wejścia;
// - 1.7.0 (pakiet 1.7-1): pozycja to lista zdarzeń z czasem (fills, exits, log), a pola 1.6 (qty, openQty, entryPrice, sl, tp, be) są lustrem liczonym przez derive()
//   (bt-ksiega.js). Zdarzenia niosą `at` = chwila, w której stały się znane (koniec świecy dla silnika, last.t dla akcji użytkownika). R liczy się od PIERWSZEGO postawionego SL
//   (`rUsd`), bez SL R = null; SL i TP można usunąć; BE bez SL tylko po stronie zysku;
// - znak wodny: advance przetwarza tylko świece z t + len > hw i t + len ≤ kursor, cofnięcie niczego nie cofa ani nie liczy drugi raz;
//   handel przy last.t < hw → rejected 'rewound';
// - R = wynik brutto / rUsd (jednostka R w $ z modelu pozycji: Σ ilość · |cena − SL odniesienia| · mnożnik); USD z mnożnika; bez prowizji i poślizgu (nie-cel).
// Funkcje nie mutują wejściowego book: zwracają nowy obiekt { book, events }.
// English: order fill engine for the replay (market/limit/stop, SL/TP, BE, partial closes, R/USD, MAE/MFE) on the base candle stream.
import { visibleCount } from './bt-swieca.js';
import { roundTick } from './rysunki.js';
import { MULT, TICK, sgn, derive, beLevel, migrateBook, fillsOf, rUsdOf, nextSeq, riskNow, autoBePrice, AUTOBE_KINDS, AUTOBE_OFFSET_MAX } from './bt-ksiega.js';
import { tpOrder, tpQtyAt, tpPlan, checkTps, farthestTp, TPS_MAX } from './bt-drabinka.js';

export { MULT, TICK, derive, beLevel, migrateBook, rUsdOf, riskNow, autoBePrice, tpPlan, TPS_MAX };

const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));
const r2 = (x) => Math.round(x * 100) / 100 + 0; // + 0 zamienia −0 na 0
const num = (x) => (x === null || x === undefined || x === '' ? null : Number.isFinite(+x) ? roundTick(+x, TICK) : NaN);
const rej = (book, reason, extra = {}) => ({ book, events: [{ type: 'rejected', reason, ...extra }] });
// runda 2 (P3-2): dodatkowe pola odrzucenia drabiny z checkTps (numer poziomu, jego cena i cena odniesienia), gdy poziom leży po złej stronie ceny
const tpsInfo = (ck) => (ck.level ? { level: ck.level, price: ck.price, ref: ck.ref } : {});
// H2 (przegląd kodu #1, P1): „przeglądasz wstecz” liczone per instrument. Chwila bieżąca silnika to koniec ostatniej widocznej świecy bazowej instrumentu
// (ES ma tylko 1m, NQ w oknie 1s ma świece 1s), więc wspólny book.hw z NQ blokował handel ES w środku minuty, choć nikt nie cofał kursora.
// Znak wodny instrumentu = book.hwi[inst]; book.hw (maksimum) zostaje dla „Wróć do bieżącej chwili”. Księga bez hwi (stare pliki, testy) porównuje z book.hw.
const isRewound = (b, last, inst) => {
  if (!last || !Number.isFinite(last.t)) return false;
  const w = b.hwi && Number.isFinite(b.hwi[inst]) ? b.hwi[inst] : (b.hw || 0);
  return last.t < w;
};

// Wielkość pozycji z ryzyka w USD: floor(ryzyko / (|wejście − SL| · mnożnik)), 0 gdy wynik < 1 albo dane złe (UI pokazuje komunikat i pole ręczne).
export function sizeFromRisk({ riskUsd, entry, sl, instrument }) {
  const m = MULT[instrument], d = Math.abs(entry - sl);
  if (!m || !Number.isFinite(riskUsd) || !Number.isFinite(d) || d <= 0 || riskUsd <= 0) return 0;
  const n = Math.floor(riskUsd / (d * m) + 1e-9);
  return n >= 1 ? n : 0;
}

export function emptyBook() {
  return { v: 3, orders: [], positions: { ES: null, NQ: null, MES: null, MNQ: null }, hw: 0, hwi: {}, seq: 0 };
}

// SL po właściwej stronie ceny odniesienia (Long: poniżej, Short: powyżej), TP po przeciwnej. Równość jest zła (wyjście w następnej świecy bez ruchu ceny).
const slOk = (dir, sl, ref) => !Number.isFinite(ref) || (dir === 'Long' ? sl < ref : sl > ref);
// dokładka (cena zlecenia) leży za SL pozycji albo na nim: Long cena ≤ SL, Short cena ≥ SL
const beyondSl = (pos, price) => pos.sl != null && !slOk(pos.dir, pos.sl, price);
const tpOk = (dir, tp, ref) => !Number.isFinite(ref) || (dir === 'Long' ? tp > ref : tp < ref);

// Auto-BE (pakiet 1.7-3): kształt { kind, value, offsetTicks, done } z walidacją. { ab } (ab może być null = wyłączony) albo { bad: true }.
// Odrzucane: zły rodzaj, wartość nie > 0, offset spoza 0..20 ticków albo niecałkowity, cena progu nie po stronie zysku względem ref (średnia pozycji albo cena zlecenia),
// próg w R bez ryzyka (hasRisk = pozycja ma rUsd > 0 albo zlecenie ma SL). Obce pola odpadają.
function checkAutoBe(a, { dir, ref, hasRisk }) {
  if (a === null || a === undefined) return { ab: null };
  if (typeof a !== 'object' || !AUTOBE_KINDS.includes(a.kind)) return { bad: true };
  const value = Number(a.value), off = a.offsetTicks === undefined || a.offsetTicks === null ? 0 : Number(a.offsetTicks);
  if (!(typeof a.value === 'number' || typeof a.value === 'string') || a.value === '' || !Number.isFinite(value) || !(value > 0)) return { bad: true };
  if (!Number.isInteger(off) || off < 0 || off > AUTOBE_OFFSET_MAX) return { bad: true };
  if (a.kind === 'r' && !hasRisk) return { bad: true };
  if (a.kind === 'price' && Number.isFinite(ref) && !(dir === 'Long' ? value > ref : value < ref)) return { bad: true };
  return { ab: { kind: a.kind, value, offsetTicks: off, done: false } };
}

const tpsOf = (tp) => (tp != null ? [{ id: 'tp1', price: tp, pct: 100, hit: null }] : []);

// at = chwila, w której wejście stało się znane (koniec świecy dla zlecenia z silnika, last.t dla rynkowego)
function openPosition(b, o, t, price, events, at = t, extra = {}) {
  b.seq += 1;
  const dir = o.side === 'buy' ? 'Long' : 'Short';
  // [U] 1.11.2026 «Od pierwszego SL bez znacznika» (P5): SL zlecenia jest pierwszym SL pozycji (sl0, slRef porcji); bez SL R jest null do pierwszego postawionego SL
  const pos = derive({
    id: `p${b.seq}`, instrument: o.instrument, dir, orderId: o.id || null,
    fills: [{ t, at, price, qty: o.qty, orderId: o.id || null, slRef: o.sl ?? null, seq: 1 }], exits: [],
    log: o.sl != null ? [{ at, k: 'sl', v: o.sl }] : [],
    sl: o.sl ?? null, tps: Array.isArray(o.tps) ? o.tps.map((x) => ({ ...x })) : tpsOf(o.tp), autoBe: o.autoBe ?? null,
    sl0: o.sl ?? null, sl0T: o.sl != null ? t : null, slLast: o.sl ?? null, ...extra,
  });
  // J (przegląd P2-1): zlecenie złożone według rysunku niesie id rysunku także w pozycji (blokada drugiego wejścia z tego samego rysunku)
  if (o.fromDrawing) pos.fromDrawing = String(o.fromDrawing);
  b.positions[o.instrument] = pos;
  events.push({ type: 'filled', order: o, position: clone(pos) });
  // Decyzja sesji głównej G-2.3 (wynika z P3 «Dokładanie + odwracanie»; to nie są słowa użytkownika): wypełnienie wejścia anuluje tylko oczekujące wejścia PRZECIWNEGO kierunku
  // (zastępuje regułę [B] „anuluje wszystkie inne”); oczekujące zlecenia tego samego kierunku zostają i od tej chwili są dokładkami (intent 'add'). Opis w CHANGELOG.
  const keep = [];
  for (const x of b.orders) {
    if (x.id === o.id) continue;
    if (x.instrument === o.instrument && x.side !== o.side) events.push({ type: 'cancelled', order: x, reason: 'filled-other' });
    else {
      if (x.instrument === o.instrument) {
        x.intent = 'add';
        // zlecenie zamienione na dokładkę traci własne SL/TP (rządzą SL/TP pozycji; wykres nie rysuje osobnej linii SL)
        x.sl = null; x.tp = null; x.tps = [];
      }
      keep.push(x);
    }
  }
  b.orders = keep;
  cancelAddsBeyondSl(b, o.instrument, at, events);
  return pos;
}

// Decyzja sesji głównej 2.11.2026 (poprawki po przeglądzie P0): dokładka leżąca za SL pozycji nigdy nie wchodzi przed SL, więc każda ścieżka, która ją tam stawia (zamiana drugiego wejścia
// w dokładkę, przesunięcie SL, BE), anuluje ją z powodem 'add-beyond-sl' (UI: „Dokładka {cena} anulowana: leży za SL”). Siatka niezależna od ścieżki jest w advance().
function cancelAddsBeyondSl(b, inst, at, events) {
  const pos = b.positions[inst];
  if (!pos || pos.sl == null) return;
  const keep = [];
  for (const o of b.orders) {
    if (o.instrument === inst && o.intent === 'add' && beyondSl(pos, o.price)) { events.push({ type: 'cancelled', order: o, reason: 'add-beyond-sl' }); } else keep.push(o);
  }
  b.orders = keep;
}

// Dokładka (P3): nowa porcja w otwartej pozycji tego samego kierunku. SL i TP pozycji bez zmian; porcja dostaje slRef = bieżący SL, a po usunięciu SL ostatni znany (P6),
// przed jakimkolwiek SL null (pierwszy postawiony SL wpisze się do niej, P5). Średni koszt liczy derive().
// Reguła beAt w jednym miejscu (decyzja sesji głównej 2.11.2026, R2-1): „bez ryzyka” = SL jest na poziomie BE (z nowej średniej) albo lepiej. Wołana po każdej zmianie SL (modifyPosition)
// i po każdym wypełnieniu dokładki (addFill, bo zmienia średnią, a więc poziom BE). Przejście z „ryzyko” na „bez ryzyka” ustawia beAt = ref (cena bieżąca albo cena wypełnienia),
// przejście na „ryzyko” (SL cofnięty pod BE, usunięty albo średnia dokładką przeskoczyła SL) kasuje beAt; obie zmiany mają wpis w log z at (historia zmian; czytany tylko wpis be-auto). Mutuje next.
function trackBeAt(prev, next, ref, at) {
  const good = (p) => { const l = beLevel(p); return p.sl != null && l != null && (p.dir === 'Short' ? p.sl <= l : p.sl >= l); };
  if (good(next) && !good(prev) && Number.isFinite(ref)) { next.beAt = roundTick(ref, TICK); next.log.push({ at, k: 'beAt', v: next.beAt }); }
  else if (!good(next) && next.beAt != null) { next.beAt = null; next.log.push({ at, k: 'beAt', v: null }); }
}

function addFill(b, inst, o, t, price, events, at = t) {
  const cur = b.positions[inst];
  const f = { t, at, price, qty: o.qty, orderId: o.id || null, slRef: cur.sl ?? cur.slLast ?? null, seq: nextSeq(cur) };
  const pos = derive({ ...cur, fills: [...cur.fills, f], log: [...cur.log] });
  trackBeAt(cur, pos, price, at);
  b.positions[inst] = pos;
  events.push({ type: 'filled', add: true, order: o, position: clone(pos) });
  return pos;
}

// Wyjście qty kontraktów po cenie price; przy openQty = 0 pozycja znika z Book z wynikiem (zdarzenie closed niesie pełną Position).
// t = czas rynkowy, at = chwila, w której wyjście stało się znane (koniec świecy dla SL/TP, last.t dla akcji użytkownika), basis = średnia cena otwartej części w tej chwili (§3.1).
// 1.7-5: wyjście z poziomu drabiny niesie `tpId`, a poziom dostaje `hit = { at, qty }` (zostaje w liście: ostatni cel do Notion)
function exitPosition(b, inst, qty, t, price, reason, events, at = t, tpId = null) {
  const cur = b.positions[inst];
  const ex = { t, at, price, qty, reason, basis: cur.avg, seq: nextSeq(cur) };
  if (reason === 'tp' && tpId) ex.tpId = tpId;
  const tps = cur.tps.map((x) => ({ ...x }));
  if (reason === 'tp') { const hit = (tpId && tps.find((x) => !x.hit && x.id === tpId)) || tps.find((x) => !x.hit && x.price === price) || tps.find((x) => !x.hit); if (hit) hit.hit = { at, qty }; }
  const pos = derive({ ...cur, exits: [...cur.exits, ex], tps });
  // zdarzenie wyjścia z poziomu drabiny niesie numer poziomu (TP1…) i liczbę poziomów: komunikaty UI („TP1 10:14:35 · 5 @ 18 330,00 · +1 000 $”) nie muszą zgadywać z księgi
  const tpInfo = ex.tpId ? { tp: { id: ex.tpId, rank: tpOrder(pos.dir, pos.tps).findIndex((x) => x.id === ex.tpId) + 1, n: pos.tps.length, dir: pos.dir } } : {};
  events.push({ type: 'exit', instrument: inst, positionId: pos.id, dir: pos.dir, exit: { ...ex }, ...tpInfo });
  if (pos.openQty <= 0) {
    pos.openQty = 0;
    Object.assign(pos, tradeResult(pos));
    b.positions[inst] = null; // zamknięta pozycja żyje tylko w zdarzeniu 'closed' i w trade'ach sesji (Book nie trzyma historii)
    events.push({ type: 'closed', position: clone(pos) });
    // pełne zamknięcie anuluje oczekujące dokładki instrumentu (powód 'position-closed', przy odwróceniu 'reverse'); zlecenia wejścia bez pozycji nie są dokładkami
    const why = reason === 'reverse' ? 'reverse' : 'position-closed', keep = [];
    for (const o of b.orders) {
      if (o.instrument === inst && o.intent === 'add') { events.push({ type: 'cancelled', order: o, reason: why }); } else keep.push(o);
    }
    b.orders = keep;
  } else b.positions[inst] = pos;
}

// Decyzja sesji głównej 2.11.2026 (runda 2 pakietu 1.7-3, P2-2): offset nie może sięgać progu. Poziom BE + offset musi leżeć ściśle przed ceną progu (w stronę zysku), inaczej SL stanąłby po złej
// stronie ceny i pozycja zamknęłaby się na następnym otwarciu; ręczna zmiana SL odrzuciłaby taki poziom (bad-sl). ps = pozycja albo jej odpowiednik dla zlecenia (dir, avg, qty, openQty, rUsd, instrument).
function offsetReaches(ps, ab) {
  if (!ab) return false;
  const px = autoBePrice({ ...ps, autoBe: ab }), s = sgn(ps.dir);
  if (px == null) return false;
  const level = beLevel(ps) + s * (ab.offsetTicks || 0) * TICK;
  return s * (level - px) >= -1e-9;
}
const orderAsPos = (o, dir) => ({ instrument: o.instrument, dir, avg: o.price, entryPrice: o.price, qty: o.qty, openQty: o.qty, rUsd: o.sl != null ? o.qty * Math.abs(o.price - o.sl) * (MULT[o.instrument] || 0) : null });

// placeOrder(book, order, last) → { book, events }. Order = { id?, instrument, side: 'buy'|'sell', type: 'market'|'limit'|'stop', price?, qty, sl, tp }.
// Ceny zaokrąglane do ticka 0,25. Zlecenie oczekujące (limit/stop) nie daje zdarzenia, trafia do book.orders.
// [U] 1.11.2026 «Dokładanie + odwracanie» (P3), model §4: przy otwartej pozycji
// - ten sam kierunek: dokładka (market: nowa porcja od razu; limit/stop: zlecenie intent 'add'); SL i TP z zlecenia nie zmieniają SL/TP pozycji (G-2.2);
// - przeciwny kierunek, market: netting (mniejsze → wyjście 'partial', równe → 'manual', większe → 'reverse' i nowa pozycja z resztą, SL/TP z zlecenia; G-2.1 bez potwierdzenia);
// - przeciwny kierunek, limit/stop: odrzucone ('opposite-pending', G-2.4).
// Kod 'position-open' (jedna pozycja bez dokładania, 18a.3) nie istnieje.
export function placeOrder(book, order, last) {
  const b = clone(book);
  const o = { ...order };
  if (!MULT[o.instrument]) return rej(b, 'bad-instrument', { order });
  if (isRewound(b, last, o.instrument)) return rej(b, 'rewound', { order });
  if (!Number.isInteger(o.qty) || o.qty < 1) return rej(b, 'bad-qty', { order });
  if (o.side !== 'buy' && o.side !== 'sell') return rej(b, 'bad-side', { order });
  if (!['market', 'limit', 'stop'].includes(o.type)) return rej(b, 'bad-type', { order });
  const dir = o.side === 'buy' ? 'Long' : 'Short';
  const pos = b.positions[o.instrument];
  const same = !!pos && pos.dir === dir, opp = !!pos && !same;
  let ladder = null;
  if (opp && o.type !== 'market') return rej(b, 'opposite-pending', { order });
  const lp = Number(last?.price);
  if (o.type === 'market' && !Number.isFinite(lp)) return rej(b, 'bad-price', { order });
  o.price = o.type === 'market' ? roundTick(lp, TICK) : num(o.price);
  o.sl = num(o.sl);
  o.tp = num(o.tp);
  if (!Number.isFinite(o.price)) return rej(b, 'bad-price', { order });
  // [B] limit po złej stronie ceny (kupno powyżej, sprzedaż poniżej) i stop, który już by się wyzwolił, są odrzucane: tak nie da się złożyć ich na giełdzie
  if (o.type !== 'market' && Number.isFinite(lp)) {
    const above = o.price > lp, below = o.price < lp;
    const bad = o.type === 'limit' ? (dir === 'Long' ? above : below) : (dir === 'Long' ? below : above);
    if (bad) return rej(b, 'bad-price', { order });
  }
  if (same) {
    // dokładka za SL pozycji wyleciałaby od razu na SL: odrzucona; SL i TP zlecenia służą tylko do wielkości w panelu, silnik ich nie zapisuje
    if (pos.sl != null && !slOk(dir, pos.sl, o.price)) return rej(b, 'add-beyond-sl', { order });
    o.sl = null; o.tp = null; o.autoBe = null;
  } else if (opp && o.qty <= pos.openQty) {
    // zmniejszenie albo zamknięcie: SL, TP i próg auto-BE nie mają do czego się odnosić (próg pozycji zostaje)
    o.sl = null; o.tp = null; o.autoBe = null;
  } else {
    if (Number.isNaN(o.sl) || (o.sl !== null && !slOk(dir, o.sl, o.price))) return rej(b, 'bad-sl', { order });
    // 1.7-5: drabinka (`tps`, do 4 poziomów z procentem) wygrywa z pojedynczym `tp`; lustro `tp` to najdalszy poziom
    if (Array.isArray(order.tps) && order.tps.length) {
      const ck = checkTps(dir, order.tps, { ref: o.price, round: num });
      if (ck.bad) return rej(b, ck.bad, { order });
      ladder = ck.tps;
      o.tp = farthestTp(dir, ladder);
    } else if (Number.isNaN(o.tp) || (o.tp !== null && !tpOk(dir, o.tp, o.price))) return rej(b, 'bad-tp', { order });
    // próg auto-BE nowej pozycji (także nowej strony po odwróceniu): R wymaga SL zlecenia, cena progu po stronie zysku względem ceny zlecenia
    const ck = checkAutoBe(o.autoBe, { dir, ref: o.price, hasRisk: o.sl != null });
    if (ck.bad) return rej(b, 'bad-autobe', { order });
    if (ck.ab && offsetReaches(orderAsPos(o, dir), ck.ab)) return rej(b, 'autobe-offset', { order });
    o.autoBe = ck.ab;
  }
  const t = Number.isFinite(last?.t) ? last.t : null;
  b.seq += 1;
  if (!o.id) o.id = `o${b.seq}`;
  o.placedT = t;
  o.intent = same ? 'add' : 'open';
  o.tps = ladder || tpsOf(o.tp);
  const events = [];
  if (o.type !== 'market') b.orders.push(o);
  else if (!pos) openPosition(b, o, t, o.price, events);
  else if (same) addFill(b, o.instrument, o, t, o.price, events);
  else if (o.qty < pos.openQty) exitPosition(b, o.instrument, o.qty, t, o.price, 'partial', events, t);
  else if (o.qty === pos.openQty) exitPosition(b, o.instrument, o.qty, t, o.price, 'manual', events, t);
  else reverseCore(b, o.instrument, { ...o, qty: o.qty - pos.openQty }, t, events);
  return { book: b, events };
}

// Odwrócenie (zamknięcie całej otwartej ilości powodem 'reverse' + nowa pozycja przeciwna po tej samej cenie w tej samej chwili). spec = zlecenie nowej pozycji
// (side przeciwny do starej, qty, price, sl, tp, tps); oczekujące dokładki starego kierunku anuluje exitPosition ('reverse'). Zdarzenia: exit, closed, [cancelled…], filled.
function reverseCore(b, inst, spec, t, events) {
  const old = b.positions[inst];
  exitPosition(b, inst, old.openQty, t, spec.price, 'reverse', events, t);
  openPosition(b, spec, t, spec.price, events, t, { reverseFrom: old.id });
}

// reversePosition(book, inst, last, { qty?, sl?, tp?, tps? }) → { book, events }: przycisk „Odwróć” / skrót R (G-2.5). Zamyka całą otwartą ilość po last.price i otwiera pozycję przeciwną
// tej samej wielkości (albo qty); SL/TP nowej pozycji z argumentu (UI bierze je z presetu albo z pamięci panelu), bez nich pozycja jest bez SL i TP (R „—”).
// Wynik to dwa trade'y: zamknięty i nowa pozycja z odnośnikiem reverseFrom (id zamkniętej pozycji; bt-replay zamienia go na reverseOf = id trade'a).
export function reversePosition(book, inst, last, opts = {}) {
  const b = clone(book);
  const pos = b.positions[inst];
  if (!pos) return rej(b, 'no-position', { instrument: inst });
  if (isRewound(b, last, inst)) return rej(b, 'rewound', { instrument: inst });
  const lp = Number(last?.price);
  if (!Number.isFinite(lp)) return rej(b, 'bad-price', { instrument: inst });
  const dir = pos.dir === 'Long' ? 'Short' : 'Long';
  const price = roundTick(lp, TICK), qty = opts.qty === undefined ? pos.openQty : opts.qty;
  if (!Number.isInteger(qty) || qty < 1) return rej(b, 'bad-qty', { instrument: inst });
  const sl = num(opts.sl), tp = num(opts.tp);
  if (Number.isNaN(sl) || (sl !== null && !slOk(dir, sl, price))) return rej(b, 'bad-sl', { instrument: inst });
  // 1.7-5: drabinka nowej pozycji (wygrywa z pojedynczym tp), poziomy od ceny odwrócenia
  let ladder = null;
  if (Array.isArray(opts.tps) && opts.tps.length) {
    const lk = checkTps(dir, opts.tps, { ref: price, round: num });
    if (lk.bad) return rej(b, lk.bad, { instrument: inst });
    ladder = lk.tps;
  } else if (Number.isNaN(tp) || (tp !== null && !tpOk(dir, tp, price))) return rej(b, 'bad-tp', { instrument: inst });
  const ck = checkAutoBe(opts.autoBe, { dir, ref: price, hasRisk: sl != null });
  if (ck.bad) return rej(b, 'bad-autobe', { instrument: inst });
  if (ck.ab && offsetReaches(orderAsPos({ instrument: inst, price, qty, sl }, dir), ck.ab)) return rej(b, 'autobe-offset', { instrument: inst });
  const t = Number.isFinite(last?.t) ? last.t : null;
  b.seq += 1;
  const o = { id: `o${b.seq}`, instrument: inst, side: dir === 'Long' ? 'buy' : 'sell', type: 'market', price, qty, sl, tp: ladder ? farthestTp(dir, ladder) : tp, autoBe: ck.ab, placedT: t, intent: 'open' };
  o.tps = ladder || tpsOf(tp);
  const events = [];
  reverseCore(b, inst, o, t, events);
  return { book: b, events };
}

// L (31.10.2026): przesunięcie zlecenia oczekującego (przeciągnięcie linii na wykresie jak w FX Replay). modifyOrder(book, id, { price?, sl?, tp? }, last) → { book, events }.
// Ta sama walidacja co placeOrder: limit nie po złej stronie rynku, stop nie taki, który już by się wyzwolił, SL/TP po właściwej stronie ceny zlecenia; tp: null usuwa TP.
export function modifyOrder(book, id, changes = {}, last) {
  const b = clone(book);
  const o = (b.orders || []).find((x) => x.id === id);
  if (!o) return rej(b, 'no-order', { id });
  if (isRewound(b, last, o.instrument)) return rej(b, 'rewound', { id });
  const dir = o.side === 'buy' ? 'Long' : 'Short';
  const price = 'price' in changes ? num(changes.price) : o.price;
  let sl = 'sl' in changes ? num(changes.sl) : o.sl;
  let tp = 'tp' in changes ? num(changes.tp) : o.tp;
  if (!Number.isFinite(price)) return rej(b, 'bad-price', { id });
  // dokładka (1.7-2): bez własnych SL i TP, a cena nie może wylądować za SL pozycji
  if (o.intent === 'add') {
    const pos = b.positions[o.instrument];
    if (pos?.sl != null && !slOk(dir, pos.sl, price)) return rej(b, 'add-beyond-sl', { id });
    sl = null; tp = null;
  }
  // 1.7-5: drabinka zlecenia: nowa lista (`tps`) przechodzi walidację względem NOWEJ ceny zlecenia; bez zmiany `tps` każdy poziom musi leżeć dalej niż przesunięta cena (przeciągnięcie ceny za TP1 = bad-tp),
  // poziomy stoją w miejscu (decyzja gustu karty 1.7-5). Runda 2 (P3-1): „bez zmiany drabiny” to także zmiana z `tp` równym dotychczasowemu (tp === o.tp), więc sprawdzenie dotyczy obu przypadków.
  let ladder = null;
  if (o.intent !== 'add' && Array.isArray(changes.tps)) {
    const ck = checkTps(dir, changes.tps, { ref: price, round: num });
    if (ck.bad) return rej(b, ck.bad, { id, ...tpsInfo(ck) });
    ladder = ck.tps; tp = farthestTp(dir, ladder);
  } else if (o.intent !== 'add' && tp === o.tp && Array.isArray(o.tps) && o.tps.some((x) => !tpOk(dir, x.price, price))) return rej(b, 'bad-tp', { id });
  const lp = Number(last?.price);
  if (Number.isFinite(lp)) {
    const above = price > lp, below = price < lp;
    const bad = o.type === 'limit' ? (dir === 'Long' ? above : below) : (dir === 'Long' ? below : above);
    if (bad) return rej(b, 'bad-price', { id });
  }
  if (Number.isNaN(sl) || (sl !== null && !slOk(dir, sl, price))) return rej(b, 'bad-sl', { id });
  if (Number.isNaN(tp) || (tp !== null && !tpOk(dir, tp, price))) return rej(b, 'bad-tp', { id });
  // próg auto-BE zlecenia (rodzaj 'price') musi dalej leżeć po stronie zysku względem przesuniętej ceny, inaczej wyzwoliłby się zaraz po wypełnieniu
  if (o.autoBe?.kind === 'price' && checkAutoBe(o.autoBe, { dir, ref: price, hasRisk: true }).bad) return rej(b, 'bad-autobe', { id });
  const tps = ladder || (tp === o.tp && Array.isArray(o.tps) ? o.tps : tpsOf(tp));
  Object.assign(o, { price, sl, tp, tps });
  return { book: b, events: [] };
}

export function cancelOrder(book, id) {
  const b = clone(book);
  b.orders = b.orders.filter((o) => o.id !== id);
  return b;
}

// modifyPosition(book, inst, { sl?, tp?, tps?, autoBe? }, last?) → { book, events }. sl: null usuwa SL, tp: null usuwa wszystkie TP, tps podmienia drabinkę (pakiet 5).
// Z last sprawdzana strona ceny bieżącej (bad-sl / bad-tp). Każda zmiana SL i TP dopisuje wpis do `log` z at = last.t.
// [U] 1.11.2026 «Można usunąć oba» (P6): SL i TP otwartej pozycji można usunąć (wcześniej sl: null było odrzucane jako bad-sl).
// [U] 1.11.2026 «Od pierwszego SL bez znacznika» (P5): pierwszy postawiony SL ustawia sl0, sl0T i slRef porcji; od tej chwili liczy się R. Usunięcie SL niczego z tego nie kasuje,
// a ponowne postawienie nie zmienia R (liczy się pierwszy).
export function modifyPosition(book, inst, changes = {}, last) {
  const b = clone(book);
  const cur = b.positions[inst];
  if (!cur) return rej(b, 'no-position', { instrument: inst });
  if (isRewound(b, last, inst)) return rej(b, 'rewound', { instrument: inst });
  const ref = Number(last?.price);
  const at = Number.isFinite(last?.t) ? last.t : null;
  let sl = cur.sl, tps = cur.tps;
  if (changes.sl !== undefined) {
    if (changes.sl === null) sl = null;
    else {
      sl = num(changes.sl);
      if (Number.isNaN(sl) || !slOk(cur.dir, sl, ref)) return rej(b, 'bad-sl', { instrument: inst });
    }
  }
  // 1.7-5: drabinka (`tps`) przechodzi checkTps: poziomy trafione zostają bez zmian (nie da się ich edytować ani usunąć, liczą się do limitu 4), nietrafione są sortowane od najbliższego, id i procenty
  // dopełnione (ostatni = reszta). `tp` (jeden poziom, null usuwa nietrafione) zostaje dla starszych wywołań i zastępuje całą nietrafioną część drabiny jednym poziomem.
  const hitLevels = cur.tps.filter((x) => x.hit);
  if (changes.tps !== undefined) {
    const ck = checkTps(cur.dir, changes.tps, { hits: hitLevels, ref, round: num });
    if (ck.bad) return rej(b, ck.bad, { instrument: inst, ...tpsInfo(ck) });
    tps = ck.tps;
  } else if (changes.tp !== undefined) {
    const tp = num(changes.tp);
    if (Number.isNaN(tp) || (tp !== null && !tpOk(cur.dir, tp, ref))) return rej(b, 'bad-tp', { instrument: inst });
    if (tp === null) tps = hitLevels.map((x) => ({ ...x }));
    else {
      const ck = checkTps(cur.dir, [{ price: tp }], { hits: hitLevels, ref, round: num });
      if (ck.bad) return rej(b, ck.bad, { instrument: inst });
      tps = ck.tps;
    }
  }
  const pos = { ...cur, fills: cur.fills.map((f) => ({ ...f })), log: [...cur.log] };
  if (sl !== cur.sl) {
    pos.log.push({ at, k: 'sl', v: sl });
    if (sl != null) {
      pos.slLast = sl;
      if (pos.sl0 == null) {
        pos.sl0 = sl; pos.sl0T = at;
        for (const f of pos.fills) if (f.slRef == null) f.slRef = sl;
      }
    }
    pos.sl = sl;
    // Decyzja sesji głównej 2.11.2026 (P2-1, R2-1): beAt nadąża za SL (trackBeAt).
    trackBeAt(cur, pos, ref, at);
  }
  if (JSON.stringify(tps.map((x) => [x.id, x.price, x.pct])) !== JSON.stringify(cur.tps.map((x) => [x.id, x.price, x.pct]))) {
    pos.log.push({ at, k: 'tps', v: tps.filter((x) => !x.hit).map((x) => ({ id: x.id, price: x.price, pct: x.pct })) });
    pos.tps = tps;
  }
  if (changes.autoBe !== undefined) {
    // R wymaga rUsd (policzonego po ewentualnej zmianie SL w tym samym wywołaniu), cena progu musi leżeć po stronie zysku względem średniej
    const d = derive(pos);
    const ck = checkAutoBe(changes.autoBe, { dir: cur.dir, ref: d.avg, hasRisk: d.rUsd > 0 });
    if (ck.bad) return rej(b, 'bad-autobe', { instrument: inst });
    if (ck.ab && offsetReaches(d, ck.ab)) return rej(b, 'autobe-offset', { instrument: inst });
    pos.autoBe = ck.ab;
    pos.log.push({ at, k: 'autoBe', v: ck.ab ? { kind: ck.ab.kind, value: ck.ab.value, offsetTicks: ck.ab.offsetTicks } : null });
  }
  b.positions[inst] = derive(pos);
  const events = [];
  if (sl !== cur.sl) cancelAddsBeyondSl(b, inst, at, events);
  return { book: b, events };
}

// Czy BE jest teraz możliwe i dlaczego nie (przycisk i klawisz E): { ok, why } z why ∈ null | 'none' | 'already' | 'below' | 'above'.
// Decyzja z 31.10.2026 (parafraza; dosłownych słów brak w dokumentach): BE bez SL ustawia SL na wejście tylko, gdy cena jest po stronie zysku; poniżej średniej wejścia (Long) / powyżej (Short) BE jest nieaktywne.
export function beState(book, inst, last) {
  const p = book?.positions?.[inst];
  if (!p) return { ok: false, why: 'none' };
  const level = beLevel(p);
  if (p.sl != null && p.sl === level) return { ok: false, why: 'already' };
  // Decyzja sesji głównej 2.11.2026 (poprawki po przeglądzie): SL już po stronie zysku względem BE nie jest cofany, przycisk BE jest wtedy nieaktywny
  if (p.sl != null && (p.dir === 'Short' ? p.sl < level : p.sl > level)) return { ok: false, why: p.dir === 'Short' ? 'sl-below' : 'sl-above' };
  const ref = Number(last?.price);
  if (Number.isFinite(ref) && !(p.dir === 'Short' ? ref < level : ref > level)) return { ok: false, why: p.dir === 'Short' ? 'above' : 'below' };
  return { ok: true, why: null };
}

// moveToBE(book, inst, last, { offsetTicks = 0 }): SL na poziom BE (§3.4); bez SL dozwolone tylko po stronie zysku (inaczej bad-sl z silnika).
export function moveToBE(book, inst, last, { offsetTicks = 0 } = {}) {
  const p = book.positions[inst];
  if (!p) return rej(clone(book), 'no-position', { instrument: inst });
  const level = Number((beLevel(p) + sgn(p.dir) * (Number(offsetTicks) || 0) * TICK).toFixed(6));
  if (p.sl != null && (p.dir === 'Short' ? p.sl < level : p.sl > level)) return rej(clone(book), 'sl-better', { instrument: inst });
  // beAt = cena bieżąca w chwili przesunięcia SL na BE ustawia modifyPosition (ta sama reguła dla przycisku, przeciągnięcia i szuflady): w dzienniku pole „BE” znaczy cenę w zysku,
  // przy której trade stał się bez ryzyka (słowa użytkownika 2.11.2026 w komentarzu przy advance)
  return modifyPosition(book, inst, { sl: level }, last);
}

// closePartial(book, inst, qty, last): qty < openQty → wyjście 'partial'; qty = openQty → zamknięcie reszty ('manual').
export function closePartial(book, inst, qty, last) {
  const b = clone(book);
  const pos = b.positions[inst];
  if (!pos) return rej(b, 'no-position', { instrument: inst });
  if (isRewound(b, last, inst)) return rej(b, 'rewound', { instrument: inst });
  if (!Number.isInteger(qty) || qty < 1 || qty > pos.openQty) return rej(b, 'bad-qty', { instrument: inst });
  if (!Number.isFinite(last?.price)) return rej(b, 'bad-price', { instrument: inst });
  const events = [];
  exitPosition(b, inst, qty, last.t, roundTick(last.price, TICK), qty === pos.openQty ? 'manual' : 'partial', events, last.t);
  return { book: b, events };
}

// closeAll(book, inst, last, reason = 'manual'): zamyka pozycję instrumentu po last.price i anuluje jego oczekujące zlecenia (np. koniec dnia: 'eod').
export function closeAll(book, inst, last, reason = 'manual') {
  const b = clone(book);
  if (isRewound(b, last, inst)) return rej(b, 'rewound', { instrument: inst });
  const events = [];
  if (b.positions[inst]) {
    if (!Number.isFinite(last?.price)) return rej(b, 'bad-price', { instrument: inst });
    exitPosition(b, inst, b.positions[inst].openQty, last.t, roundTick(last.price, TICK), reason, events, last.t);
  }
  const keep = [];
  for (const o of b.orders) {
    if (o.instrument === inst) { events.push({ type: 'cancelled', order: o, reason }); }
    else keep.push(o);
  }
  b.orders = keep;
  return { book: b, events };
}

// Cena wyzwolenia zlecenia wejścia w świecy [t, o, h, l, c] albo null.
function entryFill(o, bar) {
  const [, op, h, l] = bar, L = o.price;
  if (o.type === 'limit') return (o.side === 'buy' ? l <= L : h >= L) ? L : null;
  if (o.side === 'buy') return h >= L ? (op > L ? op : L) : null;
  return l <= L ? (op < L ? op : L) : null;
}
const slHit = (pos, bar) => pos.sl !== null && (pos.dir === 'Long' ? bar[3] <= pos.sl : bar[2] >= pos.sl);
const lvHit = (pos, lv, bar) => (pos.dir === 'Long' ? bar[2] >= lv.price : bar[3] <= lv.price);
// 1.7-5: drabinka TP w jednej świecy: poziomy od najbliższego, każdy po swojej cenie (także przy luce) i z ilością z reguły (tpQtyAt: udział w otwartej części rozdzielany między
// nietrafione poziomy, ostatni zamyka resztę). Kolejny poziom liczy się od ilości otwartej PO poprzednim; pozycja zamknięta przez poziom (np. 1 kontrakt) kończy pętlę.
function fireTps(b, inst, bar, end, events) {
  for (;;) {
    const pos = b.positions[inst];
    if (!pos) return;
    const open = tpOrder(pos.dir, pos.tps).filter((x) => !x.hit), lv = open[0];
    if (!lv || !lvHit(pos, lv, bar)) return;
    exitPosition(b, inst, tpQtyAt(pos.openQty, open.map((x) => x.pct)), bar[0], lv.price, 'tp', events, end, lv.id);
  }
}
// SL to stop: przy luce po open (gorsza cena). W świecy wejścia luki nie ma (wejście było w środku świecy), więc po cenie SL.
const slPrice = (pos, bar, entryBar) => {
  if (entryBar) return pos.sl;
  return pos.dir === 'Long' ? Math.min(pos.sl, bar[1]) : Math.max(pos.sl, bar[1]);
};

// advance(book, inst, stream, cursor) → { book, events }: przetwarza świece bazowe instrumentu od jego znaku wodnego do kursora.
// Znak wodny trzymany na instrument (hwi; NQ i MNQ mają ten sam strumień, ale osobne wywołania), book.hw = maksimum (blokada handlu po cofnięciu).
export function advance(book, inst, stream, cursor) {
  const b = clone(book);
  if (!b.hwi) b.hwi = {};
  const events = [];
  const start = Number.isFinite(b.hwi[inst]) ? b.hwi[inst] : -Infinity;
  if (!(cursor > start) || !stream || !Array.isArray(stream.bars)) return { book: b, events };
  const i0 = Number.isFinite(start) ? visibleCount(stream, start) : 0;
  const i1 = visibleCount(stream, cursor);
  for (let i = i0; i < i1; i++) {
    const bar = stream.bars[i], end = bar[0] + stream.len[i];
    let pos = b.positions[inst], opened = false, added = false;
    if (pos) {
      if (!(end > pos.entryT)) continue; // świeca sprzed wejścia (market przy kursorze)
    } else {
      // wejścia oczekujące w kolejności złożenia; pierwsze wyzwolone wygrywa i otwiera pozycję
      for (const o of b.orders) {
        if (o.instrument !== inst || (Number.isFinite(o.placedT) && !(end > o.placedT))) continue;
        const px = entryFill(o, bar);
        if (px === null) continue;
        pos = openPosition(b, o, bar[0], px, events, end);
        opened = true;
        break;
      }
      if (!pos) continue;
    }
    // Decyzja sesji głównej (model §4 (1), wynika z P3 «Dokładanie + odwracanie»; nie są to słowa użytkownika): oczekujące dokładki dotknięte w tej świecy wchodzą NAJPIERW (kolejność najgorsza dla tradera: dokładka leży
    // nad SL, więc SL w tej samej świecy zamyka też ją); w świecy otwarcia dochodzą też pozostałe zlecenia tego samego kierunku
    const dirSide = pos.dir === 'Long' ? 'buy' : 'sell';
    for (const o of b.orders.slice()) {
      if (o.instrument !== inst || o.side !== dirSide || (Number.isFinite(o.placedT) && !(end > o.placedT))) continue;
      // siatka bezpieczeństwa (P0, decyzja sesji głównej 2.11.2026): dokładka za SL nie wchodzi przed SL; SL zamyka pozycję, a exitPosition anuluje ją (position-closed)
      if (beyondSl(pos, o.price)) continue;
      const px = entryFill(o, bar);
      if (px === null) continue;
      b.orders = b.orders.filter((x) => x.id !== o.id);
      addFill(b, inst, o, bar[0], px, events, end);
      added = true;
    }
    pos = b.positions[inst];
    // §7: SL wygrywa z każdym TP w tej samej świecy i zamyka całą otwartą ilość razem z dokładką; w świecy wejścia i w świecy dokładki TP nie działa (tylko SL)
    if (slHit(pos, bar)) exitPosition(b, inst, pos.openQty, bar[0], slPrice(pos, bar, opened), 'sl', events, end);
    else if (!opened && !added) fireTps(b, inst, bar, end, events);
    // [U] 2.11.2026 «czy bedzie taka funkcja zrobiona ze da sie ustawic cene w proficie gdzie automatycznie bedzioe przechodzic na be» (karta 1.7-3, dopisek): krok 4 modelu §4:
    // próg auto-BE sprawdzany PO SL i TP tej świecy (zachowawczo: w świecy wyzwolenia działa stary SL), nie w świecy wejścia ani dokładki; nowy SL działa od następnej świecy
    pos = b.positions[inst];
    if (pos && !opened && !added && pos.autoBe && !pos.autoBe.done) {
      const px = autoBePrice(pos);
      if (px != null && (pos.dir === 'Long' ? bar[2] >= px : bar[3] <= px)) fireAutoBe(b, inst, px, end, events);
    }
  }
  b.hwi[inst] = cursor;
  b.hw = Math.max(b.hw || 0, cursor);
  return { book: b, events };
}

// Wyzwolenie auto-BE: SL na poziom BE (średnia do ticka w stronę zysku + offset), ale nigdy gorzej niż dotychczasowy SL (SL równy albo lepszy zostaje, próg tylko ma done = true i bez zdarzenia).
// Bez SL ustawia SL, który staje się pierwszym SL (sl0, P5), więc rUsd = 0 i R „—” (jak ręczne BE bez SL). Zdarzenie 'be-auto' niesie cenę progu, nowy SL i chwilę końca świecy.
function fireAutoBe(b, inst, px, at, events) {
  const cur = b.positions[inst];
  const s = sgn(cur.dir);
  let level = Number((beLevel(cur) + s * (cur.autoBe.offsetTicks || 0) * TICK).toFixed(6));
  // bezpiecznik (P2-2): po dokładce poziom BE + offset mógł dojść do ceny progu; SL zawsze o tick przed ceną progu, a gdy i to wypada przed samym BE, próg tylko jest wykonany
  const cap = Number((px - s * TICK).toFixed(6));
  if (s * (cap - beLevel(cur)) < 0) level = null; else if (s * (level - cap) > 0) level = cap;
  const worse = level != null && (cur.sl == null || (cur.dir === 'Short' ? cur.sl > level : cur.sl < level));
  const pos = { ...cur, fills: cur.fills.map((f) => ({ ...f })), log: [...cur.log], autoBe: { ...cur.autoBe, done: true } };
  // flaga done bez zmiany SL też jest zdarzeniem z at
  // why: 'cap' = obcięcie po dokładce wyłączyło przesunięcie (poziom BE+offset niemożliwy pod ceną progu), 'sl-better' = SL był już lepszy (R2-3)
  const why = level == null ? 'cap' : 'sl-better';
  if (!worse) pos.log.push({ at, k: 'be-auto', v: { price: px, sl: cur.sl, changed: false, why } });
  if (worse) {
    pos.log.push({ at, k: 'sl', v: level });
    pos.log.push({ at, k: 'be-auto', v: { price: px, sl: level } });
    pos.slLast = level;
    if (pos.sl0 == null) {
      pos.sl0 = level; pos.sl0T = at;
      for (const f of pos.fills) if (f.slRef == null) f.slRef = level;
    }
    pos.sl = level;
    pos.beAt = px;
  }
  b.positions[inst] = derive(pos);
  if (!worse) {
    if (why === 'cap') events.push({ type: 'be-auto-skipped', instrument: inst, positionId: pos.id, price: px, why, at });
    return;
  }
  events.push({ type: 'be-auto', instrument: inst, positionId: pos.id, price: px, sl: level, changed: true, at });
  cancelAddsBeyondSl(b, inst, at, events);
}

// Wynik pozycji (także częściowo zamkniętej: liczy tylko wykonane wyjścia), model 1.7 (§3.1, §3.3).
// Wynik brutto wyjścia = (cena − basis)·s·ilość·mnożnik; R = Σ wyniki brutto / rUsd (z cen, bez prowizji), a rUsd to ryzyko pierwszego postawionego SL (P5). Dla jednej porcji wychodzi
// dokładnie wzór 1.6: Σ qᵢ(exitᵢ − entry)·s / (qty·|entry − sl0|). Bez SL (rUsd null) albo przy ryzyku 0 (BE postawiony zamiast SL) R = null, a rWhy mówi dlaczego ('no-sl' | 'zero-risk').
// entryAvg = średnia ważona wszystkich wejść (do trade'a i Notion), exitPrice = średnia ważona wyjść.
export function tradeResult(pos) {
  const s = sgn(pos.dir), m = MULT[pos.instrument] || 0, ex = pos.exits || [], fills = fillsOf(pos);
  const fq = fills.reduce((a, f) => a + f.qty, 0);
  const entryAvg = fq > 0 ? Number((fills.reduce((a, f) => a + f.qty * f.price, 0) / fq).toFixed(6)) : pos.entryPrice;
  if (!ex.length) return { r: null, pnl: null, exitPrice: null, exitT: null, rWhy: null, entryAvg };
  let gross = 0, q = 0, wsum = 0;
  for (const e of ex) {
    const basis = Number.isFinite(e.basis) ? e.basis : pos.entryPrice;
    gross += (e.price - basis) * s * e.qty * m; q += e.qty; wsum += e.qty * e.price;
  }
  const ru = rUsdOf(pos);
  const rWhy = ru == null ? 'no-sl' : ru > 0 ? null : 'zero-risk';
  return {
    r: rWhy ? null : r2(gross / ru),
    pnl: r2(gross),
    exitPrice: Number((wsum / q).toFixed(6)),
    exitT: ex[ex.length - 1].t,
    rWhy, entryAvg,
  };
}

// MAE/MFE w R (§3.6, [U] 1.11.2026 «Tak, nowa definicja (Recommended)»): najgorszy i najlepszy WYNIK POZYCJI w $ (zrealizowany do danej świecy + wynik otwartej części po low/high świecy)
// podzielony przez rUsd; MAE ≤ 0, MFE ≥ 0. Dla jednej porcji bez wyjść częściowych identyczny z definicją 1.6 (ruch ceny w jednostkach |entry − sl0|). Bez rUsd null.
// Świece bazowe od świecy wejścia do świecy wyjścia: włącznie, gdy wyjście przyszło ze świecy (sl/tp), a przy wyjściu ręcznym/eod po last (t = kursor) tylko świece zaczęte przed nim.
// W świecy wyjścia po SL strata nie sięga dalej niż cena wyjścia, po TP zysk nie dalej niż TP. eff (opcjonalnie) odcina świece zakończone po chwili eff (pozycja otwarta).
export function excursions(pos, stream, { eff = Infinity, state = null } = {}) {
  const s = sgn(pos.dir), m = MULT[pos.instrument] || 0, ru = rUsdOf(pos);
  if (!(ru > 0)) return { maeR: null, mfeR: null };
  const fills = fillsOf(pos), ex = (pos.exits || []).slice().sort((a, b) => a.t - b.t);
  // granica „do wyjścia” dotyczy tylko pozycji ZAMKNIĘTEJ; przy otwartej (wyjścia częściowe) liczy się do eff
  const closed = fills.reduce((a, f) => a + f.qty, 0) - ex.reduce((a, e) => a + e.qty, 0) <= 0;
  const lastEx = closed ? ex[ex.length - 1] : null;
  const exitT = lastEx ? lastEx.t : Infinity;
  const fromBar = !!lastEx && (lastEx.reason === 'sl' || lastEx.reason === 'tp');
  const basisOf = (e, avg) => (Number.isFinite(e.basis) ? e.basis : avg);
  // oś zdarzeń: wejście działa od swojego t, wyjście od chwili at (zdarzenie znane), więc świeca, w której SL zamyka pozycję, liczy się jeszcze z otwartą ilością
  const tl = [...fills.map((f) => ({ k: 0, at: f.t, s: f.seq ?? 0, f })), ...ex.map((e) => ({ k: 1, at: e.at ?? e.t, s: e.seq ?? 0, e }))].sort((a, b) => a.at - b.at || a.s - b.s || a.k - b.k);
  const bars = stream?.bars || [];
  // stan przyrostowy (szuflada liczy co klatkę): wznawia od ostatnio przetworzonej świecy, jeśli strumień i kursor są te same albo dalej
  const resume = !!state && !closed && state.stream === stream && state.n === bars.length && state.first === bars[0]?.[0] && eff >= (state.eff ?? -Infinity);
  let i0 = 0, lastT = -Infinity, lo = 0, hi = 0;
  if (resume) { i0 = state.i; lastT = state.lastT; lo = state.lo; hi = state.hi; }
  const see = (v) => { if (v < lo) lo = v; if (v > hi) hi = v; };
  // wartość pozycji tuż po każdym wyjściu (cena wyjścia): kwoty zrealizowane też mogą być skrajne
  {
    let q0 = 0, rr = 0, av = 0;
    for (const x of tl) {
      if (x.k === 0) { av = q0 > 0 ? (q0 * av + x.f.qty * x.f.price) / (q0 + x.f.qty) : x.f.price; q0 += x.f.qty; } else {
        rr += (x.e.price - basisOf(x.e, av)) * s * x.e.qty * m; q0 -= x.e.qty;
        see(rr + q0 * (x.e.price - av) * s * m);
      }
    }
  }
  let ti = 0, q = 0, avg = 0, real = 0;
  const apply = (T) => {
    while (ti < tl.length && tl[ti].at <= T) {
      const x = tl[ti++];
      if (x.k === 0) { avg = q > 0 ? (q * avg + x.f.qty * x.f.price) / (q + x.f.qty) : x.f.price; q += x.f.qty; } else { real += (x.e.price - basisOf(x.e, avg)) * s * x.e.qty * m; q -= x.e.qty; }
    }
  };
  if (Number.isFinite(lastT)) apply(lastT);
  const entryT = fills.length ? fills[0].t : pos.entryT;
  let i = i0;
  for (; i < bars.length; i++) {
    const bar = bars[i], t = bar[0], end = t + stream.len[i];
    if (!(end > entryT)) continue;
    // wyjście ręczne/eod: tylko świece zakończone do chwili wyjścia (świeca w budowie to przyszłość: kursor bywa ułamkowy); wyjście ze świecy: włącznie z nią
    if (fromBar ? t > exitT : end > exitT) break;
    if (end > eff) break;
    apply(t);
    lastT = t;
    if (q <= 0) continue;
    let h = bar[2], l = bar[3];
    if (fromBar && t === exitT) {
      const adverse = lastEx.reason === 'sl', px = lastEx.price;
      if (s > 0) { if (adverse) l = Math.max(l, px); else h = Math.min(h, px); }
      else if (adverse) h = Math.min(h, px); else l = Math.max(l, px);
    }
    // runda 2 (P1-1): poziomy TP trafione w TEJ świecy (wyjście z t = początek świecy, at = jej koniec) zamknęły część pozycji po swoich cenach, więc strona korzystna liczy realizację po cenach poziomów
    // plus pozostałą ilość do ekstremum świecy; strona niekorzystna zachowawczo z ilością sprzed trafień (kolejność low/TP w świecy jest nieznana). Pozycja zamknięta ostatnim poziomem nie ma „reszty”.
    const tpHere = ex.filter((e) => e.reason === 'tp' && e.t === t && (e.at ?? e.t) > t);
    if (tpHere.length) {
      let got = 0, qa = q;
      for (const e of tpHere) { got += (e.price - basisOf(e, avg)) * s * e.qty * m; qa -= e.qty; }
      see(real + got + Math.max(0, qa) * ((s > 0 ? h : l) - avg) * s * m);
      see(real + q * ((s > 0 ? l : h) - avg) * s * m);
    } else { see(real + q * (h - avg) * s * m); see(real + q * (l - avg) * s * m); }
  }
  if (state && !closed) Object.assign(state, { stream, n: bars.length, first: bars[0]?.[0], i, lastT, lo, hi, eff });
  return { maeR: r2(lo / ru), mfeR: r2(hi / ru) };
}

// K (31.10.2026): Stan konta przy kursorze (punkt podpięcia pakietu L): saldo startowe, wynik zamkniętych trade'ów, otwarte pozycje z wynikiem po cenie bieżącej (zamknięcie ostatniej
// widocznej świecy bazowej, bez przyszłości) i equity. Czysta funkcja: book, trades, balance, last(k) = { t, price }.
export function accountState({ book, trades = [], balance = 0, last }) {
  const realized = trades.reduce((a, x) => a + (Number.isFinite(x?.pnl) ? x.pnl : 0), 0);
  const open = [];
  let upl = 0, partial = 0;
  for (const [k, p] of Object.entries(book?.positions || {})) {
    if (!p) continue;
    const s = p.dir === 'Short' ? -1 : 1, m = MULT[p.instrument] || MULT[k] || 0, px = last(k).price;
    const part = tradeResult(p).pnl || 0;
    const u = Number.isFinite(px) ? (px - p.entryPrice) * s * p.openQty * m : 0;
    const risk = rUsdOf(p) || 0;
    open.push({ instrument: k, dir: p.dir, qty: p.openQty, entryPrice: p.entryPrice, last: px, upl: Math.round(u * 100) / 100, uplR: risk > 0 ? Math.round((u / risk) * 100) / 100 : null });
    upl += u; partial += part;
  }
  const r2 = (x) => Math.round(x * 100) / 100;
  return { balance, realized: r2(realized + partial), upl: r2(upl), equity: r2(balance + realized + partial + upl), open };
}
