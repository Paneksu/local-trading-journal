// backtest-K: czas ciągły w bt-czas.js. [U] 31.10.2026 «nie powinno byc takiego czegos jak koniec dnia, tylko mozesz przesuwac czas tyle ile chcesz a po prostu jest opcja skokow».
// Przerwy bez handlu (weekend, święto, przerwa 17–18 NY) pomijane przy krokach i odtwarzaniu; skoki liczone po kursorze bez granicy dnia. Czyste moduły, dane syntetyczne.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const mod = () => imp('public/js/bt-czas.js');

  // strumień: piątek 2024-03-08 15:50–17:00 NY (1m), weekend bez świec, niedziela 18:00–18:30 NY, poniedziałek 16:50–17:00 i 18:00–18:10 (przerwa 17–18),
  // wtorek 9:30–9:31 z prawdziwym 1s z dziurą 5 s (cisza w handlu: nie przerwa)
  async function world() {
    const { nyAt } = await mod();
    const { mergeBase } = await imp('public/js/bt-swieca.js');
    const m1 = [], s1 = [];
    const bar = (t, p = 18000) => [t, p, p + 1, p - 1, p, 1];
    const mins = (a, b) => { for (let t = a; t < b; t += 60) m1.push(bar(t)); };
    mins(nyAt('2024-03-08', '15:50'), nyAt('2024-03-08', '17:00'));
    mins(nyAt('2024-03-10', '18:00'), nyAt('2024-03-10', '18:30'));
    mins(nyAt('2024-03-11', '16:50'), nyAt('2024-03-11', '17:00'));
    mins(nyAt('2024-03-11', '18:00'), nyAt('2024-03-11', '18:10'));
    const o = nyAt('2024-03-12', '09:30');
    mins(o - 600, o);
    for (let t = o; t < o + 60; t++) if (t < o + 20 || t >= o + 25) s1.push(bar(t));
    mins(o + 60, o + 600);
    return { nyAt, stream: mergeBase(m1, s1, [[o, o + 60]]), real1s: [[o, o + 60]], o };
  }

  test('backtest-K: kursor przechodzi przez weekend i przerwę 17–18 bez dziury (krok i odtwarzanie)', async () => {
    const { skipGap, stepCursor, GAP_SKIP } = await mod();
    const { nyAt, stream, real1s, o } = await world();
    assert.equal(GAP_SKIP, 1800);
    const fri = nyAt('2024-03-08', '17:00'), sun = nyAt('2024-03-10', '18:00');
    // krok 1m z ostatniej minuty piątku: następna widoczna świeca to 18:00 niedzieli (kursor 18:01), bez kroków przez pusty weekend
    assert.equal(stepCursor(fri, 1, '1m', stream, real1s), sun + 60);
    assert.equal(stepCursor(fri - 60, 1, '1m', stream, real1s), fri, 'zwykły krok przed przerwą');
    // krok wstecz z pierwszej świecy po weekendzie wraca na koniec piątku (nie w środek weekendu)
    assert.equal(stepCursor(sun + 60, -1, '1m', stream, real1s), sun);
    assert.equal(stepCursor(sun, -1, '1m', stream, real1s), fri);
    // odtwarzanie: kursor w przerwie przeskakuje na początek pierwszej świecy po niej
    assert.equal(skipGap(stream, fri, fri + 600), sun);
    assert.equal(skipGap(stream, fri - 120, fri - 60), fri - 60, 'w handlu bez zmian');
    // przerwa 17–18 NY w poniedziałek
    const m17 = nyAt('2024-03-11', '17:00');
    assert.equal(stepCursor(m17, 1, '1m', stream, real1s), m17 + 3600 + 60);
    assert.equal(skipGap(stream, m17, m17 + 30), m17 + 3600);
    // cisza w handlu 5 s w oknie 1s to nie przerwa: krok 1s idzie sekunda po sekundzie
    assert.equal(stepCursor(o + 20, 1, '1s', stream, real1s), o + 21);
    assert.equal(skipGap(stream, o + 20, o + 22), o + 22);
    // 1h przez weekend: kubełek z pierwszą świecą niedzieli
    assert.equal(stepCursor(fri, 1, '1h', stream, real1s), sun + 3600);
    // koniec danych: brak świecy dalej → krok zwykły (ogranicza go wywołujący)
    const last = stream.bars[stream.bars.length - 1][0] + 60;
    assert.equal(skipGap(stream, last, last + 5000), last + 5000);
  });

  test('backtest-K: skoki bez granicy dnia (godzina, sesja, następny dzień, dzień z filtra, news, +N)', async () => {
    const { jumpTarget, DEFAULT_JUMPS, nyAt } = await mod();
    const cur = nyAt('2024-03-08', '10:00'); // piątek
    const tradingDays = ['2024-03-07', '2024-03-08', '2024-03-11', '2024-03-12', '2024-03-13'];
    const ctx = (o = {}) => ({ cursor: cur, startTime: '09:00', news: [], tradingDays, filterDays: ['2024-03-12'], max: nyAt('2024-03-13', '16:00'), ...o });
    const J = (cel) => ({ id: 'x', name: 'x', cel, skrot: '' });
    assert.deepEqual(jumpTarget(J({ kind: 'time', at: '09:30' }), ctx()), { cursor: nyAt('2024-03-11', '09:30') }, '9:30 już minęło: następny dzień handlowy');
    assert.deepEqual(jumpTarget(J({ kind: 'time', at: '15:00' }), ctx()), { cursor: nyAt('2024-03-08', '15:00') }, 'ta sama doba');
    assert.deepEqual(jumpTarget(J({ kind: 'nextDay' }), ctx()), { cursor: nyAt('2024-03-11', '09:00') }, 'następny dzień = sesja handlowa o godzinie startu');
    assert.deepEqual(jumpTarget(J({ kind: 'filterDay' }), ctx()), { cursor: nyAt('2024-03-12', '09:00') }, 'następny dzień z filtra');
    assert.equal(jumpTarget(J({ kind: 'filterDay' }), ctx({ filterDays: ['2024-03-08'] })), null, 'dzień z filtra już trwa (9:00 minęła)');
    assert.deepEqual(jumpTarget(J({ kind: 'session', id: 'asia' }), ctx()), { cursor: nyAt('2024-03-10', '20:00') }, 'Azja w niedzielę wieczorem (przez weekend)');
    assert.deepEqual(jumpTarget(J({ kind: 'session', id: 'ny' }), ctx()), { cursor: nyAt('2024-03-11', '09:30') });
    assert.deepEqual(jumpTarget(J({ kind: 'offset', sec: 900 }), ctx()), { cursor: cur + 900 });
    assert.deepEqual(jumpTarget(J({ kind: 'offset', sec: 900 }), ctx({ cursor: nyAt('2024-03-13', '15:55') })), { cursor: nyAt('2024-03-13', '16:00') }, 'do końca danych');
    const news = [{ t: nyAt('2024-03-12', '08:30'), name: 'CPI', imp: 'high' }, { t: nyAt('2024-03-08', '09:00'), name: 'NFP', imp: 'high' }];
    assert.deepEqual(jumpTarget(J({ kind: 'news', minImp: 'high' }), ctx({ news })), { cursor: nyAt('2024-03-12', '08:30') }, 'news kilka dni dalej');
    assert.equal(jumpTarget(J({ kind: 'nextDay' }), ctx({ cursor: nyAt('2024-03-13', '10:00') })), null, 'po ostatnim dniu danych');
    // domyślne skoki: „Następny dzień z filtra” ma własny rodzaj, nic nie wymaga końca dnia
    assert.equal(DEFAULT_JUMPS.find((j) => j.id === 'nextDay').cel.kind, 'filterDay');
    assert.equal(DEFAULT_JUMPS.find((j) => j.id === 'nySession').cel.kind, 'nextDay');
  });

  test('backtest-K: bez skrótu „Zakończ dzień”, stary zapis skoku dnia z filtra przechodzi', async () => {
    const { DEFAULT_SKROTY, sanitizeBt, copyDef } = await mod();
    assert.ok(!('endDay' in DEFAULT_SKROTY));
    const s = sanitizeBt({ skroty: { endDay: 'Shift+E', play: 'Space' }, jumps: [{ id: 'nextDay', name: 'Następny dzień z filtra', cel: { kind: 'nextDay' }, skrot: '4' }, { id: 'mine', name: 'Mój', cel: { kind: 'filterDay' }, skrot: '7' }] });
    assert.ok(!('endDay' in s.skroty));
    assert.equal(s.jumps[0].cel.kind, 'filterDay');
    assert.equal(s.jumps[1].cel.kind, 'filterDay');
    const c = copyDef({ instruments: ['NQ'], from: '2024-03-01', to: '2024-03-31', order: 'random', seed: 3, startTime: '09:00' });
    for (const k of ['to', 'order', 'seed']) assert.ok(!(k in c), `kopia definicji bez ${k}`);
    assert.equal(c.from, '2024-03-01');
  });

  // Punkt podpięcia pakietu L (wynik na żywo jak FX Replay): stan konta liczony z silnika przy kursorze, także dla pozycji przez noc
  test('backtest-K: stan konta przy kursorze (saldo, wynik zamknięty, otwarty P&L, equity)', async () => {
    const W = await imp('public/js/bt-wypelnienia.js');
    let b = W.placeOrder(W.emptyBook(), { instrument: 'NQ', side: 'buy', type: 'market', qty: 2, sl: 90, tp: null }, { t: 60, price: 100 }).book;
    b = W.closePartial(b, 'NQ', 1, { t: 120, price: 110 }).book;
    const st = W.accountState({ book: b, trades: [{ pnl: 300 }, { pnl: null }], balance: 50000, last: () => ({ t: 180, price: 105 }) });
    assert.deepEqual(st.open, [{ instrument: 'NQ', dir: 'Long', qty: 1, entryPrice: 100, last: 105, upl: 100, uplR: 0.25 }]);
    assert.equal(st.realized, 500, "zamknięte trade'y (300) + część zamknięta pozycji (1 × 10 pkt × 20 USD)");
    assert.equal(st.upl, 100); assert.equal(st.equity, 50600);
    assert.deepEqual(W.accountState({ book: W.emptyBook(), balance: 1000, last: () => ({ price: NaN }) }), { balance: 1000, realized: 0, upl: 0, equity: 1000, open: [] });
  });
};
