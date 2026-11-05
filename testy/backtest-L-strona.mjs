// backtest-L: handel i journaling jak w FX Replay w przeglądarce (Chrome/Edge headless, CDP) na serwerze testowym ze świecami syntetycznymi.
// Strona robocza testy/backtest-L.html: otwarty P&L na linii pozycji, pasek konta, szuflada, podgląd zlecenia, jednostki SL/TP, ryzyko % od bieżącego salda,
// zamknięcie 50% z linii, przeciąganie zlecenia oczekującego, Journal w klasycznym oknie (bez świec po zamknięciu, rysunki tylko w migawce trade'a), Ctrl+J.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  let run = null;
  async function pageResult() {
    run ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-13', seed: 8 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      const S = await H.server(4893, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-L.html`, { width: 1920, height: 1080, timeoutMs: 180_000 });
        return JSON.parse(txt);
      } finally { S.stop(); }
    })();
    return run;
  }
  async function tagged(tag, min) {
    const res = await pageResult();
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }

  test('backtest-L: podgląd zlecenia przed złożeniem: ryzyko $ i % salda, cel, R:R, kontrakty', () => tagged('podglad', 2));
  test('backtest-L: otwarty P&L na linii pozycji przy każdym ruchu kursora, equity w pasku = saldo + otwarty', () => tagged('pl', 5));
  test('backtest-L: szuflada Pozycje: P&L, R, MAE/MFE na żywo, wiersze bez przebudowy przy kroku', () => tagged('szuflada', 4));
  test('backtest-L: zamknięcie 50% z linii pozycji (X → procenty), reszta z szuflady, prowizja w trade\'zie', () => tagged('procent', 5));
  test('backtest-L: szybki panel po zamknięciu odchudzony (wynik, Setup, Journal), „Do opisania”', () => tagged('szybki', 2));
  test('backtest-L: ryzyko % od bieżącego salda w replayu, short z prowizją', () => tagged('ryzyko', 2));
  test('backtest-L: SL i TP w punktach, tickach albo cenie', () => tagged('jednostki', 3));
  test('backtest-L: przeciągnięcie zlecenia oczekującego i jego SL na wykresie, odrzucenie za rynek, anulowanie z szuflady', () => tagged('zlecenie', 7));
  test('backtest-L: Journal: klasyczne okno, świece po wyjściu do znaku wodnego (zaraz po zamknięciu bez nich, po cofnięciu kursora do znaku wodnego i nie dalej), rysunki tylko w migawce, Setup i notatka, Ctrl+J, Historia', () => tagged('journal', 20));
};
