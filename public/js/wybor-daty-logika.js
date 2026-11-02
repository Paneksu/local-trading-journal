// Wybierak daty i godziny (1.6.1): czysta logika bez DOM, działa też w Node (testy/backtest-wybor-daty.mjs).
// [U] 1.11.2026 «stworz w naszym stylu design okna ustawiania czasu i daty, ma byc proste w uzytku najlepiej»
// Wartość pola zostaje w dotychczasowym formacie (data RRRR-MM-DD, godzina GG:MM); tu tylko zamiana na tekst do wpisania i z powrotem,
// zakres min/max, ruch klawiaturą po kalendarzu, siatka miesiąca (tydzień od poniedziałku) i kroki godziny.
// English: pure date/time picker logic: parsing typed text (PL dd.mm.yyyy, EN mm/dd/yyyy, ISO), min/max, keyboard moves, month grid, time steps.

export const pad = (n) => String(n).padStart(2, '0');
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysIn = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
export const isoOf = (y, m, d) => `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
export function partsOf(iso) { const m = DAY_RE.exec(iso || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
export function validIso(s) {
  const p = partsOf(s);
  return !!p && p.y >= 1 && p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= daysIn(p.y, p.m);
}
export const validHm = (s) => HM_RE.test(s || '');

// Arytmetyka dni w UTC (bez przesunięć czasu letniego)
const ms = (iso) => { const p = partsOf(iso); return Date.UTC(p.y, p.m - 1, p.d); };
const fromMs = (x) => { const d = new Date(x); return isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
export const addDays = (iso, n) => fromMs(ms(iso) + n * 86400000);
// 0 = poniedziałek … 6 = niedziela
export const weekdayMon = (iso) => (new Date(ms(iso)).getUTCDay() + 6) % 7;
// Miesiąc w przód / w tył z dniem przyciętym do długości miesiąca (31 stycznia + 1 miesiąc = 28/29 lutego)
export function addMonths(iso, n) {
  const p = partsOf(iso);
  const idx = p.y * 12 + (p.m - 1) + n, y = Math.floor(idx / 12), m = (idx % 12) + 1;
  return isoOf(y, m, Math.min(p.d, daysIn(y, m)));
}
export const addYears = (iso, n) => addMonths(iso, 12 * n);
export const monthOf = (iso) => iso.slice(0, 7);

// Siatka miesiąca: 42 dni (6 tygodni) od poniedziałku tygodnia, w którym wypada 1. dzień miesiąca
export function monthGrid(ym) {
  const first = `${ym}-01`;
  const start = addDays(first, -weekdayMon(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

// Zakres: puste min/max nie ograniczają
export function inRange(iso, min, max) { return !(min && validIso(min) && iso < min) && !(max && validIso(max) && iso > max); }
export function clamp(iso, min, max) {
  if (min && validIso(min) && iso < min) return min;
  if (max && validIso(max) && iso > max) return max;
  return iso;
}

// ---------- tekst daty ----------
// PL dd.mm.rrrr (jak w polskich formularzach), EN mm/dd/yyyy (jak „Nov 1, 2026” w aplikacji: miesiąc przed dniem); ISO RRRR-MM-DD w obu.
export const FORMATS = {
  pl: { order: 'dmy', sep: '.' },
  en: { order: 'mdy', sep: '/' },
};
const fmtOf = (lang) => FORMATS[lang] || FORMATS.pl;
export function formatDate(iso, lang = 'pl') {
  const p = partsOf(iso);
  if (!p) return '';
  const f = fmtOf(lang), y = String(p.y).padStart(4, '0');
  return f.order === 'mdy' ? `${pad(p.m)}${f.sep}${pad(p.d)}${f.sep}${y}` : `${pad(p.d)}${f.sep}${pad(p.m)}${f.sep}${y}`;
}

// Nazwy miesięcy przy wpisywaniu („1 lis 2026”, „Nov 1, 2026”, „1 listopada 2026”): pierwsze 3 litery po zdjęciu znaków diakrytycznych
const MON3 = { sty: 1, lut: 2, mar: 3, kwi: 4, maj: 5, cze: 6, lip: 7, sie: 8, wrz: 9, paz: 10, lis: 11, gru: 12,
  jan: 1, feb: 2, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const fold = (s) => s.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/\p{M}/gu, '');
const monthWord = (w) => MON3[fold(w).slice(0, 3)] || 0;

// Wpisany tekst → 'RRRR-MM-DD', '' (puste pole) albo null (nie da się odczytać).
// strict (domyślnie, w trakcie pisania): rok czterocyfrowy. loose (zatwierdzenie Enterem albo wyjściem z pola): rok dwucyfrowy (20xx),
// bez roku (rok z `today`), zapis ciągły 8 cyfr (01112026).
export function parseDate(text, lang = 'pl', { loose = false, today = '' } = {}) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  if (DAY_RE.test(s)) return validIso(s) ? s : null;
  const order = fmtOf(lang).order;
  const yNow = partsOf(today)?.y || new Date().getFullYear();
  let tokens = s.split(/[\s.,/\-]+/).filter(Boolean);
  // 8 cyfr bez separatorów: dwie pierwsze pary w kolejności języka, na końcu rok
  if (loose && tokens.length === 1 && /^\d{8}$/.test(tokens[0])) { const x = tokens[0]; tokens = [x.slice(0, 2), x.slice(2, 4), x.slice(4)]; }
  let y = null, m = null, d = null;
  const words = tokens.filter((x) => /\p{L}/u.test(x));
  if (words.length > 1 || tokens.some((x) => !/^\d+$/.test(x) && !monthWord(x))) return null;
  if (words.length === 1) {
    m = monthWord(words[0]);
    const nums = tokens.filter((x) => /^\d+$/.test(x));
    if (!m || nums.length < 1 || nums.length > 2) return null;
    const dy = nums.find((x) => x.length <= 2), yy = nums.find((x) => x !== dy);
    if (!dy) return null;
    d = +dy; y = yy === undefined ? null : yy;
  } else {
    if (tokens[0]?.length === 4 && tokens.length === 3) [y, m, d] = [tokens[0], +tokens[1], +tokens[2]];
    else if (tokens.length === 3 || tokens.length === 2) {
      const [a, b, c] = tokens;
      if (order === 'mdy') { m = +a; d = +b; } else { d = +a; m = +b; }
      y = c === undefined ? null : c;
      if (a.length > 2 || b.length > 2) return null;
    } else return null;
  }
  if (y === null) { if (!loose) return null; y = yNow; }
  else if (typeof y === 'string') {
    if (y.length === 4) y = +y;
    else if (loose && y.length === 2) { y = 2000 + +y; if (y > yNow + 20) y -= 100; }
    else return null;
  }
  const iso = isoOf(y, m, d);
  return validIso(iso) ? iso : null;
}

// ---------- ruch klawiaturą po siatce dni (wzorzec APG „Date Picker Dialog”) ----------
// Strzałki: dzień / tydzień; Home/End: początek / koniec tygodnia (pon–nd); PageUp/PageDown: miesiąc; z Shiftem: rok.
export function moveKey(iso, key, { shift = false } = {}) {
  switch (key) {
    case 'ArrowLeft': return addDays(iso, -1);
    case 'ArrowRight': return addDays(iso, 1);
    case 'ArrowUp': return addDays(iso, -7);
    case 'ArrowDown': return addDays(iso, 7);
    case 'Home': return addDays(iso, -weekdayMon(iso));
    case 'End': return addDays(iso, 6 - weekdayMon(iso));
    case 'PageUp': return shift ? addYears(iso, -1) : addMonths(iso, -1);
    case 'PageDown': return shift ? addYears(iso, 1) : addMonths(iso, 1);
    default: return null;
  }
}

// Strona lat w szybkim wyborze: 12 lat, pierwsza podzielna przez 12 (np. 2016–2027)
export const yearPageStart = (y) => y - (((y % 12) + 12) % 12);

// ---------- godzina ----------
// strict: GG:MM albo G:MM (także z kropką). loose: „930” → 09:30, „9” → 09:00, „1430” → 14:30, „9 30”, „9h30”.
export function parseTime(text, { loose = false } = {}) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  let h, m;
  let x = /^(\d{1,2})[:.](\d{2})$/.exec(s);
  if (x) { h = +x[1]; m = +x[2]; }
  else if (loose && (x = /^(\d{1,2})(?:[\s:.h]+(\d{1,2}))?$/i.exec(s)) && (x[2] !== undefined || s.length <= 2)) { h = +x[1]; m = x[2] === undefined ? 0 : +x[2]; }
  else if (loose && /^\d{3,4}$/.test(s)) { h = +s.slice(0, s.length - 2); m = +s.slice(-2); }
  else return null;
  if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return null;
  return `${pad(h)}:${pad(m)}`;
}
export const hmToMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
export const minToHm = (x) => { const v = ((x % 1440) + 1440) % 1440; return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`; };
// Krok godziny: część 'h' (±1 h) albo 'm' (minuty z przeniesieniem na godzinę), doba się zawija (23:59 + 1 min = 00:00).
// snap: minuty wyrównane do wielokrotności kroku (przyciski i kółko w oknie godziny idą co 5 min).
export function stepTime(hm, part, delta, { snap = false } = {}) {
  const base = validHm(hm) ? hmToMin(hm) : 0;
  if (part === 'h') return minToHm(base + delta * 60);
  if (snap && delta) {
    const step = Math.abs(delta), m = base % 60, h0 = base - m;
    const next = delta > 0 ? Math.floor(m / step) * step + step : Math.ceil(m / step) * step - step;
    return minToHm(h0 + next);
  }
  return minToHm(base + delta);
}
// Kursor w polu GG:MM: pozycja ≤ 2 to godziny, dalej minuty
export const partAt = (caret) => (caret <= 2 ? 'h' : 'm');
