# Etap 1.7-5: kilka TP z procentem wielkości (drabinka)

> Gałąź `feat/1.7-kilka-tp` od `feat/1.7-nawigacja` (po 1.7-4). Zasady: `00-wspolne.md`, `ZASADY-AGENTOW.md`. Model: `model-pozycji-1-7.md` (§2.4 `tps`, §4 `advance` krok 3, §5 Notion „ostatni cel”). Wzór: research §1.1 („Kilka TP / Add partial”), §2.4, §5.6. Ślad: `postep.md`, sekcja „1.7-5”. Model wykonawcy: Opus. Review: `code-reviewer`.

## Słowa użytkownika (1.11.2026)

- P2 «Tak, w 1.7.0 po auto-BE»: kilka TP z % wielkości; do Notion jeden trade z wynikiem łącznym (średnia cena wyjścia).

Zastępuje decyzję 3 z `L-audyt` («Przyjmuję wszystkie»: „Kilka TP z % wielkości: później”). Reguła „do Notion idzie ostatni cel” z tej samej decyzji zostaje.

## Przeczytaj

`model-pozycji-1-7.md` §2.4, §4, §5; research §1.1 wiersz „Kilka TP”, §2.4, §5.6; karta 1.7-1 §B–E (plakietki, przeciąganie, +TP) i 1.7-3 §C–D (presety).

## Cel

Pozycja i zlecenie mają do 4 poziomów TP. Każdy poziom ma procent wielkości. Ostatni nietrafiony zamyka resztę. Każdy poziom to osobna linia z plakietką `TP1 50% · 5 · +1 000 $`, przeciągana i usuwalna. Kilka TP da się ustawić w bilecie, w presecie, prawym klikiem i po wejściu („+TP”). Do Notion jeden trade: średnia cena wyjścia, łączny wynik, pole TP = ostatni cel drabinki.

## Jak to robi FX Replay (research)

| Element | FX Replay | Dowód | My |
|---|---|---|---|
| Kilka TP | „Add partial” w oknie zlecenia dodaje kolejny TP, każdy zamyka część pozycji | DOK [F2] | to samo w bilecie i po wejściu |
| % na poziom | NIEZNANE (artykuł odsyła do okna) | — | procent na poziom, ostatni = „reszta” |
| Presety | TP „Single or multiple targets” w tickach, R:R albo % | DOK [F5] | TP w pkt, tickach, R:R; do 4 poziomów |
| Kolejny TP po wejściu | NIEZNANE | — | „+TP” zawsze, dopóki poziomów < 4 |
| Przeciąganie linii częściowych TP | NIEZNANE | — | tak, jak każdą linię (1.7-1) |
| Kolejność w świecy | NIEZNANE | — | SL wygrywa z każdym TP; TP od najbliższego |

## Reguła ilości na poziom (rdzeń pakietu)

Procent poziomu oznacza **udział w otwartej części, rozdzielanej proporcjonalnie między poziomy jeszcze nietrafione**:

`ilość TPᵢ w chwili trafienia = round(openQty · pctᵢ / Σ pct nietrafionych)`, najmniej 1, najwyżej `openQty`. Ostatni nietrafiony zamyka `openQty`.

- 10 kontraktów, TP1 50%, TP2 reszta: TP1 zamyka 5, TP2 zamyka 5.
- 10 kontraktów, 33/33/34: TP1 3, TP2 `round(7·33/67) = 3`, TP3 4.
- Ręczne wyjście 6 z 10 przed TP1 (zostaje 4): TP1 2, TP2 2. Plan „połowa na TP1” trzyma się otwartej pozycji.
- Dokładka (1.7-2) do 15: TP1 zamknie 8 (`round(7,5)`), TP2 7.
- 1 kontrakt, dwa TP: TP1 zamyka 1 (całość). TP2 ma w plakietce „0 kontraktów” w `--warn` i nie działa.

