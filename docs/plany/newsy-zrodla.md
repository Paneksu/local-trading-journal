# Newsy makro USD: pomiar źródeł (etap 0)

Data pomiaru: 29.10.2026. Autor: `market-researcher`. Plan: `newsy-makro.md`.

Poziomy dowodów: **PRZETESTOWANE** (zmierzyłem teraz na żywo), **CZĘŚCIOWE** (źródło wtórne albo jedna próbka), **WYWNIOSKOWANE** (z mojej wiedzy lub reguły, bez sprawdzenia w źródle). Nie pobierałem żadnej strony forexfactory.com. Zapytania do feedu FF: **1** (`ff_calendar_thisweek.json`). Zapytania do FRED API: **1** (bez klucza).

## 0. Najważniejsze (priorytety)

1. **Twardy wymóg „wszystkie czerwone newsy USD od 01.2010” nie jest do spełnienia z samych źródeł oficjalnych.** Oficjalne źródła dają daty publikacji danych i FOMC (to jest większość czerwonych: ok. 85–90% wierszy czerwonych w typowym miesiącu, WYWNIOSKOWANE). Nie mają dat ani godzin: przemówień i zeznań przewodniczącego Fed, przemówień prezydenta i sekretarza skarbu, Jackson Hole, części członków FOMC ocenianych przez FF jako czerwone. Pełna lista czerwonych z całej historii istnieje tylko u FF. Patrz decyzja D1.
2. **FRED API wymaga klucza** (PRZETESTOWANE: zapytanie bez klucza zwróciło HTTP 400; dokumentacja: `api_key` wymagany, 32 znaki). Plan etapu 0 zakładał STOP: właściciel zakłada konto. Jest lepsza opcja: jednorazowo wygenerować daty 2010–2026 kluczem właściciela i dołączyć do wydania jako plik, a klucz użytkownika zostawić tylko do odświeżania przyszłości. Patrz decyzja D2.
3. **Historii wag FF (co było czerwone kiedyś, a dziś nie) nie da się ustalić ze źródeł publicznych.** Nie znalazłem żadnego opracowania, a feed pokazuje tylko dziś. Wagi w katalogu poniżej są stanem na 2026 (część PRZETESTOWANA feedem, reszta WYWNIOSKOWANA). Waga zależna od daty wymaga pomiaru w pakiecie B (ręcznie w przeglądarce, nie skryptem).
4. **Bank Holiday: FF ma własną definicję dni wolnych USD, której nie da się poznać bez obejrzenia kalendarza.** Są trzy rozjeżdżające się definicje (Fed, rząd federalny, NYSE), różnią się Good Friday, Columbus/Veterans Day i świętami w sobotę. Reguła musi być parametryczna, a pakiet B rozstrzyga na kilkunastu dniach kontrolnych (lista w sekcji 5).
5. FOMC: pełne daty 2010–2026 zmierzone na federalreserve.gov (sekcja 4.2). Godzina i konferencje zmieniały się w czasie (2:15 → 12:30 w dni z konferencją → 2:00 od marca 2013; konferencje kwartalne do 2018, po każdym posiedzeniu od 2019).

## 1. Co zmierzyłem

