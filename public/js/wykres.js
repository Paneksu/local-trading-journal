// Tryb edycji wykresu: Lightweight Charts (ładowany dopiero po kliknięciu „Edytuj wykres”) z tym samym kadrem i TF co podgląd SVG.
// Tło przezroczyste, kolory wyłącznie z tokenów CSS czytanych z kontenera wykresu (lightbox `.lb` przemapowuje --fg/--profit/--loss/--be/--line),
// każdy przez sondę canvas do #rrggbb/rgba() (tokeny w składni CSS Color 4 i OKLCH). Rysunki: rysunki.js (paczka rysowania 0.6.2).
// Kadr to { fromIndex, toIndex } w tablicy wczytanych świec (jak podglad.js); LWC liczy zakres logiczny od środków skrajnych świec, stąd ±0,5.
// Poziomy trade'a: linie ceny (wejście, wyjście, SL, TP, BE), blokada pozycja long/short z pól trade'a (nie jest zapisywana), znacznik zmiany kontraktu.
// P26 (28.10.2026): przełącznik „Auto” skali ceny i strefa czasowa osi wspólne z podglądem (podglad.js), interwał bez automatycznej zmiany.
// English: Lightweight Charts edit mode sharing frame and timeframe with the SVG preview; theme from CSS tokens; drawings via rysunki.js.
import { t, locale } from './i18n.js';
import { esc, fmtR } from './format.js';
import * as G from './geometria.js';
import { tradeQuery, fetchCandles, padFor, tfSec, MAX_VISIBLE, barToggles, overlayToggles, createOverlays, markToggles, loadAutoScale, saveAutoScale, zoomPrice, chartTz, setChartTzOverride, fmtIn, tfBarHtml, mountTfBar, DECIMAL, overlayGeometry, mountOverlayPop, DASHES, BOX_STROKE_ALPHA, startRange, gapLabel, badjWarning, clampFrameTf, capBars, SUB_MINUTE_MAX_BARS } from './podglad.js';
import { chartSettings } from './styl-wykresu.js';
import { newsGeometry, timeToX, markPath, NEWS_DASH, feed as newsFeed } from './newsy.js';
import { mountNewsLayer } from './newsy-warstwa.js';
import { createRysunki, NO_STATS, adoptEdited, planTradeSave, tickOf } from './rysunki.js';

// P28: daty trade'a zapisujemy w strefie przeglądarki, jak formularz trade'a (form.js), więc chwila w Notion zgadza się z resztą aplikacji
const BROWSER_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw'; } catch { return 'Europe/Warsaw'; } })();
import { confirmDialog } from './modal.js';
import { parseTf } from './swiece.js';

export const LWC_URL = '/vendor/lightweight-charts/lightweight-charts.standalone.production.mjs';
export const DRAW_URL = '/vendor/lightweight-charts-drawing/lightweight-charts-drawing.es.js';
const ATTRIB_URL = 'https://www.tradingview.com/';

// ---- funkcje czyste ----
// Kadr podglądu (indeksy skrajnych świec na krawędziach pola) ↔ zakres logiczny LWC (środki skrajnych świec, pół świecy zapasu z każdej strony).
export const toLogical = ({ fromIndex, toIndex }) => ({ from: fromIndex + 0.5, to: toIndex - 0.5 });
export const fromLogical = ({ from, to }) => ({ fromIndex: from - 0.5, toIndex: to + 0.5 });

// Siatka: --fg-rgb przy 8% (LWC rysuje 3-4 razy gęściej niż podgląd, więc pełne --line byłoby za ciężkie).
// Opcje LWC z kolorów już znormalizowanych (c: profit, loss, be, fg, fg2, grid, popover, cross, font). Tło przezroczyste, bez logo, bez ramek.
export function themeOptions(c, cfg = chartSettings()) {
  return {
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: c.fg2, fontFamily: c.font, fontSize: 10.5, attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { visible: cfg.grid !== false, color: c.grid } }, // Ustawienia → Wykresy: siatka pozioma
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
    timeScale: { borderVisible: false },
    crosshair: {
      vertLine: { color: c.cross, labelBackgroundColor: c.popover },
      horzLine: { color: c.cross, labelBackgroundColor: c.popover },
    },
  };
}
// Własne kolory świec (Ustawienia → Wykresy) docierają jako --chart-up / --chart-down (readColors: up, down); bez nich kolory palety.
export const candleOptions = (c) => ({ upColor: c.up ?? c.profit, downColor: c.down ?? c.loss, wickUpColor: c.up ?? c.profit, wickDownColor: c.down ?? c.loss, borderVisible: false });
// Etap 15: linia zamknięć w kolorze --chart-line (jak krzywa kapitału), bez znacznika kursora; dane to { time, value: close }.
export const lineOptions = (c) => ({ color: c.line ?? c.fg2, lineWidth: 2, crosshairMarkerVisible: false });
// Przegląd 1.3.0, pkt 7 (29.10.2026): obserwator motywu reagował na każdą zmianę klasy albo stylu elementu html i przelewał całą serię. restyle = zmieniły się kolory
// (motyw, własne kolory świec), resetData = dodatkowo trzeba przeliczyć dane, bo kolory świec z podziału 1m są częścią danych.
export function seriesRefresh(prev, next, candles) {
  const restyle = JSON.stringify(prev) !== JSON.stringify(next);
  return { restyle, resetData: restyle && candles.some((k) => k[6] === 1) };
}
export const seriesOptions = (c, style) => (style === 'line' ? lineOptions(c) : candleOptions(c));
// P55 (29.10.2026), «Lekko przygaszone»: świece z podziału 1m (flaga 1 na pozycji 6) dostają kolor z krytym SYNTH_ALPHA (kolory z readColors: #rrggbb albo rgba()); styl linii bez zmian.
export function dimColor(col, alpha = G.SYNTH_ALPHA) {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(col || '');
  if (hex) return `rgba(${parseInt(hex[1], 16)}, ${parseInt(hex[2], 16)}, ${parseInt(hex[3], 16)}, ${alpha})`;
  const rgba = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(col || '');
  return rgba ? `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${Math.round((rgba[4] == null ? 1 : Number(rgba[4])) * alpha * 1000) / 1000})` : col;
}
export const seriesData = (candles, style, c) => (style === 'line' ? candles.map((k) => ({ time: k[0], value: k[4] })) : candles.map((k) => {
  const [time, open, high, low, close] = k, d = { time, open, high, low, close };
  if (c && k[6] === 1) { const col = dimColor(close >= open ? (c.up ?? c.profit) : (c.down ?? c.loss)); d.color = col; d.wickColor = col; d.borderColor = col; }
  return d;
}));

