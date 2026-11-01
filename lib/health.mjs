// „Pierwsze kroki”, część A: sprawdzenie gotowości instalacji. Wszystkie sprawdzenia tylko czytają.
// Wyjątek: próba zapisu wysyła do Notion żądania, które celowo nie przechodzą walidacji (nieistniejące pole), więc nic nie powstaje.
// Readiness checks (read-only). The write probe sends requests that fail validation on purpose, so nothing is created.
import { DBS, resolveRoles, ROLES } from './roles.mjs';
import { loc } from './schema.mjs';
import { readDataSource, listViews, ensureProperty, ensureView, removeDemo, pageIdFromUrl } from './workspace.mjs';
import { loadMigrations, runMigrations } from './migrate.mjs';
import { findSettings, ensureSettingsBlock, rootIdOf } from './sync.mjs';

const PROBE = '__ltj_probe_nie_istnieje__';
// N6 (1.6.0): Gotowość, grupa „Dane rynkowe” (§4.5): mniej niż tyle wolnego miejsca na dysku z danymi to uwaga; kredyt wygasający w tylu dniach to uwaga
export const LOW_DISK_BYTES = 2 * 1024 ** 3;
export const CREDIT_WARN_DAYS = 30;

// Stan danych rynkowych bez sieci: { databento: { key, credit, nq1sDaily, queue }, fred, finnhub, freeBytes, now } → { status, items }.
// Bez klucza Databento grupa jest informacją (dashboard działa, wykresy bez nowych świec); klucz bez kredytu, wygasły albo wygasający kredyt,
// zablokowana kolejka i mało miejsca to uwaga. FRED i Finnhub są opcjonalne (informacja albo ok).
export function marketCheck({ databento = {}, fred = false, finnhub = false, freeBytes = null, now = Date.now() } = {}) {
  const items = [];
  const key = !!databento.key;
  items.push({ id: 'databento', status: key ? 'ok' : 'info', code: key ? '' : 'no-key' });
  const c = databento.credit || {};
  if (key) {
    if (!c.configured) items.push({ id: 'credit', status: 'warn', code: 'no-credit' });
    else if (c.expired) items.push({ id: 'credit', status: 'warn', code: 'expired', expires: c.expires });
    else {
      const days = Math.ceil((Date.parse(`${c.expires}T00:00:00Z`) - now) / 86400000);
      const base = { id: 'credit', expires: c.expires, startUsd: c.startUsd, leftUsd: c.leftUsd, days };
      items.push(days <= CREDIT_WARN_DAYS ? { ...base, status: 'warn', code: 'expiring' } : c.leftUsd <= 0 ? { ...base, status: 'warn', code: 'empty' } : { ...base, status: 'ok', code: '' });
    }
  }
  const q = databento.queue || {};
  if (q.blocked) items.push({ id: 'queue', status: 'warn', code: 'blocked', blocked: q.blocked, pending: q.pending || 0 });
  else if (q.pending) items.push({ id: 'queue', status: 'info', code: 'pending', blocked: 0, pending: q.pending });
  if (Number.isFinite(freeBytes)) items.push({ id: 'disk', status: freeBytes < LOW_DISK_BYTES ? 'warn' : 'ok', code: freeBytes < LOW_DISK_BYTES ? 'low' : '', freeBytes });
  items.push({ id: 'fred', status: fred ? 'ok' : 'info', code: fred ? '' : 'no-key' });
  items.push({ id: 'finnhub', status: finnhub ? 'ok' : 'info', code: finnhub ? '' : 'no-key' });
  const status = items.some((i) => i.status === 'warn') ? 'warn' : key ? 'ok' : 'info';
  return { status, items, nq1sDaily: !!databento.nq1sDaily };
}
const nodeOk = () => Number(process.versions.node.split('.')[0]) >= 22;

