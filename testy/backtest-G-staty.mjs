// backtest-G: statystyki backtestu. Część czysta (public/js/bt-staty.js) w Node na ręcznych trade'ach, widok w przeglądarce (Chrome/Edge headless, CDP)
// na stronie testy/backtest-staty.html. Dane tylko syntetyczne.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const skip = (msg) => { const e = new Error(msg); e.skipTest = true; throw e; }; // test przeglądarkowy bez Chrome/Edge: pominięty, nie zdany
  // trade w stylu zmergowanym: day (NY), time (NY HH:MM), r, setup, dir, maeR/mfeR
  let seq = 0;
  const tr = (o) => ({ id: `x${++seq}`, day: '2024-03-12', date: '2024-03-12', time: '09:40', instrument: 'NQ', dir: 'Long', setup: 'ORB', r: 1, maeR: null, mfeR: null, exit: null, beHit: false, session: 'bt-aaaaaa', created: '', ...o });
  const many = (n, o) => Array.from({ length: n }, (_, i) => tr({ ...(typeof o === 'function' ? o(i) : o), time: `09:${String(30 + (i % 30)).padStart(2, '0')}` }));
  const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) <= e, `${a} ≈ ${b}`);

  test('backtest-G: nagłówek', async () => {
    const S = await imp('public/js/bt-staty.js');
    const { calc } = await imp('public/js/stats.js');
    // 6 wygranych (2+1+3+1,5+2+0,5 = 10), 3 straty (−3), 1 BE (0,03 w marginesie 0,1 R)
    const ts = [...[2, 1, 3, 1.5, 2, 0.5].map((r) => tr({ r })), ...[-1, -1, -1].map((r) => tr({ r })), tr({ r: 0.03 })];
    const s = S.summary(ts);
    assert.equal(s.n, 10);
    near(s.wr, calc(ts).winRate); // BE poza mianownikiem: 6 / 9
    near(s.wr, 66.67);
    near(s.sumR, 7.03);
    near(s.avgR, 0.703);
    assert.equal(S.summary([]).n, 0);
    assert.equal(S.summary([]).wr, null);
    assert.equal(S.summary([]).avgR, null);
  });

  test('backtest-G: za mało danych', async () => {
    const S = await imp('public/js/bt-staty.js');
    assert.equal(S.MIN_N, 20);
    const t19 = many(19, { setup: 'A' }), t20 = many(20, { setup: 'B' });
    const rows = S.edgeTable([...t19, ...t20], 'setup');
    assert.equal(rows.find((r) => r.key === 'A').few, true);
    assert.equal(rows.find((r) => r.key === 'B').few, false);
    assert.equal(S.summary(t19).few, true);
    assert.equal(S.summary(t20).few, false);
  });

  test('backtest-G: rozbicia', async () => {
    const S = await imp('public/js/bt-staty.js');
    const ts = [
      tr({ time: '09:44', r: 1, setup: 'A', dir: 'Long', day: '2024-03-11' }), // poniedziałek
      tr({ time: '09:45', r: -1, setup: 'A', dir: 'Short', day: '2024-03-12' }), // wtorek
      tr({ time: '09:10', r: 2, setup: null, dir: 'Long', day: '2024-03-12' }),
      tr({ time: '16:05', r: 1, setup: 'B', dir: 'Long', day: '2024-03-15' }), // piątek
    ];
    const keys = (by, o) => S.edgeTable(ts, by, o).map((r) => r.key);
    assert.deepEqual(keys('hour'), ['przed 9:30', '9:30', '9:45', 'po 16:00']);
    assert.deepEqual(S.edgeTable(ts, 'hour').map((r) => r.n), [1, 1, 1, 1]);
    assert.deepEqual(keys('wd'), [1, 2, 5]);
    assert.deepEqual(keys('dir').sort(), ['Long', 'Short']);
    const setups = S.edgeTable(ts, 'setup');
    assert.equal(setups[0].key, 'A'); // kolejność: liczba trade'ów malejąco
    assert.equal(setups[0].n, 2);
    assert.ok(setups.some((r) => r.key === 'bez setupu' && r.n === 1));
    const tagsOf = (x) => (x.day === '2024-03-12' ? ['CPI', 'OPEX'] : x.day === '2024-03-11' ? ['bez newsów'] : []);
    const dt = S.edgeTable(ts, 'dayType', { tagsOf });
    assert.equal(dt.find((r) => r.key === 'CPI').n, 2);
    assert.equal(dt.find((r) => r.key === 'OPEX').n, 2); // trade w dwóch wierszach
    assert.equal(dt.find((r) => r.key === 'bez newsów').n, 1);
    assert.equal(dt.find((r) => r.key === 'brak danych o dniu').n, 1); // dzień bez cech
    assert.throws(() => S.edgeTable(ts, 'nieznane'), /rozbicie/i);
  });

  test('backtest-G: wykonanie', async () => {
    const S = await imp('public/js/bt-staty.js');
    const ts = [
      tr({ r: 2, maeR: -0.05, mfeR: 2.4 }), // zwycięzca, głębokość MAE 0,05 → kubełek 0
      tr({ r: 1, maeR: -0.35, mfeR: 1.5, exit: 'manual' }), // zwycięzca zamknięty ręcznie: zostawił 0,5
      tr({ r: 1, maeR: -0.42, mfeR: 3, exit: 'partial' }), // zostawił 2
      tr({ r: -1, maeR: -1, mfeR: 0.3 }),
      tr({ r: 0, maeR: -0.2, mfeR: 1.2, beHit: true, exit: 'sl' }), // BE: zostawił 1,2
      tr({ r: -0.04, maeR: -0.1, mfeR: 0.8, beHit: true, exit: 'sl' }), // BE: zostawił 0,84
    ];
    const e = S.execution(ts);
    assert.equal(e.withData, 6);
    assert.equal(e.without, 0);
    near(e.avgMae, (-0.05 - 0.35 - 0.42 - 1 - 0.2 - 0.1) / 6, 0.001);
    near(e.avgMfe, (2.4 + 1.5 + 3 + 0.3 + 1.2 + 0.8) / 6, 0.001);
    assert.equal(e.maeWinners.length, 10);
    const bin = (b) => e.maeWinners.find((x) => Math.abs(x.bin - b) < 1e-9).n;
    assert.equal(bin(0), 1);
    assert.equal(bin(0.3), 1);
    assert.equal(bin(0.4), 1);
    assert.equal(e.maeWinners.reduce((a, x) => a + x.n, 0), 3);
    near(e.maeP80, 0.5, 1e-9); // 80% zwycięzców nie spadło głębiej niż −0,5 R (najgłębszy 0,42 mieści się w kubełku do 0,5)
    near(e.leftOnTable.be, 1.2 + 0.84, 0.001);
    near(e.leftOnTable.early, 0.5 + 2, 0.001);
    assert.equal(e.leftOnTable.nBe, 2);
    assert.equal(e.leftOnTable.nEarly, 2);
    // seria strat: W L L L L W L → 4
    const seq4 = 'WLLLLWL'.split('').map((c) => tr({ r: c === 'W' ? 1 : -1 }));
    assert.equal(S.execution(seq4).maxLossStreak, 4);
  });

  test('backtest-G: wykonanie bez MAE/MFE', async () => {
    const S = await imp('public/js/bt-staty.js');
    const withData = [tr({ r: 2, maeR: -0.2, mfeR: 2 }), tr({ r: -1, maeR: -1, mfeR: 0.1 })];
    const without = [tr({ r: 5, maeR: null, mfeR: null }), tr({ r: -3 }), tr({ r: 1, maeR: -0.1, mfeR: null })]; // Live, stare Backtest, niepełne
    const e = S.execution([...withData, ...without]);
    assert.equal(e.withData, 2);
    assert.equal(e.without, 3);
    near(e.avgMae, -0.6, 1e-9);
    near(e.avgMfe, 1.05, 1e-9);
    assert.equal(e.maeWinners.reduce((a, x) => a + x.n, 0), 1); // tylko zwycięzca z danymi
    assert.equal(e.leftOnTable.nBe + e.leftOnTable.nEarly, 0);
    const none = S.execution(without);
    assert.equal(none.withData, 0);
    assert.equal(none.avgMae, null);
    assert.equal(none.avgMfe, null);
    // trade z Notion (btMae/btMfe) liczy się jak lokalny
    const merged = S.mergeBacktest([{ typ: 'Backtest', date: '2024-03-12', at: Date.UTC(2024, 2, 12, 13, 40), dir: 'Long', setup: 'ORB', r: 2, btMae: -0.3, btMfe: 2.5, btSession: '', counted: true }], []);
    assert.equal(merged[0].maeR, -0.3);
    assert.equal(merged[0].mfeR, 2.5);
    assert.equal(S.execution(merged).withData, 1);
  });

  test('backtest-G: backtest kontra Live', async () => {
    const S = await imp('public/js/bt-staty.js');
    const bt = [...many(3, { setup: 'ORB', r: 1 }), tr({ setup: 'ORB', r: -1 }), tr({ setup: 'FVG', r: 2 }), tr({ setup: 'Tylko BT', r: 1 })];
    const live = [tr({ setup: 'ORB', r: 3 }), tr({ setup: 'ORB', r: -1 }), tr({ setup: 'FVG', r: null }), tr({ setup: 'Tylko Live', r: 1 })];
    const c = S.compareLive(bt, live);
    assert.deepEqual(c.map((x) => x.setup), ['ORB']); // FVG: live bez R nie liczy się, więc brak pary
    assert.equal(c[0].bt.n, 4);
    assert.equal(c[0].live.n, 2);
    near(c[0].live.avgR, 1);
    near(c[0].bt.avgR, 0.5);
    assert.equal(c[0].live.few, true);
  });

  test('backtest-G: scalanie bez dubli', async () => {
    const S = await imp('public/js/bt-staty.js');
    const sessions = [{ id: 'bt-abc123', name: 'Marzec', trades: [
      { id: 't1', day: '2024-03-12', instrument: 'NQ', dir: 'Long', entryT: Date.UTC(2024, 2, 12, 13, 40) / 1000, exits: [{ t: 1, price: 1, qty: 1, reason: 'tp' }], r: 2, pnl: 100, maeR: -0.4, mfeR: 2.1, setup: 'ORB', be: false, journal: 'done' },
      { id: 't2', day: '2024-03-12', instrument: 'NQ', dir: 'Short', entryT: Date.UTC(2024, 2, 12, 14, 40) / 1000, exits: [{ t: 2, price: 1, qty: 1, reason: 'manual' }], r: -1, pnl: -50, maeR: -1, mfeR: 0.2, setup: '', journal: 'todo' },
      { id: 't3', day: '2024-03-12', instrument: 'NQ', dir: 'Long', entryT: Date.UTC(2024, 2, 12, 15, 0) / 1000, exits: [], r: null, journal: 'todo' }, // nieukończony: nie liczy się
    ] }];
    const notion = [
      { typ: 'Backtest', date: '2024-03-12', at: Date.UTC(2024, 2, 12, 13, 40), dir: 'Long', setup: 'ORB', r: 2, btMae: -0.4, btMfe: 2.1, btSession: 'Marzec [bt-abc123/t1]', counted: true }, // ten sam trade co lokalny t1
      { typ: 'Backtest', date: '2024-03-12', at: Date.UTC(2024, 2, 12, 15, 5), dir: 'Short', setup: 'FVG', r: 1, btMae: -0.2, btMfe: 1.4, btSession: 'Inna [bt-zzz999/t4]', counted: true }, // sesja spoza tego urządzenia
      { typ: 'Backtest', date: '2023-05-02', at: Date.UTC(2023, 4, 2, 14, 0), dir: 'Long', setup: 'ORB', r: -1, btSession: '', counted: true }, // stary wpis: Bez sesji
      { typ: 'Live', date: '2024-03-12', at: Date.UTC(2024, 2, 12, 14, 0), dir: 'Long', setup: 'ORB', r: 5, counted: true }, // Live nie wchodzi
    ];
    const m = S.mergeBacktest(notion, sessions);
    assert.equal(m.length, 4, JSON.stringify(m.map((x) => [x.session, x.id])));
    assert.equal(m.filter((x) => x.session === 'bt-abc123').length, 2); // t1 raz (lokalny), t2
    assert.equal(m.filter((x) => x.session === null).length, 1); // Bez sesji
    assert.equal(m.filter((x) => x.session === 'bt-zzz999').length, 1);
    const t1 = m.find((x) => x.session === 'bt-abc123' && x.id === 't1');
    assert.equal(t1.src, 'local');
    assert.equal(t1.time, '09:40'); // 13:40 UTC w marcu 2024 to 09:40 NY (EDT)
    assert.equal(t1.day, '2024-03-12');
    assert.equal(m.find((x) => x.id === 't2').setup, null);
    assert.equal(m.find((x) => x.id === 't2').exit, 'manual');
    const old = m.find((x) => x.session === null);
    assert.equal(old.maeR, null);
    assert.equal(old.mfeR, null);
    assert.equal(old.day, '2023-05-02');
    assert.equal(old.time, '10:00');
  });

  test('backtest-G: wybór sesji', async () => {
    const S = await imp('public/js/bt-staty.js');
    const A = many(3, { session: 'bt-aaaaaa', r: 1 }), B = many(2, { session: 'bt-bbbbbb', r: -1 }), N = many(1, { session: null, r: 2 });
    const all = [...A, ...B, ...N];
    assert.equal(S.pickSessions(all, ['bt-aaaaaa']).length, 3);
    assert.equal(S.pickSessions(all, ['bt-aaaaaa', 'bt-bbbbbb']).length, 5);
    assert.equal(S.pickSessions(all, [null]).length, 1);
    assert.equal(S.pickSessions(all, null).length, 6);
    near(S.summary(S.pickSessions(all, ['bt-aaaaaa', 'bt-bbbbbb'])).sumR, 1);
    near(S.summary(S.pickSessions(all, null)).sumR, 3);
    assert.deepEqual(S.sessionsOf(all).map((s) => [s.id, s.n]), [['bt-aaaaaa', 3], ['bt-bbbbbb', 2], [null, 1]]);
    // krzywa kapitału w R: start + po punkcie na trade
    const pts = S.equityR(all);
    assert.equal(pts.length, 7);
    near(pts[pts.length - 1].cum, 3);
  });

  // ---- widok w przeglądarce ----
  let run = null;
  async function pageResult() {
    run ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const dir = H.tmp();
      const S = await H.server(4921, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-staty.html?part=widok`, { width: 1920, height: 1080, timeoutMs: 120_000 });
        return JSON.parse(txt);
      } finally { S.stop(); }
    })();
    return run;
  }
  async function tagged(tag, min) {
    const res = await pageResult();
    if (!res) { skip('brak Chrome/Edge'); }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }
  test('backtest-G: widok statystyk', () => tagged('widok', 14));
  test('backtest-G: wybór sesji w widoku', () => tagged('sesje', 6));
  test('backtest-G: bez metryk bez decyzji', () => tagged('bezmetryk', 3));
  test('backtest-G: widok 375 px', async () => {
    const P = await imp('testy/przegladarka.mjs');
    if (!P.findBrowser()) { skip('brak Chrome/Edge'); }
    const S = await H.server(4922, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: H.tmp() });
    try {
      const res = JSON.parse(await P.cdpPage(`${S.base}/__testy/backtest-staty.html?part=mobile`, { width: 375, height: 800, timeoutMs: 120_000 }));
      assert.ok(!res.fatal, res.fatal);
      assert.ok(res.checks.filter((c) => c.tag === 'mobile').length >= 2, 'strona wykonała sprawdzenia 375 px');
      assert.deepEqual(res.checks.filter((c) => !c.ok).map((c) => c.msg), []);
    } finally { S.stop(); }
  });
  test('backtest-G: zwykłe widoki bez zmian', async () => {
    // filtr „Backtest” w Statystykach dashboardu liczy te same trade'y co zawsze (stats.js nietknięte), a trade wysłany z replayu jest zwykłym wpisem Backtest
    const { normalizeTrades, calc } = await imp('public/js/stats.js');
    const rows = [
      { _id: 'a', date: '2024-03-12T09:40:00-04:00', typ: { name: 'Backtest' }, dir: { name: 'Long' }, r: 2, btSession: 'Marzec [bt-abc123/t1]', btMae: -0.3, btMfe: 2 },
      { _id: 'b', date: '2023-05-02T10:00:00-04:00', typ: { name: 'Backtest' }, dir: { name: 'Short' }, r: -1 },
      { _id: 'c', date: '2024-03-12', typ: { name: 'Live' }, dir: { name: 'Long' }, r: 1 },
    ];
    const ts = normalizeTrades(rows);
    const bt = ts.filter((x) => x.typ === 'Backtest');
    assert.equal(bt.length, 2);
    assert.equal(calc(bt).n, 2);
    near(calc(bt).sumR, 1, 1e-9);
    const res = await pageResult();
    if (res) assert.deepEqual(res.checks.filter((c) => c.tag === 'zwykle' && !c.ok).map((c) => c.msg), []);
  });
};
