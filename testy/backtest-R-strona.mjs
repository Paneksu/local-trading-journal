// backtest-R (przeglądarka): wykres backtestu z siatką przyszłości po przeglądzie kodu (04.11.2026): zmiana interwału 1m -> 1W/1M -> 1m, podążanie po zoomie kółkiem i po przewinięciu
// (z siatką i bez, w układzie wielu wykresów), skala ceny, czas krzyża w przyszłości. Strona testy/backtest-R.html (sam createReplayChart); zrzuty: backtest-wyniki/pasek-dnia-zrzuty/.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const SHOTS = 'R:/PROJEKTY/trading-hq-wt/backtest-wyniki/pasek-dnia-zrzuty';
  const runs = {};
  const PORTS = { all: 4920, '1W': 4921, multi: 4922 };
  function pageResult(stop) {
    runs[stop] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const S = await H.server(PORTS[stop], { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: H.tmp() });
      try {
        let shot = null;
        if (stop !== 'all') { try { mkdirSync(SHOTS, { recursive: true }); shot = path.join(SHOTS, `wykres-${stop}.png`); } catch { shot = null; } }
        return JSON.parse(await P.cdpPage(`${S.base}/__testy/backtest-R.html${stop === 'all' ? '' : `?stop=${stop}`}`, { width: 1000, height: 1300, timeoutMs: 170_000, shot }));
      } finally { S.stop(); }
    })();
    return runs[stop];
  }
  async function tagged(stop, tag, min) {
    const res = await pageResult(stop);
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }
  test('backtest-R: zmiana interwału z siatką (1m → 1W → 1M → 1m): ostatnia świeca w widoku, rightOffset wraca do marginesu', () => tagged('all', 'interwał', 6));
  test('backtest-R: po zoomie kółkiem i po przewinięciu wykres podąża za świecą tak samo z siatką i bez (układ trzech wykresów), widok w przeszłości stoi', () => tagged('all', 'podążanie', 9));
  test('backtest-R: dwa zdarzenia w jednej klatce (reset po resecie, reset i kroki) nie wypychają widoku w przyszłość', () => tagged('all', 'klatka', 2));
  test('backtest-R: skala ceny z siatką taka sama jak bez (siatka nie ma cen)', () => tagged('all', 'skala', 1));
  test('backtest-R: krzyż nad pustym miejscem nie zwraca czasu z przyszłości, nad świecą zwraca jej czas', () => tagged('all', 'krzyż', 2));
  test('backtest-R: zrzuty stanów po poprawce (1W po zmianie interwału, trzy wykresy po zoomie i krokach)', async () => { await tagged('1W', 'interwał', 3); await tagged('multi', 'podążanie', 2); });
};
