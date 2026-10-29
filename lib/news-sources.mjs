// Newsy makro USD (pakiet A): źródła zdarzeń. Generatory (FRED → zdarzenia, FOMC, reguły, dni wolne, OPEX), parsery (feed tygodnia, archiwa Fed)
// i trzy klienty HTTP (FRED, feed ForexFactory, archiwa JSON Fed). Dane i godziny z news-katalog.mjs; model i czas z news.mjs.
// Połączenia wychodzące tylko do: api.stlouisfed.org, nfs.faireconomy.media (WYŁĄCZNIE ten feed; stron forexfactory.com nie pobieramy: regulamin FF),
// www.federalreserve.gov. Klucz FRED trafia wyłącznie do zapytania do api.stlouisfed.org (albo lokalnej atrapy w testach) i jest wycinany z komunikatów błędów.
// English: news sources: generators, parsers and HTTP clients (FRED, FF weekly feed, Fed JSON archives).
import { tr } from './i18n.mjs';
import {
  FRED_RELEASES, GDP_OVERRIDES, RULE_EVENTS, FOMC_MEETINGS, FOMC_EMERGENCY, FOMC_PRESS_EARLY, FOMC_PRESS_ALL_FROM, FOMC_PRESS_FIRST, FOMC_TIMES, FOMC_NAMES,
  FED_CHAIRS, HOLIDAY_PROFILES, DEFAULT_HOLIDAY_PROFILE, HOLIDAY_NAME, MOURNING_DAYS, HISTORY_FROM, FEED_URL, FRED_BASE, FED_ARCHIVE_BASE, FED_ARCHIVE_PATHS, pick,
  ISM_JANUARY_SECOND_FROM, TESTIMONY_TIME, TIC_EVENT, FED_ANNOUNCEMENT, FED_ROUTINE,
} from './news-katalog.mjs';
import { FF_WEIGHTS } from './news-wagi.mjs';

// Waga zdarzenia w dniu day: tabela wag zależnych od daty z próby FF (news-wagi.mjs) wygrywa z wagą domyślną z katalogu.
export const impOf = (spec, day) => pick(FF_WEIGHTS[spec.name] ?? spec.imp, day);
import {
  NewsError, makeEvent, makeAllDay, etToUtc, etDayOf, hhmm, dateStr, parseDay, nthWeekday, weekdayOf, dayNum, fromDayNum, weekBounds, weekLabel,
} from './news.mjs';

// ---------- dni wolne ----------
function easterDay(y) { // niedziela wielkanocna (Meeus/Jones/Butcher), numer dnia
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return dayNum(y, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
}
const profileOf = (p) => (typeof p === 'string' ? HOLIDAY_PROFILES[p] : p);
// Dni wolne roku y według profilu (nazwa z HOLIDAY_PROFILES albo obiekt): [{ day (numer dnia), note }] rosnąco.
// Święto stałe w sobotę → piątek (profil saturday:'friday'), w niedzielę → poniedziałek; Nowy Rok w sobotę przesuwa się na 31.12 POPRZEDNIEGO roku (dlatego
// liczymy też 1.01 roku y+1). Święta ruchome (poniedziałki, Thanksgiving, Good Friday) bez przesunięć.
export function holidaysUSD(y, profile = DEFAULT_HOLIDAY_PROFILE) {
  const p = profileOf(profile);
  if (!p) throw new Error(`news: nieznany profil świąt „${String(profile).slice(0, 30)}”`);
  const out = new Map();
  const add = (day, note) => { if (fromDayNum(day).y === y && !out.has(day)) out.set(day, note); };
  const fixed = (yy, mo, d, note, yearFrom, newYear = false) => {
    if (yearFrom && yy < yearFrom) return;
    const n = dayNum(yy, mo, d), wd = weekdayOf(n);
    // sobota: piątek wcześniej albo nic; saturdayFrom: od którego roku działa przesunięcie, saturdayNone: święta bez przesunięcia (profil ff, pakiet B)
    const satShift = newYear ? p.newYearSaturday : (p.saturdayNone || []).includes(note) || (p.saturdayFrom && yy < p.saturdayFrom) ? 'none' : p.saturday;
    if (wd === 6) { if (satShift === 'friday') add(n - 1, note); }
    else if (wd === 0) { if (p.sunday === 'monday') add(n + 1, note); }
    else add(n, note);
  };
  fixed(y, 1, 1, "New Year's Day", 0, true);
  fixed(y + 1, 1, 1, "New Year's Day", 0, true); // obserwacja w sobotę wypada 31.12 roku y
  fixed(y, 7, 4, 'Independence Day');
  fixed(y, 12, 25, 'Christmas Day');
  if (p.veterans) fixed(y, 11, 11, 'Veterans Day');
  if (p.juneteenth) fixed(y, 6, 19, 'Juneteenth', p.juneteenth);
  add(nthWeekday(y, 1, 1, 3), 'Martin Luther King Jr. Day');
  add(nthWeekday(y, 2, 1, 3), "Washington's Birthday");
  add(nthWeekday(y, 5, 1, -1), 'Memorial Day');
  add(nthWeekday(y, 9, 1, 1), 'Labor Day');
  if (p.columbus) add(nthWeekday(y, 10, 1, 2), 'Columbus Day');
  add(nthWeekday(y, 11, 4, 4), 'Thanksgiving Day');
  if (p.goodFriday) add(easterDay(y) - 2, 'Good Friday');
  if (p.mourning) for (const s of MOURNING_DAYS) { const n = parseDay(s); if (fromDayNum(n).y === y) add(n, 'National Day of Mourning'); }
  for (const s of p.extra || []) { const n = parseDay(s); if (fromDayNum(n).y === y) add(n, 'Market closure'); }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([day, note]) => ({ day, note }));
}
const holidaySets = new Map();
function holidaySet(profile, y) {
  const key = `${typeof profile === 'string' ? profile : JSON.stringify(profile)}|${y}`;
  if (!holidaySets.has(key)) holidaySets.set(key, new Set(holidaysUSD(y, profile).map((h) => h.day)));
  return holidaySets.get(key);
}
export const isClosedDay = (day, profile) => holidaySet(profile, fromDayNum(day).y).has(day);
const isBusinessDay = (day) => { const wd = weekdayOf(day); return wd >= 1 && wd <= 5 && !isClosedDay(day, 'federal'); };
// ISM i Chicago PMI: Good Friday liczy się jako dzień roboczy, ale publikacja, która wypadłaby w Good Friday, przechodzi na najbliższy dzień roboczy
// (FF: ISM usług 5.04.2010 i 5.04.2021, gdy Good Friday był 2. dniem roboczym; 6.04.2015 i 6.04.2026, gdy był 3.; Chicago PMI 28.03.2013).
const goodFridays = new Map();
const isGoodFriday = (day) => { const y = fromDayNum(day).y; if (!goodFridays.has(y)) goodFridays.set(y, easterDay(y) - 2); return goodFridays.get(y) === day; };
const nextRelease = (day, step) => { let d = day; while (!isBusinessDay(d) || isGoodFriday(d)) d += step; return d; };
// Dzień wolny dla przesunięć tygodniowych (ADP, zapasy ropy): święta federalne + dni żałoby (5.12.2018 przesunął ADP i ropę na czwartek).
const isOffDay = (day) => isClosedDay(day, 'federal') || MOURNING_DAYS.includes(dateStr(day));

