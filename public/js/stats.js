// Statystyki liczone z surowych pól (nie z formuł Notion).
import { parseDT, fold } from './format.js';
import { t } from './i18n.js';
const EPS = 1e-9;
const numOrNull = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const day = (s) => (s ? String(s).slice(0, 10) : null);

const manualOf = (sel) => { const n = sel?.name || ''; return /win/i.test(n) ? 'win' : /loss/i.test(n) ? 'loss' : /be/i.test(n) ? 'be' : null; };

// Czas trwania w minutach: tylko gdy są obie godziny (wejście z godziną w „Data” i pole „Wyjście”) i wyjście nie jest przed wejściem.
const durOf = (a, b) => (a != null && b != null && b >= a ? (b - a) / 60000 : null);

export function normalizeTrades(rows) {
  return rows
    .map((r) => {
      const dt = parseDT(r.date) || {};
      const ex = parseDT(r.exit) || {};
      return {
      id: r._id,
      url: r._url,
      created: r._created || '',
      edited: r._edited || '',
      name: r.title || '',
      date: dt.date || null,
      time: dt.time || null,
      at: dt.at ?? null,
      exitDate: ex.date || null,
      exitTime: ex.time || null,
      dur: durOf(dt.at ?? null, ex.at ?? null),
      typ: r.typ?.name || null,
      instrument: r.instrument?.name || null,
      dir: r.dir?.name || null,
      dirColor: r.dir?.color || 'default',
      setup: r.setup?.name || null,
      session: r.session?.name || null,
      r: numOrNull(r.r),
      pnl: numOrNull(r.pnl),
      konta: r.konta || [],
      chart: r.chart || null,
      manual: manualOf(r.manual),
      reason: r.reason?.name || null,
      notes: r.notes || '',
      imgs: r._imgs || 0,
      };
    })
    .map((t) => ({ ...t, hay: fold(`${t.name} ${t.notes}`) }))
    .filter((t) => t.date)
    // wpisy bez daty nie istnieją; dni bez trade'u (NO TRADE) i puste wiersze bez R, P&L i wyniku
    // nie są trade'ami do statystyk (counted = false), ale ich zrzuty zostają w Galerii
    .map((t) => ({ ...t, counted: t.dir !== 'NO TRADE' && (t.r != null || t.pnl != null || !!t.manual) }));
}

export function normalizeKonta(rows) {
  return rows.map((r) => ({
    id: r._id,
    url: r._url,
    name: r.name || '',
    status: r.status?.name || null,
    statusColor: r.status?.color || 'default',
    firma: r.firma?.name || null,
    firmaColor: r.firma?.color || 'default',
    size: numOrNull(r.size),
    saldo: numOrNull(r.saldo),
    active: typeof r.active === 'boolean' ? r.active : ['Challenge', 'Weryfikacja', 'Funded'].includes(r.status?.name),
    bought: day(r.bought),
    edited: r._edited || '',
    notes: r.notes || '',
  }));
}

export function normalizeFinanse(rows) {
  return rows
    .map((r) => {
      const kind = r.kind?.name || '';
      const amount = numOrNull(r.amount) ?? 0;
      const isPayout = kind === 'Payout';
      return {
        id: r._id,
        url: r._url,
        edited: r._edited || '',
        name: r.name || '',
        date: day(r.date),
        kind,
        amount,
        firma: r.firma?.name || 'Inna',
        konta: r.konto || [],
        konto: (r.konto || [])[0] || null,
        spend: isPayout ? 0 : amount,
        payout: isPayout ? amount : 0,
      };
    })
    .filter((f) => f.date);
}

