// wykresy-08: tryb edycji wykresu (public/js/wykres.js): mapowanie tokenów na opcje LWC, kadr podgląd ↔ LWC, poziomy trade'a, LWC ładowany leniwie,
// edytor w przeglądarce (Chrome/Edge headless: tło przezroczyste, kolory przez sondę, kadr bez skoku, jeden zapis po wielu zmianach).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const W = () => import(pathToFileURL(path.join(ROOT, 'public/js/wykres.js')).href);
  const G = () => import(pathToFileURL(path.join(ROOT, 'public/js/geometria.js')).href);
  const C = { profit: 'p', loss: 'l', be: 'b', fg: 'f', fg2: 'f2', grid: 'g', popover: 'po', cross: 'cr', font: 'F' };

  test('wykresy-08: themeOptions mapuje tokeny: przezroczyste tło, bez logo i ramek, siatka tylko pozioma, krzyżyk i etykiety', async () => {
    const { themeOptions, candleOptions } = await W();
    const o = themeOptions(C);
    assert.deepEqual(o.layout.background, { type: 'solid', color: 'transparent' });
    assert.equal(o.layout.attributionLogo, false);
    assert.equal(o.layout.textColor, 'f2');
    assert.equal(o.layout.fontFamily, 'F');
    assert.equal(o.layout.fontSize, 10.5);
    assert.equal(o.grid.vertLines.visible, false);
    assert.equal(o.grid.horzLines.color, 'g');
    assert.equal(o.rightPriceScale.borderVisible, false);
    assert.equal(o.timeScale.borderVisible, false);
    assert.deepEqual(o.rightPriceScale.scaleMargins, { top: 0.08, bottom: 0.08 }, 'te same marginesy skali co w podglądzie');
    assert.equal(o.crosshair.vertLine.color, 'cr');
    assert.equal(o.crosshair.horzLine.labelBackgroundColor, 'po');
    assert.deepEqual(candleOptions(C), { upColor: 'p', downColor: 'l', wickUpColor: 'p', wickDownColor: 'l', borderVisible: false });
  });

  test('wykresy-08: kadr podgląd ↔ LWC przelicza się w obie strony bez zmiany (±0,5 świecy na krawędziach)', async () => {
    const { toLogical, fromLogical } = await W();
    for (const f of [{ fromIndex: 0, toIndex: 60 }, { fromIndex: 12.25, toIndex: 99.75 }, { fromIndex: -3.5, toIndex: 40 }]) {
      assert.deepEqual(fromLogical(toLogical(f)), f);
    }
    assert.deepEqual(toLogical({ fromIndex: 100, toIndex: 160 }), { from: 100.5, to: 159.5 });
  });

  test('wykresy-08: timeToIndexF i indexToTimeF są wzajemnie odwrotne także między świecami i w przyszłości', async () => {
    const g = await G();
    const c = [[1000, 1, 1, 1, 1, 0], [1060, 1, 1, 1, 1, 0], [1120, 1, 1, 1, 1, 0], [4720, 1, 1, 1, 1, 0]]; // luka po trzeciej świecy
    for (const i of [0, 0.5, 1, 1.25, 2.9, 3]) assert.ok(Math.abs(g.timeToIndexF(c, g.indexToTimeF(c, i, 60), 60) - i) < 1e-9, `indeks ${i}`);
    for (const i of [-2, 3.5, 7]) assert.ok(Math.abs(g.timeToIndexF(c, g.indexToTimeF(c, i, 60), 60) - i) < 1e-6, `poza danymi ${i}`);
    assert.equal(g.timeToIndexF(c, 1090, 60), 1.5);
    assert.equal(g.timeToIndex(c, 1090, 60), 1, 'wersja całkowita bez zmian (rysunki liczą po świecy)');
  });

  test('wykresy-08: poziomy trade\'a z kolorami tokenów; pozycja z pól: long gdy cel nad wejściem, short gdy pod, brak bez SL i TP', async () => {
    const { tradeLevels, positionDrawing } = await W();
    const tr = { at: 1_000_000, exitAt: 2_000_000, entryPrice: 100, exitPrice: 104, sl: 98, tp: 106 };
    const lv = tradeLevels(tr, C);
    assert.deepEqual(lv.map((l) => [l.price, l.color]), [[100, 'f2'], [104, 'f'], [98, 'l'], [106, 'p']]);
    assert.deepEqual(tradeLevels({ entryPrice: 5 }, C).map((l) => l.price), [5]);
    const D = { defaultStyleFor: () => ({ width: 1 }) };
    const long = positionDrawing(tr, D, C, 3000);
    assert.equal(long.kind, 'long-position'); assert.equal(long.locked, true);
    assert.equal(long.style.stopLevel, 2); assert.equal(long.style.profitLevel, 6);
    assert.deepEqual(long.points.map((p) => [p.time, p.price]), [[1000, 100], [2000, 100]]);
    assert.equal(positionDrawing({ ...tr, sl: 102, tp: 94 }, D, C, 0).kind, 'short-position');
    assert.equal(positionDrawing({ at: 5000, entryPrice: 1, sl: 0.5 }, D, C, 500).points[1].time, 500, 'bez wyjścia pozycja sięga ostatniej świecy');
    assert.equal(positionDrawing({ at: 1, entryPrice: 100 }, D, C, 0), null);
    assert.equal(positionDrawing({ at: 1, sl: 1, tp: 2 }, D, C, 0), null);
  });

  test('wykresy-08: LWC i paczka rysowania ładowane dopiero po „Edytuj wykres”, bez kolorów na sztywno', () => {
    for (const f of ['public/js/app.js', 'public/js/podglad.js', 'public/js/geometria.js', 'public/js/rysunki.js']) {
      const s = readFileSync(path.join(ROOT, f), 'utf8');
      assert.doesNotMatch(s, /^import[^\n]*vendor\//m, `${f}: statyczny import biblioteki`);
    }
    const app = readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
    assert.match(app, /import\('\.\/wykres\.js'\)/, 'wykres.js ładowany dynamicznie');
    const w = readFileSync(path.join(ROOT, 'public/js/wykres.js'), 'utf8');
    assert.match(w, /import\(LWC_URL\)/);
    for (const f of ['public/js/wykres.js', 'public/js/rysunki.js']) {
      const s = readFileSync(path.join(ROOT, f), 'utf8');
      assert.equal((s.match(/#[0-9a-f]{3,8}\b/gi) || []).length, 0, `${f}: literał #rrggbb`);
    }
    assert.ok(readFileSync(path.join(ROOT, 'public/vendor/VENDOR.md'), 'utf8').includes('1bb1ee79f9d4dd17261b53d930f7a8995748276f80e7ba0e24412b5068062f5f'), 'pliki vendor nietknięte (suma w VENDOR.md)');
  });

  test('wykresy-08: edytor w przeglądarce: tło przezroczyste, kolory z sondy, kadr bez skoku, 8 narzędzi, pozycja z pól poza zapisem, jeden zapis po 10 zmianach', async () => {
    const { findBrowser, dumpDom } = await import(pathToFileURL(path.join(ROOT, 'testy/przegladarka.mjs')).href);
    if (!findBrowser()) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    const S = await H.server(4808, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: H.tmp() });
    try {
      const dom = await dumpDom(`${S.base}/__testy/edytor-wykresu.html`);
      const m = /<pre id="wynik">([\s\S]*?)<\/pre>/.exec(dom);
      assert.ok(m, 'strona zwróciła wynik');
      assert.match(m[1], /^PASS/, m[1].slice(0, 2000));
    } finally { S.stop(); }
  });
};
