# Etap 17: wykres trade'a w karcie (pakiet I, Opus)

Najpierw `00-wspolne.md`. P15 jest rozstrzygnięte: wariant C, nic nie czeka na użytkownika.

## Cel
Karta trade'a (`kind: 'trade'`) pokazuje pełny wykres ceny: świece, oś cen i czasu, znaczniki wejścia i wyjścia, tabela z cenami. Rysuje istniejący `udostepnij-render.js` z kształtów `geometria.js`, te same co w podglądzie.

## Przeczytaj
- `public/js/udostepnij-render.js`: `grep -n`; zakresy 22-50 (`rgbOf`, `readTokens`), 77-100 (`buildModel`, gałąź `trade`), 176-197 (`SCRIM`, `photoTokens`, `paintBackground`), 257-330 (`G`, `drawStats`, `drawList`, `leftBlock`, `renderCard`), 343-409 (`drawLayout`).
- `public/js/udostepnij-dane.js` 89-99 (`tradeCard`); `public/js/udostepnij.js` 96-135 (`createShare`, `open`), 164-250 (`build`, `draw`: asynchroniczne), 18-31 (`sanitizeShare`).
- `public/js/app.js` 1288-1289 (`shareModel`, `createShare`); `public/js/geometria.js` (etap 6: `candleShapes`, `markerStyle`; etap 15: `lineShapes`).
- `testy/udostepnij-podglad.html`, `testy/udostepnij-e2e.mjs` 1-15 (port 4321 ZAKAZANY).

## Utwórz / zmień
- `public/js/udostepnij-dane.js` (`tradeCard`: `entryPrice`, `exitPrice`, `sl`, `tp`, `instrument`), `public/js/udostepnij-render.js` (pas/kolumna wykresu, tabela), `public/js/udostepnij.js` (pobranie świec przed rysunkiem), `public/js/app.js` (`shareModel` przekazuje świece trade'a), `testy/udostepnij-podglad.html`, `public/i18n/en.json`, `testy/wykresy-17.mjs`.
- Stała `CHART_IN_SHARE = true` z komentarzem: data 27.10.2026, P15, słowa użytkownika «Nasz wykres w kartach na moje ryzyko»; przełącznik w Ustawieniach (`settings.chart`, etap 14) pozostaje.

## Zachowanie (decyzje gustu zatwierdzone)
- Dane: `GET /api/candles?…&tf=auto&maxBars=60` (lokalne, nigdy Databento). Kadr: wejście −25% do wyjścia +25% czasu trwania. Okno Udostępnij NIE pobiera brakujących świec (bez „Sprawdź koszt”).
- Styl: wypełnione świece z palety (domyślnie), „Linia zamknięć” z `settings.chart` (etap 14/15). Oś cen (etykiety `--fg-2`) i oś czasu, bez siatki pionowej. SL i TP: przerywane linie, domyślnie wyłączone w kartach (opcja).
- Znaczniki: `markerStyle(background)` (P19): tło motywu = pionowa cienka kreska przy świecy wejścia i wyjścia + kropka na cenie + etykieta „Wejście”/„Wyjście” samym tekstem obok (`--fg-2`, wersaliki jak etykiety kart), bez podkładki; tło ze zdjęcia = białe pigułki z ząbkiem. Komentarz w kodzie z datą i słowami użytkownika («wybierz te co bedzie bardziej pasowalo w danym momencie dla danej rzeczy»); odstępstwo od preferencji „bez zaokrąglonych podkładek pod statycznym tekstem” ma być tylko dla zdjęcia i filmu.
- Układ 16:9: lewa kolumna nagłówek + liczba + tabela (tabela przechodzi z prawej pod liczbę), prawa kolumna wykres od `W·0.55` do `W − px`. Formaty pionowe: pas wykresu między tytułem a liczbą, 28% wysokości obszaru środka; istniejące skalowanie `scale` zmniejsza resztę.
- Tabela: wiersze „Cena wejścia” i „Cena wyjścia” gdy wypełnione. Wiersza „Rozmiar” NIE dodawaj (rozbieżność z planem: rola `size` to rozmiar KONTA, a karta trade'a jej nie ma); zgłoś w raporcie.
- Bez świec (EURUSD, XAUUSD, brak pobranych danych, przełącznik wyłączony): karta dokładnie jak dziś.

## Testy najpierw (`wykresy-17:`)
- Przełącznik wyłączony → zero żądań `/api/candles` z okna Udostępnij; włączony → jedno na kartę.
- EURUSD i brak świec → karta jak dziś; `markerStyle`: motyw → tekst, zdjęcie → pigułka; świece/linia z tych samych kształtów co podgląd (te same współrzędne przy tych samych skalach); tabela z cenami wejścia/wyjścia.
- Zrzuty ≤ 4: 4 formaty w obu motywach, ze zdjęciem i bez (łącznie sensowny zestaw, nie wszystkie 16).

## Gotowe, gdy
Zrzuty zgodne z designem kart, testy zielone.

## Nie rób
Nie wprowadzaj progu wieku, wariantów A/B, ukrywania osi (wariant C). Nie dodawaj maili ani pytań do CME/Databento. Nie dopisuj nowego renderera.

## Fakty
- P15 (27.10.2026, słowa użytkownika): «Nasz wykres w kartach na moje ryzyko»; o mailach do CME/Databento: «nie pytamy». README (etap 12) mówi, że dane CME są licencjonowane do użytku własnego, a publikujący odpowiada za warunki swojej licencji.
