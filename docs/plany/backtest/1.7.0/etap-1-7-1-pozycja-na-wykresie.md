# Etap 1.7-1: pozycja na wykresie (linie, plakietki po prawej, SL/TP/BE/partial)

> Gałąź `feat/1.7-pozycja` od `fix/1.6.1` po jej scaleniu (ustala sesja główna). Zasady: `00-wspolne.md`, `ZASADY-AGENTOW.md`. Model danych: `model-pozycji-1-7.md` (ten pakiet wprowadza go w całości). Wzór: `backtest-wyniki/research-fxreplay-pelny.md` (dalej „research”). Ślad: `postep.md`, sekcja „1.7-1”. Model wykonawcy: Opus. Review po pakiecie: `code-reviewer` + `visual-reviewer` (zmiana sposobu pracy na wykresie).

## Słowa użytkownika (1.11.2026 i 31.10.2026)

- P1 «Rekomendowana opcja, plus te kwadraty oraz znaczniki – chodzi o take profit, który jest pozycją, w której wpisuję aktualny profit, PNL. To znaczy, że będą one po prawej, a nie po lewej.»
- P5 «Od pierwszego SL bez znacznika»
- P6 «Można usunąć oba»
- P7 «Bez poślizgu (Recommended)»
- 31.10.2026: BE bez SL ustawia SL na wejście tylko, gdy cena jest po stronie zysku; partial z wyborem „od pozostałej / od pierwotnej”, 25/50/75/100% albo wpisana ilość, podgląd „zamknie 5 z 10” i kwoty.

Zastępują: M T1/T12 i decyzję gustu M „etykiety przy lewej krawędzi” (teraz po prawej), decyzję gustu M „SL i TP otwartej pozycji tylko do odczytu, przesuwa się je w rysunku pozycji”, regułę B2 „SL usunąć się nie da”, regułę „R z SL przy wejściu” (B2, §7 projektu).

## Przeczytaj

`model-pozycji-1-7.md` (całość); research §1.1, §2, §4, §5.1–5.5; `public/js/bt-wypelnienia.js` (całość); `public/js/bt-wykres.js` 205–445 (linie, warstwa `.bt-tl`, przeciąganie zleceń, `narrowOffset`); `public/js/bt-zlecenia.js` 196–335; `public/js/bt-szuflada.js` 55–135; `public/js/bt-konto.js`; `lib/backtest-sync.mjs` 56–90; `public/js/bt-staty.js` 110–160.

## Cel

Otwarta pozycja obsługiwana **liniami** jak w FX Replay (research §1.1 [F1], [F2]):
- linie wejścia, SL i TP;
- przeciąganie SL/TP z odczytem $ / pkt / R na żywo;
- „+SL” i „+TP” przy linii wejścia;
- × otwiera zamknięcie części;
- BE;
- usuwanie SL i TP;
- edycja SL/TP w szufladzie.

Plakietki (wejście z bieżącym P&L, SL, TP) **po prawej przy osi ceny**, w zarezerwowanym marginesie za ostatnią świecą, więc nie zasłaniają ostatnich świec. Prostokąt rysunku pozycji zostaje tylko jako tło stref (zablokowany). R od pierwszego postawionego SL, bez SL „—”.

## Jak to robi FX Replay (research)

| Element | FX Replay | Dowód | My w 1.7-1 |
|---|---|---|---|
| Przeciąganie SL/TP | linie, na żywo $, ticki/pipsy, %; puszczenie zatwierdza z komunikatem; jedną linię da się usunąć bez ruszania drugiej | DOK [F1] | to samo + R i pkt; % pominięte (decyzja gustu) |
| Brakujący SL/TP | duchy linii; New Chart „+TP” na linii wejścia; „+SL” NIEZNANE | DOK [F1] | przyciski „+SL” i „+TP” zamiast stałych duchów (P1 «Rekomendowana opcja») |
| × na linii | otwiera „Take partials”: od reszty / od pierwotnej, 25/50/75/100%, % albo ilość | DOK [F1], [F2] | to samo + podgląd „zamknie 5 z 10 · +$…” (31.10) |
| BE ręczne | NIEZNANE (prawdopodobnie przeciągnięcie) | NIEOF [N5] | przycisk BE przy plakietce, w szufladzie, klawisz E (jest) |
| Poślizg | Off/Light/Medium/Fixed | DOK [F15] | brak (P7) |
| Miejsce etykiet | NIEZNANE dla New Chart; TV: linia pozycji z P&L | TV [N4] | po prawej przy osi (P1) |

