# Etap 4: API świec (`lib/candles.mjs`, trasy w `server.mjs`, pakiet B)

Najpierw `00-wspolne.md`. Po tym etapie review: `code-reviewer` + `security-auditor`.

## Cel
Serwer odpowiada na `GET /api/candles`, wycenia i pobiera brakujące dni po kliknięciu, scala końcówki, nigdy nie pobiera sam.

## Przeczytaj
- `server.mjs`: 227-236 `guardWrite`, 237-255 `readJson`, 283-291 `meta()`, 293-300 i 380 `ACTIONS`, 515-550 obsługa POST (wzór specjalnego przypadku `sh` dla zrzutów), 552-572 trasy GET, 575-590 statyki. Zaczynaj od `grep -n`, nie czytaj całości.
- `lib/env.mjs` 10 (`ENV_KEYS`), 66-81 (`saveEnv`), 45-65 (`loadConfig`/`saveConfig`).
- `lib/updater.mjs` 12 (`PROTECTED`); `.gitignore`.
- `lib/shots.mjs` 44-72 (wzór zadania z kolejką/limitem równoległości).
- Moduły z etapów 1-3.

## Utwórz / zmień
- `lib/candles.mjs`, `server.mjs` (trasy, `meta()`), `lib/env.mjs` (`DATABENTO_API_KEY` w `ENV_KEYS`), `lib/updater.mjs` (`chart-data` w `PROTECTED`), `.gitignore` (`chart-data/`), `public/i18n/en.json`, `testy/wykresy-04.mjs`.
- Trasy: `GET /api/candles?instrument=&from=&to=&tf=`, `POST /api/candles/quote {instrument,from,to}`, `POST /api/candles/fetch {instrument,from,to,confirmedCostUsd}`, `GET /api/candles/status`; zapis klucza (`POST` do `.env`, sprawdzenie bezpłatnym `get_cost` na 1 minutę) i limitu kosztu (w `config.local.json`, NIGDY w `settings`). Wszystkie `POST` przez `ACTIONS`/`guardWrite`.
- Odpowiedź `GET`: `{ data:"ES", tf, bars:[[t,o,h,l,c,v]…], missing:[…], partial:[…], rolls:[{t,label}], availableEnd }`, ceny dziesiętne, limit 50 000 świec (powyżej 422 z podpowiedzią „Wybierz większy interwał albo krótszy zakres”). Instrument spoza mapy → odpowiedź „brak źródła”. `GET` nic nie pobiera z sieci.

## Testy najpierw (`wykresy-04:`)
- Walidacja `instrument`, `tf`, zakresu; limit 50 000; `missing`; „brak źródła” dla EURUSD/XAUUSD.
- `availableEnd` w odpowiedziach; zakres `quote`/`fetch` przycięty do `availableEnd`; dzień przecięty granicą → `partial` z `until`.
- Dociągnięcie po przesunięciu `availableEnd`: wycena i pobranie tylko brakującej końcówki, scalenie bez duplikatów, 1m przeliczona.
- Trade nowszy niż `availableEnd` → stan „jeszcze niedostępne” i zero `get_cost`/`get_range` w logu atrapy. Nic nie pobiera się bez `POST /fetch`.
- `POST` bez `X-THQ`/Origin → 403; zadanie z postępem w `/status`; zapis klucza do `.env` (w `THQ_CONFIG_DIR`); `meta()` ma `hasDatabentoKey`, nigdy klucza; `PROTECTED` i `.gitignore` zawierają `chart-data`.

## Gotowe, gdy
`node testy/run.mjs wykresy-04` i pełny przebieg zielone. Klucz nie występuje w żadnym logu serwera ani odpowiedzi (test grep).

## Nie rób
Nie uruchamiaj niczego prawdziwym kluczem ani Databento. Nie dopisuj klucza ani limitu do `settings`/sync. Nie wołaj `get_cost` w `GET`. Nie hardkoduj 24 h.

## Pytanie do użytkownika w raporcie (P23, klasa trzecia: pieniądze i klucz)
Czy wolno wykonać RĘCZNIE, kluczem użytkownika, bezpłatne `get_dataset_range` oraz `get_cost` dla 1 dnia ES 1s i 1 roku ES (wynik do planu p. 3.2a/4 i raportu)? Podaj gotowe polecenia `curl` z `$DATABENTO_API_KEY` jako placeholderem; sam ich nie uruchamiaj.