// Poziomy trade'a: linie ceny z kolorami z tokenów (wejście --fg-2, wyjście --fg, SL --loss, TP --profit, BE --be).
// P26 (28.10.2026), słowa użytkownika: «usun napisy wejsie, wyjscie, po kropkach i pasku widac miejsca te»: linie wejścia i wyjścia bez tytułu
// (cena zostaje na osi). Wyjście przeszło z --be na --fg, bo --be należy teraz do linii BE («dodaj punkt BE, widoczny na pozycji»).
export function tradeLevels(trade, c, cfg = chartSettings()) {
  const out = [];
  const add = (price, color, title) => { if (Number.isFinite(price)) out.push({ price, color, title }); };
  if (cfg.entry) add(trade.entryPrice, c.fg2, '');
  if (cfg.exit) add(trade.exitPrice, c.fg, '');
  if (cfg.sl) add(trade.sl, c.loss, 'SL');
  if (cfg.tp) add(trade.tp, c.profit, 'TP');
  add(trade.be, c.be, 'BE');
  return out;
}

// Zablokowany rysunek pozycji z pól trade'a (długa gdy cel nad wejściem albo stop pod nim). null bez wejścia i bez SL/TP.
export function positionDrawing(trade, D, c, lastTime) {
  const { entryPrice: ep, sl, tp } = trade;
  if (!Number.isFinite(ep) || !(Number.isFinite(sl) || Number.isFinite(tp))) return null;
  const long = Number.isFinite(tp) ? tp >= ep : sl <= ep;
  const kind = long ? 'long-position' : 'short-position';
  const t0 = Math.floor(trade.at / 1000), t1 = trade.exitAt != null ? Math.floor(trade.exitAt / 1000) : Math.max(t0 + 60, lastTime || 0);
  // P27 (28.10.2026), słowa użytkownika: «mi chodzi zeby na niej widoczny byl punkt be»: BE z pola trade'a jako poziom pozycji (linia i podpis rysuje extrasPrimitive)
  const beLevel = Number.isFinite(trade.be) ? (trade.be - ep) * (long ? 1 : -1) : undefined;
  // P28 (28.10.2026): wyjście z pola trade'a jako poziom pozycji (kropka na prawej krawędzi, uchwyt po odblokowaniu; rysuje extrasPrimitive)
  const exitLevel = Number.isFinite(trade.exitPrice) ? (trade.exitPrice - ep) * (long ? 1 : -1) : undefined;
  return {
    kind, locked: true,
    points: [{ time: t0, price: ep }, { time: t1, price: ep }],
    style: {
      ...D.defaultStyleFor(kind), color: c.fg2, textColor: c.fg, stopColor: c.loss, targetColor: c.profit, stopTransparency: 87, targetTransparency: 87,
      showPriceLabels: false, stopLevel: Number.isFinite(sl) ? Math.abs(ep - sl) : 0, profitLevel: Number.isFinite(tp) ? Math.abs(tp - ep) : 0,
      ...(beLevel !== undefined ? { beLevel } : {}),
      ...(exitLevel !== undefined ? { exitLevel } : {}),
      positionStats: NO_STATS, // P27: bez pigułek kwot konta paczki po odblokowaniu i zaznaczeniu
    },
  };
}

// ---- P27: dodatki pozycji (BE i R:R), których paczka nie rysuje: prymityw serii z tych samych części co podgląd (geometria.positionExtras) ----
// Skala jak w teście zgodności: odstęp świec z dwóch ostatnich indeksów LWC, cena z dwóch punktów priceToCoordinate. Kolory z tokenów (--be, --fg).
export function extrasPrimitive({ chart, series, getDrawings, getCandles, getStep, getColors }) {
  const ts = chart.timeScale();
  let req = null;
  const scales = () => {
    const candles = getCandles(), last = candles.length - 1;
    if (last < 1) return null;
    const right = ts.logicalToCoordinate(last), prev = ts.logicalToCoordinate(last - 1);
    const vr = series.priceScale().getVisibleRange?.();
    const pA = vr ? vr.from : candles[last][3], pB = vr ? vr.to : candles[last][2] + 1;
    const yA = series.priceToCoordinate(pA), yB = series.priceToCoordinate(pB);
    if (right == null || prev == null || yA == null || yB == null || pA === pB) return null;
    const xs = G.indexScale({ lastIndex: last, right, spacing: right - prev });
    const ys = G.priceScaleFrom(pA, yA, pB, yB);
    return G.chartScales({ candles, xs, ys, box: { left: 0, right: ts.width(), top: 0, bottom: 0 }, pip: 0.25, step: getStep(), decimal: DECIMAL() });
  };
  const draw = (target) => target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
    const s = scales();
    if (!s) return;
    const col = getColors();
    ctx.save();
    ctx.lineWidth = Math.max(1, Math.round(hr));
    ctx.font = `${Math.round(10.5 * vr)}px ${col.font}`;
    for (const d of getDrawings()) {
      if (d.kind !== 'long-position' && d.kind !== 'short-position' || d.hidden) continue;
      const sh = G.shapes(d, s);
      for (const p of sh?.parts || []) {
        if (p.role === 'be') {
          ctx.strokeStyle = col.be; ctx.setLineDash([Math.round(5 * hr), Math.round(4 * hr)]);
          const y = Math.round(p.y1 * vr) + 0.5;
          ctx.beginPath(); ctx.moveTo(Math.round(p.x1 * hr), y); ctx.lineTo(Math.round(p.x2 * hr), y); ctx.stroke();
          ctx.setLineDash([]);
        } else if (p.role === 'be-label' || p.role === 'rr') {
          ctx.fillStyle = p.role === 'rr' ? col.fg : col.be;
          ctx.textAlign = p.anchor === 'end' ? 'right' : p.anchor === 'middle' ? 'center' : 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.text, Math.round(p.x * hr), Math.round(p.y * vr));
        } else if (p.role === 'exit-path') {
          // P28: jak .lvl.path w podglądzie: --fg przy 55%, kreska 2/3
          ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = col.fg; ctx.setLineDash([Math.round(2 * hr), Math.round(3 * hr)]);
          ctx.beginPath(); ctx.moveTo(p.x1 * hr, p.y1 * vr); ctx.lineTo(p.x2 * hr, p.y2 * vr); ctx.stroke();
          ctx.restore();
        } else if (p.role === 'exit') {
          ctx.fillStyle = col.fg; // jak .lvl-d w podglądzie
          ctx.beginPath(); ctx.arc(p.x * hr, p.y * vr, p.r * hr, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.restore();
  });
  const views = [{ zOrder: () => 'top', renderer: () => ({ draw }) }];
  return {
    // P28: kropka wyjścia rysunku pozycji w pikselach pola wykresu (uchwyt do przeciągania w rysunki.js), z tych samych skal co rysowanie
    exitPoint(d) {
      const s = scales();
      const p = s && G.shapes(d, s)?.parts.find((x) => x.role === 'exit');
      return p ? { x: p.x, y: p.y } : null;
    },
    // P32: miejsce tekstu rysunku w pikselach pola wykresu (edycja w miejscu i pole dwukliku), z tych samych skal co rysowanie
    textSlot(d) { const s = scales(); return s ? G.textSlot(d, s) : null; },
    // P29: linia BE rysunku pozycji w pikselach pola wykresu (uchwyt do przeciągania w pionie)
    beLine(d) {
      const s = scales();
      const p = s && G.shapes(d, s)?.parts.find((x) => x.role === 'be');
      return p ? { x1: p.x1, x2: p.x2, y: p.y1 } : null;
    },
    attached: (p) => { req = p.requestUpdate; },
    detached: () => { req = null; },
    paneViews: () => views,
    updateAllViews() {},
    requestUpdate: () => req?.(),
  };
}

// ---- kolory z tokenów ----
let probeCtx = null;
// Sonda canvas: dowolny kolor CSS (także OKLCH i składnia CSS Color 4, którą canvas zwraca bez zmian) → #rrggbb albo rgba() z odczytu piksela,
// jak rgbOf w udostepnij-render.js. Nieznany kolor daje przezroczysty.
export function probe(value) {
  if (!probeCtx) { const el = document.createElement('canvas'); el.width = el.height = 1; probeCtx = el.getContext('2d', { willReadFrequently: true }); }
  probeCtx.clearRect(0, 0, 1, 1);
  probeCtx.fillStyle = 'transparent';
  probeCtx.fillStyle = value;
  probeCtx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data;
  const hex = (n) => n.toString(16).padStart(2, '0');
  return a === 255 ? `#${hex(r)}${hex(g)}${hex(b)}` : `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`;
}
export function readColors(el) {
  const cs = getComputedStyle(el);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    profit: probe(v('--profit')), loss: probe(v('--loss')), be: probe(v('--be')), up: probe(v('--chart-up') || v('--profit')), down: probe(v('--chart-down') || v('--loss')), line: probe(v('--chart-line') || v('--fg-2')), fg: probe(v('--fg')), fg2: probe(v('--fg-2')),
    asia: probe(v('--n-blue')), london: probe(v('--n-orange')), ny: probe(v('--n-purple')),
    nRed: probe(v('--n-red')), nOrange: probe(v('--n-orange')), nYellow: probe(v('--n-yellow')), nBlue: probe(v('--n-blue')), bg: probe(v('--chart-bg') || v('--float')),
    grid: probe(`rgb(${v('--fg-rgb')} / .08)`), popover: probe(v('--popover')), cross: probe(`rgb(${v('--fg-rgb')} / .35)`), font: v('--font') || 'sans-serif',
  };
}

