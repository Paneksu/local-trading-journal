// backtest-L: konto i otwarty wynik jak w FX Replay (public/js/bt-konto.js) oraz przesunięcie zlecenia oczekującego (modifyOrder w bt-wypelnienia.js).
// Dane wyłącznie syntetyczne (ręczne strumienie bazowe { bars, len }). Wyliczenia „ręczne” w komentarzach przy asercjach.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const K = () => imp('public/js/bt-konto.js');
  const W = () => imp('public/js/bt-wypelnienia.js');
  const S = (...bars) => ({ bars, len: bars.map(() => 60) });
  const bar = (t, o, h, l, c) => [t, o, h, l, c, 10];
  const T = 1_710_250_000; // dowolna chwila (sekundy)
  const pos = (o = {}) => ({ id: 'p1', instrument: 'NQ', dir: 'Long', qty: 3, openQty: 3, entryT: T, entryPrice: 18000, sl0: 17990, sl: 17990, tp: 18040, be: false, exits: [], ...o });

  test('backtest-L: otwarty P&L long i short zgodny z ręcznym wyliczeniem (pkt, $, R), z prowizją', async () => {
    const { openPL } = await K();
    // Long 3 NQ @18000, cena 18012,5: +12,5 pkt × 20 $ × 3 = +750 $; ryzyko 10 pkt × 20 × 3 = 600 $ → R = 750 / 600 = 1,25
    assert.deepEqual(openPL(pos(), 18012.5), { pts: 12.5, usd: 750, r: 1.25, fee: 0 });
    // prowizja 2,5 $ za kontrakt (w obie strony): 750 − 3 × 2,5 = 742,5 $; R z cen bez prowizji
    assert.deepEqual(openPL(pos(), 18012.5, { commission: 2.5 }), { pts: 12.5, usd: 742.5, r: 1.25, fee: 7.5 });
    // Short 2 ES @5000, SL 5004, cena 5001,25: −1,25 pkt × 50 × 2 = −125 $; ryzyko 4 × 50 × 2 = 400 $ → R = −0,31 (−0,3125)
    const sh = pos({ instrument: 'ES', dir: 'Short', qty: 2, openQty: 2, entryPrice: 5000, sl0: 5004, sl: 5004, tp: 4990 });
    assert.deepEqual(openPL(sh, 5001.25, { commission: 4 }), { pts: -1.25, usd: -133, r: -0.31, fee: 8 });
    // częściowo zamknięta (1 z 3 wyszedł): otwarty wynik tylko z 2 otwartych, R od pierwotnego ryzyka całej pozycji (600 $)
    const part = pos({ openQty: 2, exits: [{ t: T + 60, price: 18010, qty: 1, reason: 'partial' }] });
    assert.deepEqual(openPL(part, 18006), { pts: 6, usd: 240, r: 0.4, fee: 0 });
    // brak ceny (kursor przed pierwszą świecą): zera, nie NaN
    assert.deepEqual(openPL(pos(), NaN), { pts: 0, usd: 0, r: 0, fee: 0 });
  });

  test('backtest-L: equity = saldo + otwarty P&L, saldo = start + zrealizowany netto, dziś i sesja w $, % i R', async () => {
    const { account } = await K();
    const def = { balance: 50000, commission: 2, riskBase: 'current', risk: { mode: 'pct', value: 1 } };
    // zamknięte: wczoraj +400 $ netto (1 R), dziś −200 $ netto (−0,5 R)
    const trades = [
      { id: 't1', instrument: 'NQ', qty: 2, exitT: T - 86400, pnl: 400, r: 1, exits: [{ t: T - 86400, qty: 2 }] },
      { id: 't2', instrument: 'NQ', qty: 1, exitT: T - 600, pnl: -200, r: -0.5, exits: [{ t: T - 600, qty: 1 }] },
    ];
    // otwarta: Long 3 NQ @18000, 1 kontrakt wyszedł dziś po 18010 (+200 $ brutto, −2 $ prowizji), cena 18005: 2 × 5 × 20 = 200 $ − 2 × 2 = 196 $
    const book = { orders: [], positions: { NQ: pos({ openQty: 2, exits: [{ t: T - 300, price: 18010, qty: 1, reason: 'partial' }] }), ES: null, MES: null, MNQ: null } };
    const a = account({ book, trades, def, last: () => ({ t: T, price: 18005 }), dayStart: T - 3600 });
    // zrealizowany: 400 − 200 + (200 − 2) = 398; saldo 50 398; equity = 50 398 + 196 = 50 594
    assert.equal(a.realized, 398);
    assert.equal(a.balance, 50398);
    assert.equal(a.upl, 196);
    assert.equal(a.equity, 50594);
    assert.equal(a.equity, a.balance + a.upl, 'equity = saldo + otwarty');
    // dziś: −200 + 198 = −2 $; R: −0,5 + (1 × 10 pkt) / (3 × 10 pkt) = −0,5 + 0,33 = −0,17; % od salda na początku dnia (50 400): −0,004%
    assert.equal(a.day.usd, -2);
    assert.equal(a.day.r, -0.17);
    assert.equal(a.day.pct, 0);
    // sesja: 398 $, 398 / 50 000 = 0,796% → 0,8; R: 1 − 0,5 + 0,33 = 0,83
    assert.equal(a.session.usd, 398);
    assert.equal(a.session.pct, 0.8);
    assert.equal(a.session.r, 0.83);
    assert.equal(a.open.length, 1);
    assert.deepEqual([a.open[0].instrument, a.open[0].usd, a.open[0].pts, a.open[0].r], ['NQ', 196, 5, 0.33]);
  });

  test('backtest-L: ryzyko % od bieżącego salda (wybór bieżące / startowe w definicji sesji)', async () => {
    const { riskBalance, riskUsdOf } = await K();
    const trades = [{ id: 't1', pnl: -5000, r: -1, exitT: T, exits: [] }];
    const book = { orders: [], positions: {} };
    assert.equal(riskBalance({ def: { balance: 50000, riskBase: 'current' }, trades, book }), 45000);
    assert.equal(riskBalance({ def: { balance: 50000, riskBase: 'start' }, trades, book }), 50000);
    // [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 2): brak wyboru w starej sesji = bieżące saldo
    assert.equal(riskBalance({ def: { balance: 50000 }, trades, book }), 45000);
    // 1% od 45 000 = 450 $; ryzyko w USD bez zmian
    assert.equal(riskUsdOf({ def: { balance: 50000, risk: { mode: 'pct', value: 1 } }, trades, book }), 450);
    assert.equal(riskUsdOf({ def: { balance: 50000, risk: { mode: 'usd', value: 300 } }, trades, book }), 300);
  });

  test('backtest-L: trade z prowizją: pnl netto, fee zapisane, R z cen', async () => {
    const { toTrade } = await imp('public/js/bt-journal.js');
    const p = pos({ openQty: 0, exits: [{ t: T + 60, price: 18010, qty: 3, reason: 'manual' }] });
    // brutto 10 × 20 × 3 = 600 $, prowizja 3 × 2,5 = 7,5 $ → 592,5 $; R = 10 / 10 = 1
    const tr = toTrade(p, { day: '2024-03-12', commission: 2.5 });
    assert.deepEqual([tr.pnl, tr.fee, tr.r], [592.5, 7.5, 1]);
    const tr0 = toTrade(p, { day: '2024-03-12' });
    assert.deepEqual([tr0.pnl, tr0.fee, tr0.r], [600, 0, 1]);
  });

  test('backtest-L: MAE/MFE otwartej pozycji tylko ze świec zakończonych do chwili bieżącej', async () => {
    const { liveExcursions } = await K();
    const st = S(bar(T, 18000, 18004, 17998, 18002), bar(T + 60, 18002, 18008, 18001, 18006), bar(T + 120, 18006, 18030, 17970, 18000));
    // do T+120: MFE = (18008 − 18000) / 10 = 0,8; MAE = (17998 − 18000) / 10 = −0,2. Trzecia świeca (z bufora danych, po kursorze) nie liczy się.
    assert.deepEqual(liveExcursions(pos(), st, T + 120), { maeR: -0.2, mfeR: 0.8 });
    assert.deepEqual(liveExcursions(pos(), st, T + 180), { maeR: -3, mfeR: 3 });
    const tr = (await K()).createExcursionTracker();
    assert.deepEqual(tr.get(pos(), st, T + 60), { maeR: -0.2, mfeR: 0.4 });
    assert.deepEqual(tr.get(pos(), st, T + 120), { maeR: -0.2, mfeR: 0.8 }, 'przyrostowo');
    assert.deepEqual(tr.get(pos(), st, T + 60), { maeR: -0.2, mfeR: 0.4 }, 'cofnięcie liczy od nowa');
  });

  test('backtest-L: przeciągnięcie zlecenia oczekującego (modifyOrder): cena, SL i TP z walidacją strony rynku', async () => {
    const E = await W();
    const last = { t: T, price: 18000 };
    let { book } = E.placeOrder(E.emptyBook(), { instrument: 'NQ', side: 'buy', type: 'limit', price: 17990, qty: 2, sl: 17980, tp: 18010 }, last);
    const id = book.orders[0].id;
    let r = E.modifyOrder(book, id, { price: 17985.1 }, last);
    assert.deepEqual(r.events, []);
    assert.equal(r.book.orders[0].price, 17985, 'cena do ticka 0,25');
    assert.equal(r.book.orders[0].sl, 17980, 'SL bez zmian');
    r = E.modifyOrder(r.book, id, { sl: 17970, tp: 18020 }, last);
    assert.deepEqual([r.book.orders[0].sl, r.book.orders[0].tp], [17970, 18020]);
    // kupno limit powyżej rynku: odrzucone, zlecenie bez zmian
    const bad = E.modifyOrder(r.book, id, { price: 18005 }, last);
    assert.equal(bad.events[0].reason, 'bad-price');
    assert.equal(bad.book.orders[0].price, 17985);
    // SL nad ceną zlecenia (long): odrzucone
    assert.equal(E.modifyOrder(r.book, id, { sl: 17990 }, last).events[0].reason, 'bad-sl');
    // cofnięty kursor (przed znakiem wodnym): odrzucone jak każda akcja handlu
    const adv = E.advance(r.book, 'NQ', S(bar(T, 18000, 18001, 17999, 18000)), T + 60);
    assert.equal(E.modifyOrder(adv.book, id, { price: 17980 }, { t: T, price: 18000 }).events[0].reason, 'rewound');
    assert.equal(E.modifyOrder(r.book, 'o999', { price: 17980 }, last).events[0].reason, 'no-order');
  });

  test('backtest-L: kreator: prowizja $ za kontrakt (domyślnie 0) i podstawa ryzyka % (domyślnie bieżące saldo)', async () => {
    const { readDef } = await imp('public/js/bt-kreator.js');
    const base = { name: 'X', instruments: ['NQ'], from: '2024-03-12', balance: 50000, riskMode: 'pct', risk: 1, startTime: '09:00' };
    const a = readDef(base);
    assert.deepEqual([a.def.commission, a.def.riskBase, Object.keys(a.err).length], [0, 'current', 0]);
    const b = readDef({ ...base, commission: '2.5', riskBase: 'start' });
    assert.deepEqual([b.def.commission, b.def.riskBase], [2.5, 'start']);
    assert.ok(readDef({ ...base, commission: '-1' }).err.commission, 'ujemna prowizja odrzucona');
    const { copyDef, defFromCopy } = await imp('public/js/bt-czas.js');
    assert.deepEqual([defFromCopy(copyDef(b.def)).commission, defFromCopy(copyDef(b.def)).riskBase], [2.5, 'start'], 'kopia definicji niesie prowizję i podstawę');
    assert.ok(!('commission' in copyDef(a.def)), 'domyślne wartości nie zmieniają kopii sprzed L');
  });

  test('backtest-L: zamknięcie procentem pozycji: zaokrąglenie do całych kontraktów', async () => {
    const { pctQty } = await K();
    assert.deepEqual([25, 50, 75, 100].map((p) => pctQty(4, p)), [1, 2, 3, 4]);
    assert.deepEqual([25, 50, 75, 100].map((p) => pctQty(3, p)), [1, 2, 2, 3]);
    assert.deepEqual([25, 50, 75, 100].map((p) => pctQty(1, p)), [1, 1, 1, 1]);
  });
};
