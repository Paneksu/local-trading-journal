# Etap I: wydanie 1.5.0 i migracja 006 na prawdziwym Notion

Model: **Sonnet**. Tylko po „ok” użytkownika (każdy punkt STOP osobno). Najpierw `00-wspolne.md`.

## Cel
Wydanie 1.5.0 według `CONTRIBUTING.md` (sekcja „Wydanie nowej wersji”), aktualizacja produkcyjnej instalacji z migracją 006 (kopia → dry-run → „ok”). Zakupu ES 1s nie ma (anulowany 30.10.2026).

## Przeczytaj
- `CONTRIBUTING.md` 43-60 (wydanie, `narzedzia/suma-wydania.mjs`), `CHANGELOG.md` 1-40 (format sekcji PL i EN).
- `postep.md` (wszystkie wpisy: lista funkcji do CHANGELOG, otwarte P2/P3).

## Zadanie 1: przygotowanie wydania (bez „ok” wolno, tylko lokalnie)
- [ ] `package.json` `version: "1.5.0"`; sekcja `CHANGELOG.md` 1.5.0 (PL i EN): moduł Backtest (replay, zlecenia, journaling, sesje z filtrem, kilka wykresów, statystyki, zapis do Notion), rysunek callout, migracja 006 (pola „Sesja backtestu”, „MAE (R)”, „MFE (R)”).
- [ ] `node testy/run.mjs` zielony (do pliku `backtest-wyniki/I.txt`), commit `przygotowuje wydanie 1.5.0`.
- [ ] **STOP 2 (wydanie):** raport do sesji głównej: lista zmian, wynik testów, hash. Czekasz na „ok”.

## Zadanie 2: po „ok” na wydanie
- [ ] Merge `feat/backtest` → `main`, `git tag v1.5.0`, `git push origin main --tags`, `node narzedzia/suma-wydania.mjs v1.5.0`, release na GitHubie z linią `tree-sha256: …` na końcu (stopka PR/release według reguł repo).

## Zadanie 3: migracja 006 na prawdziwym Notion (STOP 1)
- [ ] Dry-run bez zapisu: w worktree (kod 1.5.0) `THQ_CONFIG_DIR=R:/PROJEKTY/trading-hq node update.mjs --migrate-only --dry-run --json` (tylko odczyt konfiguracji produkcji i Notion; ten sam mechanizm stosuje `update.mjs:97`). Oczekiwane: trzy nowe pola w Trade'y („Sesja backtestu”, „MAE (R)”, „MFE (R)”), nic więcej. Wynik do raportu.
- [ ] **STOP:** czekasz na „ok” użytkownika.
- [ ] Po „ok”: aktualizacja produkcji `node update.mjs` w `R:/PROJEKTY/trading-hq` (sama robi kopię 4 baz do `backups/<data>/` PRZED pobraniem i migracją: `update.mjs:132-140`; kopia nieudana = nic nie zmienione). Ścieżka kopii i wynik migracji do raportu. Potem test w aplikacji: jeden trade Backtest z replayu → strona w Notion z polami sesji, MAE (R) i MFE (R) (potwierdza użytkownik).

## Gotowe, gdy
1.5.0 opublikowane z sumą drzewa, produkcja zaktualizowana, migracja 006 (trzy pola) zastosowana po „ok”.

## Nie rób
Niczego z zadań 2–3 bez słów użytkownika „ok” dla danego punktu. Nie kupuj ani nie importuj danych ES 1s.
