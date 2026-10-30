# Etap E2: migracja 006 i wysyłka do Notion z kolejką i idempotencją

Model: **Opus** (dane użytkownika). Review po pakiecie: **`code-reviewer` + `security-auditor`** (nowe trasy zapisu przez `guardWrite`, ciało do 4 MB, ścieżki plików z identyfikatora sesji). Najpierw `00-wspolne.md`.

## Cel
§11: lokalny plik sesji jest źródłem prawdy, a „Zakończ dzień” wysyła trade'y dnia do bazy Trade'y (`typ=Backtest`), osobny przycisk „Zapisz do Notion” wysyła zaległe. Licznik „niezapisane w Notion: N”, ponawianie (429, brak sieci), idempotencja: ponowna wysyłka niczego nie dubluje. Migracja 006 dodaje pola „Sesja backtestu”, „MAE (R)” i „MFE (R)” (decyzja 30.10.2026: «Tak, dodać pola»); MAE/MFE zapisują się razem z trade'em. Kopia definicji sesji idzie do bloku ustawień.

## Przeczytaj
- `CONTRIBUTING.md` 7-40 (zasady migracji); `migrations/005-pole-kontrakt.mjs` (wzór); `schema/notion-schema.json` 1-5 i 110-136 (pola trades); `lib/roles.mjs` 20-30 (role, `optional: true`).
- `lib/writes.mjs` 85-112 (`buildTradeProps`, wzór pola `contract`), 183-215 (`createWriter`, `writePage`, `saveTrade`).
- `lib/drawings.mjs` 51-80 i `grep -n "async function save" lib/drawings.mjs` (zapis rysunków do pola „Rysunki” po id strony).
- `lib/data.mjs` 70-80 (`normalizePage`, rich_text), `public/js/stats.js` 13-56 (`normalizeTrades`).
- `lib/sync.mjs` 12-26 (`sanitizeSettings`, limity), 125-140 (`push`).
- `testy/wykresy-05.mjs` 1-60 (wzór testu migracji na atrapie, PL i EN), `testy/atrapa-notion.mjs` 323-330 (`/__test/fail`), 456-463 (query bez filtrów).

## Pliki
- Utwórz: `migrations/006-sesja-backtestu.mjs`, `lib/backtest-sync.mjs`, `testy/backtest-E2-migracja.mjs`, `testy/backtest-E2-notion.mjs`.
- Zmień: `schema/notion-schema.json` (`schemaVersion: 6`, pola `btSession`, `btMae`, `btMfe`), `lib/roles.mjs` (rola `btSession`, `types: ['rich_text']`, `names: ['Sesja backtestu','Backtest session']`, `optional: true`; role `btMae` i `btMfe`: `types: ['number']`, `names: ['MAE (R)']` i `['MFE (R)']` (te same w EN), `optional: true`), `lib/writes.mjs` (klucze `btSession`, `btMae`, `btMfe`), `public/js/stats.js` (`normalizeTrades`: `btSession` jako tekst, `btMae`/`btMfe` jako liczba albo `null`), `server.mjs` (trasa POST), `public/js/bt-replay.js` (licznik, przycisk, wywołanie przy „Zakończ dzień”), `public/js/ustawienia.js` lub `app.js` (kopia definicji w `bt.sessionsCopy`), `CHANGELOG.md` NIE (to pakiet I), `public/i18n/en.json`.