## Zachowanie UI (dokładnie)

### A. Linie i znaczniki osi
- **Wejście:** linia ciągła 1 px w kolorze kierunku (`--profit` Long, `--loss` Short), na całą szerokość pola świec. Znacznik osi z ceną średnią (`avg`, 2 miejsca) i tytułem „LONG”/„SHORT”.
- **SL:** linia kreskowana `--loss`, tytuł „SL”. Na poziomie BE kolor `--be` i tytuł „BE”.
- **TP:** linia kreskowana `--profit`, tytuł „TP”.
- Na wykresie < 640 px znaczniki osi bez tytułów (jak final P1-N1).
- Rysunek pozycji (strefy jak TV, J) zostaje, ale `locked = true` (bez uchwytów). Ścieżka `onPositionEdit` znika. Strefy idą za liniami.

### B. Plakietki („kwadraty”) po prawej
- Prawa krawędź plakietki = lewa krawędź osi ceny − 4 px. Pionowo środek na cenie linii.
- **Wejście:** `LONG 3 · +520 $ · +1,30R`. Przy < 640 px: `LONG +1,30R`. Przy braku R: `LONG 3 · +520 $ · R —`. Kolor wartości wg znaku (`.pos`/`.neg`). Punkty w `title` i w szufladzie.
- **SL:** `SL −1 600 $ · −1,00R`. Na BE: `BE 0 $`. Po przesunięciu w zysk: `SL +200 $ · +0,13R`.
- **TP:** `TP +3 200 $ · +2,00R`.
- Kwoty na plakietkach SL/TP: wynik **brutto** przy trafieniu poziomu dla otwartej ilości (jak dziś etykiety M, bez prowizji). Plakietka wejścia: otwarty wynik **netto** (jak pasek konta, L).
- **Margines:** dopóki jest pozycja albo zlecenie oczekujące, `rightOffset` = `ceil((najszersza plakietka + 16 px) / barSpacing)`. Uogólnienie `narrowOffset` z final na każdą szerokość. Przeliczane przy zmianie `barSpacing`, rozmiaru i tekstu. Zmiana jest skokowa (najszersza wartość z ostatnich 2 s), żeby wykres nie drgał przy zmianie długości kwoty. Bez pozycji i zleceń wraca 6 świec.
- **Kolizja w pionie:** plakietki bliżej siebie niż 18 px rozsuwają się (wejście zostaje, SL/TP odsuwają się). Linie zostają na swoich cenach.
- **Poza widokiem ceny:** plakietka przyklejona do górnej albo dolnej krawędzi pola świec ze strzałką ↑/↓. Klik przewija oś ceny do poziomu (auto-skala zostaje wyłączona, jak przy przeciągnięciu osi).
- Zlecenia oczekujące: plakietki też po prawej, w tym samym marginesie, z tymi samymi tekstami co dziś (L/M) i przeciąganiem jak dziś.

### C. Przyciski przy wejściu (najechanie, fokus, dotyk)
- Najechanie albo fokus plakietki wejścia lub jej linii odsłania pod plakietką (w marginesie, bez zasłaniania świec) rząd: `[+SL]` (gdy brak SL), `[+TP]` (gdy brak TP), `[BE]`, `[×]`.
- Bez najechania widać samą plakietkę (jak FX Replay: przyciski na linii).
- Plakietki SL i TP dostają przy najechaniu `[×]` (usuń, P6).
- Dotyk (375 px): stuknięcie plakietki przełącza rząd przycisków. W szufladzie przyciski są zawsze.
- Klawiatura: plakietki to `role="group"` w kolejności Tab: wejście → przyciski → SL → TP. Każda ma `aria-label` z pełnym tekstem.

