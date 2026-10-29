// Warstwa świec między magazynem (candles-store) a klientem Databento: odczyt zakresu (bez sieci), wycena i pobranie brakujących
// zakresów po kliknięciu, kolejka okien 1s wokół trade'ów, import historii 1m, strażnik kredytu, zapis klucza i limitów.
// Nic nie pobiera samo przy imporcie modułu; get_cost/get_range tylko z quote/fetch/tick/import. Kolejkę uruchamia serwer (timer) albo test (tick()).
// P25 (27.10.2026, słowa użytkownika: «okej zwiekszam limit do 50 usd ale sie upewniaj ze wszystko jest pobierane z darmowych kredytow akceptuje plan»):
//  - dwie warstwy: 1m (historia z serwera, ohlcv-1m) i 1s (tylko okna wokół trade'ów, ohlcv-1s); 1m nie jest nadpisywana wynikami agregacji 1s;
//  - okno trade'a = [wejście − 30 min, wyjście + 30 min], bliskie okna łączone w jedno żądanie;
//  - każde get_range przechodzi strażnika kredytu (patrz creditProblem), bo Databento nie ma API salda.
// Znane ograniczenie (decyzja gustu): zmiana instrument_id dokładnie na granicy dwóch pobranych zakresów nie daje wpisu rolls (parser widzi
// tylko świece jednego zakresu); od P35 przełączenia .v.0 dociąga też darmowe symbology.resolve (contracts-xx.json), a znacznik na wykresie ma nazwy kontraktów.
// English: candle service: local store reads, quotes/downloads of missing ranges, 1s window queue, 1m history import, credit guard.
import { tr } from './i18n.mjs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
// P35 (28.10.2026, słowa użytkownika: «Tak żeby było jak najbardziej poprawnie», «Tak, do 0,40 USD», «Opcja, domyślnie wył.», «Tak, pole „Kontrakt”»):
//  - seria ciągła = kontrakt wg reguły rynku, nie .v.0. Reguła (kontrakty.js, measureSwitches): otwarcie pierwszej sesji, w której obrót nowego kontraktu
//    przewyższa stary (pomiar z pobranych świec, okno od sesji przed czwartkiem CME 8 dni przed 3. piątkiem do przełączenia .v.0); bez pomiaru reguła zapasowa:
//    poniedziałek tygodnia wygaśnięcia (ROLL_FALLBACK_DAYS). Czwartek CME to tylko początek okna pomiaru, w 130 zmierzonych rollach nie był dniem przewagi; świece kontraktu,
//    którego w danej chwili nie ma w .v.0, idą z warstwy kontraktu (np. 1m-ESH2026, symbol surowy ESH6); plan pobrania sam dokłada te zakresy;
//  - znacznik zmiany kontraktu = granica odcinków serii, z nazwami kontraktów („ESZ5 → ESH6”, nazwy z symbology.resolve w contracts-es.json);
//  - pole „Kontrakt” trade'a (albo kontrakt wg reguły w chwili wejścia) obowiązuje w całych sesjach trade'a (tradeSessions);
//  - back-adjust (adjust=1) przesuwa kontrakt o sumę luk późniejszych rolli (B-ADJ TradingView), domyślnie wyłączony;
//  - 1D zwraca prevIn: H/L poprzedniej sesji w kontrakcie sesji po zmianie kontraktu (PDH/PDL z kontraktu wyświetlanego).
// English: continuous series by market roll rule, contract layers, contract override per trade, back-adjust, PDH/PDL in the shown contract.
import { createDatabento, DatabentoError, resolveInstrument, DEFAULT_MAX_COST_USD, COST_TOLERANCE } from './databento.mjs';
import { readRange, readCoverage, writeRange, subtractRanges, clipRanges, intersectRanges, mergeRanges, readAux, writeAux, contractLayer, layerCoverage, coverageVersion } from './candles-store.mjs';
import { parseTf, pickSource, aggregate, splitMinute, sessionBounds, previousSession, sessionWindows, dayNum, weekdayOf } from '../public/js/swiece.js';
import * as K from '../public/js/kontrakty.js';
import { findGaps, isHoliday } from './luki-danych.mjs';

export const MAX_BARS = 50_000;
// Etap 11 (miniatury): tf=auto wybiera najmniejszy z tych interwałów, przy którym jest co najmniej jedna świeca i najwyżej maxBars (domyślnie 80).
export const AUTO_TFS = ['15s', '1m', '5m', '15m', '1h'];
export const AUTO_MAX_BARS = { min: 10, max: 500, def: 80 };
export const DEFAULT_DAILY_LIMIT_USD = 3;
export const FALLBACK_DELAY_SEC = 8 * 3600; // P23: bez abonamentu świece po ok. 8 h; zmierzone opóźnienie ma pierwszeństwo
export const WINDOW_PAD_SEC = 30 * 60; // P25: okno trade'a = [wejście − 30 min, wyjście + 30 min] (jedyne miejsce tej stałej)
export const WINDOW_MERGE_GAP_SEC = 30 * 60; // P25: okna z przerwą mniejszą niż 30 min są łączone w jedno żądanie
export const CREDIT_START_USD = 125; // P25: kredyt startowy Databento
// P25: kredyt wygasa ok. 27.04.2027; domyślnie liczymy od 2027-04-26 (dzień zapasu, decyzja sesji głównej 27.10.2026: ostrożnie).
export const CREDIT_EXPIRES = '2027-04-26';
// Domyślnie wydane 0,02 USD: faktycznie wydane 27.10.2026 na test okna 1s (0,019685 + 0,000329); stan konta wg portalu Databento (nie zapisujemy go w repozytorium).
export const CREDIT_SPENT_DEFAULT_USD = 0.02;
export const IMPORT_MAX_USD = 50; // P25: limit portalu Databento ustawiony przez użytkownika; tyle najwyżej wolno wskazać przy imporcie
export const QUEUE_MAX = 2000;
export const MIN_FROM = 1275782400; // 2010-06-06 (początek danych GLBX.MDP3)
const LAYER_SCHEMA = { '1m': 'ohlcv-1m', '1s': 'ohlcv-1s' };
const MAX_SPAN_SEC = 400 * 86400, MAX_FETCH_SPAN_SEC = 31 * 86400, MAX_WINDOW_SEC = 10 * 86400;
const MAX_SRC_RECORDS = 2_000_000;
// P55 (29.10.2026): TF poniżej minuty poza oknami 1s dzielą świece 1m (splitMinute). Limity (decyzja gustu): odpowiedź najwyżej MAX_BARS świec (50 000: 30s to ok. 17 dni
// sesji, 5s ok. 3 dni, 1s ok. 14 godzin), a TF nie dzielące minuty (np. 45s) składane z 1s syntetycznych najwyżej MAX_SYNTH_1S sekund.
// Przegląd 1.3.0, pkt 2 (29.10.2026): MAX_SYNTH_1S obniżone z 3 mln do 600 000 s (ok. 7 dni sesji; 3 mln to ok. 1 GB tablic) i oba limity sprawdzane PRZED odczytem i dzieleniem,
// z górnego ograniczenia czasu sesji w zakresie (sessionSecUpper), a nie dopiero po zbudowaniu świec.
const MAX_SYNTH_1S = 600_000;
// Sesje CME to najwyżej 115/168 doby kalendarzowej; +40 h na niepełne tygodnie na brzegach zakresu. Górne ograniczenie, nigdy niższe niż rzeczywisty czas sesji.
const sessionSecUpper = (a, b) => Math.min(b - a, (b - a) * 0.69 + 40 * 3600);
const KEY_RE = /^[A-Za-z0-9_-]{10,100}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayStart = (date) => Date.parse(date + 'T00:00:00Z') / 1000;
const bad = (msg, status = 400, code = 'bad-request', extra) => new DatabentoError(msg, status, code, extra);
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const floorMin = (s) => Math.floor(s / 60) * 60, ceilMin = (s) => Math.ceil(s / 60) * 60;

// Okno 1s dla trade'a (sekundy epoki), zaokrąglone do pełnych minut na zewnątrz.
export function tradeWindow(entrySec, exitSec) {
  return { from: floorMin(entrySec - WINDOW_PAD_SEC), to: ceilMin(exitSec + WINDOW_PAD_SEC) };
}
// Świece (posortowane po t) leżące w zakresach pokrycia (posortowane, scalone).
function filterCovered(bars, ranges) {
  const out = [];
  let i = 0;
  for (const b of bars) {
    while (i < ranges.length && ranges[i][1] <= b[0]) i++;
    if (i < ranges.length && b[0] >= ranges[i][0]) out.push(b);
  }
  return out;
}
// Łączy okna [{from,to}] nakładające się albo oddalone o mniej niż `gap` s. Wynik posortowany rosnąco.
export function mergeWindows(list, gap = WINDOW_MERGE_GAP_SEC) {
  const out = [];
  for (const w of [...list].sort((a, b) => a.from - b.from || a.to - b.to)) {
    const last = out[out.length - 1];
    if (last && w.from - last.to < gap) { if (w.to > last.to) last.to = w.to; } else out.push({ from: w.from, to: w.to });
  }
  return out;
}
// Miesiące UTC pokrywające [from, to): [{from,to}] przycięte do zakresu.
export function monthChunks(from, to) {
  const out = [];
  let a = from;
  while (a < to) {
    const d = new Date(a * 1000);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
    out.push({ from: a, to: Math.min(next, to) });
    a = next;
  }
  return out;
}

// Lata UTC pokrywające [from, to): [{from,to}] przycięte do zakresu (porcje importu historii).
export function yearChunks(from, to) {
  const out = [];
  let a = from;
  while (a < to) {
    const next = Date.UTC(new Date(a * 1000).getUTCFullYear() + 1, 0, 1) / 1000;
    out.push({ from: a, to: Math.min(next, to) });
    a = next;
  }
  return out;
}
// ---- P49 (29.10.2026): okna 1s NQ 9:30–11:00 Nowy Jork ----
// Słowa użytkownika: «nadbudowac baze danych swiec 1s od 9:30 ny open do 11:00, tylko na nq na okres od 2020»; wybory: «Tak, z twardym limitem 36 USD»,
// «Jednorazowy budżet tylko dla tego importu». Okno każdego dnia pon-pt w czasie America/New_York (sessionWindows z swiece.js: czas letni i zimowy),
// kontrakt wg reguły rolla P35 (seriesSegments z pomiarem przewagi obrotu), więc okno w dniu rolla trafia do warstwy nowego kontraktu.
// Dni bez handlu (święta) nie są wyłączane z góry: ich wycena wynosi 0 USD, a pobranie zapisuje puste okno w pokryciu (raport pokazuje je jako dni bez świec).
export const OPEN_WINDOW_NY = Object.freeze({ id: 'open1s', from: '09:30', to: '11:00' });
export const OPEN_WINDOWS_FROM = '2020-01-02';
export const OPEN_INSTRUMENT = 'NQ';
export const OPEN_IMPORT_MAX_USD = 36; // P49: twardy budżet całego importu (suma wszystkich przebiegów, licznik w chart-data/import-1s-nq.json)
export const OPEN_BATCH_MAX_USD = 1; // P49: partia ≤ 1 USD (jak limit jednego pobrania z P2)
export const OPEN_CATCHUP_DAYS = 7; // P51: kolejka (P50) nadrabia najwyżej 7 dni kalendarzowych wstecz
export const OPEN_QUOTE_PARALLEL = 8, OPEN_DOWNLOAD_PARALLEL = 6, OPEN_QUOTE_TTL_MS = 6 * 3600_000;
const OPEN_STATE = 'import-1s-nq';
// Okna 9:30–11:00 NY dni pon-pt leżące w całości w [fromSec, toSec): [{ day: 'RRRR-MM-DD' (data NY = data UTC o 9:30 NY), from, to }].
export function openWindows(fromSec, toSec) {
  return sessionWindows(fromSec, toSec, [OPEN_WINDOW_NY])
    .filter((w) => w.from >= fromSec && w.to <= toSec)
    .map((w) => ({ day: new Date(w.from * 1000).toISOString().slice(0, 10), from: w.from, to: w.to }))
    .filter((w) => { const wd = weekdayOf(dayNum(...w.day.split('-').map(Number))); return wd >= 1 && wd <= 5; });
}
// Partie: kolejne pozycje, dopóki suma wycen ≤ max. Pozycja droższa niż max jest sama w partii (pobieranie ją odrzuci).
export function openBatches(quotes, max = OPEN_BATCH_MAX_USD) {
  const out = [];
  let cur = null;
  quotes.forEach((q, i) => {
    if (!cur || (cur.to > cur.from && cur.usd + q > max + 1e-9)) { cur = { from: i, to: i, usd: 0 }; out.push(cur); }
    cur.to = i + 1; cur.usd = r6(cur.usd + q);
  });
  return out;
}

