# Moduł Backtest (1.5.0): plan wykonania, zasady wspólne

> **Dla agentów:** wymagany skill `superpowers:executing-plans` (albo `superpowers:subagent-driven-development`). Kroki to pola `- [ ]`. Czytasz TYLKO ten plik, swoją kartę `etap-XX.md` i `postep.md`. Projektu `../backtest-projekt.md` nie czytasz w całości: karta podaje potrzebne punkty.

**Goal:** pełny moduł backtestu w JustJournal: replay świeca po świecy na lokalnych świecach (NQ: prawdziwe 1s 9:30–11:00 NY; ES tylko 1m), zlecenia z dokładnymi wypełnieniami, journaling w kilka sekund po zamknięciu, sesje z filtrem dni, kilka wykresów, statystyki i zapis lokalny z wysyłką do Notion.

**Architecture:** serwer oddaje cały dzień replayu jednym zapytaniem (kontekst 1m + okno 1s), a „brak przyszłości” zapewniają czyste moduły przeglądarki (`public/js/bt-*.js`, działają też w Node): zegar i świeca w budowie, silnik wypełnień, filtr dni, statystyki. Stan sesji żyje w pliku `chart-data/backtest/sessions/<id>.json` (źródło prawdy), a „Zakończ dzień” wysyła trade'y do bazy Trade'y w Notion (`typ=Backtest`, pole „Sesja backtestu” z migracji 006). Wykres replayu to Lightweight Charts z paczką rysowania 0.6.2, sterowany przez `series.update()`.

**Tech Stack:** Node ≥ 22, vanilla JS (ES modules), Lightweight Charts + `lightweight-charts-drawing` 0.6.2 z `public/vendor/`, testy `node testy/run.mjs` + strony `testy/*.html` w headless Chrome/Edge (`testy/przegladarka.mjs`).

**Spec:** `docs/plany/backtest-projekt.md` (zaakceptowany 30.10.2026; sekcje 18a i 19 wiążące).

Ścieżki względem korzenia worktree `R:/PROJEKTY/trading-hq-wt/backtest` (gałąź `feat/backtest` od `main` eb7e194, 1.4.1).

## Global Constraints

- Zero zależności npm, bez kroku build. Biblioteki tylko jako pliki w `public/vendor/` z licencją. Bez `npm`/`npx`/`pnpm`.
- Teksty UI i serwera przez `t('polski tekst')`, tłumaczenie w `public/i18n/en.json` (formy mnogie `t.p` w obu słownikach). Test `node testy/run.mjs i18n` musi być zielony.
- Kolory wyłącznie z tokenów CSS (`--profit`, `--loss`, `--be`, `--fg`, `--fg-2`, `--line`, `--chart-line`, `--popover`, `--n-*`), w canvasie przez `readColors()`. Wygląd jak reszta dashboardu: `.seg`, `.btn`, `.check`, `.sp-in`, `.note`, `.empty`, popover Ustawień, przezroczyste tło wykresu. Motywy Onyx i Platinum. 1920×1080 bez przewijania okna, 375 px bez poziomego przewijania.
- Komentarze po polsku; przy decyzji: słowa użytkownika i numer (np. `// [U] 30.10.2026 «…»`, `// 18a.3`).
- Migracje Notion tylko addytywne (`addProperty`, `addOption`, `addView`, `addPageBlock`). Nowej bazy nie da się dodać.
- Testy wyłącznie na atrapach (`testy/atrapa-notion.mjs`) i danych syntetycznych. Nigdy prawdziwe Notion ani sieć. ES w tym module ma tylko 1m: zakup ES 1s w Databento anulowany 30.10.2026 («Nie potrzebuje narazie tego jednak»), więc nie ma importu ES 1s ani atrapy Databento.
- **Produkcyjnej instalacji `R:/PROJEKTY/trading-hq` nie dotykać** (ani zapisu w jej `chart-data/`, `.env`, `config.local.json`), z jednym wyjątkiem: pakiet H1 KOPIUJE (tylko odczyt) wybrane świece do katalogu poza repo. Port 4321 = prawdziwy dashboard: zakaz. Testowy dashboard: `node testy/start-test.mjs` (4331).
- Dane CME tylko do użytku własnego: świece nigdy w repo, w testach (fixture), w zrzutach dołączanych do wydania ani w commitach. Kopia do odbioru: `R:/PROJEKTY/trading-hq-wt/backtest-dane/` (poza worktree).
- Ustawienia synchronizowane przez blok ustawień przechodzą przez `sanitizeSettings` (`lib/sync.mjs:12,18`): klucz pasujący do `/token|secret|password|haslo|hasło|pin|key|databento|chart…/i` jest WYCINANY. Dlatego skróty klawiszowe to pole `skrot` / `skroty`, nigdy `key`/`keys`/`hotkey`.
- Wersja wydania: **1.5.0**.
- Commity: lokalnie na `feat/backtest` po każdym pakiecie (zgoda użytkownika z 30.10.2026, §19). `git add` po ścieżkach, nigdy `-A`. Opis po polsku, tryb oznajmujący („dodaje silnik wypełnień”), drugi `-m`: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Autor z lokalnej konfiguracji (nie zmieniać `git config`). **Push, tag, merge, release i aktualizacja produkcji tylko po „ok” użytkownika** (pakiet I).

