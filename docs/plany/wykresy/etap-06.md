# Etap 6: geometria rysunków i test zgodności z LWC (pakiet D, Opus)

Najpierw `00-wspolne.md`. Ten etap jest fundamentem wyglądu: błąd tu rozjeżdża podgląd i edycję.

## Cel
`public/js/geometria.js`: czyste funkcje zamieniające rysunek (JSON paczki) i świece na kształty, wspólne dla SVG (podgląd) i canvasu (karty). Test zgodności z LWC z tolerancją 1 px, bez zależności.

## Przeczytaj
- `public/vendor/…` (etap 0): tylko `index.d.ts`-owe wnioski z tej karty; pliku 306 KB nie czytaj, odpytuj go w Node (`buildNewDrawing`, `parseDrawings`) i wypisz tylko kształt JSON-a.
- `public/js/charts.js` 39-70 (skale `X(i)`, `Y(v)`, marginesy: wzór skal podglądu).
- `testy/udostepnij-podglad.html` (cały, 141 l.): wzór strony roboczej; serwer serwuje `testy/*.html` pod `/__testy/` tylko gdy `THQ_TEST_PAGES=1` (`server.mjs` 575-578).

## Utwórz / zmień
- `public/js/geometria.js`, `testy/zgodnosc-rysunkow.html`, `testy/przegladarka.mjs`, `testy/wykresy-06.mjs`.
- Eksporty (decyzja K0, mechaniczna): `shapes(drawing, scales)`, `candleShapes(candles, scales, style)`, `markerStyle(background)`, skale po indeksie świecy i po cenie. `lineShapes` dodaje etap 15.

## Zasady
- Oś X po INDEKSIE świecy: `x(i) = prawaKrawędź - (ostatniIndeks - i + prawyMargines) × odstęp`; luki nocne i brak sekund się zwijają. Punkt rysunku z czasem `t` trafia na świecę, która go zawiera; czas za ostatnią świecą liczony przyszłymi indeksami co interwał. Skala ceny liniowa z marginesami jak domyślne `scaleMargins` LWC.
- Siedem narzędzi: linia pozioma (krawędź do krawędzi), trend (`extendLeft/Right`), prostokąt (z `rectMiddleLine` = linia CE w FVG), Fibonacci (`levels` z rysunku albo domyślne 0/0,5/0,618/0,705/0,79/1), tekst (kotwica + treść), pozycja long/short (dwa prostokąty + linia wejścia). Rysunek innego rodzaju: pominięty z licznikiem (legenda: „1 rysunek widoczny tylko w trybie edycji”).
- `markerStyle(background)` (P19): `'theme'` → `'text'` (kreska + kropka + etykieta samym tekstem, bez podkładki); `'photo'` i `'video'` → `'pill'` (białe pigułki z ząbkiem). Podgląd, edycja, miniatury zawsze `'theme'`.
- Zero literałów kolorów w pliku.

## Testy najpierw (`wykresy-06:`)
- Node: skala po indeksie (luki się zwijają), punkt wewnątrz świecy trafia na tę świecę, punkty w przyszłości, skala ceny z marginesami, kształty 7 narzędzi (Fibonacci z poziomami z rysunku i domyślnymi, prostokąt z CE, pozycja long/short), nieznany rodzaj pominięty z licznikiem, `candleShapes` (korpus/knot, kierunek up/down), `markerStyle` dla `theme/photo/video`, grep: brak `#[0-9a-f]{3,6}` i `rgb(`.
- Krok 1: `testy/przegladarka.mjs` bez zależności: zainstalowany Chrome/Edge `--headless=new --virtual-time-budget=10000 --dump-dom` na adresie z `start-test`, wynik z DOM (`<pre id="wynik">PASS/FAIL …</pre>`); brak Chrome/Edge → „pominięty”, nie błąd (flagi: WYWNIOSKOWANE, sprawdź w tym kroku).
- Zgodność: strona tworzy wykres LWC na syntetycznych świecach i dla każdego z 7 narzędzi porównuje punkty z `geometria.js` ze współrzędnymi z `timeToCoordinate()`/`logicalToCoordinate()`/`priceToCoordinate()`; tolerancja 1 px. Skale SVG dostają parametry odczytane z LWC (odstęp świec, prawy margines, dwa punkty skali ceny): test sprawdza geometrię, nie kadr.

## Gotowe, gdy
Testy zielone w Node i w przeglądarce (albo „pominięty” z adnotacją w raporcie).

## Nie rób
Nie pisz rendererów (etap 7). Nie dodawaj narzędzi poza 7. Nie używaj Playwrighta w testach z `run.mjs`.

## Fakty
- Paczka rysowania 0.6.2: `parseDrawings` przyjmuje wynik `buildNewDrawing` i odrzuca zły kształt; `rectMiddleLine`, `stopLevel`, `profitLevel`, `accountSize`, `riskPercent` (WYWNIOSKOWANE z `index.d.ts`). Rysunki kotwiczone na świecy z czasem `t` i przyszła oś (changelog 0.6.1/0.6.2: WYWNIOSKOWANE).
- Rozmiary JSON: linia pozioma 150 znaków, trend 178, prostokąt 177, Fibonacci 183, tekst 169, pozycja long 184. PRZETESTOWANE.
