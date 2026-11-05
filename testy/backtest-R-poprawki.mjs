// backtest-R: poprawki po przeglądzie kodu (04.11.2026): pamięć odliczania przy wejściu w przerwę na 1D/2D/1W/1M, „Brak notowań” z danych, odliczanie z faktycznego odstępu świec
// (interwał sekundowy poza oknem 1s), siatka przyszłości na 1s i 5s (news o 14:30 ET następnego dnia), data w napisie dnia po angielsku. Czysta logika, bez przeglądarki.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const utc = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000;

  // Uwaga: 1D, 2D, 1W i 1M nie są interwałami replayu (isReplayTf przyjmuje s, m, h do doby), więc ten test sprawdza logikę candleClock/createClockCache, nie ścieżkę użytkownika replayu;
  // scenariusz użytkownika (interwały do godzinowych, licznik, secOut, „Brak notowań”) jest w backtest-S.
  test('backtest-R: pamięć odliczania: po wejściu krokami w przerwę 17:00 ET stan „zamknięty” na 1m, 1h, 1D, 2D, 1W i 1M (nie wolno trzymać przedziału całej świecy)', async () => {
    const C = await lib('public/js/bt-czas.js');
    // środa 18.11.2026 (EST): zamknięcie sesji o 22:00Z, otwarcie o 23:00Z; kroki co minutę od 21:55Z do 23:05Z, wszystko przez jedną pamięć jak w replayu
    for (const tf of ['1m', '1h', '1D', '2D', '1W', '1M']) {
      const cache = C.createClockCache();
      const seen = [];
      for (let u = utc(2026, 11, 18, 21, 55); u <= utc(2026, 11, 18, 23, 5); u += 60) seen.push([u, cache(u, tf, u - 60).kind]);
      const want = (u) => (u >= utc(2026, 11, 18, 22) && u < utc(2026, 11, 18, 23) ? 'closed' : 'open');
      assert.deepEqual(seen.filter(([u, k]) => k !== want(u)).map(([u, k]) => `${tf} ${new Date(u * 1000).toISOString().slice(11, 16)} ${k}`), [], `${tf}: stan zgodny ze świeżym liczeniem w każdej minucie`);
      assert.equal(cache(utc(2026, 11, 18, 22, 30), tf, 0).kind, 'closed');
      assert.equal(cache(utc(2026, 11, 18, 22, 30), tf, 0).remaining, null, 'w przerwie żadnego odliczania');
    }
    // przedział ważności: dla D/W/M tylko do zamknięcia sesji
    assert.equal(C.candleClock(utc(2026, 11, 18, 15), '1W').until, utc(2026, 11, 18, 22));
    assert.equal(C.candleClock(utc(2026, 11, 18, 15), '1W').end, utc(2026, 11, 20, 22));
  });

  test('backtest-R: odliczanie z faktycznego odstępu: interwał sekundowy poza oknem 1s liczy ze świec minutowych', async () => {
    const C = await lib('public/js/bt-czas.js');
    const at = utc(2026, 11, 18, 15, 0, 20);
    assert.equal(C.candleClock(at, '5s').remaining, 5 - 0, '5s w oknie 1s: do końca 5-sekundowej świecy');
    assert.equal(C.candleClock(at, '5s', 60).remaining, 40, '5s poza oknem 1s: świeca minutowa, 40 s do końca');
    assert.equal(C.candleClock(at, '1s', 60).remaining, 40);
    const cache = C.createClockCache();
    assert.equal(cache(at, '5s', utc(2026, 11, 18, 14, 59), 60).remaining, 40, 'pamięć uwzględnia secEff');
    assert.equal(cache(at, '5s', at - 5, null).remaining, 5, 'zmiana secEff przelicza od nowa');
    assert.equal(C.candleClock(at, '1m', 60).remaining, 40, 'interwał minutowy bez zmian');
  });

  test('backtest-R: „Brak notowań”: tylko z danych do kursora (brak świecy bieżącego i poprzedniego przedziału), bez kalendarza świąt, normalny początek sesji i weekend bez fałszywego alarmu', async () => {
    const C = await lib('public/js/bt-czas.js');
    const cache = () => C.createClockCache();
    // normalnie: na początku przedziału ostatnia świeca to jeszcze poprzednia, w trakcie bieżąca
    assert.equal(cache()(utc(2026, 11, 18, 15, 1), '1m', utc(2026, 11, 18, 15, 0)).kind, 'open');
    assert.equal(cache()(utc(2026, 11, 18, 15, 1, 30), '1m', utc(2026, 11, 18, 15, 1)).kind, 'open');
    // początek sesji po weekendzie: ostatnia świeca z piątku 16:59 ET nie jest brakiem notowań
    assert.equal(cache()(utc(2026, 11, 22, 23, 0), '1m', utc(2026, 11, 20, 21, 59)).kind, 'open', 'niedziela 18:00 ET, ostatnia świeca piątkowa');
    assert.equal(cache()(utc(2026, 11, 19, 23, 0), '1m', utc(2026, 11, 19, 21, 59)).kind, 'open', 'po codziennej przerwie');
    // skrócona sesja 27.11 (zamknięcie 13:15 ET = 18:15Z): po zamknięciu danych nie ma, kursor stoi w „sesji”: brak notowań zamiast odliczania
    const half = cache()(utc(2026, 11, 27, 19, 30), '1m', utc(2026, 11, 27, 18, 14));
    assert.equal(half.kind, 'nodata');
    assert.equal(half.remaining, null, 'brak ujemnego i zmyślonego czasu');
    // święto bez sesji danych (25.12): cały dzień brak świec
    assert.equal(cache()(utc(2026, 12, 25, 15), '1m', utc(2026, 12, 24, 18, 14)).kind, 'nodata');
    // godzinowy: brak świecy bieżącej i poprzedniej godziny (po jednej brakującej godzinie jeszcze odliczanie, bo poprzednia świeca istnieje)
    assert.equal(cache()(utc(2026, 11, 27, 19, 30), '1h', utc(2026, 11, 27, 17, 0)).kind, 'nodata');
    assert.equal(cache()(utc(2026, 11, 27, 19, 30), '1h', utc(2026, 11, 27, 18, 0)).kind, 'open');
    // D, W, M: brak wykrywania (zmienna długość poprzedniej świecy), odliczanie zostaje
    assert.equal(cache()(utc(2026, 11, 27, 19, 30), '1D', utc(2026, 11, 20, 23, 0)).kind, 'open');
    // bez danych (lastBarT null): odliczanie jak dotąd
    assert.equal(cache()(utc(2026, 11, 18, 15, 1), '1m', null).kind, 'open');
    // przerwa dzienna i weekend nadal „zamknięty”
    assert.equal(cache()(utc(2026, 11, 18, 22, 30), '1m', utc(2026, 11, 18, 21, 59)).kind, 'closed');
    assert.equal(cache()(utc(2026, 11, 21, 12), '1m', utc(2026, 11, 20, 21, 59)).kind, 'closed');
  });

  test('backtest-R: siatka przyszłości na 1s i 5s sięga końca okna newsów: news o 14:30 ET następnego dnia ma pozycję i da się go osiągnąć', async () => {
    const C = await lib('public/js/bt-czas.js');
    const N = await lib('public/js/newsy.js');
    const last = utc(2026, 11, 18, 15, 0), end = C.newsWindowEnd(last);
    const news = utc(2026, 11, 19, 19, 30); // czwartek 14:30 ET (EST)
    assert.ok(news < end, 'news w oknie');
    for (const [tf, sec] of [['1s', 1], ['5s', 5], ['15s', 15], ['1m', 60]]) {
      const fut = C.futureBuckets(last, tf, sec, end);
      assert.ok(fut.length < C.FUTURE_CAP, `${tf}: okno mieści się w limicie (${fut.length})`);
      assert.ok(fut[fut.length - 1] >= end - sec, `${tf}: siatka sięga końca okna (${(fut[fut.length - 1] - last) / 3600} h)`);
      const base = []; for (let t = last - 600; t <= last; t += sec) base.push([t, 1, 2, 0, 1, 1]);
      const x = N.timeToX(base, sec, { x: (i) => i * sec }, fut)(news);
      assert.ok(Number.isFinite(x), `${tf}: news o 14:30 ET następnego dnia ma pozycję`);
      // pozycja zgodna z punktem siatki: indeks = liczba świec + liczba punktów siatki przed newsem
      const before = fut.filter((t) => t <= news).length;
      assert.ok(Math.abs(x / sec + 0.5 - (base.length - 1 + before)) <= 1, `${tf}: pozycja zgodna z siatką (${x / sec + 0.5} vs ${base.length - 1 + before})`);
    }
    // zajęte punkty (future.from) nie wpływają na pozycje: po dojściu kursora o 100 świec wynik ten sam
    const fut = C.futureBuckets(last, '1s', 1, end);
    const base = []; for (let t = last - 600; t <= last; t++) base.push([t, 1, 2, 0, 1, 1]);
    const x0 = N.timeToX(base, 1, { x: (i) => i }, fut)(news);
    const moved = [...base, ...fut.slice(0, 100).map((t) => [t, 1, 2, 0, 1, 1])];
    const view = fut; view.from = 100;
    assert.ok(Math.abs(N.timeToX(moved, 1, { x: (i) => i }, view)(news) - x0) < 1e-6, 'pozycja po dojściu o 100 świec bez skoku (tablica z polem from)');
  });

  test('backtest-R: data w napisie dnia: skrót dnia tygodnia w polskim bez kropki, w angielskim bez ucinania liter (Fri, nie Fr)', async () => {
    const N = await lib('public/js/newsy.js');
    assert.equal(N.dayShort('2026-11-20', 'pl'), 'pt 20.11');
    assert.equal(N.dayShort('2026-11-20', 'en'), 'Fri 20.11');
    assert.equal(N.dayShort('2026-11-18', 'en-US'), 'Wed 18.11');
    assert.equal(N.dayShort('2026-11-17', 'en-GB'), 'Tue 17.11');
    assert.equal(N.dayShort('zle', 'en'), '');
  });
};
