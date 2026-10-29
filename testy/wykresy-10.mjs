// wykresy-10: nakładki wykresu (pakiet F): tło sesji (Azja, Londyn, Nowy Jork w czasie America/New_York) i PDH/PDL poprzedniej sesji CME.
// Funkcje czyste z public/js/swiece.js wspólne dla podglądu SVG i trybu edycji LWC; stan przełączników w podglad.js. Tylko dane syntetyczne.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const S = () => lib('public/js/swiece.js');
  const P = () => lib('public/js/podglad.js');
  const utc = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
  const win = (list, id) => list.filter((w) => w.id === id).map((w) => [w.from, w.to]);

  test('wykresy-10: okna sesji w czasie NY: zima i lato, Azja przez północ, tygodnie rozjazdu zmian czasu USA/Europa', async () => {
    const { sessionWindows } = await S();
    // zima (EST, UTC-5): Londyn 02-05 = 07-10 UTC, Nowy Jork 09:30-16 = 14:30-21 UTC, Azja 20:00-00:00 = 01:00-05:00 UTC następnego dnia
    const w = sessionWindows(utc(2026, 1, 15), utc(2026, 1, 17));
    assert.deepEqual(win(w, 'london').filter(([a]) => a >= utc(2026, 1, 15) && a < utc(2026, 1, 16)), [[utc(2026, 1, 15, 7), utc(2026, 1, 15, 10)]]);
    assert.deepEqual(win(w, 'ny').filter(([a]) => a >= utc(2026, 1, 15) && a < utc(2026, 1, 16)), [[utc(2026, 1, 15, 14, 30), utc(2026, 1, 15, 21)]]);
    assert.ok(win(w, 'asia').some(([a, b]) => a === utc(2026, 1, 16, 1) && b === utc(2026, 1, 16, 5)), 'Azja z 15.01 trwa 4 h i przechodzi przez północ NY');
    // lato (EDT, UTC-4)
    const s = sessionWindows(utc(2026, 7, 15), utc(2026, 7, 17));
    assert.deepEqual(win(s, 'london').filter(([a]) => a >= utc(2026, 7, 15) && a < utc(2026, 7, 16)), [[utc(2026, 7, 15, 6), utc(2026, 7, 15, 9)]]);
    assert.deepEqual(win(s, 'ny').filter(([a]) => a >= utc(2026, 7, 15) && a < utc(2026, 7, 16)), [[utc(2026, 7, 15, 13, 30), utc(2026, 7, 15, 20)]]);
    assert.ok(win(s, 'asia').some(([a, b]) => a === utc(2026, 7, 16, 0) && b === utc(2026, 7, 16, 4)), 'Azja latem: 00:00-04:00 UTC (przez północ UTC)');
    // USA zmienia czas 8.03.2026 (Europa dopiero 29.03): w tygodniu rozjazdu Nowy Jork jest już letni, więc sesja NY startuje o 13:30 UTC, nie 14:30
    const dst = sessionWindows(utc(2026, 3, 6), utc(2026, 3, 11));
    assert.ok(win(dst, 'ny').some(([a]) => a === utc(2026, 3, 6, 14, 30)), 'piątek 6.03 (EST)');
    assert.ok(win(dst, 'ny').some(([a]) => a === utc(2026, 3, 9, 13, 30)), 'poniedziałek 9.03 (EDT)');
    // dzień zmiany: 02:00 NY nie istnieje, Londyn startuje o 3:00 EDT (07:00 UTC) i kończy o 05:00 EDT (09:00 UTC)
    assert.ok(win(dst, 'london').some(([a, b]) => a === utc(2026, 3, 8, 7) && b === utc(2026, 3, 8, 9)), 'luka 2:00 w dniu zmiany czasu');
    // jesień: USA 1.11 (Europa już 25.10)
    const fall = sessionWindows(utc(2026, 10, 30), utc(2026, 11, 4));
    assert.ok(win(fall, 'ny').some(([a]) => a === utc(2026, 10, 30, 13, 30)), 'piątek 30.10 (EDT)');
    assert.ok(win(fall, 'ny').some(([a]) => a === utc(2026, 11, 2, 14, 30)), 'poniedziałek 2.11 (EST)');
    assert.ok(win(fall, 'asia').some(([a, b]) => a === utc(2026, 11, 1, 0) && b === utc(2026, 11, 1, 4)), 'Azja z 31.10: 20:00 EDT do 00:00 EDT');
    assert.ok(win(fall, 'asia').some(([a, b]) => a === utc(2026, 11, 2, 1) && b === utc(2026, 11, 2, 5)), 'Azja z 1.11 już w czasie zimowym');
    // okno tylko, gdy zachodzi na zakres; własne definicje (etap 14 poda godziny z Ustawień)
    assert.deepEqual(sessionWindows(utc(2026, 1, 15, 12), utc(2026, 1, 15, 13), [{ id: 'x', from: '08:00', to: '09:00' }]).length, 0);
    assert.equal(sessionWindows(utc(2026, 1, 15, 12), utc(2026, 1, 15, 13), [{ id: 'x', from: '07:00', to: '08:00' }]).length, 1, '12-13 UTC = 07-08 NY');
    assert.deepEqual(sessionWindows(5, 5), []);
  });

  test('wykresy-10: pasy sesji jako zakresy indeksów świec: Azja przez północ, okno bez świec pomijane, granice [od, do)', async () => {
    const { sessionWindows, sessionSpans } = await S();
    // 1m od 23:00 UTC 15.07 do 05:00 UTC 16.07 (Azja 00:00-04:00 UTC, potem luka do 06:00)
    const t0 = utc(2026, 7, 15, 23);
    const times = Array.from({ length: 6 * 60 }, (_, i) => t0 + i * 60);
    const sp = sessionSpans(times, sessionWindows(times[0], times[times.length - 1] + 60));
    const asia = sp.filter((x) => x.id === 'asia');
    assert.equal(asia.length, 1);
    assert.equal(times[asia[0].a], utc(2026, 7, 16, 0), 'pierwsza świeca pasa o północy UTC (20:00 NY)');
    assert.equal(times[asia[0].b], utc(2026, 7, 16, 3, 59), 'ostatnia świeca 03:59: koniec okna jest wyłączony');
    assert.ok(!sp.some((x) => x.id === 'london'), 'Londyn 06:00 UTC poza zakresem świec');
    // świece tylko poza oknem: brak pasa
    assert.deepEqual(sessionSpans([utc(2026, 7, 15, 10), utc(2026, 7, 15, 11)], sessionWindows(utc(2026, 7, 15, 10), utc(2026, 7, 15, 12))), []);
    assert.deepEqual(sessionSpans([], sessionWindows(utc(2026, 7, 15), utc(2026, 7, 16))), []);
  });

  test('wykresy-10: poprzednia sesja CME: poniedziałek po weekendzie, środek tygodnia, przerwa 16-17 CT i weekend', async () => {
    const { previousSession, sessionBounds } = await S();
    // 26.10.2026 (poniedziałek) 10:00 CDT = 15:00 UTC należy do sesji otwartej w niedzielę 25.10 o 17:00 CT (22:00 UTC);
    // poprzednia to sesja otwarta w czwartek 22.10 o 17:00 CT i zamknięta w piątek 23.10 o 16:00 CT (21:00 UTC); piątkowej sesji nie ma
    const mon = previousSession(utc(2026, 10, 26, 15));
    assert.equal(mon.open, utc(2026, 10, 22, 22)); assert.equal(mon.close, utc(2026, 10, 23, 21));
    // wtorek 27.10 10:00 CT: sesja otwarta w poniedziałek 17:00 CT; poprzednia = ta otwarta w niedzielę
    const tue = previousSession(utc(2026, 10, 27, 15));
    assert.equal(tue.open, utc(2026, 10, 25, 22)); assert.equal(tue.close, utc(2026, 10, 26, 21));
    // świeca 17:00 CT (22:00 UTC): nowa sesja, poprzednia właśnie zamknięta o 16:00 CT
    const t17 = utc(2026, 10, 27, 22);
    assert.equal(sessionBounds(t17).open, t17);
    assert.equal(previousSession(t17).close, utc(2026, 10, 27, 21));
    // w przerwie 16:30 CT (21:30 UTC) i w sobotę: ostatnia zamknięta
    assert.equal(previousSession(utc(2026, 10, 27, 21, 30)).close, utc(2026, 10, 27, 21));
    assert.equal(previousSession(utc(2026, 10, 24, 12)).close, utc(2026, 10, 23, 21), 'sobota: sesja zamknięta w piątek');
    assert.equal(previousSession(utc(2026, 10, 25, 12)).close, utc(2026, 10, 23, 21), 'niedziela przed otwarciem: to samo');
    // czas zimowy: 17:00 CST = 23:00 UTC
    const w = previousSession(utc(2026, 12, 8, 15));
    assert.equal(w.open, utc(2026, 12, 6, 23)); assert.equal(w.close, utc(2026, 12, 7, 22));
  });

  test('wykresy-10: PDH/PDL z syntetycznego 1D: wartości poprzedniej sesji dla każdej widocznej sesji, dziury pokrycia i brak sesji nie są zgadywane', async () => {
    const { pdhlSpans, sessionBounds } = await S();
    const open = (y, mo, d, h) => utc(y, mo, d, h); // otwarcia sesji w CDT: 17:00 CT = 22:00 UTC
    const day = (t, hi, lo) => [t, (hi + lo) / 2, hi, lo, (hi + lo) / 2, 1000];
    // sesje otwarte: czw 22.10 (21 ... 23.10), nd 25.10, pn 26.10, wt 27.10
    const daily = [day(open(2026, 10, 22, 22), 5100, 5000), day(open(2026, 10, 25, 22), 5120, 5040), day(open(2026, 10, 26, 22), 5150, 5060)];
    const at = (d, h, mi = 0) => utc(2026, 10, d, h, mi);
    // świece: poniedziałek 26.10 10:00-10:02 CT (sesja z niedzieli), wtorek 27.10 10:00-10:02 CT (sesja z poniedziałku), środa 28.10 (sesja z wtorku; brak 1D poprzedniej? jest)
    const times = [at(26, 15), at(26, 16), at(26, 17), at(27, 15), at(27, 16), at(28, 15)];
    const sp = pdhlSpans(times, daily);
    assert.deepEqual(sp.map((x) => [x.a, x.b, x.hi, x.lo]), [[0, 2, 5100, 5000], [3, 4, 5120, 5040], [5, 5, 5150, 5060]]);
    assert.equal(sessionBounds(times[0]).open, open(2026, 10, 25, 22));
    // brak świecy 1D poprzedniej sesji: bez linii (nie zgadujemy)
    assert.deepEqual(pdhlSpans(times, daily.slice(1)).map((x) => x.a), [3, 5]);
    // dziura w lokalnych świecach poprzedniej sesji (missing) wyłącza linie; pokryta agregatem 1s (derived) nie
    const gap = [[open(2026, 10, 25, 22) + 3600, open(2026, 10, 25, 22) + 7200]];
    assert.deepEqual(pdhlSpans(times, daily, { missing: gap }).map((x) => x.a), [0, 5], 'sesja z poniedziałku ma dziurę w poprzedniej (niedzielnej)');
    assert.deepEqual(pdhlSpans(times, daily, { missing: gap, derived: gap }).map((x) => x.a), [0, 3, 5]);
    // koniec dostępnych danych w środku poprzedniej sesji: jej maksimum nie jest jeszcze znane
    assert.deepEqual(pdhlSpans(times, daily, { availableEnd: utc(2026, 10, 27, 0) }).map((x) => x.a), [0, 3]);
    assert.deepEqual(pdhlSpans([], daily), []);
    // przerwa 16:00-17:00 CT bez świec: świece w niej (nieprawdopodobne) nie tworzą sesji
    assert.deepEqual(pdhlSpans([utc(2026, 10, 27, 21, 30)], daily), []);
  });

  test('wykresy-10: stan nakładek w jednym miejscu (localStorage w try/catch, domyślnie wyłączone obie), ochrona przed złymi danymi', async () => {
    const { loadOverlays, saveOverlays, OVERLAY_KEY } = await P();
    assert.equal(OVERLAY_KEY, 'thq.chart.overlays.v1');
    const two = (o) => ({ sessions: o.sessions, pdhl: o.pdhl }); // P32: loadOverlays zwraca też ustawienia sesji i linii (wykresy-17-p32)
    assert.deepEqual(two(loadOverlays()), { sessions: false, pdhl: false }, 'bez localStorage (Node): domyślnie wyłączone');
    saveOverlays({ sessions: true, pdhl: false });
    const mem = {};
    globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
    try {
      saveOverlays({ sessions: true, pdhl: true });
      assert.deepEqual(two(loadOverlays()), { sessions: true, pdhl: true });
      mem[OVERLAY_KEY] = '{"sessions":"tak","pdhl":1,"x":2}';
      assert.deepEqual(two(loadOverlays()), { sessions: false, pdhl: false }, 'tylko prawdziwe wartości logiczne');
      mem[OVERLAY_KEY] = 'to nie jest JSON';
      assert.deepEqual(two(loadOverlays()), { sessions: false, pdhl: false });
      globalThis.localStorage = { getItem: () => { throw new Error('zablokowany'); }, setItem: () => { throw new Error('zablokowany'); } };
      assert.deepEqual(two(loadOverlays()), { sessions: false, pdhl: false });
      saveOverlays({ sessions: true, pdhl: true }); // bez wyjątku
    } finally { delete globalThis.localStorage; }
  });

  test('wykresy-10: kolory nakładek tylko z tokenów (--n-blue, --n-orange, --n-purple, --fg-2), te same klasy w podglądzie i w edycji, przełączniki .check, teksty EN', async () => {
    const css = readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
    for (const [cls, tok] of [['asia', 'n-blue'], ['london', 'n-orange'], ['ny', 'n-purple']]) {
      assert.match(css, new RegExp(`\\.sess\\.${cls}\\b[^}]*var\\(--${tok}\\)`), `pas ${cls} w ${tok}`);
    }
    assert.match(css, /\.pdhl[^}]*var\(--fg-2\)/, 'PDH/PDL w --fg-2');
    const pod = readFileSync(path.join(ROOT, 'public/js/podglad.js'), 'utf8'), wyk = readFileSync(path.join(ROOT, 'public/js/wykres.js'), 'utf8');
    assert.doesNotMatch(pod + wyk, /#[0-9a-fA-F]{6}\b|rgba?\(\s*\d/, 'żadnych literałów kolorów w nakładkach');
    assert.match(pod, /overlayToggles/); assert.match(wyk, /overlayToggles/, 'przełączniki w obu trybach');
    assert.match(wyk, /createOverlays/, 'edycja bierze zakresy z tego samego modelu co podgląd (jedna implementacja)'); assert.ok(pod.includes('overlayLevels(candles, { windows, pd, sweep')); assert.ok(pod.includes('pdhlSpans(times, daily.bars')); assert.match(wyk, /overlayGeometry\(getModel\(\)/, 'P32: edycja liczy piksele tą samą funkcją co podgląd');
    const en = JSON.parse(readFileSync(path.join(ROOT, 'public/i18n/en.json'), 'utf8'));
    for (const k of ['Sesje', 'Nakładki wykresu', 'Ustawienia nakładek']) assert.ok(en[k], `tłumaczenie EN: ${k}`);
  });
};
