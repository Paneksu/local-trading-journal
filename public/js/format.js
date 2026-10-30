// Formatowanie liczb, dat i tekstu wg języka interfejsu (pl-PL albo en-US, przez Intl). Bez zależności.
import { locale, getLang } from './i18n.js';

const EN = getLang() === 'en';
const nfCache = new Map();
function nf(max) {
  if (!nfCache.has(max)) nfCache.set(max, new Intl.NumberFormat(locale(), { minimumFractionDigits: 0, maximumFractionDigits: max, useGrouping: 'always' }));
  return nfCache.get(max);
}
const NBSP = ' ';
const MINUS = '−';
export const DASH = '–';

export const num = (x, d = 2) => nf(d).format(x);
export const sign = (x) => (x > 1e-9 ? '+' : x < -1e-9 ? MINUS : '');

export function fmtR(x, { plus = true } = {}) {
  if (x == null || !isFinite(x)) return DASH;
  const s = plus ? sign(x) : x < -1e-9 ? MINUS : '';
  return `${s}${num(Math.abs(x), 2)}R`;
}
// Kwota w dolarach: po polsku „1 250 $”, po angielsku „$1,250”.
const usd = (txt) => (EN ? '$' + txt : txt + NBSP + '$');
export function fmtMoney(x, { plus = true, decimals } = {}) {
  if (x == null || !isFinite(x)) return DASH;
  const d = decimals ?? (Math.abs(x - Math.round(x)) < 0.005 ? 0 : 2);
  const s = plus ? sign(x) : x < -1e-9 ? MINUS : '';
  return s + usd(num(Math.abs(x), d));
}
export function fmtPct(x, d = 0) {
  if (x == null || !isFinite(x)) return DASH;
  return `${num(x, d)}%`;
}
export function fmtPf(x) {
  if (x == null) return DASH;
  if (!isFinite(x)) return '∞';
  return num(x, 2);
}
// Zwięzły zapis do komórek kalendarza.
export function compactVal(x, unit) {
  if (x == null) return DASH;
  const s = sign(x);
  const a = Math.abs(x);
  if (unit === 'R') return `${s}${num(a, 2)}R`;
  if (a >= 1000) return `${s}${num(a / 1000, 1)}k`;
  return s + (EN ? '$' + num(a, 0) : num(a, 0) + '$');
}
export const fmtVal = (x, unit) => (unit === 'R' ? fmtR(x) : fmtMoney(x));

// Nazwy miesięcy i dni z Intl (język interfejsu). Polski dopełniacz („25 października”) daje format dnia z miesiącem.
const LOC = locale();
const monthsBy = (opt, withDay) => Array.from({ length: 12 }, (_, i) => {
  const d = new Date(Date.UTC(2026, i, 15));
  if (!withDay) return new Intl.DateTimeFormat(LOC, { month: opt, timeZone: 'UTC' }).format(d);
  const parts = new Intl.DateTimeFormat(LOC, { month: opt, day: 'numeric', timeZone: 'UTC' }).formatToParts(d);
  return parts.find((p) => p.type === 'month').value;
});
export const MONTHS = monthsBy('long', false).map((m) => (EN ? m : m.toLowerCase()));
export const MONTHS_GEN = monthsBy('long', true);
export const MON_SHORT = monthsBy('short', false).map((m) => m.replace(/\.$/, ''));
const wd = (opt) => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(LOC, { weekday: opt, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 19 + i)))); // 19.10.2026 to poniedziałek
export const WEEKDAYS = EN ? wd('short').map((w) => w.slice(0, 2)) : ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
export const DAYS_FULL = wd('long').map((w) => (EN ? w : w.toLowerCase()));
export const DAYS_TITLE = wd('long').map((w) => w[0].toUpperCase() + w.slice(1));

export const pad = (n) => String(n).padStart(2, '0');
export function toKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export const todayKey = () => toKey(new Date());
export function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return { y, m, d }; }
export function addDays(k, n) {
  const { y, m, d } = parseKey(k);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
export function diffDays(a, b) { // b - a w dniach
  const pa = parseKey(a), pb = parseKey(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}
// 0 = poniedziałek
export function weekdayIdx(k) {
  const { y, m, d } = parseKey(k);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
// „25 paź” / „Oct 25”
// H2 (ocena wyglądu #7): data i godzina jak w reszcie dashboardu, w języku aplikacji: „30 paź, 15:24” / „Oct 30, 15:24”; rok tylko spoza bieżącego roku.
export function dateTimeShort(d, now = new Date()) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return DASH;
  const k = toKey(d), yr = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${shortDate(k)}${yr}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function shortDate(k) { const { m, d } = parseKey(k); return EN ? `${MON_SHORT[m - 1]}${NBSP}${d}` : `${d}${NBSP}${MON_SHORT[m - 1]}`; }
// „25 października 2026” / „October 25, 2026”
export function longDate(k) { const { y, m, d } = parseKey(k); return EN ? `${MONTHS[m - 1]}${NBSP}${d}, ${y}` : `${d}${NBSP}${MONTHS_GEN[m - 1]} ${y}`; }
// „25 października” / „October 25” (bez roku)
export function dayMonth(k) { const { m, d } = parseKey(k); return EN ? `${MONTHS[m - 1]} ${d}` : `${d} ${MONTHS_GEN[m - 1]}`; }
// nagłówek miesiąca: „październik 2026” / „October 2026”
export const monthTitle = (y, m) => `${MONTHS[m - 1]} ${y}`;
export function monthKey(k) { return k.slice(0, 7); }
export function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const cls = (x) => (x > 1e-9 ? 'pos' : x < -1e-9 ? 'neg' : '');

// Data z Notion: „2026-10-25” (bez godziny) albo ISO z godziną i offsetem. Dzień i godzina liczone w czasie lokalnym
// przeglądarki, więc wpis z godziną 23:30 nie przeskakuje na inny dzień przez strefę (stare slice(0,10) liczyło dzień wg offsetu z Notion).
export function parseDT(s) {
  if (!s) return null;
  const str = String(s);
  if (str.length <= 10) return { date: str, time: null, at: null };
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return { date: str.slice(0, 10), time: null, at: null };
  return { date: toKey(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, at: d.getTime() };
}
export const hmToMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
export const minToHm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
export function fmtDur(min) {
  if (min == null || !isFinite(min)) return DASH;
  const sec = Math.round(min * 60);
  if (sec < 60) return `${sec}${NBSP}s`;
  if (sec < 600 && sec % 60) return `${Math.floor(sec / 60)}${NBSP}min ${sec % 60}${NBSP}s`;
  const m = Math.round(min);
  if (m < 60) return `${m}${NBSP}min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}${NBSP}h ${r}${NBSP}min` : `${h}${NBSP}h`;
}
// Liczba z pola tekstowego: przyjmuje przecinek i kropkę dziesiętną, spacje i minus typograficzny (w obu językach).
export function parseNumText(s) {
  return Number(String(s ?? '').trim().replace(/\s/g, '').replace('−', '-').replace(',', '.'));
}
// Wartość w polu edycji: liczba z separatorem dziesiętnym języka (1,5 / 1.5).
export const numInput = (x) => (x == null ? '' : EN ? String(x) : String(x).replace('.', ','));
// Wyszukiwanie bez wielkości liter i bez polskich znaków (NFD nie rozkłada ł, więc osobno).
export const fold = (s) => String(s ?? '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/\p{M}/gu, '');
