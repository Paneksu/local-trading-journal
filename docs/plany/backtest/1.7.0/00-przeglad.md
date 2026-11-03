# Wydanie 1.7.0 modułu Backtest: przegląd planu, decyzje gustu, pytania

> **PAKIET 6 ODWOŁANY (3.11.2026).** Słowa użytkownika (3.11.2026): «wywalamy to cofniecie czasu usuwa trade, zbedne, mam usuwanie juz manualne wiec jak bede chcial to usune». Cofnięcie kasujące nie powstaje; w 1.7.0 jest tylko przeglądanie przeszłości (widok, księga nienaruszona). Wszystko poniżej, co opisuje cofnięcie do T, `cut`, `CutBatch`, `positionAt`, `bookAt`, `book.gone` i `order.hist`, jest **nieaktualne i niezaimplementowane**: nie dopisuj tego do kodu „bo model tak każe”. `book.gone` i `order.hist` nie są od odbioru 1.7.0 zapisywane (stare pliki z tymi polami wczytują się, przy zapisie pola znikają).

> Plan, nie kod. Pliki leżą poza repo (`backtest-wyniki/1.7.0-plan/`). Sesja główna przenosi je do `docs/plany/backtest/` na gałęzi wydania. Poziom dowodu całego planu: **WYWNIOSKOWANE** z kodu gałęzi `fix/1.6.1` (dbf2f51, odczyt bez przełączania i bez uruchamiania) i z researchu `research-fxreplay-pelny.md` (FX Replay tylko z dokumentacji: DOK/NIEOF, nic na żywo).

## Pliki

