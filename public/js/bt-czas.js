// Replay modułu Backtest (1.5.0): czas, kroki, skoki, skróty i newsy bez przyszłości. Czysty moduł (bez DOM, bez I/O), działa w przeglądarce i w Node.
// Godziny NY liczone tą samą regułą co serwer (lib/news.mjs etToUtc: od 2007 czas letni od 2. niedzieli marca do 1. niedzieli listopada, 2:00 lokalnie).
// Krok = jedna świeca aktywnego TF (wyrównanie do granicy kubełka). TF sekundowy poza oknem prawdziwego 1s krokuje o minutę, bo tam świece bazowe są 1m.
// English: replay clock helpers: NY wall time, steps aligned to the active timeframe, jump targets, keyboard shortcuts and look-ahead-safe news.
import { dayNum, fromDayNum, weekdayOf, parseTf, SESSIONS, sessionBounds } from './swiece.js';
import { validateFilter } from './bt-filtr.js';
import { visibleCount } from './bt-swieca.js';
import { t } from './i18n.js';

// ---- czas Nowego Jorku ----
const pad = (n) => String(n).padStart(2, '0');
const nthSunday = (y, mo, n) => { const f = dayNum(y, mo, 1); return f + ((7 - weekdayOf(f)) % 7) + (n - 1) * 7; };
function isDstUtc(u) {
  const y = new Date(u * 1000).getUTCFullYear();
  return u >= nthSunday(y, 3, 2) * 86400 + 7 * 3600 && u < nthSunday(y, 11, 1) * 86400 + 6 * 3600; // 2:00 EST = 7:00Z, 2:00 EDT = 6:00Z
}
const etOffset = (u) => (isDstUtc(u) ? -4 * 3600 : -5 * 3600);
const etToUtc = (n, hh, mm) => { const local = n * 86400 + hh * 3600 + mm * 60; return isDstUtc(local + 4 * 3600) ? local + 4 * 3600 : local + 5 * 3600; };
const dateStr = (n) => { const { y, mo, d } = fromDayNum(n); return `${y}-${pad(mo)}-${pad(d)}`; };
const nyDayNum = (u) => Math.floor((u + etOffset(u)) / 86400);
function dayN(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day));
  const n = m ? dayNum(Number(m[1]), Number(m[2]), Number(m[3])) : NaN;
  if (!m || dateStr(n) !== day) throw new Error(`bt-czas: zły dzień „${String(day).slice(0, 20)}”`);
  return n;
}
function hhmm(s) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(s));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`bt-czas: zła godzina „${String(s).slice(0, 10)}”`);
  return [Number(m[1]), Number(m[2])];
}

// nyAt('2024-03-11', '09:30') → sekundy UTC tej godziny czasu NY w tym dniu.
export function nyAt(day, at) {
  const [h, m] = hhmm(at);
  return etToUtc(dayN(day), h, m);
}

// ---- kroki ----
const inside = (ranges, t) => (ranges || []).some(([a, b]) => t >= a && t < b);

// Długość kroku w sekundach dla TF przy kursorze: TF < 1 min poza prawdziwym 1s = 60 (świece bazowe są tam minutowe).
export function stepSec(tf, cursor, real1s) {
  const p = parseTf(tf);
  if (!p || p.unit === 'D' || p.unit === 'W' || p.unit === 'M') throw new Error(`bt-czas: zły interwał replayu „${tf}”`);
  return p.sec < 60 && !inside(real1s, cursor) ? 60 : p.sec;
}

// Następny kursor o jedną świecę aktywnego TF w przód (dir > 0) albo w tył (dir < 0), wyrównany do granicy kubełka, w granicach bounds = { min, max }.
// Kubełki REPLAY_TFS dzielą godzinę, a sesja CME otwiera się o pełnej godzinie UTC, więc granica kubełka = wielokrotność kroku od epoki.
// W tył krok liczony dla sekundy przed kursorem: z 9:30:00 (początek okna 1s) cofamy się o minutę do 9:29:00, z 11:00:00 o 15 s do 10:59:45.
export function nextCursor(cursor, dir, tf, real1s, bounds = {}) {
  const min = Number.isFinite(bounds.min) ? bounds.min : -Infinity, max = Number.isFinite(bounds.max) ? bounds.max : Infinity;
  let t;
  if (dir > 0) { const s = stepSec(tf, cursor, real1s); t = Math.floor(cursor / s) * s + s; }
  else if (dir < 0) { const s = stepSec(tf, cursor - 1, real1s); t = Math.ceil(cursor / s) * s - s; }
  else t = cursor;
  return Math.min(max, Math.max(min, t));
}

