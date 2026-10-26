// Rysowanie kart „Udostępnij” w natywnym Canvas 2D (bez bibliotek). Dane z udostepnij-dane.js, kolory z tokenów motywu
// (getComputedStyle), więc karta dziedziczy motyw Onyx / Platinum i paletę danych (także dla daltonistów).
// Jedna siatka liczona z proporcji: formaty pionowe układają blok w jednej kolumnie, 16:9 w dwóch (wynik po lewej, rozbicie po prawej).
// English: native Canvas 2D renderer for the share cards.
import { t, getLang, locale } from './i18n.js';
import { signOf } from './udostepnij-dane.js';
import { fmtR, fmtMoney, num, sign, shortDate, dayMonth, MONTHS, MON_SHORT, DAYS_TITLE, fmtDur, parseKey, weekdayIdx, DASH } from './format.js';

export const FORMATS = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080], '16:9': [1920, 1080] };
export const APP_NAME = 'JustJournal';

// Fonty z index.html (Satoshi 400–900, Geist Mono). Canvas nie czeka na fonty sam, więc ładujemy każdą wagę przed rysowaniem.
export async function ensureFonts() {
  if (!document.fonts?.load) return;
  const loads = ['400', '500', '700', '900'].map((w) => document.fonts.load(`${w} 64px Satoshi`));
  loads.push(document.fonts.load('500 64px "Geist Mono"'));
  await Promise.allSettled(loads);
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
  // kafel znaku w podpisie: o stopień od tła karty (Onyx --float, Platinum --sunken)
  const tk = {
    theme, dark: theme === 'onyx',
    bg: theme === 'onyx' ? g('--chrome') : g('--float'),
    tile: theme === 'onyx' ? g('--float') : g('--sunken'), fg: g('--fg'), fg2: g('--fg-2'), line: g('--line'),
    profit: g('--profit'), loss: g('--loss'), be: g('--be'),
    glow: (parseFloat(g('--glow-a')) || 40) / 100,
    font: g('--font') || 'Satoshi, sans-serif', mono: g('--mono') || 'monospace',
  };
  tk.rgb = Object.fromEntries(['bg', 'tile', 'fg', 'fg2', 'profit', 'loss', 'be'].map((k) => [k, rgbOf(tk[k])]));
  return tk;
}

// ---------- formatowanie wartości ----------
export function fmtMetric(x, metric) {
  if (x == null || !isFinite(x)) return DASH;
  if (metric === 'R') return fmtR(x);
  if (metric === '$') return fmtMoney(x);
  // procent ze stałą liczbą miejsc (0,80% obok 0,85%, a nie 0,8%), żeby kolumna wartości się nie rozjeżdżała
  const a = Math.abs(x), d = a >= 10 ? 1 : 2;
  return `${sign(x)}${new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(a)}%`;
}
// Kolor wartości z marginesem BE jak w aplikacji (signOf: cfg.beR dla R, cfg.beUsd dla $); wynik w marginesie to remis (kolor tekstu).
// v = { R, $, % } zestawu, metric = jednostka wartości; outcome (karta trade'a) rozstrzyga o kolorze zamiast marginesu, bo uwzględnia „Wynik ręcznie”.
const byOutcome = (o, T) => (o === 'win' ? T.profit : o === 'loss' ? T.loss : T.fg);
const colorOf = (v, metric, T, outcome = null) => (v?.[metric] == null ? T.fg2 : byOutcome(outcome || signOf(v, metric), T));
const pick = (v, m) => v?.[m] ?? null;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const wdShort = (k) => cap(new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(...(({ y, m, d }) => [y, m - 1, d])(parseKey(k)))))).replace(/\.$/, '');
export const range = (a, b) => {
  const pa = parseKey(a), pb = parseKey(b);
  if (pa.m === pb.m) return getLang() === 'en' ? `${MON_SHORT[pa.m - 1]} ${pa.d}–${pb.d}` : `${pa.d}–${pb.d} ${MON_SHORT[pa.m - 1]}`;
  return `${shortDate(a)} – ${shortDate(b)}`;
};
const dirLabel = (d) => (d === 'Long' ? 'Long' : d === 'Short' ? 'Short' : d || '');

