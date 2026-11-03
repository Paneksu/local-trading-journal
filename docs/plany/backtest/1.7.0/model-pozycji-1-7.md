# Model pozycji 1.7.0 (wspólny dla pakietów 1, 2, 5; pakiet 6 odwołany)

> **PAKIET 6 ODWOŁANY (3.11.2026).** Słowa użytkownika (3.11.2026): «wywalamy to cofniecie czasu usuwa trade, zbedne, mam usuwanie juz manualne wiec jak bede chcial to usune». Cofnięcie kasujące nie powstaje; w 1.7.0 jest tylko przeglądanie przeszłości (widok, księga nienaruszona). Wszystko poniżej, co opisuje cofnięcie do T, `cut`, `CutBatch`, `positionAt`, `bookAt`, `book.gone` i `order.hist`, jest **nieaktualne i niezaimplementowane**: nie dopisuj tego do kodu „bo model tak każe”. `book.gone` i `order.hist` nie są od odbioru 1.7.0 zapisywane (stare pliki z tymi polami wczytują się, przy zapisie pola znikają).

> Projekt, nie kod. Zasady: `docs/plany/backtest/00-wspolne.md`, `ZASADY-AGENTOW.md`. Wzór: FX Replay (`backtest-wyniki/research-fxreplay-pelny.md`, dalej „research”). Model wprowadza pakiet 1 w całości (także pola, których użyją dopiero pakiety 2, 5 i 6), żeby plik sesji migrował się tylko raz.

## Decyzje użytkownika, na których model stoi (1.11.2026, dosłownie)

Zastępują wcześniejsze zasady: 18a.3 („jedna pozycja na instrument, bez dokładania”), decyzję 3 i 4 z `L-audyt` („kilka TP później”, „bez dokładania”), decyzję 5 i §8 („cofnięcie czasu niczego nie kasuje”), regułę „R tylko z SL przy wejściu” (`sl0` = SL zlecenia) i regułę „SL nie do usunięcia” (B2: `modifyPosition` odrzuca `sl: null`).

- P1 «Rekomendowana opcja, plus te kwadraty oraz znaczniki – chodzi o take profit, który jest pozycją, w której wpisuję aktualny profit, PNL. To znaczy, że będą one po prawej, a nie po lewej.»
- P2 «Tak, w 1.7.0 po auto-BE»
- P3 «Dokładanie + odwracanie»
- P4 «Tak, ale później (Recommended)»
- P5 «Od pierwszego SL bez znacznika»
- P6 «Można usunąć oba»
- P7 «Bez poślizgu (Recommended)»
- P8 «Kasuj jak FX Replay»
- 31.10.2026: BE bez SL ustawia SL na wejście tylko, gdy cena jest po stronie zysku; partial z wyborem „od pozostałej / od pierwotnej”, 25/50/75/100% albo wpisana ilość, podgląd „zamknie 5 z 10” i kwoty.

W kodzie każda z nich jako `// [U] 1.11.2026 «…»` w osobnym wierszu (zasada 5 agentów) przy miejscu, które zmienia.

## 1. Zasada główna: pozycja = lista zdarzeń z czasem, reszta to pola pochodne

Dziś `Position` trzyma stan (`entryPrice`, `qty`, `sl`, `tp`) i listę wyjść. To nie wystarcza na:
- kilka wejść (P3): średnia cena, ryzyko łączne;
- kilka TP (P2): które poziomy już zamknęły swoją część;
- ~~cofnięcie kasujące (P8): stan pozycji w chwili T trzeba odtworzyć, a nie zgadnąć.~~ (odwołane razem z pakietem 6, 3.11.2026)

Dlatego od 1.7.0 pozycja ma **zdarzenia z czasem** (wejścia, wyjścia, zmiany SL/TP/auto-BE), a pola dzisiejsze (`entryPrice`, `qty`, `openQty`, `sl`, `tp`, `be`, `sl0`) są **lustrem liczonym** z tych zdarzeń przez jedną funkcję `derive(pos)`. Lustro zostaje w pliku, bo czyta je dzisiejszy kod (wykres, szuflada, konto, Notion) i 1.6.x przy ewentualnym powrocie do starszej wersji.

