# Etap 15: styl „Linia zamknięć” w podglądzie, miniaturach i edycji (pakiet H)

Najpierw `00-wspolne.md`.

## Cel
Drugi styl wykresu obok domyślnych świec: linia zamknięć, wybierana w Ustawieniach → Wykresy (etap 14), działająca w podglądzie SVG, miniaturach i edycji LWC. Rysunki zostają w miejscu przy zmianie stylu.

## Przeczytaj
- `public/js/styl-wykresu.js` (etap 14: domyślne i `sanitizeChart`).
- `public/js/geometria.js` (etap 6: `candleShapes`, skale); `public/js/podglad.js` (etap 7/11: warstwa świec, tryb `mini`); `public/js/wykres.js` (etap 8: tworzenie serii).
- `public/styles.css` 336-350 (klasa `svg .eq-line` jako wzór linii `--chart-line`).
- `testy/zgodnosc-rysunkow.html` (etap 6): rozszerzysz o linię.

## Utwórz / zmień
- `public/js/styl-wykresu.js` (transformacja: `close` każdej świecy, luki zostają lukami), `public/js/geometria.js` (`lineShapes(points, scales)`), `public/js/podglad.js` (ścieżka `.close-line`), `public/js/wykres.js` (`LineSeries` zamiast `CandlestickSeries` przy stylu linii), `public/styles.css` (`svg .close-line`: `fill: none; stroke: var(--chart-line)`), `testy/zgodnosc-rysunkow.html`, `testy/wykresy-15.mjs`.
- Styl odczytywany z `settings.chart` (jedno miejsce, bez własnych przechowalni).

## Testy najpierw (`wykresy-15:`)
- Transformacja `close`: długość i kolejność, luki zostają lukami (brak sztucznych punktów).
- `candleShapes` i `lineShapes` dla obu stylów; te same współrzędne przy tych samych skalach (świece vs linia ten sam X).
- Test zgodności z LWC rozszerzony o linię (tolerancja 1 px, w przeglądarce headless z etapu 6; brak przeglądarki: „pominięty”).
- Grep: brak literałów kolorów w `styl-wykresu.js`, `geometria.js`, `podglad.js`.
- Ręcznie (zrzuty ≤ 4): przełączenie stylu w Ustawieniach zmienia podgląd, miniatury (lista) i edycję bez przeładowania; rysunki w tym samym miejscu.

## Gotowe, gdy
Przełączenie stylu działa we wszystkich trzech miejscach, testy zielone, pełny przebieg pakietu H zielony.

## Nie rób
Nie dodawaj pozostałych sześciu stylów (puste świece, OHLC, obszar, schodkowa, baza, Heikin-Ashi): są w „Później”. Nie zmieniaj ceny na wykresie (Heikin-Ashi zmieniałby OHLC). Nie dodawaj nowego renderera.

## Fakty
- Typy serii LWC 5 (`LineSeries`, `CandlestickSeries`): WYWNIOSKOWANE z dokumentacji, sprawdź w tym etapie (krok 1: mały spike w przeglądarce headless).
- Domyślnie wszędzie wypełnione świece w kolorach palety (P18); linia zamknięć to wygląd z inspiracji LiquidJournal jako OPCJA, nie domyślny wygląd.
- Rysunki są kotwiczone w czasie i cenie, więc zmiana stylu ich nie rusza.
