# Etap F2: filtr dni (zaawansowane) w kreatorze, licznik na żywo, szablony

Model: **Sonnet**. Review po pakiecie: brak. Najpierw `00-wspolne.md`.

## Cel
§12 [U]: «te warunki to ma być dodatkowa funkcja, nie ma się wyświetlać jako główna». Sekcja „Filtr dni (zaawansowane)” w kreatorze sesji, domyślnie zwinięta: grupy warunków i / lub / nie, licznik pasujących dni i ich lista na żywo z ręcznym wyrzuceniem dnia, dni bez danych wypisane z powodem, szablony filtrów (lokalnie i w bloku ustawień). Typ dnia z filtra w górnym pasku replayu.

## Przeczytaj
- `public/js/bt-kreator.js` (C1: formularz klasyczny, miejsce `// F2`), `public/js/bt-filtr.js` (`COND_KINDS`, `matchDays`, `dayTags`), `lib/backtest-index.mjs` (kształt `DayFeatures`, nagłówek).
- `public/js/ustawienia.js` 330-345 (wzór kontrolek `.seg`, `.check`, `.sp-in` w popoverze).
- `grep -n "name:" lib/news-katalog.mjs | head -40` (nazwy wydarzeń do listy „konkretne wydarzenie”).

## Pliki
- Zmień: `public/js/bt-kreator.js`, `public/js/bt-replay.js` (typ dnia w pasku), `public/js/ustawienia.js` (lista szablonów w zakładce Backtest: usuń, zmień nazwę), `public/features.css`, `public/i18n/en.json`.
- Utwórz: `public/js/bt-filtr-widok.js`, `testy/backtest-F2-kreator.mjs`, `testy/backtest-kreator.html`.

## Interfejsy
- Consumes: `GET /api/backtest/days` (F1), `evalFilter`, `matchDays`, `orderDays`, `dayTags` (F1, C1), ustawienia `bt.templates` (00-wspolne).
- Produces: `mountFilterEditor(host, { filter, days, instruments, onChange(filter) }) → { value(), destroy() }`; definicja sesji z `def.filter` i `def.excluded`; `dayTypeLabel(features, filter) → string` (np. „CPI 8:30”) dla paska.

## Zadanie 1: edytor filtra
- [x] **Strona** `testy/backtest-kreator.html` (indeks z ręcznymi `DayFeatures`) + **testy** `testy/backtest-F2-kreator.mjs`:
  - `backtest-F2: sekcja domyślnie zwinięta` — po otwarciu kreatora formularz klasyczny widoczny, „Filtr dni (zaawansowane)” zwinięty (`aria-expanded="false"`); sesja bez rozwijania ma `filter: null`.
  - `backtest-F2: grupy warunków` — lista warunków pogrupowana: Kalendarz, Newsy, Wygasanie, Earningsy, Rynek (z dopiskiem „liczone z danych przed 9:30”); dodanie warunku, przełącznik i/lub grupy, „nie” przy warunku i grupie, grupa zagnieżdżona.
  - `backtest-F2: licznik na żywo` — każda zmiana warunku aktualizuje licznik „Pasujące dni: N” i listę w ≤ 100 ms przy 1 500 dniach (pomiar na stronie testowej); bez zapytań do serwera przy zmianie warunku (indeks pobrany raz na zakres dat i instrumenty).
  - `backtest-F2: ręczne wyrzucenie dnia` — „×” przy dniu przenosi go do wykluczonych (`reason: 'manual'`), „przywróć” cofa.
  - `backtest-F2: dni bez danych z powodem` — lista „Wyłączone” z powodem „brak sekund 9:30–11:00 dla ES” itp.; zero pasujących dni → przycisk „Utwórz” wyłączony z notką.
  - `backtest-F2: szablony` — „Zapisz jako szablon” zapisuje `{ name, filter }` w `bt.templates`; wybór szablonu wypełnia edytor; szablon przeżywa `sanitizeSettings`.
  - `backtest-F2: typ dnia w pasku` — dzień CPI w sesji z filtrem CPI → pasek pokazuje „CPI 8:30”; sesja bez filtra → `dayTags` dnia (najwyżej 2 etykiety).
  - `backtest-F2: 375 px` — kreator bez poziomego przewijania (szerokość dokumentu ≤ 375).
- [x] `node testy/run.mjs backtest-F2` → FAIL; zaimplementuj `bt-filtr-widok.js` (kontrolki dashboardu: `.seg`, `.check`, `.sp-in`, `.btn`, lista wydarzeń z katalogu newsów); testy zielone.

## Zadanie 2: zamknięcie
- [x] Pełny przebieg; commit `dodaje filtr dni w kreatorze sesji`; wpis w `postep.md`. Zrzuty: najwyżej 2 (kreator z rozwiniętym filtrem 1920 Onyx, 375 Platinum).

## Gotowe, gdy
Sesję „CPI 2024” da się utworzyć filtrem (wydarzenie CPI, rok 2024) i ma tylko dni CPI z 1s; licznik działa na żywo; `backtest-F2:` zielone.

## Uwaga z review C2 (sanitizeSettings, głębokość)
`sanitizeSettings` (`lib/sync.mjs`) przepuszcza max 6 poziomów zagnieżdżenia, głębiej wstawia `null`. Szablony filtra `settings.bt.templates[i].filter.<drzewo>` mogą zostać ucięte, gdy drzewo warunków jest głębokie. F2 musi albo ograniczyć głębokość drzewa filtra (z komunikatem w UI), albo przechowywać szablon jako tekst JSON (string do 500 znaków też jest ucinany: sprawdzić limit), albo świadomie podnieść limit w `sanitizeSettings` wraz z testem na głębokim drzewie. Test: szablon o głębokości > 6 przechodzi synchronizację bez zmian.
