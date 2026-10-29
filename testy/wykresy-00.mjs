// wykresy-00: biblioteki w public/vendor (sumy, brak statycznych importów, licencje, eksporty, udział w sumie wydania).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const V = path.join(ROOT, 'public/vendor');
  const sha = (rel) => createHash('sha256').update(readFileSync(path.join(V, rel))).digest('hex');
  const vendorMd = () => readFileSync(path.join(V, 'VENDOR.md'), 'utf8');
  const LWC = 'lightweight-charts/lightweight-charts.standalone.production.mjs';
  const DRW = 'lightweight-charts-drawing/lightweight-charts-drawing.es.js';
  const ALL = [LWC, 'lightweight-charts/LICENSE', 'lightweight-charts/NOTICE', DRW, 'lightweight-charts-drawing/LICENSE'];

  test('wykresy-00: sumy SHA-256 plików vendor zgodne z VENDOR.md i z kartą', () => {
    const md = vendorMd();
    for (const f of ALL) {
      assert.ok(md.includes(`\`${f}\``), `VENDOR.md wymienia ${f}`);
      assert.ok(md.includes(sha(f)), `suma ${f} zgodna z VENDOR.md`);
    }
    assert.equal(sha(LWC), '1bb1ee79f9d4dd17261b53d930f7a8995748276f80e7ba0e24412b5068062f5f');
    assert.equal(sha(DRW), '361f2d2140ea0fab3feb2a6ec463594810607252d3b42cf4196a4af8b1e6afb2');
    assert.equal(readFileSync(path.join(V, LWC)).length, 197827);
    assert.equal(readFileSync(path.join(V, DRW)).length, 306381);
  });

  test('wykresy-00: pliki vendor nie mają statycznego importu', () => {
    for (const f of [LWC, DRW]) {
      const src = readFileSync(path.join(V, f), 'utf8');
      assert.ok(!/^\s*import\s[^(]/m.test(src), `${f}: brak "import … from" na początku linii`);
      assert.ok(!/^\s*export\s[^;]*\sfrom\s*["']/m.test(src), `${f}: brak "export … from"`);
      assert.ok(!/\bimport\s*\(/.test(src), `${f}: brak dynamicznego import()`);
    }
  });

  test('wykresy-00: licencje i NOTICE obecne, niepuste; VENDOR.md ma wersje i integralność', () => {
    for (const f of ['lightweight-charts/LICENSE', 'lightweight-charts/NOTICE', 'lightweight-charts-drawing/LICENSE']) {
      assert.ok(existsSync(path.join(V, f)) && readFileSync(path.join(V, f), 'utf8').trim().length > 50, `${f} niepusty`);
    }
    assert.match(readFileSync(path.join(V, 'lightweight-charts/NOTICE'), 'utf8'), /tradingview\.com/);
    const md = vendorMd();
    for (const s of ['5.2.1', '0.6.2', 'sha512-IVwoK1RL', 'sha512-KyT0vzrN', 'Apache-2.0', 'MIT']) assert.ok(md.includes(s), `VENDOR.md zawiera ${s}`);
  });

  test('wykresy-00: import() obu bibliotek w Node i wymagane eksporty', async () => {
    const lwc = await import(pathToFileURL(path.join(V, LWC)).href);
    for (const k of ['createChart', 'CandlestickSeries', 'ColorType', 'createSeriesMarkers']) assert.ok(k in lwc, `LWC eksportuje ${k}`);
    const drw = await import(pathToFileURL(path.join(V, DRW)).href);
    for (const k of ['DrawingManager', 'parseDrawings', 'buildNewDrawing', 'setDefaultStyleOverride']) assert.ok(k in drw, `drawing eksportuje ${k}`);
    assert.equal(drw.VERSION, '0.6.2');
  });

  test('wykresy-00: suma wydania obejmuje public/vendor i .gitattributes chroni bajty', async () => {
    const { treeHash } = await import('../lib/updater.mjs');
    const files = H.appFiles();
    for (const f of ALL) assert.ok(files.some((x) => x.path === `public/vendor/${f}`), `appFiles ma ${f}`);
    assert.match(treeHash(files), /^[0-9a-f]{64}$/);
    const without = files.filter((x) => x.path !== `public/vendor/${LWC}`);
    assert.notEqual(treeHash(files), treeHash(without), 'plik vendor zmienia sumę drzewa');
    assert.match(readFileSync(path.join(ROOT, '.gitattributes'), 'utf8'), /^public\/vendor\/\*\* -text$/m);
  });
};
