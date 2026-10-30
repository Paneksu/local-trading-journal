# Etap H1: odbiór funkcjonalny i wydajność na prawdziwych świecach

Model: **Opus**. Review po pakiecie: brak (H2 to review). Najpierw `00-wspolne.md`.

## Cel
§16 [U]: «solidnie przetestuj faktyczne działanie … upewnij się, że timeframe'y sekundowe będą współgrały». Pełny scenariusz na osobnej instancji z kopią prawdziwych świec i atrapą Notion oraz pomiar progów §9 w przeglądarce. Wynik: raport z poziomami dowodów (PRZETESTOWANE / CZĘŚCIOWE / WYWNIOSKOWANE), lista usterek z priorytetami, poprawki usterek P1 w tym pakiecie.

## Przeczytaj
- `testy/start-test.mjs` (całość, 40 linii), `testy/przegladarka.mjs` 22-70 (`findBrowser`, `dumpDom`, `cdpPage`), `testy/udostepnij-e2e.mjs` 1-30 (wzór testu przeglądarkowego uruchamianego osobno od `run.mjs`).
- `postep.md` (wszystkie wpisy: co zrobione, co otwarte).
- Strony testowe z C1–G (`testy/backtest-*.html`): tylko nagłówki.

## Dane (jedyny dozwolony dotyk produkcji: ODCZYT)
- Skrypt `narzedzia/kopia-swiec-odbior.mjs` (nowy, w repo bez danych): kopiuje z `R:/PROJEKTY/trading-hq/chart-data/` do `R:/PROJEKTY/trading-hq-wt/backtest-dane/chart-data/`: `candles/NQ` i `candles/ES` (pliki dni 2023-11-01 … 2024-12-31, `coverage.json`, `contracts-*.json`) i `news/`, `earnings/`. Tylko `copyFile`, żadnego zapisu w źródle (test skryptu sprawdza, że ścieżka źródła jest otwierana tylko do odczytu, a cel leży poza worktree).
- `testy/start-test.mjs`: zmienna `TEST_CONFIG_DIR` (gdy ustawiona, zamiast katalogu tymczasowego). Atrapa Notion jak dotąd.
- ES ma w tym module tylko 1m (zakup ES 1s anulowany 30.10.2026), więc scenariusz handluje głównie na NQ, a ES służy jako wykres 1m (bez wymogu 1s; dzień puli dla ES wymaga pokrycia 1m, §5). Scenariusz może zawierać krótki trade na ES liczony na 1m z regułą konserwatywną.

## Pliki
- Utwórz: `narzedzia/kopia-swiec-odbior.mjs`, `testy/backtest-e2e.mjs` (uruchamiany ręcznie: `node testy/backtest-e2e.mjs`, nie przez `run.mjs`), `testy/backtest-wydajnosc.html`.
- Zmień: `testy/start-test.mjs`; poprawki usterek P1 w plikach, których dotyczą (każda poprawka z testem regresji w karcie pakietu, który ją zrobił, nazwa `backtest-H1: …`).

## Zadanie 1: wydajność (§9, PRZETESTOWANE w przeglądarce)
- [x] `testy/backtest-wydajnosc.html` ładuje `/api/backtest/day?instruments=NQ,ES&day=2024-03-12` i dwa wykresy NQ 15s + ES 1m; wynik `PASS`/`FAIL` z liczbami:
  - `backtest-H1: krok ≤ 16 ms p95` — 500 kroków, czas od kroku do końca `apply` obu wykresów (`performance.now()` + `requestAnimationFrame`), p95 ≤ 16 ms.
  - `backtest-H1: odtwarzanie 100× przez 90 min` — 1 s świecy na 10 ms od 9:30 do 11:00 (5 400 s ≈ 54 s): odstęp między klatkami > 34 ms w ≤ 1% klatek po pierwszych 10, żaden > 100 ms; kursor na końcu = 11:00.
  - `backtest-H1: skok do następnego dnia ≤ 1,5 s` — od kliknięcia skoku `nextDay` do pierwszego wyrenderowanego wykresu nowego dnia, łącznie z pobraniem dnia: ≤ 1 500 ms (mediana z 5 dni: 2024-03-12, 2024-04-10, 2024-05-15, 2024-06-12, 2024-07-11).
  - `backtest-H1: indeks na prawdziwych danych` — `GET /api/backtest/days?instruments=NQ&from=2020-01-02&to=2024-12-31`: pierwsze zbudowanie zapisane w raporcie (bez progu), drugie ≤ 300 ms.
