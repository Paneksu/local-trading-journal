// Import okien 1s NQ 9:30–11:00 Nowy Jork od 2020-01-02 (Databento ohlcv-1s) przez działający dashboard. P49 (29.10.2026).
// Słowa użytkownika: «nadbudowac baze danych swiec 1s od 9:30 ny open do 11:00, tylko na nq na okres od 2020»; wybory: «Tak, z twardym limitem 36 USD»,
// «Jednorazowy budżet tylko dla tego importu». Wzór: narzedzia/import-historii-1m.mjs. Skrypt jest tylko klientem lokalnego dashboardu (127.0.0.1):
// klucz Databento, liczniki wydatków, strażnik kredytu i licznik budżetu importu (chart-data/import-1s-nq.json) zostają w procesie serwera.
// Domyślnie TYLKO WYCENA (get_cost jest bezpłatne), nic nie kosztuje. Pobieranie startuje dopiero z --potwierdzam-usd=KWOTA (wycena całości
// z poprzedniego przebiegu). Budżet: --budzet-usd (domyślnie i najwyżej 36 USD); wycena całości ponad pozostały budżet zatrzymuje skrypt przed pobraniem.
// Serwer pobiera partiami ≤ 1 USD, przed każdą partią sprawdza budżet, a tuż przed każdym get_range robi świeży get_cost.
// Przerwanie (sieć, 429, przekroczony czas) skrypt wznawia sam: ponowna wycena brakujących okien i dalsze pobieranie. Okna już w magazynie są pomijane,
// więc tę samą komendę można też uruchomić ponownie ręcznie. Porcje: rok kalendarzowy na jedno żądanie (krótkie odpowiedzi serwera).
// Użycie:
//   node narzedzia/import-okien-1s.mjs [--od=2020-01-02] [--do=RRRR-MM-DD] [--port=4321] [--potwierdzam-usd=33.60 [--budzet-usd=36]]
// English: CLI for the one-off NQ 9:30-11:00 New York 1s window import (budget 36 USD); dry-run unless confirmed with an explicit amount.
import http from 'node:http';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const PORT = Number(args.port || process.env.PORT) || 4321;
const BASE = `http://127.0.0.1:${PORT}`;
const MAX_BUDGET = 36;
const RETRIES = 20, RETRY_MS = Number(process.env.IMPORT_RETRY_MS) || 30_000; // IMPORT_RETRY_MS tylko dla testów
const TRANSIENT = new Set(['rate-limit', 'network', 'timeout', 'upstream', 'running']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (msg) => { console.error(msg); process.exit(1); };

const known = new Set(['od', 'do', 'port', 'potwierdzam-usd', 'budzet-usd', 'bez-wyceny']);
for (const k of Object.keys(args)) if (!known.has(k)) die(`Nieznany parametr --${k}. Dozwolone: ${[...known].map((x) => '--' + x).join(', ')}.`);
const sec = (flag, def) => {
  if (args[flag] === undefined) return def;
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(String(args[flag])) ? Date.parse(args[flag] + 'T00:00:00Z') : NaN;
  if (Number.isNaN(ms)) die(`--${flag}=${args[flag]}: oczekiwana data RRRR-MM-DD.`);
  return ms / 1000;
};
const num = (flag) => {
  if (args[flag] === undefined) return undefined;
  const v = Number(args[flag]);
  if (!Number.isFinite(v) || v <= 0) die(`--${flag}=${args[flag]}: oczekiwana kwota w USD większa od zera.`);
  return v;
};
const FROM = sec('od', Date.parse('2020-01-02T00:00:00Z') / 1000), TO = sec('do', Math.floor(Date.now() / 1000));
const confirm = num('potwierdzam-usd'), budget = num('budzet-usd') ?? MAX_BUDGET;
if (budget > MAX_BUDGET) die(`--budzet-usd=${budget}: najwyżej ${MAX_BUDGET} USD (decyzja P49).`);
if (args['budzet-usd'] !== undefined && confirm === undefined) die('--budzet-usd działa tylko razem z --potwierdzam-usd (najpierw wycena bez parametrów kwotowych).');
if (FROM >= TO) die('--od musi być przed --do.');
// --bez-wyceny (29.10.2026, słowa użytkownika: «jak widac ze rok kosztyuje 5 dolartow to czy nie mozemy juz oszacowac bez potwierdzenia ze nastepne tez
// i po prostu miec swoj limit i pobierac juz ?»): bez osobnej wyceny całości przed startem. Każdy rok startuje od razu; serwer wycenia go przy starcie
// i odrzuca, gdy wycena roku przekracza resztę potwierdzonej kwoty; twardy budżet, partie ≤ 1 USD i świeży get_cost przed każdym get_range zostają.
const noQuote = args['bez-wyceny'] === true;
if (args['bez-wyceny'] !== undefined && !noQuote) die('--bez-wyceny nie przyjmuje wartości.');
if (noQuote && confirm === undefined) die('--bez-wyceny działa tylko z --potwierdzam-usd (górna granica wydatku tego przebiegu).');

// node:http zamiast fetch: wycena roku (ok. 250 bezpłatnych get_cost) może trwać dłużej niż domyślny limit oczekiwania fetch
function api(pth, body) {
  return new Promise((resolve) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request(BASE + pth, { method: data ? 'POST' : 'GET', headers: data ? { Origin: BASE, 'X-THQ': '1', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(text); } catch { j = { error: `odpowiedź bez JSON: ${text.slice(0, 200) || 'pusta'}` }; } resolve({ status: res.statusCode, j }); });
    });
    req.on('error', (e) => {
      if (['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH'].includes(e.code)) die(`Nie można połączyć się z dashboardem na ${BASE} (${e.code}). Uruchom dashboard i spróbuj ponownie, albo podaj --port.`);
      resolve({ status: 0, j: { error: e.message, code: 'network' } });
    });
    if (data) req.write(data);
    req.end();
  });
}
const usd = (x) => (typeof x === 'number' ? x.toFixed(4) : String(x)) + ' USD';
const years = [];
for (let a = FROM; a < TO;) { const b = Math.min(Date.UTC(new Date(a * 1000).getUTCFullYear() + 1, 0, 1) / 1000, TO); years.push({ from: a, to: b, label: new Date(a * 1000).getUTCFullYear() }); a = b; }

