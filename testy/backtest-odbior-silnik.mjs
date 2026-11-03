// backtest-odbior (silnik i porządki): odbiór 1.7.0, przegląd kodu (8,5).
// [U] 3.11.2026 «wywalamy to cofniecie czasu usuwa trade, zbedne, mam usuwanie juz manualne wiec jak bede chcial to usune» (pakiet 6 odwołany, decyzja sesji głównej 3.11.2026):
// `book.gone` i `order.hist` przestają być zapisywane (P2-1), stare pliki wczytują się dalej, a przy zapisie pola znikają. Plus P3: martwy kod, wspólne funkcje, ścieżki w skryptach zrzutów.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

export default ({ test, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
  const T = 1000;
  const bar = (t, o, h, l, c) => [t, o, h, l, c, 10];
  const S = (...bars) => ({ bars, len: bars.map(() => 60) });

  test('backtest-odbior: silnik nie zapisuje book.gone ani order.hist (anulowanie, wypełnienie, dokładka, modyfikacja, eod, przeciwne wejście)', async () => {
    const W = await imp('public/js/bt-wypelnienia.js');
    const lim = (price, extra = {}) => ({ instrument: 'NQ', side: 'buy', type: 'limit', price, qty: 1, sl: 90, ...extra });
    const clean = (b, what) => {
      assert.ok(!('gone' in b), `${what}: bez book.gone`);
      assert.ok(b.orders.every((o) => !('hist' in o)), `${what}: zlecenia bez hist`);
    };
    assert.ok(!('gone' in W.emptyBook()), 'pusta księga bez gone');
    let b = W.placeOrder(W.emptyBook(), lim(99.5), { t: T, price: 100 }).book;
    clean(b, 'złożenie');
    b = W.modifyOrder(b, b.orders[0].id, { price: 99.25, sl: 91 }, { t: T + 5, price: 100 }).book;
    clean(b, 'modyfikacja');
    assert.equal(b.orders[0].price, 99.25, 'modyfikacja działa');
    clean(W.cancelOrder(b, b.orders[0].id), 'anulowanie');
    assert.equal(W.cancelOrder(b, b.orders[0].id).orders.length, 0);
    // wypełnienie, dokładka (zamiana zlecenia w dokładkę), przeciwne wejście, eod
    let c = W.placeOrder(W.emptyBook(), lim(99), { t: T, price: 100 }).book;
    c = W.placeOrder(c, lim(98.5), { t: T, price: 100 }).book;
    const r = W.advance(c, 'NQ', S(bar(T, 100, 100.25, 98.75, 99.75)), T + 60);
    clean(r.book, 'wypełnienie');
    assert.ok(r.book.positions.NQ && r.book.orders.length === 1 && r.book.orders[0].intent === 'add', 'drugie zlecenie zostało dokładką');
    const sell = W.placeOrder(c, lim(101, { side: 'sell', sl: 110 }), { t: T, price: 100 }).book;
    clean(W.advance(sell, 'NQ', S(bar(T, 100, 100.25, 98.5, 99.75)), T + 60).book, 'filled-other');
    const e = W.placeOrder(W.emptyBook(), { instrument: 'ES', side: 'buy', type: 'limit', price: 4990, qty: 1, sl: 4980 }, { t: T, price: 5000 }).book;
    clean(W.closeAll(e, 'ES', { t: T + 9, price: 5000 }, 'eod').book, 'eod');
    // zlecenie oczekujące nadal niesie wszystko, co czytają bilet i wykres
    const o = b.orders[0];
    for (const k of ['id', 'instrument', 'side', 'type', 'price', 'qty', 'sl', 'tps', 'placedT', 'intent']) assert.ok(k in o, `zlecenie ma pole ${k}`);
  });

  test('backtest-odbior: plik sesji nie puchnie: 700 zleceń z drabiną, każde przesunięte 5 razy i anulowane, zostawia mały rozmiar (było 617 KB)', async () => {
    const W = await imp('public/js/bt-wypelnienia.js');
    let b = W.emptyBook();
    for (let i = 0; i < 700; i++) {
      const px = 90 + (i % 40) * 0.25;
      b = W.placeOrder(b, { instrument: 'NQ', side: 'buy', type: 'limit', price: px, qty: 3, sl: 80, tps: [{ id: 'tp1', price: 120, pct: 50 }, { id: 'tp2', price: 130, pct: 50 }], tp: 130 }, { t: T + i, price: 100 }).book;
      const id = b.orders.at(-1).id;
      for (let k = 1; k <= 5; k++) b = W.modifyOrder(b, id, { price: px - k * 0.25, sl: 80 - k }, { t: T + i, price: 100 }).book;
      b = W.cancelOrder(b, id);
    }
    const bytes = JSON.stringify(b).length;
    assert.ok(!('gone' in b) && b.orders.length === 0);
    assert.ok(bytes < 2000, `księga po 700 anulowanych zleceniach ma ${bytes} B (limit 2000)`);
    // otwarte zlecenia: bez hist, rozmiar proporcjonalny do liczby zleceń, nie do liczby modyfikacji
    let o = W.emptyBook();
    o = W.placeOrder(o, { instrument: 'NQ', side: 'buy', type: 'limit', price: 90, qty: 1, sl: 80 }, { t: T, price: 100 }).book;
    const id = o.orders[0].id, s0 = JSON.stringify(o).length;
    for (let k = 1; k <= 200; k++) o = W.modifyOrder(o, id, { price: 90 - (k % 20) * 0.25, sl: 80 }, { t: T + k, price: 100 }).book;
    assert.ok(JSON.stringify(o).length - s0 < 40, `200 modyfikacji nie powiększa zlecenia (${JSON.stringify(o).length - s0} B)`);
  });

  test('backtest-odbior: migrateBook czyta stary plik z gone i hist (tolerancja) i usuwa te pola; idempotentna; trade\'ów i logu pozycji nie rusza', async () => {
    const K = await imp('public/js/bt-ksiega.js');
    const old = {
      v: 3, hw: 5, hwi: {}, seq: 3,
      gone: [{ order: { id: 'o1', hist: [{ at: 1 }] }, at: 5, why: 'cancelled' }, { order: { id: 'o2' }, at: 6, why: 'filled' }],
      orders: [{ id: 'o3', instrument: 'NQ', side: 'buy', type: 'limit', price: 99, qty: 1, sl: 90, tp: null, tps: [], placedT: 3, intent: 'open', hist: [{ at: 3, price: 99, sl: 90, tps: [] }, { at: 4, price: 98, sl: 90, tps: [] }] }],
      positions: { ES: null, MES: null, MNQ: null, NQ: { id: 'p1', instrument: 'NQ', dir: 'Long', fills: [{ t: 1, at: 1, price: 100, qty: 2, slRef: 90 }], exits: [], tps: [], log: [{ at: 1, k: 'sl', v: 90 }, { at: 2, k: 'be-auto', v: { price: 103, sl: 100 } }], sl: 90, sl0: 90, sl0T: 1 } },
    };
    const m = K.migrateBook(old);
    assert.ok(!('gone' in m), 'gone usunięte');
    assert.ok(m.orders.every((o) => !('hist' in o)), 'hist usunięte');
    assert.equal(m.orders.length, 1); assert.equal(m.orders[0].price, 99);
    assert.deepEqual(m.positions.NQ.log.map((l) => l.k), ['sl', 'be-auto'], 'log pozycji zostaje');
    assert.deepEqual(K.migrateBook(m), m, 'idempotentna');
    // stary plik bez pól dalej się czyta
    assert.ok(K.migrateBook({ v: 3, orders: [], positions: {} }).orders.length === 0);
  });

  test('backtest-odbior: zdarzenie wyjścia niesie kierunek pozycji (komunikat ręcznej części liczy kwotę bez zgadywania)', async () => {
    const W = await imp('public/js/bt-wypelnienia.js');
    for (const [side, dir] of [['buy', 'Long'], ['sell', 'Short']]) {
      let { book } = W.placeOrder(W.emptyBook(), { instrument: 'NQ', side, type: 'market', qty: 4, sl: side === 'buy' ? 90 : 110, tp: null }, { t: T, price: 100 });
      const r = W.closePartial(book, 'NQ', 1, { t: T + 60, price: 101 });
      const ex = r.events.find((e) => e.type === 'exit');
      assert.ok(ex, `${dir}: jest zdarzenie exit`);
      assert.equal(ex.dir, dir); assert.equal(ex.exit.reason, 'partial'); assert.equal(ex.exit.qty, 1); assert.ok(Number.isFinite(ex.exit.basis));
    }
  });

  test('backtest-odbior: derive liczy najdalszy TP funkcją farthestTp (Long i Short, trafione też), jeden zbiór pomocniczych isNum/objs', async () => {
    const K = await imp('public/js/bt-ksiega.js');
    const D = await imp('public/js/bt-drabinka.js');
    const mk = (dir, tps) => K.derive({ instrument: 'NQ', dir, fills: [{ t: 1, at: 1, price: 100, qty: 2, slRef: dir === 'Long' ? 90 : 110 }], exits: [], tps, log: [], sl: dir === 'Long' ? 90 : 110 });
    const L = [{ id: 'tp1', price: 105, pct: 50, hit: { at: 3, qty: 1 } }, { id: 'tp2', price: 112, pct: 50, hit: null }, { id: 'tp3', price: 108, pct: 0, hit: null }];
    assert.equal(mk('Long', L).tp, 112); assert.equal(mk('Long', L).tp, D.farthestTp('Long', L));
    const Sx = [{ id: 'tp1', price: 95, pct: 50, hit: null }, { id: 'tp2', price: 88, pct: 50, hit: null }];
    assert.equal(mk('Short', Sx).tp, 88); assert.equal(mk('Short', Sx).tp, D.farthestTp('Short', Sx));
    assert.equal(mk('Long', []).tp, null);
    assert.equal(D.isNum(3), true); assert.equal(D.isNum(NaN), false); assert.deepEqual(D.objs([1, { a: 1 }, null]), [{ a: 1 }]);
    // źródła: jedna definicja sgn i brak lokalnych kopii isNum/objs w bt-ksiega
    assert.ok(!/^const sgn = /m.test(src('public/js/bt-wypelnienia.js')) && !/^const sgn = /m.test(src('public/js/bt-konto.js')), 'sgn tylko w bt-ksiega.js');
    assert.ok(!/^const (isNum|objs) = /m.test(src('public/js/bt-ksiega.js')), 'isNum i objs z bt-drabinka.js');
  });

  test('backtest-odbior: martwy kod z pakietu 1 usunięty (.bt-tag-m, partUi.fixed, parametr labels, warunek half), nieaktualne komentarze poprawione', () => {
    assert.ok(!/\.bt-tag-m\b/.test(src('public/features.css')), 'reguły .bt-tag-m');
    const w = src('public/js/bt-wykres.js');
    assert.ok(!/partUi\.fixed/.test(w), 'partUi.fixed');
    assert.ok(!/\blabels = \{\}/.test(w), 'parametr labels');
    assert.ok(!/dka === 'half'/.test(src('public/js/bt-szuflada.js')), 'warunek half w szufladzie');
    assert.ok(!/BE = stop stojący na poziomie BE przy zamknięciu/.test(src('lib/backtest-sync.mjs')), 'komentarz o BE w backtest-sync');
    assert.ok(!/ważone ilością częściowych wyjść/.test(src('public/js/bt-wypelnienia.js')), 'komentarz o R z sl0');
    assert.ok(!/domyślnie wszystkie pięć/.test(src('testy/backtest-e2e.mjs')), 'komentarz o liczbie sekcji e2e');
    // decyzja z 31.10 bez udawanego cytatu
    for (const f of ['public/js/bt-wypelnienia.js', 'public/js/bt-zlecenia.js', 'public/js/bt-wykres.js']) {
      const s = src(f);
      assert.ok(!/decyzja użytkownika 31\.10\.2026, parafraza z planu/i.test(s) && !/Decyzja użytkownika 31\.10\.2026 \(parafraza z planu/.test(s), `${f}: bez „decyzja użytkownika … parafraza” udającej cytat`);
      assert.ok(/Decyzja z 31\.10\.2026 \(parafraza; dosłownych słów brak w dokumentach\)/.test(s), `${f}: uczciwy opis parafrazy`);
    }
    // pakiet 6 w komentarzach silnika
    assert.ok(!/pakiet 6/i.test(src('public/js/bt-wypelnienia.js')), 'bt-wypelnienia.js nie uzasadnia niczego pakietem 6');
  });

  test('backtest-odbior: skrypty zrzutów nie mają ścieżek R:/ (domyślnie względem repozytorium albo z parametru), katalog zrzuty-robocze poza gitem', () => {
    for (const n of ['171', '174', '175']) {
      const s = src(`testy/zrzuty-${n}.mjs`);
      assert.ok(!/R:\//.test(s), `zrzuty-${n}.mjs bez ścieżki R:/`);
      assert.ok(/process\.env\.ZRZUTY/.test(s) && /zrzuty-robocze/.test(s), `zrzuty-${n}.mjs: parametr, zmienna ZRZUTY albo katalog w repozytorium`);
    }
    assert.ok(/^zrzuty-robocze\/$/m.test(src('.gitignore')));
  });

  test('backtest-odbior: dokumenty planu: pakiet 6 odwołany (słowa użytkownika), opisy cofnięcia oznaczone jako nieaktualne, brak zjedzonych nazw w postępie', () => {
    const dir = 'docs/plany/backtest/1.7.0';
    const quote = '«wywalamy to cofniecie czasu usuwa trade, zbedne, mam usuwanie juz manualne wiec jak bede chcial to usune»';
    for (const f of ['00-przeglad.md', 'model-pozycji-1-7.md']) {
      const s = src(`${dir}/${f}`);
      assert.ok(s.includes(quote) && /3\.11\.2026/.test(s) && /PAKIET 6 ODWOŁANY/.test(s), `${f}: notka z cytatem i datą`);
    }
    const model = src(`${dir}/model-pozycji-1-7.md`);
    assert.ok(/## 7\. Cofnięcie \(pakiet 6\): ODWOŁANE, niezaimplementowane/.test(model), '§7 oznaczony');
    assert.ok(/NIEAKTUALNE \(pakiet 6 odwołany\)/.test(model), 'gone/hist oznaczone');
    assert.ok(/'beAt'\|'be-auto'/.test(model), 'LogEntry z beAt');
    assert.ok(!/tradeFills\(tr\)/.test(model), 'nieistniejąca funkcja tradeFills');
    assert.ok(/pod ceną progu nie mieści się sam poziom BE/.test(model), 'opis obcięcia zgodny z kodem');
    const przeglad = src(`${dir}/00-przeglad.md`);
    assert.ok(/ODWOŁANY \(3\.11\.2026/.test(przeglad), 'karta pakietu 6 oznaczona w tabeli');
    const postep = src('docs/plany/backtest/postep.md');
    assert.ok(!/Ślady:  \(/.test(postep) && /174-r3-czerwone\.txt/.test(postep), 'wpis rundy 3 pakietu 1.7-4 ma nazwy plików');
    assert.ok(!/linii pozycji \(\) liczy/.test(postep), 'nazwa funkcji etykiety');
  });

  test('backtest-odbior: r2: podpis strefy min. 11 px i bez łamania, „NY” przy godzinie w szczegółach, w panelu bocznym i w kartach newsów, komentarze w osobnym wierszu', async () => {
    const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
    assert.match(src('public/features.css'), /\.tz-tag \{[^}]*font-size: max\(11px/);
    assert.match(src('public/features.css'), /\.tz-tag \{[^}]*white-space: nowrap/);
    const app = src('public/js/app.js');
    assert.match(app, /x\.time \? ' · ' \+ x\.time \+ '\\u00a0' \+ tzShort\(\)/, 'szczegóły: godzina i NY połączone twardą spacją');
    assert.match(app, /const whenText = .*\\u00a0\$\{tzShort\(\)\}/, 'panel boczny: NY przy godzinie');
    // karta newsów: godziny z podpisem strefy aplikacji (zachowanie, nie tylko źródło)
    const NK = await imp('public/js/newsy-karty.js');
    const view = { banners: [], rows: [{ t: Date.UTC(2026, 9, 30, 12, 30) / 1000, imp: 'high', name: 'CPI', past: false, next: true, tags: [] }], empty: false };
    const ny = NK.newsCardHtml(view, { tz: 'America/New_York' });
    assert.match(ny, /<span class="tz-tag"[^>]*>NY<\/span>/, 'podpis NY w karcie');
    assert.ok(ny.includes('08:30'), 'godzina w NY (12:30 UTC = 08:30 EDT)');
    assert.match(NK.newsCardHtml(view, { tz: 'Europe/Warsaw' }), /<span class="tz-tag"[^>]*>UTC\+[12]<\/span>/, 'inna strefa: skrót z przesunięciem');
    // trzy wiersze zmienione w odbiorze mają komentarz w osobnym wierszu (zasada 5)
    assert.ok(!/out\.chartTz = o\.chartTz; \/\//.test(src('public/js/app.js')));
    assert.ok(!/withTz: true \}\); \/\//.test(src('public/js/bt-widok.js')));
    assert.ok(!/priceFormatter: fmtPrice \}, \/\/ P55/.test(src('public/js/wykres.js')));
  });

  test('backtest-odbior: r2: jedno źródło strefy w serwerze (writes.mjs i strefa-notion.mjs biorą validTz i domyślną strefę z public/js/strefa.js), cel poprawy stały', () => {
    assert.match(src('lib/writes.mjs'), /import \{ DEFAULT_TZ, validTz, dayKeyIn \} from '\.\.\/public\/js\/strefa\.js'/);
    assert.ok(!/new Intl\.DateTimeFormat\('en', \{ timeZone: tz \}\)/.test(src('lib/writes.mjs')), 'writes.mjs nie waliduje strefy po swojemu');
    assert.ok(!/todayLocalKey = \(\) => \{ const d = new Date/.test(src('lib/writes.mjs')), 'domyślna data zakupu to dzień w strefie aplikacji');
    const sn = src('lib/strefa-notion.mjs');
    assert.match(sn, /from '\.\.\/public\/js\/strefa\.js'/);
    assert.match(sn, /const OFFSET_END = \/\(\?:\[zZ\]\|\[\+-\]\\d\\d:\\d\\d\)\$\//, 'HAS_OFFSET zakotwiczone na końcu całej alternatywy');
  });
};
