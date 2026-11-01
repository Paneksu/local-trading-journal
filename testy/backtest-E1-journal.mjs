// backtest-E1: journaling po zamknięciu trade'a (toTrade, panel, Enter/Esc, lista „do uzupełnienia”) i „Zakończ dzień” (pytanie, zamknięcie eod, zlecenia, koniec danych,
// następny dzień, pagehide). Część czysta w Node (toTrade, pickCorner, endDay, podpowiedzi), reszta w przeglądarce (Chrome/Edge headless, CDP) na serwerze testowym ze świecami
// syntetycznymi: strona robocza testy/backtest-journal.html.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

  // ---- strona robocza: jeden przebieg, wynik dzielony przez testy ----
  let pageRun = null;
  async function pageResult() {
    pageRun ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      // dzień 13 przed 12: zapis dnia 13 nadpisuje 1m kontekstu, więc dzień 12 piszemy na końcu
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-13', seed: 8 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      const S = await H.server(4891, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-journal.html?part=journal`, { width: 1920, height: 1080, timeoutMs: 240_000 });
        return JSON.parse(txt);
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
    return res;
  }

  // ---- czyste moduły w Node ----
  // strumień NQ: trzy świece 1m; pozycja Long 2 szt. wejście 100, SL0 90 (R = 10 pkt), częściowe wyjście 110, reszta po BE (100) ze stopa
  const stream = { bars: [[0, 100, 104, 95, 102, 1], [60, 102, 112, 99, 110, 1], [120, 110, 111, 99, 100, 1]], len: [60, 60, 60] };
  const pos = () => ({
    instrument: 'NQ', dir: 'Long', qty: 2, openQty: 0, entryT: 0, entryPrice: 100, sl0: 90, sl: 100, tp: 120, be: true,
    exits: [{ t: 60, price: 110, qty: 1, reason: 'partial' }, { t: 120, price: 100, qty: 1, reason: 'sl' }],
  });

  test('backtest-E1: toTrade', async () => {
    const { toTrade, nextTradeId } = await imp('public/js/bt-journal.js');
    const snap = { v: 1, at: '2024-03-12T14:00:00.000Z', d: [{ kind: 'trend-line' }] };
    const tr = toTrade(pos(), { day: '2024-03-12', contract: 'NQH4', stream, drawings: snap, trades: [{ id: 't1' }, { id: 't3' }] });
    assert.equal(tr.id, 't4', 'numer = następny po największym w sesji');
    assert.deepEqual([tr.day, tr.instrument, tr.contract, tr.dir, tr.qty], ['2024-03-12', 'NQ', 'NQH4', 'Long', 2]);
    assert.deepEqual([tr.entryT, tr.entryPrice, tr.sl0, tr.sl, tr.tp, tr.be], [0, 100, 90, 100, 120, true]);
    assert.equal(tr.exitPrice, 105, 'exitPrice = średnia ważona wyjść');
    assert.equal(tr.exitT, 120);
    assert.equal(tr.r, 0.5, 'R = 10 pkt / (2 · 10)');
    assert.equal(tr.pnl, 200, 'USD = 10 pkt · 20 USD');
    assert.equal(tr.maeR, -0.5, 'MAE ze świecy 0 (low 95 vs wejście 100, ryzyko 10)');
    assert.equal(tr.mfeR, 1.2, 'MFE ze świecy 1 (high 112)');
    assert.equal(tr.journal, 'todo');
    assert.deepEqual(tr.notion, { id: null, state: 'pending', error: '' });
    assert.deepEqual(tr.setup + tr.notes, '');
    assert.deepEqual(tr.drawings, snap, 'migawka rysunków przypięta do trade\'a');
    assert.deepEqual(tr.exits.map((x) => x.reason), ['partial', 'sl']);
    assert.equal(toTrade(pos(), { day: 'x' }).id, 't1', 'pusta sesja zaczyna od t1');
    assert.equal(nextTradeId([{ id: 't1' }, { id: 't2' }]), 't3');
    const p2 = pos(); p2.exits.push();
    assert.notStrictEqual(toTrade(p2, { day: 'x' }).exits, p2.exits, 'trade nie dzieli tablicy wyjść z pozycją');
  });

  test('backtest-E1: róg panelu i podpowiedzi setupu', async () => {
    const { pickCorner, setupSuggestions, todoOf } = await imp('public/js/bt-journal.js');
    // panel 300 px w oknie 1000 px: lewy róg zajmuje x 8–308, prawy 692–992
    assert.equal(pickCorner({ hostW: 1000, panelW: 300, cursorX: 900 }), 'left', 'kursor po prawej: panel w lewym rogu');
    assert.equal(pickCorner({ hostW: 1000, panelW: 300, cursorX: 150 }), 'right', 'kursor przy lewym rogu: panel do prawego');
    assert.equal(pickCorner({ hostW: 1000, panelW: 300, cursorX: 340 }), 'right', 'kursor 32 px od panelu (margines 40 px): przesunięcie');
    assert.equal(pickCorner({ hostW: 1000, panelW: 300, cursorX: 349 }), 'left', 'kursor 41 px od panelu: zostaje');
    assert.equal(pickCorner({ hostW: 500, panelW: 300, cursorX: 250 }), 'left', 'kolizja w obu rogach: zostaje domyślny');
    assert.equal(pickCorner({ hostW: 1000, panelW: 300, cursorX: null }), 'left', 'brak kursora: domyślny');
    assert.deepEqual(setupSuggestions(['A', 'b'], [{ setup: 'B' }, { setup: 'C' }, { setup: '' }, {}]), ['A', 'b', 'C'], 'bez duplikatów (wielkość liter) i pustych');
    assert.deepEqual(todoOf({ trades: [{ id: 't1', journal: 'todo' }, { id: 't2', journal: 'done' }] }).map((x) => x.id), ['t1']);
  });

  const book0 = async (opts = {}) => {
    const W = await imp('public/js/bt-wypelnienia.js');
    let b = W.emptyBook();
    if (opts.position) b = W.placeOrder(b, { instrument: 'NQ', side: 'buy', type: 'market', qty: 1, sl: 90, tp: null }, { t: 60, price: 100 }).book;
    if (opts.order) b = W.placeOrder(b, { instrument: 'NQ', side: 'buy', type: 'limit', price: 95, qty: 1, sl: 90, tp: null }, { t: 60, price: 100 }).book;
    return b;
  };
  // K (31.10.2026): „backtest-E1: endDay z otwartą pozycją i bez” i „oczekujące zlecenia anulowane” zastąpione: nie ma końca dnia ([U] «nie powinno byc takiego czegos
  // jak koniec dnia»), pozycje i zlecenia przechodzą przez noc i weekend, a luka otwarcia wypełnia SL/TP po cenie otwarcia (reguła silnika bez zmian).
  async function overnight() {
    const { mergeBase } = await imp('public/js/bt-swieca.js');
    const { nyAt } = await imp('public/js/bt-czas.js');
    const fri = nyAt('2024-03-08', '16:58'), sun = nyAt('2024-03-10', '18:00');
    // piątek ~100, weekend bez świec, niedziela otwiera się luką w dół na 80 (pod SL 90), potem rośnie
    const m1 = [[fri, 100, 101, 99, 100, 1], [fri + 60, 100, 101, 99, 100, 1], [sun, 80, 82, 79, 81, 1], [sun + 60, 81, 130, 80, 129, 1]];
    return { st: mergeBase(m1, [], []), fri, sun };
  }
  test('backtest-K: pozycja przez noc i weekend wypełnia SL na luce otwarcia (bez zamknięcia na koniec dnia)', async () => {
    const W = await imp('public/js/bt-wypelnienia.js');
    const { st, fri, sun } = await overnight();
    let b = W.placeOrder(W.emptyBook(), { instrument: 'NQ', side: 'buy', type: 'market', qty: 1, sl: 90, tp: 120 }, { t: fri + 60, price: 100 }).book;
    // kursor do końca piątku: nic się nie dzieje, pozycja zostaje otwarta
    let r = W.advance(b, 'NQ', st, fri + 120);
    assert.ok(r.book.positions.NQ && !r.events.some((e) => e.type === 'closed'), 'piątek: pozycja otwarta po końcu sesji');
    // przez weekend do pierwszej świecy niedzieli: SL na luce = cena otwarcia 80 (gorsza niż 90), czas = świeca otwarcia
    r = W.advance(r.book, 'NQ', st, sun + 60);
    const c = r.events.find((e) => e.type === 'closed');
    assert.ok(c, 'pozycja zamknięta w niedzielę');
    const ex = c.position.exits.at(-1);
    assert.equal(ex.reason, 'sl'); assert.equal(ex.price, 80, 'SL wypełniony po otwarciu luki (80), nie po 90'); assert.equal(ex.t, sun);
  });
  test('backtest-K: TP i zlecenie oczekujące przez noc (luka w górę wypełnia limit sprzedaży, TP po weekendzie)', async () => {
    const W = await imp('public/js/bt-wypelnienia.js');
    const { mergeBase } = await imp('public/js/bt-swieca.js');
    const { nyAt } = await imp('public/js/bt-czas.js');
    const fri = nyAt('2024-03-08', '16:59'), sun = nyAt('2024-03-10', '18:00');
    const st = mergeBase([[fri, 100, 101, 99, 100, 1], [sun, 130, 131, 128, 129, 1]], [], []);
    let b = W.placeOrder(W.emptyBook(), { instrument: 'NQ', side: 'buy', type: 'market', qty: 1, sl: 90, tp: 120 }, { t: fri, price: 100 }).book;
    b = W.placeOrder(b, { instrument: 'ES', side: 'sell', type: 'limit', price: 5000, qty: 1, sl: 5050, tp: null }, { t: fri, price: 4990 }).book;
    const es = mergeBase([[fri, 4990, 4991, 4989, 4990, 1], [sun, 5020, 5021, 5018, 5019, 1]], [], []);
    let r = W.advance(b, 'NQ', st, sun + 60);
    const tp = r.events.find((e) => e.type === 'closed').position.exits.at(-1);
    assert.equal(tp.reason, 'tp'); assert.equal(tp.t, sun);
    r = W.advance(r.book, 'ES', es, sun + 60);
    const f = r.events.find((e) => e.type === 'filled' || e.type === 'opened');
    assert.ok(f || r.book.positions.ES, 'limit sprzedaży wypełniony po weekendzie');
    assert.equal((r.book.positions.ES || f.position).entryPrice, 5000, 'luka w górę: limit po swojej cenie (reguła silnika bez zmian: limit bez dodatniego poślizgu)');
  });

  // ---- przeglądarka ----
  test('backtest-E1: zapis natychmiast przy zamknięciu', () => tagged('zapis', 1).then(() => tagged('karta', 4)));
  test('backtest-E1: panel tylko po pełnym zamknięciu', () => tagged('panel', 5).then(() => tagged('toTrade', 6)));
  test('backtest-E1: Enter i Esc', () => tagged('enter', 4).then(() => tagged('esc', 2)));
  test('backtest-E1: replay nie czeka', async () => { await tagged('replay', 2); await tagged('skroty', 2); });
  test('backtest-E1: setup z podpowiedzi i nowy', () => tagged('setup', 3));
  test('backtest-E1: brak oceny wykonania', () => tagged('brak oceny', 2));
  test('backtest-E1: do uzupełnienia', () => tagged('lista', 4));
  // K (31.10.2026): „Zakończ dzień z otwartą pozycją”, „oczekujące zlecenia anulowane w ekranie”, „koniec danych” i „następny dzień” zastąpione (bez końca dnia):
  test('backtest-K: koniec danych z otwartą pozycją: stop odtwarzania, pozycja zostaje (ekran)', () => tagged('koniec', 4));
  test('backtest-K: trade przez noc z panelem journalingu na następnym dniu (ekran)', () => tagged('noc', 5));
  test('backtest-E1: pagehide', () => tagged('pagehide', 3));
};
