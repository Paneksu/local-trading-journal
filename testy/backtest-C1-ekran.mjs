// backtest-C1: zakładka Backtest, formularz klasyczny i ekran replayu z jednym wykresem. Przeglądarka (Chrome/Edge headless, CDP w czasie rzeczywistym)
// na serwerze testowym z THQ_CONFIG_DIR zawierającym wyłącznie świece syntetyczne (testy/bt-dane-syntetyczne.mjs). Strona robocza: testy/backtest-replay.html.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

  // ---- strona robocza: jeden przebieg, wynik dzielony przez testy ----
  let pageRun = null;
  async function pageResult() {
    pageRun ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      // dzień 13 przed 12: zapis dnia 13 nadpisuje 1m kontekstu, więc dzień 12 (ten z __btDay) piszemy na końcu
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-13', seed: 8 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      const S = await H.server(4876, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-replay.html`, { width: 1920, height: 1080, timeoutMs: 150_000 });
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

  test('backtest-C1: zakładka Backtest', async () => {
    const src = readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
    const views = /const VIEWS = (\[[^\]]*\])/.exec(src);
    assert.ok(views && JSON.parse(views[1].replace(/'/g, '"')).includes('backtest'), 'VIEWS zawiera backtest');
    await tagged('lista', 4);
    const P = await imp('testy/przegladarka.mjs');
    if (!P.findBrowser()) return;
    const A = await H.atrapa(4877);
    const S = await H.server(4878, { NOTION_API_BASE: A.base, NOTION_TOKEN: 'secret_x', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_CONFIG_DIR: H.tmp() });
    try {
      const until = `(() => { const b = document.querySelector('#tabs [data-v="backtest"]'); if (!b) return false; if (!window.__btClicked) { window.__btClicked = 1; b.click(); } return !!document.querySelector('.bt-view .empty [data-bt="new"]'); })()`;
      const extract = `JSON.stringify({ tab: !!document.querySelector('#tabs [data-v="backtest"]'), bar: !!document.querySelector('#tabbar [data-v="backtest"]'), sel: document.querySelector('#tabs [data-v="backtest"]').getAttribute('aria-selected'), btn: document.querySelector('.bt-view .empty [data-bt="new"]').textContent })`;
      const r = JSON.parse(await P.cdpPage(S.base + '/', { width: 1400, height: 900, timeoutMs: 60_000, until, extract }));
      assert.equal(r.tab, true, '[data-v="backtest"] w pasku zakładek');
      assert.equal(r.bar, true, 'zakładka w dolnym pasku (telefon)');
      assert.equal(r.sel, 'true');
      assert.match(r.btn, /Nowa sesja/);
    } finally { S.stop(); A.stop(); }
  });
  test('backtest-C1: formularz klasyczny', () => tagged('formularz', 10));
  test('backtest-C1: start dnia z historią', () => tagged('start', 11));
  test('backtest-C1: krok i odtwarzanie', async () => { await tagged('krok', 4); await tagged('play', 4); });
  test('backtest-C1: series.update zamiast setData', () => tagged('setData', 4));
  test('backtest-C1: TF sekundowy przed 9:30', () => tagged('tf15s', 7));
  test('backtest-C1: ukryta data', () => tagged('ukryta', 9));
  test('backtest-C1: stan sesji po ponownym otwarciu i pagehide', () => tagged('zapis', 6));
  test('backtest-C1: koszt kroku na syntetycznym dniu', async () => {
    const res = await tagged('koszt', 4);
    if (res) console.log(`  p95 kroku: 1m ${res.perf.step1m?.toFixed(2)} ms, 15s ${res.perf.step15s?.toFixed(2)} ms, 1s ${res.perf.step1s?.toFixed(2)} ms`);
  });
};
