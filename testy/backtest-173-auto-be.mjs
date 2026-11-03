// backtest-173 (silnik): pakiet 1.7-3 „Auto-BE i nazwane presety zleceń” (docs/plany/backtest/1.7.0/etap-1-7-3-auto-be-presety.md, dopisek 2.11.2026; model-pozycji-1-7.md §2.5, §3.4, §3.5, §4).
// Testy czyste (Node): próg auto-BE w cenie (R, pkt, ticki, $, cena), wyzwolenie od następnej świecy, kolejność w świecy (SL, TP, potem próg), krawędzie z karty
// (R bez SL, wejście bez SL, SL lepszy niż BE, świeca wejścia, dokładka przed i po wyzwoleniu, wyjście częściowe, offset, znak wodny), pole `beAt` (cena, przy której trade
// jest bez ryzyka) w pozycji i trade'ie oraz mapowanie do pola „BE” w Notion (cena progu albo cena bieżąca przy ręcznym BE). Dane syntetyczne, zero sieci.
// Każda asercja ma wartość policzoną na papierze (komentarz), żadnych OR-ów ani gałęzi „pominięte = zdane”.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const mod = () => imp('public/js/bt-wypelnienia.js');
  const T = 1000;
  const S = (...bars) => ({ bars, len: bars.map(() => 60) });
  const bar = (t, o, h, l, c) => [t, o, h, l, c, 10];
  const types = (ev) => ev.map((e) => e.type);
  const MK = (side, extra = {}) => ({ instrument: 'NQ', side, type: 'market', qty: 1, sl: null, tp: null, ...extra });
  const last = (t, price) => ({ t, price });
  const closedOf = (r) => r.events.find((e) => e.type === 'closed')?.position;
  const ab = (kind, value, extra = {}) => ({ kind, value, offsetTicks: 0, ...extra });

  // Long (albo Short) qty@100, SL 95 (Short: 105), opcjonalnie auto-BE; rUsd = qty · 5 · 20
  const open = async (autoBe, { side = 'buy', qty = 1, sl = side === 'buy' ? 95 : 105, tp = null } = {}) => {
    const W = await mod();
    const r = W.placeOrder(W.emptyBook(), MK(side, { qty, sl, tp, autoBe }), last(T, 100));
    assert.deepEqual(types(r.events), ['filled'], JSON.stringify(r.events));
    return { W, book: r.book };
  };

  test('backtest-173: auto BE w R, pkt, tickach, $ i cenie: próg w cenie (autoBePrice), Long i Short', async () => {
    const W = await mod();
    // Long 2@100, SL 95: rUsd = 2·5·20 = 200
    const L = (a) => W.autoBePrice(W.placeOrder(W.emptyBook(), MK('buy', { qty: 2, sl: 95, autoBe: a }), last(T, 100)).book.positions.NQ);
    assert.equal(L(ab('r', 1)), 105, '100 + 1 · 200 / (2 · 20)');
    assert.equal(L(ab('r', 1.5)), 107.5, '100 + 1,5 · 5');
    assert.equal(L(ab('pts', 3)), 103);
    assert.equal(L(ab('ticks', 8)), 102, '8 ticków po 0,25');
    assert.equal(L(ab('usd', 120)), 103, '100 + 120 / (2 · 20)');
    assert.equal(L(ab('price', 104.5)), 104.5);
    // Short 2@100, SL 105: lustro
    const Sh = (a) => W.autoBePrice(W.placeOrder(W.emptyBook(), MK('sell', { qty: 2, sl: 105, autoBe: a }), last(T, 100)).book.positions.NQ);
    assert.equal(Sh(ab('r', 1)), 95);
    assert.equal(Sh(ab('pts', 3)), 97);
    assert.equal(Sh(ab('ticks', 8)), 98);
    assert.equal(Sh(ab('usd', 120)), 97);
    assert.equal(Sh(ab('price', 96)), 96);
    // R bez rUsd (nigdy nie było SL) i pozycja bez auto-BE nie mają progu
    const noSl = W.placeOrder(W.emptyBook(), MK('buy'), last(T, 100)).book.positions.NQ;
    assert.equal(W.autoBePrice({ ...noSl, autoBe: ab('r', 1) }), null);
    assert.equal(W.autoBePrice(noSl), null);
    assert.equal(W.autoBePrice({ ...noSl, autoBe: ab('pts', 2) }), 102, 'pkt nie potrzebuje SL');
  });

  test('backtest-173: wyzwolenie przesuwa SL od następnej świecy; w świecy wyzwolenia działa stary SL', async () => {
    const { W, book } = await open(ab('price', 103));
    // wysoko 102,75 < 103: bez wyzwolenia
    const b1 = bar(T, 100, 102.75, 99.5, 102.5);
    // wysoko 103 ≥ 103: wyzwala; niskie 99,5 dotknęłoby nowego SL 100, ale ten działa dopiero od następnej świecy
    const b2 = bar(T + 60, 102.5, 103, 99.5, 102);
    // niskie 99,75 ≤ 100: stop na BE
    const b3 = bar(T + 120, 102, 102.25, 99.75, 100.25);
    const st = S(b1, b2, b3);
    let r = W.advance(book, 'NQ', st, T + 60);
    assert.deepEqual(types(r.events), []);
    assert.equal(r.book.positions.NQ.sl, 95, 'przed progiem SL na starym miejscu');
    assert.equal(r.book.positions.NQ.autoBe.done, false);
    r = W.advance(r.book, 'NQ', st, T + 120);
    assert.deepEqual(types(r.events), ['be-auto'], 'świeca b2 wyzwala próg, ale nie zamyka pozycji nowym SL');
    const ev = r.events[0];
    assert.deepEqual([ev.price, ev.sl, ev.changed, ev.instrument], [103, 100, true, 'NQ']);
    const p = r.book.positions.NQ;
    assert.equal(p.sl, 100, 'SL na poziomie BE (średnia 100)');
    assert.equal(p.autoBe.done, true);
    assert.equal(p.be, true);
    assert.equal(p.beAt, 103, 'cena progu, przy której trade jest bez ryzyka');
    assert.deepEqual(p.log.filter((x) => x.k === 'be-auto').map((x) => [x.at, x.v.price, x.v.sl]), [[T + 120, 103, 100]], 'wpis w log z chwilą końca świecy');
    r = W.advance(r.book, 'NQ', st, T + 180);
    assert.deepEqual(types(r.events), ['exit', 'closed']);
    const c = closedOf(r);
    assert.equal(c.exits[0].price, 100, 'stop na BE');
    assert.equal(c.exits[0].reason, 'sl');
    const res = W.tradeResult(c);
    assert.deepEqual([res.pnl, res.r], [0, 0], 'BE: zero ± prowizja');
    assert.equal(c.be, true);
    assert.equal(c.beAt, 103);
  });

  test('backtest-173: świeca z SL albo TP przed progiem: SL i TP wygrywają, próg się nie wyzwala', async () => {
    // świeca dotyka starego SL 95 i progu 103: najpierw SL (−5 · 20 = −100 $)
    let { W, book } = await open(ab('price', 103));
    let r = W.advance(book, 'NQ', S(bar(T, 100, 103, 94.5, 100)), T + 60);
    assert.deepEqual(types(r.events), ['exit', 'closed'], 'bez be-auto');
    assert.equal(closedOf(r).exits[0].price, 95);
    assert.equal(W.tradeResult(closedOf(r)).pnl, -100);
    assert.equal(closedOf(r).sl, 95, 'SL nie został przesunięty');
    // świeca dotyka TP 104 i progu 102: TP (4 · 20 = +80 $), bez be-auto
    ({ W, book } = await open(ab('price', 102), { tp: 104 }));
    r = W.advance(book, 'NQ', S(bar(T, 100, 105, 99.5, 104)), T + 60);
    assert.deepEqual(types(r.events), ['exit', 'closed']);
    assert.equal(closedOf(r).exits[0].reason, 'tp');
    assert.equal(W.tradeResult(closedOf(r)).pnl, 80);
    assert.equal(closedOf(r).beAt ?? null, null);
  });

  test('backtest-173: świeca wejścia nie wyzwala progu (zlecenie limit wypełnione w tej samej świecy)', async () => {
    const W = await mod();
    const o = MK('buy', { type: 'limit', price: 100, sl: 95, autoBe: ab('price', 101) });
    const { book } = W.placeOrder(W.emptyBook(), o, last(T, 101.5));
    // wypełnienie po 100; wysoko 102 ≥ 101, ale to świeca wejścia
    const b1 = bar(T, 101.5, 102, 99.5, 101);
    const b2 = bar(T + 60, 100.5, 100.75, 100.25, 100.5);
    // wysoko 101 ≥ 101: wyzwala
    const b3 = bar(T + 120, 100.5, 101, 100.25, 100.75);
    const st = S(b1, b2, b3);
    let r = W.advance(book, 'NQ', st, T + 60);
    assert.deepEqual(types(r.events), ['filled']);
    assert.equal(r.book.positions.NQ.autoBe.done, false);
    assert.equal(r.book.positions.NQ.sl, 95);
    r = W.advance(r.book, 'NQ', st, T + 120);
    assert.deepEqual(types(r.events), [], 'b2 nie sięga progu');
    r = W.advance(r.book, 'NQ', st, T + 180);
    assert.deepEqual(types(r.events), ['be-auto']);
    assert.equal(r.book.positions.NQ.sl, 100);
    assert.equal(r.book.positions.NQ.beAt, 101);
  });

  test('backtest-173: SL lepszy niż BE nie jest pogarszany: done bez zmiany i bez zdarzenia', async () => {
    const { W, book } = await open(null);
    let r = W.modifyPosition(book, 'NQ', { sl: 101 }, last(T, 102));
    r = W.modifyPosition(r.book, 'NQ', { autoBe: ab('price', 103) }, last(T, 102));
    assert.deepEqual(types(r.events), []);
    r = W.advance(r.book, 'NQ', S(bar(T, 102, 103.5, 102, 103)), T + 60);
    assert.deepEqual(types(r.events), [], 'bez komunikatu o zmianie');
    const p = r.book.positions.NQ;
    assert.equal(p.sl, 101, 'SL zostaje');
    assert.equal(p.autoBe.done, true, 'próg uznany za wykonany');
    assert.equal(p.be, false);
    // SL przesunięty ręcznie na 101 (BE albo lepiej) przy cenie 102 ustawił beAt = 102; próg nic już nie zmienia
    assert.equal(p.beAt, 102);
  });

  test('backtest-173: auto BE bez SL (pkt) ustawia SL; następna świeca z luką wykonuje stop po open', async () => {
    const { W, book } = await open(ab('pts', 2), { sl: null });
    assert.equal(book.positions.NQ.sl, null);
    const b1 = bar(T, 100, 102.5, 99.75, 102);
    // luka w dół: stop po open 99, nie po 100
    const b2 = bar(T + 60, 99, 99.5, 98.5, 99);
    const st = S(b1, b2);
    let r = W.advance(book, 'NQ', st, T + 60);
    assert.deepEqual(types(r.events), ['be-auto']);
    assert.equal(r.book.positions.NQ.sl, 100);
    assert.equal(r.book.positions.NQ.sl0, 100, 'to pierwszy postawiony SL (P5)');
    assert.equal(r.book.positions.NQ.rUsd, 0);
    r = W.advance(r.book, 'NQ', st, T + 120);
    const c = closedOf(r);
    assert.equal(c.exits[0].price, 99, 'luka: gorsza cena');
    const res = W.tradeResult(c);
    assert.deepEqual([res.pnl, res.r, res.rWhy], [-20, null, 'zero-risk'], '(99 − 100) · 20; R „—” przy ryzyku pierwotnym 0');
  });

  test('backtest-173: próg R bez SL odrzucony (bad-autobe); po usunięciu SL zostaje uzbrojony', async () => {
    const W = await mod();
    const noSl = W.placeOrder(W.emptyBook(), MK('buy'), last(T, 100)).book;
    let r = W.modifyPosition(noSl, 'NQ', { autoBe: ab('r', 1) }, last(T, 100));
    assert.equal(r.events[0].reason, 'bad-autobe');
    assert.equal(r.book.positions.NQ.autoBe, null, 'księga bez zmian');
    r = W.placeOrder(W.emptyBook(), MK('buy', { autoBe: ab('r', 1) }), last(T, 100));
    assert.equal(r.events[0].reason, 'bad-autobe', 'zlecenie z R bez SL');
    assert.equal(r.book.positions.NQ ?? null, null);
    // z SL 95 jest rUsd 100; potem SL usunięty (P6): próg R zostaje, bo rUsd już jest
    const { book } = await open(ab('r', 1));
    assert.equal(book.positions.NQ.rUsd, 100);
    r = W.modifyPosition(book, 'NQ', { sl: null }, last(T, 100.5));
    assert.equal(r.book.positions.NQ.sl, null);
    assert.equal(r.book.positions.NQ.autoBe.kind, 'r');
    assert.equal(W.autoBePrice(r.book.positions.NQ), 105, '100 + 1 · 100 / (1 · 20)');
    r = W.advance(r.book, 'NQ', S(bar(T, 100, 105, 99, 104)), T + 60);
    assert.deepEqual(types(r.events), ['be-auto']);
    assert.equal(r.book.positions.NQ.sl, 100);
    assert.equal(r.book.positions.NQ.sl0, 95, 'pierwszy SL zostaje (P6)');
  });

  test('backtest-173: dokładka przed wyzwoleniem przelicza próg; po wyzwoleniu nie przesuwa SL', async () => {
    const { W, book } = await open(ab('r', 1));
    assert.equal(W.autoBePrice(book.positions.NQ), 105);
    // dokładka 1@104: avg 102, rUsd = 1·5·20 + 1·9·20 = 280, qty 2 → próg 102 + 1 · 280 / (2 · 20) = 109
    let r = W.placeOrder(book, MK('buy'), last(T, 104));
    let p = r.book.positions.NQ;
    assert.deepEqual([p.avg, p.rUsd], [102, 280]);
    assert.equal(W.autoBePrice(p), 109);
    // 108,75 < 109
    const bA = bar(T, 104, 108.75, 103.5, 108);
    // 109: wyzwala, SL = poziom BE średniej 102
    const bB = bar(T + 60, 108, 109, 107.5, 108.5);
    const bC = bar(T + 120, 107, 112, 106.5, 111);
    const st = S(bA, bB, bC);
    r = W.advance(r.book, 'NQ', st, T + 60);
    assert.deepEqual(types(r.events), []);
    r = W.advance(r.book, 'NQ', st, T + 120);
    assert.deepEqual(types(r.events), ['be-auto']);
    assert.equal(r.book.positions.NQ.sl, 102);
    assert.equal(r.book.positions.NQ.beAt, 109);
    // dokładka po wyzwoleniu: avg (2·102 + 107) / 3 = 103,666667; SL zostaje 102, plakietka „SL” (be false), brak drugiego zdarzenia
    r = W.placeOrder(r.book, MK('buy'), last(T + 120, 107));
    p = r.book.positions.NQ;
    assert.equal(p.avg, 103.666667);
    assert.equal(p.sl, 102);
    assert.equal(p.be, false, 'poziom BE nowej średniej to 103,75');
    r = W.advance(r.book, 'NQ', S(bA, bB, bC), T + 180);
    assert.deepEqual(types(r.events), [], 'drugi raz nie wyzwala');
    assert.equal(r.book.positions.NQ.sl, 102);
  });

  test('backtest-173: oczekująca dokładka: w świecy jej wypełnienia próg czeka; po wyzwoleniu dokładka leżąca za nowym SL jest anulowana (add-beyond-sl)', async () => {
    const W = await mod();
    // Long 1@100, SL 95, próg 103; oczekująca dokładka limit 99 (nad SL 95, więc dopuszczona)
    const base = W.placeOrder(W.emptyBook(), MK('buy', { sl: 95, autoBe: ab('price', 103) }), last(T, 100)).book;
    const withAdd = W.placeOrder(base, MK('buy', { type: 'limit', price: 99 }), last(T, 100)).book;
    assert.equal(withAdd.orders.length, 1);
    assert.equal(withAdd.orders[0].intent, 'add');
    // świeca dotyka dokładki (low 98,75) i progu (high 103): dokładka wchodzi, ale próg w tej świecy nie jest sprawdzany (jak TP w świecy dokładki)
    const touch = bar(T, 100, 103, 98.75, 102);
    let r = W.advance(withAdd, 'NQ', S(touch), T + 60);
    assert.deepEqual(types(r.events), ['filled'], 'tylko dokładka, bez be-auto');
    assert.equal(r.book.positions.NQ.qty, 2);
    assert.equal(r.book.positions.NQ.autoBe.done, false);
    // następna świeca: próg liczony od nowej średniej (99,5), cena 103 nadal osiągnięta → wyzwala w następnej świecy
    r = W.advance(r.book, 'NQ', S(touch, bar(T + 60, 102, 103.25, 101.5, 102)), T + 120);
    assert.deepEqual(types(r.events), ['be-auto']);
    assert.equal(r.book.positions.NQ.sl, 99.5, 'BE od średniej (100 + 99) / 2 = 99,5');
    // dokładka limit 98 stoi poniżej nowego SL 99,5: po wyzwoleniu jest anulowana z powodem add-beyond-sl
    const pend = W.placeOrder(base, MK('buy', { type: 'limit', price: 98 }), last(T, 100)).book;
    r = W.advance(pend, 'NQ', S(bar(T, 100, 103, 100.5, 102)), T + 60);
    assert.deepEqual(types(r.events), ['be-auto', 'cancelled'], 'wyzwolenie i anulowanie dokładki za SL');
    assert.equal(r.events[1].reason, 'add-beyond-sl');
    assert.equal(r.book.orders.length, 0);
    assert.ok(r.events.some((e) => e.type === 'cancelled' && e.reason === 'add-beyond-sl') && !('gone' in r.book), 'powód niesie zdarzenie, bez book.gone');
    assert.equal(r.book.positions.NQ.sl, 100);
  });

  test('backtest-173: wyjście częściowe przed wyzwoleniem: próg $ od nowej otwartej ilości, R i pkt bez zmian', async () => {
    const W = await mod();
    const at = (a) => {
      const { book } = W.placeOrder(W.emptyBook(), MK('buy', { qty: 2, sl: 95, autoBe: a }), last(T, 100));
      const before = W.autoBePrice(book.positions.NQ);
      const after = W.autoBePrice(W.closePartial(book, 'NQ', 1, last(T + 60, 101)).book.positions.NQ);
      return [before, after];
    };
    assert.deepEqual(at(ab('usd', 80)), [102, 104], '80 $ przy 2 kontraktach = 2 pkt, przy 1 kontrakcie = 4 pkt');
    assert.deepEqual(at(ab('r', 1)), [105, 105], 'R liczone od całkowitego ryzyka i ilości wejść, nie od otwartej części');
    assert.deepEqual(at(ab('pts', 3)), [103, 103]);
    assert.deepEqual(at(ab('ticks', 8)), [102, 102]);
    assert.deepEqual(at(ab('price', 104)), [104, 104]);
  });

  test('backtest-173: offset BE+2t: SL na BE + 0,50 (Long) i − 0,50 (Short); be w pozycji tylko bez offsetu', async () => {
    let { W, book } = await open(ab('price', 102, { offsetTicks: 2 }));
    let r = W.advance(book, 'NQ', S(bar(T, 100, 102, 99.75, 101.5)), T + 60);
    assert.deepEqual(types(r.events), ['be-auto']);
    assert.equal(r.book.positions.NQ.sl, 100.5);
    assert.equal(r.book.positions.NQ.be, false, 'plakietka pokazuje „BE+2t”, nie „BE”');
    assert.equal(r.book.positions.NQ.beAt, 102, 'cena progu zapisana także przy offsecie');
    r = W.advance(r.book, 'NQ', S(bar(T, 100, 102, 99.75, 101.5), bar(T + 60, 101.5, 101.75, 100.25, 100.5)), T + 120);
    const c = closedOf(r);
    assert.deepEqual([c.exits[0].price, W.tradeResult(c).pnl, c.be], [100.5, 10, false], 'stop 100,5: +0,5 · 20 = +10 $; trade bez be');
    ({ W, book } = await open(ab('price', 98, { offsetTicks: 2 }), { side: 'sell' }));
    r = W.advance(book, 'NQ', S(bar(T, 100, 100.25, 98, 98.5)), T + 60);
    assert.equal(r.book.positions.NQ.sl, 99.5, 'Short: 100 − 2 · 0,25');
  });

  test('backtest-173: Short: próg w R po stronie zysku, SL na BE w dół', async () => {
    const { W, book } = await open(ab('r', 1), { side: 'sell' });
    assert.equal(W.autoBePrice(book.positions.NQ), 95);
    let r = W.advance(book, 'NQ', S(bar(T, 100, 100.5, 95.25, 96)), T + 60);
    assert.deepEqual(types(r.events), [], 'najniżej 95,25 > 95: bez wyzwolenia');
    r = W.advance(r.book, 'NQ', S(bar(T, 100, 100.5, 95.25, 96), bar(T + 60, 96, 97, 95, 95.5)), T + 120);
    assert.deepEqual(types(r.events), ['be-auto']);
    assert.equal(r.book.positions.NQ.sl, 100);
    assert.equal(r.book.positions.NQ.beAt, 95);
  });

  test('backtest-173: znak wodny: cofnięcie i ponowny przebieg nie dają drugiego be-auto', async () => {
    const { W, book } = await open(ab('price', 103));
    const st = S(bar(T, 100, 103, 100.25, 102), bar(T + 60, 102, 102.5, 101, 102));
    let r = W.advance(book, 'NQ', st, T + 120);
    assert.deepEqual(types(r.events), ['be-auto']);
    const after = r.book;
    // kursor cofnięty (przeglądanie wstecz): silnik nic nie przetwarza
    r = W.advance(after, 'NQ', st, T + 60);
    assert.deepEqual(types(r.events), []);
    assert.deepEqual(r.book.positions.NQ.log, after.positions.NQ.log, 'log bez zmian');
    // ponowne dojście do tego samego miejsca: znak wodny już stoi
    r = W.advance(after, 'NQ', st, T + 120);
    assert.deepEqual(types(r.events), []);
    // nawet gdyby znak wodny zginął (stara księga), flaga done blokuje drugie wyzwolenie
    const noHw = { ...after, hwi: {}, hw: 0 };
    r = W.advance(noHw, 'NQ', st, T + 120);
    assert.deepEqual(types(r.events), [], 'done blokuje drugi raz');
    assert.equal(r.book.positions.NQ.log.filter((x) => x.k === 'be-auto').length, 1);
  });

  test('backtest-173: po wyzwoleniu próg nie wyzwala się drugi raz, także gdy trader cofnął SL ręcznie poniżej BE', async () => {
    const { W, book } = await open(ab('price', 103));
    const st = S(bar(T, 100, 103, 100.25, 102), bar(T + 60, 102, 104, 101, 103));
    let r = W.advance(book, 'NQ', st, T + 60);
    assert.deepEqual(types(r.events), ['be-auto']);
    assert.equal(r.book.positions.NQ.sl, 100);
    // trader cofa SL poniżej BE (95 < cena bieżąca 102), a następna świeca znowu sięga progu 103
    r = W.modifyPosition(r.book, 'NQ', { sl: 95 }, last(T + 60, 102));
    assert.equal(r.book.positions.NQ.sl, 95);
    r = W.advance(r.book, 'NQ', st, T + 120);
    assert.deepEqual(types(r.events), [], 'flaga done: brak drugiego be-auto');
    assert.equal(r.book.positions.NQ.sl, 95, 'SL zostaje tam, gdzie go postawił trader');
    assert.equal(r.book.positions.NQ.autoBe.done, true);
    // nowy próg (jawna decyzja tradera) uzbraja automat od nowa
    r = W.modifyPosition(r.book, 'NQ', { autoBe: ab('price', 105) }, last(T + 120, 103));
    assert.equal(r.book.positions.NQ.autoBe.done, false);
    r = W.advance(r.book, 'NQ', S(bar(T, 100, 103, 100.25, 102), bar(T + 60, 102, 104, 101, 103), bar(T + 120, 103, 105.5, 102.5, 105)), T + 180);
    assert.deepEqual(types(r.events), ['be-auto']);
    assert.equal(r.book.positions.NQ.sl, 100, 'drugi próg przesuwa SL na BE od następnej świecy');
  });

  test('backtest-173: beAt idzie za SL: powstaje przy przesunięciu SL na BE albo lepiej, znika po cofnięciu pod BE i po usunięciu SL; wpisy w log z at', async () => {
    const { W, book } = await open(null);
    // przeciągnięcie SL na BE (100) przy cenie 101: beAt = cena bieżąca
    let r = W.modifyPosition(book, 'NQ', { sl: 100 }, last(T + 60, 101));
    let p = r.book.positions.NQ;
    assert.equal(p.beAt, 101, 'cena bieżąca w chwili przesunięcia');
    assert.deepEqual(p.log.filter((x) => x.k === 'beAt').map((x) => [x.at, x.v]), [[T + 60, 101]]);
    // SL jeszcze dalej w zysk (101,5) nie zmienia beAt: trade już był bez ryzyka
    r = W.modifyPosition(r.book, 'NQ', { sl: 101.5 }, last(T + 90, 103));
    assert.equal(r.book.positions.NQ.beAt, 101);
    // cofnięcie SL poniżej BE kasuje beAt z wpisem
    r = W.modifyPosition(r.book, 'NQ', { sl: 97 }, last(T + 120, 102));
    p = r.book.positions.NQ;
    assert.equal(p.beAt, null);
    assert.deepEqual(p.log.filter((x) => x.k === 'beAt').map((x) => [x.at, x.v]), [[T + 60, 101], [T + 120, null]]);
    // ponowne przesunięcie na BE: nowa cena bieżąca
    r = W.modifyPosition(r.book, 'NQ', { sl: 100 }, last(T + 150, 102.25));
    assert.equal(r.book.positions.NQ.beAt, 102.25);
    // usunięcie SL też kasuje beAt (pozycja bez SL nie jest bez ryzyka)
    r = W.modifyPosition(r.book, 'NQ', { sl: null }, last(T + 180, 102.5));
    assert.equal(r.book.positions.NQ.beAt, null);
    // BE z przyciskiem i offsetem: beAt = cena bieżąca, SL = BE + offset
    ({ book: r } = { book: W.moveToBE(book, 'NQ', last(T + 60, 102), { offsetTicks: 2 }) });
    assert.deepEqual([r.book.positions.NQ.sl, r.book.positions.NQ.beAt], [100.5, 102]);
  });

  test('backtest-173: S3 i S4: SL przeciągnięty na BE przed progiem zostawia beAt z przeciągnięcia; BE przyciskiem i cofnięcie SL pod BE nie zostawia beAt w trade\'ie', async () => {
    const W = await mod();
    const { toTrade } = await imp('public/js/bt-journal.js');
    const { tradeInput } = await imp('lib/backtest-sync.mjs');
    const sess = { id: 'bt-abc123', name: 'S', def: {} };
    // S3: SL ręcznie na BE przy 101, potem próg 103 wyzwala się bez zmiany SL: beAt = 101 (ręczne), nie cena wejścia
    let { book } = await open(ab('price', 103));
    book = W.modifyPosition(book, 'NQ', { sl: 100 }, last(T, 101)).book;
    let r = W.advance(book, 'NQ', S(bar(T, 101, 103.5, 100.5, 103), bar(T + 60, 103, 103, 99.5, 100)), T + 120);
    const c3 = closedOf(r);
    const t3 = toTrade(c3, { day: '2024-03-12', id: 't3' });
    assert.equal(t3.beAt, 101);
    assert.equal(tradeInput(sess, { ...t3, entryT: 1710250000, exitT: 1710250600 }).be, 101, 'Notion: cena bieżąca przy ręcznym BE, nie cena wejścia 100');
    // S4: BE przy 102, potem SL cofnięty na 97 i stop: trade nie był bez ryzyka przy zamknięciu, więc beAt pusty i bez pola BE
    ({ book } = await open(null));
    book = W.moveToBE(book, 'NQ', last(T, 102)).book;
    book = W.modifyPosition(book, 'NQ', { sl: 97 }, last(T + 30, 101)).book;
    r = W.advance(book, 'NQ', S(bar(T, 101, 101.5, 96.5, 97)), T + 60);
    const t4 = toTrade(closedOf(r), { day: '2024-03-12', id: 't4' });
    assert.deepEqual([t4.beAt, t4.pnl < 0], [null, true]);
    assert.equal('be' in tradeInput(sess, { ...t4, entryT: 1710250000, exitT: 1710250600 }), false);
    // S1: auto-BE wyzwolony na 103, trader przesuwa SL na 102 (dalej w zysk), stop na 102: beAt zostaje 103, Notion dostaje 103
    ({ book } = await open(ab('price', 103)));
    r = W.advance(book, 'NQ', S(bar(T, 100, 103, 100.25, 102)), T + 60);
    book = W.modifyPosition(r.book, 'NQ', { sl: 102 }, last(T + 60, 102.5)).book;
    r = W.advance(book, 'NQ', S(bar(T, 100, 103, 100.25, 102), bar(T + 60, 102.5, 102.5, 101.5, 102)), T + 120);
    const t1 = toTrade(closedOf(r), { day: '2024-03-12', id: 't1' });
    assert.deepEqual([t1.beAt, t1.be], [103, false]);
    assert.equal(tradeInput(sess, { ...t1, entryT: 1710250000, exitT: 1710250600 }).be, 103);
  });

  test('backtest-173: offset nie może sięgać progu (bad-autobe z powodem autobe-offset); bezpiecznik przy wyzwoleniu po dokładce', async () => {
    const { W, book } = await open(null);
    // próg 1 pkt (101), offset 20t = 5 pkt: SL 105 byłby nad ceną
    let r = W.modifyPosition(book, 'NQ', { autoBe: ab('pts', 1, { offsetTicks: 20 }) }, last(T, 100.5));
    assert.equal(r.events[0].reason, 'autobe-offset');
    assert.equal(r.book.positions.NQ.autoBe, null);
    // próg w R z SL 95 (1R = 5 pkt), offset 19t = 4,75 pkt < 5: dopuszczony; 20t = 5 pkt: odrzucony
    const { book: b2 } = await open(null);
    assert.equal(W.modifyPosition(b2, 'NQ', { autoBe: ab('r', 1, { offsetTicks: 19 }) }, last(T, 100.5)).events.length, 0);
    assert.equal(W.modifyPosition(b2, 'NQ', { autoBe: ab('r', 1, { offsetTicks: 20 }) }, last(T, 100.5)).events[0].reason, 'autobe-offset');
    // zlecenie z takim progiem też jest odrzucone, a bez offsetu przechodzi
    assert.equal(W.placeOrder(W.emptyBook(), MK('buy', { sl: 95, autoBe: ab('pts', 1, { offsetTicks: 8 }) }), last(T, 100)).events[0].reason, 'autobe-offset');
    assert.deepEqual(types(W.placeOrder(W.emptyBook(), MK('buy', { sl: 95, autoBe: ab('pts', 1, { offsetTicks: 3 }) }), last(T, 100)).events), ['filled']);
    // bezpiecznik: próg „cena 103”, offset 8t (poziom 102 < 103: dopuszczone), potem dokładka 1@104 przesuwa średnią na 102 i poziom BE+offset = 104 ≥ cena progu
    let { book: b3 } = await open(ab('price', 103, { offsetTicks: 8 }));
    b3 = W.placeOrder(b3, MK('buy'), last(T, 104)).book;
    r = W.advance(b3, 'NQ', S(bar(T, 102, 103.5, 100.5, 103)), T + 60);
    assert.deepEqual(types(r.events), ['be-auto']);
    assert.equal(r.events[0].sl, 102.75, 'poziom obcięty do ticka pod ceną progu (Long)');
    assert.equal(r.book.positions.NQ.sl, 102.75);
  });

  test('backtest-173: done bez zmiany SL ma wpis be-auto z changed false i at (pakiet 6 odtworzy flagę)', async () => {
    const { W, book } = await open(null);
    let r = W.modifyPosition(book, 'NQ', { sl: 101 }, last(T, 102));
    r = W.modifyPosition(r.book, 'NQ', { autoBe: ab('price', 103) }, last(T, 102));
    r = W.advance(r.book, 'NQ', S(bar(T, 102, 103.5, 102, 103)), T + 60);
    assert.deepEqual(types(r.events), []);
    const e = r.book.positions.NQ.log.filter((x) => x.k === 'be-auto');
    assert.deepEqual(e.map((x) => [x.at, x.v.price, x.v.sl, x.v.changed]), [[T + 60, 103, 101, false]]);
    assert.equal(r.book.positions.NQ.beAt, 102, 'beAt z przesunięcia SL na 101 przy cenie 102 (reguła beAt zachowana)');
  });

  // RUNDA 3 (R2-1): reguła beAt w jednej funkcji (trackBeAt) wołanej po modifyPosition i po wypełnieniu dokładki; ocena „bez ryzyka” zawsze względem nowej średniej.
  test('backtest-173 r3 S7: dokładka po BE kasuje beAt (SL 100 jest gorszy niż nowe BE 103), z wpisem w log; trade nie niesie beAt do Notion', async () => {
    const { W, book } = await open(null);
    // Long 1@100, SL 95; BE przyciskiem przy 102: SL 100, beAt 102
    let r = W.moveToBE(book, 'NQ', last(T + 60, 102));
    assert.equal(r.book.positions.NQ.beAt, 102);
    // dokładka 1@106: średnia 103, BE 103, SL 100 gorszy => trade nie jest już bez ryzyka (pozostałe ryzyko 3 pkt na kontrakt = 120 $ przy stopie)
    r = W.placeOrder(r.book, MK('buy'), last(T + 120, 106));
    const p = r.book.positions.NQ;
    assert.deepEqual([p.avg, p.sl, p.beAt], [103, 100, null], 'średnia 103, SL bez zmian, beAt skasowane');
    assert.deepEqual(p.log.filter((x) => x.k === 'beAt').map((x) => [x.at, x.v]), [[T + 60, 102], [T + 120, null]]);
    r = W.advance(r.book, 'NQ', S(bar(T + 120, 106, 106, 99.5, 100)), T + 180);
    const c = closedOf(r);
    assert.equal(c.beAt ?? null, null, 'stop po dokładce: Notion/Journal nie mówią „bez ryzyka od 102”');
    assert.equal(c.exits[0].price, 100, 'wynik −120 $ liczony z cen: 2 · (100 − 103) · 20');
  });

  test('backtest-173 r3 S7b: pierwsza korekta SL po dokładce nie zmienia beAt (już skasowane w chwili wypełnienia), wynik nie zależy od dotknięcia SL', async () => {
    const { W, book } = await open(null);
    let r = W.moveToBE(book, 'NQ', last(T + 60, 102));
    r = W.placeOrder(r.book, MK('buy'), last(T + 120, 106));
    // korekta SL na 100,5 (nadal gorszy niż BE 103): beAt zostaje null i nie ma nowego wpisu beAt
    const r2 = W.modifyPosition(r.book, 'NQ', { sl: 100.5 }, last(T + 150, 106));
    assert.equal(r2.book.positions.NQ.beAt, null);
    assert.equal(r2.book.positions.NQ.log.filter((x) => x.k === 'beAt').length, 2, 'tylko wpisy z BE i z dokładki');
    // ścieżka z dotknięciem SL w tej samej świecy i bez korekty daje to samo beAt (null)
    const c1 = closedOf(W.advance(r2.book, 'NQ', S(bar(T + 150, 106, 106, 100, 100.5)), T + 210));
    const c2 = closedOf(W.advance(r.book, 'NQ', S(bar(T + 120, 106, 106, 99.5, 100)), T + 180));
    assert.deepEqual([c1.beAt ?? null, c2.beAt ?? null], [null, null]);
    // dokładka, która zostawia SL na BE albo lepiej, zachowuje beAt: SL 104, dokładka 1@106 → średnia 105 > 104, więc gorszy; ale SL 105,25 pozostaje bez ryzyka
    const { book: b2 } = await open(null);
    let q = W.modifyPosition(b2, 'NQ', { sl: 105 }, last(T + 60, 108));
    assert.equal(q.book.positions.NQ.beAt, 108);
    q = W.placeOrder(q.book, MK('buy'), last(T + 120, 108));
    assert.deepEqual([q.book.positions.NQ.avg, q.book.positions.NQ.beAt], [104, 108], 'średnia 104, SL 105 nadal lepszy: beAt zostaje');
  });

  test('backtest-173 r3: Short, lustro S7: dokładka 1@94 po BE przy 98 przesuwa średnią na 97, SL 100 gorszy niż BE, beAt skasowane; dokładka nie może uczynić trade bez ryzyka (add za SL jest odrzucona)', async () => {
    const W = await mod();
    let r = W.placeOrder(W.emptyBook(), MK('sell', { sl: 105 }), last(T, 100));
    r = W.moveToBE(r.book, 'NQ', last(T + 60, 98));
    assert.deepEqual([r.book.positions.NQ.sl, r.book.positions.NQ.beAt], [100, 98]);
    r = W.placeOrder(r.book, MK('sell'), last(T + 120, 94));
    const p = r.book.positions.NQ;
    assert.deepEqual([p.avg, p.sl, p.beAt], [97, 100, null], 'średnia (100 + 94) / 2 = 97');
    assert.deepEqual(p.log.filter((x) => x.k === 'beAt').map((x) => [x.at, x.v]), [[T + 60, 98], [T + 120, null]]);
    // dokładka leżąca za SL jest odrzucona, więc beAt się nie zmienia
    const { W: W3, book } = await open(null);
    const m = W3.modifyPosition(book, 'NQ', { sl: 99.75 }, last(T, 100.5));
    assert.equal(W3.placeOrder(m.book, MK('buy'), last(T + 60, 99)).events[0].reason, 'add-beyond-sl');
  });

  test('backtest-173 r3 (R2-3): obcięcie po dokładce, które wyłącza przesunięcie SL, ma zdarzenie be-auto-skipped i wpis w log z powodem; zwykłe „SL już lepszy” bez zdarzenia', async () => {
    const { W, book } = await open(ab('price', 103));
    // dokładka 1@106: średnia 103; poziom BE 103, bezpiecznik: SL musiałby być o tick pod ceną progu 103 = 102,75 < BE → próg tylko wykonany
    const b2 = W.placeOrder(book, MK('buy'), last(T, 106)).book;
    const r = W.advance(b2, 'NQ', S(bar(T, 104, 105, 103.5, 104)), T + 60);
    assert.deepEqual(types(r.events), ['be-auto-skipped']);
    assert.deepEqual([r.events[0].why, r.events[0].price, r.events[0].at], ['cap', 103, T + 60]);
    const p = r.book.positions.NQ;
    assert.equal(p.sl, 95, 'SL bez zmian');
    assert.equal(p.autoBe.done, true);
    const e = p.log.filter((x) => x.k === 'be-auto');
    assert.deepEqual(e.map((x) => [x.at, x.v.changed, x.v.why]), [[T + 60, false, 'cap']]);
    // SL już lepszy niż BE: flaga done, wpis z powodem sl-better, bez zdarzenia
    const { W: W2, book: b3 } = await open(null);
    let q = W2.modifyPosition(b3, 'NQ', { sl: 101 }, last(T, 102));
    q = W2.modifyPosition(q.book, 'NQ', { autoBe: ab('price', 103) }, last(T, 102));
    q = W2.advance(q.book, 'NQ', S(bar(T, 102, 103.5, 102, 103)), T + 60);
    assert.deepEqual(types(q.events), []);
    assert.equal(q.book.positions.NQ.log.filter((x) => x.k === 'be-auto')[0].v.why, 'sl-better');
  });

  test('backtest-173 r4: podpis BE: przy pozycji węższej niż 40 px stoi przy lewym końcu (prawy leży pod plakietką progu), inaczej przy prawym; strefa zysku/straty dla koloru obrysu', async () => {
    const { positionExtras } = await imp('public/js/geometria.js');
    const s = { y: (p) => 1000 - p * 10, decimal: '.' };
    const mk = (x1, x2, beLevel) => positionExtras({ style: { beLevel }, locked: true }, s, { x1, x2, entry: 100, dir: 1, stop: 5, profit: 10, yE: 0, yT: 0 }).find((p) => p.role === 'be-label');
    const wide = mk(0, 90, 3), narrow = mk(0, 20, 3);
    assert.deepEqual([wide.anchor, wide.x], ['end', 86], 'szeroka: prawy koniec linii (90 − 4)');
    assert.deepEqual([narrow.anchor, narrow.x], ['start', 3], 'wąska (20 px < 40): lewy koniec, x1 + 3');
    assert.equal(wide.zone, 'profit', 'BE 3 pkt nad wejściem przy TP 10: strefa zysku');
    assert.equal(mk(0, 90, -2).zone, 'loss', 'BE 2 pkt pod wejściem przy SL 5: strefa straty');
    assert.equal(mk(0, 90, 12).zone, null, 'BE za TP: poza strefą');
  });

  test('backtest-173 r4: czas auto BE = koniec świecy z dotknięciem progu; stop następnej świecy ma czas jej początku, więc nie wypada przed auto BE (świece o różnej długości)', async () => {
    const { W, book } = await open(ab('price', 103));
    // świeca 1 (T, 15 s) dotyka 103: auto BE o T + 15; świeca 2 (T + 15, 15 s) wybija SL 100: wyjście o T + 15
    const st = { bars: [bar(T, 100, 103, 99.5, 102), bar(T + 15, 102, 102, 99.75, 100)], len: [15, 15] };
    const r = W.advance(book, 'NQ', st, T + 30);
    const be = r.events.find((e) => e.type === 'be-auto'), c = closedOf(r);
    assert.equal(be.at, T + 15, 'koniec świecy 1');
    assert.deepEqual(c.log.filter((x) => x.k === 'be-auto').map((x) => x.at), [T + 15]);
    assert.equal(c.exits[0].t, T + 15, 'wyjście w świecy 2: początek świecy 2');
    assert.ok(c.exits[0].t >= be.at, 'auto BE nie później niż wyjście');
  });

  test('backtest-173: gapUnderBe: trade zamknięty po auto-BE stopem z luką pod poziomem BE', async () => {
    const W = await mod();
    const { toTrade } = await imp('public/js/bt-journal.js');
    const { gapUnderBe } = await imp('public/js/bt-ksiega.js');
    const mkTrade = async (bars) => {
      const { book } = await open(ab('price', 103));
      const r = W.advance(book, 'NQ', S(...bars), T + 60 * bars.length);
      return toTrade(closedOf(r), { day: '2024-03-12' });
    };
    // wyzwolenie w pierwszej świecy, druga otwiera się w dół (luka): stop po open 99 przy SL 100
    const gap = await mkTrade([bar(T, 100, 103, 100.25, 102), bar(T + 60, 99, 99.5, 98.5, 99)]);
    assert.deepEqual(gapUnderBe(gap), { sl: 100, exit: 99 });
    // stop dokładnie na 100 (bez luki): brak faktu
    const clean = await mkTrade([bar(T, 100, 103, 100.25, 102), bar(T + 60, 100.5, 101, 99.5, 100)]);
    assert.equal(gapUnderBe(clean), null);
    // trade bez auto-BE i trade zamknięty z zyskiem: brak faktu
    const { book } = await open(null);
    const t0 = toTrade(closedOf(W.advance(book, 'NQ', S(bar(T, 100, 100.5, 94, 95)), T + 60)), { day: '2024-03-12' });
    assert.equal(gapUnderBe(t0), null);
    assert.equal(gapUnderBe(null), null);
  });

  test('backtest-173: walidacja autoBe: zły rodzaj, wartość, offset i cena po złej stronie → bad-autobe', async () => {
    const { W, book } = await open(null);
    const why = (a) => W.modifyPosition(book, 'NQ', { autoBe: a }, last(T, 100.5)).events.map((e) => e.reason).join(',');
    assert.equal(why(ab('foo', 1)), 'bad-autobe');
    assert.equal(why(ab('pts', 0)), 'bad-autobe');
    assert.equal(why(ab('pts', -2)), 'bad-autobe');
    assert.equal(why(ab('pts', NaN)), 'bad-autobe');
    assert.equal(why(ab('pts', 2, { offsetTicks: 21 })), 'bad-autobe');
    assert.equal(why(ab('pts', 2, { offsetTicks: 1.5 })), 'bad-autobe');
    assert.equal(why(ab('price', 99)), 'bad-autobe', 'Long: cena progu pod średnią');
    assert.equal(why(ab('price', 100)), 'bad-autobe', 'cena progu na średniej');
    assert.equal(why(ab('ticks', 40, { offsetTicks: 20 })), '', 'poprawne: offset 20 to granica (poziom 105 < próg 110)');
    assert.equal(why(ab('price', 100.25)), '', 'tick nad średnią');
    const ok = W.modifyPosition(book, 'NQ', { autoBe: { kind: 'pts', value: 2, junk: 1 } }, last(T, 100.5));
    assert.deepEqual(ok.book.positions.NQ.autoBe, { kind: 'pts', value: 2, offsetTicks: 0, done: false }, 'kształt znormalizowany, obce pola odpadają');
    const off = W.modifyPosition(ok.book, 'NQ', { autoBe: null }, last(T, 100.5));
    assert.equal(off.book.positions.NQ.autoBe, null, 'null wyłącza');
    assert.equal(off.book.positions.NQ.log.at(-1).k, 'autoBe');
    assert.equal(off.book.positions.NQ.log.at(-1).v, null);
  });

  test('backtest-173: BE ręczny zapisuje beAt = cena bieżąca; odwrócenie i zlecenia przeciwne niosą auto-BE tylko do nowej pozycji', async () => {
    let { W, book } = await open(null);
    let r = W.moveToBE(book, 'NQ', last(T + 60, 101.75));
    assert.equal(r.book.positions.NQ.sl, 100);
    assert.equal(r.book.positions.NQ.beAt, 101.75, 'cena, przy której trade stał się bez ryzyka');
    // odwrócenie z auto-BE: nowa pozycja ma uzbrojony próg, stara pozycja jest zamknięta
    ({ W, book } = await open(ab('pts', 2)));
    r = W.reversePosition(book, 'NQ', last(T + 60, 101), { sl: 106, autoBe: ab('pts', 3) });
    const np = r.book.positions.NQ;
    assert.deepEqual([np.dir, np.autoBe], ['Short', { kind: 'pts', value: 3, offsetTicks: 0, done: false }]);
    assert.equal(closedOf(r).autoBe.value, 2, 'zamknięta pozycja zachowuje swój');
    // zlecenie przeciwne: zmniejszenie ignoruje autoBe zlecenia; netting z odwróceniem go bierze
    ({ W, book } = await open(ab('pts', 2), { qty: 2 }));
    r = W.placeOrder(book, MK('sell', { qty: 1, autoBe: ab('pts', 9) }), last(T + 60, 101));
    assert.equal(r.book.positions.NQ.autoBe.value, 2, 'zmniejszenie: próg pozycji bez zmian');
    r = W.placeOrder(book, MK('sell', { qty: 3, sl: 106, autoBe: ab('pts', 9) }), last(T + 60, 101));
    assert.equal(r.book.positions.NQ.dir, 'Short');
    assert.equal(r.book.positions.NQ.autoBe.value, 9, 'netting z odwróceniem: próg zlecenia dla nowej pozycji');
    // dokładka tego samego kierunku nie zmienia progu pozycji
    r = W.placeOrder(book, MK('buy', { qty: 1, autoBe: ab('pts', 9) }), last(T + 60, 101));
    assert.equal(r.book.positions.NQ.autoBe.value, 2);
  });

  test('backtest-173: trade niesie beAt, autoBe i wpis be-auto w log (toTrade)', async () => {
    const W = await mod();
    const { toTrade } = await imp('public/js/bt-journal.js');
    const { book } = await open(ab('price', 103));
    let r = W.advance(book, 'NQ', S(bar(T, 100, 103, 99.5, 102), bar(T + 60, 102, 102, 99.75, 100)), T + 120);
    const tr = toTrade(closedOf(r), { day: '2024-03-12' });
    assert.deepEqual([tr.be, tr.beAt], [true, 103]);
    assert.equal(tr.autoBe.done, true);
    assert.deepEqual(tr.log.filter((x) => x.k === 'be-auto').map((x) => x.v.price), [103]);
    // pozycja bez BE: beAt null
    const { book: b2 } = await open(null);
    r = W.advance(b2, 'NQ', S(bar(T, 100, 100.5, 94, 95)), T + 60);
    assert.equal(toTrade(closedOf(r), { day: '2024-03-12' }).beAt, null);
  });

  test('backtest-173: Notion, pole „BE”: cena progu auto-BE albo cena bieżąca przy ręcznym BE; trade 1.6 po staremu', async () => {
    const { tradeInput } = await imp('lib/backtest-sync.mjs');
    const sess = { id: 'bt-abc123', name: 'S', def: {} };
    const base = { id: 't1', day: '2024-03-12', instrument: 'NQ', dir: 'Long', entryT: 1710250000, exitT: 1710250600, entryPrice: 100, exitPrice: 100, sl0: 95, sl: 100, tp: null, r: 0, pnl: 0 };
    // auto-BE: próg 103, SL stanął na 100; do Notion idzie 103 (nie cena wejścia)
    assert.equal(tradeInput(sess, { ...base, fills: [{ qty: 1, price: 100 }], be: true, beAt: 103 }).be, 103);
    // ręczny BE: cena bieżąca w chwili przesunięcia
    assert.equal(tradeInput(sess, { ...base, fills: [{ qty: 1, price: 100 }], be: true, beAt: 101.75 }).be, 101.75);
    // be bez beAt (pozycja zmigrowana z 1.6.x z fills): poziom SL
    assert.equal(tradeInput(sess, { ...base, fills: [{ qty: 1, price: 100 }], be: true }).be, 100);
    // trade 1.6 (bez fills): cena wejścia jak dotąd
    assert.equal(tradeInput(sess, { ...base, be: true }).be, 100);
    // Decyzja sesji głównej 2.11.2026 (wariant A): beAt idzie do pola „BE” także wtedy, gdy SL stoi dalej w zysku albo z offsetem (be false)
    assert.equal(tradeInput(sess, { ...base, fills: [{ qty: 1, price: 100 }], be: false, beAt: 103 }).be, 103);
    // bez beAt i bez be (trade nigdy nie był bez ryzyka albo SL cofnięto pod BE) pole puste
    assert.equal('be' in tradeInput(sess, { ...base, fills: [{ qty: 1, price: 100 }], be: false, beAt: null }), false);
  });

  // ---- atrapa Notion: strona trade'a dostaje w polu „BE” cenę progu ----
  const I = H.IDS;
  const SID = 'bt-k3f9x2abc';
  const SOURCES = { trades: I.DS_TRADES, konta: I.DS_KONTA, dziennik: I.DS_DZIENNIK, finanse: I.DS_FINANSE };
  const T0 = Date.UTC(2024, 2, 12, 13, 45) / 1000;
  test('backtest-173: atrapa Notion: strona trade\'a z auto-BE ma w polu BE cenę progu (nie cenę wejścia), ręczny BE cenę bieżącą', async () => {
    const A = await H.atrapa(5731);
    try {
      const dir = H.tmp();
      writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x\nNOTION_ROOT_URL=${H.PARENT_URL}\nDS_TRADES=${I.DS_TRADES}\nDS_KONTA=${I.DS_KONTA}\nDS_DZIENNIK=${I.DS_DZIENNIK}\nDS_FINANSE=${I.DS_FINANSE}\n`);
      writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: 2, lang: 'pl' }));
      const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
      assert.equal(mig.code, 0, mig.err);
      const { createNotion } = await imp('lib/notion.mjs');
      const { createData } = await imp('lib/data.mjs');
      const { createWriter } = await imp('lib/writes.mjs');
      const { createDrawings } = await imp('lib/drawings.mjs');
      const { createBacktestStore } = await imp('lib/backtest-store.mjs');
      const { createBacktestSync } = await imp('lib/backtest-sync.mjs');
      const { tr: t } = await imp('lib/i18n.mjs');
      const notion = createNotion({ token: 'x', base: A.base, t });
      const cfg = JSON.parse(readFileSync(path.join(dir, 'config.local.json'), 'utf8'));
      const data = createData({ notion, sources: SOURCES, getConfig: () => cfg, persistConfig: () => {}, rootUrl: H.PARENT_URL });
      const writer = createWriter({ notion, sources: SOURCES, data, t });
      const drawings = createDrawings({ notion, sources: SOURCES, data, t, baseDir: path.join(dir, 'chart-data') });
      const store = createBacktestStore({ baseDir: path.join(dir, 'chart-data'), t, log: () => {} });
      const sync = createBacktestSync({ store, writer, drawings, data, t, log: () => {} });
      // trade z silnika: auto-BE 103 → SL 100 → stop 100; drugi: ręczny BE przy 101,75 → stop 100
      const W = await mod();
      const { toTrade } = await imp('public/js/bt-journal.js');
      const mk = (n, run) => {
        const tr = toTrade(run, { day: '2024-03-12', id: `t${n}` });
        return { ...tr, entryT: T0 + n * 600, exitT: T0 + n * 600 + 300, setup: 'Breakout', notes: '', journal: 'done' };
      };
      const { book: b1 } = await open(ab('price', 103));
      const r1 = W.advance(b1, 'NQ', S(bar(T, 100, 103, 99.5, 102), bar(T + 60, 102, 102, 99.75, 100)), T + 120);
      const { book: b2 } = await open(null);
      const m2 = W.moveToBE(b2, 'NQ', last(T, 101.75));
      const r2 = W.advance(m2.book, 'NQ', S(bar(T, 101.75, 102, 99.75, 100)), T + 60);
      const doc = {
        v: 2, id: SID, name: 'CPI 2024', created: '2024-01-01T00:00:00.000Z',
        def: { instruments: ['NQ'], from: '2024-03-11', balance: 50000, risk: { mode: 'usd', value: 500 }, startTime: '09:00', accountId: null, filter: null, excluded: [] },
        cursor: null, hw: 0, layout: { kind: '1', charts: [{ instrument: 'NQ', tf: '1m' }], active: 0 }, book: null, trades: [mk(1, closedOf(r1)), mk(2, closedOf(r2))], drawings: {},
      };
      store.save(SID, doc, 0);
      const res = await sync.push({ sessionId: SID });
      assert.deepEqual([res.sent, res.failed.length], [2, 0], JSON.stringify(res.failed));
      const pages = (await A.get('/__test/pages?ds=trades')).filter((p) => p.p.Typ?.select?.name === 'Backtest');
      const txt = (p) => (p.p['Sesja backtestu']?.rich_text || []).map((x) => x.text?.content ?? x.plain_text ?? '').join('');
      assert.equal(pages.find((p) => txt(p).endsWith('/t1]')).p.BE.number, 103, 'auto-BE: cena progu');
      assert.equal(pages.find((p) => txt(p).endsWith('/t2]')).p.BE.number, 101.75, 'ręczny BE: cena bieżąca');
      assert.deepEqual(await A.get('/__test/violations'), []);
    } finally { A.stop(); }
  });
};
