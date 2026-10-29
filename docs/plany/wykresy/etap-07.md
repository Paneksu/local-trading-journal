# Etap 7: podgląd SVG w szczegółach trade'a (pakiet D, Opus)

Najpierw `00-wspolne.md`. Wygląd = identyczny z resztą dashboardu (krzywa kapitału `charts.js`).

## Cel
Własny renderer SVG (`public/js/podglad.js`): świece, osie, poziomy, rysunki tylko do odczytu, TF, przesuwanie i przybliżanie, dymek OHLC, stany „brak świec/źródła”. Wejście: przełącznik „Zrzuty | Wykres” w lightboxie.

## Przeczytaj
- `public/js/charts.js` 1-16 (`niceTicks`), 17-38 (`placeTip`, `ensureTip`), 39-108 (`drawEquity`: siatka, osie, krzyżyk, dymek, obsługa zdarzeń).
- `public/styles.css` 336-362 (klasy wykresów, `.tip`, `.legend`) i 457-462 (`.lb` NADPISUJE `--profit/--loss/--be/--fg/--fg-2/--float/--popover/--line` na ciemne wartości z `--lb-*`: CSS w `.lb` dostaje je automatycznie).
- `public/js/app.js` 1100-1160 (`lbEl`, markup `.lb`), 1159-1190 (`showLightbox`), 1214-1240 (`openDetail`), 37 i 63-66 (`UI_KEY`, `loadUi`; wzór `localStorage` w try/catch).
- `public/js/format.js` (formatery liczb/dat), `public/features.css` 124-135 (`.lb-*`).
- `lib/candles.mjs` (etap 4): kształt odpowiedzi `/api/candles`. `public/js/geometria.js` (etap 6).

## Utwórz / zmień
- `public/js/podglad.js`; `public/styles.css` (klasy `.candle.up/.down`, `.wick`, `.lvl.entry|exit|sl|tp`, `.pos-profit`, `.pos-loss`, `.roll`, `.sess.*`, `.pdh`, `.drw`); `public/js/app.js` (przełącznik `.seg` „Zrzuty | Wykres” w `lb-info`/`lb-frame`, trade bez zrzutu i ze świecami otwiera się od razu na „Wykres”; w „Wykres” `bindShots` ma `isActive` = false, przycisk „Dodaj zrzut” ukryty); `public/i18n/en.json`; `testy/wykresy-07.mjs`.
- Podgląd działa na wspólnym stanie `{ tf, fromIndex, toIndex }` i tablicy świec (etap 8 przejmie ten sam stan).

## Zachowanie (decyzje planu)
- Kadr startowy: wejście −2 h do wyjścia +1 h (brak wyjścia: wejście +2 h); TF startowy `1m` zapamiętany w `localStorage` (try/catch). Przełącznik `.seg.sm` `15s 1m 5m 15m 1h 4h 1D` + pole „Własny” (ten sam parser co serwer).
- Przesuwanie (mysz, jeden palec) i przybliżanie (kółko, pinch); dociąganie z `GET /api/candles` (lokalne). Brak świec: karta `.empty` „Brak świec ES dla …” + `.btn.primary` „Sprawdź koszt” → `confirmDialog` (`public/js/modal.js`) → pasek postępu; bez klucza link do Ustawień; EURUSD/XAUUSD: „Brak źródła danych dla tego instrumentu”; trade po `availableEnd`: „Świece z tej sesji będą dostępne ok. …”.
- Powyżej 1 500 świec w kadrze podgląd sam podnosi TF wyświetlania (etykieta „wyświetlane 5m (wybrano 1m)”). Rysowane tylko świece w kadrze + po 1 ekranie zapasu, aktualizacja w `requestAnimationFrame`.
- Poziomy wejścia/wyjścia/SL/TP z pól trade'a (SVG), prostokąty zysku/straty pozycji, znacznik zmiany kontraktu (przerywana linia + etykieta), rysunki z JSON (bez edycji). Znaczniki: `markerStyle('theme')`.
- Pod wykresem wyciszone linijki (`--fg-2`, `--t-xs`): „Świece dostępne do: <data, godzina w strefie przeglądarki>” oraz „Wykres: TradingView Lightweight Charts™” z linkiem do https://www.tradingview.com/ (atrybucja P3; LWC jest w edycji, ale linijka jest zawsze).
- Oś czasu w strefie przeglądarki (`Intl`), bez przesuwania znaczników czasu.

## Testy najpierw (`wykresy-07:`)
- Jednostkowo: wybór świec w kadrze (z zapasem); podniesienie TF > 1 500 świec i etykieta; grep `podglad.js` bez `#[0-9a-f]{3,6}\|rgb\(` (=0).
- Ręcznie (zrzuty ≤ 4): 1920 i 375 px, Onyx i Platinum: świece, poziomy, prostokąty pozycji, znacznik rolowania, rysunki z JSON, TF, przeciąganie, kółko, dymek, stany pustych; płynność przy 1 500 świecach (zmierz, wpisz do raportu). Zmiana motywu/palety zmienia wygląd bez JS.

## Gotowe, gdy
Zrzuty wyglądają jak `charts.js`; testy zielone; brak poziomego przewijania przy 375 px.

## Nie rób
Żadnego canvasu, LWC ani rysowania/edycji. Żadnych kolorów w JS. Nie wołaj Databento ani `/api/drawings` w podglądzie.

## Fakty
- Dlaczego SVG a nie canvas: jedna technika stylowana CSS (sens P12). Szacunek: 1 500 świec ≈ 3 000 elementów SVG, płynne.
- Domyślny styl: wypełnione świece z palety (P18). Kolor zapisany w stylu rysunku trafia do `stroke`/`fill`; reszta z CSS.
- `.lb` ma własne tokeny (zawsze ciemne), więc kolory świec w lightboxie idą z `--lb-profit/--lb-loss` przez przemapowane `--profit/--loss`.
