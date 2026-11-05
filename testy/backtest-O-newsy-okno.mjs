// backtest-O: newsy na wykresie Backtestu tylko z dnia kursora i następnego dnia handlowego (04.11.2026).
// [U] 04.11.2026 «zrob jeszcze tak ze newsy na wykresie backtestingowym widac z dzisiaj i z nastepnego dnia ale z przeszlosci jak sie patrzy do tylu nie widac bo przeszkadza w analizie technicznej HTF»
// Dzień = dzień handlowy CME (18:00 ET dnia poprzedniego do 17:00 ET), kursor replayu zamiast daty systemowej. Czysta logika (bt-czas.js), bez sieci i przeglądarki.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const utc = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
  const hourly = (day, t, name) => ({ t, day, name, imp: 'high', kind: 'data', allDay: false, tentative: false });
  const allDay = (day, name, kind = 'opex') => ({ t: utc(+day.slice(0, 4), +day.slice(5, 7), +day.slice(8), 5), day, name, imp: kind === 'opex' ? 'opex' : 'holiday', kind, allDay: true, tentative: false });
  const names = (r) => r.map((e) => e.name);

  test('backtest-O: okno newsów: dzień kursora i następny dzień handlowy; wcześniejsze i dalsze znikają, zmiana dnia kursora przesuwa okno', async () => {
    const C = await lib('public/js/bt-czas.js');
    const ev = [allDay('2026-11-17', 'wt'), allDay('2026-11-18', 'sr'), allDay('2026-11-19', 'czw'), allDay('2026-11-20', 'pt'), allDay('2026-11-23', 'pn')];
    assert.deepEqual(names(C.chartNews(ev, utc(2026, 11, 18, 15))), ['sr', 'czw'], 'środa 10:00 ET: dziś i jutro; wtorek zniknął, piątek jeszcze nie');
    assert.deepEqual(names(C.chartNews(ev, utc(2026, 11, 19, 15))), ['czw', 'pt'], 'kursor na kolejnym dniu: środa znika');
  });

  test('backtest-O: granica dnia handlowego 18:00 ET (zima i lato): o 17:59 stary dzień, o 18:00 nowy', async () => {
    const C = await lib('public/js/bt-czas.js');
    const ev = [allDay('2026-11-18', 'sr'), allDay('2026-11-19', 'czw'), allDay('2026-11-20', 'pt')];
    assert.deepEqual(names(C.chartNews(ev, utc(2026, 11, 18, 22, 59))), ['sr', 'czw']);
    assert.deepEqual(names(C.chartNews(ev, utc(2026, 11, 18, 23, 0))), ['czw', 'pt'], '18:00 ET środy to już dzień handlowy czwartku');
    assert.deepEqual(names(C.chartNews(ev, utc(2026, 11, 18, 22, 30))), ['sr', 'czw'], 'przerwa 17:00-18:00 ET należy do starego dnia');
    const lato = [allDay('2026-09-17', 'a'), allDay('2026-09-18', 'b'), allDay('2026-09-21', 'c')];
    assert.deepEqual(names(C.chartNews(lato, utc(2026, 9, 17, 21, 59))), ['a', 'b']);
    assert.deepEqual(names(C.chartNews(lato, utc(2026, 9, 17, 22, 0))), ['b', 'c'], 'letni offset: granica o 22:00Z');
  });

  test('backtest-O: piątek i weekend: następny dzień handlowy to poniedziałek (Bank Holiday w poniedziałek widać w piątek i w niedzielę wieczorem)', async () => {
    const C = await lib('public/js/bt-czas.js');
    const ev = [allDay('2026-01-16', 'pt', 'opex'), allDay('2026-01-19', 'MLK', 'holiday'), allDay('2026-01-20', 'wt')];
    assert.deepEqual(names(C.chartNews(ev, utc(2026, 1, 16, 15))), ['pt', 'MLK'], 'piątek: jutro = poniedziałek, nie sobota');
    assert.deepEqual(names(C.chartNews(ev, utc(2026, 1, 17, 12))), ['MLK'], 'sobota (brak sesji): tylko następny dzień handlowy');
    assert.deepEqual(names(C.chartNews(ev, utc(2026, 1, 18, 23, 30))), ['MLK', 'wt'], 'niedziela 18:30 ET: to już poniedziałek, jutro wtorek');
    const sun = hourly('2026-01-18', utc(2026, 1, 19, 0, 30), 'niedz-wieczor');
    assert.deepEqual(names(C.chartNews([sun, ...ev], utc(2026, 1, 19, 15))), ['niedz-wieczor', 'MLK', 'wt'], 'news z niedzieli wieczorem ET należy do poniedziałkowego dnia handlowego');
    assert.deepEqual(names(C.chartNews([sun], utc(2026, 1, 16, 15))), ['niedz-wieczor'], 'w piątek widać go jako news następnego dnia handlowego');
  });

  test('backtest-O: zmiana czasu USA: granica 18:00 ET liczona z nowego offsetu (marzec, listopad)', async () => {
    const C = await lib('public/js/bt-czas.js');
    const ev = [allDay('2026-03-09', 'pn'), allDay('2026-03-10', 'wt'), allDay('2026-03-11', 'sr')];
    assert.deepEqual(names(C.chartNews(ev, utc(2026, 3, 8, 21, 59))), ['pn'], 'niedziela 17:59 EDT: dzień niedzielny, następny handlowy = poniedziałek');
    assert.deepEqual(names(C.chartNews(ev, utc(2026, 3, 8, 22, 0))), ['pn', 'wt']);
    const nov = [allDay('2026-11-02', 'pn'), allDay('2026-11-03', 'wt'), allDay('2026-11-04', 'sr')];
    assert.deepEqual(names(C.chartNews(nov, utc(2026, 11, 1, 22, 59))), ['pn']);
    assert.deepEqual(names(C.chartNews(nov, utc(2026, 11, 1, 23, 0))), ['pn', 'wt']);
  });

  test('backtest-O: klucz okna zmienia się tylko przy zmianie dnia handlowego; visibleNews bez zmian; wykres backtestu używa okna, pozostałe wykresy nie', async () => {
    const C = await lib('public/js/bt-czas.js');
    assert.equal(C.newsWindowKey(utc(2026, 11, 18, 14)), C.newsWindowKey(utc(2026, 11, 18, 22, 59)));
    assert.notEqual(C.newsWindowKey(utc(2026, 11, 18, 22, 59)), C.newsWindowKey(utc(2026, 11, 18, 23, 0)));
    const old = [{ t: utc(2026, 11, 10, 13), day: '2026-11-10', name: 'stary', imp: 'high', kind: 'data', allDay: false }];
    assert.equal(C.visibleNews(old, utc(2026, 11, 18, 14)).length, 1, 'visibleNews nadal zwraca całą przeszłość (używa go reszta aplikacji)');
    const rep = readFileSync(path.join(ROOT, 'public/js/bt-replay.js'), 'utf8');
    assert.ok(/getNews: \(\) => chartNews\(data\.news\(\), cursor\)/.test(rep) && /newsWindowKey\(/.test(rep), 'replay podaje wykresowi okno newsów');
    for (const f of ['public/js/podglad.js', 'public/js/wykres.js']) assert.ok(!/chartNews/.test(readFileSync(path.join(ROOT, f), 'utf8')), `${f} bez okna`);
  });
};