// Bank Holiday jako zdarzenia całodniowe (waga 'holiday', szare).
export function holidayEvents(y, profile = DEFAULT_HOLIDAY_PROFILE) {
  return holidaysUSD(y, profile).map((h) => makeAllDay(h.day, { name: HOLIDAY_NAME, imp: 'holiday', kind: 'holiday', basis: 'calc', note: h.note }));
}

// ---------- OPEX ----------
// 3. piątek miesiąca; gdy giełda (NYSE) jest zamknięta, najbliższy wcześniejszy dzień otwarty (czwartek). Kwartalne: marzec, czerwiec, wrzesień, grudzień.
export function opexDays(y) {
  const out = [];
  for (let mo = 1; mo <= 12; mo++) {
    let d = nthWeekday(y, mo, 5, 3);
    while (isClosedDay(d, 'nyse') || weekdayOf(d) === 0 || weekdayOf(d) === 6) d--;
    out.push({ day: d, variant: mo % 3 === 0 ? 'quarterly' : 'monthly' });
  }
  return out;
}
export function opexEvents(y) {
  return opexDays(y).map((o) => makeAllDay(o.day, {
    name: o.variant === 'quarterly' ? 'Quarterly OPEX (triple witching)' : 'Monthly OPEX', imp: 'opex', kind: 'opex', basis: 'calc', variant: o.variant,
  }));
}

// ---------- FOMC ----------
const monthDay = (s) => { const [m, d] = s.split('-').map(Number); return [m, d]; };
function minutesDay(meeting) {
  const dec = parseDay(meeting.decision);
  if (!meeting.minutesMonthDay) return { day: dec + 21, basis: 'rule' };
  const [m, d] = monthDay(meeting.minutesMonthDay);
  let y = fromDayNum(dec).y, n = dayNum(y, m, d);
  if (n < dec) n = dayNum(y + 1, m, d);
  return { day: n, basis: 'fomc' };
}
// Godziny oświadczenia/konferencji wg daty posiedzenia (okres z tabeli w news-katalog.mjs).
export function fomcTimes(decision) {
  const pressEarly = FOMC_PRESS_EARLY.includes(decision);
  const press = decision >= FOMC_PRESS_ALL_FROM || (decision >= FOMC_PRESS_FIRST && (pressEarly || (decision >= FOMC_TIMES.pressNewFrom && /^(\d{4})-(03|06|09|12)-/.test(decision))));
  // przed 2013 konferencje i projekcje tylko z listy FOMC_PRESS_EARLY; reguła kwartalna od 2013 (po review: 21.09.2011, 13.12.2011 i 13.03.2012 bez konferencji)
  const sep = decision >= FOMC_PRESS_ALL_FROM ? /^(\d{4})-(03|06|09|12)-/.test(decision) : press;
  const statement = decision >= FOMC_TIMES.statementFrom ? FOMC_TIMES.statementNew : (pressEarly ? FOMC_TIMES.statementPressEarly : FOMC_TIMES.statementOld);
  const conference = decision >= FOMC_TIMES.pressNewFrom ? FOMC_TIMES.pressNew : FOMC_TIMES.pressOld;
  const projections = decision >= FOMC_TIMES.pressNewFrom ? statement : FOMC_TIMES.projectionsEarly;
  return { press, sep, statement, conference, projections };
}
export function fomcEvents() {
  const out = [];
  const ev = (day, time, name, extra = {}) => { const [h, m] = hhmm(time); out.push(makeEvent({ t: etToUtc(parseDay(day), h, m), name, imp: impOf({ name, imp: 'high' }, day), kind: 'fomc', basis: 'fomc', ...extra })); };
  for (const mt of FOMC_MEETINGS) {
    const x = fomcTimes(mt.decision);
    ev(mt.decision, x.statement, FOMC_NAMES.rate);
    ev(mt.decision, x.statement, FOMC_NAMES.statement);
    if (x.press) ev(mt.decision, x.conference, FOMC_NAMES.press);
    if (x.sep) ev(mt.decision, x.projections, FOMC_NAMES.projections); // 2011-2012: 14:00 (pakiet B: zgodne z FF na 4 posiedzeniach, flaga unverified zdjęta)
    const mi = minutesDay(mt);
    ev(dateStr(mi.day), FOMC_TIMES.minutes, FOMC_NAMES.minutes, { basis: mi.basis });
  }
  for (const e of FOMC_EMERGENCY) {
    ev(e.day, e.time, FOMC_NAMES.rate, { tentative: e.tentative });
    ev(e.day, e.time, FOMC_NAMES.statement, { tentative: e.tentative });
    if (e.press) ev(e.day, e.press, FOMC_NAMES.press, { tentative: e.tentative });
  }
  return out;
}

