# Etap K: ciągła oś czasu replayu (jak FX Replay)

> Gałąź `feat/backtest-ciagly` (od wydanego 1.5.0, 5f5625e). Zasady: `00-wspolne.md`. Ślad i decyzje: `postep.md`, sekcja „K”.

## Słowa użytkownika (31.10.2026), nadrzędne nad projektem 1.5.0

Słowa użytkownika: «najwiekszym problemem spowodowanym twoim zlym zrozumieniem jest to ze podczas backtestingu nie wazne w jaki sposob powinines miec pelna przeszlosc tak daleko jak siega historia w danym momencie oraz nie powinno byc takiego czegos jak koniec dnia, tylko mozesz przesuwac czas tyle ile chcesz a po prostu jest opcja skokow, dzialanie fx replay ma byc wzorem.»

Odpowiedzi na pytania doprecyzowujące:
1. Filtr dni: «Filtr jako skok». Sesja ma datę startu i ciągły czas; filtr dni zostaje jako skok „następny dzień z filtra” (kursor na `def.startTime` tego dnia). Kolejność losowa i ukrywanie daty znikają.
2. Notion: «od razu». Trade idzie do Notion zaraz po zamknięciu pozycji (kolejka, idempotencja jak dotąd); opis zapisany później aktualizuje tę samą stronę (PATCH z E2). „Zapisz do Notion” zostaje do ponowienia zaległych, timer ponawia błędy przejściowe.
3. Zakres czasu: «Do końca danych». Od daty startu do ostatniej świecy w danych, bez daty końca sesji.
4. Stare sesje 1.5.0: «Przenieś». Migracja `v:1 → v:2` przy odczycie, bez utraty danych.

Informacja sesji głównej (pakiet L po K): «takze sposob egzekucji realziacji ma byc taki jak fx replay, u nas wgl nie widac profitu aktualnego ani nic». K nie robi panelu wyniku, ale zostawia punkty podpięcia (niżej).

## FX Replay a my (pomoc FX Replay, odczyt 31.10.2026)

| FX Replay | K |
|---|---|
| Sesja ma datę startu (Initial date), przed nią nie da się cofnąć | `def.from` = data startu, kursor nie schodzi przed `def.from` + `startTime` |
| Odtwarzanie, szybkość, „skip one candle”, Previous Bar; krok = interwał wykresu (Sync Timeframe) | Odtwarzaj, 1×–300×, krok = świeca aktywnego wykresu, krok wstecz |
| Go To: Next Session / Start of NY / Next Day Open / Next News / Future Date / Price; tylko w przód; „Days to skip” | skoki: godzina NY, sesja, następny dzień (sesja handlowa o `startTime`), news, +N min, następny dzień z filtra (nasz odpowiednik „Days to skip”) |
| Kilka wykresów idzie razem | jeden kursor dla wszystkich wykresów (bez zmian) |
| Sesja kończy się na dacie końca | brak daty końca: koniec danych («Do końca danych») |
| Brak „końca dnia” | brak „Zakończ dzień”, pozycje i zlecenia przechodzą przez noc |
| Go To Price, Silver Bullet, Sync Timeframe wyłączone | poza zakresem K (lista „Później”) |

Źródła: support.fxreplay.com/articles/mastering-the-replay-feature, …/how-to-skip-ahead-go-to-sessions-future-date-price, …/how-to-use-bar-replay---right-click-replay.

## Projekt rozwiązania

### Serwer: API zakresu zamiast dnia replayu
- `lib/backtest-range.mjs`: `createReplayRange({ candles, news, earnings, baseDir, t })`.
  - `.bounds({ instruments })` → `{ first, last, inst: { [Inst]: { data, first, last, real1s: Range[] } } }`: pierwsza i ostatnia świeca 1m (z plików dni warstw 1m i 1m-<kontrakt>, potwierdzone odczytem; samo pokrycie bywa szersze niż świece, np. kopia od 2019 przy pokryciu od 2010), pokrycie prawdziwego 1s (tylko NQ, z warstwami kontraktów).
  - `.read({ instruments, from, to, tf })`:
    - `tf=base`: strumień bazowy `{ m1, s1, real1s }` na instrument (NQ: prawdziwe 1s + 1m, ES: tylko 1m), zakres ≤ `BASE_MAX_DAYS` (8 dni).
    - `tf ∈ REPLAY_TFS` (historia): świece interwału, już zagregowane na serwerze (`aggregate` tych samych modułów co przeglądarka; TF < 1 min z `mergeBase`, poza 1s świece minutowe jak dotąd) + `daily` (1D do PDH/PDL); zakres ≤ 400 dni, odpowiedź ≤ `RANGE_MAX_BARS` (60 000) świec, inaczej 422 `too-many`.
    - zawsze `news` i `earnings` zakresu (pola planu filtruje przeglądarka `visibleNews`).
  - Walidacja: instrumenty (1–4 z ES, NQ, MES, MNQ), `from < to` w sekundach epoki, tylko lokalne świece (`readRaw`, nic z Databento, nic płatnego).