// ---------- model karty (co pokazać), niezależny od formatu ----------
// numberColor (słowa użytkownika 26.10.2026: kolor dużej liczby «do wyboru przez uzytkownika»): 'result' = kolor wyniku (zysk/strata),
// 'neutral' = kolor tekstu (--fg); kolor wyniku zostaje wtedy w małych liczbach.
function buildModel(kind, d, metric, T, numberColor = 'result') {
  const m = { label: [], title: '', hero: null, sub: '', stats: [], list: [], listKind: 'rows', empty: null };
  const hero = (v, outcome = null) => {
    const x = pick(v, metric);
    m.hero = { text: fmtMetric(x, metric), color: numberColor === 'neutral' && x != null ? T.fg : colorOf(v, metric, T, outcome), x };
    if (metric === '%' && x != null) m.sub = t('rozmiaru konta');
  };
  const wr = (x) => (x == null ? DASH : `${num(x, 0)}%`);
  if (kind === 'trade') {
    if (d.tag) m.label.push({ s: d.tag === 'Paper' ? t('Paper') : t('Backtest'), strong: true });
    m.label.push({ s: `${t('Trade')} · ${shortDate(d.date)} ${parseKey(d.date).y}` });
    m.title = [d.instrument, dirLabel(d.dir)].filter(Boolean).join(' ');
    hero(d.v, d.outcome);
    const rows = [];
    if (d.setup) rows.push({ label: t('Setup'), value: d.setup });
    if (d.session) rows.push({ label: t('Sesja'), value: d.session });
    if (d.time) rows.push({ label: t('Wejście'), value: d.time });
    if (d.exitTime) rows.push({ label: t('Wyjście'), value: d.exitTime });
    if (d.dur != null) rows.push({ label: t('Czas trwania'), value: fmtDur(d.dur) });
    for (const u of ['R', '$', '%']) {
      if (u === metric || d.v[u] == null) continue;
      rows.push({ label: u === 'R' ? t('Wynik w R') : u === '$' ? t('Wynik w $') : t('% konta'), value: fmtMetric(d.v[u], u), color: colorOf(d.v, u, T, d.outcome) });
    }
    m.list = rows;
    m.listKind = 'table';
    return m;
  }
  const labels = { day: t('Podsumowanie dnia'), week: t('Podsumowanie tygodnia'), month: t('Podsumowanie miesiąca'), year: t('Podsumowanie roku') };
  m.label.push({ s: labels[kind] });
  if (kind === 'day') m.title = `${DAYS_TITLE[weekdayIdx(d.date)]}, ${dayMonth(d.date)}`;
  if (kind === 'week') m.title = t('Tydzień od {date}', { date: shortDate(d.from) });
  if (kind === 'month') m.title = cap(`${MONTHS[d.m - 1]} ${d.y}`);
  if (kind === 'year') m.title = String(d.y);
  if (!d.n) { m.empty = t("Brak trade'ów Live w tym okresie"); return m; }
  hero(d.v);
  const none = { value: t("Bez trade'ów"), muted: true };
  m.stats.push({ label: t("Trade'y"), value: String(d.n) }, { label: t('Win rate'), value: wr(d.winRate) });
  if (kind === 'day') {
    m.stats.push({ label: t('Wygrane / straty'), value: `${d.wins} / ${d.losses}` });
    const b = d.best && pick(d.best.v, metric) != null ? d.best : null;
    m.stats.push({ label: t('Najlepszy trade'), value: b ? fmtMetric(pick(b.v, metric), metric) : DASH, suffix: b?.instrument || '' });
    const max = 6, over = d.trades.length > max ? d.trades.length - (max - 1) : 0;
    const shown = over ? d.trades.slice(0, max - 1) : d.trades;
    m.list = shown.map((x) => ({ label: [x.instrument, dirLabel(x.dir), x.time].filter(Boolean).join(' · '), value: fmtMetric(pick(x.v, metric), metric), color: colorOf(x.v, metric, T) }));
    if (over) m.list.push({ label: t.p("+{n} kolejnych", over), value: '', muted: true });
  }
  if (kind === 'week' || kind === 'month') {
    m.stats.push({ label: t('Zielone dni'), value: t('{a} z {b}', { a: d.greenDays, b: d.tradingDays }) });
    const b = d.bestDay;
    m.stats.push({ label: t('Najlepszy dzień'), value: b ? fmtMetric(pick(b.v, metric), metric) : DASH, suffix: b ? (kind === 'week' ? wdShort(b.date) : shortDate(b.date)) : '' });
  }
  if (kind === 'week') m.list = d.days.map((x) => (x.n ? { label: wdShort(x.date), value: fmtMetric(pick(x.v, metric), metric), color: colorOf(x.v, metric, T) } : { label: wdShort(x.date), ...none }));
  if (kind === 'month') m.list = d.weeks.map((w) => (w.n ? { label: range(w.from, w.to), value: fmtMetric(pick(w.v, metric), metric), color: colorOf(w.v, metric, T) } : { label: range(w.from, w.to), ...none }));
  if (kind === 'year') {
    m.stats.push({ label: t('Zielone miesiące'), value: t('{a} z {b}', { a: d.greenMonths, b: d.tradingMonths }) });
    const b = d.bestMonth;
    m.stats.push({ label: t('Najlepszy miesiąc'), value: b ? fmtMetric(pick(b.v, metric), metric) : DASH, suffix: b ? cap(MON_SHORT[b.m - 1]) : '' });
    m.list = d.months.map((x) => ({ label: cap(MON_SHORT[x.m - 1]), value: x.n ? fmtMetric(pick(x.v, metric), metric) : DASH, color: x.n ? colorOf(x.v, metric, T) : T.fg2, muted: !x.n }));
  }
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
// Etykieta jak .lbl w aplikacji: wersaliki, rozstrzelenie .13em, waga 500, kolor drugorzędny; fragment „strong” (Backtest/Paper) w kolorze tekstu.
function drawLabel(ctx, T, segs, x, y, px, maxW) {
  setFont(ctx, T, 500, px, px * 0.13);
  let cx = x;
  segs.forEach((sg, i) => {
    const s = (i ? ' · ' : '') + sg.s.toLocaleUpperCase(locale());
    setFont(ctx, T, sg.strong ? 700 : 500, px, px * 0.13);
    ctx.fillStyle = sg.strong ? T.fg : T.fg2;
    const room = x + maxW - cx;
    const out = fit(ctx, s, room);
    fillT(ctx, out, cx, y);
    cx += ctx.measureText(out).width;
  });
}

// ---------- tło ----------
function drawCover(ctx, img, W, H) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.max(W / iw, H / ih);
  const w = iw * s, h = ih * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}
