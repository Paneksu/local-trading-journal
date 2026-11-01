# Etap N3 i N4: Dane na dysku i Źródła danych

> Gałąź `feat/backtest-ciagly` (po N2, 7bf0ded). Zasady: `00-wspolne.md`, `CONTRIBUTING.md`. Specyfikacja: `R:/PROJEKTY/trading-hq-wt/backtest-wyniki/N-pierwsze-kroki-ustawienia.md` (§3 tabele kluczy, §4.2–4.4 sekcje i przenoszenie katalogu, §4.6 test połączenia, §5 bezpieczeństwo i restart, §6 N3/N4, „Decyzje użytkownika (31.10.2026)”). Ślad: `postep.md`, sekcje „N3” i „N4”. Wydanie: 1.6.0.

## Słowa użytkownika (31.10.2026)

- Na 9 rekomendacji: «Przyjmuję wszystkie». W kodzie: `// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja N: …)` w osobnym wierszu.

Decyzje dotyczące N3 i N4:
1. Klucze Databento, FRED i Finnhub w Ustawieniach z „Testuj” i „Usuń”; zapis wyłącznie do `.env` przez serwer, nigdy do Notion ani localStorage; maska z 4 ostatnimi znakami.
2. Z UI: zmiana limitów wydatków Databento, korekta stanu kredytu, import historii 1m i okien 1s z wyceną i potwierdzeniem kwotą, bez podnoszenia twardych sufitów (100 USD limit, 125 USD kredyt, 50 USD import 1m, 36 USD okna 1s).
3. Nowa instalacja bez kredytu, dopóki użytkownik go nie wpisze; stan kredytu właściciela usunięty z kodu. Po review (31.10.2026, Słowa użytkownika: «Wpisz tylko u mnie»): migracja nikomu nie wpisuje kredytu; właścicielowi wpisze go ręcznie sesja główna przy wydaniu.
4. Codzienne okno 1s NQ domyślnie wyłączone w nowych instalacjach; u obecnych (istniejący `config.local.json`) zostaje włączone (ta sama migracja).
6. Przenoszenie katalogu danych: kopia → sprawdzenie → przełączenie → restart; stary katalog zostaje.
7. Usuwanie świec z UI tak (wpisanie nazwy warstwy), kopii baz nie.

## Migracja domyślnych wartości (decyzje 3 i 4, po review: «Wpisz tylko u mnie»)

`lib/config-migracje.mjs` → `upgradeDefaults(config, { firstRun })`, wołane raz przy starcie serwera, znacznik `config.defaultsUpgraded = '1.6.0'` (drugi start nic nie zmienia):
- instalacja istniejąca (plik `config.local.json` był przed startem) bez `chartNq1sDaily` → zapis `chartNq1sDaily: true` (działa jak dotąd; bez wpisanego kredytu i tak nic nie pobierze);
- kredytu migracja nie wpisuje nikomu: nowa i istniejąca instalacja bez `chartCredit` widzi „Kredyt Databento nie jest wpisany”, a płatne pobieranie czeka na wpis w Ustawieniach → Źródła danych;
- nieczytelny `config.local.json` jest odkładany jako `config.local.json.corrupt-<czas>`, start traktuje instalację jak nową (bez migracji), diagnostyka pokazuje nazwę kopii;
- instalacja z terminala (`setup.mjs`) zapisuje znacznik w nowym pliku (okno 1s wyłączone).
Zero liczb kredytu właściciela w kodzie i testach (test `backtest-N4 poprawki: migracja nie wpisuje nikomu kredytu…`).

## Kroki

