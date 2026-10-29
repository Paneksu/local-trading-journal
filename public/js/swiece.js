// Interwały, sesja CME i agregacja świec. Czysty moduł (bez DOM, bez I/O): używają go serwer i przeglądarka.
// Świeca to tablica [t, o, h, l, c, v], t = sekundy epoki UTC początku świecy; skala ceny nie ma znaczenia.
// Sesja CME (futures ES/NQ): otwarcie 17:00 America/Chicago, zamknięcie 16:00 następnego dnia, przerwa 16:00-17:00,
// tydzień od niedzieli 17:00 do piątku 16:00. Świeca zaczyna się w sessionOpen + k × tf i nie przechodzi przez koniec sesji
// (ostatnia bywa krótsza). Brak świec bazowych = brak świecy w agregacie (żadnych sztucznych).
// P37 (28.10.2026), słowa użytkownika: «ma działać naprawdę wszystko przez pełny okres wszystkich lat»: do jesieni 2015 ES i NQ handlowały po 16:00
// (ES/NQ z danych 1m: 2010-2012 do 16:29, 2013-2015 do 16:14), więc sesje otwarte przed niedzielą 20.09.2015 17:00 trwają do 17:00 następnego dnia
// (cała godzina 16:xx należy do sesji). Ostatnia taka sesja: otwarta w czwartek 17.09.2015, zamknięta w piątek 18.09.2015 (ostatnie świece 16:14);
// pierwsza sesja bez handlu po 16:00 otwarła się w niedzielę 20.09.2015, w danych pierwszy poniedziałek bez świec 16:xx to 21.09.2015.
// English: pure interval parser, CME session bounds and candle aggregation (anchored at the 17:00 CT session open).

const TZ = 'America/Chicago';
const OPEN_H = 17, CLOSE_H = 16;
// Pierwszy dzień otwarcia (niedziela 20.09.2015) sesji zamykanej już o 16:00; wcześniejsze sesje trwają do 17:00 (handel po 16:00, patrz nagłówek).
export const SHORT_SESSIONS_FROM = Math.round(Date.UTC(2015, 8, 20) / 86400000);
export const sessionCloseHour = (day) => (day < SHORT_SESSIONS_FROM ? OPEN_H : CLOSE_H);
const UNIT_SEC = { s: 1, m: 60, h: 3600 };

// Interwał: ^(\d{1,4})(s|m|h|D|W|M)$, co najmniej 1 s (m = minuta, M = miesiąc). Zwraca { n, unit, sec, str } albo null.
// sec dla D, W i M to nominalna doba/tydzień/30 dni (tylko informacyjnie): granice liczy sessionBounds.
// P27 (28.10.2026), słowa użytkownika: «plus dodaj timeframe tygodniowy i miesieczny»: jednostka M (miesiąc wg sesji CME, patrz aggregate).
export function parseTf(str) {
  if (typeof str !== 'string') return null;
  const m = /^(\d{1,4})(s|m|h|D|W|M)$/.exec(str);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1) return null;
  const unit = m[2];
  const sec = unit === 'D' ? n * 86400 : unit === 'W' ? n * 604800 : unit === 'M' ? n * 2592000 : n * UNIT_SEC[unit];
  return { n, unit, sec, str };
}

// Źródło agregacji: '1m', gdy interwał jest wielokrotnością 60 s (13m, 2h, 1D, 1W, 1M); w pozostałych przypadkach '1s' (7s, 45s, 90s).
export function pickSource(tf) {
  const p = typeof tf === 'string' ? parseTf(tf) : tf;
  if (!p) return null;
  return p.unit === 'D' || p.unit === 'W' || p.unit === 'M' || p.sec % 60 === 0 ? '1m' : '1s';
}

