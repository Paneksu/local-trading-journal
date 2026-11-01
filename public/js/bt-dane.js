// Dane replayu na ciągłej osi czasu (pakiet K, 31.10.2026). Czysty moduł (bez DOM): działa w przeglądarce i w Node (testy z prawdziwym lib/backtest-range.mjs).
// [U] 31.10.2026 «powinines miec pelna przeszlosc tak daleko jak siega historia w danym momencie oraz nie powinno byc takiego czegos jak koniec dnia».
// Okno bazowe [baseFrom, baseTo) na rodzinę instrumentu (NQ, ES): strumień mergeBase (1s w prawdziwym pokryciu, 1m poza). Granice okna leżą zawsze na otwarciu
// sesji CME (17:00 CT), więc minuty okna 1s nigdy nie są cięte, a kubełki każdego interwału z REPLAY_TFS są pełne po obu stronach granicy.
// Doładowanie w prawo porcjami po CHUNK_SESSIONS sesji z wyprzedzeniem (dane po kursorze tylko w pamięci, wykres i silnik widzą wyłącznie t + len ≤ kursor).
// Gdy baseFrom zostaje dalej niż TRIM_SESSIONS sesji za kursorem, okno się przesuwa: odcięte świece bazowe idą do słuchaczy ('trim'), którzy doklejają je
// do historii wykresów jako zagregowane świece swoich interwałów. Kursor przed baseFrom (krok wstecz) przeładowuje okno ('reload').
// Historia wykresu przed baseFrom: świece interwału z serwera (tf=<interwał>), porcjami po ~HIST_BARS świec, w lewo aż do pierwszej świecy danych.
// English: continuous-time replay data: base window with look-ahead chunks and trimming, lazy server-aggregated chart history back to the first candle.
import { mergeBase } from './bt-swieca.js';
import { sessionBounds, previousSession, sessionOf, weekdayOf, parseTf } from './swiece.js';
import { FAMILY } from './kontrakty.js';

// sesje przed sesją kursora w oknie bazowym (jak dawny kontekst „ctx 2”)
export const CTX_SESSIONS = 2;
// porcja doładowania w prawo
export const CHUNK_SESSIONS = 2;
// doładuj, gdy do końca okna zostało mniej niż tyle sesji
export const AHEAD_SESSIONS = 1;
// przesuń okno, gdy jego początek jest tyle sesji za kursorem
export const TRIM_SESSIONS = 6;
// świec historii w jednej porcji (orientacyjnie)
export const HIST_BARS = 1500;
// jedna prośba o strumień bazowy (serwer: BASE_MAX_DAYS = 8)
const MAX_SPAN = 7 * 86400;

const famOf = (inst) => FAMILY[String(inst).toUpperCase()] || String(inst);
// otwarcie sesji zawierającej t (w przerwie i w weekend: ostatniej sesji przed t)
export function sessionOpenAt(t) { return (sessionBounds(t) || previousSession(t)).open; }
// otwarcie pierwszej sesji po sesji zawierającej t (w przerwie: najbliższe otwarcie po t)
export function nextOpen(t) {
  const s = sessionBounds(t) || previousSession(t);
  let d = s.day + 1;
  while (weekdayOf(d) > 4) d++;
  return sessionOf(d).open;
}
export function prevOpen(t) { return previousSession(sessionOpenAt(t)).open; }
const opensAfter = (t, n) => { let x = t; for (let i = 0; i < n; i++) x = nextOpen(x); return x; };
const opensBefore = (t, n) => { let x = sessionOpenAt(t); for (let i = 0; i < n; i++) x = prevOpen(x); return x; };
// dni kalendarzowe historii jednej porcji dla interwału (1s/5s…: doba, 1m: 2 doby, 1h: ok. 66 dób, najwyżej 120)
export function histDays(tf) {
  const sec = parseTf(tf)?.sec ?? 60;
  if (sec < 60) return 1;
  return Math.max(2, Math.min(120, Math.ceil((HIST_BARS * sec) / (23 * 3600))));
}