// ---------- reguły ----------
// Zdarzenia z reguł dla roku y. nfpDays: numery dni publikacji NFP z FRED (ADP = środa przed NFP). Brak NFP = brak ADP (nie zgadujemy).
export function ruleEvents(y, nfpDays = []) {
  const out = [];
  const at = (day, spec, { time, ...extra } = {}) => { const ds = dateStr(day), [h, m] = hhmm(pick(time ?? spec.time, ds)); out.push(makeEvent({ t: etToUtc(day, h, m), name: spec.name, imp: impOf(spec, ds), kind: 'data', basis: 'rule', ...extra })); };
  for (let mo = 1; mo <= 12; mo++) {
    const bd = [];
    for (let d = dayNum(y, mo, 1); bd.length < 4; d++) if (isBusinessDay(d)) bd.push(d);
    const shift = mo === 1 && y >= ISM_JANUARY_SECOND_FROM ? 1 : 0; // styczeń od 2018: 2. dzień roboczy
    at(nextRelease(bd[shift], 1), RULE_EVENTS.ismManufacturing); // 1. dzień roboczy
    at(nextRelease(bd[shift + 2], 1), RULE_EVENTS.ismServices); // 3. dzień roboczy
    at(nthWeekday(y, mo, 2, -1), RULE_EVENTS.consumerConfidence); // ostatni wtorek
    // 3. czwartek miesiąca także w styczniu. FRED rid 351 ma w każdym styczniu od 2016 dwie daty: 2. czwartek (osobna, coroczna publikacja) i 3. czwartek (indeks, 29.10.2026: 11 lat zgodnych z regułą)
    let philly = nthWeekday(y, mo, 4, 3);
    if (isOffDay(philly)) philly += 7; // dzień wolny: tydzień później
    at(philly, RULE_EVENTS.philly);
    let empire = dayNum(y, mo, 15);
    while (!isBusinessDay(empire)) empire++;
    at(empire, RULE_EVENTS.empire); // 15. albo następny dzień roboczy
    // Chicago PMI: ostatni dzień roboczy, ale nie 31.12 ani piątek po Thanksgiving (FF: 28.12.2018, 27.11.2019)
    const blackFriday = nthWeekday(y, 11, 4, 4) + 1;
    let last = (mo === 12 ? dayNum(y + 1, 1, 1) : dayNum(y, mo + 1, 1)) - 1;
    while (!isBusinessDay(last) || isGoodFriday(last) || last === blackFriday || (mo === 12 && fromDayNum(last).d === 31)) last--;
    at(last, RULE_EVENTS.chicago);
  }
  // zapasy ropy (EIA): środa 10:30; święto w poniedziałek albo w środę: czwartek 11:00; święto we wtorek: piątek 11:00 (piątkowe święto poprzedniego tygodnia nic nie zmienia: FF 8.07.2015, 16.11.2016)
  for (let w = nthWeekday(y, 1, 3, 1); fromDayNum(w).y === y; w += 7) {
    const off = (k) => isOffDay(w + k);
    if (off(-1)) at(w + 2, RULE_EVENTS.crude, { time: RULE_EVENTS.crude.delayedTime });
    else if (off(-2) || off(0)) at(w + 1, RULE_EVENTS.crude, { time: RULE_EVENTS.crude.delayedTime });
    else at(w, RULE_EVENTS.crude);
  }
  // wybory prezydenckie: cały dzień
  if (y % 4 === 0) { const d = nthWeekday(y, 11, 1, 1) + 1; out.push(makeAllDay(d, { name: RULE_EVENTS.election.name, imp: impOf(RULE_EVENTS.election, dateStr(d)), kind: 'data', basis: 'rule' })); }
  // Unemployment Claims: czwartek, w święto środa
  for (let d = nthWeekday(y, 1, 4, 1); fromDayNum(d).y === y; d += 7) at(isClosedDay(d, 'federal') ? d - 1 : d, RULE_EVENTS.claims);
  // ADP: środa przed NFP; gdy w tygodniu NFP przed środą (pon.-śr.) jest dzień wolny, czwartek (FF: 5.01.2012, 6.09.2012, 3.01.2013, 6.12.2018, 3.06.2021, 2.06.2022, 5.09.2024)
  for (const nfp of nfpDays) {
    if (fromDayNum(nfp).y !== y) continue;
    let w = nfp - 1;
    while (weekdayOf(w) !== 3) w--;
    const late = [w - 2, w - 1, w].some(isOffDay) && w + 1 < nfp;
    at(late ? w + 1 : w, RULE_EVENTS.adp);
  }
  return out;
}