// P55 (29.10.2026), słowa użytkownika: «wykres powinien dzialac w taki sposob ze jak sa sekundowki to wciaz sa dane na wykresie z minutowek … podzielic na
// pol minutowke i wtedy jest 30s i analogicznie inne», wybór «Ścieżka O→L→H→C»: świeca 1m dzielona na części po ścieżce cen open → pierwsze ekstremum →
// drugie ekstremum → close (wzrostowa C ≥ O: najpierw dołek, spadkowa: najpierw szczyt, jak Bar Magnifier w TradingView), każdy odcinek ścieżki trwa 20 s,
// interpolacja liniowa. Część = open ścieżki na początku, close na końcu, high/low = max/min ścieżki w jej przedziale (z ekstremami wewnątrz). Wolumen dzielony
// równo (reszta z dzielenia do pierwszych części, suma zachowana). Ceny w groszach (liczby całkowite), jak świece bazowe. Wynik: [t, o, h, l, c, v, 1], gdzie
// 1 oznacza świecę syntetyczną. step musi dzielić 60 (1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 60), inaczej null.
export function splitMinute(bar, step) {
  if (!Number.isInteger(step) || step < 1 || step > 60 || 60 % step !== 0) return null;
  const [t, o, h, l, c, v] = bar;
  const up = c >= o, pv = [o, up ? l : h, up ? h : l, c];
  const at = (s) => { const i = s >= 40 ? 2 : s >= 20 ? 1 : 0; return Math.round(pv[i] + ((pv[i + 1] - pv[i]) * (s - i * 20)) / 20); };
  const parts = 60 / step, vol = Number.isFinite(v) ? v : 0, base = Math.floor(vol / parts), rem = vol - base * parts;
  const out = [];
  for (let j = 0; j < parts; j++) {
    const a = j * step, b = a + step, op = at(a), cl = at(b);
    let hi = Math.max(op, cl), lo = Math.min(op, cl);
    for (const k of [1, 2]) if (a < k * 20 && k * 20 < b) { hi = Math.max(hi, pv[k]); lo = Math.min(lo, pv[k]); } // ekstrema wewnątrz części
    out.push([t + a, op, hi, lo, cl, base + (j < rem ? 1 : 0), 1]);
  }
  return out;
}