### 1.1 Czas zdarzenia: `t` i `at`

- `t`: czas „rynkowy” (jak dziś: początek świecy bazowej dla wypełnień z silnika, `last.t` dla akcji użytkownika). Zostaje dla wykresu i MAE/MFE.
- `at` (nowe): **chwila, w której zdarzenie stało się znane** = koniec świecy bazowej (`bar[0] + len`) dla zdarzeń silnika, `last.t` (chwila bieżąca silnika) dla akcji użytkownika. ~~Cofnięcie do T (pakiet 6) zostawia dokładnie zdarzenia z `at ≤ T`.~~ (pakiet 6 odwołany; `at` służy dziś do Journala, Historii i widoku przeszłości). Bez `at` wyjście z `t = bar[0] ≤ T` w świecy kończącej się po T zostałoby, choć tej świecy po cofnięciu nie widać (przyszłość).

## 2. Kształty

### 2.1 `Book` (wersja księgi 3)

```
Book = {
  v: 3,                                  // wersja księgi (sesja zostaje v: 2, patrz §6)
  orders: Order[],
  positions: { ES, NQ, MES, MNQ: Position | null },
  hw, hwi, seq,                          // jak dziś
  // gone: GoneOrder[]                  // NIEAKTUALNE (pakiet 6 odwołany): nie jest zapisywane od odbioru 1.7.0; stary plik z tym polem wczytuje się, przy zapisie pole znika
}
GoneOrder = { order: Order, at, why: 'cancelled'|'filled'|'filled-other'|'eod'|… }
```
~~NIEAKTUALNE (pakiet 6 odwołany): `gone` trzyma tylko zlecenia z `at ≥ najstarsze at` otwartej pozycji lub z ostatnich 7 dni czasu replayu (decyzja gustu; limit 500 wpisów), bo starsze nie są potrzebne do cofnięcia w praktyce. Przy cofnięciu za tę granicę zlecenie po prostu nie wraca (komunikat w podsumowaniu cofnięcia).~~

### 2.2 `Order`

```
Order = { id, instrument, side, type: 'market'|'limit'|'stop', price, qty, sl, tps, tp, placedT, fromDrawing?,
          intent: 'open'|'add',               // pakiet 2: 'add' = dokładka do otwartej pozycji tego samego kierunku
          autoBe?: AutoBe,                     // pakiet 3
          /* hist: [{ at, price, sl, tps }] */ }   // NIEAKTUALNE (pakiet 6 odwołany): nie jest zapisywane od odbioru 1.7.0
```
`tp` = lustro (cena najdalszego TP albo `null`). `tps` jak w pozycji (§2.4).

### 2.3 `Position`

```
Position = {
  id, instrument, dir: 'Long'|'Short', orderId, fromDrawing?,
  fills: Fill[],            // wejścia; fills[0] = otwarcie
  exits: Exit[],            // wyjścia (częściowe, TP, SL, ręczne, eod, reverse)
  log: LogEntry[],          // zmiany SL, TP, auto-BE (z at)
  sl, tps, autoBe,          // stan bieżący (= zwinięty log)
  sl0, sl0T, slLast,        // P5: pierwszy postawiony SL i chwila; ostatni SL, jaki kiedykolwiek był
  rUsd,                     // jednostka R w $ (§3.3), null dopóki nie było żadnego SL
  // lustro (derive):
  qty, openQty, entryPrice, entryT, avg, tp, be
}
Fill  = { t, at, price, qty, orderId, slRef }      // slRef: SL, względem którego liczy się ryzyko tej porcji (§3.3)
Exit  = { t, at, price, qty, reason: 'sl'|'tp'|'manual'|'partial'|'eod'|'reverse', basis, tpId? }   // zlecenie przeciwne (netting) daje 'partial' albo 'manual'
LogEntry = { at, k: 'sl'|'tps'|'autoBe'|'beAt'|'be-auto', v }   // czytany jest tylko 'be-auto' (Journal, gapUnderBe); pozostałe rodzaje to historia zmian z `at`
```

