// Earningsy (pakiet A2): źródła. SEC EDGAR (historia: 8-K z Item 2.02; używa tylko narzędzie generujące plik z wydania, aplikacja nie łączy się z SEC) oraz Finnhub
// (przyszłe terminy i kapitalizacja; aplikacja, tylko z kluczem użytkownika). Klucz Finnhub idzie wyłącznie w nagłówku X-Finnhub-Token do finnhub.io (albo do lokalnej atrapy
// w testach) i jest wycinany z komunikatów błędów. SEC wymaga nagłówka User-Agent z danymi aplikacji (adres repozytorium; kontakt opcjonalny, nigdy w repozytorium)
// i najwyżej 10 zapytań na sekundę: klient trzyma 8.
// English: earnings sources: SEC EDGAR 8-K Item 2.02 history (generator only) and Finnhub calendar/profile (app, with key).
import { tr } from './i18n.mjs';
import { NewsError } from './news.mjs';
import { checkHost, httpGet, parseRetryAfter, readJsonCapped, MAX_BYTES } from './news-sources.mjs';
import { EDGAR_DATA_BASE, EDGAR_WWW_BASE, FINNHUB_BASE, HISTORY_FROM } from './earnings-katalog.mjs';
import { normSymbol, classifyAcceptance } from './earnings.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const from = Date.parse(HISTORY_FROM + 'T00:00:00Z') / 1000;

// User-Agent dla SEC: nazwa i wersja aplikacji + repozytorium w zapisie „właściciel/repo” (sprawdzone 29.10.2026: SEC odrzuca (403) User-Agent z adresem URL albo „github.com”,
// a przyjmuje „JustJournal/1.4.0 Paneksu/local-trading-journal”); contact (opcjonalnie, z konfiguracji użytkownika) dopisany na końcu. Bez kontaktu nie wstawiamy żadnego adresu e-mail.
export function buildUserAgent({ version, repo, contact } = {}) {
  const c = String(contact ?? '').trim().slice(0, 100);
  return `JustJournal/${version || 'dev'} ${repo || 'Paneksu/local-trading-journal'}${c ? ` ${c}` : ''}`;
}

// ---------- SEC EDGAR ----------
// company_tickers.json: { "0": { cik_str, ticker, title }, … } → Map ticker kanoniczny (BRK-B → BRK.B) → CIK (10 cyfr).
export function parseTickerMap(json) {
  const map = new Map();
  if (!json || typeof json !== 'object') throw new NewsError(tr('SEC: nieczytelna lista tickerów.'), 502, 'bad-reply');
  for (const r of Object.values(json)) {
    if (!r || typeof r.ticker !== 'string' || !/^\d{1,10}$/.test(String(r.cik_str))) continue;
    const sym = normSymbol(r.ticker);
    if (!map.has(sym)) map.set(sym, String(r.cik_str).padStart(10, '0'));
  }
  if (!map.size) throw new NewsError(tr('SEC: lista tickerów jest pusta.'), 502, 'bad-reply');
  return map;
}
// Blok „filings.recent” albo plik dodatkowy (te same tablice równoległe) → [{ t (przyjęcie, unix UTC), acc }] dla 8-K z Item 2.02 od HISTORY_FROM.
// Item dopasowujemy dokładnie (lista po przecinku): „2.02” tak, „12.02” nie. Formularz dokładnie „8-K” (poprawki 8-K/A pomijamy).
export function parseFilings(block) {
  const out = [];
  const acc = block?.accessionNumber, at = block?.acceptanceDateTime, form = block?.form, items = block?.items;
  if (![acc, at, form, items].every(Array.isArray)) return out;
  for (let i = 0; i < acc.length; i++) {
    if (form[i] !== '8-K' || !String(items[i] ?? '').split(',').map((x) => x.trim()).includes('2.02')) continue;
    const ms = Date.parse(at[i]);
    if (!Number.isFinite(ms) || ms / 1000 < from) continue;
    out.push({ t: Math.floor(ms / 1000), acc: String(acc[i]) });
  }
  return out;
}
// Jedno ogłoszenie na dobę ET (kilka 8-K 2.02 tego samego dnia: zostaje najwcześniejsze przyjęcie).
export function dedupeByDay(rows) {
  const byDay = new Map();
  for (const r of [...rows].sort((a, b) => a.t - b.t)) { const d = classifyAcceptance(r.t).day; if (!byDay.has(d)) byDay.set(d, r); }
  return [...byDay.values()];
}

