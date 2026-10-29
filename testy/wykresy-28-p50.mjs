// wykresy-28: P50 (29.10.2026), codzienne okno 1s NQ 9:30–11:00 NY w kolejce. Słowa użytkownika: «i dodaj tak ze codziennie przy tych codziennych
// import zawsze pobieramy sekundowki dla nq dla tej poltorej godziny od 9:30 ny open». Tylko atrapa Databento: okno dopiero, gdy jest dostępne
// (≤ availableEnd), nadrabianie od ostatniego dnia w magazynie (nie przed 2020-01-02), pomijanie okien w magazynie, czas zimowy i letni, kontrakt
// wg reguły rolla P35, wyłączony przełącznik = zero zapytań, dzienny limit wstrzymuje; przełącznik w config.local.json przez /api/config.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

export default ({ test, H, assert, ROOT }) => {
  let port = 5200;
  const KEY = 'db-test-key-0123456789abcdef';
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const at = (s) => Date.parse(s) / 1000;
  const qOf = (y, m) => y * 4 + (m / 3 - 1);
  const H4 = qOf(2024, 3), M4 = qOf(2024, 6);
  const ranges = async (A) => (await A.log()).log.filter((e) => e.path.endsWith('get_range')).map((e) => [e.params.symbols, e.params.schema, e.params.start, e.params.end]);

  async function direct({ cfg = {}, clock, atrapa = {}, prep, auto = true } = {}) {
    const A = await H.atrapaDb(++port);
    await A.config(atrapa);
    const old = process.env.DATABENTO_API_BASE;
    process.env.DATABENTO_API_BASE = A.base;
    const { createCandles } = await lib('lib/candles.mjs');
    const dir = H.tmp();
    if (prep) await prep(dir);
    const st = { cfg, clock };
    const C = createCandles({ getKey: () => KEY, getConfig: () => st.cfg, baseDir: dir, now: () => st.clock, autoOpenWindows: auto });
    const stop = () => { if (old === undefined) delete process.env.DATABENTO_API_BASE; else process.env.DATABENTO_API_BASE = old; A.stop(); };
    return { A, C, st, dir, stop };
  }
  // roll NQH4 → NQM4 zmierzony w sesji piątku 8.03.2024 (jak w wykresy-27), okno 7.03 już w magazynie
  const prepRoll = async (dir) => {
    const S = await lib('lib/candles-store.mjs');
    S.writeAux('contracts-nq', { resolvedTo: '2099-01-01', v0: [[at('2023-12-13T00:00:00Z'), H4], [at('2024-03-13T00:00:00Z'), M4]], names: {} }, { baseDir: dir });
    const a = at('2024-03-05T23:00:00Z'), e = at('2024-03-13T00:00:00Z'), flip = at('2024-03-07T23:00:00Z');
    const bars = (vol) => { const out = []; for (let t = a; t < e; t += 3600) out.push([t, 1800000, 1800100, 1799900, 1800050, vol(t)]); return out; };
    S.writeRange('NQ', '1m', a, e, bars(() => 10), {}, { baseDir: dir });
    S.writeRange('NQ', '1m-NQM2024', a, e, bars((t) => (t >= flip ? 50 : 5)), {}, { baseDir: dir });
    S.writeRange('NQ', '1s', at('2024-03-07T14:30:00Z'), at('2024-03-07T16:00:00Z'), [], {}, { baseDir: dir });
  };

  test('wykresy-28: P50 kolejka sama dokłada okno 1s NQ: nadrabia od ostatniego dnia w magazynie, okno dopiero po availableEnd, zmiana czasu, dzień rolla w nowym kontrakcie', async () => {
    const R = await direct({ clock: Date.UTC(2024, 2, 12, 20), atrapa: { end: '2024-03-12T14:59:00.000000000Z', cost: 0.002 }, prep: prepRoll });
    try {
      await R.C.tick();
      assert.equal(R.C.status().error, null, JSON.stringify(R.C.status().error));
      assert.deepEqual(await ranges(R.A), [
        ['NQM4', 'ohlcv-1s', '2024-03-11T13:30:00Z', '2024-03-11T15:00:00Z'], // poniedziałek po zmianie czasu (EDT); kolejka: najnowsze najpierw
        ['NQM4', 'ohlcv-1s', '2024-03-08T14:30:00Z', '2024-03-08T16:00:00Z'], // piątek EST, dzień rolla wg pomiaru: już NQM4
      ], 'od 7.03 (ostatnie okno w magazynie); 12.03 kończy się o 15:00Z, a dane są do 14:59Z; dni przed 7.03 nie są nadrabiane');
      assert.equal(R.C.status().queue.pending, 0);
      await R.C.tick();
      assert.equal((await ranges(R.A)).length, 2, 'drugi przebieg: okna w magazynie pominięte');
      // następny dzień: Databento udostępnia okno 12.03
      R.st.clock = Date.UTC(2024, 2, 13, 20);
      await R.A.config({ end: '2024-03-13T10:00:00.000000000Z' });
      await R.C.tick();
      assert.deepEqual((await ranges(R.A)).slice(2), [['NQM4', 'ohlcv-1s', '2024-03-12T13:30:00Z', '2024-03-12T15:00:00Z']]);
      assert.ok(R.st.cfg.chartSpend.usd > 0 && R.st.cfg.chartCredit.spentUsd > 0.02, 'zwykłe liczniki aplikacji');
      assert.deepEqual((await R.A.log()).violations, []);
    } finally { R.stop(); }
  });

  test('wykresy-28: P50 pusty magazyn: nadrabianie nie wcześniej niż 2020-01-02', async () => {
    const R = await direct({ clock: Date.UTC(2020, 0, 6, 20), atrapa: { end: '2020-01-06T18:00:00.000000000Z', cost: 0.002 } });
    try {
      await R.C.tick();
      assert.deepEqual((await ranges(R.A)).map((x) => [x[0], x[2]]).sort((a, b) => a[1].localeCompare(b[1])), [
        ['NQ.v.0', '2020-01-02T14:30:00Z'], ['NQ.v.0', '2020-01-03T14:30:00Z'], ['NQ.v.0', '2020-01-06T14:30:00Z'],
      ]);
    } finally { R.stop(); }
  });

  // P51 (29.10.2026), słowa użytkownika: «zgadzam sie» (na: automat nadrabia najwyżej 7 ostatnich dni, dłuższe dziury tylko importem z budżetem i zgodą)
  test('wykresy-28: P51 nadrabianie najwyżej 7 dni wstecz: pusty magazyn i dziura 20 dni → tylko okna z ostatnich 7 dni kalendarzowych', async () => {
    const want = [['NQ.v.0', '2024-03-13T13:30:00Z'], ['NQ.v.0', '2024-03-14T13:30:00Z'], ['NQ.v.0', '2024-03-15T13:30:00Z'], ['NQ.v.0', '2024-03-18T13:30:00Z'], ['NQ.v.0', '2024-03-19T13:30:00Z'], ['NQ.v.0', '2024-03-20T13:30:00Z']];
    const sorted = async (A) => (await ranges(A)).map((x) => [x[0], x[2]]).sort((a, b) => a[1].localeCompare(b[1]));
    for (const hole of [false, true]) {
      const R = await direct({
        clock: Date.UTC(2024, 2, 20, 20), atrapa: { end: '2024-03-20T18:00:00.000000000Z', cost: 0.002 },
        prep: hole ? async (dir) => { const S = await lib('lib/candles-store.mjs'); S.writeRange('NQ', '1s', at('2024-02-29T14:30:00Z'), at('2024-02-29T16:00:00Z'), [], {}, { baseDir: dir }); } : undefined,
      });
      try {
        await R.C.tick();
        assert.deepEqual(await sorted(R.A), want, (hole ? 'dziura od 29.02 (20 dni)' : 'pusty magazyn') + ': tylko 13–20.03, nic starszego');
      } finally { R.stop(); }
    }
  });

  test('wykresy-28: P50 wyłączony przełącznik albo createCandles bez autoOpenWindows: zero zapytań do Databento; dzienny limit wstrzymuje kolejkę', async () => {
    for (const o of [{ cfg: { chartNq1sDaily: false } }, { auto: false }]) {
      const R = await direct({ ...o, clock: Date.UTC(2024, 2, 12, 20), atrapa: { end: '2024-03-12T14:59:00.000000000Z' }, prep: prepRoll });
      try {
        assert.deepEqual(await R.C.tick(), { skipped: 'empty' });
        assert.deepEqual((await R.A.log()).log, [], JSON.stringify(o));
      } finally { R.stop(); }
    }
    const day = '2024-03-12';
    const R = await direct({ cfg: { chartSpend: { day, usd: 2.999 } }, clock: Date.UTC(2024, 2, 12, 20), atrapa: { end: '2024-03-12T14:59:00.000000000Z', cost: 0.002 }, prep: prepRoll });
    try {
      await R.C.tick();
      assert.equal((await ranges(R.A)).length, 0, '2,999 + 0,002 > 3 USD na dobę: nic nie pobrano');
      const q = R.C.status().queue;
      assert.equal(q.reason, 'daily-limit'); assert.equal(q.pending, 2);
    } finally { R.stop(); }
  });

  test('wykresy-28: P50 przełącznik w config.local.json przez /api/config (domyślnie włączony, meta), serwer włącza autoOpenWindows, kontrolka w Ustawieniach → Wykresy → Dane', async () => {
    const dir = H.tmp();
    const S = await H.server(++port, { THQ_CONFIG_DIR: dir });
    try {
      assert.equal((await (await fetch(S.base + '/api/meta')).json()).chartNq1sDaily, true);
      const r = await H.dash(S.base, '/api/config', { chartNq1sDaily: false });
      assert.equal(r.status, 200); assert.equal(r.j.chartNq1sDaily, false);
      await H.sleep(150);
      assert.equal(JSON.parse(readFileSync(path.join(dir, 'config.local.json'), 'utf8')).chartNq1sDaily, false);
      assert.equal((await H.dash(S.base, '/api/config', { chartNq1sDaily: 'tak' })).j.chartNq1sDaily, false, 'tylko wartość logiczna');
    } finally { S.stop(); }
    // serwer bez flagi testów (prawdziwy zegar): queue-run (ten sam tick co timer) dokłada okna po ostatnim oknie w magazynie. Daty liczone od dziś,
    // bo nadrabianie sięga tylko 7 dni wstecz (P51): pierwsze okno z ostatnich 6 dni w magazynie, koniec danych atrapy = koniec ostatniego okna wczoraj lub wcześniej
    const K = await lib('lib/candles.mjs');
    const today = Math.floor(Date.now() / 86400000) * 86400;
    const wins = K.openWindows(today - 6 * 86400, today);
    assert.ok(wins.length >= 2, 'w 6 dniach są co najmniej 2 dni pon-pt');
    const dir2 = H.tmp();
    const St = await lib('lib/candles-store.mjs');
    St.writeRange('NQ', '1s', wins[0].from, wins[0].to, [], {}, { baseDir: path.join(dir2, 'chart-data') });
    const A = await H.atrapaDb(++port);
    await A.config({ end: new Date(wins[wins.length - 1].to * 1000).toISOString() });
    const S2 = await H.server(++port, { THQ_CONFIG_DIR: dir2, DATABENTO_API_BASE: A.base, DATABENTO_API_KEY: KEY, THQ_NO_AUTO_1S: '' });
    try {
      assert.equal((await H.dash(S2.base, '/api/candles/queue-run', {})).status, 200);
      let got = [];
      for (let i = 0; i < 100 && got.length < wins.length - 1; i++) { await H.sleep(50); got = await ranges(A); }
      await H.sleep(200);
      const iso = (s) => new Date(s * 1000).toISOString().replace('.000Z', 'Z');
      assert.deepEqual((await ranges(A)).sort((a, b) => a[2].localeCompare(b[2])), wins.slice(1).map((w) => ['NQ.v.0', 'ohlcv-1s', iso(w.from), iso(w.to)]));
    } finally { S2.stop(); A.stop(); }
    assert.match(readFileSync(path.join(ROOT, 'server.mjs'), 'utf8'), /autoOpenWindows: process\.env\.THQ_NO_AUTO_1S !== '1'/, 'serwer włącza automatykę (wyłącza ją tylko środowisko testów)');
    const u = readFileSync(path.join(ROOT, 'public/js/ustawienia.js'), 'utf8');
    assert.match(u, /data-act="ch-nq1s"[^>]*\$\{m\.chartNq1sDaily !== false \? 'checked' : ''\}/);
    assert.match(u, /onConfig\(\{ chartNq1sDaily: ev\.target\.checked \}\)/);
  });
};
