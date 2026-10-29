# Etap 5: migracja 003 i pola w Notion (pakiet C)

Najpierw `00-wspolne.md`.

## Cel
Pięć nowych pól w bazie Trade'y (ceny wejścia/wyjścia, SL, TP, rysunki) przez addytywną migrację; odczyt i zapis cen w dashboardzie; formularz ma nowe pola.

## Przeczytaj
- `migrations/001-pole-wyjscie.mjs` (cały, 10 l.) jako wzór; `lib/migrate.mjs` 12-41 (reguły, dozwolone tylko `addProperty/addOption/addView/addPageBlock`).
- `lib/workspace.mjs` 69-83 (`ensureProperty`, idempotencja po roli i nazwie), `lib/roles.mjs` 10-27 (role Trade'y).
- `schema/notion-schema.json` 3 (`schemaVersion`) i ok. 84 (pole `exit` jako wzór definicji); `lib/version.mjs` 18.
- `lib/data.mjs` 73-81 (`normalizePage`: iteruje po WSZYSTKICH rolach, dlatego `drawings` trzeba pominąć), `public/js/stats.js` 13-50 (`normalizeTrades`).
- `lib/writes.mjs` 25-83 (`kit`: pomocniki `number`, `text`), 84-138 (`buildTradeProps`).
- `public/js/form.js` 32-35 (wartości domyślne/edycji), 77-93 (pola), 125-145 (zbieranie i walidacja).
- `testy/run.mjs` 27-55 (test migracji), 795-822 (test migracji 002: wzór na atrapie i `--migrate-only --dry-run --json`); `testy/atrapa-notion.mjs` 18-43 (schematy), 274-306 (`applyProps`).

## Utwórz / zmień
- `migrations/003-poziomy-rysunki.mjs` (`version: 3`): 4× `addProperty` typu `number`: role `entryPrice` „Cena wejścia”/„Entry price”, `exitPrice` „Cena wyjścia”/„Exit price”, `sl` „SL”, `tp` „TP”; 1× `rich_text`: rola `drawings` „Rysunki”/„Drawings”.
- `schema/notion-schema.json`: `schemaVersion: 3` i te pola w Trade'ach (nowe instalacje).
- `lib/roles.mjs`: pięć ról `optional: true` (nazwy PL/EN).
- `lib/data.mjs`: `normalizePage` pomija rolę `drawings` (rysunki nie idą w `/api/data`, nie rośnie lista trade'ów).
- `public/js/stats.js`: `entryPrice`, `exitPrice`, `sl`, `tp` w `normalizeTrades` (liczby albo `null`; puste nie psują statystyk).
- `lib/writes.mjs`: walidacja cen (liczby, zakres, puste = brak zmiany/czyszczenie); `public/js/form.js`: cztery pola liczbowe; `public/i18n/en.json`; `testy/atrapa-notion.mjs` jeśli potrzeba pól w schemacie; `testy/wykresy-05.mjs`.

## Testy najpierw (`wykresy-05:`)
- Test „migracje” z `run.mjs` zielony (tylko dozwolone operacje); idempotencja (drugi przebieg bez zmian); zero naruszeń w `/__test/violations`.
- Instalacja PL i EN dostaje 5 pól; zapis i odczyt cen przez atrapę; `/api/data` nie zawiera `drawings`; puste pola nie psują statystyk; i18n.
- R4: strefa czasu trade'a: `data.mjs` bierze z Notion `date.start`, zapis ustawia `time_zone`; test na atrapie z `time_zone`, poprawka odczytu jeśli znaczniki wejścia się przesuwają (CZĘŚCIOWE, API do sprawdzenia).
- `node update.mjs --migrate-only --dry-run` na atrapie pokazuje 5 pól.

## Gotowe, gdy
`node testy/run.mjs wykresy-05` + `migracje` + `i18n` zielone, pełny przebieg zielony.

## Nie rób
Nie zmieniaj ani nie usuwaj istniejących pól, widoków (dozwolone tylko `addView`). Nie zapisuj rysunków (etap 9). Nie rób zapisu do prawdziwego Notion.

## Do sprawdzenia (mechaniczne, wynik do raportu)
Czy API widoków pozwala ukryć pole „Rysunki” w nowych instalacjach (WYWNIOSKOWANE). Jeśli nie: README (etap 12) opisze ukrycie ręczne („•••” → Properties → oko).

## Fakty
- `rich_text` w Notion: `text.content` ≤ 2 000 znaków, tablica ≤ 100 elementów (=200 000 znaków), żądanie ≤ 500 KB, ~3 żądania/s. CZĘŚCIOWE (dokumentacja).
- `schemaVersion` instalacji rośnie po pełnej migracji (`lib/migrate.mjs` 65).
- `size` w `roles.mjs` to rozmiar KONTA (baza Konta), nie pozycji; nie wiąż go z cenami trade'a.
