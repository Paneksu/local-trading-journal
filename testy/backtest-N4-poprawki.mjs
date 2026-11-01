// backtest-N4: poprawki po review N1–N4 (backtest-wyniki/N4/review-kod.md, review-bezpieczenstwo.md), pakiet 1.6.0.
// Migracja bez kredytu, uszkodzony config.local.json, instalacja z terminala, blokady przenoszenia, wspólna blokada restartu / zatrzymania / aktualizacji,
// komunikat wykresu bez kredytu, saveEnv z CRLF, wolny start skryptów, walidacja ścieżek Windows, maskowanie logu. Wyłącznie atrapy i katalogi tymczasowe.
// [U] 31.10.2026 «Wpisz tylko u mnie» (migracja w kodzie nie wpisuje nikomu kwot kredytu)
import path from 'node:path';
import { writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// final (1.11.2026): strażnik liczb kredytu właściciela obejmuje wszystkie bieżące pliki tekstowe repo (kod, testy, strony testowe .html, dokumentacja .md).
// Data wygaśnięcia, wydana kwota i pozostały kredyt właściciela nie mogą stać w tym pliku jawnie, więc porównujemy skróty SHA-256 kandydatów.
// Start kredytu 125 (kwota publiczna z cennika Databento) łapie wzorzec tylko przy polu startu albo zapisie chartCredit, nie przy sufitach (CREDIT_MAX_USD).
// [U] 1.11.2026 «Usuń z bieżących plików»
const SELF = 'testy/backtest-N4-poprawki.mjs';
const OWNER_HASH = new Set(['8433d9195141dfc8', 'c6336ddca107ab42', '007a8d97f150ddd8', 'a7e46abf169710b3']);
const h16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const num = (s) => String(Number(s.replace(',', '.')));
export function ownerCredit(text, self = false) {
  const cands = [];
  for (const m of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\.\d{2}\.\d{4}\b/g)) cands.push(m[0]);
  for (const m of text.matchAll(/\b\d{3}[.,]\d{2}\b/g)) cands.push(num(m[0]));
  for (const m of text.matchAll(/(?:[Ss]pent\w*|[Ww]ydan[eo]\w*)\D{1,40}?(\d+[.,]\d+)/g)) cands.push(num(m[1]));
  const bad = cands.find((c) => OWNER_HASH.has(h16(c)));
  if (bad) return 'wartość ze stanu konta';
  if (!self) {
    const m = /(?:[Ss]tartUsd|sv-cr-start)[^\n]{0,20}?\b125\b|chartCredit[^\n]{0,60}?\b125\b|[Kk]redyt\w*[^\n.;]{0,12}\b125\b[^\n.;]{0,20}(?:wygasa|ważny do|expires)\s+\S*20\d\d/.exec(text);
    if (m) return m[0];
  }
  return null;
}
export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  // bieżące pliki tekstowe repo (bez bibliotek z public/vendor, danych i zależności)
  const ownerScanFiles = () => {
    const out = [];
    const walk = (rel) => {
      for (const e of readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { if (!/^(\.git|node_modules|chart-data|backups|vendor|screens)$/.test(e.name)) walk(r); }
        else if (/\.(mjs|js|html|md|json|cmd|sh|vbs)$/.test(e.name) && statSync(path.join(ROOT, r)).size < 4e6 && !/^(config\.local|\.env)/.test(e.name)) out.push(r);
      }
    };
    walk('');
    return out;
  };
  const cfgOf = (dir) => JSON.parse(readFileSync(path.join(dir, 'config.local.json'), 'utf8'));
  const put = (f, d) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, d); };

  test('backtest-N4 poprawki: migracja nie wpisuje nikomu kredytu (tylko okno 1s u istniejących), zero liczb kredytu właściciela w kodzie i testach', async () => {
    const M = await imp('lib/config-migracje.mjs');
    assert.equal(M.LEGACY_150, undefined, 'bez stałej ze stanem kredytu');
    const used = { chartSpend: { day: '2026-10-30', usd: 0.04 } };
    assert.deepEqual(M.upgradeDefaults(used, { firstRun: false }), ['chartNq1sDaily']);
    assert.ok(!('chartCredit' in used), 'istniejąca instalacja z historią wydatków: kredyt nie wpisany');
    for (const f of ownerScanFiles()) {
      const hit = ownerCredit(src(f), f === SELF);
      assert.equal(hit, null, `${f}: liczby kredytu właściciela (${hit})`);
    }
    assert.match(src('lib/config-migracje.mjs'), /\/\/ \[U\] 31\.10\.2026 «Wpisz tylko u mnie»/);
    assert.ok(H.TEST_CREDIT.startUsd !== 125 && Date.parse(H.TEST_CREDIT.expires) > Date.now(), 'kredyt testowy neutralny, ważny w przyszłości');
  });

  test('backtest-N4 poprawki: istniejąca instalacja z kluczem Databento i bez kredytu: po starcie kredyt nie wpisany, okno 1s włączone', async () => {
    const dir = H.tmp();
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ lang: 'pl', chartSpend: { day: '2026-10-30', usd: 0.04 } }));
    writeFileSync(path.join(dir, '.env'), 'DATABENTO_API_KEY=db-test-key-0123456789abcdef\n');
    const S = await H.server(4831, { THQ_CONFIG_DIR: dir });
    try {
      const m = await (await fetch(`${S.base}/api/meta`)).json();
      assert.equal(m.chartCredit.configured, false); assert.equal(m.chartNq1sDaily, true);
      assert.ok(!('chartCredit' in cfgOf(dir)));
    } finally { S.stop(); }
  });

  test('backtest-N4 poprawki: nieczytelny config.local.json: kopia .corrupt-<czas> przed zapisem, bez migracji (kredyt nie wpisany, okno 1s wyłączone), komunikat w diagnostyce', async () => {
    const dir = H.tmp();
    const bad = '{ "defaultsUpgraded": "1.6.0", "chartNq1sDaily": false, "chartCredit": { "startUsd": 10, "expires": "2030-01-01", "spentUsd": 9 }, "lang": "pl", }';
    writeFileSync(path.join(dir, 'config.local.json'), bad);
    writeFileSync(path.join(dir, '.env'), 'DATABENTO_API_KEY=db-test-key-0123456789abcdef\n');
    const S = await H.server(4832, { THQ_CONFIG_DIR: dir });
    try {
      const backups = readdirSync(dir).filter((f) => /^config\.local\.json\.corrupt-\d{8}-\d{6}$/.test(f));
      assert.equal(backups.length, 1, readdirSync(dir).join(', '));
      assert.equal(readFileSync(path.join(dir, backups[0]), 'utf8'), bad, 'oryginał zachowany bajt w bajt');
      const m = await (await fetch(`${S.base}/api/meta`)).json();
      assert.equal(m.chartCredit.configured, false, 'bez wymyślonego kredytu'); assert.equal(m.chartNq1sDaily, false, 'bez włączonego okna 1s');
      const cfg = cfgOf(dir);
      assert.equal(cfg.defaultsUpgraded, '1.6.0'); assert.ok(!('chartCredit' in cfg)); assert.notEqual(cfg.chartNq1sDaily, true);
      const d = await (await fetch(`${S.base}/api/diag`)).json();
      assert.equal(d.configCorrupt, backups[0], 'diagnostyka podaje nazwę kopii');
    } finally { S.stop(); }
    assert.match(src('public/js/ust-diag.js'), /configCorrupt/);
  });

  test('backtest-N4 poprawki: instalacja z terminala (setup.mjs) zapisuje znacznik: okno 1s wyłączone i kredyt nie wpisany po pierwszym starcie', async () => {
    const A = await H.atrapa(4833);
    const dir = H.tmp();
    try {
      const r = await H.run(path.join(ROOT, 'setup.mjs'), ['--lang', 'pl', '--token', 'test', '--parent', H.PARENT_URL, '--no-demo', '--yes'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
      assert.equal(r.code, 0, r.err);
      assert.equal(cfgOf(dir).defaultsUpgraded, '1.6.0');
      writeFileSync(path.join(dir, '.env'), readFileSync(path.join(dir, '.env'), 'utf8') + 'DATABENTO_API_KEY=db-test-key-0123456789abcdef\n');
      const S = await H.server(4834, { THQ_CONFIG_DIR: dir, NOTION_API_BASE: A.base });
      try {
        const m = await (await fetch(`${S.base}/api/meta`)).json();
        assert.equal(m.chartNq1sDaily, false); assert.equal(m.chartCredit.configured, false);
      } finally { S.stop(); }
    } finally { A.stop(); }
  });

  test('backtest-N4 poprawki: przenoszenie: blokada zajęta przed pierwszym await (dwa równoległe start → drugi 409), faza ready blokuje zapisy, anulowanie w ready zdejmuje blokadę', async () => {
    const D = await imp('lib/dysk.mjs');
    const dir = H.tmp(), data = path.join(dir, 'chart-data');
    for (let i = 0; i < 300; i++) put(path.join(data, 'candles', 'NQ', '1m', `2024-01-${String(i % 28 + 1).padStart(2, '0')}-${i}.bin`), Buffer.alloc(240));
    const mover = D.createMover({ getDataDir: () => data, appRoot: ROOT, getConfig: () => ({}), saveConfig: () => {} });
    const t1 = path.join(H.tmp(), 'cel-a'), t2 = path.join(H.tmp(), 'cel-b');
    const [a, b] = await Promise.allSettled([mover.start(t1), mover.start(t2)]);
    assert.equal(a.status, 'fulfilled'); assert.equal(b.status, 'rejected'); assert.equal(b.reason.status, 409); assert.equal(b.reason.code, 'running');
    for (let i = 0; i < 100 && mover.status().phase !== 'ready'; i++) await H.sleep(50);
    assert.equal(mover.status().phase, 'ready');
    assert.equal(mover.busy(), false, 'restart po skończonej kopii nie jest blokowany przez kopię');
    assert.ok(mover.writesBlocked(), 'faza ready blokuje zapisy');
    assert.ok(!existsSync(t2), 'drugi cel nie powstał');
    await mover.cancel();
    assert.equal(mover.status().phase, 'cancelled'); assert.ok(!existsSync(t1), 'kopia z fazy ready usunięta'); assert.ok(!mover.writesBlocked());
    const s = src('server.mjs');
    for (const route of ["'/api/candles/fetch'", "'/api/candles/import'", "'/api/candles/import-1s'", "'/api/disk/candles/delete'"]) {
      const k = s.indexOf(route + ':');
      assert.match(s.slice(k, s.indexOf('\n', k)), /moveBusy\(\)/, route);
    }
    assert.match(s, /function moveBusy\(\) \{[\s\S]{0,300}if \(mover\.writesBlocked\(\)\)/);
    assert.match(s, /function queueTick\(\) \{\r?\n\s+if \(mover\.writesBlocked\(\)\) return;/);
    assert.match(src('public/js/ust-dysk.js'), /data-act="dysk-move-start"[^>]*\$\{moving \? ' disabled' : ''\}/);
  });

  test('backtest-N4 poprawki: restart, zatrzymanie i aktualizacja zablokowane w trakcie kopii katalogu (409 z komunikatem), po anulowaniu restart wolny', async () => {
    const dir = H.tmp(), data = path.join(dir, 'chart-data');
    for (let i = 0; i < 4000; i++) put(path.join(data, 'candles', 'NQ', '1m', `f${i}.bin`), Buffer.alloc(4096));
    const S = await H.server(4835, { THQ_CONFIG_DIR: dir });
    try {
      const target = path.join(H.tmp(), 'nowe');
      const st = await H.dash(S.base, '/api/disk/move', { target, confirm: true });
      assert.equal(st.status, 200, JSON.stringify(st.j));
      for (const p of ['/api/restart', '/api/update/run']) {
        const r = await H.dash(S.base, p, {});
        assert.equal(r.status, 409, `${p}: ${JSON.stringify(r.j)}`); assert.match(r.j.error, /przenoszenie danych/i);
      }
      const sd = await fetch(`${S.base}/api/shutdown`, { method: 'POST', headers: { Origin: S.base, 'X-THQ': '1' } });
      assert.equal(sd.status, 409); assert.match((await sd.json()).error, /przenoszenie danych/i);
      assert.equal((await fetch(`${S.base}/api/ping`)).status, 200, 'serwer działa dalej');
      await H.dash(S.base, '/api/disk/move/cancel', {});
      for (let i = 0; i < 100; i++) { const m = await (await fetch(`${S.base}/api/disk/move/status`)).json(); if (m.phase === 'cancelled') break; await H.sleep(100); }
    } finally { S.stop(); }
    const s = src('server.mjs');
    for (const p of ["'/api/restart': async () => {", "'/api/update/run': async () => {"]) { const i = s.indexOf(p); assert.match(s.slice(i, i + 200), /busyReason\(\)/, p); }
    assert.match(s, /if \(isShutdown\) \{\r?\n\s+const why = busyReason\(\);/);
    assert.match(src('public/js/app.js'), /const res = await fetch\('\/api\/shutdown'[\s\S]{0,300}j\.error/);
  });

  test('backtest-N4 poprawki: wykres bez kredytu: osobny komunikat „wpisz stan kredytu” z odnośnikiem do Źródeł danych', () => {
    const p = src('public/js/podglad.js');
    assert.match(p, /if \(q\.noCredit\)/);
    assert.match(p, /#ustawienia\/zrodla\/databento/);
    const i = p.indexOf('if (q.noCredit)'), j = p.indexOf('if (q.overLimit || q.overCredit)');
    assert.ok(i > 0 && i < j, 'brak kredytu sprawdzany przed ogólnym „przekracza limit”');
    assert.match(src('public/js/ust-zrodla.js'), /sv-warn[^`]*zr-cr-edit/);
  });

  test('backtest-N4 poprawki: saveEnv zachowuje CRLF pliku', async () => {
    const { saveEnv } = await imp('lib/env.mjs');
    const dir = H.tmp();
    writeFileSync(path.join(dir, '.env'), '# komentarz\r\nNOTION_TOKEN=abc\r\nFRED_API_KEY=old\r\n');
    saveEnv({ FRED_API_KEY: 'new', FINNHUB_API_KEY: 'x' }, dir);
    assert.equal(readFileSync(path.join(dir, '.env'), 'utf8'), '# komentarz\r\nNOTION_TOKEN=abc\r\nFRED_API_KEY=new\r\nFINNHUB_API_KEY=x\r\n');
    writeFileSync(path.join(dir, '.env'), 'A=1\n');
    saveEnv({ B: '2' }, dir);
    assert.equal(readFileSync(path.join(dir, '.env'), 'utf8'), 'A=1\nB=2\n');
  });

  test('backtest-N4 poprawki: wolny start: Dashboard.vbs i start.sh czekają do 30 s z informacją o postępie, zanim zgłoszą błąd', () => {
    const vbs = src('Dashboard.vbs'), sh = src('start.sh');
    assert.match(vbs, /For tries = 1 To 100/); assert.match(vbs, /If tries = 25 Then sh\.Popup /);
    assert.match(sh, /while \[ \$i -lt 100 \]/); assert.match(sh, /if \[ \$i -eq 25 \]; then echo /);
    assert.ok(!/Klucz Databento: zapis do \.env po bezpłatnym sprawdzeniu/.test(src('public/js/app.js')), 'martwy komentarz usunięty');
  });

  test('backtest-N4 poprawki: validateTarget odrzuca człon z kropką lub spacją na końcu, dwukropek poza literą dysku i nazwy urządzeń Windows', async () => {
    const D = await imp('lib/dysk.mjs');
    const dir = H.tmp(), app = path.join(dir, 'app'), data = path.join(app, 'chart-data');
    mkdirSync(data, { recursive: true });
    const code = (raw) => { try { D.validateTarget(raw, { appRoot: app, dataDir: data, platform: 'win32' }); return 'ok'; } catch (e) { return e.code; } };
    const base = path.join(dir, 'zewn');
    for (const raw of [base + '.\\dane', base + ' \\dane', path.join(base, 'dane.'), path.join(base, 'x:ads'), path.join(base, 'NUL'), path.join(base, 'con.txt'), path.join(base, 'COM1'), path.join(base, 'lpt9.log'), path.join(base, 'AUX'), path.join(base, 'prn')]) {
      assert.equal(code(raw), 'bad-name', raw);
    }
    assert.equal(code(path.join(base, 'console', 'COM10', 'dane')), 'ok', 'podobne, ale dozwolone nazwy');
  });

  test('backtest-N4 poprawki: scrubSecrets maskuje tokeny po podkreślniku, a serwer pamięta klucze usunięte w tej sesji', async () => {
    const { scrubSecrets } = await imp('lib/diag.mjs');
    const out = scrubSecrets('x_ntn_ABCDEFGHIJ y_db-abcdefghij z_secret_ABCDEFGHIJ');
    assert.ok(!/ABCDEFGHIJ|abcdefghij/.test(out), out);
    const { fakeFinnhub, FAKE_FH_KEY } = await imp('testy/atrapa-finnhub.mjs');
    void fakeFinnhub;
    const dir = H.tmp();
    const raw20 = 'abcdefghij0123456789';
    writeFileSync(path.join(dir, '.env'), `FINNHUB_API_KEY=${raw20}\n`);
    writeFileSync(path.join(dir, 'dashboard.log'), `[earnings] odpowiedź dla ${raw20} przyszła\n`);
    const S = await H.server(4836, { THQ_CONFIG_DIR: dir });
    try {
      assert.equal((await H.dash(S.base, '/api/sources/key', { source: 'finnhub', remove: true })).status, 200);
      const log = await (await fetch(`${S.base}/api/diag/log?lines=5`)).text();
      assert.ok(!log.includes(raw20), `klucz usunięty w tej sesji dalej maskowany: ${log}`);
    } finally { S.stop(); }
    void FAKE_FH_KEY;
  });

  test('backtest-N4 poprawki: README: limity, kredyt, klucze, import i usuwanie świec w Ustawieniach, nowa instalacja wpisuje stan kredytu', () => {
    for (const f of ['README.md', 'README.en.md']) {
      const r = src(f);
      assert.ok(!/tylko do podglądu|as view-only/.test(r), `${f}: bez „tylko do podglądu”`);
      assert.ok(!/Zmieniasz je w `config\.local\.json`|You change them in `config\.local\.json`/.test(r), f);
      assert.ok(!/Wpisz swój stan startowy i datę wygaśnięcia w `config\.local\.json`|Enter your starting amount and expiry date in `config\.local\.json`/.test(r), f);
      assert.ok(!/Świece usuwasz ręcznie z dysku|You delete candles by hand on disk/.test(r), f);
    }
    assert.match(src('README.md'), /Nowa instalacja nie ma wpisanego kredytu/);
    assert.match(src('README.en.md'), /A new installation has no credit entered/);
  });
};
