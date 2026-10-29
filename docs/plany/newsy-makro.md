# JustJournal 1.4.0: newsy makro USD

Plan z 29.10.2026. Gałąź `feat/newsy` od `main` @ `c2a824c` (1.3.0), worktree `R:\PROJEKTY\trading-hq-wt\newsy`.

## Cel

Newsy makro USD w dzienniku: godzina, nazwa i waga (szary, żółty, pomarańczowy, czerwony) jako nakładka „Newsy” na wykresie (podgląd SVG i edytor) oraz karta „Dzisiaj” w panelu. Historia od 2010, przyszłość na bieżący tydzień.

## Decyzje użytkownika (29.10.2026)

- Historia: słowa użytkownika: «Twoja rekomendowana opcja ale zweryfikuj poprawność danych wedle forex factory» → historia z oficjalnych źródeł USA (FRED API, kalendarz FOMC, reguły stałych terminów), własna tabela godzin i wag, sprawdzona z ForexFactory.
- Feed tygodnia FF: słowa użytkownika: «Rekomendowa jeśli jest legalna» → feed w publicznym repo pod warunkami z sekcji „Prawo” niżej.
- Domyślnie: «Nakładka wył., karta Dzisiaj wł. (Recommended)».
- Commity: «Możesz» → lokalne commity na `feat/newsy` po każdym pakiecie, bez push.
- Minimum historii: «moje wymagania to są przynajmniej czerwone foldery i bank holiday» → historia MUSI mieć wszystkie czerwone newsy USD i wszystkie dni wolne (Bank Holiday, szare) od 2010; pomarańczowe i żółte tylko tam, gdzie dają się dołożyć bez dodatkowych źródeł.

### Decyzje po etapie 0 (29.10.2026, raport `newsy-zrodla.md`)

- D1 przemówienia: «rekomendowana opcja oraz dopisz do newsow zeby dodaly dni opex oraz tez o nich informwoaly» → historia = dane + FOMC + przemówienia przewodniczącego Fed z RSS Fed (oznaczone „przemówienie”, godzina niepewna); prezydent i sekretarz skarbu pominięci; Ustawienia i README mówią jasno, czego historia nie ma. **Nowe: dni OPEX** (sekcja niżej).
- D2 FRED: rekomendowana → daty 2010–2026 generowane raz kluczem właściciela (`FRED_API_KEY` w `.env` worktree, nigdy w repo), plik dat publikacji dołączony do wydania 1.4.0; klucz użytkownika opcjonalny, tylko do odświeżania przyszłości. PRZETESTOWANE 29.10: klucz działa, CPI (rid 10) ma 953 daty od 1949 i ogłoszone przyszłe (10.11 i 10.12.2026).
- D3 Bank Holiday: «Zgodność z FF» → profil świąt ustalony w pakiecie B na dniach kontrolnych.
- D4 weryfikacja: próba 16 miesięcy + miesiące zmian godzin FOMC + dni kontrolne świąt; opis „zweryfikowane na próbie”.

### Dni OPEX (dodane 29.10.2026)

- Wygaśnięcie opcji miesięcznych: 3. piątek miesiąca; gdy to dzień wolny giełdy (np. Good Friday 18.04.2014), czwartek przed nim. Kwartalne (marzec, czerwiec, wrzesień, grudzień) oznaczone jako „OPEX kwartalny (triple witching)”.
- Liczone z reguły i kalendarza dni wolnych NYSE (osobnego od profilu Bank Holiday FF), bez źródła zewnętrznego. Rodzaj zdarzenia `opex`, cały dzień, własny kolor i własny przełącznik w filtrze wag.
- Informowanie: karta „Dzisiaj” pokazuje „Dziś OPEX (miesięczny / kwartalny)”, a dzień wcześniej „Jutro OPEX”; na wykresie etykieta dnia u góry, bez pionowej linii.
- Decyzja gustu: bez wygaśnięcia VIX i opcji 0DTE (codzienne); do dodania później jako opcja.

### Earningsy firm (dodane 29.10.2026)

