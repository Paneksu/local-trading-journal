# Moduł Backtest w JustJournal — projekt (wersja 1, 30.10.2026)

Dokument projektu, nie plan wykonania. Plan etapów (karty pakietów) powstaje z niego osobno w `docs/plany/backtest/`.
Oznaczenia: **[U]** = słowa lub decyzja użytkownika (klasa trzecia, nie zmieniać bez pytania), **[S]** = decyzja sesji głównej (gustu, można zmienić z uzasadnieniem w raporcie), **[B]** = zostawione budującemu.

## 1. Po co

[U] FX Replay ma dobrą mechanikę replayu, ale ma cztery wady: częste lagi, słaby journaling, słabą analizę statystyk i to, że dziennik backtestu leży w innym miejscu niż dziennik codzienny. Użytkownik chce **wszystkie dane w jednym miejscu**: trade z backtestu i trade z handlu na żywo w JustJournal, opisane tak samo i liczone tymi samymi statystykami.

Dwie rzeczy są najważniejsze [U]:
1. **Journaling backtestu**: bardzo łatwy, tylko po zamknięciu trade'a. Rysunki z wykresu zapamiętane przy trade'zie, bo to w nich są opisy.
2. **Backtest spersonalizowany**: sesja tylko z wybranych dni (np. dni CPI, OPEX, poniedziałki bez newsów), żeby ćwiczyć konkretne warunki.

Pozostałe funkcje mają być dopracowane, a moduł ma być pełnym modułem backtestu. Wzorem mechaniki jest FX Replay.

Styl pracy użytkownika [U]: skupia się na otwarciu Nowego Jorku i handluje zwykle najpóźniej do 11:00 NY. Wpływ CPI bada w trakcie sesji NY, więc brak sekund przed 9:30 nie przeszkadza.

## 2. Cele, nie-cele, anty-cele

**Cele**
- Replay świeca po świecy na lokalnych świecach, z interwałami sekundowymi, które naprawdę działają (prawdziwe 1s w oknie 9:30–11:00 NY).
- Składanie zleceń na wykresie i dokładne wypełnienia.
- Journaling po zamknięciu w kilka sekund.
- Sesje z filtrem dni.
- Klasyczne sterowanie czasem i konfigurowalne skoki ze skrótami.
- Kilka wykresów naraz.
- Statystyki, z których wynikają decyzje.
- Zapis lokalny i przycisk zapisu dnia do Notion.
- Nowe narzędzie rysunku: callout.

