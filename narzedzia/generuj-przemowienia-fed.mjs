// Generuje plik historii przemówień i zeznań przewodniczącego Fed od 2010: data/news/fed-chair.json (dołączany do wydania jak daty FRED).
// Źródło: oficjalne archiwa JSON Fed (federalreserve.gov/json/ne-speeches.json i ne-testimony.json), publiczne, bez klucza. Przewodniczący rozpoznawany z tytułu mówcy
// (Chair, Chairman, Chair Pro Tempore; Vice Chair i Governor odpadają). Godziny z pola d (czas ET); w pliku jako unix UTC, flaga timed=false dla pozycji bez godziny.
// Skrypt pisze wyłącznie lokalny plik wyjściowy; dwa zapytania do federalreserve.gov. Aplikacja odświeża te same archiwa raz dziennie.
// Użycie: node narzedzia/generuj-przemowienia-fed.mjs [--out=data/news/fed-chair.json] [--sucho]
// English: one-off generator of the Fed chair speeches/testimony history from the official Fed JSON archives.
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/env.mjs';
import { createFedArchiveClient } from '../lib/news-sources.mjs';
import { HISTORY_FROM } from '../lib/news-katalog.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const die = (msg) => { console.error(msg); process.exit(1); };
for (const k of Object.keys(args)) if (!['out', 'sucho'].includes(k)) die(`Nieznany parametr --${k}. Dozwolone: --out, --sucho.`);
const out = path.resolve(ROOT, String(args.out || 'data/news/fed-chair.json'));

let r;
try { r = await createFedArchiveClient({ userAgent: 'JustJournal (generator danych)' }).fetchItems(); } catch (e) { die(`Archiwa Fed: ${e.message}${e.code ? ` [${e.code}]` : ''}`); }
if (!r.items.length) die('Archiwa Fed nie zawierają pozycji przewodniczącego od 2010. Nic nie zapisano.');
const byYear = {};
for (const x of r.items) { const y = new Date(x.t * 1000).getUTCFullYear(); byYear[y] ??= { speech: 0, testimony: 0 }; byYear[y][x.k]++; }
console.log(`Pozycje ogółem w archiwach: ${r.total}; przewodniczącego od ${HISTORY_FROM}: ${r.items.length}; bez czytelnej daty: ${r.skipped}; bez godziny: ${r.items.filter((x) => !x.timed).length}`);
for (const [y, c] of Object.entries(byYear)) console.log(`${y}  przemówienia ${String(c.speech).padStart(2)}  zeznania ${String(c.testimony).padStart(2)}`);
const body = r.items.map((x) => `    ${JSON.stringify(x)}`).join(',\n');
const text = `{
  "schema": 1,
  "source": "Federal Reserve Board, archiwa JSON przemówień i zeznań (federalreserve.gov/json); przewodniczący wg tytułu mówcy; godziny ET przeliczone na UTC",
  "generated": ${JSON.stringify(new Date().toISOString().slice(0, 10))},
  "from": ${JSON.stringify(HISTORY_FROM)},
  "items": [
${body}
  ]
}
`;
if (args.sucho) { console.log(`Sucha próba: nic nie zapisano (${text.length} znaków).`); process.exit(0); }
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(`${out}.tmp`, text, 'utf8');
renameSync(`${out}.tmp`, out);
console.log(`Zapisano ${path.relative(ROOT, out)} (${text.length} znaków).`);
