// Konto replayu Backtest (pakiet L, 31.10.2026): otwarty wynik pozycji, saldo, equity, wynik dnia i sesji ($, %, R), podstawa ryzyka % i MAE/MFE na żywo.
// Czysty moduł (bez DOM), działa w przeglądarce i w Node. Słowa użytkownika (31.10.2026): «takze sposob egzekucji realziacji ma byc taki jak fx replay, u nas wgl
// nie widac profitu aktualnego ani nic, przemysl gleboko caly proces dzialania tego oraz wszystkich i popraw do poprawnego dzialania i wzoru z fx replay».
// Cena bieżąca = zamknięcie ostatniej widocznej świecy bazowej (last(k) z bt-replay.js), więc nic tu nie widzi przyszłości.
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 1: prowizja $ za kontrakt opcjonalna, domyślnie 0, bez spreadu i poślizgu)
// Prowizja: $ za kontrakt w obie strony (round turn), naliczana przy wyjściu (otwarta część: od razu w otwartym wyniku, jak na platformach). R zawsze z cen
// (definicja ryzyka i porównanie z Live, decyzja 6), $ netto.
// English: replay account: open P&L ($, R, points), balance, equity, day and session results, risk base (current/start balance), live MAE/MFE.
import { MULT, tradeResult, excursions, rUsdOf } from './bt-wypelnienia.js';
import { sgn } from './bt-ksiega.js';

const r2 = (x) => Math.round(x * 100) / 100 + 0; // + 0 zamienia −0 na 0
const nonneg = (x) => (Number.isFinite(+x) && +x > 0 ? +x : 0);
export const commissionOf = (def) => nonneg(def?.commission);
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 2: ryzyko % od bieżącego salda, wybór bieżące / startowe w kreatorze)
// Brak wyboru (sesja sprzed L) = bieżące.
export const riskBaseOf = (def) => (def?.riskBase === 'start' ? 'start' : 'current');

// Ryzyko pozycji w $ = jednostka R (rUsd z modelu 1.7: ryzyko pierwszego postawionego SL), 0 bez SL. Pozycja w kształcie 1.6 (bez rUsd) liczy po staremu z entryPrice i sl0.
const riskUsd = (p) => {
  if (p.rUsd !== undefined) return Number.isFinite(p.rUsd) ? p.rUsd : 0;
  const m = MULT[p.instrument] || 0, d = Math.abs(p.entryPrice - p.sl0);
  return Number.isFinite(d) && p.sl0 != null ? d * p.qty * m : 0;
};

// Otwarty wynik pozycji po cenie price: { pts (na kontrakt), usd (netto, otwarta ilość), r (z cen, od ryzyka całej pozycji), fee (prowizja otwartej części) }
export function openPL(pos, price, { commission = 0 } = {}) {
  if (!pos || !Number.isFinite(price)) return { pts: 0, usd: 0, r: 0, fee: 0 };
  const s = sgn(pos.dir), m = MULT[pos.instrument] || 0, q = pos.openQty ?? pos.qty;
  const pts = (price - pos.entryPrice) * s;
  const fee = nonneg(commission) * q;
  const risk = riskUsd(pos);
  // 1.7-1: bez SL (albo przy ryzyku pierwotnym 0) R jest null, a nie 0: plakietka i szuflada pokazują „—”
  return { pts: r2(pts), usd: r2(pts * m * q - fee), r: risk > 0 ? r2((pts * m * q) / risk) : null, fee: r2(fee) };
}

// Zrealizowany wynik częściowych wyjść otwartej pozycji (netto) i ich R; opcjonalnie tylko wyjścia od chwili since
function partialOf(pos, commission, since = -Infinity) {
  const s = sgn(pos.dir), m = MULT[pos.instrument] || 0, risk = riskUsd(pos);
  let usd = 0, gross = 0;
  for (const e of pos.exits || []) {
    if (!(e.t >= since)) continue;
    const g = (e.price - (Number.isFinite(e.basis) ? e.basis : pos.entryPrice)) * s * m * e.qty;
    gross += g; usd += g - nonneg(commission) * e.qty;
  }
  return { usd, r: risk > 0 ? gross / risk : 0 };
}

