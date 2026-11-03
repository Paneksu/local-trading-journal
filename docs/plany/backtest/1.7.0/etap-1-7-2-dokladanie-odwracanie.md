# Etap 1.7-2: dokładanie i odwracanie (kilka wejść w jednej pozycji)

> Gałąź `feat/1.7-dokladanie` od `feat/1.7-pozycja` (po 1.7-1). Zasady: `00-wspolne.md`, `ZASADY-AGENTOW.md`. Model: `model-pozycji-1-7.md` (§2.3 `fills`, §3.1 średni koszt, §3.3 `rUsd`, §4 `placeOrder`/`advance`/`reversePosition`). Wzór: research §1.1 („Dokładanie”, „Netting a hedging”, „Odwrócenie”). Ślad: `postep.md`, sekcja „1.7-2”. Model wykonawcy: Opus. Review: `code-reviewer` (silnik i wynik w $).

## Słowa użytkownika (1.11.2026)

- P3 «Dokładanie + odwracanie»: kilka wejść w jednej pozycji (średnia cena, ryzyko łącznie), odwrócenie long↔short jednym poleceniem; jeden trade w Notion na pozycję.
- P5 «Od pierwszego SL bez znacznika», P6 «Można usunąć oba» (jak w 1.7-1, tu dla porcji dokładanych).

Zastępują: 18a.3 („najwyżej jedna otwarta pozycja na instrument” w sensie zakazu dokładania; nadal jedna pozycja na instrument, ale z wieloma wejściami), decyzję 4 z `L-audyt` («Przyjmuję wszystkie», „bez dokładania”), regułę B2 „wypełnienie wejścia anuluje pozostałe oczekujące wejścia instrumentu” (teraz tylko przeciwnego kierunku), kod odrzucenia `position-open`.

## Przeczytaj

`model-pozycji-1-7.md` §2–§5; research §1.1 wiersze „Dokładanie”, „Netting a hedging”, „Odwrócenie pozycji”, §3.1; `public/js/bt-wypelnienia.js` (po 1.7-1); `public/js/bt-zlecenia.js` 196–300; `public/js/bt-czas.js` 169–230 (skróty, kolizje).

## Cel

Jedna pozycja na instrument może mieć wiele wejść:
- średnia cena metodą średniego kosztu;
- jeden SL i drabinka TP dla całości;
- ryzyko teraz = |średnia − SL| · otwarta ilość;
- R od `rUsd`, czyli sumy ryzyk porcji (§3.3).

Kup przy otwartym Longu dokłada, Sprzedaj zmniejsza, zamyka albo odwraca (netting, jak FX Replay dla futures). Osobne polecenie „Odwróć” zamyka pozycję i otwiera przeciwną tej samej wielkości. Do Notion jeden trade na pozycję z średnimi cenami.

## Jak to robi FX Replay (research)

| Element | FX Replay | Dowód | My |
|---|---|---|---|
| Dokładanie | ponowne Buy/Sell dokłada do pozycji | DOK [F4] | to samo |
| Netting | hedging wyłączony (domyślnie dla futures): przeciwne zlecenie zmniejsza albo zamyka pozycję | DOK [F15] | netting zawsze (hedgingu nie robimy: jedna pozycja na instrument) |
| Przeciwne zlecenie większe od pozycji | NIEZNANE | — | odwraca resztę (standard nettingu w TV) |
| Przycisk odwrócenia | NIEZNANE; TV ma reverse | TV [N4], [N6] | „Odwróć” w panelu ×, w szufladzie, skrót |
| Scalanie trade'ów w journalu | „Merge Journal Trades” (scale-in/out jako jeden pomysł) | DOK [F31] | niepotrzebne: dokładki to od razu jeden trade |

## Zachowanie UI

### A. Panel zleceń przy otwartej pozycji
- Kup/Sprzedaj dostają podpis trybu (pod ceną, 12 px):
  - ten sam kierunek: `Dołóż 2`;
  - przeciwny, mniejsza ilość: `Zmniejsz 2 z 5`;
  - równa ilość: `Zamknij 5`;
  - większa: `Odwróć: zamknie 5, Short 2`.
