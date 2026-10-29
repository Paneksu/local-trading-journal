// wykresy-14: P29 (28.10.2026), poprawki użytkownika do wykresów. Słowa użytkownika:
// 1) «z ostatnich trade usunmy te miniaturki wykresow, a na liscie tradow na srodku zostawiamy ale poprawmy, niech miniatury pokazuja tylko szerokosc wykresu taka
//    jaka byla dlugosc trade oraz deliaktnie rozszczweszyc o 2-3 swieczki w lewo i prawo, idealnym przykladem [...] jest trade 26 paź 14:50 ES break even (test D)»;
// 2) «utc nie mialoby by wszystkich, mialy byc najpopularniejsze ale kazde utc zeby dalo sie wybrac przynajmniej kazda godzine, aktualna lista jest za duza»;
// 3) «nie da sie przesunac myszka poziomu be a powinno sie dac i to tak samo automatycznie zapisuje jego miejsce»;
// 4) ustawienia rysunku: zębatka → przesuwalne okienko albo panel przypięty z lewej (bez zmiany rozmiaru wykresu) + przełącznik ogólny;
// 5) «ustawienia boxa, nie ma przelacznika widocznosci polowy boxa, powinno byc»; 6) i 7) lightbox: wykres domyślnie, schowanie szczegółów, strzałki w górnej linii
// (te dwa w pełnej aplikacji: testy/wykresy-e2e-p29.mjs). Testy na zachowaniu: funkcje czyste w Node, edytor i Ustawienia w przeglądarce (testy/rysunki-p29.html).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  let port = 4950;
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');

  test('wykresy-14: P29-1 kadr miniatury = świece trade\'a + 3 z każdej strony; interwał, przy którym trade ma najwyżej 16 świec (wzór: 13 min na 1m)', async () => {
    const P = await lib('public/js/podglad.js');
    const e = Date.UTC(2026, 9, 26, 13, 50) / 1000; // 26.10 14:50 Warszawa, trade 13 minut (wzór użytkownika)
    const a = P.miniPlan(e, e + 13 * 60);
    assert.equal(a.tf, '1m');
    assert.equal(a.from, e - 3 * 60, '3 świece przed wejściem');
    assert.equal(a.to, e + 13 * 60 + 4 * 60, '3 świece po świecy wyjścia (koniec zakresu bez niej)');
    assert.equal((a.to - a.from) / 60, 20, '14 świec trade\'a + 6');
    const b = P.miniPlan(e, e + 2 * 3600); // 2 h: 1m dałoby 121 świec, 10m 13
    assert.equal(b.tf, '10m');
    assert.equal(b.from, Math.floor(e / 600) * 600 - 1800);
    const n = (b.to - b.from) / 600;
    assert.ok(n >= 17 && n <= 20, `2 h na 10m: ${n} świec`);
    const c = P.miniPlan(e, e + 5 * 86400);
    assert.ok(['4h', '1D'].includes(c.tf), c.tf);
    const open = P.miniPlan(e, null);
    assert.deepEqual(open, { tf: '1m', from: e - 180, to: e + 12 * 60 + 240 }, 'bez wyjścia: 1m, 3 przed wejściem, 12 po nim');
    for (const span of [60, 600, 1800, 3600 * 3, 86400]) {
      const p = P.miniPlan(e, e + span), s = P.tfSec(p.tf);
      assert.ok(Math.floor((e + span) / s) - Math.floor(e / s) + 1 <= 16, `trade ${span} s: najwyżej 16 świec na ${p.tf}`);
    }
  });

  test('wykresy-14: P29-1 miniatura woła serwer interwałem z planu (bez tf=auto), panel „Ostatnie trade\'y” bez miniatur, tabela je ma', async () => {
    const pod = src('public/js/podglad.js');
    const mini = pod.slice(pod.indexOf('// ---- miniatury'), pod.indexOf('// ---- koniec miniatur'));
    assert.match(mini, /tf: a\.tf/);
    assert.doesNotMatch(mini, /tf: 'auto'/);
    const app = src('public/js/app.js');
    const recent = app.slice(app.indexOf("data-src=\"recent\""), app.indexOf("sideSection('recent'"));
    assert.ok(recent.length > 50, 'kod panelu znaleziony');
    assert.doesNotMatch(recent, /miniCell\(/, 'panel bez miniatur');
    assert.match(app, /<td class="mc">\$\{miniCell\(t\)\}<\/td>/, 'tabela trade\'ów z miniaturą');
    // serwer odpowiada na zakres z planu wybranym interwałem: 13-minutowy trade = 20 świec 1m (zero sieci, jak dotąd)
    const dir = H.tmp();
    const A = await H.atrapaDb(++port);
    const S = await H.server(++port, { THQ_CONFIG_DIR: dir, DATABENTO_API_BASE: A.base, DATABENTO_API_KEY: 'db-test-key-0123456789abcdef' });
    try {
      const P = await lib('public/js/podglad.js'), C = await lib('lib/candles-store.mjs');
      const D26 = Date.UTC(2026, 9, 26, 15) / 1000;
      C.writeRange('ES', '1m', D26, D26 + 36000, Array.from({ length: 600 }, (_, i) => [D26 + i * 60, 502500, 502650, 502450, 502575, 3]), { rolls: [] }, { baseDir: path.join(dir, 'chart-data') });
      const p = P.miniPlan(D26 + 50 * 60, D26 + 63 * 60);
      const r = await fetch(`${S.base}/api/candles?${new URLSearchParams({ instrument: 'ES', from: String(p.from), to: String(p.to), tf: p.tf })}`);
      const j = await r.json();
      assert.equal(r.status, 200);
      assert.equal(j.tf, '1m'); assert.equal(j.bars.length, 20, `świece miniatury (${j.bars.length})`);
      assert.equal(j.bars[0][0], D26 + 47 * 60, 'pierwsza świeca 3 minuty przed wejściem');
      assert.deepEqual((await A.log()).log, [], 'zero żądań do Databento');
    } finally { S.stop(); A.stop(); }
  });

  test('wykresy-14: P29-2 strefy: popularne + każda pełna godzina UTC−12…UTC+14, opisy ze znakiem UTC, lista wykresu krótka', async () => {
    const Z = await lib('public/js/podglad.js');
    const all = Z.allZones();
    assert.ok(all.length >= 30 && all.length <= 45, `krótka lista (${all.length})`);
    for (const z of ['UTC', 'Europe/Warsaw', 'Europe/London', 'America/New_York', 'America/Chicago', 'Asia/Tokyo', 'Australia/Sydney', 'Asia/Hong_Kong', 'Asia/Dubai']) assert.ok(all.includes(z), z);
    const offs = new Set(all.map((z) => (z === 'UTC' ? 0 : Z.etcHours(z))).filter((x) => x != null));
    for (let h = -12; h <= 14; h++) assert.ok(offs.has(h), `pełna godzina UTC${h >= 0 ? '+' : ''}${h}`);
    assert.equal(Z.tzLabel('Etc/GMT-14'), 'UTC+14');
    assert.equal(Z.tzLabel('Etc/GMT+5'), 'UTC−5', 'Etc/GMT+5 to UTC−5 (POSIX ma odwrócony znak)');
    assert.equal(Z.tzOptionLabel('Etc/GMT-3'), 'UTC+3');
    // przesunięcie Etc zgadza się z opisem
    assert.equal(Z.tzOffset('Etc/GMT-14', Date.UTC(2026, 0, 1) / 1000), 14 * 3600);
    const html = Z.tzSelectHtml(Date.UTC(2026, 6, 1) / 1000);
    const n = (html.match(/<option /g) || []).length;
    assert.ok(n === all.length + 1, `wykres: „Z Ustawień” + ${all.length} (${n})`);
    assert.doesNotMatch(html, /<optgroup/, 'P32: jedna lista posortowana po przesunięciu UTC (wykresy-17-p32)');
    // zapisana strefa spoza listy: na wykresie w pozycji „Z Ustawień”
    Z.setChartTzDefault('Asia/Kolkata');
    assert.match(Z.tzSelectHtml(Date.UTC(2026, 6, 1) / 1000), /Z Ustawień: Kolkata UTC\+5:30/);
    Z.setChartTzDefault('');
  });

  test('wykresy-14: P29-4 tryb ustawień rysunku: domyślnie komputer = panel przypięty, telefon = okienko; zapis w localStorage (try/catch)', async () => {
    const P = await lib('public/js/podglad.js');
    const mem = {};
    const mm = (wide) => (q) => ({ matches: /max-width: 640px/.test(q) ? !wide : false });
    globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    try {
      globalThis.matchMedia = mm(true);
      assert.equal(P.loadStyleDock(), 'pin', 'komputer');
      globalThis.matchMedia = mm(false);
      assert.equal(P.loadStyleDock(), 'pop', 'telefon');
      P.saveStyleDock('pin');
      assert.equal(P.loadStyleDock(), 'pin', 'wybór użytkownika wygrywa z szerokością');
      globalThis.localStorage = { getItem: () => { throw new Error('zablokowane'); }, setItem: () => { throw new Error('zablokowane'); } };
      assert.equal(P.loadStyleDock(), 'pop', 'bez localStorage: domyślne');
      P.saveStyleDock('pin');
    } finally { delete globalThis.localStorage; delete globalThis.matchMedia; }
    const R = await lib('public/js/rysunki.js');
    assert.equal(R.toolKeyOf({ kind: 'rectangle', style: { rectMiddleLine: { visible: true }, fvg: false } }), 'rectangle', 'prostokąt z linią połowy to nie FVG');
    assert.equal(R.toolKeyOf({ kind: 'rectangle', style: { rectMiddleLine: { visible: true } } }), 'fvg', 'FVG sprzed P29 (bez flagi)');
    assert.equal(R.styleFor('rectangle', { be: '#00f', fg: '#fff' }, true).fvg, true);
  });

  // ---- edytor i Ustawienia w przeglądarce ----
  let pageRun = null;
  async function pageResult() {
    pageRun ||= (async () => {
      const { findBrowser, dumpDom } = await import(pathToFileURL(path.join(ROOT, 'testy/przegladarka.mjs')).href);
      if (!findBrowser()) return null;
      const S = await H.server(++port, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: H.tmp() });
      try {
        const dom = await dumpDom(`${S.base}/__testy/rysunki-p29.html`);
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
  test('wykresy-14: P29-2 Ustawienia: krótka lista stref, zapisana strefa spoza listy zostaje wybrana, przełącznik okienko / panel', () => tagged('P29-2', 3));
  test('wykresy-14: P29-3 BE przeciągany myszą: pozycja trade\'a po odblokowaniu (pole BE, zapis PATCH) i pozycja rysowana (zapis rysunków), zablokowana nie', () => tagged('P29-3', 7));
  test('wykresy-14: P29-4 zębatka przy rysunku → przesuwalne okienko (pamięta miejsce, znika po kliknięciu obok) albo panel przypięty z lewej bez zmiany rozmiaru wykresu', () => tagged('P29-4', 15));
  test('wykresy-14: P29-5 linia połowy: prostokąt (zostaje prostokątem), Gann box (poziom 0,5 ceny i czasu), FVG', () => tagged('P29-5', 5));
};
