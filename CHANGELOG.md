# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/), wersje: [semver](https://semver.org/).

## [1.2.2] · 2026-10-26

### PL
- Dodane: dodawanie zrzutów ekranu do trade'a z dashboardu: wybór pliku (na telefonie z galerii lub aparatu), przeciągnij i upuść oraz wklejenie ze schowka (Ctrl+V). Przycisk „Dodaj zrzut” jest w podglądzie trade'a i w formularzu edycji, miniatura pojawia się od razu. PNG, JPEG, WebP lub GIF do 10 MB (darmowy plan Notion: 5 MB, limit odczytywany z przestrzeni roboczej); zrzut trafia do Notion jako obraz na końcu strony trade'a, a zrzuty z pola „Zrzut” zostają nietknięte. Wymaga uprawnienia integracji „Insert content”. Usuwanie zrzutów zostaje w Notion.
- Skutek uboczny: dashboard pokazuje teraz we wszystkich trade'ach także obrazy wklejone ręcznie w treść strony trade'a w Notion (np. z telefonu), nie tylko te z pola „Zrzut” i z dashboardu. Dzięki temu zrzut dodany na jednym urządzeniu jest widoczny na drugim. Strony są skanowane w tle (do 3 naraz) i zapamiętywane do następnej zmiany strony, więc pierwsze uruchomienie po starcie może chwilę dociągać zrzuty z treści stron.

### EN
- Added: adding screenshots to a trade from the dashboard: file picker (gallery or camera on a phone), drag and drop, and paste from the clipboard (Ctrl+V). The "Add screenshot" button is in the trade detail view and in the edit form, and the thumbnail shows up immediately. PNG, JPEG, WebP or GIF up to 10 MB (free Notion plan: 5 MB, the limit is read from the workspace); the screenshot goes to Notion as an image at the end of the trade page, and screenshots in the "Screenshot" property stay untouched. Needs the integration's "Insert content" capability. Removing screenshots stays in Notion.
- Side effect: the dashboard now also shows, for every trade, images pasted by hand into the trade page body in Notion (e.g. from a phone), not only those from the "Screenshot" property and from the dashboard. This makes a screenshot added on one device visible on another. Pages are scanned in the background (up to 3 at a time) and remembered until the page changes, so right after a start the screenshots from page bodies may take a moment to appear.

## [1.2.1] · 2026-10-26

### PL
- Poprawione: dashboard działający na starszym kodzie niż pliki na dysku (np. po `git pull` bez restartu) nie oferuje już wersji, która jest na dysku, i nie twierdzi, że aktualizacja jest niedostępna. Pokazuje komunikat „Pliki są już w wersji …, ale dashboard działa na starszej” i przycisk „Uruchom ponownie” (pigułka w pasku statusu, Ustawienia → Aktualizacje).
- Poprawione: okno „Co nowego” pomija obrazki i HTML z notatek wydania (zamiast surowego tekstu), ukrywa linię `---` i sumę kontrolną wydania, a przy obrazkach dodaje wskazówkę, że zrzuty są na stronie wydania.

### EN
- Fixed: a dashboard running older code than the files on disk (e.g. after `git pull` without a restart) no longer offers the version that is already on disk, nor claims the update is unavailable. It shows "The files are already at version …, but the dashboard is running an older one" and a "Restart" button (status bar pill, Settings → Updates).
- Fixed: the "What's new" window skips images and HTML in the release notes (instead of raw text), hides the `---` line and the release checksum, and adds a hint that screenshots are on the release page when images were present.

## [1.2.0] · 2026-10-26

### PL
- Udostępnianie wyników jako obraz: karta z jednego trade'a, dnia, tygodnia, miesiąca albo roku. Formaty 9:16, 4:5, 1:1 i 16:9, wynik w R, $ albo % konta, tło z motywu (Onyx lub Platinum) albo własne zdjęcie. Pobierz PNG, kopiuj do schowka lub udostępnij z telefonu. W Ustawieniach pole „Nick do podpisu”.
- Nowa nazwa: JustJournal (wcześniej Trading HQ / Local Trading Journal). Repozytorium na GitHubie, adres, ustawienia zapisane w Notion i aktualizacje działają bez zmian; instalator zastępuje stary skrót na pulpicie nowym.

