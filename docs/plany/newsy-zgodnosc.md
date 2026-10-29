# Newsy makro USD: zgodność historii z ForexFactory (pakiet B)

Data: 29.10.2026. Plan: `newsy-makro.md` (pakiet B, decyzje D1–D4). Źródła i reguły wyjściowe: `newsy-zrodla.md`.

W tym pliku są tylko wnioski i liczby. Wiersze kalendarza FF zostały poza repozytorium (lokalnie w `R:\PROJEKTY\trading-hq-wt\newsy-wyniki\`), zgodnie z sekcją „Prawo” planu.

## Metoda

- Strony kalendarza FF otwierane jak przez człowieka: widoczna przeglądarka Edge z osobnym, potem usuniętym profilem, jedna strona na ok. 25 s, przewijanie widoku. Odczyt tylko wierszy USD z widoku: data, godzina, nazwa, kolor folderu. Bez curl/fetch na forexfactory.com, bez wyzwań Cloudflare.
- Strefa czasowa FF ustawiona przyciskiem „Match Device Time” na czas Nowego Jorku (przeglądarka w strefie America/New_York), więc godziny porównywane są wprost w ET.
- Łącznie 32 wczytania stron: 28 miesięcy kalendarza, 2 ponowne odczyty (04.2010 po zmianie strefy, 12.2010 po sprawdzeniu, czy wszystkie wiersze się wyrenderowały), strona ustawień strefy i strona główna (przekierowanie po zapisie strefy).
- Próba (28 miesięcy): 04.2010, 10.2010, 12.2010, 04.2011, 01.2012, 04.2012, 09.2012, 01.2013, 03.2013, 03.2014, 04.2015, 07.2015, 11.2016, 11.2017, 12.2018, 11.2019, 03.2020, 07.2020, 10.2020, 04.2021, 06.2021, 12.2021, 06.2022, 03.2023, 09.2024, 01.2025, 04.2026, 07.2026. Jest każdy rok 2010–2026, miesiące zmiany czasu (03 i 11), FOMC 2011–2013 (12:30 i przejście na 14:00), nadzwyczajne FOMC 03.2020 i dni kontrolne świąt z `newsy-zrodla.md` (sekcja 5) poza: 5.07.2010, 26.12.2011, 2.01.2017, 14.04.2017, 19.04.2019, 26.12.2022 i 19.06.2026 (te same reguły co dni sprawdzone: niedziela → poniedziałek, Good Friday, Juneteenth).
- Porównanie skryptem z `buildOfficial` (dane z `data/news/`), po (nazwa, dzień ET, godzina co do minuty, waga). Poziom dowodu: PRZETESTOWANE na próbie; poza próbą WYWNIOSKOWANE z reguł.

## Wynik (po pakietach B i B2)

| Kryterium | Wymóg | Wynik na próbie | Po pakiecie B | Przed B |
|---|---|---|---|---|
| Bank Holiday: dni FF obecne w aplikacji | 100% | **21/21 (100%)**, 0 dni nadmiarowych | 21/21 | 17/21, 2 nadmiarowe (profil `fed`) |
| **Wszystkie czerwone FF** (782 wiersze, z przemówieniami) | 100% | **670/782 (85,7%)** z godziną co do minuty | 655/782 (83,8%) | 383/782 (z wagą) |
| Czerwone z rodzajów objętych katalogiem (dane, FOMC, TIC, komunikaty Fed): obecne, godzina co do minuty | 100% | **648/658 (98,5%)**; obecne z dowolną godziną 657/658 (99,8%) | 633/640 | 362 |
| To samo, także waga czerwona | — | 646/658 (98,2%) | 631/640 | — |
| Pomarańczowe z rodzajów objętych katalogiem (doradczo) | ≥ 95% | **475/499 (95,2%)** | 471/494 | ok. 48% |
| Earningi klasy 1 | porównać, jeśli FF je ma | **pominięte: kalendarz FF nie ma wyników spółek** (w 28 miesiącach żadnego wiersza wyników spółek) | | |

Czerwone FF w próbie (782 wiersze) dzielą się tak:

- 658 z rodzajów, które katalog obejmuje (dane z FRED, reguły, FOMC, od B2 także TIC i komunikaty Fed poza posiedzeniami);
- 43 przemówienia i zeznania przewodniczącego Fed (D1: z archiwum Fed, oznaczone jako niepewne); zgodna godzina w 22;
- 46 przemówień prezydenta, sekretarza skarbu i członków FOMC (poza historią z decyzji D1);
- 35 publikacji, których B2 nie dołożył (niżej): Pending Home Sales (12), Existing Home Sales (10), wstępne PMI S&P Global (10), raport walutowy Skarbu (2), Goods Trade Balance (1).

### Pakiet B2: dołożone czerwone (29.10.2026, słowa użytkownika «Dokładamy reguły + terminarze (Recommended)»)

| Rodzaj | Źródło | Na próbie | Decyzja |
|---|---|---|---|
| TIC Long-Term Purchases | tabela dat publikacji Skarbu USA (home.treasury.gov, „TIC Press Releases -- by topic”), 199 dat od 01.2010 | **28/28 dni**; godzina 9:00 do 2014, 16:00 od 2015; czerwone 4/6 co do minuty (FF w 2012 zapisuje 8:56) | dołożone (`data/news/usd-terminarze.json`) |
| Fed Announcement (komunikaty o polityce pieniężnej poza posiedzeniami) | archiwum JSON komunikatów prasowych Fed (`ne-press.json`), kategoria Monetary Policy bez komunikatów rutynowych i bez dni decyzji FOMC, 42 pozycje od 2010 | **13/13 dni FF**, 12/13 co do minuty (FF 18:20, Fed 18:15); 5 komunikatów w obejrzanych miesiącach, których FF nie ma (2013-01, 2020-03, 2020-07 ×2, 2021-06) | dołożone, godzina z archiwum |
| Existing Home Sales | reguła kalendarzowa | najlepsza reguła 12/28 dni (43%), NAR nie trzyma stałego dnia, w 2026 zmienił termin na początek miesiąca | **nie dołożone** (< 90%) |
| Pending Home Sales | reguła kalendarzowa | najlepsza reguła 11/29 (38%) | **nie dołożone** (< 90%) |
| Flash Manufacturing / Services PMI | reguła kalendarzowa | najlepsza reguła (6. dzień roboczy od końca) 15/22 (68%) | **nie dołożone** (< 90%) |
| Raport walutowy Skarbu | strona archiwum raportów Skarbu | archiwum podaje tylko miesiąc raportu, bez dnia; daty dzienne są tylko w komunikatach prasowych, bez listy do pobrania | **nie dołożone** |

Reguły sprawdzałem na 28 obejrzanych miesiącach (bez ponownego otwierania FF): n-ty dzień tygodnia miesiąca, n-ty od końca, n-ty dzień roboczy od początku i od końca, „dzień D albo następny roboczy”. Trafienie = ten sam dzień co FF, niezależnie od wagi.
Przybliżonych dat (`approx`) w B2 nie ma: oba dołożone rodzaje mają daty urzędowe.

### Czego nie da się spełnić w 100% (twardy wymóg „czerwone 100%”)

1. Wśród czerwonych z katalogu 10 wierszy odbiega: 5 to oświadczenia FOMC 2010–2012, gdzie FF zapisuje faktyczną minutę publikacji (o 1–2 min od planowej 12:30 albo 14:15), 2 to TIC w 2012 (FF 8:56, plan 9:00), 1 komunikat Fed (FF 18:20, Fed 18:15), 1 to ISM usług opublikowany 3 min przed czasem (03.2014), 1 to grudniowy termin CB Consumer Confidence (w grudniu Conference Board odchodzi od reguły „ostatni wtorek” w sposób, którego nie da się opisać regułą). Faktycznych minut nie ma w źródłach urzędowych.
2. 35 czerwonych z rodzajów bez źródła dat i bez reguły ≥ 90% (tabela wyżej) i 89 przemówień (D1). Pojawiają się w aplikacji tylko z feedu tygodnia, od dnia instalacji.
3. Wagi FF zmieniają się z miesiąca na miesiąc (np. Unemployment Claims: czerwone, potem żółte, pomarańczowe i znów czerwone). Tabela wag zależnych od daty pochodzi z próby, więc w obejrzanych miesiącach zgadza się z założenia. Uczciwy szacunek trafności poza próbą (metoda „pomiń jeden miesiąc”: wagę miesiąca przewidujemy z pozostałych): **91,4%** wszystkich wag (1053/1152) i **94,6%** miesięcy, w których FF dał czerwony (544/575).
4. Komunikaty Fed: filtr komunikatów rutynowych to nasza klasyfikacja treści; w obejrzanych miesiącach daje 5 komunikatów, których FF nie pokazał (fałszywe alarmy na wykresie).

## Reguły ustalone na próbie (poprawki w kodzie)

### Bank Holiday: profil `ff` (domyślny od pakietu B, D3)

- FF oznacza Columbus Day i Veterans Day, nie oznacza Good Friday (5 lat w próbie, także dni NFP).
- Juneteenth: od 2022 (FF nie oznaczył pierwszej obserwacji 18.06.2021, oznaczył 20.06.2022).
- Święto w sobotę: 4 lipca i Boże Narodzenie przesuwają się na piątek (3.07.2015, 3.07.2020, 24.12.2021), ale nie w 2010 (24.12.2010 bez Bank Holiday). Między 2011 a 07.2015 żadne z tych świąt nie wypadło w sobotę, więc granica „od 2011” nie zmienia ani jednego dnia. Nowy Rok i Veterans Day w sobotę bez dnia wolnego (31.12.2010, 31.12.2021, 10.11.2017).
- Dni żałoby narodowej (5.12.2018, 9.01.2025) bez Bank Holiday.
- Juneteenth w sobotę (pierwszy raz 2027): przesunięcie na piątek jak 4 lipca. Decyzja gustu, niesprawdzalna na historii.
- FF ma też szare „Daylight Saving Time Shift” w niedziele zmiany czasu; to nie Bank Holiday i nie jest w katalogu (znana różnica).

### Daty i godziny

- ADP: w czwartek, gdy w tygodniu NFP przed środą jest dzień wolny (także dzień żałoby); 7 przypadków w próbie.
- ISM: Good Friday liczy się jak dzień roboczy, ale publikacja, która by na niego wypadła, przechodzi na następny dzień roboczy. W styczniu od 2018 ISM przemysłu w 2. dniu roboczym (rok przejścia WYWNIOSKOWANY, potwierdzone 01.2012, 01.2013 i 01.2025).
- FOMC: projekcje (SEP) 2011–2012 o 14:00, nie 12:30 (flaga `unverified` zdjęta). 03.2020: konferencje 3.03 o 11:00 i 15.03 o 18:30; 15.03 o 17:00 potwierdzone; 23.03 to u FF „Fed Announcement”, nie decyzja o stopie (usunięte z decyzji).
- Uniwersytet Michigan: każda data FRED to odczyt końcowy (także 1.–2. dzień następnego miesiąca); odczyt wstępny = piątek tygodnia „końcowy − 14 dni” (zgodny we wszystkich miesiącach próby); godzina 9:55 do 2014, 10:00 od 2015 (granica w przerwie próby 03.2014–04.2015, WYWNIOSKOWANA).
- Zeznania przewodniczącego Fed: 10:00 ET (archiwum Fed podaje godzinę publikacji tekstu, a FF godzinę przesłuchania); 6 z 8 zeznań w próbie. Przemówienia bez zmian, nadal oznaczone jako niepewne.
- Nowe rodzaje zdarzeń (czerwone albo pomarańczowe w FF): Core CPI y/y, Personal Spending, Prelim UoM, Building Permits i Housing Starts (FRED 27), New Home Sales (97), dobra trwałe (95, raport wstępny z końca miesiąca), produkcja przemysłowa (13, 9:15), ceny importu (188), zapasy firm (25), Philly Fed (3. czwartek także w styczniu, bo 2. czwartek stycznia w FRED rid 351 to inna publikacja; 10:00 do 2015, 8:30 od 2016), Empire State (15. albo następny dzień roboczy; zgodne ze 154 datami FRED), Chicago PMI (ostatni dzień roboczy bez 31.12, piątku po Thanksgiving i Good Friday), zapasy ropy (środa 10:30; poniedziałek albo środa wolne: czwartek 11:00; wtorek wolny: piątek 11:00), wybory prezydenckie (cały dzień).

### Wagi

`lib/news-wagi.mjs`: dla 48 rodzajów zdarzeń waga zależna od daty (przedziały, granica w połowie przerwy między obejrzanymi miesiącami). Plik generowany ze wszystkich 28 miesięcy próby; zawiera tylko klasyfikację rodzajów zdarzeń w okresach, bez dat i godzin publikacji z FF. Przykłady reguł: Average Hourly Earnings pomarańczowe do 2015, czerwone od 2016; CPI m/m pomarańczowe do 2014, potem czerwone; Trade Balance czerwone do 2015, potem żółte; Federal Funds Rate pomarańczowe w latach 2012–2014 (oświadczenie FOMC zawsze czerwone).

## Ustawienia

Ustawienia → Wykresy → Newsy pokazują „Zgodność z ForexFactory: zweryfikowane na próbie 28 miesięcy (29.10.2026)”, a opis braków historii wymienia przemówienia spoza Fed, komunikaty ad hoc i publikacje bez terminarza. Po B2 komunikaty Fed i TIC już są w historii: tekst do poprawy w pakiecie E (copywriter; pliki public/js poza zakresem B2).

## Znane różnice (zostają)

- Faktyczna minuta oświadczeń FOMC 2010–2012 i pojedyncze publikacje o kilka minut przed czasem albo po czasie (FF zapisuje to, co się stało; my plan).
- Opóźnienia jednorazowe: PCE i Personal Spending o 10:00 w 12.2018 i 11.2019, dobra trwałe 04.2026 po shutdownie, zapasy ropy 30.12.2010 i 23.01.2025 (12:00), awaria EIA 06.2022.
- CB Consumer Confidence w grudniu.
- Zdarzenia bez źródła (lista wyżej) i przemówienia spoza Fed: tylko z feedu tygodnia.
