# Etap L: handel i journaling jak w FX Replay

> Gałąź `feat/backtest-ciagly` (po K, 47110e1). Zasady: `00-wspolne.md`. Specyfikacja: `R:/PROJEKTY/trading-hq-wt/backtest-wyniki/L-audyt-fxreplay.md` (tabela luk, makieta, sekcja 6, „Decyzje użytkownika (31.10.2026)”). Ślad i decyzje: `postep.md`, sekcja „L”.

## Słowa użytkownika (31.10.2026)

- «takze sposob egzekucji realziacji ma byc taki jak fx replay, u nas wgl nie widac profitu aktualnego ani nic, przemysl gleboko caly proces dzialania tego oraz wszystkich i popraw do poprawnego dzialania i wzoru z fx replay»
- «przemysl dzialanie journalingu zeby bylo jak najbardziej logiczne w backtestingu, dodaj moze po prsotu po trade przycisk journal i wyskakuje ci pole nasze klasyczne do journalingu gdzie mozesz dopracowac rysunki i teksty na wykresie»
- Na 12 rekomendacji audytu: «Przyjmuję wszystkie». W kodzie: `// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja N: …)` w osobnym wierszu.

## Decyzje (z audytu, przyjęte)

1. Prowizja $ za kontrakt (w obie strony) opcjonalna w kreatorze, domyślnie 0, bez spreadu i poślizgu.
2. Ryzyko % od bieżącego salda, wybór bieżące / startowe w kreatorze.
3. Kilka TP: nie w L.
4. Bez dokładania do pozycji (18a.3).
5. Cofnięcie czasu niczego nie kasuje (§8).
6. $ i % na ekranie replayu i w statystykach sesji; „Backtest kontra Live” w R.
- J1 szybki panel zostaje odchudzony (wynik + Setup + „Journal”), notatka w Journalu; J2 Journal tylko po zamknięciu; J3 bez zrzutów; J4 rysunki w Journalu zmieniają tylko migawkę trade'a; J5 poprawki wysłanego trade'a (opis i rysunki) idą do Notion w tle; J6 pola: Setup, Notatka, rysunki.

## Projekt

### Konto (czysty moduł `public/js/bt-konto.js`)
- `fee(def, qty)` = prowizja × ilość (round turn); `openPL(pos, price, { commission })` → `{ pts, usd, r }` (usd netto: minus prowizja otwartej części; R z cen, od pierwotnego ryzyka całej pozycji).
- `account({ book, trades, def, last, dayStart })` → saldo (start + zrealizowany netto), equity (saldo + otwarty netto), otwarty ($, R, pkt), dziś ($, %, R: trade'y i częściowe wyjścia od otwarcia sesji CME kursora), sesja ($, %, R), `riskBalance` (bieżące albo startowe wg `def.riskBase`).
- `liveExcursions(pos, stream, eff)`: MAE/MFE otwartej pozycji tylko ze świec bazowych zakończonych do chwili bieżącej (bez przyszłości z bufora danych), przyrostowo.
- Trade: `fee` i `pnl` netto (R z cen, bez prowizji); `accountState` (K) zostaje zgodne (prowizja 0).

### Silnik (`bt-wypelnienia.js`)
- `modifyOrder(book, id, { price?, sl?, tp? }, last)`: przesunięcie zlecenia oczekującego z tą samą walidacją co `placeOrder` (strona ceny, SL/TP względem ceny zlecenia).

### Ekran replayu
- Pasek konta: Saldo · Equity · Otwarty · Dziś · Sesja ($, %, R) · trade'y · Do opisania · Niezapisane w Notion.
- Szuflada `.bt-dock`: zakładki Pozycje / Zlecenia / Historia (P&L, R, pkt, MAE/MFE na żywo, czas; akcje Zamknij, BE, 50%, Anuluj, Journal; stan opisu i wysyłki).
- Panel zleceń: SL/TP w tickach, punktach albo cenie (przełącznik), podgląd „Ryzyko −$ (%) · Cel +$ · R:R · N kontr.” przed złożeniem; ryzyko % od salda z `riskBalance`.
- Wykres: etykieta otwartego P&L na linii wejścia (pkt, $, R; co ruch kursora) z X → 25/50/75/100%; zlecenie oczekujące: etykieta przeciągana w pionie (cena), SL i TP zlecenia jako linie z przeciąganymi etykietami, × anuluje.

### Journal
- Szybki panel po zamknięciu: wynik, Setup, „Journal”, „Później”, „Zapisz” (Enter/Esc).
- „Journal” (szybki panel, Historia, Ctrl+J = ostatni zamknięty trade) pauzuje replay i otwiera klasyczne okno trade'a (`.lb`: licznik, ←/→ po trade'ach sesji, schowaj szczegóły, zamknij; wykres `createPodglad` + „Edytuj wykres” `createEditor`; fakty tylko do odczytu; Setup, Notatka, stan Notion, „Otwórz w Notion” po wysyłce).
- Świece Journala: API zakresu sesji przycięte do `maxT` = koniec świecy bazowej wyjścia (nigdy po kursorze); źródło wstrzykiwane do `createPodglad`/`createEditor` (`source`), Live bez zmian.
- Rysunki: migawka `trade.drawings` (zapis `saveDoc` → plik sesji, `dEdited`), rysunki sesji bez zmian; pozycja trade'a zablokowana (bez kłódki).
- Notion: `backtest-sync` wysyła rysunki ponownie, gdy `dEdited > notion.drawn` (dziś tylko raz); stan widoczny: do opisania / opisany / wysłany / zmieniony / błąd.
- Ctrl+J zarezerwowany (RESERVED_SKROTY), skróty replayu wyłączone przy otwartym Journalu.

