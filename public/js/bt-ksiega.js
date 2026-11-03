// Księga pozycji 1.7.0 (pakiet 1.7-1 „Pozycja na wykresie”): jedyne miejsce, które liczy lustro pozycji ze zdarzeń (`derive`) i migruje księgę 1.6.x do wersji 3 (`migrateBook`).
// Czysty moduł (bez DOM, bez I/O), działa w przeglądarce i w Node (bt-sesja.js importuje go po stronie serwera, więc nie ma tu zależności od rysunków ani wykresu).
// Model: docs/plany/backtest/1.7.0/model-pozycji-1-7.md. Pozycja = lista zdarzeń (wejścia `fills`, wyjścia `exits`, zmiany SL/TP w `log`) z czasami `t` (rynkowy) i `at`
// (chwila, w której zdarzenie stało się znane), a pola dzisiejszego kodu (qty, openQty, entryPrice, entryT, avg, tp, be, rUsd) są lustrem liczonym tutaj.
// English: position book model 1.7 — derive() mirrors, migrateBook() lifts a 1.6.x book to version 3 (idempotent, pure).
import { sanitizeTps, farthestTp, isNum, objs } from './bt-drabinka.js';

export const MULT = { ES: 50, NQ: 20, MES: 5, MNQ: 2 };
export const TICK = 0.25;
export const BOOK_V = 3;

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const rt = (p, tick = TICK) => (Number.isFinite(p) ? Number((Math.round(p / tick) * tick).toFixed(6)) : null);
const r6 = (x) => (Number.isFinite(x) ? Number(x.toFixed(6)) : x);
export const sgn = (dir) => (dir === 'Short' ? -1 : 1);
const plain = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : null);

// Porcje wejścia pozycji; pozycja 1.6 (bez `fills`) ma jedną porcję z ceny wejścia i pierwszego znanego SL (P5)
export function fillsOf(pos) {
  if (Array.isArray(pos?.fills) && pos.fills.length) return objs(pos.fills);
  if (!pos || !isNum(pos.entryPrice)) return [];
  return [{ t: pos.entryT, at: pos.entryT, price: pos.entryPrice, qty: pos.qty, orderId: pos.orderId ?? null, slRef: pos.sl0 ?? null }];
}

// Jednostka R w $ (§3.3): Σ ilość · |cena − slRef| · mnożnik; null, dopóki jakakolwiek porcja nie ma SL odniesienia (R „—”)
export function rUsdOf(pos) {
  const fills = fillsOf(pos), m = MULT[pos?.instrument] || 0;
  if (!fills.length || fills.some((f) => f.slRef == null || !isNum(f.slRef))) return null;
  return r6(fills.reduce((a, f) => a + f.qty * Math.abs(f.price - f.slRef) * m, 0));
}

// Poziom BE (§3.4): średnia zaokrąglona do ticka W STRONĘ ZYSKU (Long w górę, Short w dół)
export function beLevel(pos) {
  const avg = isNum(pos?.avg) ? pos.avg : pos?.entryPrice;
  if (!isNum(avg)) return null;
  const k = avg / TICK, up = pos.dir !== 'Short';
  // 1e-9: średnia leżąca już na tiku nie przeskakuje o tick przez błąd zmiennoprzecinkowy
  const n = up ? Math.ceil(k - 1e-9) : Math.floor(k + 1e-9);
  return Number((n * TICK).toFixed(6));
}

// Auto-BE (pakiet 1.7-3, model §2.5 i §3.5): rodzaje progu i granica offsetu (ticki). 'price' = cena wprost, 'pts' i 'ticks' = odległość od średniej w stronę zysku,
// 'usd' = zysk otwartej części w $, 'r' = wielokrotność ryzyka pozycji (rUsd).
export const AUTOBE_KINDS = ['r', 'pts', 'ticks', 'usd', 'price'];
export const AUTOBE_OFFSET_MAX = 20;

