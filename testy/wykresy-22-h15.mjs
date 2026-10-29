// wykresy-15 (pakiet H, etap 15): styl „Linia zamknięć” obok domyślnych świec (P18) w podglądzie SVG, miniaturach i edycji LWC.
// Wybór stylu: Ustawienia → Wykresy (settings.chart.style, jedno miejsce). Rysunki są kotwiczone w czasie i cenie, więc zmiana stylu ich nie rusza.
// Zgodność geometrii z LWC (LineSeries 5.2.1, tolerancja 1 px) liczy strona testy/zgodnosc-rysunkow.html (uruchamia ją wykresy-06 i tu test niżej).
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
  // 1m: 6 świec, luka nocna 3 h, 4 świece, brakująca minuta w środku (2 świece, dziura 1 minuty)
  const T0 = 1_793_000_040;
  const bars = [];
  let p = 5800;
  const add = (t) => { const o = p, c = p + ((t / 60) % 7) - 3; bars.push([t, o, Math.max(o, c) + 1, Math.min(o, c) - 1, c, 10]); p = c; };
  for (let k = 0; k < 6; k++) add(T0 + k * 60);
  for (let k = 0; k < 4; k++) add(T0 + 6 * 60 + 3 * 3600 + k * 60);
  add(T0 + 6 * 60 + 3 * 3600 + 6 * 60); add(T0 + 6 * 60 + 3 * 3600 + 7 * 60);

  test('wykresy-15: closePoints: [t, close] dla każdej świecy, ta sama długość i kolejność, luki zostają lukami (nic nie dopisujemy)', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    const pts = C.closePoints(bars);
    assert.equal(pts.length, bars.length);
    assert.deepEqual(pts.map((q) => q[0]), bars.map((b) => b[0]), 'czasy bez zmian, w kolejności');
    assert.deepEqual(pts.map((q) => q[1]), bars.map((b) => b[4]), 'wartość = zamknięcie');
    const gaps = (a) => a.slice(1).map((v, i) => v - a[i]).filter((d) => d > 60).length;
    assert.equal(gaps(pts.map((q) => q[0])), gaps(bars.map((b) => b[0])), 'luka nocna i brakująca minuta zostają');
    assert.equal(gaps(pts.map((q) => q[0])), 2);
    assert.deepEqual(C.closePoints([]), []); assert.deepEqual(C.closePoints(null), []);
    assert.deepEqual(bars, JSON.parse(JSON.stringify(bars)), 'wejście nietknięte');
  });

  test('wykresy-15: lineShapes i candleShapes: ten sam X dla obu stylów przy tych samych skalach, Y linii = skala ceny zamknięcia, offset indeksu', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    const G = await lib('public/js/geometria.js');
    const last = bars.length - 1, xs = G.indexScale({ lastIndex: last, right: 800, spacing: 10 });
    const ys = G.priceScale({ min: 5780, max: 5820, top: 0, height: 400 });
    const s = G.chartScales({ candles: bars, xs, ys, box: { left: 0, right: 800, top: 0, bottom: 400 }, pip: 0.25 });
    const L = G.lineShapes(C.closePoints(bars), s), K = G.candleShapes(bars, s);
    assert.equal(L.length, K.length);
    for (let i = 0; i < L.length; i++) {
      assert.equal(L[i].x, K[i].x, `x[${i}]`); assert.equal(L[i].i, K[i].i); assert.equal(L[i].y, s.y(bars[i][4]), `y[${i}] = cena zamknięcia`);
    }
    const part = G.lineShapes(C.closePoints(bars.slice(3, 6)), s, 3), partK = G.candleShapes(bars.slice(3, 6), s, {}, 3);
    assert.deepEqual(part.map((q) => q.x), partK.map((q) => q.x)); assert.equal(part[0].i, 3, 'offset indeksu');
    assert.deepEqual(G.lineShapes([], s), []); assert.deepEqual(G.lineShapes(null, s), []);
  });

  test('wykresy-15: seriesSvg: styl linii daje jedną ścieżkę .close-line bez świec, styl świec odwrotnie; ścieżka ma tyle punktów co świec', async () => {
    const P = await lib('public/js/podglad.js');
    const G = await lib('public/js/geometria.js');
    const last = bars.length - 1, xs = G.indexScale({ lastIndex: last, right: 800, spacing: 10 });
    const ys = G.priceScale({ min: 5780, max: 5820, top: 0, height: 400 });
    const s = G.chartScales({ candles: bars, xs, ys, box: { left: 0, right: 800, top: 0, bottom: 400 }, pip: 0.25 });
    const line = P.seriesSvg(bars, s, 0, { style: 'line' }), cs = P.seriesSvg(bars, s, 0, { style: 'candles' });
    assert.equal((line.match(/class="close-line"/g) || []).length, 1); assert.ok(!/class="candle|class="wick/.test(line));
    const d = /d="([^"]*)"/.exec(line)[1];
    assert.equal((d.match(/[ML]/g) || []).length, bars.length); assert.ok(d.startsWith('M') && (d.match(/M/g) || []).length === 1, 'jedna ciągła ścieżka');
    assert.match(cs, /class="candle up"/); assert.ok(!/close-line/.test(cs));
    assert.equal(P.seriesSvg(bars, s, 0), P.seriesSvg(bars, s, 0, (await lib('public/js/styl-wykresu.js')).chartSettings()), 'domyślnie bieżące ustawienia (świece)');
    assert.equal(P.linePath([]), '');
  });

  test('wykresy-15: miniatura i podgląd w Ustawieniach rysują wybrany styl; poziomy trade\'a te same w obu stylach', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    const P = await lib('public/js/podglad.js');
    const d = C.chartDefaults();
    const candles = C.previewSvg(d), line = C.previewSvg({ ...d, style: 'line' });
    assert.match(candles, /class="candle up"/); assert.ok(!/close-line/.test(candles));
    assert.match(line, /class="close-line"/); assert.ok(!/class="candle|class="wick/.test(line));
    const lv = (s) => (s.match(/class="(?:lvl|pos-)[^"]*"/g) || []).join('|');
    assert.equal(lv(line), lv(candles), 'poziomy wejścia/wyjścia/SL/TP bez zmian przy zmianie stylu');
    // miniatura z listy bierze styl z bieżących ustawień (jedno miejsce)
    const b = C.previewBars(), tr = C.previewTrade(b);
    C.setChartSettings({ ...d, style: 'line' });
    try { assert.match(P.miniSvg(tr, { tf: '5m', bars: b }), /class="close-line"/, 'miniatura listy: linia'); }
    finally { C.setChartSettings(d); }
    assert.match(P.miniSvg(tr, { tf: '5m', bars: b }), /class="candle up"/, 'po powrocie: świece');
    assert.equal(C.chartSettings().style, 'candles');
  });

  test('wykresy-15: edycja LWC: LineSeries zamiast CandlestickSeries przy stylu linii, dane { time, value: close }, kolor --chart-line, ten sam odczyt ustawień', async () => {
    const W = await lib('public/js/wykres.js');
    const c = { profit: 'p', loss: 'l', fg2: 'f2', line: 'LN' };
    assert.deepEqual(W.seriesData(bars.slice(0, 2), 'line'), [{ time: bars[0][0], value: bars[0][4] }, { time: bars[1][0], value: bars[1][4] }]);
    assert.deepEqual(W.seriesData(bars.slice(0, 1), 'candles'), [{ time: bars[0][0], open: bars[0][1], high: bars[0][2], low: bars[0][3], close: bars[0][4] }]);
    assert.equal(W.seriesData(bars, 'line').length, bars.length, 'bez sztucznych punktów w lukach');
    assert.equal(W.seriesOptions(c, 'line').color, 'LN'); assert.equal(W.seriesOptions({ profit: 'p', loss: 'l', fg2: 'f2' }, 'line').color, 'f2');
    assert.deepEqual(W.seriesOptions(c, 'candles'), W.candleOptions(c));
    const s = src('public/js/wykres.js');
    assert.match(s, /chart\.addSeries\(style === 'line' \? LWC\.LineSeries : LWC\.CandlestickSeries/); assert.match(s, /const style = chartSettings\(\)\.style;/);
    assert.ok(!/addSeries\(LWC\.CandlestickSeries/.test(s), 'seria zawsze przez wybór stylu');
    assert.match(s, /line: probe\(v\('--chart-line'\) \|\| v\('--fg-2'\)\)/);
    // rysunki są kotwiczone w czasie i cenie: zmiana stylu nie dotyka ich danych ani współrzędnych
    assert.ok(!/style === 'line'[^\n]*(drawings|rysunki|setDrawings)/.test(s));
  });

  test('wykresy-15: styl linii w CSS: .close-line bez wypełnienia w kolorze --chart-line (jak krzywa kapitału); brak literałów kolorów', () => {
    const css = src('public/styles.css');
    assert.match(css, /svg \.close-line \{ fill: none; stroke: var\(--chart-line\);/);
    for (const f of ['public/js/styl-wykresu.js', 'public/js/geometria.js', 'public/js/podglad.js']) {
      const s = src(f);
      assert.equal((s.match(/#[0-9a-f]{3,6}\b/gi) || []).length, 0, `${f}: #rrggbb`); assert.equal((s.match(/\brgba?\(/g) || []).length, 0, `${f}: rgb(`);
    }
    const app = src('public/js/app.js');
    assert.match(app, /function onChartChanged\(c\)[\s\S]*renderMain\(\)/, 'zmiana stylu przerysowuje listy (miniatury) bez przeładowania');
    assert.match(app, /lb\.pv\?\.redraw\(\)/, 'i otwarty podgląd');
  });

  test('wykresy-15: zgodność z LWC rozszerzona o linię (LineSeries, tolerancja 1 px) w przeglądarce headless', async () => {
    const page = src('testy/zgodnosc-rysunkow.html');
    assert.match(page, /LineSeries/); assert.match(page, /G\.lineShapes\(closePoints\(candles\), sL\)/); assert.match(page, /seriesSvg\(candles, sL, 0, \{ style: 'line' \}\)/);
    const { findBrowser, dumpDom } = await import(pathToFileURL(path.join(ROOT, 'testy/przegladarka.mjs')).href);
    if (!findBrowser()) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    const S = await H.server(4930, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: H.tmp() });
    try {
      const dom = await dumpDom(`${S.base}/__testy/zgodnosc-rysunkow.html`);
      const m = /<pre id="wynik">([\s\S]*?)<\/pre>/.exec(dom);
      assert.ok(m, 'strona zwróciła wynik');
      assert.match(m[1], /^PASS/, m[1].slice(0, 2000));
    } finally { S.stop(); }
  });
};
