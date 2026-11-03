# Etap 1.7-4: prawy klik i nawigacja (zlecenia po cenie kliknięcia, krok niezależny od interwału, skok do ceny i do daty)

> Gałąź `feat/1.7-nawigacja` od `feat/1.7-auto-be` (po 1.7-3). Zasady: `00-wspolne.md`, `ZASADY-AGENTOW.md`. Model: `model-pozycji-1-7.md` (tylko konsument: `placeOrder` z dokładkami, `modifyPosition`). Wzór: research §1.1 „Zlecenia z wykresu, prawy klik”, §1.4 „Replay Timestep”, „Go To”, §3.4. Ślad: `postep.md`, sekcja „1.7-4”. Model wykonawcy: Sonnet (UI) + Opus dla trasy wyszukiwania ceny. Review: `code-reviewer` + `security-auditor` (nowa trasa GET z parametrami liczbowymi).

## Słowa użytkownika

- Kolejność pakietów z 1.11.2026: „4 Prawy klik i nawigacja (limit/stop po cenie kliknięcia, krok niezależny od interwału, skok do ceny i do daty)”.
- [U] 31.10.2026 «… nie powinno byc takiego czegos jak koniec dnia, tylko mozesz przesuwac czas tyle ile chcesz a po prostu jest opcja skokow, dzialanie fx replay ma byc wzorem» (K).
- P8 «Kasuj jak FX Replay» dotyczy skoku wstecz do daty, ale wchodzi dopiero w 1.7-6. Do tego czasu skok wstecz to przeglądanie (§C).

## Przeczytaj

Research §1.1 (wiersz „Zlecenia z wykresu, prawy klik” [F8]), §1.4 („Krok”, „Replay Timestep” [F9], „Go To” [F11], „Go To kalendarz” [F10]), §3.4; `public/js/bt-czas.js` 43–170 (`stepSec`, `nextCursor`, `stepCursor`, `jumpTarget`, `DEFAULT_SKROTY`); `public/js/bt-replay.js` 690–840 (`setCursor`, `goTo`, `step`, skoki); `lib/backtest-range.mjs`; `server.mjs` (trasy `/api/backtest/range` i `/bounds`, strażnik `Sec-Fetch-Site`); `public/js/wybor-daty.js` (pole `input[data-wd]`).

## Cel

1. **Prawy klik na wykresie:** menu zleceń po cenie kliknięcia (Kup/Sprzedaj limit lub stop wg strony ceny, market przy cenie bieżącej). Ilość, SL, TP i auto-BE z aktywnego presetu albo z pamięci panelu. Przy otwartej pozycji dochodzą „Dołóż”, „SL tutaj”, „TP tutaj”. Zawsze jest „Skocz do tej ceny”.
2. **Krok niezależny od interwału:** wybór kroku (= wykres, 1s, 5s, 15s, 1m, 5m, 15m) dla przycisków kroku i klawiszy, bez przełączania interwału wykresu.
3. **Skok do ceny:** do pierwszej świecy bazowej, która dotyka ceny, z limitem czasu.
4. **Skok do daty:** wybór daty i godziny NY. W przód: skok. Wstecz: przeglądanie (do 1.7-6).

## Jak to robi FX Replay (research)

