// usun (1.6.1): usuwanie sesji backtestu z cofnięciem. [U] 1.11.2026 «oraz dodaj mozliwosc usuniecia sesji bo aktualnie sie nie da»
// Magazyn (lib/backtest-store.mjs: remove/restore), trasy POST /api/backtest/session/delete|restore (guardWrite, SESSION_ID_RE), licznik dysku, okno w przeglądarce
// (strona robocza testy/backtest-autoskala.html?part=usun). Atrapy Notion i dane syntetyczne; prawdziwe Notion nie dostaje żądań.
import { pathToFileURL } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const doc = (o = {}) => ({ v: 2, name: 'Sesja do usunięcia', def: { instruments: ['NQ'], from: '2024-03-12' }, cursor: 5, trades: [{ id: 't1', r: 1, notion: { id: null, state: 'pending', error: null } }], ...o });

  test('usun: magazyn przenosi plik do usuniete i przywraca bajt w bajt', async () => {
    const { createBacktestStore } = await imp('lib/backtest-store.mjs');
    const base = H.tmp();
    let clock = Date.UTC(2026, 10, 1, 10, 0, 0);
    const st = createBacktestStore({ baseDir: base, now: () => clock });
    st.save('bt-usun0001', doc(), 0);
    st.save('bt-zostaje1', doc({ name: 'Zostaje' }), 0);
    const file = path.join(base, 'backtest', 'sessions', 'bt-usun0001.json');
    const bytes = readFileSync(file);
    const r = st.remove('bt-usun0001');
    assert.match(r.file, /^bt-usun0001-20261101T100000Z\.json$/);
    assert.ok(!existsSync(file), 'plik zniknął z katalogu sesji');
    assert.ok(existsSync(path.join(base, 'backtest', 'sessions', 'usuniete', r.file)), 'plik jest w usuniete (nie skasowany)');
    assert.equal(st.read('bt-usun0001'), null);
    assert.deepEqual(st.list().map((s) => s.id), ['bt-zostaje1'], 'lista bez usuniętej');
    assert.deepEqual(st.forStats(null).sessions.map((s) => s.id), ['bt-zostaje1'], 'statystyki wszystkich sesji nie liczą usuniętej');
    assert.throws(() => st.remove('bt-usun0001'), (e) => e.status === 404);
    st.restore('bt-usun0001');
    assert.ok(readFileSync(file).equals(bytes), 'bajt w bajt');
    assert.deepEqual(readdirSync(path.join(base, 'backtest', 'sessions', 'usuniete')), [], 'usuniete puste po cofnięciu');
    // dwa usunięcia tej samej sesji: cofnięcie bierze ostatnie; istniejąca sesja = 409
    st.remove('bt-usun0001'); clock += 5000; st.restore('bt-usun0001'); st.save('bt-usun0001', { ...st.read('bt-usun0001'), cursor: 9 }, 1);
    st.remove('bt-usun0001');
    assert.throws(() => st.restore('bt-usun0001') && st.restore('bt-usun0001'), (e) => e.status === 409 && e.code === 'exists');
    assert.throws(() => st.restore('bt-brak0001'), (e) => e.status === 404);
    for (const bad of ['../x', 'bt-../x', 'BT-1', 'bt-a/b', '']) {
      assert.throws(() => st.remove(bad), (e) => e.status === 400, bad);
      assert.throws(() => st.restore(bad), (e) => e.status === 400, bad);
    }
  });

  test('usun: restore bierze najnowszą kopię także przy kilku kopiach z tej samej sekundy (sufiks liczony jako liczba, nie tekst)', async () => {
    const { createBacktestStore } = await imp('lib/backtest-store.mjs');
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const base = H.tmp();
    const st = createBacktestStore({ baseDir: base });
    const rdir = path.join(base, 'backtest', 'sessions', 'usuniete');
    mkdirSync(rdir, { recursive: true });
    const names = ['bt-kopie001-20261101T100000Z.json', 'bt-kopie001-20261101T100000Z-1.json', 'bt-kopie001-20261101T100000Z-2.json', 'bt-kopie001-20261101T100000Z-10.json', 'bt-kopie001-20261101T095959Z-30.json'];
    for (const n of names) writeFileSync(path.join(rdir, n), JSON.stringify({ v: 2, id: 'bt-kopie001', name: n, def: { instruments: ['NQ'], from: '2024-03-12' }, trades: [], cursor: 1, rev: 1 }));
    st.restore('bt-kopie001');
    assert.equal(st.read('bt-kopie001').name, 'bt-kopie001-20261101T100000Z-10.json', 'najnowsza: ta sama sekunda, największy numer, a nie starsza sekunda');
    assert.ok(!existsSync(path.join(rdir, 'bt-kopie001-20261101T100000Z-10.json')));
  });

  test('usun: klient nie usuwa sesji, gdy zapis przed usunięciem się nie udał (kod flush, żadnego żądania delete)', async () => {
    const { createSessionClient } = await imp('public/js/bt-klient.js');
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (String(url).includes('/session/save')) return { ok: false, status: 500, json: async () => ({ error: 'io' }) };
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    const c = createSessionClient({ fetchImpl, delayMs: 60_000 });
    c.save({ id: 'bt-klient001', v: 2, trades: [] });
    await assert.rejects(c.remove('bt-klient001'), (e) => e.code === 'flush', 'przerwane z kodem flush');
    assert.ok(!calls.some((u) => String(u).includes('/session/delete')), 'żądanie usunięcia nie poszło: ' + calls.join(' '));
    // po udanym zapisie usunięcie przechodzi
    const ok = createSessionClient({ fetchImpl: async (u) => ({ ok: true, status: 200, json: async () => (String(u).includes('/save') ? { rev: 1 } : { ok: true }) }), delayMs: 60_000 });
    ok.save({ id: 'bt-klient002', v: 2, trades: [] });
    assert.equal((await ok.remove('bt-klient002')).ok, true);
  });

  test('usun: trasy delete i restore: obca strona 403, traversal 400, usunięcie i cofnięcie, licznik dysku bez usuniętych', async () => {
    const A = await H.atrapa(4975);
    const dir = H.tmp();
    const S = await H.server(4976, { NOTION_API_BASE: A.base, NOTION_TOKEN: 'secret_x', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_CONFIG_DIR: dir });
    try {
      const sess = path.join(dir, 'chart-data', 'backtest', 'sessions');
      assert.equal((await H.dash(S.base, '/api/backtest/session/save', { id: 'bt-trasa002', doc: doc(), rev: 0 })).status, 200);
      const f = path.join(sess, 'bt-trasa002.json');
      const bytes = readFileSync(f);
      const raw = (headers, body, p = '/api/backtest/session/delete') => fetch(S.base + p, { method: 'POST', headers, body: JSON.stringify(body) });
      assert.equal((await raw({ Origin: S.base, 'Content-Type': 'application/json' }, { id: 'bt-trasa002' })).status, 403, 'bez X-THQ');
      assert.equal((await raw({ Origin: 'http://evil.example', 'X-THQ': '1', 'Content-Type': 'application/json' }, { id: 'bt-trasa002' })).status, 403, 'obcy Origin');
      assert.equal((await raw({ Origin: 'http://evil.example', 'X-THQ': '1', 'Content-Type': 'application/json' }, { id: 'bt-trasa002' }, '/api/backtest/session/restore')).status, 403, 'restore: obcy Origin');
      assert.ok(existsSync(f), 'odrzucone nic nie usunęły');
      for (const id of ['../x', 'bt-..%2f', 'BT-1', 'bt-a/b', '', null, 5]) assert.equal((await H.dash(S.base, '/api/backtest/session/delete', { id })).status, 400, `delete ${id}`);
      assert.equal((await H.dash(S.base, '/api/backtest/session/restore', { id: '../x' })).status, 400);
      // GET na trasie zapisu niczego nie usuwa (trasa działa tylko dla POST), a plik zostaje
      const getR = await fetch(S.base + '/api/backtest/session/delete?id=bt-trasa002', { method: 'GET', headers: { 'X-THQ': '1' } });
      assert.ok(getR.status >= 400 && getR.status < 500, 'GET na delete odrzucony błędem klienta: ' + getR.status);
      assert.ok(existsSync(f), 'GET nie usunął pliku');
      const del = await H.dash(S.base, '/api/backtest/session/delete', { id: 'bt-trasa002' });
      assert.equal(del.status, 200, JSON.stringify(del.j)); assert.equal(del.j.ok, true);
      assert.ok(!existsSync(f));
      assert.equal((await fetch(S.base + '/api/backtest/session/bt-trasa002')).status, 404);
      assert.equal((await H.dash(S.base, '/api/backtest/session/delete', { id: 'bt-trasa002' })).status, 404);
      const list = await (await fetch(S.base + '/api/backtest/sessions')).json();
      assert.deepEqual(list.sessions, []);
      const back = await H.dash(S.base, '/api/backtest/session/restore', { id: 'bt-trasa002' });
      assert.equal(back.status, 200, JSON.stringify(back.j));
      assert.ok(readFileSync(f).equals(bytes), 'bajt w bajt po cofnięciu przez trasę');
      assert.equal((await H.dash(S.base, '/api/backtest/session/restore', { id: 'bt-trasa002' })).status, 409);
      // zapis ze starej karty po usunięciu: 409 stale, plik się nie odtwarza po cichu
      assert.equal((await H.dash(S.base, '/api/backtest/session/delete', { id: 'bt-trasa002' })).status, 200);
      const stale = await H.dash(S.base, '/api/backtest/session/save', { id: 'bt-trasa002', doc: doc(), rev: 1 });
      assert.equal(stale.status, 409); assert.equal(stale.j.code, 'stale');
      assert.ok(!existsSync(f), 'stara karta nie odtworzyła usuniętej sesji');
    } finally { S.stop(); A.stop(); }
  });

  test('usun: „Dane na dysku” liczy sesje bez folderu usuniete, osobno pokazuje usunięte', async () => {
    const { createBacktestStore } = await imp('lib/backtest-store.mjs');
    const base = H.tmp();
    const st = createBacktestStore({ baseDir: base });
    st.save('bt-dysk0001', doc(), 0); st.save('bt-dysk0002', doc(), 0); st.remove('bt-dysk0002');
    const s = src('lib/dysk.mjs');
    assert.match(s, /removedSessions/);
    assert.match(s, /usuniete/);
  });

  test('usun: okno potwierdzenia (liczby, informacja o Notion, ostrzeżenie o niewysłanych), Anuluj, usunięcie i Cofnij w przeglądarce', async () => {
    const P = await imp('testy/przegladarka.mjs');
    if (!P.findBrowser()) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
    const dir = H.tmp();
    await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
    await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'ES', day: '2024-03-12', seed: 5, has1s: false });
    const S = await H.server(4977, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
    try {
      const res = JSON.parse(await P.cdpPage(`${S.base}/__testy/backtest-autoskala.html?part=usun`, { width: 1920, height: 1080, timeoutMs: 120_000 }));
      assert.ok(!res.fatal, res.fatal);
      const mine = res.checks.filter((c) => c.tag === 'usun');
      assert.ok(mine.length >= 9, `strona wykonała sprawdzenia (${mine.length})`);
      assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], 'nieudane sprawdzenia');
      assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
    } finally { S.stop(); }
  });

  test('usun: źródła (guardWrite, SESSION_ID_RE, blokada przy wysyłce do Notion, teksty w en.json)', () => {
    const sv = src('server.mjs');
    assert.match(sv, /\/api\/backtest\/session\/delete/);
    assert.match(sv, /btSync\.busy\(bb\.id\)/);
    assert.match(sv, /SESSION_ID_RE\.test\(bb\.id\)/);
    assert.match(src('lib/backtest-sync.mjs'), /busy: \(sessionId\) => queues\.has/);
    const en = JSON.parse(src('public/i18n/en.json'));
    for (const k of ['Usuń sesję', 'Sesja usunięta', 'Cofnij', 'Najpierw wyślij do Notion', 'Trwa wysyłka tej sesji do Notion. Spróbuj za chwilę.']) assert.ok(en[k], k);
  });
};
