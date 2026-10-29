# Etap 12: dokumentacja i wydanie 1.3.0 (pakiet G, Haiku)

Najpierw `00-wspolne.md`. Uruchamiany TYLKO na polecenie użytkownika (wydanie), po pakietach A-J. Bez tagów i bez push bez osobnego polecenia.

## Cel
README PL/EN, CHANGELOG i `package.json` opisują moduł wykresów zgodnie z tym, co faktycznie powstało.

## Przeczytaj
- `README.md`: spis 15-31, `## Co dostajesz` 32, `## Bezpieczeństwo i połączenia sieciowe` 443-449 (zasada: lista połączeń), `## Pliki projektu` 462, `### Testy` 477. `README.en.md`: odpowiedniki 32, 423, 442.
- `CHANGELOG.md` 1-20 (format PL/EN, wzór wpisu 1.2.2); `CONTRIBUTING.md` 51-62 (wydanie: `package.json`, `CHANGELOG`, test, tag, `node narzedzia/suma-wydania.mjs vX`).
- `package.json` (wersja 1.2.2 → 1.3.0); `schema/notion-schema.json` (schemaVersion 3 z etapu 5).
- Raporty pakietów A-J (decyzje gustu, rozbieżności) od sesji głównej.

## Utwórz / zmień
`README.md`, `README.en.md`, `CHANGELOG.md`, `package.json`, `testy/wykresy-12.mjs` (test README). Nic w kodzie aplikacji.

## Treść README (PL i EN)
- Wykresy: podgląd w designie dashboardu i tryb edycji; tylko ES/NQ/MES/MNQ (EURUSD i XAUUSD: brak źródła); rysunki w Notion (kolumna „Rysunki”: jak ukryć widok „•••” → Properties → oko, chyba że etap 5 znalazł sposób automatyczny; konflikt dwóch urządzeń: wygrywa ostatni zapis).
- Databento: własny klucz w `.env`, pobranie po kliknięciu z wyceną i limitem 1 USD, koszty (Szacunek), embargo ok. 8 h bez abonamentu (brak wykresu z trwającej sesji), rolowanie `ES.v.0` bez wyrównania cen.
- „Bezpieczeństwo i połączenia sieciowe”: nowe jedyne połączenie `hist.databento.com`, wyłącznie po kliknięciu użytkownika; klucz nigdy do przeglądarki, logów ani Notion.
- Licencje i atrybucja: TradingView Lightweight Charts (Apache-2.0, NOTICE, link), paczka rysowania (MIT).
- Karty i filmy: wykres ceny w kartach i filmach włączony; dane CME są licencjonowane do użytku własnego, a osoba publikująca karty lub filmy odpowiada za warunki swojej licencji danych (każdy użytkownik repo decyduje sam; można wyłączyć w Ustawieniach → Wykresy). Filmy: MP4 (WebM jako zapas, bez dźwięku), film tła zostaje na urządzeniu i nigdy nie jest wysyłany; „Używaj tylko nagrań, do których masz prawa (także muzyki)”.
- Ustawienia → Wykresy: krótki opis grup. Pliki projektu: nowe moduły i `public/vendor/`.

## Testy najpierw (`wykresy-12:`)
README PL i EN wymieniają `hist.databento.com`, notkę o filmie tła i odpowiedzialność za licencję danych; CHANGELOG ma sekcję `[1.3.0]` w PL i EN; `package.json` ma 1.3.0; test i18n zielony; pełny `node testy/run.mjs` zielony (z testem zgodności i testem nagrania, jeśli jest przeglądarka; wynik wpisz do raportu wydania, R13).

## Gotowe, gdy
Testy zielone; raport wydania zawiera wynik przebiegu z przeglądarką i listę pytań otwartych do użytkownika.

## Nie rób
Nie taguj, nie pushuj, nie licz `tree-sha256` bez polecenia. Nie wykonuj ręcznego testu rysunków na prawdziwym Notion (to zgoda użytkownika, R11). Nie obiecuj w README rzeczy, których pakiety nie zrobiły (np. dźwięku, replayu, stylów „później”).

## Fakty
- `semver minor` (nowa funkcja) → 1.3.0. Wydanie według `CONTRIBUTING.md` dopiero na polecenie.
- P15: tekst o licencji dokładnie w duchu słów użytkownika z planu; bez maili do CME/Databento (użytkownik zdecydował, że nie pytamy).