Ta sama funkcja liczy ilości na plakietkach na żywo, więc użytkownik zawsze widzi, ile zamknie każdy poziom.

## Zachowanie UI

### A. Bilet (panel zleceń)
- Pole TP staje się listą: `TP1 [20] pkt  [50]%` + `+ TP` (najwyżej 4). Ostatni wiersz ma zamiast pola procentu napis „reszta”.
- Dodanie wiersza dzieli procenty po równo (zaokrąglenie do całych, reszta na ostatnim). Usunięcie wiersza oddaje jego procent ostatniemu.
- Walidacja z powodem:
  - TP rosnąco od wejścia (pole poza kolejnością podświetlone, „TP2 bliżej niż TP1”);
  - suma procentów poziomów innych niż ostatni < 100;
  - TP w R:R wymaga SL.
- Podgląd: `Cel +600 $ (TP1 +400 · TP2 +800) · R:R 1,5` (R:R ważone udziałami).
- Pamięć panelu na instrument (`thq.bt.ord.v1`): lista TP. Stary zapis z jednym TP = jeden wiersz.

### B. Po wejściu (wykres)
- Każdy poziom: linia `--profit` kreskowana, plakietka po prawej `TP1 50% · 5 · +1 000 $ · +1,00R`, przy < 640 px `TP1 +1 000 $`. Znacznik osi `TP1`, `TP2`.
- „+TP” przy plakietce wejścia widoczne, dopóki poziomów < 4 (w 1.7-1 tylko przy braku TP). Nowy poziom startuje w ręku za najdalszym TP (odległość = odstęp TP1 od wejścia). Po zatwierdzeniu procenty dzielą się po równo jak w bilecie.
- Klik na procent w plakietce (albo Enter na jej fokusie) otwiera mały edytor: `25 · 33 · 50 · 75 · [__] %` (dla ostatniego tylko informacja „reszta”).
- Przeciąganie: jak w 1.7-1. Poziom przeciągnięty za sąsiada zmienia numer (numeracja zawsze od najbliższego). Procent idzie za linią (`id` stałe).
- `×` na plakietce usuwa poziom (P6, „Cofnij” 5 s). Procent przechodzi na ostatni.
- Trafiony poziom: linia i plakietka znikają, w szufladzie i faktach Journala wpis „TP1 10:14:35 · 5 @ 18 330,00 · +1 000 $”. Komunikat `aria-live`.

### C. Prawy klik (1.7-4)
- Przy pozycji: `Dodaj TP tutaj` (gdy poziomów < 4), inaczej nieaktywne z powodem „Najwyżej 4 TP”.
- Przy zleceniu z presetu z drabinką: zlecenie dostaje całą drabinkę liczoną od ceny kliknięcia.

### D. Presety (1.7-3)
- Edytor presetu: lista TP jak w bilecie (`+ TP`, do 4, jednostka pkt/ticki/R:R, procent, ostatni „reszta”).
- Opis presetu na liście: `SL 10 · TP 1R 50% / 3R · auto BE 1R`.

### E. Szuflada i Journal
- Szuflada, kolumna TP: `18 330 (50%) · 18 370`. Klik otwiera edytor listy (cena i procent na wiersz, Enter zapisuje, pusta cena usuwa).
- Okno Journal, fakty: tabela poziomów (cena, procent, trafiony: czas, ilość, wynik) obok tabeli wejść i wyjść z 1.7-2.

## Krawędzie (każda ma test)