| Plik | Co zawiera |
|---|---|
| `model-pozycji-1-7.md` | jeden model pozycji dla pakietów 1, 2, 5 i 6: zdarzenia z czasem (`fills`, `exits`, `log`, `at`), lustro pól 1.6, średni koszt, `rUsd` (R od pierwszego SL), BE, auto-BE, MAE/MFE, Notion, migracja i zgodność wstecz, kształt cofnięcia |
| `etap-1-7-1-pozycja-na-wykresie.md` | linie SL/TP z przeciąganiem i odczytem na żywo, plakietki po prawej w marginesie za ostatnią świecą, +SL/+TP, usuwanie SL i TP, BE (reguła 31.10), × → zamknięcie części (od pozostałej / pierwotnej), edycja w szufladzie; wprowadza cały model i migrację |
| `etap-1-7-2-dokladanie-odwracanie.md` | dokładki (średnia, ryzyko łączne, `rUsd`), netting przeciwnym zleceniem, „Odwróć” (dwa trade'y), test własności niezmiennika wyniku |
| `etap-1-7-3-auto-be-presety.md` | auto-BE (cena, ticki, pkt, $, R, offset), znacznik progu, nazwane presety jako chipy pod Kup/Sprzedaj, Ustawienia → Presety |
| `etap-1-7-4-prawy-klik-nawigacja.md` | menu prawego kliku (limit/stop po cenie, market przy cenie, dokładka, SL/TP tutaj, skok do ceny), krok niezależny od interwału, skok do daty, skok do ceny (trasa serwera) |
| `etap-1-7-5-kilka-tp.md` | drabinka do 4 TP z procentami (reguła proporcjonalna do otwartej części), linie i plakietki poziomów, bilet, presety, Notion „ostatni cel” |
| `etap-1-7-6-cofniecie-kasuje.md` | **ODWOŁANY (3.11.2026, słowa użytkownika: «wywalamy to cofniecie czasu usuwa trade, zbedne, mam usuwanie juz manualne wiec jak bede chcial to usune»).** Dawniej: cofnięcie z potwierdzeniem i listą, `planCut`/`applyCut`, kosz Notion, „Cofnij” 9 s, lista „Skasowane”. Nie powstaje |

Kolejność i gałęzie: 1 → 2 → 3 → 4 → 5 → 6, każda od poprzedniej (`feat/1.7-pozycja`, `-dokladanie`, `-auto-be`, `-nawigacja`, `-kilka-tp`, `-cofniecie`). Bez równoległości w jednym worktree. Po pakiecie 5 (pakiet 6 odwołany): odbiór całości (jak H1/H2: e2e na kopii świec, zrzuty, `visual-reviewer`, `code-reviewer`, `security-auditor`), CHANGELOG 1.7.0 (PL przez `humanizer`), wersja w `package.json`. **Push, merge, tag i release tylko po „ok” użytkownika** (00-wspolne, STOP 2).

Nazwy testów: `backtest-171: …` … `backtest-176: …`, pliki `testy/backtest-17N-*.mjs` i `testy/backtest-17N.html` (pętla `backtest-*` w `run.mjs` je obejmie). Ślady czerwone: `backtest-wyniki/17N-czerwone.txt`.

## Kluczowe decyzje modelu (szczegóły: `model-pozycji-1-7.md`)

1. **Pozycja = zdarzenia z czasem + lustro.** Wejścia, wyjścia i zmiany SL/TP/auto-BE mają `at` (chwila, w której stały się znane: koniec świecy dla silnika, chwila bieżąca dla akcji). Pola z 1.6 (`entryPrice`, `qty`, `openQty`, `sl`, `tp`, `be`, `sl0`) liczy jedna funkcja `derive`. Dzięki temu (dawniej: cofnięcie z pakietu 6, odwołane) stan w chwili T daje się odtworzyć bez zgadywania, a stary kod i 1.6.x dalej czytają plik.
2. **Średni koszt.** Dokładka zmienia średnią otwartej części, wyjście jej nie zmienia i zapisuje `basis`. Niezmiennik: po zamknięciu `pnl = (średnia wyjść − średnia wejść)·Q·mnożnik`. Dlatego do Notion idą średnie, a wynik się zgadza.
3. **R = wynik brutto / `rUsd`**, gdzie `rUsd` = suma ryzyk porcji względem SL w chwili wejścia porcji. Porcje sprzed pierwszego SL dostają pierwszy SL (P5), po usunięciu SL ostatni znany (P6). Dla jednej porcji wzór jest identyczny z 1.6. Przesuwanie SL nie zmienia R. Bez SL: „—”.
4. **Jedna strona Notion na pozycję**, bez zmiany schematu (schemat 6). Cena wejścia = średnia porcji, cena wyjścia = średnia wyjść, SL = pierwszy SL, TP = ostatni cel drabinki.
5. **Odwrócenie = dwa trade'y** (zamknięcie + nowa pozycja, odnośnik `reverseOf`). Netting: przeciwne zlecenie zmniejsza, zamyka albo odwraca resztę.
6. **Drabinka TP:** procent = udział w otwartej części rozdzielanej proporcjonalnie między poziomy nietrafione, ostatni zamyka resztę.
7. **Zgodność wstecz:** sesja zostaje `v: 2`, dochodzi `book.v: 3` i `migrateBook` (czysta, idempotentna). Zamknięte trade'y 1.6 nie są przepisywane. Otwarta pozycja 1.6 z SL bez `sl0` dostaje `sl0 = sl` (P5). Przy pierwszym zapisie w 1.7.0 kopia pliku do `sessions/kopie-1.6/`.
8. ~~**Cofnięcie:** zostaje wszystko z `at ≤ T`.~~ **ODWOŁANE (pakiet 6, 3.11.2026).** Dawny opis: zostaje wszystko z `at ≤ T`. Trade przecinający T idzie do kosza, a jego pozycja wraca otwarta w stanie z T. Numer trade'a nigdy nie wraca (`tseq`), więc nowa strona nie trafi na marker strony w koszu.

## Zastąpione zasady (do wpisania w `postep.md` i `00-wspolne.md` przez pakiet, który je zmienia)

| Zasada | Gdzie | Zastępuje | Pakiet |
|---|---|---|---|
| 18a.3 „bez dokładania”, `position-open` | projekt 18a.3, B2, L dec. 4 | P3 «Dokładanie + odwracanie» | 2 |
| „R z SL przy wejściu” (`sl0` = SL zlecenia) | §7 projektu, B2 | P5 «Od pierwszego SL bez znacznika» | 1 |
| „SL usunąć się nie da” | B2 (decyzja gustu) | P6 «Można usunąć oba» | 1 |
| „Kilka TP: później” | L dec. 3 | P2 «Tak, w 1.7.0 po auto-BE» (reguła „ostatni cel do Notion” zostaje) | 5 |
| „Cofnięcie czasu niczego nie kasuje”, Review Focus 4 | §8, L dec. 5, 00-wspolne | P8 «Kasuj jak FX Replay» | 6 |
| Etykiety pozycji przy lewej krawędzi, SL/TP tylko w rysunku pozycji | M T1/T12, decyzje gustu M | P1 «… będą one po prawej, a nie po lewej.» | 1 |
| Wypełnienie wejścia anuluje wszystkie inne oczekujące wejścia | B2 [B] | decyzja gustu G-2.3 (z P3) | 2 |

## Decyzje gustu (wykonawcy wypisują je w `postep.md`, sesja główna może je odwrócić bez pytania użytkownika)

Pakiet 1:
- G-1.1: przyciski +SL/+TP/BE/× w rzędzie pod plakietką wejścia (w marginesie), widoczne po najechaniu/fokusie, na dotyku po stuknięciu;
- G-1.2: plakietki pokazują $ i R, a punkty i cenę tylko w trakcie przeciągania; % z FX Replay pominięty;
- G-1.3: przeciąganie nie zatrzymuje odtwarzania;
- G-1.4: odległość startowa +SL bez pamięci 10 pkt NQ/MNQ, 2 pkt ES/MES; +TP = 2× SL;
- G-1.5: usunięcie SL/TP bez potwierdzenia, z „Cofnij” przez 5 s;
- G-1.6: plakietka poza widokiem przyklejona do krawędzi ze strzałką;
- G-1.7: „50%” w szufladzie → „Część…” (H zostaje);
- G-1.8: kopia pliku 1.6 przy pierwszym zapisie;
- G-1.9: trade bez R liczy się w $ i liczbie trade'ów statystyk sesji, nie w metrykach R (notka „bez R: n”);
- G-1.10: margines za ostatnią świecą przy każdej szerokości, z najszerszej plakietki z 2 s.

Pakiet 2:
- G-2.1: netting zawsze (bez hedgingu); przeciwne zlecenie większe od pozycji odwraca resztę **bez potwierdzenia** (podpis na przycisku „Odwróć: zamknie 5, Short 2”). Alternatywa: potwierdzenie przy odwróceniu nettingiem;
- G-2.2: dokładka nie zmienia SL/TP pozycji; ilość z ryzyka sesji do SL pozycji (każda dokładka ryzykuje pełne ryzyko sesji);
- G-2.3: wypełnienie wejścia anuluje tylko przeciwne oczekujące wejścia (to samo kierunkiem zostaje jako dokładka);
- G-2.4: przeciwne limit/stop przy otwartej pozycji odrzucane (TP i zamknięcie części wystarczą);
- G-2.5: skrót „Odwróć” = R; SL/TP nowej pozycji z presetu albo pamięci panelu, inaczej brak;
- G-2.6: markery porcji na świecach;
- G-2.7: „Wejdź według rysunku” przy otwartej pozycji zablokowane.

Pakiet 3:
- G-3.1: jednostka „pkt” obok ceny, ticków, $ i R;
- G-3.2: SL wymagany tylko dla progu w R;
- G-3.3: znacznik progu bez przeciągania;
- G-3.4: `be` w trade/Notion tylko bez offsetu;
- G-3.5: aktywny preset wspólny dla instrumentów, wybierany chipem, bez skrótu;
- G-3.6: preset bez strony, typu, tagów i strategii;
- G-3.7: najwyżej 20 presetów, nazwa do 24 znaków.

Pakiet 4:
- G-4.1: „SL tutaj”, „TP tutaj”, „Dołóż” w menu prawego kliku;
- G-4.2: przy ilości 0 „Użyj 1 kontraktu” zamiast cichego 1;
- G-4.3: krok zapisany w sesji; lista = wykres, 1s, 5s, 15s, 1m, 5m, 15m, własny;
- G-4.4: skok do ceny z limitem 5 dni handlowych (maks. 20), wyszukiwanie na serwerze;
- G-4.5: skróty G (data) i P (cena);
- G-4.6: przytrzymanie 500 ms na dotyku, menu jako arkusz przy 375 px.

Pakiet 5:
- G-5.1: reguła ilości proporcjonalna do otwartej części; ostatni = „reszta”;
- G-5.2: najwyżej 4 TP; nowy dzieli procenty po równo;
- G-5.3: numeracja od najbliższego, procent idzie za linią;
- G-5.4: poziomy zlecenia oczekującego stoją przy przeciąganiu ceny zlecenia;
- G-5.5: auto-BE „po TP1”: nie w 1.7.0.

Pakiet 6:
- G-6.1: lista „Skasowane” tylko do odczytu;
- G-6.2: „Cofnij” 9 s;
- G-6.3: rysunki sesji nie są cofane;
- G-6.4: retencja `gone` (7 dni czasu replayu, 500 wpisów);
- G-6.5: przycinanie migawek najstarszych partii powyżej 3 MB.

Model:
- G-M1: `entryPrice` pozycji = średnia otwartej części, `entryPrice` trade'a = średnia wszystkich porcji;
- G-M2: BE zaokrąglone w stronę zysku przy średniej poza tickiem;
- G-M3: TP nie działa w świecy dokładki, dokładka przed SL w tej samej świecy (zachowawczo).

## Pytania do użytkownika (klasa trzecia: dane w Notion)

Format: co powiedział użytkownik / co rekomenduję / dlaczego / czego może mi brakować.

### P-6.1. Kosz Notion jako „archiwum” (pakiet 6, blokuje krok 3)
- **Użytkownik:** P8 «Kasuj jak FX Replay», archiwizacja stron w Notion, „archiwum, nie trwałe kasowanie”.
- **Fakt:** Notion API ma jedno „archiwum”: kosz (`in_trash`, dawniej `archived`). Strony w koszu Notion usuwa na stałe po 30 dniach. „Archiwum na zawsze” w Notion bez nowego pola nie istnieje.
- **Rekomendacja:** (a) kosz Notion + pełna kopia trade'ów w pliku sesji (`cut`) + „Cofnij” 9 s. Po 30 dniach strona znika z Notion, ale dane zostają lokalnie.
- **Alternatywy:**
  - (b) strony zostają w bazie i dostają oznaczenie, np. nową opcję pola Typ „Backtest (cofnięty)” albo nowe pole wyboru. Wymaga addytywnej migracji 007 (kopia → dry-run → „ok”, jak 006), a widoki i statystyki muszą je pomijać;
  - (c) Notion bez zmian, kasowanie tylko lokalne. Sprzeczne z P8.
- **Dlaczego (a):** zero zmian schematu, statystyki i widoki Notion od razu pomijają kosz, przywrócenie w Notion jest jednym kliknięciem przez 30 dni.
- **Może brakować:** czy użytkownik przegląda trade'y Backtest w samym Notion po miesiącach (wtedy (b)), i czy „archiwum” miało znaczyć „na zawsze w Notion”.

### P-6.2. W którym momencie cofnięcie kasuje (pakiet 6)
- **Użytkownik:** «Kasuj jak FX Replay»; „cofnięcie kursora przed wcześniejsze trade'y (potwierdzenie z listą trade'ów) usuwa je z sesji”.
- **FX Replay:** „Replay to this date” kasuje po ostrzeżeniu. Previous Bar (krok wstecz) według tej samej strony pomocy też cofa postęp [F10].
- **Rekomendacja:** krok i skok wstecz zostają podglądem (jak dziś). Kasowanie dopiero przy „Graj od tej chwili”, przy pierwszej akcji handlowej w cofniętym czasie albo przy „Graj od tej świecy” (prawy klik). Zawsze z oknem z listą. Bez zdarzeń po T bez okna.
- **Dlaczego:** okno przy każdym kroku wstecz (strzałka, przytrzymanie) przerywałoby oglądanie przeszłości, które dziś działa i jest częste (sprawdzenie, co było przed wejściem). Lista i potwierdzenie i tak są.
- **Alternatywa (dosłownie FX Replay):** pierwszy krok wstecz przed jakiekolwiek zdarzenie od razu otwiera okno. Po zgodzie kasuje, po „Anuluj” kursor wraca.
- **Może brakować:** czy użytkownik chce oglądać przeszłość bez kasowania.

