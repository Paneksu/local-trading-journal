// Earningsy spółek S&P 100 (pakiet A2): model, pora ogłoszenia (BMO / AMC / w trakcie sesji), klasy 1-4, scalanie EDGAR + Finnhub, zapytania. Czyste funkcje, zero sieci i plików.
// Osobny model od newsów makro (lib/news.mjs), wspólne tylko pomocnicze funkcje czasu Nowego Jorku i wyboru zakresu.
// Earning: { t (sekundy UTC), day (data ET), symbol, name, cls (1-4), session, allDay, src, quarter?, year?, epsEst?, revEst? }
//  session: 'bmo' przed 9:30 ET | 'amc' od 16:00 ET | 'dmh' w trakcie sesji | 'weekend' raport przyjęty w sobotę lub niedzielę (t = otwarcie najbliższego poniedziałku 9:30 ET,
//    day = ten poniedziałek, filedAt = rzeczywisty czas przyjęcia) | 'unknown' pora nieznana;
//  src: 'edgar' (8-K Item 2.02, t = czas przyjęcia raportu przez SEC) | 'finnhub' (termin z kalendarza, t = 9:30 ET dla bmo, 16:00 ET dla amc, północ ET i allDay bez pory).
// English: earnings model: session classification, classes 1-4, EDGAR + Finnhub merge, queries.
import { etToUtc, etDayOf, etOffsetSec, dateStr, parseDay, weekdayOf, NewsError, inRange, MAX_RANGE_SEC, localDayOf, localMidnightUtc, fold, DEFAULT_SEARCH, parseSearch, MAX_SEARCH, pageOf } from './news.mjs';
import { CLASS1, CLASS2, TOP_N } from './earnings-katalog.mjs';

export { inRange, MAX_RANGE_SEC, NewsError, parseSearch, MAX_SEARCH };
export const SESSIONS = Object.freeze(['bmo', 'amc', 'dmh', 'weekend', 'unknown']);
export const OPEN_SEC = 9 * 3600 + 30 * 60, CLOSE_SEC = 16 * 3600; // 9:30 i 16:00 ET

// Pora z czasu ET w sekundach od północy: przed 9:30 BMO, od 16:00 włącznie AMC, pomiędzy w trakcie sesji.
export const sessionOfEtSeconds = (sec) => (sec < OPEN_SEC ? 'bmo' : sec >= CLOSE_SEC ? 'amc' : 'dmh');
// Czas przyjęcia 8-K przez SEC (unix UTC) → { day (ET), session, t }. Weekend (sobota, niedziela ET): session 'weekend', day i t = najbliższy poniedziałek, otwarcie 9:30 ET
// (reakcja rynku jest dopiero wtedy), filedAt = rzeczywisty czas przyjęcia. Poza weekendem t = u.
export function classifyAcceptance(u) {
  const day = etDayOf(u), wd = weekdayOf(day);
  if (wd === 6 || wd === 0) { const mon = day + (wd === 6 ? 2 : 1); return { day: dateStr(mon), session: 'weekend', t: etToUtc(mon, 9, 30), filedAt: u }; }
  return { day: dateStr(day), session: sessionOfEtSeconds(u + etOffsetSec(u) - day * 86400), t: u };
}
// Pora z pola hour Finnhub ('bmo', 'amc', 'dmh', '' i wariacje wielkości liter).
export function sessionOfHour(hour) {
  const h = String(hour ?? '').trim().toLowerCase();
  return h === 'bmo' || h === 'amc' || h === 'dmh' ? h : 'unknown';
}
// Znacznik na wykresie dla terminu bez dokładnej godziny: BMO przy otwarciu 9:30 ET, AMC przy zamknięciu 16:00 ET, reszta jako etykieta dnia (północ ET).
export function scheduledTime(day, session) {
  if (session === 'bmo') return etToUtc(day, 9, 30);
  if (session === 'amc') return etToUtc(day, 16, 0);
  return etToUtc(day, 0, 0);
}
// Ticker w zapisie kanonicznym: wielkie litery, klasa akcji z kropką (BRK-B, brk.b → BRK.B).
export const normSymbol = (s) => String(s ?? '').trim().toUpperCase().replace(/-/g, '.');