// ---- czas ścienny Chicago ----
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
function wall(tSec) {
  const o = {};
  for (const p of fmt.formatToParts(new Date(tSec * 1000))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { y: o.year, mo: o.month, d: o.day, h: o.hour, mi: o.minute };
}
// Dzień kalendarzowy ↔ liczba dni od 1970-01-01 (UTC); dzień tygodnia 0 = niedziela.
export const dayNum = (y, mo, d) => Math.round(Date.UTC(y, mo - 1, d) / 86400000);
export const fromDayNum = (n) => { const x = new Date(n * 86400000); return { y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate() }; };
export const weekdayOf = (n) => (((n + 4) % 7) + 7) % 7; // 1970-01-01 to czwartek (4)
// Epoka UTC chwili h:00 czasu Chicago w danym dniu (godziny 16 i 17 nie mają dwuznaczności DST: zmiany są o 2:00).
export function chicagoEpoch(n, h) {
  const { y, mo, d } = fromDayNum(n);
  const base = Date.UTC(y, mo - 1, d, h) / 1000;
  for (const off of [6 * 3600, 5 * 3600]) {
    const c = base + off, w = wall(c);
    if (w.h === h && w.mi === 0 && dayNum(w.y, w.mo, w.d) === n) return c;
  }
  throw new Error('chicagoEpoch: brak godziny ' + h + ' w dniu ' + n);
}

// Sesja zawierająca chwilę tSec: { open, close, day } (sekundy UTC; day = numer dnia otwarcia w Chicago) albo null
// (przerwa 16:00-17:00, sobota, niedziela przed 17:00, piątek po 16:00).
export function sessionBounds(tSec) {
  const w = wall(tSec);
  const min = w.h * 60 + w.mi;
  const today = dayNum(w.y, w.mo, w.d);
  let day;
  if (min >= OPEN_H * 60) day = today;
  else if (min < CLOSE_H * 60) day = today - 1;
  else { day = today - 1; if (day >= SHORT_SESSIONS_FROM) return null; } // 16:00-16:59: przerwa, ale przed 20.09.2015 jeszcze handel (P37)
  if (weekdayOf(day) > 4) return null; // sesje otwierają się od niedzieli (0) do czwartku (4)
  return sessionOf(day);
}
// Sesja otwarta w dniu `day` (numer dnia w Chicago): { open, close, day }.
export function sessionOf(day) {
  return { open: chicagoEpoch(day, OPEN_H), close: chicagoEpoch(day + 1, sessionCloseHour(day)), day };
}

// Otwarcie tygodnia (niedziela 17:00 Chicago) dla sesji otwartej w dniu `day`, plus numer tygodnia liczony od 1970-01-04 (niedziela).
function weekOf(day) {
  const sun = day - weekdayOf(day);
  return { open: chicagoEpoch(sun, OPEN_H), idx: (sun - 3) / 7 };
}
const weekStart = (idx) => chicagoEpoch(idx * 7 + 3, OPEN_H);
// P27 (28.10.2026): miesiąc = sesje, których dzień handlowy (dzień zamknięcia, czyli dzień otwarcia + 1) leży w danym miesiącu kalendarzowym.
// Numer miesiąca liczony od 1970-01 (0); początek świecy to otwarcie pierwszej sesji miesiąca (niedziela-czwartek 17:00 Chicago przed pierwszym dniem roboczym).
export function monthOfSession(day) {
  const { y, mo } = fromDayNum(day + 1);
  return (y - 1970) * 12 + (mo - 1);
}
export function monthStart(idx) {
  const y = 1970 + Math.floor(idx / 12), mo = (idx % 12) + 1;
  let d = dayNum(y, mo, 1);
  while (weekdayOf(d) === 0 || weekdayOf(d) === 6) d++; // pierwszy dzień handlowy pon-pt
  return chicagoEpoch(d - 1, OPEN_H);
}

// Agregacja posortowanych rosnąco świec bazowych (1s albo 1m, patrz pickSource) do interwału tf (tekst albo wynik parseTf).
// Zły interwał → null. Świece bazowe poza sesją (przerwa, weekend) są pomijane.
// 1D = jedna sesja (nD: n kolejnych dni kalendarzowych otwarcia), 1W = sesje od otwarcia tygodnia (nW: n tygodni od niedzieli 1970-01-04),
// 1M = sesje dnia handlowego w miesiącu kalendarzowym (nM: n miesięcy od 1970-01).
export function aggregate(bars, tf) {
  const p = typeof tf === 'string' ? parseTf(tf) : tf;
  if (!p) return null;
  const out = [];
  let cur = null, sess = null, curKey = null;
  for (const b of bars) {
    const t = b[0];
    if (!sess || t < sess.open || t >= sess.close) {
      sess = sessionBounds(t);
      if (sess && p.unit === 'W') sess.week = weekOf(sess.day);
    }
    if (!sess) continue;
    let start, key;
    if (p.unit === 'D') {
      key = Math.floor(sess.day / p.n);
      start = p.n === 1 ? sess.open : (cur && curKey === key ? cur[0] : sess.open); // nD: początek = pierwsza sesja grupy obecna w danych
    } else if (p.unit === 'W') {
      key = Math.floor(sess.week.idx / p.n);
      start = p.n === 1 ? sess.week.open : weekStart(key * p.n);
    } else if (p.unit === 'M') {
      key = Math.floor(monthOfSession(sess.day) / p.n);
      start = monthStart(key * p.n);
    } else {
      start = sess.open + Math.floor((t - sess.open) / p.sec) * p.sec;
      key = start;
    }
    if (cur && curKey === key) {
      if (b[2] > cur[2]) cur[2] = b[2];
      if (b[3] < cur[3]) cur[3] = b[3];
      cur[4] = b[4];
      cur[5] += b[5];
    } else {
      cur = [start, b[1], b[2], b[3], b[4], b[5]];
      curKey = key;
      out.push(cur);
    }
  }
  return out;
}

// ---- Nakładki wykresu (etap 10, pakiet F): tło sesji i PDH/PDL ----
// Czyste funkcje wspólne dla podglądu SVG (podglad.js) i trybu edycji LWC (wykres.js). Okna sesji są stałe w czasie America/New_York (P8),
// więc są tymi samymi chwilami bez względu na strefę osi (strefa osi z Ustawień zmienia tylko opisy, nie położenie pasów).
// Zmiana godzin pojawi się w Ustawieniach (etap 14): funkcje biorą definicje jako parametr.
export const SESSION_TZ = 'America/New_York';
// from/to w czasie NY; to <= from oznacza przejście przez północ (Azja 20:00-00:00).
export const SESSIONS = [
  { id: 'asia', from: '20:00', to: '00:00' },
  { id: 'london', from: '02:00', to: '05:00' },
  { id: 'ny', from: '09:30', to: '16:00' },
];
const nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: SESSION_TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
function nyWall(tSec) {
  const o = {};
  for (const p of nyFmt.formatToParts(new Date(tSec * 1000))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { y: o.year, mo: o.month, d: o.day, h: o.hour, mi: o.minute };
}
// Epoka UTC chwili h:mi czasu NY w dniu n. Godzina, której nie ma (2:00-3:00 w dniu zmiany na czas letni), przechodzi na czas zimowy (jak 3:00 letnie).
function nyEpoch(n, h, mi) {
  const { y, mo, d } = fromDayNum(n);
  const base = Date.UTC(y, mo - 1, d, h, mi) / 1000;
  for (const off of [5 * 3600, 4 * 3600]) {
    const c = base + off, w = nyWall(c);
    if (w.h === h && w.mi === mi && dayNum(w.y, w.mo, w.d) === n) return c;
  }
  return base + 5 * 3600;
}
const hm = (s) => { const [h, m] = s.split(':').map(Number); return [h, m]; };

// Okna sesji zachodzące na [fromSec, toSec): [{ id, from, to }] (sekundy UTC), posortowane po początku.
export function sessionWindows(fromSec, toSec, defs = SESSIONS) {
  if (!(toSec > fromSec)) return [];
  const w0 = nyWall(fromSec), w1 = nyWall(toSec);
  const n0 = dayNum(w0.y, w0.mo, w0.d) - 1, n1 = dayNum(w1.y, w1.mo, w1.d);
  const out = [];
  for (let n = n0; n <= n1; n++) {
    for (const s of defs) {
      const [h0, m0] = hm(s.from), [h1, m1] = hm(s.to);
      const a = nyEpoch(n, h0, m0);
      const b = h1 * 60 + m1 > h0 * 60 + m0 ? nyEpoch(n, h1, m1) : nyEpoch(n + 1, h1, m1);
      if (b > fromSec && a < toSec) out.push({ id: s.id, from: a, to: b });
    }
  }
  return out.sort((x, y) => x.from - y.from);
}
// Pierwszy indeks świecy z czasem >= t (times posortowane rosnąco).
function lowerBound(times, t) {
  let lo = 0, hi = times.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < t) lo = m + 1; else hi = m; }
  return lo;
}
// Pasy tła sesji jako zakresy indeksów świec: [{ id, a, b }] (a..b włącznie). Okno bez świec jest pomijane (oś po indeksie nie ma dla niego miejsca).
export function sessionSpans(times, windows) {
  const out = [];
  for (const w of windows) {
    const a = lowerBound(times, w.from), b = lowerBound(times, w.to) - 1;
    if (a < times.length && b >= a) out.push({ id: w.id, from: w.from, to: w.to, a, b });
  }
  return out;
}