| Test | Wynik | Dowód |
|---|---|---|
| Feed FF `ff_calendar_thisweek.json`, 1 zapytanie | Działa, tydzień 27–30.10.2026, 26 zdarzeń USD, wagi: `High`, `Medium`, `Low`, `Holiday` (w całym feedzie). Godziny w ET (offset −04:00). | PRZETESTOWANE |
| Bank Holiday USD w feedzie tygodnia | Brak (w tym tygodniu USA nie mają święta). Jedyny „Bank Holiday” w feedzie to NZD 25.10 15:00. **Tytuł „Bank Holiday” potwierdzony tylko dla NZD**, dla USD wnioskowany. | PRZETESTOWANE (NZD), WYWNIOSKOWANE (USD) |
| FRED `fred/release/dates` bez klucza | HTTP 400 (treści błędu narzędzie nie zwróciło; zgodne z dokumentacją „api_key required”) | PRZETESTOWANE |
| Atrybucja FRED | Dokładnie: „This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.” — warunek: umieścić na widoku („prominently”). Plan miał to brzmienie poprawnie. | PRZETESTOWANE (fred.stlouisfed.org/docs/api/terms_of_use.html) |
| Limity FRED | Warunki nie podają liczby, tylko że Bank może ją ustalać/zmieniać i zakazują nadmiernego obciążenia. Popularnie podawane 120 zapytań/min — nie zmierzone. Nam wystarczy ok. 15 zapytań na import i 1–15 dziennie. | PRZETESTOWANE (brak liczby), WYWNIOSKOWANE (120/min) |
| Warunki dodatkowe FRED | Zakaz aplikacji replikującej „essential user experience” FRED/ALFRED (nas nie dotyczy). Serie mogą mieć prawa osób trzecich (dotyczy serii, nie dat publikacji). Pytanie o redystrybucję dat w repo: patrz D2. | PRZETESTOWANE (treść), WYWNIOSKOWANE (wniosek; to nie jest porada prawna) |
| `fred/release/dates` parametry | `limit` 1–10000 (domyślnie 10000), `realtime_start` domyślnie 1776-07-04, `include_release_dates_with_no_data` domyślnie `false` i wtedy **wyklucza przyszłe daty**; z `true` zwraca daty bez danych, czyli ogłoszone przyszłe (zachowanie z `true` potwierdzić pierwszym zapytaniem z kluczem). | PRZETESTOWANE (dokumentacja), WYWNIOSKOWANE (przyszłe daty) |
| ID wydań FRED | Sprawdzone stronami `fred.stlouisfed.org/release?rid=…`: 10 CPI, 50 Employment Situation, 53 GDP, 54 Personal Income and Outlays, 46 PPI, 9 Advance Monthly Sales for Retail and Food Services, 192 JOLTS, 180 Unemployment Insurance Weekly Claims Report, 91 Surveys of Consumers (UoM), 101 FOMC Press Release, 51 U.S. International Trade in Goods and Services, 11 Employment Cost Index, 13 G.17 Industrial Production, 97 New Residential Sales (nie „Housing Starts”). | PRZETESTOWANE |
| FOMC 2010–2026 | Strony `fomchistorical2010…2020.htm` oraz `fomccalendars.htm` (aktualizacja 28.10.2026) | PRZETESTOWANE |
| Godzina oświadczenia FOMC | Strony komunikatów Fed w nagłówku mają tylko „For immediate release” (sprawdziłem 2010, 2011, 2012, 2013); godziny nie ma. Źródła: komunikat Fed z 13.03.2013 (2:00 p.m., konferencja ok. 2:30 p.m.), komunikat z 3.03.2020 (10:00 EST), Fed 13.02.2009 (2:15 p.m.), doniesienia o 27.04.2011 (12:30 p.m. i konferencja 2:15 p.m.). | PRZETESTOWANE / CZĘŚCIOWE |

Uwaga do raportu pomocniczego: wyszukiwarka zasugerowała, że gwiazdka na stronie FOMC oznacza konferencję prasową. To błąd: gwiazdka = Summary of Economic Projections; konferencja prasowa jest po każdym posiedzeniu od 2019 (kolumna „Press conf.” na stronie lat 2021–2025, PRZETESTOWANE).

## 2. Katalog zdarzeń (stan wag 2026)

Kolumna „waga 2026”: **F** = widziana w feedzie 29.10.2026 (PRZETESTOWANE), **M** = z mojej wiedzy o FF, nie sprawdzona (WYWNIOSKOWANE; do pomiaru w pakiecie B). Godziny ET (America/New_York, z czasem letnim). „Klucz” = czy daty potrzebują FRED.

### 2.1 Czerwone (wymóg użytkownika)

| Nazwa FF | Waga 2026 | Godz. ET | Źródło dat | FRED rid | Klucz | Uwagi |
|---|---|---|---|---|---|---|
| Non-Farm Employment Change | M czerwona | 8:30 | FRED | 50 | tak | Zwykle 1. piątek; w tygodniu ze świętem w piątek: czwartek. Ta sama data: Unemployment Rate, Average Hourly Earnings m/m (też czerwone, M) |
| Unemployment Rate | M czerwona | 8:30 | FRED | 50 | tak | j.w. |
| Average Hourly Earnings m/m | M czerwona | 8:30 | FRED | 50 | tak | j.w. |
| CPI m/m, CPI y/y, Core CPI m/m | M czerwona | 8:30 | FRED | 10 | tak | Trzy wiersze, jedna data. W FF „Core CPI m/m” zawsze czerwone w mojej wiedzy |
| Core PCE Price Index m/m | **F czerwona** | 8:30 | FRED | 54 | tak | W 2026 razem z GDP tego samego dnia (29.10). Wcześniej inne dni; FRED podaje faktyczne |
| Advance GDP q/q | **F czerwona** | 8:30 | FRED | 53 | tak | Wydanie 1. (advance) po kwartale; drugie = „Prelim GDP q/q”, trzecie = „Final GDP q/q” (waga niższa, M: pomarańczowa/żółta). Rozróżnienie po kolejności w kwartale |
| Federal Funds Rate | **F czerwona** | wg 4.2 | Fed | 101 (kontrola) | nie | Decyzja = ostatni dzień posiedzenia |
| FOMC Statement | **F czerwona** | wg 4.2 | Fed | j.w. | nie | Ta sama godzina co stopa |
| FOMC Press Conference | **F czerwona** | wg 4.2 | Fed | brak | nie | 14:30 w feedzie; od 04.2011; patrz 4.2 |
| FOMC Economic Projections | M czerwona | 14:00 (od 2013) | Fed | brak | nie | Posiedzenia z gwiazdką (03/06/09/12) |
| FOMC Meeting Minutes | M czerwona | 14:00 | Fed | brak | nie | Zwykle 21 dni po decyzji, wyjątki w tabeli |
| Retail Sales m/m, Core Retail Sales m/m | M czerwona | 8:30 | FRED | 9 | tak | |
| ISM Manufacturing PMI | M czerwona | 10:00 | reguła | brak od 2016 | nie | 1. dzień roboczy miesiąca. Data z reguły, wyjątki sprawdzać |
| ISM Services PMI | M czerwona | 10:00 | reguła | brak | nie | 3. dzień roboczy |
| ADP Non-Farm Employment Change | M czerwona | 8:15 | reguła | brak | nie | Środa przed NFP (z wyjątkami). Dziś także ADP Weekly (feed 27.10, Low, 8:15) |
| JOLTS Job Openings | M czerwona lub pomarańczowa | 10:00 | FRED | 192 | tak | Niepewna waga; ew. zależna od roku |
| Fed Chair/Prezydent/Skarb: przemówienia, zeznania, Jackson Hole | M czerwone | różne | **brak oficjalnego źródła dat i godzin** | brak | — | **Luka L1** |

