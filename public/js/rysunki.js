// Rysunki w trybie edycji wykresu: pasek narzędzi, zapis do Notion przez serwer (debounce 2 s), cofanie (Ctrl+Z) i licznik zajętości.
// Paczka rysowania (lightweight-charts-drawing 0.6.2) trzyma model rysunków; tu jest spoiwo: 8 narzędzi (FVG to prostokąt z innym
// stylem), domyślne style z tokenów dashboardu (kolory podaje wykres.js), tekst w małym polu input, klawisze Esc/Ctrl+Z.
// P27 (28.10.2026): panel ustawień zaznaczonego rysunku, zapamiętany styl każdego narzędzia, Gann box, „Wyczyść wszystkie”,
// kłódka pozycji trade'a (odblokowanie, edycja, zapis cen do pól trade'a) i poziom BE na pozycjach. Słowa użytkownika w komentarzach niżej.
// Zapis: POST /api/drawings/save { id, doc }, doc = {"v":1,"lib":"0.6.2","at":"<ISO>","d":[…]}. Najwyżej jeden zapis w toku i jeden w kolejce.
// Funkcje czyste (createSaver, docOf, usage, styleFor, pickStyle, editLevels, positionPrices, roundTick) testują wykresy-09 w Node; DOM dotyka tylko createRysunki.
// English: drawing tools bar, style panel, remembered tool styles, debounced save to Notion, undo stack and size meter for the chart edit mode.
import { t } from './i18n.js';
import { esc } from './format.js';
import { GANN_DEFAULT, snapTime, hitTextSlot } from './geometria.js';
import { loadStyleDock, saveStyleDock } from './podglad.js';

export const MAX_CHARS = 190_000; // jak serwer (lib/drawings.mjs)
export const HIDE_FROM = 0.8;      // licznik zajętości widoczny od 80% limitu
export const WARN_FROM = 0.95;     // od 95% kolor ostrzeżenia
export const FIB_LEVELS = [0, 0.5, 0.618, 0.705, 0.79, 1];

// Dokument do zapisu: rysunki bez pomocniczych (np. pozycja trade'a pokazywana z pól, nie zapisywana).
export function docOf(items, { lib, now = new Date() } = {}) {
  return { v: 1, lib: lib || '0.6.2', at: now.toISOString(), d: items };
}
export function usage(doc) {
  const n = JSON.stringify(doc).length;
  return { n, ratio: n / MAX_CHARS, show: n / MAX_CHARS >= HIDE_FROM, warn: n / MAX_CHARS >= WARN_FROM, over: n > MAX_CHARS };
}

// Zapis z opóźnieniem: kolejne zmiany przesuwają termin, w toku najwyżej jeden zapis, w kolejce najnowszy stan.
// W3 (przegląd 28.10.2026): wysyłka, która się nie udała (send rzuca wyjątek), zostawia stan w kolejce zamiast go gubić; ponowienie przy następnym flush() albo zmianie,
// bez pętli (jedna próba na wywołanie). failed() mówi, że ostatni zapis się nie udał, więc widok może zapytać użytkownika przed zamknięciem.
// timers wstrzykiwane w testach (fałszywy zegar). getDoc() zwraca bieżący dokument w chwili wysyłki.
export function createSaver({ send, delay = 2000, timers = { set: (f, ms) => setTimeout(f, ms), clear: (id) => clearTimeout(id) } }) {
  let timer = null, want = null, running = null, again = false, failed = false;
  function fire() {
    if (!want) return running || Promise.resolve();
    if (running) { again = true; return running; }
    const getDoc = want;
    want = null;
    running = Promise.resolve().then(() => send(getDoc())).then(() => { failed = false; }, () => {
      if (!want) want = getDoc; // nowsza zmiana, jeśli już jest, zastępuje nieudany stan
      failed = true;
    }).finally(() => {
      running = null;
      const newer = again; again = false;
      if (newer && want) fire(); // zmiana przyszła w trakcie wysyłki
    });
    return running;
  }
  return {
    change(getDoc) { want = getDoc; if (timer) timers.clear(timer); timer = timers.set(() => { timer = null; fire(); }, delay); },
    // natychmiast (zamknięcie widoku): wysyła zaległą zmianę (także nieudaną wcześniej) i czeka na zapis w toku
    async flush() { if (timer) { timers.clear(timer); timer = null; } if (want) await fire(); while (running) await running; },
    pending: () => !!(timer || want || running),
    failed: () => failed,
  };
}

// P27 (28.10.2026), przegląd: znacznik edycji trade'a (kontrola 409 przy zapisie cen) przesuwa się o WŁASNY zapis rysunków, ale nie o cudzą zmianę.
// Serwer podaje w odpowiedzi `previous` = znacznik strony tuż przed zapisem. Zgadza się z naszym: nikt poza nami nie ruszał strony, więc bierzemy nowy.
// Nie zgadza się: trade zmieniono w Notion przy otwartej edycji, więc zostawiamy stary znacznik i zapis cen dostanie 409 (zrozumiały komunikat w panelu).
export function adoptEdited(current, resp) {
  if (!resp?.edited) return current;
  if (!current || resp.previous === undefined) return resp.edited;
  return resp.previous === current ? resp.edited : current;
}

// ---- ikony (styl ICON z app.js) ----
const ic = (body) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
  'horizontal-line': ic('<path d="M3 12h18"/><circle cx="7" cy="12" r="1.4"/>'),
  'trend-line': ic('<path d="M4 19 20 5"/><circle cx="4" cy="19" r="1.4"/><circle cx="20" cy="5" r="1.4"/>'),
  rectangle: ic('<rect x="4" y="6" width="16" height="12" rx="1.5"/>'),
  fvg: ic('<rect x="4" y="6" width="16" height="12" rx="1.5"/><path d="M4 12h16" stroke-dasharray="2 2.5"/>'),
  'fib-retracement': ic('<path d="M4 5h16M4 10h16M4 14h16M4 19h16M7 19 17 5"/>'),
  'gann-box': ic('<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9h16M4 14h16M9 4v16M14 4v16"/>'),
  text: ic('<path d="M6 6h12M12 6v13M9 19h6"/>'),
  'long-position': ic('<path d="M12 19V6M6.5 11.5 12 6l5.5 5.5"/>'),
  'short-position': ic('<path d="M12 5v13M6.5 12.5 12 18l5.5-5.5"/>'),
  undo: ic('<path d="M9 14 4 9l5-5M4 9h9a6 6 0 0 1 0 12h-3"/>'),
  trash: ic('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/>'),
  clear: ic('<path d="M4 7h16M6 7l1 12h10l1-12M9 7V4h6v3M9.5 11.5l5 5M14.5 11.5l-5 5"/>'),
  lock: ic('<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  unlock: ic('<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
};
const TOOL_LABEL = () => ({
  'horizontal-line': t('Linia pozioma'), 'trend-line': t('Linia trendu'), rectangle: t('Prostokąt'), fvg: t('FVG (luka wartości godziwej)'),
  'fib-retracement': t('Fibonacci'), 'gann-box': t('Gann box'), text: t('Tekst'), 'long-position': t('Pozycja long'), 'short-position': t('Pozycja short'),
});
export const TOOLS = ['horizontal-line', 'trend-line', 'rectangle', 'fvg', 'fib-retracement', 'gann-box', 'text', 'long-position', 'short-position'];

// Domyślne style nowych rysunków z tokenów (c = kolory z wykres.js). FVG: prostokąt w kolorze --be, przerywana linia środka (CE 50%).
// P27: Fibonacci bez wypełnienia (cichy terminal, jak dotąd w podglądzie), Gann box z wypełnieniem stref 8% w kolorach sesji (--n-*),
// podpisy Gann boxa po lewej i u góry (dwie strony zamiast czterech: mniej szumu). Decyzje gustu, zapisane w raporcie P27.
// P27: paczka po zaznaczeniu pozycji pokazuje pigułki z kwotami domyślnego konta (Amount, Qty, PnL): wszystkie wyłączone,
// R:R i BE rysuje wykres.js bez podkładki (preferencja: bez zaokrąglonych podkładek pod tekstem).
export const NO_STATS = Object.fromEntries(['tpPriceOffset', 'tpPercentOffset', 'tpTickOffset', 'tpAmount', 'tpPL', 'openClosePL', 'qty', 'riskRewardRatio', 'slPriceOffset', 'slPercentOffset', 'slTickOffset', 'slAmount', 'slPL'].map((k) => [k, false]));
export function styleFor(kind, c, fvg = false) {
  const gc = [c.fg2, c.asia, c.london, c.ny, c.asia, c.london, c.fg2].map((x) => x || c.fg2);
  switch (kind) {
    case 'rectangle':
      return fvg
        ? { color: c.be, width: 1, backgroundColor: c.be, fillBackground: true, transparency: 88, textColor: c.fg, fontSize: 12, rectMiddleLine: { visible: true, color: c.be, width: 1, style: 'dashed' }, fvg: true }
        : { color: c.fg, width: 1, backgroundColor: c.fg, fillBackground: true, transparency: 90, textColor: c.fg, fontSize: 12, fvg: false };
    case 'text': return { color: c.fg, textColor: c.fg, fontSize: 14 };
    // bez podpisów kwot z domyślnego konta paczki (Amount, Qty): sam obszar zysku i straty, jak pozycja z pól trade'a w podglądzie; R:R rysuje wykres.js (P27)
    case 'long-position':
    case 'short-position': return { color: c.fg, width: 1, textColor: c.fg, stopColor: c.loss, targetColor: c.profit, stopTransparency: 87, targetTransparency: 87, showPriceLabels: false, showRR: true, positionStats: NO_STATS };
    case 'fib-retracement': return { color: c.fg, width: 1, fillBackground: false, transparency: 90, showCoeffs: true, showPrices: true, levels: FIB_LEVELS.map((coeff) => ({ coeff, color: c.fg2, visible: true })) };
    case 'gann-box': {
      const lv = GANN_DEFAULT.map((coeff, k) => ({ coeff, color: gc[k], visible: true }));
      return { color: c.fg2, width: 1, lineStyle: 'solid', levels: lv, vLevels: lv.map((l) => ({ ...l })), fillBackground: true, transparency: 92, fillVertBackground: true, vertTransparency: 92,
        showLeftLabels: true, showRightLabels: false, showTopLabels: true, showBottomLabels: false, reverse: false };
    }
    default: return { color: c.fg, width: 1, textColor: c.fg, fontSize: 12 };
  }
}