### EN
- Share results as an image: a card for a single trade, day, week, month or year. 9:16, 4:5, 1:1 and 16:9 formats, result in R, $ or % of the account, theme background (Onyx or Platinum) or your own photo. Download PNG, copy to the clipboard or share from a phone. A "Signature nickname" field in Settings.
- New name: JustJournal (formerly Trading HQ / Local Trading Journal). The GitHub repository, its address, the settings stored in Notion and updates work as before; the installer replaces the old desktop shortcut with the new one.

## [1.1.0] · 2026-10-26

### PL
- „Kolejne urządzenie”: kod przeniesienia z PIN-em (AES-256-GCM, PBKDF2, ważny 15 minut, jednorazowy, 5 prób) albo plik `.ltj`; w kreatorze wybór „Mam już dziennik na innym urządzeniu”.
- Synchronizacja ustawień (paleta, marginesy BE, język, motyw, aktualizacje) przez zwinięty blok na stronie głównej w Notion; wygrywa ostatnia zmiana, filtry zostają na urządzeniu.
- Lista urządzeń w Ustawieniach ze zmianą nazwy i instrukcją odłączenia.
- Migracja 002 dodaje blok ustawień do istniejących dzienników (na końcu strony, bez zmian w innej treści).
- Saldo konta liczone rollupem „P&L trade'ów” (API Notion odrzuca map() po relacji w formułach).

### EN
- "Another device": a transfer code with a PIN (AES-256-GCM, PBKDF2, valid 15 minutes, single use, 5 attempts) or a `.ltj` file; the wizard offers "I already have a journal on another device".
- Settings sync (palette, BE margins, language, theme, updates) through a collapsed block on the Notion home page; the latest change wins, filters stay per device.
- Device list in Settings with rename and disconnect instructions.
- Migration 002 adds the settings block to existing journals (at the end of the page, nothing else changes).
- Account balance computed with a "Trades P&L" rollup (the Notion API rejects map() over relations in formulas).

## [1.0.0] · 2026-10-26

### PL
Pierwsze publiczne wydanie.
- Dashboard statystyk tradingowych na danych z Notion: KPI, krzywa kapitału i spadki, kalendarz P&L, heatmapa dni, rozbicia (setup, instrument, sesja, dzień, kierunek), godzina wejścia, czas trwania, kolejny trade w dniu, rozkład R.
- Trade'y, konta prop i wpisy finansowe dodawane i edytowane z dashboardu (zapis do Notion), zakładki Trade'y, Prop i Galeria.
- Instalator `setup.mjs`: gotowa strona w Notion z 4 bazami, relacjami, formułami i widokami, opcjonalne wpisy DEMO (`--remove-demo`).
- Aktualizacje bez utraty danych: kopia baz, `git pull --ff-only` albo wydanie z GitHuba ze sprawdzeniem sumy, migracje tylko dodające; moduł aktualizacji w dashboardzie z restartem.
- Kopia i przywracanie (`restore.mjs`, domyślnie podgląd).
- „Pierwsze kroki”: sprawdzenie gotowości instalacji i przewodnik po dashboardzie na przykładowych danych.
- Interfejs po polsku i angielsku, motywy Onyx i Platinum, palety danych (także dla daltonistów).
- Pola szukane po rolach i identyfikatorach, więc zmiana nazwy pola w Notion niczego nie psuje.

### EN
First public release.
- Trading statistics dashboard on Notion data: KPIs, equity curve and drawdowns, P&L calendar, day heatmap, breakdowns (setup, instrument, session, weekday, direction), entry time, duration, nth trade of the day, R distribution.
- Trades, prop accounts and finance entries added and edited from the dashboard (saved to Notion); Trades, Prop and Gallery tabs.
- `setup.mjs` installer: a ready Notion page with 4 databases, relations, formulas and views, optional DEMO entries (`--remove-demo`).
- Updates without data loss: database backup, `git pull --ff-only` or a GitHub release with checksum verification, add-only migrations; in-dashboard update module with restart.
- Backup and restore (`restore.mjs`, preview by default).
- "Getting started": installation readiness check and a guided tour on sample data.
- Polish and English UI, Onyx and Platinum themes, data palettes (including colour-blind friendly).
- Properties are found by role and ID, so renaming a property in Notion breaks nothing.