// ---------- FRED → zdarzenia ----------
export function gdpKind(dateIso) {
  if (GDP_OVERRIDES[dateIso]) return GDP_OVERRIDES[dateIso];
  const mo = Number(dateIso.slice(5, 7));
  return ['advance', 'second', 'third'][(mo - 1) % 3];
}
// Uniwersytet Michigan: każda data FRED to odczyt końcowy (pakiet B). Odczyt wstępny = piątek tygodnia, w którym wypada „końcowy - 14 dni”.
export const umichKind = () => 'final';
export const umichPrelim = (finalDay) => { const d = finalDay - 14; return d + ((5 - weekdayOf(d) + 7) % 7); };
const splitKind = { gdp: gdpKind, umich: umichKind };
// Czyszczenie surowych dat FRED wg wzorca z katalogu (curate): FRED miesza prawdziwe publikacje z aktualizacjami rocznymi i rewizjami sezonowymi.
// perMonth: jedna data miesiąca (keep first|last), opcjonalnie tylko w wymienionych miesiącach; dropLate: odrzuć daty po minDay, gdy w miesiącu jest wcześniejsza (<= otherMaxDay);
// gdp: dzień >= minDay (w grudniu >= decMinDay), pierwsza taka data miesiąca, plus daty z include (wyjątki po shutdownach), bez exclude.
export function curateDates(spec, dates) {
  if (!spec) return dates;
  const day = (d) => Number(d.slice(8, 10)), mo = (d) => Number(d.slice(5, 7));
  const groups = new Map();
  for (const d of dates) { const k = d.slice(0, 7); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); }
  const out = [];
  for (const g of groups.values()) {
    if (spec.rule === 'perMonth') {
      if (spec.months && !spec.months.includes(mo(g[0]))) out.push(...g);
      else out.push(spec.keep === 'last' ? g[g.length - 1] : g[0]);
    } else if (spec.rule === 'dropLate') {
      const early = g.some((d) => day(d) <= spec.otherMaxDay);
      out.push(...g.filter((d) => day(d) < spec.minDay || !early));
    } else if (spec.rule === 'lateFirst') {
      out.push(...g.filter((d) => day(d) >= spec.minDay).slice(0, 1));
    } else if (spec.rule === 'gdp') {
      const base = g.filter((d) => !spec.include.includes(d) && !(spec.exclude || []).includes(d) && day(d) >= (mo(d) === 12 ? spec.decMinDay : spec.minDay));
      out.push(...g.filter((d) => spec.include.includes(d)), ...base.slice(0, 1));
    } else throw new Error(`news: nieznana reguła czyszczenia dat „${spec.rule}”`);
  }
  return out.sort();
}
// fredDates: { [rid]: ['RRRR-MM-DD', …] } (surowe daty FRED). Daty przed HISTORY_FROM są pomijane.
export function fredEvents(fredDates) {
  const out = [];
  for (const rel of FRED_RELEASES) {
    const push = (date, spec) => {
      if (date < HISTORY_FROM) return;
      const [h, m] = hhmm(pick(spec.time ?? rel.time, date));
      out.push(makeEvent({ t: etToUtc(parseDay(date), h, m), name: spec.name, imp: impOf(spec, date), kind: 'data', basis: 'fred' }));
    };
    for (const date of curateDates(rel.curate, fredDates?.[rel.rid] ?? [])) {
      const kind = rel.split ? splitKind[rel.split](date) : null;
      for (const spec of rel.events) {
        if (spec.when === 'prelim' && rel.split === 'umich') { push(dateStr(umichPrelim(parseDay(date))), spec); continue; }
        if (spec.when && spec.when !== kind) continue;
        push(date, spec);
      }
    }
  }
  return out;
}
const NFP_RID = 50;