// ---- P32 (28.10.2026): box sesji, linie high/low i sweep ----
// Słowa użytkownika: «zmien na to ze tworzysz boxa w rangu sesji oraz z high/low wychodza linie z opisem. kiedy te high/low jest sweepniete powinno sie konczyc,
// tak samo pdh/pdl powinno sie konczyc po sweepie». Jedna implementacja dla podglądu SVG i edytora LWC: tu tylko indeksy świec i ceny, piksele liczy renderer.
// Sweep = pierwsza świeca, której cena wychodzi POZA poziom (high > H albo low < L; samo dotknięcie to nie sweep).
export function sweepIndex(candles, from, price, side, to = candles.length - 1) {
  for (let i = Math.max(0, from); i <= to && i < candles.length; i++) {
    const c = candles[i];
    if (side === 'hi' ? c[2] > price : c[3] < price) return i;
  }
  return -1;
}
// candles: [t,o,h,l,c,v]; windows: sessionWindows(…); pd: wynik pdhlSpans(…) albo []. sweep: czy linia kończy się na sweepie.
// Wynik: { boxes: [{ id, a, b, hi, lo }], lines: [{ kind: 'sess'|'pd', id, side: 'hi'|'lo', price, x0, x1, swept, sweep }] }, gdzie x0 i x1 to
// pozycje w indeksach świec (ułamkowe: ±0,5 = krawędź świecy), więc oba renderery stawiają je tą samą skalą indeksu.
// Linia sesji wychodzi z prawej krawędzi boxa i biegnie do świecy sweepu (jej środek) albo do prawej krawędzi danych (bez sweepu).
// PDH/PDL biegną od początku sesji, której dotyczą, do świecy sweepu albo do końca tej sesji (następnego dnia to już nie jest „poprzedni dzień”).
export function overlayLevels(candles, { windows = [], pd = [], sweep = true } = {}) {
  const n = candles?.length || 0, boxes = [], lines = [];
  if (!n) return { boxes, lines };
  const times = candles.map((c) => c[0]);
  for (const sp of sessionSpans(times, windows)) {
    let hi = -Infinity, lo = Infinity;
    for (let i = sp.a; i <= sp.b; i++) { if (candles[i][2] > hi) hi = candles[i][2]; if (candles[i][3] < lo) lo = candles[i][3]; }
    boxes.push({ id: sp.id, a: sp.a, b: sp.b, hi, lo });
    for (const [side, price] of [['hi', hi], ['lo', lo]]) {
      const k = sweep ? sweepIndex(candles, sp.b + 1, price, side) : -1;
      lines.push({ kind: 'sess', id: sp.id, side, price, x0: sp.b + 0.5, x1: k >= 0 ? k : n - 0.5, swept: k >= 0, sweep: k });
    }
  }
  for (const sp of pd || []) {
    for (const [side, price] of [['hi', sp.hi], ['lo', sp.lo]]) {
      const k = sweep ? sweepIndex(candles, sp.a, price, side, sp.b) : -1;
      lines.push({ kind: 'pd', id: 'pd', side, price, x0: sp.a - 0.5, x1: k >= 0 ? Math.max(k, sp.a - 0.5) : sp.b + 0.5, swept: k >= 0, sweep: k });
    }
  }
  return { boxes, lines };
}