| Element | FX Replay | Dowód | My |
|---|---|---|---|
| Prawy klik nad rynkiem | Sell Limit / Buy Stop | DOK [F8] | to samo |
| Prawy klik pod rynkiem | Buy Limit / Sell Stop | DOK [F8] | to samo |
| Prawy klik w spreadzie | „auto-adjusted” | DOK [F8] | ±1 tick od ceny bieżącej: Kup/Sprzedaj market |
| Ilość | pole Quick Buy/Sell; przy 0 bierze 1 z podpowiedzią | DOK [F8] | ilość z panelu/presetu; przy 0 pozycja menu nieaktywna z powodem i „Użyj 1 kontraktu” (jak final P2-5) |
| SL/TP przy prawym kliku | NIEZNANE | — | z aktywnego presetu, inaczej z pamięci panelu |
| Replay Timestep | krok niezależny od interwału, „Sync Timeframe” domyślnie | DOK [F9] | wybór kroku, domyślnie „= wykres” |
| Go To Price | z „Max time to skip forward” | DOK [F11] | limit w dniach handlowych, domyślnie 5 |
| Go To Future Date | skok w przód | DOK [F11] | to samo |
| Go To kalendarz (Alt+G) | tylko widok | DOK [F10] | nasz skok do daty przesuwa replay; widok bez ruchu replayu to zwykłe przewinięcie wykresu |
| SL/TP podczas skoku | NIEZNANE | — | silnik przetwarza każdą świecę po drodze (`goTo` z danymi porcjami, K) |
| Prawy klik za ostatnią świecą | „Go To [data]” | DOK [F11] | w marginesie za ostatnią świecą pozycja „Skocz do daty…” |

## Zachowanie UI

### A. Menu prawego kliku (pole świec aktywnego albo dowolnego wykresu)
- Cena kliknięcia P = `coordinateToPrice(y)` zaokrąglone do ticka 0,25. L = cena bieżąca instrumentu wykresu (`last(k).price`).
- **Bez pozycji:**
  - P > L + tick: `Sprzedaj limit 2 @ 18 310,00 · SL 10 pkt · −400 $` i `Kup stop 2 @ 18 310,00 · …`;
  - P < L − tick: `Kup limit …`, `Sprzedaj stop …`;
  - |P − L| ≤ tick: `Kup market 2`, `Sprzedaj market 2`.
- **Z pozycją Long** (Short odwrotnie):
  - P < L: `Dołóż limit 2 @ P` (pakiet 2); `SL tutaj (−1 200 $ · −0,75R)`, gdy P jest poprawnym SL;
  - P > L: `Dołóż stop 2 @ P`; `TP tutaj (+2 400 $ · +1,50R)`.
  - Zleceń przeciwnego kierunku brak (reguła `opposite-pending`, 1.7-2).
- **Zawsze:** `Skocz do ceny 18 310,00` (gdy P ≠ L) i w marginesie za ostatnią świecą `Skocz do daty…`.
- Opis pozycji pokazuje, skąd wartości: `· preset Scalp` albo `· z panelu`.
- Pozycja nieaktywna ma powód w `title` i drugiej linii (np. „Wpisz SL albo wielkość”, „Ryzyko za małe na ten SL”).
- Cofnięty kursor: pozycje handlowe nieaktywne („Przeglądasz wstecz: handel jest zablokowany”), skoki dostępne.
- Zamknięcie: Esc, klik obok, wybór pozycji. Klawiatura: `role="menu"`, strzałki, Enter, Home/End. Fokus wraca na wykres.
- Menu stoi przy kursorze i nie wychodzi poza wykres (odbicie przy krawędzi).
- **Gdy menu się nie pokazuje (oddaje zdarzenie przeglądarce albo rysunkom):**
  - aktywne narzędzie rysowania;
  - prawy klik na kształcie rysunku;
  - prawy klik na osi ceny albo czasu.
- **Dotyk:** przytrzymanie 500 ms bez ruchu (> 8 px przerywa) otwiera to samo menu. Przy 375 px menu jako arkusz od dołu (jak `wybor-daty`).
- Wybór pozycji menu składa zlecenie przez `placeOrder` / `modifyPosition` z tą samą walidacją co panel. Odrzucenie daje komunikat z `rejectText`.

### B. Krok niezależny od interwału
- W pasku sterowania obok kroków: przycisk `Krok: = wykres ▾` z menu `= wykres · 1s · 5s · 15s · 1m · 5m · 15m · własny…`. „Własny” jak w menu interwałów: `checkCustomTf`.
- Zapis w sesji: `doc.stepTf` (`null` = „= wykres”), przeżywa ponowne otwarcie.
- Kroki (◀ ▶, `Shift+←/→`) przesuwają kursor o jeden krok wybranego interwału: `stepCursor` z `stepTf` zamiast `curTf()`.
- Reguły bez zmian:
  - krok sekundowy poza oknem prawdziwych 1s instrumentu aktywnego wykresu = 1 min (18a.2, K);
  - granice liczone od otwarcia sesji (autoskala 2);
  - przerwy ≥ 30 min pomijane (`skipGap`).
