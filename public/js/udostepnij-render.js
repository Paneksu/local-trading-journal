// Rysowanie kart „Udostępnij” w natywnym Canvas 2D (bez bibliotek). Dane z udostepnij-dane.js, kolory z tokenów motywu
// (getComputedStyle), więc karta dziedziczy motyw Onyx / Platinum i paletę danych (także dla daltonistów).
// Karty v2 „clean look” (P43-P48, P52, 29.10.2026). Słowa użytkownika (P43): «popraw design i film, skupiajac sie na tym zeby zmniejszyc ilosc danych i skupic sie
// na wiekszej jakosci wygladu wykresu jak i jego filmiku, ma na pewno byc wyzszy w 9:16 i dodaj filmik 1:1 … zostaw tylko najwazniejsze dane … usun poswiate wyniku».
// Układ z inspiracji (4 karty LiquidJournal): nagłówek (symbol duży + kierunek i data drobnymi wersalikami), bardzo duża liczba, kilka wierszy etykieta / wartość
// (etykiety przygaszone), wykres jako cienka linia albo świece bez osi, podpis w stopce. Bez poświaty wyniku i bez podkładki pod liczbą («Bez podkładki»).
// Formaty: 9:16 i 4:5 (pion: liczba, wiersze, wykres w dolnej połowie), 1:1 (liczba, pasek wierszy, wykres na całą szerokość), 16:9 (lewa kolumna, wykres po prawej).
// English: native Canvas 2D renderer for the share cards (v2 clean look).
import { t, getLang, locale } from './i18n.js';
import { signOf } from './udostepnij-dane.js';
import { fmtR, num, sign, shortDate, dayMonth, MONTHS, MON_SHORT, DAYS_TITLE, fmtDur, parseKey, weekdayIdx, DASH } from './format.js';
import * as Geo from './geometria.js'; // te same kształty świec i linii co podgląd SVG (podglad.js), bez nowego renderera
import { closePoints, TRADE_ROWS_DEFAULT, PERIOD_ROWS_DEFAULT, CARD_ROWS_MAX } from './styl-wykresu.js';

export const FORMATS = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080], '16:9': [1920, 1080] };
export const APP_NAME = 'JustJournal';

// Fonty z index.html (Satoshi 400–900, Geist Mono). Canvas nie czeka na fonty sam, więc ładujemy każdą wagę przed rysowaniem.
// Zwraca true, gdy wszystkie wagi używane na karcie (400, 500, 700, 900) są wczytane; false = rysunek byłby krojem zastępczym (np. arkusz Fontshare jeszcze się
// nie zastosował). Wywołujący nie zapamiętuje wyniku false (okno Udostępnij pyta ponownie przed kolejnym rysunkiem i przed nagraniem filmu).
export const CARD_WEIGHTS = ['400', '500', '700', '900'];
export async function ensureFonts() {
  if (!document.fonts?.load) return true;
  await document.fonts.ready?.catch?.(() => {});
  const loads = CARD_WEIGHTS.map((w) => document.fonts.load(`${w} 64px Satoshi`));
  loads.push(document.fonts.load('500 64px "Geist Mono"'));
  await Promise.allSettled(loads);
  return CARD_WEIGHTS.every((w) => { try { return document.fonts.check(`${w} 64px Satoshi`) && [...document.fonts].some((f) => /satoshi/i.test(f.family) && String(f.weight) === w && f.status === 'loaded'); } catch { return false; } });
}

