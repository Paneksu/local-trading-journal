// Zrzuty pakietu 1.7-1 „Pozycja na wykresie”: node testy/zrzuty-171.mjs [katalog]  (domyślnie zrzuty-robocze/1.7.0-p1 w repozytorium, poza gitem; albo zmienna ZRZUTY)
// Ta sama strona co testy/backtest-171-strona.mjs (testy/backtest-171.html) w trybie ?shots=1: strona sama prosi o zrzuty przez most CDP (window.__shot) w ważnych chwilach scenariusza
// (pozycja z liniami, przeciąganie SL z odczytem, +SL/+TP, SL usunięty, BE, okno części z podglądem, szuflada w edycji). Cztery przebiegi: Onyx i Platinum × 1920 i 375 px.
// Dane wyłącznie syntetyczne, serwer testowy z THQ_TEST_PAGES=1 na własnych portach (4880+), zero sieci.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
const H = await imp('testy/pomocnicze.mjs');
const P = await imp('testy/przegladarka.mjs');
const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
const out = path.resolve(process.argv[2] || process.env.ZRZUTY || path.join(ROOT, 'zrzuty-robocze', '1.7.0-p1'));
mkdirSync(out, { recursive: true });
let port = 4880;
for (const narrow of [false, true]) {
  for (const theme of ['onyx', 'platinum']) {
    const dir = H.tmp();
    await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-13', seed: 8 });
    await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
    const S = await H.server(port++, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
    try {
      const q = `?${narrow ? 'w=375&' : ''}theme=${theme}&shots=1`;
      const opts = narrow ? { width: 375, height: 812, mobile: true, timeoutMs: 300_000 } : { width: 1920, height: 1080, timeoutMs: 300_000 };
      const txt = await P.cdpPage(`${S.base}/__testy/backtest-171.html${q}`, { ...opts, bridge: { shotDir: out } });
      const res = JSON.parse(txt);
      const bad = res.checks.filter((c) => !c.ok);
      console.log(`${theme} ${narrow ? 375 : 1920}: ${res.checks.length - bad.length} ok, ${bad.length} źle${res.fatal ? ' FATAL ' + res.fatal.slice(0, 200) : ''}`);
    } finally { S.stop(); }
  }
}
