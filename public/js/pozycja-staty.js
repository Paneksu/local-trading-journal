// Etap J (30.10.2026): statystyki rysunku pozycji long/short jak w TradingView i zlecenie z rysunku (replay). Czysty moduł (bez DOM), działa w Node.
// Słowa użytkownika: «ulepsz jeszcze rysunek pozycji long short tak zeby dzialalo i wygladalo jak na tradingview ale nie usuwujac naszych zadnych roznic
// ktore aktualnie sa tylko dodajemy to czego brakuje w ustawieniach tego rysunku i ogolnie».
// Paczka 0.6.2 ma własne pigułki statystyk, ale po angielsku, z kwotami bez mnożnika kontraktu (1 jednostka = 1 $ za punkt) i z kolorami osi na sztywno,
// więc paczka dostaje dalej NO_STATS (rysunki.js), a podpisy liczy ten moduł, rysuje extrasPrimitive w wykres.js (kolory z tokenów).
// Ustawienia w style rysunku (pamięć stylu narzędzia przez STYLE_KEYS): statsOn { tpPrice, tpPct, tpTicks, tpAmount, pl, qty, rr, slPrice, slPct, slTicks, slAmount },
// compactStats, showStats (zawsze pokazuj), priceLabels (ceny na osi), accountSize, riskDisplayMode ('money'|'percents'), riskAmount, riskPercent.
// English: TradingView-like stats for long/short position drawings (texts, label boxes) and an order built from a selected position drawing.
import { t } from './i18n.js';
import { fmtMoney, num } from './format.js';
import { MULT, sizeFromRisk } from './bt-wypelnienia.js';

export const STAT_KEYS = ['tpPrice', 'tpPct', 'tpTicks', 'tpAmount', 'pl', 'qty', 'rr', 'slPrice', 'slPct', 'slTicks', 'slAmount'];
// [U] 30.10.2026 «Domyślnie włączone jak TV»: wszystkie podpisy włączone w nowych rysunkach (i w rysunkach bez zapisanego wyboru), każdy do wyłączenia w panelu
export const DEFAULT_STATS = Object.fromEntries(STAT_KEYS.map((k) => [k, true]));
export const statsOf = (st) => {
  const o = st && st.statsOn && typeof st.statsOn === 'object' ? st.statsOn : {};
  return Object.fromEntries(STAT_KEYS.map((k) => [k, typeof o[k] === 'boolean' ? o[k] : true]));
};
const isPos = (d) => d && (d.kind === 'long-position' || d.kind === 'short-position') && Number.isFinite(d.points?.[0]?.price);
const rt = (p, tick) => Number((Math.round(p / tick) * tick).toFixed(6));

// Ryzyko w USD z ustawień rysunku: kwota (riskAmount) albo % konta (accountSize × riskPercent / 100); NaN, gdy brak danych.
export function riskUsdOf(st) {
  if (!st) return NaN;
  if (st.riskDisplayMode === 'percents') {
    const a = Number(st.accountSize), p = Number(st.riskPercent);
    return a > 0 && p > 0 && p <= 100 ? (a * p) / 100 : NaN;
  }
  const v = Number(st.riskAmount);
  return v > 0 ? v : NaN;
}

// P&L przebiegu ceny w obrębie rysunku: wyjście z rysunku (exitLevel, nasza różnica) = zamknięta; inaczej jak TV: od pierwszej świecy, która dotknęła wejścia
// (od świecy punktu 0 do świecy przed prawą krawędzią), SL przed TP w tej samej świecy; bez trafienia = otwarta po zamknięciu ostatniej świecy zakresu.
// Wejście nie dotknięte = null. diff w punktach w stronę zysku (ujemny = strata). Świece [t, o, h, l, c] (w replayu tylko widoczne: brak przyszłości).
export function positionPL(d, candles = [], step = 60) {
  if (!isPos(d)) return null;
  const st = d.style || {}, entry = d.points[0].price, dir = d.kind === 'short-position' ? -1 : 1;
  if (Number.isFinite(st.exitLevel)) return { diff: st.exitLevel, closed: true };
  const p1 = d.points[1];
  if (!p1 || !Array.isArray(candles) || !candles.length) return null;
  const t0 = d.points[0].time, t1 = p1.time;
  const stop = Number(st.stopLevel) || 0, profit = Number(st.profitLevel) || 0;
  const sl = entry - dir * stop, tp = entry + dir * profit;
  let open = false, lastC = null;
  for (const k of candles) {
    if (k[0] + step <= t0) continue;
    if (k[0] >= t1) break;
    const [, , h, l, c] = k;
    if (!open) { if (h >= entry && l <= entry) open = true; else continue; }
    if (stop > 0 && (dir > 0 ? l <= sl : h >= sl)) return { diff: -stop, closed: true };
    if (profit > 0 && (dir > 0 ? h >= tp : l <= tp)) return { diff: profit, closed: true };
    lastC = c;
  }
  return open && lastC != null ? { diff: (lastC - entry) * dir, closed: false } : null;
}