## Fakty
- Embargo bez abonamentu ok. 8 h (katalog GLBX.MDP3, PRZETESTOWANE 27.10.2026); wcześniejsze „24 h” z planu jest nieaktualne. W stanie „jeszcze niedostępne” użyj zmierzonego opóźnienia, a zapasowo stałej 8 h. Dokładne opóźnienie konta potwierdzi dopiero `get_dataset_range`. CZĘŚCIOWE.
- Dane z bieżącej sesji przez historyczne HTTP tylko z uprawnieniem live. CZĘŚCIOWE (roadmapa Databento). Brak wykresu z trwającej sesji to znane ograniczenie (R6), opis w README (etap 12).
- Limit kosztu jednego pobrania 1 USD (P2); `get_cost` dwukrotnie (przed potwierdzeniem i tuż przed `get_range`).
- `readJson` domyślnie 64 KB wystarcza dla tych tras (limit 256 KB dotyczy rysunków, etap 9).

## Zmiana P25, 27.10.2026 (obowiązuje zamiast opisu powyżej tam, gdzie się różni)
Słowa użytkownika: «okej zwiekszam limit do 50 usd ale sie upewniaj ze wszystko jest pobierane z darmowych kredytow akceptuje plan».
- `GET /api/candles` zwraca `{ data, tf, layer: "1m"|"1s", bars, covered, derived, missing, rolls, availableEnd }`; `missing`, `covered`, `derived` to zakresy `[[od,do]…]` (sekundy epoki) zamiast list dni; pola `partial` już nie ma. TF >= 1m (i wielokrotności 60 s) czytane z warstwy 1m, TF < 1m (np. 15s, 30s) tylko z warstwy 1s, czyli poza oknem 1s wynik jest pusty, a `missing` wskazuje brak. Tam, gdzie 1m jeszcze nie pobrano, a okno 1s jest, 1m liczona jest w pamięci z 1s (`derived`, nic nie zapisujemy).
- `POST /api/candles/quote|fetch` mają parametr `layer` (domyślnie `"1m"`, można `"1s"`); odpowiedź `quote`: `ranges` zamiast `days`, plus `credit`, `overCredit`.
- Nowe trasy POST (guardWrite): `/api/candles/windows` {trades:[{instrument,entry,exit}]|windows:[{instrument,from,to}]} (okno = wejście −30 min, wyjście +30 min, stała `WINDOW_PAD_SEC`; bliskie okna łączone, przerwa < 30 min), `/api/candles/queue-run`, `/api/candles/import` {instrument,from?,to?,dryRun? | confirmedCostUsd, limitsOverrideUsd?}. `GET /api/candles/status` zawiera `credit` i `queue` ({pending,blocked,reason,message,items}). `meta()` ma `chartCredit`.
- Kolejka okien 1s (`chart-data/queue.json`): najnowsze najpierw, okno czeka do `availableEnd`, limity 1 USD/pobranie i 3 USD/dobę, strażnik kredytu; `tick()` uruchamia timer serwera co 5 min (nigdy sam moduł).
- Strażnik kredytu (twardy, `config.local.json` → `chartCredit {startUsd:125, expires:"2027-04-26" (domyślnie dzień zapasu przed ok. 27.04.2027), spentUsd domyślnie 0,02 (wydane 27.10.2026 na test okna 1s), spentUsd}`): przed każdym `get_range` wycena <= pozostały kredyt i data < wygaśnięcie; liczą się tylko faktycznie pobrane. Edycja przez `/api/candles/limit` (`creditStartUsd`, `creditExpires`, `creditSpentUsd`). Nie ma API salda Databento.
- Import historii 1m: CLI `node narzedzia/import-historii-1m.mjs` (klient działającego dashboardu; domyślnie sama wycena).
- Świece z `partial`/`until`, "Dociągnij końcówkę" to teraz po prostu brakujący ogon pokrycia warstwy (zakres do `availableEnd`, `refresh:true` omija cache 15 min).
- Poprawki po przeglądzie: licznik kredytu i dobowy rosną PRZED `get_range` (pesymistycznie, zapis natychmiast); zmiana `creditStartUsd`/`creditSpentUsd`/`creditExpires` w `/api/candles/limit` wymaga `confirm:true`, a start <= 125; `enqueue` pomija złe pozycje (`invalid`), zachowuje stan zablokowanych, przy przepełnieniu zostawia najświeższe i raportuje `dropped`; import z `limitsOverrideUsd` świadomie omija dobowy sufit 3 USD (strażnik kredytu zostaje).
