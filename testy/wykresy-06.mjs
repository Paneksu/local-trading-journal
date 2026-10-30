// wykresy-06: geometria rysunków i świec (public/js/geometria.js) w Node + test zgodności z LWC w przeglądarce (Chrome/Edge bez zależności).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const G = () => import(pathToFileURL(path.join(ROOT, 'public/js/geometria.js')).href);
  // świece 1m z luką nocną (po indeksie 4) i brakującą minutą (po indeksie 6): 10 świec
  const T0 = 1793000000 - (1793000000 % 60);
  const times = [0, 60, 120, 180, 240, 7200, 7260, 7380, 7440, 7500].map((d) => T0 + d);
  const candles = times.map((t, k) => [t, 100 + k, 102 + k, 99 + k, k % 3 === 0 ? 99.5 + k : 101 + k, 10]);
  const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

  async function scales(extra = {}) {
    const g = await G();
    const xs = g.indexScale({ lastIndex: candles.length - 1, right: 590, spacing: 10, rightOffset: 2 });
    const ys = g.priceScale({ min: 90, max: 120, top: 0, height: 300 });
    return { g, s: g.chartScales({ candles, xs, ys, box: { left: 0, right: 600, top: 0, bottom: 300 }, ...extra }) };
  }

  test('wykresy-06: skala po indeksie zwija luki, punkt wewnątrz świecy trafia na tę świecę, przyszłość liczona interwałem', async () => {
    const g = await G();
    assert.equal(g.medianStep(candles), 60);
    assert.equal(g.timeToIndex(candles, times[4]), 4);
    assert.equal(g.timeToIndex(candles, times[5]), 5, 'świeca po luce nocnej ma kolejny indeks (luka zwinięta)');
    assert.equal(g.timeToIndex(candles, times[4] + 3000), 4, 'czas w luce trafia na ostatnią świecę przed luką');
    assert.equal(g.timeToIndex(candles, times[2] + 59), 2, 'punkt wewnątrz świecy trafia na tę świecę');
    assert.equal(g.timeToIndex(candles, times[6] + 90), 6, 'brakująca minuta (bez transakcji) nie tworzy świecy');
    assert.equal(g.timeToIndex(candles, times[9]), 9);
    assert.equal(g.timeToIndex(candles, times[9] + 180), 12, 'trzy interwały za ostatnią świecą');
    assert.equal(g.timeToIndex(candles, times[9] + 30), 9.5, 'za ostatnią świecą indeks ułamkowy (jak paczka rysowania)');
    assert.equal(g.timeToIndex(candles, times[0] - 120), -2, 'przed pierwszą świecą');
    assert.equal(g.indexToTime(candles, 12), times[9] + 180);
    assert.equal(g.indexToTime(candles, 5.4), times[5]);
    const xs = g.indexScale({ lastIndex: 9, right: 590, spacing: 10, rightOffset: 2 });
    assert.equal(xs.x(9), 570); assert.equal(xs.x(8), 560); assert.equal(xs.x(11), 590);
    assert.ok(close(xs.index(xs.x(3.25)), 3.25));
  });

  test('wykresy-06: skala ceny liniowa z marginesami LWC i z dwóch punktów', async () => {
    const g = await G();
    const ys = g.priceScale({ min: 100, max: 200, top: 10, height: 100 });
    assert.ok(close(ys.y(200), 30), 'margines górny 20%');
    assert.ok(close(ys.y(100), 100), 'margines dolny 10%');
    assert.ok(close(ys.y(150), 65));
    assert.ok(close(ys.price(65), 150));
    const two = g.priceScaleFrom(200, 30, 100, 100);
    assert.ok(close(two.y(150), 65));
    const flat = g.priceScale({ min: 5, max: 5, height: 100 });
    assert.ok(Number.isFinite(flat.y(5)), 'płaski zakres nie dzieli przez zero');
  });

  test('wykresy-06: kształty siedmiu narzędzi (Fibonacci własny i domyślny, prostokąt z CE, pozycja long/short)', async () => {
    const { g, s } = await scales();
    const P = (i, price) => ({ time: times[i], price });
    const hl = g.shapes({ id: 'a', kind: 'horizontal-line', points: [P(3, 105)], style: { color: '#123456' } }, s);
    assert.deepEqual([hl.parts[0].x1, hl.parts[0].x2], [0, 600]); assert.ok(close(hl.parts[0].y1, s.y(105)));
    assert.equal(hl.color, '#123456', 'kolor rysunku przechodzi do kształtu');
    const tl = g.shapes({ id: 'b', kind: 'trend-line', points: [P(1, 100), P(3, 110)], style: {} }, s).parts[0];
    assert.deepEqual([tl.x1, tl.x2], [s.x(1), s.x(3)]);
    const tlx = g.shapes({ id: 'b', kind: 'trend-line', points: [P(1, 100), P(3, 110)], style: { extendRight: true, extendLeft: true } }, s).parts[0];
    assert.deepEqual([tlx.x1, tlx.x2], [0, 600]);
    assert.ok(close((tlx.y2 - tlx.y1) / 600, (s.y(110) - s.y(100)) / (s.x(3) - s.x(1))), 'przedłużenie zachowuje nachylenie');
    const rc = g.shapes({ id: 'c', kind: 'rectangle', points: [P(5, 108), P(2, 104)], style: { rectMiddleLine: { visible: true } } }, s).parts;
    assert.equal(rc[0].t, 'rect'); assert.equal(rc[0].x, s.x(2)); assert.ok(close(rc[0].w, s.x(5) - s.x(2)));
    assert.ok(close(rc[1].y1, s.y(106)), 'CE na środku prostokąta');
    assert.equal(g.shapes({ id: 'c', kind: 'rectangle', points: [P(5, 108), P(2, 104)], style: {} }, s).parts.length, 1, 'bez CE domyślnie');
    const fibD = g.shapes({ id: 'd', kind: 'fib-retracement', points: [P(1, 100), P(4, 110)], style: {} }, s).parts.filter((p) => p.t === 'line');
    assert.deepEqual(fibD.map((p) => p.coeff), [0, 0.5, 0.618, 0.705, 0.79, 1], 'P7: domyślne poziomy');
    assert.ok(close(fibD[0].price, 110) && close(fibD[5].price, 100), 'poziom 0 na drugim punkcie, 1 na pierwszym');
    assert.ok(close(fibD[2].y1, s.y(110 - 0.618 * 10)));
    const fibO = g.shapes({ id: 'd', kind: 'fib-retracement', points: [P(1, 100), P(4, 110)], style: { levels: [{ coeff: 0 }, { coeff: 0.25, visible: false }, { coeff: 0.75 }, { coeff: 1 }] } }, s).parts.filter((p) => p.t === 'line');
    assert.deepEqual(fibO.map((p) => p.coeff), [0, 0.75, 1], 'poziomy z rysunku, ukryte pominięte');
    const tx = g.shapes({ id: 'e', kind: 'text', points: [P(6, 107)], text: 'BOS', style: {} }, s).parts[0];
    // P32: tekst jak w paczce: od punktu w prawo i w dół o margines fontSize/6 (domyślnie 14 px), górą wiersza ('hanging')
    assert.deepEqual([tx.t, tx.text, tx.x, tx.y, tx.baseline], ['text', 'BOS', s.x(6) + 14 / 6, s.y(107) + 14 / 6, 'hanging']);
    const lg = g.shapes({ id: 'f', kind: 'long-position', points: [P(2, 105), P(6, 105)], style: { stopLevel: 2, profitLevel: 6 } }, s).parts;
    const tgt = lg.find((p) => p.role === 'target'), stp = lg.find((p) => p.role === 'stop'), ent = lg.find((p) => p.role === 'entry');
    assert.equal(tgt.cls, 'pos-profit'); assert.equal(stp.cls, 'pos-loss');
    assert.ok(close(tgt.y, s.y(111)) && close(tgt.y + tgt.h, s.y(105)), 'long: cel nad wejściem');
    assert.ok(close(stp.y, s.y(105)) && close(stp.y + stp.h, s.y(103)), 'long: stop pod wejściem');
    assert.ok(close(ent.y1, s.y(105))); assert.deepEqual([ent.x1, ent.x2], [s.x(2), s.x(6)]);
    const sh = g.shapes({ id: 'g', kind: 'short-position', points: [P(2, 105), P(6, 105)], style: { stopLevel: 2, profitLevel: 6 } }, s).parts;
    assert.ok(close(sh.find((p) => p.role === 'target').price, 99) && close(sh.find((p) => p.role === 'stop').price, 107), 'short: cel pod, stop nad');
  });

  test('wykresy-06: nieznany rodzaj i zły kształt pominięte z licznikiem; markerStyle; candleShapes', async () => {
    const { g, s } = await scales();
    const r = g.drawingShapes([
      { id: 'a', kind: 'horizontal-line', points: [{ time: times[1], price: 101 }], style: {} },
      { id: 'b', kind: 'pitchfork', points: [{ time: times[1], price: 101 }], style: {} },
      { id: 'c', kind: 'trend-line', points: [], style: {} },
      { id: 'd', kind: 'text', points: [{ time: times[1], price: 101 }], style: {} }, // tekst bez treści
    ], s);
    assert.equal(r.items.length, 1); assert.equal(r.skipped, 3);
    assert.equal(g.markerStyle('theme'), 'text'); assert.equal(g.markerStyle('photo'), 'pill'); assert.equal(g.markerStyle('video'), 'pill');
    const cs = g.candleShapes(candles, s, {}, 0);
    assert.equal(cs.length, 10);
    const up = cs[1], down = cs[0]; // świeca 1: c=102 > o=101; świeca 0: c=99,5 < o=100
    assert.equal(up.up, true); assert.equal(down.up, false);
    assert.ok(close(up.body.y, s.y(102)) && close(up.body.y + up.body.h, s.y(101)), 'korpus od otwarcia do zamknięcia');
    assert.ok(close(up.wick.y1, s.y(103)) && close(up.wick.y2, s.y(100)), 'knot od high do low');
    assert.equal(up.x, s.x(1)); assert.ok(close(up.body.x + up.body.w / 2, up.x), 'korpus wyśrodkowany na indeksie');
    assert.equal(up.hollow, false, 'P18: domyślnie wypełnione');
    assert.equal(g.candleShapes([[1, 5, 5, 5, 5, 0]], s)[0].body.h, 1, 'doji ma co najmniej 1 px');
    assert.equal(g.candleShapes(candles.slice(2, 4), s, {}, 2)[0].i, 2, 'offset indeksu');
  });

  test('wykresy-06: brak literałów kolorów w geometria.js', () => {
    const src = readFileSync(path.join(ROOT, 'public/js/geometria.js'), 'utf8');
    assert.equal((src.match(/#[0-9a-f]{3,6}\b/gi) || []).length, 0);
    assert.equal((src.match(/rgba?\(/g) || []).length, 0);
  });

  test('wykresy-06: zgodność z LWC i paczką rysowania w przeglądarce (tolerancja 1 px)', async () => {
    const { findBrowser, cdpPage } = await import(pathToFileURL(path.join(ROOT, 'testy/przegladarka.mjs')).href);
    if (!findBrowser()) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    const S = await H.server(4806, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: H.tmp() });
    // J (przegląd P3-3): dumpDom z --virtual-time-budget zrzucał stronę pod obciążeniem przed wynikiem („strona zwróciła wynik” ✗ tylko w pełnym przebiegu).
    // cdpPage czeka w czasie rzeczywistym, aż pre#wynik przestanie mieć „…” (stan zamiast stałego limitu); asercje bez zmian.
    let txt = '';
    try { txt = await cdpPage(`${S.base}/__testy/zgodnosc-rysunkow.html`, { width: 1200, height: 800, timeoutMs: 120_000 }); } finally { S.stop(); }
    assert.ok(txt && txt !== '…', 'strona zwróciła wynik');
    assert.match(txt, /^PASS/, txt.slice(0, 2000));
  });
};