### D. Przeciąganie SL / TP
- Chwyt: plakietka SL/TP albo sama linia (pas ±4 px w polu świec). Kursor `ns-resize`.
- Linia nie łapie, gdy:
  - aktywne jest narzędzie rysowania;
  - pod wskaźnikiem jest uchwyt albo kształt rysunku (test trafienia menedżera rysunków);
  - kursor jest cofnięty (`rw`).
- W trakcie: linia, znacznik osi i plakietka idą za kursorem z ceną przyciągniętą do ticka 0,25. Plakietka pokazuje więcej niż w spoczynku: `SL 18 262,00 · −28,00 pkt · −1 680 $ · −0,70R`. Pod nią notka „ryzyko teraz: −2 400 $ → −1 680 $”. R liczone od `rUsd` (§3.3 modelu). Przy pierwszym SL (P5) R podglądu liczy się z przeciąganego poziomu.
- Puszczenie: `modifyPosition` z `last` = chwila bieżąca.
  - Sukces: krótki błysk plakietki, komunikat `aria-live` „SL 18 262,00”.
  - Odrzucenie (`bad-sl`: SL nad bieżącą ceną Long itd.): linia wraca, komunikat z `rejectText` (jak zlecenia, L).
- `Esc` w trakcie anuluje bez zmian. Strzałki ↑/↓ na fokusie plakietki o tick, Shift o 1 pkt (4 ticki), jak etykiety zleceń.
- Pozycja zamknięta w trakcie przeciągania (odtwarzanie trwa, SL trafiony): przeciąganie się kończy, komunikat „Pozycja została zamknięta”.
- Przeciąganie **nie zatrzymuje** odtwarzania (decyzja gustu). Silnik działa na zatwierdzonym SL do chwili puszczenia.
- Linii wejścia nie da się przeciągać (pozycja to fakt).

### E. +SL / +TP
- Klik: linia pojawia się „w ręku”, półprzezroczysta, na odległości startowej:
  - **SL:** pamięć panelu dla instrumentu (`thq.bt.ord.v1`, pkt). Bez pamięci 10 pkt NQ/MNQ, 2 pkt ES/MES.
  - **TP:** pamięć panelu. Bez pamięci 2× odległość SL, gdy SL jest. Bez SL: 2× domyślna odległość SL.
- Ruch myszy przesuwa linię, klik albo puszczenie zatwierdza, `Esc` anuluje. Wciśnięcie na przycisku i ruch to przeciąganie od razu (jak TV).
- Enter na przycisku (klawiatura) stawia poziom od razu na odległości startowej. Fokus przechodzi na nową plakietkę (dalej ↑/↓).
- Poziom startowy po złej stronie ceny (cena już odjechała): linia ma kolor błędu i notkę „po złej stronie ceny”. Zatwierdzenie jest odrzucane jak przy przeciąganiu.
- Pierwszy SL w pozycji ustawia `sl0`, `sl0T` i `slRef` porcji (P5): od tej chwili plakietka wejścia pokazuje R.

### F. Usunięcie SL / TP (P6)
- `[×]` na plakietce SL/TP albo pusta komórka w szufladzie + Enter.
- Bez potwierdzenia (odwracalne: +SL), komunikat „SL usunięty” z przyciskiem „Cofnij” (5 s): przywraca poprzedni poziom, jeśli jest dalej poprawny wobec ceny.
- Po usunięciu SL:
  - plakietka wejścia pokazuje „bez SL” w `--warn` zamiast ryzyka w szufladzie;
  - R zostaje od `sl0` (P5: od pierwszego SL);
  - wraca przycisk `[+SL]`;
  - BE działa wg reguły 31.10.

### G. BE
- Przycisk `[BE]` przy plakietce, w szufladzie, klawisz E. SL idzie na poziom BE (§3.4 modelu: średnia zaokrąglona w stronę zysku).
- Bez SL: ustawia SL na BE tylko po stronie zysku (31.10). Inaczej nieaktywny z podpowiedzią „Cena poniżej średniej wejścia” (Long) / „powyżej” (Short). Ta sama blokada dotyczy klawisza E: komunikat zamiast cichego odrzucenia.
- SL już na BE: przycisk nieaktywny („SL już na BE”).