// probeWrite: false = szybkie sprawdzenie w tle przy starcie dashboardu, bez prób zapisu do Notion
// market (N6): funkcja zwracająca stan danych rynkowych bez sieci (serwer); brak = bez grupy „Dane rynkowe”
export async function fullCheck({ notion, sources, config, schema, schemaVersion, host, updateInfo, rootUrl, t, probeWrite = true, market = null }) {
  const checks = [];
  const add = (id, status, detail, data = {}) => checks.push({ id, status, detail, ...data });
  add('node', nodeOk() ? 'ok' : 'error', `Node ${process.versions.node}`);
  // token
  let tokenOk = false;
  if (!notion.hasToken) add('token', 'error', t('Brak NOTION_TOKEN w pliku .env.'), { code: 'missing' });
  else {
    try { const me = await notion.get('/v1/users/me'); tokenOk = true; add('token', 'ok', me.name || me.bot?.workspace_name || 'Notion', { name: me.name || '' }); }
    catch (e) { add('token', 'error', e.message, { code: e.status === 401 ? 'invalid' : 'error' }); }
  }
  // strona główna
  const rootId = config.rootPageId || pageIdFromUrl(rootUrl);
  if (!tokenOk) add('root', 'error', t('Najpierw popraw token.'), { code: 'blocked' });
  else if (!rootId) add('root', 'warn', t('Brak adresu strony głównej (NOTION_ROOT_URL w .env).'), { code: 'none' });
  else {
    try { const p = await notion.get(`/v1/pages/${rootId}`); const tp = Object.values(p.properties || {}).find((x) => x.type === 'title'); add('root', 'ok', (tp?.title || []).map((x) => x.plain_text).join('') || t('Strona główna'), { url: p.url }); }
    catch (e) { add('root', 'error', e.status === 404 ? t('Integracja nie ma dostępu do strony głównej dziennika.') : e.message, { code: e.status === 404 ? 'noaccess' : 'error' }); }
  }
  // bazy
  const dbs = [], props = {};
  for (const db of DBS) {
    const title = loc(schema.databases[db]?.title, config.lang);
    if (!sources[db]) { dbs.push({ db, title, status: 'error', code: 'missing', detail: t('Brak identyfikatora bazy w .env ({key}).', { key: `DS_${db.toUpperCase()}` }) }); continue; }
    if (!tokenOk) { dbs.push({ db, title, status: 'error', code: 'blocked', detail: t('Najpierw popraw token.') }); continue; }
    try {
      const r = await readDataSource(notion, sources[db]);
      props[db] = r;
      const pages = await notion.queryAll(sources[db]);
      dbs.push({ db, title, status: 'ok', count: pages.filter((p) => !p.in_trash && !p.archived).length, dbId: r.dbId, pages });
    } catch (e) { dbs.push({ db, title, status: 'error', code: e.status === 404 ? 'noaccess' : 'error', detail: e.status === 404 ? t('Nie znalazłem bazy albo integracja nie ma do niej dostępu.') : e.message }); }
  }
  add('databases', dbs.every((d) => d.status === 'ok') ? 'ok' : 'error', '', { items: dbs.map(({ pages, ...d }) => d) });
  // schemat: role wymagane (błąd), role ze schematu (uwaga), wersja schematu
  const missing = [];
  for (const db of DBS) {
    if (!props[db]) continue;
    const { missing: req, map } = resolveRoles(db, props[db].props, config.fields?.[db] || {});
    for (const r of req) missing.push({ db, role: r, name: loc(schema.databases[db]?.properties?.[r]?.name, config.lang) || r, required: true });
    for (const [r, spec] of Object.entries(schema.databases[db]?.properties || {})) {
      if (map[r] || req.includes(r) || !ROLES[db]?.[r]) continue;
      if (spec.synced) continue;
      missing.push({ db, role: r, name: loc(spec.name, config.lang), required: false });
    }
  }
  const stale = (Number(config.schemaVersion) || 0) < schemaVersion;
  const schemaStatus = !Object.keys(props).length ? 'error' : missing.some((m) => m.required) ? 'error' : missing.length || stale ? 'warn' : 'ok';
  add('schema', schemaStatus, '', { missing, installed: Number(config.schemaVersion) || 0, current: schemaVersion, fixable: missing.length > 0 || stale });
  // widoki ze schematu
  const viewsMissing = [];
  for (const db of DBS) {
    const dbId = props[db]?.dbId;
    if (!dbId) continue;
    let have = [];
    try { have = await listViews(notion, dbId); } catch { continue; }
    const names = new Set(have.map((v) => String(v.name || '').toLowerCase()));
    for (const v of schema.databases[db]?.views || []) {
      const n = loc(v.name, config.lang);
      if (!names.has(n.toLowerCase()) && !have.some((h) => h.id === config.views?.[db]?.[v.key])) viewsMissing.push({ db, name: n, type: v.type });
    }
  }
  add('views', viewsMissing.length ? 'warn' : 'ok', '', { missing: viewsMissing });
  // blok ustawień (synchronizacja między urządzeniami)
  if (rootId && tokenOk) {
    try { const f = await findSettings(notion, rootId, config.settingsBlock); add('settings', f?.codeId ? 'ok' : 'warn', '', { code: f?.codeId ? '' : 'missing', enabled: config.syncEnabled !== false }); }
    catch (e) { add('settings', 'warn', e.message, { code: 'error' }); }
  }
  // zapis: żądania, które Notion odrzuca walidacją (400), jeśli integracja ma uprawnienia; 403 oznacza brak uprawnień
  if (!probeWrite) add('write', 'info', t('Sprawdzane w pełnym teście gotowości.'), { code: 'skipped' });
  else if (tokenOk && sources.trades && props.trades) {
    const probe = async (fn) => { try { await fn(); return 'unexpected'; } catch (e) { return e.status === 400 ? 'ok' : e.status === 403 ? 'denied' : 'error:' + e.message; } };
    const ins = await probe(() => notion.post('/v1/pages', { parent: { type: 'data_source_id', data_source_id: sources.trades }, properties: { [PROBE]: { number: 1 } } }));
    const first = dbs.find((d) => d.db === 'trades')?.pages?.[0];
    const upd = first ? await probe(() => notion.patch(`/v1/pages/${first.id}`, { properties: { [PROBE]: { number: 1 } } })) : 'ok';
    const st = ins === 'ok' && upd === 'ok' ? 'ok' : ins === 'denied' || upd === 'denied' ? 'error' : 'warn';
    add('write', st, st === 'ok' ? t('Integracja może dodawać i edytować wpisy.') : st === 'error' ? t('Integracja nie ma uprawnień do zapisu (Insert content i Update content).') : t('Nie udało się sprawdzić zapisu.'), { insert: ins, update: upd });
  } else add('write', 'error', t('Najpierw popraw token i bazy.'), { code: 'blocked' });
  add('security', host === '127.0.0.1' ? 'ok' : 'error', host);
  if (market) { const m = marketCheck(await market()); add('market', m.status, '', { items: m.items, nq1sDaily: m.nq1sDaily }); }
  const u = await updateInfo();
  add('update', u.disabled ? 'info' : u.available ? 'info' : u.offline ? 'warn' : 'ok', u.current, { latest: u.latest || '', available: !!u.available, disabled: !!u.disabled, offline: !!u.offline });
  // wpisy DEMO
  let demo = 0;
  for (const d of dbs) for (const p of d.pages || []) {
    const tp = Object.values(p.properties || {}).find((x) => x.type === 'title');
    if ((tp?.title || []).map((x) => x.plain_text ?? x.text?.content ?? '').join('').startsWith('DEMO · ')) demo++;
  }
  add('demo', 'info', '', { count: demo });
  const issues = checks.filter((c) => c.status === 'error' || c.status === 'warn').length;
  return { checks, summary: { ok: issues === 0, issues } };
}

