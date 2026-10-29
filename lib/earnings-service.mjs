// Earningsy spółek (pakiet A2): usługa. Historia z pliku dołączonego do wydania (data/earnings/: lista S&P 100 z CIK i kapitalizacją, ogłoszenia z EDGAR 8-K Item 2.02),
// przyszłe terminy i kapitalizacja z Finnhub (tylko z kluczem użytkownika), magazyn lokalny w chart-data/earnings/ (poza gitem), klasy 1-4, odczyty dla API.
// Układ magazynu: <baza>/earnings/status.json, finnhub.json (zebrane terminy; rosną z czasem, więc ogłoszenia po dacie pliku z wydania zostają), caps.json (kapitalizacje).
// Aplikacja NIE łączy się z SEC: tylko finnhub.io, i tylko gdy jest klucz. Brak klucza albo sieci niczego nie psuje. Nic nie startuje samo przy imporcie modułu (tick() woła serwer).
// English: earnings service: shipped history, Finnhub refresh with key, local store, classes, read API.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { tr } from './i18n.mjs';
import { ROOT } from './env.mjs';
import { SP100, HISTORY_FROM } from './earnings-katalog.mjs';
import { NewsError, MAX_RANGE_SEC, inRange, mergeEarnings, buildClassMap, todayOf, normSymbol, parseSearch, searchEarnings } from './earnings.mjs';
import { checkTz, systemTz } from './news.mjs';
import { createFinnhub } from './earnings-sources.mjs';

export const SHIPPED_DIR = path.join(ROOT, 'data', 'earnings');
const HOUR = 3600_000, DAY = 24 * HOUR;
export const CALENDAR_EVERY_MS = 4 * HOUR; // kalendarz Finnhub: raz na kilka godzin
export const CAPS_EVERY_MS = 90 * DAY; // kapitalizacja: raz na kwartał
const RETRY_MS = 6 * HOUR, NETWORK_RETRY_MS = 15 * 60_000;
const BACK_DAYS = 10, AHEAD_DAYS = 135; // okno kalendarza: ostatnie dni (żeby złapać świeże ogłoszenia) i ~4,5 miesiąca naprzód
const CHUNK_DAYS = 7, TRUNCATED = 1500; // Finnhub zwraca najwyżej 1500 wierszy na zapytanie (dłuższy zakres ucina początek): okno dzielimy na tygodnie, a przepełnione na pół
const MAX_ROWS = 20_000;

const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };
function writeJson(file, obj) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(obj), 'utf8');
  renameSync(`${file}.tmp`, file);
}
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const safeMsg = (e) => String(e?.message ?? e).slice(0, 220);