### P-N1. Szczegóły pozycji w Notion (pakiety 2, 3, 5)
- **Użytkownik:** P2 «Tak, w 1.7.0 po auto-BE» i P3 «Dokładanie + odwracanie»: „do Notion jeden trade z wynikiem łącznym (średnia cena wyjścia)”, „jeden trade w Notion na pozycję”. Wcześniej P30 «niech jednak w journalu pl nie byl liczony od rysunku…» usunął pole „Kontrakty”.
- **Rekomendacja:** w 1.7.0 **bez nowych pól**. Liczba porcji, drabinka TP z trafieniami, zdarzenia auto-BE i liczba kontraktów zostają w pliku sesji i w oknie Journal. Do Notion idą średnie, łączny wynik, R, pierwszy SL i ostatni cel.
- **Alternatywa:** addytywna migracja 007 z jednym polem tekstowym „Przebieg pozycji” (np. „3 wejścia · śr. 18 290,25 · TP1 50% 10:14 · BE auto 10:16”) albo blok w treści strony.
- **Dlaczego bez:** zero zmian schematu w danych użytkownika, a pola liczbowe Notion i tak nie opiszą drabinki.
- **Może brakować:** czy użytkownik analizuje backtest poza aplikacją (w Notion) na poziomie porcji.

### P-2.2. Nowa definicja MAE/MFE dla trade'ów z dokładkami i wyjściami częściowymi (pakiet 2, zapis do pól „MAE (R)”, „MFE (R)” w Notion)
- **Dziś:** MAE/MFE = sam ruch ceny od wejścia w jednostkach ryzyka, niezależnie od wyjść częściowych.
- **Rekomendacja:** wynik pozycji w $ (zrealizowany + otwarty po low/high świecy) / `rUsd`. Dla jednej porcji bez wyjść częściowych wynik jest identyczny z dzisiejszym. Dla innych trade'ów lepiej pasuje do R (który też jest w $) i do „R zostawione przy wczesnym wyjściu” (MFE − R).
- **Dotyczy tylko nowych trade'ów**, stare wartości w Notion zostają. Statystyki wykonania będą mieszać dwie definicje dla trade'ów z wyjściami częściowymi sprzed 1.7.0.
- **Może brakować:** czy użytkownik porównuje MAE/MFE trade'ów z wyjściami częściowymi między wersjami.