// Liczby statystyk. qty i kwoty tylko, gdy rysunek ma ryzyko (konto/ryzyko w ustawieniach) i instrument ma mnożnik; pozycja z pól trade'a Live
// nie ma liczby kontraktów, więc bez ryzyka: qty = null i żadnych kwot ([U] 30.10.2026, decyzja 2: bez zmyślonej ilości).
export function positionStats(d, { instrument = '', tick = 0.25, candles = [], step = 60 } = {}) {
  if (!isPos(d)) return null;
  const st = d.style || {}, entry = d.points[0].price, dir = d.kind === 'short-position' ? -1 : 1;
  const span = Math.abs((d.points[1]?.price ?? entry) - entry) || tick * 100;
  const stop = Number.isFinite(st.stopLevel) ? st.stopLevel : span, profit = Number.isFinite(st.profitLevel) ? st.profitLevel : span;
  const inst = String(instrument || '').trim().toUpperCase(), mult = MULT[inst] || null;
  const risk = riskUsdOf(st);
  const qty = mult && Number.isFinite(risk) && stop > 0 ? sizeFromRisk({ riskUsd: risk, entry, sl: entry - dir * stop, instrument: inst }) : null;
  const usd = (pts) => (qty != null ? pts * mult * qty : null);
  const side = (off) => ({ offset: off, pct: entry ? (off / entry) * 100 : 0, ticks: Math.round(off / tick) });
  const pl = positionPL(d, candles, step);
  return {
    entry, dir, mult, qty, risk: Number.isFinite(risk) ? risk : null,
    tp: { ...side(profit), price: rt(entry + dir * profit, tick), usd: usd(profit) },
    sl: { ...side(stop), price: rt(entry - dir * stop, tick), usd: usd(-stop) },
    rr: stop > 0 ? Math.round((profit / stop) * 100) / 100 : null,
    pl: pl ? { ...pl, usd: usd(pl.diff) } : null,
  };
}

// Teksty podpisów (jak TV: pełne z nazwami, kompaktowe same liczby). Zwraca { tp, mid: [wiersze], sl }; pusty napis = bez podpisu.
export function statsText(s, cfg = DEFAULT_STATS, { compact = false } = {}) {
  if (!s) return { tp: '', mid: [], sl: '' };
  const c = { ...DEFAULT_STATS, ...cfg };
  const px = (v) => num(v, 2), signed = (v) => (v > 1e-9 ? '+' : v < -1e-9 ? '−' : '') + num(Math.abs(v), 2);
  const side = (k) => {
    const x = s[k], out = [];
    if (c[`${k}Price`]) out.push(compact ? px(x.offset) : `${k === 'tp' ? t('Cel') : t('Stop')}: ${px(x.offset)}`);
    if (c[`${k}Pct`]) out.push(`(${num(x.pct, 2)}%)`);
    if (c[`${k}Ticks`]) out.push(compact ? num(x.ticks, 0) : t.p('{n} ticków', x.ticks));
    let txt = out.join(' ');
    if (c[`${k}Amount`] && x.usd != null) txt += (txt ? (compact ? ' ' : ', ') : '') + (compact ? fmtMoney(x.usd) : `${t('Kwota')}: ${fmtMoney(x.usd)}`);
    return txt;
  };
  const l1 = [];
  if (c.pl && s.pl) {
    const v = s.pl.usd != null ? fmtMoney(s.pl.usd) : `${signed(s.pl.diff)} ${t('pkt')}`;
    l1.push(compact ? v : `${s.pl.closed ? t('Zamknięty P&L') : t('Otwarty P&L')}: ${v}`);
  }
  if (c.qty && s.qty != null) l1.push(compact ? String(s.qty) : `${t('Ilość')}: ${s.qty}`);
  const mid = [];
  if (l1.length) mid.push(l1.join(compact ? ' ~ ' : ', '));
  if (c.rr && s.rr != null) mid.push(compact ? num(s.rr, 2) : `R:R ${num(s.rr, 2)}`);
  return { tp: side('tp'), mid, sl: side('sl') };
}

