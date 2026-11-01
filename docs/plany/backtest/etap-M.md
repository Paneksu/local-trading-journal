# Etap M: funkcjonalny i dopracowany design modułu Backtest

> Gałąź `feat/backtest-ciagly` (po L, 69eb694). Zasady: `00-wspolne.md`. Ślad i decyzje: `postep.md`, sekcja „M”. Zrzuty: `R:/PROJEKTY/trading-hq-wt/backtest-wyniki/M/przed/` i `M/po/` (spis `M/spis.md`), pomiar układu `M/pomiar-{przed,po}.json`.

## Słowa użytkownika (31.10.2026)

- «dopracuj takze ui calego modulu backtestingu na bardziej pasujacego do naszego stylu designu plus po prostu ma byc dopracowany a nie prosty»
- «do pakietu M skup sie na funkcjonalnym designie ulatwiajacym korzyustanie z backtestingu ale ma byc ogolnie bardzo dopracowany dalej w stylu designu»

Punkt odniesienia wyglądu: zakładki Statystyki i Kalendarz, podgląd trade'a, popover Ustawień. Układ ekranu replayu: FX Replay (makieta `L-audyt-fxreplay.md` §5). Bez zmian silnika i decyzji użytkownika z `postep.md` i `L-audyt` („Decyzje użytkownika”). Popover Ustawień poza zakładką Backtest: pakiet N.

## Przegląd zadań (instancja testowa 4361, kopia świec; strona testowa `backtest-L.html` na świecach syntetycznych)

Przejście: lista sesji → kreator („M przegląd”, NQ + ES od 11.03.2024) → replay (SL/TP, Kup, odtwarzanie 300×, zamknięcie na TP, szybki panel, Journal, szuflada) → statystyki → Ustawienia → Backtest. Zrzuty przed: `M/przed/*.png` (lista, kreator, statystyki, Ustawienia, replay pusty, z pozycją, ze zleceniem, szybki panel, Journal; Onyx i Platinum, 1920 i 375).

Pomiar przed (`M/pomiar-przed.json`): 375 px z pozycją: wykres 226 px = 28% ekranu (pasek 177 px, panel zleceń 249 px, sterowanie 109 px); 1920: etykieta pozycji kończy się 72 px od osi, na świecach przy kursorze.

### Scenariusz bazowy (5 czynności)

Akcja = kliknięcie albo klawisz (bez liter wpisywanego tekstu). Czas: model KLM (kliknięcie 1,3 s ze wskazaniem, klawisz 0,28 s, decyzja 1,35 s na krok wyboru), szacunek.

| # | Czynność | Przed: akcje | Przed: czas |
|---|---|---|---|
| 1 | Pierwsze wejście po otwarciu replayu: long market, SL 10, TP 20 | klik SL, „10”, klik TP, „20”, klik Kup = 3 kl. + 4 klaw. | ok. 7,7 s |
| 2 | SL na BE | klik BE (panel albo szuflada) = 1 kl.; z klawiatury nie da się | ok. 2,6 s |
| 3 | Zamknięcie 50% | 1920: „50%” w szufladzie = 1 kl.; 375: „Rozwiń” + „50%” = 2 kl.; z klawiatury nie da się | 2,6 s / 3,9 s |
| 4 | Opis trade'a w Journalu (setup + notatka) | klik Setup, klik Journal, klik Notatka, klik Zapisz, Esc = 4 kl. + 1 klaw.; Ctrl+J z pola setupu gubi wpisany setup | ok. 8,2 s |
| 5 | Skok do następnego ważnego newsa (CPI) | klik listy, klik opcji, klik Skocz = 3 kl. (skrót „3” tylko w tekście opcji) | ok. 6,6 s |

### Tarcia (P1 blokuje wygodną pracę, P2 spowalnia, P3 wykończenie)

