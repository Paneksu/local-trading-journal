// backtest-K: API zakresu replayu (lib/backtest-range.mjs, GET /api/backtest/range i /api/backtest/bounds) zamiast dnia replayu z 1.5.0.
// Zastępuje testy backtest-A (dzień replayu). Dane wyłącznie syntetyczne w katalogach tymczasowych.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const noNews = { range: (from, to) => ({ from, to, events: [{ t: from + 10, name: 'X', imp: 'high', day: '2024-03-12', kind: 'news' }] }) };
  const noEarn = { range: (from, to) => ({ from, to, events: [] }) };
  const W = {};
  async function setup() {
    const { syntheticDay, dayRange } = await imp('testy/bt-dane-syntetyczne.mjs');
    const { createCandles } = await imp('lib/candles.mjs');
    const { createReplayRange } = await imp('lib/backtest-range.mjs');
    const baseDir = H.tmp();
    await syntheticDay(baseDir, { instrument: 'NQ', day: '2024-03-13', seed: 8 });
    await syntheticDay(baseDir, { instrument: 'NQ', day: '2024-03-12', seed: 3 });
    await syntheticDay(baseDir, { instrument: 'ES', day: '2024-03-12', seed: 5, has1s: true });
    const candles = createCandles({ getKey: () => null, getConfig: () => ({}), baseDir });
    W.baseDir = baseDir;
    return { rr: createReplayRange({ candles, news: noNews, earnings: noEarn, baseDir }), d12: await dayRange('2024-03-12'), d13: await dayRange('2024-03-13') };
  }

  test('backtest-K: zakres bazowy przez noc i dwa dni: 1m wszędzie, prawdziwe 1s tylko w oknach NQ', async () => {
    const { rr, d12, d13 } = await setup();
    const r = rr.read({ instruments: ['NQ', 'MNQ', 'ES'], from: d12.ctxFrom, to: d13.end, tf: 'base' });
    const q = r.inst.NQ;
    assert.equal(q.data, 'NQ');
    assert.deepEqual(r.inst.MNQ, q, 'MNQ czyta dane NQ');
    assert.ok(q.m1[0][0] === d12.ctxFrom && q.m1[q.m1.length - 1][0] >= d13.end - 120, 'm1 od początku do końca zakresu, przez noc');
    assert.ok(q.m1.some((b) => b[0] > d12.end && b[0] < d13.open), 'świece nocy między dniami');
    assert.deepEqual(q.real1s, [[d12.open, d12.w1sEnd], [d13.open, d13.w1sEnd]], 'pokrycie 1s z obu dni');
    assert.ok(q.s1.length === 2 * 5400 && q.s1.every((b) => (b[0] >= d12.open && b[0] < d12.w1sEnd) || (b[0] >= d13.open && b[0] < d13.w1sEnd)));
    assert.ok(q.m1[0][1] > 1000 && q.m1[0][1] < 100000, 'ceny w punktach');
    assert.deepEqual(r.inst.ES.s1, [], 'ES tylko 1m'); assert.deepEqual(r.inst.ES.real1s, []);
    assert.ok(r.inst.ES.m1.length > 1000);
    assert.ok(Array.isArray(r.news) && r.news.length === 1 && Array.isArray(r.earnings));
  });

  test('backtest-K: historia wykresu zagregowana na serwerze = agregat strumienia bazowego (5m, 15s) + świece 1D', async () => {
    const { rr, d12, d13 } = await setup();
    const { mergeBase } = await imp('public/js/bt-swieca.js');
    const { aggregate } = await imp('public/js/swiece.js');
    const b = rr.read({ instruments: ['NQ'], from: d12.ctxFrom, to: d13.end, tf: 'base' }).inst.NQ;
    const st = mergeBase(b.m1, b.s1, b.real1s);
    for (const tf of ['5m', '15s', '1h']) {
      const h = rr.read({ instruments: ['NQ'], from: d12.ctxFrom, to: d13.end, tf });
      assert.deepEqual(h.inst.NQ.bars, aggregate(st.bars, tf), `historia ${tf} = agregat strumienia bazowego`);
      assert.ok(h.inst.NQ.daily.length >= 2, `świece 1D (${tf})`);
    }
  });

  test('backtest-K: granice danych (pierwsza i ostatnia świeca, pokrycie 1s)', async () => {
    const { rr, d12, d13 } = await setup();
    const g = rr.bounds({ instruments: ['NQ', 'ES'] });
    assert.equal(g.inst.NQ.first, d12.ctxFrom);
    assert.equal(g.inst.NQ.last, d13.end, 'ostatnia świeca + 60 s');
    assert.deepEqual(g.inst.NQ.real1s, [[d12.open, d12.w1sEnd], [d13.open, d13.w1sEnd]]);
    assert.deepEqual(g.inst.ES.real1s, []);
    assert.equal(g.first, d12.ctxFrom); assert.equal(g.last, d13.end);
  });

  // Znalezione na kopii prawdziwych świec (31.10.2026): pokrycie 1m obejmuje lata bez plików (kopia od 2019-09, pokrycie od 2010), granice liczone z plików dni
  test('backtest-K: granice danych przy pokryciu szerszym niż pliki świec', async () => {
    const { rr, d12, d13 } = await setup();
    const { readFileSync, writeFileSync } = await import('node:fs');
    const g0 = rr.bounds({ instruments: ['NQ'] });
    assert.equal(g0.inst.NQ.first, d12.ctxFrom); assert.equal(g0.inst.NQ.last, d13.end);
    const cf = path.join(W.baseDir, 'candles', 'NQ', 'coverage.json');
    const c = JSON.parse(readFileSync(cf, 'utf8'));
    c['1m'] = [[Date.UTC(2010, 5, 1) / 1000, Date.UTC(2026, 9, 28) / 1000]];
    writeFileSync(cf, JSON.stringify(c));
    const g = rr.bounds({ instruments: ['NQ'] });
    assert.equal(g.inst.NQ.first, d12.ctxFrom, 'pierwsza świeca, nie początek pokrycia');
    assert.equal(g.inst.NQ.last, d13.end, 'ostatnia świeca, nie koniec pokrycia');
  });

  test('backtest-K: walidacja i limity zakresu', async () => {
    const { rr, d12 } = await setup();
    const o = d12.open;
    for (const q of [{ instruments: ['XX'], from: o, to: o + 60 }, { instruments: [], from: o, to: o + 60 }, { instruments: ['NQ'], from: o, to: o }, { instruments: ['NQ'], from: 'a', to: o }, { instruments: ['NQ'], from: o, to: o + 60, tf: '7m' }]) {
      assert.throws(() => rr.read(q), (e) => e.status === 400, JSON.stringify(q));
    }
    assert.throws(() => rr.read({ instruments: ['NQ'], from: o, to: o + 9 * 86400, tf: 'base' }), (e) => e.status === 422 && e.code === 'too-long');
    assert.throws(() => rr.read({ instruments: ['NQ'], from: o, to: o + 9 * 86400, tf: '5s' }), (e) => e.status === 422);
    assert.throws(() => rr.bounds({ instruments: ['NQ', 'ES', 'MNQ', 'MES', 'NQ2'] }), (e) => e.status === 400);
  });

  test('backtest-K: trasy /api/backtest/range i /api/backtest/bounds, bez trasy dnia', async () => {
    const { syntheticDay, dayRange } = await imp('testy/bt-dane-syntetyczne.mjs');
    const dir = H.tmp();
    await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
    const d = await dayRange('2024-03-12');
    const S = await H.server(4891, { THQ_CONFIG_DIR: dir });
    try {
      const get = (u, h = {}) => fetch(S.base + u, { headers: h });
      const ok = await get(`/api/backtest/range?instruments=NQ&from=${d.ctxFrom}&to=${d.end}&tf=base`);
      assert.equal(ok.status, 200);
      assert.equal(ok.headers.get('cache-control'), 'no-store');
      const j = await ok.json();
      assert.deepEqual(Object.keys(j).sort(), ['earnings', 'from', 'inst', 'news', 'tf', 'to']);
      assert.ok(j.inst.NQ.s1.length === 5400);
      const h = await (await get(`/api/backtest/range?instruments=NQ&from=${d.ctxFrom}&to=${d.end}&tf=1h`)).json();
      assert.ok(h.inst.NQ.bars.length > 20 && h.inst.NQ.bars.every((b) => b[0] < d.end));
      const g = await (await get('/api/backtest/bounds?instruments=NQ')).json();
      assert.equal(g.last, d.end);
      assert.equal((await get(`/api/backtest/range?instruments=NQ&from=${d.open}&to=${d.open - 1}`)).status, 400);
      assert.equal((await get(`/api/backtest/range?instruments=NQ&from=${d.ctxFrom}&to=${d.end}`, { 'sec-fetch-site': 'cross-site' })).status, 403, 'obca strona');
      assert.equal((await get('/api/backtest/bounds?instruments=NQ', { 'sec-fetch-site': 'cross-site' })).status, 403);
      assert.equal((await get('/api/backtest/day?instruments=NQ&day=2024-03-12')).status, 404, 'trasa dnia replayu usunięta');
    } finally { S.stop(); }
  });
};
