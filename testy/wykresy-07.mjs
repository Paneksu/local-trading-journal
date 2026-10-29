// wykresy-07: podgląd SVG (public/js/podglad.js): wybór świec w kadrze, kadr startowy (podnoszenie TF usunięte w P26, 28.10.2026: wykresy-07b-p26.mjs), brak kolorów w JS.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, assert, ROOT }) => {
  const P = () => import(pathToFileURL(path.join(ROOT, 'public/js/podglad.js')).href);

  test('wykresy-07: świece w kadrze z zapasem jednego ekranu, przycięte do danych', async () => {
    const { visibleRange } = await P();
    assert.deepEqual(visibleRange(1000, 400, 500), { start: 300, end: 600 });
    assert.deepEqual(visibleRange(1000, 10.5, 60.2), { start: 0, end: 110 }, 'zapas z lewej przycięty do 0');
    assert.deepEqual(visibleRange(1000, 950, 1010), { start: 890, end: 999 }, 'kadr w przyszłości: koniec na ostatniej świecy');
    assert.deepEqual(visibleRange(100, 20, 40, 0), { start: 20, end: 40 });
    assert.equal(visibleRange(0, 0, 10), null);
  });

  test('wykresy-07: kadr startowy od wejścia −2 h do wyjścia +1 h (bez wyjścia wejście +2 h)', async () => {
    const { startFrame, TFS } = await P();
    assert.deepEqual(startFrame(100000, 103600), { from: 92800, to: 107200 });
    assert.deepEqual(startFrame(100000, null), { from: 92800, to: 107200 });
    assert.deepEqual(startFrame(100000, 100060), { from: 92800, to: 103660 });
    assert.deepEqual(TFS, ['15s', '1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M'], 'P27: domyślna lista ulubionych z tygodniem i miesiącem');
  });

  test('wykresy-07: brak literałów kolorów w podglad.js; atrybucja i link do TradingView', () => {
    const src = readFileSync(path.join(ROOT, 'public/js/podglad.js'), 'utf8');
    assert.equal((src.match(/#[0-9a-f]{3,6}\b/gi) || []).length, 0);
    assert.equal((src.match(/rgba?\(/g) || []).length, 0);
    assert.match(src, /https:\/\/www\.tradingview\.com\//);
    assert.match(src, /TradingView Lightweight Charts™/);
    assert.ok(!/\/api\/drawings/.test(src), 'podgląd nie woła /api/drawings');
    assert.ok(!/databento\.com/i.test(src), 'podgląd nie woła Databento bezpośrednio');
  });
};
