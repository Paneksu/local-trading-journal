// Klient HTTP Databento (historyczne OHLCV 1 s i 1 m dla futures ES/NQ, P25). Bez SDK, bez zależności, tylko fetch.
// Bezpieczniki kosztu: symbole tylko z jednej mapy (ES.v.0 / NQ.v.0) albo kontrakt kwartalny ES/NQ (P35, RAW_RE), get_range NIE ISTNIEJE bez get_cost tuż przed pobraniem,
// wycena wyższa niż potwierdzona + 5% albo ponad limit przerywa bez pobierania. Klucz trafia wyłącznie do nagłówka Authorization
// żądania do hist.databento.com (albo do lokalnej atrapy w testach); nie ma go w wyjątkach, logach ani zwracanych danych.
// English: minimal Databento historical client with cost guards; the API key only goes into the Authorization header.
import { tr } from './i18n.mjs';

export const DATASET = 'GLBX.MDP3';
export const SCHEMA = 'ohlcv-1s';
// P25 (27.10.2026): dwie schemy, bo dwie warstwy: 1m (historia) i 1s (okna wokół trade'ów). Domyślna zostaje 1s.
export const SCHEMAS = Object.freeze(['ohlcv-1s', 'ohlcv-1m']);
export const DEFAULT_BASE = 'https://hist.databento.com';
export const DEFAULT_MAX_COST_USD = 1; // P2: limit jednego pobrania
export const COST_TOLERANCE = 0.05; // wycena tuż przed pobraniem może przekroczyć potwierdzoną najwyżej o 5%
export const RANGE_TTL_MS = 15 * 60 * 1000; // cache get_dataset_range
const TIMEOUT_COST_MS = 30_000;
const TIMEOUT_RANGE_MS = 180_000;

// Jedna stała mapa instrument → symbol ciągły (P9: MES→ES, MNQ→NQ; P1: rolowanie wg obrotu, nigdy .FUT ani .c.).
// P35 (28.10.2026): chwila przełączenia serii na wykresie to roll rynku (kontrakty.js), nie przełączenie .v.0; .v.0 zostaje źródłem historii.
const MAP = Object.freeze({ ES: 'ES.v.0', MES: 'ES.v.0', NQ: 'NQ.v.0', MNQ: 'NQ.v.0' });
export const DB_SYMBOLS = Object.freeze(['ES.v.0', 'NQ.v.0']);
// P35 (28.10.2026), słowa użytkownika: «Tak żeby było jak najbardziej poprawnie», «Tak, do 0,40 USD»: obok serii .v.0 pobieramy konkretny kontrakt
// kwartalny po symbolu surowym (stype_in=raw_symbol, np. ESH6), bo .v.1 przeskakuje między kontraktami (181 odcinków ES 2010–2026, symbology.resolve).
// Symbol surowy Databento rozwiązuje w czasie (ESH6 w 2016 i w 2026 to różne instrumenty), więc zakres żądania wskazuje rok.
export const RAW_RE = /^(ES|NQ)[HMUZ]\d$/;
const stypeOf = (symbol) => (RAW_RE.test(symbol) ? 'raw_symbol' : 'continuous');
// Zwraca { data: 'ES'|'NQ', symbol: 'ES.v.0'|'NQ.v.0' } albo null (EURUSD, XAUUSD i reszta: brak źródła danych).
export function resolveInstrument(instrument) {
  const key = String(instrument ?? '').trim().toUpperCase();
  if (!Object.hasOwn(MAP, key)) return null;
  const symbol = MAP[key];
  return { data: symbol.slice(0, 2), symbol };
}

