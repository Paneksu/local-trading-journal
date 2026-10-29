// Dane kart „Udostępnij” (trade, dzień, tydzień, miesiąc, rok). Czyste funkcje na wyjściu normalizeTrades i normalizeKonta,
// bez DOM i bez tłumaczeń: napisy i formatowanie są w udostepnij-render.js.
// Wartość karty liczona jest w trzech jednostkach naraz (R, $, % konta), żeby przełącznik w oknie nie liczył danych od nowa.
// English: pure data builders for the share cards.
import { calc, byDay, outcome, sortChrono, cfg } from './stats.js';
import { addDays, weekdayIdx, parseKey, daysInMonth, pad } from './format.js';

const EPS = 1e-9;
export const METRICS = ['R', '$', '%'];

// Wynik zestawu wartości {R, $, %} z marginesem BE jak w aplikacji (kalendarz, renderCalendar: cfg.beR dla R i cfg.beUsd dla $;
// wynik w marginesie to remis, nie zielony ani czerwony). % konta nie ma własnego marginesu: o znaku decyduje $ (z marginesem $),
// a bez $ sam znak. Zwraca 'win' | 'loss' | 'be' | null (brak wartości). Uwaga z przeglądu kodu 26.10.2026.
export function signOf(v, metric) {
  const x = v?.[metric];
  if (x == null || !isFinite(x)) return null;
  const useUsd = metric === '%' && v.$ != null;
  const val = useUsd ? v.$ : x;
  const margin = metric === 'R' ? cfg.beR : metric === '$' || useUsd ? cfg.beUsd : 0;
  const th = Math.max(EPS, margin);
  return val > th ? 'win' : val < -th ? 'loss' : 'be';
}

// Recapy (dzień, tydzień, miesiąc, rok) liczą wyłącznie trade'y Live z wynikiem (ustalenie użytkownika 26.10.2026: „recapy tylko Live”).
export const liveOnly = (trades) => trades.filter((t) => t.typ === 'Live' && t.counted);

// Każde konto z relacji ma rozmiar (> 0)? Trade bez kont albo z kontem bez rozmiaru nie ma uczciwego % konta.
const allSized = (ids, kontaById) => ids.length > 0 && ids.every((id) => kontaById.get(id)?.size > 0);

// % konta = P&L $ / suma rozmiarów kont, na których był trade (każde konto liczone raz, nawet przy kilku trade'ach).
// null, gdy którekolwiek konto któregokolwiek trade'a z P&L nie ma rozmiaru (albo trade nie ma konta): licznik (P&L) obejmowałby
// wtedy konto, którego rozmiaru nie ma w mianowniku, więc procent byłby zawyżony i go nie pokazujemy (przegląd kodu 26.10.2026).
// Trade podpięty do kilku kont (kopiowanie): P&L w Notion to suma ze wszystkich kont, więc dzielimy przez sumę ich rozmiarów
// (słowa użytkownika 26.10.2026: «Suma ze wszystkich kont»).
// Przegląd HIJ, pkt 8 (29.10.2026): jedna funkcja na licznik i mianownik (pctOf karty i equityCurve krzywej), żeby reguła pieniężna nie rozjechała się w dwóch miejscach.
// pctBase: { pnl, size } albo null (brak trade'a z P&L albo konto bez rozmiaru).
export function pctBase(trades, kontaById) {
  const withPnl = trades.filter((t) => t.pnl != null);
  if (!withPnl.length) return null;
  const ids = new Set();
  let pnl = 0;
  for (const t of withPnl) {
    if (!allSized(t.konta, kontaById)) return null;
    for (const id of t.konta) ids.add(id);
    pnl += t.pnl;
  }
  let size = 0;
  for (const id of ids) size += kontaById.get(id).size;
  return { pnl, size };
}
export function pctOf(trades, kontaById) {
  const b = pctBase(trades, kontaById);
  return b && b.size ? (b.pnl / b.size) * 100 : null;
}

// Wynik zestawu trade'ów w trzech jednostkach. R i $ z byDay/calc (te same sumy co w statystykach).
export function valuesOf(trades, kontaById) {
  const c = calc(trades);
  return { R: c.nR ? c.sumR : null, $: c.hasPnl ? c.sumPnl : null, '%': pctOf(trades, kontaById) };
}

const kontaMap = (konta) => (konta instanceof Map ? konta : new Map((konta || []).map((k) => [k.id, k])));
const inRange = (trades, from, to) => trades.filter((t) => t.date >= from && t.date <= to);
const pick = (v, metric) => v[metric] ?? null;

