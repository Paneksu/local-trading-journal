// Newsy makro USD (pakiet A): model zdarzenia, czas Nowego Jorku (ET) ↔ UTC, scalanie źródeł, zapytania o zakres i o „dziś”. Czyste funkcje, zero sieci i plików.
// Zdarzenie: { t (sekundy UTC), day (data w ET, RRRR-MM-DD), name, imp, kind, allDay, tentative, src, basis, note?, variant? }
//  imp: 'high' | 'medium' | 'low' | 'holiday' | 'opex' (waga/kolor; opex ma własny przełącznik); kind: 'data' | 'fomc' | 'speech' | 'holiday' | 'opex';
//  allDay: cały dzień (t = północ ET danego dnia); tentative: godzina niepewna (przemówienie, „Tentative” z feedu, wnioskowane godziny);
//  src: 'off' (źródła oficjalne i reguły) | 'ff' (feed tygodnia); basis: 'fred' | 'rule' | 'fomc' | 'calc' | 'fed' | 'schedule' | 'feed';
//  unverified: godzina z oficjalnego źródła, której pakiet B jeszcze nie porównał z FF (przemówienia i zeznania z archiwum Fed).
// Wszystko liczone w UTC; wyświetlanie w strefie użytkownika to sprawa interfejsu. English: news event model, ET<->UTC, merge, range/today queries.
import { dayNum, fromDayNum, weekdayOf } from '../public/js/swiece.js';

export const IMPS = Object.freeze(['high', 'medium', 'low', 'holiday', 'opex']);
export const KINDS = Object.freeze(['data', 'fomc', 'speech', 'holiday', 'opex']);
export const SRCS = Object.freeze(['off', 'ff']);
const IMP_RANK = { high: 0, opex: 1, medium: 2, low: 3, holiday: 4 };
export const MAX_RANGE_SEC = 400 * 86400;

// Błąd z komunikatem bezpiecznym dla użytkownika (już przetłumaczonym); status: kod HTTP; code: powód maszynowy.
export class NewsError extends Error {
  constructor(message, status = 502, code = 'error', extra = {}) { super(message); this.name = 'NewsError'; this.status = status; this.code = code; Object.assign(this, extra); }
}

// ---- daty ----
const pad = (n) => String(n).padStart(2, '0');
export const dateStr = (n) => { const { y, mo, d } = fromDayNum(n); return `${y}-${pad(mo)}-${pad(d)}`; };
// 'RRRR-MM-DD' → numer dnia; rzuca dla dat nieistniejących (2026-02-30).
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  const n = m ? dayNum(Number(m[1]), Number(m[2]), Number(m[3])) : NaN;
  if (!m || dateStr(n) !== s) throw new Error(`news: zła data „${String(s).slice(0, 20)}”, oczekiwano RRRR-MM-DD`);
  return n;
}
// n-ty (n >= 1) dzień tygodnia wd (0 = niedziela) miesiąca; n = -1: ostatni. Zwraca numer dnia.
export function nthWeekday(y, mo, wd, n) {
  if (n > 0) { const f = dayNum(y, mo, 1); return f + ((wd - weekdayOf(f) + 7) % 7) + (n - 1) * 7; }
  const last = (mo === 12 ? dayNum(y + 1, 1, 1) : dayNum(y, mo + 1, 1)) - 1;
  return last - ((weekdayOf(last) - wd + 7) % 7);
}
export { weekdayOf, dayNum, fromDayNum };

