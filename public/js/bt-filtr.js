// Pula dni sesji backtestu (1.5.0). Czysty moduł (bez DOM, bez I/O), działa w przeglądarce i w Node.
// Pakiet C1: pula z danymi i orderDays; pakiet F1: filtr zaawansowany (evalFilter: warunki łączone przez i / lub / nie), dayTags i COND_KINDS.
// Powody wykluczenia dnia: 'manual' (ręcznie wyrzucony), 'done' (zrobiony w tej sesji, pula się nie powtarza), 'no1s' (NQ/MNQ bez prawdziwego 1s 9:30–11:00 NY),
// 'no1m' (ES/MES bez pełnego 1m 9:30–16:00 NY), 'filter' (dzień nie spełnia filtra zaawansowanego; kreator nie pokazuje go na liście wykluczeń, ale liczy w liczniku). ES nie wymaga 1s: [U] 30.10.2026 «Nie potrzebuje narazie tego jednak».
// English: session day pool (no advanced filter yet) and deterministic day ordering.
import { FAMILY } from './kontrakty.js';

const dayOf = (x) => (typeof x === 'string' ? x : x?.day);

// matchDays(def, days, { done }) → { days: Day[], excluded: [{ day, reason }] }; days = DayFeatures[] z /api/backtest/days (tylko dni robocze).
// def = { instruments, from, to, filter, excluded: Day[] (ręcznie wyrzucone), done?: Day[] }. Kolejność wyniku: rosnąco po dniu (ustawia ją orderDays).
// Wynik: { days, excluded, counts }; counts = liczba wykluczonych dni wg powodu (manual, done, no1s, no1m, filter). Filtr oceniany dopiero dla dni z danymi, na cechach pierwszego instrumentu sesji.
export function matchDays(def = {}, days = [], { done = [] } = {}) {
  const manual = new Set((def.excluded || []).map(dayOf).filter(Boolean));
  const doneSet = new Set([...(def.done || []), ...(done || [])].map(dayOf).filter(Boolean));
  const fams = [...new Set((def.instruments || []).map((i) => FAMILY[String(i).toUpperCase()]).filter(Boolean))];
  const from = def.from || '', to = def.to || '9999-12-31';
  const sym = FAMILY[String((def.instruments || [])[0] || '').toUpperCase()];
  const out = [], excluded = [], counts = { manual: 0, done: 0, no1s: 0, no1m: 0, filter: 0 };
  for (const f of [...(days || [])].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))) {
    if (!f?.day || f.day < from || f.day > to) continue;
    let reason = null;
    if (manual.has(f.day)) reason = 'manual';
    else if (doneSet.has(f.day)) reason = 'done';
    else if (fams.includes('NQ') && f.has1s?.NQ !== true) reason = 'no1s';
    else if (fams.includes('ES') && f.has1m?.ES !== true) reason = 'no1m';
    // H2 (zgłoszenie z zrzutów, P1): NQ z oknem 1s, ale bez 1m 9:30–16:00 (np. dzień po imporcie 1s, przed 1m) dawał replay bez ceny przed 9:30 i bez świec po 11:00
    else if (fams.includes('NQ') && f.has1m?.NQ === false) reason = 'no1m';
    if (!reason && def.filter && !evalFilter(def.filter, f, sym)) reason = 'filter'; // błąd w filtrze leci wyżej: pula nie może po cichu udawać, że filtr przeszedł
    if (reason) { excluded.push({ day: f.day, reason }); counts[reason]++; } else out.push(f.day);
  }
  return { days: out, excluded, counts };
}

// mulberry32: małe, deterministyczne PRNG (to samo ziarno = ta sama kolejność na każdym urządzeniu)
function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// orderDays(days, 'chrono'|'newest'|'random', seed) → nowa tablica; wejście bez zmian. 'random' = Fisher-Yates od posortowanej puli, deterministyczny dla seed.
export function orderDays(days = [], order = 'chrono', seed = 1) {
  const s = [...days].sort();
  if (order === 'newest') return s.reverse();
  if (order === 'random') {
    const r = rng(seed);
    for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
  }
  return s;
}