## Nie robimy w 1.7.0

- Tryb prop: P4 «Tak, ale później (Recommended)».
- Poślizg: P7 «Bez poślizgu (Recommended)».
- Hedging, trailing stop, stop-limit, order flow (research §6 „Nie robić”).
- Znacznik „SL po wejściu”: P5 «… bez znacznika».

## Działanie po planie

Sesja główna:
1. zadaje użytkownikowi pytania P-6.1, P-6.2, P-N1, P-2.2 (pojedynczo, ze słowami do przyjęcia);
2. przenosi pliki na gałąź `feat/1.7-pozycja`;
3. uruchamia wykonawcę pakietu 1.

## Odpowiedzi użytkownika (1.11.2026), wiążące dla pakietów

- **P-6.1** Słowa użytkownika: «Kosz + kopia w sesji (Recommended)» → strona skasowanego trade'u idzie do kosza Notion, pełna kopia skasowanych trade'ów zostaje w pliku sesji.
- **P-6.2** Słowa użytkownika: «Od razu jak FX Replay» → okno z listą trade'ów do skasowania już przy pierwszym kroku wstecz przed zdarzenie trade'u (NIE rekomendowany wariant „podgląd do dalszej gry”). Karta etap-1-7-6 do poprawy pod tę decyzję.
- **P-N1** Słowa użytkownika: «Nie w 1.7.0 (Recommended)» → bez nowego pola w Notion.
- **P-2.2** Słowa użytkownika: «Tak, nowa definicja (Recommended)» → nowa definicja MAE/MFE dla nowych trade'ów.
- Usuwanie trade'ów ręcznie (1.6.1, gałąź fix/usuwanie-tradow): «Backtest i dziennik», «Archiwum Notion + Cofnij», «Już w 1.6.1».
- **G-2.1** Decyzja sesji głównej: odwrócenie przez netting bez okna potwierdzenia, z podpisem na przycisku („Odwróć: zamknie 5, Short 2”), jak w FX Replay; skrót klawiszowy odwrócenia tylko z tym samym podpisem w podpowiedzi.
