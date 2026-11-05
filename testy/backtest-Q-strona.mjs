// backtest-Q (przeglądarka): newsy w przyszłości replayu w prawdziwym replayu na świecach syntetycznych (Chrome/Edge headless, CDP), oba motywy.
// [U] 04.11.2026 «maja sie rysowac w przyszlosci tamgdzie nie ma swieczek». Strona testy/backtest-Q.html; zrzuty do R:/PROJEKTY/trading-hq-wt/backtest-wyniki/pasek-dnia-zrzuty/ (poza repo).
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const SHOTS = 'R:/PROJEKTY/trading-hq-wt/backtest-wyniki/pasek-dnia-zrzuty';
  const runs = {};
  const PORTS = { 'onyx-': 4910, 'platinum-': 4911, 'onyx-late': 4918, 'platinum-late': 4919, 'onyx-draw': 4923, 'platinum-draw': 4924, 'onyx-fwd': 4916, 'platinum-fwd': 4917, 'onyx-scroll1': 4912, 'platinum-scroll1': 4913, 'onyx-scroll2': 4914, 'platinum-scroll2': 4915 };
  function pageResult(theme, mode) {
    const rk = `${theme}-${mode}`;
    runs[rk] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-13', seed: 8 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-14', seed: 9 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-15', seed: 10 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      const S = await H.server(PORTS[rk], { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        let shot = null;
        try { mkdirSync(SHOTS, { recursive: true }); shot = path.join(SHOTS, `przyszlosc-${mode || 'start'}-${theme}.png`); } catch { shot = null; }
        return JSON.parse(await P.cdpPage(`${S.base}/__testy/backtest-Q.html?theme=${theme}${mode ? `&mode=${mode}` : ''}`, { width: 1920, height: 1080, timeoutMs: 180_000, shot }));
      } finally { S.stop(); }
    })();
    return runs[rk];
  }
  async function tagged(theme, mode, tag, min) {
    const res = await pageResult(theme, mode);
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }
  for (const theme of ['onyx', 'platinum']) {
    test(`backtest-Q: siatka przyszłości za ostatnią świecą, świece bez cen z przyszłości (${theme})`, () => tagged(theme, '', 'siatka', 2));
    test(`backtest-Q: podążanie za świecą bez zmian mimo pustego miejsca (${theme})`, () => tagged(theme, '', 'podążanie', 1));
    test(`backtest-Q: news dzisiejszy później niż kursor w pustym miejscu, zgodny z osią, najechanie na napis dnia (${theme})`, () => tagged(theme, 'scroll1', 'dziś', 3));
    test(`backtest-Q: dojście kursora do newsa: nic nie przeskakuje (${theme})`, () => tagged(theme, 'fwd', 'bez skoku', 4));
    test(`backtest-Q: news i dzień z następnego dnia po przewinięciu w prawo (${theme})`, () => tagged(theme, 'scroll2', 'jutro', 4));
    test(`backtest-Q: newsy dociągnięte w tle odświeżają wykres w pauzie (${theme})`, () => tagged(theme, 'late', 'dociąganie', 3));
    test(`backtest-Q: aktywne narzędzie rysowania: przyciski newsów nie przechwytują wskaźnika (${theme})`, () => tagged(theme, 'draw', 'rysowanie', 3));
  }
};