// ---------- kolory ----------
const probe = (() => { let c; return () => (c ||= (() => { const el = document.createElement('canvas'); el.width = el.height = 1; return el.getContext('2d', { willReadFrequently: true }); })()); })();
function rgbOf(color) {
  const x = probe();
  x.clearRect(0, 0, 1, 1);
  x.fillStyle = '#000';
  x.fillStyle = color;
  x.fillRect(0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}
const rgba = (rgb, a) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;

// Tokeny bieżącego motywu. Tło karty: Onyx = --chrome (najbliżej czarnego tła inspiracji), Platinum = --float (najjaśniejsza powierzchnia).
export function readTokens(el = document.documentElement) {
  const cs = getComputedStyle(el);
  const g = (n) => cs.getPropertyValue(n).trim();
  const theme = el.getAttribute('data-theme') === 'platinum' ? 'platinum' : 'onyx';
  const tk = {
    theme, dark: theme === 'onyx',
    bg: theme === 'onyx' ? g('--chrome') : g('--float'),
    tile: theme === 'onyx' ? g('--float') : g('--sunken'), fg: g('--fg'), fg2: g('--fg-2'), line: g('--line'),
    profit: g('--profit'), loss: g('--loss'), be: g('--be'),
    // kolory świec jak w podglądzie (--chart-up/--chart-down z własnych kolorów, inaczej zysk/strata), linia ceny --chart-line (jasna w Onyx, ciemna w Platinum)
    chartUp: g('--chart-up') || g('--profit'), chartDown: g('--chart-down') || g('--loss'), chartLine: g('--chart-line') || g('--fg'), onFg: g('--on-fg'),
    font: g('--font') || 'Satoshi, sans-serif', mono: g('--mono') || 'monospace',
  };
  tk.rgb = Object.fromEntries(['bg', 'tile', 'fg', 'fg2', 'profit', 'loss', 'be', 'chartLine'].map((k) => [k, rgbOf(tk[k])]));
  return tk;
}

// ---------- formatowanie wartości ----------
const fixed = (x, d) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' }).format(x);
// Kwota na karcie: pełne dolary bez groszy, inaczej zawsze dwa miejsca (+712,50 $, nie +712,5 $; decyzja mechaniczna v2, jak „+$1,040.00” na inspiracji)
function cardMoney(x) {
  const a = Math.abs(x), whole = Math.abs(a - Math.round(a)) < 0.005;
  const txt = fixed(whole ? Math.round(a) : a, whole ? 0 : 2);
  return sign(x) + (getLang() === 'en' ? '$' + txt : txt + ' $');
}
// Cena: co najmniej 2 miejsca (kontrakty co 0,25: 4 522,00), więcej tylko gdy cena je ma (EURUSD 1,08425), najwyżej 5.
export function fmtPrice(x) {
  if (!Number.isFinite(x)) return null;
  const s = String(Math.abs(x)), d = s.includes('.') ? Math.min(5, s.split('.')[1].length) : 0;
  return fixed(x, Math.max(2, d));
}
export function fmtMetric(x, metric) {
  if (x == null || !isFinite(x)) return DASH;
  if (metric === 'R') return fmtR(x);
  if (metric === '$') return cardMoney(x);
  // procent ze stałą liczbą miejsc (0,80% obok 0,85%, a nie 0,8%)
  const a = Math.abs(x), d = a >= 10 ? 1 : 2;
  return `${sign(x)}${new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(a)}%`;
}
// Kolor wartości z marginesem BE jak w aplikacji (signOf); outcome (karta trade'a) rozstrzyga o kolorze zamiast marginesu, bo uwzględnia „Wynik ręcznie”.
const byOutcome = (o, T) => (o === 'win' ? T.profit : o === 'loss' ? T.loss : T.fg);
const colorOf = (v, metric, T, outcome = null) => (v?.[metric] == null ? T.fg2 : byOutcome(outcome || signOf(v, metric), T));
const pick = (v, m) => v?.[m] ?? null;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const range = (a, b) => {
  const pa = parseKey(a), pb = parseKey(b);
  if (pa.m === pb.m) return getLang() === 'en' ? `${MON_SHORT[pa.m - 1]} ${pa.d}–${pb.d}` : `${pa.d}–${pb.d} ${MON_SHORT[pa.m - 1]}`;
  return `${shortDate(a)} – ${shortDate(b)}`;
};
const dirLabel = (d) => (d === 'Long' ? 'Long' : d === 'Short' ? 'Short' : d || '');
const UNIT_LABEL = { R: 'Wynik w R', $: 'Wynik w $', '%': '% konta' };
// Druga jednostka wyniku (P44: «druga jednostka w wierszach»): R, gdy duża liczba jest w $ albo %; przy dużej liczbie w R: $, a bez $ %.
export function altUnit(v, metric) {
  const order = metric === 'R' ? ['$', '%'] : ['R', metric === '$' ? '%' : '$'];
  return order.find((u) => v?.[u] != null) || null;
}

// ---------- katalog wierszy danych (P52) ----------
// Etykiety wierszy (klucze tłumaczeń). Kolejność katalogu = kolejność na karcie. Pusta wartość = wiersz znika (nie „–”).
export const ROW_LABELS = {
  entry: 'Cena wejścia', exit: 'Cena wyjścia', alt: 'Druga jednostka', R: 'Wynik w R', $: 'Wynik w $', '%': '% konta', sl: 'Stop Loss', tp: 'Take Profit',
  time: 'Godzina wejścia', exitTime: 'Godzina wyjścia', dur: 'Czas trwania', setup: 'Setup', session: 'Sesja', contract: 'Kontrakt',
  n: "Trade'y", wr: 'Win rate', best: 'Najlepszy trade', worst: 'Najgorszy trade', avgR: 'Średni R', pf: 'Profit factor', wl: 'Wygrane / straty',
  green: 'Zielone dni', bestDay: 'Najlepszy dzień',
};
const price = fmtPrice;
function tradeRow(id, d, metric, T) {
  const res = (u) => (u && u !== metric && d.v[u] != null ? { label: t(UNIT_LABEL[u]), value: fmtMetric(d.v[u], u), color: colorOf(d.v, u, T, d.outcome), unit: u } : null);
  const plain = (label, value) => (value == null || value === '' ? null : { label: t(label), value: String(value) });
  switch (id) {
    case 'entry': return plain('Cena wejścia', price(d.entryPrice));
    case 'exit': return plain('Cena wyjścia', price(d.exitPrice));
    case 'alt': return res(altUnit(d.v, metric));
    case 'R': case '$': case '%': return res(id);
    case 'sl': return plain('Stop Loss', price(d.sl));
    case 'tp': return plain('Take Profit', price(d.tp));
    case 'time': return plain('Godzina wejścia', d.time);
    case 'exitTime': return plain('Godzina wyjścia', d.exitTime);
    case 'dur': return plain('Czas trwania', d.dur != null ? fmtDur(d.dur) : null);
    case 'setup': return plain('Setup', d.setup);
    case 'session': return plain('Sesja', d.session);
    case 'contract': return plain('Kontrakt', d.contract);
    default: return null;
  }
}
function periodRow(id, kind, d, metric, T) {
  const tv = (d.tv || []).filter((x) => pick(x.v, metric) != null);
  const extreme = (dir) => tv.reduce((b, x) => (b == null || dir * pick(x.v, metric) > dir * pick(b.v, metric) ? x : b), null);
  const one = (x, label) => (x ? { label: t(label), value: fmtMetric(pick(x.v, metric), metric), color: colorOf(x.v, metric, T), suffix: x.instrument || '' } : null);
  switch (id) {
    case 'n': return { label: t("Trade'y"), value: String(d.n) };
    case 'wr': return d.winRate == null ? null : { label: t('Win rate'), value: `${num(d.winRate, 0)}%` };
    case 'best': return one(extreme(1), 'Najlepszy trade');
    case 'worst': return tv.length > 1 ? one(extreme(-1), 'Najgorszy trade') : null;
    case 'alt': { const u = altUnit(d.v, metric); return u ? { label: t(UNIT_LABEL[u]), value: fmtMetric(d.v[u], u), color: colorOf(d.v, u, T), unit: u } : null; }
    case 'avgR': { const rs = (d.tv || []).map((x) => x.v.R).filter((x) => x != null); return rs.length ? { label: t('Średni R'), value: fmtR(rs.reduce((a, b) => a + b, 0) / rs.length) } : null; }
    case 'pf': {
      const u = (d.tv || []).some((x) => x.v.$ != null) ? '$' : 'R';
      let gw = 0, gl = 0;
      for (const x of d.tv || []) { const v = x.v[u]; if (v > 0) gw += v; else if (v < 0) gl -= v; }
      return gl > 0 ? { label: t('Profit factor'), value: fixed(gw / gl, 2) } : null; // bez straty PF nie ma skończonej wartości: wiersz znika
    }
    case 'wl': return { label: t('Wygrane / straty'), value: `${d.wins} / ${d.losses}` };
    case 'green':
      if (kind === 'week' || kind === 'month') return d.tradingDays ? { label: t('Zielone dni'), value: t('{a} z {b}', { a: d.greenDays, b: d.tradingDays }) } : null;
      if (kind === 'year') return d.tradingMonths ? { label: t('Zielone miesiące'), value: t('{a} z {b}', { a: d.greenMonths, b: d.tradingMonths }) } : null;
      return null;
    case 'bestDay':
      if ((kind === 'week' || kind === 'month') && d.bestDay) return { label: t('Najlepszy dzień'), value: fmtMetric(pick(d.bestDay.v, metric), metric), color: colorOf(d.bestDay.v, metric, T), suffix: shortDate(d.bestDay.date) };
      if (kind === 'year' && d.bestMonth) return { label: t('Najlepszy miesiąc'), value: fmtMetric(pick(d.bestMonth.v, metric), metric), color: colorOf(d.bestMonth.v, metric, T), suffix: cap(MON_SHORT[d.bestMonth.m - 1]) };
      return null;
    default: return null;
  }
}

// ---------- model karty (co pokazać), niezależny od formatu ----------
// numberColor (słowa użytkownika 26.10.2026: kolor dużej liczby «do wyboru przez uzytkownika»): 'result' = kolor wyniku, 'neutral' = kolor tekstu (--fg).
// opts.rows: identyfikatory wierszy z katalogu (P52; settings.chart.rowsTrade / rowsPeriod), domyślnie zestaw z P43 / P47. Wiersz w jednostce dużej liczby
// nie pojawia się (duża liczba nie powtarza się w wierszach), druga jednostka 'alt' nie dubluje wiersza R / $ / % wybranego osobno.
export function cardModel(kind, d, metric, T, numberColor = 'result', opts = {}) {
  const m = { kind, label: [], title: '', hero: null, rows: [], empty: null, metric };
  const hero = (v, outcome = null) => {
    const x = pick(v, metric);
    m.hero = { text: fmtMetric(x, metric), color: numberColor === 'neutral' && x != null ? T.fg : colorOf(v, metric, T, outcome), x };
  };
  const ids = (Array.isArray(opts.rows) ? opts.rows : kind === 'trade' ? TRADE_ROWS_DEFAULT : PERIOD_ROWS_DEFAULT).slice(0, CARD_ROWS_MAX);
  const push = (r) => { if (r && !(r.unit && m.rows.some((q) => q.unit === r.unit))) m.rows.push(r); };
  if (kind === 'trade') {
    if (d.tag) m.label.push({ s: d.tag === 'Paper' ? t('Paper') : t('Backtest'), strong: true });
    if (d.dir) m.label.push({ s: dirLabel(d.dir) });
    m.label.push({ s: `${shortDate(d.date)} ${parseKey(d.date).y}` });
    m.title = d.instrument || t('Trade');
    hero(d.v, d.outcome);
    // wybrane osobno R / $ / % mają pierwszeństwo przed 'alt' w tej samej jednostce
    const explicit = ids.filter((id) => id === 'R' || id === '$' || id === '%');
    for (const id of ids) {
      const r = tradeRow(id, d, metric, T);
      if (id === 'alt' && r && explicit.includes(r.unit)) continue;
      push(r);
    }
    return m;
  }
  const labels = { day: t('Podsumowanie dnia'), week: t('Podsumowanie tygodnia'), month: t('Podsumowanie miesiąca'), year: t('Podsumowanie roku') };
  m.label.push({ s: labels[kind] });
  if (kind === 'day') m.title = `${DAYS_TITLE[weekdayIdx(d.date)]}, ${dayMonth(d.date)}`;
  if (kind === 'week') m.title = `${range(d.from, d.to)} ${parseKey(d.to).y}`;
  if (kind === 'month') m.title = cap(`${MONTHS[d.m - 1]} ${d.y}`);
  if (kind === 'year') m.title = String(d.y);
  if (!d.n) { m.empty = t("Brak trade'ów Live w tym okresie"); return m; }
  hero(d.v);
  for (const id of ids) push(periodRow(id, kind, d, metric, T));
  return m;
}

// ---------- tekst ----------
function setFont(ctx, T, w, px, ls = 0, mono = false) {
  ctx.font = `${w} ${px}px ${mono ? T.mono : T.font}`;
  ctx.letterSpacing = `${ls}px`;
}
function fit(ctx, s, maxW) {
  if (ctx.measureText(s).width <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(s.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1; }
  return s.slice(0, lo).trimEnd() + '…';
}
const fillT = (ctx, s, x, y) => ctx.fillText(s, x, y);
// Etykieta jak .lbl w aplikacji: wersaliki, rozstrzelenie .14em, waga 500, kolor drugorzędny; fragment „strong” (Backtest/Paper) w kolorze tekstu.
function labelText(segs) { return segs.map((sg) => sg.s.toLocaleUpperCase(locale())).join(' · '); }
function labelWidth(ctx, T, segs, px) { setFont(ctx, T, 500, px, px * 0.14); return ctx.measureText(labelText(segs)).width; }
function drawLabel(ctx, T, segs, x, y, px, maxW) {
  let cx = x;
  segs.forEach((sg, i) => {
    const s = (i ? ' · ' : '') + sg.s.toLocaleUpperCase(locale());
    setFont(ctx, T, sg.strong ? 700 : 500, px, px * 0.14);
    ctx.fillStyle = sg.strong ? T.fg : T.fg2;
    const out = fit(ctx, s, x + maxW - cx);
    fillT(ctx, out, cx, y);
    cx += ctx.measureText(out).width;
  });
}

// ---------- film: oś czasu animacji (pakiet J, etap 18; v2 ta sama kompozycja co PNG) ----------
// Jedna funkcja rysująca dla PNG i filmu: renderCard(canvas, { …, at }), at = czas w sekundach od początku animacji; brak at albo at = ∞ = PNG.
// 0,3-0,7 s nagłówek (przezroczystość + przesunięcie), 1,0-3,0 s wykres od lewej i licznik wyniku 0 → wartość, 2,6-3,4 s wiersze kolejno,
// 3,0-3,4 s pozycja i znaczniki, potem wszystko stoi; podpis od początku. Łagodzenie easeOutCubic.
export const FILM_TL = { headerAt: 0.3, headerDur: 0.4, shift: 24, heroAt: 1.0, heroDur: 0.25, chartAt: 1.0, chartDur: 2.0, axesDur: 0.3,
  rowsAt: 2.6, rowsTo: 3.4, rowStep: 0.08, rowDur: 0.32, rowShift: 24, marksAt: 3.0, marksDur: 0.4 };
const easeOutCubic = (p) => 1 - (1 - p) ** 3;
const prog = (at, from, dur) => (at >= from + dur ? 1 : at <= from ? 0 : easeOutCubic((at - from) / dur));
const rowStepOf = (n) => (n > 1 ? Math.min(FILM_TL.rowStep, (FILM_TL.rowsTo - FILM_TL.rowDur - FILM_TL.rowsAt) / (n - 1)) : FILM_TL.rowStep);
export function filmEnd(n = 0) {
  const rowsEnd = n ? FILM_TL.rowsAt + (n - 1) * rowStepOf(n) + FILM_TL.rowDur : 0;
  return Math.max(FILM_TL.marksAt + FILM_TL.marksDur, FILM_TL.chartAt + FILM_TL.chartDur, rowsEnd);
}
export function filmAnim(at, { rows = 0 } = {}) {
  if (!(at < Infinity)) return { at: Infinity, sig: 1, header: 1, hero: 1, chart: 1, axes: 1, counter: 1, marks: 1, rows: Array(rows).fill(1), settled: true };
  const T = FILM_TL, step = rowStepOf(rows);
  return {
    at, sig: 1,
    header: prog(at, T.headerAt, T.headerDur),
    hero: prog(at, T.heroAt, T.heroDur),
    chart: prog(at, T.chartAt, T.chartDur),
    axes: prog(at, T.chartAt, T.axesDur),
    counter: prog(at, T.chartAt, T.chartDur),
    marks: prog(at, T.marksAt, T.marksDur),
    rows: Array.from({ length: rows }, (_, i) => prog(at, T.rowsAt + i * step, T.rowDur)),
    settled: at >= filmEnd(rows),
  };
}
export function counterAt(x, at) {
  if (x == null || !Number.isFinite(x)) return x;
  const e = filmAnim(at).counter;
  if (e >= 1) return x;
  const v = x * e;
  return v === 0 ? 0 : v; // bez -0 (start licznika straty)
}
function layer(ctx, a, dy, fn) {
  if (a == null || (a >= 1 && !dy)) { fn(); return; }
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  if (dy) ctx.translate(0, dy);
  fn();
  ctx.restore();
}
const shiftOf = (a, k) => (a == null ? 0 : (1 - a) * FILM_TL.rowShift * k);

// ---------- tło ----------
function drawCover(ctx, img, W, H) {
  const iw = img.videoWidth || img.naturalWidth || img.width, ih = img.videoHeight || img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(W / iw, H / ih);
  const w = iw * s, h = ih * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}
// Zdjęcie. Decyzje użytkownika z 26.10.2026: «Mniej, jaśniejszy szary tekst (Recommended)»; «nie przejmuj sie tym, usun te plamy, zadaniem uzytkownika jest
// dobranie dobrego zdjecia zeby widac bylo napisy»: jedna jednolita zasłona w kolorze tła motywu (SCRIM 0,60) na całym zdjęciu, bez miejscowych plam.
// Drugorzędny szary na zdjęciu przesunięty w stronę --fg (PHOTO_FG2_MIX), tylko na kartach ze zdjęciem.
const SCRIM = 0.6, PHOTO_FG2_MIX = 0.45;
function photoTokens(T) {
  const [f, g] = [T.rgb.fg, T.rgb.fg2];
  const mix = g.map((c, i) => Math.round(c + (f[i] - c) * PHOTO_FG2_MIX));
  return { ...T, fg2: `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`, rgb: { ...T.rgb, fg2: mix } };
}
// fx (tylko filmy): { dim, bw } = krycie zasłony z suwaka przyciemnienia i czarno-białe tło; karta PNG ze zdjęciem zostaje przy SCRIM 0,6 bez filtra.
export function paintBackground(ctx, W, H, T, photo, fx = null) {
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);
  if (!photo) return { scrim: null, T };
  const dim = fx && Number.isFinite(fx.dim) && fx.dim >= 0 && fx.dim <= 1 ? fx.dim : SCRIM;
  if (fx?.bw) { ctx.save(); ctx.filter = 'grayscale(1)'; drawCover(ctx, photo, W, H); ctx.restore(); } else drawCover(ctx, photo, W, H);
  ctx.fillStyle = rgba(T.rgb.bg, dim);
  ctx.fillRect(0, 0, W, H);
  return { scrim: dim, T: photoTokens(T) };
}

// ---------- logo i podpis ----------
function drawLogo(ctx, T, x, y, s) { // znak z index.html (32×32), lewy górny róg w (x, y), bok s
  const k = s / 32;
  ctx.save();
  ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = T.tile;
  ctx.beginPath(); ctx.roundRect(0, 0, 32, 32, 8); ctx.fill();
  ctx.strokeStyle = T.fg; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(5, 22); ctx.lineTo(11, 15); ctx.lineTo(16, 19); ctx.lineTo(23, 9); ctx.lineTo(27, 12); ctx.stroke();
  ctx.restore();
}
function drawSignature(ctx, T, nick, x, base, u, maxW) {
  const s = 40 * u, px = 26 * u;
  drawLogo(ctx, T, x, base - s * 0.76, s);
  let cx = x + s + 14 * u;
  setFont(ctx, T, 700, px, 0);
  ctx.fillStyle = T.fg;
  fillT(ctx, APP_NAME, cx, base);
  cx += ctx.measureText(APP_NAME).width;
  const n = String(nick || '').trim();
  if (!n) return;
  setFont(ctx, T, 500, px, 0);
  ctx.fillStyle = T.fg2;
  fillT(ctx, ' × ', cx, base);
  cx += ctx.measureText(' × ').width;
  ctx.fillStyle = T.fg;
  fillT(ctx, fit(ctx, n, x + maxW - cx), cx, base);
}

// ---------- liczba-bohater (Satoshi 900, -0.04em; v2 bez poświaty i bez podkładki, P43) ----------
function heroSize(ctx, T, s, maxPx, maxW) {
  let px = maxPx;
  setFont(ctx, T, 900, px, -0.04 * px);
  const w = ctx.measureText(s).width;
  if (w > maxW) px = Math.floor(px * maxW / w);
  return px;
}
function heroMetrics(ctx, T, text, px) {
  setFont(ctx, T, 900, px, -0.04 * px);
  const mt = ctx.measureText(text);
  return { asc: mt.actualBoundingBoxAscent, desc: Math.max(0, mt.actualBoundingBoxDescent), w: mt.width };
}

// ---------- wiersze danych ----------
// Lista: etykieta (przygaszona) i wartość w drugiej kolumnie, wyrównane do lewej jak na inspiracji. Pasek (1:1): kolumny „etykieta nad wartością”.
const ROW = { px: 31, h: 58, gapCol: 44, suffix: 0.8, stripLbl: 21, stripVal: 34, stripH: 92 };
function rowValueWidth(ctx, T, r, px) {
  setFont(ctx, T, 700, px, 0);
  let w = ctx.measureText(r.value).width;
  if (r.suffix) { setFont(ctx, T, 500, px * ROW.suffix, 0); w += 10 + ctx.measureText(r.suffix).width; }
  return w;
}
function listLayout(ctx, T, rows, k) {
  const px = ROW.px * k;
  setFont(ctx, T, 500, px, 0);
  const lw = rows.length ? Math.max(...rows.map((r) => ctx.measureText(r.label).width)) : 0;
  const vw = rows.length ? Math.max(...rows.map((r) => rowValueWidth(ctx, T, r, px))) : 0;
  return { px, lw, vw, w: lw + ROW.gapCol * k + vw, h: rows.length * ROW.h * k };
}
function drawList(ctx, T, rows, x, top, k, maxW, an = null) {
  const L = listLayout(ctx, T, rows, k);
  const vx = x + Math.min(L.lw + ROW.gapCol * k, maxW * 0.55);
  rows.forEach((r, i) => {
    const a = an ? an.rows[i] : null;
    layer(ctx, a, shiftOf(a, k), () => {
      const base = top + i * ROW.h * k + ROW.h * k * 0.62;
      setFont(ctx, T, 500, L.px, 0);
      ctx.fillStyle = T.fg2;
      fillT(ctx, fit(ctx, r.label, vx - x - 16 * k), x, base);
      setFont(ctx, T, 700, L.px, 0);
      ctx.fillStyle = r.color || T.fg;
      const v = fit(ctx, r.value, x + maxW - vx);
      fillT(ctx, v, vx, base);
      if (r.suffix) {
        const sx = vx + ctx.measureText(v).width + 10 * k;
        setFont(ctx, T, 500, L.px * ROW.suffix, 0);
        ctx.fillStyle = T.fg2;
        fillT(ctx, fit(ctx, r.suffix, x + maxW - sx), sx, base);
      }
    });
  });
  return L.h;
}
function drawStrip(ctx, T, rows, x, top, w, k, an = null) {
  if (!rows.length) return 0;
  const n = rows.length, gap = 28 * k, cols = Math.max(n, 3), cw = (w - gap * (cols - 1)) / cols; // stała szerokość kolumny (2 wiersze nie rozjeżdżają się na całą kartę)
  rows.forEach((r, i) => {
    const a = an ? an.rows[i] : null;
    layer(ctx, a, shiftOf(a, k), () => {
      const cx = x + i * (cw + gap);
      setFont(ctx, T, 500, ROW.stripLbl * k, ROW.stripLbl * k * 0.14);
      ctx.fillStyle = T.fg2;
      fillT(ctx, fit(ctx, r.label.toLocaleUpperCase(locale()), cw), cx, top + ROW.stripLbl * k * 0.9);
      setFont(ctx, T, 700, ROW.stripVal * k, 0);
      ctx.fillStyle = r.color || T.fg;
      const v = fit(ctx, r.value, cw);
      fillT(ctx, v, cx, top + ROW.stripH * k - 10 * k);
      if (r.suffix) {
        const sx = cx + ctx.measureText(v).width + 8 * k;
        setFont(ctx, T, 500, ROW.stripVal * k * 0.62, 0);
        ctx.fillStyle = T.fg2;
        if (sx < cx + cw - 20 * k) fillT(ctx, fit(ctx, r.suffix, cx + cw - sx), sx, top + ROW.stripH * k - 10 * k);
      }
    });
  });
  return ROW.stripH * k;
}

// ---------- krzywa kapitału (etap 16; v2 P47: cienka linia bez wypełnienia) ----------
// Model krzywej w jednej jednostce; null, gdy jednostka nie ma wartości.
export function curveModel(curve, metric) {
  if (!Array.isArray(curve) || curve.length < 2) return null;
  const values = curve.map((p) => p?.v?.[metric] ?? null);
  if (values.some((v) => v == null || !Number.isFinite(v))) return null;
  const end = values[values.length - 1];
  let peak = -Infinity, min = Infinity;
  for (const v of values) { if (v > peak) peak = v; if (v < min) min = v; }
  return { values, end, peak, min, max: peak, from: curve[0].date, to: curve[curve.length - 1].date, sign: signOf(curve[curve.length - 1].v, metric) };
}
// Linia w kolorze linii ceny (jak „Linia biała” wykresu), cienka przerywana linia zera, kropka końca w kolorze wyniku, daty początku i końca drobno pod spodem.
function drawCurve(ctx, T, cm, box, k, an = null) {
  const lblPx = 21 * k;
  const x0 = box.x, x1 = box.x + box.w - 10 * k, y0 = box.y + 12 * k, y1 = box.y + box.h - lblPx * 2.2;
  const lo = Math.min(cm.min, 0), hi = Math.max(cm.max, 0), span = hi - lo || 1, pad = span * 0.08;
  const y = (v) => y1 - ((v - (lo - pad)) / (span + 2 * pad)) * (y1 - y0);
  const n = cm.values.length, x = (i) => x0 + ((x1 - x0) * i) / (n - 1);
  const color = byOutcome(cm.sign, T);
  const rv = an ? an.chart : 1;
  layer(ctx, an?.axes, 0, () => {
    ctx.save();
    ctx.strokeStyle = rgba(T.rgb.fg, 0.22); ctx.lineWidth = Math.max(1, 1.5 * k); ctx.setLineDash([6 * k, 8 * k]);
    ctx.beginPath(); ctx.moveTo(x0, y(0)); ctx.lineTo(x1, y(0)); ctx.stroke();
    ctx.restore();
  });
  if (rv > 0) {
    ctx.save();
    if (rv < 1) { ctx.beginPath(); ctx.rect(x0 - 8 * k, box.y, (x1 - x0) * rv + 8 * k, box.h); ctx.clip(); }
    ctx.strokeStyle = T.chartLine; ctx.lineWidth = Math.max(1.5, 3 * k); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    cm.values.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.stroke();
    ctx.restore();
  }
  layer(ctx, an?.marks, 0, () => {
    ctx.fillStyle = T.bg; ctx.beginPath(); ctx.arc(x(n - 1), y(cm.end), 11 * k, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x(n - 1), y(cm.end), 7.5 * k, 0, Math.PI * 2); ctx.fill();
  });
  layer(ctx, an?.axes, 0, () => {
    setFont(ctx, T, 500, lblPx, lblPx * 0.14);
    ctx.fillStyle = T.fg2;
    const dy = box.y + box.h - lblPx * 0.3;
    fillT(ctx, shortDate(cm.from).toLocaleUpperCase(locale()), x0, dy);
    if (cm.to !== cm.from) { ctx.textAlign = 'right'; fillT(ctx, shortDate(cm.to).toLocaleUpperCase(locale()), x1, dy); ctx.textAlign = 'left'; }
  });
}

// ---------- wykres ceny w karcie trade'a (etap 17; v2 P43, P45, P46) ----------
// Bez osi i bez siatki (clean look jak inspiracje). Skala ceny ciasna: zakres świec kadru + wejście i wyjście (w trybie „Pozycja” także SL/TP), marginesy 7%.
// chart: { bars, tf, style: 'candles'|'line', draw: 'position'|'marks' }; d: dane karty trade'a; box: { x, y, w, h }; k: skala.
// null: brak świec albo trade poza świecami (karta wtedy bez wykresu).
const G_CHART = { pill: 22, padMarks: 66, padPos: 18, dot: 8 };
const LEVEL_CAP = 0.6; // decyzja gustu v2: strefa SL/TP poszerza skalę najwyżej o 60% zakresu ceny wokół trade'a
export function priceChart(chart, d, box, k = 1) {
  const bars = chart?.bars;
  const n = bars?.length || 0;
  if (!n || d?.at == null) return null;
  const step = Geo.medianStep(bars);
  const entry = Math.floor(d.at / 1000), exit = d.exitAt != null ? Math.floor(d.exitAt / 1000) : null;
  if (entry > bars[n - 1][0] + step || (exit ?? entry) < bars[0][0]) return null;
  const draw = chart.draw === 'marks' ? 'marks' : 'position';
  const pad = (draw === 'marks' ? G_CHART.padMarks : G_CHART.padPos) * k;
  const plot = { left: box.x, right: box.x + box.w, top: box.y + pad, bottom: box.y + box.h - pad };
  const pw = plot.right - plot.left, ph = plot.bottom - plot.top;
  if (!(pw > 20 && ph > 20)) return null;
  const xs = Geo.indexScale({ lastIndex: n - 0.5, right: plot.right, spacing: pw / n });
  const lv = { sl: draw === 'position' && Number.isFinite(d.sl), tp: draw === 'position' && Number.isFinite(d.tp) };
  const kind = chart.style === 'line' ? 'line' : 'candles';
  // Skala ceny (P43: «jak jest rozplaszczony to nic nie widac»): zakres z rdzenia kadru (pozycja + 70% kontekstu po obu stronach), wejścia i wyjścia;
  // świece dalej od trade'a mogą wyjść poza pole (przycięte, jak przybliżenie w TradingView), żeby gwałtowny ruch przed trade'em nie spłaszczył samej pozycji.
  // SL i TP (tryb „Pozycja”) poszerzają zakres najwyżej o LEVEL_CAP rdzenia z każdej strony; dalsza część strefy dochodzi do krawędzi pola.
  const t0 = bars[0][0], t1 = bars[n - 1][0] + step, te = exit ?? entry;
  const c0 = entry - (entry - t0) * 0.7, c1 = te + (t1 - te) * 0.7;
  let lo = Infinity, hi = -Infinity;
  for (const c of bars) {
    if (c[0] + step < c0 || c[0] > c1) continue;
    const a = kind === 'line' ? c[4] : c[3], b = kind === 'line' ? c[4] : c[2];
    if (a < lo) lo = a; if (b > hi) hi = b;
  }
  for (const v of [d.entryPrice, d.exitPrice]) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!Number.isFinite(lo)) for (const c of bars) { lo = Math.min(lo, c[3]); hi = Math.max(hi, c[2]); }
  const core = Math.max(hi - lo, 1e-9);
  for (const v of [lv.sl ? d.sl : null, lv.tp ? d.tp : null]) if (Number.isFinite(v)) { lo = Math.min(lo, Math.max(v, lo - core * LEVEL_CAP)); hi = Math.max(hi, Math.min(v, hi + core * LEVEL_CAP)); }
  const ys = Geo.priceScale({ min: lo, max: hi, top: plot.top, height: ph, margins: { top: 0.07, bottom: 0.07 } });
  const s = Geo.chartScales({ candles: bars, xs, ys, box: plot, pip: 0.25, step });
  const series = kind === 'line' ? Geo.lineShapes(closePoints(bars), s) : Geo.candleShapes(bars, s, {}, 0);
  // świeca wejścia i wyjścia: indeks ułamkowy (pozycja w obrębie świecy), żeby krótki trade na świecach 1m nie skleił się w jedną kreskę
  const fx = (sec) => Math.max(0, Math.min(n - 1, Geo.timeToIndexF(bars, sec, step) ?? 0));
  const iEntry = fx(entry), iExit = exit != null && exit >= entry ? fx(exit) : null;
  return { s, series, kind, draw, plot, box, iEntry, iExit, lv, bars };
}
function pillRect(ctx, T, text, cx, y, k, below) {
  const px = G_CHART.pill * k, padX = 16 * k, h = px * 1.85, tooth = 9 * k, gap = 12 * k;
  setFont(ctx, T, 700, px, px * 0.04);
  const w = ctx.measureText(text).width + padX * 2;
  return { x: cx - w / 2, y: below ? y + gap + tooth : y - gap - tooth - h, w, h, padX, tooth };
}
// Pigułka z ogonkiem (P45: „Wejście/wyjście” jak na inspiracjach): odwrócona powierzchnia (--fg) z tekstem --on-fg w obu motywach.
// cx = środek pigułki (przesunięty do pola wykresu), tx = ogonek przy kropce.
function drawPill(ctx, T, text, cx, tx, y, k, below) {
  const r = pillRect(ctx, T, text, cx, y, k, below), { w, h, padX, tooth } = r, bx = r.x, by = r.y;
  const x = Math.max(bx + h / 2, Math.min(bx + w - h / 2, tx));
  ctx.fillStyle = T.fg;
  ctx.beginPath(); ctx.roundRect(bx, by, w, h, h / 2); ctx.fill();
  ctx.beginPath();
  if (below) { ctx.moveTo(x - tooth, by + 1); ctx.lineTo(x, by - tooth); ctx.lineTo(x + tooth, by + 1); }
  else { ctx.moveTo(x - tooth, by + h - 1); ctx.lineTo(x, by + h + tooth); ctx.lineTo(x + tooth, by + h - 1); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = T.onFg;
  ctx.textBaseline = 'middle';
  fillT(ctx, text, bx + padX, by + h / 2 + 1 * k);
  ctx.textBaseline = 'alphabetic';
  return { x: bx, w };
}
// an (pakiet J): stan animacji filmu albo null (PNG). Seria odsłaniana od lewej, strefy pozycji i znaczniki w 3,0-3,4 s.
function drawPriceChart(ctx, T, pc, d, k, an = null) {
  const { s, plot } = pc;
  const rv = an ? an.chart : 1, mk = an ? an.marks : null;
  const X = (i) => s.x(i);
  const x1 = X(pc.iEntry), x2 = pc.iExit != null ? X(pc.iExit) : null;
  const ep = d.entryPrice, xp = d.exitPrice;
  const win = (d.v?.R ?? d.v?.$ ?? (Number.isFinite(xp) && Number.isFinite(ep) ? (xp - ep) * (d.dir === 'Short' ? -1 : 1) : 0));
  const resCol = d.outcome === 'win' || (d.outcome == null && win > 0) ? T.profit : d.outcome === 'loss' || (d.outcome == null && win < 0) ? T.loss : T.fg;
  ctx.save();
  ctx.beginPath(); ctx.rect(pc.box.x - 2 * k, pc.box.y, pc.box.w + 4 * k, pc.box.h); ctx.clip();
  // P45 „Pozycja”: strefy jak narzędzie pozycji TradingView, od wejścia do wyjścia w czasie (otwarty trade: do prawej krawędzi)
  if (pc.draw === 'position' && Number.isFinite(ep)) layer(ctx, mk, 0, () => {
    const xa = x1, xb = Math.max(x1 + 6 * k, x2 ?? plot.right);
    const zone = (a, b, col, alpha) => { const ya = s.y(a), yb = s.y(b); ctx.fillStyle = rgba(rgbOf(col), alpha); ctx.fillRect(xa, Math.min(ya, yb), xb - xa, Math.max(1.5 * k, Math.abs(yb - ya))); };
    if (pc.lv.tp) zone(ep, d.tp, T.profit, 0.2);
    if (pc.lv.sl) zone(ep, d.sl, T.loss, 0.2);
    if (!pc.lv.tp && !pc.lv.sl && Number.isFinite(xp)) zone(ep, xp, resCol, 0.22);
    // wyraźna linia wejścia przez całą strefę
    ctx.strokeStyle = T.fg; ctx.lineWidth = Math.max(1.5, 2.5 * k);
    ctx.beginPath(); ctx.moveTo(xa, s.y(ep)); ctx.lineTo(xb, s.y(ep)); ctx.stroke();
  });
  // seria: świece albo cienka jasna linia ceny (P46)
  if (rv > 0) {
    ctx.save();
    if (rv < 1) { ctx.beginPath(); ctx.rect(plot.left, pc.box.y, (plot.right - plot.left) * rv, pc.box.h); ctx.clip(); }
    if (pc.kind === 'line') {
      ctx.strokeStyle = T.chartLine; ctx.lineWidth = Math.max(1.5, 2.6 * k); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); pc.series.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    } else {
      ctx.lineWidth = Math.max(1, Math.round(1.6 * k));
      for (const c of pc.series) {
        const col = c.up ? T.chartUp : T.chartDown;
        ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(c.x, c.wick.y1); ctx.lineTo(c.x, c.wick.y2); ctx.stroke();
        ctx.fillStyle = col; ctx.fillRect(c.body.x, c.body.y, c.body.w, Math.max(1, c.body.h));
      }
    }
    ctx.restore();
  }
  layer(ctx, mk, 0, () => {
    const dot = (x, y, col) => {
      ctx.fillStyle = T.bg; ctx.beginPath(); ctx.arc(x, y, (G_CHART.dot + 4) * k, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, G_CHART.dot * k, 0, Math.PI * 2); ctx.fill();
    };
    if (pc.draw === 'position') {
      // ścieżka wejście → wyjście (przerywana) i punkt wyjścia w kolorze wyniku; wejście = koniec linii wejścia
      if (Number.isFinite(ep) && Number.isFinite(xp) && x2 != null) {
        ctx.strokeStyle = rgba(T.rgb.fg, 0.7); ctx.lineWidth = Math.max(1, 2 * k); ctx.setLineDash([5 * k, 6 * k]);
        ctx.beginPath(); ctx.moveTo(x1, s.y(ep)); ctx.lineTo(x2, s.y(xp)); ctx.stroke(); ctx.setLineDash([]);
        dot(x1, s.y(ep), T.fg);
        dot(x2, s.y(xp), resCol);
      } else if (Number.isFinite(ep)) dot(x1, s.y(ep), T.fg);
      return;
    }
    // P45 „Wejście/wyjście”: kropki i pigułki; pigułka wejścia po stronie, z której cena przyszła, wyjścia po drugiej (jak inspiracja: Entry pod, Exit nad)
    // Strona pigułki: domyślna jak wyżej, odwrotna, gdy domyślna zasłania więcej punktów linii ceny, wychodzi poza pole albo nachodzi na pierwszą pigułkę.
    const up = Number.isFinite(xp) && Number.isFinite(ep) ? xp >= ep : true;
    const placed = [];
    const place = (text, x, y, below) => {
      const opt = (b) => {
        const r = pillRect(ctx, T, text, clampX(x, plot, k), y, k, b);
        let cost = 0;
        for (const p of pc.kind === 'line' ? pc.series : pc.series.map((c) => ({ x: c.x, y: (c.wick.y1 + c.wick.y2) / 2 }))) if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y - 4 * k && p.y <= r.y + r.h + 4 * k) cost++;
        if (r.y < pc.box.y || r.y + r.h > pc.box.y + pc.box.h) cost += 1000;
        if (placed.some((q) => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h)) cost += 500;
        return { b, r, cost };
      };
      const a = opt(below), c = opt(!below);
      const pick = c.cost < a.cost ? c : a;
      placed.push(pick.r);
      drawPill(ctx, T, text, clampX(x, plot, k), x, y, k, pick.b);
    };
    if (Number.isFinite(ep)) dot(x1, s.y(ep), T.fg);
    if (x2 != null && Number.isFinite(xp)) dot(x2, s.y(xp), T.fg);
    if (Number.isFinite(ep)) place(t('Wejście'), x1, s.y(ep), up);
    if (x2 != null && Number.isFinite(xp)) place(t('Wyjście'), x2, s.y(xp), !up);
  });
  ctx.restore();
}
// środek pigułki tak, żeby cała zmieściła się w polu wykresu (ogonek zostaje przy kropce, bo pigułka jest szeroka najwyżej ok. 150 px)
const clampX = (x, plot, k) => Math.max(plot.left + 70 * k, Math.min(plot.right - 70 * k, x));

