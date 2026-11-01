# Etap N5 i N6: kopie i przywracanie z UI, pierwsze kroki v2

> Gałąź `feat/backtest-ciagly` (po N1–N4 i poprawkach po review, 6401d02). Zasady: `00-wspolne.md`, `CONTRIBUTING.md`. Specyfikacja: `R:/PROJEKTY/trading-hq-wt/backtest-wyniki/N-pierwsze-kroki-ustawienia.md` (§1 pierwsze kroki dziś, §3.4 `backups/` i `dashboard.log`, §4.3 makieta „Kopie i diagnostyka”, §4.5 pierwsze kroki po zmianie, §4.6 test połączenia, §5, §6 N5/N6, „Decyzje użytkownika (31.10.2026)”). Ślad: `postep.md`, sekcje „N5” i „N6”. Wydanie: 1.6.0.

## Słowa użytkownika (31.10.2026)

- «oraz zaktualizuj wyglad pierwszych krokow w journalu oraz modul ustawien zreworkuj na o wiele zrozumialszy i czyterlniejszy i dopracowny. dodaj miejsca gdzie mozna sterowac polaczeniami zrodel plikow np dla historii swiec i gdzie beda zapiosywane, po prostu rzeczy ktore dla osoby bez ai beda ciezkie do polaczenia. przemysl cale to»
- Na 9 rekomendacji: «Przyjmuję wszystkie». W kodzie: `// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja N: …)` w osobnym wierszu.
- Kredyt: «Wpisz tylko u mnie» (w kodzie i testach nie ma liczb kredytu właściciela).

Decyzje dotyczące N5 i N6: 3 (nowa instalacja bez kredytu), 4 (okno 1s NQ domyślnie wyłączone u nowych), 7 (usuwania kopii baz z UI nie ma), 8 (przywracanie Notion z kopii z UI po wpisaniu „TAK”), 9 (restart i zatrzymanie zawsze widoczne).

## N5: kopie i przywracanie z UI

Serwer `lib/kopie.mjs` (`createBackups`), logika kopii i planu bez zmian (`lib/backup.mjs`: `backupAll`, `planRestore`, `applyRestore`):
- `GET /api/backups`: folder, lista kopii (najnowsza pierwsza: nazwa, data, wersja aplikacji, schemat, rozmiar, liczby wpisów w bazach, powód: aktualizacja / ręczna / przed przywróceniem), stan zadania, słowo potwierdzenia;
- `POST /api/backups/create`: kopia teraz (zadanie w tle, postęp po bazach);
- `POST /api/backups/preview { name }`: podgląd przywracania bez zapisu (liczby stron i pól, wpisy z nazwami pól, do 200 pozycji);
- `POST /api/backups/restore { name, confirm }`: tylko po podglądzie tej samej kopii i po wpisaniu „TAK” (EN: „YES”); najpierw kopia bieżącego stanu (powód „przed przywróceniem”), potem świeży plan i zapis z postępem; po zapisie odświeżenie danych dashboardu;
- nazwy kopii tylko z listy (wzorzec znacznika czasu, katalog z `manifest.json`, nie dowiązanie), nigdy ścieżka z żądania; odpowiedzi bez tokenu, identyfikatorów baz i ścieżek plików kopii;
- blokada: `busyReason()` (aktualizacja, tworzenie dziennika, kopia katalogu, pobieranie świec) blokuje kopię i przywracanie, a zadanie kopii blokuje restart, zatrzymanie i aktualizację; brak usuwania kopii.

UI: Ustawienia → Kopie i diagnostyka → „Kopie baz Notion”: lista z „Podgląd przywracania”, „Utwórz kopię teraz”, postęp, podgląd (co się zmieni), potwierdzenie wpisaniem słowa, wynik z nazwą kopii bezpieczeństwa.

## N6: pierwsze kroki v2

