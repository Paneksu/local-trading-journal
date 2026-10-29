# Etap 11: miniatury na liście trade'ów i w kalendarzu (pakiet F)

Najpierw `00-wspolne.md`. Po pakiecie F review `code-reviewer` (UI).

## Cel
Ten sam renderer `podglad.js` w trybie `mini`: małe wykresy świec z poziomami wejścia/wyjścia/SL/TP w wierszu listy trade'ów i na liście trade'ów dnia (kalendarz). Bez rysunków (P13), bez żądań do Databento i Notion.

## Przeczytaj
- `public/js/app.js`: `grep -n "trow\|tcard\|mini-list\|trade-open"`; wiersz tabeli ok. 1034-1042 (`renderTrades` 1018-1075), lista „recent” ok. 845, lista dnia w prawym panelu po kliknięciu dnia w kalendarzu (WYWNIOSKOWANE, odszukaj `grep -n "cal-\|state.day\|selDay"` i `sideSection` 813-870).
- `public/js/podglad.js` (etap 7), `lib/candles.mjs` (etap 4, dodajesz `tf=auto&maxBars`), `public/styles.css`/`features.css` (klasy `.trow`, `.tcard`, `.thumb`/`.g-tile` z grep).
- `public/js/stats.js` 13-50 (pola trade'a, ceny z etapu 5).

## Utwórz / zmień
- `public/js/podglad.js` (tryb `mini`: bez osi, kontrolek i dymka), `lib/candles.mjs` (+ `server.mjs` parametr `tf=auto&maxBars`), `public/js/app.js` (wiersz listy: wąska kolumna albo zastąpienie ikonki zrzutu, rozstrzygnij sam i wypisz jako decyzję gustu; lista dnia), style, `public/i18n/en.json`, `testy/wykresy-11.mjs`.

## Reguły (decyzje gustu zatwierdzone)
- Kadr: wejście −15% do wyjścia +15% szerokości; `tf=auto&maxBars=80` wybiera na serwerze najmniejszy interwał z `15s 1m 5m 15m 1h`, przy którym świec ≤ 80.
- Tylko dane lokalne: miniatura nigdy nie woła `quote`/`fetch`/Databento; brak świec, instrument spoza mapy albo trade po `availableEnd` → dotychczasowa miniatura zrzutu, a gdy jej brak, `.empty`.
- Leniwe ładowanie: `IntersectionObserver` z marginesem 200 px, najwyżej 4 żądania naraz, cache w pamięci (`tradeId:wersjaDanych → kształty`) czyszczony po pobraniu świec. Bez `localStorage`.
- Dymek miniatury: „Rysunki w szczegółach trade'a” (R14). Miniatura nie woła `/api/drawings` i nie rysuje rysunków, nawet gdy trade je ma.

## Testy najpierw (`wykresy-11:`)
- Serwer: `tf=auto` wybiera najmniejszy TF z listy przy ≤ 80 świec; limity i błędy.
- Log atrap: przewinięcie listy 50 trade'ów daje zero żądań Databento i zero `GET /v1/pages` do Notion z miniatur; log serwera: zero wywołań `/api/drawings`.
- Brak świec → zrzut albo `.empty`.
- Ręcznie (zrzuty ≤ 4): leniwe ładowanie, ≤ 4 żądań naraz, cache, czytelność przy 375 px, lista 200 trade'ów przewija się płynnie.

## Gotowe, gdy
Testy zielone, zrzuty zgodne ze stylem dashboardu w Onyx i Platinum.

## Nie rób
Nie dodawaj rysunków do miniatur. Nie przechowuj świec w `localStorage`. Nie zmieniaj układu tabeli poza kolumną miniatury.

## Fakty
- Ceny wejścia/wyjścia/SL/TP idą w `/api/data` (etap 5); rysunki nie.
- Notion przyjmuje ~3 żądania/s, dlatego miniatury nie pobierają rysunków (P13). CZĘŚCIOWE.
