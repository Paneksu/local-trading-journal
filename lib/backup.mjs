// Kopia zapasowa 4 baz Notion do backups/<data>/ (JSON: schemat i strony z wartościami pól) oraz plan i wykonanie przywracania.
// Przywracanie nigdy nie usuwa: przywraca wartości pól, wyjmuje z kosza i odtwarza brakujące strony z kopii.
// Backup of the 4 databases to backups/<date>/ (JSON) and a restore that never deletes anything.
import { writeFileSync, readFileSync, readdirSync, existsSync, statSync, openSync, readSync, closeSync, renameSync } from 'node:fs';
import path from 'node:path';
import { DBS } from './roles.mjs';
import { ensureDir } from './env.mjs';

const stamp = () => new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z');

// final (review kodu P2-2): mapa „strona z kopii → strona odtworzona” w katalogu tej kopii. Odtworzenie dostaje nowy identyfikator,
// a stary dalej daje 404: bez mapy ponowne (np. po przerwaniu) przywrócenie odtworzyłoby te same wpisy drugi raz
export const RESTORED_FILE = 'odtworzone.json';
export function restoredMap(dir) {
  try {
    const m = JSON.parse(readFileSync(path.join(dir, RESTORED_FILE), 'utf8'));
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch { return {}; }
}
function saveRestored(dir, map) {
  const f = path.join(dir, RESTORED_FILE);
  writeFileSync(f + '.tmp', JSON.stringify(map, null, 1), 'utf8');
  renameSync(f + '.tmp', f);
}

// final (review bezpieczeństwa P3-1): identyfikatory baz zapisane w kopii (pole dataSourceId na początku pliku bazy, bez czytania całego pliku)
export function backupSources(dir) {
  const out = {};
  for (const db of DBS) {
    const f = path.join(dir, `${db}.json`);
    if (!existsSync(f)) continue;
    let head = '';
    try {
      const fd = openSync(f, 'r');
      try { const buf = Buffer.alloc(1024); head = buf.toString('utf8', 0, readSync(fd, buf, 0, 1024, 0)); } finally { closeSync(fd); }
    } catch { continue; }
    const m = /"dataSourceId"\s*:\s*"([^"]+)"/.exec(head);
    if (m) out[db] = m[1];
  }
  return out;
}
// Bazy, które w kopii mają inny identyfikator niż bieżący dziennik (kopia z innego dziennika). Kopia bez identyfikatora (starszy format) nie jest odrzucana.
export function foreignDbs(dir, sources) {
  const bk = backupSources(dir);
  return DBS.filter((db) => bk[db] && sources[db] && bk[db] !== sources[db]);
}

export async function backupAll(notion, sources, baseDir, meta = {}) {
  const dir = path.join(baseDir, stamp());
  ensureDir(dir);
  const counts = {};
  for (const db of DBS) {
    if (!sources[db]) continue;
    const ds = await notion.get(`/v1/data_sources/${sources[db]}`);
    const pages = await notion.queryAll(sources[db]);
    counts[db] = pages.length;
    writeFileSync(path.join(dir, `${db}.json`), JSON.stringify({ db, dataSourceId: sources[db], properties: ds.properties, pages }, null, 1), 'utf8');
  }
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), counts, ...meta }, null, 2), 'utf8');
  return { dir, counts };
}

export function latestBackup(baseDir) {
  if (!existsSync(baseDir)) return null;
  const dirs = readdirSync(baseDir).filter((d) => !d.startsWith('.') && existsSync(path.join(baseDir, d, 'manifest.json')) && statSync(path.join(baseDir, d)).isDirectory()).sort();
  return dirs.length ? path.join(baseDir, dirs[dirs.length - 1]) : null;
}

// Wartość pola z odczytu Notion → format zapisu. null = pola nie da się zapisać (formuła, rollup, pola systemowe, pliki z Notion).
const READONLY = new Set(['formula', 'rollup', 'created_time', 'created_by', 'last_edited_time', 'last_edited_by', 'unique_id', 'verification', 'button', 'people']);
const richOut = (arr) => (arr || []).map((t) => (t.type === 'text' || t.text
  ? { type: 'text', text: { content: t.text?.content ?? t.plain_text ?? '', link: t.text?.link || null }, ...(t.annotations ? { annotations: t.annotations } : {}) }
  : { type: 'text', text: { content: t.plain_text ?? '' } }));
export function toWrite(p) {
  if (!p || READONLY.has(p.type)) return null;
  switch (p.type) {
    case 'title': return { title: richOut(p.title) };
    case 'rich_text': return { rich_text: richOut(p.rich_text) };
    case 'number': return { number: p.number };
    case 'checkbox': return { checkbox: !!p.checkbox };
    case 'url': return { url: p.url };
    case 'email': return { email: p.email };
    case 'phone_number': return { phone_number: p.phone_number };
    case 'select': return { select: p.select ? { name: p.select.name } : null };
    case 'status': return { status: p.status ? { name: p.status.name } : null };
    case 'multi_select': return { multi_select: (p.multi_select || []).map((o) => ({ name: o.name })) };
    case 'date': return { date: p.date ? { start: p.date.start, end: p.date.end ?? null, time_zone: p.date.time_zone ?? null } : null };
    case 'relation': return { relation: (p.relation || []).map((r) => ({ id: r.id })) };
    case 'files': {
      const ext = (p.files || []).filter((f) => f.type === 'external');
      if (ext.length !== (p.files || []).length) return null; // pliki wgrane do Notion mają wygasające adresy: zostawiamy je w spokoju
      return { files: ext.map((f) => ({ name: f.name, type: 'external', external: { url: f.external.url } })) };
    }
    default: return null;
  }
}
const textOf = (w) => JSON.stringify(w, (k, v) => (k === 'annotations' || k === 'link' ? undefined : v));

