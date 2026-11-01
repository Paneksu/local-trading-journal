// backtest-N3: Ustawienia → Dane na dysku, strona serwera (pakiet N3, 1.6.0). Specyfikacja: backtest-wyniki/N-pierwsze-kroki-ustawienia.md §3.4, §4.2–4.4, §5.1 pkt 7, §5.2.
// Przegląd katalogu danych (świece per symbol i warstwa, sesje, newsy, earningsy, rysunki, kopie, wolne miejsce), usuwanie warstwy świec z potwierdzeniem nazwą,
// przenoszenie katalogu danych (kopia → sprawdzenie → przełączenie → restart, stary katalog zostaje), walidacja ścieżek (realpath, bez traversal).
// Wyłącznie katalogi tymczasowe i atrapy; port 4321 nietykalny.
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 6: przenoszenie katalogu danych: kopia → sprawdzenie → przełączenie → restart, stary katalog zostaje)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 7: usuwanie świec z UI tak, kopii baz nie)
import path from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync, symlinkSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const put = (f, data) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, data); };
  // Katalog danych z syntetycznymi plikami (rozmiary dobrane tak, żeby sumy dało się sprawdzić)
  function fakeData(base) {
    const c = (sym, layer, day, n) => put(path.join(base, 'candles', sym, layer, `${day}.bin`), Buffer.alloc(24 * n));
    c('NQ', '1m', '2024-03-11', 10); c('NQ', '1m', '2024-03-13', 20); c('NQ', '1s', '2024-03-12', 5);
    c('NQ', '1m-NQZ2025', '2025-12-12', 3); c('NQ', '1s-NQH2026', '2026-03-13', 2); c('ES', '1m', '2023-01-03', 4);
    put(path.join(base, 'candles', 'NQ', 'coverage.json'), JSON.stringify({ '1m': [[1710115200, 1710374400]], '1s': [[1710248400, 1710253800]], '1m-NQZ2025': [[1765497600, 1765584000]], '1s-NQH2026': [[1773360000, 1773363600]], rolls: [] }));
    put(path.join(base, 'candles', 'ES', 'coverage.json'), JSON.stringify({ '1m': [[1672704000, 1672790400]], '1s': [], rolls: [] }));
    put(path.join(base, 'backtest', 'sessions', 'bt-aaaaaa1.json'), 'x'.repeat(100));
    put(path.join(base, 'backtest', 'sessions', 'bt-aaaaaa2.json'), 'x'.repeat(50));
    put(path.join(base, 'backtest', 'day-index-NQ.json'), '{}');
    put(path.join(base, 'news', 'status.json'), '{"feed":{}}');
    put(path.join(base, 'earnings', 'status.json'), '{}');
    put(path.join(base, 'drawings-cache', 'a.json'), JSON.stringify({ at: 1, json: '{}', pending: true }));
    put(path.join(base, 'drawings-cache', 'b.json'), JSON.stringify({ at: 1, json: '{}', pending: false }));
    put(path.join(base, 'queue.json'), JSON.stringify({ items: [{ id: 'NQ-1710248400-1710253800', instrument: 'NQ', from: 1710248400, to: 1710253800, state: 'pending' }, { id: 'ES-1', instrument: 'ES', from: 1672704000, to: 1672707600, state: 'pending' }] }));
  }

  test('backtest-N3: scanData: świece per symbol i warstwa (1m, 1s, kontrakty) z zakresem dat i rozmiarem, sesje, newsy, earningsy, rysunki w kolejce, kopie, wolne miejsce', async () => {
    const D = await imp('lib/dysk.mjs');
    const dir = H.tmp(), data = path.join(dir, 'chart-data'), backups = path.join(dir, 'backups');
    fakeData(data);
    put(path.join(backups, '2026-10-30T10-00-00', 'trades.json'), '[]'); put(path.join(backups, '2026-10-31T09-14-00', 'trades.json'), '[1]');
    const s = await D.scanData({ dataDir: data, backupsDir: backups });
    const row = (sym, layer) => s.candles.find((r) => r.symbol === sym && r.layer === layer);
    assert.deepEqual(s.candles.map((r) => `${r.symbol} ${r.layer}`), ['ES 1m', 'NQ 1m', 'NQ 1s', 'NQ kontrakty'], 'wiersze: symbol × warstwa, puste pominięte');
    assert.deepEqual([row('NQ', '1m').from, row('NQ', '1m').to, row('NQ', '1m').files, row('NQ', '1m').bytes], ['2024-03-11', '2024-03-13', 2, 720]);
    assert.deepEqual(row('NQ', 'kontrakty').layers, ['1m-NQZ2025', '1s-NQH2026']);
    assert.equal(row('NQ', 'kontrakty').bytes, 120); assert.equal(row('NQ', 'kontrakty').from, '2025-12-12'); assert.equal(row('NQ', 'kontrakty').to, '2026-03-13');
    assert.deepEqual(s.sessions, { count: 2, bytes: 150 });
    assert.equal(s.drawings.pending, 1); assert.equal(s.drawings.files, 2);
    assert.ok(s.news.bytes > 0 && s.news.updatedAt, 'newsy: rozmiar i data odświeżenia');
    assert.ok(s.earnings.bytes > 0);
    assert.equal(s.backups.count, 2); assert.equal(s.backups.latest, '2026-10-31T09-14-00'); assert.equal(s.backups.bytes, 5);
    assert.ok(s.bytes >= 720 + 120 + 150, 'całość katalogu');
    assert.ok(s.free && s.free.freeBytes > 0 && s.free.totalBytes >= s.free.freeBytes, 'wolne miejsce z statfs');
    const empty = await D.scanData({ dataDir: path.join(dir, 'nie-ma'), backupsDir: path.join(dir, 'nie-ma-kopii') });
    assert.equal(empty.exists, false); assert.deepEqual(empty.candles, []); assert.equal(empty.sessions.count, 0); assert.ok(empty.free?.freeBytes > 0, 'wolne miejsce z najbliższego istniejącego katalogu');
  });

  test('backtest-N3: validateTarget: tylko ścieżka bezwzględna, bez .., bez UNC, po realpath poza katalogiem aplikacji i obecnym katalogiem danych, nie systemowa, pusta albo nowa', async () => {
    const D = await imp('lib/dysk.mjs');
    const dir = H.tmp(), app = path.join(dir, 'app'), data = path.join(app, 'chart-data');
    mkdirSync(data, { recursive: true });
    const ctx = { appRoot: app, dataDir: data };
    const code = (raw, extra = {}) => { try { D.validateTarget(raw, { ...ctx, ...extra }); return 'ok'; } catch (e) { assert.equal(e.status, 400, `${raw}: status 400`); return e.code; } };
    assert.equal(code('chart-data'), 'relative');
    assert.equal(code(''), 'bad-path'); assert.equal(code(42), 'bad-path'); assert.equal(code('a\0b'), 'bad-path'); assert.equal(code('x'.repeat(600)), 'bad-path');
    assert.equal(code([dir, 'a', '..', 'b'].join(path.sep)), 'traversal');
    if (process.platform === 'win32') {
      assert.equal(code('\\\\serwer\\udzial\\dane'), 'unc'); assert.equal(code('//serwer/udzial/dane'), 'unc');
      assert.equal(code('C:\\'), 'root');
      assert.equal(code(path.join(process.env.SystemRoot || 'C:\\Windows', 'JJ')), 'system');
      assert.equal(code(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'JJ')), 'system');
    } else assert.equal(code('/etc/jj'), 'system');
    assert.equal(code(path.join(app, 'inne')), 'app', 'wewnątrz katalogu aplikacji');
    assert.equal(code(dir), 'app', 'katalog nadrzędny zawiera aplikację');
    assert.equal(code(path.join(data, 'pod')), 'app');
    const ext = path.join(dir, 'zewn'); mkdirSync(ext);
    assert.equal(code(path.join(ext, 'dane'), { dataDir: ext }), 'same', 'wewnątrz obecnego katalogu danych');
    const full = path.join(dir, 'pelny'); put(path.join(full, 'plik.txt'), 'x');
    assert.equal(code(full), 'not-empty');
    put(path.join(dir, 'plik'), 'x');
    assert.equal(code(path.join(dir, 'plik')), 'not-dir');
    // dowiązanie (junction) do katalogu aplikacji: realpath odsłania prawdziwe miejsce
    const link = path.join(dir, 'skrot');
    symlinkSync(app, link, 'junction');
    assert.equal(code(path.join(link, 'nowy')), 'app', 'realpath przez dowiązanie');
    const okDir = path.join(dir, 'nowe', 'JustJournal');
    assert.equal(D.validateTarget(okDir, ctx), okDir, 'nowy katalog poza aplikacją');
    const emptyDir = path.join(dir, 'pusty'); mkdirSync(emptyDir);
    assert.equal(D.validateTarget(emptyDir, ctx), emptyDir, 'pusty istniejący katalog');
  });

  test('backtest-N3: planTree, copyTree i verifyTree: kopia całego katalogu (bez plików .tmp), sprawdzenie sumami SHA-256 wykrywa zmianę bajtu', async () => {
    const D = await imp('lib/dysk.mjs');
    const dir = H.tmp(), src = path.join(dir, 'src'), dst = path.join(dir, 'dst');
    fakeData(src); put(path.join(src, 'queue.json.tmp'), 'tmp');
    const plan = await D.planTree(src);
    assert.ok(plan.files.length >= 14 && !plan.files.some((f) => f.rel.endsWith('.tmp')), 'bez plików tymczasowych');
    assert.equal(plan.bytes, plan.files.reduce((a, f) => a + f.size, 0));
    const seen = [];
    await D.copyTree(src, dst, plan.files, { onFile: (n, b) => seen.push([n, b]) });
    assert.equal(seen.at(-1)[0], plan.files.length); assert.equal(seen.at(-1)[1], plan.bytes, 'postęp: pliki i bajty');
    assert.ok(existsSync(path.join(dst, 'candles', 'NQ', '1m', '2024-03-13.bin')) && !existsSync(path.join(dst, 'queue.json.tmp')));
    assert.deepEqual(await D.verifyTree(src, dst, plan.files), { ok: true, bad: [] });
    const f = path.join(dst, 'candles', 'NQ', '1m', '2024-03-11.bin'); const b = readFileSync(f); b[5] = 9; writeFileSync(f, b);
    const v = await D.verifyTree(src, dst, plan.files);
    assert.equal(v.ok, false); assert.deepEqual(v.bad, [path.join('candles', 'NQ', '1m', '2024-03-11.bin')]);
  });

  test('backtest-N3: resolveDataDir: brak klucza = CONFIG_DIR/chart-data, dataDir z config.local.json, brak katalogu = domyślny z ostrzeżeniem', async () => {
    const D = await imp('lib/dysk.mjs');
    const dir = H.tmp(), other = path.join(dir, 'gdzie-indziej'); mkdirSync(other);
    assert.deepEqual(D.resolveDataDir({}, dir), { dir: path.join(dir, 'chart-data'), custom: false, missing: null });
    assert.deepEqual(D.resolveDataDir({ dataDir: other }, dir), { dir: other, custom: true, missing: null });
    assert.deepEqual(D.resolveDataDir({ dataDir: path.join(dir, 'odlaczony') }, dir), { dir: path.join(dir, 'chart-data'), custom: false, missing: path.join(dir, 'odlaczony') });
    assert.deepEqual(D.resolveDataDir({ dataDir: 'wzgledna' }, dir), { dir: path.join(dir, 'chart-data'), custom: false, missing: 'wzgledna' });
  });

  test('backtest-N3: GET /api/disk: przegląd katalogu danych bez sieci, obca strona 403; „Otwórz folder” dla świec, sesji i poprzedniego katalogu tylko ze ścieżek serwera', async () => {
    const dir = H.tmp(); fakeData(path.join(dir, 'chart-data'));
    const S = await H.server(4811, { THQ_CONFIG_DIR: dir });
    try {
      const j = await (await fetch(`${S.base}/api/disk`)).json();
      assert.equal(j.dataDir, path.join(dir, 'chart-data')); assert.equal(j.custom, false); assert.equal(j.missing, null);
      assert.deepEqual(j.candles.map((r) => `${r.symbol} ${r.layer}`), ['ES 1m', 'NQ 1m', 'NQ 1s', 'NQ kontrakty']);
      assert.ok(j.free.freeBytes > 0); assert.equal(j.move.phase, 'idle'); assert.equal(j.busy, null);
      assert.equal((await fetch(`${S.base}/api/disk`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
      for (const [which, p] of [['candles', path.join(dir, 'chart-data', 'candles')], ['sessions', path.join(dir, 'chart-data', 'backtest', 'sessions')]]) {
        const r = await H.dash(S.base, '/api/diag/open', { which, path: 'C:\\Windows' });
        assert.equal(r.j.ok, true, which); assert.equal(r.j.path, p); assert.equal(r.j.opened, false);
      }
      assert.equal((await H.dash(S.base, '/api/diag/open', { which: 'prev' })).j.code, 'missing', 'bez poprzedniego katalogu');
    } finally { S.stop(); }
  });

  test('backtest-N3: POST /api/disk/candles/delete: ochrona zapisu, potwierdzenie nazwą warstwy, usuwa pliki i pokrycie warstwy, indeks dni i okna tej warstwy z kolejki; inne warstwy zostają', async () => {
    const dir = H.tmp(), data = path.join(dir, 'chart-data'); fakeData(data);
    const S = await H.server(4812, { THQ_CONFIG_DIR: dir });
    try {
      assert.equal((await fetch(`${S.base}/api/disk/candles/delete`, { method: 'POST', headers: { Origin: S.base, 'Content-Type': 'application/json' }, body: '{"symbol":"NQ","layer":"1s","confirm":"NQ 1s"}' })).status, 403);
      for (const b of [{ symbol: 'NQ', layer: '1s' }, { symbol: 'NQ', layer: '1s', confirm: 'NQ 1m' }, { symbol: 'NQ', layer: '1s', confirm: 'nq 1s ' }, { symbol: 'XX', layer: '1s', confirm: 'XX 1s' }, { symbol: 'NQ', layer: '../1m', confirm: 'NQ ../1m' }, { symbol: 'NQ', layer: '5m', confirm: 'NQ 5m' }]) {
        const r = await H.dash(S.base, '/api/disk/candles/delete', b);
        assert.equal(r.status, 400, JSON.stringify(b));
      }
      assert.ok(existsSync(path.join(data, 'candles', 'NQ', '1s', '2024-03-12.bin')), 'po odrzuceniu nic nie zniknęło');
      const r = await H.dash(S.base, '/api/disk/candles/delete', { symbol: 'NQ', layer: '1s', confirm: 'NQ 1s' });
      assert.equal(r.status, 200, JSON.stringify(r.j)); assert.deepEqual(r.j.removed, ['1s']); assert.equal(r.j.bytes, 120);
      assert.ok(!existsSync(path.join(data, 'candles', 'NQ', '1s')), 'katalog warstwy usunięty');
      assert.ok(existsSync(path.join(data, 'candles', 'NQ', '1m', '2024-03-11.bin')) && existsSync(path.join(data, 'candles', 'NQ', '1s-NQH2026')), 'inne warstwy zostają');
      const cov = JSON.parse(readFileSync(path.join(data, 'candles', 'NQ', 'coverage.json'), 'utf8'));
      assert.deepEqual(cov['1s'], []); assert.equal(cov['1m'].length, 1);
      assert.ok(!existsSync(path.join(data, 'backtest', 'day-index-NQ.json')), 'indeks dni NQ do przeliczenia');
      const q = JSON.parse(readFileSync(path.join(data, 'queue.json'), 'utf8'));
      assert.deepEqual(q.items.map((i) => i.id), ['ES-1'], 'okna 1s NQ wycięte z kolejki (bez ponownego płatnego pobrania)');
      const k = await H.dash(S.base, '/api/disk/candles/delete', { symbol: 'NQ', layer: 'kontrakty', confirm: 'NQ kontrakty' });
      assert.deepEqual(k.j.removed, ['1m-NQZ2025', '1s-NQH2026']);
      const cov2 = JSON.parse(readFileSync(path.join(data, 'candles', 'NQ', 'coverage.json'), 'utf8'));
      assert.ok(!('1m-NQZ2025' in cov2) && !('1s-NQH2026' in cov2));
      const j = await (await fetch(`${S.base}/api/disk`)).json();
      assert.deepEqual(j.candles.map((x) => `${x.symbol} ${x.layer}`), ['ES 1m', 'NQ 1m']);
      const none = await H.dash(S.base, '/api/disk/candles/delete', { symbol: 'NQ', layer: '1s', confirm: 'NQ 1s' });
      assert.equal(none.status, 200); assert.deepEqual(none.j.removed, [], 'drugi raz: nic do usunięcia');
    } finally { S.stop(); }
  });

  test('backtest-N3: przeniesienie katalogu: sprawdzenie celu i miejsca, kopia z postępem, sprawdzenie sum, przełączenie zapisuje dataDir i restartuje; nowy proces czyta nowy katalog, stary zostaje', async () => {
    const dir = H.tmp(), data = path.join(dir, 'chart-data'), target = path.join(H.tmp(), 'JustJournal', 'dane');
    fakeData(data);
    const S = await H.server(4813, { THQ_CONFIG_DIR: dir });
    let newPid = 0;
    try {
      assert.equal((await fetch(`${S.base}/api/disk/move`, { method: 'POST', headers: { Origin: S.base, 'Content-Type': 'application/json' }, body: JSON.stringify({ target, dryRun: true }) })).status, 403);
      const badT = await H.dash(S.base, '/api/disk/move', { target: path.join(dir, 'chart-data', 'x'), dryRun: true });
      assert.equal(badT.status, 400); assert.equal(badT.j.code, 'same');
      const chk = await H.dash(S.base, '/api/disk/move', { target, dryRun: true });
      assert.equal(chk.status, 200, JSON.stringify(chk.j)); assert.equal(chk.j.target, target); assert.ok(chk.j.needBytes > 0 && chk.j.freeBytes > chk.j.needBytes); assert.equal(chk.j.files > 10, true);
      assert.ok(!existsSync(target), 'sprawdzenie niczego nie tworzy');
      assert.equal((await H.dash(S.base, '/api/disk/move/switch', {})).status, 409, 'przełączenie bez gotowej kopii');
      const st = await H.dash(S.base, '/api/disk/move', { target, confirm: true });
      assert.equal(st.status, 200, JSON.stringify(st.j)); assert.equal(st.j.started, true);
      let m = null;
      for (let i = 0; i < 80; i++) { m = await (await fetch(`${S.base}/api/disk/move/status`)).json(); if (['ready', 'error'].includes(m.phase)) break; await H.sleep(100); }
      assert.equal(m.phase, 'ready', JSON.stringify(m)); assert.equal(m.done, m.total); assert.equal(m.verified, m.total);
      // dopisany po kopii plik sesji trafia do celu przy przełączeniu (dosynchronizowanie)
      put(path.join(data, 'backtest', 'sessions', 'bt-aaaaaa3.json'), '{"nowa":1}');
      const before = await (await fetch(`${S.base}/api/diag`)).json();
      const sw = await H.dash(S.base, '/api/disk/move/switch', {});
      assert.equal(sw.status, 200, JSON.stringify(sw.j)); assert.equal(sw.j.restarting, true); assert.equal(sw.j.dataDir, target);
      const cfg = JSON.parse(readFileSync(path.join(dir, 'config.local.json'), 'utf8'));
      assert.equal(cfg.dataDir, target); assert.equal(cfg.dataDirPrev, data);
      assert.equal(readFileSync(path.join(target, 'backtest', 'sessions', 'bt-aaaaaa3.json'), 'utf8'), '{"nowa":1}');
      let after = null;
      for (let i = 0; i < 80 && !(after && after.started !== before.started); i++) { await H.sleep(250); try { after = await (await fetch(`${S.base}/api/diag`)).json(); } catch { after = null; } }
      assert.ok(after && after.started !== before.started, 'serwer wstał ponownie'); newPid = after.pid;
      assert.equal(after.paths.data, target, 'nowy proces czyta nowy katalog');
      assert.ok(existsSync(path.join(data, 'candles', 'NQ', '1m', '2024-03-11.bin')), 'stary katalog zostaje');
      const disk = await (await fetch(`${S.base}/api/disk`)).json();
      assert.equal(disk.custom, true); assert.equal(disk.prev, data);
      const pr = await H.dash(S.base, '/api/diag/open', { which: 'prev' });
      assert.equal(pr.j.ok, true); assert.equal(pr.j.path, data);
    } finally {
      S.stop();
      // nowy proces jest odłączony (lib/restart.mjs): zatrzymujemy go po PID z odpowiedzi tej instancji testowej (port 4813)
      if (newPid) { try { process.kill(newPid); } catch { /* już nie żyje */ } }
    }
  });

  test('backtest-N3: przeniesienie: anulowanie usuwa częściową kopię; restart, usuwanie świec i pobieranie zablokowane w trakcie kopii', async () => {
    const D = await imp('lib/dysk.mjs');
    const dir = H.tmp(), data = path.join(dir, 'chart-data'); fakeData(data);
    const cfg = {};
    let gate = null;
    const mover = D.createMover({ getDataDir: () => data, appRoot: ROOT, getConfig: () => cfg, saveConfig: () => {}, isBusy: () => null, onFile: async () => { if (gate) await gate; } });
    const target = path.join(H.tmp(), 'cel');
    let release; gate = new Promise((r) => { release = r; });
    const r = await mover.start(target);
    assert.equal(r.started, true); assert.equal(mover.status().phase, 'copy'); assert.ok(mover.busy());
    await assert.rejects(() => mover.start(target), (e) => e.status === 409);
    await mover.cancel(); release();
    for (let i = 0; i < 40 && mover.status().phase !== 'cancelled'; i++) await H.sleep(50);
    assert.equal(mover.status().phase, 'cancelled'); assert.ok(!existsSync(target), 'częściowa kopia usunięta'); assert.ok(!mover.busy());
    assert.ok(existsSync(path.join(data, 'candles', 'NQ', '1m', '2024-03-11.bin')), 'źródło nietknięte');
    const busy = D.createMover({ getDataDir: () => data, appRoot: ROOT, getConfig: () => cfg, saveConfig: () => {}, isBusy: () => 'Trwa pobieranie świec.' });
    await assert.rejects(() => busy.start(path.join(H.tmp(), 'cel2')), (e) => e.status === 409 && /pobieranie/.test(e.message));
    const s = readFileSync(path.join(ROOT, 'server.mjs'), 'utf8');
    const i = s.indexOf("'/api/restart': async () => {");
    const body = s.slice(i, s.indexOf('},', i));
    // poprawki po review N1–N4: wspólna funkcja busyReason() dla restartu, zatrzymania i aktualizacji
    const fb = s.slice(s.indexOf('function busyReason() {'), s.indexOf('\n}', s.indexOf('function busyReason() {')));
    assert.match(body, /busyReason\(\)/); assert.match(fb, /mover\.busy\(\)/, 'restart czeka na koniec kopii'); assert.match(fb, /c\.running/, 'restart czeka na koniec importu i pobierania');
    for (const route of ["'/api/candles/fetch'", "'/api/candles/import'", "'/api/candles/import-1s'", "'/api/disk/candles/delete'"]) {
      const k = s.indexOf(route + ':');
      assert.ok(k > 0 && /moveBusy\(\)|mover\.busy\(\)/.test(s.slice(k, s.indexOf('\n', k))), `${route}: blokada w trakcie przenoszenia`);
    }
  });

  test('backtest-N3: start z config.dataDir: diagnostyka i świece z nowego katalogu; katalog odłączony = domyślny i ostrzeżenie w /api/disk', async () => {
    const dir = H.tmp(), other = path.join(H.tmp(), 'dane'); fakeData(other);
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ dataDir: other }));
    const S = await H.server(4814, { THQ_CONFIG_DIR: dir });
    try {
      const d = await (await fetch(`${S.base}/api/diag`)).json();
      assert.equal(d.paths.data, other);
      const j = await (await fetch(`${S.base}/api/disk`)).json();
      assert.equal(j.custom, true); assert.ok(j.candles.length === 4);
      const sz = await (await fetch(`${S.base}/api/candles/size`)).json();
      assert.ok(sz.bytes > 800, 'rozmiar liczony w nowym katalogu');
      assert.ok(!existsSync(path.join(dir, 'chart-data', 'candles')), 'stary domyślny katalog bez świec');
    } finally { S.stop(); }
    const dir2 = H.tmp();
    writeFileSync(path.join(dir2, 'config.local.json'), JSON.stringify({ dataDir: path.join(dir2, 'odlaczony-dysk') }));
    const S2 = await H.server(4815, { THQ_CONFIG_DIR: dir2 });
    try {
      const j = await (await fetch(`${S2.base}/api/disk`)).json();
      assert.equal(j.dataDir, path.join(dir2, 'chart-data')); assert.equal(j.missing, path.join(dir2, 'odlaczony-dysk'));
    } finally { S2.stop(); }
    void readdirSync;
  });

  // ---------- ekran (Chrome/Edge headless, scenariusz testy/scen-N3.js) ----------
  const runs = {};
  function pageResult(narrow) {
    runs[narrow] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const dir = H.tmp(); fakeData(path.join(dir, 'chart-data'));
      const target = path.join(H.tmp(), 'nowe-dane');
      const A = await H.atrapa(narrow ? 4818 : 4816);
      const S = await H.server(narrow ? 4819 : 4817, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'secret_atrapa', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL });
      try {
        const opt = narrow ? { width: 375, height: 812, mobile: true } : { width: 1920, height: 1080 };
        const scen = `window.__N3_TARGET = ${JSON.stringify(target)};
` + readFileSync(path.join(ROOT, 'testy', 'scen-N3.js'), 'utf8');
        const txt = await P.cdpPage(`${S.base}/`, { ...opt, timeoutMs: 120_000, until: "window.__thq && document.querySelector('#view .page-head')", extract: scen });
        const res = JSON.parse(txt);
        res.copied = existsSync(path.join(target, 'candles', 'NQ', '1m', '2024-03-11.bin'));
        return res;
      } finally { S.stop(); A.stop(); }
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
  test('backtest-N3: ekran Dane na dysku: tabela świec z zakresem dat i rozmiarem, wolne miejsce, sesje, rysunki w kolejce, kopie bez usuwania (1920 px)', async () => { await tagged('tabela', 6); });
  test('backtest-N3: ekran: usuwanie warstwy wymaga wpisania nazwy, zła nazwa bez żądania, po usunięciu wiersz znika', async () => { await tagged('usun', 4); });
  test('backtest-N3: ekran: przeniesienie: zła ścieżka z komunikatem, sprawdzenie miejsca, kopia z postępem i sprawdzeniem, „Przełącz i uruchom ponownie”', async () => { const r = await tagged('przenies', 5); assert.ok(r.copied, 'kopia leży w katalogu celu'); });
  test('backtest-N3: ekran 375 px: tabela jako lista, bez poziomego przewijania, te same akcje', async () => { await tagged('tabela', 7, true); await tagged('usun', 4, true); await tagged('przenies', 5, true); });
};