// Wspólne liczby recapu: trade'y, win rate (bez BE), wynik.
// Etap 16 (pakiet I): okres z trade'ami dostaje krzywą kapitału (curve); pusty okres bez niej (karta jak dotąd).
function base(trades, kontaById) {
  const c = calc(trades);
  const out = { n: c.n, wins: c.wins, losses: c.losses, be: c.be, winRate: c.winRate, v: valuesOf(trades, kontaById) };
  if (c.n) out.curve = equityCurve(trades, kontaById);
  // Karty v2 (P47, P52): wynik każdego trade'a okresu w trzech jednostkach (najlepszy i najgorszy trade, średni R, profit factor w wierszach do wyboru)
  out.tv = sortChrono(trades).map((t) => ({ instrument: t.instrument, dir: t.dir, date: t.date, time: t.time, v: valuesOf([t], kontaById) }));
  return out;
}

// Etap 16: krzywa kapitału karty okresu. Trade'y (już tylko Live okresu) w kolejności czasu (sortChrono), wynik narastająco w trzech jednostkach,
// z punktem startowym 0 (jak equityPoints w stats.js: trade bez R albo P&L dodaje 0). Jednostka bez wartości w okresie (valuesOf → null) ma null w każdym punkcie.
// % konta: P&L narastająco / suma rozmiarów kont całego okresu (ten sam mianownik co pctOf okresu), więc ostatni punkt = wynik karty.
// Punkt: { t (ms wejścia albo null), date, v: { R, $, % } }; punkt startowy ma start: true i datę pierwszego trade'u. R i $ zaokrąglone do 1e-6 (sumy ułamków), % bez zaokrąglenia (ten sam wzór co pctOf).
const r6 = (x) => Math.round(x * 1e6) / 1e6;
export function equityCurve(trades, kontaById) {
  const ts = sortChrono(trades);
  if (!ts.length) return [];
  const tot = valuesOf(ts, kontaById);
  const size = tot['%'] != null ? pctBase(ts, kontaById).size : 0; // ten sam mianownik co pctOf (przegląd HIJ, pkt 8)
  const pt = (r, pnl) => ({ R: tot.R != null ? r6(r) : null, $: tot.$ != null ? r6(pnl) : null, '%': size > 0 ? (pnl / size) * 100 : null });
  const out = [{ t: null, date: ts[0].date, start: true, v: pt(0, 0) }];
  let r = 0, pnl = 0;
  for (const t of ts) { r += t.r ?? 0; pnl += t.pnl ?? 0; out.push({ t: t.at ?? null, date: t.date, v: pt(r, pnl) }); }
  return out;
}

// Dni z trade'ami w okresie, każdy z wynikiem w trzech jednostkach (R i $ z byDay).
function daysOf(trades, kontaById) {
  const m = byDay(trades);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, d]) => {
    const ts = trades.filter((t) => t.date === date);
    return { date, n: d.n, v: { R: ts.some((t) => t.r != null) ? d.r : null, $: d.hasPnl ? d.pnl : null, '%': pctOf(ts, kontaById) } };
  });
}
// Zielone dni i najlepszy dzień w wybranej jednostce (z marginesem BE). Dzień bez wartości w tej jednostce nie jest ani zielony, ani najlepszy.
function dayStats(days, metric) {
  let green = 0, best = null;
  for (const d of days) {
    const x = pick(d.v, metric);
    if (x == null) continue;
    if (signOf(d.v, metric) === 'win') green++;
    if (!best || x > pick(best.v, metric)) best = d;
  }
  return { greenDays: green, tradingDays: days.length, bestDay: best && signOf(best.v, metric) === 'win' ? best : null };
}

// ---------- karty ----------

// Karta trade'a: dowolny typ; Backtest i Paper dostają etykietę (inaczej wyglądałyby na prawdziwy wynik).
export function tradeCard(t, konta) {
  const kontaById = kontaMap(konta);
  const tag = t.typ === 'Live' ? null : t.typ === 'Niewzięty' ? 'Paper' : t.typ === 'Backtest' ? 'Backtest' : t.typ;
  const pct = t.typ === 'Live' ? pctOf([t], kontaById) : null;
  return {
    kind: 'trade', n: 1, tag, outcome: outcome(t),
    instrument: t.instrument, dir: t.dir, date: t.date, time: t.time, exitTime: t.exitTime, dur: t.dur,
    setup: t.setup, session: t.session,
    // etap 17 (pakiet I): ceny i czas trade'a dla wykresu w karcie i wierszy „Cena wejścia/wyjścia”
    at: t.at ?? null, exitAt: t.at != null && t.dur != null ? t.at + t.dur * 60000 : null, contract: t.contract || '',
    entryPrice: t.entryPrice ?? null, exitPrice: t.exitPrice ?? null, sl: t.sl ?? null, tp: t.tp ?? null,
    v: { R: t.r, $: t.typ === 'Live' ? t.pnl : null, '%': pct },
  };
}