// Margines BE (ustawienia, 25.10.2026): wynik w granicach ±margines to BE, bo koszty, spread i poślizg robią drobne plusy i minusy.
// Rekomendacja: 0,1R. Margines w $ działa tylko dla wpisów bez R i domyślnie jest wyłączony (0), bo bez R nie znamy ryzyka.
export const BE_DEFAULTS = { beR: 0.1, beUsd: 0 };
export const cfg = { ...BE_DEFAULTS };
export function setBeMargins(beR, beUsd) {
  cfg.beR = Number.isFinite(beR) ? Math.min(0.5, Math.max(0, beR)) : BE_DEFAULTS.beR;
  cfg.beUsd = Number.isFinite(beUsd) ? Math.min(100000, Math.max(0, beUsd)) : BE_DEFAULTS.beUsd;
}
// Kolejność: najpierw „Wynik ręcznie”, potem R z marginesem R, a gdy R puste, P&L $ z marginesem $.
// Sumy R i $, profit factor i krzywa zostają na surowych wartościach.
export function outcome(t) {
  if (t.manual) return t.manual;
  if (t.r != null) return Math.abs(t.r) <= cfg.beR + EPS ? 'be' : t.r > 0 ? 'win' : 'loss';
  if (t.pnl != null) return Math.abs(t.pnl) <= cfg.beUsd + EPS ? 'be' : t.pnl > 0 ? 'win' : 'loss';
  return 'be';
}
// Czy BE wynika z marginesu (a nie z ręcznego wyniku ani z dokładnego zera)? Do dopisku w szczegółach.
export function beByMargin(t) {
  if (t.manual || outcome(t) !== 'be') return null;
  if (t.r != null) return Math.abs(t.r) > EPS ? { v: cfg.beR, unit: 'R' } : null;
  if (t.pnl != null) return Math.abs(t.pnl) > EPS ? { v: cfg.beUsd, unit: '$' } : null;
  return null;
}

export function sortChrono(arr) {
  return [...arr].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || a.created.localeCompare(b.created));
}

const pf = (gw, gl) => (gl > EPS ? gw / gl : gw > EPS ? Infinity : null);
const r6 = (x) => Math.round(x * 1e6) / 1e6;

export function calc(trades) {
  const ts = sortChrono(trades);
  let wins = 0, losses = 0, be = 0, sumR = 0, nR = 0, gwR = 0, glR = 0, nWinR = 0, nLossR = 0, swR = 0, slR = 0;
  let sumPnl = 0, hasPnl = false, gwP = 0, glP = 0, plan = 0;
  let best = null, worst = null;
  let cum = 0, peak = 0, dd = 0, cw = 0, cl = 0, maxW = 0, maxL = 0;
  for (const t of ts) {
    const o = outcome(t);
    if (o === 'win') { wins++; cw++; cl = 0; } else if (o === 'loss') { losses++; cl++; cw = 0; } else { be++; cw = 0; cl = 0; }
    if (cw > maxW) maxW = cw;
    if (cl > maxL) maxL = cl;
    if (t.r != null) {
      nR++; sumR += t.r;
      if (t.r > EPS) gwR += t.r; else if (t.r < -EPS) glR += -t.r;
      // średnia wygrana i strata według wyniku (z ręcznym nadpisaniem), a nie znaku R
      if (o === 'win') { swR += t.r; nWinR++; } else if (o === 'loss') { slR += t.r; nLossR++; }
      cum += t.r;
      if (cum > peak) peak = cum;
      if (peak - cum > dd) dd = peak - cum;
      if (!best || t.r > best.r) best = t;
      if (!worst || t.r < worst.r) worst = t;
    }
    if (t.pnl != null) {
      hasPnl = true; sumPnl += t.pnl;
      if (t.pnl > EPS) gwP += t.pnl; else if (t.pnl < -EPS) glP += -t.pnl;
    }
    if (t.plan) plan++;
  }
  const decided = wins + losses;
  return {
    n: ts.length, wins, losses, be,
    winRate: decided ? (wins / decided) * 100 : null,
    sumR: r6(sumR), nR,
    avgR: nR ? sumR / nR : null,
    sumPnl: hasPnl ? r6(sumPnl) : null, hasPnl,
    pfR: pf(gwR, glR), pfPnl: hasPnl ? pf(gwP, glP) : null,
    avgWin: nWinR ? swR / nWinR : null,
    avgLoss: nLossR ? slR / nLossR : null,
    best, worst,
    planPct: ts.length ? (plan / ts.length) * 100 : null,
    maxDD: r6(dd),
    maxWinStreak: maxW, maxLossStreak: maxL,
  };
}

