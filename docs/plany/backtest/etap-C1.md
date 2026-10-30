# Etap C1: magazyn sesji, zakładka Backtest, ekran replayu z jednym wykresem

Model: **Opus** (wiązanie rdzenia z wykresem i progi wydajności). Review po pakiecie: brak. Najpierw `00-wspolne.md`.

## Cel
Użytkownik tworzy sesję formularzem klasycznym (§12, bez filtra zaawansowanego), widzi ją na liście w nowej zakładce „Backtest” i otwiera replay: jeden wykres Lightweight Charts sterowany kursorem (krok przód/tył, odtwarzanie z szybkością), pasek górny, ukrycie daty przy kolejności losowej. Stan sesji zapisuje się na dysk na bieżąco.

## Przeczytaj
- `server.mjs` 250-262 (`guardWrite`), 590-630 (obsługa POST, wzór `dr` dla dużego ciała), 674-680 (trasy GET); `lib/candles-store.mjs` 74-86 (`writeAtomic`).
- `public/js/app.js` 33-37 (`DEFAULTS`, `VIEWS`), 780-795 (`renderTabs`), 935-945 (`renderMain`, wzór kalendarza bez Notion), 1888 (`setView`).
- `public/js/wykres.js` 18-70 (`LWC_URL`, `themeOptions`, `candleOptions`, `seriesData`), 196-219 (`readColors`, `overlayScales`), 219-230 i 286-295 (sygnatury `overlayPrimitive`, `newsPrimitive`), 380-425 (tworzenie wykresu i serii w edytorze: wzór).
- `public/js/bt-swieca.js`, `public/js/bt-czas.js` (B1, tylko eksporty i komentarz nagłówka).
- `public/features.css`: `grep -n "\.ncal\|\.seg\b" ` (wzór sekcji kalendarza).

## Pliki
- Utwórz: `lib/backtest-store.mjs`, `lib/backtest-index.mjs` (wersja minimalna: `{ day, wd, has1s, has1m }`), `public/js/bt-filtr.js` (wersja minimalna: `matchDays` bez filtra, `orderDays`), `public/js/bt-klient.js`, `public/js/bt-widok.js`, `public/js/bt-kreator.js`, `public/js/bt-replay.js`, `public/js/bt-wykres.js`, `testy/backtest-C1-magazyn.mjs`, `testy/backtest-C1-pula.mjs`, `testy/backtest-C1-ekran.mjs`, `testy/backtest-replay.html`.
- Zmień: `server.mjs`, `public/js/app.js` (widok `backtest`), `public/features.css` (`.bt-*`), `public/i18n/en.json`.

## Interfejsy
- Consumes: B1 (`mergeBase`, `createBuilder`, `nextCursor`, `stepSec`, `REPLAY_TFS`); A (`/api/backtest/day`, `ReplayDay`, `syntheticDay`); `themeOptions`, `candleOptions`, `readColors`, `overlayPrimitive`, `newsPrimitive`, `LWC_URL` z `public/js/wykres.js`.
- Produces: `createBacktestStore`, `SESSION_ID_RE`, `SESSION_BODY_LIMIT`, trasy sesji (00-wspolne); `createDayIndex(...).get` + `GET /api/backtest/days` w kształcie z 00-wspolne (F1 rozszerza `DayFeatures`); `matchDays(def, days)`, `orderDays(days, order, seed)` (F1 dokłada `evalFilter`); `createSessionClient`; `createReplayChart(host, { instrument, tf, colors, onCrosshair }) → { apply(update), setCursorLine(t), resize(), destroy() }`; `openReplay(root, { sessionId }) → { close() }` w `bt-replay.js`.

## Zadanie 1: magazyn sesji i trasy
- [x] **Testy** `testy/backtest-C1-magazyn.mjs`:
  - `backtest-C1: zapis atomowy i odczyt sesji` — `save` tworzy `chart-data/backtest/sessions/<id>.json`, brak pliku `.tmp` po zapisie, `read` zwraca dokument z `rev` +1.
  - `backtest-C1: konflikt wersji` — `save(id, doc, staleRev)` → błąd 409 `stale`, plik bez zmian.
  - `backtest-C1: zły identyfikator` — `../x`, `BT-1`, `bt-` → 400; nic nie powstaje poza katalogiem sesji.
  - `backtest-C1: lista sesji` — `list()` zwraca `{ id, name, instruments, done, pool, sumR, lastOpened }` posortowane po `updated` malejąco; uszkodzony plik pominięty z wpisem w logu, lista działa.
  - `backtest-C1: trasy chronione` — `POST /api/backtest/session/save` bez `X-THQ`, z obcym `Origin` albo `text/plain` → 403; ciało > 4 MB → 413; poprawne → 200 `{ rev }`.
- [x] `node testy/run.mjs backtest-C1` → FAIL; zaimplementuj `lib/backtest-store.mjs` (zapis tmp + rename jak `candles-store.mjs:74`) i trasy (POST w dyspozytorze jak `dr`, `readJson(req, SESSION_BODY_LIMIT, …)`); testy zielone.

## Zadanie 2: pula dni
- [x] **Testy** `testy/backtest-C1-pula.mjs`:
  - `backtest-C1: dni bez danych wykluczone z powodem` — `matchDays({instruments:['NQ','ES'], from, to, filter:null, excluded:[]}, days)`: dzień z `has1s.NQ === false` w `excluded` z `reason: 'no1s'`; dzień z `has1m.ES === false` w `excluded` z `reason: 'no1m'`; dzień z samym ES (`instruments:['ES']`) przechodzi, gdy jest `has1m.ES` (ES nie ma `has1s`); weekend nie występuje w ogóle.
  - `backtest-C1: ręcznie wyrzucony dzień i dni zrobione` — `reason: 'manual'`, `'done'` (pula się nie powtarza).
  - `backtest-C1: kolejność` — `orderDays(d,'chrono')` rosnąco, `'newest'` malejąco, `'random'` deterministyczna dla tego samego `seed`, inna dla innego, ta sama długość i zbiór.
