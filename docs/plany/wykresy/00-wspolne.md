# Wykresy świecowe: zasady wspólne dla wszystkich pakietów

Czytasz: ten plik, swoją kartę `etap-NN.md` i pliki z karty (duże tylko zakresem linii/grepem). Pełnego planu `../wykresy-swiecowe.md` NIE czytasz. Ścieżki względem korzenia worktree `R:/PROJEKTY/trading-hq-wt/wykresy` (gałąź `feat/wykresy`, baza v1.2.2).

## Cel modułu (1.3.0)
Przy trade'ach z futures ES/NQ (MES→ES, MNQ→NQ) dashboard pokazuje wykres świecowy z lokalnego magazynu świec pobranych z Databento (po kliknięciu, z wyceną). Podgląd jest własnym SVG w designie dashboardu, edycja (rysowanie 7 narzędzi) w Lightweight Charts, rysunki w Notion. Wykres wchodzi też do kart „Udostępnij” (PNG) i filmów MP4/WebM.

## Zasady nadrzędne
- Prostota i design wygrywają z zakresem. Test trzech pytań dla każdej funkcji: (1) bez nowego renderera, (2) bez nowej zależności, (3) wygląd jak dashboard (`.seg`, `.check`, `.sp-in`, `.btn`, `.note`, `.empty`, popover Ustawień). Nie przechodzi: węższy zakres, reszta do „Później”.
- „Cichy terminal”: kolory wyłącznie z tokenów CSS (`--profit`, `--loss`, `--be`, `--fg`, `--fg-2`, `--line`, `--chart-line`, `--popover`, `--n-*`). Zero literałów `#rrggbb`/`rgb(` w `podglad.js`, `geometria.js`, `styl-wykresu.js`. W canvasie kolory z `readTokens()`.
- Teksty UI przez `t('…')`, tłumaczenia PL/EN w `public/i18n/en.json` (test i18n skanuje `public/js`, `lib`, `server.mjs`). Bez emoji, bez pauz długich w tekstach UI.
- Decyzje: mechaniczna (rób), gustu (rób i wypisz w raporcie), wyzwanie użytkownika (pieniądze, dane, publikacja, sprzeczność ze słowami użytkownika: NIE decyduj, zapytaj w raporcie).