### 2.2 Pomarańczowe (doradczo)

| Nazwa FF | Waga 2026 | Godz. ET | Źródło dat | FRED rid | Klucz |
|---|---|---|---|---|---|
| Unemployment Claims | **F pomarańczowa** | 8:30 czw. | reguła (czwartek, święta: środa) lub FRED | 180 | opcja |
| Employment Cost Index q/q | **F pomarańczowa** | 8:30 | FRED | 11 | tak |
| CB Consumer Confidence | **F pomarańczowa** | 10:00 | reguła (ostatni wtorek) | brak | nie |
| Advance GDP Price Index q/q | **F pomarańczowa** | 8:30 | FRED (z GDP) | 53 | tak |
| PPI m/m, Core PPI m/m | M pomarańczowa (może być czerwona) | 8:30 | FRED | 46 | tak |
| Prelim UoM Consumer Sentiment, UoM Inflation Expectations | M pomarańczowa | 10:00 | FRED | 91 | tak |
| Trade Balance, Philly Fed, Empire State, Durable Goods, Housing Starts, Building Permits, Existing/New Home Sales, Industrial Production, Beige Book | M pomarańczowe/żółte | 8:30–14:00 | FRED/Census/Fed | 51, 13, 97 (new sales) | tak |
| Crude Oil Inventories | **F żółta** (Low) | 10:30 śr. | reguła (środa; po poniedziałkowym święcie czwartek 11:00 – WYWNIOSKOWANE) | brak | nie |

Z feedu (F) żółte w tym tygodniu: Durable Goods Orders, Core Durable Goods Orders, HPI, S&P/CS HPI, New Home Sales, Richmond Index, API, Goods Trade Balance, Prelim Wholesale Inventories, Personal Income/Spending, Natural Gas Storage, Chicago PMI, mówcy FOMC (Daly, Musalem). Uwaga: w feedzie Durable Goods są żółte, więc moja wiedza (pomarańczowe) już dziś jest nieaktualna: **potwierdza, że wagi dryfują**.

### 2.3 Zmiany godzin w czasie

| Zdarzenie | Zmiana | Dowód |
|---|---|---|
| FOMC oświadczenie | do 2012: 14:15; **dni z konferencją 27.04.2011–12.12.2012: 12:30**; od posiedzenia 20.03.2013: 14:00 (komunikat Fed z 13.03.2013 mówi „all regularly scheduled meetings”, dokładne pierwsze posiedzenie wnioskuję) | CZĘŚCIOWE (09.2009 i 04.2011, 03.2013 źródła), reszta WYWNIOSKOWANE |
| FOMC konferencja | 14:15 (do 2012), 14:30 (od 2013) | CZĘŚCIOWE |
| FOMC nadzwyczajne 2020 | 3.03 10:00 (PRZETESTOWANE), 15.03 niedziela wieczorem, 23.03 rano — godziny WYWNIOSKOWANE | PRZETESTOWANE/WYWNIOSKOWANE |
| UoM prelim | 9:55 → 10:00 (data zmiany nieznana) | WYWNIOSKOWANE |
| Pozostałe (NFP, CPI, GDP, Retail, PPI, PCE, Claims 8:30; ISM, JOLTS, CB 10:00; ADP 8:15) | bez zmian 2010–2026 | WYWNIOSKOWANE (niezmierzone) |

