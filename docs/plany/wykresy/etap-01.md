# Etap 1: agregacja świec i sesja CME (`public/js/swiece.js`, pakiet A)

Najpierw `00-wspolne.md`.

## Cel
Czysty moduł (bez DOM, bez I/O), importowany przez serwer i przeglądarkę: parser interwału, granice sesji CME, agregacja świec.

## Przeczytaj
- `public/js/udostepnij-dane.js` 1-30 (wzorzec czystego modułu ESM) oraz test `udostepnij: dane kart` w `testy/run.mjs` 83-100 (jak importować moduł z `public/js` w teście).
- Nic więcej: moduł jest nowy.

## Utwórz / zmień
- `public/js/swiece.js`, `testy/wykresy-01.mjs`. Nic poza tym.
- Proponowane eksporty (nazwy ustalasz sam, trzymaj je spójne): `parseTf(str)`, `sessionBounds(tSec)`, `aggregate(bars, tf)`, `pickSource(tf)` (1m czy 1s).

## Reguły
- Interwał: `^(\d{1,4})(s|m|h|D|W)$`, ≥ 1 s (`7s`, `45s`, `13m`, `2h`, `4h`, `1D`, `1W`).
- Źródło agregacji: 1m, gdy interwał jest wielokrotnością 60 s (`13m`, `2h`, `1D`); w pozostałych przypadkach (`7s`, `45s`, `90s`) 1s.
- Kotwica = otwarcie sesji CME: sesja 17:00 → 16:00 `America/Chicago`, przerwa 16:00-17:00, tydzień od niedzieli 17:00 do piątku 16:00. Świeca zaczyna się w `sessionOpen + k × tf`, nie przechodzi przez koniec sesji (ostatnia bywa krótsza). `1D` = jedna sesja, `1W` = sesje od otwarcia tygodnia, `4h` = 17-21, 21-1, 1-5 itd. czasu sesji.
- DST przez `Intl.DateTimeFormat` z `timeZone` (pełne ICU w oficjalnych Node: WYWNIOSKOWANE). Brak świec bazowych = brak świecy w agregacie (żadnych sztucznych).
- Świece: tablice `[t, o, h, l, c, v]`, `t` = sekundy epoki UTC początku świecy.

## Testy najpierw (`wykresy-01:`), świece syntetyczne
- `7s`, `45s`, `90s` (źródło 1s), `13m`, `4h`, `1D`, `1W`: kotwica, otwarcie, high/low/close/volume policzone poprawnie.
- Przerwa 16-17 CT: żadna świeca jej nie obejmuje; otwarcie w niedzielę 17:00 CT.
- DST: USA 2026 początek niedziela 8.03, koniec niedziela 1.11; Europa 29.03 i 25.10. Tygodnie rozjazdu: 8-29.03 i 25.10-1.11 (obliczone z reguł kalendarza: WYWNIOSKOWANE). Sprawdź godzinę otwarcia sesji w UTC przed i po zmianie oraz że `1D`/`4h` nie gubią ani nie dublują godziny.
- Luki zostają lukami; ostatnia świeca sesji przycięta; zły interwał (`0s`, `10000m`, `5x`) → `null`.

## Gotowe, gdy
Wszystkie przypadki z listy zielone w Node (`node testy/run.mjs wykresy-01`).

## Nie rób
Żadnego dostępu do plików, sieci, `window`. Nie wprowadzaj sesji FX (P5). Nie dodawaj zależności.

## Fakty
- Decyzja mechaniczna planu: dla `90s` źródłem jest 1s (90 s nie składa się z pełnych minut).
- Cena w plikach to int ×100, ale agregacja jest obojętna na skalę.
- Ten sam moduł posłuży później replayowi (etap 13, poza zakresem).