## Review Focus

1. Dzień, w którym okno 1s ma dziurę (brak transakcji przez kilka sekund albo brak pliku dnia jednego z dwóch instrumentów; dla ES wymagane jest tylko pokrycie 1m): replay nie może się zatrzymać ani pokazać świecy z przyszłości; świeca w budowie stoi, a dzień bez pokrycia jest wykluczony w kreatorze z powodem (test: B1 `luka w 1s`, F1 `dzień bez 1s`).
2. Przejście czasu letniego/zimowego NY (marzec, listopad) i dzień skrócony (np. 2024-11-29 do 13:15 NY, 2024-07-03): godziny 9:30/11:00/16:00 liczone w strefie NY, koniec dnia = koniec danych, gdy handel kończy się wcześniej (test: B1 `DST`, E1 `koniec danych`).
3. Zamknięcie karty lub awaria w trakcie trade'a albo między wysłaniem strony do Notion a zapisem jej id: po ponownym otwarciu stan jest ten sam, a ponowna wysyłka nie dubluje strony (test: E1 `pagehide`, E2 `utracona odpowiedź`).
4. Krok w tył przy otwartej pozycji i oczekujących zleceniach: nic nie znika, nic nie wypełnia się drugi raz, handel zablokowany do powrotu do „chwili bieżącej” (test: B2 `znak wodny`, C2 `wstecz blokuje zlecenia`).
5. Skrót z Ustawień → Backtest kolidujący ze skrótem wykresu albo innym skokiem oraz skrót wpisany w polu tekstowym (notatka journalingu): walidacja odrzuca kolizję, a klawisze w `input/textarea` nie sterują replayem (test: B1 `kolizja skrótów`, C2 `skrót w polu tekstowym`).

## Kolejność pakietów i zależności

Pakiety podzielone względem §17 projektu (B, C, D, E, F, H na dwie karty każdy), żeby czat z `00-wspolne.md` + kartą został lekki.