export function createEarnings({
  baseDir, shippedDir = SHIPPED_DIR, getKey = () => undefined, getConfig = () => ({}), fetchImpl = globalThis.fetch, now = Date.now, finnhubBase, capsPauseMs = 1100, log = (m) => console.error(m),
} = {}) {
  if (!baseDir) throw new Error('earnings: brak katalogu bazowego');
  const dir = path.join(baseDir, 'earnings');
  const F = { status: path.join(dir, 'status.json'), finnhub: path.join(dir, 'finnhub.json'), caps: path.join(dir, 'caps.json') };
  const status = readJson(F.status, {});
  for (const k of ['calendar', 'caps']) if (!status[k] || typeof status[k] !== 'object') status[k] = {};
  const saveStatus = () => { try { writeJson(F.status, status); } catch (e) { log(`[earnings] zapis statusu: ${safeMsg(e)}`); } };

  // ---- dane z wydania ----
  let shipped = null;
  function loadShipped() {
    if (shipped) return shipped;
    const co = readJson(path.join(shippedDir, 'sp100.json'), null);
    const ed = readJson(path.join(shippedDir, 'edgar-8k.json'), null);
    const companies = (Array.isArray(co?.companies) ? co.companies : []).filter((c) => c && typeof c.symbol === 'string').map((c) => ({ symbol: normSymbol(c.symbol), name: String(c.name || c.symbol), cap: Number.isFinite(c.cap) ? c.cap : undefined }));
    const rows = [];
    if (ed && typeof ed.rows === 'object' && ed.rows) for (const [sym, list] of Object.entries(ed.rows)) if (Array.isArray(list)) for (const t of list) if (Number.isInteger(t)) rows.push({ symbol: normSymbol(sym), t });
    shipped = { verified: co?.verified && typeof co.verified === 'object' ? co.verified : null, companies: companies.length ? companies : SP100.map(([symbol, name]) => ({ symbol, name })), fromCatalog: !companies.length, rows, generated: typeof ed?.generated === 'string' ? ed.generated : null, edgarOk: rows.length > 0 };
    return shipped;
  }
  let saved = null, caps = null, cache = null;
  const loadSaved = () => (saved ||= (Array.isArray(readJson(F.finnhub, {}).rows) ? readJson(F.finnhub, {}).rows : []).filter((r) => r && typeof r.symbol === 'string' && typeof r.date === 'string'));
  const loadCaps = () => (caps ||= (() => { const j = readJson(F.caps, {}); return { fetchedAt: Number.isFinite(j.fetchedAt) ? j.fetchedAt : 0, caps: j.caps && typeof j.caps === 'object' ? j.caps : {} }; })());
  const invalidate = () => { cache = null; };
  const cfg = () => { const c = getConfig() || {}; return { overrides: c.earningsClassOverrides && typeof c.earningsClassOverrides === 'object' ? c.earningsClassOverrides : {}, extra: Array.isArray(c.earningsExtra) ? c.earningsExtra.map(normSymbol).filter((s) => /^[A-Z0-9.]{1,10}$/.test(s)) : [] }; }
  const universe = () => [...new Set([...loadShipped().companies.map((c) => c.symbol), ...cfg().extra])];

  function build() {
    const { overrides, extra } = cfg();
    const sig = JSON.stringify([overrides, extra]);
    if (cache && cache.sig === sig) return cache;
    const sh = loadShipped();
    const allCaps = { ...Object.fromEntries(sh.companies.filter((c) => c.cap).map((c) => [c.symbol, c.cap])), ...loadCaps().caps };
    const classes = buildClassMap(sh.companies, { caps: allCaps, overrides, extra });
    const names = Object.fromEntries(sh.companies.map((c) => [c.symbol, c.name]));
    const events = mergeEarnings({ edgar: sh.rows, finnhub: loadSaved(), names, classes: classes.map });
    cache = { sig, events, classes };
    return cache;
  }

  // ---- odświeżanie ----
  const inflight = {};
  const once = (key, fn) => (inflight[key] ||= fn().finally(() => { delete inflight[key]; }));
  const hasKey = () => !!getKey();
  const client = () => createFinnhub({ key: getKey(), base: finnhubBase, fetchImpl });

  // Kalendarz w oknach po tygodniu; okno, które wróciło z limitem wierszy (ucięte), dzielimy na pół aż do pojedynczego dnia.
  async function fetchWindow(c, a, b) {
    const rows = await c.calendar(a, b);
    if (rows.length < TRUNCATED || a === b) return rows;
    const mid = isoDay((Date.parse(a + 'T00:00:00Z') + Date.parse(b + 'T00:00:00Z')) / 2);
    return [...(await fetchWindow(c, a, mid)), ...(await fetchWindow(c, isoDay(Date.parse(mid + 'T00:00:00Z') + DAY), b))];
  }
  function refreshCalendar() {
    return once('calendar', async () => {
      const st = status.calendar, n = now();
      if (!hasKey()) throw new NewsError(tr('Brak klucza Finnhub. Wpisz go w Ustawieniach → Wykresy → Earningsy.'), 409, 'no-key');
      st.lastAttemptAt = n;
      try {
        const c = client();
        const uni = new Set(universe());
        const got = [];
        const start = Date.parse(isoDay(n - BACK_DAYS * DAY) + 'T00:00:00Z'), end = Date.parse(isoDay(n + AHEAD_DAYS * DAY) + 'T00:00:00Z');
        for (let a = start; a <= end; a += CHUNK_DAYS * DAY) {
          for (const r of await fetchWindow(c, isoDay(a), isoDay(Math.min(a + (CHUNK_DAYS - 1) * DAY, end)))) if (uni.has(r.symbol)) got.push(r);
        }
        const byKey = new Map(loadSaved().map((r) => [`${r.symbol}|${r.date}`, r]));
        for (const r of got) byKey.set(`${r.symbol}|${r.date}`, r);
        // terminy w oknie, które Finnhub już nie zwraca (przesunięte), znikają; zapisane starsze niż okno zostają
        const winFrom = isoDay(start);
        const fresh = new Set(got.map((r) => `${r.symbol}|${r.date}`));
        for (const [k, r] of byKey) if (r.date >= winFrom && !fresh.has(k)) byKey.delete(k);
        const rows = [...byKey.values()].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.symbol < y.symbol ? -1 : 1)).slice(-MAX_ROWS);
        writeJson(F.finnhub, { rows });
        saved = rows; invalidate();
        Object.assign(st, { lastOkAt: n, lastError: null, nextAllowedAt: n + CALENDAR_EVERY_MS, count: rows.length, fetched: got.length });
        saveStatus();
        return { ok: true, count: rows.length, fetched: got.length };
      } catch (e) {
        const wait = e.code === 'rate-limit' ? Math.max(HOUR / 4, (e.retryAfterSec || 0) * 1000) : e.preSend ? NETWORK_RETRY_MS : RETRY_MS;
        st.nextAllowedAt = n + wait;
        st.lastError = { code: e.code || 'error', at: n, message: safeMsg(e) };
        saveStatus();
        throw e;
      }
    });
  }
  // Kapitalizacje spółek (stock/profile2, jedno zapytanie na spółkę, 60/min): raz na kwartał. Zapisujemy to, co się udało, dołączone do poprzednich.
  function refreshCaps() {
    return once('caps', async () => {
      const st = status.caps, n = now();
      if (!hasKey()) throw new NewsError(tr('Brak klucza Finnhub. Wpisz go w Ustawieniach → Wykresy → Earningsy.'), 409, 'no-key');
      st.lastAttemptAt = n;
      const c = client();
      const next = { fetchedAt: n, caps: { ...loadCaps().caps } };
      let failed = null, got = 0;
      for (const sym of universe()) {
        try {
          const v = await c.marketCap(sym);
          if (v !== null && v > 0) { next.caps[sym] = v; got++; }
        } catch (e) { failed = e; if (['bad-key', 'rate-limit', 'no-key', 'bad-base', 'network', 'timeout'].includes(e.code)) break; }
        if (capsPauseMs) await new Promise((r) => setTimeout(r, capsPauseMs));
      }
      if (got) { writeJson(F.caps, next); caps = next; invalidate(); }
      if (failed || !got) {
        const e = failed || new NewsError(tr('Finnhub nie zwrócił żadnej kapitalizacji.'), 502, 'bad-reply');
        st.lastError = { code: e.code || 'error', at: n, message: safeMsg(e) };
        saveStatus();
        throw e;
      }
      Object.assign(st, { lastOkAt: n, lastError: null, count: got });
      saveStatus();
      return { ok: true, count: got };
    });
  }

  let ticking = false;
  async function tick() {
    if (ticking) return { busy: true };
    ticking = true;
    const done = {};
    try {
      if (!hasKey()) return done; // bez klucza zero sieci
      const n = now();
      const jobs = [
        ['calendar', !status.calendar.nextAllowedAt || n >= status.calendar.nextAllowedAt, refreshCalendar],
        ['caps', (!status.caps.lastOkAt || n - status.caps.lastOkAt >= CAPS_EVERY_MS) && (!status.caps.lastAttemptAt || status.caps.lastAttemptAt <= (status.caps.lastOkAt || 0) || n - status.caps.lastAttemptAt >= RETRY_MS), refreshCaps],
      ];
      for (const [name, due, fn] of jobs) {
        if (!due) continue;
        try { done[name] = await fn(); } catch (e) { done[name] = { error: e.code || 'error' }; log(`[earnings] ${name}: ${e.code || 'error'}: ${safeMsg(e)}`); }
      }
    } finally { ticking = false; }
    return done;
  }

  // ---- odczyty ----
  function range(from, to, { maxClass = 4 } = {}) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from) throw new NewsError(tr('Zły zakres czasu: od {from}, do {to} (sekundy epoki, „do” musi być po „od”).', { from: String(from), to: String(to) }), 400, 'bad-range');
    if (to - from > MAX_RANGE_SEC) throw new NewsError(tr('Zakres newsów jest za duży (najwyżej 400 dni).'), 400, 'range-too-big');
    if (![1, 2, 3, 4].includes(maxClass)) throw new NewsError(tr('Zła klasa: {cls} (dozwolone 1-4).', { cls: String(maxClass).slice(0, 10) }), 400, 'bad-class');
    return { from, to, events: inRange(build().events, from, to).filter((e) => e.cls <= maxClass) };
  }
  // Wyszukiwanie wyników spółek (ticker albo fragment nazwy) w całej historii; classes: lista klas 1-4 rozdzielona przecinkami
  function search({ q, classes, limit, before, from, year } = {}) {
    const p = parseSearch({ q, limit, before, from, year }, tr);
    let cls = null;
    if (classes != null && classes !== '') {
      cls = String(classes).split(',').map((x) => Number(x));
      if (cls.some((x) => ![1, 2, 3, 4].includes(x))) throw new NewsError(tr('Zła klasa: {cls} (dozwolone 1-4).', { cls: String(classes).slice(0, 10) }), 400, 'bad-class');
    }
    return searchEarnings(build().events, { q: p.q, classes: cls, limit: p.limit, before: p.before, from: p.from, year: p.year });
  }
  function today({ tz, nowSec = Math.floor(now() / 1000) } = {}) {
    const zone = tz ?? systemTz();
    if (!checkTz(zone)) throw new NewsError(tr('Nieznana strefa czasowa: {tz}.', { tz: String(zone).slice(0, 40) }), 400, 'bad-tz');
    return todayOf(build().events, nowSec, { tz: zone });
  }
  // Spółki z niepełną historią z EDGAR (pokazujemy je w statusie; luki uzupełnia dopiero Finnhub od instalacji, bo jego kalendarz nie ma przeszłości):
  // incomplete = mniej niż 8 ogłoszeń, mniej niż 75% kwartałów między pierwszym a ostatnim, albo ostatnie starsze niż rok; lateStart = pierwsze ogłoszenie po 2012 (młoda spółka albo zmiana CIK).
  function gaps(sh) {
    const by = new Map();
    for (const r of sh.rows) { if (!by.has(r.symbol)) by.set(r.symbol, []); by.get(r.symbol).push(r.t); }
    const incomplete = [], lateStart = [];
    const ref = sh.generated ? Date.parse(sh.generated + 'T00:00:00Z') / 1000 : now() / 1000;
    for (const c of sh.companies) {
      const l = (by.get(c.symbol) || []).sort((a, b) => a - b);
      const first = l[0], last = l.at(-1);
      const expected = l.length ? Math.max(1, Math.round((last - first) / (91.3 * 86400)) + 1) : 0;
      const reason = !l.length ? 'none' : l.length < 8 ? 'sparse' : l.length < 0.75 * expected ? 'gaps' : ref - last > 400 * 86400 ? 'stale' : null;
      const info = { symbol: c.symbol, count: l.length, first: first ? isoDay(first * 1000) : null, last: last ? isoDay(last * 1000) : null };
      if (reason) incomplete.push({ ...info, reason });
      else if (first && first >= Date.parse('2012-01-01T00:00:00Z') / 1000) lateStart.push(info);
    }
    return { incomplete, lateStart };
  }
  function statusInfo() {
    const { events, classes } = build();
    const sh = loadShipped();
    const byClass = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const e of events) byClass[e.cls]++;
    const pub = ({ lastOkAt, lastAttemptAt, nextAllowedAt, lastError, count, fetched } = {}) => ({ lastOkAt: lastOkAt ?? null, lastAttemptAt: lastAttemptAt ?? null, nextAllowedAt: nextAllowedAt ?? null, lastError: lastError ?? null, ...(count !== undefined ? { count } : {}), ...(fetched !== undefined ? { fetched } : {}) });
    return {
      hasKey: hasKey(),
      calendar: pub(status.calendar),
      caps: { ...pub(status.caps), source: loadCaps().fetchedAt ? 'key' : (sh.companies.some((c) => c.cap) ? 'shipped' : 'order') },
      history: { ...gaps(sh), verified: sh.verified, from: HISTORY_FROM, generated: sh.generated, edgarOk: sh.edgarOk, companies: sh.companies.length, symbols: classes.map.size, events: events.length, byClass, classes: classes.counts, universeFromCatalog: sh.fromCatalog },
    };
  }
  return { range, search, today, status: statusInfo, tick, refreshCalendar, refreshCaps, hasKey, events: () => build().events, classes: () => build().classes };
}
