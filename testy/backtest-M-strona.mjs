// backtest-M: funkcjonalny design replayu w przeglądarce (Chrome/Edge headless, CDP) na serwerze testowym ze świecami syntetycznymi.
// Strona robocza testy/backtest-M.html (1920 i ?w=375): zegar ze strefą i godziną NY, podpowiedzi skrótów, pamięć SL/TP, etykiety przy lewej krawędzi, SL/TP pozycji z kwotą,
// skróty BE i połowy, szybki panel i Journal z klawiatury, menu skoków, stan Notion, układ wąskiego ekranu.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const runs = {};
  function pageResult(narrow) {
    runs[narrow] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-13', seed: 8 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      const S = await H.server(narrow ? 4895 : 4894, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-M.html${narrow ? '?w=375' : ''}`, narrow ? { width: 375, height: 812, mobile: true, timeoutMs: 180_000 } : { width: 1920, height: 1080, timeoutMs: 180_000 });
        return JSON.parse(txt);
      } finally { S.stop(); }
    })();
    return runs[narrow];
  }
  async function tagged(tag, min, narrow = false) {
    const res = await pageResult(narrow);
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }

  test('backtest-M: zegar kursora ze strefą wykresu i godziną NY', () => tagged('zegar', 2));
  test('backtest-M: skróty widoczne w podpowiedziach (Odtwarzaj, kroki, Kup, szybkość, skok)', () => tagged('podpowiedzi', 5));
  test('backtest-M: SL i TP zapamiętane na instrument: po ponownym otwarciu replayu Kup od razu aktywny', () => tagged('pamiec', 2));
  test('backtest-M: etykiety pozycji przy lewej krawędzi, nie na świecach przy kursorze; SL i TP pozycji z kwotą', () => tagged('etykiety', 5));
  test('backtest-M: skróty E (BE) i H (połowa pozycji) w replayu', () => tagged('skroty', 5));
  test('backtest-M: szybki panel z klawiatury (Enter → setup, Ctrl+J zabiera setup)', () => tagged('szybki', 2));
  test('backtest-M: Journal: fokus w Notatce, Ctrl+Enter zapisuje, Esc po zapisie zamyka', () => tagged('journal', 3));
  test('backtest-M: skok z menu jednym kliknięciem, przycisk powtarza wybrany skok', () => tagged('skok', 3));
  test('backtest-M: stan Notion: bez zaległości bez przycisku, z zaległościami przycisk wysyłki', () => tagged('notion', 2));
  test('backtest-M: 375 px: etykiety zlecenia na swoich liniach i w polu świec także po zmianie wysokości wykresu, kwota ryzyka w całości (regresja M)', () => tagged('zlecenie375', 7, true));
  test('backtest-M: 375 px: szybki panel nie zakrywa świecy przy kursorze (regresja M)', () => tagged('panel375', 1, true));
  test('backtest-M: 375 px: panel zleceń zwinięty, wykres z pozycją ≥ 40% ekranu, szybki panel niski, bez poziomego przewijania', () => tagged('mobile', 7, true));
};
