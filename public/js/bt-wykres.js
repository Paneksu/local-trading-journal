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
// English: replay chart host: incremental series updates, overlays recomputed only on a new candle, optional hidden date, trading layer (position drawing + order lines).
import { themeOptions, candleOptions, overlayPrimitive, newsPrimitive, positionDrawing, extrasPrimitive, probe, readColors } from './wykres.js';
import { positionPrices, tickOf, createRysunki } from './rysunki.js';
import * as G from './geometria.js';
import { loadOverlays, sessionDefs, chartTz, fmtIn, tfSec } from './podglad.js';
import { sessionWindows, pdhlSpans, overlayLevels, parseTf } from './swiece.js';
import { buildNewsModel } from './newsy.js';
import { locale } from './i18n.js';

const toBar = (k) => ({ time: k[0], open: k[1], high: k[2], low: k[3], close: k[4] });
const stat = (k) => { const s = globalThis.__btStats; if (s) s[k] = (s[k] || 0) + 1; }; // licznik dla strony testowej (testy/backtest-replay.html)

// opts: { LWC, D (paczka rysowania, opcjonalna: bez niej brak rysunku pozycji), instrument, tf, colors, onCrosshair, hideDate, daily: Bar[] (sesje dzienne sprzed dnia replayu, do PDH/PDL), getNews: () => Event[] }
export function createReplayChart(host, { LWC, D = null, instrument = '', tf = '1m', colors, onCrosshair = () => {}, hideDate = false, daily = [], getNews = () => [], rysunki = null } = {}) {
  if (!LWC) throw new Error('bt-wykres: brak modułu Lightweight Charts');
  let c = colors;
  let candles = [], hide = !!hideDate, step = tfSec(tf), secs = (parseTf(tf)?.sec ?? 60) < 60, cursorT = null;
  let ovModel = null, newsModel = null; // pamięć modeli nakładek: unieważniana przy nowej świecy, resecie i zmianie TF
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
  const overlayModel = () => {
    if (ovModel) return ovModel;
    if (!candles.length) return (ovModel = { boxes: [], lines: [] });
    const times = candles.map((k) => k[0]);
    const windows = prefs.sessions ? sessionWindows(times[0], times[times.length - 1] + 1, sessionDefs(prefs)) : [];
    const pd = prefs.pdhl ? pdhlSpans(times, daily) : [];
    return (ovModel = overlayLevels(candles, { windows, pd, sweep: prefs.sweep }));
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
      colors: () => c, instrument, tradeId: null, doc: rysunki.doc || null, confirm: rysunki.confirm, saveDoc: rysunki.saveDoc, isActive: rysunki.isActive,
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
  function applyTrading(st) {
    for (const l of lines) { try { series.removePriceLine(l.line); } catch { /* już usunięta */ } }
    lines = (st.orders || []).map((o) => ({ id: o.id, price: o.price, title: o.title, line: series.createPriceLine({ price: o.price, color: o.side === 'buy' ? c.profit : c.loss, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: o.title }) }));
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
  function put(k) {
    const last = candles[candles.length - 1];
    if (last && last[0] === k[0]) candles[candles.length - 1] = k; else candles.push(k);
    series.update(toBar(k)); stat('update');
  }
  function apply(u) {
    if (!u) return;
    if (u.kind === 'reset') {
      candles = u.bars.map((k) => k.slice(0, 6));
      series.setData(candles.map(toBar)); stat('setData');
      chart.timeScale().scrollToRealTime();
      dirty();
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
    setTf(next) { step = tfSec(next); secs = (parseTf(next)?.sec ?? 60) < 60; chart.applyOptions(timeOpts()); },
    setHideDate(on) { hide = !!on; chart.applyOptions(timeOpts()); newsModel = null; nprim.requestUpdate(); },
    setCursorLine(t) { cursorT = t ?? null; cursorPrim.req?.(); },
    newsChanged() { newsModel = null; nprim.requestUpdate(); },
    resize() { chart.timeScale().applyOptions({}); },
    crossT: () => cursorT,
    rysunki: () => rys,
    statLabels: (d) => extras?.statLabels(d) || [], // J: podpisy pozycji (testy)
    // C2: setTrading({ position, orders: [{ id, price, side, title }] }); w trakcie przeciągania rysunku zmiana czeka na puszczenie przycisku
    setTrading(st) { want = st; if (!pressed) applyTrading(st); },
    onPositionEdit(fn) { posEdit = fn; },
    tradingState: () => ({ position: curPosId() && mgr ? mgr.get(curPosId()) : null, orders: lines.map(({ id, price, title }) => ({ id, price, title })) }),
    manager: () => mgr,
    destroy() {
      clearTimeout(editTimer); mo?.disconnect();
      host.removeEventListener('pointerdown', onDown, true); globalThis.removeEventListener?.('pointerup', onUp, true);
      if (rys) { rys.destroy().catch(() => {}).finally(() => { try { chart.remove(); } catch { /* już usunięty */ } }); return; } // najpierw menedżer rysunków (po zapisie zaległej zmiany), potem wykres
      try { mgr?.destroy(); } catch { /* już zniszczony */ }
      try { chart.remove(); } catch { /* już usunięty */ }
    },
    chart, series, instrument,
  };
}
