// Newsy makro USD (pakiet A): usługa. Magazyn w chart-data/news/ (poza gitem), plik dat FRED dostarczany z wydaniem (data/news/usd-oficjalne.json),
// scalanie źródeł, odświeżanie w tle (feed FF najwyżej raz na godzinę, FRED raz dziennie i tylko z kluczem, archiwa Fed raz dziennie) oraz odczyty dla API.
// Układ magazynu: <baza>/news/status.json, fred.json (daty z odświeżenia kluczem użytkownika), fed-chair.json (przemówienia i zeznania przewodniczącego z odświeżenia), ff/RRRR-Www.json (tygodnie z feedu; dane FF zostają lokalnie,
// nigdy w repozytorium ani w testach). Brak sieci, 429 i błędy źródeł niczego nie psują: odczyty idą z pamięci i plików. Nic nie startuje samo przy imporcie modułu (tick() woła serwer).
// English: news service: local store, merge of sources, background refresh with rate limits, read API.
import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { tr } from './i18n.mjs';
import { ROOT } from './env.mjs';
import { FRED_RIDS, FRED_ATTRIBUTION, HISTORY_FROM, HOLIDAY_PROFILES, DEFAULT_HOLIDAY_PROFILE } from './news-katalog.mjs';
import { FF_SAMPLE } from './news-wagi.mjs';
import { NewsError, IMPS, KINDS, makeEvent, mergeFeed, compareEvents, inRange, todayOf, parseSearch, searchEvents, checkTz, systemTz, MAX_RANGE_SEC, dateStr } from './news.mjs';
import { buildOfficial, createFred, createFeedClient, createFedArchiveClient, feedKind } from './news-sources.mjs';

export const SHIPPED_FILE = path.join(ROOT, 'data', 'news', 'usd-oficjalne.json');
export const SHIPPED_CHAIR_FILE = path.join(ROOT, 'data', 'news', 'fed-chair.json');
export const SHIPPED_SCHED_FILE = path.join(ROOT, 'data', 'news', 'usd-terminarze.json'); // pakiet B2: daty TIC i komunikaty Fed poza posiedzeniami
const HOUR = 3600_000, DAY = 24 * HOUR;
export const FEED_MIN_INTERVAL_MS = HOUR; // zasada FF: najwyżej 1 zapytanie na godzinę
const NETWORK_RETRY_MS = 10 * 60_000; // tylko błędy sprzed wysłania żądania (brak połączenia, nieznana nazwa; patrz preSend w news-sources): FF zapytania nie zobaczył, więc ponawiamy szybciej
const FRED_RETRY_MS = 6 * HOUR;
const MAX_SPEECHES = 3000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } // brak albo uszkodzony plik: zaczynamy od pustego, następny zapis go nadpisze
}
function writeJson(file, obj) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj), 'utf8');
  renameSync(tmp, file); // zapis atomowy
}
const cleanDates = (arr) => (Array.isArray(arr) ? [...new Set(arr.filter((d) => typeof d === 'string' && ISO.test(d)))].sort() : []);
const safeMsg = (e) => String(e?.message ?? e).slice(0, 220);

