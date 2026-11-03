// backtest-175 (silnik): pakiet 1.7-5 „Kilka TP z procentem wielkości (drabinka)” (docs/plany/backtest/1.7.0/etap-1-7-5-kilka-tp.md; model-pozycji-1-7.md §2.4, §4, §5).
// Testy czyste (Node): reguła ilości na poziom (udział w otwartej części, rozdzielany między nietrafione poziomy), kolejność w świecy (SL wygrywa, TP od najbliższego), TP nie w świecy
// wejścia ani dokładki, walidacja drabinki (kolejność, procenty, limit 4, strona ceny), przeciągnięcie zmienia numerację, usunięcie oddaje procent ostatniemu, auto-BE w świecy TP1,
// trade z drabinką w Notion (średnia cena wyjścia, wynik łączny, pole TP = ostatni cel), presety z drabinką i pamięć panelu. Dane syntetyczne, zero sieci.
// Każda asercja ma wartość policzoną na papierze (komentarz), żadnych OR-ów ani gałęzi „pominięte = zdane”.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const mod = () => imp('public/js/bt-wypelnienia.js');
  const T = 1000;
  const S = (...bars) => ({ bars, len: bars.map(() => 60) });
  const bar = (t, o, h, l, c) => [t, o, h, l, c, 10];
  const types = (ev) => ev.map((e) => e.type);
  const MK = (side, extra = {}) => ({ instrument: 'NQ', side, type: 'market', qty: 1, sl: null, tp: null, ...extra });
  const last = (t, price) => ({ t, price });
  const closedOf = (r) => r.events.find((e) => e.type === 'closed')?.position;
  const lv = (price, pct) => ({ price, pct });
  const rejected = (r) => r.events.filter((e) => e.type === 'rejected').map((e) => e.reason).join(',');

  // Long (albo Short) qty@100, SL 95 (Short: 105), drabinka tps
  const open = async (tps, { side = 'buy', qty = 10, sl = side === 'buy' ? 95 : 105, extra = {} } = {}) => {
    const W = await mod();
    const r = W.placeOrder(W.emptyBook(), MK(side, { qty, sl, tps, ...extra }), last(T, 100));
    assert.deepEqual(types(r.events), ['filled'], JSON.stringify(r.events));
    return { W, book: r.book };
  };
  // kolejne świece po 60 s od T; wynik po przetworzeniu wszystkich
  const run = (W, book, ...bars) => W.advance(book, 'NQ', S(...bars), T + 60 * bars.length);
  const exitsOf = (pos) => pos.exits.map((e) => [e.qty, e.price, e.reason, e.tpId ?? null]);
  const planQty = (W, pos) => W.tpPlan(pos).map((x) => x.qty);

  test('backtest-175: reguła ilości: 50/reszta, 33/33/34, po ręcznym wyjściu, po dokładce, 1 kontrakt, 2 kontrakty na 3 poziomy', async () => {
    // 10 kontraktów, TP1 50%, TP2 reszta: TP1 zamyka round(10·50/100) = 5, TP2 pozostałe 5
    let { W, book } = await open([lv(105, 50), lv(110, 50)]);
    const pl = W.tpPlan(book.positions.NQ);
    assert.deepEqual(pl.map((x) => [x.id, x.rank, x.price, x.pct, x.qty, x.last]), [['tp1', 1, 105, 50, 5, false], ['tp2', 2, 110, 50, 5, true]]);
    let r = run(W, book, bar(T, 100, 106, 99.5, 105.5));
    assert.equal(r.book.positions.NQ.openQty, 5, 'po TP1 zostało 5');
    assert.deepEqual(exitsOf(r.book.positions.NQ), [[5, 105, 'tp', 'tp1']]);
    r = run(W, book, bar(T, 100, 106, 99.5, 105.5), bar(T + 60, 105.5, 111, 105, 110.5));
    assert.deepEqual(exitsOf(closedOf(r)), [[5, 105, 'tp', 'tp1'], [5, 110, 'tp', 'tp2']]);
    // 10 kontraktów, 33/33/34: TP1 round(3,3) = 3, TP2 round(7·33/67 = 3,448) = 3, TP3 reszta 4
    ({ W, book } = await open([lv(105, 33), lv(110, 33), lv(115, 34)]));
    assert.deepEqual(planQty(W, book.positions.NQ), [3, 3, 4]);
    r = run(W, book, bar(T, 100, 106, 99.5, 105.5), bar(T + 60, 105.5, 111, 105, 110.5), bar(T + 120, 110.5, 116, 110, 115.5));
    assert.deepEqual(exitsOf(closedOf(r)), [[3, 105, 'tp', 'tp1'], [3, 110, 'tp', 'tp2'], [4, 115, 'tp', 'tp3']]);
    // ręczne wyjście 6 z 10 przed TP1 (zostaje 4): TP1 round(4·50/100) = 2, TP2 2
    ({ W, book } = await open([lv(105, 50), lv(110, 50)]));
    book = W.closePartial(book, 'NQ', 6, last(T, 100.5)).book;
    assert.deepEqual(planQty(W, book.positions.NQ), [2, 2]);
    r = run(W, book, bar(T, 100, 106, 99.5, 105.5), bar(T + 60, 105.5, 111, 105, 110.5));
    assert.deepEqual(exitsOf(closedOf(r)), [[6, 100.5, 'partial', null], [2, 105, 'tp', 'tp1'], [2, 110, 'tp', 'tp2']]);
    // dokładka do 15: TP1 round(7,5) = 8 (połówka w górę), TP2 7
    ({ W, book } = await open([lv(105, 50), lv(110, 50)]));
    book = W.placeOrder(book, MK('buy', { qty: 5 }), last(T, 100)).book;
    assert.equal(book.positions.NQ.openQty, 15);
    assert.deepEqual(planQty(W, book.positions.NQ), [8, 7]);
    r = run(W, book, bar(T, 100, 106, 99.5, 105.5), bar(T + 60, 105.5, 111, 105, 110.5));
    assert.deepEqual(exitsOf(closedOf(r)), [[8, 105, 'tp', 'tp1'], [7, 110, 'tp', 'tp2']]);
    // 1 kontrakt, dwa TP: TP1 zamyka 1 (całość), TP2 ma 0 kontraktów i nie działa
    ({ W, book } = await open([lv(105, 50), lv(110, 50)], { qty: 1 }));
    assert.deepEqual(W.tpPlan(book.positions.NQ).map((x) => [x.id, x.qty, x.last]), [['tp1', 1, false], ['tp2', 0, true]]);
    r = run(W, book, bar(T, 100, 106, 99.5, 105.5));
    const one = closedOf(r);
    assert.deepEqual(exitsOf(one), [[1, 105, 'tp', 'tp1']]);
    assert.equal(one.tps.find((x) => x.id === 'tp2').hit, null, 'TP2 nietrafiony');
    // 2 kontrakty, trzy poziomy 40/30/30: TP1 round(0,8) = 1, TP2 round(1·30/60 = 0,5) = 1 (połówka w górę), TP3 0; suma zawsze = ilość pozycji
    ({ W, book } = await open([lv(105, 40), lv(110, 30), lv(115, 30)], { qty: 2 }));
    const p3 = planQty(W, book.positions.NQ);
    assert.deepEqual(p3, [1, 1, 0]);
    assert.equal(p3.reduce((a, b) => a + b, 0), 2);
  });

  test('backtest-175: SL wygrywa z każdym TP w świecy; TP1 i TP2 w jednej świecy po kolei po swoich cenach', async () => {
    const { W, book } = await open([lv(105, 50), lv(110, 50)]);
    // niskie 94 ≤ SL 95 i wysokie 111 ≥ oba TP: SL zamyka całość po 95, żaden TP nie jest trafiony
    let r = run(W, book, bar(T, 100, 111, 94, 100));
    const sl = closedOf(r);
    assert.deepEqual(exitsOf(sl), [[10, 95, 'sl', null]]);
    assert.deepEqual(sl.tps.map((x) => x.hit), [null, null]);
    // wysokie 111, niskie 99 (nad SL): oba TP w tej samej świecy, od najbliższego, po swoich cenach; zdarzenia exit, exit, closed
    r = run(W, book, bar(T, 100, 111, 99, 110));
    assert.deepEqual(types(r.events), ['exit', 'exit', 'closed']);
    assert.deepEqual(exitsOf(closedOf(r)), [[5, 105, 'tp', 'tp1'], [5, 110, 'tp', 'tp2']]);
    // SL i TP1 w tej samej świecy, TP1 tylko: SL zamyka całość, TP1 nie
    r = run(W, book, bar(T, 100, 106, 94.5, 100));
    assert.deepEqual(exitsOf(closedOf(r)), [[10, 95, 'sl', null]]);
    // koniec świecy to chwila zdarzenia: hit.at = T + 60, drugi poziom w następnej świecy T + 120
    r = run(W, book, bar(T, 100, 106, 99.5, 105.5), bar(T + 60, 105.5, 111, 105, 110.5));
    assert.deepEqual(closedOf(r).tps.map((x) => x.hit), [{ at: T + 60, qty: 5 }, { at: T + 120, qty: 5 }]);
  });

  test('backtest-175: TP nie działa w świecy wejścia ani w świecy dokładki; od następnej świecy normalnie', async () => {
    const W = await mod();
    // limit kupna @100 z drabiną 101/102 (50/50): świeca wypełnienia ma wysokie 102,5, ale TP nie działa; następna świeca z wysokim 101,5 trafia tylko TP1 (qty round(4·50/100) = 2)
    let r = W.placeOrder(W.emptyBook(), MK('buy', { type: 'limit', price: 100, qty: 4, sl: 90, tps: [lv(101, 50), lv(102, 50)] }), last(T, 102));
    assert.deepEqual(types(r.events), []);
    r = W.advance(r.book, 'NQ', S(bar(T, 102, 102.5, 99.5, 102.25)), T + 60);
    assert.deepEqual(types(r.events), ['filled']);
    assert.equal(r.book.positions.NQ.entryPrice, 100);
    assert.deepEqual(r.book.positions.NQ.tps.map((x) => x.hit), [null, null], 'w świecy wejścia tylko SL');
    r = W.advance(r.book, 'NQ', S(bar(T, 102, 102.5, 99.5, 102.25), bar(T + 60, 102, 101.5, 101.25, 101.5)), T + 120);
    assert.deepEqual(exitsOf(r.book.positions.NQ), [[2, 101, 'tp', 'tp1']]);
    // dokładka limit @99 (qty 2) do pozycji 4@100 z drabiną 105/110: świeca z dokładką ma wysokie 106, TP1 nie działa; następna świeca: TP1 zamyka round(6·50/100) = 3
    const base = W.placeOrder(W.emptyBook(), MK('buy', { qty: 4, sl: 90, tps: [lv(105, 50), lv(110, 50)] }), last(T, 100)).book;
    const withAdd = W.placeOrder(base, MK('buy', { type: 'limit', price: 99, qty: 2 }), last(T, 100));
    assert.equal(withAdd.book.orders.length, 1);
    r = W.advance(withAdd.book, 'NQ', S(bar(T, 100, 106, 98.5, 105.5)), T + 60);
    assert.deepEqual(types(r.events), ['filled']);
    assert.equal(r.book.positions.NQ.openQty, 6);
    assert.deepEqual(r.book.positions.NQ.tps.map((x) => x.hit), [null, null]);
    r = W.advance(r.book, 'NQ', S(bar(T, 100, 106, 98.5, 105.5), bar(T + 60, 105.5, 106, 105, 105.5)), T + 120);
    assert.deepEqual(exitsOf(r.book.positions.NQ), [[3, 105, 'tp', 'tp1']]);
  });

  test('backtest-175: walidacja tps: kolejność, suma procentów, limit 4, strona ceny; poziom trafiony nie do zmiany', async () => {
    const { W, book } = await open(null);
    const mod1 = (tps, b = book, l = last(T, 100.5)) => W.modifyPosition(b, 'NQ', { tps }, l);
    // pięć poziomów: limit 4
    assert.equal(rejected(mod1([lv(101, 20), lv(102, 20), lv(103, 20), lv(104, 20), lv(105, 20)])), 'tps-max');
    assert.equal(rejected(mod1([lv(101, 25), lv(102, 25), lv(103, 25), lv(104, 25)])), '', 'cztery poziomy przechodzą');
    // suma procentów poziomów innych niż ostatni musi być < 100 (60 + 40 = 100 zostawiłoby ostatniemu 0)
    assert.equal(rejected(mod1([lv(101, 60), lv(102, 40), lv(103, 0)])), 'tps-pct');
    // procent poziomu nie-ostatniego: liczba całkowita ≥ 1
    assert.equal(rejected(mod1([lv(101, 0), lv(102, 50)])), 'tps-pct');
    assert.equal(rejected(mod1([lv(101, 12.5), lv(102, 50)])), 'tps-pct');
    assert.equal(rejected(mod1([lv(101, -5), lv(102, 50)])), 'tps-pct');
    // ta sama cena dwa razy
    assert.equal(rejected(mod1([lv(101, 50), lv(101, 50)])), 'tps-dup');
    // poziom po złej stronie ceny bieżącej (100,5), nie-liczba, ujemna
    assert.equal(rejected(mod1([lv(100.25, 50), lv(102, 50)])), 'bad-tp');
    assert.equal(rejected(mod1([lv(100.5, 50), lv(102, 50)])), 'bad-tp', 'cena równa bieżącej też zła');
    assert.equal(rejected(mod1([lv(NaN, 50), lv(102, 50)])), 'bad-tp');
    assert.equal(rejected(mod1([lv('x', 50)])), 'bad-tp');
    assert.equal(rejected(mod1('nie-tablica')), 'bad-tp');
    // jeden poziom: procent zawsze 100 (podany bywa ignorowany), cena do ticka
    let r = mod1([lv(102.1, 33)]);
    assert.deepEqual(r.book.positions.NQ.tps.map((x) => [x.id, x.price, x.pct]), [['tp1', 102, 100]]);
    // poprawna drabinka w dowolnej kolejności: posortowana od najbliższego, ostatni dostaje resztę (104: 100 − 50 − 30 = 20), id nadane w kolejności wejścia
    r = mod1([lv(104, 20), lv(102, 50), lv(103, 30)]);
    assert.equal(rejected(r), '');
    assert.deepEqual(r.book.positions.NQ.tps.map((x) => [x.id, x.price, x.pct]), [['tp2', 102, 50], ['tp3', 103, 30], ['tp1', 104, 20]]);
    assert.equal(r.book.positions.NQ.tp, 104, 'lustro tp = najdalszy poziom');
    // zmiana ma wpis w log z at i pełnym stanem poziomów
    const lg = r.book.positions.NQ.log.at(-1);
    assert.deepEqual([lg.k, lg.at], ['tps', T]);
    assert.deepEqual(lg.v, [{ id: 'tp2', price: 102, pct: 50 }, { id: 'tp3', price: 103, pct: 30 }, { id: 'tp1', price: 104, pct: 20 }]);
    // ta sama drabinka drugi raz: bez nowego wpisu
    const again = W.modifyPosition(r.book, 'NQ', { tps: r.book.positions.NQ.tps }, last(T, 100.5));
    assert.equal(again.book.positions.NQ.log.length, r.book.positions.NQ.log.length);
    // tp: null usuwa wszystkie nietrafione poziomy
    const none = W.modifyPosition(r.book, 'NQ', { tp: null }, last(T, 100.5));
    assert.deepEqual([none.book.positions.NQ.tps, none.book.positions.NQ.tp], [[], null]);
    // poziom trafiony zostaje: nie da się go zmienić ani usunąć, a liczy się do limitu 4
    const lad = await open([lv(105, 50), lv(110, 50)]);
    const hitBook = run(lad.W, lad.book, bar(T, 100, 106, 99.5, 105.5)).book;
    assert.equal(hitBook.positions.NQ.tps[0].hit.qty, 5);
    const edit = lad.W.modifyPosition(hitBook, 'NQ', { tps: [{ id: 'tp1', price: 101, pct: 90 }, { id: 'tp2', price: 112, pct: 50 }] }, last(T + 60, 106));
    assert.deepEqual(edit.book.positions.NQ.tps.map((x) => [x.id, x.price, x.pct, !!x.hit]), [['tp1', 105, 50, true], ['tp2', 112, 50, false]], 'tp1 trafiony bez zmian; tp2 dostaje resztę 100 − 50');
    const empty = lad.W.modifyPosition(hitBook, 'NQ', { tps: [] }, last(T + 60, 106));
    assert.deepEqual(empty.book.positions.NQ.tps.map((x) => x.id), ['tp1']);
    assert.equal(empty.book.positions.NQ.tp, 105, 'ostatni cel to także trafiony poziom');
    assert.equal(rejected(lad.W.modifyPosition(hitBook, 'NQ', { tps: [lv(111, 25), lv(112, 25), lv(113, 25), lv(114, 25)] }, last(T + 60, 106))), 'tps-max', '1 trafiony + 4 nowe = 5');
    assert.equal(rejected(lad.W.modifyPosition(hitBook, 'NQ', { tps: [lv(111, 20), lv(112, 20), lv(113, 20)] }, last(T + 60, 106))), '', '1 trafiony + 3 nowe = 4');
    // trafiony poziom zostaje TP1 także wtedy, gdy cena wróciła i nowy poziom leży bliżej niż on (102 < 105): numeracja trafiony pierwszy, nowy TP2, stary nietrafiony TP3
    const back = lad.W.modifyPosition(hitBook, 'NQ', { tps: [{ id: 'tp2', price: 110, pct: 30 }, lv(102, 20)] }, last(T + 60, 100.5));
    assert.equal(rejected(back), '');
    assert.deepEqual(lad.W.tpPlan(back.book.positions.NQ).map((x) => [x.id, x.rank, x.price, !!x.hit]), [['tp1', 1, 105, true], ['tp3', 2, 102, false], ['tp2', 3, 110, false]]);
  });

  test('backtest-175: przeciągnięcie zmienia numerację, procent idzie za id, ostatni (najdalszy) jest resztą', async () => {
    const { W, book } = await open([lv(105, 50), lv(110, 30), lv(115, 20)]);
    const ids = (b) => W.tpPlan(b.positions.NQ).map((x) => [x.id, x.rank, x.price, x.pct, x.qty, x.last]);
    // tp1 przeciągnięty z 105 na 112 (za tp2): kolejność tp2 (110), tp1 (112), tp3 (115). Procenty za id: 30, 50, ostatni 100 − 80 = 20
    let r = W.modifyPosition(book, 'NQ', { tps: [{ id: 'tp1', price: 112, pct: 50 }, { id: 'tp2', price: 110, pct: 30 }, { id: 'tp3', price: 115, pct: 20 }] }, last(T, 100));
    // ilości: tp2 round(10·30/100) = 3, tp1 round(7·50/70) = 5, tp3 reszta 2
    assert.deepEqual(ids(r.book), [['tp2', 1, 110, 30, 3, false], ['tp1', 2, 112, 50, 5, false], ['tp3', 3, 115, 20, 2, true]]);
    // tp1 przeciągnięty na 120 (za wszystkie): tp1 jest ostatni i dostaje resztę 100 − 30 − 20 = 50, czyli swój dotychczasowy procent
    r = W.modifyPosition(book, 'NQ', { tps: [{ id: 'tp1', price: 120, pct: 50 }, { id: 'tp2', price: 110, pct: 30 }, { id: 'tp3', price: 115, pct: 20 }] }, last(T, 100));
    assert.deepEqual(ids(r.book).map((x) => [x[0], x[1], x[3], x[5]]), [['tp2', 1, 30, false], ['tp3', 2, 20, false], ['tp1', 3, 50, true]]);
    assert.equal(r.book.positions.NQ.tp, 120);
    // Short: lustro (numeracja od najbliższego = od najwyższej ceny)
    const sh = await open([lv(95, 50), lv(90, 50)], { side: 'sell' });
    assert.deepEqual(sh.W.tpPlan(sh.book.positions.NQ).map((x) => [x.id, x.rank, x.price]), [['tp1', 1, 95], ['tp2', 2, 90]]);
    const r2 = sh.W.modifyPosition(sh.book, 'NQ', { tps: [{ id: 'tp1', price: 88, pct: 50 }, { id: 'tp2', price: 90, pct: 50 }] }, last(T, 100));
    assert.deepEqual(r2.book.positions.NQ.tps.map((x) => [x.id, x.price]), [['tp2', 90], ['tp1', 88]]);
    assert.equal(r2.book.positions.NQ.tp, 88, 'Short: najdalszy to najniższy');
  });

  test('backtest-175: dodanie dzieli procenty po równo, usunięcie oddaje procent ostatniemu (ladderApply, equalPcts)', async () => {
    const D = await imp('public/js/bt-drabinka.js');
    assert.deepEqual([1, 2, 3, 4].map((n) => D.equalPcts(n)), [[100], [50, 50], [33, 33, 34], [25, 25, 25, 25]]);
    assert.deepEqual(D.equalPcts(3, 50), [16, 16, 18], 'z trafionym poziomem 50% zostaje 50% do podziału');
    const full = [{ id: 'tp1', price: 105, pct: 50, hit: null }, { id: 'tp2', price: 110, pct: 30, hit: null }, { id: 'tp3', price: 115, pct: 20, hit: null }];
    const brief = (l) => l.map((x) => [x.id ?? null, x.price, x.pct]);
    // usunięcie środkowego: jego 30% przechodzi na ostatni (20 + 30 = 50)
    assert.deepEqual(brief(D.ladderApply('Long', full, { t: 'rm', id: 'tp2' })), [['tp1', 105, 50], ['tp3', 115, 50]]);
    // usunięcie ostatniego: poprzedni staje się ostatnim i dostaje 30 + 20 = 50
    assert.deepEqual(brief(D.ladderApply('Long', full, { t: 'rm', id: 'tp3' })), [['tp1', 105, 50], ['tp2', 110, 50]]);
    // usunięcie pierwszego: tp2 zostaje 30, ostatni 100 − 30 = 70
    assert.deepEqual(brief(D.ladderApply('Long', full, { t: 'rm', id: 'tp1' })), [['tp2', 110, 30], ['tp3', 115, 70]]);
    // dodanie poziomu dzieli po równo: 3 → 4 poziomy = 25 po 25; z jednego poziomu na dwa = 50/50
    assert.deepEqual(brief(D.ladderApply('Long', full, { t: 'add', price: 120 })), [['tp1', 105, 25], ['tp2', 110, 25], ['tp3', 115, 25], [null, 120, 25]]);
    assert.deepEqual(brief(D.ladderApply('Long', [full[0]].map((x) => ({ ...x, pct: 100 })), { t: 'add', price: 110 })), [['tp1', 105, 50], [null, 110, 50]]);
    // piąty poziom: null (limit 4)
    const four = [...full, { id: 'tp4', price: 120, pct: 10, hit: null }];
    assert.equal(D.ladderApply('Long', four, { t: 'add', price: 130 }), null);
    // z trafionym poziomem 50%: dwa nietrafione dzielą pozostałe 50%
    const hitFull = [{ id: 'tp1', price: 105, pct: 50, hit: { at: T, qty: 5 } }, { id: 'tp2', price: 110, pct: 50, hit: null }];
    assert.deepEqual(brief(D.ladderApply('Long', hitFull, { t: 'add', price: 115 })), [['tp2', 110, 25], [null, 115, 25]]);
    // zmiana ceny i procentu po id
    assert.deepEqual(brief(D.ladderApply('Long', full, { t: 'price', id: 'tp2', price: 112 })), [['tp1', 105, 50], ['tp2', 112, 30], ['tp3', 115, 20]]);
    assert.deepEqual(brief(D.ladderApply('Long', full, { t: 'pct', id: 'tp1', pct: 25 })), [['tp1', 105, 25], ['tp2', 110, 30], ['tp3', 115, 45]]);
    // procent ostatniego poziomu nie jest edytowalny (to reszta): bez zmian
    assert.deepEqual(brief(D.ladderApply('Long', full, { t: 'pct', id: 'tp3', pct: 90 })), [['tp1', 105, 50], ['tp2', 110, 30], ['tp3', 115, 20]]);
    // usunięcie przez silnik: ta sama lista przechodzi modifyPosition, a ilości na plakietce to ilości z reguły
    const { W, book } = await open([lv(105, 50), lv(110, 30), lv(115, 20)]);
    const rm = W.modifyPosition(book, 'NQ', { tps: D.ladderApply('Long', book.positions.NQ.tps, { t: 'rm', id: 'tp2' }) }, last(T, 100));
    assert.deepEqual(W.tpPlan(rm.book.positions.NQ).map((x) => [x.id, x.pct, x.qty]), [['tp1', 50, 5], ['tp3', 50, 5]]);
  });

  test('backtest-175: auto BE w świecy, w której trafił TP1: TP1 wykonany, BE od następnej świecy dla reszty', async () => {
    // Long 10@100 SL 95, drabina 105/110, próg auto BE w cenie 105 (równy TP1)
    const { W, book } = await open([lv(105, 50), lv(110, 50)], { extra: { autoBe: { kind: 'price', value: 105, offsetTicks: 0 } } });
    // świeca 1: wysokie 106 ≥ 105 (TP1 i próg), niskie 99,5 (nad starym SL 95, pod nowym BE 100): TP1 5@105, próg wyzwolony, SL na 100 dopiero od następnej świecy
    let r = run(W, book, bar(T, 100, 106, 99.5, 105.5));
    let pos = r.book.positions.NQ;
    assert.deepEqual(exitsOf(pos), [[5, 105, 'tp', 'tp1']]);
    assert.equal(pos.sl, 100, 'SL na BE po wyzwoleniu');
    assert.equal(pos.autoBe.done, true);
    assert.equal(pos.beAt, 105);
    assert.deepEqual(types(r.events), ['exit', 'be-auto']);
    // świeca 2: niskie 99,75 ≤ 100: wyjście reszty po BE (5 kontraktów po 100)
    r = run(W, book, bar(T, 100, 106, 99.5, 105.5), bar(T + 60, 105.5, 106, 99.75, 100));
    const c = closedOf(r);
    assert.deepEqual(exitsOf(c), [[5, 105, 'tp', 'tp1'], [5, 100, 'sl', null]]);
    // wynik: 5·(105 − 100)·20 + 5·0 = 500 $; R = 500 / rUsd 1000 = 0,5
    const { toTrade } = await imp('public/js/bt-journal.js');
    const tr = toTrade(c, { day: '2024-03-12' });
    assert.deepEqual([tr.pnl, tr.r, tr.be, tr.beAt, tr.tp], [500, 0.5, true, 105, 110]);
  });

  test('backtest-175: trade z drabiną: exitPrice średnia, pnl łączny, tp = ostatni cel, hit z at; Notion: jeden trade', async () => {
    const { toTrade } = await imp('public/js/bt-journal.js');
    const { tradeInput } = await imp('lib/backtest-sync.mjs');
    const sess = { id: 'bt-abc123', name: 'S', def: {} };
    const { W, book } = await open([lv(105, 50), lv(110, 50)]);
    const c = closedOf(run(W, book, bar(T, 100, 106, 99.5, 105.5), bar(T + 60, 105.5, 111, 105, 110.5)));
    const tr = toTrade(c, { day: '2024-03-12', id: 't1' });
    // wyjścia 5@105 i 5@110: średnia 107,5; wynik (105 − 100)·5·20 + (110 − 100)·5·20 = 500 + 1000 = 1500; R = 1500 / 1000 = 1,5; ostatni cel 110
    assert.deepEqual([tr.exitPrice, tr.pnl, tr.r, tr.tp, tr.qty], [107.5, 1500, 1.5, 110, 10]);
    assert.deepEqual(tr.tps.map((x) => [x.id, x.price, x.pct, x.hit]), [['tp1', 105, 50, { at: T + 60, qty: 5 }], ['tp2', 110, 50, { at: T + 120, qty: 5 }]]);
    assert.deepEqual(tr.exits.map((e) => e.tpId), ['tp1', 'tp2']);
    const inp = tradeInput(sess, { ...tr, entryT: 1710250000, exitT: 1710250600 });
    assert.deepEqual([inp.exitPrice, inp.pnl, inp.tp, inp.entryPrice, inp.r], [107.5, 1500, 110, 100, 1.5], 'jedna strona w Notion: średnia cena wyjścia, wynik łączny, pole TP = ostatni cel drabiny');
    // krawędź 6: 1 kontrakt, dwa TP: TP1 zamyka całość, a w Notion pole TP to cena TP2 (ostatni cel, nie trafiony)
    const o1 = await open([lv(105, 50), lv(110, 50)], { qty: 1 });
    const t1 = toTrade(closedOf(run(o1.W, o1.book, bar(T, 100, 106, 99.5, 105.5))), { day: '2024-03-12', id: 't2' });
    assert.deepEqual([t1.exitPrice, t1.pnl, t1.tp], [105, 100, 110]);
    assert.equal(tradeInput(sess, { ...t1, entryT: 1710250000, exitT: 1710250600 }).tp, 110);
    // krawędź 7: usunięcie wszystkich TP przed zamknięciem: tps puste, tp null, w Notion brak pola TP
    const none = o1.W.modifyPosition(o1.book, 'NQ', { tp: null }, last(T, 100));
    const t2 = toTrade(closedOf(run(o1.W, none.book, bar(T, 100, 100.5, 94, 95))), { day: '2024-03-12', id: 't3' });
    assert.deepEqual([t2.tps, t2.tp], [[], null]);
    assert.equal('tp' in tradeInput(sess, { ...t2, entryT: 1710250000, exitT: 1710250600 }), false);
    // trade sprzed 1.7 (jeden TP, tp liczbą): ostatni cel bez zmian
    assert.equal(tradeInput(sess, { id: 't9', day: '2024-03-12', instrument: 'NQ', dir: 'Long', entryT: 1710250000, exitT: 1710250600, entryPrice: 100, exitPrice: 105, sl0: 95, tp: 105, r: 1, pnl: 100 }).tp, 105);
  });

  test('backtest-175: tpPlan = ilości wykonane przez advance (te same liczby na plakietce i w trade), własność na losowych drabinach', async () => {
    const W = await mod();
    let seed = 175;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const qty = 1 + Math.floor(rnd() * 30), n = 1 + Math.floor(rnd() * 4);
      // procenty: losowe całkowite, suma nie-ostatnich < 100
      const cuts = []; let left = 99;
      for (let j = 0; j < n - 1; j++) { const p = 1 + Math.floor(rnd() * Math.max(1, Math.min(left - (n - 1 - j), 60))); cuts.push(p); left -= p; }
      const tps = cuts.map((p, j) => lv(105 + 5 * j, p)); tps.push(lv(105 + 5 * (n - 1), 0));
      if (cuts.reduce((a, b) => a + b, 0) >= 100) continue;
      const { book } = await open(tps, { qty });
      const plan = W.tpPlan(book.positions.NQ);
      assert.equal(plan.reduce((a, b) => a + b.qty, 0), qty, `suma planu = ilość pozycji (${qty}, ${JSON.stringify(tps)})`);
      assert.equal(plan.filter((x) => x.last).length, 1);
      assert.ok(plan.every((x) => x.qty >= 0 && Number.isInteger(x.qty)));
      // wykonanie: po jednym poziomie na świecę
      let b = book;
      const bars = tps.map((x, j) => bar(T + 60 * j, 100, x.price + 1, 99.5, x.price));
      const r = W.advance(b, 'NQ', S(...bars), T + 60 * bars.length);
      const pos = closedOf(r) || r.book.positions.NQ;
      const done = pos.exits.map((e) => e.qty);
      const want = plan.map((x) => x.qty).filter((q) => q > 0);
      assert.deepEqual(done, want, `wykonane = plan (${qty}, ${JSON.stringify(tps)})`);
      assert.equal(done.reduce((a, c) => a + c, 0), qty, 'wszystko zamknięte');
      checked++;
    }
    assert.ok(checked > 200, `sprawdzono ${checked} drabin`);
  });

  test('backtest-175: zlecenie oczekujące z drabiną: wypełnienie kopiuje tps do pozycji; cena zlecenia za TP1 odrzucona (bad-tp); tps zlecenia z hist i at', async () => {
    const W = await mod();
    const MKL = (extra = {}) => MK('buy', { type: 'limit', price: 100, qty: 10, sl: 90, tps: [lv(105, 50), lv(110, 50)], ...extra });
    let r = W.placeOrder(W.emptyBook(), MKL(), last(T, 102));
    const o = r.book.orders[0];
    assert.deepEqual(o.tps.map((x) => [x.id, x.price, x.pct]), [['tp1', 105, 50], ['tp2', 110, 50]]);
    assert.equal(o.tp, 110, 'lustro zlecenia: najdalszy poziom');
    assert.ok(!('hist' in o), 'bez order.hist (pakiet 6 odwołany)');
    // zły poziom przy składaniu: pod ceną zlecenia
    assert.equal(rejected(W.placeOrder(W.emptyBook(), MKL({ tps: [lv(99, 50), lv(110, 50)] }), last(T, 102))), 'bad-tp');
    assert.equal(rejected(W.placeOrder(W.emptyBook(), MKL({ tps: [lv(101, 50), lv(101, 50)] }), last(T, 102))), 'tps-dup');
    // przeciągnięcie ceny zlecenia za TP1 (104 → 106 nad 105) odrzucone; do 104 przechodzi i poziomy stoją w miejscu
    assert.equal(rejected(W.modifyOrder(r.book, o.id, { price: 106 }, last(T, 107))), 'bad-tp', 'limit kupna @106 pod rynkiem 107 jest poprawny, ale TP1 105 leży pod ceną zlecenia');
    const up = W.modifyOrder(r.book, o.id, { price: 101 }, last(T, 102));
    assert.deepEqual(up.book.orders[0].tps.map((x) => x.price), [105, 110], 'poziomy stoją w miejscu');
    // tps zlecenia podmienione: nowa lista z hist
    const ch = W.modifyOrder(r.book, o.id, { tps: [lv(103, 30), lv(108, 70)] }, last(T + 5, 102));
    assert.equal(rejected(ch), '');
    assert.deepEqual(ch.book.orders[0].tps.map((x) => [x.price, x.pct]), [[103, 30], [108, 70]]);
    assert.equal(ch.book.orders[0].tp, 108);
    assert.equal(ch.book.orders[0].tps.length, 2);
    assert.ok(!('hist' in ch.book.orders[0]));
    assert.equal(rejected(W.modifyOrder(r.book, o.id, { tps: [lv(99, 50), lv(108, 50)] }, last(T, 102))), 'bad-tp');
    // wypełnienie: pozycja ma całą drabinę
    const f = W.advance(r.book, 'NQ', S(bar(T, 102, 102.5, 99.5, 101)), T + 60);
    assert.deepEqual(f.book.positions.NQ.tps.map((x) => [x.id, x.price, x.pct, x.hit]), [['tp1', 105, 50, null], ['tp2', 110, 50, null]]);
    // legacy: pojedynczy tp liczbą nadal działa (jeden poziom 100%)
    const single = W.placeOrder(W.emptyBook(), MK('buy', { qty: 2, sl: 95, tp: 105 }), last(T, 100));
    assert.deepEqual(single.book.positions.NQ.tps, [{ id: 'tp1', price: 105, pct: 100, hit: null }]);
    // dokładka i zmniejszenie ignorują tps zlecenia
    const add = W.placeOrder(single.book, MK('buy', { qty: 1, tps: [lv(120, 100)] }), last(T, 100));
    assert.deepEqual(add.book.positions.NQ.tps.map((x) => x.price), [105]);
  });

  test('backtest-175: odwrócenie i netting z drabiną: nowa pozycja ma poziomy od ceny odwrócenia, zły poziom odrzucony', async () => {
    const W = await mod();
    const base = W.placeOrder(W.emptyBook(), MK('buy', { qty: 2, sl: 95, tps: [lv(105, 50), lv(110, 50)] }), last(T, 100)).book;
    const rv = W.reversePosition(base, 'NQ', last(T + 10, 101), { sl: 106, tps: [lv(98, 50), lv(95, 50)] });
    assert.equal(rejected(rv), '');
    assert.deepEqual(rv.book.positions.NQ.tps.map((x) => [x.id, x.price, x.pct]), [['tp1', 98, 50], ['tp2', 95, 50]]);
    assert.equal(rv.book.positions.NQ.tp, 95);
    assert.equal(rejected(W.reversePosition(base, 'NQ', last(T + 10, 101), { sl: 106, tps: [lv(102, 50), lv(95, 50)] })), 'bad-tp', 'Short: poziom nad ceną');
    // netting z odwróceniem (sprzedaż 5 przy Long 2): reszta 3 jako Short z drabiną ze zlecenia
    const nt = W.placeOrder(base, MK('sell', { qty: 5, sl: 106, tps: [lv(98, 50), lv(95, 50)] }), last(T + 10, 101));
    assert.equal(nt.book.positions.NQ.dir, 'Short');
    assert.deepEqual(nt.book.positions.NQ.tps.map((x) => x.price), [98, 95]);
  });

  test('backtest-175: presety z drabiną: sanitizeBt, opis, preset → zlecenie z poziomami, walidacja kolejności i procentów', async () => {
    const { sanitizeBt } = await imp('public/js/bt-czas.js');
    const { presetOrder, presetSummary, presetErrors } = await imp('public/js/bt-presety.js');
    const P = (o = {}) => ({ id: 'p1', name: 'Ladder', sl: { unit: 'pts', value: 10 }, tps: [{ unit: 'rr', value: 1, pct: 50 }, { unit: 'rr', value: 3, pct: 50 }], size: { mode: 'qty', value: 10 }, autoBe: { kind: 'r', value: 1, offsetTicks: 0 }, ...o });
    const S2 = (p) => sanitizeBt({ presets: p }).presets;
    assert.deepEqual(S2([P()]), [P()], 'poprawna drabina przechodzi bez zmian');
    // procent ostatniego poziomu to reszta: podany 70 jest nadpisany przez 100 − 50 = 50
    assert.deepEqual(S2([P({ tps: [{ unit: 'rr', value: 1, pct: 50 }, { unit: 'rr', value: 3, pct: 70 }] })])[0].tps.map((x) => x.pct), [50, 50]);
    // trzy poziomy 33/33/34 (ostatni dopełniony)
    assert.deepEqual(S2([P({ tps: [{ unit: 'pts', value: 5, pct: 33 }, { unit: 'pts', value: 10, pct: 33 }, { unit: 'pts', value: 20, pct: 1 }] })])[0].tps.map((x) => x.pct), [33, 33, 34]);
    // odrzucone: 5 poziomów, suma ≥ 100, procent 0 albo ułamek, poziom bliżej niż poprzedni (po przeliczeniu na punkty: 1R = 10 pkt), duplikat
    const bad = [
      P({ id: 'a1', name: 'a1', tps: [1, 2, 3, 4, 5].map((v) => ({ unit: 'pts', value: v * 5, pct: 10 })) }),
      P({ id: 'a2', name: 'a2', tps: [{ unit: 'rr', value: 1, pct: 60 }, { unit: 'rr', value: 2, pct: 40 }, { unit: 'rr', value: 3, pct: 1 }] }),
      P({ id: 'a3', name: 'a3', tps: [{ unit: 'rr', value: 1, pct: 0 }, { unit: 'rr', value: 3, pct: 50 }] }),
      P({ id: 'a4', name: 'a4', tps: [{ unit: 'rr', value: 1, pct: 12.5 }, { unit: 'rr', value: 3, pct: 50 }] }),
      P({ id: 'a5', name: 'a5', tps: [{ unit: 'rr', value: 3, pct: 50 }, { unit: 'rr', value: 1, pct: 50 }] }),
      P({ id: 'a6', name: 'a6', tps: [{ unit: 'pts', value: 10, pct: 50 }, { unit: 'rr', value: 1, pct: 50 }] }),
      P({ id: 'a7', name: 'a7', tps: [{ unit: 'ticks', value: 40, pct: 50 }, { unit: 'pts', value: 8, pct: 50 }] }),
    ];
    assert.deepEqual(S2(bad), [], 'żaden zły wpis nie przechodzi');
    assert.equal(presetErrors(bad[4]).tp, 'TP2 bliżej niż TP1.');
    assert.equal(presetErrors(bad[5]).tp, 'TP2 bliżej niż TP1.', 'równy odległością (10 pkt = 1R przy SL 10)');
    assert.equal(presetErrors(bad[6]).tp, 'TP2 bliżej niż TP1.', '40 ticków = 10 pkt > 8 pkt');
    assert.equal(presetErrors(P({ sl: null })).tp, 'TP w R:R wymaga SL.');
    assert.deepEqual(presetErrors(P()), {});
    // mieszane jednostki w porządku rosnącym: pkt i R:R przy SL
    assert.equal(S2([P({ id: 'm1', name: 'm1', tps: [{ unit: 'pts', value: 5, pct: 50 }, { unit: 'rr', value: 3, pct: 50 }] })]).length, 1);
    // opis: „SL 10 pkt · TP 1R 50% / 3R · ryzyko 10 kontraktów · auto BE 1R” (pojedynczy TP bez zmian: „TP 2R”)
    assert.match(presetSummary(P()), /^SL 10 pkt · TP 1R 50% \/ 3R · /);
    assert.match(presetSummary(P({ tps: [{ unit: 'pts', value: 5, pct: 33 }, { unit: 'pts', value: 10, pct: 33 }, { unit: 'ticks', value: 80, pct: 34 }] })), /TP 5 pkt 33% \/ 10 pkt 33% \/ 80 ticki/);
    assert.match(presetSummary(P({ tps: [{ unit: 'rr', value: 2, pct: 100 }] })), /TP 2R · /);
    // preset → zlecenie: poziomy od ceny wejścia (SL 10 pkt: 1R = 10, 3R = 30), procenty za poziomami, tp = najdalszy
    const o = presetOrder(P(), { side: 'buy', entry: 18000, instrument: 'NQ', riskUsd: 900, balance: 50000 });
    assert.deepEqual(o.order.tps, [{ price: 18010, pct: 50 }, { price: 18030, pct: 50 }]);
    assert.equal(o.order.tp, 18030);
    const sh = presetOrder(P(), { side: 'sell', entry: 18000, instrument: 'NQ', riskUsd: 900, balance: 50000 });
    assert.deepEqual(sh.order.tps, [{ price: 17990, pct: 50 }, { price: 17970, pct: 50 }]);
    // pojedynczy TP: bez klucza tps (kształt zlecenia 1.7-3 bez zmian)
    const one = presetOrder(P({ tps: [{ unit: 'rr', value: 2, pct: 100 }] }), { side: 'buy', entry: 18000, instrument: 'NQ', riskUsd: 900, balance: 50000 });
    assert.equal('tps' in one.order, false);
    assert.equal(one.order.tp, 18020);
    // zlecenie z presetu przechodzi silnik i kończy jako drabina w pozycji
    const W = await mod();
    const pl = W.placeOrder(W.emptyBook(), { ...o.order }, last(T, 18000));
    assert.equal(rejected(pl), '');
    assert.deepEqual(pl.book.positions.NQ.tps.map((x) => [x.price, x.pct]), [[18010, 50], [18030, 50]]);
  });

  test('backtest-175: pamięć panelu: lista TP (cena i procent), stary zapis z jednym TP = jeden wiersz, zły zapis odpada', async () => {
    const { recallOrderFields, rememberOrderFields, ORD_MEM_KEY } = await imp('public/js/bt-zlecenia.js');
    const store = (o) => { const d = { [ORD_MEM_KEY]: JSON.stringify(o) }; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; } }; };
    // zapis sprzed 1.7-5: jeden TP (tp: '20') = jeden wiersz 100%
    assert.deepEqual(recallOrderFields(store({ NQ: { unit: 'pt', sl: '10', tp: '20' } }), 'NQ').tps, [{ v: '20', pct: '100' }]);
    assert.deepEqual(recallOrderFields(store({ NQ: { unit: 'pt', sl: '10', tp: '' } }), 'NQ').tps, [], 'puste pole TP = brak poziomów');
    // lista: zapis i odczyt, tp zostaje pierwszym poziomem (zgodność ze starszym odczytem)
    const st = store({});
    rememberOrderFields(st, 'NQ', { unit: 'pt', sl: '10', tp: '20', tps: [{ v: '20', pct: '50' }, { v: '40', pct: '50' }] });
    const back = recallOrderFields(st, 'NQ');
    assert.deepEqual(back.tps, [{ v: '20', pct: '50' }, { v: '40', pct: '50' }]);
    assert.equal(back.tp, '20');
    const raw = JSON.parse(st.getItem(ORD_MEM_KEY));
    assert.equal(raw.NQ.tp, '20', 'pole tp zapisane dla starszego odczytu');
    // zły zapis: więcej niż 4 poziomy, nie-liczby, ujemne, procent poza 1..99 → lista odpada (zostaje pierwszy TP)
    const bad = (tps) => recallOrderFields(store({ NQ: { unit: 'pt', sl: '10', tp: '20', tps } }), 'NQ').tps;
    assert.deepEqual(bad([1, 2, 3, 4, 5].map((v) => ({ v: String(v), pct: '20' }))), [{ v: '20', pct: '100' }], 'pięć poziomów');
    assert.deepEqual(bad([{ v: 'x', pct: '50' }, { v: '40', pct: '50' }]), [{ v: '20', pct: '100' }]);
    assert.deepEqual(bad([{ v: '-4', pct: '50' }, { v: '40', pct: '50' }]), [{ v: '20', pct: '100' }]);
    assert.deepEqual(bad([{ v: '20', pct: '0' }, { v: '40', pct: '50' }]), [{ v: '20', pct: '100' }]);
    assert.deepEqual(bad([{ v: '20', pct: '100' }, { v: '40', pct: '50' }]), [{ v: '20', pct: '100' }], 'suma nie-ostatnich ≥ 100');
    // zapis z wieloma poziomami nie psuje się przy nieznanych polach
    assert.deepEqual(bad([{ v: '20', pct: '50', junk: 1 }, { v: '40', pct: '50' }]), [{ v: '20', pct: '50' }, { v: '40', pct: '50' }]);
  });

  test('backtest-175: poziom zamyka najmniej 1 kontrakt; dokładka po TP1 (5 z 10 + 5): ostatni poziom zamyka 10', async () => {
    // 2 kontrakty, TP1 10%: round(2 · 10 / 100) = round(0,2) = 0 → najmniej 1; TP2 reszta 1
    let { W, book } = await open([lv(105, 10), lv(110, 90)], { qty: 2 });
    assert.deepEqual(planQty(W, book.positions.NQ), [1, 1], 'najmniej 1 kontrakt na poziom');
    let r = run(W, book, bar(T, 100, 106, 99.5, 105.5));
    assert.deepEqual(exitsOf(r.book.positions.NQ), [[1, 105, 'tp', 'tp1']]);
    // 10 kontraktów 50/50: po TP1 zostaje 5; dokładka 5 po cenie 105 → 10 otwartych, TP2 (ostatni) zamyka 10
    ({ W, book } = await open([lv(105, 50), lv(110, 50)]));
    book = run(W, book, bar(T, 100, 106, 99.5, 105.5)).book;
    assert.equal(book.positions.NQ.openQty, 5);
    book = W.placeOrder(book, MK('buy', { qty: 5 }), last(T + 60, 105.5)).book;
    assert.equal(book.positions.NQ.openQty, 10);
    assert.deepEqual(W.tpPlan(book.positions.NQ).filter((x) => !x.hit).map((x) => [x.id, x.qty, x.last]), [['tp2', 10, true]]);
    r = W.advance(book, 'NQ', S(bar(T, 100, 106, 99.5, 105.5), bar(T + 60, 105.5, 111, 105, 110.5)), T + 120);
    const c = closedOf(r);
    assert.deepEqual(exitsOf(c), [[5, 105, 'tp', 'tp1'], [10, 110, 'tp', 'tp2']]);
    // wynik: TP1 5 · (105 − 100) · 20 = 500; potem otwarte 5@100 + 5@105,5 = średnia 102,75, TP2 10 · (110 − 102,75) · 20 = 1 450; razem 1 950 $
    assert.equal(c.tps.every((x) => x.hit), true);
    assert.equal(c.pnl, 1950);
  });

  test('backtest-175: statystyki: trade z kilkoma TP to jeden trade, powód ostatniego wyjścia tp (ostatni poziom), „po BE” tylko przy wyniku w marginesie BE', async () => {
    const { toTrade } = await imp('public/js/bt-journal.js');
    const { mergeBacktest } = await imp('public/js/bt-staty.js');
    const mk = (id, bars, tps, extra = {}) => open(tps, { qty: 10, extra }).then(({ W, book }) => ({ W, tr: toTrade(closedOf(run(W, book, ...bars)), { day: '2024-03-12', id }) }));
    // 1) oba poziomy: ostatnie wyjście tp, jeden trade, R 1,5
    const a = await mk('t1', [bar(T, 100, 106, 99.5, 105.5), bar(T + 60, 105.5, 111, 105, 110.5)], [lv(105, 50), lv(110, 50)]);
    // 2) TP1 i auto BE na 105, potem stop na BE: ostatnie wyjście sl, wynik +500 $ (0,5R): to nie „po BE”
    const b = await mk('t2', [bar(T, 100, 106, 99.5, 105.5), bar(T + 60, 105.5, 106, 99.75, 100)], [lv(105, 50), lv(110, 50)], { autoBe: { kind: 'price', value: 105, offsetTicks: 0 } });
    const all = mergeBacktest([], [{ id: 'bt-abc123', name: 'S', trades: [a.tr, b.tr] }]);
    assert.equal(all.length, 2, 'dwa trade\'y, nie cztery wyjścia');
    const x1 = all.find((t) => t.id === 't1'), x2 = all.find((t) => t.id === 't2');
    assert.deepEqual([x1.exit, x1.r, x1.pnl, x1.beHit], ['tp', 1.5, 1500, false]);
    assert.deepEqual([x2.exit, x2.r, x2.pnl, x2.beHit], ['sl', 0.5, 500, false], 'częściowy zysk przed stopem na BE to nie „po BE”');
  });

  // ---------- runda 2 (przeglądy: kod 7,5, bezpieczeństwo 9): MAE/MFE w świecy trafienia poziomu, księga z pliku, modifyOrder, informacja o poziomie przy odrzuceniu ----------
  test('backtest-175: MAE/MFE z drabiną: część zamknięta na poziomie liczy się po cenie poziomu, reszta do ekstremum świecy (model §3.6)', async () => {
    const { toTrade } = await imp('public/js/bt-journal.js');
    // F: 10 kontraktów @100, SL 95 (rUsd 1000), TP1 105 (50%), TP2 140; druga świeca high 130, low 100: TP1 zamknął 5 po 105, pozostałe 5 doszło do 130.
    // MFE = (5·5 + 5·30) pkt·kontr · 20 / 1000 = 175 · 20 / 1000 = 3,5R (przed poprawką 10·30·20/1000 = 6R). Świeca wejścia: low 99,5 → 10·(−0,5)·20/1000 = −0,1R.
    let { W, book } = await open([lv(105, 50), lv(140, 50)]);
    const stF = S(bar(T, 100, 100.5, 99.5, 100), bar(T + 60, 100, 130, 100, 101));
    let r = W.advance(book, 'NQ', stF, T + 120);
    assert.equal(r.book.positions.NQ.openQty, 5, 'TP1 zamknął połowę');
    assert.deepEqual(W.excursions(r.book.positions.NQ, stF, { eff: T + 120 }), { maeR: -0.1, mfeR: 3.5 });
    // G: TP1 105 (5) i TP2 110 (5) w jednej świecy z high 111, pozycja zamknięta: wynik (5·5 + 5·10)·20/1000 = 1,5R, a cena nie była wyżej niż poziomy → MFE 1,5R (przed poprawką 10·11·… = 2R)
    ({ W, book } = await open([lv(105, 50), lv(110, 50)]));
    const stG = S(bar(T, 100, 100.5, 99.5, 100), bar(T + 60, 100, 111, 100, 110));
    const cG = closedOf(W.advance(book, 'NQ', stG, T + 120));
    assert.equal(cG.r, 1.5);
    assert.deepEqual(W.excursions(cG, stG), { maeR: -0.1, mfeR: 1.5 });
    // runner z e2e: 8 kontraktów @100, SL 85 (rUsd 15·8·20 = 2400), TP 115 (50% → 4), 130 (30% → 2), 190 (reszta 2), auto BE przy 130; świeca 1 high 135 (TP1 i TP2), świeca 2 powrót na BE (SL 100).
    // MFE = (4·15 + 2·30 + 2·35) pkt·kontr · 20 / 2400 = 190 · 20 / 2400 = 1,58R (przed poprawką 8·35·20/2400 = 2,33R); MAE: świeca 1 low 99 z ilością sprzed trafień 8·(−1)·20/2400 = −0,07R
    const W2 = await mod();
    const r0 = W2.placeOrder(W2.emptyBook(), MK('buy', { qty: 8, sl: 85, tps: [lv(115, 50), lv(130, 30), { price: 190 }], autoBe: { kind: 'price', value: 130, offsetTicks: 0 } }), last(T, 100));
    const stR = S(bar(T, 100, 135, 99, 120), bar(T + 60, 120, 121, 99, 100));
    const cR = closedOf(W2.advance(r0.book, 'NQ', stR, T + 120));
    assert.deepEqual(cR.exits.map((e) => [e.qty, e.price, e.reason]), [[4, 115, 'tp'], [2, 130, 'tp'], [2, 100, 'sl']]);
    assert.deepEqual(W2.excursions(cR, stR), { maeR: -0.07, mfeR: 1.58 });
    const trR = toTrade(cR, { day: '2024-03-12', id: 'tr', stream: stR });
    assert.deepEqual([trR.maeR, trR.mfeR], [-0.07, 1.58], 'ten sam wynik trafia do Journal i do Notion (btMae/btMfe)');
    // MAE w świecy TP: 10 @100, SL 95, TP1 105 (50%), świeca high 106, low 97. Kolejność low/TP w świecy nieznana, więc strona niekorzystna liczy się z ilością SPRZED trafienia (zachowawczo):
    // MAE = 10·(97 − 100)·20/1000 = −0,6R (gdyby low był po TP1: 5·(−3)·20/1000 = −0,3R, a zysk 500 dałby +0,2R); MFE = (5·5 + 5·6)·20/1000 = 1,1R
    ({ W, book } = await open([lv(105, 50), lv(140, 50)]));
    const stM = S(bar(T, 100, 100.2, 99.9, 100), bar(T + 60, 100, 106, 97, 101));
    r = W.advance(book, 'NQ', stM, T + 120);
    assert.deepEqual(W.excursions(r.book.positions.NQ, stM, { eff: T + 120 }), { maeR: -0.6, mfeR: 1.1 });
    // pozycja bez drabiny: bez zmian względem 1.6 (jeden TP zamyka całość: zysk nie dalej niż TP; 10·5·20/1000 = 1R)
    ({ W, book } = await open([lv(105, 100)]));
    const stS = S(bar(T, 100, 100.2, 99.9, 100), bar(T + 60, 100, 130, 100, 101));
    const cS = closedOf(W.advance(book, 'NQ', stS, T + 120));
    assert.deepEqual(W.excursions(cS, stS), { maeR: -0.02, mfeR: 1 });
    // Short: 10 @100, SL 105, TP1 95 (50%), TP2 60; świeca low 70, high 100: MFE = (5·5 + 5·30)·20/1000 = 3,5R
    ({ W, book } = await open([lv(95, 50), lv(60, 50)], { side: 'sell' }));
    const stH = S(bar(T, 100, 100.1, 99.8, 100), bar(T + 60, 100, 100, 70, 99));
    r = W.advance(book, 'NQ', stH, T + 120);
    assert.equal(W.excursions(r.book.positions.NQ, stH, { eff: T + 120 }).mfeR, 3.5);
  });

  test('backtest-175: księga z pliku: drabina po migrateBook ma poprawne ceny, najwyżej 4 poziomy i procenty przez ladderPcts; tpQtyAt przy złych procentach zamyka resztę na bieżącym', async () => {
    const W = await mod();
    const { tpQtyAt } = await imp('public/js/bt-drabinka.js');
    const base = (await open([lv(105, 50), lv(110, 50)])).book;
    // księga z uszkodzonym `tps` pozycji → migrateBook → świeca przecinająca oba poziomy
    const withTps = (tps) => { const b = JSON.parse(JSON.stringify(base)); b.positions.NQ.tps = tps; return W.migrateBook(b); };
    const hi = S(bar(T, 100, 111, 99.5, 110));
    const exitsAfter = (tps) => { const b = withTps(tps); const r = W.advance(b, 'NQ', hi, T + 60); return { b, ex: (closedOf(r) || r.book.positions.NQ).exits.map((e) => [e.qty, e.price]) }; };
    // kontrola: poprawna drabina 50/50 → 5 @105 i 5 @110
    assert.deepEqual(exitsAfter([{ id: 'tp1', price: 105, pct: 50, hit: null }, { id: 'tp2', price: 110, pct: 50, hit: null }]).ex, [[5, 105], [5, 110]]);
    // pct "abc" i 0 → ladderPcts odrzuca, podział po równo 50/50: 5 @105 i 5 @110 (przed poprawką NaN w ilości i pozycja nie zamykała się)
    for (const bad of ['abc', 0, -3, 1.5, null]) {
      const x = exitsAfter([{ id: 'tp1', price: 105, pct: bad, hit: null }, { id: 'tp2', price: 110, pct: 50, hit: null }]);
      assert.deepEqual(x.ex, [[5, 105], [5, 110]], `pct ${JSON.stringify(bad)}: podział po równo`);
      assert.deepEqual(x.b.positions.NQ.tps.map((t) => [t.id, t.price, t.pct]), [['tp1', 105, 50], ['tp2', 110, 50]]);
    }
    // pct "50" (tekst) → liczba 50: 5 @105 i 5 @110 (przed poprawką tpQtyAt skleił napisy: 1 i 9)
    const str = exitsAfter([{ id: 'tp1', price: 105, pct: '50', hit: null }, { id: 'tp2', price: 110, pct: '50', hit: null }]);
    assert.deepEqual(str.ex, [[5, 105], [5, 110]]);
    assert.deepEqual(str.b.positions.NQ.tps.map((t) => typeof t.pct), ['number', 'number']);
    // 30/reszta po migracji bez zmian (drabina poprawna jest nietknięta, migracja idempotentna)
    const good = [{ id: 'tp1', price: 105, pct: 30, hit: null }, { id: 'tp2', price: 110, pct: 70, hit: null }];
    assert.deepEqual(withTps(good).positions.NQ.tps, good);
    assert.deepEqual(W.migrateBook(withTps(good)).positions.NQ.tps, good);
    // cena spoza liczb: poziom odpada; 6 poziomów: zostają 4 najbliższe z poprawnymi procentami (suma 100)
    assert.deepEqual(withTps([{ id: 'tp1', price: 'x', pct: 50, hit: null }, { id: 'tp2', price: 110, pct: 50, hit: null }]).positions.NQ.tps.map((t) => [t.price, t.pct]), [[110, 100]]);
    const six = withTps([1, 2, 3, 4, 5, 6].map((k) => ({ id: `tp${k}`, price: 100 + k, pct: k < 6 ? 10 : 50, hit: null }))).positions.NQ.tps;
    assert.deepEqual([six.length, six.reduce((a, x) => a + x.pct, 0), six.map((x) => x.price)], [4, 100, [101, 102, 103, 104]]);
    // zlecenie oczekujące z uszkodzoną drabiną też przechodzi sanityzację
    const lim = W.placeOrder(W.emptyBook(), MK('buy', { type: 'limit', price: 100, qty: 10, sl: 90, tps: [lv(105, 50), lv(110, 50)] }), last(T, 102)).book;
    const lj = JSON.parse(JSON.stringify(lim)); lj.orders[0].tps[0].pct = 'abc';
    assert.deepEqual(W.migrateBook(lj).orders[0].tps.map((t) => t.pct), [50, 50]);
    // tpQtyAt: złe procenty → cała reszta na bieżącym poziomie (zamiast NaN)
    assert.equal(tpQtyAt(10, [50, 50]), 5);
    assert.equal(tpQtyAt(10, ['50', '50']), 10);
    assert.equal(tpQtyAt(10, [0, 100]), 10);
    assert.equal(tpQtyAt(10, [NaN, 50]), 10);
    assert.equal(tpQtyAt(10, [1.5, 50]), 10);
  });

  test('backtest-175: modifyOrder z { price, tp } sprawdza poziomy drabiny względem nowej ceny zlecenia', async () => {
    const W = await mod();
    // Long limit 98, poziomy 101 / 104, rynek 105
    const r = W.placeOrder(W.emptyBook(), MK('buy', { type: 'limit', price: 98, qty: 10, sl: 90, tps: [lv(101, 50), lv(104, 50)] }), last(T, 105));
    const o = r.book.orders[0];
    // cena 101,5 > TP1 101: odrzucone także gdy zmiana niesie `tp` równy dotychczasowemu (104) (przed poprawką przechodziło)
    assert.equal(rejected(W.modifyOrder(r.book, o.id, { price: 101.5, tp: 104 }, last(T, 105))), 'bad-tp');
    assert.equal(rejected(W.modifyOrder(r.book, o.id, { price: 101.5 }, last(T, 105))), 'bad-tp', 'bez tp tak samo');
    // kontrola: cena 100 zostawia oba poziomy nad ceną, zmiana przechodzi i drabina stoi
    const ok = W.modifyOrder(r.book, o.id, { price: 100, tp: 104 }, last(T, 105));
    assert.equal(rejected(ok), '');
    assert.deepEqual(ok.book.orders[0].tps.map((x) => x.price), [101, 104]);
    // `tp` inny niż dotychczasowy zastępuje drabinę jednym poziomem (stare zachowanie), a nad ceną: przechodzi
    const one = W.modifyOrder(r.book, o.id, { price: 100, tp: 108 }, last(T, 105));
    assert.deepEqual(one.book.orders[0].tps.map((x) => x.price), [108]);
  });

  test('backtest-175: odrzucenie edycji drabiny podaje poziom (numer, cenę i cenę odniesienia): cena przeszła TP w świecy wejścia', async () => {
    const { W, book } = await open([lv(105, 50), lv(110, 50)]);
    // wejście @100 i cena bieżąca 106 (TP nie działa w świecy wejścia): TP1 105 leży już za ceną, więc każda edycja listy jest odrzucona, ale z informacją, który poziom
    const rej = W.modifyPosition(book, 'NQ', { tps: [lv(105, 40), lv(110, 60)] }, last(T + 30, 106)).events.find((e) => e.type === 'rejected');
    assert.deepEqual([rej.reason, rej.level, rej.price, rej.ref], ['bad-tp', 1, 105, 106]);
    // Short @100: poziomy 95 / 90, cena bieżąca 94 (TP1 95 leży nad ceną = za nią): numer 1, cena 95, odniesienie 94
    const sh = await open([lv(95, 50), lv(90, 50)], { side: 'sell' });
    const rej2 = sh.W.modifyPosition(sh.book, 'NQ', { tps: [lv(95, 40), lv(90, 60)] }, last(T + 30, 94)).events.find((e) => e.type === 'rejected');
    assert.deepEqual([rej2.reason, rej2.level, rej2.price, rej2.ref], ['bad-tp', 1, 95, 94]);
    // numer poziomu liczy się po posortowaniu: 105 i 104 oba za ceną 106, a pierwszy w liście (105) jest po posortowaniu drugim (TP2)
    const rej3 = W.modifyPosition(book, 'NQ', { tps: [lv(105, 50), lv(104, 50)] }, last(T + 30, 106)).events.find((e) => e.type === 'rejected');
    assert.deepEqual([rej3.reason, rej3.level, rej3.price, rej3.ref], ['bad-tp', 2, 105, 106]);
    // pozostałe kody bez zmian i bez pola level
    assert.equal(W.modifyPosition(book, 'NQ', { tps: [lv(105, 50), lv(110, 50), lv(120, 10), lv(130, 5), lv(140, 5)] }, last(T + 30, 100)).events[0].level, undefined);
  });
};
