// backtest-171 (model): pakiet 1.7-1 „Pozycja na wykresie”, wspólny model pozycji 1.7 (docs/plany/backtest/1.7.0/model-pozycji-1-7.md).
// Testy czyste (Node): migracja księgi 1.6 → 3, R od pierwszego SL (P5), usuwanie SL i TP (P6), BE bez SL (31.10), at/basis, partialPlan, Notion tradeInput, statystyki bez R,
// kopia pliku sesji 1.6 przy pierwszym zapisie. Dane wyłącznie syntetyczne, zero sieci.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const mod = () => imp('public/js/bt-wypelnienia.js');
  const T = 1000;
  const S = (...bars) => ({ bars: bars.map((b) => (Array.isArray(b[0]) ? b[0] : b)), len: bars.map((b) => (Array.isArray(b[0]) ? b[1] : 60)) });
  const bar = (t, o, h, l, c) => [t, o, h, l, c, 10];
  const types = (ev) => ev.map((e) => e.type);
  const long = (extra = {}) => ({ instrument: 'NQ', side: 'buy', type: 'market', qty: 1, sl: 99, tp: null, ...extra });
  const closed = (r) => r.events.find((e) => e.type === 'closed')?.position;
  const copy = (x) => JSON.parse(JSON.stringify(x));

  // księga w kształcie 1.6.x: pozycja bez fills, log, tps, sl0T (qty 4, 3 otwarte, jedno wyjście częściowe)
  const legacyBook = (pos = {}) => ({
    orders: [{ id: 'o2', instrument: 'ES', side: 'buy', type: 'limit', price: 4990, qty: 1, sl: 4980, tp: 5010, placedT: 1000 }],
    positions: {
      ES: null,
      NQ: { id: 'p1', instrument: 'NQ', dir: 'Long', qty: 4, openQty: 3, entryT: 1000, entryPrice: 100, sl0: null, sl: 99, tp: 103, be: false, exits: [{ t: 1060, price: 101, qty: 1, reason: 'partial' }], orderId: 'o1', ...pos },
      MES: null, MNQ: null,
    },
    hw: 1200, hwi: { NQ: 1200 }, seq: 2,
  });
  const legacySession = (book) => ({ v: 2, id: 'bt-abc123', rev: 3, name: 'S', def: { instruments: ['NQ', 'ES'], from: '2024-03-12', balance: 50000, risk: { mode: 'usd', value: 500 } }, cursor: 1200, hw: 1200, layout: { kind: '1', charts: [{ instrument: 'NQ', tf: '1m' }], active: 0 }, book, trades: [], drawings: {}, v1: null });

  test('backtest-171: migracja księgi 1.6 → 3 jest idempotentna i zachowuje lustro', async () => {
    const { migrateSession } = await imp('public/js/bt-sesja.js');
    const doc = legacySession(legacyBook());
    const before = copy(doc);
    const m1 = migrateSession(doc);
    assert.deepEqual(doc, before, 'migrateSession nie mutuje wejścia');
    assert.deepEqual(migrateSession(m1), m1, 'idempotentna');
    assert.equal(m1.v, 2, 'sesja zostaje v: 2');
    assert.equal(m1.book.v, 3);
    // [U] 3.11.2026 «wywalamy to cofniecie czasu usuwa trade, zbedne, mam usuwanie juz manualne wiec jak bede chcial to usune» (pakiet 6 odwołany): book.gone i order.hist nie są zapisywane (odbiór 1.7.0, P2-1)
    assert.ok(!('gone' in m1.book), 'migracja nie tworzy book.gone');
    const p = m1.book.positions.NQ, o = before.book.positions.NQ;
    for (const k of ['entryPrice', 'qty', 'openQty', 'sl', 'tp', 'entryT', 'dir', 'id']) assert.equal(p[k], o[k], `lustro: ${k}`);
    assert.deepEqual(p.fills, [{ t: 1000, at: 1000, price: 100, qty: 4, orderId: 'o1', slRef: 99 }], 'jedna porcja; slRef = pierwszy znany SL (P5)');
    assert.deepEqual(p.exits, [{ t: 1060, at: 1060, price: 101, qty: 1, reason: 'partial', basis: 100 }]);
    assert.deepEqual(p.tps, [{ id: 'tp1', price: 103, pct: 100, hit: null }]);
    assert.deepEqual(p.log, []);
    assert.equal(p.sl0, 99, 'P5: sl0 null i sl ustawiony → sl0 = sl');
    assert.equal(p.sl0T, 1000);
    assert.equal(p.slLast, 99);
    assert.equal(p.rUsd, 4 * 1 * 20);
    assert.equal(p.avg, 100);
    const ord = m1.book.orders[0];
    assert.equal(ord.intent, 'open');
    assert.deepEqual(ord.tps, [{ id: 'tp1', price: 5010, pct: 100, hit: null }]);
    assert.ok(!('hist' in ord), 'migracja nie tworzy order.hist');
    // trade'y nie są przepisywane
    const withTr = { ...doc, trades: [{ id: 't1', r: 1.2, pnl: 100, entryT: 5, exits: [{ t: 6, price: 1, qty: 1, reason: 'tp' }] }] };
    assert.deepEqual(migrateSession(withTr).trades, withTr.trades);
  });

  test('backtest-171: sesja 1.6 z otwartą pozycją: ten sam otwarty wynik i R po migracji', async () => {
    const { migrateSession } = await imp('public/js/bt-sesja.js');
    const K = await imp('public/js/bt-konto.js');
    // sl0 znany (SL przesunięty na BE): wynik i R jak w 1.6
    const a = legacySession(legacyBook({ sl0: 98, sl: 100 }));
    const pa0 = a.book.positions.NQ, pa1 = migrateSession(a).book.positions.NQ;
    const o0 = K.openPL(pa0, 102.5, { commission: 1 }), o1 = K.openPL(pa1, 102.5, { commission: 1 });
    assert.deepEqual(o1, o0);
    assert.equal(pa1.sl0, 98);
    assert.ok(o1.r > 0 && Number.isFinite(o1.r));
    // sl0 brak, sl z rysunku: po otwarciu sl0 = sl i R liczony (a nie „—”)
    const b = migrateSession(legacySession(legacyBook({ sl0: null, sl: 99 }))).book.positions.NQ;
    assert.equal(b.sl0, 99);
    const ob = K.openPL(b, 102, {});
    assert.equal(ob.usd, 2 * 3 * 20);
    assert.equal(ob.r, Math.round(((2 * 3 * 20) / 80) * 100) / 100);
    // konto: te same liczby
    const acc0 = K.account({ book: a.book, trades: [], def: a.def, last: () => ({ price: 102.5 }) });
    const acc1 = K.account({ book: migrateSession(a).book, trades: [], def: a.def, last: () => ({ price: 102.5 }) });
    assert.equal(acc1.upl, acc0.upl);
    assert.equal(acc1.equity, acc0.equity);
  });

  test('backtest-171: R jak w 1.6 dla jednej porcji (częściowe, BE 0, luka poniżej −1)', async () => {
    const W = await mod();
    // częściowe 1 po 101, TP 102: R ważone 1,5 (B2)
    let { book } = W.placeOrder(W.emptyBook(), long({ qty: 2, sl: 99, tp: 102 }), { t: T, price: 100 });
    let r = W.closePartial(book, 'NQ', 1, { t: T, price: 101 });
    r = W.advance(r.book, 'NQ', S(bar(T, 100, 102.5, 99.5, 102)), T + 60);
    const pos = closed(r), res = W.tradeResult(pos);
    assert.equal(res.r, 1.5);
    assert.equal(res.pnl, 60);
    assert.equal(res.exitPrice, 101.5);
    assert.equal(pos.r, 1.5);
    assert.equal(pos.rUsd, 2 * 1 * 20);
    // BE po wejściu: R = 0 (a nie null)
    ({ book } = W.placeOrder(W.emptyBook(), long({ sl: 99, tp: 103 }), { t: T, price: 100 }));
    r = W.moveToBE(book, 'NQ', { t: T + 60, price: 100.75 });
    r = W.advance(r.book, 'NQ', S(bar(T, 100, 101, 99.5, 100.75), bar(T + 60, 100.5, 100.75, 99.75, 100)), T + 120);
    assert.equal(W.tradeResult(closed(r)).r, 0);
    // luka przy stopie: R poniżej −1
    ({ book } = W.placeOrder(W.emptyBook(), long({ sl: 99 }), { t: T, price: 100 }));
    r = W.advance(book, 'NQ', S(bar(T, 100, 100.5, 99.5, 100), bar(T + 60, 97, 97.5, 96, 96.5)), T + 120);
    assert.ok(W.tradeResult(closed(r)).r < -1);
  });

  test('backtest-171: wejście bez SL: R null; pierwszy SL ustawia sl0, sl0T i slRef', async () => {
    const W = await mod();
    let { book } = W.placeOrder(W.emptyBook(), long({ sl: null }), { t: T, price: 100 });
    let p = book.positions.NQ;
    assert.equal(p.sl, null);
    assert.equal(p.sl0, null);
    assert.equal(p.rUsd, null);
    assert.equal(p.fills[0].slRef, null);
    // zamknięcie bez SL → R null
    const c0 = closed(W.closeAll(book, 'NQ', { t: T + 60, price: 101 }, 'manual'));
    assert.equal(W.tradeResult(c0).r, null);
    assert.equal(W.tradeResult(c0).pnl, 20);
    // pierwszy SL
    const r = W.modifyPosition(book, 'NQ', { sl: 98 }, { t: T + 60, price: 100.5 });
    assert.deepEqual(types(r.events), []);
    p = r.book.positions.NQ;
    assert.equal(p.sl, 98);
    assert.equal(p.sl0, 98);
    assert.equal(p.sl0T, T + 60);
    assert.equal(p.slLast, 98);
    assert.equal(p.fills[0].slRef, 98);
    assert.equal(p.rUsd, 40);
    const c1 = closed(W.closeAll(r.book, 'NQ', { t: T + 120, price: 101 }, 'manual'));
    assert.equal(W.tradeResult(c1).r, 0.5);
  });

  test('backtest-171: usunięcie SL nie zmienia R; ponowne postawienie też nie; log ma at', async () => {
    const W = await mod();
    let { book } = W.placeOrder(W.emptyBook(), long({ sl: null }), { t: T, price: 100 });
    let r = W.modifyPosition(book, 'NQ', { sl: 90 }, { t: T + 10, price: 100 });
    assert.equal(r.book.positions.NQ.rUsd, 200);
    // przesunięcie SL nie zmienia R
    r = W.modifyPosition(r.book, 'NQ', { sl: 95 }, { t: T + 20, price: 100 });
    assert.equal(r.book.positions.NQ.rUsd, 200);
    // P6: usunięcie SL
    r = W.modifyPosition(r.book, 'NQ', { sl: null }, { t: T + 30, price: 100 });
    assert.deepEqual(types(r.events), []);
    let p = r.book.positions.NQ;
    assert.equal(p.sl, null);
    assert.equal(p.sl0, 90);
    assert.equal(p.slLast, 95);
    assert.equal(p.rUsd, 200);
    r = W.modifyPosition(r.book, 'NQ', { sl: 98 }, { t: T + 40, price: 100 });
    p = r.book.positions.NQ;
    assert.equal(p.sl0, 90, 'R zostaje od pierwszego SL');
    assert.equal(p.rUsd, 200);
    assert.deepEqual(p.log.map((e) => [e.k, e.v, e.at]), [['sl', 90, T + 10], ['sl', 95, T + 20], ['sl', null, T + 30], ['sl', 98, T + 40]]);
    const res = W.tradeResult(closed(W.closeAll(r.book, 'NQ', { t: T + 60, price: 110 }, 'manual')));
    assert.equal(res.r, 1);
    // trzy wpisy: postawienie, usunięcie, ponowne postawienie
    const q = W.modifyPosition(W.modifyPosition(W.modifyPosition(book, 'NQ', { sl: 90 }, { t: 1, price: 100 }).book, 'NQ', { sl: null }, { t: 2, price: 100 }).book, 'NQ', { sl: 95 }, { t: 3, price: 100 }).book.positions.NQ;
    assert.equal(q.log.length, 3);
    assert.ok(q.log.every((e) => Number.isFinite(e.at)));
  });

  test('backtest-171: usunięcie TP: tp null, tps puste; trade ma tp null', async () => {
    const W = await mod();
    const { toTrade } = await imp('public/js/bt-journal.js');
    let { book } = W.placeOrder(W.emptyBook(), long({ sl: 99, tp: 105 }), { t: T, price: 100 });
    assert.deepEqual(book.positions.NQ.tps, [{ id: 'tp1', price: 105, pct: 100, hit: null }]);
    const r = W.modifyPosition(book, 'NQ', { tp: null }, { t: T + 5, price: 100 });
    const p = r.book.positions.NQ;
    assert.equal(p.tp, null);
    assert.deepEqual(p.tps, []);
    assert.equal(p.log.at(-1).k, 'tps');
    const c = closed(W.closeAll(r.book, 'NQ', { t: T + 60, price: 101 }, 'manual'));
    const tr = toTrade(c, { day: '2024-03-12', stream: null, trades: [] });
    assert.equal(tr.tp, null);
    assert.equal(tr.sl0, 99);
    // TP trafiony zostaje w tps jako ostatni cel
    const hit = closed(W.advance(W.placeOrder(W.emptyBook(), long({ sl: 99, tp: 101 }), { t: T, price: 100 }).book, 'NQ', S(bar(T, 100, 100.5, 99.75, 100.25), bar(T + 60, 100.25, 101.5, 100, 101.25)), T + 120));
    assert.equal(hit.exits[0].reason, 'tp');
    assert.equal(toTrade(hit, { day: '2024-03-12', trades: [] }).tp, 101);
    assert.deepEqual(hit.tps[0].hit, { at: T + 120, qty: 1 });
    // zmiana TP
    const mv = W.modifyPosition(book, 'NQ', { tp: 106.1 }, { t: T, price: 100 });
    assert.equal(mv.book.positions.NQ.tp, 106);
    assert.equal(mv.book.positions.NQ.tps.length, 1);
  });

  test('backtest-171: BE bez SL po stronie zysku ustawia SL; po stronie straty bad-sl', async () => {
    const W = await mod();
    const { book } = W.placeOrder(W.emptyBook(), long({ sl: null }), { t: T, price: 100 });
    let r = W.moveToBE(book, 'NQ', { t: T + 60, price: 101 });
    assert.deepEqual(types(r.events), []);
    let p = r.book.positions.NQ;
    assert.equal(p.sl, 100);
    assert.equal(p.be, true);
    assert.equal(p.sl0, 100);
    // strona straty: odrzucone, księga bez zmian
    r = W.moveToBE(book, 'NQ', { t: T + 60, price: 99 });
    assert.equal(r.events[0].reason, 'bad-sl');
    assert.equal(r.book.positions.NQ.sl, null);
    // Short po stronie zysku
    const sh = W.placeOrder(W.emptyBook(), { instrument: 'NQ', side: 'sell', type: 'market', qty: 1, sl: null }, { t: T, price: 100 }).book;
    assert.equal(W.moveToBE(sh, 'NQ', { t: T + 60, price: 99 }).book.positions.NQ.sl, 100);
    assert.equal(W.moveToBE(sh, 'NQ', { t: T + 60, price: 101 }).events[0].reason, 'bad-sl');
    // stan przycisku: powód nieaktywności
    assert.deepEqual(W.beState(book, 'NQ', { t: T, price: 99 }), { ok: false, why: 'below' });
    assert.deepEqual(W.beState(sh, 'NQ', { t: T, price: 101 }), { ok: false, why: 'above' });
    assert.deepEqual(W.beState(book, 'NQ', { t: T, price: 101 }), { ok: true, why: null });
    assert.deepEqual(W.beState(W.moveToBE(book, 'NQ', { t: T, price: 101 }).book, 'NQ', { t: T, price: 102 }), { ok: false, why: 'already' });
    // średnia nie na ticku: poziom BE w stronę zysku
    const odd = { ...book, positions: { ...book.positions, NQ: { ...book.positions.NQ, fills: [{ ...book.positions.NQ.fills[0], price: 100.125 }] } } };
    assert.equal(W.beLevel(W.derive(odd.positions.NQ)), 100.25);
    // offset (pakiet 3, tu tylko parametr)
    assert.equal(W.moveToBE(book, 'NQ', { t: T + 60, price: 102 }, { offsetTicks: 2 }).book.positions.NQ.sl, 100.5);
  });

  test('backtest-171: BE bez SL: rUsd 0 → R null z powodem', async () => {
    const W = await mod();
    const { book } = W.placeOrder(W.emptyBook(), long({ sl: null }), { t: T, price: 100 });
    const r = W.moveToBE(book, 'NQ', { t: T + 60, price: 101 });
    assert.equal(r.book.positions.NQ.rUsd, 0);
    const c = closed(W.closeAll(r.book, 'NQ', { t: T + 120, price: 102 }, 'manual'));
    const res = W.tradeResult(c);
    assert.equal(res.r, null);
    assert.equal(res.rWhy, 'zero-risk');
    assert.equal(res.pnl, 40);
    // bez SL w ogóle: powód no-sl
    assert.equal(W.tradeResult(closed(W.closeAll(book, 'NQ', { t: T + 60, price: 101 }, 'manual'))).rWhy, 'no-sl');
  });

  test('backtest-171: wyjście z silnika ma at = koniec świecy, a akcja użytkownika at = last.t', async () => {
    const W = await mod();
    // SL z silnika
    const { book } = W.placeOrder(W.emptyBook(), long({ qty: 2, sl: 99, tp: 105 }), { t: T, price: 100 });
    assert.equal(book.positions.NQ.fills[0].at, T);
    let r = W.closePartial(book, 'NQ', 1, { t: T + 120, price: 101 });
    const ex = r.book.positions.NQ.exits[0];
    assert.deepEqual([ex.t, ex.at, ex.basis], [T + 120, T + 120, 100]);
    r = W.advance(r.book, 'NQ', S(bar(T, 100, 100.5, 99.5, 100.25), bar(T + 60, 100, 100.5, 99.5, 100.25), bar(T + 120, 100.25, 100.5, 98.5, 99)), T + 180);
    const pos = closed(r);
    const last = pos.exits[1];
    assert.deepEqual([last.reason, last.t, last.at, last.basis], ['sl', T + 120, T + 180, 100]);
    // wejście limit z silnika: t = początek świecy, at = koniec
    const lim = W.placeOrder(W.emptyBook(), { instrument: 'NQ', side: 'buy', type: 'limit', price: 99.5, qty: 1, sl: 95 }, { t: T, price: 100 });
    const f = W.advance(lim.book, 'NQ', S(bar(T, 100, 100.25, 99, 99.75)), T + 60).book.positions.NQ.fills[0];
    assert.deepEqual([f.t, f.at], [T, T + 60]);
    // zlecenie oczekujące nie niesie hist (odbiór 1.7.0)
    assert.ok(!('hist' in lim.book.orders[0]));
    assert.equal(lim.book.orders[0].intent, 'open');
  });

  test('backtest-171: partialPlan: od pozostałej i od pierwotnej, 25/50/75/100, ilość, przycięcie do reszty, kwota netto', async () => {
    const { partialPlan } = await imp('public/js/bt-konto.js');
    const base = { qty: 10, openQty: 6, price: 101, avg: 100, dir: 'Long', instrument: 'NQ', commission: 0 };
    assert.deepEqual(partialPlan({ ...base, base: 'open', pct: 25 }), { n: 2, of: 6, usd: 2 * 1 * 20, all: false });
    assert.deepEqual(partialPlan({ ...base, base: 'open', pct: 50 }), { n: 3, of: 6, usd: 60, all: false });
    assert.deepEqual(partialPlan({ ...base, base: 'open', pct: 75 }), { n: 5, of: 6, usd: 100, all: false });
    assert.deepEqual(partialPlan({ ...base, base: 'open', pct: 100 }), { n: 6, of: 6, usd: 120, all: true });
    // od pierwotnej: 75% z 10 = 8 > 6 → cała reszta (karta, krawędź 12)
    assert.deepEqual(partialPlan({ ...base, base: 'orig', pct: 75 }), { n: 6, of: 6, usd: 120, all: true });
    assert.deepEqual(partialPlan({ ...base, base: 'orig', pct: 25 }), { n: 3, of: 6, usd: 60, all: false });
    // wpisana ilość, przycięta do 1..openQty
    assert.equal(partialPlan({ ...base, n: 4 }).n, 4);
    assert.equal(partialPlan({ ...base, n: 99 }).n, 6);
    assert.equal(partialPlan({ ...base, n: 99 }).all, true);
    assert.equal(partialPlan({ ...base, n: 0 }).n, 1);
    // kwota netto: Short w zysku i prowizja za kontrakt
    const sh = partialPlan({ ...base, dir: 'Short', price: 99, avg: 100, commission: 2.5, base: 'open', pct: 50 });
    assert.equal(sh.usd, 3 * 1 * 20 - 3 * 2.5);
    // 1 kontrakt: nie może zamknąć 0
    assert.equal(partialPlan({ qty: 1, openQty: 1, price: 101, avg: 100, dir: 'Long', instrument: 'NQ', base: 'open', pct: 25 }).n, 1);
    // zgodność z pctQty
    const { pctQty } = await imp('public/js/bt-konto.js');
    for (const [o, p] of [[6, 25], [7, 50], [10, 75], [3, 100]]) assert.equal(partialPlan({ ...base, qty: o, openQty: o, base: 'open', pct: p }).n, pctQty(o, p));
  });

  test('backtest-171: tradeInput: sl = pierwszy SL, pusty bez SL; tp przy zamknięciu; r pusty przy R null', async () => {
    const W = await mod();
    const { toTrade } = await imp('public/js/bt-journal.js');
    const { tradeInput } = await imp('lib/backtest-sync.mjs');
    const sess = { id: 'bt-abc123', name: 'S', def: {} };
    const mk = (pos) => ({ ...toTrade(pos, { day: '2024-03-12', trades: [], id: 't1' }), entryT: 1710240000, exitT: 1710240060 });
    // bez SL nigdy: sl pusty, r pusty, tp pusty
    let { book } = W.placeOrder(W.emptyBook(), long({ sl: null, qty: 2 }), { t: T, price: 100 });
    let inp = tradeInput(sess, mk(closed(W.closeAll(book, 'NQ', { t: T + 60, price: 101 }, 'manual'))));
    assert.equal('sl' in inp, false);
    assert.equal('r' in inp, false);
    assert.equal('tp' in inp, false);
    assert.equal(inp.pnl, 40);
    // SL postawiony po wejściu 98, przesunięty na 99,5, usunięty, TP 103 zostaje: sl = pierwszy (98), r z rUsd
    book = W.modifyPosition(book, 'NQ', { sl: 98, tp: 103 }, { t: T + 10, price: 100 }).book;
    book = W.modifyPosition(book, 'NQ', { sl: 99.5 }, { t: T + 20, price: 100 }).book;
    book = W.modifyPosition(book, 'NQ', { sl: null }, { t: T + 30, price: 100 }).book;
    inp = tradeInput(sess, mk(closed(W.closeAll(book, 'NQ', { t: T + 60, price: 101 }, 'manual'))));
    assert.equal(inp.sl, 98);
    assert.equal(inp.tp, 103);
    assert.equal(inp.r, 0.5);
    assert.equal('be' in inp, false);
    // TP usunięty przed zamknięciem: pole puste
    const book2 = W.modifyPosition(book, 'NQ', { tp: null }, { t: T + 40, price: 100 }).book;
    inp = tradeInput(sess, mk(closed(W.closeAll(book2, 'NQ', { t: T + 60, price: 101 }, 'manual'))));
    assert.equal('tp' in inp, false);
    // SL na BE przy zamknięciu: pole „BE” w Notion = cena bieżąca w chwili ręcznego BE (zmiana pakietu 1.7-3, słowa użytkownika 2.11.2026: pole znaczy cenę, przy której trade jest bez ryzyka;
    // do 1.7-2 szła tu cena wejścia / poziom BE, 100); SL zamknięcia nadal stoi na poziomie BE
    const be = W.moveToBE(W.placeOrder(W.emptyBook(), long({ sl: 99 }), { t: T, price: 100 }).book, 'NQ', { t: T + 10, price: 101 }).book;
    inp = tradeInput(sess, mk(closed(W.advance(be, 'NQ', S(bar(T, 100, 100.5, 99.5, 100), bar(T + 60, 100, 100.5, 99.5, 100)), T + 120))));
    assert.equal(inp.be, 101);
    assert.equal(inp.sl, 99);
    assert.equal(inp.r, 0);
  });

  test('backtest-171: statystyki: trade bez R liczy się w $ i liczbie, nie w R', async () => {
    const S2 = await imp('public/js/bt-staty.js');
    const mkT = (id, r, pnl) => ({ id, r, pnl, entryT: 1711000000 + Number(id.slice(1)) * 60, day: '2024-03-21', instrument: 'NQ', dir: 'Long', exits: [{ t: 1, price: 1, qty: 1, reason: 'manual' }] });
    const sessions = [{ id: 'bt-abc123', name: 'S', trades: [mkT('t1', 1.5, 300), mkT('t2', null, 120), mkT('t3', -1, -200)] }];
    const all = S2.mergeBacktest([], sessions);
    assert.equal(all.length, 3, 'wszystkie trade\'y z pnl wchodzą');
    const s = S2.summary(all);
    assert.equal(s.n, 3);
    assert.equal(s.nR, 2, 'metryki R tylko z trade\'ów z R');
    assert.equal(s.sumR, 0.5);
    assert.equal(s.noR, 1, 'licznik „bez R”');
    assert.equal(all.reduce((a, x) => a + (x.pnl || 0), 0), 220);
    // bez pnl i bez R trade nie jest zamknięty
    assert.equal(S2.mergeBacktest([], [{ id: 'bt-abc123', trades: [{ id: 't9', r: null, pnl: null, entryT: 5 }] }]).length, 0);
    // wykonanie i porównanie z Live nie przewracają się na null
    assert.doesNotThrow(() => S2.execution(all));
  });

  test('backtest-171: magazyn: kopia pliku 1.6 przy pierwszym zapisie, raz', async () => {
    const { createBacktestStore } = await imp('lib/backtest-store.mjs');
    const dir = H.tmp();
    const sdir = path.join(dir, 'backtest', 'sessions');
    mkdirSync(sdir, { recursive: true });
    const id = 'bt-abc123';
    const raw = JSON.stringify({ ...legacySession(legacyBook()), rev: 4 });
    writeFileSync(path.join(sdir, `${id}.json`), raw);
    const store = createBacktestStore({ baseDir: dir, log: () => {} });
    const doc = store.read(id);
    assert.equal(doc.book.v, 3, 'odczyt migruje księgę');
    const kopia = path.join(sdir, 'kopie-1.6', `${id}.json`);
    assert.equal(existsSync(kopia), false, 'odczyt niczego nie zapisuje');
    assert.deepEqual(readdirSync(sdir).filter((f) => f.endsWith('.json')), [`${id}.json`]);
    store.save(id, { ...doc, name: 'po zapisie' }, 4);
    assert.equal(readFileSync(kopia, 'utf8'), raw, 'kopia = bajty pliku sprzed migracji');
    assert.equal(JSON.parse(readFileSync(path.join(sdir, `${id}.json`), 'utf8')).book.v, 3);
    // drugi zapis nie nadpisuje kopii
    store.save(id, { ...doc, name: 'drugi zapis' }, 5);
    assert.equal(readFileSync(kopia, 'utf8'), raw);
    // lista i statystyki nie widzą katalogu kopii
    assert.equal(store.list().length, 1);
    // nowa sesja 1.7 (bez poprzedniego pliku) nie dostaje kopii
    const id2 = 'bt-newone1';
    store.save(id2, { v: 2, def: { instruments: ['NQ'] }, book: (await mod()).emptyBook(), trades: [] }, 0);
    store.save(id2, { v: 2, def: { instruments: ['NQ'] }, book: (await mod()).emptyBook(), trades: [] }, 1);
    assert.equal(existsSync(path.join(sdir, 'kopie-1.6', `${id2}.json`)), false);
  });

  test('backtest-171: niezmienność: funkcje silnika nie mutują wejścia', async () => {
    const W = await mod();
    const last = { t: T, price: 100.5 };
    let b = W.placeOrder(W.emptyBook(), { instrument: 'ES', side: 'buy', type: 'limit', price: 4990, qty: 1, sl: 4980 }, { t: T, price: 5000 }).book;
    b = W.placeOrder(b, long({ qty: 3, sl: null, tp: 102 }), last).book;
    const st = S(bar(T, 100, 101, 99.5, 100.5), bar(T + 60, 100.5, 102.5, 100, 102));
    const calls = [
      (x) => W.modifyPosition(x, 'NQ', { sl: 99.5 }, last),
      (x) => W.modifyPosition(x, 'NQ', { sl: null, tp: null }, last),
      (x) => W.moveToBE(x, 'NQ', { t: T, price: 101 }),
      (x) => W.moveToBE(x, 'NQ', { t: T, price: 99 }),
      (x) => W.closePartial(x, 'NQ', 1, last),
      (x) => W.closeAll(x, 'NQ', last, 'manual'),
      (x) => W.advance(x, 'NQ', st, T + 120),
      (x) => W.beState(x, 'NQ', last),
      (x) => W.derive(x.positions.NQ),
      (x) => W.migrateBook(x),
    ];
    for (const f of calls) {
      const before = JSON.stringify(b);
      f(b);
      assert.equal(JSON.stringify(b), before);
    }
    // migrateBook jest idempotentna i na księdze 1.6
    const lb = legacyBook();
    const m = W.migrateBook(lb);
    assert.deepEqual(W.migrateBook(m), m);
    assert.deepEqual(W.derive(m.positions.NQ), m.positions.NQ, 'derive jest stabilne');
  });
};
