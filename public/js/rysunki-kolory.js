// Domyślne kolory rysunków za motywem (H2, 30.10.2026). Decyzja sesji głównej po zgłoszeniu użytkownika o podglądzie: callout i linia z kolorem domyślnym
// były prawie niewidoczne na jasnym podglądzie (Platinum), bo kolor z tokenów trafiał do zapisu jako literał z motywu, w którym rysunek powstał (zwykle Onyx).
// Teraz rysunki z kolorem domyślnym rysują się kolorem z tokenów bieżącego motywu (edytor LWC Live i replay, podgląd SVG), także po przełączeniu motywu na żywo.
// Kolor wybrany ręcznie w panelu stylu zostaje bez zmian.
//
// Zapis (zgodny z paczką 0.6.2 i starszymi wersjami aplikacji):
//   style.autoColor = { 'color': 'fg', 'textColor': 'fg', 'rectMiddleLine.color': 'be', … }: ścieżki koloru z kolorem domyślnym i token, za którym idą;
//   poziom Fibonacciego/Gann boxa z kolorem domyślnym: { coeff, color, visible, auto: 'fg2' }.
//   Pod tymi ścieżkami zapis trzyma zawsze wartość z Onyx (literał), więc stara wersja aplikacji (i sama paczka, która nie zna tych pól, ale ich nie usuwa)
//   otwiera rysunek tak jak dotąd. Rysunek ze znacznikiem autoColor: ścieżka spoza znacznika = kolor ręczny.
//   Rysunek bez znacznika (zapisany przed H2): kolor równy wartości domyślnej tokenu (Onyx albo Platinum, dla --be/--profit/--loss każda gotowa paleta) = domyślny.
// English: default-coloured drawings follow the current theme; manual colours stay; Onyx literals keep old app versions working.
import { styleFor, toolKeyOf } from './rysunki.js';
import { PALETTES } from './palety.js';

export const TOKENS = ['fg', 'fg2', 'be', 'profit', 'loss', 'asia', 'london', 'ny'];
export const TOKEN_VARS = { fg: '--fg', fg2: '--fg-2', be: '--be', profit: '--profit', loss: '--loss', asia: '--n-blue', london: '--n-orange', ny: '--n-purple' };
// Wartości tokenów tak, jak czyta je readColors (wykres.js: probe → #rrggbb); --n-* to oklch ze styles.css przeliczone przez canvas Chromium.
const BASE = PALETTES.find((p) => p.id === 'color').colors;
export const THEME_COLORS = {
  onyx: { fg: '#f3f3f3', fg2: '#9aa0a6', asia: '#80bdfb', london: '#ffa460', ny: '#cca7f8', ...BASE.onyx },
  platinum: { fg: '#050913', fg2: '#3c4044', asia: '#004a9c', london: '#8f3500', ny: '#622c91', ...BASE.platinum },
};
export const ONYX = THEME_COLORS.onyx;
// Kolory zapisane bez znacznika i z tą wartością uznajemy za domyślne
const KNOWN = Object.fromEntries(TOKENS.map((k) => [k, new Set([THEME_COLORS.onyx[k], THEME_COLORS.platinum[k]])]));
for (const p of PALETTES) if (p.colors) for (const th of ['onyx', 'platinum']) for (const k of ['profit', 'loss', 'be']) KNOWN[k].add(p.colors[th][k]);
// podgląd SVG: kolory jako zmienne CSS, więc przełączenie motywu działa bez ponownego rysowania
export const CSS_COLORS = Object.fromEntries(TOKENS.map((k) => [k, `var(${TOKEN_VARS[k]})`]));

const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const getP = (st, p) => { const i = p.indexOf('.'); return i < 0 ? st[p] : st[p.slice(0, i)]?.[p.slice(i + 1)]; };
const setP = (st, p, v) => {
  const i = p.indexOf('.');
  if (i < 0) { st[p] = v; return; }
  const a = p.slice(0, i);
  if (st[a] && typeof st[a] === 'object') st[a] = { ...st[a], [p.slice(i + 1)]: v };
};
const LEVEL_KEYS = ['levels', 'vLevels'];
const LEVEL_ORDER = ['fg2', 'fg', 'asia', 'london', 'ny', 'be'];

