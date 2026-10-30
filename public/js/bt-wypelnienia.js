// Replay modułu Backtest (1.5.0): silnik wypełnień. Czysty moduł (bez DOM, bez I/O), działa w przeglądarce i w Node.
// Liczy na strumieniu bazowym z bt-swieca.js (1s w oknie prawdziwych sekund, 1m poza nim), nigdy na sekundach syntetyzowanych z 1m (§5).
// Reguły (§7 [S] i karta B2 [B]):
// - market: natychmiast po last.price, entryT = last.t; last = { t: chwila bieżąca (kursor), price: zamknięcie ostatniej widocznej świecy bazowej };
// - limit i TP: przy dotknięciu po cenie limitu, także przy luce; stop (wejście i SL): po cenie wyzwolenia, przy luce po open świecy (gorsza cena);
// - SL i TP w tej samej świecy → SL; w świecy wejścia sprawdzany jest tylko SL;
// - jedna pozycja na instrument (18a.3), ES/NQ/MES/MNQ niezależnie; wypełnienie wejścia anuluje pozostałe oczekujące wejścia instrumentu;
// - znak wodny: advance przetwarza tylko świece z t + len > hw i t + len ≤ kursor, cofnięcie niczego nie cofa ani nie liczy drugi raz;
//   handel przy last.t < hw → rejected 'rewound';
// - R z ceny wejścia i pierwotnego SL (sl0), ważone ilością częściowych wyjść; USD z mnożnika; bez prowizji i poślizgu (nie-cel).
// Funkcje nie mutują wejściowego book: zwracają nowy obiekt { book, events }.
// English: order fill engine for the replay (market/limit/stop, SL/TP, BE, partial closes, R/USD, MAE/MFE) on the base candle stream.
import { visibleCount } from './bt-swieca.js';
import { roundTick } from './rysunki.js';

export const MULT = { ES: 50, NQ: 20, MES: 5, MNQ: 2 };
export const TICK = 0.25;

const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));
const r2 = (x) => Math.round(x * 100) / 100 + 0; // + 0 zamienia −0 na 0
const num = (x) => (x === null || x === undefined || x === '' ? null : Number.isFinite(+x) ? roundTick(+x, TICK) : NaN);
const sgn = (dir) => (dir === 'Short' ? -1 : 1);
const rej = (book, reason, extra = {}) => ({ book, events: [{ type: 'rejected', reason, ...extra }] });
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
  return { orders: [], positions: { ES: null, NQ: null, MES: null, MNQ: null }, hw: 0, hwi: {}, seq: 0 };
}

// SL po właściwej stronie ceny odniesienia (Long: poniżej, Short: powyżej), TP po przeciwnej. Równość jest zła (wyjście w następnej świecy bez ruchu ceny).
const slOk = (dir, sl, ref) => !Number.isFinite(ref) || (dir === 'Long' ? sl < ref : sl > ref);
const tpOk = (dir, tp, ref) => !Number.isFinite(ref) || (dir === 'Long' ? tp > ref : tp < ref);

function openPosition(b, o, t, price, events) {
  b.seq += 1;
  const dir = o.side === 'buy' ? 'Long' : 'Short';
  const pos = {
    id: `p${b.seq}`, instrument: o.instrument, dir, qty: o.qty, openQty: o.qty, entryT: t, entryPrice: price,
    sl0: o.sl, sl: o.sl, tp: o.tp, be: false, exits: [], orderId: o.id || null,
  };
  // J (przegląd P2-1): zlecenie złożone według rysunku niesie id rysunku także w pozycji (blokada drugiego wejścia z tego samego rysunku)
  if (o.fromDrawing) pos.fromDrawing = String(o.fromDrawing);
  b.positions[o.instrument] = pos;
  events.push({ type: 'filled', order: o, position: clone(pos) });
  // [B] wypełnienie jednego wejścia anuluje pozostałe oczekujące wejścia tego instrumentu
  const keep = [];
  for (const x of b.orders) {
    if (x.instrument === o.instrument && x.id !== o.id) events.push({ type: 'cancelled', order: x, reason: 'filled-other' });
    else if (x.id !== o.id) keep.push(x);
  }
  b.orders = keep;
  return pos;
}

// Wyjście qty kontraktów po cenie price; przy openQty = 0 pozycja znika z Book z wynikiem (zdarzenie closed niesie pełną Position).
function exitPosition(b, inst, qty, t, price, reason, events) {
  const pos = b.positions[inst];
  pos.exits.push({ t, price, qty, reason });
  pos.openQty -= qty;
  events.push({ type: 'exit', instrument: inst, positionId: pos.id, exit: { t, price, qty, reason } });
  if (pos.openQty <= 0) {
    pos.openQty = 0;
    Object.assign(pos, tradeResult(pos));
    b.positions[inst] = null; // zamknięta pozycja żyje tylko w zdarzeniu 'closed' i w trade'ach sesji (Book nie trzyma historii)
    events.push({ type: 'closed', position: clone(pos) });
  }
}

