// Presety zleceń Backtestu (pakiet 1.7-3): nazwane zestawy SL, TP, wielkości i auto-BE, wybierane chipem pod Kup/Sprzedaj (jak „Scalper mode” w FX Replay).
// Czysty moduł (bez DOM, bez I/O), działa w przeglądarce i w Node. Presety leżą w bloku ustawień `bt` (bt.presets, bt.activePreset) i przechodzą sanitizeSettings:
// w kluczach nie ma niczego, co pasuje do filtra sekretów (key/pin/token…), głębokość to 6 poziomów (settings → bt → presets → [i] → tps → [j] → pole).
// Model: docs/plany/backtest/1.7.0/etap-1-7-3-auto-be-presety.md, sekcje C i D.
// English: named order presets (SL, TP, size, auto-BE) for one-click entries; pure sanitising, validation and preset → order conversion.
import { t } from './i18n.js';
import { sizeFromRisk, TICK } from './bt-wypelnienia.js';
import { AUTOBE_KINDS, AUTOBE_OFFSET_MAX } from './bt-ksiega.js';
import { TPS_MAX, ladderPcts } from './bt-drabinka.js';

export const PRESETS_MAX = 20;
export const PRESET_NAME_MAX = 24;
// Budżet znaków JSON całej listy (jak TEMPLATES_BUDGET szablonów filtra): nadmiar odrzucany
export const PRESETS_BUDGET = 30000;
export const PRESET_SL_UNITS = ['pts', 'ticks'];
export const PRESET_TP_UNITS = ['pts', 'ticks', 'rr'];
export const PRESET_SIZE_MODES = ['session', 'usd', 'pct', 'qty'];
// Auto-BE w presecie: bez rodzaju 'price' (cena bezwzględna nie ma sensu w zestawie używanym na każdej cenie)
export const PRESET_ABE_KINDS = AUTOBE_KINDS.filter((k) => k !== 'price');
const VALUE_MAX = 100000;

const posNum = (x) => (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '')) && Number.isFinite(Number(x)) && Number(x) > 0 && Number(x) <= VALUE_MAX;
const r4 = (x) => Math.round(Number(x) * 10000) / 10000;

// Jeden wpis z ustawień (albo z edytora) → poprawny Preset albo null. Obce pola odpadają, liczby w zakresach, zależności (R:R, ryzyko i auto-BE w R wymagają SL) sprawdza presetErrors.
export function presetOf(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const id = typeof x.id === 'string' && /^[a-z0-9]{1,24}$/i.test(x.id) ? x.id : '';
  const name = typeof x.name === 'string' ? x.name.trim().slice(0, PRESET_NAME_MAX) : '';
  if (!id || !name) return null;
  let sl = null;
  if (x.sl !== null && x.sl !== undefined) {
    if (!x.sl || typeof x.sl !== 'object' || !PRESET_SL_UNITS.includes(x.sl.unit) || !posNum(x.sl.value)) return null;
    sl = { unit: x.sl.unit, value: r4(x.sl.value) };
  }
  // 1.7-5: do 4 poziomów TP z procentem; procenty nie-ostatnich to liczby całkowite ≥ 1 o sumie < 100, ostatni poziom jest resztą (100 − suma), pojedynczy ma 100; brak procentów = po równo.
  // Więcej niż 4 poziomy albo zły procent unieważniają cały preset (zły wpis odpada bez psucia pozostałych).
  let tps = [];
  if (Array.isArray(x.tps)) {
    if (x.tps.length > TPS_MAX) return null;
    for (const p of x.tps) {
      if (!p || typeof p !== 'object' || !PRESET_TP_UNITS.includes(p.unit) || !posNum(p.value)) return null;
      tps.push({ unit: p.unit, value: r4(p.value), pct: p.pct });
    }
    const pcts = ladderPcts(tps);
    if (!pcts) return null;
    tps = tps.map((p, i) => ({ unit: p.unit, value: p.value, pct: pcts[i] }));
  }
  const sz = x.size && typeof x.size === 'object' ? x.size : null;
  if (!sz || !PRESET_SIZE_MODES.includes(sz.mode)) return null;
  let size;
  if (sz.mode === 'session') size = { mode: 'session', value: 0 };
  else {
    if (!posNum(sz.value)) return null;
    const v = Number(sz.value);
    if (sz.mode === 'pct' && v > 100) return null;
    if (sz.mode === 'qty' && (!Number.isInteger(v) || v > 1000)) return null;
    size = { mode: sz.mode, value: r4(v) };
  }
  let autoBe = null;
  if (x.autoBe !== null && x.autoBe !== undefined) {
    const a = x.autoBe;
    if (!a || typeof a !== 'object' || !PRESET_ABE_KINDS.includes(a.kind) || !posNum(a.value)) return null;
    const off = a.offsetTicks === undefined || a.offsetTicks === null ? 0 : Number(a.offsetTicks);
    if (!Number.isInteger(off) || off < 0 || off > AUTOBE_OFFSET_MAX) return null;
    autoBe = { kind: a.kind, value: r4(a.value), offsetTicks: off };
  }
  return { id, name, sl, tps, size, autoBe };
}