/// ---- nakładki (etap 10, P32): prymityw serii LWC ----
// P32 (28.10.2026): box zakresu sesji pod świecami, linie high/low sesji i PDH/PDL (do sweepu) nad nimi. Model liczy createOverlays (swiece.overlayLevels),
// piksele overlayGeometry z podglad.js: ta sama funkcja co w podglądzie SVG, tu ze skalą z LWC (x środków dwóch ostatnich świec, cena z priceToCoordinate),
// więc box i linie stoją w obu trybach w tym samym miejscu (test zgodności testy/nakladki-p32.html, ±1 px). Kolory: z ustawień albo z tokenów (readColors).
export function overlayScales(chart, series, candles) {
  const ts = chart.timeScale(), last = candles.length - 1;
  if (last < 1) return null;
  const right = ts.logicalToCoordinate(last), prev = ts.logicalToCoordinate(last - 1);
  if (right == null || prev == null) return null;
  const xs = G.indexScale({ lastIndex: last, right, spacing: right - prev });
  return { x: xs.x, y: (p) => series.priceToCoordinate(p), left: 0, right: ts.width() };
}
export function overlayPrimitive({ chart, series, getModel, getPrefs, getCandles, getColors }) {
  let req = null;
  const geo = () => {
    const sc = overlayScales(chart, series, getCandles());
    if (!sc) return null;
    return overlayGeometry(getModel(), sc, getPrefs(), { left: sc.left, right: sc.right });
  };
  const colorOf = (custom, key, col) => custom || col[key] || col.fg2;
  const bands = (target) => target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
    const g = geo();
    if (!g) return;
    const col = getColors();
    ctx.save();
    for (const r of g.rects) {
      if (r.y == null || !Number.isFinite(r.y)) continue;
      const c = colorOf(r.color, r.id, col);
      const x = Math.round(r.x * hr), y = Math.round(r.y * vr), w = Math.round(r.w * hr), h = Math.max(1, Math.round(r.h * vr));
      ctx.globalAlpha = r.opacity; ctx.fillStyle = c; ctx.fillRect(x, y, w, h);
      if (r.width > 0) {
        const lw = Math.max(1, Math.round(r.width * hr));
        ctx.globalAlpha = BOX_STROKE_ALPHA; ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.setLineDash([]);
        ctx.strokeRect(x, y, w, h); // jak ramka SVG: linia na krawędzi boxa
      }
    }
    ctx.restore();
  });
  const lines = (target) => target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
    const g = geo();
    if (!g) return;
    const col = getColors();
    ctx.save();
    ctx.font = `${Math.round(10.5 * vr)}px ${col.font}`;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    for (const l of g.lines) {
      if (!Number.isFinite(l.y)) continue;
      const c = colorOf(l.color, l.kind === 'pd' ? 'fg2' : l.id, col);
      const lw = Math.max(1, Math.round(l.width * hr)), py = Math.round(l.y * vr) + (lw % 2 ? 0.5 : 0);
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = lw;
      ctx.setLineDash((DASHES[l.dash] || []).map((v) => Math.round(v * hr)));
      ctx.beginPath(); ctx.moveTo(Math.round(l.x1 * hr), py); ctx.lineTo(Math.round(l.x2 * hr), py); ctx.stroke();
      if (l.label) ctx.fillText(l.label, Math.round(l.lx * hr), Math.round(l.ly * vr));
    }
    ctx.restore();
  });
  const view = (draw, z) => ({ zOrder: () => z, renderer: () => ({ draw }) });
  const views = [view(bands, 'bottom'), view(lines, 'top')];
  return {
    geometry: geo, // P32: test zgodności z podglądem
    attached: (p) => { req = p.requestUpdate; },
    detached: () => { req = null; },
    paneViews: () => views,
    updateAllViews() {},
    requestUpdate: () => req?.(),
  };
}