- Wykres 5m z krokiem 15s pokazuje świecę 5m w budowie (jak dziś przy kroku z wykresu 15s).
- Podpowiedź przycisku kroku zawiera aktywny krok: „Krok w przód: 15s (Shift + →)”.
- Odtwarzanie (szybkość) nie zależy od kroku.

### C. Skok do daty
- W menu skoków (M T6) pozycja `Skocz do daty…`, skrót domyślny `G` (nowa akcja `goDate` w `DEFAULT_SKROTY`, kolizje jak inne). Okno: pole daty i godziny NY (`input[data-wd]`, presety 09:00/09:30/10:00/11:00), zakres od startu sesji do końca danych (dni bez świec przekreślone, jak w kreatorze).
- **W przód:** `goTo(t)` przez dane porcjami, gdy jest pozycja lub zlecenie (silnik widzi każdą świecę, SL/TP wykonują się po drodze). Cel w przerwie handlu ląduje na pierwszej świecy po przerwie (`landing`).
- **Wstecz (do 1.7-6):** kursor przechodzi, handel zablokowany jak przy kroku w tył, pasek „Przeglądasz wstecz · Wróć”. Po 1.7-6: przepływ cofnięcia z potwierdzeniem (karta 1.7-6).
- Cel przed startem sesji: przycięty do startu z komunikatem (jak `minCur`).

### D. Skok do ceny
- W menu skoków `Skocz do ceny…` (skrót domyślny `P`, akcja `goPrice`). Okno:
  - pole ceny (domyślnie ostatnia cena kliknięta prawym przyciskiem albo bieżąca);
  - instrument (aktywny wykres);
  - `Maks. [5] dni handlowych` (1–20, zapamiętane w `bt.goPriceDays`).
  - Z menu prawego kliku skok rusza od razu z tym limitem.
- Kierunek z porównania P z L: P > L czeka na `high ≥ P`, P < L na `low ≤ P` (luka przez cenę też się liczy, bo `high`/`low` świecy z luką ją obejmują).
- Wyszukanie po stronie serwera (nowa trasa, §Pliki): pierwsza świeca bazowa instrumentu po kursorze spełniająca warunek, w limicie dni. Wynik: `{ t, end }` albo `{ none: true, until }`.
- Znaleziono: `goTo(end)` (świeca dotknięcia widoczna, kursor na jej końcu). Z pozycją lub zleceniem przez dane porcjami: silnik może po drodze zamknąć pozycję. Wtedy skok i tak dochodzi do celu, a komunikat mówi „Po drodze: SL trafiony 10:42:13”.
- Nie znaleziono w limicie: kursor bez zmian, komunikat „Cena 18 500,00 nie padła do {data} (5 dni)” z przyciskiem „Szukaj dalej (+5 dni)”.
- W trakcie wyszukiwania pasek pokazuje „Szukam ceny…” z przyciskiem „Anuluj” (przerwanie żądania).

## Krawędzie (każda ma test)

