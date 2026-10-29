# Etap 3: klient Databento i atrapa (`lib/databento.mjs`, pakiet B)

Najpierw `00-wspolne.md`. Pieniądze użytkownika: to najbardziej ryzykowny etap pakietu B.

## Cel
Moduł HTTP do Databento (bez SDK) z twardymi bezpiecznikami kosztu oraz atrapa `testy/atrapa-databento.mjs`. Klucz przychodzi jako parametr; wczytanie z `.env` robi etap 4.

## Przeczytaj
- `lib/notion.mjs` 1-48 (wzorzec klienta `fetch` z ponawianiem; `NOTION_API_BASE` w `lib/env.mjs` 35).
- `testy/atrapa-notion.mjs` 1-10, 196-198, 342 (wzór atrapy: port z argv, `/__test/log`, `send`).
- `testy/pomocnicze.mjs` 23-27 (`cleanEnv`: dodaj `DATABENTO_API_KEY`, `DATABENTO_API_BASE`; baza martwa `http://127.0.0.1:9`), 62-69 (`atrapa()`; dodaj analogiczne uruchomienie atrapy Databento).

## Utwórz / zmień
- `lib/databento.mjs`, `testy/atrapa-databento.mjs`, `testy/pomocnicze.mjs` (cleanEnv + helper), `testy/wykresy-03.mjs`.
- Adres bazowy: `process.env.DATABENTO_API_BASE || 'https://hist.databento.com'`.

## Zachowanie
- `getCost`, `getRange` (CSV), `getDatasetRange` (cache 15 min, zegar wstrzykiwany do testów).
- `POST /v0/metadata.get_cost` i `POST /v0/timeseries.get_range`, formularz: `dataset=GLBX.MDP3`, `symbols`, `schema=ohlcv-1s`, `stype_in=continuous`, `stype_out=instrument_id`, `start`, `end`; dla `get_range` dodatkowo `encoding=csv`, `compression=none`, `pretty_px=false`, `pretty_ts=false`. Basic Auth: klucz jako login, puste hasło.
- Bezpieczniki (R8): symbole tylko `ES.v.0`/`NQ.v.0` (MES→ES, MNQ→NQ jedną stałą mapą); nigdy `.FUT` ani `.c.`; `getRange` nie wolno wołać bez wcześniejszego `getCost`; tuż przed `getRange` drugi `getCost`: wycena > potwierdzona + 5% albo > limit (domyślnie 1 USD) → przerwanie bez pobierania.
- Parser CSV po NAZWACH kolumn z nagłówka (`ts_event`, `instrument_id`, `open`, `high`, `low`, `close`, `volume`; inne kolumny ignoruj): cena 1e-9 → ×100 (dzielenie przez 1e7, zaokrąglenie), ns → s, zmiana `instrument_id` między świecami → wpis `rolls`.
- Błędy 401/402/422/429 → komunikaty przez `t()` (dopisz EN). Klucz nigdy w logach, wyjątkach ani odpowiedziach.

## Testy najpierw (`wykresy-03:`)
- Atrapa sprawdza Basic Auth z kluczem testowym, `symbols` ∈ {`ES.v.0`,`NQ.v.0`}, `stype_in=continuous`, `schema=ohlcv-1s`; żaden symbol nie kończy się na `.FUT` ani nie zawiera `.c.`.
- MES i MNQ dają żądania o `ES.v.0`/`NQ.v.0`; powtórne pobranie tych samych dni nic nie pobiera.
- `get_range` bez `get_cost` niemożliwe; wycena wyższa niż potwierdzona lub > 1 USD → zero `get_range` w logu atrapy.
- `metadata.get_dataset_range` (atrapa zwraca ustawiany w teście `end`); drugie wywołanie w ciągu 15 min nie idzie do atrapy.
- Parser CSV: konwersja cen i czasu, wpis `rolls` przy zmianie `instrument_id`, kolumny w innej kolejności, pusta odpowiedź.
- 401/402/422/429; w stdout/stderr procesu i w odpowiedziach nie ma klucza testowego.

## Gotowe, gdy
`node testy/run.mjs wykresy-03` zielony; dowód z logu atrapy, że nic nie obeszło wyceny.

## Nie rób
Żadnego prawdziwego żądania ani klucza. Nie dodawaj SDK, DBN ani `zlib.zstd`. Nie ustawiaj trasy serwera (etap 4). Nie zgaduj prawdziwego nagłówka CSV: atrapa generuje go według powyższych kolumn; w raporcie wpisz „nagłówek prawdziwego CSV niezweryfikowany”.

## Fakty
- Metoda, pola i Basic Auth z kodu `databento-python` (`metadata.py`, `http.py`), gateway z `enums.py`. CZĘŚCIOWE (samego zapytania nie wysłano). Że `get_cost` jest bezpłatne: założenie użytkownika, dokumentacja wprost nie mówi.
- `encoding=csv`, `compression=none`: dokumentacja kodowań; `pretty_*` do potwierdzenia: WYWNIOSKOWANE. CSV bez dopłaty, kompresja nie zmienia kosztu (cennik). CZĘŚCIOWE.
- OHLCV: `ts_event` początek świecy (włącznie), ceny i64 w 1e-9, `volume` u64; świeca nie powstaje bez transakcji; rekord 56 B. CZĘŚCIOWE/WYWNIOSKOWANE.
- `ES.v.0`: kontrakt wg obrotu z poprzedniego dnia, ceny bez wyrównania na rolowaniu. CZĘŚCIOWE.
- `get_dataset_range` zwraca zakres z polem końca (traktuj jako `availableEnd`); metoda HTTP i kształt odpowiedzi: WYWNIOSKOWANE, atrapa niech przyjmuje POST i GET.
- P23: bez abonamentu świece po ok. 8 h (PRZETESTOWANE na katalogu, 27.10.2026); koszt ES: Szacunek 0,0016-0,002 USD/sesja, 0,40-0,50 USD/rok przy 0,50 USD/GB (stawka niepotwierdzona).

## Zmiana P25, 27.10.2026
Słowa użytkownika: «okej zwiekszam limit do 50 usd ale sie upewniaj ze wszystko jest pobierane z darmowych kredytow akceptuje plan».
- `getCost`/`getRange` przyjmują `schema` (`ohlcv-1s` domyślnie albo `ohlcv-1m`; inne odrzucane kodem `bad-schema`). Eksport `SCHEMAS`.
- Nowa opcja klienta `beforeRange(costUsd, params)`: ostatni strażnik tuż po drugim `get_cost`, przed `get_range` (używa go strażnik kredytu z `lib/candles.mjs`; wyjątek z niego przerywa bez pobierania).
- Atrapa: schema ∈ {ohlcv-1s, ohlcv-1m} (1m zawsze co 60 s), `gaps` (sekundy bez wierszy), `cost1m`, `failRangeAfter` (429 po N udanych `get_range`). Databento NIE ma API salda ani kredytów (dokumentacja 27.10.2026: `metadata` ma tylko list_*, get_dataset_condition/range, get_record_count, get_billable_size, get_cost), więc atrapa go nie udaje.