Lustro:
- `qty` = Σ `fills.qty` (wszystko, co weszło).
- `openQty` = `qty` − Σ `exits.qty`.
- `avg` = średni koszt otwartej części (metoda średniego kosztu, §3.1).
- `entryPrice` = `avg` (dzisiejszy kod liczy otwarty wynik z `entryPrice`, więc musi to być średnia otwartej części).
- `entryT` = `fills[0].t`.
- `tp` = cena najdalszego TP z `tps` albo `null`.
- `be` = SL stoi na poziomie BE (§3.4).

### 2.4 `tps` (jeden TP w pakiecie 1, drabinka w pakiecie 5)

```
Tp = { id: 'tp1'|'tp2'|…, price, pct, hit: null | { at, qty } }
```
- `pct`: procent wielkości pozycji (`qty`) zamykany przez ten poziom.
- Jeden TP = `[{ id: 'tp1', price, pct: 100, hit: null }]`.
- Ostatni nietrafiony TP zamyka zawsze całą resztę, niezależnie od `pct` (patrz pakiet 5).
- Trafione TP zostają w liście z `hit`, żeby Notion dostał „ostatni cel” drabinki (§5) (pakiet 6, który mógłby je odznaczyć, odwołany).

Pakiet 1.7-5 (kilka TP z procentem wielkości, [U] 1.11.2026 «Tak, w 1.7.0 po auto-BE»), czysty moduł `public/js/bt-drabinka.js`:
- Do 4 poziomów (trafione też się liczą). Kolejność listy: trafione na początku (w kolejności trafień), nietrafione od najbliższego do najdalszego; numer TP1…TP4 = miejsce w tej kolejności, `id` stały, procent idzie za `id`.
- Procent = udział w otwartej części, rozdzielany proporcjonalnie między poziomy jeszcze nietrafione: poziom zamyka `round(openQty · pct / Σ pct nietrafionych)` (połówka w górę), najmniej 1, najwyżej `openQty`; ostatni nietrafiony zamyka całą resztę. Suma ilości planu zawsze = ilość pozycji; poziom, któremu nic nie zostało (1 kontrakt na 2 poziomy), ma ilość 0, plakietka mówi „0 kontraktów” w `--warn`, a poziom nie działa. Tę samą funkcję (`tpQtyAt`, `tpPlan`) woła silnik i plakietki, więc ilość widoczna = wykonana (test własności na 300 losowych drabinach).
- Procenty: nie-ostatnie całkowite 1..98, suma < 100, ostatni = 100 − suma pozostałych (także trafionych); suma drabiny zawsze 100. Dodanie poziomu dzieli po równo (`floor`, reszta na ostatnim), usunięcie oddaje procent ostatniemu.
- Walidacja (`checkTps`, kody odrzuceń silnika): `bad-tp` (poziom po złej stronie ceny odniesienia albo nie liczba), `tps-max` (więcej niż 4), `tps-dup` (dwa poziomy na tej samej cenie), `tps-pct`. Poziom trafiony nie podlega edycji ani usunięciu.
- Kolejność w świecy (`advance` krok 3): SL wygrywa z każdym TP; TP od najbliższego, każdy po swojej cenie (także przy luce), z ilością z reguły liczoną od otwartej ilości po poprzednim; nie w świecy wejścia ani dokładki. Wyjście ma `reason: 'tp'` i `tpId`, poziom dostaje `hit = { at, qty }`; zdarzenie `exit` niesie `tp = { id, rank, n, dir }`.
- Lustro `tp` = cena najdalszego poziomu (także trafionego); zmiana drabiny ma wpis `tps` w `log` z `at` i pełnym stanem nietrafionych poziomów `[{ id, price, pct }]`, a zlecenie `hist` z `tps`.

### 2.5 `AutoBe` (pakiet 3)