// Cena progu auto-BE (czysta; dla znacznika, podglądu i silnika) albo null, gdy nie da się jej policzyć (brak autoBe, R bez rUsd, brak otwartej ilości).
// Odstępstwo od wzoru w modelu §3.5: R liczy się od CAŁKOWITEGO ryzyka i ilości wejść (rUsd / (qty · mnożnik)), a nie od otwartej ilości, bo karta (krawędź 8) każe zostawić próg w R bez zmiany
// po wyjściu częściowym; próg w $ przelicza się od otwartej ilości. Dokładka przelicza oba od nowej średniej, rUsd i qty.
export function autoBePrice(pos) {
  const a = pos?.autoBe;
  if (!a || !isNum(a.value)) return null;
  const avg = isNum(pos.avg) ? pos.avg : pos.entryPrice, s = sgn(pos.dir), m = MULT[pos.instrument] || 0;
  if (!isNum(avg)) return null;
  let px = null;
  switch (a.kind) {
    case 'price': px = a.value; break;
    case 'pts': px = avg + s * a.value; break;
    case 'ticks': px = avg + s * a.value * TICK; break;
    case 'usd': px = pos.openQty > 0 && m > 0 ? avg + (s * a.value) / (pos.openQty * m) : null; break;
    case 'r': px = isNum(pos.rUsd) && pos.rUsd > 0 && pos.qty > 0 && m > 0 ? avg + (s * a.value * pos.rUsd) / (pos.qty * m) : null; break;
    default: px = null;
  }
  // cena progu na siatce ticka, w stronę zysku (Long w górę, Short w dół): moment wyzwolenia ten sam, bo rynek stoi tylko na tickach (przegląd wyglądu P3-4)
  return isNum(px) ? r6(s > 0 ? Math.ceil(px / TICK - 1e-9) * TICK : Math.floor(px / TICK + 1e-9) * TICK) : null;
}

// Trade zamknięty stopem z luką pod poziomem BE po wyzwoleniu auto-BE: { sl, exit } (SL stał na BE, wyjście po gorszej cenie), inaczej null. Dla faktu w Journalu (runda 2 pakietu 1.7-3, gust).
export function gapUnderBe(tr) {
  const e = objs(tr?.log).filter((l) => l.k === 'be-auto' && l.v && typeof l.v === 'object' && l.v.changed !== false).pop();
  const ex = objs(tr?.exits).at(-1);
  if (!e || !ex || ex.reason !== 'sl' || !isNum(e.v.sl) || !isNum(ex.price) || tr.sl !== e.v.sl) return null;
  return sgn(tr.dir) * (ex.price - e.v.sl) < 0 ? { sl: e.v.sl, exit: ex.price } : null;
}

// Kolejny numer zdarzenia pozycji (wejście albo wyjście), liczony z danych: bez osobnego licznika w pozycji
// Pętla zamiast Math.max(...spread): przy bardzo długiej liście porcji spread rzuca RangeError (audyt P3-1); nie-liczby w seq są pomijane
export function nextSeq(pos) {
  let m = 0;
  for (const x of [...objs(pos?.fills), ...objs(pos?.exits)]) if (Number.isFinite(x.seq) && x.seq > m) m = x.seq;
  return m + 1;
}

// Ryzyko teraz w $ (§3.2): |średnia − SL| · otwarta ilość · mnożnik; null bez SL
export function riskNow(pos) {
  if (!pos || !isNum(pos.sl) || !isNum(pos.avg)) return null;
  return r6(Math.abs(pos.avg - pos.sl) * pos.openQty * (MULT[pos.instrument] || 0));
}

// derive(pos) → NOWA pozycja z lustrem policzonym ze zdarzeń; wejścia nie mutuje. Idempotentne.
export function derive(pos) {
  const p = { ...pos };
  const fills = fillsOf(pos);
  p.fills = fills;
  p.exits = objs(pos.exits).map((e) => ({ ...e }));
  p.log = objs(pos.log);
  p.tps = pos.tps !== undefined ? objs(pos.tps) : (pos.tp != null ? [{ id: 'tp1', price: pos.tp, pct: 100, hit: null }] : []);
  p.autoBe = pos.autoBe ?? null;
  // beAt = cena, przy której trade stał się bez ryzyka (cena progu auto-BE albo cena bieżąca przy ręcznym BE); tak samo znaczy pole „BE” w dzienniku
  p.beAt = isNum(pos.beAt) ? pos.beAt : null;
  p.sl = pos.sl ?? null;
  p.sl0 = pos.sl0 ?? null;
  p.sl0T = pos.sl0T ?? null;
  p.slLast = pos.slLast !== undefined ? pos.slLast : (pos.sl ?? null);
  p.qty = fills.reduce((a, f) => a + f.qty, 0);
  const exited = p.exits.reduce((a, e) => a + e.qty, 0);
  p.openQty = p.qty - exited;
  // metoda średniego kosztu (§3.1): dokładka przelicza średnią, wyjście jej nie zmienia
  // 1.7-2: przy równych czasach rozstrzyga `seq` (kolejność zdarzeń nadana przez silnik: wyjście i dokładka w tej samej chwili), bez `seq` (księga 1.6/1.7-1) wejście przed wyjściem
  const ev = [...fills.map((f) => ({ k: 0, t: f.t, s: f.seq ?? 0, f })), ...p.exits.map((e) => ({ k: 1, t: e.t, s: e.seq ?? 0, e }))].sort((a, b) => a.t - b.t || a.s - b.s || a.k - b.k);
  let q = 0, avg = fills.length ? fills[0].price : null;
  for (const x of ev) {
    if (x.k === 0) { avg = q > 0 && isNum(avg) ? (q * avg + x.f.qty * x.f.price) / (q + x.f.qty) : x.f.price; q += x.f.qty; } else q -= x.e.qty;
  }
  p.avg = isNum(avg) ? r6(avg) : avg;
  p.entryPrice = p.avg;
  p.entryT = fills.length ? fills[0].t : pos.entryT;
  // najdalszy poziom drabiny (wspólna funkcja z bt-drabinka.js: pętla zamiast Math.min/max(...), więc setki tysięcy elementów nie przepełniają stosu)
  p.tp = farthestTp(p.dir, p.tps);
  p.rUsd = rUsdOf(p);
  p.be = p.sl != null && isNum(p.avg) && p.sl === beLevel(p);
  return p;
}

