// backtest-P (przeglądarka): czas wykresu ze strefą i odliczanie do zamknięcia świecy w prawdziwym replayu na świecach syntetycznych (Chrome/Edge headless, CDP).
// Strona robocza testy/backtest-P.html; zrzuty w obu motywach do R:/PROJEKTY/trading-hq-wt/backtest-wyniki/pasek-dnia-zrzuty/ (poza repo).
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const SHOTS = 'R:/PROJEKTY/trading-hq-wt/backtest-wyniki/pasek-dnia-zrzuty';
  const runs = {};
  function pageResult(theme, hover = false) {
    const rk = theme + (hover ? '-h' : '');
    runs[rk] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-13', seed: 8 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      const S = await H.server(theme === 'onyx' ? (hover ? 4898 : 4896) : (hover ? 4899 : 4897), { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        let shot = null;
        try { mkdirSync(SHOTS, { recursive: true }); shot = path.join(SHOTS, `replay-odliczanie-${hover ? 'najechanie-' : ''}${theme}.png`); } catch { shot = null; }
        return JSON.parse(await P.cdpPage(`${S.base}/__testy/backtest-P.html?theme=${theme}${hover ? '&hover=1' : ''}`, { width: 1920, height: 1080, timeoutMs: 180_000, shot }));
      } finally { S.stop(); }
    })();
    return runs[rk];
  }
  async function tagged(theme, tag, min, hover = false) {
    const res = await pageResult(theme, hover);
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }
  for (const theme of ['onyx', 'platinum']) {
    test(`backtest-P: zegar ze strefą widoczną przy godzinie (${theme})`, () => tagged(theme, 'zegar', 2));
    test(`backtest-P: odliczanie do zamknięcia świecy: krok, zmiana interwału, układ (${theme})`, () => tagged(theme, 'odliczanie', 3));
    test(`backtest-P: napis dnia na wykresie backtestu i zwykły stan handlu, po najechaniu zrzut (${theme})`, () => tagged(theme, 'pasek', 2, true));
    test(`backtest-P: licznik w nagłówku wykresu, cyfry tabelaryczne (${theme})`, () => tagged(theme, 'układ', 2));
  }
};
