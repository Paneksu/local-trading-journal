# Wykresy świecowe z rysowaniem: projekt i plan wdrożenia

Status: **PROJEKT, kod jeszcze nie powstał.** Gałąź `feat/wykresy` (worktree `R:/PROJEKTY/trading-hq-wt/wykresy`), baza: `main` @ `4653a13` (wersja **1.2.2**, `schemaVersion` 2, migracje 001–002). Projekt nazywa się **JustJournal** (od 1.2.0); identyfikator `local-trading-journal` w bloku ustawień w Notion zostaje bez zmian.
Data: 27.10.2026, **wersja 3 planu** (rebase na 1.2.2; wykres w kartach udostępniania, filmy, style wykresu, Ustawienia → Wykresy; sekcja 0, P15–P20). Moduł wyjdzie jako **1.3.0** (nowa funkcja, semver minor).

Co nowego na `main` od wersji 2 planu (plan musi to uwzględniać):
- **1.2.0 `3458c1d`**: karty „Udostępnij” jako obraz (`public/js/udostepnij.js` okno i akcje PNG/kopiuj/udostępnij, `udostepnij-dane.js` modele kart, `udostepnij-render.js` natywny Canvas 2D z tokenami motywu przez `getComputedStyle` i sondę `rgbOf`; formaty `9:16 4:5 1:1 16:9`; tło z motywu albo własne zdjęcie z `localStorage` `thq.share.photo` przyciemnione `SCRIM 0.6`; `testy/udostepnij-podglad.html`, `testy/udostepnij-e2e.mjs`); nazwa JustJournal; `settings.share` synchronizowane przez Notion.
- **1.2.1 `0182cc5`**: wykrywanie starszego kodu w działającym dashboardzie (`aktualizacja.js`, `markdown.js`).
- **1.2.2 `4653a13`**: wgrywanie zrzutów do trade'a (`lib/shots.mjs`, `public/js/shots.js` z `bindShots`, trasa `POST /api/trades/:id/shots` w `server.mjs` z własnym limitem `readJson`, skan bloków obrazów stron w `lib/data.mjs`, przesyłanie plików w `lib/notion.mjs`, atrapa Notion z `file_uploads` i `blocks`).

Moduł jest w pełni lokalny i samodzielny: żadnych powiązań z dziennikiem v2, łącznikiem `tj`, MCP ani API Claude. Jedyne nowe połączenie sieciowe to Databento, wyłącznie po kliknięciu użytkownika. Rysunki idą do Notion tym samym kanałem co reszta dziennika.

Oznaczenia dowodów przy twierdzeniach o bibliotekach i usługach zewnętrznych:
- **PRZETESTOWANE**: sprawdzone dziś na żywo (pobrany plik, uruchomiony kod, odpowiedź serwera).
- **CZĘŚCIOWE**: część sprawdzona, reszta z dokumentacji albo kodu źródłowego.
- **WYWNIOSKOWANE**: z dokumentacji, typów albo kodu, bez uruchomienia.

---

## 0. Decyzje (26.10.2026)

Utrwalone tu i do przeniesienia w komentarze kodu w miejscach, których dotyczą (z datą).