// Zdjęcie. Decyzje użytkownika z 26.10.2026:
// - «Mniej, jaśniejszy szary tekst (Recommended)»: zdjęcie ma być wyraźnie widoczne, a drugorzędny szary na zdjęciu jaśniejszy.
// - «nie przejmuj sie tym, usun te plamy, zadaniem uzytkownika jest dobranie dobrego zdjecia zeby widac bylo napisy»:
//   żadnego miejscowego przyciemnienia ani rozjaśnienia pod napisami (rozmyte plamy) i żadnego dobierania jego siły z pomiaru pikseli.
// Zostaje jedna jednolita zasłona w kolorze tła motywu, krycie SCRIM (0,60), na całym zdjęciu. Czytelność napisów zależy od zdjęcia
// wybranego przez użytkownika.
// Drugorzędny szary rozjaśniony (Onyx) / przyciemniony (Platinum): PHOTO_FG2_MIX w stronę --fg. To odstępstwo od tokenów
// obowiązuje tylko na kartach ze zdjęciem (decyzja użytkownika 26.10.2026, runda poprawek fazy A).
const SCRIM = 0.6, PHOTO_FG2_MIX = 0.45;
function photoTokens(T) {
  const [f, g] = [T.rgb.fg, T.rgb.fg2];
  const mix = g.map((c, i) => Math.round(c + (f[i] - c) * PHOTO_FG2_MIX));
  return { ...T, fg2: `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`, rgb: { ...T.rgb, fg2: mix } };
}
// Rysowanie tła. Zwraca { scrim, T } (T = tokeny użyte na karcie).
export function paintBackground(ctx, W, H, T, photo) {
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);
  if (!photo) return { scrim: null, T };
  drawCover(ctx, photo, W, H);
  ctx.fillStyle = rgba(T.rgb.bg, SCRIM);
  ctx.fillRect(0, 0, W, H);
  return { scrim: SCRIM, T: photoTokens(T) };
}

