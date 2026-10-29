// wykresy-04: P25 (27.10.2026): okna 1s wokół trade'ów, historia 1m, kolejka, strażnik kredytu, import wznawialny, luki w sekundach. Tylko atrapa Databento.
import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const KEY = 'db-test-key-0123456789abcdef';
  let port = 4860;
  const utc = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000;
  const D26 = utc(2026, 10, 26);
  const mod = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const sleep = H.sleep;
  const calls = async (A, name) => (await A.log()).log.filter((e) => e.path.endsWith(name));

  // createCandles bezpośrednio na atrapie; zegar sterowany z testu (domyślnie 27.10.2026 12:00Z, atrapa kończy dane o 10:00Z).
  async function direct({ cfg = {}, clock = Date.UTC(2026, 9, 27, 12), atrapa = {}, fetchImpl } = {}) {
    const A = await H.atrapaDb(++port);
    if (Object.keys(atrapa).length) await A.config(atrapa);
    const old = process.env.DATABENTO_API_BASE;
    process.env.DATABENTO_API_BASE = A.base;
    const { createCandles } = await mod('lib/candles.mjs');
    const st = { clock, cfg };
    const dir = H.tmp();
    const saved = []; // migawki liczników w chwili natychmiastowego zapisu konfiguracji
    const C = createCandles({ getKey: () => KEY, getConfig: () => st.cfg, baseDir: dir, now: () => st.clock, fetchImpl, persistConfigNow: () => saved.push(JSON.stringify([st.cfg.chartCredit, st.cfg.chartSpend])) });
    const idle = async () => { for (let i = 0; i < 300 && C.status().running; i++) await sleep(30); };
    const stop = () => { if (old === undefined) delete process.env.DATABENTO_API_BASE; else process.env.DATABENTO_API_BASE = old; A.stop(); };
    return { A, C, st, dir, idle, stop, saved };
  }
  const win = (from, to) => ({ instrument: 'ES', from, to });

  test('wykresy-04: P25: okno trade\'a = wejście −30 min / wyjście +30 min (jedna stała), zaokrąglone do minut; łączenie okien (nakładające, przerwa < 30 min, przerwa = 30 min osobno)', async () => {
    const K = await mod('lib/candles.mjs');
    assert.equal(K.WINDOW_PAD_SEC, 1800); assert.equal(K.WINDOW_MERGE_GAP_SEC, 1800);
    assert.deepEqual(K.tradeWindow(utc(2026, 10, 26, 14), utc(2026, 10, 26, 14, 10)), { from: utc(2026, 10, 26, 13, 30), to: utc(2026, 10, 26, 14, 40) });
    assert.deepEqual(K.tradeWindow(utc(2026, 10, 26, 14, 0, 20), utc(2026, 10, 26, 14, 10, 40)), { from: utc(2026, 10, 26, 13, 30), to: utc(2026, 10, 26, 14, 41) }, 'na zewnątrz do pełnej minuty');
    assert.deepEqual(K.mergeWindows([{ from: 0, to: 100 }, { from: 50, to: 200 }]), [{ from: 0, to: 200 }]);
    assert.deepEqual(K.mergeWindows([{ from: 5000, to: 6000 }, { from: 0, to: 1000 }, { from: 2799, to: 4000 }]), [{ from: 0, to: 6000 }], 'nieposortowane wejście, łańcuch przerw < 30 min');
    assert.deepEqual(K.mergeWindows([{ from: 0, to: 1000 }, { from: 2800, to: 3000 }]), [{ from: 0, to: 1000 }, { from: 2800, to: 3000 }], 'przerwa dokładnie 30 min: osobno');
    assert.deepEqual(K.mergeWindows([{ from: 0, to: 1000 }, { from: 2799, to: 3000 }]), [{ from: 0, to: 3000 }], 'przerwa 1799 s: razem');
    assert.deepEqual(K.mergeWindows([]), []);
    // dwa trade'y godzinę po sobie: okna się nakładają i dają jedno żądanie
    const w = K.mergeWindows([K.tradeWindow(utc(2026, 10, 26, 14), utc(2026, 10, 26, 14, 10)), K.tradeWindow(utc(2026, 10, 26, 15), utc(2026, 10, 26, 15, 10))]);
    assert.deepEqual(w, [{ from: utc(2026, 10, 26, 13, 30), to: utc(2026, 10, 26, 15, 40) }]);
    assert.deepEqual(K.monthChunks(utc(2026, 8, 20), utc(2026, 10, 3)).map((c) => [c.from, c.to]), [[utc(2026, 8, 20), utc(2026, 9, 1)], [utc(2026, 9, 1), utc(2026, 10, 1)], [utc(2026, 10, 1), utc(2026, 10, 3)]]);
  });

  test('wykresy-04: P25: enqueue łączy okna (także z czekającymi), MES→ES, brak źródła, walidacja, pokryte pomijane; zero sieci', async () => {
    const R = await direct();
    try {
      const t = (i, e, x) => ({ instrument: i, entry: e, exit: x });
      let r = R.C.enqueue({ trades: [t('ES', utc(2026, 10, 26, 14), utc(2026, 10, 26, 14, 10)), t('MES', utc(2026, 10, 26, 15), utc(2026, 10, 26, 15, 10)), t('NQ', utc(2026, 10, 20, 14), utc(2026, 10, 20, 14, 5)), t('EURUSD', utc(2026, 10, 20, 14), utc(2026, 10, 20, 14, 5))] });
      assert.deepEqual(r, { ok: true, queued: 2, noSource: 1, covered: 0, invalid: 0, dropped: 0 }, 'ES+MES w jedno okno, NQ osobno, EURUSD bez źródła');
      const q = R.C.status().queue;
      assert.equal(q.pending, 2);
      assert.deepEqual(q.items.map((i) => [i.instrument, i.from, i.to]), [['ES', utc(2026, 10, 26, 13, 30), utc(2026, 10, 26, 15, 40)], ['NQ', utc(2026, 10, 20, 13, 30), utc(2026, 10, 20, 14, 35)]], 'najnowsze pierwsze');
      r = R.C.enqueue({ trades: [t('ES', utc(2026, 10, 26, 14), utc(2026, 10, 26, 14, 10))] });
      assert.equal(r.queued, 2, 'to samo okno drugi raz nie dubluje');
      r = R.C.enqueue({ trades: [t('ES', utc(2026, 10, 26, 16, 0), utc(2026, 10, 26, 16, 5))] });
      assert.equal(r.queued, 2, 'nowy trade z przerwą < 30 min dołącza do czekającego okna'); assert.equal(R.C.status().queue.items[0].to, utc(2026, 10, 26, 16, 35));
      // zła pozycja jest pomijana i liczona, reszta paczki wchodzi; błędny kształt całej paczki to 400
      r = R.C.enqueue({ trades: [t('ES', utc(2026, 10, 26, 15), utc(2026, 10, 26, 14)), t('ES', 'x', 5), null, t('E S', D26, D26 + 5), t('NQ', utc(2026, 10, 19, 14), utc(2026, 10, 19, 14, 5))], windows: [win(5, 10), win(D26, D26 + 11 * 86400)] });
      assert.equal(r.invalid, 6); assert.equal(r.queued, 3, 'jedna dobra pozycja weszła mimo sześciu złych');
      for (const bad of [{ trades: 'x' }, { windows: 5 }, { trades: Array.from({ length: 501 }, () => t('ES', D26, D26 + 5)) }]) assert.throws(() => R.C.enqueue(bad), (e) => e.status === 400, JSON.stringify(bad).slice(0, 40));
      // okno w całości pokryte warstwą 1s nie trafia do kolejki
      const S = await mod('lib/candles-store.mjs');
      S.writeRange('NQ', '1s', utc(2026, 10, 21, 13, 30), utc(2026, 10, 21, 14, 35), [], {}, { baseDir: R.dir });
      r = R.C.enqueue({ trades: [t('NQ', utc(2026, 10, 21, 14), utc(2026, 10, 21, 14, 5))] });
      assert.equal(r.covered, 1);
      assert.equal(existsSync(path.join(R.dir, 'queue.json')), true, 'kolejka zapisana na dysku (przetrwa restart)');
      assert.deepEqual((await R.A.log()).log, [], 'enqueue nie wychodzi do sieci');
    } finally { R.stop(); }
  });

  test('wykresy-04: P25: kolejka: najnowsze najpierw, okno przed availableEnd czeka bez get_cost, dobowy sufit zatrzymuje resztę, następnego dnia kontynuacja, 1s jako ohlcv-1s', async () => {
    const R = await direct({ cfg: { chartDailyLimitUsd: 1 }, atrapa: { cost: 0.4 } });
    try {
      const wOld = win(utc(2026, 10, 20, 14), utc(2026, 10, 20, 14, 30)), wMid = win(utc(2026, 10, 22, 14), utc(2026, 10, 22, 14, 30));
      const wNew = win(D26 + 14 * 3600, D26 + 14 * 3600 + 1800), wFuture = win(utc(2026, 10, 27, 11), utc(2026, 10, 27, 11, 30));
      R.C.enqueue({ windows: [wOld, wFuture, wNew, wMid] });
      const t1 = await R.C.tick();
      assert.equal(t1.done, 2);
      const rg = (await calls(R.A, 'get_range')).map((e) => e.params.start);
      assert.deepEqual(rg, ['2026-10-26T14:00:00Z', '2026-10-22T14:00:00Z'], 'najnowsze najpierw, najstarsze zatrzymane dobowym sufitem 1 USD');
      assert.ok((await calls(R.A, 'get_range')).every((e) => e.params.schema === 'ohlcv-1s'));
      assert.ok(!(await R.A.log()).log.some((e) => e.params.start?.startsWith('2026-10-27T11')), 'okno po availableEnd: zero get_cost i get_range');
      let q = R.C.status().queue;
      assert.equal(q.pending, 2); assert.equal(q.reason, 'daily-limit'); assert.match(q.message, /jutra/);
      assert.equal(R.C.spentToday(), 0.8);
      // ten sam dzień: nadal nic nowego do pobrania
      await R.C.tick();
      assert.equal((await calls(R.A, 'get_range')).length, 2);
      // następna doba UTC: najstarsze przechodzi, okno z przyszłości dalej czeka
      R.st.clock += 86400_000;
      assert.equal((await R.C.tick()).done, 1);
      q = R.C.status().queue;
      assert.equal(q.pending, 1); assert.equal(q.reason, 'waiting'); assert.equal(q.items[0].to, utc(2026, 10, 27, 11, 30)); assert.ok(q.items[0].retryAfter > q.items[0].to);
      // koniec danych się przesuwa (po wygaśnięciu cache 15 min) i ostatnie okno wchodzi
      await R.A.config({ end: '2026-10-27T13:00:00.000000000Z' });
      R.st.clock += 16 * 60_000;
      assert.equal((await R.C.tick()).done, 1);
      q = R.C.status().queue;
      assert.equal(q.pending, 0); assert.equal(q.reason, null);
      assert.equal((await calls(R.A, 'get_range')).length, 4);
      assert.deepEqual((await R.A.log()).violations, []);
      assert.equal(R.C.credit().spentUsd, 1.62, 'kredyt liczy faktycznie pobrane okna');
      const read = R.C.read({ instrument: 'ES', from: String(wNew.from), to: String(wNew.to), tf: '1s' });
      assert.equal(read.layer, '1s'); assert.equal(read.bars.length, 30); assert.deepEqual(read.missing, []);
    } finally { R.stop(); }
  });

  test('wykresy-04: P25: wycena okna ponad limit na pobranie blokuje tylko to okno; zmiana limitu odblokowuje; reszta kolejki idzie dalej', async () => {
    const R = await direct({ atrapa: { cost: 1.5 } });
    try {
      R.C.enqueue({ windows: [win(utc(2026, 10, 26, 14), utc(2026, 10, 26, 14, 30))] });
      await R.C.tick();
      assert.equal((await calls(R.A, 'get_range')).length, 0);
      let q = R.C.status().queue;
      assert.equal(q.blocked, 1); assert.equal(q.pending, 0); assert.match(q.items[0].reason, /przekracza limit 1 USD/);
      assert.equal(R.C.setLimit({ maxCostUsd: 2 }).limitUsd, 2);
      q = R.C.status().queue;
      assert.equal(q.blocked, 0); assert.equal(q.pending, 1);
      await R.C.tick();
      assert.equal((await calls(R.A, 'get_range')).length, 1);
      assert.equal(R.C.status().queue.pending, 0);
    } finally { R.stop(); }
  });

  test('wykresy-04: P25: strażnik kredytu: wycena > pozostały kredyt → odrzut przed get_range; licznik dolicza tylko faktyczne pobrania; wycena tuż przed pobraniem też pod strażnikiem', async () => {
    const R = await direct({ cfg: { chartCredit: { startUsd: 0.5, expires: '2027-04-27', spentUsd: 0 } }, atrapa: { cost: 0.6 } });
    try {
      const body = { instrument: 'ES', from: String(D26), to: String(D26 + 3600), confirmedCostUsd: 0.6 };
      const qt = await R.C.quote(body);
      assert.equal(qt.overCredit, true); assert.equal(qt.credit.leftUsd, 0.5);
      await assert.rejects(R.C.fetchDays(body), (e) => e.code === 'credit' && e.status === 409 && /0\.6000.*0\.5000/.test(e.message));
      assert.equal((await calls(R.A, 'get_range')).length, 0);
      assert.equal(R.C.credit().spentUsd, 0, 'wyceny nic nie kosztują ani nie zmieniają licznika');
      assert.equal(R.C.status().running, false, 'blokada zwolniona');
      // kredyt 1 USD, trzy pobrania po 0,4: dwa przechodzą, trzecie nie
      R.st.cfg.chartCredit.startUsd = 1;
      await A_cost(R, 0.4);
      for (const k of [0, 1]) {
        const b = { instrument: 'ES', from: String(D26 + k * 7200), to: String(D26 + k * 7200 + 3600), confirmedCostUsd: 0.4 };
        assert.equal((await R.C.fetchDays(b)).started, true); await R.idle();
        assert.equal(R.C.status().error, null);
      }
      assert.equal(R.C.credit().spentUsd, 0.8); assert.equal(R.C.credit().leftUsd, 0.2);
      assert.equal((await calls(R.A, 'get_range')).length, 2);
      await assert.rejects(R.C.fetchDays({ instrument: 'ES', from: String(D26 + 14400), to: String(D26 + 18000), confirmedCostUsd: 0.4 }), (e) => e.code === 'credit');
      assert.equal((await calls(R.A, 'get_range')).length, 2); assert.equal(R.C.credit().spentUsd, 0.8);
      // wyścig: wycena planowa mieści się w kredycie (0,4 ≤ 0,405), świeża wycena tuż przed get_range (0,41, w tolerancji 5%) już nie
      R.st.cfg.chartCredit = { startUsd: 0.405, expires: '2027-04-27', spentUsd: 0 };
      await A_cost(R, null, [0.4, 0.41]);
      assert.equal((await R.C.fetchDays({ instrument: 'ES', from: String(D26 + 20000), to: String(D26 + 23600), confirmedCostUsd: 0.4 })).started, true); await R.idle();
      assert.equal(R.C.status().error.code, 'credit');
      assert.equal((await calls(R.A, 'get_range')).length, 0, 'ostatni strażnik zatrzymał przed get_range (log po reset)'); assert.equal(R.C.credit().spentUsd, 0);
    } finally { R.stop(); }
  });
  const A_cost = (R, cost, costs = []) => R.A.reset().then(() => R.A.config({ ...(cost != null ? { cost } : {}), costs }));

  test('wykresy-04: P25: strażnik kredytu: po dacie wygaśnięcia odrzut (fetch i kolejka), dzień przed jeszcze działa; edycja kredytu i daty z walidacją; komentarz z datą i cytatem P25', async () => {
    const R = await direct({ clock: Date.UTC(2027, 3, 26, 0, 0, 0), atrapa: { cost: 0.01 } });
    try {
      const body = { instrument: 'ES', from: String(D26), to: String(D26 + 3600), confirmedCostUsd: 0.01 };
      await assert.rejects(R.C.fetchDays(body), (e) => e.code === 'credit-expired' && /2027-04-26/.test(e.message));
      R.C.enqueue({ windows: [win(D26 + 14 * 3600, D26 + 14 * 3600 + 1800)] });
      await R.C.tick();
      assert.equal(R.C.status().queue.reason, 'credit'); assert.equal(R.C.status().queue.pending, 1, 'okno zostaje w kolejce');
      assert.equal((await calls(R.A, 'get_range')).length, 0);
      R.st.clock = Date.UTC(2027, 3, 25, 23, 59, 59);
      assert.equal((await R.C.fetchDays(body)).started, true); await R.idle();
      assert.equal(R.C.status().error, null);
      // edycja
      assert.equal(R.C.setLimit({ creditExpires: '2027-06-01', confirm: true }).credit.expires, '2027-06-01');
      assert.equal(R.C.setLimit({ creditStartUsd: 50, creditSpentUsd: 10, confirm: true }).credit.leftUsd, 40);
      assert.deepEqual(R.st.cfg.chartCredit, { startUsd: 50, expires: '2027-06-01', spentUsd: 10 });
      for (const bad of [{ creditExpires: '2027-13-40' }, { creditExpires: '01.06.2027' }, { creditStartUsd: 0 }, { creditStartUsd: -1 }, { creditSpentUsd: -1 }, { creditSpentUsd: '5' }, { creditStartUsd: 20000 }]) assert.throws(() => R.C.setLimit(bad), (e) => e.status === 400, JSON.stringify(bad));
      const src = readFileSync(path.join(ROOT, 'lib/candles.mjs'), 'utf8');
      assert.match(src, /27\.10\.2026[\s\S]{0,700}sie upewniaj ze wszystko jest pobierane z darmowych kredytow/);
      assert.match(src, /nie ma endpointu salda/);
    } finally { R.stop(); }
  });

  test('wykresy-04: P25: import historii 1m: wycena po miesiącach bez pobierania, przerwanie w połowie, wznowienie pobiera tylko resztę, trzeci przebieg nic', async () => {
    const R = await direct({ atrapa: { cost: 0.002 } });
    try {
      const S = await mod('lib/candles-store.mjs');
      const from = utc(2026, 8, 20), end = utc(2026, 10, 27, 10);
      const dry = await R.C.importHistory({ instrument: 'MES', from, chunk: 'month', dryRun: true });
      assert.equal(dry.dryRun, true); assert.equal(dry.runs, 3); assert.equal(dry.totalUsd, 0.006); assert.equal(dry.withinLimits, true);
      assert.deepEqual(dry.chunks.map((c) => [c.from, c.to]), [[from, utc(2026, 9, 1)], [utc(2026, 9, 1), utc(2026, 10, 1)], [utc(2026, 10, 1), end]]);
      let L = await R.A.log();
      assert.equal(L.log.filter((e) => e.path.endsWith('get_range')).length, 0, 'wycena nie pobiera');
      assert.ok(L.log.filter((e) => e.path.endsWith('get_cost')).every((e) => e.params.schema === 'ohlcv-1m' && e.params.symbols === 'ES.v.0'));
      assert.equal(R.C.status().running, false);
      await assert.rejects(R.C.importHistory({ instrument: 'ES', from }), (e) => e.code === 'no-quote' && e.status === 400);
      // przerwanie: dwa udane pobrania, trzecie 429
      await R.A.config({ failRangeAfter: 2 });
      assert.equal((await R.C.importHistory({ instrument: 'ES', from, chunk: 'month', confirmedCostUsd: 0.006 })).started, true); await R.idle();
      assert.equal(R.C.status().error.code, 'rate-limit'); assert.equal(R.C.status().done, 2);
      assert.deepEqual(S.readCoverage('ES', { baseDir: R.dir })['1m'], [[from, utc(2026, 10, 1)]], 'zapisane to, co się udało');
      assert.equal(R.C.credit().spentUsd, 0.026);
      // wznowienie: tylko brakujący miesiąc
      await R.A.config({ failRangeAfter: null }); await R.A.reset();
      const rs = await R.C.importHistory({ instrument: 'ES', from, chunk: 'month', confirmedCostUsd: 0.002 });
      assert.equal(rs.started, true); assert.equal(rs.runs, 1); await R.idle();
      assert.equal(R.C.status().error, null);
      const gr = await calls(R.A, 'get_range');
      assert.equal(gr.length, 1); assert.equal(gr[0].params.start, '2026-10-01T00:00:00Z'); assert.equal(gr[0].params.end, '2026-10-27T10:00:00Z');
      assert.deepEqual(S.readCoverage('ES', { baseDir: R.dir })['1m'], [[from, end]], 'ciągłe pokrycie');
      assert.equal(R.C.credit().spentUsd, 0.028);
      // idempotencja
      await R.A.reset();
      const again = await R.C.importHistory({ instrument: 'ES', from, chunk: 'month', confirmedCostUsd: 0 });
      assert.equal(again.nothing, true); assert.equal(again.started, false);
      assert.deepEqual((await R.A.log()).log.filter((e) => /get_cost|get_range/.test(e.path)), [], 'nic do pobrania = zero żądań cenowych');
      assert.deepEqual((await R.A.log()).violations, []);
    } finally { R.stop(); }
  });

  test('wykresy-04: P25: import ponad limity aplikacji wymaga jawnej kwoty; kwota za mała i ponad 50 USD odrzucone; podniesienie tylko na ten import; kredyt blokuje mimo podniesienia', async () => {
    const R = await direct({ atrapa: { cost: 15 } });
    try {
      const from = utc(2026, 8, 20);
      const dry = await R.C.importHistory({ instrument: 'ES', from, chunk: 'month', dryRun: true });
      assert.equal(dry.totalUsd, 45); assert.equal(dry.withinLimits, false);
      const base = { instrument: 'ES', chunk: 'month', from, confirmedCostUsd: 45 };
      await assert.rejects(R.C.importHistory(base), (e) => e.code === 'needs-override' && /limitsOverrideUsd/.test(e.message) && /45\.0000/.test(e.message));
      await assert.rejects(R.C.importHistory({ ...base, limitsOverrideUsd: 40 }), (e) => e.code === 'override-too-small');
      for (const bad of [51, 0, -5, '50', NaN]) await assert.rejects(R.C.importHistory({ ...base, limitsOverrideUsd: bad }), (e) => e.status === 400, String(bad));
      await assert.rejects(R.C.importHistory({ ...base, confirmedCostUsd: 10, limitsOverrideUsd: 50 }), (e) => e.code === 'cost-changed');
      assert.equal((await calls(R.A, 'get_range')).length, 0, 'żadne odrzucenie nie pobrało');
      assert.equal(R.C.status().running, false);
      assert.equal((await R.C.importHistory({ ...base, limitsOverrideUsd: 50 })).started, true); await R.idle();
      assert.equal(R.C.status().error, null); assert.equal(R.C.status().result.costUsd, 45);
      assert.equal((await calls(R.A, 'get_range')).length, 3);
      assert.equal(R.C.credit().spentUsd, 45.02); assert.equal(R.C.credit().leftUsd, 79.98);
      assert.equal(R.st.cfg.chartSpend.usd, 45, 'import liczy się też do dobowego licznika');
      assert.equal(R.st.cfg.chartCostLimitUsd, undefined, 'podniesienie nie zapisane w konfiguracji');
      // zwykłe pobranie po imporcie znów pod limitem 1 USD
      await assert.rejects(R.C.fetchDays({ instrument: 'ES', from: String(utc(2026, 10, 26)), to: String(utc(2026, 10, 26, 1)), confirmedCostUsd: 15, layer: '1s' }), (e) => e.code === 'over-limit');
    } finally { R.stop(); }
    const R2 = await direct({ cfg: { chartCredit: { startUsd: 10, expires: '2027-04-27', spentUsd: 0 } }, atrapa: { cost: 15 } });
    try {
      await assert.rejects(R2.C.importHistory({ instrument: 'ES', from: utc(2026, 8, 20), chunk: 'month', confirmedCostUsd: 45, limitsOverrideUsd: 50 }), (e) => e.code === 'credit');
      assert.equal((await calls(R2.A, 'get_range')).length, 0, 'kredyt zostaje nawet przy podniesionych limitach');
    } finally { R2.stop(); }
  });

  test('wykresy-04: P25: luki w sekundach: okno 1s z lukami, 15 s bez zmyślonych kubełków, TF<1m poza oknem pusty, 1m z serwera jest źródłem (1s jej nie nadpisuje)', async () => {
    const W0 = utc(2026, 10, 26, 14), G = W0 + 600;
    const R = await direct({ atrapa: { step: 1, gaps: [[G, G + 60]], cost: 0.01 } });
    try {
      const S = await mod('lib/candles-store.mjs');
      R.C.enqueue({ windows: [win(W0, W0 + 1800)] });
      await R.C.tick();
      const q = { instrument: 'ES', from: String(W0), to: String(W0 + 1800) };
      const raw = S.readRange('ES', '1s', W0, W0 + 1800, { baseDir: R.dir });
      assert.equal(raw.length, 1740, 'minuta bez transakcji nie ma ani jednej sekundy');
      assert.ok(!raw.some((b) => b[0] >= G && b[0] < G + 60));
      const s15 = R.C.read({ ...q, tf: '15s' });
      assert.equal(s15.bars.length, 116, '120 kubełków 15 s minus 4 puste');
      assert.ok(!s15.bars.some((b) => b[0] >= G && b[0] < G + 60));
      assert.deepEqual(s15.missing, [], 'luka w sekundach to nie brak pokrycia');
      // 1m w oknie bez warstwy 1m: z agregacji w pamięci, z dziurą w pustej minucie, nic nie zapisane
      const m = R.C.read({ ...q, tf: '1m' });
      assert.equal(m.layer, '1m'); assert.equal(m.bars.length, 29); assert.deepEqual(m.derived, [[W0, W0 + 1800]]);
      assert.deepEqual(S.readCoverage('ES', { baseDir: R.dir })['1m'], []); assert.equal(existsSync(path.join(R.dir, 'candles/ES/1m')), false, 'warstwa 1m nie powstała z 1s');
      // TF < 1m poza oknem: tylko warstwa 1s, pusto
      const out = R.C.read({ instrument: 'ES', from: String(W0 - 7200), to: String(W0 - 3600), tf: '30s' });
      assert.deepEqual(out.bars, []); assert.equal(out.layer, '1s'); assert.deepEqual(out.missing, [[W0 - 7200, W0 - 3600]]);
      // 1m z serwera (wartości rozpoznawalne) wygrywa z agregatem 1s
      const mins = Array.from({ length: 30 }, (_, i) => [W0 + i * 60, 500000, 500100, 499900, 500050, 777]);
      S.writeRange('ES', '1m', W0, W0 + 1800, mins, {}, { baseDir: R.dir });
      const m2 = R.C.read({ ...q, tf: '1m' });
      assert.equal(m2.bars.length, 30); assert.deepEqual(m2.derived, []); assert.ok(m2.bars.every((b) => b[5] === 777));
      const m5 = R.C.read({ ...q, tf: '5m' });
      assert.equal(m5.bars[0][5], 777 * 5, '5m z warstwy 1m');
      assert.equal(R.C.read({ ...q, tf: '15s' }).bars.length, 116, 'warstwa 1s nietknięta');
    } finally { R.stop(); }
  });

  test('wykresy-04: P25: nic nie startuje samo: createCandles z zapisaną kolejką i kluczem nie robi żadnego żądania; moduł bez timerów', async () => {
    const R = await direct();
    try {
      mkdirSync(R.dir, { recursive: true });
      writeFileSync(path.join(R.dir, 'queue.json'), JSON.stringify({ items: [{ id: 'ES-1-2', instrument: 'ES', from: D26, to: D26 + 1800, state: 'pending', reason: null, attempts: 0, addedAt: 1 }], reason: null, lastRunAt: null }));
      const { createCandles } = await mod('lib/candles.mjs');
      const C2 = createCandles({ getKey: () => KEY, getConfig: () => ({}), baseDir: R.dir, now: () => R.st.clock });
      assert.equal(C2.status().queue.pending, 1);
      await sleep(300);
      assert.deepEqual((await R.A.log()).log, [], 'zero żądań bez tick()');
      const src = readFileSync(path.join(ROOT, 'lib/candles.mjs'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
      assert.ok(!/setInterval|setTimeout/.test(src));
      assert.match(readFileSync(path.join(ROOT, 'server.mjs'), 'utf8'), /setInterval\(\(\) => \{ candles\.tick\(\)/);
    } finally { R.stop(); }
  });

  test('wykresy-04: P25: trasy windows/queue-run/import tylko przez guardWrite (403), okna z trade\'ów trafiają do magazynu, status z kolejką i kredytem, meta z kredytem; skrypt CLI: wycena domyślnie, pobranie dopiero z kwotą', async () => {
    const dir = H.tmp();
    const A = await H.atrapaDb(++port);
    const S = await H.server(++port, { THQ_CONFIG_DIR: dir, DATABENTO_API_BASE: A.base, DATABENTO_API_KEY: KEY });
    const get = async (p) => (await fetch(S.base + p)).json();
    const post = (p, b) => H.dash(S.base, p, b);
    const waitQueue = async () => { for (let i = 0; i < 200; i++) { const s = await get('/api/candles/status'); if (!s.running && s.queue.pending === 0) return s; await sleep(50); } throw new Error('kolejka nie kończy się'); };
    try {
      for (const p of ['windows', 'queue-run', 'import']) {
        const raw = await fetch(S.base + '/api/candles/' + p, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
        assert.equal(raw.status, 403, p);
        assert.equal((await H.dash(S.base, '/api/candles/' + p, {}, { origin: 'http://evil.example' })).status, 403, p + ' obcy Origin');
      }
      assert.deepEqual((await A.log()).log, []);
      const trade = { instrument: 'MES', entry: D26 + 14 * 3600, exit: D26 + 14 * 3600 + 600 };
      const r = await post('/api/candles/windows', { trades: [trade] });
      assert.equal(r.status, 200); assert.equal(r.j.queued, 1);
      const st = await waitQueue();
      assert.equal(st.queue.pending, 0); assert.equal(st.credit.startUsd, 125); assert.equal(st.error, null);
      const gr = await calls(A, 'get_range');
      assert.equal(gr.length, 1); assert.equal(gr[0].params.schema, 'ohlcv-1s'); assert.equal(gr[0].params.start, '2026-10-26T13:30:00Z'); assert.equal(gr[0].params.end, '2026-10-26T14:40:00Z');
      const g = await get('/api/candles?' + new URLSearchParams({ instrument: 'ES', from: String(trade.entry - 1800), to: String(trade.exit + 1800), tf: '1s' }));
      assert.equal(g.layer, '1s'); assert.equal(g.bars.length, 70, 'atrapa: świeca co 60 s w 70 minutach'); assert.deepEqual(g.missing, []);
      const meta = await get('/api/meta');
      assert.equal(meta.chartCredit.expires, '2027-04-26'); assert.ok(meta.chartCredit.leftUsd < 125 && meta.chartCredit.leftUsd > 124.9);
      assert.ok(!JSON.stringify(meta).includes(KEY) && !JSON.stringify(st).includes(KEY));
      // import: wycena przez trasę
      const imp = await post('/api/candles/import', { instrument: 'ES', from: utc(2026, 10, 20), to: utc(2026, 10, 22), dryRun: true });
      assert.equal(imp.status, 200); assert.equal(imp.j.dryRun, true); assert.equal(imp.j.runs, 1);
      // CLI: domyślnie sama wycena
      const cli = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'narzedzia/import-historii-1m.mjs'), `--port=${S.base.split(':').pop()}`, ...args], { env: H.cleanEnv(), encoding: 'utf8', timeout: 60_000 });
      const nGr = (await calls(A, 'get_range')).length;
      const c1 = cli('--instrument=ES', '--od=2026-10-20', '--do=2026-10-22');
      assert.equal(c1.status, 0, c1.stderr); assert.match(c1.stdout, /Tryb wyceny: nic nie pobrano/);
      assert.equal((await calls(A, 'get_range')).length, nGr, 'CLI bez kwoty nie pobiera');
      assert.equal(cli('--instrument=ES', '--limity-do-usd=5').status, 1, 'limity bez potwierdzenia kwoty');
      assert.equal(cli('--instrument=XX').status, 1);
      assert.equal(cli('--instrument=ES', '--potwierdzam-usd=0.0001', '--od=2026-10-20', '--do=2026-10-22').status, 1, 'wycena wyższa niż potwierdzona');
      assert.equal((await calls(A, 'get_range')).length, nGr);
      const c2 = cli('--instrument=ES', '--od=2026-10-20', '--do=2026-10-22', '--potwierdzam-usd=0.002');
      assert.equal(c2.status, 0, c2.stdout + c2.stderr); assert.match(c2.stdout, /ES: gotowe, dodano 2880 świec/);
      assert.equal((await calls(A, 'get_range')).length, nGr + 1);
      const c3 = cli('--instrument=ES', '--od=2026-10-20', '--do=2026-10-22', '--potwierdzam-usd=0.002');
      assert.equal(c3.status, 0); assert.match(c3.stdout, /wszystko już pobrane/);
      assert.equal((await calls(A, 'get_range')).length, nGr + 1, 'drugi przebieg idempotentny');
      assert.ok(!(c1.stdout + c2.stdout + S.p.out + S.p.err).includes(KEY));
      assert.deepEqual((await A.log()).violations, []);
    } finally { S.stop(); A.stop(); }
  });

  test('wykresy-04: P25 poprawka: licznik kredytu i dobowy rosną PRZED get_range (timeout, błąd CSV), zapis natychmiast, po sukcesie bez dublowania', async () => {
    // timeout: fetch do get_range rzuca TimeoutError; w chwili wysyłania licznik już jest podniesiony i zapisany
    let seen = null;
    let R;
    R = await direct({ atrapa: { cost: 0.4 }, fetchImpl: async (url, opts) => {
      if (String(url).endsWith('timeseries.get_range')) { seen = { credit: R.st.cfg.chartCredit?.spentUsd, saved: R.saved.length }; throw Object.assign(new Error('czas'), { name: 'TimeoutError' }); }
      return fetch(url, opts);
    } });
    try {
      const body = { instrument: 'ES', from: String(D26), to: String(D26 + 3600), confirmedCostUsd: 0.4 };
      assert.equal((await R.C.fetchDays(body)).started, true); await R.idle();
      assert.equal(R.C.status().error.code, 'timeout');
      assert.deepEqual(seen, { credit: 0.42, saved: 1 }, 'przed wysłaniem: 0,02 + 0,4 i natychmiastowy zapis');
      assert.equal(R.C.credit().spentUsd, 0.42); assert.equal(R.st.cfg.chartSpend.usd, 0.4);
      assert.equal(R.saved.length, 1, 'jeden zapis natychmiastowy na pobranie');
    } finally { R.stop(); }
    // błąd CSV w odpowiedzi: pieniądze mogły zostać naliczone
    const R2 = await direct({ atrapa: { cost: 0.4, header: ['ts_event', 'open'] } });
    try {
      const body = { instrument: 'ES', from: String(D26), to: String(D26 + 3600), confirmedCostUsd: 0.4 };
      assert.equal((await R2.C.fetchDays(body)).started, true); await R2.idle();
      assert.equal(R2.C.status().error.code, 'bad-csv');
      assert.equal(R2.C.credit().spentUsd, 0.42); assert.equal(R2.st.cfg.chartSpend.usd, 0.4);
      // udane pobranie liczy się raz (0,4), nie dwa razy
      await R2.A.config({ header: ['ts_event', 'rtype', 'publisher_id', 'instrument_id', 'open', 'high', 'low', 'close', 'volume'] });
      const b2 = { ...body, from: String(D26 + 7200), to: String(D26 + 10800) };
      assert.equal((await R2.C.fetchDays(b2)).started, true); await R2.idle();
      assert.equal(R2.C.status().error, null); assert.equal(R2.C.credit().spentUsd, 0.82);
    } finally { R2.stop(); }
  });

  test('wykresy-04: P25 poprawka: zmiana kredytu wymaga confirm:true, start <= 125, licznik wydatków nie maleje bez potwierdzenia; domyślnie 2027-04-26 i 0,02 USD', async () => {
    const R = await direct();
    try {
      assert.equal(R.C.credit().expires, '2027-04-26'); assert.equal(R.C.credit().spentUsd, 0.02); assert.equal(R.C.credit().leftUsd, 124.98);
      for (const b of [{ creditStartUsd: 100 }, { creditSpentUsd: 0 }, { creditExpires: '2027-06-01' }, { creditSpentUsd: 0, confirm: 'true' }, { creditSpentUsd: 0, confirm: 1 }]) {
        assert.throws(() => R.C.setLimit(b), (e) => e.status === 400 && e.code === 'confirm-required', JSON.stringify(b));
      }
      assert.equal(R.st.cfg.chartCredit, undefined, 'nic nie zapisano');
      assert.throws(() => R.C.setLimit({ creditStartUsd: 126, confirm: true }), (e) => e.status === 400 && /125/.test(e.message));
      assert.equal(R.C.setLimit({ creditSpentUsd: 5, confirm: true }).credit.spentUsd, 5);
      assert.throws(() => R.C.setLimit({ creditSpentUsd: 1 }), (e) => e.code === 'confirm-required', 'cofnięcie licznika w dół bez potwierdzenia');
      assert.equal(R.C.setLimit({ creditSpentUsd: 1, confirm: true }).credit.spentUsd, 1);
      assert.equal(R.C.setLimit({ maxCostUsd: 2 }).limitUsd, 2, 'zwykłe limity bez potwierdzenia');
    } finally { R.stop(); }
  });

  test('wykresy-04: P25 poprawka: równoległy tick i fetchDays: dokładnie jeden get_range (w obu kolejnościach)', async () => {
    for (const order of ['fetch-first', 'tick-first']) {
      const R = await direct({ atrapa: { cost: 0.01 } });
      try {
        R.C.enqueue({ windows: [win(D26 + 14 * 3600, D26 + 14 * 3600 + 1800)] });
        const body = { instrument: 'ES', from: String(D26), to: String(D26 + 3600), confirmedCostUsd: 0.01, layer: '1s' };
        const run = order === 'fetch-first' ? [R.C.fetchDays(body), R.C.tick()] : [R.C.tick(), R.C.fetchDays(body)];
        const res = await Promise.allSettled(run);
        await R.idle();
        assert.equal((await calls(R.A, 'get_range')).length, 1, order);
        assert.ok(res.some((r) => (r.status === 'rejected' ? r.reason.code === 'running' : r.value.skipped === 'busy')), order + ': drugie wywołanie odbite blokadą');
      } finally { R.stop(); }
    }
  });

  test('wykresy-04: P25 poprawka: enqueue zachowuje stan zablokowanej pozycji i licznik prób; usuwanie po id, nie po referencji', async () => {
    const R = await direct({ atrapa: { cost: 1.5 } });
    try {
      R.C.enqueue({ windows: [win(utc(2026, 10, 26, 14), utc(2026, 10, 26, 14, 30))] });
      await R.C.tick();
      assert.equal(R.C.status().queue.blocked, 1);
      const r = R.C.enqueue({ windows: [win(utc(2026, 10, 26, 14, 45), utc(2026, 10, 26, 15, 15))] }); // bliskie: scala się z zablokowanym
      assert.equal(r.queued, 1);
      const q = R.C.status().queue;
      assert.equal(q.blocked, 1, 'zablokowana nie wraca do pending'); assert.equal(q.pending, 0);
      assert.equal(q.items[0].attempts, 1); assert.match(q.items[0].reason, /przekracza limit/); assert.equal(q.items[0].to, utc(2026, 10, 26, 15, 15));
      await R.C.tick();
      assert.equal((await calls(R.A, 'get_range')).length, 0, 'zablokowana nie jest pobierana');
    } finally { R.stop(); }
    // enqueue w trakcie pobierania odtwarza obiekty pozycji (to samo id): pobrana pozycja i tak znika z kolejki
    let R2;
    R2 = await direct({ atrapa: { cost: 0.01 }, fetchImpl: async (url, opts) => {
      if (String(url).endsWith('timeseries.get_range')) R2.C.enqueue({ windows: [win(utc(2026, 10, 20, 14), utc(2026, 10, 20, 14, 30))] });
      return fetch(url, opts);
    } });
    try {
      R2.C.enqueue({ windows: [win(utc(2026, 10, 26, 14), utc(2026, 10, 26, 14, 30))] });
      const t = await R2.C.tick();
      assert.equal(t.done, 1);
      const q = R2.C.status().queue;
      assert.equal(q.pending, 1, 'zostało tylko okno dodane w trakcie'); assert.equal(q.items[0].from, utc(2026, 10, 20, 14));
    } finally { R2.stop(); }
  });

  test('wykresy-04: P25 poprawka: QUEUE_MAX zostawia najświeższe okna i raportuje liczbę odciętych; kształt paczki nadal waliduje', async () => {
    const R = await direct();
    try {
      const K = await mod('lib/candles.mjs');
      assert.equal(K.QUEUE_MAX, 2000);
      const MINF = 1275782400;
      let last;
      for (let c = 0; c < 5; c++) last = R.C.enqueue({ windows: Array.from({ length: 440 }, (_, i) => win(MINF + (c * 440 + i) * 86400 * 2, MINF + (c * 440 + i) * 86400 * 2 + 1800)) });
      assert.equal(last.queued, 2000); assert.equal(last.dropped, 200);
      const q = R.C.status().queue;
      assert.equal(q.dropped, 200); assert.equal(q.pending, 2000);
      assert.equal(q.items[0].from, MINF + 2199 * 86400 * 2, 'najświeższe zostało');
      const all = JSON.parse(readFileSync(path.join(R.dir, 'queue.json'), 'utf8')).items;
      assert.equal(Math.min(...all.map((i) => i.from)), MINF + 200 * 86400 * 2, 'odcięte są najstarsze');
    } finally { R.stop(); }
  });

  test('wykresy-04: P25 poprawka: odczyt filtruje świece do pokrycia warstwy: zbłąkana świeca 1m poza pokryciem nie dubluje czasu z agregatu 1s', async () => {
    const R = await direct();
    try {
      const S = await mod('lib/candles-store.mjs');
      const W0 = utc(2026, 10, 26, 14), o = { baseDir: R.dir };
      S.writeRange('ES', '1s', W0, W0 + 120, [[W0, 100, 101, 99, 100, 1], [W0 + 61, 100, 102, 99, 101, 2]], {}, o);
      S.writeRange('ES', '1m', W0, W0 + 120, [[W0, 999, 999, 999, 999, 9], [W0 + 60, 777, 777, 777, 777, 7]], {}, o);
      // symulacja awarii: świeca W0+60 zapisana w pliku, a pokrycie 1m obejmuje tylko pierwszą minutę
      const f = path.join(R.dir, 'candles/ES/coverage.json');
      const cov = JSON.parse(readFileSync(f, 'utf8')); cov['1m'] = [[W0, W0 + 60]];
      writeFileSync(f, JSON.stringify(cov));
      const m = R.C.read({ instrument: 'ES', from: String(W0), to: String(W0 + 120), tf: '1m' });
      assert.deepEqual(m.bars.map((b) => b[0]), [W0, W0 + 60], 'bez duplikatów czasu');
      assert.equal(m.bars[0][1], 9.99, 'minuta pokryta: z serwera'); assert.equal(m.bars[1][1], 1, 'minuta niepokryta: z agregatu 1s, nie zbłąkana 777');
      assert.deepEqual(m.derived, [[W0 + 60, W0 + 120]]);
    } finally { R.stop(); }
  });

  // fetchImpl z błędami: pierwsze `skip` wycen przechodzi, kolejne `n` kończy się TimeoutError, potem znów działa
  const flaky = (fault) => async (url, opts) => {
    if (String(url).endsWith('metadata.get_cost')) {
      if (fault.skip > 0) fault.skip--;
      else if (fault.n > 0) { fault.n--; throw Object.assign(new Error('czas'), { name: 'TimeoutError' }); }
    }
    return fetch(url, opts);
  };

  test('wykresy-04: P25 timeout wyceny: import, fetch i kolejka zawsze zwalniają blokadę i ustawiają status.error; kolejne wywołanie działa', async () => {
    const fault = { skip: 1, n: 3 }; // wycena 1 ok, potem 3 timeouty pod rząd = pierwsza próba + 2 ponowienia
    const R = await direct({ atrapa: { cost: 0.002 }, fetchImpl: flaky(fault) });
    try {
      const body = { instrument: 'ES', from: utc(2026, 8, 20), chunk: 'month', dryRun: true };
      await assert.rejects(R.C.importHistory(body), (e) => e.code === 'timeout' && e.status === 504);
      let st = R.C.status();
      assert.equal(st.running, false); assert.equal(st.phase, 'idle'); assert.equal(st.error.code, 'timeout'); assert.ok(st.finishedAt);
      assert.equal((await calls(R.A, 'get_range')).length, 0);
      // kolejne wywołanie działa (błędy wyczerpane) i czyści błąd przy starcie
      const ok = await R.C.importHistory(body);
      assert.equal(ok.dryRun, true); assert.equal(ok.runs, 3);
      st = R.C.status(); assert.equal(st.running, false); assert.equal(st.error, null);
      // fetch: wszystkie próby wyceny kończą się timeoutem
      Object.assign(fault, { skip: 0, n: 3 });
      const fb = { instrument: 'ES', from: String(D26), to: String(D26 + 3600), confirmedCostUsd: 0.002 };
      await assert.rejects(R.C.fetchDays(fb), (e) => e.code === 'timeout');
      st = R.C.status(); assert.equal(st.running, false); assert.equal(st.error.code, 'timeout');
      assert.equal((await R.C.fetchDays(fb)).started, true); await R.idle();
      assert.equal(R.C.status().error, null);
      // kolejka: timeout wyceny okna zatrzymuje przebieg bez blokady, okno zostaje, następny tick je pobiera
      R.C.enqueue({ windows: [win(D26 + 20 * 3600, D26 + 20 * 3600 + 1800)] });
      Object.assign(fault, { skip: 0, n: 3 });
      await R.C.tick();
      st = R.C.status(); assert.equal(st.running, false); assert.equal(st.queue.reason, 'network'); assert.equal(st.queue.pending, 1);
      assert.equal((await R.C.tick()).done, 1); assert.equal(R.C.status().queue.pending, 0);
    } finally { R.stop(); }
  });

  test('wykresy-04: P25 timeout wyceny: ponowienie 2x ratuje wycenę importu (2 timeouty, trzecia próba ok); domyślna porcja to rok', async () => {
    const fault = { skip: 0, n: 2 };
    const R = await direct({ atrapa: { cost: 0.002 }, fetchImpl: flaky(fault) });
    try {
      const dry = await R.C.importHistory({ instrument: 'ES', from: utc(2026, 8, 20), chunk: 'month', dryRun: true });
      assert.equal(dry.runs, 3); assert.equal(dry.totalUsd, 0.006); assert.equal(fault.n, 0, 'oba timeouty zużyte na ponowienia jednej wyceny');
      // domyślnie porcje roczne: 2010-06-06 .. 2026-10-27 to 17 lat kalendarzowych = 17 wycen, nie ~200
      const full = await R.C.importHistory({ instrument: 'ES', dryRun: true });
      assert.equal(full.runs, 17); assert.equal(full.chunks[0].from, 1275782400); assert.equal(full.chunks[1].from, utc(2011, 1, 1));
      const costs = (await calls(R.A, 'get_cost')).filter((e) => e.params.schema === 'ohlcv-1m');
      assert.equal(costs.length, 20, '3 (miesięczny) + 17 (roczny); nieudane próby nie doszły do atrapy');
      await assert.rejects(R.C.importHistory({ instrument: 'ES', chunk: 'tydzien', dryRun: true }), (e) => e.status === 400);
      assert.equal(R.C.status().running, false);
    } finally { R.stop(); }
  });

  test('wykresy-04: P25 CLI: brak połączenia, zerwane połączenie i błąd HTTP serwera to trzy różne komunikaty', async () => {
    const http = await import('node:http');
    // asynchronicznie: serwery atrapy żyją w tym samym procesie, spawnSync zablokowałby ich pętlę zdarzeń
    const cli = (p) => new Promise((resolve) => {
      const c = spawn(process.execPath, [path.join(ROOT, 'narzedzia/import-historii-1m.mjs'), `--port=${p}`, '--instrument=ES'], { env: H.cleanEnv() });
      let stdout = '', stderr = '';
      c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; });
      const to = setTimeout(() => c.kill(), 30_000);
      c.on('close', (status) => { clearTimeout(to); resolve({ status, stdout, stderr }); });
    });
    const listen = (handler) => new Promise((res) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)); });
    // 1. nikt nie słucha
    const tmp = await listen(() => {});
    const closedPort = tmp.address().port; await new Promise((r) => tmp.close(r));
    const a = await cli(closedPort);
    assert.equal(a.status, 1); assert.match(a.stderr, /Nie można połączyć się z dashboardem/);
    // 2. serwer zrywa połączenie bez odpowiedzi
    const s2 = await listen((req) => req.socket.destroy());
    const b = await cli(s2.address().port); s2.close();
    assert.equal(b.status, 1); assert.match(b.stderr, /zerwane|przekroczono czas/); assert.doesNotMatch(b.stderr, /Nie można połączyć/);
    // 3. serwer odpowiada błędem HTTP 504 z komunikatem
    const s3 = await listen((req, res) => { res.writeHead(504, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Databento nie odpowiada (przekroczono czas 30 s).' })); });
    const c = await cli(s3.address().port); s3.close();
    assert.equal(c.status, 1); assert.match(c.stderr, /\(504\)/); assert.match(c.stderr, /Databento nie odpowiada/); assert.doesNotMatch(c.stderr, /Nie można połączyć|zerwane/);
    // 4. odpowiedź bez JSON
    const s4 = await listen((req, res) => { res.writeHead(502); res.end('Bad gateway'); });
    const d = await cli(s4.address().port); s4.close();
    assert.match(d.stderr, /\(502\)/); assert.match(d.stderr, /Bad gateway/);
  });
};
