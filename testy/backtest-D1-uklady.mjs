// backtest-D1: kilka wykresów na jednym zegarze (układy 1, 2h, 2v, 4, krok według aktywnego wykresu, wspólny krzyżyk, zlecenia na aktywny wykres, brak przyszłości,
// wydajność) oraz rysunki replayu per sesja i instrument (plik sesji zamiast drawings-cache, dwie sesje, snapshot). Przeglądarka (Chrome/Edge headless, CDP) na
// serwerze testowym ze świecami syntetycznymi (NQ z 1s w 9:30-11:00, ES tylko 1m). Strona robocza: testy/backtest-uklady.html?part=uklady|rysunki.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

  // jeden przebieg strony na część; wynik dzielony przez testy tej części
  const runs = {};
  function pageResult(part, port) {
    runs[part] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'ES', day: '2024-03-12', seed: 5, has1s: false });
      const S = await H.server(port, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-uklady.html?part=${part}`, { width: 1920, height: 1080, timeoutMs: 170_000 });
        const res = JSON.parse(txt);
        res.dir = dir;
        return res;
      } finally { S.stop(); }
    })();
    return runs[part];
  }
  async function tagged(part, port, tag, min) {
    const res = await pageResult(part, port);
    if (!res) { console.log('  (pominięty: brak Chrome/Edge)'); return null; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
    return res;
  }
  const U = (tag, min) => tagged('uklady', 4893, tag, min);
  const R = (tag, min) => tagged('rysunki', 4894, tag, min);

  test('backtest-D1: układy 1, 2h, 2v, 4', () => U('uklady', 14));
  test('backtest-D1: jeden zegar', () => U('zegar', 6));
  test('backtest-D1: krok według aktywnego wykresu', () => U('krok', 6));
  test('backtest-D1: wspólny krzyżyk czasu', () => U('krzyzyk', 4));
  test('backtest-D1: zlecenie na aktywny wykres', () => U('zlecenie', 8));
  test('backtest-D1: brak przyszłości na wszystkich wykresach', () => U('przyszlosc', 3));
  test('backtest-D1: wydajność dwóch wykresów', () => U('wydajnosc', 2));

  test('backtest-D1: rysunek widoczny na każdym wykresie instrumentu', () => R('widoczny', 5));
  test('backtest-D1: rysunki w pliku sesji', async () => {
    const res = await R('plik', 3);
    if (!res) return;
    // drawings-cache (rysunki trade'ów Live) bez nowych plików: sesje backtestu nie pisują tam nic
    const cache = await fs.readdir(path.join(res.dir, 'chart-data', 'drawings-cache')).catch(() => []);
    assert.deepEqual(cache, [], 'chart-data/drawings-cache bez nowych plików');
  });
  test('backtest-D1: dwie sesje z tym samym dniem się nie mieszają', () => R('sesje', 3));
  test('backtest-D1: snapshot', () => R('snapshot', 6));

  // Edytor trade'a Live zostaje bez zmian: opcja ctx.saveDoc jest dodatkiem, bez niej `send` wysyła jak dotąd (pełne testy rysunków: wykresy-09 i kolejne)
  test("backtest-D1: edytor trade'a Live bez zmian", async () => {
    const src = await fs.readFile(path.join(ROOT, 'public/js/rysunki.js'), 'utf8');
    assert.ok(/ctx\.saveDoc/.test(src), 'rysunki.js ma opcję ctx.saveDoc');
    assert.ok(/typeof ctx\.saveDoc === 'function'/.test(src), 'saveDoc tylko gdy podane (funkcja)');
    assert.ok(/fetch\('\/api\/drawings\/save'/.test(src), 'zapis do Notion przez /api/drawings/save zostaje domyślny');
    const wy = await fs.readFile(path.join(ROOT, 'public/js/wykres.js'), 'utf8');
    assert.ok(!/saveDoc/.test(wy), 'edytor trade\'a Live nie przekazuje saveDoc');
  });
};