1. Prawy klik dokładnie na cenie bieżącej (± 1 tick): market, nie limit.
2. Pozycja Short: P > L daje `Dołóż limit` (sprzedaż limit nad rynkiem) i `SL tutaj`; P < L daje `Dołóż stop` i `TP tutaj`. Test wszystkich kombinacji: 2 kierunki × 2 strony ceny.
3. Preset z TP w R:R, a cena kliknięcia jest wejściem: SL i TP liczone od P (nie od L).
4. Ilość 0 z ryzyka: pozycja nieaktywna z powodem + „Użyj 1 kontraktu”.
5. Prawy klik przy aktywnym narzędziu rysowania lub na rysunku: menu się nie pokazuje (rysunki działają jak dziś).
6. Prawy klik na drugim wykresie (inny instrument) składa zlecenie na instrumencie tego wykresu, nie aktywnego.
7. Krok 15s na wykresie 1m poza oknem 1s: krok 1 min.
8. Krok 7m (własny) od otwarcia sesji: trafia na granice świec 7m (jak autoskala 2).
9. `doc.stepTf` w sesji 1.6.x: brak pola = „= wykres”.
10. Skok do daty w środku weekendu: ląduje na otwarciu niedzieli 18:00 NY.
11. Skok do daty wstecz z otwartą pozycją (do 1.7-6): nic nie znika, handel zablokowany, „Wróć” wraca do `hw`.
12. Skok do ceny z otwartą pozycją, SL po drodze: pozycja zamknięta po SL, trade w sesji i w Notion, kursor na celu, komunikat.
13. Skok do ceny już osiągniętej w świecy w budowie: szukamy od świec zaczynających się po kursorze (świeca w budowie nie jest jeszcze „faktem”).
14. Skok do ceny za koniec danych: `{ none }` z datą końca danych.
15. Trasa wyszukiwania: zła cena, ujemny limit, limit > 20, instrument spoza listy, obca strona → 400/403 (jak `/api/backtest/range`).
16. Przytrzymanie na dotyku z ruchem > 8 px: przewija wykres, menu się nie otwiera.

## Zmiany modelu danych i migracja

- Sesja: `stepTf: string|null` (brak = `null`).
- Ustawienia `bt`:
  - `goPriceDays: 1..20` (domyślnie 5);
  - nowe skróty `goDate: 'G'`, `goPrice: 'P'` w `skroty`. Zapis sprzed 1.7 dostaje je tylko, gdy wolne (reguła J/M).
- Silnik bez zmian.
- Sesje 1.6.x: bez migracji (brak pól = wartości domyślne).

## Notion

Brak zmian. Zlecenia z prawego kliku dają trade'y jak każde inne (marker, idempotencja).

## Pliki

- Zmień:
  - `public/js/bt-wykres.js`: `contextmenu`, przytrzymanie na dotyku, menu, cena kliknięcia, wykluczenia (narzędzie, rysunek, osie);
  - `public/js/bt-zlecenia.js`: `orderAt(price, side, type, k)` (ilość/SL/TP/auto-BE z presetu lub panelu, wejście = P), `levelHere(k, price)`;
  - `public/js/bt-replay.js`: wybór kroku, `doc.stepTf`, okna skoku do daty i ceny, „Szukaj dalej”, anulowanie, komunikaty po drodze;
  - `public/js/bt-czas.js`: `stepCursor` z `stepTf`, `DEFAULT_SKROTY.goDate`/`goPrice`, `sanitizeBt` (`goPriceDays`);
  - `public/js/bt-klient.js`: `findPrice(q, { signal })`;
  - `lib/backtest-range.mjs`: `.findPrice({ instrument, from, price, dir, days })` (odczyt świec bazowych porcjami ≤ 8 dni, tylko lokalne pliki, limit 20 dni);
  - `server.mjs`: `GET /api/backtest/find-price?instrument=&from=&price=&dir=up|down&days=` (strażnik `Sec-Fetch-Site`, walidacja liczb);
  - `public/js/ustawienia.js`: wiersze skrótów;
  - `public/features.css`;
  - `public/i18n/en.json`;
  - `docs/plany/backtest/00-wspolne.md` (trasa, `stepCursor`, ustawienia);
  - `postep.md`.
- Utwórz:
  - `testy/backtest-174-nawigacja.mjs`;
  - `testy/backtest-174-strona.mjs`;
  - `testy/backtest-174.html` (`?part=menu|krok|data|cena|375`).

## Testy napisane najpierw (ślad → `backtest-wyniki/174-czerwone.txt`)

