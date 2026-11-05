// backtest-Q: newsy w przyszłości replayu rysowane w pustym miejscu za ostatnią świecą (04.11.2026).
// [U] 04.11.2026 «maja sie rysowac w przyszlosci tamgdzie nie ma swieczek»
// Czysta logika: siatka przyszłych świec z sesji CME (bt-czas.js futureBuckets, newsWindowEnd) i pozycje na osi (newsy.js timeToX, bandX). Kluczowa własność: pozycja zdarzenia
// liczona przed dojściem kursora (z siatki) jest TA SAMA co po dojściu (te czasy stają się świecami), także przy przerwie 17:00-18:00 ET, weekendzie i zmianie czasu.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const utc = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
  const sc = { x: (i) => 100 + i * 10 };

  test('backtest-Q: siatka 1m: pomija przerwę 17:00-18:00 ET, kończy się na zamknięciu następnego dnia handlowego, zero świec poza sesją', async () => {
    const C = await lib('public/js/bt-czas.js');
    const last = utc(2026, 11, 18, 15, 0); // środa 10:00 ET (EST)
    const end = C.newsWindowEnd(last);
    assert.equal(end, utc(2026, 11, 19, 22), 'koniec okna: czwartek 17:00 ET');
    const f = C.futureBuckets(last, '1m', 60, end);
    assert.equal(f[0], last + 60);
    assert.ok(f.every((t, i) => i === 0 || t > f[i - 1]), 'rosnąco');
    assert.ok(!f.some((t) => t >= utc(2026, 11, 18, 22) && t < utc(2026, 11, 18, 23)), 'przerwa 17:00-18:00 ET bez świec');
    assert.ok(f.includes(utc(2026, 11, 18, 21, 59)) && f.includes(utc(2026, 11, 18, 23, 0)), 'ostatnia świeca sesji i pierwsza następnej');
    assert.equal(f[f.length - 1], utc(2026, 11, 19, 21, 59), 'ostatnia świeca następnego dnia handlowego');
    assert.equal(f.length, (utc(2026, 11, 18, 22) - last) / 60 - 1 + 23 * 60, '7 h − 1 min do zamknięcia + cała sesja czwartku (23 h)');
  });

  test('backtest-Q: piątek: następny dzień handlowy to poniedziałek, weekend bez świec', async () => {
    const C = await lib('public/js/bt-czas.js');
    const last = utc(2026, 11, 20, 21, 30), end = C.newsWindowEnd(last);
    assert.equal(end, utc(2026, 11, 23, 22), 'koniec: poniedziałek 17:00 ET');
    const f = C.futureBuckets(last, '1m', 60, end);
    assert.deepEqual(f.slice(0, 3), [utc(2026, 11, 20, 21, 31), utc(2026, 11, 20, 21, 32), utc(2026, 11, 20, 21, 33)]);
    const i = f.indexOf(utc(2026, 11, 20, 21, 59));
    assert.equal(f[i + 1], utc(2026, 11, 22, 23, 0), 'po piątkowym zamknięciu od razu niedziela 18:00 ET');
    assert.equal(f[f.length - 1], utc(2026, 11, 23, 21, 59));
  });

  test('backtest-Q: zmiana czasu USA: otwarcie niedzielne o 22:00Z po zmianie wiosennej i o 23:00Z po jesiennej', async () => {
    const C = await lib('public/js/bt-czas.js');
    const mar = C.futureBuckets(utc(2026, 3, 6, 21, 30), '1m', 60, C.newsWindowEnd(utc(2026, 3, 6, 21, 30)));
    assert.equal(mar[mar.indexOf(utc(2026, 3, 6, 21, 59)) + 1], utc(2026, 3, 8, 22, 0), 'marzec: 18:00 EDT = 22:00Z (piątek zamykał się o 22:00Z, EST)');
    const nov = C.futureBuckets(utc(2026, 10, 30, 20, 30), '1m', 60, C.newsWindowEnd(utc(2026, 10, 30, 20, 30)));
    assert.equal(nov[nov.indexOf(utc(2026, 10, 30, 20, 59)) + 1], utc(2026, 11, 1, 23, 0), 'listopad: 18:00 EST = 23:00Z (piątek zamykał się o 21:00Z, EDT)');
  });

  test('backtest-Q: inne interwały: 5m i 1h od otwarcia sesji, 4h ucięta zamknięciem, 1D/1W/1M jako początki sesji kolejnych kluczy, cap', async () => {
    const C = await lib('public/js/bt-czas.js');
    const last = utc(2026, 11, 18, 15, 0), end = C.newsWindowEnd(last);
    const f5 = C.futureBuckets(last, '5m', 300, end);
    assert.equal(f5[0], last + 300);
    assert.ok(f5.includes(utc(2026, 11, 18, 21, 55)) && f5.includes(utc(2026, 11, 18, 23, 0)) && !f5.includes(utc(2026, 11, 18, 22, 0)));
    const f1h = C.futureBuckets(last, '1h', 3600, end);
    assert.deepEqual(f1h.slice(0, 7), [16, 17, 18, 19, 20, 21, 23].map((h, i) => (i < 6 ? utc(2026, 11, 18, h) : utc(2026, 11, 18, 23))), '1h: 16..21Z, potem 23:00Z po przerwie');
    const f4 = C.futureBuckets(utc(2026, 11, 18, 15), '4h', 14400, end);
    assert.deepEqual(f4.slice(0, 3), [utc(2026, 11, 18, 19), utc(2026, 11, 18, 23), utc(2026, 11, 19, 3)], '4h od otwarcia sesji (23:00Z), ostatnia ucięta');
    // 1D: kolejne sesje; z środy 10:00 ET zostaje czwartek (jedna sesja przed końcem okna)
    assert.deepEqual(C.futureBuckets(last, '1D', 86400, end), [utc(2026, 11, 18, 23)]);
    assert.deepEqual(C.futureBuckets(utc(2026, 11, 20, 15), '1W', 604800, C.newsWindowEnd(utc(2026, 11, 20, 15))), [utc(2026, 11, 22, 23)], '1W: piątek → nowy tydzień od niedzieli 18:00 ET');
    assert.equal(C.futureBuckets(last, '1s', 1, end, 50).length, 50, 'cap punktów dla interwałów sekundowych');
    assert.deepEqual(C.futureBuckets(last, 'zly', 60, end), []);
  });

  test('backtest-Q: pozycja zdarzenia z siatki = pozycja po dojściu kursora (przerwa, weekend, zmiana czasu; linie, znaczniki i paski)', async () => {
    const C = await lib('public/js/bt-czas.js');
    const N = await lib('public/js/newsy.js');
    const cases = [
      [utc(2026, 11, 18, 15, 0), [utc(2026, 11, 18, 16, 30), utc(2026, 11, 18, 21, 59), utc(2026, 11, 18, 22, 30), utc(2026, 11, 18, 23, 0), utc(2026, 11, 19, 14, 30)]],
      [utc(2026, 11, 20, 21, 30), [utc(2026, 11, 20, 21, 45), utc(2026, 11, 21, 12, 0), utc(2026, 11, 22, 23, 0), utc(2026, 11, 23, 13, 30)]],
      [utc(2026, 3, 6, 21, 30), [utc(2026, 3, 7, 12, 0), utc(2026, 3, 8, 22, 0), utc(2026, 3, 9, 12, 30)]],
      [utc(2026, 10, 30, 20, 30), [utc(2026, 11, 1, 23, 0), utc(2026, 11, 2, 13, 30)]],
    ];
    for (const [last0, events] of cases) {
      const base = []; for (let t = last0 - 300 * 60; t <= last0; t += 60) base.push([t, 1, 2, 0, 1, 1]);
      const future = C.futureBuckets(last0, '1m', 60, C.newsWindowEnd(last0));
      const before = N.timeToX(base, 60, sc, future), bandB = N.bandX(base, 60, sc, future);
      for (const e of events) {
        const xb = before(e), fb = bandB.from(e), tb = bandB.to(e + 3600);
        assert.ok(Number.isFinite(xb) && Number.isFinite(fb) && Number.isFinite(tb), `zdarzenie ${e} ma pozycję przed dojściem kursora`);
        // kursor dochodzi do świecy zawierającej zdarzenie (albo do ostatniej przed przerwą, gdy zdarzenie jest w przerwie) i idzie jeszcze o trzy świece dalej
        let j = future.findIndex((t) => t > e) - 1; if (j < 0) j = 0;
        for (const reach of [j, j + 1, j + 3]) {
          if (reach >= future.length) continue;
          const real = [...base, ...future.slice(0, reach + 1).map((t) => [t, 1, 2, 0, 1, 1])];
          const nf = future.slice(reach + 1);
          const after = N.timeToX(real, 60, sc, nf), bandA = N.bandX(real, 60, sc, nf);
          assert.ok(Math.abs(after(e) - xb) < 1e-6, `znacznik ${e}: ${xb} przed, ${after(e)} po dojściu do ${future[reach]}`);
          assert.ok(Math.abs(bandA.from(e) - fb) < 1e-6, `początek paska ${e}: ${fb} przed, ${bandA.from(e)} po`);
        }
      }
    }
  });

  test('backtest-Q: poza siatką zdarzenie nie jest rysowane, a bez siatki zachowanie jak dotąd; geometria newsów pokazuje linię i napis w przyszłości', async () => {
    const C = await lib('public/js/bt-czas.js');
    const N = await lib('public/js/newsy.js');
    const last = utc(2026, 11, 18, 15, 0), base = []; for (let t = last - 600; t <= last; t += 60) base.push([t, 1, 2, 0, 1, 1]);
    const future = C.futureBuckets(last, '1m', 60, C.newsWindowEnd(last));
    assert.equal(N.timeToX(base, 60, sc, future)(utc(2026, 11, 20, 12)), null, 'dwa dni do przodu: poza oknem');
    assert.equal(N.timeToX(base, 60, sc)(utc(2026, 11, 18, 16)), N.timeToX(base, 60, sc, null)(utc(2026, 11, 18, 16)), 'bez siatki: ekstrapolacja co świecę jak dotąd');
    // news dzisiejszy później niż kursor (16:30Z) i OPEX dnia kursora: napis i pasek w polu, które sięga w przyszłość
    const news = [{ t: utc(2026, 11, 18, 18, 30), day: '2026-11-18', name: 'Zorblat', imp: 'high', kind: 'data', allDay: false, tentative: false },
      { t: utc(2026, 11, 18, 5), day: '2026-11-18', name: 'OPEX', imp: 'opex', kind: 'opex', allDay: true, tentative: false, variant: 'monthly' }];
    const m = N.buildNewsModel({ news: C.chartNews(news, last), prefs: { news: true, newsImp: { high: true, opex: true } } });
    const box = { left: 100, right: 100 + (base.length + 400) * 10, top: 0, bottom: 300 };
    const g = N.newsGeometry(m, N.timeToX(base, 60, sc, future), box, N.bandX(base, 60, sc, future));
    assert.equal(g.lines.length, 1, 'linia newsa z godziną późniejszą niż kursor');
    assert.ok(g.lines[0].x > sc.x(base.length - 1), 'linia za ostatnią świecą');
    assert.equal(g.bands.length, 1);
    assert.ok(g.bands[0].x + g.bands[0].w > sc.x(base.length - 1), 'pasek dnia sięga w przyszłość (do zamknięcia sesji)');
  });

  test('backtest-Q: wykres backtestu: seria bez wartości za ostatnią świecą, margines i podążanie bez zmian (czas krzyża w przyszłości: test zachowania w backtest-R)', async () => {
    const w = readFileSync(path.join(ROOT, 'public/js/bt-wykres.js'), 'utf8'), n = readFileSync(path.join(ROOT, 'public/js/wykres.js'), 'utf8');
    assert.ok(/LWC\.LineSeries/.test(w) && /ws\.setData\(fut\.map\(\(time, i\) => \(i === fut\.length - 1 \? \{ time, value: 0 \} : \{ time \}\)\)\)/.test(w), 'punkty bez wartości (same czasy), tylko ostatni z wartością zastępczą jako kotwica osi');
    assert.ok(/rightOffset: curOff - remaining\(\)/.test(w), 'margines liczony od końca siatki');
    assert.ok(/autoscaleInfoProvider: \(\) => null/.test(w), 'seria nie wpływa na auto-skalę');
    assert.ok(/getFuture: futureOf/.test(w) && /getFuture\(\)/.test(n), 'siatka trafia do geometrii newsów');
    for (const f of ['podglad.js', 'wykres.js']) assert.ok(!/futureBuckets/.test(readFileSync(path.join(ROOT, 'public/js', f), 'utf8')), `${f}: przyszłość tylko w backteście`);
  });
};
