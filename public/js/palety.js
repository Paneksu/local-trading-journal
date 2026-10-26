// Palety kolorów danych (--profit, --loss, --be): gotowe palety, własna paleta osobno dla Onyx i Platinum, kontrast i poprawianie w OKLCH.
// Kolory serii wykresów i plakietek Notion zostają bez zmian. Wynik palety ląduje jako zmienne CSS na <html> (a także w localStorage jako „resolved”,
// żeby skrypt w <head> mógł je zastosować przed pierwszym malowaniem).

export const THEMES = ['onyx', 'platinum'];
export const BASE = {
  onyx: { profit: '#1db954', loss: '#ff6a6a', be: '#7aa7ff' },
  platinum: { profit: '#00560f', loss: '#9a0013', be: '#1a3da8' },
};
// Powierzchnie, na których leżą liczby: karta treści (surface-content), kafel (surface-float), studzienka (well) i kolor tekstu.
export const SURFACES = {
  onyx: { content: '#222526', float: '#2b2f31', well: '#1e2022', fg: '#f3f3f3' },
  platinum: { content: '#e0e0e0', float: '#f2f2f2', well: '#e4e4e4', fg: '#050913' },
};
export const PALETTES = [
  { id: 'color', name: 'Kolor', hint: 'zielony i czerwony', colors: BASE },
  { id: 'mono', name: 'Mono', hint: 'biel i szarość', colors: {
    onyx: { profit: '#f3f3f3', loss: '#9aa0a6', be: '#b9bec3' },
    platinum: { profit: '#050913', loss: '#484c51', be: '#3c4044' },
  } },
  { id: 'dalton', name: 'Daltonizm', hint: 'niebieski i pomarańczowy', colors: {
    onyx: { profit: '#5ab0ff', loss: '#ffa24a', be: '#b4b9be' },
    platinum: { profit: '#0a46a0', loss: '#7a3300', be: '#3c4044' },
  } },
  { id: 'stonowana', name: 'Stonowana', hint: 'przygaszone barwy', colors: {
    onyx: { profit: '#5fae7c', loss: '#d98a8a', be: '#8fa8cf' },
    platinum: { profit: '#1f5236', loss: '#7d3434', be: '#2f4a73' },
  } },
  { id: 'wlasna', name: 'Własna', hint: 'ustawiasz sam', colors: null },
];
export const PALETTE_IDS = PALETTES.map((p) => p.id);
// dobrane odcienie do siatki wyboru (po 12 na motyw: zielenie, czerwienie, błękity, pomarańcze, fiolet, szarości)
export const SWATCHES = {
  onyx: ['#1db954', '#5fae7c', '#ff6a6a', '#d98a8a', '#5ab0ff', '#7aa7ff', '#ffa24a', '#f2c14e', '#b79cff', '#f3f3f3', '#b9bec3', '#9aa0a6'],
  platinum: ['#00560f', '#1f5236', '#9a0013', '#7d3434', '#0a46a0', '#1a3da8', '#7a3300', '#7a5200', '#5b3fb0', '#050913', '#3c4044', '#484c51'],
};

// ---------- matematyka kolorów ----------
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
export function normHex(s) {
  let t = String(s ?? '').trim().toLowerCase();
  if (t.startsWith('#')) t = t.slice(1);
  if (/^[0-9a-f]{3}$/.test(t)) t = t.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/.test(t) ? `#${t}` : null;
}
export const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => toLin(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function hexToOklch(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => toLin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: Math.atan2(B, A) };
}
function oklchToLinear({ L, C, h }) {
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
export function oklchToHex(c) {
  let lo = 0, hi = c.C;
  const ok = (C) => oklchToLinear({ ...c, C }).every((v) => v >= -0.0005 && v <= 1.0005);
  let C = c.C;
  if (!ok(C)) { for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; } C = lo; }
  return rgbToHex(oklchToLinear({ ...c, C }).map((v) => toSrgb(Math.max(0, Math.min(1, v))) * 255));
}
// najgorszy kontrast koloru względem kafla i karty treści w danym motywie
export function ratioOn(hex, theme) {
  const s = SURFACES[theme];
  return Math.min(contrast(hex, s.content), contrast(hex, s.float));
}
// „Popraw”: ten sam odcień i nasycenie, zmienia się tylko jasność (w Onyx jaśniej, w Platinum ciemniej) aż do AA (4,5:1)
export function fixContrast(hex, theme) {
  const c = hexToOklch(hex);
  const dir = theme === 'onyx' ? 1 : -1;
  let best = hex;
  for (let i = 1; i <= 100; i++) {
    const L = Math.max(0, Math.min(1, c.L + dir * 0.01 * i));
    best = oklchToHex({ ...c, L });
    if (ratioOn(best, theme) >= 4.5) return best;
    if (L === 0 || L === 1) break;
  }
  return best;
}

// ---------- rozwiązywanie i zastosowanie palety ----------
export function defaultCustom() { return JSON.parse(JSON.stringify(BASE)); }
export function sanitizeCustom(c) {
  const out = defaultCustom();
  for (const t of THEMES) for (const k of ['profit', 'loss', 'be']) { const h = normHex(c?.[t]?.[k]); if (h) out[t][k] = h; }
  return out;
}
const lerp = (a, b, t) => a + (b - a) * t;
// Pola kalendarza mieszają kolor z tłem do 42% i kładą na to tekst; przy skrajnie jasnych lub ciemnych kolorach (Mono) słabsze mieszanie utrzymuje AA.
function cellMix(colors, theme) {
  const s = SURFACES[theme];
  const w = hexToRgb(s.well);
  const worst = (hex) => { const c = hexToRgb(hex); return contrast(rgbToHex(c.map((v, i) => lerp(w[i], v, 0.42))), s.fg); };
  return Math.min(worst(colors.profit), worst(colors.loss)) >= 4.5 ? 1 : 0.6;
}
export function resolve(settings, theme) {
  const p = PALETTES.find((x) => x.id === settings.palette) || PALETTES[0];
  const colors = p.id === 'wlasna' ? (settings.custom?.[theme] || BASE[theme]) : p.colors[theme];
  return { ...colors, cellmix: cellMix(colors, theme) };
}
export const resolvedAll = (settings) => ({ onyx: resolve(settings, 'onyx'), platinum: resolve(settings, 'platinum') });

const PROPS = ['--profit', '--loss', '--be', '--cellmix', '--lb-profit', '--lb-loss', '--lb-be'];
export function applyPalette(settings, theme) {
  const root = document.documentElement;
  if (!settings.palette || settings.palette === 'color') {
    root.removeAttribute('data-palette');
    PROPS.forEach((p) => root.style.removeProperty(p));
    return;
  }
  root.setAttribute('data-palette', settings.palette);
  const r = resolve(settings, theme);
  const dark = resolve(settings, 'onyx'); // podgląd zrzutów jest zawsze ciemny, więc używa wartości Onyx
  root.style.setProperty('--profit', r.profit); root.style.setProperty('--loss', r.loss); root.style.setProperty('--be', r.be);
  root.style.setProperty('--cellmix', String(r.cellmix));
  root.style.setProperty('--lb-profit', dark.profit); root.style.setProperty('--lb-loss', dark.loss); root.style.setProperty('--lb-be', dark.be);
}