// Krzywa kapitału: punkt startowy + po jednym punkcie na trade.
export function equityPoints(trades, unit) {
  const ts = sortChrono(trades);
  let cum = 0;
  const pts = [{ cum: 0, start: true }];
  ts.forEach((t, i) => {
    const v = unit === 'R' ? t.r ?? 0 : t.pnl ?? 0;
    cum += v;
    pts.push({ cum: r6(cum), v, t, i: i + 1 });
  });
  return pts;
}

// Rozbicia: keysOf(t) zwraca tablicę kluczy (emocje mogą być wielokrotne).
export function group(trades, keysOf) {
  const m = new Map();
  for (const t of trades) {
    for (const k of keysOf(t)) {
      if (k == null) continue;
      const g = m.get(k) || { key: k, n: 0, sumR: 0, nR: 0, wins: 0, losses: 0, pnl: 0 };
      g.n++;
      if (t.r != null) { g.sumR += t.r; g.nR++; }
      if (t.pnl != null) g.pnl += t.pnl;
      const o = outcome(t);
      if (o === 'win') g.wins++; else if (o === 'loss') g.losses++;
      m.set(k, g);
    }
  }
  return [...m.values()].map((g) => ({
    ...g,
    sumR: r6(g.sumR),
    avgR: g.nR ? g.sumR / g.nR : null,
    wr: g.wins + g.losses ? (g.wins / (g.wins + g.losses)) * 100 : null,
  }));
}

export function byDay(trades) {
  const m = new Map();
  for (const t of trades) {
    const d = m.get(t.date) || { r: 0, pnl: 0, n: 0, hasPnl: false };
    d.n++;
    d.r += t.r ?? 0;
    if (t.pnl != null) { d.pnl += t.pnl; d.hasPnl = true; }
    m.set(t.date, d);
  }
  return m;
}

export function money(finanse) {
  let spend = 0, payout = 0;
  for (const f of finanse) { spend += f.spend; payout += f.payout; }
  return { spend, payout, balance: payout - spend };
}

export function byFirma(finanse) {
  const m = new Map();
  for (const f of finanse) {
    const g = m.get(f.firma) || { firma: f.firma, spend: 0, payout: 0 };
    g.spend += f.spend; g.payout += f.payout;
    m.set(f.firma, g);
  }
  return [...m.values()].map((g) => ({ ...g, balance: g.payout - g.spend, roi: g.spend > 0 ? ((g.payout - g.spend) / g.spend) * 100 : null }));
}

export function byMonth(finanse, fromMonth, toMonth) {
  const out = [];
  let [y, m] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push({ key: `${y}-${String(m).padStart(2, '0')}`, y, m, spend: 0, payout: 0 });
    m++; if (m > 12) { m = 1; y++; }
  }
  const idx = new Map(out.map((o) => [o.key, o]));
  for (const f of finanse) {
    const o = idx.get(f.date.slice(0, 7));
    if (o) { o.spend += f.spend; o.payout += f.payout; }
  }
  return out;
}

// Krzywa Live z doliczonym paper: oś X to wszystkie trade'y po kolei. cum = tylko Live (paper go nie zmienia),
// cum2 = Live + Paper. Paper nie ma kwot, więc działa tylko w R.
export function equityCombined(live, paper) {
  const all = sortChrono([...live, ...paper]);
  let a = 0, b = 0;
  const pts = [{ cum: 0, cum2: 0, start: true }];
  all.forEach((t, i) => {
    const isPaper = t.typ === 'Niewzięty';
    const v = t.r ?? 0;
    b += v;
    if (!isPaper) a += v;
    pts.push({ cum: r6(a), cum2: r6(b), v, t, i: i + 1, paper: isPaper });
  });
  return pts;
}

