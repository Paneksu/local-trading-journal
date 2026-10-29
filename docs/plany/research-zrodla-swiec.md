# Research: źródła danych świecowych CME (ES, NQ) dla JustJournal (27.10.2026)

Uzupełnia `wykresy-swiecowe.md` (P1, P9, P11, P23, P24) i `research-dane-publikacja.md` (G1–G14). Tylko research i testy, bez zmian w kodzie, bez commitu.
Poziomy dowodu: **PRZETESTOWANE** (wykonane dziś na żywo), **CZĘŚCIOWE** (dokument przeczytany częściowo albo źródło trzecie), **WYWNIOSKOWANE** (z dokumentacji, bez testu).

Potrzeba: świece wokół każdego trade'a (najlepiej 1 s, żeby budować 15 s / 30 s), historia na wyższych TF, możliwie szybko po trade, automatycznie z Node bez npm, tanio, użytek wyłącznie własny i lokalny.

---

## 1. Testy wykonane dziś

### 1.1 Databento (GLBX.MDP3, `ES.v.0`, klucz z `.env`, wartość klucza nigdzie nie wypisana)

| Test | Wynik | Dowód |
|---|---|---|
| `metadata.get_dataset_range` o 18:03 UTC | koniec danych `2026-10-27T10:03:02Z` dla 1s/1m/1h/trades/mbo (1d: do 00:00) → **opóźnienie 8 h 00 min** | PRZETESTOWANE |
| `get_cost` ohlcv-1s, 2026-10-20 13:30–15:00Z | 0,019685 USD | PRZETESTOWANE |
| `get_cost` ohlcv-1m, to samo okno | 0,000329 USD | PRZETESTOWANE |
| `get_cost` trades (tick), to samo okno | 0,176427 USD (9× drożej niż 1s) | PRZETESTOWANE (tylko wycena, bez pobrania) |
| `get_cost` ohlcv-1m, 8 dni (13–21.10) | 0,030228 USD | PRZETESTOWANE (tylko wycena) |
| `get_range` ohlcv-1s, okno 1,5 h, CSV | HTTP 200, 5 392 wiersze (z 5 400 sekund; 8 sekund bez transakcji nie ma wiersza) | PRZETESTOWANE |
| `get_range` ohlcv-1m, okno 1,5 h, CSV | HTTP 200, 90 wierszy | PRZETESTOWANE |
| Parser `parseOhlcvCsv` z `lib/databento.mjs` na prawdziwych plikach | oba pliki bez błędu: 1s → 5 392 świece, 1m → 90, `rolls: 0`, `dropped: 0`; pierwsza świeca `[1792503000, 772700, 772700, 772425, 772450, 1225]` = 13:30:00Z, ES 7727.00 | PRZETESTOWANE |
| 1m zbudowane z 1s vs 1m z serwera | **90/90 identycznych** (OHLC i wolumen) | PRZETESTOWANE |

**Wydano z kredytu Databento: 0,0200 USD** (0,019685 + 0,000329; wyceny `get_cost` bezpłatne). Limit zgody 0,10 USD nieprzekroczony.

Prawdziwy nagłówek CSV: `ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume`. Ceny całkowite w skali 1e-9 (`7727000000000` = 7727.00), czas w ns, plik kończy się znakiem nowej linii.

Rozbieżności względem parsera (kodu nie zmieniałem):
1. Brak rozbieżności blokujących: parser szuka kolumn po nazwach, dodatkowe `rtype` i `publisher_id` ignoruje. Zgodne.
2. **Luki w 1s:** Databento nie wysyła świecy dla sekundy bez transakcji (tu 8 luk w 1,5 h sesji RTH; w nocy będzie ich dużo więcej). Parser to przyjmuje; trzeba pamiętać w agregacji 15 s/30 s i w rendererze (nie zakładać ciągłości, nie dorysowywać pustych świec, jeśli tak ma być).
3. `rtype` 32 = 1s, 33 = 1m: parser go nie sprawdza. Nie jest to błąd (schema idzie w zapytaniu), tylko ewentualna dodatkowa kontrola.
4. Skoro 1m = agregat 1s co do grosza i sztuki, warstwa 1m może powstawać lokalnie z 1s dla okien trade'ów, a z serwera 1m tylko dla dłuższej historii (taniej: 1 dzień 1m ≈ 0,005 USD).