```
AutoBe = { kind: 'price'|'pts'|'ticks'|'usd'|'r', value, offsetTicks: 0, done: false }
```
Próg w cenie liczy się z bieżącej pozycji przy każdej zmianie wejść (§3.5). `done` ustawia silnik po wyzwoleniu (także gdy SL był już równy albo lepszy niż BE: wtedy wpis `be-auto` z `changed: false` w `log`). `pts` = punkty od średniej w stronę zysku (dodane w 1.7-3). Offset nie może sięgać progu: poziom BE + offset leży ściśle przed ceną progu (inaczej `bad-autobe` z powodem `autobe-offset`), a przy wyzwoleniu poziom jest dodatkowo obcinany do ticka przed ceną progu.
Pole pozycji `beAt` = cena, przy której trade stał się bez ryzyka: cena progu przy wyzwoleniu, cena bieżąca przy każdym przesunięciu SL z gorszego niż BE na „BE albo lepiej” (przycisk, przeciągnięcie, szuflada); kasowane po cofnięciu SL poniżej BE i po usunięciu SL. Zmiany mają wpis `beAt` w `log` z `at`.
Reguła jest w jednej funkcji (`trackBeAt` w `bt-wypelnienia.js`), wołanej po każdej zmianie SL (`modifyPosition`) i po wypełnieniu dokładki (`addFill`): „bez ryzyka” znaczy SL na poziomie BE z aktualnej średniej albo lepiej. Dokładka z ceną ponad średnią przesuwa poziom BE, więc SL, który stał na dawnym BE, przestaje być „bez ryzyka” i `beAt` jest kasowane (z wpisem w `log` w chwili wypełnienia). Dokładka nie może uczynić trade'a bez ryzyka, bo leżąca za SL jest odrzucana (`add-beyond-sl`). Po dokładce poziom BE jest liczony od nowej średniej, a SL jest obcinany do ticka przed ceną progu (tak jak przy wyzwoleniu bez dokładki, §3.5), więc samo „BE + offset za blisko progu” nie wyłącza przesunięcia. Przesunięcie jest pomijane dopiero wtedy, gdy pod ceną progu nie mieści się sam poziom BE (bezpiecznik): wpis `be-auto` ma wtedy `changed: false, why: 'cap'`, a silnik zgłasza zdarzenie `be-auto-skipped` (komunikat aria-live i toast). Przy SL już lepszym niż BE wpis ma `why: 'sl-better'` i bez zdarzenia.

### 2.6 `Trade` (zamknięta pozycja w `session.trades`)

Wszystkie pola dzisiejsze (`00-wspolne.md`: `id, day, instrument, contract, dir, qty, entryT, entryPrice, sl0, sl, tp, be, fee, dEdited, exits, exitT, exitPrice, r, pnl, maeR, mfeR, setup, notes, journal, drawings, notion`) plus:

```
fills, log, tps, sl0T, rUsd, autoBe,
reverseOf?: tradeId, reversedTo?: tradeId     // pakiet 2: odwrócenie = dwa trade'y połączone odnośnikiem
```
Znaczenie pól dzisiejszych w trade 1.7.0:
- `entryPrice` = **średnia ważona wszystkich wejść** (Σ q·p / Σ q), a nie `avg` otwartej części (§3.1 pokazuje, że wtedy `pnl` = (średnia wyjść − średnia wejść)·Q·mnożnik).
- `exitPrice` = średnia ważona wyjść (jak dziś).
- `qty` = Σ wejść.
- `sl0` = pierwszy postawiony SL (P5).
- `sl` = SL w chwili zamknięcia (może być `null`, P6).
- `tp` = ostatni cel drabinki (§5).

### 2.7 Sesja

