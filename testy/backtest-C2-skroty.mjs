// backtest-C2: skoki z listy, skróty klawiszowe replayu i zakładka Ustawienia → Backtest. Przeglądarka (Chrome/Edge headless, CDP) na serwerze testowym ze świecami
// syntetycznymi. Strona robocza: testy/backtest-handel.html?part=skroty. Synchronizacja ustawień sprawdzana w Node (sanitizeSettings z lib/sync.mjs).
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { sanitizeSettings } from '../lib/sync.mjs';
import { btDefaults, sanitizeBt } from '../public/js/bt-czas.js';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

  // ---- strona robocza testy/backtest-handel.html?part=skroty: jeden przebieg, wynik dzielony przez testy ----
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
      const S = await H.server(4883, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-handel.html?part=skroty`, { width: 1920, height: 1080, timeoutMs: 150_000 });
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

  test('backtest-C2: lista skoków', () => tagged('lista', 21));
  test('backtest-C2: skrót w polu tekstowym', () => tagged('pole', 4));
  test('backtest-C2: skróty nie walczą z rysunkami', async () => { await tagged('rysunki', 4); await tagged('zamkniecie', 1); });
  test('backtest-C2: Ustawienia → Backtest', () => tagged('ustawienia', 25));
  test('backtest-C2: ustawienia przeżywają synchronizację', () => {
    const bt = sanitizeBt({ ...btDefaults(), skroty: { ...btDefaults().skroty, play: 'P' }, jumps: [...btDefaults().jumps, { id: 'x1', name: 'Własny', cel: { kind: 'session', id: 'london' }, skrot: 'Q' }, { id: 'x2', name: 'News', cel: { kind: 'news', minImp: 'medium' }, skrot: 'W' }, { id: 'x3', name: 'Godzina', cel: { kind: 'time', at: '10:15' }, skrot: 'E' }] });
    const out = sanitizeSettings({ bt });
    assert.deepEqual(out.bt.skroty, bt.skroty, 'bt.skroty przechodzi bez zmian');
    assert.deepEqual(out.bt.jumps.map((j) => j.skrot), bt.jumps.map((j) => j.skrot), 'skrót każdego skoku zostaje');
    assert.deepEqual(out.bt.jumps.map((j) => j.cel), bt.jumps.map((j) => j.cel), 'cel każdego skoku zostaje');
    assert.deepEqual(sanitizeBt(out.bt), bt, 'po synchronizacji blok bt jest taki sam');
    assert.ok(Object.keys(out.bt.skroty).length === 11, 'wszystkie 11 akcji (J: drawEntry)');
  });
};