/// ---- nakładka newsów i earningsów (1.4.0): prymityw serii LWC ----
// Model i geometria z newsy.js (ta sama logika co w podglądzie SVG). Linie pod świecami ('bottom'), znaczniki i etykiety dni nad nimi ('top'); po każdej klatce
// geometria trafia do warstwy przycisków (newsy-warstwa.js), więc dymek, fokus z klawiatury i dotyk działają jak w podglądzie. Wyłączona nakładka czyści warstwę.
// Napis z obrysem w kolorze tła wykresu (jak paint-order: stroke w podglądzie SVG): czytelny na świecach, bez podkładki pod tekstem
function outlined(ctx, text, x, y, color, bg, hr) {
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.round(3 * hr); ctx.strokeStyle = bg;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
const NEWS_COLOR = { high: 'nRed', medium: 'nOrange', low: 'nYellow', holiday: 'fg2', opex: 'nBlue' };
const EARN_COLOR = { 1: 'nRed', 2: 'nOrange', 3: 'nYellow', 4: 'fg2' };
export function newsPrimitive({ chart, series, getModel, getCandles, getStep, getColors, onGeometry = () => {} }) {
  let req = null;
  const geo = (size) => {
    const model = getModel();
    if (!model?.on) return null;
    const candles = getCandles(), sc = overlayScales(chart, series, candles);
    if (!sc) return null;
    return newsGeometry(model, timeToX(candles, getStep(), sc), { left: 0, right: sc.right, top: 0, bottom: size.height });
  };
  const colorOf = (o, col) => col[o.kind === 'earn' ? EARN_COLOR[o.cls] : NEWS_COLOR[o.imp]] || col.fg2;
  const lines = (target) => target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr, mediaSize }) => {
    const g = geo(mediaSize);
    if (!g) return;
    const col = getColors();
    ctx.save();
    ctx.lineWidth = Math.max(1, Math.round(hr));
    ctx.setLineDash(NEWS_DASH.map((v) => Math.round(v * hr)));
    ctx.globalAlpha = 0.85;
    for (const l of g.lines) {
      ctx.strokeStyle = colorOf({ kind: 'news', imp: l.imp }, col);
      const x = Math.round(l.x * hr) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, Math.round(l.y1 * vr)); ctx.lineTo(x, Math.round(l.y2 * vr)); ctx.stroke();
    }
    ctx.restore();
  });
  const marks = (target) => target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr, mediaSize }) => {
    const g = geo(mediaSize);
    onGeometry(g);
    if (!g) return;
    const col = getColors();
    ctx.save();
    ctx.setLineDash([]);
    ctx.font = `${Math.round(10.5 * vr)}px ${col.font}`;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    for (const k of g.marks) {
      const c = colorOf(k, col);
      const pts = (markPath(k.kind, k.x, k.y).match(/-?\d+(\.\d+)?/g) || []).map(Number);
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) { const px = Math.round(pts[i] * hr), py = Math.round(pts[i + 1] * vr); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.closePath();
      if (k.hollow) { ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, Math.round(hr)); ctx.stroke(); } else { ctx.fillStyle = c; ctx.fill(); }
      if (k.count > 1) { outlined(ctx, String(k.count), Math.round((k.x + 8) * hr), Math.round((k.y + 4) * vr), c, col.bg, hr); }
    }
    for (const l of g.labels) outlined(ctx, l.text, Math.round(l.x * hr), Math.round(l.y * vr), colorOf(l, col), col.bg, hr);
    ctx.restore();
  });
  const view = (draw, z) => ({ zOrder: () => z, renderer: () => ({ draw }) });
  const views = [view(lines, 'bottom'), view(marks, 'top')];
  return {
    geometry: (size) => geo(size), // testy zgodności z podglądem
    attached: (p) => { req = p.requestUpdate; },
    detached: () => { req = null; },
    paneViews: () => views,
    updateAllViews() {},
    requestUpdate: () => req?.(),
  };
}