- Trasy: `GET /api/backtest/range?instruments=NQ,ES&from=&to=&tf=` i `GET /api/backtest/bounds?instruments=`. GET bez `guardWrite`, ta sama obsługa `Sec-Fetch-Site`/Host co inne trasy GET. `GET /api/backtest/day` i `lib/backtest-day.mjs` znikają.
- Indeks cech dnia zostaje (skoki „następny dzień” i „następny dzień z filtra”, statystyki, typ dnia w pasku).

### Przeglądarka: dane replayu (`public/js/bt-dane.js`, czysty moduł)
- Okno bazowe `[baseFrom, baseTo)` na rodzinę (NQ, ES), start: 2 sesje przed sesją kursora: strumień `mergeBase` (1s w `real1s`, 1m poza), granice okna zawsze na otwarciu sesji CME (17:00 CT), więc minuty okna 1s nigdy nie są cięte. Doładowanie w prawo porcjami (2 sesje) z wyprzedzeniem, gdy kursor zbliża się do `baseTo` (dane po kursorze tylko w pamięci, nigdy na wykresie). Pamięć: gdy `baseFrom` jest dalej niż 6 sesji za kursorem, okno przesuwa się (świece sprzed nowego `baseFrom` są doklejane do historii wykresów jako zagregowane świece ich interwałów).
- Historia wykresu = świece interwału wykresu sprzed `baseFrom` (`tf=<interwał>`), doładowywane leniwie porcjami (~1500 świec) przy przewijaniu w lewo (`subscribeVisibleLogicalRangeChange`), aż do pierwszej świecy danych. Wykres = historia + świece z `createBuilder` (okno bazowe do kursora).
- Krok w tył przed `baseFrom` przeładowuje okno bazowe (pełny odczyt wokół kursora).

### Czas ciągły (`bt-czas.js`)
- Kursor bez granic dnia: `min` = `nyAt(def.from, startTime)`, `max` = koniec danych (`bounds.last`).
- Przerwy bez handlu (weekend, święta, przerwa 17–18 NY, dziura ≥ 30 min) pomijane: `skipGap(stream, from, to)` przy odtwarzaniu i krokach (kursor przeskakuje na pierwszą świecę po przerwie).
- Skoki: `time` (najbliższa taka godzina NY w dniu handlowym po kursorze), `session` (najbliższy początek sesji po kursorze), `nextDay` (następny dzień handlowy z indeksu, godzina `startTime`), `filterDay` (następny dzień z `matchDays(def.filter)`, godzina `startTime`), `news`, `offset`.
- Domyślny skok „Następny dzień z filtra” dostaje `cel.kind = 'filterDay'` (stary zapis `id: 'nextDay'` przechodzi przy `sanitizeBt`). Skrót `endDay` znika.

### Model sesji v2 (`public/js/bt-sesja.js`)
`{ v: 2, id, rev, name, created, updated, opened, def: { instruments, from, balance, risk, startTime, accountId, filter, excluded }, cursor, hw, layout, book, trades, drawings: { [Sym]: DrawingDoc }, v1?: { pool, dayIdx, days, order, seed, to } }`.
- Znikają: `pool`, `dayIdx`, `days` (statusy), `def.order`, `def.seed`, `def.to`, ukrywanie daty, `trade.journal`-czekanie na wysyłkę.
- `trade.day` zostaje (dzień NY wejścia), liczony z `entryT`.
- `migrateSession(doc)` (czysta, idempotentna; serwer przy odczycie: `read`, `list`, `forStats`, `sync`; przeglądarka przy `load`):
  - `def.from` = najwcześniejszy dzień dawnej puli (gdy pusta: `def.from`), kursor bez zmian (gdy brak: `startTime` dnia `pool[dayIdx]`),
  - rysunki `{ Sym: { Day: Doc } }` → `{ Sym: Doc }` (sklejone `d`, bez dubli po `id`, późniejszy dzień wygrywa),
  - trade'y, książka zleceń (`book`), `hw`, układ bez zmian; stare pola w `v1` (nic nie ginie).

