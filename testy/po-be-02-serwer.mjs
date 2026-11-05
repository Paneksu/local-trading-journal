// po-be-02: endpoint wyniku po BE (lib/po-be.mjs, POST /api/after-be) na atrapach: blokada przyszłości po stronie serwera, pamięć podręczna, walidacja.
// [U] 04.11.2026 «jak zapisuje trade i journaluje jeszcze podczas jak nie poznalem przyszlych swiec w backtestingowej sesji to nnie powinny mi sie ujawniac wtedy»:
// serwer ignoruje poziomy i limit od klienta, granicę bierze z pliku sesji (book.hwi/hw) i niczego spoza Result nie oddaje.
// Bez sieci i bez Notion: atrapy btStore, replayRange i candles, katalog pamięci podręcznej tymczasowy.
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const utc = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000;
  // wtorek 3.11.2026 10:00 ET (15:00Z); koniec dnia handlowego 17:00 ET = 22:00Z
  const T0 = utc(2026, 11, 3, 15), END = utc(2026, 11, 3, 22);
  const NOW_AFTER_END = (END + 3600) * 1000;
  const KEYS = ['at', 'hitSl', 'mfeR', 'rIfHeld', 'status'];
  const pendingBody = { status: 'pending', at: null, rIfHeld: null, mfeR: null, hitSl: null };

  // minuty od T0 do END: płasko 100.5/99.5; over = { minuta: [high, low] }
  function minutes(over = {}) {
    const out = [];
    for (let t = T0, i = 0; t < END + 3 * 3600; t += 60, i++) {
      const [h, l] = over[i] || [100.5, 99.5];
      out.push([t, 100, h, l, 100, 1]);
    }
    return out;
  }
  const tpAt = (i) => ({ [i]: [103, 100] });
  const slAt = (i) => ({ [i]: [100.5, 98] });

  // atrapa zakresu replayu: hostylna, bo oddaje świece także za `to` (kod serwera musi je odciąć sam); pokrycie liczy z `to` i końca danych (until)
  function fakeRange({ bars, until = Infinity, boom = false, secs = [] }) {
    const calls = [];
    return {
      calls,
      readAfterBe(instrument, from, to) {
        if (boom) throw new Error('atrapa: odczyt świec zabroniony');
        calls.push({ instrument, from, to });
        // pokrycie do końca ostatniej pełnej minuty przed `to`, jak w prawdziwym readAfterBe
        const c = Math.floor(to / 60) * 60;
        return { m1: bars.filter((b) => b[0] >= from && b[0] < until), s1: secs.filter((b) => b[0] >= from && b[0] < until), real1s: [], covered: c <= from || c <= until };
      },
    };
  }
  function fakeStore(docs) {
    const calls = [];
    return { calls, read(id) { calls.push(id); if (docs === null) throw new Error('atrapa: odczyt sesji zabroniony'); return docs[id] ?? null; } };
  }
  const session = (hw, { hwi, trade = {} } = {}) => ({
    v: 2,
    book: { hw, hwi: hwi ?? { NQ: hw } },
    trades: [{ id: 'T1', instrument: 'NQ', dir: 'long', entryPrice: 100, sl0: 99, tp: 102, exitT: T0, ...trade }],
  });
  async function make({ docs, range, candles, now = () => NOW_AFTER_END, wantWindows, baseDir = H.tmp() } = {}) {
    const { createAfterBe } = await imp('lib/po-be.mjs');
    const store = fakeStore(docs === undefined ? { 'bt-test0001': session(T0 + 600) } : docs);
    const rr = range ?? fakeRange({ bars: minutes() });
    const svc = createAfterBe({ btStore: store, replayRange: rr, candles: candles ?? { read() { throw new Error('atrapa: candles.read zabroniony'); } }, baseDir, now, wantWindows });
    return { svc, store, rr, baseDir, cacheFile: path.join(baseDir, 'after-be-cache.json') };
  }
  const bt = (extra = {}) => ({ key: 'bt-test0001/T1', typ: 'Backtest', ...extra });
  // results nie ma prototypu (pkt 12 fali końcowej), a na zewnątrz i tak idzie JSON
  const toPlain = (x) => JSON.parse(JSON.stringify(x));
  const one = async (svc, item) => (await svc.resolve([item])).results[item.key];
  const rejects400 = async (fn, re) => {
    let err = null;
    try { await fn(); } catch (e) { err = e; }
    assert.ok(err, 'powinno rzucić');
    assert.equal(err.status, 400, String(err && err.message));
    if (re) assert.match(err.message, re);
  };

  test('po-be-02: TP i SL tuż za hw dają identyczne ciało odpowiedzi (pending), po podniesieniu hw wynik się pojawia', async () => {
    const A = await make({ range: fakeRange({ bars: minutes(tpAt(10)) }), docs: { 'bt-test0001': session(T0 + 600) } });
    const B = await make({ range: fakeRange({ bars: minutes(slAt(10)) }), docs: { 'bt-test0001': session(T0 + 600) } });
    const ra = await A.svc.resolve([bt()]), rb = await B.svc.resolve([bt()]);
    assert.deepEqual(ra, rb);
    assert.equal(JSON.stringify(ra), JSON.stringify(rb), 'bajt w bajt');
    assert.deepEqual(toPlain(ra), { results: { 'bt-test0001/T1': pendingBody } });
    // hw tuż za świecą 10 (t = T0 + 600): świeca wchodzi do wyniku
    const A2 = await make({ range: fakeRange({ bars: minutes(tpAt(10)) }), docs: { 'bt-test0001': session(T0 + 661) } });
    const B2 = await make({ range: fakeRange({ bars: minutes(slAt(10)) }), docs: { 'bt-test0001': session(T0 + 661) } });
    const a2 = (await A2.svc.resolve([bt()])).results['bt-test0001/T1'], b2 = (await B2.svc.resolve([bt()])).results['bt-test0001/T1'];
    assert.equal(a2.status, 'tp'); assert.equal(a2.at, T0 + 600); assert.equal(a2.rIfHeld, 2);
    assert.equal(b2.status, 'sl'); assert.equal(b2.rIfHeld, -1);
  });

  test('po-be-02: serwer czyta świece tylko do hw: zapytanie ma to <= granica, a brak danych za granicą daje ten sam wynik co komplet (covered liczone do min(limit, end))', async () => {
    const hw = T0 + 600;
    const full = await make({ range: fakeRange({ bars: minutes(tpAt(12)) }), docs: { 'bt-test0001': session(hw) } });
    // dane kończą się dokładnie na granicy: nic za nią, a przed nią komplet
    const cut = await make({ range: fakeRange({ bars: minutes(tpAt(12)), until: hw }), docs: { 'bt-test0001': session(hw) } });
    const rf = await full.svc.resolve([bt()]), rc = await cut.svc.resolve([bt()]);
    assert.equal(JSON.stringify(rf), JSON.stringify(rc));
    assert.deepEqual(rc.results['bt-test0001/T1'], pendingBody, 'pending, nie no-data');
    for (const c of [...full.rr.calls, ...cut.rr.calls]) assert.ok(c.to <= hw, `to ${c.to} <= hw ${hw}`);
    // dziura PRZED granicą to prawdziwy brak danych, z którego wolno wyciągnąć no-data
    const hole = await make({ range: fakeRange({ bars: minutes(), until: hw - 120 }), docs: { 'bt-test0001': session(hw) } });
    assert.equal((await one(hole.svc, bt())).status, 'no-data');
    // hostylna atrapa oddaje też świece za `to`: tp w minucie 5 (t < hw) jest wynikiem, tp w minucie 10 (t = hw) nie
    const inside = await make({ range: fakeRange({ bars: minutes(tpAt(5)) }), docs: { 'bt-test0001': session(hw) } });
    assert.equal((await one(inside.svc, bt())).status, 'tp');
  });

  test('po-be-02: cofnięty kursor poniżej hw nie zmienia wyniku, a klient nie wpływa na granicę ani poziomy (limit, entry, sl, tp, exitT, dir z klienta ignorowane)', async () => {
    const rng = fakeRange({ bars: minutes(tpAt(10)) });
    const plain = await make({ range: rng, docs: { 'bt-test0001': session(T0 + 600) } });
    const base = await plain.svc.resolve([bt()]);
    // sesja z kursorem cofniętym: w dokumencie jest tylko hw, więc cofnięcie niczego nie zmienia; dokument z dodatkowym polem cursor daje to samo
    const rewound = await make({ range: rng, docs: { 'bt-test0001': { ...session(T0 + 600), cursor: T0 + 120, book: { hw: T0 + 600, hwi: { NQ: T0 + 600 }, cursor: T0 + 100 } } } });
    assert.equal(JSON.stringify(await rewound.svc.resolve([bt()])), JSON.stringify(base));
    // fałszywe pola od klienta
    const liar = await make({ range: rng, docs: { 'bt-test0001': session(T0 + 600) } });
    const lying = await liar.svc.resolve([bt({ limit: END, hw: END, cursor: END, entryPrice: 50, entry: 50, sl: 10, sl0: 10, tp: 100.1, exitT: T0 - 9999, exitAt: 1, dir: 'short', instrument: 'ES', contract: 'ESZ6', now: END })]);
    assert.equal(JSON.stringify(lying), JSON.stringify(base));
    assert.deepEqual(toPlain(lying), { results: { 'bt-test0001/T1': pendingBody } });
    for (const c of liar.rr.calls) { assert.equal(c.instrument, 'NQ', 'instrument z sesji'); assert.ok(c.to <= T0 + 600); }
  });

  test('po-be-02: granica to book.hwi[instrument], a gdy go brak book.hw; bez obu serwer nie ujawnia niczego za wyjściem', async () => {
    const bars = minutes(tpAt(10));
    const hwi = await make({ range: fakeRange({ bars }), docs: { 'bt-test0001': session(END, { hwi: { NQ: T0 + 600 } }) } });
    assert.deepEqual((await one(hwi.svc, bt())), pendingBody, 'hwi wygrywa z hw');
    const hw = await make({ range: fakeRange({ bars }), docs: { 'bt-test0001': { v: 2, book: { hw: T0 + 600 }, trades: session(0).trades } } });
    assert.deepEqual((await one(hw.svc, bt())), pendingBody, 'bez hwi działa hw');
    const none = await make({ range: fakeRange({ bars }), docs: { 'bt-test0001': { v: 2, book: {}, trades: session(0).trades } } });
    const rn = await one(none.svc, bt());
    assert.ok(rn.status === 'pending' || rn.status === 'no-data', rn.status);
    for (const c of none.rr.calls) assert.ok(c.to <= T0 + 60, 'bez znaku wodnego nic dalej niż wyjście');
  });

  test('po-be-02: brak sesji, brak trade\'a, noSession, uszkodzona sesja: no-session; noSession nigdy nie czyta ani sesji, ani świec', async () => {
    const ns = { status: 'no-session', at: null, rIfHeld: null, mfeR: null, hitSl: null };
    const A = await make({ docs: {} });
    assert.deepEqual(await one(A.svc, bt()), ns, 'brak pliku sesji');
    const B = await make({ docs: { 'bt-test0001': session(T0 + 600) } });
    assert.deepEqual(await one(B.svc, { key: 'bt-test0001/T9', typ: 'Backtest' }), ns, 'brak trade\'a w sesji');
    const C = await make({ docs: null, range: fakeRange({ boom: true }) });
    assert.deepEqual(await one(C.svc, bt({ noSession: true })), ns, 'noSession: atrapa rzuca przy każdym odczycie');
    assert.equal(C.store.calls.length, 0);
    const D = await make({ docs: null, range: fakeRange({ boom: true }) });
    assert.deepEqual(await one(D.svc, bt()), ns, 'sesja nieczytelna: no-session bez przecieku');
  });

  test('po-be-02: Live z kontraktem czyta warstwę kontraktu przez candles.read (tf 1m, tfrom/tto, bez adjust), nie przeliczoną serię ani replayRange', async () => {
    const calls = [];
    const candles = {
      read(q) {
        calls.push(q);
        // hostylnie: świece także za `to`
        return { bars: minutes(tpAt(5)).filter((b) => b[0] >= Number(q.from)), covered: [[Number(q.from), Number(q.to)]] };
      },
    };
    const { svc, rr } = await make({ candles, range: fakeRange({ boom: true }), docs: null });
    const item = { key: 'live-1', typ: 'Live', instrument: 'NQ', contract: 'nqz6', dir: 'Long', entryPrice: 100, sl: 99, tp: 102, exitAt: T0 * 1000 };
    const r = await one(svc, item);
    assert.equal(r.status, 'tp'); assert.equal(r.at, T0 + 300); assert.equal(r.rIfHeld, 2);
    assert.deepEqual(Object.keys(r).sort(), KEYS);
    assert.equal(calls.length, 1);
    const q = calls[0];
    assert.equal(q.instrument, 'NQ'); assert.equal(q.tf, '1m'); assert.equal(q.contract, 'NQZ6');
    assert.equal(String(q.tfrom), String(T0)); assert.equal(String(q.tto), String(T0));
    assert.ok(!('adjust' in q), 'bez back-adjust');
    assert.equal(Number(q.from), T0); assert.ok(Number(q.to) <= END, 'do końca okna');
    assert.equal(rr.calls.length, 0);
    // Paper tak samo, bez kontraktu: pole contract puste
    const p = await one(svc, { ...item, key: 'paper-1', typ: 'Paper', contract: '' });
    assert.equal(p.status, 'tp');
    assert.ok(!calls[1].contract, 'puste pole Kontrakt = reguła serwera');
  });

  test('po-be-02: Live bez świec: no-data i wantWindows (wstrzyknięte), pending bez wantWindows; domyślny wantWindows nic nie robi', async () => {
    const want = [];
    const noBars = { read: (q) => ({ bars: [], covered: [] }) };
    const A = await make({ candles: noBars, docs: null, wantWindows: (x) => want.push(x) });
    const item = { key: 'live-2', typ: 'Live', instrument: 'NQ', contract: 'NQZ6', dir: 'Long', entryPrice: 100, sl: 99, tp: 102, exitAt: T0 * 1000 };
    assert.equal((await one(A.svc, item)).status, 'no-data');
    assert.equal(want.length, 1);
    assert.ok(JSON.stringify(want[0]).includes('live-2'));
    // trade w toku okna (now 5 minut po wyjściu), dane pokryte: pending, nic do pobrania
    const full = { read: (q) => ({ bars: minutes().filter((b) => b[0] >= Number(q.from)), covered: [[Number(q.from), Number(q.to)]] }) };
    const want2 = [];
    const B = await make({ candles: full, docs: null, now: () => (T0 + 300) * 1000, wantWindows: (x) => want2.push(x) });
    assert.deepEqual(await one(B.svc, item), pendingBody);
    assert.equal(want2.length, 0);
    // domyślnie wantWindows nie istnieje i nie rzuca
    const C = await make({ candles: noBars, docs: null });
    assert.equal((await one(C.svc, item)).status, 'no-data');
  });

  test('po-be-02: pamięć podręczna: pending nie trafia na dysk, wynik końcowy tak, drugi odczyt nie czyta świec, zmiana SL zmienia klucz', async () => {
    const calls = [];
    const candles = { read: (q) => { calls.push(q); return { bars: minutes(tpAt(5)).filter((b) => b[0] >= Number(q.from)), covered: [[Number(q.from), Number(q.to)]] }; } };
    const item = { key: 'live-3', typ: 'Live', instrument: 'NQ', contract: 'NQZ6', dir: 'Long', entryPrice: 100, sl: 99, tp: 102, exitAt: T0 * 1000 };
    // pending: now w trakcie okna
    const P = await make({ candles, docs: null, now: () => (T0 + 120) * 1000 });
    assert.deepEqual(await one(P.svc, item), pendingBody);
    assert.ok(!existsSync(P.cacheFile) || Object.keys(JSON.parse(readFileSync(P.cacheFile, 'utf8')).entries || {}).length === 0, 'pending nie jest zapisany');
    // wynik końcowy: now po końcu okna
    const F = await make({ candles, docs: null });
    const before = calls.length;
    const r1 = await one(F.svc, item);
    assert.equal(r1.status, 'tp');
    assert.equal(calls.length, before + 1);
    assert.ok(existsSync(F.cacheFile), 'plik pamięci podręcznej w baseDir');
    assert.ok(!existsSync(F.cacheFile + '.tmp'), 'zapis atomowy nie zostawia pliku tymczasowego');
    const r2 = await one(F.svc, item);
    assert.deepEqual(r2, r1);
    assert.equal(calls.length, before + 1, 'drugi odczyt z pamięci, bez świec');
    // nowa instancja czyta ten sam plik z dysku
    const { createAfterBe } = await imp('lib/po-be.mjs');
    const again = createAfterBe({ btStore: fakeStore(null), replayRange: fakeRange({ boom: true }), candles, baseDir: F.baseDir, now: () => NOW_AFTER_END });
    assert.deepEqual(await one(again, item), r1);
    assert.equal(calls.length, before + 1, 'po restarcie też z dysku');
    // zmiana SL: nowy klucz, nowy odczyt, inny wynik poziomów
    const r3 = await one(F.svc, { ...item, sl: 98 });
    assert.equal(calls.length, before + 2);
    assert.equal(r3.status, 'tp'); assert.equal(r3.rIfHeld, 1, 'R celu liczone od nowego SL: 2 / 2');
    // uszkodzony plik pamięci podręcznej nie psuje usługi
    writeFileSync(F.cacheFile, '{nie json');
    const broken = createAfterBe({ btStore: fakeStore(null), replayRange: fakeRange({ boom: true }), candles, baseDir: F.baseDir, now: () => NOW_AFTER_END });
    assert.equal((await one(broken, item)).status, 'tp');
  });

  test('po-be-02: pamięć podręczna nie ujawnia przyszłości: wynik zapisany przy dalekim hw jest pominięty, gdy hw sesji jest wcześniej', async () => {
    const baseDir = H.tmp();
    const range = fakeRange({ bars: minutes(tpAt(10)) });
    const far = await make({ baseDir, range, docs: { 'bt-test0001': es(END + 7200) } });
    const rf = await one(far.svc, bt());
    assert.equal(rf.status, 'tp'); assert.equal(rf.at, T0 + 600);
    const n = range.calls.length;
    assert.deepEqual(await one(far.svc, bt()), rf);
    assert.equal(range.calls.length, n, 'przy hw za końcem okna wynik z pamięci');
    // ta sama sesja z hw cofniętym do chwili tuż przed świecą wyniku: pending, nie tp
    const near = await make({ baseDir, range, docs: { 'bt-test0001': es(T0 + 600) } });
    assert.deepEqual(await one(near.svc, bt()), pendingBody);
    // hw w środku świecy wyniku: minuta trwa, więc pending (a nie tp), z pamięcią i bez niej
    const mid = await make({ baseDir, range, docs: { 'bt-test0001': es(T0 + 630) } });
    assert.deepEqual(await one(mid.svc, bt()), pendingBody);
    const fresh = await make({ range, docs: { 'bt-test0001': es(T0 + 630) } });
    assert.deepEqual(await one(fresh.svc, bt()), pendingBody);
  });

  test('po-be-02: walidacja: 501 pozycji, zły klucz, zły typ i złe pola dają 400; 500 pozycji przechodzi', async () => {
    const { svc } = await make({ docs: {} });
    await rejects400(() => svc.resolve(Array.from({ length: 501 }, (_, i) => bt({ key: `bt-test0001/T${i}` }))));
    await rejects400(() => svc.resolve('nie tablica'));
    await rejects400(() => svc.resolve([bt({ key: 'bt-../T1' })]));
    await rejects400(() => svc.resolve([bt({ key: 'bt-test0001' })]));
    await rejects400(() => svc.resolve([bt({ key: 'bt-test0001/../x' })]));
    await rejects400(() => svc.resolve([{ key: 'live-1', typ: 'Inny' }]));
    await rejects400(() => svc.resolve([null]));
    await rejects400(() => svc.resolve([{ key: 'x'.repeat(200), typ: 'Live', instrument: 'NQ', dir: 'Long', entryPrice: 1, sl: 1, exitAt: 1 }]));
    const live = { key: 'live-1', typ: 'Live', instrument: 'NQ', contract: 'NQZ6', dir: 'Long', entryPrice: 100, sl: 99, tp: 102, exitAt: T0 * 1000 };
    await rejects400(() => svc.resolve([{ ...live, instrument: 'XX' }]));
    await rejects400(() => svc.resolve([{ ...live, dir: 'Bok' }]));
    await rejects400(() => svc.resolve([{ ...live, entryPrice: 'sto' }]));
    await rejects400(() => svc.resolve([{ ...live, contract: 'NQZ6; DROP' }]));
    const ok = await svc.resolve(Array.from({ length: 500 }, (_, i) => bt({ key: `bt-test0001/T${i}` })));
    assert.equal(Object.keys(ok.results).length, 500);
    // pusta lista to pusty wynik
    assert.deepEqual(toPlain(await svc.resolve([])), { results: {} });
  });

  test('po-be-02: Live bez poziomów albo z TP po złej stronie daje no-levels bez odczytu świec', async () => {
    const { svc } = await make({ docs: null, candles: { read() { throw new Error('nie czytaj'); } } });
    const live = { key: 'live-4', typ: 'Live', instrument: 'NQ', contract: '', dir: 'Long', entryPrice: 100, sl: 99, tp: 102, exitAt: T0 * 1000 };
    const nl = { status: 'no-levels', at: null, rIfHeld: null, mfeR: null, hitSl: null };
    assert.deepEqual(await one(svc, { ...live, sl: null }), nl);
    assert.deepEqual(await one(svc, { ...live, key: 'live-5', tp: 99 }), nl);
    assert.deepEqual(await one(svc, { ...live, key: 'live-6', sl: 101 }), nl);
  });

  test('po-be-02: replayRange.readAfterBe: te same świece co read, covered do `to`, nic za `to`', async () => {
    const { syntheticDay, dayRange } = await imp('testy/bt-dane-syntetyczne.mjs');
    const { createCandles } = await imp('lib/candles.mjs');
    const { createReplayRange } = await imp('lib/backtest-range.mjs');
    const baseDir = H.tmp();
    await syntheticDay(baseDir, { instrument: 'NQ', day: '2024-03-12', seed: 3 });
    const candles = createCandles({ getKey: () => null, getConfig: () => ({}), baseDir });
    const rr = createReplayRange({ candles, news: null, earnings: null, baseDir });
    const d = await dayRange('2024-03-12');
    const a = d.open, b = d.open + 3600;
    const x = rr.readAfterBe('NQ', a, b);
    assert.deepEqual(Object.keys(x).sort(), ['covered', 'coveredTo', 'm1', 'real1s', 's1']);
    assert.equal(x.covered, true);
    assert.ok(x.m1.length > 50, `m1: ${x.m1.length}`);
    assert.ok(x.m1.every((c) => c[0] >= a && c[0] < b), 'm1 w [from, to)');
    assert.ok(x.s1.every((c) => c[0] >= a && c[0] < b), 's1 w [from, to)');
    assert.ok(x.s1.length > 0, 'NQ: prawdziwe 1s z okna 9:30');
    const ref = rr.read({ instruments: ['NQ'], from: a, to: b, tf: 'base' }).inst.NQ;
    assert.deepEqual(x.m1, ref.m1); assert.deepEqual(x.s1, ref.s1);
    // za końcem danych (16:00 NY) pokrycia nie ma
    assert.equal(rr.readAfterBe('NQ', d.end - 600, d.end + 7200).covered, false);
    assert.equal(rr.readAfterBe('NQ', d.end - 600, d.end).covered, true);
    // minuta trwająca w chwili `to` nie liczy się do pokrycia: to w środku minuty tuż za końcem danych nadal jest pokryte, a pełna minuta za końcem nie
    assert.equal(rr.readAfterBe('NQ', d.end - 600, d.end + 30).covered, true);
    assert.equal(rr.readAfterBe('NQ', d.end - 600, d.end + 90).covered, false);
    // granica ostrzej: to w środku danych, świece za to nie wychodzą
    const y = rr.readAfterBe('NQ', a, a + 600);
    assert.ok(y.m1.every((c) => c[0] < a + 600));
    // pusty zakres nie czyta i jest pokryty
    assert.deepEqual(rr.readAfterBe('NQ', a, a), { m1: [], s1: [], real1s: [], covered: true, coveredTo: a });
    assert.throws(() => rr.readAfterBe('XX', a, b), (e) => e.status === 400);
  });

  test('po-be-02: trasa POST /api/after-be: chroniona jak zapis, 400 dla 501 pozycji, no-session i no-data, odpowiedź tylko z Result', async () => {
    const dir = H.tmp();
    const sessions = path.join(dir, 'chart-data', 'backtest', 'sessions');
    mkdirSync(sessions, { recursive: true });
    writeFileSync(path.join(sessions, 'bt-trasa0001.json'), JSON.stringify({ ...session(T0 + 600), rev: 1 }));
    const S = await H.server(4891, { THQ_CONFIG_DIR: dir, THQ_NO_NEWS: '1' });
    try {
      const url = S.base + '/api/after-be';
      const body = JSON.stringify({ items: [{ key: 'bt-trasa0001/T1', typ: 'Backtest' }] });
      const post = (headers, b = body) => fetch(url, { method: 'POST', headers, body: b });
      assert.equal((await post({ Origin: S.base, 'Content-Type': 'application/json' })).status, 403, 'bez X-THQ');
      assert.equal((await post({ Origin: 'http://evil.example', 'X-THQ': '1', 'Content-Type': 'application/json' })).status, 403, 'obcy Origin');
      assert.equal((await post({ Origin: S.base, 'X-THQ': '1', 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' })).status, 403, 'cross-site');
      assert.equal((await fetch(url)).status === 405 || (await fetch(url)).status === 404, true, 'GET nie istnieje');
      const ok = await H.dash(S.base, '/api/after-be', { items: [{ key: 'bt-trasa0001/T1', typ: 'Backtest' }, { key: 'bt-nieistnieje/T1', typ: 'Backtest' }, { key: 'bt-trasa0001/T2', typ: 'Backtest', noSession: true, limit: 1 }] });
      assert.equal(ok.status, 200, JSON.stringify(ok.j));
      assert.deepEqual(Object.keys(ok.j), ['results']);
      const r = ok.j.results;
      assert.deepEqual(r['bt-nieistnieje/T1'], { status: 'no-session', at: null, rIfHeld: null, mfeR: null, hitSl: null });
      // sesja jest, danych świec brak: no-data (a nie błąd 500)
      assert.equal(r['bt-trasa0001/T1'].status, 'no-data', JSON.stringify(r));
      for (const v of Object.values(r)) assert.deepEqual(Object.keys(v).sort(), KEYS);
      const big = await H.dash(S.base, '/api/after-be', { items: Array.from({ length: 501 }, (_, i) => ({ key: `bt-trasa0001/T${i}`, typ: 'Backtest' })) });
      assert.equal(big.status, 400, JSON.stringify(big.j));
      const bad = await H.dash(S.base, '/api/after-be', { items: [{ key: 'zly', typ: 'Backtest' }] });
      assert.equal(bad.status, 400);
      // pełne 500 pozycji Live mieści się w limicie ciała
      const live = Array.from({ length: 500 }, (_, i) => ({ key: `live-${String(i).padStart(4, '0')}-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`, typ: 'Live', instrument: 'NQ', contract: 'NQZ6', dir: 'Long', entryPrice: 20000.25, sl: 19990.25, tp: 20030.25, exitAt: null }));
      const full = await H.dash(S.base, '/api/after-be', { items: live });
      assert.equal(full.status, 200, JSON.stringify(full.j).slice(0, 200));
      assert.equal(Object.keys(full.j.results).length, 500);
    } finally { S.stop(); }
  });

  // ---- runda poprawek 1 ----
  const es = (hw, o = {}) => session(hw, { trade: { instrument: 'ES' }, hwi: { ES: hw }, ...o });

  test('po-be-02: C1: hw w środku minuty: TP i SL w tej minucie dają identyczne ciało (pending), po końcu minuty wynik się pojawia, covered nie zależy od przyszłości', async () => {
    const hw = T0 + 630;
    const A = await make({ range: fakeRange({ bars: minutes(tpAt(10)) }), docs: { 'bt-test0001': es(hw) } });
    const B = await make({ range: fakeRange({ bars: minutes(slAt(10)) }), docs: { 'bt-test0001': es(hw) } });
    const ra = await A.svc.resolve([bt()]), rb = await B.svc.resolve([bt()]);
    assert.equal(JSON.stringify(ra), JSON.stringify(rb));
    assert.deepEqual(toPlain(ra), { results: { 'bt-test0001/T1': pendingBody } });
    // dane kończą się na początku minuty z granicą (minuta trwa), reszta pełna: ten sam wynik, nie no-data
    const C = await make({ range: fakeRange({ bars: minutes(tpAt(10)), until: T0 + 600 }), docs: { 'bt-test0001': es(hw) } });
    assert.equal(JSON.stringify(await C.svc.resolve([bt()])), JSON.stringify(ra));
    // hw na końcu tej minuty: minuta jest faktem
    const A2 = await make({ range: fakeRange({ bars: minutes(tpAt(10)) }), docs: { 'bt-test0001': es(T0 + 660) } });
    const B2 = await make({ range: fakeRange({ bars: minutes(slAt(10)) }), docs: { 'bt-test0001': es(T0 + 660) } });
    assert.equal((await one(A2.svc, bt())).status, 'tp');
    assert.equal((await one(B2.svc, bt())).status, 'sl');
    // minuta wyjścia też: SL w minucie wyjścia przy hw w jej środku nie jest jeszcze znany
    const X = await make({ range: fakeRange({ bars: minutes({ 0: [100.5, 98] }) }), docs: { 'bt-test0001': es(T0 + 30) } });
    const Y = await make({ range: fakeRange({ bars: minutes() }), docs: { 'bt-test0001': es(T0 + 30) } });
    assert.equal(JSON.stringify(await X.svc.resolve([bt()])), JSON.stringify(await Y.svc.resolve([bt()])));
  });

  test('po-be-02: C1 w czystej funkcji: świeca niezakończona do limitu (minuta i sekunda) nie wchodzi do wyniku', async () => {
    const P = await imp('public/js/po-be.js');
    const base = { dir: 'long', entry: 100, sl: 99, tp: 102, exitT: T0, exitPrecise: false, end: END, covered: true, secs: [] };
    const bars = (hi, lo) => [[T0, 100, 100.5, 99.5, 100, 1], [T0 + 60, 100, hi, lo, 100, 1]];
    for (const [hi, lo] of [[103, 100], [100.5, 98]]) {
      assert.deepEqual(P.resolveAfterBe({ ...base, bars: bars(hi, lo), limit: T0 + 90 }), { status: 'pending', at: null, rIfHeld: null, mfeR: null, hitSl: null });
      assert.notEqual(P.resolveAfterBe({ ...base, bars: bars(hi, lo), limit: T0 + 120 }).status, 'pending');
    }
    // sekundy: sekunda t liczy się od limitu t + 1
    const sb = { ...base, exitPrecise: true, bars: [], secs: [[T0, 100, 100.5, 99.5, 100, 1], [T0 + 1, 100, 100.5, 98, 100, 1]] };
    assert.equal(P.resolveAfterBe({ ...sb, limit: T0 + 1 }).status, 'pending');
    assert.equal(P.resolveAfterBe({ ...sb, limit: T0 + 2 }).status, 'sl');
  });

  test('po-be-02: I1: wynik zależny od braku 1s (NQ: oba poziomy w jednej minucie bez sekund, wyjście bez sekund) nie trafia do pamięci; ES i rozstrzygnięcie sekundami tak', async () => {
    const both = { 5: [103, 98] };
    // NQ bez sekund: nie zapisujemy, drugi odczyt czyta świece
    const nq = await make({ range: fakeRange({ bars: minutes(both) }), docs: { 'bt-test0001': session(END + 7200) } });
    assert.equal((await one(nq.svc, bt())).status, 'sl');
    const n = nq.rr.calls.length;
    await one(nq.svc, bt());
    assert.equal(nq.rr.calls.length, n + 1, 'NQ bez sekund: bez pamięci podręcznej');
    // wynik tp w innej minucie, ale wyjście bez sekund: też niezapamiętany
    const nq2 = await make({ range: fakeRange({ bars: minutes(tpAt(5)) }), docs: { 'bt-test0001': session(END + 7200) } });
    await one(nq2.svc, bt()); const n2 = nq2.rr.calls.length; await one(nq2.svc, bt());
    assert.equal(nq2.rr.calls.length, n2 + 1);
    // ES: sekund nigdy nie będzie, wynik zapamiętany
    const esr = await make({ range: fakeRange({ bars: minutes(both) }), docs: { 'bt-test0001': es(END + 7200) } });
    assert.equal((await one(esr.svc, bt())).status, 'sl');
    const n3 = esr.rr.calls.length; await one(esr.svc, bt());
    assert.equal(esr.rr.calls.length, n3, 'ES: z pamięci');
    // NQ z sekundami: wyjście ma sekundy, "oba naraz" rozstrzygnięte sekundami: zapamiętane
    const secs = [[T0, 100, 100.5, 99.5, 100, 1], [T0 + 300, 100, 103, 100, 100, 1], [T0 + 301, 100, 100, 98, 100, 1]];
    const nqs = await make({ range: fakeRange({ bars: minutes(both), secs }), docs: { 'bt-test0001': session(END + 7200) } });
    const rs = await one(nqs.svc, bt());
    assert.equal(rs.status, 'tp', 'sekundy rozstrzygają: TP pierwszy');
    const n4 = nqs.rr.calls.length; await one(nqs.svc, bt());
    assert.equal(nqs.rr.calls.length, n4, 'rozstrzygnięte sekundami: z pamięci');
  });

  test('po-be-02: M2: wynik z ostatniej minuty okna wraca z pamięci przy hw = koniec okna, a przy hw minutę wcześniej liczy się od nowa', async () => {
    const last = (END - T0) / 60 - 1;
    const range = fakeRange({ bars: minutes(tpAt(last)) });
    const a = await make({ range, docs: { 'bt-test0001': es(END + 600) } });
    const r = await one(a.svc, bt());
    assert.equal(r.status, 'tp'); assert.equal(r.at, END - 60);
    const n = range.calls.length;
    const b = await make({ baseDir: a.baseDir, range, docs: { 'bt-test0001': es(END) } });
    assert.deepEqual(await one(b.svc, bt()), r);
    assert.equal(range.calls.length, n, 'z pamięci przy hw = end');
    const c = await make({ baseDir: a.baseDir, range, docs: { 'bt-test0001': es(END - 30) } });
    assert.deepEqual(await one(c.svc, bt()), pendingBody, 'hw przed końcem minuty wyniku: pending');
  });

  test('po-be-02: M1: błąd odczytu świec jest logowany i nie woła wantWindows; brak danych woła', async () => {
    const want = [], logs = [];
    const { createAfterBe } = await imp('lib/po-be.mjs');
    const boom = { read() { throw new Error('zły kontrakt'); } };
    const svc = createAfterBe({ btStore: fakeStore(null), replayRange: fakeRange({ boom: true }), candles: boom, baseDir: H.tmp(), now: () => NOW_AFTER_END, wantWindows: (x) => want.push(x), log: (...a) => logs.push(a.join(' ')) });
    const item = { key: 'live-9', typ: 'Live', instrument: 'NQ', contract: 'NQZ6', dir: 'Long', entryPrice: 100, sl: 99, tp: 102, exitAt: T0 * 1000 };
    assert.equal((await svc.resolve([item])).results['live-9'].status, 'no-data');
    assert.equal(want.length, 0);
    assert.ok(logs.some((l) => l.includes('zły kontrakt')), 'błąd zalogowany');
    // brak świec bez błędu: wantWindows woła
    const svc2 = createAfterBe({ btStore: fakeStore(null), replayRange: fakeRange({ boom: true }), candles: { read: () => ({ noSource: true }) }, baseDir: H.tmp(), now: () => NOW_AFTER_END, wantWindows: (x) => want.push(x) });
    assert.equal((await svc2.resolve([item])).results['live-9'].status, 'no-data');
    assert.equal(want.length, 1);
  });

  test('po-be-02: M3: duplikat klucza na liście daje 400', async () => {
    const { svc } = await make({ docs: {} });
    await rejects400(() => svc.resolve([bt(), bt()]));
    await rejects400(() => svc.resolve([bt(), bt({ noSession: true })]));
  });

  test('po-be-02: M4: Live przekazuje czas wejścia jak podgląd (tfrom = wejście, tto = wyjście), kontrakt rolla wg wejścia; wejście wchodzi do klucza pamięci', async () => {
    const ROLL = T0 - 3600;
    const calls = [];
    // atrapa: seria zależy od tego, czy tfrom jest przed rollem (stary kontrakt: TP w minucie 5) czy po (nowy: SL)
    const candles = { read(q) { calls.push(q); const old = Number(q.tfrom) < ROLL; return { bars: minutes(old ? tpAt(5) : slAt(5)).filter((b) => b[0] >= Number(q.from)), covered: [[Number(q.from), Number(q.to)]] }; } };
    const { svc } = await make({ docs: null, candles });
    const item = { key: 'live-r', typ: 'Live', instrument: 'NQ', contract: '', dir: 'Long', entryPrice: 100, sl: 99, tp: 102, exitAt: T0 * 1000, at: (ROLL - 1800) * 1000 };
    const r = await one(svc, item);
    assert.equal(r.status, 'tp', 'wejście przed rollem: seria starego kontraktu');
    assert.equal(String(calls[0].tfrom), String(ROLL - 1800)); assert.equal(String(calls[0].tto), String(T0));
    // bez at: tfrom = wyjście (po rollu): seria nowego kontraktu
    const r2 = await one(svc, { ...item, key: 'live-r2', at: null });
    assert.equal(r2.status, 'sl');
    assert.equal(String(calls[1].tfrom), String(T0));
    // wyjście wcześniej niż wejście: oba = wejście (jak tradeQuery)
    await one(svc, { ...item, key: 'live-r3', at: (T0 + 5000) * 1000 });
    assert.equal(String(calls[2].tfrom), String(T0 + 5000)); assert.equal(String(calls[2].tto), String(T0 + 5000));
    await rejects400(() => svc.resolve([{ ...item, key: 'live-r4', at: 'x' }]));
    // inne wejście = inny klucz pamięci: ten sam trade z innym `at` nie dostaje cudzego wyniku
    const n = calls.length;
    await one(svc, { ...item, key: 'live-r' });
    assert.equal(calls.length, n, 'to samo wejście: z pamięci');
    await one(svc, { ...item, key: 'live-r', at: (ROLL + 1800) * 1000 });
    assert.equal(calls.length, n + 1, 'inne wejście: nowy odczyt');
  });

  test('po-be-02: okno prawie doby (wyjście tuż po 18:00 ET) mieści się w limicie zakresu candles.read', async () => {
    const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
    const { createCandles } = await imp('lib/candles.mjs');
    const baseDir = H.tmp();
    await syntheticDay(baseDir, { instrument: 'NQ', day: '2024-03-12', seed: 3 });
    const candles = createCandles({ getKey: () => null, getConfig: () => ({}), baseDir });
    const { tradingDayEnd } = await imp('public/js/dzien-handlowy.js');
    // wtorek 12.03.2024 18:05 ET (EDT, 22:05Z): koniec okna 13.03 17:00 ET, 22 h 55 min
    const exit = Date.UTC(2024, 2, 12, 22, 5) / 1000, end = tradingDayEnd(exit);
    assert.ok(end - exit > 22 * 3600);
    const m0 = Math.floor(exit / 60) * 60;
    const r = candles.read({ instrument: 'NQ', from: String(m0), to: String(end), tf: '1m', tfrom: String(exit), tto: String(exit), contract: 'NQH4' });
    assert.ok(Array.isArray(r.bars) && !r.noSource, 'odczyt całego okna przechodzi bez błędu zakresu');
  });
};
