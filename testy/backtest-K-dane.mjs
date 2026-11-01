// backtest-K: dane replayu na ciągłej osi (public/js/bt-dane.js) na prawdziwym lib/backtest-range.mjs i świecach syntetycznych z kilku dni (z weekendem).
// [U] 31.10.2026 «powinines miec pelna przeszlosc tak daleko jak siega historia w danym momencie»: historia doładowuje się do początku danych,
// okno bazowe idzie przez noc i weekend bez dziury, a przesunięcie okna nie gubi świec.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const noNews = { range: (from, to) => ({ from, to, events: [] }) };
  const DAYS = ['2024-03-13', '2024-03-12', '2024-03-11', '2024-03-08', '2024-03-07', '2024-03-06'];
  let W = null;
  async function world() {
    if (W) return W;
    const { syntheticDay, dayRange } = await imp('testy/bt-dane-syntetyczne.mjs');
    const { createCandles } = await imp('lib/candles.mjs');
    const { createReplayRange } = await imp('lib/backtest-range.mjs');
    const baseDir = H.tmp();
    // od najpóźniejszego dnia: zapis wcześniejszego dnia nadpisuje jego kontekst 1m, a okna 1s każdego dnia zostają
    for (const [i, d] of DAYS.entries()) await syntheticDay(baseDir, { instrument: 'NQ', day: d, seed: 20 + i });
    const candles = createCandles({ getKey: () => null, getConfig: () => ({}), baseDir });
    const rr = createReplayRange({ candles, news: noNews, earnings: noNews, baseDir });
    const calls = [];
    const D = await imp('public/js/bt-dane.js');
    const make = () => D.createReplayData({
      instruments: ['NQ'],
      fetchRange: async (q) => { calls.push(q); return rr.read(q); },
      fetchBounds: async (ins) => rr.bounds({ instruments: ins }),
    });
    W = { rr, make, calls, D, first: (await dayRange('2024-03-06')).ctxFrom, end: (await dayRange('2024-03-13')).end, dayRange };
    return W;
  }

  test('backtest-K: okno bazowe przez noc i weekend bez dziury (porcje = jeden odczyt całości)', async () => {
    const { rr, make, end, dayRange } = await world();
    const { mergeBase } = await imp('public/js/bt-swieca.js');
    const { nyAt } = await imp('public/js/bt-czas.js');
    const d = make();
    const c0 = nyAt('2024-03-07', '09:00');
    const b = await d.init(c0);
    assert.equal(b.last, end, 'koniec danych = ostatnia świeca');
    assert.ok(d.baseFrom() <= c0 && d.baseTo() > c0, 'okno obejmuje kursor');
    const from0 = d.baseFrom();
    // kursor idzie przez noc czwartku, weekend, do wtorku: okno się dokłada
    for (const at of [nyAt('2024-03-07', '20:00'), nyAt('2024-03-08', '15:00'), nyAt('2024-03-10', '19:00'), nyAt('2024-03-11', '12:00')]) {
      await d.ensure(at);
      assert.ok(d.covers(at) && d.baseTo() > at, `dane do ${at}`);
    }
    // strumień = mergeBase jednego odczytu całego zakresu (bez dziur i dubli na granicach porcji)
    const whole = rr.read({ instruments: ['NQ'], from: from0, to: d.baseTo(), tf: 'base' }).inst.NQ;
    const ref = mergeBase(whole.m1, whole.s1, whole.real1s);
    const st = d.stream('NQ');
    assert.equal(d.baseFrom(), from0, 'bez przesunięcia okna przy 3 sesjach');
    assert.equal(st.bars.length, ref.bars.length);
    assert.deepEqual(st.bars, ref.bars); assert.deepEqual(st.len, ref.len);
    assert.ok(st.len.includes(1) && st.len.includes(60), '1s w oknach, 1m poza');
    const w12 = await dayRange('2024-03-12');
    assert.deepEqual(d.real1s('NQ').at(-2), [w12.open, w12.w1sEnd], 'pokrycie 1s z granic danych');
  });

  test('backtest-K: przesunięcie okna oddaje odcięte świece, potem ponowny odczyt przy kroku wstecz', async () => {
    const { make } = await world();
    const { nyAt } = await imp('public/js/bt-czas.js');
    const d = make();
    await d.init(nyAt('2024-03-06', '09:00'));
    const evs = [];
    d.on((e) => evs.push(e));
    const from0 = d.baseFrom();
    const before = d.stream('NQ').bars.slice();
    const c = nyAt('2024-03-13', '10:00');
    await d.ensure(c);
    const tr = evs.find((e) => e.kind === 'trim');
    assert.ok(tr, 'okno przesunięte (6+ sesji za kursorem)');
    assert.equal(tr.from, from0);
    assert.ok(d.baseFrom() > from0 && d.baseFrom() < c);
    assert.ok(tr.dropped.NQ.bars.length > 1000 && tr.dropped.NQ.bars.every((x) => x[0] < d.baseFrom()));
    assert.deepEqual(tr.dropped.NQ.bars.slice(0, 50), before.slice(0, 50), 'odcięte świece to początek okna');
    assert.ok(d.stream('NQ').bars[0][0] >= d.baseFrom());
    // krok wstecz przed baseFrom: przeładowanie okna wokół kursora
    const back = nyAt('2024-03-07', '10:00');
    await d.ensure(back);
    assert.ok(evs.some((e) => e.kind === 'reload'));
    assert.ok(d.baseFrom() <= back && d.baseTo() > back);
  });

  test('backtest-K: pełna historia doładowuje się do początku danych (1h, 5m, 15s)', async () => {
    const { rr, make, first } = await world();
    const { nyAt } = await imp('public/js/bt-czas.js');
    const { aggregate } = await imp('public/js/swiece.js');
    const d = make();
    await d.init(nyAt('2024-03-13', '09:00'));
    for (const tf of ['1h', '5m', '15s']) {
      let before = d.baseFrom(), hist = [], n = 0, done = false;
      while (!done && n++ < 50) {
        const h = await d.history('NQ', tf, before);
        assert.ok(h.bars.every((b) => b[0] < before), `${tf}: porcja przed ${before}`);
        hist = [...h.bars, ...hist];
        before = h.from; done = h.done;
      }
      assert.ok(done, `${tf}: doszło do początku danych w ${n} porcjach`);
      assert.equal(hist[0][0], first, `${tf}: pierwsza świeca danych`);
      // historia + agregat okna bazowego do kursora = jeden agregat całych danych (ciągłość na granicy baseFrom)
      if (tf !== '15s') {
        const all = rr.read({ instruments: ['NQ'], from: first, to: d.baseTo(), tf });
        const st = d.stream('NQ');
        const joined = [...hist, ...aggregate(st.bars, tf)];
        assert.deepEqual(joined, all.inst.NQ.bars.filter((b) => b[0] < d.baseTo()), `${tf}: historia + okno = całość`);
      } else assert.ok(hist.length > 5000, '15s: sekundy w oknach i minuty poza');
    }
  });
};
