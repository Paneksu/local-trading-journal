# Etap H2: zrzuty, ocena wyglądu, przegląd całej gałęzi

Model: **Haiku** dla zrzutów; ocena przez **`visual-reviewer`**; przegląd przez **`code-reviewer`** i **`security-auditor`** (świeże agenty, każdy osobno). Najpierw `00-wspolne.md`.

## Cel
§16: zrzuty w motywie jasnym i ciemnym przy 1, 2 i 4 wykresach z oceną wyglądu względem reszty dashboardu (anty-cel „wygląd obcego systemu”), przegląd kodu całej gałęzi przed scaleniem i audyt nowych tras zapisu. Wynik: raport z priorytetami i poprawki P1 (wznowienie autora właściwej karty przez sesję główną, nie w tym czacie).

## Przeczytaj
- `postep.md` (wpis H1: instancja, dane, usterki otwarte).
- `testy/start-test.mjs` (zmienna `TEST_CONFIG_DIR` z H1).

## Zadanie 1: zrzuty (Haiku)
- [x] Instancja z H1 (`TEST_CONFIG_DIR=R:/PROJEKTY/trading-hq-wt/backtest-dane`, port 4331, atrapa Notion). Zrzuty JPEG na `R:/PROJEKTY/trading-hq-wt/backtest-wyniki/H2/` (poza repo, nie do wydania: zawierają dane CME):
  - lista sesji; kreator z rozwiniętym filtrem; replay 1 wykres; replay 2h; replay 4; panel journalingu; „Zakończ dzień” z pytaniem; statystyki; Ustawienia → Backtest; callout w podglądzie trade'a Live.
  - każdy w Onyx i Platinum przy 1920×1080; lista sesji, kreator i statystyki dodatkowo 375 px.
  - dla porównania: zakładka Statystyki i Kalendarz dashboardu w obu motywach.
- [x] Spis zrzutów (plik, ekran, motyw, szerokość) do raportu.

## Zadanie 2: ocena wyglądu (`visual-reviewer`)
- [x] Brief dla agenta: porównaj ekrany modułu z zakładkami Statystyki i Kalendarz (te same tokeny, `.seg`, `.btn`, `.check`, popover Ustawień, przezroczyste tło wykresu); twarde blokery: kontrast AA, poziome przewijanie przy 375 px, ucięty tekst, panel journalingu zasłaniający świece przy kursorze; ocena z luką („x/10, a 10 wyglądałoby tak: …”).
- [x] Wynik: lista usterek P1/P2/P3 ze zrzutem i ekranem.

## Zadanie 3: przegląd gałęzi
- [x] `code-reviewer`: `git diff eb7e194..HEAD` (bez `docs/`), z naciskiem na: brak przyszłości (kursor), reguły wypełnień §7, idempotencję zapisu do Notion, przecieki nasłuchów i timerów przy zamykaniu ekranu, i18n, tokeny CSS (zero literałów kolorów w `bt-*.js`).
- [x] `security-auditor`: trasy `/api/backtest/*` (`guardWrite`, limity ciała, identyfikator sesji jako nazwa pliku, `Sec-Fetch-Site` przy GET), brak sekretów w `bt.sessionsCopy`. Brak kodu Databento i importu ES w module (zakup anulowany 30.10.2026): audytor potwierdza, że w nowym kodzie nie ma śladów klucza ani wywołań Databento.
- [x] Sesja główna zbiera trzy raporty, przekazuje P1 autorom kart (SendMessage) i wznawia H2 po poprawkach na ponowną ocenę tylko zmienionych ekranów.

## Gotowe, gdy
Zero usterek P1 we wszystkich trzech raportach; ocena wyglądu bez blokerów; wpis w `postep.md` z oceną i listą P2/P3 przeniesionych do „Później”.

## Nie rób
Commitów zrzutów. Poprawek kodu w tym czacie (to robią autorzy kart).
