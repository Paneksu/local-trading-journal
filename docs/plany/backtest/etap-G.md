# Etap G: statystyki backtestu

Model: **Sonnet**. Review po pakiecie: **`code-reviewer`** (diff F1–G), świeży agent. Najpierw `00-wspolne.md`.

## Cel
§13 [U]: «statystyki powinny dawać prawdziwą wartość … zrozumiałe i przejrzyste». Kryterium: czy użytkownik podejmie na tej podstawie inną decyzję. Nagłówek sesji z krzywą kapitału w R, tabela „Gdzie mam przewagę” z przełącznikiem rozbicia, sekcja „Wykonanie” i porównanie backtest kontra Live dla setupu. Dla jednej sesji, kilku sesji i wszystkich trade'ów Backtest. Typ dnia liczony z indeksu cech dnia w chwili liczenia (18a.7), także dla trade'ów Live i starych wpisów.

## Przeczytaj
- `public/js/stats.js` 103-135 (`outcome`, `beByMargin`, `calc`), 178-213 (`equityPoints`, `group`).
- `public/js/charts.js` 39-45 (sygnatura `drawEquity`), 220-225 (`drawColumns`).
- `public/js/app.js` 280-310 (typy trade'ów, Backtest w R), `grep -n "drawEquity(" public/js/app.js` (wzór wywołania).
- `public/js/bt-filtr.js` (`dayTags`), `lib/backtest-index.mjs` (trasa `/api/backtest/days`), `public/js/stats.js` (`parseBtSession` z E2), `public/js/bt-widok.js` (przycisk „Statystyki” z C1).

## Pliki
- Utwórz: `public/js/bt-staty.js`, `public/js/bt-staty-widok.js`, `testy/backtest-G-staty.mjs`, `testy/backtest-staty.html`.
- Zmień: `public/js/bt-widok.js`, `public/features.css`, `public/i18n/en.json`.

## Interfejsy
- Consumes: `outcome`, `calc`, `group`, `equityPoints` (`stats.js`), `drawEquity` (`charts.js`), `dayTags` (F1), `parseBtSession` (E2), `Trade` z plików sesji (E1).
- Produces (00-wspolne): `MIN_N = 20`, `summary(trades) → { n, wr, avgR, sumR }`, `equityR(trades) → pts`, `edgeTable(trades, by, { tagsOf }) → [{ key, n, wr, avgR, sumR, few }]`, `execution(trades) → { avgMae, avgMfe, maeWinners: [{ bin, n }], leftOnTable: { be, early }, maxLossStreak }`, `compareLive(bt, live) → [{ setup, bt: summary, live: summary }]`, `mergeBacktest(notionTrades, sessions) → Trade[]`.

## Decyzje [B] tej karty
- Źródło: `mergeBacktest` = trade'y Backtest z Notion (znormalizowane) + trade'y z lokalnych plików sesji; duplikat po znaczniku `[sessionId/tradeId]` → wygrywa lokalny (ten sam trade, `maeR`/`mfeR` identyczne z `btMae`/`btMfe` w Notion). MAE/MFE z Notion (`btMae`/`btMfe`, migracja 006) wchodzą jako `maeR`/`mfeR`, więc statystyki wykonania działają na każdym urządzeniu. Trade'y Notion bez znacznika = grupa „Bez sesji”.
- Godzina wejścia: kubełki co 15 min od 9:30 NY (`9:30`, `9:45`, …), wejścia przed 9:30 w kubełku „przed 9:30”.
- „Typ dnia”: trade liczy się w każdym kubełku z `dayTags(features[dzień])` (trade CPI+OPEX jest w obu wierszach); nagłówek tabeli mówi o tym jednym zdaniem.
- „R zostawione na stole”: `be` = Σ(`mfeR − r`) dla trade'ów zamkniętych po BE; `early` = Σ(`mfeR − r`) dla zamkniętych ręcznie (`manual`/`partial`) z `r > 0`. Tylko trade'y z MAE/MFE (z sesji lokalnych albo z pól Notion); trade'y bez nich (Live, stare Backtest z 2023) są wyłączone ze statystyk wykonania, a obok widać liczbę uwzględnionych i wyłączonych (`withData`, `without`).
- Rozkład MAE zwycięzców: kubełki 0,1 R od 0 do −1 R; wniosek tekstem tylko jako opis danych („80% zwycięzców nie spadło poniżej −0,4 R”), bez rady.

## Zadanie 1: moduł liczący
- [x] **Testy** `testy/backtest-G-staty.mjs` (Node, ręczne trade'y):
  - `backtest-G: nagłówek` — 10 trade'ów (6 wygranych, 3 straty, 1 BE) → `n 10`, `wr` liczone jak `stats.calc` (BE poza mianownikiem), `avgR`, `sumR` do 0,01.
  - `backtest-G: za mało danych` — wiersz z 19 trade'ami `few === true`, z 20 `few === false`.
  - `backtest-G: rozbicia` — `by: 'setup' | 'wd' | 'hour' | 'dayType' | 'dir'`; godzina 9:44 → `9:30`, 9:45 → `9:45`, 9:10 → `przed 9:30`; `dayType` przez `tagsOf` (trade w dwóch wierszach).
  - `backtest-G: wykonanie` — `avgMae`, `avgMfe`, `maeWinners`, `leftOnTable.be` i `.early` zgodne z ręcznym wyliczeniem; najdłuższa seria strat = 4 dla sekwencji `W L L L L W L`.
  - `backtest-G: wykonanie bez MAE/MFE` — trade'y z `maeR`/`mfeR` `null` (Live, stare Backtest) nie wchodzą do `avgMae`, `avgMfe`, `maeWinners` ani `leftOnTable`; `withData` i `without` zgadzają się z liczbą; trade z Notion z `btMae`/`btMfe` liczy się jak lokalny.
  - `backtest-G: backtest kontra Live` — po jednym wierszu na setup obecny w obu zbiorach, `live` liczony w R jak dziś (Live w R, bez zmiany zachowania Live).
  - `backtest-G: scalanie bez dubli` — trade lokalny wysłany do Notion (ten sam znacznik) liczy się raz; stary wpis Backtest bez sesji liczy się w „Bez sesji”.
  - `backtest-G: wybór sesji` — jedna, kilka, wszystkie: `summary` zgodne z sumą trade'ów wybranych sesji.
- [x] FAIL → `bt-staty.js` → zielone.

## Zadanie 2: widok
- [x] **Strona** `testy/backtest-staty.html` + **testy** (ten sam plik):
  - `backtest-G: widok statystyk` — nagłówek (4 kafle jak `tile` w `app.js`), krzywa kapitału w R (`drawEquity`), tabela z przełącznikiem `.seg` (Setup / Dzień tygodnia / Godzina wejścia / Typ dnia / Kierunek), wiersze `few` przygaszone (klasa, kolor `--fg-2`) z dopiskiem „za mało danych”, sekcja „Wykonanie”, sekcja „Backtest kontra Live”.
  - `backtest-G: wybór sesji w widoku` — przełącznik: ta sesja / wybrane / wszystkie Backtest.
  - `backtest-G: bez metryk bez decyzji` — w DOM nie ma Sharpe, Sortino ani wariantów profit factor (nie-cel [S]).
  - `backtest-G: zwykłe widoki bez zmian` — filtr typu „Backtest” w Statystykach dashboardu pokazuje te same trade'y co dziś plus wysłane z replayu (testy `app`/`stats` zielone).
- [x] Zaimplementuj `bt-staty-widok.js`; wejście z listy sesji i z ekranu „Sesja ukończona”.
- [x] Pełny przebieg; commit `dodaje statystyki backtestu`; wpis w `postep.md`. Zrzuty: najwyżej 2 (statystyki 1920 Onyx i Platinum).

## Po pakiecie
Sesja główna woła `code-reviewer` (diff F1–G).

## Gotowe, gdy
Wszystkie rozbicia z §13 działają z progiem 20 trade'ów, wykonanie liczy się z MAE/MFE, porównanie z Live jest obok siebie; `backtest-G:` zielone.
