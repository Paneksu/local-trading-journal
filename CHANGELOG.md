# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/), wersje: [semver](https://semver.org/).

## [1.4.1] · 2026-10-30

### PL
- Poprawione: wystąpienia z feedu tygodnia ForexFactory („… Speaks”, „… Testifies”) mają rodzaj „Przemówienie”, a komunikaty FOMC i decyzja o stopie rodzaj „FOMC”. W 1.4.0 wszystkie były oznaczone jako „Dane”, więc filtr rodzajów w Kalendarzu ich nie rozdzielał. Tygodnie pobrane przez 1.4.0 dostają poprawny rodzaj przy odczycie, bez ponownego pobierania. Godziny i wagi bez zmian.

### EN
- Fixed: appearances from the ForexFactory weekly feed ("… Speaks", "… Testifies") now have the "Speech" kind, and FOMC releases and the rate decision the "FOMC" kind. In 1.4.0 they were all marked as "Data", so the kind filter in the Calendar did not separate them. Weeks downloaded by 1.4.0 get the correct kind when they are read, without downloading again. Times and weights are unchanged.

## [1.4.0] · 2026-10-30

### PL
- Dodane: newsy makro USD na wykresie. Nakładka „Newsy” w podglądzie i w edytorze (domyślnie wyłączona) rysuje przerywaną linię i znacznik w godzinie publikacji, w kolorze najważniejszej wagi (czerwone, pomarańczowe, żółte, szare). Kilka newsów o tej samej minucie to jeden znacznik z liczbą, a dymek z listą otwierasz myszą, klawiaturą albo dotykiem. Wagi wybierasz w filtrze, godziny są w strefie wykresu. Historia od 2010 obejmuje dane makro (m.in. CPI, NFP, PPI, Retail Sales, GDP, PCE, ISM, JOLTS, Unemployment Claims, UoM), decyzje, konferencje i protokoły FOMC, przemówienia i zeznania przewodniczącego Fed, komunikaty Fed poza posiedzeniami, TIC, dni wolne (Bank Holiday) i dni OPEX (3. piątek miesiąca, kwartalny jako triple witching). Wagi zależą od daty, bo ForexFactory zmieniał je przez lata.
- Dodane: karta „Dzisiaj” w lewym panelu (domyślnie włączona) z newsami USD tylko z dzisiejszego dnia. Minione są przygaszone, a OPEX i Bank Holiday mają swoją wzmiankę.
- Dodane: earningsy spółek z S&P 100 w 4 klasach (1: NVDA, MSFT, AAPL, AMZN, GOOGL, META, TSLA, AVGO; 2: duże banki i liderzy branż; 3: reszta pierwszej pięćdziesiątki; 4: pozostałe spółki S&P 100). Mają osobną nakładkę „Earningsy” na wykresie (domyślnie wyłączona, romb przed otwarciem albo po zamknięciu sesji w Nowym Jorku) i własną kartę „Wyniki spółek” w lewym panelu. Klasę spółki zmienisz albo dopiszesz własną spółkę w Ustawieniach.
- Dodane: zakładka Kalendarz z widokiem dnia, tygodnia i miesiąca, filtrami wag, rodzajów zdarzeń i klas spółek oraz wyszukiwaniem newsów i earningów w całej historii od 2010.
- Źródła i klucze: FRED (daty publikacji 2010–2026 są w plikach wydania; własny klucz `FRED_API_KEY` jest opcjonalny i raz dziennie odświeża przyszłe terminy), Finnhub (klucz `FINNHUB_API_KEY` jest potrzebny do przyszłych terminów wyników, historia działa bez niego), SEC EDGAR (historia wyników od 2010 w plikach wydania), archiwa JSON Fed (przemówienia, zeznania i komunikaty, raz dziennie) oraz feed eksportu ForexFactory z bieżącego tygodnia, pobierany najwyżej raz na godzinę. Dane z feedu zostają lokalnie w `chart-data/news/`, a newsy nie trafiają na karty ani filmy.
- Weryfikacja z ForexFactory na próbie 28 miesięcy z lat 2010–2026: Bank Holiday 21 z 21 dni, czerwone z rodzajów objętych historią 98,5% z godziną co do minuty, wszystkie czerwone (z przemówieniami) 85,7%. Szczegóły w `docs/plany/newsy-zgodnosc.md`.
- Czego historia nie ma: przemówień prezydenta, sekretarza skarbu i członków FOMC poza przewodniczącym (godziny przemówień przewodniczącego są niepewne) oraz publikacji bez stałego terminu (Existing i Pending Home Sales, wstępne PMI S&P Global, raport walutowy Skarbu). Te pojawiają się tylko z feedu tygodnia, od dnia instalacji. Publikacje, które wyszły kilka minut przed czasem albo po czasie, mają w historii godzinę planową.
- Bezpieczeństwo: nowe połączenia to tylko `api.stlouisfed.org` (z kluczem FRED), `nfs.faireconomy.media` (feed tygodnia), `www.federalreserve.gov` (archiwa Fed) i `finnhub.io` (z kluczem Finnhub). `home.treasury.gov` i SEC są używane tylko przez narzędzia w `narzedzia/`, które generują pliki wydania; dashboard się z nimi nie łączy. Klucze zapisują się wyłącznie w `.env` na tym komputerze i nie trafiają do przeglądarki, logów, Notion ani synchronizacji ustawień. Nowe odczyty `/api/news*` i `/api/earnings*` mają tę samą ochronę przed obcymi stronami co reszta API.
- Notion: bez migracji. Newsy i earningsy są lokalne, a ich ustawienia synchronizują się jak reszta ustawień wykresów.
- Znane ograniczenie: urządzenie na 1.3.0 przy zapisie ustawień przywraca ustawienia newsów i earningów do domyślnych, bo nie zna nowych pól. Zaktualizuj wszystkie urządzenia do 1.4.0.
- Licencje: „This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.” JustJournal nie jest powiązany z ForexFactory (Fair Economy), Finnhub ani SEC. Dane służą do własnego użytku.