// Import wycenia i pobiera porcjami po roku: get_cost dla całych 16 lat bywa wolny, a po miesiącu to prawie 200 sekwencyjnych wycen na jedną wycenę importu.
// Czas na wycenę importu 120 s (zamiast 30 s), a przy timeoucie albo błędzie sieci wycena jest ponawiana jeszcze 2 razy (prościej niż równoległość).
export const IMPORT_COST_TIMEOUT_MS = 120_000, IMPORT_RANGE_TIMEOUT_MS = 600_000, QUOTE_RETRIES = 2, QUOTE_PARALLEL = 4;

// Strażnik kredytu i licznik wydatków Databento (P24, P25) jako osobna fabryka: używa jej createCandles i jednorazowe skrypty pomiarowe (P35),
// żeby każde płatne pobranie przechodziło ten sam licznik w config.local.json.
export function createCreditGuard({ getConfig, persistConfigNow = () => {}, now = Date.now, t = tr } = {}) {
  // P24 (27.10.2026, słowa użytkownika: «Tak, 3 USD na dobę»): dzienny sufit wydatków na Databento, doba UTC. Licznik w config.local.json
  // (chartSpend: { day, usd }), nigdy w settings ani w sync. Sprawdzany przed pobraniem i przed każdym zakresem.
  const dailyLimitUsd = () => { const v = Number(getConfig().chartDailyLimitUsd); return Number.isFinite(v) && v > 0 ? v : DEFAULT_DAILY_LIMIT_USD; };
  const today = () => new Date(now()).toISOString().slice(0, 10);
  const spentToday = () => { const s = getConfig().chartSpend; return s && s.day === today() && Number.isFinite(s.usd) ? s.usd : 0; };

  // ---- kredyt Databento (P25) ----
  // 27.10.2026: dokumentacja Databento (databento.com/docs/api-reference-historical, sekcja metadata) nie ma endpointu salda ani kredytów
  // (jest tylko get_cost i list_unit_prices), więc kredyt liczymy lokalnie w config.local.json: chartCredit { startUsd, expires, spentUsd }.
  // P25, słowa użytkownika: «sie upewniaj ze wszystko jest pobierane z darmowych kredytow». Strażnik odrzuca pobranie, gdy wycena > pozostały
  // kredyt albo data >= wygaśnięcia (po wygaśnięciu Databento policzyłby kartę). Liczy się tylko faktycznie pobrane (get_range), nie wyceny.
  const creditCfg = () => {
    const c = getConfig().chartCredit || {};
    const start = Number(c.startUsd), spent = Number(c.spentUsd);
    return {
      startUsd: Number.isFinite(start) && start > 0 ? start : CREDIT_START_USD,
      expires: typeof c.expires === 'string' && DATE_RE.test(c.expires) ? c.expires : CREDIT_EXPIRES,
      spentUsd: Number.isFinite(spent) && spent >= 0 ? spent : CREDIT_SPENT_DEFAULT_USD,
    };
  };
  const creditInfo = () => { const c = creditCfg(); return { ...c, leftUsd: r6(c.startUsd - c.spentUsd), expired: now() >= dayStart(c.expires) * 1000 }; };
  function creditProblem(costUsd) {
    const c = creditInfo();
    if (c.expired) return bad(t('Kredyt Databento wygasł {expires}. Pobieranie zatrzymane, żeby nie płacić z karty. Nic nie pobrano. Jeśli data jest błędna, popraw ją w pliku config.local.json (chartCredit).', { expires: c.expires }), 409, 'credit-expired', { costUsd });
    if (costUsd > c.leftUsd) return bad(t('Wycena {cost} USD przekracza pozostały kredyt Databento {left} USD (z {start} USD, wydano {spent} USD). Nic nie pobrano. Jeśli portal pokazuje inny stan, popraw go w pliku config.local.json (chartCredit).', { cost: costUsd.toFixed(4), left: c.leftUsd.toFixed(4), start: String(c.startUsd), spent: c.spentUsd.toFixed(4) }), 409, 'credit', { costUsd });
    return null;
  }
  // Licznik pesymistyczny (poprawka po przeglądzie, 27.10.2026): wycena jest doliczana PRZED wysłaniem get_range, bo Databento mógł naliczyć koszt
  // mimo timeoutu, błędu CSV albo zamknięcia procesu. Po udanym pobraniu nic się nie dubluje. Zapis natychmiast (persistConfigNow), bez opóźnienia.
  function reserveSpend(usd) {
    const cfg = getConfig();
    cfg.chartSpend = { day: today(), usd: r6(spentToday() + usd) };
    const c = creditCfg();
    cfg.chartCredit = { startUsd: c.startUsd, expires: c.expires, spentUsd: r6(c.spentUsd + usd) };
    persistConfigNow();
  }
  // Hak beforeRange klienta Databento: kredyt, potem rezerwacja w liczniku przed get_range.
  const beforeRange = (cost) => { const p = creditProblem(cost); if (p) throw p; reserveSpend(cost); };
  return { dailyLimitUsd, today, spentToday, creditCfg, creditInfo, creditProblem, reserveSpend, beforeRange };
}

// Rozmiar katalogu magazynu świec w bajtach (Ustawienia → Wykresy → Dane; P39: tylko podgląd, bez usuwania). Brak katalogu = 0.
// Przegląd HIJ, pkt 1 (29.10.2026): asynchronicznie (fs.promises), bo przy ~11 tys. plików wersja synchroniczna zatrzymywała serwer na ok. 0,45 s
// (miniatury i podgląd czekały). Pliki jednego katalogu sprawdzane partiami po 64, żeby nie otwierać tysięcy uchwytów naraz.
export async function dirBytes(dir, depth = 0) {
  if (!dir || depth > 6) return 0;
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return 0; } // brak katalogu
  let sum = 0;
  for (let i = 0; i < entries.length; i += 64) {
    const sizes = await Promise.all(entries.slice(i, i + 64).map(async (e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return dirBytes(p, depth + 1);
      if (e.isFile()) { try { return (await fsp.stat(p)).size; } catch { return 0; } } // plik zniknął w trakcie
      return 0; // dowiązania i inne: pomijane
    }));
    for (const s of sizes) sum += s;
  }
  return sum;
}
export const SIZE_TTL_MS = 60_000;