// ---------- przemówienia i zeznania przewodniczącego Fed (z archiwów JSON Fed) ----------
export function chairOn(surname, dateIso) {
  return FED_CHAIRS.some((c) => c.name.toLowerCase() === surname.toLowerCase() && dateIso >= c.from && dateIso <= c.to);
}
// Tytuł mówcy → { role, who } dla przewodniczącego (Chair, Chairman, Chair Pro Tempore), inaczej null. „Vice Chair …”, „Governor …” odpadają.
export function chairOfSpeaker(s) {
  const m = /^(Chair|Chairman|Chairwoman)\b(?:\s+Pro\s+Tempore)?\s+(.+?)\s*$/i.exec(String(s ?? '').replace(/\s+/g, ' ').trim());
  if (!m) return null;
  const who = m[2].split(' ').filter(Boolean).pop();
  return who ? { role: m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), who } : null;
}
// Zeznania (testimony): archiwum Fed podaje czas publikacji tekstu (zwykle 8:00-9:30), a FF godzinę przesłuchania. Pakiet B: zeznania o TESTIMONY_TIME (10:00 ET)
// tego dnia, zgodne z FF na 6 z 8 obejrzanych zeznań (2 o 11:00). Przemówienia bez zmian (godzina z archiwum, nadal unverified).
export function speechEvents(items) {
  const out = [];
  for (const it of items || []) {
    const [th, tm] = hhmm(TESTIMONY_TIME);
    out.push(makeEvent({
      t: it.k === 'testimony' && it.timed !== false ? etToUtc(etDayOf(it.t), th, tm) : it.t, name: `${it.role || 'Chair'} ${it.who}: ${it.title}`.slice(0, 160), imp: 'high', kind: 'speech', basis: 'fed', unverified: true,
      tentative: it.timed === false, note: it.k === 'testimony' ? 'Testimony' : 'Speech',
    }));
  }
  return out;
}

// ---------- terminarze: TIC (Skarb USA) i komunikaty Fed poza posiedzeniami (pakiet B2) ----------
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Tabela Skarbu „TIC Press Releases -- by topic”: wiersze roczne „RRRR, release date: MM/DD MM/DD/RRRR …” (12 dat: dane za grudzień … styczeń, bez roku = rok danych,
// a grudzień i listopad publikowane w roku następnym) oraz lista najnowszych „MM/DD/RRRR TIC Data for <miesiąc> RRRR”. Literówkę roku w liście (publikacja przed
// miesiącem danych, np. 01/19/2023 za listopad 2023) poprawiamy na rok następny. Zwraca posortowane daty ISO od HISTORY_FROM.
export function parseTicSchedule(html) {
  const text = String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const out = new Set();
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let m;
  const rowRe = /(\d{4}), release date: ((?:\d{2}\/\d{2}(?:\/\d{4})? ?){12})/g;
  while ((m = rowRe.exec(text))) {
    const year = Number(m[1]);
    m[2].trim().split(' ').forEach((p, i) => {
      const [mm, dd, yy] = p.split('/').map(Number);
      const dataMonth = 12 - i;
      out.add(iso(yy || (dataMonth >= 11 ? year + 1 : year), mm, dd));
    });
  }
  const listRe = /(\d{2})\/(\d{2})\/(\d{4}) TIC Data for ([A-Z][a-z]+)(?: and [A-Z][a-z]+)? (\d{4})/g;
  while ((m = listRe.exec(text))) {
    const [mm, dd, yy, dataMon, dataYear] = [Number(m[1]), Number(m[2]), Number(m[3]), MONTHS_EN.indexOf(m[4]) + 1, Number(m[5])];
    const y = yy * 12 + mm <= dataYear * 12 + dataMon ? yy + 1 : yy;
    out.add(iso(y, mm, dd));
  }
  return [...out].filter((d) => d >= HISTORY_FROM && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
}
// Archiwum komunikatów prasowych Fed (JSON: d „MM/DD/RRRR h:mm:ss AM”, t tytuł, pt kategoria) → komunikaty o polityce pieniężnej poza terminarzem:
// kategoria Monetary Policy, bez rutynowych (FED_ROUTINE) i bez dni decyzji FOMC z katalogu. Jeden komunikat na (dzień, minutę). Zwraca [{ t, title }] od HISTORY_FROM.
export function fedAnnouncements(text) {
  let list;
  try { list = JSON.parse(String(text ?? '').replace(/^\uFEFF/, '').trim()); } catch { list = null; }
  if (!Array.isArray(list)) throw new NewsError(tr('Archiwum Fed: odpowiedź nie jest listą pozycji.'), 502, 'bad-archive');
  const decisions = new Set(FOMC_MEETINGS.map((x) => x.decision));
  const from = Date.parse(HISTORY_FROM + 'T00:00:00Z') / 1000;
  const byKey = new Map();
  for (const x of list) {
    if (x?.pt !== 'Monetary Policy' || typeof x.t !== 'string' || FED_ROUTINE.test(unent(x.t))) continue;
    const when = parseArchiveDate(x.d);
    if (!when?.timed || when.t < from || decisions.has(dateStr(etDayOf(when.t)))) continue;
    if (!byKey.has(when.t)) byKey.set(when.t, { t: when.t, title: unent(x.t).replace(/\s+/g, ' ').trim().slice(0, 140) });
  }
  return [...byKey.values()].sort((a, b) => a.t - b.t);
}
// Zdarzenia z terminarzy: { tic: ['RRRR-MM-DD'], fed: [{ t, title }] }.
export function scheduleEvents({ tic = [], fed = [] } = {}) {
  const out = [];
  for (const d of tic) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < HISTORY_FROM) continue;
    const [h, m] = hhmm(pick(TIC_EVENT.time, d));
    out.push(makeEvent({ t: etToUtc(parseDay(d), h, m), name: TIC_EVENT.name, imp: impOf(TIC_EVENT, d), kind: 'data', basis: 'schedule' }));
  }
  for (const a of fed) {
    if (!Number.isInteger(a?.t)) continue;
    out.push(makeEvent({ t: a.t, name: FED_ANNOUNCEMENT.name, imp: impOf(FED_ANNOUNCEMENT, dateStr(etDayOf(a.t))), kind: 'fomc', basis: 'fed', note: String(a.title || '').slice(0, 140) }));
  }
  return out;
}

