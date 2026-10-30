# Etap D1: wiele wykresów, wspólny zegar i krzyżyk, rysunki w replayu

Model: **Sonnet**. Review po pakiecie: brak. Najpierw `00-wspolne.md`.

## Cel
Układy 1, 2 (poziomo lub pionowo) i 4 wykresy, każdy z własnym instrumentem i interwałem, na jednym zegarze replayu ze wspólnym krzyżykiem czasu (§6, 18a.2). Zlecenia idą na wykres aktywny. Rysunki są per sesja i instrument: widoczne na każdym wykresie tego instrumentu w każdym interwale, zapisane w pliku sesji, oddzielone od `drawings-cache` trade'ów Live (18a.6).

## Przeczytaj
- `public/js/rysunki.js` 1-12 (nagłówek, format zapisu), 279-300 (`createRysunki` kontekst), 375-400 (`send`, `createSaver`, `onSaved`), 940-971 (zwracane API).
- `public/js/wykres.js` 420-445 (podpięcie `createRysunki` i nakładek w edytorze: wzór).
- `public/js/bt-replay.js`, `public/js/bt-wykres.js`, `public/js/bt-zlecenia.js` (C1/C2; miejsca `// D1`).
- `public/js/bt-czas.js` (`stepSec`: krok według aktywnego wykresu).

## Pliki
- Zmień: `public/js/bt-replay.js`, `public/js/bt-wykres.js`, `public/js/rysunki.js` (opcja `ctx.saveDoc`), `public/features.css`, `public/i18n/en.json`.
- Utwórz: `public/js/bt-rysunki.js` (magazyn rysunków sesji per instrument i dzień), `testy/backtest-D1-uklady.mjs`, `testy/backtest-uklady.html`.

## Interfejsy
- Consumes: `createRysunki(ctx)` (`rysunki.js:279`), `docOf(items)`; C1/C2: `createReplayChart`, `mountOrders`, `createSessionClient`.
- Produces: `createRysunki` przyjmuje opcjonalne `ctx.saveDoc(doc) → Promise<{ ok, error? }>`; gdy jest, zastępuje `POST /api/drawings/save` (bez `tradeId`). `createDrawingStore({ getSession, save }) → { docOf(sym, day) → DrawingDoc, set(sym, day, doc), subscribe(sym, fn) → off, snapshot(sym, day) → DrawingDoc }` w `bt-rysunki.js` (E1 używa `snapshot` przy zamknięciu trade'a). Layout w pliku sesji: `layout = { kind, charts: [{ instrument, tf }], active }`.

## Zadanie 1: układy i wspólny zegar
- [x] **Strona** `testy/backtest-uklady.html` (dwa instrumenty syntetyczne) + **testy** `testy/backtest-D1-uklady.mjs`:
  - `backtest-D1: układy 1, 2h, 2v, 4` — przełącznik w pasku (`.seg`) zmienia liczbę wykresów; układ zapamiętany w sesji i w `localStorage` (ostatni układ dla nowej sesji).
  - `backtest-D1: jeden zegar` — po kroku wszystkie wykresy mają tę samą chwilę kursora; każdy pokazuje swoją świecę w budowie (NQ 15s i ES 1m: ostatnia świeca ES ma `t` = początek bieżącej minuty).
  - `backtest-D1: krok według aktywnego wykresu` — aktywny NQ 15s → krok 15 s; po kliknięciu wykresu ES 1m (ramka aktywna) krok 60 s; aktywny 15s poza oknem 1s → 60 s dla wszystkich.
  - `backtest-D1: wspólny krzyżyk czasu` — ruch myszy na jednym wykresie ustawia pionową linię czasu na pozostałych (`setCrosshairPosition` albo własna linia), bez zmiany kursora replayu.
  - `backtest-D1: zlecenie na aktywny wykres` — Buy przy aktywnym ES otwiera pozycję ES; NQ i ES mogą mieć pozycje naraz; ten sam instrument na dwóch wykresach pokazuje tę samą pozycję.
  - `backtest-D1: brak przyszłości na wszystkich wykresach` — po 200 losowych krokach i skokach żaden wykres (`window.__btCharts[i].bars()`) nie ma świecy z `t > kursor`.
  - `backtest-D1: wydajność dwóch wykresów` — NQ 15s + ES 1m na danych syntetycznych: p95 kroku ≤ 16 ms (pomiar `performance.now()` od kroku do końca `apply` obu wykresów, 300 kroków).
- [x] `node testy/run.mjs backtest-D1` → FAIL; zaimplementuj układy (siatka CSS `.bt-grid[data-kind]`, wykresy tworzone/niszczone przy zmianie układu, wybór instrumentu i TF w nagłówku każdego wykresu z instrumentów sesji i `REPLAY_TFS`); testy zielone.

## Zadanie 2: rysunki w replayu
- [x] **Testy** (ten sam plik):
  - `backtest-D1: rysunek widoczny na każdym wykresie instrumentu` — linia narysowana na NQ 15s pojawia się na NQ 1m (drugi wykres) po zapisie, nie pojawia się na ES.
  - `backtest-D1: rysunki w pliku sesji` — `session.drawings.NQ['2024-03-12'].d.length === 1`; `chart-data/drawings-cache/` bez nowych plików; żadne żądanie `POST /api/drawings/save`.
  - `backtest-D1: dwie sesje z tym samym dniem się nie mieszają` — rysunek w sesji A niewidoczny w sesji B.
  - `backtest-D1: snapshot` — `snapshot('NQ', day)` zwraca kopię (zmiana po snapshocie nie zmienia zwróconego obiektu), format `{ v: 1, at, d }`.
  - `backtest-D1: edytor trade'a Live bez zmian` — istniejące testy `wykresy-*` rysunków zielone (opcja `saveDoc` nieobecna = stare zachowanie).
- [x] Zaimplementuj `ctx.saveDoc` w `rysunki.js` (jedno miejsce w `send`), `bt-rysunki.js`, pasek narzędzi rysowania na każdym wykresie (wzór `.swc-tools`), odświeżenie innych wykresów tego instrumentu przez `subscribe`.
- [x] Testy zielone; pełny przebieg; commit `dodaje kilka wykresów i rysunki w replayu`; wpis w `postep.md`. Zrzuty: najwyżej 2 (układ 2h i 4, Onyx) na `backtest-wyniki/D1-*.jpg`.

## Gotowe, gdy
Układy działają na jednym zegarze, próg 16 ms p95 dla dwóch wykresów spełniony na danych syntetycznych, rysunki per sesja i instrument; `backtest-D1:` i `wykresy-` zielone.