// Poprzednia sesja CME względem chwili tSec: sesja przed tą, w której leży tSec (poniedziałek po weekendzie wskazuje sesję otwartą w czwartek,
// bo piątkowej sesji nie ma); w przerwie 16:00-17:00 i w weekend: ostatnia zamknięta. Zwraca { open, close, day }.
export function previousSession(tSec) {
  const cur = sessionBounds(tSec);
  let day;
  if (cur) day = cur.day - 1;
  else { const w = wall(tSec); day = dayNum(w.y, w.mo, w.d) - 1; } // przerwa i weekend: sesja otwarta poprzedniego dnia kalendarzowego (albo wcześniej) właśnie się zamknęła
  while (weekdayOf(day) > 4) day--;
  return sessionOf(day);
}

// Części zakresów `ranges` ([a, b)) leżące w [from, to), których nie pokrywa `covered` (obie listy posortowane, bez nakładania).
function uncovered(from, to, ranges, covered) {
  let out = [];
  for (const [a0, b0] of ranges) { const a = Math.max(a0, from), b = Math.min(b0, to); if (b > a) out.push([a, b]); }
  for (const [ca, cb] of covered) {
    const next = [];
    for (const [a, b] of out) {
      if (cb <= a || ca >= b) { next.push([a, b]); continue; }
      if (ca > a) next.push([a, ca]);
      if (cb < b) next.push([cb, b]);
    }
    out = next;
  }
  return out;
}