// Item 2.02 w 8-K to nie tylko wyniki kwartalne (raporty dostaw Tesli, zapowiedzi i wstępne wyniki przed właściwym raportem). W parze ogłoszeń bliższych niż
// minGapDays zostaje późniejsze (właściwy raport zwykle przychodzi po zapowiedzi), więc ogłoszenie przeżywa tylko wtedy, gdy następne jest co najmniej minGapDays później.
export function dropCloseAnnouncements(rows, minGapDays = 40) {
  const s = [...rows].sort((a, b) => a.t - b.t);
  return s.filter((r, i) => i === s.length - 1 || s[i + 1].t - r.t >= minGapDays * 86400);
}

// Ogranicznik tempa: odstęp między zapytaniami co najmniej 1/rps s. now i sleep wstrzykiwane (testy).
export function createPacer({ rps = 8, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const gap = 1000 / rps;
  let next = 0;
  return async function pace() {
    const t = now();
    const wait = Math.max(0, next - t);
    next = Math.max(t, next) + gap;
    if (wait) await sleep(wait);
  };
}

// Klient EDGAR dla generatora. rps ≤ 10 (SEC); domyślnie 8.
export function createEdgar({ userAgent, fetchImpl = globalThis.fetch, dataBase = process.env.EDGAR_DATA_BASE || EDGAR_DATA_BASE, wwwBase = process.env.EDGAR_WWW_BASE || EDGAR_WWW_BASE, rps = 8, pacer, timeoutMs = 30_000 } = {}) {
  if (!userAgent) throw new Error('earnings: SEC wymaga nagłówka User-Agent (buildUserAgent)');
  if (!(rps > 0 && rps <= 10)) throw new Error(`earnings: limit SEC to 10 zapytań na sekundę, podano ${rps}`);
  const pace = pacer || createPacer({ rps });
  const base = (u, host) => { if (!checkHost(u, [host])) throw new NewsError(tr('SEC: adres musi być {host} (ustawiono: {base}).', { host, base: String(u).slice(0, 60) }), 500, 'bad-base'); return String(u).replace(/\/$/, ''); };
  async function getJson(url, label) {
    await pace();
    const res = await httpGet(url, { fetchImpl, headers: { 'User-Agent': userAgent, Accept: 'application/json' }, timeoutMs, scrub: String, label });
    const j = await readJsonCapped(res, MAX_BYTES.sec, 'SEC');
    if (j === null) throw new NewsError(tr('SEC: nieczytelna odpowiedź JSON.'), 502, 'bad-reply');
    return j;
  }
  return {
    async tickerMap() { return parseTickerMap(await getJson(`${base(wwwBase, 'www.sec.gov')}/files/company_tickers.json`, 'SEC')); },
    // Wszystkie ogłoszenia wyników spółki od HISTORY_FROM: blok recent + pliki dodatkowe z listy filings.files.
    async earnings(cik) {
      if (!/^\d{10}$/.test(String(cik))) throw new NewsError(tr('Zły CIK: {cik}.', { cik: String(cik).slice(0, 14) }), 400, 'bad-cik');
      const root = base(dataBase, 'data.sec.gov');
      const main = await getJson(`${root}/submissions/CIK${cik}.json`, 'SEC');
      const rows = parseFilings(main?.filings?.recent);
      for (const f of Array.isArray(main?.filings?.files) ? main.filings.files : []) {
        if (typeof f?.name !== 'string' || !/^CIK\d{10}-submissions-\d{3}\.json$/.test(f.name)) continue;
        if (typeof f.filingTo === 'string' && DATE_RE.test(f.filingTo) && Date.parse(f.filingTo + 'T23:59:59Z') / 1000 < from) continue; // plik tylko ze starszymi wpisami
        rows.push(...parseFilings(await getJson(`${root}/submissions/${f.name}`, 'SEC')));
      }
      return dropCloseAnnouncements(dedupeByDay(rows));
    },
  };
}

// ---------- Finnhub ----------
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
// Odpowiedź calendar/earnings → [{ symbol, date, hour, quarter, year, epsEstimate, revenueEstimate }] (wiersze bez tickera albo ze złą datą pomijane).
export function parseCalendar(json) {
  if (!Array.isArray(json?.earningsCalendar)) throw new NewsError(tr('Finnhub: nieczytelna odpowiedź kalendarza.'), 502, 'bad-reply');
  const out = [];
  for (const r of json.earningsCalendar) {
    if (typeof r?.symbol !== 'string' || !r.symbol.trim() || !DATE_RE.test(r?.date)) continue;
    out.push({ symbol: normSymbol(r.symbol), date: r.date, hour: String(r.hour ?? ''), quarter: Number.isInteger(r.quarter) ? r.quarter : undefined, year: Number.isInteger(r.year) ? r.year : undefined, epsEstimate: num(r.epsEstimate), revenueEstimate: num(r.revenueEstimate) });
  }
  return out;
}
export function createFinnhub({ key, base = process.env.FINNHUB_API_BASE || FINNHUB_BASE, fetchImpl = globalThis.fetch, timeoutMs = 30_000 } = {}) {
  const baseUrl = String(base).replace(/\/$/, '');
  const scrub = (s) => (key ? String(s).split(key).join('***') : String(s));
  async function get(pathAndQuery) {
    if (!key) throw new NewsError(tr('Brak klucza Finnhub. Wpisz go w Ustawieniach → Wykresy → Earningsy.'), 409, 'no-key');
    if (!checkHost(baseUrl, ['finnhub.io'])) throw new NewsError(tr('Finnhub: adres usługi musi być finnhub.io (ustawiono: {base}).', { base: scrub(baseUrl).slice(0, 60) }), 500, 'bad-base');
    const res = await httpGet(baseUrl + pathAndQuery, { fetchImpl, headers: { Accept: 'application/json', 'X-Finnhub-Token': key }, timeoutMs, scrub, label: 'Finnhub' });
    const j = await readJsonCapped(res, MAX_BYTES.finnhub, 'Finnhub');
    if (j === null) throw new NewsError(tr('Finnhub: nieczytelna odpowiedź JSON.'), 502, 'bad-reply');
    return j;
  }
  return {
    hasKey: !!key,
    async calendar(fromDate, toDate) {
      if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate) || toDate < fromDate) throw new NewsError(tr('Zły zakres dat kalendarza: {a}..{b}.', { a: String(fromDate).slice(0, 10), b: String(toDate).slice(0, 10) }), 400, 'bad-range');
      return parseCalendar(await get(`/api/v1/calendar/earnings?${new URLSearchParams({ from: fromDate, to: toDate })}`));
    },
    // Kapitalizacja w mln USD (stock/profile2) albo null, gdy Finnhub nie zna spółki.
    async marketCap(symbol) {
      const sym = normSymbol(symbol);
      if (!/^[A-Z0-9.]{1,10}$/.test(sym)) throw new NewsError(tr('Zły ticker: {sym}.', { sym: String(symbol).slice(0, 12) }), 400, 'bad-symbol');
      const j = await get(`/api/v1/stock/profile2?${new URLSearchParams({ symbol: sym })}`);
      return num(j?.marketCapitalization) ?? null;
    },
  };
}
void parseRetryAfter;