### H. × → „Zamknij część” (31.10)
Panel pod plakietką wejścia (w marginesie, rozwija się w lewo nad wykres, zamyka się Esc albo kliknięciem obok):

```
Zamknij część                              (ilość otwarta 6 z 10)
od: (•) pozostałej 6   ( ) pierwotnej 10           ← tylko gdy openQty < qty
[25% · 2 z 6 · +210 $] [50% · 3 z 6 · +315 $]
[75% · 5 z 6 · +525 $] [100% · 6 · +630 $]
Ilość [ 4 ]  → zamknie 4 z 6 · +420 $   [Zamknij 4]
```
- Ilość z procentu: `round(podstawa·pct/100)`, najmniej 1, najwyżej `openQty` (dzisiejsze `pctQty`). „Od pierwotnej” liczy od `qty`. Gdy wynik przekracza `openQty`, przycisk mówi „6 z 6 (cała reszta)”.
- Kwota: otwarty wynik netto części po bieżącej cenie, `(last − avg)·s·q·MULT − prowizja·q`. Odświeżana co klatkę.
- Pole ilości: liczba całkowita 1..`openQty`. Enter zamyka, zła wartość zostaje w polu z `aria-invalid`.
- `openQty = 1`: zamiast panelu jedno „Zamknij 1 · +105 $”.
- 100% = zamknięcie całości (powód `manual`), mniej = `partial`. H (połowa) i Shift+C (całość) bez zmian. H liczy od pozostałej.

### I. Szuflada (Pozycje)
- Komórki SL i TP są przyciskami. Klik zamienia komórkę w pole ceny:
  - Enter zapisuje, Esc cofa;
  - ↑/↓ o tick, Shift o 1 pkt;
  - pusta wartość + Enter usuwa poziom (P6).
- Błąd walidacji pod polem (tekst z kropką w `--loss`, bez podkładki: zasada firmy).
- Akcje wiersza: `BE`, `Część…` (otwiera panel H przy plakietce aktywnego wykresu, a przy 375 px pod wierszem), `Zamknij`. „50%” zastąpione przez „Część…” (H zostaje skrótem).
- R „—” w kolumnie R, gdy `rUsd` brak. Kolumna „Ryzyko” (nowa, 1920 px): ryzyko teraz w $ albo „bez SL”.

## Krawędzie (każda ma test)

1. Wejście market bez SL (ręczna wielkość): R „—”, plakietka bez R, `[+SL]` widoczny. Postawienie SL: `sl0 = SL`, `sl0T = chwila`, R liczony.
2. SL postawiony 30 pkt, przesunięty na 10 pkt: R dalej od 30 pkt (`rUsd` stałe), „ryzyko teraz” maleje.
3. SL usunięty, potem postawiony ponownie na 5 pkt: R dalej od pierwszego (30 pkt). `log` ma trzy wpisy z `at`.
4. BE bez SL po stronie zysku: `sl0` = poziom BE, `rUsd = 0`, R „—” z notką „ryzyko pierwotne 0”.
5. BE bez SL po stronie straty: przycisk i klawisz E nieaktywne z podpowiedzią. Silnik zwraca `bad-sl`.
6. TP usunięty przed zamknięciem: trade ma `tp = null`, w Notion pole TP puste.
7. Zlecenie limit z SL: przy wypełnieniu `sl0 = SL zlecenia`, `sl0T = entryT` (jak dziś).
8. Przeciągnięcie SL przez bieżącą cenę: odrzucone, linia wraca.
9. Przeciągnięcie przy cofniętym kursorze: linie nie łapią, plakietki bez przycisków (handel zablokowany, jak dziś; zmieni to pakiet 6).
10. Dwa wykresy tego samego instrumentu (np. NQ 15s i NQ 1m): zmiana na jednym widoczna od razu na drugim. MNQ i NQ to osobne pozycje.
11. SL 1 tick od wejścia: plakietki rozsunięte (≥ 18 px), linie na cenach.
12. Partial „od pierwotnej” 75% przy 10/6 otwartych: 8 > 6 → „6 z 6 (cała reszta)”.
13. Pozycja 1 kontrakt: × daje samo „Zamknij 1”.
14. Margines: przy pozycji ostatnia świeca kończy się co najmniej 8 px przed lewą krawędzią najszerszej plakietki (1920 i 375, zoom ×0,5 i ×3).
15. Sesja 1.6.x z otwartą pozycją (sl0 null, sl ustawiony z rysunku): po otwarciu `sl0 = sl`, R liczony (§6.1 modelu).
16. Trade bez R w statystykach sesji: liczy się do $ i liczby trade'ów, nie do metryk R. Notka „bez R: n”.

