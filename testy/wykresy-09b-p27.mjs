// wykresy-09b: P27 (28.10.2026), poprawki użytkownika do wykresu (podgląd, edytor rysunków, Ustawienia):
// 1) wszystkie strefy IANA (lista z filtrem w Ustawieniach, lista rozwijana na wykresie), 2) poziom BE na pozycjach rysowanych,
// 3) kłódka pozycji trade'a i zapis cen do pól trade'a (ticki, 409), 4) tekst i styl rysunków, 5) Gann box i poziomy Fibonacciego,
// 6) zapamiętany styl narzędzi, 7) „Wyczyść wszystkie”, 8) ulubione interwały oraz 1W i 1M wg sesji CME, 9) R:R na pozycjach rysowanych.
// Funkcje czyste w Node, trasy na atrapie Notion; przeglądarkowa część w testy/edytor-wykresu.html (wykresy-08) i testy/zgodnosc-rysunkow.html (wykresy-06).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  let port = 4870;
  const next = () => ++port;
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const C = { profit: 'p', loss: 'l', be: 'b', fg: 'f', fg2: 'f2', asia: 'a', london: 'o', ny: 'n' };
  // skala jak w podglądzie: 1 świeca = 10 px, 1 punkt ceny = 10 px (cena 5800 na y = 500)
  async function scales(n = 100) {
    const G = await lib('public/js/geometria.js');
    const candles = Array.from({ length: n }, (_, k) => [1_793_000_000 + k * 60, 5800, 5801, 5799, 5800, 1]);
    const xs = G.indexScale({ lastIndex: n - 1, right: (n - 1) * 10, spacing: 10 });
    const ys = G.priceScaleFrom(5800, 500, 5810, 400);
    return { G, candles, s: G.chartScales({ candles, xs, ys, box: { left: 0, right: 1000, top: 0, bottom: 800 }, pip: 0.25, step: 60, decimal: ',' }), T: (k) => candles[k][0] };
  }
  const withLS = async (fn) => {
    const mem = {};
    globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    try { return await fn(mem); } finally { delete globalThis.localStorage; }
  };

  // ---- 1) strefy czasowe ----
  // P29 (28.10.2026) skrócił listę (słowa użytkownika: «utc nie mialoby by wszystkich, mialy byc najpopularniejsze ale kazde utc [...] aktualna lista jest
  // za duza»): popularne + pełne godziny UTC, bez pola filtra w Ustawieniach (wykresy-14-p29.mjs). Z P27 zostaje lista rozwijana i wybór tymczasowy.
  test('wykresy-09: P27 strefy (po P29): lista rozwijana na wykresie z wyborem tymczasowym, polskie nazwy, przesunięcie UTC w opisie', async () => {
    const Z = await lib('public/js/podglad.js');
    const all = Z.allZones();
    assert.equal(all[0], 'UTC');
    assert.ok(all.includes('Europe/Warsaw') && all.includes('America/Chicago'));
    assert.ok(Z.filterZones('warsz', all).includes('Europe/Warsaw'), 'polska nazwa');
    assert.ok(Z.filterZones('new york', all).includes('America/New_York'), 'identyfikator ze spacją zamiast podkreślenia');
    const summer = Date.UTC(2026, 6, 1) / 1000;
    assert.equal(Z.tzOptionLabel('Europe/Warsaw', summer), 'Warszawa UTC+2 · Europe/Warsaw');
    const html = Z.tzSelectHtml(summer);
    assert.match(html, /<select[^>]*data-swc="tz"/, 'lista rozwijana, nie przycisk');
    assert.ok((html.match(/<option /g) || []).length === all.length + 1, 'opcja „Z Ustawień” + lista');
    Z.setChartTzDefault('Europe/Warsaw');
    assert.equal(Z.setChartTzOverride('Asia/Tokyo'), 'Asia/Tokyo');
    assert.equal(Z.chartTzOverride(), 'Asia/Tokyo');
    assert.equal(Z.setChartTzOverride('Nie/Ma'), 'Europe/Warsaw', 'zła strefa = bez nadpisania');
    Z.setChartTzOverride('Asia/Tokyo');
    Z.setChartTzDefault('UTC');
    assert.equal(Z.chartTz(), 'UTC', 'zmiana w Ustawieniach zdejmuje nadpisanie');
    Z.setChartTzDefault('');
    for (const f of ['public/js/podglad.js', 'public/js/wykres.js']) assert.doesNotMatch(src(f), /cycleTz\(/, `${f}: bez przycisku po kolei`);
    const u = src('public/js/ustawienia.js');
    assert.match(u, /id="sp-tz"/, 'lista w Ustawieniach');
    assert.match(src('public/js/podglad.js'), /P29 \(28\.10\.2026\), słowa użytkownika: «utc nie mialoby by wszystkich/);
  });

  // ---- 2) i 9) BE i R:R na pozycjach ----
  test('wykresy-09: P27 pozycja rysowana: poziom BE (linia --be na szerokości pozycji) i R:R; pozycja trade\'a bez R:R, z BE z pola', async () => {
    const { G, s, T } = await scales();
    const long = { id: 'l', kind: 'long-position', points: [{ time: T(10), price: 5800 }, { time: T(40), price: 5800 }], style: { stopLevel: 4, profitLevel: 10, beLevel: 1 } };
    const parts = G.shapes(long, s).parts;
    const be = parts.find((p) => p.role === 'be'), rr = parts.find((p) => p.role === 'rr');
    assert.equal(be.price, 5801); assert.equal(be.y1, 490); assert.equal(be.x1, 100); assert.equal(be.x2, 400); assert.equal(be.dash, 'dashed');
    assert.equal(rr.rr, 2.5); assert.equal(rr.text, 'R:R 2,5', 'separator dziesiętny z lokalizacji');
    assert.ok(rr.y < 500, 'long: R:R po stronie zysku (nad wejściem)');
    const short = { ...long, kind: 'short-position', style: { stopLevel: 2, profitLevel: 6, beLevel: 0.5 } };
    const sp = G.shapes(short, s).parts;
    assert.equal(sp.find((p) => p.role === 'be').price, 5799.5, 'short: BE poniżej wejścia');
    assert.ok(sp.find((p) => p.role === 'rr').y > 500 && sp.find((p) => p.role === 'rr').rr === 3);
    assert.ok(!G.shapes({ ...long, style: { stopLevel: 4, profitLevel: 10 } }, s).parts.some((p) => p.role === 'be'), 'bez beLevel bez BE');
    assert.ok(!G.shapes({ ...long, style: { ...long.style, showRR: false } }, s).parts.some((p) => p.role === 'rr'), 'R:R można wyłączyć');
    assert.ok(!G.shapes({ ...long, locked: true }, s).parts.some((p) => p.role === 'rr'), 'pozycja trade\'a (zablokowana) bez R:R');
    const { positionDrawing } = await lib('public/js/wykres.js');
    const D = { defaultStyleFor: () => ({ width: 1 }) };
    const tr = { at: 1_000_000, exitAt: 2_000_000, entryPrice: 100, exitPrice: 104, sl: 98, tp: 106, be: 101 };
    assert.equal(positionDrawing(tr, D, C, 0).style.beLevel, 1, 'BE z pola trade\'a na zablokowanej pozycji');
    assert.equal(positionDrawing({ ...tr, sl: 102, tp: 94, be: 99.5 }, D, C, 0).style.beLevel, 0.5, 'short: odległość w stronę zysku');
    assert.equal(positionDrawing({ ...tr, be: null }, D, C, 0).style.beLevel, undefined);
    const R = await lib('public/js/rysunki.js');
    assert.ok(Object.values(positionDrawing(tr, D, C, 0).style.positionStats).every((v) => v === false), 'bez pigułek kwot paczki na pozycji trade\'a');
    assert.ok(Object.values(R.styleFor('long-position', C).positionStats).every((v) => v === false) && R.styleFor('long-position', C).showRR === true, 'pozycja rysowana: R:R nasz, bez pigułek paczki');
    const w = src('public/js/wykres.js');
    assert.match(w, /extrasPrimitive/, 'edytor rysuje BE i R:R prymitywem serii');
    assert.match(src('public/js/geometria.js'), /«pokazuj rr na pozycjach ktore rysuje sam»/);
    assert.match(src('public/js/geometria.js'), /«do rysunkow pozycji dodaj mozliwosc dodawania poziomu be»/);
  });

  // ---- 3) pozycja trade'a → pola trade'a ----
  test('wykresy-09: P27 pozycja trade\'a: ceny z rysunku zaokrąglone do ticku (ES/MES/NQ/MNQ 0,25), zmiana ceny w panelu zmienia rysunek', async () => {
    const R = await lib('public/js/rysunki.js');
    for (const i of ['ES', 'mes', ' NQ', 'MNQ']) assert.equal(R.tickOf(i), 0.25, i);
    assert.equal(R.roundTick(5842.13), 5842.25); assert.equal(R.roundTick(5842.12), 5842); assert.equal(R.roundTick(5842.375), 5842.5);
    assert.equal(R.roundTick(NaN), null);
    const d = { kind: 'long-position', points: [{ time: 1, price: 5840.1 }, { time: 2, price: 5840.1 }], style: { stopLevel: 4, profitLevel: 8.2, beLevel: 2 } };
    // P28: wyjście należy teraz do rysunku pozycji (style.exitLevel); bez niego null
    assert.deepEqual(R.positionPrices(d), { entryPrice: 5840, exitPrice: null, sl: 5836, tp: 5848.25, be: 5842 });
    const sh = { ...d, kind: 'short-position' };
    assert.deepEqual(R.positionPrices(sh), { entryPrice: 5840, exitPrice: null, sl: 5844, tp: 5832, be: 5838 });
    assert.equal(R.positionPrices({ ...d, style: { stopLevel: 0, profitLevel: 0 } }).sl, null, 'bez SL/TP: puste pola');
    const moved = R.withPositionPrice(d, 'entryPrice', 5850.1);
    assert.deepEqual(moved.points.map((p) => +p.price.toFixed(6)), [5850.1, 5850.1], 'wejście przesuwa obie kotwice');
    assert.equal(moved.style.stopLevel, 4, 'SL jedzie z wejściem (odległość bez zmian)');
    assert.equal(+R.withPositionPrice(d, 'sl', 5835).style.stopLevel.toFixed(6), 5.1);
    assert.equal(+R.withPositionPrice(sh, 'tp', 5830).style.profitLevel.toFixed(6), 10.1);
    assert.equal(R.withPositionPrice(d, 'be', null).style.beLevel, undefined, 'puste BE usuwa poziom');
    const w = src('public/js/wykres.js');
    assert.match(w, /fetch\(`\/api\/trades\/\$\{tradeId\}`, \{ method: 'PATCH'/, 'ta sama trasa co formularz trade\'a');
    assert.match(w, /'X-THQ': '1'/);
    assert.match(w, /edited/, 'kontrola 409 przez last_edited_time');
    assert.match(src('public/js/app.js'), /onTradeSaved/, 'aplikacja odświeża dane po zapisie cen');
  });

  test('wykresy-09: P27 zapis cen pozycji na atrapie: PATCH trade\'a z edited z zapisu rysunków, nowe edited w odpowiedzi, stary edited = 409', async () => {
    const A = await H.atrapa(next());
    const dir = H.tmp();
    const I = H.IDS;
    writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x\nNOTION_ROOT_URL=${H.PARENT_URL}\nDS_TRADES=${I.DS_TRADES}\nDS_KONTA=${I.DS_KONTA}\nDS_DZIENNIK=${I.DS_DZIENNIK}\nDS_FINANSE=${I.DS_FINANSE}\n`);
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: 2, lang: 'pl' }));
    const env = H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], env);
    assert.equal(mig.code, 0, mig.err);
    const S = await H.server(next(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    try {
      const rows = async () => A.get('/__test/pages?ds=trades');
      const id = (await rows())[0].id;
      const { defaultStyleFor } = await lib('public/vendor/lightweight-charts-drawing/lightweight-charts-drawing.es.js');
      const doc = { v: 1, lib: '0.6.2', at: new Date().toISOString(), d: [{ id: 'dw_a', kind: 'horizontal-line', points: [{ time: 1793000000, price: 5800 }], style: defaultStyleFor('horizontal-line') }] };
      const sv = await H.dash(S.base, '/api/drawings/save', { id, doc });
      assert.equal(sv.status, 200, JSON.stringify(sv.j));
      assert.match(String(sv.j.edited), /^\d{4}-/, 'zapis rysunków zwraca znacznik edycji strony');
      const body = { entryPrice: 5841, exitPrice: 5847, sl: 5835, tp: 5849, be: 5843, edited: sv.j.edited };
      const r = await H.dash(S.base, `/api/trades/${id}`, body, { method: 'PATCH' });
      assert.equal(r.status, 200, JSON.stringify(r.j));
      assert.match(String(r.j.edited), /^\d{4}-/, 'odpowiedź niesie nowe edited');
      const p = (await rows()).find((x) => x.id === id).p;
      assert.deepEqual(['Cena wejścia', 'Cena wyjścia', 'SL', 'TP', 'BE'].map((k) => p[k]?.number), [5841, 5847, 5835, 5849, 5843]);
      const stale = await H.dash(S.base, `/api/trades/${id}`, { ...body, sl: 5830, edited: '2000-01-01T00:00:00.000Z' }, { method: 'PATCH' });
      assert.equal(stale.status, 409); assert.equal(stale.j.code, 'stale');
      assert.equal((await rows()).find((x) => x.id === id).p.SL.number, 5835, 'stary znacznik niczego nie nadpisał');
      assert.deepEqual(await A.get('/__test/violations'), []);
    } finally { S.stop(); A.stop(); }
  });

  // ---- 4) tekst i styl rysunków ----
  test('wykresy-09: P27 tekst na liniach i prostokącie (rozmiar, kolor, wyrównanie), grubość i styl linii, wypełnienie i krycie prostokąta', async () => {
    const { G, s, T } = await scales();
    const rect = { id: 'r', kind: 'rectangle', points: [{ time: T(10), price: 5810 }, { time: T(30), price: 5800 }],
      style: { color: '#123456', width: 3, lineStyle: 'dotted', backgroundColor: '#654321', transparency: 70, text: 'OB', fontSize: 16, textColor: '#abcdef', horzLabelsAlign: 'left', vertLabelsAlign: 'bottom' } };
    const rp = G.shapes(rect, s).parts;
    const box = rp.find((p) => p.t === 'rect');
    assert.equal(box.width, 3); assert.equal(box.dash, 'dotted'); assert.equal(box.fillColor, '#654321'); assert.ok(Math.abs(box.fillOpacity - 0.3) < 1e-9);
    const tx = rp.find((p) => p.t === 'text');
    assert.equal(tx.text, 'OB'); assert.equal(tx.size, 16); assert.equal(tx.color, '#abcdef'); assert.equal(tx.anchor, 'start');
    assert.ok(tx.x === box.x && tx.y < 400, 'lewo, nad górną krawędzią (jak paczka: bottom = nad); P32: od samej krawędzi, paczka daje margines poziomy tylko przy tekście w środku wysokości');
    const mid = G.shapes({ ...rect, style: { ...rect.style, horzLabelsAlign: 'center', vertLabelsAlign: 'middle' } }, s).parts.find((p) => p.t === 'text');
    assert.equal(mid.anchor, 'middle'); assert.equal(mid.x, 200); assert.ok(mid.y < 450 && mid.y > 430, 'środek prostokąta');
    assert.equal(G.shapes({ ...rect, style: { ...rect.style, fillBackground: false } }, s).parts[0].fill, false, 'wypełnienie można wyłączyć');
    const tl = G.shapes({ id: 't', kind: 'trend-line', points: [{ time: T(10), price: 5800 }, { time: T(20), price: 5810 }], style: { text: 'BOS', width: 2 } }, s).parts;
    assert.equal(tl[0].width, 2);
    const tt = tl.find((p) => p.t === 'text');
    assert.equal(tt.text, 'BOS'); assert.ok(Math.abs(tt.angle + 45) < 1e-9, 'tekst wzdłuż linii');
    const hl = G.shapes({ id: 'h', kind: 'horizontal-line', points: [{ time: T(5), price: 5805 }], style: { text: 'PDH', horzLabelsAlign: 'right' } }, s).parts.find((p) => p.t === 'text');
    assert.equal(hl.anchor, 'end'); assert.ok(hl.x < 1000);
    const R = await lib('public/js/rysunki.js');
    assert.deepEqual(R.panelFor('rectangle'), ['text', 'line', 'fill']);
    assert.deepEqual(R.panelFor('trend-line'), ['text', 'line']);
    assert.deepEqual(R.panelFor('horizontal-line'), ['text', 'line']);
    const pod = src('public/js/podglad.js');
    assert.match(pod, /fill-opacity:/, 'podgląd: krycie z danych rysunku');
    assert.match(pod, /rotate\(/, 'podgląd: tekst obrócony wzdłuż linii');
  });

  // ---- 5) Gann box i Fibonacci ----
  test('wykresy-09: P27 Gann box (poziomy ceny i czasu, strefy, odwrócenie) i Fibonacci z edytowalnymi poziomami, wypełnieniem i podpisami', async () => {
    const { G, s, T } = await scales();
    const g = { id: 'g', kind: 'gann-box', points: [{ time: T(10), price: 5800 }, { time: T(30), price: 5810 }], style: {} };
    const gp = G.shapes(g, s).parts;
    const hz = gp.filter((p) => p.cls === 'drw-gann' && p.y1 === p.y2), vt = gp.filter((p) => p.cls === 'drw-gann' && p.x1 === p.x2);
    assert.deepEqual(hz.map((p) => p.coeff), G.GANN_DEFAULT); assert.deepEqual(vt.map((p) => p.coeff), G.GANN_DEFAULT);
    assert.equal(hz[0].y1, 500, 'poziom 0 na cenie pierwszego punktu'); assert.equal(hz[6].y1, 400);
    assert.deepEqual(vt.map((p) => p.x1), [100, 150, 180, 200, 220, 250, 300], 'czas po indeksie świecy (zaokrąglony)');
    assert.equal(gp.filter((p) => p.cls === 'drw-zone').length, 12, 'strefy ceny i czasu');
    const gr = G.shapes({ ...g, style: { reverse: true, fillBackground: false, fillVertBackground: false } }, s).parts;
    assert.equal(gr.filter((p) => p.cls === 'drw-gann' && p.y1 === p.y2)[0].y1, 400, 'odwrócony: poziom 0 na drugim punkcie');
    assert.equal(gr.filter((p) => p.cls === 'drw-zone').length, 0);
    assert.ok(G.KINDS.includes('gann-box'));
    const fib = { id: 'f', kind: 'fib-retracement', points: [{ time: T(10), price: 5800 }, { time: T(30), price: 5810 }],
      style: { fillBackground: true, transparency: 80, fibLevelsAsPercents: true, levels: [{ coeff: 0, color: '#111111', visible: true }, { coeff: 0.5, color: '#222222', visible: true }, { coeff: 0.886, color: '#333333', visible: false }, { coeff: 1, color: '#444444', visible: true }] } };
    const fp = G.shapes(fib, s).parts;
    assert.deepEqual(fp.filter((p) => p.cls === 'drw-fib').map((p) => p.coeff), [0, 0.5, 1], 'wyłączony poziom pominięty');
    assert.deepEqual(fp.filter((p) => p.cls === 'drw-fib').map((p) => p.color), ['#111111', '#222222', '#444444'], 'kolor per poziom');
    assert.equal(fp.filter((p) => p.cls === 'drw-zone').length, 2, 'wypełnienie między poziomami');
    assert.deepEqual(fp.filter((p) => p.cls === 'drw-label').map((p) => p.text), ['0% (5810.00)', '50% (5805.00)', '100% (5800.00)'], 'podpisy procentów i cen (dwa miejsca, jak edytor)');
    const R = await lib('public/js/rysunki.js');
    let lv = [{ coeff: 0, visible: true }, { coeff: 1, visible: true }];
    lv = R.editLevels(lv, { add: null });
    assert.deepEqual(lv.map((l) => l.coeff), [0, 1, 1.5], 'dodanie poziomu za ostatnim');
    lv = R.editLevels(lv, { set: 2, field: 'coeff', value: '0,786' });
    assert.deepEqual(lv.map((l) => l.coeff), [0, 0.786, 1], 'zmiana wartości (przecinek) i sortowanie');
    lv = R.editLevels(lv, { set: 1, field: 'visible', value: false });
    assert.equal(lv[1].visible, false);
    lv = R.editLevels(lv, { set: 0, field: 'color', value: '#00ff00' });
    assert.equal(lv[0].color, '#00ff00');
    assert.deepEqual(R.editLevels(lv, { remove: 0 }).map((l) => l.coeff), [0.786, 1]);
    assert.deepEqual(R.editLevels(lv, { set: 0, field: 'coeff', value: 'abc' }).map((l) => l.coeff), [0, 0.786, 1], 'zła wartość odrzucona');
    assert.ok(R.TOOLS.includes('gann-box'));
    const gs = R.styleFor('gann-box', C);
    assert.deepEqual(gs.levels.map((l) => l.coeff), [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1]);
    assert.ok(gs.levels.every((l) => ['f2', 'a', 'o', 'n'].includes(l.color)), 'kolory poziomów z tokenów');
    assert.deepEqual(R.panelFor('gann-box'), ['line', 'levels', 'vLevels', 'fill', 'gann']);
    assert.deepEqual(R.panelFor('fib-retracement'), ['line', 'levels', 'fill', 'fib']);
  });

  // ---- 6) zapamiętany styl ----
  test('wykresy-09: P27 zapamiętany styl narzędzi: localStorage per narzędzie (FVG osobno), bez tekstu, nowy rysunek z zapamiętanym stylem', async () => {
    const R = await lib('public/js/rysunki.js');
    assert.equal(R.TOOL_STYLE_KEY, 'thq.chart.toolStyle.v1');
    assert.deepEqual(R.loadToolStyles(), {}, 'bez localStorage: pusto, bez wyjątku');
    await withLS(async (mem) => {
      R.saveToolStyle('rectangle', { color: '#ff0000', width: 3, text: 'nie zapamiętuj', transparency: 60 });
      assert.deepEqual(JSON.parse(mem[R.TOOL_STYLE_KEY]).rectangle, { color: '#ff0000', width: 3, transparency: 60 });
      const st = R.styleForTool('rectangle', C);
      assert.equal(st.width, 3); assert.equal(st.color, '#ff0000'); assert.equal(st.textColor, 'f', 'reszta z tokenów');
      assert.equal(R.styleForTool('rectangle', C, true).color, 'b', 'FVG ma osobny zapamiętany styl');
      R.saveToolStyle('fvg', { width: 2 });
      assert.equal(R.styleForTool('rectangle', C, true).width, 2);
      R.saveToolStyle('long-position', { beOn: true, showRR: false });
      const lp = R.styleForTool('long-position', C);
      assert.equal(lp.beLevel, 1, 'zapamiętane „Poziom BE” włącza BE w nowej pozycji'); assert.equal(lp.showRR, false);
      assert.equal(R.toolKeyOf({ kind: 'rectangle', style: { rectMiddleLine: { visible: true } } }), 'fvg');
      assert.equal(R.toolKeyOf({ kind: 'rectangle', style: {} }), 'rectangle');
      globalThis.localStorage = { getItem: () => { throw new Error('zablokowany'); }, setItem: () => { throw new Error('zablokowany'); } };
      assert.deepEqual(R.loadToolStyles(), {}); R.saveToolStyle('x', {});
    });
    assert.ok(!R.STYLE_KEYS.includes('text') && !R.STYLE_KEYS.includes('beLevel'));
    assert.match(src('public/js/rysunki.js'), /«wszystkie rysunki zapamietuja nasz wybor/);
  });

  // ---- 7) Wyczyść wszystkie ----
  test('wykresy-09: P27 „Wyczyść wszystkie”: przycisk w pasku, potwierdzenie, cofalne, pozycja trade\'a zostaje', async () => {
    const r = src('public/js/rysunki.js');
    assert.match(r, /data-act="clear"/);
    assert.match(r, /ctx\.confirm/, 'z potwierdzeniem');
    assert.match(r, /async function clearAll\(\)[\s\S]{0,900}snap\(\)/, 'migawka do cofnięcia');
    assert.match(r, /«dodaj mozliwosc wyczyszczenia wszystkich rysnkow z danego wykresu»/);
    assert.match(src('public/js/wykres.js'), /confirm: \(o\) => confirmDialog\(o\)/);
  });

  // ---- 8) interwały ----
  test('wykresy-09: P27 ulubione interwały: lista edytowalna (dowolny TF s/m/h/D/W/M), zapamiętana, posortowana, najmniej jeden', async () => {
    const Z = await lib('public/js/podglad.js');
    assert.deepEqual(Z.TFS, ['15s', '1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M']);
    assert.equal(Z.TF_FAV_KEY, 'thq.chart.tfs.v1');
    assert.deepEqual(Z.normFavTfs(['1D', '5m', 'zle', '5m', '1M', '45s', '1W']), ['45s', '5m', '1D', '1W', '1M']);
    assert.deepEqual(Z.addFavTf(['1m', '1h'], '2h'), ['1m', '1h', '2h']);
    assert.deepEqual(Z.addFavTf(['1m'], 'xx'), ['1m'], 'zły interwał nie wchodzi');
    assert.deepEqual(Z.removeFavTf(['1m', '1h'], '1m'), ['1h']);
    assert.deepEqual(Z.removeFavTf(['1m'], '1m'), ['1m'], 'ostatniego nie da się usunąć');
    assert.deepEqual(Z.loadFavTfs(), Z.TFS, 'bez localStorage: domyślna lista');
    await withLS(async (mem) => {
      Z.saveFavTfs(['3m', '1M', '2h']);
      assert.deepEqual(JSON.parse(mem[Z.TF_FAV_KEY]), ['3m', '2h', '1M']);
      assert.deepEqual(Z.loadFavTfs(), ['3m', '2h', '1M']);
      mem[Z.TF_FAV_KEY] = '[]';
      assert.deepEqual(Z.loadFavTfs(), Z.TFS, 'pusta lista = domyślna');
    });
    assert.equal(Z.tfSec('1M'), 2592000); assert.equal(Z.tfSec('1W'), 604800);
    for (const f of ['public/js/podglad.js', 'public/js/wykres.js']) assert.match(src(f), /mountTfBar\(root/, `${f}: ta sama lista w podglądzie i edytorze`);
  });

  test('wykresy-09: P27 1M wg sesji CME: miesiąc dnia handlowego (zamknięcia), świeca od otwarcia pierwszej sesji miesiąca; 1D bez zmian', async () => {
    const S = await lib('public/js/swiece.js');
    const p = S.parseTf('1M');
    assert.equal(p.unit, 'M'); assert.equal(S.parseTf('3M').n, 3); assert.equal(S.pickSource('1M'), '1m');
    assert.equal(S.parseTf('1m').unit, 'm', 'm = minuta, M = miesiąc');
    const ct = (y, mo, d, h, mi = 0) => { // czas Chicago (CDT/CST) → epoka; listopad 2026: CDT do 1.11 2:00
      for (const off of [5, 6]) { const e = Date.UTC(y, mo - 1, d, h + off, mi) / 1000; const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hourCycle: 'h23', day: 'numeric', hour: 'numeric' }).formatToParts(new Date(e * 1000)); const o = Object.fromEntries(f.map((x) => [x.type, Number(x.value)])); if (o.day === d && o.hour === h) return e; }
      throw new Error('ct');
    };
    const bar = (t, px) => [t, px, px + 1, px - 1, px, 1];
    const bars = [
      bar(ct(2026, 10, 29, 18), 100),  // sesja otwarta czw. 29.10 17:00, dzień handlowy pt. 30.10 → październik
      bar(ct(2026, 10, 30, 15), 101),  // ta sama sesja, pt. 15:00
      bar(ct(2026, 11, 1, 17, 30), 110), // niedziela 1.11 17:30 → dzień handlowy pon. 2.11 → listopad
      bar(ct(2026, 11, 30, 18), 120),  // pon. 30.11 18:00 → dzień handlowy wt. 1.12 → grudzień
      bar(ct(2026, 12, 1, 10), 121),
    ];
    const m = S.aggregate(bars, '1M');
    assert.equal(m.length, 3, 'październik, listopad, grudzień');
    assert.deepEqual(m.map((b) => b[1]), [100, 110, 120], 'otwarcie');
    assert.deepEqual(m.map((b) => b[4]), [101, 110, 121], 'zamknięcie');
    assert.equal(m[1][0], ct(2026, 11, 1, 17), 'listopad od niedzieli 1.11 17:00 (pierwsza sesja miesiąca)');
    assert.equal(m[2][0], ct(2026, 11, 30, 17), 'grudzień od pon. 30.11 17:00 (sesja wt. 1.12)');
    assert.equal(m[0][0], ct(2026, 9, 30, 17), 'październik od śr. 30.09 17:00 (sesja czw. 1.10)');
    assert.equal(S.aggregate(bars, '2M').length, 2, '2M: pary miesięcy od 1970-01');
    // 1D bez zmian: jedna sesja 17:00-16:00 Chicago
    const d = S.aggregate(bars, '1D');
    assert.equal(d.length, 3, 'trzy sesje'); assert.equal(d[0][0], ct(2026, 10, 29, 17));
    assert.match(src('lib/candles.mjs'), /tf\.unit !== 'M'/, 'serwer agreguje M z warstwy 1m');
  });

  // ---- teksty i utrwalenie decyzji ----
  test('wykresy-09: P27 teksty UI w en.json, P27 w sekcji 0 planu, brak literałów kolorów w nowym kodzie', async () => {
    const en = json(path.join(ROOT, 'public/i18n/en.json'));
    for (const k of ['Gann box', 'Wyczyść wszystkie rysunki', 'Wyczyścić wszystkie rysunki?', 'Edytuj listę interwałów', 'Ulubione interwały', 'Szybki wybór', 'Wszystkie strefy', 'Strefa czasowa osi',
      'Poziom BE', 'Zapisz w trade\'zie', 'Pozycja trade\'a', 'Kolor tekstu', 'Grubość', 'Krycie', 'Dodaj poziom', 'Poziomy czasu', 'Szukaj strefy, np. Warszawa, New York, +2', 'Ustawienia rysunku']) assert.ok(en[k], `en.json: ${k}`);
    const plan = src('docs/plany/wykresy-swiecowe.md');
    assert.match(plan, /\| P27 \|/, 'P27 w sekcji 0');
    assert.match(plan, /28\.10\.2026/);
    for (const f of ['public/js/rysunki.js', 'public/js/geometria.js', 'public/js/podglad.js']) {
      const s = src(f);
      assert.equal((s.match(/#[0-9a-f]{6}\b/gi) || []).length, 0, `${f}: literał #rrggbb`);
    }
  });
};
