# Etap 1.7-6: cofnięcie czasu kasuje trade'y (jak FX Replay), z archiwizacją w Notion

> **ODWOŁANY 3.11.2026, słowa użytkownika:** «wywalamy to cofniecie czasu usuwa trade, zbedne, mam usuwanie juz manualne wiec jak bede chcial to usune». Odwołuje P8 «Kasuj jak FX Replay» oraz P-6.1 i P-6.2. W 1.7.0 skok wstecz zostaje trybem przeglądania z pakietu 1.7-4 (nic po kursorze nie rysowane, P&L po hw, handel zablokowany, „Wróć do teraz”). Ograniczenie widoku (pozycja otwarta przed kursorem pokazuje dzisiejszy SL, TP i ilość) zostaje na stałe. Karta zostaje tylko jako ślad.

> Gałąź `feat/1.7-cofniecie` od `feat/1.7-kilka-tp` (po 1.7-5). Zasady: `00-wspolne.md`, `ZASADY-AGENTOW.md`. Model: `model-pozycji-1-7.md` (§1.1 `at`, §2.1 `gone`, §2.2 `hist`, §2.7 `tseq`/`cut`, §7). Wzór: research §1.4 „Bar Replay / Replay to this date”, „Krok wstecz”, §3.4. Ślad: `postep.md`, sekcja „1.7-6”. Model wykonawcy: Opus. Review: `code-reviewer` + `security-auditor` (nowe zapisy do Notion: kosz stron, przywracanie).
>
> **STOP przed startem:** pytania P-6.1 i P-6.2 z `00-przeglad.md` (kosz Notion i moment kasowania) dotyczą danych użytkownika w Notion. Agent nie zaczyna kroku 3 (zapisy do Notion), dopóki sesja główna nie poda „Słowa użytkownika: «…»”. Kroki 1–2 (czysty moduł i testy) wolno zrobić wcześniej.

## Słowa użytkownika (1.11.2026)

- P8 «Kasuj jak FX Replay»: cofnięcie kursora przed wcześniejsze trade'y (potwierdzenie z listą trade'ów) usuwa je z sesji i archiwizuje ich strony w Notion (archiwum, nie trwałe kasowanie), fragment można zagrać od nowa; jasny komunikat, że dotyczy Notion.
- P4 «Tak, ale później (Recommended)»: tryb prop poza 1.7.0. FX Replay w trybie prop wyłącza cofanie [F12], co trzeba będzie uwzględnić przy prop.

Zastępuje: decyzję 5 z `L-audyt` («Przyjmuję wszystkie», „cofnięcie czasu niczego nie kasuje”), §8 projektu („pozycje i zlecenia złożone po nowym kursorze nie są usuwane, tylko ich wykonanie wstrzymane”, „nic nie znika bez potwierdzenia” zostaje w sensie: znika tylko po potwierdzeniu), Review Focus 4 w `00-wspolne.md`, regułę B2 „zlecenia przy `cursor < hw` → `rejected` (`rewound`)” (teraz: prośba o cofnięcie).

## Przeczytaj

