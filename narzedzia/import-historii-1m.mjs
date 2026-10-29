// Import historii 1m (Databento ohlcv-1m, ES i NQ) przez działający dashboard. P25 (27.10.2026).
// Skrypt jest tylko klientem lokalnego dashboardu (127.0.0.1): klucz Databento, liczniki wydatków i strażnik kredytu zostają w jednym
// procesie (serwerze), więc nic nie rozjedzie się z config.local.json. Domyślnie TYLKO WYCENA (get_cost jest bezpłatne), nic nie kosztuje.
// Pobieranie startuje dopiero z --potwierdzam-usd=KWOTA (wycena całości z poprzedniego przebiegu) i --limity-do-usd=KWOTA
// (jawne podniesienie limitów aplikacji 1 USD/pobranie i 3 USD/dobę tylko dla tego importu; limit portalu i strażnik kredytu zostają).
// Przerwany import wznawiasz tą samą komendą: pobiera tylko brakujące zakresy. Użycie:
//   node narzedzia/import-historii-1m.mjs [--instrument=ES|NQ|ALL] [--od=RRRR-MM-DD] [--do=RRRR-MM-DD] [--port=4321]
//        [--potwierdzam-usd=41.20 --limity-do-usd=45]
// English: 1m history import CLI; talks to the local dashboard, dry-run unless confirmed with an explicit amount.
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const PORT = Number(args.port || process.env.PORT) || 4321;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (msg) => { console.error(msg); process.exit(1); };

const known = new Set(['instrument', 'od', 'do', 'port', 'potwierdzam-usd', 'limity-do-usd']);
for (const k of Object.keys(args)) if (!known.has(k)) die(`Nieznany parametr --${k}. Dozwolone: ${[...known].map((x) => '--' + x).join(', ')}.`);
const instr = String(args.instrument || 'ALL').toUpperCase();
if (!['ES', 'NQ', 'ALL'].includes(instr)) die(`--instrument=${args.instrument}: dozwolone ES, NQ albo ALL.`);
const sec = (flag) => {
  if (args[flag] === undefined) return undefined;
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
const from = sec('od'), to = sec('do'), confirm = num('potwierdzam-usd'), override = num('limity-do-usd');
if (override !== undefined && confirm === undefined) die('--limity-do-usd działa tylko razem z --potwierdzam-usd (najpierw wycena bez parametrów kwotowych).');

async function api(path, body) {
  let r;
  try {
    r = await fetch(BASE + path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body), headers: { Origin: BASE, 'X-THQ': '1', 'Content-Type': 'application/json' } });
  } catch (e) {
    // Brak połączenia (nikt nie słucha) to co innego niż zerwane połączenie z działającym serwerem (np. długa wycena przekroczyła limit oczekiwania klienta).
    const codes = [e?.cause?.code, ...(e?.cause?.errors || []).map((x) => x?.code)].filter(Boolean); // na Windows odmowa połączenia bywa AggregateError
    const code = codes[0] || '';
    if (codes.length && codes.every((c) => ['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH'].includes(c))) die(`Nie można połączyć się z dashboardem na ${BASE} (${code}). Uruchom dashboard (Dashboard.cmd) i spróbuj ponownie, albo podaj --port.`);
    die(`Połączenie z dashboardem na ${BASE} zostało zerwane albo przekroczono czas oczekiwania (${code || e?.message || 'brak szczegółów'}). Serwer mógł dalej pracować: sprawdź ${BASE}/api/candles/status i spróbuj ponownie.`);
  }
  let j = null, text = '';
  try { text = await r.text(); j = JSON.parse(text); } catch { /* odpowiedź bez JSON */ }
  if (j === null && r.status >= 400) j = { error: `odpowiedź bez JSON: ${text.slice(0, 200) || 'pusta'}` };
  return { status: r.status, j };
}
const usd = (x) => (typeof x === 'number' ? x.toFixed(4) : String(x)) + ' USD';
const body = (inst) => ({ instrument: inst, ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) });

const list = instr === 'ALL' ? ['ES', 'NQ'] : [instr];
let grand = 0;
const plans = [];
for (const inst of list) {
  const p = await api('/api/candles/import', { ...body(inst), dryRun: true });
  if (p.status !== 200) die(`${inst}: wycena nie powiodła się (${p.status}): ${p.j?.error || 'brak szczegółów'}`);
  console.log(`${inst}: zakresów do pobrania ${p.j.runs}, wycena ${usd(p.j.totalUsd)}${p.j.nothing ? ' (wszystko już pobrane)' : ''}`);
  grand += p.j.totalUsd;
  plans.push({ inst, plan: p.j });
}
const c = plans[0]?.plan.credit;
console.log(`Razem: ${usd(grand)}. Kredyt: pozostało ${usd(c?.leftUsd)} z ${c?.startUsd} USD, wygasa ${c?.expires}. Limity aplikacji: ${plans[0]?.plan.limitUsd} USD/pobranie, ${plans[0]?.plan.dailyLimitUsd} USD/dobę.`);
if (confirm === undefined) {
  console.log('Tryb wyceny: nic nie pobrano. Żeby pobrać, uruchom ponownie z --potwierdzam-usd=<razem> --limity-do-usd=<razem + zapas>.');
  process.exit(0);
}
if (grand > confirm * 1.05) die(`Wycena ${usd(grand)} jest wyższa niż potwierdzona ${usd(confirm)} (+5%). Nic nie pobrano; potwierdź nową kwotę.`);

for (const { inst, plan } of plans) {
  if (plan.nothing) continue;
  // Każdy instrument to osobny import na serwerze: potwierdzany własną wyceną (plan.totalUsd), a --limity-do-usd trafia do KAŻDEGO z nich w tej samej kwocie
  // (nie jest pomniejszane o to, co wydał poprzedni instrument). Przy ALL łączny wydatek może więc sięgnąć dwukrotności tej kwoty; hamują go wtedy
  // wyłącznie strażnik kredytu aplikacji i limit portalu Databento, więc podawaj kwotę z rozsądnym zapasem ponad wycenę jednego instrumentu.
  const r = await api('/api/candles/import', { ...body(inst), confirmedCostUsd: plan.totalUsd, ...(override !== undefined ? { limitsOverrideUsd: override } : {}) });
  if (r.status !== 200 || !r.j?.started) die(`${inst}: import nie wystartował (${r.status}): ${r.j?.error || JSON.stringify(r.j)}`);
  console.log(`${inst}: start, ${r.j.runs} zakresów, ${usd(r.j.costUsd)}`);
  for (;;) {
    await sleep(2000);
    const s = (await api('/api/candles/status')).j;
    if (!s) die('Brak odpowiedzi /api/candles/status.');
    process.stdout.write(`\r${inst}: ${s.done}/${s.total}   `);
    if (!s.running) {
      process.stdout.write('\n');
      if (s.error) die(`${inst}: import przerwany: ${s.error.message} Uruchom tę samą komendę, żeby wznowić.`);
      console.log(`${inst}: gotowe, dodano ${s.result?.added} świec, wydano ${usd(s.result?.costUsd)}.`);
      break;
    }
  }
}
const fin = (await api('/api/candles/status')).j;
console.log(`Kredyt po imporcie: pozostało ${usd(fin?.credit?.leftUsd)}.`);
