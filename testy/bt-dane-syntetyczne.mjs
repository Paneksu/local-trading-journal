// Generator syntetycznych świec do testów modułu Backtest (1.5.0). To NIE jest test (pętla ładuje tylko backtest-*.mjs).
// Dane CME nigdy nie trafiają do repo ani do testów: wszystko tu jest losowym spacerem z ziarna, zapisanym do katalogu tymczasowego.
// English: seeded random-walk candles written to a temp store via writeRange (1m layer from the CME session open two days back to 16:00 NY, 1s layer in [9:30, 11:00) NY).
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

// mulberry32: małe, deterministyczne PRNG
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TICK = 25; // 0,25 pkt × 100 (cena w magazynie to liczba całkowita × 100)

// Zakresy kontekstu dla dnia: te same liczby co lib/backtest-day.mjs (dwie sesje CME wstecz od sesji zawierającej 9:30 NY).
export async function dayRange(day, ctx = 2) {
  const { etToUtc } = await imp('lib/news.mjs');
  const { dayNum, sessionBounds, previousSession } = await imp('public/js/swiece.js');
  const [y, m, d] = day.split('-').map(Number);
  const n = dayNum(y, m, d);
  const open = etToUtc(n, 9, 30), w1sEnd = etToUtc(n, 11, 0), end = etToUtc(n, 16, 0);
  let s = sessionBounds(open);
  for (let i = 0; i < ctx; i++) s = previousSession(s.open);
  return { ctxFrom: s.open, open, w1sEnd, end };
}

const inGap = (t, gaps) => gaps.some((g) => (Array.isArray(g) ? t >= g[0] && t < g[1] : t === g));

// syntheticDay(baseDir, { instrument: 'ES'|'NQ', day, seed, has1s = true, gaps = [], ctx = 2 }) → { m1Count, s1Count }
// gaps: sekundy epoki (pojedyncze liczby) albo zakresy [od, do): te sekundy NIE mają świec 1s, ale pokrycie zapisuje całe okno 1s (jak sekundy bez transakcji).
// 1m w oknie 1s = agregat tych 1s (spójność); minuta bez żadnej sekundy nie ma świecy 1m.
export async function syntheticDay(baseDir, { instrument = 'NQ', day, seed = 1, has1s = true, gaps = [], ctx = 2 } = {}) {
  const store = await imp('lib/candles-store.mjs');
  const { ctxFrom, open, w1sEnd, end } = await dayRange(day, ctx);
  const rand = rng(seed + (instrument === 'ES' ? 7919 : 0));
  let px = (instrument === 'ES' ? 5000 : 18000) * 100; // w tickach 0,25: wielokrotność TICK
  px = Math.round(px / TICK) * TICK;
  const step = (maxTicks) => { px += Math.round((rand() - 0.5) * 2 * maxTicks) * TICK; if (px < 100 * TICK) px = 100 * TICK; return px; };
  const mkBar = (t, maxTicks) => {
    const o = px;
    let h = o, l = o;
    const c = step(maxTicks);
    const wiggle = () => o + Math.round((rand() - 0.5) * 2 * maxTicks) * TICK;
    h = Math.max(o, c, wiggle()); l = Math.min(o, c, wiggle());
    return [t, o, h, l, c, 1 + Math.floor(rand() * 50)];
  };
  const s1 = [];
  if (has1s) for (let t = open; t < w1sEnd; t++) if (!inGap(t, gaps)) s1.push(mkBar(t, 2));
  // 1m: poza oknem losowy spacer, w oknie agregat 1s (gdy has1s) albo losowy spacer (bez 1s)
  const m1 = [];
  const byMin = new Map();
  for (const b of s1) { const k = b[0] - (b[0] % 60); (byMin.get(k) || byMin.set(k, []).get(k)).push(b); }
  for (let t = ctxFrom; t < end; t += 60) {
    if (has1s && t >= open && t < w1sEnd) {
      const g = byMin.get(t);
      if (g) m1.push([t, g[0][1], Math.max(...g.map((b) => b[2])), Math.min(...g.map((b) => b[3])), g[g.length - 1][4], g.reduce((a, b) => a + b[5], 0)]);
    } else m1.push(mkBar(t, 8));
  }
  store.writeRange(instrument, '1m', ctxFrom, end, m1, {}, { baseDir });
  if (has1s) store.writeRange(instrument, '1s', open, w1sEnd, s1, {}, { baseDir });
  return { m1Count: m1.length, s1Count: s1.length };
}
