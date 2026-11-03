// Wykres replayu modułu Backtest (1.5.0, pakiet C1): własny gospodarz Lightweight Charts, bez createEditor z wykres.js (bierze tylko funkcje pomocnicze).
// Dane płyną wyłącznie aktualizacjami z createBuilder (bt-swieca.js): 'reset' → series.setData, 'update' i 'append' → series.update po kolei, więc krok kosztuje
// jedną albo dwie świece, a nie przelanie całej serii. Nakładki sesji i PDH/PDL (overlayPrimitive) i newsy (newsPrimitive) liczą się tylko ze świec widocznych
// i tylko przy nowej świecy (przy aktualizacji bieżącej model zostaje z pamięci). Newsy: plan dnia bez wyników (visibleNews z bt-czas.js podaje replay).
// Ukryta data (sesja losowa): oś czasu i etykieta krzyżyka pokazują same godziny.
// C2: warstwa handlu. 1.7-1: otwarta pozycja to LINIE (wejście, SL, TP) i plakietki po prawej przy osi; rysunek long/short-position z paczki rysowania (D) jest tylko zablokowanym tłem stref.
// Zlecenia oczekujące to linie ceny (limit/stop) z plakietkami w tym samym marginesie.
// D1: rysunki (rysunki.js, paczka rysowania) na każdym wykresie: opcja `rysunki` = { bar, panel, stage, gear, foot, doc, saveDoc, isActive, onChange, confirm }. Pozycja jest rysunkiem
// pomocniczym rysunki.js (`extra`, nie wchodzi do zapisu rysunków), w 1.7-1 jest zablokowana (SL i TP przesuwa się liniami i plakietkami, zmiany idą przez onTradeAction). Linia czasu wspólnego krzyżyka (setCursorLine) stoi na
// świecy zawierającej czas, więc działa między wykresami o różnych interwałach.
// K (31.10.2026): [U] «powinines miec pelna przeszlosc tak daleko jak siega historia w danym momencie». Wykres = historia (świece interwału sprzed początku okna bazowego,
// z serwera, doładowywane porcjami przy przewinięciu w lewo przez subscribeVisibleLogicalRangeChange, aż do początku danych) + świece z createBuilder (okno do kursora).
// Historia leży w całości przed oknem bazowym (granica na otwarciu sesji), więc nie ma w niej przyszłości. Nakładki sesji i PDH/PDL liczone z ogona świec
// (OV_TAIL świec albo od widocznego początku), żeby lata historii nie spowalniały kroku.
// English: replay chart host: incremental series updates, overlays recomputed only on a new candle, optional hidden date, trading layer (position drawing + order lines).
import { themeOptions, candleOptions, overlayPrimitive, newsPrimitive, positionDrawing, extrasPrimitive, probe, readColors } from './wykres.js';
import { positionPrices, tickOf, createRysunki } from './rysunki.js';
import * as G from './geometria.js';
import { loadOverlays, sessionDefs, chartTz, fmtIn, tfSec } from './podglad.js';
import { tzShort } from './strefa.js';
import { sessionWindows, pdhlSpans, overlayLevels, parseTf } from './swiece.js';
import { buildNewsModel } from './newsy.js';
import { locale, t } from './i18n.js';
import { fmtR, esc } from './format.js';
import { MULT, TICK, beLevel, TPS_MAX } from './bt-wypelnienia.js';
import { ladderApply } from './bt-drabinka.js';
import { partialPlan } from './bt-konto.js';

// Offset SL względem BE w tickach, gdy pozycja stała się bez ryzyka (beAt): 1 do 20 ticków za BE to nadal „BE +Nt”, 21 i więcej to zwykły SL (granica = maksymalny offset auto BE, 20t)
export function beOffsetTicks(p, px = p.sl) {
  if (px == null || p.beAt == null || !Number.isFinite(p.avg)) return null;
  const n = Math.round((px - beLevel(p)) * (p.dir === 'Short' ? -1 : 1) / TICK);
  return n >= 1 && n <= 20 ? n : null;
}

const toBar = (k) => ({ time: k[0], open: k[1], high: k[2], low: k[3], close: k[4] });
const stat = (k) => { const s = globalThis.__btStats; if (s) s[k] = (s[k] || 0) + 1; }; // licznik dla strony testowej (testy/backtest-replay.html)
// K: nakładki z ostatnich tylu świec (albo od widocznego początku wykresu, gdy jest dalej w lewo)
const OV_TAIL = 3000;
// K: doładuj historię, gdy z lewej zostało mniej niż tyle świec
const HIST_EDGE = 40;

