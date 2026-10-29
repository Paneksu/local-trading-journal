// wykresy-27: P49 (29.10.2026), import okien 1s NQ 9:30–11:00 Nowy Jork od 2020. Słowa użytkownika: «nadbudowac baze danych swiec 1s od 9:30 ny open
// do 11:00, tylko na nq na okres od 2020»; wybory: «Tak, z twardym limitem 36 USD», «Jednorazowy budżet tylko dla tego importu».
// Tylko atrapa Databento: czas letni i zimowy, pomijanie okien w magazynie, kontrakt wg reguły rolla P35 (pomiar przewagi obrotu), partie ≤ 1 USD,
// twardy stop budżetu (także przy wznowieniu), brak get_range bez potwierdzenia, skrypt CLI (wycena domyślnie, wznowienie po 429).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

export default ({ test, H, assert, ROOT }) => {
  let port = 5160;
  const KEY = 'db-test-key-0123456789abcdef'; // klucz atrapy (import pliku atrapy uruchomiłby serwer)
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const at = (s) => Date.parse(s) / 1000;
  const iso = (s) => new Date(s * 1000).toISOString().replace('.000Z', 'Z');
  const qOf = (y, m) => y * 4 + (m / 3 - 1);
  const H4 = qOf(2024, 3), M4 = qOf(2024, 6);
  const calls = async (A, name) => (await A.log()).log.filter((e) => e.path.endsWith(name));

  async function direct({ cfg = {}, clock, atrapa = {}, prep } = {}) {
    const A = await H.atrapaDb(++port);
    await A.config(atrapa);
    const old = process.env.DATABENTO_API_BASE;
    process.env.DATABENTO_API_BASE = A.base;
    const { createCandles } = await lib('lib/candles.mjs');
    const dir = H.tmp();
    if (prep) await prep(dir);
    const st = { cfg, clock };
    const C = createCandles({ getKey: () => KEY, getConfig: () => st.cfg, baseDir: dir, now: () => st.clock });
    const idle = async () => { for (let i = 0; i < 400 && C.status().running; i++) await H.sleep(25); };
    const stop = () => { if (old === undefined) delete process.env.DATABENTO_API_BASE; else process.env.DATABENTO_API_BASE = old; A.stop(); };
    return { A, C, st, dir, idle, stop };
  }

  test('wykresy-27: P49 okna 9:30–11:00 NY: czas zimowy i letni (marzec i listopad 2024), tylko pon-pt, okno przycięte zakresem pominięte; partie ≤ 1 USD', async () => {
    const K = await lib('lib/candles.mjs');
    const w = K.openWindows(at('2024-03-07T00:00:00Z'), at('2024-03-13T00:00:00Z')).map((x) => [x.day, iso(x.from), iso(x.to)]);
    assert.deepEqual(w, [
      ['2024-03-07', '2024-03-07T14:30:00Z', '2024-03-07T16:00:00Z'],
      ['2024-03-08', '2024-03-08T14:30:00Z', '2024-03-08T16:00:00Z'], // piątek przed zmianą czasu (EST, UTC−5)
      ['2024-03-11', '2024-03-11T13:30:00Z', '2024-03-11T15:00:00Z'], // poniedziałek po zmianie 10.03 (EDT, UTC−4); sobota i niedziela bez okien
      ['2024-03-12', '2024-03-12T13:30:00Z', '2024-03-12T15:00:00Z'],
    ]);
    const n = K.openWindows(at('2024-11-01T00:00:00Z'), at('2024-11-05T00:00:00Z')).map((x) => [x.day, iso(x.from)]);
    assert.deepEqual(n, [['2024-11-01', '2024-11-01T13:30:00Z'], ['2024-11-04', '2024-11-04T14:30:00Z']], 'zmiana czasu 3.11.2024: piątek EDT, poniedziałek EST');
    assert.deepEqual(K.openWindows(at('2024-03-11T14:00:00Z'), at('2024-03-11T15:00:00Z')), [], 'okno niepełne w zakresie (koniec danych) nie wchodzi');
    assert.equal(K.OPEN_IMPORT_MAX_USD, 36); assert.equal(K.OPEN_BATCH_MAX_USD, 1); assert.equal(K.OPEN_WINDOWS_FROM, '2020-01-02');
    const b = (q) => K.openBatches(q).map((x) => [x.to - x.from, x.usd]);
    assert.deepEqual(b(Array(7).fill(0.3)), [[3, 0.9], [3, 0.9], [1, 0.3]]);
    assert.deepEqual(b([0.6, 0.5, 0.5, 1]), [[1, 0.6], [2, 1], [1, 1]], 'suma równa 1 USD mieści się w partii');
    assert.deepEqual(b([1.2, 0.1]), [[1, 1.2], [1, 0.1]], 'pozycja ponad 1 USD sama w partii (pobranie ją odrzuci)');
    assert.deepEqual(b(Array(52).fill(0.0195)).map((x) => x[0]), [51, 1], 'dzień NQ ok. 0,0195 USD: ok. 51 dni na partię');
  });

  // Roll NQH4 → NQM4: pomiar przewagi obrotu (1m obu kontraktów) daje sesję piątku 8.03.2024 (otwarcie czw. 17:00 CST), .v.0 przełącza się dopiero 13.03.
  // Okno 8.03 musi więc trafić do warstwy 1s-NQM2024 (symbol surowy NQM4), 7.03 do serii .v.0 (NQH4), a 13.03 (już w magazynie) zostaje pominięte.
  const prepRoll = async (dir) => {
    const S = await lib('lib/candles-store.mjs');
    S.writeAux('contracts-nq', { resolvedTo: '2099-01-01', v0: [[at('2023-12-13T00:00:00Z'), H4], [at('2024-03-13T00:00:00Z'), M4]], names: {} }, { baseDir: dir });
    const a = at('2024-03-05T23:00:00Z'), e = at('2024-03-13T00:00:00Z'), flip = at('2024-03-07T23:00:00Z');
    const bars = (vol) => { const out = []; for (let t = a; t < e; t += 3600) out.push([t, 1800000, 1800100, 1799900, 1800050, vol(t)]); return out; };
    S.writeRange('NQ', '1m', a, e, bars(() => 10), {}, { baseDir: dir });
    S.writeRange('NQ', '1m-NQM2024', a, e, bars((t) => (t >= flip ? 50 : 5)), {}, { baseDir: dir });
    S.writeRange('NQ', '1s', at('2024-03-13T13:30:00Z'), at('2024-03-13T15:00:00Z'), [], {}, { baseDir: dir }); // okno już w magazynie
  };

  test('wykresy-27: P49 wycena: kontrakt wg reguły rolla P35 (dzień rolla w nowym kontrakcie), okna w magazynie pominięte, okno po availableEnd poza planem, zero get_range bez potwierdzenia', async () => {
    const R = await direct({ clock: Date.UTC(2024, 2, 14, 12), atrapa: { end: '2024-03-14T10:00:00.000000000Z', cost: 0.002 }, prep: prepRoll });
    try {
      const from = at('2024-03-07T00:00:00Z'), to = at('2024-03-15T00:00:00Z');
      const dry = await R.C.importOpen({ instrument: 'NQ', from, to, dryRun: true });
      assert.equal(dry.dryRun, true); assert.equal(dry.days, 4); assert.equal(dry.runs, 4);
      assert.deepEqual(dry.layers, ['1s', '1s-NQM2024']);
      const qs = (await calls(R.A, 'get_cost')).map((x) => [x.params.symbols, x.params.stype_in, x.params.schema, x.params.start, x.params.end]).sort((x, y) => x[3].localeCompare(y[3]));
      assert.deepEqual(qs, [
        ['NQ.v.0', 'continuous', 'ohlcv-1s', '2024-03-07T14:30:00Z', '2024-03-07T16:00:00Z'],
        ['NQM4', 'raw_symbol', 'ohlcv-1s', '2024-03-08T14:30:00Z', '2024-03-08T16:00:00Z'],
        ['NQM4', 'raw_symbol', 'ohlcv-1s', '2024-03-11T13:30:00Z', '2024-03-11T15:00:00Z'],
        ['NQM4', 'raw_symbol', 'ohlcv-1s', '2024-03-12T13:30:00Z', '2024-03-12T15:00:00Z'],
      ], 'dzień rolla (piątek wg pomiaru) i dni do przełączenia .v.0 z NQM4; 13.03 w magazynie; 14.03 jeszcze niedostępny');
      assert.equal((await calls(R.A, 'get_range')).length, 0, 'wycena bez pobierania');
      await assert.rejects(R.C.importOpen({ instrument: 'NQ', from, to }), (e) => e.code === 'no-quote' && e.status === 400);
      await assert.rejects(R.C.importOpen({ instrument: 'NQ', from, to, confirmedCostUsd: 1 }), (e) => e.code === 'bad-budget');
      await assert.rejects(R.C.importOpen({ instrument: 'NQ', from, to, confirmedCostUsd: 1, budgetUsd: 36.01 }), (e) => e.code === 'bad-budget', 'budżet ponad 36 USD odrzucony');
      await assert.rejects(R.C.importOpen({ instrument: 'ES', from, to, dryRun: true }), /tylko NQ/);
      await assert.rejects(R.C.importOpen({ instrument: 'NQ', from: at('2019-12-31T00:00:00Z'), to, dryRun: true }), /nie wcześniej niż 2020-01-02/);
      await assert.rejects(R.C.importOpen({ instrument: 'NQ', from, to, confirmedCostUsd: 0.001, budgetUsd: 36 }), (e) => e.code === 'cost-changed');
      assert.equal((await calls(R.A, 'get_range')).length, 0, 'żadna odmowa nie pobiera');
      const nc = (await calls(R.A, 'get_cost')).length;
      await R.C.importOpen({ instrument: 'NQ', from, to, dryRun: true });
      assert.equal((await calls(R.A, 'get_cost')).length, nc + 4, 'sama wycena zawsze pyta od nowa (bez pamięci wycen)');
      // pobranie: start używa wycen z dryRun (pamięć wycen), a przed każdym get_range jest świeży get_cost tego okna
      const L0 = (await R.A.log()).log.length;
      const r = await R.C.importOpen({ instrument: 'NQ', from, to, confirmedCostUsd: dry.totalUsd, budgetUsd: 36 });
      assert.equal(r.started, true); await R.idle();
      assert.equal(R.C.status().error, null, JSON.stringify(R.C.status().error));
      const gr = (await R.A.log()).log.slice(L0);
      const ranges = gr.map((x, i) => [x, i]).filter(([x]) => x.path.endsWith('get_range'));
      assert.equal(ranges.length, 4);
      assert.equal(gr.filter((x) => x.path.endsWith('get_cost')).length, 4, 'start bez drugiej wyceny całości: jedna świeża wycena na okno');
      for (const [x, i] of ranges) {
        assert.equal(x.params.schema, 'ohlcv-1s');
        assert.ok(gr.slice(0, i).some((p) => p.path.endsWith('get_cost') && p.params.start === x.params.start && p.params.symbols === x.params.symbols), 'świeży get_cost przed każdym get_range');
      }
      const S = await lib('lib/candles-store.mjs');
      const cov = S.readCoverage('NQ', { baseDir: R.dir });
      assert.deepEqual(cov['1s-NQM2024'], [[at('2024-03-08T14:30:00Z'), at('2024-03-08T16:00:00Z')], [at('2024-03-11T13:30:00Z'), at('2024-03-11T15:00:00Z')], [at('2024-03-12T13:30:00Z'), at('2024-03-12T15:00:00Z')]]);
      assert.deepEqual(cov['1s'], [[at('2024-03-07T14:30:00Z'), at('2024-03-07T16:00:00Z')], [at('2024-03-13T13:30:00Z'), at('2024-03-13T15:00:00Z')]]);
      // wykres czyta okno dnia rolla z warstwy kontraktu (atrapa: symbol surowy +55)
      const rd = R.C.read({ instrument: 'NQ', from: String(at('2024-03-08T14:30:00Z')), to: String(at('2024-03-08T16:00:00Z')), tf: '1s' });
      assert.equal(rd.layer, '1s'); assert.ok(rd.bars.length > 50 && rd.bars.every((b) => b[1] >= 5080), 'świece NQM4 w dniu rolla');
      const rd7 = R.C.read({ instrument: 'NQ', from: String(at('2024-03-07T14:30:00Z')), to: String(at('2024-03-07T16:00:00Z')), tf: '1s' });
      assert.ok(rd7.bars.length > 50 && rd7.bars.every((b) => b[1] < 5030), 'dzień przed rollem z .v.0 (NQH4)');
      // liczniki: kredyt aplikacji i budżet importu (pesymistycznie, przed get_range)
      assert.ok(Math.abs(R.st.cfg.chartCredit.spentUsd - (0.02 + 0.008)) < 1e-9, JSON.stringify(R.st.cfg.chartCredit));
      assert.ok(Math.abs(R.C.status().open1s.spentUsd - 0.008) < 1e-9);
      assert.deepEqual(R.C.status().result.batches, [[4, 0.008]]);
      // drugi przebieg: wszystko w magazynie
      const again = await R.C.importOpen({ instrument: 'NQ', from, to, dryRun: true });
      assert.equal(again.nothing, true); assert.equal(again.runs, 0);
      assert.deepEqual((await R.A.log()).violations, []);
    } finally { R.stop(); }
  });

  test('wykresy-27: P49 budżet: twardy stop, gdy wydane + następna partia > budżet (także po wznowieniu), partie ≤ 1 USD, okno ponad 1 USD odrzucone, licznik kredytu', async () => {
    const R = await direct({ clock: Date.UTC(2024, 0, 17, 12), atrapa: { end: '2024-01-17T10:00:00.000000000Z', cost: 0.3 } });
    try {
      const from = at('2024-01-08T00:00:00Z'), to = at('2024-01-17T00:00:00Z'); // 7 dni pon-pt (8–12, 15–16.01)
      const dry = await R.C.importOpen({ instrument: 'NQ', from, to, dryRun: true });
      assert.equal(dry.days, 7); assert.ok(Math.abs(dry.totalUsd - 2.1) < 1e-9);
      // budżet 1 USD: partia 1 (0,9) mieści się, partia 2 (0,9) już nie → stop po 3 get_range
      assert.equal((await R.C.importOpen({ instrument: 'NQ', from, to, confirmedCostUsd: dry.totalUsd, budgetUsd: 1 })).started, true); await R.idle();
      let s = R.C.status();
      assert.equal(s.error?.code, 'budget', JSON.stringify(s.error));
      assert.deepEqual(s.result.batches, [[3, 0.9]]);
      assert.equal((await calls(R.A, 'get_range')).length, 3);
      assert.ok(Math.abs(s.open1s.spentUsd - 0.9) < 1e-9 && Math.abs(R.st.cfg.chartCredit.spentUsd - 0.92) < 1e-9);
      // wznowienie z tym samym budżetem: stop przed pierwszym pobraniem (licznik importu przetrwał)
      const d2 = await R.C.importOpen({ instrument: 'NQ', from, to, dryRun: true });
      assert.equal(d2.days, 4);
      await assert.rejects(R.C.importOpen({ instrument: 'NQ', from, to, confirmedCostUsd: d2.totalUsd, budgetUsd: 1 }), (e) => e.code === 'budget' && e.status === 409);
      assert.equal((await calls(R.A, 'get_range')).length, 3, 'zero nowych get_range');
      // pełny budżet: reszta w partiach ≤ 1 USD
      assert.equal((await R.C.importOpen({ instrument: 'NQ', from, to, confirmedCostUsd: d2.totalUsd, budgetUsd: 36 })).started, true); await R.idle();
      s = R.C.status();
      assert.equal(s.error, null);
      assert.deepEqual(s.result.batches, [[3, 0.9], [1, 0.3]]);
      assert.ok(s.result.batches.every(([, u]) => u <= 1));
      assert.equal((await calls(R.A, 'get_range')).length, 7);
      assert.ok(Math.abs(s.open1s.spentUsd - 2.1) < 1e-9);
      // hak tuż przed get_range: świeża wycena ponad resztę budżetu zatrzymuje mimo przejścia kontroli partii
      const R2 = await direct({ clock: Date.UTC(2024, 0, 17, 12), atrapa: { end: '2024-01-17T10:00:00.000000000Z', cost: 0.2 } });
      try {
        const d = await R2.C.importOpen({ instrument: 'NQ', from: at('2024-01-08T00:00:00Z'), to: at('2024-01-10T00:00:00Z'), dryRun: true }); // 2 okna × 0,2
        await R2.A.config({ costs: [0.2, 0.21], cost: 0.21 }); // start bierze wyceny z dryRun; świeże przed get_range: 0,2 i 0,21 (oba okna naraz)
        assert.equal((await R2.C.importOpen({ instrument: 'NQ', from: at('2024-01-08T00:00:00Z'), to: at('2024-01-10T00:00:00Z'), confirmedCostUsd: d.totalUsd, budgetUsd: 0.4 })).started, true); await R2.idle();
        assert.equal(R2.C.status().error?.code, 'budget');
        assert.equal((await calls(R2.A, 'get_range')).length, 1, 'drugie okno (0,21) przekroczyłoby budżet 0,4: bez get_range');
        const sp = R2.C.status().open1s.spentUsd;
        assert.ok(Math.abs(sp - 0.2) < 1e-9 || Math.abs(sp - 0.21) < 1e-9, 'jedno okno (kolejność odpowiedzi dowolna): ' + sp);
      } finally { R2.stop(); }
      // okno droższe niż 1 USD: odmowa przed pobraniem
      const R3 = await direct({ clock: Date.UTC(2024, 0, 17, 12), atrapa: { end: '2024-01-17T10:00:00.000000000Z', cost: 1.5 } });
      try {
        const d = await R3.C.importOpen({ instrument: 'NQ', from, to, dryRun: true });
        await assert.rejects(R3.C.importOpen({ instrument: 'NQ', from, to, confirmedCostUsd: d.totalUsd, budgetUsd: 36 }), (e) => e.code === 'over-limit');
        assert.equal((await calls(R3.A, 'get_range')).length, 0);
      } finally { R3.stop(); }
    } finally { R.stop(); }
  });

  test('wykresy-27: P49 skrypt CLI: domyślnie sama wycena, wycena ponad budżet zatrzymuje przed pobraniem, pobranie z kwotą, wznowienie po 429, trasa tylko przez guardWrite', async () => {
    const dir = H.tmp();
    const A = await H.atrapaDb(++port);
    const S = await H.server(++port, { THQ_CONFIG_DIR: dir, DATABENTO_API_BASE: A.base, DATABENTO_API_KEY: KEY });
    const cli = (...args) => new Promise((resolve) => {
      const p = spawn(process.execPath, [path.join(ROOT, 'narzedzia/import-okien-1s.mjs'), `--port=${S.port}`, '--od=2026-10-19', '--do=2026-10-28', ...args], { env: H.cleanEnv({ IMPORT_RETRY_MS: '100' }), windowsHide: true });
      let out = '', err = '';
      p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
      const tm = setTimeout(() => p.kill(), 90_000);
      p.on('close', (code) => { clearTimeout(tm); resolve({ code, out, err }); });
    });
    try {
      const raw = await fetch(S.base + '/api/candles/import-1s', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
      assert.equal(raw.status, 403, 'bez nagłówków strony');
      await A.config({ cost: 0.01 });
      const c1 = await cli();
      assert.equal(c1.code, 0, c1.err); assert.match(c1.out, /Tryb wyceny: nic nie pobrano/); assert.match(c1.out, /dni do pobrania 6/); // 19–23 i 26.10 (27.10 po końcu danych atrapy)
      assert.equal((await calls(A, 'get_range')).length, 0, 'CLI bez kwoty nie pobiera');
      assert.equal((await cli('--budzet-usd=10')).code, 1, 'budżet bez potwierdzenia kwoty');
      assert.equal((await cli('--potwierdzam-usd=1', '--budzet-usd=40')).code, 1, 'budżet ponad 36 USD');
      await A.config({ cost: 7 });
      const c2 = await cli('--potwierdzam-usd=42');
      assert.equal(c2.code, 1); assert.match(c2.err, /przekracza pozostały budżet/);
      assert.equal((await calls(A, 'get_range')).length, 0, 'wycena 42 USD > 36 USD: nic nie pobrano');
      // --bez-wyceny (29.10.2026): bez wyceny całości, ale z górną granicą; rok droższy niż reszta granicy i okno ponad 1 USD odrzucone bez pobrania
      assert.equal((await cli('--bez-wyceny')).code, 1, 'bez wyceny tylko z kwotą');
      const n1 = await cli('--bez-wyceny', '--potwierdzam-usd=36');
      assert.equal(n1.code, 1); assert.match(n1.err, /przekracza resztę górnej granicy 36\.0000 USD/, 'rok za 42 USD > 36 USD');
      const n1b = await cli('--bez-wyceny', '--potwierdzam-usd=36', '--od=2026-10-19', '--do=2026-10-20'); // jedno okno za 7 USD
      assert.equal(n1b.code, 1); assert.match(n1b.err, /przekracza limit 1 USD/);
      await A.config({ cost: 0.01 });
      const n2 = await cli('--bez-wyceny', '--potwierdzam-usd=0.03');
      assert.equal(n2.code, 1); assert.match(n2.err, /przekracza resztę górnej granicy/);
      assert.equal((await calls(A, 'get_range')).length, 0, 'odmowy bez wyceny nic nie pobierają');
      const n3 = await cli('--od=2026-10-12', '--do=2026-10-17', '--bez-wyceny', '--potwierdzam-usd=1');
      assert.equal(n3.code, 0, n3.err); assert.match(n3.out, /Bez wyceny całości/); assert.doesNotMatch(n3.out, /dni do pobrania|Razem:/);
      assert.equal((await calls(A, 'get_range')).length, 5, '12–16.10: 5 okien');
      await A.reset();
      // pobranie z jednym 429 po drugim oknie: skrypt sam wznawia
      await A.config({ cost: 0.01, failRangeAfter: 2, failRangeCount: 1 });
      const c3 = await cli('--potwierdzam-usd=0.06');
      assert.equal(c3.code, 0, c3.err + c3.out); assert.match(c3.err, /wznawiam/); assert.match(c3.out, /Koniec\. Wydano/);
      const ok = (await A.log()).log.filter((e) => e.path.endsWith('get_range'));
      assert.equal(ok.length, 7, '6 okien + 1 odrzucone 429');
      const st = (await (await fetch(S.base + '/api/candles/status')).json());
      assert.ok(st.open1s.spentUsd >= 0.11 - 1e-9 && st.open1s.spentUsd <= 0.12 + 1e-9, 'licznik importu (0,05 z przebiegu bez wyceny + 6 okien, (pesymistycznie liczy też okno z 429): ' + st.open1s.spentUsd);
      const c4 = await cli();
      assert.match(c4.out, /wszystko już w magazynie/);
      const cfg = JSON.parse(readFileSync(path.join(dir, 'config.local.json'), 'utf8'));
      assert.ok(cfg.chartCredit.spentUsd > 0.08, 'licznik kredytu aplikacji');
      assert.ok(!c3.out.includes(KEY) && !c3.err.includes(KEY));
    } finally { S.stop(); A.stop(); }
  });
};
