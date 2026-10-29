// Kalendarz kontraktów kwartalnych ES/NQ i seria ciągła wg rolla rynku (P35). Czysty moduł (bez DOM, bez I/O): serwer i przeglądarka.
// P35 (28.10.2026), słowa użytkownika: «Tak żeby było jak najbardziej poprawnie» (przełączenie na otwarciu sesji CME, 17:00 Chicago; «sprawdź regułę
// względem danych: dzień, w którym obrót następnego kontraktu przewyższa bieżący; wybierz regułę dającą najbardziej poprawny wynik»).
// Pomiar na wszystkich rollach ES i NQ 2010–2026 (plan, sekcja 0, P35): czwartek 8 dni przed trzecim piątkiem (konwencja rolla CME) nie trafia w dzień
// przewagi obrotu ani razu; przewaga przychodzi w piątek (do 2022) albo w poniedziałek tygodnia wygaśnięcia (od 2022). Dlatego reguła = zmierzona
// sesja przewagi obrotu dla każdego rolla (rolls: { q: chwila }, liczone przez serwer z pobranych świec), a gdy pomiaru jeszcze nie ma (bieżący roll
// przed danymi), reguła zapasowa ROLL_FALLBACK_DAYS. Zastępuje P1 «Wg obrotu .v.0» w chwili przełączenia (.v.0 przechodzi później, w środę tygodnia wygaśnięcia).
// Numer kontraktu q = rok × 4 + kwartał (0 = H marzec, 1 = M czerwiec, 2 = U wrzesień, 3 = Z grudzień). MES/MNQ mają te same miesiące i dane ES/NQ (P9).
// English: quarterly ES/NQ contract calendar, market-style roll rule, contract codes, continuous-series segments and back-adjust offsets.
import { dayNum, fromDayNum, weekdayOf, chicagoEpoch, sessionBounds, previousSession } from './swiece.js';

export const MONTH_CODES = 'FGHJKMNQUVXZ';
const Q_CODES = 'HMUZ';
export const FAMILY = Object.freeze({ ES: 'ES', MES: 'ES', NQ: 'NQ', MNQ: 'NQ' });
// Czwartek 8 dni przed trzecim piątkiem: konwencja rolla CME. Od otwarcia sesji przed nim (środa) zaczyna się okno pomiaru i pobrania świec nowego kontraktu.
export const ROLL_DAYS_BEFORE = 8;
// Reguła zapasowa (bez pomiaru): sesja poniedziałku tygodnia wygaśnięcia (otwarcie w niedzielę 17:00 Chicago), czyli dzień przewagi obrotu we wszystkich
// zmierzonych rollach ES i NQ od czerwca 2022 (wcześniej piątek: zapas pokazałby nowy kontrakt sesję później niż rynek, ale tamte rolle mają pomiar).
export const ROLL_FALLBACK_DAYS = 4;
// rolls: liczba dni (stała reguła), funkcja q → chwila, mapa { q: chwila } zmierzonych przełączeń (brak wpisu = reguła zapasowa) albo nic (reguła zapasowa).
export function rollAtFn(rolls) {
  if (typeof rolls === 'function') return rolls;
  if (typeof rolls === 'number') return (q) => rollEpoch(q, rolls);
  const m = rolls || {};
  return (q) => m[q] ?? rollEpoch(q, ROLL_FALLBACK_DAYS);
}

export const qYear = (q) => Math.floor(q / 4);
export const qMonth = (q) => ((q % 4) + 1) * 3;
export const qOf = (y, month) => y * 4 + (month / 3 - 1);
export const contractName = (root, q) => root + Q_CODES[q % 4] + (qYear(q) % 10);