export function makeEarning({ t, symbol, name, cls, session, src, quarter, year, epsEst, revEst, filedAt }) {
  if (!Number.isInteger(t) || t < 0) throw new Error(`earnings: zły czas ${t} dla ${symbol}`);
  if (!SESSIONS.includes(session)) throw new Error(`earnings: zła pora „${session}” dla ${symbol}`);
  if (![1, 2, 3, 4].includes(cls)) throw new Error(`earnings: zła klasa „${cls}” dla ${symbol}`);
  if (!['edgar', 'finnhub'].includes(src)) throw new Error(`earnings: złe źródło „${src}” dla ${symbol}`);
  const ev = { t, day: dateStr(etDayOf(t)), symbol, name: name || symbol, cls, session, allDay: session === 'dmh' ? src === 'finnhub' : session === 'unknown', src };
  if (Number.isInteger(filedAt)) ev.filedAt = filedAt;
  if (Number.isInteger(quarter)) ev.quarter = quarter;
  if (Number.isInteger(year)) ev.year = year;
  if (Number.isFinite(epsEst)) ev.epsEst = epsEst;
  if (Number.isFinite(revEst)) ev.revEst = revEst;
  return ev;
}

// ---- klasy ----
// universe: [{ symbol }] w kolejności zapasowej (od największej kapitalizacji). caps: { SYMBOL: kapitalizacja } (Finnhub, mln USD). overrides: { SYMBOL: 1-4 } (ręczne przeniesienie klasy).
// extra: tickery dopisane ręcznie (domyślnie klasa 4). Klasa 1-2: stała lista. Klasa 3: kolejne spółki wg kapitalizacji do łącznie TOP_N (z klasami 1-2), reszta klasa 4.
// Spółki bez kapitalizacji idą po tych z kapitalizacją, w kolejności zapasowej. Zwraca { map: Map symbol → klasa, counts: { 1.. 4 } }.
export function buildClassMap(universe, { caps = {}, overrides = {}, extra = [] } = {}) {
  const syms = universe.map((u) => normSymbol(u.symbol));
  const fixed = new Map();
  for (const s of CLASS1) if (syms.includes(s)) fixed.set(s, 1);
  for (const s of CLASS2) if (syms.includes(s)) fixed.set(s, 2);
  const rest = syms.map((s, i) => ({ s, i, cap: Number.isFinite(caps[s]) ? caps[s] : -1 })).filter((x) => !fixed.has(x.s));
  rest.sort((a, b) => (b.cap > 0) - (a.cap > 0) || (a.cap > 0 && b.cap !== a.cap ? b.cap - a.cap : a.i - b.i));
  const n3 = Math.max(0, TOP_N - fixed.size);
  const map = new Map(fixed);
  rest.forEach((x, i) => map.set(x.s, i < n3 ? 3 : 4));
  for (const e of extra) { const s = normSymbol(e); if (s && !map.has(s)) map.set(s, 4); }
  for (const [k, v] of Object.entries(overrides || {})) {
    const s = normSymbol(k);
    if (map.has(s) && [1, 2, 3, 4].includes(Number(v))) map.set(s, Number(v));
  }
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const c of map.values()) counts[c]++;
  return { map, counts };
}