// PDH/PDL: dla każdej sesji widocznej wśród świec (times) maksimum i minimum POPRZEDNIEJ sesji CME z agregatu 1D (daily = świece [t,o,h,l,c,v], t = otwarcie sesji).
// Zwraca [{ a, b, hi, lo, day }] (zakresy indeksów świec danej sesji). Sesji bez pełnych danych nie zgadujemy: pomijamy ją, gdy poprzednia sesja nie ma świecy 1D,
// ma dziury w pokryciu lokalnych świec (missing bez derived) albo nie jest jeszcze dostępna w całości (availableEnd).
// D3 (przegląd 28.10.2026): dzień bez sesji (święto CME). Poprzednia sesja bez świecy 1D, ale bez dziury w pobranych świecach (missing) i w dostępnym zakresie, to dzień, w którym
// giełda nie handlowała: PDH/PDL bierze wtedy ostatnią sesję, która się odbyła (do 5 dni roboczych wstecz). Dziury w pobranych świecach nie zgadujemy.
// P37 (P3, 28.10.2026): sesja w dziurze danych (gaps z serwera: dzień handlowy bez świec, który nie jest świętem) to nie święto: poprzedniej sesji nie znamy,
// więc PDH/PDL nie rysujemy (zamiast brać sesję sprzed dziury).
function lastSessionWithData(prev, byOpen, { missing, derived, availableEnd, gaps = [] }) {
  let p = prev;
  for (let k = 0; k < 5; k++) {
    if (byOpen.get(p.open)) return p;
    if (gaps.some((g) => g.t < p.close && g.to > p.open)) return null;
    if (uncovered(p.open, p.close, missing, derived).length) return null;
    if (availableEnd != null && p.close > availableEnd) return null;
    let day = p.day - 1;
    while (weekdayOf(day) > 4) day--;
    p = sessionOf(day);
  }
  return null;
}
// P35 (28.10.2026): prevIn = [[otwarcie sesji, H, L]] z serwera dla sesji tuż po zmianie kontraktu: PDH/PDL tej sesji to H/L poprzedniej sesji w kontrakcie,
// który widać (np. w dniu rolla ESH6, nie ESZ5). H/L null = poprzednia sesja w tym kontrakcie niepobrana: bez linii (nie zgadujemy).
export function pdhlSpans(times, daily, { missing = [], derived = [], availableEnd = null, prevIn = [], gaps = [] } = {}) {
  const byOpen = new Map((daily || []).map((d) => [d[0], d]));
  const inK = new Map((prevIn || []).map((x) => [x[0], x]));
  const out = [];
  let sess = null, prev = null, cur = null;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (!sess || t < sess.open || t >= sess.close) {
      sess = sessionBounds(t);
      prev = sess ? previousSession(sess.open) : null;
      cur = null;
    }
    if (!sess) continue;
    if (cur && cur.day === sess.day) { cur.b = i; continue; }
    const k = inK.get(sess.open);
    if (k) {
      const has = Number.isFinite(k[1]) && Number.isFinite(k[2]);
      cur = has ? { a: i, b: i, hi: k[1], lo: k[2], day: sess.day } : { day: sess.day };
      if (has) out.push(cur);
      continue;
    }
    const pd = prev && lastSessionWithData(prev, byOpen, { missing, derived, availableEnd, gaps });
    const d = pd && byOpen.get(pd.open);
    const complete = d && (availableEnd == null || pd.close <= availableEnd) && !uncovered(pd.open, pd.close, missing, derived).length;
    cur = complete ? { a: i, b: i, hi: d[2], lo: d[3], day: sess.day } : { day: sess.day };
    if (complete) out.push(cur);
  }
  return out;
}