export function createNews({
  baseDir, shippedFile = SHIPPED_FILE, shippedChairFile = SHIPPED_CHAIR_FILE, shippedSchedFile = SHIPPED_SCHED_FILE, getKey = () => undefined, getProfile = () => DEFAULT_HOLIDAY_PROFILE, fetchImpl = globalThis.fetch, now = Date.now,
  userAgent = 'JustJournal', fredBase, feedUrl, fedBase, fredPauseMs = 700, log = (m) => console.error(m),
} = {}) {
  if (!baseDir) throw new Error('news: brak katalogu bazowego');
  const dir = path.join(baseDir, 'news');
  const F = { status: path.join(dir, 'status.json'), fred: path.join(dir, 'fred.json'), speeches: path.join(dir, 'fed-chair.json'), ff: path.join(dir, 'ff') };

  const status = readJson(F.status, {});
  for (const k of ['feed', 'fred', 'speeches']) if (!status[k] || typeof status[k] !== 'object') status[k] = {};
  const saveStatus = () => { try { writeJson(F.status, status); } catch (e) { log(`[news] zapis statusu: ${safeMsg(e)}`); } };

  // ---- pamięć podręczna ----
  let cache = null; // { profile, official, merged }
  let weeksCache = null;
  let shipped = null;
  let runtimeFred = null;
  let speechesStore = null;
  const invalidate = () => { cache = null; };

  function loadShipped() {
    if (shipped) return shipped;
    const j = readJson(shippedFile, null);
    const releases = {};
    if (j && typeof j.releases === 'object' && j.releases) for (const rid of FRED_RIDS) releases[rid] = cleanDates(j.releases[rid]?.dates);
    const ok = !!j && Object.values(releases).some((d) => d.length);
    shipped = { ok, generated: ok && ISO.test(j.generated) ? j.generated : null, releases };
    return shipped;
  }
  function loadRuntimeFred() {
    if (runtimeFred) return runtimeFred;
    const j = readJson(F.fred, {});
    runtimeFred = { fetchedAt: Number.isFinite(j.fetchedAt) ? j.fetchedAt : 0, releases: Object.fromEntries(FRED_RIDS.filter((r) => Array.isArray(j.releases?.[r])).map((r) => [r, cleanDates(j.releases[r])])) };
    return runtimeFred;
  }
  // Daty FRED na wydanie: odświeżenie kluczem użytkownika zastępuje plik z wydania (pełna lista, w tym zmienione terminy ogłoszonej przyszłości).
  function fredDates() {
    const s = loadShipped().releases, r = loadRuntimeFred().releases;
    return Object.fromEntries(FRED_RIDS.map((rid) => [rid, r[rid]?.length ? r[rid] : s[rid] || []]));
  }
  // Przemówienia i zeznania przewodniczącego: plik z wydania (historia od 2010) + zapisane odświeżenia; ten sam link = nowsza wersja z odświeżenia.
  const validSpeech = (x) => x && typeof x.title === 'string' && typeof x.link === 'string' && Number.isInteger(x.t) && typeof x.who === 'string' && typeof x.timed === 'boolean';
  function loadSpeeches() {
    if (!speechesStore) {
      const shippedItems = readJson(shippedChairFile, {}).items;
      const byLink = new Map();
      for (const x of [...(Array.isArray(shippedItems) ? shippedItems : []), ...(Array.isArray(readJson(F.speeches, {}).items) ? readJson(F.speeches, {}).items : [])]) if (validSpeech(x)) byLink.set(x.link, x);
      speechesStore = [...byLink.values()].sort((a, b) => a.t - b.t);
    }
    return speechesStore;
  }
  const loadSavedSpeeches = () => (Array.isArray(readJson(F.speeches, {}).items) ? readJson(F.speeches, {}).items.filter(validSpeech) : []);
  let schedStore = null;
  function loadSchedules() {
    if (!schedStore) { const j = readJson(shippedSchedFile, {}); schedStore = { tic: cleanDates(j.tic), fed: Array.isArray(j.fed) ? j.fed.filter((x) => x && Number.isInteger(x.t)) : [] }; }
    return schedStore;
  }
  function loadWeeks() {
    if (weeksCache) return weeksCache;
    weeksCache = [];
    if (existsSync(F.ff)) {
      for (const f of readdirSync(F.ff).filter((n) => /^\d{4}-W\d{2}\.json$/.test(n)).sort()) {
        const j = readJson(path.join(F.ff, f), null);
        if (!j || !Number.isInteger(j.start) || !Number.isInteger(j.end) || !Array.isArray(j.events)) continue;
        const events = [];
        for (const e of j.events) {
          try { if (e.src === 'ff' && IMPS.includes(e.imp) && KINDS.includes(e.kind)) events.push(makeEvent(e.kind === 'data' ? { ...e, kind: feedKind(e.name) } : e)); } catch { /* pozycja uszkodzona: pomijamy */ }
        }
        weeksCache.push({ label: f.slice(0, -5), start: j.start, end: j.end, fetchedAt: j.fetchedAt || 0, events });
      }
    }
    return weeksCache;
  }
  const profileName = () => { const p = getProfile(); return p in HOLIDAY_PROFILES && p !== 'nyse' ? p : DEFAULT_HOLIDAY_PROFILE; };
  function build() {
    const profile = profileName();
    if (cache && cache.profile === profile) return cache;
    const official = buildOfficial({ fredDates: fredDates(), speeches: loadSpeeches(), schedules: loadSchedules(), profile, toYear: new Date(now()).getUTCFullYear() + 1 }).sort(compareEvents);
    cache = { profile, official, merged: mergeFeed(official, loadWeeks()) };
    return cache;
  }

  // ---- odświeżanie ----
  const feed = createFeedClient({ url: feedUrl, fetchImpl, userAgent });
  const speechesClient = createFedArchiveClient({ base: fedBase, fetchImpl, userAgent });
  const inflight = {};
  const once = (key, fn) => (inflight[key] ||= fn().finally(() => { delete inflight[key]; }));
  const hasKey = () => !!getKey();

  // Feed FF: najwyżej raz na godzinę (nextAllowedAt przeżywa restart). 429: czekamy dłużej z Retry-After i godziny. Sieć: ponowienie za 10 min (żądanie nie dotarło do FF).
  function refreshFeed() {
    return once('feed', async () => {
      const st = status.feed, n = now();
      if (st.nextAllowedAt && n < st.nextAllowedAt) return { skipped: true, nextAllowedAt: st.nextAllowedAt };
      st.lastAttemptAt = n;
      try {
        const w = await feed.fetchWeek();
        mkdirSync(F.ff, { recursive: true });
        writeJson(path.join(F.ff, `${w.week.label}.json`), { week: w.week.label, start: w.week.start, end: w.week.end, fetchedAt: n, events: w.events });
        weeksCache = null; invalidate();
        Object.assign(st, { lastOkAt: n, lastError: null, nextAllowedAt: n + FEED_MIN_INTERVAL_MS, week: w.week.label, count: w.events.length, skipped: w.skipped });
        saveStatus();
        return { ok: true, week: w.week.label, count: w.events.length };
      } catch (e) {
        const wait = e.code === 'rate-limit' ? Math.max(FEED_MIN_INTERVAL_MS, (e.retryAfterSec || 0) * 1000) : e.preSend ? NETWORK_RETRY_MS : FEED_MIN_INTERVAL_MS; // timeout, przekierowanie i zerwane połączenie to pełna godzina
        st.nextAllowedAt = n + wait;
        st.lastError = { code: e.code || 'error', at: n, message: safeMsg(e) };
        saveStatus();
        throw e;
      }
    });
  }

  // FRED: daty publikacji wszystkich wydań z katalogu (jedno zapytanie na wydanie, z przerwą). Zapisujemy tylko kompletną i wiarygodną listę wydania.
  function refreshFred() {
    return once('fred', async () => {
      const st = status.fred, n = now();
      const key = getKey();
      if (!key) throw new NewsError(tr('Brak klucza FRED. Wpisz go w Ustawieniach → Wykresy → Newsy.'), 409, 'no-key');
      const client = createFred({ key, base: fredBase, fetchImpl });
      st.lastAttemptAt = n;
      const cur = loadRuntimeFred();
      const next = { fetchedAt: n, releases: { ...cur.releases } };
      let failed = null, got = 0;
      for (const rid of FRED_RIDS) {
        try {
          const dates = await client.releaseDates(rid);
          const known = fredDates()[rid] || [];
          const pastKnown = known.filter((d) => d <= dateStr(Math.floor(n / 86400000))).length;
          if (!dates.length || dates.filter((d) => d <= dateStr(Math.floor(n / 86400000))).length < pastKnown * 0.8) {
            throw new NewsError(tr('FRED: wydanie {rid} zwróciło podejrzanie mało dat ({got} przy {had} znanych). Zachowano poprzednią listę.', { rid, got: dates.length, had: known.length }), 502, 'suspicious');
          }
          next.releases[rid] = dates; got++;
        } catch (e) { failed = e; if (['bad-key', 'rate-limit', 'no-key', 'bad-base'].includes(e.code)) break; }
        if (fredPauseMs) await new Promise((r) => setTimeout(r, fredPauseMs));
      }
      if (got) { writeJson(F.fred, next); runtimeFred = next; invalidate(); }
      if (failed) {
        st.lastError = { code: failed.code || 'error', at: n, message: safeMsg(failed) };
        saveStatus();
        throw failed;
      }
      Object.assign(st, { lastOkAt: n, lastError: null, releases: got });
      saveStatus();
      return { ok: true, releases: got };
    });
  }

  // Archiwa Fed (przemówienia i zeznania, JSON): pozycje przewodniczącego od 2010; zapisane pozycje scalamy z nowymi po linku (nowsza wersja wygrywa).
  function refreshSpeeches() {
    return once('speeches', async () => {
      const st = status.speeches, n = now();
      st.lastAttemptAt = n;
      try {
        const { items } = await speechesClient.fetchItems();
        if (!items.length) throw new NewsError(tr('Archiwum Fed: brak pozycji przewodniczącego w odpowiedzi.'), 502, 'bad-archive');
        const byLink = new Map(loadSavedSpeeches().map((x) => [x.link, x]));
        for (const it of items) byLink.set(it.link, it);
        writeJson(F.speeches, { items: [...byLink.values()].sort((a, b) => b.t - a.t).slice(0, MAX_SPEECHES) });
        speechesStore = null; invalidate();
        Object.assign(st, { lastOkAt: n, lastError: null, count: loadSpeeches().length });
        saveStatus();
        return { ok: true, count: loadSpeeches().length };
      } catch (e) {
        st.lastError = { code: e.code || 'error', at: n, message: safeMsg(e) };
        saveStatus();
        throw e;
      }
    });
  }

  // Jeden przebieg harmonogramu: wywołuje serwer (timer co kilka minut) albo test. Każde źródło osobno, błąd jednego nie blokuje pozostałych.
  let ticking = false;
  async function tick() {
    if (ticking) return { busy: true };
    ticking = true;
    const done = {};
    try {
      const n = now();
      // raz na dobę po udanym przebiegu; po porażce ponowienie najwcześniej po 6 godzinach
      const daily = (st) => (!st.lastOkAt || n - st.lastOkAt >= DAY) && (!st.lastAttemptAt || st.lastAttemptAt <= (st.lastOkAt || 0) || n - st.lastAttemptAt >= FRED_RETRY_MS);
      const jobs = [
        ['feed', !status.feed.nextAllowedAt || n >= status.feed.nextAllowedAt, refreshFeed],
        ['fred', hasKey() && daily(status.fred), refreshFred],
        ['speeches', daily(status.speeches), refreshSpeeches],
      ];
      for (const [name, due, fn] of jobs) {
        if (!due) continue;
        try { done[name] = await fn(); } catch (e) { done[name] = { error: e.code || 'error' }; log(`[news] ${name}: ${e.code || 'error'}: ${safeMsg(e)}`); }
      }
    } finally { ticking = false; }
    return done;
  }

  // ---- odczyty ----
  function range(from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from) throw new NewsError(tr('Zły zakres czasu: od {from}, do {to} (sekundy epoki, „do” musi być po „od”).', { from: String(from), to: String(to) }), 400, 'bad-range');
    if (to - from > MAX_RANGE_SEC) throw new NewsError(tr('Zakres newsów jest za duży (najwyżej 400 dni).'), 400, 'range-too-big');
    return { from, to, events: inRange(build().merged, from, to) };
  }
  // Wyszukiwanie w całej historii (od 2010 do ogłoszonej przyszłości): fraza w nazwie, opcjonalnie rodzaje i wagi; od najnowszych, z limitem
  function search(params) {
    return searchEvents(build().merged, parseSearch(params, tr));
  }
  function today({ tz, nowSec = Math.floor(now() / 1000) } = {}) {
    const zone = tz ?? systemTz();
    if (!checkTz(zone)) throw new NewsError(tr('Nieznana strefa czasowa: {tz}.', { tz: String(zone).slice(0, 40) }), 400, 'bad-tz');
    return todayOf(build().merged, nowSec, zone);
  }
  function statusInfo() {
    const { official, merged } = build();
    const count = (list, f) => list.reduce((a, e) => { a[e[f]] = (a[e[f]] || 0) + 1; return a; }, {});
    const sh = loadShipped(), rt = loadRuntimeFred();
    return {
      hasKey: hasKey(),
      holidayProfile: profileName(),
      feed: { ...pub(status.feed), weeksStored: loadWeeks().length },
      fred: { ...pub(status.fred), source: Object.values(rt.releases).some((d) => d.length) ? 'key' : (sh.ok ? 'shipped' : 'none'), shippedGenerated: sh.generated, shippedOk: sh.ok },
      speeches: pub(status.speeches),
      history: { from: HISTORY_FROM, verified: { ...FF_SAMPLE }, officialEvents: official.length, mergedEvents: merged.length, byImp: count(official, 'imp'), byKind: count(official, 'kind') },
      attribution: FRED_ATTRIBUTION,
    };
  }
  const pub = ({ lastOkAt, lastAttemptAt, nextAllowedAt, lastError, week, count, releases } = {}) => ({ lastOkAt: lastOkAt ?? null, lastAttemptAt: lastAttemptAt ?? null, nextAllowedAt: nextAllowedAt ?? null, lastError: lastError ?? null, ...(week ? { week } : {}), ...(count !== undefined ? { count } : {}), ...(releases !== undefined ? { releases } : {}) });

  return { range, search, today, status: statusInfo, tick, refreshFeed, refreshFred, refreshSpeeches, hasKey, official: () => build().official, merged: () => build().merged };
}
