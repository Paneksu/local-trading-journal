// backtest-P: czas do zamknięcia bieżącej świecy w Backteście (04.11.2026).
// [U] 04.11.2026 «dodaj takze do backtestingu aktualny czas wykresu bo nie ma takiego oraz czas do zamkniecia danej swieczki»
// Czysta logika (bt-czas.js candleClock / fmtCountdown): granice z tych samych sesji CME co świece (aggregate), przerwa i weekend uczciwie jako „zamknięty”.
// Sesja CME: 17:00 Chicago = 18:00 ET do 16:00 Chicago = 17:00 ET. Bez przeglądarki i sieci.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const utc = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000;

  test('backtest-P: granice świec na kilku interwałach (1m, 5m, 1h, 4h z ucięciem zamknięciem sesji, 1D)', async () => {
    const C = await lib('public/js/bt-czas.js');
    // środa 18.11.2026, EST: sesja otwarta wt 23:00Z, zamknięta śr 22:00Z
    const at = (h, mi, s) => utc(2026, 11, 18, h, mi, s);
    assert.equal(C.candleClock(at(15, 0, 20), '1m').remaining, 40);
    assert.equal(C.candleClock(at(15, 0, 0), '1m').remaining, 60, 'kursor na początku świecy: pełny interwał');
    assert.equal(C.candleClock(at(15, 2, 0), '5m').remaining, 180);
    assert.equal(C.candleClock(at(15, 30, 0), '1h').remaining, 1800, 'godzinowe od otwarcia sesji (23:00Z), więc 15:00-16:00Z');
    assert.equal(C.candleClock(at(15, 0, 0), '4h').remaining, 14400, '4h: 23, 03, 07, 11, 15Z');
    assert.equal(C.candleClock(at(20, 0, 0), '4h').remaining, 7200, 'ostatnia 4h ucięta zamknięciem sesji o 22:00Z');
    assert.equal(C.candleClock(at(15, 0, 0), '1D').remaining, 7 * 3600, '1D = sesja do 22:00Z');
    assert.equal(C.candleClock(at(21, 59, 59), '1m').remaining, 1, 'ostatnia sekunda sesji');
    const k = C.candleClock(at(15, 0, 20), '1m');
    assert.deepEqual([k.state, k.lo, k.end], ['open', at(15, 0, 0), at(15, 1, 0)], 'przedział ważności do pamięci podręcznej');
  });

  test('backtest-P: 1W i 1M: koniec w piątek 17:00 ET i w ostatnim dniu handlowym miesiąca', async () => {
    const C = await lib('public/js/bt-czas.js');
    assert.equal(C.candleClock(utc(2026, 11, 18, 15), '1W').end, utc(2026, 11, 20, 22), 'tydzień kończy zamknięcie piątku');
    assert.equal(C.candleClock(utc(2026, 11, 22, 23, 30), '1W').end, utc(2026, 11, 27, 22), 'niedziela wieczorem: nowy tydzień');
    // listopad: dzień handlowy 30.11 (pn) to ostatni; sesja otwarta w niedzielę 29.11 kończy się 30.11 22:00Z, nowy miesiąc zaczyna sesja z 30.11 18:00 ET
    assert.equal(C.candleClock(utc(2026, 11, 18, 15), '1M').end, utc(2026, 11, 30, 22));
    assert.equal(C.candleClock(utc(2026, 11, 30, 23, 30), '1M').end > utc(2026, 12, 30), true, 'po 18:00 ET 30.11 trwa świeca grudniowa');
  });

  test('backtest-P: zmiana czasu USA: sesje 22 h i 23 h, odliczanie z granic sesji, nie ze stałego offsetu', async () => {
    const C = await lib('public/js/bt-czas.js');
    // niedziela 8.03.2026 18:00 EDT = 22:00Z; sesja do poniedziałku 9.03 17:00 EDT = 21:00Z (23 h)
    assert.equal(C.candleClock(utc(2026, 3, 8, 22, 30), '1D').remaining, 22.5 * 3600);
    assert.equal(C.candleClock(utc(2026, 3, 9, 15), '1D').end, utc(2026, 3, 9, 21));
    // poniedziałek po zmianie: godzinowe od 22:00Z, nie od 23:00Z
    assert.equal(C.candleClock(utc(2026, 3, 9, 15, 10), '1h').remaining, 3000);
    // niedziela 1.11.2026 18:00 EST = 23:00Z, zamknięcie pn 2.11 22:00Z
    assert.equal(C.candleClock(utc(2026, 11, 1, 23, 30), '1D').end, utc(2026, 11, 2, 22));
    assert.equal(C.candleClock(utc(2026, 11, 2, 10), '1h').remaining, 3600 - ((utc(2026, 11, 2, 10) - utc(2026, 11, 1, 23)) % 3600));
  });

  test('backtest-P: przerwa dzienna, weekend i granice: „rynek zamknięty” z czasem otwarcia, bez ujemnych wartości', async () => {
    const C = await lib('public/js/bt-czas.js');
    const brk = C.candleClock(utc(2026, 11, 18, 22, 30), '1m');
    assert.deepEqual([brk.state, brk.end, brk.remaining], ['closed', utc(2026, 11, 18, 23), 1800], 'przerwa 17:00-18:00 ET: otwarcie o 18:00 ET');
    assert.equal(C.candleClock(utc(2026, 11, 18, 22, 0), '1h').state, 'closed', 'dokładnie zamknięcie sesji to już przerwa');
    const op = C.candleClock(utc(2026, 11, 18, 23, 0), '1h');
    assert.deepEqual([op.state, op.remaining], ['open', 3600], 'dokładnie otwarcie to początek pierwszej świecy');
    const sat = C.candleClock(utc(2026, 11, 21, 12), '1D');
    assert.deepEqual([sat.state, sat.end], ['closed', utc(2026, 11, 22, 23)], 'sobota: otwarcie w niedzielę 18:00 ET');
    assert.equal(C.candleClock(utc(2026, 11, 20, 22, 30), '5m').state, 'closed', 'piątek po 17:00 ET');
    assert.equal(C.candleClock(utc(2026, 11, 22, 22, 59), '5m').state, 'closed', 'niedziela przed 18:00 ET');
    // skrócona sesja (27.11, zamknięcie 13:15 ET): kalendarza świąt nie ma, zegar sesji nadal liczy; brak świecy pod kursorem wykrywa createClockCache z danych (backtest-R)
    const half = C.candleClock(utc(2026, 11, 27, 16, 0), '1D');
    assert.equal(half.state, 'open');
    assert.ok(half.remaining > 0 && half.end > utc(2026, 11, 27, 16), 'zawsze dodatni czas do końca');
    // przeszukanie całego roku co 7 minut: nigdy ujemne, nigdy NaN, otwarte zawsze z końcem > kursor
    for (let u = utc(2026, 1, 1); u < utc(2027, 1, 1); u += 7 * 60 + 13) {
      for (const tf of ['1m', '15m', '1h', '1D']) {
        const r = C.candleClock(u, tf);
        assert.ok(r && Number.isFinite(r.end) && r.remaining > 0 && r.end > u && r.lo <= u, `${tf} ${u}`);
      }
    }
  });

  test('backtest-P: tryb przeglądania przeszłości: wynik zależy tylko od kursora (cofnięcie o dni liczy się jak każdy inny kursor)', async () => {
    const C = await lib('public/js/bt-czas.js');
    const a = C.candleClock(utc(2026, 11, 18, 15, 0, 20), '1m'), back = C.candleClock(utc(2026, 11, 10, 15, 0, 20), '1m');
    assert.deepEqual([a.remaining, back.remaining], [40, 40]);
    assert.equal(C.candleClock(utc(2026, 11, 18, 15), 'zly'), null, 'zły interwał nie wybucha');
  });

  test('backtest-P: format odliczania i podpięcie w interfejsie (tabular nums, strefa przy zegarze, pamięć podręczna, bez ujemnych)', async () => {
    const C = await lib('public/js/bt-czas.js');
    assert.deepEqual([59, 60, 3725, 90000, -5].map(C.fmtCountdown), ['00:59', '01:00', '1:02:05', '1d 01:00:00', '00:00']);
    const css = readFileSync(path.join(ROOT, 'public/features.css'), 'utf8'); // interfejs: strona przeglądarkowa backtest-P-strona, pamięć odliczania: backtest-R
    assert.ok(/\.bt-cd \{[^}]*tabular-nums/.test(css));
  });
};