// ---- czas Nowego Jorku (reguły USA obowiązują od 2007: 2. niedziela marca 2:00 → 1. niedziela listopada 2:00) ----
function dstRange(y) {
  return { start: nthWeekday(y, 3, 0, 2) * 86400 + 7 * 3600, end: nthWeekday(y, 11, 0, 1) * 86400 + 6 * 3600 }; // 2:00 EST = 7:00Z, 2:00 EDT = 6:00Z
}
const isDstUtc = (u) => { const r = dstRange(new Date(u * 1000).getUTCFullYear()); return u >= r.start && u < r.end; };
export const etOffsetSec = (u) => (isDstUtc(u) ? -4 * 3600 : -5 * 3600);
// Chwila UTC dla godziny hh:mm czasu Nowego Jorku w dniu `day` (numer dnia). Godziny z przerwy wiosennej (2:00-3:00) nie istnieją, z jesiennej (1:00-2:00) liczą się jako letnie.
export function etToUtc(day, hh = 0, mm = 0) {
  const local = day * 86400 + hh * 3600 + mm * 60;
  return isDstUtc(local + 4 * 3600) ? local + 4 * 3600 : local + 5 * 3600;
}
export const etDayOf = (u) => Math.floor((u + etOffsetSec(u)) / 86400);
export const hhmm = (s) => { const m = /^(\d{2}):(\d{2})$/.exec(s); if (!m) throw new Error(`news: zła godzina „${s}”`); return [Number(m[1]), Number(m[2])]; };

// ---- zdarzenie ----
export function makeEvent({ t, name, imp, kind, src = 'off', basis, allDay = false, tentative = false, note, variant, unverified = false }) {
  if (!Number.isInteger(t) || t < 0) throw new Error(`news: zły czas zdarzenia „${name}”: ${t}`);
  if (typeof name !== 'string' || !name.trim()) throw new Error('news: zdarzenie bez nazwy');
  if (!IMPS.includes(imp)) throw new Error(`news: zła waga „${imp}” zdarzenia „${name}”`);
  if (!KINDS.includes(kind)) throw new Error(`news: zły rodzaj „${kind}” zdarzenia „${name}”`);
  if (!SRCS.includes(src)) throw new Error(`news: złe źródło „${src}” zdarzenia „${name}”`);
  const ev = { t, day: dateStr(etDayOf(t)), name: name.trim(), imp, kind, allDay: !!allDay, tentative: !!tentative, src, basis: basis || (src === 'ff' ? 'feed' : 'rule') };
  if (note) ev.note = String(note);
  if (variant) ev.variant = String(variant);
  if (unverified) ev.unverified = true;
  return ev;
}
// Zdarzenie na cały dzień (północ ET).
export const makeAllDay = (day, rest) => makeEvent({ ...rest, t: etToUtc(day, 0, 0), allDay: true });

export function compareEvents(a, b) {
  return a.t - b.t || (IMP_RANK[a.imp] ?? 9) - (IMP_RANK[b.imp] ?? 9) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}
// Duplikaty łączone w jedno. Źródła oficjalne po (nazwa, dzień ET): jedno zdarzenie danego rodzaju na dobę. Feed FF po (nazwa, dzień, godzina): dwa zdarzenia o tym samym
// tytule tego samego dnia, ale o różnych godzinach, zostają oba (np. dwa przemówienia tego samego mówcy). Zdarzenie oficjalne znika, gdy feed ma to samo (nazwa, dzień):
// feed wygrywa ze źródłami oficjalnymi. Przy równym kluczu godzina pewna wygrywa z niepewną, dalej pierwsze w kolejności wejścia.
export function dedupe(events) {
  const best = new Map();
  const score = (x) => (x.src === 'ff' ? 2 : 0) + (x.tentative ? 0 : 1);
  for (const e of events) {
    const k = e.src === 'ff' ? `ff|${e.name}|${e.day}|${e.t}` : `${e.name}|${e.day}`;
    const cur = best.get(k);
    if (!cur || score(e) > score(cur)) best.set(k, e);
  }
  const ffDays = new Set([...best.values()].filter((e) => e.src === 'ff').map((e) => `${e.name}|${e.day}`));
  return [...best.values()].filter((e) => e.src === 'ff' || !ffDays.has(`${e.name}|${e.day}`)).sort(compareEvents);
}