// placeOrder(book, order, last) → { book, events }. Order = { id?, instrument, side: 'buy'|'sell', type: 'market'|'limit'|'stop', price?, qty, sl, tp }.
// Ceny zaokrąglane do ticka 0,25. Zlecenie oczekujące (limit/stop) nie daje zdarzenia, trafia do book.orders.
export function placeOrder(book, order, last) {
  const b = clone(book);
  const o = { ...order };
  if (!MULT[o.instrument]) return rej(b, 'bad-instrument', { order });
  if (isRewound(b, last, o.instrument)) return rej(b, 'rewound', { order });
  if (b.positions[o.instrument]) return rej(b, 'position-open', { order });
  if (!Number.isInteger(o.qty) || o.qty < 1) return rej(b, 'bad-qty', { order });
  if (o.side !== 'buy' && o.side !== 'sell') return rej(b, 'bad-side', { order });
  if (!['market', 'limit', 'stop'].includes(o.type)) return rej(b, 'bad-type', { order });
  const lp = Number(last?.price);
  if (o.type === 'market' && !Number.isFinite(lp)) return rej(b, 'bad-price', { order });
  const dir = o.side === 'buy' ? 'Long' : 'Short';
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
  if (Number.isNaN(o.sl) || (o.sl !== null && !slOk(dir, o.sl, o.price))) return rej(b, 'bad-sl', { order });
  if (Number.isNaN(o.tp) || (o.tp !== null && !tpOk(dir, o.tp, o.price))) return rej(b, 'bad-tp', { order });
  const t = Number.isFinite(last?.t) ? last.t : null;
  b.seq += 1;
  if (!o.id) o.id = `o${b.seq}`;
  o.placedT = t;
  const events = [];
  if (o.type === 'market') openPosition(b, o, t, o.price, events);
  else b.orders.push(o);
  return { book: b, events };
}

export function cancelOrder(book, id) {
  const b = clone(book);
  b.orders = b.orders.filter((o) => o.id !== id);
  return b;
}

// modifyPosition(book, inst, { sl?, tp? }, last?) → { book, events }. tp: null usuwa TP. Z last sprawdzana strona ceny bieżącej (bad-sl / bad-tp).
// be = (sl === cena wejścia); R nadal z sl0.
export function modifyPosition(book, inst, changes = {}, last) {
  const b = clone(book);
  const pos = b.positions[inst];
  if (!pos) return rej(b, 'no-position', { instrument: inst });
  if (isRewound(b, last, inst)) return rej(b, 'rewound', { instrument: inst });
  const ref = Number(last?.price);
  let sl = pos.sl, tp = pos.tp;
  if ('sl' in changes) {
    sl = num(changes.sl);
    if (sl === null || Number.isNaN(sl) || !slOk(pos.dir, sl, ref)) return rej(b, 'bad-sl', { instrument: inst });
  }
  if ('tp' in changes) {
    tp = num(changes.tp);
    if (Number.isNaN(tp) || (tp !== null && !tpOk(pos.dir, tp, ref))) return rej(b, 'bad-tp', { instrument: inst });
  }
  pos.sl = sl; pos.tp = tp; pos.be = sl === pos.entryPrice;
  return { book: b, events: [] };
}

export function moveToBE(book, inst, last) {
  const p = book.positions[inst];
  if (!p) return rej(clone(book), 'no-position', { instrument: inst });
  return modifyPosition(book, inst, { sl: p.entryPrice }, last);
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
  exitPosition(b, inst, qty, last.t, roundTick(last.price, TICK), qty === pos.openQty ? 'manual' : 'partial', events);
  return { book: b, events };
}

