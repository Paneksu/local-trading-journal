// wykresy-11: miniatury wykresów na liście trade'ów i w panelu (pakiet F): GET /api/candles?tf=auto&maxBars, kadr miniatury, kształt SVG,
// kolejka ładowania (najwyżej 4 naraz, cache), brak rysunków i brak pobrań z sieci. Tylko atrapa Databento i dane syntetyczne.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  let port = 4860;
  const utc = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
  const D26 = utc(2026, 10, 26, 15); // 10:00 CDT
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const P = () => lib('public/js/podglad.js');
  const store = () => lib('lib/candles-store.mjs');

  async function rig({ notion = null } = {}) {
    const dir = H.tmp();
    const A = await H.atrapaDb(++port);
    const nEnv = notion ? { NOTION_API_BASE: notion.base, NOTION_TOKEN: 'test-token-atrapa', DS_TRADES: H.IDS.DS_TRADES, DS_KONTA: H.IDS.DS_KONTA, DS_DZIENNIK: H.IDS.DS_DZIENNIK, DS_FINANSE: H.IDS.DS_FINANSE, NOTION_ROOT_URL: H.PARENT_URL } : {};
    const S = await H.server(++port, { THQ_CONFIG_DIR: dir, DATABENTO_API_BASE: A.base, DATABENTO_API_KEY: 'db-test-key-0123456789abcdef', ...nEnv });
    const get = async (p) => { const r = await fetch(S.base + p); return { status: r.status, j: await r.json() }; };
    const q = (o) => '?' + new URLSearchParams(o).toString();
    return { dir, A, S, get, q, base: path.join(dir, 'chart-data'), stop: () => { S.stop(); A.stop(); } };
  }
  const S1 = D26 + 40005; // wyrównane do 15 s od otwarcia sesji (22:00 UTC poprzedniego dnia), więc 1200 s to dokładnie 80 świec 15s
  const bars = (t0, n, step, layerSec) => Array.from({ length: n }, (_, i) => [t0 + i * step, 502500 + (i % 7) * 25, 502650 + (i % 7) * 25, 502450, 502575, 3]);

  test('wykresy-11: tf=auto&maxBars: najmniejszy interwał z 15s 1m 5m 15m 1h, przy którym jest co najmniej jedna świeca i najwyżej maxBars', async () => {
    const R = await rig();
    try {
      const C = await store();
      // 600 minut świec 1m (10 h): 60 min → 1m (60), 120 min → 5m (24), 600 min → 15m (40 ≤ 80)
      C.writeRange('ES', '1m', D26, D26 + 36000, bars(D26, 600, 60), { rolls: [] }, { baseDir: R.base });
      C.writeRange('ES', '1s', S1, S1 + 1500, bars(S1, 1500, 1), { rolls: [] }, { baseDir: R.base });
      const pick = async (len, extra = {}) => (await R.get('/api/candles' + R.q({ instrument: 'ES', from: String(D26), to: String(D26 + len), tf: 'auto', maxBars: '80', ...extra }))).j;
      let r = await pick(3600);
      assert.equal(r.tf, '1m'); assert.equal(r.bars.length, 60);
      r = await pick(7200);
      assert.equal(r.tf, '5m'); assert.equal(r.bars.length, 24);
      r = await pick(36000);
      assert.equal(r.tf, '15m'); assert.equal(r.bars.length, 36, '600 minut od 10:00 CT bez przerwy 16-17 CT (4 świece po 15 min)');
      // maxBars mniejsze: ta sama godzina schodzi na większy interwał
      r = await pick(3600, { maxBars: '20' });
      assert.equal(r.tf, '5m'); assert.equal(r.bars.length, 12);
      // MES to ten sam magazyn co ES (P9), ceny dziesiętne jak w zwykłym odczycie
      const m = (await R.get('/api/candles' + R.q({ instrument: 'MES', from: String(D26), to: String(D26 + 3600), tf: 'auto', maxBars: '80' }))).j;
      assert.equal(m.tf, '1m'); assert.equal(m.bars[0][1], 5025);
      // okno 1s: 15 s tylko tam, gdzie jest warstwa 1s (20 min = 80 świec 15s); zapisy przed pierwszym odczytem, bo serwer pamięta pokrycie
      r = await pick(1200, { from: String(S1), to: String((S1 + 1200)) });
      assert.equal(r.tf, '15s'); assert.equal(r.bars.length, 80);
      r = await pick(1500, { from: String(S1), to: String((S1 + 1500)) });
      assert.notEqual(r.tf, '15s', 'ponad 80 świec 15s: wyższy interwał');
      // 15s bez warstwy 1s nie wygrywa pustym wynikiem
      r = await pick(3600);
      assert.notEqual(r.tf, '15s');
      assert.deepEqual((await R.A.log()).log, [], 'odczyt nie dotyka sieci (Databento)');
    } finally { R.stop(); }
  });

  test('wykresy-11: tf=auto: brak świec daje pustą odpowiedź (1m), wszystko ponad limitem największy interwał, brak źródła, walidacja maxBars, zero żądań do atrapy', async () => {
    const R = await rig();
    try {
      const C = await store();
      const ok = { instrument: 'ES', from: String(D26), to: String(D26 + 3600), tf: 'auto', maxBars: '80' };
      const e = (await R.get('/api/candles' + R.q({ ...ok, instrument: 'NQ' }))).j; // NQ ma pusty magazyn (odczyt przed zapisem ES, bo serwer pamięta pokrycie)
      assert.deepEqual(e.bars, []); assert.equal(e.tf, '1m'); assert.ok(e.missing.length, 'brak pokrycia jest widoczny');
      // 200 świec 1m w 200 minutach; maxBars 10: nawet 1h ma 4 świece, więc wygrywa 1h tylko gdy mieści się; tu 15m (14 > 10) → 1h (4)
      C.writeRange('ES', '1m', D26, D26 + 72000, bars(D26, 1200, 60), { rolls: [] }, { baseDir: R.base });
      const t = (await R.get('/api/candles' + R.q({ ...ok, to: String(D26 + 12000), maxBars: '10' }))).j;
      assert.equal(t.tf, '1h'); assert.ok(t.bars.length <= 10);
      // nic się nie mieści: zwracamy największy interwał (klient przytnie)
      const big = (await R.get('/api/candles' + R.q({ ...ok, to: String(D26 + 72000), maxBars: '10' }))).j;
      assert.equal(big.tf, '1h'); assert.ok(big.bars.length > 10, '20 godzin: nawet 1h przekracza 10 świec, klient przytnie');
      for (const bad of [{ maxBars: '0' }, { maxBars: '5' }, { maxBars: '501' }, { maxBars: 'x' }, { maxBars: '80.5' }]) {
        const r = await R.get('/api/candles' + R.q({ ...ok, ...bad }));
        assert.equal(r.status, 400, JSON.stringify(bad));
      }
      assert.equal((await R.get('/api/candles' + R.q({ ...ok, instrument: 'EURUSD' }))).j.noSource, true);
      assert.equal((await R.get('/api/candles' + R.q({ ...ok, to: String(D26 + 401 * 86400) }))).status, 422, 'zakres ponad 400 dni jak zwykły odczyt');
      assert.equal((await R.get('/api/candles' + R.q({ instrument: 'ES', from: ok.from, to: ok.to, tf: 'auto' }))).j.tf, '1m', 'maxBars domyślnie 80');
      assert.deepEqual((await R.A.log()).log, []);
    } finally { R.stop(); }
  });

  // P29 (28.10.2026) zastąpił kadr −15%/+15% (minimum 20 minut) kadrem „świece trade'a + 3 z każdej strony”: testy w wykresy-14-p29.mjs.
  test('wykresy-11: kadr miniatury (od P29): trade 100 min na 10m z 3 świecami zapasu, krótki trade na 1m, trade bez wyjścia', async () => {
    const { miniPlan } = await P();
    const e = D26;
    assert.deepEqual(miniPlan(e, e + 6000), { tf: '10m', from: e - 1800, to: e + 6000 + 2400 }, '100 min = 11 świec 10m + 6');
    const short = miniPlan(e, e + 60);
    assert.deepEqual([short.tf, (short.to - short.from) / 60], ['1m', 8], 'krótki trade: 2 świece + 6');
    const open = miniPlan(e, null);
    assert.equal(open.from, e - 180); assert.equal(open.to, e + 960, 'bez wyjścia: 3 świece przed wejściem, 12 po');
  });

  test('wykresy-11: SVG miniatury: świece i poziomy (SL, TP, BE przerywane), kropki wejścia i wyjścia, bez napisów, osi i rysunków; tylko klasy CSS', async () => {
    const { miniSvg } = await P();
    const t0 = D26, n = 60;
    const cs = Array.from({ length: n }, (_, i) => [t0 + i * 60, 5000 + i * 0.25, 5001 + i * 0.25, 4999.5 + i * 0.25, 5000.5 + i * 0.25, 5]);
    const trade = { at: (t0 + 10 * 60) * 1000, exitAt: (t0 + 40 * 60) * 1000, instrument: 'MES', entryPrice: 5002.5, exitPrice: 5010, sl: 4998, tp: 5012, be: 5002.75, r: 2 };
    const svg = miniSvg(trade, { tf: '1m', bars: cs }, { w: 96, h: 30 });
    assert.match(svg, /^<svg /); assert.match(svg, /viewBox="0 0 96 30"/);
    assert.match(svg, /class="candle up"/); assert.match(svg, /class="wick up"/);
    for (const c of ['lvl sl', 'lvl tp', 'lvl be', 'pos-profit', 'pos-loss', 'lvl-d entry', 'lvl-d exit']) assert.ok(svg.includes(`class="${c}`), c);
    assert.doesNotMatch(svg, /<text/, 'bez napisów: ani wejście/wyjście, ani cen, ani osi');
    assert.doesNotMatch(svg, /class="drw|class="grid|class="axis/, 'bez rysunków i osi');
    assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,6}\b|rgb\(/, 'kolory tylko z CSS');
    // poziomy poza kadrem świec nie psują skali; brak pól = brak linii
    const bare = miniSvg({ ...trade, sl: null, tp: null, be: null, exitPrice: null }, { tf: '1m', bars: cs }, { w: 96, h: 30 });
    assert.ok(!bare.includes('lvl be') && !bare.includes('lvl sl'));
    // puste świece: null (wywołujący pokazuje zrzut albo kreskę)
    assert.equal(miniSvg(trade, { tf: '1m', bars: [] }, { w: 96, h: 30 }), null);
    // trade poza zakresem pobranych świec: nie ma czego rysować
    assert.equal(miniSvg({ ...trade, at: (t0 + 86400) * 1000, exitAt: (t0 + 86400 + 600) * 1000 }, { tf: '1m', bars: cs }, { w: 96, h: 30 }), null);
  });

  test('wykresy-11: kolejka miniatur: najwyżej 4 naraz, cache po kluczu (zero drugiego żądania), czyszczenie po pobraniu świec, anulowanie, błąd nie blokuje kolejki', async () => {
    const { createMiniQueue } = await P();
    let running = 0, peak = 0, calls = 0;
    const gate = [];
    const load = (key) => { calls++; running++; peak = Math.max(peak, running); return new Promise((res, rej) => gate.push(() => { running--; key === 'zły' ? rej(new Error('x')) : res({ key }); })); };
    const q = createMiniQueue({ load, limit: 4 });
    const got = [];
    const ps = Array.from({ length: 10 }, (_, i) => q.get(`t${i}`).then((v) => got.push(v.key)));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(running, 4, 'tylko 4 żądania naraz'); assert.equal(peak, 4);
    while (gate.length) { gate.shift()(); await new Promise((r) => setTimeout(r, 0)); }
    await Promise.all(ps);
    assert.equal(calls, 10); assert.equal(peak, 4); assert.equal(got.length, 10);
    // cache: ten sam klucz nie woła ponownie, także gdy pierwszy jeszcze leci
    const a = q.get('t3'), b = q.get('t3');
    assert.equal(calls, 10, 'z cache');
    await Promise.all([a, b]);
    // wersja danych: po pobraniu świec cache jest pusty
    q.clear();
    const c = q.get('t3'); await new Promise((r) => setTimeout(r, 0)); gate.shift()(); await c;
    assert.equal(calls, 11);
    // błąd: obietnica odrzucona, klucz nie zostaje w cache (następne wywołanie próbuje znów), kolejka idzie dalej
    const bad = q.get('zły'); await new Promise((r) => setTimeout(r, 0)); gate.shift()();
    await assert.rejects(bad);
    const again = q.get('zły'); await new Promise((r) => setTimeout(r, 0));
    assert.equal(calls, 13, 'po błędzie nowa próba'); gate.shift()(); await again.catch(() => {});
    // anulowanie: element, który zniknął z ekranu przed startem, nie woła serwera
    const q2 = createMiniQueue({ load, limit: 1 });
    const first = q2.get('a'); const sk = q2.get('b', { skip: () => true });
    await new Promise((r) => setTimeout(r, 0)); gate.shift()(); await first;
    assert.equal(await sk, null, 'pominięta pozycja kończy się null bez żądania');
    assert.equal(calls, 14);
  });

  test('wykresy-11: wynik odczytu → miniatura albo zrzut: brak świec, trade po availableEnd, brak źródła i błąd to powrót do zrzutu', async () => {
    const { miniOutcome } = await P();
    const bars1 = [[1, 1, 2, 0.5, 1.5, 1]];
    assert.equal(miniOutcome({ bars: bars1 }), 'chart');
    assert.equal(miniOutcome({ bars: [] }), 'fallback');
    assert.equal(miniOutcome({ bars: [], unavailable: true }), 'fallback', 'trade po availableEnd');
    assert.equal(miniOutcome({ noSource: true }), 'fallback');
    assert.equal(miniOutcome(null), 'fallback');
  });

  test('wykresy-11: miniatura nigdy nie woła rysunków, wyceny ani pobrania, Notion ani localStorage; wymaga tylko lokalnych świec', async () => {
    const src = readFileSync(path.join(ROOT, 'public/js/podglad.js'), 'utf8');
    const a = src.indexOf('// ---- miniatury'), b = src.indexOf('// ---- koniec miniatur');
    assert.ok(a > 0 && b > a, 'sekcja miniatur oznaczona w kodzie');
    const mini = src.slice(a, b);
    assert.doesNotMatch(mini, /\/api\/drawings|candles\/quote|candles\/fetch|candles\/windows|candles\/import|\/v1\/pages|POST/, 'żadnych tras zapisu, rysunków ani Notion');
    assert.doesNotMatch(mini, /localStorage|sessionStorage/, 'świece nie trafiają do localStorage');
    assert.match(mini, /tf: a\.tf/); assert.match(mini, /IntersectionObserver/); assert.match(mini, /200px/); // P29: interwał z miniPlan zamiast tf=auto
    // lista w app.js używa tylko miniatur z podglad.js
    const app = readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
    assert.match(app, /observeMinis/);
  });

  // B2 (przegląd 28.10.2026): dawna asercja doesNotMatch(out + err, /drawings|v1/pages/) nie mogła zaczerwienić się, bo serwer nie loguje żądań.
  // Teraz serwer ma atrapę Notion i liczymy jej żądania: miniatury nie mogą wygenerować ani jednego (ani rysunków, ani stron, ani schematu).
  // Detektor sam się sprawdza: odczyt rysunków (/api/drawings/<id>) MUSI podnieść licznik, inaczej test pada.
  const notionLog = async (A) => (await A.get('/__test/log')).filter((l) => !l.includes('/__test/')); // własne odpytywanie atrapy się nie liczy
  const notionCount = async (A) => (await notionLog(A)).length;
  test('wykresy-11: lista 50 tradeów: serwer odpowiada na /api/candles?tf=auto bez żądań do Databento i bez ani jednego żądania do Notion (licznik atrapy, z samosprawdzeniem)', async () => {
    const N = await H.atrapa(++port);
    const R = await rig({ notion: N });
    try {
      const C = await store();
      C.writeRange('ES', '1m', D26, D26 + 36000, bars(D26, 600, 60), { rolls: [] }, { baseDir: R.base });
      await fetch(R.S.base + '/api/ping');
      await H.sleep(400); // start serwera może pytać Notion; liczymy dopiero potem
      const n0 = await notionCount(N);
      for (let i = 0; i < 50; i++) {
        const f = D26 + (i % 5) * 600;
        const r = await R.get('/api/candles' + R.q({ instrument: i % 2 ? 'MES' : 'ES', from: String(f), to: String(f + 1800), tf: 'auto', maxBars: '80' }));
        assert.equal(r.status, 200); assert.ok(r.j.bars.length > 0);
      }
      assert.deepEqual((await R.A.log()).log, [], '50 odczytów miniatur: zero żądań do Databento');
      const n1 = await notionCount(N);
      assert.equal(n1 - n0, 0, `50 odczytów miniatur wysłało ${n1 - n0} żądań do Notion: ${JSON.stringify((await notionLog(N)).slice(n0))}`);
      // samosprawdzenie: odczyt rysunków idzie do Notion, więc licznik musi to zobaczyć
      await R.get('/api/drawings/11111111-1111-4111-8111-aaaaaaaaaaaa');
      assert.ok((await notionCount(N)) - n1 > 0, 'detektor widzi odczyt rysunków (inaczej asercja wyżej nie mogłaby zaczerwienić się)');
    } finally { R.stop(); N.stop(); }
  });
};