## Kroki
- [x] L0: karta (ten plik)
- [x] L1: `bt-konto.js` + `modifyOrder` (testy Node `backtest-L: …`, ślad ✗ → ✓)
- [x] L2: `backtest-sync` ponowna wysyłka rysunków (test na atrapie Notion)
- [x] L3: kreator: prowizja, podstawa ryzyka; `toTrade` z prowizją
- [x] L4: pasek konta, szuflada, podgląd zlecenia, jednostki SL/TP
- [x] L5: wykres: etykieta P&L z X i procentami, przeciągane zlecenia oczekujące z SL/TP
- [x] L6: Journal: szybki panel odchudzony, klasyczne okno w trybie Backtest, źródło świec, migawka rysunków, Ctrl+J
- [x] L7: strona testowa `backtest-L.html` + `backtest-L-strona.mjs`; stare testy panelu (notatka w szybkim panelu) przepisane
- [x] L8: $ i % w statystykach sesji (jeśli tanie)
- [x] L9: pełne testy, e2e (scenariusz L), wydajność z pozycją i szufladą, zrzuty Onyx/Platinum 1920 + 375, `postep.md`, commit

## Decyzje gustu (L)
- $ netto (z prowizją), R zawsze z cen (definicja ryzyka i porównanie z Live); prowizja otwartej części od razu w otwartym wyniku.
- „Dziś” = od otwarcia sesji CME kursora (18:00 NY dnia poprzedniego), % dnia od salda na jego początku, % sesji od salda startowego.
- Sesja sprzed L bez wyboru podstawy ryzyka liczy % od bieżącego salda (decyzja 2), bez prowizji (0).
- Zamknięcie procentem: zaokrąglenie do całych kontraktów, od 1 do otwartej ilości (1 kontrakt: każdy procent zamyka całość); szuflada ma szybkie 50% i Zamknij.
- Przeciąganie zlecenia oczekującego: etykiety DOM nad wykresem (cena, SL, TP) z linią idącą za kursorem, zmiana składana po puszczeniu; strzałki góra/dół o tick (Shift: 1 pkt). Odrzucona zmiana (np. limit za rynkiem) wraca na miejsce z komunikatem.
- Jednostka „cena” bez wpisanego SL bierze stronę ostatnio złożonego zlecenia (domyślnie kupno) przy przeliczaniu.
- Journal: klasy okna Live (`.lb`), wykres od razu w podglądzie (jak Live), „Edytuj wykres” → edytor bez kłódki pozycji; świece kończą się na końcu świecy bazowej wyjścia (SL/TP) albo na chwili wyjścia ręcznego; interwały 4h/1D/1W/1M składane z 1h. Zmiany rysunków zapisują się od razu w migawce trade'a, a do Notion idą przy zamknięciu okna (jedna wysyłka, nie przy każdym ruchu).
- Szybki panel: „Journal” przenosi wpisany setup do okna; Ctrl+J = trade z szybkiego panelu albo ostatni zamknięty.
- Szuflada na ekranie ≤ 640 px startuje zwinięta; wybór zakładki i zwinięcia pamięta przeglądarka.
- Linie zleceń przebudowywane tylko przy zmianie zleceń (wcześniej każda klatka).

## Rozbieżności z kartą
- Zlecenie oczekujące przy otwartej pozycji tego instrumentu dalej odrzucane (18a.3, decyzja 4), więc zrzut „zlecenie” jest osobny od zrzutu z pozycją.
- e2e na prawdziwych świecach uruchamia stronę L od 10:30 NY z SL 40 pkt i ryzykiem 5% (o 9:31 CPI rynek schodzi 80 pkt w 5 min i wybija pozycję przed sprawdzeniami).