## 3. Zmiany wag w latach 2010–2026

Nie ustaliłem. Nie istnieje publiczna historia wag FF, a źródła wtórne (mirror HuggingFace z danymi scrapowanymi z FF, do 04.2025) nie są przydatne: to kopia danych FF (nie wolno ich używać w repo), strefa czasowa Teheranu, brak informacji o Bank Holiday. Hipotezy do sprawdzenia w pakiecie B (WYWNIOSKOWANE, niska pewność): Unemployment Claims (czerwone we wcześniejszych latach?), Durable Goods (pomarańczowe → żółte, częściowo potwierdzone feedem), JOLTS (pomarańczowe → czerwone po 2022), nazwy przemówień zmieniają się wraz z osobą (Bernanke → Yellen → Powell).
Rekomendacja: katalog trzyma `{nazwa, imp, od, do}` (przedziały dat), domyślnie jedna waga na całość, a pakiet B wypełnia przedziały tylko tam, gdzie obejrzane miesiące pokazują zmianę.

## 4. Źródła dat

### 4.1 FRED (`GET https://api.stlouisfed.org/fred/release/dates?release_id=N&file_type=json&include_release_dates_with_no_data=true&sort_order=asc&limit=10000&api_key=…`)

- Klucz wymagany (PRZETESTOWANE). Jeden import: ok. 11 zapytań (rid 10, 50, 53, 54, 46, 9, 192, 180, 91, 11, 51) po 1 na wydanie, bo `limit=10000` mieści całą historię.
- Od którego roku są daty: nie zmierzone (potrzebny klucz). WYWNIOSKOWANE: dla CPI, NFP, GDP, PPI, Retail Sales daty od dawna przed 2010; dla pozostałych sprawdzić pierwszym importem i zapisać w statusie „od kiedy”.
- Przyszłość: parametr `include_release_dates_with_no_data=true` (WYWNIOSKOWANE, do potwierdzenia). Zasięg zwykle bieżący rok, czasem następny.
- FRED zwraca **tylko daty, bez godzin**. Godziny z tabeli 2.
- Wydania zbiorcze (GDP rid 53 = advance + second + third; UoM rid 91 = prelim + final; Retail = jedno): typ wydania po kolejności w cyklu.
- Atrybucja (dosłownie): „This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.” — w Ustawieniach → Newsy i w README.

### 4.2 Kalendarz FOMC (federalreserve.gov, PRZETESTOWANE)

Źródła: `fomchistorical2010.htm` … `fomchistorical2020.htm`, `fomccalendars.htm` (2021–2027). Data = ostatni dzień posiedzenia (decyzja). W nawiasie data Minutes. SEP = posiedzenie z projekcjami.

