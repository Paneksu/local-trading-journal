# Etap A: API dnia replayu i dane syntetyczne

Model: **Sonnet**. Review po pakiecie: brak. Najpierw `00-wspolne.md`.

## Cel
Serwer oddaje cały dzień replayu jednym zapytaniem (`GET /api/backtest/day`). ES ma w tym module tylko 1m (zakup ES 1s anulowany 30.10.2026, «Nie potrzebuje narazie tego jednak»): brak importu ES 1s i brak atrapy Databento, dla ES trasa oddaje `s1 = []`, `real1s = []`, `has1s = false`. NQ bez zmian. Testy dostają generator syntetycznych świec i pętlę `backtest-*` w `run.mjs`.

## Przeczytaj
- `lib/candles.mjs` 110-142 (stałe okna 1s, `openWindows`, `openBatches`), 211-231 (`createCandles`), 444-447 (`readOne`), 1145-1150 (zwracane API).
- `lib/candles-store.mjs` 1-24 (układ plików, `layerCoverage`), 161-170 (`readDay`, `writeRange`), 196-223 (`readRange`, `readAux`, `writeAux`).
- `public/js/swiece.js` 70-100 (`dayNum`, `sessionBounds`, `sessionOf`), 266-275 (`previousSession`).
- `lib/news.mjs` 40-50 (`etToUtc`, `etDayOf`); `server.mjs` 409-418 (akcje świec), 653-680 (trasy GET newsów i świec).
- `testy/run.mjs` 1057-1065 (pętle plików testów); `testy/pomocnicze.mjs` 23-27 (`cleanEnv`), 80-95 (`server`, `atrapaDb`).

## Pliki
- Zmień: `testy/run.mjs` (pętla `^backtest-.*\.mjs$` obok pętli `newsy-`), `lib/candles.mjs` (tylko `readRaw`), `server.mjs` (trasa GET), `public/i18n/en.json`.
- Utwórz: `lib/backtest-day.mjs`, `testy/bt-dane-syntetyczne.mjs` (generator, nie test: pętla ładuje tylko `backtest-*.mjs`), `testy/backtest-A-dzien.mjs`.

## Interfejsy
- Consumes: `createCandles(...)` i `readOne(q, opt)` z `lib/candles.mjs`; `writeRange(sym, res, from, to, bars, {rolls}, {baseDir})` z `lib/candles-store.mjs`; `etToUtc(day, hh, mm)`, `etDayOf(u)` z `lib/news.mjs`; `news.range(from, to)`, `earnings.range(from, to)`.
- Produces: `readRaw` (candles), `createReplayDay`, `dayTimes`, trasa `/api/backtest/day`, typ `ReplayDay` (00-wspolne), `syntheticDay(baseDir, { instrument, day, seed, has1s = true, gaps = [] }) → { m1Count, s1Count }` (`testy/bt-dane-syntetyczne.mjs`).

## Zadanie 1: pętla testów i generator

- [x] Dopisz w `testy/run.mjs` pętlę dla `/^backtest-.*\.mjs$/` (wzór 1062-1065).
- [x] Napisz `syntheticDay` w `testy/bt-dane-syntetyczne.mjs`: losowy spacer (ziarno), 1m od otwarcia sesji CME dwóch dni wstecz do 16:00 NY, 1s w `[9:30, 11:00)` NY (gdy `has1s`), sekundy z `gaps` pominięte w świecach, ale pokrycie zapisane (`writeRange` z całym zakresem okna). 1m w oknie = agregat 1s (spójność). Zapis przez `writeRange` do warstw `1m` i `1s`.

## Zadanie 2: dzień replayu

- [x] **Test** `testy/backtest-A-dzien.mjs`:
  - `backtest-A: dayTimes w czasie letnim i zimowym` — `dayTimes('2024-03-12').open === Date.UTC(2024,2,12,13,30)/1000`, `dayTimes('2024-01-10').open === Date.UTC(2024,0,10,14,30)/1000`, `end - open === 6.5*3600`, `w1sEnd - open === 5400`.
  - `backtest-A: dzień NQ ma m1 z kontekstem i s1 tylko z okna` — po `syntheticDay` (NQ, 2024-03-12): `inst.NQ.s1.every(b => b[0] >= open && b[0] < w1sEnd)`, `inst.NQ.m1[0][0] === times.ctxFrom`, ostatnia świeca m1 `< end`, `has1s === true`, `real1s` = `[[open, w1sEnd]]`.
  - `backtest-A: MNQ czyta dane NQ` — `inst.MNQ.data === 'NQ'`.
  - `backtest-A: ES ma tylko 1m` — dla ES (także gdy w danych są stare okna 1s) `s1 = []`, `real1s = []`, `has1s === false`, `m1` pełne.
  - `backtest-A: dzień NQ bez 1s ma has1s=false i pusty s1` (NQ z `has1s:false`).
  - `backtest-A: s1 nie zawiera świec syntetycznych` — żadna świeca nie ma 7. pola.
  - `backtest-A: trasa /api/backtest/day` — serwer z `THQ_CONFIG_DIR` na katalogu z danymi syntetycznymi: 200 i ten sam kształt; zły `day` → 400; instrument spoza listy → 400; `Sec-Fetch-Site: cross-site` → 403.
- [x] Uruchom: `node testy/run.mjs backtest-A` → FAIL (brak modułu).
- [x] Dodaj `readRaw: readOne` do obiektu zwracanego przez `createCandles` (`candles.mjs:1146`).
- [x] Zaimplementuj `lib/backtest-day.mjs`: `dayTimes(day)`, `createReplayDay({ candles, news, earnings }).read({ instruments, day, ctx = 2 })`. m1: `readRaw({ instrument, from: ctxFrom, to: end, tf: '1m' })`; s1: `readRaw({ instrument, from: open, to: w1sEnd, tf: '1s' }, { noSynth: true })` i `real1s` z jego `covered`. Newsy: `news.range(ctxFrom, end)`, earningsy: `earnings.range(dzień − 1 o 16:00, end)`. Instrumenty unikalne po `FAMILY`, najwyżej 4. Dla `data: 'ES'` nie czytaj 1s (`s1 = []`, `real1s = []`).
- [x] Trasa `GET /api/backtest/day` w `server.mjs` obok `/api/candles` (ten sam wzór `try … sendError`).
- [x] Testy zielone.

## Zadanie 3: zamknięcie
- [x] Pełny `node testy/run.mjs` do pliku wyników, commit `dodaje API dnia replayu`, wpis w `postep.md`.

## Gotowe, gdy
`node testy/run.mjs backtest-A` i pełny przebieg zielone; trasa zwraca dzień z danymi syntetycznymi.

## Nie rób
Żadnego importu ES 1s, zakupu ani Databento (anulowane 30.10.2026). Nie zmieniaj importu NQ ani limitów P49/P50. Nie zwracaj świec syntetycznych 1s z trasy dnia.