1. SL i TP1 w tej samej świecy: SL zamyka całość, TP1 nie.
2. TP1 i TP2 w tej samej świecy (bez SL): oba wykonują się po swoich cenach, od najbliższego, ilości wg reguły.
3. TP w świecy wejścia albo dokładki: nie działa (tylko SL), od następnej świecy normalnie.
4. Ręczne wyjście przed TP1: ilości poziomów przeliczone (przykład z reguły).
5. Dokładka po TP1 (pozycja 5 z 10 + 5): TP2 (ostatni) zamyka 10.
6. 1 kontrakt, 2 TP: TP1 zamyka całość, TP2 „0 kontraktów”. Notion `tp` = cena TP2 (ostatni cel drabinki, decyzja §5 modelu, zgodnie z decyzją 3 z `L-audyt`).
7. Usunięcie wszystkich TP: `tps` puste, Notion `tp` pusty. Usunięcie poziomu już trafionego jest niemożliwe (nie ma linii).
8. Auto-BE (1.7-3) w świecy, w której trafił TP1: TP1 wykonany, BE od następnej świecy dla reszty.
9. Poziom przeciągnięty przez cenę bieżącą: odrzucony `bad-tp`, wraca.
10. Przeciągnięcie TP2 bliżej niż TP1: numery zamieniają się, procenty idą za liniami, ostatni (najdalszy) jest „resztą”.
11. Zlecenie oczekujące z drabinką: wypełnienie kopiuje `tps` do pozycji. Przy przeciąganiu ceny zlecenia poziomy stoją w miejscu, tak jak dziś SL i TP zlecenia (decyzja gustu). Cena zlecenia przeciągnięta za TP1 jest odrzucana (`bad-tp`).
12. Sesja 1.6.x i trade'y sprzed 1.7: jeden TP = drabinka z jednym poziomem 100% (migracja §6.1 z 1.7-1).
13. Statystyki: trade z kilkoma TP to jeden trade. Powód ostatniego wyjścia `tp`, gdy zamknął go ostatni TP. Filtr „wczesne wyjście” (`manual`/`partial`) bez zmian.

## Zmiany modelu danych i migracja

- Bez nowych pól (`tps` od 1.7-1). Zaczyna działać `tps.length > 1`, `hit`, `exit.tpId`.
- Silnik:
  - `advance` krok 3 z regułą ilości;
  - `modifyPosition(…, { tps })` z walidacją (kolejność, procenty, ≤ 4);
  - `modifyOrder(…, { tps })`;
  - czysta funkcja `tpPlan(pos) → [{ id, price, pct, qty, last }]` dla plakietek i podglądu.
- Ustawienia: `Preset.tps` do 4 elementów (`sanitizeBt`).
- Pamięć panelu: lista TP.
- Lustro `tp` = cena najdalszego poziomu (także trafionego), żeby 1.6.x i Notion widziały ostatni cel.

## Notion

- Jedna strona na pozycję, bez nowych pól.
- `exitPrice` = średnia ważona wszystkich wyjść, `pnl` łączny netto, `r` z `rUsd`.
- `tp` = **ostatni cel drabinki** (najdalszy poziom w chwili zamknięcia, także trafiony). To utrzymuje decyzję 3 z `L-audyt` („do Notion idzie ostatni cel”).
- Procenty i trafienia poziomów nie idą (brak pól; pytanie P-N1).

## Pliki

- Zmień:
  - `public/js/bt-wypelnienia.js`: `advance`, `tpPlan`, walidacja `tps`, `modifyOrder`;
  - `public/js/bt-zlecenia.js`: lista TP w bilecie, podgląd, pamięć;
  - `public/js/bt-wykres.js`: linie i plakietki poziomów, edytor procentu, „+TP” do 4, numeracja;
  - `public/js/bt-szuflada.js`: kolumna TP z edytorem listy;
  - `public/js/bt-journal-okno.js`: tabela poziomów;
  - `public/js/bt-czas.js`: `sanitizeBt` (`Preset.tps`);
  - `public/js/ustawienia.js`: edytor presetu z listą TP;
  - `public/js/bt-replay.js`: zdarzenia TP częściowych, komunikaty;
  - `lib/backtest-sync.mjs`: `tradeInput` `tp` = ostatni cel;
  - `public/features.css`;
  - `public/i18n/en.json`;
  - `docs/plany/backtest/00-wspolne.md`;
  - `postep.md`.
