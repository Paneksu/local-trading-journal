// backtest-H2: domyślne kolory rysunków za motywem (30.10.2026, decyzja sesji głównej po zgłoszeniu użytkownika o podglądzie: callout „CPI” i linia trendu prawie
// niewidoczne w Platinum). Kolor domyślny (tekst, linie, callout, poziomy) rysuje się tokenem bieżącego motywu, ręczny zostaje, stary dokument z literałem z Onyx
// otwiera się jak dotąd, zapis trzyma literał z Onyx i znacznik autoColor (rysunki-kolory.js). Strona robocza: testy/backtest-uklady.html?part=kolory.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((s, v, k) => s + v * [0.2126, 0.7152, 0.0722][k], 0); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const P2 = [{ time: 1_793_000_000, price: 5800 }, { time: 1_793_000_600, price: 5810 }];
  const legacy = [
    { id: 'dw_line', kind: 'trend-line', points: P2, style: { color: '#f3f3f3', width: 1, textColor: '#f3f3f3', fontSize: 12 } },
    { id: 'dw_cpi', kind: 'callout', text: 'CPI', points: P2, style: { color: '#f3f3f3', width: 1, textColor: '#f3f3f3', fontSize: 14, backgroundColor: '#f3f3f3', transparency: 85, text: 'CPI' } },
    { id: 'dw_man', kind: 'trend-line', points: P2, style: { color: '#cccccc', width: 1 } },
  ];

  test('backtest-H2: kolor domyślny za motywem, ręczny bez zmian, kontrast ≥ 3:1', async () => {
    const K = await imp('public/js/rysunki-kolory.js');
    const { SURFACES } = await imp('public/js/palety.js');
    const C = K.THEME_COLORS;
    const [line, cpi, man] = legacy;
    for (const [d, keys] of [[line, ['color', 'textColor']], [cpi, ['color', 'textColor', 'backgroundColor']]]) {
      const on = K.themed(d, C.onyx).style, pl = K.themed(d, C.platinum).style;
      for (const k of keys) {
        assert.notEqual(on[k], pl[k], `${d.kind}.${k}: Onyx ${on[k]}, Platinum ${pl[k]}`);
        // tło wykresu: powierzchnia podglądu w danym motywie (float) i karta treści
        for (const [th, st] of [['onyx', on], ['platinum', pl]]) for (const bg of [SURFACES[th].float, SURFACES[th].content]) assert.ok(ratio(st[k], bg) >= 3, `${th} ${d.kind}.${k} ${st[k]} na ${bg}: ${ratio(st[k], bg).toFixed(2)}`);
      }
    }
    assert.equal(K.themed(man, C.platinum).style.color, '#cccccc', 'kolor ręczny bez zmian');
    assert.equal(K.themed(man, C.onyx).style.color, '#cccccc');
    // podgląd SVG: zmienne CSS (przełączenie motywu bez ponownego rysowania)
    assert.equal(K.themed(cpi, K.CSS_COLORS).style.textColor, 'var(--fg)');
    assert.equal(K.themed(man, K.CSS_COLORS).style.color, '#cccccc');
  });

  test('backtest-H2: zapis zgodny ze starszymi wersjami (literał z Onyx + znacznik), parseDoc', async () => {
    const K = await imp('public/js/rysunki-kolory.js');
    const { parseDoc } = await imp('lib/drawings.mjs');
    const { parseDrawings } = await imp('public/vendor/lightweight-charts-drawing/lightweight-charts-drawing.es.js');
    const t = (x) => x;
    // stary dokument (bez znacznika) przechodzi walidację i otwiera się z kolorami domyślnymi
    const oldDoc = { v: 1, lib: '0.6.2', at: new Date().toISOString(), d: legacy };
    assert.equal((await parseDoc(JSON.parse(JSON.stringify(oldDoc)), t)).d.length, 3);
    const inPl = legacy.map((d) => K.themed(d, K.THEME_COLORS.platinum));
    const saved = inPl.map(K.canonical);
    assert.equal(saved[1].style.textColor, '#f3f3f3', 'zapis trzyma wartość z Onyx niezależnie od motywu');
    assert.deepEqual(saved[1].style.autoColor, { color: 'fg', backgroundColor: 'fg', textColor: 'fg' });
    assert.deepEqual(saved[2].style.autoColor, {}, 'ręczny: pusty znacznik (rysunek z nowym zapisem)');
    assert.deepEqual(saved.map(K.canonical), saved, 'postać zapisu stabilna');
    // nowy zapis przechodzi parseDoc i paczkę 0.6.2 bez utraty znacznika (stara wersja aplikacji go pomija, kolory z literału)
    const doc = { v: 1, lib: '0.6.2', at: new Date().toISOString(), d: saved };
    await parseDoc(JSON.parse(JSON.stringify(doc)), t);
    const back = parseDrawings(JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(back[1].style.autoColor, saved[1].style.autoColor, 'paczka zostawia znacznik');
    assert.equal(back[1].style.color, '#f3f3f3', 'stara wersja widzi literał jak dotąd');
    // ręczny kolor równy wartości domyślnej w nowym zapisie zostaje ręczny (znacznik bez tej ścieżki)
    const manualDefault = { ...saved[0], style: K.markManual(saved[0].style, 'color') };
    assert.equal(K.themed(manualDefault, K.THEME_COLORS.platinum).style.color, '#f3f3f3', 'ręcznie wybrany #f3f3f3 zostaje');
    assert.notEqual(K.themed(manualDefault, K.THEME_COLORS.platinum).style.textColor, '#f3f3f3', 'pozostałe ścieżki dalej domyślne');
  });

  test('backtest-H2: poziomy Fibonacciego i Gann boxa, pamięć stylu narzędzi', async () => {
    const K = await imp('public/js/rysunki-kolory.js');
    const R = await imp('public/js/rysunki.js');
    const C = K.THEME_COLORS;
    const fib = { id: 'f', kind: 'fib-retracement', points: P2, style: R.styleFor('fib-retracement', C.onyx) };
    const fl = K.themed(fib, C.platinum).style.levels;
    assert.ok(fl.every((l) => l.color === C.platinum.fg2 && l.auto === 'fg2'), JSON.stringify(fl));
    const gann = { id: 'g', kind: 'gann-box', points: P2, style: R.styleFor('gann-box', C.onyx) };
    assert.deepEqual(K.themed(gann, C.platinum).style.levels.map((l) => l.auto), ['fg2', 'asia', 'london', 'ny', 'asia', 'london', 'fg2']);
    // kolor poziomu z panelu = ręczny; nowy poziom bierze znacznik poprzedniego
    const ed = R.editLevels(K.themed(fib, C.onyx).style.levels, { set: 1, field: 'color', value: '#123456' });
    assert.ok(!('auto' in ed[1]) && ed[0].auto === 'fg2', 'ręczny kolor poziomu');
    const add = R.editLevels(K.themed(fib, C.onyx).style.levels, { add: 2 });
    assert.equal(add.find((l) => l.coeff === 2).auto, 'fg2');
    // FVG: --be, tekst --fg; linia połowy idzie za --be
    const fvg = K.themed({ id: 'v', kind: 'rectangle', points: P2, style: R.styleFor('rectangle', C.onyx, true) }, C.platinum).style;
    assert.equal(fvg.color, C.platinum.be); assert.equal(fvg.rectMiddleLine.color, C.platinum.be); assert.equal(fvg.textColor, C.platinum.fg);
    // znacznik idzie z pamięcią stylu narzędzi (STYLE_KEYS), więc kolor ręczny z pamięci zostaje ręczny
    assert.ok(R.STYLE_KEYS.includes('autoColor'));
    assert.deepEqual(R.pickStyle({ color: '#f3f3f3', autoColor: {} }).autoColor, {});
  });

  // ---- edytor replayu (ten sam edytor co Live) i podgląd SVG w przeglądarce ----
  test('backtest-H2: edytor i podgląd SVG przełączają kolory domyślne z motywem', async () => {
    const P = await imp('testy/przegladarka.mjs');
    if (!P.findBrowser()) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
    const dir = H.tmp();
    await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
    await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'ES', day: '2024-03-12', seed: 5, has1s: false });
    const S = await H.server(4945, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
    try {
      const res = JSON.parse(await P.cdpPage(`${S.base}/__testy/backtest-uklady.html?part=kolory`, { width: 1920, height: 1080, timeoutMs: 120_000 }));
      assert.ok(!res.fatal, res.fatal);
      assert.deepEqual(res.checks.filter((c) => !c.ok).map((c) => `${c.tag}: ${c.msg}`), [], 'nieudane sprawdzenia');
      for (const tag of ['edytor', 'nowy', 'reczny', 'svg']) assert.ok(res.checks.filter((c) => c.tag === tag).length >= 3, `${tag}: strona wykonała sprawdzenia`);
    } finally { S.stop(); }
  });
};
