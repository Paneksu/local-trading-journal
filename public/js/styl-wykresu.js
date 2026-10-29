// Ustawienia wykresów świecowych (etap 14, pakiet H): jeden obiekt settings.chart, jego biała lista (sanitizeChart), grupy do „Przywróć domyślne”,
// bieżący stan dla podglądu, miniatur i edycji (chartSettings) oraz transformacja stylu „Linia zamknięć” (etap 15).
// Synchronizowane przez Notion (lib/sync.mjs), więc: żadnych kluczy Databento ani limitów kosztu w tym obiekcie (zostają w .env i config.local.json),
// a nazwy kluczy nie mogą pasować do SECRET_KEY z lib/sync.mjs (token|secret|password|haslo|pin|key|databento).
// Kolory tylko z tokenów CSS albo z palety (palety.js); własne kolory świec to wybór użytkownika, nie literały w kodzie.
import { THEMES, normHex, ratioOn, fixContrast, defaultCustom } from './palety.js';
import { normOverlays, miniSvg, OVERLAY_KEY } from './podglad.js'; // cykl importów jest bezpieczny: podglad.js nie woła niczego stąd w czasie ładowania modułu

export const CHART_STYLES = ['candles', 'line'];
export const COLOR_MODES = ['palette', 'custom'];
// Karty v2 (P46, 29.10.2026), słowa użytkownika: «daj opcje podczas udostepnij, gdzie mozesz wybrac wyglad wykresu»; wybór stylów: «Świece, Linia biała (jak inspiracje)».
// Dwa style wykresu w kartach: 'candles' (świece) i 'line' (cienka jasna linia ceny). Wybór w oknie Udostępnij zapisuje się tutaj (wartość początkowa następnego okna).
// Stare wartości: 'same' (pakiet I: „jak w podglądzie”) i 'own' (pakiet H) sanitizeChart sprowadza do stylu podglądu (x.style), więc karta wygląda jak dotąd.
export const SHARE_STYLES = ['candles', 'line'];
// P45 (29.10.2026), słowa użytkownika: «daj opcje podczas udostepnij … czy chce zeby bylo widac rysunek pozycji czy tylko miejsca wejscia wyjscia»; wybór
// «Strefy jak w TradingView». 'position' = strefy zysku i straty jak narzędzie pozycji TradingView, 'marks' = same znaczniki wejścia i wyjścia (pigułki z inspiracji).
// Domyślnie 'position' (decyzja gustu v2: od razu widać, co się stało w trade'zie).
export const SHARE_DRAWS = ['position', 'marks'];
// P52 (29.10.2026), słowa użytkownika: «dodaj opcje ze te dane oprocz duzej liczby da sie wymieniac, czyli masz maksymalna ilosc ale mozesz sobie dobrac jakie chcesz».
// Wiersze danych kart: osobno karta trade'a i karty okresu, kolejność = kolejność katalogu, najwyżej CARD_ROWS_MAX (decyzja gustu v2: 4 we wszystkich formatach,
// jak cztery wiersze na inspiracji; więcej psuje czysty wygląd 1:1). 'alt' = druga jednostka wyniku (R, gdy duża liczba jest w $ albo %, inaczej $, a bez $ %).
export const CARD_ROWS_MAX = 4;
export const TRADE_ROWS = ['entry', 'exit', 'alt', 'R', '$', '%', 'sl', 'tp', 'time', 'exitTime', 'dur', 'setup', 'session', 'contract'];
export const PERIOD_ROWS = ['n', 'wr', 'best', 'worst', 'alt', 'avgR', 'pf', 'wl', 'green', 'bestDay'];
export const TRADE_ROWS_DEFAULT = ['entry', 'exit', 'alt']; // P43: «Cena wejścia i wyjścia, Wynik w R»
export const PERIOD_ROWS_DEFAULT = ['n', 'wr', 'best'];     // P47: liczba trade'ów, win rate, najlepszy trade
// P54 (29.10.2026), słowa użytkownika: «pokaz 6 najczestczszych i reszte pokaz wszystkie». Okno Udostępnij pokazuje 6 najczęstszych pigułek „Dane”, resztę po
// „Pokaż wszystkie”; zaznaczona pigułka spoza szóstki zostaje widoczna po zwinięciu. Decyzja gustu (kolejność i skład szóstki): trade = ceny, druga jednostka, SL, TP,
// czas trwania (to, co trader porównuje na karcie); okres = trade'y, win rate, najlepszy i najgorszy trade, druga jednostka, profit factor.
export const TRADE_ROWS_TOP = ['entry', 'exit', 'alt', 'sl', 'tp', 'dur'];
export const PERIOD_ROWS_TOP = ['n', 'wr', 'best', 'worst', 'alt', 'pf'];
// Widoczne pigułki w kolejności katalogu: rozwinięte = wszystkie, zwinięte = szóstka + zaznaczone spoza niej.
export function visibleRows(list, top, selected = [], all = false) {
  return all ? [...list] : list.filter((id) => top.includes(id) || selected.includes(id));
}
export function normRows(v, list, def) {
  if (!Array.isArray(v)) return [...def];
  const set = new Set(v.filter((x) => typeof x === 'string' && list.includes(x)));
  return list.filter((x) => set.has(x)).slice(0, CARD_ROWS_MAX);
}
// Filmy (pakiet J, etap 18): format 9:16, 1:1 (nowy w v2, P43: «dodaj filmik 1:1») i 16:9, długość 6 / 10 / 15 s, przyciemnienie tła suwakiem co 0,1
// (domyślnie SCRIM 0,6 jak na kartach ze zdjęciem); zła wartość = domyślna.
export const FILM_FORMATS = ['9:16', '1:1', '16:9'];
export const FILM_SECONDS = [6, 10, 15];
export const FILM_DIMS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

