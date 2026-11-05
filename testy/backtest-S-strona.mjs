// backtest-S (przeglądarka): ścieżka użytkownika po przeglądzie kodu (04.11.2026, ostatnia runda): zmiana interwału z siatką newsów po obu stronach (1m → 1h → 1m → 5s → własny 7m → 1m),
// licznik 5s poza oknem 1s (faktyczny odstęp świec) i „Brak notowań” w dziurze danych 1m. Strona testy/backtest-S.html, prawdziwy replay na świecach syntetycznych (Chrome/Edge headless).
// Zrzut stanu: backtest-wyniki/pasek-dnia-zrzuty/replay-interwal-brak-notowan.png.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const SHOTS = 'R:/PROJEKTY/trading-hq-wt/backtest-wyniki/pasek-dnia-zrzuty';
  const runs = {};
  function pageResult(mode = 'main') {
    runs[mode] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const store = await imp('lib/candles-store.mjs');
      const dir = H.tmp();
      const base = path.join(dir, 'chart-data');
      // tryb gaps: sekundy bez transakcji co 3 s w całym oknie 1s (siatka 1s przeskakuje punkty i trzeba ją przebudować)
      const open = Date.UTC(2024, 2, 12, 13, 30) / 1000, gaps = []; if (mode === 'gaps') for (let t = open + 2; t < open + 90 * 60; t += 3) gaps.push(t);
      await syntheticDay(base, { instrument: 'NQ', day: '2024-03-13', seed: 8 });
      await syntheticDay(base, { instrument: 'NQ', day: '2024-03-12', seed: 3, gaps });
      // dziura w danych 1m: 12:00–12:20 NY (EDT = UTC-4) bez żadnej świecy, ale w pokryciu (jak minuty bez transakcji)
      const h0 = Date.UTC(2024, 2, 12, 16, 0) / 1000;
      if (mode === 'main') store.writeRange('NQ', '1m', h0, h0 + 20 * 60, [], {}, { baseDir: base });
      const S = await H.server(mode === 'gaps' ? 4926 : 4925, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        let shot = null;
        try { mkdirSync(SHOTS, { recursive: true }); shot = mode === 'gaps' ? null : path.join(SHOTS, 'replay-interwal-brak-notowan.png'); } catch { shot = null; }
        return JSON.parse(await P.cdpPage(`${S.base}/__testy/backtest-S.html${mode === 'gaps' ? '?gaps=1' : ''}`, { width: 1600, height: 1000, timeoutMs: 170_000, shot }));
      } finally { S.stop(); }
    })();
    return runs[mode];
  }
  async function tagged(tag, min, mode = 'main') {
    const res = await pageResult(mode);
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    if (process.env.SHOW_CHECKS) console.log(mine.map((c) => `${c.ok ? 'ok' : 'NOK'} ${c.msg}`).join('\n'));
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }
  test('backtest-S: zmiana interwału z siatką newsów na ścieżce użytkownika (1m → 1h → 1m → 5s → własny 7m → 1m): ostatnia świeca w widoku, siatka istnieje, kroki podążają', () => tagged('interwał', 22));
  test('backtest-S: licznik 5s poza oknem 1s liczy ze świec minutowych (40 s o 12:30:20), w oknie 1s do 5 s', () => tagged('licznik', 3));
  test('backtest-S: „Brak notowań” w dziurze danych 1m, bez odliczania; licznik wraca po dziurze', () => tagged('brak', 4));
  test('backtest-S: siatka 1s przy lukach w danych (co trzecia sekunda bez świecy): krok p95 ≤ 16 ms, przebudowy siatki policzone', () => tagged('luki', 3, 'gaps'));
};
