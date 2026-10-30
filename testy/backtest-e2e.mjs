// Odbiór modułu Backtest (pakiet H1, 1.5.0) na KOPII prawdziwych świec: pomiary §9 i scenariusz pełny §16 w Chrome/Edge headless (CDP, czas rzeczywisty).
// Uruchamiany OSOBNO od testy/run.mjs (wymaga kopii świec, której nie ma w repo):
//   1) node narzedzia/kopia-swiec-odbior.mjs --od=2019-09-01      → R:/PROJEKTY/trading-hq-wt/backtest-dane/chart-data (tylko odczyt produkcji)
//   2) node testy/backtest-e2e.mjs [> backtest-wyniki/H1-e2e.txt]
// Skrypt sam uruchamia atrapę Notion (4399) i dashboard testowy (4331) z THQ_CONFIG_DIR = TEST_CONFIG_DIR (domyślnie backtest-dane), po migracjach Notion do 006
// na atrapie, i zatrzymuje je na końcu (wyłącznie własne procesy potomne). Port 4321 (prawdziwy dashboard) i prawdziwe Notion są zakazane; bez klucza Databento.
// Przed przebiegiem kasuje w katalogu testowym tylko chart-data/backtest (sesje i indeks dni) i konfigurację atrapy: pierwsze zbudowanie indeksu jest mierzone od zera.
// Zrzuty robocze: WYNIKI (domyślnie R:/PROJEKTY/trading-hq-wt/backtest-wyniki), nigdy w repo ani w wydaniu (dane CME tylko do użytku własnego).
// Wynik: linie ✓/✗, liczby pomiarów i podsumowanie „N passed, M failed”; kod wyjścia 1 przy porażce. JSON ze szczegółami: WYNIKI/H1-e2e.json.
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import * as H from './pomocnicze.mjs';
import { cdpPage, findBrowser } from './przegladarka.mjs';
import { checkTestDir } from '../narzedzia/katalog-testowy.mjs';