- Utwórz:
  - `testy/backtest-175-tp.mjs`;
  - `testy/backtest-175-strona.mjs`;
  - `testy/backtest-175.html` (`?part=bilet|wykres|szuflada|preset|375`).

## Testy napisane najpierw (ślad → `backtest-wyniki/175-czerwone.txt`)

Node:
- `backtest-175: reguła ilości: 50/reszta, 33/33/34, po ręcznym wyjściu, po dokładce, 1 kontrakt`
- `backtest-175: SL wygrywa z każdym TP w świecy; TP1 i TP2 w jednej świecy po kolei`
- `backtest-175: TP nie w świecy wejścia ani dokładki`
- `backtest-175: walidacja tps: kolejność, suma procentów, limit 4, R:R bez SL`
- `backtest-175: przeciągnięcie zmienia numerację, procent idzie za id`
- `backtest-175: usunięcie poziomu oddaje procent ostatniemu`
- `backtest-175: auto BE w świecy TP1`
- `backtest-175: trade z drabinką: exitPrice średnia, pnl łączny, tp = ostatni cel, hit z at`
- `backtest-175: sanitizeBt presetów z drabinką; pamięć panelu ze starym jednym TP`
- `backtest-175: tpPlan = ilości wykonane przez advance (te same liczby na plakietce i w trade)`

Strona:
- `bilet: + TP, podział procentów, walidacja kolejności, podgląd celu i R:R`
- `wykres: plakietki TP1/TP2 z ilością, edytor procentu, przeciąganie z numeracją, × z Cofnij`
- `trafienie TP1: linia znika, komunikat, szuflada i Journal pokazują trafienie`
- `+TP po wejściu do 4; prawy klik „Dodaj TP tutaj”`
- `preset z drabinką: Kup jednym kliknięciem daje 2 poziomy`
- `375: krótkie plakietki poziomów rozsunięte, bez poziomego przewijania`

e2e: preset „TP 1R 50% / 3R” + auto-BE 1R na kopii świec. TP1, potem BE, potem wyjście. Atrapa Notion: jeden trade, `exitPrice` = średnia, `tp` = cena 3R, `pnl` zgodny z niezmiennikiem.

## Kryteria odbioru

- `backtest-175:` zielone, pełny przebieg i e2e zielone.
- Ilości na plakietkach = ilości wykonane (test `tpPlan`).
- Zrzuty: pozycja z 3 poziomami, edytor procentu, bilet z listą TP. Onyx/Platinum × 1920/375.

## Ryzyka

- **Zrozumienie procentów po ręcznym wyjściu:** reguła proporcjonalna + ilości widoczne na plakietkach na żywo.
- **Tłok plakietek przy bliskich poziomach:** rozsuwanie z 1.7-1 (≥ 18 px), krótki format przy 375.
- **Pole TP w Notion niesie jeden cel:** decyzja 3 z `L-audyt` utrzymana; pełna drabinka tylko lokalnie.

## Decyzje gustu

- Procent = udział w otwartej części rozdzielanej między nietrafione poziomy (reguła wyżej). Ostatni zawsze „reszta”.
- Najwyżej 4 poziomy. Nowy poziom dzieli procenty po równo.
- Numeracja od najbliższego, procent idzie za linią.
- Poziomy zlecenia oczekującego stoją w miejscu przy przeciąganiu ceny zlecenia (jak SL/TP zlecenia dziś).
- Auto-BE „po TP1” jako jednostka progu: nie w 1.7.0 (pomysł na później).

## Kroki

- [ ] 1: testy (czerwone, ślad)
- [ ] 2: silnik: reguła ilości, `tpPlan`, walidacja, `advance`
- [ ] 3: bilet i pamięć, presety
- [ ] 4: wykres (poziomy, edytor procentu, +TP), szuflada, Journal, prawy klik
- [ ] 5: Notion `tp`, pełne testy, e2e, zrzuty, `00-wspolne.md`, `postep.md`, commit lokalny
