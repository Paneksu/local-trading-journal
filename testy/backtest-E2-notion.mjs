// backtest-E2: wysyłka trade'ów backtestu do Notion (lib/backtest-sync.mjs) z kolejką i idempotencją, trasa POST /api/backtest/notion, licznik i przycisk w pasku
// replayu, normalizeTrades (btSession, btMae, btMfe), kopia definicji sesji w ustawieniach. Wyłącznie atrapa Notion (testy/atrapa-notion.mjs) i świece syntetyczne.
// Wysyłka w Node: prawdziwe moduły serwera (notion, data, writes, drawings, magazyn sesji) na atrapie, z wstrzykiwaną awarią klienta Notion (utracona odpowiedź, 429, sieć).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const I = H.IDS;
  const SID = 'bt-k3f9x2abc';
  const DAY1 = '2024-03-12', DAY2 = '2024-03-13';
  const SOURCES = { trades: I.DS_TRADES, konta: I.DS_KONTA, dziennik: I.DS_DZIENNIK, finanse: I.DS_FINANSE };

  function envDir(lang = 'pl', version = 2) {
    const dir = H.tmp();
    writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x\nNOTION_ROOT_URL=${H.PARENT_URL}\nDS_TRADES=${I.DS_TRADES}\nDS_KONTA=${I.DS_KONTA}\nDS_DZIENNIK=${I.DS_DZIENNIK}\nDS_FINANSE=${I.DS_FINANSE}\n`);
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: version, lang }));
    return dir;
  }
  // 9:45 NY 12.03.2024 (EDT, UTC−4) = 13:45 UTC
  const T0 = Date.UTC(2024, 2, 12, 13, 45) / 1000;
  async function drawing(label) {
    const { defaultStyleFor } = await lib('public/vendor/lightweight-charts-drawing/lightweight-charts-drawing.es.js');
    return { v: 1, lib: '0.6.2', at: '2024-03-12T14:00:00.000Z', d: [{ id: `dw_${label}`, kind: 'horizontal-line', points: [{ time: T0, price: 18000 }], style: defaultStyleFor('horizontal-line') }] };
  }
  const trade = (n, o = {}) => ({
    id: `t${n}`, day: DAY1, instrument: 'NQ', contract: 'NQH4', dir: n % 2 ? 'Long' : 'Short', qty: 1, entryT: T0 + n * 600, entryPrice: 18000 + n, sl0: 17990 + n, sl: 17990 + n, tp: 18020 + n, be: false,
    exits: [{ t: T0 + n * 600 + 300, price: 18010 + n, qty: 1, reason: 'tp' }], exitT: T0 + n * 600 + 300, exitPrice: 18010 + n, r: 1, pnl: 200, maeR: -0.4, mfeR: 1.5,
    setup: 'Breakout', notes: `notatka ${n}`, journal: 'done', drawings: null, notion: { id: null, state: 'pending', error: null }, ...o,
  });
  const session = (trades, o = {}) => ({
    v: 1, id: SID, name: 'CPI 2024', created: '2024-01-01T00:00:00.000Z',
    def: { instruments: ['NQ'], from: '2024-03-11', to: '2024-03-15', balance: 50000, risk: { mode: 'usd', value: 500 }, startTime: '09:00', order: 'chrono', seed: 1, accountId: null, filter: null, excluded: [] },
    pool: [DAY1, DAY2], dayIdx: 0, cursor: null, hw: 0, layout: { kind: '1', charts: [{ instrument: 'NQ', tf: '1m' }], active: 0 }, days: { [DAY1]: { status: 'active' } }, book: null, trades, drawings: {}, ...o,
  });

  // Atrapa po migracjach do 006 i prawdziwe moduły serwera w tym procesie. fault(method, path) może rzucić przed żądaniem albo po nim (utracona odpowiedź).
  async function rig(port, { version = 2, migrate = true } = {}) {
    const A = await H.atrapa(port);
    const dir = envDir('pl', version);
    if (migrate) {
      const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
      assert.equal(mig.code, 0, mig.err);
    }
    const { createNotion, NotionError } = await lib('lib/notion.mjs');
    const { createData } = await lib('lib/data.mjs');
    const { createWriter } = await lib('lib/writes.mjs');
    const { createDrawings } = await lib('lib/drawings.mjs');
    const { createBacktestStore } = await lib('lib/backtest-store.mjs');
    const { createBacktestSync } = await lib('lib/backtest-sync.mjs');
    const { tr: t } = await lib('lib/i18n.mjs');
    const real = createNotion({ token: 'x', base: A.base, t });
    const R = { A, dir, fault: null, calls: [] };
    const wrap = (method, fn) => async (p, b) => {
      R.calls.push(`${method} ${p}`);
      const f = R.fault?.(method, p);
      if (f === 'before-429') throw new NotionError('Notion API: za dużo żądań (429), spróbuj za chwilę.', 429);
      if (f === 'before-net') throw new TypeError('fetch failed');
      const out = await fn(p, b);
      if (f === 'after-lost') throw new TypeError('fetch failed'); // strona powstała, odpowiedź zginęła
      return out;
    };
    const notion = { ...real, get: wrap('GET', real.get), post: wrap('POST', real.post), patch: wrap('PATCH', real.patch), queryAll: async (ds) => { const f = R.fault?.('QUERY', ds); if (f === 'before-net') throw new TypeError('fetch failed'); return real.queryAll(ds); } };
    const cfg = json(path.join(dir, 'config.local.json'));
    const data = createData({ notion, sources: SOURCES, getConfig: () => cfg, persistConfig: () => {}, rootUrl: H.PARENT_URL });
    const writer = createWriter({ notion, sources: SOURCES, data, t });
    const drawings = createDrawings({ notion, sources: SOURCES, data, t, baseDir: path.join(dir, 'chart-data') });
    const store = createBacktestStore({ baseDir: path.join(dir, 'chart-data'), t, log: () => {} });
    const sync = createBacktestSync({ store, writer, drawings, data, t, log: () => {}, now: () => R.clock ?? Date.now() }); // zegar: odstęp po zerwanym POST (poprawki po review)
    Object.assign(R, { store, sync, data, writer, notion });
    R.pages = async () => (await A.get('/__test/pages?ds=trades')).filter((p) => p.p.Typ?.select?.name === 'Backtest' && (p.p['Sesja backtestu']?.rich_text || []).length);
    R.text = (p, k) => (p.p[k]?.rich_text || []).map((x) => x.text?.content ?? x.plain_text ?? '').join('');
    return R;
  }

  test('backtest-E2: Zakończ dzień wysyła trade\'y dnia', async () => {
    const R = await rig(5602);
    try {
      const dw = await drawing('a');
      R.store.save(SID, session([trade(1, { drawings: dw }), trade(2), trade(3, { be: true, setup: '' }), trade(4, { day: DAY2 })]), 0);
      const res = await R.sync.push({ sessionId: SID, day: DAY1 });
      assert.deepEqual([res.sent, res.skipped, res.failed.length], [3, 0, 0], JSON.stringify(res.failed));
      assert.equal(res.pending, 1, 'trade drugiego dnia czeka');
      const pages = await R.pages();
      assert.equal(pages.length, 3);
      const p1 = pages.find((p) => R.text(p, 'Sesja backtestu') === 'CPI 2024 [bt-k3f9x2abc/t1]');
      assert.ok(p1, 'znacznik sesji w polu');
      assert.equal(R.text(p1, 'Trade'.trim()) || p1.p.Trade.title.map((x) => x.text?.content ?? x.plain_text).join(''), 'Backtest NQ Long 2024-03-12');
      assert.equal(p1.p.Typ.select.name, 'Backtest');
      assert.equal(p1.p.Instrument.select.name, 'NQ');
      assert.equal(p1.p.Kierunek.select.name, 'Long');
      assert.equal(p1.p.Setup.select.name, 'Breakout');
      assert.equal(p1.p.Sesja.select.name, 'Nowy Jork', 'sesja z godziny wejścia (9:55 NY)');
      assert.equal(p1.p.Data.date.start.slice(0, 16), '2024-03-12T09:55');
      assert.equal(p1.p.Data.date.time_zone, 'America/New_York');
      assert.equal(p1.p['Wyjście'].date.start.slice(0, 16), '2024-03-12T10:00');
      assert.deepEqual([p1.p.R.number, p1.p['P&L $'].number, p1.p['Cena wejścia'].number, p1.p['Cena wyjścia'].number, p1.p.SL.number, p1.p.TP.number], [1, 200, 18001, 18011, 17991, 18021]);
      assert.equal(p1.p.BE?.number ?? null, null, 'bez przesunięcia na BE pole puste');
      assert.equal(R.text(p1, 'Kontrakt'), 'NQH4');
      assert.equal(R.text(p1, 'Notatki'), 'notatka 1');
      assert.deepEqual(JSON.parse(R.text(p1, 'Rysunki')), dw, 'rysunki w polu „Rysunki”');
      const p3 = pages.find((p) => R.text(p, 'Sesja backtestu').endsWith('/t3]'));
      assert.equal(p3.p.BE.number, 18003, 'BE = cena wejścia');
      assert.equal(p3.p.Setup?.select ?? null, null, 'bez setupu pole puste');
      const doc = R.store.read(SID);
      for (const x of doc.trades.filter((y) => y.day === DAY1)) {
        assert.equal(x.notion.state, 'sent', x.id);
        assert.ok(pages.some((p) => p.id === x.notion.id), `${x.id}: notion.id = strona`);
      }
      assert.equal(doc.trades[3].notion.state, 'pending');
      assert.equal(doc.rev, 1, 'wysyłka nie podbija wersji pliku (karta przeglądarki zapisuje dalej bez 409)');
      assert.equal(R.sync.pending(SID), 1);
      assert.deepEqual(await R.A.get('/__test/violations'), []);
    } finally { R.A.stop(); }
  });

  test('backtest-E2: ponowna wysyłka nie dubluje', async () => {
    const R = await rig(5603);
    try {
      R.store.save(SID, session([trade(1), trade(2), trade(3)]), 0);
      assert.equal((await R.sync.push({ sessionId: SID })).sent, 3);
      const n = (await R.pages()).length;
      const res = await R.sync.push({ sessionId: SID });
      assert.deepEqual([res.sent, res.skipped, res.pending], [0, 3, 0]);
      assert.equal((await R.pages()).length, n);
      // zapis z przeglądarki, która nie zna jeszcze id stron (stan sprzed wysyłki), nie kasuje ich
      const stale = session([trade(1), trade(2), trade(3)]);
      R.store.save(SID, stale, 1);
      assert.ok(R.store.read(SID).trades.every((x) => x.notion.state === 'sent' && x.notion.id), 'pole notion należy do serwera');
      assert.equal((await R.sync.push({ sessionId: SID, all: true })).sent, 0);
      assert.equal((await R.pages()).length, n);
    } finally { R.A.stop(); }
  });

  test('backtest-E2: utracona odpowiedź', async () => {
    const R = await rig(5604);
    try {
      R.store.save(SID, session([trade(1, { drawings: await drawing('b') }), trade(2)]), 0);
      // strona t1 powstaje w Notion, ale odpowiedź ginie (zerwane połączenie): id nie trafia do pliku
      let once = true;
      R.fault = (m, p) => (m === 'POST' && p === '/v1/pages' && once ? ((once = false), 'after-lost') : null);
      const r1 = await R.sync.push({ sessionId: SID });
      assert.equal(r1.sent, 0);
      assert.equal(r1.failed.length, 2, 'reszta kolejki czeka na następną próbę');
      assert.equal((await R.pages()).length, 1, 'strona powstała');
      assert.equal(R.store.read(SID).trades[0].notion.id, null);
      assert.equal(R.store.read(SID).trades[0].notion.state, 'pending');
      R.fault = null;
      const r2 = await R.sync.push({ sessionId: SID });
      assert.deepEqual([r2.sent, r2.failed.length, r2.pending], [2, 0, 0]);
      const pages = await R.pages();
      assert.equal(pages.length, 2, 'bez drugiej strony t1');
      const p1 = pages.find((p) => R.text(p, 'Sesja backtestu').endsWith('/t1]'));
      assert.equal(R.store.read(SID).trades[0].notion.id, p1.id, 'id strony znalezionej po znaczniku');
      assert.ok(R.text(p1, 'Rysunki').includes('dw_b'), 'rysunki dosłane na znalezioną stronę');
      // awaria między zapisem strony a rysunkami (proces zamknięty): id jest, state nie 'sent' → wznowienie od rysunków
      const id1 = p1.id;
      R.store.setNotion(SID, 't1', { id: id1, state: 'pending', error: null });
      const posts = R.calls.filter((c) => c === 'POST /v1/pages').length;
      const r3 = await R.sync.push({ sessionId: SID });
      assert.deepEqual([r3.sent, r3.skipped], [1, 1]);
      assert.equal(R.calls.filter((c) => c === 'POST /v1/pages').length, posts, 'bez nowej strony');
      assert.deepEqual(((n) => ({ id: n.id, state: n.state, error: n.error }))(R.store.read(SID).trades[0].notion), { id: id1, state: 'sent', error: null }); // od poprawek po review notion ma też edited
      assert.equal((await R.pages()).length, 2);
    } finally { R.A.stop(); }
  });

  test('backtest-E2: 429 i brak sieci', async () => {
    const R = await rig(5605);
    try {
      R.store.save(SID, session([trade(1), trade(2), trade(3)]), 0);
      R.fault = (m, p) => (m === 'POST' && p === '/v1/pages' ? 'before-429' : null);
      const r1 = await R.sync.push({ sessionId: SID });
      assert.deepEqual([r1.sent, r1.pending, r1.failed.length], [0, 3, 3]);
      assert.match(r1.failed[0].error, /429/);
      assert.ok(R.store.read(SID).trades.every((x) => x.notion.state === 'pending'), 'stan pending, nie error');
      assert.equal(R.calls.filter((c) => c === 'POST /v1/pages').length, 1, 'po pierwszej awarii przejściowej reszta czeka');
      // brak sieci już przy odczycie danych z Notion
      R.fault = (m) => (m === 'QUERY' || m === 'GET' ? 'before-net' : null);
      const r2 = await R.sync.push({ sessionId: SID });
      assert.deepEqual([r2.sent, r2.pending, r2.failed.length], [0, 3, 3]);
      // 5xx z atrapy (prawdziwe żądanie HTTP)
      R.fault = null;
      await R.A.post('/__test/fail', { match: 'POST /v1/pages', after: 0, status: 503 });
      const r3 = await R.sync.push({ sessionId: SID });
      assert.equal(r3.pending, 3);
      assert.equal(R.store.read(SID).trades[0].notion.state, 'pending');
      assert.equal((await R.pages()).length, 0);
      // po zdjęciu awarii wszystko idzie
      R.clock = Date.now() + 31_000; // po 5xx przy POST nowa strona dopiero po odstępie (poprawki po review E2, #6)
      const r4 = await R.sync.push({ sessionId: SID });
      assert.deepEqual([r4.sent, r4.pending], [3, 0]);
      assert.equal((await R.pages()).length, 3);
    } finally { R.A.stop(); }
  });

  test('backtest-E2: zapis btMae i btMfe', async () => {
    const { buildTradeProps } = await lib('lib/writes.mjs');
    const T = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? '')) : s);
    const schOf = (roles) => ({ roles: Object.fromEntries(Object.entries(roles).map(([r, type]) => [r, { name: `P_${r}`, type }])), optionNames: {}, optMaps: {} });
    const sch = schOf({ title: 'title', btMae: 'number', btMfe: 'number' });
    assert.deepEqual(buildTradeProps({ btMae: -0.5, btMfe: 1.5 }, sch, [], { creating: false }, T), { P_btMae: { number: -0.5 }, P_btMfe: { number: 1.5 } });
    assert.deepEqual(buildTradeProps({ btMae: null, btMfe: null }, sch, [], { creating: false }, T), {}, 'null pomija pole');
    assert.throws(() => buildTradeProps({ btMae: 'abc' }, sch, [], { creating: false }, T), (e) => e.status === 400 && !!e.fields.btMae);
    assert.throws(() => buildTradeProps({ btMae: -0.5, btMfe: 1 }, schOf({ title: 'title' }), [], { creating: false }, T), (e) => /nie ma jeszcze pola „MAE \(R\)”/.test(e.fields.btMae) && /„MFE \(R\)”/.test(e.fields.btMfe));
    // trade wysłany przez push ma MAE/MFE w atrapie, a normalizeTrades oddaje je jako liczby
    const R = await rig(5606);
    try {
      R.store.save(SID, session([trade(1, { maeR: -0.25, mfeR: 2.75 }), trade(2, { maeR: null, mfeR: null })]), 0);
      assert.equal((await R.sync.push({ sessionId: SID })).sent, 2);
      const pages = await R.pages();
      const p1 = pages.find((p) => R.text(p, 'Sesja backtestu').endsWith('/t1]'));
      const p2 = pages.find((p) => R.text(p, 'Sesja backtestu').endsWith('/t2]'));
      assert.deepEqual([p1.p['MAE (R)'].number, p1.p['MFE (R)'].number], [-0.25, 2.75]);
      assert.ok(!p2.p['MAE (R)']?.number && p2.p['MAE (R)']?.number !== 0, 'null nie zapisuje zera');
      const S = await lib('public/js/stats.js');
      const rows = (await R.data.getPayload(true)).data.trades.filter((x) => x.btSession);
      const tr = S.normalizeTrades(rows);
      const n1 = tr.find((x) => x.btSession.endsWith('/t1]')), n2 = tr.find((x) => x.btSession.endsWith('/t2]'));
      assert.deepEqual([n1.btMae, n1.btMfe], [-0.25, 2.75]);
      assert.deepEqual([n2.btMae, n2.btMfe], [null, null]);
      assert.deepEqual(S.parseBtSession(n1.btSession), { name: 'CPI 2024', sessionId: SID, tradeId: 't1' });
    } finally { R.A.stop(); }
  });

  test('backtest-E2: nowy setup', async () => {
    const R = await rig(5607);
    try {
      const before = (await R.A.dump())[I.DS_TRADES].schema.Setup.select.options.map((o) => o.name);
      R.store.save(SID, session([trade(1, { setup: 'ORB 5m' }), trade(2, { setup: 'Pullback', instrument: 'MNQ', contract: 'MNQH4' })]), 0);
      const res = await R.sync.push({ sessionId: SID });
      assert.equal(res.sent, 2, JSON.stringify(res.failed));
      const opts = (await R.A.dump())[I.DS_TRADES].schema.Setup.select.options.map((o) => o.name);
      assert.ok(opts.includes('ORB 5m'), 'nowa opcja setupu');
      for (const n of before) assert.ok(opts.includes(n), `opcja „${n}” nietknięta`);
      assert.equal(opts.filter((n) => n === 'Pullback').length, 1);
      const p2 = (await R.pages()).find((p) => R.text(p, 'Sesja backtestu').endsWith('/t2]'));
      assert.equal(p2.p.Instrument.select.name, 'MNQ', 'nowa opcja instrumentu (MNQ)');
      assert.deepEqual(await R.A.get('/__test/violations'), []);
      // błąd walidacji (400): state 'error' z komunikatem, bez ponawiania automatycznego; jawne „Zapisz do Notion” (all) próbuje znowu
      R.store.save(SID, session([...R.store.read(SID).trades, trade(3, { contract: 'ESH4' })]), R.store.read(SID).rev);
      const r2 = await R.sync.push({ sessionId: SID });
      assert.equal(r2.failed.length, 1);
      const t3 = R.store.read(SID).trades.find((x) => x.id === 't3');
      assert.equal(t3.notion.state, 'error');
      assert.match(t3.notion.error, /ESH4/);
      const calls = R.calls.length;
      const r3 = await R.sync.push({ sessionId: SID });
      assert.deepEqual([r3.sent, r3.failed.length], [0, 1]);
      assert.equal(R.calls.length, calls, 'trade z błędem nie idzie do Notion bez jawnego ponowienia');
      assert.equal(R.sync.pending(SID), 1, 'trade z błędem liczy się do niezapisanych');
    } finally { R.A.stop(); }
  });

  test('backtest-E2: stare wpisy Backtest', async () => {
    const S = await lib('public/js/stats.js');
    const rows = Array.from({ length: 6 }, (_, i) => ({ _id: `old${i}`, title: `BT ${i}`, typ: { name: 'Backtest' }, date: `2024-0${(i % 6) + 1}-10`, dir: { name: 'Long' }, setup: { name: 'Breakout' }, r: i % 2 ? 1 : -1, pnl: null }));
    rows.push({ _id: 'new', typ: { name: 'Backtest' }, date: '2024-03-12', dir: { name: 'Long' }, r: 2, btSession: 'CPI 2024 [bt-k3f9x2abc/t1]', btMae: -0.5, btMfe: 2.5 });
    const tr = S.normalizeTrades(rows);
    const old = tr.filter((x) => x.id.startsWith('old'));
    assert.equal(old.length, 6);
    for (const x of old) assert.deepEqual([x.btSession, x.btMae, x.btMfe, x.counted], ['', null, null, true], 'stary wpis: bez sesji, liczony w statystykach');
    assert.equal(S.parseBtSession(''), null, '„Bez sesji”');
    assert.equal(S.parseBtSession('ręczny wpis bez znacznika'), null);
    // statystyki wykonania liczą tylko trade'y z MAE/MFE (moduł bt-staty.js to pakiet G): stare wpisy nie mają danych
    assert.deepEqual(tr.filter((x) => x.btMae != null && x.btMfe != null).map((x) => x.id), ['new']);
    // zgodność znacznika serwera (btSessionValue) z parserem przeglądarki, także po skróceniu długiej nazwy
    const { btSessionValue, MARKER_RE } = await lib('lib/backtest-sync.mjs');
    const long = btSessionValue('x'.repeat(400), SID, 't12');
    assert.equal(long.length, 200);
    assert.deepEqual(S.parseBtSession(long), { name: 'x'.repeat(200 - ' [bt-k3f9x2abc/t12]'.length), sessionId: SID, tradeId: 't12' });
    assert.ok(MARKER_RE.test(long));
  });

  // ---- trasa i interfejs: serwer testowy na atrapie po migracji, świece syntetyczne ----
  // run.mjs zabija procesy po każdym teście, więc każdy test stawia własną atrapę i serwer
  async function uiResult(port) {
    {
      const A = await H.atrapa(port);
      const dir = envDir('pl', 2);
      const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
      assert.equal(mig.code, 0, mig.err);
      const { syntheticDay } = await lib('testy/bt-dane-syntetyczne.mjs');
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: DAY2, seed: 8 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: DAY1, seed: 3 });
      const S = await H.server(port + 1, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, THQ_TEST_PAGES: '1' });
      return { A, S, dir, stop: () => { S.stop(); A.stop(); } };
    }
  }

  test('backtest-E2: trasa chroniona', async () => {
    const U = await uiResult(5608);
    const base = U.S.base;
    const { createBacktestStore } = await lib('lib/backtest-store.mjs');
    createBacktestStore({ baseDir: path.join(U.dir, 'chart-data') }).save('bt-trasa0001', session([trade(1)], { id: 'bt-trasa0001' }), 0);
    // bez X-THQ i z obcym Origin → 403, nic nie trafia do Notion
    const noHdr = await fetch(`${base}/api/backtest/notion`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'bt-trasa0001' }) });
    assert.equal(noHdr.status, 403);
    assert.equal((await H.dash(base, '/api/backtest/notion', { sessionId: 'bt-trasa0001' }, { origin: 'http://evil.example' })).status, 403);
    assert.equal((await fetch(`${base}/api/backtest/notion`, { method: 'GET' })).status, 404, 'GET nie wysyła');
    for (const sessionId of ['../x', 'bt-ABC', 'bt-a', '', null, 'bt-' + 'a'.repeat(21)]) {
      const r = await H.dash(base, '/api/backtest/notion', { sessionId });
      assert.equal(r.status, 400, `${JSON.stringify(sessionId)} → ${r.status}`);
    }
    assert.equal((await H.dash(base, '/api/backtest/notion', { sessionId: 'bt-trasa0001', day: '2024-13-45x' })).status, 400, 'zły dzień');
    assert.equal((await H.dash(base, '/api/backtest/notion', { sessionId: 'bt-nieistnieje' })).status, 404);
    assert.equal((await U.A.get('/__test/pages?ds=trades')).filter((p) => p.p.Typ?.select?.name === 'Backtest' && (p.p['Sesja backtestu']?.rich_text || []).length).length, 0);
    const ok = await H.dash(base, '/api/backtest/notion', { sessionId: 'bt-trasa0001' });
    assert.equal(ok.status, 200, JSON.stringify(ok.j));
    assert.deepEqual([ok.j.sent, ok.j.pending], [1, 0]);
    assert.equal(ok.j.notion.t1.state, 'sent');
  });

  test('backtest-E2: zapis bez kończenia dnia', async () => {
    const U = await uiResult(5610);
    const P = await lib('testy/przegladarka.mjs');
    if (!P.findBrowser()) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    // 1920 × 1080 i telefon 375 px (osobne sesje, sufiks „m”)
    for (const [width, height, suf] of [[1920, 1080, ''], [375, 800, 'm']]) {
      const txt = await P.cdpPage(`${U.S.base}/__testy/backtest-notion.html?suf=${suf}`, { width, height, timeoutMs: 120_000, until: "!!document.getElementById('wynik') && document.getElementById('wynik').textContent !== '…'" }); // bez wyścigu z about:blank przed nawigacją
      const res = JSON.parse(txt);
      assert.ok(!res.fatal, res.fatal);
      assert.deepEqual(res.checks.filter((c) => !c.ok).map((c) => `${width}: ${c.tag}: ${c.msg}`), []);
      assert.ok(res.checks.filter((c) => c.tag === 'przycisk').length >= 4, 'strona sprawdziła przycisk');
      assert.ok(res.checks.filter((c) => c.tag === 'koniec dnia').length >= 3, 'strona sprawdziła koniec dnia');
      assert.equal(res.checks.filter((c) => c.tag === 'szerokość').length, 1);
    }
    const pages = (await U.A.get('/__test/pages?ds=trades')).filter((p) => (p.p['Sesja backtestu']?.rich_text || []).length);
    const marks = pages.map((p) => p.p['Sesja backtestu'].rich_text.map((x) => x.text?.content ?? x.plain_text).join(''));
    // sesja 1: t1 i t2 przyciskiem (t2 bez opisu też, bo „Zapisz do Notion” wysyła wszystkie zaległe); sesja 2: t1 dnia kończonego
    assert.equal(marks.filter((m) => m.includes('bt-uinotion1/')).length, 2, marks.join(' | '));
    assert.equal(marks.filter((m) => m.includes('bt-uinotion2/')).length, 1, marks.join(' | '));
    U.stop();
  });

  test('backtest-E2: kopia definicji w ustawieniach', async () => {
    const { sanitizeSettings } = await lib('lib/sync.mjs');
    const C = await lib('public/js/bt-czas.js');
    // drzewo filtra głębsze niż limit sanitizeSettings (6 poziomów) i lista wykluczeń dłuższa niż 200 elementów: kopia przechodzi bez strat
    let deep = { kind: 'cond', f: 'gap', op: '>', v: 10 };
    for (let i = 0; i < 8; i++) deep = { op: i % 2 ? 'and' : 'or', items: [deep, { kind: 'cond', f: 'wd', op: 'in', v: [1, 2] }] };
    const excluded = Array.from({ length: 300 }, (_, i) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10));
    const def = { instruments: ['NQ', 'ES'], from: '2020-01-01', to: '2024-12-31', balance: 50000, risk: { mode: 'pct', value: 0.5 }, startTime: '09:00', order: 'random', seed: 7, accountId: 'aaaaaaaa-0000-4000-8000-000000000001', filter: deep, excluded };
    const sessions = [{ id: 'bt-abc123def', name: 'CPI 2024', def }, { id: 'bt-xyz987abc', name: 'Bez filtra', def: { ...def, filter: null, excluded: [] } }];
    const r = C.sessionsCopyOf(sessions);
    assert.equal(r.skipped, 0);
    const out = sanitizeSettings({ bt: C.sanitizeBt({ ...C.btDefaults(), sessionsCopy: r.copy }) });
    assert.deepEqual(out.bt.sessionsCopy, r.copy, 'sanitizeSettings zachowuje bt.sessionsCopy bez zmian');
    const back = C.sanitizeBt(out.bt).sessionsCopy;
    assert.deepEqual(back.map((x) => [x.id, x.name, C.defFromCopy(x.def)]), sessions.map((x) => [x.id, x.name, x.def]), 'odtworzenie definicji z kopii');
    assert.ok(!JSON.stringify(r.copy).includes('pool'), 'bez puli');
    // kopia większa niż 30 000 znaków jest pominięta (sesje tylko lokalnie)
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `bt-many${String(i).padStart(4, '0')}`, name: `S${i}`, def: { ...def, excluded: excluded.slice(0, 200) } }));
    const big = C.sessionsCopyOf(many);
    assert.ok(big.skipped > 0, 'część sesji poza kopią'); // poprawki po review E2 (#7): kopia przycięta, nie pusta
    assert.ok(big.copy.length > 0 && JSON.stringify(big.copy).length <= 30000);
    assert.ok(big.size <= 30000);
    // kopia z innego urządzenia (sesje, których tu nie ma) zostaje; lokalna wersja wygrywa
    const merged = C.sessionsCopyOf([sessions[0]], [{ id: 'bt-remote0001', name: 'Z laptopa', def: C.copyDef(def) }, { id: 'bt-abc123def', name: 'stara nazwa', def: C.copyDef(def) }]);
    assert.deepEqual(merged.copy.map((x) => `${x.id}:${x.name}`), ['bt-abc123def:CPI 2024', 'bt-remote0001:Z laptopa']);
    // zły wpis z synchronizacji odpada w sanitizeBt
    assert.deepEqual(C.sanitizeBt({ sessionsCopy: [{ id: '../x', name: 'a', def: {} }, { id: 'bt-ok000001', name: 'b', def: 5 }, 'x'] }).sessionsCopy, []);
  });
};