// ---- edytor ----
// opcje: trade (jak w createPodglad), tradeId, frame { tf, fromIndex, toIndex, candles, rolls }, doc (zapisane rysunki albo null),
// onDone({ tf, from, to, doc }), onSaved()
// P27: edited = last_edited_time trade'a (kontrola 409 przy zapisie cen pozycji), onTradeSaved(ceny, edited) = odświeżenie danych w aplikacji.
// P29: zębatka przy rysunku (otwiera ustawienia rysunku)
const GEAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
export async function createEditor(root, { trade: trade0, tradeId, frame, doc, onDone, onSaved, edited: edited0 = '', onTradeSaved }) {
  const [LWC, D] = await Promise.all([import(LWC_URL), import(DRAW_URL)]);
  let alive = true;
  const ac = new AbortController(); // W1 (przegląd 28.10.2026): listenery na trwałym root (.lb-chart) znikają razem z edytorem, nie z elementem
  const { signal } = ac;
  let trade = { ...trade0 }, edited = edited0 || '', draft = null;
  root.classList.add('swc');
  root.innerHTML = `<div class="swc-bar">
      ${tfBarHtml()}
      ${barToggles(Math.floor(trade.at / 1000))}
      ${overlayToggles()}
      <button type="button" class="btn sm swc-draw" aria-expanded="false">${esc(t('Rysuj'))}</button>
      <div class="swc-tools" role="toolbar" aria-label="${esc(t('Narzędzia rysowania'))}"></div>
      <button type="button" class="btn sm primary swc-done">${esc(t('Gotowe'))}</button>
    </div>
    <p class="swc-warn" hidden></p>
    <div class="swc-stage"><div class="swc-plot swc-lwc"></div>
      <button type="button" class="icon-btn swc-gear" hidden title="${esc(t('Ustawienia rysunku'))}" aria-label="${esc(t('Ustawienia rysunku'))}">${GEAR}</button>
      <div class="swc-style" role="group" aria-label="${esc(t('Ustawienia rysunku'))}" hidden></div></div>
    <div class="swc-foot note"><span class="swc-save" aria-live="polite"></span><span class="swc-meter" hidden></span><span class="swc-ov-note"></span><span>${esc(t('Wykres:'))} <a href="${ATTRIB_URL}" target="_blank" rel="noopener">TradingView Lightweight Charts™</a></span></div>`;
  const plot = root.querySelector('.swc-plot');
  const instrument = String(trade.instrument || '').trim();

  let c = readColors(plot);
  let candles = frame.candles.slice();
  let tf = frame.tf, step = tfSec(tf);
  let rolls = frame.rolls || [];
  let gaps = frame.gaps || []; // P37 (P2): dziury w danych
  // P38 (28.10.2026), słowa użytkownika: «okej wedle naszej rozmowy  BADJ domyslnie wlaczony w ustawieniach przelacznik»: edytor pracuje z tym samym B-ADJ co podgląd.
  // Kotwica = kontrakt trade'a, więc kontrakt trade'a pokazuje prawdziwe ceny, a pozycja, BE, wyjście i rysunki zapisują się w jego cenach (cena z osi = cena kontraktu trade'a).
  // Bez czasu trade'a nie ma kontraktu kotwicy (tradeQuery puste): B-ADJ jest wtedy wyłączony i zablokowany, żeby nic nie zapisało się w złej skali.
  const anchored = Number.isFinite(trade0.at);
  let badj = anchored && frame.badj === true, adjGen = 0, adjust = frame.adjust || null;
  const query = () => ({ ...tradeQuery(trade), ...(badj ? { adjust: 1 } : {}) });
  const style = chartSettings().style; // Ustawienia → Wykresy; zmiana stylu działa od następnego otwarcia edycji (jak kolory świec, które zmieniają się na żywo)
  const bars = () => seriesData(candles, style, c);
  const F_PRICE = new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // oś czasu w strefie z Ustawień albo przełącznika na wykresie (P26; LWC domyślnie pokazuje UTC); czasy znaczników zostają w UTC
  const F = () => fmtIn(chartTz());
  const timeOpts = () => ({
    timeScale: { tickMarkFormatter: (time, type) => {
      const d = new Date(time * 1000), f = F();
      return type === 0 ? f.YEAR.format(d) : type === 1 ? f.MONTH.format(d) : type === 2 ? f.DAY.format(d) : f.HM.format(d);
    } },
    localization: { timeFormatter: (time) => F().FULL.format(new Date(time * 1000)) + (candles[G.timeToIndex(candles, time, step)]?.[6] === 1 ? ' · ' + t('z 1m') : ''), priceFormatter: (price) => F_PRICE.format(price) }, // P55: dopisek „z 1m” w etykiecie czasu kursora
  });
  let autoY = loadAutoScale();
  const chart = LWC.createChart(plot, {
    autoSize: true,
    ...themeOptions(c),
    rightPriceScale: { ...themeOptions(c).rightPriceScale, autoScale: autoY },
    timeScale: { ...themeOptions(c).timeScale, timeVisible: true, secondsVisible: false, rightOffset: 0, tickMarkFormatter: timeOpts().timeScale.tickMarkFormatter },
    localization: timeOpts().localization,
  });
  const ts = chart.timeScale();
  // P26 (28.10.2026): limit oddalenia zamiast automatycznej zmiany interwału (najwięcej MAX_VISIBLE świec w kadrze, jak w podglądzie)
  const limitZoom = () => { const w = ts.width(); if (w > 0) ts.applyOptions({ minBarSpacing: Math.max(0.5, w / MAX_VISIBLE) }); };
  limitZoom();
  ts.subscribeSizeChange(limitZoom);
  let vis = null;
  const curTrade = () => (draft ? { ...trade, ...Object.fromEntries(Object.entries(draft).filter(([, v]) => v != null)) } : trade);
  const levelPrices = () => tradeLevels(curTrade(), c).map((l) => l.price);
  const series = chart.addSeries(style === 'line' ? LWC.LineSeries : LWC.CandlestickSeries, {
    ...seriesOptions(c, style), lastValueVisible: false, priceLineVisible: false,
    autoscaleInfoProvider: (orig) => {
      const r = orig();
      if (!r || !vis || !candles.length) return r;
      const ie = G.timeToIndex(candles, Math.floor(trade.at / 1000), step), ix = trade.exitAt != null ? G.timeToIndex(candles, Math.floor(trade.exitAt / 1000), step) : ie;
      if (ie == null || ie > vis.to || (ix ?? ie) < vis.from) return r; // poziomy liczą się do skali tylko, gdy trade jest w kadrze (jak w podglądzie); BE też
      const ps = levelPrices();
      return ps.length ? { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, ...ps), maxValue: Math.max(r.priceRange.maxValue, ...ps) } } : r;
    },
  });
  series.setData(bars());
  ts.setVisibleLogicalRange(toLogical(frame));
  vis = ts.getVisibleLogicalRange();

  // nakładki (etap 10): te same przełączniki, stan i funkcje czyste co w podglądzie; rysuje prymityw serii
  const refreshNote = () => {
    ov.model(candles); // wypełnia pamięć podręczną, z której czyta pdhlGap
    root.querySelector('.swc-ov-note').textContent = [ov.pdhlGap(candles) ? t('PDH/PDL: do linii potrzebne są pobrane świece całej poprzedniej sesji.') : '', ov.newsFailed() ? t('Newsy: nie udało się wczytać danych.') : ''].filter(Boolean).join(' ');
  };
  const ov = createOverlays(instrument, () => { markTf(); refreshNote(); prim.requestUpdate(); nprim.requestUpdate(); ov.ensure(candles); }, () => query()); // P35: PDH/PDL z kontraktu trade'a (P38: z B-ADJ, gdy włączony)
  const prim = overlayPrimitive({ chart, series, getModel: () => ov.model(candles), getPrefs: () => ov.prefs(), getCandles: () => candles, getColors: () => c });
  series.attachPrimitive(prim);
  // newsy i earningsy (1.4.0): rysuje prymityw, interakcję (dymek, klawiatura, dotyk) daje warstwa przycisków nad wykresem
  const nwl = mountNewsLayer(plot, { fmt: () => fmtIn(chartTz()) });
  const nprim = newsPrimitive({ chart, series, getModel: () => ov.news(candles), getCandles: () => candles, getStep: () => step, getColors: () => c,
    onGeometry: (g) => { const m = ov.news(candles); nwl.update(g, m, `${chartTz()}|${newsFeed.version()}|${m.groups.length}|${m.eGroups.length}|${m.labels.length}|${candles.length}`); } });
  series.attachPrimitive(nprim);
  ov.ensure(candles);

  // poziomy i znaczniki
  const lines = [];
  const buildLevels = () => {
    lines.splice(0).forEach((l) => series.removePriceLine(l));
    // P27: przy odblokowanej pozycji linie idą za szkicem (wejście, SL, TP, BE z rysunku, wyjście z panelu)
    for (const l of tradeLevels(curTrade(), c)) lines.push(series.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: l.title }));
  };
  // P37 (28.10.2026): znacznik rolla stoi na pierwszej świecy nowego kontraktu (czas >= chwila rolla), nie na ostatniej starej (patrz G.rollIndex).
  const markerTime = (sec) => { const i = G.rollIndex(candles, sec, step, step); return i != null && i >= 0 && i <= candles.length - 1 ? candles[Math.floor(i)][0] : null; };
  const markers = LWC.createSeriesMarkers(series, []);
  const buildMarkers = () => {
    const m = []; // wejście i wyjście zostają w liniach poziomów i w pozycji (znacznik LWC siedzi na świecy, nie na cenie, więc mylił)
    for (const r of rolls) { const rt = markerTime(r.t); if (rt != null) m.push({ time: rt, position: 'aboveBar', shape: 'square', color: c.fg2, size: 0.5, text: r.label || t('Zmiana kontraktu') }); } // P35: podpis „ESZ5 → ESH6”
    // P37 (P2): „brak danych 12–13.06.2014” na pierwszej świecy po dziurze (pod świecą, żeby nie nachodzić na podpis rolla)
    for (const g of gaps) { const i = G.gapCandle(candles, g); if (i != null) m.push({ time: candles[i][0], position: 'belowBar', shape: 'square', color: c.fg2, size: 0.5, text: gapLabel(g) }); }
    markers.setMarkers(m.sort((a, b) => a.time - b.time));
  };
  buildLevels(); buildMarkers();

  // rysunki
  // P27: zapis cen odblokowanej pozycji do pól trade'a tą samą trasą co formularz (PATCH /api/trades/:id, X-THQ, kontrola 409 przez edited).
  // P28 (28.10.2026): plan = planTradeSave (ceny, R z cen, daty wejścia/wyjścia przyciągnięte do świecy, gdy pozycję przesunięto w bok).
  async function saveTrade(plan) {
    await rys.flush(); // zaległy zapis rysunków zmienia last_edited_time: najpierw on, potem ceny
    const body = { ...plan.body, ...(edited ? { edited } : {}) };
    try {
      const r = await fetch(`/api/trades/${tradeId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-THQ': '1' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const err = r.status === 409 && j.code === 'stale' ? t('Ten trade zmieniono w Notion po otwarciu wykresu. Zamknij wykres, odśwież dane i zmień pozycję jeszcze raz.')
          : j.fields ? Object.values(j.fields)[0] : j.error || t('Nie udało się zapisać (błąd {status}).', { status: r.status });
        return { ok: false, error: err };
      }
      if (j.edited) edited = j.edited;
      trade = { ...trade, entryPrice: body.entryPrice, exitPrice: body.exitPrice, sl: body.sl, tp: body.tp, be: body.be, at: plan.at ?? trade.at, exitAt: plan.exitAt ?? null, ...('r' in body ? { r: body.r } : {}) };
      draft = null; buildLevels(); extras.requestUpdate();
      onTradeSaved?.(body, edited, { at: trade.at, exitAt: trade.exitAt, r: trade.r });
      return { ok: true };
    } catch {
      return { ok: false, error: t('Nie mogę połączyć się z lokalnym serwerem.') };
    }
  }
  let rys = null, held = null;
  const extras = extrasPrimitive({ chart, series, getDrawings: () => rys?.manager.drawings() || [], getCandles: () => candles, getStep: () => step, getColors: () => c });
  series.attachPrimitive(extras);
  rys = createRysunki({
    D, chart, series, plot, bar: root.querySelector('.swc-tools'), panel: root.querySelector('.swc-style'),
    stage: root.querySelector('.swc-stage'), gear: root.querySelector('.swc-gear'),
    beLine: (d) => extras.beLine(d),
    textSlot: (d) => extras.textSlot(d), // P32
    // P29: prawy górny róg rysunku w pikselach pola wykresu (miejsce zębatki); linia pozioma: przy prawej krawędzi pola
    anchor: (d) => {
      const pts = d?.points || [];
      if (!pts.length) return null;
      let x = -Infinity, y = Infinity;
      const dir = d.kind === 'short-position' ? -1 : 1, st = d.style || {};
      const prices = pts.map((p) => p.price);
      if (d.kind === 'long-position' || d.kind === 'short-position') prices.push(pts[0].price + dir * (st.profitLevel || 0), pts[0].price - dir * (st.stopLevel || 0));
      for (const p of pts) { const i = G.timeToIndexF(candles, p.time, step), xx = i == null ? null : ts.logicalToCoordinate(i); if (xx != null) x = Math.max(x, xx); }
      for (const p of prices) { const yy = series.priceToCoordinate(p); if (yy != null) y = Math.min(y, yy); }
      if (d.kind === 'horizontal-line') x = ts.width() - 40;
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    },
    foot: { save: root.querySelector('.swc-save'), meter: root.querySelector('.swc-meter') },
    tradeId, doc, colors: () => c, instrument,
    onSaved: (j) => { edited = adoptEdited(edited, j); onSaved?.(j); }, // P27: tylko własny zapis przesuwa znacznik; cudza zmiana trade'a w Notion zostaje wykryta (409)
    onChange: () => extras.requestUpdate(),
    toHex: (v) => { const p = probe(v); const m = /^rgba\((\d+), (\d+), (\d+)/.exec(p); return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : p; },
    confirm: (o) => confirmDialog(o),
    saveTrade,
    onTradeDraft: (p) => { draft = p; buildLevels(); },
    // P28: plan zapisu z listą zmian (daty w strefie przeglądarki, jak formularz trade'a; opis zmian w strefie osi wykresu)
    planTrade: (d) => planTradeSave(trade, d, {
      candles, step, tick: tickOf(instrument), tz: BROWSER_TZ,
      fmt: { price: (v) => F_PRICE.format(v), time: (ms) => { const f = F(), dt = new Date(ms); return `${f.DAY.format(dt)} ${f.HM.format(dt)}`; }, r: (v) => fmtR(v) },
    }),
    exitPoint: (d) => extras.exitPoint(d),
    pointAt: ({ x, y }) => {
      const price = series.coordinateToPrice(y), li = ts.coordinateToLogical(x);
      return { price, time: li == null ? null : G.indexToTime(candles, Math.round(li), step) };
    },
    // w trakcie przeciągania wykres stoi, a skala ceny się nie przelicza (inaczej kropka uciekałaby spod kursora przy Auto)
    hold: (on) => {
      const ps = series.priceScale();
      if (on && !held) {
        const o = chart.options();
        held = { opts: { handleScroll: structuredClone(o.handleScroll), handleScale: structuredClone(o.handleScale) }, auto: ps.options().autoScale };
        chart.applyOptions({ handleScroll: false, handleScale: false });
        if (held.auto) ps.applyOptions({ autoScale: false });
      } else if (!on && held) { chart.applyOptions(held.opts); if (held.auto) ps.applyOptions({ autoScale: true }); held = null; }
    },
    extra: () => positionDrawing(trade, D, c, candles.length ? candles[candles.length - 1][0] : 0),
  });

  // motyw i paleta danych na żywo
  const mo = new MutationObserver(() => {
    const next = readColors(plot), rf = seriesRefresh(c, next, candles);
    if (!rf.restyle) return;
    c = next;
    chart.applyOptions({ ...themeOptions(c), timeScale: { borderVisible: false } });
    series.applyOptions(seriesOptions(c, style));
    if (rf.resetData) series.setData(bars()); // P55: kolory świec z podziału 1m zależą od motywu
    buildLevels(); buildMarkers(); prim.requestUpdate(); extras.requestUpdate();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });

  // ---- dociąganie świec przy krawędzi (lokalnie, bez sieci zewnętrznej) i zmiana TF ----
  const ext = { left: true, right: true };
  let lEdge = candles[0]?.[0] ?? 0, rEdge = (candles[candles.length - 1]?.[0] ?? 0) + step, busy = false;
  async function extend(dir) {
    if (busy || !ext[dir] || !vis) return;
    busy = true;
    const mine = tf;
    try {
      const pad = padFor(tf, (vis.to - vis.from) * step), now = Math.floor(Date.now() / 1000);
      const [f, to] = dir === 'left' ? [lEdge - pad, lEdge] : [rEdge, Math.min(now, rEdge + pad)];
      if (to - f < 60) { ext[dir] = false; return; }
      const myGen = adjGen;
      const j = await fetchCandles(instrument, f, to, tf, query());
      if (!alive || mine !== tf || myGen !== adjGen) return; // P38: odpowiedź z innym B-ADJ niż bieżący nie trafia do świec
      const got = (j.bars || []).filter((b) => (dir === 'left' ? b[0] < candles[0][0] : b[0] > candles[candles.length - 1][0]));
      const r = ts.getVisibleLogicalRange();
      if (dir === 'left') {
        lEdge = f;
        if (!got.length && f < 1275782400) ext.left = false;
        candles = got.concat(candles);
        const cp = step < 60 && r ? capBars(candles, { from: r.from + got.length, to: r.to + got.length }, SUB_MINUTE_MAX_BARS, 'left') : null; // pkt 8: limit pamięci TF < 1 min
        if (cp?.cut) { candles = cp.candles; rEdge = candles[candles.length - 1][0] + step; ext.right = true; }
        series.setData(bars());
        if (got.length && r) ts.setVisibleLogicalRange({ from: r.from + got.length, to: r.to + got.length });
      } else {
        rEdge = to;
        if (to >= now) ext.right = false;
        candles = candles.concat(got);
        const cp = step < 60 && r ? capBars(candles, { from: r.from, to: r.to }, SUB_MINUTE_MAX_BARS, 'right') : null;
        if (cp?.cut) { candles = cp.candles; lEdge = candles[0][0]; ext.left = true; }
        series.setData(bars());
        if (cp?.cut && r) ts.setVisibleLogicalRange({ from: r.from - cp.cut, to: r.to - cp.cut });
      }
      rolls = [...new Map([...rolls, ...(j.rolls || [])].map((x) => [x.t, x])).values()];
      gaps = [...new Map([...gaps, ...(j.gaps || [])].map((x) => [x.t, x])).values()];
      buildMarkers(); refreshNote(); ov.ensure(candles);
    } catch { ext[dir] = false; } finally { busy = false; }
  }
  ts.subscribeVisibleLogicalRangeChange((r) => {
    vis = r;
    rys?.relayout(); // P29: zębatka za rysunkiem
    if (!r || busy) return;
    if (r.from < 30) extend('left');
    if (r.to > candles.length - 30) extend('right');
  });

  const times = () => { const r = ts.getVisibleLogicalRange() || vis; const { fromIndex, toIndex } = fromLogical(r); return [G.indexToTimeF(candles, fromIndex, step), G.indexToTimeF(candles, toIndex, step)]; };
  async function setTf(next) {
    const p = parseTf(next);
    if (!p || busy || next === tf) return;
    busy = true;
    try {
      const [a0, b0] = times();
      const want = p.str; // P26 (28.10.2026): bez automatycznego podnoszenia TF
      const [a, b] = clampFrameTf(a0, b0, want); // przegląd 1.3.0, pkt 1: przycięcie kadru do limitu nowego TF przed żądaniem (inaczej 422 i przycisk „nic nie robi”)
      const pad = padFor(want, b - a);
      const myGen = adjGen;
      const j = await fetchCandles(instrument, a - pad, Math.min(Math.floor(Date.now() / 1000), b + pad), want, query());
      if (myGen !== adjGen) return;
      if (!alive || !(j.bars || []).length) return;
      tf = want; step = tfSec(tf); candles = j.bars; rolls = j.rolls || []; gaps = j.gaps || [];
      ext.left = ext.right = true; lEdge = candles[0][0]; rEdge = candles[candles.length - 1][0] + step;
      series.setData(bars());
      ts.setVisibleLogicalRange(toLogical({ fromIndex: G.timeToIndexF(candles, a, step), toIndex: G.timeToIndexF(candles, b, step) }));
      buildMarkers(); markTf(); refreshNote(); ov.ensure(candles);
      try { localStorage.setItem('thq.chart.tf.v1', tf); } catch { /* localStorage niedostępny */ }
    } catch { /* zostaje poprzedni TF */ } finally { busy = false; }
  }
  const tfBar = mountTfBar(root, { current: () => tf }); // P27: ulubione interwały, wspólne z podglądem
  const ovPop = mountOverlayPop(root, ov, { refSec: () => Math.floor(trade.at / 1000) }); // P32: ustawienia sesji i PDH/PDL, wspólne z podglądem
  const markTf = () => {
    tfBar.paint();
    markToggles(root, autoY, Math.floor(trade.at / 1000), ov.prefs(), badj);
    const bj = root.querySelector('[data-swc="badj"]');
    if (bj && !anchored) { bj.disabled = true; bj.title = t('Back-adjust jest wyłączony w trybie edycji: trade bez czasu nie ma kontraktu kotwicy, więc ceny zapisywałyby się w złej skali.'); }
    const w = root.querySelector('.swc-warn');
    if (w) { w.textContent = badj ? badjWarning(adjust) : ''; w.hidden = !badj; }
  };
  markTf(); refreshNote();

  // ---- P26: skala ceny ----
  // Przeciągnięcie osi ceny w LWC samo wyłącza autoScale, a dwuklik na osi je włącza: stan przełącznika czytamy po każdym puszczeniu i dwukliku.
  const ps = () => series.priceScale();
  // P32 (28.10.2026), słowa użytkownika: «tryb auto nawet jak jest wylaczony po wejsciu na wykres to jest on wlaczony i trzeba go przeklikac dwa razy»:
  // wyłączone „Auto” przy starcie edycji = zakres z podglądu (frame.yr) albo zakres, który dałaby skala automatyczna (startRange, jak w podglądzie),
  // ustawiony od razu jako ręczny, więc przycisk i zachowanie skali zgadzają się od pierwszej klatki.
  const paneH = () => Math.max(1, plot.clientHeight - ts.height());
  const priceRange = () => {
    const a = series.coordinateToPrice(0), b = series.coordinateToPrice(paneH());
    return a == null || b == null ? null : { min: Math.min(a, b), max: Math.max(a, b) };
  };
  // LWC liczy setVisibleRange w obrębie marginesów skali, więc zakres poprawiamy raz po odczycie, żeby krawędzie pola miały dokładnie min i max.
  const applyRange = (yr) => {
    ps().setVisibleRange({ from: yr.min, to: yr.max });
    const got = priceRange();
    if (!got || !(got.max > got.min)) return;
    const span = yr.max - yr.min, al = (got.max - yr.max) / span, be = (yr.min - got.min) / span;
    const s2 = span / (1 + al + be), top = yr.max - al * s2;
    ps().setVisibleRange({ from: top - s2, to: top });
  };
  const startManual = () => {
    if (autoY || !alive || !candles.length) return;
    let yr = frame.yr && frame.yr.max > frame.yr.min ? frame.yr : null;
    if (!yr) {
      const r = ts.getVisibleLogicalRange() || vis;
      const a = Math.max(0, Math.floor(r?.from ?? 0)), b = Math.min(candles.length - 1, Math.ceil(r?.to ?? candles.length - 1));
      let lo = Infinity, hi = -Infinity;
      for (let i = a; i <= b; i++) { lo = Math.min(lo, candles[i][3]); hi = Math.max(hi, candles[i][2]); }
      const ie = G.timeToIndex(candles, Math.floor(trade.at / 1000), step), ix = trade.exitAt != null ? G.timeToIndex(candles, Math.floor(trade.exitAt / 1000), step) : ie;
      if (ie != null && ie <= b && (ix ?? ie) >= a) for (const p of levelPrices()) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
      yr = startRange(false, null, lo, hi);
    }
    applyRange(yr);
  };
  if (!autoY) requestAnimationFrame(() => requestAnimationFrame(startManual));
  const setAuto = (on) => { autoY = !!on; ps().applyOptions({ autoScale: autoY }); saveAutoScale(autoY); markTf(); };
  const syncAuto = () => { const a = ps().options().autoScale !== false; if (a !== autoY) { autoY = a; saveAutoScale(autoY); markTf(); } };
  plot.addEventListener('pointerup', () => setTimeout(syncAuto, 0), { signal });
  plot.addEventListener('dblclick', () => setTimeout(syncAuto, 0), { signal });
  // kółko nad osią ceny skaluje cenę wokół kursora (LWC tego nie robi; jak w podglądzie), wyłączając „Auto”
  plot.addEventListener('wheel', (ev) => {
    const r = plot.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    const axisW = ps().width();
    if (!(axisW > 0 && x > r.width - axisW && y < r.height - ts.height())) return;
    const vr = ps().getVisibleRange(), at = series.coordinateToPrice(y);
    if (!vr || at == null) return;
    ev.preventDefault(); ev.stopPropagation();
    const z = zoomPrice({ min: vr.from, max: vr.to }, at, Math.exp(Math.max(-1, Math.min(1, ev.deltaY * 0.0015))));
    if (autoY) { autoY = false; saveAutoScale(false); markTf(); }
    ps().setVisibleRange({ from: z.min, to: z.max });
  }, { capture: true, passive: false, signal });

  root.addEventListener('change', (ev) => {
    if (alive && ev.target.matches?.('select[data-swc="tz"]')) { setChartTzOverride(ev.target.value); chart.applyOptions(timeOpts()); markTf(); return; }
    const i = alive && ev.target.closest?.('[data-swc-ov]');
    if (i) { ov.set(i.dataset.swcOv, i.checked); ov.ensure(candles); }
  }, { signal });
  // P38: przełączenie B-ADJ w edytorze (chwilowo): ta sama seria od nowa z/bez adjust=1 w tym samym kadrze; busy blokuje zmianę w trakcie ładowania,
  // adjGen unieważnia odpowiedzi rozpoczęte przed przełączeniem (analogicznie do W1 w podglądzie). Pozycja, poziomy i rysunki nie zmieniają cen: są w skali kontraktu trade'a.
  async function setBadj(on) {
    if (!anchored || busy || on === badj) return;
    busy = true;
    const gen = ++adjGen;
    try {
      const [a, b] = times();
      const pad = padFor(tf, b - a);
      const q = { ...tradeQuery(trade), ...(on ? { adjust: 1 } : {}) };
      const j = await fetchCandles(instrument, a - pad, Math.min(Math.floor(Date.now() / 1000), b + pad), tf, q);
      if (!alive || gen !== adjGen || !(j.bars || []).length) return;
      if (on && !(j.adjust?.anchor && j.contract?.code === j.adjust.anchor)) return; // bez kotwicy na kontrakcie trade'a nie pokazujemy przesuniętych cen w edytorze
      badj = on; adjust = j.adjust || null;
      candles = j.bars; rolls = j.rolls || []; gaps = j.gaps || [];
      ext.left = ext.right = true; lEdge = candles[0][0]; rEdge = candles[candles.length - 1][0] + step;
      series.setData(bars());
      ts.setVisibleLogicalRange(toLogical({ fromIndex: G.timeToIndexF(candles, a, step), toIndex: G.timeToIndexF(candles, b, step) }));
      ov.reset(); buildMarkers(); markTf(); refreshNote(); ov.ensure(candles);
    } catch { /* zostaje poprzedni widok */ } finally { busy = false; }
  }
  root.addEventListener('click', (ev) => {
    if (!alive) return; // po destroy() ten sam element wraca do podglądu
    const b = ev.target.closest('[data-swc-tf]');
    if (b) { setTf(b.dataset.swcTf); return; }
    if (ev.target.closest('[data-swc="badj"]')) { setBadj(!badj); return; }
    if (ev.target.closest('.swc-done')) { done(); return; }
    if (ev.target.closest('[data-swc="auto"]')) { setAuto(!autoY); return; }
    const dr = ev.target.closest('.swc-draw');
    if (dr) { const open = root.querySelector('.swc-tools').classList.toggle('open'); dr.setAttribute('aria-expanded', String(open)); }
  }, { signal });

  let finished = false;
  async function done() {
    if (finished) return;
    finished = true;
    // W3 (przegląd 28.10.2026): zapis rysunków, który się nie udał, nie ginie po cichu. Ostatnia próba teraz; jeśli dalej nie wychodzi, użytkownik wybiera:
    // zostać w edycji (stan czeka w kolejce, kolejne „Gotowe” ponowi zapis) albo zamknąć bez zapisu tych zmian.
    await rys.flush();
    if (rys.failed()) {
      const leave = await confirmDialog({
        title: t('Rysunki nie zostały zapisane'),
        text: t('Ostatnie zmiany rysunków nie trafiły do Notion ({err}). Zostań w edycji i spróbuj jeszcze raz albo zamknij edycję i zrezygnuj z tych zmian.', { err: rys.error() }),
        ok: t('Zamknij bez zapisu'), cancel: t('Zostań w edycji'), danger: true,
      });
      if (!leave) { finished = false; return; }
    }
    const [from, to] = times();
    const frameOut = { tf, from, to, doc: rys.currentDoc(), yr: autoY ? null : priceRange(), badj }; // P32: ręczny zakres ceny wraca do podglądu
    await destroy();
    onDone?.(frameOut);
  }
  // Zwraca { unsaved }: ostatni zapis rysunków się nie udał (widok, który zamyka edycję inaczej niż przez „Gotowe”, ostrzega użytkownika)
  async function destroy() {
    if (!alive) return { unsaved: false };
    alive = false;
    ac.abort();
    mo.disconnect();
    ov.destroy();
    nwl.destroy();
    tfBar.destroy();
    ovPop.destroy();
    await rys.destroy();
    const unsaved = rys.failed();
    try { chart.remove(); } catch { /* już usunięty */ }
    root.innerHTML = ''; root.classList.remove('swc');
    return { unsaved };
  }

  return {
    status: () => 'ok', redraw() {}, ready: Promise.resolve(), editing: true,
    currentDoc: rys.currentDoc, state: () => ({ tf, ...fromLogical(ts.getVisibleLogicalRange() || vis), autoY, yr: autoY ? null : priceRange() }), manager: rys.manager, chart,
    rys, trade: () => ({ ...trade }), edited: () => edited,
    series, exitPoint: (d) => extras.exitPoint(d), // P28: uchwyt wyjścia (testy zgodności z LWC)
    beLine: (d) => extras.beLine(d), // P29: uchwyt BE (testy)
    textSlot: (d) => extras.textSlot(d), // P32: pole tekstu (testy)
    destroy,
  };
}
