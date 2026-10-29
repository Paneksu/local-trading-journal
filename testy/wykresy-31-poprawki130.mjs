// wykresy-31: poprawki po przeglądzie przed 1.3.0 (29.10.2026): przegląd kodu review-130 (pkt 1-9) i audyt security-130 (N1, dane prywatne).
// Każdy test był czerwony przed poprawką (ślad: wykresy-wyniki\poprawki-130-czerwony.txt) i jest zielony po niej.
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export default ({ test, H, assert, ROOT }) => {
  let port = 5400;
  const KEY = 'db-test-key-0123456789abcdef';
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const at = (s) => Date.parse(s) / 1000;

  // ---- pkt 1: przejście na TF poniżej minuty z oddalonego widoku ----
  test('wykresy-31: R1 clampFrameTf: kadr z oddalonego TF przycięty do 1500 świec nowego TF wokół środka PRZED żądaniem, a żądanie (z zapasem) mieści się w limicie serwera', async () => {
    const P = await lib('public/js/podglad.js');
    assert.equal(typeof P.clampFrameTf, 'function');
    const a = at('2024-03-01T00:00:00Z'), b = a + 12 * 86400, mid = (a + b) / 2;
    for (const tf of ['1s', '5s', '15s', '30s', '45s']) {
      const sec = Number(tf.slice(0, -1)), [x, y] = P.clampFrameTf(a, b, tf);
      assert.equal(y - x, 1500 * sec, `${tf}: kadr = 1500 świec`);
      assert.ok(Math.abs((x + y) / 2 - mid) < 1, `${tf}: środek kadru zostaje`);
      const pad = P.padFor(tf, y - x), reqBars = (y - x + 2 * pad) / sec;
      assert.ok(reqBars <= 50_000, `${tf}: żądanie ${reqBars} świec mieści się w MAX_BARS`);
    }
    assert.deepEqual(P.clampFrameTf(a, a + 600, '15s'), [a, a + 600], 'kadr już mieści się: bez zmian');
    assert.deepEqual(P.clampFrameTf(a, b, '5m'), [a, b], 'TF >= 1m: bez zmian (limit po odpowiedzi jak dotąd)');
    assert.deepEqual(P.clampFrameTf(a, b, '1h'), [a, b]);
  });

  // ---- pkt 2: odmowa 422 trybu mieszanego szybko i bez ciężkiej pracy ----
  async function bigStore() {
    const C = await lib('lib/candles-store.mjs');
    const S = await lib('public/js/swiece.js');
    const dir = H.tmp(), o = { baseDir: dir };
    const A = at('2024-03-04T00:00:00Z'), B = at('2024-04-04T00:00:00Z');
    const m = []; for (let t = A; t < B; t += 60) if (S.sessionBounds(t)) m.push([t, 1800000, 1800400, 1799800, 1800200, 5]);
    C.writeRange('NQ', '1m', A, B, m, {}, o);
    const s = []; for (let t = at('2024-03-12T13:30:00Z'); t < at('2024-03-12T15:00:00Z'); t++) s.push([t, 1800100, 1800150, 1800050, 1800100, 1]);
    C.writeRange('NQ', '1s', at('2024-03-12T13:30:00Z'), at('2024-03-12T15:00:00Z'), s, {}, o);
    const { createCandles } = await lib('lib/candles.mjs');
    return createCandles({ getKey: () => '', getConfig: () => ({}), baseDir: dir, now: () => Date.UTC(2024, 5, 1) });
  }
  test('wykresy-31: R2/N1 tryb mieszany: 7s/16 dni, 45s/30 dni i 3599s/400 dni → 422 poniżej 50 ms i bez setek MB (liczba świec wyniku liczona przed odczytem i dzieleniem)', async () => {
    const K = await bigStore();
    K.read({ instrument: 'NQ', from: String(at('2024-03-12T13:00:00Z')), to: String(at('2024-03-12T14:00:00Z')), tf: '30s' }); // rozgrzewka
    const cases = [['7s', '2024-03-04T00:00:00Z', '2024-03-20T00:00:00Z'], ['45s', '2024-03-04T00:00:00Z', '2024-04-03T00:00:00Z'], ['3599s', '2023-02-01T00:00:00Z', '2024-03-07T00:00:00Z']];
    for (const [tf, a, b] of cases) {
      const h0 = process.memoryUsage().heapUsed, t0 = performance.now();
      assert.throws(() => K.read({ instrument: 'NQ', from: String(at(a)), to: String(at(b)), tf }), (e) => e.status === 422 && e.code === 'too-many', `${tf}: 422 too-many`);
      const ms = performance.now() - t0, mb = (process.memoryUsage().heapUsed - h0) / 1e6;
      assert.ok(ms < 50, `${tf}: odmowa po ${ms.toFixed(0)} ms`);
      assert.ok(mb < 60, `${tf}: sterta +${mb.toFixed(0)} MB`);
    }
    // uprawnione żądania nadal działają: 30s przez dzień, 45s przez 3 dni
    assert.ok(K.read({ instrument: 'NQ', from: String(at('2024-03-12T00:00:00Z')), to: String(at('2024-03-13T00:00:00Z')), tf: '30s' }).bars.length > 2000);
    assert.ok(K.read({ instrument: 'NQ', from: String(at('2024-03-12T00:00:00Z')), to: String(at('2024-03-15T00:00:00Z')), tf: '45s' }).bars.length > 500);
  });

  function get(base, pth, headers = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(base + pth);
      http.get({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }).on('error', reject);
    });
  }
  test('wykresy-31: N1 GET /api/*: Sec-Fetch-Site inny niż same-origin i none → 403, brak nagłówka i zwykła strona bez zmian', async () => {
    const S = await H.server(++port, { THQ_CONFIG_DIR: H.tmp() });
    try {
      const url = '/api/candles/status';
      assert.equal(await get(S.base, url), 200, 'brak nagłówka (CLI, testy): przepuszczone');
      assert.equal(await get(S.base, url, { 'Sec-Fetch-Site': 'same-origin' }), 200);
      assert.equal(await get(S.base, url, { 'Sec-Fetch-Site': 'none' }), 200, 'adres wpisany ręcznie');
      assert.equal(await get(S.base, url, { 'Sec-Fetch-Site': 'cross-site' }), 403);
      assert.equal(await get(S.base, url, { 'Sec-Fetch-Site': 'same-site' }), 403);
      assert.equal(await get(S.base, '/api/candles?instrument=NQ&from=1&to=2&tf=1m', { 'Sec-Fetch-Site': 'cross-site' }), 403, 'także odczyt świec');
      assert.equal(await get(S.base, '/', { 'Sec-Fetch-Site': 'cross-site' }), 200, 'strona i pliki statyczne bez zmian');
    } finally { S.stop(); }
  });

  // ---- pkt 3: B-ADJ i kontrakt na ścieżce mieszanej ----
  test('wykresy-31: R3 B-ADJ i kontrakt trade’a na TF poniżej minuty: świece z podziału i prawdziwe 1s mają to samo przesunięcie co świece 1m', async () => {
    const C = await lib('lib/candles-store.mjs');
    const S = await lib('public/js/swiece.js');
    const qOf = (y, m) => y * 4 + (m / 3 - 1);
    const Z5 = qOf(2025, 12), H6 = qOf(2026, 3);
    const T_R = at('2025-12-11T23:00:00Z'), T_V = at('2025-12-17T00:00:00Z');
    const A0 = at('2025-12-07T23:00:00Z'), B0 = at('2025-12-19T22:00:00Z');
    const dir = H.tmp(), o = { baseDir: dir };
    const m1 = (a, b, base, vol) => { const out = []; for (let t = a; t < b; t += 60) if (S.sessionBounds(t)) out.push([t, base, base + 25, base - 25, base + 10, vol(t)]); return out; };
    C.writeRange('ES', '1m', A0, T_V, m1(A0, T_V, 680000, () => 10), { rolls: [] }, o);
    C.writeRange('ES', '1m', T_V, B0, m1(T_V, B0, 685500, () => 10), { rolls: [{ t: T_V, label: 'x' }] }, o);
    const P = at('2025-12-09T23:00:00Z');
    C.writeRange('ES', '1m-ESH2026', P, T_V, m1(P, T_V, 685500, (t) => (t < T_R ? 1 : 30)), {}, o);
    C.writeAux('contracts-es', { resolvedTo: '2026-01-01', v0: [[at('2025-09-17T00:00:00Z'), Z5], [T_V, H6]], names: { [Z5]: { name: 'ESZ5', id: '1' }, [H6]: { name: 'ESH6', id: '2' } } }, o);
    // okno 1s w starym kontrakcie (przed rollem), warstwa v0: ceny jak 1m + 7 groszy
    const W0 = at('2025-12-10T15:00:00Z'), W1 = at('2025-12-10T15:30:00Z');
    const s = []; for (let t = W0; t < W1; t++) s.push([t, 680007, 680032, 679982, 680017, 1]);
    C.writeRange('ES', '1s', W0, W1, s, {}, o);
    const { createCandles } = await lib('lib/candles.mjs');
    const K = createCandles({ getKey: () => '', getConfig: () => ({}), baseDir: dir, now: () => Date.UTC(2026, 0, 5) });
    const q = { instrument: 'ES', from: String(at('2025-12-10T14:00:00Z')), to: String(at('2025-12-10T16:00:00Z')) };
    const m = (tf, extra = {}) => K.read({ ...q, tf, ...extra });
    const off = m('1m', { adjust: '1' }).bars[0][1] - m('1m').bars[0][1];
    assert.ok(off > 50, `przesunięcie B-ADJ minut 1m = ${off}`);
    for (const extra of [{}, { tfrom: String(at('2025-12-12T15:00:00Z')), tto: String(at('2025-12-12T15:30:00Z')), contract: 'ESH6' }]) {
      const raw = m('30s', extra), adj = m('30s', { ...extra, adjust: '1' });
      assert.equal(raw.bars.length, adj.bars.length);
      const synth = adj.bars.filter((b) => b[6] === 1), real = adj.bars.filter((b) => b[6] === undefined);
      assert.ok(synth.length > 100 && real.length >= 50, `świece z podziału ${synth.length} i prawdziwe ${real.length}`);
      for (let i = 0; i < adj.bars.length; i += 17) assert.ok(Math.abs(adj.bars[i][1] - raw.bars[i][1] - off) < 1e-6, `bar ${i} (${adj.bars[i][6] === 1 ? 'z 1m' : '1s'}): przesunięcie ${adj.bars[i][1] - raw.bars[i][1]} zamiast ${off}`);
      assert.ok(adj.adjust?.on, 'odpowiedź niesie adjust');
    }
  });

  // ---- pkt 4: status importu 1s niezależny od kolejki ----
  test('wykresy-31: R5 import okien 1s ma własny status (id przebiegu, błąd, wynik), którego nie nadpisuje tick kolejki', async () => {
    const A = await H.atrapaDb(++port);
    await A.config({ end: '2024-03-14T10:00:00.000000000Z', cost: 0.002 });
    const old = process.env.DATABENTO_API_BASE; process.env.DATABENTO_API_BASE = A.base;
    try {
      const { createCandles } = await lib('lib/candles.mjs');
      const dir = H.tmp(), st = { clock: Date.UTC(2024, 2, 14, 12) };
      const C = createCandles({ getKey: () => KEY, getConfig: () => ({}), baseDir: dir, now: () => st.clock });
      const from = at('2024-03-11T00:00:00Z'), to = at('2024-03-13T00:00:00Z');
      const dry = await C.importOpen({ instrument: 'NQ', from, to, dryRun: true });
      const r = await C.importOpen({ instrument: 'NQ', from, to, confirmedCostUsd: dry.totalUsd, budgetUsd: 36 });
      assert.equal(r.started, true); assert.ok(Number.isInteger(r.runId), 'start zwraca runId');
      for (let i = 0; i < 200 && C.status().running; i++) await H.sleep(25);
      const fin = C.status().import1s;
      assert.equal(fin?.id, r.runId); assert.equal(fin.error, null); assert.ok(fin.result?.added > 0);
      // następny przebieg kolejki zeruje status.error/result, ale nie wynik importu
      await C.tick();
      for (let i = 0; i < 200 && C.status().running; i++) await H.sleep(25);
      assert.equal(C.status().import1s?.id, r.runId); assert.ok(C.status().import1s.result.added > 0, 'wynik importu przetrwał przebieg kolejki');
    } finally { if (old === undefined) delete process.env.DATABENTO_API_BASE; else process.env.DATABENTO_API_BASE = old; A.stop(); }
  });

  // ---- pkt 6: edytor i pamięć ----
  test('wykresy-31: R7 edytor przelewa serię tylko po zmianie kolorów świec z podziału; R8 limit świec w pamięci odrzuca najdalsze od widoku', async () => {
    const W = await lib('public/js/wykres.js');
    const P = await lib('public/js/podglad.js');
    const c1 = { up: '#0f0', down: '#f00', profit: '#0f0', loss: '#f00' };
    const synth = [[1, 1, 2, 0, 1, 1, 1]], real = [[1, 1, 2, 0, 1, 1]];
    assert.deepEqual(W.seriesRefresh(c1, { ...c1 }, synth), { restyle: false, resetData: false }, 'klasa elementu html nic nie zmienia');
    assert.deepEqual(W.seriesRefresh(c1, { ...c1, up: '#00ff80' }, real), { restyle: true, resetData: false }, 'zmiana koloru bez świec z podziału: bez setData');
    assert.deepEqual(W.seriesRefresh(c1, { ...c1, up: '#00ff80' }, synth), { restyle: true, resetData: true });
    const mk = (n, t0 = 0) => Array.from({ length: n }, (_, i) => [t0 + i, 1, 2, 0, 1, 1]);
    assert.equal(P.SUB_MINUTE_MAX_BARS, 40_000);
    let r = P.capBars(mk(45_000), { from: 100, to: 700 }, 40_000, 'left');
    assert.equal(r.candles.length, 40_000); assert.equal(r.side, 'right'); assert.equal(r.cut, 5000);
    r = P.capBars(mk(45_000), { from: 44_000, to: 44_500 }, 40_000, 'right');
    assert.equal(r.candles.length, 40_000); assert.equal(r.side, 'left'); assert.equal(r.candles[0][0], 5000);
    r = P.capBars(mk(45_000), { from: 43_000, to: 44_000 }, 40_000, 'left');
    assert.equal(r.cut, 0, 'widok w odcinanej części: nie przycinaj');
    assert.equal(P.capBars(mk(100), { from: 0, to: 50 }, 40_000, 'left').cut, 0);
  });

  // ---- pkt 7: martwy kod i cytat ----
  test('wykresy-31: R9 martwy eksport cardStyle usunięty; komentarz w podglad.js nie podaje nieistniejącego cytatu jako słów użytkownika', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    assert.equal(C.cardStyle, undefined);
    const src = spawnSync('git', ['show', ':public/js/podglad.js'], { cwd: ROOT, encoding: 'utf8' });
    const wk = (await import('node:fs')).readFileSync(path.join(ROOT, 'public/js/podglad.js'), 'utf8');
    assert.ok(!/przelaczanie TF w obie strony z zachowaniem widocznego czasu/.test(wk), 'cytat spoza planu usunięty'); void src;
  });

  // ---- pkt 9: dane prywatne w drzewie ----
  test('wykresy-31: pkt 9 w śledzonych plikach nie ma salda konta Databento, brokera Tradovate (w moich dokumentach), nicku z imieniem ani imienia właściciela w kodzie', async () => {
    const grep = (re, ...paths) => spawnSync('git', ['grep', '-n', '-i', '-E', re, '--', ...paths], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
    assert.equal(grep('szymon\\.trades|szymon', '.', ':!docs/plany/research-*.md', ':!testy/wykresy-31-poprawki130.mjs'), '', 'imię/nick');
    assert.equal(grep('81,59|81,60|47,31|43,40|zostało \\*\\*8|portal Databento potwierdza', 'docs', 'lib', 'public', 'testy', 'narzedzia', ':!testy/wykresy-31-poprawki130.mjs'), '', 'saldo konta Databento');
    assert.equal(grep('użytkownik ma Tradovate|ma Tradovate', 'docs', 'lib', 'public'), '', 'broker użytkownika');
    assert.equal(grep('zrzut portalu przed testem pokazywał', 'lib'), '', 'stan konta w komentarzu');
  });
  // ---- pkt 8: kontrast pigułek (pomiar w przeglądarce: wykresy-wynikiwykres-1skontrast-PRZED.txt i kontrast-PO.txt; tu strażnik wartości w CSS) ----
  test('wykresy-31: R10 pigułki „brak danych” i wyłączone: krycie tekstu nie spada poniżej progu zmierzonego kontrastu (.85 i .62, czyli 4,6:1 i 3,1:1 w Onyx)', async () => {
    const css = (await import('node:fs')).readFileSync(path.join(ROOT, 'public/features.css'), 'utf8');
    const op = (sel) => { const k = css.indexOf(sel + ' { opacity: '); return k < 0 ? NaN : parseFloat(css.slice(k + sel.length + 12)); };
    assert.ok(op('.sh-pill.is-empty:not([aria-pressed="true"])') >= 0.85, 'is-empty >= .85 (aktywny przycisk: 4,5:1)');
    assert.ok(op('.sh-pill:disabled') >= 0.62, 'disabled >= .62 (3:1)');
  });
};