// ---- feed FF: tydzień (niedziela 00:00 ET → następna niedziela 00:00 ET) ----
export function weekBounds(day) {
  const sunday = day - weekdayOf(day);
  return { startDay: sunday, start: etToUtc(sunday, 0, 0), end: etToUtc(sunday + 7, 0, 0) };
}
// Etykieta tygodnia ISO (poniedziałek tego tygodnia FF), np. 2026-W44 dla 25-31.10.2026.
export function weekLabel(startDay) {
  const thursday = startDay + 1 + 3;
  const y = fromDayNum(thursday).y;
  return `${y}-W${pad(Math.floor((thursday - dayNum(y, 1, 1)) / 7) + 1)}`;
}
// Rodzaje źródeł oficjalnych, które przeżywają w tygodniu z feedu (FF nie ma OPEX).
const KEEP_IN_FEED_WEEK = new Set(['opex']);
// Scalanie: w tygodniu z feedu wygrywa FF (godziny, przesunięcia, wagi); poza nim źródła oficjalne; potem deduplikacja.
// weeks: [{ start, end, events }]
export function mergeFeed(official, weeks) {
  const covered = (t) => weeks.some((w) => t >= w.start && t < w.end);
  const kept = weeks.length ? official.filter((e) => !covered(e.t) || KEEP_IN_FEED_WEEK.has(e.kind)) : official;
  return dedupe([...kept, ...weeks.flatMap((w) => w.events)]);
}

// ---- zapytania ----
function lowerBound(events, t) {
  let lo = 0, hi = events.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (events[mid].t < t) lo = mid + 1; else hi = mid; }
  return lo;
}
const dayEnd = (e) => etToUtc(parseDay(e.day) + 1, 0, 0);
// Zdarzenia z [from, to) (sekundy UTC). Zdarzenie całodniowe wchodzi, gdy jego doba ET nachodzi na zakres. Lista musi być posortowana po t.
export function inRange(events, from, to) {
  const out = [];
  for (let i = lowerBound(events, from - 25 * 3600); i < events.length && events[i].t < to; i++) {
    const e = events[i];
    if (e.allDay ? dayEnd(e) > from : e.t >= from) out.push(e);
  }
  return out;
}

// ---- „dziś” w strefie użytkownika ----
export function checkTz(tz) {
  const s = String(tz ?? '');
  if (!s || s.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(s)) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: s }); return true; } catch { return false; }
}
export const systemTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
function tzOffsetSec(u, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(u * 1000)).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) / 1000 - u;
}
// Początek doby lokalnej (północ) dla numeru dnia kalendarzowego w strefie tz, w UTC.
export function localMidnightUtc(day, tz) {
  let u = day * 86400;
  for (let i = 0; i < 3; i++) u = day * 86400 - tzOffsetSec(u, tz);
  return u;
}
export function localDayOf(u, tz) { return Math.floor((u + tzOffsetSec(u, tz)) / 86400); }
// Dziś = doba lokalna w strefie tz zawierająca `nowSec`. events: zdarzenia godzinowe z tej doby + całodniowe, których data ET = data lokalna.
// tomorrow: zdarzenia całodniowe jutra (dla „Jutro OPEX”).
export function todayOf(events, nowSec, tz) {
  const day = localDayOf(nowSec, tz);
  const from = localMidnightUtc(day, tz), to = localMidnightUtc(day + 1, tz);
  const sameDay = (e, d) => e.day === dateStr(d);
  const lo = lowerBound(events, from - 25 * 3600), hi = lowerBound(events, to + 25 * 3600);
  const today = [], tomorrow = [];
  for (let i = lo; i < Math.min(events.length, hi + 1); i++) {
    const e = events[i];
    if (e.allDay) { if (sameDay(e, day)) today.push(e); else if (sameDay(e, day + 1)) tomorrow.push(e); }
    else if (e.t >= from && e.t < to) today.push(e);
  }
  return { day: dateStr(day), tz, from, to, events: today, tomorrow };
}

