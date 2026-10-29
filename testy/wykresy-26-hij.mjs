// Poprawki po przeglądzie kodu i audycie bezpieczeństwa pakietów H, I, J (29.10.2026): review-HIJ.txt pkt 1, 2, 5, 6, 8 oraz security-HIJ.txt N1, N2.
// Prefiks = etap, którego dotyczy poprawka (wykresy-14: ustawienia i synchronizacja, wykresy-16: karty, wykresy-18: filmy).
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
  const evil = () => JSON.parse('{"toString":1}'); // obiekt, na którym String() i RegExp.test rzucają TypeError

  test('wykresy-14: rozmiar chart-data asynchronicznie (serwer nie stoi w trakcie liczenia) i zapamiętany na 60 s', async () => {
    const Cd = await lib('lib/candles.mjs');
    const dir = path.join(H.tmp(), 'chart-data');
    mkdirSync(path.join(dir, 'ES'), { recursive: true });
    for (let i = 0; i < 400; i++) writeFileSync(path.join(dir, 'ES', `f${i}.bin`), Buffer.alloc(10));
    // pętla zdarzeń: setImmediate musi zdążyć się wykonać, zanim policzy się rozmiar (wersja synchroniczna blokowała wszystko do końca)
    let ticks = 0, on = true;
    const spin = () => { if (!on) return; ticks++; setImmediate(spin); };
    setImmediate(spin);
    const p = Cd.dirBytes(dir);
    assert.ok(p && typeof p.then === 'function', 'dirBytes zwraca Promise');
    assert.equal(await p, 4000);
    on = false;
    assert.ok(ticks > 0, `pętla zdarzeń stała przez całe liczenie (ticks=${ticks})`);
    // pamięć 60 s: nowe pliki widać dopiero po upływie czasu
    let t = 1_000_000;
    const C = Cd.createCandles({ getKey: () => '', getConfig: () => ({}), baseDir: dir, now: () => t });
    assert.equal(await C.dataBytes(), 4000);
    writeFileSync(path.join(dir, 'nowy.bin'), Buffer.alloc(1000));
    t += 30_000; assert.equal(await C.dataBytes(), 4000, 'w ciągu 60 s wynik z pamięci');
    t += 31_000; assert.equal(await C.dataBytes(), 5000, 'po 60 s liczone od nowa');
    // jednoczesne pytania: jedno przejście katalogu
    t += 61_000; const [a, b] = await Promise.all([C.dataBytes(), C.dataBytes()]); assert.equal(a, 5000); assert.equal(b, 5000);
    // trasa serwera czeka na wynik (bez readdirSync/statSync w dirBytes)
    const fn = src('lib/candles.mjs').slice(src('lib/candles.mjs').indexOf('export async function dirBytes'));
    assert.ok(fn.length > 30 && !/readdirSync|statSync/.test(fn.slice(0, fn.indexOf('\n}\n'))), 'dirBytes bez synchronicznych wywołań');
    assert.match(src('server.mjs'), /bytes: await candles\.dataBytes\(\)/);
  });

  test('wykresy-14: migracja nakładek ze starego klucza: raz, ze świeżym czasem, potem stary klucz nieczytany (zachowanie)', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    const P = await lib('public/js/podglad.js');
    const mem = {};
    const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    mem[P.OVERLAY_KEY] = JSON.stringify({ sessions: true, pdhl: true, sess: { london: { from: '03:00', to: '05:00' } } });
    const at = '2026-10-29T10:00:00.000Z';
    // ustawienia bez nakładek: wynik migracji z czasem migracji, znacznik „przeniesione” zapisany
    const m1 = C.migrateLegacyOverlays({}, storage, at);
    assert.ok(m1, 'migracja zwraca nakładki');
    assert.equal(m1.overlays.sessions, true); assert.equal(m1.overlays.pdhl, true); assert.equal(m1.overlays.sess.london.from, '03:00');
    assert.equal(m1.at, at);
    assert.equal(mem[C.OVERLAY_MOVED_KEY], at, 'stary klucz oznaczony jako przeniesiony');
    // drugi start (np. zdalne domyślne nakładki nadpisały ustawienia): stary klucz już nie wraca
    mem[P.OVERLAY_KEY] = JSON.stringify({ sessions: false, pdhl: false });
    assert.equal(C.migrateLegacyOverlays({}, storage, at), null, 'stary klucz czytany tylko raz');
    // ustawienia już mają nakładki: bez migracji, bez znacznika
    delete mem[C.OVERLAY_MOVED_KEY];
    assert.equal(C.migrateLegacyOverlays({ chart: { overlays: { sessions: false } } }, storage, at), null);
    assert.equal(mem[C.OVERLAY_MOVED_KEY], undefined);
    // brak albo uszkodzony stary zapis: nic
    delete mem[P.OVERLAY_KEY];
    assert.equal(C.migrateLegacyOverlays({}, storage, at), null);
    mem[P.OVERLAY_KEY] = 'to nie JSON';
    assert.equal(C.migrateLegacyOverlays({}, storage, at), null);
    // localStorage niedostępny (wyjątek przy odczycie): bez wyjątku
    assert.equal(C.migrateLegacyOverlays({}, { getItem: () => { throw new Error('blokada'); }, setItem() {} }, at), null);
  });

  test('wykresy-18: „Anuluj” przed startem nagrania (w trakcie play()) przerywa je; błąd MediaRecorder zatrzymuje strumień i film tła', async () => {
    const F = await lib('public/js/film.js');
    const listeners = {};
    const doc = { visibilityState: 'visible', addEventListener: (n, f) => { listeners[n] = f; }, removeEventListener: (n) => { delete listeners[n]; } };
    let stopped = 0, created = 0, paused = 0;
    const stream = () => ({ getAudioTracks: () => [], removeTrack() {}, getTracks: () => [{ stop: () => { stopped++; } }] });
    const canvas = { captureStream: stream };
    const mimeInfo = { mime: 'video/mp4', ext: 'mp4', mp4: true };
    const prevMR = globalThis.MediaRecorder;
    // działający MediaRecorder z atrapy (stop → onstop): stary kod nagrałby film do końca mimo anulowania
    globalThis.MediaRecorder = class { constructor() { created++; this.state = 'inactive'; } start() { this.state = 'recording'; } stop() { this.state = 'inactive'; setTimeout(() => this.onstop?.(), 0); } };
    try {
      const ctrl = new AbortController();
      const video = { currentTime: 5, play: async () => { ctrl.abort(); }, pause: () => { paused++; } };
      await assert.rejects(F.record({ canvas, seconds: 0.2, draw: () => {}, video, mimeInfo, signal: ctrl.signal, doc }), (e) => e.name === 'AbortError');
      assert.equal(created, 0, 'po anulowaniu w trakcie play() nie powstaje MediaRecorder');
      assert.ok(paused >= 1, 'film tła zatrzymany');
      // błąd konstruktora MediaRecorder: tory strumienia zatrzymane, film tła zatrzymany, wyjątek dalej
      globalThis.MediaRecorder = class { constructor() { throw new Error('NotSupported'); } };
      stopped = 0; paused = 0;
      const v2 = { currentTime: 0, play: async () => {}, pause: () => { paused++; } };
      await assert.rejects(F.record({ canvas, seconds: 0.2, draw: () => {}, video: v2, mimeInfo, doc }), /NotSupported/);
      assert.equal(stopped, 1, 'tory strumienia zatrzymane'); assert.ok(paused >= 1, 'film tła zatrzymany');
      assert.deepEqual(Object.keys(listeners), [], 'bez wiszących nasłuchów');
    } finally { globalThis.MediaRecorder = prevMR; }
  });

  test('wykresy-14: każdy klucz wysyłany przez collect() (app.js) przechodzi przez SECRET_KEY bez strat, łącznie z zagnieżdżonymi', async () => {
    const S = await lib('lib/sync.mjs');
    const C = await lib('public/js/styl-wykresu.js');
    const Pl = await lib('public/js/palety.js');
    const W = await lib('public/js/udostepnij.js');
    const app = src('public/js/app.js');
    const m = /collect: \(\) => \(\{([^\n]*)\}\),/.exec(app);
    assert.ok(m, 'collect() w app.js');
    const keys = [...m[1].matchAll(/(?:^|,)\s*([A-Za-z]+)\s*:/g)].map((x) => x[1]);
    assert.ok(keys.length >= 12 && keys.includes('chart') && keys.includes('share'), keys.join(','));
    // pełne wartości tam, gdzie są obiekty; reszta przykładowa (liczba albo tekst)
    const full = { custom: Pl.defaultCustom(), share: W.sanitizeShare({ nick: 'x' }), chart: C.chartDefaults() };
    const obj = Object.fromEntries(keys.map((k) => [k, k in full ? full[k] : 'x']));
    const plain = JSON.parse(JSON.stringify(obj));
    const lost = [];
    const walk = (a, b, p) => { for (const k of Object.keys(a)) { if (!b || !(k in b)) lost.push(p + k); else if (a[k] && typeof a[k] === 'object') walk(a[k], b[k], `${p}${k}.`); } };
    walk(plain, S.sanitizeSettings(plain), '');
    assert.deepEqual(lost, [], 'SECRET_KEY wycina zwykłe klucze ustawień');
    // wycinanie sekretów zostaje: databento*, limity i kredyt, token/secret/password/hasło/pin, klucze API
    const gone = S.sanitizeSettings({ databentoKey: 1, chartCostLimitUsd: 1, chartDailyLimitUsd: 1, chartCredit: 1, chartSpend: 1, token: 1, secret: 1, password: 1, haslo: 1, 'hasło': 1, pin: 1, apiKey: 1, key: 1 });
    assert.deepEqual(gone, {});
  });

  test('wykresy-14: sanitizeSettings na granicy głębokości zwraca null (sekret na 8. poziomie nie przechodzi)', async () => {
    const S = await lib('lib/sync.mjs');
    const deep = { chart: { a: { b: { c: { d: { e: { f: { g: { databentoKey: 'deep', ok: 1 } } } } } } } } };
    const out = S.sanitizeSettings(deep);
    assert.ok(!JSON.stringify(out).includes('deep'), JSON.stringify(out));
    assert.ok(!JSON.stringify(out).includes('databentoKey'));
    // płytsze dane bez zmian
    assert.deepEqual(S.sanitizeSettings({ chart: { overlays: { sess: { asia: { from: '20:00' } } } } }), { chart: { overlays: { sess: { asia: { from: '20:00' } } } } });
  });

  test('wykresy-14: zdalne ustawienia z obiektem zamiast tekstu ({"toString":1}) nie wywracają sanitizeChart ani sanitizeCustom', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    const Pl = await lib('public/js/palety.js');
    const d = C.chartDefaults();
    const bad = { custom: { onyx: { up: evil(), down: evil() }, platinum: { up: evil() } }, overlays: { sessions: true, sess: { asia: { from: evil(), to: evil() }, london: { from: '03:00', to: evil() } }, pdColor: evil() } };
    let out;
    assert.doesNotThrow(() => { out = C.sanitizeChart(bad); });
    assert.deepEqual(out.custom, d.custom, 'kolory z obiektu → domyślne');
    assert.equal(out.overlays.sessions, true, 'reszta ustawień zostaje');
    assert.equal(out.overlays.sess.asia.from, d.overlays.sess.asia.from); assert.equal(out.overlays.sess.asia.to, d.overlays.sess.asia.to);
    assert.equal(out.overlays.sess.london.from, '03:00', 'dobra godzina zostaje'); assert.equal(out.overlays.sess.london.to, d.overlays.sess.london.to, 'zła wraca do domyślnej');
    let cu;
    assert.doesNotThrow(() => { cu = Pl.sanitizeCustom({ onyx: { profit: evil(), loss: '#123456' } }); });
    assert.equal(cu.onyx.loss, '#123456'); assert.equal(cu.onyx.profit, Pl.defaultCustom().onyx.profit);
    assert.equal(Pl.normHex(evil()), null); assert.equal(Pl.normHex(123), null); assert.equal(Pl.normHex('#ABC'), '#aabbcc');
  });

  test('wykresy-16: mianownik % konta w jednym miejscu: krzywa kapitału i wynik karty z tej samej funkcji', async () => {
    const D = await lib('public/js/udostepnij-dane.js');
    const St = await lib('public/js/stats.js');
    const A = 'aaaaaaaa-0000-4000-8000-000000000001', B = 'bbbbbbbb-0000-4000-8000-000000000002';
    const konta = St.normalizeKonta([{ _id: A, name: 'A', size: 50000 }, { _id: B, name: 'B', size: 25000 }]);
    const byId = new Map(konta.map((k) => [k.id, k]));
    const row = (i, date, pnl, kk) => ({ _id: `t${i}`, _created: `${date}T12:0${i}:00.000Z`, typ: { name: 'Live' }, date, r: 1, pnl, konta: kk, dir: { name: 'Long' }, instrument: { name: 'ES' } });
    const ts = St.normalizeTrades([row(1, '2026-10-20', 500, [A]), row(2, '2026-10-21', -250, [A, B]), row(3, '2026-10-22', 750, [B])]);
    assert.equal(typeof D.pctBase, 'function', 'wspólna funkcja mianownika');
    const b = D.pctBase(ts, byId);
    assert.deepEqual(b, { pnl: 1000, size: 75000 });
    assert.equal(D.pctOf(ts, byId), (1000 / 75000) * 100);
    const curve = D.equityCurve(ts, byId);
    assert.equal(curve[curve.length - 1].v['%'], D.pctOf(ts, byId), 'koniec krzywej = wynik karty');
    // konto bez rozmiaru: brak % i w karcie, i w krzywej
    const ts2 = St.normalizeTrades([row(1, '2026-10-20', 500, [A]), row(4, '2026-10-21', 100, ['cccccccc-0000-4000-8000-000000000003'])]);
    assert.equal(D.pctBase(ts2, byId), null);
    assert.ok(D.equityCurve(ts2, byId).every((p) => p.v['%'] == null));
    assert.ok(!/flatMap\(\(t\) => t\.konta\)\)\) size \+=/.test(src('public/js/udostepnij-dane.js')), 'bez drugiej kopii sumy rozmiarów w equityCurve');
  });
};