// closeAll(book, inst, last, reason = 'manual'): zamyka pozycję instrumentu po last.price i anuluje jego oczekujące zlecenia (np. koniec dnia: 'eod').
export function closeAll(book, inst, last, reason = 'manual') {
  const b = clone(book);
  if (isRewound(b, last, inst)) return rej(b, 'rewound', { instrument: inst });
  const events = [];
  if (b.positions[inst]) {
    if (!Number.isFinite(last?.price)) return rej(b, 'bad-price', { instrument: inst });
    exitPosition(b, inst, b.positions[inst].openQty, last.t, roundTick(last.price, TICK), reason, events);
  }
  const keep = [];
  for (const o of b.orders) {
    if (o.instrument === inst) events.push({ type: 'cancelled', order: o, reason });
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
const tpHit = (pos, bar) => pos.tp !== null && pos.tp !== undefined && (pos.dir === 'Long' ? bar[2] >= pos.tp : bar[3] <= pos.tp);
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
    let pos = b.positions[inst];
    if (pos) {
      if (!(end > pos.entryT)) continue; // świeca sprzed wejścia (market przy kursorze)
      // §7: SL i TP w tej samej świecy → SL
      if (slHit(pos, bar)) exitPosition(b, inst, pos.openQty, bar[0], slPrice(pos, bar, false), 'sl', events);
      else if (tpHit(pos, bar)) exitPosition(b, inst, pos.openQty, bar[0], pos.tp, 'tp', events);
      continue;
    }
    // wejścia oczekujące w kolejności złożenia; pierwsze wyzwolone wygrywa
    for (const o of b.orders) {
      if (o.instrument !== inst || (Number.isFinite(o.placedT) && !(end > o.placedT))) continue;
      const px = entryFill(o, bar);
      if (px === null) continue;
      pos = openPosition(b, o, bar[0], px, events);
      // w świecy wejścia tylko SL (TP od następnej świecy)
      if (slHit(pos, bar)) exitPosition(b, inst, pos.openQty, bar[0], slPrice(pos, bar, true), 'sl', events);
      break;
    }
  }
  b.hwi[inst] = cursor;
  b.hw = Math.max(b.hw || 0, cursor);
  return { book: b, events };
}

// Wynik pozycji (także częściowo zamkniętej: liczy tylko wykonane wyjścia).
// R = Σ qty_i·(exit_i − entry)·s / (qty·|entry − sl0|), USD = Σ (exit_i − entry)·s·MULT·qty_i, oba do 0,01. exitPrice = średnia ważona ilością.
export function tradeResult(pos) {
  const s = sgn(pos.dir), m = MULT[pos.instrument] || 0, ex = pos.exits || [];
  if (!ex.length) return { r: null, pnl: null, exitPrice: null, exitT: null };
  let pts = 0, q = 0, wsum = 0;
  for (const e of ex) { pts += e.qty * (e.price - pos.entryPrice) * s; q += e.qty; wsum += e.qty * e.price; }
  const risk = Math.abs(pos.entryPrice - pos.sl0);
  return {
    r: Number.isFinite(risk) && risk > 0 && pos.sl0 !== null ? r2(pts / (pos.qty * risk)) : null,
    pnl: r2(pts * m),
    exitPrice: Number((wsum / q).toFixed(6)),
    exitT: ex[ex.length - 1].t,
  };
}

// MAE/MFE w R: najgorsze i najlepsze odchylenie ceny od wejścia między wejściem a wyjściem, w jednostkach |entry − sl0|; MAE ≤ 0, MFE ≥ 0.
// Świece bazowe od świecy wejścia (t + len > entryT) do świecy wyjścia: włącznie, gdy wyjście przyszło ze świecy (sl/tp), a przy wyjściu
// ręcznym/eod po last (t = kursor) tylko świece zaczęte przed nim. W świecy wyjścia po SL strata nie sięga dalej niż cena wyjścia, po TP zysk nie dalej niż TP.
export function excursions(pos, stream) {
  const s = sgn(pos.dir), risk = Math.abs(pos.entryPrice - pos.sl0);
  if (!Number.isFinite(risk) || risk <= 0 || pos.sl0 === null) return { maeR: null, mfeR: null };
  const ex = pos.exits || [];
  const lastEx = ex[ex.length - 1];
  const exitT = lastEx ? lastEx.t : Infinity;
  const fromBar = lastEx && (lastEx.reason === 'sl' || lastEx.reason === 'tp');
  let lo = 0, hi = 0; // w punktach, ze znakiem kierunku
  const see = (p) => { const d = (p - pos.entryPrice) * s; if (d < lo) lo = d; if (d > hi) hi = d; };
  for (const e of ex) see(e.price);
  const bars = stream?.bars || [];
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i], t = bar[0];
    if (!(t + stream.len[i] > pos.entryT)) continue;
    // wyjście ręczne/eod: tylko świece zakończone do chwili wyjścia (świeca w budowie to przyszłość: kursor bywa ułamkowy); wyjście ze świecy: włącznie z nią
    if (fromBar ? t > exitT : t + stream.len[i] > exitT) break;
    let h = bar[2], l = bar[3];
    if (fromBar && t === exitT) {
      const adverse = lastEx.reason === 'sl', px = lastEx.price;
      if (s > 0) { if (adverse) l = Math.max(l, px); else h = Math.min(h, px); }
      else if (adverse) h = Math.min(h, px); else l = Math.max(l, px);
    }
    see(h); see(l);
  }
  return { maeR: r2(lo / risk), mfeR: r2(hi / risk) };
}