| Rok | Decyzje (Minutes) |
|---|---|
| 2010 | 01-27 (02-17), 03-16 (04-06), 04-28 (05-19), 06-23 (07-14), 08-10 (08-31), 09-21 (10-12), 11-03 (11-23), 12-14 (01-04-11). Dodatkowo 05-09 (niedziela, rozmowa, oświadczenie), 10-15 (rozmowa, bez oświadczenia) |
| 2011 | 01-26 (02-16), 03-15 (04-05), 04-27 (05-18), 06-22 (07-12), 08-09 (08-30), 09-21 (10-12), 11-02 (11-22), 12-13 (01-03-12). 08-01 i 11-28 rozmowy bez oświadczenia |
| 2012 | 01-25 (02-15), 03-13 (04-03), 04-25 (05-16), 06-20 (07-11), 08-01 (08-22), 09-13 (10-04), 10-24 (11-14), 12-12 (01-03-13) |
| 2013 | 01-30 (02-20), 03-20 (04-10), 05-01 (05-22), 06-19 (07-10), 07-31 (08-21), 09-18 (10-09), 10-30 (11-20), 12-18 (01-08-14). 10-16 nieplanowane, bez oświadczenia |
| 2014 | 01-29 (02-19), 03-19 (04-09), 04-30 (05-21), 06-18 (07-09), 07-30 (08-20), 09-17 (10-08), 10-29 (11-19), 12-17 (01-07-15). 03-04 nieplanowane, bez oświadczenia |
| 2015 | 01-28 (02-18), 03-18 (04-08), 04-29 (05-20), 06-17 (07-08), 07-29 (08-19), 09-17 (10-08), 10-28 (11-18), 12-16 (01-06-16) |
| 2016 | 01-27 (02-17), 03-16 (04-06), 04-27 (05-18), 06-15 (07-06), 07-27 (08-17), 09-21 (10-12), 11-02 (11-23), 12-14 (01-04-17) |
| 2017 | 02-01 (02-22), 03-15 (04-05), 05-03 (05-24), 06-14 (07-05), 07-26 (08-16), 09-20 (10-11), 11-01 (11-22), 12-13 (01-03-18) |
| 2018 | 01-31 (02-21), 03-21 (04-11), 05-02 (05-23), 06-13 (07-05), 08-01 (08-22), 09-26 (10-17), 11-08 (11-29), 12-19 (01-09-19) |
| 2019 | 01-30 (02-20), 03-20 (04-10), 05-01 (05-22), 06-19 (07-10), 07-31 (08-21), 09-18 (10-09), 10-30 (11-20), 12-11 (01-03-20). 10-04 nieplanowane (oświadczenie 10-11) — nie dla FF |
| 2020 | 01-29 (02-19), **03-03 (10:00, cięcie 50 pb, rozmowa)**, **03-15 (niedziela, cięcie do 0)**, 03-17/18 odwołane, **03-23 (głosowanie, QE bez limitu)**, 03-19 i 03-31 komunikaty techniczne, 04-29 (05-20), 06-10 (07-01), 07-29 (08-19), 08-27 (oświadczenie o celach), 09-16 (10-07), 11-05 (11-25), 12-16 (01-06-21) |
| 2021 | 01-27 (02-17), 03-17 (04-07), 04-28 (05-19), 06-16 (07-07), 07-28 (08-18), 09-22 (10-13), 11-03 (11-24), 12-15 (01-05-22) |
| 2022 | 01-26 (02-16), 03-16 (04-06), 05-04 (05-25), 06-15 (07-06), 07-27 (08-17), 09-21 (10-12), 11-02 (11-23), 12-14 (01-04-23) |
| 2023 | 02-01 (02-22), 03-22 (04-12), 05-03 (05-24), 06-14 (07-05), 07-26 (08-16), 09-20 (10-11), 11-01 (11-21), 12-13 (01-03-24) |
| 2024 | 01-31 (02-21), 03-20 (04-10), 05-01 (05-22), 06-12 (07-03), 07-31 (08-21), 09-18 (10-09), 11-07 (11-26), 12-18 (01-08-25) |
| 2025 | 01-29 (02-19), 03-19 (04-09), 05-07 (05-28), 06-18 (07-09), 07-30 (08-20), 09-17 (10-08), 10-29 (11-19), 12-10 (12-30). 08-22 głosowanie (oświadczenie strategiczne, nie decyzja) |
| 2026 | 01-28 (02-18), 03-18 (04-08), 04-29 (05-20), 06-17 (07-08), 07-29 (08-19), 09-16 (10-07), 10-28 (Minutes jeszcze nie ogłoszone; reguła 21 dni: 11-18), 12-09 (reguła: 12-30) |
| 2027 (tentative) | 01-27, 03-17, 04-28, 06-09, 07-28, 09-15, 10-27, 12-08 (Fed: „each meeting date is tentative until confirmed at the meeting immediately preceding it”) |

- SEP (projekcje, gwiazdka) od 2012 w marcu/czerwcu/wrześniu/grudniu; do 2012: 01 2012 jako pierwsze z projekcjami stopy (WYWNIOSKOWANE).
- **Konferencje prasowe:** od 27.04.2011 tylko na posiedzeniach z projekcjami (kwartalnie). Tabele Fed 2015–2017 to potwierdzają (PRZETESTOWANE: konferencja = SEP). 2011–2014 CZĘŚCIOWE (Bloomberg 24.03.2011 „Bernanke to hold press briefings”), 2011: 04-27, 06-22, 11-02; 2012: 01-25, 04-25, 06-20, 09-13, 12-12 (WYWNIOSKOWANE). **Od 2019 po każdym posiedzeniu** (PRZETESTOWANE dla 2021–2026 na stronie Fed; 2019–2020 WYWNIOSKOWANE z noty CME).
- Rozstrzygnięcie o nazwie: FF mógł dawniej nazywać konferencję inaczej (np. „Fed Chairman Bernanke Speaks”); wynik pakietu B.
- Minutes: 21 dni po decyzji, wyjątki są w tabeli (np. 12-12-12 → 01-03-13); brać z tabeli Fed, regułę tylko dla dat nieogłoszonych (10-28 → 11-18, 12-09 → 12-30).
- Nadzwyczajne 03.2020: czerwone dla FF prawdopodobnie 03-03, 03-15 i 03-23 (godziny do sprawdzenia).
- Rekomendacja: **tabela dat FOMC jako dane w repo** (`lib/news-katalog.mjs`), bo to fakty publiczne i stałe do 2026; nowe posiedzenia 2028+ dopisywane ręcznie przy wydaniu albo z feedu FF; automatyczny odczyt strony Fed kruchy (HTML), więc odradzam.