// Grupy do „Przywróć domyślne” (klucze obiektu settings.chart). Grupa „cards” (Karty i filmy): kontrolki kart od pakietu I (wykres ceny, styl w karcie,
// SL/TP w kartach, krzywa kapitału), opcje filmów od pakietu J (decyzja sesji głównej: kontrolka pojawia się razem z funkcją).
export const CHART_GROUPS = {
  look: ['style', 'miniStyle', 'colorMode', 'custom', 'grid'],
  levels: ['entry', 'exit', 'sl', 'tp'],
  overlays: ['overlays'],
  cards: ['shareChart', 'shareStyle', 'shareDraw', 'rowsTrade', 'rowsPeriod', 'equity', 'filmFormat', 'filmSeconds', 'filmBw', 'filmDim'],
};
export const CHART_KEYS = Object.values(CHART_GROUPS).flat();

export function chartDefaults() {
  const base = defaultCustom();
  return {
    style: 'candles', miniStyle: 'candles', colorMode: 'palette',
    custom: Object.fromEntries(THEMES.map((th) => [th, { up: base[th].profit, down: base[th].loss }])),
    grid: true,
    entry: true, exit: true, sl: true, tp: true,
    overlays: normOverlays(null),
    // karty i filmy (P15: wykres w kartach domyślnie WŁĄCZONY; P21: bez dźwięku, więc brak klucza audio)
    // v2 (P45, P46, P52): SL/TP rysuje tryb „Pozycja” (klucze slCard/tpCard z pakietu I odpadają), styl i rysunek wybierane w oknie Udostępnij
    shareChart: true, shareStyle: 'candles', shareDraw: 'position', rowsTrade: [...TRADE_ROWS_DEFAULT], rowsPeriod: [...PERIOD_ROWS_DEFAULT], equity: true,
    filmFormat: '9:16', filmSeconds: 10, filmBw: false, filmDim: 0.6,
  };
}

const one = (v, list, def) => (list.includes(v) ? v : def);
const bool = (v, def) => (typeof v === 'boolean' ? v : def);

