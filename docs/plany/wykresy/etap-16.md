# Etap 16: krzywa kapitału na kartach okresu (pakiet I, Opus)

Najpierw `00-wspolne.md`. Nie zależy od licencji danych: to dane użytkownika, nie CME.

## Cel
Karty dzień/tydzień/miesiąc/rok dostają linię skumulowanego wyniku (R, $ albo %) z etykietami. Przełącznik „Krzywa kapitału” w oknie Udostępnij, domyślnie włączony.

## Przeczytaj
- `public/js/udostepnij-dane.js`: 8-35 (`METRICS`, `liveOnly`, `pctOf`), 51-75 (`valuesOf`, `base`, `daysOf`), 101-170 (`dayCard`, `weekCard`, `monthCard`, `yearCard`).
- `public/js/udostepnij-render.js`: `grep -n` na `buildModel` (77), `drawLayout` (343), `leftBlock` (305), `drawList` (281), `paintBackground` (187), `readTokens` (34), `renderCard` (330); czytaj tylko te zakresy.
- `public/js/udostepnij.js`: 164-215 (`build`, `seg`, `ctlHtml`), 218-250 (`draw`), 296-310 (obsługa kliknięć).
- `public/js/stats.js` 172-183 (`equityPoints`: wzór skumulowania), 119-125 (`sortChrono`).
- `testy/udostepnij-podglad.html` (cały) i `testy/udostepnij-e2e.mjs` 1-15 (nagłówek: uruchamianie, port 4321 ZAKAZANY); `testy/run.mjs` 83-168 (testy kart).

## Utwórz / zmień
- `public/js/udostepnij-dane.js` (`curve: [{ t, v }]` dla kart okresu, tylko trade'y Live okresu w kolejności czasu; kształt `v` zgodny z istniejącym `v: {R,$,%}`), `public/js/udostepnij-render.js` (rysowanie krzywej), `public/js/udostepnij.js` (przełącznik, wartość początkowa z `settings.chart` z etapu 14), `testy/udostepnij-podglad.html` (warianty z krzywą), `public/i18n/en.json`, `testy/wykresy-16.mjs`.

## Wygląd (decyzje gustu z planu)
- Linia w kolorze wyniku (zysk/strata z palety), cienka linia zera `--line`; zawsze LINIA, nigdy świece (P18 dotyczy wykresów ceny).
- Etykiety samym tekstem (`--fg-2`, wersaliki jak etykiety kart), bez podkładek: wartość końcowa, szczyt i 0 na prawej krawędzi, daty początku i końca pod linią. Na zdjęciu użyj istniejących `photoTokens`.
- Układ: 16:9 prawa kolumna (lista dni/tygodni zostaje, gdy krzywa wyłączona); formaty pionowe: pas nad listą; w razie braku miejsca działa istniejące skalowanie (`scale`).
- Okres bez trade'ów: karta jak dziś.

## Testy najpierw (`wykresy-16:`)
- `curve` tylko z Live, w kolejności czasu, w R/$/% (zgodnie z `valuesOf`/`pctOf`); etykiety: końcowa, szczyt, 0; okres bez trade'ów → brak `curve`, karta jak dziś; testy kart z `run.mjs` bez zmian.
- Zrzuty/warianty `udostepnij-podglad.html`: 4 formaty × 2 motywy z krzywą.
- Przed zmianą kodu zapisz skróty SHA-256 pikseli kart z NIEZMIENIONEGO kodu (przeglądarka headless z etapu 6) do pliku poza repo; po zmianie karta z wyłączoną krzywą musi dać ten sam skrót (identyczna z 1.2.2).

## Gotowe, gdy
Zrzuty 9:16 i 16:9 w obu motywach (≤ 4); krzywa wyłączona = identyczne piksele jak 1.2.2.

## Nie rób
Nie dotykaj kart trade'a (etap 17). Nie zmieniaj istniejącego układu kart okresu poza miejscem krzywej. Nie dodawaj nowych kontrolek poza przełącznikiem.

## Fakty
- Na `main` karty nie mają żadnego wykresu, także krzywej kapitału (sprawdzone w kodzie 27.10.2026). Karty rysuje natywny Canvas 2D z tokenami przez `getComputedStyle` i sondę `rgbOf`; tło: motyw albo zdjęcie z `localStorage` `thq.share.photo`, zasłona `SCRIM 0.6`.
- Formaty `9:16 4:5 1:1 16:9` (`FORMATS` w `udostepnij-render.js` 9).