- [x] Przy przekroczeniu progu: profil (`performance.measure`), poprawka w module, ponowny pomiar. Liczby przed/po do raportu. (H1: żaden próg nie przekroczony, bez poprawek wydajności; liczby w backtest-wyniki/H1-odbior.md.)

## Zadanie 2: scenariusz pełny (§16, 7 kroków)
- [x] `testy/backtest-e2e.mjs` (CDP przez `cdpPage`, instancja `TEST_CONFIG_DIR=…/backtest-dane`, port 4331):
  1. `backtest-H1: sesja CPI 2024` — kreator: nazwa „CPI 2024”, NQ, 2024-01-01 … 2024-12-31, filtr „wydarzenie CPI”, kolejność chronologiczna → pula = dni CPI 2024 z 1s; liczba w raporcie.
  2. `backtest-H1: trzy dni` — przejście trzech dni (krok, odtwarzanie, skok do 9:30, skok do newsa).
  3. `backtest-H1: trade'y` — Long z SL i TP (wyjście po TP), Short z BE (wyjście po BE), Long z częściowym zamknięciem i wyjściem ręcznym; wyniki R/USD zgodne z ręcznym wyliczeniem z cen świec 1s (wypisane w raporcie).
  4. `backtest-H1: rysunki z calloutem` — linia i callout na NQ 15s, widoczne na NQ 1m.
  5. `backtest-H1: journaling` — Enter z setupem i notatką, Esc (trade na liście „do uzupełnienia”), uzupełnienie z listy.
  6. `backtest-H1: Zakończ dzień → atrapa Notion` — strony w atrapie (`/__test/pages`) z polami, „Sesja backtestu” ze znacznikiem, rysunki; drugi „Zapisz do Notion” bez dubli; licznik 0.
  7. `backtest-H1: statystyki` — nagłówek, „Gdzie mam przewagę” (wszystkie wiersze „za mało danych”), wykonanie, porównanie z Live.
- [x] Dodatkowo: `backtest-H1: TF sekundowe współgrają` — na dniu 2024-03-12 wykresy 1s, 5s, 15s, 1m, 5m w tej samej chwili 10:07:23: OHLC wyższego = agregat niższych (odczyt z `window.__btCharts`); przejście 9:29 → 9:30 na 15s bez dziury.
- [x] `backtest-H1: brak przyszłości end-to-end` — w trakcie scenariusza, po każdej akcji, żaden wykres, nakładka (PDH/PDL, sesje) ani statystyka filtra nie zawiera czasu > kursor (sprawdzenie w `window.__btCharts` i modelu nakładek).

## Zadanie 3: zamknięcie
- [x] Pełny `node testy/run.mjs` zielony, `node testy/backtest-e2e.mjs` zielony; wyniki do `R:/PROJEKTY/trading-hq-wt/backtest-wyniki/H1*.txt`.
- [x] Commit `dodaje testy odbioru i pomiary wydajności backtestu` (bez danych z `backtest-dane/`: sprawdź `git status`, że nic stamtąd nie trafia do indeksu); wpis w `postep.md`.
- [x] Raport: tabela progów (wartość, próg, wynik), 7 kroków z poziomem dowodu, usterki P1 (naprawione) i P2/P3 (lista dla sesji głównej).

## Gotowe, gdy
Trzy progi §9 spełnione na prawdziwych świecach NQ (+ ES 1m), 7 kroków scenariusza przechodzi, żadnej świecy z przyszłości.

## Nie rób
Żadnego zapisu w `R:/PROJEKTY/trading-hq`. Żadnych świec w repo, testach ani commitach. Prawdziwego Notion.