// ---- czas ciągły (K, 31.10.2026) ----
// [U] 31.10.2026 «nie powinno byc takiego czegos jak koniec dnia, tylko mozesz przesuwac czas tyle ile chcesz»: przerwy bez handlu (weekend, święto, przerwa 17–18 NY,
// dziura w danych) pomijane przy krokach i odtwarzaniu. Przerwa = brak świecy bazowej przez co najmniej GAP_SKIP sekund (cisza kilku sekund w oknie 1s to nie przerwa).
export const GAP_SKIP = 1800;
const prevEnd = (stream, i) => (i > 0 ? stream.bars[i - 1][0] + stream.len[i - 1] : -Infinity);
// skipGap(stream, from, to) → kursor: `to`, a gdy między `from` i `to` nie zaczyna się żadna świeca, a do następnej jest przerwa ≥ GAP_SKIP, początek tej świecy.
// Brak dalszych świec (koniec wczytanych danych) → `to` (granicę danych pilnuje wywołujący).
export function skipGap(stream, from, to) {
  if (!stream || !stream.bars.length || !(to > from)) return to;
  const i = visibleCount(stream, from);
  if (i >= stream.bars.length) return to;
  const nb = stream.bars[i][0];
  if (nb < to) return to;
  const gapFrom = Math.max(prevEnd(stream, i), Math.min(from, nb));
  return nb - gapFrom >= GAP_SKIP ? nb : to;
}
// Krok o jedną świecę aktywnego TF (nextCursor) z pominięciem przerw: w przód na koniec kubełka z pierwszą świecą po przerwie, w tył na koniec ostatniej świecy przed przerwą.
export function stepCursor(cursor, dir, tf, stream, real1s, bounds = {}) {
  const lim = (t) => Math.min(Number.isFinite(bounds.max) ? bounds.max : Infinity, Math.max(Number.isFinite(bounds.min) ? bounds.min : -Infinity, t));
  let t = nextCursor(cursor, dir, tf, real1s);
  if (dir > 0) {
    const j = skipGap(stream, cursor, t);
    if (j !== t) t = nextCursor(j, 1, tf, real1s);
  } else if (dir < 0 && stream && stream.bars.length) {
    // w tył: jeśli między t a kursorem nie zaczyna się żadna świeca, a przed nimi jest przerwa, kursor staje na końcu ostatniej świecy przed przerwą
    const i = visibleCount(stream, t);
    const pe = prevEnd(stream, i);
    const startsBetween = i < stream.bars.length && stream.bars[i][0] < cursor;
    if (!startsBetween && Number.isFinite(pe) && pe < cursor && cursor - pe >= GAP_SKIP) t = pe;
  }
  return lim(t);
}

// ---- newsy bez przyszłości ----
// §2: plan dnia (nazwa, godzina, waga) wolno pokazać także po kursorze; wyniku (actual/forecast i inne pola) nigdy. Kolejne dni nie są widoczne.
const NEWS_FIELDS = ['t', 'day', 'name', 'imp', 'kind', 'allDay', 'tentative'];
const project = (e) => { const o = {}; for (const k of NEWS_FIELDS) if (e[k] !== undefined) o[k] = e[k]; return o; };
const IMPS_FROM = { high: ['high'], medium: ['high', 'medium'] };

// Zdarzenia przeszłe (t ≤ kursor) i cały plan bieżącego dnia NY kursora, tylko pola planu, posortowane po czasie.
export function visibleNews(events, cursor) {
  const today = dateStr(nyDayNum(cursor));
  return (events || []).filter((e) => e.t <= cursor || e.day === today).map(project).sort((a, b) => a.t - b.t);
}

// Najbliższe zdarzenie o t > kursor i wadze ≥ minImp ('high' albo 'medium'); całodniowe (święta, opex) się nie liczą.
export function nextNews(events, cursor, minImp = 'high') {
  const ok = IMPS_FROM[minImp] || IMPS_FROM.high;
  let best = null;
  for (const e of events || []) if (!e.allDay && e.t > cursor && ok.includes(e.imp) && (!best || e.t < best.t)) best = e;
  return best ? project(best) : null;
}