## Zmiany modelu danych i migracja

- Cały `model-pozycji-1-7.md` §2 (`Book.v = 3`, `fills`, `exits.basis/at`, `log`, `tps` z jednym elementem, `sl0T`, `slLast`, `rUsd`, lustro przez `derive`) i §6 (migracja, kopia `kopie-1.6/`).
- Od tego pakietu silnik **zapisuje** wszystko, czego dopiero później użyją inne pakiety: `at` w każdym wejściu, wyjściu i wpisie `log`, `hist` przy złożeniu i każdej zmianie zlecenia, `gone` przy anulowaniu i wypełnieniu zlecenia, `doc.tseq`. Bez tego cofnięcie z 1.7-6 nie odtworzy sesji zagranych między 1.7-1 a 1.7-6.
- `modifyPosition` przyjmuje `sl: null` (P6) i zapisuje `log`. Pierwszy SL ustawia `sl0` (P5).
- `moveToBE(book, inst, last, { offsetTicks = 0 })` wg §3.4.
- Nowa czysta funkcja `partialPlan({ qty, openQty, base: 'open'|'orig', pct?, n?, price, avg, dir, instrument, commission })` w `bt-konto.js` → `{ n, of, usd, all }`.
- Statystyki: `closedLocal` (bt-staty.js) przyjmuje trade z `pnl` liczbowym. Metryki R filtrują `isNum(r)`. Licznik „bez R”.
- Pakiety 2, 5, 6 nie zmieniają już kształtu pliku, tylko zaczynają używać pól.

## Notion

- Bez zmiany schematu, bez migracji (schemat 6).
- Wysyłka jak dziś: po pełnym zamknięciu, marker, idempotencja.
- `tradeInput`:
  - `sl` = `sl0` (pierwszy SL, P5), pusty, gdy SL nigdy nie było;
  - `tp` = TP przy zamknięciu (z `tps`), pusty po usunięciu;
  - `be` = poziom BE, gdy SL stał na BE przy zamknięciu;
  - `r` pusty przy R „—”.
- Stare wysłane trade'y bez zmian (brak zmian w `editedAfter`).

## Pliki

- Zmień:
  - `public/js/bt-wypelnienia.js`: model, `derive`, `modifyPosition`, `moveToBE`, `tradeResult`, `excursions`, `at`/`basis`;
  - `public/js/bt-sesja.js`: `migrateBook` w `migrateSession`;
  - `public/js/bt-konto.js`: `avg`, `rUsd`, R `null`, `partialPlan`;
  - `public/js/bt-journal.js`: `toTrade` z nowymi polami;
  - `public/js/bt-wykres.js`: linie, plakietki po prawej, margines, przeciąganie linii pozycji, +SL/+TP, BE, × z panelem, rysunek pozycji zablokowany;
  - `public/js/bt-zlecenia.js`: `setLevel(k, field, price|null)`, `beFor` z blokadą i powodem, `closeQty` z podstawą, nowe kody w `rejectText`, usunięcie `onPositionEdit`;
  - `public/js/bt-szuflada.js`: edycja SL/TP, „Część…”, kolumna Ryzyko, R „—”;
  - `public/js/bt-replay.js`: nowe `onTradeAction` (`level`, `rmLevel`, `be`, `part`), `aria-live`, „Cofnij” po usunięciu;
  - `public/js/bt-journal-okno.js`: fakty: pierwszy SL, R „—”;
  - `public/js/bt-staty.js`, `public/js/bt-staty-widok.js`: trade bez R;
  - `lib/backtest-sync.mjs`: `tradeInput`;
  - `lib/backtest-store.mjs`: kopia `kopie-1.6/` przy pierwszym zapisie;
  - `public/features.css`: `.bt-tag` po prawej, rząd przycisków, panel części, stany;
  - `public/i18n/en.json`;
  - `docs/plany/backtest/00-wspolne.md`: interfejsy silnika i `Trade`;
  - `postep.md`.
