// backtest-C1: magazyn sesji (lib/backtest-store.mjs) i trasy /api/backtest/session*. Katalogi tymczasowe, dane syntetyczne.
import { pathToFileURL } from 'node:url';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const doc = (o = {}) => ({ v: 1, name: 'Sesja testowa', def: { instruments: ['NQ'], from: '2024-03-01', to: '2024-03-29', order: 'chrono' }, pool: ['2024-03-12', '2024-03-13'], dayIdx: 0, cursor: 0, days: {}, trades: [], ...o });

  test('backtest-C1: zapis atomowy i odczyt sesji', async () => {
    const { createBacktestStore } = await imp('lib/backtest-store.mjs');
    const base = H.tmp();
    const st = createBacktestStore({ baseDir: base });
    const dir = path.join(base, 'backtest', 'sessions');
    const r1 = st.save('bt-abc123', doc(), 0);
    assert.equal(r1.rev, 1);
    assert.ok(existsSync(path.join(dir, 'bt-abc123.json')));
    assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.tmp')), [], 'bez pliku .tmp po zapisie');
    const d1 = st.read('bt-abc123');
    assert.equal(d1.rev, 1); assert.equal(d1.id, 'bt-abc123'); assert.equal(d1.name, 'Sesja testowa');
    assert.ok(d1.updated, 'magazyn stempluje updated');
    const r2 = st.save('bt-abc123', { ...d1, cursor: 123 }, 1);
    assert.equal(r2.rev, 2);
    const d2 = st.read('bt-abc123');
    assert.equal(d2.rev, 2); assert.equal(d2.cursor, 123);
    assert.equal(st.read('bt-nieistnieje'), null);
  });

  test('backtest-C1: konflikt wersji', async () => {
    const { createBacktestStore } = await imp('lib/backtest-store.mjs');
    const base = H.tmp();
    const st = createBacktestStore({ baseDir: base });
    st.save('bt-konflikt', doc(), 0);
    st.save('bt-konflikt', doc({ cursor: 5 }), 1);
    const file = path.join(base, 'backtest', 'sessions', 'bt-konflikt.json');
    const before = readFileSync(file, 'utf8');
    assert.throws(() => st.save('bt-konflikt', doc({ cursor: 9 }), 1), (e) => e.status === 409 && e.code === 'stale');
    assert.throws(() => st.save('bt-konflikt', doc({ cursor: 9 }), 0), (e) => e.status === 409 && e.code === 'stale', 'nowa sesja o zajętym id');
    assert.equal(readFileSync(file, 'utf8'), before, 'plik bez zmian');
    assert.throws(() => st.save('bt-nowa111', doc(), 3), (e) => e.status === 409 && e.code === 'stale', 'brak pliku, a klient myśli, że jest');
  });

  test('backtest-C1: zły identyfikator', async () => {
    const { createBacktestStore, SESSION_ID_RE } = await imp('lib/backtest-store.mjs');
    const base = H.tmp();
    const st = createBacktestStore({ baseDir: base });
    for (const id of ['../x', 'BT-1', 'bt-', 'bt-abc', 'bt-abc/../../x', 'bt-' + 'a'.repeat(21), '', null, 7]) {
      assert.equal(SESSION_ID_RE.test(String(id)), false, String(id));
      assert.throws(() => st.save(id, doc(), 0), (e) => e.status === 400, String(id));
      assert.throws(() => st.read(id), (e) => e.status === 400, String(id));
    }
    assert.throws(() => st.save('bt-dobre123', [], 0), (e) => e.status === 400, 'dokument musi być obiektem');
    assert.throws(() => st.save('bt-dobre123', 'x', 0), (e) => e.status === 400);
    assert.deepEqual(readdirSync(base), [], 'nic nie powstało');
  });

  test('backtest-C1: lista sesji', async () => {
    const { createBacktestStore } = await imp('lib/backtest-store.mjs');
    const base = H.tmp();
    const logs = [];
    let clock = Date.UTC(2026, 9, 30, 10, 0);
    const st = createBacktestStore({ baseDir: base, log: (...a) => logs.push(a.join(' ')), now: () => clock });
    st.save('bt-starsza1', doc({ name: 'Starsza', def: { instruments: ['ES'] }, pool: ['2024-01-02', '2024-01-03', '2024-01-04'], days: { '2024-01-02': { status: 'done' } }, trades: [{ id: 't1', r: 2 }, { id: 't2', r: -1 }, { id: 't3', r: null }] }), 0);
    clock += 60_000;
    st.save('bt-nowsza1', doc({ name: 'Nowsza', opened: '2026-10-30T09:00:00.000Z' }), 0);
    mkdirSync(path.join(base, 'backtest', 'sessions'), { recursive: true });
    writeFileSync(path.join(base, 'backtest', 'sessions', 'bt-zepsuta1.json'), '{ nie json');
    writeFileSync(path.join(base, 'backtest', 'sessions', 'obcy.json'), '{}');
    const l = st.list();
    assert.deepEqual(l.map((s) => s.id), ['bt-nowsza1', 'bt-starsza1']);
    const s = l[1];
    for (const k of ['id', 'name', 'instruments', 'done', 'pool', 'sumR', 'lastOpened']) assert.ok(k in s, k);
    assert.deepEqual(s.instruments, ['ES']); assert.equal(s.done, 1); assert.equal(s.pool, 3); assert.equal(s.sumR, 1); assert.equal(s.trades, 3);
    assert.equal(l[0].lastOpened, '2026-10-30T09:00:00.000Z');
    assert.equal(s.lastOpened, s.updated, 'bez otwarcia: ostatnia zmiana');
    assert.ok(logs.some((x) => x.includes('bt-zepsuta1')), 'uszkodzony plik w logu');
  });

  test('backtest-C1: trasy chronione', async () => {
    const A = await H.atrapa(4872);
    const dir = H.tmp();
    const S = await H.server(4873, { NOTION_API_BASE: A.base, NOTION_TOKEN: 'secret_x', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_CONFIG_DIR: dir });
    try {
      const url = S.base + '/api/backtest/session/save';
      const body = JSON.stringify({ id: 'bt-trasa001', doc: doc(), rev: 0 });
      const post = (headers, b = body) => fetch(url, { method: 'POST', headers, body: b });
      assert.equal((await post({ Origin: S.base, 'Content-Type': 'application/json' })).status, 403, 'bez X-THQ');
      assert.equal((await post({ Origin: 'http://evil.example', 'X-THQ': '1', 'Content-Type': 'application/json' })).status, 403, 'obcy Origin');
      assert.equal((await post({ Origin: S.base, 'X-THQ': '1', 'Content-Type': 'text/plain' })).status, 403, 'text/plain');
      assert.ok(!existsSync(path.join(dir, 'chart-data', 'backtest', 'sessions', 'bt-trasa001.json')), 'odrzucone nic nie zapisały');
      const big = JSON.stringify({ id: 'bt-trasa001', doc: doc({ pad: 'x'.repeat(4 * 1024 * 1024 + 10) }), rev: 0 });
      let st413;
      try { st413 = (await post({ Origin: S.base, 'X-THQ': '1', 'Content-Type': 'application/json' }, big)).status; } catch { st413 = 413; } // serwer może zerwać połączenie po 413
      assert.equal(st413, 413, 'ciało > 4 MB');
      const ok = await H.dash(S.base, '/api/backtest/session/save', { id: 'bt-trasa001', doc: doc(), rev: 0 });
      assert.equal(ok.status, 200, JSON.stringify(ok.j)); assert.deepEqual(ok.j, { rev: 1 });
      assert.ok(existsSync(path.join(dir, 'chart-data', 'backtest', 'sessions', 'bt-trasa001.json')));
      const stale = await H.dash(S.base, '/api/backtest/session/save', { id: 'bt-trasa001', doc: doc(), rev: 0 });
      assert.equal(stale.status, 409); assert.equal(stale.j.code, 'stale');
      const badId = await H.dash(S.base, '/api/backtest/session/save', { id: '../x', doc: doc(), rev: 0 });
      assert.equal(badId.status, 400);
      const one = await fetch(S.base + '/api/backtest/session/bt-trasa001');
      assert.equal(one.status, 200); assert.equal((await one.json()).rev, 1);
      assert.equal((await fetch(S.base + '/api/backtest/session/bt-brak0001')).status, 404);
      assert.equal((await fetch(S.base + '/api/backtest/session/BT-1')).status, 400);
      const list = await (await fetch(S.base + '/api/backtest/sessions')).json();
      assert.deepEqual(list.sessions.map((s) => s.id), ['bt-trasa001']);
      assert.equal((await fetch(S.base + '/api/backtest/sessions', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    } finally { S.stop(); A.stop(); }
  });
};
