# Etap 14: Ustawienia → Wykresy (pakiet H)

Najpierw `00-wspolne.md`.

## Cel
Piąta zakładka „Wykresy” w popoverze Ustawień, klucz `settings.chart` synchronizowany przez Notion (z białą listą), podgląd na żywo. Dane Databento (klucz, limit, rozmiar) tylko lokalne.

## Przeczytaj
- `public/js/ustawienia.js`: 22-31 (`createSettings`, stan `tab`), 32-37 (`previewHtml`), 79-84 (`daneHtml`, wzór `pal-reset`), 86-104 (`ogolneHtml`, wzór `.sp-f`/`.lbl`/`.note`/`.rule-x`), 106-117 (`beHtml`, `be-reset`), 119-125 (`html()`: `.seg.full.sp-tabs`, `tabBtn`), 187-215 (`handle`: `sp-tab`, `pal-reset`, `be-reset`).
- `public/js/app.js`: 66-84 (`loadSettings`: dopisz `chart`), 1498-1512 (`applyRemoteSettings`), 1520-1526 (`collect` sync), 1282 (`createSettings`).
- `public/js/udostepnij.js` 18-31 (`sanitizeShare`: wzór `sanitizeChart`); `lib/sync.mjs` 12 (`SECRET_KEY`), 18-23 (`sanitizeSettings`); `public/js/palety.js` 82-100 (kontrast, `fixContrast`).
- `testy/run.mjs` 685-770 (test synchronizacji ustawień na atrapie), 159-168 (test `sanitizeShare`).
- `lib/candles.mjs` i trasy z etapu 4 (zapis klucza, limit kosztu, rozmiar `chart-data/`).

## Utwórz / zmień
- `public/js/styl-wykresu.js` (domyślne `settings.chart`, `sanitizeChart` z białą listą kluczy i wartości, generator 40 świec syntetycznych deterministyczny), `public/js/ustawienia.js`, `public/js/app.js` (`loadSettings`, `collect`, `applyRemoteSettings`, `saveSettings`), `lib/sync.mjs` (`SECRET_KEY` + `key|databento`), przeniesienie stanu nakładek z etapu 10 do `settings.chart`, `public/styles.css` (jeśli trzeba), `public/i18n/en.json`, `testy/wykresy-14.mjs`.

## Zawartość zakładki (na start)
- Podgląd na górze: `podglad.js` w trybie `mini` na 40 syntetycznych świecach z poziomem wejścia i wyjścia, odświeżany po każdej zmianie, bez sieci (jak `.pv` w zakładce Kolory).
- Wygląd: styl wykresu (Świece / Linia zamknięć), kolory świec (Z palety / Własne per motyw Onyx i Platinum, z ostrzeżeniem o kontraście „słaby kontrast 2,1:1” i „Popraw” = `fixContrast`, hex jak `settings.custom`). Siatka pozioma wł. Poziomy trade'a: wejście i wyjście wł.; SL i TP wł. w podglądzie, wył. w kartach. Nakładki: tło sesji i godziny sesji (domyślnie jak w etapie 10), PDH/PDL (wył.).
- Karty i filmy: wykres ceny w kartach i filmach (P15: domyślnie WŁĄCZONY), styl wykresu w karcie (jak w podglądzie / własny), krzywa kapitału na kartach okresu (wł.), film: domyślny format (9:16), długość (10 s), czarno-białe (wył.), przyciemnienie (0,6). BEZ opcji dźwięku (P21).
- Dane (tylko lokalne, NIE w `settings`): klucz Databento (zapis do `.env`, sprawdzenie bezpłatnym `get_cost` na 1 minutę), limit kosztu jednego pobrania (1 USD, `config.local.json`), rozmiar `chart-data/` + „Usuń pobrane świece” (rysunków nie rusza).
- Licencje (tekst): atrybucja TradingView (pełna treść NOTICE, link do https://www.tradingview.com/), licencja paczki rysowania, Databento i CME, notka o prawach do filmów tła.
- „Przywróć domyślne” (`.btn.ghost.sm`) na końcu każdej grupy przywraca tylko swoją grupę.
- Reszta opcji z p. 3.13 („później”: knoty, siatka pionowa, oś cen lewa, prostokąty pozycji, domyślny kolor rysunków) NIE jest robiona.

## Testy najpierw (`wykresy-14:`)
- `sanitizeChart`: nieznane klucze i złe wartości odrzucone (w tym klucze z prototypu), brak klucza = domyślne.
- Synchronizacja na atrapie Notion: blok ustawień zawiera `chart`, NIE zawiera klucza Databento ani limitu kosztu (test na tekście bloku); `sanitizeSettings` nie gubi dotychczasowych kluczy ustawień (regex `key` nie może zjadać `custom`, `palette`, `share` itd.).
- „Przywróć domyślne” per grupa; kontrast własnego koloru liczony funkcją palety, „Popraw” podnosi do progu; podgląd `mini` przerysowuje się bez żądań sieciowych.
- Ręcznie (zrzuty ≤ 4): 1920 i 375 px, Onyx i Platinum; pięć zakładek mieści się przy 375 px (jeśli nie: krótsza etykieta albo przewijanie segmentu, decyzja gustu).

## Gotowe, gdy
Zakładka wygląda jak Kolory i Wynik BE; zmiana na jednym urządzeniu widoczna na drugim (atrapa).

## Nie rób
Nie wysyłaj klucza ani limitu do Notion. Nie dodawaj opcji spoza listy „start”. Nie twórz nowego systemu kontrolek.

## Fakty
- `SECRET_KEY` (`lib/sync.mjs` 12) łapie `token|secret|password|haslo|hasło|pin`, nie „key”; dopisz `key|databento` (R21). Decyzja mechaniczna.
- Limit kosztu w `config.local.json` (pieniądze i urządzenie); decyzja gustu 31.
