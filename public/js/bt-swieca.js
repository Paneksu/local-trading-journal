// Replay modułu Backtest (1.5.0): strumień świec bazowych i świeca w budowie. Czysty moduł (bez DOM, bez I/O), działa w przeglądarce i w Node.
// Kursor C to chwila w sekundach. Świeca bazowa [t, …] o długości len jest widoczna ⇔ t + len ≤ C (definicja wiążąca, etap B1).
// Świeca interwału tf przy kursorze C = agregat (aggregate z swiece.js) widocznych świec bazowych, więc żaden widok nie dostaje świecy z przyszłości (§2, 18a.1),
// a świeca wyższego TF jest zawsze agregatem niższych do kursora.
// Strumień bazowy: 1s w oknach prawdziwego pokrycia 1s (real1s), 1m poza nimi. Dla TF < 60 s świece 1m spoza okna zostają minutowe (aggregate kotwiczy kubełek w t świecy).
// English: base candle stream (1s inside real 1s coverage, 1m elsewhere), candles visible at a cursor and an incremental in-progress candle builder.
import { aggregate, parseTf, sessionBounds } from './swiece.js';

export const REPLAY_TFS = ['1s', '5s', '10s', '15s', '30s', '1m', '2m', '3m', '5m', '15m', '30m', '1h'];
// Skok o więcej świec bazowych niż ten próg przebudowuje agregat od zera (reset) zamiast dokładać świecę po świecy.
const RESET_OVER = 600;

const overlaps = (ranges, a, b) => ranges.some(([x, y]) => x < b && y > a);
const inside = (ranges, t) => ranges.some(([x, y]) => t >= x && t < y);

// mergeBase(m1, s1, real1s) → { bars, len }: 1m spoza real1s, 1s w real1s, posortowane po t, bez dubli.
// Minuta zachodząca choćby częściowo na okno 1s jest pomijana (jej sekundy dają świece 1s), żeby nic nie liczyło się dwa razy.
// Świece poza sesją CME (przerwa 16:00-17:00 CT, weekend) też są pomijane: aggregate i tak ich nie liczy, a tu odpada koszt sessionBounds przy każdym kroku.
export function mergeBase(m1 = [], s1 = [], real1s = []) {
  const ranges = (real1s || []).filter((r) => Array.isArray(r) && r[1] > r[0]);
  const items = [];
  let sess = null;
  const inSession = (t) => {
    if (!sess || t < sess.open || t >= sess.close) { const x = sessionBounds(t); if (!x) return false; sess = x; }
    return true;
  };
  for (const b of m1 || []) if (!overlaps(ranges, b[0], b[0] + 60) && inSession(b[0])) items.push([b, 60]);
  for (const b of s1 || []) if (inside(ranges, b[0]) && inSession(b[0])) items.push([b, 1]);
  items.sort((x, y) => x[0][0] - y[0][0]);
  const bars = [], len = [];
  let lastT = -Infinity;
  for (const [b, l] of items) {
    if (b[0] === lastT) continue; // dubel tej samej chwili
    bars.push(b.length === 6 ? b : b.slice(0, 6)); len.push(l); lastT = b[0];
  }
  return { bars, len };
}

// Liczba widocznych świec bazowych przy kursorze: końce t + len rosną (świece się nie nakładają), więc wyszukiwanie binarne.
export function visibleCount(stream, cursor) {
  const { bars, len } = stream;
  let lo = 0, hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (bars[mid][0] + len[mid] <= cursor) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// Wzorzec: świece interwału tf przy kursorze (ostatnia to świeca w budowie).
export function candlesAt(stream, tf, cursor) {
  return aggregate(stream.bars.slice(0, visibleCount(stream, cursor)), tf) || [];
}

// createBuilder(stream, tf) → { seek(cursor) → Update, bars() → Bar[] }: agregacja przyrostowa, wynik zawsze równy candlesAt(stream, tf, cursor).
// Update: { kind: 'reset', bars } (cofnięcie kursora, skok o > 600 świec bazowych, pierwsze wywołanie),
// { kind: 'update', bar } (zmieniła się tylko ostatnia świeca albo nic; bar = kopia ostatniej świecy, null przy pustym wykresie),
// { kind: 'append', bars } (doszły nowe świece; bars zaczyna się od poprzedniej ostatniej świecy, jeśli też się zmieniła, potem nowe; kopie w kolejności czasu).
export function createBuilder(stream, tf) {
  const p = parseTf(tf);
  if (!p) throw new Error(`bt-swieca: zły interwał „${tf}”`);
  const intraday = p.unit === 's' || p.unit === 'm' || p.unit === 'h';
  let out = [], idx = 0, lastCursor = -Infinity, sess = null;

  const reset = (cursor, n) => {
    out = aggregate(stream.bars.slice(0, n), p) || [];
    idx = n; lastCursor = cursor; sess = null;
    return { kind: 'reset', bars: out.slice() };
  };

  function seek(cursor) {
    const n = visibleCount(stream, cursor);
    if (!intraday || cursor < lastCursor || n < idx || n - idx > RESET_OVER) return reset(cursor, n);
    lastCursor = cursor;
    const before = out.length;
    let touchedLast = false;
    for (let i = idx; i < n; i++) {
      const b = stream.bars[i], t = b[0];
      // ta sama logika kubełka co aggregate (kotwica w otwarciu sesji CME, świece poza sesją pomijane)
      if (!sess || t < sess.open || t >= sess.close) sess = sessionBounds(t);
      if (!sess) continue;
      const start = sess.open + Math.floor((t - sess.open) / p.sec) * p.sec;
      const cur = out[out.length - 1];
      if (cur && cur[0] === start) {
        if (b[2] > cur[2]) cur[2] = b[2];
        if (b[3] < cur[3]) cur[3] = b[3];
        cur[4] = b[4];
        cur[5] += b[5];
        if (out.length === before) touchedLast = true;
      } else out.push([start, b[1], b[2], b[3], b[4], b[5]]);
    }
    idx = n;
    if (out.length > before) return { kind: 'append', bars: out.slice(touchedLast ? before - 1 : before).map((b) => b.slice()) };
    const last = out[out.length - 1];
    return { kind: 'update', bar: last ? last.slice() : null };
  }

  return { seek, bars: () => out };
}