// Księga 1.6.x → 3 (§6.1). Czysta i idempotentna; trade'ów nie rusza (czytniki liczą brakujące `fills` w locie).
export function migrateBook(book) {
  const b = plain(clone(book)) || {};
  b.orders = objs(b.orders);
  b.positions = { ES: null, NQ: null, MES: null, MNQ: null, ...(plain(b.positions) || {}) };
  for (const k of Object.keys(b.positions)) if (!plain(b.positions[k])) b.positions[k] = null;
  b.hw = b.hw ?? 0; b.hwi = b.hwi || {}; b.seq = b.seq ?? 0;
  b.v = BOOK_V;
  // [U] 3.11.2026 «wywalamy to cofniecie czasu usuwa trade, zbedne, mam usuwanie juz manualne wiec jak bede chcial to usune» (pakiet 6 odwołany, decyzja sesji głównej 3.11.2026):
  // `book.gone` i `order.hist` nie są już zapisywane (nikt ich nie czytał, 500 wpisów = 617 KB w pliku sesji); stare pliki z tymi polami wczytują się dalej, a przy zapisie pola znikają
  delete b.gone;
  for (const o of b.orders) {
    o.intent = o.intent || 'open';
    if (!Array.isArray(o.tps)) o.tps = o.tp != null ? [{ id: 'tp1', price: o.tp, pct: 100, hit: null }] : [];
    else o.tps = sanitizeTps(o.side === 'sell' ? 'Short' : 'Long', o.tps);
    delete o.hist;
  }
  for (const k of Object.keys(b.positions)) {
    const p = b.positions[k];
    if (!p) continue;
    if (!Array.isArray(p.fills)) {
      // P5 dla otwartej pozycji 1.6.x: sl0 brak, a sl jest → sl0 = sl (pierwszy znany SL), sl0T = chwila wejścia
      let sl0 = p.sl0 ?? null, sl0T = p.sl0T ?? null;
      if (sl0 == null && p.sl != null) { sl0 = p.sl; sl0T = p.entryT; }
      p.fills = [{ t: p.entryT, at: p.entryT, price: p.entryPrice, qty: p.qty, orderId: p.orderId ?? null, slRef: sl0 }];
      p.exits = objs(p.exits).map((e) => ({ ...e, at: e.at ?? e.t, basis: e.basis ?? p.entryPrice }));
      p.tps = Array.isArray(p.tps) ? objs(p.tps) : (p.tp != null ? [{ id: 'tp1', price: p.tp, pct: 100, hit: null }] : []);
      p.log = p.log || [];
      p.sl0 = sl0; p.sl0T = sl0T ?? (sl0 != null ? p.entryT : null);
      p.slLast = p.slLast ?? p.sl ?? sl0;
    }
    // runda 2 (bezpieczeństwo P3-1): drabina z pliku przechodzi normalizację, zanim silnik jej zaufa (brak `tps` zostaje: derive zbuduje z `tp`)
    if (Array.isArray(p.tps)) p.tps = sanitizeTps(p.dir, p.tps);
    b.positions[k] = derive(p);
  }
  return b;
}