Słowa użytkownika: «Dodaj jeszcze oprocz newsow takze earningsy firm i niech one maja oddzielne swoje miejsce. sklasyfikuj je od najwazniejszych do tych mniej waznych». Wybory: źródło «rekomendowana finnhub» (EDGAR + Finnhub), «Akceptuję 4 klasy», «Razem w 1.4.0».

- **Źródła:** historia z SEC EDGAR (8-K z Item 2.02 „Results of Operations”, czas przyjęcia raportu → przed otwarciem / po zamknięciu); przyszłe terminy z Finnhub `calendar/earnings` (klucz `FINNHUB_API_KEY` w `.env`, u każdego użytkownika własny, opcjonalny). PRZETESTOWANE 29.10: klucz działa, AAPL 02.11.2026 `amc`, NVDA 17.11.2026 `amc`, terminy do ~4 miesięcy naprzód, pole `hour` bywa puste (= „pora nieznana”).
- **EDGAR:** SEC wymaga `User-Agent` z kontaktem i ≤ 10 zapytań/s. Domyślnie nazwa aplikacji + adres repo; własny e-mail kontaktowy opcjonalnie w Ustawieniach (nigdy w repo). Historia earningów generowana raz i dołączana do wydania jak daty FRED (dane SEC są publiczne).
- **Klasy (zaakceptowane):**
  - 1 czerwony: NVDA, MSFT, AAPL, AMZN, GOOGL, META, TSLA, AVGO;
  - 2 pomarańczowy: JPM, BAC, WFC, GS, MS, C, NFLX, ORCL, AMD, BRK.B, LLY, UNH, WMT, COST, XOM, V, MA;
  - 3 żółty: reszta top 50 wagi NDX/SPX (np. ADBE, CRM, INTC, QCOM, MU, PLTR, PEP, KO, HD);
  - 4 szary: pozostałe spółki S&P 100.
  - Klasy 1–2 to stała lista w danych repo. Klasy 3–4: lista S&P 100 w repo, kolejność wg kapitalizacji z Finnhub `stock/profile2`, odświeżana raz na kwartał. Ręczne wyjątki w Ustawieniach (przenieś spółkę do innej klasy, dopisz spółkę).
- **Osobne miejsce:** własny przełącznik „Earningsy” na wykresie (obok Newsy, domyślnie wyłączony jak newsy), własna karta „Wyniki spółek” w panelu (dziś po zamknięciu, jutro przed otwarciem, najbliższe klasy 1 w tygodniu), własna podsekcja Ustawienia → Wykresy → Earningsy. Na wykresie znacznik w miejscu ogłoszenia: BMO = przed 9:30 NY, AMC = po 16:00 NY, bez pory = etykieta dnia.
- Pakiet **A2** (dane earningów) po pakiecie A, przed B; weryfikacja w pakiecie B obejmuje próbkę earningów klasy 1 (data i pora z EDGAR kontra Finnhub). UI w pakietach C i D.

## Prawo (sprawdzone 29.10.2026)

- PRZETESTOWANE: regulamin FF (`forexfactory.com/notices`) zakazuje „copying, republication or redistribution” bazy kalendarza (FEED) oraz dostępu „using a method other than the interface and the instructions that FEI provides”. Wniosek: **żadnego pobierania stron kalendarza** (`/calendar?month=…`) w aplikacji ani w narzędziach.
- PRZETESTOWANE: strona `forexfactory.com/calendar` ma sekcję „Export” z linkami do `nfs.faireconomy.media/ff_calendar_thisweek.{json,csv,ics,xml}`. Feed jest więc metodą udostępnioną przez FF.
- WYWNIOSKOWANE (nie porada prawna): użycie feedu jest w granicach regulaminu, jeśli każda instalacja pobiera go sama na własny użytek. Warunki, które plan wykonuje mechanicznie:
  1. dane FF nigdy w repo (także w testach: atrapy z wymyślonymi nazwami w tym samym kształcie), w wydaniu ani w zrzutach poradnika;
  2. newsy FF nie trafiają na karty i filmy udostępniania;
  3. najwyżej 1 zapytanie na godzinę, `Retry-After` szanowany, `User-Agent` aplikacji;
  4. README: źródło, brak powiązania z FF, dane do własnego użytku.
