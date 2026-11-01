// backtest-N2: Ustawienia → Kopie i diagnostyka, strona serwera (pakiet N2, 1.6.0). Specyfikacja: backtest-wyniki/N-pierwsze-kroki-ustawienia.md §4.6, §5.1, §5.2.
// GET /api/diag (bez sieci), POST /api/diag/test (ochrona zapisu, walidacja, bez sekretów), GET /api/diag/log (maskowanie), POST /api/diag/open (tylko ścieżki serwera),
// /api/health ze znacznikiem startu i restart z UI przez lib/restart.mjs na instancji testowej. Atrapy Notion i Databento; port 4321 nietykalny.
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 9: restart i zatrzymanie serwera zawsze widoczne w diagnostyce)
import path from 'node:path';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const SECRETS = { NOTION_TOKEN: 'ntn_TAJNYtoken1234567890abcdef', DATABENTO_API_KEY: 'db-test-key-0123456789abcdef', FRED_API_KEY: 'a'.repeat(31) + 'z', FINNHUB_API_KEY: 'finnhubTAJNY123456' };
  const noSecret = (txt) => { for (const v of Object.values(SECRETS)) assert.ok(!String(txt).includes(v), `w odpowiedzi jest sekret ${v.slice(0, 6)}…`); };

  test('backtest-N2: scrubSecrets maskuje znane klucze, tokeny Notion, klucze Databento, Bearer, pary key=… i długie ciągi, zostawia zwykły tekst', async () => {
    const { scrubSecrets } = await imp('lib/diag.mjs');
    const line = `[candles] get_range NQ: ${SECRETS.DATABENTO_API_KEY} Authorization: Bearer abcdefghijk.lmn token=${SECRETS.NOTION_TOKEN} api_key=${SECRETS.FRED_API_KEY}&x=1 finnhubTAJNY123456 secret_ABCDEFGHIJ ${'Q'.repeat(40)}`;
    const out = scrubSecrets(line, [SECRETS.FINNHUB_API_KEY]);
    noSecret(out);
    assert.ok(!/secret_ABCDEFGHIJ|abcdefghijk\.lmn|Q{40}/.test(out), out);
    assert.match(out, /^\[candles\] get_range NQ: /, 'zwykły tekst zostaje');
    assert.match(out, /&x=1/);
    const plain = 'JustJournal 1.6.0: http://127.0.0.1:4321 · strona 11111111-1111-4111-8111-111111111111';
    assert.equal(scrubSecrets(plain), plain, 'adres i UUID bez zmian');
  });

  test('backtest-N2: GET /api/diag: wersja, Node, adres, ścieżki, stan połączeń tak/nie, bez sekretów; obca strona dostaje 403', async () => {
    const A = await H.atrapa(4881);
    const dir = H.tmp();
    const S = await H.server(4882, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, ...H.IDS, ...SECRETS });
    try {
      const r = await fetch(`${S.base}/api/diag`);
      assert.equal(r.status, 200);
      const txt = await r.text(); const j = JSON.parse(txt);
      noSecret(txt);
      assert.match(j.version, /^\d+\.\d+\.\d+$/); assert.ok(j.node); assert.equal(j.address, `http://127.0.0.1:${S.port}`);
      assert.ok(Number.isFinite(j.started) && j.uptimeSec >= 0 && Number.isInteger(j.pid));
      assert.deepEqual(Object.keys(j.connections), ['notion', 'databento', 'fred', 'finnhub', 'github']);
      for (const s of ['notion', 'databento', 'fred', 'finnhub']) assert.equal(j.connections[s].configured, true, `${s}: skonfigurowany`);
      assert.equal(j.paths.data, path.join(dir, 'chart-data')); assert.equal(j.paths.backups, path.join(dir, 'backups')); assert.equal(j.paths.log, path.join(dir, 'dashboard.log'));
      assert.deepEqual(j.backups, { count: 0, latest: null });
      assert.ok(j.overrides.includes('NOTION_API_BASE'), 'nazwa zmiennej przekierowania, bez wartości');
      assert.ok(!txt.includes(A.base), 'adres atrapy nie wycieka');
      assert.match(j.repoUrl, /^https:\/\/github\.com\/[^/]+\/[^/]+$/);
      const x = await fetch(`${S.base}/api/diag`, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
      assert.equal(x.status, 403, 'odczyt z obcej strony odrzucony');
      const h = await (await fetch(`${S.base}/api/health`)).json();
      assert.equal(h.started, j.started, '/api/health ze znacznikiem startu');
    } finally { S.stop(); A.stop(); }
  });

  test('backtest-N2: POST /api/diag/test: ochrona zapisu, walidacja źródła, Notion i Databento sprawdzone na atrapach, bez klucza „no-key”, odpowiedź bez sekretów', async () => {
    const A = await H.atrapa(4883);
    const D = await H.atrapaDb(4884);
    const dir = H.tmp();
    const S = await H.server(4885, { NOTION_API_BASE: A.base, DATABENTO_API_BASE: D.base, THQ_CONFIG_DIR: dir, ...H.IDS, NOTION_TOKEN: SECRETS.NOTION_TOKEN, DATABENTO_API_KEY: SECRETS.DATABENTO_API_KEY });
    try {
      // ochrona zapisu: bez nagłówka X-THQ, obcy Origin, zły Content-Type
      assert.equal((await fetch(`${S.base}/api/diag/test`, { method: 'POST', headers: { Origin: S.base, 'Content-Type': 'application/json' }, body: '{"source":"notion"}' })).status, 403);
      assert.equal((await H.dash(S.base, '/api/diag/test', { source: 'notion' }, { origin: 'http://evil.example' })).status, 403);
      assert.equal((await fetch(`${S.base}/api/diag/test`, { method: 'POST', headers: { Origin: S.base, 'X-THQ': '1', 'Content-Type': 'text/plain' }, body: '{"source":"notion"}' })).status, 403);
      const bad = await H.dash(S.base, '/api/diag/test', { source: '../../etc' });
      assert.equal(bad.status, 400); assert.match(bad.j.error, /źródło/i);
      const n = await H.dash(S.base, '/api/diag/test', { source: 'notion' });
      assert.equal(n.status, 200); assert.equal(n.j.ok, true, JSON.stringify(n.j)); assert.match(n.j.detail, /Atrapa Workspace/); assert.match(n.j.detail, /4 z 4/); assert.ok(n.j.checkedAt);
      const d = await H.dash(S.base, '/api/diag/test', { source: 'databento' });
      assert.equal(d.j.ok, true, JSON.stringify(d.j)); assert.match(d.j.detail, /2026-10-27/);
      const { log } = await D.log();
      assert.ok(log.some((c) => c.path === '/v0/metadata.get_dataset_range') && log.some((c) => c.path === '/v0/metadata.get_cost'), 'Databento: zakres zbioru i bezpłatna wycena');
      assert.ok(!log.some((c) => c.path === '/v0/timeseries.get_range'), 'bez pobierania świec');
      const f = await H.dash(S.base, '/api/diag/test', { source: 'fred' });
      assert.equal(f.j.ok, false); assert.equal(f.j.code, 'no-key');
      const g = await H.dash(S.base, '/api/diag/test', { source: 'github' });
      assert.equal(g.j.ok, false); assert.equal(g.j.code, 'offline');
      for (const r of [n, d, f, g]) noSecret(JSON.stringify(r.j));
      // wynik testu widać w stanie bez sieci
      const st = await (await fetch(`${S.base}/api/diag`)).json();
      assert.equal(st.connections.notion.last.ok, true); assert.equal(st.connections.databento.last.ok, true); assert.equal(st.connections.fred.configured, false);
      noSecret(JSON.stringify(st));
    } finally { S.stop(); A.stop(); D.stop(); }
  });

  test('backtest-N2: GET /api/diag/log: ostatnie linie dashboard.log z zamaskowanymi kluczami, limit linii', async () => {
    const dir = H.tmp();
    const lines = Array.from({ length: 700 }, (_, i) => `linia ${i}`);
    lines.push(`[candles] klucz ${SECRETS.DATABENTO_API_KEY}`, `[news] https://api.stlouisfed.org/fred/release/dates?api_key=${SECRETS.FRED_API_KEY}&file_type=json`, `[setup] token ${SECRETS.NOTION_TOKEN}`);
    writeFileSync(path.join(dir, 'dashboard.log'), lines.join('\n') + '\n');
    const S = await H.server(4886, { THQ_CONFIG_DIR: dir, ...SECRETS });
    try {
      const r = await fetch(`${S.base}/api/diag/log?lines=5`);
      const txt = await r.text(); const j = JSON.parse(txt);
      assert.equal(j.lines.length, 5); noSecret(txt);
      assert.equal(j.lines[0], 'linia 698');
      assert.match(j.lines[2], /^\[candles\] klucz (db-)?••••$/);
      assert.match(j.lines[3], /api_key=••••&file_type=json/);
      const big = await (await fetch(`${S.base}/api/diag/log?lines=100000`)).json();
      assert.equal(big.lines.length, 500, 'najwyżej 500 linii');
      const def = await (await fetch(`${S.base}/api/diag/log`)).json();
      assert.equal(def.lines.length, 200, 'domyślnie 200 linii');
      noSecret(JSON.stringify(big));
      assert.equal((await fetch(`${S.base}/api/diag/log`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    } finally { S.stop(); }
  });

  test('backtest-N2: POST /api/diag/open: tylko foldery znane serwerowi (ścieżka z żądania ignorowana), ochrona zapisu, THQ_NO_OPEN nic nie otwiera', async () => {
    const dir = H.tmp();
    const S = await H.server(4887, { THQ_CONFIG_DIR: dir });
    try {
      assert.equal((await fetch(`${S.base}/api/diag/open`, { method: 'POST', headers: { Origin: S.base, 'Content-Type': 'application/json' }, body: '{"which":"data"}' })).status, 403);
      assert.equal((await H.dash(S.base, '/api/diag/open', { which: 'C:\\Windows' })).status, 400);
      const b = await H.dash(S.base, '/api/diag/open', { which: 'backups', path: 'C:\\Windows' });
      assert.equal(b.status, 200); assert.equal(b.j.ok, false); assert.equal(b.j.code, 'missing'); assert.equal(b.j.path, path.join(dir, 'backups'));
      const l = await H.dash(S.base, '/api/diag/open', { which: 'logs', path: 'C:\\Windows' });
      assert.equal(l.j.ok, true); assert.equal(l.j.opened, false, 'testy: THQ_NO_OPEN'); assert.equal(l.j.path, dir);
    } finally { S.stop(); }
  });

  test('backtest-N2: restart z UI: POST /api/restart startuje nowy proces na tym samym porcie (nowy znacznik startu i PID), stary znika', async () => {
    const dir = H.tmp();
    const S = await H.server(4888, { THQ_CONFIG_DIR: dir });
    let newPid = 0;
    try {
      const before = await (await fetch(`${S.base}/api/diag`)).json();
      const r = await H.dash(S.base, '/api/restart', {});
      assert.equal(r.status, 200); assert.equal(r.j.restarting, true);
      let after = null;
      for (let i = 0; i < 80 && !(after && after.started !== before.started); i++) { await H.sleep(250); try { after = await (await fetch(`${S.base}/api/diag`)).json(); } catch { after = null; } }
      assert.ok(after && after.started !== before.started, 'serwer wstał ponownie');
      newPid = after.pid;
      assert.notEqual(newPid, before.pid);
      assert.ok(existsSync(path.join(dir, 'dashboard.log')) && /JustJournal/.test(readFileSync(path.join(dir, 'dashboard.log'), 'utf8')), 'nowy proces pisze do dashboard.log w katalogu konfiguracji');
    } finally {
      S.stop();
      // nowy proces jest odłączony (lib/restart.mjs): zatrzymujemy go po PID z odpowiedzi tej instancji testowej (port 4888)
      if (newPid) { try { process.kill(newPid); } catch { /* już nie żyje */ } }
    }
  });

  test('backtest-N2: restart blokowany w trakcie aktualizacji i tworzenia dziennika (409)', () => {
    const s = readFileSync(path.join(ROOT, 'server.mjs'), 'utf8');
    const i = s.indexOf("'/api/restart': async () => {");
    const body = s.slice(i, s.indexOf('},', i));
    // poprawki po review N1–N4: restart pyta wspólną funkcję busyReason() (aktualizacja, tworzenie dziennika, kopia katalogu, pobieranie)
    const fb = s.slice(s.indexOf('function busyReason() {'), s.indexOf('\n}', s.indexOf('function busyReason() {')));
    assert.match(body, /busyReason\(\)/); assert.match(fb, /upd\.running/); assert.match(fb, /setupJob\.running/);
  });
};
