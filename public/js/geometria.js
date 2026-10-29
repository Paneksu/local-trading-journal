// Geometria wykresu świecowego: czyste funkcje (bez DOM) wspólne dla podglądu SVG (podglad.js) i kart canvas (udostepnij-render.js).
// Oś X liczona po INDEKSIE świecy, nie po czasie: luki nocne, weekendy i sekundy bez transakcji się zwijają (świeca istnieje tylko,
// gdy była transakcja; ciągłości czasu nie zakładamy). Punkt rysunku z czasem t trafia na świecę, która go zawiera; przed pierwszą
// i za ostatnią świecą indeks jest ułamkowy, liczony medianą odstępu ostatnich 50 świec, tak jak robi to paczka rysowania
// (lightweight-charts-drawing 0.6.2, makeCoords → timeToX) na wykresie LWC bez własnej osi przyszłości. Test zgodności: testy/zgodnosc-rysunkow.html.
// Zero literałów kolorów: kolor z rysunku (dane użytkownika) idzie do kształtu jako `color`, resztę nadaje CSS klasami.
// Świeca to tablica [t, o, h, l, c, v] (t w sekundach epoki UTC, posortowane rosnąco), jak w /api/candles.
// English: pure chart geometry (index-based time axis, price scale, drawing and candle shapes) shared by the SVG preview and canvas cards.

// Mediana odstępu (s) ostatnich 50 świec; mniej niż 2 świece: doba (jak paczka rysowania).
export function medianStep(candles) {
  if (!candles || candles.length < 2) return 86400;
  const d = [];
  for (let i = Math.max(1, candles.length - 50); i < candles.length; i++) {
    const g = candles[i][0] - candles[i - 1][0];
    if (g > 0) d.push(g);
  }
  if (!d.length) return 86400;
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}

