// P37 (28.10.2026): wykrywanie dziur w danych świec. Dziura = sesja CME (dzień handlowy), w której pobranym zakresie nie ma ANI JEDNEJ świecy 1m,
// a dzień nie jest świętem zamkniętym całą dobę ani weekendem. Wynik: serie kolejnych pustych sesji [{ t, to, a, b }], gdzie t i to to otwarcie pierwszej
// i zamknięcie ostatniej sesji serii (sekundy UTC), a i b to dni handlowe (data zamknięcia sesji, YYYY-MM-DD) pierwszego i ostatniego dnia dziury.
// Przykład: Databento nie ma 12-13.06.2014 (sesje otwarte w środę 11.06 i czwartek 12.06) → { a: '2014-06-12', b: '2014-06-13' }.
// Moduł nie zna sieci ani plików: dane dostaje przez funkcje `isCovered(open, close)` i `barCount(open, close)`.
// Dni świąteczne liczone regułą (święta giełdowe USA + Wielki Piątek), więc zero dat wpisanych na sztywno. Skrócone sesje (święto z handlem do południa,
// 24.12, dzień po Święcie Dziękczynienia, sesja 16.03.2020 z przerwami) mają świece, więc nie są dziurą: liczy się brak jakiejkolwiek świecy.
// English: data-gap detection: trading sessions with zero 1m bars inside the downloaded range that are not full-day holidays.
import { dayNum, fromDayNum, weekdayOf, sessionOf } from '../public/js/swiece.js';

// n-ty (n >= 1) dzień tygodnia `wd` (0 = niedziela) miesiąca; n = -1: ostatni.
function nthWeekday(y, mo, wd, n) {
  if (n > 0) { const f = dayNum(y, mo, 1); return f + ((wd - weekdayOf(f) + 7) % 7) + (n - 1) * 7; }
  const next = mo === 12 ? dayNum(y + 1, 1, 1) : dayNum(y, mo + 1, 1);
  const last = next - 1;
  return last - ((weekdayOf(last) - wd + 7) % 7);
}
// Niedziela Wielkanocna (algorytm Meeusa/Jonesa/Butchera), numer dnia.
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return dayNum(y, mo, da);
}
// Święto w sobotę przesuwa się na piątek, w niedzielę na poniedziałek.
const observed = (n) => (weekdayOf(n) === 6 ? n - 1 : weekdayOf(n) === 0 ? n + 1 : n);
const holidayCache = new Map();
// Dni handlowe (data zamknięcia sesji) bez handlu przez całą dobę w roku y: Nowy Rok, MLK, Dzień Prezydentów, Wielki Piątek, Memorial Day, Juneteenth,
// 4 lipca, Labor Day, Święto Dziękczynienia, Boże Narodzenie (z przesunięciem soboty/niedzieli).
export function holidaysOf(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  const s = new Set([
    dayNum(y, 1, 1), observed(dayNum(y, 1, 1)), nthWeekday(y, 1, 1, 3), nthWeekday(y, 2, 1, 3), easter(y) - 2, nthWeekday(y, 5, 1, -1),
    observed(dayNum(y, 7, 4)), nthWeekday(y, 9, 1, 1), nthWeekday(y, 11, 4, 4), dayNum(y, 12, 25), observed(dayNum(y, 12, 25)),
  ]);
  if (y >= 2021) { s.add(dayNum(y, 6, 19)); s.add(observed(dayNum(y, 6, 19))); }
  holidayCache.set(y, s);
  return s;
}
export const isHoliday = (tradingDay) => holidaysOf(fromDayNum(tradingDay).y).has(tradingDay);
const dateStr = (n) => { const { y, mo, d } = fromDayNum(n); return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };

// Dziury w [from, to) (sekundy UTC; sesje zachodzące na zakres, także tylko częściowo). Numer dnia Chicago przybliżony (UTC − 6 h), pętla ma zapas dni.
export function findGaps(from, to, { isCovered, barCount }) {
  if (!(to > from)) return [];
  const out = [];
  let last = null;
  const dayOf = (t) => Math.floor((t - 21600) / 86400);
  for (let day = dayOf(from) - 2; day <= dayOf(to) + 1; day++) {
    if (weekdayOf(day) > 4) continue; // sesje otwierają się od niedzieli (0) do czwartku (4)
    const s = sessionOf(day);
    if (s.close <= from || s.open >= to) continue;
    if (isHoliday(day + 1)) continue;
    if (!isCovered(s.open, s.close) || barCount(s.open, s.close) > 0) continue;
    if (last && (day - last.day === 1 || (weekdayOf(last.day) === 4 && day - last.day === 3))) { last.to = s.close; last.b = dateStr(day + 1); last.day = day; }
    else { last = { t: s.open, to: s.close, a: dateStr(day + 1), b: dateStr(day + 1), day }; out.push(last); }
  }
  return out.map(({ t, to: e, a, b }) => ({ t, to: e, a, b }));
}
