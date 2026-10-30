# Etap B2: silnik wypełnień (czysty moduł)

Model: **Opus**. Review po pakiecie: brak (review po C2). Najpierw `00-wspolne.md`.

## Cel
`public/js/bt-wypelnienia.js`: zlecenia market/limit/stop, SL/TP, BE, częściowe i ręczne zamknięcie, wielkość pozycji z ryzyka, wynik w R i USD, MAE/MFE. Liczy na strumieniu bazowym z B1 (1s w oknie prawdziwych sekund, 1m poza nim: nigdy na sekundach syntetyzowanych z 1m, §5).

## Przeczytaj
- `public/js/bt-swieca.js` (z B1: `Stream`, `visibleCount`, definicja kursora w karcie B1).
- `public/js/rysunki.js` 167-206 (`TICKS`, `roundTick`, `resultR`: ta sama konwencja R).

## Pliki
- Utwórz: `public/js/bt-wypelnienia.js`, `testy/backtest-B2-wypelnienia.mjs`.

## Interfejsy
- Consumes: `Stream`, `visibleCount(stream, cursor)` (B1); `roundTick(p, tick)` z `public/js/rysunki.js`.
- Produces (jak w 00-wspolne): `MULT`, `TICK`, `sizeFromRisk`, `emptyBook`, `placeOrder`, `cancelOrder`, `modifyPosition`, `moveToBE`, `closePartial`, `closeAll`, `advance`, `tradeResult`, `excursions`.
- Typy: `Order = { id, instrument, side: 'buy'|'sell', type: 'market'|'limit'|'stop', price, qty, sl, tp, placedT }`; `Position = { id, instrument, dir, qty, openQty, entryT, entryPrice, sl0, sl, tp, be, exits }`; `Book = { orders, positions: { [Inst]: Position|null }, hw, hwi, seq }` (bez `closed`: decyzja po review C2, zamknięte pozycje żyją w zdarzeniu `closed` i w `session.trades`); ``; `Event = { type: 'filled'|'exit'|'closed'|'rejected'|'cancelled', … }` (`closed` niesie pełną `Position` do journalingu).

## Reguły (decyzje [S] z §7 i [B] tej karty)
- Market: wypełnienie natychmiast po `last.price` (zamknięcie ostatniej widocznej świecy bazowej), `entryT = last.t`.
- Limit: przy dotknięciu (`low ≤ L` kupno, `high ≥ L` sprzedaż) po cenie limitu, także przy luce.
- Stop (wejście i SL): przy dotknięciu po cenie wyzwolenia, a przy luce po `open` świecy (gorsza cena).
- TP: jak limit (po cenie TP).
- **SL i TP w tej samej świecy → SL.** W świecy wejścia sprawdzany jest tylko SL (TP dopiero od następnej świecy).
- Jedna pozycja na instrument (18a.3); ES i NQ niezależnie; MNQ i NQ to osobne instrumenty zleceń, ale ten sam strumień danych. Gdy pozycja jest otwarta, nowe zlecenie wejścia na ten instrument → `rejected` (`reason: 'position-open'`). Gdy wypełni się jedno zlecenie wejścia, pozostałe oczekujące wejścia tego instrumentu → `cancelled` ([B]).
- Znak wodny `hw`: `advance` przetwarza tylko świece bazowe z `t + len > hw` i `t + len ≤ cursor`, potem `hw = max(hw, cursor)`. Cofnięcie kursora niczego nie cofa ani nie przetwarza drugi raz ([B] do 8: „nic nie znika”). Zlecenia przy `cursor < hw` → `rejected` (`reason: 'rewound'`).
- R z ceny wejścia i pierwotnego SL (`sl0`), ważone ilością częściowych wyjść: `R = Σ qty_i·(exit_i − entry)·s / (qty·|entry − sl0|)`, `s = +1` Long, `−1` Short. USD = `Σ (exit_i − entry)·s·MULT·qty_i`. Zaokrąglenie R do 0,01, USD do 0,01.
- BE: `sl = entryPrice`, `be = true`; R nadal z `sl0`.
- MAE/MFE w R: najgorsze/najlepsze odchylenie ceny od wejścia między `entryT` a `exitT` (świece bazowe od świecy wejścia do świecy wyjścia włącznie), w jednostkach `|entry − sl0|`; MAE ≤ 0, MFE ≥ 0.
- Wielkość: `floor(riskUsd / (|entry − sl|·MULT[inst]))`, `0` gdy wynik < 1 (UI pokazuje komunikat i pole ręczne).

