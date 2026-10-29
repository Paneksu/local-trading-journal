// wykresy-30: P55 (29.10.2026), TF poniżej minuty poza oknami 1s. Słowa użytkownika: «wykres powinien dzialac w taki sposob ze jak sa sekundowki to wciaz
// sa dane na wykresie z minutowek i wlaczajac tf np 30s, to dalej widac caly okres jaki jest … znajdz rozwiazanie tak zeby nie bylo pustych pol np.
// podzielic na pol minutowke i wtedy jest 30s i analogicznie inne»; wybór: «Ścieżka O→L→H→C» i «Lekko przygaszone».
// Minuta z pokryciem 1s bierze prawdziwe świece 1s, minuta bez pokrycia dzieli świecę 1m po ścieżce O→L→H→C (świeca wzrostowa najpierw dołek, spadkowa szczyt).
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const at = (s) => Date.parse(s) / 1000;
  const A = at('2024-03-12T13:00:00Z'), B = at('2024-03-12T16:00:00Z'); // 9:00-12:00 NY (EDT)
  const W0 = at('2024-03-12T13:30:00Z'), W1 = at('2024-03-12T15:00:00Z'); // okno 1s 9:30-11:00 NY
  // 1m: parzyste minuty wzrostowe (O<C), nieparzyste spadkowe; ceny w groszach
  const m1 = (t) => { const k = (t - A) / 60; return k % 2 === 0 ? [t, 1800000, 1800400, 1799800, 1800200, 60] : [t, 1800200, 1800500, 1799900, 1800000, 7]; };
  async function store() {
    const C = await lib('lib/candles-store.mjs');
    const dir = H.tmp(), o = { baseDir: dir };
    const m = []; for (let t = A; t < B; t += 60) m.push(m1(t));
    C.writeRange('NQ', '1m', A, B, m, {}, o);
    const s = []; for (let t = W0; t < W1; t++) if (t % 7 !== 0) s.push([t, 1800100, 1800150, 1800050, 1800100, 1]); // rzadkie sekundy też bez świec: tak ma być
    C.writeRange('NQ', '1s', W0, W1, s, {}, o);
    const { createCandles } = await lib('lib/candles.mjs');
    return createCandles({ getKey: () => '', getConfig: () => ({}), baseDir: dir, now: () => Date.UTC(2024, 5, 1) });
  }
  const Q = { instrument: 'NQ', from: String(A), to: String(B) };

  test('wykresy-30: P55 splitMinute: ścieżka O→L→H→C, high/low części, wolumen dzielony równo bez utraty', async () => {
    const S = await lib('public/js/swiece.js');
    const up = S.splitMinute([A, 1800000, 1800400, 1799800, 1800200, 60], 30), dn = S.splitMinute([A, 1800200, 1800500, 1799900, 1800000, 7], 30);
    assert.equal(up.length, 2); assert.equal(dn.length, 2);
    assert.deepEqual(up.map((b) => b[0]), [A, A + 30]);
    assert.equal(up[0][1], 1800000, 'open pierwszej części = open minuty'); assert.equal(up[1][4], 1800200, 'close ostatniej części = close minuty');
    assert.equal(up[0][4], up[1][1], 'ciągłość: close części = open następnej');
    assert.equal(Math.max(...up.map((b) => b[2])), 1800400); assert.equal(Math.min(...up.map((b) => b[3])), 1799800);
    // wzrostowa: najpierw dołek (low w pierwszej połowie), potem szczyt; spadkowa odwrotnie
    assert.equal(up[0][3], 1799800); assert.equal(up[1][2], 1800400);
    assert.equal(dn[0][2], 1800500); assert.equal(dn[1][3], 1799900);
    assert.equal(up.reduce((a, b) => a + b[5], 0), 60); assert.equal(dn.reduce((a, b) => a + b[5], 0), 7);
    for (const b of [...up, ...dn]) assert.ok(b[2] >= Math.max(b[1], b[4]) && b[3] <= Math.min(b[1], b[4]), 'high/low obejmują open i close części');
    const s5 = S.splitMinute([A, 1800000, 1800400, 1799800, 1800200, 60], 5);
    assert.equal(s5.length, 12);
    assert.equal(Math.max(...s5.map((b) => b[2])), 1800400); assert.equal(Math.min(...s5.map((b) => b[3])), 1799800);
  });

  test('wykresy-30: P55 30s poza oknem 1s są świece z 1m (dwie na minutę), w oknie prawdziwe 1s, bez dziury i dubla na granicy', async () => {
    const K = await store();
    const r = K.read({ ...Q, tf: '30s' });
    const t = r.bars.map((b) => b[0]);
    assert.ok(t.length > 0 && t[0] === A, `pierwsza świeca 30s w ${A}, jest ${t[0]}`);
    assert.equal(new Set(t).size, t.length, 'bez dubli czasu');
    assert.deepEqual(t, [...t].sort((a, b) => a - b), 'rosnąco');
    const before = r.bars.filter((b) => b[0] < W0);
    assert.equal(before.length, 2 * ((W0 - A) / 60), 'przed oknem: dwie świece na minutę');
    assert.ok(before.every((b) => b[6] === 1), 'syntetyczne mają flagę');
    const real = r.bars.filter((b) => b[0] >= W0 && b[0] < W1);
    assert.ok(real.length > 0 && real.every((b) => b[6] === undefined), 'w oknie prawdziwe 1s, bez flagi');
    assert.ok(real.every((b) => b[2] === 18001.5), 'wartości z 1s (nie z 1m)');
    const after = r.bars.filter((b) => b[0] >= W1);
    assert.equal(after.length, 2 * ((B - W1) / 60), 'po oknie: znów z 1m');
    assert.equal(r.layer, '1s'); assert.deepEqual(r.missing, []); assert.deepEqual(r.synth, [[A, W0], [W1, B]], 'zakresy minut syntetycznych');
    // poprzednia minuta przed oknem: wzrostowa (k=29 nieparzysta → spadkowa) — suma wolumenu minuty = wolumen 1m
    const lastMin = before.slice(-2);
    assert.equal(lastMin[0][5] + lastMin[1][5], 7);
  });

  test('wykresy-30: P55 15s, 5s i 45s (nie dzieli minuty): ciągły kadr, high/low minuty zachowane', async () => {
    const K = await store();
    for (const [tf, n] of [['15s', 4], ['5s', 12]]) {
      const r = K.read({ ...Q, from: String(A), to: String(A + 600), tf });
      assert.equal(r.bars.length, n * 10, `${tf}: ${n} świec na minutę`);
    }
    const r45 = K.read({ ...Q, from: String(A), to: String(A + 900), tf: '45s' });
    assert.equal(r45.bars.length, 20, '45s: 900/45');
    assert.equal(r45.bars[0][1], 18000, 'open pierwszej świecy 45s = open pierwszej minuty');
    assert.ok(r45.bars.every((b) => b[6] === 1));
    // 45s na styku okna 1s: świeca obejmująca prawdziwe i syntetyczne sekundy istnieje raz
    const mix = K.read({ ...Q, from: String(W0 - 120), to: String(W0 + 120), tf: '45s' });
    const tt = mix.bars.map((b) => b[0]);
    assert.equal(new Set(tt).size, tt.length);
  });

  test('wykresy-30: P55 TF ≥ 1m bez zmian, tf=auto (miniatury) nie dostaje syntetycznych świec poniżej minuty', async () => {
    const K = await store();
    const m = K.read({ ...Q, tf: '1m' });
    assert.equal(m.bars.length, (B - A) / 60); assert.ok(m.bars.every((b) => b.length === 6));
    const a = K.read({ ...Q, from: String(A), to: String(A + 1200), tf: 'auto', maxBars: '500' });
    assert.ok(a.bars.every((b) => b.length === 6), 'auto: bez syntetycznych');
  });
  test('wykresy-30: P55 karta Udostępnij chce prawdziwych sekund: odpowiedź 1s z częścią syntetyczną (synth) → karta bierze 1m jak przed P55', async () => {
    const W = await lib('public/js/udostepnij.js');
    const C = await lib('public/js/styl-wykresu.js');
    const AT = Date.parse('2021-03-10T14:41:00Z');
    const card = { kind: 'trade', at: AT, exitAt: AT + 75000, instrument: 'NQ', date: '2021-03-10', time: '14:41' };
    const s1 = Array.from({ length: 240 }, (_, i) => [AT / 1000 - 120 + i, 1, 2, 0.5, 1.5, 3]);
    const m1 = Array.from({ length: 45 }, (_, i) => [AT / 1000 - 1500 + i * 60, 1, 2, 0.5, 1.5, 3]);
    const run = async (resp1s) => {
      const calls = [];
      const L = W.createCardCharts({ fetch: async (url) => { calls.push(url); const tf = new URL(url, 'http://x').searchParams.get('tf'); return { ok: true, json: async () => (tf.endsWith('s') ? resp1s : { tf: '1m', bars: m1, missing: [] }) }; }, cfg: () => C.chartDefaults(), badj: () => true });
      return { r: await L.get(card), calls };
    };
    let x = await run({ tf: '5s', bars: s1, missing: [], synth: [] });
    assert.equal(x.r.res, '1s'); assert.equal(x.calls.length, 1, 'pełne prawdziwe 1s: jedno żądanie');
    x = await run({ tf: '5s', bars: s1, missing: [], synth: [[AT / 1000 - 120, AT / 1000]] });
    assert.equal(x.r.res, '1m'); assert.equal(x.calls.length, 2, 'część z podziału 1m: drugie żądanie 1m');
  });
  test('wykresy-30: P55 klient: świece syntetyczne osobnymi ścieżkami .synth, przygaszone kolory w edytorze, zapas ładowania TF poniżej minuty ograniczony do 8000 świec', async () => {
    const P = await lib('public/js/podglad.js');
    const W = await lib('public/js/wykres.js');
    const G = await lib('public/js/geometria.js');
    const s = { spacing: 6, x: (i) => i * 6, y: (p) => 1000 - p };
    const sh = G.candleShapes([[A, 10, 14, 8, 12, 5], [A + 30, 12, 13, 9, 10, 5, 1]], s);
    assert.deepEqual(sh.map((c) => c.synth), [false, true]);
    const svg = P.candlePaths(sh);
    assert.match(svg, /class="candle up"/); assert.match(svg, /class="candle down synth"/); assert.doesNotMatch(svg, /class="candle up synth"/, 'bez pustych ścieżek');
    assert.equal(W.dimColor('#00ff80', 0.5), 'rgba(0, 255, 128, 0.5)'); assert.equal(W.dimColor('rgba(10, 20, 30, 0.5)', 0.5), 'rgba(10, 20, 30, 0.25)');
    const c = { up: '#00ff00', down: '#ff0000', profit: '#0f0', loss: '#f00' };
    const d = W.seriesData([[A, 1, 2, 0, 1.5, 1], [A + 30, 1.5, 2, 1, 1.2, 1, 1]], 'candles', c);
    assert.equal(d[0].color, undefined); assert.equal(d[1].color, 'rgba(255, 0, 0, 0.55)'); assert.equal(d[1].wickColor, d[1].color);
    assert.equal(P.padFor('30s', 5400), 86400, '30s: doba z każdej strony (2880 świec)'); assert.equal(P.padFor('5s', 5400), 40000, '5s: 8000 świec'); assert.equal(P.padFor('1s', 5400), 8000);
    assert.equal(P.padFor('1m', 5400), 86400, 'TF >= 1m bez zmian'); assert.equal(P.padFor('1h', 7200), 86400 > 3600 * 400 ? 86400 : 3600 * 400);
  });
  test('wykresy-30: P55 znacznik rolla przy doładowywaniu historii: kadr po starym kontrakcie z kontraktem trade’a wybranym przez regułę (auto) dostaje znacznik, wybór ręczny nie', async () => {
    const C = await lib('lib/candles-store.mjs');
    const S = await lib('public/js/swiece.js');
    const dir = H.tmp(); const o = { baseDir: dir };
    const qOf = (y, m) => y * 4 + (m / 3 - 1);
    const Z5 = qOf(2025, 12), H6 = qOf(2026, 3);
    const T_R = at('2025-12-11T23:00:00Z'), T_V = at('2025-12-17T00:00:00Z');
    const A0 = at('2025-12-07T23:00:00Z'), B0 = at('2025-12-19T22:00:00Z');
    const mk = (a, b, base, vol) => { const out = []; for (let t = a; t < b; t += 900) if (S.sessionBounds(t)) out.push([t, base, base + 25, base - 25, base, vol(t)]); return out; };
    C.writeRange('ES', '1m', A0, T_V, mk(A0, T_V, 680000, () => 10), { rolls: [] }, o);
    C.writeRange('ES', '1m', T_V, B0, mk(T_V, B0, 685500, () => 10), { rolls: [{ t: T_V, label: 'x' }] }, o);
    const P = at('2025-12-09T23:00:00Z');
    C.writeRange('ES', '1m-ESH2026', P, T_V, mk(P, T_V, 685500, (t) => (t < T_R ? 1 : 30)), {}, o);
    C.writeAux('contracts-es', { resolvedTo: '2026-01-01', v0: [[at('2025-09-17T00:00:00Z'), Z5], [T_V, H6]], names: { [Z5]: { name: 'ESZ5', id: '1' }, [H6]: { name: 'ESH6', id: '2' } } }, o);
    const { createCandles } = await lib('lib/candles.mjs');
    const K = createCandles({ getKey: () => '', getConfig: () => ({}), baseDir: dir, now: () => Date.UTC(2026, 0, 5) });
    const trade = { tfrom: String(at('2025-12-12T15:00:00Z')), tto: String(at('2025-12-12T15:30:00Z')) };
    const base = { instrument: 'ES', to: String(at('2025-12-12T22:00:00Z')), tf: '30s' };
    const rolls = (extra) => K.read({ ...base, from: String(T_R - 3600), ...extra }).rolls.map((r) => [r.t, r.label]);
    assert.deepEqual(rolls({}), [[T_R, 'ESZ5 → ESH6']], 'bez trade’a');
    assert.deepEqual(rolls(trade), [[T_R, 'ESZ5 → ESH6']], 'kontrakt trade’a z reguły (auto): znacznik jak bez trade’a');
    assert.deepEqual(rolls({ ...trade, contract: 'ESZ5' }), [], 'kontrakt wybrany ręcznie nie rysuje rolla rynku (P37)');
  });
};
