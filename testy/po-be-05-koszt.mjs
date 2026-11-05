// po-be-05: dobieranie świec 1m do wyniku po BE (Live i Paper). To jedyna część funkcji, która wydaje cudzy kredyt Databento, więc testy pilnują przede wszystkim tego, czego nie wolno.
// [U] 04.11.2026 «Dobieraj automatycznie świece 1m», «Wyłącznik, u ciebie włączony»: domyślnie wyłączone w kodzie i po aktualizacji, włączenie tylko jawnie (ten test nie włącza niczego w prawdziwej konfiguracji).
// Wyłącznie atrapa Databento i katalogi tymczasowe. Ceny atrapy: seria .v.0 ok. 5025, kontrakt surowy ok. 5080 (rawOffset 55).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

export default ({ test, H, assert, ROOT }) => {
  let port = 5730;
  const KEY = 'db-test-key-0123456789abcdef';
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const at = (s) => Date.parse(s) / 1000;
  // środa 20.03.2024 20:00Z, dane Databento do 14:59Z. Przed pierwszym pomiarem opóźnienia kod zakłada 8 h, więc okna do 12:00Z są już dostępne.
  const NOW = Date.UTC(2024, 2, 20, 20);
  const END = '2024-03-20T14:59:00.000000000Z';
  const req = async (A, end) => (await A.log()).log.filter((e) => e.path.endsWith(end));
  const ranges = async (A) => (await req(A, 'get_range')).map((e) => [e.params.symbols, e.params.schema, e.params.start, e.params.end]);
  const items = (R) => R.S.readAux('queue', { baseDir: R.dir })?.items || [];
  const abe = (R) => items(R).filter((i) => i.auto === 'after-be');
  const ON = () => ({ chartAfterBe: true, chartCredit: { ...H.TEST_CREDIT } });

  // wtorek 19.03.2024 15:00Z (11:00 ET), koniec dnia handlowego 17:00 ET = 21:00Z (czas letni od 10.03)
  const EXIT = at('2024-03-19T15:00:00Z'), DAY_END = at('2024-03-19T21:00:00Z');
  const win = (o = {}) => ({ key: 'live-1', instrument: 'ES', contract: '', from: EXIT, to: DAY_END, tfrom: EXIT - 1800, tto: EXIT, ...o });
  const trade = (o = {}) => ({ key: 'live-1', typ: 'Live', instrument: 'ES', contract: '', dir: 'long', entryPrice: 5025, sl: 5000, tp: 5026, at: (EXIT - 1800) * 1000, exitAt: EXIT * 1000, ...o });

  // v0: H4 od 13.12.2023, M4 od 13.03.2024
  async function direct({ cfg = ON(), clock = NOW, atrapa = {}, auto = true, fetchImpl, contracts = true, prep } = {}) {
    const A = await H.atrapaDb(++port);
    await A.config({ end: END, cost: 0.002, ...atrapa });
    const old = process.env.DATABENTO_API_BASE;
    process.env.DATABENTO_API_BASE = A.base;
    const { createCandles } = await lib('lib/candles.mjs');
    const S = await lib('lib/candles-store.mjs');
    const dir = H.tmp();
    const q = (y, m) => y * 4 + (m / 3 - 1);
    if (contracts) for (const n of ['nq', 'es']) S.writeAux('contracts-' + n, { resolvedTo: '2099-01-01', v0: [[at('2023-09-14T00:00:00Z'), q(2023, 12)], [at('2023-12-13T00:00:00Z'), q(2024, 3)], [at('2024-03-13T00:00:00Z'), q(2024, 6)]], names: {} }, { baseDir: dir });
    if (prep) await prep(S, dir);
    const st = { cfg, clock, saved: null, persists: 0 };
    const C = createCandles({ getKey: () => KEY, getConfig: () => st.cfg, persistConfigNow: () => { st.persists++; st.saved = JSON.parse(JSON.stringify(st.cfg)); }, baseDir: dir, now: () => st.clock, autoOpenWindows: auto, fetchImpl });
    const stop = () => { if (old === undefined) delete process.env.DATABENTO_API_BASE; else process.env.DATABENTO_API_BASE = old; A.stop(); };
    return { A, C, S, st, dir, stop };
  }
  // serwis wyniku po BE podłączony do prawdziwych świec, tak jak w server.mjs
  async function service(R, extra = {}) {
    const { createAfterBe } = await lib('lib/po-be.mjs');
    return createAfterBe({
      btStore: { read() { throw new Error('atrapa: odczyt sesji'); } }, replayRange: { readAfterBe() { throw new Error('atrapa: replay'); } },
      candles: R.C, baseDir: R.dir, now: () => R.st.clock, wantWindows: (list) => R.C.wantAfterBeWindows(list), log: () => {}, ...extra,
    });
  }
  const one = async (svc, item) => (await svc.resolve([item])).results[item.key];
  const settle = () => new Promise((r) => setImmediate(r));

  // ---------- wyłącznik ----------
  test('po-be-05: brak wpisu, false i nie-boolean: zero pozycji i zero jakichkolwiek zapytań, także po przebiegu kolejki', async () => {
    for (const v of [undefined, false, 'tak', 1]) {
      const R = await direct({ cfg: { chartCredit: { ...H.TEST_CREDIT }, ...(v === undefined ? {} : { chartAfterBe: v }) } });
      try {
        assert.deepEqual(R.C.wantAfterBeWindows([win()]), { queued: 0 }, String(v));
        await R.C.tick();
        assert.deepEqual(items(R), [], String(v));
        assert.deepEqual((await R.A.log()).log, [], 'zero żądań: ' + String(v));
        assert.equal(R.st.cfg.chartAfterBeSpentUsd, undefined);
      } finally { R.stop(); }
    }
  });

  test('po-be-05: createCandles bez autoOpenWindows nic nie pobiera, nawet z przełącznikiem i pozycją zostawioną w kolejce', async () => {
    const seed = { id: 'x', instrument: 'ES', layer: '1m', from: EXIT, to: DAY_END, state: 'pending', reason: null, attempts: 0, addedAt: NOW, auto: 'after-be' };
    const R = await direct({ auto: false, prep: (S, dir) => S.writeAux('queue', { items: [seed] }, { baseDir: dir }) });
    try {
      assert.deepEqual(R.C.wantAfterBeWindows([win()]), { queued: 0 });
      await R.C.tick();
      assert.deepEqual(await ranges(R.A), []);
      assert.equal((await req(R.A, 'get_cost')).length, 0);
      assert.equal(R.st.cfg.chartSpend, undefined);
    } finally { R.stop(); }
  });

  test('po-be-05: włączone: jedna pozycja after-be warstwy 1m, chart1mDaily nietknięty, przebieg pobiera dokładnie okno i tylko 1m', async () => {
    const R = await direct();
    try {
      assert.deepEqual(R.C.wantAfterBeWindows([win()]), { queued: 1 });
      assert.equal(items(R).length, 1);
      const [i] = items(R);
      assert.equal(i.auto, 'after-be'); assert.equal(i.layer, '1m'); assert.equal(i.instrument, 'ES'); assert.equal(i.from, EXIT); assert.equal(i.to, DAY_END);
      assert.deepEqual((await R.A.log()).log, [], 'samo dodanie do kolejki bez sieci');
      const r = await R.C.tick();
      assert.equal(r.done, 1, JSON.stringify(r));
      assert.deepEqual(await ranges(R.A), [['ES.v.0', 'ohlcv-1m', '2024-03-19T15:00:00Z', '2024-03-19T21:00:00Z']]);
      assert.equal(R.st.cfg.chart1mDaily, undefined, 'automat minutówek nie został włączony');
      assert.deepEqual(items(R), []);
      assert.deepEqual((await R.A.log()).violations, []);
    } finally { R.stop(); }
  });

  test('po-be-05: strażniki: brak kredytu, wygaśnięcie, za mały kredyt, limit dzienny i limit pobrania: zero get_range, zero wydatku, status no-data', async () => {
    const cases = [
      ['brak kredytu', { chartAfterBe: true }, 'credit', 'pending'],
      ['wygasły', { chartAfterBe: true, chartCredit: { startUsd: 100, expires: '2024-01-01', spentUsd: 0 } }, 'credit', 'pending'],
      ['za mały', { chartAfterBe: true, chartCredit: { startUsd: 0.001, expires: '2030-01-01', spentUsd: 0 } }, 'credit', 'pending'],
      ['limit dzienny', { ...ON(), chartSpend: { day: '2024-03-20', usd: 2.999 } }, 'daily-limit', 'pending'],
      ['limit pobrania', { ...ON(), chartCostLimitUsd: 0.001 }, null, 'blocked'],
    ];
    for (const [name, cfg, reason, state] of cases) {
      const R = await direct({ cfg });
      const usd0 = cfg.chartSpend?.usd;
      try {
        const svc = await service(R);
        assert.equal((await one(svc, trade())).status, 'no-data', name);
        await settle();
        assert.equal(abe(R).length, 1, name + ': pozycja czeka');
        await R.C.tick();
        assert.deepEqual(await ranges(R.A), [], name + ': zero get_range');
        assert.equal(R.st.cfg.chartSpend?.usd, usd0, name + ': licznik bez zmian');
        assert.equal(R.st.cfg.chartAfterBeSpentUsd, undefined, name);
        assert.equal(R.C.status().queue.reason, reason, name);
        assert.equal(abe(R)[0].state, state, name);
        assert.equal((await one(svc, trade())).status, 'no-data', name + ': dalej no-data');
      } finally { R.stop(); }
    }
  });

  test('po-be-05: wyłączenie usuwa pozycje after-be od razu, a okno trade\'a zostaje i jest pobrane', async () => {
    const R = await direct();
    try {
      R.C.wantAfterBeWindows([win()]);
      R.C.enqueue({ windows: [{ instrument: 'ES', from: at('2024-03-18T15:00:00Z'), to: at('2024-03-18T15:30:00Z') }] });
      assert.equal(items(R).length, 2);
      R.st.cfg.chartAfterBe = false;
      assert.equal(R.C.dropAutomatic(), 1);
      assert.deepEqual(items(R).map((i) => i.auto ?? null), [null]);
      await R.C.tick();
      assert.deepEqual((await ranges(R.A)).map((x) => x[1]), ['ohlcv-1s'], 'tylko okno trade\'a');
    } finally { R.stop(); }
  });

  test('po-be-05: wyłączenie w trakcie przebiegu: po bieżącym pobraniu nic więcej się nie wydaje', async () => {
    let R = null, sent = 0;
    const fetchImpl = async (u, o) => { if (String(u).endsWith('get_range') && ++sent === 1) R.st.cfg.chartAfterBe = false; return fetch(u, o); };
    R = await direct({ fetchImpl });
    try {
      R.C.wantAfterBeWindows([win(), win({ key: 'live-2', from: at('2024-03-18T15:00:00Z'), to: at('2024-03-18T21:00:00Z') })]);
      await R.C.tick();
      assert.equal(sent, 1);
    } finally { R.stop(); }
  });


  // ---------- runda poprawek 1 (N3): pamięć zakupów zapisuje tylko to, co faktycznie kupiono ----------
  test('po-be-05: wyłączenie między porcjami miesięcznymi: pamięć zakupów zawiera tylko kupioną porcję, nie cały zakres okna', async () => {
    let R = null, sent = 0;
    const fetchImpl = async (u, o) => { if (String(u).endsWith('get_range') && ++sent === 1) R.st.cfg.chartAfterBe = false; return fetch(u, o); };
    R = await direct({ fetchImpl });
    try {
      // okno przez granicę miesięcy w jednej warstwie: porcje najnowsze najpierw (luty, potem styczeń)
      const from = at('2024-01-30T15:00:00Z'), to = at('2024-02-02T21:00:00Z');
      assert.deepEqual(R.C.wantAfterBeWindows([win({ from, to, tfrom: from - 1800, tto: from })]), { queued: 1 });
      await R.C.tick();
      assert.equal(sent, 1, 'druga porcja nie została kupiona');
      const bought = R.S.readAux('after-be-bought', { baseDir: R.dir })?.items || [];
      assert.ok(bought.length >= 1, 'kupiona porcja jest w pamięci');
      const feb1 = at('2024-02-01T00:00:00Z');
      for (const b of bought) assert.ok(b[2] >= feb1, 'pamięć nie sięga niekupionego stycznia: ' + JSON.stringify(b));
    } finally { R.stop(); }
  });

  // ---------- runda poprawek 1 (N4): trade trwale zablokowany pamięcią zakupów ----------
  test('po-be-05: trade zablokowany pamięcią zakupów: serwer go oznacza (także przy wyłączonym przełączniku), podpowiedź nie obiecuje kolejki, szacunek nie liczy jego dnia', async () => {
    const R = await direct();
    try {
      R.C.wantAfterBeWindows([win()]);
      await R.C.tick();
      const q = (y, m) => y * 4 + (m / 3 - 1);
      R.S.writeAux('contracts-es', { resolvedTo: '2099-01-01', v0: [[at('2023-12-13T00:00:00Z'), q(2024, 3)], [at('2024-03-25T00:00:00Z'), q(2024, 6)]], names: {} }, { baseDir: R.dir });
      assert.deepEqual(R.C.wantAfterBeWindows([win()]), { queued: 0 });
      assert.deepEqual([...R.C.afterBeHeld([win(), win({ key: 'live-9', from: EXIT - 7200, to: DAY_END, tfrom: EXIT - 7200, tto: EXIT - 7200 })])], ['live-1'], 'tylko okno w całości w kupionym zakresie');
      // przełącznik wyłączony (szacunek przed zgodą): pamięć dalej wskazuje zablokowane
      R.st.cfg.chartAfterBe = false;
      assert.deepEqual([...R.C.afterBeHeld([win()])], ['live-1'], 'przełącznik wyłączony');
      // serwis oddaje klucze obok wyników; Result bez zmian
      const svc = await service(R, { heldWindows: (l) => R.C.afterBeHeld(l), candles: { read: () => ({ bars: [], covered: [] }) } });
      const out = await svc.resolve([trade()]);
      assert.deepEqual(out.held, ['live-1'], 'serwis oddaje held');
      assert.equal(out.results['live-1'].status, 'no-data');
    } finally { R.stop(); }
    const W = await lib('public/js/po-be-widok.js');
    const okCredit = { configured: true, leftUsd: 10, expired: false };
    const src = { afterBe: true, key: true, credit: okCredit, dailyLimitUsd: 3, spentTodayUsd: 0, afterBeReadyTo: DAY_END + 3600, queue: { pending: 0, blocked: 0, reason: null, pausedUntil: null } };
    const held = W.afterBeNoDataReason({ typ: 'Live', exitAt: EXIT * 1000, src, held: true });
    assert.match(held, /nie będą pobierane ponownie|drugi raz/);
    assert.doesNotMatch(held, /trafią do kolejki/);
    assert.match(W.afterBeNoDataReason({ typ: 'Live', exitAt: EXIT * 1000, src }), /trafią do kolejki/, 'bez znacznika zostaje dotychczasowa obietnica');
    // szacunek: dzień zablokowanego trade'a nie liczy się, bo nic go nie kupi
    const row = (key, exit) => ({ key, item: { key, typ: 'Live', instrument: 'ES', exitAt: exit * 1000 }, local: null });
    const rows = [row('a', EXIT), row('b', EXIT - 86400)];
    const map = new Map([['a', { status: 'no-data' }], ['b', { status: 'no-data' }]]);
    assert.deepEqual(W.afterBeBacklogOf(rows, map, new Set(['a'])), { days: 1, usd: 0.005 });
    const fetchImpl = async (u, o) => ({ ok: true, status: 200, json: async () => ({ results: Object.fromEntries(JSON.parse(o.body).items.map((i) => [i.key, { status: 'no-data' }])), held: ['a'] }) });
    const rowsOf = (trades, { typ }) => trades.filter((x) => x.typ === typ).map((x) => row(x.id, x.exitAt / 1000));
    assert.deepEqual(await W.loadAfterBeBacklog([{ id: 'a', typ: 'Live', exitAt: EXIT * 1000 }, { id: 'b', typ: 'Live', exitAt: (EXIT - 86400) * 1000 }], { fetchImpl, rowsOf }), { days: 1, usd: 0.005 });
  });
  // ---------- pochodzenie pozycji: P57 i after-be nie są scalane ----------
  test('po-be-05: pozycje after-be i P57 tej samej warstwy nie są scalane: każda znika tylko od swojego przełącznika, wspólny fragment płatny raz', async () => {
    // P57 trafia do kolejki z przebiegu, więc tu sadzimy jego pozycję wprost w pliku kolejki (warstwa 1m bez znacznika, jak z dailyMinutesWanted)
    const p57 = { id: 'ES-1m-p57', instrument: 'ES', layer: '1m', from: EXIT - 3600, to: DAY_END + 3600, state: 'pending', reason: null, attempts: 0, addedAt: NOW };
    const make = (cfg) => direct({ cfg, prep: (S, dir) => S.writeAux('queue', { items: [p57] }, { baseDir: dir }) });
    // wyłączenie P57: after-be zostaje i nie wchłonęło jego zakresu
    let R = await make({ ...ON(), chart1mDaily: true });
    try {
      R.C.wantAfterBeWindows([win()]);
      assert.equal(items(R).length, 2, 'bez scalania');
      assert.equal(new Set(items(R).map((i) => i.id)).size, 2, 'różne id');
      R.st.cfg.chart1mDaily = false;
      R.C.dropAutomatic();
      assert.deepEqual(items(R).map((i) => [i.auto, i.from, i.to]), [['after-be', EXIT, DAY_END]]);
    } finally { R.stop(); }
    // wyłączenie after-be: P57 zostaje
    R = await make({ ...ON(), chart1mDaily: true });
    try {
      R.C.wantAfterBeWindows([win()]);
      R.st.cfg.chartAfterBe = false;
      R.C.dropAutomatic();
      assert.deepEqual(items(R).map((i) => [i.auto ?? null, i.from, i.to]), [[null, EXIT - 3600, DAY_END + 3600]]);
    } finally { R.stop(); }
    // to samo okno z obu źródeł: różne id, po przebiegu obie pozycje znikają, a zakres jest pobrany raz (kolejka odejmuje pokrycie)
    const same = { ...p57, from: EXIT, to: DAY_END, id: `ES-1m-${EXIT}-${DAY_END}` };
    R = await direct({ cfg: { ...ON(), chart1mDaily: true }, prep: (S, dir) => S.writeAux('queue', { items: [same] }, { baseDir: dir }) });
    try {
      R.C.wantAfterBeWindows([win()]);
      assert.equal(new Set(items(R).map((i) => i.id)).size, 2);
      await R.C.tick();
      // dokładnie jedno żądanie dotyka tego zakresu: zero znaczyłoby, że nic nie pobrano, dwa, że zapłacono podwójnie
      const touching = (await ranges(R.A)).filter((x) => x[0] === 'ES.v.0' && x[2] < '2024-03-19T21:00:00Z' && x[3] > '2024-03-19T15:00:00Z');
      assert.equal(touching.length, 1, JSON.stringify(touching));
      assert.ok(touching[0][2] <= '2024-03-19T15:00:00Z' && touching[0][3] >= '2024-03-19T21:00:00Z', 'pobrany cały zakres: ' + JSON.stringify(touching));
      assert.deepEqual(abe(R), []);
    } finally { R.stop(); }
  });

  test('po-be-05: dwa okna after-be tej samej warstwy łączą się i zachowują znacznik', async () => {
    const R = await direct();
    try {
      R.C.wantAfterBeWindows([win(), win({ key: 'live-2', from: at('2024-03-19T18:00:00Z') })]);
      assert.deepEqual(abe(R).map((i) => [i.from, i.to]), [[EXIT, DAY_END]]);
      R.C.wantAfterBeWindows([win({ key: 'live-3', from: at('2024-03-19T14:00:00Z'), to: at('2024-03-19T15:10:00Z') })]);
      assert.deepEqual(abe(R).map((i) => [i.from, i.to, i.auto]), [[at('2024-03-19T14:00:00Z'), DAY_END, 'after-be']]);
    } finally { R.stop(); }
  });

  test('po-be-05: trimStaleMinutes nie tnie okna sprzed 200 dni, a stara pozycja P57 jest cięta jak dotąd', async () => {
    const OLD = at('2023-09-01T15:00:00Z'), OLD_END = at('2023-09-01T21:00:00Z');
    const old57 = { id: 'ES-1m-stare', instrument: 'ES', layer: '1m', from: at('2023-08-01T00:00:00Z'), to: at('2023-08-02T00:00:00Z'), state: 'pending', reason: null, attempts: 0, addedAt: NOW };
    const R = await direct({ cfg: { ...ON(), chartCredit: undefined }, prep: (S, dir) => S.writeAux('queue', { items: [old57] }, { baseDir: dir }) });
    try {
      R.st.cfg.chart1mDaily = true;
      R.C.wantAfterBeWindows([win({ from: OLD, to: OLD_END, tfrom: OLD, tto: OLD })]);
      assert.deepEqual(items(R).map((i) => [i.auto, i.from, i.to]), [['after-be', OLD, OLD_END]], 'P57 usunięta, after-be nietknięta');
      R.st.cfg.chartCredit = { ...H.TEST_CREDIT };
      R.st.cfg.chart1mDaily = false;
      const r = await R.C.tick();
      assert.equal(r.done, 1, JSON.stringify(r));
      assert.deepEqual(await ranges(R.A), [['ES.v.0', 'ohlcv-1m', '2023-09-01T15:00:00Z', '2023-09-01T21:00:00Z']]);
    } finally { R.stop(); }
  });

  // ---------- lawina, ponowienia, dedup ----------
  const hundred = () => Array.from({ length: 100 }, (_, k) => {
    const d = at('2024-03-19T15:00:00Z') - (k + 1) * 2 * 86400;
    return win({ key: 'l' + k, from: d, to: d + 6 * 3600, tfrom: d, tto: d });
  });
  test('po-be-05: 100 trade\'ów: najwyżej 50 okien na żądanie, bez żadnego żądania do Databento przy dodawaniu, kolejne żądanie dokłada następne, a potem nic', async () => {
    const { AFTER_BE_BATCH_MAX } = await lib('lib/candles.mjs');
    assert.equal(AFTER_BE_BATCH_MAX, 50);
    const R = await direct({ cfg: { chartAfterBe: true } });
    try {
      assert.deepEqual(R.C.wantAfterBeWindows(hundred()), { queued: 50 });
      assert.equal(abe(R).length, 50);
      assert.deepEqual((await R.A.log()).log, []);
      assert.deepEqual(R.C.wantAfterBeWindows(hundred()), { queued: 50 });
      assert.equal(abe(R).length, 100);
      assert.deepEqual(R.C.wantAfterBeWindows(hundred()), { queued: 0 });
      assert.equal(abe(R).length, 100);
      assert.equal(R.C.wantAfterBeWindows('nie lista').queued, 0);
    } finally { R.stop(); }
  });

  test('po-be-05: pełne 50 okien przy starcie: limit dzienny zatrzymuje wydawanie, a awaria po naliczeniu kosztu daje jedną płatną próbę na godzinę dla całej kolejki', async () => {
    let R = await direct({ atrapa: { cost: 0.08, cost1m: 0.08 } });
    try {
      R.C.wantAfterBeWindows(hundred());
      await R.C.tick();
      assert.equal((await ranges(R.A)).length, 20, 'pierwszy przebieg: limit pozycji na przebieg');
      await R.C.tick();
      const n = (await ranges(R.A)).length;
      assert.ok(n === 37, 'tyle mieści się w 3 USD po 0,08 USD: ' + n);
      assert.ok(R.st.cfg.chartSpend.usd <= 3, JSON.stringify(R.st.cfg.chartSpend));
      assert.equal(R.C.status().queue.reason, 'daily-limit');
      await R.C.tick();
      assert.equal((await ranges(R.A)).length, n, 'ten sam dzień: bez kolejnych pobrań');
      assert.equal(abe(R).length, 50 - n);
    } finally { R.stop(); }
    R = await direct({ atrapa: { cost: 0.05, cost1m: 0.05, fail: { path: '/v0/timeseries.get_range', status: 500 } } });
    try {
      R.C.wantAfterBeWindows(hundred());
      for (let i = 0; i < 12; i++) { R.st.clock = NOW + i * 5 * 60_000; await R.C.tick(); R.C.wantAfterBeWindows(hundred()); }
      assert.equal((await ranges(R.A)).length, 1, 'jedna płatna próba');
      assert.ok(Math.abs(R.st.cfg.chartAfterBeSpentUsd - 0.05) < 1e-9);
    } finally { R.stop(); }
  });

  test('po-be-05: kolejka after-be ma sufit, żeby czekające dobierania nie wypchnęły okien trade\'ów z kolejki', async () => {
    const { AFTER_BE_QUEUE_MAX } = await lib('lib/candles.mjs');
    const seed = Array.from({ length: AFTER_BE_QUEUE_MAX }, (_, k) => { const f = at('2020-01-01T00:00:00Z') + k * 86400; return { id: 's' + k, instrument: 'NQ', layer: '1m', from: f, to: f + 3600, state: 'pending', reason: null, attempts: 0, addedAt: NOW, auto: 'after-be' }; });
    const R = await direct({ prep: (S, dir) => S.writeAux('queue', { items: seed }, { baseDir: dir }) });
    try {
      assert.deepEqual(R.C.wantAfterBeWindows([win()]), { queued: 0 });
      assert.equal(items(R).length, AFTER_BE_QUEUE_MAX);
    } finally { R.stop(); }
  });

  test('po-be-05: okna pokryte nie zjadają limitu 50, a pokryte nie dają pozycji', async () => {
    const list = hundred().slice(0, 70);
    const R = await direct({ prep: (S, dir) => { for (const w of list.slice(0, 60)) for (const L of ['1m', '1m-ESH2024', '1m-ESM2024', '1m-ESZ2023']) S.writeRange('ES', L, w.from, w.to, [], {}, { baseDir: dir }); } });
    try {
      assert.deepEqual(R.C.wantAfterBeWindows(list), { queued: 10 });
      assert.deepEqual(abe(R).map((i) => i.from).sort(), list.slice(60).map((w) => w.from).sort());
    } finally { R.stop(); }
  });

  test('po-be-05: ten sam trade pytany co 30 s przez godzinę: jedna pozycja, jedno get_range, zero dokładania po pokryciu', async () => {
    const R = await direct();
    try {
      const svc = await service(R);
      const first = await one(svc, trade());
      assert.equal(first.status, 'no-data');
      await settle();
      const added = abe(R)[0].addedAt;
      for (let i = 1; i <= 10; i++) { R.st.clock = NOW + i * 30_000; assert.equal((await one(svc, trade())).status, 'no-data'); await settle(); }
      assert.equal(abe(R).length, 1);
      assert.equal(abe(R)[0].addedAt, added, 'pozycja nie jest podmieniana');
      await R.C.tick();
      const n = (await ranges(R.A)).length, c = (await req(R.A, 'get_cost')).length;
      assert.equal(n, 1);
      const spent = R.st.cfg.chartAfterBeSpentUsd;
      for (let i = 11; i <= 20; i++) { R.st.clock = NOW + i * 30_000; await one(svc, trade()); await settle(); await R.C.tick(); }
      assert.equal((await ranges(R.A)).length, n, 'zero kolejnych pobrań');
      assert.equal((await req(R.A, 'get_cost')).length, c, 'zero kolejnych wycen');
      assert.deepEqual(items(R), []);
      assert.equal(R.st.cfg.chartAfterBeSpentUsd, spent);
    } finally { R.stop(); }
  });

  test('po-be-05: pytanie w trakcie pobierania tego samego okna nie płaci drugi raz', async () => {
    let R = null;
    const fetchImpl = async (u, o) => { if (String(u).endsWith('get_range')) assert.deepEqual(R.C.wantAfterBeWindows([win()]), { queued: 0 }); return fetch(u, o); };
    R = await direct({ fetchImpl });
    try {
      R.C.wantAfterBeWindows([win()]);
      await R.C.tick();
      await R.C.tick();
      assert.equal((await ranges(R.A)).length, 1);
      assert.deepEqual(items(R), []);
    } finally { R.stop(); }
  });

  test('po-be-05: błąd po naliczeniu kosztu idzie polityką 1.7.1 (1 h, 6 h, blokada), a pytania o ten sam trade jej nie resetują', async () => {
    const R = await direct({ atrapa: { cost: 0.05, cost1m: 0.05, fail: { path: '/v0/timeseries.get_range', status: 500 } } });
    try {
      const svc = await service(R);
      await one(svc, trade());
      await settle();
      for (let i = 0; i < 12; i++) { R.st.clock = NOW + i * 5 * 60_000; await R.C.tick(); await one(svc, trade()); await settle(); }
      assert.equal((await ranges(R.A)).length, 1, 'jedna płatna próba w pierwszej godzinie');
      assert.equal(abe(R).length, 1);
      assert.equal(abe(R)[0].fails, 1, 'pytanie nie zeruje licznika prób');
      assert.ok(Math.abs(R.st.cfg.chartAfterBeSpentUsd - 0.05) < 1e-9, 'licznik jak rezerwacja: płatna próba się liczy');
      R.st.clock = NOW + 3600_000; await R.C.tick();
      assert.equal((await ranges(R.A)).length, 2);
      R.st.clock = NOW + 3600_000 + 7 * 3600_000; await R.C.tick();
      assert.equal(abe(R)[0].state, 'blocked');
      assert.equal(abe(R)[0].fails, 3);
      const n = (await ranges(R.A)).length;
      await one(svc, trade()); await settle();
      assert.equal(abe(R)[0].state, 'blocked', 'pytanie nie odblokowuje');
      R.st.clock += 24 * 3600_000; await R.C.tick();
      assert.equal((await ranges(R.A)).length, n, 'zablokowana nie płaci');
    } finally { R.stop(); }
  });

  // ---------- czego nie wyceniamy ----------
  test('po-be-05: złe i niedostępne okna są pomijane bez wyceny: sprzed MIN_FROM, z przyszłości, poza dostępnością, zły kontrakt, zły instrument', async () => {
    const R = await direct();
    try {
      const nowS = NOW / 1000;
      const list = [
        win({ from: 1000000000, to: 1000003600, tfrom: 1000000000, tto: 1000000000 }),
        win({ from: nowS + 3600, to: nowS + 7200 }),
        // koniec okna młodszy niż opóźnienie Databento (zakładane 8 h przed pierwszym pomiarem)
        win({ from: nowS - 7200, to: nowS - 3600, tfrom: nowS - 7200, tto: nowS - 7200 }),
        win({ contract: 'XXZ9' }), win({ contract: 'NQM4' }), win({ instrument: 'CL' }), win({ instrument: 5 }),
        win({ from: EXIT + 0.5 }), win({ to: EXIT }), win({ from: 'a' }), null, 7,
        win({ from: EXIT, to: EXIT + 20 * 86400 }),
      ];
      assert.deepEqual(R.C.wantAfterBeWindows(list), { queued: 0 });
      assert.deepEqual(items(R), []);
      await R.C.tick();
      assert.deepEqual((await R.A.log()).log.filter((e) => /get_cost|get_range/.test(e.path)), []);
    } finally { R.stop(); }
  });

  test('po-be-05: bez klucza albo bez rozwiązanych kontraktów nic nie trafia do kolejki; przebieg dociąga kontrakty i następne pytanie dodaje pozycję', async () => {
    const R = await direct({ contracts: false });
    try {
      assert.deepEqual(R.C.wantAfterBeWindows([win()]), { queued: 0 }, 'kontrakty nieznane');
      assert.deepEqual(items(R), []);
      await R.C.tick();
      assert.ok((await req(R.A, 'symbology.resolve')).length >= 1, 'bezpłatne rozwiązanie kontraktów');
      assert.deepEqual(await ranges(R.A), []);
      assert.deepEqual(R.C.wantAfterBeWindows([win()]), { queued: 1 });
    } finally { R.stop(); }
    const { createCandles } = await lib('lib/candles.mjs');
    const dir = H.tmp();
    const C = createCandles({ getKey: () => '', getConfig: () => ON(), baseDir: dir, now: () => NOW, autoOpenWindows: true });
    assert.deepEqual(C.wantAfterBeWindows([win()]), { queued: 0 });
  });

  test('po-be-05: wyjście dziś: dopóki dzień handlowy trwa, wantWindows nie dostaje okna (jego koniec zmieniałby się co pytanie); po końcu dnia dostaje pełne okno w sekundach, od wyjścia do 17:00 ET', async () => {
    const { createAfterBe } = await lib('lib/po-be.mjs');
    const want = [];
    let clock = (DAY_END - 3600) * 1000;
    const svc = createAfterBe({ btStore: {}, replayRange: {}, candles: { read: () => ({ bars: [], covered: [] }) }, baseDir: H.tmp(), now: () => clock, wantWindows: (x) => want.push(...x) });
    // decyzja sesji głównej 05.11.2026: przed końcem okna pending, a nie no-data
    assert.equal(await one(svc, trade()).then((r) => r.status), 'pending');
    await settle();
    assert.deepEqual(want, [], 'dzień trwa');
    clock = (DAY_END + 60) * 1000;
    await one(svc, trade());
    await settle();
    assert.deepEqual(want, [{ from: EXIT, to: DAY_END, key: 'live-1', instrument: 'ES', contract: '', tfrom: EXIT - 1800, tto: EXIT }]);
    assert.ok(Number.isInteger(want[0].from) && Number.isInteger(want[0].to) && want[0].from > 1e9 && want[0].from < 4294967295, 'sekundy epoki, jak isT w kolejce');
  });

  // ---------- typy ----------
  test('po-be-05: typ Backtest nigdy nie woła wantWindows, Live i Paper wołają', async () => {
    const { createAfterBe } = await lib('lib/po-be.mjs');
    const calls = [];
    const doc = { v: 2, book: { hw: DAY_END + 7200, hwi: { ES: DAY_END + 7200 } }, trades: [{ id: 't1', instrument: 'ES', dir: 'long', entryPrice: 5025, sl0: 5000, tp: 5026, exitT: EXIT }] };
    const svc = createAfterBe({
      btStore: { read: () => doc }, replayRange: { readAfterBe: () => null }, candles: { read: () => ({ bars: [], covered: [] }) },
      baseDir: H.tmp(), now: () => (DAY_END + 7200) * 1000, wantWindows: (x) => calls.push(x),
    });
    assert.equal((await svc.resolve([{ key: 'bt-abcdef12/t1', typ: 'Backtest' }])).results['bt-abcdef12/t1'].status, 'no-data');
    await settle();
    assert.deepEqual(calls, [], 'Backtest bez danych nie pobiera');
    const res = await svc.resolve([trade(), trade({ key: 'paper-1', typ: 'Paper' }), { key: 'bt-abcdef12/t1', typ: 'Backtest' }]);
    assert.equal(res.results['live-1'].status, 'no-data');
    await settle();
    assert.deepEqual(calls.flat().map((x) => x.key).sort(), ['live-1', 'paper-1']);
  });

  // ---------- po dojściu danych ----------
  test('po-be-05: po dojściu świec no-data przelicza się na wynik; Result bez nowych pól', async () => {
    const R = await direct();
    try {
      const svc = await service(R);
      const a = await one(svc, trade());
      assert.deepEqual(Object.keys(a).sort(), ['at', 'hitSl', 'mfeR', 'rIfHeld', 'status']);
      assert.equal(a.status, 'no-data');
      await settle();
      await R.C.tick();
      const b = await one(svc, trade());
      assert.equal(b.status, 'tp', JSON.stringify(b));
      assert.deepEqual(Object.keys(b).sort(), ['at', 'hitSl', 'mfeR', 'rIfHeld', 'status']);
    } finally { R.stop(); }
  });

  test('po-be-05: kontrakt trade\'a: warstwa kontraktu z pola Kontrakt, reguła frontQ bez pola, MNQ w magazynie NQ; po pobraniu odczyt ma wynik z tej samej warstwy', async () => {
    const E = at('2024-03-11T15:00:00Z');
    const cases = [
      // v0 to jeszcze H4 (do 13.03), pole Kontrakt każe M4: warstwa kontraktu
      ['pole', trade({ exitAt: E * 1000, at: (E - 1800) * 1000, contract: 'ESM4', entryPrice: 5080, tp: 5081, sl: 5000 }), 'ESM4', 'ES', '1m-ESM2024'],
      // bez pola: reguła rynku (zapasowa: poniedziałek tygodnia wygaśnięcia, 11.03) daje już M4, choć .v.0 to jeszcze H4
      ['reguła', trade({ exitAt: E * 1000, at: (E - 1800) * 1000, entryPrice: 5080, tp: 5081, sl: 5000 }), 'ESM4', 'ES', '1m-ESM2024'],
      // po przełączeniu .v.0: warstwa serii
      ['seria', trade(), 'ES.v.0', 'ES', '1m'],
      ['mikro', trade({ instrument: 'MNQ', contract: 'MNQM4', exitAt: E * 1000, at: (E - 1800) * 1000, entryPrice: 5080, tp: 5081, sl: 5000 }), 'NQM4', 'NQ', '1m-NQM2024'],
    ];
    for (const [name, tr, symbol, data, layer] of cases) {
      const R = await direct();
      try {
        const svc = await service(R);
        assert.equal((await one(svc, tr)).status, 'no-data', name);
        await settle();
        assert.deepEqual(abe(R).map((i) => [i.instrument, i.layer]), [[data, layer]], name);
        await R.C.tick();
        assert.deepEqual((await ranges(R.A)).map((x) => x[0]), [symbol], name);
        assert.equal((await one(svc, tr)).status, 'tp', name);
        await settle();
        assert.deepEqual(items(R), [], name + ': po wyniku nic nie dochodzi');
      } finally { R.stop(); }
    }
  });

  // ---------- licznik ----------
  test('po-be-05: licznik chartAfterBeSpentUsd liczy tylko pozycje after-be i jest zapisany trwale przed get_range, jak rezerwacja', async () => {
    let R = null, snap = null;
    const fetchImpl = async (u, o) => { if (String(u).endsWith('get_range') && R.st.saved?.chartAfterBeSpentUsd && !snap) snap = R.st.saved.chartAfterBeSpentUsd; return fetch(u, o); };
    R = await direct({ fetchImpl });
    try {
      R.C.wantAfterBeWindows([win()]);
      R.C.enqueue({ windows: [{ instrument: 'ES', from: at('2024-03-18T15:00:00Z'), to: at('2024-03-18T15:30:00Z') }] });
      await R.C.tick();
      assert.equal((await ranges(R.A)).length, 2);
      assert.ok(Math.abs(R.st.cfg.chartAfterBeSpentUsd - 0.002) < 1e-9, 'tylko pozycja after-be: ' + R.st.cfg.chartAfterBeSpentUsd);
      assert.ok(Math.abs(R.st.cfg.chartSpend.usd - 0.004) < 1e-9, 'licznik dobowy liczy obie');
      assert.ok(Math.abs(snap - 0.002) < 1e-9, 'zapis przed get_range: ' + snap);
      assert.ok(Math.abs(R.C.afterBeSpent() - 0.002) < 1e-9);
      // ręczne pobranie (kliknięcie) po przebiegu kolejki nie dolicza się do licznika
      await R.A.reset();
      const q = { instrument: 'ES', from: at('2024-03-14T15:00:00Z'), to: at('2024-03-14T16:00:00Z'), layer: '1m' };
      const quote = await R.C.quote(q);
      await R.C.fetchDays({ ...q, confirmedCostUsd: quote.costUsd });
      for (let i = 0; i < 100 && R.C.status().running; i++) await H.sleep(20);
      assert.ok((await ranges(R.A)).length >= 1);
      assert.ok(Math.abs(R.st.cfg.chartAfterBeSpentUsd - 0.002) < 1e-9, 'pobranie ręczne bez zmian licznika');
    } finally { R.stop(); }
  });

  // ---------- serwer i ustawienia ----------
  test('po-be-05: serwer: domyślnie wyłączone, zero zapytań; /api/config włącza tylko wartością logiczną; POST /api/after-be dokłada pozycję Live; false zdejmuje ją od razu; bez wpisu w migracji', async () => {
    const dir = H.tmp();
    const baseDir = path.join(dir, 'chart-data');
    mkdirSync(baseDir, { recursive: true });
    const S0 = await lib('lib/candles-store.mjs');
    S0.writeAux('contracts-es', { resolvedTo: '2099-01-01', v0: [], names: {} }, { baseDir });
    const A = await H.atrapaDb(++port);
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ lang: 'pl' }));
    const S = await H.server(++port, { THQ_CONFIG_DIR: dir, DATABENTO_API_BASE: A.base, DATABENTO_API_KEY: KEY, THQ_NO_AUTO_1S: '' });
    try {
      const m0 = await (await fetch(S.base + '/api/meta')).json();
      assert.equal(m0.chartAfterBe, false);
      assert.equal(m0.chart1mDaily, false);
      assert.ok(!('chartAfterBe' in JSON.parse(readFileSync(path.join(dir, 'config.local.json'), 'utf8'))), 'żadnego wpisu bez jawnej zgody');
      const s0 = await (await fetch(S.base + '/api/sources')).json();
      assert.equal(s0.databento.afterBe, false); assert.equal(s0.databento.afterBeSpentUsd, 0);
      // prawdziwy kształt odpowiedzi: granica dostępności świec idzie polem afterBeReadyTo (nie readyTo), a podpowiedź czyta właśnie je
      assert.ok(Number.isFinite(s0.databento.afterBeReadyTo) && !('readyTo' in s0.databento), 'serwer podaje afterBeReadyTo');
      {
        const { afterBeNoDataReason: why } = await lib('public/js/po-be-widok.js');
        const okCredit = { configured: true, leftUsd: 10, expired: false };
        const src = { ...s0.databento, afterBe: true, key: true, credit: okCredit, dailyLimitUsd: 3, spentTodayUsd: 0, afterBeReadyTo: Math.floor(Date.now() / 1000) - 6 * 86400 };
        // wyjście 5 dni temu: z domyślnym opóźnieniem 8 h byłoby dostępne, więc tylko odczyt pola afterBeReadyTo daje ten powód
        assert.match(why({ typ: 'Live', exitAt: Date.now() - 5 * 86400000, src }), /jeszcze nie udostępnił/, 'granica z prawdziwej odpowiedzi serwera działa w podpowiedzi');
      }
      // kilka dni temu, wyjście z dokładnością do minuty
      const ex = Math.floor((Date.now() - 5 * 86400000) / 60000) * 60;
      const item = { key: 'live-9', typ: 'Live', instrument: 'ES', contract: '', dir: 'long', entryPrice: 5025, sl: 5000, tp: 5100, exitAt: ex * 1000, at: (ex - 600) * 1000 };
      const r0 = await H.dash(S.base, '/api/after-be', { items: [item] });
      assert.equal(r0.j.results['live-9'].status, 'no-data');
      await H.sleep(50);
      const q0 = await (await fetch(S.base + '/api/candles/status')).json();
      assert.equal(q0.queue.pending, 0, 'wyłączone: bez pozycji');
      assert.deepEqual((await A.log()).log.filter((e) => /get_cost|get_range/.test(e.path)), []);

      assert.equal((await H.dash(S.base, '/api/config', { chartAfterBe: 'tak' })).j.chartAfterBe, false, 'tylko wartość logiczna');
      assert.equal((await H.dash(S.base, '/api/config', { chartAfterBe: true })).j.chartAfterBe, true);
      // zapis konfiguracji jest opóźniony o 50 ms, jak przy pozostałych przełącznikach
      await H.sleep(200);
      assert.equal(JSON.parse(readFileSync(path.join(dir, 'config.local.json'), 'utf8')).chartAfterBe, true);
      assert.equal((await (await fetch(S.base + '/api/meta')).json()).chart1mDaily, false, 'automat minutówek dalej wyłączony');
      await H.dash(S.base, '/api/after-be', { items: [item] });
      let q1;
      for (let i = 0; i < 50; i++) { await H.sleep(20); q1 = await (await fetch(S.base + '/api/candles/status')).json(); if (q1.queue.pending) break; }
      assert.equal(q1.queue.pending, 1);
      assert.equal(q1.queue.items[0].auto, 'after-be');
      // typ Backtest przez serwer: nic nie dochodzi
      await H.dash(S.base, '/api/after-be', { items: [{ key: 'bt-abcdef12/t1', typ: 'Backtest' }] });
      await H.sleep(50);
      assert.equal((await (await fetch(S.base + '/api/candles/status')).json()).queue.pending, 1);

      assert.equal((await H.dash(S.base, '/api/config', { chartAfterBe: false })).j.chartAfterBe, false);
      assert.equal((await (await fetch(S.base + '/api/candles/status')).json()).queue.pending, 0, 'wyłączenie czyści kolejkę od razu');
      assert.deepEqual((await A.log()).log.filter((e) => e.path.endsWith('get_range')), [], 'nic nie pobrano');
    } finally { S.stop(); A.stop(); }
    assert.ok(!/chartAfterBe/.test(readFileSync(path.join(ROOT, 'lib/config-migracje.mjs'), 'utf8')), 'brak migracji włączającej');
  });

  // ---------- runda 1: limit na przebieg ----------
  test('po-be-05: 200 okien nie pobiera się w jednym przebiegu: najwyżej 20 pozycji after-be na tick, reszta czeka do następnego, pokryte i okna trade\'ów poza limitem', async () => {
    const { AFTER_BE_TICK_MAX } = await lib('lib/candles.mjs');
    assert.equal(AFTER_BE_TICK_MAX, 20);
    const list = Array.from({ length: 200 }, (_, k) => { const d = EXIT - (k + 1) * 2 * 86400; return win({ key: 'x' + k, from: d, to: d + 6 * 3600, tfrom: d, tto: d }); });
    const R = await direct({ cfg: { ...ON(), chartDailyLimitUsd: 100 } });
    try {
      // tak robi klient: porcje po 50 przy jednym wejściu na widok, więc limit na żądanie nie jest granicą wydawania
      for (let i = 0; i < 200; i += 50) R.C.wantAfterBeWindows(list.slice(i, i + 50));
      assert.ok(abe(R).length >= 195, 'kolejka: ' + abe(R).length);
      const start = abe(R).length;
      R.C.enqueue({ windows: [{ instrument: 'ES', from: at('2024-03-19T22:30:00Z'), to: at('2024-03-19T23:00:00Z') }] });
      const r1 = await R.C.tick();
      const g1 = await ranges(R.A);
      assert.equal(g1.filter((x) => x[1] === 'ohlcv-1m').length, 20, 'jeden przebieg: 20 pozycji');
      assert.equal(g1.filter((x) => x[1] === 'ohlcv-1s').length, 1, 'okno trade\'a poza limitem');
      assert.equal(abe(R).length, start - 20);
      assert.equal(r1.done, 21, JSON.stringify(r1));
      assert.equal(R.C.status().queue.reason, null, 'to nie jest błąd ani wstrzymanie');
      R.st.clock = NOW + 5 * 60_000;
      await R.C.tick();
      assert.equal((await ranges(R.A)).filter((x) => x[1] === 'ohlcv-1m').length, 40, 'następny przebieg: kolejne 20');
    } finally { R.stop(); }
    // pozycja już pokryta niczego nie kosztuje, więc nie zjada limitu
    const covered = Array.from({ length: 25 }, (_, k) => { const f = EXIT - (k + 1) * 2 * 86400; return { id: 'c' + k, instrument: 'ES', layer: '1m', from: f, to: f + 3600, state: 'pending', reason: null, attempts: 0, addedAt: NOW, auto: 'after-be' }; });
    const P = await direct({ prep: (S, dir) => { S.writeAux('queue', { items: covered }, { baseDir: dir }); for (const c of covered) S.writeRange('ES', '1m', c.from, c.to, [], {}, { baseDir: dir }); } });
    try {
      const r = await P.C.tick();
      assert.equal(r.done, 25, JSON.stringify(r));
      assert.deepEqual(await ranges(P.A), []);
      assert.deepEqual(items(P), []);
    } finally { P.stop(); }
    // pokryte, ale starsze niż 25 płatnych: limit wyczerpany przed nimi, a i tak znikają w tym samym przebiegu, bo nic nie kosztują
    const paid = Array.from({ length: 25 }, (_, k) => { const f = EXIT - (k + 1) * 2 * 86400; return { id: 'p' + k, instrument: 'ES', layer: '1m', from: f, to: f + 3600, state: 'pending', reason: null, attempts: 0, addedAt: NOW, auto: 'after-be' }; });
    const old = covered.slice(0, 5).map((c, k) => ({ ...c, from: c.from - 400 * 86400, to: c.to - 400 * 86400, id: 'o' + k }));
    const M = await direct({ prep: (S, dir) => { S.writeAux('queue', { items: [...paid, ...old] }, { baseDir: dir }); for (const c of old) S.writeRange('ES', '1m', c.from, c.to, [], {}, { baseDir: dir }); } });
    try {
      await M.C.tick();
      assert.equal((await ranges(M.A)).length, 20);
      assert.deepEqual(items(M).filter((i) => i.id.startsWith('o')), [], 'pokryte zdjęte mimo wyczerpanego limitu');
      assert.equal(items(M).length, 5, 'czeka reszta płatnych');
    } finally { M.stop(); }
  });

  // ---------- runda 1: podwójna zapłata po zmianie warstwy ----------
  test('po-be-05: trade bez pola Kontrakt po zmianie warstwy (pomiar rolla) nie kupuje tego samego okna drugi raz, także po restarcie; jawny kontrakt kupuje swoje', async () => {
    const R = await direct();
    const q = (y, m) => y * 4 + (m / 3 - 1);
    try {
      assert.deepEqual(R.C.wantAfterBeWindows([win()]), { queued: 1 });
      await R.C.tick();
      assert.deepEqual((await ranges(R.A)).map((x) => x[0]), ['ES.v.0']);
      // .v.0 przełącza się teraz później, więc ten sam trade wg reguły trafia do warstwy kontraktu
      R.S.writeAux('contracts-es', { resolvedTo: '2099-01-01', v0: [[at('2023-12-13T00:00:00Z'), q(2024, 3)], [at('2024-03-25T00:00:00Z'), q(2024, 6)]], names: {} }, { baseDir: R.dir });
      assert.deepEqual(R.C.wantAfterBeWindows([win()]), { queued: 0 }, 'to samo okno, inna warstwa: bez zakupu');
      assert.deepEqual(items(R), []);
      const { createCandles } = await lib('lib/candles.mjs');
      const C2 = createCandles({ getKey: () => KEY, getConfig: () => R.st.cfg, baseDir: R.dir, now: () => R.st.clock, autoOpenWindows: true });
      assert.deepEqual(C2.wantAfterBeWindows([win()]), { queued: 0 }, 'pamięć przeżywa restart');
      // inny trade bez pola, ta sama część dnia: też bez drugiego zakupu
      assert.deepEqual(C2.wantAfterBeWindows([win({ key: 'live-2', from: EXIT + 3600, tfrom: EXIT, tto: EXIT + 3600 })]), { queued: 0 });
      // okno wychodzące poza kupiony zakres to już inne dane
      assert.deepEqual(C2.wantAfterBeWindows([win({ key: 'live-3', from: EXIT - 7200, to: DAY_END, tfrom: EXIT - 7200, tto: EXIT - 7200 })]), { queued: 1 });
    } finally { R.stop(); }
    // jawne pole Kontrakt to świadomy wybór innych danych, więc kupuje mimo zakupu serii w tym samym zakresie
    const J = await direct();
    try {
      J.C.wantAfterBeWindows([win()]);
      await J.C.tick();
      assert.deepEqual(J.C.wantAfterBeWindows([win({ key: 'live-4', contract: 'ESU4' })]), { queued: 1 });
      assert.equal(abe(J)[0].layer, '1m-ESU2024');
    } finally { J.stop(); }
  });

  // ---------- runda 1: sufit nie liczy zablokowanych ----------
  test('po-be-05: sufit kolejki nie liczy pozycji zablokowanych, a status kolejki podaje ich liczbę', async () => {
    const { AFTER_BE_QUEUE_MAX } = await lib('lib/candles.mjs');
    const seed = Array.from({ length: AFTER_BE_QUEUE_MAX }, (_, k) => { const f = at('2020-01-01T00:00:00Z') + k * 86400; return { id: 'b' + k, instrument: 'NQ', layer: '1m', from: f, to: f + 3600, state: 'blocked', reason: 'limit', attempts: 1, addedAt: NOW, auto: 'after-be' }; });
    const R = await direct({ prep: (S, dir) => S.writeAux('queue', { items: seed }, { baseDir: dir }) });
    try {
      assert.deepEqual(R.C.wantAfterBeWindows([win()]), { queued: 1 });
      assert.equal(R.C.status().queue.afterBeBlocked, AFTER_BE_QUEUE_MAX);
    } finally { R.stop(); }
  });

  // ---------- runda 1: powód no-data przy trade'zie ----------
  test('po-be-05: powód no-data przy trade\'zie Live i Paper: każdy stan ma własną podpowiedź, Result bez zmian', async () => {
    const { afterBeNoDataReason: why, afterBeBadge, afterBeFact, afterBeLabel } = await lib('public/js/po-be-widok.js');
    const okCredit = { configured: true, leftUsd: 10, expired: false };
    const base = { afterBe: true, key: true, credit: okCredit, dailyLimitUsd: 3, spentTodayUsd: 0, afterBeReadyTo: DAY_END + 3600, queue: { pending: 0, blocked: 0, reason: null, pausedUntil: null } };
    const exitAt = EXIT * 1000;
    const cases = [
      ['wyłączone', { afterBe: false }, /wyłączone.*Ustawieniach/],
      ['brak klucza', { key: false }, /klucza Databento/],
      ['bez kredytu', { credit: { configured: false } }, /stanu kredytu/],
      ['wygasł', { credit: { configured: true, leftUsd: 10, expired: true } }, /wygasł/],
      ['niedostępne', { afterBeReadyTo: DAY_END - 60 }, /jeszcze nie udostępnił/],
      ['za mało kredytu', { credit: { configured: true, leftUsd: 0.001, expired: false } }, /za mały/],
      ['za mało z kolejki', { queue: { pending: 1, blocked: 0, reason: 'credit' } }, /za mały/],
      ['limit dzienny', { spentTodayUsd: 3 }, /[Ll]imit dzienny/],
      ['limit z kolejki', { queue: { pending: 1, blocked: 0, reason: 'daily-limit' } }, /[Ll]imit dzienny/],
      ['pauza', { queue: { pending: 1, blocked: 0, reason: null, pausedUntil: Date.now() + 1000 } }, /nieudanym płatnym/],
      ['zablokowane', { queue: { pending: 0, blocked: 2, reason: null } }, /zablokowan/],
      ['w kolejce', { queue: { pending: 3, blocked: 0, reason: null } }, /czekają w kolejce/],
      ['nic z powyższych', {}, /następnym/],
    ];
    const seen = new Set();
    for (const [name, over, re] of cases) {
      const txt = why({ typ: 'Live', exitAt, src: { ...base, ...over } });
      assert.match(txt, re, name);
      seen.add(txt);
      assert.equal(why({ typ: 'Paper', exitAt, src: { ...base, ...over } }), txt, name + ': Paper tak samo');
    }
    assert.ok(seen.size >= 10, 'powody się różnią: ' + seen.size);
    assert.match(why({ typ: 'Live', exitAt: null, src: base }), /czasu wyjścia/);
    assert.match(why({ typ: 'Live', exitAt, src: null }), /Ustawienia/, 'bez danych o stanie: wskazanie Ustawień, nie zmyślony powód');
    // podpowiedź trafia do znacznika w tabeli i w faktach
    const r = { status: 'no-data', at: null, rIfHeld: null, mfeR: null, hitSl: null };
    assert.match(afterBeBadge(r, { short: true, reason: 'POWOD' }), /title="POWOD"/);
    assert.match(afterBeFact(r, { reason: 'POWOD' }), /title="POWOD"/);
    assert.equal(afterBeLabel(r, { reason: 'POWOD' }).text, 'Po BE: brak danych', 'tekst statusu bez zmian');
    // inne statusy powodu nie przyjmują, a pending ma ten sam DOM z powodem i bez
    const p = { ...r, status: 'pending' };
    assert.equal(afterBeBadge(p, { reason: 'POWOD' }), afterBeBadge(p));
    assert.equal(afterBeFact(p, { reason: 'POWOD' }), afterBeFact(p));
  });

  test('po-be-05: Backtest: bez powodu płatnego, tylko informacja o braku lokalnych danych, ta sama niezależnie od stanu kredytu i przełącznika', async () => {
    const { afterBeNoDataReason: why, afterBeFact, afterBeBadge } = await lib('public/js/po-be-widok.js');
    const a = why({ typ: 'Backtest', exitAt: EXIT * 1000, src: { afterBe: false, key: false, credit: { configured: false } } });
    const b = why({ typ: 'Backtest', exitAt: null, src: { afterBe: true, key: true, credit: { configured: true, leftUsd: 5 }, queue: { pending: 9, blocked: 3, reason: 'daily-limit' } } });
    assert.equal(a, b);
    assert.match(a, /lokaln/);
    assert.doesNotMatch(a, /kredyt|klucz|limit|Ustawieni|kolejk|USD/i);
    const r = { status: 'no-data', at: null, rIfHeld: null, mfeR: null, hitSl: null };
    // Journal backtestu woła afterBeFact bez powodu: domyślnie informacja o danych lokalnych
    assert.ok(afterBeFact(r).includes(a.replace(/'/g, '&#39;')) || afterBeFact(r).includes(a), afterBeFact(r));
    assert.ok(afterBeBadge(r).includes('title='));
  });

  // ---------- runda 1: szacunek zaległości ----------
  test('po-be-05: szacunek zaległości: dni handlowe bez świec na instrument, bez płatnej wyceny; liczba nieznana to null, nie zero', async () => {
    const { afterBeBacklogOf, loadAfterBeBacklog, AFTER_BE_DAY_USD } = await lib('public/js/po-be-widok.js');
    assert.equal(AFTER_BE_DAY_USD, 0.005);
    const row = (key, instrument, exit) => ({ key, item: { key, typ: 'Live', instrument, exitAt: exit == null ? null : exit * 1000 }, local: null });
    const rows = [row('a', 'ES', EXIT), row('b', 'ES', EXIT + 3600), row('c', 'MES', EXIT), row('d', 'NQ', EXIT), row('e', 'ES', EXIT - 86400), row('f', 'ES', EXIT - 172800), row('g', 'ES', null), { key: 'nd:h', item: null, local: { status: 'no-data' } }];
    const st = (s) => ({ status: s });
    const map = new Map([['a', st('no-data')], ['b', st('no-data')], ['c', st('no-data')], ['d', st('no-data')], ['e', st('no-data')], ['f', st('tp')], ['g', st('no-data')]]);
    // ES i MES tego samego dnia to ten sam dzień danych; NQ osobno; f ma wynik; g bez wyjścia i nd: nie kupią niczego
    assert.deepEqual(afterBeBacklogOf(rows, map), { days: 3, usd: 3 * 0.005 });
    assert.deepEqual(afterBeBacklogOf([], new Map()), { days: 0, usd: 0 });
    // trade'y Live i Niewzięty, tylko bezpłatne POST /api/after-be
    const calls = [];
    const trade1 = { id: 'x1', typ: 'Live', instrument: 'ES', dir: 'Long', be: true, r: 0, at: (EXIT - 600) * 1000, exitAt: EXIT * 1000 };
    const fetchImpl = async (u, o) => { calls.push(String(u)); const items = JSON.parse(o.body).items; return { ok: true, status: 200, json: async () => ({ results: Object.fromEntries(items.map((i) => [i.key, st('no-data')])) }) }; };
    const rowsOf = (trades, { typ }) => trades.filter((x) => x.typ === typ).map((x) => row(x.id, x.instrument, x.exitAt / 1000));
    assert.deepEqual(await loadAfterBeBacklog([trade1], { fetchImpl, rowsOf }), { days: 1, usd: 0.005 });
    assert.deepEqual([...new Set(calls)], ['/api/after-be']);
    assert.equal(await loadAfterBeBacklog(null, { fetchImpl, rowsOf }), null, 'trade\'y niewczytane');
    assert.equal(await loadAfterBeBacklog([trade1], { fetchImpl: async () => { throw new Error('siec'); }, rowsOf }), null, 'błąd pytania');
    assert.equal(await loadAfterBeBacklog([trade1], { fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }), rowsOf }), null, 'błąd serwera');
  });

  // ---------- runda 1: blokada zapisu przy przenoszeniu danych ----------
  test('po-be-05: gotowa kopia danych blokuje zapis: /api/after-be liczy wynik, ale nie dokłada pozycji; po anulowaniu dokłada', async () => {
    const dir = H.tmp();
    const baseDir = path.join(dir, 'chart-data');
    mkdirSync(baseDir, { recursive: true });
    const S0 = await lib('lib/candles-store.mjs');
    S0.writeAux('contracts-es', { resolvedTo: '2099-01-01', v0: [], names: {} }, { baseDir });
    const A = await H.atrapaDb(++port);
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ lang: 'pl', chartAfterBe: true }));
    const S = await H.server(++port, { THQ_CONFIG_DIR: dir, DATABENTO_API_BASE: A.base, DATABENTO_API_KEY: KEY, THQ_NO_AUTO_1S: '' });
    try {
      const target = path.join(H.tmp(), 'nowe');
      const st = await H.dash(S.base, '/api/disk/move', { target, confirm: true });
      assert.ok(st.status < 300, JSON.stringify(st));
      let m;
      for (let i = 0; i < 100; i++) { m = await (await fetch(S.base + '/api/disk/move/status')).json(); if (['ready', 'error'].includes(m.phase)) break; await H.sleep(50); }
      assert.equal(m.phase, 'ready', JSON.stringify(m));
      const ex = Math.floor((Date.now() - 5 * 86400000) / 60000) * 60;
      const item = { key: 'live-m', typ: 'Live', instrument: 'ES', contract: '', dir: 'long', entryPrice: 5025, sl: 5000, tp: 5100, exitAt: ex * 1000, at: (ex - 600) * 1000 };
      const r = await H.dash(S.base, '/api/after-be', { items: [item] });
      assert.equal(r.status, 200);
      assert.equal(r.j.results['live-m'].status, 'no-data');
      await H.sleep(100);
      assert.equal((await (await fetch(S.base + '/api/candles/status')).json()).queue.pending, 0, 'blokada: bez pozycji');
      assert.ok((await H.dash(S.base, '/api/disk/move/cancel', {})).status < 300);
      await H.dash(S.base, '/api/after-be', { items: [item] });
      let q;
      for (let i = 0; i < 50; i++) { await H.sleep(20); q = await (await fetch(S.base + '/api/candles/status')).json(); if (q.queue.pending) break; }
      assert.equal(q.queue.pending, 1, 'po anulowaniu kopii pozycja dochodzi');
    } finally { S.stop(); A.stop(); }
  });

  let page = null;
  function pageResult() {
    page ||= (async () => {
      const P = await lib('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const dir = H.tmp();
      const base = path.join(dir, 'chart-data');
      const S0 = await lib('lib/candles-store.mjs');
      // warstwa do sprawdzenia ostrzeżenia w Dane na dysku i zablokowana pozycja po BE w kolejce
      const day = Math.floor(Date.now() / 86400000) * 86400 - 10 * 86400;
      S0.writeRange('NQ', '1m', day + 50400, day + 50460, [[day + 50400, 500000, 500100, 499900, 500050, 10]], {}, { baseDir: base });
      S0.writeAux('queue', { items: [{ id: 'ab1', instrument: 'NQ', layer: '1m', from: day, to: day + 3600, state: 'blocked', reason: 'limit', attempts: 1, addedAt: Date.now(), auto: 'after-be' }] }, { baseDir: base });
      const A = await H.atrapa(5770);
      const D = await H.atrapaDb(5771);
      const S = await H.server(5772, { NOTION_API_BASE: A.base, DATABENTO_API_BASE: D.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'secret_atrapa', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL });
      try {
        const txt = await P.cdpPage(S.base + '/', { width: 1920, height: 1080, timeoutMs: 120_000, until: "window.__thq && document.querySelector('#view .page-head')", extract: readFileSync(path.join(ROOT, 'testy', 'scen-po-be-05.js'), 'utf8') });
        return JSON.parse(txt);
      } finally { S.stop(); A.stop(); D.stop(); }
    })();
    return page;
  }
  async function tagged(tag, min) {
    const res = await pageResult();
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, tag + ': strona wykonała sprawdzenia (' + mine.length + ')');
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], tag + ': nieudane sprawdzenia');
  }
  test('po-be-05: ekran: przełącznik odznaczony, potwierdzenie kosztu bez POST przed potwierdzeniem, zdanie o braku klucza, Anuluj z fokusem', async () => { await tagged('start', 1); await tagged('potwierdzenie', 3); await tagged('anuluj', 1); });
  test('po-be-05: ekran: Włącz zapisuje true, wydana kwota jest widoczna, wyłączenie zapisuje false bez pytania', async () => { await tagged('wlacz', 3); await tagged('wylacz', 2); });
  test('po-be-05: ekran: potwierdzenie ma szacunek zaległości i bez wyniku liczenia nie pozwala włączyć; zablokowane pozycje są opisane; ostrzeżenie przy usuwaniu warstwy tylko przy włączonym przełączniku', async () => { await tagged('szacunek', 3); await tagged('zablokowane', 1); await tagged('dysk', 2); });
  test('po-be-05: ekran: podpowiedź przy no-data w prawdziwym widoku Trade\'y: wyłączone, a po włączeniu bez klucza mówi o kluczu', async () => { await tagged('powod', 3); });
  test('po-be-05: CHANGELOG ma wpis 1.8.0 w PL i EN, z kosztem i informacją, że domyślnie wyłączone', () => {
    const c = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
    const i = c.indexOf('## [1.8.0]');
    assert.ok(i >= 0 && i < c.indexOf('## [1.7.1]'));
    const body = c.slice(i, c.indexOf('\n## [', i + 5));
    assert.match(body, /\n### PL\n/); assert.match(body, /\n### EN\n/);
    assert.match(body, /0,005 USD/); assert.match(body, /0\.005/);
    assert.match(body, /20 pozycji/); assert.match(body, /20 items/);
    assert.match(body, /szacunek|szacunkowy/i); assert.match(body, /estimate/i);
    assert.match(body, /[Dd]omyślnie .*wyłączone/); assert.match(body, /[Oo]ff by default/);
    assert.ok(!/[—–]/.test(body), 'bez pauz');
  });
};
