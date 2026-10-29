# Etap 0: biblioteki w `public/vendor/` (pakiet A)

Najpierw `00-wspolne.md`. Tu powstaje też pętla ładująca testy `testy/wykresy-*.mjs`.

## Cel
Wgrać do repo dwa pliki zewnętrzne (bez npm, bez buildu) z licencjami i sumami, żeby późniejsze etapy mogły je importować.

## Przeczytaj
- `lib/updater.mjs` 12-17 (`PROTECTED`, nie zmieniasz) i 84-95 (`treeHash`: pliki tekstowe liczone z LF; `.mjs`/`.js` są tekstem).
- `testy/pomocnicze.mjs` 87-98 (`appFiles()`: śledzone + nowe pliki trafiają do sumy wydania).
- `testy/run.mjs` 1-25 (struktura `test(name, fn)`) i 1056-1060 (sekcja „uruchomienie”, tu wstawisz pętlę).
- `server.mjs` 575-590 (statyki z `public/`; `.mjs` ma MIME).

## Utwórz / zmień
- `public/vendor/lightweight-charts/lightweight-charts.standalone.production.mjs`, `LICENSE`, `NOTICE`.
- `public/vendor/lightweight-charts-drawing/lightweight-charts-drawing.es.js`, `LICENSE`.
- `public/vendor/VENDOR.md`: nazwa, wersja, źródło (URL tarballa), SHA-256 pliku, integralność npm, data pobrania, uwagi o licencji.
- `.gitattributes` (istnieje, ma `* text=auto`): dopisz linię `public/vendor/** -text`, bo konwersja końców linii zmieniłaby bajty i sumę (decyzja mechaniczna).
- `testy/run.mjs`: przed „uruchomienie” pętla: dla plików `testy/wykresy-NN*.mjs` (NN = cyfry) posortowanych, `(await import(url)).default({ test, H, assert, ROOT })`. Nie zmieniaj reszty pliku.
- `testy/wykresy-00.mjs`.

## Jak pobrać (tylko `curl`, każdy tarball do osobnego pustego katalogu w katalogu tymczasowym)
- `https://registry.npmjs.org/lightweight-charts/-/lightweight-charts-5.2.1.tgz`: plik `package/dist/lightweight-charts.standalone.production.mjs`; `LICENSE` z paczki; `NOTICE` z `https://raw.githubusercontent.com/tradingview/lightweight-charts/master/NOTICE` (treść: „TradingView Lightweight Charts™ / Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/”).
- `https://registry.npmjs.org/lightweight-charts-drawing/-/lightweight-charts-drawing-0.6.2.tgz`: `package/dist/lightweight-charts-drawing.es.js` i `LICENSE` (MIT). Pliku `.map` nie bierzesz.
- Integralność tarballa sprawdź z JSON-em rejestru (`https://registry.npmjs.org/<paczka>/<wersja>`, pole `dist.integrity`) przez `curl` + `node:crypto`. Nie używaj `npm`.

## Testy najpierw (`wykresy-00:`)
- SHA-256 każdego pliku vendor zgodne z `VENDOR.md` (odczyt plików jako bajty).
- Żaden plik vendor nie ma statycznego `import`/`from "…"` (zawęź regex do początku linii i `import(`; przy fałszywym alarmie w kodzie biblioteki zapisz to w raporcie).
- Licencje i NOTICE obecne i niepuste; `VENDOR.md` wymienia oba pliki.
- `import()` obu plików w Node działa; LWC eksportuje `createChart`, `CandlestickSeries`, `ColorType`, `createSeriesMarkers`; paczka rysowania eksportuje `DrawingManager`, `parseDrawings`, `buildNewDrawing`, `setDefaultStyleOverride`, `VERSION === '0.6.2'`.
- `treeHash(appFiles())` obejmuje ścieżki `public/vendor/…`.

## Gotowe, gdy
Sumy zgodne; test i18n zielony (skanuje `public/js`, nie `public/vendor`); strona startuje bez zmian; pełny przebieg zielony.

## Nie rób
Nie importuj bibliotek nigdzie w kodzie aplikacji (robią to etapy 8-9, dynamicznym `import()`). Nie minifikuj, nie edytuj plików vendor. Nie zmieniaj `PROTECTED` (etap 4).

## Fakty
- LWC 5.2.1, Apache-2.0, plik standalone ESM bez `import`, 197 827 B, SHA-256 `1bb1ee79f9d4dd17261b53d930f7a8995748276f80e7ba0e24412b5068062f5f`. PRZETESTOWANE. Domyślnie `attributionLogo:true`. PRZETESTOWANE.
- Paczka rysowania 0.6.2 (15.10.2026), commit `0291d9c7373e3795373c915a3a64f4f663b5a0db`, MIT, plik 306 381 B, zero `import`, SHA-256 `361f2d2140ea0fab3feb2a6ec463594810607252d3b42cf4196a4af8b1e6afb2`, integralność tarballa `sha512-KyT0vzrN52z2PvPYmpqUfYhVE80KyxtNRvlT5yb70/swQhVB/mTP8qSJiKxp/1V07Eohkl1waxHpFqOpmBTC1A==`. PRZETESTOWANE.
- Wymóg licencji LWC: NOTICE + link do tradingview.com na stronie z wykresem (realizuje etap 7 i sekcja „Licencje” w etapie 14). CZĘŚCIOWE (odczyt licencji, nie porada prawna).