| Karta | Zakres | Model | Zależy od | Review po pakiecie |
|---|---|---|---|---|
| A | API dnia replayu (ES tylko 1m), syntetyczne dane testowe, pętla testów `backtest-*` | Sonnet | – | brak |
| B1 | rdzeń: strumień bazowy, świeca w budowie, kroki, skoki, skróty (czyste moduły) | Opus | A | brak |
| B2 | silnik wypełnień, wielkość pozycji, R/USD, MAE/MFE (czysty moduł) | Opus | B1 | brak |
| C1 | magazyn sesji + trasy, zakładka Backtest, formularz klasyczny, ekran replayu z 1 wykresem, krok/odtwarzanie | Opus | A, B1 | brak |
| C2 | zlecenia na wykresie, skoki, skróty, Ustawienia → Backtest | Sonnet | B2, C1 | `code-reviewer` (B1–C2) |
| D1 | wiele wykresów, wspólny zegar i krzyżyk, rysunki replayu per sesja i instrument | Sonnet | C2 | brak |
| D2 | rysunek callout we wszystkich wykresach | Sonnet | D1 | brak |
| E1 | journaling po zamknięciu, „do uzupełnienia”, migawka rysunków, Zakończ dzień | Sonnet | D2 | brak |
| E2 | migracja 006, wysyłka do Notion z kolejką i idempotencją, licznik, kopia definicji | Opus | E1 | `code-reviewer` + `security-auditor` (nowe trasy zapisu) |
| F1 | indeks cech dnia (serwer) + moduł filtra (czysty), rozszerza wersje minimalne z C1 | Sonnet | C1 | brak |
| F2 | filtr zaawansowany w kreatorze, licznik na żywo, szablony | Sonnet | F1, C1 | brak |
| G | statystyki sesji i „Gdzie mam przewagę” | Sonnet | E2, F1 | `code-reviewer` |
| H1 | odbiór funkcjonalny i wydajność na kopii prawdziwych świec | Opus | wszystkie | brak |
| H2 | zrzuty i ocena wyglądu, przegląd całej gałęzi | Haiku (zrzuty) + `visual-reviewer`, `code-reviewer`, `security-auditor` | H1 | to jest review |
| I | wydanie 1.5.0, migracja 006 na prawdziwym Notion | Sonnet | H2 + „ok” | – |

Graf: `A → B1 → B2 → C2`, `A,B1 → C1 → C2 → D1 → D2 → E1 → E2 → G`, `C1 → F1 → F2`, `F1 → G`, wszystko → `H1 → H2 → I`. F1 i F2 wolno zrobić zaraz po C1 (przed C2) w osobnym czacie. Bez równoległości w jednym worktree. Kolejność domyślna: A, B1, B2, C1, C2, D1, D2, E1, E2, F1, F2, G, H1, H2, I.

## Wspólne interfejsy (jedno źródło prawdy)

Typy: `Bar = [t, o, h, l, c, v]` (t = sekundy epoki UTC początku świecy, ceny w punktach jak w `/api/candles`), `Range = [from, to)` w sekundach, `Day = 'YYYY-MM-DD'` (dzień handlowy NY), `Sym ∈ {'ES','NQ'}`, `Inst ∈ {'ES','NQ','MES','MNQ'}` (MES→ES, MNQ→NQ przez `FAMILY` z `public/js/kontrakty.js:14`). Czasy NY przez `etToUtc`/`etDayOf` (`lib/news.mjs:44-50`), sesje CME przez `public/js/swiece.js`.

**Serwer**

