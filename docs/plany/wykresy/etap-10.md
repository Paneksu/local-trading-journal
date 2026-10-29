# Etap 10: nakładki w obu trybach, tło sesji i PDH/PDL (pakiet F)

Najpierw `00-wspolne.md`.

## Cel
Dwa przełączniki „Nakładki”: tło sesji (Azja, Londyn, Nowy Jork) i linie PDH/PDL poprzedniej sesji CME, takie same w podglądzie SVG i w edycji LWC.

## Przeczytaj
- `public/js/swiece.js` (etap 1): `sessionBounds`, agregacja `1D`. Tu dopisujesz czyste funkcje okien sesji (decyzja K0: bez nowego pliku).
- `public/js/podglad.js` (etap 7) i `public/js/wykres.js` (etap 8): miejsca rysowania poziomów i warstw.
- `public/styles.css` 336-362 (klasy wykresów) i 13-72 (tokeny `--n-blue`, `--n-orange`, `--n-purple`, `--fg-2`).
- `public/js/geometria.js` (etap 6): skale.

## Utwórz / zmień
- `public/js/swiece.js` (funkcje czyste), `public/js/podglad.js` (warstwa `.sess.asia|london|ny`, `.pdh`), `public/js/wykres.js` (własny prymityw serii LWC ~80 linii, Szacunek: pasy tła; PDH/PDL jako dwie linie cenowe), `public/styles.css`, `public/i18n/en.json`, `testy/wykresy-10.mjs`.
- Przełączniki `.check` w legendzie wykresu. Stan trzymaj w jednym miejscu (`overlayPrefs()` w małym module/funkcji): na razie `localStorage` w try/catch; etap 14 przeniesie go do `settings.chart` (godziny i włączenia), dlatego nie rozpraszaj odczytu po plikach.

## Reguły
- Okna sesji w czasie `America/New_York` (P8, domyślnie): Azja 20:00-00:00 (przez północ), Londyn 02:00-05:00, Nowy Jork 09:30-16:00; kolory pasów `--n-blue`, `--n-orange`, `--n-purple` z przezroczystością ~8%. W LWC kolory przez sondę canvas jak w etapie 8.
- PDH/PDL = najwyższa i najniższa cena poprzedniej sesji CME, z agregatu `1D` (`GET /api/candles?tf=1D`); linie `--fg-2`, domyślnie wyłączone obie nakładki.
- Te same funkcje czyste obsługują oba renderery (jedna implementacja).

## Testy najpierw (`wykresy-10:`)
- Okna sesji w DST (tygodnie rozjazdu USA/Europa z etapu 1) i sesja przez północ (Azja); wybór poprzedniej sesji CME dla świeczki z poniedziałku (po weekendzie) i po przerwie; PDH/PDL z syntetycznego `1D`.
- Ręcznie (zrzuty ≤ 4): przełączniki, kolory z tokenów, te same pasy w podglądzie i w edycji.

## Gotowe, gdy
Testy zielone, zrzuty zgodne w obu trybach.

## Nie rób
Nie dodawaj nakładek poza tymi dwiema. Nie pobieraj nic z Databento. Nie zapisuj ustawień w Notion (to etap 14). Nie dodawaj kolorów literałami.

## Fakty
- Godziny sesji `America/New_York`: P8, decyzja gustu zatwierdzona, zmiana godzin pojawi się w Ustawieniach (etap 14).
- Tło sesji i PDH/PDL to przełączniki „Nakładki”, nie rysunki (nie trafiają do Notion).