// ---------- zestaw oficjalny ----------
// fredDates: daty FRED (plik dostarczony z wydaniem + odświeżenie kluczem użytkownika), speeches: zapisane pozycje archiwów Fed, profile: profil świąt, toYear: ostatni rok reguł.
export function buildOfficial({ fredDates = {}, speeches = [], schedules = {}, profile = DEFAULT_HOLIDAY_PROFILE, toYear } = {}) {
  const fromYear = Number(HISTORY_FROM.slice(0, 4));
  const last = toYear ?? new Date().getUTCFullYear() + 1;
  const nfp = curateDates(FRED_RELEASES.find((r) => r.rid === NFP_RID).curate, fredDates[NFP_RID] ?? []).filter((d) => d >= HISTORY_FROM).map(parseDay);
  const out = [...fredEvents(fredDates), ...fomcEvents(), ...speechEvents(speeches), ...scheduleEvents(schedules)];
  for (let y = fromYear; y <= last; y++) out.push(...holidayEvents(y, profile), ...opexEvents(y), ...ruleEvents(y, nfp));
  return out;
}

// ---------- feed FF (tydzień) ----------
const FF_IMP = { High: 'high', Medium: 'medium', Low: 'low', Holiday: 'holiday' };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
// Parsuje tablicę z feedu (title, country, date z offsetem, impact). Zwraca { week: { label, start, end }, events (tylko USD), skipped }.
// Całodniowe: waga Holiday. „Tentative”: godzina dokładnie 00:00 ET przy zdarzeniu innym niż święto (feed nie ma osobnego pola, WYWNIOSKOWANE); t = północ ET.
// Rzuca NewsError('bad-feed'), gdy odpowiedź nie jest niepustą tablicą z czytelnymi datami.
export function parseFeed(json) {
  if (!Array.isArray(json) || !json.length) throw new NewsError(tr('Feed newsów: odpowiedź nie jest niepustą listą zdarzeń.'), 502, 'bad-feed');
  const times = [];
  for (const it of json) { const ms = Date.parse(it?.date); if (Number.isFinite(ms)) times.push(Math.floor(ms / 1000)); }
  if (!times.length) throw new NewsError(tr('Feed newsów: żadne zdarzenie nie ma czytelnej daty.'), 502, 'bad-feed');
  const week = weekBounds(etDayOf(median(times)));
  const events = [];
  let skipped = 0;
  for (const it of json) {
    const ms = Date.parse(it?.date);
    if (it?.country !== 'USD' || typeof it?.title !== 'string' || !it.title.trim() || !Number.isFinite(ms)) { if (it?.country === 'USD') skipped++; continue; }
    const t = Math.floor(ms / 1000);
    if (t < week.start || t >= week.end) { skipped++; continue; } // zdarzenie spoza tygodnia feedu nie wchodzi do pliku tygodnia
    // nieznana waga = zmiana formatu feedu: odpowiedź odrzucamy w całości (bez zapisu tygodnia i bez zastępowania danych oficjalnych)
    if (!Object.hasOwn(FF_IMP, it.impact)) throw new NewsError(tr('Feed newsów: nieznana waga zdarzenia „{imp}”. Format feedu mógł się zmienić.', { imp: String(it.impact).slice(0, 20) }), 502, 'bad-feed');
    const imp = FF_IMP[it.impact];
    const midnight = etToUtc(etDayOf(t), 0, 0);
    const allDay = imp === 'holiday';
    const tentative = !allDay && t === midnight;
    events.push(makeEvent({ t: allDay || tentative ? midnight : t, name: it.title.slice(0, 160), imp, kind: allDay ? 'holiday' : 'data', src: 'ff', basis: 'feed', allDay, tentative }));
  }
  if (!events.length) throw new NewsError(tr('Feed newsów: w odpowiedzi nie ma żadnego zdarzenia USD z bieżącego tygodnia.'), 502, 'bad-feed');
  return { week: { label: weekLabel(week.startDay), start: week.start, end: week.end }, events, skipped };
}

