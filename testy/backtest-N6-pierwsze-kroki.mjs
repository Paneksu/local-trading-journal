// backtest-N6: pierwsze kroki v2 (pakiet N6, 1.6.0). Specyfikacja: backtest-wyniki/N-pierwsze-kroki-ustawienia.md §1, §4.5, §4.6, §6 N6.
// Krok „Dane rynkowe” w kreatorze (te same karty źródeł co Ustawienia → Źródła danych), Gotowość w 4 grupach z grupą danych rynkowych (bez sieci),
// ekran „Gotowe” bez automatycznego przejścia, rotacja dashboard.log przed jego otwarciem. Wyłącznie atrapy (Notion, Databento) i katalogi tymczasowe.
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 3: nowa instalacja bez kredytu, dopóki użytkownik go nie wpisze)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 4: codzienne okno 1s NQ domyślnie wyłączone w nowych instalacjach)
import path from 'node:path';
import { renameSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  // ---------- rotacja dashboard.log ----------
  test('backtest-N6: rotateLog: plik ponad limit przechodzi w dashboard.1.log, starsze przesuwają się, najwyżej 3 pliki; mały albo brak pliku bez zmian', async () => {
    const R = await imp('lib/log-rotacja.mjs');
    const dir = H.tmp(), f = path.join(dir, 'dashboard.log'), old = (n) => path.join(dir, `dashboard.${n}.log`);
    assert.equal(R.LOG_MAX_BYTES, 5 * 1024 * 1024); assert.equal(R.LOG_KEEP, 3);
    assert.equal(R.rotateLog(f).rotated, false, 'brak pliku');
    writeFileSync(f, 'mały');
    assert.equal(R.rotateLog(f, { maxBytes: 100 }).rotated, false, 'poniżej limitu');
    writeFileSync(f, 'A'.repeat(150));
    assert.equal(R.rotateLog(f, { maxBytes: 100 }).rotated, true);
    assert.ok(!existsSync(f) && readFileSync(old(1), 'utf8') === 'A'.repeat(150));
    writeFileSync(f, 'B'.repeat(150)); R.rotateLog(f, { maxBytes: 100 });
    writeFileSync(f, 'C'.repeat(150)); R.rotateLog(f, { maxBytes: 100 });
    assert.equal(readFileSync(old(1), 'utf8')[0], 'C'); assert.equal(readFileSync(old(2), 'utf8')[0], 'B');
    assert.ok(!existsSync(old(3)), 'najwyżej 3 pliki: bieżący, .1 i .2 (najstarszy A usunięty)');
    // polecenie: node lib/log-rotacja.mjs w katalogu konfiguracji (THQ_CONFIG_DIR), domyślny limit 5 MB
    const d2 = H.tmp();
    writeFileSync(path.join(d2, 'dashboard.log'), Buffer.alloc(5 * 1024 * 1024 + 10, 120));
    const r = await H.run(path.join(ROOT, 'lib', 'log-rotacja.mjs'), [], H.cleanEnv({ THQ_CONFIG_DIR: d2 }));
    assert.equal(r.code, 0, r.err);
    assert.ok(!existsSync(path.join(d2, 'dashboard.log')) && statSync(path.join(d2, 'dashboard.1.log')).size > 5 * 1024 * 1024);
  });

  // final (review kodu P3-1): rotacja zaczyna od przemianowania bieżącego pliku; gdy ten jest zablokowany (Windows: inny proces dopisuje),
  // nic nie kasuje i nie przesuwa starszych plików
  test('backtest-final: rotateLog przy zablokowanym bieżącym pliku nic nie kasuje ani nie przesuwa (atrapa EBUSY i prawdziwa blokada na Windows)', async () => {
    const R = await imp('lib/log-rotacja.mjs');
    const dir = H.tmp(), f = path.join(dir, 'dashboard.log'), old = (n) => path.join(dir, `dashboard.${n}.log`);
    writeFileSync(f, 'X'.repeat(150)); writeFileSync(old(1), 'JEDEN'); writeFileSync(old(2), 'DWA');
    // atrapa systemu plików: przemianowanie bieżącego pliku pada jak na Windows z otwartym logiem
    const busy = (src) => { if (path.resolve(src) === path.resolve(f)) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }); };
    const r = R.rotateLog(f, { maxBytes: 100, fs: { renameSync: (a, b) => { busy(a); renameSync(a, b); } } });
    assert.equal(r.rotated, false); assert.match(r.error || '', /EBUSY/);
    assert.deepEqual([readFileSync(f, 'utf8').length, readFileSync(old(1), 'utf8'), readFileSync(old(2), 'utf8')], [150, 'JEDEN', 'DWA'], 'po nieudanej rotacji wszystkie trzy pliki bez zmian');
    assert.ok(!existsSync(f + '.rotating'));
    // przerwana rotacja (został dashboard.log.rotating): następne uruchomienie ją kończy, bez utraty pliku
    renameSync(f, f + '.rotating'); writeFileSync(f, 'nowy');
    assert.equal(R.rotateLog(f, { maxBytes: 100 }).rotated, true);
    assert.deepEqual([readFileSync(f, 'utf8'), readFileSync(old(1), 'utf8').length, readFileSync(old(2), 'utf8')], ['nowy', 150, 'JEDEN']);
    if (process.platform !== 'win32') return;
    // prawdziwa blokada: cmd dopisuje do logu (jak Dashboard.vbs z „>> dashboard.log”)
    const d2 = H.tmp(), f2 = path.join(d2, 'dashboard.log'), o2 = (n) => path.join(d2, `dashboard.${n}.log`);
    writeFileSync(f2, 'Y'.repeat(200)); writeFileSync(o2(1), 'JEDEN'); writeFileSync(o2(2), 'DWA');
    const { spawn } = await import('node:child_process');
    const p = spawn('cmd.exe', ['/d', '/c', 'ping -n 4 127.0.0.1 >> dashboard.log'], { cwd: d2, windowsHide: true, windowsVerbatimArguments: true, stdio: 'ignore' });
    try {
      await H.sleep(500);
      const r2 = R.rotateLog(f2, { maxBytes: 100 });
      assert.equal(r2.rotated, false, 'zablokowany plik nie przechodzi w .1');
      assert.deepEqual([readFileSync(o2(1), 'utf8'), readFileSync(o2(2), 'utf8')], ['JEDEN', 'DWA'], 'starsze pliki bez zmian');
    } finally { await new Promise((res) => { if (p.exitCode !== null) res(); else p.on('exit', res); }); }
  });

  test('backtest-N6: rotacja przed otwarciem logu: Dashboard.vbs, start.sh i lib/restart.mjs; diagnostyka liczy starsze pliki logu', async () => {
    const vbs = src('Dashboard.vbs'), sh = src('start.sh'), rs = src('lib/restart.mjs');
    const iv = vbs.indexOf('lib\\log-rotacja.mjs'), sv = vbs.indexOf('node server.mjs >> dashboard.log');
    assert.ok(iv > 0 && sv > iv, 'Dashboard.vbs: rotacja przed startem serwera z logiem');
    assert.match(vbs, /sh\.Run "cmd \/c node lib\\log-rotacja\.mjs", 0, True/, 'Dashboard.vbs: rotacja czeka na koniec (True)');
    const is = sh.indexOf('node lib/log-rotacja.mjs'), ss = sh.indexOf('nohup node server.mjs');
    assert.ok(is > 0 && ss > is, 'start.sh: rotacja przed nohup');
    assert.match(rs, /import \{ rotateLog \} from '\.\/log-rotacja\.mjs'/);
    assert.ok(rs.indexOf('rotateLog(') < rs.indexOf('openSync('), 'restart.mjs: rotacja przed otwarciem logu');
    const dir = H.tmp();
    writeFileSync(path.join(dir, 'dashboard.log'), 'x'); writeFileSync(path.join(dir, 'dashboard.1.log'), 'y'.repeat(10)); writeFileSync(path.join(dir, 'dashboard.2.log'), 'z');
    const S = await H.server(4851, { THQ_CONFIG_DIR: dir });
    try {
      const d = await (await fetch(`${S.base}/api/diag`)).json();
      assert.equal(d.log.rotated, 2); assert.equal(d.log.rotatedBytes, 11);
    } finally { S.stop(); }
  });

  // ---------- Gotowość: grupa danych rynkowych ----------
  test('backtest-N6: marketCheck: bez klucza informacja (opcjonalne), klucz bez kredytu, wygasły, wygasa w 30 dni, kolejka zablokowana, mało miejsca to uwaga; komplet to ok', async () => {
    const { marketCheck } = await imp('lib/health.mjs');
    const base = { databento: { key: true, credit: { configured: true, startUsd: 50, spentUsd: 1, leftUsd: 49, expires: day(200), expired: false }, nq1sDaily: false, queue: { pending: 0, blocked: 0 } }, fred: false, finnhub: true, freeBytes: 50 * 1024 ** 3, now: Date.now() };
    const by = (r) => Object.fromEntries(r.items.map((i) => [i.id, i]));
    const ok = marketCheck(base);
    assert.equal(ok.status, 'ok'); assert.equal(by(ok).databento.status, 'ok'); assert.equal(by(ok).credit.status, 'ok'); assert.equal(by(ok).fred.status, 'info'); assert.equal(by(ok).finnhub.status, 'ok');
    const none = marketCheck({ ...base, databento: { ...base.databento, key: false, credit: { configured: false } } });
    assert.equal(none.status, 'info', 'bez klucza: dashboard działa, wykresy bez świec'); assert.equal(by(none).databento.code, 'no-key');
    assert.ok(!by(none).credit || by(none).credit.status === 'info', 'kredyt bez klucza nie jest problemem');
    const nc = marketCheck({ ...base, databento: { ...base.databento, credit: { configured: false } } });
    assert.equal(nc.status, 'warn'); assert.equal(by(nc).credit.code, 'no-credit');
    const ex = marketCheck({ ...base, databento: { ...base.databento, credit: { ...base.databento.credit, expires: day(-1), expired: true } } });
    assert.equal(by(ex).credit.code, 'expired'); assert.equal(ex.status, 'warn');
    const soon = marketCheck({ ...base, databento: { ...base.databento, credit: { ...base.databento.credit, expires: day(10) } } });
    assert.equal(by(soon).credit.code, 'expiring'); assert.ok(by(soon).credit.days >= 9 && by(soon).credit.days <= 11);
    const q = marketCheck({ ...base, databento: { ...base.databento, queue: { pending: 1, blocked: 2 } } });
    assert.equal(by(q).queue.status, 'warn'); assert.equal(by(q).queue.blocked, 2);
    const disk = marketCheck({ ...base, freeBytes: 1024 ** 3 });
    assert.equal(by(disk).disk.status, 'warn'); assert.equal(disk.status, 'warn');
  });

  test('backtest-N6: /api/health/full ma grupę market bez żadnego zapytania do Databento; klucz bez wpisanego kredytu daje uwagę', async () => {
    const A = await H.atrapa(4852);
    const D = await H.atrapaDb(4853);
    const dir = H.tmp();
    const env = { NOTION_API_BASE: A.base, DATABENTO_API_BASE: D.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'secret_atrapa', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL };
    let S = await H.server(4854, env);
    try {
      const h = await H.dash(S.base, '/api/health/full', { quick: true });
      const m = h.j.checks.find((c) => c.id === 'market');
      assert.ok(m, 'grupa market'); assert.equal(m.status, 'info'); assert.equal(m.items.find((i) => i.id === 'databento').code, 'no-key');
      S.stop();
      writeFileSync(path.join(dir, '.env'), 'DATABENTO_API_KEY=db-test-key-0123456789abcdef\n');
      S = await H.server(4854, env);
      const h2 = await H.dash(S.base, '/api/health/full', { quick: true });
      const m2 = h2.j.checks.find((c) => c.id === 'market');
      assert.equal(m2.status, 'warn'); assert.equal(m2.items.find((i) => i.id === 'credit').code, 'no-credit');
      assert.ok(!JSON.stringify(h2.j).includes('db-test-key'), 'bez klucza w odpowiedzi');
      assert.deepEqual((await D.log()).log, [], 'zero zapytań do Databento');
    } finally { S.stop(); A.stop(); D.stop(); }
  });

  test('backtest-N6: kreator bez automatycznego przejścia po 1,2 s, krok Dane rynkowe w każdej ścieżce, karty z ust-zrodla.js', () => {
    const s = src('public/js/pierwsze-kroki.js');
    assert.doesNotMatch(s, /setTimeout\(\(\) => \{ if \(cur\(\) === 'gotowosc'\) go\(step \+ 1\); \}, 1200\)/, 'bez automatycznego przejścia z Gotowości');
    assert.match(s, /from '\.\/ust-zrodla\.js'/, 'te same karty źródeł co w Ustawieniach');
    assert.match(src('public/js/ust-zrodla.js'), /wizardHtml/);
  });

  // ---------- ekran (Chrome/Edge headless, scenariusz testy/scen-N6.js) ----------
  const runs = {};
  function pageResult(narrow) {
    runs[narrow] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const base = narrow ? 4865 : 4860;
      const A = await H.atrapa(base, { ATRAPA_DEMO: '3' });
      const D = await H.atrapaDb(base + 1);
      const dir = H.tmp();
      writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ lang: 'pl', onboarded: true, defaultsUpgraded: '1.6.0' }));
      const S = await H.server(base + 2, { NOTION_API_BASE: A.base, DATABENTO_API_BASE: D.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'secret_atrapa', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL });
      try {
        const opt = narrow ? { width: 375, height: 812, mobile: true } : { width: 1920, height: 1080 };
        const scen = 'window.__N6 = ' + JSON.stringify({ dbKey: 'db-test-key-0123456789abcdef', expires: day(365) }) + ';' + String.fromCharCode(10) + src('testy/scen-N6.js');
        const txt = await P.cdpPage(S.base + '/', { ...opt, timeoutMs: 180_000, until: "window.__thq && document.querySelector('#view .page-head')", extract: scen });
        const res = JSON.parse(txt);
        res.env = existsSync(path.join(dir, '.env')) ? readFileSync(path.join(dir, '.env'), 'utf8') : '';
        res.cfg = JSON.parse(readFileSync(path.join(dir, 'config.local.json'), 'utf8'));
        return res;
      } finally { S.stop(); A.stop(); D.stop(); }
    })();
    return runs[narrow];
  }
  async function tagged(tag, min, narrow = false) {
    const res = await pageResult(narrow);
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    return res;
  }
  test('backtest-N6: przebiegi kreatora: świeża instalacja, kod z innego urządzenia, dziennik w Notion i skonfigurowana instalacja; Dane rynkowe przed Gotowością', async () => { await tagged('przebieg', 4); });
  test('backtest-N6: ekran Gotowość w 4 grupach (Ten komputer, Notion, Dane rynkowe, Aktualizacje), zielone zwinięte, bez klucza „Połącz dane rynkowe” prowadzi do kroku', async () => { await tagged('gotowosc', 5); });
  test('backtest-N6: ekran Dane rynkowe: klucz Databento „Zapisz i sprawdź”, „Testuj”, stan kredytu z potwierdzeniem, okno 1s NQ z kosztem, FRED i Finnhub, klucz tylko w .env', async () => {
    const r = await tagged('dane', 8);
    assert.match(r.env, /DATABENTO_API_KEY=db-test-key-0123456789abcdef/);
    assert.equal(r.cfg.chartNq1sDaily, true); assert.equal(r.cfg.chartCredit.startUsd, 40);
  });
  test('backtest-N6: ekran Gotowe: bez automatycznego przejścia, przewodnik, pierwszy trade, usunięcie DEMO, przejście do dashboardu', async () => { await tagged('gotowe', 5); });
  test('backtest-N6: ekran 375 px: każdy krok bez poziomego przewijania', async () => { for (const tag of ['gotowosc', 'dane', 'gotowe']) await tagged(tag, 3, true); });
};