| Plik | Eksport / trasa | Sygnatura |
|---|---|---|
| `lib/candles.mjs` | zwracane przez `createCandles` | `readRaw(q, { noSynth: true }) → wynik readOne` (alias istniejącego `readOne`, `candles.mjs:444`) |
| `lib/backtest-day.mjs` | `createReplayDay({ candles, news, earnings })` | `.read({ instruments: Inst[], day: Day, ctx = 2 }) → ReplayDay` |
| | `dayTimes(day: Day) → { open, w1sEnd, end }` | 9:30, 11:00, 16:00 NY w sekundach UTC |
| trasa | `GET /api/backtest/day?instruments=NQ,ES&day=2024-03-12&ctx=2` | `ReplayDay` (JSON) |
| `lib/backtest-store.mjs` | `createBacktestStore({ baseDir })` | `.list() → SessionSummary[]`, `.read(id) → Session\|null`, `.save(id, doc, baseRev) → { rev }` (409 `stale`), `SESSION_ID_RE = /^bt-[a-z0-9]{6,20}$/`, `SESSION_BODY_LIMIT = 4 * 1024 * 1024` |
| trasy | `GET /api/backtest/sessions`, `GET /api/backtest/session/<id>`, `POST /api/backtest/session/save {id, doc, rev}` | zapis przez `guardWrite` |
| `lib/backtest-index.mjs` | `dayFeatures(day, src) → DayFeatures`, `createDayIndex({ candles, news, earnings, baseDir })` | `.get({ instruments, from, to }) → { days: DayFeatures[], version }`, `INDEX_VERSION = 1`. Pula dni: dla NQ/MNQ wymagane `has1s.NQ` (prawdziwe 1s `[9:30, 11:00)` NY, powód wykluczenia `no1s`), dla ES/MES wymagane `has1m.ES` (pokrycie 1m `[9:30, 16:00)` NY, powód `no1m`); ES nie wymaga 1s (decyzja 30.10.2026) |
| trasa | `GET /api/backtest/days?instruments=NQ&from=2024-01-01&to=2024-12-31` | `{ days, version }` |
| `lib/backtest-sync.mjs` | `createBacktestSync({ store, writer, drawings, data, t, now })` | `.push({ sessionId, day? }) → { sent, skipped, failed: [{ tradeId, error }], pending }`, `.pending(sessionId) → number`, `btMarker(sessionId, tradeId) → '[bt-…/t…]'` |
| trasa | `POST /api/backtest/notion {sessionId, day?}` | wynik `push`; `guardWrite` |
| `lib/writes.mjs` | `buildTradeProps` | nowe klucze wejścia `btSession` → rola `btSession` (`rich_text`, do 200 znaków), `btMae` → rola `btMae` i `btMfe` → rola `btMfe` (`number`, opcjonalne, MAE/MFE w R) |
| `migrations/006-sesja-backtestu.mjs` | `version: 6` | trzy `addProperty` na `trades`: `btSession rich_text {pl:'Sesja backtestu', en:'Backtest session'}`, `btMae number {pl:'MAE (R)', en:'MAE (R)'}`, `btMfe number {pl:'MFE (R)', en:'MFE (R)'}` |

`ReplayDay = { day, tz: 'America/New_York', times: { ctxFrom, open, w1sEnd, end }, inst: { [Inst]: { data: Sym, contract, m1: Bar[], s1: Bar[], real1s: Range[], has1s: boolean, rolls } }, news: Event[], earnings: Earning[] }`. `m1` obejmuje `[ctxFrom, end)`, `ctxFrom` = otwarcie sesji CME `ctx` dni handlowych wcześniej; `s1` tylko z pokrycia 1s (bez syntetyków); `has1s` = `real1s` pokrywa całe `[open, w1sEnd)`. Dla `data: 'ES'` zawsze `s1 = []`, `real1s = []`, `has1s = false` (ES tylko 1m, decyzja z 30.10.2026), niezależnie od ewentualnych starych okien 1s ±30 min w danych.

**Przeglądarka i Node (czyste moduły, bez DOM)**