`model-pozycji-1-7.md` §1.1, §2, §7; research §1.4 wiersze „Krok wstecz”, „Bar Replay”, §3.4 wiersz „Krok wstecz bez kasowania”; `public/js/bt-replay.js` 195–360 (trade'y, Journal, Notion), 690–760 (`goTo`, `step`), 1000–1025 (`onReturn`); `lib/backtest-sync.mjs` (całość); `lib/backtest-store.mjs` 55–100 (`save`, `setNotion`); `lib/writes.mjs` 210–305; `lib/backup.mjs` 160–175 (wzór `in_trash` przez `notion.patch`); wpis `autoskala (3)` w `postep.md` (okno potwierdzenia, „Cofnij” w powiadomieniu).

## Cel

Kursor można cofnąć przed wcześniejsze zdarzenia i zagrać fragment od nowa. Wszystko, co stało się po nowej chwili T, znika z sesji po jednym potwierdzeniu z listą:
- trade'y;
- wejścia i wyjścia otwartej pozycji;
- zmiany SL/TP i auto-BE;
- zlecenia.

Strony skasowanych trade'ów w Notion trafiają do kosza Notion (archiwum, nie trwałe kasowanie). Pełna kopia zostaje w pliku sesji. Przez kilka sekund całość da się cofnąć.

## Jak to robi FX Replay (research)

| Element | FX Replay | Dowód | My |
|---|---|---|---|
| Bar Replay / „Replay to this date” | wybór świecy, ostrzeżenie, **cofa postęp razem z trade'ami złożonymi po tym punkcie** | DOK [F10] | to samo: prawy klik na świecy „Graj od tej świecy” + potwierdzenie z listą |
| Previous Bar | krok wstecz o timestep; (wg [F10]) też kasuje | DOK [F10] | krok wstecz to podgląd; kasowanie przy pierwszej akcji handlowej lub „Graj od tej chwili” (pytanie P-6.2) |
| Granica | nie przed datę startu sesji | DOK [F10] | to samo (`minCur`) |
| Tryb prop | cofanie wyłączone | DOK [F12] | P4: później |
| Journal / Notion | brak odpowiednika (FX Replay trzyma journal u siebie) | — | strony w koszu Notion + kopia lokalna |

## Zachowanie UI

### A. Wejście w cofnięcie
- **Krok wstecz, skok do daty wstecz** (1.7-4), przewinięcie odtwarzania wstecz: kursor idzie, wykres pokazuje przeszłość (bez zmian względem dziś). Pasek nad wykresem:

  `Przeglądasz wstecz · 10:14:35 NY · [Wróć do 10:42:13] [Graj od tej chwili]`

- **„Graj od tej chwili”**, a także każda akcja handlowa przy cofniętym kursorze otwiera potwierdzenie (§B) dla T = chwila bieżąca silnika (`effOf`). Akcje handlowe: Kup/Sprzedaj, B/S, prawy klik, „Wejdź według rysunku”, akcje pozycji, przeciąganie linii.
- **Prawy klik na świecy** (1.7-4): pozycja `Graj od tej świecy` (T = koniec tej świecy), także w trybie bieżącym.
- **Nic do skasowania** (po T nie ma żadnego zdarzenia z `at > T`): bez okna. Znak wodny wraca do T i akcja się wykonuje. Pasek znika.
- **Krok w przód / odtwarzanie przy cofniętym kursorze:** jak dziś, przesuwa podgląd. Po dojściu do `hw` pasek znika, nic nie jest kasowane.

### B. Okno potwierdzenia (rozszerzone `confirmDialog` z autoskala 3)

```
Grać od 10:14:35 NY (pon. 11.03.2024)?

Skasujesz z sesji wszystko, co stało się później:
  t7  NQ Long   +1,20R  +480 $   · w Notion
  t8  NQ Short  −1,00R  −400 $   · w Notion
  t9  ES Long   +0,40R  +100 $   · niewysłany
  Pozycja NQ wróci do stanu z 10:14:35: Long 2 @ 18 290,25, SL 18 250,00
  Zlecenia: 1 usunięte, 1 przywrócone (Kup limit 2 @ 18 270,00)

Notion: 2 strony trade'ów trafią do kosza Notion (archiwum).
Notion trzyma kosz 30 dni, potem usuwa strony na stałe. Pełna kopia
zostaje w pliku tej sesji.

                         [Anuluj]  [Skasuj 3 i graj od 10:14:35]
```
- Fokus domyślny na „Anuluj”. Przycisk kasowania w stylu `danger`.
- Lista przewijana od 8 pozycji.
- Zdanie o Notion tylko, gdy są trade'y z `notion.id` albo w trakcie wysyłki.
- Przy otwartym oknie Journal skasowanego trade'a: zdanie „Okno Journal tego trade'a zostanie zamknięte (niezapisane zmiany przepadną)”.
- Przy trwającej wysyłce do Notion: przycisk czeka („Czekam na zapis w Notion…”), potem okno odświeża stany.
- Po potwierdzeniu:
  - odtwarzanie zatrzymane;
  - stan sesji przeliczony (§C), zapisany jednym zapisem;
  - archiwizacja wysłana (§D);
  - powiadomienie `Skasowano 3 trade'y · Cofnij` (9 s, `toast` z akcją, jak usuwanie sesji). Akcja handlowa, która otworzyła okno, wykonuje się po cofnięciu.

### C. Co dokładnie się dzieje ze stanem (czysty moduł `bt-cofnij.js`)
`planCut(doc, T)` → plan do okna, `applyCut(doc, plan, now)` → nowy dokument. Reguła: zostaje każde zdarzenie z `at ≤ T`, reszta znika (model §1.1).

| Obiekt | Warunek | Wynik |
|---|---|---|
| Trade zamknięty | ostatnie zdarzenie `at ≤ T` | zostaje |
| Trade zamknięty | `fills[0].at > T` | do `cut` w całości |
| Trade zamknięty | `fills[0].at ≤ T <` ostatnie zdarzenie | do `cut` (jego strona w Notion idzie do kosza); pozycja wraca jako otwarta w stanie z T (`positionAt`), z nowym `id` pozycji; po ponownym zamknięciu dostanie nowy numer trade'a (`tseq`) |
| Otwarta pozycja | `fills[0].at > T` | znika; zlecenie, które ją otworzyło, wraca z `gone`, jeśli było złożone ≤ T |
| Otwarta pozycja | `fills[0].at ≤ T` | `positionAt(T)`: porcje, wyjścia, `log` (SL, TP, auto-BE), trafienia TP (`hit`) do T; lustro przez `derive` |
| Zlecenie oczekujące | `hist[0].at > T` | znika |
| Zlecenie oczekujące | zmiany po T | wraca do stanu z ostatniego `hist` ≤ T |
| Zlecenie z `gone` | złożone ≤ T, zniknęło po T | wraca do `orders` (stan z `hist` ≤ T) |
| Znak wodny | — | `hwi[k]` = koniec ostatniej widocznej świecy bazowej k w T, `hw` = max |
| Rysunki sesji | — | bez zmian (jak FX Replay: rysunki są osobno) |
| `tseq` | — | bez zmian (numer nigdy nie wraca) |

### D. Notion
- Każdy trade z `cut` ma `notion` w partii (`CutBatch.notion[tradeId]`, model §7):
  - `archive`: ma `notion.id` albo wysyłka mogła utworzyć stronę;
  - `none`: nigdy niewysłany, bez próby POST.
- Serwer (ta sama kolejka sesji, `POST /api/backtest/notion`) robi archiwizację **na początku i na końcu** każdego przebiegu (koniec łapie stronę utworzoną przez wysyłkę, która trwała w chwili cofnięcia):
  - `notion.id` → `PATCH /v1/pages/{id} { in_trash: true }` → `archived`. Strona już w koszu albo 404 → `archived`;
  - brak id, ale `postAt` → wyszukanie po markerze (krok 2 z E2). Znaleziona → kosz. Nieznaleziona i `now − postAt ≥ RECREATE_MS` → `none`. Inaczej czeka;
  - błąd przejściowy (`transient`): zostaje `archive` z `error`, timer ponawia (`auto` obejmuje archiwizację z błędem);
  - błąd trwały: `error`, ponawia tylko przycisk.
- Licznik w pasku: `Notion: 2 do archiwizacji` (osobno od „niezapisane”). Przycisk „Zapisz do Notion” obejmuje też archiwizację.
- **„Cofnij” (9 s):**
  - przywraca `undo` partii (księgę, trade'y, `tseq`);
  - strony z `archived` → `PATCH { in_trash: false }` → trade wraca jako `sent`;
  - strony z `archive` (jeszcze nie w koszu) → anulowanie bez żądania.
  - Po nowej akcji handlowej albo po 9 s „Cofnij” znika, a `undo` = `null` (w pliku zostaje sama kopia trade'ów).
- Statystyki z Notion pomijają strony w koszu (`data.mjs` filtruje `in_trash`), lokalne pomijają `cut` (nie ma ich w `trades`).

### E. Lista „Skasowane” (wgląd w kopię)
- W szufladzie, zakładka Historia: na dole zwijany wiersz `Skasowane cofnięciem: 3 (…)`. Rozwinięcie listuje partie (czas rzeczywisty, T, trade'y, stan Notion).
- Tylko do odczytu w 1.7.0. Przywrócenie po czasie „Cofnij” to pomysł na później (wymagałoby scalenia z nową historią).

## Krawędzie (każda ma test)

1. Cofnięcie między wejściem a wyjściem wysłanego trade'a: trade w `cut`, strona w koszu, pozycja otwarta w stanie z T (SL z `log` w T), po ponownym zamknięciu nowy trade z nowym numerem i nową stroną.
2. Cofnięcie przed wejście otwartej pozycji z limitu: pozycja znika, limit wraca do `orders`.
3. Wyjście częściowe po T: znika, `openQty` wraca.
4. SL przesunięty po T: wraca poziom z T. SL usunięty po T: wraca. Pierwszy SL postawiony po T (P5): `sl0`, `slRef` i `rUsd` wracają do `null`.
5. Auto-BE wyzwolony po T: SL wraca, `done = false`.
6. TP1 trafiony po T: `hit` czyszczony, ilość wraca.
7. Dokładka po T: porcja znika, średnia przeliczona.
8. Odwrócenie po T: trade A (zamknięty przez `reverse` po T) do `cut`, pozycja A wraca, pozycja B znika.
9. Zlecenie anulowane po T: wraca z `gone`. Zlecenie anulowane przed granicą przechowywania `gone`: nie wraca, okno mówi „1 zlecenia nie da się przywrócić”.
10. Zlecenie złożone ≤ T, przeciągnięte po T: wraca cena z T.
11. Zdarzenie silnika ze świecy zaczętej przed T, a skończonej po T (`t ≤ T < at`): kasowane.
12. Zdarzenie dokładnie w T (`at = T`): zostaje.
13. Dwa instrumenty: ES po T też kasowany (czas sesji wspólny).
14. Niewysłany trade w `cut`: `none`, bez żądań do Notion.
15. Wysyłka w trakcie cofnięcia (POST trwa): koniec przebiegu archiwizuje utworzoną stronę. Test na atrapie z opóźnionym POST.
16. Notion niedostępne: `archive` z błędem, licznik, timer ponawia, sesja działa dalej.
17. Strona usunięta ręcznie z kosza (404): `archived` bez błędu.
18. „Cofnij” w 9 s: stan bajt w bajt jak przed cofnięciem (bez `cut` i `undo`), strony wyjęte z kosza (atrapa: `in_trash: false`). Po akcji handlowej „Cofnij” nieaktywne.
19. Cofnięcie bez zdarzeń po T: bez okna, bez partii w `cut`.
20. Cofnięcie przed start sesji: przycięte do startu.
21. Trade w `cut` nie wraca na listę „Do opisania” ani do licznika Notion „niezapisane”.
22. Zapis przeglądarki nie nadpisuje `notion` partii (`store.save`). `setNotion` znajduje trade w `cut`.
23. Usuwanie sesji (autoskala 3) z partią `archive`: okno usuwania ostrzega „2 strony czekają na przeniesienie do kosza Notion” z przyciskiem „Najpierw wyślij do Notion”.
24. Rozmiar pliku: `cut` z migawkami rysunków przekracza 3 MB (limit zapisu 4 MB). Najstarsze partie tracą migawki rysunków (dane trade'a zostają), notka w liście „Skasowane”.

## Zmiany modelu danych i migracja

- Pola z modelu (§2.1 `gone`, §2.2 `hist`, §2.7 `tseq`, `cut`, `at` w zdarzeniach) zapisuje się od 1.7-1. Ten pakiet zaczyna z nich korzystać.
- Sesja 1.6.x otwarta w 1.7.0:
  - zdarzenia bez `at` dostają `at = t` przy migracji (§6.1). Dla wypełnień z silnika to początek świecy, czyli kasowanie trochę ostrzejsze, ale nigdy nie zostawia przyszłości;
  - zlecenia bez `hist` mają `hist` z chwili złożenia (zmiany sprzed 1.7 nie są znane, więc cofnięcie przed ich zmianę daje stan bieżący zlecenia, notka w oknie);
  - `gone` puste: zlecenia anulowane przed 1.7 nie wracają.
- `nextTradeId` zastąpione przez `doc.tseq` (z migracją `max + 1`).

## Pliki

- Utwórz:
  - `public/js/bt-cofnij.js` (czysty: `planCut`, `applyCut`, `undoCut`, `cutSummary`);
  - `testy/backtest-176-cofnij.mjs`;
  - `testy/backtest-176-notion.mjs`;
  - `testy/backtest-176-strona.mjs`;
  - `testy/backtest-176.html` (`?part=pasek|okno|cofnij|skasowane|375`).
- Zmień:
  - `public/js/bt-wypelnienia.js`: `positionAt`, `bookAt`, `gone`, `hist` przy każdej zmianie zlecenia;
  - `public/js/bt-replay.js`: pasek „Graj od tej chwili”, okno, `toast` z „Cofnij”, blokada przy wysyłce, zamknięcie Journala, licznik archiwizacji;
  - `public/js/bt-zlecenia.js`: przy `rewound` prośba o cofnięcie zamiast odrzucenia;
  - `public/js/bt-wykres.js`: „Graj od tej świecy” w menu prawego kliku;
  - `public/js/bt-szuflada.js`: lista „Skasowane”;
  - `public/js/bt-journal.js`: `tseq`;
  - `public/js/bt-notion.js`: stany archiwizacji, licznik;
  - `public/js/bt-widok.js`: ostrzeżenie w oknie usuwania sesji;
  - `lib/backtest-store.mjs`: `save` zachowuje `notion` w `cut`, `setNotion` szuka w `cut`, `list()`: `archivePending`;
  - `lib/backtest-sync.mjs`: kroki archiwizacji i przywracania na początku i końcu przebiegu, `auto`;
  - `lib/writes.mjs`: `backtestArchive(id)`, `backtestUnarchive(id)` przez `notion.patch` (`in_trash`);
  - `public/i18n/en.json`;
  - `docs/plany/backtest/00-wspolne.md` (Review Focus 4, interfejsy, plik sesji);
  - `docs/plany/backtest/etap-B2.md` (notka „zastąpione przez 1.7-6” przy znaku wodnym);
  - `postep.md`.

## Testy napisane najpierw (ślad → `backtest-wyniki/176-czerwone.txt`)

Node (czyste):
- `backtest-176: planCut: trade po T do cut, trade przez T wraca jako pozycja, trade przed T zostaje`
- `backtest-176: positionAt: porcje, wyjścia, SL/TP/auto-BE, trafienia TP do T`
- `backtest-176: P5 po cofnięciu: SL postawiony po T znika razem z sl0 i rUsd`
- `backtest-176: zlecenia: usunięte, przywrócone z gone, cofnięte zmiany z hist`
- `backtest-176: zdarzenie ze świecy przez T kasowane, zdarzenie w T zostaje`
- `backtest-176: odwrócenie po T`
- `backtest-176: brak zdarzeń po T → plan pusty`
- `backtest-176: undoCut przywraca dokument bajt w bajt`
- `backtest-176: tseq nie wraca; nowy trade po cofnięciu ma nowy numer`
- `backtest-176: sesja 1.6 bez at i hist: cofnięcie bez przyszłości, notka o nieznanych zmianach`
- `backtest-176: przycinanie migawek najstarszych partii powyżej 3 MB`

Node (serwer na atrapie Notion):
- `backtest-176: archiwizacja: id → kosz; już w koszu i 404 → archived`
- `backtest-176: archiwizacja strony z POST w toku (koniec przebiegu)`
- `backtest-176: brak id i postAt: wyszukanie po markerze, potem none po RECREATE_MS`
- `backtest-176: błąd przejściowy: archive z error, auto ponawia; trwały: error`
- `backtest-176: Cofnij: in_trash false, trade wraca jako sent`
- `backtest-176: store.save nie nadpisuje notion partii; setNotion w cut`
- `backtest-176: statystyki: trade w cut i strona w koszu nie liczą się`

Strona:
- `krok wstecz: pasek z „Graj od tej chwili”; Kup przy cofniętym kursorze otwiera okno`
- `okno: lista trade'ów ze stanem Notion, pozycja i zlecenia, zdanie o koszu, fokus na Anuluj`
- `potwierdzenie: stan przeliczony, toast Cofnij, akcja handlowa wykonana`
- `Cofnij w 9 s przywraca; po akcji nieaktywne`
- `prawy klik „Graj od tej świecy”`
- `bez zdarzeń po T: bez okna`
- `Historia: lista Skasowane`
- `375: okno i pasek bez poziomego przewijania`

e2e (kopia świec, atrapa Notion): 3 trade'y wysłane → cofnięcie przed drugi → 2 strony w koszu atrapy → ponowne zagranie fragmentu → nowy trade z nowym markerem → statystyki sesji = 1 stary + 1 nowy.

## Kryteria odbioru

- `backtest-176:` zielone, pełny przebieg i e2e zielone, przegląd bezpieczeństwa bez P1/P2 (zapisy do Notion tylko po stronach z markerem tej sesji).
- Żadna strona nie jest kasowana trwale (w kodzie wyłącznie `in_trash: true/false`, test sprawdza listę żądań atrapy).
- Zrzuty: pasek, okno z Notion, toast, lista „Skasowane”. Onyx/Platinum × 1920/375.
- `00-wspolne.md`: Review Focus 4 przepisany na nową zasadę z cytatem P8.

## Ryzyka

- **Utrata danych w Notion po 30 dniach kosza:** pytanie P-6.1. Kopia lokalna w `cut` łagodzi.
- **Nieoczywisty moment kasowania:** pytanie P-6.2. Pasek „Przeglądasz wstecz” i okno z listą.
- **Wyścig z wysyłką:** archiwizacja na początku i końcu przebiegu w tej samej kolejce sesji + test z opóźnionym POST.
- **Zgodność z 1.6:** zdarzenia bez `at` i zlecenia bez `hist` (krawędzie w migracji).
- **Bezpieczeństwo:** `PATCH in_trash` tylko dla `notion.id` z pliku sesji tej sesji albo stron znalezionych po markerze tej sesji (jak krok 2 E2). Nigdy po samym id z ciała żądania.

## Decyzje gustu

- Krok wstecz to podgląd; kasowanie przy „Graj od tej chwili” albo pierwszej akcji handlowej (do potwierdzenia: P-6.2).
- Bez zdarzeń po T bez okna.
- „Cofnij” przez 9 s (jak usuwanie sesji). Lista „Skasowane” tylko do odczytu.
- Rysunki sesji nie są cofane.
- Przechowywanie `gone`: 7 dni czasu replayu albo do najstarszej otwartej pozycji, najwyżej 500 wpisów.
- Przycinanie migawek rysunków najstarszych partii powyżej 3 MB.

## Kroki

- [ ] 1: testy czystego modułu (czerwone, ślad)
- [ ] 2: `bt-cofnij.js`, `positionAt`/`bookAt`, `gone`/`hist`, `tseq`
- [ ] 3: (po odpowiedzi na P-6.1 i P-6.2) serwer: archiwizacja, przywracanie, magazyn; testy na atrapie
- [ ] 4: UI: pasek, okno, toast, prawy klik, lista „Skasowane”, usuwanie sesji
- [ ] 5: pełne testy, e2e, zrzuty, `00-wspolne.md`, `etap-B2.md`, `postep.md`, commit lokalny