- Kolor przycisku bez zmian (strona rynku).
- Ilość: jak dla wejścia (ręczna albo z ryzyka sesji). Przycisk przeciwny do pozycji liczy ilość od SL panelu (jak nowe wejście). Ta ilość nettinguje pozycję: mniejsza od otwartej zmniejsza, równa zamyka, większa zamyka i otwiera przeciwną stronę o różnicę; pełne odwrócenie o wielkość z ryzyka daje „Odwróć” (decyzja sesji głównej 2.11.2026, runda 2 przeglądu), nigdy od SL pozycji; bez SL panelu „Wpisz SL albo wielkość”. Dla dokładki z ryzyka: `sizeFromRisk(ryzyko sesji, last, SL pozycji)`; bez SL pozycji z SL panelu; bez obu „Wpisz SL albo wielkość”.
- SL/TP z panelu przy dokładce **nie zmieniają** SL/TP pozycji (służą tylko do wielkości, gdy pozycja nie ma SL). Podgląd mówi to wprost: `Dołóż 2 · ryzyko teraz −800 $ → −1 600 $ · SL pozycji bez zmian`.
- Zlecenie limit/stop w tym samym kierunku przy otwartej pozycji = oczekująca dokładka (`intent: 'add'`). Plakietka: `Dołóż limit 2 @ 18 270,00 · −400 $` (ryzyko porcji do SL pozycji). Przeciąganie jak dziś.
- Limit/stop w przeciwnym kierunku przy otwartej pozycji: odrzucone (`opposite-pending`), komunikat „Przy otwartej pozycji zamknięcie zaplanuj przez TP albo zamknij część.”. Zlecenia oczekujące złożone przy braku pozycji po obu stronach (np. dwa stopy na wybicie) działają jak dziś.
- Bez potwierdzeń (FX Replay dokłada od razu). Przytrzymany klawisz nie mnoży zleceń (jak dziś: `ev.repeat` pomijany).
- „Wejdź według rysunku” przy otwartej pozycji: dalej zablokowane z powodem (decyzja gustu).

### B. Odwróć
- Gdzie: przycisk „Odwróć” w panelu × (pod przyciskami części), w szufladzie (wiersz pozycji), skrót domyślny `R`. Nowa akcja `reverse` w `DEFAULT_SKROTY`. Wolny klawisz sprawdza `collisions`. Zapis ustawień sprzed 1.7 dostaje skrót tylko, gdy jest wolny (reguła z J i M).
- Działanie (market, po `last.price`, jedna chwila):
  1. zamknięcie całej otwartej ilości z powodem `reverse`;
  2. anulowanie oczekujących dokładek starego kierunku;
  3. nowa pozycja przeciwna o tej samej ilości.
- SL/TP nowej pozycji: z aktywnego presetu (po 1.7-3), inaczej z pamięci panelu (pkt od nowego wejścia), inaczej bez SL i TP (R „—”, przyciski +SL/+TP).
- Wynik: **dwa trade'y**. Zamknięty idzie od razu do Notion i dostaje szybki panel journalingu (jak każde zamknięcie). Nowy jest otwartą pozycją z `reverseOf` = id zamkniętego.
- Komunikat `aria-live`: „Odwrócono: Long 3 zamknięty +240 $, Short 3 otwarty”.

### C. Wykres i szuflada
- Linia wejścia i plakietka pokazują **średnią** (`avg`) i otwartą ilość: `LONG 5 · +520 $ · +0,80R`.
- Znaczniki wejść i wyjść otwartej pozycji jako małe strzałki na świecach (markery serii LWC): ▲ wejście/dokładka, ▼ wyjście częściowe, w kolorze kierunku. `title` z ceną i ilością.
- Szuflada: kolumna „Ilość” `5/7` (otwarta / weszło), kolumna „Wejście” `śr. 18 290,25 (3)`. Rozwinięcie wiersza (strzałka) pokazuje listę porcji i wyjść: czas, cena, ilość, powód.
- Historia i okno Journal: fakty trade'a z tabelą wejść i wyjść (czas NY, cena, ilość, powód, wynik porcji). W Historii przy trade'ach odwróconych odnośnik „← t5”.

