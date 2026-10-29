# Research: szybkie dane świec i publikacja wykresów (27.10.2026)

Uzupełnia `wykresy-swiecowe.md` p. 3.2a i 3.7 (F1–F6). Tylko research, bez kodu.
Poziomy dowodu: **PRZETESTOWANE** (sprawdzone na żywo dziś), **CZĘŚCIOWE** (źródło przeczytane, ale nie całe albo przez indeks wyszukiwarki), **WYWNIOSKOWANE**.

Cel użytkownika (słowa użytkownika): «najlepszym rozwiazaniem jest posiadania tak szybko danych ze mozna zrobic journal z wykresem od razu i bez limitow go opublikowac, nie ograniczaj sie i zrob research zeby swoboda byla tu glownym prowadzacym i czy jest taka mozliwosc»

Ważne ograniczenie badania: **cmegroup.com zablokował automatyczne pobieranie** (odpowiedź serwera: „Use of scripts, software, spiders, robots … is strictly prohibited by CME Group's website Data Terms of Use”). Nie obchodziłem blokady. Treść dokumentów CME pochodzi z (a) kopii u dystrybutorów (Databento, Bookmap), przeczytanych w całości, oraz (b) fragmentów z indeksu wyszukiwarki, oznaczonych jako CZĘŚCIOWE.

---

## 1. Najważniejsze fakty nowe (G1–G14)

| # | Fakt | Źródło | Dowód |
|---|---|---|---|
| G1 | Katalog Databento GLBX.MDP3, tabela „Access method / Release time / License required”: **Live – Real-time – licencja wymagana**; **Historical – Delayed 20 minutes – licencja wymagana**; **Historical – Delayed 8 hours – bez licencji**. | databento.com/catalog/cme/GLBX.MDP3 (DOM odczytany Playwrightem) | PRZETESTOWANE |
| G2 | Plany Databento dla CME: Standard „$199 per month … Live data, No license fees … 1 year of L1 history”; Plus „$1,750 license fees per month, Annual contract required … External distribution”; Unlimited „$4,500”. Katalog: „Databento can serve as your vendor of record (VoR) … instant approval, where we handle reporting on your behalf”. | ta sama strona | PRZETESTOWANE (treść strony). Czy Standard obejmuje użytkownika „non-pro” bez dopłat CME: CZĘŚCIOWE (ogłoszenie Databento mówi o opłatach od „$32.65/month” dla non-pro: roadmap.databento.com/announcements/live-cme-data-is-now-open-to-all-users-starting-at-3265month, nie otwarte) |
| G3 | Wniosek z G1+G2: **z planem Standard świece z bieżącej sesji są w historycznym API po ok. 20 min**, bez planu po ok. 8 h (nie 24 h, jak zakładał p. 3.2a). | — | WYWNIOSKOWANE (do potwierdzenia `metadata.get_dataset_range` na kluczu użytkownika) |
| G4 | Cennik CME 2026 (kopia na serwerze Databento): Distribution „Real Time … $29,280”, „Delayed … $21,840”, „Historical … $35,220” (rocznie, za grupę licencjobiorcy; przy Historical przypis 2: „Distribution of Historical Information via Data Feed carries this License Fee.”). „Public Website … Website $487” z przypisem 13: „Delayed and Historical Information only. Real Time Information is not permitted.” „Display Device – Delayed – $0”. | api.databento.com/static/licensing/cme/cme-market-data-fee-list.pdf | PRZETESTOWANE (PDF pobrany i przeczytany). Kolumna ($487 miesięcznie czy rocznie) z układu tabeli niepewna: CZĘŚCIOWE |
| G5 | Definicje CME (ILA czerwiec 2026): „Historical Information: Information that is not Real Time Information or Delayed Information, that is first accessed at least eight (8) hours after initial transmission”. Delayed = ponad 10 min i mniej niż 8 h po transmisji. | cmegroup.com/market-data/files/information-license-agreement-june-2026.pdf | CZĘŚCIOWE (fragment z indeksu wyszukiwarki; PDF zablokowany) |
| G6 | Wytyczne CME dla danych historycznych: „If Historical Information is made available on a public Website, where it can be viewed by the public, in chart or tabular form for example, the distributor must hold the Distribution License”. Posiadanie licencji real-time/delayed nie zastępuje licencji Historical. | cmegroup.com/market-data/distributor/files/cme-group-data-licensing-policy-guidelines-historical-information-distribution.pdf | CZĘŚCIOWE (indeks wyszukiwarki, dwa niezależne zapytania dały to samo zdanie) |
| G7 | **Od 1.01.2027 zaostrzenie dla stron publicznych** (zawiadomienie CME DS-45): „Effective Date for Website Display updates is January 1, 2027”; zestaw informacji dla witryn obejmuje „Last Trade Price as a single snapshot captured at five (5) minutes past the hour, made available more than ten (10) minutes after initial transmission” i **wyklucza** wolumen, open interest, ceny open i close dnia. | cmegroup.com/market-data/files/market-data-license-agreement-updates-june-2026.pdf | CZĘŚCIOWE (indeks wyszukiwarki). Wniosek: tania licencja „Public Website” od 2027 r. raczej nie obejmie wykresów świecowych: WYWNIOSKOWANE |
| G8 | Standardowy „CME Group Subscriber Addendum” (podpisuje każdy użytkownik danych CME u dystrybutora: Tradovate, NinjaTrader, Rithmic, ProjectX, Bookmap): 4.1 „display such CME Licensed Information on a Device for its own internal business activities”; 6.1(a) **„Subscriber Group shall not redistribute CME Licensed Information outside of Subscriber Group … must seek permission from CME directly”**; 6.1(e) zakaz „text and data mining”; 16.4 po zakończeniu umowy „delete any and all CME Licensed Information … including without limitation any stored CME Licensed Information”. | bookmap.com/agreements/Subscriber%20Addendum%202023.pdf | PRZETESTOWANE (PDF pobrany, przeczytany w całości). Że inni dystrybutorzy mają ten sam tekst: WYWNIOSKOWANE (to wzór CME) |
| G9 | TradingView, Terms of Use, sekcja Attribution: „TradingView grants all users … the ability to use snapshots of TradingView charts in analysis, press releases, books, articles, blog posts and other publications”; „Attribution must include a reference to TradingView”; w filmach bez widocznego logo trzeba opisać użyty produkt; przycisk Snapshot sam dodaje atrybucję. Jednocześnie dane: „licensed for exclusive display-only use”, zakaz „non-display usage” i „any machine-driven processes that do not involve the direct, human-readable display”. | tradingview.com/policies | CZĘŚCIOWE (strona przeczytana narzędziem ze streszczeniem; cytaty dosłowne krótkie). Czy „other publications” obejmuje Instagram/TikTok: WYWNIOSKOWANE (tak brzmi zakres, ale słowo „social media” nie pada) |
| G10 | TradingView pokazuje dane CME bez dopłat z opóźnieniem ok. 10 min; real-time to płatny dodatek. | help.edgeful.com/en/articles/14436892 | CZĘŚCIOWE (źródło trzecie) |
| G11 | ProjectX (TopstepX i inne firmy na ProjectX): `POST https://api.topstepx.com/api/History/retrieveBars`, jednostki od 1 s, do 20 000 świec na zapytanie, `includePartialBar` (bieżąca świeca). Cena API: „$29/month”, z kodem topstep „$14.50/month”. ProjectX (Sim2Funded Solutions) to licencjonowany redystrybutor CME; przy pierwszym logowaniu użytkownik podpisuje „CME ILA agreement, Non-Pro / Pro self certification, and our market data terms of use”. | gateway.docs.projectx.com/docs/api-reference/market-data/retrieve-bars/ ; help.topstep.com/en/articles/11187768 ; intercom.help/tradeify-test/articles/12191761 | CZĘŚCIOWE (strony przeczytane; regulaminu danych ProjectX nie znalazłem publicznie) |
| G12 | Tradovate API: od 30.09.2022 dane rynkowe przez API wymagają rejestracji użytkownika jako sub-vendor CME; użytkownicy podają ok. $290–$427 miesięcznie dla CME plus opłata za API Tradovate. | community.tradovate.com/t/is-cme-sub-vendor-requirement-for-api-access-is-290-per-month/6215 | CZĘŚCIOWE (forum, kwoty niepotwierdzone u CME) |
| G13 | Yahoo `query1.finance.yahoo.com/v8/finance/chart/ES=F?interval=1m&range=1d` bez klucza: HTTP 200, `exchangeName: CME`, 758 świec 1 m, ostatnia świeca 16:45:19 UTC przy zapytaniu 16:55:23 UTC (**opóźnienie 10 min**). Licencja: użytek osobisty serwisu, dane CME delayed, publikacji nie obejmuje. | test curl | PRZETESTOWANE (dane); licencja WYWNIOSKOWANE |
| G14 | LiquidJournal: „Real exchange candles with your entry, exit, stop and target drawn on”, karty i filmy z „The real price line”. Dostawca danych **nie jest nazwany**: polityka prywatności mówi tylko „Market data providers (for candles and the economic calendar)”; regulamin nie wspomina CME ani licencji danych (jedynie noty Rithmic/Omnesys). | liquidjournal.app, /privacy, /terms | CZĘŚCIOWE (strony przeczytane). Na jakiej licencji publikują: nieustalone |

Dodatkowo: Twelve Data (regulamin 2.2(e)): „Redistribute or provide external display of Data only if and as expressly authorized” przez dodatek „Redistribution Rights Add-On” albo osobną umowę (twelvedata.com/terms, CZĘŚCIOWE). Dukascopy: nie znalazłem warunków publikacji danych historycznych; serwer `datafeed.dukascopy.com` nie odpowiedział z tej sieci w 25 s (test nieudany, nie wnioskuję). Tradezella, TradesViz, Tradervue, Edgewonk: brak publicznej informacji o dostawcy i licencji wykresów futures (wyszukiwanie bez wyniku; Tradervue w komentarzu użytkownika: „delayed pricing data”, CZĘŚCIOWE).

---

## 2. Tabela źródeł

| Źródło | Szybkość świec z sesji trade'a | Koszt dla użytkownika | Publikacja obrazów (cytat) | Dowód licencji | Prostota w zero-npm |
|---|---|---|---|---|---|
| Databento historyczne, bez planu | ok. 8 h (G1) | za użycie (kredyt $125 na start) | „Most of our datasets can be redistributed internally or externally after 24 hours.” (F2) | CZĘŚCIOWE | już zaplanowane (HTTP + klucz) |
| Databento Standard | ok. 20 min historycznie, live na żywo (G1) | $199/mies. (G2) | brak prawa do dystrybucji zewnętrznej; „External distribution” dopiero w Plus | CZĘŚCIOWE | to samo HTTP, ten sam kod |
| Databento Plus | jak wyżej | $1,750/mies., roczna umowa | „External distribution” (zakres dla obrazów nieopisany) | CZĘŚCIOWE | jak wyżej; nierealne dla pojedynczego tradera |
| ProjectX / TopstepX API | od razu, świece 1 s (G11) | $14,50/mies. (z kodem) + konto u firmy na ProjectX | Subscriber Addendum: „shall not redistribute … outside of Subscriber Group” (G8) | CZĘŚCIOWE / WYWNIOSKOWANE | proste REST (fetch z Node), ale tylko dla firm na ProjectX |
| Tradovate API | od razu | API + ok. $290–$427/mies. CME sub-vendor (G12) | jak G8 | CZĘŚCIOWE | REST/WebSocket, drogo |
| Rithmic / NinjaTrader (eksport świec) | od razu | zwykle w ramach konta prop | jak G8 | WYWNIOSKOWANE | Rithmic to protokół binarny (trudny bez npm); NinjaTrader eksport ręczny do pliku |
| TradingView (snapshot użytkownika) | ok. 10 min za darmo, real-time płatnie (G10) | 0 zł (plan darmowy) | „use snapshots of TradingView charts in … articles, blog posts and other publications” + obowiązkowa atrybucja (G9) | CZĘŚCIOWE | bardzo proste: użytkownik wkleja link lub obraz snapshotu |
| TradingView: wyciąganie świec (eksport CSV, CDP, MCP) | ok. 10 min | plan płatny dla eksportu CSV | zakaz „non-display usage” i „machine-driven processes”; grant dotyczy tylko snapshotów | CZĘŚCIOWE | możliwe technicznie, **niezgodne z regulaminem** do publikacji |
| Yahoo ES=F | 10 min (G13) | 0 | użytek osobisty | WYWNIOSKOWANE | proste, ale nie do publikacji |
| CFD US100/US500 (Dukascopy, broker) | zwykle minuty | 0 | brak znalezionej zgody na publikację; CFD na indeksy CME to „derivative work” w rozumieniu 6.1(d) Addendum, więc broker sam jest licencjobiorcą CME | WYWNIOSKOWANE | zależnie od źródła |
| Licencja bezpośrednio z CME | dowolna | Delayed $21,840/rok lub Historical $35,220/rok + ewent. Public Website $487 (G4) | to jest właściwa licencja dystrybucji; od 2027 zakres „Public Website” zawężony (G7) | CZĘŚCIOWE | dla firmy, nie dla repo MIT |

EURUSD, XAUUSD: rynek pozagiełdowy, bez opłat giełdowych typu CME. Prawa wyznacza wyłącznie regulamin dostawcy (broker, Twelve Data, Dukascopy, OANDA). Żadnego dostawcy z wyraźną zgodą na publikację obrazów w social mediach nie znalazłem poza snapshotem TradingView (G9). WYWNIOSKOWANE.

---

## 3. Wnioski

1. **Szybkość jest rozwiązana, publikacja nie.** Świece z bieżącej sesji legalnie i tanio: ProjectX za $14,50/mies. (od razu, 1 s) albo Databento Standard za $199/mies. (ok. 20 min). Bez abonamentu: Databento po ok. 8 h, nie po 24 h (G1, G3). Wszystkie te ścieżki dają dane do **własnego wyświetlania**, nie do rozpowszechniania (G8). PRZETESTOWANE / CZĘŚCIOWE.
2. **Wykres świecowy z danych CME na publicznym kanale to według zapisów CME dystrybucja**, która wymaga licencji dystrybucyjnej CME (G6, G8). Wiek danych tego nie usuwa: licencja Historical też jest płatna (G4, G6). Furtkę 24 h opisuje tylko Databento (F2), i to słowem „most”, bez wymienienia CME. CZĘŚCIOWE.
3. **Nie znalazłem w żadnym dokumencie CME wyjątku „de minimis” dla zrzutów ekranu w social mediach**, ani zakazu wprost nazywającego zrzuty. Status „obraz jednego wykresu bez osi” jest nieopisany. CZĘŚCIOWE (brak w przeczytanych źródłach; dokumenty CME niedostępne w całości).
4. **Kierunek CME jest odwrotny do swobody:** od 1.01.2027 publiczne witryny dostają tylko cogodzinną ostatnią cenę, bez open/close (G7). CZĘŚCIOWE.
5. **Jedyna znaleziona jawna zgoda na publikację wykresu z danymi CME przez zwykłego tradera to snapshot TradingView z atrybucją** (G9). TradingView jest licencjonowanym dystrybutorem CME i sam udziela tej zgody w regulaminie; ryzyko licencyjne bierze na siebie. Zgoda obejmuje snapshoty, **nie** świece wyciągnięte z TradingView do własnego renderera. CZĘŚCIOWE.
6. **Ścieżka „inne źródło niż CME” nie daje więcej swobody.** CFD na US100/US500 są w rozumieniu CME pochodnymi danych CME (6.1(d) Addendum), a dostawcy (Twelve Data, Dukascopy) też ograniczają publikację. Kształt ruchu CFD i kontraktu jest śródsesyjnie bardzo zbliżony, poziomy różnią się o bazę (fair value). Ceny wejścia i wyjścia z dziennika to dane użytkownika. WYWNIOSKOWANE.
7. Jak robi to LiquidJournal: nie da się ustalić z jego stron (G14).

---

## 4. Warianty

| Wariant | Jak działa | Szybkość | Legalność publikacji | Koszt | Uwagi |
|---|---|---|---|---|---|
| **W1. Snapshot TradingView w karcie i filmie (rekomendowany do publikacji „od razu”)** | Użytkownik robi snapshot wykresu swojego trade'a w TradingView (przycisk Snapshot dodaje atrybucję), wkleja link albo obraz do JustJournal; karta i film JJ składają statystyki, tło i ten obraz, z widocznym podpisem „Wykres: TradingView” | ok. 10 min za darmo | jawna zgoda TV z atrybucją (G9); bez limitu wieku i osi | 0 zł | wygląd wykresu to TradingView, nie styl JJ; jeden ręczny krok; JJ nie automatyzuje TradingView (regulamin) |
| **W2. Własny wykres JJ prywatnie od razu + do publikacji wariant A z p. 3.7** | Świece z ProjectX ($14,50) albo Databento Standard ($199) do dziennika na ekranie; w karcie publicznej wykres JJ tylko po 24 h, bez osi i OHLC | prywatnie: od razu / 20 min; publicznie: 24 h | najmocniejsze dostępne oparcie to F2 (Databento, 24 h); dla ProjectX brak nawet tego | $0–199/mies. | publikacja niepotwierdzona; pomaga mail do Databento i CME |
| W3. Pełna swoboda własnym wykresem | Licencja dystrybucyjna CME (bezpośrednio albo Databento Plus z „External distribution”) | dowolna | pełna, jeśli CME zatwierdzi zakres | od ok. $1,750/mies. albo $21–35 tys./rok | sprzeczne z modelem „każdy użytkownik repo z własnym dostępem” |
| W4. Kształt ruchu z CFD zamiast CME | Wykres US100/US500 od brokera bez osi | minuty | nie lepsza niż W2 (G6, 6.1(d), regulaminy dostawców) | 0 | **nie rekomenduję** |

Rekomendacja: **W1 + W2 razem.** Dziennik dostaje własne świece od razu (najtaniej ProjectX dla firm na ProjectX, w pozostałych przypadkach Databento Standard albo 8 h bez abonamentu). Publiczny obraz „od razu i bez ograniczeń” idzie przez snapshot TradingView. Własny wykres JJ w kartach zostaje za przełącznikiem `CHART_IN_SHARE` z wariantem A, dopóki CME albo Databento nie odpowie pisemnie.

## 5. Czy pełna swoboda jest możliwa

- **Z danymi CME we własnym renderze JustJournal: nie** dla zwykłego użytkownika bez licencji dystrybucyjnej CME (G6, G8, G4). Byłaby możliwa tylko z licencją dystrybucyjną (W3) albo po pisemnej odpowiedzi CME, że taki obraz nie jest dystrybucją. CZĘŚCIOWE.
- **Z wykresem jako obrazem TradingView: tak, praktycznie od razu** (ok. 10 min opóźnienia, albo real-time z płatnym dodatkiem), pod warunkiem widocznej atrybucji TradingView i snapshotu zrobionego przez użytkownika. CZĘŚCIOWE (regulamin TV; słowo „social media” w nim nie pada).
- EURUSD i XAUUSD: tak samo przez snapshot TradingView; bez TV zależy od regulaminu konkretnego brokera. WYWNIOSKOWANE.

## 6. Co użytkownik musiałby zrobić sam (my niczego nie wysyłamy)

1. Mail do CME Data Services (marketdata@cmegroup.com; dla prac pochodnych CMEGroupDerivedData@cmegroup.com) z pytaniem: czy osoba prywatna z licencją subscriber może publikować w Instagram/TikTok/X statyczny obraz albo film z wykresem jednego trade'a (świece ES/NQ, opcjonalnie bez osi cen), z danych starszych niż 8/24 h, i jakiej licencji to wymaga.
2. Mail do Databento (support@databento.com): czy GLBX.MDP3 należy do zbiorów z „redistributed … after 24 hours” (F2) i czy obejmuje to obrazy wykresów; jakie realne `available_end` ma plan Standard.
3. Jeśli handel przez TopstepX lub inną firmę na ProjectX: decyzja o API ProjectX ($14,50/mies.) i odczyt „market data terms of use” po zalogowaniu (publicznie niedostępne).
4. Sprawdzenie na koncie TradingView, czy menu snapshotu ma opcję udostępnienia w X (nie sprawdziłem na żywo).

## 7. Źródła

- https://databento.com/catalog/cme/GLBX.MDP3 · https://databento.com/pricing · https://api.databento.com/static/licensing/cme/cme-market-data-fee-list.pdf
- https://www.cmegroup.com/market-data/distributor/files/cme-group-data-licensing-policy-guidelines-historical-information-distribution.pdf (zablokowane, indeks)
- https://www.cmegroup.com/market-data/files/market-data-license-agreement-updates-june-2026.pdf (zablokowane, indeks)
- https://www.cmegroup.com/market-data/files/information-license-agreement-june-2026.pdf (zablokowane, indeks)
- https://bookmap.com/agreements/Subscriber%20Addendum%202023.pdf
- https://www.tradingview.com/policies/ · https://help.edgeful.com/en/articles/14436892-enabling-real-time-cme-futures-data-on-tradingview
- http://gateway.docs.projectx.com/docs/api-reference/market-data/retrieve-bars/ · https://help.topstep.com/en/articles/11187768 · https://intercom.help/tradeify-test/articles/12191761
- https://community.tradovate.com/t/is-cme-sub-vendor-requirement-for-api-access-is-290-per-month/6215
- https://liquidjournal.app · https://liquidjournal.app/terms · https://liquidjournal.app/privacy
- https://twelvedata.com/terms
- https://roadmap.databento.com/announcements/live-cme-data-is-now-open-to-all-users-starting-at-3265month (nieotwarte)