## Zadanie 1: testy

- [x] **Testy** `testy/backtest-B2-wypelnienia.mjs` (ręczne strumienie z `len`):
  - `backtest-B2: SL wygrywa z TP w jednej świecy` — Long 100, SL 99, TP 101, świeca `[t,100,101.5,98.5,100.5]` → wyjście 99, `r === -1`.
  - `backtest-B2: limit po cenie limitu` — kupno limit 99.5, świeca z `low 99` → `entryPrice 99.5`; świeca otwarta luką na 98 → nadal 99.5.
  - `backtest-B2: stop przy luce po otwarciu` — kupno stop 101, świeca `open 102` → wejście 102; SL Long 99, świeca `open 98` → wyjście 98, `r < -1`.
  - `backtest-B2: market po ostatniej cenie` — `placeOrder(…market, last={t, price:100.25})` → `filled` 100.25 bez `advance`.
  - `backtest-B2: w świecy wejścia tylko SL` — limit wypełniony w świecy, która dotyka też TP → pozycja otwarta; ta sama świeca dotyka SL → wyjście po SL.
  - `backtest-B2: częściowe zamknięcie i R ważone` — Long 2 kontrakty 100, SL 99; `closePartial(1, last 101)`, potem TP 102 → `r === 1.5`, `pnl === (1+2)*20` dla NQ, dwa wpisy `exits` (`partial`, `tp`), zdarzenie `closed` dopiero po drugim.
  - `backtest-B2: BE` — `moveToBE` → `sl === entryPrice`, wyjście po BE daje `r === 0`, `pnl === 0`.
  - `backtest-B2: jedna pozycja na instrument` — druga pozycja NQ → `rejected`; równoległa ES dozwolona; wypełnienie jednego wejścia anuluje drugie oczekujące wejście NQ.
  - `backtest-B2: znak wodny` — `advance` do 10:05, cofnięcie do 10:00 i `advance` do 10:05 → zero nowych zdarzeń; `placeOrder` przy `cursor < hw` → `rejected` `rewound`.
  - `backtest-B2: MAE i MFE w R` — Long 100, SL 98, ceny między wejściem a wyjściem 99 i 103 → `maeR === -0.5`, `mfeR === 1.5`.
  - `backtest-B2: mnożniki i wielkość` — `MULT` = ES 50, NQ 20, MES 5, MNQ 2; `sizeFromRisk({riskUsd:500, entry:100, sl:98, instrument:'NQ'}) === 12`; ryzyko 30 USD, SL 2 pkt NQ → `0`.
  - `backtest-B2: modyfikacja SL/TP` — przeciągnięty SL powyżej ceny dla Long zaokrąglony do ticka 0.25; SL po złej stronie ceny bieżącej → `rejected` `bad-sl`.
  - `backtest-B2: zamknięcie na koniec dnia` — `closeAll(…, reason 'eod')` → `exits[0].reason === 'eod'`, cena = `last.price`.
- [x] Uruchom `node testy/run.mjs backtest-B2` → FAIL.

## Zadanie 2: implementacja
- [x] Zaimplementuj funkcje z sygnaturami z „Interfejsy”. Funkcje nie mutują wejściowego `book` (zwracają nowy obiekt; test `backtest-B2: niezmienność` porównuje `JSON.stringify` wejścia przed i po).
- [x] Testy zielone; pełny przebieg do pliku; commit `dodaje silnik wypełnień backtestu`; wpis w `postep.md`.

## Gotowe, gdy
Wszystkie `backtest-B2:` zielone; moduł bez DOM; wartości z §7 (SL przed TP, mnożniki 50/20/5/2) pokryte testami.

## Nie rób
Prowizji ani poślizgu (nie-cel). Kilku pozycji na instrument.
