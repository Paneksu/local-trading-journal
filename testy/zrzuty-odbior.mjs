// Zrzuty odbioru 1.7.0 (poprawki wyglądu): ta sama strona co testy/backtest-odbior-strona.mjs (testy/backtest-odbior-poprawki.html) w trybie ?shots=1, Onyx i Platinum 1920×1080 oraz 375 (minimum).
// Zlecenia oczekujące w rozsuwaniu, notka przeglądania, Journal z podpisem BE w marginesie, plakietki bez poziomów 0 kontraktów. Dane syntetyczne, serwer testowy z THQ_TEST_PAGES=1 (porty 5331+), zero sieci.
// Użycie: node testy/zrzuty-odbior.mjs [katalog wyjściowy]  (domyślnie zrzuty-robocze/1.7.0-odbior w repozytorium, poza gitem; albo zmienna ZRZUTY)
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
const H = await imp('testy/pomocnicze.mjs');
const P = await imp('testy/przegladarka.mjs');
const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
const out = path.resolve(process.argv[2] || process.env.ZRZUTY || path.join(ROOT, 'zrzuty-robocze', '1.7.0-odbior'));
mkdirSync(out, { recursive: true });
let port = 5331;
for (const theme of ['onyx', 'platinum']) {
  const dir = H.tmp();
  const cd = path.join(dir, 'chart-data');
  await syntheticDay(cd, { instrument: 'NQ', day: '2024-03-13', seed: 8 });
  await syntheticDay(cd, { instrument: 'NQ', day: '2024-03-12', seed: 3 });
  const S = await H.server(port++, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
  try {
    const txt = await P.cdpPage(`${S.base}/__testy/backtest-odbior-poprawki.html?theme=${theme}&shots=1`, { width: 1920, height: 1080, timeoutMs: 300_000, bridge: { shotDir: out } });
    const res = JSON.parse(txt);
    const bad = res.checks.filter((c) => !c.ok);
    console.log(`${theme} 1920: ${res.checks.length - bad.length} ok, ${bad.length} źle${res.fatal ? ' FATAL ' + res.fatal.slice(0, 200) : ''}`);
    for (const c of bad) console.log('  ✗', c.tag, c.msg.slice(0, 200));
  } finally { S.stop(); }
}
// 375 px: tylko minimum (zlecenia oczekujące, brak poziomego przewijania); bez oceny wyglądu telefonu
for (const theme of ['onyx', 'platinum']) {
  const dir = H.tmp();
  const cd = path.join(dir, 'chart-data');
  await syntheticDay(cd, { instrument: 'NQ', day: '2024-03-13', seed: 8 });
  await syntheticDay(cd, { instrument: 'NQ', day: '2024-03-12', seed: 3 });
  const S = await H.server(port++, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
  try {
    const txt = await P.cdpPage(`${S.base}/__testy/backtest-odbior-poprawki.html?w=375&theme=${theme}&shots=1`, { width: 375, height: 812, mobile: true, timeoutMs: 300_000, bridge: { shotDir: out } });
    const res = JSON.parse(txt);
    const bad = res.checks.filter((c) => !c.ok && c.tag === 'telefon');
    console.log(`${theme} 375: ${res.checks.filter((c) => c.tag === 'telefon').length - bad.length} ok, ${bad.length} źle${res.fatal ? ' FATAL ' + res.fatal.slice(0, 200) : ''}`);
  } finally { S.stop(); }
}
H.killAll();
process.exit(0);