// Trzeci piątek miesiąca wygaśnięcia (numer dnia, patrz swiece.js dayNum).
export function thirdFriday(q) {
  const first = dayNum(qYear(q), qMonth(q), 1);
  return first + ((5 - weekdayOf(first) + 7) % 7) + 14;
}
// Wielkanoc (algorytm Meeusa/Jonesa/Butchera, kalendarz gregoriański) jako numer dnia.
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayNum(y, month, day);
}
// Święto giełdowe, które może wypaść w trzeci piątek (15.–21. dnia miesiąca kwartalnego): Wielki Piątek (marzec) i Juneteenth (od 2022, 19.06,
// w sobotę obchodzony w piątek 18.06). Inne święta NYSE nie trafiają w te dni, więc lista jest pełna dla wygaśnięć ES/NQ.
export function expiryHoliday(n) {
  const { y, mo, d } = fromDayNum(n);
  if (n === easter(y) - 2) return true;
  if (y >= 2022 && mo === 6 && weekdayOf(n) === 5 && (d === 19 || d === 18)) return true;
  return false;
}
// Ostatni dzień notowań: trzeci piątek, a gdy to święto, poprzedni dzień roboczy (np. ESM6: czwartek 18.06.2026, bo 19.06 to Juneteenth).
export function lastTradingDay(q) {
  let n = thirdFriday(q);
  while (expiryHoliday(n) || weekdayOf(n) === 0 || weekdayOf(n) === 6) n--;
  return n;
}
// Koniec notowań kontraktu: 8:30 Chicago (9:30 Nowy Jork) ostatniego dnia notowań.
export const expiryEpoch = (q) => chicagoEpoch(lastTradingDay(q), 8) + 1800;
// Chwila przełączenia z kontraktu q na q+1: otwarcie sesji (17:00 Chicago) dnia handlowego rolla (trzeci piątek − days).
export const rollEpoch = (q, days = ROLL_DAYS_BEFORE) => chicagoEpoch(thirdFriday(q) - days - 1, 17);

// Kontrakt wiodący wg reguły w chwili t: q, dla którego roll(q − 1) <= t < roll(q) (rolls jak w rollAtFn).
export function frontQ(t, rolls) {
  const R = rollAtFn(rolls);
  const d = new Date(t * 1000);
  let q = qOf(d.getUTCFullYear(), (Math.floor(d.getUTCMonth() / 3) + 1) * 3);
  while (t >= R(q)) q++;
  while (t < R(q - 1)) q--;
  return q;
}

// ---- kod kontraktu w polu trade'a („Kontrakt”, P35 pkt 4) ----
// Format: symbol + kod miesiąca (FGHJKMNQUVXZ) + rok (1 albo 2 cyfry), np. ESZ6, MNQH7, ESZ25. Wielkość liter bez znaczenia.
const CODE_RE = /^([A-Z0-9]{1,4}?)([FGHJKMNQUVXZ])(\d{1,2})$/; // symbol może mieć cyfrę (6E, 6B)
export function parseContract(str) {
  const s = String(str ?? '').trim().toUpperCase();
  const m = CODE_RE.exec(s);
  if (!m) return null;
  return { code: s, root: m[1], letter: m[2], month: MONTH_CODES.indexOf(m[2]) + 1, digits: m[3] };
}
// Walidacja pola dla instrumentu trade'a. Zwraca null (dobrze; puste też) albo { key, vars } komunikatu do przetłumaczenia.
export function contractProblem(value, instrument) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const p = parseContract(s);
  if (!p) return { key: 'Pole „Kontrakt”: „{val}” nie jest kodem kontraktu. Wpisz symbol, kod miesiąca (F G H J K M N Q U V X Z) i rok, np. ESZ6 albo MNQH7.', vars: { val: s.slice(0, 20) } };
  const inst = String(instrument ?? '').trim().toUpperCase();
  if (Object.hasOwn(FAMILY, inst) && p.root !== inst) return { key: 'Pole „Kontrakt”: „{val}” nie pasuje do instrumentu {inst}. Wpisz kontrakt {inst}, np. {ex}.', vars: { val: p.code, inst, ex: inst + 'Z6' } };
  if (Object.hasOwn(FAMILY, p.root) && !Q_CODES.includes(p.letter)) return { key: 'Pole „Kontrakt”: {inst} ma tylko kontrakty kwartalne (H marzec, M czerwiec, U wrzesień, Z grudzień), a wpisano „{val}”.', vars: { val: p.code, inst: p.root } };
  return null;
}
// Numer kontraktu q z kodu (ES/NQ/MES/MNQ) dla trade'a z chwili refSec: najbliższy rok o tej końcówce (do 2 lat naprzód), w którym kontrakt jeszcze
// nie wygasł; null, gdy taki kontrakt nie był wtedy notowany (np. ESZ5 dla trade'a po 19.12.2025: ESZ2035 jeszcze nie istniał).
export function contractQ(code, refSec) {
  const p = parseContract(code);
  if (!p || !Object.hasOwn(FAMILY, p.root) || !Q_CODES.includes(p.letter)) return null;
  const y0 = new Date(refSec * 1000).getUTCFullYear(), mod = p.digits.length === 2 ? 100 : 10, want = Number(p.digits);
  for (let y = y0 - 1; y <= y0 + 2; y++) {
    if (((y % mod) + mod) % mod !== want) continue;
    const q = qOf(y, p.month);
    if (expiryEpoch(q) > refSec) return q;
  }
  return null;
}