- Przebieg świeżej instalacji: Witaj → Połącz Notion → Strona → Dziennik → Dane rynkowe (opcjonalny) → Gotowość → Gotowe. Ścieżki „kod” i „mam dziennik” też przechodzą przez Dane rynkowe (klucze są na komputer). Skonfigurowana instalacja: Witaj → Gotowość → Gotowe.
- Dane rynkowe: te same karty co w Ustawieniach → Źródła danych (moduł `ust-zrodla.js`, `wizardHtml()`): Databento z „Zapisz i sprawdź”, „Testuj”, stanem kredytu do wpisania i wyjaśnieniem kosztów, okno 1s NQ z potwierdzeniem kosztu; FRED i Finnhub; „Pomiń”.
- Gotowość w 4 grupach (Ten komputer, Notion, Dane rynkowe, Aktualizacje), każda z jednym statusem, szczegóły rozwijane (zwinięte, gdy zielone); grupa Dane rynkowe z serwera (`market` w `/api/health/full`, bez sieci): klucz Databento, kredyt (brak, wygasł, wygasa w 30 dni), kolejka zablokowana, wolne miejsce < 2 GB, FRED i Finnhub. Pigułka „Wymaga uwagi” obejmuje ostrzeżenia danych rynkowych.
- Gotowe: bez automatycznego przejścia, przyciski „Pokaż przewodnik”, „Dodaj pierwszy trade”, „Usuń dane DEMO” (jeśli są), „Przejdź do dashboardu”.
- Wygląd w stylu dashboardu (karty, kropki stanu, typografia sekcji Ustawień), 375 px bez poziomego przewijania.
- Rotacja `dashboard.log` (`lib/log-rotacja.mjs`): przed otwarciem logu (`Dashboard.vbs`, `start.sh`, `lib/restart.mjs`) plik ponad 5 MB przechodzi w `dashboard.1.log` (najwyżej 3 pliki).
- Przewodnik: krok „Ustawienia” i nowe kroki zgodne z sekcjami; zrzuty `docs/img/pierwsze-kroki-*.png` z instancji testowej (DEMO na atrapie, bez nazwy komputera, ścieżek profilu i fragmentów kluczy).
- Instalator `Instaluj.cmd` / `install.sh`: przejrzane teksty, poprawione niejasne.

## Kroki

- [x] N5-0: karta (ten plik)
- [x] N5-t: testy N5 czerwone przed kodem (`backtest-wyniki/N5-czerwone.txt`)
- [x] N5-a: `lib/kopie.mjs` + trasy `/api/backups*`, blokady, walidacja nazw, bez sekretów
- [x] N5-b: UI w `ust-diag.js`: lista, „Utwórz kopię teraz”, podgląd, potwierdzenie „TAK”, postęp, wynik
- [x] N5-c: teksty PL (humanizer, pl-copy), EN w `en.json`, README (kopia i przywracanie z UI)
- [x] N5-d: testy zielone, commit N5, `postep.md`
- [x] N6-t: testy N6 czerwone przed kodem (`backtest-wyniki/N6-czerwone.txt`)
- [x] N6-a: `lib/log-rotacja.mjs` + wywołania w `Dashboard.vbs`, `start.sh`, `lib/restart.mjs`
- [x] N6-b: grupa `market` w `fullCheck` (bez sieci)
- [x] N6-c: kreator: krok Dane rynkowe (karty z `ust-zrodla.js`), Gotowość w 4 grupach, ekran Gotowe bez automatycznego przejścia, nowe teksty, wygląd
- [x] N6-d: przewodnik, instalator, README, zrzuty `docs/img`
- [x] N6-e: pełne testy (`N6.txt`), e2e (`N6-e2e.txt`), zrzuty `backtest-wyniki/N6/`, `postep.md`, commit N6

## Bezpieczeństwo

- Każdy nowy POST przez `ACTIONS` (`guardWrite`), ciało do 64 KB, nazwa kopii tylko z listy.
- Przywracanie wyłącznie przez `applyRestore` (niczego nie usuwa, nie zmienia schematu); przed zapisem kopia bieżącego stanu.
- Testy przywracania tylko na atrapie Notion.

## Zrzuty

`backtest-wyniki/N6/`: każdy krok kreatora, Gotowość, Gotowe, sekcja Kopie (lista, podgląd, potwierdzenie) × Onyx / Platinum × 1920 / 375. Instancja testowa na atrapach, katalog `R:/PROJEKTY/trading-hq-wt/backtest-wyniki/N6/tmp/JustJournal` (bez nazwy użytkownika w ścieżce), fałszywe klucze atrap.