- [x] N3-0: karta (ten plik)
- [x] N3-t: testy N3 czerwone przed kodem (`backtest-wyniki/N3-czerwone.txt`)
- [x] N3-a: `lib/dysk.mjs`: przegląd katalogu danych (świece per symbol i warstwa 1m / 1s / kontrakty z zakresem dat i rozmiarem, sesje, newsy, earningsy, rysunki w kolejce, kopie, wolne miejsce na dysku), `GET /api/disk`
- [x] N3-b: usuwanie warstwy świec (`POST /api/disk/candles/delete`, potwierdzenie wpisaniem „NQ 1m”), blokada w trakcie pobierania, unieważnienie pokrycia i indeksu dni, wycięcie warstwy z kolejki
- [x] N3-c: przenoszenie katalogu (`POST /api/disk/move` sprawdzenie / kopia, `GET /api/disk/move/status`, `POST /api/disk/move/cancel`, `POST /api/disk/move/switch` → `config.dataDir` + restart), walidacja ścieżki (bezwzględna, bez `..`, bez UNC, realpath, poza katalogiem aplikacji i obecnym katalogiem danych, nie systemowa, pusta albo nieistniejąca), kopia z postępem, sprawdzenie sumami SHA-256, stary katalog zostaje
- [x] N3-d: start serwera z `config.dataDir` (brak katalogu → domyślny + ostrzeżenie), „Otwórz folder” tylko dla ścieżek serwera (dane, świece, sesje, kopie, log, poprzedni katalog), restart zablokowany w trakcie kopii i importu
- [x] N3-e: UI `ust-dysk.js`: katalog z wolnym miejscem, tabela świec (lista przy 375 px) z „Usuń…”, sesje z liczbą bez kopii w Notion, newsy i earningsy, rysunki, kopie (bez usuwania), przenoszenie z postępem i „Przełącz i uruchom ponownie”
- [x] N3-f: testy zielone, commit N3, `postep.md`
- [x] N4-t: testy N4 czerwone przed kodem (`backtest-wyniki/N4-czerwone.txt`)
- [x] N4-a: migracja domyślnych (`lib/config-migracje.mjs`), kredyt bez wartości domyślnej (`no-credit`), okno 1s NQ `=== true`, komunikaty kierują do Ustawień zamiast do `config.local.json`
- [x] N4-b: `GET /api/sources` (klucze tak/nie + 4 ostatnie znaki, limity, kredyt, kolejka z powodem, import, sufity), `POST /api/sources/key` (zapis po bezpłatnym teście, usunięcie), test FRED i Finnhub jednym zapytaniem (`news.testKey`, `earnings.testKey`) w `POST /api/diag/test`, `saveEnv` usuwa linię przy `null`
- [x] N4-c: UI `ust-zrodla.js`: karty Databento, FRED, Finnhub (stan, maska, Testuj, Usuń klucz, zmiana klucza), limity z potwierdzeniem przy podniesieniu, kredyt z potwierdzeniem, włączenie okna 1s z potwierdzeniem kosztu, kolejka z powodem czekania, import 1m i okien 1s: wycena → wpisanie kwoty → pobranie z postępem
- [x] N4-d: rozcięcie Newsów i Earningsów: klucz i stan w Źródłach danych, wagi, klasy, karty i ręczne wyjątki w Wykresach
- [x] N4-e: pełne testy (`N4.txt`), e2e (`N4-e2e.txt`), zrzuty `backtest-wyniki/N4/` (Źródła danych i Dane na dysku, Onyx i Platinum, 1920 i 375; katalog tymczasowy bez nazwy użytkownika, fałszywe klucze), `postep.md`, commit N4

## Bezpieczeństwo (§5.1)

- Każdy nowy POST przez `ACTIONS` (czyli `guardWrite`), ciało do 64 KB, walidacja typów i list dozwolonych wartości.
- Klucze nie wracają do przeglądarki (poza 4 ostatnimi znakami), nie trafiają do logu ani komunikatów błędów (`scrubSecrets`, `scrub` klientów FRED i Finnhub), nie są częścią `settings` ani bloku ustawień w Notion.
- `.env` zapisywany atomowo (plik tymczasowy + zmiana nazwy, `0o600`), inne linie i komentarze zostają.
- Ścieżki: „Otwórz folder” i usuwanie działają tylko na katalogach znanych serwerowi; ścieżka celu przeniesienia przechodzi walidację i `realpath`.
- Pieniądze: serwer zostawia dotychczasowych strażników (`confirm: true` przy kredycie, `confirmedCostUsd`, `limitsOverrideUsd` ≤ 50, budżet okien 1s ≤ 36, kredyt startowy ≤ 125, limity 0,01–100); UI nie ma drogi obejścia.

## Decyzje gustu (N3, N4)

Wypisane w `postep.md` (sekcje „N3” i „N4”).

## Zrzuty

`backtest-wyniki/N4/`: `zrodla`, `zrodla-import`, `dysk`, `dysk-przenies` × Onyx / Platinum × 1920 / 375 (16 plików). Dashboard testowy na atrapach Notion, Databento i Finnhub, katalog `R:/PROJEKTY/trading-hq-wt/n4-zrzuty/JustJournal` (bez nazwy użytkownika w ścieżce), fałszywe klucze testowe atrap; skrypt poza repozytorium: `R:/PROJEKTY/trading-hq-wt/n4-narzedzia/zrzuty-N4.mjs`.
