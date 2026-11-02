// autoskala (1.6.1): przełącznik „Auto” (autoskalowanie osi ceny) na każdym wykresie replayu. [U] 1.11.2026 «nie ma do wybrania auto trybu w backtest, jest wlaczone i nie da sie go ywlaczyc»
// Przeglądarka (Chrome/Edge headless) na serwerze testowym ze świecami syntetycznymi; strona robocza: testy/backtest-autoskala.html?part=auto.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
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
        return JSON.parse(await P.cdpPage(`${S.base}/__testy/backtest-autoskala.html?part=${part}`, { width: 1920, height: 1080, timeoutMs: 170_000 }));
      } finally { S.stop(); }
    })();
    return runs[part];
  }
  async function tagged(part, port, tag, min) {
    const res = await pageResult(part, port);
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }
  test('autoskala: przełącznik w nagłówku, oś wyłącza auto, kroki go nie włączają, klik i dwuklik włączają, stan przeżywa ponowne otwarcie sesji', () => tagged('auto', 4951, 'auto', 12));
  test('autoskala-tf: ulubione jako przyciski, własny interwał 7m (agregat i krok), sekundowy poza oknem 1s odrzucony z powodem, ulubione i zapis', () => tagged('tf', 4952, 'tf', 16));
  test('autoskala-tf: ulubione interwały przeżywają synchronizację (sanitizeSettings → sanitizeBt), serwer przyjmuje własny interwał', async () => {
    const { sanitizeSettings } = await imp('lib/sync.mjs');
    const { sanitizeBt } = await imp('public/js/bt-czas.js');
    const { isReplayTf } = await imp('public/js/bt-swieca.js');
    const synced = sanitizeSettings({ bt: { favTfs: ['15s', '7m', '1h'] } });
    assert.deepEqual(sanitizeBt(synced.bt).favTfs, ['15s', '7m', '1h']);
    assert.deepEqual(sanitizeBt({ favTfs: ['2D', '90s', '7m'] }).favTfs, ['7m']);
    for (const ok of ['7m', '45s', '2h', '1s', '24h']) assert.ok(isReplayTf(ok), ok);
    for (const bad of ['90s', '1D', '25h', '0m', '7x', '']) assert.ok(!isReplayTf(bad), bad);
    assert.match(src('lib/backtest-range.mjs'), /!isReplayTf\(tf\)/);
  });
  test('autoskala: źródła (stan per wykres w layout.charts, teksty w en.json, Live nietknięty)', () => {
    const r = src('public/js/bt-replay.js'), w = src('public/js/bt-wykres.js');
    assert.match(r, /auto: c\?\.auto !== false/);
    assert.match(r, /onAutoChange/);
    assert.match(w, /\[U\] 1\.11\.2026 «nie ma do wybrania auto trybu/);
    // przywrócenie autoskali po puszczeniu „hold” tylko gdy była włączona przed przytrzymaniem (regresja: bezwarunkowe autoScale: true)
    assert.match(w, /if \(held\.auto\) p\.applyOptions\(\{ autoScale: true \}\); held = null/);
    const en = JSON.parse(src('public/i18n/en.json'));
    for (const k of ['Auto', 'Skala ceny']) assert.ok(en[k], k);
  });
};