// ---- scalanie ----
// edgar: [{ symbol, t }] (t = czas przyjęcia 8-K, UTC). finnhub: [{ symbol, date 'RRRR-MM-DD', hour, quarter, year, epsEstimate, revenueEstimate }].
// names: { SYMBOL: nazwa }. classes: Map z buildClassMap (spółki spoza mapy są pomijane).
// EDGAR (rzeczywisty czas) wygrywa z terminem Finnhub w promieniu 3 dni od tego samego symbolu; z wiersza Finnhub bierzemy wtedy tylko kwartał i szacunki.
export function mergeEarnings({ edgar = [], finnhub = [], names = {}, classes }) {
  const bySym = new Map();
  const out = [];
  for (const r of edgar) {
    const symbol = normSymbol(r.symbol), cls = classes.get(symbol);
    if (!cls || !Number.isInteger(r.t)) continue;
    const a = classifyAcceptance(r.t);
    const ev = makeEarning({ t: a.t, symbol, name: names[symbol], cls, session: a.session, src: 'edgar', filedAt: a.filedAt });
    out.push(ev);
    if (!bySym.has(symbol)) bySym.set(symbol, []);
    bySym.get(symbol).push(ev);
  }
  const seen = new Set();
  for (const r of finnhub) {
    const symbol = normSymbol(r.symbol), cls = classes.get(symbol);
    let d;
    try { d = parseDay(r.date); } catch { continue; }
    if (!cls) continue;
    const near = (bySym.get(symbol) || []).find((e) => Math.abs(parseDay(e.day) - d) <= 3);
    if (near) {
      if (Number.isInteger(r.quarter) && near.quarter === undefined) near.quarter = r.quarter;
      if (Number.isInteger(r.year) && near.year === undefined) near.year = r.year;
      if (Number.isFinite(r.epsEstimate) && near.epsEst === undefined) near.epsEst = r.epsEstimate;
      if (Number.isFinite(r.revenueEstimate) && near.revEst === undefined) near.revEst = r.revenueEstimate;
      continue;
    }
    const key = `${symbol}|${r.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const session = sessionOfHour(r.hour);
    out.push(makeEarning({ t: scheduledTime(d, session), symbol, name: names[symbol], cls, session, src: 'finnhub', quarter: r.quarter, year: r.year, epsEst: r.epsEstimate, revEst: r.revenueEstimate }));
  }
  return out.sort(compare);
}
export const compare = (a, b) => a.t - b.t || a.cls - b.cls || (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0);

// ---- „dziś” ----
// Doba lokalna w strefie tz (domyślnie czas giełdy, America/New_York), tak samo jak news.todayOf: zdarzenie godzinowe należy do doby, gdy jego t mieści się między
// północami; zdarzenie bez godziny (allDay) do doby o tej samej dacie ET. Pora BMO/AMC jest zawsze liczona w ET (pole session), niezależnie od tz.
// amcToday: ogłoszenia po zamknięciu dziś; bmoTomorrow: jutro przed otwarciem (BMO oraz weekend); tomorrowOther: jutro w trakcie sesji albo bez pory; soon: najbliższe klasy 1
// w ciągu soonDays dób od dziś (bez powtórzeń z dwóch pierwszych list); events: wszystko z dzisiejszej doby.
export function todayOf(events, nowSec, { soonDays = 7, tz = 'America/New_York' } = {}) {
  const dn = localDayOf(nowSec, tz), mid = (d) => localMidnightUtc(d, tz);
  const inDay = (e, d) => (e.allDay ? e.day === dateStr(d) : e.t >= mid(d) && e.t < mid(d + 1));
  const today = events.filter((e) => inDay(e, dn));
  const amcToday = today.filter((e) => e.session === 'amc');
  const tomorrow = events.filter((e) => inDay(e, dn + 1));
  const bmoTomorrow = tomorrow.filter((e) => e.session === 'bmo' || e.session === 'weekend');
  const tomorrowOther = tomorrow.filter((e) => e.session !== 'bmo' && e.session !== 'weekend');
  const shown = new Set([...amcToday, ...bmoTomorrow].map((e) => `${e.symbol}|${e.day}`));
  const horizon = mid(dn + soonDays + 1);
  const soon = events.filter((e) => e.cls === 1 && !shown.has(`${e.symbol}|${e.day}`) && (e.allDay ? e.day >= dateStr(dn) && e.t < horizon : e.t >= nowSec && e.t < horizon));
  return { day: dateStr(dn), tz, events: today, amcToday, bmoTomorrow, tomorrowOther, soon };
}

// Wyszukiwanie wyników spółek: ticker (prefiks) albo fragment nazwy, bez wielkości liter i polskich znaków; od najnowszych. classes: lista klas 1-4 albo null.
export function searchEarnings(events, { q, classes = null, limit = DEFAULT_SEARCH, before = null, from = null, year = null }) {
  const needle = fold(q), y = year == null ? null : String(year);
  const hit = events.filter((e) => (!classes || classes.includes(e.cls)) && (y == null || e.day.startsWith(y)) && (fold(e.symbol).startsWith(needle) || fold(e.name).includes(needle)));
  return { q, ...pageOf(hit, { limit, before, from }) };
}