// Biała lista: tylko znane klucze i dozwolone wartości; reszta (w tym klucze z prototypu: hollow, upColor, vertGrid, candleStyle…) odpada, brak klucza = domyślna.
export function sanitizeChart(raw) {
  const d = chartDefaults(), x = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const custom = {};
  for (const th of THEMES) {
    const c = x.custom && typeof x.custom === 'object' && x.custom[th] && typeof x.custom[th] === 'object' ? x.custom[th] : {};
    // security HIJ, N1: tylko tekst (obiekt z ustawień zdalnych, np. {"toString":1}, wywracał String() w normHex)
    custom[th] = { up: (typeof c.up === 'string' && normHex(c.up)) || d.custom[th].up, down: (typeof c.down === 'string' && normHex(c.down)) || d.custom[th].down };
  }
  return {
    // P46: styl miniatur listy; brak klucza (ustawienia sprzed v2) = styl podglądu, więc miniatury wyglądają jak dotąd
    style: one(x.style, CHART_STYLES, d.style), miniStyle: one(x.miniStyle, CHART_STYLES, one(x.style, CHART_STYLES, d.style)), colorMode: one(x.colorMode, COLOR_MODES, d.colorMode), custom, grid: bool(x.grid, d.grid),
    entry: bool(x.entry, d.entry), exit: bool(x.exit, d.exit), sl: bool(x.sl, d.sl), tp: bool(x.tp, d.tp),
    overlays: normOverlays(x.overlays),
    shareChart: bool(x.shareChart, d.shareChart), shareStyle: one(x.shareStyle, SHARE_STYLES, one(x.style, CHART_STYLES, d.shareStyle)), shareDraw: one(x.shareDraw, SHARE_DRAWS, d.shareDraw),
    rowsTrade: normRows(x.rowsTrade, TRADE_ROWS, TRADE_ROWS_DEFAULT), rowsPeriod: normRows(x.rowsPeriod, PERIOD_ROWS, PERIOD_ROWS_DEFAULT),
    equity: bool(x.equity, d.equity), filmFormat: one(x.filmFormat, FILM_FORMATS, d.filmFormat), filmSeconds: one(x.filmSeconds, FILM_SECONDS, d.filmSeconds),
    filmBw: bool(x.filmBw, d.filmBw), filmDim: one(x.filmDim, FILM_DIMS, d.filmDim),
  };
}

// „Przywróć domyślne” jednej grupy: wraca tylko jej klucze, reszta zostaje.
export function resetChartGroup(chart, group) {
  const d = chartDefaults(), out = sanitizeChart(chart);
  for (const k of CHART_GROUPS[group] || []) out[k] = d[k];
  return out;
}

// Kontrast własnego koloru świecy względem kafla i karty motywu (ta sama funkcja co w zakładce Kolory); „Popraw” podnosi do progu AA 4,5:1.
export const CHART_CONTRAST_MIN = 4.5;
export function chartContrast(hex, theme) { const ratio = ratioOn(hex, theme); return { ratio, weak: ratio < CHART_CONTRAST_MIN }; }
export const fixChartColor = (hex, theme) => fixContrast(hex, theme);

// Stan bieżący (jedno miejsce odczytu dla podglądu SVG, miniatur i edycji LWC). Zapis robi app.js po zmianie ustawień albo synchronizacji.
let current = null;
export function chartSettings() { return current || (current = chartDefaults()); }
export function setChartSettings(c) { current = sanitizeChart(c); return current; }

// Własne kolory świec jako zmienne CSS na elemencie głównym (świece w SVG i w LWC czytają --chart-up / --chart-down, a bez nich --profit / --loss).
export function applyChartVars(chart, theme, root = globalThis.document?.documentElement) {
  if (!root) return;
  const c = sanitizeChart(chart), col = c.custom[theme === 'platinum' ? 'platinum' : 'onyx'];
  if (c.colorMode === 'custom') { root.style.setProperty('--chart-up', col.up); root.style.setProperty('--chart-down', col.down); }
  else { root.style.removeProperty('--chart-up'); root.style.removeProperty('--chart-down'); }
}

// Podgląd w Ustawieniach → Wykresy: ten sam rysunek co miniatura (miniSvg, te same klasy CSS), ale na 40 syntetycznych świecach i bez sieci.
export function previewSvg(cfg = chartSettings(), { w = 316, h = 96 } = {}) {
  const bars = previewBars();
  return miniSvg(previewTrade(bars), { tf: '5m', bars }, { w, h, cfg: sanitizeChart(cfg), full: true });
}