async function quoteYear(y) {
  for (let k = 0; ; k++) {
    const p = await api('/api/candles/import-1s', { instrument: 'NQ', from: y.from, to: y.to, dryRun: true });
    if (p.status === 200) return p.j;
    const code = p.j?.code || (p.status === 0 ? 'network' : '');
    if (k < RETRIES && (TRANSIENT.has(code) || p.status === 0 || p.status >= 500)) { console.error(`${y.label}: wycena chwilowo niemożliwa (${p.status} ${code}: ${p.j?.error || ''}), ponawiam za ${RETRY_MS / 1000} s`); await sleep(RETRY_MS); continue; }
    die(`${y.label}: wycena nie powiodła się (${p.status}): ${p.j?.error || 'brak szczegółów'}`);
  }
}

const t0 = Date.now();
let grand = 0, days = 0, last = null;
const plans = [];
if (noQuote) {
  for (const y of years) plans.push({ y, q: null });
  last = (await api('/api/candles/status')).j;
  last = { budget: { spentUsd: last?.open1s?.spentUsd ?? 0 }, credit: last?.credit };
  console.log(`Bez wyceny całości: górna granica ${usd(confirm)}, budżet ${budget} USD (wydano już ${usd(last.budget.spentUsd)}).`);
}
for (const y of noQuote ? [] : years) {
  const q = await quoteYear(y);
  console.log(`${y.label}: dni do pobrania ${q.days}, zakresów ${q.runs}, wycena ${usd(q.totalUsd)}${q.nothing ? ' (wszystko już w magazynie)' : ''}, warstwy: ${q.layers.join(', ') || '-'}`);
  grand += q.totalUsd; days += q.days; last = q;
  plans.push({ y, q });
}
grand = Math.round(grand * 1e6) / 1e6;
const left = last?.budget?.leftUsd ?? MAX_BUDGET;
if (!noQuote) console.log(`Razem: ${usd(grand)} za ${days} dni. Budżet importu: wydano ${usd(last?.budget?.spentUsd)} z ${MAX_BUDGET} USD. Kredyt: pozostało ${usd(last?.credit?.leftUsd)} z ${last?.credit?.startUsd} USD, wygasa ${last?.credit?.expires}.`);
if (confirm === undefined) {
  console.log(`Tryb wyceny: nic nie pobrano. Żeby pobrać, uruchom ponownie z --potwierdzam-usd=${grand.toFixed(2)}.`);
  process.exit(0);
}
const spentBefore = last?.budget?.spentUsd ?? 0;
const room = Math.round((budget - spentBefore) * 1e6) / 1e6;
if (!noQuote && grand > room) die(`Wycena ${usd(grand)} przekracza pozostały budżet ${usd(room)} (budżet ${budget} USD, wydano ${usd(spentBefore)}). Nic nie pobrano. Decyzja należy do użytkownika.`);
if (grand > confirm * 1.05) die(`Wycena ${usd(grand)} jest wyższa niż potwierdzona ${usd(confirm)} (+5%). Nic nie pobrano; potwierdź nową kwotę.`);