// Kod z rokiem czterocyfrowym (nazwa warstwy magazynu, np. ESH2026) i symbol surowy Databento (ESH6: rok rozwiązywany przez zakres żądania).
export const code4 = (root, q) => root + Q_CODES[q % 4] + qYear(q);
export const rawSymbol = (root, q) => contractName(root, q);
export function parseCode4(s) {
  const m = /^(ES|NQ)([HMUZ])(\d{4})$/.exec(String(s ?? ''));
  return m ? { root: m[1], q: qOf(Number(m[3]), (Q_CODES.indexOf(m[2]) + 1) * 3) } : null;
}

// ---- seria ciągła: z którego kontraktu i z której warstwy magazynu są świece ----
// v0: [[t, q], …] rosnąco: od chwili t seria Databento .v.0 to kontrakt q (symbology.resolve zapisane lokalnie albo zmiany instrument_id w pobranych danych).
// Przed pierwszym wpisem: kontrakt poprzedni (pierwszy wpis to przełączenie); bez wpisów: kontrakt wg reguły (brak wiedzy, zachowanie sprzed P35).
export function v0At(v0, t) {
  let lo = 0, hi = v0.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (v0[m][0] <= t) lo = m + 1; else hi = m; }
  return lo ? v0[lo - 1][1] : (v0.length ? v0[0][1] - 1 : frontQ(t, ROLL_DAYS_BEFORE));
}
// Przełączenia .v.0 z wpisów rolls magazynu ({ t }, zmiana instrument_id): przyjęte tylko, gdy wypadają między rollem rynku a wygaśnięciem
// kontraktu wychodzącego (tak jest we wszystkich 66 rollach ES i NQ 2010–2026); wpis spoza tego okna (np. dane testowe) nie zmienia serii.
export function v0FromRolls(rolls, days = ROLL_DAYS_BEFORE) {
  const out = [];
  for (const r of rolls || []) {
    const q = frontQ(r.t, days);
    if (r.t >= rollEpoch(q - 1, days) && r.t <= expiryEpoch(q - 1) + 86400) out.push([r.t, q]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}
// Scala listy przełączeń (po czasie; ten sam czas: pierwsza lista wygrywa) i usuwa wpisy, które nie zmieniają kontraktu.
export function mergeV0(...lists) {
  const by = new Map();
  for (const l of lists) for (const [t, q] of l || []) if (!by.has(t)) by.set(t, q);
  const out = [];
  for (const [t, q] of [...by].sort((a, b) => a[0] - b[0])) if (!out.length || out[out.length - 1][1] !== q) out.push([t, q]);
  return out;
}

// Odcinki [from, to): [{ from, to, q, src: 'v0'|'k' }]: kontrakt wg reguły, a w oknie override = { q, from, to } kontrakt q (np. pole „Kontrakt” trade'a).
// src 'v0': świece z serii .v.0 (kontrakt q jest wtedy w .v.0), 'k': z warstwy kontraktu q. Kontrakt po wygaśnięciu nie ma świec: zostaje reguła.
export function seriesSegments(from, to, v0, { override = null, rolls } = {}) {
  const R = rollAtFn(rolls);
  if (!(to > from)) return [];
  const cuts = new Set([from, to]);
  const inside = (x) => { if (x > from && x < to) cuts.add(x); };
  for (let q = frontQ(from, R) - 1, r; (r = R(q)) < to; q++) inside(r);
  for (const [t] of v0) inside(t);
  if (override) { inside(override.from); inside(override.to); inside(expiryEpoch(override.q)); }
  const pts = [...cuts].sort((a, b) => a - b), out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    let q = frontQ(a, R);
    if (override && a >= override.from && a < override.to && a < expiryEpoch(override.q)) q = override.q;
    const src = !v0.length || q === v0At(v0, a) ? 'v0' : 'k'; // bez wiedzy o .v.0 wszystko z .v.0 (jak przed P35)
    const last = out[out.length - 1];
    if (last && last.to === a && last.q === q && last.src === src) last.to = b;
    else out.push({ from: a, to: b, q, src });
  }
  return out;
}
// Sesja CME zawierająca chwilę t; w przerwie 16:00–17:00 i w weekend następna sesja.
export function sessionAround(t) {
  const s = sessionBounds(t);
  if (s) return s;
  for (let k = 1; k <= 72; k++) { const x = sessionBounds(t + k * 3600); if (x) return x; }
  return previousSession(t);
}
// Okno kontraktu trade'a: całe sesje od sesji wejścia do sesji wyjścia, więc każda sesja na wykresie ma jeden kontrakt (świeca 1D, boxy sesji i PDH/PDL czyste).
export function tradeSessions(entry, exit = entry) {
  const a = sessionAround(entry), b = sessionAround(Math.max(entry, exit ?? entry));
  return { from: a.open, to: Math.max(a.close, b.close) };
}
// Chwila odniesienia trade'a bez godziny (samo pole daty): południe w Chicago dnia handlowego, czyli środek jego sesji.
export function dateRef(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  return m ? chicagoEpoch(dayNum(Number(m[1]), Number(m[2]), Number(m[3])), 12) : null;
}
// Kontrakty do wyboru na wykresie trade'a z chwili t: wiodący wg reguły i drugi notowany (w tygodniu rolla poprzedni, który jeszcze nie wygasł, poza nim następny).
export function contractOptions(t, rolls) {
  const f = frontQ(t, rolls);
  return t < expiryEpoch(f - 1) ? [f - 1, f] : [f, f + 1];
}

// ---- back-adjust (P35 pkt 3, jak B-ADJ TradingView) ----
// gaps: { [q]: luka przy przejściu na kontrakt q } = zamknięcie q − zamknięcie q−1 na ostatniej wspólnej minucie przed przełączeniem.
// Przesunięcie kontraktu q = suma luk wszystkich późniejszych przejść (q+1 … ostatnie znane), czyli najnowszy kontrakt ma 0, starsze idą kumulatywnie.
// P38 (28.10.2026), słowa użytkownika: «okej wedle naszej rozmowy  BADJ domyslnie wlaczony w ustawieniach przelacznik» (ICT: struktura HTF sprzed rolli; B-ADJ liczy się
// względem kontraktu trade'a). anchor = kontrakt, w którego cenach ma być cały wykres (kontrakt trade'a): jego przesunięcie to 0, kontrakty starsze idą o sumę luk
// do kontraktu kotwicy (q < anchor: luki q+1 … anchor), nowsze w drugą stronę (q > anchor: minus luki anchor+1 … q). Bez kotwicy (Infinity) najnowszy kontrakt ma 0
// (jak przed P38). Ceny kontraktu trade'a zostają prawdziwe, więc wejście, SL, TP, BE i rysunki trafiają co do ticka.
export function adjustOffsets(gaps, anchor = Infinity) {
  const qs = Object.keys(gaps).map(Number);
  return (q) => qs.reduce((s, j) => (q < anchor ? (j > q && j <= anchor ? s + gaps[j] : s) : (j > anchor && j <= q ? s - gaps[j] : s)), 0);
}