| Plik | Eksport | Sygnatura |
|---|---|---|
| `public/js/bt-swieca.js` | `mergeBase(m1, s1, real1s) → Stream` | `Stream = { bars: Bar[], len: number[] }`, `len[i] ∈ {1, 60}` (1s w `real1s`, 1m poza) |
| | `visibleCount(stream, cursor) → number` | świeca bazowa widoczna ⇔ `t + len ≤ cursor` |
| | `candlesAt(stream, tf, cursor) → Bar[]` | wzorzec: `aggregate` widocznych świec bazowych |
| | `createBuilder(stream, tf) → { seek(cursor) → Update, bars() → Bar[] }` | `Update = {kind:'reset', bars} \| {kind:'update', bar} \| {kind:'append', bars}` |
| | `REPLAY_TFS` | `['1s','5s','10s','15s','30s','1m','2m','3m','5m','15m','30m','1h']` |
| `public/js/bt-czas.js` | `nyAt(day, 'HH:MM') → sec`, `stepSec(tf, cursor, real1s) → number`, `nextCursor(cursor, dir, tf, real1s, bounds) → sec` | `bounds = { min, max }`, `max = times.end` |
| | `jumpTarget(jump, ctx) → { cursor } \| { nextDay: true, at: 'HH:MM' } \| null` | `ctx = { cursor, day, times, news, startTime }` |
| | `DEFAULT_JUMPS: Jump[]`, `DEFAULT_SKROTY: Skroty`, `RESERVED_SKROTY: string[]`, `skrotOf(ev) → string`, `collisions(skroty, jumps) → [{ a, b, skrot }]` | |
| | `visibleNews(events, cursor) → Event[]`, `nextNews(events, cursor, minImp) → Event\|null` | |
| `public/js/bt-wypelnienia.js` | `MULT = { ES:50, NQ:20, MES:5, MNQ:2 }`, `TICK = 0.25` | |
| | `sizeFromRisk({ riskUsd, entry, sl, instrument }) → number` | `floor`, `0` gdy za mało |
| | `emptyBook() → Book`, `placeOrder(book, order, last) → Result`, `cancelOrder(book, id) → Book`, `modifyPosition(book, inst, { sl?, tp? }) → Result`, `moveToBE(book, inst) → Result`, `closePartial(book, inst, qty, last) → Result`, `closeAll(book, inst, last, reason) → Result`, `advance(book, inst, stream, cursor) → Result` | `Result = { book, events: Event[] }`, `last = { t, price }` |
| | `tradeResult(pos) → { r, pnl, exitPrice, exitT }`, `excursions(pos, stream) → { maeR, mfeR }` | |
| `public/js/bt-filtr.js` | `evalFilter(tree, f, sym) → boolean`, `matchDays(def, days) → { days: Day[], excluded: [{ day, reason }] }`, `orderDays(days, order, seed) → Day[]`, `dayTags(f) → string[]`, `COND_KINDS` | |
| `public/js/bt-staty.js` | `MIN_N = 20`, `summary(trades)`, `equityR(trades)`, `edgeTable(trades, by, { tagsOf })`, `execution(trades) → { …, withData, without }` (liczy tylko trade'y z `maeR`/`mfeR` różnymi od `null`), `compareLive(bt, live)`, `mergeBacktest(notionTrades, sessions) → Trade[]` (z Notion `btMae`/`btMfe` → `maeR`/`mfeR`, brak pola → `null`) | `by ∈ {'setup','wd','hour','dayType','dir'}` |

**Przeglądarka (UI)**: `public/js/bt-widok.js` (zakładka: lista, kreator), `public/js/bt-replay.js` (ekran, pasek, sterowanie), `public/js/bt-wykres.js` (`createReplayChart(host, { instrument, tf, colors, onCrosshair }) → { apply(update), setCursorLine(t), resize(), bars(), destroy() }`), `public/js/bt-klient.js` (`createSessionClient({ fetchImpl }) → { load(id), save(doc, { now }), flush(), pending() }`), `public/js/bt-journal.js`, `public/js/bt-kreator.js`, `public/js/bt-staty-widok.js`. Style w `public/features.css` z prefiksem `.bt-`.

**Plik sesji** `chart-data/backtest/sessions/<id>.json` (zapis atomowy tmp + rename):
`{ v: 1, id, rev, name, created, updated, def: { instruments, from, to, balance, risk: { mode: 'usd'|'pct', value }, startTime: '09:00', order: 'chrono'|'newest'|'random', seed, accountId, filter, excluded }, pool: Day[], dayIdx, cursor, hw, layout: { kind: '1'|'2h'|'2v'|'4', charts: [{ instrument, tf }], active }, days: { [Day]: { status: 'todo'|'active'|'done' } }, book: Book, trades: Trade[], drawings: { [Sym]: { [Day]: DrawingDoc } } }`.
`Trade = { id: 't<n>', day, instrument, contract, dir: 'Long'|'Short', qty, entryT, entryPrice, sl0, sl, tp, be: boolean, exits: [{ t, price, qty, reason: 'sl'|'tp'|'manual'|'partial'|'eod' }], exitT, exitPrice, r, pnl, maeR, mfeR, setup, notes, journal: 'done'|'todo', drawings: DrawingDoc, notion: { id, state: 'pending'|'sent'|'error', error } }`.
`DrawingDoc` = format paczki 0.6.2 jak dziś (`{ v: 1, at, d: [...] }`, `public/js/rysunki.js:20` `docOf`).

**Ustawienia** (blok ustawień, klucz `bt`): `{ jumps: Jump[], skroty: Skroty, startTime: '09:00', risk: { mode, value }, speed: 100, templates: [{ name, filter }], sessionsCopy: [{ id, name, def }] }`. `Jump = { id, name, cel: { kind: 'time', at } | { kind: 'session', id: 'asia'|'london'|'ny' } | { kind: 'news', minImp: 'high'|'medium' } | { kind: 'offset', sec } | { kind: 'nextDay' }, skrot }`.

## Punkty STOP użytkownika (sesja główna pyta, agent kończy raportem)

1. **Migracja 006 na prawdziwym Notion:** kopia (backup) → dry-run → „ok” użytkownika → zapis. Pakiet I.
2. **Wydanie:** merge, push, tag `v1.5.0`, release na GitHubie i aktualizacja produkcji tylko po „ok”. Pakiet I.

## Protokół czatu (oszczędność tokenów)

1. Nowy czat czyta: ten plik, swoją kartę, ostatnie wpisy `postep.md`. Nic więcej poza listą „Przeczytaj” z karty (duże pliki tylko zakresem linii lub `grep -n`). Bez szukania w sieci, chyba że karta mówi inaczej.
2. TDD: test czerwony → uruchomienie → kod → zielony. Testy w `testy/backtest-<karta>-<temat>.mjs` (`export default ({ test, H, assert, ROOT }) => {…}`), nazwa testu zaczyna się od `backtest-<karta>:` (np. `backtest-B2: SL wygrywa z TP w jednej świecy`). Strony przeglądarkowe `testy/backtest-*.html` (wynik w `<pre id="wynik">PASS …</pre>`), uruchamiane z testu przez `dumpDom`/`cdpPage` z `testy/przegladarka.mjs` na serwerze z `THQ_TEST_PAGES=1` (`/__testy/…`).
3. W trakcie: `node testy/run.mjs backtest-<karta>`. Na końcu RAZ pełny przebieg do pliku: `node testy/run.mjs > R:/PROJEKTY/trading-hq-wt/backtest-wyniki/<karta>.txt 2>&1`, do kontekstu tylko ostatnie ~15 linii i linie `✗`.
4. Koniec pakietu: pełne testy zielone → commit lokalny → dopisanie 5–10 linii do `postep.md` (format w pliku) → raport do sesji głównej (≤ 15 linii: co zrobione, wynik testów, hash, decyzje gustu, rozbieżności, pytania klasy trzeciej, ścieżki zrzutów). Bez diffów.
5. Decyzje: mechaniczne robisz; gustu robisz i wypisujesz w raporcie i `postep.md`; klasy trzeciej (pieniądze, dane, publikacja, sprzeczność ze słowami użytkownika) nie decydujesz: kończysz raportem z pytaniem. Poprawki po review: wznowienie TEGO SAMEGO agenta.
6. Zakazy: bez `git push`, merge, tagów, zmiany `git config`, bez plików spoza karty, bez czytania całego projektu, bez prawdziwego Notion.