### 4.3 Reguły bez FRED

| Zdarzenie | Reguła | Dowód | Ryzyko |
|---|---|---|---|
| ISM Manufacturing | 1. dzień roboczy 10:00 (po 1. dniu miesiąca; święto → 2. dzień) | WYWNIOSKOWANE | niskie–średnie, ISM od 2016 poza FRED; kilka wyjątków w latach |
| ISM Services | 3. dzień roboczy 10:00 | WYWNIOSKOWANE | j.w. |
| ADP | środa przed NFP, 8:15 | WYWNIOSKOWANE | wyjątki przy przesuniętym NFP; ADP Weekly (od 2025) wtorki? — z feedu |
| Unemployment Claims | czwartek 8:30; przy święcie w czwartek środa (Thanksgiving: środa) | WYWNIOSKOWANE | niskie; alternatywnie FRED rid 180 |
| CB Consumer Confidence | ostatni wtorek miesiąca 10:00 | WYWNIOSKOWANE | średnie |
| EIA ropa | środa 10:30 (po poniedziałkowym święcie czwartek 11:00) | WYWNIOSKOWANE | niskie |

Dla ISM i ADP (czerwone) reguła daje „na ogół”, nie „na pewno”. Tu jest realne ryzyko niespełnienia „100%”; pokrycie: pakiet B (porównanie z FF dla 16 miesięcy) i, na przyszłość, feed co tydzień (feed wygrywa z regułą).

## 5. Bank Holiday

**Co wiem.** Tytuł zdarzeń FF to „Bank Holiday” (NZD w feedzie, PRZETESTOWANE; strona FF „CA Bank Holiday” widoczna w wynikach wyszukiwarki, nie otwierana). Waga w feedzie: `Holiday`. FF dla USD nie pokazuje w tym tygodniu żadnego dnia, więc **jakie święta USD FF oznacza, nie jest zmierzone**. Źródła wtórne (artykuły o „USD bank holidays”) są niskiej jakości i niedatowane, nie używam ich jako dowodu.

**Trzy kandydackie definicje (PRZETESTOWANE na federalreserve.gov/aboutthefed/k8.htm i nyse.com, stan 07–2026):**

| Dzień | Fed (Reserve Banks) | Rząd federalny (OPM) | NYSE |
|---|---|---|---|
| New Year, MLK, Presidents, Memorial, Juneteenth (od 2021), Labor, Thanksgiving, Christmas, 4 Lipca | tak | tak | tak |
| Columbus Day (2. pon. października) | tak | tak | **nie** |
| Veterans Day (11.11) | tak | tak | **nie** |
| Good Friday | **nie** | nie | **tak** |
| Święto w sobotę | Reserve Banks **otwarte** w piątek (Rada Gubernatorów zamknięta) | piątek wolny (observed) | piątek zamknięty (np. 3.07.2026), wyjątek: Nowy Rok w sobotę → bez dnia wolnego (PRZETESTOWANE dla 2028) |
| Święto w niedzielę | poniedziałek wolny | poniedziałek | poniedziałek |

Moja hipoteza (WYWNIOSKOWANE, niska pewność): FF oznacza dni, gdy rynek obligacji/banki USA są zamknięte, czyli święta federalne z Columbus i Veterans, a Good Friday osobno (FF zwykle oznacza je dla innych walut, dla USD nie wiem). Nie przesądzam.

**Reguła do implementacji (parametryczna), `bankHolidaysUSD(rok, profil)`:** święta federalne wg 5 U.S.C. 6103 (Juneteenth od 2021, pierwsza obserwacja 18.06.2021), przesunięcia sobota→piątek / niedziela→poniedziałek jako parametr profilu, Good Friday (wyliczane z daty Wielkanocy) jako parametr, dni żałoby narodowej jako dane stałe: **5.12.2018** (G. H. W. Bush; NYSE i urzędy zamknięte), **9.01.2025** (J. Carter; NYSE zamknięta, biuro federalne zamknięte; Fidelity potwierdza giełdę — PRZETESTOWANE). Poza tym zamknięcie NYSE 29–30.10.2012 (huragan Sandy): nie jest „bank holiday”, wynik pakietu B, czy FF to ma.