// ---- skoki ----
// 8. Gotowe skoki: do 9:30 NY, następna sesja NY (następny dzień handlowy o godzinie startu), następny news, następny dzień z filtra, +N min.
// K (31.10.2026): bez granicy dnia; „Następny dzień z filtra” ma własny rodzaj 'filterDay' ([U] 31.10.2026 «Filtr jako skok»).
// Nazwy to dane ustawień (użytkownik może je zmieniać); UI tłumaczy nazwy domyślne przez t().
export const DEFAULT_JUMPS = [
  { id: 'open', name: 'Do 9:30 NY', cel: { kind: 'time', at: '09:30' }, skrot: '1' },
  { id: 'nySession', name: 'Następna sesja NY', cel: { kind: 'nextDay' }, skrot: '2' },
  { id: 'news', name: 'Następny news', cel: { kind: 'news', minImp: 'high' }, skrot: '3' },
  { id: 'nextDay', name: 'Następny dzień z filtra', cel: { kind: 'filterDay' }, skrot: '4' },
  { id: 'plus15', name: '+15 min', cel: { kind: 'offset', sec: 900 }, skrot: '5' },
];

// bez listy dni handlowych (indeks jeszcze się wczytuje): dni robocze najwyżej tyle dni naprzód
const SCAN_DAYS = 14;
function candidates(cursor, list) {
  if (Array.isArray(list) && list.length) return list;
  const n0 = nyDayNum(cursor), out = [];
  for (let n = n0; n <= n0 + SCAN_DAYS; n++) { const w = weekdayOf(n); if (w >= 1 && w <= 5) out.push(dateStr(n)); }
  return out;
}
// Cel skoku: { cursor } (zawsze > kursor i ≤ max) albo null (nie ma dokąd skoczyć).
// ctx = { cursor, startTime, news, tradingDays: Day[] (dni z danymi, rosnąco), filterDays: Day[] (dni z filtra sesji, rosnąco), max (koniec danych) }.
export function jumpTarget(jump, ctx) {
  const cel = jump && jump.cel;
  if (!cel || !ctx) return null;
  const { cursor, news = [], startTime = '09:00' } = ctx;
  const max = Number.isFinite(ctx.max) ? ctx.max : Infinity;
  const ok = (t) => (Number.isFinite(t) && t > cursor && t <= max ? { cursor: t } : null);
  const firstAt = (days, at) => {
    const from = dateStr(nyDayNum(cursor) - 1);
    for (const d of days) { if (d < from) continue; const t = nyAt(d, at); if (t > max) return null; if (t > cursor) return { cursor: t }; }
    return null;
  };
  switch (cel.kind) {
    case 'time': return firstAt(candidates(cursor, ctx.tradingDays), cel.at);
    case 'nextDay': return firstAt(candidates(cursor, ctx.tradingDays), startTime);
    case 'filterDay': return firstAt(Array.isArray(ctx.filterDays) ? ctx.filterDays : candidates(cursor, ctx.tradingDays), startTime);
    case 'session': {
      const def = SESSIONS.find((s) => s.id === cel.id);
      if (!def) return null;
      const [h, m] = hhmm(def.from), n0 = nyDayNum(cursor);
      // najbliższy początek sesji po kursorze, w którym giełda handluje (sesja CME otwarta); weekend i przerwa odpadają
      for (let d = n0; d <= n0 + SCAN_DAYS; d++) { const t = etToUtc(d, h, m); if (t > cursor && sessionBounds(t)) return ok(t); }
      return null;
    }
    case 'news': { const e = nextNews(news, cursor, cel.minImp); return e ? ok(e.t) : null; }
    case 'offset': return Number.isFinite(cel.sec) && cel.sec > 0 && cursor < max ? { cursor: Math.min(cursor + cel.sec, max) } : null;
    default: return null;
  }
}

