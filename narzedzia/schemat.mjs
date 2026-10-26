// Narzędzie tylko do ODCZYTU: wypisuje pola (nazwa, typ, opcje) baz z Notion. Nic nie zapisuje.
// Użycie: node narzedzia/schemat.mjs [trades|konta|dziennik|finanse]
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
const f = path.join(ROOT, '.env');
if (existsSync(f)) for (const raw of readFileSync(f, 'utf8').split(/\r?\n/)) {
  const line = raw.trim(); const i = line.indexOf('=');
  if (!line || line.startsWith('#') || i < 1) continue;
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const base = process.env.NOTION_API_BASE || 'https://api.notion.com';
const which = process.argv[2] || 'trades';
const id = env['DS_' + which.toUpperCase()];
if (!id || !env.NOTION_TOKEN) { console.error('Brak tokenu lub identyfikatora bazy w .env'); process.exit(1); }
const r = await fetch(`${base}/v1/data_sources/${id}`, { headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': env.NOTION_VERSION || '2026-03-11' } });
const ds = await r.json();
if (!r.ok) { console.error(r.status, ds.message); process.exit(1); }
for (const [name, p] of Object.entries(ds.properties)) {
  const opts = (p.select || p.multi_select || p.status)?.options?.map((o) => o.name);
  console.log(`${name} | ${p.type}${opts ? ' | ' + opts.join(', ') : ''}`);
}
