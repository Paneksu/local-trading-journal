// Ta sama strona co testy/backtest-175-strona.mjs (testy/backtest-175.html) w trybie ?shots=1: strona sama prosi o zrzuty przez most CDP (window.__shot) w ważnych chwilach scenariusza
// (bilet z listą TP, edytor procentu, przeciąganie poziomu, dwa i cztery poziomy, poziomy przy krawędzi, przed i po trafieniu TP1, Journal z tabelą poziomów, preset z drabiną,
// edytor listy TP w szufladzie). Dwa przebiegi 1920×1080: Onyx i Platinum (telefon: tylko brak awarii, bez zrzutów do oceny). Dane wyłącznie syntetyczne, serwer testowy z THQ_TEST_PAGES=1
// na własnych portach (4985+), zero sieci. Użycie: node testy/zrzuty-175.mjs [katalog wyjściowy]
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
const H = await imp('testy/pomocnicze.mjs');
const P = await imp('testy/przegladarka.mjs');
const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
const out = path.resolve(process.argv[2] || process.env.ZRZUTY || path.join(ROOT, 'zrzuty-robocze', '1.7.0-p5'));
mkdirSync(out, { recursive: true });
let port = 4985;
for (const theme of ['onyx', 'platinum']) {
  const dir = H.tmp();
  const cd = path.join(dir, 'chart-data');
  await syntheticDay(cd, { instrument: 'NQ', day: '2024-03-13', seed: 8 });
  await syntheticDay(cd, { instrument: 'NQ', day: '2024-03-12', seed: 3 });
  const S = await H.server(port++, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
  try {
    const txt = await P.cdpPage(`${S.base}/__testy/backtest-175.html?theme=${theme}&shots=1`, { width: 1920, height: 1080, timeoutMs: 300_000, bridge: { shotDir: out } });
    const res = JSON.parse(txt);
    const bad = res.checks.filter((c) => !c.ok);
    console.log(`${theme} 1920: ${res.checks.length - bad.length} ok, ${bad.length} źle${res.fatal ? ' FATAL ' + res.fatal.slice(0, 200) : ''}`);
    for (const c of bad) console.log('  ✗', c.tag, c.msg.slice(0, 200));
  } finally { S.stop(); }
}
