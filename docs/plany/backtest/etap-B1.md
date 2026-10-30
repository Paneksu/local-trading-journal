# Etap B1: rdzeń replayu (strumień bazowy, świeca w budowie, kroki, skoki, skróty)

Model: **Opus**. Review po pakiecie: brak (review po C2 obejmuje B1). Najpierw `00-wspolne.md`.

## Cel
Czyste moduły `public/js/bt-swieca.js` i `public/js/bt-czas.js` (bez DOM, działają w Node i przeglądarce), na których stoi cały ekran replayu. Gwarancja §2 i 18a.1: żaden widok nie dostaje świecy z `t > kursor`, a świeca wyższego interwału jest zawsze agregatem niższych do kursora.

## Przeczytaj
- `public/js/swiece.js` 1-60 (`parseTf`, `pickSource`, model świecy), 86-100 (`sessionBounds`), 120-167 (`aggregate`), 169-200 (`SESSIONS`, `sessionWindows`), 240-265 (`overlayLevels`), 266-275 (`previousSession`).
- `lib/news.mjs` 44-66 (`etToUtc`, kształt zdarzenia: `t, name, imp, kind`; brak pól wyniku).
- `public/js/rysunki.js` 929-940 (klawisze zajęte przez rysunki: Escape, Ctrl+Z, strzałki), `public/js/podglad.js` 1228-1233 (strzałki, `+`, `=`, `-`).
- `lib/backtest-day.mjs` (z A: kształt `ReplayDay`), `testy/bt-dane-syntetyczne.mjs`.

## Pliki
- Utwórz: `public/js/bt-swieca.js`, `public/js/bt-czas.js`, `testy/backtest-B1-swieca.mjs`, `testy/backtest-B1-czas.mjs`.

## Interfejsy
- Consumes: `aggregate(bars, tf)`, `parseTf(str)`, `sessionBounds(t)`, `SESSIONS` z `public/js/swiece.js`; `ReplayDay` (A).
- Produces (dokładnie jak w 00-wspolne): `mergeBase`, `visibleCount`, `candlesAt`, `createBuilder`, `REPLAY_TFS`; `nyAt`, `stepSec`, `nextCursor`, `jumpTarget`, `DEFAULT_JUMPS`, `DEFAULT_SKROTY`, `RESERVED_SKROTY`, `skrotOf`, `collisions`, `visibleNews`, `nextNews`.

Definicja kursora (wiążąca dla wszystkich kart): kursor `C` to chwila w sekundach; świeca bazowa `[t, …]` o długości `len` jest widoczna ⇔ `t + len ≤ C`. Świeca w budowie interwału `tf` = agregat widocznych świec bazowych w jej kubełku (`t_kubełka ≤ C`).

## Zadanie 1: strumień bazowy i świeca w budowie

- [x] **Testy** `testy/backtest-B1-swieca.mjs` (dane: `syntheticDay` + `createReplayDay`, albo ręczne tablice):
  - `backtest-B1: brak przyszłości` — dla 500 losowych kursorów w dniu i każdego tf z `REPLAY_TFS`: każda świeca z `candlesAt` ma `t ≤ C`, a każda świeca bazowa użyta w agregacie ma `t + len ≤ C`.
  - `backtest-B1: zgodność TF w tej samej chwili` — dla C = 10:07:23 NY: OHLC ostatniej świecy `1m` = agregat świec `15s` z tej minuty = agregat `5s` = agregat `1s`; ostatnia `5m` = agregat ostatnich `1m` w kubełku (porównanie `o,h,l,c,v`).
  - `backtest-B1: przejście 1m → 1s o 9:30` — `candlesAt(stream,'15s', 9:31:00)`: przedostatnie świece przed 9:30 mają `t` co 60 s (9:28, 9:29), potem 9:30:00, 9:30:15, 9:30:30, 9:30:45; brak dziury i brak dubla 9:29.
  - `backtest-B1: po 11:00 świece bazowe są 1m` — `len` = 60 dla `t ≥ w1sEnd`.
  - `backtest-B1: luka w 1s` — `syntheticDay` z `gaps` 10:00:05–10:00:20: kursor w luce nie tworzy świec, świeca w budowie 15s ma OHLC tylko z istniejących sekund, kolejne kroki działają.
  - `backtest-B1: builder = wzorzec` — `createBuilder(stream,'1m')`: 2 000 losowych `seek` (krok ±1 s, ±60 s, skok o godzinę, cofnięcie) → po każdym `bars()` deep-equal `candlesAt`; mały krok w przód daje `update` albo `append`, cofnięcie i skok dają `reset`.
  - `backtest-B1: koszt kroku` — 5 400 kolejnych `seek(C+1)` na `15s` i `1m` łącznie < 150 ms w Node (bez `reset` po drodze).