**Dni kontrolne dla pakietu B (rozstrzygają definicję, każdy sprawdzić w przeglądarce):**
- Good Friday: 2.04.2010, 6.04.2012, 3.04.2015, 14.04.2017, 19.04.2019, 2.04.2021, 3.04.2026 (to ostatnie to też dzień NFP).
- Columbus: 11.10.2010, 12.10.2020; Veterans: 11.11.2019 (pon.) oraz 10.11.2017 (piątek, bo 11.11 sobota).
- Sobota→piątek: 31.12.2010 (Nowy Rok w sobotę), 24.12.2010, 3.07.2015, 3.07.2020, 24.12.2021, 31.12.2021, 3.07.2026.
- Niedziela→poniedziałek: 26.12.2011, 2.01.2012, 5.07.2010, 2.01.2017, 26.12.2022.
- Juneteenth: 18.06.2021, 20.06.2022 (poniedziałek, bo 19.06 niedziela), 19.06.2026.
- Żałoba: 5.12.2018, 9.01.2025.
- Wolne dni, których nie powinno być: 2.04.2021 jest piątkiem NFP, więc Good Friday nie pokazuje „Bank Holiday” USD, jeśli FF stosuje profil Fed.

Przyszłość 2026–2027 wg Fed k8 (PRZETESTOWANE): 2026: 1.01, 19.01, 16.02, 25.05, 19.06, 4.07 (sobota; Fed zamknięty w całości 3.07 tylko Rada), 7.09, 12.10, 11.11, 26.11, 25.12; 2027: 1.01, 18.01, 15.02, 31.05, 19.06 (sob.), 4.07 (nd., poniedziałek 5.07 wolny), 6.09, 11.10, 11.11, 25.11, 25.12 (sob.). NYSE 2026: dodatkowo Good Friday 3.04 i 3.07 wolny; wcześniejsze zamknięcia 27.11 i 24.12 o 13:00 to nie Bank Holiday.

## 6. Luki i ryzyka

| # | Luka / ryzyko | Skutek dla wymogu | Jak pokryć |
|---|---|---|---|
| L1 | Czerwone bez oficjalnego źródła dat/godzin: przemówienia i zeznania Fed Chair, przemówienia prezydenta i sekretarza skarbu, Jackson Hole, wybrane przemówienia członków FOMC. Dla Fed Chair: RSS `federalreserve.gov/feeds/speeches_and_testimony.xml` (od 2006, PRZETESTOWANE istnienie, bez godzin w liście; godzinę trzeba czytać z tekstu/strony zdarzenia). Reszta: brak. | „100% czerwonych” nie do spełnienia | D1 |
| L2 | ISM i ADP (czerwone) tylko z reguły | pojedyncze błędne dni | pakiet B + feed tygodnia nadpisuje |
| L3 | Wagi FF zmienne w czasie | błędna waga w starych latach | `od/do` w katalogu, pomiar w B |
| L4 | Przesunięcia przez shutdown: 1–16.10.2013, 22.12.2018–25.01.2019, 1.10–12.11.2025 (WYWNIOSKOWANE, z wiedzy do 06.2026). FRED podaje **faktyczne** daty publikacji, więc daty po fakcie są poprawne; ale dla ogłoszonej przyszłości terminy mogą się zmienić (feed tygodnia koryguje). Nieopublikowane wydania z 10.2025 (np. CPI za październik) nie mają daty we FRED, FF mógł pokazać zapowiedź wcześniej — drobna rozbieżność historyczna, do opisania jako znana różnica. | niski, dotyczy 3 okresów | FRED dla historii, feed dla tygodnia, notatka „znana różnica” |
| L5 | Brak FRED dla ISM, CB, ADP | patrz L2 | |
| L6 | Definicja Bank Holiday FF (sekcja 5) | błędne dni | profil + dni kontrolne |
| L7 | Dla przyszłości poza bieżącym tygodniem źródła to: FRED (rok bieżący, o ile ogłoszone), FOMC (do 2027), reguły. Czerwone w przyszłym tygodniu mogą zmienić godzinę | mały | feed co godzinę |
| L8 | FRED terms: pytanie o redystrybucję dat w repo i klucz u każdego użytkownika | zależy od D2 | patrz D2 |
| L9 | Wersja API FF/feed: godziny `date` z offsetem; przy zmianie czasu (USA 8.03 i 1.11.2026, UE 29.03 i 25.10.2026) tydzień 22.03–29.03 i 25.10–1.11 mają różnicę ET-CET inną niż 6 h | błędy godzin w testach | testy z planu, liczyć w UTC |

## 7. Rekomendowane źródło na zdarzenie (skrót)

- **FRED (klucz, 11 zapytań):** NFP/UR/AHE, CPI, Core PCE, GDP (3 wydania), Retail Sales, PPI, JOLTS, ECI, Trade, UoM, Claims (opcja).
- **Tabela FOMC w repo (bez klucza):** Federal Funds Rate, FOMC Statement, Press Conference, Projections, Minutes, nadzwyczajne 2020.
- **Reguły (bez klucza):** ISM (2), ADP, CB, EIA, Claims (alternatywa).
- **Bank Holiday:** reguła z profilem + dni żałoby stałe.
- **Bez źródła:** przemówienia (L1).