### 1.2 Yahoo Finance (`ES=F`, `NQ=F`, bez klucza)

| Test | Wynik | Dowód |
|---|---|---|
| 1m, `range=1d` o 18:05 UTC | HTTP 200, 828 świec ES i NQ, ostatnia świeca 17:55 → **opóźnienie 10 min**, `exchangeName: CME` | PRZETESTOWANE |
| Głębia 1m | działa 29 dni wstecz, 35 dni → HTTP 422 „1m data not available” | PRZETESTOWANE |
| Głębia 1h | ok. 700 dni (740 → 422) | PRZETESTOWANE |
| Ten sam dzień i okno co Databento (20.10, 13:30–15:00, 1m) | 90 świec; **86/90 OHLC identycznych**, 4 różne maks. o 0,50 pkt; wolumen różny w 46/90 | PRZETESTOWANE |
| 1s / tick | brak (najmniejszy interwał 1m) | PRZETESTOWANE (API nie ma takiego interwału) |
| Regulamin | Yahoo Terms 2(d)(9): zakaz „access or collect data … using any automated means … without our express, prior permission”; 2(d)(10): zakaz tworzenia „any database, archive … data feed”. API `v8/finance/chart` jest nieoficjalne, bez umowy. | CZĘŚCIOWE (regulamin przeczytany w 80%: legal.yahoo.com/us/en/yahoo/terms/otos) |

### 1.3 TradingView Desktop / MCP `tradingview`

- MCP znaleziony przez ToolSearch, ale `tv_health_check`: „CDP connection failed… TradingView is not running with CDP enabled”; procesu TradingView nie ma w systemie. Narzędzia `tv_launch` i `tab_close` nie są dostępne w tej sesji. **Nie uruchamiałem TradingView** (bez `tab_close` nie mógłbym posprzątać po teście, a uruchomienie z CDP to zmiana środowiska użytkownika). Odczyt świec przez MCP: **NIEPRZETESTOWANE**.
- Regulamin (tradingview.com/policies, sekcja 3, przeczytany dziś): dane „licensed for exclusive display-only use”, „strictly limited to personal or internal business purposes”, zakaz „any machine-driven processes that do not involve the direct, human-readable display”, zakaz „any processing of TradingView's content” i „creating products or services based on TradingView content”; sekcja 11: „At no point is raw data accessible by any client”. CZĘŚCIOWE (narzędzie streszczające, cytaty dosłowne).
- Wniosek: automatyczne wyciąganie świec przez CDP/MCP do dziennika jest sprzeczne z regulaminem, nawet do użytku własnego. Ręczny eksport „Download chart data…” do CSV istnieje (tradingview.com/support/solutions/43000537255), eksportuje tylko załadowane świece; który plan i czy interwały sekundowe: źródła trzecie się różnią (CZĘŚCIOWE). Status prawny importu takiego CSV do własnej aplikacji: WYWNIOSKOWANE jako „processing” → niezgodne.
- Dane z Tradovate w TradingView: połączenie brokera Tradovate służy do handlu; dane wykresu w TV pochodzą z subskrypcji TV (CME z opóźnieniem ok. 10 min albo płatny real-time). Tradovate: konta prop mają Level I CME „included in what you pay your prop firm provider” (support.tradovate.com, Subscribing to Market Data). CZĘŚCIOWE.

### 1.4 Dukascopy (CFD USA500)

`datafeed.dukascopy.com/.../USA500IDXUSD/...bi5`: dwa żądania, oba przekroczyły 20 s bez odpowiedzi (drugi taki wynik po teście z 27.10 rano). PRZETESTOWANE (nieosiągalne z tej sieci). Poza tym P5: «Nie, na razie tylko futures».

### 1.5 Instalacje

**Nic nie zainstalowano.** NinjaTrader 8: przycisk pobrania prowadzi do `account.ninjatrader.com/eu/register` (rejestracja konta) → STOP zgodnie z zasadą. Sierra Chart i Interactive Brokers wymagają konta (a IB i Denali non-pro: rachunku z depozytem) → STOP. Pliki tymczasowe testów tylko w scratchpadzie sesji (CSV z Databento 1,5 h, skrypty), poza repo.

---

## 2. Tabela porównawcza