// ---------- archiwa Fed ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const unent = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
// Pole d archiwum: „10/14/2026 10:55:00 PM” (czas ET) albo samo „8/22/2008” (stare pozycje bez godziny). Zwraca { t, timed } albo null.
export function parseArchiveDate(d) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM))?$/i.exec(String(d ?? '').trim());
  if (!m) return null;
  const [mo, da, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const n = dayNum(y, mo, da);
  if (mo < 1 || mo > 12 || fromDayNum(n).d !== da) return null;
  if (!m[4]) return { t: etToUtc(n, 0, 0), timed: false };
  let h = Number(m[4]) % 12;
  if (m[6].toUpperCase() === 'PM') h += 12;
  if (Number(m[4]) < 1 || Number(m[4]) > 12 || Number(m[5]) > 59) return null;
  return { t: etToUtc(n, h, Number(m[5])), timed: true };
}
// Dwa pliki archiwum (przemówienia, zeznania) → pozycje przewodniczącego od HISTORY_FROM: [{ t, timed, title, who, role, k, link }].
// Plik zaczyna się od BOM i pustych linii. Zwraca też liczbę pozycji ogółem i pominiętych (nieczytelna data).
export function parseFedArchives({ speech, testimony }) {
  const out = [];
  let total = 0, skipped = 0;
  const from = Date.parse(HISTORY_FROM + 'T00:00:00Z') / 1000;
  for (const [k, text] of [['speech', speech], ['testimony', testimony]]) {
    let list;
    try { list = JSON.parse(String(text ?? '').replace(/^\uFEFF/, '').trim()); } catch { list = null; }
    if (!Array.isArray(list)) throw new NewsError(tr('Archiwum Fed: odpowiedź nie jest listą pozycji.'), 502, 'bad-archive');
    for (const x of list) {
      total++;
      const chair = chairOfSpeaker(x?.s);
      if (!chair) continue;
      const when = parseArchiveDate(x.d);
      if (!when || typeof x.t !== 'string' || typeof x.l !== 'string' || !x.t.trim()) { skipped++; continue; }
      if (when.t < from) continue;
      out.push({ t: when.t, timed: when.timed, title: unent(x.t).replace(/\s+/g, ' ').trim().slice(0, 140), ...chair, k, link: x.l.slice(0, 200) });
    }
  }
  return { items: out.sort((a, b) => a.t - b.t || (a.link < b.link ? -1 : 1)), total, skipped };
}

// ---------- klienci HTTP ----------
const isLoopback = (u) => u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
// Adres tylko z listy hostów (https) albo pętla zwrotna (atrapa testowa): dane i klucz nie wyjdą na obcy adres nawet z błędnej zmiennej środowiskowej.
export function checkHost(url, hosts) {
  let u;
  try { u = new URL(url); } catch { return false; }
  return (u.protocol === 'https:' && hosts.includes(u.hostname)) || isLoopback(u);
}
// Retry-After: sekundy albo data HTTP; zwraca sekundy (0..86400) albo null.
export function parseRetryAfter(v, nowMs = Date.now()) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  const sec = /^\d+$/.test(s) ? Number(s) : Math.ceil((Date.parse(s) - nowMs) / 1000);
  return Number.isFinite(sec) ? Math.min(Math.max(sec, 0), 86400) : null;
}
const isTimeout = (e) => e?.name === 'TimeoutError' || e?.name === 'AbortError';
// Błędy sprzed wysłania żądania (brak połączenia, nieznana nazwa): serwer źródła zapytania nie zobaczył, więc wolno ponowić szybko (preSend). Timeout, przekierowanie,
// zerwane połączenie i reszta mogły dotrzeć do źródła, więc liczą się jak normalne zapytanie (pełny odstęp).
const PRE_SEND = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN']);
// Limity rozmiaru odpowiedzi (bajty): feed 1 MB, FRED 2 MB, Finnhub 2 MB, archiwa Fed 5 MB na plik, SEC 12 MB.
export const MAX_BYTES = Object.freeze({ feed: 1 << 20, fred: 2 << 20, finnhub: 2 << 20, fed: 5 << 20, sec: 12 << 20, error: 64 << 10 });
// Treść odpowiedzi strumieniem z twardym limitem: od razu odrzuca po nagłówku content-length, a bez niego przerywa czytanie po przekroczeniu limitu.
export async function readCapped(res, maxBytes, label = 'Źródło') {
  const tooBig = () => new NewsError(tr('Odpowiedź {src} jest zbyt duża (limit {mb} MB).', { src: label, mb: Number((maxBytes / 1048576).toFixed(1)) }), 502, 'too-big');
  const len = Number(res.headers?.get?.('content-length'));
  if (Number.isFinite(len) && len > maxBytes) { try { await res.body?.cancel?.(); } catch { /* już zamknięte */ } throw tooBig(); }
  const reader = res.body?.getReader?.();
  if (!reader) { const t = await res.text(); if (Buffer.byteLength(t) > maxBytes) throw tooBig(); return t; }
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { try { await reader.cancel(); } catch { /* już zamknięte */ } throw tooBig(); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
// JSON z odpowiedzi z limitem; nieczytelna treść daje null (limit rzuca błąd too-big).
export async function readJsonCapped(res, maxBytes, label) {
  const text = await readCapped(res, maxBytes, label);
  try { return JSON.parse(text); } catch { return null; }
}

export async function httpGet(url, { fetchImpl, headers, timeoutMs, scrub, label }) {
  let res;
  try { res = await fetchImpl(url, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) }); }
  catch (e) {
    const timeout = isTimeout(e);
    throw new NewsError(timeout
      ? tr('{src} nie odpowiada (przekroczono czas {sec} s). Spróbuj za chwilę.', { src: label, sec: Math.round(timeoutMs / 1000) })
      : tr('Nie można połączyć się z {src}. Sprawdź połączenie z internetem; dane z pamięci podręcznej nadal działają.', { src: label }), 504, timeout ? 'timeout' : 'network',
    { preSend: !timeout && PRE_SEND.has(e?.cause?.code ?? e?.code) });
  }
  if (!res.ok) {
    const s = res.status;
    let detail = '';
    try { detail = scrub(String(JSON.parse(await readCapped(res, MAX_BYTES.error, label))?.error_message ?? '')).slice(0, 160); } catch { /* brak treści albo za duża */ }
    if (s === 429) throw new NewsError(tr('{src}: za dużo żądań (429). Następna próba po czasie podanym przez serwer.', { src: label }), 429, 'rate-limit', { retryAfterSec: parseRetryAfter(res.headers?.get?.('retry-after')) });
    if ((s === 401 || s === 403) && label === 'Finnhub') throw new NewsError(tr('Finnhub odrzucił klucz ({status}): klucz jest błędny albo nie ma dostępu do tego zapytania.', { status: s }), 502, 'bad-key', { upstream: s });
    if (s === 400 && label === 'FRED') throw new NewsError(tr('FRED odrzucił zapytanie (400): klucz jest błędny albo wygasł. {detail}', { detail }), 502, 'bad-key', { upstream: s });
    throw new NewsError(tr('{src}: błąd {status}. {detail}', { src: label, status: s, detail }), 502, 'upstream', { upstream: s });
  }
  return res;
}

