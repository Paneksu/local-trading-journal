// Obszar roboczy Notion: tworzenie od zera (setup.mjs) oraz bezpieczne, wyłącznie dodające operacje dla migracji (update.mjs).
// Notion workspace: create from scratch (setup.mjs) and safe, add-only operations for migrations (update.mjs).
//
// Zasada aktualizacji: wolno DODAĆ pole, DODAĆ opcję wyboru i DODAĆ widok. Nigdy: usunąć, zmienić typu, zmienić nazwy pola
// z danymi ani nadpisać wartości. Funkcje ensure* najpierw sprawdzają, czy zmiana jest potrzebna (idempotencja),
// a w trybie dryRun tylko ją opisują. Tylko patchDataSource zapisuje schemat i sprawdza, że żądanie niczego nie zabiera.
import { DBS, ROLES, resolveRoles } from './roles.mjs';
import { loc, optionName, propertyDef, viewBody, initialRoles, formulaRoles, expand } from './schema.mjs';
import { settingsBlock } from './sync.mjs';

export const DEMO_PREFIX = 'DEMO · ';
const rt = (s) => [{ type: 'text', text: { content: s } }];
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[’`]/g, "'");
const uuidOf = (s) => {
  const m = String(s || '').replace(/-/g, '').match(/([0-9a-f]{32})(?![0-9a-f])/i);
  return m ? m[1].replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5').toLowerCase() : null;
};
export const pageIdFromUrl = uuidOf;

// ---------- odczyt stanu ----------
export async function readDataSource(notion, dsId) {
  const ds = await notion.get(`/v1/data_sources/${dsId}`);
  return { ds, props: ds.properties || {}, dbId: ds.parent?.database_id || ds.database_parent?.database_id || null };
}

// Rola → aktualna nazwa pola. Najpierw role znane dashboardowi (ROLES, po identyfikatorach z config.local.json),
// potem role ze schematu i migracji (po nazwach PL i EN i typie).
export function roleNames(db, props, savedFields = {}, extraSpecs = {}) {
  const { map } = resolveRoles(db, props, savedFields);
  const out = Object.fromEntries(Object.entries(map).map(([r, v]) => [r, v.name]));
  for (const [role, spec] of Object.entries(extraSpecs)) {
    if (out[role]) continue;
    const hit = findBySpec(props, spec, savedFields[role]);
    if (hit) out[role] = hit[0];
  }
  return out;
}
function findBySpec(props, spec, savedId) {
  const entries = Object.entries(props);
  if (savedId) { const h = entries.find(([, p]) => p.id === savedId); if (h) return h; }
  const names = typeof spec.name === 'object' ? Object.values(spec.name) : [spec.name];
  return entries.find(([n, p]) => names.some((x) => norm(x) === norm(n)) && p.type === spec.type) || null;
}

// ---------- jedyny zapis schematu: tylko dodawanie ----------
// properties: { nazwa → definicja }. Dozwolone: nowe pole (nazwy jeszcze nie ma), te same opcje wyboru plus nowe,
// zmiana nazwy pola tylko w trakcie instalacji (allowRename, puste bazy). Wszystko inne to błąd, zanim cokolwiek trafi do Notion.
export async function patchDataSource(notion, dsId, properties, { allowRename = false } = {}) {
  const { props } = await readDataSource(notion, dsId);
  for (const [key, def] of Object.entries(properties)) {
    if (def === null) throw new Error(`Odmowa: usuwanie pola „${key}” jest zabronione / refusing to delete a property`);
    const cur = Object.entries(props).find(([n, p]) => n === key || p.id === key);
    if (!cur) continue; // nowe pole
    const [name, p] = cur;
    const type = Object.keys(def).find((k) => !['name', 'description'].includes(k));
    if (def.name && def.name !== name && !allowRename) throw new Error(`Odmowa: zmiana nazwy pola „${name}” / refusing to rename`);
    if (type && type !== p.type) throw new Error(`Odmowa: zmiana typu pola „${name}” (${p.type} → ${type}) / refusing to change type`);
    if (type === 'select' || type === 'multi_select') {
      const next = new Set((def[type].options || []).map((o) => o.name));
      const lost = (p[type]?.options || []).filter((o) => !next.has(o.name));
      if (lost.length) throw new Error(`Odmowa: usunięcie opcji ${lost.map((o) => o.name).join(', ')} / refusing to remove options`);
    } else if (type && !allowRename) throw new Error(`Odmowa: zmiana definicji istniejącego pola „${name}” / refusing to modify an existing property`);
  }
  return notion.patch(`/v1/data_sources/${dsId}`, { properties });
}

// ---------- operacje migracji (idempotentne) ----------
// Każda zwraca opis zmiany: { db, kind, name, detail, status: 'add' | 'skip' | 'conflict' }.
export async function ensureProperty(c, db, role, spec) {
  const { props } = await readDataSource(c.notion, c.sources[db]);
  const name = loc(spec.name, c.lang);
  const known = roleNames(db, props, c.config.fields?.[db], { [role]: spec });
  if (known[role]) return { db, kind: 'property', name: known[role], detail: spec.type, status: 'skip' };
  if (props[name]) return { db, kind: 'property', name, detail: `pole o tej nazwie ma typ ${props[name].type} / a property with this name already exists`, status: 'conflict' };
  const change = { db, kind: 'property', name, detail: spec.type, status: 'add' };
  if (c.dryRun) return change;
  const schema = { databases: { [db]: { properties: { [role]: spec } } } };
  const ctx = { lang: c.lang, names: { [db]: roleNames(db, props, c.config.fields?.[db], c.extraSpecs?.[db]) }, dsIds: c.sources };
  const out = await patchDataSource(c.notion, c.sources[db], { [name]: propertyDef(schema, db, role, ctx) });
  const id = out.properties?.[name]?.id;
  if (id) { c.config.fields = c.config.fields || {}; c.config.fields[db] = { ...(c.config.fields[db] || {}), [role]: id }; }
  return change;
}

export async function ensureOption(c, db, role, option) {
  const { props } = await readDataSource(c.notion, c.sources[db]);
  const names = roleNames(db, props, c.config.fields?.[db], c.extraSpecs?.[db]);
  const pname = names[role];
  const oname = loc(option.name, c.lang);
  if (!pname) return { db, kind: 'option', name: oname, detail: `brak pola dla roli ${role} / no property for role`, status: 'conflict' };
  const p = props[pname];
  const opts = p[p.type]?.options || [];
  const aliases = [option.token, ...(typeof option.name === 'object' ? Object.values(option.name) : [option.name])].filter(Boolean);
  if (opts.some((o) => aliases.some((a) => norm(a) === norm(o.name)))) return { db, kind: 'option', name: `${pname}: ${oname}`, detail: '', status: 'skip' };
  const change = { db, kind: 'option', name: `${pname}: ${oname}`, detail: '', status: 'add' };
  if (c.dryRun) return change;
  await patchDataSource(c.notion, c.sources[db], { [pname]: { [p.type]: { options: [...opts.map((o) => ({ name: o.name, color: o.color })), { name: oname, color: option.color || 'default' }] } } });
  return change;
}

export async function listViews(notion, dbId) {
  const out = [];
  let cursor;
  do {
    const q = new URLSearchParams({ database_id: dbId, page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) });
    const r = await notion.get(`/v1/views?${q}`);
    out.push(...(r.results || []));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  // lista może zawierać same identyfikatory: dociągamy nazwy
  for (const v of out) if (v.name === undefined && v.id) { try { Object.assign(v, await notion.get(`/v1/views/${v.id}`)); } catch { /* pomijamy */ } }
  return out;
}

export async function ensureView(c, db, view) {
  const { props, dbId } = await readDataSource(c.notion, c.sources[db]);
  const name = loc(view.name, c.lang);
  if (!dbId) return { db, kind: 'view', name, detail: 'brak identyfikatora bazy / no database id', status: 'conflict' };
  let views = [];
  try { views = await listViews(c.notion, dbId); } catch (e) { return { db, kind: 'view', name, detail: e.message, status: 'conflict' }; }
  const savedId = c.config.views?.[db]?.[view.key];
  if ((savedId && views.some((v) => v.id === savedId)) || views.some((v) => norm(v.name) === norm(name))) return { db, kind: 'view', name, detail: view.type, status: 'skip' };
  const change = { db, kind: 'view', name, detail: view.type, status: 'add' };
  if (c.dryRun) return change;
  const names = roleNames(db, props, c.config.fields?.[db], c.extraSpecs?.[db]);
  const ids = Object.fromEntries(Object.entries(names).map(([r, n]) => [r, props[n]?.id]));
  const ctx = { lang: c.lang, names: { [db]: names }, options: c.config.options };
  const schema = c.schema || { databases: {} };
  const out = await c.notion.post('/v1/views', viewBody(schema, db, view, ctx, { db: dbId, ds: c.sources[db], props: ids }));
  c.config.views = c.config.views || {};
  c.config.views[db] = { ...(c.config.views[db] || {}), [view.key]: out.id };
  return change;
}

// ---------- tworzenie obszaru roboczego od zera ----------
// state: postęp zapisywany po każdym kroku (save). Przerwana instalacja wznawia się od miejsca przerwania,
// bez drugiej strony i bez zdublowanych baz, widoków ani wpisów DEMO.
// rootTitle / rootBlocks: własny tytuł i treść strony głównej (np. szablon do duplikowania); domyślnie ze schematu
export async function createWorkspace(notion, { schema, parentPageId, lang, demo = false, log = () => {}, state = {}, save = () => {}, rootTitle = null, rootBlocks = null }) {
  const R = schema.rootPage;
  const L = (v) => loc(v, lang);
  state.dbIds ||= {}; state.dsIds ||= {}; state.headings ||= {}; state.views ||= {};
  state.lang = lang; state.parentPageId = parentPageId;
  log('page', L(R.title));
  if (!state.rootPageId) {
    const root = await notion.post('/v1/pages', {
      parent: { type: 'page_id', page_id: parentPageId },
      icon: { type: 'emoji', emoji: R.icon },
      properties: { title: { title: rt(rootTitle || L(R.title)) } },
      children: rootBlocks || [
        { object: 'block', type: 'paragraph', paragraph: { rich_text: rt(L(R.intro)) } },
        { object: 'block', type: 'paragraph', paragraph: { rich_text: [...rt(L(R.dashboardLabel)), { type: 'text', text: { content: R.dashboardUrl, link: { url: R.dashboardUrl } } }] } },
      ],
    });
    state.rootPageId = root.id; state.rootUrl = root.url; save(state);
  }
  // nazwy pól w języku instalacji (potrzebne do formuł i widoków)
  const ctx = { lang, names: {}, options: {}, dsIds: state.dsIds };
  for (const db of DBS) ctx.names[db] = Object.fromEntries(Object.entries(schema.databases[db].properties).map(([r, s]) => [r, L(s.name)]));
  for (const db of schema.order) {
    const spec = schema.databases[db];
    log('database', L(spec.title));
    if (!state.headings[db]) {
      await notion.patch(`/v1/blocks/${state.rootPageId}/children`, { children: [{ object: 'block', type: 'heading_2', heading_2: { rich_text: rt(`${spec.icon} ${L(spec.title)}`) } }] });
      state.headings[db] = true; save(state);
    }
    if (state.dsIds[db]) continue;
    const properties = Object.fromEntries(initialRoles(schema, db).map((r) => [ctx.names[db][r], propertyDef(schema, db, r, ctx)]));
    const out = await notion.post('/v1/databases', {
      parent: { type: 'page_id', page_id: state.rootPageId }, is_inline: true,
      title: rt(L(spec.title)), icon: { type: 'emoji', emoji: spec.icon },
      initial_data_source: { properties },
    });
    let dsId = out.data_sources?.[0]?.id;
    if (!dsId) dsId = (await notion.get(`/v1/databases/${out.id}`)).data_sources?.[0]?.id;
    if (!dsId) throw new Error('Notion nie zwrócił identyfikatora źródła danych / no data source id');
    state.dbIds[db] = out.id; state.dsIds[db] = dsId; save(state);
  }
  // blok ustawień synchronizowanych między urządzeniami (zwinięty, na końcu strony głównej)
  if (R.settingsBlock && !state.settingsBlock) {
    await notion.patch(`/v1/blocks/${state.rootPageId}/children`, { children: [settingsBlock(lang)] });
    state.settingsBlock = true; save(state);
  }
  // relacje zwrotne: Notion nadaje im własne nazwy, więc zmieniamy je na nazwy ze schematu (bazy są jeszcze puste)
  log('relations', '');
  for (const db of DBS) {
    for (const s of Object.values(schema.databases[db].properties)) {
      if (s.type !== 'relation' || !s.syncedRole) continue;
      const { props } = await readDataSource(notion, state.dsIds[s.to]);
      const want = ctx.names[s.to][s.syncedRole];
      if (props[want]) continue;
      const synced = Object.entries(props).find(([, p]) => p.type === 'relation' && p.relation?.data_source_id === state.dsIds[db]);
      if (synced) await patchDataSource(notion, state.dsIds[s.to], { [synced[1].id]: { name: want } }, { allowRename: true });
    }
  }
  // formuły po relacjach, po jednej (formuła może korzystać z poprzedniej); istniejące pomijamy
  for (const db of schema.order) {
    for (const r of formulaRoles(schema, db)) {
      log('formula', ctx.names[db][r]);
      const { props } = await readDataSource(notion, state.dsIds[db]);
      if (props[ctx.names[db][r]]) continue;
      await patchDataSource(notion, state.dsIds[db], { [ctx.names[db][r]]: propertyDef(schema, db, r, ctx) });
    }
  }
  // identyfikatory pól po rolach (config.local.json)
  const fields = {}, propIds = {};
  for (const db of DBS) {
    const { props } = await readDataSource(notion, state.dsIds[db]);
    fields[db] = {}; propIds[db] = {};
    for (const [r, n] of Object.entries(ctx.names[db])) if (props[n]) { fields[db][r] = props[n].id; propIds[db][r] = props[n].id; }
  }
  // widoki: typ nieobsługiwany przez API (albo błąd) nie przerywa instalacji, trafia na listę pominiętych
  const skippedViews = [];
  for (const db of schema.order) {
    state.views[db] ||= {};
    let existing = null;
    for (const v of schema.databases[db].views || []) {
      if (state.views[db][v.key]) continue;
      if (!existing) { try { existing = await listViews(notion, state.dbIds[db]); } catch { existing = []; } }
      const hit = existing.find((x) => norm(x.name) === norm(L(v.name)));
      if (hit) { state.views[db][v.key] = hit.id; save(state); continue; }
      try {
        const out = await notion.post('/v1/views', viewBody(schema, db, v, ctx, { db: state.dbIds[db], ds: state.dsIds[db], props: propIds[db] }));
        state.views[db][v.key] = out.id; save(state);
        log('view', `${L(schema.databases[db].title)}: ${L(v.name)}`);
      } catch (e) {
        if (e.status === 429 || e.status >= 500) throw e; // chwilowy błąd: instalację da się wznowić
        skippedViews.push({ db, name: L(v.name), type: v.type, reason: e.message });
      }
    }
  }
  if (demo && !state.demoDone) {
    log('demo', 'DEMO');
    await addDemo(notion, { schema, lang, ctx });
    state.demoDone = true; save(state);
  }
  return { rootPageId: state.rootPageId, rootUrl: state.rootUrl, dsIds: state.dsIds, dbIds: state.dbIds, fields, views: state.views, skippedViews };
}


// ---------- wpisy DEMO ----------
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function lastWeekdays(n) {
  const out = [];
  const d = new Date();
  while (out.length < n) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0 && d.getDay() !== 6) out.push(dayKey(d)); }
  return out.reverse();
}
export async function addDemo(notion, { schema, lang, ctx, log = () => {} }) {
  const N = ctx.names, O = (db, role, token) => optionName(schema, db, role, token, ctx);
  // wpis o tym samym tytule już jest (wznowiona instalacja): nie tworzymy drugiego
  const existing = {};
  for (const db of DBS) {
    existing[db] = new Map();
    for (const p of await notion.queryAll(ctx.dsIds[db])) {
      const tp = Object.values(p.properties || {}).find((x) => x.type === 'title');
      existing[db].set((tp?.title || []).map((x) => x.plain_text ?? x.text?.content ?? '').join(''), p);
    }
  }
  const page = async (db, props) => {
    const tp = Object.values(props).find((x) => x.title);
    const hit = existing[db].get(tp?.title?.[0]?.text?.content);
    if (hit) return hit;
    const out = await notion.post('/v1/pages', { parent: { type: 'data_source_id', data_source_id: ctx.dsIds[db] }, properties: props });
    existing[db].set(tp?.title?.[0]?.text?.content, out);
    return out;
  };
  const title = (db, role, s) => ({ [N[db][role]]: { title: rt(DEMO_PREFIX + s) } });
  const sel = (db, role, name) => ({ [N[db][role]]: { select: { name } } });
  const num = (db, role, v) => ({ [N[db][role]]: { number: v } });
  const date = (db, role, v) => ({ [N[db][role]]: { date: v.length > 10 ? { start: v, time_zone: 'Europe/Warsaw' } : { start: v } } });
  log('demo', 'DEMO');
  const days = lastWeekdays(15);
  const firmLucid = 'Lucid Trading', firmApex = 'Apex Trader Funding';
  const k1 = await page('konta', { ...title('konta', 'name', 'Lucid 50k #1'), ...sel('konta', 'status', O('konta', 'status', 'Funded')), ...sel('konta', 'firma', firmLucid), ...num('konta', 'size', 50000), ...date('konta', 'bought', days[0]) });
  const k2 = await page('konta', { ...title('konta', 'name', 'Apex 50k #1'), ...sel('konta', 'status', O('konta', 'status', 'Challenge')), ...sel('konta', 'firma', firmApex), ...num('konta', 'size', 50000), ...date('konta', 'bought', days[2]) });
  const rel = (db, role, ids) => ({ [N[db][role]]: { relation: ids.map((id) => ({ id })) } });
  const fin = [['Zakup challenge', firmLucid, 150, 0, k1], ['Aktywacja / opłata', firmLucid, 85, 1, k1], ['Zakup challenge', firmApex, 147, 2, k2], ['Payout', firmLucid, 900, 12, k1]];
  for (const [kind, firma, amount, di, k] of fin) {
    await page('finanse', { ...title('finanse', 'name', `${O('finanse', 'kind', kind)} · ${firma}`), ...sel('finanse', 'kind', O('finanse', 'kind', kind)), ...num('finanse', 'amount', amount), ...date('finanse', 'date', days[di]), ...sel('finanse', 'firma', firma), ...rel('finanse', 'konto', [k.id]) });
  }
  const trades = [
    ['Live', 'NQ', 'Long', 'Breakout', 1.8, 450, '15:35', '15:58'], ['Live', 'ES', 'Short', 'Pullback', -1, -250, '15:42', '16:05'],
    ['Live', 'NQ', 'Long', 'Pullback', 2.4, 600, '16:10', '16:52'], ['Live', 'NQ', 'Short', 'Reversal', 0.05, 12, '15:31', '15:40'],
    ['Live', 'ES', 'Long', 'Range', -0.6, -150, '17:05', '17:20'], ['Live', 'NQ', 'Long', 'Breakout', 1.2, 300, '15:48', '16:20'],
    ['Backtest', 'NQ', 'Long', 'Breakout', 2, null, '15:36', '16:02'], ['Backtest', 'ES', 'Short', 'Reversal', -1, null, '16:30', '16:44'],
    ['Backtest', 'NQ', 'Long', 'Pullback', 3, null, '15:50', '16:40'], ['Niewzięty', 'NQ', 'Long', 'Breakout', 1.5, null, '15:33', null],
  ];
  const sessions = (schema.databases.trades.properties.session.options || []).map((o) => loc(o.name, lang));
  let i = 0;
  for (const [typ, ins, dir, setup, r, pnl, t1, t2] of trades) {
    const d = days[3 + i];
    const props = {
      ...title('trades', 'title', `${ins} ${dir.toLowerCase()} ${setup} #${i + 1}`), ...sel('trades', 'typ', O('trades', 'typ', typ)), ...date('trades', 'date', `${d}T${t1}:00`),
      ...sel('trades', 'instrument', ins), ...sel('trades', 'dir', dir), ...sel('trades', 'setup', setup), ...sel('trades', 'session', sessions[2] || sessions[0]),
      ...num('trades', 'r', r),
    };
    if (t2) Object.assign(props, date('trades', 'exit', `${d}T${t2}:00`));
    if (pnl != null) Object.assign(props, num('trades', 'pnl', pnl), rel('trades', 'konta', [i % 2 ? k2.id : k1.id]));
    if (typ === 'Niewzięty') Object.assign(props, sel('trades', 'reason', loc(schema.databases.trades.properties.reason.options[0].name, lang)));
    await page('trades', props);
    i++;
  }
  await page('dziennik', { ...title('dziennik', 'name', days[14]), ...date('dziennik', 'date', days[14]), [N.dziennik.notes]: { rich_text: rt(lang === 'en' ? 'Plan: wait for the open, max 2 trades.' : 'Plan: czekam na otwarcie, maks. 2 trade\'y.') } });
}

// Usuwa (przenosi do kosza Notion) tylko wpisy, których tytuł zaczyna się od „DEMO · ”. Zwraca liczbę.
export async function removeDemo(notion, sources, { dryRun = false } = {}) {
  let n = 0;
  const found = [];
  for (const db of DBS) {
    if (!sources[db]) continue;
    const pages = await notion.queryAll(sources[db]);
    for (const p of pages) {
      if (p.archived || p.in_trash) continue;
      const tp = Object.values(p.properties || {}).find((x) => x.type === 'title');
      const text = (tp?.title || []).map((t) => t.plain_text ?? t.text?.content ?? '').join('');
      if (!text.startsWith(DEMO_PREFIX)) continue;
      found.push({ db, id: p.id, title: text });
      if (!dryRun) await notion.patch(`/v1/pages/${p.id}`, { in_trash: true });
      n++;
    }
  }
  return { n, found };
}

void ROLES; void expand;
