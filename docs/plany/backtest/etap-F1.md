# Etap F1: indeks cech dnia i moduł filtra

Model: **Sonnet**. Review po pakiecie: brak. Najpierw `00-wspolne.md`.

## Cel
§12 i 18a.7: cechy każdego dnia handlowego (kalendarz, newsy, wygasanie, earningsy, rynek przed 9:30) liczone raz i trzymane lokalnie, oraz czysty moduł filtra (warunki łączone przez i / lub / nie), na którym stoi kreator (F2) i „typ dnia” w statystykach (G). Rynek liczony **wyłącznie z danych przed 9:30 tego dnia**.

## Przeczytaj
- `lib/backtest-index.mjs`, `public/js/bt-filtr.js` (wersje minimalne z C1).
- `lib/news.mjs` 10-12 (`IMPS`, `KINDS`), 44-66 (czas ET, kształt zdarzenia), 116-125 (`inRange`); `lib/news-katalog.mjs` 39-70 (`FRED_RELEASES`: nazwy wydarzeń), 79-93 (`RULE_EVENTS`), 120-140 (FOMC); `grep -n "Fed Chair\|chair" lib/news-service.mjs | head` (przemówienia przewodniczącego).
- `lib/earnings.mjs` 12-16 (`SESSIONS`, `OPEN_SEC`), 38-55 (`makeEarning`: `cls`, `session`).
- `public/js/kontrakty.js` 14-40 (`FAMILY`, `ROLL_DAYS_BEFORE`, `rollAtFn`, `thirdFriday`).
- `public/js/swiece.js` 70-100 (`dayNum`, `weekdayOf`, `sessionOf`).

## Pliki
- Zmień: `lib/backtest-index.mjs`, `public/js/bt-filtr.js`, `server.mjs` (trasa już jest; parametry bez zmian), `public/i18n/en.json`.
- Utwórz: `testy/backtest-F1-indeks.mjs`, `testy/backtest-F1-filtr.mjs`.

## Interfejsy
- Consumes: `createReplayDay` / `readRaw` (A), `news.range`, `earnings.range`, `readCoverage`.
- Produces: `DayFeatures` (pełny kształt poniżej), `createDayIndex(...).get`, `INDEX_VERSION = 1`, plik `chart-data/backtest/day-index-<SYM>.json` (`{ version, coverageVersion, newsVersion, days: { [Day]: DayFeatures } }`, dociąganie tylko brakujących i nieaktualnych dni); `evalFilter`, `matchDays` (z filtrem), `dayTags`, `COND_KINDS`.

`DayFeatures = { day, wd /*1=pon…5=pt*/, month, has1s: { NQ }, has1m: { ES, NQ }, holiday: { before, after }, rollWeek, news: [{ name, kind, imp, hm, when: 'pre'|'open'|'post' }], fedChair, opex: 'monthly'|'quarterly'|null, opexWeek, earnings: [{ cls, when: 'bmo'|'prevAmc' }], mkt: { [Sym]: { gapPts, gapPct, onRange, prevRange, prevDir: 'up'|'down', inside, preVsPd: 'above'|'inside'|'below', atr14, atrRatio } } }`. `when`: przed 9:30 / 9:30–11:00 / po. `onRange` = high−low 18:00–9:30 NY; `gap` = otwarcie 9:30 względem zamknięcia 16:00 dnia poprzedniego; `preVsPd` = ostatnia cena przed 9:30 względem PDH/PDL; `atrRatio` = ATR(14) dzienne / średnia ATR(14) z 60 dni.

`Filter = { op: 'and'|'or', not: boolean, items: (Cond|Filter)[] }`; `Cond = { k: COND_KIND, not?: boolean, …parametry }`. `COND_KINDS`: kalendarz `wd`, `dateRange`, `month`, `preHoliday`, `postHoliday`, `rollWeek`; newsy `event` (`name`), `impAtLeast` (`imp`), `noImpAtLeast` (`imp`), `newsWhen` (`when`, opcjonalnie `imp`), `fedChair`; wygasanie `opex` (`type: 'monthly'|'quarterly'`), `opexWeek`; earningsy `earnings` (`maxCls` 1–4, `when`); rynek `gap` (`unit: 'pct'|'pts'`, `min`, `max`), `onRange`, `prevRange` (`min`, `max`), `prevDir` (`dir`), `inside`, `preVsPd` (`pos`), `atrRatio` (`min`, `max`). Warunki rynku biorą `sym` = pierwszy instrument sesji.