| # | P | Ekran | Zrzut przed | Tarcie | Propozycja |
|---|---|---|---|---|---|
| T1 | P1 | replay | `replay-onyx-1920.png` | Etykieta wyniku pozycji (i zleceń) stoi przy prawej osi, na świecach przy kursorze | Etykiety przy lewej krawędzi wykresu (jak linie zleceń TradingView), menu % pod nimi |
| T2 | P1 | replay | `start-*-1920.png` | Zegar kursora w strefie wykresu (np. 14:00 Warszawa) bez podpisu, a godzina startu i skoki są w NY | Zegar ze strefą i godziną NY obok, gdy strefa wykresu nie jest NY |
| T3 | P1 | replay | `start-*` | Po każdym otwarciu replayu Kup/Sprzedaj wyłączone, SL i TP puste („Wpisz SL albo wielkość”) | SL, TP i jednostka zapamiętane na instrument (przeglądarka), wpisane od razu |
| T4 | P1 | replay 375 | `replay-*-375.png`, `panel-*-375.png` | Wykres 28% ekranu: pasek konta w 4 wierszach, panel zleceń 249 px, sterowanie w 3 wierszach; szybki panel zakrywa cały wykres | Pasek: 2 wiersze (konto w siatce), panel zleceń zwinięty do Kup/Sprzedaj + podsumowanie parametrów (rozwijane), pozycja w jednym wierszu, sterowanie w 2 wierszach, szybki panel niższy |
| T5 | P1 | replay | wszystkie | Skróty nie są nigdzie widoczne poza listą skoków (brak `title` na Odtwarzaj, krokach, Kup, Sprzedaj, Zamknij, skoku, szybkości) | `title` i `aria-keyshortcuts` z bieżących skrótów z Ustawień |
| T6 | P2 | replay | `start-*-1920.png` | Skok = 3 kliknięcia (lista, opcja, „Skocz”) | Przycisk „Skocz: <skok>” powtarza wybrany, „▾” otwiera menu skoków ze skrótami; wybór w menu skacze od razu |
| T7 | P2 | replay | `replay-*-1920.png` | Pasek górny: konto drobnym tekstem w jednym ciągu, „Niezapisane w Notion: 0” i wyłączony „Zapisz do Notion” zawsze widoczne | Konto jak kafle dashboardu (etykieta nad wartością, Equity i Otwarty wyróżnione), stan Notion jednym zwrotem („Notion: zapisane” / „N do wysłania” + „Wyślij”) |
| T8 | P2 | replay | `replay-*-1920.png` | Panel zleceń: Kup/Sprzedaj to małe przyciski z samym kolorem tekstu; wiersz pozycji rozciągnięty (opis po lewej, akcje 1 500 px dalej) | Kup/Sprzedaj wypełnione kolorem zysku/straty z ceną; wiersz pozycji zwarty: opis, BE, część, zamknięcie obok siebie |
| T9 | P2 | replay | — | BE i zamknięcie 50% tylko myszą | Skróty `E` (BE) i `H` (połowa) w Ustawieniach → Backtest, z kolizjami jak inne |
| T10 | P2 | szybki panel, Journal | `panel-*`, `journal-*` | Szybki panel nie daje drogi z klawiatury do setupu; Ctrl+J z pola setupu gubi wpisany setup; Journal ustawia fokus na „Zamknij”, Esc w polu tylko zdejmuje fokus | Enter (poza polami) przenosi do setupu; Ctrl+J zabiera wpisany setup; Journal: fokus w Notatce (albo w Setupie, gdy pusty), Esc w polu bez zmian zamyka okno |
| T11 | P2 | kreator | `kreator-*-1920.png` | Domyślna data startu (rok temu) poza danymi (dane do 12.2024); „Ryzyko % liczone od” widoczne przy ryzyku w USD; etykieta prowizji w dwóch wierszach | Data domyślna przycięta do zakresu danych (podpowiedź „Dane: od … do …”), podstawa ryzyka tylko przy %, krótsza etykieta prowizji z podpowiedzią |
| T12 | P2 | replay | `replay-*-1920.png` | SL i TP otwartej pozycji bez kwot na wykresie (tylko strefy rysunku) | Etykiety „SL cena · −$” i „TP cena · +$” przy lewej krawędzi, jak zlecenia oczekujące |
| T13 | P3 | lista | `lista-*-1920.png` | „Do uzupełnienia” (po L „Do opisania”), podtytuł „sesje, dni i wynik w R” sprzed K | Te same nazwy co w replayu, aktualny podtytuł |
| T14 | P3 | szuflada, Journal | `replay-*`, `journal-*` | Stan opisu/wysyłki jako zaokrąglona podkładka pod samym tekstem (zasada firmy) | Kropka w kolorze stanu + tekst |
| T15 | P3 | replay | wszystkie | Brak stanów hover/active/focus na etykietach wykresu i wierszach szuflady, brak mikroruchu otwarcia menu | Stany na tokenach, krótki ruch z `prefers-reduced-motion` |

