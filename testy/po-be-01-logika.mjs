// po-be-01: czysta logika wyniku po BE (public/js/po-be.js) i koniec dnia handlowego (public/js/dzien-handlowy.js). Bez sieci, bez przeglądarki.
// [U] 04.11.2026 «W tej świecy tylko SL»: w świecy wyjścia sprawdzamy wyłącznie pierwotny SL; TP liczymy od następnej świecy.
// [U] 04.11.2026 «brakuje takiego czegos, jak rezulat trade po BE, nie wiemy czy nasze BE dziala» + blokada przyszłości: wynik nie zależy od świec za limitem.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const utc = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000;
  // wtorek 3.11.2026 10:00 ET (15:00Z), koniec dnia handlowego 17:00 ET = 22:00Z
  const T0 = utc(2026, 11, 3, 15), END = utc(2026, 11, 3, 22);
  // świeca [t, o, h, l, c, v]
  const bar = (t, h, l, o = 100, c = 100) => [t, o, h, l, c, 1];
  const min = (i, h, l) => bar(T0 + i * 60, h, l);
  const sec = (s, h, l) => bar(T0 + s, h, l);
  const long = { dir: 'long', entry: 100, sl: 99, tp: 102 };
  const short = { dir: 'short', entry: 100, sl: 101, tp: 98 };
  // wyjście w minucie 0 (T0), granica = koniec dnia, dane pokryte
  const base = { exitT: T0, exitPrecise: false, end: END, limit: END, secs: [], covered: true };
  const run = async (o) => (await lib('public/js/po-be.js')).resolveAfterBe({ ...base, ...o });
  const flat = (i) => min(i, 100.5, 99.5);

  test('po-be-01: stałe i eksport wersji algorytmu', async () => {
    const P = await lib('public/js/po-be.js');
    assert.equal(P.AFTER_BE_VERSION, 2);
  });

  test('po-be-01: long i short: TP przed SL daje tp i R celu', async () => {
    const rl = await run({ ...long, bars: [min(0, 100.5, 99.5), min(1, 100.5, 99.5), min(2, 102, 100)] });
    assert.equal(rl.status, 'tp'); assert.equal(rl.at, T0 + 120); assert.equal(rl.rIfHeld, 2);
    const rs = await run({ ...short, bars: [min(0, 100.5, 99.5), min(1, 100, 98)] });
    assert.equal(rs.status, 'tp'); assert.equal(rs.at, T0 + 60); assert.equal(rs.rIfHeld, 2);
  });

  test('po-be-01: long i short: SL przed TP daje sl i -1R', async () => {
    const rl = await run({ ...long, bars: [flat(0), min(1, 100.5, 99), min(2, 103, 100)] });
    assert.equal(rl.status, 'sl'); assert.equal(rl.at, T0 + 60); assert.equal(rl.rIfHeld, -1);
    const rs = await run({ ...short, bars: [flat(0), min(1, 101, 99.5), min(2, 100, 97)] });
    assert.equal(rs.status, 'sl'); assert.equal(rs.rIfHeld, -1);
  });

  test('po-be-01: oba poziomy w jednej świecy: pierwszy dotyk wg sekund tej minuty, bez sekund albo w tej samej sekundzie sl', async () => {
    const both = min(1, 102.5, 98.5);
    const bars = [flat(0), both, min(2, 100.5, 99.5)];
    const tpFirst = await run({ ...long, bars, secs: [sec(60, 102.5, 100), sec(61, 100, 98.5)] });
    assert.equal(tpFirst.status, 'tp'); assert.equal(tpFirst.at, T0 + 60);
    const slFirst = await run({ ...long, bars, secs: [sec(60, 100.5, 98.5), sec(61, 102.5, 100)] });
    assert.equal(slFirst.status, 'sl');
    const noSecs = await run({ ...long, bars, secs: [] });
    assert.equal(noSecs.status, 'sl', 'bez sekund liczymy SL');
    const same = await run({ ...long, bars, secs: [sec(60, 102.5, 98.5)] });
    assert.equal(same.status, 'sl', 'ta sama sekunda: sl');
    const sh = await run({ ...short, bars: [flat(0), min(1, 101.5, 97.5)], secs: [sec(60, 100, 97.5), sec(61, 101.5, 100)] });
    assert.equal(sh.status, 'tp', 'short: pierwszy dotyk TP');
  });

  test('po-be-01: świeca wyjścia: dotknięcie SL daje sl, ekstremum za TP bez dalszego dotknięcia daje open (nie tp)', async () => {
    const sl = await run({ ...long, bars: [min(0, 100.5, 99), min(1, 102, 100)] });
    assert.equal(sl.status, 'sl'); assert.equal(sl.at, T0);
    const open = await run({ ...long, bars: [min(0, 103, 99.5), flat(1), flat(2)] });
    assert.equal(open.status, 'open', 'high za TP w świecy wyjścia nie liczy się');
    assert.equal(open.at, null); assert.equal(open.rIfHeld, null);
  });

  test('po-be-01: exitPrecise: true z sekundami: świecą wyjścia jest sekunda, TP 20 s po wyjściu w tej samej minucie daje tp; false daje open', async () => {
    const exitT = T0 + 10;
    const bars = [min(0, 102.5, 99.5), min(1, 100.5, 99.5)];
    const secs = [sec(5, 100.5, 99.5), sec(10, 100.5, 99.5), sec(30, 102.5, 100)];
    const p = await run({ ...long, exitT, exitPrecise: true, bars, secs });
    assert.equal(p.status, 'tp'); assert.equal(p.at, T0 + 30);
    const n = await run({ ...long, exitT, exitPrecise: false, bars, secs });
    assert.equal(n.status, 'open', 'Notion: cała minuta to świeca wyjścia');
    const slSec = await run({ ...long, exitT, exitPrecise: true, bars, secs: [sec(10, 100.5, 99), sec(30, 102.5, 100)] });
    assert.equal(slSec.status, 'sl', 'dotknięcie SL w sekundzie wyjścia');
  });

  test('po-be-01: luka za SL daje sl', async () => {
    const r = await run({ ...long, bars: [flat(0), bar(T0 + 60, 98.5, 97.5, 98, 98)] });
    assert.equal(r.status, 'sl'); assert.equal(r.rIfHeld, -1);
  });

  test('po-be-01: covered: false bez rozstrzygnięcia daje no-data, z rozstrzygnięciem przed końcem pokrycia wynik; sesja skrócona z covered: true daje open', async () => {
    const nd = await run({ ...long, bars: [flat(0)], covered: false });
    assert.deepEqual(nd, { status: 'no-data', at: null, rIfHeld: null, mfeR: null, hitSl: null });
    const hit = await run({ ...long, bars: [flat(0), min(1, 102, 100)], covered: false, coveredTo: T0 + 120 });
    assert.equal(hit.status, 'tp');
    const short1 = await run({ ...long, bars: [flat(0), flat(1)], covered: true });
    assert.equal(short1.status, 'open');
    const noExit = await run({ ...long, bars: [flat(0)], exitT: null });
    assert.equal(noExit.status, 'no-data');
  });

  test('po-be-01: bez TP: mfe z mfeR i hitSl; pending dopóki okno trwa, chyba że SL już padł', async () => {
    const noTp = { dir: 'long', entry: 100, sl: 99, tp: null };
    const end = await run({ ...noTp, bars: [flat(0), min(1, 101.5, 99.5), min(2, 101, 99.5)] });
    assert.equal(end.status, 'mfe'); assert.equal(end.mfeR, 1.5); assert.equal(end.hitSl, false); assert.equal(end.rIfHeld, null);
    const hit = await run({ ...noTp, bars: [flat(0), min(1, 101, 99.5), min(2, 100.5, 99), min(3, 105, 100)] });
    assert.equal(hit.status, 'mfe'); assert.equal(hit.mfeR, 1); assert.equal(hit.hitSl, true); assert.equal(hit.at, T0 + 120, 'ruch w świecy z SL i późniejsze świece nie liczą się do mfeR');
    const early = await run({ ...noTp, limit: T0 + 180, bars: [flat(0), min(1, 101.5, 99.5)] });
    assert.deepEqual(early, { status: 'pending', at: null, rIfHeld: null, mfeR: null, hitSl: null }, 'bez TP mfeR nie wychodzi przed końcem okna');
    const earlySl = await run({ ...noTp, limit: T0 + 180, bars: [flat(0), min(1, 101.5, 99.5), min(2, 100, 98.9)] });
    assert.equal(earlySl.status, 'mfe'); assert.equal(earlySl.hitSl, true);
    const shortNoTp = await run({ dir: 'short', entry: 100, sl: 101, tp: null, bars: [flat(0), min(1, 100.5, 98)] });
    assert.equal(shortNoTp.mfeR, 2);
  });

  test('po-be-01: no-levels: SL = wejście albo po złej stronie; isAfterBeLevels', async () => {
    const P = await lib('public/js/po-be.js');
    assert.equal(P.isAfterBeLevels({ dir: 'long', entry: 100, sl: 99 }), true);
    assert.equal(P.isAfterBeLevels({ dir: 'long', entry: 100, sl: 100 }), false);
    assert.equal(P.isAfterBeLevels({ dir: 'long', entry: 100, sl: 101 }), false);
    assert.equal(P.isAfterBeLevels({ dir: 'short', entry: 100, sl: 101 }), true);
    assert.equal(P.isAfterBeLevels({ dir: 'short', entry: 100, sl: 99 }), false);
    assert.equal(P.isAfterBeLevels({ dir: 'long', entry: 100, sl: null }), false);
    for (const lv of [{ dir: 'long', entry: 100, sl: 100, tp: 102 }, { dir: 'long', entry: 100, sl: 101, tp: 102 }, { dir: 'short', entry: 100, sl: 99, tp: 98 }, { dir: 'long', entry: 100, sl: null, tp: 102 }]) {
      const r = await run({ ...lv, bars: [flat(0), min(1, 102, 98)] });
      assert.deepEqual(r, { status: 'no-levels', at: null, rIfHeld: null, mfeR: null, hitSl: null });
    }
  });

  test('po-be-01: świeca poza limit nie wpływa na wynik, także gdy funkcja ją dostanie', async () => {
    const limit = T0 + 180;
    const r1 = await run({ ...long, limit, bars: [flat(0), flat(1), flat(2), min(3, 103, 100)] });
    assert.equal(r1.status, 'pending', 'TP w świecy t == limit jest przyszłością');
    const r2 = await run({ ...long, limit, bars: [flat(0), flat(1), flat(2), min(3, 100, 98)], secs: [sec(180, 100, 98)] });
    assert.equal(r2.status, 'pending');
    const r3 = await run({ ...long, limit, bars: [flat(0), min(1, 102, 100), min(3, 100, 98)] });
    assert.equal(r3.status, 'tp', 'rozstrzygnięcie przed limitem zostaje');
  });

  test('po-be-01: blokada czystej funkcji: dwa zestawy różniące się tylko po limit dają identyczny wynik (pending bajt w bajt)', async () => {
    const limit = T0 + 300;
    const head = [flat(0), flat(1), flat(2), flat(3), flat(4)];
    const withTp = [...head, min(5, 103, 100), min(6, 103, 100)];
    const withSl = [...head, min(5, 100, 98), min(6, 100, 98)];
    for (const lv of [long, { dir: 'long', entry: 100, sl: 99, tp: null }, short]) {
      const a = await run({ ...lv, limit, bars: withTp, secs: [sec(300, 103, 100)] });
      const b = await run({ ...lv, limit, bars: withSl, secs: [sec(300, 100, 98)] });
      assert.deepEqual(a, b);
      assert.equal(JSON.stringify(a), JSON.stringify(b));
      assert.equal(a.status, 'pending');
    }
  });

  test('po-be-01: rWithoutBe: tp daje R celu, sl daje -1, reszta null', async () => {
    const { rWithoutBe } = await lib('public/js/po-be.js');
    const lv = { entry: 100, sl: 98, tp: 105 };
    assert.equal(rWithoutBe({ status: 'tp' }, lv), 2.5);
    assert.equal(rWithoutBe({ status: 'sl' }, lv), -1);
    for (const s of ['open', 'mfe', 'pending', 'no-data', 'no-levels', 'no-session']) assert.equal(rWithoutBe({ status: s }, lv), null);
    assert.equal(rWithoutBe({ status: 'tp' }, { entry: 100, sl: 100, tp: 105 }), null, 'zerowe ryzyko');
    assert.equal(rWithoutBe({ status: 'tp' }, { entry: 100, sl: 98, tp: null }), null);
    assert.equal(rWithoutBe({ status: 'tp' }, { entry: 100, sl: 102, tp: 95 }), 2.5, 'short');
  });

  test('po-be-01: afterBeStats: mianownik tp+sl+open, sumActual tylko z rozstrzygniętych, rozbicie na setupy', async () => {
    const { afterBeStats } = await lib('public/js/po-be.js');
    const row = (setup, r, status, rIfHeld = null) => ({ setup, r, afterBe: { status, rIfHeld } });
    const rows = [
      row('A', 0.1, 'tp', 2), row('A', 0, 'tp', 3), row('A', 0.2, 'sl', -1), row('A', 0, 'open'),
      row('B', 0, 'sl', -1), row('B', 0.3, 'mfe'), row('B', 0, 'pending'), row('B', 0, 'no-data'), row('B', 0, 'no-levels'), row('B', 0, 'no-session'),
      { setup: 'C', r: 5, afterBe: null },
    ];
    const s = afterBeStats(rows);
    assert.deepEqual({ n: s.n, tp: s.tp, sl: s.sl, open: s.open, mfe: s.mfe, pending: s.pending, noData: s.noData, noLevels: s.noLevels, noSession: s.noSession }, { n: 10, tp: 2, sl: 2, open: 1, mfe: 1, pending: 1, noData: 1, noLevels: 1, noSession: 1 });
    assert.equal(s.pctTp, 40); assert.equal(s.pctSl, 40); assert.equal(s.pctOpen, 20);
    assert.equal(s.sumIfHeld, 3);
    assert.ok(Math.abs(s.sumActual - 0.3) < 1e-9, 'tylko trade\'y z sumIfHeld: 0.1+0+0.2');
    assert.deepEqual(s.bySetup.map((x) => [x.setup, x.n, x.tp, x.sl, x.open]), [['B', 6, 0, 1, 0], ['A', 4, 2, 1, 1]]);
    const a = s.bySetup.find((x) => x.setup === 'A');
    assert.equal(a.sumIfHeld, 4); assert.ok(Math.abs(a.sumActual - 0.3) < 1e-9);
    const empty = afterBeStats([]);
    assert.equal(empty.n, 0); assert.equal(empty.pctTp, null); assert.equal(empty.sumIfHeld, 0); assert.deepEqual(empty.bySetup, []);
  });

  test('po-be-01: tradingDayEnd: 17:00 ET ściśle po chwili, weekend, zmiana czasu', async () => {
    const { tradingDayEnd } = await lib('public/js/dzien-handlowy.js');
    // zima (EST, UTC-5)
    assert.equal(tradingDayEnd(utc(2026, 1, 13, 14, 40)), utc(2026, 1, 13, 22), '09:40 ET: 17:00 ET tego dnia');
    assert.equal(tradingDayEnd(utc(2026, 1, 13, 22, 0, 0)), utc(2026, 1, 14, 22), '17:00:00 ET: następny dzień');
    assert.equal(tradingDayEnd(utc(2026, 1, 13, 21, 59, 59)), utc(2026, 1, 13, 22));
    assert.equal(tradingDayEnd(utc(2026, 1, 13, 22, 30)), utc(2026, 1, 14, 22), '17:30 ET');
    assert.equal(tradingDayEnd(utc(2026, 1, 13, 23, 5)), utc(2026, 1, 14, 22), '18:05 ET');
    // piątek 16.01.2026 17:30 ET -> poniedziałek 19.01 17:00 ET
    assert.equal(tradingDayEnd(utc(2026, 1, 16, 22, 30)), utc(2026, 1, 19, 22));
    // sobota i niedziela przed 18:00 ET
    assert.equal(tradingDayEnd(utc(2026, 1, 17, 15)), utc(2026, 1, 19, 22));
    assert.equal(tradingDayEnd(utc(2026, 1, 18, 15)), utc(2026, 1, 19, 22));
    assert.equal(tradingDayEnd(utc(2026, 1, 18, 22, 30)), utc(2026, 1, 19, 22), 'niedziela 17:30 ET');
    // niedziela 18:30 ET (23:30Z) -> poniedziałek 17:00
    assert.equal(tradingDayEnd(utc(2026, 1, 18, 23, 30)), utc(2026, 1, 19, 22));
    // lato (EDT, UTC-4)
    assert.equal(tradingDayEnd(utc(2026, 7, 14, 13, 40)), utc(2026, 7, 14, 21));
    // DST wiosna: niedziela 8.03.2026 18:30 EDT (22:30Z) -> poniedziałek 9.03 17:00 EDT (21:00Z)
    assert.equal(tradingDayEnd(utc(2026, 3, 8, 22, 30)), utc(2026, 3, 9, 21));
    assert.equal(tradingDayEnd(utc(2026, 3, 6, 22, 30)), utc(2026, 3, 9, 21), 'piątek 17:30 EST przed zmianą -> poniedziałek EDT');
    // DST jesień: niedziela 1.11.2026 18:30 EST (23:30Z) -> poniedziałek 2.11 17:00 EST (22:00Z); piątek 30.10 17:30 EDT (21:30Z)
    assert.equal(tradingDayEnd(utc(2026, 11, 1, 23, 30)), utc(2026, 11, 2, 22));
    assert.equal(tradingDayEnd(utc(2026, 10, 30, 21, 30)), utc(2026, 11, 2, 22));
    assert.equal(tradingDayEnd(utc(2026, 11, 1, 12)), utc(2026, 11, 2, 22));
  });

  test('po-be-01: tradingDayEnd zgodny z tradingDayRange dla każdego dnia roboczego 2020-2031', async () => {
    const { tradingDayEnd, tradingDayRange } = await lib('public/js/dzien-handlowy.js');
    const L = await lib('lib/news.mjs');
    let n = 0;
    for (let d = L.dayNum(2020, 1, 1); d < L.dayNum(2031, 1, 1); d++) {
      if (L.weekdayOf(d) === 0 || L.weekdayOf(d) === 6) continue;
      const r = tradingDayRange(L.dateStr(d));
      if (tradingDayEnd(r.from) !== r.to) assert.fail(`początek dnia ${L.dateStr(d)}: koniec rozjechany z tradingDayRange`);
      if (tradingDayEnd(r.to - 1) !== r.to) assert.fail(`koniec dnia ${L.dateStr(d)} minus sekunda`);
      if (tradingDayEnd(r.to) <= r.to) assert.fail(`17:00 ${L.dateStr(d)} musi dać następny dzień`);
      n++;
    }
    assert.ok(n > 2800, `dni robocze: ${n}`);
    const N = await lib('public/js/newsy.js');
    assert.equal(N.tradingDayRange, tradingDayRange, 'newsy.js reeksportuje tę samą funkcję');
  });

  // [U] 04.11.2026 decyzja sesji głównej: TP po złej stronie wejścia to brak poziomów (zadanie 2).
  test('po-be-01: TP po złej stronie wejścia (long z tp <= entry, short z tp >= entry) daje no-levels, brak TP zostaje dozwolony', async () => {
    const P = await lib('public/js/po-be.js');
    const bars = [flat(0), flat(1)];
    for (const o of [{ ...long, tp: 100 }, { ...long, tp: 99.5 }, { ...short, tp: 100 }, { ...short, tp: 101.5 }]) {
      assert.equal(P.isAfterBeLevels(o), false);
      const r = await run({ ...o, bars });
      assert.equal(r.status, 'no-levels', JSON.stringify(o));
      assert.deepEqual(r, { status: 'no-levels', at: null, rIfHeld: null, mfeR: null, hitSl: null });
    }
    assert.equal(P.isAfterBeLevels({ ...long, tp: 102 }), true);
    assert.equal(P.isAfterBeLevels({ ...long, tp: null }), true, 'brak TP to nie błąd poziomów');
    assert.equal((await run({ ...long, tp: null, bars })).status, 'mfe');
  });

  test('po-be-01: afterBeStats: wiersz bez liczbowego r jest pomijany w obu sumach R', async () => {
    const { afterBeStats } = await lib('public/js/po-be.js');
    const tp = { status: 'tp', rIfHeld: 2 };
    const s = afterBeStats([{ setup: 'A', r: 0, afterBe: tp }, { setup: 'A', r: null, afterBe: tp }, { setup: 'A', afterBe: tp }, { setup: 'A', r: NaN, afterBe: tp }]);
    assert.equal(s.n, 4, 'wiersz nadal liczy się w licznikach statusów');
    assert.equal(s.tp, 4);
    assert.equal(s.sumIfHeld, 2, 'tylko wiersz z liczbowym r');
    assert.equal(s.sumActual, 0);
    assert.equal(s.bySetup[0].sumIfHeld, 2);
  });
};