**Nie-cele (na teraz)**
- Dane sprzed 2020 dla sekund. Import 1s sprzed 2020 to osobna, przyszła decyzja [U: „może będę chciał się cofać sprzed 2020, ale na razie aktualna baza wystarczy”].
- Forex i inne instrumenty niż ES, NQ, MES, MNQ.
- Prowizje i poślizg. Opcjonalne pole w sesji wolno dodać, jeśli budującemu wyjdzie to tanio [B].
- Sharpe, Sortino, kilka wariantów profit factor i inne metryki, z których nie wynika decyzja [S].
- Ocena wykonania (A/B/C) w panelu po zamknięciu [U: „usuń ocenę wykonania, bo nie używam takiego czegoś w ocenie moich trade'ów”].

**Anty-cele, czyli porażka mimo działania.** Użytkownik nie umiał ich nazwać („nie wiem”), więc to wnioski sesji głównej z rozmowy [S]:
- **Lagi.** Moduł, który przy kroku albo odtwarzaniu przycina się jak FX Replay, jest porażką. Twarde progi w p. 9.
- **Zaglądanie w przyszłość.** Żadna świeca, wskaźnik, poziom (PDH/PDL, sesje), news ani statystyka filtra nie może pokazać danych późniejszych niż kursor replayu. Wyjątek: kalendarz newsów pokazuje godzinę i nazwę zaplanowanego wydarzenia (tak jak w prawdziwym dniu), ale nigdy jego wyniku.
- **Journaling, który wybija z rytmu,** czyli formularz z wieloma polami albo obowiązkowe wypełnianie przed następnym krokiem.
- **Wygląd obcego systemu.** Moduł musi wyglądać jak reszta JustJournal [U z 26.10, dotyczy całego dziennika: „design taki sam jak reszta strony”]: te same motywy, tokeny, klasy (`.seg`, `.btn`, `.check`, popover Ustawień) i przezroczyste tło wykresu.
- **Utrata danych** przy zamknięciu karty, awarii albo błędzie Notion.

## 3. Ograniczenia (stałe)

- Repo `R:\PROJEKTY\trading-hq` jest publiczne (MIT): vanilla JS, Node ≥22, **zero zależności npm**, biblioteki tylko wklejone w `public/vendor/` z licencją. Teksty UI przez `t('…')` z wpisami w `public/i18n/en.json`. Kolory wyłącznie z tokenów CSS. Komentarze po polsku ze słowami użytkownika i numerem decyzji.
- Migracje Notion tylko addytywne (`addProperty`, `addOption`). **Nie da się dodać nowej bazy.**
- Dane CME tylko do użytku własnego: świece nigdy w repo, testach ani zrzutach dołączanych do wydania.
- Testy wyłącznie na atrapach (`testy/atrapa-notion.mjs`, bez Databento, ES tylko 1m). Nigdy na prawdziwym Notion ani na produkcyjnej instalacji.
- Praca w worktree `R:\PROJEKTY\trading-hq-wt\backtest`, gałąź `feat/backtest` od `main` (eb7e194, 1.4.1). **Produkcyjnej instalacji `R:\PROJEKTY\trading-hq` nie dotykać** do wydania.
- Commity lokalne na `feat/backtest` po każdym pakiecie — **do potwierdzenia przez użytkownika** (patrz p. 12). Push, tag, release i aktualizacja produkcji tylko po jego „ok”.
- Wersja wydania: **1.5.0** [S].

## 4. Co już jest (punkty zaczepienia)

Z przeglądu repo z 30.10 (fakty z kodu):
- Typ trade'a `Backtest` istnieje (select `typ`: Live / Backtest / Niewzięty). Statystyki liczą Backtest w R (`app.js`, `lib/roles.mjs`).
- Świece: binarnie, plik na dzień UTC, rekord 24 B (`lib/candles-store.mjs`), `coverage.json` na symbol. `/api/candles?instrument&from&to&tf[&adjust]` (`lib/candles.mjs`, limit 50 000 barów). Agregacja dowolnego TF (także 7s, 45s) w czystym module `public/js/swiece.js` (Node i przeglądarka), z kotwicą w otwarciu sesji CME, sesjami i PDH/PDL. Roll i B-ADJ działają.
- **Prawdziwe 1s:** NQ 9:30–11:00 NY od 2020-01-02 (`OPEN_WINDOW_NY`, `OPEN_INSTRUMENT='NQ'` w `candles.mjs:115-121`) oraz okna ±30 min wokół trade'ów. Poza tym sekundy są syntetyzowane z 1m (tryb „mixed”). ES ma pełne 1m od 2010, ale 1s tylko wokół starych trade'ów.
- Wykres: `podglad.js` to własny podgląd SVG (tylko oglądanie). `wykres.js` to edytor na Lightweight Charts z paczką rysowania 0.6.2 (`rysunki.js`, `geometria.js`). Rysunki trafiają do pola Notion „Rysunki” (rich_text, do 190 000 znaków) z lokalną pamięcią `chart-data/drawings-cache/`.
- Newsy, OPEX, Bank Holiday, earningsy od 2010: `lib/news.mjs` (zdarzenia `t, name, imp, kind`) i `/api/news/search`. Strefa ET jest obsługiwana.
- Stary szkic „Etap 13: Replay z 1s” w `docs/plany/wykresy-swiecowe.md` (kursor czasu, świece TF budowane z 1s w przeglądarce). Budujący go czyta i może z niego korzystać.

## 5. Dane świec

- Replay chodzi na danych lokalnych. Od 9:30 do 11:00 NY są prawdziwe 1s i każdy interwał sekundowy z nich zbudowany. Przed 9:30 wykres pokazuje kontekst z 1m (premarket, 8:30 CPI, PDH/PDL) [U: zgoda na ten sposób działania].
- **Przejście 1m → 1s o 9:30 jest płynne.** Gdy interwał sekundowy nie ma prawdziwych sekund (przed 9:30 albo po 11:00), wykres sekundowy pokazuje komunikat „sekundy od 9:30” i krok replayu wynosi wtedy 1m. **Wypełnienia zleceń nigdy nie liczą się na sekundach syntetyzowanych z 1m** [S]: przed 9:30 i po 11:00 liczą się na 1m z regułą konserwatywną (p. 7).
- Świeca wyższego interwału w trakcie replayu jest budowana z 1s (albo 1m) do kursora. Nie wolno pobrać gotowej świecy 1m/5m z serwera, bo zawiera przyszłość [S].
- **ES: tylko 1m, bez zakupu ES 1s** [U: „Nie potrzebuje narazie tego jednak”, 30.10.2026]. Nie kupujemy danych w Databento i nie budujemy importu ES 1s w tym module. Na ES interwały sekundowe są niedostępne z komunikatem (ten sam mechanizm co NQ poza prawdziwym oknem 1s), a wypełnienia na ES liczą się na 1m z regułą konserwatywną (p. 7). NQ bez zmian. MES/MNQ biorą dane z ES/NQ (już tak jest).
- Sesja backtestu dopuszcza tylko dni z danymi dla wybranych instrumentów: dla NQ (i MNQ) prawdziwe 1s w oknie otwarcia, dla ES (i MES) pokrycie 1m (ES nie ma prawdziwych 1s w tym module). Dla układu z wieloma instrumentami dzień musi spełniać warunek każdego z nich. Dni bez danych są wyłączone i wypisane w kreatorze z powodem [S].

## 6. Ekran replayu

Makieta układu (bez finalnego wyglądu) była pokazana 30.10. Użytkownik oceni wygląd na żywym module [U: „zobaczymy jak to będzie wyglądało finalnie”].

- **Nowa zakładka „Backtest”** w JustJournal: lista sesji (nazwa, instrument, dni zrobione / w puli, wynik w R, ostatnio otwarta), przycisk „Nowa sesja”, wejście do replayu i do statystyk sesji [S].
- **Górny pasek replayu:** nazwa sesji, dzień „7 / 23”, typ dnia z filtra (np. „CPI 8:30”), wynik sesji w R i liczba trade'ów, licznik „niezapisane w Notion: N”, wybór układu, przycisk „Zakończ dzień”.
- **Wykresy** [U: „kilka wykresów naraz, np. na jednym ES, a na drugim NQ, lub różne timeframe'y”]:
  - Układy 1, 2 (w poziomie lub pionie) albo 4. Ostatni układ jest zapamiętany.
  - Każdy wykres ma własny instrument i interwał.
  - Wszystkie chodzą na **jednym zegarze replayu**, ze wspólnym krzyżykiem czasu.
  - Zlecenia trafiają na wykres aktywny (wyróżniona ramka).
  - Rysunki są per instrument: widoczne na każdym wykresie tego instrumentu, w każdym interwale.
- **Wykres replayu to edytor Lightweight Charts** (`wykres.js` i `rysunki.js`), nie podgląd SVG, bo potrzebne są rysowanie i przeciąganie SL/TP [S]. Nakładki sesji, PDH/PDL i newsów działają jak dziś, ale liczone tylko z danych do kursora.
- **Ukrycie daty** przy kolejności losowej: oś czasu pokazuje tylko godziny, pasek nie pokazuje daty, a data odsłania się po „Zakończ dzień” [S].

## 7. Zlecenia i wykonanie

[S] Jak w FX Replay:
- Zlecenia market, limit i stop.
- SL i TP ustawiane przy zleceniu i przeciągane myszą po wejściu, przesunięcie na BE, częściowe zamknięcie i zamknięcie ręczne.
- Kierunek z przycisków Buy/Sell albo z narzędzia pozycji na wykresie.
- Wielkość pozycji liczona z ryzyka na trade (ustawienie sesji) i odległości SL. Obok jest pole ręcznej liczby kontraktów.
- Jedna otwarta pozycja na instrument [B: czy dopuścić kilka naraz].

**Silnik wypełnień** to czysty moduł z testami, liczony na 1s tam, gdzie są prawdziwe sekundy, a gdzie indziej na 1m:
- Limit wypełnia się po cenie limitu przy dotknięciu. Stop i market wypełniają się po cenie wyzwolenia albo po otwarciu następnej świecy, jeśli była luka.
- **Gdy SL i TP mieszczą się w tej samej świecy, wygrywa SL** (konserwatywnie).
- Wynik w R z ceny wejścia i pierwotnego SL. Wynik w USD z punktów × mnożnik (ES 50, NQ 20, MES 5, MNQ 2) × kontrakty.
- Dla trade'ów Backtest P&L i R liczą się automatycznie, bo w replayu nie ma innego źródła. **To różni się od trade'ów Live**, gdzie P&L i R są ręczne [U z 28.10 dotyczyło dziennika na żywo]. Budujący nie zmienia zachowania Live.
- MAE/MFE w R liczone ze świec 1s (albo 1m, na ES zawsze 1m) między wejściem a wyjściem.

## 8. Sterowanie czasem i skoki

[U] Klasycznie, jak w każdym backteście:
- Krok w przód i w tył o jedną świecę bieżącego interwału.
- Krok o wybraną wartość (sekundy, minuty, godziny).
- Start i stop odtwarzania z wyborem szybkości.

Wszystko jest pod klawiaturą. Domyślne skróty są możliwie zgodne z FX Replay [S], a budujący sprawdza je w dokumentacji FX Replay [B].

**Skoki** [U: „można sobie kliknąć listę i wybrać, który rodzaj przeskoku się chce mieć i do jakiego czasu, lub dostosować ustawienia, jaki skok co znaczy, i powinien mieć on także skrót klawiaturowy”]:
- Lista rozwijana przy pasku replayu. Wybrany skok jest pod przyciskiem i pod swoim skrótem.
- Gotowe skoki: do 9:30 NY, do następnej sesji NY (następny dzień z puli, godzina startu), do godziny następnego newsa, do następnego dnia z filtra, +N min.
- W Ustawieniach → Backtest można dodawać, edytować i usuwać skoki: nazwa, cel (godzina NY, początek sesji Azja / Londyn / NY, następny news o wadze ≥ X, przesunięcie o czas, następny dzień puli) oraz skrót.
- Skrót nie może kolidować z istniejącymi skrótami wykresu (`rysunki.js`, `podglad.js`). Kolizję wykrywa walidacja.
- **Godzina startu dnia** to ustawienie sesji (domyślnie 9:00 NY [S]). Replay startuje z wykresem wypełnionym historią do tej chwili.
- Krok w tył cofa kursor. Pozycje i zlecenia złożone po nowym kursorze nie są wtedy usuwane, tylko ich wykonanie wstrzymane [B: zachowanie w szczegółach, z zasadą „nic nie znika bez potwierdzenia”].

## 9. Wydajność (twarde progi, anty-cel „lagi”)

[S] Mierzone w przeglądarce na prawdziwych lokalnych świecach, przy dwóch wykresach (NQ 15s i ES 1m):
- Pojedynczy krok (render obu wykresów) ≤ 16 ms (p95).
- Odtwarzanie z szybkością 1s świeca na 10 ms (100×) bez gubienia klatek przez 90 min danych.
- Przejście do następnego dnia (skok) ≤ 1,5 s, łącznie z dociągnięciem świec.

Metoda [B], z zaleceniem [S]: cały dzień (kontekst 1m plus okno 1s) pobierany raz na dzień, `series.update()` dla bieżącej świecy, bez `setData()` przy każdym kroku, agregacja przyrostowa.

## 10. Journaling

[U: „tylko po zamknięciu, powinno być bardzo łatwe w obsłudze i powinno zapamiętywać rysunki z wykresu, ponieważ tam będą opisy tego trade'a”]
- W trakcie trade'a nic nie przerywa.
- Po pełnym zamknięciu pozycji w rogu wykresu pojawia się panel. Ceny, czasy, wynik R/USD i MAE/MFE są wypełnione automatycznie. Użytkownik wybiera **setup** (podpowiedzi z istniejących opcji pola „setup” w Notion plus dodanie nowej) i opcjonalnie wpisuje **notatkę**. Nic więcej.
- **Enter** zapisuje lokalnie. **Esc** zapisuje trade bez opisu i odkłada go na listę „do uzupełnienia” w sesji. Replay nigdy nie czeka na panel.
- **Rysunki:** w chwili zamknięcia do trade'a przypina się migawka wszystkich rysunków instrumentu z tego dnia, w formacie JSON paczki 0.6.2 [S]. Po otwarciu trade'a w dzienniku (lightbox, edytor, miniatura) widać ten sam wykres z tymi opisami, tak jak przy trade'ach Live.
- Pola Notion trade'a Backtest: `typ=Backtest`, date/exit, instrument, dir, setup, session, r, pnl, entryPrice, exitPrice, sl, tp, be, contract, notes, drawings, opcjonalnie konto, a także nowe pola `btSession` (sesja), `btMae` i `btMfe` (MAE i MFE w R, p. 11).

## 11. Zapis: lokalnie, potem do Notion

[U: „czy dobrą metodą będzie zapis lokalny, a podczas końca sesji na dany dzień przycisk zapisz dane do Notion” → zaakceptowana propozycja z trzema zabezpieczeniami]
- **Lokalnie jest źródło prawdy w trakcie sesji.** Każdy trade, zlecenie, rysunek, notatka i stan kursora zapisują się natychmiast na dysk (np. `chart-data/backtest/<sesja>.json`, z zapisem atomowym przez plik tymczasowy i rename [B: dokładny format]), więc nic nie ginie przy zamknięciu karty.
- **„Zakończ dzień”** wysyła trade'y dnia do Notion jako strony w bazie trade'ów (`typ=Backtest`) i przechodzi do następnego dnia z puli. Osobny przycisk „Zapisz do Notion” wysyła zaległe bez kończenia dnia.
- **Sesja w Notion:** migracja **006** dodaje do bazy trade'ów trzy pola [S]: tekstowe „Sesja backtestu” (nazwa i identyfikator sesji) oraz dwa liczbowe, opcjonalne „MAE (R)” / EN „MAE (R)” i „MFE (R)” / EN „MFE (R)” (role `btMae`, `btMfe`) [U: „Tak, dodać pola”, 30.10.2026]. MAE i MFE zapisują się przy wysyłce trade'a Backtest do Notion, dzięki czemu statystyki wykonania działają na każdym urządzeniu. Nowej bazy nie da się dodać migracją. Definicja sesji (filtr, ustawienia, kolejność dni) zostaje lokalnie, a jej kopia idzie do istniejącego bloku ustawień w Notion, żeby była widoczna na drugim urządzeniu [B: czy kopia w bloku ustawień zmieści się w limicie, inaczej tylko lokalnie].
- **Licznik „niezapisane w Notion: N”**, kolejka z ponawianiem (429 i brak sieci) oraz **idempotencja**: lokalny identyfikator trade'a zapisany w Notion, więc ponowna wysyłka niczego nie dubluje.
- Na drugim urządzeniu trade'y Backtest widać po zapisie do Notion. Statystyki i widoki JustJournal czytają jednocześnie lokalne niezapisane trade'y i trade'y z Notion [S]. Statystyki wykonania (MAE/MFE) biorą wartości z sesji lokalnych i z pól `btMae`/`btMfe` w Notion; trade'y bez tych pól (Live, stare Backtest z 2023) są z nich wyłączone, a ich liczba jest pokazana.
- Istniejące 6 wpisów Backtest z 2023 zostaje nietkniętych i liczy się w statystykach (bez sesji: „Bez sesji”).
- Migracja 006 na prawdziwym Notion: **kopia → dry-run → „ok” użytkownika** (tak jak 003–005).

## 12. Tworzenie sesji i filtr dni

[U: „te warunki to ma być dodatkowa funkcja, nie ma się wyświetlać jako główna, główne mają być takie klasyczne”; „kolejność dni można sobie wybrać”; „możesz dać dużą swobodę użytkownikowi i powinno to być rozległa funkcja, ale dobrze dopracowana”]

**Formularz główny (klasyczny):** nazwa, instrument(y), zakres dat, saldo startowe, ryzyko na trade (USD albo % salda), godzina startu dnia, kolejność dni (chronologicznie, od najnowszych, losowo z ukrytą datą), opcjonalnie konto z Notion.

**„Filtr dni (zaawansowane)”** jest domyślnie zwinięty:
- Warunki łączone przez **i / lub / nie** (grupy).
- Na żywo widać licznik pasujących dni i ich listę, z możliwością ręcznego wyrzucenia dnia.
- Filtr można zapisać jako szablon („Szablony filtrów”, lokalnie i w bloku ustawień).

Grupy warunków [S, propozycja zaakceptowana bez zmian zakresu]:
- **Kalendarz:** dzień tygodnia, zakres dat, miesiąc, dzień przed świętem i po nim, tydzień rolla.
- **Newsy:** konkretne wydarzenie (CPI, Core CPI, NFP, FOMC, PPI, Retail Sales… — lista z katalogu `news-katalog.mjs`), dowolny news o wadze ≥ (czerwony / pomarańczowy), „bez newsów o wadze ≥ X”, godzina newsa (przed 9:30 / w trakcie 9:30–11:00 / po), przemówienie lub zeznanie przewodniczącego Fed.
- **Wygasanie:** OPEX miesięczny i kwartalny, tydzień OPEX.
- **Earningsy:** wyniki spółek klasy 1–4 tego dnia przed otwarciem albo poprzedniego dnia po zamknięciu.
- **Rynek** (liczone wyłącznie z danych przed 9:30 tego dnia, bez przyszłości):
  - gap otwarcia (otwarcie 9:30 względem zamknięcia 16:00 dnia poprzedniego, w % i w punktach);
  - zakres overnight (18:00–9:30);
  - zakres i kierunek poprzedniego dnia;
  - inside day;
  - cena przed otwarciem względem PDH/PDL;
  - ATR(14) dzienne w porównaniu ze średnią.

**Pomijanie:** dni już przerobione w tej sesji są pomijane. Pula się nie powtarza.

Wydajność filtra [B]. Zalecenie [S]: indeks cech dnia (newsy, OPEX, gap, zakresy) liczony raz i trzymany lokalnie, a licznik pasujących dni odświeżany na żywo.

## 13. Statystyki

[U: „statystyki powinny dawać prawdziwą wartość i powinny być zrozumiałe i przejrzyste, więc podczas wybierania, jakie statystyki dać, kieruj się tym, czy mają dla mnie jakiś sens”]. Kryterium doboru: czy na tej podstawie użytkownik podejmie inną decyzję [S].

- **Nagłówek sesji:** liczba trade'ów, win rate, średnie R, suma R. Pod nim krzywa kapitału w R (styl `charts.js`).
- **„Gdzie mam przewagę”:** jedna tabela z przełącznikiem rozbicia. Rozbicia: setup, dzień tygodnia, godzina wejścia (co 15 min od 9:30), typ dnia (każdy warunek filtra, np. CPI / FOMC / OPEX / bez newsów), kierunek. W wierszu: liczba trade'ów, win rate, średnie R i suma R. Wiersze z **< 20 trade'ami** mają dopisek „za mało danych” i są przygaszone.
- **Wykonanie:**
  - średnie MAE i MFE w R oraz rozkład MAE zwycięzców, czyli czy SL jest za ciasny;
  - R zostawione na stole przy BE i wcześniejszym zamknięciu (MFE − wynik);
  - najdłuższa seria strat.
- **Porównanie:** backtest kontra Live dla tego samego setupu, obok siebie.
- Statystyki działają dla jednej sesji, kilku sesji i wszystkich trade'ów Backtest. Zwykłe widoki JustJournal (filtr typu) widzą trade'y Backtest jak dziś.

## 14. Rysunek „callout”

[U: „dodaj także do modułu rysunków rysunek callout, inspirować się możesz tym z TradingView”, zrzut z 30.10: ciemny prostokąt z zaokrągleniem, biały pogrubiony tekst, turkusowa ramka, długi ogon zwężający się do punktu]
- Dwa punkty: dymek z tekstem i grot ogona przypięty do czasu i ceny. Oba przeciągane.
- Ustawienia jak w innych rysunkach z tekstem: kolor tła, ramki i tekstu, rozmiar tekstu, pogrubienie. Działa pamięć ostatnich ustawień (`STYLE_KEYS`) i edycja tekstu w miejscu (dwuklik).
- Dostępny **we wszystkich wykresach**, nie tylko w backteście [S]: edytor, podgląd SVG (`geometria.shapes`), miniatury, karty i filmy Udostępnij.
- Paczka rysowania 0.6.2 może nie mieć calloutu, a `lib/drawings.mjs` odrzuca nieznane rodzaje. Budujący sprawdza paczkę. Jeśli callout jest, użyć go. Jeśli nie, dodać własny rodzaj z walidacją w `parseDoc` [B].
- Zasada „bez zaokrąglonych podkładek pod tekstem” z wiedzy firmy nie dotyczy calloutu, bo dymek jest tu samym narzędziem i użytkownik o niego prosił.

## 15. Ustawienia

Nowa zakładka **Ustawienia → Backtest** [S]: skoki (lista, cele, skróty), skróty klawiszowe replayu, domyślna godzina startu, domyślne ryzyko, domyślna szybkość. Synchronizowane przez istniejący blok ustawień, bez sekretów.

## 16. Testy i odbiór

[U: „po zakończeniu prac solidnie przetestuj faktyczne działanie i wygląd modułu”; „upewnij się, że timeframe'y sekundowe będą współgrały”]
- **Jednostkowe** (`node testy/run.mjs`):
  - silnik wypełnień (SL/TP w jednej świecy, luki, limit, stop, częściowe zamknięcie, BE);
  - świeca w budowie dla każdego TF z 1s i 1m, w tym 1s → 5s → 15s → 1m → 5m w tej samej chwili, które muszą się zgadzać (OHLC świecy wyższego TF = agregat niższych do kursora);
  - przejście 1m → 1s o 9:30;
  - brak przyszłości w PDH/PDL, sesjach i newsach;
  - filtr dni (każdy warunek, i/lub/nie, wykluczenia, dni bez danych);
  - idempotencja zapisu do Notion na atrapie;
  - migracja 006 w walidatorze;
  - callout w `parseDoc` i `geometria`.
- **Przeglądarkowe:** strony `testy/*.html` dla replayu (krok, skok, odtwarzanie, dwa wykresy) i progi wydajności z p. 9.
- **Odbiór na żywo:** osobna instancja z kopią `chart-data` i atrapą Notion (wzór: środowisko 4331 z wykresów). Przejście pełnego scenariusza:
  1. utworzenie sesji „CPI 2024” z filtrem;
  2. trzy dni;
  3. trade'y long i short z SL, TP, BE i częściowym zamknięciem;
  4. rysunki z calloutem;
  5. journaling Enter i Esc;
  6. Zakończ dzień → zapis do atrapy Notion;
  7. statystyki.

  Zrzuty w motywie jasnym i ciemnym oraz przy 1, 2 i 4 wykresach, z oceną wyglądu względem reszty dashboardu (visual-reviewer).
- **Przegląd kodu** (code-reviewer) po silniku i replayu oraz przed scaleniem. Security-auditor na nowych trasach zapisu (`guardWrite`).

## 17. Podział pracy i oszczędność tokenów

[U: „skup się w planie także na oszczędności tokenów i przygotuj dobrze plan w celu oszczędności i rozdzielenia pracy na poszczególne czaty, jeśli potrzebne”]
- Plan wykonania = `docs/plany/backtest/00-wspolne.md` (zasady, ścieżki, konwencje, raz czytane) + **karta na pakiet** (`etap-NN.md`: Cel, Przeczytaj — tylko konkretne pliki i linie, Utwórz/zmień, Testy, Gotowe gdy, „nie taguj, nie pushuj”). Nowy czat czyta tylko `00-wspolne.md` i swoją kartę, nie cały ten dokument.
- **Jeden pakiet = jeden agent = jeden czat** (albo kilka pakietów w czacie, dopóki kontekst jest mały). Na końcu pakietu: testy zielone, commit lokalny (po zgodzie), 5–10 linii w `docs/plany/backtest/postep.md` (co zrobione, commit, co otwarte). To jest punkt wznowienia zamiast długiego checkpointu.
- Model według trudności [S]: silnik wypełnień i replay (rdzeń) = Opus. UI, filtr, statystyki i callout = Sonnet. Zrzuty, porównania i proste przeglądy = Haiku. Recenzje kodu = świeży agent, nie autor.
- Agenci oddają raport z priorytetami, nie zrzut plików. Sesja główna nie czyta kodu, tylko raporty i `postep.md`.
- Proponowana kolejność pakietów (do rozpisania w planie):
  - A: API dnia replayu (ES tylko 1m, bez importu ES 1s);
  - B: rdzeń replayu (zegar, świeca w budowie, brak przyszłości) i silnik wypełnień, czyste moduły z testami;
  - C: ekran replayu z jednym wykresem, sterowaniem, skokami i skrótami;
  - D: wiele wykresów, rysunki w replayu, callout;
  - E: journaling, zapis lokalny, Notion, migracja 006;
  - F: tworzenie sesji i filtr dni;
  - G: statystyki;
  - H: odbiór (testy działania i wyglądu, wydajność, review);
  - I: wydanie 1.5.0 (po „ok”).

  Review po B+C i po G.

## 18. Zostawione budującemu [B]

Dokładne formaty plików lokalnych, nazwy modułów i tras API, domyślne skróty klawiszowe (z FX Replay), wybór między kilkoma pozycjami naraz a jedną, zachowanie zleceń po kroku w tył, sposób indeksowania cech dni, rozmiar i miejsce panelu journalingu (w granicach: nie zasłania świec przy kursorze), drobne teksty UI (przez `t()`).

## 18a. Rozstrzygnięcia po recenzji budującego (30.10.2026) [S]

1. **„Brak przyszłości” obowiązuje w UI, nie w API.** Aplikacja jest lokalna, do użytku własnego. Trasa dnia replayu oddaje do przeglądarki cały dzień (kontekst 1m plus okno 1s) jednym zapytaniem, a ukrycie przyszłości zapewnia rdzeń replayu: render, nakładki, statystyki i filtr widzą tylko dane do kursora. Test rdzenia sprawdza, że żaden widok nie dostaje świecy z `t > kursor`.
2. **Jeden zegar, tik bazowy 1 s.** Kursor jest czasem w sekundach. Krok = jedna świeca interwału **aktywnego** wykresu. Wszystkie wykresy przesuwają się do tego samego czasu, a każdy pokazuje swoją świecę w budowie. Gdy aktywny wykres jest sekundowy, a kursor leży poza oknem prawdziwych 1s, krok wynosi 1 min dla wszystkich wykresów.
3. **Pozycje:** najwyżej jedna otwarta pozycja na instrument, ale ES i NQ mogą być otwarte jednocześnie. Ten sam instrument na dwóch wykresach to ta sama pozycja. Panel journalingu pojawia się po pełnym zamknięciu pozycji danego instrumentu. Przy „Zakończ dzień” z otwartą pozycją pada pytanie „Zamknąć po bieżącej cenie?” (wyjście = cena i czas kursora). Zlecenia oczekujące są anulowane. Dojście kursora do końca danych dnia działa tak samo.
4. **Koniec dnia replayu: 16:00 NY.** Po 11:00 replay idzie dalej na 1m. Dzień replayu to dzień handlowy NY. Kontekst wykresu sięga wstecz do poprzednich sesji (1m), zgodnie z istniejącą logiką sesji CME.
5. **Dane ES:** zakup ES 1s w Databento anulowany [U: „Nie potrzebuje narazie tego jednak”, 30.10.2026]. Brak zakupu, brak kodu importu ES 1s i brak STOP-u na Databento. ES w replayu to wyłącznie 1m; dzień puli dla sesji tylko z ES wymaga pokrycia 1m.
6. **Rysunki replayu są per sesja i instrument**, w lokalnym pliku sesji, oddzielone od `drawings-cache` trade'ów Live. Dwie sesje z tym samym dniem się nie mieszają. Migawka przypinana do trade'a przy zamknięciu trafia do jego pola „Rysunki” (w Notion po zapisie).
7. **Typ dnia w statystykach** jest liczony przy liczeniu statystyk z indeksu cech dnia (newsy, OPEX, earningsy, cechy rynku). Nie jest zapisywany na trade'ach, więc działa też dla trade'ów Live i starych wpisów, bez nowych pól w Notion.

## 19. Decyzje użytkownika z rozmowy 30.10.2026 (dosłownie)

- «tylko po zamknięciu, powinno być bardzo łatwe w obsłudze i powinno zapamiętywać rysunki z wykresu, ponieważ tam będą opisy tego trade'a»
- «chciałbym, żebyś dodał także do modułu rysunków rysunek callout»
- «skupiam się na NY open i trade'uję przeważnie maksymalnie do 11 nowojorskiego czasu, więc CPI nie przeszkadza, że nie mam od 8:30 sekundówek»
- «możesz dać dużą swobodę użytkownikowi i powinno to być rozległa funkcja, ale dobrze dopracowana»
- «te warunki to ma być dodatkowa funkcja, nie ma się wyświetlać jako główna. główne mają być takie klasyczne. kolejność dni można sobie wybrać»
- «klasyczne jak w każdym backtestingu przesuwanie o kilka sekund, minut, godzin itp. oraz puszczanie start/stop danej szybkości … powinien mieć on także skrót klawiaturowy»
- «czy dobrą metodą będzie zapis lokalny, a podczas końca sesji na dany dzień przycisk zapisz dane do Notion» (przyjęte z zabezpieczeniami z p. 11)
- «chciałbym mieć funkcję kilku wykresów naraz, np. na jednym ES, a na drugim NQ, lub właśnie różne timeframe'y»
- «dokupujemy» (ES 1s 9:30–11:00 od 2020, tylko z kredytu) [ZASTĄPIONE 30.10.2026 decyzją «Nie potrzebuje narazie tego jednak», niżej]
- «usuń ocenę wykonania, bo nie używam takiego czegoś w ocenie moich trade'ów»
- «akceptuję» (30.10.2026). Akceptacja całego dokumentu, łącznie z sekcją 18a, commitami lokalnymi na `feat/backtest` po każdym pakiecie (push, release i produkcja dopiero po „ok”) oraz (zastąpione, patrz niżej) zakupem ES 1s bez dodatkowego pytania, jeśli wycena ≤ dostępny kredyt.
- «Nie potrzebuje narazie tego jednak» (30.10.2026). Zakup ES 1s anulowany: ES w replayu tylko 1m, bez importu i bez zakupu w Databento.
- «Tak, dodać pola» (30.10.2026). Migracja 006 dodaje też pola „MAE (R)” i „MFE (R)” do bazy trade'ów.