- [x] Zaimplementuj minimalne `lib/backtest-index.mjs` (`has1s` tylko dla NQ z `readCoverage` 1s: pokrycie `[9:30, 11:00)` NY; `has1m` dla ES i NQ z `readCoverage` 1m: pokrycie `[9:30, 16:00)` NY; ES nie wymaga 1s, decyzja 30.10.2026) z trasą `GET /api/backtest/days` oraz `bt-filtr.js` (`matchDays` z `filter === null`, `orderDays` z deterministycznym PRNG od `seed`).

## Zadanie 3: zakładka, formularz klasyczny, ekran replayu
- [x] **Strona testowa** `testy/backtest-replay.html` (ładuje `bt-replay.js` z syntetycznym `ReplayDay` wstrzykniętym przez `window.__btDay`) i **testy** `testy/backtest-C1-ekran.mjs`:
  - `backtest-C1: zakładka Backtest` — `VIEWS` zawiera `'backtest'`; w DOM `[data-v="backtest"]`; widok pusty pokazuje `.empty` z przyciskiem „Nowa sesja”.
  - `backtest-C1: formularz klasyczny` — pola: nazwa, instrument(y), zakres dat, saldo startowe, ryzyko (USD albo % salda), godzina startu (domyślnie `09:00`), kolejność (chronologicznie / od najnowszych / losowo z ukrytą datą), konto z Notion (opcjonalnie). Zapis tworzy sesję z `pool` z `matchDays` + `orderDays`.
  - `backtest-C1: start dnia z historią` — po otwarciu kursor = `nyAt(day, startTime)`, wykres ma świece do 9:00 (kontekst 1m), żadnej o `t ≥ kursor`.
  - `backtest-C1: krok i odtwarzanie` — klik „krok” przesuwa kursor o jedną świecę aktywnego TF; `play` z szybkością 100× (1 s replayu na 10 ms) po 500 ms przesuwa kursor o 40–60 s; `pause` zatrzymuje.
  - `backtest-C1: series.update zamiast setData` — licznik wywołań (`window.__btStats`): przy 100 krokach `setData` ≤ 1 (start), `update` ≥ 100.
  - `backtest-C1: TF sekundowy przed 9:30` — notka „sekundy od 9:30” widoczna przy kursorze 9:10 na `15s`, znika o 9:30.
  - `backtest-C1: ukryta data` — sesja `random`: oś czasu tylko godziny, pasek bez daty; po „Zakończ dzień” data widoczna.
  - `backtest-C1: koszt kroku na syntetycznym dniu` — p95 kroku (render 1 wykresu) ≤ 8 ms na stronie testowej (próg 16 ms dla dwóch wykresów sprawdza D1 i H1).
- [x] Zaimplementuj: widok `backtest` w `app.js` (renderowany jak kalendarz, bez zależności od Notion), `bt-widok.js` (lista: nazwa, instrument, dni zrobione / w puli, wynik w R, ostatnio otwarta; „Nowa sesja”, „Otwórz”, „Statystyki” jako miejsce na G), `bt-kreator.js` (formularz klasyczny; sekcja „Filtr dni (zaawansowane)” jako zwinięte, puste miejsce na F2), `bt-replay.js` (ekran pełnookienkowy `.bt-screen` nad dashboardem, pasek: nazwa sesji, dzień „7 / 23”, typ dnia (puste do F), wynik w R i liczba trade'ów, licznik „niezapisane w Notion: N” (0 do E2), wybór układu (tylko 1 do D1), „Zakończ dzień” (E1)), `bt-wykres.js` (seria świec, `apply(update)`: `reset` → `setData`, `update`/`append` → `series.update` kolejno; nakładki sesji i PDH/PDL przez `overlayPrimitive` z `getCandles()` = świece widoczne, newsy przez `newsPrimitive` z `visibleNews` (plan dnia bez wyników); przeliczenie nakładek tylko przy nowej świecy, nie przy aktualizacji bieżącej), `bt-klient.js` (zapis kursora z opóźnieniem 1 s, `fetch(..., { keepalive: true })` przy `pagehide`). Odtwarzanie przez `requestAnimationFrame`: na klatkę kursor += `speed × dt`, jeden render na klatkę. Szybkości: 1×, 10×, 60×, 100×, 300× (domyślnie 100×).
- [x] Testy zielone; pełny przebieg; commit `dodaje zakładkę Backtest i ekran replayu z jednym wykresem`; wpis w `postep.md`. Zrzuty: najwyżej 2 (1920 px, Onyx i Platinum) na `R:/PROJEKTY/trading-hq-wt/backtest-wyniki/C1-*.jpg`.

## Gotowe, gdy
Sesję da się utworzyć, otworzyć i przejść dzień krokami i odtwarzaniem na danych syntetycznych; stan po przeładowaniu strony (kursor, dzień) ten sam; wszystkie `backtest-C1:` zielone.

## Nie rób
Zleceń, skoków i skrótów (C2), wielu wykresów i rysunków (D1), filtra zaawansowanego (F2). Nie przebudowuj `createEditor` w `wykres.js`: replay ma własnego gospodarza wykresu i bierze tylko eksportowane funkcje pomocnicze.
