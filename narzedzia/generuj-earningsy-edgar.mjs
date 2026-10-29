// Generuje historię earningów spółek S&P 100 do data/earnings/ (dołączana do wydania, jak daty FRED): ogłoszenia wyników z SEC EDGAR (8-K z Item 2.02) od 2010.
//   sp100.json   – lista spółek z CIK (mapowanie z sec.gov/files/company_tickers.json) i kapitalizacją z Finnhub (gdy jest FINNHUB_API_KEY; bez niej tylko CIK)
//   edgar-8k.json – czasy przyjęcia raportów przez SEC (unix UTC) na spółkę; pora BMO/AMC liczona w aplikacji z czasu ET
// SEC wymaga User-Agent z danymi aplikacji (nazwa, wersja, adres repozytorium) i najwyżej 10 zapytań na sekundę (tu 8). Kontakt jest opcjonalny: --kontakt="…" albo EDGAR_CONTACT;
// trafia tylko do nagłówka i nigdy do plików wyjściowych ani logów. Klucz Finnhub (jeśli jest) idzie tylko do finnhub.io. Skrypt pisze wyłącznie lokalne pliki wyjściowe.
// Użycie: node narzedzia/generuj-earningsy-edgar.mjs [--kontakt=…] [--bez-kapitalizacji] [--sucho] [--wyjscie=data/earnings]
// English: one-off generator of S&P 100 earnings history from SEC EDGAR (8-K Item 2.02) plus market caps from Finnhub.
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnv } from '../lib/env.mjs';
import { APP_VERSION, REPO } from '../lib/version.mjs';
import { SP100, CLASS1, CLASS2, HISTORY_FROM, SP100_VERIFIED, CIK_OVERRIDES } from '../lib/earnings-katalog.mjs';
import { createEdgar, createFinnhub, buildUserAgent } from '../lib/earnings-sources.mjs';
import { buildClassMap } from '../lib/earnings.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const die = (msg) => { console.error(msg); process.exit(1); };
const known = new Set(['kontakt', 'bez-kapitalizacji', 'sucho', 'wyjscie']);
for (const k of Object.keys(args)) if (!known.has(k)) die(`Nieznany parametr --${k}. Dozwolone: ${[...known].map((x) => '--' + x).join(', ')}.`);
const outDir = path.resolve(ROOT, String(args.wyjscie || 'data/earnings'));
const contact = typeof args.kontakt === 'string' ? args.kontakt : process.env.EDGAR_CONTACT;
const edgar = createEdgar({ userAgent: buildUserAgent({ version: APP_VERSION, repo: REPO, contact }), rps: 8 });
const finnhubKey = args['bez-kapitalizacji'] ? undefined : (process.env.FINNHUB_API_KEY || loadEnv().FINNHUB_API_KEY);

let tickers;
try { tickers = await edgar.tickerMap(); } catch (e) { die(`SEC company_tickers.json: ${e.message}${e.code ? ` [${e.code}]` : ''}`); }
const companies = [], rows = {}, missing = [];
for (const [symbol, name] of SP100) {
  const cik = tickers.get(symbol) ?? CIK_OVERRIDES[symbol];
  if (cik && !tickers.has(symbol)) console.log(`${symbol}: CIK z ręcznego mapowania (${cik})`);
  if (!cik) { missing.push(symbol); continue; }
  let list;
  try { list = await edgar.earnings(cik); } catch (e) { die(`${symbol} (CIK ${cik}): ${e.message}${e.code ? ` [${e.code}]` : ''}`); }
  companies.push({ symbol, name, cik });
  rows[symbol] = list.map((r) => r.t);
  process.stdout.write(`${symbol}:${list.length} `);
}
console.log('');
if (missing.length) console.log(`Bez CIK w pliku SEC (pominięte): ${missing.join(', ')}`);
if (missing.length > 5) die('Za dużo spółek bez CIK, plik SEC wygląda na uszkodzony. Nic nie zapisano.');

if (finnhubKey) {
  const fh = createFinnhub({ key: finnhubKey });
  let n = 0;
  for (const c of companies) {
    try { const cap = await fh.marketCap(c.symbol); if (cap) { c.cap = Math.round(cap); n++; } } catch (e) { console.log(`kapitalizacja ${c.symbol}: ${e.message}`); if (e.code === 'bad-key' || e.code === 'rate-limit') break; }
    await new Promise((r) => setTimeout(r, 1100)); // limit Finnhub 60/min
  }
  console.log(`Kapitalizacje z Finnhub: ${n} z ${companies.length}`);
} else console.log('Bez klucza Finnhub (albo --bez-kapitalizacji): klasy 3-4 z kolejności zapasowej w katalogu.');

const { map, counts } = buildClassMap(companies, { caps: Object.fromEntries(companies.filter((c) => c.cap).map((c) => [c.symbol, c.cap])) });
const total = Object.values(rows).reduce((a, l) => a + l.length, 0);
const low = Object.entries(rows).filter(([, l]) => l.length < 40).map(([s, l]) => `${s}:${l.length}`);
console.log(`Spółek ${companies.length}, ogłoszeń ${total}; klasy ${JSON.stringify(counts)}; klasa 1 bez wpisu: ${CLASS1.filter((s) => !map.has(s)).join(',') || 'brak'}; klasa 2 bez wpisu: ${CLASS2.filter((s) => !map.has(s)).join(',') || 'brak'}`);
if (low.length) console.log(`Mało ogłoszeń (< 40, młode spółki albo luka): ${low.join(' ')}`);

const generated = new Date().toISOString().slice(0, 10);
const sp = `{
  "schema": 1,
  "source": "S&P 100 (lista w lib/earnings-katalog.mjs); CIK: SEC company_tickers.json (BNY: ręcznie); kapitalizacja (mln USD): Finnhub stock/profile2",
  "verified": ${JSON.stringify(SP100_VERIFIED)},
  "generated": ${JSON.stringify(generated)},
  "companies": [
${companies.map((c) => `    ${JSON.stringify(c)}`).join(',\n')}
  ]
}
`;
const ed = `{
  "schema": 1,
  "source": "SEC EDGAR: submissions API, formularz 8-K z Item 2.02 (Results of Operations and Financial Condition); wartości to czas przyjęcia raportu przez SEC, unix UTC",
  "generated": ${JSON.stringify(generated)},
  "from": ${JSON.stringify(HISTORY_FROM)},
  "rows": {
${Object.entries(rows).map(([s, l]) => `    ${JSON.stringify(s)}: ${JSON.stringify(l)}`).join(',\n')}
  }
}
`;
if (args.sucho) { console.log(`Sucha próba: nic nie zapisano (sp100.json ${sp.length}, edgar-8k.json ${ed.length} znaków).`); process.exit(0); }
mkdirSync(outDir, { recursive: true });
for (const [name, text] of [['sp100.json', sp], ['edgar-8k.json', ed]]) { const f = path.join(outDir, name); writeFileSync(`${f}.tmp`, text, 'utf8'); renameSync(`${f}.tmp`, f); console.log(`Zapisano ${path.relative(ROOT, f)} (${text.length} znaków).`); }