// Błędy edytora (powód przy polu): { name?, tp?, size?, abe? }. Pusty obiekt = preset poprawny. others = pozostałe presety (unikalność nazwy).
export function presetErrors(p, others = []) {
  const e = {};
  const name = String(p?.name ?? '').trim();
  if (!name) e.name = t('Wpisz nazwę presetu.');
  else if (others.some((o) => o && o.id !== p.id && String(o.name).trim().toLowerCase() === name.toLowerCase())) e.name = t('Preset o tej nazwie już jest.');
  const hasSl = !!p?.sl;
  if (p?.tps?.some((x) => x.unit === 'rr') && !hasSl) e.tp = t('TP w R:R wymaga SL.');
  else {
    // 1.7-5: poziomy rosnąco od wejścia (porównanie w punktach; R:R przez SL): „TP2 bliżej niż TP1.”, także gdy równe
    const d = (p?.tps || []).map((x) => tpPts(x, p.sl ? ptsOf(p.sl) : null));
    for (let i = 1; i < d.length; i++) if (!(d[i] > d[i - 1])) { e.tp = t('TP{n} bliżej niż TP{m}.', { n: i + 1, m: i }); break; }
  }
  if (p?.size && p.size.mode !== 'qty' && !hasSl) e.size = t('Wielkość z ryzyka wymaga SL.');
  if (p?.autoBe?.kind === 'r' && !hasSl) e.abe = t('Auto BE w R wymaga SL.');
  return e;
}

// Lista z ustawień (dowolny zapis, także z innego urządzenia) → poprawna lista: zły wpis odpada bez psucia pozostałych, id i nazwy unikalne, najwyżej PRESETS_MAX, w budżecie znaków.
export function sanitizePresets(list, { budget = PRESETS_BUDGET } = {}) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const raw of list) {
    const p = presetOf(raw);
    if (!p || out.some((o) => o.id === p.id) || Object.keys(presetErrors(p, out)).length) continue;
    if (out.length >= PRESETS_MAX) break;
    if (JSON.stringify([...out, p]).length > budget) continue;
    out.push(p);
  }
  return out;
}

// Nowe id presetu: litery i cyfry, unikalne w liście
export function newPresetId(list = [], rnd = Math.random) {
  for (let i = 0; i < 50; i++) {
    const id = `p${Math.floor(rnd() * 36 ** 6).toString(36).padStart(6, '0')}`;
    if (!list.some((p) => p.id === id)) return id;
  }
  return `p${Date.now().toString(36)}`;
}

