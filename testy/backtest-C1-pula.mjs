// backtest-C1: pula dni sesji: indeks pokrycia (lib/backtest-index.mjs, GET /api/backtest/days) i bt-filtr.js (matchDays bez filtra, orderDays).
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const D = (day, o = {}) => ({ day, wd: o.wd ?? 2, has1s: { NQ: o.s1 ?? true }, has1m: { ES: o.es ?? true, NQ: o.nq ?? true } });

  test('backtest-C1: dni bez danych wykluczone z powodem', async () => {
    const { matchDays } = await imp('public/js/bt-filtr.js');
    const days = [D('2024-03-11'), D('2024-03-12', { s1: false }), D('2024-03-13', { es: false }), D('2024-03-14'), D('2024-03-15', { s1: false, es: false }), D('2024-03-18')];
    const r = matchDays({ instruments: ['NQ', 'ES'], from: '2024-03-11', to: '2024-03-15', filter: null, excluded: [] }, days);
    assert.deepEqual(r.days, ['2024-03-11', '2024-03-14']);
    assert.deepEqual(r.excluded, [{ day: '2024-03-12', reason: 'no1s' }, { day: '2024-03-13', reason: 'no1m' }, { day: '2024-03-15', reason: 'no1s' }]);
    // ES sam: brak 1s niczego nie wyklucza
    const es = matchDays({ instruments: ['ES'], from: '2024-03-11', to: '2024-03-15', filter: null, excluded: [] }, days);
    assert.deepEqual(es.days, ['2024-03-11', '2024-03-12', '2024-03-14']);
    assert.deepEqual(es.excluded.map((x) => [x.day, x.reason]), [['2024-03-13', 'no1m'], ['2024-03-15', 'no1m']]);
    // MNQ wymaga 1s NQ, MES 1m ES
    const micro = matchDays({ instruments: ['MNQ', 'MES'], from: '2024-03-11', to: '2024-03-13', filter: null, excluded: [] }, days);
    assert.deepEqual(micro.days, ['2024-03-11']);
    // indeks: weekend nie występuje w ogóle, pokrycie z magazynu świec
    const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
    const { createDayIndex, INDEX_VERSION } = await imp('lib/backtest-index.mjs');
    const baseDir = H.tmp();
    await syntheticDay(baseDir, { instrument: 'NQ', day: '2024-03-12', seed: 3 });
    await syntheticDay(baseDir, { instrument: 'NQ', day: '2024-03-14', seed: 4, has1s: false });
    await syntheticDay(baseDir, { instrument: 'ES', day: '2024-03-12', seed: 5, has1s: false });
    const idx = createDayIndex({ baseDir });
    const g = idx.get({ instruments: ['NQ', 'ES'], from: '2024-03-08', to: '2024-03-17' });
    assert.equal(g.version, INDEX_VERSION);
    assert.deepEqual(g.days.map((d) => d.day), ['2024-03-08', '2024-03-11', '2024-03-12', '2024-03-13', '2024-03-14', '2024-03-15']);
    const by = Object.fromEntries(g.days.map((d) => [d.day, d]));
    assert.equal(by['2024-03-12'].wd, 2); assert.equal(by['2024-03-08'].wd, 5);
    assert.equal(by['2024-03-12'].has1s.NQ, true);
    assert.equal(by['2024-03-14'].has1s.NQ, false, 'dzień bez 1s');
    assert.equal(by['2024-03-12'].has1m.ES, true);
    assert.equal(by['2024-03-13'].has1m.ES, false);
    assert.equal(by['2024-03-14'].has1m.NQ, true);
    assert.equal(by['2024-03-15'].has1m.NQ, false);
    assert.ok(!('ES' in by['2024-03-12'].has1s), 'ES nie ma 1s');
    const m = matchDays({ instruments: ['NQ'], from: '2024-03-08', to: '2024-03-17', filter: null, excluded: [] }, g.days);
    assert.deepEqual(m.days, ['2024-03-12']);
    assert.deepEqual(m.excluded.find((x) => x.day === '2024-03-14'), { day: '2024-03-14', reason: 'no1s' });
    for (const bad of [{ from: '2024-3-1', to: '2024-03-02' }, { from: '2024-03-10', to: '2024-03-01' }, { from: '2024-03-01', to: '2024-03-02', instruments: ['GC'] }, { from: '1990-01-01', to: '2024-01-01' }]) {
      assert.throws(() => idx.get({ instruments: ['NQ'], ...bad }), (e) => e.status === 400, JSON.stringify(bad));
    }
  });

  test('backtest-C1: ręcznie wyrzucony dzień i dni zrobione', async () => {
    const { matchDays } = await imp('public/js/bt-filtr.js');
    const days = [D('2024-03-11'), D('2024-03-12'), D('2024-03-13'), D('2024-03-14', { s1: false })];
    const r = matchDays({ instruments: ['NQ'], from: '2024-03-11', to: '2024-03-14', filter: null, excluded: ['2024-03-12'] }, days, { done: ['2024-03-13'] });
    assert.deepEqual(r.days, ['2024-03-11']);
    assert.deepEqual(r.excluded, [{ day: '2024-03-12', reason: 'manual' }, { day: '2024-03-13', reason: 'done' }, { day: '2024-03-14', reason: 'no1s' }]);
    // done także z def.done (kopia definicji), poza zakresem dat dzień nie występuje nigdzie
    const r2 = matchDays({ instruments: ['NQ'], from: '2024-03-12', to: '2024-03-13', filter: null, excluded: [], done: ['2024-03-12'] }, days);
    assert.deepEqual(r2.days, ['2024-03-13']);
    assert.deepEqual(r2.excluded, [{ day: '2024-03-12', reason: 'done' }]);
  });

  // K (31.10.2026): „backtest-C1: kolejność” (orderDays chrono/newest/random) zastąpiony: kolejność dni usunięta ([U] «Filtr jako skok»), dni z filtra rosnąco dla skoku
  test('backtest-K: dni z filtra rosnąco, bez kolejności losowej', async () => {
    const F = await imp('public/js/bt-filtr.js');
    assert.equal(F.orderDays, undefined, 'orderDays usunięte');
    const days = ['2024-03-13', '2024-03-11', '2024-03-12'].map((day) => ({ day, has1s: { NQ: true }, has1m: { NQ: true }, wd: 1 }));
    assert.deepEqual(F.matchDays({ instruments: ['NQ'], from: '2024-03-11' }, days).days, ['2024-03-11', '2024-03-12', '2024-03-13'], 'bez daty końca: do końca indeksu');
  });

  test('backtest-C1: trasa /api/backtest/days', async () => {
    const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
    const A = await H.atrapa(4874);
    const dir = H.tmp();
    await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
    const S = await H.server(4875, { NOTION_API_BASE: A.base, NOTION_TOKEN: 'secret_x', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_CONFIG_DIR: dir });
    try {
      const r = await fetch(S.base + '/api/backtest/days?instruments=NQ&from=2024-03-11&to=2024-03-13');
      assert.equal(r.status, 200);
      const j = await r.json();
      assert.deepEqual(j.days.map((x) => [x.day, x.has1s.NQ]), [['2024-03-11', false], ['2024-03-12', true], ['2024-03-13', false]]);
      assert.equal((await fetch(S.base + '/api/backtest/days?instruments=NQ&from=2024-03-13&to=2024-03-11')).status, 400);
    } finally { S.stop(); A.stop(); }
  });
};
