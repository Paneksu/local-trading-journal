// backtest-C2: handel w replayu (zlecenia, pozycja jako rysunek, przeciąganie SL/TP, BE, część, zamknięcie, blokada po cofnięciu). Przeglądarka (Chrome/Edge headless, CDP)
// na serwerze testowym ze świecami syntetycznymi (testy/bt-dane-syntetyczne.mjs). Strona robocza: testy/backtest-handel.html?part=handel.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

  // ---- strona robocza testy/backtest-handel.html?part=handel: jeden przebieg, wynik dzielony przez testy ----
  let pageRun = null;
  async function pageResult() {
    pageRun ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      // dzień 13 przed 12: zapis dnia 13 nadpisuje 1m kontekstu, więc dzień 12 piszemy na końcu
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-13', seed: 8 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      const S = await H.server(4881, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-handel.html?part=handel`, { width: 1920, height: 1080, timeoutMs: 150_000 });
        return JSON.parse(txt);
      } finally { S.stop(); }
    })();
    return pageRun;
  }
  async function tagged(tag, min) {
    const res = await pageResult();
    if (!res) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
    return res;
  }

  test('backtest-C2: market Buy z SL i TP', () => tagged('market', 11));
  test('backtest-C2: przeciągnięcie SL zmienia pozycję', () => tagged('sl', 7));
  test('backtest-C2: limit i stop oczekujące', () => tagged('limit', 11));
  test('backtest-C2: BE, częściowe, zamknij', () => tagged('be', 9));
  test('backtest-C2: wstecz blokuje zlecenia', () => tagged('wstecz', 15));
  test('backtest-C2: ryzyko za małe', () => tagged('ryzyko', 4));
  test('backtest-C2: stan w pliku sesji', () => tagged('zapis', 2));
};