## Testy
- Tylko atrapy: `testy/atrapa-notion.mjs`, `testy/atrapa-databento.mjs` (etap 3). `cleanEnv` w `testy/pomocnicze.mjs` (wiersz 23) usuwa zmienne Notion i (od etapu 3) `DATABENTO_API_KEY`, ustawia bazę Databento na martwy `127.0.0.1:9`. Dane syntetyczne. Nigdy prawdziwy klucz, Notion ani sieć.
- TDD: test czerwony, kod, zielony. Nazwa testu zaczyna się od `wykresy-NN:` (NN = etap). Nowe testy w `testy/wykresy-NN.mjs` (`export default ({ test, H, assert, ROOT }) => {…}`), ładowane pętlą dodaną w etapie 0 do `testy/run.mjs`.
- W trakcie: `node testy/run.mjs wykresy-NN` (filtr po fragmencie nazwy). Pełny `node testy/run.mjs` RAZ na końcu pakietu.
- Wynik zawsze do pliku: `node testy/run.mjs > R:/PROJEKTY/trading-hq-wt/wykresy-wyniki/<pakiet>.txt 2>&1`; do kontekstu tylko ostatnie ~15 linii i linie `✗`.
- UI: `node testy/start-test.mjs` (http://127.0.0.1:4331, atrapa Notion). Zrzuty tylko gdy karta pakietu na to pozwala (limit w `pakiety.md`): 1920 i 375 px, Onyx i Platinum, JPEG na `R:/PROJEKTY/trading-hq-wt/wykresy-wyniki/`.

- Port 4321 to prawdziwy dashboard użytkownika: ZAKAZ. Testowy dashboard to `node testy/start-test.mjs` na 4331 (atrapa Notion, `THQ_CONFIG_DIR` w katalogu tymczasowym). Testy w przeglądarce Playwright (`testy/udostepnij-e2e.mjs`) uruchamia się osobno od `run.mjs`.

## Oszczędność tokenów
1. Duże pliki (`public/js/app.js` 1591 l., `public/styles.css`, `public/features.css`, `server.mjs` 604 l., `udostepnij-render.js` 414 l., `testy/run.mjs`) tylko `grep -n` i `Read` z `offset/limit`.
2. Bez szukania w sieci: fakty są w karcie z poziomem dowodu. Wyjątek: rzeczy „do sprawdzenia” wpisane w karcie.
3. Raport bez diffów i treści plików. Pytania do użytkownika zbierasz na koniec (nie możesz pytać w trakcie).
4. Nie czytaj `git log`/`git diff` większego niż zakres pakietu.

## Zakazy
Bez `npm`/`npx`/`pnpm` (biblioteki to pliki w `public/vendor/`, pobrane `curl`, sprawdzone sumą). Bez prawdziwego Notion i Databento (także bez prawdziwego klucza z `.env` użytkownika). Bez `git push`, bez merge, bez tagów, bez zmiany `git config`. Bez czytania całego planu. Bez nowych plików poza kartą. Bez zmiany `Rutyny`/plików spoza repo.

## Decyzje P1–P23 (skrót; słowa użytkownika w planie, tu skutek)
P1 rolowanie `ES.v.0`/`NQ.v.0` (wg obrotu), test: nigdy `.FUT`/`.c.`, znacznik zmiany kontraktu. P2 limit 1 USD na pobranie (config lokalny). P3 `attributionLogo:false` + linijka pod wykresem + sekcja „Licencje”. P4 rysunki w Notion (`rich_text` „Rysunki”, kawałki 2 000 zn.). P5 tylko futures, EURUSD/XAUUSD: „Brak źródła danych dla tego instrumentu”. P6 zastąpiona przez P16. P7 Fibonacci 0/0,5/0,618/0,705/0,79/1. P8 sesje tła `America/New_York`: Azja 20-00, Londyn 02-05, NY 09:30-16. P9 MES→ES, MNQ→NQ jedna mapa. P10 paczka rysowania 0.6.2 z npm, suma, bez budowania. P11 `availableEnd` z `get_dataset_range` (cache 15 min), `partial`, „Dociągnij końcówkę”. P12 podgląd SVG własny, edycja w LWC, jeden model. P13 miniatury bez rysunków. P14 decyzje gustu zostają. P15 pełny wykres (świece, oś cen i czasu) w kartach i filmach, bez progu wieku, `CHART_IN_SHARE` domyślnie `true`, komentarz z datą i słowami użytkownika; odpowiedzialność za licencję danych u publikującego (README). P16 wykres w kartach i filmy. P17 prostota i design ponad zakres. P18 domyślnie wypełnione świece, opcje w Ustawieniach → Wykresy. P19 `markerStyle(background)`: tło motywu = sam tekst przy kresce i kropce; zdjęcie/film = białe pigułki z ząbkiem. P20 fMP4 i upload na IG/TikTok: próba użytkownika, 18b warunkowo. P21 filmy bez dźwięku (zero `AudioContext`, zero toru audio). P22 lokalne commity po pakiecie, bez push. P23 Databento bez abonamentu, świece po ok. 8 h (nie 24 h), darmowe `get_cost` przed pierwszym prawdziwym pobraniem (za zgodą, kluczem użytkownika: tylko jako pytanie w raporcie).
Gdy dalsza treść planu mówi inaczej (`CHART_IN_SHARE=false`, warianty A/B, dźwięk, 24 h, „czeka na P15/P19”): obowiązuje ten skrót.

## Commit pakietu
Po zielonym pełnym przebiegu: lokalny commit na `feat/wykresy` (tylko pliki pakietu: `git add` po ścieżkach, nigdy `-A`). Autor z lokalnej konfiguracji (`git config user.email` to noreply GitHuba: sprawdź i nie zmieniaj). Opis po polsku, tryb oznajmujący, bez „dodano”: np. `dodaje magazyn świec`. Drugi `-m`: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nie pushuj.

## Raport pakietu (maks. 15 linii)
1) Co zrobione (etapy, pliki po nazwie). 2) Wynik: ile testów zielonych/czerwonych (pełny przebieg). 3) Hash commita. 4) Decyzje gustu. 5) Rozbieżności planu/repo. 6) Pytania do użytkownika (klasa trzecia, z rekomendacją). 7) Zrzuty: ścieżki. Bez diffów.
