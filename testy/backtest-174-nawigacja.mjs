// backtest-174 (Node): pakiet 1.7-4 „Prawy klik i nawigacja” (docs/plany/backtest/1.7.0/etap-1-7-4-prawy-klik-nawigacja.md).
// Testy czyste i serwerowe: menu prawego kliku (rodzaj zlecenia z ceny kliknięcia, Dołóż, SL/TP tutaj, bez przeciwnych), orderAt (SL, TP, ilość i auto-BE z presetu albo z pamięci panelu,
// wejście = cena kliknięcia), krok niezależny od interwału (stepCursor, stepTfFor), wyszukiwanie ceny na serwerze (findPrice: pierwsza świeca bazowa z dotknięciem, luka, limit dni,
// koniec danych, bez świecy w budowie, budżet), trasa GET /api/backtest/find-price (walidacja, obca strona) i skróty G i P.
// Dane wyłącznie syntetyczne w katalogach tymczasowych. Każda asercja ma wartość policzoną na papierze.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

  // ---------------------------------------------------------------------------------------------
  // menu prawego kliku
  // ---------------------------------------------------------------------------------------------
  const LAST = { t: 1_710_000_000, price: 18300 };
  const SCALP = { id: 'p1', name: 'Scalp', sl: { unit: 'pts', value: 10 }, tps: [{ unit: 'rr', value: 2, pct: 100 }], size: { mode: 'session', value: 0 }, autoBe: { kind: 'r', value: 1, offsetTicks: 0 } };
  const base = async (over = {}) => {
    const W = await imp('public/js/bt-wypelnienia.js');
    return { price: 18310, last: LAST, instrument: 'NQ', book: W.emptyBook(), rewound: false, lock: '', preset: SCALP, mem: null, manualQty: null, riskUsd: 400, balance: 50000, beOffset: 0, inMargin: false, time: null, ...over };
  };
  const byId = (items) => Object.fromEntries(items.map((i) => [i.id, i]));
  const ids = (items) => items.map((i) => i.id).sort();
  // pozycja Long albo Short 2 kontrakty po 18 300 z SL (rUsd = 2 × 10 pkt × 20 $ = 400)
  async function withPos(dir, sl) {
    const W = await imp('public/js/bt-wypelnienia.js');
    const r = W.placeOrder(W.emptyBook(), { instrument: 'NQ', side: dir === 'Long' ? 'buy' : 'sell', type: 'market', qty: 2, sl, tp: null }, LAST);
    assert.equal(r.book.positions.NQ.rUsd, 400, 'pozycja ma jednostkę R 400 $');
    return r.book;
  }

  test('backtest-174: menu prawego kliku: rodzaj zlecenia z ceny kliknięcia (nad, pod, ±1 tick)', async () => {
    const { menuItems } = await imp('public/js/bt-zlecenia.js');
    const { pxText } = await imp('public/js/bt-journal.js');
    // nad rynkiem: Sprzedaj limit i Kup stop, obie z ilością 2 (ryzyko sesji 400 $ / (10 pkt × 20 $)), SL 10 pkt, ryzyko −400 $, wartości z presetu Scalp
    const up = await menuItems(await base({ price: 18310 }));
    assert.deepEqual(ids(up.filter((i) => i.id.startsWith('order-'))), ['order-buy-stop', 'order-sell-limit']);
    const sl = byId(up)['order-sell-limit'];
    assert.equal(sl.disabled, false);
    assert.ok(sl.label.startsWith(`Sprzedaj limit 2 @ ${pxText(18310)}`), sl.label);
    assert.ok(/SL 10 pkt/.test(sl.label) && /−400/.test(sl.label), sl.label);
    assert.equal(sl.detail, 'preset Scalp');
    assert.deepEqual({ ...sl.act.order, autoBe: undefined }, { instrument: 'NQ', side: 'sell', type: 'limit', price: 18310, qty: 2, sl: 18320, tp: 18290, autoBe: undefined });
    const bs = byId(up)['order-buy-stop'];
    assert.ok(bs.label.startsWith(`Kup stop 2 @ ${pxText(18310)}`), bs.label);
    assert.deepEqual({ side: bs.act.order.side, type: bs.act.order.type, price: bs.act.order.price, sl: bs.act.order.sl, tp: bs.act.order.tp }, { side: 'buy', type: 'stop', price: 18310, sl: 18300, tp: 18330 });
    // pod rynkiem: Kup limit i Sprzedaj stop
    const dn = await menuItems(await base({ price: 18290 }));
    assert.deepEqual(ids(dn.filter((i) => i.id.startsWith('order-'))), ['order-buy-limit', 'order-sell-stop']);
    assert.deepEqual(['buy', 'limit', 18290, 18280, 18310], ((o) => [o.side, o.type, o.price, o.sl, o.tp])(byId(dn)['order-buy-limit'].act.order));
    assert.deepEqual(['sell', 'stop', 18290, 18300, 18270], ((o) => [o.side, o.type, o.price, o.sl, o.tp])(byId(dn)['order-sell-stop'].act.order));
    // dokładnie na cenie bieżącej i o jeden tick od niej: market po cenie bieżącej (nie po kliknięciu)
    for (const price of [18300, 18300.25, 18299.75]) {
      const mk = await menuItems(await base({ price }));
      assert.deepEqual(ids(mk.filter((i) => i.id.startsWith('order-'))), ['order-buy-market', 'order-sell-market'], `±1 tick (${price})`);
      const b = byId(mk)['order-buy-market'];
      assert.ok(b.label.startsWith('Kup market 2'), b.label);
      assert.equal(b.act.order.type, 'market');
      assert.equal(b.act.order.price, undefined, 'market bez ceny');
      assert.equal(b.act.order.sl, 18290, 'SL liczony od ceny bieżącej');
    }
    // dwa ticki od ceny to już limit/stop
    assert.deepEqual(ids((await menuItems(await base({ price: 18300.5 }))).filter((i) => i.id.startsWith('order-'))), ['order-buy-stop', 'order-sell-limit']);
    // cena kliknięcia zaokrąglona do ticka 0,25
    assert.equal(byId(await menuItems(await base({ price: 18310.1 })))['order-sell-limit'].act.order.price, 18310);
    assert.equal(byId(await menuItems(await base({ price: 18310.2 })))['order-sell-limit'].act.order.price, 18310.25);
    // skok do ceny: tylko gdy cena różni się od bieżącej
    assert.equal(byId(up)['jump-price'].act.price, 18310);
    assert.equal(byId(await menuItems(await base({ price: 18300 })))['jump-price'], undefined, 'cena bieżąca: bez skoku');
    // skok do daty tylko w marginesie za ostatnią świecą
    assert.equal(byId(up)['jump-date'], undefined);
    const mg = byId(await menuItems(await base({ inMargin: true, time: 1_710_003_600 })));
    assert.deepEqual([mg['jump-date'].act.type, mg['jump-date'].act.time], ['jumpDate', 1_710_003_600]);
  });

  test('backtest-174: menu przy pozycji Long i Short: Dołóż, SL tutaj, TP tutaj, bez przeciwnych', async () => {
    const { menuItems } = await imp('public/js/bt-zlecenia.js');
    const { pxText } = await imp('public/js/bt-journal.js');
    const tradeIds = (items) => ids(items.filter((i) => !i.id.startsWith('jump-')));
    // Long, SL 18 290: pod rynkiem Dołóż limit (kupno) i SL tutaj; nad rynkiem Dołóż stop i TP tutaj
    const long = await withPos('Long', 18290);
    const lBelow = byId(await menuItems(await base({ book: long, price: 18295 })));
    assert.deepEqual(tradeIds(Object.values(lBelow)), ['add-limit', 'sl-here']);
    // ilość dokładki z ryzyka sesji do SL pozycji: 400 / (5 pkt × 20 $) = 4
    assert.ok(lBelow['add-limit'].label.startsWith(`Dołóż limit 4 @ ${pxText(18295)}`), lBelow['add-limit'].label);
    assert.deepEqual([lBelow['add-limit'].act.order.side, lBelow['add-limit'].act.order.type, lBelow['add-limit'].act.order.qty], ['buy', 'limit', 4]);
    // SL tutaj: (18 295 − 18 300) × 20 × 2 = −200 $, −0,5R (rUsd 400)
    assert.deepEqual([lBelow['sl-here'].act.type, lBelow['sl-here'].act.field, lBelow['sl-here'].act.price], ['level', 'sl', 18295]);
    assert.ok(/SL tutaj/.test(lBelow['sl-here'].label) && /−200/.test(lBelow['sl-here'].label) && /−0,5R/.test(lBelow['sl-here'].label), lBelow['sl-here'].label);
    const lAbove = byId(await menuItems(await base({ book: long, price: 18310 })));
    assert.deepEqual(tradeIds(Object.values(lAbove)), ['add-stop', 'tp-here']);
    assert.deepEqual([lAbove['add-stop'].act.order.side, lAbove['add-stop'].act.order.type, lAbove['add-stop'].act.order.qty], ['buy', 'stop', 1]);
    assert.deepEqual([lAbove['tp-here'].act.field, lAbove['tp-here'].act.price], ['tp', 18310]);
    assert.ok(/TP tutaj/.test(lAbove['tp-here'].label) && /\+400/.test(lAbove['tp-here'].label) && /\+1R/.test(lAbove['tp-here'].label), lAbove['tp-here'].label);
    // Short, SL 18 310: nad rynkiem Dołóż limit (sprzedaż) i SL tutaj; pod rynkiem Dołóż stop i TP tutaj
    const short = await withPos('Short', 18310);
    const sAbove = byId(await menuItems(await base({ book: short, price: 18305 })));
    assert.deepEqual(tradeIds(Object.values(sAbove)), ['add-limit', 'sl-here']);
    assert.deepEqual([sAbove['add-limit'].act.order.side, sAbove['add-limit'].act.order.type], ['sell', 'limit']);
    assert.ok(/−200/.test(sAbove['sl-here'].label) && /−0,5R/.test(sAbove['sl-here'].label), sAbove['sl-here'].label);
    const sBelow = byId(await menuItems(await base({ book: short, price: 18295 })));
    assert.deepEqual(tradeIds(Object.values(sBelow)), ['add-stop', 'tp-here']);
    assert.deepEqual([sBelow['add-stop'].act.order.side, sBelow['add-stop'].act.order.type], ['sell', 'stop']);
    assert.ok(/\+200/.test(sBelow['tp-here'].label) && /\+0,5R/.test(sBelow['tp-here'].label), sBelow['tp-here'].label);
    // żadnych zleceń przeciwnego kierunku (opposite-pending) w żadnym z czterech przypadków
    for (const [book, side, prices] of [[long, 'buy', [18295, 18310, 18300.25]], [short, 'sell', [18305, 18295, 18300]]]) {
      for (const price of prices) for (const i of await menuItems(await base({ book, price }))) if (i.act?.order) assert.equal(i.act.order.side, side, `${i.id} przy ${price}`);
    }
    // na cenie bieżącej: Dołóż market, bez SL/TP tutaj
    assert.deepEqual(tradeIds(await menuItems(await base({ book: long, price: 18300 }))), ['add-market']);
    // dokładka za SL pozycji jest nieaktywna z powodem silnika; SL tutaj dalej działa
    const beyond = byId(await menuItems(await base({ book: long, price: 18288 })));
    assert.equal(beyond['add-limit'].disabled, true);
    assert.equal(beyond['add-limit'].why, 'Dokładka leży poza SL pozycji.');
    assert.equal(beyond['add-limit'].detail, beyond['add-limit'].why, 'powód także w drugiej linii');
    assert.equal(beyond['sl-here'].disabled, false);
    // SL tutaj po złej stronie ceny przyjęty przez silnik? Long: SL powyżej ceny bieżącej nie jest oferowany (to strona TP)
    assert.equal(lAbove['sl-here'], undefined);
    // menu nie zmienia księgi (próba na kopii)
    const snap = JSON.stringify(long);
    await menuItems(await base({ book: long, price: 18295 }));
    assert.equal(JSON.stringify(long), snap, 'księga bez zmian po budowie menu');
  });

  test('backtest-174: menu: cofnięty kursor, ilość 0 („Użyj 1 kontraktu”), brak SL, blokada sesji', async () => {
    const { menuItems } = await imp('public/js/bt-zlecenia.js');
    // cofnięty kursor: pozycje handlowe nieaktywne z powodem, skoki dostępne
    const rw = await menuItems(await base({ rewound: true, price: 18310 }));
    // runda 3: przy przeglądaniu menu ma tylko skok do ceny i „Wróć do teraz” (bez pozycji handlowych, także zablokowanych)
    assert.deepEqual(ids(rw), ['back-now', 'jump-price']);
    assert.equal(byId(rw)['jump-price'].disabled, false);
    assert.deepEqual([byId(rw)['back-now'].disabled, byId(rw)['back-now'].act.type, byId(rw)['back-now'].label], [false, 'backNow', 'Wróć do teraz']);
    // blokada sesji (inna karta): powód z lock
    const lk = await menuItems(await base({ lock: 'Sesja zmieniła się w innej karcie. Otwórz ją ponownie.' }));
    assert.ok(lk.filter((x) => x.id.startsWith('order-')).every((x) => x.disabled && x.why.startsWith('Sesja zmieniła')));
    // ryzyko za małe na ten SL: 100 $ / (10 pkt × 20 $) = 0 kontraktów → pozycja nieaktywna z powodem + „Użyj 1 kontraktu”
    const small = byId(await menuItems(await base({ riskUsd: 100 })));
    assert.equal(small['order-sell-limit'].disabled, true);
    assert.ok(/Ryzyko za małe na ten SL/.test(small['order-sell-limit'].why), small['order-sell-limit'].why);
    const one = small['order-sell-limit-one'];
    assert.ok(one && one.disabled === false && /Użyj 1 kontraktu/.test(one.label), one?.label);
    assert.equal(one.act.order.qty, 1);
    assert.equal(one.act.order.sl, 18320);
    assert.ok(/200/.test(one.label), 'ryzyko jednego kontraktu 200 $ w podpisie');
    // bez SL (brak presetu i pamięci): „Wpisz SL albo wielkość”, bez propozycji 1 kontraktu
    const none = byId(await menuItems(await base({ preset: null })));
    assert.equal(none['order-sell-limit'].disabled, true);
    assert.equal(none['order-sell-limit'].why, 'Wpisz SL albo wielkość.');
    assert.equal(none['order-sell-limit-one'], undefined);
    // ręczna ilość z panelu bez SL: zlecenie bez SL i TP
    const man = byId(await menuItems(await base({ preset: null, manualQty: 3 })));
    assert.equal(man['order-sell-limit'].disabled, false);
    assert.deepEqual([man['order-sell-limit'].act.order.qty, man['order-sell-limit'].act.order.sl, man['order-sell-limit'].act.order.tp], [3, null, null]);
    assert.equal(man['order-sell-limit'].detail, 'z panelu');
  });

  test('backtest-174: orderAt: SL/TP/ilość z presetu i z panelu, wejście = cena kliknięcia', async () => {
    const { orderAt } = await imp('public/js/bt-zlecenia.js');
    const c = { price: 18310, last: LAST, instrument: 'NQ', side: 'sell', type: 'limit', preset: SCALP, mem: null, manualQty: null, riskUsd: 400, balance: 50000, beOffset: 0 };
    // preset: SL i TP (2R) liczone od ceny kliknięcia (18 310), nie od ceny bieżącej (18 300); auto BE 1R z presetu
    const a = orderAt(c);
    assert.equal(a.source, 'preset');
    assert.deepEqual(a.order, { instrument: 'NQ', side: 'sell', type: 'limit', price: 18310, qty: 2, sl: 18320, tp: 18290, autoBe: { kind: 'r', value: 1, offsetTicks: 0 } });
    assert.equal(a.slPts, 10);
    // Kup stop z tego samego miejsca: lustro
    assert.deepEqual([orderAt({ ...c, side: 'buy', type: 'stop' }).order.sl, orderAt({ ...c, side: 'buy', type: 'stop' }).order.tp], [18300, 18330]);
    // wielkość z presetu: ryzyko w $ (200 $ → 1), % salda (1% z 50 000 = 500 $ → 2), stała ilość 3 (bez ryzyka sesji)
    assert.equal(orderAt({ ...c, preset: { ...SCALP, size: { mode: 'usd', value: 200 } } }).order.qty, 1);
    assert.equal(orderAt({ ...c, preset: { ...SCALP, size: { mode: 'pct', value: 1 } } }).order.qty, 2);
    assert.equal(orderAt({ ...c, riskUsd: 50, preset: { ...SCALP, size: { mode: 'qty', value: 3 } } }).order.qty, 3);
    // TP w punktach i ticki w presecie
    assert.equal(orderAt({ ...c, preset: { ...SCALP, tps: [{ unit: 'pts', value: 15, pct: 100 }] } }).order.tp, 18295);
    assert.equal(orderAt({ ...c, preset: { ...SCALP, sl: { unit: 'ticks', value: 20 } } }).order.sl, 18315);
    // preset bez TP i auto BE: pola puste
    const bare = orderAt({ ...c, preset: { ...SCALP, tps: [], autoBe: null } }).order;
    assert.deepEqual([bare.tp, bare.autoBe], [null, null]);
    // pamięć panelu (ticki): 40 ticków = 10 pkt SL, 80 ticków = 20 pkt TP; ilość z ryzyka sesji; auto BE z pamięci z domyślnym offsetem z Ustawień
    const m = orderAt({ ...c, preset: null, mem: { unit: 'tick', sl: '40', tp: '80', abe: { on: true, kind: 'pts', value: '5', off: '' } }, beOffset: 2 });
    assert.equal(m.source, 'panel');
    assert.deepEqual(m.order, { instrument: 'NQ', side: 'sell', type: 'limit', price: 18310, qty: 2, sl: 18320, tp: 18290, autoBe: { kind: 'pts', value: 5, offsetTicks: 2 } });
    // pamięć: pusty TP i auto BE wyłączony albo „cena” (bez sensu dla zlecenia po innej cenie) = brak; offset z pola ma pierwszeństwo
    const m2 = orderAt({ ...c, preset: null, mem: { unit: 'pt', sl: '10', tp: '', abe: { on: false, kind: 'r', value: '1', off: '' } } }).order;
    assert.deepEqual([m2.tp, m2.autoBe], [null, null]);
    assert.equal(orderAt({ ...c, preset: null, mem: { unit: 'pt', sl: '10', tp: '', abe: { on: true, kind: 'price', value: '18400', off: '' } } }).order.autoBe, null);
    assert.equal(orderAt({ ...c, preset: null, mem: { unit: 'pt', sl: '10', tp: '', abe: { on: true, kind: 'r', value: '1', off: '3' } }, beOffset: 2 }).order.autoBe.offsetTicks, 3);
    // ręczna ilość z panelu wygrywa z ilością z ryzyka
    assert.equal(orderAt({ ...c, preset: null, mem: { unit: 'pt', sl: '10', tp: '', abe: null }, manualQty: 5 }).order.qty, 5);
    // market: wejście = cena bieżąca, nie kliknięcie
    const mk = orderAt({ ...c, type: 'market', price: 18300.25, side: 'buy' }).order;
    assert.deepEqual([mk.type, mk.price, mk.sl, mk.tp], ['market', undefined, 18290, 18320]);
    // ilość 0 (ryzyko za małe) i brak SL: błędy z kodem
    assert.deepEqual(((r) => [r.err, r.oneRisk])(orderAt({ ...c, riskUsd: 100 })), ['small', 200]);
    assert.equal(orderAt({ ...c, preset: null }).err, 'no-sl');
    assert.equal(orderAt({ ...c, preset: null, mem: { unit: 'pt', sl: '', tp: '', abe: null } }).err, 'no-sl');
    // zły rodzaj zlecenia i zła strona odrzucone
    assert.equal(orderAt({ ...c, side: 'hold' }).err, 'bad-side');
    assert.equal(orderAt({ ...c, type: 'oco' }).err, 'bad-type');
    assert.equal(orderAt({ ...c, price: NaN }).err, 'no-entry');
  });

  test('backtest-174: levelHere: wartość „SL tutaj” i „TP tutaj” w $ i R', async () => {
    const { levelHere } = await imp('public/js/bt-zlecenia.js');
    const long = await withPos('Long', 18290), pos = long.positions.NQ;
    const a = levelHere({ pos, price: 18295, last: LAST });
    assert.deepEqual([a.field, a.usd, a.r], ['sl', -200, -0.5]);
    const b = levelHere({ pos, price: 18310, last: LAST });
    assert.deepEqual([b.field, b.usd, b.r], ['tp', 400, 1]);
    // SL w zysku (Long, ale poniżej ceny bieżącej): zysk zabezpieczony
    const c = levelHere({ pos, price: 18299, last: LAST });
    assert.deepEqual([c.field, c.usd], ['sl', -40]);
    const short = (await withPos('Short', 18310)).positions.NQ;
    assert.deepEqual(((x) => [x.field, x.usd, x.r])(levelHere({ pos: short, price: 18305, last: LAST })), ['sl', -200, -0.5]);
    assert.deepEqual(((x) => [x.field, x.usd, x.r])(levelHere({ pos: short, price: 18295, last: LAST })), ['tp', 200, 0.5]);
    // na cenie bieżącej (±1 tick) i bez pozycji: nic
    assert.equal(levelHere({ pos, price: 18300.25, last: LAST }), null);
    assert.equal(levelHere({ pos: null, price: 18295, last: LAST }), null);
    // pozycja bez jednostki R (P5): R puste
    assert.equal(levelHere({ pos: { ...pos, rUsd: null }, price: 18295, last: LAST }).r, null);
  });

  // ---------------------------------------------------------------------------------------------
  // krok niezależny od interwału
  // ---------------------------------------------------------------------------------------------
  test('backtest-174: stepCursor z krokiem 15s, 1m i 7m; sekundy poza oknem 1s = 1 min; stepTfFor', async () => {
    const { stepCursor, nyAt, stepTfFor, sanitizeStepTf, STEP_TFS } = await imp('public/js/bt-czas.js');
    const day = '2024-03-12', open = nyAt(day, '09:30'), end1s = nyAt(day, '11:00'), real1s = [[open, end1s]];
    const c = nyAt(day, '09:35') + 7;
    // w oknie 1s: 15 s do granicy kubełka (09:35:07 → 09:35:15), potem pełne kroki; wstecz do poprzedniej granicy
    assert.equal(stepCursor(c, 1, '15s', null, real1s) - nyAt(day, '09:35'), 15);
    assert.equal(stepCursor(nyAt(day, '09:35') + 15, 1, '15s', null, real1s) - nyAt(day, '09:35'), 30);
    assert.equal(stepCursor(c, -1, '15s', null, real1s) - nyAt(day, '09:35'), 0);
    // 1m: do pełnej minuty
    assert.equal(stepCursor(c, 1, '1m', null, real1s), nyAt(day, '09:36'));
    // 7m od otwarcia sesji CME (18:00 NY dzień wcześniej): minuta 935 → następna granica 938 = 09:38, wstecz z 09:38 na 09:31
    assert.equal(stepCursor(nyAt(day, '09:35'), 1, '7m', null, []), nyAt(day, '09:38'));
    assert.equal(stepCursor(nyAt(day, '09:38'), -1, '7m', null, []), nyAt(day, '09:31'));
    // sekundy poza oknem prawdziwego 1s (12:00) = 1 min, w obie strony
    const noon = nyAt(day, '12:00');
    assert.equal(stepCursor(noon, 1, '15s', null, real1s), noon + 60);
    assert.equal(stepCursor(noon + 30, -1, '15s', null, real1s), noon);
    // krok wybrany zamiast interwału wykresu: wykres 5m, krok 15s
    const eff = stepTfFor('15s', '5m');
    assert.equal(eff, '15s');
    assert.equal(stepCursor(c, 1, eff, null, real1s) - nyAt(day, '09:35'), 15);
    assert.equal(stepCursor(c, 1, stepTfFor(null, '5m'), null, real1s), nyAt(day, '09:40'), '= wykres: krok 5m');
    // zapis sesji 1.6.x bez pola i złe wartości = „= wykres”
    for (const bad of [undefined, null, '', 'abc', '1D', '90s', 5, {}, '10x']) assert.equal(stepTfFor(bad, '5m'), '5m', String(bad));
    assert.equal(sanitizeStepTf('7m'), '7m');
    assert.equal(sanitizeStepTf('15s'), '15s');
    assert.equal(sanitizeStepTf('1D'), null);
    assert.deepEqual(STEP_TFS, ['1s', '5s', '15s', '1m', '5m', '15m']);
  });

  // ---------------------------------------------------------------------------------------------
  // skróty G i P, ustawienia
  // ---------------------------------------------------------------------------------------------
  test('backtest-174: skróty G i P: domyślne, kolizje, stary zapis dostaje tylko wolne; goPriceDays', async () => {
    const C = await imp('public/js/bt-czas.js');
    const d = C.sanitizeBt(null);
    assert.equal(d.skroty.goDate, 'G');
    assert.equal(d.skroty.goPrice, 'P');
    assert.equal(d.goPriceDays, 5);
    assert.deepEqual(C.collisions(C.DEFAULT_SKROTY, C.DEFAULT_JUMPS), [], 'domyślne skróty nie kolidują');
    assert.ok(C.SKROT_ACTIONS.includes('goDate') && C.SKROT_ACTIONS.includes('goPrice'));
    // stary zapis (sprzed 1.7-4) bez nowych akcji: dostaje G i P, gdy wolne
    const old = { ...C.DEFAULT_SKROTY }; delete old.goDate; delete old.goPrice;
    assert.deepEqual([C.sanitizeBt({ skroty: old }).skroty.goDate, C.sanitizeBt({ skroty: old }).skroty.goPrice], ['G', 'P']);
    // G zajęte przez skok użytkownika: skok zostaje, nowa akcja pusta
    const jumps = [{ id: 'mine', name: 'Mój', cel: { kind: 'offset', sec: 60 }, skrot: 'G' }];
    const s1 = C.sanitizeBt({ skroty: old, jumps });
    assert.equal(s1.jumps[0].skrot, 'G');
    assert.equal(s1.skroty.goDate, '');
    assert.equal(s1.skroty.goPrice, 'P');
    // P zajęte przez inną akcję (np. odtwarzanie): akcja zostaje, goPrice pusta
    const s2 = C.sanitizeBt({ skroty: { ...old, play: 'P' } });
    assert.equal(s2.skroty.play, 'P');
    assert.equal(s2.skroty.goPrice, '');
    // zapis z nowymi akcjami i kolizją (dwie akcje na G): zostaje pierwsza
    const s3 = C.sanitizeBt({ skroty: { ...C.DEFAULT_SKROTY, goPrice: 'G' } });
    assert.equal(s3.skroty.goDate, 'G');
    assert.equal(s3.skroty.goPrice, '');
    // goPriceDays: tylko liczby całkowite 1..20, inaczej domyślne 5
    for (const [v, want] of [[1, 1], [20, 20], [7, 7], [0, 5], [21, 5], [-3, 5], [2.5, 5], ['9', 5], [null, 5], [undefined, 5], [NaN, 5], [Infinity, 5]]) assert.equal(C.sanitizeBt({ goPriceDays: v }).goPriceDays, want, String(v));
    assert.equal(C.sanitizeGoDays(12), 12);
    assert.equal(C.sanitizeGoDays(99), 5);
    // przechodzi przez sanitizeSettings serwera bez wycięcia
    const { sanitizeSettings } = await imp('lib/sync.mjs');
    const out = sanitizeSettings({ bt: { goPriceDays: 9, skroty: { goDate: 'G', goPrice: 'P' } } });
    assert.equal(out.bt.goPriceDays, 9);
    assert.deepEqual([out.bt.skroty.goDate, out.bt.skroty.goPrice], ['G', 'P']);
  });

  // ---------------------------------------------------------------------------------------------
  // wyszukiwanie ceny (serwer)
  // ---------------------------------------------------------------------------------------------
  // poniedziałek 14:00 UTC (czas letni od 10 marca)
  const T0 = Date.UTC(2024, 2, 11, 14, 0) / 1000;
  // ES (tylko 1m): bars = [[t, o, h, l, c]] w punktach; magazyn trzyma ceny × 100
  async function setupEs(bars) {
    const { writeRange } = await imp('lib/candles-store.mjs');
    const { createCandles } = await imp('lib/candles.mjs');
    const { createReplayRange } = await imp('lib/backtest-range.mjs');
    const baseDir = H.tmp();
    const from = Math.min(...bars.map((b) => b[0])), to = Math.max(...bars.map((b) => b[0])) + 60;
    writeRange('ES', '1m', from, to, bars.map((b) => [b[0], Math.round(b[1] * 100), Math.round(b[2] * 100), Math.round(b[3] * 100), Math.round(b[4] * 100), 10]), {}, { baseDir });
    const candles = createCandles({ getKey: () => null, getConfig: () => ({}), baseDir });
    const mk = (limits) => createReplayRange({ candles, news: null, earnings: null, baseDir, ...(limits ? { findLimits: limits } : {}) });
    return { rr: mk(), mk, baseDir, last: to };
  }
  // 180 świec 1m: kolejna świeca o 0,25 wyżej (o = 5000 + 0,25 i, h = o + 0,25, l = o) albo niżej (dir -1: o = 5100 − 0,25 i, l = o − 0,25, h = o)
  const walk = (dir = 1, n = 180, t0 = T0) => Array.from({ length: n }, (_, i) => {
    const o = dir > 0 ? 5000 + 0.25 * i : 5100 - 0.25 * i;
    return dir > 0 ? [t0 + 60 * i, o, o + 0.25, o, o + 0.25] : [t0 + 60 * i, o, o, o - 0.25, o - 0.25];
  });

  test('backtest-174: findPrice: pierwsza świeca bazowa z dotknięciem (w górę i w dół), bez świecy w budowie', async () => {
    const { rr } = await setupEs(walk(1));
    // 5010 w górę: h = 5000 + 0,25 i + 0,25 ≥ 5010 ⇔ i ≥ 39
    assert.deepEqual(await rr.findPrice({ instrument: 'ES', from: T0, price: 5010, dir: 'up', days: 5 }), { t: T0 + 39 * 60, end: T0 + 40 * 60 });
    // MES czyta dane ES
    assert.deepEqual(await rr.findPrice({ instrument: 'MES', from: T0, price: 5010, dir: 'up', days: 5 }), { t: T0 + 39 * 60, end: T0 + 40 * 60 });
    // kursor dokładnie na początku świecy 39: ta świeca jeszcze się nie zaczęła, więc wchodzi
    assert.equal((await rr.findPrice({ instrument: 'ES', from: T0 + 39 * 60, price: 5010, dir: 'up', days: 5 })).t, T0 + 39 * 60);
    // kursor w środku świecy 39 (świeca w budowie nie jest faktem): szukamy od następnej
    assert.equal((await rr.findPrice({ instrument: 'ES', from: T0 + 39 * 60 + 30, price: 5010, dir: 'up', days: 5 })).t, T0 + 40 * 60);
    // cena już osiągnięta przed kursorem nie liczy się: wyszukiwanie rusza od kursora
    assert.equal((await rr.findPrice({ instrument: 'ES', from: T0 + 100 * 60, price: 5010, dir: 'up', days: 5 })).t, T0 + 100 * 60);
    // w dół: świeca 39 ma low = 5090 (5100 − 0,25 i − 0,25 ≤ 5090 ⇔ i ≥ 39)
    const dn = await setupEs(walk(-1));
    assert.deepEqual(await dn.rr.findPrice({ instrument: 'ES', from: T0, price: 5090, dir: 'down', days: 5 }), { t: T0 + 39 * 60, end: T0 + 40 * 60 });
    // kierunek odwrotny do rynku nie znajduje: rosnące świece nie schodzą poniżej 5000,25 po pierwszej
    const none = await rr.findPrice({ instrument: 'ES', from: T0 + 60, price: 5000, dir: 'down', days: 5 });
    assert.equal(none.none, true);
  });

  test('backtest-174: findPrice: luka przez cenę, limit dni handlowych, koniec danych, budżet', async () => {
    // luka: świece do 5006 przez 60 minut, potem 3 godziny przerwy i świece od 5019 do 5021; cena 5010 w górę wypada w luce, więc trafia pierwsza świeca po przerwie
    const pre = Array.from({ length: 60 }, (_, i) => [T0 + 60 * i, 5000 + 0.1 * i, 5000.5 + 0.1 * i, 5000 + 0.1 * i, 5000.2 + 0.1 * i]);
    const post0 = T0 + 60 * 60 + 3 * 3600;
    // pierwsza świeca po przerwie otwiera się nad ceną (5020), ale zamyka pod nią (5008): high ją obejmuje, zamknięcie nie
    const post = Array.from({ length: 30 }, (_, i) => (i === 0 ? [post0, 5020, 5021, 5005, 5008] : [post0 + 60 * i, 5020, 5021, 5019, 5020]));
    const g = await setupEs([...pre, ...post]);
    assert.deepEqual(await g.rr.findPrice({ instrument: 'ES', from: T0, price: 5010, dir: 'up', days: 5 }), { t: post0, end: post0 + 60 });
    // dni: 1. dzień (10 świec płaskich), dzień 2 bez świec, dni 3 i 4 płaskie, trafienie 5050 dopiero w piątym oknie 24 h od kursora (bez trafienia wcześniej)
    const flat = (d, n = 10) => Array.from({ length: n }, (_, i) => [T0 + d * 86400 + 60 * i, 5000, 5001, 5000, 5000.5]);
    const hit = [T0 + 4 * 86400 + 3600, 5000, 5100, 5000, 5050];
    const L = await setupEs([...flat(0), ...flat(2), ...flat(3), hit]);
    // limit 3 dni z świecami (okna 0, 2, 3): koniec trzeciego okna = początek czwartego
    assert.deepEqual(await L.rr.findPrice({ instrument: 'ES', from: T0, price: 5050, dir: 'up', days: 3 }), { none: true, until: T0 + 4 * 86400, why: 'limit' });
    assert.deepEqual(await L.rr.findPrice({ instrument: 'ES', from: T0, price: 5050, dir: 'up', days: 1 }), { none: true, until: T0 + 1 * 86400, why: 'limit' });
    // dzień bez świec nie liczy się: dwa dni ze świecami kończą się po oknie 2
    assert.deepEqual(await L.rr.findPrice({ instrument: 'ES', from: T0, price: 5050, dir: 'up', days: 2 }), { none: true, until: T0 + 3 * 86400, why: 'limit' });
    // limit 4 dni: trafienie w oknie 4
    assert.deepEqual(await L.rr.findPrice({ instrument: 'ES', from: T0, price: 5050, dir: 'up', days: 4 }), { t: hit[0], end: hit[0] + 60 });
    // koniec danych: nigdy nieosiągnięta cena, limit 20 dni → data końca danych (ostatnia świeca + 60 s)
    assert.deepEqual(await L.rr.findPrice({ instrument: 'ES', from: T0, price: 9000, dir: 'up', days: 20 }), { none: true, until: hit[0] + 60, why: 'data-end' });
    // kursor za końcem danych: od razu koniec danych
    assert.deepEqual(await L.rr.findPrice({ instrument: 'ES', from: hit[0] + 3600, price: 5050, dir: 'up', days: 5 }), { none: true, until: hit[0] + 60, why: 'data-end' });
    // budżet świec: po 10 świecach okna 0 i 10 świecach okna 2 (20 ≥ 15) nie czytamy okna 3
    const B = L.mk({ maxBars: 15 });
    assert.deepEqual(await B.findPrice({ instrument: 'ES', from: T0, price: 5050, dir: 'up', days: 20 }), { none: true, until: T0 + 3 * 86400, why: 'budget' });
    // budżet czasu 0: przerwanie przed pierwszym oknem
    assert.deepEqual(await L.mk({ maxMs: 0 }).findPrice({ instrument: 'ES', from: T0, price: 5050, dir: 'up', days: 20 }), { none: true, until: T0, why: 'budget' });
  });

  test('backtest-174: findPrice: walidacja argumentów i przerwanie', async () => {
    const { rr } = await setupEs(walk(1));
    const ok = { instrument: 'ES', from: T0, price: 5010, dir: 'up', days: 5 };
    const bad = async (patch, status = 400) => {
      await assert.rejects(rr.findPrice({ ...ok, ...patch }), (e) => e.status === status, JSON.stringify(patch));
    };
    await bad({ instrument: 'XX' }); await bad({ instrument: '' }); await bad({ instrument: ['ES'] }); await bad({ instrument: 'NQ,ES' });
    await bad({ from: 'abc' }); await bad({ from: -5 }); await bad({ from: 1.5 }); await bad({ from: 1e15 }); await bad({ from: 100 });
    await bad({ price: 'x' }); await bad({ price: 0 }); await bad({ price: -1 }); await bad({ price: Infinity }); await bad({ price: NaN }); await bad({ price: 1e9 }); await bad({ price: '' });
    await bad({ dir: 'left' }); await bad({ dir: undefined });
    await bad({ days: 0 }); await bad({ days: 21 }); await bad({ days: -1 }); await bad({ days: 2.5 }); await bad({ days: 'x' }); await bad({ days: Infinity });
    // najwyżej FIND_MAX_INFLIGHT (3) wyszukiwań naraz: pozostałe dostają 429, a po zakończeniu limit się zwalnia
    const many = await Promise.allSettled([1, 2, 3, 4, 5].map(() => rr.findPrice({ ...ok, price: 9000 })));
    assert.equal(many.filter((x) => x.status === 'fulfilled').length, 3, 'trzy wyszukiwania przechodzą');
    assert.deepEqual(many.filter((x) => x.status === 'rejected').map((x) => [x.reason.status, x.reason.code]), [[429, 'busy'], [429, 'busy']]);
    assert.equal((await rr.findPrice({ ...ok, price: 9000 })).none, true, 'po zakończeniu limit wyszukiwań naraz jest wolny');
    // przerwanie: wyszukiwanie z przerwanym sygnałem kończy się błędem aborted
    await assert.rejects(rr.findPrice({ ...ok, signal: AbortSignal.abort() }), (e) => e.code === 'aborted');
    // parseFindQuery (walidator zapytania GET): napisy z adresu → liczby albo błąd 400
    const { parseFindQuery } = await imp('lib/backtest-range.mjs');
    const good = parseFindQuery(new URLSearchParams('instrument=NQ&from=1710000000&price=18310.25&dir=down&days=7'));
    assert.deepEqual(good, { instrument: 'NQ', from: 1710000000, price: 18310.25, dir: 'down', days: 7 });
    assert.equal(parseFindQuery(new URLSearchParams('instrument=nq&from=1710000000&price=5&dir=up')).days, 5, 'brak days = 5, małe litery instrumentu');
    for (const q of ['', 'instrument=NQ', 'instrument=NQ&instrument=ES&from=1710000000&price=5&dir=up', 'instrument=NQ&from=1710000000&from=1710000001&price=5&dir=up', 'instrument=NQ&from=1710000000&price=5&price=6&dir=up', 'instrument=NQ&from=1710000000&price=5&dir=up&days=5&days=6', 'instrument=NQ&from=1710000000&price=5&dir=up&dir=down','instrument=NQ&from=17&price=5&dir=up', 'instrument=NQ&from=1710000000&price=1e3&dir=up', 'instrument=NQ&from=1710000000&price=0x10&dir=up', 'instrument=NQ&from=1710000000&price=-5&dir=up',
      'instrument=NQ&from=1710000000&price=5&dir=sideways', 'instrument=NQ&from=1710000000&price=5&dir=up&days=0', 'instrument=NQ&from=1710000000&price=5&dir=up&days=21', 'instrument=NQ&from=1710000000&price=5&dir=up&days=1e1',
      'instrument=NQ&from=1710000000.5&price=5&dir=up', 'instrument=NQ&from=99999999999&price=5&dir=up', 'instrument=NQ&from=1710000000&price=12345678&dir=up', 'instrument=NQ&from=1710000000&price=5.12345&dir=up', 'instrument=..%2F&from=1710000000&price=5&dir=up']) {
      assert.throws(() => parseFindQuery(new URLSearchParams(q)), (e) => e.status === 400, q);
    }
  });

  test('backtest-174: trasa find-price: walidacja i obca strona (atrapa świec syntetycznych)', async () => {
    const { syntheticDay, dayRange } = await imp('testy/bt-dane-syntetyczne.mjs');
    const { createCandles } = await imp('lib/candles.mjs');
    const { createReplayRange } = await imp('lib/backtest-range.mjs');
    const { mergeBase } = await imp('public/js/bt-swieca.js');
    const dir = H.tmp();
    await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
    const d = await dayRange('2024-03-12');
    // wynik oczekiwany: pierwsza świeca bazowa (1s w oknie, 1m poza nim) po kursorze, której high ≥ ceny (przeliczenie na surowych danych)
    const candles = createCandles({ getKey: () => null, getConfig: () => ({}), baseDir: path.join(dir, 'chart-data') });
    const rr = createReplayRange({ candles, news: null, earnings: null, baseDir: path.join(dir, 'chart-data') });
    const b = rr.read({ instruments: ['NQ'], from: d.ctxFrom, to: d.end, tf: 'base' }).inst.NQ;
    const st = mergeBase(b.m1, b.s1, b.real1s);
    const from = d.open - 600;
    const price = b.s1[300][2];
    const exp = (() => { for (let i = 0; i < st.bars.length; i++) if (st.bars[i][0] >= from && st.bars[i][2] >= price) return { t: st.bars[i][0], end: st.bars[i][0] + st.len[i] }; return null; })();
    assert.ok(exp && exp.end - exp.t >= 1, 'oczekiwana świeca istnieje');
    const S = await H.server(4955, { THQ_CONFIG_DIR: dir });
    try {
      const get = (u, h = {}) => fetch(S.base + u, { headers: h });
      const q = (o) => `/api/backtest/find-price?${new URLSearchParams({ instrument: 'NQ', from: String(from), price: String(price), dir: 'up', days: '5', ...o })}`;
      const ok = await get(q({}));
      assert.equal(ok.status, 200);
      assert.equal(ok.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await ok.json(), exp, 'trasa = przeliczenie na surowych danych');
      // MNQ czyta dane NQ
      assert.deepEqual(await (await get(q({ instrument: 'MNQ' }))).json(), exp);
      // nie znaleziono: cena ponad danymi, limit dni 1 → none z until
      const none = await (await get(q({ price: '99999', days: '1' }))).json();
      assert.equal(none.none, true); assert.ok(Number.isInteger(none.until) && none.until > from);
      // walidacja: zła cena, ujemny limit, limit > 20, instrument spoza listy, zły kierunek, brak parametrów, napis zamiast liczby, wykładnik
      for (const o of [{ price: 'abc' }, { price: '-5' }, { price: '0' }, { price: '1e3' }, { days: '-1' }, { days: '0' }, { days: '21' }, { days: 'x' }, { instrument: 'XX' }, { instrument: 'NQ,ES' }, { dir: 'left' }, { from: 'abc' }, { from: '5' }, { from: '99999999999999' }, { price: '' }]) {
        const r = await get(q(o));
        assert.equal(r.status, 400, JSON.stringify(o));
        assert.ok(typeof (await r.json()).error === 'string');
      }
      assert.equal((await get('/api/backtest/find-price')).status, 400, 'bez parametrów');
      assert.equal((await get('/api/backtest/find-price?instrument=NQ')).status, 400);
      // obca strona (Sec-Fetch-Site) jak przy /api/backtest/range
      assert.equal((await get(q({}), { 'sec-fetch-site': 'cross-site' })).status, 403, 'obca strona');
      assert.equal((await get(q({}), { 'sec-fetch-site': 'same-site' })).status, 403);
      assert.equal((await get(q({}), { 'sec-fetch-site': 'same-origin' })).status, 200);
      // tylko GET
      assert.notEqual((await fetch(S.base + q({}), { method: 'POST', headers: { 'x-thq': '1', 'content-type': 'application/json' }, body: '{}' })).status, 200);
    } finally { S.stop(); }
  });

  // ---------------------------------------------------------------------------------------------
  // runda 2 (przeglądy kodu, wyglądu i bezpieczeństwa pakietu 1.7-4)
  // ---------------------------------------------------------------------------------------------
  // P1-1 (kod): pozycja menu wybrana po zmianie rynku nie może wykonać się jako inne zlecenie niż na etykiecie. menuStillValid(wybrana, świeże) → '' (można) albo powód odrzucenia.
  test('backtest-174: r2: menuStillValid: Dołóż po zamknięciu pozycji i market po ruchu ceny są odrzucane, niezmieniona pozycja przechodzi', async () => {
    const { menuItems, menuStillValid } = await imp('public/js/bt-zlecenia.js');
    const W = await imp('public/js/bt-wypelnienia.js');
    assert.equal(typeof menuStillValid, 'function', 'menuStillValid jest wyeksportowane');
    const ctx = (over) => ({ price: 18300, last: LAST, instrument: 'NQ', book: W.emptyBook(), rewound: false, lock: '', preset: null, mem: { unit: 'pt', sl: '10', tp: '20' }, manualQty: null, riskUsd: 400, balance: 50000, beOffset: 0, ...over });
    // (a) Dołóż market: pozycja Long 2 z SL 18290 zamyka się po SL, wybór tej samej pozycji menu nie może otworzyć nowej pozycji bez SL
    const long = W.placeOrder(W.emptyBook(), { instrument: 'NQ', side: 'buy', type: 'market', qty: 2, sl: 18290, tp: null }, LAST).book;
    const shown = menuItems(ctx({ book: long })).find((i) => i.id === 'add-market');
    assert.ok(shown, 'menu z pozycją ma Dołóż market');
    const sameNow = menuItems(ctx({ book: long }));
    assert.equal(menuStillValid(shown, sameNow), '', 'nic się nie zmieniło: wolno');
    const closed = menuItems(ctx({ book: W.emptyBook(), last: { t: LAST.t + 30, price: 18289 }, price: 18300 }));
    assert.ok(!closed.some((i) => i.id === 'add-market'), 'po zamknięciu pozycji Dołóż znika z menu');
    assert.notEqual(menuStillValid(shown, closed), '', 'Dołóż po zamknięciu pozycji: odrzucone');
    // (b) Kup market z SL 10 pkt: cena idzie o +6 pkt, SL bezwzględny z etykiety byłby inny niż po przeliczeniu
    const mk0 = menuItems(ctx({})).find((i) => i.id === 'order-buy-market');
    const moved = menuItems(ctx({ last: { t: LAST.t + 60, price: 18306 }, price: 18300 }));
    assert.equal(mk0.act.order.sl, 18290);
    assert.notEqual(menuStillValid(mk0, moved), '', 'market po ruchu ceny: odrzucone');
    assert.equal(menuStillValid(mk0, menuItems(ctx({}))), '', 'ta sama cena: wolno');
    // inna ilość (zmiana ryzyka) i pozycja nieaktywna w świeżym menu też odrzucają
    const lim0 = menuItems(ctx({ price: 18310 })).find((i) => i.id === 'order-sell-limit');
    assert.notEqual(menuStillValid(lim0, menuItems(ctx({ price: 18310, riskUsd: 800 }))), '', 'inna ilość: odrzucone');
    assert.notEqual(menuStillValid(lim0, menuItems(ctx({ price: 18310, riskUsd: 100 }))), '', 'pozycja nieaktywna: odrzucone');
    // skoki nie zależą od księgi: wolno
    const jp = menuItems(ctx({ price: 18310 })).find((i) => i.id === 'jump-price');
    assert.equal(menuStillValid(jp, menuItems(ctx({ price: 18310, last: { t: LAST.t + 60, price: 18306 } }))), '', 'skok do ceny: wolno');
    // SL tutaj: pozycja zamknięta w międzyczasie
    const slh = menuItems(ctx({ book: long, price: 18295 })).find((i) => i.id === 'sl-here');
    assert.ok(slh, 'SL tutaj istnieje');
    assert.notEqual(menuStillValid(slh, menuItems(ctx({ book: W.emptyBook(), price: 18295 }))), '', 'SL tutaj bez pozycji: odrzucone');
    // powód jest tekstem po polsku i mówi, co zrobić
    assert.ok(/otwórz menu ponownie/i.test(menuStillValid(mk0, moved)), menuStillValid(mk0, moved));
  });

  // P3-4 (kod) / P2-4 (wygląd): ilość dokładki liczy jedna funkcja addQty, wołana i przez menu, i przez pole „Wielkość” panelu; preset w $ i w %.
  test('backtest-174: r2: addQty: jedna funkcja dla menu i panelu, preset w $ i w %, stała ilość, brak SL', async () => {
    const { menuItems, addQty } = await imp('public/js/bt-zlecenia.js');
    const W = await imp('public/js/bt-wypelnienia.js');
    assert.equal(typeof addQty, 'function', 'addQty jest wyeksportowane');
    const long = W.placeOrder(W.emptyBook(), { instrument: 'NQ', side: 'buy', type: 'market', qty: 2, sl: 18290, tp: null }, LAST).book;
    const pos = long.positions.NQ;
    // ryzyko 800 $ do SL pozycji 10 pkt (200 $ za kontrakt) = 4; 1000 $ = 5; stała ilość 3 wygrywa; brak SL pozycji i panelu = 0 z dist null
    assert.deepEqual(addQty({ pos, entry: 18300, riskUsd: 800, panelSl: null, fixedQty: null, instrument: 'NQ' }), { qty: 4, dist: 10 });
    assert.deepEqual(addQty({ pos, entry: 18300, riskUsd: 1000, panelSl: null, fixedQty: null, instrument: 'NQ' }), { qty: 5, dist: 10 });
    assert.equal(addQty({ pos, entry: 18300, riskUsd: 1000, panelSl: null, fixedQty: 3, instrument: 'NQ' }).qty, 3);
    assert.deepEqual(addQty({ pos: { ...pos, sl: null }, entry: 18300, riskUsd: 400, panelSl: null, fixedQty: null, instrument: 'NQ' }), { qty: 0, dist: null });
    assert.deepEqual(addQty({ pos: { ...pos, sl: null }, entry: 18300, riskUsd: 400, panelSl: 5, fixedQty: null, instrument: 'NQ' }), { qty: 4, dist: 5 });
    // menu woła addQty: preset w $ (800 $ → 4 kontrakty) i w % (2% z 50 000 $ = 1000 $ → 5), każdy z ilością równą wynikowi funkcji
    const mk = (size) => ({ id: 'p2', name: 'Skala', sl: { unit: 'pts', value: 10 }, tps: [], size, autoBe: null });
    const qtyOf = (preset, riskUsd = 400) => menuItems({ price: 18300, last: LAST, instrument: 'NQ', book: long, rewound: false, lock: '', preset, mem: null, manualQty: null, riskUsd, balance: 50000, beOffset: 0 }).find((i) => i.id === 'add-market').act.order.qty;
    assert.equal(qtyOf(mk({ mode: 'usd', value: 800 })), 4, 'preset w $');
    assert.equal(qtyOf(mk({ mode: 'pct', value: 2 })), 5, 'preset w % salda');
    assert.equal(qtyOf(mk({ mode: 'qty', value: 3 })), 3, 'preset ze stałą ilością');
    assert.equal(qtyOf(mk({ mode: 'session', value: 0 }), 600), 3, 'preset z ryzyka sesji 600 $');
    assert.equal(qtyOf(null, 400), addQty({ pos, entry: 18300, riskUsd: 400, panelSl: null, fixedQty: null, instrument: 'NQ' }).qty, 'menu = addQty');
  });

  // P3-5/P3-6 (wygląd): market pokazuje cenę, a pozycje zablokowane nie niosą liczb z absurdalnego przeliczenia
  test('backtest-174: r2: menu: market z ceną w etykiecie, zablokowane pozycje bez kwot i R', async () => {
    const { menuItems } = await imp('public/js/bt-zlecenia.js');
    const { pxText } = await imp('public/js/bt-journal.js');
    const W = await imp('public/js/bt-wypelnienia.js');
    const mk = menuItems(await base({ price: 18300 })).find((i) => i.id === 'order-buy-market');
    assert.ok(mk.label.startsWith(`Kup market 2 (${pxText(18300)})`), mk.label);
    const long = await withPos('Long', 18290);
    const addM = menuItems(await base({ book: long, price: 18300 })).find((i) => i.id === 'add-market');
    assert.ok(addM.label.startsWith(`Dołóż market 2 (${pxText(18300)})`) || /^Dołóż market \d+ \(/.test(addM.label), addM.label);
    // cofnięty kursor przy pozycji: SL tutaj i Dołóż bez kwot
    const rw = menuItems(await base({ book: long, rewound: true, price: 18250 }));
    // runda 3: przy pozycji i cofniętym kursorze nie ma dwóch podobnych „Dołóż”, tylko skok i powrót
    assert.deepEqual(ids(rw), ['back-now', 'jump-price']);
    // blokada sesji (inna karta) zostaje przy pozycjach nieaktywnych, bez kwot i bez powtórzonych etykiet
    const lk = menuItems(await base({ book: long, lock: 'Sesja zmieniła się w innej karcie.', price: 18250 }));
    for (const i of lk.filter((x) => !x.id.startsWith('jump-'))) {
      assert.equal(i.disabled, true, i.id);
      assert.ok(!/[$]|R\b|ryzyko/.test(i.label), `etykieta zablokowanej pozycji bez liczb ryzyka: «${i.label}»`);
    }
    assert.ok(new Set(lk.map((x) => x.label)).size === lk.length && W, 'etykiety w menu są różne');
  });

  // P3-5 (kod): cena wpisana w oknie „Skocz do ceny” w obu językach (spacja tysięcy, twarda spacja, separator tysięcy w EN)
  test('backtest-174: r2: priceText: cena z pola okna w zapisie polskim i angielskim', async () => {
    const { priceText } = await imp('public/js/bt-czas.js');
    assert.equal(typeof priceText, 'function');
    const cases = [
      ['18310,25', 'pl-PL', '18310.25'], ['18 310,25', 'pl-PL', '18310.25'], ['18 310,25', 'pl-PL', '18310.25'], ['18 310,25', 'pl-PL', '18310.25'],
      ['18310.25', 'pl-PL', '18310.25'], ['18.310,25', 'pl-PL', '18310.25'], ['18,310.25', 'en-US', '18310.25'], ['18,310', 'en-US', '18310'], ['18310', 'en-US', '18310'],
      ['18,31', 'en-US', '18.31'], ['18,310', 'pl-PL', '18.310'], [' 18310.25 ', 'en-US', '18310.25'], ['', 'pl-PL', ''], [undefined, 'pl-PL', ''],
    ];
    for (const [raw, loc, want] of cases) assert.equal(priceText(raw, loc), want, `${JSON.stringify(raw)} (${loc})`);
    // wynik przechodzi regułę ceny okna (maks. 6 cyfr i 4 miejsca po kropce); śmieci zostają śmieciami
    const ok = (x) => /^\d{1,6}(\.\d{1,4})?$/.test(x);
    assert.ok(ok(priceText('18,310.25', 'en-US')) && ok(priceText('18 310,25', 'pl-PL')));
    assert.ok(!ok(priceText('abc', 'pl-PL')) && !ok(priceText('1,2,3', 'pl-PL')) && !ok(priceText('18.310.25', 'pl-PL')));
  });

  // P3-1 (bezpieczeństwo): miejsce w limicie wyszukiwań naraz zwalnia się w chwili przerwania, nie przy następnym oknie
  test('backtest-174: r2: findPrice: przerwanie zwalnia miejsce w limicie od razu (cztery wyszukiwania, trzy przerwane, czwarte przechodzi)', async () => {
    const { rr } = await setupEs(walk(1));
    const ok = { instrument: 'ES', from: T0, price: 9000, dir: 'up', days: 20 };
    const acs = [1, 2, 3].map(() => new AbortController());
    const run = acs.map((ac) => rr.findPrice({ ...ok, signal: ac.signal }).then((r) => ({ r }), (e) => ({ e })));
    // trzy wyszukiwania w toku (każde przeczytało pierwsze okno i oddało pętlę): czwarte dostaje 429
    await assert.rejects(rr.findPrice(ok), (e) => e.status === 429 && e.code === 'busy', 'trzy w toku: czwarte odrzucone');
    for (const ac of acs) ac.abort();
    // zaraz po przerwaniu (bez czekania na pętlę) miejsca są wolne
    const again = await Promise.all([1, 2, 3].map(() => rr.findPrice({ ...ok, days: 1 }).then((r) => ({ r }), (e) => ({ e }))));
    assert.deepEqual(again.filter((x) => x.e).map((x) => `${x.e.status}:${x.e.code}`), [], 'zaraz po przerwaniu trzy nowe wyszukiwania przechodzą');
    const done = await Promise.all(run);
    assert.ok(done.every((x) => x.e?.code === 'aborted'), `przerwane kończą się błędem aborted: ${JSON.stringify(done.map((x) => x.e?.code ?? 'ok'))}`);
    // po wszystkim licznik jest na zerze (trzy wolne miejsca)
    const fin = await Promise.allSettled([1, 2, 3].map(() => rr.findPrice({ ...ok, days: 1 })));
    assert.equal(fin.filter((x) => x.status === 'fulfilled').length, 3, 'licznik wrócił do zera, nie poniżej (po przerwaniu zwolnienie tylko raz)');
    await assert.rejects(Promise.all([1, 2, 3, 4].map(() => rr.findPrice(ok))), (e) => e.status === 429, 'limit 3 dalej obowiązuje (licznik nie zszedł poniżej zera)');
  });
};
