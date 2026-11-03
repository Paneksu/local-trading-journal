// Panel zleceń replayu Backtest (1.5.0, pakiet C2): Buy/Sell (market, limit, stop), SL i TP w punktach od wejścia, wielkość z ryzyka sesji albo ręczna,
// BE, zamknięcie części i całości, oczekujące zlecenia z anulowaniem. Panel nie liczy wypełnień: woła silnik z bt-wypelnienia.js z `last` = { t: kursor,
// price: zamknięcie ostatniej widocznej świecy bazowej } i oddaje nowy Book przez setBook (wywołujący zapisuje sesję od razu). Pozycja i linie zleceń na wykresie
// idą przez chart.setTrading. 1.7-1: SL i TP otwartej pozycji zmieniają się liniami na wykresie i w szufladzie, a zmiana wraca tu przez setLevel → modifyPosition (cena do 0,25;
// null usuwa poziom, pierwszy SL ustawia sl0 i od niego liczy się R).
// Po cofnięciu kursora przed znak wodny (kursor < book.hw) handel jest zablokowany do „Wróć do bieżącej chwili” (§7, 18a.3).
// D1: kilka wykresów. Panel działa na instrumencie aktywnego wykresu, ale pozycje i zlecenia innych instrumentów też rysują się na swoich wykresach: gdy chart ma setTradingFor(k, stan),
// refresh woła go dla każdego instrumentu z instruments(); edycja SL/TP idzie przez setLevel(k, pole, cena), a cena bieżąca dla modyfikacji to getLast(k).
// L (31.10.2026): SL/TP w punktach, tickach albo cenie, podgląd ryzyka i celu ($, % salda, R:R) przed złożeniem, akcje dla szuflady i wykresu (zamknięcie procentem,
// BE, anulowanie, przesunięcie zlecenia oczekującego).
// English: order ticket for the replay: market/limit/stop with SL/TP in points, ticks or price, risk preview, size from session risk or manual, BE, partial/full close, pending orders; locked when rewound.
import { t, locale } from './i18n.js';
import { esc, fmtUsdFull as fmtMoney, fmtR } from './format.js';
import { pxText } from './bt-journal.js';
import { sizeFromRisk, placeOrder, cancelOrder, modifyPosition, modifyOrder, moveToBE, beState, closePartial, closeAll, reversePosition, riskNow, autoBePrice, tpPlan, TPS_MAX, TICK, MULT } from './bt-wypelnienia.js';
import { ladderApply, equalPcts, ladderPcts, farthestTp, tpOrder } from './bt-drabinka.js';
import { presetErrors, newPresetId, presetOrder, presetSummary, PRESETS_MAX, PRESET_NAME_MAX } from './bt-presety.js';
import { pctQty, netResult } from './bt-konto.js';
import { orderFromDrawing } from './pozycja-staty.js';
import { hintOf, priceText } from './bt-czas.js';

const q = (x) => Math.round(x / TICK) * TICK;
const fx = pxText; // H2: ceny pozycji i zleceń jak na osi (spacja tysięcy, przecinek w PL)

// Powód nieaktywnego BE (beState z silnika) → tekst podpowiedzi i komunikatu (Decyzja z 31.10.2026 (parafraza; dosłownych słów brak w dokumentach): BE bez SL tylko po stronie zysku; decyzja sesji głównej 2.11.2026: SL po stronie zysku względem BE nie jest cofany)
export function beWhyText(why) {
  switch (why) {
    case 'below': return t('Cena poniżej średniej wejścia');
    case 'above': return t('Cena powyżej średniej wejścia');
    case 'already': return t('SL już na BE');
    case 'sl-above': return t('SL już powyżej wejścia');
    case 'sl-below': return t('SL już poniżej wejścia');
    default: return '';
  }
}

// Kody odrzuceń silnika → komunikaty (silnik zwraca kody, UI tłumaczy).
export function rejectText(reason, ev) {
  switch (reason) {
    case 'rewound': return t('Przeglądasz wstecz: handel jest zablokowany.');
    // 1.7-2 (P3 «Dokładanie + odwracanie»): kod 'position-open' zniknął, zastąpiły go dokładka, netting i te dwa kody
    case 'opposite-pending': return t('Przy otwartej pozycji zamknięcie zaplanuj przez TP albo zamknij część.');
    case 'add-beyond-sl': return t('Dokładka leży poza SL pozycji.');
    case 'bad-qty': return t('Wielkość musi być liczbą całkowitą od 1.');
    case 'bad-price': return t('Cena zlecenia jest po złej stronie rynku albo niepoprawna.');
    case 'bad-sl': return t('SL jest po złej stronie ceny.');
    case 'bad-tp': return ev?.level ? t('TP{n} ({px}) leży za ceną {ref}: TP musi leżeć po stronie zysku. Jeśli cena minęła go w świecy wejścia lub dokładki (TP w niej nie działa), przesuń go albo usuń.', { n: ev.level, px: pxText(ev.price), ref: pxText(ev.ref) }) : t('TP jest po złej stronie ceny.');
    // 1.7-5 (kilka TP z procentem wielkości)
    case 'tps-max': return t('Najwyżej {n} TP.', { n: TPS_MAX });
    case 'tps-pct': return t('Procenty TP: każdy poziom oprócz ostatniego to liczba całkowita od 1, a ich suma musi być mniejsza niż 100.');
    case 'tps-dup': return t('Dwa poziomy TP leżą na tej samej cenie.');
    case 'no-position': return t('Brak otwartej pozycji.');
    case 'sl-better': return t('SL jest już lepszy niż BE.');
    case 'bad-autobe': return t('Auto BE: cena progu musi leżeć po stronie zysku, a próg w R wymaga SL.');
    case 'autobe-offset': return t('Offset nie może sięgać progu: SL stanąłby po złej stronie ceny.');
    case 'no-order': return t('Tego zlecenia już nie ma.');
    default: return t('Zlecenie odrzucone.');
  }
}

// 1.7-2 (P3 «Dokładanie + odwracanie»): tryb przycisku Kup/Sprzedaj względem otwartej pozycji: ten sam kierunek dokłada, przeciwny zmniejsza, zamyka albo odwraca (netting).
// sideMode(pos, side, qty) → { kind: 'open'|'add'|'reduce'|'close'|'reverse', n, of?, rest?, dir? }; modeText daje podpis pod ceną na przycisku (jedno kliknięcie, bez potwierdzenia, G-2.1).
export function sideMode(pos, side, qty) {
  if (!pos) return { kind: 'open' };
  const dir = side === 'buy' ? 'Long' : 'Short';
  if (pos.dir === dir) return { kind: 'add', n: qty };
  if (qty < pos.openQty) return { kind: 'reduce', n: qty, of: pos.openQty };
  if (qty === pos.openQty) return { kind: 'close', n: qty };
  return { kind: 'reverse', n: pos.openQty, rest: qty - pos.openQty, dir };
}
export function modeText(m) {
  switch (m.kind) {
    case 'add': return t('Dołóż {n}', { n: m.n });
    case 'reduce': return t('Zmniejsz {n} z {of}', { n: m.n, of: m.of });
    case 'close': return t('Zamknij {n}', { n: m.n });
    case 'reverse': return t('Odwróć: zamknie {n}, {dir} {rest}', { n: m.n, dir: m.dir === 'Long' ? t('Long') : t('Short'), rest: m.rest });
    default: return '';
  }
}

// M (31.10.2026): pamięć pól SL/TP na instrument (preferencja przeglądarki): po ponownym otwarciu replayu Kup/Sprzedaj działają od razu, bez wpisywania SL.
// Jednostka „cena” nie jest zapamiętywana (rynek jest przy następnym otwarciu gdzie indziej); zapis tylko liczb dodatnich.
export const ORD_MEM_KEY = 'thq.bt.ord.v1';
const MEM_UNITS = ['pt', 'tick'];
const memNum = (v) => v === '' || (/^\d+(\.\d+)?$/.test(String(v)) && Number(v) > 0);
function readMem(storage) { try { const o = JSON.parse(storage?.getItem(ORD_MEM_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return null; } }
// 1.7-3: do pamięci panelu dochodzi pole auto-BE (abe: { on, kind, value, off }); stary zapis bez niego znaczy „wyłączony”
const ABE_MEM_KINDS = ['r', 'pts', 'ticks', 'usd', 'price'];
const memAbe = (a) => (a && typeof a === 'object' && typeof a.on === 'boolean' && ABE_MEM_KINDS.includes(a.kind) && memNum(a.value) && (a.off === '' || /^\d{1,2}$/.test(String(a.off))) ? { on: a.on, kind: a.kind, value: String(a.value), off: String(a.off) } : null);
// 1.7-5: pamięć panelu niesie listę TP (`tps`: [{ v: cena w jednostce panelu, pct }], do 4 wierszy; wartości dodatnie, procenty nie-ostatnich całkowite 1..98 o sumie ≤ 99, ostatni = reszta).
// Pole `tp` zostaje pierwszym poziomem (zgodność ze starszym odczytem); zapis sprzed 1.7-5 z jednym `tp` to jeden wiersz 100%, puste `tp` to brak poziomów. Zła lista odpada (zostaje `tp`).
const memPosV = (v) => typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) && Number(v) > 0;
function memTps(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > TPS_MAX) return null;
  if (!list.every((x) => x && typeof x === 'object' && memPosV(String(x.v)))) return null;
  const items = list.map((x) => ({ pct: String(x.pct ?? '') === '' ? undefined : (/^\d{1,3}$/.test(String(x.pct)) ? Number(x.pct) : NaN) }));
  const pcts = ladderPcts(items);
  return pcts ? list.map((x, i) => ({ v: String(x.v), pct: String(pcts[i]) })) : null;
}
export function rememberOrderFields(storage, inst, { unit, sl, tp, tps, abe }) {
  if (!MEM_UNITS.includes(unit) || !memNum(sl) || !memNum(tp)) return;
  const all = readMem(storage) || {};
  const ab = memAbe(abe);
  const list = memTps(tps);
  all[inst] = { unit, sl: String(sl), tp: list ? list[0].v : String(tp), ...(list && list.length > 1 ? { tps: list } : {}), ...(ab ? { abe: ab } : {}) };
  try { storage?.setItem(ORD_MEM_KEY, JSON.stringify(all)); } catch { /* localStorage niedostępny */ }
}
export function recallOrderFields(storage, inst) {
  const m = readMem(storage)?.[inst];
  if (!m || !MEM_UNITS.includes(m.unit) || !memNum(m.sl) || !memNum(m.tp) || m.sl === '') return null;
  const ab = memAbe(m.abe);
  const tps = memTps(m.tps) || (String(m.tp) !== '' ? [{ v: String(m.tp), pct: '100' }] : []);
  return { unit: m.unit, sl: String(m.sl), tp: String(m.tp), tps, ...(ab ? { abe: ab } : {}) };
}

// 1.7-3: jednostki progu auto-BE w bilecie i w edycji na pozycji: [rodzaj silnika, tekst przycisku, podpowiedź]
const abeUnits = () => [['r', 'R', t('Wielokrotność ryzyka (wymaga SL)')], ['pts', t('pkt'), t('Punkty od wejścia w stronę zysku')], ['ticks', t('ticki'), t('Ticki od wejścia w stronę zysku')], ['usd', '$', t('Zysk w dolarach')], ['price', t('cena'), t('Cena progu')]];
// Krótki opis progu: +1R, +3 pkt, +8t, +120 $, albo sama cena
export function abeShort(a, fmt = (x) => String(x)) {
  if (!a) return '';
  const n = (x) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(x);
  switch (a.kind) {
    case 'r': return `+${n(a.value)}R`;
    case 'pts': return `+${n(a.value)} ${t('pkt')}`;
    case 'ticks': return `+${n(a.value)}t`;
    case 'usd': return `+${n(a.value)} $`;
    default: return fmt(a.value);
  }
}

// Opis auto-BE otwartej pozycji dla panelu i szuflady: { armed, text } z text = „przy +1R (18 330,00) · BE+0t” | „wyzwolone przy 18 330,00” | „wyzwolone” (po dokładce beAt jest kasowane) | ''
export function abeInfo(pos) {
  const ab = pos?.autoBe;
  if (ab && !ab.done) {
    const px = autoBePrice(pos);
    const head = ab.kind === 'price' ? `${t('przy')} ${pxText(ab.value)}` : `${t('przy')} ${abeShort(ab, pxText)} (${px != null ? pxText(px) : '–'})`;
    return { armed: true, text: `${head} · BE${ab.offsetTicks ? ` +${ab.offsetTicks} ${t('ticki')}` : ''}` };
  }
  if (ab?.done) return { armed: false, text: pos.beAt != null ? t('wyzwolone przy {px}', { px: pxText(pos.beAt) }) : t('wyzwolone') };
  return { armed: false, text: '' };
}