- [x] Uruchom `node testy/run.mjs backtest-B1` → FAIL.
- [x] Zaimplementuj w `bt-swieca.js`: `mergeBase(m1, s1, real1s)` (1m spoza `real1s`, 1s w `real1s`, posortowane, bez dubli minut z oknem), `visibleCount` (wyszukiwanie binarne po `t + len`), `candlesAt` (= `aggregate(bars.slice(0, visibleCount))`, dla tf < 60 s świece 1m zostają minutowe), `createBuilder` (agregacja przyrostowa: indeks ostatniej przetworzonej świecy bazowej, kubełek bieżący, `reset` przy cofnięciu i przy skoku o więcej niż 600 świec bazowych, w pozostałych przypadkach `update`/`append`).
- [x] Testy zielone.

## Zadanie 2: kroki, skoki, newsy bez przyszłości

- [x] **Testy** `testy/backtest-B1-czas.mjs`:
  - `backtest-B1: nyAt w DST` — `nyAt('2024-03-11','09:30')` = 13:30 UTC, `nyAt('2024-03-08','09:30')` = 14:30 UTC, `nyAt('2024-11-04','09:30')` = 14:30 UTC.
  - `backtest-B1: krok = jedna świeca aktywnego TF` — w oknie 1s: `nextCursor(10:00:00, +1, '15s', real1s, b)` = 10:00:15; z 10:00:07 → 10:00:15 (wyrównanie do granicy kubełka); `'5m'` z 10:02:00 → 10:05:00; `-1` symetrycznie.
  - `backtest-B1: TF sekundowy poza oknem krokuje o 1 min` — `stepSec('15s', 9:10:00, real1s) === 60`, `stepSec('15s', 11:00:00, real1s) === 60`, `stepSec('15s', 10:00:00, real1s) === 15`; `nextCursor(9:29:00, +1, '15s')` = 9:30:00, a następny 9:30:15.
  - `backtest-B1: koniec dnia 16:00 NY` — `nextCursor` nigdy nie przekracza `times.end`; wynik w `end` jest stały przy dalszych krokach.
  - `backtest-B1: skoki` — `DEFAULT_JUMPS` zawiera: do 9:30 NY, do następnej sesji NY (`nextDay`, godzina startu), do następnego newsa (waga ≥ wysoka), do następnego dnia z filtra (`nextDay`), +N min (`offset`, 15 min). `jumpTarget({cel:{kind:'time',at:'09:30'}})` z 9:05 → 9:30; z 9:45 → `null` (w tym dniu już minęło); `offset` 900 s nie przekracza `end`; `news` wskazuje najbliższe zdarzenie o `t > cursor` i wadze ≥ progu; `nextDay` → `{ nextDay: true, at: startTime }`; `session:'london'` → następne 02:00 NY po kursorze albo `null`.
  - `backtest-B1: visibleNews pokazuje plan dnia bez wyniku` — zwraca zdarzenia dnia (nazwa, czas, waga) także późniejsze niż kursor (§2: plan dnia wolno), żaden obiekt nie ma pól spoza `t, day, name, imp, kind, allDay, tentative`.
  - `backtest-B1: kolizja skrótów` — `collisions` wykrywa: skok ze skrótem `Escape` (zajęty przez rysunki), dwa skoki z tym samym skrótem, skok = skrót akcji (`Space`); `skrotOf({ key:'ArrowRight', shiftKey:true })` = `'Shift+ArrowRight'`.
- [x] Zaimplementuj `bt-czas.js`. Domyślne skróty (decyzja [B], mapowania FX Replay niepotwierdzone w dokumentacji 30.10.2026): `play: 'Space'`, `stepFwd: 'Shift+ArrowRight'`, `stepBack: 'Shift+ArrowLeft'`, `jump: 'J'`, `speedUp: ']'`, `speedDown: '['`, `buy: 'B'`, `sell: 'S'`, `closeAll: 'Shift+C'`, `endDay: 'Shift+E'`. `RESERVED_SKROTY = ['Escape','Ctrl+Z','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Enter','Delete','Backspace']`.
- [x] Testy zielone; pełny przebieg do pliku; commit `dodaje rdzeń replayu: świece do kursora, kroki i skoki`; wpis w `postep.md`.

## Gotowe, gdy
Wszystkie `backtest-B1:` zielone, w tym „brak przyszłości” i „builder = wzorzec”. Moduły nie importują nic z DOM.

## Nie rób
Żadnego UI. Nie zmieniaj `swiece.js` (jeśli `aggregate` wymaga zmiany: opisz w raporcie zamiast zmieniać).
