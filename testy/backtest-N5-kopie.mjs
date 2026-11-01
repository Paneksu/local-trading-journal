// backtest-N5: Ustawienia → Kopie i diagnostyka: kopie baz Notion i przywracanie z UI (pakiet N5, 1.6.0).
// Specyfikacja: backtest-wyniki/N-pierwsze-kroki-ustawienia.md §3.4 (backups/), §3.5 (restore.mjs), §4.3 (makieta), §5.4 pyt. 7 i 8.
// Lista kopii, „Utwórz kopię teraz” (lib/backup.mjs bez zmian logiki), podgląd przywracania bez zapisu, przywrócenie po wpisaniu „TAK”
// z kopią bieżącego stanu przed zapisem, postęp, blokada busyReason(), nazwy kopii tylko z listy, brak sekretów w odpowiedziach, brak usuwania kopii.
// Wyłącznie atrapa Notion i katalogi tymczasowe; port 4321 nietykalny.
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 7: usuwania kopii baz z UI nie ma)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 8: przywracanie Notion z kopii z UI po wpisaniu „TAK”)
import path from 'node:path';
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const put = (f, data) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, data); };
  const manifest = (dir, m) => put(path.join(dir, 'manifest.json'), JSON.stringify(m));
  const NOTION_ENV = (A, dir) => ({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'secret_atrapa', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL });
  // czeka, aż zadanie kopii skończy się (done albo error)
  async function waitJob(base, ms = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const j = await (await fetch(`${base}/api/backups`)).json();
      if (j.job && !j.job.running) return j;
      await H.sleep(120);
    }
    throw new Error('zadanie kopii nie skończyło się');
  }
  const noSecrets = (obj, what) => {
    const s = JSON.stringify(obj);
    for (const v of ['secret_atrapa', ...Object.values(H.IDS)]) assert.ok(!s.includes(v), `${what}: bez sekretów i identyfikatorów baz (${v.slice(0, 8)}…)`);
  };

  test('backtest-N5: listBackups: tylko katalogi o nazwie znacznika czasu z manifest.json (bez dowiązań), najnowsza pierwsza, data, wersja, powód, liczby wpisów i rozmiar', async () => {
    const K = await imp('lib/kopie.mjs');
    const dir = H.tmp(), b = path.join(dir, 'backups');
    const a1 = path.join(b, '2026-10-30T10-00-00Z'), a2 = path.join(b, '2026-10-31T09-14-00Z'), a3 = path.join(b, '2026-10-31T09-20-11Z');
    manifest(a1, { createdAt: '2026-10-30T10:00:00.000Z', counts: { trades: 10, konta: 2 }, appVersion: '1.5.0', schemaVersion: 6 });
    put(path.join(a1, 'trades.json'), 'x'.repeat(100));
    manifest(a2, { createdAt: '2026-10-31T09:14:00.000Z', counts: { trades: 11 }, appVersion: '1.6.0', schemaVersion: 6, reason: 'manual' });
    manifest(a3, { createdAt: '2026-10-31T09:20:11.000Z', counts: {}, appVersion: '1.6.0', schemaVersion: 6, reason: 'before-restore', restoreFrom: '2026-10-30T10-00-00Z' });
    put(path.join(b, '2026-10-29T08-00-00Z', 'trades.json'), '[]');
    manifest(path.join(b, '..sekret'), { counts: {} });
    manifest(path.join(b, 'zla nazwa'), { counts: {} });
    put(path.join(b, '2026-10-28T08-00-00Z'), 'plik, nie katalog');
    manifest(path.join(b, '2026-10-27T08-00-00Z'), 'nieczytelny');
    writeFileSync(path.join(b, '2026-10-27T08-00-00Z', 'manifest.json'), '{nie json');
    const other = path.join(dir, 'poza'); manifest(other, { counts: { trades: 1 } });
    symlinkSync(other, path.join(b, '2026-10-26T08-00-00Z'), 'junction');
    const list = K.listBackups(b);
    assert.deepEqual(list.map((x) => x.name), ['2026-10-31T09-20-11Z', '2026-10-31T09-14-00Z', '2026-10-30T10-00-00Z', '2026-10-27T08-00-00Z'], 'kolejność i odrzucone wpisy');
    const old = list.find((x) => x.name === '2026-10-30T10-00-00Z');
    assert.deepEqual([old.reason, old.appVersion, old.schemaVersion, old.total, old.counts.trades, old.createdAt], ['update', '1.5.0', 6, 12, 10, '2026-10-30T10:00:00.000Z']);
    assert.ok(old.bytes >= 100, 'rozmiar katalogu kopii');
    assert.equal(list[0].reason, 'before-restore'); assert.equal(list[0].restoreFrom, '2026-10-30T10-00-00Z'); assert.equal(list[1].reason, 'manual');
    const bad = list.find((x) => x.name === '2026-10-27T08-00-00Z');
    assert.equal(bad.unreadable, true, 'nieczytelny manifest widoczny jako uszkodzona kopia');
    assert.ok(!JSON.stringify(list).includes(b), 'lista bez ścieżek plików');
    assert.deepEqual(K.listBackups(path.join(dir, 'nie-ma')), []);
    for (const n of ['../poza', '2026-10-31T09-14-00Z/..', 'C:\\Windows', '2026-10-26T08-00-00Z', '', 42]) assert.equal(K.findBackup(b, n), null, `findBackup odrzuca ${n}`);
    assert.equal(K.findBackup(b, '2026-10-31T09-14-00Z'), a2);
  });

  test('backtest-N5: createBackups: zadanie kopii zajmuje blokadę (busy), druga kopia 409, cudza praca (busyReason) blokuje kopię, podgląd i przywrócenie', async () => {
    const K = await imp('lib/kopie.mjs');
    const dir = H.tmp();
    let release;
    const gate = new Promise((r) => { release = r; });
    const pages = { a: [{ id: 'p1', properties: { Nazwa: { id: 'title', type: 'title', title: [{ plain_text: 'A' }] } } }] };
    const notion = {
      get: async () => ({ properties: { Nazwa: { id: 'title', type: 'title' } } }),
      queryAll: async () => { await gate; return pages.a; },
    };
    let other = null;
    const B = K.createBackups({ notion, sources: { trades: 'ds-t' }, backupsDir: path.join(dir, 'backups'), meta: () => ({ appVersion: '9.9.9', schemaVersion: 6 }), isBusy: () => other, lang: () => 'pl', log: () => {} });
    assert.equal(B.busy(), null);
    const r = await B.create();
    assert.equal(r.started, true);
    assert.match(B.busy() || '', /kopi/i, 'w trakcie kopii busy() zwraca powód');
    await assert.rejects(B.create(), (e) => e.status === 409 && e.code === 'running');
    release();
    for (let i = 0; i < 50 && B.status().running; i++) await H.sleep(20);
    assert.equal(B.status().running, false); assert.equal(B.status().kind, 'create'); assert.ok(B.status().result?.name, 'nazwa nowej kopii');
    assert.equal(B.busy(), null);
    const made = B.list().items[0];
    assert.deepEqual([made.reason, made.appVersion, made.counts.trades], ['manual', '9.9.9', 1]);
    other = 'Aktualizacja już trwa.';
    await assert.rejects(B.create(), (e) => e.status === 409 && /Aktualizacja/.test(e.message));
    await assert.rejects(B.preview(made.name), (e) => e.status === 409);
    await assert.rejects(B.restore(made.name, 'TAK'), (e) => e.status === 409);
    other = null;
    await assert.rejects(B.preview('../x'), (e) => e.status === 400 && e.code === 'bad-name');
    await assert.rejects(B.restore(made.name, 'TAK'), (e) => e.status === 409 && e.code === 'preview-required', 'przywrócenie tylko po podglądzie tej kopii');
  });

  test('backtest-N5: serwer: GET /api/backups bez sieci, obca strona 403, ochrona zapisu POST; kopia teraz, podgląd bez zapisu, przywrócenie po „TAK” z kopią bieżącego stanu, bez sekretów', async () => {
    const A = await H.atrapa(4841);
    const dir = H.tmp();
    const S = await H.server(4842, NOTION_ENV(A, dir));
    try {
      const empty = await (await fetch(`${S.base}/api/backups`)).json();
      assert.deepEqual(empty.items, []); assert.equal(empty.word, 'TAK'); assert.equal(empty.job.running, false);
      assert.equal((await fetch(`${S.base}/api/backups`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
      for (const p of ['/api/backups/create', '/api/backups/preview', '/api/backups/restore']) {
        const r = await fetch(`${S.base}${p}`, { method: 'POST', headers: { Origin: 'http://evil.example', 'X-THQ': '1', 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(r.status, 403, `${p}: obcy Origin`);
      }
      assert.equal((await A.writes()).length, 0);
      // kopia teraz
      const c = await H.dash(S.base, '/api/backups/create', {});
      assert.equal(c.status, 200, JSON.stringify(c.j)); assert.equal(c.j.started, true);
      let j = await waitJob(S.base);
      assert.equal(j.job.error, null, JSON.stringify(j.job.error)); assert.equal(j.items.length, 1);
      const bk = j.items[0];
      assert.equal(bk.reason, 'manual'); assert.ok(bk.counts.trades > 0 && bk.total >= bk.counts.trades);
      assert.ok(existsSync(path.join(dir, 'backups', bk.name, 'manifest.json')), 'kopia w CONFIG_DIR/backups');
      assert.equal((await A.writes()).length, 0, 'kopia tylko czyta Notion');
      noSecrets(j, 'lista');
      // zmiany „w Notion” po kopii: pole i kosz
      const trades = await A.get('/__test/pages?ds=trades');
      const [p1, p2] = [trades[2], trades[5]];
      await A.post('/__test/notion-edit', { id: p1.id, set: { R: 99, Notatki: 'zepsute' } });
      await fetch(`${A.base}/v1/pages/${p2.id}`, { method: 'PATCH', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify({ in_trash: true }) });
      const w0 = (await A.writes()).length;
      // nazwy tylko z listy
      for (const name of ['../backups', `${bk.name}/..`, '..\\..\\Windows', 'C:\\Windows', '2020-01-01T00-00-00Z', null]) {
        const r = await H.dash(S.base, '/api/backups/preview', { name });
        assert.equal(r.status, 400, `podgląd ${name}`); assert.equal(r.j.code, 'bad-name');
      }
      const early = await H.dash(S.base, '/api/backups/restore', { name: bk.name, confirm: 'TAK' });
      assert.equal(early.status, 409); assert.equal(early.j.code, 'preview-required');
      // podgląd: liczby stron i pól, bez zapisu
      const pv = await H.dash(S.base, '/api/backups/preview', { name: bk.name });
      assert.equal(pv.status, 200, JSON.stringify(pv.j));
      j = await waitJob(S.base);
      const P = j.job.result;
      assert.equal(j.job.kind, 'preview'); assert.equal(P.name, bk.name);
      assert.deepEqual([P.summary.update, P.summary.untrash, P.summary.recreate, P.summary.pages], [1, 1, 0, 2], JSON.stringify(P.summary));
      assert.ok(P.summary.fields >= 2, 'pola do przywrócenia (R, Notatki)');
      assert.ok(P.summary.unchanged > 0);
      const it = P.items.find((x) => x.action === 'update');
      assert.equal(it.db, 'trades'); assert.ok(it.fields.includes('R') && it.fields.includes('Notatki'), JSON.stringify(it));
      assert.ok(!('props' in it), 'podgląd bez wartości pól do zapisu');
      assert.equal((await A.writes()).length, w0, 'podgląd nic nie zapisał');
      noSecrets(j, 'podgląd');
      // final (P3-5): podgląd bez identyfikatorów stron (tylko baza, tytuł, rodzaj zmiany i nazwy pól)
      for (const pg of trades) assert.ok(!JSON.stringify(P).includes(pg.id), `podgląd bez identyfikatora strony ${pg.id.slice(0, 8)}…`);
      // zła odpowiedź; final (P2-2): każda próba zużywa zgodę z podglądu, więc przed każdą jest nowy podgląd
      const freshToken = async () => { await H.dash(S.base, '/api/backups/preview', { name: bk.name }); return (await waitJob(S.base)).job.result.token; };
      for (const confirm of ['tak', 'TAK ', 'YES', '', undefined]) {
        const r = await H.dash(S.base, '/api/backups/restore', { name: bk.name, confirm, token: await freshToken() });
        assert.equal(r.status, 400, `confirm=${confirm}`); assert.equal(r.j.code, 'confirm-required');
      }
      assert.equal((await A.writes()).length, w0);
      const before = readdirSync(path.join(dir, 'backups')).length;
      // przywrócenie
      const rs = await H.dash(S.base, '/api/backups/restore', { name: bk.name, confirm: 'TAK', token: await freshToken() });
      assert.equal(rs.status, 200, JSON.stringify(rs.j)); assert.equal(rs.j.started, true);
      j = await waitJob(S.base);
      assert.equal(j.job.error, null, JSON.stringify(j.job.error));
      assert.equal(j.job.kind, 'restore'); assert.equal(j.job.result.restored, 2); assert.equal(j.job.done, 2); assert.equal(j.job.total, 2);
      const safety = j.job.result.safety;
      assert.ok(safety && safety !== bk.name, 'kopia bieżącego stanu przed przywróceniem');
      assert.equal(readdirSync(path.join(dir, 'backups')).length, before + 1);
      const sm = JSON.parse(readFileSync(path.join(dir, 'backups', safety, 'manifest.json'), 'utf8'));
      assert.equal(sm.reason, 'before-restore'); assert.equal(sm.restoreFrom, bk.name);
      // kopia bezpieczeństwa ma stan sprzed przywrócenia (R = 99)
      const st = JSON.parse(readFileSync(path.join(dir, 'backups', safety, 'trades.json'), 'utf8'));
      assert.equal(st.pages.find((x) => x.id === p1.id).properties.R.number, 99);
      const after = await A.get('/__test/pages?ds=trades');
      assert.notEqual(after.find((x) => x.id === p1.id).p.R.number, 99, 'wartość pola przywrócona');
      assert.ok(after.some((x) => x.id === p2.id), 'strona wyjęta z kosza');
      // ponowny podgląd: bez zmian
      await H.dash(S.base, '/api/backups/preview', { name: bk.name });
      j = await waitJob(S.base);
      assert.equal(j.job.result.summary.pages, 0);
      noSecrets(j, 'po przywróceniu');
      // brak usuwania kopii
      for (const p of ['/api/backups/delete', '/api/backups/remove']) assert.equal((await H.dash(S.base, p, { name: bk.name })).status, 405, `${p}: brak trasy usuwania`);
      assert.ok(existsSync(path.join(dir, 'backups', bk.name)));
      assert.ok(!/secret_atrapa/.test(S.p.out + S.p.err), 'log serwera bez tokenu');
    } finally { S.stop(); A.stop(); }
  });

  test('backtest-N5: słowo potwierdzenia po angielsku YES, restart i zatrzymanie czekają na koniec kopii (busyReason)', async () => {
    const A = await H.atrapa(4843);
    const dir = H.tmp();
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ lang: 'en', onboarded: true }));
    // atrapa odpowiada wolno na zapytania baz: kopia trwa, a restart w tym czasie ma 409
    await A.post('/__test/delay', { match: '/query', ms: 1500 });
    const S = await H.server(4844, NOTION_ENV(A, dir));
    try {
      const j0 = await (await fetch(`${S.base}/api/backups`)).json();
      assert.equal(j0.word, 'YES');
      await H.dash(S.base, '/api/backups/create', {});
      const r = await H.dash(S.base, '/api/restart', {});
      assert.equal(r.status, 409, JSON.stringify(r.j)); assert.equal(r.j.code, 'running');
      const s = await H.dash(S.base, '/api/shutdown', {});
      assert.equal(s.status, 409);
      await waitJob(S.base, 30000);
    } finally { S.stop(); A.stop(); }
  });

  test('backtest-N5: README i UI: przywracanie z Ustawień opisane, kopie bez przycisku usuwania, nazwy kopii nie trafiają do ścieżek po stronie przeglądarki', () => {
    const ui = src('public/js/ust-diag.js');
    assert.match(ui, /\/api\/backups\/create/); assert.match(ui, /\/api\/backups\/preview/); assert.match(ui, /\/api\/backups\/restore/);
    assert.doesNotMatch(ui, /backups\/(delete|remove)/);
    for (const f of ['README.md', 'README.en.md']) assert.match(src(f), /Kopie i diagnostyka|Backups and diagnostics/, `${f}: przywracanie z Ustawień`);
  });

  // ---------- ekran (Chrome/Edge headless, scenariusz testy/scen-N5.js) ----------
  const runs = {};
  function pageResult(narrow) {
    runs[narrow] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const base = narrow ? 4847 : 4845;
      const A = await H.atrapa(base);
      const dir = H.tmp();
      const S = await H.server(base + 1, NOTION_ENV(A, dir));
      try {
        const opt = narrow ? { width: 375, height: 812, mobile: true } : { width: 1920, height: 1080 };
        // gdy strona zrobi kopię ręczną, „w Notion” zmienia się jeden wpis (podgląd ma co pokazać)
        let stop = false;
        const watcher = (async () => {
          const bdir = path.join(dir, 'backups');
          while (!stop) {
            const manual = existsSync(bdir) && readdirSync(bdir).some((n) => { try { return JSON.parse(readFileSync(path.join(bdir, n, 'manifest.json'), 'utf8')).reason === 'manual'; } catch { return false; } });
            if (manual) { const pages = await A.get('/__test/pages?ds=trades'); await A.post('/__test/notion-edit', { id: pages[1].id, set: { R: 77 } }); return; }
            await H.sleep(150);
          }
        })();
        const txt = await P.cdpPage(S.base + '/', { ...opt, timeoutMs: 180_000, until: "window.__thq && document.querySelector('#view .page-head')", extract: src('testy/scen-N5.js') });
        stop = true; await watcher;
        const res = JSON.parse(txt);
        res.backups = existsSync(path.join(dir, 'backups')) ? readdirSync(path.join(dir, 'backups')) : [];
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
  test('backtest-N5: ekran Kopie baz Notion: pusta lista z opisem, „Utwórz kopię teraz” z postępem, wiersz z datą, powodem, liczbami i rozmiarem, bez usuwania (1920 px)', async () => { await tagged('lista', 5); });
  test('backtest-N5: ekran: podgląd przywracania (co się zmieni), złe słowo bez żądania, „TAK” przywraca z kopią bieżącego stanu i wynikiem', async () => { const r = await tagged('przywroc', 6); assert.ok(r.backups.length >= 2, 'kopia ręczna i kopia przed przywróceniem'); });
  test('backtest-N5: ekran 375 px: lista kopii, podgląd i potwierdzenie bez poziomego przewijania', async () => { await tagged('lista', 5, true); await tagged('przywroc', 6, true); });
};
