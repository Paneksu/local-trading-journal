# Etap 8: tryb edycji w Lightweight Charts (`public/js/wykres.js`, pakiet E)

Najpierw `00-wspolne.md`.

## Cel
Przycisk „Edytuj” w widoku „Wykres” podmienia podgląd SVG na wykres LWC (przezroczyste tło, kolory z tokenów), z tym samym kadrem i TF. „Gotowe” wraca do podglądu bez skoku kadru.

## Przeczytaj
- `public/vendor/VENDOR.md` (etap 0) i `public/js/palety.js` 82-100 (`ratioOn`, `fixContrast`), 122-135 (`applyPalette`: wpisuje `--profit/--loss/--be/--lb-*` do `style` na `<html>`).
- `public/styles.css` 457-462 (`.lb` przemapowuje tokeny na ciemne), 336-362 (tokeny wykresu), tokeny w liniach 13-72.
- `public/js/udostepnij-render.js` 22-33 (`rgbOf`: sonda `canvas.getContext('2d').fillStyle`, wzór normalizacji kolorów).
- `public/js/podglad.js` (etap 7): stan `{ tf, fromIndex, toIndex }`, poziomy, linijka atrybucji.
- `public/js/geometria.js` (etap 6) nie jest potrzebny w LWC.

## Utwórz / zmień
- `public/js/wykres.js`, `public/js/app.js` (przycisk `.btn` „Edytuj”/„Gotowe” w widoku wykresu), `public/i18n/en.json`, `testy/wykresy-08.mjs`.
- LWC ładowany dopiero po kliknięciu „Edytuj”: `import('/vendor/lightweight-charts/lightweight-charts.standalone.production.mjs')` (podgląd i miniatury go nie potrzebują).

## Zasady (WYWNIOSKOWANE z dokumentacji LWC 5; krok 1 to spike potwierdzający)
- Tło `layout.background = { type: ColorType.Solid, color: 'transparent' }`, `attributionLogo: false`, `borderVisible: false` na skali cen, linie pionowe siatki ukryte.
- `themeOptions()` mapuje tokeny CSS na opcje LWC. UWAGA (rozbieżność z planem): czytaj tokeny przez `getComputedStyle` z KONTENERA wykresu wewnątrz `.lb`, nie z `document.documentElement`: `.lb` nadpisuje `--profit/--loss/--be/--fg/--fg-2/--float/--popover/--line`. Mapowanie: świeca wzrostowa `--profit`, spadkowa `--loss`, tekst osi `--fg-2` + `--font` 10,5 px, siatka `--line`, krzyżyk `rgb(var(--fg-rgb) / .35)`, etykiety krzyżyka tło `--popover` tekst `--fg`, wejście `--fg-2`, SL `--loss`, TP `--profit`, wyjście `--be`, znacznik rolowania `--fg-2`.
- Każdy kolor przez sondę canvas do `#rrggbb`/`rgba(...)` (tokeny w składni CSS Color 4, `--n-*` w OKLCH; parser LWC może ich nie przyjąć).
- `MutationObserver` na `<html>` (`data-theme`, `style`) → `chart.applyOptions(themeOptions())` i odświeżenie domyślnych stylów rysunków.
- Poziomy trade'a: `createPriceLine` (wejście, wyjście, SL, TP), `createSeriesMarkers`; zablokowany rysunek `long-position`/`short-position` z pól trade'a (nie zapisywany). Jednostki `stopLevel`/`profitLevel` (ticki czy cena) sprawdź w spike'u; jeśli paczka nie udźwignie, prostokąty zysku i straty własnym prymitywem.
- Strefa czasu osi: `localization.timeFormatter` i `tickMarkFormatter` z `Intl`, bez przesuwania znaczników.
- Wspólny stan kadru: LWC `getVisibleLogicalRange`/`setVisibleLogicalRange`, indeksy świec identyczne z podglądem.

## Testy najpierw (`wykresy-08:`)
- Spike (krok 1): przezroczyste tło i kolor przez sondę w LWC, w przeglądarce headless z etapu 6.
- Jednostkowo: `themeOptions()` na obiekcie tokenów; przeliczenie stanu kadru podgląd ↔ LWC w obie strony.
- Ręcznie (zrzuty ≤ 4): przed kliknięciem w sieci brak pliku LWC; po „Edytuj” ten sam kadr i TF; po „Gotowe” tak samo; zmiana motywu i palety na żywo; poziomy i rysunek pozycji z pól.

## Gotowe, gdy
Przejście podgląd ↔ edycja bez skoku kadru; kolory zgodne z podglądem w obu motywach.

## Nie rób
Nie ładuj LWC statycznie. Nie zapisuj rysunków (etap 9). Nie ustawiaj kolorów literałami. Nie modyfikuj plików vendor.

## Fakty
- LWC 5.2.1: `createChart`, `CandlestickSeries`, `ColorType`, `createSeriesMarkers` w standalone `.mjs`. PRZETESTOWANE. API serii (v5: `chart.addSeries(CandlestickSeries, …)`): WYWNIOSKOWANE.
- Licencja: `attributionLogo:false` wymaga linku do tradingview.com na stronie (linijka z etapu 7) i NOTICE (sekcja Licencje, etap 14). CZĘŚCIOWE.
- Paczka rysowania: `new DrawingManager(chart, series, opts)`, `setTool`, `add/update/remove`, `exportJSON/importJSON`, zdarzenia `change/gestureEnd/textEdit`. WYWNIOSKOWANE (README, `index.d.ts`).