- Utwórz:
  - `testy/backtest-171-model.mjs`;
  - `testy/backtest-171-strona.mjs`;
  - `testy/backtest-171.html` (sceny `?part=linie|przyciski|czesc|szuflada|375|stara`);
  - przypadek w `testy/backtest-e2e.mjs`.

## Testy napisane najpierw (ślad czerwony → `backtest-wyniki/171-czerwone.txt`)

Node (`testy/backtest-171-model.mjs`, nazwy `backtest-171: …`):
- `migracja księgi 1.6 → 3 jest idempotentna i zachowuje lustro` (`migrateSession(migrateSession(x))` deep-equal; `entryPrice`, `qty`, `openQty`, `sl`, `tp` bez zmian)
- `sesja 1.6 z otwartą pozycją: ten sam otwarty wynik i R po migracji`
- `R jak w 1.6 dla jednej porcji` (przypadki B2: częściowe i R ważone 1,5; BE 0; SL przy luce < −1)
- `wejście bez SL: R null; pierwszy SL ustawia sl0, sl0T i slRef`
- `usunięcie SL nie zmienia R; ponowne postawienie też nie; log ma at`
- `usunięcie TP: tp null, tps puste`
- `BE bez SL po stronie zysku ustawia SL; po stronie straty bad-sl`
- `BE bez SL: rUsd 0 → R null z powodem`
- `wyjście z silnika ma at = koniec świecy, a akcja użytkownika at = last.t`
- `partialPlan: od pozostałej i od pierwotnej, 25/50/75/100, ilość, przycięcie do reszty, kwota netto`
- `tradeInput: sl = pierwszy SL, pusty bez SL; tp przy zamknięciu; r pusty przy R null`
- `statystyki: trade bez R liczy się w $ i liczbie, nie w R`
- `magazyn: kopia pliku 1.6 przy pierwszym zapisie, raz`
- `niezmienność: funkcje silnika nie mutują wejścia` (rozszerzenie testu B2)

Strona (`testy/backtest-171-strona.mjs` na `backtest-171.html`, 1920 i 375, Onyx i Platinum):
- `plakietki po prawej przy osi i za ostatnią świecą` (prawa krawędź = oś − 4 ± 1 px; lewa krawędź plakietki > x ostatniej świecy + 8 px)
- `przeciąganie SL: odczyt pkt/$/R na żywo, zapis po puszczeniu, Esc anuluje, odrzucenie wraca z komunikatem`
- `+SL i +TP tylko przy braku poziomu; klik stawia linię w ręku; Enter z klawiatury`
- `× na SL i TP usuwa; Cofnij przywraca; +SL wraca`
- `BE nieaktywne po stronie straty z podpowiedzią; klawisz E daje komunikat`
- `× wejścia: od pozostałej/pierwotnej, „zamknie 5 z 10”, kwota, pole ilości`
- `szuflada: edycja SL/TP z klawiatury, pusta wartość usuwa, błąd pod polem`
- `rysunek pozycji zablokowany, strefy idą za liniami`
- `dwa wykresy jednego instrumentu widzą tę samą zmianę`
- `375: krótkie plakietki, stuknięcie pokazuje przyciski, bez poziomego przewijania`
- `sesja 1.6 otwiera się z liniami i R`

