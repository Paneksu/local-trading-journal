// Generuje plik terminarzy dla newsów makro USD: data/news/usd-terminarze.json (dołączany do wydania jak daty FRED). Pakiet B2, 29.10.2026.
// Źródła (publiczne strony rządu USA, bez klucza): tabela dat publikacji TIC Skarbu USA (home.treasury.gov) i archiwum JSON komunikatów prasowych Fed
// (www.federalreserve.gov/json/ne-press.json). Dwa zapytania z przerwą, User-Agent aplikacji. Skrypt pisze wyłącznie lokalny plik wyjściowy.
// Użycie: node narzedzia/generuj-terminarze.mjs [--out=data/news/usd-terminarze.json] [--sucho]
// English: one-off generator of the TIC release dates (US Treasury) and unscheduled Fed monetary-policy announcements (Fed press archive).
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/env.mjs';
import { httpGet, readCapped, MAX_BYTES, parseTicSchedule, fedAnnouncements, checkHost } from '../lib/news-sources.mjs';
import { TIC_SCHEDULE_URL, FED_ARCHIVE_BASE, FED_PRESS_PATH, HISTORY_FROM } from '../lib/news-katalog.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const die = (msg) => { console.error(msg); process.exit(1); };
for (const k of Object.keys(args)) if (!['out', 'sucho'].includes(k)) die(`Nieznany parametr --${k}. Dozwolone: --out, --sucho.`);
const out = path.resolve(ROOT, String(args.out || 'data/news/usd-terminarze.json'));
const headers = { 'User-Agent': 'JustJournal (generator danych)' };
const get = async (url, hosts, label) => {
  if (!checkHost(url, hosts)) die(`${label}: adres spoza listy (${url}).`);
  try { return await readCapped(await httpGet(url, { fetchImpl: globalThis.fetch, headers, timeoutMs: 60_000, scrub: String, label }), MAX_BYTES.fed, label); } catch (e) { die(`${label}: ${e.message}`); }
};

const tic = parseTicSchedule(await get(TIC_SCHEDULE_URL, ['home.treasury.gov'], 'Skarb USA'));
await new Promise((r) => setTimeout(r, 1500));
const fed = fedAnnouncements(await get(FED_ARCHIVE_BASE + FED_PRESS_PATH, ['www.federalreserve.gov'], 'Fed'));
if (tic.length < 150) die(`TIC: tylko ${tic.length} dat od ${HISTORY_FROM} (oczekiwane ok. 200). Format strony Skarbu mógł się zmienić. Nic nie zapisano.`);
if (fed.length < 20) die(`Komunikaty Fed: tylko ${fed.length} pozycji. Nic nie zapisano.`);
console.log(`TIC: ${tic.length} dat (${tic[0]} → ${tic.at(-1)}); komunikaty Fed poza posiedzeniami: ${fed.length}`);
const text = `{
  "schema": 1,
  "source": "U.S. Treasury, TIC Press Releases by topic (home.treasury.gov); Federal Reserve Board, archiwum JSON komunikatów prasowych (federalreserve.gov/json/ne-press.json), kategoria Monetary Policy poza terminarzem",
  "generated": ${JSON.stringify(new Date().toISOString().slice(0, 10))},
  "from": ${JSON.stringify(HISTORY_FROM)},
  "tic": ${JSON.stringify(tic)},
  "fed": [
${fed.map((x) => `    ${JSON.stringify(x)}`).join(',\n')}
  ]
}
`;
if (args.sucho) { console.log(`Sucha próba: nic nie zapisano (${text.length} znaków).`); process.exit(0); }
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(`${out}.tmp`, text, 'utf8');
renameSync(`${out}.tmp`, out);
console.log(`Zapisano ${path.relative(ROOT, out)} (${text.length} znaków).`);
