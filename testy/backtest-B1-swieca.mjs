// backtest-B1: strumień bazowy i świeca w budowie (public/js/bt-swieca.js). Dane wyłącznie syntetyczne (testy/bt-dane-syntetyczne.mjs).
// Gwarancja §2 i 18a.1: żadna świeca z t > kursor, świeca wyższego TF = agregat niższych do kursora.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const noNews = { range: (from, to) => ({ from, to, events: [] }) };
  const DAY = '2024-03-12';
  const cache = new Map();
  async function dayOf(opts = {}) {
    const k = JSON.stringify(opts);
    if (cache.has(k)) return cache.get(k);
    const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
    const { createCandles } = await imp('lib/candles.mjs');
    const { createReplayDay } = await imp('lib/backtest-day.mjs');
    const baseDir = H.tmp();
    await syntheticDay(baseDir, { instrument: 'NQ', day: DAY, seed: 11, ...opts });
    const candles = createCandles({ getKey: () => null, getConfig: () => ({}), baseDir });
    const r = await createReplayDay({ candles, news: noNews, earnings: noNews }).read({ instruments: ['NQ'], day: DAY });
    cache.set(k, r);
    return r;
  }
  const mod = () => imp('public/js/bt-swieca.js');
  const ny = (h, m, s = 0) => Date.UTC(2024, 2, 12, h + 4, m, s) / 1000; // 12.03.2024: czas letni NY (UTC−4)
  // deterministyczne liczby losowe testu
  const rnd = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const ohlcv = (b) => b.slice(1, 6);

  test('backtest-B1: brak przyszłości', async () => {
    const { mergeBase, visibleCount, candlesAt, REPLAY_TFS } = await mod();
    const r = await dayOf(), q = r.inst.NQ;
    const st = mergeBase(q.m1, q.s1, q.real1s);
    assert.equal(st.bars.length, st.len.length);
    const { ctxFrom, end } = r.times;
    const R = rnd(7);
    for (let i = 0; i < 500; i++) {
      // połowa kursorów w oknie 1s (tam jest najwięcej świec bazowych), reszta w całym dniu
      const C = i % 2 ? Math.floor(ctxFrom + R() * (end - ctxFrom)) : Math.floor(r.times.open + R() * 5400);
      const n = visibleCount(st, C);
      for (let k = 0; k < n; k++) if (st.bars[k][0] + st.len[k] > C) assert.fail(`świeca bazowa ${st.bars[k][0]} z przyszłości przy ${C}`);
      if (n < st.bars.length) assert.ok(st.bars[n][0] + st.len[n] > C, 'visibleCount pomija widoczną świecę');
      for (const tf of REPLAY_TFS) {
        const out = candlesAt(st, tf, C);
        for (const b of out) if (b[0] > C) assert.fail(`${tf}: świeca ${b[0]} > kursor ${C}`);
      }
    }
  });

  test('backtest-B1: zgodność TF w tej samej chwili', async () => {
    const { mergeBase, candlesAt } = await mod();
    const { aggregate } = await imp('public/js/swiece.js');
    const q = (await dayOf()).inst.NQ;
    const st = mergeBase(q.m1, q.s1, q.real1s);
    const C = ny(10, 7, 23), min = ny(10, 7);
    const last = (a) => a[a.length - 1];
    const m1 = last(candlesAt(st, '1m', C));
    assert.equal(m1[0], min);
    for (const tf of ['15s', '5s', '1s']) {
      const parts = candlesAt(st, tf, C).filter((b) => b[0] >= min);
      assert.ok(parts.length > 0, tf);
      assert.deepEqual(ohlcv(aggregate(parts, '1m')[0]), ohlcv(m1), `1m ≠ agregat ${tf}`);
    }
    const m5 = last(candlesAt(st, '5m', C));
    assert.equal(m5[0], ny(10, 5));
    const ones = candlesAt(st, '1m', C).filter((b) => b[0] >= ny(10, 5));
    assert.deepEqual(ohlcv(aggregate(ones, '5m')[0]), ohlcv(m5));
  });

  test('backtest-B1: przejście 1m → 1s o 9:30', async () => {
    const { mergeBase, candlesAt } = await mod();
    const q = (await dayOf()).inst.NQ;
    const st = mergeBase(q.m1, q.s1, q.real1s);
    const out = candlesAt(st, '15s', ny(9, 31));
    assert.deepEqual(out.slice(-6).map((b) => b[0]), [ny(9, 28), ny(9, 29), ny(9, 30), ny(9, 30, 15), ny(9, 30, 30), ny(9, 30, 45)]);
    const ts = out.map((b) => b[0]);
    assert.equal(new Set(ts).size, ts.length, 'dubel świecy');
  });

  test('backtest-B1: po 11:00 świece bazowe są 1m', async () => {
    const { mergeBase } = await mod();
    const r = await dayOf(), q = r.inst.NQ;
    const st = mergeBase(q.m1, q.s1, q.real1s);
    const { open, w1sEnd } = r.times;
    let after = 0, inside = 0;
    st.bars.forEach((b, i) => {
      if (b[0] >= w1sEnd) { after++; assert.equal(st.len[i], 60); }
      else if (b[0] >= open) { inside++; assert.equal(st.len[i], 1); }
      else assert.equal(st.len[i], 60);
    });
    assert.ok(after > 200 && inside > 5000);
    for (let i = 1; i < st.bars.length; i++) assert.ok(st.bars[i][0] >= st.bars[i - 1][0] + st.len[i - 1], 'świece bazowe zachodzą na siebie');
  });

  test('backtest-B1: luka w 1s', async () => {
    const { mergeBase, candlesAt } = await mod();
    const g0 = ny(10, 0, 5), g1 = ny(10, 0, 20);
    const r = await dayOf({ gaps: [[g0, g1]] }), q = r.inst.NQ;
    assert.equal(q.has1s, true);
    const st = mergeBase(q.m1, q.s1, q.real1s);
    assert.ok(!st.bars.some((b) => b[0] >= g0 && b[0] < g1));
    const at = (C) => candlesAt(st, '1s', C);
    // kursor w luce: żadnych nowych świec
    const before = at(g0).length;
    for (let C = g0; C <= g1; C++) assert.equal(at(C).length, before);
    // świeca w budowie 15s (10:00:15) przy kursorze 10:00:19: brak sekund, więc jej nie ma; przy 10:00:30 ma OHLC tylko z 10:00:20..29
    const s15 = (C) => candlesAt(st, '15s', C);
    assert.notEqual(s15(ny(10, 0, 19)).at(-1)[0], ny(10, 0, 15));
    const b = s15(ny(10, 0, 30)).at(-1);
    assert.equal(b[0], ny(10, 0, 15));
    const secs = q.s1.filter((x) => x[0] >= ny(10, 0, 20) && x[0] < ny(10, 0, 30));
    assert.equal(b[1], secs[0][1]); assert.equal(b[4], secs.at(-1)[4]);
    assert.equal(b[2], Math.max(...secs.map((x) => x[2]))); assert.equal(b[3], Math.min(...secs.map((x) => x[3])));
    // kolejne sekundy dalej dokładają świece
    assert.equal(at(g1 + 5).length, before + 5);
  });

  test('backtest-B1: builder = wzorzec', async () => {
    const { mergeBase, visibleCount, candlesAt, createBuilder } = await mod();
    const r = await dayOf(), q = r.inst.NQ;
    const st = mergeBase(q.m1, q.s1, q.real1s);
    const { ctxFrom, end, open } = r.times;
    const bld = createBuilder(st, '1m');
    const R = rnd(42);
    let C = open - 1800, prevC = -Infinity, prevN = 0;
    const steps = [1, -1, 60, -60, 3600, -3600, 1, 1, 1, 60];
    const kinds = { reset: 0, update: 0, append: 0 };
    for (let i = 0; i < 2000; i++) {
      const s = steps[Math.floor(R() * steps.length)];
      C = Math.max(ctxFrom, Math.min(end, C + s));
      const u = bld.seek(C);
      kinds[u.kind]++;
      const n = visibleCount(st, C);
      assert.deepEqual(bld.bars(), candlesAt(st, '1m', C), `krok ${i}, kursor ${C}`);
      if (C < prevC || n - prevN > 600) assert.equal(u.kind, 'reset', `cofnięcie/skok bez resetu (krok ${i})`);
      else assert.ok(u.kind === 'update' || u.kind === 'append', `mały krok w przód: ${u.kind} (krok ${i})`);
      if (u.kind === 'reset') assert.deepEqual(u.bars, candlesAt(st, '1m', C));
      prevC = C; prevN = n;
    }
    assert.ok(kinds.reset > 0 && kinds.update > 0 && kinds.append > 0, JSON.stringify(kinds));
  });

  test('backtest-B1: koszt kroku', async () => {
    const { mergeBase, createBuilder } = await mod();
    const r = await dayOf(), q = r.inst.NQ;
    const st = mergeBase(q.m1, q.s1, q.real1s);
    const C0 = r.times.open;
    const a = createBuilder(st, '15s'), b = createBuilder(st, '1m');
    a.seek(C0); b.seek(C0);
    const t0 = performance.now();
    for (let C = C0 + 1; C <= C0 + 5400; C++) {
      if (a.seek(C).kind === 'reset' || b.seek(C).kind === 'reset') assert.fail(`reset przy ${C}`);
    }
    const ms = performance.now() - t0;
    assert.ok(ms < 150, `5 400 kroków na 15s i 1m: ${ms.toFixed(1)} ms`);
  });
};