// Szablon domyślnego stylu narzędzia: które ścieżki dostają który token (styleFor z tokenami zastąpionymi znacznikami „@token”).
const SENT = Object.fromEntries(TOKENS.map((k) => [k, `@${k}`]));
const tok = (v) => (typeof v === 'string' && v[0] === '@' && TOKENS.includes(v.slice(1)) ? v.slice(1) : null);
const tplCache = new Map();
function template(kind, fvg) {
  const key = `${kind}|${fvg ? 1 : 0}`;
  if (tplCache.has(key)) return tplCache.get(key);
  const st = styleFor(kind, SENT, fvg), top = {};
  for (const [k, v] of Object.entries(st)) if (tok(v)) top[k] = tok(v);
  if (tok(st.rectMiddleLine?.color)) top['rectMiddleLine.color'] = tok(st.rectMiddleLine.color);
  else if (kind === 'rectangle' && top.color) top['rectMiddleLine.color'] = top.color; // linia połowy prostokąta w kolorze obramowania (panel stylu)
  const lv = Object.fromEntries(LEVEL_KEYS.map((k) => [k, Array.isArray(st[k]) ? st[k].map((l) => tok(l.color)) : []]));
  const out = { top, lv };
  tplCache.set(key, out);
  return out;
}

// Rysunek z jawnym znacznikiem: style.autoColor i level.auto. cur: bieżące kolory tokenów (nowy rysunek: kolor z tokenów bieżącej palety też jest domyślny).
export function withAuto(d, cur = null) {
  if (!d || !d.style || typeof d.style !== 'object') return d;
  const st = { ...d.style }, tpl = template(d.kind, toolKeyOf(d) === 'fvg');
  const marked = !!st.autoColor && typeof st.autoColor === 'object' && !Array.isArray(st.autoColor);
  const isDefault = (t, v) => !!v && (KNOWN[t].has(norm(v)) || (!!cur && norm(cur[t]) === norm(v)));
  const ac = {};
  if (marked) { for (const [p, t] of Object.entries(st.autoColor)) if (TOKENS.includes(t) && typeof getP(st, p) === 'string') ac[p] = t; }
  else for (const [p, t] of Object.entries(tpl.top)) if (isDefault(t, getP(st, p))) ac[p] = t;
  st.autoColor = ac;
  for (const key of LEVEL_KEYS) {
    if (!Array.isArray(st[key])) continue;
    st[key] = st[key].map((l, k) => {
      if (!l || typeof l !== 'object') return l;
      if (TOKENS.includes(l.auto)) return l;
      const { auto, ...rest } = l;
      if (marked) return rest; // znacznik jest, a poziom go nie ma: kolor ręczny
      const pref = tpl.lv[key][k];
      const t = pref && isDefault(pref, l.color) ? pref : LEVEL_ORDER.find((x) => isDefault(x, l.color));
      return t ? { ...rest, auto: t } : rest;
    });
  }
  return { ...d, style: st };
}

// Ścieżki z kolorem domyślnym dostają kolor z c (c: { fg, fg2, … }); brak tokenu w c zostawia zapisaną wartość.
export function resolveColors(d, c) {
  const st0 = d?.style;
  if (!st0 || typeof st0 !== 'object' || !c) return d;
  const st = { ...st0 };
  for (const [p, t] of Object.entries(st.autoColor || {})) if (c[t]) setP(st, p, c[t]);
  for (const key of LEVEL_KEYS) if (Array.isArray(st[key])) st[key] = st[key].map((l) => (l && TOKENS.includes(l.auto) && c[l.auto] ? { ...l, color: c[l.auto] } : l));
  return { ...d, style: st };
}

// Rysunek w kolorach bieżącego motywu (edytor: c = readColors; podgląd SVG: CSS_COLORS).
export const themed = (d, c) => resolveColors(withAuto(d, c), c);
// Postać do zapisu: znacznik i wartości z Onyx pod ścieżkami domyślnymi (stabilna niezależnie od motywu, czytelna dla starszych wersji).
export const canonical = (d) => resolveColors(withAuto(d), ONYX);
// Ręczna zmiana koloru w panelu: ścieżka wypada ze znacznika (styl kopiowany, bez mutacji).
export function markManual(st, ...paths) {
  if (!st?.autoColor) return st;
  const ac = { ...st.autoColor };
  for (const p of paths) delete ac[p];
  return { ...st, autoColor: ac };
}
