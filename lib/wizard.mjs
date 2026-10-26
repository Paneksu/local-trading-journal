// Kreator instalacji w przeglądarce („Pierwsze kroki”): sprawdzenie tokenu, strony udostępnione integracji (/v1/search)
// z rozpoznaniem istniejącego dziennika po schemacie, połączenie istniejącego dziennika, skrót .url do strony w Notion.
// Browser setup wizard helpers: token check, pages shared with the integration, existing journal detection, shortcut.
import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { DBS, resolveRoles } from './roles.mjs';
import { loc } from './schema.mjs';

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[’`]/g, "'");
const plain = (arr) => (arr || []).map((t) => t.plain_text ?? t.text?.content ?? '').join('');
const titleOf = (obj) => {
  if (Array.isArray(obj.title)) return plain(obj.title);
  const tp = Object.values(obj.properties || {}).find((x) => x.type === 'title');
  return plain(tp?.title);
};

export async function verifyToken(notion) {
  const me = await notion.get('/v1/users/me');
  return { name: me.name || 'Notion', workspace: me.bot?.workspace_name || '' };
}

async function searchAll(notion, value) {
  const out = [];
  let cursor;
  for (let i = 0; i < 20; i++) {
    const r = await notion.post('/v1/search', { filter: { property: 'object', value }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    out.push(...(r.results || []));
    if (!r.has_more) break;
    cursor = r.next_cursor;
  }
  return out;
}

// Rozpoznanie roli bazy: najpierw po tytule (nazwy ze schematu po polsku i angielsku), potem po polach.
function classify(ds, schema) {
  const title = norm(titleOf(ds));
  for (const db of DBS) {
    const names = Object.values(schema.databases[db].title).map(norm);
    if (names.includes(title) || (db === 'trades' && /^trade.?y$/.test(title))) return db;
  }
  const has = (db, roles) => { const { map, missing } = resolveRoles(db, ds.properties || {}); return !missing.length && roles.every((r) => map[r]); };
  if (has('trades', ['typ', 'date', 'r'])) return 'trades';
  if (has('finanse', ['kind', 'amount'])) return 'finanse';
  if (has('konta', ['status', 'size'])) return 'konta';
  return null;
}

// Strony widoczne dla integracji (bez wierszy baz) + dzienniki rozpoznane po czterech bazach leżących na jednej stronie.
export async function listPages(notion, schema) {
  const [pages, sources] = await Promise.all([searchAll(notion, 'page'), searchAll(notion, 'data_source')]);
  const journals = new Map();
  for (const ds of sources) {
    const db = classify(ds, schema);
    if (!db) continue;
    let pageId = ds.database_parent?.type === 'page_id' ? ds.database_parent.page_id : null;
    if (!pageId && ds.parent?.database_id) {
      try { const d = await notion.get(`/v1/databases/${ds.parent.database_id}`); pageId = d.parent?.type === 'page_id' ? d.parent.page_id : null; } catch { /* brak dostępu */ }
    }
    if (!pageId) continue;
    const j = journals.get(pageId) || { dsIds: {}, dbIds: {}, lang: 'pl' };
    if (!j.dsIds[db]) { j.dsIds[db] = ds.id; j.dbIds[db] = ds.parent?.database_id || null; }
    if (Object.values(schema.databases[db].title).some((t) => norm(t) === norm(titleOf(ds))) && norm(loc(schema.databases[db].title, 'en')) === norm(titleOf(ds)) && norm(loc(schema.databases[db].title, 'pl')) !== norm(titleOf(ds))) j.lang = 'en';
    journals.set(pageId, j);
  }
  const out = pages
    .filter((p) => !p.in_trash && !p.archived && !['data_source_id', 'database_id'].includes(p.parent?.type))
    .map((p) => {
      const j = journals.get(p.id);
      const complete = j && DBS.every((db) => j.dsIds[db]);
      return {
        id: p.id, title: titleOf(p) || '', url: p.url || '', icon: p.icon?.type === 'emoji' ? p.icon.emoji : '',
        journal: complete ? { dsIds: j.dsIds, dbIds: j.dbIds, lang: j.lang } : null,
        partial: j && !complete ? DBS.filter((db) => !j.dsIds[db]) : null,
      };
    });
  // dziennik pierwszy, potem alfabetycznie
  out.sort((a, b) => (b.journal ? 1 : 0) - (a.journal ? 1 : 0) || a.title.localeCompare(b.title));
  return out;
}

export const SHORTCUT_NAMES = { pl: 'Otwórz journal w Notion.url', en: 'Open journal in Notion.url' };
export function writeShortcut(dir, lang, url) {
  if (!url) return null;
  const file = path.join(dir, SHORTCUT_NAMES[lang === 'en' ? 'en' : 'pl']);
  writeFileSync(file, `[InternetShortcut]\r\nURL=${url}\r\n`, 'utf8');
  return file;
}
export function hasShortcut(dir) {
  try { return readdirSync(dir).some((f) => Object.values(SHORTCUT_NAMES).includes(f)); } catch { return false; }
}
void existsSync;