## Krawędzie (każda ma test)

1. Dokładka przy postawionym SL: `slRef` = SL, `rUsd` rośnie o `q·|p − SL|·MULT`. R trade'a = wynik brutto / `rUsd`.
2. Dokładka przed jakimkolwiek SL: obie porcje `slRef = null`, R „—”. Pierwszy SL wpisuje się do obu (P5).
3. Dokładka po usunięciu SL (P6): `slRef = slLast`. R liczony, „ryzyko teraz” = „bez SL”.
4. Dokładka po wyjściu częściowym:
   - `avg` metodą średniego kosztu (przykład w teście: 2@100, wyjście 1@110, dokładka 1@120 → `avg` 110, `entryPrice` trade'a = 106,67);
   - niezmiennik Σ `exit.qty·basis` = Σ `fill.qty·price`;
   - `pnl` = (średnia wyjść − średnia wejść)·Q·MULT.
5. Średnia poza tickiem (100,25 + 100,50): BE zaokrągla w stronę zysku (Long → 100,50). Gdy bieżąca cena leży między średnią a tym poziomem, BE jest nieaktywne z podpowiedzią.
6. Przeciwne market mniejsze (Sprzedaj 2 przy Long 5): wyjście `partial` 2 po `basis = avg`, pozycja 3.
7. Przeciwne market równe: zamknięcie `manual`, trade, brak nowej pozycji.
8. Przeciwne market większe (Sprzedaj 7 przy Long 5): zamknięcie 5 (`reverse`), Short 2 z SL/TP z panelu (jak nowe wejście), dwa zdarzenia w jednym zapisie sesji.
9. „Odwróć” przy 1 kontrakcie: Short 1. Przy otwartych oczekujących dokładkach: anulowane z powodem `reverse`.
10. Oczekująca dokładka dotknięta w świecy, która dotyka też SL: najpierw dokładka, potem SL zamyka całość (najgorszy przypadek, §4 modelu). TP w tej świecy nie działa.
11. Pozycja zamknięta przez SL przy oczekującej dokładce: dokładka anulowana (`position-closed`), komunikat.
12. Dwa oczekujące wejścia Long i Short bez pozycji: wypełnienie Longu anuluje Short (jak dziś). Drugie oczekujące Long zostaje i staje się dokładką (zmiana zachowania, decyzja gustu, opis w CHANGELOG).
13. Partial „od pierwotnej” przy dokładkach: podstawa = Σ porcji (`qty`).
14. Prowizja liczona od Σ porcji (round turn za kontrakt), także przy odwróceniu (oba trade'y płacą swoją).
15. MAE/MFE z dokładkami: definicja w $ (§3.6 modelu). Test na ręcznym strumieniu z wartościami policzonymi na papierze.
16. Kursor cofnięty (tryb przeglądania do pakietu 6): dokładki i odwrócenie zablokowane jak inne zlecenia (`rewound`).
17. NQ i MNQ: dokładka MNQ przy pozycji NQ to osobna pozycja MNQ (instrumenty zleceń osobne, jak dziś).

## Zmiany modelu danych i migracja

- Żadnych nowych pól (wprowadził je 1.7-1). Zaczynają być używane: `fills` > 1, `intent: 'add'`, `reverseOf`, powód `reverse`.
- `placeOrder` (§4 modelu): ten sam kierunek → dokładka; przeciwny market → netting; przeciwny limit/stop przy pozycji → `opposite-pending`.
- `openPosition` przy wypełnieniu anuluje tylko przeciwne oczekujące wejścia.
- Nowe `reversePosition(book, inst, last, { sl, tps })` → `{ book, events: [exit…, closed, filled] }`.
- `advance` z dokładkami (kolejność §4 modelu).
- `account()` i `openPL()` na `avg` i `rUsd` (1.7-1 już liczy z `avg`, tu test na wielu porcjach).
- Sesje 1.6.x: bez dodatkowej migracji. Pozycje 1.6 mają jedną porcję po §6.1.

## Notion

- Jedna strona na pozycję (marker `[sesja/tXX]`, idempotencja bez zmian).
- `entryPrice` = średnia ważona wszystkich porcji, `exitPrice` = średnia wyjść, `pnl` netto łączny, `r` z `rUsd`, `sl` = pierwszy SL, MAE/MFE nowe.
- Liczba porcji i kontraktów nie idzie (brak pól, pytanie P-N1 w `00-przeglad.md`).
- Odwrócenie: trade zamknięty wysyłany od razu, nowy po swoim zamknięciu. Nazwa strony jak dziś (`Backtest NQ Short 2024-03-11`). Odnośnik „odwrócenie t5” nie idzie do Notion (brak pola, notatka należy do użytkownika).

## Pliki

- Zmień:
  - `public/js/bt-wypelnienia.js`: `placeOrder`, `openPosition`, `advance`, `reversePosition`, kody odrzuceń;
  - `public/js/bt-zlecenia.js`: tryby przycisków, podgląd dokładki, `reverse`, blokady;
  - `public/js/bt-czas.js`: `DEFAULT_SKROTY.reverse`, `sanitizeBt`;
  - `public/js/ustawienia.js`: wiersz skrótu „Odwróć”;
  - `public/js/bt-wykres.js`: markery porcji, plakietka dokładki;
  - `public/js/bt-szuflada.js`: ilość `5/7`, rozwinięcie porcji, „Odwróć”;
  - `public/js/bt-replay.js`: obsługa zdarzeń odwrócenia w jednym zapisie, klawisz;
  - `public/js/bt-journal.js`: `toTrade` z `fills` i `reverseOf`;
  - `public/js/bt-journal-okno.js`: tabela wejść i wyjść;
  - `public/i18n/en.json`;
  - `docs/plany/backtest/00-wspolne.md`;
  - `postep.md`.
- Utwórz:
  - `testy/backtest-172-silnik.mjs`;
  - `testy/backtest-172-strona.mjs`;
  - `testy/backtest-172.html` (`?part=dokladka|netting|odwroc|szuflada|375`).

## Testy napisane najpierw (ślad → `backtest-wyniki/172-czerwone.txt`)

Node (`backtest-172: …`):
- `dokładka market: średni koszt, qty, openQty, rUsd`
- `dokładka po wyjściu częściowym: avg 110, entryPrice trade'a 106,67, niezmiennik kosztu`
- `pnl = (średnia wyjść − średnia wejść)·Q·MULT dla 200 losowych ciągów wejść i wyjść` (test własności, ziarno stałe)
- `dokładka przed SL: R null, pierwszy SL ustawia slRef obu porcji`
- `dokładka po usunięciu SL używa slLast`
- `BE przy średniej poza tickiem zaokrągla w stronę zysku`
- `netting: mniejsze → partial, równe → manual, większe → reverse + nowa pozycja`
- `reversePosition: dwa trade'y, anulowane dokładki, SL/TP nowej z argumentu`
- `oczekująca dokładka i SL w jednej świecy: dokładka, potem SL; TP nie w tej świecy`
- `pełne zamknięcie anuluje oczekujące dokładki`
- `wypełnienie wejścia anuluje tylko przeciwne oczekujące wejścia`
- `przeciwny limit przy pozycji: opposite-pending`
- `MAE/MFE z dokładkami w $ / rUsd (wartości z papieru); jedna porcja = jak 1.6`
- `prowizja od sumy porcji; konto: saldo, dziś i sesja z dokładkami`
- `tradeInput: entryPrice = średnia porcji, exitPrice = średnia wyjść`

Strona:
- `Kup przy Longu: podpis „Dołóż 2”, podgląd ryzyka teraz, po kliknięciu LONG 5 ze średnią`
- `Sprzedaj większe od pozycji: podpis „Odwróć: zamknie 5, Short 2”, dwa wyniki`
- `Odwróć z panelu ×, szuflady i skrótu R; kolizja skrótu wykrywana w Ustawieniach`
- `oczekująca dokładka: plakietka „Dołóż limit”, przeciąganie, wypełnienie zmienia średnią`
- `szuflada: 5/7, rozwinięcie porcji; Journal: tabela wejść i wyjść; Historia: odnośnik odwrócenia`
- `markery porcji na świecach`
- `375: podpisy trybu bez łamania, bez poziomego przewijania`

e2e: scenariusz „wejście 2, dokładka 2 limit, wyjście częściowe 2, dokładka 1 market, BE, zamknięcie” na kopii świec. Atrapa Notion dostaje jeden trade ze średnimi i `pnl` zgodnym z niezmiennikiem. Odtwarzanie 100× z markerami: ≤ 1% klatek > 34 ms i żadna > 100 ms (świadome odstępstwo od „0 klatek”: konwencja pakietu 1 §9, decyzja sesji głównej 2.11.2026).

Testy zastąpione: B2 `jedna pozycja na instrument` (druga pozycja odrzucana, wypełnienie anuluje drugie wejście NQ), C2/L sprawdzenia `position-open` w panelu, L „zlecenie oczekujące przy pozycji odrzucane” (rozbieżność L).

## Kryteria odbioru

- `backtest-172:` zielone, pełny przebieg zielony, e2e zielone.
- Test własności na 200 ciągach bez rozjazdu > 0,01 $.
- Zrzuty: pozycja z 3 porcjami (wykres z markerami, szuflada rozwinięta), panel w trybie „Odwróć”, Journal z tabelą porcji. Onyx/Platinum × 1920/375.
- Statystyki sesji liczą pozycję z dokładkami jako jeden trade z R z `rUsd`.

## Ryzyka

- **Pomyłka kierunku przy one-click** (Sprzedaj przy Longu odwraca): podpis trybu na przycisku i komunikat po akcji. Ewentualne potwierdzenie przy odwróceniu nettingiem to pytanie w `00-przeglad.md` (gust G-2.1).
- **Statystyki R:** dokładki zmieniają znaczenie R pojedynczego trade'a (więcej ryzyka w jednym trade'zie). `rUsd` to suma ryzyk porcji, a nie ryzyko pierwszej porcji, więc trade z dokładkami nie „pompuje” R.
- **MAE/MFE nowe dla wyjść częściowych:** porównanie z 1.6 w statystykach wykonania zmienia się dla nowych trade'ów. Wypisane w CHANGELOG.
- **Złożoność `advance`:** test własności i pełna lista kolejności w świecy.

## Decyzje gustu

- Netting zawsze (bez hedgingu), przeciwne większe odwraca resztę.
- Dokładka nie zmienia SL/TP pozycji. Ilość z ryzyka sesji do SL pozycji (każda dokładka ryzykuje pełne ryzyko sesji).
- Wypełnienie wejścia anuluje tylko przeciwne oczekujące wejścia.
- Przeciwne limit/stop przy pozycji odrzucane (TP i zamknięcie części wystarczą).
- Odwrócenie = dwa trade'y z odnośnikiem `reverseOf`. Skrót domyślny `R`. SL/TP nowej pozycji z presetu albo pamięci panelu.
- Markery porcji na świecach.
- „Wejdź według rysunku” przy otwartej pozycji zablokowane.

## Kroki

- [ ] 1: testy (czerwone, ślad)
- [ ] 2: silnik: dokładki, netting, `reversePosition`, `advance`, test własności
- [ ] 3: panel, skrót, Ustawienia
- [ ] 4: wykres (markery), szuflada, Journal, Historia
- [ ] 5: pełne testy, e2e, zrzuty, `00-wspolne.md`, `postep.md`, commit lokalny