- FRED API: darmowy klucz, warunki wymagają dopisku „This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.” (do potwierdzenia w etapie 0).

## Zakres danych (ważne)

FF ma ok. 20 tys. newsów USD od 2010, w tym setki drobnych (przemówienia, aukcje obligacji). Źródła oficjalne dają tylko publikacje danych i FOMC. Dlatego:

- **historia** = lista ok. 25–35 kluczowych zdarzeń (wszystkie czerwone i pomarańczowe z FF, np. CPI, NFP, FOMC, PPI, Retail Sales, GDP, PCE, ISM, JOLTS, Unemployment Claims, UoM) z własną wagą i godziną;
- **bieżący tydzień** = pełny feed FF (wszystkie wagi, przesunięcia terminów), zapisywany lokalnie co tydzień, więc pełne dane rosną od dnia instalacji;
- żółte i szare w historii tylko tam, gdzie mają oficjalny termin (np. zapasy ropy EIA); przemówień członków Fed w historii nie będzie.

Pokrycie każdej wagi pokazuje Ustawienia → Wykresy → Newsy (np. „Historia: 31 zdarzeń, od 01.2010”).

## Etapy

Wykonanie jak przy wykresach: agent na pakiet, testy bez sieci (`node testy/run.mjs`), review po pakietach B i D. Kolejne pakiety dopiero po zielonych testach poprzedniego.

### Etap 0. Pomiar źródeł (research, bez kodu w aplikacji)

Agent `market-researcher` + krótkie skrypty w scratchpadzie. Wynik: `docs/plany/newsy-zrodla.md`.

- Lista zdarzeń: nazwa jak w FF, waga FF, godzina ET, źródło dat (FRED `release_id`, kalendarz FOMC Fed, reguła), od kiedy dostępne.
- FRED: `fred/release/dates` (daty publikacji wstecz, w tym przyszłe ogłoszone), limit zapytań, czy działa bez klucza, dokładne warunki atrybucji.
- FOMC: daty decyzji 2010–2026 z `federalreserve.gov` (godzina: 14:00 ET od 2013, 14:15 wcześniej; do zweryfikowania), konferencje prasowe, protokoły (Minutes, 14:00 ET, 3 tygodnie po posiedzeniu).
- Reguły bez FRED: ADP (środa przed NFP, 8:15), Unemployment Claims (czwartek 8:30, przesunięcia świąteczne), ISM (1. i 3. dzień roboczy, 10:00), EIA ropa (środa 10:30, przesunięcia).
- Godziny publikacji, które zmieniały się w czasie (np. UoM 10:00, wcześniej 9:55).

STOP: jeśli FRED wymaga klucza, właściciel zakłada darmowe konto na fred.stlouisfed.org i wpisuje klucz w Ustawieniach (klucz tylko w `.env`, jak Databento).

### Pakiet A. Dane (serwer)

- `lib/news.mjs`: model zdarzenia `{ t (unix UTC), name, imp: 'high'|'medium'|'low'|'holiday', allDay, tentative, src: 'off'|'ff' }`.
- `lib/news-sources.mjs`: adaptery FRED, FOMC, reguły, feed FF; tabela zdarzeń z etapu 0 jako dane (`lib/news-katalog.mjs`), nie jako kod rozsiany po plikach.
- Scalanie: dla tygodnia z feedu FF wygrywa FF (aktualne godziny i przesunięcia); poza nim źródła oficjalne; duplikaty łączone po (nazwa z katalogu, dzień).
- Magazyn: `chart-data/news/usd.json` (historia oficjalna) + `chart-data/news/ff/2026-W44.json` (tygodnie z feedu, niewypychane, `chart-data/` już poza gitem).
- Odświeżanie w tle: feed FF co godzinę (429 → czekaj `Retry-After`), FRED raz dziennie (tylko z kluczem), przemówienia i zeznania przewodniczącego Fed z archiwów JSON Fed raz dziennie. **Stan po D2:** import historii z postępem nie istnieje, bo historia jest w plikach dołączonych do wydania (`data/news/usd-oficjalne.json`, `data/news/fed-chair.json`, `data/earnings/`), generowanych narzędziami `narzedzia/generuj-*.mjs`; aplikacja tylko odświeża przyszłość.
- API: `GET /api/news?from&to`, `GET /api/news/today`, `GET /api/news/status`; odczyty z tą samą ochroną `Sec-Fetch-Site` co reszta `/api/*`.
- Nowe połączenia tylko: `api.stlouisfed.org`, `nfs.faireconomy.media`, `www.federalreserve.gov` (lub plik FOMC w katalogu, jeśli etap 0 tak zdecyduje).
- Testy: `testy/atrapa-fred.mjs`, `testy/atrapa-ff.mjs` (wymyślone nazwy), parser, scalanie, czas letni i zimowy (marzec i listopad, różne daty zmiany w USA i UE), „All Day”, „Tentative”, brak sieci, 429.

