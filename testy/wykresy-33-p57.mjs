// wykresy-33: P57 (3.11.2026), automatyczne pobieranie WSZYSTKICH minutówek (warstwa 1m) ES i NQ w kolejce. Słowa użytkownika: «zrob automatyczne pobieranie
// swiec sekundowych w oknie oraz wszystkich minutowych dla justjournal». Tylko atrapa Databento: przełącznik chart1mDaily domyślnie wyłączony (publiczne repo,
// cudzy kredyt), nadrabianie najwyżej 92 dni wstecz, końcowy brak krótszy niż godzina czeka, pełne pokrycie = zero żądań, roll dokłada warstwę kontraktu,
// zwykłe strażniki (limit dobowy, kredyt) wstrzymują bez pobrania, liczniki rosną o cenę.
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

export default ({ test, H, assert, ROOT }) => {
  let port = 5390;
  const KEY = 'db-test-key-0123456789abcdef';
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const at = (s) => Date.parse(s) / 1000;
  // wtorek 12.03.2024 20:00Z, dane Databento do 14:59Z
  const NOW = Date.UTC(2024, 2, 12, 20);
  const END = '2024-03-12T14:59:00.000000000Z';
  const ranges = async (A) => (await A.log()).log.filter((e) => e.path.endsWith('get_range')).map((e) => [e.params.symbols, e.params.schema, e.params.start, e.params.end]);
  const costs = async (A) => (await A.log()).log.filter((e) => e.path.endsWith('get_cost')).length;

  // v0: H4 od 13.12.2023, M4 od 13.03.2024 (po końcu danych): w zakresie 92 dni jest roll grudniowy i okno pomiaru rolla marcowego
  async function direct({ cfg: cfg0 = {}, clock = NOW, atrapa = {}, auto = true, fetchImpl, prep } = {}) {
    const cfg = 'chartCredit' in cfg0 ? cfg0 : { chartCredit: { ...H.TEST_CREDIT }, chart1mDaily: true, ...cfg0 };
    const A = await H.atrapaDb(++port);
    await A.config({ end: END, cost: 0.002, ...atrapa });
    const old = process.env.DATABENTO_API_BASE;
    process.env.DATABENTO_API_BASE = A.base;
    const { createCandles } = await lib('lib/candles.mjs');
    const S = await lib('lib/candles-store.mjs');
    const dir = H.tmp();
    const q = (y, m) => y * 4 + (m / 3 - 1);
    for (const n of ['nq', 'es']) S.writeAux('contracts-' + n, { resolvedTo: '2099-01-01', v0: [[at('2023-09-14T00:00:00Z'), q(2023, 12)], [at('2023-12-13T00:00:00Z'), q(2024, 3)], [at('2024-03-13T00:00:00Z'), q(2024, 6)]], names: {} }, { baseDir: dir });
    if (prep) await prep(dir);
    const st = { cfg, clock };
    const C = createCandles({ getKey: () => KEY, getConfig: () => st.cfg, baseDir: dir, now: () => st.clock, autoOpenWindows: auto, fetchImpl });
    const stop = () => { if (old === undefined) delete process.env.DATABENTO_API_BASE; else process.env.DATABENTO_API_BASE = old; A.stop(); };
    return { A, C, S, st, dir, stop };
  }

  test('wykresy-33: P57 wyłączony przełącznik (brak wpisu, false, nie-boolean) albo createCandles bez autoOpenWindows: zero zapytań do Databento', async () => {
    const cr = { chartCredit: { ...H.TEST_CREDIT } };
    for (const o of [{ cfg: { ...cr, chartNq1sDaily: true } }, { cfg: { ...cr, chart1mDaily: false } }, { cfg: { ...cr, chart1mDaily: 'tak' } }, { cfg: { ...cr, chart1mDaily: true }, auto: false }]) {
      const R = await direct(o);
      try {
        // okno 1s NQ (P50) może się pobrać, minutówek nie wolno
        await R.C.tick();
        assert.deepEqual((await R.A.log()).log.filter((e) => /get_range|get_cost/.test(e.path) && e.params.schema === 'ohlcv-1m'), [], JSON.stringify(o));
      } finally { R.stop(); }
    }
  });

  test('wykresy-33: P57 włączony: kolejka dokłada brak ES i NQ, pobiera do magazynu (seria i warstwy kontraktów po rollu), nie sięga dalej niż 92 dni, liczniki rosną o cenę, drugi przebieg = zero żądań', async () => {
    const R = await direct();
    try {
      const r1 = await R.C.tick();
      assert.equal(R.C.status().error, null, JSON.stringify(R.C.status().error));
      assert.equal(r1.done, 6, JSON.stringify(r1));
      const got = await ranges(R.A);
      assert.deepEqual([...new Set(got.map((x) => x[1]))], ['ohlcv-1m'], 'tylko minutówki');
      for (const sym of ['NQ', 'ES']) {
        assert.ok(got.some((x) => x[0] === `${sym}.v.0`), `${sym}: warstwa serii`);
        assert.ok(got.some((x) => x[0] === `${sym}H4`), `${sym}: roll w zakresie dokłada warstwę starego kontraktu (okno pomiaru rolla grudnia)`);
        assert.ok(got.some((x) => x[0] === `${sym}M4`), `${sym}: nowy kontrakt (okno pomiaru rolla marca)`);
      }
      // 92 dni przed 12.03.2024 20:00Z to 12.12.2023 20:00Z; okno pomiaru rolla sięga najwyżej tydzień wcześniej, dziura starsza nie jest pobierana
      assert.ok(got.every((x) => x[2] >= '2023-12-01T00:00:00Z'), 'nic starszego niż 92 dni (z oknem rolla): ' + [...got.map((x) => x[2])].sort()[0]);
      assert.ok(got.every((x) => x[3] <= '2024-03-12T14:59:00Z'), 'nie dalej niż availableEnd');
      for (const sym of ['NQ', 'ES']) {
        const cov = R.S.readCoverage(sym, { baseDir: R.dir });
        assert.ok(Object.keys(cov).some((k) => /1m/.test(k)), `${sym}: pokrycie w magazynie ${Object.keys(cov)}`);
      }
      assert.equal(R.C.status().queue.pending, 0);
      // licznik: każdy zakres (porcje miesięczne) po 0,002 USD
      const price = got.length * 0.002;
      assert.ok(got.length > 6, 'porcje miesięczne: więcej żądań niż pozycji (' + got.length + ')');
      assert.ok(Math.abs(R.st.cfg.chartSpend.usd - price) < 1e-9, JSON.stringify(R.st.cfg.chartSpend));
      assert.ok(Math.abs(R.st.cfg.chartCredit.spentUsd - price) < 1e-9, JSON.stringify(R.st.cfg.chartCredit));
      // D5: kwota w komunikatach ("pierwszy przebieg razem do ok. 0,80 USD") z liczby dni: zakresy obu instrumentów razem × cena roczna 1,29 USD / 365
      const days = got.reduce((a, x) => a + (Date.parse(x[3]) - Date.parse(x[2])) / 86400000, 0);
      assert.ok(days > 190 && days < 215, 'dni danych w pierwszym przebiegu: ' + days.toFixed(1));
      assert.ok(days * 1.29 / 365 < 0.80 && days * 1.29 / 365 > 0.6, 'koszt pierwszego przebiegu ' + (days * 1.29 / 365).toFixed(3) + ' USD mieści się w „do ok. 0,80 USD”');
      // pełne pokrycie: drugi przebieg bez żadnego żądania range
      const n = got.length;
      assert.deepEqual(await R.C.tick(), { skipped: 'empty' });
      assert.equal((await ranges(R.A)).length, n, 'pełne pokrycie: zero żądań range');
      assert.deepEqual((await R.A.log()).violations, []);
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 końcowy brak krótszy niż 1 h czeka do następnego przebiegu; od godziny jest pobierany', async () => {
    const R = await direct();
    try {
      await R.C.tick();
      const n0 = (await ranges(R.A)).length;
      // availableEnd rośnie o 30 min (cache 15 min wygasa przy zegarze +30 min): brak 30 min < 1 h
      R.st.clock = NOW + 30 * 60_000;
      await R.A.config({ end: '2024-03-12T15:29:00.000000000Z' });
      const c0 = await costs(R.A);
      assert.deepEqual(await R.C.tick(), { skipped: 'empty' });
      assert.equal((await ranges(R.A)).length, n0, 'brak 30 min: bez żądania');
      assert.equal(await costs(R.A), c0, 'brak 30 min: bez wyceny');
      // koniec danych 61 min po poprzednim: brak >= 1 h
      R.st.clock = NOW + 60 * 60_000;
      await R.A.config({ end: '2024-03-12T16:00:00.000000000Z' });
      const r = await R.C.tick();
      assert.equal(r.done, 2, JSON.stringify(r));
      const more = (await ranges(R.A)).slice(n0);
      assert.deepEqual(more.map((x) => x[0]).sort(), ['ESM4', 'NQM4'], 'ogon w warstwach aktualnego kontraktu');
      assert.ok(more.every((x) => x[2] === '2024-03-12T14:59:00Z' && x[3] === '2024-03-12T16:00:00Z'), JSON.stringify(more));
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 przekroczony limit dobowy i brak kredytu wstrzymują kolejkę bez pobrania', async () => {
    const R = await direct({ cfg: { chart1mDaily: true, chartCredit: { ...H.TEST_CREDIT }, chartSpend: { day: '2024-03-12', usd: 2.999 } } });
    try {
      await R.C.tick();
      assert.equal((await ranges(R.A)).length, 0, '2,999 + 0,002 > 3 USD na dobę: nic nie pobrano');
      const q = R.C.status().queue;
      assert.equal(q.reason, 'daily-limit'); assert.equal(q.pending, 6);
    } finally { R.stop(); }
    const N = await direct({ cfg: { chart1mDaily: true, chartCredit: undefined } });
    try {
      await N.C.tick();
      assert.equal((await ranges(N.A)).length, 0, 'bez wpisanego kredytu: nic nie pobrano');
      assert.equal(N.C.status().queue.reason, 'credit'); assert.equal(N.C.status().queue.pending, 6);
    } finally { N.stop(); }
  });

  test('wykresy-33: P57 błąd Databento przy pobieraniu końca danych nie wywraca przebiegu i nie dokłada nic', async () => {
    const R = await direct({ atrapa: { fail: { path: '/v0/metadata.get_dataset_range', status: 500 } } });
    try {
      assert.deepEqual(await R.C.tick(), { skipped: 'empty' });
      assert.equal((await ranges(R.A)).length, 0);
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 przełącznik chart1mDaily w config.local.json przez /api/config (domyślnie wyłączony także po aktualizacji), kontrolka w Źródłach danych z potwierdzeniem kosztu', async () => {
    const dir = H.tmp();
    const S = await H.server(++port, { THQ_CONFIG_DIR: dir });
    try {
      assert.equal((await (await fetch(S.base + '/api/meta')).json()).chart1mDaily, false, 'nowa instalacja');
      assert.equal((await H.dash(S.base, '/api/config', { chart1mDaily: true })).j.chart1mDaily, true);
      const r = await H.dash(S.base, '/api/config', { chart1mDaily: false });
      assert.equal(r.status, 200); assert.equal(r.j.chart1mDaily, false);
      await H.sleep(150);
      assert.equal(JSON.parse(readFileSync(path.join(dir, 'config.local.json'), 'utf8')).chart1mDaily, false);
      assert.equal((await H.dash(S.base, '/api/config', { chart1mDaily: 'tak' })).j.chart1mDaily, false, 'tylko wartość logiczna');
    } finally { S.stop(); }
    // istniejąca instalacja sprzed aktualizacji (plik konfiguracji był przed startem): okno 1s zostaje włączone, minutówki NIE
    const dir2 = H.tmp();
    writeFileSync(path.join(dir2, 'config.local.json'), JSON.stringify({ chartCredit: H.TEST_CREDIT, lang: 'pl' }));
    const S2 = await H.server(++port, { THQ_CONFIG_DIR: dir2 });
    try {
      const m = await (await fetch(S2.base + '/api/meta')).json();
      assert.equal(m.chartNq1sDaily, true, 'migracja 1.6.0 jak dotąd'); assert.equal(m.chart1mDaily, false, 'minutówki bez zgody wyłączone');
      assert.ok(!('chart1mDaily' in JSON.parse(readFileSync(path.join(dir2, 'config.local.json'), 'utf8'))), 'żadnego wpisu bez jawnej zgody');
    } finally { S2.stop(); }
    assert.ok(!/chart1mDaily/.test(readFileSync(path.join(ROOT, 'lib/config-migracje.mjs'), 'utf8')), 'brak migracji włączającej');
    const u = readFileSync(path.join(ROOT, 'public/js/ust-zrodla.js'), 'utf8');
    assert.match(u, /data-act="ch-1m"[^>]*\$\{on1m \|\| minConfirm \? 'checked' : ''\}/);
    assert.match(u, /case 'zr-1m-ok': minConfirm = false; setMin1\(true\)/);
    assert.match(u, /setMin1\(false\)/);
    assert.match(u, /ctx\.opts\.onConfig\(\{ chart1mDaily: on \}\)/);
    assert.match(readFileSync(path.join(ROOT, 'public/js/ust-dysk.js'), 'utf8'), /meta\.chart1mDaily === true/);
    assert.match(readFileSync(path.join(ROOT, 'lib/candles.mjs'), 'utf8'), /autoOpenWindows && getConfig\(\)\.chart1mDaily === true/);
  });

  const queueItems = (R) => (R.S.readAux('queue', { baseDir: R.dir })?.items || []);

  // ---------- przegląd P57 (4.11.2026), B1: wyłączenie przełącznika zatrzymuje wydawanie od razu ----------
  test('wykresy-33: P57 B1 wyłączenie minutówek po czekających pozycjach: po wpisaniu kredytu nic się nie pobiera, pozycje znikają z kolejki', async () => {
    const R = await direct({ cfg: { chart1mDaily: true, chartCredit: undefined } });
    try {
      await R.C.tick();
      assert.equal(R.C.status().queue.pending, 6, 'bez kredytu pozycje czekają');
      R.st.cfg.chart1mDaily = false; // użytkownik wyłącza
      R.st.cfg.chartCredit = { ...H.TEST_CREDIT }; // i później wpisuje kredyt
      await R.C.tick();
      assert.equal((await ranges(R.A)).length, 0, 'zero get_range po wyłączeniu');
      assert.equal(R.C.status().queue.pending, 0);
      assert.equal(R.st.cfg.chartSpend, undefined, 'nic nie wydano');
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 B1 okna 1s z automatu znikają po wyłączeniu chartNq1sDaily, okno trade\'a (także scalone z oknem automatu) zostaje i jest pobrane', async () => {
    // okno trade'a osobno (20:00–20:30Z) i okno trade'a nachodzące na okno 9:30 NY (5.03: 15:40–16:10Z, okno automatu 14:30–16:00Z) po scaleniu traci znacznik automatu
    for (const [from, to, want, late] of [['2024-03-11T20:00:00Z', '2024-03-11T20:30:00Z', ['2024-03-11T20:00:00Z', '2024-03-11T20:30:00Z']], ['2024-03-05T15:40:00Z', '2024-03-05T16:10:00Z', ['2024-03-05T14:30:00Z', '2024-03-05T16:10:00Z']], ['2024-03-05T15:40:00Z', '2024-03-05T16:10:00Z', ['2024-03-05T14:30:00Z', '2024-03-05T16:10:00Z'], 'late']]) {
      const R = await direct({ cfg: { chartNq1sDaily: true, chartCredit: undefined } });
      try {
        // late: okno trade'a dochodzi, gdy okno automatu już czeka w kolejce (kolejność scalania nie może gubić okna trade'a)
        if (late !== 'late') R.C.enqueue({ windows: [{ instrument: 'NQ', from: at(from), to: at(to) }] });
        await R.C.tick();
        if (late === 'late') R.C.enqueue({ windows: [{ instrument: 'NQ', from: at(from), to: at(to) }] });
        const auto = queueItems(R).filter((i) => i.auto === 'open1s');
        assert.ok(auto.length >= 3, 'okna dnia z automatu mają znacznik: ' + auto.length);
        if (want[0] === '2024-03-05T14:30:00Z') assert.ok(!auto.some((i) => i.from <= at(from) && i.to >= at(to)), 'scalone okno nie ma znacznika automatu');
        R.st.cfg.chartNq1sDaily = false;
        R.st.cfg.chartCredit = { ...H.TEST_CREDIT };
        await R.C.tick();
        const got = await ranges(R.A);
        assert.deepEqual(got.map((x) => [x[1], x[2], x[3]]), [['ohlcv-1s', want[0], want[1]]], 'tylko okno trade\'a: ' + JSON.stringify(got));
        assert.equal(R.C.status().queue.pending, 0);
      } finally { R.stop(); }
    }
  });

  test('wykresy-33: P57 B1 wyłączenie w trakcie przebiegu: po bieżącej porcji nic więcej się nie pobiera', async () => {
    let R = null, sent = 0;
    const fetchImpl = async (u, o) => {
      if (String(u).endsWith('get_range') && ++sent === 1) R.st.cfg.chart1mDaily = false;
      return fetch(u, o);
    };
    R = await direct({ fetchImpl });
    try {
      await R.C.tick();
      assert.equal(sent, 1, 'jedna porcja i koniec, mimo 6 czekających pozycji (' + sent + ')');
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 B1 zapis false w /api/config od razu czyści kolejkę z pozycji automatu', async () => {
    const dir = H.tmp();
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ lang: 'pl', chart1mDaily: true }));
    const A = await H.atrapaDb(++port);
    const S = await H.server(++port, { THQ_CONFIG_DIR: dir, DATABENTO_API_BASE: A.base, DATABENTO_API_KEY: KEY, THQ_NO_AUTO_1S: '' });
    try {
      assert.equal((await H.dash(S.base, '/api/candles/queue-run', {})).status, 200);
      let st;
      for (let i = 0; i < 100; i++) { await H.sleep(50); st = await (await fetch(S.base + '/api/candles/status')).json(); if (st.queue.pending >= 3) break; }
      assert.ok(st.queue.pending >= 3, 'bez kredytu pozycje czekają: ' + st.queue.pending);
      assert.ok(st.queue.items.some((x) => x.layer.startsWith('1m')), 'są minutówki');
      const r = await H.dash(S.base, '/api/config', { chart1mDaily: false });
      assert.equal(r.status, 200);
      const after = await (await fetch(S.base + '/api/candles/status')).json();
      assert.ok(!after.queue.items.some((x) => x.layer.startsWith('1m')), 'minutówek już nie ma w kolejce od razu po zapisie');
      assert.equal((await ranges(A)).length, 0, 'nic nie pobrano');
    } finally { S.stop(); A.stop(); }
  });

  // ---------- B2: nieudane płatne pobranie nie wraca co 5 minut ----------
  async function twelveTicks(R, step = 5 * 60_000) {
    for (let i = 0; i < 12; i++) { R.st.clock = NOW + i * step; await R.C.tick(); }
  }
  test('wykresy-33: P57 B2 HTTP 500 po naliczeniu kosztu: 12 przebiegów co 5 min = jedno get_range i jedna cena w liczniku, potem 1 h, 6 h i blokada po trzeciej próbie', async () => {
    const R = await direct({ atrapa: { cost: 0.05, cost1m: 0.05, fail: { path: '/v0/timeseries.get_range', status: 500 } } });
    try {
      await twelveTicks(R);
      assert.equal((await ranges(R.A)).length, 1, 'jedno get_range w pierwszej godzinie');
      assert.ok(Math.abs(R.st.cfg.chartSpend.usd - 0.05) < 1e-9, JSON.stringify(R.st.cfg.chartSpend));
      assert.ok(Math.abs(R.st.cfg.chartCredit.spentUsd - 0.05) < 1e-9);
      assert.equal(queueItems(R).filter((i) => i.fails).length, 1);
      R.st.clock = NOW + 3600_000; await R.C.tick();
      assert.equal((await ranges(R.A)).length, 2, 'po godzinie druga próba');
      R.st.clock = NOW + 3600_000 + 1000; await R.C.tick();
      assert.equal((await ranges(R.A)).length, 2, 'po drugiej porażce odstęp 6 h');
      R.st.clock = NOW + 3600_000 + 6 * 3600_000 + 1000; await R.C.tick();
      const blocked = queueItems(R).filter((i) => i.state === 'blocked');
      assert.equal(blocked.length, 1); assert.equal(blocked[0].fails, 3);
      assert.match(blocked[0].reason, /Trzy nieudane płatne próby/);
      assert.ok(Math.abs(R.st.cfg.chartCredit.spentUsd - 0.05 * (await ranges(R.A)).length) < 1e-9, 'licznik kredytu = liczba płatnych prób × cena (licznik dobowy zeruje się o północy UTC)');
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 B2 timeout przy czytaniu odpowiedzi po wysłaniu get_range jest DatabentoError (kolejka: network), 12 przebiegów = jedna płatna próba', async () => {
    let sent = 0;
    const fetchImpl = async (u, o) => {
      const r = await fetch(u, o);
      if (String(u).endsWith('get_range')) { sent++; return { ok: true, status: 200, text: async () => { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; } }; }
      return r;
    };
    const R = await direct({ atrapa: { cost: 0.05, cost1m: 0.05 }, fetchImpl });
    try {
      await twelveTicks(R);
      assert.equal(sent, 1, 'jedno wysłane get_range');
      assert.equal(R.C.status().queue.reason, 'network', 'DatabentoError, nie błąd zapisu');
      assert.ok(Math.abs(R.st.cfg.chartSpend.usd - 0.05) < 1e-9, JSON.stringify(R.st.cfg.chartSpend));
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 B2 błąd przed naliczeniem kosztu (wycena 500) nie zwiększa licznika prób i nie opóźnia pozycji', async () => {
    const R = await direct({ atrapa: { fail: { path: '/v0/metadata.get_cost', status: 500 } } });
    try {
      for (let i = 0; i < 3; i++) { R.st.clock = NOW + i * 5 * 60_000; await R.C.tick(); }
      assert.equal((await ranges(R.A)).length, 0);
      assert.equal(R.st.cfg.chartSpend, undefined);
      assert.ok(queueItems(R).length >= 6 && queueItems(R).every((i) => !i.fails && !i.nextTryAt), JSON.stringify(queueItems(R)[0]));
    } finally { R.stop(); }
  });

  // ---------- D1/D2: okna 1s przed minutówkami, porcje miesięczne ----------
  test('wykresy-33: P57 D1 kredyt mniejszy niż porcja minutówek: okna 1s idą pierwsze i się pobierają, minutówki czekają', async () => {
    const R = await direct({ cfg: { chart1mDaily: true, chartNq1sDaily: true, chartCredit: { startUsd: 0.25, expires: '2030-01-01', spentUsd: 0 } }, atrapa: { cost: 0.02, cost1m: 0.33 } });
    try {
      await R.C.tick();
      const g = await ranges(R.A);
      assert.ok(g.filter((x) => x[1] === 'ohlcv-1s').length >= 3, 'okna 1s pobrane: ' + g.length);
      assert.equal(g.filter((x) => x[1] === 'ohlcv-1m').length, 0);
      assert.equal(R.C.status().queue.reason, 'credit');
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 D2 limit dobowy niższy niż cała pozycja: postęp po porcjach miesięcznych przez kilka dni, bez ponownego pobierania', async () => {
    const R = await direct({ cfg: { chart1mDaily: true, chartDailyLimitUsd: 0.2, chartCredit: { ...H.TEST_CREDIT } }, atrapa: { cost: 0.08, cost1m: 0.08 } });
    try {
      const per = [];
      for (let d = 0; d < 3; d++) {
        R.st.clock = NOW + d * 86400_000;
        await R.C.tick();
        per.push((await ranges(R.A)).length);
      }
      assert.deepEqual(per, [2, 4, 6], 'dwie porcje dziennie (0,16 z 0,20 USD)');
      const got = await ranges(R.A);
      assert.equal(new Set(got.map((x) => x.join('|'))).size, got.length, 'żadna porcja dwa razy');
      assert.ok(got.every((x) => (Date.parse(x[3]) - Date.parse(x[2])) / 86400000 <= 31.01), 'porcje nie dłuższe niż miesiąc');
      assert.equal(R.C.status().queue.reason, 'daily-limit'); assert.ok(R.C.status().queue.pending > 0);
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 D2 pojedyncza porcja droższa niż limit na pobranie: pozycja zablokowana z powodem, zero pobrań', async () => {
    const R = await direct({ cfg: { chart1mDaily: true, chartCostLimitUsd: 0.25, chartCredit: { ...H.TEST_CREDIT } }, atrapa: { cost: 0.33, cost1m: 0.33 } });
    try {
      await R.C.tick();
      assert.equal((await ranges(R.A)).length, 0);
      const b = queueItems(R).filter((i) => i.state === 'blocked');
      assert.ok(b.length >= 1 && b.every((i) => /przekracza limit/.test(i.reason)), JSON.stringify(b[0]));
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 kod: 1m z dłuższym czasem odpowiedzi jak import, odczyt treści get_range w try', () => {
    const c = readFileSync(path.join(ROOT, 'lib/candles.mjs'), 'utf8');
    assert.match(c, /\.\.\.\(mins \? \{ rangeTimeoutMs: IMPORT_RANGE_TIMEOUT_MS \} : \{\}\)/);
    const d = readFileSync(path.join(ROOT, 'lib/databento.mjs'), 'utf8');
    assert.match(d, /try \{ text = await res\.text\(\); \}/);
  });

  // ---------- runda 3 (4.11.2026), audyt bezpieczeństwa ----------
  test('wykresy-33: P57 F1 sufit 92 dni nie rośnie z czasem czekania: 200 dni bez kredytu, potem kredyt = żaden zakres starszy niż 99 dni, koszt do 0,80 USD', async () => {
    const R = await direct({ cfg: { chart1mDaily: true, chartCredit: undefined } });
    try {
      for (let d = 0; d <= 200; d += 10) {
        R.st.clock = NOW + d * 86400_000;
        await R.A.config({ end: new Date(NOW + d * 86400_000 - 5 * 3600_000).toISOString().replace('Z', '000000Z') });
        await R.C.tick();
      }
      assert.equal((await ranges(R.A)).length, 0, 'bez kredytu nic nie pobrano');
      const oldest = Math.min(...queueItems(R).map((i) => i.from));
      assert.ok(oldest >= (R.st.clock / 1000) - 99 * 86400 - 60, 'kolejka nie trzyma pozycji starszych niż 99 dni: ' + new Date(oldest * 1000).toISOString());
      R.st.cfg.chartCredit = { ...H.TEST_CREDIT };
      await R.C.tick();
      const got = await ranges(R.A);
      assert.ok(got.length > 0);
      const minStart = Math.min(...got.map((x) => Date.parse(x[2]) / 1000));
      assert.ok(minStart >= R.st.clock / 1000 - 99 * 86400 - 60, 'najstarszy pobrany zakres: ' + new Date(minStart * 1000).toISOString());
      const days = got.reduce((a, x) => a + (Date.parse(x[3]) - Date.parse(x[2])) / 86400000, 0);
      assert.ok(days * 1.29 / 365 <= 0.80, 'koszt ' + (days * 1.29 / 365).toFixed(3) + ' USD (' + days.toFixed(0) + ' dni)');
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 F2 wyłączenie podczas wyceny (quoteRuns) = zero get_range', async () => {
    let R = null, fired = false;
    const fetchImpl = async (u, o) => {
      if (String(u).endsWith('get_cost') && !fired) { fired = true; R.st.cfg.chart1mDaily = false; }
      return fetch(u, o);
    };
    R = await direct({ fetchImpl });
    try {
      await R.C.tick();
      assert.ok(fired);
      assert.equal((await ranges(R.A)).length, 0);
      assert.equal(R.st.cfg.chartSpend, undefined, 'nic nie wydano');
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 F3+F4 błąd zapisu na dysku po opłaconym pobraniu: reason ze stałym tekstem (bez ścieżki), blokada po 3 próbach, 72 h stałej awarii = najwyżej 13 płatnych prób', async () => {
    const R = await direct({ atrapa: { cost: 0.05, cost1m: 0.05 }, prep: async (dir) => { writeFileSync(path.join(dir, 'candles'), 'to jest plik, nie katalog'); } });
    try {
      for (let m = 0; m <= 72 * 60; m += 5) { R.st.clock = NOW + m * 60_000; await R.C.tick(); }
      const tries = (await ranges(R.A)).length;
      assert.ok(tries >= 3 && tries <= 13, 'płatne próby w 72 h: ' + tries);
      const q = R.S.readAux('queue', { baseDir: R.dir });
      const reasons = JSON.stringify(q);
      assert.ok(!reasons.includes(R.dir) && !/ENOTDIR|EEXIST|Users/.test(reasons) && !reasons.includes(os.userInfo().username), 'w kolejce nie ma ścieżki ani loginu: ' + reasons.slice(0, 300));
      assert.ok(q.items.some((i) => i.state === 'blocked' && /błąd zapisu na dysku, szczegóły w logu serwera/.test(i.reason)), 'blokada ze stałym tekstem: ' + JSON.stringify(q.items.map((i) => [i.state, i.fails, i.reason]))); 
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 F5 /api/config z ciałem null, tablicą albo liczbą = 400, nie 500', async () => {
    const S = await H.server(++port, { THQ_CONFIG_DIR: H.tmp() });
    try {
      for (const body of ['null', '[]', '5', '"x"']) {
        const r = await fetch(S.base + '/api/config', { method: 'POST', body, headers: { Origin: S.base, 'X-THQ': '1', 'Content-Type': 'application/json' } });
        assert.equal(r.status, 400, body + ' → ' + r.status);
      }
      assert.equal((await H.dash(S.base, '/api/config', { chart1mDaily: false })).status, 200);
    } finally { S.stop(); }
  });

  // ---------- runda 3, przegląd kodu r2 ----------
  const failing500 = { cost: 0.05, cost1m: 0.05, fail: { path: '/v0/timeseries.get_range', status: 500 } };

  test('wykresy-33: P57 D2 pauza po nieudanym pobraniu jest widoczna w kolejce (UTC), przeżywa restart, setLimit i unblock czyszczą pauzę, fails i nextTryAt', async () => {
    const R = await direct({ atrapa: failing500 });
    try {
      await R.C.tick();
      const info = R.C.status().queue;
      assert.ok(info.pausedUntil > NOW, 'pausedUntil w statusie');
      assert.match(info.message, /ponowi próbę o [0-9]{2}:[0-9]{2} UTC/);
      // restart (nowa instancja na tym samym katalogu): pauza zostaje, żadnego get_range
      const { createCandles } = await lib('lib/candles.mjs');
      const C2 = createCandles({ getKey: () => KEY, getConfig: () => R.st.cfg, baseDir: R.dir, now: () => R.st.clock, autoOpenWindows: true });
      const n = (await ranges(R.A)).length;
      R.st.clock = NOW + 60_000;
      assert.deepEqual(await C2.tick(), { skipped: 'paused' });
      assert.equal((await ranges(R.A)).length, n, 'po restarcie bez nowej płatnej próby');
      // zapis limitów (także dobowego) zdejmuje pauzę i liczniki
      C2.setLimit({ dailyLimitUsd: 2 });
      const q = R.S.readAux('queue', { baseDir: R.dir });
      assert.ok(!q.pausedUntil && !q.pausedBy && !q.failStreak, JSON.stringify({ p: q.pausedUntil, b: q.pausedBy, s: q.failStreak }));
      assert.ok(q.items.every((i) => !i.fails && !i.nextTryAt), 'fails i nextTryAt wyzerowane');
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 D2 pauza znika razem z pozycją, która ją ustawiła (wyłączenie przełącznika)', async () => {
    const R = await direct({ atrapa: failing500 });
    try {
      await R.C.tick();
      assert.ok(R.S.readAux('queue', { baseDir: R.dir }).pausedUntil);
      R.st.cfg.chart1mDaily = false;
      R.C.dropAutomatic();
      const q = R.S.readAux('queue', { baseDir: R.dir });
      assert.ok(!q.pausedUntil && !q.pausedBy, 'pauza zdjęta');
      assert.equal(R.C.status().queue.pausedUntil, null);
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 D3 udana porcja zeruje fails pozycji ("z rzędu")', async () => {
    // seria NQ.v.0: w każdym przebiegu pierwsza porcja przechodzi, druga dostaje 500 po rezerwacji w liczniku
    let seen = 0;
    const fetchImpl = async (u, o) => {
      if (String(u).endsWith('get_range') && String(o?.body).includes('symbols=NQ.v.0') && ++seen === 2) return new Response('{}', { status: 500 });
      return fetch(u, o);
    };
    const R = await direct({ atrapa: { cost: 0.002, cost1m: 0.002 }, fetchImpl });
    try {
      await R.C.tick();
      const nqFails = () => queueItems(R).filter((i) => i.instrument === 'NQ' && i.layer === '1m').map((i) => i.fails || 0);
      assert.deepEqual(nqFails(), [1], 'pierwsza porażka');
      seen = 0;
      R.st.clock = NOW + 7 * 3600_000;
      await R.C.tick();
      assert.deepEqual(nqFails(), [1], '"z rzędu": udana porcja zerowała licznik, nowa porażka = 1, nie 2');
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 D4 porcje minutówek najnowsze najpierw (malejąco w obrębie warstwy)', async () => {
    const R = await direct();
    try {
      await R.C.tick();
      const nq = (await ranges(R.A)).filter((x) => x[0] === 'NQ.v.0').map((x) => x[2]);
      assert.ok(nq.length >= 3, 'kilka porcji: ' + nq.length);
      assert.deepEqual(nq, [...nq].sort().reverse(), 'malejąco: ' + nq.join(' '));
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 D4 wyłączenie po pierwszej porcji kończy pozycję (break po porcji), bez kolejnych get_range', async () => {
    let R = null, sent = 0;
    const fetchImpl = async (u, o) => {
      const r = await fetch(u, o);
      if (String(u).endsWith('get_range') && ++sent === 1) R.st.cfg.chart1mDaily = false;
      return r;
    };
    R = await direct({ fetchImpl });
    try {
      await R.C.tick();
      assert.equal(sent, 1);
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 D5 stare pozycje 1s NQ równe oknu 9:30–11:00 NY dostają znacznik automatu przy wczytaniu, okno trade z logu nie; wyłączenie 1s usuwa tylko pierwsze', async () => {
    const R = await direct({ cfg: { chartNq1sDaily: true, chartCredit: { ...H.TEST_CREDIT } }, clock: NOW });
    try {
      const w = [at('2024-03-11T13:30:00Z'), at('2024-03-11T15:00:00Z')], tr = [at('2024-03-11T20:00:00Z'), at('2024-03-11T20:30:00Z')];
      const mk = (a, b) => ({ id: 'NQ-' + a + '-' + b, instrument: 'NQ', from: a, to: b, state: 'pending', reason: null, attempts: 0, addedAt: 1 });
      R.S.writeAux('queue', { items: [mk(...w), mk(...tr)], reason: null }, { baseDir: R.dir });
      // nowa instancja wczytuje kolejkę sprzed aktualizacji
      const { createCandles } = await lib('lib/candles.mjs');
      const st = { cfg: { chartNq1sDaily: false } };
      const C2 = createCandles({ getKey: () => KEY, getConfig: () => st.cfg, baseDir: R.dir, now: () => NOW, autoOpenWindows: true });
      C2.dropAutomatic();
      const left = R.S.readAux('queue', { baseDir: R.dir }).items;
      assert.deepEqual(left.map((i) => i.from), [tr[0]], 'zostało tylko okno tradea: ' + JSON.stringify(left.map((i) => i.from)));
    } finally { R.stop(); }
  });

  test('wykresy-33: P57 pojedyncza porcja droższa niż limit dobowy: blocked z powodem (jak limit na pobranie), zero pobrań', async () => {
    const R = await direct({ cfg: { chart1mDaily: true, chartDailyLimitUsd: 0.25, chartCredit: { ...H.TEST_CREDIT } }, atrapa: { cost: 0.33, cost1m: 0.33 } });
    try {
      await R.C.tick();
      assert.equal((await ranges(R.A)).length, 0);
      const b = queueItems(R).filter((i) => i.state === 'blocked');
      assert.ok(b.length >= 1 && b.every((i) => /przekracza limit 0[.]25/.test(i.reason)), JSON.stringify(b[0]));
    } finally { R.stop(); }
  });
};