### Notion od razu
- `backtest-sync.mjs`: bez trybu `day` i bez czekania na opis. Domyślnie: wszystkie niewysłane (bez błędu); `all`: także z błędem; `auto`: tylko już próbowane z błędem (`notion.error`). PATCH opisu jak w E2.
- Replay: po zamknięciu pozycji zapis + `sendNotion({})`; zapis opisu → `sendNotion({})` (PATCH). „Zapisz do Notion” = `all`.

### Ekran replayu
- Pasek: nazwa, data i godzina kursora (zawsze widoczne), typ dnia, wynik, Notion, „Do uzupełnienia”, układ, zamknij. Bez „Dzień i / n”, „Zakończ dzień”, „Następny dzień”, „Sesja ukończona”.
- Koniec danych: komunikat „Koniec danych” i stop odtwarzania (pozycja zostaje otwarta).

## Punkty podpięcia dla pakietu L (wynik na żywo jak FX Replay)
- `accountState()` w `bt-replay.js` (zwracane też przez API ekranu): `{ cursor, balance, realized, open: [{ instrument, dir, qty, entryPrice, last, upl, uplR }], equity }`, liczone przy każdym przesunięciu kursora (`setCursor` → `advanceAll` → `paintAccount()`), także przez noc i dni. Cena bieżąca = `last(k)` (zamknięcie ostatniej widocznej świecy bazowej, bez przyszłości).
- Miejsce w układzie: `<section class="bt-dock">` między wykresami a paskiem sterowania (dziś pusty i ukryty, `hidden`), na dolny panel pozycji, konta i historii (jak dolny panel FX Replay). L wypełnia go i zdejmuje `hidden`; siatka `.bt-screen` ma na niego wiersz `auto`.
- Zdarzenia silnika (`onEngine`) i `onClosed` bez zmian: L może z nich budować historię.