// Saldo, na którym liczy się ryzyko %: bieżące (start + zrealizowany netto, bez otwartego) albo startowe
export function riskBalance({ def, trades = [], book = null }) {
  const start = Number(def?.balance) || 0;
  if (riskBaseOf(def) === 'start') return start;
  let real = 0;
  for (const x of trades) real += Number.isFinite(x?.pnl) ? x.pnl : 0;
  for (const p of Object.values(book?.positions || {})) if (p) real += partialOf(p, commissionOf(def)).usd;
  return r2(start + real);
}
// Ryzyko na trade w $ z definicji sesji (USD albo % salda z riskBalance)
export function riskUsdOf({ def, trades = [], book = null }) {
  const r = def?.risk || {};
  if (r.mode === 'pct') return r2((riskBalance({ def, trades, book }) * Number(r.value)) / 100);
  return Number(r.value);
}

// Stan konta przy kursorze. last(k) → { t, price }, dayStart = otwarcie sesji CME kursora („dziś”).
// → { start, balance, realized, upl, equity, open: [{ instrument, dir, qty, qty0, entryPrice, last, pts, usd, r }], day: { usd, pct, r, n }, session: { usd, pct, r, n } }
export function account({ book, trades = [], def = {}, last, dayStart = -Infinity }) {
  const start = Number(def?.balance) || 0, com = commissionOf(def);
  let realized = 0, dayUsd = 0, dayR = 0, sesR = 0, dayN = 0, before = 0;
  for (const x of trades) {
    const p = Number.isFinite(x?.pnl) ? x.pnl : 0, r = Number.isFinite(x?.r) ? x.r : 0;
    realized += p; sesR += r;
    if (Number.isFinite(x?.exitT) && x.exitT >= dayStart) { dayUsd += p; dayR += r; dayN++; } else before += p;
  }
  const open = [];
  let upl = 0;
  for (const [k, p] of Object.entries(book?.positions || {})) {
    if (!p) continue;
    const px = last(k)?.price;
    const o = openPL(p, px, { commission: com });
    const all = partialOf(p, com), today = partialOf(p, com, dayStart);
    realized += all.usd; sesR += all.r; dayUsd += today.usd; dayR += today.r;
    before += all.usd - today.usd;
    upl += o.usd;
    open.push({ instrument: k, dir: p.dir, qty: p.openQty, qty0: p.qty, entryPrice: p.entryPrice, last: Number.isFinite(px) ? px : null, pts: o.pts, usd: o.usd, r: o.r });
  }
  const balance = start + realized, dayBase = start + before;
  return {
    start, balance: r2(balance), realized: r2(realized), upl: r2(upl), equity: r2(balance + upl), open,
    day: { usd: r2(dayUsd), pct: dayBase > 0 ? r2((dayUsd / dayBase) * 100) : 0, r: r2(dayR), n: dayN },
    session: { usd: r2(realized), pct: start > 0 ? r2((realized / start) * 100) : 0, r: r2(sesR), n: trades.length },
  };
}

// Procent pozycji → liczba kontraktów (zamknięcie 25/50/75/100% z linii pozycji): zaokrąglenie do całych, od 1 do otwartej ilości
export function pctQty(openQty, pct) {
  const q = Math.round((openQty * pct) / 100);
  return Math.min(openQty, Math.max(1, q));
}

// Plan zamknięcia części (okno „Zamknij część” przy plakietce wejścia, 31.10.2026 «od pozostałej / od pierwotnej», 25/50/75/100% albo wpisana ilość, podgląd „zamknie 5 z 10” i kwoty).
// partialPlan({ qty, openQty, base: 'open'|'orig', pct?, n?, price, avg, dir, instrument, commission }) → { n, of, usd, all }:
// n = ilość do zamknięcia (z procentu od pozostałej albo pierwotnej wielkości, albo wpisana; zawsze 1..openQty), of = otwarta ilość, usd = wynik NETTO tej części po cenie price,
// all = n obejmuje całą resztę (zamknięcie całości, powód manual). Gdy procent od pierwotnej wielkości przekracza resztę, n = cała reszta.
export function partialPlan({ qty, openQty, base = 'open', pct = null, n = null, price, avg, dir, instrument, commission = 0 }) {
  const open = Math.max(0, Math.floor(Number(openQty) || 0));
  const full = Math.max(open, Math.floor(Number(qty) || 0));
  let want;
  if (Number.isFinite(Number(n)) && n !== null) want = Math.floor(Number(n));
  else want = Math.round(((base === 'orig' ? full : open) * (Number(pct) || 0)) / 100);
  const k = open > 0 ? Math.min(open, Math.max(1, want)) : 0;
  const s = sgn(dir), m = MULT[instrument] || 0;
  const usd = Number.isFinite(price) && Number.isFinite(avg) ? r2((price - avg) * s * m * k - nonneg(commission) * k) : null;
  return { n: k, of: open, usd, all: k >= open && open > 0 };
}