### Pakiet B. Weryfikacja z ForexFactory

Cel: sprawdzić historię z pakietu A z danymi FF bez łamania regulaminu.

1. **Bieżące tygodnie (automatycznie, w aplikacji):** po każdym pobraniu feedu porównanie z danymi oficjalnymi tego tygodnia; rozbieżności (brak zdarzenia, inna godzina, inna waga) do lokalnego dziennika `chart-data/news/zgodnosc.json` i do statusu w Ustawieniach.
2. **Historia (jednorazowo):** 16 miesięcy z lat 2010–2026 (po jednym na rok + miesiące zmiany czasu i rok 2020) otwartych w zwykłej przeglądarce, tak jak czyta je człowiek, nie skryptem pobierającym. Porównanie: każde zdarzenie z katalogu (godzina, waga) i czy FF ma czerwone/pomarańczowe, których katalog nie zna. Wynik tylko lokalnie w `R:\PROJEKTY\trading-hq-wt\newsy-wyniki\` (dane FF nie trafiają do repo), w repo sam wniosek z liczbami zgodności.
3. Kryteria (twarde, z decyzji użytkownika): czerwone 100% obecne, godzina co do minuty; Bank Holiday 100% dni; pomarańczowe (doradczo) ≥ 95% tych, które katalog obejmuje; każda rozbieżność opisana i poprawiona w katalogu albo zapisana jako znana różnica (np. FF zmieniło wagę zdarzenia w danym roku → waga zależna od daty).

Review: `code-reviewer` i `security-auditor` (nowe połączenia, klucz API, zapis plików).

### Pakiet C. Nakładka „Newsy” na wykresie

- Trzeci przełącznik obok Sesje i PDH/PDL w `podglad.js` (SVG) i `wykres.js` (Lightweight Charts), stan w `settings.chart.overlays.news` (synchronizowany jak P42), **domyślnie wyłączony**.
- Pionowa przerywana linia w kolorze najwyższej wagi + znacznik pod osią czasu; kilka newsów o tej samej godzinie = jeden znacznik z liczbą; dymek z listą (hover, fokus klawiaturą, dotyk).
- Filtr wag (domyślnie czerwone i pomarańczowe), kolory jako tokeny motywów (Onyx / Platinum i palety), kontrast AA dla znaczników.
- Godziny w strefie wykresu (lista IANA z P26); „All Day” i „Tentative” bez linii.
- Miniatury na liście trade'ów: bez newsów (prostota). Karty i filmy: bez newsów (prawo).
- Testy: geometria znaczników w obu trybach, grupowanie, filtr, strefy.

### Pakiet D. Karta „Dzisiaj” i ustawienia

- Karta „Dzisiaj” w panelu (**domyślnie widoczna**): newsy USD dnia w strefie z Ustawień, minione przygaszone, odliczanie do najbliższego czerwonego, odświeżanie co minutę bez zapytań do sieci. Na telefonie pod statystykami.
- Ustawienia → Wykresy → Newsy: nakładka wł./wył., wagi, klucz FRED (jak klucz Databento), bez importu historii (historia jest w wydaniu, D2), stan: ostatnie odświeżenie feedu, pokrycie historii, wynik zgodności z FF, atrybucja FRED i opis źródeł.
- Pusty stan bez klucza FRED: karta działa na samym feedzie FF; historia z komunikatem, czego brakuje.
- Teksty PL i EN w `i18n`, przez `copywriter-pl` + humanizer.

Review całości: `code-reviewer`, `accessibility-auditor` (karta, dymki, klawiatura), `visual-reviewer` (desktop i 375 px).

### Pakiet E. Wydanie 1.4.0

1. `package.json` → 1.4.0, CHANGELOG PL/EN w formacie 1.3.0 (Dodane / Bezpieczeństwo / Licencje), README PL/EN: sekcja „Newsy makro” (źródła, klucz FRED, ograniczenia historii, uwaga o FF).
2. Pełne testy, skan drzewa na tokeny, ID z `.env`, e-mail i dane FF.
3. Scalenie do `main`, autor noreply, tag `v1.4.0`, release z linią `tree-sha256:` (`node narzedzia/suma-wydania.mjs v1.4.0`) i zrzutami jako załączniki. **Push, tag i release tylko na słowo użytkownika.**
4. Aktualizacja instalacji `R:\PROJEKTY\trading-hq`: kopia `.env` i `config.local.json`, `node update.mjs --yes`, klucz FRED (opcjonalny), sprawdzenie nakładki na trade'zie z dniem CPI/NFP. Migracja Notion niepotrzebna (newsy są lokalne).
5. Po wydaniu: retro mini, wpis w pamięci.

## Ryzyka

| Ryzyko | Co robimy |
|---|---|
| FF zmieni lub zamknie feed | Historia i karta działają na danych oficjalnych; status pokazuje datę ostatniego udanego pobrania. |
| Historia uboższa niż FF (bez drobnych newsów) | Jasno w Ustawieniach i README; pełne dane rosną z feedu od instalacji. |
| Wagi FF zmieniały się w czasie | Waga w katalogu może zależeć od daty (wynik pakietu B). |
| FRED wymaga klucza, użytkownik go nie wpisze | Karta i bieżący tydzień działają bez klucza. |
| Strefy i zmiana czasu | Wszystko liczone w UTC, wyświetlanie przez `Intl` w strefie z Ustawień; testy na tygodniach zmiany czasu. |

## Otwarte

Brak (oba pytania rozstrzygnięte 29.10.2026, sekcja „Decyzje użytkownika”). Bank Holiday: dni wolne rynku USA z reguł (święta federalne, przesunięcia z soboty i niedzieli) sprawdzone z FF w pakiecie B.

- Synchronizacja z 1.3.0 (29.10.2026): urządzenie na 1.3.0 po zapisie ustawień resetuje ustawienia newsów do domyślnych (stare `sanitizeChart` przepuszcza tylko znane klucze). Wybór użytkownika: «Znane ograniczenie, CHANGELOG» → wpis w CHANGELOG i README PL/EN: zaktualizuj wszystkie urządzenia do 1.4.0.

- Pozwolenie 29.10.2026: słowa użytkownika «Masz pozwolenie na wszystko do zrobienia» → sesja główna wykonuje pakiety B–E łącznie ze scaleniem do main, push, tagiem v1.4.0, release i aktualizacją instalacji `R:\PROJEKTY\trading-hq`.

- Odliczanie (29.10.2026): słowa użytkownika «usun odliczanie do nast newsa» → karta „Dzisiaj” bez odliczania do następnego czerwonego; lista dnia, OPEX i Bank Holiday zostają.

- Kalendarz i lewy panel (29.10.2026): słowa użytkownika «C. tylko co jest dzisiaj, stworz na gorze kolejna sekcje, ktora bedzie kalendarz newsow, ktory ma na prawde pelnic funkcje jak forex factory, masz kalendarz i mozesz wyszukiwac i wyswietlac wszystkie dane jakie chcesz. Ma to byc dalej mocno w designie strony i czytelne i proste» oraz «przeniosl newsy i earnisngsy na glownym panelu na lewy panel i je tam zmiescil tak zeby sie miescily bez scrollowania ale dalej byly bardzo czytelne» → karta tylko z dniem dzisiejszym (bez „Jutro …”), nowa zakładka „Kalendarz” (dzień/tydzień/miesiąc, filtry, wyszukiwanie w całej historii, earningsy), karty w lewym panelu (Desk) bez przewijania.
