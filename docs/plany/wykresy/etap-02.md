# Etap 2: magazyn świec (`lib/candles-store.mjs`, pakiet A)

Najpierw `00-wspolne.md`.

## Cel
Pliki binarne świec 1s i 1m na dzień UTC, `days.json` ze statusami dni i zmianami kontraktu, odczyt zakresu, zapis atomowy.

## Przeczytaj
- `lib/env.mjs` 8-10 (`CONFIG_DIR`, `THQ_CONFIG_DIR`) i 58-65 (`saveConfig`: plik tymczasowy + `renameSync`, wzór zapisu atomowego).
- `public/js/swiece.js` (etap 1): agregacja do warstwy 1m.
- `testy/pomocnicze.mjs` 20 (`tmp()` katalog tymczasowy).

## Utwórz / zmień
- `lib/candles-store.mjs`, `testy/wykresy-02.mjs`. Funkcje przyjmują katalog bazowy jako parametr (domyślnie `path.join(CONFIG_DIR, 'chart-data')`), żeby testy używały `tmp()`.

## Format (decyzje planu)
- Rekord 24 B little-endian: `t` u32 (sekundy epoki UTC początku świecy), `o,h,l,c` i32 (cena ×100, tick 0,25 = 25), `v` u32. Bez nagłówka, rosnąco po `t`; odczyt zakresu przez wyszukiwanie binarne.
- Układ: `chart-data/candles/<ES|NQ>/1s/YYYY-MM-DD.bin`, `…/1m/YYYY-MM-DD.bin`, `…/days.json`. Jeden plik na dzień UTC.
- `days.json`: `{ "YYYY-MM-DD": { status: "complete"|"partial", fetchedAt, until?, rolls: [{ t, from, to }] } }`. Dzień bez danych (weekend, święto) dostaje `complete` z zerem świec (nie pobieramy go drugi raz). `partial` ma `until` (do kiedy są dane).
- Warstwa 1m liczona przy zapisie dnia 1s tą samą funkcją agregacji (kotwica na pełnej minucie), ok. 35 KB/dzień (Szacunek).
- Scalanie końcówki (dla etapu 4): nowe świece dopisywane za ostatnią istniejącą; `t` ≤ ostatniego zapisanego pomijane (bez duplikatów); zapis atomowy całego pliku dnia; 1m dla dnia liczona od nowa.

## Testy najpierw (`wykresy-02:`)
- Zapis i odczyt rekordów (round trip, wartości skrajne i32/u32), pusty dzień, zakres przez granicę dni UTC.
- Zapis atomowy: po symulowanym błędzie przed `rename` stary plik cały, brak plików `.tmp`.
- `days.json`: `complete` z zerem świec (weekend), `partial` z `until`, `rolls`; zapis jednego dnia nie niszczy innych.
- Warstwa 1m zgodna z `aggregate(1s → 1m)`; scalanie końcówki bez duplikatów, liczba świec = suma unikalnych `t`.
- Katalog tylko w podanym katalogu tymczasowym.

## Gotowe, gdy
`node testy/run.mjs wykresy-02` zielony; moduł nie importuje nic z `server.mjs`.

## Nie rób
Bez SQL i `node:sqlite` (odrzucone: `ExperimentalWarning`). Bez kompresji plików. Nie dodawaj tu `chart-data` do `PROTECTED`/`.gitignore` (etap 4). Nie dotykaj sieci.

## Fakty
- Szacunek: ES ma 55-70 tys. świec 1s na sesję; lokalnie 1,3-1,7 MB/sesja w 1s, ok. 0,35-0,45 GB/rok jednego symbolu. Interwał `1D` z samego 1s to ~70 tys. odczytów dziennie, z 1m ~1 400, stąd warstwa 1m.
- Granice żądań Databento są w UTC, a sesje liczy agregacja: dlatego dzień pliku = dzień UTC (decyzja gustu zatwierdzona).

## Zmiana P25, 27.10.2026 (obowiązuje zamiast opisu powyżej tam, gdzie się różni)
Słowa użytkownika: «okej zwiekszam limit do 50 usd ale sie upewniaj ze wszystko jest pobierane z darmowych kredytow akceptuje plan».
- Dwie warstwy: `1m` (historia z serwera, ohlcv-1m) i `1s` (tylko okna wokół trade'ów). Warstwa 1m NIE jest liczona z 1s przy zapisie; w oknach 1s nie jest nadpisywana (identyczność zmierzona 90/90, ale źródłem jest serwer).
- Zamiast `days.json` (statusy dni, `partial`/`until`) jest `chart-data/candles/<ES|NQ>/coverage.json`: `{ "1m": [[od,do]…], "1s": [[od,do]…], "rolls": [{t,label}] }`, zakresy [od,do) w sekundach, scalane. Pokrycie znaczy "o to zapytaliśmy serwer" (sekundy bez transakcji nie mają świecy, więc nie zakładaj ciągłości).
- API magazynu: `writeRange(sym,res,from,to,bars,{rolls})` (zastępuje `writeDay`/`mergeTail`/`setDay`; idempotentne, atomowe, najpierw świece, potem pokrycie), `readCoverage`, `missingRanges`, `mergeRanges/subtractRanges/clipRanges/intersectRanges`, `readRange`, `readDay`, `readAux/writeAux` (kolejka). Pliki dni nadal 24 B/rekord, jeden plik na dzień UTC i warstwę.
- Dalej bez SQL, bez kompresji, bez sieci w module.
- Dane sprzed P25 nie istnieją: na dysku użytkownika nie było `days.json` ani `chart-data` (sprawdzone przez sesję główną 27.10.2026), więc migracji ze starego formatu nie ma i nie będzie.
- Odczyt (`read()`) filtruje świece warstwy do jej pokrycia, żeby nadmiarowe rekordy w pliku (awaria między zapisem świec a pokrycia) nie dublowały czasów.
