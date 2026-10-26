# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/), wersje: [semver](https://semver.org/).

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