// ---- skróty ----
// [B] 30.10.2026: mapowania FX Replay niepotwierdzone w dokumentacji, więc własne domyślne. Klucze to `skrot`/`skroty`, nigdy `key` (sanitizeSettings wycina /key/).
export const DEFAULT_SKROTY = {
  play: 'Space', stepFwd: 'Shift+ArrowRight', stepBack: 'Shift+ArrowLeft', jump: 'J', speedUp: ']', speedDown: '[',
  buy: 'B', sell: 'S', closeAll: 'Shift+C',
  // K (31.10.2026): bez „Zakończ dzień” (endDay), czas płynie bez końca dnia
  // J (30.10.2026): wejście według zaznaczonego rysunku pozycji (bt-zlecenia.js); nazwa bez „key” (sanitizeSettings)
  drawEntry: 'D',
  // M (31.10.2026): SL na BE i zamknięcie połowy pozycji z klawiatury (wcześniej tylko myszą); nazwy bez „key” (sanitizeSettings)
  be: 'E', half: 'H',
};
// Klawisze zajęte przez rysunki (Escape, Ctrl+Z, strzałki: rysunki.js) i podgląd wykresu (strzałki, +, =, −: podglad.js) oraz pola formularzy.
// L (31.10.2026): Ctrl+J otwiera Journal (jak w FX Replay), więc nie może być skrótem skoku ani akcji.
export const RESERVED_SKROTY = ['Escape', 'Ctrl+Z', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Enter', 'Delete', 'Backspace', 'Ctrl+J'];

// M (31.10.2026): skrót w podpowiedzi przycisku: strzałki jako symbole, „Space” po polsku; „akcja (skrót)” albo sama akcja bez skrótu
const ARROWS = { ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓' };
export function skrotLabel(s) {
  if (!s) return '';
  return String(s).split('+').map((p) => ARROWS[p] || (p === 'Space' ? t('Spacja') : p)).join('+');
}
export const hintOf = (label, skrot) => (skrot ? `${label} (${skrotLabel(skrot)})` : label);

const MOD_ONLY = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'CapsLock']);
// Zdarzenie klawiatury → tekst skrótu ('Ctrl+Alt+Shift+Klawisz'). Litery wielkie; Shift przy znaku nieliterowym pomijany (jest już w znaku, np. '+');
// Cmd (meta) liczy się jak Ctrl. Sam modyfikator → ''.
export function skrotOf(ev) {
  let k = ev && ev.key;
  if (!k || MOD_ONLY.has(k)) return '';
  if (k === ' ' || k === 'Spacebar') k = 'Space';
  const single = [...k].length === 1;
  if (single) k = k.toUpperCase();
  const letter = single && /\p{L}/u.test(k);
  const parts = [];
  if (ev.ctrlKey || ev.metaKey) parts.push('Ctrl');
  if (ev.altKey) parts.push('Alt');
  if (ev.shiftKey && (!single || letter || /\d/.test(k))) parts.push('Shift');
  parts.push(k);
  return parts.join('+');
}

const norm = (s) => String(s || '').trim().toUpperCase();
// Kolizje: skrót zarezerwowany (b = 'reserved'), dwa skoki albo skok i akcja z tym samym skrótem. a/b: nazwa akcji z `skroty` albo 'jump:<id>'.
export function collisions(skroty = {}, jumps = []) {
  const items = [
    ...Object.entries(skroty || {}).map(([id, skrot]) => ({ id, skrot })),
    ...(jumps || []).map((j) => ({ id: `jump:${j.id}`, skrot: j.skrot })),
  ].filter((x) => norm(x.skrot));
  const reserved = new Set(RESERVED_SKROTY.map(norm));
  const out = [];
  for (const x of items) if (reserved.has(norm(x.skrot))) out.push({ a: x.id, b: 'reserved', skrot: x.skrot });
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (norm(items[i].skrot) === norm(items[j].skrot)) out.push({ a: items[i].id, b: items[j].id, skrot: items[i].skrot });
    }
  }
  return out;
}