// ---- filtr zaawansowany (F1, §12 i 18a.7) ----
// Filter = { op: 'and'|'or', not: boolean, items: (Cond|Filter)[] }, Cond = { k, not?: boolean, ...parametry }. Grupa bez elementów nie odrzuca niczego (kreator może mieć pustą grupę w trakcie edycji); brak filtra (null) = wszystkie dni.
// Warunki rynku (gap, onRange, prevRange, prevDir, inside, preVsPd, atrRatio) biorą cechy instrumentu sesji (sym); brak cechy w dniu = warunek nie przechodzi (przed ewentualnym not).
// Zakresy min/max są domknięte, brakujący koniec = otwarty. Błędny filtr (nieznany rodzaj, op, jednostka) to wyjątek, nigdy ciche false.
// English: day filter tree (and / or / not) over DayFeatures; unknown kinds throw.
export const COND_KINDS = Object.freeze([
  'wd', 'dateRange', 'month', 'preHoliday', 'postHoliday', 'rollWeek',
  'event', 'impAtLeast', 'noImpAtLeast', 'newsWhen', 'fedChair',
  'opex', 'opexWeek', 'earnings',
  'gap', 'onRange', 'prevRange', 'prevDir', 'inside', 'preVsPd', 'atrRatio',
]);
const IMP_RANK = { low: 1, medium: 2, high: 3 };
const rankOf = (imp, kind) => { const r = IMP_RANK[imp]; if (!r) throw new Error(`Filtr dni: nieznana waga „${imp}” w warunku ${kind} (low, medium, high).`); return r; };
const inRange = (v, min, max) => Number.isFinite(v) && (min == null || v >= min) && (max == null || v <= max);
const UNITS = ['pct', 'pts'];

function evalCond(c, f, sym) {
  const m = f.mkt?.[sym];
  const news = f.news || [];
  switch (c.k) {
    case 'wd': return (c.days || []).includes(f.wd);
    case 'dateRange': return (c.from == null || c.from === '' || f.day >= c.from) && (c.to == null || c.to === '' || f.day <= c.to);
    case 'month': return (c.months || []).includes(f.month);
    case 'preHoliday': return !!f.holiday?.before;
    case 'postHoliday': return !!f.holiday?.after;
    case 'rollWeek': return !!f.rollWeek;
    case 'event': { const want = String(c.name ?? '').trim().toLowerCase(); return !!want && news.some((n) => String(n.name).toLowerCase() === want); }
    case 'impAtLeast': { const r = rankOf(c.imp, c.k); return news.some((n) => IMP_RANK[n.imp] >= r); }
    case 'noImpAtLeast': { const r = rankOf(c.imp, c.k); return !news.some((n) => IMP_RANK[n.imp] >= r); }
    case 'newsWhen': { const r = c.imp == null ? 0 : rankOf(c.imp, c.k); return news.some((n) => n.when === c.when && (IMP_RANK[n.imp] || 0) >= r); }
    case 'fedChair': return !!f.fedChair;
    case 'opex': return f.opex === c.type;
    case 'opexWeek': return !!f.opexWeek;
    case 'earnings': return (f.earnings || []).some((e) => (c.maxCls == null || e.cls <= c.maxCls) && (c.when == null || e.when === c.when));
    case 'gap': {
      if (!UNITS.includes(c.unit)) throw new Error(`Filtr dni: nieznana jednostka „${c.unit}” w warunku gap (pct, pts).`);
      return !!m && inRange(c.unit === 'pct' ? m.gapPct : m.gapPts, c.min, c.max);
    }
    case 'onRange': return !!m && inRange(m.onRange, c.min, c.max);
    case 'prevRange': return !!m && inRange(m.prevRange, c.min, c.max);
    case 'prevDir': return !!m && m.prevDir === c.dir;
    case 'inside': return !!m && m.inside === true;
    case 'preVsPd': return !!m && m.preVsPd === c.pos;
    case 'atrRatio': return !!m && inRange(m.atrRatio, c.min, c.max);
    default: throw new Error(`Filtr dni: nieznany rodzaj warunku „${c.k}”.`);
  }
}

