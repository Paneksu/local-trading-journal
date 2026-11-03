// Zrzuty odbioru 1.7.0 (strefa czasu NY): prawdziwy dashboard z atrapą Notion (stare wpisy w Europe/Warsaw), scenariusz testy/scen-odbior-strefa.js z mostem CDP:
// lista trade'ów z „Data NY”, formularz z etykietami NY, Ustawienia → Strefa czasu, Kopie i diagnostyka → Strefa starych wpisów (przed, podgląd, wynik). Onyx i Platinum, 1920×1080.
// Tylko atrapa Notion i katalogi tymczasowe, zero sieci. Użycie: node testy/zrzuty-odbior-strefa.mjs [katalog wyjściowy]  (domyślnie zrzuty-robocze/1.7.0-odbior-strefa; albo ZRZUTY)
import path from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
const H = await imp('testy/pomocnicze.mjs');
const P = await imp('testy/przegladarka.mjs');
const out = path.resolve(process.argv[2] || process.env.ZRZUTY || path.join(ROOT, 'zrzuty-robocze', '1.7.0-odbior-strefa'));
mkdirSync(out, { recursive: true });
const scen = readFileSync(path.join(ROOT, 'testy/scen-odbior-strefa.js'), 'utf8');
let port = 5341;
for (const theme of ['onyx', 'platinum']) {
  const A = await H.atrapa(port++, { ATRAPA_DEMO: '2' });
  const dir = H.tmp();
  const S = await H.server(port++, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'secret_atrapa', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_TZFIX_PACE_MS: '0', THQ_TEST_PAGES: '1' });
  try {
    const until = `(sessionStorage.getItem('zo') || (localStorage.clear(), localStorage.setItem('thq.theme', '${theme}'), sessionStorage.setItem('zo', '1'), location.reload(), false)) && document.readyState === 'complete' && !!window.__thq && !!document.querySelector('#view .page-head')`;
    const txt = await P.cdpPage(`${S.base}/`, { width: 1920, height: 1080, timeoutMs: 180_000, until, extract: scen, bridge: { shotDir: out } });
    const res = JSON.parse(txt);
    const bad = res.checks.filter((c) => !c.ok);
    console.log(`${theme}: ${res.checks.length - bad.length} ok, ${bad.length} źle${res.fatal ? ' FATAL ' + res.fatal.slice(0, 300) : ''}`);
    for (const c of bad) console.log('  ✗', c.tag, c.msg.slice(0, 200));
  } finally { S.stop(); A.stop(); }
}
H.killAll();
process.exit(0);