## 8. Decyzje gustu (podjęte przeze mnie, odwracalne)

1. Katalog przechowuje wagę jako przedziały dat (`od`, `do`), a nie jedną wartość.
2. Tabela FOMC jako dane, nie odczyt strony Fed.
3. Typ wydania GDP i UoM wnioskowany z kolejności w cyklu, nie z FRED.
4. Dla zdarzeń z kilkoma wierszami w FF o tej samej dacie (NFP, CPI) katalog trzyma osobne wiersze, każdy z własną wagą.
5. Reguły ISM i ADP traktuję jako „źródło słabsze” i w statusie oznaczam, że daty z reguły.

## 9. Pytania do użytkownika (klasa trzecia, nie rozstrzygam)

**D1. Wymóg „wszystkie czerwone” a przemówienia i zeznania.** Powiedziałeś: «przynajmniej czerwone foldery i bank holiday». Z oficjalnych źródeł nie pokryję czerwonych przemówień (Fed Chair, prezydent, Skarb, Jackson Hole). Opcje: (a) historia = czerwone z publikacji danych i FOMC + Fed Chair z RSS Fed jako „przemówienie, godzina wg strony Fed”, bez reszty, jasno opisane w Ustawieniach; (b) tylko dane i FOMC; (c) dołożyć ręcznie wybrane stałe wydarzenia (Jackson Hole) z danych publicznych. Rekomenduję (a) z oznaczeniem, bo to nic nie łamie, a przemówienia i tak najmniej przewidywalne. Czego mogę nie wiedzieć: jak ważne są dla Ciebie przemówienia przy tradowaniu.

**D2. Klucz FRED i dołączenie dat do wydania.** Dziś plan wymaga klucza u każdego użytkownika repo. Rekomenduję: Właściciel generuje daty 2010–2026 jednym uruchomieniem swojego klucza, plik z datami (same daty publikacji, bez serii danych) trafia do wydania, klucz użytkownika tylko dla odświeżania przyszłości. Zysk: historia działa bez konta FRED. Ryzyko: warunki FRED nie rozstrzygają wprost redystrybucji dat publikacji (WYWNIOSKOWANE: daty publikacji to fakty z kalendarzy BLS/BEA/Census, nie serie trzecich stron; nie jest to porada prawna). Alternatywa: klucz u każdego, zgodnie z obecnym planem.

**D3. Definicja Bank Holiday.** Mogę zaimplementować profil „jak FF” dopiero po pakiecie B. Czy akceptujesz, że do tego czasu domyślny profil to „Fed + Good Friday jako osobny parametr, domyślnie wyłączony”? Czego mogę nie wiedzieć: czy zależy Ci na zgodności z FF co do jednego dnia (np. Good Friday), czy na prawdzie rynkowej (NYSE zamknięta).

**D4. Sposób pomiaru w pakiecie B.** 16 miesięcy daje pewność dla badanych miesięcy, nie dla 202. Jeśli „100% czerwonych” ma być twierdzeniem dla całego okresu, a nie dla próby, trzeba by przejrzeć w przeglądarce więcej miesięcy (np. po 2 na rok z każdym typem zdarzeń + wszystkie miesiące z Good Friday/zmianą czasu). Ile miesięcy jesteś gotów obejrzeć lub czy 16 wystarcza z opisem „zweryfikowane na próbie”?

## 10. Wnioski dla projektu (zmiany w planie)

1. **Pakiet A:** `news-katalog.mjs` z przedziałami wag; tabela FOMC (sekcja 4.2) jako dane; 11 wydań FRED z `release_id` z sekcji 1; reguły ISM/ADP/CB/EIA/Claims; `bankHolidaysUSD(rok, profil)`.
2. **STOP etapu 0:** klucz FRED potrzebny (tylko do jednorazowego wygenerowania dat lub dla użytkowników, zależnie od D2). Do czasu klucza mogę dostarczyć FOMC, reguły i święta bez FRED.
3. **Pakiet B:** doprecyzować próbki o dni kontrolne z sekcji 5 oraz o 3 okresy shutdown, o miesiące z godziną FOMC 12:30 (maj 2011, styczeń 2012, wrzesień 2012), marzec 2020 i marzec 2013.
4. **Teksty w Ustawieniach:** „Historia: czerwone z publikacji danych i FOMC; przemówienia tylko od instalacji” (jeśli D1 = a lub b).
5. **README/Ustawienia:** atrybucja FRED dosłownie, brak powiązania z FF.
6. Nic z danych FF w repo, testach, kartach: bez zmian.

## Zapisane pliki

- `R:\PROJEKTY\trading-hq-wt\newsy\docs\plany\newsy-zrodla.md`