// Prostokąty podpisów w pikselach (jak TV: cel za linią celu, stop za linią stopu, środek na linii wejścia). g = { x1, x2, yE, yT, yS }.
// measure(txt, size) → szerokość w px. Bez podpisu (pusty tekst) brak prostokąta.
export function statBoxes(txt, g, measure, size = 12) {
  const pad = 4, lh = Math.round(size * 1.3), cx = (g.x1 + g.x2) / 2, out = [];
  const box = (role, lines, y) => {
    const w = Math.max(...lines.map((l) => measure(l, size))) + pad * 2, h = lines.length * lh + pad * 2;
    return { role, lines, x: cx - w / 2, y, w, h, lh, pad };
  };
  const away = (role, text, yLine) => {
    if (!text) return;
    const above = yLine < g.yE, b = box(role, [text], 0);
    b.y = above ? yLine - 3 - b.h : yLine + 3;
    out.push(b);
  };
  away('tp', txt.tp, g.yT);
  if (txt.mid.length) { const b = box('mid', txt.mid, 0); b.y = g.yE - b.h / 2; out.push(b); }
  away('sl', txt.sl, g.yS);
  return out;
}

// ---- Zakres B: zlecenie z zaznaczonego rysunku pozycji (replay) ----
// [U] 30.10.2026 «Automatycznie»: wejście z rysunku równe bieżącej cenie (± 1 tick) → market; inaczej limit albo stop zależnie od strony ceny; SL i TP z rysunku.
// [U] 30.10.2026 «Ryzyko sesji, rysunek znika»: ilość = sizeFromRisk z ryzyka sesji (jak panel zleceń). last = { t, price } jak w panelu (koniec ostatniej widocznej świecy bazowej).
// Wynik: { order } albo { err, code } (code: 'no-drawing' | 'no-sl' | 'no-price' | 'risk').
export function orderFromDrawing(d, { last, instrument, riskUsd, tick = 0.25 } = {}) {
  if (!isPos(d)) return { err: t('Zaznacz rysunek pozycji long albo short.'), code: 'no-drawing' };
  const st = d.style || {}, dir = d.kind === 'short-position' ? -1 : 1, side = dir > 0 ? 'buy' : 'sell';
  const entry = rt(d.points[0].price, tick);
  const sl = Number.isFinite(st.stopLevel) && st.stopLevel > 0 ? rt(d.points[0].price - dir * st.stopLevel, tick) : null;
  const tp = Number.isFinite(st.profitLevel) && st.profitLevel > 0 ? rt(d.points[0].price + dir * st.profitLevel, tick) : null;
  if (sl == null) return { err: t('Rysunek nie ma SL: wielkość z ryzyka wymaga SL.'), code: 'no-sl' };
  const px = Number(last?.price);
  if (!Number.isFinite(px)) return { err: t('Brak ceny: kursor jest przed pierwszą świecą.'), code: 'no-price' };
  const type = Math.abs(entry - px) <= tick + 1e-9 ? 'market' : (side === 'buy' ? (entry > px ? 'stop' : 'limit') : (entry < px ? 'stop' : 'limit'));
  const qty = sizeFromRisk({ riskUsd, entry: type === 'market' ? px : entry, sl, instrument });
  if (!(qty >= 1)) return { err: t('Ryzyko sesji za małe na SL z rysunku.'), code: 'risk' };
  return { order: { instrument, side, type, price: type === 'market' ? undefined : entry, qty, sl, tp } };
}
