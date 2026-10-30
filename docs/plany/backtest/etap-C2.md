# Etap C2: zlecenia na wykresie, skoki, skróty, Ustawienia → Backtest

Model: **Sonnet**. Review po pakiecie: **`code-reviewer`** na diffie B1–C2 (`git diff <commit przed B1>..HEAD`), świeży agent. Najpierw `00-wspolne.md`.

## Cel
Handel w replayu jak w FX Replay (§7): Buy/Sell, market/limit/stop, SL i TP przy zleceniu i przeciągane po wejściu, BE, częściowe i ręczne zamknięcie, wielkość z ryzyka albo ręczna. Skoki z listy rozwijanej i pod skrótem (§8), wszystko pod klawiaturą, edycja skoków i skrótów w nowej zakładce Ustawień.

## Przeczytaj
- `public/js/wykres.js` 72-108 (`tradeLevels`, `positionDrawing`: pozycja jako rysunek paczki).
- `public/js/rysunki.js` 167-206 (`tickOf`, `roundTick`, `positionPrices`, `withPositionPrice`), 279-300 (`createRysunki` kontekst), 929-945 (`onKey`: faza capture, Escape, Ctrl+Z, strzałki).
- `public/js/ustawienia.js` 31 (sygnatura `createSettings`), 330-345 (zakładki), 405-415 (`sp-tab`).
- `lib/sync.mjs` 12-21 (`SECRET_KEY`, `sanitizeSettings`).
- `public/js/bt-wypelnienia.js`, `public/js/bt-czas.js`, `public/js/bt-replay.js` (tylko eksporty i miejsca oznaczone `// C2`).

## Pliki
- Utwórz: `public/js/bt-zlecenia.js` (panel zleceń i wiązanie silnika z wykresem), `testy/backtest-C2-handel.mjs`, `testy/backtest-C2-skroty.mjs`, `testy/backtest-handel.html`.
- Zmień: `public/js/bt-replay.js`, `public/js/bt-wykres.js`, `public/js/ustawienia.js` (zakładka `backtest`), `public/js/app.js` (przekazanie ustawień `bt`), `public/features.css`, `public/i18n/en.json`.

## Interfejsy
- Consumes: B2 (wszystkie funkcje silnika, `Book`, `Event`), B1 (`jumpTarget`, `DEFAULT_JUMPS`, `DEFAULT_SKROTY`, `skrotOf`, `collisions`), C1 (`openReplay`, `createReplayChart`, `createSessionClient`).
- Produces: `mountOrders(host, { getBook, setBook, getLast, getCursor, instrument, risk, onEvent }) → { refresh(), destroy() }` (`bt-zlecenia.js`); w `bt-replay.js` zdarzenie `onClosed(position)` wołane dla każdego `closed` z silnika (E1 podpina journaling); ustawienia `bt` (kształt w 00-wspolne) czytane przez `btSettings() → { jumps, skroty, startTime, risk, speed }`.

## Zadanie 1: zlecenia i pozycja
- [x] **Strona** `testy/backtest-handel.html` + **testy** `testy/backtest-C2-handel.mjs`:
  - `backtest-C2: market Buy z SL i TP` — Buy market, SL 10 pkt, TP 20 pkt → pozycja Long, na wykresie rysunek `long-position` z cenami wejścia/SL/TP; wielkość z ryzyka sesji (`sizeFromRisk`) w polu, pole ręczne nadpisuje.
  - `backtest-C2: przeciągnięcie SL zmienia pozycję` — zmiana ceny SL w rysunku pozycji → `modifyPosition`, cena zaokrąglona do 0.25; pierwotny SL (`sl0`) bez zmian.
  - `backtest-C2: limit i stop oczekujące` — linia zlecenia na wykresie, anulowanie przyciskiem; wypełnienie po krokach według B2.
  - `backtest-C2: BE, częściowe, zamknij` — przyciski działają na pozycji aktywnego instrumentu; po pełnym zamknięciu zdarzenie `onClosed` z `r`, `pnl`, `maeR`, `mfeR`.
  - `backtest-C2: wstecz blokuje zlecenia` — po kroku w tył przyciski zleceń wyłączone z notką „Przeglądasz wstecz” i przyciskiem „Wróć do bieżącej chwili” (kursor = `hw`); pozycja i zlecenia nadal widoczne.
  - `backtest-C2: ryzyko za małe` — `sizeFromRisk = 0` → komunikat i blokada Buy/Sell do wpisania liczby ręcznie.
  - `backtest-C2: stan w pliku sesji` — po każdym zdarzeniu silnika `book` zapisany natychmiast (bez opóźnienia kursora).
