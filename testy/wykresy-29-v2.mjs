// Karty i filmy v2 „clean look” (29.10.2026): P43 (mniej danych, wyższy wykres, ciaśniejsza skala, film 1:1), P44 (duża liczba w oknie), P45 (rysunek pozycji:
// strefy jak TradingView albo znaczniki), P46 (styl kart w oknie, osobny styl miniatur), P47 (karty okresu: krzywa, trade'y, win rate, najlepszy trade),
// P52 (wymienne wiersze danych do stałego maksimum, przebudowa okna Udostępnij). Prefiks wykresy-v2.
// Świece wyłącznie lokalne (atrapa fetch albo syntetyczne w przeglądarce), zero Notion, zero Databento.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
  const A = 'aaaaaaaa-0000-4000-8000-000000000001';
  const AT = Date.parse('2021-03-10T14:41:00Z');
  async function card(o = {}) {
    const S = await lib('public/js/stats.js');
    const U = await lib('public/js/udostepnij-dane.js');
    const konta = S.normalizeKonta([{ _id: A, name: 'A', size: 50000 }]);
    const exit = new Date(AT + (o.dur ?? 75) * 1000).toISOString();
    const [t] = S.normalizeTrades([{ _id: 'v1', _created: '2021-03-10T14:41:00.000Z', typ: { name: o.typ || 'Live' }, date: '2021-03-10T14:41:00.000+00:00', exit: o.dur === null ? undefined : exit.replace('Z', '+00:00'),
      r: 1.25, pnl: o.pnl === undefined ? 1040 : o.pnl, konta: [A], dir: { name: 'Long' }, instrument: { name: o.instrument || 'NQ' }, entryPrice: 12888.5, exitPrice: 12914.5, sl: 12867.75, tp: 12914.5,
      setup: o.setup === undefined ? { name: 'Pullback' } : o.setup, session: { name: 'Nowy Jork' } }]);
    return U.tradeCard(t, konta);
  }

  test('wykresy-v2: settings.chart: wiersze danych (biała lista, kolejność katalogu, najwyżej 4, pusta lista dozwolona), styl kart, rysunek pozycji, styl miniatur', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    const d = C.chartDefaults();
    assert.deepEqual(d.rowsTrade, ['entry', 'exit', 'alt'], 'P43: cena wejścia, cena wyjścia, druga jednostka');
    assert.deepEqual(d.rowsPeriod, ['n', 'wr', 'best'], 'P47: trade\'y, win rate, najlepszy trade');
    assert.equal(C.CARD_ROWS_MAX, 4);
    const s = C.sanitizeChart({ rowsTrade: ['setup', 'entry', 'entry', 'x', 7, 'dur', 'sl', 'tp', '__proto__'], rowsPeriod: 'n' });
    assert.deepEqual(s.rowsTrade, ['entry', 'sl', 'tp', 'dur'], 'kolejność katalogu, bez duplikatów i obcych, najwyżej 4');
    assert.deepEqual(s.rowsPeriod, d.rowsPeriod, 'nie lista = domyślne');
    assert.deepEqual(C.sanitizeChart({ rowsTrade: [] }).rowsTrade, [], 'pusta lista: karta bez wierszy');
    assert.equal(C.sanitizeChart({ style: 'line' }).miniStyle, 'line', 'P46: brak stylu miniatur = styl podglądu (jak dotąd)');
    assert.equal(C.sanitizeChart({ style: 'line', miniStyle: 'candles' }).miniStyle, 'candles');
    assert.equal(C.sanitizeChart({ shareDraw: 'zones' }).shareDraw, 'position');
    assert.equal(C.sanitizeChart({ shareDraw: 'marks' }).shareDraw, 'marks');
    assert.ok(C.CHART_GROUPS.cards.includes('rowsTrade') && C.CHART_GROUPS.cards.includes('shareDraw') && C.CHART_GROUPS.look.includes('miniStyle'));
    const r = C.resetChartGroup({ ...d, rowsTrade: ['setup'], miniStyle: 'line' }, 'cards');
    assert.deepEqual(r.rowsTrade, d.rowsTrade); assert.equal(r.miniStyle, 'line', 'reset kart nie rusza miniatur');
    assert.deepEqual(C.sanitizeChart(C.sanitizeChart(s)), C.sanitizeChart(s), 'idempotentna');
  });

  test('wykresy-v2: kadr i interwał karty: pozycja ok. 55% kadru, krótki trade najpierw 1s (od 150 s), potem 1m (od 45 min), długi tylko 1m; gęsta linia do 320 punktów', async () => {
    const W = await lib('public/js/udostepnij.js');
    const c = await card();
    const plan = W.cardChartPlan(c);
    assert.deepEqual(plan.map((p) => p.res), ['1s', '1m']);
    // seria 2022-2026 (29.10.2026): przy 4 min trade 45-60 s zajmował 20-25% szerokości; kadr 1s od 150 s, więc 75 s = 50%
    assert.equal(plan[0].to - plan[0].from, 150, '75 s: kadr 1s co najmniej 150 s');
    assert.ok(75 / (plan[0].to - plan[0].from) >= 0.45, 'bardzo krótki trade zajmuje co najmniej 45% kadru');
    assert.equal(plan[0].tf, '1s');
    assert.ok(plan[1].to - plan[1].from >= 45 * 60 && plan[1].tf === '1m');
    const a = AT / 1000, b = a + 75;
    assert.ok(plan[0].from < a && plan[0].to > b, 'trade w kadrze');
    assert.ok((a - plan[0].from) > (plan[0].to - b), 'więcej kontekstu przed wejściem (60/40)');
    const long = await card({ dur: 3 * 3600 });
    const pl = W.cardChartPlan(long);
    assert.deepEqual(pl.map((p) => p.res), ['1m']);
    assert.ok(Math.abs((3 * 3600) / (pl[0].to - pl[0].from) - W.CARD_POS) < 0.01, 'pozycja = 55% kadru');
    assert.ok((pl[0].to - pl[0].from) / 120 <= W.CARD_POINTS && pl[0].tf === '2m', `tf ${pl[0].tf}`);
    for (const span of [240, 900, 4000, 20000, 90000]) for (const res of ['1s', '1m']) {
      const tf = W.cardTf(span, res);
      const sec = Number(tf.slice(0, -1)) * { s: 1, m: 60, h: 3600 }[tf.slice(-1)];
      assert.ok(span / sec <= W.CARD_POINTS && sec >= (res === '1s' ? 1 : 60), `${span} ${res} ${tf}`);
    }
    const open = await card({ dur: null });
    assert.deepEqual(W.cardChartPlan(open).map((p) => p.res), ['1m'], 'otwarty trade: 1m');
  });

  test('wykresy-v2: wczytanie świec karty: pełne 1s → jedno żądanie 1s; niepełne 1s (missing albo mało świec) → drugie żądanie 1m; EURUSD i wyłączony przełącznik → zero żądań; świece łączone w przeglądarce', async () => {
    const W = await lib('public/js/udostepnij.js');
    const C = await lib('public/js/styl-wykresu.js');
    const c = await card();
    const cfg = C.chartDefaults();
    const s1 = Array.from({ length: 240 }, (_, i) => [AT / 1000 - 120 + i, 1, 2, 0.5, 1.5, 3]);
    const m1 = Array.from({ length: 45 }, (_, i) => [AT / 1000 - 1500 + i * 60, 1, 2, 0.5, 1.5, 3]);
    const run = async (resp1s) => {
      const calls = [];
      const L = W.createCardCharts({ fetch: async (url) => { calls.push(url); const tf = new URL(url, 'http://x').searchParams.get('tf'); return { ok: true, json: async () => (tf.endsWith('s') ? resp1s : { tf: '1m', bars: m1, missing: [] }) }; }, cfg: () => cfg, badj: () => true });
      return { r: await L.get(c), calls };
    };
    let x = await run({ tf: '1s', bars: s1, missing: [] });
    assert.equal(x.calls.length, 1); assert.equal(x.r.res, '1s'); assert.equal(x.r.bars.length, 240);
    x = await run({ tf: '1s', bars: s1.slice(0, 100), missing: [[AT / 1000, AT / 1000 + 60]] });
    assert.equal(x.calls.length, 2, 'missing w 1s: drugie żądanie 1m'); assert.equal(x.r.res, '1m');
    x = await run({ tf: '1s', bars: s1.slice(0, 20), missing: [] });
    assert.equal(x.r.res, '1m', 'mało świec 1s: 1m');
    for (const q of x.calls) { const p = new URL(q, 'http://x').searchParams; assert.equal(p.get('adjust'), '1'); assert.ok(p.get('tfrom'), 'kotwica = kontrakt trade\'a (P38)'); }
    let n = 0;
    const L = W.createCardCharts({ fetch: async () => { n++; return { ok: true, json: async () => ({}) }; }, cfg: () => cfg, badj: () => true });
    assert.equal(await L.get(await card({ instrument: 'EURUSD' })), null); assert.equal(n, 0, 'EURUSD: zero żądań');
    const L2 = W.createCardCharts({ fetch: async () => { n++; return { ok: true, json: async () => ({}) }; }, cfg: () => ({ ...cfg, shareChart: false }), badj: () => true });
    assert.equal(await L2.get(c), null); assert.equal(n, 0, 'wyłączony: zero żądań');
    // świece: najwyżej CARD_CANDLES, linia: wszystkie punkty
    const resp = { tf: '1s', res: '1s', bars: s1, from: AT / 1000 - 120, to: AT / 1000 + 120 };
    assert.equal(W.cardBars(resp, 'line').length, 240);
    const cb = W.cardBars(resp, 'candles');
    assert.ok(cb.length <= W.CARD_CANDLES && cb.length >= 20, `świece ${cb.length}`);
  });

  test('wykresy-v2: wiersze danych (P52): druga jednostka, duża liczba nie powtarza się w wierszach, puste pola znikają, najwyżej 4; okres: najlepszy i najgorszy trade, średni R, profit factor, zielone dni', async () => {
    const R = await lib('public/js/udostepnij-render.js');
    const S = await lib('public/js/stats.js');
    const U = await lib('public/js/udostepnij-dane.js');
    const T = { fg: 'a', fg2: 'b', profit: 'p', loss: 'l', be: 'e' };
    const c = await card();
    const lab = (rows, metric = 'R', d = c) => R.cardModel('trade', d, metric, T, 'result', { rows }).rows.map((r) => r.label);
    assert.deepEqual(lab(undefined), ['Cena wejścia', 'Cena wyjścia', 'Wynik w $']);
    assert.deepEqual(lab(['alt'], '$'), ['Wynik w R']);
    assert.deepEqual(lab(['R', '$', 'alt'], 'R'), ['Wynik w $'], 'R przy dużej liczbie R znika, alt nie dubluje $');
    assert.deepEqual(lab(['setup', 'session', 'dur', 'time', 'exitTime']), ['Setup', 'Sesja', 'Czas trwania', 'Godzina wejścia'], 'najwyżej 4');
    assert.deepEqual(lab(['setup', 'sl', 'tp'], 'R', await card({ setup: null })), ['Stop Loss', 'Take Profit'], 'brak setupu: wiersz znika');
    assert.deepEqual(lab([], 'R'), [], 'bez wierszy');
    const bt = await card({ typ: 'Backtest', pnl: null });
    assert.deepEqual(lab(['entry', 'exit', 'alt'], 'R', bt), ['Cena wejścia', 'Cena wyjścia'], 'Backtest bez $: brak drugiej jednostki');
    const m = R.cardModel('trade', bt, 'R', T);
    assert.deepEqual(m.label.map((x) => x.s)[0], 'Backtest'); assert.equal(m.title, 'NQ');
    // okres
    const konta = S.normalizeKonta([{ _id: A, name: 'A', size: 50000 }]);
    let i = 0;
    const row = (date, r, pnl, inst = 'NQ') => ({ _id: `p${++i}`, _created: `${date}T14:0${i}:00.000Z`, typ: { name: 'Live' }, date: `${date}T14:0${i}:00.000+00:00`, r, pnl, konta: [A], dir: { name: 'Long' }, instrument: { name: inst } });
    const ts = S.normalizeTrades([row('2026-10-19', 2, 800, 'ES'), row('2026-10-20', -1, -400), row('2026-10-21', 0.5, 200)]);
    const w = U.weekCard(ts, konta, '2026-10-21', 'R');
    const pr = (rows, metric = 'R') => Object.fromEntries(R.cardModel('week', w, metric, T, 'result', { rows }).rows.map((r) => [r.label, r.value + (r.suffix ? ' ' + r.suffix : '')]));
    const F = await lib('public/js/format.js');
    const p1 = pr(['n', 'wr', 'best', 'worst']);
    assert.equal(p1["Trade'y"], '3'); assert.equal(p1['Win rate'], '67%');
    assert.equal(p1['Najlepszy trade'], `${F.fmtR(2)} ES`); assert.equal(p1['Najgorszy trade'], `${F.fmtR(-1)} NQ`);
    const p2 = pr(['alt', 'avgR', 'pf', 'green']);
    assert.ok(p2['Wynik w $'] && p2['Średni R'] === F.fmtR(0.5));
    assert.match(p2['Profit factor'], /^2[,.]50$/, 'PF = 1000 / 400');
    assert.equal(p2['Zielone dni'], '2 z 3');
    assert.ok(!('Wynik w R' in pr(['alt'], 'R')), 'alt okresu przy R = $');
    const allWin = U.weekCard(S.normalizeTrades([row('2026-10-19', 1, 100)]), konta, '2026-10-19', 'R');
    assert.equal(R.cardModel('week', allWin, 'R', T, 'result', { rows: ['pf', 'worst'] }).rows.length, 0, 'bez straty PF znika, jeden trade bez najgorszego');
  });

  test('wykresy-v2: P54 „Dane”: 6 najczęstszych pigułek, reszta po „Pokaż wszystkie” (aria-expanded); zaznaczona spoza szóstki widoczna także po zwinięciu', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    for (const [top, list] of [[C.TRADE_ROWS_TOP, C.TRADE_ROWS], [C.PERIOD_ROWS_TOP, C.PERIOD_ROWS]]) {
      assert.equal(top.length, 6); assert.ok(top.every((x) => list.includes(x)), 'szóstka z katalogu');
    }
    assert.deepEqual(C.visibleRows(C.TRADE_ROWS, C.TRADE_ROWS_TOP, ['entry'], false), C.TRADE_ROWS.filter((x) => C.TRADE_ROWS_TOP.includes(x)), 'zwinięte: sama szóstka w kolejności katalogu');
    const v = C.visibleRows(C.TRADE_ROWS, C.TRADE_ROWS_TOP, ['entry', 'setup'], false);
    assert.equal(v.length, 7); assert.ok(v.includes('setup'), 'zaznaczona spoza szóstki widoczna po zwinięciu');
    assert.deepEqual(C.visibleRows(C.TRADE_ROWS, C.TRADE_ROWS_TOP, ['entry'], true), C.TRADE_ROWS, 'rozwinięte: wszystkie');
    const u = src('public/js/udostepnij.js');
    assert.match(u, /data-sh="rows-all"[^`]*aria-expanded="\$\{/); assert.match(u, /aria-controls="sh-pills"/);
    assert.match(u, /case 'rows-all':/);
  });

  test('wykresy-v2: okno Udostępnij (P52): grupy Plik, Karta, Wykres, Duża liczba, Dane, Tło i zwinięte „Więcej opcji”; przełączniki wyglądu, rysunku i wierszy zapisują settings.chart; film 1:1; miniatury ze stylem miniatur', () => {
    const u = src('public/js/udostepnij.js');
    for (const g of ["group('file'", "group('card'", "group('chart'", "group('metric'", "group('rows'", "group('bg'"]) assert.ok(u.includes(g), g);
    assert.match(u, /<details class="sh-more"/);
    assert.match(u, /case 'style':[^\n]*saveChart\(\{ shareStyle/); assert.match(u, /case 'draw':[^\n]*saveChart\(\{ shareDraw/);
    assert.match(u, /case 'row':/); assert.match(u, /saveChart\(\{ \[key\]/);
    assert.match(u, /data-sh="row"/); assert.match(u, /aria-pressed="\$\{on\}"/);
    assert.match(src('public/js/app.js'), /createShare\(\{[\s\S]{0,300}saveChart:/);
    assert.match(src('public/js/podglad.js'), /style: cfg\.miniStyle \|\| cfg\.style/);
    assert.match(src('public/features.css'), /\.sh-more summary:focus-visible/);
    // P43: bez poświaty w rendererze
    assert.doesNotMatch(src('public/js/udostepnij-render.js'), /shadowBlur = blur|shadowOnly\(/);
  });

  test('wykresy-v2: piksele w przeglądarce headless (karty-v2.html?part=unit): 4 formaty × 2 motywy, styl i rysunek zmieniają obraz, klatka po końcu filmu = PNG, wiersze z katalogu', async () => {
    const { findBrowser, dumpDom } = await import(pathToFileURL(path.join(ROOT, 'testy/przegladarka.mjs')).href);
    if (!findBrowser()) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    const S = await H.server(4936, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: H.tmp() });
    try {
      const dom = await dumpDom(`${S.base}/__testy/karty-v2.html?part=unit`);
      const m = /<pre id="wynik">([\s\S]*?)<\/pre>/.exec(dom);
      assert.ok(m, 'strona zwróciła wynik');
      assert.match(m[1], /^PASS/, m[1].slice(0, 2000));
    } finally { S.stop(); }
  });
};