e2e (`testy/backtest-e2e.mjs`, kopia świec, NQ 1s od 10:30 NY):
- wejście bez SL → +SL → przeciągnięcie → partial 50% od pierwotnej → BE → zamknięcie; trade w atrapie Notion z `sl` = pierwszy SL;
- odtwarzanie 100× z pozycją, liniami, plakietkami i szufladą: 0 klatek > 34 ms (próg jak L/M).

Testy zastąpione (zmienione tylko przez ten pakiet, wypisać w `postep.md`):
- B2 `modyfikacja SL/TP` (SL null był odrzucany);
- C2/J przeciąganie SL/TP w rysunku pozycji;
- M strona: etykiety przy lewej krawędzi;
- final (2) P1-N1: margines tylko przy < 640 px.

## Kryteria odbioru

- Wszystkie `backtest-171:` zielone. Pełne `node testy/run.mjs` zielone. `backtest-e2e` zielone z progiem klatek.
- Zrzuty Onyx/Platinum × 1920/375: pozycja bez SL, z SL i TP, w trakcie przeciągania, panel części, szuflada w edycji. Ostatnie świece nigdzie nie są zasłonięte, brak poziomego przewijania przy 375.
- Scenariusz z M (5 czynności) nie gorszy niż po M.
- Nowe: „dodaj SL po wejściu” = 2 akcje (+SL, klik), „usuń TP” = 1 akcja.
- Sesja z 1.6.1 otwiera się, kopia w `kopie-1.6/` istnieje, otwarty wynik się zgadza.
- Kontrast plakietek i przycisków ≥ 4,5:1 w obu motywach.

## Ryzyka

- **Przeciąganie linii vs przesuwanie wykresu i rysunki:** LWC przesuwa wykres przeciągnięciem, paczka rysowania łapie kształty. Chwyt linii w fazie przechwytywania tylko w pasie ±4 px i bez aktywnego narzędzia. Test na stronie z rysunkiem pod linią.
- **Drganie marginesu** przy zmianie długości kwoty i przy zoomie. Szerokość z ostatnich 2 s, przeliczenie w `relayout`.
- **Wydajność:** plakietki to DOM aktualizowany co klatkę (dziś też). Przebudowa struktury tylko przy zmianie sygnatury, tekst i `top` co klatkę.
- **Zmiana nawyku** (rysunek pozycji przestaje być uchwytem): komunikat w CHANGELOG i podpowiedź przy pierwszym najechaniu na zablokowany rysunek („SL i TP przesuwasz liniami”).
- **Powrót do 1.6.x:** lustro i kopia `kopie-1.6/` (§6.2 modelu).

## Decyzje gustu (do wpisania w `postep.md`)

- Przyciski +SL/+TP/BE/× w rzędzie pod plakietką wejścia (w marginesie), nie w jej wnętrzu.
- Plakietki: $ i R w spoczynku, punkty i cena tylko w trakcie przeciągania i w `title`; % z FX Replay pominięty.
- Przeciąganie nie zatrzymuje odtwarzania.
- Odległość startowa +SL bez pamięci 10 pkt NQ/MNQ, 2 pkt ES/MES; +TP = 2× SL.
- Usunięcie SL/TP bez potwierdzenia, z „Cofnij” przez 5 s.
- Plakietka poza widokiem przyklejona do krawędzi ze strzałką.
- „50%” w szufladzie zastąpione przez „Część…” (H zostaje).

## Kroki

- [ ] 1: testy Node i strony (czerwone, ślad)
- [ ] 2: model w silniku + migracja + `toTrade` + konto (`derive`, P5, P6, BE 31.10, `partialPlan`)
- [ ] 3: wykres: linie, plakietki po prawej, margines, przeciąganie, +SL/+TP, ×, BE, rysunek zablokowany
- [ ] 4: szuflada, Journal (fakty), statystyki (bez R)
- [ ] 5: Notion `tradeInput`, kopia `kopie-1.6/`
- [ ] 6: pełne testy, e2e, zrzuty, `00-wspolne.md`, `postep.md`, commit lokalny
