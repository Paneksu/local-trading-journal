// backtest-N4: Ustawienia → Źródła danych (pakiet N4, 1.6.0). Specyfikacja: backtest-wyniki/N-pierwsze-kroki-ustawienia.md §3.1–3.2, §4.2, §4.6, §5.1, §6.
// Klucze Databento, FRED i Finnhub: zapis tylko do .env po bezpłatnym teście, maska z 4 ostatnimi znakami, „Testuj” i „Usuń”; kredyt bez wartości domyślnej
// (nowa instalacja), migracja domyślnych dla istniejących instalacji (kredyt 1.5.0 i okno 1s NQ), limity i kredyt z UI, import z wyceną i potwierdzeniem kwotą.
// Wyłącznie atrapy: Databento (testy/atrapa-databento.mjs), FRED i Finnhub (atrapy fetch podane przez serwer HTTP na pętli zwrotnej), katalogi tymczasowe.
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 1: klucze w UI z „Testuj” i „Usuń”, zapis wyłącznie do .env przez serwer)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 2: limity, kredyt i import z UI z wyceną i potwierdzeniem kwotą, bez podnoszenia twardych sufitów)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 3: nowa instalacja bez kredytu, stan kredytu właściciela usunięty z kodu)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 4: codzienne okno 1s NQ wyłączone w nowych instalacjach, włączone u obecnych)
import path from 'node:path';
import http from 'node:http';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  // Atrapa fetch (fakeFred / fakeFinnhub) wystawiona jako serwer HTTP na 127.0.0.1 (serwer dashboardu dostaje FRED_API_BASE / FINNHUB_API_BASE)
  function fetchServer(port, fn) {
    const srv = http.createServer(async (req, res) => {
      const r = await fn(`http://127.0.0.1:${port}${req.url}`, { headers: { 'X-Finnhub-Token': req.headers['x-finnhub-token'] } });
      res.writeHead(r.status, { 'Content-Type': 'application/json' }); res.end(await r.text());
    });
    return new Promise((ok) => srv.listen(port, '127.0.0.1', () => ok({ base: `http://127.0.0.1:${port}`, calls: fn.calls, close: () => srv.close() })));
  }
  const cfgOf = (dir) => JSON.parse(readFileSync(path.join(dir, 'config.local.json'), 'utf8'));

  // poprawki po review N1–N4: [U] 31.10.2026 «Wpisz tylko u mnie»: migracja nie wpisuje nikomu kredytu, zostaje tylko okno 1s u istniejących (decyzja 4)
  test('backtest-N4: upgradeDefaults: nowa instalacja z wyłączonym oknem 1s, istniejąca z włączonym (raz, znacznik); kredytu migracja nie wpisuje nikomu, własny bez zmian', async () => {
    const { upgradeDefaults } = await imp('lib/config-migracje.mjs');
    const fresh = {};
    assert.deepEqual(upgradeDefaults(fresh, { firstRun: true }), []);
    assert.ok(!('chartCredit' in fresh) && !('chartNq1sDaily' in fresh)); assert.equal(fresh.defaultsUpgraded, '1.6.0', 'znacznik także na nowej instalacji');
    const used = { chartSpend: { day: '2026-10-30', usd: 0.1 } };
    assert.deepEqual(upgradeDefaults(used, { firstRun: false }), ['chartNq1sDaily']);
    assert.ok(!('chartCredit' in used), 'historia wydatków nie daje kredytu'); assert.equal(used.chartNq1sDaily, true);
    used.chartNq1sDaily = false;
    assert.deepEqual(upgradeDefaults(used, { firstRun: false }), [], 'drugi start: nic (znacznik)');
    const own = { chartCredit: { startUsd: 50, expires: '2030-02-02', spentUsd: 3 }, chartNq1sDaily: false };
    assert.deepEqual(upgradeDefaults(own, { firstRun: false }), []);
    assert.deepEqual(own.chartCredit, { startUsd: 50, expires: '2030-02-02', spentUsd: 3 }); assert.equal(own.chartNq1sDaily, false);
  });

  test('backtest-N4: kod (także migracja) nie ma domyślnego stanu kredytu; sufity zostają (125, 50, 36, 100); okno 1s NQ tylko przy jawnym true', () => {
    const c = src('lib/candles.mjs');
    assert.ok(!/CREDIT_EXPIRES|CREDIT_SPENT_DEFAULT|startUsd: 12[5]|LEGACY_150/.test(c), 'candles.mjs bez stanu kredytu właściciela');
    assert.match(c, /export const CREDIT_MAX_USD = 125;/); assert.match(c, /export const IMPORT_MAX_USD = 50;/); assert.match(c, /export const OPEN_IMPORT_MAX_USD = 36;/); assert.match(c, /export const LIMIT_MAX_USD = 100;/);
    assert.match(c, /getConfig\(\)\.chartNq1sDaily === true/);
    const s = src('server.mjs');
    assert.match(s, /chartNq1sDaily: config\.chartNq1sDaily === true/);
    // poprawki po review N1–N4: [U] 31.10.2026 «Wpisz tylko u mnie»: także plik migracji bez stanu kredytu (żadna stała ani data wygaśnięcia)
    const others = ['server.mjs', 'lib/candles.mjs', 'lib/databento.mjs', 'lib/config-migracje.mjs', 'public/js/ust-zrodla.js', 'public/js/app.js'].map(src).join('\n');
    assert.ok(!/LEGACY_150|startUsd: 12[5]|expires: '20\d\d-\d\d-\d\d'/.test(others), 'zero stanu kredytu w kodzie');
    assert.ok(!/chartCredit/.test(src('lib/config-migracje.mjs').replace(/^\s*\/\/.*$/gm, '')), 'migracja nie dotyka kredytu');
  });

  test('backtest-N4: brak kredytu: pobranie płatne zablokowane z prośbą o wpisanie stanu (no-credit), wycena pokazuje noCredit; kredyt wpisany z potwierdzeniem odblokowuje', async () => {
    const { createCandles } = await imp('lib/candles.mjs');
    const D = await H.atrapaDb(4851);
    const dir = H.tmp(); const cfg = {};
    process.env.DATABENTO_API_BASE = D.base;
    try {
      const C = createCandles({ getKey: () => 'db-test-key-0123456789abcdef', getConfig: () => cfg, baseDir: dir, now: () => Date.parse('2026-10-28T12:00:00Z') });
      assert.deepEqual(C.credit(), { configured: false, startUsd: null, expires: null, spentUsd: null, leftUsd: 0, expired: false });
      const from = Date.parse('2024-03-12T13:00:00Z') / 1000;
      const q = await C.quote({ instrument: 'NQ', from, to: from + 3600, layer: '1m' });
      assert.equal(q.noCredit, true); assert.equal(q.overCredit, true);
      await assert.rejects(() => C.fetchDays({ instrument: 'NQ', from, to: from + 3600, layer: '1m', confirmedCostUsd: q.costUsd }), (e) => e.status === 409 && e.code === 'no-credit' && /Ustawieniach → Źródła danych/.test(e.message));
      assert.ok(!(await D.log()).log.some((c) => c.path === '/v0/timeseries.get_range'), 'nic nie pobrano');
      assert.throws(() => C.setLimit({ creditSpentUsd: 1, confirm: true }), (e) => e.status === 400 && e.code === 'credit-incomplete');
      assert.throws(() => C.setLimit({ creditStartUsd: 20, creditExpires: '2027-05-01' }), (e) => e.code === 'confirm-required');
      const r = C.setLimit({ creditStartUsd: 20, creditExpires: '2027-05-01', confirm: true });
      assert.deepEqual(r.credit, { configured: true, startUsd: 20, expires: '2027-05-01', spentUsd: 0, leftUsd: 20, expired: false });
      assert.throws(() => C.setLimit({ creditStartUsd: 126, creditExpires: '2027-05-01', confirm: true }), (e) => e.status === 400, 'sufit 125 USD');
      assert.throws(() => C.setLimit({ dailyLimitUsd: 101 }), (e) => e.status === 400, 'sufit limitu 100 USD');
      const q2 = await C.quote({ instrument: 'NQ', from, to: from + 3600, layer: '1m' });
      assert.equal(q2.noCredit, false); assert.equal(q2.overCredit, false);
    } finally { delete process.env.DATABENTO_API_BASE; D.stop(); }
  });

  test('backtest-N4: migracja przy starcie serwera: świeża bez kredytu i bez okna 1s; istniejąca (także z historią wydatków i kluczem w .env) bez kredytu, z oknem 1s; własny kredyt bez zmian', async () => {
    const run = async (port, files, env = {}) => {
      const dir = H.tmp();
      for (const [f, v] of Object.entries(files)) writeFileSync(path.join(dir, f), typeof v === 'string' ? v : JSON.stringify(v));
      const S = await H.server(port, { THQ_CONFIG_DIR: dir, ...env });
      try { const m = await (await fetch(`${S.base}/api/meta`)).json(); return { m, cfg: cfgOf(dir) }; } finally { S.stop(); }
    };
    const a = await run(4852, {});
    assert.equal(a.m.chartCredit.configured, false); assert.equal(a.m.chartNq1sDaily, false);
    assert.ok(!('chartCredit' in a.cfg) && a.cfg.defaultsUpgraded === '1.6.0');
    const b = await run(4853, { 'config.local.json': { lang: 'pl', chartSpend: { day: '2026-10-30', usd: 0.04 } }, '.env': '# klucze\nDATABENTO_API_KEY=db-test-key-0123456789abcdef\n' });
    assert.ok(!('chartCredit' in b.cfg)); assert.equal(b.m.chartCredit.configured, false, 'kredyt nie wpisany'); assert.equal(b.cfg.chartNq1sDaily, true); assert.equal(b.m.chartNq1sDaily, true);
    const c = await run(4854, { 'config.local.json': { lang: 'pl', chartCredit: { startUsd: 60, expires: '2030-03-01', spentUsd: 5 }, chartNq1sDaily: false } });
    assert.deepEqual(c.cfg.chartCredit, { startUsd: 60, expires: '2030-03-01', spentUsd: 5 }); assert.equal(c.cfg.chartNq1sDaily, false);
  });

  test('backtest-N4: GET /api/sources: klucze tak/nie z 4 ostatnimi znakami, limity, kredyt, sufity, kolejka z powodem; bez pełnych kluczy; obca strona 403', async () => {
    const dir = H.tmp();
    writeFileSync(path.join(dir, '.env'), 'DATABENTO_API_KEY=db-test-key-0123456789abcdef\nFRED_API_KEY=abcdefghij0123456789abcdefghWXYZ\n');
    const S = await H.server(4857, { THQ_CONFIG_DIR: dir });
    try {
      const r = await fetch(`${S.base}/api/sources`);
      const txt = await r.text(), j = JSON.parse(txt);
      assert.ok(!txt.includes('db-test-key-0123456789abcdef') && !txt.includes('abcdefghij0123456789abcdefghWXYZ') && !txt.includes('0123456789'), 'bez pełnych kluczy');
      assert.deepEqual(j.keys, { databento: { configured: true, hint: 'cdef' }, fred: { configured: true, hint: 'WXYZ' }, finnhub: { configured: false, hint: '' } });
      assert.equal(j.databento.limitUsd, 1); assert.equal(j.databento.dailyLimitUsd, 3); assert.equal(j.databento.credit.configured, false); assert.equal(j.databento.nq1sDaily, false);
      assert.deepEqual(j.databento.caps, { limitMaxUsd: 100, creditMaxUsd: 125, importMaxUsd: 50, open1sMaxUsd: 36 });
      assert.ok(j.databento.queue && 'reason' in j.databento.queue && Array.isArray(j.databento.queue.items));
      assert.ok(j.databento.status && 'running' in j.databento.status); assert.ok(j.databento.open1s && 'spentUsd' in j.databento.open1s);
      assert.equal((await fetch(`${S.base}/api/sources`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    } finally { S.stop(); }
  });

  test('backtest-N4: POST /api/sources/key: Databento, FRED i Finnhub zapisane do .env dopiero po teście u dostawcy (atrapy), zły klucz nie trafia do pliku, „Usuń” usuwa linię, komentarze i inne linie zostają; klucz nigdy w odpowiedzi ani w logu', async () => {
    const { fakeFred } = await imp('testy/atrapa-fred.mjs');
    // klucz FRED w formacie serwera (32 litery i cyfry); atrapa przyjmuje tylko jego
    const FAKE_KEY = 'fredtest0123456789abcdef01234567';
    const { fakeFinnhub, FAKE_FH_KEY } = await imp('testy/atrapa-finnhub.mjs');
    const D = await H.atrapaDb(4858);
    const F = await fetchServer(4859, fakeFred({ 10: ['2026-10-10', '2026-11-13'] }, { key: FAKE_KEY }));
    const FH = await fetchServer(4861, fakeFinnhub({ rows: [] }));
    const dir = H.tmp();
    const envFile = path.join(dir, '.env');
    writeFileSync(envFile, '# JustJournal: klucze tylko na tym komputerze\nNOTION_VERSION=2026-03-11\n# komentarz w środku\nINNA_LINIA=zostaje\n');
    const S = await H.server(4862, { THQ_CONFIG_DIR: dir, DATABENTO_API_BASE: D.base, FRED_API_BASE: F.base, FINNHUB_API_BASE: FH.base });
    const DB_KEY = 'db-test-key-0123456789abcdef';
    try {
      assert.equal((await fetch(`${S.base}/api/sources/key`, { method: 'POST', headers: { Origin: S.base, 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'fred', key: FAKE_KEY }) })).status, 403);
      assert.equal((await H.dash(S.base, '/api/sources/key', { source: 'notion', key: 'x'.repeat(30) })).status, 400);
      assert.equal((await H.dash(S.base, '/api/sources/key', { source: 'fred', key: 'za-krotki' })).status, 400);
      // zły klucz (atrapa odrzuca): 400, plik bez zmian, komunikat bez klucza
      const badFred = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz1';
      const bf = await H.dash(S.base, '/api/sources/key', { source: 'fred', key: badFred });
      assert.equal(bf.status, 400, JSON.stringify(bf.j)); assert.ok(!JSON.stringify(bf.j).includes(badFred)); assert.ok(!readFileSync(envFile, 'utf8').includes('FRED_API_KEY'));
      const badDb = await H.dash(S.base, '/api/sources/key', { source: 'databento', key: 'db-zly-klucz-000000000' });
      assert.ok(badDb.status >= 400 && !JSON.stringify(badDb.j).includes('db-zly-klucz-000000000'));
      for (const [source, key, hint] of [['databento', DB_KEY, 'cdef'], ['fred', FAKE_KEY, FAKE_KEY.slice(-4)], ['finnhub', FAKE_FH_KEY, FAKE_FH_KEY.slice(-4)]]) {
        const r = await H.dash(S.base, '/api/sources/key', { source, key });
        assert.equal(r.status, 200, `${source}: ${JSON.stringify(r.j)}`); assert.deepEqual(r.j, { ok: true, source, configured: true, hint });
      }
      assert.ok(F.calls.length >= 2 && FH.calls.some((c) => c.path === '/api/v1/calendar/earnings'), 'FRED i Finnhub sprawdzone na atrapach');
      const env1 = readFileSync(envFile, 'utf8');
      assert.match(env1, /^# JustJournal: klucze tylko na tym komputerze\nNOTION_VERSION=2026-03-11\n# komentarz w środku\nINNA_LINIA=zostaje\n/, 'początek pliku bez zmian');
      assert.match(env1, new RegExp(`DATABENTO_API_KEY=${DB_KEY}\\n`)); assert.match(env1, new RegExp(`FRED_API_KEY=${FAKE_KEY}\\n`)); assert.match(env1, new RegExp(`FINNHUB_API_KEY=${FAKE_FH_KEY}\\n`));
      const st = await (await fetch(`${S.base}/api/sources`)).json();
      assert.deepEqual(Object.values(st.keys).map((k) => k.configured), [true, true, true]);
      // „Testuj” (diag) dla FRED i Finnhub: jedno zapytanie do atrapy
      const nF = F.calls.length;
      const tf = await H.dash(S.base, '/api/diag/test', { source: 'fred' });
      assert.equal(tf.j.ok, true, JSON.stringify(tf.j)); assert.equal(F.calls.length, nF + 1, 'jedno zapytanie FRED');
      const th = await H.dash(S.base, '/api/diag/test', { source: 'finnhub' });
      assert.equal(th.j.ok, true, JSON.stringify(th.j));
      // usunięcie
      for (const source of ['fred', 'databento']) {
        const r = await H.dash(S.base, '/api/sources/key', { source, remove: true });
        assert.deepEqual(r.j, { ok: true, source, configured: false, hint: '' });
      }
      const env2 = readFileSync(envFile, 'utf8');
      assert.ok(!/FRED_API_KEY|DATABENTO_API_KEY/.test(env2), 'linie kluczy usunięte'); assert.match(env2, /# komentarz w środku\nINNA_LINIA=zostaje\n/); assert.match(env2, /FINNHUB_API_KEY=/);
      const m = await (await fetch(`${S.base}/api/meta`)).json();
      assert.equal(m.hasDatabentoKey, false); assert.equal(m.hasFredKey, false); assert.equal(m.hasFinnhubKey, true);
      const dt = await H.dash(S.base, '/api/diag/test', { source: 'databento' });
      assert.equal(dt.j.code, 'no-key');
      await H.sleep(200);
      const out = S.p.out + S.p.err;
      for (const k of [DB_KEY, FAKE_KEY, FAKE_FH_KEY, badFred]) assert.ok(!out.includes(k), `klucz ${k.slice(0, 6)}… w logu serwera`);
      assert.equal((await H.dash(S.base, '/api/sources/key', { source: 'fred', remove: 'tak' })).status, 400, 'remove tylko jako true');
    } finally { S.stop(); D.stop(); F.close(); FH.close(); }
  });

  test('backtest-N4: saveEnv: zapis atomowy z zachowaniem innych linii i komentarzy, null usuwa wszystkie linie klucza', async () => {
    const { saveEnv, loadEnv } = await imp('lib/env.mjs');
    const dir = H.tmp(); mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '.env'), '# góra\nA=1\nFRED_API_KEY=stary\n# dół\nFRED_API_KEY=duplikat\n');
    saveEnv({ FRED_API_KEY: null, B: '2' }, dir);
    assert.equal(readFileSync(path.join(dir, '.env'), 'utf8'), '# góra\nA=1\n# dół\nB=2\n');
    assert.equal(loadEnv(dir).FRED_API_KEY, undefined);
    assert.ok(!existsSync(path.join(dir, '.env.tmp')));
  });

  // ---------- ekran (Chrome/Edge headless, scenariusz testy/scen-N4.js) ----------
  const runs = {};
  function pageResult(narrow) {
    runs[narrow] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { fakeFred } = await imp('testy/atrapa-fred.mjs');
      const { fakeFinnhub } = await imp('testy/atrapa-finnhub.mjs');
      const fredKey = 'fredtest0123456789abcdef0123ab67';
      const base = narrow ? 4871 : 4863;
      const A = await H.atrapa(base);
      const D = await H.atrapaDb(base + 1);
      const F = await fetchServer(base + 2, fakeFred({}, { key: fredKey }));
      const FH = await fetchServer(base + 3, fakeFinnhub({ rows: [] }));
      const S = await H.server(base + 4, { NOTION_API_BASE: A.base, DATABENTO_API_BASE: D.base, FRED_API_BASE: F.base, FINNHUB_API_BASE: FH.base, THQ_CONFIG_DIR: H.tmp(), NOTION_TOKEN: 'secret_atrapa', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL });
      try {
        const opt = narrow ? { width: 375, height: 812, mobile: true } : { width: 1920, height: 1080 };
        const scen = 'window.__N4 = ' + JSON.stringify({ dbKey: 'db-test-key-0123456789abcdef', fredKey }) + ';' + String.fromCharCode(10) + src('testy/scen-N4.js');
        const txt = await P.cdpPage(S.base + '/', { ...opt, timeoutMs: 180_000, until: "window.__thq && document.querySelector('#view .page-head')", extract: scen });
        const res = JSON.parse(txt);
        res.violations = (await D.log()).violations;
        res.serverOut = S.p.out + S.p.err;
        return res;
      } finally { S.stop(); A.stop(); D.stop(); F.close(); FH.close(); }
    })();
    return runs[narrow];
  }
  async function tagged(tag, min, narrow = false) {
    const res = await pageResult(narrow);
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, tag + ': strona wykonała sprawdzenia (' + mine.length + ')');
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], tag + ': nieudane sprawdzenia');
    return res;
  }
  test('backtest-N4: ekran Źródła danych (świeża instalacja): bez klucza, kredyt nie wpisany, okno 1s wyłączone, import zablokowany, wygląd newsów poza tą sekcją', async () => { await tagged('start', 6); });
  test('backtest-N4: ekran: klucz Databento zapisany z maską …cdef i przetestowany, klucz FRED zapisany i usunięty z potwierdzeniem; klucze poza localStorage i blokiem w Notion', async () => {
    const r = await tagged('klucz', 8);
    assert.deepEqual(r.violations, [], 'atrapa Databento bez naruszeń');
    assert.ok(!r.serverOut.includes('db-test-key-0123456789abcdef') && !r.serverOut.includes('fredtest0123456789abcdef0123ab67'), 'klucze nie trafiają do logu serwera');
  });
  test('backtest-N4: ekran: kredyt wpisany z potwierdzeniem, podniesienie limitu z potwierdzeniem kwotą, obniżenie bez, okno 1s NQ po potwierdzeniu kosztu, kolejka z opisem', async () => { await tagged('kredyt', 3); await tagged('limity', 3); await tagged('automat', 3); });
  test('backtest-N4: ekran: import 1m (wycena dryRun → wpisanie kwoty → pobranie) i wycena okien 1s z budżetem 36 USD', async () => { await tagged('import', 7); });
  test('backtest-N4: ekran: newsy i earningsy rozcięte (wygląd w Wykresach, klucze w Źródłach danych)', async () => { await tagged('rozciecie', 2); });
  test('backtest-N4: ekran 375 px: ten sam przebieg bez poziomego przewijania', async () => { for (const [tag, n] of [['start', 6], ['klucz', 8], ['kredyt', 3], ['limity', 3], ['automat', 3], ['import', 7], ['rozciecie', 2]]) await tagged(tag, n, true); });
};
