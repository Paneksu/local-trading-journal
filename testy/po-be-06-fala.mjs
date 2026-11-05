// po-be-06: fala końcowa poprawek (przegląd gałęzi feat/po-be): świece z innego kontraktu, dziury w świecach, 1s dla Live, pending dla Live, bufor klienta, wynik ręczny,
// powody braku danych, klucze pamięci, limity serwera i granica sesji w podglądzie trade'a typu Backtest.
// [U] 05.11.2026 «Ogranicz do granicy sesji (Recommended)»: podgląd trade'a Backtest w dashboardzie nie dostaje świec za granicą sesji.
// Bez sieci i bez Notion: prawdziwy createCandles i createReplayRange na magazynie w katalogu tymczasowym, atrapy tylko tam, gdzie trzeba wymusić zachowanie.
import { pathToFileURL } from 'node:url';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const at = (s) => Date.parse(s) / 1000;
  const q4 = (y, m) => y * 4 + (m / 3 - 1);
  let port = 5760;

  // ---- wspólne: magazyn na dysku ----
  const flat = (from, to, px = 5100, over = {}) => {
    const out = [];
    for (let t = from; t < to; t += 60) { const [h, l] = over[t] || [px + 1, px - 1]; out.push([t, px * 100, Math.round(h * 100), Math.round(l * 100), px * 100, 10]); }
    return out;
  };
  async function store({ dir = H.tmp(), v0 = [] } = {}) {
    const S = await imp('lib/candles-store.mjs');
    S.writeAux('contracts-es', { resolvedTo: '2099-01-01', v0, names: {} }, { baseDir: dir });
    S.writeAux('contracts-nq', { resolvedTo: '2099-01-01', v0: [], names: {} }, { baseDir: dir });
    return { S, dir };
  }
  async function liveSvc(dir, nowSec, extra = {}) {
    const { createCandles } = await imp('lib/candles.mjs');
    const { createAfterBe } = await imp('lib/po-be.mjs');
    const candles = createCandles({ getKey: () => '', getConfig: () => ({}), baseDir: dir, now: () => nowSec * 1000 });
    const want = [];
    const svc = createAfterBe({ btStore: { read() { throw new Error('atrapa'); } }, replayRange: {}, candles, baseDir: dir, now: () => nowSec * 1000, log: () => {}, wantWindows: (w) => want.push(...w), ...extra });
    return { svc, want, candles };
  }
  async function btSvc(dir, doc) {
    const { createCandles } = await imp('lib/candles.mjs');
    const { createReplayRange } = await imp('lib/backtest-range.mjs');
    const { createAfterBe } = await imp('lib/po-be.mjs');
    const candles = createCandles({ getKey: () => '', getConfig: () => ({}), baseDir: dir, now: () => 4000000000000 });
    const replayRange = createReplayRange({ candles, baseDir: dir });
    const svc = createAfterBe({ btStore: { read: () => doc }, replayRange, candles, baseDir: dir, log: () => {} });
    return { svc, replayRange, candles };
  }
  const one = async (svc, item) => (await svc.resolve([item])).results[item.key];

  // ES 19.03.2024: reguła rolla wskazuje już M4, a .v.0 to jeszcze H4 (ceny o 50 pkt niżej)
  const EXIT = at('2024-03-19T15:00:00Z'), END = at('2024-03-19T21:00:00Z');
  const V0 = [[at('2023-12-13T00:00:00Z'), q4(2024, 3)], [at('2024-03-25T00:00:00Z'), q4(2024, 6)]];
  const liveM4 = (over = {}) => ({ key: 'p1', typ: 'Live', instrument: 'ES', contract: '', dir: 'long', entryPrice: 5100, sl: 5090, tp: 5120, at: (EXIT - 1800) * 1000, exitAt: EXIT * 1000, ...over });

  // ---------- 1. świece z innego kontraktu ----------
  test('po-be-06 pkt 1: trade na M4 bez warstwy M4: cena H4 z zapasu nie daje wyniku, tylko no-data i dobieranie', async () => {
    const { S, dir } = await store({ v0: V0 });
    S.writeRange('ES', '1m', EXIT - 7200, END, flat(EXIT - 7200, END, 5050), {}, { baseDir: dir });
    const { svc, want } = await liveSvc(dir, END + 86400);
    const auto = await one(svc, liveM4());
    assert.equal(auto.status, 'no-data', 'cena H4 (5050) leży pod SL 5090, ale to nie ten kontrakt');
    assert.equal(want.length, 1, 'okno idzie do dobrania');
    assert.equal(want[0].from, EXIT); assert.equal(want[0].to, END);
    const pinned = await one(svc, liveM4({ key: 'p2', contract: 'ESM4' }));
    assert.equal(pinned.status, 'no-data');
    // po dobraniu warstwy M4 wynik liczy się z niej (cena płaska: open), a nie z pamięci i nie z H4
    S.writeRange('ES', '1m-ESM2024', EXIT - 7200, END, flat(EXIT - 7200, END, 5100), {}, { baseDir: dir });
    const { svc: svc2 } = await liveSvc(dir, END + 86400);
    assert.equal((await one(svc2, liveM4())).status, 'open');
  });

  test('po-be-06 pkt 1: zapas .v.0 za granicą dostępności (cut) też nie liczy się jako pokrycie', async () => {
    const { S, dir } = await store({ v0: V0 });
    const now = END + 3 * 3600, cut = now - 8 * 3600;
    assert.ok(cut > EXIT && cut < END, 'granica dostępności wypada w oknie');
    // warstwa M4 tylko do cut, .v.0 (H4) do końca z ceną pod SL za cut: odczyt podkłada H4, a `missing` kończy się na cut
    const c0 = Math.floor(cut / 60) * 60;
    S.writeRange('ES', '1m-ESM2024', EXIT - 7200, c0, flat(EXIT - 7200, c0, 5100), {}, { baseDir: dir });
    S.writeRange('ES', '1m', EXIT - 7200, END, flat(EXIT - 7200, END, 5050), {}, { baseDir: dir });
    const { svc } = await liveSvc(dir, now);
    assert.equal((await one(svc, liveM4())).status, 'no-data');
  });

  test('po-be-06 pkt 1: trade na kontrakcie zgodnym z .v.0 liczy się dalej zwykłą warstwą', async () => {
    const { S, dir } = await store({ v0: [] });
    S.writeRange('ES', '1m', EXIT - 7200, END, flat(EXIT - 7200, END, 5100, { [EXIT + 600]: [5121, 5100] }), {}, { baseDir: dir });
    const { svc, want } = await liveSvc(dir, END + 86400);
    assert.equal((await one(svc, liveM4())).status, 'tp');
    assert.equal(want.length, 0);
  });

  // ---------- 2. dziura w świecach ----------
  test('po-be-06 pkt 2: czysta logika: dotknięcie za końcem pokrycia nie jest wynikiem', async () => {
    const { resolveAfterBe, tradingDayEnd } = await imp('public/js/po-be.js');
    const exitT = Date.UTC(2026, 2, 10, 14) / 1000, end = tradingDayEnd(exitT);
    const bar = (t, o, h, l, c) => [t, o, h, l, c, 1];
    const base = { dir: 'Long', entry: 100, sl: 90, tp: 120, exitT, end, limit: end + 100, secs: [] };
    const barsTp = [bar(exitT, 100, 101, 99, 100), bar(exitT + 7200, 110, 121, 109, 120)];
    const barsSl = [bar(exitT, 100, 101, 99, 100), bar(exitT + 7200, 95, 96, 89, 90)];
    // bez podanego końca pokrycia nic nie jest pewne
    assert.equal(resolveAfterBe({ ...base, bars: barsTp, covered: false }).status, 'no-data');
    assert.equal(resolveAfterBe({ ...base, bars: barsSl, covered: false }).status, 'no-data');
    // pokrycie kończy się po minucie wyjścia: świeca za dziurą się nie liczy, także w sekundach
    assert.equal(resolveAfterBe({ ...base, bars: barsTp, covered: false, coveredTo: exitT + 60 }).status, 'no-data');
    // dotknięcie przed końcem pokrycia jest faktem
    const before = [bar(exitT, 100, 101, 99, 100), bar(exitT + 60, 110, 121, 109, 120), bar(exitT + 7200, 95, 96, 89, 90)];
    assert.equal(resolveAfterBe({ ...base, bars: before, covered: false, coveredTo: exitT + 120 }).status, 'tp');
    // ostatnia minuta niepełna względem końca pokrycia nie wchodzi
    assert.equal(resolveAfterBe({ ...base, bars: before, covered: false, coveredTo: exitT + 119 }).status, 'no-data');
    // pełne pokrycie jak dotąd
    assert.equal(resolveAfterBe({ ...base, bars: barsTp, covered: true }).status, 'tp');
  });

  test('po-be-06 pkt 2: Live na prawdziwym magazynie: dziura przed dotknięciem daje no-data i dobieranie, bez pamięci', async () => {
    const { S, dir } = await store();
    const gapA = EXIT + 3600, gapB = EXIT + 7200;
    const touch = { [gapB + 60]: [5121, 5100] };
    S.writeRange('ES', '1m', EXIT - 600, gapA, flat(EXIT - 600, gapA), {}, { baseDir: dir });
    S.writeRange('ES', '1m', gapB, END, flat(gapB, END, 5100, touch), {}, { baseDir: dir });
    const { svc, want } = await liveSvc(dir, END + 86400);
    assert.equal((await one(svc, liveM4())).status, 'no-data');
    assert.equal(want.length, 1, 'dziura idzie do dobrania');
    assert.ok(!existsSync(path.join(dir, 'after-be-cache.json')), 'bez wpisu w pamięci');
    // dotknięcie przed dziurą jest wynikiem końcowym i nie wymaga dobierania
    const { S: S2, dir: dir2 } = await store();
    S2.writeRange('ES', '1m', EXIT - 600, gapA, flat(EXIT - 600, gapA, 5100, { [EXIT + 600]: [5121, 5100] }), {}, { baseDir: dir2 });
    S2.writeRange('ES', '1m', gapB, END, flat(gapB, END), {}, { baseDir: dir2 });
    const L2 = await liveSvc(dir2, END + 86400);
    assert.equal((await one(L2.svc, liveM4())).status, 'tp');
    assert.equal(L2.want.length, 0);
  });

  const NQT = (exitT, over = {}) => ({ v: 2, book: { hw: over.hw ?? 4000000000, hwi: { NQ: over.hw ?? 4000000000 } }, trades: [{ id: 't1', instrument: 'NQ', dir: 'long', entryPrice: 5100, sl0: 5090, tp: 5120, exitT }] });
  const BT = { key: 'bt-test0001/t1', typ: 'Backtest' };

  test('po-be-06 pkt 2: Backtest na prawdziwym readAfterBe: dziura przed dotknięciem daje no-data, koniec pokrycia liczony od minuty wyjścia', async () => {
    const { S, dir } = await store();
    const gapA = EXIT + 3600, gapB = EXIT + 7200;
    S.writeRange('NQ', '1m', EXIT - 600, gapA, flat(EXIT - 600, gapA), {}, { baseDir: dir });
    S.writeRange('NQ', '1m', gapB, END, flat(gapB, END, 5100, { [gapB + 60]: [5121, 5100] }), {}, { baseDir: dir });
    const B = await btSvc(dir, NQT(EXIT));
    const raw = B.replayRange.readAfterBe('NQ', EXIT, END);
    assert.equal(raw.coveredTo, gapA, 'koniec ciągłego pokrycia');
    assert.equal(raw.covered, false);
    assert.equal((await one(B.svc, BT)).status, 'no-data');
  });

  test('po-be-06 pkt 2: koniec pokrycia nie zależy od danych za granicą sesji: z dziurą i bez dziury za limitem ta sama odpowiedź', async () => {
    const limit = EXIT + 1800, gapA = EXIT + 3600, gapB = EXIT + 7200;
    const A = await store(), Bb = await store();
    A.S.writeRange('NQ', '1m', EXIT - 600, END, flat(EXIT - 600, END, 5100, { [limit + 60]: [5121, 5100] }), {}, { baseDir: A.dir });
    Bb.S.writeRange('NQ', '1m', EXIT - 600, gapA, flat(EXIT - 600, gapA), {}, { baseDir: Bb.dir });
    Bb.S.writeRange('NQ', '1m', gapB, END, flat(gapB, END, 5100, { [gapB + 60]: [5100, 5000] }), {}, { baseDir: Bb.dir });
    const sa = await btSvc(A.dir, NQT(EXIT, { hw: limit })), sb = await btSvc(Bb.dir, NQT(EXIT, { hw: limit }));
    const ra = await sa.svc.resolve([BT]), rb = await sb.svc.resolve([BT]);
    assert.equal(JSON.stringify(ra), JSON.stringify(rb), 'bajt w bajt');
    assert.equal(ra.results[BT.key].status, 'pending');
    assert.equal(sa.replayRange.readAfterBe('NQ', EXIT, limit).coveredTo, limit, 'do granicy, nie dalej');
    assert.equal(sb.replayRange.readAfterBe('NQ', EXIT, limit).coveredTo, limit);
  });

  test('po-be-06 pkt 2: przerwa 17-18 ET, weekend i skrócona sesja przy pełnym pokryciu nie są dziurą', async () => {
    const cases = [
      // wyjście w przerwie (wtorek 17:10 ET), świece od 18:00 ET, TP w środę
      { name: 'przerwa', exit: at('2024-03-12T21:10:00Z'), end: at('2024-03-13T21:00:00Z'), first: at('2024-03-12T22:00:00Z'), last: at('2024-03-13T21:00:00Z'), touch: at('2024-03-13T14:00:00Z'), want: 'tp' },
      // wyjście w piątek 17:30 ET, świece od niedzieli 18:00 ET, TP w poniedziałek
      { name: 'weekend', exit: at('2024-03-08T22:30:00Z'), end: at('2024-03-11T21:00:00Z'), first: at('2024-03-10T22:00:00Z'), last: at('2024-03-11T21:00:00Z'), touch: at('2024-03-11T14:00:00Z'), want: 'tp' },
      // sesja skrócona: świece kończą się 13:00 ET, koniec okna 17:00 ET, bez dotknięcia
      { name: 'skrócona', exit: at('2024-07-03T15:00:00Z'), end: at('2024-07-03T21:00:00Z'), first: at('2024-07-03T15:00:00Z'), last: at('2024-07-03T17:00:00Z'), touch: null, want: 'open' },
    ];
    for (const c of cases) {
      for (const kind of ['bt', 'live']) {
        const { S, dir } = await store();
        const over = c.touch ? { [c.touch]: [5121, 5100] } : {};
        // pokrycie ciągłe od przed wyjściem do końca okna, świece tylko w czasie handlu
        S.writeRange('NQ', '1m', c.exit - 600, c.end, flat(c.first, c.last, 5100, over), {}, { baseDir: dir });
        if (kind === 'bt') {
          const B = await btSvc(dir, NQT(c.exit));
          assert.equal((await one(B.svc, BT)).status, c.want, `${c.name} Backtest`);
        } else {
          const L = await liveSvc(dir, c.end + 86400);
          const r = await one(L.svc, { key: 'x1', typ: 'Live', instrument: 'NQ', contract: '', dir: 'long', entryPrice: 5100, sl: 5090, tp: 5120, at: (c.exit - 600) * 1000, exitAt: c.exit * 1000 });
          assert.equal(r.status, c.want, `${c.name} Live`);
          assert.equal(L.want.length, 0, `${c.name} Live bez dobierania`);
        }
      }
    }
  });

  // ---------- 3. 1s dla Live z dysku ----------
  const tieMinute = EXIT + 600;
  const secs = (from, map) => { const o = []; for (let t = from; t < from + 60; t++) { const [h, l] = map[t - from] || [5101, 5099]; o.push([t, 510000, Math.round(h * 100), Math.round(l * 100), 510000, 1]); } return o; };
  test('po-be-06 pkt 3: Live: oba poziomy w minucie rozstrzygają prawdziwe 1s kontraktu z dysku', async () => {
    const { S, dir } = await store();
    const bars = flat(EXIT - 600, END, 5100, { [tieMinute]: [5121, 5089] });
    S.writeRange('NQ', '1m', EXIT - 600, END, bars, {}, { baseDir: dir });
    const item = { key: 'x1', typ: 'Live', instrument: 'NQ', contract: '', dir: 'long', entryPrice: 5100, sl: 5090, tp: 5120, at: (EXIT - 600) * 1000, exitAt: EXIT * 1000 };
    // bez sekund: SL i bez wpisu w pamięci, bo po dojściu sekund wynik może być inny
    const L0 = await liveSvc(dir, END + 86400);
    assert.equal((await one(L0.svc, item)).status, 'sl');
    assert.ok(!existsSync(path.join(dir, 'after-be-cache.json')), 'oba naraz bez sekund nie idzie do pamięci');
    // sekundy: TP w 5. sekundzie, SL w 30.
    S.writeRange('NQ', '1s', tieMinute, tieMinute + 60, secs(tieMinute, { 5: [5121, 5100], 30: [5100, 5089] }), {}, { baseDir: dir });
    const L1 = await liveSvc(dir, END + 86400);
    assert.equal((await one(L1.svc, item)).status, 'tp');
    assert.ok(existsSync(path.join(dir, 'after-be-cache.json')), 'rozstrzygnięte sekundami trafia do pamięci');
  });

  test('po-be-06 pkt 3: Live: sekundy z zapasu innego kontraktu i niepełna minuta nie rozstrzygają; wyjście zostaje co do minuty', async () => {
    const { S, dir } = await store({ v0: V0 });
    S.writeRange('ES', '1m-ESM2024', EXIT - 600, END, flat(EXIT - 600, END, 5100, { [tieMinute]: [5121, 5089] }), {}, { baseDir: dir });
    // sekundy tylko w .v.0 (H4): nie ten kontrakt
    S.writeRange('ES', '1s', tieMinute, tieMinute + 60, secs(tieMinute, { 5: [5121, 5100] }), {}, { baseDir: dir });
    const L = await liveSvc(dir, END + 86400);
    assert.equal((await one(L.svc, liveM4())).status, 'sl', 'sekundy H4 nie rozstrzygają trade\'a na M4');
    // niepełna minuta 1s kontraktu
    S.writeRange('ES', '1s-ESM2024', tieMinute, tieMinute + 20, secs(tieMinute, { 5: [5121, 5100] }).slice(0, 20), {}, { baseDir: dir });
    const L2 = await liveSvc(dir, END + 86400);
    assert.equal((await one(L2.svc, liveM4())).status, 'sl', 'pokrycie 1s musi objąć całą minutę');
    // pełna minuta 1s kontraktu
    S.writeRange('ES', '1s-ESM2024', tieMinute, tieMinute + 60, secs(tieMinute, { 5: [5121, 5100] }), {}, { baseDir: dir });
    const L3 = await liveSvc(dir, END + 86400);
    assert.equal((await one(L3.svc, liveM4())).status, 'tp');
    // exitPrecise false: minuta wyjścia to świeca wyjścia, sekundy TP w niej nie liczą się
    const d = await store();
    d.S.writeRange('NQ', '1m', EXIT - 600, END, flat(EXIT - 600, END, 5100, { [EXIT]: [5121, 5099] }), {}, { baseDir: d.dir });
    d.S.writeRange('NQ', '1s', EXIT, EXIT + 60, secs(EXIT, { 30: [5121, 5100] }), {}, { baseDir: d.dir });
    const L4 = await liveSvc(d.dir, END + 86400);
    assert.equal((await one(L4.svc, { key: 'x2', typ: 'Live', instrument: 'NQ', contract: '', dir: 'long', entryPrice: 5100, sl: 5090, tp: 5120, at: (EXIT - 600) * 1000, exitAt: (EXIT + 10) * 1000 })).status, 'open');
  });

  test('po-be-06 pkt 3: Live: odczyt 1s tylko dla minuty z oboma poziomami', async () => {
    const { createAfterBe } = await imp('lib/po-be.mjs');
    const raw = [];
    const bars = flat(EXIT, END, 5100).map((b) => [b[0], b[1] / 100, b[2] / 100, b[3] / 100, b[4] / 100, b[5]]);
    const candles = { read: () => ({ bars, covered: [[EXIT, END]], missing: [] }), readRaw: (q) => { raw.push(q); return { bars: [], covered: [] }; } };
    const svc = createAfterBe({ btStore: {}, replayRange: {}, candles, baseDir: H.tmp(), now: () => (END + 86400) * 1000, log: () => {} });
    assert.equal((await one(svc, { key: 'x', typ: 'Live', instrument: 'NQ', contract: '', dir: 'long', entryPrice: 5100, sl: 5090, tp: 5120, exitAt: EXIT * 1000 })).status, 'open');
    assert.equal(raw.length, 0, 'bez remisu bez odczytu sekund');
  });

  // ---------- 4. pending dla Live przed końcem okna ----------
  test('po-be-06 pkt 4: Live przed końcem okna bez świec daje pending i nic nie dobiera; po końcu okna no-data i dobieranie', async () => {
    const { createAfterBe } = await imp('lib/po-be.mjs');
    const want = [];
    let clock = (EXIT + 3600) * 1000;
    const candles = { read: () => ({ bars: [], covered: [], missing: [[EXIT, EXIT + 3600]] }) };
    const svc = createAfterBe({ btStore: {}, replayRange: {}, candles, baseDir: H.tmp(), now: () => clock, log: () => {}, wantWindows: (w) => want.push(...w) });
    const item = liveM4();
    assert.deepEqual({ ...(await one(svc, item)) }, { status: 'pending', at: null, rIfHeld: null, mfeR: null, hitSl: null });
    assert.equal(want.length, 0);
    // Paper tak samo; odczyt bez źródła też nie zmienia pending przed końcem okna
    assert.equal((await one(svc, { ...item, key: 'p3', typ: 'Paper' })).status, 'pending');
    const noSrc = createAfterBe({ btStore: {}, replayRange: {}, candles: { read: () => ({ noSource: true }) }, baseDir: H.tmp(), now: () => clock, log: () => {} });
    assert.equal((await one(noSrc, item)).status, 'pending');
    clock = (END + 3600) * 1000;
    const r = await one(svc, item);
    assert.equal(r.status, 'no-data');
    assert.equal(want.length, 1);
  });

  test('po-be-06 pkt 4: Backtest: dziura przed granicą daje no-data przed pending, bez ujawniania (kolejność bez zmian)', async () => {
    const limit = EXIT + 7200;
    const { S, dir } = await store();
    S.writeRange('NQ', '1m', EXIT - 600, EXIT + 3600, flat(EXIT - 600, EXIT + 3600), {}, { baseDir: dir });
    const B = await btSvc(dir, NQT(EXIT, { hw: limit }));
    assert.equal((await one(B.svc, BT)).status, 'no-data');
    const { S: S2, dir: d2 } = await store();
    S2.writeRange('NQ', '1m', EXIT - 600, limit, flat(EXIT - 600, limit), {}, { baseDir: d2 });
    const B2 = await btSvc(d2, NQT(EXIT, { hw: limit }));
    assert.equal((await one(B2.svc, BT)).status, 'pending');
  });

  test('po-be-06 pkt 4: podpowiedź: Live pending mówi o trwającym dniu, Backtest pending ma niezmieniony DOM; no-data po końcu okna nie mówi, że dzień trwa', async () => {
    const V = await imp('public/js/po-be-widok.js');
    const pend = { status: 'pending', at: null, rIfHeld: null, mfeR: null, hitSl: null };
    const live = V.afterBeBadge(pend, { short: true, pendingTitle: V.afterBeLivePending() });
    assert.match(live, /title="[^"]*po 17:00 ET/);
    assert.equal(V.afterBeBadge(pend, { short: true }), V.afterBeBadge(null, { short: true }), 'bez opcji (Backtest): ten sam DOM co brak wyniku');
    assert.equal(V.afterBeFact(pend), V.afterBeFact(null), 'Backtest: ten sam DOM co brak wyniku');
    assert.match(V.afterBeFact(pend, { pendingTitle: V.afterBeLivePending() }), /po 17:00 ET/);
    const okCredit = { configured: true, leftUsd: 10, expired: false };
    const why = V.afterBeNoDataReason({ typ: 'Live', exitAt: Date.now() - 3600000, src: { afterBe: true, key: true, credit: okCredit, afterBeReadyTo: Math.floor(Date.now() / 1000) - 10 * 86400 } });
    assert.match(why, /jeszcze nie udostępnił/);
    assert.ok(!/jeszcze trwa/.test(why), 'no-data jest już po końcu okna');
  });

  // ---------- 5. bufor klienta a edycja trade'a ----------
  const fakeFetch = (fn) => { const calls = []; const f = async (u, o) => { const b = JSON.parse(o.body); calls.push(b.items); const res = {}; for (const it of b.items) res[it.key] = fn(it); return { ok: true, status: 200, json: async () => ({ results: res }) }; }; f.calls = calls; return f; };
  const stOf = (status) => ({ status, at: 1, rIfHeld: 2, mfeR: null, hitSl: null });
  test('po-be-06 pkt 5: edycja trade\'a odpytuje ponownie, także przy wyniku ostatecznym; bez zmiany nie ma żądania', async () => {
    const { createAfterBeStore } = await imp('public/js/po-be-widok.js');
    const f = fakeFetch((it) => stOf(it.sl == null ? 'no-levels' : 'tp'));
    const st = createAfterBeStore({ fetchImpl: f });
    const row = (sl) => ({ key: 'x', item: { key: 'x', typ: 'Live', sl } });
    await st.ensure([row(null)], { refresh: true });
    assert.equal(st.get('x').status, 'no-levels'); assert.equal(f.calls.length, 1);
    assert.equal(await st.ensure([row(90)]), true, 'zmiana bez refresh też odpytuje');
    assert.equal(st.get('x').status, 'tp'); assert.equal(f.calls.length, 2);
    // ta sama treść: bez żądania, także przy refresh, bo wynik ostateczny
    await st.ensure([row(90)], { refresh: true });
    assert.equal(f.calls.length, 2);
    // edycja wyniku ostatecznego
    await st.ensure([row(95)]);
    assert.equal(f.calls.length, 3);
  });

  test('po-be-06 pkt 5: edycja w trakcie pobierania i po błędzie: nowa treść nie zostaje bez odpowiedzi ani ze starym wynikiem', async () => {
    const { createAfterBeStore } = await imp('public/js/po-be-widok.js');
    // w trakcie: pierwszy lot czeka, drugie ensure z nową treścią pyta po nim
    let open;
    const gate = new Promise((ok) => { open = ok; });
    const seen = [];
    const fetchImpl = async (u, o) => { const it = JSON.parse(o.body).items[0]; seen.push(it.sl); if (it.sl === 1) await gate; return { ok: true, status: 200, json: async () => ({ results: { x: stOf(it.sl === 1 ? 'tp' : 'sl') } }) }; };
    const st = createAfterBeStore({ fetchImpl });
    const row = (sl) => ({ key: 'x', item: { key: 'x', typ: 'Live', sl } });
    const a = st.ensure([row(1)]);
    const b = st.ensure([row(2)]);
    open();
    await Promise.all([a, b]);
    assert.deepEqual(seen, [1, 2]);
    assert.equal(st.get('x').status, 'sl', 'wynik nowej treści');
    // po błędzie: odstęp 30 s nie zatrzymuje nowej treści, a stary wynik nie zostaje przy nowej treści
    let clock = 1000, fail = false;
    const f2 = async (u, o) => { if (fail) return { ok: false, status: 500, json: async () => ({ error: 'x' }) }; const it = JSON.parse(o.body).items[0]; return { ok: true, status: 200, json: async () => ({ results: { x: stOf(it.sl === 1 ? 'tp' : 'sl') } }) }; };
    const s2 = createAfterBeStore({ fetchImpl: f2, now: () => clock });
    await s2.ensure([row(1)]);
    assert.equal(s2.get('x').status, 'tp');
    fail = true;
    await s2.ensure([row(2)]);
    assert.equal(s2.get('x'), undefined, 'stary wynik nie udaje wyniku nowej treści');
    assert.equal(s2.failed(), true);
    fail = false; clock += 1000;
    await s2.ensure([row(3)]);
    assert.equal(s2.get('x').status, 'sl', 'kolejna zmiana nie czeka 30 s');
  });

  // ---------- 6. wynik ręczny ----------
  test('po-be-06 pkt 6: kwalifikacja wg outcome: wynik ręczny wygrywa w obu kierunkach, bez pola BE nie kwalifikuje', async () => {
    const { notionBeHit } = await imp('public/js/bt-staty.js');
    assert.equal(notionBeHit({ be: 100, r: 0, manual: 'win' }), false);
    assert.equal(notionBeHit({ be: 100, r: 0.9, manual: 'be' }), true);
    assert.equal(notionBeHit({ be: 100, r: 0, manual: null }), true);
    assert.equal(notionBeHit({ be: null, r: 0, manual: 'be' }), false);
    assert.equal(notionBeHit({ be: 100, r: 0.9, manual: null }), false);
    // trade bez wyniku (bez R, P&L i wyniku ręcznego) nie jest „po BE”, choć outcome domyślnie mówi „be”
    assert.equal(notionBeHit({ be: 100, r: null, pnl: null, manual: null }), false);
    assert.equal(notionBeHit({ be: 100, r: null, pnl: null, manual: 'be' }), true);
    const { afterBeRows } = await imp('public/js/po-be-widok.js');
    const tr = (over) => ({ id: 'id1', typ: 'Live', counted: true, instrument: 'NQ', dir: 'Long', be: 100, at: 1e12, dur: 5, ...over });
    assert.equal(afterBeRows([tr({ r: 0, manual: 'win' })], { typ: 'Live' }).length, 0);
    assert.equal(afterBeRows([tr({ r: 0.9, manual: 'be' })], { typ: 'Live' }).length, 1);
    assert.equal(afterBeRows([tr({ r: 0.9, manual: 'be', typ: 'Niewzięty' })], { typ: 'Niewzięty' }).length, 1);
    assert.equal(afterBeRows([tr({ r: 0, manual: 'be', be: null })], { typ: 'Live' }).length, 0);
  });

  // ---------- 9. powody braku czasu wyjścia ----------
  test('po-be-06 pkt 9: brak czasu wyjścia ma właściwy powód: brak wyjścia, Data bez godziny, Wyjście bez godziny, wyjście przed wejściem', async () => {
    const V = await imp('public/js/po-be-widok.js');
    const S = await imp('public/js/stats.js');
    const make = (date, exit) => S.normalizeTrades([{ _id: 'id1', date, exit, typ: { name: 'Live' }, instrument: { name: 'NQ' }, dir: { name: 'Long' }, r: 0, be: 100, entryPrice: 100, sl: 90, tp: 120 }])[0];
    const why = (x) => { const row = V.afterBeRows([x], { typ: 'Live' })[0]; assert.equal(row.item.exitAt, null); return V.afterBeNoDataReason({ typ: 'Live', exitAt: null, exitWhy: row.exitWhy, src: { afterBe: true } }); };
    const none = why(make('2026-03-10T10:00:00-04:00', null));
    assert.match(none, /nie ma czasu wyjścia/);
    const dateOnly = why(make('2026-03-10', '2026-03-10T11:00:00-04:00'));
    assert.match(dateOnly, /Data trade'a nie ma godziny/);
    const exitOnly = why(make('2026-03-10T10:00:00-04:00', '2026-03-10'));
    assert.match(exitOnly, /Wyjście nie ma godziny/);
    const before = why(make('2026-03-10T10:00:00-04:00', '2026-03-10T09:00:00-04:00'));
    assert.match(before, /wcześniej niż wejście/);
    assert.equal(new Set([none, dateOnly, exitOnly, before]).size, 4);
  });

  // ---------- 11-13. klucz pamięci i walidacja ----------
  test('po-be-06 pkt 11: klucz pamięci ma instrument, kierunek i wersję 2; inny instrument nie dostaje cudzego wyniku', async () => {
    const { AFTER_BE_VERSION } = await imp('public/js/po-be.js');
    assert.equal(AFTER_BE_VERSION, 2);
    const { createAfterBe } = await imp('lib/po-be.mjs');
    let reads = 0;
    const bars = flat(EXIT, END, 5100, { [EXIT + 600]: [5121, 5100] }).map((b) => [b[0], b[1] / 100, b[2] / 100, b[3] / 100, b[4] / 100, b[5]]);
    const baseDir = H.tmp();
    const svc = createAfterBe({ btStore: {}, replayRange: {}, candles: { read: () => { reads++; return { bars, covered: [[EXIT, END]], missing: [] }; } }, baseDir, now: () => (END + 86400) * 1000, log: () => {} });
    const item = { key: 'k1', typ: 'Live', instrument: 'NQ', contract: '', dir: 'long', entryPrice: 5100, sl: 5090, tp: 5120, exitAt: EXIT * 1000 };
    await one(svc, item);
    await one(svc, item);
    assert.equal(reads, 1, 'ten sam trade z pamięci');
    await one(svc, { ...item, instrument: 'ES' });
    assert.equal(reads, 2, 'inny instrument: nowy odczyt');
    const keys = Object.keys(JSON.parse(readFileSync(path.join(baseDir, 'after-be-cache.json'), 'utf8')).entries);
    assert.ok(keys.some((k) => k.includes('NQ') && k.includes('long') && k.split('|')[1] === '2'), keys[0]);
    assert.ok(keys.some((k) => k.includes('ES')), keys[1]);
  });

  const svcPlain = async (extra = {}) => { const { createAfterBe } = await imp('lib/po-be.mjs'); return createAfterBe({ btStore: { read: () => null }, replayRange: {}, candles: { read: () => ({ bars: [], covered: [] }) }, baseDir: null, log: () => {}, now: () => (END + 86400) * 1000, ...extra }); };
  const rejects = async (fn, status, re) => { let err = null; try { await fn(); } catch (e) { err = e; } assert.ok(err, 'powinno rzucić'); assert.equal(err.status, status, String(err && err.message)); if (re) assert.match(err.message, re); return err; };
  const liveItem = (key) => ({ key, typ: 'Live', instrument: 'ES', dir: 'long', entryPrice: 5100, sl: 5090, tp: 5120, exitAt: EXIT * 1000 });

  test('po-be-06 pkt 12: klucze __proto__, constructor i prototype dają 400, wyniki bez prototypu', async () => {
    const svc = await svcPlain();
    for (const key of ['__proto__', 'constructor', 'prototype']) await rejects(() => svc.resolve([liveItem(key)]), 400);
    const r = await svc.resolve([liveItem('zwykly-1')]);
    assert.equal(Object.getPrototypeOf(r.results), null);
    assert.equal(r.results['zwykly-1'].status, 'no-data');
    assert.ok(!('toString' in r.results));
    assert.equal(JSON.parse(JSON.stringify(r)).results['zwykly-1'].status, 'no-data', 'serializuje się jak zwykły obiekt');
  });

  test('po-be-06 pkt 13: Live z kluczem trade\'a backtestu daje 400, zanim cokolwiek przeczyta', async () => {
    let reads = 0;
    const svc = await svcPlain({ candles: { read: () => { reads++; return { bars: [], covered: [] }; } } });
    await rejects(() => svc.resolve([liveItem('bt-test0001/t1')]), 400);
    await rejects(() => svc.resolve([{ ...liveItem('bt-test0001/t1'), typ: 'Paper' }]), 400);
    assert.equal(reads, 0);
    // zwykły identyfikator Notion przechodzi
    const r = await svc.resolve([liveItem('2f1c3a7e-1234-4bcd-9abc-0123456789ab')]);
    assert.equal(r.results['2f1c3a7e-1234-4bcd-9abc-0123456789ab'].status, 'no-data');
    assert.equal(reads, 1);
  });

  // ---------- 14. limit równoległych resolve ----------
  test('po-be-06 pkt 14: serwer: ponad limit równoległych resolve daje 429 bez odczytu, miejsce zwalnia się po końcu', async () => {
    const { createAfterBe, MAX_RESOLVE_INFLIGHT } = await imp('lib/po-be.mjs');
    assert.ok(MAX_RESOLVE_INFLIGHT >= 2);
    let reads = 0;
    const slow = { read: () => { reads++; const t0 = performance.now(); while (performance.now() - t0 < 12); return { bars: [], covered: [] }; } };
    const svc = createAfterBe({ btStore: {}, replayRange: {}, candles: slow, baseDir: null, log: () => {}, now: () => (END + 86400) * 1000 });
    const body = (i) => [liveItem(`r${i}a`), liveItem(`r${i}b`)];
    const runs = [];
    for (let i = 0; i < MAX_RESOLVE_INFLIGHT; i++) runs.push(svc.resolve(body(i)));
    const before = reads;
    const err = await rejects(() => svc.resolve(body(99)), 429);
    assert.equal(err.code, 'busy');
    assert.equal(reads, before, 'odrzucone bez odczytu świec');
    await Promise.all(runs);
    const ok = await svc.resolve(body(100));
    assert.equal(Object.keys(ok.results).length, 2, 'miejsce zwolnione');
    // błąd walidacji nie zajmuje miejsca
    for (let i = 0; i < MAX_RESOLVE_INFLIGHT + 2; i++) await rejects(() => svc.resolve('x'), 400);
    assert.equal(Object.keys((await svc.resolve(body(101))).results).length, 2);
  });

  test('po-be-06 pkt 14: klient: 429 przerywa kolejne porcje, działa jak błąd z odstępem 30 s, bez fałszywego statusu', async () => {
    const { fetchAfterBe, createAfterBeStore, AFTER_BE_CHUNK, afterBeLabel } = await imp('public/js/po-be-widok.js');
    let calls = 0;
    const busy = async () => { calls++; return { ok: false, status: 429, json: async () => ({ error: 'zajęty', code: 'busy' }) }; };
    const items = Array.from({ length: AFTER_BE_CHUNK * 3 }, (_, i) => ({ key: `k${i}`, typ: 'Live' }));
    const got = await fetchAfterBe(items, { fetchImpl: busy });
    assert.ok(got.error);
    assert.equal(got.size, 0);
    assert.equal(calls, 1, 'bez kolejnych porcji przy zajętym serwerze');
    let clock = 1000;
    calls = 0;
    const st = createAfterBeStore({ fetchImpl: busy, now: () => clock });
    const rows = [{ key: 'k', item: { key: 'k', typ: 'Live' } }];
    await st.ensure(rows, { refresh: true });
    assert.equal(calls, 1);
    assert.equal(st.get('k'), undefined, 'bez wyniku, więc bez fałszywego statusu');
    assert.equal(st.failed(), true);
    assert.ok(!/czeka/.test(afterBeLabel({ status: 'error' }).text));
    clock += 29000; await st.ensure(rows, { refresh: true }); assert.equal(calls, 1, 'przed 30 s bez żądania');
    clock += 2000; await st.ensure(rows, { refresh: true }); assert.equal(calls, 2, 'po 30 s ponownie');
  });

  test('po-be-06 pkt 14: szczegóły trade\'a: po 429 na prawdziwym buforze wiersz mówi o błędzie, a nie „czeka na świece”', async () => {
    const { createAfterBeStore, afterBeResult, afterBeFact } = await imp('public/js/po-be-widok.js');
    let mode = 429;
    const fetchImpl = async () => (mode === 429 ? { ok: false, status: 429, json: async () => ({ error: 'zajęty', code: 'busy' }) } : { ok: true, status: 200, json: async () => ({ results: { k: stOf('tp') } }) });
    let clock = 1000;
    const st = createAfterBeStore({ fetchImpl, now: () => clock });
    const rows = [{ key: 'k', item: { key: 'k', typ: 'Live' } }];
    assert.match(afterBeFact(afterBeResult(st, 'k')), /czeka na świece/, 'przed pierwszą odpowiedzią ten sam tekst co pending');
    await st.ensure(rows, { refresh: true });
    const failed = afterBeFact(afterBeResult(st, 'k'));
    assert.match(failed, /nie udało się pobrać/);
    assert.ok(!/czeka na świece/.test(failed), 'bez fałszywego statusu');
    // wynik, który już jest, wygrywa z flagą błędu innego pytania; po udanym ponowieniu znika błąd
    mode = 200; clock += 31000;
    await st.ensure(rows, { refresh: true });
    assert.match(afterBeFact(afterBeResult(st, 'k')), /doszedłby do TP/);
    assert.equal(st.failed(), false);
  });

  test('po-be-06 pkt 14: prawdziwy dashboard: szczegóły trade\'a po 429 z /api/after-be pokazują błąd pobrania', async () => {
    const dir = H.tmp();
    const A = await H.atrapa(++port);
    const env = { NOTION_TOKEN: 'test-token-atrapa', NOTION_VERSION: '2026-03-11', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_CONFIG_DIR: dir };
    let Srv = null;
    try {
      writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: 2, lang: 'pl' }));
      const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], H.cleanEnv({ ...env, NOTION_API_BASE: A.base }));
      assert.equal(mig.code, 0, String(mig.err || mig.out).slice(0, 300));
      Srv = await H.server(++port, { ...env, NOTION_API_BASE: A.base, THQ_NO_AUTO_1S: '1' });
      const made = await H.dash(Srv.base, '/api/trades', { typ: 'Live', name: 'Fala 429', dir: 'Long', instrument: 'NQ', setup: 'Breakout', r: 0.01, pnl: null, entryPrice: 18000, exitPrice: 18000, sl: 17900, tp: 18200, be: 18000, date: '2024-03-12', time: '10:00', exitDate: '2024-03-12', exitTime: '10:20' });
      assert.equal(made.status, 200, JSON.stringify(made.j));
      const { cdpPage } = await imp('testy/przegladarka.mjs');
      let out;
      try {
        out = await cdpPage(Srv.base + '/', {
          width: 1920, height: 1080, timeoutMs: 60000,
          until: `(() => {
            if (!sessionStorage.getItem('fala-init')) { sessionStorage.setItem('fala-init', '1'); localStorage.setItem('thq.filters.v1', JSON.stringify({ preset: 'all', typ: 'Live', view: 'trades', sortD: 'asc' })); location.reload(); return false; }
            if (!window.__f) { window.__f = 1; const real = window.fetch.bind(window); window.fetch = (u, o) => (String(u).includes('/api/after-be') ? Promise.resolve(new Response(JSON.stringify({ error: 'zajęty', code: 'busy' }), { status: 429, headers: { 'Content-Type': 'application/json' } })) : real(u, o)); }
            if (!window.__c) { const row = [...document.querySelectorAll('tr.trow')].find((r) => /Fala 429/.test(r.textContent))?.querySelector('.row-btn'); if (!row) return false; window.__c = Date.now(); row.click(); return false; }
            return !!document.querySelector('.lb .lb-facts [data-abe]') && Date.now() - window.__c > 1500;
          })()`,
          extract: "document.querySelector('.lb .lb-facts [data-abe]')?.innerText || ''",
        });
      } catch (e) { if (/Brak Chrome/.test(e.message)) { const s = new Error('brak przeglądarki'); s.skipTest = true; throw s; } throw e; }
      assert.match(String(out), /nie udało się pobrać/i, String(out));
      assert.ok(!/czeka na świece/i.test(String(out)), String(out));
    } finally { Srv?.stop(); A.stop(); }
  });

  // ---------- 15. plik tymczasowy i kopia danych ----------
  test('po-be-06 pkt 15: plik tymczasowy z PID, a w trakcie kopii katalogu danych pamięć nie zapisuje; zapis wraca po kopii', async () => {
    const { createAfterBe } = await imp('lib/po-be.mjs');
    const baseDir = H.tmp();
    const bars = flat(EXIT, END, 5100, { [EXIT + 600]: [5121, 5100] }).map((b) => [b[0], b[1] / 100, b[2] / 100, b[3] / 100, b[4] / 100, b[5]]);
    let blocked = true;
    const svc = createAfterBe({ btStore: {}, replayRange: {}, candles: { read: () => ({ bars, covered: [[EXIT, END]], missing: [] }) }, baseDir, now: () => (END + 86400) * 1000, log: () => {}, writesBlocked: () => blocked });
    const cacheFile = path.join(baseDir, 'after-be-cache.json');
    const item = { key: 'k1', typ: 'Live', instrument: 'NQ', contract: '', dir: 'long', entryPrice: 5100, sl: 5090, tp: 5120, exitAt: EXIT * 1000 };
    assert.equal((await one(svc, item)).status, 'tp');
    assert.ok(!existsSync(cacheFile), 'w trakcie kopii bez zapisu');
    assert.deepEqual(readdirSync(baseDir).filter((f) => f.includes('after-be')), [], 'także bez pliku tymczasowego');
    blocked = false;
    // stara nazwa pliku tymczasowego zajęta przez katalog: zapis idzie plikiem z PID, więc to mu nie przeszkadza
    mkdirSync(cacheFile + '.tmp');
    await one(svc, item);
    assert.ok(existsSync(cacheFile), 'odroczony zapis po kopii');
    assert.equal(JSON.parse(readFileSync(cacheFile, 'utf8')).v, 1);
    assert.deepEqual(readdirSync(baseDir).filter((f) => f.startsWith('after-be-cache.json.') && f !== 'after-be-cache.json.tmp'), [], 'po zapisie bez plików tymczasowych');
  });

  // ---------- 10. granica sesji w podglądzie trade'a typu Backtest ----------
  // [U] 05.11.2026 «Ogranicz do granicy sesji (Recommended)»
  test('po-be-06 pkt 10: podgląd w przeglądarce kończy dociąganie na granicy sesji i każde zapytanie niesie klucz trade\'a', async () => {
    const Srv = await H.server(++port, { THQ_CONFIG_DIR: H.tmp(), THQ_TEST_PAGES: '1', THQ_NO_AUTO_1S: '1' });
    try {
      const { cdpPage } = await imp('testy/przegladarka.mjs');
      let out;
      try {
        out = JSON.parse(await cdpPage(`${Srv.base}/__testy/po-be-06-podglad.html`, { width: 1200, height: 700, timeoutMs: 40000, extract: "document.getElementById('wynik').textContent" }));
      } catch (e) { if (/Brak Chrome/.test(e.message)) { const s = new Error('brak przeglądarki'); s.skipTest = true; throw s; } throw e; }
      assert.equal(out.status, 'ok', JSON.stringify(out));
      assert.ok(out.calls >= 1 && out.noKey === 0, JSON.stringify(out));
      assert.ok(out.calls <= 6, `dociąganie nie idzie dalej po granicy: ${out.calls} zapytań`);
      assert.ok(out.lastBar < out.cap, JSON.stringify(out));
    } finally { Srv.stop(); }
  });

  test('po-be-06 pkt 10: tradeQuery, miniatura i karta niosą klucz trade\'a Backtest; Live i Paper bez zmian', async () => {
    const P = await imp('public/js/podglad.js');
    const S = await imp('public/js/stats.js');
    assert.equal(S.btTradeKey({ typ: 'Backtest', btSession: 'Sesja A [bt-dashaaaa001/t7]' }), 'bt-dashaaaa001/t7');
    assert.equal(S.btTradeKey({ typ: 'Backtest', btSession: 'bez znacznika' }), null);
    assert.equal(S.btTradeKey({ typ: 'Live', btSession: 'Sesja A [bt-dashaaaa001/t7]' }), null);
    const a = 1710252000000;
    assert.deepEqual(P.tradeQuery({ at: a, exitAt: a + 60000, time: '10:00', btTrade: 'bt-dashaaaa001/t7' }), { tfrom: a / 1000, tto: a / 1000 + 60, btTrade: 'bt-dashaaaa001/t7' });
    assert.deepEqual(P.tradeQuery({ btTrade: 'bt-dashaaaa001/t7' }), { btTrade: 'bt-dashaaaa001/t7' }, 'bez czasu wejścia granica i tak obowiązuje');
    assert.deepEqual(P.tradeQuery({ at: a, exitAt: a + 60000, time: '10:00' }), { tfrom: a / 1000, tto: a / 1000 + 60 }, 'Live bez klucza');
    const { cardChartRequest } = await imp('public/js/udostepnij.js');
    const { CHART_IN_SHARE } = await imp('public/js/udostepnij.js');
    if (CHART_IN_SHARE !== false) {
      const url = cardChartRequest({ kind: 'trade', at: a, exitAt: a + 60000, instrument: 'NQ', time: '10:00', btTrade: 'bt-dashaaaa001/t7' }, { cfg: { shareChart: true }, badj: false });
      assert.match(url, /btTrade=bt-dashaaaa001%2Ft7/);
    }
    const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(src('public/js/podglad.js'), /new URLSearchParams\(\{ instrument: a\.instrument, from: String\(a\.from\), to: String\(a\.to\), tf: a\.tf, \.\.\.\(a\.btTrade \? \{ btTrade: a\.btTrade \} : \{\}\) \}\)/, 'miniatura pyta z kluczem');
    assert.match(src('public/js/app.js'), /const tradeArg = \(x\) => \(\{[^\n]*btTrade: S\.btTradeKey\(x\)/);
    assert.match(src('public/js/udostepnij-dane.js'), /btTrade: btTradeKey\(t\)/);
  });

  test('po-be-06 pkt 10: GET /api/candles z kluczem trade\'a: żadnej świecy za granicą sesji, w każdym interwale, tf=auto i całkiem za granicą; bez klucza i bez sesji jak dotąd', async () => {
    const dir = H.tmp();
    const baseDir = path.join(dir, 'chart-data');
    mkdirSync(baseDir, { recursive: true });
    const S0 = await imp('lib/candles-store.mjs');
    S0.writeAux('contracts-nq', { resolvedTo: '2099-01-01', v0: [], names: {} }, { baseDir });
    const E = at('2024-03-12T14:00:00Z'), X = E + 1200, HW = X + 1830, FAR = X + 5 * 3600, TP = X + 1800 + 600;
    const px = 18000;
    S0.writeRange('NQ', '1m', E - 7200, FAR, flat(E - 7200, FAR, px, { [TP]: [px + 200, px] }), {}, { baseDir });
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ lang: 'pl' }));
    const Srv = await H.server(++port, { THQ_CONFIG_DIR: dir, THQ_NO_AUTO_1S: '1' });
    try {
      const id = 'bt-graniczna001';
      const doc = { v: 2, id, name: 'Sesja', def: { instruments: ['NQ'], from: '2024-03-12', balance: 50000, risk: { mode: 'pct', value: 1 }, commission: 2.5, startTime: '09:00', accountId: null, filter: null, excluded: [] }, cursor: HW, book: { hw: HW, hwi: { NQ: HW } }, tradeSeq: 1, created: Date.now(), updated: Date.now(), trades: [{ id: 't1', instrument: 'NQ', dir: 'Long', qty: 1, entryT: E, exitT: X, entryPrice: px, exitPrice: px, sl: px, sl0: px - 50, tp: px + 150, be: true, beAt: px, r: 0, pnl: 0, day: '2024-03-12', exits: [{ t: X, reason: 'sl', price: px, qty: 1 }], log: [] }] };
      const saved = await H.dash(Srv.base, '/api/backtest/session/save', { id, doc, rev: 0 });
      assert.equal(saved.status, 200, JSON.stringify(saved.j));
      const get = async (q) => { const r = await fetch(`${Srv.base}/api/candles?${new URLSearchParams(q)}`); return { status: r.status, j: await r.json() }; };
      const base = { instrument: 'NQ', from: String(E - 3600), to: String(FAR), tfrom: String(E), tto: String(X) };
      const cap = Math.floor(HW / 60) * 60;
      const open = await get({ ...base, tf: '1m' });
      assert.ok(open.j.bars.some((b) => b[0] === TP && b[2] >= px + 100), 'bez klucza świece jak dotąd');
      for (const tf of ['1m', '5m', '15s', '1s', '1h', '1D', 'auto']) {
        const r = await get({ ...base, tf, btTrade: `${id}/t1`, ...(tf === 'auto' ? { maxBars: '120' } : {}) });
        assert.equal(r.status, 200, `${tf}: ${JSON.stringify(r.j).slice(0, 120)}`);
        assert.ok(r.j.bars.every((b) => b[0] < cap), `${tf}: świeca za granicą`);
        assert.ok(r.j.bars.every((b) => b[2] < px + 100), `${tf}: TP za granicą nie wycieka przez świecę zbiorczą`);
        assert.ok((r.j.covered || []).every(([, b]) => b <= cap), `${tf}: pokrycie za granicą`);
        assert.ok((r.j.missing || []).every(([, b]) => b <= cap), `${tf}: braki za granicą`);
      }
      const inCap = await get({ ...base, tf: '1m', btTrade: `${id}/t1` });
      assert.ok(inCap.j.bars.length > 50, 'świece do granicy są');
      assert.equal(inCap.j.sessionCap, cap, 'klient wie, gdzie kończyć dociąganie');
      assert.equal((await get({ instrument: 'NQ', from: String(E - 3600), to: String(E), tf: '1m', btTrade: `${id}/t1` })).j.sessionCap, cap, 'także gdy kadr nie sięga granicy');
      assert.ok(!('sessionCap' in open.j), 'bez klucza bez pola');
      // kadr w całości za granicą: pusta odpowiedź zwykłego kształtu, bez błędu
      const far = await get({ instrument: 'NQ', from: String(cap + 600), to: String(FAR), tf: '1m', btTrade: `${id}/t1` });
      assert.equal(far.status, 200);
      assert.deepEqual(far.j.bars, []);
      assert.deepEqual(far.j.missing, []);
      assert.equal(far.j.sessionCap, cap);
      // trade bez lokalnej sesji: jak dotąd
      const none = await get({ ...base, tf: '1m', btTrade: 'bt-niemaniema1/t1' });
      assert.ok(none.j.bars.some((b) => b[0] >= TP), 'bez sesji jak dotąd');
      assert.ok(!('sessionCap' in none.j));
      // klucz spoza wzorca
      assert.equal((await get({ ...base, tf: '1m', btTrade: '../../etc/passwd' })).status, 400);
      // przesunięcie granicy odsłania świece
      const doc2 = { ...doc, cursor: TP + 120, book: { hw: TP + 120, hwi: { NQ: TP + 120 } } };
      assert.equal((await H.dash(Srv.base, '/api/backtest/session/save', { id, doc: doc2, rev: saved.j.rev ?? 1 })).status, 200);
      assert.ok((await get({ ...base, tf: '1m', btTrade: `${id}/t1` })).j.bars.some((b) => b[0] === TP), 'po przesunięciu sesji TP widać');
    } finally { Srv.stop(); }
  });
};
