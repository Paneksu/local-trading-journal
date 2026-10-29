// Generuje plik dat publikacji wydań FRED (2010 → ogłoszona przyszłość) dla newsów makro USD: data/news/usd-oficjalne.json.
// Plik dołączamy do wydania, więc zwykły użytkownik nie potrzebuje klucza FRED; klucz służy tylko do odświeżania przyszłości w aplikacji (decyzja D2, 29.10.2026).
// W pliku są WYŁĄCZNIE daty publikacji (fakty z kalendarzy BLS, BEA, Census i innych), bez serii danych i bez godzin; godziny i nazwy zdarzeń pochodzą z lib/news-katalog.mjs.
// Klucz: FRED_API_KEY z .env (albo ze zmiennej środowiskowej); trafia tylko do zapytań do api.stlouisfed.org i nigdy do pliku wyjściowego, logu ani komunikatu.
// Skrypt pisze wyłącznie lokalny plik wyjściowy (żadnych zapisów do baz ani do API). Tempo: jedno zapytanie na wydanie z przerwą (domyślnie 800 ms), razem kilkanaście zapytań.
// Użycie: node narzedzia/generuj-daty-fred.mjs [--out=data/news/usd-oficjalne.json] [--sucho] [--pauza-ms=800]
// English: one-off generator of FRED release dates (2010 → announced future) shipped with the release; key never written anywhere.
import { writeFileSync, readFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnv, ROOT } from '../lib/env.mjs';
import { createFred } from '../lib/news-sources.mjs';
import { FRED_RELEASES, FRED_ATTRIBUTION, HISTORY_FROM } from '../lib/news-katalog.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const die = (msg) => { console.error(msg); process.exit(1); };
const known = new Set(['out', 'sucho', 'pauza-ms']);
for (const k of Object.keys(args)) if (!known.has(k)) die(`Nieznany parametr --${k}. Dozwolone: ${[...known].map((x) => '--' + x).join(', ')}.`);
const out = path.resolve(ROOT, String(args.out || 'data/news/usd-oficjalne.json'));
const pause = args['pauza-ms'] === undefined ? 800 : Number(args['pauza-ms']);
if (!Number.isFinite(pause) || pause < 0) die(`--pauza-ms=${args['pauza-ms']}: oczekiwana liczba milisekund (0 lub więcej).`);

const key = process.env.FRED_API_KEY || loadEnv().FRED_API_KEY;
if (!key) die('Brak FRED_API_KEY (plik .env w katalogu projektu albo zmienna środowiskowa). Darmowy klucz: fred.stlouisfed.org → My Account → API Keys.');
const fred = createFred({ key });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prev = existsSync(out) ? (() => { try { return JSON.parse(readFileSync(out, 'utf8')); } catch { return null; } })() : null;

const releases = {};
for (const rel of FRED_RELEASES) {
  let dates;
  try { dates = await fred.releaseDates(rel.rid); } catch (e) { die(`Wydanie ${rel.rid} (${rel.label}): ${e.message}${e.code ? ` [${e.code}]` : ''}`); }
  dates = dates.filter((d) => d >= HISTORY_FROM);
  if (!dates.length) die(`Wydanie ${rel.rid} (${rel.label}): FRED nie zwrócił żadnej daty od ${HISTORY_FROM}. Nic nie zapisano.`);
  const before = prev?.releases?.[rel.rid]?.dates?.length;
  releases[rel.rid] = { name: rel.label, dates };
  console.log(`${String(rel.rid).padStart(4)}  ${rel.label.padEnd(54)} ${String(dates.length).padStart(4)} dat  ${dates[0]} → ${dates.at(-1)}${before !== undefined ? `  (poprzednio ${before})` : ''}`);
  await sleep(pause);
}

// Jedna linia na wydanie: czytelny diff przy kolejnym wydaniu.
const body = Object.entries(releases).map(([rid, r]) => `    ${JSON.stringify(rid)}: { "name": ${JSON.stringify(r.name)}, "dates": ${JSON.stringify(r.dates)} }`).join(',\n');
const text = `{
  "schema": 1,
  "source": "FRED® API (Federal Reserve Bank of St. Louis), fred/release/dates; terminy publikacji instytucji statystycznych USA",
  "attribution": ${JSON.stringify(FRED_ATTRIBUTION)},
  "generated": ${JSON.stringify(new Date().toISOString().slice(0, 10))},
  "from": ${JSON.stringify(HISTORY_FROM)},
  "releases": {
${body}
  }
}
`;
if (args.sucho) { console.log(`Sucha próba: nic nie zapisano (plik miałby ${text.length} znaków).`); process.exit(0); }
mkdirSync(path.dirname(out), { recursive: true });
const tmp = `${out}.tmp`;
writeFileSync(tmp, text, 'utf8');
renameSync(tmp, out);
console.log(`Zapisano ${path.relative(ROOT, out)} (${text.length} znaków).`);
