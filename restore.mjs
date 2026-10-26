#!/usr/bin/env node
// Przywracanie danych z kopii (backups/<data>/). Domyślnie TYLKO podgląd. Zapis wymaga --apply i potwierdzenia.
// Przywraca wartości pól, wyjmuje strony z kosza i odtwarza brakujące. Niczego nie usuwa i nie zmienia schematu.
// Restore from a backup. Preview by default; --apply (with confirmation) writes. Never deletes anything.
//
//   node restore.mjs                       podgląd z najnowszej kopii / preview from the latest backup
//   node restore.mjs backups/2026-10-26T10-00-00Z
//   node restore.mjs --apply               zapis po potwierdzeniu / write after confirmation
import { createInterface } from 'node:readline/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) { console.error(`Potrzebny jest Node.js 22 lub nowszy (masz ${process.versions.node}). / Node.js 22+ required.`); process.exit(1); }

const { CONFIG_DIR, loadEnv, envSettings, loadConfig } = await import('./lib/env.mjs');
const { createNotion } = await import('./lib/notion.mjs');
const { latestBackup, planRestore, applyRestore } = await import('./lib/backup.mjs');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const lang = loadConfig().lang === 'en' ? 'en' : 'pl';
const L = (pl, en) => (lang === 'en' ? en : pl);

const given = args.find((a) => !a.startsWith('--'));
const dir = given ? path.resolve(given) : latestBackup(path.join(CONFIG_DIR, 'backups'));
if (!dir || !existsSync(path.join(dir, 'manifest.json'))) { console.error(L('Nie znalazłem kopii. Kopie są w katalogu backups/ (powstają przy każdej aktualizacji).', 'No backup found. Backups live in backups/ (one is made on every update).')); process.exit(1); }

const S = envSettings(loadEnv());
if (!S.token) { console.error(L('Brak NOTION_TOKEN w .env.', 'NOTION_TOKEN missing in .env.')); process.exit(1); }
const notion = createNotion({ token: S.token, version: S.version, base: S.base });

console.log(L(`Kopia: ${dir}`, `Backup: ${dir}`));
const plan = await planRestore(notion, S.sources, dir);
const word = { update: L('przywrócę pola', 'restore fields'), untrash: L('wyjmę z kosza', 'take out of trash'), recreate: L('odtworzę (nowy wpis)', 'recreate (new entry)') };
for (const it of plan.items) console.log(`  ${it.db} · ${it.title}: ${word[it.action]}${it.fields.length ? ` (${it.fields.join(', ')})` : ''}`);
console.log(L(`Do zmiany: ${plan.items.length}, bez zmian: ${plan.unchanged}. Wpisy dodane po kopii zostają.`, `To change: ${plan.items.length}, unchanged: ${plan.unchanged}. Entries added after the backup stay.`));
if (!flag('apply')) { console.log(L('\nTo był podgląd. Aby zapisać: node restore.mjs --apply', '\nThis was a preview. To write: node restore.mjs --apply')); process.exit(0); }
if (!plan.items.length) process.exit(0);
if (!flag('yes')) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(L('Wpisz TAK, aby przywrócić: ', 'Type YES to restore: '))).trim();
  rl.close();
  if (a !== L('TAK', 'YES')) { console.log(L('Przerwano, nic nie zmieniono.', 'Cancelled, nothing changed.')); process.exit(0); }
}
const n = await applyRestore(notion, S.sources, plan);
console.log(L(`Przywrócono: ${n}.`, `Restored: ${n}.`));
