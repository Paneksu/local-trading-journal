// Wynik po BE po stronie serwera (POST /api/after-be): serwer sam bierze poziomy i granicę sesji, liczy resolveAfterBe (public/js/po-be.js) i oddaje wyłącznie Result.
// [U] 04.11.2026 «jak zapisuje trade i journaluje jeszcze podczas jak nie poznalem przyszlych swiec w backtestingowej sesji to nnie powinny mi sie ujawniac wtedy»:
//  - Backtest: klient podaje tylko { key, typ } (albo noSession). Poziomy (entryPrice, sl0, tp, exitT, dir, instrument) i granica (book.hwi[instrument] ?? book.hw) pochodzą z pliku sesji;
//    wszystko inne od klienta jest ignorowane. Świece czytamy wyłącznie do min(granica, koniec dnia handlowego), a `covered` liczymy tylko do tej samej chwili, bo resolveAfterBe sprawdza
//    !covered przed pending: pokrycie liczone dalej zdradziłoby przyszłość statusem no-data zamiast pending.
//  - Live i Paper: granica to teraz (now), świece z candles.read z argumentami kontraktu jak w podglądzie trade'a (tfrom/tto, contract, bez adjust), warstwa 1m.
//  - Trade backtestu bez lokalnej sesji: no-session, nigdy nie liczony ze świec ([U] «Osobny status „bez sesji”»).
//  - Świece za końcem ciągłego pokrycia od minuty wyjścia nie liczą się, a w Live także świece z zapasu .v.0 innego kontraktu niż kontrakt trade'a: wynik to no-data i dobieranie.
//  - Live i Paper: oba poziomy w jednej minucie rozstrzygają prawdziwe 1s kontraktu z dysku (bez płatnych pobrań); przed końcem okna brak świec to pending (decyzje sesji głównej z 05.11.2026, zgodne z projektem).
//  - Pamięć podręczna (chart-data/after-be-cache.json, zapis atomowy) trzyma tylko wyniki końcowe (tp, sl, open, mfe) i nigdy nie oddaje wyniku, którego świeca rozstrzygająca
//    (at + 60 s) albo koniec okna leży za dzisiejszą granicą: wtedy liczymy od nowa na świecach do granicy.
// Z odpowiedzi nie wychodzą świece, ceny, poziomy ani powód: tylko { status, at, rIfHeld, mfeR, hitSl }.
// English: server-side "result after break-even": the server owns levels and the session boundary, reads candles only up to it, caches final results only.
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveAfterBe, resolveAfterBeDetail, isAfterBeLevels, AFTER_BE_VERSION, tradingDayEnd } from '../public/js/po-be.js';
import { FAMILY } from '../public/js/kontrakty.js';
import { SESSION_ID_RE, BacktestError } from './backtest-store.mjs';
import { continuousEnd, mergeRanges, subtractRanges } from './candles-store.mjs';

export const MAX_ITEMS = 500;
export const YIELD_MS = 10;
// Limit równoległych resolve (wzór: findInflight w lib/backtest-range.mjs). Klient pyta porcjami po kolei, więc limit dotyczy tylko kilku widoków albo pętli żądań.
export const MAX_RESOLVE_INFLIGHT = 4;
const TYPES = new Set(['Backtest', 'Live', 'Paper']);
const FINAL = new Set(['tp', 'sl', 'open', 'mfe']);
const CACHE_FILE = 'after-be-cache.json';
const CACHE_MAX = 20000;
const BT_KEY_RE = new RegExp('^(' + SESSION_ID_RE.source.slice(1, -1) + ')/([A-Za-z0-9_-]{1,40})$');
const LIVE_KEY_RE = /^[A-Za-z0-9_:.\/-]{1,100}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const CONTRACT_RE = /^[A-Za-z0-9]{0,12}$/;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const tt = (t, s) => (t ? t(s) : s);

const NO_SESSION = () => ({ status: 'no-session', at: null, rIfHeld: null, mfeR: null, hitSl: null });
// Result bez pól dodatkowych: nawet gdyby resolveAfterBe kiedyś coś dołożył, na zewnątrz idzie tylko to
const pick = (r) => ({ status: r.status, at: r.at ?? null, rIfHeld: r.rIfHeld ?? null, mfeR: r.mfeR ?? null, hitSl: r.hitSl ?? null });
const NO_DATA = () => pick({ status: 'no-data' });