// Indeks świecy dla czasu t: świeca zawierająca t (ostatnia z czasem <= t); przed pierwszą i za ostatnią ułamek co `step` sekund.
export function timeToIndex(candles, t, step = medianStep(candles)) {
  const n = candles?.length ?? 0;
  if (!n || !Number.isFinite(t)) return null;
  const first = candles[0][0], last = candles[n - 1][0];
  if (t >= last) return t === last ? n - 1 : step > 0 ? n - 1 + (t - last) / step : null;
  if (t < first) return step > 0 ? (t - first) / step : null;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candles[mid][0] <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

// P37 (28.10.2026): indeks świecy dla znacznika zmiany kontraktu (rolla) o chwili t. Nie „świeca zawierająca t” jak w timeToIndex, tylko pierwsza świeca nowego
// kontraktu: ostatnia świeca z czasem <= t liczy się, gdy jej przedział [czas, czas + span) obejmuje t (wyższy interwał, np. 5m, 1D, 1W od 17:00), a gdy t
// wypada po jej końcu (1m: pierwsza transakcja nowego kontraktu o 17:02, ostatnia stara świeca 16:27), znacznik idzie na następną świecę (>= t).
// span = czas trwania świecy w sekundach (parseTf(tf).sec); bez niego jak timeToIndex. Poza danymi: jak timeToIndex (ułamek co `step`).
export function rollIndex(candles, t, span, step = medianStep(candles)) {
  const i = timeToIndex(candles, t, step);
  const n = candles?.length ?? 0;
  if (i == null || i < 0 || i >= n - 1 || !(span > 0)) return i;
  const c = candles[i][0];
  if (c === t || c + span > t) return i;
  return i + 1; // i < n - 1, więc istnieje i leży po t
}
// P37 (P2): dziura w danych g = { t, to } (sesje bez świec, sekundy UTC). Indeks pierwszej świecy PO dziurze (czas >= g.to) albo null, gdy za dziurą nie ma świec.
export function gapCandle(candles, g) {
  const n = candles?.length ?? 0;
  let lo = 0, hi = n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (candles[m][0] < g.to) lo = m + 1; else hi = m; }
  return lo < n ? lo : null;
}
// Położenie znacznika dziury na osi indeksu: krawędź między świecą przed dziurą a pierwszą po niej (indeks ułamkowy), albo null.
export function gapIndex(candles, g) {
  const i = gapCandle(candles, g);
  return i == null ? null : i - 0.5;
}
// P37 (P2): daty w podpisie znacznika dziury z dni handlowych g.a i g.b (YYYY-MM-DD): „brak danych 12–13.06.2014”, „30.09–02.10.2014”, „31.12.2014–02.01.2015”.
export function gapDates(g) {
  const p = (d) => { const [y, m, dd] = String(d).split('-'); return { y, m, d: dd }; };
  const a = p(g.a), b = p(g.b ?? g.a);
  if (a.y === b.y && a.m === b.m && a.d === b.d) return `${a.d}.${a.m}.${a.y}`;
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d}.${a.m}.${a.y}`;
  if (a.y === b.y) return `${a.d}.${a.m}–${b.d}.${b.m}.${a.y}`;
  return `${a.d}.${a.m}.${a.y}–${b.d}.${b.m}.${b.y}`;
}
// Czas dla indeksu (także ułamkowego i poza danymi): odwrotność timeToIndex na krańcach, czas świecy w środku.
export function indexToTime(candles, i, step = medianStep(candles)) {
  const n = candles?.length ?? 0;
  if (!n || !Number.isFinite(i)) return null;
  if (i >= n - 1) return Math.round(candles[n - 1][0] + (i - (n - 1)) * step);
  if (i < 0) return Math.round(candles[0][0] + i * step);
  return candles[Math.floor(i)][0];
}

// P28 (28.10.2026): czas przyciągnięty do początku świecy bieżącego interwału, która go zawiera (poza danymi: siatka co `step` od skrajnej świecy).
export function snapTime(candles, t, step = medianStep(candles)) {
  const i = timeToIndex(candles, t, step);
  return i == null ? null : indexToTime(candles, Math.floor(i + 1e-9), step);
}

// Wersje ułamkowe (kadr podglądu ↔ tryb edycji): wnętrze danych interpolowane liniowo między sąsiednimi świecami, więc para
// timeToIndexF / indexToTimeF jest odwrotna bez zaokrąglania do świecy i kadr przechodzi między widokami bez skoku.
export function timeToIndexF(candles, t, step = medianStep(candles)) {
  const i = timeToIndex(candles, t, step);
  if (i == null || i < 0 || i >= candles.length - 1) return i;
  const a = candles[i][0], b = candles[i + 1][0];
  return t > a ? i + (t - a) / (b - a) : i;
}
export function indexToTimeF(candles, i, step = medianStep(candles)) {
  const n = candles?.length ?? 0;
  if (!n || !Number.isFinite(i)) return null;
  if (i >= n - 1 || i < 0) return indexToTime(candles, i, step);
  const lo = Math.floor(i);
  return candles[lo][0] + (i - lo) * (candles[lo + 1][0] - candles[lo][0]);
}

// Skala X po indeksie: x(i) = right − (lastIndex − i + rightOffset) × spacing (wzór osi LWC; `right` to x indeksu lastIndex + rightOffset).
export function indexScale({ lastIndex, right, spacing, rightOffset = 0 }) {
  const x = (i) => right - (lastIndex - i + rightOffset) * spacing;
  const index = (px) => lastIndex + rightOffset - (right - px) / spacing;
  return { x, index, spacing, lastIndex, right, rightOffset };
}

// Domyślne marginesy skali ceny w LWC (scaleMargins): 20% u góry, 10% u dołu.
export const LWC_MARGINS = { top: 0.2, bottom: 0.1 };
// Liniowa skala ceny dla zakresu [min, max] w pasie [top, top + height] z marginesami (ułamki wysokości).
export function priceScale({ min, max, top = 0, height, margins = LWC_MARGINS }) {
  if (!(max > min)) { const c = Number.isFinite(min) ? min : 0; min = c - 1; max = c + 1; }
  const y0 = top + height * margins.top, y1 = top + height * (1 - margins.bottom);
  return fromTwo(max, y0, min, y1, { min, max, top, height });
}
// Skala ceny z dwóch punktów (cena → y), np. odczytanych z LWC priceToCoordinate().
export function priceScaleFrom(p1, y1, p2, y2) { return fromTwo(p1, y1, p2, y2, {}); }
function fromTwo(p1, y1, p2, y2, extra) {
  const k = (y2 - y1) / (p2 - p1);
  return { ...extra, y: (p) => y1 + (p - p1) * k, price: (y) => p1 + (y - y1) / k };
}

// Komplet skal dla kształtów: { x, y, idx(t), left, right, top, bottom, pip }.
// candles: świece osi (indeksy liczone od 0 w tej tablicy); xs: indexScale; ys: priceScale; box: krawędzie pola wykresu.
// decimal: separator dziesiętny podpisów (R:R pozycji), domyślnie kropka.
export function chartScales({ candles, xs, ys, box, pip = 0.01, step, decimal = '.' }) {
  const st = step ?? medianStep(candles);
  return { x: xs.x, y: ys.y, idx: (t) => timeToIndex(candles, Number(t), st), pip, step: st, spacing: xs.spacing, decimal, ...box };
}

// ---- kształty rysunków (8 narzędzi: 7 z etapu 9 + Gann box z P27) ----
export const KINDS = ['horizontal-line', 'trend-line', 'rectangle', 'fib-retracement', 'gann-box', 'text', 'long-position', 'short-position'];
// P7: domyślne poziomy Fibonacciego, gdy rysunek nie ma własnych.
export const FIB_DEFAULT = [0, 0.5, 0.618, 0.705, 0.79, 1];
// P27: domyślne poziomy Gann boxa (ceny i czasu), jak w TradingView.
export const GANN_DEFAULT = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1];

const pt = (p, s) => { const i = s.idx(p.time); return i == null ? null : { x: s.x(i), y: s.y(p.price), i }; };
const lineStyleOf = (st) => (st?.lineStyle === 'dashed' || st?.lineStyle === 'dotted' ? st.lineStyle : 'solid');
const colorOf = (v) => (typeof v === 'string' && v ? v : null);
// Liczba bez zbędnych zer (jak paczka: 0.382, 1, 0.5).
export const coeffText = (c) => Number(c).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') || '0';
// Wypełnienie z przezroczystości w procentach (paczka: 100 − transparency); domyślnie 80.
const opacityOf = (tr, def = 80) => Math.max(0, Math.min(1, (100 - (Number.isFinite(tr) ? tr : def)) / 100));
// Linia przez a i b przycięta do [left, right] w stronę przedłużeń.
function extendSeg(a, b, L, R, left, right) {
  if (a.x === b.x) return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  const k = (b.y - a.y) / (b.x - a.x);
  const at = (x) => a.y + (x - a.x) * k;
  const [p, q] = a.x <= b.x ? [a, b] : [b, a];
  const x1 = L ? left : p.x, x2 = R ? right : q.x;
  return { x1, y1: L ? at(left) : p.y, x2, y2: R ? at(right) : q.y };
}

// P27: tekst przy rysunku w miejscu, w którym stawia go paczka (funkcja G: pole tekstu z marginesem size/3).
// vert: 'bottom' = nad punktem, 'middle' = na punkcie, 'top' = pod punktem; horz: 'left' = od punktu w prawo, 'right' = do punktu, 'center'.
// Wynik: część { t: 'text', x, y (górna krawędź pierwszej linii, baseline 'hanging'), anchor, size, angle (stopnie), ax, ay (oś obrotu) }.
// P32: padH = margines poziomy osobno (prostokąt paczki: fontSize/3 tylko przy tekście w środku wysokości, inaczej 0; test zgodności wykazał 4,7 px różnicy).
export function textPart({ x, y, text, size = 12, horz = 'center', vert = 'middle', offsetX = 0, offsetY = 0, angle = 0, cls = 'drw-text', color = null, padH = null }) {
  const pad = size / 3, h = size + 2 * pad, ph = padH ?? pad;
  const top = vert === 'bottom' ? y - h - offsetY : vert === 'middle' ? y - h / 2 : y + offsetY;
  const tx = horz === 'left' ? x + offsetX + ph : horz === 'right' ? x - offsetX - ph : x;
  return { t: 'text', x: tx, y: top + pad, text, cls, anchor: horz === 'left' ? 'start' : horz === 'right' ? 'end' : 'middle', baseline: 'hanging', size, angle, ax: x, ay: y, color };
}
const textOf = (d) => (typeof d.style?.text === 'string' && d.style.text ? d.style.text : typeof d.text === 'string' ? d.text : '');

// Kształty jednego rysunku: { kind, color, parts: [...] } albo null (nieznany rodzaj albo zły kształt).
// Część: { t: 'line', x1, y1, x2, y2, cls, dash, color?, width? } | { t: 'rect', x, y, w, h, cls, fill, fillColor?, fillOpacity?, stroke?, width? }
//      | { t: 'text', x, y, text, cls, anchor, baseline?, size?, angle?, color? }. Kolor części wygrywa z kolorem rysunku.
export function shapes(drawing, s) {
  if (!drawing || !KINDS.includes(drawing.kind) || !Array.isArray(drawing.points) || !drawing.points.length) return null;
  const st = drawing.style || {};
  const color = colorOf(st.color);
  const dash = lineStyleOf(st);
  const width = Number.isFinite(st.width) ? st.width : null;
  const P = drawing.points.map((p) => (p && typeof p.price === 'number' ? pt(p, s) : null));
  if (P.some((p) => !p)) return null;
  const parts = [];
  const txt = textOf(drawing), size = Number.isFinite(st.fontSize) ? st.fontSize : 12, tcol = colorOf(st.textColor) || color;
  switch (drawing.kind) {
    case 'horizontal-line': {
      parts.push({ t: 'line', x1: s.left, y1: P[0].y, x2: s.right, y2: P[0].y, cls: 'drw-line', dash, width });
      // P27: tekst na linii (paczka gs: lewo = 3 px od krawędzi, prawo = krawędź − 3 px, środek; pionowo domyślnie na linii)
      if (txt) {
        const h = st.horzLabelsAlign || 'center';
        parts.push(textPart({ x: h === 'left' ? s.left + 3 : h === 'right' ? s.right : (s.left + s.right) / 2, y: P[0].y, text: txt, size, horz: h, vert: st.vertLabelsAlign || 'middle', offsetX: h === 'right' ? 3 : 0, color: tcol }));
      }
      break;
    }
    case 'trend-line': {
      if (P.length < 2) return null;
      const seg = extendSeg(P[0], P[1], !!st.extendLeft, !!st.extendRight, s.left, s.right);
      parts.push({ t: 'line', ...seg, cls: 'drw-line', dash, width });
      // P27: tekst wzdłuż linii (paczka Oi: punkt lewy, prawy albo środek odcinka, obrót o kąt linii, domyślnie nad linią)
      if (txt) {
        const [a, b] = P[0].x <= P[1].x ? [P[0], P[1]] : [P[1], P[0]];
        const h = st.horzLabelsAlign || 'center', v = st.vertLabelsAlign || 'bottom';
        const at = h === 'left' ? a : h === 'right' ? b : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const ang = b.x === a.x ? 0 : (Math.atan((a.y - b.y) / (a.x - b.x)) * 180) / Math.PI;
        parts.push(textPart({ x: at.x, y: at.y, text: txt, size: Number.isFinite(st.fontSize) ? st.fontSize : 14, horz: h, vert: v, angle: ang, color: tcol }));
      }
      break;
    }
    case 'rectangle': {
      if (P.length < 2) return null;
      const x1 = st.extendLeft ? s.left : Math.min(P[0].x, P[1].x), x2 = st.extendRight ? s.right : Math.max(P[0].x, P[1].x);
      const y1 = Math.min(P[0].y, P[1].y), y2 = Math.max(P[0].y, P[1].y);
      // P27: osobny kolor wypełnienia (backgroundColor) i jego przezroczystość (transparency, jak paczka: be())
      const fill = st.fillBackground !== false;
      parts.push({ t: 'rect', x: x1, y: y1, w: x2 - x1, h: y2 - y1, cls: 'drw-rect', fill, dash, width,
        fillColor: colorOf(st.backgroundColor) || color, fillOpacity: fill ? (st.transparency != null ? opacityOf(st.transparency) : null) : 0 });
      // CE w FVG: linia środka prostokąta (rectMiddleLine.visible)
      if (st.rectMiddleLine?.visible) parts.push({ t: 'line', x1, y1: (y1 + y2) / 2, x2, y2: (y1 + y2) / 2, cls: 'drw-mid', dash: 'dashed', color: colorOf(st.rectMiddleLine.color) });
      // P27: tekst w prostokącie (paczka qo: lewa, prawa krawędź albo środek; pionowo środek, 'bottom' nad górną krawędzią, 'top' pod dolną)
      if (txt) {
        const h = st.horzLabelsAlign || 'center', v = st.vertLabelsAlign || 'middle';
        const tx = h === 'left' ? x1 : h === 'right' ? x2 : (x1 + x2) / 2;
        parts.push(textPart({ x: tx, y: v === 'middle' ? (y1 + y2) / 2 : v === 'top' ? y2 : y1, text: txt, size: Number.isFinite(st.fontSize) ? st.fontSize : 14, horz: h, vert: v, color: tcol, padH: v === 'middle' ? null : 0 }));
      }
      break;
    }
    case 'fib-retracement': {
      if (P.length < 2) return null;
      const a = drawing.points[0].price, b = drawing.points[1].price;
      const [k0, k1] = st.reverse ? [a, b] : [b, a]; // poziom 0 na drugim punkcie, 1 na pierwszym (jak paczka)
      // P27: własne poziomy (dodawane, usuwane, włączane, z kolorem), wypełnienie między poziomami, podpisy współczynnika i ceny
      const own = Array.isArray(st.levels) ? st.levels.filter((l) => l && l.visible !== false && Number.isFinite(l.coeff)) : null;
      const levels = (own && own.length ? own.map((l) => ({ coeff: l.coeff, color: colorOf(l.color) })) : FIB_DEFAULT.map((coeff) => ({ coeff, color: null }))).sort((p, q) => p.coeff - q.coeff);
      const x1 = st.extendLeft ? s.left : Math.min(P[0].x, P[1].x), x2 = st.extendRight ? s.right : Math.max(P[0].x, P[1].x);
      const op = st.fillBackground === false ? 0 : opacityOf(st.transparency);
      const yOf = (c) => s.y(k0 + c * (k1 - k0));
      if (op > 0) levels.slice(1).forEach((l, k) => { const ya = yOf(levels[k].coeff), yb = yOf(l.coeff); parts.push({ t: 'rect', x: x1, y: Math.min(ya, yb), w: Math.max(1, x2 - x1), h: Math.abs(yb - ya), cls: 'drw-zone', fill: true, stroke: false, fillColor: l.color, fillOpacity: op }); });
      const dec = s.pip >= 1 ? 0 : 2; // dwa miejsca jak w trybie edycji (seria LWC z krokiem 0,01) i jak ceny ES/NQ (7711,25)
      for (const l of levels) {
        const price = k0 + l.coeff * (k1 - k0), y = s.y(price);
        parts.push({ t: 'line', x1, y1: y, x2, y2: y, cls: 'drw-fib', dash: 'solid', coeff: l.coeff, price, color: l.color, width });
        let label = st.showCoeffs !== false ? (st.fibLevelsAsPercents ? `${coeffText(l.coeff * 100)}%` : coeffText(l.coeff)) : '';
        if (st.showPrices !== false) label += `${label ? ' ' : ''}(${price.toFixed(dec)})`;
        if (label) parts.push({ t: 'text', x: x1, y, text: label, cls: 'drw-label', anchor: 'end', coeff: l.coeff, color: l.color });
      }
      break;
    }
    case 'gann-box': {
      // P27 (28.10.2026), słowa użytkownika: «dodaj gann boxa do rysunkow»: poziomy ceny (poziome) i czasu (pionowe) między dwoma punktami,
      // wypełnienie stref kolorem poziomu (jak paczka Gs: cena od pierwszego punktu, czas po indeksie świecy zaokrąglonym do całej świecy).
      if (P.length < 2) return null;
      const L = Math.min(P[0].x, P[1].x), R = Math.max(P[0].x, P[1].x), T = Math.min(P[0].y, P[1].y), B = Math.max(P[0].y, P[1].y);
      const rev = !!st.reverse, [p0, p1] = drawing.points;
      const lv = (arr) => (Array.isArray(arr) && arr.length ? arr.filter((l) => l && l.visible !== false && Number.isFinite(l.coeff)) : GANN_DEFAULT.map((coeff) => ({ coeff })));
      const yOf = (c) => s.y((rev ? p1.price : p0.price) + c * (rev ? p0.price - p1.price : p1.price - p0.price));
      const i0 = P[0].i, i1 = P[1].i, inData = (i) => Number.isInteger(i) && i >= 0;
      const xOf = (c) => {
        if (inData(i0) && inData(i1)) { const e = rev ? i1 : i0, d = rev ? i0 - i1 : i1 - i0; return s.x(Math.round(e + c * d)); }
        return rev ? P[1].x + c * (P[0].x - P[1].x) : P[0].x + c * (P[1].x - P[0].x);
      };
      const H = lv(st.levels).map((l) => ({ ...l, y: yOf(l.coeff) })), V = lv(st.vLevels).map((l) => ({ ...l, x: xOf(l.coeff) }));
      const hop = st.fillBackground === false ? 0 : opacityOf(st.transparency), vop = st.fillVertBackground === false ? 0 : opacityOf(st.vertTransparency);
      H.forEach((l, k) => {
        if (k > 0 && hop > 0) parts.push({ t: 'rect', x: L, y: Math.min(l.y, H[k - 1].y), w: R - L, h: Math.abs(l.y - H[k - 1].y), cls: 'drw-zone', fill: true, stroke: false, fillColor: colorOf(l.color) || color, fillOpacity: hop });
        parts.push({ t: 'line', x1: L, y1: l.y, x2: R, y2: l.y, cls: 'drw-gann', dash, color: colorOf(l.color), width, coeff: l.coeff });
        if (st.showLeftLabels !== false) parts.push({ t: 'text', x: L, y: l.y, text: coeffText(l.coeff), cls: 'drw-label', anchor: 'end', color: colorOf(l.color) });
        if (st.showRightLabels !== false) parts.push({ t: 'text', x: R + 5, y: l.y, text: coeffText(l.coeff), cls: 'drw-label', anchor: 'start', color: colorOf(l.color) });
      });
      V.forEach((l, k) => {
        if (k > 0 && vop > 0) parts.push({ t: 'rect', x: Math.min(l.x, V[k - 1].x), y: T, w: Math.abs(l.x - V[k - 1].x), h: B - T, cls: 'drw-zone', fill: true, stroke: false, fillColor: colorOf(l.color) || color, fillOpacity: vop });
        parts.push({ t: 'line', x1: l.x, y1: T, x2: l.x, y2: B, cls: 'drw-gann', dash, color: colorOf(l.color), width, coeff: l.coeff });
        if (st.showTopLabels !== false) parts.push({ t: 'text', x: l.x, y: T - 9, text: coeffText(l.coeff), cls: 'drw-label', anchor: 'middle', color: colorOf(l.color) });
        if (st.showBottomLabels !== false) parts.push({ t: 'text', x: l.x, y: B + 9, text: coeffText(l.coeff), cls: 'drw-label', anchor: 'middle', color: colorOf(l.color) });
      });
      break;
    }
    case 'text': {
      if (!txt) return null;
      // P32 (28.10.2026): jak paczka (ki: pole tekstu od punktu w prawo i w dół, margines fontSize/6), żeby tekst stał w podglądzie tam, gdzie w edycji,
      // a pole edycji w miejscu (rysunki.js) trafiało w wyrenderowany tekst. Wcześniej środek wiersza leżał na punkcie (kilka px wyżej niż w edycji).
      const fs = Number.isFinite(st.fontSize) ? st.fontSize : 14, pad = fs / 6;
      parts.push({ t: 'text', x: P[0].x + pad, y: P[0].y + pad, text: txt, cls: 'drw-text', anchor: 'start', baseline: 'hanging', size: fs, angle: 0, ax: P[0].x, ay: P[0].y, color: tcol });
      break;
    }
    case 'long-position':
    case 'short-position': {
      if (P.length < 2) return null;
      const entry = drawing.points[0].price;
      const span = Math.abs(drawing.points[1].price - entry) || s.pip * 100;
      const stop = st.stopLevel ?? span, profit = st.profitLevel ?? span;
      const dir = drawing.kind === 'long-position' ? 1 : -1;
      const yE = s.y(entry), yT = s.y(entry + dir * profit), yS = s.y(entry - dir * stop);
      const x1 = Math.min(P[0].x, P[1].x), x2 = Math.max(P[0].x, P[1].x);
      parts.push({ t: 'rect', x: x1, y: Math.min(yE, yT), w: x2 - x1, h: Math.abs(yT - yE), cls: 'pos-profit', fill: true, role: 'target', price: entry + dir * profit });
      parts.push({ t: 'rect', x: x1, y: Math.min(yE, yS), w: x2 - x1, h: Math.abs(yS - yE), cls: 'pos-loss', fill: true, role: 'stop', price: entry - dir * stop });
      parts.push({ t: 'line', x1, y1: yE, x2, y2: yE, cls: 'drw-entry', dash: 'solid', role: 'entry', price: entry });
      parts.push(...positionExtras(drawing, s, { x1, x2, entry, dir, stop, profit, yE, yT }));
      return { kind: drawing.kind, color: null, parts }; // pozycja ma kolory zysku i straty z motywu
    }
  }
  return { kind: drawing.kind, color, parts };
}

// P27: dodatki pozycji, których paczka rysowania nie ma (w edytorze rysuje je prymityw serii z wykres.js z tych samych części):
// (1) poziom BE, słowa użytkownika: «do rysunkow pozycji dodaj mozliwosc dodawania poziomu be»: style.beLevel = odległość od wejścia
//     w stronę zysku (cena BE = wejście + kierunek × beLevel), przerywana linia --be na szerokości pozycji z podpisem „BE”;
// (2) R:R, słowa użytkownika: «pokazuj rr na pozycjach ktore rysuje sam»: tylko pozycje rysowane (nie zablokowana pozycja trade'a),
//     tekst bez podkładki (preferencja: bez zaokrąglonych podkładek pod tekstem) przy linii wejścia, po stronie zysku.
export function positionExtras(drawing, s, g) {
  const st = drawing.style || {}, out = [];
  if (Number.isFinite(st.beLevel)) {
    const price = g.entry + g.dir * st.beLevel, y = s.y(price);
    out.push({ t: 'line', x1: g.x1, y1: y, x2: g.x2, y2: y, cls: 'drw-be', dash: 'dashed', role: 'be', price });
    out.push({ t: 'text', x: g.x2 - 4, y: y - 7, text: 'BE', cls: 'drw-be-l', anchor: 'end', role: 'be-label' });
  }
  // (3) P28 (28.10.2026), słowa użytkownika: «dopracuj i zrob te 3 pkt» (cena wyjścia przeciągana na wykresie): style.exitLevel = odległość
  //     wyjścia od wejścia w stronę zysku (ujemna po stronie straty). Jak w podglądzie z pól trade'a (levelsSvg): kropka wyjścia na prawej
  //     krawędzi pozycji (czas wyjścia) i przerywana ścieżka od wejścia; te same klasy CSS (lvl-d, lvl path), w edytorze to uchwyt do przeciągania.
  if (Number.isFinite(st.exitLevel)) {
    const price = g.entry + g.dir * st.exitLevel, y = s.y(price);
    out.push({ t: 'line', x1: g.x1, y1: g.yE, x2: g.x2, y2: y, cls: 'lvl path', role: 'exit-path' });
    out.push({ t: 'circle', x: g.x2, y, r: 3.5, cls: 'lvl-d exit', role: 'exit', price });
  }
  if (!drawing.locked && st.showRR !== false && g.stop > 0 && g.x2 - g.x1 >= 36) {
    const rr = Math.round((g.profit / g.stop) * 100) / 100;
    const up = g.yT < g.yE; // strona zysku nad wejściem
    out.push({ t: 'text', x: (g.x1 + g.x2) / 2, y: g.yE + (up ? -9 : 9), text: `R:R ${String(rr).replace('.', s.decimal || '.')}`, cls: 'drw-rr', anchor: 'middle', role: 'rr', rr });
  }
  return out;
}

// P32 (28.10.2026), słowa użytkownika: «rysunki powinny miec pole do kliknieca, gdzie maja ustawione pole tekstowe i jak sie je kliknie podwojnie to zaczynac pisac
// tam»: miejsce tekstu rysunku (linia pozioma, linia trendu, prostokąt, tekst) z tych samych reguł co rysowanie, także gdy tekstu jeszcze nie ma (wtedy w miejscu,
// w którym by się pojawił). Część tekstu jak w shapes(): { x, y (góra wiersza, 'hanging'), anchor, size, angle, ax, ay, empty }.
export const TEXT_KINDS = ['horizontal-line', 'trend-line', 'rectangle', 'text'];
export function textSlot(drawing, s) {
  if (!drawing || !TEXT_KINDS.includes(drawing.kind)) return null;
  const has = !!textOf(drawing), ph = ' ';
  const d = has ? drawing : { ...drawing, text: ph, style: { ...(drawing.style || {}), ...(drawing.kind === 'text' ? {} : { text: ph }) } };
  const p = shapes(d, s)?.parts.find((x) => x.t === 'text' && x.cls === 'drw-text');
  return p ? { x: p.x, y: p.y, anchor: p.anchor, size: p.size || 12, angle: p.angle || 0, ax: p.ax ?? p.x, ay: p.ay ?? p.y, text: has ? p.text : '', empty: !has } : null;
}
// Czy punkt (px pola wykresu) trafia w pole tekstu `slot` o szerokości tekstu w (px); pole puste ma co najmniej `minW` px. Obrót wokół (ax, ay) jak tekst.
export function hitTextSlot(slot, w, pt, minW = 48) {
  if (!slot) return false;
  const a = -(slot.angle || 0) * Math.PI / 180, dx = pt.x - slot.ax, dy = pt.y - slot.ay;
  const x = slot.ax + dx * Math.cos(a) - dy * Math.sin(a), y = slot.ay + dx * Math.sin(a) + dy * Math.cos(a);
  const ww = Math.max(w, minW), pad = slot.size / 4;
  const x0 = slot.anchor === 'start' ? slot.x : slot.anchor === 'end' ? slot.x - ww : slot.x - ww / 2;
  return x >= x0 - pad && x <= x0 + ww + pad && y >= slot.y - pad && y <= slot.y + slot.size + pad;
}

// Wszystkie rysunki: { items, skipped } (skipped = liczba rysunków nieobsługiwanych w podglądzie; widoczne tylko w trybie edycji).
export function drawingShapes(list, s) {
  const items = [];
  let skipped = 0;
  for (const d of Array.isArray(list) ? list : []) {
    if (d && d.visible === false) continue;
    const sh = shapes(d, s);
    if (sh) items.push(sh); else skipped++;
  }
  return { items, skipped };
}

// ---- świece ----
// style: { hollow: false } (P18: domyślnie wypełnione). Indeks świecy = (offset ?? 0) + pozycja w tablicy.
// Wynik: [{ i, x, up, wick: { x, y1, y2 }, body: { x, y, w, h }, hollow }]; korpus ma co najmniej 1 px wysokości.
// P55 (29.10.2026), słowa użytkownika: «Lekko przygaszone»: krycie świec z podziału 1m (flaga 1 na pozycji 6 świecy); ta sama wartość w podglądzie (CSS .synth) i na kartach.
export const SYNTH_ALPHA = 0.55;
export function candleShapes(candles, s, style = {}, offset = 0) {
  const sp = s.spacing ?? 6;
  const w = sp < 3 ? 1 : Math.max(1, Math.round(sp * 0.7) - (Math.round(sp * 0.7) % 2 === 0 ? 1 : 0)); // nieparzysta szerokość: knot na środku
  const out = [];
  for (let k = 0; k < (candles?.length ?? 0); k++) {
    const [, o, h, l, c] = candles[k];
    const i = offset + k, x = s.x(i);
    const up = c >= o;
    const yo = s.y(o), yc = s.y(c);
    const top = Math.min(yo, yc), bh = Math.max(1, Math.abs(yc - yo));
    out.push({ i, x, up, synth: candles[k][6] === 1, hollow: !!style.hollow, wick: { x, y1: s.y(h), y2: s.y(l) }, body: { x: x - w / 2, y: top, w, h: bh } }); // P55: synth = świeca z podziału 1m
  }
  return out;
}

// Etap 15: styl „Linia zamknięć”. points: [[t, close], …] (closePoints z styl-wykresu.js, jedna pozycja na świecę, luki zostają lukami); ta sama skala i ten sam X co w candleShapes.
// Wynik: [{ i, x, y }]; indeks = (offset ?? 0) + pozycja w tablicy.
export function lineShapes(points, s, offset = 0) {
  const out = [];
  for (let k = 0; k < (points?.length ?? 0); k++) out.push({ i: offset + k, x: s.x(offset + k), y: s.y(points[k][1]) });
  return out;
}

// P19: wygląd znaczników zależny od tła. Motyw (podgląd, edycja, miniatury) = sam tekst przy kresce i kropce; zdjęcie i film = białe pigułki z ząbkiem.
export function markerStyle(background) {
  return background === 'photo' || background === 'video' ? 'pill' : 'text';
}
