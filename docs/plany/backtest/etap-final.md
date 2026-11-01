# Etap final: poprawki końcowe przed wydaniem 1.6.0

Źródła: `backtest-wyniki/final/review-kod.md` (7/10), `review-bezpieczenstwo.md` (8,5/10), `review-wyglad.md` (7,5/10, zrzuty `final/zrzuty/`).
Zasady: `00-wspolne.md`. Ślad ✗ → ✓ i wyniki: `postep.md`, sekcja „final”.

## Decyzje użytkownika (1.11.2026)

- [x] Kredyt właściciela. Słowa użytkownika: «Usuń z bieżących plików». Liczby (start, data ważności, wydane) usunięte ze wszystkich bieżących plików repo (docs, plany, `postep.md`, komentarze, testy, w tym `testy/scen-N4.js`); opis migracji zgodny z kodem; test-strażnik obejmuje `.html` i `.md` oraz start kredytu 125 w kontekście `chartCredit`/kredytu (bez fałszywych trafień `CREDIT_MAX_USD`). Historia gita bez zmian.
- [x] Statusy. Słowa użytkownika: «Tak, ujednolić na tekst z kropką». Wszystkie statusy w Backtest, Ustawieniach i pierwszych krokach (`.warnb`, „TO URZĄDZENIE” itp.) jako tekst w kolorze stanu z kropką, bez zaokrąglonego tła; przyciski i kafle zostają.

## Kod (review-kod.md)

- [x] P1-1 test C2 MAE/MFE: znaczniki klatek od `performance.now()`; 3 pełne przebiegi zielone.
- [x] P2-1 `/api/disk/move/switch` przez `busyReason()`; `/api/setup/token` (z `replace`) i `/api/setup/connect` 409 w trakcie kopii lub przywracania; test.
- [x] P2-2 przywracanie: znacznik podglądu kasowany na początku każdej próby; podgląd zwraca token ważny kilka minut, wymagany przez przywrócenie (też bezp. P3-2); `previewed = null` w `finally`; odświeżenie dashboardu po częściowym zapisie; mapa stare id → nowe id, w planie i podglądzie już odtworzone wpisy dostają aktualizację zamiast duplikatu; test przerwania na atrapie.
- [x] P3-1 rotacja logu zaczyna od przemianowania bieżącego pliku; przy blokadzie nic nie kasuje; test.
- [x] P3-2 `en.json` (i `wykresy-swiecowe.md`): bez samotnego CR, LF, `git add --renormalize`.
- [x] P3-3 `Instaluj.cmd`: kod wyjścia winget i wersja Node po instalacji.
- [x] P3-5 asercje „bez sekretów i ścieżek” (N5) i `rotateLog`: czerwone na celowo zepsutym kodzie (bez commitu zepsutego).

## Bezpieczeństwo (review-bezpieczenstwo.md)

- [x] P3-1 przywracanie odrzuca kopię z innego dziennika (`dataSourceId`); takie kopie oznaczone na liście; tekst UI bez obietnicy „da się cofnąć”.
- [x] P3-2 zgoda z podglądu przywiązana do świeżego planu (razem z kod P2-2).
- [x] P3-3 `.gitignore`: `dashboard.*.log`, `config.local.json.corrupt-*` (także `PROTECTED` w updaterze).
- [x] P3-4 liczby kredytu (decyzja wyżej).

## Wygląd (review-wyglad.md)

- [x] P1-1 pole ceny Limit/Stop mieści całą cenę (1920 i 375).
- [x] P1-2 błąd klucza w całości (status jako tekst z kropką).
- [x] P1-3 pole „Nowy folder danych” na całą szerokość (`sp-key`).
- [x] P1-4 wykres na 375 px co najmniej ~45vh przy każdym stanie panelu; stopka `.bt-msg` najwyżej 2 linie.
- [x] P1-5 kontrast licznika zakładki szuflady (AA).
- [x] P2-1 linie ceny wejścia, SL i TP pozycji z etykietą na osi cen (jak zlecenia).
- [x] P2-2 podgląd ryzyka pod Kup/Sprzedaj, 13 px, kwota ryzyka w kolorze straty.
- [x] P2-3 jeden komunikat Notion z listą brakujących pól.
- [x] P2-4 kolumna akcji szuflady przyklejona do prawej przy 375.
- [x] P2-5 „Użyj 1 kontraktu” przy „Ryzyko za małe”.
- [x] P2-6 etykiety pól Skoków.
- [x] P2-7 „schemat baz 6” → zrozumiały tekst.
- [x] P2-8 krok Dane rynkowe: zdanie „co tracisz”, część pod „Więcej (opcjonalne)”, „Wstecz”.
- [x] P2-9 wersja: podbija sesja główna przy wydaniu (`package.json` bez zmian).
- [x] P3 podwójny nagłówek „Aktualizacje”.
- [x] P3 skróty jako „Shift + →”.
- [x] P3 „Wróć do sesji” wraca do sesji (z listy: „Wróć do listy sesji”).
- [x] P3 „Nowa sesja” nieaktywna bez świec, z powodem.
- [x] P3 w pełni kryjące tło Journala.
- [x] P3 „Wstecz” w krokach Strona i Dziennik, bez auto-przejścia kroku Strona.
- [x] P3 Ustawienia przy 1920: maks. szerokość z centrowaniem albo druga kolumna (decyzja gustu).

## Zamknięcie

- [x] Zrzuty zmienionych ekranów (Onyx, Platinum, 1920, 375) do `backtest-wyniki/final/po/` ze spisem, nazwa komputera i użytkownika zamaskowane.
- [x] `node testy/run.mjs` 3× z rzędu → `final/po-1.txt`, `po-2.txt`, `po-3.txt`; e2e → `final/po-e2e.txt`.
- [x] Sprzątanie: `final/inst-c/`, `final/inst-c2/`, sesje „Przegląd…” w `backtest-dane` (31.10/1.11).
- [x] Wpis „final” w `postep.md`, commity lokalne.