## Decyzje 1.5.0 zastąpione przez K
- „Zakończ dzień” (E1, 18a.3), „Następny dzień”, ekran „Sesja ukończona”, statusy dni (`days`), `dayIdx`, `pool` jako kolejka.
- Kolejność dni `chrono/newest/random` i ukrywanie daty przy kolejności losowej (C1, G review #3).
- Pozycja nie przechodzi między dniami (przegląd C2, pkt 2) i zamknięcie `eod` na końcu dnia.
- Wysyłka do Notion dopiero przy „Zakończ dzień” i czekanie na opis (E2), timer tylko dla dni zakończonych (review E2 #3).
- Rysunki replayu per `[Sym][Day]` (D1) → jeden dokument per instrument.
- Kontekst „ctx 2 dni” dnia replayu (A) i trasa `GET /api/backtest/day`.
- Zakres dat sesji „od–do” (C1) → data startu i koniec danych.

## Kroki
- [x] K0: karta (ten plik), FX Replay vs my, punkty dla L
- [x] K1: `bt-sesja.js` migracja v1 → v2 (test na dokumencie v1: trade'y, rysunki, książka, kursor) + magazyn czyta v2
- [x] K2: `lib/backtest-range.mjs`, trasy `range` i `bounds`, walidacja i limity; `backtest-day.mjs` usunięty
- [x] K3: `bt-czas.js` czas ciągły: `skipGap`, skoki bez dnia, `filterDay`, bez `endDay`
- [x] K4: `bt-dane.js` okno bazowe, doładowanie w prawo, przesuwanie okna, historia porcjami do początku danych
- [x] K5: `bt-wykres.js` historia + leniwe doładowanie w lewo, nakładki z ogona
- [x] K6: `bt-replay.js` bez dnia: kursor ciągły, skoki, koniec danych, Notion od razu, rysunki per instrument, `accountState`, `.bt-dock`
- [x] K7: kreator (data startu, bez kolejności i „do”), lista sesji, statystyki bez ukrywania, sync bez trybu dnia
- [x] K8: stare testy przepisane (lista „zastąpiony przez” w postep.md), nowe testy `backtest-K:`
- [x] K9: `backtest-e2e.mjs` na nowym modelu + wydajność (§9) na kopii prawdziwych świec
- [x] K10: zrzuty Onyx i Platinum 1920 + 375 (replay, kreator), `00-wspolne.md`, `postep.md`, pełne testy

## Decyzje gustu (K)
- Pole „do” w kreatorze usunięte (nie służy też filtrowi): licznik filtra liczy dni od daty startu do ostatniego dnia danych; dzień końca danych z `GET /api/backtest/bounds`.
- Data startu sesji z 1.5.0 = najwcześniejszy dzień dawnej puli (przy „od najnowszych” pool[0] byłby najpóźniejszy, a kursor nie schodzi przed start); dubel id rysunku przy łączeniu dni: wygrywa nowszy zapis (`at`).
- Kursor nie schodzi przed datę i godzinę startu (jak „You can't replay before your session's start date” w FX Replay); wcześniejsze świece są historią wykresu.
- Przerwa = co najmniej 30 min bez świecy bazowej na wszystkich instrumentach sesji (weekend, święto, 17–18 NY); krótsza cisza (sekundy w oknie 1s, minuta bez transakcji w nocy ES) nie jest pomijana.
- Okno bazowe: 2 sesje przed sesją kursora, doładowanie po 2 sesje, gdy do końca została 1 sesja, przesunięcie, gdy początek jest 6 sesji za kursorem; historia porcjami ok. 1 500 świec (1s/5s…: doba, 1m: 2 doby, 1h: ok. 66 dób, najwyżej 120).
- Nakładki sesji i PDH/PDL liczone z ostatnich 3 000 świec albo od widocznego początku wykresu (przy pełnej historii krok zostaje tani); PDH/PDL z sesji zamkniętych w oknie i ze świec 1D porcji historii.
- „Następna sesja NY” = następny dzień handlowy o godzinie startu (rodzaj `nextDay`), „Następny dzień z filtra” = `filterDay`; skok w przód z pozycją lub zleceniem idzie przez dane porcjami (silnik widzi każdą świecę po drodze), bez nich okno przeładowuje się wokół celu.
- Koniec danych: odtwarzanie staje, komunikat „Koniec danych.”, pozycja zostaje otwarta (bez pytania i bez zamknięcia „eod”).
- Lista sesji: kolumna „Start → teraz” (data startu i dzień kursora) zamiast „Dni zrobione / w puli”; „Statystyki” w pasku replayu zamiast ekranu „Sesja ukończona”.
- Wysyłka do Notion po zamknięciu: zapis stanu robi wywołujący jednym zapisem, wysyłka w mikrozadaniu po nim; komunikat błędu Notion (np. baza bez pola „Sesja backtestu”) pokazuje się po każdym zamknięciu, jak dotąd przy „Zakończ dzień”.
- Wydajność: paczka rysowania dostaje świece z pamięci wykresu (`bars`), a P&L rysunku pozycji szuka początku zakresu binarnie (bez tego 3 pozycje „Zawsze pokazuj” na 1s przy pełnej historii dawały 6% klatek > 34 ms).

## Rozbieżności z kartą
- Strumień bazowy 1s bierze całe prawdziwe pokrycie 1s NQ (także stare okna wokół trade'ów), nie tylko 9:30–11:00: to prawdziwe świece, a granice okna bazowego leżą na otwarciach sesji, więc nic nie jest cięte.
- Brief „przewinięcie do początku danych”: zmierzone na 1h (26 766 świec od 2019-09-01 w 1,6–2,3 s); na 1m zmierzone 20 porcji (ok. 40 dób, 44 ms na porcję), nie całe 5 lat (2,6 mln świec 1m w jednym wykresie LWC to nie jest scenariusz użytkowy).
- Serwer testowy podaje też `testy/bt-*.js` pod `/__testy/` (tylko z `THQ_TEST_PAGES=1`), dla pomocnika `testy/bt-zgodnosc.js` stron testowych.