| # | Temat | Słowa użytkownika / decyzja | Skutek w planie |
|---|---|---|---|
| P5 | Dukascopy | Słowa użytkownika: «Nie, na razie tylko futures» | Bez Dukascopy, bez dekodera LZMA, bez sesji FX. EURUSD i XAUUSD: komunikat „Brak źródła danych dla tego instrumentu” (PL/EN). Notka w „Później” (p. 5.2), zero kodu przygotowawczego |
| P1 | Rolowanie kontraktów | Słowa użytkownika: «Wg obrotu .v.0» | `ES.v.0`, `NQ.v.0`; znacznik zmiany kontraktu na wykresie; test, że nigdy nie idzie `.FUT` ani `.c.` |
| P9 | Kontrakty mikro | Słowa użytkownika: «Z danych ES i NQ» | MES → ES, MNQ → NQ, jedna mapa w kodzie |
| P4 | Rysunki | Słowa użytkownika: «notion, ale czy notion utrzyma taka ilosc danych?» | Rysunki w Notion: właściwość `rich_text` „Rysunki”/„Drawings” w migracji 003, JSON w kawałkach po 2 000 znaków, lokalna kopia tylko jako cache. Odpowiedź na pytanie o pojemność: p. 3.6 i 4.3 |
| P2 | Limit kosztu | Decyzja sesji głównej (domyślna, bez sprzeciwu użytkownika) | 1 USD na jedno pobranie, zmiana w Ustawieniach |
| P3 | Atrybucja TradingView | Decyzja sesji głównej | wyciszona linijka pod wykresem + sekcja „Licencje” w Ustawieniach |
| P6 | Eksport PNG | Decyzja sesji głównej (26.10.2026); **zastąpiona przez P16 (27.10.2026)** | było: brak w v1. Teraz: wykres w kartach PNG i filmach tylko po rozstrzygnięciu P15 |
| P10 | Paczka rysowania | Decyzja sesji głównej | plik z npm sprawdzony sumą, bez budowania ze źródeł |
| P7, P8 | Fibonacci, godziny sesji | Decyzja sesji głównej | jak w p. 8 |
| P11 | Dostępność danych (embargo Databento) | Słowa użytkownika: «dopisz to» (do propozycji sesji głównej z 26.10.2026) | `metadata.get_dataset_range` z cache 15 min, linijka „Świece dostępne do: …”, przycinanie zakresu, status `partial`, przycisk „Dociągnij brakującą końcówkę”, stan „jeszcze niedostępne” (p. 3.2a) |
| P12 | Dwa tryby wykresu: podgląd we własnym designie, edycja w LWC | Słowa użytkownika: «okej czyli sam wykres i jego sterowanie nie da sie zmienic css, ale chcialbym np poza sterowaniem, do wyswietlenia tylko zeby ten wykres byl w pelni zreworkowany dla naszego designu a jak sie robi modyfikacje to ma sie ten ktory jest wymagany». Odpowiedzi: tryb podglądu «Kadr + przesuwanie i przybliżanie»; miejsca podglądu «Szczegóły trade'a, Kalendarz / dzień, Miniatura na liście trade'ów» | PODGLĄD (domyślny) = własny renderer SVG stylowany CSS-em; EDYCJA (przycisk „Edytuj”) = Lightweight Charts + paczka rysowania; jeden model rysunków; miniatury (p. 3.8, 3.9) |
| P13 | Miniatury bez rysunków | Słowa użytkownika: «Świece + poziomy, bez rysunków (Recommended)» | Miniatury pokazują świece i poziomy z pól trade'a; nie wołają `/api/drawings` ani Notion (p. 3.9) |
| P14 | Decyzje gustu 15–19 z p. 8 | Decyzja sesji głównej (podane użytkownikowi w podsumowaniu, bez sprzeciwu) | zostają |
| — | Decyzje gustu z p. 8 | Decyzja sesji głównej | zostają |
| R1 | Poprawki po przeglądzie D–F i P27 (28.10.2026) | Review `code-reviewer` (7/10): B1, B2, W1–W6, D1–D4 oraz ryzyko z P27 (zapis rysunków odświeżał znacznik edycji trade'a). B3 rozstrzygnięte wcześniej (miniatury w tabeli, kartach i „Ostatnie trade'y”) | B1 tokeny `--lb-*` w `styles.css`, `features.css` bez literałów kolorów. B2 test miniatur liczy żądania atrapy Notion (z samosprawdzeniem). W1 `AbortController` na instancję podglądu i edytora. W2 start edytora sprawdza po każdym `await`, czy lightbox jest na tym samym trade'ie (`lb.editSeq`), inaczej edytor sprząta po sobie. W3 `createSaver` zostawia nieudany stan w kolejce (`failed()`), „Gotowe” pyta o potwierdzenie, zamknięcie inną drogą ostrzega. W4 odczyt rysunków z zaległym zapisem unieważnia dane i zwraca `flushed`, aplikacja odświeża znacznik edycji. W5 kolejka miniatur pomija żądanie dopiero, gdy znikną wszystkie zamawiające je elementy. W6 nieudany odczyt rysunków blokuje edycję (jedna ponowna próba, komunikat). D1 martwy kod po `shown`. D2 raport testów z liczbą pominiętych. D3 PDH/PDL po dniu bez sesji (pobrane świece bez dziury) bierze ostatnią faktyczną sesję, przy dziurze nie zgaduje (decyzja gustu). D4 limit żądania 640 KB i osobny limit rozmiaru ciała żądania do Notion 480 KB z komunikatem o rysunkach. P27: serwer podaje `previous` (znacznik strony tuż przed zapisem), edytor przyjmuje nowy `edited` tylko gdy `previous` zgadza się z jego znacznikiem (`adoptEdited`), więc cudza zmiana w Notion daje 409 z komunikatem |
| P16 | Wykres w kartach i filmy (27.10.2026) | Słowa użytkownika: «chcailbym zebys wdrozyl tez te wykresy do generowanych zdjec i stworzyl tez funckje ze mozna je generowac jako filmiki z filmikiem w tle, masz zdjecia i filmiki do inspiracji. i w tym filmiku wizualizujesz wykres i pnl np. popracuj tez nad roznymi rodzajami przedstawien wygladu wykresu. i tez wszedl wlasnie nowy update wiec mozesz o niego oprzec ten plan» | rebase na 1.2.2; wykres w `udostepnij-render.js` (p. 3.10); filmy w przeglądarce (p. 3.11); style wykresu (p. 3.12). Inspiracja LiquidJournal opisana w p. 3.10–3.11 |
| P17 | Prostota i design najważniejsze (27.10.2026) | Słowa użytkownika: «dodaj do planu ze najwazniejsza jest prostota i design» | p. 1.0: każda funkcja v3 przechodzi test „bez nowego renderera, zależności i systemu UI, wygląd jak dashboard”; inaczej węższy zakres na start, reszta „Później”. Każda decyzja v3 ma dopisek [P]/[W] |
| P18 | Domyślne świece, reszta w Ustawieniach (27.10.2026) | Słowa użytkownika: «glownie maja byc normalne typowe swieczki do wygladu wykresow, ale mozesz wszystko dostosowac w ustawieniach, wiec wiele opcji dojdzie do ustawien, wiec popracuj tez nad sekcja ustawien» | domyślnie wszędzie (podgląd, edycja, karty, filmy) wypełnione świece japońskie w kolorach palety; inne style tylko jako opcja (p. 3.12); zakładka Ustawienia → Wykresy (p. 3.13). Linia z inspiracji LiquidJournal to u nas opcja, nie domyślny wygląd |
| P15 | **Licencja danych CME w obrazach i filmach** | **CZEKA NA UŻYTKOWNIKA (wyzwanie użytkownika: publikacja, licencja)** | fakty i warianty w p. 3.7; do decyzji wykres w kartach jest za przełącznikiem i domyślnie wyłączony w kodzie, a etap 17 nie startuje |
| P19 | Dymki „Entry/Exit” jako białe pigułki (jak LiquidJournal) | **CZEKA NA UŻYTKOWNIKA** (sprzeczne z zapisaną preferencją z 08.2026: bez zaokrąglonych podkładek pod statycznym tekstem) | domyślnie wariant zgodny z preferencją: znacznik (kreska/kropka) + etykieta samym tekstem obok, bez podkładki (p. 3.10); pigułki tylko jeśli użytkownik zdecyduje |
| P20 | Film MP4: format fragmentowany z MediaRecorder | **CZEKA NA UŻYTKOWNIKA (próba)**: jeden ręczny upload testowego pliku na Instagram i TikTok | gdy platforma odrzuci plik: etap 18b (przepakowanie MP4 w JS, p. 3.11) |
| P21 | Dźwięk w filmach (27.10.2026) | Słowa użytkownika: «bez muzyki narazie» | na start filmy bez toru audio: opcja „Dźwięk z filmu tła” przechodzi do „Później”; nagrywanie tylko wideo (prostsze, bez `AudioContext`) |
| P22 | Lokalne commity (27.10.2026) | Słowa użytkownika: «okej zgadzam sie» (na: lokalny commit na `feat/wykresy` po każdym pakiecie, bez push) | reguła 9 w p. 11 obowiązuje; push i merge nadal tylko na polecenie |
| P19 | rozstrzygnięte 27.10.2026 | Słowa użytkownika: «wybierz te co bedzie bardziej pasowalo w danym momencie dla danej rzeczy». Decyzja sesji głównej: podgląd, edycja, miniatury i karty na tle motywu → sam tekst przy kresce i kropce (bez podkładki); karty i filmy na tle zdjęcia albo filmu → białe pigułki z ząbkiem, bo ruchome lub zdjęciowe tło nie daje stałego kontrastu dla samego tekstu | jedna funkcja `markerStyle(background)` w `geometria.js`; test: tło motywu → tekst, zdjęcie/film → pigułka; bez osobnej opcji w Ustawieniach (prostota) |
| P15 | **rozstrzygnięte 27.10.2026** | Słowa użytkownika (AskUserQuestion): «Nasz wykres w kartach na moje ryzyko»; o mailach do CME/Databento: «nie pytamy, bo te zdjecia i filmiki i tak bede tylko ja udostepnial, a dziennik mam lokalny tylko u siebie wiec sadze ze jest to nie potrzebne». Research: `research-dane-publikacja.md` | wariant C: pełny wykres (świece, oś cen i czasu) w kartach i filmach, bez progu wieku; `CHART_IN_SHARE` domyślnie włączony, z komentarzem w kodzie (data, słowa użytkownika); README PL/EN: dane CME są licencjonowane do użytku własnego, publikujący karty odpowiada za warunki swojej licencji danych (każdy użytkownik publicznego repo decyduje sam); przełącznik w Ustawieniach zostaje |
| P23 | Źródło świec (27.10.2026) | Słowa użytkownika: «databento bez abonamentu i upewnij sie o kosztach» | Databento usage-based, bez planu; dostępność świec po ok. 8 h (katalog GLBX.MDP3, PRZETESTOWANE 27.10.2026), p. 3.2a do poprawy z 24 h na ~8 h; przed pierwszym prawdziwym pobraniem: darmowe `metadata.get_cost` kluczem użytkownika (za jego zgodą) dla 1 dnia ES 1s i 1 roku ES, wynik do p. 4 i do raportu |
| P15 | aktualizacja 27.10.2026 | Słowa użytkownika: «najlepszym rozwiazaniem jest posiadania tak szybko danych ze mozna zrobic journal z wykresem od razu i bez limitow go opublikowac, nie ograniczaj sie i zrob research zeby swoboda byla tu glownym prowadzacym i czy jest taka mozliwosc» | warianty A/B/C wstrzymane; trwa research źródeł danych pod kątem: dane z bieżącej sesji + swobodna publikacja obrazów i filmów |
| P24 | Dzienny sufit wydatków na Databento (27.10.2026) | Słowa użytkownika: «Tak, 3 USD na dobę» | Licznik wydatków na dobę UTC w `config.local.json` (`chartSpend`, `chartDailyLimitUsd`; nie w settings, nie w sync), domyślnie 3 USD, edycja tą samą trasą co limit na pobranie (0,01-100). Pobranie, które przekroczyłoby `wydane_dziś + wycena > limit`, jest odrzucane; doliczane są faktycznie pobrane okna |
| P25 | Model danych: okna 1s + historia 1m (27.10.2026) | Słowa użytkownika: «okej zwiekszam limit do 50 usd ale sie upewniaj ze wszystko jest pobierane z darmowych kredytow akceptuje plan» (plan: cała historia 1m ES+NQ od 06.2010 = 41,20 USD wg get_cost 27.10; okna 1s ±30 min wokół trade'a, ~0,02 USD/trade, pobierane automatycznie w limitach; trade'y bliskie łączone w jedno okno; kolejka dla backtestu i starych trade'ów) | Zastępuje „trzymać całe dni 1s” z 26.10 (1s rok ES = 45,84 USD, ZMIERZONE). Magazyn (etap 2) pamięta zakresy 1s w ciągu dnia, klient (etapy 3–4) pobiera dwie schemy i kolejkę. Limit portalu Databento użytkownik podniósł do 50 USD. **Każde pobranie tylko z darmowego kredytu:** kredyt 125 USD wygasa ok. 27.04.2027; przed pobraniem sprawdzić pozostały kredyt (API, jeśli istnieje — do zweryfikowania; inaczej lokalny licznik wydatków od 125 USD + data wygaśnięcia) i przerwać, gdy wycena > pozostały kredyt albo po dacie wygaśnięcia. Import historii 41,20 USD jednorazowo, tylko na wyraźne polecenie, z tymczasowym podniesieniem limitów aplikacji |
| P26 | Poprawki użytkownika do podglądu (pakiet D) i edytora (pakiet E) (28.10.2026) | Słowa użytkownika: (1) «powinna dac sie ruszac gora dol takze, czyli wylaczyc ta automatyczne dostosowanie sie do wysokosci» + «ma byc przelacznik»; (2) «usuniecie tego ze jak sie za bardzo oddali wykres to sam zmienia interwal, nie powinien»; (3) «usun napisy wejsie, wyjscie, po kropkach i pasku widac miejsca te»; (4) «dodaj punkt BE, widoczny na pozycji», wybór: «Nowe pole „BE” (cena)»; (5) «nie mam pojecia jaki czas utc jest ustawiony dla dziennika, wiec powinien byc do ustawienia na wykresie jak i staly w ustawieniach» | (1) przełącznik „Auto” skali ceny w pasku podglądu i edytora, stan w `localStorage` (`thq.chart.autoscale.v1`, wspólny); wył. = przeciąganie w pionie, kółko, przeciąganie i pinch na osi ceny; przeciągnięcie albo kółko na osi wyłącza „Auto” (jak LWC), dwuklik na osi włącza. (2) usunięte `displayTf`/`raisedLabel` i etykieta „wyświetlane X (wybrano Y)” (odstępstwo od karty etapu 7 i p. 3.8 „Wydajność”); zamiast tego limit oddalenia 1 500 świec wybranego TF (podgląd: `limitSpan` i granica w `zoomAt`; LWC: `minBarSpacing = szerokość / 1 500`). (3) podgląd: bez etykiety `lvl-n`, kreska i kropka zostają; LWC: linie wejścia i wyjścia bez tytułu (wyjście z `--be` na `--fg`). (4) migracja 004 (addytywna, pole liczbowe „BE” PL/EN, rola `be`), pole w formularzu obok cen, linia `--be` na szerokości pozycji w podglądzie i linia ceny „BE” w edytorze; miniatur jeszcze nie ma (etap 10). Na prawdziwym Notion migrację uruchamia sesja główna za zgodą użytkownika. (5) Ustawienia → Ogólne „Strefa czasowa wykresu” (`settings.chartTz`, synchronizowane, domyślnie strefa przeglądarki, lista IANA: UTC, Londyn, Warszawa, Nowy Jork, Chicago) + przycisk strefy w pasku wykresu (np. „Warszawa UTC+1”), który przełącza tymczasowo: ustawiona → UTC → Nowy Jork → Chicago, bez zapisu. Sprawdzone: Notion zwraca czasy trade'ów z przesunięciem (np. `+01:00`), `parseDT` liczy moment UTC, więc położenie trade'a na osi było poprawne; zmieniał się tylko opis osi |
| P27 | Poprawki użytkownika do wykresu: podgląd, edytor rysunków, Ustawienia (28.10.2026) | Słowa użytkownika: (1) «strefy czasowe powinny byc wszystkie i na wykresie tez powinna byc lista rozwijana, a nie przelaczniki»; (2) «do rysunkow pozycji dodaj mozliwosc dodawania poziomu be»; (3) «na wykresie podczas edycji jest ta pozycja ktora jest od poczatku i ma blokade na sobie i nie da sie jej ruszyc ... mi chodzi zeby na niej widoczny byl punkt be. ale powinna byc opcja do odblokowania jej i wtedy rysunek zmieniasz i jak zapiszesz do pola notion dostosowuja sie do nowych pozycji»; (4) «linie, kwadrat powinny miec mozliwosc dodania tekstu wraz z roznymi opcjami dotyczacymi ustawienia tego tekstu i wielkosci np tego tekstu i kolorow rysunkow jak i tekstu oraz grubosci lini bokow»; (5) «dodaj gann boxa do rysunkow» + «gann box oraz fib powinny miec mozliwosc dostosowania rysunkow tak jak aktualnie tradingview»; (6) «wszystkie rysunki zapamietuja nasz wybor i od momentu zmiany rysuja sie w ten sposob co zmienilismy»; (7) «dodaj mozliwosc wyczyszczenia wszystkich rysnkow z danego wykresu»; (8) «interwaly ktore sa na liscie i jest szybki do nich dostep powinna byc ta lista modyfikowana i mozna swobodnie dodawac wszystkie jakie sie tam chce jak i odejmowac plus dodaj timeframe tygodniowy i miesieczny»; (9) «pokazuj rr na pozycjach ktore rysuje sam». Decyzja sesji głównej: PDH/PDL bez zmian (historia 1m ES/NQ od 2010 jest w `chart-data`), miniatury w „Ostatnie trade'y” zostają | (1) wszystkie strefy IANA (`Intl.supportedValuesOf`) z przesunięciem UTC w opisie: Ustawienia → Ogólne = pole filtra + lista; wykres = lista rozwijana (Z Ustawień, szybki wybór, wszystkie), wybór tymczasowy jak w P26; zastępuje przycisk po kolei z P26. (2) i (9) pozycje rysowane: `style.beLevel` (odległość od wejścia w stronę zysku), linia `--be` z podpisem „BE” i „R:R x” bez podkładki; paczka tego nie ma, więc w edytorze rysuje je prymityw serii (`extrasPrimitive`) z tych samych części geometrii co podgląd (`positionExtras`). (3) zablokowana pozycja trade'a ma BE z pola; kłódka w pasku odblokowuje ją, panel pokazuje Wejście/Wyjście/SL/TP/BE (wyjście tylko w panelu: rysunek pozycji nie ma ceny wyjścia), „Zapisz w trade'zie” = `PATCH /api/trades/:id` (guardWrite, `edited` = last_edited_time, 409 „stale”), ceny zaokrąglone do ticku 0,25 (ES/MES/NQ/MNQ), po zapisie blokada wraca; zapis rysunków zwraca nowe `edited`. R i P&L zostają polami trade'a (aplikacja ich nie liczy z cen). (4) panel ustawień zaznaczonego rysunku pod paskiem: tekst, rozmiar, kolor tekstu, wyrównanie poziome i pionowe (Nad / Na linii / Pod, jak paczka), kolor linii/obramowania, grubość 1-4, styl linii, wypełnienie z kolorem i kryciem (prostokąt). (5) Gann box (paczka 0.6.2 ma `gann-box`): poziomy ceny i czasu 0/.25/.382/.5/.618/.75/1, strefy 8% w kolorach `--n-*`, odwrócenie, podpisy; Fibonacci i Gann: lista poziomów (dodaj, usuń, wartość, wł./wył., kolor), wypełnienie z kryciem, podpisy współczynnika/ceny/procentów, odwrócenie; geometria podglądu w teście zgodności (1 px). (6) `thq.chart.toolStyle.v1` (localStorage, try/catch): styl z panelu per narzędzie (FVG osobno), bez tekstu. (7) „Wyczyść wszystkie” z potwierdzeniem, cofalne Ctrl+Z w sesji edycji. (8) ulubione interwały (`thq.chart.tfs.v1`, wspólne dla podglądu i edytora, popover z dodawaniem i usuwaniem), domyślnie 15s-1D + 1W + 1M; jednostka `M` (miesiąc) w `parseTf`: świece z sesji, których dzień handlowy (dzień zamknięcia 16:00 Chicago) leży w miesiącu, start = otwarcie pierwszej sesji miesiąca; 1D i 1W bez zmian (sesja 17:00-16:00 Chicago) |
| P28 | Pozycja trade'a po odblokowaniu: wyjście, wynik i czas (28.10.2026); R z cen COFNIĘTE w P32 (R ręczne) | Słowa użytkownika: «dopracuj i zrob te 3 pkt» (punkty z raportu P27 „czego nie ma”): (1) cena wyjścia przeciągana na wykresie jak SL/TP/BE; (2) R i P&L przeliczane z cen po zapisie pozycji, świadomie nadpisują wpisane wyniki (zaakceptowane); (3) przesunięcie pozycji w bok zmienia datę i godzinę wejścia i wyjścia, przyciągnięte do świecy bieżącego interwału, wyjście nie przed wejściem. Oraz: «najwazniejsza jest prostota i design» | (1) wyjście należy do rysunku pozycji (`style.exitLevel`, odległość od wejścia w stronę zysku, jak `beLevel`): kropka na prawej krawędzi pozycji i przerywana ścieżka od wejścia (`positionExtras`, te same klasy co kropka wyjścia podglądu `lvl-d`/`lvl path`, test zgodności 1 px z LWC i z `levelsSvg`); po odblokowaniu kropka jest uchwytem (przechwycenie `pointerdown` w fazie capture przed paczką, kursor „chwyć”, wykres i skala Auto wstrzymane w trakcie): pionowo cena wyjścia (tick 0,25), poziomo czas wyjścia (świeca pod kursorem, nie przed wejściem). (2) R = (wyjście − wejście) × kierunek / \|wejście − SL\|, zaokrąglone do 0,01 R, wysyłane przy każdym zapisie pozycji z wyjściem i SL (nadpisuje R). P&L NIE jest liczony: trade nie ma pola liczby kontraktów ani opłat (role w `lib/roles.mjs`), pytanie do użytkownika w raporcie P28, pole P&L zostaje bez zmian. (3) `planTradeSave`: punkt pozycji w tej samej świecy co dotąd = bez zmiany (zostaje dokładna minuta z Notion), w innej = początek nowej świecy (`snapTime`); daty idą polami formularza (`date`/`time`/`exitDate`/`exitTime` + `tz` = strefa przeglądarki, jak `form.js`), Notion zapisuje je z przesunięciem; trade bez czasu wyjścia nie dostaje go z przesunięcia. Przed zapisem panel pokazuje jedną linią „Po zapisie: …” zmienione ceny, czasy i R; po zapisie ta sama trasa (`PATCH /api/trades/:id`, `edited`, 409), pozycja wraca do blokady, podpis i fakty lightboxa od razu, lista/miniatury/statystyki z odświeżenia danych. Na telefonie pola pozycji w dwóch kolumnach, wnętrze edytora przewija się zamiast nachodzić na opis trade'a |
| P29 | Miniatury, strefy, BE, ustawienia rysunku i okno trade'a (28.10.2026) | Słowa użytkownika: (1) «z ostatnich trade usunmy te miniaturki wykresow, a na liscie tradow na srodku zostawiamy ale poprawmy, niech miniatury pokazuja tylko szerokosc wykresu taka jaka byla dlugosc trade oraz deliaktnie rozszczweszyc o 2-3 swieczki w lewo i prawo, idealnym przykladem co wedlug mnie okej wyglada jest trade 26 paź 14:50 ES break even (test D) i jego minaitura»; (2) «utc nie mialoby by wszystkich, mialy byc najpopularniejsze ale kazde utc zeby dalo sie wybrac przynajmniej kazda godzine, aktualna lista jest za duza»; (3) «nie da sie przesunac myszka poziomu be a powinno sie dac i to tak samo automatycznie zapisuje jego miejsce»; (4) «ustawienienia rysunkow maja wyskoczyc dopiero jesli sie kliknie w znak ustawien przy danym rysunku ktory sie bedzie pojawiac jak sie najedzie na dany rysunek lub bedzie sie mialo zaznaczony, i okno ustawien ma byc prostszy w zrozumieniu i lepiej dopracowany design na logiczniejszy i przedstawione jako przesuwalny popup. ale w popupie powinna byc opcja przeniesienienia go do lewej strony wykresu co nie spowoduje przesuniecia i efektu zmienienia wysokosci czy szerokosci wykresu [...] powinien byc do tego tez przelacznik ogolny»; (5) «ustawienia boxa, nie ma przelacznika widocznosci polowy boxa, powinno byc»; (6) «glowny pokaz trade to ma byc wykres, drugorzedne sa zrzuty»; (7) «powinna byc opcja schowania detali trade'a ktore sa ponizej wykresu podczas wyswietlania zrzutow lub wykresu lub edycji tego wykresu, zeby caly ekran zajmowal wykres oraz strzalki lewo prawo do przechodzenia miedzy wykresami mozesz przenisc nad wykres pomiedzy numerem trade'a a zamknieciem w tej samej linii»; oraz «najwazniejsza jest prostota i design». Decyzja sesji głównej (domyślne): komputer = panel przypięty, telefon (do 640 px) = okienko | (1) panel „Ostatnie trade'y” bez miniatur; w tabeli kadr = świece trade'a + 3 z każdej strony, interwał najmniejszy z 1m 2m 3m 5m 10m 15m 30m 1h 2h 4h 1D, przy którym sam trade ma najwyżej 16 świec (`miniPlan`, zastępuje `tf=auto&maxBars=80` i kadr −15%/+15% z etapu 11; wzór 13 min = 1m, 20 świec); trade bez wyjścia: 1m, 3 przed wejściem, 12 po (decyzja gustu). (2) lista stref = popularne (UTC, Warszawa, Londyn, Nowy Jork, Chicago, Los Angeles, Tokio, Hongkong, Singapur, Dubaj, Sydney) + każda pełna godzina UTC−12…UTC+14 (`Etc/GMT±N`, opis ze znakiem UTC); Ustawienia bez pola filtra, zapisana strefa spoza listy zostaje na górze, na wykresie w pozycji „Z Ustawień”; zastępuje „wszystkie strefy IANA” z P27. (3) linia BE pozycji (trade'a po odblokowaniu i każdej rysowanej) jest uchwytem jak kropka wyjścia (P28): przeciąganie w pionie, tick 0,25; trade: pole BE i „Zapisz w trade'zie” (PATCH, `edited`, 409), pozycja rysowana: zapis rysunków. (4) pasek stylu nad wykresem z P27 zastąpiony: zębatka przy rysunku (najechanie albo zaznaczenie) otwiera okienko przesuwane za nagłówek (pozycja w `thq.chart.stylePop.v1`), znika po kliknięciu obok i Esc; „Przypnij z lewej” = panel nałożony na lewą część wykresu (`position: absolute` w `.swc-stage`, wykres nie zmienia rozmiaru), pokazuje zaznaczony rysunek albo podpowiedź, „Odepnij” wraca do okienka; tryb w `thq.chart.styleDock.v1` (urządzenie), przełącznik w Ustawieniach → Ogólne „Ustawienia rysunku: Okienko / Panel przypięty” (decyzja gustu: bez nowej zakładki „Wykresy”); treść w grupach Linia/Obramowanie, Wypełnienie, Tekst, Poziomy, Podpisy (etykieta z lewej, kontrolka z prawej); panel pozycji trade'a w tym samym oknie, nie znika po kliknięciu w wykres. (5) „Linia połowy”: prostokąt i FVG = `rectMiddleLine`, Gann box = poziom 0,5 ceny i czasu; FVG rozpoznaje flaga `style.fvg` (prostokąt z linią połowy zostaje prostokątem). (6) okno trade'a otwiera się na „Wykres”, przełącznik „Wykres \| Zrzuty”; instrument bez źródła świec (np. EURUSD) i brak źródła wykryty przez serwer: zrzuty (decyzja gustu). (7) przycisk „Schowaj szczegóły” w górnej linii (`thq.lb.details.v1`, urządzenie) we wszystkich trybach; strzałki i przełącznik widoku w górnej linii: numer i widok \| poprzedni, następny \| szczegóły, zamknij; w widoku wykresu strzałki i ←/→ przechodzą do następnego trade'a (zrzuty tego samego trade'a mają ten sam wykres) |
| P30 | Kontrakty i P&L z cen (28.10.2026), ANULOWANE | Słowa użytkownika: wybór «Pole „Kontrakty” (Recommended)», potem anulowanie: «niech jednak w journalu pl nie byl liczony od rysunku, tylko byl staly taki jaki byl wpisany. wiec nie ma potrzeby dla kontraktowow i pl». Nic z P30 nie wchodzi do kodu (brak migracji 005, pola „Kontrakty” i liczenia P&L). P&L zostaje zawsze wpisany ręcznie i nietknięty; z cen w edytorze liczyło się tylko R (P28), cofnięte w P32: R też ręczne. |
| P31 | Kadr miniatur proporcjonalny do długości trade'a (28.10.2026) | Słowa użytkownika: «dla miniatur poprawka, jest taka ze jak trade jest krotki to powinno byc mniej swiec z boku, rysunek pozycji na wykresie powinien zawsze zajmowac okolo 80-90% nioezaleznie od jego szerokosci». Zamiast stałych 3 świec z każdej strony (P29) pozycja (wejście → wyjście) zajmuje 85% szerokości kadru, po ~7,5% marginesu z każdej strony liczonego w czasie (ułamek świecy przy krótkim trade'zie). `miniPlan` (interwał: trade ≤ 16 świec, zakres pobrania z zapasem 3 świec) bez zmian; `miniSvg` wybiera widoczne świece i skaluje oś przez `miniWindow`. Trade w jednej świecy liczy się jako 1 świeca i stoi pośrodku; trade bez wyjścia: kadr jak w P29 (decyzja gustu). Podgląd w lightboxie nie używa tego kadru. Test: `testy/wykresy-16-p31.mjs`. |
| P32 | Auto, sesje jako box z liniami do sweepu, PDH/PDL do sweepu, panel z X, kolejność stref, tekst w miejscu, ramka 0, R ręczne (28.10.2026) | Słowa użytkownika: (1) «tryb auto nawet jak jest wylaczony po wejsciu na wykres to jest on wlaczony i trzeba go przeklikac dwa razy i dopiero wtedy dziala»; (2) «tlo sesji zweyryfikuj poprawnosc tego oraz zmien na to ze tworzysz boxa w rangu sesji oraz z high/low wychodza linie z opisem. kiedy te high/low jest sweepniete powinno sie konczyc, tak samo pdh/pdl powinno sie konczyc po sweepie. dopracuj te dwie rzeczy i dodaj do nich ustawienia zeby uzytkownik mogl je dostosowac.»; (3) «jak ustawienia rysunku sa ustawione na boczne, to powinien miec on dalej x do zakmniecia, dlatego poniewaz mial on pelnic taka funkcje ze nawet jak odznaczymy jakis rysunek do ustawienia dalej dotycza tego ostatniego. jak zamkniemy boczne ustawienia to powinien on calkowicie zniknac i pojawic sie dopiero jak znowu nie klikniemy ustawien rysunku»; (4) «utc powinno byc w poprawnej kolejnosci»; (5) «pole tekstu ktore wpisujemy na wykres nie powinno miec innego wygladu podczas wpisywania niz wyglada po wpisaniu.»; (6) «rysunki powinny miec pole do kliknieca, gdzie maja ustawione pole tekstowe i jak sie je kliknie podwojnie to zaczynac pisac tam»; (7) «rysunek kwadrata powinna miec grubosc scian 0 czyli by znikaly»; (8) na pytanie, czy R ma dalej liczyć się z cen przy zapisie pozycji: «tez ma byc reczny»; oraz «najwazniejsza jest prostota i design» | (1) wyłączone „Auto” bez zakresu ręcznego (świeże otwarcie, strzałka do następnego trade'a) zaczyna od zakresu skali automatycznej i od razu trzyma go ręcznie (`startRange`); zakres przechodzi podgląd → edycja → podgląd (`frame.yr`, w edytorze `setVisibleRange` poprawione o marginesy skali LWC). Błąd: podgląd z zapisanym „Auto: wył.” liczył skalę automatycznie (brak `S.yr`), więc przycisk mówił „wył.”, a wykres działał jak „wł.”. (2) Sprawdzenie sesji: godziny NY i DST USA liczone dobrze (testy etapu 10); weekend i święta bez świec nie dają pasów; do poprawy były: pas tła na całą wysokość bez high/low, Londyn i Azja liczone zegarem NY (w tygodniach rozjazdu zmian czasu USA/Europa Londyn 02:00 ET to 06:00 zamiast 07:00 w Londynie, a Azja zimą startuje godzinę po otwarciu Tokio: zostawione jako konwencja ICT, pytanie do użytkownika), na interwałach od 1h box obejmuje świece, które zaczynają się w sesji (NY na 1h od 10:00). Teraz: box = czas sesji × high/low sesji (`overlayLevels` w `swiece.js`), linie H/L od prawej krawędzi boxa do pierwszej świecy, która wychodzi poza poziom (sweep, samo dotknięcie nie), nieprzebite do prawej krawędzi danych; PDH/PDL od początku sesji do sweepu albo końca tej sesji; opisy „Azja H”, „Londyn L”, „NY H”, „PDH”. Wspólna geometria `overlayGeometry` dla SVG i LWC (test zgodności 1 px z LWC: `testy/nakladki-p32.html`). Ustawienia w popoverze przy przełącznikach „Sesje” i „PDH/PDL” (jak popover interwałów; decyzja gustu: nie w Ustawieniach → Ogólne): włączenie, godziny w czasie NY z przeliczeniem na strefę osi, kolor i krycie boxa per sesja, linie (pokaż, opisy, kończ na sweepie, styl, grubość), ramka boxa 0–4, PDH/PDL kolor/styl/grubość, „Przywróć domyślne”; zapis w `thq.chart.overlays.v1` (stary zapis czytany dalej); kolory domyślne z tokenów. (3) panel przypięty otwiera zębatka, ma X, po odznaczeniu zostaje z ostatnim rysunkiem (podpis „ostatnio wybrany” i tekst rysunku), zaznaczenie innego rysunku przełącza panel, X chowa do następnego kliknięcia zębatki, usunięcie rysunku zamyka panel (decyzja gustu). (4) jedna lista stref rosnąco po bieżącym przesunięciu UTC, popularne wplecione (przy tym samym przesunięciu najpierw „UTC+N”, potem miasta), w Ustawieniach i na wykresie (zastępuje dwie grupy z P29). (5)-(6) tekst w trakcie pisania rysuje sam wykres (ten sam krój, rozmiar, kolor, wyrównanie, miejsce), nad nim przezroczyste pole z samym kursorem; dwuklik w miejscu tekstu linii poziomej, linii trendu, prostokąta i tekstu (także pustym: tam, gdzie tekst by się pojawił, `textSlot`) zaczyna edycję, Enter i klik obok zatwierdzają, Esc anuluje. Przy okazji: tekst (narzędzie „Tekst”) i tekst prostokąta przy krawędzi stoją w podglądzie tam, gdzie w edycji (różnica 4,7 px i ~9 px). (7) prostokąt i FVG mają grubość ramki 0 (linie nie), zaznaczenie dalej działa. (8) odstępstwo od P28: zapis pozycji nie wysyła R ani P&L i nie pokazuje R w „Po zapisie”; R i P&L zawsze ręczne. Testy: `testy/wykresy-17-p32.mjs`, `testy/nakladki-p32.html`, `testy/wykresy-e2e-p32.mjs`. |
| P33 | Zegar sesji Londyn i Azja (28.10.2026) | Pytanie z P32: zegar NY czy zegar własnej giełdy. Słowa użytkownika: wybór «Zegar Nowego Jorku (Recommended)». Zostaje jak w P8 i P32: Azja, Londyn i NY liczone zegarem Nowego Jorku (killzone'y ICT); w tygodniach różnicy czasu USA/Europa Londyn startuje 06:00 czasu londyńskiego, zimą Azja godzinę po otwarciu Tokio — świadomie. |
| P34 | Migający kursor przy wpisywaniu tekstu (28.10.2026) | Słowa użytkownika: «tam gdzie mozna wpisac tekst powinien migac taki pasek, zeby cokolwiek pokazac gdzie jest to pole». Poprawka P32 pkt 5–6: natywny kursor pola z przezroczystym tekstem nie był widoczny na wykresie, więc pole ma `caret-color: transparent`, a kursor rysuje element `.swc-caret` (2 px, kolor tekstu rysunku, wysokość = rozmiar czcionki, miganie 1 s w CSS, przy `prefers-reduced-motion` stały), stojący na końcu tekstu (albo przy kursorze pola) w miejscu narysowanego tekstu, także przy pustym polu, z wyrównaniem i obrotem. Wygląd tekstu podczas pisania bez zmian (P32 pkt 5). Gust: wskazówki po najechaniu na rysunek z pustym polem tekstu nie dodano (zaśmiecałaby wykres; kursor po dwukliku wystarcza). |
| P35 | Zmiana kontraktu (roll) wg przewagi obrotu, pole „Kontrakt”, B-ADJ (28.10.2026), ZAMKNIĘTE. Zmienia P1 (chwila przełączenia) | Słowa użytkownika (wybory w pytaniach): (1) «Tak żeby było jak najbardziej poprawnie» (na otwarciu sesji CME 17:00 Chicago; «sprawdź regułę względem danych: dzień, w którym obrót następnego kontraktu przewyższa bieżący; wybierz regułę dającą najbardziej poprawny wynik i uzasadnij pomiarem na 2010–2026»); (2) «Tak, do 0,40 USD», potem po poprawionej wycenie «Całość 2010–2026: 2,18 USD (Recommended)» (górna granica 2,30 USD); (3) «Opcja, domyślnie wył.»; (4) «Tak, pole „Kontrakt”»; oraz «najwazniejsza jest prostota i design» i «Zrób to tak żeby było jak najbardziej jakościowo, nie masz ograniczeń, ma być wszystko idealnie». Audyt: `wykresy-wyniki/roll-audyt.md` | (1) Reguła z pomiaru (PRZETESTOWANE, `wykresy-wyniki/p35/regula.mjs`, tabela `regula-tabela.md`): czwartek 8 dni przed 3. piątkiem (konwencja CME) NIE jest dniem przewagi obrotu w żadnym z 130 zmierzonych rolli (ES 0/65, NQ 0/65; w sesji czwartku nowy kontrakt ma 1,3–47,6% obrotu obu kontraktów). Przewaga przychodzi w piątek (ES 43, NQ 39; prawie wszystkie do 2022), w poniedziałek tygodnia wygaśnięcia (ES 22, NQ 23; od czerwca 2022 ES 18/18, NQ 15/18) albo we wtorek (NQ 3). `.v.0` Databento nie trafia ani razu (przechodzi później, w środę). Dlatego seria przełącza się na otwarciu zmierzonej sesji przewagi obrotu dla każdego rolla (`measureSwitches` w `lib/candles.mjs`: pierwsza sesja, w której obrót nowego kontraktu > starego, liczona z pobranych świec), a bez pomiaru (bieżący roll przed danymi, dziura w danych 12–13.06.2014 dla ES i NQ) reguła zapasowa: poniedziałek tygodnia wygaśnięcia (`ROLL_FALLBACK_DAYS` = 4). Przykład: ESZ5 → ESH6 w sesji poniedziałku 15.12.2025 (ESH6 975 tys. vs ESZ5 590 tys.; czwartek 65 tys. vs 1,51 mln). TradingView: wg źródła zewnętrznego z audytu NQ1! przełączył 14.06.2024, pomiar obrotu daje 17.06.2024 (CZĘŚCIOWE); porównanie z ES1! na żywo niemożliwe (TradingView Desktop nie uruchomił się z CDP). Wygaśnięcie: trzeci piątek, Wielki Piątek i Juneteenth (od 2022, też obchodzony 18.06.2027) przesuwają na czwartek. Świece kontraktu spoza `.v.0` w warstwie kontraktu (`1m-ESH2026`, `1s-…`) po symbolu surowym Databento (`ESH6`, `stype_in=raw_symbol`), nie z `.v.1` (181 odcinków ES 2010–2026). Przełączenia `.v.0` i nazwy kontraktów z darmowego `symbology.resolve` (`chart-data/contracts-es.json`, `-nq.json`). Okno niepobrane: seria pokazuje `.v.0`, `missing` wskazuje okno. (2) Koszt: import okien rolli (od sesji przed czwartkiem CME do przełączenia `.v.0`, 132 okna) przez `/api/candles/import` (`series=contracts`, świeża wycena tuż przed pobraniem, strażnik kredytu i licznik): **wydano 2,183943 USD** (ES 1,140045, NQ 1,043898; 598 212 świec 1m). Kredyt wg portalu Databento (liczniki aplikacji zaktualizowane o to pobranie). Limity aplikacji przed i po: nieustawione (domyślne 1 USD na pobranie, 3 USD na dobę); podniesione tylko na czas przebiegu (`limitsOverrideUsd` 1,20 i 1,10, nie zapisywane). Wycena 0,30 USD z audytu była zaniżona przez wyścig `tot += await cost()` w `Promise.all`; poprawne sumowanie: `wykresy-wyniki/p35/wycena2.mjs`. Kolejne kwartały: plan zwykłego pobrania i kolejka okien trade'ów dokładają okno pomiaru nowego kontraktu (ok. 0,04 USD na kwartał ES+NQ) w istniejących limitach. (3) Przycisk „B-ADJ” w pasku (`thq.chart.badj.v1`, domyślnie wył.): kontrakt przesunięty o sumę luk późniejszych rolli (zamknięcie nowego − starego na ostatniej wspólnej minucie ostatnich 2 h sesji przed przełączeniem, jak B-ADJ TradingView); ostrzeżenie w `--warn`; rysunki i poziomy nieprzeliczane; w edycji wyłączony. (4) Migracja 005 (`rich_text` „Kontrakt”/„Contract”, rola `contract`), pole w formularzu (walidacja: kod miesiąca FGHJKMNQUVXZ, ES/NQ/MES/MNQ tylko kwartalne i zgodne z instrumentem), puste = wg daty trade'a (bez godziny: południe w Chicago dnia handlowego). Kontrakt trade'a obowiązuje w całych sesjach trade'a; lista na wykresie (Auto + wiodący + drugi notowany) zapisuje pole przez `PATCH /api/trades/:id` z `edited` (409). Migracja na prawdziwym Notion: sesja główna za zgodą użytkownika. (5) Znacznik „ESZ5 → ESH6” (bez par przez puste odcinki, napisy bez nachodzenia); 1D i 4h czyste; 1W/1M z serii ciągłej (tydzień rolla: open starego, close nowego, jak ES1! bez B-ADJ, WYWNIOSKOWANE); PDH/PDL po zmianie kontraktu z poprzedniej sesji w kontrakcie wyświetlanym (`prevIn`). Ryzyko (a): trade'y atrapy trafiają w świece 7/7 (`p35/trafienia.mjs`); trade testowy „NQ 2024 wygrana (stare)” z 12.03.2024 miał ceny z `.v.0` (NQH4) mimo przewagi NQM4 od 11.03: launchery generują go teraz z NQM4. Testy: `testy/wykresy-18-p35.mjs` (14), `testy/wykresy-e2e-p35.mjs` (16); zrzuty `wykresy-wyniki/P35-*.png` |
| P36 | Kolejka pobiera tylko okna 1s; minutówki na kliknięcie (28.10.2026), ZAMKNIĘTE. Zawęża P35 (przegląd P35, W4) | Słowa użytkownika: «okej to wroc» (po pytaniu o szerszy automat 1m z P35) | Powrót do P25: automatycznie (kolejka, `enqueue`/`tick`) pobierane są wyłącznie okna 1s wokół trade'a, także w warstwie kontraktu trade'a (`1s-ESZ2025`). Minutówki sesji trade'a i historia kontraktu (`.v.0`, warstwy `1m-<kontrakt>`) tylko po kliknięciu przycisku z wyceną (`quote` → `fetchDays` z `confirmedCostUsd`) albo przez import (`/api/candles/import`). Brak minutówek wykres pokazuje w `missing` (przycisk „Sprawdź koszt”, potem okno z kosztem i „Pobierz”). Okno pomiaru rolla w zwykłym planie pobrania zostaje (P35). Test: `wykresy-18` „plan pobrania i kolejka” (czerwony na kodzie sprzed zmiany: w kolejce były pozycje `1m`). Komentarz z datą przy `enqueue` w `lib/candles.mjs` |
| P37 | Poprawki po weryfikacji rolli (28.10.2026), ZAMKNIĘTE | Słowa użytkownika: «ma być wszystko idealnie … ma działać naprawdę wszystko przez pełny okres wszystkich lat». Decyzja sesji głównej: poprawić P7 (sesje sprzed 20.09.2015 trwają do 17:00), P1 (znacznik rolla na pierwszej świecy ≥ chwila rolla), P2 (znacznik „brak danych” przy dniach handlowych bez świec poza świętami), P3 (PDH/PDL nie biorą sesji sprzed dziury), P5 (znacznik rolla przy kadrze po starym kontrakcie) | `swiece.js` (SHORT_SESSIONS_FROM, sessionOf), `geometria.js` (rollIndex, gapIndex), `lib/luki-danych.mjs`, `candles.mjs` (gaps, P5), testy `wykresy-19`; kontrola 1D każdego dnia 2010–2026: rozjazdy 1 190 → 0 na instrument. Szczegóły: `wykresy-wyniki\P37.txt` |
| P38 | B-ADJ domyślnie włączony, kotwica = kontrakt trade'a, także w edycji (28.10.2026), ZAMKNIĘTE. Zmienia P35 pkt 3 (B-ADJ domyślnie wył., wyłączony w edycji) | Słowa użytkownika: «okej wedle naszej rozmowy  BADJ domyslnie wlaczony w ustawieniach przelacznik». Z rozmowy: użytkownik handluje ICT i potrzebuje poprawnej struktury HTF sprzed rolli; B-ADJ liczy się względem kontraktu trade'a (jego ceny prawdziwe, wejście, SL, TP, BE i rysunki trafiają co do ticka), starsze kontrakty o sumę luk do niego, nowsze w drugą stronę; bez trade'a kotwica to najnowszy kontrakt. Decyzja sesji głównej: przycisk B-ADJ na wykresie przełącza widok tylko chwilowo | `kontrakty.adjustOffsets(gaps, anchor)`, `candles.mjs` (kotwica = kontrakt trade'a, `adjust.anchor`), Ustawienia → Ogólne: „B-ADJ domyślnie włączony” (`chartBadj`, synchronizowane), `podglad.js` (setBadjDefault, badjWarning, settle bez wyłączania), `wykres.js` (B-ADJ w edytorze, adjGen), testy `wykresy-20` i `wykresy-e2e-p38`. Rysunki zapisują się w skali osi = skali kontraktu trade'a; trade bez czasu: B-ADJ w edytorze zablokowany. Szczegóły: `wykresy-wyniki\P38.txt` |
| P39 | Pakiet H: bez przycisku „Usuń pobrane świece” (28.10.2026), ZAMKNIĘTE. Zmienia etap 14 (grupa Dane) | Słowa użytkownika (AskUserQuestion): «Bez przycisku» | grupa Dane pokazuje tylko rozmiar `chart-data/`; usuwanie świec wyłącznie ręcznie z dysku (to płatne dane, ponowne pobranie znów kosztuje) |
| P40 | Pakiet H: limity Databento tylko do podglądu (28.10.2026), ZAMKNIĘTE | Słowa użytkownika (AskUserQuestion): «Tylko podgląd» | Ustawienia pokazują limit na pobranie, limit dzienny, dzisiejsze wydatki i stan kredytu; zmiana wyłącznie w `config.local.json`, bez pól edycji w UI |
| P41 | Pakiet H: strefa czasowa (P33) i B-ADJ (P38) w zakładce „Wykresy” (28.10.2026), ZAMKNIĘTE | Słowa użytkownika (AskUserQuestion): «Przenieść do „Wykresy”» | obie opcje przenosimy z „Ogólne” do nowej zakładki; zachowanie i klucze (`chartTz`, `chartBadj`) bez zmian |
| P42 | Pakiet H: nakładki synchronizowane przez Notion (28.10.2026), ZAMKNIĘTE | Słowa użytkownika (AskUserQuestion): «Tak, synchronizować» | stan nakładek (tło i godziny sesji, PDH/PDL) przechodzi z localStorage do `settings.chart` (sync, biała lista); stary zapis localStorage czytany raz jako wartość początkowa. Ulubione interwały, auto-skala i dok panelu zostają lokalne |
| P43 | Karty i filmy v2: clean look, mniej danych (29.10.2026), ZAMKNIĘTE. Zmienia etap 17/18 (układ kart) | Słowa użytkownika: «popraw design i film, skupiajac sie na tym zeby zmniejszyc ilosc danych i skupic sie na wiekszej jakosci wygladu wykresu jak i jego filmiku, ma na pewno byc wyzszy w 9:16 i dodaj filmik 1:1 … zostaw tylko najwazniejsze dane … usun poswiate wyniku … bo jak jest rozplaszczony to nic nie widac»; inspiracje: 4 karty LiquidJournal (układ elementów) | karta trade'a: duża liczba + cena wejścia, cena wyjścia, wynik w R (wybór: «Cena wejścia i wyjścia, Wynik w R»); wynik bez poświaty i bez podkładki («Bez podkładki», reguła „bez zaokrąglonych podkładek pod tekstem” zostaje); wykres wyższy w 9:16, ciaśniejsza skala ceny; nowy format filmu 1:1 |
| P44 | Duża liczba do wyboru w Udostępnij (29.10.2026), ZAMKNIĘTE | Słowa użytkownika (AskUserQuestion): «Do wyboru w Udostępnij» | przełącznik $ / R / % w oknie, domyślnie jak w Ustawieniach wyniku; druga jednostka w wierszach |
| P45 | Rysunek pozycji: strefy jak w TradingView, tryb do wyboru w Udostępnij (29.10.2026), ZAMKNIĘTE | Słowa użytkownika: «daj opcje podczas udostepnij … czy chce zeby bylo widac rysunek pozycji czy tylko miejsca wejscia wyjscia oraz popraw ten rysunek pozycji, bo nie da sie z niego nic wyczytac»; wybór: «Strefy jak w TradingView» | tryb „pozycja”: od wejścia do wyjścia w czasie zielona strefa wejście→TP, czerwona wejście→SL, wyraźna linia wejścia, punkt wyjścia; bez SL/TP strefa wejście→wyjście w kolorze wyniku. Tryb „wejście/wyjście”: same znaczniki jak na inspiracjach |
| P46 | Wygląd wykresu w Udostępnij i osobno dla miniatur (29.10.2026), ZAMKNIĘTE | Słowa użytkownika: «daj opcje podczas udostepnij, gdzie mozesz wybrac wyglad wykresu»; «w ustawieniach powinna byc opcja osobno ustawienia stylu wykresu dla miniatur»; wybór stylów: «Świece, Linia biała (jak inspiracje)» | dwa style: świece i jasna cienka linia ceny; wybór w oknie Udostępnij; osobne ustawienie stylu miniatur w Ustawieniach → Wykresy |
| P47 | Karty okresu: krzywa kapitału w clean looku (29.10.2026), ZAMKNIĘTE | Słowa użytkownika (AskUserQuestion): «Krzywa kapitału» | krzywa jak dotąd, nowy wygląd; dane: liczba trade'ów, win rate, najlepszy trade |
| P48 | Seria testowa i ocena (29.10.2026), ZAMKNIĘTE | Słowa użytkownika: «stworz wiele filmikow i zdjec i sprawdz … na roznych typach trade i ustawieniach … tak na prawde wszystkie przypadki … masz sprawdzac czy wykres jest czytelny, pozycja jest czytelna, look jest clean»; «Syntetyczne trade'y na prawdziwych świecach»; «masz ty najpierw ocenic i wprowadzic swoje poprawki do momentu az nie bedzie osiagniety cel a pozniej ja w rekomendowanej opcji» | syntetyczne trade'y na świecach już na dysku (zero Notion, zero Databento); PNG + MP4 w wykresy-wyniki/galeria-v2/ z index.html (siatka, opis przypadku, ocena); najpierw pętla oceny i poprawek po naszej stronie, potem przegląd użytkownika |
| P49 | Import 1s NQ 9:30–11:00 NY od 2020 (29.10.2026), ZAMKNIĘTE. Wyjątek od P2 (limity) tylko dla tego importu; przed P43–P48 | Słowa użytkownika: «wykres by lepiej wygladal jakbysmy mieli dane sekundowe … idealne dla krotkich trade … nadbudowac baze danych swiec 1s od 9:30 ny open do 11:00, tylko na nq na okres od 2020»; wybory (AskUserQuestion): «Tak, z twardym limitem 36 USD», «Jednorazowy budżet tylko dla tego importu», «Najpierw import, potem karty». Wycena sesji głównej: ok. 1719 sesji × 0,0195 USD ≈ 33,6 USD (get_cost na 29 dniach) | narzędzie importu z własnym budżetem 36 USD (stop przy sumie), partie ≤ 1 USD, get_cost przed każdym get_range; kontrakt wg reguły rolla P35; limity aplikacji (1 USD / 3 USD dziennie) bez zmian dla zwykłych pobrań; licznik kredytu aktualizowany Decyzja sesji głównej (29.10.2026, przegląd 1.3.0): import nadal nalicza się do dziennego limitu 3 USD (hak importu wywołuje guard.beforeRange), więc w dniu importu zwykłe pobrania i kolejka P50 czekają do północy UTC; to ogranicza wydatki, nie zwiększa ich. |
| P50 | Codzienne okno 1s NQ 9:30–11:00 NY w kolejce (29.10.2026), ZAMKNIĘTE | Słowa użytkownika: «i dodaj tak ze codziennie przy tych codziennych import zawsze pobieramy sekundowki dla nq dla tej poltorej godziny od 9:30 ny open». Decyzja sesji głównej: kolejka aplikacji, nadrabianie, zwykłe limity, przełącznik domyślnie włączony w config.local.json | kolejka (`candles.tick()`, timer serwera co 5 min) sama dokłada okno 1s NQ 9:30–11:00 America/New_York każdego dnia pon-pt, gdy okno jest dostępne w Databento (koniec okna ≤ `availableEnd` z `get_dataset_range`), kontrakt wg reguły rolla P35 (`seriesSegments`, warstwa `1s-<kontrakt>` w dniach między rollem a przełączeniem `.v.0`); nadrabia dni pominięte przy wyłączonym dashboardzie od ostatniego dnia z oknem w magazynie (nie wcześniej niż 2020-01-02), okna w magazynie pomija; zwykłe limity aplikacji (1 USD na pobranie, 3 USD na dobę, strażnik kredytu), budżet 36 USD z P49 dotyczy tylko jednorazowego importu; przełącznik Ustawienia → Wykresy → Dane „Codziennie pobieraj 1s NQ 9:30–11:00 NY”, domyślnie włączony, stan `chartNq1sDaily` w `config.local.json` (urządzenie i pieniądze, nie settings ani Notion), zapis przez `/api/config`; automatykę włącza tylko serwer (`createCandles({ autoOpenWindows: true })`). Testy: `testy/wykresy-28-p50.mjs` |
| P51 | Nadrabianie najwyżej 7 dni wstecz (29.10.2026), ZAMKNIĘTE. Zawęża P50 (nadrabianie od 2020-01-02) | Słowa użytkownika: «zgadzam sie» (na pytanie sesji głównej: automat nadrabia najwyżej 7 ostatnich dni, ok. 0,14 USD; dłuższe dziury tylko jednorazowym importem z budżetem i zgodą) | kolejka P50 dokłada tylko okna z ostatnich 7 dni kalendarzowych (dni pon-pt w tym zakresie, `OPEN_CATCHUP_DAYS` w `lib/candles.mjs`, komentarz z datą), także przy pustym magazynie 1s; starszych okien sama nigdy nie pobiera (to robi `narzedzia/import-okien-1s.mjs` z budżetem P49). Test: `wykresy-28` „P51 nadrabianie najwyżej 7 dni wstecz” (czerwony na kodzie sprzed zmiany) |
| P52 | Wymienne wiersze danych na kartach i przebudowa okna Udostępnij (29.10.2026), ZAMKNIĘTE. Rozszerza P43 (dane karty) i P47 (dane okresu) | Słowa użytkownika: «dodaj opcje ze te dane oprocz duzej liczby da sie wymieniac, czyli masz maksymalna ilosc ale mozesz sobie dobrac jakie chcesz. zreworkuj takze wyglad ustawien tworzenia tych zdjec/filmu, jest zbyt napakowany, a za malo funckjonalna designowy, ma byc bardzo dorpacowny» | 1) wiersze danych pod dużą liczbą do wyboru w oknie Udostępnij, do stałego maksimum (decyzja gustu: 4 we wszystkich formatach); domyślnie zestaw z P43 (trade: cena wejścia, cena wyjścia, druga jednostka) i P47 (okres: liczba trade'ów, win rate, najlepszy trade); do wyboru tylko pola istniejące w danych (trade: wejście, wyjście, druga jednostka, R, $, % konta, SL, TP, godzina wejścia i wyjścia, czas trwania, setup, sesja, kontrakt; okres: trade'y, win rate, najlepszy i najgorszy trade, druga jednostka, średni R, profit factor, wygrane/straty, zielone dni/miesiące, najlepszy dzień/miesiąc; rozmiaru pozycji trade nie ma w danych); wybór w `settings.chart.rowsTrade` / `rowsPeriod` (synchronizacja, biała lista `normRows` w `sanitizeChart`), osobno trade i okres; pusta wartość = wiersz znika; duża liczba nie powtarza się w wierszach w tej samej jednostce. 2) okno Udostępnij przebudowane: duży podgląd jako bohater, grupy Plik (obraz/film, format) → Karta → Wykres (wygląd, rysunek pozycji) → Duża liczba → Dane → Tło, rzadsze opcje w zwijanym „Więcej opcji”; istniejące kontrolki (.seg, .pill, .btn), tokeny; wzory Refero: Luma AI (share z podglądem) i Arcade (eksport). Testy: `wykresy-29-v2.mjs`. Szczegóły: `wykresy-wyniki\v2.txt` |
| P53 | Karta bez adresu strony (29.10.2026), ZAMKNIĘTE | Słowa użytkownika: «1. nie dodawaj adresu 2. pokaz 6 najczestczszych i reszte pokaz wszystkie 3. tak 4. tak» (pkt 1, na pytanie o adres w prawym dolnym rogu jak na inspiracjach) | podpis zostaje „JustJournal × nick”, bez adresu; bez zmian w kodzie |
| P54 | „Dane” w oknie Udostępnij: 6 najczęstszych i „Pokaż wszystkie” (29.10.2026), ZAMKNIĘTE. Uzupełnia P52 | Słowa użytkownika: «1. nie dodawaj adresu 2. pokaz 6 najczestczszych i reszte pokaz wszystkie 3. tak 4. tak» (pkt 2) | grupa „Dane” pokazuje 6 najczęstszych pigułek (decyzja gustu: trade = cena wejścia, cena wyjścia, druga jednostka, SL, TP, czas trwania; okres = trade'y, win rate, najlepszy i najgorszy trade, druga jednostka, profit factor; kolejność katalogu), resztę po „Pokaż wszystkie” z „Zwiń” (aria-expanded, aria-controls, stan tylko w oknie); zaznaczona pigułka spoza szóstki widoczna także po zwinięciu. `TRADE_ROWS_TOP`, `PERIOD_ROWS_TOP`, `visibleRows` w `styl-wykresu.js`; testy `wykresy-29-v2` (P54) i E2E `wykresy-e2e-i` I1 (P54) |
| P20 | rozstrzygnięte 29.10.2026, ZAMKNIĘTE | Słowa użytkownika: «1. nie dodawaj adresu 2. pokaz 6 najczestczszych i reszte pokaz wszystkie 3. tak 4. tak» (pkt 3: fragmentowany MP4 z nagrania przeszedł na Instagramie i TikToku; pkt 4: kredyt potwierdzony wg portalu Databento) | etap 18b (przepakowanie MP4) niepotrzebny; liczniki kredytu bez zmian |
| P55 | TF poniżej minuty na całym wykresie: prawdziwe 1s w oknach, podział świec 1m poza nimi (29.10.2026), ZAMKNIĘTE. Zmienia odczyt TF < 1m z P25 (poza oknem 1s pusto) | Słowa użytkownika: «wykres powinien dzialac w taki sposob ze jak sa sekundowki to wciaz sa dane na wykresie z minutowek i wlaczajac tf np 30s, to dalej widac caly okres jaki jest. 30s timeframe uzywam do zobaczenia egzekucji wiec dlatego potrzebuje tylko na ta dana poltora godziny ale nie powinna uzywac innych timeframe i ogolnie uzytkowania wykresu. wiec tak. caly wykres ma byc w pelni dzialajacy jak przed danymi 1s, a sekundowki pozwalaja na to ze jak zmniejsze timeframe to tylko czesc ta wykrtesu ktora ma dane zmienia sie na te prawdziwe sekundowki a reszta znajdz rozwiazanie tak zeby nie bylo pustych pol np. podzielic na pol minutowke i wtedy jest 30s i analogicznie inne. bo prawdziwe i tak beda z tych godzin co mam i one beda prawdziwe»; wybory (AskUserQuestion): «Ścieżka O→L→H→C» (podział świecy 1m) i «Lekko przygaszone» (wygląd świec z podziału). Przyczyna błędu: `readOne` dla TF < 1m czytał wyłącznie warstwę 1s, więc poza oknami 9:30-11:00 NY nie było świec, a oś po indeksie skleiła wyspy z kolejnych dni | (1) Odczyt TF poniżej minuty i nie będących wielokrotnością minuty (`lib/candles.mjs` `readOne`, `mixSynthetic`): minuta z pokryciem 1s bierze prawdziwe świece 1s, minuta bez pokrycia dzieli świecę 1m (`swiece.splitMinute`: ścieżka open → pierwsze ekstremum → drugie ekstremum → close, wzrostowa najpierw dołek, spadkowa najpierw szczyt, odcinki po 20 s, interpolacja liniowa, high/low części = max/min ścieżki w jej przedziale, wolumen równo z zachowaniem sumy); TF dzielący minutę (1s…30s) dzielone wprost, inne (np. 45s, 90s) przez 1s syntetyczne i agregację. Minuta choćby częściowo pokryta oknem 1s zostaje w całości prawdziwa, więc na granicy okna nie ma dziury ani dubla. Rolle (P35), B-ADJ (P38) i kontrakt trade'a jak dla 1m (odcinki serii liczone z warstwy 1m, przesunięcie B-ADJ na obu źródłach). (2) Odpowiedź: świece syntetyczne mają `1` na pozycji 6, pole `synth` = zakresy [od, do) minut z podziału; `missing` = brak i 1m, i 1s; `gaps` (dziury w danych) liczone jak dla 1m; `layer` zostaje `1s`. `tf=auto` (miniatury) czyta jak przed P55, bez świec syntetycznych. (3) Klient: świece syntetyczne w osobnych ścieżkach `.synth` z krytym 0,55 (`SYNTH_ALPHA` w `geometria.js`, CSS `svg .synth`), w edytorze LWC kolor z alfą (`seriesData`, `dimColor`), dymek z dopiskiem „z 1m” (EN „from 1m”, także etykieta czasu kursora w edytorze). Zapas ładowania dla TF < 1m najwyżej 8000 świec z każdej strony (`padFor`; 30s: doba, 5s: 11 godzin, 1s: 2,2 godziny). Limity: odpowiedź najwyżej `MAX_BARS` = 50 000 świec (30s ok. 17 dni sesji), TF nie dzielące minuty najwyżej 3 mln sekund syntetycznych (decyzja gustu). (4) Karty Udostępnij chcą prawdziwych sekund: odpowiedź z niepustym `synth` nie jest „pełna” (`full1s` w `udostepnij.js`), karta bierze 1m jak przed P55 (decyzja gustu: karty bez przygaszonych świec). Testy: `testy/wykresy-30-p55.mjs`, `wykresy-04` (zmieniony jeden zapis: TF < 1m bez okna 1s nie jest już pusty) Ponad pierwotny plan P55 (przegląd 1.3.0, 29.10.2026): (a) znacznik rolla także przy kontrakcie trade'a wybranym przez regułę (`ovr.auto`), bo doładowywane porcje historii gubiły go przy przewijaniu (też na 1m); (b) przy zmianie TF kadr zostaje wokół środka (`limitSpan` z `center`), a przejście na TF poniżej minuty z oddalonego widoku przycina kadr do 1500 świec nowego TF jeszcze przed żądaniem (`clampFrameTf`); (c) limity odczytu mieszanego liczone przed odczytem (`sessionSecUpper`, `MAX_SYNTH_1S` = 600 000 s) i górny limit 40 000 świec w pamięci przy TF poniżej minuty (`capBars`, decyzja gustu); (d) odczyty `GET /api/*` odrzucają `Sec-Fetch-Site` inny niż `same-origin` i `none`. |
| P56 | Wydanie 1.3.0 i aktualizacja dziennika na produkcji (29.10.2026), ZAMKNIĘTE (decyzja); wykonanie po kolei według listy obok | Słowa użytkownika: «po zakonczeniu wszystkich prac, masz pozwolenie na wdrozenie 1.3.0 na produkcje». Odpowiedzi na pytania sesji głównej: (1) GitHub: «Tak, push i release też»; (2) Notion: «To pozwolenie wystarczy»; (3) dane: «Wszystko + klucz». Źródło: `wykresy-wyniki/decyzje-wydanie-130.txt` | (1) GitHub: po review i audycie bezpieczeństwa push `main`, tag `v1.3.0` i wydanie z `tree-sha256` i notatkami PL/EN na `Paneksu/local-trading-journal`; przed pushem skan na tokeny, identyfikatory z `.env` i e-mail. (2) Notion: kopia i dry-run migracji 003–005 na prawdziwym Notion nadal obowiązkowe; gdy dry-run pokaże tylko dodanie pól (bez usuwania i zmian istniejących), migracja i start 1.3.0 bez dodatkowego pytania; cokolwiek innego w dry-runie oznacza stop i pytanie. (3) Dane: przeniesienie `chart-data` (ok. 510 MB), liczników kredytu Databento i klucza Databento z `.env` worktree do instalacji produkcyjnej (`R:/PROJEKTY/trading-hq`). Kolejność: P55 → review i audyt diffu `feat/wykresy` względem `main` z poprawkami → etap 12 / G (README PL/EN, CHANGELOG, `package.json` 1.3.0, testy `wykresy-32`, przepisany `udostepnij-e2e` na okno v2) → scalenie do `main`, tag, `suma-wydania`, push, release → aktualizacja instalacji (port 4321): kopia Notion → dry-run → migracja → dane i klucz → smoke test. Etap 12 wykonany 29.10.2026 (lokalny commit, bez push i bez tagu) |

---

## 1. Zasady nadrzędne: prostota i wygląd

Słowa użytkownika: «takze mi BARDZO ZALEZY NA PROSTOCIE MODULU ORAZ DESIGNIE TAKIM SAMYM JAK RESZTA STRONY, ZEBY TO WYGLADALO jak czesc strony i mialo np mozliowsc przezroczystego tla itp»

Te dwie zasady wygrywają z każdą inną decyzją w tym dokumencie. Każda decyzja architektury niżej ma dopisek **[P]** (prostota) albo **[W]** (wygląd), który mówi, której zasadzie służy.

### 1.0 Test prostoty i designu dla v3 (P17, 27.10.2026)

Słowa użytkownika: «dodaj do planu ze najwazniejsza jest prostota i design». Prostota i design wygrywają z zakresem funkcji. Każda funkcja v3 (wykres w kartach, filmy, style wykresu, Ustawienia → Wykresy) musi przejść trzy pytania:
1. Czy powstaje **bez nowego renderera**? Karty i filmy rysuje istniejący `udostepnij-render.js` (canvas), podgląd istniejący `podglad.js` (SVG); oba biorą kształty z jednej `geometria.js`.
2. Czy powstaje **bez nowej zależności**? Zero npm, zero wklejonych bibliotek do wideo (MediaRecorder z przeglądarki, p. 3.11).
3. Czy wygląda **jak dashboard**, bez nowego „systemu” UI? Te same `.seg`, `.check`, `.sp-in`, `.btn`, `.note`, popover Ustawień z zakładkami, okno Udostępnij.

Funkcja, która nie przechodzi, idzie na start w węższym zakresie, a reszta do „Później” (p. 5.2). Skutki: 2 style wykresu na start (p. 3.12), jeden sposób nagrywania i dwa formaty filmu (p. 3.11), Ustawienia → Wykresy jako jedna zakładka z 4 grupami na start (p. 3.13).

### 1.1 Prostota

- **Cztery pojęcia, cztery warstwy:** dane (pobieranie i magazyn), agregacja (czyste funkcje), widok (wykres), rysunki. Nic więcej. Żadnych wtyczek, rejestrów dostawców, konfiguracji w YAML ani klas bazowych.
- **Jedno źródło danych** (Databento), dwa symbole u źródła (`ES.v.0`, `NQ.v.0`), jedna reguła sesji (CME).
- **Świadomy wyjątek od prostoty (P12, 26.10.2026):** mamy **dwa renderery** tego samego wykresu: własny SVG do oglądania i Lightweight Charts do rysowania. Płacimy tym za [W] na wyraźne życzenie użytkownika. Koszt ograniczamy trzema regułami: (1) jeden model danych (te same świece, ten sam JSON rysunków w formacie paczki 0.6.2, ta sama agregacja), (2) jedna czysta funkcja geometrii rysunków z testem zgodności z LWC (p. 3.8), (3) podgląd niczego nie edytuje, więc nie powiela logiki rysowania, zaznaczania ani zapisu.
- **Mało plików:** 10 nowych plików kodu (v3: +`styl-wykresu.js`, +`film.js`) + 2 biblioteki w `public/vendor/` + 1 migracja + 1 atrapa testowa + 2 strony testowe (lista w p. 3.1). Karty z wykresem i filmy nie dostają własnego renderera: rysuje istniejący `udostepnij-render.js`.
- **Wąski zakres na start:** z 86 narzędzi paczki rysowania pokazujemy 7 (p. 5.1). FVG to gotowy prostokąt z linią środkową, a nie własne narzędzie. Tło sesji i PDH/PDL to przełączniki „Nakładki”, nie rysunki.
- **Jeden format pliku świec** (24 bajty na świecę) dla 1s i 1m, jeden plik na symbol na dzień UTC.
- **Jedna funkcja agregacji** dla każdego interwału (sekundy, minuty, godziny, dni, tygodnie), zakotwiczona w otwarciu sesji CME. Ten sam moduł działa w Node i w przeglądarce (później replay).
- **Bez bazy SQL** (`node:sqlite` odrzucone, p. 4.5).
- **Rysunki przez istniejący zapis do Notion** (klient z ponawianiem przy 429, walidacja w `writes.mjs`), bez nowego magazynu danych użytkownika.
- **Replay i warstwa 1m:** replay dopiero po etapach podstawowych (etap 13). Warstwa 1m zostaje, bo to jeden dodatkowy plik dziennie liczony z 1s przy zapisie, bez osobnego pobierania (p. 4.4).

### 1.2 Wygląd identyczny z resztą dashboardu

Wykres ma wyglądać jak natywna część dashboardu, a nie jak osadzony TradingView.

- **Podgląd (domyślny, P12) jest w pełni nasz:** SVG jak `public/js/charts.js`, wygląd wyłącznie z klas w `public/styles.css`/`features.css` (`svg .candle.up`, `.candle.down`, `.lvl.sl`, `.drw` itd.) i tokenów; w kodzie JS nie ma ani jednego koloru. Przezroczyste tło, ta sama typografia osi (`svg .axis`), ten sam dymek (`.tip`), ten sam krzyżyk (`svg .cross-v`). Zmiana motywu i palety działa sama przez CSS, bez obserwatora.
- **Edycja (przycisk „Edytuj”)** to Lightweight Charts, którego wnętrza (canvas) CSS nie dosięga. Tam obowiązują punkty niżej: kolory z tych samych tokenów przekazywane w opcjach, przezroczyste tło, obserwator motywu. To „wymagany” wygląd w trybie modyfikacji, zgodnie ze słowami użytkownika.

Zasady dla trybu edycji (LWC):

- **Przezroczyste tło domyślnie:** `layout.background = { type: Solid, color: 'transparent' }`. Wykres leży na `.card` (`--float`) tak jak krzywa kapitału. **WYWNIOSKOWANE** (opcja z typów LWC; sprawdzenie w etapie 8, krok 1).
- **Kolory z tokenów CSS, nie z kodu.** Funkcja `themeOptions()` czyta `getComputedStyle(document.documentElement)` i mapuje:

| Element wykresu | Token z `public/styles.css` / `palety.js` | Uwaga |
|---|---|---|
| świeca wzrostowa (korpus, knot, ramka) | `--profit` | zmienia się z paletą (Kolor, Mono, Daltonizm, Stonowana, Własna) |
| świeca spadkowa | `--loss` | j.w. |
| tekst osi | `--fg-2`, `--font`, 10,5 px | jak `svg .axis` |
| siatka | `--line`; linie pionowe ukryte | minimalny chrom, jak `svg .grid` |
| krzyżyk | `rgb(var(--fg-rgb) / .35)`, linia ciągła 1 px | jak `svg .cross-v` |
| etykiety krzyżyka i ceny | tło `--popover`, tekst `--fg` | jak `.tip` |
| ramka skali cen | brak (`borderVisible: false`) | |
| linie poziomów trade'a | wejście `--fg-2`, SL `--loss`, TP `--profit`, wyjście `--be` | |
| znacznik zmiany kontraktu | `--fg-2`, przerywana linia pionowa + etykieta „ESZ6 → ESH7” | |
| tło sesji | `--n-blue`, `--n-orange`, `--n-purple` z przezroczystością ~8% | |
| rysunki: domyślny kolor | `--chart-line` | przez `setDefaultStyleOverride` paczki rysowania |

- **Normalizacja kolorów:** tokeny mają składnię CSS Color 4 (`rgb(58 63 67 / .7)`), a `--n-*` są w OKLCH. Parser kolorów LWC może ich nie przyjąć (**WYWNIOSKOWANE**), więc każdy kolor przechodzi przez sondę `canvas.getContext('2d').fillStyle`, która zwraca `#rrggbb` albo `rgba(...)`. Ten sam trik ma już `udostepnij-render.js` na gałęzi share-cards.
- **Na żywo:** `MutationObserver` na `<html>` (atrybut `data-theme` i `style`, gdzie `applyPalette` wpisuje zmienne) woła `chart.applyOptions(themeOptions())` i odświeża domyślne style rysunków. Przełączenie Onyx/Platinum albo palety zmienia wykres bez przeładowania.
- **Kontrolki z istniejących klas:** przełącznik interwału to `.seg.sm`, pole własnego interwału to zwykłe `input` jak w formularzu, przyciski narzędzi to `.icon-btn` z ikonami SVG w stylu `ICON` z `app.js`, przycisk pobierania to `.btn` / `.btn.primary`, okno potwierdzenia kosztu to `confirmDialog` z `modal.js`, komunikaty to `toast`. Żadnego nowego „systemu” przycisków.
- **Teksty PL/EN** przez `t('…')`, tłumaczenia w `public/i18n/en.json`; test `node testy/run.mjs i18n` pilnuje braków.
- **Układ:** 1920×1080 bez przewijania okna i 375 px bez poziomego przewijania (zasada z CONTRIBUTING). Na telefonie pasek narzędzi zwija się do jednego przycisku „Rysuj”.
- **Atrybucja TradingView zgodnie z licencją, bez logo na wykresie:** p. 2.1.

---

## 2. Biblioteki zewnętrzne (w repo, bez npm)

Obie trafiają do `public/vendor/` razem z plikiem licencji i plikiem `VENDOR.md` (wersja, źródło, SHA-256 pliku, data pobrania). Test sprawdza sumy. **[P]** bez kroku build, bez `node_modules`.

### 2.1 TradingView Lightweight Charts

| Fakt | Dowód |
|---|---|
| Najnowsza wersja: **5.2.1** (npm `latest`, wydana 12.08.2026), licencja Apache-2.0 | **PRZETESTOWANE** (rejestr npm) |
| Plik `dist/lightweight-charts.standalone.production.mjs`: ESM bez żadnych `import`, 197 827 B, eksportuje `createChart`, `CandlestickSeries`, `ColorType`, `createSeriesMarkers` i inne. Wersja zwykła (`production.mjs`) importuje `fancy-canvas`, więc jej nie bierzemy | **PRZETESTOWANE** (pobrana paczka, przejrzany koniec pliku) |
| SHA-256 tego pliku: `1bb1ee79f9d4dd17261b53d930f7a8995748276f80e7ba0e24412b5068062f5f` | **PRZETESTOWANE** |
| Domyślnie `attributionLogo: true` (logo TV na wykresie) | **PRZETESTOWANE** (ciąg w pliku) |
| Wymóg licencji wg README paczki: „You shall add the "attribution notice" from the NOTICE file and a link to https://www.tradingview.com/ to the page of your website or mobile application that is available to your users.” Opcja `attributionLogo` jest jednym ze sposobów spełnienia wymogu linku, nie jedynym | **CZĘŚCIOWE** (przeczytany README i plik NOTICE; to odczyt licencji, nie porada prawna) |
| Treść NOTICE: „TradingView Lightweight Charts™ / Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/” | **PRZETESTOWANE** (plik NOTICE z repo) |

Atrybucja (decyzja P3 z 26.10.2026) **[W]**:
1. `attributionLogo: false`, żeby na wykresie nie było obcego logo.
2. Pod wykresem, w wierszu legendy, jedna wyciszona linijka (`--fg-2`, `--t-xs`): „Wykres: TradingView Lightweight Charts™” z linkiem do https://www.tradingview.com/.
3. W Ustawieniach → Ogólne sekcja „Licencje”: pełna treść NOTICE, link do tradingview.com, licencja paczki rysowania.
4. `public/vendor/lightweight-charts/LICENSE` i `NOTICE`, wzmianka w README (PL i EN).

### 2.2 Paczka rysowania `lightweight-charts-drawing`

Stan inny niż w założeniu („mała, bez wydań”): paczka ma dziś **wydania i gotowy build**.

| Fakt | Dowód |
|---|---|
| Wersja **0.6.2** z 15.10.2026, tag `v0.6.2` = commit `0291d9c7373e3795373c915a3a64f4f663b5a0db`, licencja MIT, opublikowana w npm z gotowym `dist/` | **PRZETESTOWANE** (API GitHub, rejestr npm) |
| **86 narzędzi** (nie 68), m.in. `horizontal-line`, `trend-line`, `rectangle`, `fib-retracement`, `text`, `long-position`, `short-position` | **PRZETESTOWANE** (docs/TOOLS.md z tego commita) |
| `dist/lightweight-charts-drawing.es.js`: jeden plik ESM, 306 381 B, **zero instrukcji `import`** (README: „The package imports only types from lightweight-charts”) | **PRZETESTOWANE** (przeszukany plik) |
| Plik importuje się w Node 22 bez błędów, eksportuje 36 nazw, m.in. `DrawingManager`, `parseDrawings`, `buildNewDrawing`, `setDefaultStyleOverride`, `VERSION` = `0.6.2` | **PRZETESTOWANE** |
| `parseDrawings` przyjmuje rysunek zbudowany przez `buildNewDrawing` i odrzuca obiekt o złym kształcie | **PRZETESTOWANE** (Node, 6 rodzajów rysunków) |
| SHA-256 pliku: `361f2d2140ea0fab3feb2a6ec463594810607252d3b42cf4196a4af8b1e6afb2`; integralność npm `sha512-KyT0vzrN52z2PvPYmpqUfYhVE80KyxtNRvlT5yb70/swQhVB/mTP8qSJiKxp/1V07Eohkl1waxHpFqOpmBTC1A==` | **PRZETESTOWANE** |
| API: `new DrawingManager(chart, series, opts)`, `setTool(kind)`, `add`, `update`, `remove`, `exportJSON`, `importJSON`, zdarzenia `change`, `gestureEnd`, `textEdit`; opcje `fontFamily`, `magnet`, `timeInfo` | **WYWNIOSKOWANE** (README i `index.d.ts`) |
| Prostokąt ma opcję linii środkowej (`rectMiddleLine`), pozycja long/short ma `stopLevel`, `profitLevel`, `accountSize`, `riskPercent` | **WYWNIOSKOWANE** (`index.d.ts`) |
| Undo, zapis, okna ustawień, edytor tekstu i pasek narzędzi zostają po stronie aplikacji | **WYWNIOSKOWANE** (README) |

Dostarczenie (decyzja P10 z 26.10.2026): plik `dist/…es.js` z tarballa `https://registry.npmjs.org/lightweight-charts-drawing/-/lightweight-charts-drawing-0.6.2.tgz` (pobrany `curl`, integralność sprawdzona z rejestrem), plus `LICENSE`. Plik `.map` pomijamy. Bundler nie jest potrzebny.

---

## 3. Architektura

```
przeglądarka                                serwer (server.mjs, 127.0.0.1)
┌───────────────────────────────┐          ┌──────────────────────────────────────┐
│ podglad.js (SVG: podgląd,     │          │                                      │
│   miniatury; tylko odczyt)    │          │                                      │
│ geometria.js (rysunek+skale → │          │                                      │
│   kształty; czyste funkcje)   │          │                                      │
│ wykres.js  (EDYCJA w LWC,     │ GET      │ lib/candles.mjs                      │
│   poziomy trade'a, pobieranie)│─────────▶│   quote / fetch (zadanie) / odczyt   │
│ rysunki.js (pasek, rysunki,   │ /api/... │   ├─ lib/candles-store.mjs  (pliki)  │
│   nakładki sesji, PDH/PDL)    │          │   ├─ lib/databento.mjs      (HTTP)   │
│ swiece.js  (TF, sesja CME,    │◀─ import │   └─ public/js/swiece.js (agregacja) │
│   agregacja; czyste funkcje)  │  ─ ─ ─ ─ │ lib/writes.mjs: rysunki → Notion     │
└───────────────────────────────┘          └──────────────────────────────────────┘
                                             chart-data/  (poza gitem)
                                               candles/<ES|NQ>/1s/YYYY-MM-DD.bin
                                               candles/<ES|NQ>/1m/YYYY-MM-DD.bin
                                               candles/<ES|NQ>/days.json (zastąpione przez coverage.json, P25)
                                               drawings-cache/<tradeId>.json
                                             Notion: trade → „Rysunki” (rich_text)
```

### 3.1 Pliki

| Plik | Co robi | Zasada |
|---|---|---|
| `public/js/swiece.js` | parsowanie interwału, granice sesji CME, agregacja; bez DOM i bez I/O, importowany przez serwer i przeglądarkę | [P] jedna implementacja |
| `lib/candles-store.mjs` | format 24 B, zapis atomowy, odczyt zakresu, `days.json (zastąpione przez coverage.json, P25)`, liczenie warstwy 1m | [P] |
| `lib/databento.mjs` | `get_cost`, `get_range` (CSV), parser CSV → świece 1s | [P] |
| `lib/candles.mjs` | mapa instrumentów, brakujące dni, wycena, zadanie pobierania z postępem, odpowiedź `/api/candles` | [P] |
| `public/js/podglad.js` | renderer SVG trybu podglądu i miniatur: świece, osie, poziomy, znacznik zmiany kontraktu, nakładki, rysunki tylko do odczytu, TF, przesuwanie i przybliżanie; stan „brak danych” | [W] (P12) |
| `public/js/geometria.js` | czyste funkcje: skala czasu po indeksie świecy, skala ceny, rysunek (JSON paczki) + skale → kształty (`line`, `rect`, `text`, `path`) dla 7 narzędzi | [P] jedna geometria, test zgodności |
| `public/js/wykres.js` | tryb EDYCJI: wykres LWC, `themeOptions()`, ten sam TF i kadr co podgląd, poziomy trade'a | [W] |
| `public/js/rysunki.js` | pasek 7 narzędzi, `DrawingManager`, zapis rysunków (debounce), nakładki w LWC | [W] [P] |
| `testy/zgodnosc-rysunkow.html` + `testy/przegladarka.mjs` | strona testu zgodności geometrii z LWC i uruchamiacz w przeglądarce bez zależności (p. 3.8) | [P] |
| `migrations/003-poziomy-rysunki.mjs` | 4 pola liczbowe i 1 pole `rich_text` w bazie Trade'y | |
| `testy/atrapa-databento.mjs` | atrapa HTTP Databento | [P] |

Nowe w v3 (27.10.2026): `public/js/styl-wykresu.js` (czyste funkcje: transformacja świec dla stylu, np. Heikin-Ashi później, i odczyt `settings.chart` z wartościami domyślnymi; bez DOM) **[P]**, `public/js/film.js` (nagrywanie filmu: `<video>` tła, pętla klatek, MediaRecorder; bez rysowania, rysuje `udostepnij-render.js`) **[P]**, `testy/film-podglad.html` (strona ręcznego sprawdzenia filmu, wzór `udostepnij-podglad.html`).

Zmieniane: `server.mjs` (trasy; nowe `POST` dopisane obok trasy zrzutów z własnym limitem `readJson`, wzór `SHOT_BODY_LIMIT`), `lib/env.mjs` (`DATABENTO_API_KEY`), `lib/roles.mjs` (obok istniejącego `size`), `lib/writes.mjs` (ceny, rysunki w kawałkach), `lib/data.mjs`/`stats.js` (nowe pola; rysunki nie idą do `/api/data`; `data.mjs` od 1.2.2 skanuje też bloki obrazów stron, rysunki są właściwością, więc skan ich nie dotyka), `public/js/form.js` (od 1.2.2 ma przycisk „Dodaj zrzut”; pola cen dopisujemy obok), `public/js/app.js` (lightbox `openDetail`/`showLightbox`: przełącznik „Zrzuty | Wykres”, `shareModel` dostaje świece trade'a), `public/js/udostepnij.js`/`udostepnij-dane.js`/`udostepnij-render.js` (wykres w karcie, tryb filmu, p. 3.10–3.11), `public/js/ustawienia.js` (zakładka „Wykresy”, p. 3.13), `public/js/app.js` `collect`/`sanitize` (nowy klucz `settings.chart`), `lib/updater.mjs` (`PROTECTED` + `chart-data`), `.gitignore`, `schema/notion-schema.json`, i18n, README PL/EN, CHANGELOG, `testy/pomocnicze.mjs` (`cleanEnv`), `testy/atrapa-notion.mjs` (od 1.2.2 ma `blocks` i `file_uploads`; dopisujemy egzekwowanie limitów `rich_text`, p. 6), `testy/run.mjs`.

### 3.2 Serwer: pobieranie (Databento, tylko futures)

- **Instrument → dane** (jedna stała mapa w `lib/candles.mjs`, decyzje P1 i P9 z 26.10.2026) **[P]**:

| Instrument (opcja w Notion) | Dane | Symbol u źródła | Skala ceny w pliku |
|---|---|---|---|
| ES, MES | `ES` | `ES.v.0`, `stype_in=continuous` | ×100 (tick 0,25 = 25) |
| NQ, MNQ | `NQ` | `NQ.v.0`, `stype_in=continuous` | ×100 |
| każdy inny (EURUSD, XAUUSD, NAS100, …) | brak | brak | brak |

  Dla instrumentu spoza mapy wykres pokazuje „Brak źródła danych dla tego instrumentu” (i18n PL/EN) i nic nie pobiera. MES i MNQ korzystają z plików ES i NQ, więc nie pobierają nic osobno.

- **Databento** (HTTP, bez SDK):
  - `POST https://hist.databento.com/v0/metadata.get_cost`, formularz `dataset=GLBX.MDP3, symbols=ES.v.0, schema=ohlcv-1s, stype_in=continuous, stype_out=instrument_id, start, end`, Basic Auth: klucz jako login, puste hasło. Odpowiedź: liczba (USD). **CZĘŚCIOWE**: metoda, pola i uwierzytelnienie z kodu oficjalnego klienta `databento-python` (`metadata.py`, `http.py`), gateway `https://hist.databento.com` z `enums.py`; samego zapytania nie wysłałem (nie używamy prawdziwego konta). To, że `get_cost` jest bezpłatne, przyjmuję z założeń użytkownika; dokumentacja tego wprost nie mówi.
  - `POST https://hist.databento.com/v0/timeseries.get_range` z tymi samymi polami plus `encoding=csv`, `compression=none`, `pretty_px=false`, `pretty_ts=false`. **CZĘŚCIOWE**: ścieżka i metoda z kodu klienta (klient Python zawsze prosi o `dbn` + `zstd`); `encoding=csv`, `compression=none` wg dokumentacji kodowań, `pretty_*` do potwierdzenia w etapie 3.
  - Dlaczego CSV, a nie DBN: cennik mówi, że CSV i JSON są „no extra charge”, a kompresja nie wpływa na koszt (**CZĘŚCIOWE**, strona cennika), a parser CSV to kilkanaście linii. DBN wymagałby parsera nagłówka metadanych, a `zlib.zstd*` jest dopiero od Node 22.15 (w 22.19 jest: **PRZETESTOWANE**), przy `engines: >=22`. **[P]**
  - Rekord OHLCV: `ts_event` (u64, początek świecy, włącznie), `open/high/low/close` (i64, 1 jednostka = 1e-9), `volume` (u64); świeca nie powstaje, gdy w przedziale nie było transakcji; `ohlcv-1d` jest liczone wg dni UTC (dlatego go nie używamy). **CZĘŚCIOWE** (cytaty z dokumentacji schematu OHLCV); rozmiar 56 B z założeń użytkownika, zgodny z listą pól (16 B nagłówka + 4×8 + 8): **WYWNIOSKOWANE**.
  - **`ES.v.0`**: reguła `v` ustawia kontrakty wg obrotu z poprzedniego dnia; ceny są **bez wyrównania** na rolowaniu („original, unadjusted prices”). `ES.FUT` to wszystkie kontrakty i spready, dlatego go nie używamy. **CZĘŚCIOWE** (dokumentacja symbologii).
  - **Znacznik zmiany kontraktu:** CSV niesie `instrument_id`. Zmiana `instrument_id` między świecami zapisuje się w `days.json (zastąpione przez coverage.json, P25)` (`rolls: [{ t, from, to }]`), a wykres rysuje przerywaną linię pionową z etykietą. Nazwę kontraktu (np. `ESZ6`) bierzemy z mapowania symboli w odpowiedzi, jeśli jest dostępne (**WYWNIOSKOWANE**; bez niego etykieta „zmiana kontraktu”).
  - Klucz: `DATABENTO_API_KEY` w `.env` (dopisany do `ENV_KEYS`). Nigdy do przeglądarki, logów ani odpowiedzi API. `meta()` zwraca tylko `hasDatabentoKey: true/false`. **[P]** ten sam wzór co token Notion.
  - Limit kosztu jednego pobrania: **1 USD** (decyzja P2 z 26.10.2026), zmiana w Ustawieniach → Wykresy.

### 3.2a Dostępność danych: embargo i bieżąca sesja (dopisane 26.10.2026, decyzja P11)

**Fakty** (**CZĘŚCIOWE**: wpisy z roadmapy Databento sprzed 1,5–3 lat, stan dzisiejszy niepotwierdzony):
- dane historyczne mają embargo około 8 h bez abonamentu (P23): https://roadmap.databento.com/b/n0o5prm6/feature-ideas/release-historical-data-as-soon-as-possible-based-on-licensing-requirements-including-intraday
- dane z bieżącej sesji przez historyczne API HTTP są dostępne tylko dla kont z uprawnieniem live: https://roadmap.databento.com/roadmap/expose-intraday-and-current-trading-session-historical-data-over-historical-http-api-and-clients
- dokładne opóźnienie dla konta użytkownika potwierdzi bezpłatne `metadata.get_dataset_range` przy pierwszym użyciu klucza (p. 9).

**Funkcja:**
- Serwer pyta `metadata.get_dataset_range(dataset=GLBX.MDP3)` i trzyma wynik w pamięci przez **15 minut**. `availableEnd` = koniec dostępnego zakresu z odpowiedzi.
- `GET /api/candles` i `POST /api/candles/quote` zwracają `availableEnd`. Wykres pokazuje pod spodem wyciszoną linijkę (`--fg-2`, `--t-xs`, obok atrybucji): „Świece dostępne do: <data i godzina w strefie przeglądarki>”.
- Zakres każdego pobrania (`quote` i `fetch`) jest przycinany do `availableEnd`. Dzień UTC przecięty tą granicą zapisuje się ze statusem `partial` i z polem `until` (do kiedy ma dane).
- Trade nowszy niż `availableEnd`: zamiast błędu stan `.empty` „Świece z tej sesji będą dostępne ok. <availableEnd + zmierzone opóźnienie>”. Żadnego `get_cost` ani `get_range`.
- Otwarcie wykresu z dniem `partial`, gdy `availableEnd` jest już dalej niż `until`: przycisk „Dociągnij brakującą końcówkę”. Dalej jak zwykle: wycena `get_cost` tylko dla brakującej końcówki (`until` → `min(koniec dnia, availableEnd)`), `confirmDialog`, pobranie. **Nic nie pobiera się samo bez kliknięcia.**
- Scalanie końcówki: nowe świece dopisywane za ostatnią istniejącą; świece o `t` ≤ ostatniego zapisanego są pomijane (bez duplikatów); zapis atomowy całego pliku dnia; warstwa 1m dla tego dnia liczona od nowa.

### 3.3 Serwer: magazyn świec

- Katalog `chart-data/` w `CONFIG_DIR` (testy ustawiają `THQ_CONFIG_DIR`, więc nie dotykają prawdziwych danych). Dopisany do `.gitignore` i do `PROTECTED` w `lib/updater.mjs`, żeby aktualizacja z ZIP go nie ruszała. **[P]**
- Format pliku świec (1s i 1m identyczny), little-endian, rekord **24 B**:

| Pole | Typ | Uwagi |
|---|---|---|
| `t` | u32 | sekundy epoki UTC, początek świecy |
| `o`, `h`, `l`, `c` | i32 | cena × 100 |
| `v` | u32 | kontrakty |

  Bez nagłówka; rekordy rosnąco po `t`. Odczyt zakresu = wyszukiwanie binarne. Zapis atomowy (plik tymczasowy + zmiana nazwy), jak `saveConfig`.
- Jeden plik na **dzień UTC** (granice żądań Databento są w UTC, sesje liczy agregacja). `days.json (zastąpione przez coverage.json, P25)` per symbol: `{ "2026-09-15": { "status": "complete" | "partial", "fetchedAt", "rolls": [...] } }`. Dzień bez danych (weekend, święto) też dostaje wpis `complete` z zerem świec, żeby go nie pobierać drugi raz. Dzień, którego koniec jest późniejszy niż `availableEnd`, dostaje `partial` z polem `until` i można go dociągnąć przyciskiem (p. 3.2a).
- Warstwa 1m: przy zapisie dnia 1s od razu liczony jest plik 1m tą samą funkcją agregacji (kotwica na pełnej minucie). Około 35 KB na dzień (**Szacunek**: 1 440 × 24 B).

### 3.4 Serwer: agregacja i endpoint

- Interwał: `^(\d{1,4})(s|m|h|D|W)$`, np. `7s`, `45s`, `13m`, `2h`, `4h`, `1D`, `1W`. Musi być wielokrotnością sekundy (z definicji) i mieć ≥ 1 s.
- Źródło agregacji: 1m, gdy interwał jest wielokrotnością 60 s (`13m`, `2h`, `1D`); w pozostałych przypadkach 1s (`7s`, `45s`, ale też `90s`, bo 90 s nie da się złożyć z pełnych minut). To rozszerza regułę „≥1m z warstwy 1m” o jedyny przypadek, w którym byłaby niepoprawna (decyzja mechaniczna). P55 (29.10.2026): dla TF poniżej minuty poza oknami 1s źródłem jest podział świec 1m (patrz wiersz P55 w sekcji 0), 1s tylko tam, gdzie okno jest pobrane.
- **Kotwica = otwarcie sesji CME.** Świeca zaczyna się w `sessionOpen + k × tf` i nie przechodzi przez koniec sesji (ostatnia bywa krótsza). Jedna reguła dla każdego interwału **[P]**:
  - sesja 17:00 → 16:00 `America/Chicago`, przerwa 16:00–17:00, tydzień od niedzieli 17:00 do piątku 16:00;
  - `1D` = jedna sesja, `1W` = sesje od otwarcia tygodnia, `4h` = 17–21, 21–1, 1–5 itd. czasu sesji;
  - zmiana czasu (DST) przez `Intl.DateTimeFormat` z `timeZone` (pełne ICU jest w oficjalnych buildach Node: **WYWNIOSKOWANE**); test na tygodniach, w których USA i Europa zmieniają czas w różnych terminach.
- Brak świecy bazowej = brak transakcji, więc agregat jej nie zawiera; puste przedziały nie dostają sztucznych świec.
- `GET /api/candles?instrument=MES&from=<ISO>&to=<ISO>&tf=7s` → `{ data: "ES", tf, bars: [[t,o,h,l,c,v], …], missing: ["2026-09-14", …], partial: [...], rolls: [{ t, label }] }`, ceny jako liczby dziesiętne. Limit 50 000 świec na odpowiedź; powyżej błąd 422 z podpowiedzią „Wybierz większy interwał albo krótszy zakres”. Nic nie pobiera z sieci.
- `POST /api/candles/quote { instrument, from, to }` → `{ days, costUsd }`. Woła `get_cost` tylko dla brakujących dni. Wymaga klucza.
- `POST /api/candles/fetch { instrument, from, to, confirmedCostUsd }` → startuje zadanie; `GET /api/candles/status` → postęp (wzór zadania z kreatora i aktualizacji). Przed `get_range` serwer **jeszcze raz** pyta `get_cost`; gdy nowa wycena > `confirmedCostUsd` + 5% albo > limit 1 USD, przerywa bez pobierania.
- Wszystkie POST przez istniejący `guardWrite` (127.0.0.1, Origin, `X-THQ`, JSON) i mapę `ACTIONS`. **[P]** bez nowego mechanizmu bezpieczeństwa.

### 3.5 Front: widok wykresu przy trade'ie

- **Wejście:** w szczegółach trade'a (lightbox z `openDetail`) przełącznik `.seg` „Zrzuty | Wykres”. Bez nowej zakładki w nawigacji **[P] [W]**. Na telefonie ten sam widok na pełny ekran. Styk z 1.2.2: lightbox ma już przycisk „Dodaj zrzut” (`bindShots` z `shots.js`, strefa upuszczania i Ctrl+V). W trybie „Wykres” strefa upuszczania i wklejanie są wyłączone (`isActive` zwraca `false`), przycisk zostaje widoczny tylko w „Zrzuty”; trade bez zrzutów (`i: -1`) otwiera się od razu na „Wykres”, gdy są świece.
- **Dwa tryby (P12):** wykres otwiera się w **podglądzie** (SVG, p. 3.8). Przycisk `.btn` „Edytuj” / „Edit” podmienia go na **edycję** (LWC + pasek narzędzi). Przycisk „Gotowe” / „Done” zapisuje rysunki (zapis i tak idzie z debounce) i wraca do podglądu **w tym samym kadrze i TF**: oba tryby dzielą obiekt stanu `{ tf, fromIndex, toIndex }` (zakres logiczny po indeksach świec, w LWC `getVisibleLogicalRange`/`setVisibleLogicalRange`) i tę samą tablicę świec, więc indeksy znaczą to samo. Moduł LWC i paczka rysowania ładują się dynamicznym `import()` dopiero po kliknięciu „Edytuj” (podgląd i miniatury ich nie potrzebują).
- Punkty niżej (zakres startowy, TF, poziomy, strefa czasu, brak świec) dotyczą obu trybów; poziomy w podglądzie rysuje SVG, w edycji `createPriceLine` i rysunek pozycji paczki.
- **Zakres startowy:** od wejścia minus 2 godziny do wyjścia plus 1 godzina (gdy brak wyjścia: wejście plus 2 godziny); interwał startowy `1m`, zapamiętywany w `localStorage` (wzór `thq.ui.v1`).
- **Przełącznik TF:** `.seg.sm` z `15s 1m 5m 15m 1h 4h 1D` i pole „Własny” przyjmujące np. `7s`, `13m`; walidacja tym samym parserem co serwer.
- **Poziomy trade'a** (z nowych pól Notion): linie cenowe wejścia, wyjścia, SL i TP (`createPriceLine`), znaczniki wejścia i wyjścia (`createSeriesMarkers`) oraz zablokowany rysunek `long-position` albo `short-position` z paczki, wyliczony z ceny wejścia, SL i TP, z R w etykiecie. Rysunek pozycji jest generowany z pól przy każdym otwarciu i nie jest zapisywany (źródłem prawdy są pola). Odwzorowanie `stopLevel`/`profitLevel` (ticki czy cena) potwierdzi etap 8 (**WYWNIOSKOWANE**); jeśli paczka tego nie udźwignie, prostokąty zysku i straty rysujemy własnym prymitywem.
- **Strefa czasu osi:** czas lokalny przeglądarki, jak w reszcie dashboardu. Przez `localization.timeFormatter` i `tickMarkFormatter` z `Intl`, bez przesuwania znaczników czasu.
- **Brak świec:** karta w stylu `.empty`: „Brak świec ES dla 14–15.09.” + `.btn.primary` „Sprawdź koszt” → `confirmDialog` „Pobranie 2 dni ES z Databento kosztuje 0,0041 USD. Pobrać?” → pasek postępu. Bez klucza Databento: link do Ustawień. Instrument spoza mapy: „Brak źródła danych dla tego instrumentu”.
- **Ustawienia → Wykresy:** pełny projekt zakładki w p. 3.13 (grupa „Dane”: klucz Databento z zapisem do `.env` i sprawdzeniem bezpłatnym `get_cost` dla 1 minuty, limit kosztu, rozmiar `chart-data/`, „Usuń pobrane świece”, rysunków nie rusza).

### 3.6 Rysunki w Notion

Decyzja P4 z 26.10.2026: rysunki w Notion, w polu trade'a.

**Limity Notion** (https://developers.notion.com/reference/request-limits, odczyt 26.10.2026, **CZĘŚCIOWE**: dokumentacja, bez testu na prawdziwym Notion):
- `text.content` ≤ 2 000 znaków na obiekt tekstu; każda tablica ≤ 100 elementów → jedna właściwość `rich_text` mieści **do 200 000 znaków**;
- całe żądanie ≤ 500 KB (i ≤ 1 000 elementów bloków);
- średnio 3 żądania na sekundę na integrację; przy przekroczeniu HTTP 429 z nagłówkiem `Retry-After` (klient `lib/notion.mjs` już go obsługuje: **PRZETESTOWANE** przez przeczytanie kodu, wiersze 20–21);
- dokumentacja strony mówi, że dla `rich_text` limit 25 dotyczy **wzmianek** (mentions), nie długości tekstu. Zwykłe kawałki tekstu nie są obcinane przy odczycie strony (**CZĘŚCIOWE**; potwierdzić na atrapie zachowanie odczytu 100 kawałków).

**Projekt:**
- Nowa właściwość `rich_text` w bazie Trade'y: rola `drawings`, nazwa „Rysunki” / „Drawings”, w tej samej addytywnej migracji 003 co ceny. **[P]** jedna migracja.
- Treść: JSON z wersją formatu, bez spacji:
  `{"v":1,"lib":"0.6.2","at":"2026-10-26T14:02:11Z","d":[…wynik exportJSON…]}`. `v` pozwala później zmienić format bez gubienia starych rysunków; `lib` to wersja paczki rysowania (jej `migrateDrawing` przenosi stare rysunki na nowy model).
- Zapis: `lib/writes.mjs` dostaje `drawings(tradeId, json)`: kawałki po **2 000** znaków (tablica `rich_text`, maks. 100), jedno `PATCH /v1/pages/:id` z tylko tą właściwością. Kawałki tnie serwer, nie przeglądarka. Cięcie po znakach (`Array.from`), nie po bajtach, żeby nie rozciąć polskiej litery; JSON bez spacji i tak jest prawie cały w ASCII.
- **Debounce:** przeglądarka wysyła `POST /api/drawings/save { tradeId, json }` 2 s po ostatnim zdarzeniu `change` (i od razu przy zamknięciu widoku). Jedno żądanie do Notion na zapis; przy tempie rysowania to dużo poniżej 3 żądań/s. Zapis w toku blokuje kolejny; kolejny czeka na koniec poprzedniego (najwyżej jeden w kolejce, zawsze najnowszy stan).
- **Limit rozmiaru:** serwer odrzuca JSON > **190 000** znaków (zapas na kopertę i przyszłe pola) z komunikatem: „Za dużo rysunków na tym trade'zie ({n} z 190 000 znaków). Usuń część rysunków, zanim zapiszesz.” Przeglądarka pokazuje licznik zajętości od 80% w legendzie paska (`--fg-2`, przy 95% `--warn`).
- **Odczyt:** `GET /api/drawings/:tradeId` czyta stronę trade'a z Notion i skleja kawałki. Rysunki **nie** idą w `/api/data` (`data.mjs` pomija rolę `drawings`), więc lista trade'ów w przeglądarce nie rośnie.
- **Lokalna kopia tylko jako cache:** `chart-data/drawings-cache/<tradeId>.json` z `{ at, json, pending }`. Gdy Notion nie odpowiada (offline, 429 po ponowieniach), zapis trafia do cache z `pending: true`, a pasek pokazuje „Zapisano lokalnie, wyślę do Notion”. Przy następnym otwarciu wykresu albo zapisie serwer najpierw wysyła zaległy stan. Przy odczycie wygrywa nowszy `at` (Notion albo cache). Cache można skasować bez utraty danych, gdy nic nie jest `pending`.
- **Konflikt dwóch urządzeń:** wygrywa ostatni zapis (jak synchronizacja ustawień w 1.1.0). Notatka w README.
- **Walidacja na serwerze:** `PAGE_ID_RE`, `JSON.parse`, `v === 1`, `parseDrawings` paczki (działa w Node: **PRZETESTOWANE**) odrzuca rysunki o złym kształcie, limit rozmiaru; `readJson` z limitem 256 KB tylko dla tej trasy (domyślnie 64 KB).
- **Kopie i przywracanie:** rysunki są w Notion, więc istniejące `backupAll` i `restore.mjs` obejmują je bez zmian.
- **Widoczność w Notion:** kolumna „Rysunki” pokaże JSON. Migracja nie może zmieniać istniejących widoków (dozwolone tylko `addView`), więc README powie, jak ją ukryć jednym kliknięciem („•••” → „Properties” → oko). Nowe instalacje: schemat może od razu ukryć pole w widokach, jeśli API widoków na to pozwala (do sprawdzenia w etapie 4, **WYWNIOSKOWANE**).

### 3.7 Karty udostępniania i dane CME

Karty „Udostępnij” są na `main` od 1.2.0 (`udostepnij.js`, `udostepnij-dane.js`, `udostepnij-render.js`). Dziś rysują statystyki, tabelę i tło (motyw albo zdjęcie) na canvasie; **nie mają żadnego wykresu**, także krzywej kapitału (sprawdzone w kodzie: `buildModel`/`drawLayout`, 27.10.2026). Plan v2 zakładał „żadna świeca ani obraz wykresu w kartach” i „bez eksportu PNG” (P6). To były decyzje sesji głównej. Teraz użytkownik wprost chce wykresu w obrazach i filmach (P16), więc o tym, jak pokazywać dane CME publicznie, decyduje **P15 (czeka na użytkownika)**.

**Fakty (odczyt 27.10.2026):**

| # | Fakt | Źródło | Dowód |
|---|---|---|---|
| F1 | „Your redistribution rights depend on the dataset.” „Databento doesn't apply any redistribution restrictions.” „we have to pass through the licensing restrictions from the original publisher.” | databento.com/pricing | CZĘŚCIOWE (strona przeczytana; nie mówi o GLBX.MDP3 ani o obrazach) |
| F2 | „Most of our datasets can be redistributed internally or externally after 24 hours.” Wydawcy liczą więcej za dane real-time niż „delayed or received after 24 hours”. | databento.com/pricing | CZĘŚCIOWE (słowo „most”, bez listy zbiorów) |
| F3 | GLBX.MDP3: „A license isn't required to access historical data.” Dla live licencja wymagana. Strona katalogu wymienia „External distribution” / „Delayed distribution” jako cechy planów, bez jasnego przypisania do planu. Opóźnienia wydania danych historycznych w katalogu: 20 min i 8 h. | databento.com/catalog/cme/GLBX.MDP3 | CZĘŚCIOWE. Uwaga: „access” to nie „redistribution”; opóźnienie bywa krótsze niż 24 h, więc dane dostępne nie muszą być starsze niż 24 h |
| F4 | Databento trzyma embargo 24 h, żeby dane szły jako historyczne i omijały wymogi licencji real-time/delayed. | roadmap.databento.com (wynik wyszukiwania) | WYWNIOSKOWANE (fragment z wyszukiwarki, strona nieotwarta) |
| F5 | Umowa CME „Derived Data License Agreement” dzieli informacje na kategorie; kategoria 2 obejmuje m.in. „End of Day”, „Snap Shot” i „Historical Information”. Czy obraz wykresu publikowany przez użytkownika to „derived data”, a jeśli tak, czy wymaga licencji: **niepotwierdzone** (PDF nie otworzył się w 60 s). | cmegroup.com/market-data/files/cme-derived-data-license-agreement.pdf | WYWNIOSKOWANE |
| F6 | „Non-display” (użycie danych przez program bez pokazywania) dotyczy np. algorytmów; nasze karty to użycie wyświetlane (display). Na stronach Databento nie znalazłem zapisu o obrazach ani filmach. | — | WYWNIOSKOWANE |

Wniosek: prawa do pokazywania zależą od licencji CME przeniesionej przez Databento. Najmocniejszy zapis (F2) mówi o redystrybucji po 24 h. Obraz z jednym wykresem jednego trade'a, bez liczb świec, to dużo mniej niż redystrybucja zbioru danych, ale **nie mam źródła, które to potwierdza**. JustJournal jest publicznym narzędziem MIT: każdy użytkownik używa własnego klucza i sam publikuje swoje karty, więc README musi to powiedzieć wprost.

**Warianty do decyzji P15:**

| Wariant | Co pokazuje karta i film | Za | Przeciw |
|---|---|---|---|
| **A (rekomendowany)** | wykres trade'a tylko, gdy wyjście jest **starsze niż 24 h** (liczone od `exit` trade'a i od `availableEnd`, nie tylko od embarga); **bez osi cen, siatki i wartości OHLC**; ceny na karcie tylko wejście/wyjście z pól użytkownika (to jego własne dane) | trzyma się najmocniejszego zapisu (F2); wykres pokazuje kształt ruchu, nie odtwarzalne dane; zgodny ze stylem LiquidJournal (tam też nie ma osi) | karta z dzisiejszego trade'a bez wykresu do jutra |
| B | jak dziś: bez wykresu ceny w obrazach i filmach; tylko krzywa kapitału (dane użytkownika, bez CME) | zero ryzyka licencji | nie spełnia życzenia użytkownika (P16) |
| C | pełne świece z osią cen i czasu, bez ograniczenia wieku | najwięcej informacji | najsłabiej podparte źródłami; oś cen to już odtwarzalne dane CME |

Dodatkowo (do każdego wariantu, decyzja użytkownika): mail do pomocy Databento z pytaniem o obrazy wykresów z GLBX.MDP3 w mediach społecznościowych. Wysyła użytkownik (my niczego nie wysyłamy).

**Zasady niezależne od P15 (README i testy):**
- repo nie zawiera klucza ani danych CME; dane testowe są syntetyczne; każdy użytkownik podaje własny klucz Databento;
- rysunki w Notion to współrzędne i style, nie świece;
- miniatury i podgląd to obraz tylko na ekranie, niczego nie zapisują;
- **krzywa kapitału** na kartach okresu (p. 3.10) to dane użytkownika, nie CME, więc nie czeka na P15;
- do decyzji P15 przełącznik „Wykres ceny w kartach i filmach” jest w kodzie wyłączony na stałe (stała `CHART_IN_SHARE = false` z komentarzem i datą); test pilnuje, że przy `false` karta trade'a nie woła `/api/candles`;
- po decyzji: test wariantu (np. dla A: trade z wyjściem 23 h temu → karta bez wykresu; w kodzie karty brak etykiet osi cen, test grep) i komentarz w kodzie z datą i słowami użytkownika.

### 3.8 Podgląd: własny renderer SVG (P12, 26.10.2026)

**Co pokazuje:** świece, osie, poziomy wejścia/wyjścia/SL/TP z pól trade'a, prostokąty zysku i straty pozycji (z tych samych pól), znacznik zmiany kontraktu, nakładki (tło sesji, PDH/PDL) i zapisane rysunki 7 narzędzi z JSON-u paczki. Ma przełącznik TF, przesuwanie (przeciągnięcie myszą, gest jednym palcem) i przybliżanie (kółko myszy, pinch), dymek OHLC przy krzyżyku. **Bez rysowania, zaznaczania i edycji** (od tego jest tryb edycji).

**Wygląd:** wyłącznie klasy CSS, wzór `public/js/charts.js`: `svg .candle.up { fill: var(--profit) }`, `.candle.down { fill: var(--loss) }`, `.wick`, `.lvl.entry|exit|sl|tp`, `.pos-profit`, `.pos-loss`, `.roll`, `.sess.asia|london|ny`, `.pdh`, `.drw` (domyślny kolor rysunku `var(--chart-line)`). Kolor zapisany w stylu rysunku (ustawiony w edycji) trafia do atrybutu `stroke`/`fill`; wszystko inne idzie z CSS. Tło przezroczyste, bo SVG nic nie maluje pod spodem.

**Skala czasu jak w LWC:** oś X liczona **po indeksie świecy**, nie po czasie (luki nocne i sekundy bez transakcji się zwijają, jak w LWC i TradingView). `x(i) = prawaKrawędź - (ostatniIndeks - i + prawyMargines) × odstęp`. Punkt rysunku z czasem `t` trafia na świecę, która zawiera `t` (tak robi paczka od 0.6.2: „drawing points on the bar that holds their time”, **WYWNIOSKOWANE** z changelogu); czas za ostatnią świecą liczony jest przyszłymi indeksami co interwał (paczka 0.6.1: „future axis in makeCoords”, **WYWNIOSKOWANE**). Skala ceny liniowa z marginesami jak domyślne `scaleMargins` LWC.

**Geometria rysunków (`public/js/geometria.js`):** czysta funkcja `shapes(drawing, scales) → [{ type: 'line'|'rect'|'text'|'path', … }]` dla 7 narzędzi: linia pozioma (od krawędzi do krawędzi), trend (z `extendLeft/Right`), prostokąt (z `rectMiddleLine` = CE w FVG), Fibonacci (poziomy z `levels` rysunku albo domyślne z p. 8), tekst (punkt kotwicy + treść), pozycja long/short (dwa prostokąty i linia wejścia). Renderer SVG tylko zamienia kształty na elementy. Rysunek innego rodzaju niż 7 narzędzi (np. dopisany ręcznie w JSON) jest pomijany, a w legendzie pojawia się wyciszone „1 rysunek widoczny tylko w trybie edycji”.

**Test zgodności z LWC** (etap 6): strona `testy/zgodnosc-rysunkow.html` tworzy w przeglądarce wykres LWC na syntetycznych świecach i dla każdego z 7 narzędzi porównuje punkty kształtów z `geometria.js` ze współrzędnymi z `timeScale().timeToCoordinate()`/`logicalToCoordinate()` i `series.priceToCoordinate()` na tych samych danych, rozmiarze i kadrze; **tolerancja 1 px**. Skale SVG dostają parametry odczytane z LWC (odstęp świec, prawy margines, dwa punkty skali ceny), więc test sprawdza geometrię, a nie dopasowanie kadru. Uruchamiacz `testy/przegladarka.mjs` bez zależności: zainstalowana przeglądarka Chrome/Edge w trybie `--headless=new --virtual-time-budget=10000 --dump-dom` na adresie `start-test`, wynik czytany z DOM (`<pre id="wynik">PASS/FAIL …</pre>`). Gdy na komputerze nie ma Chrome ani Edge, test wypisuje „pominięty” zamiast błędu. **WYWNIOSKOWANE** (flagi Chrome znane z dokumentacji; sprawdzenie w etapie 6, krok 1).

**Wydajność (decyzja gustu):** renderer rysuje tylko świece w kadrze (plus po 1 ekranie zapasu z obu stron), aktualizacja przez `requestAnimationFrame`. Gdy w kadrze byłoby **> 1 500 świec**, podgląd **sam podnosi interwał wyświetlania** do najmniejszego, przy którym liczba spada poniżej 1 500, i pokazuje to przy przełączniku TF: „wyświetlane 5m (wybrano 1m)”. Wybrałem to zamiast canvasu, bo jest prostsze: zostaje jedna technika rysowania (SVG ze stylami z CSS, czyli cały sens P12), a agregacja i tak istnieje (`swiece.js`). Canvas dawałby więcej świec, ale wymagałby drugiej ścieżki rysowania i kolorów czytanych z CSS w JS, czyli dokładnie tego, czego podgląd ma unikać. Szacunek: 1 500 świec to ~3 000 elementów SVG (korpus + knot), co przeglądarka przesuwa płynnie; do zmierzenia w etapie 7.

**Dane przy przesuwaniu:** podgląd startuje z zakresem jak w p. 3.5. Przesunięcie poza wczytany zakres dociąga świece z `GET /api/candles` (lokalne, nic nie pobiera z Databento). Gdy lokalnie ich nie ma, na krawędzi pojawia się pasek „Brak świec dla 14.09” z tym samym przyciskiem „Sprawdź koszt” co w p. 3.5 (tylko w szczegółach trade'a, nigdy w miniaturze).

### 3.9 Miniatury: lista trade'ów i kalendarz / dzień (P12)

- **Ten sam renderer w trybie `mini`:** bez osi, kontrolek i dymka; kadr trade'a (wejście − 15% do wyjścia + 15% szerokości, Szacunek: dobrze czytelne) i automatyczny TF: serwer dostaje `GET /api/candles?…&tf=auto&maxBars=80` i sam wybiera najmniejszy interwał z listy `15s 1m 5m 15m 1h`, przy którym liczba świec ≤ 80. Pokazuje świece i poziomy wejścia/wyjścia/SL/TP z pól trade'a (te są w `/api/data`).
- **Miejsca:** wiersz na liście w zakładce Trade'y (nowa wąska kolumna albo zastąpienie obecnej ikonki zrzutu, rozstrzygnie się przy projekcie w etapie 11) oraz lista trade'ów dnia w prawym panelu po kliknięciu dnia w kalendarzu (**WYWNIOSKOWANE** z opisu układu w `app.js`: „prawy panel (dzień)”).
- **Tylko dane lokalne:** miniatura nigdy nie woła Databento (GET `/api/candles` i tak nic nie pobiera). Brak świec, instrument spoza mapy albo trade po `availableEnd` → obecna miniatura zrzutu, a gdy jej nie ma, pusty stan `.empty`.
- **Leniwe ładowanie:** `IntersectionObserver` z marginesem 200 px; najwyżej 4 żądania naraz do lokalnego serwera; wynik w pamięci przeglądarki (mapa `tradeId:wersjaDanych → kształty`), czyszczonej przy pobraniu nowych świec. Bez `localStorage` (świece nie lądują w przeglądarce na stałe).
- **Bez rysunków (P13, 26.10.2026):** miniatura pokazuje tylko świece i poziomy z pól trade'a. Nie woła `/api/drawings` ani Notion (rysunki nie są w `/api/data`, a Notion przyjmuje ~3 żądania/s, więc pobieranie ich trade po trade'ie spowalniałoby cały dashboard). Rysunki są w podglądzie po kliknięciu.

### 3.10 Wykres w kartach udostępniania (P16, P18, 27.10.2026)

**Jedna geometria, dwa wyjścia [P]:** `geometria.js` dostaje `candleShapes(candles, scales, style)` i `lineShapes(points, scales)` obok `shapes(drawing, scales)`. Podgląd SVG (`podglad.js`) zamienia kształty na elementy z klasami CSS, karty (`udostepnij-render.js`) na wywołania `ctx` z kolorami z `readTokens()` (sonda `rgbOf` już istnieje). Skale po indeksie świecy są te same, więc karta pokazuje dokładnie to, co podgląd. Bez nowego renderera.

**Karta trade'a z wykresem (czeka na P15):**
- Dane: `shareModel` dla trade'a woła lokalne `GET /api/candles?…&tf=auto&maxBars=60` (ta sama trasa co miniatury, nigdy Databento). Kadr: wejście − 25% do wyjścia + 25% czasu trwania (Szacunek, decyzja gustu).
- Domyślny styl: **wypełnione świece z palety** (P18); „Linia zamknięć” (wygląd LiquidJournal) jako opcja w Ustawieniach (p. 3.12–3.13) **[W]**.
- Znaczniki wejścia i wyjścia: cienka pionowa kreska przy świecy wejścia i wyjścia, kropka na cenie, etykieta „Wejście”/„Wyjście” **samym tekstem obok** (`--fg-2`, wersaliki jak etykiety kart), **bez podkładki**. To wariant zgodny z preferencją użytkownika z 08.2026 (bez zaokrąglonych podkładek pod statycznym tekstem); białe pigułki z ząbkiem jak w LiquidJournal tylko po decyzji P19 **[W]**. SL i TP: przerywane linie, w kartach domyślnie wyłączone (opcja) **[P]**.
- Układ, w istniejącym `drawLayout`: 16:9 jak LiquidJournal: lewa kolumna nagłówek + liczba + tabela (tabela trade'a przechodzi z prawej kolumny pod liczbę), prawa kolumna wykres (od `W·0.55` do `W − px`, pionowo w obszarze środka). Formaty pionowe (9:16, 4:5, 1:1): pas wykresu między tytułem a liczbą, wysokość 28% obszaru środka (Szacunek); istniejące skalowanie (`scale`) zmniejsza resztę, gdy brak miejsca **[P]**.
- Tabela trade'a dostaje wiersze „Cena wejścia”, „Cena wyjścia” (nowe pola z migracji 003) i „Rozmiar” (istniejąca rola `size`), gdy są wypełnione (jak Entry/Exit/Size w inspiracji).
- Bez świec (EURUSD, XAUUSD, brak pobranych danych, trade młodszy niż próg z P15, przełącznik wyłączony): karta dokładnie jak dziś. Okno Udostępnij nie pobiera brakujących świec (bez przycisku „Sprawdź koszt”) **[P]**.

**Karta okresu z krzywą kapitału (nie czeka na P15):**
- Dzień, tydzień, miesiąc, rok: linia skumulowanego wyniku w wybranej jednostce (R, $, %) po trade'ach Live okresu, w kolejności czasu; `udostepnij-dane.js` dostaje `curve: [{ t, v }]`. Etykiety jak w inspiracji: wartość końcowa, szczyt i 0 na prawej krawędzi, daty początku i końca pod linią, samym tekstem. Linia w kolorze wyniku (zysk/strata z palety), cienka linia zera `--line`.
- Krzywa to zawsze linia (jak krzywa kapitału w `charts.js`), nie świece: P18 dotyczy wykresów ceny. Decyzja mechaniczna.
- Układ: 16:9 prawa kolumna (lista dni/tygodni zostaje, gdy krzywa wyłączona); pionowe: pas nad listą. Przełącznik „Krzywa kapitału” w oknie Udostępnij, domyślnie włączony.

### 3.11 Filmy z wykresem i wynikiem (P16, 27.10.2026)

**Gdzie:** to samo okno Udostępnij, segment `.seg` „Obraz | Film”. Bez nowego okna i bez nowego renderera **[P] [W]**.

**Jedna funkcja rysująca:** `renderCard(canvas, { …, at })`. `at` to czas w sekundach od początku animacji; obraz PNG = `at: Infinity` (stan końcowy, dziś). Każdy element ma swój przedział czasu i łagodzenie `easeOutCubic`. `film.js` tylko dostarcza klatkę tła i woła `renderCard` co klatkę **[P]**.

**Oś czasu animacji (z inspiracji, decyzje gustu):**

| Czas | Co się dzieje |
|---|---|
| 0–1,0 s | samo tło (film), nagłówek (symbol, kierunek, data) pojawia się w 0,3 s |
| 1,0–3,0 s | wykres rysuje się od lewej: świece pojawiają się kolejno (linia: przycinanie `clip` od lewej); krzywa kapitału tak samo |
| 1,0–3,0 s | licznik wyniku od 0 do wartości (`easeOutCubic`, format jak na karcie, ten sam `fmtMetric`) |
| 2,6–3,4 s | tabela wchodzi wiersz po wierszu (przezroczystość + przesunięcie 24 px, co 80 ms) |
| 3,0–3,4 s | znaczniki wejścia i wyjścia |
| 3,4 s – koniec | wszystko stoi, tło gra dalej; podpis „JustJournal × nick” od początku |

Bez wykresu (P15 nierozstrzygnięte, EURUSD) film działa tak samo, tylko bez pasa wykresu (jak portretowy film LiquidJournal: wynik na środku, tabela pod nim) **[P]**.

**Opcje na start (P17: minimum):**
- Format: **9:16 (1080×1920)** i **16:9 (1920×1080)**. Jakość `.seg` „1080p | 720p” (720p = skala 2/3 tego samego układu). 4:5 i 1:1 w „Później”.
- Długość: `.seg` „6 s | 10 s | 15 s”, domyślnie 10 s. Krótszy film tła zapętla się.
- Tło: „Motyw | Zdjęcie | Film”. Film z dysku (`<input type="file" accept="video/*">`), `URL.createObjectURL`, **nigdy nie jest wysyłany ani zapisywany** (za duży do `localStorage`; przy kolejnym otwarciu wybiera się go ponownie). Filtry: przełącznik „Czarno-białe” (`ctx.filter = 'grayscale(1)'`) i suwak przyciemnienia (domyślnie istniejące `SCRIM 0.6`). Rozmycie w „Później” (koszt `blur` na 1080×1920 przy 60 fps).
- Dźwięk: `.check` „Dźwięk z filmu tła”, domyślnie wyłączony. Tor audio przez `AudioContext.createMediaElementSource(video)` → `createMediaStreamDestination()`.

**Zapis: `MediaRecorder` z `canvas.captureStream(60)`, MP4 H.264 + AAC (wybrane) [P]:**
- Dowody (27.10.2026): Edge 156 headless: `MediaRecorder.isTypeSupported` = `true` dla `video/mp4`, `video/mp4;codecs=avc1.42E01E`, `avc1.640028`, `avc1.640028,mp4a.40.2`, `avc1.640028,opus` oraz WebM VP9/VP8 (**PRZETESTOWANE**). Chromium 151 (Playwright): nagranie canvasu 1080×1920 przez 2 s dało plik `video/mp4;codecs=avc1.640028` 1,9 MB, pierwszy box `ftyp`/`isom`, element `<video>` odczytał 1080×1920 i 2,01 s (**PRZETESTOWANE**). Z torem audio (oscylator przez `MediaStreamDestination`): `avc1.64001f,mp4a.40.2`, struktura `ftyp, moov, moof/mdat ×4, mfra`, czyli **MP4 fragmentowany** (**PRZETESTOWANE**). Od której wersji Chrome nagrywa MP4: ok. 126 (**WYWNIOSKOWANE**, z pamięci informacji o wydaniu, nie sprawdzone dziś). Safari nagrywa MP4 natywnie, Firefox prawdopodobnie tylko WebM (**WYWNIOSKOWANE**); kod sprawdza `isTypeSupported` przy otwarciu i przy braku MP4 nagrywa WebM z notką „Instagram i TikTok wolą MP4: nagraj w Chrome albo Edge”.
- Dlaczego nie WebCodecs + muxer: `VideoEncoder` jest tylko w bezpiecznym kontekście (na `about:blank` był niedostępny, **PRZETESTOWANE**; dashboard na `127.0.0.1` to bezpieczny kontekst, **WYWNIOSKOWANE**), daje kontrolę klatka po klatce, ale wymaga wklejonego muxera MP4 (np. `mp4-muxer`, MIT, kilkadziesiąt KB, **WYWNIOSKOWANE**), synchronizacji audio i przewijania filmu tła klatka po klatce (`seek` na każdą klatkę jest wolny). To nowa zależność i druga ścieżka nagrywania, czyli wbrew P17. Zostaje w „Później”, tylko jeśli pomiar płynności (etap 18) wypadnie źle.
- Nagrywanie w czasie rzeczywistym a płynność 60 fps: MediaRecorder bierze klatki z zegara ściennego, więc każda klatka musi się narysować w < 16 ms. Środki: (1) statyczne warstwy (nagłówek, podpis, tabela po wejściu) rysowane raz do `OffscreenCanvas` i nakładane jednym `drawImage`; (2) cień liczby (`shadowOnly`) liczony raz; (3) na klatkę tylko: klatka tła z filtrem i przyciemnieniem, warstwa statyczna, elementy w trakcie animacji. Pomiar w etapie 18: średni i 95. percentyl czasu klatki przy 1080×1920 na komputerze użytkownika. Gdy p95 > 14 ms: nagrywanie samo przechodzi na 30 fps z etykietą „30 kl./s” (decyzja gustu). Karta przeglądarki musi być widoczna (w tle `requestAnimationFrame` staje): pasek postępu „Nagrywanie 4 / 10 s, nie przełączaj karty” i „Anuluj”.
- Wynik: „Pobierz MP4” i na telefonie „Udostępnij” (`navigator.canShare({ files: [File video/mp4] })`); „Kopiuj” ukryte dla filmu. Nazwa pliku jak `fileName()`, z `.mp4`.
- **Ryzyko MP4 fragmentowanego (P20):** nie wiem, czy Instagram i TikTok przyjmują fMP4 bez `moov` z pełnymi tablicami (**WYWNIOSKOWANE**: odtwarzacze przyjmują, platformy zwykle przekodowują). Sprawdzenie: jeden ręczny upload przez użytkownika. Plan B (etap 18b): przepakowanie fMP4 → zwykły MP4 w czystym JS (przepisanie `moof/trun` na `stbl`, Szacunek 150–250 linii, bez biblioteki), nadal bez npm.

**Prawa do filmu tła [P]:** użytkownik używa własnego pliku i odpowiada za prawa do obrazu i muzyki; przetwarzanie wyłącznie w przeglądarce. Pod przyciskiem wyboru wyciszona notka: „Film zostaje na tym urządzeniu. Używaj tylko nagrań, do których masz prawa (także muzyki).” To samo w README (PL/EN). Repo nie zawiera żadnych cudzych filmów ani przykładowych teł.

### 3.12 Style wykresu (P16, P18, 27.10.2026)

Domyślnie wszędzie (podgląd, edycja, miniatury, karty, filmy): **wypełnione świece japońskie** w kolorach palety (`--profit`/`--loss`). Każdy styl to transformacja danych (`styl-wykresu.js`, czysta funkcja) + zestaw klas CSS w SVG i zestaw kolorów w canvasie + typ serii w LWC. Bez nowego renderera **[P]**.

| Styl | Dane | SVG / canvas | LWC (edycja) | Kiedy |
|---|---|---|---|---|
| **Świece (domyślny)** | bez zmian | `.candle.up/.down`, `.wick` | `CandlestickSeries` | **start** |
| **Linia zamknięć** (LiquidJournal) | `close` każdej świecy | jedna ścieżka `.close-line` (`--chart-line`) | `LineSeries` | **start** |
| Puste świece | bez zmian | `.candle.up` bez wypełnienia, tylko obrys | `CandlestickSeries` z `upColor` przezroczystym | później |
| Słupki OHLC | bez zmian | `.bar` (kreska + dwa ząbki) | `BarSeries` | później |
| Obszar z gradientem | `close` | ścieżka + wypełnienie `linearGradient` z tokenu | `AreaSeries` | później |
| Linia schodkowa | `close` | ścieżka z odcinkami poziomymi | `LineSeries` z `lineType: WithSteps` | później |
| Linia bazowa | `close` + cena wejścia | ścieżka z `clipPath` nad/pod ceną wejścia (zysk/strata) | `BaselineSeries` z `baseValue` = wejście | później |
| Heikin-Ashi | przeliczone HA OHLC | jak świece + znacznik „HA” przy TF | `CandlestickSeries` z danymi HA | później (zmienia ceny, wymaga etykiety, żeby nie mylić z prawdziwymi OHLC) |

Typy serii LWC: **WYWNIOSKOWANE** z dokumentacji LWC 5 (sprawdzenie w etapie 15). Uzasadnienie zestawu na start (P17): świece są domyślne (P18), linia zamknięć to wygląd z inspiracji użytkownika; oba to jedna transformacja i dwa zestawy klas. Pozostałe sześć dokładamy po jednym, każdy z testem transformacji, bez zmian w rendererach poza nową klasą. Rysunki są kotwiczone w czasie i cenie, więc zmiana stylu ich nie rusza.

### 3.13 Ustawienia → Wykresy (P18, 27.10.2026)

**Gdzie i jak:** piąta zakładka „Wykresy” w istniejącym popoverze Ustawień (`ustawienia.js`, `.seg.full.sp-tabs`: dziś Kolory, Wynik BE, Ogólne, Urządzenia). Te same komponenty: `.sp-f`, `.lbl`, `.seg`, `.check`, `.sp-in`, `.note`, `.rule-x`, `.btn.ghost.sm` „Przywróć domyślne” na końcu każdej grupy (wzór `pal-reset`, `be-reset`) **[W] [P]**. Na górze mały podgląd na żywo jak `.pv` w zakładce Kolory: `podglad.js` w trybie `mini` na 40 syntetycznych świecach (deterministyczny generator w `styl-wykresu.js`, bez sieci), z poziomem wejścia i wyjścia. Każda zmiana odświeża podgląd. Szerokość 5 przycisków zakładek przy 375 px sprawdzić zrzutem; gdy się nie mieści, etykieta „Wykres” albo przewijanie segmentu (decyzja gustu po zrzucie).

**Kolory:** domyślnie z palety i motywu (wzrostowe = `--profit`, spadkowe = `--loss`, linia = `--chart-line`). Opcja „Własny kolor” per motyw (Onyx, Platinum), tym samym wyborem koloru i tym samym ostrzeżeniem o kontraście („słaby kontrast 2,1:1” + „Popraw”, `fixContrast`) co paleta „Własna” **[W]**. Własny kolor jest zapisywany jako hex jak `settings.custom`.

**Synchronizacja:** nowy klucz `settings.chart` przechodzi przez istniejącą synchronizację (`collect` w `app.js`, blok JSON w Notion, `sanitizeChart` z białą listą kluczy i wartości, wzór `sanitizeShare`). Klucz Databento, limit kosztu i dane świec są **tylko lokalne**: klucz w `.env`, limit w `config.local.json` (dotyczy pieniędzy i urządzenia), nigdy w `settings`. Uwaga: `SECRET_KEY` w `lib/sync.mjs` (`token|secret|password|haslo|hasło|pin`) nie łapie słowa „key”, więc dopisujemy `key|databento` i test (decyzja mechaniczna).

| Grupa | Opcja | Domyślnie | Sync | Kiedy |
|---|---|---|---|---|
| Wygląd | Styl wykresu: Świece / Linia zamknięć | Świece | tak | start |
| Wygląd | Kolory świec: Z palety / Własne (per motyw, z kontrastem) | Z palety | tak | start |
| Wygląd | Knoty: jak korpus / wyciszone (`--fg-2`) | jak korpus | tak | później |
| Wygląd | Pozostałe style z p. 3.12 | — | tak | później |
| Siatka i osie | Siatka pozioma w podglądzie | wł. | tak | start |
| Siatka i osie | Siatka pionowa | wył. | tak | później |
| Siatka i osie | Oś cen po prawej / lewej | prawa | tak | później |
| Poziomy trade'a | Wejście i wyjście | wł. | tak | start |
| Poziomy trade'a | SL i TP | wł. w podglądzie, wył. w kartach | tak | start |
| Poziomy trade'a | Prostokąty zysku i straty pozycji | wł. | tak | później |
| Nakładki | Tło sesji (Azja, Londyn, NY) i godziny sesji (p. 8, pkt 11) | wył., godziny jak p. 8 | tak | start (etap 10) |
| Nakładki | PDH/PDL | wył. | tak | start (etap 10) |
| Rysunki | Domyślny kolor i grubość nowych rysunków | `--chart-line`, 1 px | tak | później |
| Karty i filmy | Wykres ceny w kartach i filmach | wył. do P15 | tak | start (aktywne po P15) |
| Karty i filmy | Styl wykresu w karcie: jak w podglądzie / własny | jak w podglądzie | tak | start |
| Karty i filmy | Krzywa kapitału na kartach okresu | wł. | tak | start |
| Karty i filmy | Film: domyślny format, długość, czarno-białe, przyciemnienie, dźwięk | 9:16, 10 s, wył., 0,6, wył. | tak | start |
| Dane | Klucz Databento (zapis do `.env`, sprawdzenie `get_cost`) | pusty | **nie** | start |
| Dane | Limit kosztu jednego pobrania | 1 USD (P2) | **nie** | start |
| Dane | Rozmiar `chart-data/` + „Usuń pobrane świece” | — | **nie** | start |
| Licencje | Atrybucja TradingView (P3), Databento i CME, notka o prawach do filmów tła | — | — | start (tekst) |

Na start: 4 grupy z opcjami (Wygląd, Poziomy, Karty i filmy, Dane) + Siatka (jeden przełącznik) + Nakładki (od etapu 10) + Licencje (tekst). Reszta „Później”, każda opcja dodawana bez zmiany układu zakładki.

---

## 4. Rozmiar danych i koszt

### 4.1 Fakty potwierdzone źródłem

| Fakt | Źródło | Dowód |
|---|---|---|
| Rekord OHLCV Databento = 56 B | założenie użytkownika; zgodne z listą pól schematu | **WYWNIOSKOWANE** |
| Cena liczona od rozmiaru **nieskompresowanego** w kodowaniu binarnym; CSV/JSON bez dopłaty; kompresja nie zmienia kosztu | databento.com/pricing | **CZĘŚCIOWE** (odczyt strony) |
| Nowi użytkownicy: **125 USD** kredytu, wygasa **6 miesięcy** po rejestracji, jeden zestaw na zespół | databento.com/pricing | **CZĘŚCIOWE** |
| CME „from $0.50/GB” | założenie użytkownika; strona cennika i katalogu pokazuje tylko kalkulator, stawki nie znalazłem | **niepotwierdzone** |
| Dane historyczne GLBX.MDP3 od 06.06.2010, OHLCV-1s dostępne, „A license isn't required to access historical data” | databento.com/catalog/cme/GLBX.MDP3 | **CZĘŚCIOWE** |
| Notion: 2 000 znaków na `text.content`, 100 elementów w tablicy, 500 KB na żądanie, ~3 żądania/s | developers.notion.com/reference/request-limits | **CZĘŚCIOWE** |
| Rysunek z `buildNewDrawing` + id po `JSON.stringify`: linia pozioma 150 znaków, trend 178, prostokąt 177, Fibonacci 183, tekst (20 znaków treści) 169, pozycja long 184 | Node, paczka 0.6.2 | **PRZETESTOWANE** |

### 4.2 Szacunki: świece

- Szacunek: ES ma transakcję prawie w każdej sekundzie sesji RTH (23 400 s) i w części sekund sesji nocnej, razem około **55–70 tys. świec 1s na sesję**.
- Szacunek: koszt jednej sesji ES w `ohlcv-1s`: 55–70 tys. × 56 B ≈ **3,1–3,9 MB** ≈ **0,0016–0,002 USD** przy 0,50 USD/GB. Typowy trade z kontekstem (2–3 dni) to **poniżej 0,01 USD**, daleko pod limitem 1 USD.
- Szacunek: rok ES (~250 sesji) ≈ 0,8–1 GB ≈ **0,40–0,50 USD**; ES i NQ razem ≈ **1 USD** rocznie (MES i MNQ nic nie dokładają, decyzja P9). Kredyt 125 USD pokrywa to z ogromnym zapasem, o ile nikt nie pobierze `ES.FUT`, czego moduł nie robi.
- Szacunek: lokalnie rekord 24 B daje ≈ **1,3–1,7 MB** na sesję ES w 1s, ≈ **0,35–0,45 GB** na rok jednego symbolu, plus ~9 MB rocznie warstwy 1m.
- Prawdziwy koszt każdorazowo podaje `get_cost` i pokazuje go użytkownikowi przed pobraniem.

### 4.3 Szacunki: czy Notion utrzyma rysunki

Odpowiedź na pytanie użytkownika: **tak, z dużym zapasem dla dziennika tradingowego.**

- Szacunek: rysunek po zmianie stylu (kolor, przezroczystość, linia CE w FVG, etykiety) urośnie z ~150–185 znaków (zmierzone, p. 4.1) do **~250–450 znaków**. Do obliczeń przyjmuję **400 znaków** jako ostrożną średnią.
- Szacunek: limit 190 000 znaków / 400 ≈ **475 rysunków na jeden trade**; przy samych domyślnych stylach (~180 znaków) około **1 000**.
- Szacunek: typowy trade ma 5–20 rysunków (poziomy, FVG, Fibonacci, kilka linii, notatka), czyli **2–8 tys. znaków**, około **1–4%** limitu i **1–4 kawałki** z 100 dostępnych.
- Szacunek: najcięższe narzędzia z 86 (pędzel, ścieżka z wieloma punktami, tabela) mogą mieć po kilka tysięcy znaków, ale nie ma ich na pasku w v1.
- Szacunek: koszt dla odczytu listy trade'ów: Notion i tak odda pole przy pobieraniu bazy (`queryAll`). 200 trade'ów × 5 tys. znaków ≈ 1 MB więcej co 5 minut (automatyczne odświeżanie). Do przeglądarki nie trafia. Jeśli będzie to odczuwalne, zapytanie może pominąć to pole parametrem `filter_properties` (**WYWNIOSKOWANE**, do sprawdzenia, gdy zajdzie potrzeba).
- Żądanie zapisu przy maksimum: 190 000 znaków JSON-a z ucieczkami cudzysłowów w kopercie żądania ≈ 230–250 KB, poniżej 500 KB (**Szacunek**).

### 4.4 Dlaczego warstwa 1m zostaje mimo zasady prostoty

Interwał `1D` z samego 1s to ~70 tys. rekordów na dzień do przeliczenia; miesiąc na `1D` to ~1,5 mln odczytów. Z warstwy 1m to ~1 400 na dzień. Koszt prostoty jest mały: ta sama funkcja agregacji i ten sam format pliku, liczone przy zapisie. **[P]**

### 4.5 `node:sqlite`: odrzucone

W Node **22.19** `require('node:sqlite')` działa bez flagi, ale wypisuje `ExperimentalWarning` (**PRZETESTOWANE**). Repo deklaruje `engines: ">=22"`, a starsze wydania linii 22 wymagały flagi `--experimental-sqlite` (**WYWNIOSKOWANE**). Ostrzeżenie trafiałoby do `dashboard.log` u każdego użytkownika, a moduł jest oznaczony jako eksperymentalny. Pliki binarne per dzień wystarczają. **[P]**

---

## 5. Narzędzia

### 5.1 Na start (7 przycisków + 2 nakładki)

| Przycisk | Realizacja | Uwagi |
|---|---|---|
| Linia pozioma | `horizontal-line` z paczki | |
| Linia trendu | `trend-line` | |
| Prostokąt | `rectangle` | |
| FVG | `rectangle` z gotowym stylem: wypełnienie `--be` ~12%, `rectMiddleLine` przerywana = linia CE (50%) | **[P]** preset, nie nowe narzędzie |
| Fibonacci | `fib-retracement`, poziomy 0 / 0,5 / 0,618 / 0,705 / 0,79 / 1 | P7 |
| Tekst | `text`, edytor: małe pole `input` w miejscu kliknięcia po zdarzeniu `textEdit` | |
| Pozycja long / short z R | `long-position` / `short-position`; R w etykiecie | ręczny rysunek niezależny od pól trade'a |
| Nakładka: tło sesji | własny prymityw serii LWC (~80 linii, **Szacunek**): pasy Azja / Londyn / Nowy Jork w czasie `America/New_York` | P8 |
| Nakładka: PDH / PDL | dwie linie cenowe z poprzedniej sesji CME (z agregatu `1D`) | |

Obsługa klawiatury z paczki: Esc, Delete, Shift (45°), Ctrl/Cmd. Cofanie: Ctrl+Z na stosie migawek `exportJSON()` po zdarzeniu `gestureEnd` (~30 linii).

### 5.2 Później (po zamknięciu etapów 0–12 i 14–18)

- **Replay świeca po świecy z 1s** (etap 13): kursor czasu, świece wybranego TF składane w przeglądarce z 1s przez `swiece.js` (ostatnia świeca rośnie sekunda po sekundzie), przyciski krok / play / prędkość, ukrycie przyszłości. Rysunki działają w trakcie.
- **FX (EURUSD, XAUUSD)**, tylko jeśli użytkownik o to poprosi (słowa użytkownika z 26.10.2026: «Nie, na razie tylko futures»). Zebrane fakty, żeby nie powtarzać pracy: Dukascopy daje godzinowe pliki `.bi5` (surowe LZMA, rekord 20 B, miesiąc w ścieżce liczony od 00); dekoder LZMA-JS (MIT, 7 KB) rozpakował prawdziwy plik w Node (**PRZETESTOWANE** 26.10.2026); serwer odpowiada 429 bez `User-Agent`, a warunków użycia publicznego kanału nie znalazłem. Wymagałoby też sesji FX (17:00 `America/New_York`). Żadnego kodu przygotowawczego do tego czasu.
- Więcej narzędzi z paczki (kanał równoległy, rozszerzenie Fibonacciego, ścieżka).
- Rysunki w miniaturach: odrzucone na razie (P13); wróciłyby tylko z rozwiązaniem bez żądań do Notion na każdy trade.
- ~~Godziny sesji i ustawienia nakładek synchronizowane blokiem ustawień w Notion~~: w v3 od razu w `settings.chart` (p. 3.13).
- Wolumen jako histogram pod wykresem.
- **v3, odłożone przez P17 (27.10.2026):** sześć stylów wykresu z p. 3.12 (puste świece, OHLC, obszar, schodkowa, linia bazowa, Heikin-Ashi); opcje „później” z tabeli p. 3.13; film w 4:5 i 1:1; rozmycie tła filmu; wybór fragmentu filmu tła (start od sekundy X); nagrywanie klatka po klatce przez WebCodecs + muxer (tylko gdy pomiar etapu 18 wypadnie źle); pigułki „Entry/Exit” (tylko po P19).

---

## 6. Etapy wdrożenia (TDD, małe kroki)

Zasady testów dla wszystkich etapów:
- tylko atrapy: `testy/atrapa-notion.mjs` i nowa `testy/atrapa-databento.mjs`; adres przez `DATABENTO_API_BASE` (wzór `NOTION_API_BASE`); `cleanEnv` usuwa `DATABENTO_API_KEY` i ustawia bazę na martwy port `127.0.0.1:9`, więc żaden test nie dosięgnie prawdziwego Databento ani Notion;
- atrapa Notion dostaje egzekwowanie limitów z p. 3.6 (`text.content` > 2 000 → 400 `validation_error`, tablica > 100 → 400, ciało > 500 KB → 413), żeby testy rysunków coś znaczyły;
- dane testowe syntetyczne;
- najpierw test czerwony, potem kod, potem `node testy/run.mjs` w całości;
- UI sprawdzany na `node testy/start-test.mjs` przy 1920×1080 i 375 px, w obu motywach, zrzutami.

| # | Etap | Test (najpierw) | Gotowe, gdy |
|---|---|---|---|
| 0 | **Biblioteki w `public/vendor/`**: LWC 5.2.1 standalone `.mjs` + LICENSE + NOTICE; paczka rysowania 0.6.2 `es.js` + LICENSE; `VENDOR.md` z sumami | sumy SHA-256 zgodne z `VENDOR.md`; żaden plik vendor nie ma `import`; licencje obecne; `treeHash` obejmuje nowe pliki; test i18n ich nie skanuje | testy zielone, strona startuje bez zmian |
| 1 | **Agregacja** (`public/js/swiece.js`): parser TF, sesja CME, kotwica sesji, agregacja | świece syntetyczne: `7s`, `45s`, `90s` (z 1s), `13m`, `4h`, `1D`, `1W`; przerwa 16–17 CT; otwarcie w niedzielę; DST USA (marzec, listopad) i tydzień rozjazdu z Europą; luki zostają lukami; ostatnia świeca sesji przycięta | wszystkie przypadki z listy zielone |
| 2 | **Magazyn** (`lib/candles-store.mjs`) | zapis i odczyt rekordów 24 B; zakres przez granicę dni UTC; zapis atomowy; `days.json (zastąpione przez coverage.json, P25)` (`complete` z zerem świec dla weekendu, `partial`, `rolls`); warstwa 1m zgodna z agregacją 1s | testy zielone, katalog w `THQ_CONFIG_DIR` |
| 3 | **Databento** (`lib/databento.mjs`) | atrapa obsługuje `metadata.get_dataset_range` (zwraca ustawiany w teście `end`); drugie wywołanie w ciągu 15 min nie idzie do atrapy (cache); atrapa sprawdza: Basic Auth z kluczem testowym, `symbols` tylko `ES.v.0` albo `NQ.v.0`, `stype_in=continuous`, `schema=ohlcv-1s`; **żaden symbol nie kończy się na `.FUT` ani nie zawiera `.c.`**; MES i MNQ dają żądania o `ES.v.0`/`NQ.v.0`, a drugi raz nic nie pobierają; `get_range` nie jest wołane bez wcześniejszego `get_cost`; wycena wyższa niż potwierdzona albo > 1 USD → przerwanie bez `get_range`; parser CSV (1e-9 → ×100, ns → s, zmiana `instrument_id` = wpis w `rolls`); błędy 401/402/422/429; klucz nie pojawia się w logach ani odpowiedziach | testy zielone |
| 4 | **API świec** (`lib/candles.mjs`, trasy w `server.mjs`, `DATABENTO_API_KEY` w `env.mjs`) | `GET /api/candles` (walidacja instrumentu, `tf`, zakresu, limit 50 000, `missing`, instrument spoza mapy → odpowiedź „brak źródła”); odpowiedzi zawierają `availableEnd`; zakres `quote`/`fetch` przycięty do `availableEnd`; dzień przecięty granicą → `partial` z `until`; dociągnięcie po przesunięciu `availableEnd` wycenia i pobiera tylko brakującą końcówkę i scala bez duplikatów (liczba świec = suma unikalnych `t`, warstwa 1m przeliczona); trade po `availableEnd` → stan „jeszcze niedostępne” i **zero żądań `get_cost` i `get_range`** w logu atrapy; nic nie pobiera się bez `POST /fetch`; `POST /api/candles/quote` i `/fetch` tylko przez `guardWrite`; zadanie z postępem; zapis klucza do `.env`; `meta()` ma `hasDatabentoKey`, nigdy klucza; `PROTECTED` i `.gitignore` zawierają `chart-data` | test serwera na atrapach |
| 5 | **Migracja 003 i pola w Notion**: `schema/notion-schema.json` (`schemaVersion` 3), `migrations/003-poziomy-rysunki.mjs` (5× `addProperty`: `number` `entryPrice` „Cena wejścia/Entry price”, `exitPrice` „Cena wyjścia/Exit price”, `sl` „SL”, `tp` „TP”; `rich_text` `drawings` „Rysunki/Drawings”), role w `roles.mjs` (`optional: true`), odczyt cen w `data.mjs`/`stats.js` (bez `drawings`), walidacja cen w `writes.mjs`, pola w `form.js` | `node testy/run.mjs migracje` (tylko dozwolone operacje, idempotencja, zero naruszeń w `/__test/violations`); instalacja PL i EN dostaje 5 pól; zapis i odczyt cen przez atrapę; `/api/data` nie zawiera rysunków; puste pola nie psują statystyk; i18n | podgląd `node update.mjs --migrate-only --dry-run` na atrapie pokazuje 5 pól |
| 6 | **Geometria rysunków i test zgodności** (`public/js/geometria.js`, `testy/zgodnosc-rysunkow.html`, `testy/przegladarka.mjs`) | krok 1: uruchamiacz przeglądarki bez zależności (Chrome/Edge headless, „pominięty” bez przeglądarki); testy jednostkowe w Node: skala po indeksie świecy (luki się zwijają), punkt w środku świecy trafia na świecę, która go zawiera, punkty w przyszłości, skala ceny z marginesami, kształty 7 narzędzi (Fibonacci z poziomami z rysunku i domyślnymi, prostokąt z linią CE, pozycja long i short), rysunek nieznanego rodzaju pominięty z licznikiem; test zgodności z LWC: każde z 7 narzędzi, tolerancja 1 px | testy zielone w Node i w przeglądarce |
| 7 | **Podgląd SVG w szczegółach trade'a** (`public/js/podglad.js`, klasy w `styles.css`) | test jednostkowy: wybór świec w kadrze (z zapasem), automatyczne podniesienie TF powyżej 1 500 świec i etykieta „wyświetlane X (wybrano Y)”; w kodzie `podglad.js` nie ma literałów kolorów (test grep `#[0-9a-f]{3,6}\|rgb\(` = 0); ręcznie: świece, poziomy, prostokąty pozycji, znacznik zmiany kontraktu, rysunki z JSON (bez edycji), TF, przeciąganie, kółko, pinch na telefonie, dymek, stan „brak świec” z wyceną i potwierdzeniem, „brak źródła” dla EURUSD, linijki „Świece dostępne do” i atrybucji; pomiar płynności przy 1 500 świecach | zrzuty 1920 i 375 px w Onyx i Platinum wyglądają jak `charts.js`; motyw i paleta zmieniają podgląd bez kodu JS |
| 8 | **Tryb edycji w LWC** (`public/js/wykres.js`) | krok 1 (spike): przezroczyste tło i kolory z sondy canvas w LWC; test jednostkowy `themeOptions()` na obiekcie tokenów; test jednostkowy przeliczenia wspólnego stanu kadru `{ tf, fromIndex, toIndex }` w obie strony; ręcznie: „Edytuj” ładuje LWC dopiero po kliknięciu (sieć: brak pliku LWC przed kliknięciem), ten sam kadr i TF po wejściu i po „Gotowe”, motyw i paleta na żywo, poziomy, rysunek pozycji z pól trade'a (jednostki `stopLevel`/`profitLevel`) | przejście podgląd ↔ edycja bez skoku kadru |
| 9 | **Rysunki w Notion** (`public/js/rysunki.js`, `writes.drawings`, `POST /api/drawings/save`, `GET /api/drawings/:id`, cache) | atrapa Notion: JSON 5 000 znaków → 3 kawałki, sklejenie daje identyczny tekst; JSON z polskimi znakami na granicy kawałka; dokładnie 190 000 znaków → zapis (95 kawałków); 190 001 → odrzucenie z komunikatem, zero żądań do Notion; atrapa nigdy nie dostaje kawałka > 2 000 ani tablicy > 100; zły `v`, zły identyfikator, śmieci w `parseDrawings` → 400; awaria atrapy → zapis w cache z `pending`, następny zapis najpierw wysyła zaległy stan; 10 zdarzeń `change` w 1 s → jedno żądanie PATCH (test debounce z fałszywym zegarem); front ręcznie: 7 narzędzi, FVG z CE, Ctrl+Z, rysunek z edycji widoczny w podglądzie w tym samym miejscu, odtworzenie po zmianie TF i przeładowaniu, styl z tokenów | rysunek wraca po restarcie serwera i po skasowaniu cache |
| 10 | **Nakładki w obu trybach**: tło sesji (klasy SVG w podglądzie, prymityw w LWC) i PDH/PDL | czyste funkcje okien sesji (DST, sesja przez północ) i wyboru poprzedniej sesji CME, wspólne dla obu rendererów; ręcznie: przełączniki, kolory z tokenów, te same pasy w podglądzie i edycji | testy zielone, zrzuty |
| 11 | **Miniatury**: lista trade'ów i lista dnia w kalendarzu (`podglad.js`, tryb `mini`; `tf=auto&maxBars` w `/api/candles`) | serwer: `tf=auto` wybiera najmniejszy TF z listy przy ≤ 80 świecach; miniatura nigdy nie wywołuje `quote`/`fetch` ani żądań do Notion (log atrap: zero żądań Databento i zero `GET /v1/pages` przy przewijaniu listy 50 trade'ów); miniatura nie woła `/api/drawings` (log serwera) i nie rysuje rysunków, nawet gdy trade je ma w Notion i w lokalnej kopii; brak świec → zrzut albo pusty stan; ręcznie: leniwe ładowanie, najwyżej 4 żądania naraz, cache w pamięci, czytelność przy 375 px | lista 200 trade'ów przewija się płynnie |
| 14 | **Ustawienia → Wykresy** (`ustawienia.js` zakładka „Wykresy”, `styl-wykresu.js`: domyślne, `sanitizeChart`, generator świec syntetycznych; `app.js` `collect`/odczyt; `lib/sync.mjs` `SECRET_KEY` + `key|databento`) | `sanitizeChart`: nieznane klucze i złe wartości odrzucone, brak klucza = domyślne; zapis i odczyt przez synchronizację na atrapie Notion (blok ustawień zawiera `chart`, **nie zawiera** klucza Databento ani limitu kosztu, test na tekście bloku); „Przywróć domyślne” per grupa przywraca tylko swoją grupę; własny kolor: kontrast liczony tą samą funkcją co paleta „Własna”, „Popraw” podnosi go do progu; podgląd `mini` przerysowuje się po zmianie bez żądań sieciowych; ręcznie: zrzuty 1920 i 375 px w Onyx i Platinum, zakładki mieszczą się przy 375 px | zakładka wygląda jak Kolory i Wynik BE; zmiana na jednym urządzeniu widoczna na drugim (atrapa) |
| 15 | **Styl „Linia zamknięć”** w podglądzie, miniaturach i edycji (`styl-wykresu.js`, klasa `.close-line`, `LineSeries` w `wykres.js`) | transformacja `close` (luki zostają lukami); `candleShapes`/`lineShapes` dla obu stylów; test zgodności z LWC rozszerzony o linię (tolerancja 1 px); grep: brak literałów kolorów | przełączenie stylu w Ustawieniach zmienia podgląd, miniatury i edycję bez przeładowania; rysunki zostają w miejscu |
| 16 | **Krzywa kapitału na kartach okresu** (`udostepnij-dane.js` `curve`, `udostepnij-render.js`, przełącznik w oknie Udostępnij) | `curve` liczona tylko z trade'ów Live w kolejności czasu, w R/$/%; etykiety: końcowa, szczyt, 0; okres bez trade'ów → karta jak dziś; `testy/udostepnij-podglad.html` dostaje warianty z krzywą (4 formaty × 2 motywy); istniejące testy kart bez zmian | zrzuty 9:16 i 16:9 w obu motywach; krzywa wyłączona = karta identyczna z 1.2.2 (porównanie pikseli) |
| 17 | **Wykres trade'a w karcie** (czeka na P15; `udostepnij-render.js` przez `geometria.js`, `shareModel` z `/api/candles?tf=auto&maxBars=60`) | `CHART_IN_SHARE = false` → zero żądań `/api/candles` z okna Udostępnij; po P15 test wariantu (dla A: wyjście 23 h temu → bez wykresu, 25 h → z wykresem; brak etykiet osi cen); EURUSD i brak świec → karta jak dziś; znaczniki wejścia/wyjścia jako tekst bez podkładki (P19); tabela z cenami i rozmiarem; świece i linia z tych samych kształtów co podgląd (test: te same współrzędne przy tych samych skalach) | zrzuty 4 formatów w obu motywach, ze zdjęciem i bez |
| 18 | **Filmy** (`film.js`, `renderCard({ at })`, segment „Obraz | Film”, `testy/film-podglad.html`) | test jednostkowy osi czasu: stan elementów dla `at` = 0, 1, 2, 3,4, ∞ (licznik wyniku monotoniczny, kończy na dokładnej wartości, `at: ∞` = obraz PNG piksel w piksel); wybór typu nagrania (`isTypeSupported`: MP4 → WebM z notką); film tła nie trafia do `fetch`/`XMLHttpRequest`/`localStorage` (test na atrapie `fetch` i grep); w przeglądarce (uruchamiacz z etapu 6): 2 s nagrania 1080×1920 daje plik, który `<video>` odczytuje z właściwym rozmiarem i długością ±0,1 s; pomiar czasu klatki (średnia, p95) zapisany do raportu; przejście na 30 fps przy p95 > 14 ms; ręcznie: tło czarno-białe i przyciemnienie, dźwięk wł./wył., zapętlenie, „Anuluj”, ostrzeżenie przy ukryciu karty | użytkownik wrzuca 1 testowy MP4 na Instagram i TikTok (P20, tylko za jego zgodą); gdy odrzucą → 18b |
| 18b | **(warunkowo) Przepakowanie fMP4 → MP4** w czystym JS | struktura wyniku: `ftyp, moov(stbl), mdat`, bez `moof`; ta sama liczba próbek i długość; odczyt przez `<video>` | ponowny upload przechodzi |
| 12 | **Dokumentacja i wydanie 1.3.0** (po etapach 0–11 i 14–18): README PL/EN (Wykresy: podgląd i edycja, klucz Databento, koszty, embargo, nowe połączenie w „Bezpieczeństwo i połączenia sieciowe”, licencje i atrybucja, ukrycie kolumny „Rysunki”, tylko ES/NQ/MES/MNQ; Ustawienia → Wykresy; karty z wykresem i zasada z P15; filmy: MP4/WebM, film tła zostaje lokalnie, prawa do filmu i muzyki), CHANGELOG, `package.json` | test i18n; test, że README wymienia `hist.databento.com` i notkę o filmach tła; pełne `node testy/run.mjs` (z testem zgodności i testem nagrania, jeśli jest przeglądarka) | wydanie według CONTRIBUTING (tag, `suma-wydania.mjs`) dopiero na polecenie użytkownika |
| 13 | **Replay z 1s** (później) | czysta funkcja „stan świec TF w chwili T” z 1s; ręcznie: krok, play, ukrycie przyszłości (w podglądzie SVG) | osobny plan po etapie 12 |

Kolejność: 0–11, 14–18 (17 dopiero po P15, 18b tylko gdy P20 wypadnie źle), 12, później 13. Po etapie 4 można pobierać i oglądać dane przez API, po 7 widać wykres we własnym designie, po 9 da się rysować, po 11 są miniatury, po 14 są Ustawienia → Wykresy, po 16 karty okresu mają krzywą, po 18 są filmy.

---

## 7. Ryzyka

| # | Ryzyko | Skutek | Co robimy |
|---|---|---|---|
| R1 | Paczka rysowania młoda (pierwszy commit 18.12.2025, 0.x, częste zmiany API, np. 0.2 złamało 0.1) | aktualizacja może wymagać zmian w `rysunki.js`; stare rysunki w Notion w starym modelu | przypięcie do 0.6.2 z sumą; `lib` w JSON rysunków i `migrateDrawing` paczki przy odczycie |
| R2 | Build paczki rysowania robi autor, nie my | zaufanie do pliku z npm | integralność sha512 z rejestru, tag = commit `0291d9c`, plik czytelny (nie zminifikowany) |
| R3 | `ES.v.0` ustala kontrakt wg obrotu z **poprzedniego** dnia (**CZĘŚCIOWE**, dokumentacja symbologii) | w dniu przejścia płynności wykres może jeszcze przez jedną sesję pokazywać stary kontrakt | znacznik zmiany kontraktu; tekst w README |
| R4 | Strefa czasu trade'a: `data.mjs` bierze z Notion tylko `date.start`, a zapis ustawia `time_zone` osobno | możliwe przesunięcie znaczników wejścia o różnicę stref | test w etapie 5 na atrapie z `time_zone`; poprawka odczytu, jeśli trzeba (**CZĘŚCIOWE**: kod przeczytany, zachowanie API Notion do sprawdzenia) |
| R5 | Parser kolorów LWC a OKLCH i składnia `rgb(r g b / a)` | złe kolory albo wyjątek | sonda canvas (p. 1.2), spike w etapie 8 |
| R6 | Embargo danych historycznych (~24 h, **CZĘŚCIOWE**) i brak bieżącej sesji przez HTTP bez abonamentu live | plan bez abonamentu live = **brak wykresu z bieżącej sesji**; dziennik służy do przeglądu po fakcie | `availableEnd`, linijka „Świece dostępne do”, stan „jeszcze niedostępne”, status `partial` i ręczne dociąganie końcówki (p. 3.2a); opis w README |
| R7 | Wydajność: 1s przez cały dzień to ~70 tys. świec | wolny wykres | limit 50 000 i domyślny zakres wokół trade'a |
| R8 | Koszt Databento: błąd w kodzie mógłby pobrać za dużo | pieniądze użytkownika | dwukrotne `get_cost`, limit 1 USD, tylko `ES.v.0`/`NQ.v.0`, test „nigdy `.FUT`” |
| R9 | Rysunki w Notion: dwa urządzenia edytują ten sam trade | starszy stan nadpisuje nowszy | ostatni zapis wygrywa (jak ustawienia), opis w README |
| R10 | Rysunki w Notion: kolumna z JSON-em w widokach, ręczna edycja przez użytkownika | zepsuty JSON | walidacja przy odczycie; zepsuty JSON → wykres bez rysunków + komunikat, cache zostaje nietknięty; nazwa pola i README ostrzegają |
| R11 | Odczyt 100 kawałków `rich_text` przez API strony nie był sprawdzony na prawdziwym Notion | obcięte rysunki | test na atrapie + jeden ręczny test użytkownika na jego dzienniku przed wydaniem (krok w etapie 12, za zgodą) |
| R12 | Dwa renderery (P12) rozjadą się z czasem: rysunek w podglądzie w innym miejscu niż w edycji | użytkownik widzi co innego, niż narysował | jedna geometria w `geometria.js`, test zgodności z LWC z tolerancją 1 px w pełnym zestawie testów; aktualizacja paczki rysowania dopiero po zielonym teście zgodności |
| R13 | Test zgodności potrzebuje przeglądarki; bez Chrome/Edge jest pomijany | rozjazd niewykryty na maszynie bez przeglądarki | wydanie (etap 12) wymaga przebiegu z przeglądarką, wynik wpisany do raportu wydania |
| R14 | Miniatury bez rysunków (decyzja P13) różnią się od podglądu | użytkownik może szukać rysunku na liście | dymek miniatury „Rysunki w szczegółach trade'a”; test etapu 11 pilnuje, że miniatura nie woła `/api/drawings` ani Notion |
| R15 | Licencja CME na publiczne obrazy i filmy z wykresem (F1–F6, p. 3.7) niepotwierdzona | naruszenie warunków danych przez użytkownika publikującego karty | P15 u użytkownika; do decyzji `CHART_IN_SHARE = false`; README mówi, że publikujący odpowiada za warunki swoich danych |
| R16 | MediaRecorder w Chrome daje MP4 fragmentowany (**PRZETESTOWANE**); przyjęcie przez Instagram/TikTok nieznane | film nie wgra się albo wgra się bez długości | P20: ręczny upload; plan B etap 18b (przepakowanie w JS, bez npm) |
| R17 | Nagrywanie w czasie rzeczywistym gubi klatki na słabszym komputerze albo przy ukrytej karcie | szarpany film | warstwy statyczne w `OffscreenCanvas`, pomiar p95 i automatyczne 30 fps, ostrzeżenie „nie przełączaj karty”, „Anuluj” |
| R18 | `ctx.filter` (czarno-białe) nie wszędzie działa (Safari, **WYWNIOSKOWANE**) | tło w kolorze mimo przełącznika | wykrycie wsparcia (`'filter' in ctx` + próba na 1 px), przy braku przełącznik ukryty |
| R19 | Prawa autorskie filmu tła i muzyki | ryzyko po stronie użytkownika | tylko plik użytkownika, przetwarzanie lokalne, notka w UI i README, zero wbudowanych filmów |
| R20 | Ustawienia rozrastają się (P18) wbrew prostocie (P17) | zakładka trudna w obsłudze | na start tylko opcje oznaczone „start” w p. 3.13; każda nowa opcja = jeden wiersz tabeli i test `sanitizeChart`; grupy z „Przywróć domyślne” |
| R21 | `SECRET_KEY` w `sync.mjs` nie łapie słowa „key” | klucz mógłby trafić do Notion, gdyby ktoś dopisał go do `settings` | klucz tylko w `.env`; rozszerzenie wzorca o `key|databento`; test na tekście bloku ustawień (etap 14) |

---

## 8. Decyzje gustu (zatwierdzone 26.10.2026 przez sesję główną, bez sprzeciwu użytkownika)

1. Wykres w szczegółach trade'a (przełącznik „Zrzuty | Wykres”), bez nowej zakładki.
2. Atrybucja: `attributionLogo: false` + wyciszona linijka pod wykresem + sekcja „Licencje” w Ustawieniach.
3. Paczka rysowania z tarballa npm 0.6.2 (integralność sha512), bez budowania ze źródeł.
4. 7 narzędzi na start, FVG jako preset prostokąta z linią CE.
5. Dzień pliku = dzień UTC; rekord 24 B; bez kompresji plików.
6. Kotwica świec = otwarcie sesji CME dla każdego interwału (także `7s`).
7. Dla interwałów niebędących wielokrotnością minuty (np. `90s`) źródłem jest 1s.
8. Databento przez CSV bez kompresji (ta sama cena wg cennika, prostszy parser).
9. Zakres startowy: wejście −2 h do wyjścia +1 h, interwał `1m`; limit 50 000 świec na odpowiedź.
10. Oś czasu w strefie przeglądarki (jak reszta dashboardu).
11. Domyślne godziny sesji tła (`America/New_York`): Azja 20:00–00:00, Londyn 02:00–05:00, Nowy Jork 09:30–16:00 (P8).
12. Poziomy Fibonacciego: 0 / 0,5 / 0,618 / 0,705 / 0,79 / 1 (P7).
13. Nazwy: katalog `chart-data/`, pliki `swiece.js`, `wykres.js`, `rysunki.js` (polskie nazwy jak `palety.js`, `aktualizacja.js` w repo), moduły serwera po angielsku jak reszta `lib/`.
14. Rysunki: debounce 2 s, limit 190 000 znaków, licznik zajętości od 80%, format `{"v":1,"lib","at","d"}`, cache w `chart-data/drawings-cache/` (nowe 26.10.2026, wynikają z decyzji P4).

Punkty 15–19 są nowe (26.10.2026, wynikają z P12), zatwierdzone jako P14.

15. Podgląd powyżej 1 500 świec w kadrze sam podnosi interwał wyświetlania (z etykietą), zamiast przechodzić na canvas: jedna technika rysowania stylowana CSS-em (p. 3.8).
16. Oś X podglądu po indeksie świecy, jak w LWC (luki się zwijają), żeby rysunki leżały w tym samym miejscu w obu trybach.
17. LWC i paczka rysowania ładowane dopiero po „Edytuj” (dynamiczny `import()`).
18. Miniatury: kadr trade'a ±15%, automatyczny TF z listy `15s 1m 5m 15m 1h` przy ≤ 80 świecach, najwyżej 4 żądania naraz, cache tylko w pamięci.
19. Test zgodności uruchamiany zainstalowanym Chrome/Edge w trybie headless, bez Playwrighta (zero zależności).

Punkty 20–31 są nowe (27.10.2026, v3, decyzje sesji głównej do pokazania użytkownikowi w raporcie; nie dotyczą P15, P19, P20):

20. Style na start: Świece (domyślny) i Linia zamknięć; sześć pozostałych w „Później” [P].
21. Znaczniki wejścia/wyjścia w kartach: pionowa kreska + kropka + etykieta tekstem bez podkładki, do decyzji P19 [W].
22. Kadr karty trade'a: wejście − 25% do wyjścia + 25% czasu trwania, `maxBars=60` [W].
23. Układ 16:9 karty trade'a jak LiquidJournal (wynik i tabela po lewej, wykres po prawej); pionowe: pas wykresu 28% obszaru środka nad liczbą [W].
24. Krzywa kapitału na kartach okresu domyślnie włączona, zawsze linia, etykiety: końcowa, szczyt, 0, daty [W].
25. Oś czasu animacji filmu z p. 3.11 (1 s tła, 2 s rysowania i licznika, tabela 2,6–3,4 s, znaczniki 3,0–3,4 s), `easeOutCubic` [W].
26. Film na start: 9:16 i 16:9, jakość 1080p/720p, długość 6/10/15 s (domyślnie 10 s), czarno-białe + przyciemnienie 0,6, dźwięk domyślnie wyłączony; bez rozmycia [P].
27. Zapis: MediaRecorder MP4 H.264 + AAC, bitrate 12 Mb/s dla 1080p i 6 Mb/s dla 720p (Szacunek), WebM tylko jako zapas [P].
28. Automatyczne przejście na 30 fps, gdy p95 czasu klatki > 14 ms [P].
29. Film tła nie jest zapamiętywany między otwarciami okna [P].
30. Zakładka „Wykresy” jako piąta w Ustawieniach, podgląd `mini` na 40 syntetycznych świecach, „Przywróć domyślne” per grupa [W] [P].
31. Limit kosztu Databento przeniesiony z ustawień synchronizowanych do `config.local.json` (dotyczy pieniędzy i urządzenia) [P].

---

## 9. Pytania otwarte

**Pytania do użytkownika (v3, 27.10.2026):**
- **P15 (wyzwanie użytkownika: licencja, publikacja):** który wariant wykresu ceny w kartach i filmach: A (rekomendowany: tylko trade'y z wyjściem starszym niż 24 h, bez osi cen i OHLC), B (bez wykresu ceny, tylko krzywa kapitału) czy C (pełne świece z osią)? Czy wysyłasz pytanie do Databento? Blokuje etap 17 i wykres ceny w filmach; nie blokuje 14–16 i 18.
- **P19 (wyzwanie użytkownika: sprzeczne z preferencją z 08.2026):** dymki „Entry/Exit” jako białe zaokrąglone pigułki jak w LiquidJournal czy domyślny wariant bez podkładki (etykieta tekstem obok znacznika)?
- **P20 (wymaga użytkownika: publikacja na jego kontach):** czy po etapie 18 wrzucisz jeden testowy MP4 (prywatnie albo jako szkic) na Instagram i TikTok?

Do sprawdzenia w trakcie (decyzje mechaniczne, raport po etapie):
- dokładne opóźnienie danych dla konta użytkownika: bezpłatne `metadata.get_dataset_range` przy pierwszym użyciu klucza (etap 4, ręcznie, kluczem użytkownika i za jego zgodą); wynik wpisać do p. 3.2a i do komunikatu „będą dostępne ok. …”;
- czy API widoków pozwala ukryć pole „Rysunki” w nowych instalacjach (etap 5);
- jednostki `stopLevel`/`profitLevel` w paczce rysowania (etap 8);
- ręczny test zapisu i odczytu rysunków na prawdziwym dzienniku użytkownika przed wydaniem: tylko za zgodą użytkownika (etap 12, klasa: wymaga użytkownika, bo dotyka jego danych).

---

## 10. Źródła

- Lightweight Charts 5.2.1: rejestr npm `lightweight-charts`, README i LICENSE w paczce, https://raw.githubusercontent.com/tradingview/lightweight-charts/master/NOTICE
- Paczka rysowania: https://github.com/deepentropy/lightweight-charts-drawing (commit `0291d9c`, `docs/TOOLS.md`, `README.md`), rejestr npm `lightweight-charts-drawing`
- Databento: https://databento.com/docs/schemas-and-data-formats/ohlcv, https://databento.com/docs/standards-and-conventions/symbology, https://databento.com/docs/api-reference-historical/metadata/metadata-get-cost, https://databento.com/pricing, https://databento.com/catalog/cme/GLBX.MDP3, kod klienta https://github.com/databento/databento-python (`historical/api/metadata.py`, `historical/api/timeseries.py`, `common/http.py`, `common/enums.py`)
- Notion: https://developers.notion.com/reference/request-limits, https://developers.notion.com/reference/retrieve-a-page
- Później (FX): https://github.com/LZMA-JS/LZMA-JS, https://www.dukascopy.com/wiki/en/development/data-export/
- Licencja danych (27.10.2026): https://databento.com/pricing (redystrybucja, 24 h), https://databento.com/catalog/cme/GLBX.MDP3 (licencja dla danych historycznych), https://roadmap.databento.com (embargo 24 h, wynik wyszukiwania), https://www.cmegroup.com/market-data/files/cme-derived-data-license-agreement.pdf (nieotwarty, kategorie z wyniku wyszukiwania), https://www.cmegroup.com/market-data/license-data/licensed-market-data-distributors.html
- Nagrywanie filmu (27.10.2026): test lokalny `MediaRecorder` w Edge 156 headless i Chromium 151 (Playwright), skrypt w katalogu roboczym sesji (`mr-test/t.html`), wyniki w p. 3.11
- Inspiracja: dwa filmy LiquidJournal użytkownika (16:9 686×360 60 fps 17,6 s; 9:16 2160×3840 60 fps 11,8 s) i arkusze klatek; opis w p. 3.10–3.11
- Repo: `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `public/js/udostepnij*.js`, `public/js/ustawienia.js`, `public/js/shots.js`, `lib/shots.mjs`, `lib/sync.mjs`, `lib/migrate.mjs`, `lib/updater.mjs`, `lib/roles.mjs`, `lib/writes.mjs`, `lib/notion.mjs`, `server.mjs`, `public/styles.css`, `public/js/palety.js`, `public/js/charts.js`, `public/js/app.js`, `migrations/001-pole-wyjscie.mjs`

---

## 11. Wykonanie oszczędne w tokenach (27.10.2026)

Słowa użytkownika: «zwizualizuj mi pelny plan w artefakcie plus rozprlanuj go tak zeby byl najbardziej oszczedny w tokenach». Decyzja sesji głównej: poniższy sposób wykonania; zgoda na lokalne commity (pkt 9) czeka na użytkownika.

**Krok przygotowawczy K0 (raz, model Sonnet):** plan dzielony na karty. `docs/plany/wykresy/00-wspolne.md` (do 80 linii: zasady testów, tokeny, skrót decyzji, zakazy) i `etap-NN.md` (do 50 linii każda: cel, pliki do przeczytania z zakresem linii albo wzorcem grep, pliki do zmiany, testy, „gotowe, gdy”, czego nie robić). Po K0 żaden agent nie czyta tego dokumentu w całości.

**Pakiety (10 przebiegów zamiast 19 etapów):**

| Pakiet | Etapy | Model | Dlaczego razem | Zrzuty |
|---|---|---|---|---|
| A | 0–2 | Sonnet | biblioteki i czyste funkcje, bez UI | 0 |
| B | 3–4 | Sonnet | atrapa Databento i API, jeden obszar serwera | 0 |
| C | 5 | Sonnet | migracja i formularz, mały zakres | 0 |
| D | 6–7 | Opus | geometria i podgląd SVG: najtrudniejszy wygląd | do 4 |
| E | 8–9 | Sonnet | edycja i rysunki w Notion, wspólny stan kadru | do 4 |
| F | 10–11 | Sonnet | nakładki i miniatury, ten sam renderer | do 4 |
| H | 14–15 | Sonnet | Ustawienia → Wykresy i styl „Linia zamknięć”: ten sam `styl-wykresu.js` i podgląd `mini` | do 4 |
| I | 16–17 | Opus | krzywa kapitału i wykres trade'a w kartach: wygląd kart, jeden plik `udostepnij-render.js`; 17 tylko po P15 (bez P15 pakiet robi samo 16) | do 4 |
| J | 18 (+18b) | Opus | filmy: oś czasu w `renderCard`, MediaRecorder, pomiar płynności; 18b osobnym wznowieniem tylko po P20 | do 4 (+ 1 nagranie testowe 2 s, nie zrzut) |
| G | 12 | Haiku | dokumentacja i wydanie 1.3.0; tylko na polecenie wydania | 0 |

Kolejność: K0 → A → B → C → D → E → F → H → I → J → (G). Bez równoległości: jeden worktree, wspólne testy. K0 robi też karty `etap-14.md`…`etap-18.md` (każda do 50 linii) z p. 3.10–3.13.

**Reguły:**
1. Agent czyta `00-wspolne.md`, swoją kartę i pliki z karty; duże pliki (`app.js`, `styles.css`, `server.mjs`) tylko przez grep i zakres linii.
2. Testy w trakcie tylko dla grupy etapu; pełny `node testy/run.mjs` raz na końcu pakietu; wynik do pliku, do kontekstu tylko podsumowanie i błędy.
3. Bez szukania w sieci: fakty są w planie z poziomami dowodu. Wyjątek: lista „do sprawdzenia w trakcie” (p. 9).
4. Zrzuty tylko w D, E, F, H, I, J, najwyżej 4 na pakiet (1920 i 375 px, Onyx i Platinum), JPEG, zapis na R:.
5. Raport pakietu do 15 linii: co zrobione, liczba zielonych testów, decyzje gustu, pytania. Bez diffów i treści plików. Sesja główna nie czyta kodu.
6. Nowy agent na każdy pakiet (czysty kontekst). Poprawki po review: wznowienie tego samego agenta przez SendMessage.
7. Review trzy razy zamiast po każdym etapie: `code-reviewer` + `security-auditor` po B (klucz, sieć, pieniądze), `code-reviewer` po F (UI), `code-reviewer` po J (karty, filmy, Ustawienia; plus sprawdzenie, że klucz Databento nie trafia do bloku synchronizacji, a film tła nigdzie nie wychodzi). Review czyta diff zakresu, nie całe pliki.
8. Pytania do użytkownika zbierane na końcu pakietu (agent nie może pytać w trakcie).
9. Lokalny commit na `feat/wykresy` po każdym pakiecie, bez push: kolejny agent i review czytają `git diff` pakietu zamiast całych plików. **Wymaga zgody użytkownika.**

10. Pakiety H–J nie powtarzają researchu: fakty o licencji (p. 3.7) i nagrywaniu (p. 3.11) są w planie z poziomami dowodu. `udostepnij-render.js` (414 linii) czytany przez grep i zakres linii (`buildModel`, `drawLayout`, `paintBackground`), nie w całości.

Szacunek: 1,5–2 mln tokenów na K0 + A–F (dwa review) i dodatkowo 0,6–0,9 mln na H–J z trzecim review (Szacunek z tej samej miary ~0,3 mln na agenta), wobec około 3–4 mln przy 13 osobnych agentach czytających cały plan i review po każdym etapie. Liczby z przebiegu planowania (~0,3 mln tokenów na agenta z pełnym kontekstem planu), nie z pomiaru wdrożenia.