const ptsOf = (u) => (u.unit === 'ticks' ? u.value * TICK : u.value);
// odległość poziomu TP od wejścia w punktach (R:R przez SL w punktach)
const tpPts = (tp, slPts) => (tp.unit === 'rr' ? tp.value * slPts : ptsOf(tp));
const num = (x) => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(x);
// Skrót opisu: „SL 10 pkt · TP 2R · ryzyko sesji · auto BE 1R”
export function autoBeText(a) {
  if (!a) return '';
  const v = num(a.value), u = { r: 'R', pts: ` ${t('pkt')}`, ticks: ` ${t('ticki')}`, usd: ' $', price: '' }[a.kind] ?? '';
  return `${v}${u}${a.offsetTicks ? ` +${a.offsetTicks}t` : ''}`;
}
export function presetSummary(p) {
  if (!p) return '';
  const parts = [];
  parts.push(p.sl ? `SL ${num(p.sl.value)} ${p.sl.unit === 'ticks' ? t('ticki') : t('pkt')}` : t('bez SL'));
  // 1.7-5: drabina „TP 1R 50% / 3R” (procent przy poziomach oprócz ostatniego = reszty)
  if (p.tps?.length) {
    const lv = (x) => `${num(x.value)}${x.unit === 'rr' ? 'R' : ` ${x.unit === 'ticks' ? t('ticki') : t('pkt')}`}`;
    parts.push(`TP ${p.tps.map((x, i) => (i < p.tps.length - 1 ? `${lv(x)} ${x.pct}%` : lv(x))).join(' / ')}`);
  }
  const sz = p.size;
  parts.push(sz.mode === 'session' ? t('ryzyko sesji') : sz.mode === 'usd' ? `${t('ryzyko')} ${num(sz.value)} $` : sz.mode === 'pct' ? `${t('ryzyko')} ${num(sz.value)}% ${t('salda')}` : t.p('{n} kontraktów', sz.value));
  if (p.autoBe) parts.push(`${t('auto BE')} ${autoBeText(p.autoBe)}`);
  return parts.join(' · ');
}

// Preset → zlecenie dla strony side przy cenie wejścia entry (zlecenie rynkowe; wartości w punktach i tickach działają na każdym instrumencie).
// ctx = { side, entry, instrument, riskUsd (ryzyko sesji), balance (saldo do % ryzyka) }. Wynik { order, slPts } albo { err: 'no-entry'|'rr-no-sl'|'size-no-sl'|'small', oneRisk? }:
// 'small' = ryzyko za małe na ten SL (UI proponuje 1 kontrakt: oneRisk = ryzyko jednego kontraktu w $).
export function presetOrder(p, { side, entry, instrument, riskUsd, balance } = {}) {
  if (!p || !Number.isFinite(entry) || (side !== 'buy' && side !== 'sell')) return { err: 'no-entry' };
  const dir = side === 'buy' ? 1 : -1, q = (x) => Math.round(x / TICK) * TICK;
  const slPts = p.sl ? ptsOf(p.sl) : null;
  const sl = slPts ? q(entry - dir * slPts) : null;
  // 1.7-5: poziomy drabiny od ceny wejścia (R:R wymaga SL); procenty za poziomami
  const levels = [];
  for (const t0 of p.tps || []) {
    if (t0.unit === 'rr' && !slPts) return { err: 'rr-no-sl' };
    levels.push({ price: q(entry + dir * tpPts(t0, slPts)), pct: t0.pct });
  }
  const tp = levels.length ? levels[levels.length - 1].price : null;
  let qty;
  const m = p.size.mode;
  if (m === 'qty') qty = p.size.value;
  else {
    if (!slPts) return { err: 'size-no-sl' };
    const risk = m === 'session' ? riskUsd : m === 'usd' ? p.size.value : (Number(balance) * p.size.value) / 100;
    qty = sizeFromRisk({ riskUsd: risk, entry: slPts, sl: 0, instrument });
    if (!(qty >= 1)) return { err: 'small', slPts };
  }
  const autoBe = p.autoBe ? { kind: p.autoBe.kind, value: p.autoBe.value, offsetTicks: p.autoBe.offsetTicks } : null;
  // pojedynczy TP zostaje w kształcie 1.7-3 (bez klucza tps), drabina niesie `tps` (silnik: checkTps), tp = najdalszy poziom
  return { order: { instrument, side, type: 'market', qty, sl, tp, ...(levels.length > 1 ? { tps: levels } : {}), autoBe }, slPts };
}
