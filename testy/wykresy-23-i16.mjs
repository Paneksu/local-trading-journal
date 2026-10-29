// wykresy-16 (pakiet I, etap 16): krzywa kapitału na kartach okresu (dzień, tydzień, miesiąc, rok). Dane użytkownika, nie CME (nie zależy od P15).
// curve: [{ t, date, v: { R, $, % } }] po trade'ach Live okresu w kolejności czasu, punkt startowy 0; etykiety: wartość końcowa, szczyt i 0.
// Przełącznik „Krzywa kapitału” w oknie Udostępnij (wartość początkowa z settings.chart.equity), kontrolka w Ustawieniach → Wykresy (grupa Karty).
// Piksele: karta z wyłączoną krzywą = karta jak w 1.2.2 (strona testy/karty-i.html w przeglądarce headless; skróty sprzed zmiany w raporcie pakietu I).
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
  const near = (a, b, msg) => assert.ok(a != null && b != null && Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`);
  const A = 'aaaaaaaa-0000-4000-8000-000000000001', C = 'cccccccc-0000-4000-8000-000000000003';
  async function fixture() {
    const S = await lib('public/js/stats.js');
    const konta = S.normalizeKonta([{ _id: A, name: 'A 50k', size: 50000 }, { _id: C, name: 'C 100k', size: 100000 }]);
    let i = 0;
    // _created rośnie z i: kolejność czasu w obrębie dnia bez godzin wynika z daty utworzenia (sortChrono)
    const row = (date, r, pnl, o = {}) => ({ _id: `t${++i}`, _created: `${date}T12:${String(i).padStart(2, '0')}:00.000Z`, title: '', typ: { name: o.typ || 'Live' }, date, r, pnl, konta: o.konta || [A], dir: { name: 'Long' }, instrument: { name: 'NQ' } });
    // tydzień 19-25.10.2026; wiersze celowo NIE w kolejności czasu
    const rows = [
      row('2026-10-21', -0.5, -125), row('2026-10-19', 1, 250), row('2026-10-20', 2, 500),
      row('2026-10-21', 3, 1000, { konta: [C] }),
      row('2026-10-22', 4, 2000, { typ: 'Backtest', konta: [] }), // nie Live: poza krzywą
      row('2026-10-23', -1, -250),
    ];
    return { S, konta, trades: S.normalizeTrades(rows) };
  }

  test('wykresy-16: curve tylko z Live, w kolejności czasu, w R/$/% (zgodnie z valuesOf/pctOf), punkt startowy 0, koniec = wynik karty', async () => {
    const U = await lib('public/js/udostepnij-dane.js');
    const { konta, trades } = await fixture();
    const w = U.weekCard(trades, konta, '2026-10-21', 'R');
    assert.ok(Array.isArray(w.curve), 'karta tygodnia ma curve');
    assert.equal(w.curve.length, 1 + 5, 'start + 5 trade\'ów Live (Backtest odpada)');
    assert.equal(w.curve[0].start, true);
    assert.deepEqual(w.curve[0].v, { R: 0, $: 0, '%': 0 });
    assert.deepEqual(w.curve.slice(1).map((p) => p.date), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-21', '2026-10-23'], 'kolejność czasu');
    assert.deepEqual(w.curve.map((p) => p.v.R), [0, 1, 3, 2.5, 5.5, 4.5]);
    assert.deepEqual(w.curve.map((p) => p.v.$), [0, 250, 750, 625, 1625, 1375]);
    // % konta: P&L narastająco / suma rozmiarów kont okresu (A 50k + C 100k), więc koniec = pctOf okresu
    near(w.curve.at(-1).v['%'], (1375 / 150000) * 100, '% na końcu');
    near(w.curve.at(-1).v['%'], w.v['%'], 'koniec = wynik karty (%)');
    near(w.curve.at(-1).v.R, w.v.R, 'koniec = wynik karty (R)');
    assert.equal(w.curve.at(-1).v.$, w.v.$);
    near(w.curve[1].v['%'], (250 / 150000) * 100, '% pierwszego punktu');
    // dzień, miesiąc, rok też mają krzywą
    const d = U.dayCard(trades, konta, '2026-10-21', 'R');
    assert.deepEqual(d.curve.map((p) => p.v.R), [0, -0.5, 2.5]);
    assert.equal(U.monthCard(trades, konta, 2026, 10, 'R').curve.length, 6);
    assert.equal(U.yearCard(trades, konta, 2026, '$').curve.at(-1).v.$, 1375);
  });

  test('wykresy-16: okres bez trade\'ów: brak curve (karta jak dziś); jednostka bez wartości: null w każdym punkcie; % bez rozmiaru konta: null', async () => {
    const U = await lib('public/js/udostepnij-dane.js');
    const { S, konta, trades } = await fixture();
    const e = U.weekCard(trades, konta, '2026-11-04', 'R');
    assert.equal(e.n, 0); assert.equal(e.curve, undefined, 'pusty okres bez curve');
    assert.equal(U.dayCard(trades, konta, '2026-10-24', 'R').curve, undefined);
    // trade'y bez P&L: $ i % null w całej krzywej, R liczone
    const t2 = S.normalizeTrades([{ _id: 'x1', _created: '2026-10-19T10:00:00.000Z', typ: { name: 'Live' }, date: '2026-10-19', r: 1, pnl: null, konta: [A], dir: { name: 'Long' }, instrument: { name: 'ES' } }]);
    const c2 = U.weekCard(t2, konta, '2026-10-19', 'R').curve;
    assert.deepEqual(c2.map((p) => p.v.R), [0, 1]); assert.deepEqual(c2.map((p) => p.v.$), [null, null]); assert.deepEqual(c2.map((p) => p.v['%']), [null, null]);
    // konto bez rozmiaru: % null (jak pctOf), $ liczone
    const k2 = S.normalizeKonta([{ _id: A, name: 'A', size: null }]);
    const t3 = S.normalizeTrades([{ _id: 'x2', _created: '2026-10-19T10:00:00.000Z', typ: { name: 'Live' }, date: '2026-10-19', r: 1, pnl: 100, konta: [A], dir: { name: 'Long' }, instrument: { name: 'ES' } }]);
    const c3 = U.weekCard(t3, k2, '2026-10-19', '$').curve;
    assert.deepEqual(c3.map((p) => p.v.$), [0, 100]); assert.deepEqual(c3.map((p) => p.v['%']), [null, null]);
  });

  test('wykresy-16: model krzywej: wartości, koniec, szczyt, zakres, daty, kolor wg wyniku; bez wartości: null (v2, P47: bez etykiet wartości na krzywej)', async () => {
    const R = await lib('public/js/udostepnij-render.js');
    const U = await lib('public/js/udostepnij-dane.js');
    const { konta, trades } = await fixture();
    const w = U.weekCard(trades, konta, '2026-10-21', 'R');
    const m = R.curveModel(w.curve, 'R');
    assert.deepEqual(m.values, [0, 1, 3, 2.5, 5.5, 4.5]);
    assert.equal(m.end, 4.5); assert.equal(m.peak, 5.5); assert.equal(m.min, 0); assert.equal(m.max, 5.5);
    assert.equal(m.labels, undefined, 'v2 (P47, clean look): krzywa bez etykiet wartości');
    assert.equal(m.from, '2026-10-19'); assert.equal(m.to, '2026-10-23');
    assert.equal(m.sign, 'win');
    // koniec = szczyt: bez etykiety szczytu
    const up = R.curveModel([{ v: { R: 0 }, date: '2026-10-19' }, { v: { R: 1 }, date: '2026-10-19' }, { v: { R: 2 }, date: '2026-10-20' }], 'R');
    assert.equal(up.peak, up.end);
    // strata: kolor straty, szczyt 0,5 nad końcem
    const dn = R.curveModel([{ v: { R: 0 }, date: 'a' }, { v: { R: 0.5 }, date: 'a' }, { v: { R: -2 }, date: 'b' }], 'R');
    assert.equal(dn.sign, 'loss'); assert.equal(dn.peak, 0.5);
    // jednostka bez wartości albo brak krzywej: null
    assert.equal(R.curveModel(w.curve.map((p) => ({ ...p, v: { ...p.v, $: null } })), '$'), null);
    assert.equal(R.curveModel(undefined, 'R'), null); assert.equal(R.curveModel([], 'R'), null);
  });

  test('wykresy-16: przełącznik „Krzywa kapitału” w oknie Udostępnij (wartość początkowa z settings.chart.equity, chwilowo) i kontrolka w Ustawieniach → Wykresy; tłumaczenia EN', async () => {
    const en = JSON.parse(src('public/i18n/en.json'));
    for (const k of ['Krzywa kapitału', 'Krzywa kapitału na kartach okresu', 'Karty udostępniania', 'Przywróć domyślne (Karty)']) assert.ok(k in en, `brak EN: ${k}`);
    const u = src('public/js/udostepnij.js');
    assert.match(u, /data-sh="equity"|seg\(t\('Krzywa kapitału'\)|segBtns\('equity'/, 'przełącznik w oknie');
    assert.match(u, /chartSettings\(\)\.equity/, 'wartość początkowa z settings.chart');
    assert.match(u, /equity: [^,]*st\.equity/, 'renderCard dostaje stan przełącznika');
    const s = src('public/js/ustawienia.js');
    assert.match(s, /chk\('equity'/, 'kontrolka equity w Ustawieniach');
    assert.match(s, /data-v="cards"/, '„Przywróć domyślne” grupy Karty');
    const C = await lib('public/js/styl-wykresu.js');
    assert.equal(C.chartDefaults().equity, true, 'domyślnie włączona');
  });

  test('wykresy-16: piksele w przeglądarce headless: krzywa wyłączona = karta bez krzywej (jak 1.2.2), włączona rysuje linię we wszystkich formatach i motywach', async () => {
    const { findBrowser, dumpDom } = await import(pathToFileURL(path.join(ROOT, 'testy/przegladarka.mjs')).href);
    if (!findBrowser()) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    const S = await H.server(4931, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: H.tmp() });
    try {
      const dom = await dumpDom(`${S.base}/__testy/karty-i.html?part=16`);
      const m = /<pre id="wynik">([\s\S]*?)<\/pre>/.exec(dom);
      assert.ok(m, 'strona zwróciła wynik');
      assert.match(m[1], /^PASS/, m[1].slice(0, 2000));
    } finally { S.stop(); }
  });
};
