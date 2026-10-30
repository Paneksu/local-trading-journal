// backtest-J: rysunek pozycji i wejście według rysunku w przeglądarce (Chrome/Edge headless, CDP) na serwerze testowym ze świecami syntetycznymi.
// Strona robocza testy/backtest-J.html: ?part=replay (replay backtestu, panel zleceń) i ?part=live (edytor wykresu Live z atrapą fetch).
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const runs = {};
  async function pageResult(part) {
    runs[part] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-13', seed: 8 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      const S = await H.server(part === 'replay' ? 4891 : 4892, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-J.html?part=${part}`, { width: 1920, height: 1080, timeoutMs: 150_000 });
        return JSON.parse(txt);
      } finally { S.stop(); }
    })();
    return runs[part];
  }
  async function tagged(part, tag, min) {
    const res = await pageResult(part);
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }

  test('backtest-J: replay: konto i ryzyko nowego rysunku z sesji, przycisk w panelu zleceń', () => tagged('replay', 'domyślne', 3));
  test('backtest-J: wejście z rysunku market: SL/TP z rysunku, ilość z ryzyka, rysunek znika', () => tagged('replay', 'market', 7));
  test('backtest-J: wejście z rysunku limit i stop wg strony ceny (long i short)', () => tagged('replay', 'limit', 6));
  test('backtest-J: wejście z rysunku: jeden zapis sesji, przywrócony rysunek nie składa drugiego zlecenia', () => tagged('replay', 'zapis', 7));
  test('backtest-J: panel rysunku w replayu: notka o ilości z ryzyka sesji', () => tagged('replay', 'ilosc', 3));
  test('backtest-J: drugi wykres nie kasuje konta wpisanego w rysunku sprzed J', () => tagged('replay', 'drugi', 4));
  test('backtest-J: Live: napis R:R zostaje, gdy R:R nie ma w podpisie środka', () => tagged('live', 'rr', 4));
  test('backtest-J: Live: rysunek sprzed J: konto wpisane zostaje po wczytaniu i Ctrl+Z, domyślne paczki znikają', () => tagged('live', 'stary', 5));
  test('backtest-J: blokady wejścia z rysunku (brak SL, cofnięty kursor, dzień zakończony) i skrót D', () => tagged('replay', 'blokady', 6));
  test('backtest-J: Live: podpisy po zaznaczeniu, ceny na osi', () => tagged('live', 'podpisy', 5));
  test('backtest-J: Live: panel Wejścia/Styl/Podpisy, kompaktowy, zawsze pokazuj, pamięć stylu', () => tagged('live', 'panel', 12));
  test('backtest-J: Live: pozycja z pól trade\'a bez zmyślonej ilości', () => tagged('live', 'trade', 3));
};
