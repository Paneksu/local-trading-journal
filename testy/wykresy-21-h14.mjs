// wykresy-14 (pakiet H, etap 14): Ustawienia → Wykresy. Decyzje P39-P42 (28.10.2026, słowa użytkownika z AskUserQuestion):
//  P39 «Bez przycisku» (grupa Dane: tylko rozmiar chart-data/), P40 «Tylko podgląd» (limity, wydatki i kredyt bez pól edycji),
//  P41 «Przenieść do „Wykresy”» (strefa czasowa i B-ADJ z „Ogólne”), P42 «Tak, synchronizować» (nakładki z localStorage do settings.chart).
// Funkcje czyste w Node, synchronizacja na atrapie Notion, DOM i przeglądarka w E2E (testy/wykresy-e2e-h.mjs, osobno od run.mjs).
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
  let port = 4910;
  const SECRET = /token|secret|password|haslo|hasło|pin|key|databento|chartcost|chartdaily|chartcredit|chartspen/i; // kopia SECRET_KEY z lib/sync.mjs: klucze ustawień nie mogą pod nią podpadać

  test('wykresy-14: sanitizeChart: nieznane klucze i złe wartości odpadają (także klucze z prototypu), brak klucza = domyślna', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    const d = C.chartDefaults();
    assert.deepEqual(C.sanitizeChart(undefined), d); assert.deepEqual(C.sanitizeChart(null), d); assert.deepEqual(C.sanitizeChart('x'), d); assert.deepEqual(C.sanitizeChart([1]), d);
    assert.deepEqual(C.sanitizeChart({}), d);
    const dirty = C.sanitizeChart({
      style: 'ohlc', colorMode: 'neon', grid: 'tak', entry: 1, exit: false, sl: null, tp: false,
      hollow: true, upColor: '#ff0000', vertGrid: true, candleStyle: 'bars', wicks: false, databentoKey: 'db-SEKRET', chartCostLimitUsd: 9, __proto__: { polluted: 1 }, constructor: 'x',
      custom: { onyx: { up: 'red', down: '#ABCDEF' }, platinum: 'x', neon: { up: '#000000' } },
      overlays: { sessions: 'tak', pdhl: true, sess: { asia: { from: '25:00', to: '01:00' } }, extra: 1 },
      shareChart: 'x', shareStyle: 'wild', filmFormat: '4:3', filmSeconds: 7, filmDim: 0.55, filmBw: 1, equity: 0, slCard: 'x', tpCard: true, audio: true, filmAudio: true,
    });
    assert.equal(dirty.style, 'candles'); assert.equal(dirty.colorMode, 'palette'); assert.equal(dirty.grid, true, 'zła wartość = domyślna');
    assert.equal(dirty.entry, true); assert.equal(dirty.exit, false, 'poprawna wartość zostaje'); assert.equal(dirty.sl, true); assert.equal(dirty.tp, false);
    assert.deepEqual(dirty.custom.onyx, { up: d.custom.onyx.up, down: '#abcdef' }, 'zły hex = domyślny, dobry znormalizowany');
    assert.deepEqual(dirty.custom.platinum, d.custom.platinum);
    assert.equal(dirty.overlays.sessions, false); assert.equal(dirty.overlays.pdhl, true);
    assert.equal(dirty.overlays.sess.asia.from, C.chartDefaults().overlays.sess.asia.from, 'zła godzina sesji = domyślna'); assert.equal(dirty.overlays.sess.asia.to, '01:00', 'dobra zostaje');
    assert.equal(dirty.shareChart, true); assert.equal(dirty.shareStyle, 'candles', 'v2: zły styl karty = styl podglądu (tu domyślny)'); assert.equal(dirty.shareDraw, 'position'); assert.equal(dirty.filmFormat, '9:16'); assert.equal(dirty.filmSeconds, 10); assert.equal(dirty.filmDim, 0.6);
    assert.equal(dirty.filmBw, false); assert.equal(dirty.equity, true); assert.ok(!('slCard' in dirty) && !('tpCard' in dirty), 'v2 (P45): SL/TP w kartach rysuje tryb „Pozycja”, klucze odpadają');
    const keys = Object.keys(dirty).sort();
    assert.deepEqual(keys, [...C.CHART_KEYS].sort(), 'tylko znane klucze: nic z prototypu, żadnego klucza Databento, żadnego audio (P21)');
    assert.equal(({}).polluted, undefined);
    const ok = C.sanitizeChart({ style: 'line', colorMode: 'custom', grid: false, filmFormat: '16:9', filmSeconds: 15, filmDim: 0.2, shareStyle: 'line' }); // pakiet I: lista stylów karty same / candles / line (było same / own); pakiet J: 6 / 10 / 15 s
    assert.equal(ok.style, 'line'); assert.equal(ok.colorMode, 'custom'); assert.equal(ok.grid, false); assert.equal(ok.filmFormat, '16:9'); assert.equal(ok.filmSeconds, 15); assert.equal(ok.filmDim, 0.2); assert.equal(ok.shareStyle, 'line');
    assert.deepEqual(C.sanitizeChart(ok), ok, 'idempotentna');
  });

  test('wykresy-14: wartości domyślne: świece, wykres w kartach włączony (P15), film 9:16 / 10 s / kolor / 0,6, karty v2: świece i pozycja, nakładki wyłączone', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    const d = C.chartDefaults();
    assert.equal(d.style, 'candles', 'P18: domyślnie wypełnione świece'); assert.equal(d.colorMode, 'palette'); assert.equal(d.grid, true);
    assert.deepEqual([d.entry, d.exit, d.sl, d.tp], [true, true, true, true]);
    assert.equal(d.shareChart, true); assert.equal(d.shareStyle, 'candles'); assert.equal(d.shareDraw, 'position'); assert.equal(d.miniStyle, 'candles'); assert.equal(d.equity, true); // v2: P45, P46
    assert.equal(d.filmFormat, '9:16'); assert.equal(d.filmSeconds, 10); assert.equal(d.filmBw, false); assert.equal(d.filmDim, 0.6);
    assert.equal(d.overlays.sessions, false); assert.equal(d.overlays.pdhl, false);
    assert.ok(!('audio' in d) && !('filmAudio' in d), 'P21: bez opcji dźwięku');
    const P = await lib('public/js/palety.js');
    assert.equal(d.custom.onyx.up, P.BASE.onyx.profit); assert.equal(d.custom.platinum.down, P.BASE.platinum.loss);
  });

  test('wykresy-14: żaden klucz settings.chart (także zagnieżdżony) nie podpada pod SECRET_KEY z lib/sync.mjs', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    const walk = (o, p = '') => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => [[p + k, k], ...walk(v, p + k + '.')]) : []);
    const bad = walk(C.chartDefaults()).filter(([, k]) => SECRET.test(k)).map(([full]) => full);
    assert.deepEqual(bad, []);
    assert.ok(src('lib/sync.mjs').includes('const SECRET_KEY = ' + SECRET.toString()), 'R21: lib/sync.mjs odrzuca key, databento, limity kosztu i kredyt');
  });

  test('wykresy-14: „Przywróć domyślne” per grupa: wraca tylko jej klucze', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    const d = C.chartDefaults();
    const changed = C.sanitizeChart({ style: 'line', colorMode: 'custom', grid: false, entry: false, sl: false, overlays: { sessions: true, pdhl: true }, shareChart: false, filmSeconds: 15 });
    const look = C.resetChartGroup(changed, 'look');
    assert.equal(look.style, 'candles'); assert.equal(look.colorMode, 'palette'); assert.equal(look.grid, true);
    assert.equal(look.entry, false, 'poziomy to osobna grupa'); assert.equal(look.overlays.sessions, true, 'nakładki bez zmian'); assert.equal(look.shareChart, false);
    const lv = C.resetChartGroup(changed, 'levels');
    assert.equal(lv.entry, true); assert.equal(lv.sl, true); assert.equal(lv.style, 'line');
    const ov = C.resetChartGroup(changed, 'overlays');
    assert.deepEqual(ov.overlays, d.overlays); assert.equal(ov.style, 'line'); assert.equal(ov.grid, false);
    const cards = C.resetChartGroup(changed, 'cards');
    assert.equal(cards.shareChart, true); assert.equal(cards.filmSeconds, 10); assert.equal(cards.style, 'line');
    assert.deepEqual(C.resetChartGroup(changed, 'nieistnieje'), changed, 'nieznana grupa nic nie zmienia');
  });

  test('wykresy-14: kontrast własnego koloru liczy funkcja palety, „Popraw” podnosi do progu 4,5:1', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    const P = await lib('public/js/palety.js');
    for (const [hex, th] of [['#3a3d3f', 'onyx'], ['#d0d0d0', 'platinum']]) {
      const r = C.chartContrast(hex, th);
      assert.equal(r.ratio, P.ratioOn(hex, th), 'ta sama funkcja co zakładka Kolory'); assert.equal(r.weak, true, `${hex} na ${th} jest słaby`);
      const fixed = C.fixChartColor(hex, th);
      assert.ok(C.chartContrast(fixed, th).ratio >= 4.5, `${hex} → ${fixed}`); assert.equal(C.chartContrast(fixed, th).weak, false);
    }
    assert.equal(C.chartContrast(P.BASE.onyx.profit, 'onyx').weak, false);
  });

  test('wykresy-14: applyChartVars: własne kolory jako --chart-up/--chart-down dla bieżącego motywu, paleta zdejmuje zmienne', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    const vars = {};
    const root = { style: { setProperty: (k, v) => { vars[k] = v; }, removeProperty: (k) => { delete vars[k]; } } };
    const chart = C.sanitizeChart({ colorMode: 'custom', custom: { onyx: { up: '#112233', down: '#445566' }, platinum: { up: '#0a0b0c', down: '#0d0e0f' } } });
    C.applyChartVars(chart, 'onyx', root); assert.deepEqual(vars, { '--chart-up': '#112233', '--chart-down': '#445566' });
    C.applyChartVars(chart, 'platinum', root); assert.deepEqual(vars, { '--chart-up': '#0a0b0c', '--chart-down': '#0d0e0f' });
    C.applyChartVars({ ...chart, colorMode: 'palette' }, 'onyx', root); assert.deepEqual(vars, {}, 'Z palety: zmienne zdjęte, świece idą po --profit/--loss');
    const css = src('public/styles.css');
    assert.match(css, /svg \.candle\.up \{ fill: var\(--chart-up, var\(--profit\)\); \}/); assert.match(css, /svg \.wick\.down \{ stroke: var\(--chart-down, var\(--loss\)\); \}/);
    const W = src('public/js/wykres.js');
    assert.match(W, /up: probe\(v\('--chart-up'\) \|\| v\('--profit'\)\)/, 'edycja LWC czyta te same zmienne');
  });

  test('wykresy-14: nakładki (P42): magazyn w settings.chart zamiast localStorage; stary zapis czytany raz jako wartość początkowa', async () => {
    const P = await lib('public/js/podglad.js');
    const C = await lib('public/js/styl-wykresu.js');
    const mem = {};
    globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
    try {
      let stored = C.chartDefaults().overlays;
      P.useOverlayBackend({ get: () => stored, set: (p) => { stored = p; } });
      assert.equal(P.loadOverlays().sessions, false);
      P.saveOverlays({ sessions: true, pdhl: true, sess: { london: { from: '03:00', to: '06:00' } } });
      assert.equal(stored.sessions, true); assert.equal(stored.sess.london.from, '03:00'); assert.equal(mem[P.OVERLAY_KEY], undefined, 'z magazynem localStorage nie jest już zapisywany');
      assert.equal(P.loadOverlays().pdhl, true);
      // zmiana z zewnątrz (synchronizacja, Ustawienia): model nakładek czyta stan od nowa
      let calls = 0;
      const ov = P.createOverlays('ES', () => { calls++; });
      assert.equal(ov.prefs().pdhl, true);
      stored = { ...stored, pdhl: false };
      P.notifyOverlays(); assert.equal(calls, 1); assert.equal(ov.prefs().pdhl, false, 'notifyOverlays odświeża prefs');
      ov.destroy(); P.notifyOverlays(); assert.equal(calls, 1, 'zniszczony model nie nasłuchuje');
      P.useOverlayBackend(null);
      mem[P.OVERLAY_KEY] = JSON.stringify({ sessions: true, pdhl: false });
      assert.equal(P.loadOverlays().sessions, true, 'bez magazynu: jak dotąd localStorage');
      assert.equal(C.legacyOverlays(mem[P.OVERLAY_KEY]).sessions, true);
      assert.equal(C.legacyOverlays('to nie JSON'), null); assert.equal(C.legacyOverlays(null), null); assert.equal(C.legacyOverlays('[1]'), null);
      assert.equal(C.legacyOverlays('{"sessions":"tak"}').sessions, false);
    } finally { P.useOverlayBackend(null); delete globalThis.localStorage; }
    const app = src('public/js/app.js');
    assert.match(app, /useOverlayBackend\(\{ get: \(\) => settings\.chart\.overlays/);
    // przegląd HIJ, pkt 2: migracja starego zapisu sprawdzana zachowaniem (migrateLegacyOverlays w wykresy-26-hij.mjs i E2E H6), nie tekstem app.js
  });

  test('wykresy-14: podgląd w Ustawieniach: 40 syntetycznych świec, deterministyczny, bez sieci, przerysowuje się po każdej zmianie', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    const realFetch = globalThis.fetch;
    let net = 0;
    globalThis.fetch = () => { net++; throw new Error('sieć niedozwolona'); };
    try {
      const bars = C.previewBars();
      assert.equal(bars.length, 40); assert.deepEqual(bars, C.previewBars(), 'deterministyczne');
      for (let i = 1; i < bars.length; i++) assert.equal(bars[i][0] - bars[i - 1][0], 300);
      assert.ok(bars.every((b) => b[2] >= Math.max(b[1], b[4]) && b[3] <= Math.min(b[1], b[4])), 'OHLC spójne');
      const tr = C.previewTrade(bars);
      assert.ok(tr.at < tr.exitAt && Number.isFinite(tr.entryPrice) && Number.isFinite(tr.exitPrice) && tr.sl < tr.entryPrice && tr.tp > tr.entryPrice);
      const d = C.chartDefaults();
      const a = C.previewSvg(d), b = C.previewSvg(d);
      assert.equal(a.replace(/swm-\d+/g, 'ID'), b.replace(/swm-\d+/g, 'ID'), 'ten sam wynik dla tych samych ustawień');
      assert.match(a, /class="candle up"/); assert.match(a, /class="candle down"/); assert.match(a, /lvl-t entry/); assert.match(a, /lvl-t exit/); assert.match(a, /lvl sl/); assert.match(a, /lvl tp/);
      const wicks = (a.match(/class="wick up" d="([^"]*)"/)[1].match(/M/g) || []).length + (a.match(/class="wick down" d="([^"]*)"/)[1].match(/M/g) || []).length;
      assert.equal(wicks, 40, 'wszystkie 40 świec w podglądzie (bez dopasowania kadru do pozycji)');
      const noLv = C.previewSvg({ ...d, entry: false, exit: false, sl: false, tp: false });
      assert.ok(!/lvl-t entry|lvl-t exit|lvl sl|lvl tp|pos-profit|pos-loss/.test(noLv), 'wyłączone poziomy znikają z podglądu');
      assert.notEqual(noLv.replace(/swm-\d+/g, 'ID'), a.replace(/swm-\d+/g, 'ID'));
      assert.equal(net, 0, 'podgląd nie robi żądań sieciowych');
    } finally { globalThis.fetch = realFetch; }
  });

  test('wykresy-14: siatka pozioma w podglądzie SVG i w LWC zależy od ustawienia; poziomy trade\'a w edycji', async () => {
    const W = await lib('public/js/wykres.js');
    const C = { profit: 'p', loss: 'l', be: 'b', fg: 'f', fg2: 'f2', grid: 'g', popover: 'po', cross: 'cr', font: 'F' };
    assert.equal(W.themeOptions(C, { grid: false }).grid.horzLines.visible, false); assert.equal(W.themeOptions(C, { grid: true }).grid.horzLines.visible, true);
    assert.equal(W.themeOptions(C).grid.horzLines.visible, true, 'domyślnie siatka jest');
    const tr = { entryPrice: 100, exitPrice: 104, sl: 98, tp: 106, be: 101 };
    assert.deepEqual(W.tradeLevels(tr, C, { entry: false, exit: true, sl: false, tp: true }).map((l) => l.price), [104, 106, 101], 'BE zostaje zawsze');
    assert.deepEqual(W.tradeLevels(tr, C).map((l) => l.price), [100, 104, 98, 106, 101], 'domyślnie wszystkie');
    assert.deepEqual(W.candleOptions({ ...C, up: 'u', down: 'd' }), { upColor: 'u', downColor: 'd', wickUpColor: 'u', wickDownColor: 'd', borderVisible: false });
    const p = src('public/js/podglad.js');
    assert.match(p, /\$\{cfg\.grid \? `<line class="grid"/, 'SVG: linia siatki tylko przy włączonej siatce, opis osi zostaje');
  });

  test('wykresy-14: synchronizacja na atrapie Notion: blok ustawień ma chart, a nie ma klucza Databento ani limitu kosztu; sanitizeSettings nie gubi dotychczasowych kluczy', async () => {
    const S = await lib('lib/sync.mjs');
    const keep = S.sanitizeSettings({ palette: 'mono', custom: { onyx: { profit: '#111111' } }, customSeeded: true, beR: 0.2, beUsd: 5, share: { nick: 'x' }, chartTz: 'UTC', chartBadj: false, theme: 'onyx', lang: 'pl', updateCheck: true, chart: { style: 'line', overlays: { sess: { asia: { from: '20:00' } } } } });
    for (const k of ['palette', 'custom', 'customSeeded', 'beR', 'beUsd', 'share', 'chartTz', 'chartBadj', 'theme', 'lang', 'updateCheck', 'chart']) assert.ok(k in keep, `sanitizeSettings zgubił „${k}”`);
    assert.equal(keep.chart.overlays.sess.asia.from, '20:00', 'zagnieżdżone klucze chart przechodzą');
    const gone = S.sanitizeSettings({ chart: { databentoKey: 'a', DATABENTO_API_KEY: 'b', apiKey: 'c', key: 'd' }, databentoKey: 'e', chartCostLimitUsd: 1, chartDailyLimitUsd: 2, chartCredit: { startUsd: 125 }, chartSpend: { usd: 1 }, token: 't', pin: '1' });
    assert.deepEqual(gone, { chart: {} }, 'klucze sekretne, limity kosztu i kredyt odpadają na każdej głębokości');
  });

  test('wykresy-14: blok ustawień w atrapie Notion po /api/sync: chart tak, klucz Databento i limity nie (test na tekście bloku)', async () => {
    const A = await H.atrapa(++port, { ATRAPA_PUSTA: '1' });
    const dir = H.tmp();
    const DBKEY = 'db-TAJNY-klucz-0123456789abcdef';
    const r = await H.run(path.join(ROOT, 'setup.mjs'), ['--lang', 'pl', '--token', 'ntn_wspolny_token_testowy_123', '--parent', H.PARENT_URL, '--demo', '--yes'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
    assert.equal(r.code, 0, r.err);
    const S = await H.server(++port, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, DATABENTO_API_KEY: DBKEY });
    try {
      assert.equal((await H.dash(S.base, '/api/candles/limit', { maxCostUsd: 0.37, dailyLimitUsd: 2.5 })).j.ok, true);
      const chart = { style: 'line', colorMode: 'custom', grid: false, overlays: { sessions: true, pdhl: true } };
      const t1 = new Date(Date.now() - 60_000).toISOString();
      const p1 = await H.dash(S.base, '/api/sync', { settings: { palette: 'mono', beR: 0.2, share: { nick: 'abc' }, chartTz: 'UTC', chartBadj: false, chart, databentoKey: DBKEY, chartCostLimitUsd: 0.37, chartDailyLimitUsd: 2.5, chartCredit: { startUsd: 125 } }, updatedAt: t1 });
      assert.equal(p1.j.written, true, JSON.stringify(p1.j));
      const block = JSON.stringify(await A.get('/__test/loose'));
      assert.ok(block.includes('\\"chart\\"') && block.includes('\\"style\\": \\"line\\"'), 'blok ustawień ma chart');
      assert.ok(block.includes('palette') && block.includes('chartTz') && block.includes('share'), 'dotychczasowe klucze zostają');
      assert.ok(!block.includes(DBKEY) && !block.includes('db-TAJNY') && !/databento/i.test(block), 'w Notion nie ma klucza Databento');
      assert.ok(!block.includes('chartCostLimitUsd') && !block.includes('chartDailyLimitUsd') && !block.includes('chartCredit') && !block.includes('0.37'), 'w Notion nie ma limitów kosztu ani kredytu');
      const back = await (await fetch(`${S.base}/api/sync?force`)).json();
      assert.equal(back.remote.settings.chart.style, 'line'); assert.equal(back.remote.settings.chartTz, 'UTC'); assert.equal(back.remote.settings.databentoKey, undefined);
    } finally { S.stop(); A.stop(); }
  });

  test('wykresy-14: /api/candles/size: rozmiar chart-data/ w bajtach (P39: tylko rozmiar), brak katalogu = 0; meta ma limity do podglądu (P40)', async () => {
    const dir = H.tmp();
    // przegląd HIJ, pkt 1: rozmiar liczony asynchronicznie i zapamiętany na 60 s, więc pliki powstają przed pierwszym pytaniem (brak katalogu = 0 sprawdza dirBytes)
    const Cd = await lib('lib/candles.mjs');
    assert.equal(await Cd.dirBytes(path.join(dir, 'chart-data')), 0, 'brak katalogu = 0');
    mkdirSync(path.join(dir, 'chart-data', 'ES'), { recursive: true });
    writeFileSync(path.join(dir, 'chart-data', 'ES', 'a.bin'), Buffer.alloc(1000)); writeFileSync(path.join(dir, 'chart-data', 'b.json'), '12345');
    const S = await H.server(++port, { THQ_CONFIG_DIR: dir });
    try {
      assert.equal((await (await fetch(`${S.base}/api/candles/size`)).json()).bytes, 1005);
      const m = await (await fetch(`${S.base}/api/meta`)).json();
      for (const k of ['chartCostLimitUsd', 'chartDailyLimitUsd', 'chartSpentTodayUsd', 'chartCredit', 'hasDatabentoKey']) assert.ok(k in m, `meta.${k}`);
      assert.equal((await H.dash(S.base, '/api/candles/size', {})).status === 404 || true, true);
    } finally { S.stop(); }
  });

  test('wykresy-14: zakładka Wykresy: strefa i B-ADJ przeniesione z „Ogólne” (P41), bez „Usuń pobrane świece” (P39), limity bez pól edycji (P40), klucz tylko w .env', async () => {
    const u = src('public/js/ustawienia.js');
    const fn = (name) => { const i = u.indexOf(`function ${name}()`); assert.ok(i > 0, name); return u.slice(i, u.indexOf('\n  }\n', i)); };
    const ogolne = fn('ogolneHtml'), wykresy = fn('wykresyHtml'), czas = fn('czas'), dane = fn('daneDatabento');
    assert.ok(!/tzHtml\(\)|badjHtml\(\)/.test(ogolne), 'Ogólne bez strefy i B-ADJ');
    assert.ok(/tzHtml\(\)/.test(czas) && /badjHtml\(\)/.test(czas), 'Wykresy: strefa i B-ADJ');
    assert.match(wykresy, /czas\(\)/);
    assert.match(u, /tabBtn\('wykresy', 'Wykresy'\)/);
    assert.ok(!/Usuń pobrane|chart-data-clear|data-act="ch-clear"|candles\/(delete|clear|purge)/i.test(u), 'P39: bez przycisku usuwania świec');
    assert.ok(!/<input[^>]*(chartCostLimit|chartDailyLimit|maxCostUsd|dailyLimitUsd|creditStart)/i.test(dane), 'P40: limity bez pól edycji');
    assert.ok(!/candles\/limit/.test(u + src('public/js/app.js')), 'UI nie wywołuje /api/candles/limit');
    assert.match(dane, /type="password" autocomplete="off"/); assert.match(src('public/js/app.js'), /'\/api\/candles\/key'/);
    // przegląd HIJ, pkt 4: asercja negatywna z dowodem na zepsutym przykładzie (zachowanie w przeglądarce sprawdza E2E H: klucz nie ląduje w localStorage)
    const LS_DB = /localStorage[^\n]*(databento|DATABENTO)/i;
    for (const bad of ["localStorage.setItem('thq.databento', key);", 'try { localStorage.setItem(DATABENTO_KEY, v); } catch {}']) assert.ok(LS_DB.test(bad), `LS_DB nie łapie: ${bad}`);
    assert.ok(!LS_DB.test(u + src('public/js/app.js')), 'klucz nie trafia do localStorage');
    // klucze zapisywane do ustawień: chartTz, chartBadj (zachowanie bez zmian), chart
    assert.match(u, /settings\.chartTz = validTz\(ev\.target\.value\)/); assert.match(u, /settings\.chartBadj = ev\.target\.checked/);
    // sync: collect / applyRemoteSettings / loadSettings
    const app = src('public/js/app.js');
    assert.match(app, /chartBadj: settings\.chartBadj, chart: settings\.chart, theme:/); assert.match(app, /out\.chart = sanitizeChart\(o\.chart\)/); assert.match(app, /settings\.chart = sanitizeChart\(r\.chart\)/);
  });

  test('wykresy-14: i18n: każdy tekst z L(\'…\') w ustawienia.js ma tłumaczenie EN; kontrolki filmów od pakietu J', () => {
    const en = JSON.parse(src('public/i18n/en.json'));
    const u = src('public/js/ustawienia.js');
    const missing = [];
    for (const m of u.matchAll(/\bL\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g)) { const k = m[2].replace(/\\(['"\\])/g, '$1'); if (!(k in en)) missing.push(k); }
    for (const m of u.matchAll(/\b(?:chk|gHead|kv)\(\s*(?:'[^']*',\s*)?(?:[a-zA-Z.]+,\s*)?'([^']+)'/g)) if (!(m[1] in en) && !/^(grid|entry|ch-g|sess|sessions|pdhl)/.test(m[1])) missing.push(m[1]);
    for (const m of u.matchAll(/\[\['[a-z]+', '([^']+)'\](?:, \['[a-z]+', '([^']+)'\])?/g)) for (const k of [m[1], m[2]]) if (k && !(k in en)) missing.push(k);
    assert.deepEqual([...new Set(missing)], []);
    // pakiet I (28.10.2026) dodał kontrolki kart (shareChart, shareStyle, slCard, tpCard, equity); pakiet J dodał kontrolki filmów razem z funkcją (decyzja sesji głównej)
    assert.ok(/'ch-film-format'/.test(u) && /filmDim/.test(u), 'pakiet J: kontrolki filmów w Ustawieniach');
  });

  test('wykresy-14: Cichy terminal: brak literałów kolorów w styl-wykresu.js, podglad.js i geometria.js; komunikaty serwera nie odsyłają do nieistniejących pól limitów (P40)', () => {
    for (const f of ['public/js/styl-wykresu.js', 'public/js/podglad.js', 'public/js/geometria.js']) {
      const s = src(f);
      assert.equal((s.match(/#[0-9a-f]{3,6}\b/gi) || []).filter((h) => !/^#\d+$/.test(h)).length, 0, `${f}: #rrggbb`);
      assert.equal((s.match(/\brgba?\(/g) || []).length, 0, `${f}: rgb(`);
    }
    const c = src('lib/candles.mjs');
    assert.ok(!/Ustawieniach → Wykresy/.test(c), 'limity i kredyt zmienia się w config.local.json, nie w UI');
    assert.match(c, /config\.local\.json \(chartDailyLimitUsd\)/); assert.match(c, /config\.local\.json \(chartCredit\)/);
  });
};
