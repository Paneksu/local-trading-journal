// wykresy-03: klient Databento na atrapie (bezpieczniki kosztu, symbole, parser CSV, błędy, brak klucza w wyjściu). Zero prawdziwej sieci.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const KEY = 'db-test-key-0123456789abcdef';
  let port = 4720;
  const load = () => import(pathToFileURL(path.join(ROOT, 'lib/databento.mjs')).href);
  const T0 = Date.UTC(2026, 9, 26, 14, 30) / 1000; // 26.10.2026 14:30Z
  const rig = async (extra = {}) => {
    const D = await load();
    const A = await H.atrapaDb(++port);
    const client = D.createDatabento({ key: KEY, base: A.base, ...extra });
    return { D, A, client };
  };
  const paths = (log) => log.log.map((e) => e.path.replace('/v0/', ''));

  test('wykresy-03: mapa instrumentów (MES→ES, MNQ→NQ), brak .FUT i .c., obcy instrument bez źródła', async () => {
    const { resolveInstrument, DB_SYMBOLS } = await load();
    assert.deepEqual(resolveInstrument('ES'), { data: 'ES', symbol: 'ES.v.0' });
    assert.deepEqual(resolveInstrument('mes'), { data: 'ES', symbol: 'ES.v.0' });
    assert.deepEqual(resolveInstrument('NQ'), { data: 'NQ', symbol: 'NQ.v.0' });
    assert.deepEqual(resolveInstrument('MNQ'), { data: 'NQ', symbol: 'NQ.v.0' });
    for (const x of ['EURUSD', 'XAUUSD', 'ES.FUT', 'ES.c.0', '', null, undefined, '__proto__', 'constructor']) assert.equal(resolveInstrument(x), null, String(x));
    for (const s of DB_SYMBOLS) assert.ok(!s.endsWith('.FUT') && !s.includes('.c.'));
  });

  test('wykresy-03: get_cost + get_range: formularz, Basic Auth, dwie wyceny przed pobraniem, ceny całkowite ×100', async () => {
    const { A, client } = await rig();
    try {
      const cost = await client.getCost({ symbol: 'ES.v.0', start: T0, end: T0 + 300 });
      assert.equal(cost, 0.002);
      const got = await client.getRange({ symbol: 'ES.v.0', start: T0, end: T0 + 300 }, { confirmedCostUsd: 0.002 });
      const L = await A.log();
      assert.deepEqual(L.violations, [], 'atrapa: Basic Auth, symbol, stype_in, schema i dataset poprawne');
      assert.deepEqual(paths(L), ['metadata.get_cost', 'metadata.get_cost', 'timeseries.get_range'], 'get_cost tuż przed get_range');
      const r = L.log[2].params;
      assert.equal(r.dataset, 'GLBX.MDP3'); assert.equal(r.symbols, 'ES.v.0'); assert.equal(r.schema, 'ohlcv-1s');
      assert.equal(r.stype_in, 'continuous'); assert.equal(r.stype_out, 'instrument_id');
      assert.equal(r.encoding, 'csv'); assert.equal(r.compression, 'none'); assert.equal(r.pretty_px, 'false'); assert.equal(r.pretty_ts, 'false');
      assert.equal(r.start, '2026-10-26T14:30:00Z'); assert.equal(r.end, '2026-10-26T14:35:00Z');
      assert.equal(got.bars.length, 5);
      assert.deepEqual(got.bars[0], [T0, 502500, 502550, 502475, 502525, 3]); // 5025,00 → 502500 (tick 0,25 = 25)
      assert.deepEqual(got.bars[1], [T0 + 60, 502525, 502575, 502500, 502550, 4]);
      for (const b of got.bars) for (const x of b) assert.ok(Number.isInteger(x));
      assert.equal(got.costUsd, 0.002);
    } finally { A.stop(); }
  });

  test('wykresy-03: bezpieczniki: bez potwierdzonej wyceny, wycena > potwierdzona + 5%, wycena > limit 1 USD, zły symbol: zero get_range', async () => {
    const { A, client } = await rig();
    const p = { symbol: 'ES.v.0', start: T0, end: T0 + 300 };
    try {
      for (const c of [undefined, null, '0.002', NaN, -1]) await assert.rejects(client.getRange(p, { confirmedCostUsd: c }), (e) => e.code === 'no-quote');
      assert.deepEqual((await A.log()).log, [], 'bez wyceny nawet get_cost nie idzie');
      await A.config({ costs: [0.0211] }); // potwierdzono 0,02: 0,0211 > 0,021
      await assert.rejects(client.getRange(p, { confirmedCostUsd: 0.02 }), (e) => e.code === 'cost-changed' && e.status === 409);
      await A.config({ costs: [0.021] }); // dokładnie +5%: dozwolone
      assert.equal((await client.getRange(p, { confirmedCostUsd: 0.02 })).bars.length, 5);
      await A.reset();
      await A.config({ costs: [1.01] });
      await assert.rejects(client.getRange(p, { confirmedCostUsd: 5 }), (e) => e.code === 'over-limit');
      await A.config({ costs: [0.5] });
      const { D } = await rig().then((x) => (x.A.stop(), x));
      await assert.rejects(D.createDatabento({ key: KEY, base: A.base, maxCostUsd: 0.1 }).getRange(p, { confirmedCostUsd: 0.5 }), (e) => e.code === 'over-limit', 'limit własny klienta');
      for (const bad of ['ES.FUT', 'ES.c.0', 'MES.v.0', 'ES', '']) {
        await assert.rejects(client.getRange({ ...p, symbol: bad }, { confirmedCostUsd: 0.01 }), (e) => e.code === 'bad-symbol');
        await assert.rejects(client.getCost({ ...p, symbol: bad }), (e) => e.code === 'bad-symbol');
      }
      await assert.rejects(client.getCost({ ...p, end: p.start }), (e) => e.code === 'bad-range');
      const L = await A.log();
      assert.ok(!paths(L).includes('timeseries.get_range'), 'żadnego get_range w logu atrapy po odrzuceniach');
      assert.deepEqual(L.violations, []);
    } finally { A.stop(); }
  });

  test('wykresy-03: get_dataset_range: cache 15 min (zegar wstrzykiwany), POST gdy GET odrzucony, availableEnd w sekundach', async () => {
    let clock = 1_800_000_000_000;
    const { A, client } = await rig({ now: () => clock });
    try {
      const a = await client.getDatasetRange();
      assert.equal(a.endSec, Date.UTC(2026, 9, 27, 10) / 1000);
      await client.getDatasetRange();
      clock += 14 * 60_000;
      await client.getDatasetRange();
      assert.equal((await A.log()).log.length, 1, 'drugie i trzecie wywołanie w 15 min nie idzie do atrapy');
      await A.config({ end: '2026-10-27T11:00:00.123456789Z' });
      clock += 2 * 60_000; // razem 16 min
      assert.equal((await client.getDatasetRange()).endSec, Date.UTC(2026, 9, 27, 11) / 1000);
      assert.equal((await A.log()).log.length, 2);
      assert.equal((await client.getDatasetRange({ force: true })).endSec, Date.UTC(2026, 9, 27, 11) / 1000);
      assert.equal((await A.log()).log.length, 3);
      await A.config({ rangeMethod: 'post' });
      await client.getDatasetRange({ force: true });
      const L = await A.log();
      assert.deepEqual(L.log.slice(-2).map((e) => e.method), ['GET', 'POST'], 'GET odrzucony 405, ponowione POST-em');
    } finally { A.stop(); }
  });

  test('wykresy-03: parser CSV: konwersja cen i czasu, rolls przy zmianie instrument_id, inna kolejność kolumn, pusta odpowiedź, błędy', async () => {
    const { parseOhlcvCsv } = await load();
    const hdr = 'ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume';
    const row = (t, id, o, h, l, c, v) => `${BigInt(t) * 1_000_000_000n},32,1,${id},${o},${h},${l},${c},${v}`;
    const csv = [hdr, row(T0, 11, 5025250000000, 5025500000000, 5025000000000, 5025250000000, 7), row(T0 + 1, 11, 5025250000000, 5025250000000, 5025250000000, 5025250000000, 1), row(T0 + 5, 22, 5030000000000, 5030750000000, 5029750000000, 5030500000000, 9)].join('\n');
    const r = parseOhlcvCsv(csv);
    assert.deepEqual(r.bars, [[T0, 502525, 502550, 502500, 502525, 7], [T0 + 1, 502525, 502525, 502525, 502525, 1], [T0 + 5, 503000, 503075, 502975, 503050, 9]]);
    assert.deepEqual(r.rolls, [{ t: T0 + 5, from: '11', to: '22' }]);
    // inna kolejność kolumn, dodatkowe kolumny, CRLF, ts_event z nanosekundami w sekundzie
    const csv2 = ['volume,symbol,close,low,high,open,instrument_id,ts_event', `4,ESZ6,5000500000000,5000000000000,5001000000000,5000250000000,5,${BigInt(T0) * 1_000_000_000n + 999n}`, ''].join('\r\n');
    assert.deepEqual(parseOhlcvCsv(csv2).bars, [[T0, 500025, 500100, 500000, 500050, 4]]);
    // zaokrąglenie ceny niebędącej wielokrotnością 1e7 i rekordy w złej kolejności/zdublowane
    const csv3 = [hdr, row(T0 + 2, 1, 5025004999999, 5025005000000, 5025000000000, 5025000000001, 1), row(T0, 1, 100000000, 100000000, 100000000, 100000000, 2), row(T0, 1, 200000000, 200000000, 200000000, 200000000, 3)].join('\n');
    const r3 = parseOhlcvCsv(csv3);
    assert.deepEqual(r3.bars.map((b) => b[0]), [T0, T0 + 2]);
    assert.equal(r3.dropped, 1);
    assert.deepEqual(r3.bars[1].slice(1, 5), [502500, 502501, 502500, 502500]);
    assert.deepEqual(parseOhlcvCsv(''), { bars: [], rolls: [], dropped: 0 });
    assert.deepEqual(parseOhlcvCsv(hdr + '\n'), { bars: [], rolls: [], dropped: 0 });
    assert.throws(() => parseOhlcvCsv('ts_event,open\n1,2'), (e) => e.code === 'bad-csv' && /instrument_id/.test(e.message));
    assert.throws(() => parseOhlcvCsv(hdr + '\n' + row(T0, 1, 'abc', 1, 1, 1, 1)), (e) => e.code === 'bad-csv' && /open/.test(e.message));
    assert.throws(() => parseOhlcvCsv(hdr + '\n' + row(T0, 1, 1, 1, 1, 1, -3)), (e) => e.code === 'bad-csv');
  });

  test('wykresy-03: klient: rolls z atrapy, inny nagłówek, pusta odpowiedź', async () => {
    const { A, client } = await rig();
    try {
      await A.config({ rollAt: T0 + 120, header: ['volume', 'close', 'low', 'high', 'open', 'instrument_id', 'ts_event'] });
      const r = await client.getRange({ symbol: 'NQ.v.0', start: T0, end: T0 + 300 }, { confirmedCostUsd: 0.01 });
      assert.equal(r.bars.length, 5);
      assert.deepEqual(r.rolls, [{ t: T0 + 120, from: '1', to: '2' }]);
      await A.config({ empty: true });
      assert.deepEqual((await client.getRange({ symbol: 'NQ.v.0', start: T0, end: T0 + 300 }, { confirmedCostUsd: 0.01 })).bars, []);
      assert.deepEqual((await A.log()).violations, []);
    } finally { A.stop(); }
  });

  test('wykresy-03: błędy 401/402/422/429/500 i sieć: komunikaty bez klucza; w wyjściu procesu atrapy też nie ma klucza', async () => {
    const { A, client } = await rig();
    const p = { symbol: 'ES.v.0', start: T0, end: T0 + 300 };
    try {
      const cases = [[401, 'unauthorized', /401/], [402, 'payment', /402/], [422, 'rejected', /422/], [429, 'rate-limit', /429/], [503, 'upstream', /503/]];
      for (const [status, code, re] of cases) {
        await A.config({ fail: { path: '/v0/metadata.get_cost', status } });
        await assert.rejects(client.getCost(p), (e) => e.code === code && re.test(e.message) && !e.message.includes(KEY) && !JSON.stringify(e).includes(KEY), String(status));
      }
      // 429 i 401 przy get_range nie zostawiają danych; zły klucz → 401 z atrapy
      await A.config({ fail: null });
      const wrong = (await load()).createDatabento({ key: 'inny-klucz-0123456789', base: A.base });
      await assert.rejects(wrong.getCost(p), (e) => e.code === 'unauthorized' && !e.message.includes('inny-klucz'));
      // brak klucza: bez żadnego żądania
      await A.reset();
      const none = (await load()).createDatabento({ key: '', base: A.base });
      await assert.rejects(none.getCost(p), (e) => e.code === 'no-key');
      assert.deepEqual((await A.log()).log.filter((e) => e.path.includes('get_cost') && e.params.symbols === 'ES.v.0').length, 0);
      // sieć martwa
      const dead = (await load()).createDatabento({ key: KEY, base: 'http://127.0.0.1:9' });
      await assert.rejects(dead.getCost(p), (e) => e.code === 'network' && !e.message.includes(KEY));
      // obcy adres bazowy: klucz nie wyjdzie (fetch nie jest wołany)
      let called = 0;
      const evil = (await load()).createDatabento({ key: KEY, base: 'https://evil.example.com', fetchImpl: async () => { called++; throw new Error('x'); } });
      await assert.rejects(evil.getCost(p), (e) => e.code === 'bad-base' && !e.message.includes(KEY));
      assert.equal(called, 0);
      assert.ok(!(A.p.out + A.p.err).includes(KEY), 'klucz nie występuje w stdout/stderr atrapy');
    } finally { A.stop(); }
  });
  test('wykresy-03: parser: za krótki wiersz i pusty wolumen to bad-csv; fetch bez przekierowań', async () => {
    const { parseOhlcvCsv, createDatabento } = await load();
    const hdr = 'ts_event,instrument_id,open,high,low,close,volume';
    const ts = String(BigInt(T0) * 1_000_000_000n);
    for (const csv of [hdr + '\n' + ts + ',1,100,100', hdr + '\n' + ts + ',1,100000000,100000000,100000000,100000000,', hdr + '\n' + ts + ',1,100000000,100000000,100000000,100000000,   ']) {
      assert.throws(() => parseOhlcvCsv(csv), (e) => e.name === 'DatabentoError' && e.code === 'bad-csv', csv.slice(-30));
    }
    let seen;
    const c = createDatabento({ key: KEY, base: 'http://127.0.0.1:9', fetchImpl: async (u, o) => { seen = o; throw new Error('stop'); } });
    await assert.rejects(c.getCost({ symbol: 'ES.v.0', start: T0, end: T0 + 60 }));
    assert.equal(seen.redirect, 'error');
  });

  test('wykresy-03: P25: schema ohlcv-1m w get_cost i get_range, nieznana schema odrzucona bez żądania, beforeRange (kredyt) blokuje get_range', async () => {
    const calls = [];
    const { A, client } = await rig({ beforeRange: (c, p) => { calls.push([c, p.schema]); if (c > 0.5) throw Object.assign(new Error('kredyt'), { code: 'credit' }); } });
    const p = { symbol: 'ES.v.0', start: T0, end: T0 + 300, schema: 'ohlcv-1m' };
    try {
      assert.equal(await client.getCost(p), 0.002);
      const got = await client.getRange(p, { confirmedCostUsd: 0.002 });
      assert.equal(got.bars.length, 5, 'ohlcv-1m: jedna świeca na minutę');
      const L = await A.log();
      assert.deepEqual(L.violations, []);
      assert.deepEqual(L.log.map((e) => e.params.schema), ['ohlcv-1m', 'ohlcv-1m', 'ohlcv-1m']);
      assert.deepEqual(calls, [[0.002, 'ohlcv-1m']]);
      await assert.rejects(client.getCost({ ...p, schema: 'trades' }), (e) => e.code === 'bad-schema');
      await assert.rejects(client.getRange({ ...p, schema: 'mbo' }, { confirmedCostUsd: 1 }), (e) => e.code === 'bad-schema');
      await A.reset();
      await A.config({ costs: [0.9] });
      await assert.rejects(client.getRange(p, { confirmedCostUsd: 0.9 }), (e) => e.code === 'credit');
      assert.ok(!paths(await A.log()).includes('timeseries.get_range'), 'strażnik zatrzymał przed get_range');
    } finally { A.stop(); }
  });
};
