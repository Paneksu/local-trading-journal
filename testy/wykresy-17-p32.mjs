// wykresy-17: P32 (28.10.2026), poprawki użytkownika do wykresów. Słowa użytkownika:
// 1) «tryb auto nawet jak jest wylaczony po wejsciu na wykres to jest on wlaczony i trzeba go przeklikac dwa razy i dopiero wtedy dziala»;
// 2) «tlo sesji zweyryfikuj poprawnosc tego oraz zmien na to ze tworzysz boxa w rangu sesji oraz z high/low wychodza linie z opisem. kiedy te high/low jest
//    sweepniete powinno sie konczyc, tak samo pdh/pdl powinno sie konczyc po sweepie. dopracuj te dwie rzeczy i dodaj do nich ustawienia zeby uzytkownik mogl je dostosowac»;
// 3) panel przypięty ustawień rysunku z X, działa na ostatnim rysunku, znika do kliknięcia zębatki; 4) «utc powinno byc w poprawnej kolejnosci»;
// 5) «pole tekstu ktore wpisujemy na wykres nie powinno miec innego wygladu podczas wpisywania niz wyglada po wpisaniu»;
// 6) «rysunki powinny miec pole do kliknieca, gdzie maja ustawione pole tekstowe i jak sie je kliknie podwojnie to zaczynac pisac tam»;
// 7) «rysunek kwadrata powinna miec grubosc scian 0 czyli by znikaly»; 8) R ręczne («tez ma byc reczny»): wykresy-13.
// Funkcje czyste w Node, edytor, podgląd i Ustawienia w przeglądarce (testy/nakladki-p32.html).
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  let port = 4990;
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const utc = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
  const bar = (t, h, l) => [t, (h + l) / 2, h, l, (h + l) / 2, 1];

  test('wykresy-17: P32-1 „Auto” wyłączone bez zakresu ręcznego startuje od zakresu skali automatycznej (marginesy 8%), włączone nie rusza zakresu', async () => {
    const P = await lib('public/js/podglad.js');
    const r = P.startRange(false, null, 100, 184);
    assert.ok(Math.abs(r.min - 92) < 1e-9 && Math.abs(r.max - 192) < 1e-9, JSON.stringify(r)); // 84 / 0,84 = 100: 8 pkt marginesu z każdej strony
    assert.deepEqual(P.startRange(false, { min: 1, max: 2 }, 100, 184), { min: 1, max: 2 }, 'zakres ręczny zostaje');
    assert.equal(P.startRange(true, null, 100, 184), null, 'przy Auto bez zmian');
    const flat = P.startRange(false, null, 50, 50);
    assert.ok(flat.max > 50 && flat.min < 50, 'płaski zakres dostaje szerokość');
  });

  test('wykresy-17: P32-2 sweep: pierwsza świeca, której cena wychodzi POZA poziom (dotknięcie to nie sweep), w zakresie [od, do]', async () => {
    const S = await lib('public/js/swiece.js');
    const c = [bar(0, 10, 5), bar(60, 12, 6), bar(120, 12.25, 7), bar(180, 9, 4.75), bar(240, 13, 3)];
    assert.equal(S.sweepIndex(c, 1, 12, 'hi'), 2, 'high 12 dotknięte w świecy 1, przebite w 2');
    assert.equal(S.sweepIndex(c, 0, 5, 'lo'), 3);
    assert.equal(S.sweepIndex(c, 0, 20, 'hi'), -1);
    assert.equal(S.sweepIndex(c, 0, 12, 'hi', 1), -1, 'koniec zakresu');
  });

  test('wykresy-17: P32-2 box sesji = zakres czasu × high/low sesji; linie H/L od prawej krawędzi boxa do sweepu albo krawędzi danych; PDH/PDL od początku sesji do sweepu albo jej końca', async () => {
    const S = await lib('public/js/swiece.js');
    // 1m 27.10.2026 13:00-21:30 UTC (EDT): NY 13:30-20:00 UTC; wewnątrz sesji high 110 o 15:00, low 90 o 17:00; po sesji 20:10 high 111 (sweep H), low nieprzebite
    const T = utc(2026, 10, 27, 13);
    const c = [];
    for (let k = 0; k < 510; k++) {
      const t = T + k * 60;
      let h = 101, l = 99;
      if (t === utc(2026, 10, 27, 15)) h = 110;
      if (t === utc(2026, 10, 27, 17)) l = 90;
      if (t === utc(2026, 10, 27, 12, 0) + 2 * 3600) h = 120; // 14:00: także w sesji
      if (t === utc(2026, 10, 27, 13, 10)) h = 130; // przed sesją: nie wchodzi do boxa
      if (t === utc(2026, 10, 27, 20, 10)) h = 125; // po sesji: sweep high
      c.push(bar(t, h, l));
    }
    const w = S.sessionWindows(c[0][0], c[c.length - 1][0] + 1, [{ id: 'ny', from: '09:30', to: '16:00' }]);
    const m = S.overlayLevels(c, { windows: w, sweep: true });
    assert.equal(m.boxes.length, 1);
    const b = m.boxes[0], idx = (t) => c.findIndex((x) => x[0] === t);
    assert.deepEqual([b.a, b.b, b.hi, b.lo], [idx(utc(2026, 10, 27, 13, 30)), idx(utc(2026, 10, 27, 19, 59)), 120, 90], 'box: 13:30-19:59, high 120 (14:00), low 90; 13:10 poza sesją');
    const H = m.lines.find((l) => l.side === 'hi'), L = m.lines.find((l) => l.side === 'lo');
    assert.equal(H.x0, b.b + 0.5, 'linia wychodzi z prawej krawędzi boxa');
    assert.ok(H.swept && H.x1 === idx(utc(2026, 10, 27, 20, 10)), `H kończy się na świecy sweepu (${H.x1})`);
    assert.ok(!L.swept && L.x1 === c.length - 0.5, 'L nieprzebite: do prawej krawędzi danych');
    const off = S.overlayLevels(c, { windows: w, sweep: false });
    assert.ok(off.lines.every((l) => !l.swept && l.x1 === c.length - 0.5), 'kończ na sweepie wył.: linie do krawędzi danych');
    // PDH/PDL: od początku sesji, koniec na sweepie albo na końcu tej sesji
    const pd = S.overlayLevels(c, { pd: [{ a: 20, b: 200, hi: 115, lo: 50, day: 1 }], sweep: true }); // od 13:20 (13:10 z high 130 przed początkiem)
    const ph = pd.lines.find((l) => l.side === 'hi'), pl = pd.lines.find((l) => l.side === 'lo');
    assert.equal(ph.x0, 19.5);
    assert.ok(ph.swept && ph.x1 === idx(utc(2026, 10, 27, 14)), `PDH przebite o 14:00 (${ph.x1})`);
    assert.ok(!pl.swept && pl.x1 === 200.5, 'PDL nieprzebite: do końca sesji');
    const pd2 = S.overlayLevels(c, { pd: [{ a: 11, b: 30, hi: 124, lo: 50, day: 1 }] }); // 20:10 (high 125) jest po końcu tej sesji
    assert.ok(!pd2.lines[0].swept && pd2.lines[0].x1 === 30.5, 'sweep po końcu sesji PDH/PDL się nie liczy');
    assert.deepEqual(S.overlayLevels([], { windows: w }), { boxes: [], lines: [] });
  });

  test('wykresy-17: P32-2 sesje przez północ i DST: Azja 20:00-00:00 ET jako jeden box przez północ UTC/ET, tydzień rozjazdu zmian czasu USA/Europa, weekend bez boxów', async () => {
    const S = await lib('public/js/swiece.js');
    const mk = (t0, n) => Array.from({ length: n }, (_, k) => bar(t0 + k * 60, 101 + Math.sin(k), 99 - Math.cos(k)));
    // zima (EST): Azja z 15.01 = 16.01 01:00-05:00 UTC; świece 16.01 00:00-06:00 UTC
    const win = mk(utc(2026, 1, 16, 0), 360), asia = (cs) => S.overlayLevels(cs, { windows: S.sessionWindows(cs[0][0], cs[cs.length - 1][0] + 1, [{ id: 'asia', from: '20:00', to: '00:00' }]) }).boxes;
    assert.deepEqual(asia(win).map((b) => [win[b.a][0], win[b.b][0]]), [[utc(2026, 1, 16, 1), utc(2026, 1, 16, 4, 59)]]);
    // lato (EDT): ta sama sesja 00:00-04:00 UTC (przez północ UTC)
    const sum = mk(utc(2026, 7, 15, 22), 420);
    assert.deepEqual(asia(sum).map((b) => [sum[b.a][0], sum[b.b][0]]), [[utc(2026, 7, 16, 0), utc(2026, 7, 16, 3, 59)]]);
    // USA już na czasie letnim (9.03.2026), Europa jeszcze nie: NY 09:30 ET = 13:30 UTC, Londyn 02:00 ET = 06:00 UTC (07:00 w Londynie, P32: godziny w czasie NY)
    const m = mk(utc(2026, 3, 10, 5), 600);
    const w = S.sessionWindows(m[0][0], m[m.length - 1][0] + 1, [{ id: 'london', from: '02:00', to: '05:00' }, { id: 'ny', from: '09:30', to: '16:00' }]);
    const bx = S.overlayLevels(m, { windows: w }).boxes;
    assert.deepEqual(bx.map((b) => [b.id, m[b.a][0]]), [['london', utc(2026, 3, 10, 6)], ['ny', utc(2026, 3, 10, 13, 30)]]);
    // weekend: okna istnieją, ale bez świec nie ma boxów ani linii
    assert.deepEqual(S.overlayLevels([bar(utc(2026, 10, 24, 12), 1, 0)], { windows: S.sessionWindows(utc(2026, 10, 24), utc(2026, 10, 25)) }), { boxes: [], lines: [] });
  });

  test('wykresy-17: P32-2 ustawienia nakładek: domyślne z tokenów, ochrona przed złymi danymi, stary zapis { sessions, pdhl } czytany dalej, definicje tylko włączonych sesji', async () => {
    const P = await lib('public/js/podglad.js');
    const d = P.overlayDefaults();
    assert.deepEqual([d.sessions, d.pdhl, d.sess.asia.from, d.sess.asia.to, d.sess.london.from, d.sess.ny.to, d.sess.ny.color, d.pdColor, d.boxWidth, d.sweep, d.labels, d.lines], [false, false, '20:00', '00:00', '02:00', '16:00', '', '', 1, true, true, true]);
    const n = P.normOverlays({ sessions: true, sess: { asia: { from: '25:00', to: '01:00', color: 'red', opacity: 13 }, london: { from: '03:00', to: '03:00', on: false }, ny: { color: '#A1B2C3', opacity: 16 } }, boxWidth: 0, lineStyle: 'wavy', pdWidth: 3, x: 1 });
    assert.equal(n.sessions, true);
    assert.deepEqual(n.sess.asia, { on: true, from: '20:00', to: '01:00', color: '', opacity: 8 }, 'zła godzina, kolor i krycie wracają do domyślnych');
    assert.deepEqual([n.sess.london.from, n.sess.london.to, n.sess.london.on], ['02:00', '05:00', false], 'od = do: domyślne godziny');
    assert.deepEqual([n.sess.ny.color, n.sess.ny.opacity, n.boxWidth, n.lineStyle, n.pdWidth, 'x' in n], ['#a1b2c3', 16, 0, 'dashed', 3, false]);
    assert.deepEqual(P.sessionDefs(n).map((s) => s.id), ['asia', 'ny']);
    assert.deepEqual(P.normOverlays({ sessions: true, pdhl: false }).sess, P.overlayDefaults().sess, 'zapis z etapu 10');
    assert.deepEqual(P.SESSION_TOKENS, { asia: '--n-blue', london: '--n-orange', ny: '--n-purple', pd: '--fg-2' });
  });

  test('wykresy-17: P32-2 geometria nakładek (wspólna dla SVG i LWC): box od krawędzi pierwszej do ostatniej świecy, opisy, linie wyłączone, PDH/PDL zawsze', async () => {
    const P = await lib('public/js/podglad.js');
    const sc = { x: (i) => 100 + i * 10, y: (p) => 1000 - p };
    const m = { boxes: [{ id: 'london', a: 2, b: 5, hi: 120, lo: 100 }], lines: [
      { kind: 'sess', id: 'london', side: 'hi', price: 120, x0: 5.5, x1: 12, swept: true },
      { kind: 'sess', id: 'london', side: 'lo', price: 100, x0: 5.5, x1: 19.5, swept: false },
      { kind: 'pd', id: 'pd', side: 'hi', price: 130, x0: -0.5, x1: 10, swept: true }] };
    const p = P.normOverlays({ sessions: true, pdhl: true, sess: { london: { color: '#112233', opacity: 12 } } });
    const g = P.overlayGeometry(m, sc, p, { left: 100, right: 400 });
    assert.deepEqual(g.rects, [{ id: 'london', x: 115, y: 880, w: 40, h: 20, opacity: 0.12, width: 1, color: '#112233' }]);
    assert.deepEqual(g.lines.map((l) => [l.x1, l.x2, l.y, l.label, l.dash, l.color]), [[155, 220, 880, 'Londyn H', 'dashed', '#112233'], [155, 295, 900, 'Londyn L', 'dashed', '#112233'], [95, 200, 870, 'PDH', 'solid', '']]);
    assert.deepEqual([g.lines[0].lx, g.lines[0].ly, g.lines[1].ly], [159, 876, 912], 'opis H nad linią, L pod nią');
    const q = P.overlayGeometry(m, sc, { ...p, lines: false, labels: false }, { left: 100, right: 400 });
    assert.deepEqual(q.lines.map((l) => [l.kind, l.label]), [['pd', '']], 'bez linii sesji zostają PDH/PDL; bez opisów');
    assert.equal(P.levelLabel({ kind: 'sess', id: 'ny', side: 'lo' }), 'NY L');
  });

  test('wykresy-17: P32-4 strefy rosnąco po przesunięciu UTC, popularne wplecione (pełna godzina przed miastem o tym samym przesunięciu)', async () => {
    const P = await lib('public/js/podglad.js');
    const jan = Date.UTC(2026, 0, 15) / 1000, jul = Date.UTC(2026, 6, 15) / 1000;
    for (const sec of [jan, jul]) {
      const z = P.sortedZones(sec);
      const off = (x) => (x === 'UTC' ? 0 : P.etcHours(x) != null ? P.etcHours(x) * 3600 : P.tzOffset(x, sec));
      assert.ok(z.every((x, k) => k === 0 || off(x) >= off(z[k - 1])), z.join(','));
      assert.equal(z[0], 'Etc/GMT+12'); assert.equal(z[z.length - 1], 'Etc/GMT-14');
    }
    const zj = P.sortedZones(jan), zl = P.sortedZones(jul);
    assert.equal(zj[zj.indexOf('Europe/Warsaw') - 1], 'Etc/GMT-1', 'styczeń: Warszawa przy UTC+1');
    assert.equal(zl[zl.indexOf('Europe/Warsaw') - 1], 'Etc/GMT-2', 'lipiec: Warszawa przy UTC+2');
    assert.ok(zl.indexOf('America/New_York') > zl.indexOf('Etc/GMT+4') && zl.indexOf('America/New_York') < zl.indexOf('Etc/GMT+3'), 'lipiec: Nowy Jork przy UTC−4');
    assert.equal(zj.indexOf('UTC'), zj.indexOf('Europe/London') - 1, 'UTC przed Londynem (zima)');
  });

  test('wykresy-17: P32-6 pole tekstu rysunku: miejsce jak tekst (także puste), trafienie z obrotem linii trendu, tylko rysunki z tekstem', async () => {
    const G = await lib('public/js/geometria.js');
    const candles = Array.from({ length: 50 }, (_, k) => [1000 + k * 60, 1, 1, 1, 1, 1]);
    const s = G.chartScales({ candles, xs: G.indexScale({ lastIndex: 49, right: 500, spacing: 10 }), ys: G.priceScaleFrom(100, 300, 110, 200), box: { left: 0, right: 500, top: 0, bottom: 400 }, step: 60 });
    const rect = { kind: 'rectangle', points: [{ time: 1000 + 10 * 60, price: 108 }, { time: 1000 + 20 * 60, price: 102 }], style: { fontSize: 12 } };
    const e = G.textSlot(rect, s);
    assert.ok(e.empty && e.text === '' && e.anchor === 'middle' && e.x === (s.x(10) + s.x(20)) / 2, JSON.stringify(e));
    const f = G.textSlot({ ...rect, text: 'OB', style: { fontSize: 12, text: 'OB' } }, s);
    assert.deepEqual([f.x, f.y, f.empty], [e.x, e.y, false], 'pusty i wypełniony w tym samym miejscu');
    assert.ok(G.hitTextSlot(f, 18, { x: f.x, y: f.y + 5 }));
    assert.ok(!G.hitTextSlot(f, 18, { x: f.x + 60, y: f.y + 5 }), 'poza polem (minimalna szerokość 48 px)');
    assert.ok(G.hitTextSlot(e, 0, { x: e.x + 20, y: e.y + 5 }), 'puste pole ma 48 px szerokości');
    const tl = { kind: 'trend-line', points: [{ time: 1000, price: 100 }, { time: 1000 + 40 * 60, price: 110 }], style: { fontSize: 14, text: 'BOS' } };
    const t = G.textSlot(tl, s);
    assert.ok(t.angle < 0, `tekst wzdłuż linii (kąt ${t.angle})`);
    assert.ok(G.hitTextSlot(t, 30, { x: t.ax, y: t.ay - 12 }), 'nad środkiem linii (tekst domyślnie nad linią)');
    assert.equal(G.textSlot({ kind: 'fib-retracement', points: rect.points, style: {} }, s), null);
    const tx = G.textSlot({ kind: 'text', points: [{ time: 1000 + 5 * 60, price: 105 }], text: 'A', style: { fontSize: 18 } }, s);
    assert.deepEqual([tx.x, tx.y, tx.anchor], [s.x(5) + 3, s.y(105) + 3, 'start'], 'tekst: od punktu w prawo i w dół o fontSize/6 (jak paczka)');
  });

  test('wykresy-17: P32-7 prostokąt ma grubość 0 (bez ramki), linie nie; podgląd rysuje stroke-width:0', async () => {
    const R = await lib('public/js/rysunki.js'), G = await lib('public/js/geometria.js');
    assert.deepEqual(R.RECT_WIDTHS, [0, 1, 2, 3, 4]);
    const candles = Array.from({ length: 30 }, (_, k) => [1000 + k * 60, 1, 1, 1, 1, 1]);
    const s = G.chartScales({ candles, xs: G.indexScale({ lastIndex: 29, right: 300, spacing: 10 }), ys: G.priceScaleFrom(100, 300, 110, 200), box: { left: 0, right: 300, top: 0, bottom: 400 }, step: 60 });
    const p = G.shapes({ kind: 'rectangle', points: [{ time: 1060, price: 108 }, { time: 1600, price: 102 }], style: { width: 0 } }, s).parts[0];
    assert.equal(p.width, 0);
  });

  // ---- przeglądarka ----
  let pageRun = null;
  async function pageResult() {
    pageRun ||= (async () => {
      const { findBrowser, dumpDom } = await import(pathToFileURL(path.join(ROOT, 'testy/przegladarka.mjs')).href);
      if (!findBrowser()) return null;
      const S = await H.server(++port, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: H.tmp() });
      try {
        const dom = await dumpDom(`${S.base}/__testy/nakladki-p32.html`, { width: 1200, height: 900 });
        const m = /<pre id="wynik">([\s\S]*?)<\/pre>/.exec(dom);
        assert.ok(m, 'strona zwróciła wynik');
        return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
      } finally { S.stop(); }
    })();
    return pageRun;
  }
  async function tagged(tag, min) {
    const res = await pageResult();
    if (!res) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }
  test('wykresy-17: P32-1 przeglądarka: podgląd z wyłączonym Auto przesuwa się w pionie od pierwszego przeciągnięcia, jedno kliknięcie włącza Auto; edytor bierze zakres z podglądu', () => tagged('P32-1', 6));
  test('wykresy-17: P32-2 przeglądarka: box i linie zgodne z LWC (±1 px), podgląd SVG z tokenami i opisami, popover ustawień zapisuje i przerysowuje', () => tagged('P32-2', 20));
  test('wykresy-17: P32-3 przeglądarka: panel przypięty z X, zostaje z ostatnim rysunkiem, wraca po zębatce, znika po usunięciu rysunku', () => tagged('P32-3', 10));
  test('wykresy-17: P32-4 przeglądarka: strefy rosnąco w Ustawieniach i na wykresie', () => tagged('P32-4', 4));
  test('wykresy-17: P32-5 przeglądarka: pole edycji tekstu bez ramki i tła, tym samym krojem i rozmiarem w miejscu tekstu, tekst na żywo na wykresie', () => tagged('P32-5', 6));
  test('wykresy-17: P32-6 przeglądarka: dwuklik w miejscu tekstu (także pustym) zaczyna edycję, Enter i klik obok zatwierdzają, Esc anuluje', () => tagged('P32-6', 9));
  test('wykresy-17: P32-7 przeglądarka: prostokąt z grubością 0 bez ramki dalej się zaznacza; linia bez opcji 0', () => tagged('P32-7', 4));
};
