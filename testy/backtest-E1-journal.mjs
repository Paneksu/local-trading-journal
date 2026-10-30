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
  const sess = (book) => ({ id: 'bt-testtest', pool: ['2024-03-12', '2024-03-13'], dayIdx: 0, days: { '2024-03-12': { status: 'active' } }, book, hw: book.hw, trades: [] });

  test('backtest-E1: endDay z otwartą pozycją i bez', async () => {
    const { endDay } = await imp('public/js/bt-replay.js');
    const s = sess(await book0({ position: true }));
    const frozen = JSON.stringify(s);
    const asked = [];
    const opts = (yes) => ({ last: () => ({ t: 120, price: 105 }), confirm: async (o) => { asked.push(o); return yes; }, streamOf: () => stream, contractOf: () => 'NQH4', snapshot: () => ({ v: 1, at: 'x', d: [] }), day: '2024-03-12' });
    const no = await endDay(s, opts(false));
    assert.equal(no.ended, false, '„nie”: dzień się nie kończy');
    assert.equal(no.session, s, 'sesja bez zmian');
    assert.equal(asked.length, 1);
    assert.match(asked[0].text, /Zamknąć po bieżącej cenie\?/);
    const yes = await endDay(s, opts(true));
    assert.equal(yes.ended, true);
    assert.equal(JSON.stringify(s), frozen, 'wejściowa sesja niezmieniona');
    assert.equal(yes.closed.length, 1);
    const tr = yes.closed[0];
    assert.equal(tr.exits.at(-1).reason, 'eod');
    assert.equal(tr.exitPrice, 105, 'po cenie kursora');
    assert.equal(tr.exitT, 120, 'w czasie kursora');
    assert.equal(tr.journal, 'todo');
    assert.equal(tr.contract, 'NQH4');
    assert.deepEqual(tr.drawings, { v: 1, at: 'x', d: [] });
    assert.equal(yes.session.book.positions.NQ, null);
    assert.equal(yes.session.days['2024-03-12'].status, 'done');
    assert.equal(yes.session.trades.length, 1);
    // bez pozycji: bez pytania
    asked.length = 0;
    const none = await endDay(sess(await book0()), opts(true));
    assert.equal(asked.length, 0, 'bez otwartej pozycji pytania nie ma');
    assert.equal(none.ended, true);
    assert.equal(none.closed.length, 0);
    // przeglądanie wstecz: odmowa silnika przerywa całość
    const rew = sess(await book0({ position: true })); rew.book.hw = 9999;
    const rr = await endDay(rew, { ...opts(true), last: () => ({ t: 120, price: 105 }) });
    assert.equal(rr.ended, false);
    assert.equal(rr.reason, 'rewound');
    assert.equal(rr.session, rew);
  });

  test('backtest-E1: oczekujące zlecenia anulowane', async () => {
    const { endDay } = await imp('public/js/bt-replay.js');
    const s = sess(await book0({ order: true }));
    assert.equal(s.book.orders.length, 1);
    let asked = 0;
    const r = await endDay(s, { last: () => ({ t: 120, price: 100 }), confirm: async () => { asked++; return true; }, day: '2024-03-12' });
    assert.equal(asked, 0);
    assert.equal(r.session.book.orders.length, 0, 'book.orders puste');
    const c = r.events.filter((e) => e.type === 'cancelled');
    assert.equal(c.length, 1, 'zdarzenie cancelled');
    assert.equal(c[0].reason, 'eod');
    assert.equal(r.session.days['2024-03-12'].status, 'done');
  });

  // ---- przeglądarka ----
  test('backtest-E1: zapis natychmiast przy zamknięciu', () => tagged('zapis', 1).then(() => tagged('karta', 4)));
  test('backtest-E1: panel tylko po pełnym zamknięciu', () => tagged('panel', 5).then(() => tagged('toTrade', 6)));
  test('backtest-E1: Enter i Esc', () => tagged('enter', 4).then(() => tagged('esc', 2)));
  test('backtest-E1: replay nie czeka', async () => { await tagged('replay', 2); await tagged('skroty', 2); });
  test('backtest-E1: setup z podpowiedzi i nowy', () => tagged('setup', 3));
  test('backtest-E1: brak oceny wykonania', () => tagged('brak oceny', 2));
  test('backtest-E1: do uzupełnienia', () => tagged('lista', 4));
  test('backtest-E1: Zakończ dzień z otwartą pozycją', () => tagged('dzien', 8));
  test('backtest-E1: oczekujące zlecenia anulowane w ekranie', () => tagged('zlecenia', 3));
  test('backtest-E1: koniec danych', () => tagged('koniec', 4));
  test('backtest-E1: następny dzień', () => tagged('nastepny', 8));
  test('backtest-E1: pagehide', () => tagged('pagehide', 3));
};