// ---- wyszukiwanie w całej historii (kalendarz w interfejsie, 1.4.0) ----
export const MAX_SEARCH = 500, DEFAULT_SEARCH = 200;
// Tekst do porównań: małe litery bez znaków diakrytycznych (łączenie NFD nie rozkłada „ł”, więc osobno).
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/gi, 'l').toLowerCase();
// Zapytanie: 2 do 60 znaków; kinds i imps to listy rozdzielone przecinkami (puste = wszystkie); limit 1 do 500. Zwraca { q, kinds, imps, limit } albo rzuca NewsError po polsku.
export function parseSearch({ q, kinds, imps, limit, before, from, year } = {}, tr = (s, p) => (p ? s.replace(/\{(\w+)\}/g, (m, k) => String(p[k] ?? m)) : s)) {
  const text = String(q ?? '').trim();
  if (text.length < 2 || text.length > 60) throw new NewsError(tr('Szukana fraza ma mieć od 2 do 60 znaków.'), 400, 'bad-query');
  const list = (v, all, what) => {
    if (v == null || v === '') return null;
    const xs = String(v).split(',').map((x) => x.trim()).filter(Boolean);
    if (!xs.length || xs.some((x) => !all.includes(x))) throw new NewsError(tr('Zły filtr: {what}.', { what }), 400, 'bad-filter');
    return xs;
  };
  const n = limit == null || limit === '' ? DEFAULT_SEARCH : Number(limit);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SEARCH) throw new NewsError(tr('Limit wyników to liczba od 1 do {max}.', { max: MAX_SEARCH }), 400, 'bad-limit');
  // before: tylko zdarzenia sprzed chwili (sekundy UTC), od najnowszych; from: tylko od chwili, od najstarszych (nadchodzące); year: rok daty (ET)
  const sec = (v, what) => { if (v == null || v === '') return null; const x = Number(v); if (!/^\d{1,12}$/.test(String(v)) || !Number.isSafeInteger(x)) throw new NewsError(tr('Zły filtr: {what}.', { what }), 400, 'bad-filter'); return x; };
  const b = sec(before, 'przed'), f = sec(from, 'od');
  if (b != null && f != null) throw new NewsError(tr('Zły filtr: {what}.', { what: 'przed i od naraz' }), 400, 'bad-filter');
  const y = sec(year, 'rok');
  if (y != null && (y < 2000 || y > 2100)) throw new NewsError(tr('Zły filtr: {what}.', { what: 'rok' }), 400, 'bad-filter');
  return { q: text, kinds: list(kinds, KINDS, 'rodzaje'), imps: list(imps, IMPS, 'wagi'), limit: n, before: b, from: f, year: y };
}
// Wspólny wycinek strony: from = rosnąco od chwili, inaczej malejąco (opcjonalnie sprzed chwili). Strona kończy się na całej grupie zdarzeń o tej samej chwili,
// więc kolejna strona (before = t ostatniego wyniku) niczego nie gubi ani nie dubluje.
export function pageOf(hit, { limit, before = null, from = null }) {
  let h = hit;
  if (from != null) h = h.filter((e) => e.t >= from); else if (before != null) h = h.filter((e) => e.t < before);
  const total = h.length;
  let out;
  if (from != null) { let n = Math.min(limit, total); while (n < total && h[n].t === h[n - 1].t) n++; out = h.slice(0, n); }
  else { let n = Math.min(limit, total); while (n < total && h[total - n - 1].t === h[total - n].t) n++; out = h.slice(total - n).reverse(); }
  return { total, truncated: total > out.length, events: out };
}
// Wyniki od najnowszych: nazwa zawiera frazę (bez wielkości liter i polskich znaków; „opex” znajduje też „OPEX miesięczny”). total = wszystkich pasujących, truncated = ucięte limitem.
export function searchEvents(events, { q, kinds = null, imps = null, limit = DEFAULT_SEARCH, before = null, from = null, year = null }) {
  const needle = fold(q);
  const y = year == null ? null : String(year);
  const hit = events.filter((e) => (!kinds || kinds.includes(e.kind)) && (!imps || imps.includes(e.imp)) && (y == null || e.day.startsWith(y))
    && fold(`${e.name} ${e.note || ''} ${e.kind === 'opex' ? 'opex' : ''} ${e.kind === 'holiday' ? 'bank holiday swieto' : ''}`).includes(needle)); // także tytuł komunikatu Fed z pola note
  return { q, ...pageOf(hit, { limit, before, from }) };
}
