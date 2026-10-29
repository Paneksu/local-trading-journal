// wykresy-18 (pakiet J, etap 18): filmy z wykresem i wynikiem. W oknie Udostępnij segment „Obraz | Film”; film MP4 (WebM jako zapas) BEZ DŹWIĘKU
// (P21, słowa użytkownika «bez muzyki narazie»): animowana karta (ten sam renderCard co PNG, parametr at w sekundach) na tle motywu, zdjęcia albo filmu
// z dysku. Film tła zostaje w przeglądarce: zero fetch / XMLHttpRequest / localStorage. P20: MP4 z MediaRecorder bywa fragmentowany (raport pakietu J).
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
  // kod bez komentarzy (grep zakazanych wywołań nie może trafiać w opisy w komentarzach)
  const cut = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
  const code = (f) => cut(src(f));

  test('wykresy-18: oś czasu: stan elementów dla at = 0, 1, 2, 3,4 i ∞ (nagłówek, wykres, licznik, tabela, znaczniki, podpis)', async () => {
    const R = await lib('public/js/udostepnij-render.js');
    const a0 = R.filmAnim(0, { rows: 6 }), a1 = R.filmAnim(1, { rows: 6 }), a2 = R.filmAnim(2, { rows: 6 }), a34 = R.filmAnim(3.4, { rows: 6 }), aInf = R.filmAnim(Infinity, { rows: 6 });
    // podpis „JustJournal × nick” od początku
    for (const a of [a0, a1, a2, a34, aInf]) assert.equal(a.sig, 1, 'podpis od początku');
    // nagłówek wchodzi w 0,3 s: przy 0 jeszcze go nie ma, przy 1 s stoi
    assert.equal(a0.header, 0); assert.equal(a1.header, 1);
    // wykres i krzywa: 1,0-3,0 s od lewej
    assert.equal(a0.chart, 0); assert.equal(a1.chart, 0); assert.ok(a2.chart > 0 && a2.chart < 1, String(a2.chart)); assert.equal(a34.chart, 1);
    // licznik 0 → wartość w 1,0-3,0 s
    assert.equal(a1.counter, 0); assert.ok(a2.counter > 0.5 && a2.counter < 1, `easeOutCubic w połowie > 0,5: ${a2.counter}`); assert.equal(a34.counter, 1);
    // tabela 2,6-3,4 s wiersz po wierszu: przy 2 s żaden, przy 3,4 s wszystkie (6 wierszy co 80 ms)
    assert.deepEqual(a2.rows, [0, 0, 0, 0, 0, 0]);
    assert.ok(a34.rows.every((v) => v === 1), JSON.stringify(a34.rows));
    const a28 = R.filmAnim(2.8, { rows: 6 });
    assert.ok(a28.rows[0] > a28.rows[1] && a28.rows[1] >= a28.rows[5], `kolejno: ${a28.rows}`);
    // znaczniki 3,0-3,4 s
    assert.equal(a2.marks, 0); assert.equal(R.filmAnim(3.0, { rows: 6 }).marks, 0); assert.equal(a34.marks, 1);
    // ∞ = wszystko na miejscu (PNG); koniec animacji nie później niż ok. 3,4 s także przy długiej tabeli
    for (const k of ['header', 'chart', 'axes', 'counter', 'marks']) assert.equal(aInf[k], 1, k);
    assert.ok(aInf.rows.every((v) => v === 1));
    assert.ok(R.filmEnd(12) <= 3.45 + 1e-9, `koniec przy 12 wierszach: ${R.filmEnd(12)}`);
    assert.ok(R.filmAnim(R.filmEnd(12), { rows: 12 }).rows.every((v) => v === 1));
    assert.equal(R.filmAnim(Infinity, { rows: 12 }).settled, true); assert.equal(a2.settled, false);
    // przesunięcie wiersza 24 px na wejściu
    assert.equal(R.FILM_TL.rowShift, 24); assert.equal(R.FILM_TL.rowStep, 0.08);
  });

  test('wykresy-18: licznik wyniku monotoniczny i kończy dokładnie na wartości karty (fmtMetric)', async () => {
    const R = await lib('public/js/udostepnij-render.js');
    for (const [x, m] of [[2.4, 'R'], [-1, 'R'], [612.5, '$'], [-125, '$'], [1.23, '%'], [0, 'R']]) {
      let prev = null;
      for (let at = 0; at <= 5; at += 0.05) {
        const v = R.counterAt(x, at);
        if (prev != null) assert.ok(Math.abs(v) + 1e-12 >= Math.abs(prev), `monotoniczny ${x} przy ${at}`);
        assert.ok(v === 0 || Math.sign(v) === Math.sign(x), `znak ${x} przy ${at}`);
        prev = v;
      }
      assert.equal(R.counterAt(x, 3), x, 'koniec = wartość');
      assert.equal(R.counterAt(x, Infinity), x);
      assert.equal(R.counterAt(x, 0), 0);
      assert.equal(R.fmtMetric(R.counterAt(x, 3.4), m), R.fmtMetric(x, m));
    }
  });

  test('wykresy-18: typ nagrania: MP4 avc1.640028 → video/mp4 → WebM VP9/VP8 z notką; brak wsparcia = null; rozmiary 1080p/720p i bitrate', async () => {
    const F = await lib('public/js/film.js');
    const only = (list) => (t) => list.includes(t);
    assert.deepEqual(F.pickMime(() => true), { mime: 'video/mp4;codecs=avc1.640028', ext: 'mp4', mp4: true });
    assert.deepEqual(F.pickMime(only(['video/mp4', 'video/webm;codecs=vp9'])), { mime: 'video/mp4', ext: 'mp4', mp4: true });
    assert.deepEqual(F.pickMime(only(['video/webm;codecs=vp9', 'video/webm;codecs=vp8'])), { mime: 'video/webm;codecs=vp9', ext: 'webm', mp4: false });
    assert.deepEqual(F.pickMime(only(['video/webm;codecs=vp8'])), { mime: 'video/webm;codecs=vp8', ext: 'webm', mp4: false });
    assert.equal(F.pickMime(() => false), null);
    assert.equal(F.pickMime(null), null, 'brak MediaRecorder');
    assert.deepEqual(F.MIME_ORDER.slice(0, 2), ['video/mp4;codecs=avc1.640028', 'video/mp4']);
    assert.deepEqual(F.filmSize('9:16', '1080p'), { w: 1080, h: 1920, scale: 1 });
    assert.deepEqual(F.filmSize('9:16', '720p'), { w: 720, h: 1280, scale: 2 / 3 });
    assert.deepEqual(F.filmSize('16:9', '720p'), { w: 1280, h: 720, scale: 2 / 3 });
    assert.deepEqual(F.filmSize('16:9', '1080p'), { w: 1920, h: 1080, scale: 1 });
    assert.equal(F.bitrate('1080p'), 12_000_000); assert.equal(F.bitrate('720p'), 6_000_000);
    const R = await lib('public/js/udostepnij-render.js');
    assert.equal(R.fileName('trade', { date: '2026-10-20' }, '9:16', 'mp4'), 'justjournal-trade-2026-10-20-9x16.mp4');
    assert.equal(R.fileName('week', { from: '2026-10-19' }, '16:9', 'webm'), 'justjournal-tydzien-2026-10-19-16x9.webm');
    assert.equal(R.fileName('week', { from: '2026-10-19' }, '16:9'), 'justjournal-tydzien-2026-10-19-16x9.png', 'PNG bez zmian');
    // notka przy WebM (Instagram i TikTok wolą MP4) ma tłumaczenie
    const en = JSON.parse(src('public/i18n/en.json'));
    assert.ok('Instagram i TikTok wolą MP4: nagraj w Chrome albo Edge.' in en);
  });

  test('wykresy-18: pomiar czasu klatki (średnia, p95) i przejście na 30 kl./s, gdy p95 > 14 ms', async () => {
    const F = await lib('public/js/film.js');
    const s = F.frameStats([4, 5, 6, 5, 4, 5, 6, 5, 4, 30]);
    assert.ok(Math.abs(s.mean - 7.4) < 1e-9, String(s.mean)); assert.equal(s.p95, 30); assert.equal(s.n, 10);
    assert.equal(F.frameStats([]).n, 0);
    assert.equal(F.decideFps(Array(40).fill(8)), 60);
    assert.equal(F.decideFps([...Array(30).fill(8), ...Array(10).fill(20)]), 30, 'p95 > 14 ms');
    assert.equal(F.decideFps(Array(40).fill(14)), 60, 'próg: 14 ms jeszcze 60');
    assert.equal(F.FPS_LIMIT_MS, 14);
  });

  // Zakazane wywołania (P21: bez dźwięku; film tła nie wychodzi z przeglądarki). Listy używane w teście kodu i w teście na celowo zepsutych przykładach
  // (przegląd HIJ, pkt 4: asercja negatywna musi mieć dowód, że łapie błąd).
  const FORBID_FILM = [/AudioContext/, /createMediaElementSource/, /createMediaStreamDestination/, /\bfetch\s*\(/, /XMLHttpRequest/, /localStorage/, /sessionStorage/, /indexedDB/, /sendBeacon/, /WebSocket/];
  const FORBID_SHARE = /AudioContext|createMediaElementSource|XMLHttpRequest|sendBeacon/;

  test('wykresy-18: asercje negatywne łapią celowo zepsute przykłady (AudioContext, fetch, XHR, localStorage, sendBeacon, WebSocket)', () => {
    const broken = ['const a = new AudioContext();', 'a.createMediaElementSource(video);', 'a.createMediaStreamDestination();', "await fetch('/api/x', { body: blob });", 'const x = new XMLHttpRequest();',
      "localStorage.setItem('film', url);", "sessionStorage.setItem('film', url);", "indexedDB.open('film');", "navigator.sendBeacon('/x', blob);", "new WebSocket('ws://x');"];
    FORBID_FILM.forEach((re, i) => assert.ok(re.test(broken[i]), `${re} nie łapie: ${broken[i]}`));
    for (const s of ['new AudioContext()', 'ctx.createMediaElementSource(v)', 'new XMLHttpRequest()', "navigator.sendBeacon('/x', b)"]) assert.ok(FORBID_SHARE.test(s), s);
    // komentarze nie dają fałszywego alarmu (code() je wycina), kod tak
    assert.ok(!FORBID_FILM.some((re) => re.test(cut('// bez fetch( i localStorage\nconst ok = 1;'))));
    assert.ok(FORBID_FILM.some((re) => re.test(cut('// opis\nawait fetch(u);'))));
  });

  test('wykresy-18: bez dźwięku i bez wysyłania filmu tła: brak AudioContext, fetch, XMLHttpRequest, localStorage w film.js; okno nie zapisuje filmu', () => {
    const f = code('public/js/film.js');
    for (const re of FORBID_FILM) assert.ok(!re.test(f), `film.js: ${re}`);
    assert.match(f, /captureStream\(/); assert.match(f, /getAudioTracks\(\)/, 'strumień sprawdzany na tory audio');
    const u = code('public/js/udostepnij.js');
    assert.ok(!FORBID_SHARE.test(u), 'udostepnij.js: bez audio i XHR');
    assert.match(u, /accept="video\/\*"/);
    assert.match(u, /createObjectURL\(/);
    // Przegląd HIJ, pkt 4: dawna asercja na tekście (lsSet z „video”) była za wąska (nie łapała lsSet(BGV_KEY, url)). Zapis filmu tła do localStorage
    // sprawdza zachowanie: E2E J4 (testy/wykresy-e2e-j.mjs) porównuje klucze i rozmiary localStorage przed wyborem filmu i po nagraniu.
    assert.match(u, /releaseVideo\(video\)/, 'film tła zwalniany przy zmianie i zamknięciu okna');
    assert.match(f.slice(f.indexOf('export function releaseVideo')), /URL\.revokeObjectURL\(url\)/, 'releaseVideo zwalnia adres obiektu');
    assert.ok(!/let video\b/.test(u.slice(u.indexOf('export function createShare'), u.indexOf('async function open'))), 'film tła nie w zasięgu createShare (nie przeżywa zamknięcia okna)');
    // P21: zero opcji dźwięku w UI i ustawieniach
    assert.ok(!/filmAudio|Dźwięk z filmu/.test(src('public/js/udostepnij.js') + src('public/js/ustawienia.js') + src('public/js/styl-wykresu.js')));
    // notka o prawach pod wyborem pliku (karta etapu 18) i jej tłumaczenie
    const note = 'Film zostaje na tym urządzeniu. Używaj tylko nagrań, do których masz prawa (także muzyki).';
    assert.ok(src('public/js/udostepnij.js').includes(note));
    assert.ok(note in JSON.parse(src('public/i18n/en.json')));
  });

  test('wykresy-18: opcje filmów w settings.chart (9:16 / 1:1 / 16:9, 6 / 10 / 15 s, czarno-białe, przyciemnienie) i kontrolki w Ustawieniach → Wykresy; Licencje z notką o filmach tła', async () => {
    const C = await lib('public/js/styl-wykresu.js');
    assert.deepEqual(C.FILM_FORMATS, ['9:16', '1:1', '16:9'], 'v2 (P43): film 1:1');
    assert.deepEqual(C.FILM_SECONDS, [6, 10, 15]);
    assert.ok(C.FILM_DIMS.includes(0) && C.FILM_DIMS.includes(0.6) && C.FILM_DIMS.includes(0.8));
    const d = C.chartDefaults();
    assert.equal(d.filmFormat, '9:16'); assert.equal(d.filmSeconds, 10); assert.equal(d.filmBw, false); assert.equal(d.filmDim, 0.6);
    assert.equal(C.sanitizeChart({ filmFormat: '4:5', filmSeconds: 20, filmDim: 0.65 }).filmFormat, '9:16');
    assert.equal(C.sanitizeChart({ filmFormat: '1:1' }).filmFormat, '1:1');
    assert.equal(C.sanitizeChart({ filmSeconds: 20 }).filmSeconds, 10);
    assert.equal(C.sanitizeChart({ filmSeconds: 6, filmDim: 0.3 }).filmDim, 0.3);
    const s = src('public/js/ustawienia.js');
    assert.match(s, /'ch-film-format'/); assert.match(s, /'ch-film-seconds'/); assert.match(s, /chk\('filmBw'/); assert.match(s, /data-range="filmDim"/);
    assert.match(s, /data-v="cards"/, '„Przywróć domyślne” grupy kart obejmuje filmy');
    assert.deepEqual(C.CHART_GROUPS.cards.filter((k) => k.startsWith('film')), ['filmFormat', 'filmSeconds', 'filmBw', 'filmDim']);
    assert.ok(!/Dźwięk|audio/i.test(s.slice(s.indexOf('function karty'), s.indexOf('function czas'))), 'P21: bez opcji dźwięku');
    // Licencje: notka o prawach do filmów tła (pominięta w pakiecie H)
    const lic = s.slice(s.indexOf('function licencje'), s.indexOf('function wykresyHtml'));
    assert.match(lic, /Filmy tła/);
    const en = JSON.parse(src('public/i18n/en.json'));
    for (const k of ['Format filmu', 'Długość filmu', 'Czarno-białe', 'Przyciemnienie tła', 'Obraz', 'Film', 'Nagraj film', 'Anuluj', 'Jakość', '30 kl./s', 'Wybierz film', 'Zmień film', 'Pobierz MP4', 'Pobierz WebM']) assert.ok(k in en, `brak EN: ${k}`);
  });

  // ---------- przeglądarka headless (etap 6): piksele osi czasu i nagranie 2 s ----------
  async function page(part, extra = '') {
    const P = await import(pathToFileURL(path.join(ROOT, 'testy/przegladarka.mjs')).href);
    if (!P.findBrowser()) return null;
    const S = await H.server(4933, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: H.tmp() });
    try {
      return await P.cdpPage(`${S.base}/__testy/film-podglad.html?part=${part}${extra}`, { timeoutMs: 120_000, width: 1280, height: 900,
        extract: "JSON.stringify({ wynik: document.getElementById('wynik').textContent, b64: window.__b64 || null })" });
    } finally { S.stop(); }
  }

  test('wykresy-18: piksele w przeglądarce headless: at = ∞ to obecny PNG piksel w piksel (4 formaty × 2 motywy × rodzaje, motyw i zdjęcie); oś czasu w pikselach', async () => {
    const r = await page('px');
    if (!r) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    const { wynik } = JSON.parse(r);
    assert.match(wynik, /^PASS/, wynik.slice(0, 2500));
  });

  test('wykresy-18: nagranie 2 s 1080×1920 w przeglądarce headless: plik czytany przez <video> (rozmiar, długość ±0,1 s), 0 torów audio, film tła bez fetch / XHR / localStorage', async () => {
    const r = await page('rec', '&seconds=2');
    if (!r) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    const { wynik, b64 } = JSON.parse(r);
    assert.match(wynik, /^PASS/, wynik.slice(0, 2500));
    const j = JSON.parse(wynik.slice(5));
    console.log(`  nagranie: ${j.mime}, ${j.bytes} B, ${j.w}×${j.h}, ${j.duration.toFixed(3)} s, klatka śr. ${j.stats.mean.toFixed(2)} ms, p95 ${j.stats.p95.toFixed(2)} ms, ${j.fps} kl./s`);
    if (process.env.THQ_FILM_OUT && b64) writeFileSync(process.env.THQ_FILM_OUT, Buffer.from(b64, 'base64'));
  });
};