// Błąd z komunikatem bezpiecznym dla użytkownika (już przetłumaczonym). status: kod HTTP dla przeglądarki; code: maszynowy powód.
export class DatabentoError extends Error {
  constructor(message, status = 502, code = 'error', extra = {}) { super(message); this.name = 'DatabentoError'; this.status = status; this.code = code; Object.assign(this, extra); }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoSec = (sec) => new Date(sec * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const num = (x) => typeof x === 'number' && Number.isFinite(x);

// Baza tylko hist.databento.com albo pętla zwrotna (atrapa testowa): klucz nie wyjdzie na obcy adres, nawet z błędnej zmiennej środowiskowej.
export function checkBase(base) {
  let u;
  try { u = new URL(base); } catch { return false; }
  if (u.protocol === 'https:' && u.hostname === 'hist.databento.com') return true;
  return u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
}

// ---- parser CSV (kolumny po nazwach z nagłówka) ----
// cena 1e-9 → grosze ×100 (dzielenie przez 1e7 z zaokrągleniem), ts_event w ns → sekundy. Zmiana instrument_id między kolejnymi
// świecami → wpis rolls { t, from, to }. Zwraca { bars: [[t,o,h,l,c,v]…], rolls, dropped }.
const REQUIRED = ['ts_event', 'instrument_id', 'open', 'high', 'low', 'close', 'volume'];
function px(s, row, col) {
  if (/^-?\d+$/.test(s)) {
    const n = BigInt(s);
    return Number((n * 2n + (n < 0n ? -10_000_000n : 10_000_000n)) / 20_000_000n); // /1e7, zaokrąglenie połówek od zera
  }
  if (/^-?\d+\.\d+$/.test(s)) return Math.round(Number(s) * 100); // gdyby serwer oddał ceny czytelne (pretty_px)
  throw new DatabentoError(tr('Databento: nieczytelna wartość „{val}” w kolumnie {col} (wiersz {row}).', { val: s.slice(0, 40), col, row }), 502, 'bad-csv');
}
export function parseOhlcvCsv(text) {
  const lines = String(text ?? '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return { bars: [], rolls: [], dropped: 0 };
  const head = lines[0].split(',').map((h) => h.trim());
  const idx = Object.fromEntries(REQUIRED.map((c) => [c, head.indexOf(c)]));
  const miss = REQUIRED.filter((c) => idx[c] < 0);
  if (miss.length) throw new DatabentoError(tr('Databento: w odpowiedzi brakuje kolumn {cols}. Nagłówek: {head}.', { cols: miss.join(', '), head: head.slice(0, 20).join(',') }), 502, 'bad-csv');
  const raw = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const row = i + 1;
    if (c.length < head.length) throw new DatabentoError(tr('Databento: wiersz {row} ma {n} kolumn zamiast {m}.', { row, n: c.length, m: head.length }), 502, 'bad-csv');
    const ts = c[idx.ts_event]?.trim() ?? '';
    if (!/^\d{10,19}$/.test(ts)) throw new DatabentoError(tr('Databento: nieczytelny czas „{val}” w wierszu {row}.', { val: ts.slice(0, 40), row }), 502, 'bad-csv');
    const t = Number(BigInt(ts) / 1_000_000_000n);
    const volStr = c[idx.volume].trim();
    const vol = Number(volStr);
    if (volStr === '' || !Number.isInteger(vol) || vol < 0) throw new DatabentoError(tr('Databento: nieczytelny wolumen „{val}” w wierszu {row}.', { val: String(c[idx.volume]).slice(0, 40), row }), 502, 'bad-csv');
    raw.push({ t, id: c[idx.instrument_id]?.trim(), o: px(c[idx.open].trim(), row, 'open'), h: px(c[idx.high].trim(), row, 'high'), l: px(c[idx.low].trim(), row, 'low'), c: px(c[idx.close].trim(), row, 'close'), v: vol });
  }
  raw.sort((a, b) => a.t - b.t);
  const bars = [], rolls = [];
  let dropped = 0, prevId = null, prevT = -1;
  for (const r of raw) {
    if (r.t === prevT) { dropped++; continue; } // dwa rekordy w tej samej sekundzie: zostaje pierwszy
    if (prevId !== null && r.id !== prevId) rolls.push({ t: r.t, from: prevId, to: r.id });
    prevId = r.id; prevT = r.t;
    bars.push([r.t, r.o, r.h, r.l, r.c, r.v]);
  }
  return { bars, rolls, dropped };
}

// ---- klient ----
// opts: { key, base, fetchImpl, now, maxCostUsd, t }. Każde wywołanie sieci idzie przez request(); nie ma innej drogi do POST get_range.
// beforeRange(costUsd): ostatni strażnik tuż przed get_range (np. kredyt); wyjątek z niego przerywa bez pobierania.
export function createDatabento({ key, base = process.env.DATABENTO_API_BASE || DEFAULT_BASE, fetchImpl = globalThis.fetch, now = Date.now, maxCostUsd = DEFAULT_MAX_COST_USD, beforeRange = null, t = tr } = {}) {
  const baseUrl = String(base).replace(/\/$/, '');
  const auth = key ? 'Basic ' + Buffer.from(`${key}:`).toString('base64') : null;
  const scrub = (s) => (key ? String(s).split(key).join('***') : String(s));
  let rangeCache = null;

  const known = (sym) => DB_SYMBOLS.includes(sym) || RAW_RE.test(sym);
  function checkParams({ symbol, start, end, schema = SCHEMA }) {
    if (!SCHEMAS.includes(schema)) throw new DatabentoError(t('Nieznana schema Databento: {schema}.', { schema: String(schema).slice(0, 20) }), 400, 'bad-schema');
    if (!known(symbol)) throw new DatabentoError(t('Brak źródła danych dla symbolu {sym}.', { sym: String(symbol).slice(0, 20) }), 400, 'bad-symbol');
    if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) throw new DatabentoError(t('Zły zakres czasu: start {start}, koniec {end} (sekundy epoki, koniec musi być po starcie).', { start: String(start), end: String(end) }), 400, 'bad-range');
  }

  async function request(method, pathname, form, timeoutMs) {
    if (!baseUrl || !checkBase(baseUrl)) throw new DatabentoError(t('Databento: adres usługi musi być hist.databento.com (ustawiono: {base}).', { base: scrub(baseUrl).slice(0, 60) }), 500, 'bad-base');
    if (!auth) throw new DatabentoError(t('Brak klucza Databento. Wpisz go w Ustawieniach → Wykresy.'), 409, 'no-key');
    const qs = new URLSearchParams(form).toString();
    const isGet = method === 'GET';
    let res;
    try {
      res = await fetchImpl(baseUrl + pathname + (isGet ? '?' + qs : ''), {
        method,
        headers: { Authorization: auth, ...(isGet ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }) },
        body: isGet ? undefined : qs,
        redirect: 'error', // klucz nie pójdzie za przekierowaniem pod inny adres
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      throw new DatabentoError(timeout
        ? t('Databento nie odpowiada (przekroczono czas {sec} s). Spróbuj za chwilę.', { sec: Math.round(timeoutMs / 1000) })
        : t('Nie można połączyć się z Databento. Sprawdź połączenie z internetem i spróbuj ponownie.'), 504, timeout ? 'timeout' : 'network');
    }
    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = String(j?.detail?.message || j?.detail || j?.message || ''); } catch { /* brak treści */ }
      detail = scrub(detail).slice(0, 200);
      const s = res.status;
      if (s === 401) throw new DatabentoError(t('Databento odrzucił klucz (401). Klucz jest błędny lub wygasł: wpisz nowy w Ustawieniach → Wykresy.'), 502, 'unauthorized', { upstream: s });
      if (s === 402) throw new DatabentoError(t('Databento: brak środków albo abonamentu na te dane (402). {detail}', { detail }), 402, 'payment', { upstream: s });
      if (s === 422) throw new DatabentoError(t('Databento nie przyjął zapytania (422): {detail}', { detail: detail || t('zakres lub symbol poza dostępnymi danymi') }), 422, 'rejected', { upstream: s });
      if (s === 429) throw new DatabentoError(t('Databento: za dużo żądań (429). Poczekaj chwilę i spróbuj ponownie.'), 429, 'rate-limit', { upstream: s });
      throw new DatabentoError(t('Databento: błąd {status}. {detail}', { status: s, detail }), 502, 'upstream', { upstream: s });
    }
    return res;
  }
  const baseForm = ({ symbol, start, end, schema = SCHEMA }) => ({ dataset: DATASET, symbols: symbol, schema, stype_in: stypeOf(symbol), stype_out: 'instrument_id', start: isoSec(start), end: isoSec(end) });