const ROOT = H.ROOT;
const DATA = path.resolve(process.env.TEST_CONFIG_DIR || 'R:/PROJEKTY/trading-hq-wt/backtest-dane');
const WYNIKI = path.resolve(process.env.WYNIKI || 'R:/PROJEKTY/trading-hq-wt/backtest-wyniki');
const PORT = Number(process.env.TEST_PORT || 4331), MOCK = Number(process.env.ATRAPA_PORT || 4399);
const ONLY = (process.env.ONLY || 'indeks,wydajnosc,scenariusz').split(',');
const die = (m) => { console.error(m); process.exit(2); };
const inside = (p, d) => path.resolve(p).toLowerCase().startsWith(path.resolve(d).toLowerCase() + path.sep) || path.resolve(p).toLowerCase() === path.resolve(d).toLowerCase();
if (PORT === 4321 || MOCK === 4321) die('Port 4321 to prawdziwy dashboard: odbiór działa tylko na instancji testowej.');
if (inside(DATA, ROOT)) die(`TEST_CONFIG_DIR ${DATA} leży w worktree: świece nie mogą trafić do repo.`);
// H2 (S7, P1): katalog danych tylko z allowlisty (backtest-dane albo katalog tymczasowy), sprawdzany po realpath; produkcja zawsze odrzucona (zanim cokolwiek zostanie skasowane)
try { checkTestDir(DATA, { what: 'TEST_CONFIG_DIR' }); } catch (e) { die(e.message); }
if (!existsSync(path.join(DATA, 'chart-data', 'candles', 'NQ', 'coverage.json'))) die(`Brak kopii świec w ${DATA}: uruchom najpierw narzedzia/kopia-swiec-odbior.mjs.`);
const envF = path.join(DATA, '.env');
if (existsSync(envF) && /^\s*DATABENTO_API_KEY\s*=\s*\S/m.test(readFileSync(envF, 'utf8'))) die('TEST_CONFIG_DIR/.env ma klucz Databento: instancja testowa musi działać bez niego.');
if (!findBrowser()) die('Brak Chrome/Edge.');
mkdirSync(WYNIKI, { recursive: true });

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? '✓' : '✗'} ${name}${info ? ' | ' + info : ''}`); };
const report = { started: new Date().toISOString(), data: DATA };

// ---- przygotowanie katalogu testowego: świeży stan backtestu i konfiguracja atrapy (schemat v2 → migracje do 006) ----
const btDir = path.join(DATA, 'chart-data', 'backtest');
if (inside(btDir, DATA) && existsSync(btDir)) rmSync(btDir, { recursive: true, force: true });
for (const f of ['config.local.json', '.env']) rmSync(path.join(DATA, f), { force: true });
writeFileSync(path.join(DATA, 'config.local.json'), JSON.stringify({ schemaVersion: 2, lang: 'pl' }));
const ENV = { NOTION_TOKEN: 'test-token-atrapa', NOTION_VERSION: '2026-03-11', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_CONFIG_DIR: DATA };

let A = null, S = null;
const pids = [];
try {
  A = await H.atrapa(MOCK);
  pids.push(A.p.pid);
  const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], H.cleanEnv({ ...ENV, NOTION_API_BASE: A.base }));
  check('migracje Notion do 006 na atrapie', mig.code === 0, mig.code === 0 ? '' : String(mig.err || mig.out).slice(0, 300));
  S = await H.server(PORT, { ...ENV, NOTION_API_BASE: A.base, THQ_TEST_PAGES: '1' });
  pids.push(S.p.pid);
  console.log(`instancja testowa: dashboard ${S.base} (PID ${S.p.pid}), atrapa ${A.base} (PID ${A.p.pid}), dane ${DATA}`);
  const cfgTxt = existsSync(envF) ? readFileSync(envF, 'utf8') : '';
  check('instancja bez klucza Databento', !/DATABENTO_API_KEY\s*=\s*\S/.test(cfgTxt) && !process.env.DATABENTO_API_KEY, 'TEST_CONFIG_DIR/.env i środowisko bez klucza');

  // ---- indeks dni na prawdziwych danych: pierwsze zbudowanie (bez progu) i drugie ≤ 300 ms; blokada pętli serwera mierzona pingiem w trakcie ----
  if (ONLY.includes('indeks')) {
    const q = `${S.base}/api/backtest/days?instruments=NQ&from=2020-01-02&to=2024-12-31`;
    const pings = [];
    let building = true;
    const pinger = (async () => { while (building) { const t0 = performance.now(); await fetch(`${S.base}/api/ping`); pings.push(performance.now() - t0); await H.sleep(20); } })();
    let t0 = performance.now();
    const r1 = await (await fetch(q)).json();
    const first = performance.now() - t0;
    building = false; await pinger;
    t0 = performance.now();
    const r2 = await (await fetch(q)).json();
    const second = performance.now() - t0;
    t0 = performance.now();
    await (await fetch(q)).json();
    const third = performance.now() - t0;
    const n1s = r1.days.filter((d) => d.has1s?.NQ).length;
    report.index = { first: Math.round(first), second: Math.round(second), third: Math.round(third), days: r1.days.length, has1s: n1s, pingMax: Math.round(Math.max(0, ...pings)), pings: pings.length };
    check('backtest-H1: indeks na prawdziwych danych', r1.days.length > 1000 && second <= 300 && third <= 300,
      `pierwsze zbudowanie ${first.toFixed(0)} ms (bez progu), drugie ${second.toFixed(0)} ms, trzecie ${third.toFixed(0)} ms (próg 300); dni ${r1.days.length}, z 1s NQ ${n1s}; najdłuższy ping w trakcie budowy ${report.index.pingMax} ms`);
    check('backtest-H1: indeks zgodny z trasą dnia (tydzień rolla)', r2.days.find((d) => d.day === '2024-03-12')?.has1s?.NQ === true, '2024-03-12 (CPI, tydzień rolla) ma 1s w indeksie');
    const closed = ['2024-01-01', '2024-03-29', '2024-12-25'];
    check('backtest-H1: dni bez handlu poza pulą', closed.every((d) => r2.days.find((x) => x.day === d)?.has1s?.NQ === false), `${closed.join(', ')}: has1s = false (pokrycie bez świec); dni bez 1s w 2020–2024: ${r2.days.filter((d) => !d.has1s?.NQ).map((d) => d.day).join(' ')}`);
  }

  const page = async (name, { timeoutMs = 300_000, width = 1920, height = 1080, shot = null } = {}) => {
    const txt = await cdpPage(`${S.base}/__testy/${name}`, { width, height, timeoutMs, shot });
    const res = JSON.parse(txt);
    if (res.fatal) check(`${name}: strona bez błędu krytycznego`, false, res.fatal.slice(0, 400));
    for (const c of res.checks.filter((x) => x.tag === 'błąd strony')) check(`${name}: błąd strony`, false, c.msg.slice(0, 300));
    return res;
  };
  const tagged = (res, tag, name) => {
    const mine = res.checks.filter((c) => c.tag === tag);
    const bad = mine.filter((c) => !c.ok);
    check(name, mine.length > 0 && !bad.length, (bad.length ? 'NIEUDANE: ' + bad.map((c) => c.msg).join(' || ') + ' || ' : '') + mine.filter((c) => c.ok).map((c) => c.msg).join(' | '));
  };

  if (ONLY.includes('wydajnosc')) {
    const res = await page('backtest-wydajnosc.html', { shot: path.join(WYNIKI, 'H1-wydajnosc.png') });
    report.perf = res.perf;
    tagged(res, 'krok', 'backtest-H1: krok ≤ 16 ms p95');
    tagged(res, 'odtwarzanie', 'backtest-H1: odtwarzanie 100× przez 90 min');
    tagged(res, 'podpisy', 'backtest-J: odtwarzanie 100× na 1s z trzema pozycjami „Zawsze pokazuj”');
    tagged(res, 'skok', 'backtest-H1: skok do następnego dnia ≤ 1,5 s');
  }

  if (ONLY.includes('scenariusz')) {
    const res = await page('backtest-odbior.html', { timeoutMs: 600_000, shot: path.join(WYNIKI, 'H1-scenariusz.png') });
    report.scenario = res.info || {};
    for (const [tag, name] of [
      ['kreator', 'backtest-H1: sesja CPI 2024'], ['dni', 'backtest-H1: trzy dni'], ['trade', "backtest-H1: trade'y"], ['rysunki', 'backtest-H1: rysunki z calloutem'],
      ['journal', 'backtest-H1: journaling'], ['notion', 'backtest-H1: Zakończ dzień → atrapa Notion'], ['staty', 'backtest-H1: statystyki'],
      ['tf', 'backtest-H1: TF sekundowe współgrają'], ['przyszlosc', 'backtest-H1: brak przyszłości end-to-end'],
    ]) tagged(res, tag, name);
    // atrapa Notion: strony Backtest z polami, znacznik sesji, MAE/MFE, rysunki; bez dubli po drugim „Zapisz do Notion”
    const pages = await A.get('/__test/pages?ds=trades');
    const sid = res.info?.sessionId;
    const txt = (p) => (p?.rich_text || p?.title || []).map((x) => x.plain_text ?? x.text?.content ?? '').join('');
    const bt = pages.filter((p) => Object.values(p.p).some((v) => v?.type === 'rich_text' && txt(v).includes(`[${sid}/`)));
    const markers = bt.map((p) => Object.values(p.p).map((v) => (v?.type === 'rich_text' ? txt(v) : '')).join(' ').match(/\[bt-[a-z0-9]+\/t\d+\]/)?.[0]).filter(Boolean);
    const want = res.info?.sentIds || [];
    const files = await A.get('/__test/uploads').catch(() => []);
    report.notion = { pages: bt.length, markers, want, uploads: files.length, sample: bt[0]?.p ? Object.fromEntries(Object.entries(bt[0].p).map(([k, v]) => [k, v?.type === 'number' ? v.number : v?.type === 'select' ? v.select?.name : v?.type === 'date' ? v.date?.start : txt(v) || v?.type])) : null };
    check('backtest-H1: atrapa Notion ma strony trade\'ów sesji bez dubli', bt.length === want.length && new Set(markers).size === markers.length && want.every((id) => markers.some((m) => m.endsWith(`/${id}]`))),
      `stron ${bt.length}, oczekiwane ${want.length} (${want.join(', ')}), znaczniki ${markers.join(' ')}`);
    // pola stron względem trade'ów sesji (typ, R, USD, MAE/MFE, znacznik sesji) i rysunki T1 (linia i callout narysowane przed zamknięciem)
    const idOf = (p) => Object.values(p).map((v) => (v?.type === 'rich_text' ? txt(v) : '')).join(' ').match(/\[bt-[a-z0-9]+\/(t\d+)\]/)?.[1];
    const byId = Object.fromEntries(bt.map((p) => [idOf(p.p), p.p]));
    const fieldBad = [];
    for (const tr of res.info?.trades || []) {
      const p = byId[tr.id];
      if (!p) { fieldBad.push(`${tr.id}: brak strony`); continue; }
      const num = (k) => p[k]?.number;
      if (p.Typ?.select?.name !== 'Backtest') fieldBad.push(`${tr.id}: Typ ${p.Typ?.select?.name}`);
      if (num('R') !== tr.r || num('P&L $') !== tr.pnl) fieldBad.push(`${tr.id}: R ${num('R')}/${tr.r}, P&L ${num('P&L $')}/${tr.pnl}`);
      if (num('MAE (R)') !== tr.maeR || num('MFE (R)') !== tr.mfeR) fieldBad.push(`${tr.id}: MAE/MFE ${num('MAE (R)')}/${num('MFE (R)')} zamiast ${tr.maeR}/${tr.mfeR}`);
      if (!txt(p['Sesja backtestu']).startsWith('CPI 2024 [')) fieldBad.push(`${tr.id}: Sesja backtestu „${txt(p['Sesja backtestu'])}”`);
    }
    let draw = null;
    try { draw = JSON.parse(txt(byId.t1?.Rysunki)); } catch { draw = null; }
    const kinds = (draw?.d || []).map((x) => x.kind).sort().join(',');
    check('backtest-H1: pola stron w atrapie i rysunki', fieldBad.length === 0 && (res.info?.trades || []).length === 4 && kinds === 'callout,trend-line',
      `${fieldBad.length ? 'NIEZGODNE: ' + fieldBad.join('; ') + ' | ' : ''}Typ, R, P&L $, MAE (R), MFE (R), Sesja backtestu zgodne z sesją (${(res.info?.trades || []).length} trade'y); Rysunki t1: ${kinds || 'brak'}`);
  }
} catch (e) {
  check('przebieg bez wyjątku', false, String(e?.stack || e).slice(0, 600));
} finally {
  // wyłącznie własne procesy potomne (PID z tego przebiegu)
  for (const p of [S?.p, A?.p]) { try { p?.kill(); } catch { /* już nie żyje */ } }
  await H.sleep(500);
  report.pids = pids;
  report.results = results;
  writeFileSync(path.join(WYNIKI, 'H1-e2e.json'), JSON.stringify(report, null, 1));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed (procesy ${pids.join(', ')} zatrzymane)`);
  process.exit(failed ? 1 : 0);
}