export function dayCard(trades, konta, date, metric = 'R') {
  const kontaById = kontaMap(konta);
  const ts = sortChrono(inRange(liveOnly(trades), date, date));
  const b = base(ts, kontaById);
  const list = ts.map((t) => ({ instrument: t.instrument, dir: t.dir, time: t.time, v: valuesOf([t], kontaById) }));
  let best = null;
  for (const x of list) { const v = pick(x.v, metric); if (v != null && (!best || v > pick(best.v, metric))) best = x; }
  return { kind: 'day', date, from: date, to: date, ...b, trades: list, best };
}

// Tydzień od poniedziałku. Pon–Pt zawsze, sobota i niedziela tylko z trade'ami (decyzja gustu, karta jak w inspiracji).
// clip = { from, to } (opcjonalnie): karta obejmuje tylko dni z tego zakresu, jak komórka „Tydz.” w kalendarzu na przełomie miesięcy
// (słowa użytkownika 26.10.2026: «To samo co komórka»; komórka sumuje tylko dni bieżącego miesiąca).
export const weekStart = (k) => addDays(k, -weekdayIdx(k));
export function weekCard(trades, konta, anyDayKey, metric = 'R', clip = null) {
  const kontaById = kontaMap(konta);
  const wFrom = weekStart(anyDayKey), wTo = addDays(wFrom, 6);
  const from = clip && clip.from > wFrom ? clip.from : wFrom;
  const to = clip && clip.to < wTo ? clip.to : wTo;
  const ts = inRange(liveOnly(trades), from, to);
  const days = daysOf(ts, kontaById);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const list = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(wFrom, i);
    if (date < from || date > to) continue;
    const d = byDate.get(date);
    if (i < 5 || d) list.push(d ? { ...d, wd: i } : { date, wd: i, n: 0, v: { R: null, $: null, '%': null } });
  }
  return { kind: 'week', from, to, ...base(ts, kontaById), ...dayStats(days, metric), days: list };
}

export function monthCard(trades, konta, y, m, metric = 'R') {
  const kontaById = kontaMap(konta);
  const from = `${y}-${pad(m)}-01`, to = `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`;
  const ts = inRange(liveOnly(trades), from, to);
  const days = daysOf(ts, kontaById);
  // tygodnie miesiąca od poniedziałku, przycięte do granic miesiąca
  const weeks = [];
  let s = from;
  while (s <= to) {
    let e = addDays(weekStart(s), 6);
    if (e > to) e = to;
    const wt = inRange(ts, s, e);
    weeks.push({ from: s, to: e, n: wt.length, v: valuesOf(wt, kontaById) });
    s = addDays(e, 1);
  }
  return { kind: 'month', y, m, from, to, ...base(ts, kontaById), ...dayStats(days, metric), weeks };
}

export function yearCard(trades, konta, y, metric = 'R') {
  const kontaById = kontaMap(konta);
  const ts = inRange(liveOnly(trades), `${y}-01-01`, `${y}-12-31`);
  const months = Array.from({ length: 12 }, (_, i) => {
    const mt = ts.filter((t) => parseKey(t.date).m === i + 1);
    return { m: i + 1, n: mt.length, v: valuesOf(mt, kontaById) };
  });
  let green = 0, active = 0, best = null;
  for (const mo of months) {
    if (!mo.n) continue;
    active++;
    const x = pick(mo.v, metric);
    if (x == null) continue;
    if (signOf(mo.v, metric) === 'win') green++;
    if (!best || x > pick(best.v, metric)) best = mo;
  }
  return { kind: 'year', y, from: `${y}-01-01`, to: `${y}-12-31`, ...base(ts, kontaById), greenMonths: green, tradingMonths: active, bestMonth: best && signOf(best.v, metric) === 'win' ? best : null, months };
}

// Jednostki, które karta umie pokazać (do wyszarzenia przełącznika R / $ / %).
export const availableMetrics = (card) => METRICS.filter((u) => card.v[u] != null);