## Interfejsy
- Consumes: `createWriter(...).trades(input, id)`, `drawings.save(id, doc)`, `data` (lista trade'ów z `btSession`), `createBacktestStore` (C1), `Trade` (E1).
- Produces: `btMarker`, `createBacktestSync(...).push/pending` (00-wspolne); trasa `POST /api/backtest/notion {sessionId, day?}`; `normalizeTrades` zwraca `btSession: string` (pusty, gdy brak) oraz `btMae`, `btMfe: number|null` (`null`, gdy brak pola albo wartości); `parseBtSession(s) → { name, sessionId, tradeId } | null` w `public/js/stats.js`.

## Decyzje [B] tej karty
- Wartość pola „Sesja backtestu”: `"<nazwa sesji> [<sessionId>/<tradeId>]"`, np. `CPI 2024 [bt-k3f9x2/t7]`. Znacznik w nawiasie jest kluczem idempotencji.
- Kolejność wysyłki trade'a: (1) jeśli `notion.id` jest → pomiń; (2) jeśli w danych z Notion (`data`, świeże pobranie) jest strona ze znacznikiem → zapisz jej id lokalnie, pomiń tworzenie; (3) `POST` strony, natychmiast zapis `notion.id` w pliku sesji; (4) rysunki przez `drawings.save(id, doc)`; (5) `state: 'sent'`. Błąd po (3) przed zapisem id jest pokryty krokiem (2) przy następnej próbie.
- Ponawianie: 429, 5xx i brak sieci → `state: 'pending'`, licznik bez zmian; klient ponawia co 60 s przy otwartym ekranie replayu i przy każdym „Zakończ dzień”. Błąd walidacji (400) → `state: 'error'` z komunikatem przy trade'zie, bez ponawiania.
- Mapowanie pól: `name` = `"Backtest <instrument> <dir> <day>"`, `typ: 'Backtest'`, `date/time` = wejście w strefie `America/New_York` (`tz`), `exitDate/exitTime`, `instrument`, `dir`, `setup`, `session` (opcja sesji z godziny wejścia, tylko gdy taka opcja istnieje w bazie), `r`, `pnl`, `entryPrice`, `exitPrice`, `sl` (= `sl0`), `tp`, `be` (cena BE, gdy było przesunięcie), `contract`, `notes`, `konta` (konto z definicji sesji, opcjonalnie), `btSession`. `btMae` = `maeR` i `btMfe` = `mfeR` trade'a (w R, liczby; gdy `null`, pola pominięte), żeby statystyki wykonania działały na każdym urządzeniu.
- Kopia definicji: `bt.sessionsCopy = [{ id, name, def }]` bez `pool`, trade'ów i rysunków; gdy `JSON.stringify` > 30 000 znaków → kopia pominięta z notką w Ustawieniach → Backtest (sesje tylko lokalnie).

## Zadanie 1: migracja 006
- [x] **Testy** `testy/backtest-E2-migracja.mjs`:
  - `backtest-E2: migracja 006 jest addytywna i zgodna ze schematem` — `validateMigration` przechodzi; trzy operacje `addProperty` na `trades`: `btSession rich_text` (PL „Sesja backtestu”, EN „Backtest session”), `btMae number` (PL „MAE (R)”, EN „MAE (R)”) i `btMfe number` (PL „MFE (R)”, EN „MFE (R)”); `schemaVersion === 6`; pola w `notion-schema.json` identyczne.
  - `backtest-E2: migracja 006 na atrapie (pl i en)` — dry-run pokazuje 3 pola bez zapisu; zapis dodaje tylko te trzy pola; drugi przebieg bez zmian; `/__test/violations` puste.
  - `backtest-E2: zapis btSession` — `buildTradeProps({ btSession: 'CPI 2024 [bt-abc123/t1]' }, …)` → `rich_text`; > 200 znaków → błąd walidacji; brak pola w bazie (przed migracją) → komunikat jak przy „Kontrakt”.
- [x] `node testy/run.mjs backtest-E2` → FAIL; zaimplementuj migrację, schemat, rolę, `writes`; testy zielone.

## Zadanie 2: wysyłka i idempotencja
- [x] **Testy** `testy/backtest-E2-notion.mjs` (atrapa Notion po migracji 006, serwer testowy):
  - `backtest-E2: Zakończ dzień wysyła trade'y dnia` — 3 trade'y dnia → 3 strony `typ=Backtest` z polami jak w mapowaniu; rysunki w polu „Rysunki”; lokalnie `state: 'sent'`, `notion.id` ustawione.
  - `backtest-E2: ponowna wysyłka nie dubluje` — drugi `push` → `sent: 0, skipped: 3`, liczba stron bez zmian.
  - `backtest-E2: utracona odpowiedź` — atrapa tworzy stronę, ale odpowiedź ginie (`/__test/fail` po zapisie albo zerwanie): następny `push` znajduje stronę po znaczniku i nie tworzy drugiej.
  - `backtest-E2: 429 i brak sieci` — `/__test/fail` ze statusem 429: `pending` bez zmian, `failed` z komunikatem, licznik „niezapisane w Notion: 3”; po zdjęciu awarii `push` wysyła wszystko.
  - `backtest-E2: zapis btMae i btMfe` — `buildTradeProps({ btMae: -0.5, btMfe: 1.5 }, …)` → dwa `number`; `null` pomija pole; brak pól w bazie (przed migracją) → komunikat jak przy „Kontrakt”; trade wysłany przez `push` ma w atrapie `btMae`/`btMfe` równe `maeR`/`mfeR`; `normalizeTrades` zwraca je jako liczby.
  - `backtest-E2: zapis bez kończenia dnia` — przycisk „Zapisz do Notion” wysyła zaległe z wszystkich dni, dzień trwa dalej.
  - `backtest-E2: nowy setup` — setup spoza opcji tworzy opcję w Notion przez zwykły zapis strony (bez migracji), istniejące opcje nietknięte.
  - `backtest-E2: stare wpisy Backtest` — 6 wpisów Backtest bez pola sesji w atrapie: `normalizeTrades` → `btSession: ''`, `btMae: null`, `btMfe: null`; statystyki je liczą w nagłówku i tabelach („Bez sesji”), ale statystyki wykonania ich pomijają.
  - `backtest-E2: trasa chroniona` — bez `X-THQ`/obcy `Origin` → 403; `sessionId` spoza `SESSION_ID_RE` → 400.
  - `backtest-E2: kopia definicji w ustawieniach` — `sanitizeSettings` zachowuje `bt.sessionsCopy`; kopia > 30 000 znaków pominięta.
- [x] Zaimplementuj `lib/backtest-sync.mjs` (jedna wysyłka sesji naraz: kolejka obietnic jak `serial` w `drawings.mjs:56`), trasę, licznik i przycisk w pasku replayu.
- [x] Pełny przebieg; commit `dodaje migrację 006 i zapis backtestu do Notion`; wpis w `postep.md`.

## Po pakiecie
Sesja główna woła `code-reviewer` (diff D1–E2) i `security-auditor` (trasy `/api/backtest/*` z zapisem: `guardWrite`, limit ciała, identyfikator sesji jako nazwa pliku, brak sekretów w kopii ustawień).

## Gotowe, gdy
Migracja przechodzi walidator i atrapę; wysyłka jest idempotentna przy awarii w każdym kroku; licznik pokazuje zaległe; `backtest-E2:` i `migracje` zielone.

## Nie rób
Migracji na prawdziwym Notion (pakiet I, STOP). Zmian zachowania trade'ów Live (P&L i R Live zostają ręczne).

## Uwaga z review C2 (sanitizeSettings, głębokość)
Kopia definicji sesji `settings.bt.sessionsCopy[i].def.filter.<drzewo>` idzie przez `sanitizeSettings` (`lib/sync.mjs`, max 6 poziomów, napisy do 500 znaków, tablice do 200 elementów): głębokie drzewo filtra albo długa lista `pool`/`excluded` zostanie ucięta lub zamieniona w `null`. E2 musi to uwzględnić (np. kopiować tylko pola płaskie i filtr jako ograniczone drzewo, albo podnieść limity w `sanitizeSettings` z testem) i sprawdzić odtworzenie sesji z kopii.
