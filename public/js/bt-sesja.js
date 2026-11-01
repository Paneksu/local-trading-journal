// Model sesji backtestu v2 (pakiet K, 31.10.2026): ciągła oś czasu jak w FX Replay. Czysty moduł (bez DOM, bez I/O), działa w przeglądarce i w Node (lib/backtest-store.mjs).
// [U] 31.10.2026 «nie powinno byc takiego czegos jak koniec dnia, tylko mozesz przesuwac czas tyle ile chcesz a po prostu jest opcja skokow»: sesja ma datę startu
// (def.from) i kursor, bez puli dni, statusów dni i daty końca ([U] 31.10.2026 «Do końca danych»).
// [U] 31.10.2026 «Przenieś»: sesja v1 (1.5.0) otwiera się w modelu v2 bez utraty danych; stare pola zostają w `v1`.
// English: v2 session model (continuous replay time) and the lossless v1 → v2 migration applied on read.
import { nyAt } from './bt-czas.js';

export const SESSION_V = 2;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

// Rysunki v1 { Sym: { Day: Doc } } → { Sym: Doc }: kształty wszystkich dni w jednym dokumencie (widoczne na całej osi), dubel id = wersja z nowszego zapisu (pole at dokumentu dnia; przy równym at późniejszy dzień).
function mergeDrawings(byDay) {
  const out = {};
  for (const [sym, days] of Object.entries(byDay && typeof byDay === 'object' ? byDay : {})) {
    if (!days || typeof days !== 'object') continue;
    // dokument już w kształcie v2 (ma tablicę d) zostaje
    if (Array.isArray(days.d)) { out[sym] = clone(days); continue; }
    const keys = Object.keys(days).filter((k) => DAY_RE.test(k)).sort((a, b) => String(days[a]?.at || '').localeCompare(String(days[b]?.at || '')) || a.localeCompare(b));
    const byId = new Map(), anon = [];
    let at = null;
    for (const k of keys) {
      const doc = days[k];
      if (!doc || !Array.isArray(doc.d)) continue;
      if (doc.at && (!at || doc.at > at)) at = doc.at;
      for (const sh of doc.d) { if (sh && sh.id != null) { byId.delete(sh.id); byId.set(sh.id, clone(sh)); } else anon.push(clone(sh)); }
    }
    const d = [...byId.values(), ...anon];
    if (d.length) out[sym] = { v: 1, at: at || new Date(0).toISOString(), d };
  }
  return out;
}

// migrateSession(doc) → nowy dokument v2 (wejście bez zmian). Dokument v2 wraca jako kopia bez zmian (idempotentna).
export function migrateSession(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return doc;
  if (doc.v === SESSION_V) return clone(doc);
  const src = clone(doc);
  const { pool, dayIdx, days, drawings, ...rest } = src;
  const def = { ...(src.def || {}) };
  const { order, seed, to } = def;
  delete def.order; delete def.seed; delete def.to;
  const list = Array.isArray(pool) ? pool.filter((x) => typeof x === 'string' && DAY_RE.test(x)) : [];
  // data startu = najwcześniejszy dzień dawnej puli (przy „od najnowszych” pool[0] to dzień najpóźniejszy, a kursor nie schodzi przed start)
  if (list.length) def.from = [...list].sort()[0];
  let cursor = Number.isFinite(src.cursor) ? src.cursor : null;
  const curDay = list[Number.isInteger(dayIdx) ? dayIdx : 0] || list[0];
  if (cursor == null && curDay) { try { cursor = nyAt(curDay, def.startTime || '09:00'); } catch { cursor = null; } }
  const out = { ...rest, v: SESSION_V, def, cursor, drawings: mergeDrawings(drawings) };
  out.v1 = { pool: pool ?? [], dayIdx: dayIdx ?? 0, days: days ?? {}, order: order ?? null, seed: seed ?? null, to: to ?? null, drawings: drawings ?? {} };
  return out;
}

// Dzień NY (YYYY-MM-DD) chwili w sekundach: dzień trade'a (Notion, statystyki) liczony z czasu wejścia.
// Formatter tworzony raz (konstruktor Intl jest drogi, a replay pyta o dzień przy każdej klatce)
let nyFmt = null;
export function nyDayOf(sec) {
  nyFmt ||= new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  return nyFmt.format(new Date(Math.floor(sec) * 1000));
}