| Źródło | Test | Rozdzielczość | Opóźnienie po trade | Głębia | Koszt | Automatyzacja z Node bez npm | Licencja użytku własnego | Nakład w dzienniku | Ryzyka |
|---|---|---|---|---|---|---|---|---|---|
| **Databento, bez planu (usage)** | PRZETESTOWANE (koszt, pobranie, parser, opóźnienie) | tick (`trades`), 1s, 1m, 1h, 1d | **8 h** (zmierzone) | od 2010-06-06 | 1s okno 1,5 h: **0,02 USD/trade**; 1s cały dzień 0,21; 1m dzień 0,005; 1m rok 1,29; tick 1,5 h 0,18 | tak, już napisane (`fetch`, CSV) | historyczne po 8 h „bez licencji” CME (G1); użytek własny OK | **zero**: klient, parser, limity P2/P24 gotowe | 8 h czekania; brak świeżych danych z dzisiejszej sesji |
| **Databento Standard** | WYWNIOSKOWANE (katalog, G1/G2) | jak wyżej + live | ok. 20 min historycznie, live na żywo | 1 rok L1 w abonamencie, starsze usage | **199 USD/mies.** | ten sam kod (`get_range`) | licencja CME przez Databento jako VoR | ~0 (zmiana stałej opóźnienia) | drogo jak na jeden dziennik; P23 mówi „bez abonamentu” |
| **Massive (dawniej Polygon), Futures Starter** | WYWNIOSKOWANE (massive.com/docs/rest/futures/aggregates, /pricing) | sekundy („1sec”) do miesięcy | 10 min | 2 lata (od 2017 w wyższych planach) | **29 USD/mies.** (Developer 79, Advanced 199 real-time); Basic 0 USD: 8 h, 2 lata, **bez** agregatów sekundowych | REST JSON, `fetch` | „Individual use”, „Non-pros only” (szczegóły nieprzeczytane) | średni: drugi klient + mapowanie symboli + test zgodności z Databento | wymaga konta i karty (nie testowałem); prop trader może być „pro” (patrz ryzyka) |
| **Yahoo Finance `ES=F`** | PRZETESTOWANE (dane, opóźnienie, głębia, zgodność 86/90) | 1m (min.) | **10 min** | 1m: 29 dni; 1h: ~700 dni | 0 | tak, `fetch` | **regulamin zakazuje automatycznego pobierania i budowy bazy** (2(d)(9), 2(d)(10)) | mały: drugi parser JSON | nieoficjalne, może zniknąć; zakaz w regulaminie; rolowanie `ES=F` może różnić się od `.v.0`; brak 1s |
| **TradingView (MCP/CDP, CSV)** | CZĘŚCIOWE (MCP niepołączony; regulamin przeczytany) | do 1s w wyższych planach (źródła trzecie) | ok. 10 min (plan bez dodatku) | limit świec na wykres (10–40 tys., źródła trzecie) | plan TV | technicznie tak (MCP), ręcznie CSV | **zakaz machine-driven/processing** (sekcja 3) | średni; zależy od działającej aplikacji Desktop | niezgodne z regulaminem; ryzyko dla konta TV |
| **Tradovate API** | WYWNIOSKOWANE (support.tradovate.com „Tradovate API Access”) | tick, bary | na żywo | Tradovate: tick do 1 roku (źródło trzecie) | API add-on ok. 25–30 USD/mies. + licencja CME dla API (ok. 290–500 USD/mies., forum, CZĘŚCIOWE) | REST/WebSocket | wymaga sub-vendor CME | duży | **„Prop firm and evaluation accounts are not eligible for API access”**; wymagany własny zasilony rachunek → **odpada** |
| **NinjaTrader 8** | WYWNIOSKOWANE (help NT8) | tick, 1s, 1m; eksport w „Historical Data” | po sesji (eksport ręczny) albo nagrywanie na żywo | Market Replay: „limited amount … free”, popularne instrumenty | licencja darmowa (sym/wykresy); dane z połączenia | **nie**: eksport ręczny z GUI (automat tylko przez NinjaScript/C#) | dane z połączenia prop (Addendum G8) | duży (import plików, osobny program) | wymaga rejestracji konta (STOP); połączenie z kontem prop = logowanie (zakaz) |
| **Sierra Chart + Denali** | WYWNIOSKOWANE (sierrachart.com Denali) | tick | na żywo | głęboka tick (bez potwierdzonej liczby) | pakiet 36–56 USD/mies. + CME non-pro 6 USD/mies., bez rachunku „pro” 145 USD/mies. | nie (pliki .scid, protokół DTC) | non-pro tylko z zasilonym rachunkiem | duży | konto, rachunek, dzienne użycie Windowsa |
| **Interactive Brokers API** | WYWNIOSKOWANE (interactivebrokers.github.io/tws-api/historical_limitations) | 1s (max 30 min na zapytanie) | na żywo | **≤30 s świece tylko 6 mies.**; wygasłe futures 2 lata | rachunek IB + subskrypcja CME (cena nieustalona) | TWS/Gateway lokalnie, protokół gniazda (bez npm ciężko); Web API REST | non-pro przy własnym rachunku | duży | osobny rachunek u brokera, limity tempa (60 zapytań/10 min) |
| **Rithmic R\|Protocol** | WYWNIOSKOWANE (strony brokerów) | tick | na żywo | tick od 2011 (źródło trzecie) | API ok. 20–100 USD/mies. u FCM (różnie) | WebSocket + protobuf: bez npm trzeba pisać dekoder | Addendum CME | bardzo duży | konto prop jest na Tradovate, nie Rithmic → nie dotyczy |
| **ProjectX / TopstepX API** | z G11 | 1s | na żywo | — | 14,50–29 USD/mies. | REST | — | mały | **tylko firmy na ProjectX**; nie dotyczy, gdy konto prop nie działa na ProjectX |
| **Kibot** | WYWNIOSKOWANE (kibot.com) | tick, 1s, 1m | paczka historyczna + aktualizacje | od 2009 | Top 25 futures 1s: 680 USD jednorazowo; tick 870 USD; ES 1m pełna historia 110 USD | pobieranie aktualizacji możliwe, ale nie po każdym trade | licencja paczki | średni (import) | drogo na start; nie daje danych z dziś |
| **FirstRate Data** | WYWNIOSKOWANE (firstratedata.com/i/futures/ES) | 1m–1d dla ES (tick/1s na tej stronie brak) | aktualizacje dzienne | od 2008 | cena ES niewidoczna; aktualizacje 99,95 USD/rok | ręcznie / zip | nieprzeczytana | średni | brak 1s |
| **Barchart OnDemand** | nie zbadane głębiej | — | — | — | wycena indywidualna (biznes) | — | — | — | poza budżetem pojedynczego tradera (WYWNIOSKOWANE) |
| **CME DataMine** | CZĘŚCIOWE (źródła trzecie sprzeczne) | tick/MBO | T+1 | lata | cena za zbiór, brak publicznej stawki | API/SFTP | licencja CME | duży | strona CME blokuje automat (research G); dla firm |
| **Dukascopy CFD** | PRZETESTOWANE: nieosiągalne | tick | minuty | lata | 0 | `.bi5` + LZMA | brak zgody na publikację | duży | P5 wyklucza; to nie są dane CME |

Uwaga o „pro”: źródło trzecie (wynik wyszukiwania, bez strony CME) twierdzi, że od marca 2026 CME przeklasyfikowuje finansowanych traderów prop na „Professional”. Dotyczy subskrypcji czasu rzeczywistego (Massive, Databento Standard, TV real-time), nie danych historycznych po 8 h. CZĘŚCIOWE, do sprawdzenia przed jakimkolwiek abonamentem.

---

## 3. Ranking i rekomendacja

1. **Databento bez planu (obecny plan P23)**: jedyne źródło, które dziś przeszło pełny test (koszt, pobranie, parser, zgodność 1s↔1m), daje 1s (więc 15 s/30 s) i tick, historię od 2010, ~0,02 USD za trade (1,5 h 1s) i ~1,3 USD za rok 1m. Zero nowego kodu. Wada: 8 h po trade.
2. **Massive Futures Starter (29 USD/mies.)**: najtańsza legalna droga do świec sekundowych po 10 min, REST z `fetch`. Niezweryfikowane testem (konto i karta), licencja „individual / non-pros only” do przeczytania.
3. **Databento Standard (199 USD/mies.)**: ten sam kod, ok. 20 min. Przekracza «databento bez abonamentu» (P23).

Rekomendacja: **zostać przy Databento bez planu jako jedynym źródłem** (najprostsze, zgodne z P23 i prostotą P17), z przyciskiem „Dociągnij brakującą końcówkę” (P11) po 8 h. Pobierać 1s tylko dla okna trade'a (np. ±45 min), 1m dla tła i historii; 1m dla okna liczyć lokalnie z 1s (zgodność 90/90).

Plan B (gdy 8 h okaże się za długo): **hybryda** Databento (1s, historia, wersja ostateczna) + szybkie źródło na podgląd od razu po trade, zastępowane przez Databento po 8 h. Kandydaci na szybkie źródło, od najlepszego: Massive Starter 29 USD/mies. (legalne, 1s, 10 min) > Databento Standard 199 USD/mies. (20 min, zero nowego kodu). Yahoo (0 zł, 1m, 10 min, technicznie działa i zgadza się 86/90) i TradingView przez MCP odrzucam jako automat, bo zakazują tego ich regulaminy.

---

## 4. Pytania do użytkownika (decyzje klasy trzeciej, nie podjęte)

1. Czy 8 h opóźnienia (Databento bez planu) jest akceptowalne, czy potrzebny jest podgląd od razu po trade? Jeśli tak: czy zgoda na abonament (Massive Starter 29 USD/mies. albo Databento Standard 199 USD/mies.)? To zmiana P23.
2. Massive wymaga założenia konta i karty: czy mam założyć test (Basic 0 USD nie ma świec sekundowych), czy zostawiamy?
3. Yahoo jako darmowy szybki podgląd 1m: regulamin zakazuje automatycznego pobierania. Czy rozważać mimo to (ryzyko po stronie użytkownika), czy skreślić?
4. TradingView: czy chcesz, żebym przetestował MCP na otwartym TradingView Desktop z CDP (tylko odczyt, nowa karta)? Wymaga uruchomienia TV z CDP przez Ciebie; do dziennika i tak nie polecam ze względu na regulamin.
5. NinjaTrader 8 (ręczny eksport tick/1s z danych konta prop) wymaga rejestracji konta i zalogowania do Tradovate: czy w ogóle rozważać? Rekomenduję nie.

---

## 5. Źródła

- Databento: testy API `hist.databento.com` (27.10.2026, 18:03 UTC); https://databento.com/catalog/cme/GLBX.MDP3
- Yahoo: testy `query1.finance.yahoo.com/v8/finance/chart/ES=F` (27.10.2026); https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html
- TradingView: https://www.tradingview.com/policies/ · https://www.tradingview.com/support/solutions/43000537255-how-to-export-chart-data/
- Tradovate: https://support.tradovate.com/s/article/Tradovate-API-Access?language=en_US · https://support.tradovate.com/s/article/Subscribing-to-Tradovate-Market-Data?language=en_US · https://community.tradovate.com/t/api-access-for-propfirm-accounts/10348 · https://community.tradovate.com/t/is-cme-sub-vendor-requirement-for-api-access-is-290-per-month/6215
- NinjaTrader: https://ninjatrader.com/futures/platform/free-download/ · https://ninjatrader.com/support/helpguides/nt8/historical_data_manager.htm · https://static.ninjatrader.com/support/helpGuides/nt8/set_up12.htm
- Sierra Chart: https://www.sierrachart.com/index.php?page=doc%2FDenaliExchangeDataFeed.php
- Interactive Brokers: https://interactivebrokers.github.io/tws-api/historical_limitations.html
- Rithmic: https://www.rithmic.com/products · https://faq.ampfutures.com/hc/en-us/articles/360060137993-Rithmic-Pricing · https://edgeclear.com/rithmic/
- Massive: https://massive.com/docs/rest/futures/aggregates · https://massive.com/pricing?product=futures · https://massive.com/knowledge-base/article/does-massive-have-per-second-aggregates-available
- Kibot: https://www.kibot.com/buy.html · https://www.kibot.com/historical-data/top-25-continuous-futures-contracts-tick-and-bid-ask-data.html
- FirstRate Data: https://firstratedata.com/i/futures/ES
- CME: https://www.cmegroup.com/market-data/files/january-2026-market-data-fee-list.pdf (z wyników wyszukiwania; strona CME blokuje automat)