function writableProps(page, idByName) {
  const out = {};
  for (const [name, p] of Object.entries(page.properties || {})) {
    const w = toWrite(p);
    if (w === null) continue;
    const id = p.id || idByName[name];
    out[id || name] = { name, w };
  }
  return out;
}

// Plan przywrócenia z katalogu kopii: { items: [{ db, id, title, action: 'update'|'untrash'|'recreate', fields: [nazwy], was?, already? }], unchanged, already }
// final (P2-2): wpis odtworzony już wcześniej z tej kopii (mapa RESTORED_FILE) dostaje update albo untrash odtworzonej strony (id = nowa strona,
// was = strona z kopii, already = true) zamiast drugiego odtworzenia. final (bezp. P3-1): kopia z innego dziennika jest odrzucana (code other-journal).
export async function planRestore(notion, sources, dir) {
  const foreign = foreignDbs(dir, sources);
  if (foreign.length) throw Object.assign(new Error('Ta kopia pochodzi z innego dziennika (inne bazy w Notion). Przywrócić można tylko kopię tego dziennika.'), { code: 'other-journal', status: 409, dbs: foreign });
  const restored = restoredMap(dir);
  const items = [];
  let unchanged = 0, already = 0;
  for (const db of DBS) {
    const f = path.join(dir, `${db}.json`);
    if (!existsSync(f) || !sources[db]) continue;
    const bk = JSON.parse(readFileSync(f, 'utf8'));
    const idByName = Object.fromEntries(Object.entries(bk.properties || {}).map(([n, p]) => [n, p.id]));
    const cur = new Map((await notion.queryAll(sources[db])).filter((p) => !p.archived && !p.in_trash).map((p) => [p.id, p]));
    const curDs = await notion.get(`/v1/data_sources/${sources[db]}`);
    const curIds = new Set(Object.values(curDs.properties || {}).map((p) => p.id));
    const curIdByName = Object.fromEntries(Object.entries(curDs.properties || {}).map(([n, p]) => [n, p.id]));
    // strona po identyfikatorze: null, gdy jej nie ma (404)
    const fetchPage = async (id) => {
      try { return await notion.get(`/v1/pages/${id}`); } catch (e) { if (e.status !== 404) throw e; return null; }
    };
    for (const page of bk.pages) {
      if (page.archived || page.in_trash) continue;
      const want = writableProps(page, idByName);
      // pole usunięte od czasu kopii: nie odtwarzamy go (schemat zmienia tylko użytkownik)
      for (const k of Object.keys(want)) if (!curIds.has(k)) delete want[k];
      const titleProp = Object.values(page.properties || {}).find((p) => p.type === 'title');
      const title = (titleProp?.title || []).map((t) => t.plain_text ?? t.text?.content ?? '').join('') || page.id;
      let id = page.id, now = cur.get(page.id) || await fetchPage(page.id);
      const again = typeof restored[page.id] === 'string' ? restored[page.id] : null;
      if (!now && again) {
        now = cur.get(again) || await fetchPage(again);
        if (now) id = again;
      }
      if (!now) { items.push({ db, id: page.id, title, action: 'recreate', props: want, fields: Object.values(want).map((x) => x.name) }); continue; }
      const action = now.archived || now.in_trash ? 'untrash' : 'update';
      const mark = id !== page.id ? { was: page.id, already: true } : {};
      const have = writableProps(now, curIdByName);
      const diff = Object.entries(want).filter(([k, v]) => !have[k] || textOf(have[k].w) !== textOf(v.w));
      if (!diff.length && action === 'update') { unchanged++; if (mark.already) already++; continue; }
      if (mark.already) already++;
      items.push({ db, id, title, action, props: Object.fromEntries(diff), fields: diff.map(([, v]) => v.name), ...mark });
    }
  }
  return { items, unchanged, already };
}

// dir: katalog kopii, z której przywracamy; po każdym odtworzeniu zapisuje tam parę stare id → nowe id (final P2-2)
export async function applyRestore(notion, sources, plan, { log = () => {}, dir = null } = {}) {
  let done = 0;
  const map = dir ? restoredMap(dir) : null;
  for (const it of plan.items) {
    const properties = Object.fromEntries(Object.entries(it.props).map(([k, v]) => [k, v.w]));
    if (it.action === 'recreate') {
      // nowa strona dostaje nowy identyfikator; relacje innych stron do starej strony trzeba odtworzyć ręcznie
      const made = await notion.post('/v1/pages', { parent: { type: 'data_source_id', data_source_id: sources[it.db] }, properties });
      if (map && typeof made?.id === 'string') { map[it.id] = made.id; saveRestored(dir, map); }
    } else {
      if (it.action === 'untrash') await notion.patch(`/v1/pages/${it.id}`, { in_trash: false });
      if (Object.keys(properties).length) await notion.patch(`/v1/pages/${it.id}`, { properties });
    }
    done++;
    log(it);
  }
  return done;
}