// Spadki od szczytu (0 lub ujemne), liczone z krzywej skumulowanej, szczyt startuje od 0.
export function drawdownSeries(pts) {
  let peak = 0;
  return pts.map((p) => {
    if (p.cum > peak) peak = p.cum;
    return r6(p.cum - peak);
  });
}

// Bilans prop narastająco: wypłacone minus wydane po kolei wpisów w czasie.
export function balanceSeries(finanse) {
  const rows = [...finanse].sort((a, b) => a.date.localeCompare(b.date));
  let cum = 0;
  const pts = [{ cum: 0, start: true }];
  for (const f of rows) {
    const d = f.payout - f.spend;
    cum += d;
    pts.push({ cum: r6(cum), d, f });
  }
  return pts;
}

// Kolejność trade'ów w dniu: po godzinie wejścia, a gdy któryś trade dnia nie ma godziny, po kolejności dodania (utworzenia w Notion).
// Zwraca Map(id -> numer od 0).
export function dayOrder(trades) {
  const byDay = new Map();
  for (const t of trades) { const a = byDay.get(t.date) || []; a.push(t); byDay.set(t.date, a); }
  const out = new Map();
  for (const arr of byDay.values()) {
    const allTimed = arr.every((t) => t.time);
    arr.sort((a, b) => (allTimed ? a.time.localeCompare(b.time) : 0) || a.created.localeCompare(b.created));
    arr.forEach((t, i) => out.set(t.id, i));
  }
  return out;
}

export function nthTradeGroups(trades) {
  const ord = dayOrder(trades);
  const rows = group(trades, (t) => [Math.min(ord.get(t.id) ?? 0, 2)]);
  const label = [t('1. trade w dniu'), t('2. trade w dniu'), t('3. i kolejne')];
  return [0, 1, 2].map((k) => ({ ...(rows.find((r) => r.key === k) || { key: k, n: 0, sumR: null, avgR: null, wr: null }), label: label[k] }));
}