// opts: { LWC, D (paczka rysowania, opcjonalna: bez niej brak rysunku pozycji), instrument, tf, colors, onCrosshair, hideDate, daily: Bar[] (sesje dzienne sprzed dnia replayu, do PDH/PDL), getNews: () => Event[] }
// K: getHistory(before) → Promise<{ bars, daily, from, done }> (porcja historii interwału przed chwilą `before`), historyEnd() = początek okna bazowego,
// getDaily() = świece 1D sesji zamkniętych w oknie bazowym przed kursorem (PDH/PDL), onHistory(n) = ile świec historii doszło (testy, pomiar).
// L (31.10.2026): plOf(position) → { pts, usd, r } (otwarty wynik liczy replay z ceną bieżącą i prowizją), onTradeAction({ kind: 'pct', pct } | { kind: 'cancel', id } |
// { kind: 'move', id, changes }) → akcje z warstwy handlu (etykieta pozycji z X i procentami, przeciągane zlecenia oczekujące z SL/TP), fmtUsd(x) → kwota.
export function createReplayChart(host, { LWC, D = null, instrument = '', tf = '1m', colors, onCrosshair = () => {}, hideDate = false, daily = [], getNews = () => [], autoScale = true, onAutoChange = () => {}, rysunki = null, getHistory = null, historyEnd = () => null, getDaily = () => [], onHistory = () => {}, plOf = null, onTradeAction = null, fmtUsd: fmtUsdIn = (x) => String(x), onZoneHint = null, getMenu = null, onMenuPick = () => {}, onMenuState = () => {} } = {}) {
  // odbiór wyglądu 1.7.0 P2-5: kwoty na plakietkach i w odczytach wykresu są w pełnych dolarach (wcześniej plakietki TP po dokładce miały grosze)
  const fmtUsd = (x) => fmtUsdIn(Number.isFinite(x) ? Math.round(x) || 0 : x);
  if (!LWC) throw new Error('bt-wykres: brak modułu Lightweight Charts');
  let c = colors;
  let candles = [], hide = !!hideDate, step = tfSec(tf), secs = (parseTf(tf)?.sec ?? 60) < 60, cursorT = null;
  let ovModel = null, newsModel = null; // pamięć modeli nakładek: unieważniana przy nowej świecy, resecie i zmianie TF
  // K: historia sprzed okna bazowego; hFrom = początek wczytanej historii (otwarcie sesji), hDone = doszła do początku danych
  let hist = [], hFrom = null, hDone = !getHistory, hBusy = false, hDaily = [], hGen = 0, ovK0 = 0;
  // K: świece w formacie paczki rysowania, utrzymywane przyrostowo (put dopisuje albo podmienia ostatnią, setData buduje od nowa); paczka czyta je przy każdym rysowaniu
  let pkg = [];
  const pkgOf = (k) => ({ time: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5] });
  const pkgAll = () => { pkg = candles.map(pkgOf); };
  const prefs = loadOverlays();
  const priceFmt = new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt = () => fmtIn(chartTz());
  const timeOpts = () => ({
    timeScale: {
      timeVisible: true, secondsVisible: secs,
      tickMarkFormatter: (time, type) => {
        const d = new Date(time * 1000), f = fmt();
        if (hide || type >= 3) return (type === 4 || secs ? f.HMS : f.HM).format(d);
        return type === 0 ? f.YEAR.format(d) : type === 1 ? f.MONTH.format(d) : f.DAY.format(d);
      },
    },
    localization: { timeFormatter: (time) => { const d = new Date(time * 1000), f = fmt(); return (hide ? (secs ? f.HMS : f.HM).format(d) : f.FULL.format(d) + (secs ? ':' + String(d.getUTCSeconds()).padStart(2, '0') : '')) + '\u00a0' + tzShort(chartTz(), time * 1000); }, priceFormatter: (p) => priceFmt.format(Math.round(p / tick) * tick) },
  });
  const th = themeOptions(c);
  const chart = LWC.createChart(host, {
    autoSize: true, ...th,
    // runda 2 (P2-3 wyglądu): linia kursora stoi na kursorze, nie na zamknięciu świecy (magnes), więc cena z menu prawego kliku jest ceną tej linii
    crosshair: { ...th.crosshair, mode: LWC.CrosshairMode?.Normal ?? 0 },
    rightPriceScale: { ...th.rightPriceScale, autoScale: true },
    timeScale: { ...th.timeScale, ...timeOpts().timeScale, rightOffset: 6, shiftVisibleRangeOnNewBar: true },
    localization: timeOpts().localization,
  });
  const series = chart.addSeries(LWC.CandlestickSeries, { ...candleOptions(c), lastValueVisible: true, priceLineVisible: false });
  // 1.7-2 (G-2.6): markery porcji otwartej pozycji na świecach: strzałka wejścia i dokładki (+ilość) oraz wyjścia częściowego (−ilość), w kolorze kierunku pozycji.
  // Przebudowa tylko przy zmianie liczby porcji i wyjść, interwału albo przeładowaniu świec (nie co klatkę odtwarzania).
  const posMarkers = LWC.createSeriesMarkers ? LWC.createSeriesMarkers(series, []) : null;
  let mkSig = '', marksNow = [];

  // świeca zawierająca czas t (początek ≤ t < początek + krok); null przed pierwszą świecą i w przyszłości (za ostatnią widoczną)
  function barAt(t) {
    let lo = 0, hi = candles.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (candles[m][0] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
    return r >= 0 && t < candles[r][0] + step ? candles[r][0] : null;
  }
  // nakładki: model z widocznych świec; PDH/PDL z sesji dziennych sprzed dnia (pełne, bo leżą przed kursorem)
  const dailyAll = () => {
    const m = new Map();
    for (const k of [...(daily || []), ...hDaily, ...(getDaily() || [])]) m.set(k[0], k);
    return [...m.values()].sort((a, b) => a[0] - b[0]);
  };
  const overlayModel = () => {
    if (ovModel) return ovModel;
    if (!candles.length) return (ovModel = { boxes: [], lines: [] });
    // K: model z ogona świec (przesunięcie indeksów o k0), żeby lata historii nie liczyły się przy każdej nowej świecy
    const vis = (() => { try { return chart.timeScale().getVisibleLogicalRange(); } catch { return null; } })();
    const k0 = Math.max(0, Math.min(candles.length - OV_TAIL, Math.floor((vis?.from ?? candles.length) - 300)));
    ovK0 = k0;
    const tail = k0 ? candles.slice(k0) : candles;
    const times = tail.map((k) => k[0]);
    const windows = prefs.sessions ? sessionWindows(times[0], times[times.length - 1] + 1, sessionDefs(prefs)) : [];
    const pd = prefs.pdhl ? pdhlSpans(times, dailyAll()) : [];
    const m = overlayLevels(tail, { windows, pd, sweep: prefs.sweep });
    if (k0) {
      for (const b of m.boxes) { b.a += k0; b.b += k0; }
      for (const l of m.lines) { l.x0 += k0; l.x1 += k0; if (l.sweep >= 0) l.sweep += k0; }
    }
    return (ovModel = m);
  };
  // etykiety dni newsów niosą datę: przy ukrytej dacie znikają (linie i znaczniki zostają)
  const newsOf = () => (newsModel ||= ((m) => (hide ? { ...m, labels: [] } : m))(buildNewsModel({ news: getNews(), earn: [], prefs })));
  const prim = overlayPrimitive({ chart, series, getModel: overlayModel, getPrefs: () => prefs, getCandles: () => candles, getColors: () => c });
  const nprim = newsPrimitive({ chart, series, getModel: newsOf, getCandles: () => candles, getStep: () => step, getColors: () => c });
  // linia kursora (D1: wspólny zegar kilku wykresów); w C1 jeden wykres, linia tylko na żądanie
  const cursorPrim = {
    req: null,
    attached(p) { this.req = p.requestUpdate; }, detached() { this.req = null; }, updateAllViews() {},
    paneViews: () => [{ zOrder: () => 'top', renderer: () => ({ draw: (target) => target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, bitmapSize }) => {
      if (cursorT == null) return;
      const at = barAt(cursorT);
      const x = at == null ? null : chart.timeScale().timeToCoordinate(at);
      if (x == null) return;
      ctx.save(); ctx.strokeStyle = c.cross; ctx.lineWidth = Math.max(1, Math.round(hr)); ctx.setLineDash([4 * hr, 4 * hr]);
      ctx.beginPath(); ctx.moveTo(Math.round(x * hr) + 0.5, 0); ctx.lineTo(Math.round(x * hr) + 0.5, bitmapSize.height); ctx.stroke(); ctx.restore();
    }) }) }],
  };
  series.attachPrimitive(prim);
  series.attachPrimitive(nprim);
  series.attachPrimitive(cursorPrim);
  // D1: dodatki rysunków (podpisy, R:R) i kursor tekstu; rysunki.js trzyma model w DrawingManager
  let rys = null;
  // J: podpisy pozycji jak TV (zaznaczona albo najechana pozycja, „zawsze pokazuj”) z ilością i kwotami z konta i ryzyka rysunku; świece tylko widoczne (brak przyszłości)
  const extras = D ? extrasPrimitive({ chart, series, getDrawings: () => rys?.manager.drawings() || [], getCandles: () => candles, getStep: () => step, getColors: () => c,
    getFocus: () => rys?.focusIds?.() || new Set(), getInstrument: () => instrument }) : null;
  if (extras) series.attachPrimitive(extras);
  chart.subscribeCrosshairMove((p) => onCrosshair(p?.time ?? null));
  // K: przewinięcie w lewo doładowuje historię; nakładki przeliczają się, gdy widok wyjdzie przed ich ogon
  chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
    if (!r) return;
    if (r.from < HIST_EDGE) loadHistory();
    if (ovK0 > 0 && r.from < ovK0 + 100) { ovModel = null; prim.requestUpdate(); }
  });

  // ---- C2: handel na wykresie ----
  const tick = tickOf(instrument);
  let mgr = null, posId = null, applying = false, lines = [], want = null, wantPos = null;
  if (D && rysunki) {
    // D1: rysunki.js tworzy DrawingManager; pozycja replayu to jego rysunek pomocniczy (extra), poza zapisem rysunków
    rys = createRysunki({
      D, chart, series, plot: host, bar: rysunki.bar, panel: rysunki.panel, stage: rysunki.stage, gear: rysunki.gear, foot: rysunki.foot,
      beLine: (d) => extras.beLine(d), textSlot: (d) => extras.textSlot(d), exitPoint: (d) => extras.exitPoint(d),
      anchor: (d) => {
        const pts = d?.points || [];
        if (!pts.length) return null;
        let x = -Infinity, y = Infinity;
        const dir = d.kind === 'short-position' ? -1 : 1, st = d.style || {};
        const prices = pts.map((p) => p.price);
        if (d.kind === 'long-position' || d.kind === 'short-position') prices.push(pts[0].price + dir * (st.profitLevel || 0), pts[0].price - dir * (st.stopLevel || 0));
        for (const p of pts) { const i = G.timeToIndexF(candles, p.time, step), xx = i == null ? null : chart.timeScale().logicalToCoordinate(i); if (xx != null) x = Math.max(x, xx); }
        for (const p of prices) { const yy = series.priceToCoordinate(p); if (yy != null) y = Math.min(y, yy); }
        if (d.kind === 'horizontal-line') x = chart.timeScale().width() - 40;
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
      },
      pointAt: ({ x, y }) => {
        const price = series.coordinateToPrice(y), li = chart.timeScale().coordinateToLogical(x);
        return { price, time: li == null ? null : G.indexToTime(candles, Math.round(li), step) };
      },
      hold: (on) => holdScale(on),
      toHex: (v) => { const p = probe(v); const m = /^rgba\((\d+), (\d+), (\d+)/.exec(p); return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : p; },
      colors: () => c, instrument, tradeId: null, doc: rysunki.doc || null, bars: () => pkg, confirm: rysunki.confirm, saveDoc: rysunki.saveDoc, isActive: rysunki.isActive,
      extra: () => wantPos,
      onChange: () => { extras.requestUpdate(); rysunki.onChange?.(); },
      // J: odświeżenie podpisów, zaznaczenie (przycisk „Wejdź według rysunku”), konto i ryzyko nowej pozycji z sesji
      repaint: () => extras.requestUpdate(), onSelect: () => rysunki.onSelect?.(), positionDefaults: rysunki.positionDefaults, sessionQty: rysunki.sessionQty,
    });
    mgr = rys.manager;
    series.detachPrimitive(extras); series.attachPrimitive(extras); // J: podpisy pozycji nad warstwą paczki
  } else if (D) {
    mgr = new D.DrawingManager(chart, series, {});
  }
  let held = null;
  // tymczasowe wyłączenie przesuwania i autoskalowania na czas przeciągania rysunku; wraca poprzedni stan (auto nie zawsze true)
  function holdScale(on) {
    const p = series.priceScale();
    if (on && !held) {
      const o = chart.options();
      held = { opts: { handleScroll: structuredClone(o.handleScroll), handleScale: structuredClone(o.handleScale) }, auto: p.options().autoScale };
      chart.applyOptions({ handleScroll: false, handleScale: false });
      if (held.auto) p.applyOptions({ autoScale: false });
    } else if (!on && held) { chart.applyOptions(held.opts); if (held.auto) p.applyOptions({ autoScale: true }); held = null; }
  }
  // [U] 1.11.2026 «nie ma do wybrania auto trybu w backtest, jest wlaczone i nie da sie go ywlaczyc»: stan autoskalowania osi ceny jest wykresu, nie kroku. Przeciągnięcie osi go wyłącza (LWC),
  // dwuklik na osi włącza; kroki, skoki i doładowanie historii go nie ruszają. Tymczasowe wyłączenie przy przeciąganiu rysunków (hold) przywraca stan sprzed.
  let autoY = autoScale !== false, autoInit = autoY;
  const ps = () => series.priceScale();
  const setAuto = (on) => { on = !!on; ps().applyOptions({ autoScale: on }); if (autoY !== on) { autoY = on; onAutoChange(on); } setTimeout(() => relayout(), 80); };
  const syncAuto = () => { if (held) return; const a = ps().options().autoScale !== false; if (a !== autoY) { autoY = a; onAutoChange(a); } };
  host.addEventListener('pointerup', () => setTimeout(syncAuto, 0));
  host.addEventListener('dblclick', () => { setTimeout(syncAuto, 0); setTimeout(() => relayout(), 120); });
  // H2 (30.10.2026): motyw na żywo w replayu: tło, siatka, świece, nakładki i rysunki z kolorem domyślnym (wcześniej kolory czytane raz przy otwarciu ekranu)
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(() => {
    const next = readColors(host);
    if (['fg', 'fg2', 'up', 'down', 'profit', 'loss', 'be', 'bg', 'grid'].every((k) => next[k] === c[k])) return;
    c = next;
    const t2 = themeOptions(c);
    chart.applyOptions({ layout: t2.layout, grid: t2.grid, crosshair: t2.crosshair, rightPriceScale: t2.rightPriceScale });
    series.applyOptions(candleOptions(c));
    prim.requestUpdate(); nprim.requestUpdate(); extras?.requestUpdate(); cursorPrim.req?.();
    rys?.retheme();
    // L: linie zleceń w kolorach nowego motywu
    linesSig = ''; posSig = ''; layerSig = ''; if (want) applyTrading(want);
  }) : null;
  mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
  // ---- 1.7-1: pozycja i zlecenia na wykresie ----
  // [U] 1.11.2026 «Rekomendowana opcja, plus te kwadraty oraz znaczniki – chodzi o take profit, który jest pozycją, w której wpisuję aktualny profit, PNL. To znaczy, że będą one po prawej, a nie po lewej.»
  // Pozycję obsługują LINIE jak w FX Replay (wejście ciągła, SL i TP kreskowane, znaczniki osi), a plakietki („kwadraty”) stoją PO PRAWEJ, przy osi ceny, w zarezerwowanym marginesie za ostatnią
  // świecą (rightOffset liczony z szerokości plakietek), więc nie zasłaniają świec. SL i TP przeciąga się plakietką albo samą linią (odczyt $, pkt i R na żywo), przyciski +SL, +TP, BE i ×
  // pokazują się pod plakietką wejścia po najechaniu, fokusie albo stuknięciu. Rysunek pozycji (strefy) jest zablokowany i idzie za liniami. Zmiany wracają przez onTradeAction
  // ({ kind: 'level' | 'rmLevel' | 'be' | 'part' | 'cancel' | 'move' }); chart nie zna silnika.
  const curPosId = () => (rys ? rys.positionId() : posId);
  const candleAtOrBefore = (t) => { for (let i = candles.length - 1; i >= 0; i--) if (candles[i][0] <= t) return candles[i][0]; return candles.length ? candles[0][0] : t; };
  // na wąskim wykresie znaczniki osi bez tytułów (LONG, SL, LMT): plakietka obok osi pełni tę rolę
  const narrowNow = () => (host.clientWidth || 0) > 0 && host.clientWidth < 640;
  // L: linie zleceń (cena, SL, TP) przebudowywane tylko przy zmianie zleceń (wcześniej przy każdej klatce odtwarzania)
  let linesSig = '';
  function orderLines(orders) {
    const sig = JSON.stringify(orders.map((o) => [o.id, o.price, o.sl, o.tp, (o.tps || []).map((x) => [x.id, x.price, x.pct, x.qty]), o.side, o.title]));
    if (sig === linesSig) return;
    linesSig = sig;
    for (const l of lines) { try { series.removePriceLine(l.line); } catch { /* już usunięta */ } }
    lines = [];
    for (const o of orders) {
      lines.push({ id: o.id, field: 'price', price: o.price, title: o.title, line: series.createPriceLine({ price: o.price, color: o.side === 'buy' ? c.profit : c.loss, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' }) });
      if (o.sl != null) lines.push({ id: o.id, field: 'sl', price: o.sl, title: 'SL', line: series.createPriceLine({ price: o.sl, color: c.loss, lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: '' }) });
      // 1.7-5: zlecenie z drabiną (≥ 2 poziomy) ma linię na każdym poziomie (pole tp-<id>); z jednym poziomem zostaje pole tp
      if (o.tps && o.tps.length > 1) { for (const lv of o.tps) lines.push({ id: o.id, field: `tp-${lv.id}`, price: lv.price, title: 'TP', line: series.createPriceLine({ price: lv.price, color: c.profit, lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: '' }) }); }
      else if (o.tp != null) lines.push({ id: o.id, field: 'tp', price: o.tp, title: 'TP', line: series.createPriceLine({ price: o.tp, color: c.profit, lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: '' }) });
    }
  }
  // [U] 2.11.2026 «Sama cena (Recommended)»: znaczniki osi ceny pokazują samą cenę (bez tytułów LONG/SL/TP), nazwa jest na plakietce obok, jak w TradingView; przy kolizji poziomów
  // plakietkę z linią łączy kreska (.bt-lead w placeLayer).
  // linie otwartej pozycji: wejście ciągła, SL (na BE kolor --be) i TP kreskowane; znaczniki osi z ceną i tytułem. Podczas przeciągania cena linii zmienia się przez applyOptions (bez przebudowy).
  let posSig = '', posLines = [], posRef = {};
  function positionLines(p) {
    const sig = p ? JSON.stringify([p.id, p.dir, p.entryPrice, p.sl, tpOpen(p).map((x) => [x.id, x.price]), p.be, p.abePrice, p.beAt, narrowNow()]) : '';
    if (sig === posSig) return;
    posSig = sig;
    for (const l of posLines) { try { series.removePriceLine(l); } catch { /* już usunięta */ } }
    posLines = []; posRef = {};
    if (!p) return;
    const short = p.dir === 'Short', nt = narrowNow();
    posRef.entry = series.createPriceLine({ price: p.entryPrice, color: short ? c.loss : c.profit, lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: '' });
    if (p.sl != null) posRef.sl = series.createPriceLine({ price: p.sl, color: isBeSl(p) ? c.be : c.loss, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
    for (const lv of tpOpen(p)) posRef[`tp:${lv.id}`] = series.createPriceLine({ price: lv.price, color: c.profit, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
    // próg auto-BE: tylko znacznik osi z ceną (kolor --be); linia na szerokości pozycji z podpisem „BE” należy do strefy pozycji (syncZones)
    if (p.abePrice != null) posRef.abe = series.createPriceLine({ price: p.abePrice, color: c.be, lineWidth: 1, lineStyle: 2, lineVisible: false, axisLabelVisible: true, title: '' });
    posLines = Object.values(posRef);
  }

  // ---- warstwa DOM: plakietki ----
  const layer = document.createElement('div');
  layer.className = 'bt-tl';
  host.appendChild(layer);
  const leads = new Map(), axTags = new Map();
  let layerSt = null, drag = null, hand = null, partUi = null, layerRaf = 0, layerSig = '', flashKey = null;
  let hoverActs = false, focusActs = false, pinActs = false;
  const yOf = (p) => { try { const y = series.priceToCoordinate(p); return y == null ? null : y; } catch { return null; } };
  const axisW = () => { try { return series.priceScale().width() || 0; } catch { return 0; } };
  const paneH = () => { let axisH = 0; try { axisH = chart.timeScale().height() || 0; } catch { axisH = 0; } return Math.max(0, (host.clientHeight || 0) - axisH); };
  const cls = (x) => (x > 1e-9 ? 'pos' : x < -1e-9 ? 'neg' : '');
  const pf = (p) => priceFmt.format(p);
  const snap = (p) => Math.round(p / tick) * tick;
  const sg = (p) => (p.dir === 'Short' ? -1 : 1);
  const sgnTxt = (x) => (x > 1e-9 ? '+' : x < -1e-9 ? '−' : '');
  const ptsTxt = (x) => `${sgnTxt(x)}${pf(Math.abs(x))} ${t('pkt')}`;
  const btn = (tl, text, extra = '') => `<button type="button" class="bt-tag-b" data-tl="${tl}"${extra}>${text}</button>`;
  // 1.7-3: trzeci poziom pozycji obok SL i TP: próg auto-BE (pole 'abe', cena w p.abePrice, plakietka 'pbe'). [U] 2.11.2026 «chodzi o to zeby bylo mozliwe dodania takiego miejsca na pozycji gdzie stanie sie nastepujaca czynnosc»
  // 1.7-5: poziomy TP drabiny mają klucze plakietek ptp (TP1), ptp2…ptp4 (numer = miejsce w drabinie, poziomy trafione liczą się do numeracji); id poziomu jest w data-id plakietki.
  // Pozycja bez planu (starsi wywołujący) ma jeden poziom z p.tp.
  // odbiór wyglądu 1.7.0 P2-4: poziom drabiny, któremu nic nie zostało (np. 1 kontrakt na 3 poziomy), nie ma linii, plakietki ani znacznika osi; zostaje w liście TP (szuflada, Journal) i w podpowiedzi plakietki wejścia
  const tpIdle = (p) => (p?.tpPlan && p.tpPlan.length > 1 ? p.tpPlan.filter((x) => !x.hit && x.qty === 0) : []);
  const tpOpen = (p) => (p?.tpPlan ? p.tpPlan.filter((x) => !x.hit && !(x.qty === 0 && p.tpPlan.length > 1)) : p?.tp != null ? [{ id: 'tp1', rank: 1, price: p.tp, pct: 100, qty: p.openQty, last: true, hit: null }] : []);
  const tpTotal = (p) => (p?.tps ? p.tps.length : p?.tp != null ? 1 : 0);
  const tpKey = (rank) => (rank <= 1 ? 'ptp' : `ptp${rank}`);
  const isTpKey = (k) => /^ptp[2-4]?$/.test(k || '');
  const KEY_OF = { sl: 'psl', abe: 'pbe' }, FIELD_OF = { psl: 'sl', pbe: 'abe' };
  const levelOf = (p, f, id = null) => (f === 'sl' ? p.sl : f === 'tp' ? tpOpen(p).find((x) => x.id === id)?.price : p.abePrice);
  // pole poziomu zlecenia oczekującego: price, sl, tp (jeden poziom) albo tp-<id> (drabina)
  const orderLevel = (o, f) => (f.startsWith('tp-') ? (o.tps || []).find((x) => x.id === f.slice(3))?.price : o[f]);
  const orderMoveChanges = (o, f, price) => (f.startsWith('tp-') ? { tps: ladderApply(o.side === 'buy' ? 'Long' : 'Short', o.tps || [], { t: 'price', id: f.slice(3), price }) } : { [f]: price });
  const tagHtml = (key, text, extra = '', cl = '', attrs = '') => `<div class="bt-tag ${cl}" data-k="${esc(key)}"${attrs}><span class="bt-tag-t">${text}</span>${extra}</div>`;

  // liczby poziomu SL/TP przy cenie px dla otwartej ilości: punkty (ze znakiem zysku), $ brutto (bez prowizji) i R od jednostki pozycji (przy pierwszym SL od przeciąganego poziomu, P5)
  function lvInfo(p, field, px, qty = p.openQty) {
    const s = sg(p), m = MULT[p.instrument] || 0;
    const pts = (px - p.avg) * s, usd = pts * m * qty;
    const ru = p.rUsd > 0 ? p.rUsd : (field === 'sl' && p.sl0 == null ? Math.abs(p.avg - px) * m * p.qty : null);
    return { pts, usd, r: ru > 0 ? usd / ru : null };
  }
  function entryTexts(p, narrow) {
    const pl = plOf ? plOf(p) : null, dir = p.dir === 'Short' ? 'SHORT' : 'LONG';
    if (!pl) return { text: `${dir} ${p.openQty}`, cl: '', title: '' };
    const rTxt = pl.r == null ? t('R —') : fmtR(pl.r);
    const text = narrow ? `${dir} ${pl.r == null ? fmtUsd(pl.usd) : fmtR(pl.r)}` : `${dir} ${p.openQty} · ${fmtUsd(pl.usd)} · ${rTxt}`;
    const idle = tpIdle(p).map((x) => `TP${x.rank}`);
    const title = `${dir} ${p.openQty}/${p.qty} @ ${pf(p.entryPrice)} · ${fmtUsd(pl.usd)} · ${ptsTxt(pl.pts)} · ${rTxt}${p.rUsd === 0 ? ` · ${t('ryzyko pierwotne 0')}` : ''}${idle.length ? ` · ${t('bez ilości (za mało kontraktów): {list}', { list: idle.join(', ') })}` : ''}`;
    return { text, cl: cls(pl.usd), title };
  }
  // R2-P2-3 (runda 3): SL o 1–20 ticków za BE w pozycji, która stała się bez ryzyka (beAt), np. po wyzwoleniu auto-BE z offsetem, to nadal „BE”, z dopiskiem offsetu (`BE +2t`);
  // zwykły SL w zysku, ustawiony przed beAt albo poza tym przedziałem, zostaje „SL”.
  const beOffTicks = (p, px = p.sl) => beOffsetTicks(p, px);
  function isBeSl(p, px = p.sl) { return px === p.sl && (!!p.be || beOffTicks(p, px) != null); }
  function levelText(p, field, px, narrow) {
    const lab = field === 'tp' ? 'TP' : isBeSl(p, px) ? 'BE' : 'SL';
    const v = lvInfo(p, field, px);
    if (lab === 'BE') {
      const n = beOffTicks(p, px);
      if (n != null) return narrow ? `BE +${n}t` : `BE +${n}t · ${fmtUsd(v.usd)}`;
      return narrow ? 'BE' : `BE ${fmtUsd(0)}`;
    }
    return narrow ? `${lab} ${fmtUsd(v.usd)}` : `${lab} ${fmtUsd(v.usd)}${v.r == null ? '' : ` · ${fmtR(v.r)}`}`;
  }
  // 1.7-5: plakietka poziomu drabiny: „TP1 50% · 5 · +1 000 $ · +1,00R” (ostatni poziom: „reszta” zamiast procentu), przy < 640 px „TP1 +1 000 $”; pojedynczy poziom zostaje
  // „TP +… $ · …R”; poziom, któremu nic nie zostało: „TP2 0 kontraktów” w --warn. Ilość i kwota poziomu pochodzą z planu (ta sama reguła co w silniku).
  function tpRowText(p, row, px, narrow) {
    if (tpTotal(p) < 2) { const x = levelText(p, 'tp', px, narrow); return { text: x, label: x }; }
    const v = lvInfo(p, 'tp', px, row.qty), name = `TP${row.rank}`;
    const pctTxt = row.last ? t('reszta') : `${row.pct}%`;
    const rTxt = v.r == null ? '' : ` · ${fmtR(v.r)}`;
    if (narrow) { const x = `${name} ${fmtUsd(v.usd)}`; return { text: x, label: x, warn: false }; }
    const head = `${name} `, tail = ` · ${row.qty} · ${fmtUsd(v.usd)}${rTxt}`;
    return { text: head + pctTxt + tail, label: head + pctTxt + tail, warn: false, html: `<span>${esc(head)}</span><span class="bt-pct-v" title="${esc(t('Zmień procent poziomu'))}">${esc(pctTxt)}</span><span>${esc(tail)}</span>` };
  }
  function dragTexts(p, d, narrow = false) {
    const dRow = d.field === 'tp' ? tpOpen(p).find((x) => x.id === d.tpId) : null;
    const v = lvInfo(p, d.field, d.price, dRow ? dRow.qty : p.openQty), lab = d.field === 'tp' ? (tpTotal(p) > 1 && dRow ? `TP${dRow.rank}` : 'TP') : d.field === 'abe' ? 'BE' : 'SL';
    // przy < 640 px bez punktów (są w podpowiedzi), żeby odczyt nie wychodził daleko nad świece
    const rTxt = v.r == null ? t('R —') : fmtR(v.r);
    const text = narrow ? `${lab} ${pf(d.price)}\n${fmtUsd(v.usd)} · ${rTxt}` : `${lab} ${pf(d.price)} · ${ptsTxt(v.pts)} · ${fmtUsd(v.usd)} · ${rTxt}`;
    let note = '';
    if (d.field === 'sl') note = `${t('ryzyko teraz')}: ${p.sl == null ? t('bez SL') : fmtUsd(lvInfo(p, 'sl', p.sl).usd)} → ${fmtUsd(v.usd)}`;
    else if (d.field === 'abe') note = `${t('próg BE teraz')}: ${p.abePrice == null ? '—' : pf(p.abePrice)} → ${pf(d.price)}`;
    else note = `${t('cel teraz')}: ${dRow ? fmtUsd(lvInfo(p, 'tp', dRow.price, dRow.qty).usd) : '—'} → ${fmtUsd(v.usd)}`;
    const last = Number(p.last);
    // próg BE musi leżeć po stronie zysku względem średniej wejścia (bad = na średniej albo za nią)
    const bad = d.field === 'abe' ? (p.dir === 'Short' ? d.price >= p.avg : d.price <= p.avg) : Number.isFinite(last) && (d.field === 'sl' ? (p.dir === 'Short' ? d.price <= last : d.price >= last) : (p.dir === 'Short' ? d.price >= last : d.price <= last));
    return { text, note: bad ? `${note} · ${t('po złej stronie ceny')}` : note, bad };
  }
  const pinned = () => hoverActs || focusActs || pinActs || !!partUi;

  function paintLayer(st) {
    layerSt = st;
    const p = st?.position || null, orders = st?.orders || [], rw = !!st?.rw;
    const sig = JSON.stringify([p ? [p.id, p.sl != null, tpOpen(p).map((x) => [x.id, x.rank, x.last]), tpTotal(p), p.abePrice != null, !!p.be, p.openQty < 1 ? 0 : p.openQty > 1, p.qty > p.openQty] : null, orders.map((o) => [o.id, o.sl != null, o.tp != null, (o.tps || []).map((x) => x.id)]), rw, !!hand, hand?.field, !!partUi, pctUi?.id]);
    if (sig !== layerSig) {
      layerSig = sig;
      const keepFocus = layer.contains(document.activeElement) ? document.activeElement.closest?.('[data-k]')?.dataset.k : null;
      let h = '<div class="bt-tl-live" role="status" aria-live="polite"></div>';
      if (p) {
        const acts = [!rw && p.sl == null ? btn('sl+', t('+SL'), ` aria-label="${t('Dodaj SL')}"`) : '', !rw && tpTotal(p) < TPS_MAX ? btn('tp+', t('+TP'), ` aria-label="${t('Dodaj TP')}"`) : '',
          !rw && p.abePrice == null && !p.be ? btn('abe+', t('+BE'), ` aria-label="${t('Dodaj próg auto BE')}" title="${t('Dodaj próg auto BE (SL przejdzie na BE po osiągnięciu ceny)')}"`) : '',
          btn('be', t('BE'), rw ? ' disabled' : ''), btn('x', '×', ` aria-label="${t('Zamknij część pozycji')}" title="${t('Zamknij część pozycji')}" ${rw ? 'disabled' : ''}`)].join('');
        h += tagHtml('pos', '', `<span class="bt-tag-warn" hidden>${t('bez SL')}</span><div class="bt-tag-act" hidden>${acts}</div>`, 'bt-tag-pos', ' role="group" tabindex="0"');
        const rm = (f, id = '', rank = 0) => { const lab = f === 'sl' ? t('Usuń SL') : f === 'abe' ? t('Usuń próg BE') : rank && tpTotal(p) > 1 ? t('Usuń TP{n}', { n: rank }) : t('Usuń TP'); return `<button type="button" class="icon-btn bt-tag-x" data-tl="rm" data-f="${f}"${id ? ` data-id="${esc(id)}"` : ''} aria-label="${lab}" title="${lab}" ${rw ? 'disabled' : ''}>×</button><span class="bt-tag-note" hidden></span>`; };
        const dr = rw ? '' : ' drag';
        if (p.sl != null) h += tagHtml('psl', '', rm('sl'), `bt-tag-o sl${dr}`, rw ? '' : ' role="slider" tabindex="0" aria-orientation="vertical"');
        for (const lv of tpOpen(p)) h += tagHtml(tpKey(lv.rank), '', rm('tp', lv.id, lv.rank), `bt-tag-o tp${dr}`, `${rw ? '' : ' role="slider" tabindex="0" aria-orientation="vertical"'} data-id="${esc(lv.id)}"`);
        if (p.abePrice != null) h += tagHtml('pbe', '', rm('abe'), `bt-tag-o abe${dr}`, rw ? '' : ' role="slider" tabindex="0" aria-orientation="vertical"');
      }
      for (const o of orders) {
        h += tagHtml(`o:${o.id}:price`, '', `<button type="button" class="icon-btn bt-tag-x" data-tl="cancel" data-id="${esc(o.id)}" aria-label="${t('Anuluj zlecenie')}" title="${t('Anuluj zlecenie')}" ${rw ? 'disabled' : ''}>×</button><span class="bt-tag-note" hidden></span>`, `bt-tag-o ${o.side === 'buy' ? 'buy' : 'sell'}${rw ? '' : ' drag'}`);
        if (o.sl != null) h += tagHtml(`o:${o.id}:sl`, '', '<span class="bt-tag-note" hidden></span>', `bt-tag-o sl${rw ? '' : ' drag'}`);
        if (o.tps && o.tps.length > 1) { for (const lv of o.tps) h += tagHtml(`o:${o.id}:tp-${lv.id}`, '', '<span class="bt-tag-note" hidden></span>', `bt-tag-o tp${rw ? '' : ' drag'}`); }
        else if (o.tp != null) h += tagHtml(`o:${o.id}:tp`, '', '<span class="bt-tag-note" hidden></span>', `bt-tag-o tp${rw ? '' : ' drag'}`);
      }
      if (hand) h += tagHtml('hand', '', '<span class="bt-tag-note"></span>', `bt-tag-o ${hand.field} hand`);
      if (partUi && p) h += partHtml(p);
      if (pctUi && p) h += pctHtml(p);
      layer.innerHTML = h;
      leads.clear(); axTags.clear();
      for (const el of layer.querySelectorAll('.bt-tag-o.drag')) { if (!el.hasAttribute('tabindex')) el.tabIndex = 0; if (!el.hasAttribute('role')) el.setAttribute('role', 'slider'); }
      if (keepFocus) layer.querySelector(`[data-k="${CSS.escape(keepFocus)}"]`)?.focus({ preventScroll: true });
      if (live.text) layer.querySelector('.bt-tl-live').textContent = live.text;
    }
    placeLayer();
  }

  // ---- okno „Zamknij część” (31.10.2026): od pozostałej / od pierwotnej, 25/50/75/100% albo wpisana ilość, podgląd „zamknie 5 z 10” z kwotą ----
  const PCTS = [25, 50, 75, 100];
  // 1.7-2 (G-2.5): „Odwróć” pod przyciskami części: zamyka całą otwartą ilość i otwiera pozycję przeciwną tej samej wielkości (jedno kliknięcie, bez potwierdzenia; podpis mówi, co się stanie)
  const revBtn = `<button type="button" class="btn sm bt-part-rev" data-tl="rev"></button>`;
  function partHtml(p) {
    if (p.openQty <= 1) return `<div class="bt-part" role="dialog" aria-label="${t('Zamknij część')}"><button type="button" class="btn sm bt-part-go" data-tl="go"></button>${revBtn}</div>`;
    const orig = p.qty > p.openQty;
    return `<div class="bt-part" role="dialog" aria-label="${t('Zamknij część')}">
      <div class="bt-part-h"><b>${t('Zamknij część')}</b> <span class="note" data-pp="of"></span></div>
      ${orig ? `<div class="seg sm bt-part-base" role="group" aria-label="${t('Podstawa procentu')}"><button type="button" data-tl="base" data-base="open"></button><button type="button" data-tl="base" data-base="orig"></button></div>` : ''}
      <div class="bt-part-pcts">${PCTS.map((x) => `<button type="button" class="btn sm" data-tl="pct" data-pct="${x}"></button>`).join('')}</div>
      <label class="bt-part-n"><span class="lbl">${t('Ilość')}</span><input class="sp-in" name="n" type="number" min="1" max="${p.openQty}" step="1" inputmode="numeric" autocomplete="off"></label>
      <p class="bt-part-prev" role="status"></p>
      <button type="button" class="btn sm bt-part-go" data-tl="go"></button>
      ${revBtn}
    </div>`;
  }
  const planOf = (p, o) => partialPlan({ qty: p.qty, openQty: p.openQty, price: Number(p.last), avg: p.avg, dir: p.dir, instrument: p.instrument, commission: p.commission || 0, ...o });
  function paintPart(p) {
    const el = layer.querySelector('.bt-part');
    if (!el || !p) return;
    const set = (n, v) => { if (n && n.textContent !== v) n.textContent = v; };
    const rv = el.querySelector('[data-tl="rev"]');
    if (rv) {
      // pełny podpis „Odwróć: zamknie 3, Short 3”; na telefonie CSS chowa część po dwukropku (okno części musi mieścić się w niskim polu wykresu)
      const full = t('Odwróć: zamknie {n}, {dir} {n}', { n: p.openQty, dir: p.dir === 'Long' ? t('Short') : t('Long') }), cut = full.indexOf(':');
      if (rv.textContent !== full) rv.innerHTML = `<span><span>${esc(full.slice(0, cut))}</span><span class="bt-rv-l">${esc(full.slice(cut))}</span></span>`;
      rv.setAttribute('aria-label', full);
      rv.disabled = !!layerSt?.rw;
    }
    if (p.openQty <= 1) {
      const pl = planOf(p, { n: 1 });
      set(el.querySelector('[data-tl="go"]'), `${t('Zamknij 1')}${pl.usd == null ? '' : ` · ${fmtUsd(pl.usd)}`}`);
      return;
    }
    set(el.querySelector('[data-pp="of"]'), `(${t('ilość otwarta {open} z {qty}', { open: p.openQty, qty: p.qty })})`);
    const base = partUi.base;
    el.querySelectorAll('[data-tl="base"]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.base === base));
      set(b, b.dataset.base === 'open' ? t('od pozostałej {n}', { n: p.openQty }) : t('od pierwotnej {n}', { n: p.qty }));
    });
    for (const b of el.querySelectorAll('[data-tl="pct"]')) {
      const x = Number(b.dataset.pct), pl = planOf(p, { base, pct: x });
      const over = base === 'orig' && Math.round((p.qty * x) / 100) > p.openQty;
      set(b, `${x}% · ${t('{n} z {of}', { n: pl.n, of: pl.of })}${over ? ` (${t('cała reszta')})` : ''}${pl.usd == null ? '' : ` · ${fmtUsd(pl.usd)}`}`);
    }
    const inp = el.querySelector('[name="n"]');
    const raw = inp.value.trim(), nv = Number(raw), ok = raw !== '' && Number.isInteger(nv) && nv >= 1 && nv <= p.openQty;
    inp.setAttribute('aria-invalid', String(!ok && raw !== ''));
    const pl = planOf(p, { n: ok ? nv : 1 });
    set(el.querySelector('.bt-part-prev'), ok ? `${t('zamknie {n} z {of}', { n: pl.n, of: pl.of })}${pl.usd == null ? '' : ` · ${fmtUsd(pl.usd)}`}` : t('Wpisz liczbę od 1 do {n}', { n: p.openQty }));
    const go = el.querySelector('[data-tl="go"]');
    set(go, ok ? t('Zamknij {n}', { n: pl.n }) : t('Zamknij'));
    go.disabled = !ok || !!layerSt?.rw;
  }
  function openPart() {
    if (!layerSt?.position || layerSt.rw) return;
    partUi = { base: 'open', typed: false };
    pinActs = true; layerSig = ''; paintLayer(layerSt);
    const inp = layer.querySelector('.bt-part [name="n"]');
    if (inp) { inp.value = String(planOf(layerSt.position, { base: 'open', pct: 50 }).n); inp.focus({ preventScroll: true }); inp.select(); }
    globalThis.addEventListener('keydown', onPartKey, true);
    globalThis.addEventListener('pointerdown', onPartOutside, true);
    placeLayer();
  }
  // kliknięcie poza oknem (i poza przyciskiem ×, który je przełącza) zamyka okno bez zmian
  function onPartOutside(ev) { if (partUi && !ev.target.closest?.('.bt-part') && !ev.target.closest?.('[data-tl="x"]')) closePart({ refocus: false }); }
  function onPartKey(ev) { if (ev.key === 'Escape' && partUi) { ev.preventDefault(); ev.stopPropagation(); closePart(); } }
  function closePart({ refocus = true } = {}) {
    if (!partUi) return;
    globalThis.removeEventListener('keydown', onPartKey, true);
    globalThis.removeEventListener('pointerdown', onPartOutside, true);
    partUi = null; layerSig = ''; if (layerSt) paintLayer(layerSt);
    if (refocus) layer.querySelector('[data-k="pos"]')?.focus({ preventScroll: true });
  }
  function commitPart(n) {
    const p = layerSt?.position;
    if (!p) return;
    const nv = n ?? Number(layer.querySelector('.bt-part [name="n"]')?.value);
    if (!(Number.isInteger(nv) && nv >= 1 && nv <= p.openQty)) { layer.querySelector('.bt-part [name="n"]')?.setAttribute('aria-invalid', 'true'); return; }
    globalThis.removeEventListener('keydown', onPartKey, true);
    globalThis.removeEventListener('pointerdown', onPartOutside, true);
    partUi = null; layerSig = ''; pinActs = false;
    onTradeAction?.({ kind: 'part', n: nv });
  }

  // ---- 1.7-5: edytor procentu poziomu drabiny (klik w procent na plakietce albo Enter na jej fokusie): 25 · 33 · 50 · 75 · [__] %; ostatni poziom to reszta (tylko informacja) ----
  let pctUi = null;
  function pctHtml(p) {
    const row = (p.tpPlan || []).find((x) => x.id === pctUi.id && !x.hit);
    if (!row) return '';
    const name = `TP${row.rank}`, lab = esc(t('Procent poziomu {name}', { name }));
    if (row.last) return `<div class="bt-pct" role="dialog" aria-label="${lab}" data-id="${esc(row.id)}"><div class="bt-pct-h"><b>${esc(name)}</b></div><p class="bt-pct-rest note">${esc(t('Ostatni poziom to reszta pozycji ({pct}%).', { pct: row.pct }))}</p></div>`;
    return `<div class="bt-pct" role="dialog" aria-label="${lab}" data-id="${esc(row.id)}"><div class="bt-pct-h"><b>${esc(name)}</b> <span class="note">${esc(t('udział w otwartej części'))}</span></div>
      <div class="bt-pct-q">${[25, 33, 50, 75].map((x) => `<button type="button" class="btn sm" data-tl="pctq" data-pct="${x}">${x}</button>`).join('')}</div>
      <label class="bt-pct-n"><input class="sp-in" name="pct" type="number" min="1" max="98" step="1" inputmode="numeric" autocomplete="off" value="${esc(row.pct)}" aria-label="${esc(t('Procent'))}"><span>%</span></label><button type="button" class="btn sm" data-tl="pcts">${esc(t('Zapisz'))}</button>
      <p class="bt-pct-err note" role="status"></p></div>`;
  }
  function openPct(id) {
    const p = layerSt?.position;
    if (!p || layerSt.rw || !id || tpTotal(p) < 2 || !tpOpen(p).some((x) => x.id === id)) return;
    closePart({ refocus: false });
    pctUi = { id };
    layerSig = ''; paintLayer(layerSt);
    const inp = layer.querySelector('.bt-pct [name="pct"]');
    if (inp) { inp.focus({ preventScroll: true }); inp.select(); }
    globalThis.addEventListener('keydown', onPctKey, true);
    globalThis.addEventListener('pointerdown', onPctOutside, true);
    placeLayer();
  }
  function onPctOutside(ev) { if (pctUi && !ev.target.closest?.('.bt-pct') && !ev.target.closest?.('.bt-pct-v')) closePct({ refocus: false }); }
  function onPctKey(ev) { if (ev.key === 'Escape' && pctUi) { ev.preventDefault(); ev.stopPropagation(); closePct(); } }
  function closePct({ refocus = true } = {}) {
    if (!pctUi) return;
    const id = pctUi.id;
    globalThis.removeEventListener('keydown', onPctKey, true);
    globalThis.removeEventListener('pointerdown', onPctOutside, true);
    pctUi = null; layerSig = ''; if (layerSt) paintLayer(layerSt);
    if (refocus) layer.querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  }
  // zapis procentu: odrzucenie silnika (np. suma ≥ 100) zostaje w oknie jako komunikat, sukces zamyka okno
  function commitPct(pct) {
    if (!pctUi) return;
    const id = pctUi.id;
    if (!(Number.isInteger(pct) && pct >= 1 && pct <= 98)) { const e = layer.querySelector('.bt-pct-err'); if (e) e.textContent = t('Procent: liczba całkowita od 1 do 98.'); layer.querySelector('.bt-pct [name="pct"]')?.setAttribute('aria-invalid', 'true'); return; }
    const r = onTradeAction?.({ kind: 'tpPct', id, pct });
    if (r && r.ok === false) { const e = layer.querySelector('.bt-pct-err'); if (e) e.textContent = r.text || t('Zlecenie odrzucone.'); return; }
    closePct({ refocus: false });
    focusTagId(id);
  }

  // ---- żywy komunikat (aria-live) i błysk plakietki po zapisie ----
  const live = { text: '' };
  function announce(msg) {
    live.text = msg || '';
    const el = layer.querySelector('.bt-tl-live');
    if (el) { el.textContent = ''; el.textContent = live.text; }
  }
  function flash(key) { flashKey = key; layerSig = ''; }
  const focusTagId = (id) => layer.querySelector(`.bt-tag[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });

  // ---- położenie plakietek ----
  function placeLayer() {
    const st = layerSt;
    if (!st) return;
    const H = paneH(), narrow = (host.clientWidth || 0) < 640, right = `${axisW() + 4}px`;
    const items = [];
    const mk = (key, y, text, o = {}) => {
      const el = layer.querySelector(`[data-k="${CSS.escape(key)}"]`);
      if (!el) return;
      const tx = el.querySelector('.bt-tag-t');
      if (o.html === undefined && tx.dataset.h === undefined && tx.textContent !== text) tx.textContent = text;
      // plakietka poziomu drabiny może mieć klikalny procent (html); zapis tekstu czyści pamięć html, żeby kolejny html został zapisany
      if (o.html !== undefined) { if (tx.dataset.h !== o.html) { tx.dataset.h = o.html; tx.innerHTML = o.html; } } else if (tx.dataset.h !== undefined) { delete tx.dataset.h; tx.textContent = text; }
      if (o.warn !== undefined) el.classList.toggle('warn', !!o.warn);
      if (o.cl !== undefined) { el.classList.toggle('pos', o.cl === 'pos'); el.classList.toggle('neg', o.cl === 'neg'); }
      if (o.bad !== undefined) el.classList.toggle('bad', !!o.bad);
      if (o.label !== undefined && el.getAttribute('aria-label') !== o.label) el.setAttribute('aria-label', o.label);
      if (o.title !== undefined && el.title !== o.title) el.title = o.title;
      if (o.value !== undefined) el.setAttribute('aria-valuenow', String(o.value));
      items.push({ key, el, y, fixed: !!o.fixed, grp: !!o.grp, hideOut: !!o.hideOut, tie: o.tie || 0 });
    };
    const p = st.position;
    if (p) {
      const prev = drag && drag.kind === 'level' ? drag : null;
      const E = entryTexts(p, narrow);
      mk('pos', yOf(p.entryPrice), E.text, { cl: E.cl, title: E.title, label: E.title || E.text, fixed: true, grp: true });
      const posEl = layer.querySelector('[data-k="pos"]');
      if (posEl) {
        const warn = posEl.querySelector('.bt-tag-warn');
        if (warn) warn.hidden = p.sl != null;
        const row = posEl.querySelector('.bt-tag-act'), open = pinned();
        // przy otwartym oknie części na telefonie kolumna przycisków jest zamknięta, a plakietka wejścia nie jest podniesiona nad okno (nic nie przecina okna)
        const underPart = narrow && !!partUi;
        if (row) row.hidden = !open || !!prev || underPart;
        posEl.dataset.open = String(open && !underPart);
        // BE: nieaktywne po stronie straty (także bez SL), gdy SL już stoi na BE albo jest po stronie zysku względem BE; podpowiedź mówi dlaczego (Decyzja z 31.10.2026 (parafraza; dosłownych słów brak w dokumentach))
        const bb = posEl.querySelector('[data-tl="be"]');
        if (bb) {
          const bs = p.beState || { ok: true, why: null }, dis = !!st.rw || !bs.ok;
          const tip = bs.ok ? t('SL na cenę wejścia (BE)') : bs.why === 'below' ? t('Cena poniżej średniej wejścia') : bs.why === 'above' ? t('Cena powyżej średniej wejścia') : bs.why === 'already' ? t('SL już na BE') : bs.why === 'sl-above' ? t('SL już powyżej wejścia') : bs.why === 'sl-below' ? t('SL już poniżej wejścia') : '';
          if (bb.disabled !== dis) bb.disabled = dis;
          if (bb.title !== tip) bb.title = tip;
          if (bb.getAttribute('aria-label') !== (tip || 'BE')) bb.setAttribute('aria-label', tip || 'BE');
        }
      }
      const lvl = (key, field, row = null) => {
        const cur = row ? row.price : levelOf(p, field);
        if (cur == null) return;
        const dragging = !!prev && prev.field === field && (!row || prev.tpId === row.id);
        const live1 = dragging ? prev.price : cur;
        const d = dragging ? dragTexts(p, prev, narrow) : null;
        // próg BE: w spoczynku sam zysk w $ i R (nazwa „BE” stoi na linii w strefie pozycji), w trakcie przeciągania pełny odczyt z ceną
        let txt = d ? d.text : levelText(p, field, live1, narrow);
        let lab = txt;
        if (field === 'abe' && !d) { const v = lvInfo(p, 'abe', live1); const core = narrow ? fmtUsd(v.usd) : `${fmtUsd(v.usd)}${v.r == null ? '' : ` · ${fmtR(v.r)}`}`; txt = `BE ${core}`; lab = `BE ${pf(live1)} · ${core}`; }
        // 1.7-5: poziom drabiny (kilka TP): tekst z planu (ilość, procent, kwota), klikalny procent
        let extra = {};
        if (row && !d) { const rt = tpRowText(p, row, live1, narrow); txt = rt.text; lab = rt.label; extra = { html: rt.html, warn: rt.warn }; }
        mk(key, yOf(live1), txt, { value: live1, label: lab, bad: d ? d.bad : false, grp: true, tie: field === 'sl' ? (p.dir === 'Short' ? -1 : 1) : 0, ...extra });
        // SL stojący na BE ma kolor BE także na plakietce (jak linia i znacznik osi)
        if (field === 'sl') layer.querySelector(`[data-k="${key}"]`)?.classList.toggle('be', isBeSl(p, live1));
        const note = layer.querySelector(`[data-k="${key}"] .bt-tag-note`);
        if (note) { note.hidden = !d; if (d && note.textContent !== d.note) note.textContent = d.note; }
        // notka progu BE leży po stronie dalszej od wejścia (nad plakietką, gdy próg jest nad wejściem), żeby nie przykrywała plakietki wejścia
        if (field === 'abe') layer.querySelector(`[data-k="${key}"]`)?.classList.toggle('note-up', live1 > p.avg);
      };
      lvl('psl', 'sl'); for (const row of tpOpen(p)) lvl(tpKey(row.rank), 'tp', row); lvl('pbe', 'abe');
    }
    for (const o of st.orders || []) {
      for (const f of ['price', 'sl', ...(o.tps && o.tps.length > 1 ? o.tps.map((x) => `tp-${x.id}`) : ['tp'])]) {
        const el = layer.querySelector(`[data-k="${CSS.escape(`o:${o.id}:${f}`)}"]`);
        if (!el) continue;
        const lvRow = f.startsWith('tp-') ? (o.tps || []).find((x) => x.id === f.slice(3)) : null;
        const live1 = drag && drag.kind === 'order' && drag.id === o.id && drag.field === f ? drag.price : orderLevel(o, f);
        let text;
        // kwota ryzyka przed ceną; na wąskim wykresie bez ceny (jest na osi), żeby kwota zawsze się mieściła
        if (f === 'price') text = narrow ? `${o.type === 'stop' ? 'STP' : 'LMT'}${o.risk != null ? ` ${fmtUsd(-o.risk)}` : ''}` : (o.intent === 'add' ? `${t('Dołóż')} ${o.type} ${o.qty} @ ${pf(live1)}${o.risk != null ? ` · ${fmtUsd(-o.risk)}` : ''}` : `${o.side === 'buy' ? t('Kup') : t('Sprzedaj')} ${o.type} ${o.qty}${o.risk != null ? ` · ${fmtUsd(-o.risk)}` : ''} @ ${pf(live1)}`);
        else {
          const m = o.risk != null && o.sl != null && o.sl !== o.price ? o.risk / Math.abs(o.price - o.sl) : null;
          // poziom drabiny zlecenia: kwota dla jego udziału w ilości (qty poziomu z planu / ilość zlecenia)
          const usd0 = m != null ? Math.abs(live1 - (drag && drag.kind === 'order' && drag.id === o.id && drag.field === 'price' ? drag.price : o.price)) * m : null;
          const usd = usd0 != null && lvRow && o.qty > 0 ? usd0 * (lvRow.qty / o.qty) : usd0;
          const nm = f === 'sl' ? 'SL' : lvRow ? `TP${lvRow.rank}${lvRow.last ? '' : ` ${lvRow.pct}%`}` : 'TP';
          text = narrow ? `${nm}${usd != null ? ` ${fmtUsd(f === 'sl' ? -usd : usd)}` : ''}` : `${nm} ${pf(live1)}${usd != null ? ` · ${fmtUsd(f === 'sl' ? -usd : usd)}` : ''}`;
        }
        // odbiór wyglądu 1.7.0 P1-1: zlecenia oczekujące (także dokładki) biorą udział w rozsuwaniu razem z plakietkami pozycji; poza polem ceny nadal się chowają (hideOut)
        // [U] 3.11.2026 decyzja sesji głównej: dawna decyzja gustu (14) z 1.7-1 „nie rozsuwamy zleceń oczekujących” jest nieaktualna
        mk(`o:${o.id}:${f}`, yOf(live1), text, { value: live1, label: text, grp: true, hideOut: true });
      }
    }
    if (hand) {
      const v = p ? lvInfo(p, hand.field, hand.price) : null;
      const lab = hand.field === 'tp' ? 'TP' : hand.field === 'abe' ? 'BE' : 'SL';
      const hr = v ? (v.r == null ? t('R —') : fmtR(v.r)) : '';
      mk('hand', yOf(hand.price), narrow ? `${lab} ${pf(hand.price)}${v ? `\n${fmtUsd(v.usd)} · ${hr}` : ''}` : `${lab} ${pf(hand.price)}${v ? ` · ${ptsTxt(v.pts)} · ${fmtUsd(v.usd)} · ${hr}` : ''}`, { bad: hand.bad, grp: true });
      const hn = layer.querySelector('[data-k="hand"] .bt-tag-note');
      if (hn) hn.textContent = hand.bad ? t('po złej stronie ceny') : '';
    }
    // rząd przycisków pod plakietką wejścia (desktop: 24 px + odstęp) odsuwa niżej plakietki SL/TP, żeby nie zasłaniał np. BE stojącego na wejściu; na telefonie to kolumna 44 px
    // pod samą plakietką wejścia i nic nie odsuwa (plakietka SL zostaje przy swojej linii). Wysokość znana z góry: bez odczytu layoutu w środku zapisów.
    const rowEl = layer.querySelector('[data-k="pos"] .bt-tag-act');
    spread(items, H, rowEl && !rowEl.hidden && !narrow ? 50 : 0);
    for (const it of items) it.el.hidden = it.y == null;
    placeAxis(items, H);
    // telefon: kolumna przycisków (n × 44 px) otwiera się w dół, a gdy tam się nie mieści, w górę; gdy nie mieści się żadna, układa się w dwóch kolumnach. Plakietki SL/TP, które
    // wpadają pod kolumnę, są na ten czas schowane (stuknięcie nie może trafić w ich ×), a plakietka wejścia leży nad pozostałymi (z-index w CSS).
    let colSpan = null;
    const eItem = items.find((i) => i.key === 'pos' && i.y != null);
    if (narrow && rowEl && !rowEl.hidden && eItem) {
      const n = rowEl.childElementCount, colH = n * 46 + (n - 1) * 2, gridH = Math.ceil(n / 2) * 46 + 2;
      const mode = eItem.y + 14 + colH <= H - 2 ? 'down' : eItem.y - 14 - colH >= 2 ? 'up' : (eItem.y + 14 + gridH <= H - 2 ? 'grid-down' : 'grid-up');
      const hh = mode.startsWith('grid') ? gridH : colH;
      colSpan = mode.endsWith('up') ? [eItem.y - 14 - hh, eItem.y - 12] : [eItem.y + 12, eItem.y + 14 + hh];
      if (rowEl.dataset.dir !== mode) rowEl.dataset.dir = mode;
    }
    for (const it of items) if (it.grp && it.key !== 'pos') it.el.classList.toggle('bt-under', !!(colSpan && it.y != null && it.y + 12 > colSpan[0] && it.y - 12 < colSpan[1]));
    paintPart(p);
    // jeden blok odczytów (jedno przeliczenie layoutu na klatkę), potem same zapisy
    const wNeed = measureTags(), panelH = layer.querySelector('.bt-part')?.offsetHeight || 0;
    for (const it of items) {
      if (it.y == null) continue;
      it.el.style.top = `${Math.round(it.y)}px`;
      it.el.style.left = 'auto'; it.el.style.right = right;
      const edge = it.edge || '';
      if (it.el.dataset.edge !== edge) { if (edge) it.el.dataset.edge = edge; else delete it.el.dataset.edge; }
    }
    placeLeads(items, right);
    placePart(p, narrow, right, H, panelH);
    placePct(narrow, right, H);
    applyMargin(wNeed);
  }
  // runda 2 (uwaga ze zrzutów 1.7-5): natywne znaczniki ceny na osi (wejście, SL, TP1..TP4, próg BE) stykały się, gdy poziomy leżą bliżej siebie niż wysokość znacznika (4 TP co 0,25 pkt).
  // Znaczniki w takiej grupie są chowane, a ich ceny rysują własne znaczniki rozsunięte co AX_H px (środek grupy zostaje na swoim miejscu), tak jak plakietki; reszta zostaje natywna.
  const AX_H = 16;
  function placeAxis(items, H) {
    const p = layerSt?.position, rows = [];
    const lineOf = (ref) => (ref.startsWith('o:') ? lines.find((l) => `o:${l.id}:${l.field}` === ref)?.line : posRef[ref]);
    const add = (key, ref, price, cl) => {
      const it = items.find((i) => i.key === key);
      if (it && it.price != null && it.price >= 8 && it.price <= H - 8 && lineOf(ref) && Number.isFinite(price)) rows.push({ ref, price, cl, y: it.price });
    };
    if (p) {
      add('pos', 'entry', p.entryPrice, p.dir === 'Short' ? 'sl' : 'tp');
      if (p.sl != null) add('psl', 'sl', p.sl, isBeSl(p) ? 'be' : 'sl');
      for (const lv of tpOpen(p)) add(tpKey(lv.rank), `tp:${lv.id}`, lv.price, 'tp');
      if (p.abePrice != null) add('pbe', 'abe', p.abePrice, 'be');
    }
    // odbiór 1.7.0 R2-P3-2: poziomy zleceń oczekujących (cena, SL, TP, poziomy drabiny) mają takie same rozsunięte znaczniki osi jak poziomy pozycji
    for (const l of lines) {
      const o = (layerSt?.orders || []).find((x) => x.id === l.id);
      if (o) add(`o:${l.id}:${l.field}`, `o:${l.id}:${l.field}`, l.price, l.field === 'price' ? (o.side === 'buy' ? 'tp' : 'sl') : l.field === 'sl' ? 'sl' : 'tp');
    }
    rows.sort((a, b) => a.y - b.y);
    const hidden = new Set(), want = [];
    let g = [];
    const flush = () => {
      if (g.length > 1) {
        const span = (g.length - 1) * AX_H, mean = g.reduce((a, r) => a + r.y, 0) / g.length;
        const top = Math.max(8, Math.min(H - 8 - span, mean - span / 2));
        g.forEach((r, i) => { hidden.add(r.ref); want.push({ ...r, y: top + i * AX_H }); });
      }
      g = [];
    };
    for (const r of rows) { if (g.length && r.y - g[g.length - 1].y >= AX_H) flush(); g.push(r); }
    flush();
    for (const ref of [...Object.keys(posRef), ...lines.map((x) => `o:${x.id}:${x.field}`)]) {
      const l = lineOf(ref), vis = !hidden.has(ref);
      if (l && l.options().axisLabelVisible !== vis) l.applyOptions({ axisLabelVisible: vis });
    }
    const seen = new Set();
    for (const r of want) {
      seen.add(r.ref);
      let el = axTags.get(r.ref);
      if (!el) { el = document.createElement('div'); layer.appendChild(el); axTags.set(r.ref, el); }
      const cls = `bt-axt ${r.cl}`;
      if (el.className !== cls) el.className = cls;
      const tx = pf(r.price);
      if (el.textContent !== tx) el.textContent = tx;
      el.style.top = `${Math.round(r.y)}px`;
      el.style.width = `${axisW()}px`;
    }
    for (const [k, el] of axTags) if (!seen.has(k)) { el.remove(); axTags.delete(k); }
  }
  // [U] 2.11.2026 «Sama cena (Recommended)»: gdy plakietka stoi daleko od swojej linii (kolizja poziomów), kreska przy osi łączy ją z poziomem linii
  function placeLeads(items, right) {
    const seen = new Set();
    for (const it of items) {
      if (!it.grp || it.y == null || it.price == null || it.edge || Math.abs(it.y - it.price) < 8) continue;
      seen.add(it.key);
      let el = leads.get(it.key);
      if (!el) { el = document.createElement('div'); el.className = `bt-lead ${it.key === 'psl' || /^o:.+:sl$/.test(it.key) ? 'sl' : isTpKey(it.key) || /^o:.+:tp/.test(it.key) ? 'tp' : it.key === 'pbe' ? 'abe' : it.key === 'hand' ? 'hand' : 'pos'}`; layer.appendChild(el); leads.set(it.key, el); }
      el.classList.toggle('be', it.key === 'psl' && it.el.classList.contains('be'));
      el.style.right = `calc(${right} - 3px)`;
      el.style.top = `${Math.round(Math.min(it.y, it.price))}px`;
      el.style.height = `${Math.round(Math.abs(it.y - it.price))}px`;
    }
    for (const [k, el] of leads) if (!seen.has(k)) { el.remove(); leads.delete(k); }
  }
  // plakietki bliżej siebie niż MIN px rozsuwają się: wejście zostaje na swojej cenie, SL/TP/zlecenia (także oczekujące) odsuwają się od niego (linie zostają na swoich cenach);
  // poza polem ceny plakietka przykleja się do krawędzi ze strzałką ↑/↓ (klik przewija oś ceny do poziomu)
  const MIN_GAP = 26;
  function spread(items, H, rowGap = 0) {
    for (const it of items) {
      it.price = it.y;
      if (it.y == null) continue;
      // plakietki zleceń oczekujących poza polem ceny chowają się jak dotąd (M: etykiety na swoich liniach, hideOut), plakietki pozycji przyklejają się do krawędzi
      if (it.y < 11 || it.y > H - 11) {
        if (!it.grp || it.hideOut) { it.y = null; continue; }
        if (it.y < 11) { it.y = 11; it.edge = 'up'; } else { it.y = H - 11; it.edge = 'down'; }
      }
    }
    // rozsuwa się cała grupa: wejście, SL, TP, linia w ręku i zlecenia oczekujące (odbiór 1.7.0 P1-1)
    // przy równych cenach rozstrzyga `tie` (odbiór 1.7.0 P3-8: SL na cenie wejścia po stronie straty: Long pod wejściem, Short nad nim)
    const vis = items.filter((i) => i.y != null && i.grp).sort((a, b) => (a.y + (a.tie || 0) * 1e-3) - (b.y + (b.tie || 0) * 1e-3));
    const fixed = vis.find((i) => i.fixed && !i.edge);
    const place = (arr, dir) => {
      let prev = fixed ? fixed.y : (dir > 0 ? -Infinity : Infinity);
      for (const [n, it] of arr.entries()) {
        const gap = n === 0 && fixed && dir > 0 && rowGap ? rowGap : MIN_GAP;
        const want = dir > 0 ? Math.max(it.y, prev + gap) : Math.min(it.y, prev - gap);
        it.y = Math.max(11, Math.min(H - 11, want)); prev = it.y;
      }
    };
    // R3-P2-1 (runda 4): plakietki przyklejone do krawędzi (↑ TP, ↓ SL) biorą udział w rozsuwaniu: poziomy odsuwane w stronę wejścia przez górną (dolną) krawędź lądowały na niej
    // i nachodziły na przyklejoną plakietkę (8 px), więc po rozsunięciu przechodzi jeszcze przebieg od krawędzi: od góry w dół (nad wejściem) i od dołu w górę (pod wejściem)
    const fromTop = (arr) => { let prev = 11 - MIN_GAP; for (const it of arr) { it.y = Math.max(it.y, prev + MIN_GAP); prev = it.y; } };
    const fromBottom = (arr) => { let prev = H - 11 + MIN_GAP; for (const it of arr.slice().reverse()) { it.y = Math.min(it.y, prev - MIN_GAP); prev = it.y; } };
    if (fixed) {
      const i0 = vis.indexOf(fixed);
      place(vis.slice(i0 + 1), 1);
      place(vis.slice(0, i0).reverse(), -1);
      fromTop(vis.slice(0, i0));
      fromBottom(vis.slice(i0 + 1));
    } else { place(vis, 1); fromBottom(vis); }
  }
  // edytor procentu: po lewej od plakietki poziomu, wyrównany do jej środka, w polu wykresu (na wąskim wykresie pod plakietką)
  function placePct(narrow, right, H) {
    const el = layer.querySelector('.bt-pct');
    if (!el) return;
    const tg = layer.querySelector(`.bt-tag[data-id="${CSS.escape(el.dataset.id)}"]`);
    if (!tg || tg.hidden) { el.hidden = true; return; }
    el.hidden = false;
    const h = el.offsetHeight || 90, ty = parseFloat(tg.style.top) || 40;
    if (narrow) { el.style.left = '8px'; el.style.right = '8px'; el.style.width = 'auto'; } else { el.style.left = 'auto'; el.style.right = `calc(${right} + ${tg.offsetWidth + 8}px)`; el.style.width = ''; }
    el.style.top = `${Math.round(Math.max(4, Math.min(H - h - 4, narrow ? ty + 16 : ty - h / 2)))}px`;
  }
  function placePart(p, narrow, right, H, panelH = 0) {
    const el = layer.querySelector('.bt-part');
    if (!el || !p) return;
    const posEl = layer.querySelector('[data-k="pos"]');
    const ty = posEl && !posEl.hidden ? parseFloat(posEl.style.top) || 40 : 40;
    const h = panelH || 120;
    if (narrow) { el.style.left = '8px'; el.style.right = '8px'; el.style.width = 'auto'; } else { el.style.left = 'auto'; el.style.right = right; el.style.width = ''; }
    // pod plakietką wejścia (i rzędem przycisków), a gdy się nie mieści, nad nią: okno nie zasłania plakietki, którą się je otwiera
    const below = ty + 38, top = below + h > H - 4 && ty - 18 - h >= 4 ? ty - 18 - h : below;
    el.style.top = `${Math.round(Math.max(4, Math.min(H - h - 4, top)))}px`;
  }

  // ---- margines za ostatnią świecą: rightOffset z szerokości najszerszej plakietki (skokowo, najszersza z ostatnich 2 s, żeby wykres nie drgał) ----
  let wHist = [], curOff = 6, offTimer = 0;
  // szerokość najszerszej plakietki w spoczynku (odczyt layoutu); plakietka w trakcie przeciągania i linia „w ręku” nie liczą się, żeby świece nie uciekały ani nie skakały przy chwycie
  function measureTags() {
    const hasTrade = !!(layerSt && (layerSt.position || (layerSt.orders || []).length));
    let w = 0;
    if (hasTrade) for (const el of layer.querySelectorAll('.bt-tag:not(.dragging):not(.hand)')) if (!el.hidden) w = Math.max(w, el.offsetWidth);
    return { hasTrade, w };
  }
  function applyMargin({ hasTrade, w }) {
    const now = performance.now();
    if (!drag && !hand) { wHist.push({ t: now, w }); wHist = wHist.filter((x) => now - x.t < 2000); }
    // telefon: margines mieści też dwuwierszowy odczyt przeciągania (ok. 121 px, ≥ 8 px od ostatniej świecy)
    const wmax = hasTrade ? Math.max(narrowNow() ? 124 : 0, ...wHist.map((x) => x.w)) : 0;
    let sp = 6;
    try { sp = chart.timeScale().options().barSpacing || 6; } catch { /* wykres zniszczony */ }
    const off = hasTrade ? Math.max(6, Math.ceil((wmax + 16) / sp)) : 6;
    if (off !== curOff) { curOff = off; try { chart.timeScale().applyOptions({ rightOffset: off }); } catch { /* wykres zniszczony */ } }
    // po zniknięciu szerszego odczytu margines wraca po 2 s
    if (hasTrade && wHist.some((x) => x.w !== w) && !offTimer) offTimer = setTimeout(() => { offTimer = 0; relayout(); }, 2100);
  }
  // skala ceny zmienia się też bez ruchu osi czasu (autoskala po nowej świecy, przeciągnięcie osi, Auto): lekki podgląd położenia linii co 200 ms dopasowuje plakietki
  let yWas = '';
  const yWatch = setInterval(() => {
    const p = layerSt?.position;
    if (!p && !(layerSt?.orders || []).length) return;
    const sig = [p?.entryPrice, p?.sl, ...(p ? tpOpen(p).map((x) => x.price) : []), p?.abePrice, ...(layerSt.orders || []).flatMap((o) => [o.price, o.sl, o.tp, ...(o.tps || []).map((x) => x.price)])].map((x) => (x == null ? '' : Math.round(yOf(x) ?? -1))).join(',');
    if (sig !== yWas) { yWas = sig; placeLayer(); }
  }, 200);
  const relayout = () => { if (layerRaf) return; layerRaf = requestAnimationFrame(() => { layerRaf = 0; if (narrowWas !== narrowNow()) { narrowWas = narrowNow(); linesSig = ''; posSig = ''; if (want) applyTrading(want); } placeLayer(); }); };
  let narrowWas = null;
  chart.timeScale().subscribeVisibleLogicalRangeChange(relayout);
  // zmiana wysokości wykresu (panel zleceń, szuflada, obrót telefonu) przesuwa linie bez ruchu osi czasu
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(relayout) : null;
  ro?.observe(host);
  host.addEventListener('wheel', relayout, { passive: true });
  host.addEventListener('pointermove', (ev) => { if (ev.buttons) relayout(); });

  // ---- przycisk i klawisze plakietek ----
  // odległość startowa +SL/+TP (punkty od średniej wejścia) podaje wywołujący (pamięć panelu, domyślnie 10 pkt NQ/MNQ i 2 pkt ES/MES, TP = 2× SL)
  function startPrice(p, field) {
    if (field === 'abe') return snap(p.startAbe);
    const pts = field === 'sl' ? p.startSl : p.startTp, s = sg(p);
    return snap(p.avg + (field === 'sl' ? -s : s) * pts);
  }
  function setActs() { layer.querySelector('[data-k="pos"]') && (paintLayer(layerSt)); }
  layer.addEventListener('pointerover', (ev) => { if (ev.pointerType === 'touch') return; if (ev.target.closest?.('[data-k="pos"]') && !hoverActs) { hoverActs = true; setActs(); } });
  layer.addEventListener('pointerout', (ev) => { if (ev.pointerType === 'touch') return; const to = ev.relatedTarget; if (ev.target.closest?.('[data-k="pos"]') && !(to && to.closest?.('[data-k="pos"]')) && hoverActs) { hoverActs = false; setActs(); } });
  layer.addEventListener('focusin', (ev) => { if (ev.target.closest?.('[data-k="pos"]') && !focusActs) { focusActs = true; setActs(); } });
  layer.addEventListener('focusout', (ev) => { const to = ev.relatedTarget; if (ev.target.closest?.('[data-k="pos"]') && !(to && to.closest?.('[data-k="pos"]')) && focusActs) { focusActs = false; pinActs = false; setActs(); } });
  layer.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    // 1.7-5: klik w procent na plakietce poziomu drabiny otwiera edytor (przy prawdziwym wciśnięciu myszy robi to koniec przeciągania bez ruchu: onDragEnd)
    const pv = ev.target.closest?.('.bt-pct-v');
    if (pv && !b) { openPct(pv.closest('.bt-tag')?.dataset.id); return; }
    if (!b) {
      // stuknięcie plakietki wejścia przełącza rząd przycisków (dotyk); plakietka z krawędzi przewija oś ceny do swojego poziomu
      const tg = ev.target.closest?.('.bt-tag');
      if (tg?.dataset.k === 'pos' && !partUi) {
        // dotyk tuż przed kliknięciem (pointerdown z pointerType touch na tej plakietce): otwarta kolumna zamyka się, zamknięta otwiera; mysz przełącza jak dotąd
        const tt = touchTap && performance.now() - touchTap.t < 700 ? touchTap : null;
        touchTap = null;
        if (tt && tt.wasOpen) { hoverActs = false; focusActs = false; pinActs = false; tg.blur?.(); } else pinActs = tt ? true : !pinActs;
        setActs(); return;
      }
      if (tg?.dataset.edge) scrollToTag(tg);
      return;
    }
    if (b.disabled) return;
    ev.stopPropagation();
    const tl = b.dataset.tl, p = layerSt?.position;
    if (tl === 'x') { if (partUi) closePart(); else openPart(); return; }
    if (tl === 'pct') { commitPart(planOf(p, { base: partUi?.base || 'open', pct: Number(b.dataset.pct) }).n); return; }
    if (tl === 'base') { partUi.base = b.dataset.base; partUi.typed = false; const ni = layer.querySelector('.bt-part [name="n"]'); if (ni) ni.value = String(planOf(p, { base: partUi.base, pct: 50 }).n); placeLayer(); return; }
    if (tl === 'go') { commitPart(p.openQty <= 1 ? 1 : undefined); return; }
    if (tl === 'rev') {
      globalThis.removeEventListener('keydown', onPartKey, true);
      globalThis.removeEventListener('pointerdown', onPartOutside, true);
      partUi = null; layerSig = ''; pinActs = false;
      onTradeAction?.({ kind: 'reverse' });
      return;
    }
    if (tl === 'be') { onTradeAction?.({ kind: 'be' }); return; }
    if (tl === 'cancel') { onTradeAction?.({ kind: 'cancel', id: b.dataset.id }); return; }
    if (tl === 'rm') { onTradeAction?.({ kind: 'rmLevel', field: b.dataset.f, id: b.dataset.id || undefined }); return; }
    if (tl === 'pctq') { commitPct(Number(b.dataset.pct)); return; }
    if (tl === 'pcts') { commitPct(Number(layer.querySelector('.bt-pct [name="pct"]')?.value)); return; }
    if (tl === 'sl+' || tl === 'tp+') { if (!p || suppressClick) { suppressClick = false; return; } startHand(tl === 'sl+' ? 'sl' : 'tp', startPrice(p, tl === 'sl+' ? 'sl' : 'tp')); }
    // Decyzja sesji głównej 2.11.2026 (runda 2 pakietu 1.7-3): karta mówi „klik stawia próg na +1R”, więc +BE od razu stawia próg w domyślnym miejscu (potem przeciąganie i ×), bez linii „w ręku”
    if (tl === 'abe+') { if (p) onTradeAction?.({ kind: 'level', field: 'abe', price: startPrice(p, 'abe'), focus: 'pbe' }); }
  });
  let suppressClick = false;
  // wciśnięcie na „+SL”/„+TP” i ruch to przeciąganie od razu (jak TV): linia w ręku od momentu wciśnięcia, puszczenie zatwierdza
  let touchTap = null;
  layer.addEventListener('pointerdown', (ev) => {
    touchTap = ev.pointerType === 'touch' && ev.target.closest?.('[data-k="pos"]') ? { t: performance.now(), wasOpen: pinned() } : null;
    const b = ev.target.closest('button');
    if (b && (b.dataset.tl === 'sl+' || b.dataset.tl === 'tp+') && ev.button === 0 && layerSt?.position && !layerSt.rw) {
      const f = b.dataset.tl === 'sl+' ? 'sl' : 'tp';
      startHand(f, startPrice(layerSt.position, f), { press: true, pid: ev.pointerId });
      suppressClick = true; ev.preventDefault();
      return;
    }
    if (b) return;
    const el = ev.target.closest('.bt-tag-o.drag');
    if (!el || ev.button !== 0) return;
    const k = el.dataset.k;
    if (isTpKey(k)) {
      const p = layerSt?.position, tid = el.dataset.id;
      if (!p || !tid) return;
      ev.preventDefault(); ev.stopPropagation();
      beginDrag({ kind: 'level', field: 'tp', tpId: tid, price: levelOf(p, 'tp', tid), pid: ev.pointerId, key: k, el, pctHit: !!ev.target.closest?.('.bt-pct-v') });
      return;
    }
    if (FIELD_OF[k]) {
      const p = layerSt?.position;
      if (!p) return;
      ev.preventDefault(); ev.stopPropagation();
      beginDrag({ kind: 'level', field: FIELD_OF[k], price: levelOf(p, FIELD_OF[k]), pid: ev.pointerId, key: k, el });
      return;
    }
    const [, id, field] = k.split(':');
    const o = (layerSt?.orders || []).find((x) => x.id === id);
    if (!o) return;
    ev.preventDefault(); ev.stopPropagation();
    beginDrag({ kind: 'order', id, field, price: orderLevel(o, field), pid: ev.pointerId, key: k, el });
  });
  layer.addEventListener('input', (ev) => { if (ev.target.name === 'n' && partUi) { partUi.typed = true; placeLayer(); } if (ev.target.name === 'pct') ev.target.removeAttribute('aria-invalid'); });
  // klawiatura: strzałki góra/dół przesuwają o tick (Shift: o 4 ticki = 1 pkt) plakietki SL/TP i zlecenia; Enter na „+SL”/„+TP” stawia poziom od razu; Enter w polu ilości zamyka część; Esc zamyka panel
  layer.addEventListener('keydown', (ev) => {
    const tg = ev.target;
    if (tg.name === 'pct' && pctUi) {
      if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); commitPct(Number(tg.value)); } else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closePct(); }
      return;
    }
    if (tg.name === 'n' && partUi) {
      if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); commitPart(); } else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closePart(); }
      return;
    }
    if (ev.key === 'Escape' && partUi) { ev.preventDefault(); ev.stopPropagation(); closePart(); return; }
    if (ev.key === 'Enter' && tg.dataset?.tl && (tg.dataset.tl === 'sl+' || tg.dataset.tl === 'tp+' || tg.dataset.tl === 'abe+')) {
      const p = layerSt?.position;
      ev.preventDefault(); ev.stopPropagation();
      if (!p || tg.disabled) return;
      const f = tg.dataset.tl === 'sl+' ? 'sl' : tg.dataset.tl === 'tp+' ? 'tp' : 'abe';
      onTradeAction?.({ kind: 'level', field: f, price: startPrice(p, f), focus: KEY_OF[f] });
      return;
    }
    // 1.7-5: Enter na fokusie plakietki poziomu drabiny otwiera edytor procentu
    if (ev.key === 'Enter' && tg.classList?.contains('tp') && tg.dataset?.id && isTpKey(tg.dataset.k)) { ev.preventDefault(); ev.stopPropagation(); openPct(tg.dataset.id); return; }
    const el = tg.closest?.('.bt-tag-o.drag');
    if (!el || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
    ev.preventDefault(); ev.stopPropagation();
    const d = (ev.key === 'ArrowUp' ? 1 : -1) * tick * (ev.shiftKey ? 4 : 1), k = el.dataset.k;
    if (isTpKey(k)) {
      const p = layerSt?.position, tid = el.dataset.id;
      if (p && tid) onTradeAction?.({ kind: 'level', field: 'tp', tpId: tid, price: snap(levelOf(p, 'tp', tid) + d), focus: `tp:${tid}` });
      return;
    }
    if (FIELD_OF[k]) {
      const p = layerSt?.position, f = FIELD_OF[k];
      if (p) onTradeAction?.({ kind: 'level', field: f, price: snap(levelOf(p, f) + d), focus: k });
      return;
    }
    const [, id, field] = k.split(':');
    const o = (layerSt?.orders || []).find((x) => x.id === id);
    if (o) onTradeAction?.({ kind: 'move', id, changes: orderMoveChanges(o, field, snap(orderLevel(o, field) + d)), focus: k });
  });

  // ---- przeciąganie: plakietką albo samą linią (pas ±4 px myszą, ±22 px palcem), cena do ticka, odczyt na żywo ----
  function priceAtEvent(ev) {
    const r = host.getBoundingClientRect();
    const p = series.coordinateToPrice(ev.clientY - r.top);
    return p == null || !Number.isFinite(p) ? null : snap(p);
  }
  function beginDrag(d) {
    drag = d;
    d.start = d.price;
    d.el?.classList.add('dragging');
    host.dataset.btDrag = '1';
    globalThis.addEventListener('pointermove', onDragMove, true);
    globalThis.addEventListener('pointerup', onDragEnd, true);
    globalThis.addEventListener('pointercancel', onDragEnd, true);
    globalThis.addEventListener('keydown', onDragKey, true);
    placeLayer();
  }
  function onDragMove(ev) {
    if (!drag || ev.pointerId !== drag.pid) return;
    const p = priceAtEvent(ev);
    if (p == null) return;
    drag.price = p;
    if (drag.kind === 'order') lineOf(drag.id, drag.field)?.line.applyOptions({ price: p });
    else {
      posRef[drag.field === 'tp' ? `tp:${drag.tpId}` : drag.field]?.applyOptions(drag.field === 'abe' ? { price: p, lineVisible: true } : { price: p });
      const pos0 = layerSt.position;
      // strefa pozycji sięga do najdalszego poziomu (także trafionego), więc przy przeciąganiu TP liczy się najdalszy z pozostałych i przeciąganego
      if (drag.field === 'tp') {
        const prices = [...(pos0.tps || []).filter((x) => x.id !== drag.tpId).map((x) => x.price), p];
        syncZones({ ...pos0, tp: prices.reduce((a, b) => (pos0.dir === 'Short' ? Math.min(a, b) : Math.max(a, b))) });
      } else syncZones({ ...pos0, [drag.field === 'abe' ? 'abePrice' : drag.field]: p });
    }
    placeLayer();
  }
  function endDragState() {
    globalThis.removeEventListener('pointermove', onDragMove, true);
    globalThis.removeEventListener('pointerup', onDragEnd, true);
    globalThis.removeEventListener('pointercancel', onDragEnd, true);
    globalThis.removeEventListener('keydown', onDragKey, true);
    drag?.el?.classList.remove('dragging');
    delete host.dataset.btDrag;
    const d = drag; drag = null; return d;
  }
  function rebuildTrading() { linesSig = ''; posSig = ''; layerSig = ''; if (layerSt) applyTrading(layerSt); }
  function onDragKey(ev) {
    if (ev.key !== 'Escape' || !drag) return;
    ev.preventDefault(); ev.stopPropagation();
    endDragState(); rebuildTrading();
  }
  function onDragEnd(ev) {
    if (!drag || ev.pointerId !== drag.pid) return;
    const d = endDragState();
    const od = d.kind === 'order' ? (layerSt?.orders || []).find((x) => x.id === d.id) : null;
    const cur = d.kind === 'level' ? (layerSt?.position ? levelOf(layerSt.position, d.field, d.tpId) : undefined) : (od ? orderLevel(od, d.field) : undefined);
    // wciśnięcie i puszczenie na procencie bez ruchu to klik w procent: edytor (nie przeciągnięcie)
    if (ev.type === 'pointercancel' || d.price === cur) { rebuildTrading(); if (ev.type !== 'pointercancel' && d.pctHit) openPct(d.tpId); return; }
    flash(d.key);
    rebuildTrading();
    if (d.kind === 'level') onTradeAction?.({ kind: 'level', field: d.field, tpId: d.tpId, price: d.price, focus: d.field === 'tp' ? `tp:${d.tpId}` : d.key });
    else onTradeAction?.({ kind: 'move', id: d.id, changes: od ? orderMoveChanges(od, d.field, d.price) : { [d.field]: d.price } });
  }
  function lineOf(id, field) { return lines.find((l) => l.id === id && l.field === field); }
  // chwyt samej linii SL/TP: faza przechwytywania na hoście, tylko poza narzędziem rysowania, kształtem pod wskaźnikiem i cofniętym kursorem
  const onLineDown = (ev) => {
    if (ev.button !== 0 || drag || hand || !host.contains(ev.target)) return;
    const p = layerSt?.position;
    if (!p || layerSt.rw || ev.target.closest?.('.bt-tl')) return;
    if (mgr && (mgr.tool?.() || (() => { const h = mgr.hoveredId?.(); return h && h !== curPosId(); })())) return;
    const r = host.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    if (x > r.width - axisW() || y > paneH() || x < 0 || y < 0) return;
    const band = ev.pointerType === 'touch' ? 22 : 4;
    let best = null;
    // 1.7-5: kandydaci chwytu: SL, każdy nietrafiony poziom drabiny (z id i kluczem wg numeru), próg BE
    const cands = [['sl', p.sl, null, 'psl'], ...tpOpen(p).map((x) => ['tp', x.price, x.id, tpKey(x.rank)]), ['abe', p.abePrice, null, 'pbe']];
    for (const [f, lv, tid, key] of cands) {
      const ly = lv == null ? null : yOf(lv);
      if (ly == null) continue;
      const dist = Math.abs(y - ly);
      if (dist <= band && (!best || dist < best.dist)) best = { f, dist, lv, tid, key };
    }
    if (!best) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    beginDrag({ kind: 'level', field: best.f, tpId: best.tid || undefined, price: best.lv, pid: ev.pointerId, key: best.key, el: layer.querySelector(`[data-k="${best.key}"]`) });
  };
  globalThis.addEventListener('pointerdown', onLineDown, true);
  // kursor ns-resize nad linią SL/TP (bez narzędzia rysowania); przy pierwszym najechaniu na zablokowany rysunek pozycji podpowiedź „SL i TP przesuwasz liniami” (raz, decyduje wywołujący)
  let zoneHinted = false;
  host.addEventListener('pointermove', (ev) => {
    if (!zoneHinted && onZoneHint && mgr && curPosId() && !ev.buttons && mgr.hoveredId?.() === curPosId()) { zoneHinted = true; onZoneHint(); }
    if (ev.buttons || drag || hand || ev.pointerType === 'touch') return;
    const p = layerSt?.position;
    let on = false;
    if (p && !layerSt.rw && !(mgr && mgr.tool?.())) {
      const r = host.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      if (x >= 0 && x <= r.width - axisW() && y <= paneH()) for (const lv of [p.sl, ...tpOpen(p).map((r2) => r2.price), p.abePrice]) { const ly = lv == null ? null : yOf(lv); if (ly != null && Math.abs(y - ly) <= 4) on = true; }
    }
    if (host.classList.contains('bt-grab') !== on) host.classList.toggle('bt-grab', on);
  });

  // ---- +SL / +TP: linia „w ręku” (półprzezroczysta), ruch przesuwa, klik albo puszczenie zatwierdza, Esc anuluje ----
  function startHand(field, price, { press = false, pid = null } = {}) {
    const p = layerSt?.position;
    if (!p || layerSt.rw) return;
    cancelHand(false);
    hand = { field, price, press, pid, bad: false, line: null };
    hand.line = series.createPriceLine({ price, color: field === 'sl' ? c.loss : field === 'abe' ? c.be : c.profit, lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: '' });
    globalThis.addEventListener('pointermove', onHandMove, true);
    globalThis.addEventListener('pointerup', onHandUp, true);
    globalThis.addEventListener('keydown', onHandKey, true);
    layerSig = ''; paintLayer(layerSt);
  }
  function handBad(p, field, price) {
    const last = Number(p.last);
    if (field !== 'abe' && !Number.isFinite(last)) return false;
    if (field === 'abe') return p.dir === 'Short' ? price >= p.avg : price <= p.avg;
    return field === 'sl' ? (p.dir === 'Short' ? price <= last : price >= last) : (p.dir === 'Short' ? price >= last : price <= last);
  }
  function onHandMove(ev) {
    if (!hand) return;
    if (ev.target.closest?.('.bt-tag')) return;
    const px = priceAtEvent(ev);
    if (px == null) return;
    hand.price = px; hand.bad = handBad(layerSt.position, hand.field, px);
    hand.line?.applyOptions({ price: px, color: hand.bad ? c.loss : (hand.field === 'sl' ? c.loss : hand.field === 'abe' ? c.be : c.profit) });
    placeLayer();
  }
  function onHandUp(ev) {
    if (!hand) return;
    // zatwierdza puszczenie po wciśnięciu (host) albo po przeciągnięciu od przycisku; dotyk plakietki/przycisków w ręce nic nie robi
    if (ev.target.closest?.('.bt-tag') || ev.target.closest?.('.bt-part')) return;
    const px = priceAtEvent(ev);
    const h = hand;
    if (px != null) h.price = px;
    cancelHand(false);
    suppressClick = false;
    onTradeAction?.({ kind: 'level', field: h.field, price: h.price, focus: KEY_OF[h.field] });
  }
  function onHandKey(ev) { if (ev.key === 'Escape' && hand) { ev.preventDefault(); ev.stopPropagation(); cancelHand(true); } }
  function cancelHand(repaint = true) {
    if (!hand) return;
    try { if (hand.line) series.removePriceLine(hand.line); } catch { /* już usunięta */ }
    hand = null;
    globalThis.removeEventListener('pointermove', onHandMove, true);
    globalThis.removeEventListener('pointerup', onHandUp, true);
    globalThis.removeEventListener('keydown', onHandKey, true);
    layerSig = '';
    if (repaint && layerSt) paintLayer(layerSt);
  }
  // klik w plakietkę przyklejoną do krawędzi: oś ceny przewija się do poziomu (auto-skala zostaje wyłączona, jak przy przeciągnięciu osi)
  function scrollToTag(el) {
    const p = layerSt?.position, k = el.dataset.k;
    let price = null;
    if (k === 'pos') price = p?.entryPrice; else if (k === 'psl') price = p?.sl; else if (isTpKey(k)) price = p ? levelOf(p, 'tp', el.dataset.id) : null; else if (k === 'pbe') price = p?.abePrice;
    else if (k?.startsWith('o:')) { const [, id, f] = k.split(':'), od = (layerSt.orders || []).find((x) => x.id === id); price = od ? orderLevel(od, f) : null; }
    if (!Number.isFinite(price)) return;
    try {
      const top = series.coordinateToPrice(0), bot = series.coordinateToPrice(paneH());
      if (top == null || bot == null) return;
      const half = Math.abs(top - bot) / 2;
      setAuto(false);
      series.priceScale().setVisibleRange?.({ from: price - half, to: price + half });
    } catch { /* wersja bez setVisibleRange: oś zostaje */ }
    relayout();
  }
  // strefy pozycji: rysunek long/short-position z paczki jest TŁEM (zablokowany, bez uchwytów); idzie za liniami także w trakcie przeciągania
  function syncZones(p) {
    if (!mgr) return;
    applying = true;
    try {
      let d = null;
      if (p) {
        const last = candles.length ? candles[candles.length - 1][0] : p.entryT;
        // linia BE na szerokości pozycji: próg auto-BE (przerywana --be z podpisem „BE” nad linią po prawej), po wyzwoleniu SL stojący na BE
        d = positionDrawing({ entryPrice: p.entryPrice, sl: p.sl, tp: p.tp, dir: p.dir, be: p.abePrice != null ? p.abePrice : p.be ? p.sl : undefined, at: candleAtOrBefore(p.entryT) * 1000 }, D, c, last);
        if (d) d.locked = true;
      }
      wantPos = d;
      if (rys) {
        const pid = rys.positionId();
        if (!d) { if (pid) rys.refreshExtra(); }
        else if (pid && mgr.get(pid)) mgr.update({ ...d, id: pid });
        else rys.refreshExtra();
        return;
      }
      if (!p) { if (posId) { mgr.remove(posId); posId = null; } return; }
      if (!d) return;
      if (posId && mgr.get(posId)) mgr.update({ ...d, id: posId });
      else { posId = mgr.add(d); }
    } finally { applying = false; }
  }
  // wejście rynkowe stoi w chwili kursora, czyli na granicy świec: marker na ostatniej widocznej świecy (świeca w budowie nie istnieje na wykresie)
  const markAt = (tm) => barAt(tm) ?? (candles.length && tm >= candles[candles.length - 1][0] ? candles[candles.length - 1][0] : null);
  function syncMarkers(p, force = false) {
    if (!posMarkers) return;
    const sig = p ? JSON.stringify([p.id, p.fills?.length, p.exits?.length, step]) : '';
    if (!force && sig === mkSig) return;
    mkSig = sig;
    const m = [];
    if (p) {
      const short = p.dir === 'Short', col = short ? c.loss : c.profit;
      (p.fills || []).forEach((x, i) => { const tm = markAt(x.t); if (tm != null) m.push({ id: `${p.id}:f${i}`, time: tm, position: short ? 'aboveBar' : 'belowBar', shape: short ? 'arrowDown' : 'arrowUp', color: col, size: 1, text: `+${x.qty}` }); });
      (p.exits || []).forEach((x, i) => { const tm = markAt(x.t); if (tm != null) m.push({ id: `${p.id}:x${i}`, time: tm, position: short ? 'belowBar' : 'aboveBar', shape: short ? 'arrowUp' : 'arrowDown', color: col, size: 1, text: `−${x.qty}` }); });
    }
    marksNow = m.sort((a, b) => a.time - b.time);
    try { posMarkers.setMarkers(marksNow); } catch { /* wykres zniszczony */ }
  }
  function applyTrading(st) {
    syncMarkers(st.position || null);
    if (drag && drag.kind === 'level' && !st.position) { endDragState(); announce(t('Pozycja została zamknięta')); layerSig = ''; }
    // pozycja zniknęła: linia „w ręku” i okno części nie przeżywają jej zamknięcia
    if (!st.position) { cancelHand(false); closePart({ refocus: false }); closePct({ refocus: false }); }
    // poziom, który przestał istnieć (trafiony, usunięty), zamyka swój edytor procentu
    if (pctUi && !(st.position && tpOpen(st.position).some((x) => x.id === pctUi.id) && tpTotal(st.position) > 1)) closePct({ refocus: false });
    if (!drag) orderLines(st.orders || []);
    if (!drag || drag.kind === 'order') positionLines(st.position || null);
    paintLayer(st);
    if (!drag) syncZones(st.position || null);
    if (flashKey) {
      const el = layer.querySelector(`[data-k="${CSS.escape(flashKey)}"]`);
      if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 700); }
      flashKey = null;
    }
  }

  const dirty = () => { ovModel = null; newsModel = null; prim.requestUpdate(); nprim.requestUpdate(); };
  // ---- K: historia ----
  const liveBars = () => candles.slice(hist.length);
  function setAll(next, shift = 0) {
    const ts = chart.timeScale();
    const r = shift ? ts.getVisibleLogicalRange() : null;
    candles = next;
    series.setData(candles.map(toBar)); stat('setData');
    pkgAll();
    if (r) ts.setVisibleLogicalRange({ from: r.from + shift, to: r.to + shift });
    dirty();
  }
  async function loadHistory() {
    if (hDone || hBusy || !getHistory) return;
    const before = hFrom ?? historyEnd();
    if (!Number.isFinite(before)) return;
    hBusy = true;
    const gen = hGen;
    try {
      const h = await getHistory(before);
      // zmiana interwału albo okna w trakcie: porcja nieaktualna
      if (gen !== hGen) return;
      const bars = (h.bars || []).filter((k) => k[0] < before).map((k) => k.slice(0, 6));
      hDaily = [...(h.daily || []), ...hDaily];
      hFrom = h.from; hDone = !!h.done;
      if (bars.length) { hist = [...bars, ...hist]; setAll([...bars, ...candles], bars.length); }
      onHistory(bars.length);
    } catch { hDone = true; /* błąd odczytu: wykres zostaje z tym, co ma (bez pętli żądań) */ } finally { hBusy = false; }
    // mało świec po lewej (np. porcja z samego weekendu): następna porcja od razu
    if (gen === hGen && !hDone) { const r = chart.timeScale().getVisibleLogicalRange(); if (!r || r.from < HIST_EDGE) loadHistory(); }
  }
  function resetHistory() { hGen++; hist = []; hFrom = null; hDone = !getHistory; hDaily = []; hBusy = false; }
  function put(k) {
    const last = candles[candles.length - 1];
    if (last && last[0] === k[0]) { candles[candles.length - 1] = k; pkg[pkg.length - 1] = pkgOf(k); } else { candles.push(k); pkg.push(pkgOf(k)); }
    series.update(toBar(k)); stat('update');
  }
  function apply(u) {
    if (!u) return;
    if (u.kind === 'reset') {
      candles = [...hist, ...u.bars.map((k) => k.slice(0, 6))];
      series.setData(candles.map(toBar)); stat('setData');
      pkgAll();
      syncMarkers(want?.position || null, true);
      chart.timeScale().scrollToRealTime();
      dirty();
      if (!autoInit) { autoInit = true; requestAnimationFrame(() => requestAnimationFrame(() => { if (!autoY) ps().applyOptions({ autoScale: false }); })); }
      if (!hist.length && !hDone) loadHistory();
    } else if (u.kind === 'append') {
      for (const k of u.bars) put(k.slice(0, 6));
      dirty();
    } else if (u.kind === 'update' && u.bar) {
      put(u.bar.slice(0, 6));
    }
  }

  // ---- 1.7-4: menu prawego kliku (zlecenia po cenie kliknięcia, skoki) ----
  // [U] 1.11.2026 «4 Prawy klik i nawigacja (limit/stop po cenie kliknięcia, krok niezależny od interwału, skok do ceny i do daty)». Wzór: FX Replay (research §1.1 [F8], §1.4 [F11]).
  // getMenu({ price, time, inMargin, clientX, clientY, touch }) → pozycje menu (bt-zlecenia.js menuItems) albo null; wybór wraca przez onMenuPick(item, info). Menu własne otwiera się tylko tam, gdzie
  // wykres nie ma własnej obsługi prawego przycisku: poza narzędziem rysowania, kształtem rysunku, osiami ceny i czasu oraz plakietkami pozycji (te zdarzenia zostają przeglądarce i rysunkom).
  // iOS nie wysyła `contextmenu`, więc na dotyku (pointerType touch) menu otwiera przytrzymanie 500 ms bez ruchu (ruch o ponad 8 px przerywa i przewija wykres).
  let cm = null, cmLongAt = 0;
  const CM_HOLD_MS = 500, CM_MOVE_PX = 8;
  const cmRoot = () => host.closest('.bt-screen') || document.body;
  // punkt wykresu → opis kliknięcia albo null, gdy to miejsce obsługuje wykres, rysunki albo przeglądarka
  function menuInfo(clientX, clientY, touch) {
    if (!getMenu || !candles.length) return null;
    const r = host.getBoundingClientRect(), x = clientX - r.left, y = clientY - r.top;
    if (x < 0 || y < 0 || x > r.width - axisW() || y > paneH()) return null;
    const raw = series.coordinateToPrice(y);
    if (raw == null || !Number.isFinite(raw)) return null;
    if (mgr) {
      if (mgr.tool?.()) return null;
      const hit = mgr.hitTopmost?.({ x, y });
      if (hit && hit.drawing && hit.drawing.id !== curPosId()) return null;
    }
    const li = chart.timeScale().coordinateToLogical(x);
    const inMargin = li != null && li > candles.length - 1 + 0.5;
    return { price: snap(raw), time: li == null ? null : G.indexToTime(candles, Math.round(li), step), inMargin, clientX, clientY, touch: !!touch };
  }
  // runda 2: menu otwarte = replay wstrzymany (onMenuState(true)); zwolnienie (false) dopiero po wyborze albo zamknięciu, a odrzucona pozycja (menu nieaktualne) przerysowuje menu bez wznawiania
  let menuHeld = false;
  const holdMenu = (on) => { if (menuHeld === on) return; menuHeld = on; onMenuState(on); };
  function closeMenu({ refocus = true, release = true } = {}) {
    if (!cm) return;
    const { el, off } = cm;
    cm = null;
    off();
    el.remove();
    if (release) holdMenu(false);
    if (refocus) { if (!host.hasAttribute('tabindex')) host.tabIndex = -1; try { host.focus({ preventScroll: true }); } catch { /* wykres zniszczony */ } }
  }
  function openMenu(info) {
    const items = getMenu(info);
    if (!items || !items.length) return false;
    closeMenu({ refocus: false, release: false });
    const el = document.createElement('div');
    el.className = 'bt-cm';
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', t('Zlecenie z wykresu'));
    el.dataset.inst = instrument;
    el.dataset.price = String(info.price);
    let html = '', sep = false;
    for (const it of items) {
      // grupa skoków oddzielona linią od pozycji handlowych
      if (!sep && it.act && (it.act.type === 'jumpPrice' || it.act.type === 'jumpDate') && html) { html += '<div class="bt-cm-sep" role="separator"></div>'; sep = true; }
      // słowo kierunku (Kup, Sprzedaj, Dołóż) w kolorze kierunku zlecenia; reszta etykiety bez zmian
      const vi = it.verb ? it.label.indexOf(it.verb) : -1;
      const lbl = vi >= 0 ? `${esc(it.label.slice(0, vi))}<span class="bt-cm-v" data-side="${esc(it.side || '')}">${esc(it.verb)}</span>${esc(it.label.slice(vi + it.verb.length))}` : esc(it.label);
      html += `<button type="button" class="bt-cm-i" role="menuitem" tabindex="-1" data-mi="${esc(it.id)}" aria-disabled="${it.disabled ? 'true' : 'false'}"${it.why ? ` title="${esc(it.why)}"` : ''}><span class="bt-cm-l">${lbl}</span>${it.detail ? `<span class="bt-cm-d">${esc(it.detail)}</span>` : ''}</button>`;
    }
    el.innerHTML = html;
    cmRoot().appendChild(el);
    // miejsce przy kursorze, odbicie przy krawędzi wykresu (menu nie wychodzi poza pole wykresu); na telefonie arkusz od dołu stylem
    const hr = host.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = info.clientX + 4, top = info.clientY + 4;
    if (left + w > hr.right - 2) left = info.clientX - w - 4;
    if (top + h > hr.bottom - 2) top = info.clientY - h - 4;
    left = Math.max(hr.left + 2, Math.min(left, hr.right - w - 2));
    top = Math.max(hr.top + 2, Math.min(top, hr.bottom - h - 2));
    el.style.left = `${Math.round(left)}px`; el.style.top = `${Math.round(top)}px`;
    const btns = () => [...el.querySelectorAll('[role="menuitem"]')];
    const pick = (b) => {
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      const it = items.find((x) => x.id === b.dataset.mi);
      closeMenu({ release: false });
      // onMenuPick zwraca 'stale', gdy pozycja przestała być aktualna: menu wraca przerysowane ze stanu bieżącego (replay dalej wstrzymany)
      const res = it ? onMenuPick(it, info) : null;
      if (res === 'stale' && openMenu(info)) return;
      holdMenu(false);
    };
    // runda 2 (P2-1): klawisze obsługuje nasłuch na oknie w fazie przechwytywania, więc działają niezależnie od tego, gdzie jest fokus (zdarzenie wysłane na dokument też); skróty replayu wyłącza flaga z onMenuState.
    const onKey = (ev) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const list = btns(), i = list.indexOf(document.activeElement);
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeMenu(); }
      else if (ev.key === 'ArrowDown') { ev.preventDefault(); ev.stopPropagation(); list[i < 0 ? 0 : (i + 1) % list.length]?.focus(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); ev.stopPropagation(); list[i <= 0 ? list.length - 1 : i - 1]?.focus(); }
      else if (ev.key === 'Home') { ev.preventDefault(); ev.stopPropagation(); list[0]?.focus(); }
      else if (ev.key === 'End') { ev.preventDefault(); ev.stopPropagation(); list[list.length - 1]?.focus(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); pick(el.contains(document.activeElement) ? document.activeElement.closest?.('[role="menuitem"]') : null); }
      // Spacja w replayu włącza odtwarzanie: pod otwartym menu nie robi nic (wybór: Enter albo klik)
      else if (ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); }
      else if (ev.key === 'Tab') { ev.preventDefault(); closeMenu(); }
      // skróty replayu (Spacja, B, S…) nie działają przy otwartym menu
      else ev.stopPropagation();
    };
    const onOutside = (ev) => { if (!el.contains(ev.target)) closeMenu({ refocus: false }); };
    globalThis.addEventListener('keydown', onKey, true);
    el.addEventListener('click', (ev) => pick(ev.target.closest?.('[role="menuitem"]')));
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
    document.addEventListener('pointerdown', onOutside, true);
    globalThis.addEventListener('blur', onWinBlur);
    globalThis.addEventListener('resize', onWinBlur);
    function onWinBlur() { closeMenu({ refocus: false }); }
    cm = { el, info, off: () => { globalThis.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onOutside, true); globalThis.removeEventListener('blur', onWinBlur); globalThis.removeEventListener('resize', onWinBlur); } };
    holdMenu(true);
    // fokus na pierwszej aktywnej pozycji (wzorzec ARIA menu): strzałki, Enter i Esc działają od razu
    (btns().find((b) => b.getAttribute('aria-disabled') !== 'true') || btns()[0])?.focus({ preventScroll: true });
    return true;
  }
  host.addEventListener('contextmenu', (ev) => {
    // plakietki i przyciski warstwy handlu oraz własne okna wykresu zostają bez menu
    if (ev.target.closest?.('.bt-tl, .bt-part')) return;
    // przytrzymanie na dotyku otworzyło menu przed chwilą: systemowe `contextmenu` z tego samego gestu nie otwiera drugiego
    if (performance.now() - cmLongAt < 900) { ev.preventDefault(); return; }
    clearHold();
    const info = menuInfo(ev.clientX, ev.clientY, ev.pointerType === 'touch');
    if (!info) return;
    ev.preventDefault();
    openMenu(info);
  }, true);
  let hold = null;
  function clearHold() { if (!hold) return; clearTimeout(hold.timer); hold = null; globalThis.removeEventListener('pointermove', onHoldMove, true); globalThis.removeEventListener('pointerup', clearHold, true); globalThis.removeEventListener('pointercancel', clearHold, true); }
  function onHoldMove(ev) { if (hold && ev.pointerId === hold.id && Math.hypot(ev.clientX - hold.x, ev.clientY - hold.y) > CM_MOVE_PX) clearHold(); }
  host.addEventListener('pointerdown', (ev) => {
    if (!getMenu || ev.pointerType !== 'touch' || !ev.isPrimary || ev.target.closest?.('.bt-tl, .bt-part')) return;
    clearHold();
    const x = ev.clientX, y = ev.clientY;
    hold = { id: ev.pointerId, x, y, timer: setTimeout(() => {
      clearHold();
      const info = menuInfo(x, y, true);
      if (info && openMenu(info)) cmLongAt = performance.now();
    }, CM_HOLD_MS) };
    globalThis.addEventListener('pointermove', onHoldMove, true);
    globalThis.addEventListener('pointerup', clearHold, true);
    globalThis.addEventListener('pointercancel', clearHold, true);
  }, true);

  return {
    apply,
    menuEl: () => cm?.el ?? null, closeMenu,
    setAuto, auto: () => autoY, hold: holdScale,
    bars: () => candles,
    overlays: () => overlayModel(), // H1: model nakładek (sesje, PDH/PDL) do sprawdzenia „brak przyszłości” w odbiorze
    setTf(next) { step = tfSec(next); secs = (parseTf(next)?.sec ?? 60) < 60; chart.applyOptions(timeOpts()); resetHistory(); },
    // K: okno bazowe przesunięte w prawo: świece odcięte z okna (już zagregowane do interwału wykresu) dochodzą na koniec historii; potem wywołujący daje reset z buildera
    appendHistory(bars, from) { const add = (bars || []).filter((k) => !hist.length || k[0] > hist[hist.length - 1][0]).map((k) => k.slice(0, 6)); hist = [...hist, ...add]; if (hFrom == null && Number.isFinite(from)) hFrom = from; },
    // K: okno bazowe przeładowane wcześniej (krok wstecz): historia tylko przed nowym początkiem okna
    trimHistory(before) { hGen++; hBusy = false; hist = hist.filter((k) => k[0] < before); hDaily = hDaily.filter((k) => k[0] < before); if (!hist.length) { hFrom = null; hDone = !getHistory; } },
    history: () => ({ bars: hist.length, from: hFrom, done: hDone, busy: hBusy }),
    // final (P2-1): znaczniki otwartej pozycji przy osi cen (test i odbiór)
    // 1.7-2: markery porcji pozycji (testy)
    fillMarks: () => marksNow.map((m) => ({ ...m })),
    positionMarks: () => posLines.map((l) => { const o = l.options(); return { title: o.title, price: o.price, axis: o.axisLabelVisible, line: o.lineVisible !== false }; }),
    loadHistory,
    liveBars,
    setHideDate(on) { hide = !!on; chart.applyOptions(timeOpts()); newsModel = null; nprim.requestUpdate(); },
    setCursorLine(t) { cursorT = t ?? null; cursorPrim.req?.(); },
    newsChanged() { newsModel = null; nprim.requestUpdate(); },
    resize() { chart.timeScale().applyOptions({}); },
    crossT: () => cursorT,
    rysunki: () => rys,
    statLabels: (d) => extras?.statLabels(d) || [], // J: podpisy pozycji (testy)
    // C2: setTrading({ position, orders: [{ id, price, side, title }] }); w trakcie przeciągania rysunku zmiana czeka na puszczenie przycisku
    setTrading(st) { want = st; applyTrading(st); },
    // 1.7-1: komunikat aria-live i błysk plakietki po zapisie z wykresu (wywołujący zna wynik silnika), stan przeciągania i linii w ręku (testy)
    announce, flash, openPart,
    dragInfo: () => (drag ? { kind: drag.kind, field: drag.field, price: drag.price } : null),
    handInfo: () => (hand ? { field: hand.field, price: hand.price, bad: hand.bad } : null),
    cancelHand,
    // L: warstwa handlu (testy i szuflada): etykiety z tekstem i położeniem
    tradeLayer: () => layer,
    focusTag(k) { const el = k.startsWith('tp:') ? layer.querySelector(`.bt-tag[data-id="${CSS.escape(k.slice(3))}"]`) : layer.querySelector(`[data-k="${k}"]`); el?.focus(); return !!el; },
    tradingState: () => ({ position: curPosId() && mgr ? mgr.get(curPosId()) : null, orders: lines.filter((l) => l.field === 'price').map(({ id, price, title }) => ({ id, price, title })) }),
    manager: () => mgr,
    destroy() {
      closeMenu({ refocus: false }); clearHold();
      mo?.disconnect(); ro?.disconnect(); if (layerRaf) cancelAnimationFrame(layerRaf); clearTimeout(offTimer); clearInterval(yWatch); layer.remove();
      cancelHand(false); if (drag) endDragState(); closePart({ refocus: false }); closePct({ refocus: false });
      globalThis.removeEventListener('pointerdown', onLineDown, true);
      if (rys) { rys.destroy().catch(() => {}).finally(() => { try { chart.remove(); } catch { /* już usunięty */ } }); return; } // najpierw menedżer rysunków (po zapisie zaległej zmiany), potem wykres
      try { mgr?.destroy(); } catch { /* już zniszczony */ }
      try { chart.remove(); } catch { /* już usunięty */ }
    },
    chart, series, instrument,
  };
}