## Zadanie 1: indeks
- [x] **Testy** `testy/backtest-F1-indeks.mjs` (dane syntetyczne 3 tygodnie + newsy z plików `data/news/` + earningsy atrapy):
  - `backtest-F1: bez przyszłości w cechach rynku` — zmiana świec po 9:30 dnia D nie zmienia `mkt` dnia D (porównanie dwóch indeksów).
  - `backtest-F1: gap, overnight, poprzedni dzień` — wartości zgodne z ręcznym wyliczeniem na znanych świecach (gap 12,5 pkt, `gapPct` z zamknięcia 16:00, `onRange`, `prevRange`, `inside`).
  - `backtest-F1: newsy dnia` — CPI 2024-03-12 08:30 → `{ name: 'CPI', hm: '08:30', when: 'pre', imp: 'high' }`; FOMC 14:00 → `when: 'post'`.
  - `backtest-F1: OPEX` — trzeci piątek marca → `opex: 'quarterly'`, kwietnia → `'monthly'`; `opexWeek` pon–pt tego tygodnia.
  - `backtest-F1: dzień bez danych` — `has1s.NQ === false` gdy pokrycie okna 1s niepełne; `has1m.ES === false` gdy pokrycie 1m `[9:30, 16:00)` niepełne; ES nie ma `has1s`.
  - `backtest-F1: pamięć indeksu` — drugie `get` nie liczy dni ponownie (licznik obliczeń 0); zmiana `coverageVersion` przelicza tylko zmienione dni; `INDEX_VERSION` inny → przeliczenie całości.
  - `backtest-F1: rok w czasie` — 260 dni syntetycznych: pierwsze zbudowanie < 4 s, odczyt z pamięci < 100 ms (pomiar na 6 latach prawdziwych świec robi H1).
- [x] FAIL → implementacja → zielone.

## Zadanie 2: filtr
- [x] **Testy** `testy/backtest-F1-filtr.mjs` (ręczne `DayFeatures`):
  - `backtest-F1: każdy warunek` — po jednym teście na każdy `COND_KINDS` (dzień pasujący i niepasujący).
  - `backtest-F1: i / lub / nie` — `{op:'and', items:[CPI, wd=2]}`, `{op:'or', …}`, `not` na warunku i na grupie, grupa zagnieżdżona dwa poziomy.
  - `backtest-F1: matchDays z filtrem` — wynik = dni pasujące i z danymi (NQ: 1s, ES: 1m); wykluczenia z powodami `no1s`, `no1m`, `manual`, `done`, `filter` (tylko dni z zakresu dat; `filter` nie trafia do listy wykluczeń widocznej w kreatorze, ale jest w liczniku).
  - `backtest-F1: dayTags` — dzień CPI z OPEX → zawiera `'CPI'` i `'OPEX'`; dzień bez newsów o wadze ≥ pomarańczowa → `'bez newsów'`; nazwy przez `t()`.
  - `backtest-F1: zły filtr` — nieznany `k` → wyjątek z komunikatem, nie `false` po cichu.
- [x] FAIL → implementacja → zielone; pełny przebieg; commit `dodaje indeks cech dnia i filtr dni`; wpis w `postep.md`.

## Gotowe, gdy
Indeks liczy się raz i jest przyrostowy, filtr obsługuje wszystkie grupy z §12 z i/lub/nie, cechy rynku nie widzą danych po 9:30; `backtest-F1:` zielone.

## Uwaga z przeglądu bezpieczeństwa E2 (S5, filtr w kopii ustawień)
Kopia definicji sesji (`bt.sessionsCopy`, `copyDef` w `public/js/bt-czas.js`) zapisuje drzewo filtra jako JSON pocięty na napisy (`filterJ`), więc filtr kluczy sekretów `sanitizeSettings` (`SECRET_KEY` w `lib/sync.mjs`) go nie widzi. Gdy F1 wprowadza drzewo filtra: przed `chunkJson` wytnij z drzewa rekurencyjnie klucze pasujące do `SECRET_KEY` (wspólny eksport reguły albo kopia w `bt-czas.js` z testem zgodności) i dodaj test `backtest-F1: kopia filtra bez kluczy wrażliwych`.
