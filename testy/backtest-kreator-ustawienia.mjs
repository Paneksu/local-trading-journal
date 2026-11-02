// kreator-ustawienia (1.6.1): kreator szuka istniejącego bloku „Ustawienia dashboardu” w całym zakresie integracji, a nie tylko na stronie z bazami,
// oraz czytelny opis stron w kroku „Strona” (bazy JustJournal na stronie, strona nadrzędna).
// [U] 1.11.2026 u użytkownika blok ustawień leżał na innej stronie niż bazy, więc kreator założył nowy, pusty blok
// Wyłącznie atrapa Notion; prawdziwe Notion nie dostaje żądań.
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const TOKEN = 'ntn_dobry_token_testowy_123456';
  const AUTH = { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN };
  const nextPort = (() => { let p = 4970; return () => p++; })();
  const api = (A, method, p, body) => fetch(A.base + p, { method, headers: AUTH, ...(body ? { body: JSON.stringify(body) } : {}) }).then((r) => r.json().then((j) => ({ status: r.status, j })));

  // dziennik zbudowany kreatorem na atrapie (bez bloku ustawień: usuwamy ten, który zakłada kreator, jak u użytkownika, gdzie blok leży gdzie indziej)
  async function journalAtrapa({ dropOwn = true } = {}) {
    const A = await H.atrapa(nextPort(), { ATRAPA_PUSTA: '1', ATRAPA_NIEUDOSTEPNIONA: '1', ATRAPA_TOKEN: TOKEN });
    await A.post('/__test/share', { shared: true });
    const S0 = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: H.tmp() });
    let pageId;
    try {
      await H.dash(S0.base, '/api/setup/token', { token: TOKEN });
      const pg = (await H.dash(S0.base, '/api/setup/pages', {})).j.pages[0];
      await H.dash(S0.base, '/api/setup/create', { pageId: pg.id, lang: 'pl', demo: false });
      for (let i = 0; i < 400; i++) {
        const j = await (await fetch(S0.base + '/api/setup/status')).json();
        if (j.error) throw new Error(j.error.message);
        if (j.done) break;
        await H.sleep(50);
      }
      pageId = (await H.dash(S0.base, '/api/setup/pages', {})).j.pages.find((p) => p.journal).id;
    } finally { S0.stop(); }
    if (dropOwn) { const own = await toggleOf(A, pageId); assert.ok(own, 'kreator założył własny blok'); assert.equal((await api(A, 'DELETE', `/v1/blocks/${own.id}`)).status, 200); }
    return { A, pageId };
  }
  async function toggleOf(A, pageId) {
    const r = await api(A, 'GET', `/v1/blocks/${pageId}/children`);
    return r.j.results.find((b) => b.type === 'toggle');
  }
  // strona z blokiem ustawień (toggle + kod JSON) utworzona przez API atrapy pod stroną nadrzędną
  async function pageWithSettings(A, title, updatedAt, settings) {
    const { settingsBlock, emptyData } = await imp('lib/sync.mjs');
    const data = { ...emptyData(), updatedAt, deviceId: 'dev-' + title, settings };
    const r = await api(A, 'POST', '/v1/pages', { parent: { type: 'page_id', page_id: PARENT }, properties: { title: { title: [{ type: 'text', text: { content: title } }] } }, children: [settingsBlock('pl', data)] });
    assert.equal(r.status, 200, title);
    return r.j;
  }
  const newComputer = async (A, dir = H.tmp()) => {
    const S = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    await H.dash(S.base, '/api/setup/token', { token: TOKEN });
    return { S, dir };
  };

  test('kreator-ustawienia: połączenie dziennika podpina istniejący blok ustawień z innej strony (najnowszy z kilku), nie zakłada nowego', async () => {
    const { A, pageId } = await journalAtrapa();
    const { S, dir } = await newComputer(A);
    try {
      const old = await pageWithSettings(A, 'Stare ustawienia', '2026-10-01T10:00:00.000Z', { theme: 'platinum' });
      const fresh = await pageWithSettings(A, 'Nowe ustawienia', '2026-10-20T10:00:00.000Z', { theme: 'onyx' });
      const freshToggle = await toggleOf(A, fresh.id);
      assert.ok(freshToggle && await toggleOf(A, old.id));
      const w0 = (await A.writes()).length;
      const con = await H.dash(S.base, '/api/setup/connect', { pageId });
      assert.equal(con.status, 200, JSON.stringify(con.j));
      assert.equal(con.j.settings.state, 'adopted', JSON.stringify(con.j.settings));
      assert.equal(con.j.settings.pageTitle, 'Nowe ustawienia');
      assert.equal(con.j.settings.others, 1);
      assert.equal(con.j.settings.updatedAt, '2026-10-20T10:00:00.000Z');
      assert.equal((await A.writes()).length, w0, 'połączenie niczego nie zapisuje w Notion (żadnego nowego bloku)');
      assert.equal(await toggleOf(A, pageId), undefined, 'na stronie z bazami nie powstał pusty blok ustawień');
      const cfg = JSON.parse(readFileSync(path.join(dir, 'config.local.json'), 'utf8'));
      assert.equal(cfg.settingsBlock.toggleId, freshToggle.id);
      // synchronizacja czyta ustawienia z podpiętego bloku
      const pull = await (await fetch(`${S.base}/api/sync?force=1`)).json();
      assert.equal(pull.remote?.settings?.theme, 'onyx', JSON.stringify(pull));
      // naprawa schematu nie dopisuje bloku obok
      const fix = await H.dash(S.base, '/api/health/fix-all', { apply: true });
      assert.ok(!fix.j.changes.some((c) => c.db === 'root' && c.status === 'add'), JSON.stringify(fix.j.changes));
      assert.equal(await toggleOf(A, pageId), undefined, 'po naprawie nadal bez pustego bloku');
    } finally { S.stop(); A.stop(); }
  });

  test('kreator-ustawienia: blok na stronie z bazami ma pierwszeństwo, brak bloków nie psuje połączenia', async () => {
    const { A, pageId } = await journalAtrapa();
    const { S } = await newComputer(A);
    try {
      const none = await H.dash(S.base, '/api/setup/connect', { pageId });
      assert.equal(none.status, 200, JSON.stringify(none.j)); assert.equal(none.j.settings.state, 'none');
      // blok na stronie z bazami (dopisany jak robi to naprawa) wygrywa z nowszym z innej strony
      const { settingsBlock, emptyData } = await imp('lib/sync.mjs');
      await api(A, 'PATCH', `/v1/blocks/${pageId}/children`, { children: [settingsBlock('pl', { ...emptyData(), updatedAt: '2026-09-01T10:00:00.000Z', settings: { theme: 'own' } })] });
      await pageWithSettings(A, 'Inna strona', '2026-10-30T10:00:00.000Z', { theme: 'other' });
      const con = await H.dash(S.base, '/api/setup/connect', { pageId });
      assert.equal(con.j.settings.state, 'own', JSON.stringify(con.j.settings));
      assert.equal((await (await fetch(`${S.base}/api/sync?force=1`)).json()).remote?.settings?.theme, 'own');
    } finally { S.stop(); A.stop(); }
  });

  test('kreator-ustawienia: nowy dziennik nie zakłada drugiego bloku, gdy ustawienia już są w Notion', async () => {
    const A = await H.atrapa(nextPort(), { ATRAPA_PUSTA: '1', ATRAPA_NIEUDOSTEPNIONA: '1', ATRAPA_TOKEN: TOKEN });
    const { S, dir } = await newComputer(A);
    try {
      await A.post('/__test/share', { shared: true });
      const ex = await pageWithSettings(A, 'Moje ustawienia', '2026-10-20T10:00:00.000Z', { theme: 'onyx' });
      const exToggle = await toggleOf(A, ex.id);
      const target = (await H.dash(S.base, '/api/setup/pages', {})).j.pages.find((p) => p.id === PARENT);
      await H.dash(S.base, '/api/setup/create', { pageId: target.id, lang: 'pl', demo: false });
      let job;
      for (let i = 0; i < 400; i++) { job = await (await fetch(S.base + '/api/setup/status')).json(); if (job.done || job.error) break; await H.sleep(50); }
      assert.equal(job.done, true, JSON.stringify(job));
      const root = (await H.dash(S.base, '/api/setup/pages', {})).j.pages.find((p) => p.journal);
      assert.equal(await toggleOf(A, root.id), undefined, 'w nowym dzienniku nie ma drugiego bloku ustawień');
      const cfg = JSON.parse(readFileSync(path.join(dir, 'config.local.json'), 'utf8'));
      assert.equal(cfg.settingsBlock?.toggleId, exToggle.id);
      assert.equal((await (await fetch(`${S.base}/api/sync?force=1`)).json()).remote?.settings?.theme, 'onyx');
    } finally { S.stop(); A.stop(); }
  });

  test('kreator-ustawienia: lista stron opisuje, jakie bazy JustJournal leżą na stronie i gdzie strona jest', async () => {
    const { A, pageId } = await journalAtrapa();
    const { S } = await newComputer(A);
    try {
      await pageWithSettings(A, 'Podstrona', '2026-10-01T10:00:00.000Z', {});
      const pages = (await H.dash(S.base, '/api/setup/pages', {})).j.pages;
      const journal = pages.find((p) => p.id === pageId);
      assert.deepEqual([...journal.present].sort(), ['dziennik', 'finanse', 'konta', 'trades']);
      assert.equal(journal.parentTitle, 'Atrapa: strona nadrzędna');
      const sub = pages.find((p) => p.title === 'Podstrona');
      assert.deepEqual(sub.present, []);
      assert.equal(sub.parentTitle, 'Atrapa: strona nadrzędna');
      const top = pages.find((p) => p.id === PARENT);
      assert.equal(top.parentTitle, '');
    } finally { S.stop(); A.stop(); }
  });

  test('kreator-ustawienia: skan zatrzymany na limicie stron zgłasza truncated, a interfejs mówi, że przejrzano tylko część stron', async () => {
    const { discoverSettings, SETTINGS_SCAN_PAGES } = await imp('lib/sync.mjs');
    const pages = Array.from({ length: SETTINGS_SCAN_PAGES + 5 }, (_, i) => ({ id: 'p' + i, title: 'Strona ' + i, url: '' }));
    const asked = [];
    const notion = { get: async (p) => { asked.push(p); return { results: [], has_more: false }; } };
    const r = await discoverSettings(notion, pages);
    assert.equal(r.truncated, true); assert.equal(r.scanned, SETTINGS_SCAN_PAGES); assert.equal(asked.length, SETTINGS_SCAN_PAGES, 'tylko strony do limitu');
    const ok = await discoverSettings(notion, pages.slice(0, 3));
    assert.equal(ok.truncated, false);
    const ui = src('public/js/pierwsze-kroki.js');
    assert.match(ui, /st\.truncated/, 'interfejs pokazuje flagę truncated');
    const en = JSON.parse(src('public/i18n/en.json'));
    assert.ok(en['Przejrzano tylko {n} stron udostępnionych integracji, więc innego bloku ustawień mogło nie być widać.'], 'tłumaczenie EN komunikatu o skanie częściowym');
  });

  test('kreator-ustawienia: krok „Strona” pokazuje bazy i stronę nadrzędną, teksty mają tłumaczenie EN i nie mają myślników', async () => {
    const ui = src('public/js/pierwsze-kroki.js');
    assert.match(ui, /p\.present/, 'interfejs używa listy baz na stronie');
    assert.match(ui, /p\.parentTitle/, 'interfejs używa tytułu strony nadrzędnej');
    assert.match(ui, /rememberSettingsNote\(r\.settings\)/, 'po połączeniu informacja, który blok ustawień wybrano');
    const en = JSON.parse(src('public/i18n/en.json'));
    const keys = [...ui.matchAll(/\b(?:L|t|t\.p)\('((?:Bazy JustJournal|Jest tu już dziennik:|Niepełny dziennik|Leży w:|Podpięto ustawienia|Znaleziono więcej bloków)[^']*)'/g)].map((m) => m[1]);
    assert.ok(keys.length >= 5, 'nowe teksty znalezione w kodzie: ' + keys.length);
    for (const k of keys) {
      assert.ok(en[k], 'brak tłumaczenia EN: ' + k);
      assert.ok(!/[–—]/.test(k + en[k]), 'bez myślników jako pauz: ' + k);
    }
  });
};