// ---- P27: zapamiętany styl narzędzi ----
// Słowa użytkownika (28.10.2026): «wszystkie rysunki zapamietuja nasz wybor i od momentu zmiany rysuja sie w ten sposob co zmienilismy».
// Ostatni styl z panelu każdego narzędzia (FVG osobno od prostokąta) w localStorage; nowy rysunek = styl z tokenów + zapamiętany. Bez tekstu i bez BE w cenie.
export const TOOL_STYLE_KEY = 'thq.chart.toolStyle.v1';
export const STYLE_KEYS = ['color', 'width', 'lineStyle', 'textColor', 'fontSize', 'horzLabelsAlign', 'vertLabelsAlign', 'backgroundColor', 'fillBackground', 'transparency',
  'levels', 'vLevels', 'showCoeffs', 'showPrices', 'fibLevelsAsPercents', 'reverse', 'fillVertBackground', 'vertTransparency',
  'showLeftLabels', 'showRightLabels', 'showTopLabels', 'showBottomLabels', 'showRR', 'beOn', 'rectMiddleLine'];
export function pickStyle(st) {
  const out = {};
  for (const k of STYLE_KEYS) if (st && st[k] !== undefined) out[k] = JSON.parse(JSON.stringify(st[k]));
  return out;
}
// P29: prostokąt może mieć linię połowy, więc FVG rozpoznaje flaga style.fvg; rysunki sprzed P29 jej nie mają (wtedy jak dotąd: linia środka = FVG).
export const toolKeyOf = (d) => (d.kind === 'rectangle' && (d.style?.fvg ?? !!d.style?.rectMiddleLine?.visible) ? 'fvg' : d.kind);
export function loadToolStyles() {
  try { const o = JSON.parse(globalThis.localStorage?.getItem(TOOL_STYLE_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; }
}
export function saveToolStyle(key, st) {
  try { const all = loadToolStyles(); all[key] = pickStyle(st); globalThis.localStorage?.setItem(TOOL_STYLE_KEY, JSON.stringify(all)); } catch { /* localStorage niedostępny */ }
}
// Styl nowego rysunku narzędzia: tokeny, na nich zapamiętany wybór użytkownika.
export function styleForTool(kind, c, fvg = false, saved = loadToolStyles()) {
  const st = { ...styleFor(kind, c, fvg), ...(saved[fvg && kind === 'rectangle' ? 'fvg' : kind] || {}) };
  if (st.beOn && !Number.isFinite(st.beLevel)) st.beLevel = 1; // pozycja z włączonym BE: poziom 1 pkt od wejścia
  return st;
}

// ---- P27: poziomy Fibonacciego i Gann boxa (słowa użytkownika: «gann box oraz fib powinny miec mozliwosc dostosowania rysunkow tak jak
// aktualnie tradingview»): dodaj, usuń, zmień wartość, włącz/wyłącz, kolor. Wynik zawsze posortowany po współczynniku.
export function editLevels(levels, op) {
  let l = (Array.isArray(levels) ? levels : []).map((x) => ({ ...x }));
  if ('add' in op) {
    const last = l.length ? Math.max(...l.map((x) => x.coeff)) : 0;
    const coeff = Number.isFinite(op.add) ? op.add : Math.round((last + 0.5) * 1000) / 1000;
    l.push({ coeff, color: op.color ?? l[l.length - 1]?.color, visible: true });
  }
  if (op.remove != null) l = l.filter((_, k) => k !== op.remove);
  if (op.set != null && l[op.set]) {
    const v = op.value;
    if (op.field === 'coeff') { const n = Number(String(v).replace(',', '.')); if (Number.isFinite(n) && Math.abs(n) <= 100) l[op.set].coeff = n; }
    else if (op.field === 'visible') l[op.set].visible = !!v;
    else if (op.field === 'color' && typeof v === 'string') l[op.set].color = v;
  }
  return l.sort((a, b) => a.coeff - b.coeff);
}

// ---- P27: pozycja trade'a → pola trade'a ----
// Słowa użytkownika: «powinna byc opcja do odblokowania jej i wtedy rysunek zmieniasz i jak zapiszesz do pola notion dostosowuja sie do nowych pozycji».
// Ceny zaokrąglane do ticku instrumentu (ES/MES/NQ/MNQ 0,25).
export const TICKS = { ES: 0.25, MES: 0.25, NQ: 0.25, MNQ: 0.25 };
export const tickOf = (instrument) => TICKS[String(instrument || '').trim().toUpperCase()] ?? 0.25;
export const roundTick = (p, tick = 0.25) => (Number.isFinite(p) ? Number((Math.round(p / tick) * tick).toFixed(6)) : null);
// Rysunek pozycji (long/short) → { entryPrice, exitPrice, sl, tp, be } (null bez poziomu).
// P28 (28.10.2026): wyjście jest w rysunku (style.exitLevel, odległość od wejścia w stronę zysku), więc przeciąga się je na wykresie jak SL/TP.
export function positionPrices(d, tick = 0.25) {
  const st = d?.style || {}, entry = d?.points?.[0]?.price;
  if (!Number.isFinite(entry)) return null;
  const dir = d.kind === 'short-position' ? -1 : 1;
  return {
    entryPrice: roundTick(entry, tick),
    exitPrice: Number.isFinite(st.exitLevel) ? roundTick(entry + dir * st.exitLevel, tick) : null,
    sl: Number.isFinite(st.stopLevel) && st.stopLevel > 0 ? roundTick(entry - dir * st.stopLevel, tick) : null,
    tp: Number.isFinite(st.profitLevel) && st.profitLevel > 0 ? roundTick(entry + dir * st.profitLevel, tick) : null,
    be: Number.isFinite(st.beLevel) ? roundTick(entry + dir * st.beLevel, tick) : null,
  };
}
// Odwrotnie: cena wpisana w panelu → zmiana rysunku pozycji (wejście przesuwa punkty, wyjście/SL/TP/BE zmieniają odległości).
export function withPositionPrice(d, field, price) {
  const dir = d.kind === 'short-position' ? -1 : 1, entry = d.points[0].price, st = { ...d.style };
  if (field === 'entryPrice') {
    const dp = price - entry;
    return { ...d, points: d.points.map((p) => ({ ...p, price: p.price + dp })), style: st };
  }
  if (field === 'sl') st.stopLevel = Math.max(0, (entry - price) * dir);
  else if (field === 'tp') st.profitLevel = Math.max(0, (price - entry) * dir);
  else if (field === 'be') { if (Number.isFinite(price)) st.beLevel = (price - entry) * dir; else delete st.beLevel; }
  else if (field === 'exitPrice') { if (Number.isFinite(price)) st.exitLevel = (price - entry) * dir; else delete st.exitLevel; }
  return { ...d, style: st };
}

// ---- P28 (28.10.2026): zapis pozycji z wynikiem i czasem ----
// Słowa użytkownika: «dopracuj i zrob te 3 pkt» (1: wyjście przeciągane na wykresie, 2: R i P&L przeliczane z cen, świadomie nadpisują
// wpisane wyniki, 3: przesunięcie pozycji w bok zmienia datę i godzinę wejścia i wyjścia, przyciągnięte do świecy bieżącego interwału).
// R = (wyjście − wejście) × kierunek / |wejście − SL|, zaokrąglone do 0,01 R (tak pokazuje je aplikacja). null bez wyjścia albo SL.
// P&L nie jest liczony: trade nie ma pola liczby kontraktów (pytanie do użytkownika w raporcie P28), więc pole P&L zostaje bez zmian.
export function resultR({ entryPrice: e, exitPrice: x, sl }, dir) {
  if (![e, x, sl].every(Number.isFinite) || e === sl) return null;
  return Math.round(((x - e) * dir / Math.abs(e - sl)) * 100) / 100;
}
// Data i godzina (GG:MM) chwili ms w strefie tz: tak zapisuje je formularz trade'a (pola date/time + tz, Notion przechowuje z przesunięciem).
export function wallClock(ms, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
// Plan zapisu odblokowanej pozycji: ciało PATCH (ceny, R, daty tylko gdy się zmieniły) i lista zmian do pokazania przed zapisem.
// trade: { at, exitAt (ms|null), entryPrice, exitPrice, sl, tp, be, r }; d: rysunek pozycji; candles/step: świece bieżącego interwału;
// tz: strefa zapisu dat (jak formularz: strefa przeglądarki); fmt: { price, time, r } do opisu zmian.
// Czas: punkt pozycji w tej samej świecy co dotąd = bez zmiany (zostaje dokładna minuta z Notion); w innej = początek nowej świecy.
// Trade bez czasu wyjścia nie dostaje go z przesunięcia (prawa krawędź pozycji to wtedy tylko ostatnia świeca).
export function planTradeSave(trade, d, { candles, step, tick = 0.25, tz = 'UTC', fmt = {} } = {}) {
  const pr = positionPrices(d, tick);
  if (!pr) return { error: t('Popraw zaznaczone ceny: liczba większa od zera, np. 5842,25.') };
  const fp = fmt.price || ((v) => String(v)), ft = fmt.time || ((ms) => new Date(ms).toISOString());
  const body = { entryPrice: pr.entryPrice, exitPrice: pr.exitPrice, sl: pr.sl, tp: pr.tp, be: pr.be };
  const snap = (sec) => snapTime(candles, sec, step);
  const at0 = Number.isFinite(trade.at) ? trade.at : null, ex0 = Number.isFinite(trade.exitAt) ? trade.exitAt : null;
  let at = at0, exitAt = ex0;
  const [p0, p1] = d.points || [];
  if (at0 != null && p0 && Array.isArray(candles) && candles.length) {
    const s0 = snap(p0.time), sOld = snap(Math.floor(at0 / 1000));
    if (s0 != null && s0 !== sOld) at = s0 * 1000;
    if (ex0 != null && p1) {
      const s1 = snap(p1.time), sxOld = snap(Math.floor(ex0 / 1000));
      if (s1 != null && s1 !== sxOld) exitAt = s1 * 1000;
      if (snap(p1.time) < snap(p0.time)) return { error: t('Wyjście nie może być przed wejściem. Przesuń prawą krawędź pozycji za wejście.') };
      if (exitAt < at) exitAt = at; // wyjście w świecy wejścia, ale przed dokładną minutą wejścia: ta sama chwila
    }
  }
  if (at !== at0) Object.assign(body, wallClock(at, tz), { tz });
  if (exitAt !== ex0) { const w = wallClock(exitAt, tz); Object.assign(body, { exitDate: w.date, exitTime: w.time, tz }); }
  // P32 (28.10.2026), słowa użytkownika na pytanie, czy R ma dalej liczyć się z cen: «tez ma byc reczny». Odstępstwo od P28: zapis pozycji nie zmienia R
  // (ani P&L, P30); R i P&L zostają takie, jak wpisał użytkownik. resultR zostaje tylko jako funkcja pomocnicza (podgląd R:R rysowanych pozycji jej nie używa).
  const r = null;
  const changes = [];
  const add = (label, a, b, f) => { if (a !== b && !(a == null && b == null)) changes.push({ label, from: a == null ? '–' : f(a), to: b == null ? '–' : f(b) }); };
  add(t('Wejście'), trade.entryPrice ?? null, pr.entryPrice, fp);
  add(t('Wyjście'), trade.exitPrice ?? null, pr.exitPrice, fp);
  add('SL', trade.sl ?? null, pr.sl, fp);
  add('TP', trade.tp ?? null, pr.tp, fp);
  add('BE', trade.be ?? null, pr.be, fp);
  add(t('Czas wejścia'), at0, at, ft);
  add(t('Czas wyjścia'), ex0, exitAt, ft);
  return { body, at, exitAt, r, changes };
}

// ---- P27: panel ustawień rysunku (słowa użytkownika: «linie, kwadrat powinny miec mozliwosc dodania tekstu wraz z roznymi opcjami dotyczacymi
// ustawienia tego tekstu i wielkosci np tego tekstu i kolorow rysunkow jak i tekstu oraz grubosci lini bokow»). Mały pasek pod narzędziami, w stylu dashboardu.
const SIZES = [10, 11, 12, 14, 16, 20, 24, 28];
const WIDTHS = [1, 2, 3, 4];
// P32 (28.10.2026), słowa użytkownika: «rysunek kwadrata powinna miec grubosc scian 0 czyli by znikaly»: prostokąt (i FVG) ma też 0 = bez ramki; zaznaczenie i przesuwanie działają dalej.
export const RECT_WIDTHS = [0, 1, 2, 3, 4];
// Sekcje panelu dla rodzaju rysunku.
export function panelFor(kind) {
  switch (kind) {
    case 'horizontal-line': case 'trend-line': return ['text', 'line'];
    case 'rectangle': return ['text', 'line', 'fill'];
    case 'text': return ['textOnly'];
    case 'fib-retracement': return ['line', 'levels', 'fill', 'fib'];
    case 'gann-box': return ['line', 'levels', 'vLevels', 'fill', 'gann'];
    case 'long-position': case 'short-position': return ['position'];
    default: return [];
  }
}

// ctx: { D (moduł paczki), chart, series, plot (element wykresu), bar (miejsce na przyciski), panel (miejsce na panel stylu),
//        foot ({ save, meter }), tradeId, doc, instrument, colors() → kolory z tokenów, toHex(kolor) → #rrggbb dla pola koloru,
//        extra() → rysunek pozycji trade'a (nie zapisywany) albo null, saveTrade(plan) → Promise<{ ok, error? }>, onTradeDraft(ceny|null),
//        onChange(), onSaved(), confirm({ title, text, ok }) → Promise<bool>,
//        P28: planTrade(rysunek) → planTradeSave(…), exitPoint(rysunek) → { x, y } kropki wyjścia w polu wykresu, pointAt({ x, y }) → { price, time },
//        hold(bool) → wstrzymanie przesuwania wykresu w trakcie przeciągania }
export function createRysunki(ctx) {
  const { D, chart, series, plot, bar, foot, tradeId } = ctx;
  const panel = ctx.panel || document.createElement('div');
  const stage = ctx.stage || plot.parentElement || plot; // P29: pole wykresu z nakładkami (zębatka, okienko, panel przypięty)
  const gear = ctx.gear || document.createElement('button');
  const manager = new D.DrawingManager(chart, series, {});
  const fvg = { on: false };
  D.setDefaultStyleOverride((kind) => styleForTool(kind, ctx.colors(), fvg.on));
  const tick = tickOf(ctx.instrument);
  // pole koloru przyjmuje tylko 6 cyfr szesnastkowych: kolor z tokenów albo rgba() z sondy sprowadzony do tej postaci, w ostateczności --fg
  const hex6 = (v) => { try { const h = ctx.toHex ? ctx.toHex(v) : v; return /^#[0-9a-f]{6}$/i.test(h) ? h : null; } catch { return null; } };
  const toHex = (v) => hex6(v) || hex6(ctx.colors().fg) || '';

  // pozycja trade'a: zablokowana (z pól), po odblokowaniu edytowalna (szkic); nigdy w zapisie rysunków
  let posId = null, posUnlocked = false, posDraft = null;
  const items = () => JSON.parse(manager.exportJSON()).filter((d) => d.id !== posId);
  const addExtra = () => {
    const x = posUnlocked && posDraft ? { ...posDraft, locked: false } : ctx.extra?.();
    if (x) { const { id, ...rest } = x; posId = manager.add(rest); } else posId = null;
  };
  const load = (list) => { manager.importJSON(JSON.stringify(list)); addExtra(); };
  load(Array.isArray(ctx.doc?.d) ? ctx.doc.d : []);

  // ---- pasek ----
  const labels = TOOL_LABEL();
  bar.innerHTML = TOOLS.map((k) => `<button type="button" class="icon-btn" data-tool="${k}" aria-pressed="false" title="${labels[k]}" aria-label="${labels[k]}">${ICONS[k]}</button>`).join('')
    + `<span class="swc-sep" aria-hidden="true"></span>`
    + `<button type="button" class="icon-btn" data-act="undo" title="${t('Cofnij (Ctrl+Z)')}" aria-label="${t('Cofnij')}" disabled>${ICONS.undo}</button>`
    + `<button type="button" class="icon-btn" data-act="del" title="${t('Usuń zaznaczony rysunek (Delete)')}" aria-label="${t('Usuń zaznaczony rysunek')}" disabled>${ICONS.trash}</button>`
    + `<button type="button" class="icon-btn" data-act="clear" title="${t('Wyczyść wszystkie rysunki')}" aria-label="${t('Wyczyść wszystkie rysunki')}" disabled>${ICONS.clear}</button>`
    + `<button type="button" class="icon-btn" data-act="lock" aria-pressed="false" hidden>${ICONS.lock}</button>`;
  const btn = (s) => bar.querySelector(s);
  let active = null;
  function paintTools() {
    bar.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === active)));
  }
  function pick(k) {
    active = active === k ? null : k;
    fvg.on = active === 'fvg';
    manager.setTool(active === 'fvg' ? 'rectangle' : active);
    paintTools();
  }
  // po postawieniu rysunku paczka sama zdejmuje narzędzie: pasek ma to odzwierciedlić
  try { manager.on('tool', (k) => { if (!k) { active = null; fvg.on = false; paintTools(); } }); } catch { /* zdarzenie niedostępne: pasek zgaśnie przy następnym wyborze */ }

  // ---- cofanie: stos migawek po zakończeniu gestu ----
  const stack = [JSON.stringify(items())];
  let restoring = false, snapTimer = 0;
  function snap() {
    if (restoring) return;
    clearTimeout(snapTimer);
    const s = JSON.stringify(items());
    if (s !== stack[stack.length - 1]) { stack.push(s); if (stack.length > 60) stack.shift(); }
    syncBtns();
  }
  function undo() {
    if (stack.length < 2) return;
    stack.pop();
    restoring = true;
    try { if (posUnlocked) posDraft = manager.get(posId) || posDraft; load(JSON.parse(stack[stack.length - 1])); } finally { restoring = false; }
    syncBtns(); changed(false); showPanel();
  }
  function remove() {
    snap();
    for (const id of [].concat(manager.selection()).filter((x) => x !== posId)) manager.remove(id);
    snap(); syncBtns(); showPanel();
  }
  // P27, słowa użytkownika: «dodaj mozliwosc wyczyszczenia wszystkich rysnkow z danego wykresu»: z potwierdzeniem, cofalne (Ctrl+Z) w tej sesji.
  async function clearAll() {
    const n = items().length;
    if (!n) return;
    const ok = await (ctx.confirm ? ctx.confirm({ title: t('Wyczyścić wszystkie rysunki?'), text: t('Usuniesz wszystkie rysunki z tego wykresu (liczba: {n}). Cofniesz to przyciskiem Cofnij albo Ctrl+Z, dopóki edycja jest otwarta.', { n: String(n) }), ok: t('Wyczyść') }) : Promise.resolve(true));
    if (!ok) return;
    snap(); // zaległa migawka (zmiany z ostatnich 250 ms) trafia na stos przed czyszczeniem, więc Cofnij wraca do pełnego stanu
    restoring = true;
    try { for (const d of items()) manager.remove(d.id); } finally { restoring = false; }
    snap(); changed(false); showPanel();
  }
  function syncBtns() {
    btn('[data-act="undo"]').disabled = stack.length < 2;
    btn('[data-act="del"]').disabled = ![].concat(manager.selection()).some((x) => x !== posId);
    btn('[data-act="clear"]').disabled = !items().length;
    const lk = btn('[data-act="lock"]');
    lk.hidden = !posId;
    lk.setAttribute('aria-pressed', String(posUnlocked));
    lk.innerHTML = posUnlocked ? ICONS.unlock : ICONS.lock;
    const lt = posUnlocked ? t('Zablokuj pozycję trade\'a (bez zapisu zmian)') : t('Odblokuj pozycję trade\'a, żeby zmienić ceny i czas wejścia i wyjścia');
    lk.title = lt; lk.setAttribute('aria-label', lt);
  }

  // ---- zapis ----
  let lastStatus = '';
  const say = (txt, kind = '') => { lastStatus = kind; foot.save.textContent = txt; foot.save.dataset.kind = kind; };
  let lastError = '';
  // Wyjątek = zapis się nie udał: saver zostawia stan w kolejce (W3), a widok pyta przed zamknięciem
  async function send(doc) {
    const u = usage(doc);
    if (u.over) {
      lastError = t('Za dużo rysunków na tym trade\'zie ({n} z 190 000 znaków). Usuń część rysunków, zanim zapiszesz.', { n: String(u.n) });
      say(lastError, 'error');
      throw new Error(lastError);
    }
    say(t('Zapisuję…'));
    try {
      const r = await fetch('/api/drawings/save', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-THQ': '1' }, body: JSON.stringify({ id: tradeId, doc }), keepalive: JSON.stringify(doc).length < 60_000 });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || t('Nie udało się połączyć z serwerem.'));
      lastError = '';
      if (j.pending) say(t('Zapisano lokalnie, wyślę do Notion.'), 'local');
      else { say(t('Zapisano.'), 'ok'); ctx.onSaved?.(j); }
    } catch (e) {
      lastError = e instanceof TypeError ? t('Nie udało się połączyć z serwerem.') : e.message;
      say(lastError, 'error');
      throw e;
    }
  }
  const saver = createSaver({ send });
  const buildDoc = () => docOf(items(), { lib: D.VERSION });
  function meter() {
    const u = usage(docOf(items(), { lib: D.VERSION }));
    foot.meter.hidden = !u.show;
    foot.meter.dataset.warn = u.warn ? '1' : '';
    foot.meter.textContent = t('Rysunki: {p}% limitu', { p: String(Math.min(999, Math.round(u.ratio * 100))) });
  }
  let lastDoc = JSON.stringify(items());
  function changed(withSnap = true) {
    if (restoring) return;
    ctx.onChange?.();
    if (posUnlocked) syncTradeFields();
    syncStyleFields(); placeGear();
    const now = JSON.stringify(items());
    if (now === lastDoc) return; // zmiana tylko pozycji trade'a: nic do zapisu w rysunkach
    lastDoc = now;
    if (withSnap) { clearTimeout(snapTimer); snapTimer = setTimeout(snap, 250); }
    meter(); syncBtns();
    say(t('Zmiany czekają na zapis…'));
    saver.change(buildDoc);
  }
  const offs = [];
  const on = (ev, fn) => { try { const off = manager.on(ev, fn); if (typeof off === 'function') offs.push(off); } catch { /* brak zdarzenia */ } };
  on('change', () => changed());
  on('gestureEnd', () => { snap(); syncBtns(); });
  on('selection', () => { syncBtns(); showPanel(); placeGear(); });
  meter(); syncBtns();

  // ---- tekst: edycja w miejscu (P32) ----
  // Słowa użytkownika (28.10.2026): «pole tekstu ktore wpisujemy na wykres nie powinno miec innego wygladu podczas wpisywania niz wyglada po wpisaniu» oraz
  // «rysunki powinny miec pole do kliknieca, gdzie maja ustawione pole tekstowe i jak sie je kliknie podwojnie to zaczynac pisac tam». Odstępstwo od etapu 9
  // (małe pole input z ramką w miejscu kliknięcia): tekst w trakcie pisania rysuje sam wykres (ten sam krój, rozmiar, kolor, wyrównanie i miejsce co po
  // zatwierdzeniu), a nad nim leży przezroczyste pole z samym kursorem, ustawione tym samym krojem w miejscu tekstu (geometria.textSlot). Dwuklik w miejscu
  // tekstu linii, linii trendu, prostokąta i tekstu (także pustym: tam, gdzie tekst by się pojawił) zaczyna edycję. Enter i klik obok zatwierdzają, Esc anuluje.
  const textOfD = (d) => (d.kind === 'text' ? d.text || '' : (typeof d.style?.text === 'string' && d.style.text) || d.text || '');
  const withText = (d, v) => (d.kind === 'text' ? { ...d, text: v } : { ...d, text: v, style: { ...d.style, text: v } });
  let measureCtx = null;
  const textW = (txt, size) => {
    if (!txt) return 0;
    try { if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d'); measureCtx.font = `${size}px ${ctx.colors().font}`; return measureCtx.measureText(txt).width; } catch { return txt.length * size * 0.6; }
  };
  let editing = null;
  function startTextEdit(d0, { fresh = false } = {}) {
    editing?.finish(true);
    const id = d0.id, d = manager.get(id) || d0;
    const slot = ctx.textSlot?.(d);
    if (!slot) return;
    const orig = d, before = textOfD(d), st = d.style || {};
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'swc-text'; inp.maxLength = 200; inp.value = before; inp.spellcheck = false; inp.autocomplete = 'off';
    inp.setAttribute('aria-label', t('Tekst rysunku'));
    const W = plot.clientWidth, size = slot.size;
    // pole szerokie na dostępne miejsce, wyrównane jak tekst (start: od punktu w prawo, środek: wokół punktu, koniec: do punktu)
    const half = Math.max(60, Math.min(slot.x, W - slot.x));
    const [left, width, align] = slot.anchor === 'start' ? [slot.x, Math.max(80, W - slot.x), 'left'] : slot.anchor === 'end' ? [slot.x - Math.max(80, slot.x), Math.max(80, slot.x), 'right'] : [slot.x - half, 2 * half, 'center'];
    const top = slot.y - size * 0.2, height = size * 1.4;
    Object.assign(inp.style, {
      left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, lineHeight: `${height}px`,
      font: `${size}px ${ctx.colors().font}`, textAlign: align, caretColor: 'transparent', // P34: własny kursor (.swc-caret); natywny w polu z przezroczystym tekstem nie był widoczny
     
      transformOrigin: `${slot.ax - left}px ${slot.ay - top}px`, transform: slot.angle ? `rotate(${slot.angle}deg)` : '',
    });
    // P34 (28.10.2026), słowa użytkownika: «tam gdzie mozna wpisac tekst powinien migac taki pasek, zeby cokolwiek pokazac gdzie jest to pole».
    // Kursor rysujemy sami (element .swc-caret, miganie w CSS, stały przy prefers-reduced-motion): stoi przy kursorze pola (domyślnie na końcu tekstu),
    // w kolorze tekstu rysunku, wysokość = rozmiar czcionki, tam gdzie tekst jest narysowany (także przy pustym polu, z wyrównaniem).
    const caret = document.createElement('div');
    caret.className = 'swc-caret'; caret.setAttribute('aria-hidden', 'true');
    caret.style.background = st.textColor || st.color || ctx.colors().fg;
    const placeCaret = () => {
      const v = inp.value, i = Math.min(inp.selectionStart ?? v.length, v.length), w = textW(v, size), tb = textW(v.slice(0, i), size);
      const x0 = slot.anchor === 'start' ? slot.x : slot.anchor === 'end' ? slot.x - w : slot.x - w / 2;
      const cl = x0 + tb, ct = top + size * 0.2;
      Object.assign(caret.style, { left: `${cl}px`, top: `${ct}px`, height: `${size}px`, transformOrigin: `${slot.ax - cl}px ${slot.ay - ct}px`, transform: slot.angle ? `rotate(${slot.angle}deg)` : '' });
      caret.style.animation = 'none'; void caret.offsetWidth; caret.style.animation = ''; // po ruchu kursor od razu widoczny
    };
    let done = false;
    const live = (v) => { restoring = true; try { manager.update(withText(manager.get(id) || orig, v)); } finally { restoring = false; } ctx.onChange?.(); };
    const finish = (commit) => {
      if (done) return; done = true; editing = null;
      const v = inp.value.trim();
      inp.remove(); caret.remove();
      if (!manager.get(id)) return;
      if (commit && (v || d.kind !== 'text')) {
        restoring = true; try { manager.update(withText(manager.get(id), before)); } finally { restoring = false; } // zmiana liczy się od stanu sprzed edycji (zapis, cofanie)
        if (v !== before) manager.update(withText(manager.get(id), v));
      } else if (d.kind === 'text' && (fresh || !before)) { manager.remove(id); } // nowy tekst bez treści nie zostaje
      else { restoring = true; try { manager.update(withText(manager.get(id), before)); } finally { restoring = false; } ctx.onChange?.(); }
      snap(); syncBtns(); if (panelId === id) showPanel();
    };
    editing = { id, finish };
    inp.addEventListener('input', () => { live(inp.value); placeCaret(); });
    inp.addEventListener('keyup', placeCaret);
    inp.addEventListener('pointerup', () => setTimeout(placeCaret, 0));
    inp.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); finish(true); } else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); } });
    inp.addEventListener('blur', () => finish(true));
    plot.appendChild(inp); plot.appendChild(caret); placeCaret();
    setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); placeCaret(); }, 0);
  }
  on('textEdit', (drawing) => startTextEdit(drawing, { fresh: !drawing.text }));
  // pole tekstu rysunków innych niż „Tekst” (te obsługuje paczka): dwuklik w miejscu tekstu, kursor tekstowy po najechaniu
  const textHit = (ev) => {
    if (!ctx.textSlot) return null;
    const q = plotXY(ev), list = manager.drawings();
    for (let k = list.length - 1; k >= 0; k--) {
      const d = list[k];
      if (d.kind === 'text' || d.id === posId || d.locked || d.hidden || !panelFor(d.kind).includes('text')) continue;
      const slot = ctx.textSlot(d);
      if (slot && hitTextSlot(slot, textW(slot.text, slot.size), q)) return d;
    }
    return null;
  };
  const onTextDbl = (ev) => {
    if (manager.tool()) return;
    const d = textHit(ev);
    if (!d) return;
    ev.stopPropagation(); ev.preventDefault();
    manager.select([d.id]);
    startTextEdit(d);
  };
  const onTextHover = (ev) => { if (!ev.buttons && !manager.tool()) plot.dataset.textHover = textHit(ev) ? '1' : ''; };
  plot.addEventListener('dblclick', onTextDbl, true);
  plot.addEventListener('pointermove', onTextHover);
  offs.push(() => { plot.removeEventListener('dblclick', onTextDbl, true); plot.removeEventListener('pointermove', onTextHover); editing?.finish(true); });

  // ---- panel ustawień rysunku ----
  // P29 (28.10.2026), słowa użytkownika: «ustawienienia rysunkow maja wyskoczyc dopiero jesli sie kliknie w znak ustawien przy danym rysunku ktory sie bedzie
  // pojawiac jak sie najedzie na dany rysunek lub bedzie sie mialo zaznaczony, i okno ustawien ma byc prostszy w zrozumieniu i lepiej dopracowany design na
  // logiczniejszy i przedstawione jako przesuwalny popup. ale w popupie powinna byc opcja przeniesienienia go do lewej strony wykresu co nie spowoduje
  // przesuniecia i efektu zmienienia wysokosci czy szerokosci wykresu, tylko tak jakby zasloni dany obszar [...] powinien byc do tego tez przelacznik ogolny».
  // Odstępstwo od P27 (pasek stylu nad wykresem po zaznaczeniu): zębatka przy rysunku (najechanie albo zaznaczenie) otwiera okienko przesuwane za nagłówek,
  // które znika po kliknięciu obok; „Przypnij z lewej” zamienia je w panel nałożony na lewą część wykresu (position: absolute, wykres nie zmienia rozmiaru),
  // który zostaje do odpięcia i pokazuje zaznaczony rysunek. Tryb (okienko / panel) to stan urządzenia: loadStyleDock z podglad.js, Ustawienia → Ogólne.
  // Treść w grupach (Linia, Wypełnienie, Tekst, Poziomy, Podpisy), etykieta z lewej, kontrolka z prawej. Pozycja trade'a po odblokowaniu: ten sam panel
  // (ceny, zapis), który nie znika po kliknięciu w wykres, bo pozycję przesuwa się na wykresie.
  const L = (s) => esc(t(s));
  const POP_KEY = 'thq.chart.stylePop.v1';
  let dock = loadStyleDock();
  let openId = null; // rysunek, dla którego otwarto okienko zębatką
  const segHtml = (k, cur, opts, label) => `<div class="seg sm" role="group"${label ? ` aria-label="${esc(label)}"` : ''}>${opts.map(([v, lab, title]) => `<button type="button" data-k="${k}" data-v="${esc(String(v))}" aria-pressed="${String(cur) === String(v)}"${title ? ` title="${esc(title)}" aria-label="${esc(title)}"` : ''}>${esc(lab)}</button>`).join('')}</div>`;
  const colorIn = (k, v, label) => `<input type="color" data-k="${k}" value="${toHex(v)}" aria-label="${esc(label)}" title="${esc(label)}">`;
  const selIn = (k, cur, opts, label) => `<select class="sp-in sp-sel" data-k="${k}" aria-label="${esc(label)}">${opts.map((v) => `<option value="${v}"${Number(cur) === v ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
  const chk = (k, on, label) => `<label class="check"><input type="checkbox" data-k="${k}"${on ? ' checked' : ''}> ${esc(label)}</label>`;
  const row = (label, ctl) => `<div class="swc-row"><span class="note">${esc(label)}</span><span class="swc-ctl">${ctl}</span></div>`;
  const grp = (title, body) => `<section class="swc-grp"><h3 class="lbl">${esc(title)}</h3>${body}</section>`;
  const lineSt = (st) => segHtml('lineStyle', st.lineStyle || 'solid', [['solid', '—', t('Linia ciągła')], ['dashed', '- -', t('Linia przerywana')], ['dotted', '···', t('Linia kropkowana')]], t('Styl linii'));
  function levelsHtml(key, st) {
    const lv = Array.isArray(st[key]) ? st[key] : [];
    return `<div class="swc-lvs" data-lvkey="${key}">${lv.map((l, k) => `<span class="swc-lv">`
      + `<label class="check" title="${L('Pokaż poziom')}"><input type="checkbox" data-lv="${k}" data-lk="visible"${l.visible !== false ? ' checked' : ''} aria-label="${esc(t('Pokaż poziom {v}', { v: String(l.coeff) }))}"></label>`
      + `<input class="sp-in" data-lv="${k}" data-lk="coeff" value="${esc(String(l.coeff))}" inputmode="decimal" aria-label="${L('Wartość poziomu')}">`
      + `<input type="color" data-lv="${k}" data-lk="color" value="${toHex(l.color || st.color)}" aria-label="${L('Kolor poziomu')}">`
      + `<button type="button" class="icon-btn" data-lvdel="${k}" aria-label="${esc(t('Usuń poziom {v}', { v: String(l.coeff) }))}">×</button></span>`).join('')}`
      + `<button type="button" class="btn ghost sm" data-lvadd="1">${L('Dodaj poziom')}</button></div>`;
  }
  // P29, słowa użytkownika: «ustawienia boxa, nie ma przelacznika widocznosci polowy boxa, powinno byc»: prostokąt i FVG = linia środka (rectMiddleLine),
  // Gann box = poziom 0,5 ceny i czasu.
  const gannHalf = (st) => [...(st.levels || []), ...(st.vLevels || [])].some((l) => l.coeff === 0.5 && l.visible !== false);
  function groupsHtml(d) {
    const st = d.style || {}, k = d.kind;
    const lineGrp = (title, mid) => grp(title, row(t('Kolor'), colorIn('color', st.color, title === t('Obramowanie') ? t('Kolor obramowania') : t('Kolor linii')))
      + row(t('Grubość'), selIn('width', st.width ?? 1, k === 'rectangle' ? RECT_WIDTHS : WIDTHS, t('Grubość'))) + row(t('Styl'), lineSt(st)) + (mid ? row('', chk('midLine', mid.on, t('Linia połowy'))) : ''));
    const fillGrp = (withColor) => {
      const op = 100 - (st.transparency ?? 80);
      return grp(t('Wypełnienie'), row('', chk('fillBackground', st.fillBackground !== false, t('Pokaż wypełnienie')))
        + (withColor ? row(t('Kolor'), colorIn('backgroundColor', st.backgroundColor || st.color, t('Kolor wypełnienia'))) : '')
        + row(t('Krycie'), `<input type="range" min="0" max="100" step="1" data-k="opacity" value="${op}" aria-label="${L('Krycie wypełnienia (%)')}"><span class="note swc-op">${op}%</span>`));
    };
    const textGrp = (only) => {
      const v = only ? (d.text || '') : (st.text || '');
      let h = row(t('Tekst'), `<input class="sp-in swc-ftext" data-k="text" value="${esc(v)}" maxlength="200" aria-label="${L('Tekst')}"${only ? '' : ` placeholder="${L('np. OB')}"`}>`)
        + row(t('Rozmiar'), selIn('fontSize', st.fontSize ?? (only ? 14 : 12), SIZES, t('Rozmiar')) + colorIn('textColor', st.textColor || st.color, t('Kolor tekstu')));
      if (!only) {
        h += row(t('Poziomo'), segHtml('horzLabelsAlign', st.horzLabelsAlign || 'center', [['left', t('Lewo')], ['center', t('Środek')], ['right', t('Prawo')]], t('Położenie tekstu w poziomie')))
          + row(t('Pionowo'), segHtml('vertLabelsAlign', st.vertLabelsAlign || (k === 'trend-line' ? 'bottom' : 'middle'), [['bottom', t('Nad')], ['middle', t('Na linii')], ['top', t('Pod')]], t('Położenie tekstu w pionie')));
      }
      return grp(t('Tekst'), h);
    };
    switch (k) {
      case 'horizontal-line': case 'trend-line': return lineGrp(t('Linia')) + textGrp(false);
      case 'rectangle': return lineGrp(t('Obramowanie'), { on: !!st.rectMiddleLine?.visible }) + fillGrp(true) + textGrp(false);
      case 'text': return textGrp(true);
      case 'fib-retracement':
        return lineGrp(t('Linia')) + grp(t('Poziomy'), levelsHtml('levels', st)) + fillGrp(false)
          + grp(t('Podpisy'), row('', chk('showCoeffs', st.showCoeffs !== false, t('Współczynniki'))) + row('', chk('showPrices', st.showPrices !== false, t('Ceny')))
            + row('', chk('fibLevelsAsPercents', !!st.fibLevelsAsPercents, t('W procentach'))) + row('', chk('reverse', !!st.reverse, t('Odwróć'))));
      case 'gann-box':
        return lineGrp(t('Linia'), { on: gannHalf(st) }) + grp(t('Poziomy ceny'), levelsHtml('levels', st)) + grp(t('Poziomy czasu'), levelsHtml('vLevels', st)) + fillGrp(false)
          + grp(t('Podpisy'), row('', chk('gannLabels', st.showLeftLabels !== false || st.showTopLabels !== false, t('Pokaż podpisy'))) + row('', chk('reverse', !!st.reverse, t('Odwróć'))));
      case 'long-position': case 'short-position': {
        const pr = positionPrices(d, tick);
        return grp(t('Poziomy'), row('', chk('beOn', Number.isFinite(st.beLevel), t('Poziom BE')))
          + (Number.isFinite(st.beLevel) ? row(t('Cena BE'), `<input class="sp-in swc-num" data-k="bePrice" value="${pr?.be ?? ''}" inputmode="decimal" aria-label="${L('Cena BE')}">`) : '')
          + row('', chk('showRR', st.showRR !== false, t('Pokaż R:R'))));
      }
      default: return '';
    }
  }
  // Pozycja trade'a po odblokowaniu: ceny do pól trade'a. P28: wyjście to kropka na prawej krawędzi pozycji (przeciągana), pod polami lista zmian.
  function tradePanelHtml(d) {
    const pr = positionPrices(d, tick) || {};
    const f = (k, label, v) => `<label class="swc-f"><span class="note">${esc(label)}</span><input class="sp-in swc-num" data-tk="${k}" value="${v ?? ''}" inputmode="decimal" aria-label="${esc(label)}"></label>`;
    return `<div class="swc-tgrid">${f('entryPrice', t('Wejście'), pr.entryPrice)}${f('exitPrice', t('Wyjście'), pr.exitPrice)}${f('sl', 'SL', pr.sl)}${f('tp', 'TP', pr.tp)}${f('be', 'BE', pr.be)}</div>`
      + `<p class="swc-tdiff" aria-live="polite">${diffHtml(d)}</p>`
      + `<div class="swc-tact"><button type="button" class="btn sm primary" data-act="tsave">${L('Zapisz w trade\'zie')}</button><button type="button" class="btn ghost sm" data-act="tcancel">${L('Anuluj')}</button></div><span class="note swc-tmsg" aria-live="polite"></span>`;
  }
  // P28: co się zmieni w trade'zie po zapisie (ceny, czasy, R); P&L zostaje (brak liczby kontraktów w trade'zie)
  function diffHtml(d) {
    const p = ctx.planTrade?.(d);
    if (!p) return '';
    if (p.error) return `<span class="swc-terr">${esc(p.error)}</span>`;
    if (!p.changes.length) return `<span class="note">${L('Bez zmian w trade\'zie.')}</span>`;
    return `<span class="note">${L('Po zapisie:')}</span> ` + p.changes.map((c) => `<span class="swc-chg"><span class="note">${esc(c.label)}</span> <span class="note">${esc(c.from)}</span> → ${esc(c.to)}</span>`).join('');
  }
  const ICO_PIN = ic('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>');
  const ICO_FLOAT = ic('<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="11" y="10" width="7" height="6" rx="1"/>');
  const ICO_X = ic('<path d="M6 6l12 12M18 6 6 18"/>');
  function headHtml(title, { canClose, sub = '' }) {
    const dockBtn = dock === 'pin'
      ? `<button type="button" class="icon-btn" data-act="pdock" data-v="pop" title="${L('Odepnij: okienko po kliknięciu zębatki')}" aria-label="${L('Odepnij panel')}">${ICO_FLOAT}</button>`
      : `<button type="button" class="icon-btn" data-act="pdock" data-v="pin" title="${L('Przypnij z lewej strony wykresu')}" aria-label="${L('Przypnij z lewej strony wykresu')}">${ICO_PIN}</button>`;
    return `<div class="swc-ph"><span class="swc-ptitle">${esc(title)}${sub ? ` <span class="swc-psub note">${esc(sub)}</span>` : ''}</span>${dockBtn}${canClose ? `<button type="button" class="icon-btn" data-act="pclose" aria-label="${L('Zamknij ustawienia rysunku')}">${ICO_X}</button>` : ''}</div>`;
  }
  let panelId = null;
  // P32 (28.10.2026), słowa użytkownika: «jak ustawienia rysunku sa ustawione na boczne, to powinien miec on dalej x do zakmniecia, dlatego poniewaz mial on pelnic
  // taka funkcje ze nawet jak odznaczymy jakis rysunek do ustawienia dalej dotycza tego ostatniego. jak zamkniemy boczne ustawienia to powinien on calkowicie
  // zniknac i pojawic sie dopiero jak znowu nie klikniemy ustawien rysunku». Odstępstwo od P29 (panel przypięty stał stale, z podpowiedzią, gdy nic nie było
  // zaznaczone): panel przypięty otwiera zębatka, ma X; po odznaczeniu zostaje i dalej zmienia ostatni wybrany rysunek (podpis „ostatnio wybrany” w nagłówku),
  // zaznaczenie innego rysunku przełącza go na ten rysunek; X chowa panel do następnego kliknięcia zębatki. Usunięty rysunek zamyka panel (decyzja gustu).
  const styleTarget = () => {
    if (!openId || !manager.get(openId) || !panelFor(manager.get(openId).kind).length) { openId = null; return null; }
    if (dock === 'pin') {
      const sel = [].concat(manager.selection()).filter((x) => x !== posId);
      if (sel.length === 1 && sel[0] !== openId && gearable(sel[0])) openId = sel[0];
    }
    return openId;
  };
  const isSelected = (id) => [].concat(manager.selection()).includes(id);
  function showPanel() {
    panel.dataset.dock = dock;
    if (posUnlocked && posId && manager.get(posId)) {
      const d = manager.get(posId);
      panelId = posId;
      panel.dataset.mode = 'trade';
      panel.innerHTML = headHtml(t('Pozycja trade\'a'), { canClose: false }) + `<div class="swc-pb">${tradePanelHtml(d)}</div>`;
      reveal();
      return;
    }
    const id = styleTarget(), d = id ? manager.get(id) : null;
    if (d && panelFor(d.kind).length) {
      panelId = id;
      panel.dataset.mode = 'style';
      const name = labels[toolKeyOf(d) === 'fvg' ? 'fvg' : d.kind] || '';
      const txt = (typeof d.style?.text === 'string' && d.style.text) || (typeof d.text === 'string' && d.text) || '';
      const sub = isSelected(id) ? '' : t('ostatnio wybrany');
      panel.innerHTML = headHtml(name, { canClose: true, sub: [txt ? `„${txt.slice(0, 24)}”` : '', sub].filter(Boolean).join(' · ') }) + `<div class="swc-pb">${groupsHtml(d)}</div>`;
      reveal();
      return;
    }
    panelId = null;
    panel.hidden = true; panel.innerHTML = ''; panel.dataset.mode = '';
  }
  // Okienko: zapamiętana pozycja (przeciągnięta za nagłówek), inaczej obok zębatki; zawsze w obrębie wykresu.
  function loadPop() { try { const o = JSON.parse(globalThis.localStorage?.getItem(POP_KEY) || 'null'); return o && Number.isFinite(o.x) && Number.isFinite(o.y) ? o : null; } catch { return null; } }
  function savePop(o) { try { globalThis.localStorage?.setItem(POP_KEY, JSON.stringify({ x: Math.round(o.x), y: Math.round(o.y) })); } catch { /* localStorage niedostępny */ } }
  let popAt = null;
  function placePop(x, y) {
    const W = stage.clientWidth, H = stage.clientHeight, w = panel.offsetWidth, h = panel.offsetHeight;
    const nx = Math.max(4, Math.min(x, W - w - 4)), ny = Math.max(4, Math.min(y, H - h - 4));
    panel.style.left = `${nx}px`; panel.style.top = `${ny}px`;
    return { x: nx, y: ny };
  }
  function reveal() {
    panel.hidden = false;
    if (dock === 'pin') { panel.style.left = ''; panel.style.top = ''; return; }
    const g = gear.hidden ? null : { x: gear.offsetLeft, y: gear.offsetTop };
    const at = loadPop() || popAt || (g ? { x: g.x + 34, y: g.y } : { x: 12, y: 12 });
    popAt = placePop(at.x, at.y);
  }
  // P32: zamyka okienko i panel przypięty (X); wraca dopiero po kliknięciu zębatki
  function closePop() { if (panel.dataset.mode === 'trade') return; openId = null; showPanel(); }
  function setDock(v) {
    dock = v === 'pop' ? 'pop' : 'pin';
    saveStyleDock(dock);
    if (!openId) openId = panelId && panelId !== posId ? panelId : null; // zmiana formy zostawia ten sam rysunek
    showPanel(); placeGear();
  }
  // przeciąganie okienka za nagłówek
  panel.addEventListener('pointerdown', (ev) => {
    const h = ev.target.closest('.swc-ph');
    if (!h || dock !== 'pop' || ev.button !== 0 || ev.target.closest('button')) return;
    ev.preventDefault();
    const sx = ev.clientX, sy = ev.clientY, x0 = panel.offsetLeft, y0 = panel.offsetTop;
    h.setPointerCapture?.(ev.pointerId);
    const move = (e) => { popAt = placePop(x0 + e.clientX - sx, y0 + e.clientY - sy); };
    const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); if (popAt) savePop(popAt); };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  });
  // okienko znika po kliknięciu obok (także w wykres); panel przypięty i panel pozycji trade'a zostają
  const onDocDown = (ev) => {
    if (dock !== 'pop' || panel.hidden || panel.dataset.mode !== 'style') return;
    if (panel.contains(ev.target) || gear.contains(ev.target)) return;
    closePop();
  };
  document.addEventListener('pointerdown', onDocDown, true);
  offs.push(() => document.removeEventListener('pointerdown', onDocDown, true));

  // ---- zębatka przy rysunku (najechanie albo zaznaczenie) ----
  let gearId = null, hoverId = null, gearTimer = 0;
  const gearable = (id) => { const d = id && id !== posId ? manager.get(id) : null; return !!(d && !d.locked && panelFor(d.kind).length); };
  function placeGear() {
    const sel = [].concat(manager.selection()).filter((x) => x !== posId);
    const id = sel.length === 1 && gearable(sel[0]) ? sel[0] : gearable(hoverId) ? hoverId : null; // zaznaczony ma pierwszeństwo przed najechanym
    if (!id || manager.tool()) { if (!gearTimer || !id) { gear.hidden = !id ? gear.hidden : true; } if (!id) scheduleHide(); return; }
    clearTimeout(gearTimer); gearTimer = 0;
    const a = ctx.anchor?.(manager.get(id));
    if (!a) { gear.hidden = true; gearId = null; return; }
    gearId = id;
    gear.hidden = false;
    const W = plot.clientWidth, H = plot.clientHeight;
    gear.style.left = `${Math.max(4, Math.min(a.x + 6, W - 92))}px`;
    gear.style.top = `${Math.max(4, Math.min(a.y - 32, H - 60))}px`;
  }
  // po zejściu kursora z rysunku zębatka czeka chwilę, żeby dało się do niej dojechać
  function scheduleHide() {
    if (gear.hidden || gearTimer) return;
    gearTimer = setTimeout(() => { gearTimer = 0; if (gear.matches(':hover')) return; const sel = [].concat(manager.selection()).filter((x) => x !== posId); if (!(sel.length === 1 && gearable(sel[0]))) { gear.hidden = true; gearId = null; } else placeGear(); }, 700);
  }
  const onPlotMove = (ev) => {
    if (ev.buttons) return;
    hoverId = manager.hoveredId?.() ?? null;
    placeGear();
  };
  plot.addEventListener('pointermove', onPlotMove);
  stage.addEventListener('pointerleave', () => { hoverId = null; scheduleHide(); });
  gear.addEventListener('click', () => {
    if (!gearId || !manager.get(gearId)) return;
    openId = gearId;
    manager.select([gearId]);
    showPanel();
    panel.querySelector('input, select, button:not([data-act="pdock"]):not([data-act="pclose"])')?.focus({ preventScroll: true });
  });
  offs.push(() => plot.removeEventListener('pointermove', onPlotMove));

  // pola panelu zsynchronizowane z rysunkiem po przeciągnięciu (BE pozycji rysowanej)
  function syncStyleFields() {
    if (panel.dataset.mode !== 'style' || !panelId) return;
    const d = manager.get(panelId), el = panel.querySelector('[data-k="bePrice"]');
    if (d && el && document.activeElement !== el) el.value = positionPrices(d, tick)?.be ?? '';
  }
  function syncTradeFields() {
    if (!posUnlocked || panel.dataset.mode !== 'trade') return;
    const d = manager.get(posId);
    if (!d) return;
    posDraft = d;
    const pr = positionPrices(d, tick) || {};
    for (const k of ['entryPrice', 'exitPrice', 'sl', 'tp', 'be']) { const el = panel.querySelector(`[data-tk="${k}"]`); if (el && document.activeElement !== el) el.value = pr[k] ?? ''; }
    const df = panel.querySelector('.swc-tdiff');
    if (df) df.innerHTML = diffHtml(d);
    ctx.onTradeDraft?.(pr);
  }
  const numOf = (v) => { const s = String(v).trim().replace(/\s/g, '').replace(',', '.'); if (!s) return null; const n = Number(s); return Number.isFinite(n) && n > 0 ? n : NaN; };
  // Zmiana pola panelu → nowy styl rysunku (i zapamiętanie stylu narzędzia).
  function applyField(el) {
    const d = panelId && manager.get(panelId);
    if (!d) return;
    if (el.dataset.tk) {
      const v = numOf(el.value);
      el.toggleAttribute('aria-invalid', Number.isNaN(v));
      if (Number.isNaN(v)) return;
      if (v == null && el.dataset.tk !== 'be' && el.dataset.tk !== 'exitPrice') return; // puste wyjście i BE czyszczą pole trade'a
      manager.update(withPositionPrice(d, el.dataset.tk, v == null ? null : roundTick(v, tick)));
      return;
    }
    let st = { ...d.style }, next = { ...d };
    const k = el.dataset.k, lvk = el.closest('[data-lvkey]')?.dataset.lvkey;
    if (lvk && el.dataset.lv != null) {
      const val = el.dataset.lk === 'visible' ? el.checked : el.value;
      st[lvk] = editLevels(st[lvk], { set: Number(el.dataset.lv), field: el.dataset.lk, value: val });
      if (el.dataset.lk === 'coeff' || el.dataset.lk === 'visible') { next = { ...d, style: st }; manager.update(next); remember(next); showPanel(); return; }
    } else if (k === 'text') {
      // paczka czyta tekst prostokąta z rysunku (drawing.text), a linii ze stylu (style.text): zapisujemy w obu miejscach
      if (d.kind === 'text') { if (!el.value.trim()) return; next.text = el.value; } else { st.text = el.value; next.text = el.value; }
    } else if (k === 'fontSize' || k === 'width') st[k] = Number(el.value);
    else if (k === 'opacity') { st.transparency = 100 - Number(el.value); if (d.kind === 'gann-box') st.vertTransparency = st.transparency; const o = el.parentElement.querySelector('.swc-op'); if (o) o.textContent = `${el.value}%`; }
    else if (k === 'fillBackground') { st.fillBackground = el.checked; if (d.kind === 'gann-box') st.fillVertBackground = el.checked; }
    else if (k === 'gannLabels') { st.showLeftLabels = st.showTopLabels = el.checked; st.showRightLabels = st.showBottomLabels = false; }
    else if (k === 'midLine') {
      if (d.kind === 'gann-box') {
        for (const key of ['levels', 'vLevels']) {
          let l = Array.isArray(st[key]) ? st[key] : [];
          if (el.checked && !l.some((x) => x.coeff === 0.5)) l = editLevels(l, { add: 0.5, color: ctx.colors().fg2 });
          st[key] = l.map((x) => (x.coeff === 0.5 ? { ...x, visible: el.checked } : x));
        }
      } else {
        // prostokąt: linia połowy w kolorze obramowania; flaga fvg zostaje (FVG nie zamienia się w prostokąt i odwrotnie)
        st.rectMiddleLine = { color: st.color, width: 1, style: 'dashed', ...(st.rectMiddleLine || {}), visible: el.checked };
        if (st.fvg === undefined) st.fvg = toolKeyOf(d) === 'fvg';
      }
      next = { ...d, style: st }; manager.update(next); remember(next); showPanel(); return;
    } else if (k === 'beOn') {
      // domyślnie 1 punkt od wejścia w stronę zysku (jak BE w polu trade'a: wejście + 1 pkt); cenę zmienisz w polu obok albo przeciągając linię (decyzja gustu)
      if (el.checked) st.beLevel = 1; else delete st.beLevel;
      st.beOn = el.checked;
      next = { ...d, style: st }; manager.update(next); remember(next); showPanel(); return;
    } else if (k === 'bePrice') {
      const v = numOf(el.value);
      el.toggleAttribute('aria-invalid', !(v > 0));
      if (!(v > 0)) return;
      next = withPositionPrice(d, 'be', roundTick(v, tick)); manager.update(next); return;
    } else if (['showCoeffs', 'showPrices', 'fibLevelsAsPercents', 'reverse', 'showRR'].includes(k)) st[k] = el.checked;
    else if (k === 'color') { st.color = el.value; if (d.kind === 'rectangle' && st.rectMiddleLine) st.rectMiddleLine = { ...st.rectMiddleLine, color: el.value }; }
    else if (k) st[k] = el.value;
    next = { ...next, style: st };
    manager.update(next);
    remember(next);
  }
  const remember = (d) => { if (d.id !== posId) saveToolStyle(toolKeyOf(d), d.style); };
  panel.addEventListener('input', (ev) => { if (ev.target.matches('input[type="color"], input[type="range"], [data-k="text"]')) applyField(ev.target); });
  panel.addEventListener('change', (ev) => { if (!ev.target.matches('[data-k="text"]')) applyField(ev.target); });
  panel.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter' && ev.target.matches('input')) { ev.preventDefault(); applyField(ev.target); }
    else if (ev.key === 'Escape' && dock === 'pop' && panel.dataset.mode === 'style') { ev.preventDefault(); closePop(); plot.focus?.(); }
  });
  panel.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'pdock') { setDock(b.dataset.v); return; }
    if (b.dataset.act === 'pclose') { closePop(); return; }
    const d = panelId && manager.get(panelId);
    if (b.dataset.k && b.dataset.v != null && d) { // segment: wyrównanie, styl linii
      const st = { ...d.style, [b.dataset.k]: b.dataset.v };
      const next = { ...d, style: st };
      manager.update(next); remember(next);
      b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      return;
    }
    if ((b.dataset.lvadd || b.dataset.lvdel != null) && d) {
      const key = b.closest('[data-lvkey]').dataset.lvkey;
      const st = { ...d.style, [key]: editLevels(d.style[key], b.dataset.lvadd ? { add: null } : { remove: Number(b.dataset.lvdel) }) };
      const next = { ...d, style: st };
      manager.update(next); remember(next); showPanel();
      return;
    }
    if (b.dataset.act === 'tsave') await saveTradePosition(b);
    else if (b.dataset.act === 'tcancel') setLocked(true);
  });

  // ---- P27: kłódka pozycji trade'a ----
  function setLocked(lock) {
    if (!posId && !ctx.extra?.()) return;
    const cur = posId ? manager.get(posId) : null;
    restoring = true;
    try {
      if (posId) manager.remove(posId);
      posUnlocked = !lock;
      if (posUnlocked) posDraft = cur ? { ...cur, locked: false } : null; else { posDraft = null; ctx.onTradeDraft?.(null); }
      addExtra();
    } finally { restoring = false; }
    if (posUnlocked && posId) manager.select([posId]); else manager.select([]);
    syncBtns(); showPanel();
  }
  async function saveTradePosition(b) {
    const d = manager.get(posId), msg = panel.querySelector('.swc-tmsg');
    if (!d) return;
    const bad = [...panel.querySelectorAll('[data-tk]')].some((el) => el.hasAttribute('aria-invalid'));
    const plan = ctx.planTrade?.(d);
    if (bad || !plan || plan.error) { if (msg) msg.textContent = plan?.error || t('Popraw zaznaczone ceny: liczba większa od zera, np. 5842,25.'); return; }
    b.disabled = true;
    if (msg) msg.textContent = t('Zapisuję…');
    try {
      const r = await ctx.saveTrade(plan);
      if (!r?.ok) { if (msg) msg.textContent = r?.error || t('Nie udało się zapisać.'); return; }
      setLocked(true); // po zapisie pozycja wraca do blokady, już z nowych pól
      say(t('Zapisano pozycję w trade\'zie.'), 'ok');
    } finally { if (b.isConnected) b.disabled = false; }
  }

  // ---- uchwyty pozycji (paczka rysowania nie ma ceny wyjścia ani BE) ----
  // P28: kropka wyjścia odblokowanej pozycji trade'a: cena wyjścia (tick instrumentu) i czas wyjścia (świeca pod kursorem, nie przed wejściem).
  // P29 (28.10.2026), słowa użytkownika: «nie da sie przesunac myszka poziomu be a powinno sie dac i to tak samo automatycznie zapisuje jego miejsce»:
  // linia BE pozycji (trade'a po odblokowaniu i każdej rysowanej) przeciągana w pionie; trade: pole BE w panelu i zapis „Zapisz w trade'zie” jak SL/TP,
  // pozycja rysowana: zapis rysunków jak każda zmiana. Przechwytujemy pointerdown w fazie capture na polu wykresu, zanim dostanie go paczka i LWC;
  // wykres nie przesuwa się w trakcie (ctx.hold).
  const plotXY = (ev) => { const r = plot.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  function handleAt(ev) {
    const q = plotXY(ev);
    if (posUnlocked && posId && ctx.exitPoint) {
      const d = manager.get(posId), p = d && ctx.exitPoint(d);
      if (p && Math.hypot(q.x - p.x, q.y - p.y) <= 9) return { kind: 'exit', id: posId };
    }
    if (!ctx.beLine) return null;
    for (const d of manager.drawings()) {
      if ((d.kind !== 'long-position' && d.kind !== 'short-position') || d.hidden) continue;
      if (d.id === posId ? !posUnlocked : d.locked) continue;
      const l = ctx.beLine(d);
      if (l && Math.abs(q.y - l.y) <= 5 && q.x >= Math.min(l.x1, l.x2) - 2 && q.x <= Math.max(l.x1, l.x2) + 2) return { kind: 'be', id: d.id };
    }
    return null;
  }
  const onHandleDown = (ev) => {
    if (ev.button !== 0) return;
    const h = handleAt(ev);
    if (!h) return;
    ev.stopPropagation(); ev.preventDefault();
    ctx.hold?.(true);
    const move = (e) => {
      const d = manager.get(h.id), q = d && ctx.pointAt?.(plotXY(e));
      if (!q || !Number.isFinite(q.price)) return;
      if (h.kind === 'be') { manager.update(withPositionPrice(d, 'be', roundTick(q.price, tick))); return; }
      let next = withPositionPrice(d, 'exitPrice', roundTick(q.price, tick));
      if (Number.isFinite(q.time) && next.points?.length === 2) next = { ...next, points: [next.points[0], { ...next.points[1], time: Math.max(q.time, next.points[0].time) }] };
      manager.update(next);
    };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); ctx.hold?.(false); snap(); syncStyleFields(); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  };
  const onHandleHover = (ev) => { if (!ev.buttons) { const h = handleAt(ev); plot.dataset.exitHover = h ? (h.kind === 'exit' ? '1' : 'be') : ''; } };
  plot.addEventListener('pointerdown', onHandleDown, true);
  plot.addEventListener('pointermove', onHandleHover);
  offs.push(() => { plot.removeEventListener('pointerdown', onHandleDown, true); plot.removeEventListener('pointermove', onHandleHover); });

  bar.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.tool) pick(b.dataset.tool);
    else if (b.dataset.act === 'undo') undo();
    else if (b.dataset.act === 'del') remove();
    else if (b.dataset.act === 'clear') clearAll();
    else if (b.dataset.act === 'lock') setLocked(posUnlocked);
  });
  plot.addEventListener('pointerup', () => setTimeout(() => { syncBtns(); placeGear(); if (dock === 'pin' && panel.dataset.mode !== 'trade') showPanel(); }, 0));

  // Esc zdejmuje narzędzie albo zaznaczenie zamiast zamykać okno; Ctrl+Z cofa; strzałki nie przełączają trade'a, gdy wykres jest widoczny.
  const onKey = (ev) => {
    const el = ev.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    if (!plot.getClientRects().length) return;
    const stop = () => { ev.stopPropagation(); ev.preventDefault(); };
    if (ev.key === 'Escape' && dock === 'pop' && !panel.hidden && panel.dataset.mode === 'style') { closePop(); stop(); return; }
    if (ev.key === 'Escape') {
      if (manager.tool() || [].concat(manager.selection()).length) { manager.setTool(null); manager.select([]); active = null; fvg.on = false; paintTools(); syncBtns(); showPanel(); stop(); }
    } else if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z') { undo(); stop(); }
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') ev.stopPropagation();
  };
  window.addEventListener('keydown', onKey, true);
  showPanel(); // P32: panel (także przypięty) otwiera dopiero zębatka; na starcie widoczny tylko panel odblokowanej pozycji
  const onHide = () => { saver.flush(); };
  window.addEventListener('pagehide', onHide);

  return {
    manager,
    currentDoc: buildDoc,
    flush: () => saver.flush(),
    status: () => lastStatus,
    failed: () => saver.failed(), // ostatni zapis rysunków się nie udał, stan czeka w kolejce (W3)
    error: () => lastError,
    clearAll,
    setLocked,
    unlocked: () => posUnlocked,
    positionId: () => posId,
    // wykres.js po zapisie trade'a (nowe pola) odświeża zablokowaną pozycję
    relayout: () => placeGear(), // P29: zębatka idzie za rysunkiem przy przesuwaniu i skalowaniu wykresu
    dock: () => dock,
    setDock,
    refreshExtra() { if (posUnlocked) return; restoring = true; try { if (posId) manager.remove(posId); addExtra(); } finally { restoring = false; } syncBtns(); },
    async destroy() {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pagehide', onHide);
      clearTimeout(snapTimer);
      await saver.flush();
      offs.forEach((f) => { try { f(); } catch { /* już zdjęte */ } });
      try { manager.destroy(); } catch { /* wykres już usunięty */ }
    },
  };
}