// Granica sesji: najdalsza chwila pokazana dla instrumentu (znak wodny hwi), inaczej wspólny hw; bez znaku wodnego nic poza wyjściem. Liczba albo null.
function sessionLimit(book, instrument, exitT) {
  const b = book && typeof book === 'object' ? book : {};
  const hwi = b.hwi && typeof b.hwi === 'object' ? b.hwi[instrument] : undefined;
  const hw = isNum(hwi) ? hwi : isNum(b.hw) ? b.hw : exitT;
  return isNum(hw) ? Math.floor(hw) : null;
}

// GET /api/candles z polem btTrade (podgląd, edytor, miniatura i karta trade'a typu Backtest w dashboardzie).
// [U] 05.11.2026 «Ogranicz do granicy sesji (Recommended)»: trade z lokalną sesją dostaje świece tylko do granicy sesji, ustalanej tu, po stronie serwera. Trade bez sesji jak dotąd.
// Odczyt kończy się na pełnej minucie przed granicą: świeca zbiorcza powstaje tylko ze świec zakończonych do granicy, a minuta w budowie (także jej podział na sekundy) nie wychodzi.
// Pole sessionCap mówi klientowi, gdzie jest koniec: bez niego podgląd dociągałby kolejne puste doby aż do dzisiaj.
export function readTradeCandles({ candles, btStore, t = null, log = (...a) => console.error(...a) } = {}, q = {}) {
  const { btTrade, ...rest } = q;
  if (btTrade === undefined) return candles.read(rest);
  const m = BT_KEY_RE.exec(String(btTrade));
  if (!m) throw new BacktestError(tt(t, 'Nieprawidłowy klucz trade\'a backtestu.'), 400, 'bad-request');
  let doc = null;
  try { doc = btStore.read(m[1]) || null; } catch (e) { log('[po-be] sesja nieczytelna', m[1], e.message); }
  if (!doc) return candles.read(rest);
  const tr = Array.isArray(doc.trades) ? doc.trades.find((x) => x && x.id === m[2]) : null;
  const instrument = String(tr?.instrument ?? rest.instrument ?? '').trim().toUpperCase();
  const limit = sessionLimit(doc.book, instrument, isNum(tr?.exitT) ? Math.floor(tr.exitT) : null);
  const from = Number(rest.from), to = Number(rest.to);
  // parametry niepoprawne odrzuca zwykły odczyt
  if (!Number.isFinite(from) || !Number.isFinite(to)) return candles.read(rest);
  const cap = limit == null ? 0 : Math.floor(limit / 60) * 60;
  const capped = (r) => (r && !r.noSource ? { ...r, sessionCap: cap } : r);
  if (to <= cap) return capped(candles.read(rest));
  if (from < cap) return capped(candles.read({ ...rest, to: String(cap) }));
  // kadr w całości za granicą: ta sama postać odpowiedzi (kontrakt, walidacja) z krótkiego odczytu, bez świec i bez zakresów
  const r = candles.read({ ...rest, to: String(from + 60) });
  if (!r || r.noSource) return r;
  const { synth: _s, prevIn: _p, unavailable: _u, retryAfter: _a, ...shape } = r;
  return capped({ ...shape, bars: [], covered: [], derived: [], missing: [], holes: [], rolls: [], gaps: [] });
}

function writeAtomic(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  // PID w nazwie: dwa procesy na tym samym katalogu danych nie nadpisują sobie pliku tymczasowego
  const tmp = `${file}.${process.pid}.tmp`;
  try { writeFileSync(tmp, data); renameSync(tmp, file); } catch (e) {
    try { unlinkSync(tmp); } catch { /* nie było pliku tymczasowego */ }
    throw e;
  }
}