// createReplayData({ fetchRange({ instruments, from, to, tf }), fetchBounds(instruments), instruments })
export function createReplayData({ fetchRange, fetchBounds, instruments = ['NQ'] } = {}) {
  const fams = [...new Set(instruments.map(famOf))];
  const repOf = new Map(instruments.map((i) => [famOf(i), i]));
  const streams = new Map(fams.map((f) => [f, { bars: [], len: [] }]));
  const listeners = new Set();
  const newsSeen = new Set();
  let bounds = null, baseFrom = 0, baseTo = 0, loading = null, news = [];
  // Wynik ensure zależy tylko od sesji kursora (wyprzedzenie i przesunięcie okna liczone w sesjach), więc w obrębie sprawdzonej sesji nic nie trzeba liczyć.
  // Kalendarz sesji (Intl.DateTimeFormat w swiece.js) jest drogi przy każdej klatce odtwarzania: [calmFrom, calmTo) = sesja, w której ensure nic nie zmienia.
  let calmFrom = Infinity, calmTo = -Infinity;
  const emit = (ev) => { for (const fn of listeners) { try { fn(ev); } catch { /* słuchacz nie blokuje danych */ } } };
  const addNews = (list) => {
    let added = false;
    for (const e of list || []) { const k = `${e.t}|${e.name}|${e.kind}`; if (newsSeen.has(k)) continue; newsSeen.add(k); news.push(e); added = true; }
    if (added) news.sort((a, b) => a.t - b.t);
  };
  const last = () => (Number.isFinite(bounds?.last) ? bounds.last : Infinity);
  const first = (inst) => { const b = bounds?.inst?.[inst] || bounds?.inst?.[repOf.get(famOf(inst))]; return Number.isFinite(b?.first) ? b.first : (bounds?.first ?? -Infinity); };

  // [from, to) w kawałkach ≤ MAX_SPAN cięte na otwarciach sesji
  function pieces(from, to) {
    const out = [];
    let a = from;
    while (a < to) {
      let b = a;
      while (b < to) { const n = Math.min(to, nextOpen(b)); if (n - a > MAX_SPAN && b > a) break; b = n; }
      out.push([a, b]); a = b;
    }
    return out;
  }
  async function readBase(from, to) {
    const parts = [];
    for (const [a, b] of pieces(from, to)) parts.push(await fetchRange({ instruments: [...repOf.values()], from: a, to: b, tf: 'base' }));
    const got = new Map(fams.map((f) => [f, { bars: [], len: [] }]));
    for (const r of parts) {
      addNews(r.news);
      for (const f of fams) {
        const q = r.inst?.[repOf.get(f)];
        if (!q) continue;
        const st = mergeBase(q.m1, q.s1, q.real1s), g = got.get(f);
        for (let i = 0; i < st.bars.length; i++) { g.bars.push(st.bars[i]); g.len.push(st.len[i]); }
      }
    }
    return got;
  }
  function append(got) {
    for (const f of fams) {
      const st = streams.get(f), g = got.get(f);
      const lastT = st.bars.length ? st.bars[st.bars.length - 1][0] : -Infinity;
      for (let i = 0; i < g.bars.length; i++) if (g.bars[i][0] > lastT) { st.bars.push(g.bars[i]); st.len.push(g.len[i]); }
    }
  }
  async function reload(cursor) {
    calmFrom = Infinity; calmTo = -Infinity;
    baseFrom = opensBefore(cursor, CTX_SESSIONS);
    const to = Math.min(opensAfter(cursor, CHUNK_SESSIONS), Math.max(nextOpen(cursor), last()));
    const got = await readBase(baseFrom, to);
    for (const f of fams) { const st = streams.get(f); st.bars.length = 0; st.len.length = 0; }
    baseTo = to;
    append(got);
  }
  async function extend() {
    if (baseTo >= last()) return false;
    const to = Math.min(opensAfter(baseTo, CHUNK_SESSIONS), Math.max(nextOpen(baseTo), last()));
    append(await readBase(baseTo, to));
    baseTo = to;
    return true;
  }
  function trim(cursor) {
    const keep = opensBefore(cursor, CTX_SESSIONS);
    if (opensAfter(baseFrom, TRIM_SESSIONS) > sessionOpenAt(cursor) || keep <= baseFrom) return null;
    const dropped = {};
    for (const f of fams) {
      const st = streams.get(f);
      let n = 0;
      while (n < st.bars.length && st.bars[n][0] < keep) n++;
      dropped[f] = { bars: st.bars.splice(0, n), len: st.len.splice(0, n) };
    }
    const from = baseFrom;
    baseFrom = keep;
    return { kind: 'trim', from, to: keep, dropped };
  }

  // Jedno doładowanie naraz; ensure czeka na trwające i sprawdza jeszcze raz.
  async function ensure(cursor) {
    if (!loading && cursor >= calmFrom && cursor < calmTo && cursor >= baseFrom && cursor <= baseTo) return null;
    while (loading) await loading.catch(() => {});
    let ev = null;
    loading = (async () => {
      if (cursor < baseFrom || cursor > baseTo + MAX_SPAN) { await reload(cursor); ev = { kind: 'reload', from: baseFrom }; return; }
      while (baseTo < last() && opensAfter(cursor, AHEAD_SESSIONS) >= baseTo) { if (!(await extend())) break; }
      ev = trim(cursor);
    })();
    try { await loading; } finally { loading = null; }
    if (ev) emit(ev);
    // sesja kursora bez potrzeby doładowania i przesunięcia: kolejne ensure w tej sesji wracają od razu
    if (!ev && (baseTo >= last() || opensAfter(cursor, AHEAD_SESSIONS) < baseTo)) { calmFrom = sessionOpenAt(cursor); calmTo = Math.min(nextOpen(cursor), baseTo); } else { calmFrom = Infinity; calmTo = -Infinity; }
    return ev;
  }

  return {
    async init(cursor) {
      bounds = await fetchBounds([...repOf.values()]);
      await reload(cursor);
      return bounds;
    },
    ensure,
    // dane wczytane do chwili t (kursor może tam stanąć bez czekania)
    covers: (t) => t <= baseTo || baseTo >= last(),
    loading: () => !!loading,
    bounds: () => bounds,
    last,
    first,
    baseFrom: () => baseFrom,
    baseTo: () => baseTo,
    stream: (inst) => streams.get(famOf(inst)) || null,
    real1s: (inst) => (bounds?.inst?.[inst] || bounds?.inst?.[repOf.get(famOf(inst))])?.real1s || [],
    news: () => news,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // Porcja historii interwału tf przed chwilą `before` (otwarcie sesji): { bars, daily, from, done }; done = doszliśmy do pierwszej świecy danych.
    async history(inst, tf, before) {
      const f = first(inst);
      if (!(before > f)) return { bars: [], daily: [], from: before, done: true };
      let a = sessionOpenAt(Math.max(f, before - histDays(tf) * 86400));
      if (a >= before) a = prevOpen(before);
      const r = await fetchRange({ instruments: [inst], from: a, to: before, tf });
      addNews(r.news);
      const q = r.inst?.[inst] || { bars: [], daily: [] };
      return { bars: q.bars.filter((b) => b[0] < before), daily: q.daily || [], from: a, done: a <= f };
    },
  };
}