const fillT = (ctx, s, x, y) => ctx.fillText(s, x, y);

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
  const s = 44 * u, px = 28 * u;
  drawLogo(ctx, T, x, base - s * 0.78, s);
  let cx = x + s + 16 * u;
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

// ---------- liczba-bohater (jak .hero-val: Satoshi 900, -0.035em, dwie warstwy poświaty w kolorze liczby) ----------
function heroSize(ctx, T, s, maxPx, maxW) {
  let px = maxPx;
  setFont(ctx, T, 900, px, -0.035 * px);
  const w = ctx.measureText(s).width;
  if (w > maxW) px = Math.floor(px * maxW / w);
  return px;
}
// Poświata jako sam cień tekstu przesuniętego poza płótno (dwie warstwy jak dwa text-shadow w .hero-val).
const OFF = 20000;
function shadowOnly(ctx, s, x, y, color, blur, oy = 0) {
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetX = OFF; ctx.shadowOffsetY = oy;
  ctx.fillStyle = '#000';
  ctx.fillText(s, x - OFF, y);
  ctx.restore();
}
function drawHero(ctx, T, hero, x, base, px) {
  setFont(ctx, T, 900, px, -0.035 * px);
  const rgb = rgbOf(hero.color);
  const k = px / 60; // .hero-val ma 60 px; poświata skalowana tak samo jak liczba
  shadowOnly(ctx, hero.text, x, base, rgba(rgb, T.glow), 20 * k);
  shadowOnly(ctx, hero.text, x, base, rgba(rgb, T.glow * 0.6), 40 * k, 16 * k);
  ctx.fillStyle = hero.color;
  ctx.fillText(hero.text, x, base);
}

// ---------- bloki ----------
// Wysokości w jednostce k (= skala formatu × dopasowanie). Wszystkie bloki liczone z tych samych stałych.
const G = { lbl: 26, title: 48, heroMax: 236, heroCap: 0.74, sub: 26, statLbl: 22, statVal: 42, statRow: 80, statGap: 34, rowPx: 32, row: 66, gapHero: 64, gapList: 60 };
const statsH = (n, k) => (n ? Math.ceil(n / 2) * G.statRow * k + (Math.ceil(n / 2) - 1) * G.statGap * k : 0);
const listH = (n, cols, k, mul = 1) => (n ? Math.ceil(n / cols) * G.row * k * mul : 0);

function drawStats(ctx, T, stats, x, top, w, k) {
  const cw = w / 2;
  stats.forEach((st, i) => {
    const cx = x + (i % 2) * cw, ry = top + Math.floor(i / 2) * (G.statRow + G.statGap) * k;
    setFont(ctx, T, 500, G.statLbl * k, G.statLbl * k * 0.13);
    ctx.fillStyle = T.fg2;
    fillT(ctx, fit(ctx, st.label.toLocaleUpperCase(locale()), cw - 24 * k), cx, ry + G.statLbl * k * 0.8);
    setFont(ctx, T, 700, G.statVal * k, -0.01 * G.statVal * k);
    ctx.fillStyle = st.color || T.fg;
    const vb = ry + G.statRow * k - 6 * k;
    const v = fit(ctx, st.value, cw - 24 * k);
    fillT(ctx, v, cx, vb);
    if (st.suffix) {
      const vx = cx + ctx.measureText(v).width + 12 * k;
      setFont(ctx, T, 500, G.statVal * k * 0.62, 0);
      ctx.fillStyle = T.fg2;
      fillT(ctx, fit(ctx, st.suffix, cx + cw - 24 * k - vx), vx, vb);
    }
  });
}
function drawList(ctx, T, rows, x, top, w, cols, k, mul = 1) {
  const gap = cols > 1 ? 56 * k : 0;
  const cw = (w - gap * (cols - 1)) / cols;
  const per = Math.ceil(rows.length / cols);
  rows.forEach((r, i) => {
    const c = Math.floor(i / per), ri = i % per;
    const cx = x + c * (cw + gap), base = top + ri * G.row * k * mul + G.row * k * (mul / 2 + 0.12);
    setFont(ctx, T, 700, G.rowPx * k, 0);
    const vw = r.value ? ctx.measureText(r.value).width : 0;
    setFont(ctx, T, 500, G.rowPx * k, 0);
    ctx.fillStyle = T.fg2;
    fillT(ctx, fit(ctx, r.label, cw - vw - 24 * k), cx, base);
    if (!r.value) return;
    setFont(ctx, T, r.muted ? 500 : 700, G.rowPx * k, 0);
    ctx.fillStyle = r.muted ? T.fg2 : r.color || T.fg;
    ctx.textAlign = 'right';
    fillT(ctx, r.value, cx + cw, base);
    ctx.textAlign = 'left';
  });
}

