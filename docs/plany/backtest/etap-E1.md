# Etap E1: journaling po zamknięciu, „do uzupełnienia”, Zakończ dzień

Model: **Sonnet**. Review po pakiecie: brak (review po E2). Najpierw `00-wspolne.md`.

## Cel
§10: w trakcie trade'a nic nie przerywa. Po pełnym zamknięciu pozycji instrumentu w rogu wykresu pojawia się mały panel: ceny, czasy, R/USD, MAE/MFE wypełnione, użytkownik wybiera **setup** (podpowiedzi + nowy) i opcjonalnie **notatkę**. **Enter** zapisuje lokalnie, **Esc** zapisuje bez opisu na listę „do uzupełnienia”. Replay nigdy nie czeka. Przy zamknięciu do trade'a przypina się migawka rysunków instrumentu z dnia. „Zakończ dzień” zamyka dzień według 18a.3 i przechodzi do następnego dnia z puli (wysyłka do Notion dochodzi w E2).

## Przeczytaj
- `lib/data.mjs` 54-70 (`optionNames` ról: skąd lista opcji `setup`); `public/js/app.js` 806 (wzór listy setupów).
- `public/js/bt-replay.js` (miejsca `// E1`, `onClosed`), `public/js/bt-rysunki.js` (`snapshot`), `public/js/bt-wypelnienia.js` (`tradeResult`, `excursions`, `closeAll`), `public/js/bt-klient.js`.
- `public/js/rysunki.js` 485-490 (wzór obsługi Enter/Esc w polu z `stopPropagation`).

## Pliki
- Utwórz: `public/js/bt-journal.js`, `testy/backtest-E1-journal.mjs`, `testy/backtest-journal.html`.
- Zmień: `public/js/bt-replay.js`, `public/js/bt-widok.js` (licznik „do uzupełnienia”), `public/features.css`, `public/i18n/en.json`.

## Interfejsy
- Consumes: `onClosed(position)` (C2), `snapshot(sym, day)` (D1), `tradeResult`, `excursions`, `closeAll` (B2), `createSessionClient().save` (C1).
- Produces: `toTrade(position, { day, contract, stream, drawings }) → Trade` (kształt `Trade` z 00-wspolne, `journal: 'todo'`, `notion: { id: null, state: 'pending' }`); `mountJournal(host, { trade, setups, onSave(patch), onSkip() }) → { close() }`; `endDay(session, { last, confirm }) → Promise<{ session, closed: Trade[] }>` w `bt-replay.js`; lista „do uzupełnienia” = `session.trades.filter(t => t.journal === 'todo')`.

## Zadanie 1: trade z pozycji i panel
- [x] **Testy** `testy/backtest-E1-journal.mjs` (część w Node, część na `testy/backtest-journal.html`):
  - `backtest-E1: toTrade` — z zamkniętej pozycji Long NQ: `entryPrice`, `exitPrice` (średnia ważona wyjść), `r`, `pnl`, `maeR`, `mfeR`, `be`, `contract`, `drawings` = migawka; `journal === 'todo'`, `notion.state === 'pending'`; `id` unikalne w sesji (`t1`, `t2`, …).
  - `backtest-E1: zapis natychmiast przy zamknięciu` — trade w pliku sesji zanim panel się pojawi (zamknięcie karty z otwartym panelem nie gubi trade'a).
  - `backtest-E1: panel tylko po pełnym zamknięciu` — częściowe zamknięcie nie otwiera panelu; pełne otwiera; panel w rogu wykresu instrumentu, nie zasłania świec przy kursorze (prostokąt panelu nie przecina x kursora ± 40 px; przy kolizji przesuwa się do drugiego rogu).
  - `backtest-E1: Enter i Esc` — Enter zapisuje `setup` i `notes`, `journal: 'done'`; Esc zapisuje bez opisu, `journal: 'todo'`; w polu notatki Enter z Shift = nowa linia; panel nie łapie skrótów replayu poza swoimi polami.
  - `backtest-E1: replay nie czeka` — przy otwartym panelu `Shift+ArrowRight` poza polem i odtwarzanie działają; drugi zamknięty trade podczas otwartego panelu → poprzedni trafia na listę „do uzupełnienia” (Esc), nowy panel się otwiera.
  - `backtest-E1: setup z podpowiedzi i nowy` — lista z `optionNames.setup` + setupów z trade'ów sesji; wpisanie nowej nazwy zapisuje ją w trade'cie (opcja w Notion powstaje dopiero w E2).
  - `backtest-E1: brak oceny wykonania` — panel nie ma pól innych niż setup i notatka ([U] «usuń ocenę wykonania…»).
  - `backtest-E1: do uzupełnienia` — lista w pasku replayu i na liście sesji; kliknięcie otwiera ten sam panel dla trade'a.
- [x] `node testy/run.mjs backtest-E1` → FAIL; zaimplementuj `bt-journal.js` i podpięcie w `bt-replay.js`; testy zielone.

## Zadanie 2: Zakończ dzień
- [x] **Testy** (ten sam plik):
  - `backtest-E1: Zakończ dzień z otwartą pozycją` — pytanie „Zamknąć po bieżącej cenie?”; „tak” → `closeAll(…, 'eod')` po cenie i czasie kursora, trade zapisany, panel journalingu nie blokuje przejścia (trade ląduje jako `todo`, gdy panel nie został zamknięty); „nie” → dzień nie kończy się.
  - `backtest-E1: oczekujące zlecenia anulowane` — po zakończeniu dnia `book.orders` puste, zdarzenia `cancelled`.
  - `backtest-E1: koniec danych` — kursor dochodzi do `times.end` (16:00 NY) albo do ostatniej świecy dnia skróconego: to samo pytanie i ta sama ścieżka.
  - `backtest-E1: następny dzień` — `days[day].status = 'done'`, `dayIdx + 1`, kursor = `nyAt(nextDay, startTime)`, dzień odsłonięty (data widoczna przy kolejności losowej po zakończeniu); ostatni dzień puli → ekran „Sesja ukończona” z wejściem do statystyk.
  - `backtest-E1: pagehide` — zamknięcie karty w trakcie dnia z otwartą pozycją: po ponownym otwarciu ten sam kursor, `book`, pozycja i rysunki.
- [x] Zaimplementuj `endDay` (pytanie przez istniejący `confirmDialog({ title, text, ok, cancel })` z `public/js/modal.js:23`), skok `nextDay` z C2 przechodzi przez `endDay`.
- [x] Pełny przebieg; commit `dodaje journaling po zamknięciu i kończenie dnia`; wpis w `postep.md`. Zrzuty: najwyżej 2 (panel journalingu Onyx i Platinum).

## Gotowe, gdy
Trade zapisuje się lokalnie w chwili zamknięcia, panel jest opcjonalny i nie zatrzymuje replayu, „Zakończ dzień” działa z pozycją, zleceniami i końcem danych; `backtest-E1:` zielone.

## Nie rób
Wysyłki do Notion (E2). Pól poza setupem i notatką.