// MAE/MFE otwartej pozycji w R ze świec bazowych zakończonych do chwili eff (t + len ≤ eff). Bufor danych replayu sięga za kursor, więc bez tej granicy
// excursions() z bt-wypelnienia.js (pozycja bez wyjścia = do końca strumienia) pokazałby przyszłość.
export function liveExcursions(pos, stream, eff) {
  return scan(pos, stream, eff, 0, 0, 0).out;
}
function scan(pos, stream, eff, from, lo0, hi0) {
  // 1.7-1: MAE/MFE na wyniku pozycji w $ (zrealizowany + otwarty) / rUsd; z wyjściami częściowymi albo kilkoma wejściami liczy to pełne excursions (bez przyrostu)
  if ((pos.exits || []).length || (pos.fills || []).length > 1) return { i: from, lo: lo0, hi: hi0, out: excursions(pos, stream, { eff }), full: true };
  const s = sgn(pos.dir), ru = pos.rUsd !== undefined ? rUsdOf(pos) : null, m = MULT[pos.instrument] || 0;
  const risk = ru > 0 && pos.qty > 0 && m > 0 ? ru / (pos.qty * m) : Math.abs(pos.entryPrice - pos.sl0);
  let lo = lo0, hi = hi0, i = from;
  const bars = stream?.bars || [], len = stream?.len || [];
  for (; i < bars.length; i++) {
    const b = bars[i], end = b[0] + len[i];
    if (end > eff) break;
    if (!(end > pos.entryT)) continue;
    const dh = (b[2] - pos.entryPrice) * s, dl = (b[3] - pos.entryPrice) * s;
    lo = Math.min(lo, dh, dl); hi = Math.max(hi, dh, dl);
  }
  for (const e of pos.exits || []) { const d = (e.price - pos.entryPrice) * s; lo = Math.min(lo, d); hi = Math.max(hi, d); }
  const ok = Number.isFinite(risk) && risk > 0 && (pos.rUsd !== undefined ? ru > 0 : pos.sl0 != null);
  return { i, lo, hi, out: ok ? { maeR: r2(lo / risk), mfeR: r2(hi / risk) } : { maeR: null, mfeR: null } };
}
// Przyrostowo (szuflada pozycji przy każdej klatce odtwarzania): pamięć per pozycja i strumień; cofnięcie albo zmiana okna danych liczy od nowa
export function createExcursionTracker() {
  const mem = new Map(), full = new Map();
  return {
    get(pos, stream, eff) {
      const m = mem.get(pos.id);
      // z wyjściami częściowymi albo kilkoma wejściami: pełne excursions, ale ze stanem przyrostowym (wznawia od ostatniej świecy, nie od początku strumienia)
      if ((pos.exits || []).length || (pos.fills || []).length > 1) {
        let st = full.get(pos.id);
        if (!st) full.set(pos.id, (st = {}));
        return excursions(pos, stream, { eff, state: st });
      }
      const fresh = !m || m.stream !== stream || m.n !== (stream?.bars?.length ?? 0) || m.first !== stream?.bars?.[0]?.[0] || eff < m.eff || m.ex !== (pos.exits || []).length;
      const r = fresh ? scan(pos, stream, eff, 0, 0, 0) : scan(pos, stream, eff, m.i, m.lo, m.hi);
      mem.set(pos.id, { stream, n: stream?.bars?.length ?? 0, first: stream?.bars?.[0]?.[0], eff, i: r.i, lo: r.lo, hi: r.hi, ex: (pos.exits || []).length });
      return r.out;
    },
    clear() { mem.clear(); full.clear(); },
  };
}

// Wynik zamkniętego trade'a z prowizją: pnl netto i fee (prowizja × ilość); R z cen bez zmian
export function netResult(pos, commission = 0) {
  const res = tradeResult(pos);
  const fee = r2(nonneg(commission) * (pos.qty || 0));
  return { ...res, fee, pnl: res.pnl == null ? null : r2(res.pnl - fee) };
}