// createAfterBe({ btStore, replayRange, candles, baseDir, now, wantWindows }) → { resolve(items) → { results } }
// baseDir = katalog chart-data. now() w ms. wantWindows(listaBrakow) dostaje [{ key, instrument, contract, from, to, tfrom, tto }] dla Live i Paper bez świec (zadanie 5 dobiera je w tle); domyślnie nic nie robi.
// from i to to sekundy epoki, tfrom i tto to te same wejście i wyjście co w odczycie, żeby dobieranie wybrało warstwę kontraktu, z której odczyt potem czyta.
// Okno idzie dopiero po końcu dnia handlowego: wcześniej „do” to chwila pytania, więc każde pytanie dawałoby inne okno i osobne płatne żądanie o kilka minut.
// writesBlocked(): trwa kopia katalogu danych, więc pamięć podręczna czeka z zapisem (zostaje w pamięci procesu i zapisuje się przy następnym resolve).
export function createAfterBe({ btStore, replayRange, candles, baseDir, now = () => Date.now(), wantWindows = null, heldWindows = null, writesBlocked = null, t = null, log = (...a) => console.error(...a) } = {}) {
  const bad = (msg) => new BacktestError(tt(t, msg), 400, 'bad-request');
  const file = baseDir ? path.join(baseDir, CACHE_FILE) : null;
  let mem = null;
  const validEntry = (v) => v && typeof v === 'object' && FINAL.has(v.status) && (v.at === null || isNum(v.at)) && (v.rIfHeld === null || isNum(v.rIfHeld)) && (v.mfeR === null || isNum(v.mfeR)) && (v.hitSl === null || typeof v.hitSl === 'boolean');
  function cache() {
    if (mem) return mem;
    mem = new Map();
    if (!file || !existsSync(file)) return mem;
    try {
      const j = JSON.parse(readFileSync(file, 'utf8'));
      if (j && j.v === 1 && j.entries && typeof j.entries === 'object') for (const [k, v] of Object.entries(j.entries)) if (validEntry(v)) mem.set(k, pick(v));
    } catch (e) { log('[po-be] nieczytelna pamięć podręczna, zaczynam od zera', e.message); mem = new Map(); }
    return mem;
  }
  let dirty = false;
  function flush() {
    if (!dirty || !file) return;
    if (typeof writesBlocked === 'function' && writesBlocked()) return;
    dirty = false;
    try { writeAtomic(file, JSON.stringify({ v: 1, entries: Object.fromEntries(cache()) })); } catch (e) { log('[po-be] zapis pamięci podręcznej nie powiódł się', e.message); }
  }
  // Wynik z pamięci wolno oddać tylko wtedy, gdy koniec okna leży przed dzisiejszą granicą (inaczej mógłby zdradzić przyszłość). Warunek na `at` byłby zbędny: każda świeca
  // rozstrzygająca kończy się najpóźniej o `end` (17:00 ET, pełna minuta), więc end <= limit obejmuje i ją (po zmianie C1 resolveAfterBe i tak liczy tylko świece zakończone do limitu).
  const usable = (r, limit, end) => FINAL.has(r.status) && end <= limit;
  function remember(k, r, limit, end) {
    if (!usable(r, limit, end)) return;
    const m = cache();
    m.delete(k);
    m.set(k, r);
    while (m.size > CACHE_MAX) m.delete(m.keys().next().value);
    dirty = true;
  }

  // ---- walidacja wejścia ----
  function checkItem(it) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) throw bad('Nieprawidłowa pozycja wyniku po BE.');
    if (typeof it.key !== 'string' || typeof it.typ !== 'string' || !TYPES.has(it.typ)) throw bad('Nieprawidłowa pozycja wyniku po BE.');
    if (FORBIDDEN_KEYS.has(it.key)) throw bad('Nieprawidłowy klucz trade\'a.');
    if (it.typ === 'Backtest') {
      const m = BT_KEY_RE.exec(it.key);
      if (!m) throw bad('Nieprawidłowy klucz trade\'a backtestu.');
      return { kind: 'bt', key: it.key, sessionId: m[1], tradeId: m[2], noSession: it.noSession === true };
    }
    // klucz trade'a backtestu nie może przejść jako Live: poziomy od klienta i granica „teraz” ominęłyby granicę sesji
    if (!LIVE_KEY_RE.test(it.key) || BT_KEY_RE.test(it.key)) throw bad('Nieprawidłowy klucz trade\'a.');
    const instrument = typeof it.instrument === 'string' ? it.instrument.trim().toUpperCase() : '';
    if (!Object.hasOwn(FAMILY, instrument)) throw bad('Nieprawidłowy instrument (ES, NQ, MES albo MNQ).');
    if (typeof it.dir !== 'string' || !/^(long|short)$/i.test(it.dir)) throw bad('Nieprawidłowy kierunek trade\'a.');
    const contract = it.contract == null ? '' : it.contract;
    if (typeof contract !== 'string' || !CONTRACT_RE.test(contract.trim())) throw bad('Nieprawidłowy kontrakt.');
    // brak wejścia albo SL (null) to trade bez poziomów (no-levels), ale wartość, która jest, musi być liczbą
    for (const v of [it.entryPrice, it.sl, it.tp]) if (v != null && !isNum(v)) throw bad('Nieprawidłowe poziomy trade\'a.');
    if (it.exitAt != null && !isNum(it.exitAt)) throw bad('Nieprawidłowy czas wyjścia trade\'a.');
    if (it.at != null && !isNum(it.at)) throw bad('Nieprawidłowy czas wejścia trade');
    return {
      kind: 'live', key: it.key, instrument, contract: contract.trim().toUpperCase(), dir: it.dir.toLowerCase(),
      entry: it.entryPrice ?? NaN, sl: it.sl ?? NaN, tp: it.tp ?? null, exitT: isNum(it.exitAt) ? Math.floor(it.exitAt / 1000) : null,
      entryT: isNum(it.at) ? Math.floor(it.at / 1000) : null,
    };
  }

  const cacheKey = (key, p, layer) => [key, AFTER_BE_VERSION, p.instrument ?? '', p.dir ?? '', p.entry, p.sl, p.tp ?? '', p.exitT ?? '', layer].join('|');
  // wspólny tor: poziomy i granica są już ustalone przez serwer
  function solve(item, p, { limit, exitPrecise, layer, load, secsMayCome = false, secsOf = null, pendingFirst = false }) {
    if (!isAfterBeLevels(p)) return pick(resolveAfterBe(p));
    if (!isNum(p.exitT)) return NO_DATA();
    const end = tradingDayEnd(p.exitT);
    const ck = cacheKey(item.key, p, layer);
    const hit = cache().get(ck);
    if (hit && usable(hit, limit, end)) return { ...hit };
    // czytamy świece wyłącznie do min(granica, koniec okna); covered liczone tylko do tej chwili (blokada przyszłości)
    const stop = Math.min(limit, end), m0 = Math.floor(p.exitT / 60) * 60;
    let data;
    if (stop <= m0) data = { m1: [], s1: [], covered: true };
    else {
      try { data = load(m0, stop); } catch (e) {
        // błąd odczytu (zły kontrakt, uszkodzony plik): no-data, ale bez wołania wantWindows, bo pobieranie nie naprawi błędu i kosztowałoby
        log('[po-be] odczyt świec nie powiódł się', item.key, e && e.message);
        return NO_DATA();
      }
    }
    const want = stop === end ? { _want: { from: m0, to: stop } } : {};
    if (!data) return pendingFirst && limit < end ? pick({ status: 'pending' }) : Object.assign(NO_DATA(), want);
    // świeca zaczęta przed granicą, a niezakończona do niej, nie wchodzi do wyniku (resolveAfterBe; to samo robi pokrycie w readAfterBe i load)
    const d = resolveAfterBeDetail({ ...p, exitPrecise, end, limit, bars: data.m1 || [], secs: data.s1 || [], covered: data.covered === true, coveredTo: data.coveredTo, secsMayCome: !!secsMayCome, secsOf, pendingFirst });
    const r = pick(d.result);
    // wynik zależny od braku prawdziwych 1s (oba poziomy w jednej minucie bez sekund, wyjście bez sekund) nie trafia do pamięci: po dojściu sekund mógłby być inny
    if (!d.ambiguous) remember(ck, r, limit, end);
    if (r.status === 'no-data') return Object.assign(r, want);
    return r;
  }

  function resolveBacktest(item, docs) {
    if (item.noSession) return NO_SESSION();
    let doc = docs.get(item.sessionId);
    if (doc === undefined) {
      try { doc = btStore.read(item.sessionId) || null; } catch (e) { log('[po-be] sesja nieczytelna', item.sessionId, e.message); doc = null; }
      docs.set(item.sessionId, doc);
    }
    const tr = doc && Array.isArray(doc.trades) ? doc.trades.find((x) => x && x.id === item.tradeId) : null;
    if (!tr) return NO_SESSION();
    const instrument = typeof tr.instrument === 'string' ? tr.instrument.toUpperCase() : '';
    if (!Object.hasOwn(FAMILY, instrument)) return NO_DATA();
    const exitT = isNum(tr.exitT) ? Math.floor(tr.exitT) : null;
    const limit = sessionLimit(doc.book, instrument, exitT) ?? -Infinity;
    const p = { instrument, dir: String(tr.dir || '').toLowerCase(), entry: isNum(tr.entryPrice) ? tr.entryPrice : NaN, sl: isNum(tr.sl0) ? tr.sl0 : NaN, tp: isNum(tr.tp) ? tr.tp : null, exitT };
    // [U] 04.11.2026 «W tej świecy tylko SL»: wyjście Backtestu jest co do sekundy, więc świecą wyjścia jest sekunda wyjścia, jeśli są prawdziwe 1s
    return solve(item, p, { limit, exitPrecise: true, secsMayCome: FAMILY[instrument] === 'NQ', layer: FAMILY[instrument] === 'NQ' ? '1s+1m' : '1m', load: (from, to) => replayRange.readAfterBe(instrument, from, to) });
  }

  function resolveLive(item) {
    const limit = Math.floor(now() / 1000);
    const p = { instrument: item.instrument, dir: item.dir, entry: item.entry, sl: item.sl, tp: item.tp, exitT: item.exitT };
    // Jak tradeQuery w podglądzie (podglad.js): tfrom = wejście, tto = wyjście (gdy wyjście >= wejście, inaczej oba = wejście) i pole contract; kontrakt przy braku pola wybiera reguła
    // serwera wg czasu WEJŚCIA (dzień rolla: wejście przed rollem = stary kontrakt). Bez czasu wejścia (Item bez `at`) tfrom = wyjście. Back-adjust podgląd dokłada tylko przy przełączniku
    // (domyślnie wyłączony), więc tu go nie ma i ceny pasują do poziomów trade'a.
    const hasIn = isNum(item.entryT);
    const tfrom = hasIn ? item.entryT : item.exitT;
    const tto = hasIn && item.exitT < item.entryT ? item.entryT : item.exitT;
    const query = (from, to, tf) => ({ instrument: item.instrument, from: String(from), to: String(to), tf, tfrom: String(tfrom), tto: String(tto), ...(item.contract ? { contract: item.contract } : {}) });
    const load = (from, to) => {
      const r = candles.read(query(from, to, '1m'));
      if (!r || r.noSource || !Array.isArray(r.bars)) return null;
      // Odczyt podkłada .v.0 tam, gdzie warstwy kontraktu trade'a nie ma (zapas wykresu). To ceny innego kontraktu, więc nie są pokryciem i nie wchodzą do wyniku: holes to odcinki bez właściwej warstwy.
      const holes = mergeRanges(r.holes ?? r.missing ?? []);
      const good = mergeRanges([...(r.covered || []), ...(r.derived || [])]).flatMap(([a, b]) => subtractRanges(a, b, holes));
      // koniec ciągłego pokrycia od minuty wyjścia, nie dalej niż ostatnia pełna minuta przed granicą: minuta trwająca w chwili granicy nie jest jeszcze faktem (jak w readAfterBe)
      const end = continuousEnd(good, from, to), c = Math.floor(to / 60) * 60;
      return {
        m1: r.bars.filter((b) => b[0] >= from && b[0] + 60 <= end).map((b) => [b[0], b[1], b[2], b[3], b[4], b[5]]),
        s1: [],
        covered: c <= from || end >= c,
        coveredTo: end,
      };
    };
    // Projekt: «Rozstrzygają świece 1s, jeśli są na dysku». Tylko dysk, tylko minuta z oboma poziomami i tylko kontrakt trade'a; holes obejmuje każdą sekundę minuty bez warstwy 1s kontraktu, więc niepełna minuta też odpada. Odczyt bez świec z podziału 1m.
    const secsOf = (a) => {
      if (typeof candles.readRaw !== 'function') return [];
      try {
        const r = candles.readRaw(query(a, a + 60, '1s'), { noSynth: true });
        if (!r || r.noSource || !Array.isArray(r.bars) || (r.holes ?? r.missing ?? []).length) return [];
        return r.bars.filter((b) => b.length === 6 && b[0] >= a && b[0] < a + 60);
      } catch (e) { log('[po-be] odczyt sekund nie powiódł się', item.key, e && e.message); return []; }
    };
    // secsMayCome: true: sekundy kontraktu mogą dojść później przy każdym instrumencie, więc „oba naraz bez sekund” nie idzie do pamięci
    const out = solve(item, p, { limit, exitPrecise: false, secsMayCome: true, secsOf, pendingFirst: true, layer: 'c:' + (item.contract || 'auto') + ':' + (isNum(item.entryT) ? item.entryT : ''), load });
    if (out._want) out._want = { ...out._want, key: item.key, instrument: item.instrument, contract: item.contract, tfrom, tto };
    return out;
  }

  // resolve(items) → Promise<{ results: { [key]: Result } }>; błąd walidacji (400) przed jakimkolwiek odczytem (odrzucona obietnica, zanim oddamy pętlę).
  // Runda 1 zadania 4 (przegląd): odczyt świec z dysku jest synchroniczny (ok. 10 ms na pozycję, 200 zimnych pozycji blokowało pętlę serwera ok. 2,4 s), więc co YIELD_MS
  // oddajemy pętlę (setImmediate), a zapisy sesji, replay i inne żądania nie czekają na całą listę.
  let inflight = 0;
  async function resolve(items) {
    if (!Array.isArray(items)) throw bad('Pole items musi być listą.');
    if (items.length > MAX_ITEMS) throw bad('Najwyżej 500 pozycji naraz.');
    const list = items.map(checkItem);
    if (new Set(list.map((x) => x.key)).size !== list.length) throw bad('Powtórzony klucz na liście.');
    if (inflight >= MAX_RESOLVE_INFLIGHT) throw new BacktestError(tt(t, 'Za dużo obliczeń wyniku po BE naraz. Poczekaj chwilę.'), 429, 'busy');
    inflight++;
    try { return await run(list); } finally { inflight--; }
  }
  async function run(list) {
    // bez prototypu: klucz od klienta nie dosięga niczego w Object.prototype
    const results = Object.create(null), want = [], docs = new Map();
    let slice = performance.now();
    for (const it of list) {
      if (performance.now() - slice >= YIELD_MS) { await new Promise((ok) => setImmediate(ok)); slice = performance.now(); }
      const r = it.kind === 'bt' ? resolveBacktest(it, docs) : resolveLive(it);
      if (r._want) {
        if (it.kind === 'live') want.push(r._want);
        delete r._want;
      }
      results[it.key] = r;
    }
    flush();
    if (want.length && typeof wantWindows === 'function') {
      try { Promise.resolve(wantWindows(want)).catch((e) => log('[po-be] wantWindows', e?.message)); } catch (e) { log('[po-be] wantWindows', e?.message); }
    }
    // okna, których nic nie dobierze (pamięć zakupów): klucze obok wyników, sam Result bez zmian; liczone też przy wyłączonym przełączniku (szacunek przed zgodą)
    let held = [];
    if (want.length && typeof heldWindows === 'function') {
      try { held = [...heldWindows(want)]; } catch (e) { log('[po-be] heldWindows', e?.message); }
    }
    // pole held tylko gdy jest co oznaczyć: odpowiedź dla zwykłych trade'ów ma ten sam kształt co dotąd
    return held.length ? { results, held } : { results };
  }
  return { resolve };
}
