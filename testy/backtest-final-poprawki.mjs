// backtest-final: poprawki końcowe przed wydaniem 1.6.0 (backtest-wyniki/final/review-kod.md, review-bezpieczenstwo.md).
// Przywracanie z kopii: jednorazowy znacznik podglądu ważny kilka minut i tylko dla tego samego planu, przerwanie bez duplikatów
// (mapa stare id → nowe id), odświeżenie po częściowym zapisie, kopia z innego dziennika odrzucona; blokada przełączenia katalogu
// i ponownego połączenia Notion w trakcie kopii; Instaluj.cmd po nieudanym winget. Wyłącznie atrapy i katalogi tymczasowe; port 4321 nietykalny.
import path from 'node:path';
import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync, linkSync, copyFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');

  // atrapa klienta Notion w pamięci: jedna baza (trades), post pada przy wskazanym wywołaniu
  function fakeNotion(n = 3) {
    const pages = new Map();
    for (let i = 1; i <= n; i++) pages.set(`p${i}`, { id: `p${i}`, archived: false, in_trash: false, properties: { Nazwa: { id: 'title', type: 'title', title: [{ plain_text: `Trade ${i}` }] }, R: { id: 'r', type: 'number', number: i } } });
    const props = { Nazwa: { id: 'title', type: 'title' }, R: { id: 'r', type: 'number' } };
    const N = { pages, posts: 0, failAt: 0, made: 0 };
    N.get = async (url) => {
      if (url.startsWith('/v1/data_sources/')) return { properties: props };
      const p = pages.get(url.split('/').pop());
      if (!p) throw Object.assign(new Error('Could not find page'), { status: 404 });
      return structuredClone(p);
    };
    N.queryAll = async () => [...pages.values()].filter((p) => !p.in_trash).map((p) => structuredClone(p));
    N.post = async (_url, body) => {
      N.posts++;
      if (N.failAt && N.posts === N.failAt) throw Object.assign(new Error('Notion: 429 rate limited'), { status: 429 });
      const id = `n${++N.made}`;
      const p = { id, archived: false, in_trash: false, properties: { Nazwa: { id: 'title', type: 'title', title: body.properties.title.title.map((t) => ({ plain_text: t.text.content })) }, R: { id: 'r', type: 'number', number: body.properties.r?.number ?? null } } };
      pages.set(id, p);
      return structuredClone(p);
    };
    N.patch = async (url, body) => {
      const p = pages.get(url.split('/').pop());
      if (!p) throw Object.assign(new Error('Could not find page'), { status: 404 });
      if ('in_trash' in body) p.in_trash = body.in_trash;
      if (body.properties?.r) p.properties.R.number = body.properties.r.number;
      return structuredClone(p);
    };
    return N;
  }
  async function done(B) {
    for (let i = 0; i < 200 && B.status().running; i++) await H.sleep(20);
    assert.equal(B.status().running, false, 'zadanie kopii skończyło się');
    return B.status();
  }

  test('backtest-final: przywracanie przerwane w połowie: następna próba wymaga nowego podglądu, a ponowne przywrócenie nie dubluje odtworzonych wpisów (mapa stare id → nowe id); dashboard odświeżony po częściowym zapisie', async () => {
    const K = await imp('lib/kopie.mjs');
    const dir = H.tmp(), N = fakeNotion(3);
    let refreshed = 0;
    const B = K.createBackups({ notion: N, sources: { trades: 'ds-t' }, backupsDir: path.join(dir, 'backups'), lang: () => 'pl', log: () => {}, onRestored: () => { refreshed++; } });
    await B.create();
    const name = (await done(B)).result.name;
    // wszystkie trzy wpisy usunięte w Notion po kopii: plan to trzy odtworzenia
    N.pages.clear();
    await B.preview(name);
    let s = await done(B);
    assert.equal(s.result.summary.recreate, 3);
    assert.match(s.result.token || '', /^[0-9a-f]{32}$/, 'podgląd zwraca znacznik do przywrócenia');
    // przywrócenie pada przy drugim odtworzeniu (429 po ponowieniach)
    N.failAt = 2;
    await B.restore(name, 'TAK', s.result.token);
    s = await done(B);
    assert.ok(s.error && /429/.test(s.error.message), JSON.stringify(s.error));
    assert.equal(s.done, 1, 'jeden wpis zapisany przed błędem');
    assert.equal(refreshed, 1, 'częściowy zapis odświeża dane dashboardu');
    assert.equal(N.pages.size, 1);
    // ta sama zgoda drugi raz: odrzucona, trzeba nowego podglądu
    await assert.rejects(B.restore(name, 'TAK', s.result?.token || 'x'), (e) => e.status === 409 && e.code === 'preview-required');
    N.failAt = 0;
    await B.preview(name);
    s = await done(B);
    assert.deepEqual([s.result.summary.recreate, s.result.summary.already, s.result.summary.pages], [2, 1, 2], 'odtworzony wcześniej wpis nie trafia do odtworzenia drugi raz: ' + JSON.stringify(s.result.summary));
    await B.restore(name, 'TAK', s.result.token);
    s = await done(B);
    assert.equal(s.error, null, JSON.stringify(s.error));
    assert.equal(N.pages.size, 3, 'trzy wpisy, bez duplikatu');
    assert.deepEqual([...N.pages.values()].map((p) => p.properties.Nazwa.title[0].plain_text).sort(), ['Trade 1', 'Trade 2', 'Trade 3']);
    assert.equal(refreshed, 2);
    const map = JSON.parse(readFileSync(path.join(dir, 'backups', name, 'odtworzone.json'), 'utf8'));
    assert.deepEqual(Object.keys(map).sort(), ['p1', 'p2', 'p3']);
    // wpis odtworzony i potem zmieniony w Notion: przywrócenie poprawia odtworzoną stronę, nie tworzy nowej
    N.pages.get(map.p2).properties.R.number = 99;
    await B.preview(name);
    s = await done(B);
    assert.deepEqual([s.result.summary.update, s.result.summary.recreate, s.result.items[0].already], [1, 0, true]);
    assert.ok(!JSON.stringify(s.result).includes(map.p2) && !JSON.stringify(s.result).includes('"p2"'), 'podgląd bez identyfikatorów stron');
    await B.restore(name, 'TAK', s.result.token);
    await done(B);
    assert.equal(N.pages.get(map.p2).properties.R.number, 2); assert.equal(N.pages.size, 3);
  });

  test('backtest-final: zgoda z podglądu: zły albo brakujący znacznik, przeterminowany podgląd, inna kopia i zmiana w Notion po podglądzie są odrzucane; zła odpowiedź też zużywa zgodę', async () => {
    const K = await imp('lib/kopie.mjs');
    const dir = H.tmp(), N = fakeNotion(2);
    let clock = Date.now();
    const B = K.createBackups({ notion: N, sources: { trades: 'ds-t' }, backupsDir: path.join(dir, 'backups'), lang: () => 'pl', log: () => {}, now: () => clock });
    await B.create();
    const name = (await done(B)).result.name;
    N.pages.get('p1').properties.R.number = 50;
    const pv = async () => { await B.preview(name); return (await done(B)).result.token; };
    let tk = await pv();
    await assert.rejects(B.restore(name, 'TAK'), (e) => e.status === 409 && e.code === 'preview-required', 'bez znacznika');
    tk = await pv();
    await assert.rejects(B.restore(name, 'TAK', 'f'.repeat(32)), (e) => e.code === 'preview-required', 'cudzy znacznik');
    tk = await pv();
    await assert.rejects(B.restore(name, 'tak', tk), (e) => e.code === 'confirm-required');
    await assert.rejects(B.restore(name, 'TAK', tk), (e) => e.code === 'preview-required', 'zła odpowiedź zużyła zgodę');
    tk = await pv();
    clock += K.PREVIEW_TTL_MS + 1000;
    await assert.rejects(B.restore(name, 'TAK', tk), (e) => e.code === 'preview-required' && /nieaktualny/.test(e.message), 'podgląd sprzed ponad kilku minut');
    assert.ok(K.PREVIEW_TTL_MS >= 2 * 60 * 1000 && K.PREVIEW_TTL_MS <= 15 * 60 * 1000, 'ważność kilka minut');
    tk = await pv();
    // po podglądzie ktoś zmienił drugi wpis w Notion: plan inny niż w podglądzie
    N.pages.get('p2').properties.R.number = 77;
    await B.restore(name, 'TAK', tk);
    const s = await done(B);
    assert.equal(s.error?.code, 'plan-changed', JSON.stringify(s.error));
    assert.equal(N.pages.get('p1').properties.R.number, 50, 'nic nie zapisano');
    assert.equal(readdirSync(path.join(dir, 'backups')).length, 1, 'bez kopii bezpieczeństwa przy odrzuconym planie');
  });

  test('backtest-final: kopia z innego dziennika (inne dataSourceId): oznaczona na liście, podgląd i przywrócenie 409 other-journal, planRestore odrzuca; kopia bez identyfikatora (starszy format) przechodzi', async () => {
    const K = await imp('lib/kopie.mjs'), BK = await imp('lib/backup.mjs');
    const dir = H.tmp(), N = fakeNotion(2), bdir = path.join(dir, 'backups');
    const A = K.createBackups({ notion: N, sources: { trades: 'ds-stary' }, backupsDir: bdir, lang: () => 'pl', log: () => {} });
    await A.create();
    const name = (await done(A)).result.name;
    const B = K.createBackups({ notion: N, sources: { trades: 'ds-nowy' }, backupsDir: bdir, lang: () => 'pl', log: () => {} });
    const it = B.list().items.find((x) => x.name === name);
    assert.equal(it.otherJournal, true, 'kopia innego dziennika oznaczona');
    assert.ok(!JSON.stringify(B.list()).includes('ds-stary'), 'lista bez identyfikatorów baz');
    assert.equal(A.list().items[0].otherJournal, false);
    await assert.rejects(B.preview(name), (e) => e.status === 409 && e.code === 'other-journal');
    await assert.rejects(B.restore(name, 'TAK', 'x'), (e) => e.status === 409 && (e.code === 'other-journal' || e.code === 'preview-required'));
    await assert.rejects(BK.planRestore(N, { trades: 'ds-nowy' }, path.join(bdir, name)), (e) => e.code === 'other-journal');
    // kopia sprzed zapisu dataSourceId: bez porównania
    const old = path.join(bdir, '2020-01-01T00-00-00Z');
    mkdirSync(old, { recursive: true });
    writeFileSync(path.join(old, 'manifest.json'), JSON.stringify({ createdAt: '2020-01-01T00:00:00.000Z', counts: { trades: 0 } }));
    writeFileSync(path.join(old, 'trades.json'), JSON.stringify({ db: 'trades', properties: {}, pages: [] }));
    assert.equal(B.list().items.find((x) => x.name === '2020-01-01T00-00-00Z').otherJournal, false);
    // UI: kopia innego dziennika bez przycisku podglądu, tekst nie obiecuje cofnięcia odtworzonych wpisów
    const ui = src('public/js/ust-diag.js');
    assert.match(ui, /otherJournal/);
    assert.doesNotMatch(ui, /to przywrócenie też da się cofnąć/);
    assert.match(ui, /Wpisy odtworzone jako nowe usuwa się ręcznie/);
  });

  test('backtest-final: w trakcie przywracania przełączenie katalogu danych, wymiana tokenu (replace) i połączenie z innym dziennikiem dostają 409 (busyReason / zadanie kopii)', async () => {
    const A = await H.atrapa(4961);
    const dir = H.tmp();
    const S = await H.server(4962, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'secret_atrapa', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL });
    const wait = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const j = await (await fetch(`${S.base}/api/backups`)).json(); if (fn(j)) return j; await H.sleep(80); } throw new Error('nie doczekałem stanu zadania'); };
    try {
      await H.dash(S.base, '/api/backups/create', {});
      let j = await wait((x) => !x.job.running);
      const name = j.items[0].name;
      const trades = await A.get('/__test/pages?ds=trades');
      for (const p of trades.slice(0, 4)) await A.post('/__test/notion-edit', { id: p.id, set: { R: 55 } });
      await H.dash(S.base, '/api/backups/preview', { name });
      j = await wait((x) => !x.job.running);
      assert.equal(j.job.result.summary.update, 4, JSON.stringify(j.job.result.summary));
      assert.ok(!JSON.stringify(j.job.result).includes(trades[0].id), 'podgląd bez identyfikatorów stron');
      // zapis każdego wpisu trwa 1,2 s: przywracanie trwa kilka sekund
      await A.post('/__test/delay', { match: 'PATCH /v1/pages', ms: 1200 });
      const rs = await H.dash(S.base, '/api/backups/restore', { name, confirm: 'TAK', token: j.job.result.token });
      assert.equal(rs.status, 200, JSON.stringify(rs.j));
      await wait((x) => x.job.running && x.job.step === 'apply');
      const sw = await H.dash(S.base, '/api/disk/move/switch', {});
      assert.equal(sw.status, 409); assert.match(sw.j.error || '', /kopia albo przywracanie/i, 'przełączenie czeka na przywracanie: ' + JSON.stringify(sw.j));
      const tok = await H.dash(S.base, '/api/setup/token', { token: 'secret_atrapa_druga_0123456789', replace: true });
      assert.equal(tok.status, 409, JSON.stringify(tok.j)); assert.equal(tok.j.code, 'running');
      const cn = await H.dash(S.base, '/api/setup/connect', { pageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
      assert.equal(cn.status, 409, JSON.stringify(cn.j)); assert.equal(cn.j.code, 'running');
      j = await wait((x) => !x.job.running);
      assert.equal(j.job.error, null, JSON.stringify(j.job.error)); assert.equal(j.job.result.restored, 4);
      assert.ok(!existsSync(path.join(dir, '.env')) || !readFileSync(path.join(dir, '.env'), 'utf8').includes('druga'), 'token nie podmieniony');
    } finally { S.stop(); A.stop(); }
  });

  test('backtest-final: Instaluj.cmd: kod wyjścia winget i wersja Node.js po instalacji (kopia skryptu z atrapą winget, bez instalowania)', async () => {
    const cmd = src('Instaluj.cmd');
    assert.match(cmd, /set "WGCODE=%errorlevel%"/); assert.match(cmd, /if not "%WGCODE%"=="0" goto wingetfail/);
    assert.match(cmd, /"%ProgramFiles%\\nodejs\\node\.exe" -e "process\.exit\(\+process\.versions\.node\.split\('\.'\)\[0\]>=22\?0:1\)"/, 'wersja Node.js po instalacji');
    if (process.platform !== 'win32') return;
    const dir = H.tmp();
    // kopia: zamiast winget kod z WG_FAKE, zamiast przejścia do instalacji znacznik, bez otwierania strony i bez pause
    const copy = cmd.replace(/\r?\n/g, '\r\n')
      .replace('if /i "%~1"=="--cli" goto cli', 'goto winget')
      .replace(/winget install --id OpenJS\.NodeJS\.LTS[^\r\n]*/, 'cmd /c exit %WG_FAKE%')
      .replace(/\r\n {4}goto start\r\n/, '\r\n    echo ZNACZNIK_START& exit /b 7\r\n')
      .replace(/start "" https:\/\/nodejs\.org[^\r\n]*/, 'echo ZNACZNIK_STRONA')
      .replace(/\r\npause\r\n/g, '\r\n')
      // Windows ustawia ProgramFiles każdemu procesowi sam, więc kopia czyta folder z THQ_PF
      .replace(/%ProgramFiles%/g, '%THQ_PF%');
    writeFileSync(path.join(dir, 'kopia.cmd'), copy);
    const run = (env) => new Promise((res) => {
      const p = spawn('cmd.exe', ['/d', '/c', path.join(dir, 'kopia.cmd')], { cwd: dir, env: { ...process.env, ...env }, windowsHide: true });
      let out = ''; p.stdout.on('data', (d) => { out += d; }); p.on('close', (code) => res({ code, out }));
    });
    const pf = path.join(dir, 'pf'), withNode = path.join(dir, 'pf2');
    mkdirSync(pf); mkdirSync(withNode);
    // node.exe jako twarde dowiązanie (albo kopia): usunięcie katalogu testu nie dotyka instalacji Node.js
    mkdirSync(path.join(withNode, 'nodejs'));
    try { linkSync(process.execPath, path.join(withNode, 'nodejs', 'node.exe')); } catch { copyFileSync(process.execPath, path.join(withNode, 'nodejs', 'node.exe')); }
    let r = await run({ WG_FAKE: '5', THQ_PF: pf });
    assert.equal(r.code, 1, r.out); assert.match(r.out, /winget sie nie udala \(kod 5\)/); assert.match(r.out, /ZNACZNIK_STRONA/); assert.doesNotMatch(r.out, /Node\.js zainstalowany/);
    r = await run({ WG_FAKE: '0', THQ_PF: pf });
    assert.equal(r.code, 0, r.out); assert.match(r.out, /to okno jeszcze go nie widzi/);
    r = await run({ WG_FAKE: '0', THQ_PF: withNode });
    assert.equal(r.code, 7, r.out); assert.match(r.out, /ZNACZNIK_START/);
    // winget zgłasza błąd (np. pakiet już jest), ale w Program Files jest Node.js 22+: instalacja idzie dalej
    r = await run({ WG_FAKE: '5', THQ_PF: withNode });
    assert.equal(r.code, 7, r.out);
  });

  // ---------- wygląd (ocena wyglądu final): strona robocza testy/backtest-final.html na świecach syntetycznych, 1920 i 375 px ----------
  const runs = {};
  function pageResult(narrow) {
    runs[narrow] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-13', seed: 8 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      const S = await H.server(narrow ? 4964 : 4963, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-final.html${narrow ? '?w=375' : ''}`, narrow ? { width: 375, height: 812, mobile: true, timeoutMs: 180_000 } : { width: 1920, height: 1080, timeoutMs: 180_000 });
        return JSON.parse(txt);
      } finally { S.stop(); }
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
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }
  test('backtest-final: „Ryzyko za małe” z „Użyj 1 kontraktu”, podgląd ryzyka pod Kup/Sprzedaj (13 px, kwota w kolorze straty)', () => tagged('ryzyko', 5));
  test('backtest-final: pole ceny Limit mieści cenę z końcówką ,75; znaczniki otwartej pozycji (wejście, SL, TP) przy osi cen', async () => { await tagged('cena', 1); await tagged('pozycja', 3); });
  test('backtest-final: komunikat w stopce: jeden z listą brakujących pól, najwyżej 2 linie z „więcej”; licznik aktywnej zakładki szuflady w kolorze tekstu', async () => { await tagged('stopka', 3); await tagged('szuflada', 2); });
  test('backtest-final: 375 px: wykres ≥ 45% ekranu przy rozwiniętych polach i komunikacie, cena w osobnym wierszu, Journal w Historii przyklejony do prawej', async () => {
    for (const tag of ['ryzyko', 'cena', 'pozycja', 'stopka', 'szuflada']) await tagged(tag, 1, true);
  });

  test('backtest-final: kreator i Ustawienia: krok Strona nie przechodzi sam, „Wstecz” w Dzienniku i Danych rynkowych, „Więcej (opcjonalne)”, skróty jako „Shift + →”, statusy jako tekst z kropką', async () => {
    const pk = src('public/js/pierwsze-kroki.js');
    assert.doesNotMatch(pk, /setTimeout\(\(\) => \{ if \(cur\(\) === 'strona'\) choosePage\(\); \}/, 'bez automatycznego wyboru strony');
    assert.match(pk, /id === 'dziennik' \? !mk\.starting && !mk\.job\?\.running && !mk\.job\?\.done/);
    assert.match(src('public/js/ust-zrodla.js'), /class="sv-more ob-dane-more"/);
    assert.match(src('public/js/ust-backtest.js'), /value="\$\{esc\(skrotShow\(d\.skroty\[a\]\)\)\}"/);
    const { skrotLabel } = await imp('public/js/bt-czas.js');
    assert.equal(skrotLabel('Shift+ArrowRight').replace(/\+(?!$)/g, ' + '), 'Shift + →');
    const css = src('public/features.css');
    // [U] 1.11.2026 «Tak, ujednolić na tekst z kropką»
    // ciało wszystkich reguł z dokładnie tym selektorem na początku wiersza
    const rule = (sel) => css.split('\n').filter((l) => l.startsWith(`${sel} {`)).join(';');
    assert.doesNotMatch(rule('.warnb'), /border-radius:\s*999px|background:\s*color-mix/, '.warnb bez pigułki');
    assert.doesNotMatch(rule('.um-add'), /border-radius:\s*999px|background:/, '„to urządzenie” bez podkładki');
    assert.match(css, /\.okb::before, \.warnb::before, \.um-add::before \{[^}]*border-radius: 50%/, 'kropka przed statusem');
  });
};