// Klient FRED: tylko fred/release/dates (daty publikacji wydań, w tym ogłoszone przyszłe). opts: { key, base, fetchImpl, timeoutMs }.
export function createFred({ key, base = process.env.FRED_API_BASE || FRED_BASE, fetchImpl = globalThis.fetch, timeoutMs = 30_000 } = {}) {
  const baseUrl = String(base).replace(/\/$/, '');
  const scrub = (s) => (key ? String(s).split(key).join('***') : String(s));
  return {
    hasKey: !!key,
    async releaseDates(rid) {
      if (!Number.isInteger(rid) || rid < 1 || rid > 99999) throw new NewsError(tr('Zły identyfikator wydania FRED: {rid}.', { rid: String(rid).slice(0, 12) }), 400, 'bad-rid');
      if (!key) throw new NewsError(tr('Brak klucza FRED. Wpisz go w Ustawieniach → Wykresy → Newsy.'), 409, 'no-key');
      if (!checkHost(baseUrl, ['api.stlouisfed.org'])) throw new NewsError(tr('FRED: adres usługi musi być api.stlouisfed.org (ustawiono: {base}).', { base: scrub(baseUrl).slice(0, 60) }), 500, 'bad-base');
      const qs = new URLSearchParams({ release_id: String(rid), file_type: 'json', include_release_dates_with_no_data: 'true', sort_order: 'asc', limit: '10000', api_key: key });
      const res = await httpGet(`${baseUrl}/fred/release/dates?${qs}`, { fetchImpl, headers: { Accept: 'application/json' }, timeoutMs, scrub, label: 'FRED' });
      const j = await readJsonCapped(res, MAX_BYTES.fred, 'FRED');
      if (!Array.isArray(j?.release_dates)) throw new NewsError(tr('FRED: nieczytelna odpowiedź dla wydania {rid}.', { rid }), 502, 'bad-reply');
      const dates = new Set();
      for (const r of j.release_dates) if (/^\d{4}-\d{2}-\d{2}$/.test(r?.date)) dates.add(r.date);
      return [...dates].sort();
    },
  };
}

// Klient feedu tygodnia FF. Jedyny adres: FEED_URL (albo atrapa na pętli zwrotnej w testach). userAgent: nazwa aplikacji i wersja.
export function createFeedClient({ url = process.env.THQ_NEWS_FEED_URL || FEED_URL, fetchImpl = globalThis.fetch, userAgent = 'JustJournal', timeoutMs = 30_000 } = {}) {
  return {
    async fetchWeek() {
      if (!checkHost(url, ['nfs.faireconomy.media'])) throw new NewsError(tr('Feed newsów: adres musi być nfs.faireconomy.media (ustawiono: {base}).', { base: String(url).slice(0, 60) }), 500, 'bad-base');
      const res = await httpGet(url, { fetchImpl, headers: { Accept: 'application/json', 'User-Agent': userAgent }, timeoutMs, scrub: String, label: 'Feed' });
      return parseFeed(await readJsonCapped(res, MAX_BYTES.feed, 'Feed'));
    },
  };
}

// Klient archiwów Fed (przemówienia i zeznania, JSON). Odpowiedź każdego pliku ograniczona do 5 MB. Zwraca wynik parseFedArchives.
export function createFedArchiveClient({ base = process.env.FED_ARCHIVE_BASE || FED_ARCHIVE_BASE, fetchImpl = globalThis.fetch, userAgent = 'JustJournal', timeoutMs = 60_000 } = {}) {
  const root = String(base).replace(/\/$/, '');
  return {
    async fetchItems() {
      if (!checkHost(root, ['www.federalreserve.gov'])) throw new NewsError(tr('Archiwum Fed: adres musi być www.federalreserve.gov (ustawiono: {base}).', { base: root.slice(0, 60) }), 500, 'bad-base');
      const texts = {};
      for (const k of ['speech', 'testimony']) {
        const res = await httpGet(root + FED_ARCHIVE_PATHS[k], { fetchImpl, headers: { Accept: 'application/json', 'User-Agent': userAgent }, timeoutMs, scrub: String, label: 'Fed' });
        texts[k] = await readCapped(res, MAX_BYTES.fed, 'Fed');
      }
      return parseFedArchives(texts);
    },
  };
}