Node:
- `backtest-174: menu prawego kliku: rodzaj zlecenia z ceny kliknięcia (nad, pod, ±1 tick)`
- `backtest-174: menu przy pozycji Long i Short: Dołóż, SL tutaj, TP tutaj, bez przeciwnych`
- `backtest-174: orderAt: SL/TP/ilość z presetu i z panelu, wejście = cena kliknięcia`
- `backtest-174: stepCursor z krokiem 15s, 1m i 7m; sekundy poza oknem 1s = 1 min`
- `backtest-174: findPrice: pierwsza świeca bazowa z dotknięciem, luka, limit dni, koniec danych, bez świecy w budowie`
- `backtest-174: trasa find-price: walidacja i obca strona` (atrapa świec syntetycznych)
- `backtest-174: skróty G i P: domyślne, kolizje, stary zapis dostaje tylko wolne`

Strona:
- `prawy klik: menu nad i pod rynkiem, opis z presetu, Esc, klawiatura`
- `prawy klik przy aktywnym narzędziu rysowania i na rysunku nie otwiera menu`
- `prawy klik na drugim wykresie zleca jego instrument`
- `wybór kroku: Krok 15s na wykresie 5m przesuwa o 15 s, zapis w sesji`
- `skok do daty w przód i wstecz (przeglądanie), weekend`
- `skok do ceny: znaleziono, SL po drodze z komunikatem, nie znaleziono z „Szukaj dalej”, Anuluj`
- `375: przytrzymanie otwiera arkusz menu; ruch przewija`

e2e (kopia świec): skok do ceny 5 dni wprzód z otwartą pozycją (czas ≤ 1,5 s do wyniku, próg z §9 projektu dla skoku). Krok 15s na wykresie 5m, p95 kroku ≤ 16 ms.

## Kryteria odbioru

- `backtest-174:` zielone, pełny przebieg i e2e zielone, przegląd bezpieczeństwa trasy bez P1/P2.
- Zlecenie limit na poziomie = 2 akcje (prawy klik, wybór). Dziś: typ, pole ceny, Kup = 3+ akcje i wpisanie ceny.
- Zrzuty: menu (bez pozycji, z pozycją), wybór kroku, okna skoków. Onyx/Platinum × 1920/375.

## Ryzyka

- **`contextmenu` a LWC i paczka rysowania:** LWC ma własną obsługę zdarzeń (w kodzie paczki LWC występuje `contextmenu`). Rysunki go nie używają. Test kolizji na stronie i przy aktywnych narzędziach.
- **iOS nie wysyła `contextmenu`:** własne przytrzymanie 500 ms na `pointerType = 'touch'`.
- **Koszt wyszukiwania ceny na serwerze:** porcje ≤ 8 dni (limit `read` z K), limit 20 dni, przerwanie żądania. Pomiar w e2e.
- **Skok w przód z pozycją przez wiele dni:** istniejąca ścieżka `goTo` porcjami (K) jest już mierzona. Tu tylko dłuższy zakres.

## Decyzje gustu

- Menu przy pozycji ma „SL tutaj” i „TP tutaj” (FX Replay: NIEZNANE).
- Przy ilości 0 brak cichego 1 kontraktu, zamiast tego „Użyj 1 kontraktu” (zgodnie z final P2-5).
- Krok w sesji (`doc.stepTf`), nie w ustawieniach globalnych. Lista: = wykres, 1s, 5s, 15s, 1m, 5m, 15m, własny.
- Skok do ceny z limitem w dniach handlowych (domyślnie 5, maks. 20), wyszukiwanie na serwerze.
- Skróty domyślne G (data) i P (cena).
- Przytrzymanie 500 ms na dotyku, menu jako arkusz przy 375 px.

## Kroki

- [x] 1: testy (czerwone, ślad)
- [x] 2: trasa `find-price` + `findPrice` + klient
- [x] 3: menu prawego kliku i przytrzymania
- [x] 4: wybór kroku, skoki do daty i ceny, skróty
- [x] 5: pełne testy, e2e, zrzuty, `00-wspolne.md`, `postep.md`, commit lokalny
