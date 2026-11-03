// Zrzuty pakietu 1.7-4 „Prawy klik i nawigacja”: node testy/zrzuty-174.mjs [katalog]  (domyślnie zrzuty-robocze/1.7.0-p4 w repozytorium, poza gitem; albo zmienna ZRZUTY)
// Ta sama strona co testy/backtest-174-strona.mjs (testy/backtest-174.html) w trybie ?shots=1: strona sama prosi o zrzuty przez most CDP (window.__shot) w ważnych chwilach scenariusza
// (menu bez pozycji i z pozycją, wybór kroku, okna skoku do daty i ceny, „Szukam ceny…”, „Szukaj dalej”). Dwa przebiegi 1920×1080: Onyx i Platinum (telefon: tylko brak awarii, bez zrzutów).
// Dane wyłącznie syntetyczne, serwer testowy z THQ_TEST_PAGES=1 na własnych portach (4964+), zero sieci.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
const H = await imp('testy/pomocnicze.mjs');
const P = await imp('testy/przegladarka.mjs');
const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
const { writeRange } = await imp('lib/candles-store.mjs');
const { nyAt } = await imp('public/js/bt-czas.js');
const out = path.resolve(process.argv[2] || process.env.ZRZUTY || path.join(ROOT, 'zrzuty-robocze', '1.7.0-p4'));
mkdirSync(out, { recursive: true });
let port = 4964;
for (const theme of ['onyx', 'platinum']) {
  const dir = H.tmp();
  const cd = path.join(dir, 'chart-data');
  await syntheticDay(cd, { instrument: 'NQ', day: '2024-03-13', seed: 8 });
  await syntheticDay(cd, { instrument: 'NQ', day: '2024-03-12', seed: 3 });
  await syntheticDay(cd, { instrument: 'ES', day: '2024-03-12', seed: 5, has1s: false });
  const mk = (a, b, px0) => { const bars = []; let px = px0 * 100; for (let t = a; t < b; t += 60) { const o = px; px += (((t / 60) % 7) - 3) * 25; bars.push([t, o, Math.max(o, px) + 25, Math.min(o, px) - 25, px, 10]); } return { a, b, bars }; };
  for (const w of [mk(nyAt('2024-03-15', '08:00'), nyAt('2024-03-15', '17:00'), 5100), mk(nyAt('2024-03-17', '18:00'), nyAt('2024-03-18', '12:00'), 5110)]) writeRange('ES', '1m', w.a, w.b, w.bars, {}, { baseDir: cd });
  const S = await H.server(port++, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
  try {
    const txt = await P.cdpPage(`${S.base}/__testy/backtest-174.html?theme=${theme}&shots=1`, { width: 1920, height: 1080, timeoutMs: 300_000, bridge: { shotDir: out } });
    const res = JSON.parse(txt);
    const bad = res.checks.filter((c) => !c.ok);
    console.log(`${theme} 1920: ${res.checks.length - bad.length} ok, ${bad.length} źle${res.fatal ? ' FATAL ' + res.fatal.slice(0, 200) : ''}`);
    for (const c of bad) console.log('  ✗', c.tag, c.msg.slice(0, 200));
  } finally { S.stop(); }
}
