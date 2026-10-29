# Etap 9: rysunki w Notion (`public/js/rysunki.js`, serwer, cache, pakiet E)

Najpierw `00-wspolne.md`.

## Cel
Pasek 7 narzędzi w trybie edycji, zapis rysunków do właściwości `rich_text` „Rysunki” trade'a (JSON w kawałkach po 2 000 znaków), odczyt, cache offline. Rysunek z edycji widać w podglądzie w tym samym miejscu.

## Przeczytaj
- `lib/writes.mjs` 10-24 (`PAGE_ID_RE`, `sameId`), 168-202 (`createWriter`/`writePage`: PATCH, `data.invalidate()`, kontrola, że strona należy do bazy Trade'y).
- `server.mjs` 515-550 (jak zrzuty mają WŁASNY limit `readJson` przez dopasowanie `sh`: wzór dla `POST /api/drawings/save` z limitem 256 KB), 552-572 (trasy GET), 293-300 (`ACTIONS`).
- `testy/atrapa-notion.mjs` 274-306 (`applyProps`/`newPage`) oraz obsługa `GET/PATCH /v1/pages/:id` (grep `'/v1/pages'`).
- `public/js/wykres.js` (etap 8), `public/js/app.js` 114-132 (`ICON`, styl ikon SVG), `public/js/modal.js` (`toast`).
- `public/vendor/lightweight-charts-drawing/…es.js`: tylko przez `import()` w Node/przeglądarce, nie czytaj pliku.

## Utwórz / zmień
- `public/js/rysunki.js`, `lib/writes.mjs` (`drawings(tradeId, json)`), `server.mjs` (`POST /api/drawings/save`, `GET /api/drawings/:tradeId`), `lib/candles-store.mjs` albo nowy mały moduł dla cache `chart-data/drawings-cache/<tradeId>.json` (`{ at, json, pending }`), `testy/atrapa-notion.mjs` (limity), `public/i18n/en.json`, `testy/wykresy-09.mjs`.
- Atrapa Notion (zmiana obowiązkowa): `rich_text` ma przechowywać KAŻDY kawałek osobno (dziś `applyProps` skleja w jeden), a odrzucać: `text.content` > 2 000 → 400 `validation_error`, tablica > 100 → 400, ciało > 500 KB → 413.

## Format i zasady
- Treść: `{"v":1,"lib":"0.6.2","at":"<ISO>","d":[…exportJSON…]}` bez spacji. Cięcie na kawałki po 2 000 znaków przez `Array.from` (nie po bajtach), po stronie SERWERA; jedno `PATCH /v1/pages/:id` z tylko tą właściwością.
- Limit: > 190 000 znaków odrzucony komunikatem „Za dużo rysunków na tym trade'zie ({n} z 190 000 znaków). Usuń część rysunków, zanim zapiszesz.” (zero żądań do Notion). Licznik zajętości w legendzie paska od 80% (`--fg-2`), przy 95% `--warn`.
- Debounce 2 s po ostatnim `change` (i od razu przy zamknięciu widoku); najwyżej jeden zapis w toku i jeden w kolejce (najnowszy stan).
- Walidacja serwera: `PAGE_ID_RE`, `JSON.parse`, `v === 1`, `parseDrawings` paczki (działa w Node), limit rozmiaru. Zły JSON przy odczycie → wykres bez rysunków + komunikat, cache nietknięty.
- Awaria Notion (offline, 429 po ponowieniach) → zapis do cache z `pending:true`, komunikat „Zapisano lokalnie, wyślę do Notion”; następne otwarcie lub zapis najpierw wysyła zaległy stan. Przy odczycie wygrywa nowszy `at`. Konflikt dwóch urządzeń: ostatni zapis wygrywa.
- Pasek (7): linia pozioma, trend, prostokąt, FVG (preset prostokąta: wypełnienie `--be` ~12%, `rectMiddleLine` przerywana = CE 50%), Fibonacci (0/0,5/0,618/0,705/0,79/1), tekst (małe `input` w miejscu kliknięcia po zdarzeniu `textEdit`), pozycja long/short z R. Przyciski `.icon-btn` z ikonami w stylu `ICON`; na telefonie pasek zwija się do jednego przycisku „Rysuj”. Domyślny kolor rysunku `--chart-line` przez `setDefaultStyleOverride`. Ctrl+Z: stos migawek `exportJSON()` po `gestureEnd` (~30 linii). Esc/Delete/Shift (45°) z paczki.
- Rysunki NIE idą w `/api/data` (etap 5 pomija rolę `drawings`).

## Testy najpierw (`wykresy-09:`)
- JSON 5 000 znaków → 3 kawałki, sklejenie identyczne; polskie znaki na granicy kawałka; dokładnie 190 000 → zapis (95 kawałków); 190 001 → odrzucenie, zero żądań do Notion; atrapa nigdy nie dostaje kawałka > 2 000 ani tablicy > 100.
- Zły `v`, zły identyfikator, śmieci w `parseDrawings` → 400; awaria atrapy → cache `pending`, następny zapis wysyła zaległy stan; 10 zdarzeń `change` w 1 s → jedno PATCH (fałszywy zegar); odczyt 100 kawałków (R11).
- Ręcznie (zrzuty ≤ 4): 7 narzędzi, FVG z CE, Ctrl+Z, rysunek widoczny w podglądzie w tym samym miejscu, odtworzenie po zmianie TF i przeładowaniu, styl z tokenów.

## Gotowe, gdy
Rysunek wraca po restarcie serwera i po skasowaniu cache.

## Nie rób
Nie pisz do prawdziwego Notion. Nie zapisuj rysunków w `/api/data` ani `settings`. Nie dodawaj narzędzi poza 7. Nie zwiększaj limitu 190 000.

## Fakty
- Limity Notion: `text.content` ≤ 2 000, tablica ≤ 100 (=200 000 znaków), żądanie ≤ 500 KB, ~3 żądania/s, 429 z `Retry-After` obsługuje `lib/notion.mjs` 21-25. CZĘŚCIOWE.
- Rozmiary: typowy trade 5-20 rysunków = 2-8 tys. znaków (1-4% limitu); maksimum ~475 rysunków przy 400 znakach (Szacunek). Żądanie przy maksimum ≈ 230-250 KB < 500 KB (Szacunek), stąd limit `readJson` 256 KB.
- Odczyt 100 kawałków przez API strony niesprawdzony na prawdziwym Notion (R11): ręczny test użytkownika przed wydaniem = pytanie w raporcie, nie wykonuj.