// ---- ustawienia Backtestu (C2): blok `bt` w ustawieniach dashboardu, synchronizowany przez sanitizeSettings ----
// Klucze to `skrot`/`skroty`, nigdy `key` (sanitizeSettings wycina /key|pin|…/i). Brak `jumps` w zapisie = skoki domyślne (DEFAULT_JUMPS).
export const BT_SPEEDS = [1, 10, 60, 100, 300];
export const SKROT_ACTIONS = Object.keys(DEFAULT_SKROTY);
export const CEL_KINDS = ['time', 'session', 'news', 'offset', 'nextDay', 'filterDay'];
const cloneJson = (x) => JSON.parse(JSON.stringify(x));
export function btDefaults() {
  return { jumps: cloneJson(DEFAULT_JUMPS), skroty: { ...DEFAULT_SKROTY }, startTime: '09:00', risk: { mode: 'usd', value: 500 }, speed: 100, templates: [], sessionsCopy: [] };
}
function sanitizeCel(c) {
  if (!c || typeof c !== 'object') return null;
  switch (c.kind) {
    case 'time': return /^([01]\d|2[0-3]):[0-5]\d$/.test(c.at) ? { kind: 'time', at: c.at } : null;
    case 'session': return SESSIONS.some((s) => s.id === c.id) ? { kind: 'session', id: c.id } : null;
    case 'news': return { kind: 'news', minImp: c.minImp === 'medium' ? 'medium' : 'high' };
    case 'offset': return Number.isFinite(c.sec) && c.sec > 0 && c.sec <= 36000 ? { kind: 'offset', sec: Math.round(c.sec) } : null;
    case 'nextDay': return { kind: 'nextDay' };
    case 'filterDay': return { kind: 'filterDay' };
    default: return null;
  }
}
// Dowolny zapis (localStorage, synchronizacja z innego urządzenia) → poprawny blok `bt`; złe pola wracają do domyślnych, złe skoki odpadają.
export function sanitizeBt(v) {
  const d = btDefaults(), o = v && typeof v === 'object' ? v : {};
  if (Array.isArray(o.jumps)) {
    const seen = new Set();
    d.jumps = o.jumps.slice(0, 40).map((j) => {
      let cel = sanitizeCel(j?.cel);
      const id = String(j?.id || '').slice(0, 24);
      // K: domyślny skok „Następny dzień z filtra” z 1.5.0 miał rodzaj nextDay; teraz filterDay ([U] 31.10.2026 «Filtr jako skok»)
      if (id === 'nextDay' && cel?.kind === 'nextDay') cel = { kind: 'filterDay' };
      if (!cel || !id || seen.has(id)) return null;
      seen.add(id);
      return { id, name: String(j.name || '').trim().slice(0, 60) || id, cel, skrot: String(j.skrot || '').slice(0, 24) };
    }).filter(Boolean);
  }
  if (o.skroty && typeof o.skroty === 'object') for (const k of SKROT_ACTIONS) if (typeof o.skroty[k] === 'string') d.skroty[k] = o.skroty[k].slice(0, 24);
  // J: zapis sprzed nowej akcji (bez pola) dostaje skrót domyślny tylko, gdy niczego nie zajmuje; inaczej zostaje pusty, a skrót użytkownika (np. skoku) się nie zmienia
  for (const k of SKROT_ACTIONS) {
    if (o.skroty && typeof o.skroty === 'object' && typeof o.skroty[k] !== 'string' && collisions(d.skroty, d.jumps).some((c) => c.a === k || c.b === k)) d.skroty[k] = '';
  }
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(o.startTime) && o.startTime < '16:00') d.startTime = o.startTime;
  if (o.risk && (o.risk.mode === 'usd' || o.risk.mode === 'pct') && Number(o.risk.value) > 0 && !(o.risk.mode === 'pct' && Number(o.risk.value) > 100)) d.risk = { mode: o.risk.mode, value: Number(o.risk.value) };
  if (BT_SPEEDS.includes(Number(o.speed))) d.speed = Number(o.speed);
  // skróty zarezerwowane i zdublowane (np. z synchronizacji z innego urządzenia) są czyszczone: zostaje pierwszy z równych
  for (const c of collisions(d.skroty, d.jumps)) {
    const clear = (id) => { if (id.startsWith('jump:')) { const j = d.jumps.find((x) => `jump:${x.id}` === id); if (j) j.skrot = ''; } else d.skroty[id] = ''; };
    clear(c.b === 'reserved' ? c.a : c.b);
  }
  if (Array.isArray(o.templates)) {
    d.templates = [];
    for (const e of o.templates.map(templateOf).filter(Boolean).slice(0, TEMPLATES_MAX)) if (templatesSize([...d.templates, e]) <= TEMPLATES_BUDGET) d.templates.push(e);
  }
  if (Array.isArray(o.sessionsCopy)) d.sessionsCopy = o.sessionsCopy.filter(copyEntryOk).slice(0, COPY_SESSIONS);
  return d;
}

