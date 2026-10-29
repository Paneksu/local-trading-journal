// wykresy-04: API świec (odczyt bez sieci, wycena i pobranie po kliknięciu, scalanie końcówek, klucz i limit, ochrona zapisu). Tylko atrapa Databento.
import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const KEY = 'db-test-key-0123456789abcdef';
  let port = 4740;
  const utc = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
  const D26 = utc(2026, 10, 26), D27 = utc(2026, 10, 27), D28 = utc(2026, 10, 28);
  const store = () => import(pathToFileURL(path.join(ROOT, 'lib/candles-store.mjs')).href);
  const sleep = H.sleep;

  async function rig({ key = KEY, env = {} } = {}) {
    const dir = H.tmp();
    const A = await H.atrapaDb(++port);
    const S = await H.server(++port, { THQ_CONFIG_DIR: dir, DATABENTO_API_BASE: A.base, ...(key ? { DATABENTO_API_KEY: key } : {}), ...env });
    const get = async (p) => { const r = await fetch(S.base + p); return { status: r.status, j: await r.json() }; };
    const post = (p, b) => H.dash(S.base, p, b);
    const q = (o) => '?' + new URLSearchParams(o).toString();
    const waitDone = async () => { for (let i = 0; i < 100; i++) { const s = (await get('/api/candles/status')).j; if (!s.running) return s; await sleep(50); } throw new Error('pobieranie nie kończy się'); };
    const stop = () => { S.stop(); A.stop(); };
    return { dir, A, S, get, post, q, waitDone, stop, base: path.join(dir, 'chart-data') };
  }
  const calls = async (A, name) => (await A.log()).log.filter((e) => e.path.endsWith(name));

  test('wykresy-04: GET /api/candles: walidacja, brak źródła dla EURUSD/XAUUSD, zero żądań do atrapy', async () => {
    const R = await rig();
    try {
      const ok = { instrument: 'ES', from: String(D26), to: String(D26 + 3600), tf: '1m' };
      for (const bad of [{ instrument: 'E S' }, { instrument: '' }, { tf: '0m' }, { tf: 'abc' }, { tf: '10000s' }, { from: 'x' }, { from: '5' }, { to: String(D26) }, { to: String(D26 - 5) }, { to: String(D26 + 401 * 86400) }]) {
        const r = await R.get('/api/candles' + R.q({ ...ok, ...bad }));
        assert.ok([400, 422].includes(r.status), JSON.stringify(bad) + ' → ' + r.status);
        assert.ok(r.j.error && !r.j.error.includes(KEY));
      }
      assert.equal((await R.get('/api/candles' + R.q({ instrument: 'ES' }))).status, 400);
      for (const i of ['EURUSD', 'XAUUSD', 'ES.FUT']) {
        const r = await R.get('/api/candles' + R.q({ ...ok, instrument: i.replace('.', '') }));
        assert.equal(r.status, 200); assert.equal(r.j.noSource, true); assert.match(r.j.message, /Brak źródła danych/);
        for (const p of ['quote', 'fetch']) { const x = await R.post('/api/candles/' + p, { instrument: i.replace('.', ''), from: String(D26), to: String(D26 + 3600), confirmedCostUsd: 1 }); assert.equal(x.j.noSource, true); }
      }
      const good = await R.get('/api/candles' + R.q(ok));
      assert.equal(good.status, 200);
      assert.deepEqual(good.j.bars, []);
      assert.equal(good.j.data, 'ES'); assert.equal(good.j.tf, '1m'); assert.equal(good.j.availableEnd, null);
      assert.deepEqual((await R.A.log()).log, [], 'GET i brak źródła nic nie pobierają z sieci');
    } finally { R.stop(); }
  });

  test('wykresy-04: limit 50 000 świec (422 z podpowiedzią), missing/covered/derived/rolls z coverage.json, ceny dziesiętne', async () => {
    const R = await rig();
    try {
      const C = await store();
      const bars = Array.from({ length: 51000 }, (_, i) => [D26 + i, 502500 + (i % 4) * 25, 502600, 502400, 502525, 1]);
      C.writeRange('ES', '1s', D26, D26 + 51000, bars, { rolls: [{ t: D26 + 100, label: '1→2' }] }, { baseDir: R.base });
      const r = await R.get('/api/candles' + R.q({ instrument: 'ES', from: String(D26), to: String(D26 + 51000), tf: '1s' }));
      assert.equal(r.status, 422); assert.match(r.j.error, /Wybierz większy interwał albo krótszy zakres/);
      const m = await R.get('/api/candles' + R.q({ instrument: 'MES', from: String(D26 - 3 * 86400), to: String(D27 + 86400), tf: '1h' }));
      assert.equal(m.status, 200);
      assert.equal(m.j.layer, '1m');
      assert.equal(m.j.missing[0][0], D26 - 3 * 86400, 'warstwa 1m w całości do pobrania (koniec zależy od zegara)');
      assert.deepEqual(m.j.rolls, [], 'P35: znaczniki z granic odcinków serii (nazwy kontraktów); wpis rolls spoza okna rolla rynku (dane testowe) nic nie zmienia');
      assert.deepEqual(m.j.covered, [], 'pokrycie warstwy 1m puste');
      assert.deepEqual(m.j.derived, [[D26, D26 + 51000]], '1m w oknie 1s uzupełniona agregacją w pamięci');
      assert.ok(m.j.bars.length >= 14 && m.j.bars.length <= 16, '14 godzin okna → 14-15 świec 1h, było ' + m.j.bars.length);
      const one = await R.get('/api/candles' + R.q({ instrument: 'ES', from: String(D26), to: String(D26 + 120), tf: '1s' }));
      assert.equal(one.j.layer, '1s'); assert.deepEqual(one.j.covered, [[D26, D26 + 120]]); assert.deepEqual(one.j.missing, []);
      assert.deepEqual(one.j.bars.slice(0, 2), [[D26, 5025, 5026, 5024, 5025.25, 1], [D26 + 1, 5025.25, 5026, 5024, 5025.25, 1]]);
      // TF < 1m poza oknem 1s: pusto, warstwa 1s, brakujący zakres wskazany (nie z warstwy 1m)
      const out = await R.get('/api/candles' + R.q({ instrument: 'ES', from: String(D26 + 80000), to: String(D26 + 80120), tf: '15s' }));
      assert.deepEqual(out.j.bars, []); assert.equal(out.j.layer, '1s'); assert.deepEqual(out.j.missing, [[D26 + 80000, D26 + 80120]]);
      assert.deepEqual((await R.A.log()).log, []);
    } finally { R.stop(); }
  });

  test('wykresy-04: quote i fetch: get_cost przed get_range, MES→ES, powtórka nic nie pobiera, warstwa 1m prosto z serwera, postęp w /status, liczniki w config', async () => {
    const R = await rig();
    try {
      const body = { instrument: 'MES', from: String(D26), to: String(D27) };
      const before = await R.get('/api/candles' + R.q({ instrument: 'ES', from: body.from, to: body.to, tf: '1m' }));
      assert.deepEqual(before.j.missing, [[D26, D27]]); assert.deepEqual(before.j.bars, []);
      assert.deepEqual((await R.A.log()).log, []);
      const qt = await R.post('/api/candles/quote', body);
      assert.equal(qt.status, 200);
      assert.equal(qt.j.layer, '1m'); assert.equal(qt.j.costUsd, 0.002); assert.equal(qt.j.limitUsd, 1); assert.deepEqual(qt.j.ranges, [[D26, D27]]); assert.equal(qt.j.overLimit, false);
      assert.equal(qt.j.availableEnd, utc(2026, 10, 27, 10)); assert.equal(qt.j.credit.leftUsd, 124.98);
      assert.deepEqual((await calls(R.A, 'get_range')), [], 'quote nie pobiera');
      const f = await R.post('/api/candles/fetch', { ...body, confirmedCostUsd: qt.j.costUsd });
      assert.equal(f.status, 200); assert.equal(f.j.started, true);
      const st = await R.waitDone();
      assert.equal(st.error, null); assert.equal(st.done, 1); assert.equal(st.total, 1); assert.equal(st.result.added, 1440);
      const L = await R.A.log();
      assert.deepEqual(L.violations, []);
      assert.ok(L.log.every((e) => !e.params.symbols || e.params.symbols === 'ES.v.0'), 'MES poszło jako ES.v.0');
      assert.ok(L.log.filter((e) => e.params.schema).every((e) => e.params.schema === 'ohlcv-1m'), 'domyślna warstwa to 1m (ohlcv-1m)'); // P35: darmowe symbology.resolve nie ma schemy
      const seq = L.log.map((e) => e.path.replace('/v0/metadata.', '').replace('/v0/timeseries.', ''));
      // P35: pierwszy plan dociąga raz darmowe symbology.resolve (przełączenia .v.0 i nazwy kontraktów); nic płatnego poza get_range
      assert.deepEqual(seq.filter((x) => x !== 'get_dataset_range'), ['/v0/symbology.resolve', 'get_cost', 'get_cost', 'get_cost', 'get_range']);
      assert.ok(seq.lastIndexOf('get_cost') < seq.indexOf('get_range'));
      const m1 = await R.get('/api/candles' + R.q({ instrument: 'ES', from: body.from, to: body.to, tf: '1m' }));
      assert.deepEqual(m1.j.missing, []); assert.deepEqual(m1.j.covered, [[D26, D27]]);
      assert.equal(m1.j.bars.length, 1440, 'warstwa 1m dokładnie z serwera, bez agregacji');
      assert.deepEqual(m1.j.bars[0].slice(0, 3), [D26, 5025, 5025.5]);
      // P55 (29.10.2026), «znajdz rozwiazanie tak zeby nie bylo pustych pol»: TF poniżej minuty bez okna 1s dzieli świece 1m (dawniej: pusto, missing = cały zakres)
      const s1 = await R.get('/api/candles' + R.q({ instrument: 'ES', from: body.from, to: body.to, tf: '30s' }));
      assert.equal(s1.j.bars.length, 2880, 'dwie świece 30s na każdą minutę 1m'); assert.ok(s1.j.bars.every((b) => b[6] === 1), 'wszystkie z podziału 1m'); assert.deepEqual(s1.j.missing, []); assert.deepEqual(s1.j.synth, [[D26, D27]]);
      // powtórne pobranie tych samych dni: zero nowych żądań cenowych
      const n0 = (await R.A.log()).log.length;
      const q2 = await R.post('/api/candles/quote', body);
      assert.equal(q2.j.nothing, true); assert.equal(q2.j.costUsd, 0);
      const f2 = await R.post('/api/candles/fetch', { ...body, confirmedCostUsd: 0 });
      assert.equal(f2.j.nothing, true); assert.equal(f2.j.started, false);
      const after = (await R.A.log()).log.slice(n0).filter((e) => /get_cost|get_range/.test(e.path));
      assert.deepEqual(after, []);
      await sleep(250);
      const cfg = JSON.parse(readFileSync(path.join(R.dir, 'config.local.json'), 'utf8'));
      assert.equal(cfg.chartSpend.usd, 0.002); assert.equal(cfg.chartCredit.spentUsd, 0.022);
    } finally { R.stop(); }
  });

  test('wykresy-04: availableEnd: przycięcie do końca danych, dociągnięcie samej końcówki bez duplikatów, pokrycie scalone', async () => {
    const R = await rig();
    try {
      const body = { instrument: 'ES', from: String(D27), to: String(D28) };
      const q1 = await R.post('/api/candles/quote', body);
      assert.equal(q1.j.to, utc(2026, 10, 27, 10), 'zakres przycięty do availableEnd');
      assert.equal((await R.post('/api/candles/fetch', { ...body, confirmedCostUsd: q1.j.costUsd })).j.started, true);
      await R.waitDone();
      const cov = JSON.parse(readFileSync(path.join(R.base, 'candles/ES/coverage.json'), 'utf8'));
      assert.deepEqual(cov['1m'], [[D27, utc(2026, 10, 27, 10)]]);
      const g1 = await R.get('/api/candles' + R.q({ instrument: 'ES', from: body.from, to: body.to, tf: '1m' }));
      assert.equal(g1.j.bars.length, 600); assert.equal(g1.j.availableEnd, utc(2026, 10, 27, 10));
      assert.deepEqual(g1.j.missing, [], 'reszta dnia po availableEnd nie jest "do pobrania"');
      // koniec danych przesunięty o 2 h: bez refresh cache 15 min nie widzi zmiany (bez pobierania), z refresh dociąga tylko końcówkę
      await R.A.config({ end: '2026-10-27T12:00:00.000000000Z' });
      assert.equal((await R.post('/api/candles/quote', body)).j.nothing, true, 'cache availableEnd jeszcze ważny');
      await R.A.reset();
      const q2 = await R.post('/api/candles/quote', { ...body, refresh: true });
      assert.equal(q2.j.to, utc(2026, 10, 27, 12));
      const cost = (await calls(R.A, 'get_cost'))[0].params;
      assert.equal(cost.start, '2026-10-27T10:00:00Z'); assert.equal(cost.end, '2026-10-27T12:00:00Z');
      await R.post('/api/candles/fetch', { ...body, confirmedCostUsd: q2.j.costUsd });
      await R.waitDone();
      const rg = (await calls(R.A, 'get_range'))[0].params;
      assert.equal(rg.start, '2026-10-27T10:00:00Z'); assert.equal(rg.end, '2026-10-27T12:00:00Z');
      const g2 = await R.get('/api/candles' + R.q({ instrument: 'ES', from: body.from, to: body.to, tf: '1m' }));
      assert.equal(g2.j.bars.length, 720);
      const ts = g2.j.bars.map((b) => b[0]);
      assert.equal(new Set(ts).size, ts.length, 'bez duplikatów'); assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
      assert.deepEqual(g2.j.covered, [[D27, utc(2026, 10, 27, 12)]], 'pokrycie scalone w jeden zakres');
    } finally { R.stop(); }
  });

  test('wykresy-04: trade nowszy niż availableEnd: stan jeszcze niedostępne, zero get_cost i get_range', async () => {
    const R = await rig();
    try {
      const body = { instrument: 'NQ', from: String(utc(2026, 10, 27, 14)), to: String(utc(2026, 10, 27, 15)) };
      const q = await R.post('/api/candles/quote', body);
      assert.equal(q.j.unavailable, true); assert.equal(q.j.costUsd, 0); assert.ok(q.j.retryAfter > Number(body.from));
      const f = await R.post('/api/candles/fetch', { ...body, confirmedCostUsd: 1 });
      assert.equal(f.j.unavailable, true); assert.equal(f.j.started, false);
      const g = await R.get('/api/candles' + R.q({ instrument: 'NQ', from: body.from, to: body.to, tf: '1m' }));
      assert.equal(g.j.unavailable, true); assert.equal(g.j.availableEnd, utc(2026, 10, 27, 10));
      assert.deepEqual(g.j.missing, [], 'zakres w całości po availableEnd nie jest "do pobrania"');
      const g3 = await R.get('/api/candles' + R.q({ instrument: 'NQ', from: String(utc(2026, 10, 27, 9)), to: String(utc(2026, 10, 27, 11)), tf: '1m' }));
      assert.deepEqual(g3.j.missing, [[utc(2026, 10, 27, 9), utc(2026, 10, 27, 10)]], 'dostępna część jest do pobrania, reszta nie');
      const L = await R.A.log();
      assert.deepEqual(L.log.filter((e) => /get_cost|get_range/.test(e.path)), []);
    } finally { R.stop(); }
  });

  test('wykresy-04: bezpieczniki kosztu w fetch: bez potwierdzenia, wycena wyższa niż potwierdzona, ponad limit: zero get_range; dwa okna = postęp 2/2', async () => {
    const R = await rig();
    try {
      const body = { instrument: 'ES', from: String(D26), to: String(D27) };
      assert.equal((await R.post('/api/candles/fetch', body)).status, 400);
      assert.equal((await R.post('/api/candles/fetch', { ...body, confirmedCostUsd: '0.002' })).status, 400);
      let r = await R.post('/api/candles/fetch', { ...body, confirmedCostUsd: 0.0001 });
      assert.equal(r.status, 409); assert.match(r.j.error, /wzrósł/);
      await R.A.config({ cost: 2 });
      r = await R.post('/api/candles/fetch', { ...body, confirmedCostUsd: 2 });
      assert.equal(r.status, 409); assert.match(r.j.error, /przekracza limit 1 USD/);
      assert.equal((await R.post('/api/candles/quote', body)).j.overLimit, true);
      assert.equal((await R.post('/api/candles/limit', { maxCostUsd: 5 })).j.limitUsd, 5);
      assert.equal((await R.get('/api/meta')).j.chartCostLimitUsd, 5);
      assert.equal((await R.post('/api/candles/limit', { maxCostUsd: 1 })).j.limitUsd, 1);
      assert.deepEqual(await calls(R.A, 'get_range'), [], 'żadnego get_range po odrzuceniach');
      // dwa rozłączne okna (26 i 28) po 0,3 USD
      await R.A.config({ cost: 0.3 });
      const two = { instrument: 'ES', from: String(D26), to: String(D28 + 3600) };
      const wide = await R.post('/api/candles/quote', { ...two, to: String(D28 + 3600), refresh: true });
      await R.A.config({ end: '2026-10-29T00:00:00.000000000Z' });
      const q = await R.post('/api/candles/quote', { ...two, refresh: true });
      assert.equal(wide.status, 200);
      assert.deepEqual(q.j.ranges, [[D26, D28 + 3600]]);
      // pierwsze okno już pobrane: zostaje jedno ciągłe (27-28) przy 26 pobranym osobno
      await R.A.reset();
      const C = await store();
      C.writeRange('ES', '1m', D27, D28, [], {}, { baseDir: R.base });
      const q3 = await R.post('/api/candles/quote', two);
      assert.deepEqual(q3.j.ranges, [[D26, D27], [D28, D28 + 3600]]);
      assert.equal(q3.j.costUsd, 0.6, 'dwa okna po 0,3 USD');
      const f = await R.post('/api/candles/fetch', { ...two, confirmedCostUsd: q3.j.costUsd });
      assert.equal(f.j.runs, 2);
      const st = await R.waitDone();
      assert.equal(st.error, null); assert.equal(st.done, 2); assert.equal(st.total, 2);
      assert.equal((await calls(R.A, 'get_range')).length, 2);
    } finally { R.stop(); }
  });

  test('wykresy-04: błąd Databento w trakcie pobierania trafia do /status bez klucza i nie zostawia dnia', async () => {
    const R = await rig();
    try {
      const body = { instrument: 'ES', from: String(D26), to: String(D27) };
      await R.A.config({ fail: { path: '/v0/timeseries.get_range', status: 429 } });
      assert.equal((await R.post('/api/candles/fetch', { ...body, confirmedCostUsd: 0.002 })).j.started, true);
      const st = await R.waitDone();
      assert.equal(st.error.code, 'rate-limit'); assert.ok(!JSON.stringify(st).includes(KEY));
      assert.ok(!existsSync(path.join(R.base, 'candles/ES/coverage.json')));
      assert.equal((await R.get('/api/candles' + R.q({ instrument: 'ES', from: body.from, to: body.to, tf: '1m' }))).j.missing.length, 1);
    } finally { R.stop(); }
  });

  test('wykresy-04: POST bez X-THQ/Origin → 403 (nic nie dociera do atrapy); zapis klucza do .env po bezpłatnej weryfikacji; meta bez klucza', async () => {
    const R = await rig({ key: '' });
    try {
      assert.equal((await R.get('/api/meta')).j.hasDatabentoKey, false);
      for (const p of ['quote', 'fetch', 'key', 'limit']) {
        const raw = await fetch(R.S.base + '/api/candles/' + p, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
        assert.equal(raw.status, 403, p + ' bez Origin/X-THQ');
        const evil = await H.dash(R.S.base, '/api/candles/' + p, { key: KEY }, { origin: 'http://evil.example' });
        assert.equal(evil.status, 403, p + ' obcy Origin');
      }
      const get405 = await fetch(R.S.base + '/api/candles/fetch', { method: 'PUT', body: '{}' });
      assert.equal(get405.status, 405);
      assert.deepEqual((await R.A.log()).log, []);
      // brak klucza: quote odmawia, nic nie wychodzi
      const body = { instrument: 'ES', from: String(D26), to: String(D27) };
      const nk = await R.post('/api/candles/quote', body);
      assert.equal(nk.status, 409); assert.match(nk.j.error, /Brak klucza Databento/);
      // zły format
      assert.equal((await R.post('/api/candles/key', { key: 'a b' })).status, 400);
      // klucz odrzucony przez Databento (atrapa zna tylko KEY): .env nie powstaje
      const wrong = await R.post('/api/candles/key', { key: 'inny-klucz-0123456789' });
      assert.equal(wrong.status, 502); assert.ok(!JSON.stringify(wrong.j).includes('inny-klucz'));
      assert.ok(!existsSync(path.join(R.dir, '.env')));
      // dobry klucz: get_dataset_range + get_cost na 1 minutę, potem zapis
      const ok = await R.post('/api/candles/key', { key: KEY });
      assert.equal(ok.status, 200); assert.deepEqual(ok.j, { ok: true });
      assert.match(readFileSync(path.join(R.dir, '.env'), 'utf8'), new RegExp(`^DATABENTO_API_KEY=${KEY}$`, 'm'));
      const L = await R.A.log();
      const cost = L.log.filter((e) => e.path.endsWith('get_cost') && e.params.symbols === 'ES.v.0').pop().params;
      assert.equal(Date.parse(cost.end) - Date.parse(cost.start), 60_000, 'sprawdzenie klucza = 1 minuta');
      assert.equal(L.log.filter((e) => e.path.endsWith('get_range')).length, 0);
      const meta = await R.get('/api/meta');
      assert.equal(meta.j.hasDatabentoKey, true); assert.ok(!JSON.stringify(meta.j).includes(KEY));
      assert.equal((await R.post('/api/candles/quote', body)).status, 200, 'po zapisie klucz działa bez restartu');
    } finally { R.stop(); }
  });

  test('wykresy-04: limit kosztu w config.local.json (nie w settings), walidacja; klucza nie ma w logach serwera ani odpowiedziach; PROTECTED i .gitignore', async () => {
    const R = await rig();
    const bodies = [];
    const rec = async (p) => { const r = await R.post(p, { instrument: 'ES', from: String(D26), to: String(D27), confirmedCostUsd: 0.002 }); bodies.push(JSON.stringify(r)); return r; };
    try {
      for (const bad of [0, -1, 101, '1', null, NaN]) assert.equal((await R.post('/api/candles/limit', { maxCostUsd: bad })).status, 400);
      assert.equal((await R.post('/api/candles/limit', { maxCostUsd: 0.25 })).j.limitUsd, 0.25);
      await sleep(250);
      const cfg = JSON.parse(readFileSync(path.join(R.dir, 'config.local.json'), 'utf8'));
      assert.equal(cfg.chartCostLimitUsd, 0.25);
      assert.ok(!('settings' in cfg) || !JSON.stringify(cfg.settings).includes('chartCostLimitUsd'));
      assert.ok(!JSON.stringify(cfg).includes(KEY));
      await rec('/api/candles/quote'); await rec('/api/candles/fetch'); await R.waitDone();
      bodies.push(JSON.stringify((await R.get('/api/candles/status')).j), JSON.stringify((await R.get('/api/meta')).j));
      await R.post('/api/candles/key', { key: 'zly-klucz-0123456789' });
      for (const b of bodies) assert.ok(!b.includes(KEY), 'klucz w odpowiedzi API');
      assert.ok(!(R.S.p.out + R.S.p.err).includes(KEY), 'klucz w stdout/stderr serwera');
      assert.ok(!(R.A.p.out + R.A.p.err).includes(KEY));
      const U = await import(pathToFileURL(path.join(ROOT, 'lib/updater.mjs')).href);
      const E = await import(pathToFileURL(path.join(ROOT, 'lib/env.mjs')).href);
      assert.ok(U.PROTECTED.includes('chart-data')); assert.ok(U.isProtected('chart-data/candles/ES/coverage.json'));
      assert.ok(E.ENV_KEYS.includes('DATABENTO_API_KEY'));
      assert.match(readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /^chart-data\/\r?$/m);
    } finally { R.stop(); }
  });
  test('wykresy-04: cleanEnv: klucz Databento z procesu rodzica nie dociera do serwera testowego', async () => {
    const old = process.env.DATABENTO_API_KEY;
    process.env.DATABENTO_API_KEY = 'klucz-rodzica-0123456789';
    try {
      assert.equal(H.cleanEnv().DATABENTO_API_KEY, undefined);
      assert.equal(H.cleanEnv().DATABENTO_API_BASE, 'http://127.0.0.1:9');
      const R = await rig({ key: '' });
      try { assert.equal((await R.get('/api/meta')).j.hasDatabentoKey, false); } finally { R.stop(); }
    } finally { if (old === undefined) delete process.env.DATABENTO_API_KEY; else process.env.DATABENTO_API_KEY = old; }
  });

  test('wykresy-04: dwa równoległe POST /fetch: dokładnie jeden get_range; blokada zwolniona po błędzie', async () => {
    const R = await rig();
    try {
      const body = { instrument: 'ES', from: String(D26), to: String(D27), confirmedCostUsd: 0.002 };
      const rs = await Promise.all([R.post('/api/candles/fetch', body), R.post('/api/candles/fetch', body)]);
      await R.waitDone();
      assert.equal((await calls(R.A, 'get_range')).length, 1, 'jedno pobranie mimo dwóch żądań');
      assert.ok(rs.some((r) => r.j.started === true));
      assert.ok(rs.every((r) => [200, 409].includes(r.status)));
      // błąd przed pobraniem nie zostawia blokady
      const R2 = await rig();
      try {
        await R2.A.config({ cost: 2 });
        assert.equal((await R2.post('/api/candles/fetch', { ...body, confirmedCostUsd: 2 })).status, 409);
        await R2.A.config({ cost: 0.002 });
        assert.equal((await R2.post('/api/candles/fetch', body)).j.started, true);
      } finally { R2.stop(); }
    } finally { R.stop(); }
  });

  test('wykresy-04: łączny limit w pętli okien: wycena okna powyżej reszty limitu przerywa przed get_range', async () => {
    const R = await rig();
    try {
      const C = await store();
      C.writeRange('ES', '1m', D27, D28, [], {}, { baseDir: R.base });
      await R.A.config({ end: '2026-10-29T00:00:00.000000000Z', costs: [0.5, 0.5, 0.52] }); // wyceny okien, potem świeża wycena okna 1 (+4%)
      const r = await R.post('/api/candles/fetch', { instrument: 'ES', from: String(D26), to: String(D28 + 3600), confirmedCostUsd: 1, refresh: true });
      assert.equal(r.j.runs, 2);
      const st = await R.waitDone();
      assert.equal(st.error.code, 'over-limit'); assert.equal(st.done, 1);
      assert.equal((await calls(R.A, 'get_range')).length, 1, 'drugie okno nie zostało pobrane');
    } finally { R.stop(); }
  });

  test('wykresy-04: ciało null i limit poniżej 0,01 → 4xx, nie 500', async () => {
    const R = await rig();
    try {
      for (const p of ['quote', 'fetch', 'key', 'limit']) {
        const r = await fetch(R.S.base + '/api/candles/' + p, { method: 'POST', body: 'null', headers: { Origin: R.S.base, 'X-THQ': '1', 'Content-Type': 'application/json' } });
        assert.ok(r.status >= 400 && r.status < 500, p + ' → ' + r.status);
      }
      assert.equal((await R.post('/api/candles/limit', { maxCostUsd: 0.005 })).status, 400);
      assert.equal((await R.post('/api/candles/limit', { maxCostUsd: 0.01 })).status, 200);
    } finally { R.stop(); }
  });
  test('wykresy-04: dzienny sufit wydatków (P24): drugie pobranie ponad sufit odrzucone, następnego dnia UTC przechodzi; licznik w config, edycja 0,01-100', async () => {
    const A = await H.atrapaDb(++port);
    const old = process.env.DATABENTO_API_BASE;
    process.env.DATABENTO_API_BASE = A.base;
    try {
      const { createCandles } = await import(pathToFileURL(path.join(ROOT, 'lib/candles.mjs')).href);
      const cfg = {};
      let clock = Date.UTC(2026, 9, 27, 12);
      const C = createCandles({ getKey: () => KEY, getConfig: () => cfg, baseDir: H.tmp(), now: () => clock });
      await A.config({ cost: 0.006 });
      const sl = C.setLimit({ dailyLimitUsd: 0.01 }); assert.equal(sl.limitUsd, 1); assert.equal(sl.dailyLimitUsd, 0.01); assert.equal(sl.credit.leftUsd, 124.98);
      for (const bad of [{ dailyLimitUsd: 0.009 }, { dailyLimitUsd: 101 }, { dailyLimitUsd: '3' }, {}, null, { maxCostUsd: 1, dailyLimitUsd: 0 }]) assert.throws(() => C.setLimit(bad), (e) => e.status === 400);
      assert.equal(cfg.chartDailyLimitUsd, 0.01);
      const wait = async () => { for (let i = 0; i < 100 && C.status().running; i++) await sleep(30); };
      const d25 = { instrument: 'ES', from: String(utc(2026, 10, 25, 22)), to: String(D26), confirmedCostUsd: 0.006 };
      const d26 = { instrument: 'ES', from: String(D26), to: String(D27), confirmedCostUsd: 0.006 };
      assert.equal((await C.fetchDays(d25)).started, true); await wait();
      assert.equal(C.status().error, null);
      assert.equal(cfg.chartSpend.usd, 0.006); assert.equal(cfg.chartSpend.day, '2026-10-27');
      await assert.rejects(C.fetchDays(d26), (e) => e.code === 'daily-limit' && e.status === 409 && /0.0060/.test(e.message));
      assert.equal((await calls(A, 'get_range')).length, 1, 'drugie pobranie nie doszło do get_range');
      assert.equal(C.status().running, false, 'blokada zwolniona po odrzuceniu');
      clock += 86400_000; // następna doba UTC: licznik liczy od zera
      assert.equal(C.spentToday(), 0);
      assert.equal((await C.fetchDays(d26)).started, true); await wait();
      assert.equal(C.status().error, null);
      assert.equal((await calls(A, 'get_range')).length, 2);
      assert.deepEqual(cfg.chartSpend, { day: '2026-10-28', usd: 0.006 });
      assert.equal(createCandles({ getKey: () => KEY, getConfig: () => ({}), baseDir: H.tmp() }).dailyLimitUsd(), 3, 'domyślnie 3 USD');
    } finally { if (old === undefined) delete process.env.DATABENTO_API_BASE; else process.env.DATABENTO_API_BASE = old; A.stop(); }
  });
};
