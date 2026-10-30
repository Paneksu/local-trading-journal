// backtest-F2: filtr dni (zaawansowane) w kreatorze sesji: sekcja zwinięta, grupy warunków i / lub / nie, licznik na żywo, ręczne wyrzucenie dnia, dni bez danych,
// szablony (w bloku ustawień jako JSON w kawałkach), typ dnia w pasku replayu i 375 px. Przeglądarka (Chrome/Edge headless, CDP) na stronie testy/backtest-kreator.html.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

  const runs = {};
  function pageResult(part, port, width = 1920) {
    runs[part] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      const S = await H.server(port, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-kreator.html?part=${part}`, { width, height: width === 375 ? 800 : 1080, timeoutMs: 120_000 });
        return JSON.parse(txt);
      } finally { S.stop(); }
    })();
    return runs[part];
  }
  async function tagged(part, port, tag, min, width) {
    const res = await pageResult(part, port, width);
    if (!res) { console.log('  (pominięty: brak Chrome/Edge)'); return null; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
    return res;
  }
  const K = (tag, min) => tagged('kreator', 4911, tag, min);

  test('backtest-F2: sekcja domyślnie zwinięta', () => K('zwiniete', 7));
  test('backtest-F2: grupy warunków', () => K('grupy', 13));
  test('backtest-F2: licznik na żywo', () => K('licznik', 5));
  test('backtest-F2: ręczne wyrzucenie dnia', () => K('reczne', 6));
  test('backtest-F2: dni bez danych z powodem', () => K('bezdanych', 6));
  test('backtest-F2: szablony', async () => {
    await K('szablony', 7);
    // szablon przeżywa synchronizację ustawień także przy drzewie głębszym niż 6 poziomów (sanitizeSettings ucina głębiej)
    const { sanitizeSettings } = await imp('lib/sync.mjs');
    const { templateEntry, templateFilter, sanitizeBt } = await imp('public/js/bt-czas.js');
    let tree = { k: 'wd', days: [1, 2] };
    for (let i = 0; i < 9; i++) tree = { op: i % 2 ? 'and' : 'or', not: i % 3 === 0, items: [tree, { k: 'event', name: 'CPI ' + 'x'.repeat(40) }] };
    const entry = templateEntry('Głęboki', tree);
    const direct = sanitizeSettings({ bt: { templates: [{ name: 'Głęboki', filter: tree }] } });
    assert.notDeepEqual(direct.bt.templates[0].filter, tree, 'sprawdzian: surowe drzewo zostaje ucięte przez sanitizeSettings');
    const synced = sanitizeSettings({ bt: sanitizeBt({ templates: [entry] }) });
    assert.deepEqual(templateFilter(synced.bt.templates[0]), tree, 'drzewo głębsze niż 6 poziomów przechodzi bez zmian');
    assert.equal(synced.bt.templates[0].name, 'Głęboki');
    // klucze wrażliwe są wycinane z filtra szablonu
    const e2 = templateEntry('Sekret', { op: 'and', items: [{ k: 'wd', days: [1], token: 'x', apiKey: 'y' }] });
    assert.ok(!JSON.stringify(e2).includes('token') && !JSON.stringify(e2).includes('apiKey'), 'klucze wrażliwe wycięte');
    // sanitizeBt: stary zapis { name, filter } jest przejmowany, złe wpisy odpadają
    const s = sanitizeBt({ templates: [{ name: 'Stary', filter: { op: 'and', items: [] } }, { name: 5 }, null, { name: 'Zły', filterJ: ['{nie json'] }] });
    assert.deepEqual(s.templates.map((x) => x.name), ['Stary'], `sanitizeBt: ${JSON.stringify(s.templates)}`);
  });
  test('backtest-F2: szablony w Ustawieniach', () => tagged('ustawienia', 4914, 'ustawienia', 5));
  test('backtest-F2: typ dnia w pasku', () => tagged('pasek', 4912, 'pasek', 6));
  test('backtest-F2: 375 px', () => tagged('mobile', 4913, '375', 2, 375));
};