  // P35: darmowe symbology.resolve (bez pobierania danych): symbole → [{ d0, d1, s }] (daty YYYY-MM-DD, d1 wyłącznie, s = instrument_id).
  // Tylko symbole z mapy albo surowe kwartalne ES/NQ; end_date nie może wychodzić poza dostępne dane (inaczej 422 o abonamencie).
  async function resolve({ symbols, startDate, endDate }) {
    const list = String(symbols).split(',');
    if (!list.length || list.length > 20 || list.some((s) => !known(s)) || new Set(list.map(stypeOf)).size !== 1) throw new DatabentoError(t('Brak źródła danych dla symbolu {sym}.', { sym: String(symbols).slice(0, 40) }), 400, 'bad-symbol');
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate) || endDate <= startDate) throw new DatabentoError(t('Zły zakres dat symboli: {a}..{b}.', { a: String(startDate).slice(0, 10), b: String(endDate).slice(0, 10) }), 400, 'bad-range');
    const res = await request('POST', '/v0/symbology.resolve', { dataset: DATASET, symbols: list.join(','), stype_in: stypeOf(list[0]), stype_out: 'instrument_id', start_date: startDate, end_date: endDate }, TIMEOUT_COST_MS);
    let j;
    try { j = await res.json(); } catch { j = null; }
    if (!j || typeof j.result !== 'object') throw new DatabentoError(t('Databento: nieczytelna odpowiedź symbology.'), 502, 'bad-symbology');
    const out = {};
    for (const s of list) out[s] = (Array.isArray(j.result[s]) ? j.result[s] : []).filter((x) => DATE_RE.test(x?.d0) && DATE_RE.test(x?.d1) && /^\d{1,12}$/.test(String(x?.s))).map((x) => ({ d0: x.d0, d1: x.d1, s: String(x.s) }));
    return out;
  }

  // Wycena w USD. Bezpłatne po stronie Databento (założenie P23: dokumentacja wprost nie mówi).
  async function getCost(p, { timeoutMs = TIMEOUT_COST_MS } = {}) {
    checkParams(p);
    const res = await request('POST', '/v0/metadata.get_cost', baseForm(p), timeoutMs);
    let v;
    try { v = JSON.parse(await res.text()); } catch { v = NaN; }
    if (!num(v) || v < 0) throw new DatabentoError(t('Databento: nieczytelna wycena kosztu.'), 502, 'bad-cost');
    return v;
  }

  // Pobranie świec. confirmedCostUsd jest OBOWIĄZKOWE; tuż przed pobraniem własny get_cost: wycena > potwierdzona + 5% albo
  // > limit (maxCostUsd z wywołania, domyślnie z klienta) przerywa bez żądania get_range. Zwraca { bars, rolls, dropped, costUsd }.
  async function getRange(p, { confirmedCostUsd, maxCostUsd: limit = maxCostUsd, costTimeoutMs, rangeTimeoutMs = TIMEOUT_RANGE_MS } = {}) {
    checkParams(p);
    if (!num(confirmedCostUsd) || confirmedCostUsd < 0) throw new DatabentoError(t('Pobranie wymaga potwierdzonej wyceny kosztu.'), 400, 'no-quote');
    const fresh = await getCost(p, { timeoutMs: costTimeoutMs });
    if (fresh > limit) throw new DatabentoError(t('Koszt pobrania ({cost} USD) przekracza limit {limit} USD. Nic nie pobrano.', { cost: fresh.toFixed(4), limit: String(limit) }), 409, 'over-limit', { costUsd: fresh });
    if (fresh > confirmedCostUsd * (1 + COST_TOLERANCE)) throw new DatabentoError(t('Koszt pobrania wzrósł do {cost} USD (potwierdzono {confirmed} USD). Nic nie pobrano, zatwierdź nową wycenę.', { cost: fresh.toFixed(4), confirmed: confirmedCostUsd.toFixed(4) }), 409, 'cost-changed', { costUsd: fresh });
    if (beforeRange) await beforeRange(fresh, p);
    const res = await request('POST', '/v0/timeseries.get_range', { ...baseForm(p), encoding: 'csv', compression: 'none', pretty_px: 'false', pretty_ts: 'false' }, rangeTimeoutMs);
    return { ...parseOhlcvCsv(await res.text()), costUsd: fresh };
  }

  // Zakres danych zbioru (koniec = availableEnd). Cache 15 min (zegar `now` wstrzykiwany); force omija cache.
  async function getDatasetRange({ force = false } = {}) {
    if (!force && rangeCache && now() - rangeCache.at < RANGE_TTL_MS) return rangeCache.value;
    let res;
    try { res = await request('GET', '/v0/metadata.get_dataset_range', { dataset: DATASET }, TIMEOUT_COST_MS); }
    catch (e) { if (e.upstream === 405) res = await request('POST', '/v0/metadata.get_dataset_range', { dataset: DATASET }, TIMEOUT_COST_MS); else throw e; }
    let j;
    try { j = await res.json(); } catch { j = null; }
    const endStr = j?.schema?.[SCHEMA]?.end || j?.end;
    const ms = Date.parse(String(endStr).replace(/(\.\d{3})\d+Z$/, '$1Z')); // nanosekundy → milisekundy
    if (!Number.isFinite(ms)) throw new DatabentoError(t('Databento: nieczytelny zakres danych zbioru.'), 502, 'bad-range-reply');
    const value = { endSec: Math.floor(ms / 1000), end: new Date(ms).toISOString() };
    rangeCache = { at: now(), value };
    return value;
  }

  return { hasKey: !!key, getCost, getRange, getDatasetRange, resolve, maxCostUsd };
}