let spentRun = 0;
for (const { y } of plans) {
  for (let attempt = 0; ; attempt++) {
    // bez wyceny: potwierdzona kwota roku = reszta górnej granicy (serwer odrzuca rok droższy niż ta reszta, nic nie pobierając)
    const q = noQuote ? { totalUsd: Math.max(0, (confirm - spentRun) / 1.05), nothing: false } : attempt === 0 ? plans.find((p) => p.y === y).q : await quoteYear(y);
    if (q.nothing) { console.log(`${y.label}: nic do pobrania.`); break; }
    if (!noQuote && spentRun + q.totalUsd > confirm * 1.05 + 1e-9) die(`${y.label}: łączna wycena przekroczyłaby potwierdzoną kwotę ${usd(confirm)}. Zatrzymano; wydano w tym przebiegu ${usd(spentRun)}.`);
    const r = await api('/api/candles/import-1s', { instrument: 'NQ', from: y.from, to: y.to, confirmedCostUsd: q.totalUsd, budgetUsd: budget });
    if (r.status !== 200 || !r.j?.started) {
      if (r.j?.code === 'budget') die(`${y.label}: twardy stop budżetu: ${r.j.error}`);
      if (noQuote && r.j?.code === 'cost-changed') die(`${y.label}: wycena roku przekracza resztę górnej granicy ${usd(confirm)} (wydano w tym przebiegu ${usd(spentRun)}): ${r.j.error}`);
      if (attempt < RETRIES && (TRANSIENT.has(r.j?.code) || r.status === 0 || r.j?.code === 'cost-changed')) { console.error(`${y.label}: start niemożliwy (${r.status} ${r.j?.code}: ${r.j?.error}), ponawiam za ${RETRY_MS / 1000} s`); await sleep(RETRY_MS); continue; }
      if (r.j?.nothing) break;
      die(`${y.label}: import nie wystartował (${r.status}): ${r.j?.error || JSON.stringify(r.j)}`);
    }
    console.log(`${y.label}: start, ${r.j.runs} zakresów, ${r.j.batches} partii, ${usd(r.j.costUsd)}`);
    // Przegląd 1.3.0, pkt 4: czekamy na wynik TEGO importu (status.import1s.id === runId), a nie na status.running, który po zakończeniu importu może już należeć do przebiegu kolejki
    let s, fin = null, lost = 0;
    for (;;) {
      await sleep(2000);
      s = (await api('/api/candles/status')).j;
      if (!s || s.error === undefined) continue; // chwilowo brak odpowiedzi
      if (s.import1s?.id === r.j.runId) { fin = s.import1s; break; }
      if (s.running && s.importId === r.j.runId) { lost = 0; if (process.stdout.isTTY) process.stdout.write(`\r${y.label}: ${s.done}/${s.total}   `); }
      else if (++lost >= 5) die(`${y.label}: serwer nie zna wyniku importu ${r.j.runId} (restart dashboardu w trakcie?). Sprawdź magazyn i uruchom tę samą komendę, żeby wznowić.`);
    }
    if (process.stdout.isTTY) process.stdout.write('\n');
    s = { error: fin.error, result: fin.result };
    spentRun += s.result?.costUsd || 0;
    if (!s.error) { console.log(`${y.label}: gotowe, dodano ${s.result?.added} świec, wydano ${usd(s.result?.costUsd)}, partie: ${(s.result?.batches || []).length}.`); break; }
    if (s.error.code === 'budget') die(`${y.label}: twardy stop budżetu: ${s.error.message} Wydano w tym przebiegu ${usd(spentRun)}.`);
    if (attempt < RETRIES && (TRANSIENT.has(s.error.code) || s.error.code === 'cost-changed')) { console.error(`${y.label}: przerwane (${s.error.code}: ${s.error.message}) po ${s.result?.runs} zakresach, wznawiam za ${RETRY_MS / 1000} s`); await sleep(RETRY_MS); continue; }
    die(`${y.label}: import przerwany: ${s.error.message} Uruchom tę samą komendę, żeby wznowić.`);
  }
}
const fin = (await api('/api/candles/status')).j;
console.log(`Koniec. Wydano w tym przebiegu ${usd(Math.round(spentRun * 1e6) / 1e6)}. Budżet importu: wydano ${usd(fin?.open1s?.spentUsd)} z ${MAX_BUDGET} USD. Kredyt: pozostało ${usd(fin?.credit?.leftUsd)}. Czas: ${Math.round((Date.now() - t0) / 1000)} s.`);