// „Uzupełnij brakujące pola”: lokalne migracje + brakujące pola i widoki ze schematu. Tylko dodawanie.
// Pola-relacje dwustronne i formuły nie są dodawane automatycznie (zmieniłyby drugą bazę / zależą od innych pól): lista „ręcznie”.
export async function fixSchema({ notion, sources, config, schema, migrationsDir, dryRun, persist, rootUrl }) {
  const ctx = { notion, sources, config, lang: config.lang === 'en' ? 'en' : 'pl', schema, dryRun, rootUrl };
  const migrations = await loadMigrations(migrationsDir);
  const m = await runMigrations(ctx, migrations, { persist });
  const changes = [...m.changes], manual = [];
  for (const db of DBS) {
    if (!sources[db]) continue;
    const { props } = await readDataSource(notion, sources[db]);
    const { map } = resolveRoles(db, props, config.fields?.[db] || {});
    for (const [role, spec] of Object.entries(schema.databases[db]?.properties || {})) {
      if (map[role] || !ROLES[db]?.[role] || spec.synced) continue;
      if (spec.type === 'formula' || spec.type === 'relation' || spec.type === 'rollup') { manual.push({ db, kind: 'property', name: loc(spec.name, ctx.lang), detail: spec.type }); continue; }
      changes.push(await ensureProperty(ctx, db, role, spec));
    }
    for (const v of schema.databases[db]?.views || []) {
      try { changes.push(await ensureView(ctx, db, v)); } catch (e) { changes.push({ db, kind: 'view', name: loc(v.name, ctx.lang), detail: e.message, status: 'conflict' }); }
    }
  }
  changes.push({ db: 'root', ...(await ensureSettingsBlock(notion, rootIdOf(config, rootUrl), ctx.lang, { dryRun, saved: config.settingsBlock })) });
  if (!dryRun) persist?.();
  // ta sama zmiana z migracji i ze schematu (np. pole Wyjście) tylko raz
  const seen = new Set();
  const uniq = changes.filter((c) => c.status !== 'skip').filter((c) => { const k = `${c.db}|${c.kind}|${c.name}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { changes: uniq, manual };
}

export async function demoRemoval({ notion, sources, dryRun }) {
  return removeDemo(notion, sources, { dryRun });
}