// Lewy blok (liczba, podpis jednostki, statystyki): wysokość i rysowanie przy danej skali k.
// Odstępy liczone od zmierzonych krawędzi glifów liczby (actualBoundingBoxAscent/Descent), więc przecinek albo dolna kreska dolara
// nie zbliża się do podpisu „rozmiaru konta” ani do statystyk.
function leftBlock(ctx, T, m, w, k) {
  if (m.empty) return { h: G.title * k * 1.4, draw: (x, top) => { setFont(ctx, T, 500, G.title * k * 0.8, 0); ctx.fillStyle = T.fg2; fillT(ctx, fit(ctx, m.empty, w), x, top + G.title * k); } };
  const px = heroSize(ctx, T, m.hero.text, G.heroMax * k, w);
  setFont(ctx, T, 900, px, -0.035 * px);
  const mt = ctx.measureText(m.hero.text);
  const asc = mt.actualBoundingBoxAscent, desc = Math.max(0, mt.actualBoundingBoxDescent);
  const below = desc + 28 * k; // dolna krawędź glifów + odstęp
  const subH = m.sub ? below + G.sub * k * 0.8 : 0; // linia bazowa podpisu jednostki od linii bazowej liczby
  const stTop = m.sub ? subH + G.sub * k * 0.25 + G.gapHero * k * 0.75 : Math.max(G.gapHero * k, below + 24 * k);
  const stH = statsH(m.stats.length, k);
  const h = asc + (stH ? stTop + stH : m.sub ? subH + G.sub * k * 0.25 : desc);
  return {
    h, px,
    draw: (x, top) => {
      const base = top + asc;
      drawHero(ctx, T, m.hero, x - px * 0.04, base, px);
      if (m.sub) { setFont(ctx, T, 500, G.sub * k, 0); ctx.fillStyle = T.fg2; fillT(ctx, m.sub, x, base + subH); }
      if (stH) drawStats(ctx, T, m.stats, x, base + stTop, w, k);
    },
  };
}

// ---------- karta ----------
// opts: { kind: 'trade'|'day'|'week'|'month'|'year', format, metric: 'R'|'$'|'%', numberColor: 'result'|'neutral', data, photo?, nick?, tokens? }
// Zwraca { width, height, scrim, scale, tokens } (scrim = krycie zasłony na zdjęciu albo null; tokens = kolory użyte na karcie).
export function renderCard(canvas, opts) {
  const { kind, format = '9:16', metric = 'R', numberColor = 'result', data, photo = null, nick = '' } = opts;
  const [W, H] = FORMATS[format] || FORMATS['9:16'];
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const bg = paintBackground(ctx, W, H, opts.tokens || readTokens(), photo);
  const scale = drawLayout(ctx, bg.T, buildModel(kind, data, metric, bg.T, numberColor), W, H, nick);
  return { width: W, height: H, scrim: bg.scrim, scale, tokens: bg.T };
}