// mountOrders(host, { getBook, setBook, getLast, getCursor, instrument, risk, chart, onEvent, onReturn }) → { refresh, submit, closeAll, destroy }
// instrument i risk mogą być wartością albo funkcją; risk = { mode: 'usd'|'pct', value, balance }. chart: createReplayChart (opcjonalnie, bez niego brak rysunku).
// lock() zwraca tekst powodu blokady handlu (sesja zmieniona w innej karcie; K: bez „dzień zakończony”) albo ''. onCommit() woła się raz po każdej akcji (po setBook i zdarzeniach): jeden zapis sesji.
// J (30.10.2026): getDrawing() → zaznaczony rysunek pozycji aktywnego wykresu albo null, useDrawing(d) → usunięcie rysunku po złożeniu zlecenia; fromDrawing() składa zlecenie
// według rysunku (pozycja-staty.js orderFromDrawing), syncDrawing() odświeża tylko ten przycisk (zmiana zaznaczenia). Słowa użytkownika: «w backtescie powinna byc funkcja ze jak mamy
// zaznaczony dana pozycje rysunek to mozna na podstawie tego wejsc w ta sama pozycje co rysunek, jest takie rozwiazanie w fx replay».
// ---- 1.7-4: menu prawego kliku na wykresie (czyste funkcje; okno menu rysuje bt-wykres.js, akcje wykonuje bt-replay.js przez mountOrders) ----
// [U] 1.11.2026 «4 Prawy klik i nawigacja (limit/stop po cenie kliknięcia, krok niezależny od interwału, skok do ceny i do daty)».
// Wzór FX Replay (research §1.1 [F8]): nad rynkiem Sprzedaj limit / Kup stop, pod rynkiem Kup limit / Sprzedaj stop, w spreadzie market. SL, TP i auto-BE: z aktywnego presetu, inaczej z pamięci panelu
// (research: NIEZNANE, decyzja gustu G-4.1/G-4.2). Wszystkie funkcje są czyste: bez DOM, bez zapisu do księgi (próby silnika idą na kopii).
const NF2 = () => new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 });
const sideWord = (s) => (s === 'buy' ? t('Kup') : t('Sprzedaj'));
const ptsOfUnit = (u) => (u.unit === 'ticks' ? u.value * TICK : u.value);
const intQty = (x) => (Number.isInteger(x) && x >= 1 ? x : null);

// orderAt(ctx) → { order, source: 'preset'|'panel', slPts } albo { err, source, oneRisk? } (err ∈ bad-side, bad-type, no-entry, no-sl, small, rr-no-sl…).
// ctx = { price (cena kliknięcia), last: { t, price }, instrument, side, type: 'market'|'limit'|'stop', preset (aktywny, niezmieniony) | null, mem (recallOrderFields) | null,
// manualQty (ilość wpisana w panelu) | null, riskUsd (ryzyko sesji w $), balance, beOffset }. Wejście zlecenia = cena kliknięcia (market: cena bieżąca), więc SL i TP liczą się od niej.
export function orderAt(c) {
  const { instrument, side, type } = c;
  if (side !== 'buy' && side !== 'sell') return { err: 'bad-side' };
  if (!['market', 'limit', 'stop'].includes(type)) return { err: 'bad-type' };
  const entry = type === 'market' ? Number(c.last?.price) : q(Number(c.price));
  if (!Number.isFinite(entry)) return { err: 'no-entry' };
  const fin = (order, extra) => { const o = { ...order, type }; if (type === 'market') delete o.price; else o.price = entry; return { order: o, ...extra }; };
  if (c.preset) {
    const r = presetOrder(c.preset, { side, entry, instrument, riskUsd: c.riskUsd, balance: c.balance });
    if (r.err) return { err: r.err === 'size-no-sl' || r.err === 'rr-no-sl' ? 'no-sl' : r.err, source: 'preset', ...(r.err === 'small' ? { oneRisk: r.slPts * (MULT[instrument] || 0) } : {}) };
    return fin(r.order, { source: 'preset', slPts: r.slPts });
  }
  // pamięć panelu: SL i TP w punktach albo tickach, auto-BE bez rodzaju „cena” (cena bezwzględna nie ma sensu dla zlecenia po innej cenie; R wymaga SL)
  const m = c.mem, dir = side === 'buy' ? 1 : -1;
  const toPts = (v) => (m?.unit === 'tick' ? Number(v) * TICK : Number(v));
  const slPts = m && m.sl !== '' && toPts(m.sl) > 0 ? q(toPts(m.sl)) : null;
  // 1.7-5: lista TP z pamięci panelu (stary zapis z jednym tp = jeden poziom)
  const memLv = (m?.tps?.length ? m.tps : m && m.tp !== '' ? [{ v: m.tp, pct: '100' }] : []).map((x) => ({ pts: q(toPts(x.v)), pct: Number(x.pct) })).filter((x) => x.pts > 0);
  const manual = intQty(c.manualQty);
  if (manual == null && slPts == null) return { err: 'no-sl', source: 'panel' };
  const qty = manual ?? sizeFromRisk({ riskUsd: c.riskUsd, entry: slPts, sl: 0, instrument });
  if (!(qty >= 1)) return { err: 'small', source: 'panel', oneRisk: slPts * (MULT[instrument] || 0) };
  const sl = slPts ? q(entry - dir * slPts) : null;
  const tpl = memLv.map((x, i) => ({ price: q(entry + dir * x.pts), ...(i < memLv.length - 1 ? { pct: x.pct } : {}) }));
  const ma = m?.abe;
  const defOffset = Number.isInteger(c.beOffset) && c.beOffset >= 0 && c.beOffset <= 20 ? c.beOffset : 0;
  const autoBe = ma && ma.on && ma.kind !== 'price' && Number(ma.value) > 0 && (ma.kind !== 'r' || sl != null) ? { kind: ma.kind, value: Number(ma.value), offsetTicks: ma.off === '' ? defOffset : Number(ma.off) } : null;
  return fin({ instrument, side, qty, sl, ...(tpl.length > 1 ? { tps: tpl, tp: tpl[tpl.length - 1].price } : { tp: tpl.length ? tpl[0].price : null }), autoBe }, { source: 'panel', slPts });
}

// levelHere({ pos, price, last }) → { field: 'sl'|'tp', price, pts, usd, r } albo null. „SL tutaj” leży po stronie straty ceny bieżącej (Long: pod nią, Short: nad nią), „TP tutaj” po stronie zysku;
// w spreadzie (±1 tick) i bez pozycji nic. Liczby jak na plakietkach pozycji (bt-wykres.js lvInfo): punkty ze znakiem zysku, $ brutto dla otwartej ilości, R od jednostki pozycji
// (przy pierwszym SL od tego poziomu, P5).
export function levelHere({ pos, price, last }) {
  const L = Number(last?.price), P = q(Number(price));
  if (!pos || !Number.isFinite(L) || !Number.isFinite(P) || Math.abs(P - L) <= TICK) return null;
  const s = pos.dir === 'Short' ? -1 : 1, m = MULT[pos.instrument] || 0;
  const field = (P - L) * s < 0 ? 'sl' : 'tp';
  const pts = (P - pos.avg) * s, usd = pts * m * pos.openQty;
  const ru = pos.rUsd > 0 ? pos.rUsd : (field === 'sl' && pos.sl0 == null ? Math.abs(pos.avg - P) * m * pos.qty : null);
  return { field, price: P, pts, usd, r: ru > 0 ? usd / ru : null };
}

// runda 2 (P3-4 kodu, P2-4 wyglądu): jedna reguła ilości dokładki (i wejścia z ryzyka) dla menu prawego kliku i pola „Wielkość” w panelu.
// Ryzyko z presetu w $ albo % salda (inaczej ryzyko sesji), odległość do SL pozycji od ceny wejścia (bez SL pozycji: SL panelu), stała ilość wygrywa.
export function riskOfPreset({ preset, riskUsd, balance }) {
  if (preset?.size?.mode === 'usd') return preset.size.value;
  if (preset?.size?.mode === 'pct') return (Number(balance) * preset.size.value) / 100;
  return riskUsd;
}
export function addQty({ pos, entry, riskUsd, panelSl = null, fixedQty = null, instrument }) {
  const dist = pos?.sl != null ? q(Math.abs(entry - pos.sl)) : (panelSl || null);
  const qty = fixedQty ?? (dist ? sizeFromRisk({ riskUsd, entry: dist, sl: 0, instrument }) : 0);
  return { qty, dist };
}
// runda 2 (P1-1 kodu): pozycja wybrana z menu wykonuje się tylko wtedy, gdy po przeliczeniu menu ze stanu bieżącego jest nadal aktywna i niesie dokładnie to samo zlecenie (typ, strona, ilość, cena, SL, TP, auto BE).
// Inaczej etykieta obiecywała co innego, niż zrobiłby silnik (np. „Dołóż” po zamknięciu pozycji otworzyłoby nową bez SL). Skoki nie zależą od księgi. → '' (wolno) albo powód odrzucenia.
export function menuStillValid(picked, fresh) {
  const a = picked?.act;
  if (!a || a.type === 'jumpPrice' || a.type === 'jumpDate') return '';
  const now = (fresh || []).find((x) => x.id === picked.id);
  if (!now || now.disabled || !now.act || JSON.stringify(now.act) !== JSON.stringify(a)) return t('Rynek się zmienił: otwórz menu ponownie.');
  return '';
}

