// backtest-A: API dnia replayu (lib/backtest-day.mjs, GET /api/backtest/day). Dane wyłącznie syntetyczne w katalogach tymczasowych.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const utc = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
  const noNews = { range: (from, to) => ({ from, to, events: [] }) };
  const noEarn = { range: (from, to) => ({ from, to, events: [] }) };
  async function setup(days) {
    const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
    const { createCandles } = await imp('lib/candles.mjs');
    const { createReplayDay, dayTimes } = await imp('lib/backtest-day.mjs');
    const baseDir = H.tmp();
    for (const d of days) await syntheticDay(baseDir, d);
    const candles = createCandles({ getKey: () => null, getConfig: () => ({}), baseDir });
    return { replay: createReplayDay({ candles, news: noNews, earnings: noEarn }), dayTimes, baseDir };
  }

  test('backtest-A: dayTimes w czasie letnim i zimowym', async () => {
    const { dayTimes } = await imp('lib/backtest-day.mjs');
    const s = dayTimes('2024-03-12'), w = dayTimes('2024-01-10');
    assert.equal(s.open, Date.UTC(2024, 2, 12, 13, 30) / 1000);
    assert.equal(w.open, Date.UTC(2024, 0, 10, 14, 30) / 1000);
    for (const x of [s, w]) { assert.equal(x.end - x.open, 6.5 * 3600); assert.equal(x.w1sEnd - x.open, 5400); }
    assert.throws(() => dayTimes('2024-13-40'), /dzień/);
  });

  test('backtest-A: dzień NQ ma m1 z kontekstem i s1 tylko z okna', async () => {
    const { replay } = await setup([{ instrument: 'NQ', day: '2024-03-12', seed: 3 }]);
    const r = await replay.read({ instruments: ['NQ'], day: '2024-03-12' });
    const { open, w1sEnd, end, ctxFrom } = r.times;
    assert.equal(r.day, '2024-03-12'); assert.equal(r.tz, 'America/New_York');
    const q = r.inst.NQ;
    assert.equal(q.data, 'NQ');
    assert.ok(q.s1.length > 5000 && q.s1.every((b) => b[0] >= open && b[0] < w1sEnd));
    assert.equal(q.m1[0][0], ctxFrom);
    assert.ok(q.m1[q.m1.length - 1][0] < end && q.m1[q.m1.length - 1][0] >= end - 120);
    assert.ok(ctxFrom < open - 2 * 86400 + 86400, 'kontekst sięga dwóch sesji wstecz');
    assert.equal(q.has1s, true);
    assert.deepEqual(q.real1s, [[open, w1sEnd]]);
    assert.equal(q.m1[0].length, 6);
    assert.ok(Array.isArray(r.news) && Array.isArray(r.earnings));
    // ceny w punktach (nie ×100)
    assert.ok(q.m1[0][1] > 1000 && q.m1[0][1] < 100000);
  });

  test('backtest-A: MNQ czyta dane NQ', async () => {
    const { replay } = await setup([{ instrument: 'NQ', day: '2024-03-12', seed: 3 }]);
    const r = await replay.read({ instruments: ['MNQ', 'NQ'], day: '2024-03-12' });
    assert.equal(r.inst.MNQ.data, 'NQ');
    assert.deepEqual(r.inst.MNQ.m1, r.inst.NQ.m1);
  });

  test('backtest-A: ES ma tylko 1m (także gdy w danych są stare okna 1s)', async () => {
    const { replay } = await setup([{ instrument: 'ES', day: '2024-03-12', seed: 5, has1s: true }]);
    const r = await replay.read({ instruments: ['ES', 'MES'], day: '2024-03-12' });
    for (const i of ['ES', 'MES']) {
      const q = r.inst[i];
      assert.equal(q.data, 'ES'); assert.deepEqual(q.s1, []); assert.deepEqual(q.real1s, []); assert.equal(q.has1s, false);
      assert.ok(q.m1.length > 1000);
    }
  });

  test('backtest-A: dzień NQ bez 1s ma has1s=false i pusty s1', async () => {
    const { replay } = await setup([{ instrument: 'NQ', day: '2024-03-12', seed: 4, has1s: false }]);
    const q = (await replay.read({ instruments: ['NQ'], day: '2024-03-12' })).inst.NQ;
    assert.equal(q.has1s, false); assert.deepEqual(q.s1, []); assert.deepEqual(q.real1s, []);
    assert.ok(q.m1.length > 1000);
  });

  test('backtest-A: dziura w 1s: pokrycie zostaje, świec w dziurze nie ma, has1s=true', async () => {
    const open = utc(2024, 3, 12, 13, 30);
    const { replay } = await setup([{ instrument: 'NQ', day: '2024-03-12', seed: 6, gaps: [[open + 600, open + 610], open + 900] }]);
    const q = (await replay.read({ instruments: ['NQ'], day: '2024-03-12' })).inst.NQ;
    assert.equal(q.has1s, true);
    assert.equal(q.s1.length, 5400 - 11);
    assert.ok(!q.s1.some((b) => (b[0] >= open + 600 && b[0] < open + 610) || b[0] === open + 900));
  });

  test('backtest-A: s1 nie zawiera świec syntetycznych', async () => {
    const { replay } = await setup([{ instrument: 'NQ', day: '2024-03-12', seed: 3 }]);
    const q = (await replay.read({ instruments: ['NQ'], day: '2024-03-12' })).inst.NQ;
    assert.ok(q.s1.every((b) => b.length === 6));
    assert.ok(q.m1.every((b) => b.length === 6));
  });

  test('backtest-A: walidacja wejścia modułu', async () => {
    const { replay } = await setup([]);
    for (const bad of [{ instruments: ['NQ'], day: '2024-3-1' }, { instruments: ['NQ'], day: '2024-02-31' }, { instruments: ['XX'], day: '2024-03-12' }, { instruments: [], day: '2024-03-12' }, { instruments: ['NQ'], day: '2024-03-12', ctx: 9 }]) {
      await assert.rejects(async () => replay.read(bad), (e) => e.status === 400, JSON.stringify(bad));
    }
  });

  test('backtest-A: trasa /api/backtest/day', async () => {
    const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
    const A = await H.atrapa(4870);
    const dir = H.tmp();
    await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
    const S = await H.server(4871, { NOTION_API_BASE: A.base, NOTION_TOKEN: 'secret_x', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_CONFIG_DIR: dir });
    try {
      const get = (q, h = {}) => fetch(S.base + '/api/backtest/day?' + q, { headers: h });
      const ok = await get('instruments=NQ,MNQ&day=2024-03-12&ctx=2');
      assert.equal(ok.status, 200);
      assert.equal(ok.headers.get('cache-control'), 'no-store');
      const j = await ok.json();
      assert.deepEqual(Object.keys(j).sort(), ['day', 'earnings', 'inst', 'news', 'times', 'tz']);
      assert.deepEqual(Object.keys(j.times).sort(), ['ctxFrom', 'end', 'open', 'w1sEnd']);
      assert.deepEqual(Object.keys(j.inst).sort(), ['MNQ', 'NQ']);
      assert.equal(j.inst.NQ.has1s, true);
      assert.equal(j.inst.NQ.s1.length, 5400);
      assert.equal((await get('instruments=NQ&day=2024-03-1')).status, 400);
      assert.equal((await get('instruments=NQ&day=2024-02-31')).status, 400);
      assert.equal((await get('instruments=GC&day=2024-03-12')).status, 400);
      assert.equal((await get('day=2024-03-12')).status, 400);
      assert.equal((await get('instruments=NQ&day=2024-03-12', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    } finally { S.stop(); A.stop(); }
  });
};