// ---- walidacja filtra (review F1–G #1) ----
// Filtr przychodzi też z zewnątrz (szablon z bloku ustawień zsynchronizowanego z innego urządzenia, kopia definicji sesji), więc przed wstawieniem do edytora
// sprawdzamy każdy węzeł: rodzaj z COND_KINDS, typy i zakresy parametrów, głębokość i liczbę węzłów. Brak parametru, null i '' znaczą „bez ograniczenia”.
// validateFilter(tree) → true / false (nie rzuca); filtr null jest poprawny (brak warunków).
const MAX_DEPTH = 12, MAX_NODES = 300;
const ENUMS = { imp: ['low', 'medium', 'high'], when: ['pre', 'open', 'post'], type: ['monthly', 'quarterly'], dir: ['up', 'down'], pos: ['above', 'below', 'inside'], unit: UNITS };
const blank = (v) => v === undefined || v === null || v === '';
const numOk = (v) => blank(v) || (typeof v === 'number' && Number.isFinite(v));
const dayOk = (v) => blank(v) || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
const intsOk = (v, lo, hi) => Array.isArray(v) && v.length <= 31 && v.every((x) => Number.isInteger(x) && x >= lo && x <= hi);
const enumOk = (v, set, optional = true) => (optional && blank(v)) || set.includes(v);
const PARAMS = {
  wd: (c) => intsOk(c.days ?? [], 1, 7),
  dateRange: (c) => dayOk(c.from) && dayOk(c.to),
  month: (c) => intsOk(c.months ?? [], 1, 12),
  preHoliday: () => true, postHoliday: () => true, rollWeek: () => true, fedChair: () => true, opexWeek: () => true, inside: () => true,
  event: (c) => blank(c.name) || (typeof c.name === 'string' && c.name.length <= 120),
  impAtLeast: (c) => enumOk(c.imp, ENUMS.imp), noImpAtLeast: (c) => enumOk(c.imp, ENUMS.imp),
  newsWhen: (c) => enumOk(c.when, ENUMS.when) && enumOk(c.imp, ENUMS.imp),
  opex: (c) => enumOk(c.type, ENUMS.type),
  earnings: (c) => (blank(c.maxCls) || (Number.isInteger(c.maxCls) && c.maxCls >= 1 && c.maxCls <= 4)) && enumOk(c.when, ['bmo', 'prevAmc']),
  gap: (c) => enumOk(c.unit, ENUMS.unit) && numOk(c.min) && numOk(c.max),
  onRange: (c) => numOk(c.min) && numOk(c.max), prevRange: (c) => numOk(c.min) && numOk(c.max), atrRatio: (c) => numOk(c.min) && numOk(c.max),
  prevDir: (c) => enumOk(c.dir, ENUMS.dir, false), preVsPd: (c) => enumOk(c.pos, ENUMS.pos, false),
};
export function validateFilter(tree) {
  let nodes = 0;
  const walk = (n, depth) => {
    if (!n || typeof n !== 'object' || Array.isArray(n) || depth > MAX_DEPTH || ++nodes > MAX_NODES) return false;
    if (!blank(n.not) && typeof n.not !== 'boolean') return false;
    if (Array.isArray(n.items) || n.op !== undefined) return (n.op === 'and' || n.op === 'or') && Array.isArray(n.items) && n.items.every((x) => walk(x, depth + 1));
    return typeof n.k === 'string' && COND_KINDS.includes(n.k) && PARAMS[n.k](n);
  };
  return tree == null || walk(tree, 0);
}

// evalFilter(tree, f, sym) → boolean; tree = Filter albo Cond albo null; f = DayFeatures; sym = 'ES'|'NQ' (instrument sesji).
export function evalFilter(tree, f, sym) {
  if (tree == null) return true;
  if (typeof tree !== 'object' || Array.isArray(tree)) throw new Error('Filtr dni: nieprawidłowy węzeł filtra.');
  let r;
  if (Array.isArray(tree.items)) {
    if (tree.op !== 'and' && tree.op !== 'or') throw new Error(`Filtr dni: nieznany operator grupy „${tree.op}” (and, or).`);
    const items = tree.items;
    r = !items.length ? true : tree.op === 'and' ? items.every((x) => evalFilter(x, f, sym)) : items.some((x) => evalFilter(x, f, sym));
  } else if (typeof tree.k === 'string') {
    r = evalCond(tree, f, sym);
  } else {
    throw new Error('Filtr dni: nieprawidłowy węzeł filtra (brak items ani k).');
  }
  return tree.not ? !r : r;
}

// dayTags(f, tr) → etykiety typu dnia dla statystyk (G) i kreatora. tr = tłumacz interfejsu (t); bez niego polskie napisy. Nazwy własne (CPI, FOMC, OPEX) nie są tłumaczone.
// Duże wydarzenia = waga high (nazwy z indeksu: CPI, NFP, FOMC, ...). „bez newsów” = żadnego wydarzenia o wadze co najmniej pomarańczowej (medium).
export function dayTags(f, tr = (s) => s) {
  const out = [];
  const news = f.news || [];
  if (!news.some((n) => IMP_RANK[n.imp] >= IMP_RANK.medium)) out.push(tr('bez newsów'));
  for (const n of news) if (n.imp === 'high' && !out.includes(n.name)) out.push(n.name);
  if (f.opex) out.push('OPEX');
  if (f.fedChair) out.push(tr('przewodniczący Fed'));
  if (f.holiday?.before) out.push(tr('przed świętem'));
  if (f.holiday?.after) out.push(tr('po święcie'));
  if (f.rollWeek) out.push(tr('tydzień rolla'));
  if ((f.earnings || []).some((e) => e.cls <= 2)) out.push(tr('wyniki spółek'));
  return out;
}