Nowe pola dokumentu sesji (v2 bez zmiany numeru): `tradeSeq` (w kodzie od 1.6.1, w tym planie dawniej `tseq`: najwyższy nadany numer trade'a, więc następny numer, nigdy nie używany drugi raz). ~~`cut: CutBatch[]` (pakiet 6, §7)~~ nie powstaje (pakiet 6 odwołany).

## 3. Reguły liczenia

### 3.1 Średnia cena i wynik (metoda średniego kosztu)

- Dokładka q po cenie p: `avg ← (openQty·avg + q·p) / (openQty + q)`.
- Wyjście nie zmienia `avg`. Każde wyjście zapisuje `basis = avg` z tej chwili.
- Wynik brutto wyjścia: `(price − basis)·s·qty·MULT` (s = +1 Long, −1 Short).
- `pnl` trade'a = Σ wyników brutto wyjść − prowizja·`qty` (prowizja jak w L, za kontrakt w obie strony, liczona od wszystkich wejść).
- **Niezmiennik (test):** po pełnym zamknięciu Σ `exit.qty·basis` = Σ `fill.qty·price`. Koszt wnoszony przez wejścia wychodzi w całości przez wyjścia. Stąd `pnl brutto = (exitPrice − entryPrice)·s·qty·MULT` z `entryPrice` = średnia wszystkich wejść. Dlatego do Notion idą średnie, a wynik się zgadza.
- Średnia może nie leżeć na ticku (np. 100,25 i 100,50 → 100,375). W pliku trzymamy dokładną wartość (do 6 miejsc, jak `exitPrice`). Do wyświetlania zaokrąglamy do 2 miejsc.

### 3.2 Ryzyko teraz (plakietka, szuflada, podgląd)

`ryzyko teraz $ = |avg − sl|·openQty·MULT`, gdy `sl` jest; bez SL: „bez SL” (kolor `--warn`). To jest „ryzyko łączne przy jednym SL” z P3: jeden SL chroni całą pozycję.

### 3.3 Jednostka R: `rUsd` (P5 + P3)

- Każda porcja wejścia ma `slRef`: SL, względem którego liczy się jej ryzyko.
  - Porcja wchodzi przy postawionym SL: `slRef` = ten SL.
  - Porcja wchodzi bez SL, ale wcześniej jakiś SL był (usunięty, P6): `slRef = slLast`.
  - Porcja wchodzi, zanim w pozycji był jakikolwiek SL: `slRef = null`. Pierwszy postawiony SL wpisuje się do wszystkich porcji z `slRef = null` (P5: „od pierwszego SL”).
- `rUsd = Σ fill.qty·|fill.price − fill.slRef|·MULT`. Liczy się tylko, gdy żadna porcja nie ma `slRef = null`. Inaczej `rUsd = null` i R = „—”.
- `R trade'a = Σ wyników brutto wyjść / rUsd` (z cen, bez prowizji: decyzja L/6).
- Dla jednej porcji wychodzi dokładnie dzisiejszy wzór `Σ qᵢ(exitᵢ − entry)s / (qty·|entry − sl0|)`. Test zgodności liczy stare przypadki z B2 nowym kodem.
- Przesuwanie SL po wejściu (także na BE, także dalej od wejścia) **nie zmienia** `rUsd` (jak dziś: R od `sl0`). Zmienia tylko „ryzyko teraz”.
- **P5 bez znacznika:** pozycja bez SL ma R „—” wszędzie (plakietka, szuflada, Historia, statystyki R). Po pierwszym SL R liczy się od niego i nic nie oznacza, że SL postawiono po wejściu.
- **P6:** usunięcie SL nie kasuje `sl0`, `slRef` ani `rUsd`. Ponowne postawienie SL nie zmienia R (liczy się pierwszy). Usunięcie i ponowne postawienie zapisują się w `log`.

### 3.4 BE

- Poziom BE = `avg` zaokrąglone do ticka **w stronę zysku** (Long: w górę, Short: w dół), plus `offsetTicks` (pakiet 3, domyślnie 0).
- `be = (sl === poziom BE bez offsetu)`. Przy offsecie plakietka pokazuje „BE+2t”.
- BE bez SL (31.10): przycisk ustawia SL na poziomie BE tylko wtedy, gdy cena bieżąca jest po stronie zysku względem tego poziomu (`slOk`). Inaczej przycisk jest nieaktywny i ma podpowiedź „Cena poniżej średniej wejścia” / „powyżej” dla Short. Taki SL staje się `sl0` (P5), więc `rUsd` = 0 przy jednej porcji. Wtedy R = „—” (dzielenie przez zero) i notka w szufladzie „R: ryzyko pierwotne 0”.

### 3.5 Auto-BE (pakiet 3)

Próg w cenie (Long, dla Short odwrotnie):
- `price`: `value`;
- `ticks`: `avg + value·TICK`;
- `usd`: `avg + value / (openQty·MULT)`;
- `r`: `avg + value·rUsd / (qty·MULT)`; wymaga `rUsd`. Uwaga: `qty` to suma wszystkich wejść, a nie `openQty` (zmiana 1.7-3). Przy `openQty` wyjście częściowe przy niezmiennym `rUsd` podwajałoby odległość progu (1R zamieniałoby się w 2R w cenie), a karta (krawędź 8) każe zostawić próg w R bez zmiany; dla jednego wejścia wzór daje dokładnie odległość SL, jak „Risk/reward” w FX Replay. Próg w $ liczy się od `openQty`: `avg + value / (openQty·MULT)`.
- `pts`: `avg + value`.

Próg przelicza się po każdej dokładce i każdym wyjściu częściowym. Silnik sprawdza go po SL i TP danej świecy (§4).

### 3.6 MAE i MFE (zmiana definicji dla trade'ów z dokładkami lub wyjściami częściowymi)

`MAE = min`, `MFE = max` po świecach bazowych od pierwszego wejścia do wyjścia z wyrażenia `(wynik brutto zrealizowany do tej świecy + wynik otwartej części po low/high świecy) / rUsd`. Granice świec jak dziś (`excursions`, `liveExcursions`: bez świecy w budowie, w świecy wyjścia po SL nie dalej niż cena wyjścia).

- Dla jednej porcji bez wyjść częściowych wynik jest identyczny z dzisiejszym (test zgodności).
- Z wyjściami częściowymi wynik się różni: dziś liczy się sam ruch ceny, nowa definicja liczy wynik w $ pozycji. Zapisane `maeR`/`mfeR` starych trade'ów zostają bez zmian. Decyzja gustu w `00-przeglad.md`.
- Bez `rUsd` MAE i MFE to `null` (jak dziś bez `sl0`).
- Świeca, w której poziom TP drabinki zamyka część (pakiet 1.7-5): MFE liczy część zamkniętą po cenie poziomu, a resztę do ekstremum świecy (dokładnie, bo cena musi minąć TP, zanim dojdzie do ekstremum). MAE liczy zachowawczo całą ilość sprzed trafienia, bo kolejność low/TP w świecy nie jest znana (jak „SL wygrywa”). Ujemne MAE przy trafionym TP1 nie jest więc błędem.

## 4. Silnik (`bt-wypelnienia.js`): co się zmienia

| Funkcja | 1.6 | 1.7.0 |
|---|---|---|
| `placeOrder` | otwarta pozycja → `position-open` | ten sam kierunek: dokładka (market: nowa porcja od razu; limit/stop: zlecenie `intent: 'add'`). Przeciwny kierunek, market: netting (pakiet 2, §2 karty). Przeciwny kierunek, limit/stop przy otwartej pozycji: `opposite-pending` (zastępuje je TP lub zamknięcie części) |
| wypełnienie wejścia | anuluje wszystkie inne oczekujące wejścia instrumentu | anuluje tylko oczekujące wejścia **przeciwnego** kierunku (zlecenia tego samego kierunku stają się dokładkami). Pakiet 2 |
| `modifyPosition(book, inst, { sl?, tp?, tps?, autoBe? }, last)` | `sl: null` → `bad-sl` | `sl: null` usuwa SL (P6), `tp: null` usuwa wszystkie TP, `tps` podmienia drabinkę. Każda zmiana dopisuje `log` z `at = last.t`. Pierwszy SL ustawia `sl0`, `sl0T` i `slRef` porcji (P5) |
| `moveToBE(book, inst, last, { offsetTicks })` | `modifyPosition(sl = entryPrice)` | poziom BE z §3.4; bez SL dozwolone, gdy cena po stronie zysku (31.10) |
| `closePartial(book, inst, qty, last)` | bez zmian w sygnaturze | `basis` i `at` w wyjściu |
| `reversePosition(book, inst, last, { qty?, sl?, tps? })` | brak | pakiet 2: zamknięcie z powodem `reverse` + nowa pozycja przeciwna, dwa zdarzenia `closed` i `filled` |
| `advance` | SL, potem jeden TP | kolejność w świecy z otwartą pozycją: (1) dokładki oczekujące dotknięte w tej świecy wchodzą najpierw (dla Long dokładka limit leży nad SL, więc to też kolejność najgorsza dla tradera); (2) SL: wygrywa z każdym TP w tej świecy i zamyka całą otwartą ilość razem z dokładką (§7); (3) TP od najbliższego do najdalszego, każdy zamyka swoją część, ale **nie w świecy, w której weszła dokładka** (ta sama zasada co „w świecy wejścia tylko SL”); (4) próg auto-BE: SL na BE **od następnej świecy** (w świecy wyzwolenia działa stary SL, zasada zachowawcza z researchu §5.4). Pełne zamknięcie anuluje oczekujące dokładki instrumentu (`cancelled`, `position-closed`). Bez pozycji: wejścia oczekujące jak dziś |
| `tradeResult(pos)` | jedna cena wejścia | §3.1 i §3.3; zwraca też `entryAvg`, `rUsd` |
| `excursions` | punkty / ryzyko | §3.6 |
| `derive(pos)` | brak | jedyne miejsce liczenia lustra; wołane na końcu każdej funkcji silnika |
| ~~`positionAt(pos, T)`, `bookAt(book, T)`~~ | brak | ~~pakiet 6: zwinięcie zdarzeń z `at ≤ T`~~ (odwołane, nie istnieją) |

Zasady bez zmian: ceny do ticka 0,25, SL i TP w jednej świecy → SL, w świecy wejścia tylko SL, stop przy luce po `open`, znak wodny, brak poślizgu (P7 «Bez poślizgu (Recommended)»).

## 5. Notion (bez zmiany schematu w 1.7.0)

Jeden trade = jedna strona, jak dziś: marker `[sessionId/tradeId]`, idempotencja z E2, PATCH opisu i rysunków z L. Mapowanie pól zostaje (`lib/backtest-sync.mjs` `tradeInput`), zmienia się tylko znaczenie wartości:

| Pole Notion | 1.6 | 1.7.0 |
|---|---|---|
| Cena wejścia (`entryPrice`) | jedyna cena wejścia | średnia ważona wszystkich wejść (P3) |
| Cena wyjścia (`exitPrice`) | średnia ważona wyjść | bez zmian (P2: „wynik łączny, średnia cena wyjścia”) |
| SL (`sl`) | `sl0` = SL przy wejściu | `sl0` = pierwszy postawiony SL (P5); pusty, gdy SL nie było |
| TP (`tp`) | TP przy zamknięciu | ostatni cel drabinki (najdalszy TP, także już trafiony); pusty, gdy TP usunięto i żadnego nie było przy zamknięciu |
| BE (`be`) | cena wejścia, gdy `be` | `beAt` (cena, przy której trade stał się bez ryzyka; [U] 2.11.2026 «A i B (Recommended)», wariant A: zawsze, gdy `beAt` jest, także przy offsecie i SL przesuniętym dalej w zysk); trade bez `beAt` po staremu: poziom SL (1.7) albo cena wejścia (1.6) |
| R (`r`) | z `sl0` | z `rUsd` (§3.3); pusty przy R „—” |
| P&L (`pnl`) | netto | netto, suma wszystkich wyjść |
| MAE/MFE (R) | §3.6 dawny | §3.6 nowy (tylko nowe trade'y) |

Liczby kontraktów, listy wejść i wyjść ani zdarzeń auto-BE Notion nie dostaje (nie ma pól; P30 «niech jednak w journalu pl nie byl liczony od rysunku…» usunął pole „Kontrakty”). Zostają w pliku sesji i w oknie Journal. Ewentualne nowe pole to pytanie klasy trzeciej w `00-przeglad.md` (P-N1).

Wysyłka: jak dziś zaraz po pełnym zamknięciu ([U] 31.10.2026 «od razu»). Wyjście częściowe niczego nie wysyła, bo trade jeszcze nie istnieje. Odwrócenie (pakiet 2) wysyła trade zamknięty, a nowa pozycja trafi do Notion po swoim zamknięciu.

## 6. Migracja i zgodność wstecz

### 6.1 Odczyt sesji 1.6.x (i 1.5 przez istniejące v1 → v2)

`migrateSession` zostaje jedynym wejściem (magazyn i przeglądarka). Sesja zostaje `v: 2`, a dochodzi `migrateBook(book)` (czysta, idempotentna) wołana także dla dokumentów v2:
- `book.v` brak → 3, `gone: []`.
- Każda otwarta pozycja bez `fills`:
  - `fills = [{ t: entryT, at: entryT, price: entryPrice, qty, orderId, slRef: sl0 ?? null }]`;
  - `exits[i].basis = entryPrice`, `exits[i].at = exits[i].t`;
  - `tps = tp != null ? [{ id: 'tp1', price: tp, pct: 100, hit: null }] : []`;
  - `log = []`, `slLast = sl`.
- **P5 dla otwartej pozycji 1.6.x:** `sl0 == null` i `sl != null` → `sl0 = sl`, `sl0T = entryT`, `slRef = sl` (zastosowanie P5 wprost: pierwszy znany SL). Zamknięte trade'y zostają z zapisanym `r`.
- Zlecenia: `intent: 'open'`, `tps` z `tp`, `hist: [{ at: placedT, price, sl, tps }]`.
- Trade'y w `session.trades`: **bez przepisywania**. Czytniki (Journal, Historia, statystyki) liczą brakujące `fills` jako jedną porcję w locie (`fillsOf(tr)` w `bt-ksiega.js`), a `r`, `pnl`, `maeR`, `mfeR` zostają zapisane. Wysłane strony w Notion nie dostają zmian (`editedAfter` się nie zmienia).
- `tradeSeq` (dawniej `tseq`) brak → `max(numer trade'a) + 1` (jak `nextTradeId`).

### 6.2 Powrót do 1.6.x po otwarciu sesji w 1.7.0

Sesja ma dalej `v: 2`, więc 1.6 nie potraktuje jej jak v1 (gdyby numer sesji podbić do 3, `migrateSession` 1.6 przepuściłby dokument przez gałąź v1 i zgubił pola). Lustro pozycji jest zawsze zapisane, więc 1.6 policzy pozycję jedno-wejściową poprawnie, a z dokładkami w przybliżeniu (wynik od średniej otwartej części). Dodatkowo magazyn przy **pierwszym zapisie** sesji w 1.7.0 kładzie kopię pliku sprzed migracji do `chart-data/backtest/sessions/kopie-1.6/<id>.json` (raz, nie nadpisuje). Decyzja gustu w `00-przeglad.md`.

### 6.3 Ustawienia (blok ustawień `bt`)

Nowe klucze przez `sanitizeBt` i `sanitizeSettings`: `presets`, `activePreset`, `stepTf`, `beOffset`. Żaden nie pasuje do wzorca wycinanego (`/token|secret|password|…|key|…/i`), więc przechodzą synchronizację. W presetach nie wolno użyć nazw pól `key`/`hotkey` (00-wspolne).

## 7. Cofnięcie (pakiet 6): ODWOŁANE, niezaimplementowane

> Nieaktualne od 3.11.2026 (słowa użytkownika w nocie na górze dokumentu). Zostawione jako zapis tego, co odrzucono.

```
CutBatch = { id: 'c<n>', at: ISO (czas rzeczywisty), T, trades: Trade[] (pełne, z migawkami rysunków),
             notion: { [tradeId]: { id, state: 'archive'|'archived'|'none'|'error', error } },
             undo: { book: Book, trades: Trade[], tseq } | null }   // undo tylko do końca okna „Cofnij” (9 s), potem null
```
- `bookAt(book, T)` + `tradesAt(trades, T)` liczą stan w chwili T (§1.1, `at ≤ T`). Trade zamknięty po T, a otwarty przed T, wraca jako otwarta pozycja ze zdarzeniami do T. Trade otwarty po T idzie w całości do `cut`.
- Pole `notion` w `cut` należy do serwera, tak samo jak `trade.notion` (`lib/backtest-store.mjs save`: stan z pliku wygrywa).
- Numer trade'a nigdy nie wraca do użycia (`tseq`), więc nowy trade po cofnięciu nie trafi na marker strony w koszu.
