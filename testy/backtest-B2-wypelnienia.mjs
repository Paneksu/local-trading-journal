// backtest-B2: silnik wypełnień (public/js/bt-wypelnienia.js). Ręczne strumienie bazowe { bars, len }, dane wyłącznie syntetyczne.
// Reguły z §7 projektu i karty B2: SL przed TP w jednej świecy, w świecy wejścia tylko SL, limit po cenie limitu, stop przy luce po open, mnożniki 50/20/5/2.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, assert, ROOT }) => {
  const mod = () => import(pathToFileURL(path.join(ROOT, 'public/js/bt-wypelnienia.js')).href);
  // strumień z świec 1m (len 60) albo [bar, len]
  const S = (...bars) => ({ bars: bars.map((b) => (Array.isArray(b[0]) ? b[0] : b)), len: bars.map((b) => (Array.isArray(b[0]) ? b[1] : 60)) });
  const bar = (t, o, h, l, c) => [t, o, h, l, c, 10];
  const T = 1000; // początek pierwszej świecy
  const types = (ev) => ev.map((e) => e.type);
  const long = (extra = {}) => ({ instrument: 'NQ', side: 'buy', type: 'market', qty: 1, sl: 99, tp: null, ...extra });

  test('backtest-B2: SL wygrywa z TP w jednej świecy', async () => {
    const W = await mod();
    let { book, events } = W.placeOrder(W.emptyBook(), long({ sl: 99, tp: 101 }), { t: T, price: 100 });
    assert.deepEqual(types(events), ['filled']);
    const r = W.advance(book, 'NQ', S(bar(T, 100, 101.5, 98.5, 100.5)), T + 60);
    assert.deepEqual(types(r.events), ['exit', 'closed']);
    const pos = r.events[1].position;
    assert.equal(pos.exits[0].price, 99);
    assert.equal(pos.exits[0].reason, 'sl');
    assert.equal(W.tradeResult(pos).r, -1);
    assert.equal(r.book.positions.NQ, null);
    assert.equal(r.book.closed, undefined); // Book nie trzyma historii zamkniętych pozycji
  });

  test('backtest-B2: limit po cenie limitu', async () => {
    const W = await mod();
    const order = { instrument: 'NQ', side: 'buy', type: 'limit', price: 99.5, qty: 1, sl: 95, tp: null };
    let { book, events } = W.placeOrder(W.emptyBook(), order, { t: T, price: 100 });
    assert.deepEqual(events, []);
    assert.equal(book.orders.length, 1);
    let r = W.advance(book, 'NQ', S(bar(T, 100, 100.25, 99, 99.75)), T + 60);
    assert.deepEqual(types(r.events), ['filled']);
    assert.equal(r.book.positions.NQ.entryPrice, 99.5);
    assert.equal(r.book.positions.NQ.entryT, T);
    assert.equal(r.book.orders.length, 0);
    // świeca otwarta luką poniżej limitu: nadal cena limitu
    r = W.advance(book, 'NQ', S(bar(T, 98, 98.5, 97.75, 98.25)), T + 60);
    assert.equal(r.book.positions.NQ.entryPrice, 99.5);
  });

  test('backtest-B2: stop przy luce po otwarciu', async () => {
    const W = await mod();
    const order = { instrument: 'NQ', side: 'buy', type: 'stop', price: 101, qty: 1, sl: 99, tp: null };
    const { book } = W.placeOrder(W.emptyBook(), order, { t: T, price: 100 });
    const st = S(bar(T, 102, 103, 101.5, 102.5), bar(T + 60, 98, 98.5, 97, 97.5));
    let r = W.advance(book, 'NQ', st, T + 60);
    assert.equal(r.book.positions.NQ.entryPrice, 102);
    r = W.advance(r.book, 'NQ', st, T + 120);
    const pos = r.events.find((e) => e.type === 'closed').position;
    assert.equal(pos.exits[0].price, 98);
    assert.ok(W.tradeResult(pos).r < -1);
    // stop bez luki: po cenie wyzwolenia
    const r2 = W.advance(book, 'NQ', S(bar(T, 100, 101.5, 99.75, 101.25)), T + 60);
    assert.equal(r2.book.positions.NQ.entryPrice, 101);
  });

  test('backtest-B2: market po ostatniej cenie', async () => {
    const W = await mod();
    const { book, events } = W.placeOrder(W.emptyBook(), long({ sl: 99 }), { t: T, price: 100.25 });
    assert.deepEqual(types(events), ['filled']);
    assert.equal(events[0].position.entryPrice, 100.25);
    assert.equal(book.positions.NQ.entryPrice, 100.25);
    assert.equal(book.positions.NQ.entryT, T);
    assert.equal(book.positions.NQ.dir, 'Long');
    assert.equal(book.positions.NQ.sl0, 99);
  });

  test('backtest-B2: w świecy wejścia tylko SL', async () => {
    const W = await mod();
    const order = { instrument: 'NQ', side: 'buy', type: 'limit', price: 99.5, qty: 1, sl: 98, tp: 101 };
    const { book } = W.placeOrder(W.emptyBook(), order, { t: T, price: 100 });
    // świeca wejścia dotyka TP: pozycja zostaje otwarta
    let r = W.advance(book, 'NQ', S(bar(T, 100, 101.5, 99, 100)), T + 60);
    assert.deepEqual(types(r.events), ['filled']);
    assert.ok(r.book.positions.NQ);
    // TP dopiero od następnej świecy
    r = W.advance(r.book, 'NQ', S(bar(T, 100, 101.5, 99, 100), bar(T + 60, 100, 101.25, 99.75, 101)), T + 120);
    assert.equal(r.events.find((e) => e.type === 'closed').position.exits[0].reason, 'tp');
    // świeca wejścia dotyka SL: wyjście po SL w tej samej świecy
    r = W.advance(book, 'NQ', S(bar(T, 100, 101.5, 97.5, 100)), T + 60);
    assert.deepEqual(types(r.events), ['filled', 'exit', 'closed']);
    const pos = r.events[2].position;
    assert.equal(pos.exits[0].price, 98);
    assert.equal(pos.exits[0].reason, 'sl');
    assert.equal(W.tradeResult(pos).r, -1);
  });

  test('backtest-B2: częściowe zamknięcie i R ważone', async () => {
    const W = await mod();
    let { book } = W.placeOrder(W.emptyBook(), long({ qty: 2, sl: 99, tp: 102 }), { t: T, price: 100 });
    let r = W.closePartial(book, 'NQ', 1, { t: T, price: 101 });
    assert.deepEqual(types(r.events), ['exit']);
    assert.equal(r.book.positions.NQ.openQty, 1);
    r = W.advance(r.book, 'NQ', S(bar(T, 100, 102.5, 99.5, 102)), T + 60);
    assert.deepEqual(types(r.events), ['exit', 'closed']);
    const pos = r.events[1].position;
    assert.deepEqual(pos.exits.map((e) => [e.reason, e.qty, e.price]), [['partial', 1, 101], ['tp', 1, 102]]);
    const res = W.tradeResult(pos);
    assert.equal(res.r, 1.5);
    assert.equal(res.pnl, (1 + 2) * 20);
    assert.equal(res.exitPrice, 101.5);
    assert.equal(pos.r, 1.5);
    // za duża ilość częściowa
    assert.equal(W.closePartial(book, 'NQ', 3, { t: T, price: 101 }).events[0].reason, 'bad-qty');
  });

  test('backtest-B2: BE', async () => {
    const W = await mod();
    let { book } = W.placeOrder(W.emptyBook(), long({ sl: 99, tp: 103 }), { t: T, price: 100 });
    const st = S(bar(T, 100, 101, 99.5, 100.75), bar(T + 60, 100.5, 100.75, 99.75, 100));
    let r = W.advance(book, 'NQ', st, T + 60);
    assert.deepEqual(r.events, []);
    r = W.moveToBE(r.book, 'NQ', { t: T + 60, price: 100.75 });
    assert.equal(r.book.positions.NQ.sl, r.book.positions.NQ.entryPrice);
    assert.equal(r.book.positions.NQ.be, true);
    assert.equal(r.book.positions.NQ.sl0, 99);
    r = W.advance(r.book, 'NQ', st, T + 120);
    const res = W.tradeResult(r.events.find((e) => e.type === 'closed').position);
    assert.equal(res.r, 0);
    assert.equal(res.pnl, 0);
  });

  test('backtest-B2: jedna pozycja na instrument', async () => {
    const W = await mod();
    let { book } = W.placeOrder(W.emptyBook(), long(), { t: T, price: 100 });
    let r = W.placeOrder(book, { instrument: 'NQ', side: 'buy', type: 'limit', price: 99, qty: 1, sl: 98 }, { t: T, price: 100 });
    assert.deepEqual(types(r.events), ['rejected']);
    assert.equal(r.events[0].reason, 'position-open');
    r = W.placeOrder(book, { instrument: 'ES', side: 'sell', type: 'market', qty: 1, sl: 5010 }, { t: T, price: 5000 });
    assert.deepEqual(types(r.events), ['filled']);
    assert.equal(r.book.positions.ES.dir, 'Short');
    assert.ok(r.book.positions.NQ);
    // wypełnienie jednego wejścia anuluje drugie oczekujące wejście NQ (ES zostaje)
    let b = W.emptyBook();
    b = W.placeOrder(b, { instrument: 'NQ', side: 'buy', type: 'limit', price: 99.5, qty: 1, sl: 98 }, { t: T, price: 100 }).book;
    b = W.placeOrder(b, { instrument: 'NQ', side: 'buy', type: 'limit', price: 99, qty: 1, sl: 98 }, { t: T, price: 100 }).book;
    b = W.placeOrder(b, { instrument: 'ES', side: 'buy', type: 'limit', price: 4990, qty: 1, sl: 4980 }, { t: T, price: 5000 }).book;
    r = W.advance(b, 'NQ', S(bar(T, 100, 100.25, 99.25, 99.75)), T + 60);
    assert.deepEqual(types(r.events), ['filled', 'cancelled']);
    assert.equal(r.book.positions.NQ.entryPrice, 99.5);
    assert.deepEqual(r.book.orders.map((o) => o.instrument), ['ES']);
  });

  test('backtest-B2: znak wodny', async () => {
    const W = await mod();
    const H10 = 36000; // 10:00 (umowna oś czasu testu)
    const bars = [];
    for (let i = 0; i < 10; i++) bars.push(bar(H10 + i * 60, 100 - i * 0.25, 100.5 - i * 0.25, 99.5 - i * 0.25, 99.75 - i * 0.25));
    const st = S(...bars);
    let { book } = W.placeOrder(W.emptyBook(), { instrument: 'NQ', side: 'buy', type: 'limit', price: 99, qty: 1, sl: 97, tp: 99.5 }, { t: H10, price: 100 });
    let r = W.advance(book, 'NQ', st, H10 + 300);
    assert.deepEqual(types(r.events), ['filled', 'exit', 'closed']);
    assert.equal(r.book.hw, H10 + 300);
    const snap = JSON.stringify(r.book);
    // cofnięcie: nic nie znika, nic nie przetwarza się drugi raz
    r = W.advance(r.book, 'NQ', st, H10);
    assert.deepEqual(r.events, []);
    assert.equal(JSON.stringify(r.book), snap);
    r = W.advance(r.book, 'NQ', st, H10 + 300);
    assert.deepEqual(r.events, []);
    assert.equal(r.book.closed, undefined); // Book nie trzyma historii zamkniętych pozycji
    // handel przy kursorze przed znakiem wodnym zablokowany
    const rej = W.placeOrder(r.book, long(), { t: H10, price: 100 });
    assert.deepEqual(types(rej.events), ['rejected']);
    assert.equal(rej.events[0].reason, 'rewound');
    assert.equal(W.placeOrder(r.book, long({ sl: 97 }), { t: H10 + 300, price: 99 }).events[0].type, 'filled');
  });

  test('backtest-B2: MAE i MFE w R', async () => {
    const W = await mod();
    let { book } = W.placeOrder(W.emptyBook(), long({ sl: 98, tp: 110 }), { t: T, price: 100 });
    const st = S(bar(T, 100, 101, 99, 100.5), bar(T + 60, 100.5, 103, 100, 102), bar(T + 120, 102, 108, 90, 95));
    let r = W.advance(book, 'NQ', st, T + 120);
    r = W.closeAll(r.book, 'NQ', { t: T + 120, price: 102 }, 'manual');
    const pos = r.events.find((e) => e.type === 'closed').position;
    assert.deepEqual(W.excursions(pos, st), { maeR: -0.5, mfeR: 1.5 });
    assert.equal(pos.maeR, undefined); // excursions liczy wywołujący (journaling)
    // SL w świecy wyjścia: MAE nie dalej niż cena wyjścia
    ({ book } = W.placeOrder(W.emptyBook(), long({ sl: 98, tp: 110 }), { t: T, price: 100 }));
    const st2 = S(bar(T, 100, 101, 99, 100.5), bar(T + 60, 100.5, 101, 96, 97));
    r = W.advance(book, 'NQ', st2, T + 120);
    const p2 = r.events.find((e) => e.type === 'closed').position;
    assert.deepEqual(W.excursions(p2, st2), { maeR: -1, mfeR: 0.5 });
  });

  test('backtest-B2: mnożniki i wielkość', async () => {
    const W = await mod();
    assert.deepEqual(W.MULT, { ES: 50, NQ: 20, MES: 5, MNQ: 2 });
    assert.equal(W.TICK, 0.25);
    assert.equal(W.sizeFromRisk({ riskUsd: 500, entry: 100, sl: 98, instrument: 'NQ' }), 12);
    assert.equal(W.sizeFromRisk({ riskUsd: 30, entry: 100, sl: 98, instrument: 'NQ' }), 0);
    assert.equal(W.sizeFromRisk({ riskUsd: 500, entry: 100, sl: 100, instrument: 'NQ' }), 0);
    assert.equal(W.sizeFromRisk({ riskUsd: 500, entry: 5000, sl: 4998, instrument: 'MES' }), 50);
    // USD z mnożnika instrumentu
    const { book } = W.placeOrder(W.emptyBook(), { instrument: 'MES', side: 'sell', type: 'market', qty: 3, sl: 5002 }, { t: T, price: 5000 });
    const r = W.closeAll(book, 'MES', { t: T, price: 4996.5 }, 'manual');
    const res = W.tradeResult(r.events.find((e) => e.type === 'closed').position);
    assert.equal(res.pnl, 3.5 * 5 * 3);
    assert.equal(res.r, 1.75);
  });

  test('backtest-B2: modyfikacja SL/TP', async () => {
    const W = await mod();
    const { book } = W.placeOrder(W.emptyBook(), long({ sl: 99 }), { t: T, price: 100 });
    let r = W.modifyPosition(book, 'NQ', { sl: 101.13 }, { t: T, price: 103 });
    assert.deepEqual(r.events, []);
    assert.equal(r.book.positions.NQ.sl, 101.25);
    assert.equal(r.book.positions.NQ.sl0, 99);
    r = W.modifyPosition(r.book, 'NQ', { tp: 105.6 }, { t: T, price: 103 });
    assert.equal(r.book.positions.NQ.tp, 105.5);
    r = W.modifyPosition(book, 'NQ', { sl: 103.5 }, { t: T, price: 103 });
    assert.deepEqual(types(r.events), ['rejected']);
    assert.equal(r.events[0].reason, 'bad-sl');
    assert.equal(r.book.positions.NQ.sl, 99);
    r = W.modifyPosition(book, 'NQ', { tp: 102 }, { t: T, price: 103 });
    assert.equal(r.events[0].reason, 'bad-tp');
    assert.equal(W.modifyPosition(book, 'ES', { sl: 1 }, { t: T, price: 2 }).events[0].reason, 'no-position');
  });

  test('backtest-B2: walidacja zleceń', async () => {
    const W = await mod();
    const last = { t: T, price: 100 };
    const reason = (o) => W.placeOrder(W.emptyBook(), o, last).events[0].reason;
    assert.equal(reason(long({ qty: 0 })), 'bad-qty');
    assert.equal(reason(long({ qty: 1.5 })), 'bad-qty');
    assert.equal(reason(long({ sl: 101 })), 'bad-sl');
    assert.equal(reason(long({ tp: 99 })), 'bad-tp');
    assert.equal(reason({ instrument: 'NQ', side: 'buy', type: 'limit', price: 101, qty: 1, sl: 99 }), 'bad-price');
    assert.equal(reason({ instrument: 'NQ', side: 'buy', type: 'stop', price: 99, qty: 1, sl: 98 }), 'bad-price');
    assert.equal(reason({ instrument: 'XX', side: 'buy', type: 'market', qty: 1, sl: 98 }), 'bad-instrument');
    // ceny zleceń zaokrąglone do ticka
    const { book } = W.placeOrder(W.emptyBook(), { instrument: 'NQ', side: 'sell', type: 'limit', price: 100.6, qty: 1, sl: 102.1, tp: 98.4 }, last);
    assert.deepEqual([book.orders[0].price, book.orders[0].sl, book.orders[0].tp], [100.5, 102, 98.5]);
    // anulowanie
    assert.equal(W.cancelOrder(book, book.orders[0].id).orders.length, 0);
  });

  test('backtest-B2: zamknięcie na koniec dnia', async () => {
    const W = await mod();
    let b = W.placeOrder(W.emptyBook(), long({ sl: 99 }), { t: T, price: 100 }).book;
    b = W.placeOrder(b, { instrument: 'ES', side: 'buy', type: 'limit', price: 4990, qty: 1, sl: 4980 }, { t: T, price: 5000 }).book;
    const r = W.closeAll(b, 'NQ', { t: T + 600, price: 100.75 }, 'eod');
    assert.deepEqual(types(r.events), ['exit', 'closed']);
    const pos = r.events[1].position;
    assert.equal(pos.exits[0].reason, 'eod');
    assert.equal(pos.exits[0].price, 100.75);
    assert.equal(pos.exitT, T + 600);
    assert.equal(r.book.positions.NQ, null);
    // bez pozycji: koniec dnia anuluje oczekujące zlecenia instrumentu
    const r2 = W.closeAll(r.book, 'ES', { t: T + 600, price: 5000 }, 'eod');
    assert.deepEqual(types(r2.events), ['cancelled']);
    assert.equal(r2.book.orders.length, 0);
  });

  test('backtest-B2: niezmienność', async () => {
    const W = await mod();
    const last = { t: T, price: 100 };
    let b = W.placeOrder(W.emptyBook(), { instrument: 'ES', side: 'buy', type: 'limit', price: 4990, qty: 1, sl: 4980 }, { t: T, price: 5000 }).book;
    b = W.placeOrder(b, long({ qty: 3, sl: 99, tp: 102 }), last).book;
    const st = S(bar(T, 100, 101, 99.5, 100.5), bar(T + 60, 100.5, 102.5, 100, 102));
    const calls = [
      (x) => W.placeOrder(x, long(), last),
      (x) => W.placeOrder(x, { instrument: 'MNQ', side: 'sell', type: 'limit', price: 100.5, qty: 1, sl: 102 }, last),
      (x) => W.cancelOrder(x, x.orders[0].id),
      (x) => W.modifyPosition(x, 'NQ', { sl: 99.5 }, last),
      (x) => W.moveToBE(x, 'NQ', { t: T, price: 100.5 }),
      (x) => W.closePartial(x, 'NQ', 1, last),
      (x) => W.closeAll(x, 'NQ', last, 'manual'),
      (x) => W.advance(x, 'NQ', st, T + 120),
      (x) => W.advance(x, 'ES', st, T + 120),
    ];
    for (const f of calls) {
      const before = JSON.stringify(b);
      f(b);
      assert.equal(JSON.stringify(b), before);
    }
  });
  test('backtest-B2: excursions przy wyjściu ręcznym pomija świecę w budowie', async () => {
    const W = await mod();
    // kursor w środku świecy [T, T+60): świeca ma skrajne high/low, ale jeszcze się nie zakończyła
    const { book } = W.placeOrder(W.emptyBook(), long({ sl: 90 }), { t: T, price: 100 });
    const st = S(bar(T, 100, 105, 95, 100));
    const r = W.closeAll(book, 'NQ', { t: T + 37.5, price: 100 });
    const pos = r.events.find((e) => e.type === 'closed').position;
    assert.deepEqual(W.excursions(pos, st), { maeR: 0, mfeR: 0 });
  });
};