// menuItems(ctx) → [{ id, label, detail, disabled, why, act }]. ctx jak w orderAt plus { book, rewound, lock (tekst blokady sesji albo ''), inMargin (klik za ostatnią świecą), time }.
// Kody pozycji: order-<buy|sell>-<limit|stop|market> (+ „-one”: „Użyj 1 kontraktu”), add-<limit|stop|market>, sl-here, tp-here, jump-price, jump-date.
// act: { type: 'order', order } | { type: 'level', field, price } | { type: 'jumpPrice', price } | { type: 'jumpDate', time }. Pozycje handlowe są sprawdzane silnikiem na kopii księgi
// (placeOrder, modifyPosition): odrzucenie daje pozycję nieaktywną z powodem w `why` (title) i w drugiej linii (`detail`).
export function menuItems(c) {
  const k = c.instrument, L = Number(c.last?.price), P = q(Number(c.price));
  const book = c.book, pos = book?.positions?.[k] || null, m = MULT[k] || 0;
  const blocked = c.lock || (c.rewound ? rejectText('rewound') : '');
  const items = [];
  // runda 3: przy przeglądaniu przeszłości (kursor przed znakiem wodnym) menu nie ma pozycji handlowych: tylko skok do ceny i „Wróć do teraz”
  const back = !!c.rewound && !c.lock;
  const srcText = () => (c.preset ? t('preset {name}', { name: c.preset.name }) : t('z panelu'));
  const dry = (order) => { const r = placeOrder(book, order, c.last); const rej = r.events.find((e) => e.type === 'rejected'); return rej ? rejectText(rej.reason, rej) : ''; };
  // zablokowana pozycja (cofnięty kursor, blokada sesji) niesie etykietę bez kwot i ilości: liczby z ceny z przeszłości byłyby absurdalne (przegląd wyglądu P3-6)
  const push = (it) => items.push(blocked && it.act?.type !== 'jumpPrice' && it.act?.type !== 'jumpDate' ? { ...it, label: it.plain || it.label, disabled: true, why: blocked, detail: blocked } : it);
  const money = (x) => fmtMoney(x);
  const errWhy = (e) => (e === 'small' ? t('Ryzyko za małe na ten SL: wpisz liczbę kontraktów ręcznie.') : e === 'no-sl' ? t('Wpisz SL albo wielkość.') : rejectText(e));
  // zlecenie nowej pozycji (side, type) albo dołożenie do otwartej (add)
  function tradeItem(side, type, add) {
    const id = add ? `add-${type}` : `order-${side}-${type}`;
    const verb = add ? t('Dołóż') : sideWord(side);
    const at = type === 'market' ? ` (${pxText(L)})` : ` @ ${pxText(P)}`;
    let order = null, err = null, oneRisk = null, slPts = null, risk = null, fromRisk = false;
    if (add) {
      // dokładka: SL i TP pozycji bez zmian (G-2.2); ilość z ryzyka sesji do SL pozycji (bez SL pozycji do SL presetu albo panelu), stała ilość presetu i ilość z panelu wygrywają
      const entry = type === 'market' ? L : P;
      const fixed = c.preset?.size?.mode === 'qty' ? c.preset.size.value : c.preset ? null : intQty(c.manualQty);
      risk = riskOfPreset({ preset: c.preset, riskUsd: c.riskUsd, balance: c.balance });
      const panelSl = c.preset ? (c.preset.sl ? ptsOfUnit(c.preset.sl) : null) : (c.mem && c.mem.sl !== '' && Number(c.mem.sl) > 0 ? q(c.mem.unit === 'tick' ? Number(c.mem.sl) * TICK : Number(c.mem.sl)) : null);
      const { qty, dist } = addQty({ pos, entry, riskUsd: risk, panelSl, fixedQty: fixed, instrument: k });
      fromRisk = fixed == null;
      if (!(qty >= 1)) { err = fixed == null && !dist ? 'no-sl' : 'small'; oneRisk = dist ? dist * m : null; }
      else order = { instrument: k, side, type, ...(type === 'market' ? {} : { price: P }), qty, sl: null, tp: null, autoBe: null };
      slPts = dist;
    } else {
      const r = orderAt({ price: P, last: c.last, instrument: k, side, type, preset: c.preset, mem: c.mem, manualQty: c.manualQty, riskUsd: c.riskUsd, balance: c.balance, beOffset: c.beOffset });
      if (r.err) { err = r.err; oneRisk = r.oneRisk ?? null; } else { order = r.order; slPts = r.slPts; }
    }
    if (order) {
      const why = dry(order);
      let txt = `${verb} ${type} ${order.qty}${at}`;
      if (add && pos?.sl != null && Number.isFinite(order.qty)) {
        const e = type === 'market' ? L : P, avg = (pos.openQty * pos.avg + order.qty * e) / (pos.openQty + order.qty);
        txt += ` · ${t('ryzyko łącznie')} ${money(-Math.abs(avg - pos.sl) * (pos.openQty + order.qty) * m)}`;
      } else if (!add && order.sl != null && slPts) txt += ` · SL ${NF2().format(slPts)} ${t('pkt')} · ${money(-slPts * m * order.qty)}`;
      const src = add && fromRisk && Number.isFinite(risk) ? `${t('ilość z ryzyka {usd}', { usd: fmtMoney(risk, { plus: false }) })} · ${srcText()}` : srcText();
      push({ id, label: txt, plain: `${verb} ${type}${at}`, verb, side: add ? (pos.dir === 'Long' ? 'buy' : 'sell') : side, detail: why || src, disabled: !!why, why, act: { type: 'order', order } });
      return;
    }
    push({ id, label: `${verb} ${type}${at}`, verb, side: add ? (pos.dir === 'Long' ? 'buy' : 'sell') : side, detail: errWhy(err), disabled: true, why: errWhy(err), act: null });
    // ilość 0 z ryzyka: osobna pozycja „Użyj 1 kontraktu” z ryzykiem jednego kontraktu (jak przycisk w bilecie, final P2-5)
    if (err === 'small' && oneRisk != null) {
      let one = null;
      if (add) one = { instrument: k, side, type, ...(type === 'market' ? {} : { price: P }), qty: 1, sl: null, tp: null, autoBe: null };
      else {
        const r1 = orderAt({ price: P, last: c.last, instrument: k, side, type, preset: c.preset ? { ...c.preset, size: { mode: 'qty', value: 1 } } : null, mem: c.mem, manualQty: c.preset ? null : 1, riskUsd: c.riskUsd, balance: c.balance, beOffset: c.beOffset });
        one = r1.order || null;
      }
      if (one) {
        const why = dry(one);
        push({ id: `${id}-one`, label: `${t('Użyj 1 kontraktu')}: ${verb} ${type} 1${at} · ${t('ryzyko')} ${money(-oneRisk)}`, plain: `${verb} ${type} 1${at}`, verb, side: add ? (pos.dir === 'Long' ? 'buy' : 'sell') : side, detail: why || srcText(), disabled: !!why, why, act: { type: 'order', order: one } });
      }
    }
  }
  if (back) {
    if (Number.isFinite(L) && Number.isFinite(P) && P !== L) items.push({ id: 'jump-price', label: `${t('Skocz do ceny')} ${pxText(P)}`, detail: '', disabled: false, why: '', act: { type: 'jumpPrice', price: P } });
    items.push({ id: 'back-now', label: t('Wróć do teraz'), detail: t('Przeglądasz wstecz: handel jest zablokowany.'), disabled: false, why: '', act: { type: 'backNow' } });
  } else if (Number.isFinite(L) && Number.isFinite(P)) {
    const near = Math.abs(P - L) <= TICK;
    if (!pos) {
      const list = near ? [['buy', 'market'], ['sell', 'market']] : P > L ? [['sell', 'limit'], ['buy', 'stop']] : [['buy', 'limit'], ['sell', 'stop']];
      for (const [side, type] of list) tradeItem(side, type, false);
    } else {
      const long = pos.dir === 'Long', side = long ? 'buy' : 'sell';
      // Long: pod rynkiem limit, nad rynkiem stop; Short odwrotnie. Przeciwnego kierunku brak (opposite-pending, G-2.4)
      const type = near ? 'market' : (long ? P < L : P > L) ? 'limit' : 'stop';
      tradeItem(side, type, true);
      const lv = levelHere({ pos, price: P, last: c.last });
      if (lv) {
        // 1.7-5: „Dodaj TP tutaj” dodaje kolejny poziom drabiny (procenty po równo), nieaktywne przy czterech poziomach („Najwyżej 4 TP.”); kwota i R dla ilości, którą zamknie nowy poziom
        let res, usd = lv.usd, rr = lv.r;
        if (lv.field === 'sl') res = modifyPosition(book, k, { sl: P }, c.last);
        else {
          const list = ladderApply(pos.dir, pos.tps, { t: 'add', price: P });
          res = list ? modifyPosition(book, k, { tps: list }, c.last) : { events: [{ type: 'rejected', reason: 'tps-max' }] };
          const pl = list ? tpPlan({ dir: pos.dir, openQty: pos.openQty, tps: list.map((x) => ({ ...x, hit: null })) }).find((x) => x.price === P) : null;
          if (pl) { const s = pos.dir === 'Short' ? -1 : 1; usd = (P - pos.avg) * s * pl.qty * m; rr = pos.rUsd > 0 ? usd / pos.rUsd : null; if (pl.qty === 0) { usd = null; rr = null; } }
        }
        const rej = res.events.find((e) => e.type === 'rejected');
        const why = rej ? rejectText(rej.reason, rej) : '';
        const nm = lv.field === 'sl' ? t('SL tutaj') : t('Dodaj TP tutaj');
        // nowy poziom, któremu nie zostaje żaden kontrakt, nie jest proponowany (odbiór r2, przegląd wyglądu P3-3)
        if (!(lv.field !== 'sl' && usd == null)) push({ id: lv.field === 'sl' ? 'sl-here' : 'tp-here', plain: `${nm} @ ${pxText(P)}`, label: usd == null && lv.field !== 'sl' ? `${nm} (${t('0 kontraktów')})` : `${nm} (${money(usd)}${rr != null ? ` · ${fmtR(rr)}` : ''})`, detail: why || pxText(P), disabled: !!why, why, act: { type: 'level', field: lv.field, price: P } });
      }
    }
    if (P !== L) items.push({ id: 'jump-price', label: `${t('Skocz do ceny')} ${pxText(P)}`, detail: '', disabled: false, why: '', act: { type: 'jumpPrice', price: P } });
  }
  if (c.inMargin && Number.isFinite(c.time)) items.push({ id: 'jump-date', label: t('Skocz do daty…'), detail: '', disabled: false, why: '', act: { type: 'jumpDate', time: c.time } });
  return items;
}

