// backtest-172 (silnik): pakiet 1.7-2 „Dokładanie i odwracanie” (docs/plany/backtest/1.7.0/etap-1-7-2-dokladanie-odwracanie.md, model-pozycji-1-7.md §3, §4).
// Testy czyste (Node): dokładki (średni koszt, jeden SL, rUsd), netting przeciwnym zleceniem, reversePosition, kolejność w świecy, anulowanie zleceń oczekujących,
// niezmiennik wyniku (test własności na 200 losowych ciągach, ziarno stałe), MAE/MFE z dokładkami, prowizja, konto, Notion (średnie ceny). Dane syntetyczne, zero sieci.
// Każda asercja ma wartość policzoną na papierze (komentarz) albo niezależny wzorzec liczony w teście, żadnych OR-ów ani gałęzi „pominięte = zdane”.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const mod = () => imp('public/js/bt-wypelnienia.js');
  const T = 1000;
  const S = (...bars) => ({ bars, len: bars.map(() => 60) });
  const bar = (t, o, h, l, c) => [t, o, h, l, c, 10];
  const types = (ev) => ev.map((e) => e.type);
  const MK = (side, extra = {}) => ({ instrument: 'NQ', side, type: 'market', qty: 1, sl: null, tp: null, ...extra });
  const closedOf = (r) => r.events.find((e) => e.type === 'closed')?.position;
  const last = (t, price) => ({ t, price });

  // Long 2 @100 z SL 99 (rUsd 40 $)
  const long2 = async () => {
    const W = await mod();
    const { book } = W.placeOrder(W.emptyBook(), MK('buy', { qty: 2, sl: 99 }), last(T, 100));
    return { W, book };
  };

  test('backtest-172: dokładka market: średni koszt, qty, openQty, rUsd; SL i TP pozycji bez zmian', async () => {
    const { W, book } = await long2();
    // dokładka dostaje z panelu inny SL i TP: nie zmieniają SL/TP pozycji (decyzja gustu G-2.2)
    const r = W.placeOrder(book, MK('buy', { qty: 2, sl: 90, tp: 120 }), last(T + 60, 101));
    assert.deepEqual(types(r.events), ['filled']);
    assert.equal(r.events[0].add, true, 'zdarzenie oznacza dokładkę');
    const p = r.book.positions.NQ;
    assert.equal(p.qty, 4);
    assert.equal(p.openQty, 4);
    assert.equal(p.fills.length, 2);
    assert.equal(p.avg, 100.5, '(2·100 + 2·101) / 4');
    assert.equal(p.entryPrice, 100.5);
    assert.equal(p.sl, 99, 'SL pozycji bez zmian');
    assert.equal(p.tp, null, 'TP pozycji bez zmian (brak)');
    assert.equal(p.fills[1].slRef, 99);
    assert.equal(p.rUsd, 2 * 1 * 20 + 2 * 2 * 20, '40 + 80 = 120 $');
    const { riskNow } = await imp('public/js/bt-ksiega.js');
    assert.equal(riskNow(p), 120, 'ryzyko teraz = |100,5 − 99| · 4 · 20');
    assert.equal(r.book.orders.length, 0);
  });

  test('backtest-172: dokładka po wyjściu częściowym: avg 110, entryPrice trade\'a 106,67, niezmiennik kosztu', async () => {
    const { W, book } = await long2();
    let r = W.closePartial(book, 'NQ', 1, last(T + 60, 110));
    r = W.placeOrder(r.book, MK('buy', { qty: 1 }), last(T + 120, 120));
    const p = r.book.positions.NQ;
    assert.equal(p.avg, 110, 'po wyjściu zostaje 1@100, dokładka 1@120');
    assert.equal(p.openQty, 2);
    assert.equal(p.qty, 3);
    r = W.closeAll(r.book, 'NQ', last(T + 180, 130), 'manual');
    const c = closedOf(r);
    const res = W.tradeResult(c);
    assert.equal(res.entryAvg, 106.666667, '(2·100 + 120) / 3');
    assert.equal(res.exitPrice, 123.333333, '(110 + 2·130) / 3');
    assert.equal(res.pnl, 1000, '1·(110−100)·20 + 2·(130−110)·20 = 200 + 800');
    const inCost = c.fills.reduce((a, f) => a + f.qty * f.price, 0), outCost = c.exits.reduce((a, e) => a + e.qty * e.basis, 0);
    assert.equal(outCost, inCost, 'niezmiennik: Σ wyjście·basis = Σ wejście·cena (320)');
    assert.equal(inCost, 320);
    assert.equal(res.r, Math.round((1000 / 460) * 100) / 100, 'rUsd = 2·1·20 + 1·21·20 = 460');
  });

  test('backtest-172: wyjście i dokładka w tej samej chwili: kolejność zdarzeń z seq (wyjście przed dokładką)', async () => {
    const { W, book } = await long2();
    let r = W.closePartial(book, 'NQ', 1, last(T + 60, 110));
    r = W.placeOrder(r.book, MK('buy', { qty: 1 }), last(T + 60, 120));
    // wyjście wykonane pierwsze: zostaje 1@100, potem 1@120 → 110 (gdyby dokładka była liczona przed wyjściem: 106,67)
    assert.equal(r.book.positions.NQ.avg, 110);
    const back = W.derive(JSON.parse(JSON.stringify(r.book.positions.NQ)));
    assert.equal(back.avg, 110, 'derive jest idempotentne po serializacji');
  });

  // generator pseudolosowy z ziarnem (mulberry32)
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  test('backtest-172: własność: pnl = (średnia wyjść − średnia wejść)·Q·MULT dla 200 losowych ciągów wejść i wyjść (ziarno stałe)', async () => {
    const W = await mod();
    const rnd = rng(172);
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    let withAdds = 0, withPartials = 0, netted = 0;
    for (let n = 0; n < 200; n++) {
      const inst = ['NQ', 'ES', 'MNQ', 'MES'][ri(0, 3)], m = W.MULT[inst], dir = rnd() < 0.5 ? 1 : -1;
      const side = dir > 0 ? 'buy' : 'sell', opp = dir > 0 ? 'sell' : 'buy';
      let t = T, px = 18000 + ri(0, 400) * 0.25;
      const px1 = () => { px += ri(-40, 40) * 0.25; return px; };
      let { book } = W.placeOrder(W.emptyBook(), { instrument: inst, side, type: 'market', qty: ri(1, 5), sl: null }, last(t, px));
      // niezależny wzorzec: średni koszt liczony w teście
      let oq = book.positions[inst].qty, oavg = px, realized = 0, inQty = oq, inSum = oq * px, outQty = 0, outSum = 0;
      const steps = ri(1, 8);
      for (let k = 0; k < steps; k++) {
        t += rnd() < 0.2 ? 0 : 60;
        const p = px1(), op = ri(0, 2);
        if (op === 0 || oq === 1) {
          const q = ri(1, 4);
          book = W.placeOrder(book, { instrument: inst, side, type: 'market', qty: q, sl: null }, last(t, p)).book;
          oavg = (oq * oavg + q * p) / (oq + q); oq += q; inQty += q; inSum += q * p; withAdds++;
        } else if (op === 1) {
          const q = ri(1, oq - 1);
          book = W.closePartial(book, inst, q, last(t, p)).book;
          realized += (p - oavg) * dir * q * m; oq -= q; outQty += q; outSum += q * p; withPartials++;
        } else {
          // netting: przeciwne zlecenie mniejsze od otwartej ilości
          const q = ri(1, oq - 1);
          const r = W.placeOrder(book, { instrument: inst, side: opp, type: 'market', qty: q, sl: null }, last(t, p));
          assert.deepEqual(types(r.events), ['exit'], 'netting mniejszego zlecenia daje samo wyjście');
          book = r.book;
          realized += (p - oavg) * dir * q * m; oq -= q; outQty += q; outSum += q * p; netted++;
        }
      }
      t += 60;
      const pf = px1();
      const closing = rnd() < 0.5 ? W.closeAll(book, inst, last(t, pf), 'manual') : W.placeOrder(book, { instrument: inst, side: opp, type: 'market', qty: oq, sl: null }, last(t, pf));
      realized += (pf - oavg) * dir * oq * m; outQty += oq; outSum += oq * pf;
      const c = closedOf(closing);
      assert.ok(c, `ciąg ${n}: pozycja zamknięta`);
      const res = W.tradeResult(c);
      assert.equal(outQty, inQty, `ciąg ${n}: Σ wyjść = Σ wejść`);
      assert.ok(Math.abs(res.pnl - realized) <= 0.01, `ciąg ${n}: pnl ${res.pnl} vs średni koszt ${realized}`);
      const closedForm = (outSum / outQty - inSum / inQty) * dir * inQty * m;
      assert.ok(Math.abs(res.pnl - closedForm) <= 0.01, `ciąg ${n}: pnl ${res.pnl} vs (średnia wyjść − średnia wejść)·Q·MULT ${closedForm}`);
      const inCost = c.fills.reduce((a, f) => a + f.qty * f.price, 0), outCost = c.exits.reduce((a, e) => a + e.qty * e.basis, 0);
      assert.ok(Math.abs(inCost - outCost) <= 1e-3, `ciąg ${n}: niezmiennik kosztu ${inCost} vs ${outCost}`);
      assert.ok(Math.abs(res.entryAvg - inSum / inQty) < 1e-5 && Math.abs(res.exitPrice - outSum / outQty) < 1e-5, `ciąg ${n}: średnie ceny`);
    }
    // test mierzy to, co ma mierzyć: w ciągach były dokładki, wyjścia częściowe i netting
    assert.ok(withAdds >= 100 && withPartials >= 50 && netted >= 50, `pokrycie ciągów: dokładki ${withAdds}, wyjścia ${withPartials}, netting ${netted}`);
  });

  test('backtest-172: dokładka przed SL: R null, pierwszy SL ustawia slRef obu porcji', async () => {
    const W = await mod();
    let { book } = W.placeOrder(W.emptyBook(), MK('buy'), last(T, 100));
    book = W.placeOrder(book, MK('buy'), last(T + 60, 101)).book;
    let p = book.positions.NQ;
    assert.deepEqual(p.fills.map((f) => f.slRef), [null, null]);
    assert.equal(p.rUsd, null);
    book = W.modifyPosition(book, 'NQ', { sl: 99 }, last(T + 120, 101)).book;
    p = book.positions.NQ;
    assert.deepEqual(p.fills.map((f) => f.slRef), [99, 99], 'P5: pierwszy SL wpisuje się do obu porcji');
    assert.equal(p.sl0, 99);
    assert.equal(p.rUsd, 20 + 40, '1·1·20 + 1·2·20 = 60');
    const res = W.tradeResult(closedOf(W.closeAll(book, 'NQ', last(T + 180, 102), 'manual')));
    assert.equal(res.pnl, 60, '(102 − 100,5)·2·20');
    assert.equal(res.r, 1);
  });

  test('backtest-172: dokładka po usunięciu SL używa slLast; po dokładce przy SL slRef = SL', async () => {
    const W = await mod();
    let { book } = W.placeOrder(W.emptyBook(), MK('buy', { sl: 99 }), last(T, 100));
    book = W.placeOrder(book, MK('buy'), last(T + 30, 100.5)).book;
    assert.equal(book.positions.NQ.fills[1].slRef, 99, 'przy postawionym SL');
    book = W.modifyPosition(book, 'NQ', { sl: null }, last(T + 60, 100.5)).book;
    book = W.placeOrder(book, MK('buy'), last(T + 90, 101)).book;
    const p = book.positions.NQ;
    assert.equal(p.sl, null);
    assert.equal(p.fills[2].slRef, 99, 'P6: po usunięciu SL porcja dostaje ostatni znany SL');
    assert.equal(p.rUsd, 1 * 1 * 20 + 1 * 1.5 * 20 + 1 * 2 * 20, '20 + 30 + 40 = 90');
  });

  test('backtest-172: BE przy średniej poza tickiem zaokrągla w stronę zysku; cena między średnią a poziomem BE: nieaktywne', async () => {
    const W = await mod();
    let { book } = W.placeOrder(W.emptyBook(), MK('buy'), last(T, 100.25));
    book = W.placeOrder(book, MK('buy'), last(T + 60, 100.5)).book;
    assert.equal(book.positions.NQ.avg, 100.375);
    assert.equal(W.beLevel(book.positions.NQ), 100.5, 'Long: w górę');
    assert.deepEqual(W.beState(book, 'NQ', last(T + 120, 100.4)), { ok: false, why: 'below' }, '100,4 leży między średnią 100,375 a poziomem 100,5');
    assert.deepEqual(W.beState(book, 'NQ', last(T + 120, 100.75)), { ok: true, why: null });
    const be = W.moveToBE(book, 'NQ', last(T + 120, 100.75));
    assert.equal(be.book.positions.NQ.sl, 100.5);
    assert.equal(be.book.positions.NQ.be, true);
    // Short: w dół
    let sb = W.placeOrder(W.emptyBook(), MK('sell'), last(T, 100.25)).book;
    sb = W.placeOrder(sb, MK('sell'), last(T + 60, 100.5)).book;
    assert.equal(W.beLevel(sb.positions.NQ), 100.25);
  });

  test('backtest-172: netting: mniejsze → partial, równe → manual, większe → reverse + nowa pozycja', async () => {
    const W = await mod();
    const start = W.placeOrder(W.emptyBook(), MK('buy', { qty: 5, sl: 99 }), last(T, 100)).book;
    // mniejsze: Sprzedaj 2 przy Long 5
    let r = W.placeOrder(start, MK('sell', { qty: 2 }), last(T + 60, 101));
    assert.deepEqual(types(r.events), ['exit']);
    assert.deepEqual({ reason: r.events[0].exit.reason, qty: r.events[0].exit.qty, price: r.events[0].exit.price, basis: r.events[0].exit.basis }, { reason: 'partial', qty: 2, price: 101, basis: 100 });
    assert.equal(r.book.positions.NQ.dir, 'Long');
    assert.equal(r.book.positions.NQ.openQty, 3);
    assert.equal(r.book.positions.NQ.qty, 5);
    // równe: Sprzedaj 5
    r = W.placeOrder(start, MK('sell', { qty: 5, sl: 105 }), last(T + 60, 101));
    assert.deepEqual(types(r.events), ['exit', 'closed']);
    assert.equal(r.events[0].exit.reason, 'manual');
    assert.equal(r.book.positions.NQ, null, 'brak nowej pozycji, SL/TP zlecenia ignorowane');
    assert.equal(W.tradeResult(closedOf(r)).pnl, 100, '(101 − 100)·5·20');
    // większe: Sprzedaj 7 z SL 102 i TP 98
    r = W.placeOrder(start, MK('sell', { qty: 7, sl: 102, tp: 98 }), last(T + 60, 101));
    assert.deepEqual(types(r.events), ['exit', 'closed', 'filled']);
    assert.deepEqual({ reason: r.events[0].exit.reason, qty: r.events[0].exit.qty }, { reason: 'reverse', qty: 5 });
    const n = r.book.positions.NQ;
    assert.deepEqual({ dir: n.dir, qty: n.qty, openQty: n.openQty, avg: n.avg, sl: n.sl, tp: n.tp }, { dir: 'Short', qty: 2, openQty: 2, avg: 101, sl: 102, tp: 98 });
    assert.equal(n.rUsd, 2 * 1 * 20, 'R nowej pozycji od jej SL');
    assert.equal(n.fills[0].t, T + 60);
    assert.equal(W.tradeResult(closedOf(r)).pnl, 100);
    assert.notEqual(n.id, closedOf(r).id);
    assert.equal(n.reverseFrom, closedOf(r).id, 'odnośnik do zamkniętej pozycji');
    // zła strona SL nowej pozycji odrzuca całe zlecenie, księga bez zmian
    const bad = W.placeOrder(start, MK('sell', { qty: 7, sl: 100 }), last(T + 60, 101));
    assert.deepEqual(types(bad.events), ['rejected']);
    assert.equal(bad.events[0].reason, 'bad-sl');
    assert.deepEqual(bad.book, start);
  });

  test('backtest-172: reversePosition: dwa trade\'y, anulowane dokładki, SL/TP nowej z argumentu, 1 kontrakt', async () => {
    const W = await mod();
    let { book } = W.placeOrder(W.emptyBook(), MK('buy', { qty: 3, sl: 99 }), last(T, 100));
    book = W.placeOrder(book, { instrument: 'NQ', side: 'buy', type: 'limit', price: 99.5, qty: 2 }, last(T, 100)).book;
    assert.equal(book.orders[0].intent, 'add');
    const r = W.reversePosition(book, 'NQ', last(T + 60, 101), { sl: 102, tp: 98 });
    assert.deepEqual(types(r.events), ['exit', 'closed', 'cancelled', 'filled']);
    assert.equal(r.events[0].exit.reason, 'reverse');
    assert.equal(r.events[2].reason, 'reverse');
    assert.equal(r.book.orders.length, 0, 'dokładka starego kierunku anulowana');
    // [U] 3.11.2026 «wywalamy to cofniecie czasu usuwa trade, zbedne, mam usuwanie juz manualne wiec jak bede chcial to usune» (pakiet 6 odwołany): book.gone i order.hist nie są zapisywane, powód anulowania niosą zdarzenia silnika
    assert.ok(!('gone' in r.book), 'bez book.gone');
    const n = r.book.positions.NQ;
    assert.deepEqual({ dir: n.dir, qty: n.qty, avg: n.avg, sl: n.sl, tp: n.tp, rUsd: n.rUsd }, { dir: 'Short', qty: 3, avg: 101, sl: 102, tp: 98, rUsd: 3 * 1 * 20 });
    const c = closedOf(r);
    assert.equal(c.dir, 'Long');
    assert.equal(W.tradeResult(c).pnl, 3 * 1 * 20);
    // bez SL i TP: pozycja bez SL, R null
    const r2 = W.reversePosition(book, 'NQ', last(T + 60, 101), {});
    assert.equal(r2.book.positions.NQ.sl, null);
    assert.equal(r2.book.positions.NQ.rUsd, null);
    // 1 kontrakt
    const one = W.placeOrder(W.emptyBook(), MK('sell', { sl: 101 }), last(T, 100)).book;
    const r1 = W.reversePosition(one, 'NQ', last(T + 60, 99), {});
    assert.deepEqual([r1.book.positions.NQ.dir, r1.book.positions.NQ.qty], ['Long', 1]);
    // błędy: brak pozycji, zła strona SL, cofnięty kursor
    assert.equal(W.reversePosition(W.emptyBook(), 'NQ', last(T, 100), {}).events[0].reason, 'no-position');
    assert.equal(W.reversePosition(book, 'NQ', last(T + 60, 101), { sl: 100 }).events[0].reason, 'bad-sl');
    const rew = { ...book, hw: T + 600, hwi: { NQ: T + 600 } };
    assert.equal(W.reversePosition(rew, 'NQ', last(T + 60, 101), {}).events[0].reason, 'rewound');
  });

  test('backtest-172: oczekująca dokładka i SL w jednej świecy: dokładka, potem SL zamyka całość; TP w tej świecy nie działa', async () => {
    const W = await mod();
    let { book } = W.placeOrder(W.emptyBook(), MK('buy', { sl: 99 }), last(T, 100));
    book = W.placeOrder(book, { instrument: 'NQ', side: 'buy', type: 'limit', price: 99.5, qty: 1 }, last(T, 100)).book;
    let r = W.advance(book, 'NQ', S(bar(T, 100, 100.25, 100, 100), bar(T + 60, 100, 100.5, 98.5, 99)), T + 120);
    assert.deepEqual(types(r.events), ['filled', 'exit', 'closed']);
    assert.equal(r.events[0].add, true);
    const x = r.events[1].exit;
    assert.deepEqual({ reason: x.reason, qty: x.qty, price: x.price }, { reason: 'sl', qty: 2, price: 99 });
    assert.equal(W.tradeResult(closedOf(r)).pnl, -30, '(99 − 99,75)·2·20');
    // TP: pozycja z TP 100,5; dokładka wchodzi w świecy, która dotyka też TP: TP nie działa w tej świecy, działa w następnej
    ({ book } = W.placeOrder(W.emptyBook(), MK('buy', { sl: 99, tp: 100.5 }), last(T, 100)));
    book = W.placeOrder(book, { instrument: 'NQ', side: 'buy', type: 'limit', price: 99.5, qty: 1 }, last(T, 100)).book;
    r = W.advance(book, 'NQ', S(bar(T, 100, 100.25, 100, 100), bar(T + 60, 100, 101, 99.4, 100.75)), T + 120);
    assert.deepEqual(types(r.events), ['filled'], 'w świecy dokładki tylko ona (TP zbyt wcześnie)');
    assert.equal(r.book.positions.NQ.openQty, 2);
    r = W.advance(r.book, 'NQ', S(bar(T, 100, 100.25, 100, 100), bar(T + 60, 100, 101, 99.4, 100.75), bar(T + 120, 100.75, 101, 100.25, 100.5)), T + 180);
    assert.deepEqual(types(r.events), ['exit', 'closed']);
    assert.deepEqual({ reason: r.events[0].exit.reason, qty: r.events[0].exit.qty, price: r.events[0].exit.price }, { reason: 'tp', qty: 2, price: 100.5 });
  });

  test('backtest-172: pełne zamknięcie (SL, ręczne, netting) anuluje oczekujące dokładki z powodem position-closed', async () => {
    const W = await mod();
    let { book } = W.placeOrder(W.emptyBook(), MK('buy', { sl: 99 }), last(T, 100));
    book = W.placeOrder(book, { instrument: 'NQ', side: 'buy', type: 'stop', price: 101, qty: 1 }, last(T, 100)).book;
    assert.equal(book.orders[0].intent, 'add');
    const why = (r) => r.events.filter((e) => e.type === 'cancelled').map((e) => e.reason);
    // SL w świecy, która nie dotyka stopu 101
    let r = W.advance(book, 'NQ', S(bar(T, 100, 100.25, 100, 100), bar(T + 60, 100, 100.5, 98.5, 99)), T + 120);
    assert.deepEqual(types(r.events), ['exit', 'closed', 'cancelled']);
    assert.equal(r.events[2].reason, 'position-closed');
    assert.equal(r.book.orders.length, 0);
    assert.deepEqual(why(r), ['position-closed']);
    // zamknięcie całości ręcznie przez closePartial(openQty)
    r = W.closePartial(book, 'NQ', 1, last(T + 60, 100.25));
    assert.deepEqual(types(r.events), ['exit', 'closed', 'cancelled']);
    assert.equal(r.book.orders.length, 0);
    // netting równy
    r = W.placeOrder(book, MK('sell'), last(T + 60, 100.25));
    assert.deepEqual(types(r.events), ['exit', 'closed', 'cancelled']);
    assert.equal(r.book.orders.length, 0);
    // wyjście częściowe niczego nie anuluje
    const two = W.placeOrder(book, MK('buy'), last(T + 30, 100)).book;
    r = W.closePartial(two, 'NQ', 1, last(T + 60, 100.25));
    assert.deepEqual(types(r.events), ['exit']);
    assert.equal(r.book.orders.length, 1);
  });

  test('backtest-172: wypełnienie wejścia anuluje tylko przeciwne oczekujące wejścia; to samo kierunkiem zostaje jako dokładka', async () => {
    const W = await mod();
    const lim = (side, price, extra = {}) => ({ instrument: 'NQ', side, type: 'limit', price, qty: 1, sl: null, ...extra });
    let b = W.emptyBook();
    b = W.placeOrder(b, lim('buy', 99, { sl: 95 }), last(T, 100)).book;
    b = W.placeOrder(b, lim('sell', 101), last(T, 100)).book;
    b = W.placeOrder(b, lim('buy', 98), last(T, 100)).book;
    assert.deepEqual(b.orders.map((o) => o.intent), ['open', 'open', 'open']);
    // świeca dotyka tylko pierwszego kupna
    const r = W.advance(b, 'NQ', S(bar(T, 100, 100.5, 98.9, 99.5)), T + 60);
    assert.deepEqual(types(r.events), ['filled', 'cancelled']);
    assert.equal(r.events[1].reason, 'filled-other');
    assert.equal(r.events[1].order.side, 'sell');
    assert.deepEqual(r.book.orders.map((o) => [o.side, o.price, o.intent]), [['buy', 98, 'add']], 'drugie kupno zostaje i jest dokładką');
    assert.equal(r.book.positions.NQ.qty, 1);
    // następna świeca dotyka dokładki → średnia
    const r2 = W.advance(r.book, 'NQ', S(bar(T, 100, 100.5, 98.9, 99.5), bar(T + 60, 99.5, 99.5, 97.5, 98)), T + 120);
    assert.deepEqual(types(r2.events), ['filled']);
    assert.equal(r2.events[0].add, true);
    assert.equal(r2.book.positions.NQ.avg, 98.5);
    assert.equal(r2.book.positions.NQ.sl, 95, 'SL pozycji z pierwszego zlecenia');
    // obie dotknięte w jednej świecy: pierwsze otwiera, drugie dokłada w tej samej świecy
    const r3 = W.advance(b, 'NQ', S(bar(T, 100, 100.5, 97.5, 98)), T + 60);
    assert.deepEqual(types(r3.events), ['filled', 'cancelled', 'filled']);
    assert.equal(r3.book.positions.NQ.qty, 2);
    assert.equal(r3.book.positions.NQ.avg, 98.5);
    assert.equal(r3.book.orders.length, 0);
  });

  test('backtest-172: przeciwny limit/stop przy pozycji: opposite-pending; bez pozycji stopy po obu stronach działają', async () => {
    const W = await mod();
    const { book } = await long2();
    for (const [type, price] of [['limit', 101], ['stop', 99.5]]) {
      const r = W.placeOrder(book, { instrument: 'NQ', side: 'sell', type, price, qty: 1, sl: null }, last(T + 60, 100));
      assert.deepEqual(types(r.events), ['rejected']);
      assert.equal(r.events[0].reason, 'opposite-pending', type);
      assert.deepEqual(r.book.orders, [], 'nic nie trafiło do księgi');
    }
    let b = W.placeOrder(W.emptyBook(), { instrument: 'NQ', side: 'buy', type: 'stop', price: 101, qty: 1, sl: null }, last(T, 100)).book;
    b = W.placeOrder(b, { instrument: 'NQ', side: 'sell', type: 'stop', price: 99, qty: 1, sl: null }, last(T, 100)).book;
    assert.equal(b.orders.length, 2);
    // dokładka limit/stop za SL pozycji jest odrzucana (inaczej od razu wyleciałaby na SL)
    const beyond = W.placeOrder(book, { instrument: 'NQ', side: 'buy', type: 'limit', price: 98.5, qty: 1 }, last(T + 60, 100));
    assert.equal(beyond.events[0].reason, 'add-beyond-sl');
    // dokładka limit po złej stronie rynku: bad-price jak dla wejścia
    assert.equal(W.placeOrder(book, { instrument: 'NQ', side: 'buy', type: 'limit', price: 101, qty: 1 }, last(T + 60, 100)).events[0].reason, 'bad-price');
    // dokładka oczekująca nie dostaje SL/TP z panelu
    const add = W.placeOrder(book, { instrument: 'NQ', side: 'buy', type: 'limit', price: 99.5, qty: 1, sl: 90, tp: 120 }, last(T + 60, 100));
    assert.deepEqual([add.book.orders[0].intent, add.book.orders[0].sl, add.book.orders[0].tp], ['add', null, null]);
  });

  test('backtest-172: kursor cofnięty: dokładka i odwrócenie nettingiem odrzucone (rewound), księga bez zmian', async () => {
    const W = await mod();
    const { book } = await long2();
    const rew = { ...book, hw: T + 600, hwi: { NQ: T + 600 } };
    for (const side of ['buy', 'sell']) {
      const r = W.placeOrder(rew, MK(side, { qty: 5 }), last(T + 60, 101));
      assert.deepEqual([types(r.events), r.events[0].reason], [['rejected'], 'rewound'], side);
      assert.deepEqual(r.book, rew);
    }
  });

  test('backtest-172: NQ i MNQ: dokładka MNQ przy pozycji NQ to osobna pozycja MNQ', async () => {
    const { W, book } = await long2();
    const r = W.placeOrder(book, MK('buy', { instrument: 'MNQ', qty: 3 }), last(T + 60, 101));
    assert.equal(r.book.positions.NQ.qty, 2);
    assert.equal(r.book.positions.NQ.fills.length, 1);
    assert.deepEqual([r.book.positions.MNQ.qty, r.book.positions.MNQ.fills.length], [3, 1]);
  });

  test('backtest-172: MAE/MFE z dokładkami w $ / rUsd (wartości z papieru); jedna porcja = jak 1.6', async () => {
    const W = await mod();
    let { book } = W.placeOrder(W.emptyBook(), MK('buy', { sl: 99 }), last(T, 100));
    book = W.placeOrder(book, MK('buy'), last(T + 60, 102)).book;
    const c = closedOf(W.closeAll(book, 'NQ', last(T + 180, 103), 'manual'));
    const st = S(bar(T, 100, 101, 99.5, 100.5), bar(T + 60, 100.5, 103, 100.5, 102), bar(T + 120, 102, 104, 99.5, 103));
    assert.equal(c.rUsd, 20 + 60, 'rUsd 80 $');
    // świeca 1: 1@100 → max +20, min −10; świeca 2 (avg 101, 2 szt.): max 2·2·20 = 80, min 2·(−0,5)·20 = −20; świeca 3: max 2·3·20 = 120, min 2·(−1,5)·20 = −60
    assert.deepEqual(W.excursions(c, st), { maeR: -0.75, mfeR: 1.5 }, '−60/80 i 120/80');
    // jedna porcja bez wyjść: jak w 1.6 (ruch ceny / odległość do SL)
    const one = closedOf(W.closeAll(W.placeOrder(W.emptyBook(), MK('buy', { sl: 99 }), last(T, 100)).book, 'NQ', last(T + 60, 101), 'manual'));
    assert.deepEqual(W.excursions(one, S(bar(T, 100, 103, 99.5, 101))), { maeR: -0.5, mfeR: 3 });
  });

  test('backtest-172: prowizja od sumy porcji (round turn za kontrakt); konto: saldo, dziś i sesja z dokładkami', async () => {
    const W = await mod();
    const K = await imp('public/js/bt-konto.js');
    let { book } = W.placeOrder(W.emptyBook(), MK('buy', { sl: 99 }), last(T, 100));
    book = W.placeOrder(book, MK('buy', { qty: 2 }), last(T + 60, 102)).book;
    // otwarta pozycja: 3 kontrakty, avg 101,333…, cena 103
    const lp = () => ({ t: T + 120, price: 103 });
    const def = { balance: 50000, commission: 2.5 };
    let acc = K.account({ book, trades: [], def, last: lp, dayStart: T });
    const upl = (103 - (100 + 2 * 102) / 3) * 3 * 20 - 2.5 * 3;
    assert.ok(Math.abs(acc.upl - Math.round(upl * 100) / 100) <= 0.01, `upl ${acc.upl} vs ${upl}`);
    assert.equal(acc.open[0].qty, 3);
    assert.equal(acc.open[0].qty0, 3);
    // wyjście częściowe 1 po 103: zrealizowane (103 − avg)·20 − 2,5 wchodzi do salda i do „dziś”
    book = W.closePartial(book, 'NQ', 1, last(T + 120, 103)).book;
    acc = K.account({ book, trades: [], def, last: lp, dayStart: T });
    const realized = (103 - (100 + 2 * 102) / 3) * 20 - 2.5;
    assert.ok(Math.abs(acc.realized - Math.round(realized * 100) / 100) <= 0.01, `realized ${acc.realized} vs ${realized}`);
    assert.equal(acc.day.usd, acc.realized);
    assert.equal(acc.open[0].qty, 2);
    assert.equal(acc.open[0].qty0, 3);
    // zamknięty trade: fee od Σ porcji
    const { toTrade } = await imp('public/js/bt-journal.js');
    const c = closedOf(W.closeAll(book, 'NQ', last(T + 180, 104), 'manual'));
    const tr = toTrade(c, { day: '2024-03-12', trades: [], commission: 2.5 });
    assert.equal(tr.fee, 7.5, '3 kontrakty · 2,5');
    assert.equal(tr.qty, 3);
    const gross = (103 - (100 + 2 * 102) / 3) * 20 + (104 - (100 + 2 * 102) / 3) * 2 * 20;
    assert.ok(Math.abs(tr.pnl - (Math.round(gross * 100) / 100 - 7.5)) <= 0.01, `pnl ${tr.pnl} vs ${gross - 7.5}`);
    assert.equal(tr.fills.length, 2);
  });

  test('backtest-172: tradeInput: entryPrice = średnia porcji, exitPrice = średnia wyjść, pnl zgodny z niezmiennikiem; odwrócenie nie dodaje pól', async () => {
    const { W, book } = await long2();
    const { toTrade } = await imp('public/js/bt-journal.js');
    const { tradeInput } = await imp('lib/backtest-sync.mjs');
    let r = W.closePartial(book, 'NQ', 1, last(T + 60, 110));
    r = W.placeOrder(r.book, MK('buy'), last(T + 120, 120));
    const c = closedOf(W.closeAll(r.book, 'NQ', last(T + 180, 130), 'manual'));
    const tr = { ...toTrade(c, { day: '2024-03-12', trades: [], id: 't1' }), entryT: 1710240000, exitT: 1710240180 };
    const inp = tradeInput({ id: 'bt-abc123', name: 'S', def: {} }, tr);
    assert.equal(inp.entryPrice, 106.666667);
    assert.equal(inp.exitPrice, 123.333333);
    assert.equal(inp.pnl, 1000);
    assert.equal(inp.sl, 99, 'pierwszy SL');
    assert.equal(inp.r, 2.17);
    assert.equal('reverseOf' in inp, false, 'odnośnik odwrócenia nie idzie do Notion (brak pola)');
    assert.equal(Object.keys(inp).some((k) => /porcj|fills|kontrakt/i.test(k)), false);
    // trade z odwrócenia niesie reverseOf w pliku sesji
    const rev = W.placeOrder(book, MK('sell', { qty: 3, sl: 102 }), last(T + 60, 101));
    const np = { ...rev.book.positions.NQ, reverseOf: 't1' };
    const tr2 = toTrade(closedOf(W.closeAll({ ...rev.book, positions: { ...rev.book.positions, NQ: np } }, 'NQ', last(T + 120, 100), 'manual')), { day: '2024-03-12', trades: [], id: 't2' });
    assert.equal(tr2.reverseOf, 't1');
    assert.equal(tr2.dir, 'Short');
    assert.equal(tr.reverseOf ?? null, null);
  });

  test('backtest-172: zgodność wstecz: pozycja 1.6 z jedną porcją przyjmuje dokładkę; sesja z dokładkami zapisana i odczytana daje to samo', async () => {
    const W = await mod();
    const { migrateSession } = await imp('public/js/bt-sesja.js');
    const legacy = { v: 2, id: 'bt-abc123', rev: 1, name: 'S', def: { instruments: ['NQ'], from: '2024-03-12', balance: 50000, risk: { mode: 'usd', value: 500 } }, cursor: 1200, hw: 1200, layout: { kind: '1', charts: [{ instrument: 'NQ', tf: '1m' }], active: 0 }, trades: [], drawings: {}, v1: null,
      book: { orders: [], positions: { ES: null, NQ: { id: 'p1', instrument: 'NQ', dir: 'Long', qty: 2, openQty: 2, entryT: 1000, entryPrice: 100, sl0: 99, sl: 99, tp: null, be: false, exits: [], orderId: 'o1' }, MES: null, MNQ: null }, hw: 1200, hwi: { NQ: 1200 }, seq: 1 } };
    const mig = migrateSession(legacy);
    const r = W.placeOrder(mig.book, MK('buy', { qty: 2 }), last(1260, 102));
    const p = r.book.positions.NQ;
    assert.deepEqual([p.qty, p.avg, p.rUsd], [4, 101, 2 * 20 + 2 * 3 * 20]);
    // serializacja do pliku i z powrotem nie zmienia księgi (idempotencja migracji)
    const doc = migrateSession(JSON.parse(JSON.stringify({ ...mig, book: r.book })));
    assert.deepEqual(doc.book.positions.NQ, p);
    // księga zapisana przez 1.7.0-p1 (bez seq w porcjach) nadal się liczy
    const noSeq = JSON.parse(JSON.stringify(p));
    for (const f of noSeq.fills) delete f.seq;
    assert.equal(W.derive(noSeq).avg, 101);
  });

  test('backtest-172: skrót „Odwróć” (R): domyślny bez kolizji, kolizja wykrywana, zapis sprzed pakietu dostaje R tylko gdy wolny', async () => {
    const { DEFAULT_SKROTY, DEFAULT_JUMPS, collisions, sanitizeBt } = await imp('public/js/bt-czas.js');
    assert.equal(DEFAULT_SKROTY.reverse, 'R');
    assert.deepEqual(collisions(DEFAULT_SKROTY, DEFAULT_JUMPS), []);
    const col = collisions({ ...DEFAULT_SKROTY, be: 'R' }, []);
    assert.deepEqual(col.map((c) => [c.a, c.b].sort().join('+')), ['be+reverse']);
    // Ustawienia: skrót Odwróć na klawiszu wykresu jest kolizją z zarezerwowanym
    assert.deepEqual(collisions({ ...DEFAULT_SKROTY, reverse: 'Escape' }, []).map((c) => [c.a, c.b]), [['reverse', 'reserved']]);
    // zapis sprzed pakietu (bez pola reverse): wolne R → R
    assert.equal(sanitizeBt({ skroty: { buy: 'B', sell: 'S' } }).skroty.reverse, 'R');
    // skok użytkownika na R zajmuje klawisz: akcja dostaje pusty skrót, skok zostaje
    const j = sanitizeBt({ skroty: { buy: 'B' }, jumps: [{ id: 'r1', name: 'Skok R', cel: { kind: 'filterDay' }, skrot: 'R' }] });
    assert.equal(j.skroty.reverse, '');
    assert.equal(j.jumps.find((x) => x.id === 'r1').skrot, 'R');
    // jawnie zapisany pusty skrót zostaje pusty
    assert.equal(sanitizeBt({ skroty: { reverse: '' } }).skroty.reverse, '');
  });

  test('backtest-172: modifyOrder dokładki: bez własnych SL/TP, cena nie za SL pozycji; podpis trybu przycisku (sideMode, modeText)', async () => {
    const { W, book } = await long2();
    let b = W.placeOrder(book, { instrument: 'NQ', side: 'buy', type: 'limit', price: 99.5, qty: 1 }, last(T + 30, 100)).book;
    const id = b.orders[0].id;
    let r = W.modifyOrder(b, id, { price: 99.25, sl: 90, tp: 120 }, last(T + 40, 100));
    assert.deepEqual(r.events, []);
    assert.deepEqual([r.book.orders[0].price, r.book.orders[0].sl, r.book.orders[0].tp], [99.25, null, null]);
    r = W.modifyOrder(b, id, { price: 99 }, last(T + 40, 100));
    assert.equal(r.events[0].reason, 'add-beyond-sl', 'cena równa SL pozycji też odrzucona');
    const { sideMode, modeText } = await imp('public/js/bt-zlecenia.js');
    const pos = { dir: 'Long', openQty: 5 };
    assert.deepEqual(sideMode(null, 'buy', 3), { kind: 'open' });
    assert.equal(modeText(sideMode(pos, 'buy', 2)), 'Dołóż 2');
    assert.equal(modeText(sideMode(pos, 'sell', 2)), 'Zmniejsz 2 z 5');
    assert.equal(modeText(sideMode(pos, 'sell', 5)), 'Zamknij 5');
    assert.equal(modeText(sideMode(pos, 'sell', 7)), 'Odwróć: zamknie 5, Short 2');
    assert.equal(modeText(sideMode({ dir: 'Short', openQty: 5 }, 'buy', 6)), 'Odwróć: zamknie 5, Long 1');
  });

  test('backtest-172: częściowe „od pierwotnej” przy dokładkach: podstawa = suma porcji; statystyki sesji: pozycja z dokładkami to jeden trade z R z rUsd', async () => {
    const W = await mod();
    const K = await imp('public/js/bt-konto.js');
    const { toTrade } = await imp('public/js/bt-journal.js');
    let { book } = W.placeOrder(W.emptyBook(), MK('buy', { qty: 3, sl: 99 }), last(T, 100));
    book = W.placeOrder(book, MK('buy', { qty: 2 }), last(T + 60, 101)).book;
    book = W.placeOrder(book, MK('buy', { qty: 2 }), last(T + 120, 102)).book;
    book = W.closePartial(book, 'NQ', 2, last(T + 180, 103)).book;
    const p = book.positions.NQ;
    assert.deepEqual([p.qty, p.openQty], [7, 5]);
    const base = { qty: p.qty, openQty: p.openQty, price: 103, avg: p.avg, dir: p.dir, instrument: 'NQ', commission: 0 };
    // 50% od pierwotnej 7 = 3,5 → 4 (zaokrąglenie jak pctQty), od pozostałej 5 = 2,5 → 3
    assert.deepEqual([K.partialPlan({ ...base, base: 'orig', pct: 50 }).n, K.partialPlan({ ...base, base: 'open', pct: 50 }).n], [4, 3]);
    // 100% od pierwotnej przekracza resztę: cała reszta
    const all = K.partialPlan({ ...base, base: 'orig', pct: 100 });
    assert.deepEqual([all.n, all.all], [5, true]);
    // trade z dokładkami w statystykach sesji: jeden trade, R = wynik brutto / rUsd
    const c = closedOf(W.closeAll(book, 'NQ', last(T + 240, 104), 'manual'));
    const tr = toTrade(c, { day: '2024-03-12', trades: [], id: 't1' });
    const acc = K.account({ book: W.emptyBook(), trades: [tr], def: { balance: 50000 }, last: () => ({ price: 104 }) });
    assert.equal(acc.session.n, 1);
    assert.equal(acc.session.r, tr.r);
    assert.equal(tr.rUsd, 3 * 1 * 20 + 2 * 2 * 20 + 2 * 3 * 20, 'rUsd 60 + 80 + 120 = 260');
    assert.equal(tr.r, Math.round((tr.pnl / 260) * 100) / 100);
    assert.ok(tr.pnl > 0 && tr.r > 0);
  });

  // ---- poprawki po przeglądzie (2.11.2026): dokładka za SL pozycji nigdy nie wchodzi przed SL (P0), przykłady z sondy recenzenta ----
  const reasons = (ev) => ev.filter((e) => e.type === 'cancelled').map((e) => e.reason);

  test('backtest-172: P0 zamiana drugiego wejścia w dokładkę za SL (A2, A3): anulowana add-beyond-sl, SL zamyka tylko pozycję: −15 $ zamiast +5 $', async () => {
    const W = await mod();
    // dwa wejścia limit przed pozycją: 99,75 z SL 99 i drugie 98 (z własnym SL 95), które po otwarciu pierwszego staje się dokładką LEŻĄCĄ ZA SL 99
    let b = W.placeOrder(W.emptyBook(), { instrument: 'NQ', side: 'buy', type: 'limit', price: 99.75, qty: 1, sl: 99 }, last(T, 100)).book;
    b = W.placeOrder(b, { instrument: 'NQ', side: 'buy', type: 'limit', price: 98, qty: 1, sl: 95 }, last(T, 100)).book;
    // A3: obie ceny i SL w jednej świecy
    let r = W.advance(b, 'NQ', S(bar(T, 100, 100, 97.5, 98)), T + 60);
    assert.deepEqual(types(r.events), ['filled', 'cancelled', 'exit', 'closed']);
    assert.deepEqual(reasons(r.events), ['add-beyond-sl']);
    assert.equal(r.events[1].order.price, 98);
    const c = closedOf(r);
    assert.equal(c.fills.length, 1, 'zlecenie 98 nie weszło do pozycji');
    const res = W.tradeResult(c);
    assert.equal(res.pnl, -15, 'SL 99 zamyka 1@99,75: (99 − 99,75)·20 (błąd dawał +5 $)');
    assert.equal(c.rUsd, 15, 'rUsd porcji 15 $');
    assert.equal(res.r, -1);
    assert.equal(r.book.orders.length, 0);
    assert.ok(r.events.some((e) => e.type === 'cancelled' && e.reason === 'add-beyond-sl' && e.order.price === 98) && !('gone' in r.book), 'zdarzenie anulowania z powodem, bez book.gone');
    // A2: pozycja otwiera się w jednej świecy, SL w następnej
    r = W.advance(b, 'NQ', S(bar(T, 100, 100, 99.5, 99.75)), T + 60);
    assert.deepEqual(types(r.events), ['filled', 'cancelled']);
    assert.equal(r.book.orders.length, 0);
    r = W.advance(r.book, 'NQ', S(bar(T, 100, 100, 99.5, 99.75), bar(T + 60, 99.75, 99.75, 97.5, 98)), T + 120);
    assert.deepEqual(types(r.events), ['exit', 'closed']);
    assert.equal(W.tradeResult(closedOf(r)).pnl, -15);
    // dokładka po bezpiecznej stronie SL zostaje (intent add), traci własne SL i TP, zamiana ma wpis w hist z at
    b = W.placeOrder(W.emptyBook(), { instrument: 'NQ', side: 'buy', type: 'limit', price: 99.75, qty: 1, sl: 99 }, last(T, 100)).book;
    b = W.placeOrder(b, { instrument: 'NQ', side: 'buy', type: 'limit', price: 99.5, qty: 1, sl: 95, tp: 105 }, last(T, 100)).book;
    r = W.advance(b, 'NQ', S(bar(T, 100, 100, 99.75, 99.75)), T + 60);
    assert.deepEqual(types(r.events), ['filled']);
    const o = r.book.orders[0];
    assert.deepEqual({ intent: o.intent, sl: o.sl, tp: o.tp, tps: o.tps }, { intent: 'add', sl: null, tp: null, tps: [] }, 'zlecenie zamienione na dokładkę traci SL i TP');
    assert.ok(!('hist' in o), 'zamiana na dokładkę bez order.hist');
  });

  test('backtest-172: P0 SL przesunięty za oczekującą dokładkę (B Long, C Short): anulowana add-beyond-sl, SL zamyka −20 $ (nie 0 $)', async () => {
    const W = await mod();
    // Long 1@100 SL 97, dokładka limit 98; SL → 99 leży nad 98
    let b = W.placeOrder(W.emptyBook(), MK('buy', { sl: 97 }), last(T, 100)).book;
    b = W.placeOrder(b, { instrument: 'NQ', side: 'buy', type: 'limit', price: 98, qty: 1 }, last(T, 100)).book;
    assert.equal(b.orders[0].intent, 'add');
    const m = W.modifyPosition(b, 'NQ', { sl: 99 }, last(T, 100));
    assert.deepEqual(types(m.events), ['cancelled']);
    assert.deepEqual(reasons(m.events), ['add-beyond-sl']);
    assert.equal(m.book.orders.length, 0);
    assert.ok(!('gone' in m.book), 'bez book.gone (powód niesie zdarzenie)');
    let r = W.advance(m.book, 'NQ', S(bar(T, 100, 100, 97.5, 98)), T + 60);
    assert.deepEqual(types(r.events), ['exit', 'closed']);
    assert.equal(closedOf(r).fills.length, 1);
    assert.equal(W.tradeResult(closedOf(r)).pnl, -20, '(99 − 100)·20 (błąd dawał 0 $)');
    // C: Short 1@100 SL 103, dokładka sell limit 102; SL → 101
    b = W.placeOrder(W.emptyBook(), MK('sell', { sl: 103 }), last(T, 100)).book;
    b = W.placeOrder(b, { instrument: 'NQ', side: 'sell', type: 'limit', price: 102, qty: 1 }, last(T, 100)).book;
    const ms = W.modifyPosition(b, 'NQ', { sl: 101 }, last(T, 100));
    assert.deepEqual(reasons(ms.events), ['add-beyond-sl']);
    r = W.advance(ms.book, 'NQ', S(bar(T, 100, 102.5, 100, 102)), T + 60);
    assert.deepEqual(types(r.events), ['exit', 'closed']);
    assert.equal(W.tradeResult(closedOf(r)).pnl, -20, 'Short: (100 − 101)·20');
    // SL, który nie sięga dokładki (97 → 98 przy dokładce 99), nic nie anuluje; zmiana samego TP też nie
    b = W.placeOrder(W.emptyBook(), MK('buy', { sl: 97 }), last(T, 100)).book;
    b = W.placeOrder(b, { instrument: 'NQ', side: 'buy', type: 'limit', price: 99, qty: 1 }, last(T, 100)).book;
    const ok = W.modifyPosition(b, 'NQ', { sl: 98 }, last(T, 100));
    assert.deepEqual(ok.events, []);
    assert.equal(ok.book.orders.length, 1);
    assert.deepEqual(W.modifyPosition(b, 'NQ', { tp: 110 }, last(T, 100)).events, []);
    // dokładka dokładnie na SL też leży „za” (Long: cena ≤ SL)
    const eq = W.modifyPosition(b, 'NQ', { sl: 99 }, last(T, 100));
    assert.deepEqual(reasons(eq.events), ['add-beyond-sl'], 'cena równa SL');
  });

  test('backtest-172: P0 BE ponad oczekującą dokładką (B2): anulowana add-beyond-sl, BE zamyka 0 $ (nie +40 $)', async () => {
    const W = await mod();
    let b = W.placeOrder(W.emptyBook(), MK('buy', { sl: 95 }), last(T, 100)).book;
    b = W.placeOrder(b, { instrument: 'NQ', side: 'buy', type: 'limit', price: 98, qty: 1 }, last(T, 100)).book;
    const be = W.moveToBE(b, 'NQ', last(T, 101));
    assert.equal(be.book.positions.NQ.sl, 100, 'SL na BE (średnia 100)');
    assert.deepEqual(reasons(be.events), ['add-beyond-sl']);
    assert.equal(be.book.orders.length, 0);
    const r = W.advance(be.book, 'NQ', S(bar(T, 101, 101, 97.5, 98)), T + 60);
    assert.deepEqual(types(r.events), ['exit', 'closed']);
    const c = closedOf(r);
    assert.equal(c.fills.length, 1);
    assert.equal(W.tradeResult(c).pnl, 0, 'wyjście na BE 100: (100 − 100)·20 (błąd dawał +40 $: dokładka 98 i wyjście 2@100)');
  });

  test('backtest-172: P0 siatka w advance: dokładka za SL (wstrzyknięta do księgi) nie wchodzi przed SL; position-closed; −15 $ zamiast +5 $', async () => {
    const W = await mod();
    const { book } = W.placeOrder(W.emptyBook(), MK('buy', { sl: 99 }), last(T, 99.75));
    const b = JSON.parse(JSON.stringify(book));
    // zlecenie, którego żadna ścieżka API nie postawi za SL (np. księga z innej wersji): intent add, cena 98 ≤ SL 99
    b.orders.push({ id: 'ox', instrument: 'NQ', side: 'buy', type: 'limit', price: 98, qty: 1, sl: null, tp: null, placedT: T, intent: 'add', tps: [], hist: [] });
    const r = W.advance(b, 'NQ', S(bar(T, 99.75, 99.75, 97.5, 98)), T + 60);
    assert.deepEqual(types(r.events), ['exit', 'closed', 'cancelled'], 'SL najpierw, potem anulowanie dokładki');
    assert.deepEqual(reasons(r.events), ['position-closed']);
    const c = closedOf(r);
    assert.equal(c.fills.length, 1, 'dokładka nigdy nie weszła');
    const res = W.tradeResult(c);
    assert.equal(res.pnl, -15, '(99 − 99,75)·20');
    assert.equal(c.rUsd, 15);
    assert.equal(res.r, -1);
    // Short lustrzanie: dokładka sell 102 ≥ SL 101
    const s0 = W.placeOrder(W.emptyBook(), MK('sell', { sl: 101 }), last(T, 100.25)).book;
    const sb = JSON.parse(JSON.stringify(s0));
    sb.orders.push({ id: 'oy', instrument: 'NQ', side: 'sell', type: 'limit', price: 102, qty: 1, sl: null, tp: null, placedT: T, intent: 'add', tps: [], hist: [] });
    const rs = W.advance(sb, 'NQ', S(bar(T, 100.25, 102.5, 100.25, 102)), T + 60);
    assert.deepEqual(types(rs.events), ['exit', 'closed', 'cancelled']);
    assert.equal(W.tradeResult(closedOf(rs)).pnl, -15, '(100,25 − 101)·20');
  });

  test('backtest-172: nextSeq: pętla (130 000 porcji bez RangeError), nie-liczby w seq pomijane', async () => {
    const K = await imp('public/js/bt-ksiega.js');
    const fills = Array.from({ length: 130000 }, () => ({ seq: 1 }));
    assert.equal(K.nextSeq({ fills, exits: [{ seq: 7 }] }), 8, 'spread rzucał RangeError przy ok. 130 tys. elementów');
    assert.equal(K.nextSeq({ fills: [{ seq: 'x' }, { seq: NaN }, null, { seq: 3 }], exits: [7, { seq: {} }] }), 4);
    assert.equal(K.nextSeq({}), 1);
  });
};