- [x] `node testy/run.mjs backtest-C2` → FAIL; zaimplementuj `bt-zlecenia.js` (panel w stylu `.seg`/`.btn`/`.sp-in`, pozycja przez `positionDrawing`, wywołania silnika z `last = { t, price }` ostatniej widocznej świecy bazowej, `advance` po każdym przesunięciu kursora dla każdego instrumentu z otwartą pozycją lub zleceniem); testy zielone.

## Zadanie 2: skoki, skróty, Ustawienia → Backtest
- [x] **Testy** `testy/backtest-C2-skroty.mjs`:
  - `backtest-C2: lista skoków` — lista rozwijana przy pasku pokazuje `DEFAULT_JUMPS` i skoki z ustawień; wybrany skok jest pod przyciskiem „Skok” i pod skrótem `J`; skok `nextDay` przechodzi do następnego dnia z puli (E1 dokłada zamknięcie dnia; do tego czasu dzień oznaczany `done` bez pytania tylko gdy brak pozycji).
  - `backtest-C2: skrót w polu tekstowym` — `Space`, `B`, `J` wpisane w `input`/`textarea` nie sterują replayem.
  - `backtest-C2: skróty nie walczą z rysunkami` — `Shift+ArrowRight` robi krok mimo `onKey` rysunków w fazie capture (obsługa replayu rejestrowana w capture przed rysunkami albo rysunki przepuszczają `Shift+strzałka`); `Escape` dalej zdejmuje narzędzie rysunku.
  - `backtest-C2: Ustawienia → Backtest` — zakładka `backtest` w popoverze: lista skoków (dodaj, edytuj, usuń: nazwa, cel z listy: godzina NY / początek sesji Azja, Londyn, NY / następny news o wadze ≥ / przesunięcie / następny dzień puli, skrót), skróty akcji, domyślna godzina startu, domyślne ryzyko, domyślna szybkość. Kolizja (`collisions`) blokuje zapis i podświetla pole.
  - `backtest-C2: ustawienia przeżywają synchronizację` — `sanitizeSettings({ bt })` zachowuje `bt.skroty`, `bt.jumps[*].skrot`, `bt.jumps[*].cel` (żadne pole nie pasuje do `SECRET_KEY`).
- [x] Zaimplementuj: zakładka `backtest` w `ustawienia.js` (wzór zakładki `wykresy`), klawiatura replayu w `bt-replay.js` (jeden nasłuch `keydown` w fazie capture na `window`, aktywny tylko przy otwartym `.bt-screen`, pomija pola edycji), lista skoków przy pasku.
- [x] Testy zielone; pełny przebieg; commit `dodaje zlecenia, skoki i skróty replayu`; wpis w `postep.md`.

## Po pakiecie
Sesja główna woła `code-reviewer` (diff B1–C2): poprawność kursora i brak przyszłości, reguły wypełnień vs §7, przecieki nasłuchów przy zamykaniu ekranu. Poprawki: wznowienie autora C2.

## Gotowe, gdy
Pełny trade (wejście, przeciągnięcie SL, BE, częściowe, wyjście) przechodzi na stronie testowej; skróty z Ustawień działają i kolizje są odrzucane; `backtest-C2:` zielone.