// 1.7-5: nazwy pól cen kolejnych wierszy listy TP w bilecie (pierwszy zostaje `tp`: starsze testy i pamięć panelu)
const TPN = ['tp', 'tp2', 'tp3', 'tp4'];
export function mountOrders(host, { getBook, setBook, getLast, getCursor, instrument, instruments = null, risk, commission = () => 0, chart = null, onEvent = () => {}, onReturn = () => {}, lock = () => '', onCommit = () => {}, getDrawing = () => null, useDrawing = () => {}, getSkroty = () => ({}), storage = globalThis.localStorage, getPresets = () => [], getActivePreset = () => null, onPreset = () => {}, getBeOffset = () => 0, getRealLast = null, pastNote = () => '', say = () => {}, clock = () => '' }) {
  const inst = () => (typeof instrument === 'function' ? instrument() : instrument);
  const riskBalance = () => { const r = typeof risk === 'function' ? risk() : risk; return Number(r?.balance); };
  const sessionRisk = () => { const r = typeof risk === 'function' ? risk() : risk; return !r ? NaN : r.mode === 'pct' ? (Number(r.balance) * Number(r.value)) / 100 : Number(r.value); };
  // 1.7-3: aktywny, niezmieniony preset z wielkością w $ albo % salda podmienia ryzyko sesji w wielkości z ryzyka (preset z „ryzykiem sesji” i stałą ilością nic nie zmienia)
  const riskUsd = () => {
    const ap = activePreset();
    return riskOfPreset({ preset: ap && !pDirty ? ap : null, riskUsd: sessionRisk(), balance: riskBalance() });
  };
  let pDirty = false, pApplied = null;
  const presetList = () => { const l = getPresets(); return Array.isArray(l) ? l : []; };
  const activePreset = () => { const id = getActivePreset(); return id ? presetList().find((p) => p.id === id) || null : null; };
  const defOff = () => { const o = Number(getBeOffset()); return Number.isInteger(o) && o >= 0 && o <= 20 ? o : 0; };
  // [U] 31.10.2026 «Przyjmuję wszystkie» (panel zleceń jak w FX Replay: SL/TP w tickach, punktach albo cenie, podgląd ryzyka przed złożeniem)
  // L: jednostka pól SL/TP: 'pt' punkty od wejścia, 'tick' ticki (0,25), 'px' cena
  let type = 'market', manual = false, flash = '', partFor = null, unit = 'pt';
  // odbiór wyglądu 1.7.0 P1-2: zwykły komunikat w bilecie gaśnie po FLASH_MS (wcześniej „Odwrócono…” stało minutami); notka przeglądania wstecz ma pierwszeństwo przed każdym komunikatem
  const FLASH_MS = 6000;
  let flashSeen = '', flashTimer = 0, backSeen = false;
  const unitBtn = (v, l, tip) => `<button type="button" data-unit="${v}" aria-pressed="${v === 'pt'}" title="${esc(tip)}">${esc(l)}</button>`;
  const el = document.createElement('div');
  el.className = 'bt-ord';
  // final (ocena wyglądu P1-1): jednostka SL/TP w atrybucie (przy cenie pola SL i TP są szersze, jak pole ceny)
  el.dataset.unit = 'pt';
  el.setAttribute('role', 'group'); el.setAttribute('aria-label', t('Zlecenia'));
  const typeBtn = (v, l) => `<button type="button" data-ot="${v}" aria-pressed="${v === 'market'}">${esc(l)}</button>`;
  // M (31.10.2026): układ jak bilet zlecenia FX Replay: Kup/Sprzedaj z ceną z przodu, parametry w jednej grupie (na wąskim ekranie zwinięte do podsumowania),
  // pozycja w jednym zwartym wierszu (opis, BE, część, zamknięcie obok siebie)
  // 1.7-5: wiersz listy TP w bilecie (cena w jednostce panelu, procent poza ostatnim, „reszta” przy ostatnim, × od drugiego wiersza); pola: tp, tp2, tp3, tp4 oraz tpPct1..tpPct3
  const tpRowHtml = (r) => `<div class="bt-ord-tp" data-i="${r}"${r ? ' hidden' : ''}>
          <label class="bt-ord-f bt-tp-price"><span class="lbl bt-tp-l">${esc(t('TP (pkt)'))}</span><input class="sp-in" name="${TPN[r]}" type="number" min="0" step="0.25" inputmode="decimal"></label>
          ${r < 3 ? `<label class="bt-ord-f bt-tp-pct" hidden><span class="lbl">%</span><input class="sp-in" name="tpPct${r + 1}" type="number" min="1" max="98" step="1" inputmode="numeric"></label>` : ''}
          <span class="bt-tp-rest note" hidden>${esc(t('reszta'))}</span>
          ${r ? `<button type="button" class="icon-btn bt-tp-rm" data-o="tp-rm" data-i="${r}" aria-label="${esc(t('Usuń TP{n}', { n: r + 1 }))}" title="${esc(t('Usuń TP{n}', { n: r + 1 }))}">×</button>` : ''}
        </div>`;
  el.innerHTML = `
    <div class="bt-ord-row bt-ord-main">
      <div class="bt-ord-l">
      <div class="bt-ord-side">
        <button type="button" class="btn bt-buy" data-o="buy"><span class="bt-ord-k">${esc(t('Kup'))}</span><span class="bt-ord-px"></span><span class="bt-ord-mode"></span></button>
        <button type="button" class="btn bt-sell" data-o="sell"><span class="bt-ord-k">${esc(t('Sprzedaj'))}</span><span class="bt-ord-px"></span><span class="bt-ord-mode"></span></button>
        <button type="button" class="btn sm bt-draw" data-o="draw">${esc(t('Wejdź według rysunku'))}</button>
      </div>
      <p class="bt-ord-prev" role="status" aria-live="polite" hidden></p>
      <div class="bt-ord-presets">
        <div class="bt-ord-pchips" role="group" aria-label="${esc(t('Presety zleceń'))}"></div>
        <button type="button" class="btn sm bt-psave-open" data-o="psave">${esc(t('Zapisz jako preset…'))}</button>
        <p class="note bt-ord-pnote" hidden></p>
        <form class="bt-psave" hidden novalidate>
          <label class="bt-ord-f"><span class="lbl">${esc(t('Nazwa presetu'))}</span><input class="sp-in" name="pname" type="text" maxlength="${PRESET_NAME_MAX}" autocomplete="off"></label>
          <button type="submit" class="btn sm">${esc(t('Zapisz'))}</button><button type="button" class="btn sm" data-o="psave-cancel">${esc(t('Anuluj'))}</button>
          <span class="note bt-psave-err" role="status"></span>
        </form>
      </div>
      </div>
      <button type="button" class="bt-ord-more" aria-expanded="false" aria-controls="bt-ord-fields"><span class="bt-ord-sum"></span><span class="bt-ord-chev" aria-hidden="true"></span></button>
      <div class="bt-ord-fields" id="bt-ord-fields">
        <div class="seg sm" role="group" aria-label="${esc(t('Rodzaj zlecenia'))}">${typeBtn('market', t('Rynkowe'))}${typeBtn('limit', 'Limit')}${typeBtn('stop', 'Stop')}</div>
        <label class="bt-ord-f bt-ord-price" hidden><span class="lbl">${esc(t('Cena'))}</span><input class="sp-in" name="price" type="number" step="0.25" inputmode="decimal"></label>
        <div class="seg sm bt-unit" role="group" aria-label="${esc(t('Jednostka SL i TP'))}">${unitBtn('pt', t('pkt'), t('Punkty od wejścia'))}${unitBtn('tick', t('ticki'), t('Ticki od wejścia (0,25)'))}${unitBtn('px', t('cena'), t('Cena'))}</div>
        <label class="bt-ord-f"><span class="lbl bt-sl-l">${esc(t('SL (pkt)'))}</span><input class="sp-in" name="sl" type="number" min="0" step="0.25" inputmode="decimal"></label>
        <div class="bt-ord-tps" role="group" aria-label="${esc(t('Poziomy TP'))}">${[0, 1, 2, 3].map(tpRowHtml).join('')}<button type="button" class="btn sm bt-tp-add" data-o="tp-add" title="${esc(t('Dodaj kolejny poziom TP (najwyżej 4); procenty dzielą się po równo'))}">${esc(t('+ TP'))}</button></div>
        <label class="bt-ord-f"><span class="lbl">${esc(t('Wielkość'))}</span><input class="sp-in" name="qty" type="number" min="1" step="1" inputmode="numeric"></label>
        <div class="bt-ord-abe">
          <label class="check bt-abe-on"><input type="checkbox" name="abeOn"><span>${esc(t('Auto BE'))}</span></label>
          <div class="seg sm bt-abe-only bt-abe-unit" role="group" aria-label="${esc(t('Jednostka progu auto BE'))}" hidden>${abeUnits().map(([v, l, tip]) => `<button type="button" data-abek="${v}" aria-pressed="${v === 'r'}" title="${esc(tip)}">${esc(l)}</button>`).join('')}</div>
          <label class="bt-ord-f bt-abe-only" hidden><span class="lbl">${esc(t('Próg'))}</span><input class="sp-in" name="abeVal" type="number" min="0" step="any" inputmode="decimal"></label>
          <label class="bt-ord-f bt-abe-only" hidden><span class="lbl">${esc(t('+ ticków'))}</span><input class="sp-in" name="abeOff" type="number" min="0" max="20" step="1" inputmode="numeric"></label>
        </div>
      </div>
    </div>
    <div class="bt-ord-row bt-ord-pos" hidden>
      <span class="bt-ord-info"></span>
      <button type="button" class="btn sm" data-o="be">BE</button>
      <label class="bt-ord-f bt-ord-part"><span class="lbl">${esc(t('Część'))}</span><input class="sp-in" name="part" type="number" min="1" step="1" inputmode="numeric"></label>
      <button type="button" class="btn sm" data-o="partial">${esc(t('Zamknij część'))}</button>
      <button type="button" class="btn sm bt-close" data-o="close">${esc(t('Zamknij pozycję'))}</button>
    </div>
    <div class="bt-ord-row bt-ord-pabe" hidden>
      <span class="bt-ord-pabe-t"></span>
      <button type="button" class="btn sm" data-o="abe-edit">${esc(t('Zmień'))}</button>
      <button type="button" class="btn sm" data-o="abe-off">${esc(t('Wyłącz'))}</button>
      <button type="button" class="btn sm" data-o="abe-add">${esc(t('+ Auto BE'))}</button>
      <div class="bt-ord-pabe-f" hidden>
        <div class="seg sm" role="group" aria-label="${esc(t('Jednostka progu auto BE'))}">${abeUnits().map(([v, l, tip]) => `<button type="button" data-pabek="${v}" aria-pressed="${v === 'r'}" title="${esc(tip)}">${esc(l)}</button>`).join('')}</div>
        <label class="bt-ord-f"><span class="lbl">${esc(t('Próg'))}</span><input class="sp-in" name="pabeVal" type="number" min="0" step="any" inputmode="decimal"></label>
        <label class="bt-ord-f"><span class="lbl">${esc(t('+ ticków'))}</span><input class="sp-in" name="pabeOff" type="number" min="0" max="20" step="1" inputmode="numeric"></label>
        <button type="button" class="btn sm" data-o="abe-ok">${esc(t('Zapisz'))}</button><button type="button" class="btn sm" data-o="abe-cancel">${esc(t('Anuluj'))}</button>
      </div>
    </div>
    <div class="bt-ord-row bt-ord-pend" hidden></div>
    <div class="bt-ord-row bt-ord-msg"><p class="note bt-ord-note" role="status"></p><button type="button" class="btn sm" data-o="one" hidden></button><button type="button" class="btn sm" data-o="back" hidden>${esc(t('Wróć do teraz'))}</button></div>`;
  host.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const field = (n) => $(`[name="${n}"]`);
  // ---- 1.7-5: lista TP w bilecie. tpN = liczba wierszy (1..4). Każdy poziom ma cenę (jednostka panelu) i procent; ostatni wypełniony poziom jest „resztą”.
  // [U] 1.11.2026 «Tak, w 1.7.0 po auto-BE»: kilka TP z % wielkości. Dodanie wiersza dzieli procenty po równo (zaokrąglenie do całych, reszta na ostatnim), usunięcie oddaje procent ostatniemu.
  let tpN = 1;
  const tpRowEl = (r) => $(`.bt-ord-tp[data-i="${r}"]`);
  const pctField = (r) => (r < 3 ? field(`tpPct${r + 1}`) : null);
  function tpLabels() {
    const u = unit === 'tick' ? t('ticki') : unit === 'px' ? t('cena') : t('pkt');
    for (let r = 0; r < 4; r++) tpRowEl(r).querySelector('.bt-tp-l').textContent = tpN === 1 ? `TP (${u})` : `TP${r + 1} (${u})`;
  }
  function setTpN(n) {
    tpN = Math.max(1, Math.min(TPS_MAX, n));
    for (let r = 0; r < 4; r++) {
      const row = tpRowEl(r);
      row.hidden = r > 0 && r >= tpN;
      const pl = row.querySelector('.bt-tp-pct'), rest = row.querySelector('.bt-tp-rest');
      if (pl) pl.hidden = !(tpN > 1 && r < tpN - 1);
      rest.hidden = !(tpN > 1 && r === tpN - 1);
    }
    const add = $('.bt-tp-add');
    add.hidden = tpN >= TPS_MAX;
    tpLabels();
  }
  // wiersze z wypełnioną ceną i dodatnią odległością: { r, name, pts, pct (tekst z pola, '' dla ostatniego wiersza) }
  function tpFilled() {
    const out = [];
    for (let r = 0; r < tpN; r++) {
      if (field(TPN[r]).value.trim() === '') continue;
      const pts = ptsOf(TPN[r]);
      if (!(pts > 0)) continue;
      out.push({ r, name: TPN[r], pts, pct: r < tpN - 1 && pctField(r) ? pctField(r).value.trim() : '' });
    }
    return out;
  }
  // sprawdzenie listy: { levels, err, bad: Set wierszy, badPct: Set wierszy z procentem }. Odległości rosnąco od wejścia („TP2 bliżej niż TP1.”), procenty nie-ostatnich całkowite ≥ 1 o sumie < 100.
  function tpCheck() {
    const f = tpFilled(), bad = new Set(), badPct = new Set();
    let err = '';
    for (let k = 1; k < f.length; k++) {
      if (!(f[k].pts > f[k - 1].pts)) { bad.add(f[k].r); err ||= t('TP{n} bliżej niż TP{m}.', { n: f[k].r + 1, m: f[k - 1].r + 1 }); }
    }
    if (!err && f.length > 1) {
      const pc = f.slice(0, -1).map((x) => (x.pct === '' ? null : /^\d+$/.test(x.pct) ? Number(x.pct) : NaN));
      const sum = pc.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      pc.forEach((v, i) => { if (v === null || !Number.isInteger(v) || v < 1) badPct.add(f[i].r); });
      if (badPct.size || sum >= 100) { if (sum >= 100) f.slice(0, -1).forEach((x) => badPct.add(x.r)); err = t('Procenty TP: każdy poziom oprócz ostatniego to liczba całkowita od 1, a suma poza ostatnim musi być mniejsza niż 100.'); }
    }
    return { levels: f, err, bad, badPct };
  }
  // poziomy dla zlecenia strony side przy cenie wejścia entry: [{ price, pct }] (pct ostatniego pominięty: resztę dopełnia silnik)
  function tpOrderLevels(side, entry) {
    const f = tpFilled(), dir = side === 'buy' ? 1 : -1;
    return f.map((x, i) => {
      const price = unit === 'px' ? q(Number(field(x.name).value)) : entry + dir * x.pts;
      return i < f.length - 1 ? { price, pct: Number(x.pct) } : { price };
    });
  }
  // wiersze do pamięci panelu / presetu: [{ v, pct }] (wartości jak w polach)
  function tpMemRows() {
    const f = tpFilled();
    return f.map((x, i) => ({ v: field(x.name).value.trim(), pct: i < f.length - 1 ? x.pct : '' }));
  }
  // ustawia wiersze z listy [{ v, pct }] (pamięć panelu, preset); pusta lista = jeden pusty wiersz
  function setTpRows(list) {
    const l = list.slice(0, TPS_MAX);
    setTpN(Math.max(1, l.length));
    for (let r = 0; r < 4; r++) field(TPN[r]).value = l[r]?.v ?? '';
    for (let r = 0; r < 3; r++) field(`tpPct${r + 1}`).value = r < l.length - 1 ? String(l[r]?.pct ?? '') : '';
  }
  function tpAdd() {
    if (tpN >= TPS_MAX) return;
    setTpN(tpN + 1);
    const eq = equalPcts(tpN);
    for (let r = 0; r < tpN - 1; r++) field(`tpPct${r + 1}`).value = String(eq[r]);
    field(TPN[tpN - 1]).focus({ preventScroll: true });
  }
  // usunięcie wiersza i: kolejne wiersze przesuwają się w górę (ceny i procenty), procent usuniętego przechodzi na ostatni (ostatni = reszta)
  function tpRemove(i) {
    if (i < 1 || i >= tpN) return;
    const vals = [], pcts = [];
    for (let r = 0; r < tpN; r++) { vals.push(field(TPN[r]).value); pcts.push(r < 3 ? field(`tpPct${r + 1}`).value : ''); }
    vals.splice(i, 1); pcts.splice(i, 1);
    setTpN(tpN - 1);
    for (let r = 0; r < 4; r++) field(TPN[r]).value = vals[r] ?? '';
    for (let r = 0; r < 3; r++) field(`tpPct${r + 1}`).value = r < tpN - 1 ? (pcts[r] ?? '') : '';
  }
  // M: zapis do DOM tylko przy zmianie (refresh idzie przy każdej klatce odtwarzania)
  const setText = (n, v) => { if (n && n.textContent !== v) n.textContent = v; };
  const setTitle = (n, v) => { if (n && n.title !== v) n.title = v; };
  const book = () => getBook();
  const rewound = () => getCursor() < (book().hw || 0);
  // M: pamięć SL/TP: wpisy zapisywane przy każdej zmianie pól, przywracane przy otwarciu i przy zmianie instrumentu aktywnego wykresu
  let memFor = null;
  function applyMem() {
    const k = inst();
    if (!k || memFor === k) return;
    memFor = k;
    // aktywny, niezmieniony preset daje wartości pól (pamięć instrumentu wraca po wyłączeniu presetu albo po zmianie pola)
    if (activePreset() && !pDirty) return;
    const m = recallOrderFields(storage, k);
    if (!m) return;
    if (unit !== m.unit) setUnit(m.unit);
    field('sl').value = m.sl; setTpRows(m.tps || []);
    setAbeFields(m.abe || { on: false, kind: 'r', value: '', off: '' });
  }
  const saveMem = () => { if (memFor) rememberOrderFields(storage, memFor, { unit, sl: field('sl').value.trim(), tp: field('tp').value.trim(), tps: tpMemRows(), abe: { on: field('abeOn').checked, kind: abeKind, value: field('abeVal').value.trim(), off: field('abeOff').value.trim() } }); };
  // M: na wąskim ekranie parametry zlecenia są zwinięte do podsumowania
  const moreBtn = $('.bt-ord-more');
  function setMore(open) { el.dataset.more = String(open); moreBtn.setAttribute('aria-expanded', String(open)); }
  setMore(false);
  setTpN(1);

  // ---- 1.7-3: auto BE w bilecie (przełącznik, jednostka R | pkt | ticki | $ | cena, próg, offset w tickach) ----
  // [U] 2.11.2026 «czy bedzie taka funkcja zrobiona ze da sie ustawic cene w proficie gdzie automatycznie bedzioe przechodzic na be»: próg ustawiany przed wejściem, w presecie i na otwartej pozycji
  let abeKind = 'r', pabeKind = 'r', abeSig = '';
  function setAbeFields(a) {
    field('abeOn').checked = !!a.on; abeKind = a.kind; field('abeVal').value = a.value ?? ''; field('abeOff').value = a.off ?? '';
    abeSig = '';
  }
  // spec progu z pól albo { err } (komunikat do notki) albo null, gdy auto BE wyłączony
  function abeSpec() {
    if (!field('abeOn').checked) return null;
    const v = field('abeVal').value.trim();
    if (v === '' || !(Number(v) > 0)) return { err: t('Wpisz próg auto BE.') };
    if (abeKind === 'r' && slPts() == null) return { err: t('Auto BE w R wymaga SL.') };
    const raw = field('abeOff').value.trim(), off = raw === '' ? defOff() : Number(raw);
    if (!Number.isInteger(off) || off < 0 || off > 20) return { err: t('Offset auto BE: liczba ticków od 0 do 20.') };
    return { kind: abeKind, value: Number(v), offsetTicks: off };
  }
  // cena progu w podglądzie dla strony side: R od SL panelu, $ od wielkości, cena wprost
  function abePreviewPx(spec, entry, qty, side) {
    const d = side === 'sell' ? -1 : 1, m = MULT[inst()] || 0, sp = slPts();
    switch (spec.kind) {
      case 'r': return sp ? entry + d * spec.value * sp : null;
      case 'pts': return entry + d * spec.value;
      case 'ticks': return entry + d * spec.value * TICK;
      case 'usd': return qty >= 1 && m ? entry + (d * spec.value) / (qty * m) : null;
      default: return spec.value;
    }
  }
  function syncAbe() {
    const on = field('abeOn').checked, noSl = slPts() == null;
    const sig = [on, abeKind, noSl].join('|');
    if (sig === abeSig) return;
    abeSig = sig;
    el.querySelectorAll('.bt-abe-only').forEach((x) => { x.hidden = !on; });
    el.querySelectorAll('[data-abek]').forEach((x) => { x.setAttribute('aria-pressed', String(x.dataset.abek === abeKind)); });
    const rb = $('[data-abek="r"]');
    rb.disabled = noSl;
    rb.title = noSl ? t('Auto BE w R wymaga SL') : t('Wielokrotność ryzyka (wymaga SL)');
  }

  // ---- 1.7-3: presety pod Kup/Sprzedaj. Aktywny preset wypełnia pola panelu (SL, TP, wielkość, auto BE); Kup/Sprzedaj składa wtedy pełne zlecenie jednym kliknięciem.
  // Edycja pola odłącza preset („Scalp · zmienione”), kolejne kliknięcie chipa przywraca jego wartości; „Brak” = pamięć SL/TP instrumentu.
  const fmt1 = (x) => String(Math.round(x * 10000) / 10000);
  function presetFill(p) {
    const u = p.sl?.unit === 'ticks' ? 'tick' : 'pt';
    setUnit(u);
    const toPanel = (pts) => (u === 'tick' ? pts / TICK : pts);
    const slPtsV = p.sl ? (p.sl.unit === 'ticks' ? p.sl.value * TICK : p.sl.value) : null;
    field('sl').value = p.sl ? fmt1(p.sl.value) : '';
    // 1.7-5: lista TP presetu → wiersze biletu (R:R przez SL w punktach; pole procentu każdego poziomu poza ostatnim)
    const rows = [];
    for (const tp of p.tps || []) {
      const tpPts = tp.unit === 'rr' ? (slPtsV ? tp.value * slPtsV : null) : tp.unit === 'ticks' ? tp.value * TICK : tp.value;
      if (tpPts) rows.push({ v: fmt1(toPanel(tpPts)), pct: String(tp.pct) });
    }
    setTpRows(rows);
    if (p.size.mode === 'qty') { manual = true; field('qty').value = String(p.size.value); } else { manual = false; field('qty').value = ''; }
    if (p.autoBe) setAbeFields({ on: true, kind: p.autoBe.kind, value: fmt1(p.autoBe.value), off: p.autoBe.offsetTicks ? String(p.autoBe.offsetTicks) : '' });
    else setAbeFields({ on: false, kind: 'r', value: '', off: '' });
  }
  function markDirty() { if (activePreset() && !pDirty) pDirty = true; }
  function choosePreset(id) {
    flash = '';
    if (id) {
      const p = presetList().find((x) => x.id === id);
      if (!p) return;
      pApplied = null; pDirty = false;
      onPreset({ activePreset: id });
    } else {
      pApplied = null; pDirty = false; memFor = null;
      onPreset({ activePreset: null });
    }
    refresh();
  }
  const pchips = $('.bt-ord-pchips');
  let pListRef = null, pListSig = '';
  function paintPresets() {
    const list = presetList(), ap = activePreset();
    if (ap && pApplied !== ap.id) { presetFill(ap); pApplied = ap.id; pDirty = false; } else if (!ap && pApplied) { pApplied = null; pDirty = false; memFor = null; applyMem(); }
    // podpis listy liczy się raz na wersję tablicy (refresh idzie co klatkę odtwarzania)
    if (list !== pListRef) { pListRef = list; pListSig = JSON.stringify(list.map((p) => [p.id, p.name, presetSummary(p)])); }
    const sig = `${pListSig}|${ap?.id || ''}`;
    if (pchips.dataset.sig !== sig) {
      pchips.dataset.sig = sig;
      pchips.innerHTML = `<button type="button" data-pr="" aria-pressed="${!ap}">${esc(t('Brak'))}</button>` + list.map((p) => `<button type="button" data-pr="${esc(p.id)}" aria-pressed="${ap?.id === p.id}" title="${esc(presetSummary(p))}">${esc(p.name)}</button>`).join('');
    }
    const note = $('.bt-ord-pnote'), txt = ap ? (pDirty ? `${ap.name} · ${t('zmienione')}` : t('z presetu {name}', { name: ap.name })) : '';
    setText(note, txt);
    if (note.hidden !== !txt) note.hidden = !txt;
    note.dataset.state = pDirty ? 'dirty' : '';
  }
  // „Zapisz jako preset…”: bieżące pola (SL, TP w pkt albo tickach, ilość ręczna albo ryzyko sesji, auto BE) pod nazwą do 24 znaków
  const psave = $('.bt-psave'), perr = $('.bt-psave-err');
  function openSave(on) {
    psave.hidden = !on; $('[data-o="psave"]').hidden = on; perr.textContent = '';
    if (on) { psave.querySelector('[name="pname"]').value = ''; psave.querySelector('[name="pname"]').focus(); }
  }
  function savePreset(name) {
    if (unit === 'px') return t('Zapis presetu: ustaw SL i TP w pkt albo tickach.');
    const u = unit === 'tick' ? 'ticks' : 'pts', slv = Number(field('sl').value);
    const tchk = tpCheck();
    if (tchk.err) return tchk.err;
    const tl = tpFilled();
    const ab = abeSpec();
    if (ab?.err) return ab.err;
    if (ab && ab.kind === 'price') return t('Zapis presetu: auto BE w cenie nie pasuje do zestawu (wybierz R, pkt, ticki albo $).');
    const list = presetList();
    if (list.length >= PRESETS_MAX) return t('Najwyżej {n} presetów.', { n: PRESETS_MAX });
    const p = {
      id: newPresetId(list), name: name.trim().slice(0, PRESET_NAME_MAX),
      sl: slv > 0 ? { unit: u, value: slv } : null,
      tps: tl.map((x, i) => ({ unit: u, value: Number(field(x.name).value), pct: tl.length === 1 ? 100 : i < tl.length - 1 ? Number(x.pct) : 0 })),
      size: manual && Number(field('qty').value) >= 1 ? { mode: 'qty', value: Number(field('qty').value) } : { mode: 'session', value: 0 },
      autoBe: ab ? { kind: ab.kind, value: ab.value, offsetTicks: ab.offsetTicks } : null,
    };
    const e = presetErrors(p, list);
    const msg = e.name || e.tp || e.size || e.abe;
    if (msg) return msg;
    onPreset({ presets: [...list, p], activePreset: p.id });
    // pola już mają wartości nowego presetu: zostaje aktywny i niezmieniony
    pApplied = p.id; pDirty = false;
    return '';
  }
  psave.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = psave.querySelector('[name="pname"]').value.trim();
    const msg = name ? savePreset(name) : t('Wpisz nazwę presetu.');
    if (msg) { perr.textContent = msg; return; }
    openSave(false); refresh();
  });
  psave.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); openSave(false); $('[data-o="psave"]').focus(); } });

  // cena wejścia z pól (market: bieżąca)
  const entryNow = () => (type === 'market' ? Number(getLast()?.price) : (field('price').value.trim() === '' ? NaN : Number(field('price').value)));
  // wartość pola w punktach od wejścia (jednostka z przełącznika); cena: odległość od wejścia
  function ptsOf(n) {
    const v = field(n).value.trim();
    if (v === '' || !Number.isFinite(Number(v))) return null;
    if (unit === 'tick') return q(Math.abs(Number(v)) * TICK);
    if (unit === 'px') { const e = entryNow(); return Number.isFinite(e) ? q(Math.abs(e - Number(v))) : null; }
    return q(Math.abs(Number(v)));
  }
  function slPts() { return ptsOf('sl'); }
  function tpPts() { return ptsOf('tp'); }
  // 1.7-2: odległość do SL, z której liczy się wielkość z ryzyka sesji: przy otwartej pozycji z SL pozycji do ceny dokładki (każda dokładka ryzykuje pełne ryzyko sesji, G-2.2),
  // bez SL pozycji albo bez pozycji z SL z panelu. Przycisk PRZECIWNY do pozycji (zmniejsz, zamknij, odwróć) liczy ilość jak dla nowego wejścia, od SL panelu (karta, sekcja A; decyzja
  // sesji głównej 2.11.2026 po przeglądzie P1-1): inaczej klawisz S tuż nad SL odwracałby w Shorta o wielokrotnym ryzyku sesji. Część zamykająca = otwarta ilość, reszta to nowa strona.
  // Bez SL w panelu ilość jest nieznana (jak przy wejściu bez pozycji: „Wpisz SL albo wielkość”).
  function sizeDist(side = null) {
    const pos = book().positions[inst()];
    const opp = !!pos && !!side && (side === 'buy') !== (pos.dir === 'Long');
    if (pos && pos.sl != null && !opp) { const e = entryNow(); return Number.isFinite(e) ? q(Math.abs(e - pos.sl)) : null; }
    return slPts();
  }
  // runda 2: ta sama reguła co w menu prawego kliku (addQty); przycisk przeciwny do pozycji liczy jak nowe wejście (bez pozycji)
  const autoQty = (side = null) => {
    const pos = book().positions[inst()], opp = !!pos && !!side && (side === 'buy') !== (pos.dir === 'Long');
    return addQty({ pos: opp ? null : pos, entry: entryNow(), riskUsd: riskUsd(), panelSl: slPts(), fixedQty: null, instrument: inst() }).qty;
  };
  // przycisk przeciwny do pozycji
  const isOpp = (pos, side) => !!pos && (side === 'buy') !== (pos.dir === 'Long');
  // wielkość dla strony: ręczna, z ryzyka (SL panelu albo SL pozycji), a przy otwartej pozycji, pustym SL panelu i braku ręcznej ilości przycisk przeciwny zamyka całą otwartą ilość „Zamknij n”
  // (decyzja sesji głównej 2.11.2026, uwaga P3-4 z przeglądu pakietu 1.7-2)
  const qtyFor = (side) => {
    if (manual) return Number(field('qty').value);
    const pos = book().positions[inst()];
    return isOpp(pos, side) && slPts() == null ? pos.openQty : autoQty(side);
  };
  // cena SL/TP dla strony side: jednostka 'px' bierze cenę wprost (zła strona → odrzucenie silnika z komunikatem), inaczej wejście ∓ punkty
  function levelOf(n, side, entry) {
    if (unit === 'px') { const v = field(n).value.trim(); return v === '' ? null : q(Number(v)); }
    const p = n === 'sl' ? slPts() : tpPts(), dir = side === 'buy' ? 1 : -1;
    if (!p) return null;
    return n === 'sl' ? entry - dir * p : entry + dir * p;
  }
  // strona dla jednostki „cena”: SL poniżej wejścia = kupno; bez SL ostatnia strona (domyślnie kupno)
  let lastSide = 'buy';
  function sideGuess() {
    const e = entryNow(), sl = Number(field('sl').value);
    if (unit === 'px' && field('sl').value.trim() !== '' && Number.isFinite(e) && Number.isFinite(sl) && sl !== e) return sl < e ? 'buy' : 'sell';
    return lastSide;
  }
  // przełączenie jednostki przelicza wpisane wartości (z ceny wejścia; bez niej pola się czyszczą przy przejściu na cenę albo z ceny)
  function setUnit(next) {
    if (next === unit || !['pt', 'tick', 'px'].includes(next)) return;
    const e = entryNow(), dir = sideGuess() === 'buy' ? 1 : -1;
    const conv = (n) => {
      const p = ptsOf(n);
      if (p == null) return '';
      if (next === 'tick') return String(Math.round(p / TICK));
      if (next === 'px') return Number.isFinite(e) ? String(n === 'sl' ? e - dir * p : e + dir * p) : '';
      return String(p);
    };
    const sl = conv('sl'), tpv = TPN.slice(0, tpN).map((n) => conv(n));
    unit = next;
    el.dataset.unit = unit;
    field('sl').value = sl; tpv.forEach((v, i) => { field(TPN[i]).value = v; });
    const lab = unit === 'tick' ? t('SL (ticki)') : unit === 'px' ? t('SL (cena)') : t('SL (pkt)');
    $('.bt-sl-l').textContent = lab; tpLabels();
    for (const n of ['sl', ...TPN]) { field(n).step = unit === 'tick' ? '1' : '0.25'; if (unit === 'px') field(n).removeAttribute('min'); else field(n).min = '0'; }
    el.querySelectorAll('[data-unit]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.unit === unit)));
  }
  // L: podgląd przed złożeniem jak w FX Replay: ryzyko w $ i % salda (podstawa ryzyka sesji), cel w $, R:R, liczba kontraktów
  // 1.7-2: podgląd przy otwartej pozycji: „Dołóż 2 · ryzyko teraz −800 $ → −1 600 $ · SL pozycji bez zmian” (nowa średnia i ryzyko łączne przy jednym SL)
  function addPreview() {
    const pos = book().positions[inst()], e = entryNow();
    const qty = manual ? Number(field('qty').value) : autoQty();
    if (!pos || !Number.isFinite(e) || !(Number.isInteger(qty) && qty >= 1)) return null;
    const m = MULT[inst()] || 0, avg = (pos.openQty * pos.avg + qty * e) / (pos.openQty + qty);
    return { qty, before: riskNow(pos), after: pos.sl != null ? Math.abs(avg - pos.sl) * (pos.openQty + qty) * m : null, hasSl: pos.sl != null };
  }
  function preview() {
    if (book().positions[inst()]) return null;
    const e = entryNow(), sp = slPts(), tpP = tpPts(), m = MULT[inst()] || 0;
    const qty = manual ? Number(field('qty').value) : autoQty();
    if (!Number.isFinite(e) || !sp || !(Number.isInteger(qty) && qty >= 1)) return null;
    const r = typeof risk === 'function' ? risk() : risk, bal = Number(r?.balance) || 0;
    let loss = sp * m * qty, gain = tpP ? tpP * m * qty : null, rr = tpP ? Math.round((tpP / sp) * 100) / 100 : null, parts = null;
    // 1.7-5: kilka poziomów: cel = suma po poziomach z ilościami z tej samej reguły co silnik (tpPlan), R:R ważone udziałami (cel / ryzyko)
    const ck = tpCheck(), ls = ck.levels;
    if (ls.length >= 2 && !ck.err) {
      const pc = ls.slice(0, -1).map((x) => Number(x.pct));
      const plan = tpPlan({ dir: 'Long', qty, tps: ls.map((x, i) => ({ id: `t${i}`, price: x.pts, pct: i < ls.length - 1 ? pc[i] : 100 - pc.reduce((a, b) => a + b, 0), hit: null })) });
      parts = plan.map((x) => x.price * m * x.qty);
      gain = parts.reduce((a, b) => a + b, 0);
      rr = Math.round((gain / loss) * 100) / 100;
    } else if (ls.length >= 2) { gain = null; rr = null; }
    return { qty, loss, pct: bal > 0 ? (loss / bal) * 100 : null, gain, rr, parts };
  }
  const pctTxt = (x) => `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(x)}%`;
  // final (ocena wyglądu P2-2): podgląd pod Kup/Sprzedaj, kwota ryzyka w kolorze straty; zapis tylko przy zmianie (refresh co klatkę)
  function paintPreview() {
    const p = preview(), out = $('.bt-ord-prev'), ap = p ? null : addPreview();
    if (out.hidden !== !(p || ap)) out.hidden = !(p || ap);
    if (ap) {
      const txt = ap.hasSl ? `${t('Dołóż {n}', { n: ap.qty })} · ${t('ryzyko teraz')} ${fmtMoney(-ap.before)} → ${fmtMoney(-ap.after)} · ${t('SL pozycji bez zmian')}` : `${t('Dołóż {n}', { n: ap.qty })} · ${t('pozycja bez SL')}`;
      if (out.dataset.h !== txt) { out.dataset.h = txt; out.textContent = txt; }
      return;
    }
    if (!p) { if (out.textContent) out.textContent = ''; delete out.dataset.h; return; }
    const risk = `${t('Ryzyko')} ${fmtMoney(-p.loss)}${p.pct != null ? ` (${pctTxt(p.pct)})` : ''}`;
    const rest = [];
    // „Cel +6 000 $ (TP1 +2 000 · TP2 +4 000) · R:R 3”: kwoty poziomów bez znaku dolara
    if (p.gain != null) rest.push(`${t('Cel')} ${fmtMoney(p.gain)}${p.parts ? ` (${p.parts.map((g, i) => [g, i]).filter(([g]) => g !== 0).map(([g, i]) => `TP${i + 1} ${fmtMoney(g).replace(/\s?\$/, '')}`).join(' · ')})` : ''}`, `R:R ${fmtR(p.rr, { plus: false }).replace(/R$/, '')}`);
    rest.push(t.p('{n} kontraktów', p.qty));
    // 1.7-3: „· auto BE przy 18 330,00” (R od SL panelu, $ od wielkości, cena wprost)
    // względne jednostki zależą od strony, więc podgląd podaje próg dla Kup i dla Sprzedaj; cena wprost jest jedna
    const ab = abeSpec();
    if (ab && !ab.err) {
      const pb = abePreviewPx(ab, entryNow(), p.qty, 'buy'), ps = abePreviewPx(ab, entryNow(), p.qty, 'sell');
      if (ab.kind === 'price') { if (Number.isFinite(pb)) rest.push(`${t('auto BE przy')} ${fx(pb)}`); } else if (Number.isFinite(pb) && Number.isFinite(ps)) rest.push(`${t('auto BE przy')} ${fx(pb)} (${t('Kup')}) · ${fx(ps)} (${t('Sprzedaj')})`);
    }
    const html = `<span class="bt-ord-risk">${esc(risk)}</span> · ${esc(rest.join(' · '))}`;
    if (out.dataset.h !== html) { out.dataset.h = html; out.innerHTML = html; }
  }

  // Zlecenie z pól panelu dla strony side albo { err } (komunikat do notki).
  function build(side) {
    const last = getLast();
    const ty = type;
    const entry = ty === 'market' ? Number(last?.price) : Number(field('price').value);
    if (!Number.isFinite(entry) || (ty !== 'market' && field('price').value.trim() === '')) return { err: ty === 'market' ? t('Brak ceny: kursor jest przed pierwszą świecą.') : t('Wpisz cenę zlecenia.') };
    const s = sizeDist(side);
    const qty = qtyFor(side);
    if (!Number.isInteger(qty) || qty < 1) return { err: manual ? t('Wielkość musi być liczbą całkowitą od 1.') : s ? t('Ryzyko za małe na ten SL: wpisz liczbę kontraktów ręcznie.') : t('Wpisz SL albo wielkość.') };
    // próg auto BE dotyczy tylko nowej pozycji (także nowej strony po odwróceniu); przy dokładce i zmniejszeniu silnik go pomija, więc zły wpis nie blokuje tych akcji
    const pos = book().positions[inst()], ab = abeSpec(), needsAb = !pos || (isOpp(pos, side) && qty > pos.openQty);
    if (ab?.err && needsAb) return { err: ab.err };
    // 1.7-5: lista TP (kolejność i procenty) liczy się tylko dla nowej pozycji; przy dokładce i zmniejszeniu silnik pomija poziomy zlecenia
    const tck = needsAb ? tpCheck() : { err: '' };
    if (tck.err) return { err: tck.err };
    const tl = tpOrderLevels(side, entry), tpPart = tl.length > 1 ? { tps: tl, tp: tl[tl.length - 1].price } : { tp: tl.length ? tl[0].price : null };
    return { order: { instrument: inst(), side, type: ty, price: ty === 'market' ? undefined : entry, qty, sl: levelOf('sl', side, entry), ...tpPart, autoBe: ab && !ab.err && needsAb ? ab : null } };
  }

  function act(res) {
    setBook(res.book);
    for (const ev of res.events) {
      if (ev.type === 'rejected') flash = rejectText(ev.reason, ev);
      onEvent(ev);
    }
    // 1.7-2: odwrócenie (przyciskiem, skrótem albo większym zleceniem przeciwnym) = dwa trade'y; komunikat aria-live mówi, co się stało
    const rv = res.events.find((e) => e.type === 'closed' && e.position?.exits?.[e.position.exits.length - 1]?.reason === 'reverse');
    if (rv && !res.events.some((e) => e.type === 'rejected')) {
      const nf = res.events.find((e) => e.type === 'filled' && e.position?.reverseFrom === rv.position.id)?.position;
      const net = netResult(rv.position, Number(commission()) || 0);
      // odbiór wyglądu 1.7.0 P2-2: odwrócenie to zdarzenie jak TP i BE: toast i aria-live z godziną (say), a nie komunikat stojący w bilecie
      const p = { from: rv.position.dir === 'Long' ? t('Long') : t('Short'), n: rv.position.exits.at(-1)?.qty ?? rv.position.qty, pnl: (rv.position.exits || []).length > 1 ? `(${t('trade')} ${fmtMoney(net.pnl)})` : fmtMoney(net.pnl), to: nf?.dir === 'Long' ? t('Long') : t('Short'), m: nf?.qty ?? '' };
      const when = clock(getLast(inst())?.t);
      say(when ? t('Odwrócono {time} · {from} {n} zamknięty {pnl}, {to} {m} otwarty', { ...p, time: when }) : t('Odwrócono: {from} {n} zamknięty {pnl}, {to} {m} otwarty', p));
    }
    onCommit();
    refresh();
  }

  function submit(side) {
    if (rewound() || lock()) return false;
    const b = build(side);
    if (b.err) { flash = b.err; refresh(); return false; }
    flash = '';
    lastSide = side;
    act(placeOrder(book(), b.order, getLast()));
    return true;
  }
  // 1.7-4: kontekst menu prawego kliku dla instrumentu k (wykres, na którym kliknięto, niekoniecznie aktywny): aktywny i niezmieniony preset albo pamięć panelu (zapisywana przy każdej zmianie pól),
  // ilość wpisana w panelu tylko dla instrumentu aktywnego wykresu. Cenę kliknięcia i flagi marginesu dokłada wywołujący.
  function menuContext(k) {
    const ap = activePreset();
    const qn = k === inst() && manual ? Number(field('qty').value) : null;
    return { instrument: k, last: getLast(k), book: book(), rewound: rewound(), lock: lock(), preset: ap && !pDirty ? ap : null, mem: recallOrderFields(storage, k), manualQty: Number.isInteger(qn) ? qn : null, riskUsd: riskUsd(), balance: riskBalance(), beOffset: defOff() };
  }
  // 1.7-4: złożenie gotowego zlecenia z menu prawego kliku (ta sama walidacja silnika co panel: odrzucenie zostawia komunikat w notce i księgę bez zmian)
  function placeAt(order) {
    if (rewound() || lock()) { flash = lock() || rejectText('rewound'); refresh(); return false; }
    flash = '';
    const res = placeOrder(book(), order, getLast(order.instrument));
    const bad = res.events.some((e) => e.type === 'rejected');
    act(res);
    return !bad;
  }
  // J: stan przycisku „Wejdź według rysunku”: { d, order } albo { why } (powód w title). Blokady jak Kup/Sprzedaj: sesja z innej karty (K: bez dnia zakończonego),
  // cofnięty kursor, otwarta pozycja na instrumencie (jedna pozycja na instrument, reguła silnika), brak ceny; do tego rysunek bez SL (wielkość z ryzyka wymaga SL).
  function drawState() {
    const d = getDrawing(), lk = lock();
    if (lk) return { why: lk };
    if (rewound()) return { why: t('Przeglądasz wstecz: handel jest zablokowany.') };
    if (!d) return { why: t('Zaznacz rysunek pozycji long albo short na aktywnym wykresie.') };
    // przegląd J P2-1: rysunek przywrócony (Ctrl+Z, awaria przed zapisem) nie składa drugiego zlecenia, gdy jego zlecenie czeka albo pozycja jest otwarta
    const b0 = book(), used = b0.orders.some((o) => o.fromDrawing === d.id) || Object.values(b0.positions).some((p) => p && p.fromDrawing === d.id);
    if (used) return { why: t('Z tego rysunku jest już zlecenie albo otwarta pozycja.') };
    if (book().positions[inst()]) return { why: t('Na tym instrumencie jest już otwarta pozycja.') };
    const r = orderFromDrawing(d, { last: getLast(), instrument: inst(), riskUsd: sessionRisk(), tick: TICK });
    return r.err ? { why: r.err } : { d, order: r.order };
  }
  // [U] 30.10.2026 «Automatycznie» (market / limit / stop wg ceny) i «Ryzyko sesji, rysunek znika»: po przyjętym zleceniu rysunek usuwa się z rysunków sesji
  // (zastępuje go prawdziwe zlecenie albo pozycja na wykresie). Cofnięcie zlecenia nie przywraca rysunku (Ctrl+Z w rysunkach dalej działa).
  function fromDrawing() {
    const s = drawState();
    if (!s.order) { flash = s.why || ''; refresh(); return false; }
    flash = '';
    const res = placeOrder(book(), { ...s.order, fromDrawing: s.d.id }, getLast());
    const ok = !res.events.some((e) => e.type === 'rejected');
    // przegląd J P2-1: jeden zapis sesji. useDrawing usuwa rysunek i od razu wpisuje dokument rysunków do sesji (bez osobnego zapisu),
    // a act → onCommit zapisuje zlecenie i usunięcie razem
    if (ok) useDrawing(s.d);
    act(res);
    if (ok) syncDrawing();
    return ok;
  }
  function syncDrawing() {
    const b = $('[data-o="draw"]'), s = drawState();
    b.disabled = !s.order;
    b.title = s.order ? hintOf(`${s.order.side === 'buy' ? t('Kup') : t('Sprzedaj')} ${s.order.type} ${s.order.qty}× · SL ${fx(s.order.sl)}${s.order.tp != null ? ` · TP ${fx(s.order.tp)}` : ''}`, (getSkroty() || {}).drawEntry) : s.why;
  }
  // 1.7-2 (G-2.5): „Odwróć” (panel ×, szuflada, skrót R): zamyka całą otwartą ilość i otwiera pozycję przeciwną tej samej wielkości po cenie bieżącej. SL i TP nowej pozycji
  // z pamięci panelu (odległości w punktach od nowego wejścia; presety dochodzą w 1.7-3), bez pamięci pozycja jest bez SL i TP (R „—”).
  function reverseFor(k = inst()) {
    const p = book().positions[k];
    if (!p || rewound() || lock()) return false;
    flash = '';
    const l = getLast(k), px = Number(l?.price), m = recallOrderFields(storage, k), nd = p.dir === 'Long' ? -1 : 1;
    const pts = (v) => (m.unit === 'tick' ? Number(v) * TICK : Number(v));
    let sl = m && Number.isFinite(px) && pts(m.sl) > 0 ? q(px - nd * pts(m.sl)) : null;
    let tp = null, tps = null;
    if (m && Number.isFinite(px)) {
      // 1.7-5: lista TP z pamięci panelu (jeden wiersz = pojedynczy tp)
      const lvs = (m.tps?.length ? m.tps : m.tp !== '' ? [{ v: m.tp, pct: '100' }] : []).map((x) => ({ pts: pts(x.v), pct: Number(x.pct) })).filter((x) => x.pts > 0);
      const prices = lvs.map((x, i) => ({ price: q(px + nd * x.pts), ...(i < lvs.length - 1 ? { pct: x.pct } : {}) }));
      if (prices.length > 1) { tps = prices; tp = prices[prices.length - 1].price; } else if (prices.length) tp = prices[0].price;
    }
    // auto BE z pamięci panelu (bez rodzaju „cena”: nie ma sensu dla nowej pozycji po innej cenie; R tylko z SL)
    const ma = m?.abe;
    let autoBe = ma && ma.on && ma.kind !== 'price' && Number(ma.value) > 0 && (ma.kind !== 'r' || sl != null) ? { kind: ma.kind, value: Number(ma.value), offsetTicks: ma.off === '' ? defOff() : Number(ma.off) } : null;
    // aktywny, niezmieniony preset: odwrócenie bierze z niego SL, TP i auto BE (wielkość zostaje otwarta ilość)
    const ap = activePreset();
    if (ap && !pDirty) {
      const r = presetOrder({ ...ap, size: { mode: 'qty', value: 1 } }, { side: nd > 0 ? 'buy' : 'sell', entry: px, instrument: k });
      if (r.order) { ({ sl, tp, autoBe } = r.order); tps = r.order.tps || null; }
    }
    act(reversePosition(book(), k, l, { sl, tp, tps, autoBe }));
    return true;
  }
  function closeNow(k = inst()) {
    if (rewound() || lock()) return false;
    flash = '';
    act(closeAll(book(), k, getLast(k), 'manual'));
    return true;
  }
  // L: akcje z szuflady i z linii pozycji na wykresie (instrument jawnie, nie tylko aktywny wykres)
  function closeQty(k, qty) {
    const p = book().positions[k];
    if (!p || rewound() || lock()) return false;
    flash = '';
    act(qty >= p.openQty ? closeAll(book(), k, getLast(k), 'manual') : closePartial(book(), k, qty, getLast(k)));
    return true;
  }
  const closePct = (k, pc) => { const p = book().positions[k]; return p ? closeQty(k, pctQty(p.openQty, pc)) : false; };
  // BE: nieaktywne po stronie straty (także bez SL) albo gdy SL już stoi na BE; klawisz E i przycisk dają wtedy komunikat zamiast cichego odrzucenia
  function beFor(k) {
    if (!book().positions[k] || rewound() || lock()) return false;
    const st = beState(book(), k, getLast(k));
    if (!st.ok) { flash = beWhyText(st.why); refresh(); return false; }
    flash = ''; act(moveToBE(book(), k, getLast(k))); return true;
  }
  // [U] 1.11.2026 «Można usunąć oba» (P6): price = null usuwa poziom. Zwraca true po przyjęciu przez silnik; odrzucenie zostawia komunikat (lastFlash) i księgę bez zmian.
  // 1.7-5: field 'tp' działa na drabinie: z tpId zmienia cenę poziomu (price) albo usuwa go (null; procent przechodzi na ostatni); bez tpId dodaje nowy poziom (price; procenty po równo,
  // najwyżej 4) albo usuwa wszystkie nietrafione poziomy (null)
  function setLevel(k, field, price, tpId = null) {
    const p = book().positions[k];
    if (!p) return false;
    if (rewound() || lock()) { flash = lock() || rejectText('rewound'); refresh(); return false; }
    flash = '';
    let changes;
    if (field === 'abe') changes = { autoBe: price == null ? null : { kind: 'price', value: price, offsetTicks: p.autoBe?.offsetTicks ?? defOff() } };
    else if (field === 'sl') changes = { sl: price };
    else {
      const op = tpId ? (price == null ? { t: 'rm', id: tpId } : { t: 'price', id: tpId, price }) : price == null ? null : { t: 'add', price };
      if (!op) changes = { tp: null };
      else {
        const list = ladderApply(p.dir, p.tps, op);
        if (!list) { flash = rejectText('tps-max'); refresh(); return false; }
        changes = { tps: list };
      }
    }
    return commitPosition(k, changes);
  }
  function commitPosition(k, changes) {
    const res = modifyPosition(book(), k, changes, getLast(k));
    const bad = res.events.some((e) => e.type === 'rejected');
    act(res);
    return !bad;
  }
  // procent poziomu drabiny (edytor w plakietce); ostatni poziom jest resztą i nie ma własnego procentu
  function setTpPct(k, id, pct) {
    const p = book().positions[k];
    if (!p) return false;
    if (rewound() || lock()) { flash = lock() || rejectText('rewound'); refresh(); return false; }
    flash = '';
    const list = ladderApply(p.dir, p.tps, { t: 'pct', id, pct: Number(pct) });
    return list ? commitPosition(k, { tps: list }) : false;
  }
  // cała lista z edytora w szufladzie: wiersze { id | null, price (tekst), pct (tekst) }; pusta cena pomija wiersz (usuwa poziom), brak procentu = podział po równo
  function setTps(k, rows) {
    const p = book().positions[k];
    if (!p) return false;
    if (rewound() || lock()) { flash = lock() || rejectText('rewound'); refresh(); return false; }
    flash = '';
    const list = [];
    for (const x of rows || []) {
      const s = priceText(x.price, locale());
      if (s === '') continue;
      const pc = String(x.pct ?? '').trim();
      list.push({ id: x.id || null, price: Number(s), pct: pc === '' ? undefined : Number(pc) });
    }
    return commitPosition(k, list.length ? { tps: list } : { tp: null });
  }
  // próg auto-BE otwartej pozycji z edycji w panelu (ab = { kind, value, offsetTicks } albo null = wyłącz)
  function setAutoBe(k, ab) {
    const p = book().positions[k];
    if (!p) return false;
    if (rewound() || lock()) { flash = lock() || rejectText('rewound'); refresh(); return false; }
    flash = '';
    const res = modifyPosition(book(), k, { autoBe: ab }, getLast(k));
    const bad = res.events.some((e) => e.type === 'rejected');
    act(res);
    return !bad;
  }
  // zamknięcie części (wielkość z okna „Zamknij część”, partialPlan); qty >= otwarta = zamknięcie całości
  const lastFlash = () => flash;
  // czas anulowania z kursora INSTRUMENTU zlecenia (zlecenie z innego wykresu), nie aktywnego
  function cancel(id) { if (rewound() || lock()) return false; flash = ''; act({ book: cancelOrder(book(), id), events: [] }); return true; }
  // przeciągnięcie zlecenia oczekującego albo jego SL/TP na wykresie → modifyOrder (odrzucenie wraca linię na miejsce przez refresh)
  function moveOrder(id, changes) {
    const o = book().orders.find((x) => x.id === id);
    if (!o) { refresh(); return false; }
    if (lock()) { refresh(); return false; }
    flash = '';
    const res = modifyOrder(book(), id, changes, getLast(o.instrument));
    act(res);
    return !res.events.some((e) => e.type === 'rejected');
  }

  // ---- 1.7-3: auto BE na otwartej pozycji: tekst „Auto BE: przy +1R (18 330,00) · BE+0t”, [Zmień] [Wyłącz], a bez progu [+ Auto BE] ----
  let pabeOpen = false;
  const pabe = $('.bt-ord-pabe'), pabeF = $('.bt-ord-pabe-f');
  function paintPabeForm() {
    pabeF.querySelectorAll('[data-pabek]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.pabek === pabeKind)));
    const p = book().positions[inst()], rb = pabeF.querySelector('[data-pabek="r"]');
    if (rb) { rb.disabled = !(p?.rUsd > 0); rb.title = rb.disabled ? t('Auto BE w R wymaga SL') : t('Wielokrotność ryzyka (wymaga SL)'); }
  }
  function openPabe(on, fresh = false) {
    pabeOpen = on; pabeF.hidden = !on;
    if (on) {
      const p = book().positions[inst()], ab = p?.autoBe && !p.autoBe.done && !fresh ? p.autoBe : null;
      pabeKind = ab ? ab.kind : p?.rUsd > 0 ? 'r' : 'pts';
      field('pabeVal').value = ab ? String(ab.value) : pabeKind === 'r' ? '1' : '';
      field('pabeOff').value = ab && ab.offsetTicks ? String(ab.offsetTicks) : '';
      paintPabeForm();
      field('pabeVal').focus();
    }
    refresh();
  }
  function commitPabe() {
    const v = field('pabeVal').value.trim(), raw = field('pabeOff').value.trim(), off = raw === '' ? defOff() : Number(raw);
    if (v === '' || !(Number(v) > 0)) { flash = t('Wpisz próg auto BE.'); refresh(); return; }
    if (!Number.isInteger(off) || off < 0 || off > 20) { flash = t('Offset auto BE: liczba ticków od 0 do 20.'); refresh(); return; }
    if (setAutoBe(inst(), { kind: pabeKind, value: Number(v), offsetTicks: off })) openPabe(false);
  }
  function paintPabe(pos, rw) {
    pabe.hidden = !pos;
    if (!pos) { if (pabeOpen) { pabeOpen = false; pabeF.hidden = true; } return; }
    const info = abeInfo(pos), armed = info.armed;
    setText($('.bt-ord-pabe-t'), `${t('Auto BE')}: ${info.text || t('wyłączone')}`);
    const flip = (sel, hide) => { const n = $(sel); if (n.hidden !== hide) n.hidden = hide; n.disabled = rw; };
    flip('[data-o="abe-edit"]', !armed); flip('[data-o="abe-off"]', !armed); flip('[data-o="abe-add"]', armed || !!pos.autoBe?.done);
    if (pabeOpen && pabeF.hidden) pabeF.hidden = false;
  }

  function onClick(ev) {
    const b = ev.target.closest('button');
    if (!b || b.disabled || !el.contains(b)) return;
    if (b === moreBtn) { setMore(el.dataset.more !== 'true'); return; }
    if (b.dataset.pr !== undefined) { choosePreset(b.dataset.pr); return; }
    if (b.dataset.abek) { abeKind = b.dataset.abek; abeSig = ''; markDirty(); saveMem(); flash = ''; refresh(); return; }
    if (b.dataset.pabek) { pabeKind = b.dataset.pabek; paintPabeForm(); return; }
    if (b.dataset.ot) { type = b.dataset.ot; flash = ''; el.querySelectorAll('[data-ot]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); refresh(); return; }
    if (b.dataset.unit) { setUnit(b.dataset.unit); markDirty(); saveMem(); flash = ''; refresh(); return; }
    const o = b.dataset.o;
    if (o === 'buy' || o === 'sell') submit(o);
    else if (o === 'draw') fromDrawing();
    else if (o === 'close') closeNow();
    else if (o === 'be') beFor(inst());
    else if (o === 'partial') { flash = ''; act(closePartial(book(), inst(), Number(field('part').value), getLast())); }
    else if (o === 'psave') openSave(true);
    else if (o === 'psave-cancel') { openSave(false); $('[data-o="psave"]').focus(); }
    else if (o === 'abe-edit') openPabe(true);
    else if (o === 'abe-add') openPabe(true, true);
    else if (o === 'abe-cancel') { openPabe(false); }
    else if (o === 'abe-ok') commitPabe();
    else if (o === 'abe-off') { flash = ''; setAutoBe(inst(), null); }
    else if (o === 'tp-add') { tpAdd(); markDirty(); saveMem(); flash = ''; refresh(); }
    else if (o === 'tp-rm') { tpRemove(Number(b.dataset.i)); markDirty(); saveMem(); flash = ''; refresh(); }
    else if (o === 'back') onReturn();
    // final (ocena wyglądu P2-5): „Ryzyko za małe” z jednym kliknięciem: 1 kontrakt wpisany ręcznie
    else if (o === 'one') { manual = true; markDirty(); field('qty').value = '1'; flash = ''; refresh(); }
    else if (b.dataset.cancel) { flash = ''; act({ book: cancelOrder(book(), b.dataset.cancel), events: [] }); }
  }
  function onInput(ev) {
    const n = ev.target.name;
    flash = '';
    if (n === 'qty') manual = ev.target.value.trim() !== '';
    const isTp = /^(tp[2-4]?|tpPct[1-3])$/.test(n);
    if (n === 'sl' || isTp) saveMem();
    // edycja pola odłącza aktywny preset („Scalp · zmienione”); pola auto BE zapisują się w pamięci instrumentu
    if (isTp || ['sl', 'qty', 'abeOn', 'abeVal', 'abeOff'].includes(n)) markDirty();
    if (n === 'abeOn') abeSig = '';
    if (n === 'abeOn' || n === 'abeVal' || n === 'abeOff') saveMem();
    refresh();
  }
  el.addEventListener('click', onClick);
  el.addEventListener('input', onInput);

  function refresh() {
    applyMem();
    paintPresets();
    const b = book(), i = inst(), pos = b.positions[i], back = rewound(), lk = lock(), rw = back || !!lk, last = getLast();
    const price = field('price').closest('label');
    price.hidden = type === 'market';
    if (!manual) { const a = autoQty(); field('qty').value = a > 0 ? String(a) : ''; }
    field('qty').placeholder = manual ? '' : t('auto');
    const canTrade = !rw && Number.isFinite(Number(last?.price));
    // przeciwny limit/stop przy otwartej pozycji jest odrzucany przez silnik (opposite-pending, G-2.4): przycisk nieaktywny z powodem
    const oppPending = (side) => !!pos && type !== 'market' && (side === 'buy') !== (pos.dir === 'Long');
    const ok = (side) => { if (!canTrade || oppPending(side)) return false; const r = build(side); return !r.err; };
    $('[data-o="buy"]').disabled = !ok('buy');
    $('[data-o="sell"]').disabled = !ok('sell');
    $('.bt-ord-pos').hidden = !pos;
    if (pos) {
      // M poprawki (ocena wyglądu #6): kierunek, ilość i wejście zawsze; SL/TP w dopisku, schowanym na wąskim ekranie (są na etykietach wykresu)
      const info = $('.bt-ord-info'), sig = [pos.dir, pos.openQty, pos.qty, pos.entryPrice, pos.sl, pos.tp, pos.be].join('|');
      if (info.dataset.sig !== sig) {
        info.dataset.sig = sig;
        info.innerHTML = `<b>${esc(pos.dir === 'Long' ? t('Long') : t('Short'))} ${esc(pos.openQty)}/${esc(pos.qty)}</b> @ ${esc(fx(pos.entryPrice))}<span class="bt-ord-info-x"> · SL ${esc(fx(pos.sl))} · TP ${esc(fx(pos.tp))}${pos.be ? ' · BE' : ''}</span>`;
      }
      for (const s of ['be', 'partial', 'close']) $(`[data-o="${s}"]`).disabled = rw;
      const part = field('part');
      // domyślna część = połowa otwartej wielkości; nowa pozycja albo wpis spoza zakresu zeruje pole
      if (partFor !== pos.id || !(Number(part.value) >= 1 && Number(part.value) < pos.openQty)) { part.value = String(Math.max(1, Math.floor(pos.openQty / 2))); partFor = pos.id; }
      part.disabled = rw;
      $('[data-o="partial"]').disabled = rw || pos.openQty < 2;
    }
    const orders = b.orders.filter((o) => o.instrument === i);
    const pend = $('.bt-ord-pend');
    pend.hidden = !orders.length;
    pend.innerHTML = orders.map((o) => `<span class="bt-chip" data-oid="${esc(o.id)}">${esc(label(o))}<button type="button" class="icon-btn" data-cancel="${esc(o.id)}" aria-label="${esc(t('Anuluj zlecenie'))}" ${rw ? 'disabled' : ''}>×</button></span>`).join('');
    $('[data-o="back"]').hidden = !back || !!lk;
    const note = $('.bt-ord-note');
    const small = canTrade && !manual && sizeDist() && !autoQty();
    // H2 (zgłoszenie z zrzutów): Kup/Sprzedaj wyłączone bez powodu wyglądały na awarię; teraz notka mówi, czego brakuje (SL albo wielkość, cena przed pierwszą świecą)
    const why = !rw ? (build('buy').err || '') : '';
    // runda 2: przy przeglądaniu wstecz notka podaje godziny (kursor i chwila bieżąca, NY), żeby było widać, dokąd wraca „Wróć do teraz”
    // skok (wejście w przeglądanie albo powrót z niego) gasi stary komunikat: dotyczył innego miejsca na osi
    if (back !== backSeen) { backSeen = back; if (flash) flash = ''; }
    if (flash !== flashSeen) {
      flashSeen = flash; clearTimeout(flashTimer);
      if (flash) flashTimer = setTimeout(() => { if (flash === flashSeen) { flash = ''; flashSeen = ''; refresh(); } }, FLASH_MS);
    }
    const backNote = `${t('Przeglądasz wstecz: handel jest zablokowany.')} ${pastNote()}`.trim();
    note.textContent = lk || (back ? backNote : (flash || (small ? t('Ryzyko za małe na ten SL: wpisz liczbę kontraktów ręcznie.') : why)));
    // final (P2-5): przy „Ryzyko za małe” przycisk z ryzykiem jednego kontraktu
    const oneBtn = $('[data-o="one"]'), oneOn = !!small && !flash && !lk && !back;
    if (oneBtn.hidden !== !oneOn) oneBtn.hidden = !oneOn;
    if (oneOn) setText(oneBtn, t('Użyj 1 kontraktu (ryzyko {usd})', { usd: fmtMoney(sizeDist() * (MULT[inst()] || 0), { plus: false }) }));
    // M: przycisk mówi, co zrobi (rodzaj i cena), a podpowiedź podaje skrót; wyłączony podaje powód
    const sk = getSkroty() || {};
    const pxNow = type === 'market' ? Number(last?.price) : Number(field('price').value);
    for (const s of ['buy', 'sell']) {
      const bb = $(`[data-o="${s}"]`);
      const verb = s === 'buy' ? (type === 'market' ? t('Kup rynkowo') : type === 'limit' ? t('Kup limit') : t('Kup stop')) : (type === 'market' ? t('Sprzedaj rynkowo') : type === 'limit' ? t('Sprzedaj limit') : t('Sprzedaj stop'));
      setText(bb.querySelector('.bt-ord-px'), Number.isFinite(pxNow) && (type === 'market' || field('price').value.trim() !== '') ? fx(pxNow) : '');
      if (bb.getAttribute('aria-keyshortcuts') !== (sk[s] || '')) bb.setAttribute('aria-keyshortcuts', sk[s] || '');
      // podpis trybu pod ceną (tylko przy otwartej pozycji): Dołóż / Zmniejsz / Zamknij / Odwróć (jedno kliknięcie, bez potwierdzenia, G-2.1)
      const wantQ = qtyFor(s);
      const md = pos && Number.isInteger(wantQ) && wantQ >= 1 ? sideMode(pos, s, wantQ) : { kind: 'open' };
      const cap = oppPending(s) ? '' : modeText(md);
      setText(bb.querySelector('.bt-ord-mode'), cap);
      if (bb.dataset.mode !== md.kind) bb.dataset.mode = md.kind;
      const tt = bb.disabled ? (lk || (back ? t('Przeglądasz wstecz: handel jest zablokowany.') : '') || (oppPending(s) ? rejectText('opposite-pending') : '') || (!rw ? (build(s).err || '') : '')) : hintOf(cap ? `${verb} · ${cap}` : verb, sk[s]);
      setTitle(bb, tt);
    }
    setTitle($('[data-o="be"]'), hintOf(t('SL na cenę wejścia (BE)'), sk.be));
    setTitle($('[data-o="close"]'), hintOf(t('Zamknij całą pozycję'), sk.closeAll));
    setTitle($('[data-o="partial"]'), t('Zamknij podaną liczbę kontraktów'));
    // podsumowanie parametrów (wąski ekran: przycisk rozwijający pola)
    const sumParts = [];
    const ul = unit === 'tick' ? t('ticki') : unit === 'px' ? '' : t('pkt');
    const fv = (n) => field(n).value.trim();
    if (type !== 'market') sumParts.push(`${type === 'limit' ? 'Limit' : 'Stop'} ${fv('price') ? fx(Number(fv('price'))) : '–'}`);
    sumParts.push(`SL ${fv('sl') || '–'}${fv('sl') && ul ? ` ${ul}` : ''}`);
    const tf = tpFilled();
    sumParts.push(tf.length > 1 ? `TP ${tf.map((x, i) => (i < tf.length - 1 ? `${fv(x.name)} ${x.pct}%` : fv(x.name))).join(' / ')}${ul ? ` ${ul}` : ''}` : `TP ${fv('tp') || '–'}${fv('tp') && ul ? ` ${ul}` : ''}`);
    // pola listy TP poza kolejnością albo z błędnym procentem są zaznaczone (aria-invalid); powód stoi w notce (build)
    const tcheck = tpCheck();
    for (let r = 0; r < 4; r++) {
      const sets = [[field(TPN[r]), tcheck.bad.has(r)], ...(r < 3 ? [[field(`tpPct${r + 1}`), tcheck.badPct.has(r)]] : [])];
      for (const [inp, bad] of sets) if ((inp.getAttribute('aria-invalid') === 'true') !== bad) { if (bad) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
    }
    const qn = Number(field('qty').value);
    if (qn >= 1) sumParts.push(t.p('{n} kontraktów', qn));
    setText($('.bt-ord-sum'), sumParts.join(' · '));
    setTitle(moreBtn, t('Parametry zlecenia'));
    // final (ocena wyglądu 2, P2-N2): „Ryzyko za małe” jako stan ostrzeżenia (kolor uwagi z kropką, rozmiar podglądu ryzyka)
    note.dataset.state = back && !lk ? 'rewound' : oneOn ? 'small' : '';
    // M: pusty wiersz komunikatu nie zajmuje miejsca (wąski ekran)
    const msgRow = $('.bt-ord-msg'), msgOff = !note.textContent && $('[data-o="back"]').hidden && oneBtn.hidden;
    if (msgRow.hidden !== msgOff) msgRow.hidden = msgOff;
    syncDrawing();
    paintPreview();
    syncAbe();
    paintPabe(pos, rw);
    // L: zlecenia oczekujące z SL/TP, ilością i ryzykiem w $ (etykiety przeciągane na wykresie); rw = handel zablokowany (bez przeciągania)
    // dokładka (intent 'add') ryzykuje do SL pozycji, zlecenie wejścia do własnego SL
    const orderRisk = (o) => {
      const sl = o.intent === 'add' ? b.positions[o.instrument]?.sl : o.sl;
      return sl != null ? Math.abs(o.price - sl) * (MULT[o.instrument] || 0) * o.qty : null;
    };
    // runda 2: przy przeglądaniu wstecz pozycje i zlecenia z czasem po kursorze nie są rysowane (nie istniały jeszcze przy kursorze)
    const cur = getCursor(), seen = (tm) => !back || !Number.isFinite(tm) || tm <= cur;
    const stateOf = (k) => ({ position: b.positions[k] && !seen(b.positions[k].entryT) ? null : posState(k, b), rw, orders: b.orders.filter((o) => o.instrument === k && seen(o.placedT)).map((o) => ({ id: o.id, price: o.price, side: o.side, type: o.type, qty: o.qty, sl: o.sl, tp: o.tp, tps: o.intent === 'add' ? [] : tpPlan({ dir: o.side === 'buy' ? 'Long' : 'Short', qty: o.qty, tps: o.tps }), intent: o.intent || 'open', risk: orderRisk(o), title: label(o) })) });
    if (chart?.setTradingFor) for (const k of new Set([i, ...(typeof instruments === 'function' ? instruments() : [])])) chart.setTradingFor(k, stateOf(k));
    else chart?.setTrading(stateOf(i));
  }
  // pozycja dla warstwy plakietek wykresu: księga + cena bieżąca (do podglądu strony ceny i kwot części), prowizja sesji i odległości startowe +SL/+TP (pamięć panelu, inaczej 10 pkt NQ/MNQ i 2 pkt ES/MES; TP = pamięć albo 2× SL)
  function posState(k, b) {
    const p = b.positions[k];
    if (!p) return null;
    const m = recallOrderFields(storage, k), dflt = k === 'ES' || k === 'MES' ? 2 : 10;
    const toPts = (v) => (m?.unit === 'tick' ? Number(v) * TICK : Number(v));
    const startSl = m && toPts(m.sl) > 0 ? toPts(m.sl) : dflt;
    const memTp = m && m.tp !== '' && toPts(m.tp) > 0 ? toPts(m.tp) : null;
    // 1.7-5: „+TP” przy istniejących poziomach: nowy za najdalszym, w odstępie TP1 od wejścia; bez poziomów pamięć panelu albo 2× SL
    const tpOrd = tpOrder(p.dir, p.tps).filter((x) => !x.hit), tp1d = tpOrd.length ? Math.abs(tpOrd[0].price - p.avg) : 0, farTp = farthestTp(p.dir, p.tps);
    const startTp = farTp != null ? Math.abs(farTp - p.avg) + (tp1d > 0 ? tp1d : memTp ?? startSl) : memTp ?? 2 * (p.sl != null ? Math.abs(p.avg - p.sl) || startSl : startSl);
    // 1.7-3: próg auto BE do znacznika na wykresie (cena, offset) i domyślne miejsce po +BE: +1R, bez SL w połowie drogi do TP, a bez TP +10 pkt (ES/MES 2 pkt, jak +SL)
    const armed = p.autoBe && !p.autoBe.done ? p.autoBe : null, s = p.dir === 'Short' ? -1 : 1;
    let startAbe;
    if (p.rUsd > 0) startAbe = autoBePrice({ ...p, autoBe: { kind: 'r', value: 1 } });
    else if (p.tp != null) startAbe = p.avg + (p.tp - p.avg) / 2;
    else startAbe = p.avg + s * dflt;
    startAbe = q(startAbe);
    return { ...p, tpPlan: tpPlan(p), last: Number((rewound() && getRealLast ? getRealLast(k) : getLast(k))?.price), commission: Number(commission()) || 0, startSl, startTp, startAbe, beState: beState(b, k, getLast(k)), abePrice: armed ? autoBePrice(p) : null, beOffset: defOff() };
  }
  function label(o) { return `${o.intent === 'add' ? t('Dołóż') : o.side === 'buy' ? t('Kup') : t('Sprzedaj')} ${o.type} ${o.qty}× @ ${fx(o.price)}`; }

  refresh();
  return {
    refresh, submit, menuContext, placeAt, closeAll: closeNow, reverseFor, fromDrawing, syncDrawing, closeQty, closePct, beFor, setLevel, setTpPct, setTps, setAutoBe, lastFlash, choosePreset, activePresetId: () => activePreset()?.id ?? null, presetDirty: () => pDirty, cancel, moveOrder, setUnit, unit: () => unit, preview,
    // przegląd J P3-5: ilość zlecenia z rysunku przy ryzyku sesji i bieżącej cenie instrumentu (null, gdy zlecenia nie da się złożyć)
    drawingQty: (d, k = inst()) => orderFromDrawing(d, { last: getLast(k), instrument: k, riskUsd: sessionRisk(), tick: TICK }).order?.qty ?? null,
    destroy() { clearTimeout(flashTimer); el.removeEventListener('click', onClick); el.removeEventListener('input', onInput); el.remove(); },
  };
}