// ---------- karta ----------
// opts: { kind, format, metric: 'R'|'$'|'%', numberColor, data, photo?, nick?, tokens?, rows? (P52), equity? (krzywa kart okresu),
//         chart? ({ bars, tf, style: 'candles'|'line', draw: 'position'|'marks' } karty trade'a; brak albo bez świec = karta bez wykresu) }
// Pakiet J (filmy): at (s od startu animacji; brak albo ∞ = PNG), film (tło z fx: dim, bw), bg: 'video', scale (720p), keep, cache (warstwa statyczna nagrania).
// Zwraca { width, height, scrim, scale, tokens, curve, chart, rows, settled }.
// Błąd z filmu v2 (29.10.2026), słowa użytkownika: «czcionka jest rozna w roznych momentach filmu». Przyczyna (zmierzona measureText w aplikacji): kanwa w DOM
// dziedziczy z CSS ustawienia kroju, których ctx.font nie nadpisuje (body ma font-variant-numeric: tabular-nums), a OffscreenCanvas warstwy statycznej filmu
// i kanwa poza DOM ich nie mają, więc cyfry i szerokości zmieniały się między klatkami animacji a klatkami po jej końcu (i między PNG w oknie a serią testową).
// Kanwa karty dostaje neutralne ustawienia kroju jako styl inline: wynik nie zależy od miejsca kanwy w dokumencie (cyfry proporcjonalne, jak w OffscreenCanvas).
export const CANVAS_FONT_RESET = 'font-variant: normal; font-feature-settings: normal; font-variation-settings: normal; font-kerning: auto; font-stretch: normal; font-optical-sizing: auto; letter-spacing: normal; word-spacing: normal; text-rendering: auto';
function isolateFont(canvas) {
  if (!canvas?.style || canvas.dataset?.fontReset === '1') return;
  canvas.style.cssText += `;${CANVAS_FONT_RESET}`;
  canvas.dataset.fontReset = '1';
}
export function renderCard(canvas, opts) {
  isolateFont(canvas);
  const { kind, format = '9:16', metric = 'R', numberColor = 'result', data, photo = null, nick = '' } = opts;
  const [W, H] = FORMATS[format] || FORMATS['9:16'];
  const sc = opts.scale > 0 && opts.scale !== 1 ? opts.scale : 1;
  const cw = Math.round(W * sc), ch = Math.round(H * sc);
  const reuse = !!opts.keep && canvas.width === cw && canvas.height === ch;
  if (!reuse) { canvas.width = cw; canvas.height = ch; }
  const ctx = canvas.getContext('2d');
  if (reuse) resetCtx(ctx);
  if (sc !== 1) ctx.setTransform(sc, 0, 0, sc, 0, 0);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const film = !!opts.film;
  const bgKind = photo && opts.bg === 'video' ? 'video' : 'photo';
  const bg = paintBackground(ctx, W, H, opts.tokens || readTokens(), photo, film ? { dim: opts.dim, bw: !!opts.bw } : null);
  const cm = kind !== 'trade' && opts.equity && data?.n ? curveModel(data.curve, metric) : null;
  const chart = kind === 'trade' && opts.chart && priceChart(opts.chart, data, { x: 0, y: 0, w: 1000, h: 600 }) ? opts.chart : null;
  const extra = cm ? { curve: cm } : chart ? { chart, data } : null;
  const model = cardModel(kind, data, metric, bg.T, numberColor, { rows: opts.rows });
  const an = opts.at != null && opts.at < Infinity ? filmAnim(opts.at, { rows: model.empty ? 0 : model.rows.length }) : null;
  const info = { width: W, height: H, scrim: bg.scrim, scale: 1, tokens: bg.T, curve: !!cm, chart: !!chart, rows: model.rows.map((r) => r.label), settled: !an || an.settled };
  const cache = film && opts.cache && typeof opts.cache === 'object' ? opts.cache : null;
  if (cache && info.settled) {
    const key = [data, kind, format, metric, numberColor, nick, sc, bgKind, !!photo, bg.T.theme, !!cm, !!chart, chart?.style, chart?.draw, String(opts.rows)].map(String).join('|');
    if (!cache.fg || cache.key !== key || cache.src !== data) {
      const fg = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(cw, ch) : Object.assign(document.createElement('canvas'), { width: cw, height: ch });
      const fx = fg.getContext('2d');
      if (sc !== 1) fx.setTransform(sc, 0, 0, sc, 0, 0);
      cache.scale = drawLayout(fx, bg.T, model, W, H, nick, extra, null);
      cache.fg = fg; cache.key = key; cache.src = data;
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cache.fg, 0, 0); ctx.restore();
    info.scale = cache.scale;
    return info;
  }
  info.scale = drawLayout(ctx, bg.T, model, W, H, nick, extra, an);
  return info;
}
function resetCtx(ctx) {
  if (typeof ctx.reset === 'function') { ctx.reset(); return; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over'; ctx.setLineDash([]);
  ctx.shadowColor = 'rgba(0, 0, 0, 0)'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
}

// Układ karty v2. Zwraca skalę bloku liczby i wierszy (1 = pełna wielkość).
// extra: { curve } (krzywa kapitału) albo { chart, data } (wykres ceny); bez extra liczba i wiersze stoją w środku obszaru.
function drawLayout(ctx, T, m, W, H, nick, xtra = null, an = null) {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const wide = W > H * 1.2, square = !wide && H < W * 1.1, u = Math.min(W, H) / 1080;
  const px = Math.round((wide ? 120 : square ? 80 : 88) * u), pt = Math.round((square ? 80 : 96) * u), pb = Math.round((square ? 76 : 88) * u);
  const colW = wide ? W * 0.42 - px : W - 2 * px;

  // nagłówek: duży tytuł (symbol albo okres) i drobne wersaliki obok; gdy się nie mieszczą, pod tytułem
  const titlePx = (wide ? 60 : square ? 54 : 62) * u, lblPx = (square ? 21 : 23) * u;
  setFont(ctx, T, 700, titlePx, -0.02 * titlePx);
  const tm = ctx.measureText(m.title);
  const titleW = Math.min(tm.width, colW), titleBase = pt + titlePx * 0.76;
  const beside = titleW + 26 * u + labelWidth(ctx, T, m.label, lblPx) <= (wide ? W * 0.62 - px : colW);
  const lblBase = beside ? titleBase - titlePx * 0.03 : titleBase + 18 * u + lblPx;
  layer(ctx, an?.header, an ? (1 - an.header) * FILM_TL.shift * u : 0, () => {
    setFont(ctx, T, 700, titlePx, -0.02 * titlePx);
    ctx.fillStyle = T.fg;
    fillT(ctx, fit(ctx, m.title, colW), px, titleBase);
    drawLabel(ctx, T, m.label, beside ? px + titleW + 26 * u : px, lblBase, lblPx, beside ? W - 2 * px - titleW : colW);
  });
  const headBottom = Math.max(titleBase, lblBase) + 10 * u;

  // podpis w stopce
  const sigBase = H - pb;
  drawSignature(ctx, T, nick, px, sigBase, u, W - 2 * px);
  const top = headBottom + (square ? 54 : 72) * u, bottom = sigBase - 40 * u - (square ? 50 : 66) * u;
  const avail = bottom - top;

  if (m.empty) {
    layer(ctx, an?.hero, 0, () => {
      setFont(ctx, T, 600, 40 * u, 0); ctx.fillStyle = T.fg2;
      fillT(ctx, fit(ctx, m.empty, colW), px, top + avail * 0.45);
    });
    return 1;
  }
  const heroMax = (wide ? 200 : square ? 152 : 212) * u; // 1:1: mniejsza liczba, wyższy wykres (P43)
  const block = (k, w) => {
    const hp = heroSize(ctx, T, m.hero.text, heroMax * k, w);
    const hm = heroMetrics(ctx, T, m.hero.text, hp);
    const rowsH = square ? (m.rows.length ? ROW.stripH * k : 0) : m.rows.length * ROW.h * k;
    const gap = m.rows.length ? (square ? 44 : 46) * k : 0;
    return { hp, hm, rowsH, gap, h: hm.asc + hm.desc + gap + rowsH };
  };
  const drawBlock = (b, x, y, k, w) => {
    const base = y + b.hm.asc;
    // licznik filmu w tym samym zapisie co wartość końcowa (pełne dolary zostają pełnymi), więc liczba nie jest szersza niż na końcu i nie wychodzi poza kartę
    const cv = an && an.counter < 1 && m.hero.x != null ? counterAt(m.hero.x, an.at) : null;
    const whole$ = m.metric === '$' && Math.abs(m.hero.x - Math.round(m.hero.x)) < 0.005;
    const hero = cv != null ? { ...m.hero, text: fmtMetric(whole$ ? Math.round(cv) : cv, m.metric) } : m.hero;
    layer(ctx, an?.hero, 0, () => {
      setFont(ctx, T, 900, b.hp, -0.04 * b.hp);
      const tw = ctx.measureText(hero.text).width;
      if (tw > w) setFont(ctx, T, 900, b.hp * w / tw, -0.04 * b.hp * w / tw); // np. „−0,00R” w klatce licznika szersze niż wartość końcowa
      ctx.fillStyle = hero.color;
      fillT(ctx, hero.text, x - b.hp * 0.035, base);
    });
    const ry = base + b.hm.desc + b.gap;
    if (square) drawStrip(ctx, T, m.rows, x, ry, w, k, an);
    else drawList(ctx, T, m.rows, x, ry - ROW.h * k * 0.18, k, w, an);
  };
  const has = !!(xtra?.chart || xtra?.curve);
  const drawChart = (box) => {
    if (xtra.curve) { drawCurve(ctx, T, xtra.curve, box, u, an); return; }
    const pc = priceChart(xtra.chart, xtra.data, box, u);
    if (pc) drawPriceChart(ctx, T, pc, xtra.data, u, an);
  };

  if (wide) {
    // lewa kolumna: liczba i wiersze w środku obszaru; prawa: wykres od 0,5 W do W − px, ok. 62% wysokości karty (inspiracja 2 i 4)
    let k = 1, b = block(1, colW);
    if (b.h > avail) { k = avail / b.h; b = block(k, colW); }
    drawBlock(b, px, top + (avail - b.h) * 0.5, k, colW);
    if (has) {
      const cx = W * 0.5, ch = Math.min(avail + 40 * u, H * 0.62);
      drawChart({ x: cx, y: top + (avail - ch) * 0.5, w: W - px - cx, h: ch });
    }
    return k;
  }
  // pion i kwadrat: liczba, wiersze, pod nimi wykres do stopki (9:16: około połowy wysokości karty)
  const w = W - 2 * px;
  let k = 1, b = block(1, w);
  if (!has) {
    if (b.h > avail) { k = avail / b.h; b = block(k, w); }
    drawBlock(b, px, top + (avail - b.h) * 0.42, k, w);
    return k;
  }
  const minChart = avail * (square ? 0.42 : 0.4);
  if (b.h > avail - minChart) { k = Math.max(0.6, (avail - minChart) / b.h); b = block(k, w); }
  drawBlock(b, px, top, k, w);
  const cy = top + b.h + (square ? 46 : 64) * u;
  drawChart({ x: px, y: cy, w, h: bottom - cy + 30 * u });
  return k;
}

// Nazwa pliku do pobrania, np. justjournal-tydzien-2026-10-19-9x16.png (pakiet J: ext = mp4 / webm dla filmu)
export function fileName(kind, data, format, ext = 'png') {
  const k = { trade: 'trade', day: 'dzien', week: 'tydzien', month: 'miesiac', year: 'rok' }[kind] || kind;
  const when = data.from || data.date || '';
  return `justjournal-${k}-${when}-${String(format).replace(':', 'x')}.${ext}`;
}