### EN
- Added: USD macro news on the chart. The "News" overlay in the preview and the editor (off by default) draws a dashed line and a marker at the release time, in the colour of the highest impact (red, orange, yellow, grey). Several events in the same minute share one marker with a count, and the tooltip list opens with a mouse, the keyboard or touch. You pick impacts in a filter, times follow the chart time zone. History from 2010 covers macro data (CPI, NFP, PPI, Retail Sales, GDP, PCE, ISM, JOLTS, Unemployment Claims, UoM and more), FOMC decisions, press conferences and minutes, speeches and testimonies of the Fed Chair, Fed announcements outside meetings, TIC, market holidays (Bank Holiday) and OPEX days (3rd Friday of the month, quarterly as triple witching). Impacts depend on the date, because ForexFactory changed them over the years.
- Added: a "Today" card in the left panel (on by default) with USD news from today only. Past events are dimmed, OPEX and Bank Holiday get their own note.
- Added: earnings of S&P 100 companies in 4 classes (1: NVDA, MSFT, AAPL, AMZN, GOOGL, META, TSLA, AVGO; 2: big banks and sector leaders; 3: the rest of the top fifty; 4: the remaining S&P 100). They have a separate "Earnings" chart overlay (off by default, a diamond before the open or after the close in New York) and their own "Earnings" card in the left panel. You can move a company to another class or add your own in Settings.
- Added: a Calendar tab with day, week and month views, filters for impact, event type and company class, and search across news and earnings in the whole history since 2010.
- Sources and keys: FRED (release dates 2010–2026 ship with the release; your own `FRED_API_KEY` is optional and refreshes future dates once a day), Finnhub (`FINNHUB_API_KEY` is needed for future earnings dates, history works without it), SEC EDGAR (earnings history since 2010 ships with the release), Fed JSON archives (speeches, testimonies and announcements, once a day) and the ForexFactory export feed for the current week, fetched at most once an hour. Feed data stays local in `chart-data/news/`, and news never goes onto cards or videos.
- Checked against ForexFactory on a sample of 28 months from 2010–2026: Bank Holiday 21 of 21 days, red events of the types covered by history 98.5% with the time to the minute, all red events (including speeches) 85.7%. Details in `docs/plany/newsy-zgodnosc.md` (Polish).
- What history does not have: speeches by the President, the Treasury Secretary and FOMC members other than the Chair (the Chair's speech times are uncertain), and releases without a fixed schedule (Existing and Pending Home Sales, flash S&P Global PMI, the Treasury currency report). These appear only from the weekly feed, from the day you install. Releases that came out a few minutes early or late keep the scheduled time in history.
- Security: the only new connections are `api.stlouisfed.org` (with a FRED key), `nfs.faireconomy.media` (weekly feed), `www.federalreserve.gov` (Fed archives) and `finnhub.io` (with a Finnhub key). `home.treasury.gov` and the SEC are used only by the tools in `narzedzia/` that generate the release files; the dashboard does not connect to them. Keys are stored only in `.env` on this computer and never reach the browser, logs, Notion or settings sync. The new `/api/news*` and `/api/earnings*` reads have the same protection against foreign sites as the rest of the API.
- Notion: no migrations. News and earnings are local, and their settings sync like the rest of the chart settings.
- Known limitation: a device on 1.3.0 resets the news and earnings settings to defaults when it saves settings, because it does not know the new fields. Update all devices to 1.4.0.
- Licenses: "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis." JustJournal is not affiliated with ForexFactory (Fair Economy), Finnhub or the SEC. The data is for your own use.

## [1.3.0] · 2026-10-29

### PL
- Dodane: wykresy świecowe przy trade'ach ES, NQ, MES i MNQ (MES i MNQ na świecach ES i NQ). Podgląd w wyglądzie dashboardu z wejściem, wyjściem, SL, TP i BE, przesuwaniem, przybliżaniem i własnym interwałem; edycja w TradingView Lightweight Charts™ z rysunkami (linia pozioma, trend, prostokąt, FVG, Fibonacci, tekst, pozycja long/short) zapisywanymi w polu „Rysunki” w Notion; po odblokowaniu przesuwasz rysunek pozycji trade'a, a ceny i czasy trafiają do pól trade'a. Miniatury wykresu na liście trade'ów i w widoku dnia. Nakładki: tło sesji Azja, Londyn i NY z liniami high/low do sweepu oraz PDH/PDL. Znacznik zmiany kontraktu, pole „Kontrakt” i B-ADJ.
- Dodane: świece z Databento (CME, `GLBX.MDP3`) na własnym kluczu użytkownika zapisanym tylko w `.env`. Kolejka w tle pobiera okna 1s wokół trade'ów i codzienne okno 1s NQ 9:30–11:00 Nowy Jork (przełącznik w Ustawieniach, nadrabianie najwyżej 7 dni); minutówki po kliknięciu z bezpłatną wyceną. Limity aplikacji: 1 USD na pobranie, 3 USD na dobę UTC i licznik kredytu, który zatrzymuje pobieranie, zanim Databento obciąży kartę. Bez abonamentu dane są dostępne po ok. 8 godzinach. Narzędzia importu historii z budżetem: `narzedzia/import-okien-1s.mjs` i `narzedzia/import-historii-1m.mjs` (domyślnie tylko wycena).
- Dodane: interwały poniżej minuty na całym wykresie: prawdziwe świece 1s w pobranych oknach, poza nimi lekko przygaszony podział świec 1m (z dopiskiem „z 1m” w dymku).
- Dodane: zakładka Ustawienia → Wykresy: wygląd (świece lub linia, kolory, siatka, poziomy, styl miniatur), nakładki, karty udostępniania, strefa czasowa i B-ADJ, dane Databento (klucz, limity i kredyt do podglądu, rozmiar `chart-data/`) oraz licencje.
- Zmienione: karty i filmy v2. Karta trade'a z wykresem ceny (świece albo linia) i rysunkiem pozycji (strefy jak w TradingView albo same znaczniki), karty okresu z krzywą kapitału, wymienne wiersze danych (do 4), duża liczba w R, $ albo %. Obrazy PNG w formatach 9:16, 4:5, 1:1 i 16:9; filmy MP4 (WebM jako zapas) bez dźwięku w formatach 9:16, 1:1 i 16:9, z tłem z motywu, zdjęcia albo własnego filmu; film i zdjęcie tła zostają w przeglądarce, a prawa do filmu i muzyki są po stronie użytkownika. Nowy układ okna „Udostępnij” z dużym podglądem.
- Bezpieczeństwo: jedyne nowe połączenie to `hist.databento.com`, tylko z zapisanym kluczem; odczyty `GET /api/*` z obcych stron (`Sec-Fetch-Site`) są odrzucane.
- Notion: migracje 003–005 dodają do bazy Trade'y pola „Cena wejścia”, „Cena wyjścia”, „SL”, „TP”, „Rysunki”, „BE” i „Kontrakt” (tylko dodawanie). Kolumnę „Rysunki” możesz ukryć w widokach Notion (README).
- Licencje: atrybucja TradingView Lightweight Charts™ (Apache-2.0) i `lightweight-charts-drawing` (MIT); dane CME z Databento są do własnego użytku, nie do redystrybucji, a publikujący karty lub filmy z wykresem odpowiada za warunki swojej licencji danych (README, „Licencje i dane rynkowe”).

### EN
- Added: candlestick charts for ES, NQ, MES and MNQ trades (MES and MNQ use ES and NQ candles). A preview in the dashboard's look with entry, exit, SL, TP and BE, panning, zooming and custom timeframes; editing in TradingView Lightweight Charts™ with drawings (horizontal line, trend, rectangle, FVG, Fibonacci, text, long/short position) saved to the "Drawings" property in Notion; after unlocking you move the trade's position drawing and the prices and times go to the trade's properties. Chart thumbnails in the trade list and the day view. Overlays: Asia, London and NY session background with high/low lines until the sweep, and PDH/PDL. Contract roll marker, a "Contract" property and B-ADJ.
- Added: candles from Databento (CME, `GLBX.MDP3`) on the user's own key, stored only in `.env`. A background queue downloads 1s windows around trades and a daily NQ 1s window 9:30–11:00 New York (switch in Settings, catch-up of at most 7 days); minute candles on a click with a free quote. App limits: 1 USD per download, 3 USD per UTC day and a credit counter that stops downloads before Databento charges the card. Without a subscription data is available after about 8 hours. History import tools with a budget: `narzedzia/import-okien-1s.mjs` and `narzedzia/import-historii-1m.mjs` (quote only by default).
- Added: timeframes below one minute across the whole chart: real 1s candles in downloaded windows, a slightly dimmed split of 1m candles outside them ("from 1m" in the tooltip).
- Added: a Settings → Charts tab: look (candles or line, colours, grid, levels, thumbnail style), overlays, share cards, time zone and B-ADJ, Databento data (key, view-only limits and credit, `chart-data/` size) and licenses.
- Changed: cards and videos v2. A trade card with the price chart (candles or line) and the position drawing (zones like in TradingView or markers only), period cards with the equity curve, selectable data rows (up to 4), big number in R, $ or %. PNG images in 9:16, 4:5, 1:1 and 16:9; MP4 videos (WebM as a fallback) without sound in 9:16, 1:1 and 16:9, with a theme, photo or your own video as the background; the background video and photo stay in the browser, and the rights to the video and music are the user's responsibility. New "Share" window layout with a large preview.
- Security: the only new connection is `hist.databento.com`, only with a saved key; `GET /api/*` reads from foreign sites (`Sec-Fetch-Site`) are rejected.
- Notion: migrations 003–005 add the "Entry price", "Exit price", "SL", "TP", "Drawings", "BE" and "Contract" properties to the Trades database (add only). You can hide the "Drawings" column in Notion views (README).
- Licenses: attribution for TradingView Lightweight Charts™ (Apache-2.0) and `lightweight-charts-drawing` (MIT); CME data from Databento is for personal use, not for redistribution, and whoever publishes cards or videos with a chart is responsible for the terms of their data license (README, "Licenses and market data").

## [1.2.2] · 2026-10-26

### PL
- Dodane: dodawanie zrzutów ekranu do trade'a z dashboardu: wybór pliku (na telefonie z galerii lub aparatu), przeciągnij i upuść oraz wklejenie ze schowka (Ctrl+V). Przycisk „Dodaj zrzut” jest w podglądzie trade'a i w formularzu edycji, miniatura pojawia się od razu. PNG, JPEG, WebP lub GIF do 10 MB (darmowy plan Notion: 5 MB, limit odczytywany z przestrzeni roboczej); zrzut trafia do Notion jako obraz na końcu strony trade'a, a zrzuty z pola „Zrzut” zostają nietknięte. Wymaga uprawnienia integracji „Insert content”. Usuwanie zrzutów zostaje w Notion.
- Skutek uboczny: dashboard pokazuje teraz we wszystkich trade'ach także obrazy wklejone ręcznie w treść strony trade'a w Notion (np. z telefonu), nie tylko te z pola „Zrzut” i z dashboardu. Dzięki temu zrzut dodany na jednym urządzeniu jest widoczny na drugim. Strony są skanowane w tle (do 3 naraz) i zapamiętywane do następnej zmiany strony, więc pierwsze uruchomienie po starcie może chwilę dociągać zrzuty z treści stron.

### EN
- Added: adding screenshots to a trade from the dashboard: file picker (gallery or camera on a phone), drag and drop, and paste from the clipboard (Ctrl+V). The "Add screenshot" button is in the trade detail view and in the edit form, and the thumbnail shows up immediately. PNG, JPEG, WebP or GIF up to 10 MB (free Notion plan: 5 MB, the limit is read from the workspace); the screenshot goes to Notion as an image at the end of the trade page, and screenshots in the "Screenshot" property stay untouched. Needs the integration's "Insert content" capability. Removing screenshots stays in Notion.
- Side effect: the dashboard now also shows, for every trade, images pasted by hand into the trade page body in Notion (e.g. from a phone), not only those from the "Screenshot" property and from the dashboard. This makes a screenshot added on one device visible on another. Pages are scanned in the background (up to 3 at a time) and remembered until the page changes, so right after a start the screenshots from page bodies may take a moment to appear.

## [1.2.1] · 2026-10-26

### PL
- Poprawione: dashboard działający na starszym kodzie niż pliki na dysku (np. po `git pull` bez restartu) nie oferuje już wersji, która jest na dysku, i nie twierdzi, że aktualizacja jest niedostępna. Pokazuje komunikat „Pliki są już w wersji …, ale dashboard działa na starszej” i przycisk „Uruchom ponownie” (pigułka w pasku statusu, Ustawienia → Aktualizacje).
- Poprawione: okno „Co nowego” pomija obrazki i HTML z notatek wydania (zamiast surowego tekstu), ukrywa linię `---` i sumę kontrolną wydania, a przy obrazkach dodaje wskazówkę, że zrzuty są na stronie wydania.

### EN
- Fixed: a dashboard running older code than the files on disk (e.g. after `git pull` without a restart) no longer offers the version that is already on disk, nor claims the update is unavailable. It shows "The files are already at version …, but the dashboard is running an older one" and a "Restart" button (status bar pill, Settings → Updates).
- Fixed: the "What's new" window skips images and HTML in the release notes (instead of raw text), hides the `---` line and the release checksum, and adds a hint that screenshots are on the release page when images were present.

## [1.2.0] · 2026-10-26

### PL
- Udostępnianie wyników jako obraz: karta z jednego trade'a, dnia, tygodnia, miesiąca albo roku. Formaty 9:16, 4:5, 1:1 i 16:9, wynik w R, $ albo % konta, tło z motywu (Onyx lub Platinum) albo własne zdjęcie. Pobierz PNG, kopiuj do schowka lub udostępnij z telefonu. W Ustawieniach pole „Nick do podpisu”.
- Nowa nazwa: JustJournal (wcześniej Trading HQ / Local Trading Journal). Repozytorium na GitHubie, adres, ustawienia zapisane w Notion i aktualizacje działają bez zmian; instalator zastępuje stary skrót na pulpicie nowym.

### EN
- Share results as an image: a card for a single trade, day, week, month or year. 9:16, 4:5, 1:1 and 16:9 formats, result in R, $ or % of the account, theme background (Onyx or Platinum) or your own photo. Download PNG, copy to the clipboard or share from a phone. A "Signature nickname" field in Settings.
- New name: JustJournal (formerly Trading HQ / Local Trading Journal). The GitHub repository, its address, the settings stored in Notion and updates work as before; the installer replaces the old desktop shortcut with the new one.

## [1.1.0] · 2026-10-26

### PL
- „Kolejne urządzenie”: kod przeniesienia z PIN-em (AES-256-GCM, PBKDF2, ważny 15 minut, jednorazowy, 5 prób) albo plik `.ltj`; w kreatorze wybór „Mam już dziennik na innym urządzeniu”.
- Synchronizacja ustawień (paleta, marginesy BE, język, motyw, aktualizacje) przez zwinięty blok na stronie głównej w Notion; wygrywa ostatnia zmiana, filtry zostają na urządzeniu.
- Lista urządzeń w Ustawieniach ze zmianą nazwy i instrukcją odłączenia.
- Migracja 002 dodaje blok ustawień do istniejących dzienników (na końcu strony, bez zmian w innej treści).
- Saldo konta liczone rollupem „P&L trade'ów” (API Notion odrzuca map() po relacji w formułach).

### EN
- "Another device": a transfer code with a PIN (AES-256-GCM, PBKDF2, valid 15 minutes, single use, 5 attempts) or a `.ltj` file; the wizard offers "I already have a journal on another device".
- Settings sync (palette, BE margins, language, theme, updates) through a collapsed block on the Notion home page; the latest change wins, filters stay per device.
- Device list in Settings with rename and disconnect instructions.
- Migration 002 adds the settings block to existing journals (at the end of the page, nothing else changes).
- Account balance computed with a "Trades P&L" rollup (the Notion API rejects map() over relations in formulas).

## [1.0.0] · 2026-10-26

### PL
Pierwsze publiczne wydanie.
- Dashboard statystyk tradingowych na danych z Notion: KPI, krzywa kapitału i spadki, kalendarz P&L, heatmapa dni, rozbicia (setup, instrument, sesja, dzień, kierunek), godzina wejścia, czas trwania, kolejny trade w dniu, rozkład R.
- Trade'y, konta prop i wpisy finansowe dodawane i edytowane z dashboardu (zapis do Notion), zakładki Trade'y, Prop i Galeria.
- Instalator `setup.mjs`: gotowa strona w Notion z 4 bazami, relacjami, formułami i widokami, opcjonalne wpisy DEMO (`--remove-demo`).
- Aktualizacje bez utraty danych: kopia baz, `git pull --ff-only` albo wydanie z GitHuba ze sprawdzeniem sumy, migracje tylko dodające; moduł aktualizacji w dashboardzie z restartem.
- Kopia i przywracanie (`restore.mjs`, domyślnie podgląd).
- „Pierwsze kroki”: sprawdzenie gotowości instalacji i przewodnik po dashboardzie na przykładowych danych.
- Interfejs po polsku i angielsku, motywy Onyx i Platinum, palety danych (także dla daltonistów).
- Pola szukane po rolach i identyfikatorach, więc zmiana nazwy pola w Notion niczego nie psuje.

### EN
First public release.
- Trading statistics dashboard on Notion data: KPIs, equity curve and drawdowns, P&L calendar, day heatmap, breakdowns (setup, instrument, session, weekday, direction), entry time, duration, nth trade of the day, R distribution.
- Trades, prop accounts and finance entries added and edited from the dashboard (saved to Notion); Trades, Prop and Gallery tabs.
- `setup.mjs` installer: a ready Notion page with 4 databases, relations, formulas and views, optional DEMO entries (`--remove-demo`).
- Updates without data loss: database backup, `git pull --ff-only` or a GitHub release with checksum verification, add-only migrations; in-dashboard update module with restart.
- Backup and restore (`restore.mjs`, preview by default).
- "Getting started": installation readiness check and a guided tour on sample data.
- Polish and English UI, Onyx and Platinum themes, data palettes (including colour-blind friendly).
- Properties are found by role and ID, so renaming a property in Notion breaks nothing.