## Kroki
- [x] M0: karta (ten plik), przegląd zadań, zrzuty przed, pomiar przed
- [x] M1: testy `backtest-M: …` (czerwone przed kodem: `backtest-wyniki/M-czerwone.txt`, 14 ✗)
- [x] M2: replay: etykiety przy lewej krawędzi (T1, T12), zegar ze strefą (T2), pamięć SL/TP (T3), podpowiedzi skrótów (T5), skoki jednym kliknięciem (T6), skróty BE i połowy (T9)
- [x] M3: pasek górny i panel zleceń (T7, T8), 375 px (T4)
- [x] M4: szybki panel i Journal (T10), szuflada i stany (T14, T15)
- [x] M5: kreator i lista (T11, T13), Ustawienia → Backtest (nowe skróty)
- [x] M6: pełne testy, e2e, zrzuty po, pomiar po, tabela przed → po, `postep.md`, commit

## Pomiar po

| # | Czynność | Po: akcje | Po: czas |
|---|---|---|---|
| 1 | Pierwsze wejście po otwarciu replayu | klik Kup (SL/TP z pamięci) = 1 kl.; albo klawisz B | ok. 2,7 s (B: 1,6 s) |
| 2 | SL na BE | klik BE = 1 kl.; albo klawisz E | 2,6 s (E: 1,6 s) |
| 3 | Zamknięcie 50% | 1920: „50%” = 1 kl.; 375 i każda szerokość: klawisz H | 2,6 s / H: 1,6 s |
| 4 | Opis w Journalu | mysz: klik Setup, klik Journal (fokus w Notatce), Ctrl+Enter, Esc = 2 kl. + 2 klaw.; klawiatura: Enter, Ctrl+J, Ctrl+Enter, Esc = 4 klaw. | 4,5 s / 2,5 s |
| 5 | Skok do następnego ważnego newsa | klik ▾, klik „Następny news” = 2 kl.; albo klawisz 3 (widoczny w menu i podpowiedzi) | 4,0 s / 1,6 s |

Układ (`pomiar-po.json`): patrz `postep.md`, sekcja „M”.

## Decyzje gustu (M)
- Etykiety pozycji i zleceń przy lewej krawędzi wykresu (jak linie zleceń TradingView); w etykiecie pozycji kwota i R przed punktami (na wąskim wykresie ucinane są punkty).
- SL i TP otwartej pozycji jako etykiety tylko do odczytu z kwotą brutto (bez prowizji, jak podgląd zlecenia); przesuwa się je dalej w rysunku pozycji. SL na wejściu pokazuje „BE”.
- Pamięć SL/TP na instrument w przeglądarce (`thq.bt.ord.v1`), nie w sesji ani w Ustawieniach; jednostka „cena” nie jest zapamiętywana.
- Nowe skróty domyślne E (SL na BE) i H (połowa pozycji); zapis ustawień sprzed M dostaje je tylko, gdy są wolne (reguła z J).
- Kup/Sprzedaj wypełnione kolorem zysku i straty z ceną wykonania (tekst `--on-fg`, 7,2–8,0:1), jak bilet FX Replay.
- Notion bez zaległości: „✓ Notion: zapisane” bez przycisku; przycisk „Zapisz do Notion” tylko przy zaległościach.
- Skok: przycisk „Skocz <skok>” powtarza wybrany, menu nad przyciskiem; wybór w menu skacze od razu i zostaje domyślny.
- Enter przy szybkim panelu zatrzymuje odtwarzanie i przenosi do Setupu; Ctrl+J zabiera wpisany setup do okna.
- Journal: fokus w Notatce (gdy setup jest) albo w Setupie; Esc w polu bez niezapisanych zmian zamyka okno, ze zmianami tylko zdejmuje fokus.
- Kreator: domyślna data startu = rok przed końcem danych, gdy rok temu nie ma świec (nie przed pierwszym dniem); pod datą zakres danych; podstawa ryzyka % widoczna tylko przy ryzyku w %; prowizja z krótszą etykietą i podpowiedzią.
- Lista sesji: pod wynikiem w R kwota $ i liczba trade'ów (serwer liczy `sumUsd`).
- 375 px: konto w czterech kolumnach bez dopisków R i %, panel zleceń zwinięty do Kup/Sprzedaj i podsumowania parametrów (zamknięcie części: szuflada albo H), szybki panel bez wiersza cen i podpowiedzi.
- Zegar: czas w strefie wykresu z podpisem strefy w podpowiedzi, obok godzina NY (tylko gdy strefa wykresu nie jest NY).
- Stan opisu i wysyłki w szufladzie jako kropka w kolorze stanu i tekst (bez podkładki pod tekstem, zasada firmy).