// Układ karty (nagłówek, podpis, środek). Zwraca skalę środka.
function drawLayout(ctx, T, m, W, H, nick) {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const wide = W > H;
  const u = Math.min(W, H) / 1080;
  const px = Math.round((wide ? 112 : 88) * u), pt = Math.round(96 * u), pb = Math.round(88 * u);

  // nagłówek: etykieta i tytuł
  const lblBase = pt + G.lbl * u * 0.8;
  const titleBase = lblBase + 22 * u + G.title * u * 0.82;
  const headW = wide ? W * 0.5 - px : W - 2 * px;
  drawLabel(ctx, T, m.label, px, lblBase, G.lbl * u, headW);
  setFont(ctx, T, 700, G.title * u, -0.01 * G.title * u);
  ctx.fillStyle = T.fg;
  fillT(ctx, fit(ctx, m.title, headW), px, titleBase);

  // podpis
  const sigBase = H - pb;
  drawSignature(ctx, T, nick, px, sigBase, u, W - 2 * px);

  // obszar środka między nagłówkiem a podpisem
  const top = titleBase + 88 * u, bottom = sigBase - 44 * u - 72 * u;
  const avail = bottom - top;
  const rows = m.empty ? [] : m.list;
  let scale = 1;

  if (wide) {
    const lw = W * 0.5 - px, rx = W * 0.6, rw = W - px - rx;
    const cols = rows.length > 7 ? 2 : 1;
    let lb = leftBlock(ctx, T, m, lw, u), lh = listH(rows.length, cols, u);
    const need = Math.max(lb.h, lh);
    if (need > avail) { scale = avail / need; lb = leftBlock(ctx, T, m, lw, u * scale); lh = listH(rows.length, cols, u * scale); }
    lb.draw(px, top + (avail - lb.h) * 0.45);
    if (rows.length) drawList(ctx, T, rows, rx, top + (avail - lh) * 0.45, rw, cols, u * scale);
    return scale;
  }

  // formaty pionowe: jedna kolumna; lista w 2 kolumnach, gdy w jednej nie mieści się w pełnej skali (albo ma 12 miesięcy)
  const w = W - 2 * px;
  const measure = (cols, k, mul = 1, gap = 1) => {
    const lb = leftBlock(ctx, T, m, w, k);
    const lh = listH(rows.length, cols, k, mul);
    return { lb, lh, gap: G.gapList * k * gap, h: lb.h + (lh ? G.gapList * k * gap + lh : 0) };
  };
  let cols = rows.length > 8 ? 2 : 1;
  let r = measure(cols, u);
  if (r.h > avail && cols === 1 && rows.length > 3 && m.listKind !== 'table') { cols = 2; r = measure(cols, u); }
  // za mało miejsca: zmniejszamy; dużo miejsca (9:16): powiększamy najwyżej o 30% (liczba i tak jest ograniczona szerokością)
  scale = Math.min(1.3, avail / r.h);
  if (scale !== 1) r = measure(cols, u * scale);
  // reszta wolnego miejsca (karta trade'a 9:16 miała ok. 400 px pustki nad podpisem): do 60% idzie w wysokość wierszy listy
  // i odstęp nad nią (wiersze najwyżej 1,6×, odstęp najwyżej 2×), pozostałe miejsce rozkłada się równo nad i pod blokiem
  const extra = avail - r.h;
  if (extra > 40 * u && rows.length) {
    const rowsN = Math.ceil(rows.length / cols);
    const mul = Math.min(1.6, 1 + (extra * 0.45) / (rowsN * G.row * u * scale));
    const gap = Math.min(2, 1 + (extra * 0.15) / (G.gapList * u * scale));
    r = measure(cols, u * scale, mul, gap);
    r.mul = mul;
  }
  const y0 = top + (avail - r.h) * 0.5;
  r.lb.draw(px, y0);
  if (rows.length) drawList(ctx, T, rows, px, y0 + r.lb.h + r.gap, w, cols, u * scale, r.mul || 1);
  return scale;
}

// Nazwa pliku do pobrania, np. justjournal-tydzien-2026-10-19-9x16.png
export function fileName(kind, data, format) {
  const k = { trade: 'trade', day: 'dzien', week: 'tydzien', month: 'miesiac', year: 'rok' }[kind] || kind;
  const when = data.from || data.date || '';
  return `justjournal-${k}-${when}-${String(format).replace(':', 'x')}.png`;
}