// Przegląd HIJ, pkt 2 (29.10.2026): migracja nakładek ze starego klucza localStorage do settings.chart.overlays naprawdę RAZ.
// Zwraca { overlays, at } albo null. Wynik zapisuje app.js od razu (settings + świeży znacznik czasu synchronizacji), a stary klucz dostaje znacznik
// „przeniesione” (OVERLAY_MOVED_KEY) i nie jest czytany ponownie; sam stary zapis zostaje nietknięty (decyzja z pakietu H).
// Decyzja sesji głównej (29.10.2026): po migracji wygrywa zwykła reguła synchronizacji (nowsze updatedAt). Migracja daje lokalnym nakładkom świeży znacznik
// czasu, więc nie przegrają ze starszymi, domyślnymi nakładkami z innego urządzenia; nowsza zmiana z innego urządzenia dalej wygrywa.
export const OVERLAY_MOVED_KEY = 'thq.chart.overlays.v1.moved'; // literał: OVERLAY_KEY z podglad.js nie jest gotowy w czasie ładowania (cykl importów)
export function migrateLegacyOverlays(stored, storage = globalThis.localStorage, at = new Date().toISOString()) {
  try {
    const ch = stored && typeof stored === 'object' ? stored.chart : null;
    if (ch && typeof ch === 'object' && ch.overlays) return null; // ustawienia mają już nakładki
    if (!storage || storage.getItem(OVERLAY_MOVED_KEY)) return null; // już przeniesione
    const overlays = legacyOverlays(storage.getItem(OVERLAY_KEY));
    if (!overlays) return null;
    storage.setItem(OVERLAY_MOVED_KEY, at);
    return { overlays, at };
  } catch { return null; } // localStorage niedostępny
}

// Pierwsza wartość początkowa nakładek ze starego zapisu localStorage (etap 10 / P32); zwraca null, gdy nie ma poprawnego zapisu.
export function legacyOverlays(rawJson) {
  if (typeof rawJson !== 'string' || !rawJson) return null;
  try { const o = JSON.parse(rawJson); return o && typeof o === 'object' && !Array.isArray(o) ? normOverlays(o) : null; } catch { return null; }
}

// Etap 15: styl „Linia zamknięć” to ta sama tablica świec sprowadzona do punktów [t, close]; długość i kolejność bez zmian, luki zostają lukami (nic nie dopisujemy).
export function closePoints(candles) {
  return (candles || []).map((c) => [c[0], c[4]]);
}

// Deterministyczne 40 świec 5-minutowych do podglądu w ustawieniach (bez sieci i bez losowości: generator liczbowy z ziarnem).
export const PREVIEW_T0 = 1_767_294_000; // 2026-01-01T19:00:00Z
export function previewBars(n = 40) {
  let seed = 20260101;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const out = [];
  let px = 5000;
  for (let i = 0; i < n; i++) {
    const drift = Math.sin(i / 5) * 1.2 + (i > 14 && i < 30 ? 0.9 : -0.2);
    const o = px, c = Math.round((o + drift + (rnd() - 0.5) * 3) * 4) / 4;
    const h = Math.round((Math.max(o, c) + rnd() * 1.6) * 4) / 4, l = Math.round((Math.min(o, c) - rnd() * 1.6) * 4) / 4;
    out.push([PREVIEW_T0 + i * 300, o, h, l, c, 100 + Math.round(rnd() * 400)]);
    px = c;
  }
  return out;
}
// Trade do podglądu: wejście na świecy 12, wyjście na 30, SL pod wejściem, TP nad nim (poziomy jak w prawdziwym trade'ie).
export function previewTrade(bars = previewBars()) {
  const e = bars[12], x = bars[30];
  const entry = e[1], exit = x[4];
  return { at: e[0] * 1000, exitAt: x[0] * 1000, instrument: 'ES', entryPrice: entry, exitPrice: exit, sl: entry - 4, tp: entry + 9, be: null, r: 1.6 };
}