// ---- kopia definicji sesji w bloku ustawień (E2, karta: bt.sessionsCopy = [{ id, name, def }] bez puli, trade'ów i rysunków) ----
// sanitizeSettings (lib/sync.mjs) przepuszcza 6 poziomów, napisy do 500 znaków i tablice do 200 elementów, a klucze pasujące do filtra sekretów wycina.
// Definicja leży na 4. poziomie (settings → bt → sessionsCopy → [i] → def), więc drzewo filtra i lista wykluczonych dni idą jako JSON pocięty na kawałki
// po 400 znaków (filterJ, excludedJ): przechodzą bez strat niezależnie od głębokości drzewa i nazw jego kluczy. Reszta definicji to pola płaskie.
export const COPY_MAX = 30000;   // znaków JSON całej kopii; więcej → kopia pominięta (sesje tylko lokalnie)
export const COPY_SESSIONS = 50;
const COPY_CHUNK = 400;
const COPY_ID_RE = /^bt-[a-z0-9]{6,20}$/; // jak SESSION_ID_RE (lib/backtest-store.mjs)
// S5 (przegląd bezpieczeństwa E2, F1): drzewo filtra idzie do kopii jako napisy, więc filtr kluczy sekretów sanitizeSettings go nie widzi. Reguła skopiowana z SECRET_KEY w lib/sync.mjs
// (czysty moduł przeglądarki nie importuje kodu serwera); zgodność pilnuje test backtest-F1: kopia filtra bez kluczy wrażliwych.
export const SECRET_KEY = /token|secret|password|haslo|hasło|pin|key|databento|chartcost|chartdaily|chartcredit|chartspen/i;
export function stripSecretKeys(v) {
  if (Array.isArray(v)) return v.map(stripSecretKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !SECRET_KEY.test(k)).map(([k, x]) => [k, stripSecretKeys(x)]));
  return v;
}
const chunkJson = (v) => (JSON.stringify(v ?? null).match(new RegExp(`[\\s\\S]{1,${COPY_CHUNK}}`, 'g')) || ['null']);
// ---- szablony filtra dni (F2): bt.templates = [{ name, filterJ }] ----
// Karta mówi { name, filter }, ale drzewo filtra schodzi głębiej niż 6 poziomów sanitizeSettings (uwaga z review C2), więc tak jak kopia definicji sesji (E2)
// szablon trzyma filtr jako JSON pocięty na kawałki po 400 znaków (filterJ): wpis ma 4 poziomy, a napisy mieszczą się w limicie 500 znaków. Stary zapis { name, filter } jest przejmowany.
export const TEMPLATES_MAX = 50;
// Review G #10c: łączny budżet szablonów (znaki JSON wszystkich kawałków i nazw) względem bloku ustawień (lib/sync.mjs: 100 napisów × 1 900 znaków), z miejscem na resztę
// ustawień i kopię sesji (COPY_MAX). Przekroczenie: zapis szablonu odmawia z komunikatem, sanitizeBt zostawia pierwsze mieszczące się szablony.
export const TEMPLATES_BUDGET = 30000;
export const templatesSize = (list) => (list || []).reduce((a, e) => a + String(e?.name || '').length + (Array.isArray(e?.filterJ) ? e.filterJ.reduce((b, c) => b + String(c).length, 0) : 0), 0);
const TEMPLATE_CHUNKS = 20; // do 8 000 znaków JSON na szablon
export function templateEntry(name, filter) {
  return { name: String(name ?? '').trim().slice(0, 60), filterJ: chunkJson(stripSecretKeys(filter ?? null)) };
}
export function templateOf(x) {
  if (!x || typeof x !== 'object' || typeof x.name !== 'string') return null;
  const name = x.name.trim().slice(0, 60);
  if (!name) return null;
  let e;
  if (Array.isArray(x.filterJ)) {
    if (!x.filterJ.length || x.filterJ.length > TEMPLATE_CHUNKS || x.filterJ.some((c) => typeof c !== 'string' || c.length > COPY_CHUNK)) return null;
    e = { name, filterJ: x.filterJ.slice() };
  } else if (x.filter && typeof x.filter === 'object' && !Array.isArray(x.filter)) {
    e = templateEntry(name, x.filter);
    if (e.filterJ.length > TEMPLATE_CHUNKS) return null;
  } else return null;
  const f = templateFilter(e);
  return f && typeof f === 'object' && !Array.isArray(f) && validateFilter(f) ? e : null; // review G #1: parametry warunków sprawdzone, zły szablon odpada
}
export function templateFilter(e) {
  try { return Array.isArray(e?.filterJ) ? JSON.parse(e.filterJ.join('')) : null; } catch { return null; }
}
const unchunk = (a, dflt) => { try { return Array.isArray(a) ? JSON.parse(a.join('')) : dflt; } catch { return dflt; } };
function copyEntryOk(x) {
  return !!x && typeof x === 'object' && typeof x.id === 'string' && COPY_ID_RE.test(x.id) && typeof x.name === 'string' && !!x.def && typeof x.def === 'object' && !Array.isArray(x.def);
}
export function copyDef(def) {
  const d = def && typeof def === 'object' ? def : {};
  const out = {
    instruments: Array.isArray(d.instruments) ? d.instruments.filter((x) => typeof x === 'string').slice(0, 4) : [],
    // K: bez daty końca, kolejności i ziarna ([U] 31.10.2026 «Do końca danych», «Filtr jako skok»)
    from: String(d.from ?? ''), balance: Number.isFinite(d.balance) ? d.balance : null,
    risk: d.risk && typeof d.risk === 'object' ? { mode: d.risk.mode === 'pct' ? 'pct' : 'usd', value: Number.isFinite(d.risk.value) ? d.risk.value : null } : null,
    startTime: String(d.startTime ?? '09:00'), accountId: typeof d.accountId === 'string' ? d.accountId : null,
    filterJ: chunkJson(stripSecretKeys(d.filter ?? null)), excludedJ: chunkJson(Array.isArray(d.excluded) ? d.excluded : []),
    // L: prowizja i podstawa ryzyka % tylko, gdy różne od domyślnych (kopie sprzed L bez zmian)
    ...(Number.isFinite(d.commission) && d.commission > 0 ? { commission: d.commission } : {}),
    ...(d.riskBase === 'start' ? { riskBase: 'start' } : {}),
  };
  return out;
}
// Kopia → definicja sesji (odtworzenie sesji na innym urządzeniu)
export function defFromCopy(c) {
  const o = c && typeof c === 'object' ? c : {};
  const { filterJ, excludedJ, ...flat } = o;
  return { ...flat, filter: unchunk(filterJ, null), excluded: unchunk(excludedJ, []) };
}
// sessions: lista sesji tego urządzenia (GET /api/backtest/sessions, z def); prev: dotychczasowa kopia (także z innych urządzeń: ich wpisy zostają, lokalny wygrywa).
// Zwraca { copy, size, skipped }: skipped = liczba lokalnych sesji, które nie zmieściły się w COPY_MAX (notka w Ustawieniach).
// Review E2 #7: istniejące wpisy (także z innych urządzeń) nigdy nie znikają; lokalne sesje (od najnowszej, kolejność listy) dochodzą albo zastępują swoją starą
// wersję, dopóki kopia mieści się w limicie; nowa wersja, która się nie mieści, zostawia starą.
export function sessionsCopyOf(sessions = [], prev = []) {
  const local = (Array.isArray(sessions) ? sessions : []).filter((s) => s && COPY_ID_RE.test(String(s.id)) && s.def).map((s) => ({ id: s.id, name: String(s.name ?? '').slice(0, 120), def: copyDef(s.def) }));
  const copy = (Array.isArray(prev) ? prev : []).filter(copyEntryOk).slice(0, COPY_SESSIONS);
  let size = JSON.stringify(copy).length, skipped = 0;
  for (const e of local) {
    const i = copy.findIndex((x) => x.id === e.id);
    const len = JSON.stringify(e).length;
    const next = i >= 0 ? size - JSON.stringify(copy[i]).length + len : size + len + (copy.length ? 1 : 0);
    if (next > COPY_MAX || (i < 0 && copy.length >= COPY_SESSIONS)) { skipped++; continue; }
    if (i >= 0) copy[i] = e; else copy.push(e);
    size = next;
  }
  // kolejność: lokalne wg listy (najnowsze najpierw), potem pozostałe
  const order = new Map(local.map((x, k) => [x.id, k]));
  copy.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  return { copy, size: JSON.stringify(copy).length, skipped };
}
