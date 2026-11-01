// Wykres replayu modułu Backtest (1.5.0, pakiet C1): własny gospodarz Lightweight Charts, bez createEditor z wykres.js (bierze tylko funkcje pomocnicze).
// Dane płyną wyłącznie aktualizacjami z createBuilder (bt-swieca.js): 'reset' → series.setData, 'update' i 'append' → series.update po kolei, więc krok kosztuje
// jedną albo dwie świece, a nie przelanie całej serii. Nakładki sesji i PDH/PDL (overlayPrimitive) i newsy (newsPrimitive) liczą się tylko ze świec widocznych
// i tylko przy nowej świecy (przy aktualizacji bieżącej model zostaje z pamięci). Newsy: plan dnia bez wyników (visibleNews z bt-czas.js podaje replay).
// Ukryta data (sesja losowa): oś czasu i etykieta krzyżyka pokazują same godziny.
// C2: warstwa handlu. Otwarta pozycja to rysunek long/short-position z paczki rysowania (D), odblokowany, więc SL i TP przeciąga się na wykresie; zmiana ceny idzie
// do wywołującego przez onPositionEdit (po 150 ms ciszy i po puszczeniu przycisku, bez zapisu przy każdym pikselu). Zlecenia oczekujące to linie ceny (limit/stop).
// D1: rysunki (rysunki.js, paczka rysowania) na każdym wykresie: opcja `rysunki` = { bar, panel, stage, gear, foot, doc, saveDoc, isActive, onChange, confirm }. Pozycja jest rysunkiem
// pomocniczym rysunki.js (`extra`, nie wchodzi do zapisu rysunków), a przeciągnięcie jej SL/TP wraca przez onPositionEdit. Linia czasu wspólnego krzyżyka (setCursorLine) stoi na
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
import { sessionWindows, pdhlSpans, overlayLevels, parseTf } from './swiece.js';
import { buildNewsModel } from './newsy.js';
import { locale } from './i18n.js';
import { fmtR } from './format.js';
import { MULT } from './bt-wypelnienia.js';

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
export function createReplayChart(host, { LWC, D = null, instrument = '', tf = '1m', colors, onCrosshair = () => {}, hideDate = false, daily = [], getNews = () => [], rysunki = null, getHistory = null, historyEnd = () => null, getDaily = () => [], onHistory = () => {}, plOf = null, onTradeAction = null, fmtUsd = (x) => String(x), labels = {} } = {}) {
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
    localization: { timeFormatter: (time) => { const d = new Date(time * 1000), f = fmt(); return hide ? (secs ? f.HMS : f.HM).format(d) : f.FULL.format(d) + (secs ? ':' + String(d.getUTCSeconds()).padStart(2, '0') : ''); }, priceFormatter: (p) => priceFmt.format(p) },
  });
  const th = themeOptions(c);
  const chart = LWC.createChart(host, {
    autoSize: true, ...th,
    timeScale: { ...th.timeScale, ...timeOpts().timeScale, rightOffset: 6, shiftVisibleRangeOnNewBar: true },
    localization: timeOpts().localization,
  });
  const series = chart.addSeries(LWC.CandlestickSeries, { ...candleOptions(c), lastValueVisible: true, priceLineVisible: false });

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
  let mgr = null, posId = null, applying = false, pressed = false, posEdit = null, editTimer = 0, lines = [], want = null, wantPos = null;
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
      hold: (on) => {
        const ps = series.priceScale();
        if (on && !held) {
          const o = chart.options();
          held = { opts: { handleScroll: structuredClone(o.handleScroll), handleScale: structuredClone(o.handleScale) }, auto: ps.options().autoScale };
          chart.applyOptions({ handleScroll: false, handleScale: false });
          if (held.auto) ps.applyOptions({ autoScale: false });
        } else if (!on && held) { chart.applyOptions(held.opts); if (held.auto) ps.applyOptions({ autoScale: true }); held = null; }
      },
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
    linesSig = ''; posSig = ''; if (want) applyTrading(want);
  }) : null;
  mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
  const curPosId = () => (rys ? rys.positionId() : posId);
  if (mgr) mgr.on('change', () => { if (!applying && curPosId()) schedule(); });
  const onDown = () => { pressed = true; };
  const onUp = () => { if (!pressed) return; pressed = false; if (want && !editTimer) applyTrading(want); }; // oczekująca edycja ma pierwszeństwo: po zatwierdzeniu wywołujący odświeży rysunek
  host.addEventListener('pointerdown', onDown, true);
  globalThis.addEventListener?.('pointerup', onUp, true);
  function schedule() { clearTimeout(editTimer); editTimer = setTimeout(fire, 150); }
  function fire() {
    if (pressed) { schedule(); return; }
    editTimer = 0;
    const pid = curPosId(), d = pid && mgr.get(pid);
    if (d) posEdit?.(positionPrices(d, tick));
  }
  const candleAtOrBefore = (t) => { for (let i = candles.length - 1; i >= 0; i--) if (candles[i][0] <= t) return candles[i][0]; return candles.length ? candles[0][0] : t; };
  // final (ocena wyglądu 2, P1-N1): na wąskim wykresie znaczniki osi bez tytułów (LONG, SL, LMT): krótka plakietka obok osi pełni tę rolę i nie nachodzi na tytuł
  const narrowNow = () => (host.clientWidth || 0) > 0 && host.clientWidth < 640;
  // L: linie zleceń (cena, SL, TP) przebudowywane tylko przy zmianie zleceń (wcześniej przy każdej klatce odtwarzania)
  let linesSig = '';
  function orderLines(orders) {
    const sig = JSON.stringify(orders.map((o) => [o.id, o.price, o.sl, o.tp, o.side, o.title]));
    if (sig === linesSig) return;
    linesSig = sig;
    for (const l of lines) { try { series.removePriceLine(l.line); } catch { /* już usunięta */ } }
    lines = [];
    for (const o of orders) {
      // M poprawki (ocena wyglądu #4): przy prawej osi tylko krótki znacznik rodzaju (pełny opis jest w etykiecie przy lewej krawędzi), żeby strefa ostatnich świec była czysta
      lines.push({ id: o.id, field: 'price', price: o.price, title: o.title, line: series.createPriceLine({ price: o.price, color: o.side === 'buy' ? c.profit : c.loss, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: narrowNow() ? '' : o.type === 'stop' ? 'STP' : 'LMT' }) });
      if (o.sl != null) lines.push({ id: o.id, field: 'sl', price: o.sl, title: 'SL', line: series.createPriceLine({ price: o.sl, color: c.loss, lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: narrowNow() ? '' : 'SL' }) });
      if (o.tp != null) lines.push({ id: o.id, field: 'tp', price: o.tp, title: 'TP', line: series.createPriceLine({ price: o.tp, color: c.profit, lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: narrowNow() ? '' : 'TP' }) });
    }
  }
  // final (ocena wyglądu P2-1): otwarta pozycja ma znaczniki przy osi cen jak zlecenia (wejście, SL albo BE, TP) i słabą kropkowaną linię;
  // etykiety z kwotą przy lewej krawędzi bez zmian. Linie pozycji nie są przeciągane (SL/TP przesuwa się w rysunku pozycji)
  let posSig = '', posLines = [];
  function positionLines(p) {
    const sig = p ? JSON.stringify([p.id, p.dir, p.entryPrice, p.sl, p.tp, p.be]) : '';
    if (sig === posSig) return;
    posSig = sig;
    for (const l of posLines) { try { series.removePriceLine(l); } catch { /* już usunięta */ } }
    posLines = [];
    if (!p) return;
    const short = p.dir === 'Short';
    posLines.push(series.createPriceLine({ price: p.entryPrice, color: short ? c.loss : c.profit, lineWidth: 1, lineStyle: 4, axisLabelVisible: true, title: narrowNow() ? '' : short ? 'SHORT' : 'LONG' }));
    if (p.sl != null) posLines.push(series.createPriceLine({ price: p.sl, color: p.be ? c.be : c.loss, lineWidth: 1, lineStyle: 4, axisLabelVisible: true, title: narrowNow() ? '' : p.be ? 'BE' : 'SL' }));
    if (p.tp != null) posLines.push(series.createPriceLine({ price: p.tp, color: c.profit, lineWidth: 1, lineStyle: 4, axisLabelVisible: true, title: narrowNow() ? '' : 'TP' }));
  }
  // ---- L: warstwa handlu nad wykresem (DOM): etykieta otwartej pozycji z X → 25/50/75/100% i przeciągane etykiety zleceń oczekujących ----
  // [U] 31.10.2026 «Przyjmuję wszystkie» (X na linii pozycji z zamknięciem części, przeciągane zlecenia oczekujące z SL/TP jak w FX Replay)
  const layer = document.createElement('div');
  layer.className = 'bt-tl';
  host.appendChild(layer);
  let layerSt = null, drag = null, menuOpen = false, layerRaf = 0;
  const yOf = (p) => { try { const y = series.priceToCoordinate(p); return y == null ? null : y; } catch { return null; } };
  const axisW = () => { try { return series.priceScale().width() || 0; } catch { return 0; } };
  const cls = (x) => (x > 1e-9 ? 'pos' : x < -1e-9 ? 'neg' : '');
  const pf = (p) => priceFmt.format(p);
  function tagHtml(key, text, extra = '', cl = '') {
    return `<div class="bt-tag ${cl}" data-k="${key}"><span class="bt-tag-t">${text}</span>${extra}</div>`;
  }
  // struktura warstwy przebudowywana tylko przy zmianie pozycji/zleceń; tekst i położenie przy każdej klatce
  let layerSig = '';
  function paintLayer(st) {
    layerSt = st;
    const p = st?.position || null, orders = st?.orders || [], rw = !!st?.rw;
    const sig = JSON.stringify([p ? [p.id, p.openQty, p.sl != null, p.tp != null] : null, orders.map((o) => [o.id, o.sl != null, o.tp != null]), rw, menuOpen]);
    if (sig !== layerSig) {
      layerSig = sig;
      let h = '';
      if (p) {
        const pcts = [25, 50, 75, 100].map((x) => { const q = Math.min(p.openQty, Math.max(1, Math.round((p.openQty * x) / 100))); return `<button type="button" class="btn sm" data-tl="pct" data-pct="${x}">${x}% (${q})</button>`; }).join('');
        h += tagHtml('pos', '', `<button type="button" class="icon-btn bt-tag-x" data-tl="x" aria-expanded="${menuOpen}" aria-label="${labels.close || 'Zamknij'}" title="${labels.close || 'Zamknij'}" ${rw ? 'disabled' : ''}>×</button>`
          + (menuOpen ? `<div class="bt-tag-m" role="group" aria-label="${labels.closePart || ''}">${pcts}</div>` : ''), 'bt-tag-pos');
        // M (31.10.2026): SL i TP otwartej pozycji z kwotą (jak w FX Replay); przesuwa się je w rysunku pozycji, etykiety tylko pokazują poziom i wynik
        if (p.sl != null) h += tagHtml('psl', '', '', 'bt-tag-o sl bt-tag-lv');
        if (p.tp != null) h += tagHtml('ptp', '', '', 'bt-tag-o tp bt-tag-lv');
      }
      for (const o of orders) {
        h += tagHtml(`o:${o.id}:price`, '', `<button type="button" class="icon-btn bt-tag-x" data-tl="cancel" data-id="${o.id}" aria-label="${labels.cancel || 'Anuluj'}" title="${labels.cancel || 'Anuluj'}" ${rw ? 'disabled' : ''}>×</button>`, `bt-tag-o ${o.side === 'buy' ? 'buy' : 'sell'}${rw ? '' : ' drag'}`);
        if (o.sl != null) h += tagHtml(`o:${o.id}:sl`, '', '', `bt-tag-o sl${rw ? '' : ' drag'}`);
        if (o.tp != null) h += tagHtml(`o:${o.id}:tp`, '', '', `bt-tag-o tp${rw ? '' : ' drag'}`);
      }
      layer.innerHTML = h;
      for (const el of layer.querySelectorAll('.bt-tag-o.drag')) { el.tabIndex = 0; el.setAttribute('role', 'slider'); }
    }
    placeLayer();
  }
  function placeLayer() {
    const st = layerSt;
    if (!st) return;
    // M (31.10.2026): etykiety przy lewej krawędzi wykresu (jak linie zleceń w TradingView): przy prawej osi zasłaniały świece przy kursorze
    // M poprawki (ocena wyglądu #1): etykieta widoczna tylko w polu świec (bez osi czasu), z marginesem na połowę jej wysokości
    let axisH = 0;
    try { axisH = chart.timeScale().height() || 0; } catch { axisH = 0; }
    const left = 8, H = Math.max(0, (host.clientHeight || 0) - axisH), narrow = (host.clientWidth || 0) < 640;
    const set = (el, y, text, cl) => {
      if (!el) return;
      const vis = y != null && y >= 11 && y <= H - 11;
      el.hidden = !vis;
      // M: tekst aktualny także poza widokiem (etykieta wraca z właściwą kwotą po przewinięciu)
      const tx = el.querySelector('.bt-tag-t');
      if (tx.textContent !== text) tx.textContent = text;
      if (!vis) return;
      el.style.top = `${Math.round(y)}px`;
      // final (ocena wyglądu 2, P1-N1): na wąskim wykresie krótka plakietka przy prawej krawędzi pola świec (obok znaczników osi), w pustym
      // marginesie za ostatnią świecą (narrowOffset), a nie nad strefą wejścia; pełny opis jest w szufladzie
      if (narrow) { el.style.left = 'auto'; el.style.right = `${axisW() + 4}px`; } else { el.style.left = `${left}px`; el.style.right = ''; }
      if (cl !== undefined) { el.classList.toggle('pos', cl === 'pos'); el.classList.toggle('neg', cl === 'neg'); }
    };
    const p = st.position;
    if (p) {
      const pl = plOf ? plOf(p) : null;
      const dir = p.dir === 'Short' ? 'SHORT' : 'LONG';
      // M: kwota i R przed punktami (na wąskim wykresie etykieta jest ucinana od końca)
      const txt = narrow ? (pl ? `${dir} ${fmtR(pl.r)}` : dir) : pl ? `${dir} ${p.openQty} · ${fmtUsd(pl.usd)} · ${fmtR(pl.r)} · ${pl.pts > 0 ? '+' : pl.pts < 0 ? '−' : ''}${pf(Math.abs(pl.pts))} ${labels.pts || 'pkt'}` : `${dir} ${p.openQty}`;
      set(layer.querySelector('[data-k="pos"]'), yOf(p.entryPrice), txt, pl ? cls(pl.usd) : '');
      const m = (MULT[p.instrument] || 0) * p.openQty;
      const lv = (k, px, lab, sign) => set(layer.querySelector(`[data-k="${k}"]`), yOf(px), narrow ? (m ? `${lab} ${fmtUsd(sign * Math.abs(px - p.entryPrice) * m)}` : lab) : `${lab} ${pf(px)}${m ? ` · ${fmtUsd(sign * Math.abs(px - p.entryPrice) * m)}` : ''}`);
      const sgn = p.dir === 'Short' ? -1 : 1;
      if (p.sl != null) lv('psl', p.sl, p.be ? 'BE' : 'SL', Math.sign((p.sl - p.entryPrice) * sgn) || 0);
      if (p.tp != null) lv('ptp', p.tp, 'TP', 1);
    }
    for (const o of st.orders || []) {
      for (const f of ['price', 'sl', 'tp']) {
        const el = layer.querySelector(`[data-k="o:${o.id}:${f}"]`);
        if (!el) continue;
        const live = drag && drag.id === o.id && drag.field === f ? drag.price : o[f];
        let text;
        // M poprawki (ocena wyglądu #2): kwota ryzyka przed ceną; na wąskim wykresie bez ceny (jest na osi), żeby kwota zawsze się mieściła
        if (f === 'price') text = narrow ? `${o.type === 'stop' ? 'STP' : 'LMT'}${o.risk != null ? ` ${fmtUsd(-o.risk)}` : ''}` : `${o.side === 'buy' ? (labels.buy || 'Kup') : (labels.sell || 'Sprzedaj')} ${o.type} ${o.qty}${o.risk != null ? ` · ${fmtUsd(-o.risk)}` : ''} @ ${pf(live)}`;
        else {
          const m = o.risk != null && o.sl != null && o.sl !== o.price ? o.risk / Math.abs(o.price - o.sl) : null;
          const usd = m != null ? Math.abs(live - (drag && drag.id === o.id && drag.field === 'price' ? drag.price : o.price)) * m : null;
          text = narrow ? `${f === 'sl' ? 'SL' : 'TP'}${usd != null ? ` ${fmtUsd(f === 'sl' ? -usd : usd)}` : ''}` : `${f === 'sl' ? 'SL' : 'TP'} ${pf(live)}${usd != null ? ` · ${fmtUsd(f === 'sl' ? -usd : usd)}` : ''}`;
        }
        set(el, yOf(live), text);
        el.setAttribute('aria-valuenow', String(live));
        el.setAttribute('aria-label', text);
      }
    }
  }
  // final (P1-N1): na wąskim wykresie pusty margines za ostatnią świecą na krótkie plakietki (ok. 110 px); szerszy wykres wraca do 6 świec
  let narrowWas = null;
  function narrowOffset() {
    const n = (host.clientWidth || 0) > 0 && host.clientWidth < 640;
    if (n === narrowWas) return;
    narrowWas = n;
    linesSig = ''; posSig = ''; if (want) applyTrading(want);
    try { const sp = chart.timeScale().options().barSpacing || 6; chart.timeScale().applyOptions({ rightOffset: n ? Math.ceil(110 / sp) + 1 : 6 }); } catch { /* wykres zniszczony */ }
  }
  const relayout = () => { if (layerRaf) return; layerRaf = requestAnimationFrame(() => { layerRaf = 0; narrowOffset(); placeLayer(); }); };
  chart.timeScale().subscribeVisibleLogicalRangeChange(relayout);
  // M poprawki (ocena wyglądu #1): zmiana wysokości wykresu (panel zleceń, szuflada, obrót telefonu) przesuwa linie bez ruchu osi czasu
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(relayout) : null;
  ro?.observe(host);
  host.addEventListener('wheel', relayout, { passive: true });
  host.addEventListener('pointermove', (ev) => { if (ev.buttons) relayout(); });
  const tick0 = tickOf(instrument);
  const snap = (p) => Math.round(p / tick0) * tick0;
  function lineOf(id, field) { return lines.find((l) => l.id === id && l.field === field); }
  layer.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    ev.stopPropagation();
    if (b.dataset.tl === 'x') { menuOpen = !menuOpen; paintLayer(layerSt); return; }
    if (b.dataset.tl === 'pct') { menuOpen = false; onTradeAction?.({ kind: 'pct', pct: Number(b.dataset.pct) }); return; }
    if (b.dataset.tl === 'cancel') onTradeAction?.({ kind: 'cancel', id: b.dataset.id });
  });
  // przeciąganie w pionie: etykieta i linia idą za kursorem (cena do ticka), puszczenie składa zmianę przez onTradeAction → modifyOrder
  layer.addEventListener('pointerdown', (ev) => {
    const el = ev.target.closest('.bt-tag-o.drag');
    if (!el || ev.target.closest('button') || ev.button !== 0) return;
    const [, id, field] = el.dataset.k.split(':');
    const o = (layerSt?.orders || []).find((x) => x.id === id);
    if (!o) return;
    ev.preventDefault(); ev.stopPropagation();
    const r = host.getBoundingClientRect();
    drag = { id, field, price: o[field], el, top: r.top, pid: ev.pointerId };
    try { el.setPointerCapture(ev.pointerId); } catch { /* syntetyczne zdarzenie bez przechwycenia */ }
    el.classList.add('dragging');
  });
  const onMove = (ev) => {
    if (!drag || ev.pointerId !== drag.pid) return;
    const p = series.coordinateToPrice(ev.clientY - drag.top);
    if (p == null || !Number.isFinite(p)) return;
    drag.price = snap(p);
    lineOf(drag.id, drag.field)?.line.applyOptions({ price: drag.price });
    placeLayer();
  };
  const onEnd = (ev) => {
    if (!drag || ev.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    d.el.classList.remove('dragging');
    const o = (layerSt?.orders || []).find((x) => x.id === d.id);
    if (!o || d.price === o[d.field]) { linesSig = ''; if (layerSt) applyTrading(layerSt); return; }
    linesSig = '';
    onTradeAction?.({ kind: 'move', id: d.id, changes: { [d.field]: d.price } });
  };
  layer.addEventListener('pointermove', onMove);
  layer.addEventListener('pointerup', onEnd);
  layer.addEventListener('pointercancel', onEnd);
  // klawiatura: strzałki góra/dół przesuwają o tick (Shift: o 4 ticki = 1 pkt), bez przewijania wykresu i skrótów rysunków
  layer.addEventListener('keydown', (ev) => {
    const el = ev.target.closest?.('.bt-tag-o.drag');
    if (!el || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
    ev.preventDefault(); ev.stopPropagation();
    const [, id, field] = el.dataset.k.split(':');
    const o = (layerSt?.orders || []).find((x) => x.id === id);
    if (!o) return;
    const d = (ev.key === 'ArrowUp' ? 1 : -1) * tick0 * (ev.shiftKey ? 4 : 1);
    onTradeAction?.({ kind: 'move', id, changes: { [field]: snap(o[field] + d) }, focus: el.dataset.k });
  });
  function applyTrading(st) {
    if (!drag) orderLines(st.orders || []);
    positionLines(st.position || null);
    paintLayer(st);
    if (!mgr) return;
    applying = true;
    try {
      const p = st.position;
      let d = null;
      if (p) {
        const last = candles.length ? candles[candles.length - 1][0] : p.entryT;
        d = positionDrawing({ entryPrice: p.entryPrice, sl: p.sl, tp: p.tp, be: p.be ? p.entryPrice : undefined, at: candleAtOrBefore(p.entryT) * 1000 }, D, c, last);
        if (d) d.locked = false;
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
      chart.timeScale().scrollToRealTime();
      dirty();
      if (!hist.length && !hDone) loadHistory();
    } else if (u.kind === 'append') {
      for (const k of u.bars) put(k.slice(0, 6));
      dirty();
    } else if (u.kind === 'update' && u.bar) {
      put(u.bar.slice(0, 6));
    }
  }

  return {
    apply,
    bars: () => candles,
    overlays: () => overlayModel(), // H1: model nakładek (sesje, PDH/PDL) do sprawdzenia „brak przyszłości” w odbiorze
    setTf(next) { step = tfSec(next); secs = (parseTf(next)?.sec ?? 60) < 60; chart.applyOptions(timeOpts()); resetHistory(); },
    // K: okno bazowe przesunięte w prawo: świece odcięte z okna (już zagregowane do interwału wykresu) dochodzą na koniec historii; potem wywołujący daje reset z buildera
    appendHistory(bars, from) { const add = (bars || []).filter((k) => !hist.length || k[0] > hist[hist.length - 1][0]).map((k) => k.slice(0, 6)); hist = [...hist, ...add]; if (hFrom == null && Number.isFinite(from)) hFrom = from; },
    // K: okno bazowe przeładowane wcześniej (krok wstecz): historia tylko przed nowym początkiem okna
    trimHistory(before) { hGen++; hBusy = false; hist = hist.filter((k) => k[0] < before); hDaily = hDaily.filter((k) => k[0] < before); if (!hist.length) { hFrom = null; hDone = !getHistory; } },
    history: () => ({ bars: hist.length, from: hFrom, done: hDone, busy: hBusy }),
    // final (P2-1): znaczniki otwartej pozycji przy osi cen (test i odbiór)
    positionMarks: () => posLines.map((l) => { const o = l.options(); return { title: o.title, price: o.price, axis: o.axisLabelVisible }; }),
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
    setTrading(st) { want = st; if (!pressed) applyTrading(st); },
    // L: warstwa handlu (testy i szuflada): etykiety z tekstem i położeniem
    tradeLayer: () => layer,
    focusTag(k) { const el = layer.querySelector(`[data-k="${k}"]`); el?.focus(); return !!el; },
    onPositionEdit(fn) { posEdit = fn; },
    tradingState: () => ({ position: curPosId() && mgr ? mgr.get(curPosId()) : null, orders: lines.filter((l) => l.field === 'price').map(({ id, price, title }) => ({ id, price, title })) }),
    manager: () => mgr,
    destroy() {
      clearTimeout(editTimer); mo?.disconnect(); ro?.disconnect(); if (layerRaf) cancelAnimationFrame(layerRaf); layer.remove();
      host.removeEventListener('pointerdown', onDown, true); globalThis.removeEventListener?.('pointerup', onUp, true);
      if (rys) { rys.destroy().catch(() => {}).finally(() => { try { chart.remove(); } catch { /* już usunięty */ } }); return; } // najpierw menedżer rysunków (po zapisie zaległej zmiany), potem wykres
      try { mgr?.destroy(); } catch { /* już zniszczony */ }
      try { chart.remove(); } catch { /* już usunięty */ }
    },
    chart, series, instrument,
  };
}