// autoOpenWindows: P50, kolejka dokłada codzienne okno 1s NQ 9:30–11:00 NY (włącza serwer; przełącznik chartNq1sDaily w config.local.json).
export function createCandles({ getKey, getConfig, persistConfig = () => {}, persistConfigNow = persistConfig, saveKey = () => {}, baseDir, now = Date.now, fetchImpl, t = tr, autoOpenWindows = false } = {}) {
  let client = null, clientSig = '';
  let lastRange = null; // { endSec, at } ostatni znany availableEnd i chwila pomiaru
  let sizeMemo = null; // { at, p } rozmiar chart-data/ (przegląd HIJ, pkt 1)
  const status = { running: false, phase: 'idle', done: 0, total: 0, costUsd: 0, error: null, finishedAt: null, result: null };
  // Przegląd 1.3.0, pkt 4: import okien 1s (P49) ma własny numer przebiegu i własny wynik, bo tick kolejki zeruje status.error i nadpisuje status.result
  let importSeq = 0, lastImport = null; // lastImport: { id, error, result, finishedAt } ostatniego zakończonego importu
  const limitUsd = () => { const v = Number(getConfig().chartCostLimitUsd); return Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_COST_USD; };
  const guard = createCreditGuard({ getConfig, persistConfigNow, now, t });
  const { dailyLimitUsd, spentToday, creditCfg, creditInfo, creditProblem } = guard;
  const dailyError = (cost) => bad(t('Dzienny limit wydatków na Databento ({limit} USD) zostałby przekroczony: wydano dziś {spent} USD, to pobranie kosztuje {cost} USD. Nic nie pobrano. Spróbuj jutro (doba UTC) albo zmień limit w pliku config.local.json (chartDailyLimitUsd).', { limit: String(dailyLimitUsd()), spent: spentToday().toFixed(4), cost: cost.toFixed(4) }), 409, 'daily-limit', { costUsd: cost });
  const overLimitError = (cost, limit) => bad(t('Koszt pobrania ({cost} USD) przekracza limit {limit} USD. Nic nie pobrano.', { cost: cost.toFixed(4), limit: String(limit) }), 409, 'over-limit', { costUsd: cost });
  function db() {
    const key = getKey() || '';
    const sig = key + '|' + limitUsd();
    if (!client || sig !== clientSig) {
      client = createDatabento({ key, now, fetchImpl, maxCostUsd: limitUsd(), t, beforeRange: guard.beforeRange });
      clientSig = sig;
    }
    return client;
  }
  async function availableEnd(force = false) {
    const r = await db().getDatasetRange({ force });
    if (!lastRange || lastRange.endSec !== r.endSec) lastRange = { endSec: r.endSec, at: now() };
    return r.endSec;
  }
  const delaySec = () => (lastRange ? Math.max(0, Math.round(lastRange.at / 1000 - lastRange.endSec)) : FALLBACK_DELAY_SEC);

  function parseQuery({ instrument, from, to, tf } = {}, { needTf = false, maxSpan = MAX_SPAN_SEC } = {}) {
    if (typeof instrument !== 'string' || !/^[A-Za-z0-9]{1,12}$/.test(instrument)) throw bad(t('Nieprawidłowy instrument.'));
    const num = (x) => (typeof x === 'string' && /^\d{1,11}$/.test(x) ? Number(x) : x);
    const f = num(from), e = num(to);
    if (!Number.isInteger(f) || !Number.isInteger(e) || f < MIN_FROM || e <= f) throw bad(t('Nieprawidłowy zakres czasu: od {from}, do {to} (sekundy epoki, "do" musi być po "od").', { from: String(from).slice(0, 14), to: String(to).slice(0, 14) }));
    if (e - f > maxSpan) throw bad(t('Zakres jest za długi (najwyżej {days} dni).', { days: Math.round(maxSpan / 86400) }), 422, 'too-long');
    let p = null;
    if (needTf) { p = parseTf(tf); if (!p) throw bad(t('Nieprawidłowy interwał: {tf}.', { tf: String(tf).slice(0, 10) })); }
    return { src: resolveInstrument(instrument), from: f, to: e, tf: p };
  }
  const parseLayer = (v) => { const l = v ?? '1m'; if (!Object.hasOwn(LAYER_SCHEMA, l)) throw bad(t('Nieprawidłowa warstwa: {layer} (1m albo 1s).', { layer: String(l).slice(0, 10) })); return l; };
  const noSource = () => ({ noSource: true, message: t('Brak źródła danych dla tego instrumentu') });

  // ---- P35: kontrakty, odcinki serii, back-adjust ----
  const auxName = (data) => 'contracts-' + data.toLowerCase();
  // Przełączenia .v.0 (contracts-xx.json z symbology.resolve + zmiany instrument_id z pobranych danych) i nazwy kontraktów z symbology.
  function contractsOf(data, cov = readCoverage(data, { baseDir })) {
    const aux = readAux(auxName(data), { baseDir }) || {};
    const v0 = K.mergeV0(aux.v0 || [], K.v0FromRolls(cov.rolls));
    return { v0, names: aux.names || {}, resolvedTo: aux.resolvedTo || null, rolls: measureSwitches(data, cov, v0) };
  }
  // P35: reguła rolla z danych. Dla przejścia q → q+1 (oba kontrakty pobrane): pierwsza sesja CME od sesji przed czwartkiem rolla CME do przełączenia .v.0,
  // w której obrót nowego kontraktu (warstwa kontraktu) przewyższa stary (.v.0). Wynik { q: otwarcie tej sesji }; roll bez pełnych danych nie ma wpisu
  // (działa reguła zapasowa K.ROLL_FALLBACK_DAYS). Pamięć podręczna po stanie pokrycia.
  const switchCache = new Map();
  function measureSwitches(data, cov, v0) {
    const keys = Object.keys(cov).filter((k) => k.startsWith('1m-')).sort();
    const last = (r) => (r && r.length ? r[r.length - 1] : null);
    const sig = JSON.stringify([coverageVersion(baseDir), last(cov['1m']), keys.map((k) => [k, cov[k].length, last(cov[k])]), v0]);
    const hit = switchCache.get(data);
    if (hit && hit.sig === sig) return hit.v;
    const out = {};
    const vol = (l, s) => readRange(data, l, s.open, s.close, { baseDir }).reduce((a, b) => a + b[5], 0);
    for (let i = 1; i < v0.length; i++) {
      const [tv, qn] = v0[i], q = qn - 1;
      if (v0[i - 1][1] !== q) continue;
      const L = contractLayer('1m', K.code4(data, qn)), cl = layerCoverage(cov, L);
      if (!cl.length) continue;
      for (let s = previousSession(K.rollEpoch(q)); s.close <= tv + 7200; s = K.sessionAround(s.close)) {
        if (subtractRanges(s.open, s.close, cov['1m']).length || subtractRanges(s.open, s.close, cl).length) break; // niepełne dane: bez pomiaru
        if (vol(L, s) > vol('1m', s)) { out[q] = s.open; break; }
      }
    }
    switchCache.set(data, { sig, v: out });
    return out;
  }
  const nameOf = (info, inst, data, q) => { const n = info.names[q]?.name; return (n && /^(ES|NQ)[HMUZ]\d$/.test(n) ? (inst.startsWith('M') ? 'M' : '') + n : K.contractName(inst, q)); };
  const layerOf = (res, data, seg) => (seg.src === 'v0' ? res : contractLayer(res, K.code4(data, seg.q)));
  const symbolOfLayer = (src, layer) => { const k = K.parseCode4(layer.slice(3)); return k ? K.rawSymbol(k.root, k.q) : src.symbol; };
  // Kontrakt trade'a: q.tfrom/q.tto (wejście/wyjście, sekundy), q.contract (kod z pola „Kontrakt”, puste = wg reguły w chwili wejścia).
  function overrideOf(q, inst, rolls) {
    if (q.tfrom === undefined) return null;
    const n = (x) => (typeof x === 'string' && /^\d{1,11}$/.test(x) ? Number(x) : x);
    const a = n(q.tfrom), b = q.tto === undefined || q.tto === '' ? a : n(q.tto);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < MIN_FROM || b < a || b - a > MAX_WINDOW_SEC) throw bad(t('Nieprawidłowy czas trade\'a: wejście {a}, wyjście {b} (sekundy epoki).', { a: String(q.tfrom).slice(0, 14), b: String(q.tto).slice(0, 14) }));
    const code = String(q.contract ?? '').trim();
    const pr = K.contractProblem(code, inst);
    if (pr) throw bad(t(pr.key, pr.vars), 400, 'bad-contract');
    const cq = code ? K.contractQ(code, a) : K.frontQ(a, rolls);
    if (cq == null) throw bad(t('Kontrakt {c} wygasł przed wejściem w trade ({d}). Popraw pole „Kontrakt” albo wyczyść je.', { c: code.toUpperCase(), d: new Date(a * 1000).toISOString().slice(0, 10) }), 400, 'bad-contract');
    return { q: cq, ...K.tradeSessions(a, b), entry: a, auto: !code };
  }
  // Luki rolli do back-adjust (B-ADJ): dla przejścia na kontrakt q (chwila R(q − 1)) zamknięcie q − zamknięcie q − 1 na ostatniej wspólnej
  // minucie ostatnich dwóch godzin sesji przed przełączeniem (grosze; przełączenie to chwila z reguły P35: zmierzona albo zapasowa). Brak danych którejś strony = luka nieznana (missing). Pamięć podręczna po stanie pokrycia.
  const gapCache = new Map();
  function rollGaps(data, cov, info) {
    const sig = JSON.stringify([cov['1m'], Object.keys(cov).filter((k) => k.startsWith('1m-')).map((k) => [k, cov[k]]), info.v0.length, info.rolls]);
    const R = K.rollAtFn(info.rolls);
    const hit = gapCache.get(data);
    if (hit && hit.sig === sig) return hit.v;
    const gaps = {}, missing = [];
    const end = cov['1m'].length ? cov['1m'][cov['1m'].length - 1][1] : 0;
    for (let q = K.frontQ(MIN_FROM, R) + 1; R(q - 1) < end; q++) {
      const T = R(q - 1);
      // ostatnie 2 h sesji przed przełączeniem (przełączenie w niedzielę 17:00 ma przed sobą weekend, nie świece)
      const pc = previousSession(T).close;
      const side = (qq) => {
        const L = layerOf('1m', data, { q: qq, src: qq === K.v0At(info.v0, pc - 60) ? 'v0' : 'k' });
        return new Map(filterCovered(readRange(data, L, pc - 7200, pc, { baseDir }), layerCoverage(cov, L)).map((b) => [b[0], b[4]]));
      };
      const o = side(q - 1), nw = side(q);
      let best = null;
      for (const [tt, c] of nw) if (o.has(tt) && (best == null || tt > best)) best = tt;
      // Znana luka (decyzja 28.10.2026, przegląd P35 D3): bez wspólnej minuty w ostatnich 2 h przed przełączeniem (np. czerwiec 2014: dziura w danych 12-13.06
      // dla ES i NQ) luka jest nieznana i liczy się jako 0, więc kontrakty sprzed 06.2014 mają przesunięcie bez tej luki. Zachowanie celowo bez zmian
      // (szukanie wcześniejszych sesji zmieniałoby definicję luki); ostrzeżenie pokazuje adjust.missing.
      if (best == null) missing.push(q); else gaps[q] = nw.get(best) - o.get(best);
    }
    const v = { gaps, missing };
    gapCache.set(data, { sig, v });
    return v;
  }
  // Zapas na niepobrane okna rolli: odcinek wg reguły (także kontrakt „Auto” trade'a) z kontraktem spoza .v.0, którego warstwa nie ma świec, pokazuje w tym
  // kawałku .v.0, czyli to, co było na wykresie przed P35 (znacznik stoi wtedy w chwili faktycznej zmiany, z nazwami). Jawnie wybrany kontrakt (pole
  // „Kontrakt”) nie jest podmieniany: jego brak widać jako dziurę z przyciskiem pobrania, bo inaczej wykres pokazałby nie ten kontrakt pod jego nazwą.
  function fallbackToV0(segs, data, res, cov, info, ovr) {
    const out = [];
    const push = (s) => { const l = out[out.length - 1]; if (l && l.to === s.from && l.q === s.q && l.src === s.src) l.to = s.to; else out.push({ ...s }); };
    for (const s of segs) {
      if (s.src !== 'k') { push(s); continue; }
      const cl = layerCoverage(cov, layerOf(res, data, s));
      // okno jawnie wybranego kontraktu liczy się jak „są świece”: zostaje ten kontrakt (z dziurą, gdy niepobrany)
      const pin = ovr && !ovr.auto && s.q === ovr.q ? [[ovr.from, ovr.to]] : [];
      const has = mergeRanges([...cl, ...(res === '1m' ? layerCoverage(cov, layerOf('1s', data, s)) : []), ...pin]);
      let cur = s.from;
      for (const [a, b] of clipRanges(s.from, s.to, has)) {
        if (a > cur) push({ from: cur, to: a, q: K.v0At(info.v0, cur), src: 'v0' });
        push({ from: a, to: b, q: s.q, src: 'k' });
        cur = b;
      }
      if (cur < s.to) push({ from: cur, to: s.to, q: K.v0At(info.v0, cur), src: 'v0' });
    }
    return out;
  }
  // Świece odcinków serii z warstw magazynu (1m uzupełniana agregacją 1s, gdzie 1m brak), z przesunięciem back-adjust w groszach.
  function composeBars(data, res, segs, cov, off) {
    let out = [];
    const derived = [], covered = [];
    for (const s of segs) {
      const L = layerOf(res, data, s), cl = layerCoverage(cov, L);
      let raw = filterCovered(readRange(data, L, s.from, s.to, { baseDir }), cl);
      if (res === '1m') {
        const L1 = layerOf('1s', data, s);
        const d = intersectRanges(subtractRanges(s.from, s.to, cl), layerCoverage(cov, L1)).map(([a, b]) => [ceilMin(a), floorMin(b)]).filter(([a, b]) => b > a);
        for (const [a, b] of d) raw = raw.concat(aggregate(readRange(data, L1, a, b, { baseDir }), '1m'));
        if (d.length) raw.sort((x, y) => x[0] - y[0]);
        derived.push(...d);
      }
      const o = off ? off(s.q) : 0;
      if (o) raw = raw.map((b) => [b[0], b[1] + o, b[2] + o, b[3] + o, b[4] + o, b[5]]);
      out = out.concat(raw);
      covered.push(...clipRanges(s.from, s.to, cl));
    }
    return { bars: out, derived, covered: mergeRanges(covered) };
  }
  // Pierwsze otwarcie sesji o czasie >= t (granice odcinków to otwarcia sesji albo koniec sesji 16:00).
  const sessionOpenFrom = (t0) => { const s = sessionBounds(t0); return s && s.open === t0 ? t0 : K.sessionAround(s ? s.close : t0).open; };
  // PDH/PDL w kontrakcie wyświetlanym: dla sesji tuż po zmianie kontraktu H/L poprzedniej sesji (z danymi, do 5 wstecz) w kontrakcie tej sesji.
  // Wynik [[otwarcie sesji, H, L]] w cenach; H i L null, gdy poprzednia sesja w tym kontrakcie nie jest pobrana w całości (nie zgadujemy).
  function prevInContract(data, segs, cov, info, off) {
    const out = [];
    for (let i = 1; i < segs.length; i++) {
      if (segs[i].q === segs[i - 1].q) continue;
      const q = segs[i].q, open = sessionOpenFrom(segs[i].from);
      let p = previousSession(open), hl = null;
      for (let k = 0; k < 5 && !hl; k++, p = previousSession(p.open)) {
        const L = layerOf('1m', data, { q, src: q === K.v0At(info.v0, p.open) ? 'v0' : 'k' }), cl = layerCoverage(cov, L);
        if (subtractRanges(p.open, p.close, cl).length) break;
        const bars = readRange(data, L, p.open, p.close, { baseDir });
        if (bars.length) { const o = off ? off(q) : 0; hl = [Math.max(...bars.map((b) => b[2])) + o, Math.min(...bars.map((b) => b[3])) + o]; } // pusta = święto: sesja wcześniej
        else if (!isHoliday(p.day + 1)) break; // P37 (P3): pusta, ale nie święto = dziura w danych: poprzedniej sesji nie znamy, bez PDH/PDL
      }
      if (!out.some((x) => x[0] === open)) out.push([open, hl ? hl[0] / 100 : null, hl ? hl[1] / 100 : null]);
    }
    return out;
  }

  // ---- odczyt (zero sieci) ----
  // TF >= 1m (i wielokrotności 60 s) z warstwy 1m. TF poniżej minuty (i nie będące wielokrotnością minuty): P55 (29.10.2026), słowa użytkownika «jak sa sekundowki to wciaz sa dane
  // na wykresie z minutowek … nie bylo pustych pol»: prawdziwe świece 1s tam, gdzie okno 1s jest pobrane, a w pozostałych minutach podział świecy 1m (splitMinute, ścieżka O→L→H→C);
  // świece z podziału mają 1 na pozycji 6, odpowiedź ma pole synth (zakresy minut). Sekundy bez transakcji w oknie 1s nadal nie mają świecy.
  // Brakująca 1m w oknie 1s jest uzupełniana w pamięci agregacją 1s (nigdzie nie zapisywana).
  // tf=auto&maxBars=N (miniatury): jak zwykły odczyt, ale interwał dobiera serwer. Zero sieci; odpowiedź niesie wybrany `tf`.
  // Interwał bez świec się nie liczy (15s poza oknem 1s jest puste, a nie "najmniejsze"); gdy żaden się nie mieści, wraca największy (1h), gdy brak świec: pusty 1m z polem missing.
  // P55: scala prawdziwe świece 1s (real) z podziałem świec 1m (base) w minutach bez żadnego pokrycia 1s. Minuta choćby częściowo pokryta oknem 1s zostaje
  // w całości prawdziwa (okna 1s są pełnominutowe), więc na granicy okna nie ma dziury ani dubla. Zwraca świece TF (w groszach; syntetyczne mają 1 na pozycji 6)
  // i zakresy minut syntetycznych. TF dzielący minutę: prawdziwe 1s agregowane do TF + części minut; inny (np. 45s): 1s syntetyczne i prawdziwe agregowane razem.
  function mixSynthetic(real, base, tf) {
    const cov1s = real.covered, minutes = [];
    let p = 0;
    for (const b of base.bars) {
      while (p < cov1s.length && cov1s[p][1] <= b[0]) p++;
      if (!(p < cov1s.length && cov1s[p][0] < b[0] + 60)) minutes.push(b);
    }
    const div = 60 % tf.sec === 0, step = div ? tf.sec : 1, per = 60 / step;
    if (minutes.length * per > (div ? MAX_BARS * 2 : MAX_SYNTH_1S)) throw bad(t('Wybierz większy interwał albo krótszy zakres'), 422, 'too-many');
    const synth = [];
    for (const m of minutes) for (const x of splitMinute(m, step)) synth.push(x);
    const ranges = [];
    for (const m of minutes) { const last = ranges[ranges.length - 1]; if (last && last[1] === m[0]) last[1] = m[0] + 60; else ranges.push([m[0], m[0] + 60]); }
    const byT = (x, y) => x[0] - y[0];
    if (div) return { bars: (tf.sec === 1 ? real.bars : aggregate(real.bars, tf)).concat(synth).sort(byT), ranges };
    const set = new Set(minutes.map((m) => m[0]));
    const bars = aggregate(real.bars.concat(synth).sort(byT), tf).map((b) => {
      for (let m = Math.floor(b[0] / 60) * 60; m < b[0] + tf.sec; m += 60) if (set.has(m)) return [b[0], b[1], b[2], b[3], b[4], b[5], 1];
      return b;
    });
    return { bars, ranges };
  }
  function readAuto(q) {
    const raw = q.maxBars ?? String(AUTO_MAX_BARS.def);
    const max = typeof raw === 'string' && /^\d{1,4}$/.test(raw) ? Number(raw) : raw;
    if (!Number.isInteger(max) || max < AUTO_MAX_BARS.min || max > AUTO_MAX_BARS.max) throw bad(t('maxBars to liczba całkowita od {a} do {b}.', { a: AUTO_MAX_BARS.min, b: AUTO_MAX_BARS.max }));
    let empty = null, biggest = null;
    for (const tf of AUTO_TFS) {
      let r;
      try { r = readOne({ ...q, tf }, { noSynth: true }); } catch (e) { if (e?.code === 'too-many') continue; throw e; }
      if (r.noSource) return r;
      if (tf === '1m') empty = r;
      if (r.bars.length) biggest = r;
      if (r.bars.length && r.bars.length <= max) return r;
    }
    return biggest || empty || readOne({ ...q, tf: '1m' });
  }
  function read(q = {}) { return q.tf === 'auto' ? readAuto(q) : readOne(q); }
  function readOne(q = {}, opt = {}) {
    const { src, from, to, tf } = parseQuery(q, { needTf: true });
    if (!src) return noSource();
    const layer = pickSource(tf);
    // P55 (29.10.2026), słowa użytkownika: «jak sa sekundowki to wciaz sa dane na wykresie z minutowek … nie bylo pustych pol»: TF poniżej minuty (i nie będące
    // wielokrotnością minuty) bierze prawdziwe 1s tam, gdzie okno 1s jest pobrane, a w pozostałych minutach dzieli świece 1m. noSynth (tf=auto, miniatury) = jak przed P55.
    const mixed = layer === '1s' && !opt.noSynth;
    const layerSec = layer === '1s' && !mixed ? 1 : 60;
    const tooMany = mixed ? (() => { const u = sessionSecUpper(from, to); return u / tf.sec > MAX_BARS * 1.05 || (60 % tf.sec !== 0 && u > MAX_SYNTH_1S); })() : (to - from) / layerSec > MAX_SRC_RECORDS;
    if (tooMany) throw bad(t('Wybierz większy interwał albo krótszy zakres'), 422, 'too-many');
    const inst = String(q.instrument).trim().toUpperCase();
    const adjust = q.adjust === '1' || q.adjust === true;
    const cov = readCoverage(src.data, { baseDir });
    const info = contractsOf(src.data, cov);
    const ovr = overrideOf(q, inst, info.rolls);
    const want = K.seriesSegments(from, to, info.v0, { override: ovr, rolls: info.rolls });
    const segs = fallbackToV0(want, src.data, mixed ? '1m' : layer, cov, info, ovr); // P55: odcinki wg 1m (zawiera też pokrycie 1s)
    const gp = adjust ? rollGaps(src.data, cov, info) : null;
    const off = gp ? K.adjustOffsets(gp.gaps, ovr ? ovr.q : Infinity) : null; // P38: kotwica = kontrakt trade'a (ceny prawdziwe), bez trade'a najnowszy kontrakt
    // Tylko świece z pokrycia warstwy: ewentualna reszta w pliku (awaria między zapisem świec a pokrycia) nie dubluje czasów z agregatu 1s.
    let cb, raw, synthRanges = [];
    if (mixed) {
      const real = composeBars(src.data, '1s', segs, cov, off), base = composeBars(src.data, '1m', segs, cov, off);
      cb = { bars: base.bars, derived: base.derived, covered: mergeRanges([...real.covered, ...base.covered]) };
      const m = mixSynthetic(real, base, tf);
      raw = m.bars; synthRanges = m.ranges;
    } else {
      cb = composeBars(src.data, layer, segs, cov, off);
      raw = cb.bars;
      if (!(tf.sec === layerSec && tf.unit !== 'D' && tf.unit !== 'W' && tf.unit !== 'M')) raw = aggregate(raw, tf);
    }
    const mlayer = mixed ? '1m' : layer; // P55: braki, dziury i pobranie dotyczą warstwy 1m, z której powstają świece syntetyczne
    if (raw.length > MAX_BARS) throw bad(t('Wybierz większy interwał albo krótszy zakres'), 422, 'too-many', { count: raw.length });
    const end = lastRange ? lastRange.endSec : null;
    const cut = end ?? Math.floor(now() / 1000) - FALLBACK_DELAY_SEC;
    // missing liczone z odcinków, które seria POWINNA pokazać (także tam, gdzie zapas pokazuje .v.0): przycisk pobrania dociąga właściwy kontrakt
    const missing = from < cut ? mergeRanges(want.flatMap((s) => clipRanges(from, Math.min(to, cut), subtractRanges(s.from, s.to, mergeRanges([...layerCoverage(cov, layerOf(mlayer, src.data, s)), ...(mixed ? layerCoverage(cov, layerOf('1s', src.data, s)) : [])]))))) : []; // P55: brak = ani 1m, ani 1s
    const unavailable = from >= cut;
    const name = (qq) => nameOf(info, inst, src.data, qq);
    // znaczniki tylko między odcinkami, które mają świece: odcinek bez świec (np. weekend po sesji trade'a z innym kontraktem) nie daje pary
    // znaczników tam i z powrotem, które na osi po indeksie stałyby obok siebie
    const times = cb.bars.map((b) => b[0]);
    const hasBars = (s) => { let lo = 0, hi = times.length; while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < s.from) lo = m + 1; else hi = m; } return lo < times.length && times[lo] < s.to; };
    const shown = segs.filter(hasBars);
    const rolls = [];
    for (let i = 1; i < shown.length; i++) if (shown[i].q !== shown[i - 1].q) rolls.push({ t: shown[i].from, from: name(shown[i - 1].q), to: name(shown[i].q), label: `${name(shown[i - 1].q)} → ${name(shown[i].q)}` });
    // P5 (P37, 28.10.2026): kadr zaczynający się PO ostatniej świecy starego kontraktu (sobota przed rollem w niedzielę 17:00; przeglądanie historii porcjami) też dostaje
    // znacznik, gdy sama chwila rolla leży w kadrze, a nowy kontrakt ma w nim świece. Tylko prawdziwy roll rynku (czas z reguły P35, poprzedni kontrakt = q − 1)
    // i tylko bez pola „Kontrakt” trade'a: okno kontraktu wybranego ręcznie nie jest rollem rynku, więc nie rysuje fałszywej zmiany.
    // P55 (29.10.2026): także przy kontrakcie trade'a wybranym przez regułę (ovr.auto): doładowywane porcje historii (zapas 1 doby) dzielą weekend rolla, więc bez tego
    // znacznik znikał przy przewijaniu przez roll (tak samo na 1m); kontrakt wybrany ręcznie nadal nie rysuje rolla rynku
    if ((!ovr || ovr.auto) && shown.length) {
      const s0 = shown[0], k = segs.indexOf(s0), prev = k > 0 ? segs[k - 1] : null;
      if (K.rollAtFn(info.rolls)(s0.q - 1) === s0.from && s0.from >= from && (prev ? prev.q === s0.q - 1 : true)) {
        rolls.unshift({ t: s0.from, from: name(s0.q - 1), to: name(s0.q), label: `${name(s0.q - 1)} → ${name(s0.q)}` });
      }
    }
    // P2 (P37): dziury w danych (dzień handlowy bez ani jednej świecy 1m w pobranym zakresie, poza świętami i weekendami); tylko dla warstwy 1m
    const gaps = mlayer !== '1m' ? [] : findGaps(from, to, {
      isCovered: (o, c) => !subtractRanges(o, c, cov['1m']).length,
      barCount: (o, c) => {
        if (o >= from && c <= to) { let lo = 0, hi = times.length; while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < o) lo = m + 1; else hi = m; } if (lo < times.length && times[lo] < c) return 1; }
        let n = readRange(src.data, '1m', o, c, { baseDir }).length;
        for (const key of Object.keys(cov)) if (n === 0 && /^1m-/.test(key) && !subtractRanges(o, c, layerCoverage(cov, key)).length) n += readRange(src.data, key, o, c, { baseDir }).length;
        return n;
      },
    });
    const out = {
      data: src.data, tf: tf.str, layer, bars: raw.map((b) => (b[6] ? [b[0], b[1] / 100, b[2] / 100, b[3] / 100, b[4] / 100, b[5], 1] : [b[0], b[1] / 100, b[2] / 100, b[3] / 100, b[4] / 100, b[5]])),
      covered: cb.covered, derived: cb.derived, missing, rolls, gaps, availableEnd: end,
      ...(mixed ? { synth: synthRanges } : {}), // P55: zakresy [od, do) minut ze świecami syntetycznymi (świece mają też flagę 1 na pozycji 6)
      ...(unavailable ? { unavailable: true, retryAfter: from + delaySec() } : {}),
    };
    if (tf.unit === 'D') out.prevIn = prevInContract(src.data, segs, cov, info, off);
    if (adjust) out.adjust = { on: true, anchor: ovr ? name(ovr.q) : null, missing: gp.missing.filter((qq) => K.rollAtFn(info.rolls)(qq - 1) >= from).map((qq) => `${name(qq - 1)} → ${name(qq)}`).slice(0, 20), unknown: gp.missing.length };
    if (ovr) {
      const inWin = segs.filter((s) => s.from < ovr.to && s.to > ovr.from);
      out.contract = {
        code: name(ovr.q), auto: ovr.auto, rule: name(K.frontQ(ovr.entry, info.rolls)),
        options: [...new Set([...K.contractOptions(ovr.entry, info.rolls), ovr.q])].sort((a, b) => a - b).map(name),
        shown: inWin.every((s) => s.q === ovr.q), // false: kontrakt wygasł w części okna albo okno poza zakresem
      };
    }
    return out;
  }

  // ---- plan pobrania: runs = brakujące zakresy warstwy, każdy jednym żądaniem ----
  // P35: darmowe symbology.resolve dociąga przełączenia .v.0 i nazwy kontraktów do dnia `endSec` (zapis w contracts-xx.json). Bez klucza albo przy
  // błędzie zostają przełączenia z pobranych danych (rolls); błąd trafia do logu, pobierania nie blokuje (wiedza o .v.0 jest wtedy z danych).
  async function ensureContracts(data, endSec) {
    if (!getKey()) return;
    const aux = readAux(auxName(data), { baseDir }) || { v0: [], names: {} };
    const endDay = new Date(endSec * 1000).toISOString().slice(0, 10);
    if (aux.resolvedTo && aux.resolvedTo >= endDay) return;
    const startDay = aux.resolvedTo || '2010-06-06';
    try {
      const segs = (await db().resolve({ symbols: `${data}.v.0`, startDate: startDay, endDate: endDay }))[`${data}.v.0`];
      const names = { ...(aux.names || {}) }, byId = new Map(Object.entries(names).map(([qq, x]) => [x.id, Number(qq)]));
      const v0 = [...(aux.v0 || [])];
      for (const sg of segs) {
        const t0 = Date.parse(sg.d0 + 'T00:00:00Z') / 1000;
        let qq = byId.get(sg.s);
        if (qq == null) { // nazwa kontraktu z symbology: kandydaci wokół reguły, rozwiązanie w czasie dnia d0
          const cands = [-1, 0, 1].map((k) => K.frontQ(t0, K.ROLL_DAYS_BEFORE) + k);
          const d0 = sg.d0 < '2010-06-06' ? '2010-06-06' : sg.d0, d1 = sg.d1 > endDay ? endDay : sg.d1; // zakres zbioru GLBX.MDP3 i dostępne dane
          if (d1 <= d0) continue;
          const r = await db().resolve({ symbols: cands.map((c) => K.rawSymbol(data, c)).join(','), startDate: d0, endDate: d1 });
          qq = cands.find((c) => (r[K.rawSymbol(data, c)] || []).some((x) => x.s === sg.s)) ?? null;
          if (qq != null) { names[qq] = { name: K.rawSymbol(data, qq), id: sg.s }; byId.set(sg.s, qq); }
        }
        if (qq != null) v0.push([t0, qq]);
      }
      writeAux(auxName(data), { resolvedTo: endDay, v0: K.mergeV0(v0), names }, { baseDir });
    } catch (e) { console.error('[candles] kontrakty: symbology.resolve nie powiodło się:', e.message); }
  }
  // Brakujące zakresy jednej rozdzielczości dla odcinków serii [start, eff): każdy z symbolem Databento i warstwą zapisu. Dla odcinka z innym kontraktem
  // niż poprzedni dochodzi poprzednia sesja w tym kontrakcie (PDH/PDL z kontraktu wyświetlanego i luka back-adjust).
  function segmentRuns(src, res, start, eff, ovr, cov) {
    const info = contractsOf(src.data, cov);
    const segs = K.seriesSegments(start, eff, info.v0, { override: ovr, rolls: info.rolls });
    const want = new Map(); // warstwa → zakresy [od, do)
    const add = (seg, a, b) => { const L = layerOf(res, src.data, seg); if (b > a) want.set(L, [...(want.get(L) || []), [a, b]]); };
    for (const s of segs) add(s, s.from, s.to);
    if (res === '1m') {
      for (let i = 1; i < segs.length; i++) {
        const s = segs[i];
        if (segs[i - 1].q === s.q) continue;
        // poprzednia sesja razem z przerwą przed odcinkiem (jedno żądanie zamiast dwóch; przerwa nie ma świec, więc nie kosztuje)
        const p = previousSession(sessionOpenFrom(s.from));
        const pb = Math.max(p.close, Math.min(s.from, p.close + 3600));
        const head = K.seriesSegments(p.open, pb, info.v0, { override: { q: s.q, from: p.open, to: pb }, rolls: info.rolls });
        for (const h of head) if (h.q === s.q && h.to > MIN_FROM) add(h, Math.max(h.from, MIN_FROM), Math.min(h.to, eff));
      }
      // okno pomiaru rolla (P35, zakres zatwierdzony przez użytkownika 28.10.2026): nowy kontrakt od sesji przed czwartkiem rolla CME do przełączenia .v.0,
      // żeby dało się zmierzyć sesję przewagi obrotu (measureSwitches), także gdy reguła zapasowa pokazuje go dopiero od poniedziałku
      for (let q = K.frontQ(start, K.ROLL_DAYS_BEFORE) - 1; K.rollEpoch(q, K.ROLL_DAYS_BEFORE + 1) < eff; q++) {
        const a = Math.max(K.rollEpoch(q, K.ROLL_DAYS_BEFORE + 1), MIN_FROM);
        const sw = info.v0.find(([, x]) => x === q + 1)?.[0];
        const b = Math.min(sw ?? K.expiryEpoch(q), K.expiryEpoch(q), eff);
        if (b > start && a < b && (sw ?? Infinity) > a) add({ q: q + 1, src: 'k' }, a, b);
      }
    }
    const runs = [];
    for (const [L, ranges] of want) {
      for (const [a, b] of mergeRanges(ranges).flatMap(([a0, b0]) => subtractRanges(a0, b0, layerCoverage(cov, L)))) {
        const sa = res === '1m' ? floorMin(a) : a, sb = Math.min(res === '1m' ? ceilMin(b) : b, eff);
        if (sb > sa) runs.push({ start: sa, end: sb, store: L, symbol: symbolOfLayer(src, L) });
      }
    }
    return runs.sort((x, y) => x.start - y.start || x.store.localeCompare(y.store));
  }
  async function planRanges(src, layer, from, to, refresh = false, ovr = null) {
    const end = await availableEnd(refresh); // refresh: "Dociągnij końcówkę" omija cache 15 min
    const eff = layer === '1m' ? floorMin(Math.min(to, end)) : Math.min(to, end); // niepełnej minuty 1m nie pobieramy
    const start = layer === '1m' ? floorMin(from) : from;
    if (start >= eff) return { src, layer, unavailable: from >= Math.min(to, end), availableEnd: end, retryAfter: from + delaySec(), runs: [] };
    await ensureContracts(src.data, end);
    const runs = segmentRuns(src, layer, start, eff, ovr, readCoverage(src.data, { baseDir }));
    return { src, layer, availableEnd: end, effTo: eff, runs };
  }
  async function plan(q = {}) {
    const { src, from, to } = parseQuery(q, { maxSpan: MAX_FETCH_SPAN_SEC });
    if (!src) return { noSource: true };
    return planRanges(src, parseLayer(q.layer), from, to, q.refresh === true, overrideOf(q, String(q.instrument).trim().toUpperCase(), contractsOf(src.data).rolls));
  }
  // Wycena jest bezpłatna, więc timeout albo chwilowy błąd sieci ponawiamy (najwyżej QUOTE_RETRIES razy); inne błędy od razu.
  // P35: wyceny po QUOTE_PARALLEL naraz (import okien rolli to ~66 wycen na symbol; po kolei trwało to ponad 25 minut), kolejność wyników = kolejność zakresów.
  async function quoteRuns(src, layer, runs, { timeoutMs } = {}) {
    const quotes = new Array(runs.length);
    for (let i = 0; i < runs.length; i += QUOTE_PARALLEL) {
      await Promise.all(runs.slice(i, i + QUOTE_PARALLEL).map(async (r, k) => { quotes[i + k] = await quoteOne(src, layer, r, timeoutMs); }));
    }
    return quotes;
  }
  async function quoteOne(src, layer, r, timeoutMs) {
    for (let attempt = 0; ; attempt++) {
      try { return await db().getCost({ symbol: r.symbol || src.symbol, start: r.start, end: r.end, schema: LAYER_SCHEMA[layer] }, { timeoutMs }); }
      catch (e) {
        // P35: także chwilowy błąd serwera Databento (5xx) przy bezpłatnej wycenie ponawiamy; w logu symbol i zakres, żeby dało się go odtworzyć
        const transient = e instanceof DatabentoError && (['timeout', 'network'].includes(e.code) || (e.code === 'upstream' && e.upstream >= 500));
        console.error('[candles] wycena nie powiodła się:', r.symbol || src.symbol, new Date(r.start * 1000).toISOString(), '..', new Date(r.end * 1000).toISOString(), e.code, e.message, transient && attempt < QUOTE_RETRIES ? '(ponawiam)' : '');
        if (!transient || attempt >= QUOTE_RETRIES) throw e;
      }
    }
  }

  async function quote(q) {
    const pl = await plan(q);
    if (pl.noSource) return noSource();
    const out = { instrument: pl.src.data, layer: pl.layer, availableEnd: pl.availableEnd ?? null, limitUsd: limitUsd(), credit: creditInfo() };
    if (pl.unavailable) return { ...out, unavailable: true, retryAfter: pl.retryAfter, costUsd: 0, ranges: [] };
    const cost = (await quoteRuns(pl.src, pl.layer, pl.runs)).reduce((a, b) => a + b, 0);
    return { ...out, to: pl.effTo, costUsd: cost, ranges: pl.runs.map((r) => [r.start, r.end]), overLimit: cost > limitUsd(), overCredit: !!creditProblem(cost), nothing: !pl.runs.length };
  }

  // Pobiera kolejno zakresy; przed każdym: dzienny sufit (gdy dailyCap != null), łączny limit, a w kliencie strażnik kredytu.
  // Po każdym zakresie od razu zapis do magazynu (przerwanie nie traci tego, co już pobrano). Zwraca { added, spent }.
  async function downloadRuns(src, layer, runs, quotes, { limit, dailyCap = dailyLimitUsd(), onRun, costTimeoutMs, rangeTimeoutMs } = {}) {
    let spent = 0, added = 0;
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      if (dailyCap != null && spentToday() + quotes[i] > dailyCap) throw dailyError(quotes[i]);
      if (spent + quotes[i] > limit) throw overLimitError(spent + quotes[i], limit);
      const store = r.store || layer;
      const got = await db().getRange({ symbol: r.symbol || src.symbol, start: r.start, end: r.end, schema: LAYER_SCHEMA[layer] }, { confirmedCostUsd: quotes[i], maxCostUsd: limit - spent, costTimeoutMs, rangeTimeoutMs });
      spent += got.costUsd; // licznik kredytu i dobowy zwiększył już hak beforeRange przed get_range
      const bars = got.bars.filter((b) => b[0] >= r.start && b[0] < r.end);
      // zmiany instrument_id ma tylko seria .v.0 (symbol surowy to jeden instrument)
      const rolls = store === layer ? got.rolls.filter((x) => x.t >= r.start && x.t < r.end).map((x) => ({ t: x.t, label: `${x.from}→${x.to}` })) : [];
      writeRange(src.data, store, r.start, r.end, bars, { rolls }, { baseDir });
      added += bars.length;
      onRun?.(i + 1);
    }
    return { added, spent };
  }
  const fail = (e) => ({ message: e instanceof DatabentoError ? e.message : t('Nie udało się zapisać pobranych świec. Szczegóły w logu serwera.'), code: e.code || 'error' });

  // Wycena jeszcze raz, kontrola z potwierdzoną kwotą, limitem i kredytem, potem pobranie w tle. Odpowiedź od razu.
  // Blokada zajęta SYNCHRONICZNIE przed pierwszym await. Zwalniana w finally na każdej ścieżce, która nie uruchomiła pobierania w tle
  // (wynik bez startu, wyjątek, timeout wyceny); błąd trafia też do status.error, żeby był widoczny w /api/candles/status.
  async function withPrepareLock(fn) {
    if (status.running) throw bad(t('Pobieranie już trwa.'), 409, 'running');
    Object.assign(status, { running: true, phase: 'prepare', done: 0, total: 0, error: null });
    let started = false;
    try {
      const res = await fn();
      started = !!res?.started;
      return res;
    } catch (e) {
      console.error('[candles] przygotowanie nie powiodło się:', e.message);
      status.error = fail(e);
      throw e;
    } finally {
      if (!started) { status.running = false; status.phase = 'idle'; status.finishedAt = new Date(now()).toISOString(); }
    }
  }
  async function fetchDays(q) {
    q = q ?? {};
    return withPrepareLock(() => prepareFetch(q));
  }
  async function prepareFetch(q) {
    const confirmed = q.confirmedCostUsd;
    if (typeof confirmed !== 'number' || !Number.isFinite(confirmed) || confirmed < 0) throw bad(t('Pobranie wymaga potwierdzonej wyceny kosztu.'), 400, 'no-quote');
    const pl = await plan(q);
    if (pl.noSource) return noSource();
    if (pl.unavailable) return { unavailable: true, availableEnd: pl.availableEnd, retryAfter: pl.retryAfter, started: false };
    if (!pl.runs.length) return { nothing: true, started: false, costUsd: 0 };
    const quotes = await quoteRuns(pl.src, pl.layer, pl.runs);
    const total = quotes.reduce((a, b) => a + b, 0);
    if (total > limitUsd()) throw overLimitError(total, limitUsd());
    if (spentToday() + total > dailyLimitUsd()) throw dailyError(total);
    const cp = creditProblem(total);
    if (cp) throw cp;
    if (total > confirmed * (1 + COST_TOLERANCE)) throw bad(t('Koszt pobrania wzrósł do {cost} USD (potwierdzono {confirmed} USD). Nic nie pobrano, zatwierdź nową wycenę.', { cost: total.toFixed(4), confirmed: confirmed.toFixed(4) }), 409, 'cost-changed', { costUsd: total });
    Object.assign(status, { running: true, phase: 'download', done: 0, total: pl.runs.length, costUsd: total, error: null, finishedAt: null, result: null });
    (async () => {
      try {
        const r = await downloadRuns(pl.src, pl.layer, pl.runs, quotes, { limit: limitUsd(), onRun: (n) => { status.done = n; } });
        status.result = { added: r.added, costUsd: r.spent };
      } catch (e) {
        console.error('[candles] pobieranie przerwane:', e.message);
        status.error = fail(e);
      } finally { Object.assign(status, { running: false, phase: 'idle', finishedAt: new Date(now()).toISOString() }); }
    })();
    return { started: true, costUsd: total, runs: pl.runs.length };
  }

  // ---- kolejka okien 1s (P25) ----
  // Pozycja: { id, instrument: 'ES'|'NQ', from, to, state: 'pending'|'blocked', reason, attempts, addedAt, retryAfter? }. Zapisywana w chart-data/queue.json.
  // Kolejność: najnowsze najpierw. Okno czeka, aż jego koniec będzie <= availableEnd (po ok. 8 h); backtest i stare trade'y są dostępne od razu.
  const loadQueue = () => {
    const q = readAux('queue', { baseDir });
    return { items: Array.isArray(q?.items) ? q.items : [], reason: q?.reason ?? null, lastRunAt: q?.lastRunAt ?? null, dropped: Number(q?.dropped) || 0 };
  };
  let queue = null;
  const Q = () => (queue ??= loadQueue());
  const saveQueue = () => writeAux('queue', Q(), { baseDir });
  const QUEUE_MSG = {
    'no-key': () => t('Kolejka czeka: brak albo błędny klucz Databento.'),
    waiting: () => t('Kolejka czeka: najnowsze okna będą dostępne w Databento po ok. 8 godzinach.'),
    'daily-limit': () => t('Kolejka wstrzymana do jutra (doba UTC): dzienny limit wydatków.'),
    credit: () => t('Kolejka wstrzymana: za mało kredytu Databento albo kredyt wygasł.'),
    network: () => t('Kolejka ponowi próbę: Databento chwilowo niedostępne.'),
    error: () => t('Kolejka wstrzymana przez błąd. Szczegóły w logu serwera.'),
  };
  function queueInfo() {
    const q = Q();
    const items = [...q.items].sort((a, b) => b.to - a.to);
    return {
      pending: items.filter((i) => i.state === 'pending').length, blocked: items.filter((i) => i.state === 'blocked').length,
      reason: q.reason, message: q.reason && QUEUE_MSG[q.reason] ? QUEUE_MSG[q.reason]() : null, lastRunAt: q.lastRunAt, dropped: q.dropped ?? 0,
      items: items.slice(0, 20).map((i) => ({ instrument: i.instrument, layer: i.layer || '1s', from: i.from, to: i.to, state: i.state, reason: i.reason ?? null, attempts: i.attempts ?? 0, retryAfter: i.retryAfter ?? null })),
    };
  }
  // body: { trades: [{ instrument, entry, exit }], windows: [{ instrument, from, to }] } (sekundy epoki). Okna się łączą (także z już czekającymi).
  function enqueue(body) {
    body = body ?? {};
    const trades = body.trades ?? [], windows = body.windows ?? [];
    if (!Array.isArray(trades) || !Array.isArray(windows) || trades.length + windows.length > 500) throw bad(t('Podaj najwyżej 500 transakcji albo okien naraz.'));
    const isT = (x) => Number.isInteger(x) && x >= MIN_FROM && x < 4294967295;
    const wanted = [];
    let noSrc = 0, invalid = 0;
    // Zła pozycja jest pomijana i liczona w `invalid` (nie wyrzuca całej paczki).
    const take = (instrument, from, to, x = null) => {
      if (typeof instrument !== 'string' || !/^[A-Za-z0-9]{1,12}$/.test(instrument) || !isT(from) || !isT(to) || to < from || to - from > MAX_WINDOW_SEC) {
        invalid++;
        return;
      }
      const src = resolveInstrument(instrument);
      if (!src) { noSrc++; return; }
      if (to <= from) to = from + 60;
      if (!x) { wanted.push({ data: src.data, layer: '1s', from, to }); return; }
      // P35: okno trade'a w kontrakcie trade'a (pole „Kontrakt” albo wg reguły w chwili wejścia) w całych sesjach trade'a; 1s z odpowiednich warstw,
      // minutówek nie dokładamy (P36, niżej).
      const code = typeof x.contract === 'string' ? x.contract.trim() : '';
      if (code && K.contractProblem(code, instrument)) { invalid++; return; }
      const info = contractsOf(src.data);
      const cq = code ? K.contractQ(code, x.entry) : K.frontQ(x.entry, info.rolls);
      if (cq == null) { invalid++; return; }
      const ovr = { q: cq, ...K.tradeSessions(x.entry, x.exit) };
      for (const s of K.seriesSegments(from, to, info.v0, { override: ovr, rolls: info.rolls })) wanted.push({ data: src.data, layer: layerOf('1s', src.data, s), from: s.from, to: s.to });
      // P36 (28.10.2026), słowa użytkownika: «okej to wroc» (powrót do P25: automatycznie tylko okna 1s). Minutówki sesji trade'a i historia kontraktu
      // (.v.0 oraz warstwy 1m-<kontrakt>) NIE trafiają do kolejki: pobiera je tylko kliknięcie przycisku z wyceną (quote/fetchDays) albo import.
      // Brakujące minutówki wykres dostaje w `missing` i pokazuje jako przycisk „Pobierz (x,xx USD)”. Do 28.10.2026 (P35) kolejka dokładała tu 1m sesji trade'a.
    };
    for (const x of trades) {
      const ok = x && isT(x.entry) && isT(x.exit) && x.exit >= x.entry;
      const w = ok ? tradeWindow(x.entry, x.exit) : { from: x?.entry, to: x?.exit };
      take(x?.instrument, w.from, w.to, ok ? x : null);
    }
    for (const x of windows) take(x?.instrument, x?.from, x?.to);
    return { ok: true, ...addToQueue(wanted), noSource: noSrc, invalid };
  }
  // Dokłada okna { data, layer, from, to } do kolejki: łączy z czekającymi tej samej warstwy, pomija pokryte, przy przepełnieniu zostają najświeższe.
  function addToQueue(wanted) {
    const q = Q();
    if (!wanted.length) return { queued: q.items.length, covered: 0, dropped: 0 };
    let covered = 0, droppedNow = 0;
    const keep = [];
    const itemLayer = (i) => i.layer || '1s'; // pozycje sprzed P35: warstwa 1s serii
    const groups = new Set([...q.items.map((i) => `${i.instrument}|${itemLayer(i)}`), ...wanted.map((w) => `${w.data}|${w.layer}`)]);
    for (const g of groups) {
      const [data, layer] = g.split('|');
      const old = q.items.filter((i) => i.instrument === data && itemLayer(i) === layer);
      const fresh = wanted.filter((w) => w.data === data && w.layer === layer);
      if (!fresh.length) { keep.push(...old); continue; }
      const cov = layerCoverage(readCoverage(data, { baseDir }), layer);
      for (const w of mergeWindows([...old.map((i) => ({ from: i.from, to: i.to })), ...fresh.map((w) => ({ from: w.from, to: w.to }))])) {
        if (!subtractRanges(w.from, w.to, cov).length) { covered++; continue; }
        // scalone okno dziedziczy stan wchłoniętych pozycji: zablokowana nie wraca do pending przez dodanie nowego okna
        const parts = old.filter((i) => i.from >= w.from && i.to <= w.to);
        const blocked = parts.find((i) => i.state === 'blocked');
        keep.push({
          id: layer === '1s' ? `${data}-${w.from}-${w.to}` : `${data}-${layer}-${w.from}-${w.to}`, instrument: data, ...(layer === '1s' ? {} : { layer }), from: w.from, to: w.to,
          state: blocked ? 'blocked' : 'pending', reason: blocked ? blocked.reason ?? null : null,
          attempts: Math.max(0, ...parts.map((i) => i.attempts ?? 0)), addedAt: Math.min(now(), ...parts.map((i) => i.addedAt ?? now())),
        });
      }
    }
    // przy przepełnieniu zostają najświeższe okna (to malejąco); liczba odciętych trafia do statusu
    keep.sort((a, b) => b.to - a.to);
    droppedNow = Math.max(0, keep.length - QUEUE_MAX);
    q.items = keep.slice(0, QUEUE_MAX);
    q.dropped = (q.dropped ?? 0) + droppedNow;
    saveQueue();
    return { queued: q.items.length, covered, dropped: droppedNow };
  }

  // ---- P50 (29.10.2026): codzienne okno 1s NQ 9:30–11:00 NY w kolejce ----
  // Słowa użytkownika: «i dodaj tak ze codziennie przy tych codziennych import zawsze pobieramy sekundowki dla nq dla tej poltorej godziny od 9:30 ny open».
  // Decyzja sesji głównej: kolejka (tick, timer serwera co 5 min) sama dokłada okno każdego dnia pon-pt, gdy jest już dostępne (koniec okna ≤ availableEnd),
  // w kontrakcie wg reguły rolla P35; nadrabia od ostatniego dnia z oknem w magazynie (nie wcześniej niż 2020-01-02), okna w magazynie pomija.
  // Zwykłe limity aplikacji (1 USD na pobranie, 3 USD na dobę, strażnik kredytu): budżet 36 USD z P49 tej automatyki nie dotyczy.
  // Przełącznik: config.local.json chartNq1sDaily (domyślnie włączony; Ustawienia → Wykresy → Dane). Włącza go tylko serwer (autoOpenWindows),
  // więc createCandles w testach i skryptach nie dokłada okien sam.
  const dailyOpenOn = () => autoOpenWindows && getConfig().chartNq1sDaily !== false;
  function dailyOpenWanted(end) {
    const src = resolveInstrument(OPEN_INSTRUMENT);
    const cov = readCoverage(src.data, { baseDir });
    const info = contractsOf(src.data, cov);
    // P51 (29.10.2026), słowa użytkownika: «zgadzam sie» (na pytanie: automat nadrabia najwyżej 7 ostatnich dni, ok. 0,14 USD; dłuższe dziury tylko
    // jednorazowym importem z budżetem i zgodą). Także przy pustym magazynie 1s: starszych okien kolejka sama nigdy nie pobiera.
    const nowSec = Math.floor(now() / 1000);
    const floor = Math.max(dayStart(OPEN_WINDOWS_FROM), Math.floor(nowSec / 86400) * 86400 - OPEN_CATCHUP_DAYS * 86400);
    const all = openWindows(floor, Math.min(end, nowSec));
    const segs = (w) => K.seriesSegments(w.from, w.to, info.v0, { rolls: info.rolls }).map((s) => ({ data: src.data, layer: layerOf('1s', src.data, s), from: s.from, to: s.to }));
    const missing = (w) => segs(w).filter((s) => subtractRanges(s.from, s.to, layerCoverage(cov, s.layer)).length);
    let start = 0; // ostatni dzień z pełnym oknem w magazynie (w ostatnich 7 dniach); bez takiego dnia od początku tych 7 dni
    for (let i = all.length - 1; i >= 0; i--) if (!missing(all[i]).length) { start = i; break; }
    return all.slice(start).flatMap(missing);
  }

  // Jeden przebieg kolejki: najnowsze okna najpierw, każde tylko gdy wszystkie strażniki (limit na pobranie, dobowy, kredyt) przepuszczają.
  // Wywołuje timer serwera i testy; sam moduł niczego nie startuje. Zwraca { skipped } albo { done, added, costUsd }.
  async function tick() {
    if (status.running) return { skipped: 'busy' };
    const q = Q();
    if (dailyOpenOn() && getKey()) {
      // P50: okna dnia dokładane przed przebiegiem; błąd (np. brak sieci przy get_dataset_range) nie zatrzymuje reszty kolejki
      try {
        const end = await availableEnd(false);
        await ensureContracts(OPEN_INSTRUMENT, end);
        if (!status.running) addToQueue(dailyOpenWanted(end));
      } catch (e) { console.error('[candles] okna 1s NQ 9:30–11:00:', e.message); }
      if (status.running) return { skipped: 'busy' };
    }
    const pend = q.items.filter((i) => i.state === 'pending').sort((a, b) => b.to - a.to);
    if (!pend.length) return { skipped: 'empty' };
    if (!getKey()) { q.reason = 'no-key'; saveQueue(); return { skipped: 'no-key' }; }
    Object.assign(status, { running: true, phase: 'queue', done: 0, total: pend.length, costUsd: 0, error: null, finishedAt: null, result: null });
    let added = 0, spentAll = 0, finished = 0;
    q.reason = null;
    try {
      const end = await availableEnd(false);
      let waiting = 0;
      for (const item of pend) {
        if (item.to > end) { item.retryAfter = item.to + delaySec(); waiting++; continue; }
        try {
          const src = resolveInstrument(item.instrument);
          const store = item.layer || '1s', res = store.slice(0, 2);
          const runs = subtractRanges(item.from, item.to, layerCoverage(readCoverage(item.instrument, { baseDir }), store)).map(([a, b]) => ({ start: a, end: b, store, symbol: symbolOfLayer(src, store) }));
          if (runs.length) {
            const quotes = await quoteRuns(src, res, runs);
            const total = quotes.reduce((a, b) => a + b, 0);
            if (total > limitUsd()) throw overLimitError(total, limitUsd());
            if (spentToday() + total > dailyLimitUsd()) throw dailyError(total);
            const cp = creditProblem(total);
            if (cp) throw cp;
            const r = await downloadRuns(src, res, runs, quotes, { limit: limitUsd() });
            added += r.added; spentAll += r.spent; status.costUsd = spentAll;
          }
          q.items = q.items.filter((i) => i.id !== item.id); // po id: enqueue w trakcie przebiegu podmienia obiekty pozycji
          finished++; status.done = finished;
        } catch (e) {
          if (!(e instanceof DatabentoError)) { console.error('[candles] kolejka: błąd zapisu:', e.message); q.reason = 'error'; break; }
          const cur = q.items.find((i) => i.id === item.id) ?? item;
          cur.attempts = (cur.attempts ?? 0) + 1;
          if (e.code === 'over-limit' || e.code === 'rejected' || e.code === 'bad-range') { cur.state = 'blocked'; cur.reason = e.message; continue; } // czeka na zmianę limitu albo ręczną decyzję
          console.error('[candles] kolejka wstrzymana:', e.code, e.message);
          cur.reason = e.message;
          q.reason = e.code === 'daily-limit' ? 'daily-limit' : ['credit', 'credit-expired', 'payment'].includes(e.code) ? 'credit' : ['unauthorized', 'no-key'].includes(e.code) ? 'no-key' : 'network';
          break;
        }
      }
      if (!q.reason && waiting) q.reason = 'waiting';
    } catch (e) {
      console.error('[candles] kolejka: błąd:', e.message);
      q.reason = e instanceof DatabentoError ? 'network' : 'error';
      status.error = fail(e);
    } finally {
      q.lastRunAt = new Date(now()).toISOString();
      try { saveQueue(); } catch (e) { console.error('[candles] kolejka: zapis nie powiódł się:', e.message); }
      status.result = { added, costUsd: spentAll, items: finished };
      Object.assign(status, { running: false, phase: 'idle', finishedAt: q.lastRunAt });
    }
    return { done: finished, added, costUsd: spentAll };
  }
  const unblock = () => {
    const blocked = Q().items.filter((i) => i.state === 'blocked');
    if (!blocked.length) return;
    for (const i of blocked) { i.state = 'pending'; i.reason = null; }
    saveQueue();
  };

  // ---- import historii 1m (P25) ----
  // Wycena całości przed startem (domyślnie po latach UTC, chunk: 'month' po miesiącach), pobieranie zakres po zakresie, wznawialne (pokrycie zapisywane po każdym zakresie)
  // i idempotentne (drugi przebieg pobiera tylko to, czego brakuje). Limity aplikacji (1 USD na pobranie, 3 USD na dobę) wolno dla importu
  // podnieść jawnym limitsOverrideUsd (kwota >= wycena, najwyżej IMPORT_MAX_USD). Strażnik kredytu i limit portalu Databento zostają zawsze.
  async function importPlan(q = {}) {
    const { src, from, to } = parseQuery({ instrument: q.instrument, from: q.from ?? MIN_FROM, to: q.to ?? Math.floor(now() / 1000) }, { maxSpan: 40 * 366 * 86400 });
    if (!src) return { noSource: true };
    if (q.chunk !== undefined && !['year', 'month'].includes(q.chunk)) throw bad(t('Nieprawidłowa porcja importu: {chunk} (year albo month).', { chunk: String(q.chunk).slice(0, 10) }));
    if (q.series !== undefined && q.series !== 'contracts') throw bad(t('Nieprawidłowa seria importu: {s} (contracts albo brak).', { s: String(q.series).slice(0, 12) }));
    const end = await availableEnd(q.refresh === true);
    const eff = floorMin(Math.min(to, end));
    // P35: series=contracts = tylko warstwy kontraktów w oknach rolli (od sesji przed rollem rynku do przełączenia .v.0), te same zakresy, które
    // plan zwykłego pobrania dokłada sam; historia .v.0 zostaje bez zmian.
    let contractRuns = null;
    if (q.series === 'contracts') {
      await ensureContracts(src.data, end);
      contractRuns = segmentRuns(src, '1m', floorMin(from), eff, null, readCoverage(src.data, { baseDir })).filter((r) => r.store !== '1m');
    }
    const cov = readCoverage(src.data, { baseDir })['1m'];
    const chunks = [];
    for (const c of (q.chunk === 'month' ? monthChunks : yearChunks)(floorMin(from), eff)) {
      const runs = contractRuns ? contractRuns.filter((r) => r.start >= c.from && r.start < c.to) : subtractRanges(c.from, c.to, cov).map(([a, b]) => ({ start: a, end: b }));
      if (!runs.length) continue;
      const quotes = await quoteRuns(src, '1m', runs, { timeoutMs: IMPORT_COST_TIMEOUT_MS });
      chunks.push({ from: c.from, to: c.to, runs: runs.map((r, i) => ({ ...r, costUsd: quotes[i] })), costUsd: quotes.reduce((a, b) => a + b, 0) });
    }
    const totalUsd = chunks.reduce((a, c) => a + c.costUsd, 0);
    return { src, instrument: src.data, availableEnd: end, from: floorMin(from), to: eff, chunks, runs: chunks.reduce((a, c) => a + c.runs.length, 0), totalUsd, credit: creditInfo(), limitUsd: limitUsd(), dailyLimitUsd: dailyLimitUsd(), spentTodayUsd: spentToday(), withinLimits: totalUsd <= limitUsd() && spentToday() + totalUsd <= dailyLimitUsd(), nothing: !chunks.length };
  }
  const publicPlan = (p) => { const { src, ...rest } = p; return { ...rest, chunks: rest.chunks?.map((c) => ({ from: c.from, to: c.to, costUsd: c.costUsd, runs: c.runs.length })) }; };

  // body: { instrument, from?, to?, dryRun?, confirmedCostUsd, limitsOverrideUsd? }. dryRun zwraca samą wycenę (get_cost jest bezpłatne).
  async function importHistory(body) {
    body = body ?? {};
    return withPrepareLock(() => prepareImport(body));
  }
  async function prepareImport(body) {
    const pl = await importPlan(body);
    if (pl.noSource) return noSource();
    if (body.dryRun === true) return { ...publicPlan(pl), started: false, dryRun: true };
    const confirmed = body.confirmedCostUsd;
    if (typeof confirmed !== 'number' || !Number.isFinite(confirmed) || confirmed < 0) throw bad(t('Import wymaga potwierdzonej wyceny całości (confirmedCostUsd). Najpierw zrób wycenę (dryRun).'), 400, 'no-quote');
    if (pl.nothing) return { ...publicPlan(pl), started: false };
    const total = pl.totalUsd;
    if (total > confirmed * (1 + COST_TOLERANCE)) throw bad(t('Koszt importu wzrósł do {cost} USD (potwierdzono {confirmed} USD). Nic nie pobrano, zatwierdź nową wycenę.', { cost: total.toFixed(4), confirmed: confirmed.toFixed(4) }), 409, 'cost-changed', { costUsd: total });
    const cp = creditProblem(total);
    if (cp) throw cp;
    const ov = body.limitsOverrideUsd;
    let limit = limitUsd(), dailyCap = dailyLimitUsd();
    if (ov !== undefined) {
      if (typeof ov !== 'number' || !Number.isFinite(ov) || ov <= 0 || ov > IMPORT_MAX_USD) throw bad(t('Podniesienie limitów importu musi być kwotą od 0 do {max} USD (limit portalu Databento).', { max: String(IMPORT_MAX_USD) }));
      if (ov < total * (1 + COST_TOLERANCE)) throw bad(t('Kwota podniesienia limitów ({ov} USD) jest mniejsza niż wycena importu ({cost} USD) z zapasem 5%. Nic nie pobrano.', { ov: String(ov), cost: total.toFixed(4) }), 409, 'override-too-small', { costUsd: total });
      // Świadomie: jawny limitsOverrideUsd omija też dzienny sufit 3 USD (P24). To zgodne z planem P25 przyjętym przez użytkownika (import jednorazowo
      // z chwilowym podniesieniem limitów aplikacji). Strażnik kredytu (creditProblem) i limit portalu Databento zostają zawsze.
      limit = ov; dailyCap = null; // tylko dla tego przebiegu: nic nie zapisujemy do konfiguracji
    } else if (!pl.withinLimits) {
      throw bad(t('Import kosztuje {cost} USD, a limity aplikacji to {limit} USD na pobranie i {daily} USD na dobę (dziś wydano {spent} USD). Nic nie pobrano. Żeby je podnieść tylko dla tego importu, podaj limitsOverrideUsd z kwotą (najwyżej {max} USD).', { cost: total.toFixed(4), limit: String(limitUsd()), daily: String(dailyLimitUsd()), spent: spentToday().toFixed(4), max: String(IMPORT_MAX_USD) }), 409, 'needs-override', { costUsd: total });
    }
    const runs = pl.chunks.flatMap((c) => c.runs.map((r) => ({ start: r.start, end: r.end, store: r.store, symbol: r.symbol })));
    const quotes = pl.chunks.flatMap((c) => c.runs.map((r) => r.costUsd));
    Object.assign(status, { running: true, phase: 'import', done: 0, total: runs.length, costUsd: total, error: null, finishedAt: null, result: null });
    (async () => {
      try {
        const r = await downloadRuns(pl.src, '1m', runs, quotes, { limit, dailyCap, onRun: (n) => { status.done = n; }, costTimeoutMs: IMPORT_COST_TIMEOUT_MS, rangeTimeoutMs: IMPORT_RANGE_TIMEOUT_MS });
        status.result = { added: r.added, costUsd: r.spent, runs: runs.length };
      } catch (e) {
        console.error('[candles] import przerwany:', e.message);
        status.error = fail(e);
      } finally { Object.assign(status, { running: false, phase: 'idle', finishedAt: new Date(now()).toISOString() }); }
    })();
    return { started: true, costUsd: total, runs: runs.length, instrument: pl.instrument };
  }

  // ---- import okien 1s NQ 9:30–11:00 NY (P49) ----
  // Brakujące części okien (pokrycie warstwy kontraktu wg reguły P35) z symbolem Databento. Tylko okna, których koniec jest już dostępny (≤ availableEnd).
  function openRuns(src, from, to, cov) {
    const info = contractsOf(src.data, cov);
    const runs = [];
    for (const w of openWindows(from, to)) {
      for (const s of K.seriesSegments(w.from, w.to, info.v0, { rolls: info.rolls })) {
        const L = layerOf('1s', src.data, s);
        for (const [a, b] of subtractRanges(s.from, s.to, layerCoverage(cov, L))) runs.push({ day: w.day, start: a, end: b, store: L, symbol: symbolOfLayer(src, L) });
      }
    }
    return runs;
  }
  const openQuoteCache = new Map();
  // Bezpłatna wycena okna (timeout, sieć i 5xx ponawia quoteOne; 429 przerywa wycenę, a skrypt CLI ponawia rok po przerwie: moduł nie ma timerów, P25).
  const openQuote = (src, r) => quoteOne(src, '1s', r, IMPORT_COST_TIMEOUT_MS);
  const openState = () => { const s = readAux(OPEN_STATE, { baseDir }) || {}; return { spentUsd: Number.isFinite(s.spentUsd) ? s.spentUsd : 0, windows: Number(s.windows) || 0, batches: Number(s.batches) || 0, startedAt: s.startedAt ?? null, updatedAt: s.updatedAt ?? null }; };
  const budgetError = (spent, next, budget) => bad(t('Budżet importu 1s ({budget} USD) zostałby przekroczony: wydano {spent} USD, następna partia kosztuje {next} USD. Pobieranie zatrzymane, nic więcej nie pobrano.', { budget: String(budget), spent: spent.toFixed(4), next: next.toFixed(4) }), 409, 'budget', { costUsd: next });
  async function importOpenPlan(q = {}) {
    if (String(q.instrument ?? OPEN_INSTRUMENT).toUpperCase() !== OPEN_INSTRUMENT) throw bad(t('Import okien 1s obejmuje tylko NQ (P49).'));
    const floor = dayStart(OPEN_WINDOWS_FROM);
    const from = q.from ?? floor, to = q.to ?? Math.floor(now() / 1000);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < floor || to <= from) throw bad(t('Nieprawidłowy zakres importu okien 1s: od {from} (nie wcześniej niż 2020-01-02), do {to}.', { from: String(q.from).slice(0, 14), to: String(q.to).slice(0, 14) }));
    const src = resolveInstrument(OPEN_INSTRUMENT);
    const end = await availableEnd(q.refresh === true);
    await ensureContracts(src.data, end);
    const runs = openRuns(src, from, Math.min(to, end), readCoverage(src.data, { baseDir }));
    // Pamięć wycen (29.10.2026, pomiar: jedno get_cost ohlcv-1s trwa ok. 5,5 s): wycena tego samego zakresu (warstwa, symbol, od, do) z ostatnich
    // OPEN_QUOTE_TTL_MS jest używana ponownie, więc start po wycenie nie wycenia wszystkiego drugi raz. Nie osłabia kontroli: tuż przed każdym
    // get_range klient i tak robi świeży get_cost (wzrost > 5% = cost-changed, nic nie pobrane), a hak sprawdza budżet ze świeżą kwotą.
    const rk = (r) => `${r.store}|${r.symbol}|${r.start}|${r.end}`;
    // Sama wycena (dryRun) zawsze pyta Databento od nowa: to na niej opiera się decyzja o pobraniu; z pamięci korzysta tylko start pobrania.
    const quotes = runs.map((r) => { const c = q.dryRun === true ? null : openQuoteCache.get(rk(r)); return c && now() - c.at < OPEN_QUOTE_TTL_MS ? c.usd : undefined; });
    const todo = runs.map((r, i) => i).filter((i) => quotes[i] === undefined);
    for (let k = 0; k < todo.length; k += OPEN_QUOTE_PARALLEL) {
      await Promise.all(todo.slice(k, k + OPEN_QUOTE_PARALLEL).map(async (i) => {
        quotes[i] = await openQuote(src, runs[i]);
        openQuoteCache.set(rk(runs[i]), { usd: quotes[i], at: now() });
      }));
    }
    const totalUsd = r6(quotes.reduce((a, b) => a + b, 0));
    const st = openState();
    return {
      src, instrument: src.data, availableEnd: end, from, to: Math.min(to, end), runs, quotes, days: new Set(runs.map((r) => r.day)).size, totalUsd,
      budget: { maxUsd: OPEN_IMPORT_MAX_USD, spentUsd: st.spentUsd, leftUsd: r6(OPEN_IMPORT_MAX_USD - st.spentUsd) }, credit: creditInfo(), nothing: !runs.length,
    };
  }
  const publicOpen = (p) => ({ instrument: p.instrument, availableEnd: p.availableEnd, from: p.from, to: p.to, runs: p.runs.length, days: p.days, totalUsd: p.totalUsd, maxQuoteUsd: p.quotes.length ? Math.max(...p.quotes) : 0, budget: p.budget, credit: p.credit, nothing: p.nothing, layers: [...new Set(p.runs.map((r) => r.store))].sort() });
  // body: { instrument: 'NQ', from?, to?, dryRun? | confirmedCostUsd, budgetUsd }. Wycena (dryRun) jest bezpłatna i nic nie pobiera.
  // Pobieranie: partie ≤ 1 USD; przed partią twardy stop, gdy wydane w tym imporcie + partia > budżet; tuż przed każdym get_range klient Databento robi
  // świeży get_cost (getRange), a hak sprawdza budżet jeszcze raz, potem strażnika kredytu i licznik aplikacji (chartCredit, chartSpend), potem licznik importu.
  // Dzienny sufit 3 USD (P24) nie dotyczy tego importu: P49 to jednorazowy wyjątek od limitów z własnym budżetem; limit 1 USD na pobranie zostaje (partia).
  async function importOpen(body) {
    body = body ?? {};
    return withPrepareLock(() => prepareOpen(body));
  }
  async function prepareOpen(body) {
    const pl = await importOpenPlan(body);
    if (body.dryRun === true) return { ...publicOpen(pl), started: false, dryRun: true };
    const confirmed = body.confirmedCostUsd;
    if (typeof confirmed !== 'number' || !Number.isFinite(confirmed) || confirmed < 0) throw bad(t('Import wymaga potwierdzonej wyceny całości (confirmedCostUsd). Najpierw zrób wycenę (dryRun).'), 400, 'no-quote');
    const budget = body.budgetUsd;
    if (typeof budget !== 'number' || !Number.isFinite(budget) || budget <= 0 || budget > OPEN_IMPORT_MAX_USD) throw bad(t('Budżet importu okien 1s musi być kwotą od 0 do {max} USD (P49).', { max: String(OPEN_IMPORT_MAX_USD) }), 400, 'bad-budget');
    if (pl.nothing) return { ...publicOpen(pl), started: false };
    if (pl.totalUsd > confirmed * (1 + COST_TOLERANCE)) throw bad(t('Koszt importu wzrósł do {cost} USD (potwierdzono {confirmed} USD). Nic nie pobrano, zatwierdź nową wycenę.', { cost: pl.totalUsd.toFixed(4), confirmed: confirmed.toFixed(4) }), 409, 'cost-changed', { costUsd: pl.totalUsd });
    const batches = openBatches(pl.quotes);
    const big = pl.quotes.findIndex((x) => x > OPEN_BATCH_MAX_USD);
    if (big >= 0) throw overLimitError(pl.quotes[big], OPEN_BATCH_MAX_USD);
    const st = openState();
    if (st.spentUsd + batches[0].usd > budget + 1e-9) throw budgetError(st.spentUsd, batches[0].usd, budget);
    const cp = creditProblem(Math.min(pl.totalUsd, budget - st.spentUsd));
    if (cp) throw cp;
    const state = { ...st, budgetUsd: budget, startedAt: st.startedAt ?? new Date(now()).toISOString() };
    const save = () => { state.updatedAt = new Date(now()).toISOString(); writeAux(OPEN_STATE, state, { baseDir }); };
    // osobny klient: hak beforeRange pilnuje budżetu importu i zapisuje jego licznik natychmiast (pesymistycznie, jak licznik kredytu)
    // P49, decyzja sesji głównej 29.10.2026 (przegląd 1.3.0): wydatek importu liczy się też do dziennego limitu 3 USD (guard.beforeRange), więc w dniu importu zwykłe pobrania
    // czekają do północy UTC; to ogranicza wydatki, nie zwiększa ich.
    const client = createDatabento({ key: getKey() || '', now, fetchImpl, maxCostUsd: OPEN_BATCH_MAX_USD, t, beforeRange: (cost) => {
      if (state.spentUsd + cost > budget + 1e-9) throw budgetError(state.spentUsd, cost, budget);
      guard.beforeRange(cost);
      state.spentUsd = r6(state.spentUsd + cost);
      save();
    } });
    const runId = ++importSeq;
    Object.assign(status, { running: true, phase: 'import-1s', done: 0, total: pl.runs.length, costUsd: pl.totalUsd, error: null, finishedAt: null, result: null });
    (async () => {
      let added = 0, spent = 0, done = 0, importErr = null, importRes = null;
      const log = [];
      try {
        for (const b of batches) {
          if (state.spentUsd + b.usd > budget + 1e-9) throw budgetError(state.spentUsd, b.usd, budget);
          let bs = 0, bn = 0;
          // okna partii po OPEN_DOWNLOAD_PARALLEL naraz (każde: świeży get_cost, hak budżetu i kredytu, get_range, zapis). Hak jest synchroniczny,
          // więc sprawdzenie budżetu i rezerwacja nie przeplatają się między oknami. allSettled: przy błędzie czekamy na resztę okien tej porcji,
          // żeby po zakończeniu statusu żadne pobranie nie trwało w tle (wznowienie nie pobierze tego samego okna drugi raz).
          for (let i = b.from; i < b.to; i += OPEN_DOWNLOAD_PARALLEL) {
            const part = [];
            for (let k = i; k < Math.min(i + OPEN_DOWNLOAD_PARALLEL, b.to); k++) part.push(k);
            const res = await Promise.allSettled(part.map(async (k) => {
              const r = pl.runs[k];
              const got = await client.getRange({ symbol: r.symbol, start: r.start, end: r.end, schema: LAYER_SCHEMA['1s'] }, { confirmedCostUsd: pl.quotes[k], maxCostUsd: OPEN_BATCH_MAX_USD, costTimeoutMs: IMPORT_COST_TIMEOUT_MS, rangeTimeoutMs: IMPORT_RANGE_TIMEOUT_MS });
              const bars = got.bars.filter((x) => x[0] >= r.start && x[0] < r.end);
              const rolls = r.store === '1s' ? got.rolls.filter((x) => x.t >= r.start && x.t < r.end).map((x) => ({ t: x.t, label: `${x.from}→${x.to}` })) : [];
              writeRange(pl.src.data, r.store, r.start, r.end, bars, { rolls }, { baseDir });
              added += bars.length; spent = r6(spent + got.costUsd); bs = r6(bs + got.costUsd); bn++; done++;
              status.done = done;
            }));
            const bad1 = res.find((x) => x.status === 'rejected');
            if (bad1) { log.push([bn, bs]); throw bad1.reason; }
          }
          log.push([b.to - b.from, bs]);
          state.windows += b.to - b.from; state.batches++; save();
        }
        status.result = importRes = { added, costUsd: spent, runs: done, batches: log };
      } catch (e) {
        console.error('[candles] import okien 1s przerwany:', e.message);
        status.error = importErr = fail(e);
        status.result = importRes = { added, costUsd: spent, runs: done, batches: log };
      } finally {
        const fin = new Date(now()).toISOString();
        lastImport = { id: runId, error: importErr, result: importRes, finishedAt: fin };
        Object.assign(status, { running: false, phase: 'idle', finishedAt: fin });
      }
    })();
    return { started: true, runId, costUsd: pl.totalUsd, runs: pl.runs.length, days: pl.days, batches: batches.length, budget: { maxUsd: budget, spentUsd: st.spentUsd } };
  }

  // Klucz: format, bezpłatne get_cost na 1 minutę (sprawdza klucz bez pobierania), dopiero potem zapis do .env.
  async function setKey(body) {
    body = body ?? {};
    const key = String(body.key ?? '').trim();
    if (!KEY_RE.test(key)) throw bad(t('To nie wygląda na klucz Databento (10 do 100 znaków: litery, cyfry, - i _).'));
    const probe = createDatabento({ key, now, fetchImpl, t });
    const end = (await probe.getDatasetRange({ force: true })).endSec;
    await probe.getCost({ symbol: 'ES.v.0', start: end - 60, end });
    saveKey(key);
    client = null;
    return { ok: true };
  }
  function setLimit(body) {
    const ok = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0.01 && v <= 100;
    const okCredit = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10000; // twardy sufit startUsd (125) sprawdza dalej kod po potwierdzeniu
    const okDate = (v) => typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
    const { maxCostUsd: a, dailyLimitUsd: d, creditStartUsd: cs, creditSpentUsd: cp, creditExpires: ce } = body ?? {};
    const given = [a, d, cs, cp, ce].some((x) => x !== undefined);
    if (!given || (a !== undefined && !ok(a)) || (d !== undefined && !ok(d)) || (cs !== undefined && !(okCredit(cs) && cs > 0)) || (cp !== undefined && !okCredit(cp)) || (ce !== undefined && !okDate(ce))) {
      throw bad(t('Limit kosztu musi być liczbą od 0,01 do 100 USD, kredyt liczbą od 0 do 125 USD, a data wygaśnięcia datą RRRR-MM-DD.'));
    }
    // Kredyt to pieniądze: zmiana startu, wydanej kwoty albo daty wygaśnięcia tylko z jawnym potwierdzeniem (confirm: true). Start nie może przekroczyć 125 USD.
    // Cofnięcie licznika wydatków (spentUsd w dół) jest tym samym rodzajem zmiany i też wymaga confirm: true.
    if ((cs !== undefined || cp !== undefined || ce !== undefined) && body.confirm !== true) {
      throw bad(t('Zmiana kredytu Databento (start, wydane, data wygaśnięcia) wymaga potwierdzenia: wyślij confirm: true. Nic nie zmieniono.'), 400, 'confirm-required');
    }
    if (cs !== undefined && cs > CREDIT_START_USD) throw bad(t('Kredyt startowy nie może przekraczać {max} USD.', { max: String(CREDIT_START_USD) }));
    const cfg = getConfig();
    if (a !== undefined) cfg.chartCostLimitUsd = a;
    if (d !== undefined) cfg.chartDailyLimitUsd = d;
    if (cs !== undefined || cp !== undefined || ce !== undefined) {
      const c = creditCfg();
      cfg.chartCredit = { startUsd: cs ?? c.startUsd, expires: ce ?? c.expires, spentUsd: cp ?? c.spentUsd };
    }
    persistConfig();
    if (a !== undefined) unblock(); // pozycje zablokowane limitem dostają kolejną szansę
    return { ok: true, limitUsd: limitUsd(), dailyLimitUsd: dailyLimitUsd(), credit: creditInfo() };
  }
  return {
    read, quote, fetchDays, setKey, setLimit, enqueue, tick, importPlan, importHistory, importOpen,
    status: () => ({ ...status, credit: creditInfo(), queue: queueInfo(), open1s: openState(), import1s: lastImport, importId: status.running && status.phase === 'import-1s' ? importSeq : null }),
    limitUsd, dailyLimitUsd, spentToday, credit: creditInfo, hasKey: () => !!getKey(),
    dataBytes,
  };
  // Rozmiar chart-data/ zapamiętany na 60 s (jedno przejście katalogu także przy kilku pytaniach naraz); Ustawienia pokazują go tylko do podglądu.
  function dataBytes() {
    const at = now();
    if (sizeMemo && at - sizeMemo.at < SIZE_TTL_MS) return sizeMemo.p;
    const memo = { at, p: dirBytes(baseDir).catch(() => 0) };
    sizeMemo = memo;
    return memo.p;
  }
}