// Rozkład R: przedziały o stałej szerokości (0,1 / 0,25 / 0,5 / 1R, domyślnie dobierane automatycznie tak, by słupków było najwyżej 30),
// oś od najmniejszego do największego R w danych. Ogon powyżej TAIL_R (+10R) i poniżej -TAIL_R zwija się do jednego słupka,
// żeby pojedynczy outlier nie spłaszczał wykresu. Trade'y w marginesie BE tworzą osobny neutralny słupek dokładnie w miejscu 0.
// Liczy po wartości R (ręczny wynik nie przesuwa trade'a między słupkami).
export const R_STEPS = [0.1, 0.25, 0.5, 1];
export const TAIL_R = 10;
const rnd3 = (x) => Math.round(x * 1000) / 1000;
export function inRBin(t, bin) {
  if (t.r == null) return false;
  const be = Math.abs(t.r) <= cfg.beR + EPS;
  if (bin.kind === 'be') return be;
  return !be && t.r >= bin.lo - EPS && t.r < bin.hi - EPS;
}
export function rHistogram(trades, stepOpt = 'auto') {
  const rs = trades.filter((t) => t.r != null);
  const noR = trades.length - rs.length;
  if (!rs.length) return { items: [], n: 0, noR, step: 0, summary: null };
  const vals = rs.map((t) => t.r);
  const be = (r) => Math.abs(r) <= cfg.beR + EPS;
  const outside = vals.filter((r) => !be(r));
  const build = (step) => {
    const kOf = (r) => Math.floor(r / step + EPS);
    const capK = Math.round(TAIL_R / step);
    const negTail = outside.some((r) => r <= -TAIL_R), posTail = outside.some((r) => r >= TAIL_R);
    const mid = outside.filter((r) => r < TAIL_R && r > -TAIL_R);
    const ks = mid.map(kOf);
    const kMin = Math.min(0, ...ks), kMax = Math.max(-1, ...ks);
    const items = [];
    if (negTail) items.push({ kind: 'neg', tail: true, lo: -Infinity, hi: -TAIL_R, n: outside.filter((r) => r <= -TAIL_R).length });
    for (let k = Math.max(kMin, -capK + (negTail ? 0 : -1e9)); k <= -1; k++) items.push({ kind: 'neg', lo: rnd3(k * step), hi: rnd3((k + 1) * step), n: mid.filter((r) => kOf(r) === k).length });
    items.push({ kind: 'be', lo: -cfg.beR, hi: cfg.beR, n: vals.filter(be).length });
    for (let k = 0; k <= Math.min(kMax, capK - 1); k++) items.push({ kind: 'pos', lo: rnd3(k * step), hi: rnd3((k + 1) * step), n: mid.filter((r) => kOf(r) === k).length });
    if (posTail) items.push({ kind: 'pos', tail: true, lo: TAIL_R, hi: Infinity, n: outside.filter((r) => r >= TAIL_R).length });
    return items;
  };
  let step = Number(stepOpt);
  let items;
  if (!R_STEPS.includes(step)) {
    step = R_STEPS[R_STEPS.length - 1];
    for (const s of R_STEPS) { const it = build(s); if (it.length <= 30) { step = s; items = it; break; } }
  }
  items = items || build(step);
  const sorted = [...vals].sort((x, y) => x - y);
  const m = sorted.length >> 1;
  const med = sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  const summary = {
    median: med, mean: vals.reduce((x, y) => x + y, 0) / vals.length,
    pGe1: (vals.filter((r) => r >= 1 - EPS).length / vals.length) * 100, pLe1: (vals.filter((r) => r <= -1 + EPS).length / vals.length) * 100,
  };
  return { items, n: rs.length, noR, step, summary };
}

// Czas trwania: stałe, drobne przedziały (praca na krótkich trade'ach): <1, 1–2, 2–5, 5–10, 10–15, 15–30, 30–60 min i >1 h.
// Widać tylko zakres od pierwszego do ostatniego niepustego przedziału; puste w środku zostają, żeby było widać przerwę.
export const DUR_EDGES = [1, 2, 5, 10, 15, 30, 60];
export const DUR_LABELS = ['<1m', '1–2m', '2–5m', '5–10m', '10–15m', '15–30m', '30–60m', '>1h'];
export const durBin = (min) => { for (let i = 0; i < DUR_EDGES.length; i++) if (min < DUR_EDGES[i] - 1e-9 || (i === DUR_EDGES.length - 1 && min <= DUR_EDGES[i] + 1e-9)) return i; return DUR_EDGES.length; };
const median = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
export function durationGroups(trades) {
  const withDur = trades.filter((t) => t.dur != null);
  const rows = group(withDur, (t) => [durBin(t.dur)]);
  const all = DUR_LABELS.map((label, k) => ({ ...(rows.find((r) => r.key === k) || { key: k, n: 0, sumR: null, avgR: null, wr: null }), label, mono: true }));
  const filled = all.filter((r) => r.n > 0).map((r) => r.key);
  const visible = filled.length ? all.filter((r) => r.key >= Math.min(...filled) && r.key <= Math.max(...filled)) : [];
  const med = (o) => median(withDur.filter((t) => outcome(t) === o).map((t) => t.dur));
  const durs = withDur.map((t) => t.dur);
  return {
    rows: visible, n: withDur.length, missing: trades.length - withDur.length,
    medWin: med('win'), medLoss: med('loss'), medBe: med('be'),
    min: durs.length ? Math.min(...durs) : null, max: durs.length ? Math.max(...durs) : null,
  };
}
