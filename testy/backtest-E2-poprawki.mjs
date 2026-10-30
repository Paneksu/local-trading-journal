// backtest-E2: poprawki po review D1–E2 (code-reviewer #1–#3, #5–#7, security S1–S4). Wyłącznie atrapa Notion i świece syntetyczne.
// Wysyłka w Node na prawdziwych modułach serwera (testy/bt-notion-rig.mjs), panel journalingu, lista i timer w przeglądarce (testy/backtest-notion.html?part=poprawki).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rig, trade, session, SID, DAY1, DAY2, envDir } from './bt-notion-rig.mjs';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const posts = (R) => R.calls.filter((c) => c === 'POST /v1/pages').length;

  test('backtest-E2: setup spoza reguły zapisu odrzucany w panelu (reguła jak writes.mjs)', async () => {
    const { FIRMA_RE } = await lib('lib/writes.mjs');
    const { SETUP_RE } = await lib('public/js/bt-notion.js');
    assert.equal(SETUP_RE.source, FIRMA_RE.source, 'ta sama reguła co zapis nowej opcji w writes.mjs');
    assert.equal(SETUP_RE.flags, FIRMA_RE.flags);
    for (const ok of ['Breakout', 'ORB 5m', 'Pullback + FVG', "Judas' swing"]) assert.ok(SETUP_RE.test(ok), ok);
    for (const bad of ['FVG/OB', 'ICT 2022: model', 'x'.repeat(41), 'a,b', '#1']) assert.ok(!SETUP_RE.test(bad), bad);
  });

  test('backtest-E2: trade z błędem wraca na listę i po nowym opisie idzie ponownie', async () => {
    const { listOf } = await lib('public/js/bt-notion.js');
    const R = await rig(H, assert, ROOT, 5620);
    try {
      R.store.save(SID, session([trade(1, { setup: 'FVG/OB' }), trade(2)]), 0);
      const r1 = await R.sync.push({ sessionId: SID });
      assert.deepEqual([r1.sent, r1.failed.length], [1, 1]);
      assert.equal(R.tr('t1').notion.state, 'error');
      assert.deepEqual(listOf(R.store.read(SID)).map((x) => x.id), ['t1'], 'lista „do uzupełnienia” obejmuje trade z błędem wysyłki');
      // nowy opis (jEdited) → zwykła wysyłka (bez „all”) próbuje znowu
      R.edit((d) => { const x = d.trades[0]; x.setup = 'FVG OB'; x.jEdited = 5; });
      const r2 = await R.sync.push({ sessionId: SID });
      assert.deepEqual([r2.sent, r2.failed.length, r2.pending], [1, 0, 0], JSON.stringify(r2.failed));
      assert.equal((await R.page('t1')).p.Setup.select.name, 'FVG OB');
    } finally { R.A.stop(); }
  });

  test('backtest-E2: opis po wysyłce aktualizuje istniejącą stronę', async () => {
    const { isUnsent } = await lib('public/js/bt-notion.js');
    const R = await rig(H, assert, ROOT, 5621);
    try {
      R.store.save(SID, session([trade(1, { journal: 'todo', setup: '', notes: '' })]), 0);
      assert.equal((await R.sync.push({ sessionId: SID, all: true })).sent, 1, 'przycisk wysyła trade bez opisu (decyzja gustu E2)');
      const n = posts(R), id = R.tr('t1').notion.id;
      R.edit((d) => { const x = d.trades[0]; x.setup = 'Pullback'; x.notes = 'opis później'; x.journal = 'done'; x.jEdited = 7; });
      assert.ok(isUnsent(R.tr('t1')), 'zmieniony opis liczy się do niezapisanych');
      assert.equal(R.sync.pending(SID), 1);
      const r = await R.sync.push({ sessionId: SID });
      assert.deepEqual([r.sent, r.pending], [1, 0]);
      assert.equal(posts(R), n, 'bez nowej strony');
      const p = await R.page('t1');
      assert.equal(p.id, id);
      assert.equal(p.p.Setup.select.name, 'Pullback');
      assert.equal(R.text(p, 'Notatki'), 'opis później');
      assert.equal((await R.pages()).length, 1);
      const calls = R.calls.length;
      assert.deepEqual([(await R.sync.push({ sessionId: SID })).sent], [0]);
      assert.equal(R.calls.filter((c, i) => i >= calls && c.startsWith('PATCH')).length, 0, 'bez zmian = bez PATCH');
    } finally { R.A.stop(); }
  });

  test('backtest-E2: timer ponawia tylko próbowane trade\'y z dni zakończonych', async () => {
    const R = await rig(H, assert, ROOT, 5622);
    try {
      R.store.save(SID, session([trade(1), trade(2, { day: DAY2 }), trade(3, { day: DAY2 })], { days: { [DAY1]: { status: 'active' }, [DAY2]: { status: 'done' } } }), 0);
      // nic nie było próbowane: automat nie wysyła niczego (bieżący dzień nigdy, zakończony dopiero po pierwszej próbie)
      const r0 = await R.sync.push({ sessionId: SID, auto: true });
      assert.deepEqual([r0.sent, posts(R)], [0, 0]);
      await R.A.post('/__test/fail', { match: 'POST /v1/pages', after: 0, status: 503 });
      const r1 = await R.sync.push({ sessionId: SID, day: DAY2 });
      assert.equal(r1.sent, 0);
      assert.ok(R.tr('t2').notion.error && R.tr('t3').notion.error, 'cała kolejka dnia oznaczona jako próbowana');
      R.clock += 31_000;
      const r2 = await R.sync.push({ sessionId: SID, auto: true });
      assert.equal(r2.sent, 2, JSON.stringify(r2.failed));
      assert.equal(R.tr('t1').notion.state, 'pending', 'bieżący dzień nie wychodzi automatycznie');
      assert.equal((await R.pages()).length, 2);
    } finally { R.A.stop(); }
  });

  test('backtest-E2: Notion 409 conflict_error jest przejściowy', async () => {
    const R = await rig(H, assert, ROOT, 5623);
    try {
      R.store.save(SID, session([trade(1)]), 0);
      R.fault = (m, p) => (m === 'POST' && p === '/v1/pages' ? 'before-409c' : null);
      const r = await R.sync.push({ sessionId: SID });
      assert.equal(r.sent, 0);
      assert.equal(R.tr('t1').notion.state, 'pending', '409 conflict_error: ponowić, nie błąd trwały');
    } finally { R.A.stop(); }
  });

  test('backtest-E2: odstęp przed ponownym utworzeniem strony po zgubionej odpowiedzi', async () => {
    const R = await rig(H, assert, ROOT, 5624);
    try {
      R.store.save(SID, session([trade(1)]), 0);
      // zerwane połączenie przy POST: klient nie wie, czy strona powstała (tu nie powstała, więc znacznik jej nie znajdzie)
      let once = true;
      R.fault = (m, p) => (m === 'POST' && p === '/v1/pages' && once ? ((once = false), 'before-net') : null);
      await R.sync.push({ sessionId: SID });
      assert.ok(Number.isFinite(R.tr('t1').notion.postAt), 'czas próby w stanie notion');
      const n = posts(R);
      const r1 = await R.sync.push({ sessionId: SID, all: true });
      assert.equal(posts(R), n, 'w ciągu 30 s bez nowego POST');
      assert.equal(r1.sent, 0);
      R.clock += 31_000;
      const r2 = await R.sync.push({ sessionId: SID });
      assert.equal(r2.sent, 1);
      assert.equal((await R.pages()).length, 1);
    } finally { R.A.stop(); }
  });

  test('backtest-E2: limit czasu żądania do Notion przy wysyłce', async () => {
    const R = await rig(H, assert, ROOT, 5625, { timeoutMs: 300 });
    try {
      R.store.save(SID, session([trade(1)]), 0);
      R.fault = (m, p) => (m === 'POST' && p === '/v1/pages' ? 'hang' : null);
      const t0 = Date.now();
      const r = await R.sync.push({ sessionId: SID });
      assert.ok(Date.now() - t0 < 5000, 'zawieszone żądanie nie blokuje kolejki');
      assert.equal(r.sent, 0);
      assert.equal(R.tr('t1').notion.state, 'pending', 'przekroczony czas = przejściowy');
    } finally { R.A.stop(); }
  });

  test('backtest-E2: trade z entryT: null nie blokuje kolejki', async () => {
    const R = await rig(H, assert, ROOT, 5626);
    try {
      R.store.save(SID, session([trade(1, { entryT: null }), trade(2, { dir: 'Up' }), trade(3)]), 0);
      const r = await R.sync.push({ sessionId: SID });
      assert.equal(r.sent, 1, JSON.stringify(r.failed));
      assert.deepEqual([R.tr('t1').notion.state, R.tr('t2').notion.state, R.tr('t3').notion.state], ['error', 'error', 'sent']);
      // błędu walidacji automat nie ponawia (bez pełnego odczytu Notion co 60 s)
      const calls = R.calls.length;
      await R.sync.push({ sessionId: SID, auto: true });
      await R.sync.push({ sessionId: SID });
      assert.equal(R.calls.length, calls, 'bez żądań do Notion');
    } finally { R.A.stop(); }
  });

  test('backtest-E2: zapis z przeglądarki nie ustawia notion nieznanego trade\'a', async () => {
    const { createBacktestStore } = await lib('lib/backtest-store.mjs');
    const st = createBacktestStore({ baseDir: path.join(H.tmp(), 'chart-data'), log: () => {} });
    st.save(SID, session([trade(1, { notion: { id: '11111111-1111-4111-8111-111111111111', state: 'sent', error: null } })]), 0);
    assert.deepEqual(st.read(SID).trades[0].notion, { id: null, state: 'pending', error: null });
  });

  test('backtest-E2: uszkodzony plik sesji to corrupt bez szczegółów', async () => {
    const dir = H.tmp();
    const sdir = path.join(dir, 'chart-data', 'backtest', 'sessions');
    mkdirSync(sdir, { recursive: true });
    writeFileSync(path.join(sdir, 'bt-zepsuty01.json'), '{"v":1,"name":"ucię');
    const S = await H.server(5627, { THQ_CONFIG_DIR: dir });
    try {
      const g = await fetch(`${S.base}/api/backtest/session/bt-zepsuty01`);
      const gj = await g.json();
      assert.equal(g.status, 422);
      assert.equal(gj.code, 'corrupt');
      const s = await H.dash(S.base, '/api/backtest/session/save', { id: 'bt-zepsuty01', doc: { v: 1 }, rev: 3 });
      assert.deepEqual([s.status, s.j.code], [422, 'corrupt'], 'zapis do uszkodzonego pliku: nie „zmiana w innej karcie”');
      const n = await H.dash(S.base, '/api/backtest/notion', { sessionId: 'bt-zepsuty01' });
      assert.deepEqual([n.status, n.j.code], [422, 'corrupt']);
      for (const j of [gj, s.j, n.j]) assert.ok(!/JSON|position|Unterminated|[\\/]|sessions/i.test(j.error), `bez szczegółów: ${j.error}`);
    } finally { S.stop(); }
  });

  test('backtest-E2: kopia za duża nie kasuje istniejących wpisów', async () => {
    const C = await lib('public/js/bt-czas.js');
    const excluded = Array.from({ length: 200 }, (_, i) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10));
    const def = { instruments: ['NQ'], from: '2020-01-01', to: '2024-12-31', balance: 50000, risk: { mode: 'usd', value: 500 }, startTime: '09:00', order: 'chrono', seed: 1, accountId: null, filter: null, excluded };
    const prev = [{ id: 'bt-remote0001', name: 'Z laptopa', def: C.copyDef(def) }];
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `bt-many${String(i).padStart(4, '0')}`, name: `S${i}`, def }));
    const r = C.sessionsCopyOf(many, prev);
    assert.ok(r.skipped > 0, 'część lokalnych pominięta');
    assert.ok(r.copy.length > 1, 'kopia nie jest pusta');
    assert.ok(r.copy.some((x) => x.id === 'bt-remote0001'), 'wpis innego urządzenia zostaje');
    assert.ok(JSON.stringify(r.copy).length <= C.COPY_MAX);
    assert.ok(r.copy.some((x) => x.id === 'bt-many0000'), 'najnowsze sesje (początek listy) mają pierwszeństwo');
    // istniejący wpis lokalny, który po zmianie nie mieści się w limicie, zostaje w starej wersji
    const full = C.sessionsCopyOf(many, []).copy;
    const grown = many.map((x, i) => (i === 0 ? { ...x, name: 'nowa nazwa', def: { ...def, excluded: excluded.concat(excluded) } } : x));
    const r2 = C.sessionsCopyOf(grown, full);
    assert.ok(r2.copy.some((x) => x.id === 'bt-many0000'), 'nie znika');
  });

  // ---- przeglądarka: panel, lista „do uzupełnienia” z błędem wysyłki, timer ----
  test('backtest-E2: panel, lista z błędem wysyłki i timer w przeglądarce', async () => {
    const P = await lib('testy/przegladarka.mjs');
    if (!P.findBrowser()) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    const A = await H.atrapa(5628);
    const dir = envDir(H);
    const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
    assert.equal(mig.code, 0, mig.err);
    const { syntheticDay } = await lib('testy/bt-dane-syntetyczne.mjs');
    await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: DAY2, seed: 8 });
    await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: DAY1, seed: 3 });
    const { createBacktestStore } = await lib('lib/backtest-store.mjs');
    const st = createBacktestStore({ baseDir: path.join(dir, 'chart-data'), log: () => {} });
    const T = Date.UTC(2024, 2, 12, 13, 50) / 1000;
    const tr = (o) => trade(1, { entryT: T, exitT: T + 120, exits: [{ t: T + 120, price: 18011, qty: 1, reason: 'tp' }], ...o });
    st.save('bt-uipanel01', session([tr({ setup: 'FVG/OB' })], { id: 'bt-uipanel01' }), 0);
    st.setNotion('bt-uipanel01', 't1', { id: null, state: 'error', error: 'Wybierz jedną z opcji' });
    st.save('bt-uitimer01', session([tr()], { id: 'bt-uitimer01' }), 0);
    st.save('bt-uitimer02', session([tr()], { id: 'bt-uitimer02', days: { [DAY1]: { status: 'done' } } }), 0);
    st.setNotion('bt-uitimer02', 't1', { id: null, state: 'pending', error: 'Notion API: błąd 503' });
    const S = await H.server(5629, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, THQ_TEST_PAGES: '1' });
    try {
      const txt = await P.cdpPage(`${S.base}/__testy/backtest-notion.html?part=poprawki`, { width: 1920, height: 1080, timeoutMs: 120_000, until: "!!document.getElementById('wynik') && document.getElementById('wynik').textContent !== '…'" });
      const res = JSON.parse(txt);
      assert.ok(!res.fatal, res.fatal);
      assert.deepEqual(res.checks.filter((c) => !c.ok).map((c) => `${c.tag}: ${c.msg}`), []);
      for (const [tag, min] of [['panel', 5], ['timer', 2]]) assert.ok(res.checks.filter((c) => c.tag === tag).length >= min, `${tag}: strona wykonała sprawdzenia`);
      const marks = (await A.get('/__test/pages?ds=trades')).filter((p) => (p.p['Sesja backtestu']?.rich_text || []).length).map((p) => p.p['Sesja backtestu'].rich_text.map((x) => x.text?.content ?? x.plain_text).join(''));
      assert.equal(marks.filter((m) => m.includes('bt-uitimer01/')).length, 0, 'timer nie wysyła bieżącego dnia');
      assert.equal(marks.filter((m) => m.includes('bt-uitimer02/')).length, 1, 'timer ponawia próbowany trade zakończonego dnia');
      assert.equal(marks.filter((m) => m.includes('bt-uipanel01/')).length, 1, 'poprawiony trade z błędem wysłany');
    } finally { S.stop(); A.stop(); }
  });
};
