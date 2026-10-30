// backtest-D2: rysunek „callout” (dymek z tekstem i ogonem przypiętym do czasu i ceny, §14 projektu) we wszystkich wykresach: walidacja paczki (parseDoc),
// geometria podglądu SVG (shapes/drawingShapes), pamięć stylu, zgodność z paczką (testy/zgodnosc-rysunkow.html, uruchamia wykresy-06) oraz narzędzie w edytorze
// (strona testy/backtest-uklady.html?part=callout, replay = ten sam edytor co Live). Rodzaj `callout` pochodzi z paczki 0.6.2 (decyzja [B], bez własnego rodzaju).
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const T = (k) => 1_793_000_000 + k * 60;
  // skala jak w wykresy-09b: 1 świeca = 10 px, 1 punkt ceny = 10 px (cena 5800 na y = 500); szerokość tekstu mierzona stałą (8 px na znak)
  async function scales(n = 100) {
    const G = await imp('public/js/geometria.js');
    const candles = Array.from({ length: n }, (_, k) => [T(k), 5800, 5801, 5799, 5800, 1]);
    const xs = G.indexScale({ lastIndex: n - 1, right: (n - 1) * 10, spacing: 10 });
    const ys = G.priceScaleFrom(5800, 500, 5810, 400);
    const s = G.chartScales({ candles, xs, ys, box: { left: 0, right: 1000, top: 0, bottom: 800 }, pip: 0.25, step: 60 });
    return { G, s: { ...s, measure: (txt) => txt.length * 8 } };
  }
  const callout = (extra = {}, text = 'BOS') => ({
    id: 'c1', kind: 'callout', text,
    points: [{ time: T(20), price: 5806 }, { time: T(40), price: 5812 }],
    style: { color: '#112233', width: 2, textColor: '#ffeedd', fontSize: 14, backgroundColor: '#445566', transparency: 40, text, ...extra },
  });

  test('backtest-D2: parseDoc przyjmuje callout', async () => {
    const { parseDoc } = await imp('lib/drawings.mjs');
    const t = (x) => x;
    const doc = (d) => ({ v: 1, at: new Date().toISOString(), d });
    const ok = await parseDoc(doc([callout()]), t);
    assert.equal(ok.d.length, 1);
    await assert.rejects(() => parseDoc(doc([{ ...callout(), points: [callout().points[0]] }]), t), (e) => /Nieprawidłowe dane rysunków\./.test(e.message), 'callout z jednym punktem');
  });

  test('backtest-D2: geometria calloutu', async () => {
    const { G, s } = await scales();
    const d = callout({ bold: true });
    const sh = G.shapes(d, s);
    assert.ok(sh && sh.kind === 'callout', 'shapes zwraca kształt calloutu');
    const path = sh.parts.find((p) => p.t === 'path'), text = sh.parts.find((p) => p.t === 'text');
    assert.ok(path && path.cls === 'drw-callout', 'część path z klasą drw-callout');
    // grot dokładnie w (x punktu 0, y punktu 0) i obecny w ścieżce
    const tip = { x: s.x(s.idx(T(20))), y: s.y(5806) };
    assert.deepEqual(path.tip, tip, 'grot w punkcie 0');
    assert.ok(path.d.includes(` L ${tip.x} ${tip.y} `) || path.d.includes(`L ${tip.x} ${tip.y} `), `ścieżka przechodzi przez grot: ${path.d}`);
    // dymek wyśrodkowany na punkcie 1: tekst 3 znaki × 8 = 24 px, ramka +20 px z każdej osi (fontSize 14: wysokość 14 + 20)
    const c1 = { x: s.x(s.idx(T(40))), y: s.y(5812) };
    assert.deepEqual(path.box, { x: c1.x - 22, y: c1.y - 17, w: 44, h: 34 }, JSON.stringify(path.box));
    assert.ok(path.d.startsWith(`M ${c1.x - 22 + 8} ${c1.y - 17}`), 'prostokąt z zaokrągleniem 8 px');
    assert.ok(/ A 8 8 0 0 1 /.test(path.d), 'zaokrąglone rogi');
    // tekst w środku dymku: początek wiersza 10 px od lewej krawędzi, środek tekstu = środek ramki
    assert.equal(text.text, 'BOS');
    assert.equal(text.anchor, 'start');
    assert.equal(text.x + 24 / 2, path.box.x + path.box.w / 2, 'środek tekstu = środek dymku');
    assert.equal(text.y, path.box.y + 10, 'pierwszy wiersz 10 px od góry');
    // kolory ze stylu: tło (z krytem 100 − transparency), ramka, tekst; pogrubienie przez fontWeight
    assert.equal(path.fillColor, '#445566');
    assert.equal(path.fillOpacity, 0.6);
    assert.equal(path.color, '#112233');
    assert.equal(path.width, 2);
    assert.equal(text.color, '#ffeedd');
    assert.equal(text.fontWeight, 700);
    assert.equal(G.shapes(callout({ bold: false }), s).parts.find((p) => p.t === 'text').fontWeight, undefined, 'bez pogrubienia');
    // ogon zwężający się do grota: z grotem po lewej stronie ramki ścieżka ma dwa punkty podstawy po tej samej stronie (±8 px od osi grota)
    const left = G.shapes(callout({}, 'BOS'), s).parts.find((p) => p.t === 'path').d.match(/L -?[\d.]+ -?[\d.]+/g);
    assert.ok(left.length >= 3, `ogon: grot i dwie podstawy (${left})`);
    // kilka wierszy: wysokość rośnie o fontSize na wiersz
    const two = G.shapes(callout({ text: 'a\nbb' }, 'a\nbb'), s);
    assert.equal(two.parts.filter((p) => p.t === 'text').length, 2);
    assert.equal(two.parts.find((p) => p.t === 'path').box.h, 14 * 2 + 20);
    // zły kształt: brak drugiego punktu
    assert.equal(G.shapes({ ...callout(), points: [callout().points[0]] }, s), null);
  });

  test('backtest-D2: callout w drawingShapes', async () => {
    const { G, s } = await scales();
    const r = G.drawingShapes([callout(), { id: 'x', kind: 'nieznany', points: [{ time: T(1), price: 5800 }] }, { ...callout(), id: 'c2', visible: false }], s);
    assert.equal(r.items.length, 1, 'jeden callout widoczny');
    assert.equal(r.skipped, 1, 'nieznany rodzaj pominięty, ukryty nie liczy się');
    assert.equal(r.items[0].kind, 'callout');
    assert.ok(G.KINDS.includes('callout'));
    assert.ok(G.TEXT_KINDS.includes('callout'), 'pole tekstu do edycji w miejscu');
    const slot = G.textSlot(callout(), s);
    assert.ok(slot && !slot.empty && slot.text === 'BOS' && slot.anchor === 'start', JSON.stringify(slot));
    const e = G.textSlot(callout({ text: '' }, ''), s);
    assert.ok(e && e.empty && e.text === '', 'pusty callout ma pole tekstu');
  });

  test('backtest-D2: podgląd SVG rysuje callout', async () => {
    const P = await imp('public/js/podglad.js');
    assert.equal(typeof P.drawingSvgOf, 'function', 'podglad.js eksportuje drawingSvgOf (jedna funkcja SVG dla podglądu, miniatur i kart)');
    const { G, s } = await scales();
    const svg = P.drawingSvgOf(G.shapes(callout({ bold: true }), s));
    assert.match(svg, /<path class="drw-callout fill"[^>]* d="M /);
    assert.match(svg, /fill="#445566"/);
    assert.match(svg, /stroke="#112233"/);
    assert.match(svg, /fill-opacity:0\.6/);
    assert.match(svg, /<text class="drw-text"[^>]*font-weight:700[^>]*>BOS<\/text>/);
  });

  test('backtest-D2: pamięć stylu', async () => {
    const R = await imp('public/js/rysunki.js');
    for (const k of ['backgroundColor', 'textColor', 'fontSize', 'bold', 'color', 'width', 'transparency']) assert.ok(R.STYLE_KEYS.includes(k), k);
    const st = { color: '#111', backgroundColor: '#222', textColor: '#333', fontSize: 16, bold: true, width: 3, transparency: 20, text: 'nie zapamiętuj', wordWrapWidth: 5 };
    assert.deepEqual(R.pickStyle(st), { color: '#111', backgroundColor: '#222', textColor: '#333', fontSize: 16, bold: true, width: 3, transparency: 20 });
    const c = { fg: 'F', fg2: 'F2', be: 'B', profit: 'P', loss: 'L', asia: 'a', london: 'o', ny: 'n' };
    const st0 = R.styleFor('callout', c);
    assert.equal(st0.backgroundColor, 'F', 'tło z tokenu (nie literał paczki)');
    assert.equal(st0.color, 'F'); assert.equal(st0.textColor, 'F');
    assert.notEqual(st0.backgroundColor, '#0097a7');
    // zapamiętany styl nadpisuje tokeny
    assert.equal(R.styleForTool('callout', c, false, { callout: { fontSize: 20, bold: true } }).fontSize, 20);
    assert.deepEqual(R.panelFor('callout'), ['callout']);
    assert.ok(R.TOOLS.includes('callout') && R.TOOLS.indexOf('callout') === R.TOOLS.indexOf('text') + 1, 'callout zaraz po tekście');
  });

  test('backtest-D2: zgodność z paczką', async () => {
    const { findBrowser, dumpDom } = await imp('testy/przegladarka.mjs');
    if (!findBrowser()) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    const S = await H.server(4807, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: H.tmp() });
    try {
      const dom = await dumpDom(`${S.base}/__testy/zgodnosc-rysunkow.html`);
      const m = /<pre id="wynik">([\s\S]*?)<\/pre>/.exec(dom);
      assert.ok(m, 'strona zwróciła wynik');
      assert.match(m[1], /^PASS/, m[1].slice(0, 2000));
    } finally { S.stop(); }
  });

  // ---- narzędzie w edytorze (strona robocza backtest-uklady.html?part=callout) ----
  let run = null;
  function pageResult() {
    run ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'ES', day: '2024-03-12', seed: 5, has1s: false });
      const S = await H.server(4808, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-uklady.html?part=callout`, { width: 1920, height: 1080, timeoutMs: 120_000 });
        return JSON.parse(txt);
      } finally { S.stop(); }
    })();
    return run;
  }
  const checks = (res, tag) => {
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= 20, `za mało sprawdzeń ${tag}: ${mine.length}`);
    const bad = res.checks.filter((c) => !c.ok);
    assert.equal(bad.length, 0, bad.map((c) => `${c.tag}: ${c.msg}`).join('\n'));
  };

  test('backtest-D2: narzędzie callout', async () => {
    const res = await pageResult();
    if (!res) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    checks(res, 'narzedzie');
  });
};
