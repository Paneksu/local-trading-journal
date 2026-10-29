// wykresy-17 (pakiet I, etap 17): wykres ceny w karcie trade'a. P15 wariant C (27.10.2026, słowa użytkownika «Nasz wykres w kartach na moje ryzyko»):
// pełny wykres (świece albo linia, oś cen i czasu), CHART_IN_SHARE = true, przełącznik w Ustawieniach (settings.chart.shareChart).
// Dane wyłącznie lokalne: GET /api/candles?…&tf=auto&maxBars=60, B-ADJ wg ustawienia i kotwica = kontrakt trade'a (P38), jak w podglądzie trade'a.
// P19: znaczniki zależne od tła (motyw = tekst, zdjęcie = pigułka). Karta bez świec (EURUSD, brak danych, przełącznik wyłączony) wygląda jak dziś.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
  const A = 'aaaaaaaa-0000-4000-8000-000000000001';
  // trade ES 20.10.2026 15:30-16:10 UTC (40 min), ceny, SL/TP, kontrakt ESZ6
  const AT = Date.parse('2026-10-20T15:30:00Z');
  const rowOf = (o = {}) => ({
    _id: o.id || 'tr1', _created: '2026-10-20T15:30:00.000Z', title: '', typ: { name: 'Live' },
    date: '2026-10-20T15:30:00.000+00:00', exit: '2026-10-20T16:10:00.000+00:00',
    r: 2, pnl: 600, konta: [A], dir: { name: 'Long' }, instrument: { name: o.instrument || 'ES' },
    entryPrice: o.entryPrice === undefined ? 5812.25 : o.entryPrice, exitPrice: o.exitPrice === undefined ? 5824.25 : o.exitPrice, sl: 5806.25, tp: 5824.25,
    contract: o.contract ?? 'ESZ6',
  });
  async function card(o) {
    const S = await lib('public/js/stats.js');
    const U = await lib('public/js/udostepnij-dane.js');
    const konta = S.normalizeKonta([{ _id: A, name: 'A', size: 50000 }]);
    const [t] = S.normalizeTrades([rowOf(o)]);
    return { t, c: U.tradeCard(t, konta) };
  }
  const bars = (() => { const out = []; let p = 5810; for (let k = 0; k < 48; k++) { const t = AT / 1000 - 10 * 60 + k * 60; const o = p, c = p + ((k % 5) - 2) * 0.75; out.push([t, o, Math.max(o, c) + 0.5, Math.min(o, c) - 0.5, c, 100]); p = c; } return out; })();

  test('wykresy-17: tradeCard niesie ceny i czas trade\'a (entryPrice, exitPrice, sl, tp, instrument, at, exitAt, contract)', async () => {
    const { t, c } = await card();
    assert.equal(t.at, AT, 'normalizeTrades: at z daty wejścia');
    assert.equal(c.entryPrice, 5812.25); assert.equal(c.exitPrice, 5824.25); assert.equal(c.sl, 5806.25); assert.equal(c.tp, 5824.25);
    assert.equal(c.instrument, 'ES'); assert.equal(c.at, AT); assert.equal(c.exitAt, AT + 40 * 60000); assert.equal(c.contract, 'ESZ6');
  });

  test('wykresy-17: żądanie świec karty (v2): lokalne /api/candles z jawnym tf, kadr z pozycją na 55% szerokości, B-ADJ wg ustawienia, kotwica = kontrakt trade\'a; wyłączony przełącznik, EURUSD i brak czasu: brak żądania', async () => {
    const W = await lib('public/js/udostepnij.js');
    const C = await lib('public/js/styl-wykresu.js');
    assert.equal(W.CHART_IN_SHARE, true, 'P15 wariant C: wykres w kartach domyślnie włączony');
    assert.match(src('public/js/udostepnij.js'), /CHART_IN_SHARE = true[^\n]*\n?[^\n]*|27\.10\.2026[\s\S]{0,400}Nasz wykres w kartach na moje ryzyko/);
    assert.match(src('public/js/udostepnij.js'), /Nasz wykres w kartach na moje ryzyko/, 'komentarz ze słowami użytkownika (P15)');
    const { c } = await card();
    const cfg = C.chartDefaults();
    const u = W.cardChartRequest(c, { cfg, badj: true });
    assert.ok(u && u.startsWith('/api/candles?'), String(u));
    const q = new URL(u, 'http://x').searchParams;
    // v2 (P43): 40 min > 30 min, więc tylko świece 1m; kadr = 40 min / 0,55 ≈ 72,7 min, reszta 60% przed wejściem i 40% po wyjściu; 73 świece 1m ≤ 320
    assert.equal(q.get('instrument'), 'ES'); assert.equal(q.get('tf'), '1m'); assert.equal(q.get('maxBars'), null);
    const a = AT / 1000, b = a + 40 * 60, rest = 2400 / 0.55 - 2400;
    assert.equal(Number(q.get('from')), a - Math.round(rest * 0.6), 'wejście − 60% reszty kadru');
    assert.equal(Number(q.get('to')), b + Math.round(rest - Math.round(rest * 0.6)), 'wyjście + 40% reszty kadru');
    assert.equal(q.get('adjust'), '1', 'B-ADJ włączony w ustawieniu (P38)');
    assert.equal(q.get('contract'), 'ESZ6', 'kotwica = kontrakt trade\'a');
    assert.equal(Number(q.get('tfrom')), a); assert.equal(Number(q.get('tto')), b);
    assert.equal(new URL(W.cardChartRequest(c, { cfg, badj: false }), 'http://x').searchParams.get('adjust'), null, 'B-ADJ wyłączony: bez adjust');
    assert.equal(W.cardChartRequest(c, { cfg: { ...cfg, shareChart: false }, badj: true }), null, 'przełącznik wyłączony');
    assert.equal(W.cardChartRequest((await card({ instrument: 'EURUSD' })).c, { cfg, badj: true }), null, 'EURUSD: brak źródła');
    assert.equal(W.cardChartRequest({ ...c, at: null }, { cfg, badj: true }), null, 'brak czasu wejścia');
    assert.equal(W.cardChartRequest({ ...c, kind: 'week' }, { cfg, badj: true }), null, 'karty okresu bez wykresu ceny');
    // MES → ES (P9) przez tę samą mapę co miniatury
    assert.ok(W.cardChartRequest((await card({ instrument: 'MES' })).c, { cfg, badj: true }));
  });

  test('wykresy-17: wczytanie świec karty: jedno żądanie na kartę (cache), zero przy wyłączonym przełączniku; brak świec, noSource i błąd → karta bez wykresu', async () => {
    const W = await lib('public/js/udostepnij.js');
    const C = await lib('public/js/styl-wykresu.js');
    const { c } = await card();
    const calls = [];
    const fakeFetch = (resp) => async (url) => { calls.push(url); return { ok: true, json: async () => resp }; };
    const cfg = C.chartDefaults();
    let L = W.createCardCharts({ fetch: fakeFetch({ tf: '1m', bars }), cfg: () => cfg, badj: () => true });
    const r1 = await L.get(c), r2 = await L.get(c);
    assert.equal(calls.length, 1, 'jedno żądanie na kartę');
    assert.equal(r1.tf, '1m'); assert.equal(r1.bars.length, bars.length); assert.deepEqual(r1, r2); assert.equal(r1.res, '1m', 'v2: odpowiedź niesie rozdzielczość danych');
    calls.length = 0;
    L = W.createCardCharts({ fetch: fakeFetch({ tf: '1m', bars }), cfg: () => ({ ...cfg, shareChart: false }), badj: () => true });
    assert.equal(await L.get(c), null); assert.equal(calls.length, 0, 'wyłączony: zero żądań');
    for (const resp of [{ noSource: true, bars: [] }, { tf: '1m', bars: [] }, null]) {
      L = W.createCardCharts({ fetch: fakeFetch(resp), cfg: () => cfg, badj: () => true });
      assert.equal(await L.get(c), null, JSON.stringify(resp));
    }
    L = W.createCardCharts({ fetch: async () => { throw new Error('sieć'); }, cfg: () => cfg, badj: () => true });
    assert.equal(await L.get(c), null, 'błąd: karta bez wykresu');
  });

  test('wykresy-17: wykres karty (v2): seria z tych samych kształtów co podgląd (te same współrzędne przy tych samych skalach), bez osi (clean look, P43), pole w ramce; poza świecami brak wykresu', async () => {
    const R = await lib('public/js/udostepnij-render.js');
    const G = await lib('public/js/geometria.js');
    const P = await lib('public/js/podglad.js');
    const C = await lib('public/js/styl-wykresu.js');
    const { c } = await card();
    const box = { x: 100, y: 200, w: 800, h: 400 };
    for (const style of ['candles', 'line']) for (const draw of ['position', 'marks']) {
      const pc = R.priceChart({ bars, tf: '1m', style, draw }, c, box, 1);
      assert.ok(pc && pc.s, style);
      const ref = style === 'line' ? G.lineShapes(C.closePoints(bars), pc.s) : G.candleShapes(bars, pc.s, {}, 0);
      assert.deepEqual(pc.series, ref, `${style}: kształty z geometria.js`);
      const svg = P.seriesSvg(bars, pc.s, 0, { style });
      assert.equal(svg, style === 'line' ? P.linePath(pc.series) : P.candlePaths(pc.series), `${style}: ten sam rysunek co podgląd SVG`);
      assert.ok(pc.plot.left >= box.x && pc.plot.right <= box.x + box.w && pc.plot.top >= box.y && pc.plot.bottom <= box.y + box.h, 'w ramce');
      assert.equal(pc.priceTicks, undefined, 'bez osi cen'); assert.equal(pc.timeTicks, undefined, 'bez osi czasu');
      assert.ok(pc.iEntry != null && pc.iExit != null && pc.iExit > pc.iEntry);
      assert.equal(pc.draw, draw);
      // P45: SL/TP tylko w trybie „Pozycja”
      assert.equal(pc.lv.sl && pc.lv.tp, draw === 'position', `${draw}: SL/TP`);
    }
    assert.equal(R.priceChart({ bars: bars.slice(0, 3), tf: '1m', style: 'candles' }, { ...c, at: AT + 86400000, exitAt: AT + 86400000 + 60000 }, box, 1), null);
    assert.equal(R.priceChart({ bars: [], tf: '1m' }, c, box, 1), null);
  });

  test('wykresy-17: wiersze karty trade\'a (v2, P43/P52): domyślnie cena wejścia, cena wyjścia i druga jednostka, bez setupu, sesji i godzin; ceny z dwoma miejscami; style kart: świece i linia', async () => {
    const R = await lib('public/js/udostepnij-render.js');
    const C = await lib('public/js/styl-wykresu.js');
    const T = { fg: 'a', fg2: 'b', profit: 'p', loss: 'l', be: 'e' };
    const rowsOf = (d, rows) => R.cardModel('trade', d, 'R', T, 'result', { rows }).rows.map((r) => r.label);
    const full = (await card()).c, none = (await card({ entryPrice: null, exitPrice: null })).c;
    assert.deepEqual(rowsOf(full), ['Cena wejścia', 'Cena wyjścia', 'Wynik w $'], rowsOf(full).join(','));
    assert.deepEqual(rowsOf(none), ['Wynik w $'], 'puste ceny: wiersze znikają');
    assert.ok(!rowsOf(full).includes('Setup') && !rowsOf(full).includes('Sesja') && !rowsOf(full).includes('Czas trwania'), 'P43: mniej danych');
    assert.equal(R.cardModel('trade', full, 'R', T, 'result').rows.find((r) => r.label === 'Cena wejścia').value, R.fmtPrice(5812.25));
    assert.equal(R.fmtPrice(4522), new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }).format(4522));
    assert.ok(/1[,.]08425$/.test(R.fmtPrice(1.08425)), 'EURUSD: pięć miejsc');
    assert.deepEqual(C.SHARE_STYLES, ['candles', 'line']);
    assert.deepEqual(C.SHARE_DRAWS, ['position', 'marks']);
    const d = C.chartDefaults();
    assert.equal(C.sanitizeChart({ style: 'line', shareStyle: 'same' }).shareStyle, 'line', 'stare „jak w podglądzie” = styl podglądu');
    assert.equal(C.sanitizeChart({ shareStyle: 'own' }).shareStyle, 'candles', 'stara wartość „own” wraca do stylu podglądu (domyślnie świece)');
  });

  test('wykresy-17: Ustawienia → Wykresy, grupa „Karty udostępniania” (v2): wykres ceny, wygląd (świece / linia), rysunek pozycji, krzywa kapitału, „Przywróć domyślne (Karty)”; bez SL/TP w kartach (P45); styl miniatur (P46)', () => {
    const s = src('public/js/ustawienia.js');
    for (const k of ['shareChart', 'equity']) assert.match(s, new RegExp(`chk\\('${k}'`), k);
    for (const k of ['slCard', 'tpCard']) assert.doesNotMatch(s, new RegExp(`chk\\('${k}'`), k);
    assert.match(s, /'ch-share-style'/); assert.match(s, /'ch-share-draw'/); assert.match(s, /'ch-mini-style'/);
    const en = JSON.parse(src('public/i18n/en.json'));
    for (const k of ['Wykres ceny w kartach', 'Styl wykresu w karcie', 'Rysunek pozycji w karcie', 'Styl miniatur na liście', 'Cena wejścia', 'Cena wyjścia', 'Pozycja', 'Wejście i wyjście', 'Linia']) assert.ok(k in en, `brak EN: ${k}`);
  });

  test('wykresy-17: piksele w przeglądarce headless: bez świec = karta jak dziś, ze świecami wykres w kolumnie/pasie, pigułki na zdjęciu, 4 formaty × 2 motywy', async () => {
    const { findBrowser, dumpDom } = await import(pathToFileURL(path.join(ROOT, 'testy/przegladarka.mjs')).href);
    if (!findBrowser()) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    const S = await H.server(4932, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: H.tmp() });
    try {
      const dom = await dumpDom(`${S.base}/__testy/karty-i.html?part=17`);
      const m = /<pre id="wynik">([\s\S]*?)<\/pre>/.exec(dom);
      assert.ok(m, 'strona zwróciła wynik');
      assert.match(m[1], /^PASS/, m[1].slice(0, 2000));
    } finally { S.stop(); }
  });
};
