var pr = Object.defineProperty;
var mr = (e, t, n) => t in e ? pr(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n;
var N = (e, t, n) => mr(e, typeof t != "symbol" ? t + "" : t, n);
const vn = {
  color: "#2962ff",
  width: 1,
  lineStyle: "solid"
};
function br(e, t) {
  if (!e || !t) return !0;
  const n = /^(\d+)([A-Z]+)?$/.exec(t.trim().toUpperCase());
  if (!n) return !0;
  const o = Math.max(1, parseInt(n[1], 10)), i = (r, l) => r.on && l >= r.from && l <= r.to;
  switch (n[2]) {
    case "T":
      return e.ticks;
    // tick charts  ("1T".."1000T")
    case "R":
      return e.ranges;
    // range charts ("1R".."1000R")
    case "S":
      return i(e.seconds, o);
    case "D":
      return i(e.days, o);
    case "W":
      return i(e.weeks, o);
    case "M":
      return i(e.months, o);
    case void 0:
      return o % 60 === 0 ? i(e.hours, o / 60) : o < 60 ? i(e.minutes, o) : i(e.hours, Math.round(o / 60));
    default:
      return !0;
  }
}
const j = "#808080", rt = "#f23645", nt = "#ff9800", it = "#4caf50", q = "#089981", J = "#00bcd4", $ = "#2962ff", ne = "#9c27b0", ut = "#e91e63", qt = "#673ab7", Pt = [
  { coeff: 0, color: j, visible: !0 },
  { coeff: 0.236, color: rt, visible: !0 },
  { coeff: 0.382, color: nt, visible: !0 },
  { coeff: 0.5, color: it, visible: !0 },
  { coeff: 0.618, color: q, visible: !0 },
  { coeff: 0.786, color: J, visible: !0 },
  { coeff: 1, color: j, visible: !0 },
  { coeff: 1.618, color: $, visible: !0 },
  { coeff: 2.618, color: rt, visible: !0 },
  { coeff: 3.618, color: ne, visible: !0 },
  { coeff: 4.236, color: ut, visible: !0 },
  { coeff: 1.272, color: nt, visible: !1 },
  { coeff: 1.414, color: rt, visible: !1 },
  { coeff: 2.272, color: nt, visible: !1 },
  { coeff: 2.414, color: it, visible: !1 },
  { coeff: 2, color: q, visible: !1 },
  { coeff: 3, color: J, visible: !1 },
  { coeff: 3.272, color: j, visible: !1 },
  { coeff: 3.414, color: $, visible: !1 },
  { coeff: 4, color: rt, visible: !1 },
  { coeff: 4.272, color: ne, visible: !1 },
  { coeff: 4.414, color: ut, visible: !1 },
  { coeff: 4.618, color: nt, visible: !1 },
  { coeff: 4.764, color: q, visible: !1 }
], kt = [
  { coeff: 0.25, color: "#ffb74d", visible: !1 },
  // tan-orange-300
  { coeff: 0.382, color: "#81c784", visible: !1 },
  // iguana-green-300
  { coeff: 0.5, color: q, visible: !0 },
  { coeff: 0.618, color: q, visible: !1 },
  { coeff: 0.75, color: J, visible: !1 },
  { coeff: 1, color: $, visible: !0 },
  { coeff: 1.5, color: ne, visible: !1 },
  { coeff: 1.75, color: ut, visible: !1 },
  { coeff: 2, color: "#f77c80", visible: !1 }
  // ripe-red-300
], kn = [
  { coeff: 1 / 8, color: nt, visible: !0, label: "1/8" },
  { coeff: 1 / 4, color: q, visible: !0, label: "1/4" },
  { coeff: 1 / 3, color: it, visible: !0, label: "1/3" },
  { coeff: 1 / 2, color: q, visible: !0, label: "1/2" },
  { coeff: 1, color: J, visible: !0, label: "1/1" },
  { coeff: 2, color: $, visible: !0, label: "2/1" },
  { coeff: 3, color: ne, visible: !0, label: "3/1" },
  { coeff: 4, color: ut, visible: !0, label: "4/1" },
  { coeff: 8, color: rt, visible: !0, label: "8/1" }
], Ln = [
  { coeff: 0.236, color: rt, visible: !0 },
  { coeff: 0.382, color: nt, visible: !0 },
  { coeff: 0.5, color: it, visible: !0 },
  { coeff: 0.618, color: q, visible: !0 },
  { coeff: 0.786, color: J, visible: !0 },
  { coeff: 1, color: j, visible: !0 },
  { coeff: 1.618, color: $, visible: !1 },
  { coeff: 2.618, color: rt, visible: !1 },
  { coeff: 3.618, color: qt, visible: !1 },
  { coeff: 4.236, color: ut, visible: !1 },
  { coeff: 4.618, color: ut, visible: !1 }
], Pe = [
  { coeff: 0, color: j, visible: !0 },
  { coeff: 0.25, color: nt, visible: !0 },
  { coeff: 0.382, color: J, visible: !0 },
  { coeff: 0.5, color: it, visible: !0 },
  { coeff: 0.618, color: q, visible: !0 },
  { coeff: 0.75, color: $, visible: !0 },
  { coeff: 1, color: j, visible: !0 }
], Sn = [
  { coeff: 0, color: j, visible: !0, width: 2, style: "solid" },
  { coeff: 0.382, color: rt, visible: !0, width: 2, style: "solid" },
  { coeff: 0.5, color: "#81c784", visible: !1, width: 2, style: "solid" },
  { coeff: 0.618, color: it, visible: !0, width: 2, style: "solid" },
  { coeff: 1, color: q, visible: !0, width: 2, style: "solid" },
  { coeff: 1.382, color: J, visible: !0, width: 2, style: "solid" },
  { coeff: 1.618, color: j, visible: !0, width: 2, style: "solid" },
  { coeff: 2, color: $, visible: !0, width: 2, style: "solid" },
  { coeff: 2.382, color: ut, visible: !0, width: 2, style: "solid" },
  { coeff: 2.618, color: ne, visible: !0, width: 2, style: "solid" },
  { coeff: 3, color: "#673ab7", visible: !0, width: 2, style: "solid" }
], Cn = { visible: !0, color: j, width: 2, style: "dashed" }, gr = Cn, wr = { visible: !0, color: j, width: 2, style: "solid" }, Xt = (e, t) => ({ color: e, width: 2, visible: t }), X = (e, t, n, o) => ({ color: e, width: 2, visible: t, x: n, y: o }), on = [Xt(j, !0), Xt(nt, !0), Xt(J, !0), Xt(it, !0), Xt(q, !0), Xt(j, !0)], rn = [
  X("#b39ddb", !1, 8, 1),
  X(rt, !1, 5, 1),
  X(j, !1, 4, 1),
  X(nt, !1, 3, 1),
  X(J, !0, 2, 1),
  X(it, !0, 1, 1),
  X(q, !0, 1, 2),
  X(q, !1, 1, 3),
  X($, !1, 1, 4),
  X("#9575cd", !1, 1, 5),
  X("#b39ddb", !1, 1, 8)
], ln = [
  X(nt, !0, 1, 0),
  X(nt, !0, 1, 1),
  X(nt, !0, 1.5, 0),
  X(J, !0, 2, 0),
  X(J, !0, 2, 1),
  X(it, !0, 3, 0),
  X(it, !0, 3, 1),
  X(q, !0, 4, 0),
  X(q, !0, 4, 1),
  X($, !0, 5, 0),
  X($, !0, 5, 1)
], Oo = { visible: !0, color: "rgba(21, 56, 153, 0.8)", width: 1, style: "solid" }, Tn = [
  { coeff: 0, color: j, visible: !0 },
  { coeff: 1, color: $, visible: !0 },
  { coeff: 2, color: $, visible: !0 },
  { coeff: 3, color: $, visible: !0 },
  { coeff: 5, color: $, visible: !0 },
  { coeff: 8, color: $, visible: !0 },
  { coeff: 13, color: $, visible: !0 },
  { coeff: 21, color: $, visible: !0 },
  { coeff: 34, color: $, visible: !0 },
  { coeff: 55, color: $, visible: !0 },
  { coeff: 89, color: $, visible: !0 }
], An = [
  // TV anchoredvwap factory: band #1 on (calculate_stDev), #2 / #3 off.
  { coeff: 1, color: it, visible: !0 },
  { coeff: 2, color: "#808000", visible: !1 },
  { coeff: 3, color: "#00897b", visible: !1 }
], Qn = [
  { visible: !0, color: it, width: 1, style: "solid" },
  { visible: !0, color: "#808000", width: 1, style: "solid" },
  { visible: !0, color: "#00897b", width: 1, style: "solid" }
], $n = [
  { coeff: 0.236, color: rt, visible: !0 },
  { coeff: 0.382, color: nt, visible: !0 },
  { coeff: 0.5, color: q, visible: !0 },
  { coeff: 0.618, color: it, visible: !0 },
  { coeff: 0.786, color: J, visible: !0 },
  { coeff: 1, color: j, visible: !0 },
  { coeff: 1.618, color: $, visible: !0 },
  { coeff: 2.618, color: ut, visible: !0 },
  { coeff: 3.618, color: $, visible: !0 },
  { coeff: 4.236, color: ut, visible: !0 },
  { coeff: 4.618, color: rt, visible: !0 }
], Bn = [
  { coeff: 0.236, color: rt, visible: !0 },
  { coeff: 0.382, color: nt, visible: !0 },
  { coeff: 0.5, color: q, visible: !0 },
  { coeff: 0.618, color: it, visible: !0 },
  { coeff: 0.786, color: J, visible: !0 },
  { coeff: 1, color: j, visible: !0 },
  { coeff: 1.618, color: $, visible: !0 },
  { coeff: 2.618, color: ut, visible: !0 },
  { coeff: 3.618, color: $, visible: !0 },
  { coeff: 4.236, color: ut, visible: !0 },
  { coeff: 4.618, color: rt, visible: !0 }
], Ee = [
  { coeff: 0, color: j, visible: !0 },
  { coeff: 0.25, color: nt, visible: !0 },
  { coeff: 0.382, color: J, visible: !0 },
  { coeff: 0.5, color: it, visible: !0 },
  { coeff: 0.618, color: q, visible: !0 },
  { coeff: 0.75, color: $, visible: !0 },
  { coeff: 1, color: j, visible: !0 }
], Mr = 7, vr = {
  upColor: "#ACE5DC",
  downColor: "#FAA1A4",
  drawBorder: !0,
  borderUpColor: "#089981",
  borderDownColor: "#F23645",
  drawWick: !0,
  wickColor: "#808080"
}, Do = {
  base: { visible: !0, color: rt, width: 1, style: "dashed" },
  up: { visible: !0, color: $, width: 2, style: "solid" },
  down: { visible: !0, color: $, width: 2, style: "solid" }
};
function kr(e) {
  const t = (n, o, i) => ({ visible: n, color: o, width: i, style: "solid" });
  return {
    rowsLayout: "rows",
    rows: 24,
    volume: "upDown",
    vaVolume: 70,
    extendRight: !1,
    visible: !0,
    showValues: !1,
    valuesColor: "#DBDBDB",
    percentWidth: 30,
    placement: e === "anchored-volume-profile" ? "right" : "left",
    upColor: "rgba(38, 198, 218, 0.5)",
    downColor: "rgba(236, 64, 122, 0.5)",
    vaUpColor: "rgba(38, 198, 218, 0.75)",
    vaDownColor: "rgba(236, 64, 122, 0.75)",
    vah: t(!1, "#DBDBDB", 2),
    val: t(!1, "#DBDBDB", 2),
    poc: t(!0, "#DBDBDB", 2),
    developingPoc: t(!1, "#DBDBDB", 1),
    developingVah: t(!1, "#00BCD4", 1),
    developingVal: t(!1, "#00BCD4", 1),
    boxColor: "rgba(38, 198, 218, 0.05)"
  };
}
function In(e, t) {
  return { ...kr(e), ...t.vp ?? {} };
}
const He = [-0.25, 0, 0.25, 0.5, 0.75, 1, 1.25].map((e, t) => ({
  coeff: e,
  color: $,
  visible: t === 1 || t === 3 || t === 5,
  width: t === 1 || t === 5 ? 2 : 1,
  style: t === 3 ? "dashed" : "solid"
})), Lr = kt.map(
  (e) => e.coeff === 0.5 ? { ...e, color: J } : e
), Ne = {
  // 1-point
  "horizontal-line": { kind: "horizontal-line", pointCount: 1, preview: "none", isBbox: !1, hotkey: "Alt + H", defaults: { width: 2, textColor: "#2962ff", showPriceLabels: !0 } },
  "horizontal-ray": { kind: "horizontal-ray", pointCount: 1, preview: "none", isBbox: !1, hotkey: "Alt + J", defaults: { width: 2, showPriceLabels: !0 } },
  "vertical-line": { kind: "vertical-line", pointCount: 1, preview: "none", isBbox: !1, hotkey: "Alt + V", defaults: { width: 2, textColor: "#2962ff", showTime: !0, extendLine: !0 } },
  "cross-line": { kind: "cross-line", pointCount: 1, preview: "none", isBbox: !1, hotkey: "Alt + C", defaults: { width: 2, textColor: "#ffffff", showPriceLabels: !0, showTime: !0 } },
  // TV factory (line-tool-arrow-marker): tv-blue-600 body + text, 16px bold.
  "arrow-marker": { kind: "arrow-marker", pointCount: 2, preview: "line", isBbox: !1, defaults: { color: "#1e53e5", width: 2, textColor: "#1e53e5", fontSize: 16, bold: !0 } },
  // TV arrow marks: arrowColor = text colour, font 14 (minty-green-500 up,
  // ripe-red-600 down).
  "arrow-mark-up": { kind: "arrow-mark-up", pointCount: 1, preview: "none", isBbox: !1, defaults: { color: "#089981", fontSize: 14 } },
  "arrow-mark-down": { kind: "arrow-mark-down", pointCount: 1, preview: "none", isBbox: !1, defaults: { color: "#cc2f3c", fontSize: 14 } },
  // TV price label factory: bold 14px white on tv-blue-500, border
  // tv-blue-500, transparency 0.
  "price-label": { kind: "price-label", pointCount: 1, preview: "none", isBbox: !1, defaults: { color: $, textColor: "#ffffff", fontSize: 14, backgroundColor: $, borderColor: $, transparency: 0 } },
  // flag marker (single anchor; the flag flies above the point)
  "flag-mark": { kind: "flag-mark", pointCount: 1, preview: "none", isBbox: !1, defaults: { color: "#2962ff" } },
  // 2-point
  "trend-line": { kind: "trend-line", pointCount: 2, preview: "line", isBbox: !1, hotkey: "Alt + T", defaults: { width: 2, textColor: "#2962ff", fontSize: 14, horzLabelsAlign: "center", vertLabelsAlign: "bottom" } },
  ray: { kind: "ray", pointCount: 2, preview: "line", isBbox: !1, defaults: { width: 2, textColor: "#2962ff", fontSize: 14, horzLabelsAlign: "center", vertLabelsAlign: "bottom", extendRight: !0 } },
  "extended-line": { kind: "extended-line", pointCount: 2, preview: "line", isBbox: !1, defaults: { width: 2, textColor: "#2962ff", fontSize: 14, horzLabelsAlign: "center", vertLabelsAlign: "bottom", extendLeft: !0, extendRight: !0 } },
  "info-line": {
    kind: "info-line",
    pointCount: 2,
    preview: "line",
    isBbox: !1,
    // Info line's identity: the stats badge with every granular row on.
    defaults: {
      width: 2,
      textColor: "#2962ff",
      fontSize: 14,
      horzLabelsAlign: "center",
      vertLabelsAlign: "bottom",
      showStats: !0,
      showPriceRange: !0,
      showPercentPriceRange: !0,
      showPipsPriceRange: !0,
      showBarsRange: !0,
      showDateTimeRange: !0,
      showDistance: !0,
      showAngle: !0
    }
  },
  "trend-angle": {
    kind: "trend-angle",
    pointCount: 2,
    preview: "line",
    isBbox: !1,
    defaults: { width: 2, fontSize: 12 }
  },
  // TV risk / reward factory style: lines #808080 1px, text white 12px,
  // stop #F23645 / target #089981 at 80 transparency, price labels on.
  "long-position": { kind: "long-position", pointCount: 1, preview: "none", isBbox: !1, defaults: { color: j, width: 1, textColor: "#ffffff", fontSize: 12, stopColor: "#f23645", stopTransparency: 80, targetColor: "#089981", targetTransparency: 80, showPriceLabels: !0, accountSize: 1e3, riskPercent: 25, lotSize: 1, riskDisplayMode: "percents", leverage: 1e4, qtyPrecision: "default" } },
  "short-position": { kind: "short-position", pointCount: 1, preview: "none", isBbox: !1, defaults: { color: j, width: 1, textColor: "#ffffff", fontSize: 12, stopColor: "#f23645", stopTransparency: 80, targetColor: "#089981", targetTransparency: 80, showPriceLabels: !0, accountSize: 1e3, riskPercent: 25, lotSize: 1, riskDisplayMode: "percents", leverage: 1e4, qtyPrecision: "default" } },
  "gann-fan": { kind: "gann-fan", pointCount: 2, preview: "line", isBbox: !1, defaults: { width: 2, levels: kn, fillBackground: !0, transparency: 80 } },
  // TV factory (line-tool-gann-box): price and time levels alike, all four
  // label sides on, both backgrounds on at 80, angles off (#9C9C9C).
  "gann-box": { kind: "gann-box", pointCount: 2, preview: "rect", isBbox: !0, defaults: { color: "rgba(21, 56, 153, 0.8)", width: 2, lineStyle: "solid", levels: Ee, vLevels: Ee, showLeftLabels: !0, showRightLabels: !0, showTopLabels: !0, showBottomLabels: !0, fillBackground: !0, transparency: 80, fillVertBackground: !0, vertTransparency: 80, fans: { visible: !1, color: "#9C9C9C" }, reverse: !1 } },
  // TV factory: fills default OFF (unlike the retracement family).
  // TV fib time zone labels: on, right / bottom.
  "fib-time-zone": { kind: "fib-time-zone", pointCount: 2, preview: "line", isBbox: !1, defaults: { width: 2, levels: Tn, fillBackground: !1, transparency: 80, showLabels: !0, horzLabelsAlign: "right", vertLabelsAlign: "bottom" } },
  "fib-circles": { kind: "fib-circles", pointCount: 2, preview: "line", isBbox: !1, defaults: { color: j, width: 2, levels: Bn, fillBackground: !0, transparency: 80 } },
  "fib-speed-resistance-fan": { kind: "fib-speed-resistance-fan", pointCount: 2, preview: "line", isBbox: !1, defaults: { width: 2, levels: Pe, vLevels: Pe, fillBackground: !0, transparency: 80, showLeftLabels: !0, showRightLabels: !0, showTopLabels: !0, showBottomLabels: !0, reverse: !1, fanGrid: Oo } },
  "fib-speed-resistance-arcs": { kind: "fib-speed-resistance-arcs", pointCount: 2, preview: "line", isBbox: !1, defaults: { width: 2, levels: $n, fillBackground: !0, transparency: 80 } },
  // TV factory (line-tool-fib-spiral): sky-blue, 2px.
  "fib-spiral": { kind: "fib-spiral", pointCount: 2, preview: "line", isBbox: !1, defaults: { color: J, width: 2 } },
  // TV trend-based fib time (3 clicks), Gann square fixed / Gann square (2
  // clicks), Sector = TV projection (3 clicks, wedge model, one level).
  "trend-based-fib-time": { kind: "trend-based-fib-time", pointCount: 3, preview: "line", isBbox: !1, defaults: { width: 2, levels: Sn, fibTrendLine: Cn, fillBackground: !0, transparency: 80, showLabels: !0, horzLabelsAlign: "right", vertLabelsAlign: "bottom" } },
  "gann-square-fixed": { kind: "gann-square-fixed", pointCount: 2, preview: "line", isBbox: !1, defaults: { width: 2, gannLevels: on, gannFans: rn, gannArcs: ln, fillBackground: !0, transparency: 80, reverse: !1 } },
  "gann-square": { kind: "gann-square", pointCount: 2, preview: "line", isBbox: !1, defaults: { width: 2, gannLevels: on, gannFans: rn, gannArcs: ln, fillBackground: !0, transparency: 80, reverse: !1, showLabels: !0, labelFontSize: 12 } },
  sector: { kind: "sector", pointCount: 3, preview: "line", isBbox: !1, defaults: { color: "#9c9c9c", width: 2, fillBackground: !0, transparency: 80, sectorColor1: $, sectorColor2: ne } },
  "fib-wedge": { kind: "fib-wedge", pointCount: 3, preview: "line", isBbox: !1, defaults: { width: 2, levels: Ln, fillBackground: !0, transparency: 80 } },
  pitchfan: { kind: "pitchfan", pointCount: 3, preview: "line", isBbox: !1, defaults: { color: "#f23645", width: 2, levels: Lr, fillBackground: !0, transparency: 80 } },
  // TV factories: cyclic #80ccdb 2px; sine #159980 1px; time-cycles #159980
  // with the iguana-green fill on by default.
  "cyclic-lines": { kind: "cyclic-lines", pointCount: 2, preview: "line", isBbox: !1, defaults: { color: "#80ccdb", width: 2 } },
  "sine-line": { kind: "sine-line", pointCount: 2, preview: "line", isBbox: !1, defaults: { color: "#159980", width: 2 } },
  "time-cycles": { kind: "time-cycles", pointCount: 2, preview: "line", isBbox: !1, defaults: { color: "#159980", width: 2, fillBackground: !0, backgroundColor: "#6aa84f", transparency: 50 } },
  "fib-retracement": { kind: "fib-retracement", pointCount: 2, preview: "line", isBbox: !1, hotkey: "Alt + F", defaults: { width: 2, levels: Pt, fillBackground: !0, transparency: 80 } },
  // TV arrow factory text: #2962FF, 14px, centre / bottom.
  // TV LineToolArrow: the trend line with rightEnd = Arrow.
  arrow: { kind: "arrow", pointCount: 2, preview: "line", isBbox: !1, defaults: { width: 2, textColor: $, fontSize: 14, horzLabelsAlign: "center", vertLabelsAlign: "bottom", leftEnd: 0, rightEnd: 1 } },
  rectangle: { kind: "rectangle", pointCount: 2, preview: "rect", isBbox: !0, hotkey: "Alt + Shift + R", defaults: { color: "#9c27b0", width: 2, fillBackground: !0, backgroundColor: "#9c27b0", transparency: 50, rectMiddleLine: { visible: !1, color: "#9c27b0", width: 1, style: "dashed" } } },
  // TV model: p0 = center, p1 = radius point (radius = their SCREEN distance).
  circle: { kind: "circle", pointCount: 2, preview: "line", isBbox: !1, defaults: { width: 2, color: "#ff9800", fillBackground: !0, backgroundColor: "#ff9800", transparency: 80 } },
  ellipse: { kind: "ellipse", pointCount: 3, preview: "line", isBbox: !1, defaults: { width: 2, color: "#f23645", fillBackground: !0, backgroundColor: "#f23645", transparency: 50 } },
  "price-range": { kind: "price-range", pointCount: 2, preview: "rect", isBbox: !1, defaults: { width: 2, color: $, fillBackground: !0, backgroundColor: $, transparency: 85, textColor: "#ffffff", fontSize: 12, customTextColor: $, customTextSize: 12 } },
  "date-range": { kind: "date-range", pointCount: 2, preview: "rect", isBbox: !1, defaults: { width: 2, color: $, fillBackground: !0, backgroundColor: $, transparency: 85, textColor: "#ffffff", fontSize: 12, customTextColor: $, customTextSize: 12 } },
  "date-and-price-range": { kind: "date-and-price-range", pointCount: 2, preview: "rect", isBbox: !1, defaults: { width: 2, color: $, fillBackground: !0, backgroundColor: $, transparency: 85, textColor: "#ffffff", fontSize: 12, customTextColor: $, customTextSize: 12 } },
  // forecast: p0 = entry, p1 = target (vector + success/failure zones)
  // TV factory (line-tool-prediction): tv-blue-500 line and balloons, white
  // texts, iguana-green / ripe-red status banners, transparency 10.
  "position-forecast": { kind: "position-forecast", pointCount: 2, preview: "line", isBbox: !1, defaults: { width: 2, color: "#2962FF", transparency: 10, sourceTextColor: "#ffffff", sourceBackColor: "#2962FF", sourceStrokeColor: "#2962FF", targetTextColor: "#ffffff", targetBackColor: "#2962FF", targetStrokeColor: "#2962FF", successTextColor: "#ffffff", successBackground: "#4caf50", failureTextColor: "#ffffff", failureBackground: "#F23645" } },
  // data-driven bbox kinds (sampled / synthesised candles inside the box)
  "bar-pattern": { kind: "bar-pattern", pointCount: 2, preview: "rect", isBbox: !0 },
  // TV factory (line-tool-ghost-feed): variance 50. Variable-length (TV
  // pointsCount −1): every click after the first adds another drift segment;
  // finished like the polylines (re-click the last vertex / double-click).
  "ghost-feed": { kind: "ghost-feed", pointCount: 2, preview: "line", isBbox: !1, variableLength: !0, defaults: { variance: 50, transparency: 50 } },
  // 3-point
  triangle: { kind: "triangle", pointCount: 3, preview: "none", isBbox: !1, defaults: { width: 2, color: "#089981", fillBackground: !0, backgroundColor: "#089981", transparency: 80 } },
  // TV label factory: labelTextColor tv-blue-500, 14px, left, bottom.
  "parallel-channel": { kind: "parallel-channel", pointCount: 3, preview: "line", isBbox: !1, defaults: { width: 2, levels: He, fillBackground: !0, transparency: 80, textColor: $, fontSize: 14, horzLabelsAlign: "left", vertLabelsAlign: "bottom" } },
  pitchfork: { kind: "pitchfork", pointCount: 3, preview: "line", isBbox: !1, defaults: { color: "#f23645", width: 2, levels: kt, fillBackground: !0, transparency: 80 } },
  "trend-based-fib-extension": { kind: "trend-based-fib-extension", pointCount: 3, preview: "line", isBbox: !1, defaults: { width: 2, levels: Pt, fillBackground: !0, transparency: 80 } },
  // TV label factory: labelTextColor = the line colour, 14px, left, bottom.
  // TV factory: fill in the line colour at 0.2, prices off (12px, line
  // colour), no line ends, no extend.
  "disjoint-channel": { kind: "disjoint-channel", pointCount: 3, preview: "line", isBbox: !1, defaults: { color: "#089981", width: 2, fillBackground: !0, backgroundColor: "#089981", transparency: 80, textColor: "#089981", fontSize: 14, horzLabelsAlign: "left", vertLabelsAlign: "bottom", showPrices: !1, priceLabelTextColor: "#089981", priceLabelFontSize: 12, leftEnd: 0, rightEnd: 0 } },
  "flat-top-bottom": { kind: "flat-top-bottom", pointCount: 3, preview: "line", isBbox: !1, defaults: { color: "#ff9800", width: 2, fillBackground: !0, backgroundColor: "#ff9800", transparency: 80, textColor: "#ff9800", fontSize: 14, horzLabelsAlign: "left", vertLabelsAlign: "bottom", showPrices: !1, priceLabelTextColor: "#ff9800", priceLabelFontSize: 12, leftEnd: 0, rightEnd: 0 } },
  "schiff-pitchfork": { kind: "schiff-pitchfork", pointCount: 3, preview: "line", isBbox: !1, defaults: { color: "#f23645", width: 2, levels: kt, fillBackground: !0, transparency: 80 } },
  "modified-schiff-pitchfork": { kind: "modified-schiff-pitchfork", pointCount: 3, preview: "line", isBbox: !1, defaults: { color: "#f23645", width: 2, levels: kt, fillBackground: !0, transparency: 80 } },
  "inside-pitchfork": { kind: "inside-pitchfork", pointCount: 3, preview: "line", isBbox: !1, defaults: { color: "#f23645", width: 2, levels: kt, fillBackground: !0, transparency: 80 } },
  "fib-channel": { kind: "fib-channel", pointCount: 3, preview: "line", isBbox: !1, defaults: { width: 2, levels: Pt, fillBackground: !0, transparency: 80, showPrices: !0, showCoeffs: !0, fibLevelsAsPercents: !1, labelFontSize: 12, horzLabelsAlign: "left", vertLabelsAlign: "middle" } },
  "rotated-rectangle": { kind: "rotated-rectangle", pointCount: 3, preview: "line", isBbox: !1, defaults: { color: "#4caf50", width: 2, fillBackground: !0, backgroundColor: "#4caf50", transparency: 50 } },
  // TV bezier factory: fill off by default, tv-blue back @ 50.
  curve: { kind: "curve", pointCount: 2, preview: "line", isBbox: !1, defaults: { width: 2, fillBackground: !1, backgroundColor: "#2962ff", transparency: 50 } },
  // TV model: p0/p1 = chord ends, p2 = bulge; a 60° circular cap scaled to the
  // bulge height, filled to the chord (berry-pink alpha20 factory defaults).
  arc: { kind: "arc", pointCount: 3, preview: "line", isBbox: !1, defaults: { width: 2, color: "#e91e63", fillBackground: !0, backgroundColor: "#e91e63", transparency: 80 } },
  // 4-point
  "double-curve": { kind: "double-curve", pointCount: 2, preview: "line", isBbox: !1, defaults: { color: qt, width: 2, fillBackground: !1, backgroundColor: qt, transparency: 80 } },
  // N-point pattern / Elliott family (labeled polylines/polygons).
  // TV factories: abcd minty-green + white labels (line-tool-abcd); xabcd/
  // cypher tv-blue line + background @ transparency 85, white labels
  // (line-tool-5points-patterns `nonThemedFactoryDefaults`).
  "abcd-pattern": { kind: "abcd-pattern", pointCount: 4, preview: "line", isBbox: !1, defaults: { color: q, width: 2, textColor: "#ffffff", fontSize: 12 } },
  "xabcd-pattern": { kind: "xabcd-pattern", pointCount: 5, preview: "line", isBbox: !1, defaults: { color: $, width: 2, textColor: "#ffffff", backgroundColor: $, fillBackground: !0, transparency: 85, fontSize: 12 } },
  "cypher-pattern": { kind: "cypher-pattern", pointCount: 5, preview: "line", isBbox: !1, defaults: { color: $, width: 2, textColor: "#ffffff", backgroundColor: $, fillBackground: !0, transparency: 85, fontSize: 12 } },
  "head-and-shoulders": { kind: "head-and-shoulders", pointCount: 7, preview: "line", isBbox: !1, defaults: { color: q, width: 2, textColor: "#ffffff", fontSize: 12, fillBackground: !0, backgroundColor: q, transparency: 85 } },
  "triangle-pattern": { kind: "triangle-pattern", pointCount: 4, preview: "line", isBbox: !1, defaults: { color: qt, width: 2, textColor: "#ffffff", fontSize: 12, fillBackground: !0, backgroundColor: qt, transparency: 85 } },
  "three-drives-pattern": { kind: "three-drives-pattern", pointCount: 7, preview: "line", isBbox: !1, defaults: { color: qt, width: 2, textColor: "#ffffff", fontSize: 12 } },
  "elliott-impulse": { kind: "elliott-impulse", pointCount: 6, preview: "line", isBbox: !1, defaults: { color: "#3d85c6", width: 2 } },
  "elliott-correction": { kind: "elliott-correction", pointCount: 4, preview: "line", isBbox: !1, defaults: { color: "#3d85c6", width: 2 } },
  "elliott-triangle": { kind: "elliott-triangle", pointCount: 6, preview: "line", isBbox: !1, defaults: { color: nt, width: 2 } },
  "elliott-double-combo": { kind: "elliott-double-combo", pointCount: 4, preview: "line", isBbox: !1, defaults: { color: "#6aa84f", width: 2 } },
  "elliott-triple-combo": { kind: "elliott-triple-combo", pointCount: 6, preview: "line", isBbox: !1, defaults: { color: "#6aa84f", width: 2 } },
  // freehand polylines (variable-length, double-click to finalize; pointCount = minimum)
  polyline: { kind: "polyline", pointCount: 2, preview: "line", isBbox: !1, variableLength: !0, defaults: { color: J, width: 2, fillBackground: !0, transparency: 80 } },
  // TV path factory: lineWidth 2, leftEnd Normal, rightEnd Arrow.
  path: { kind: "path", pointCount: 2, preview: "line", isBbox: !1, variableLength: !0, defaults: { width: 2, leftEnd: 0, rightEnd: 1 } },
  // freehand brushes (drawn with the button held; sampled from pointer-move)
  // TV brush factory: no fill (backgroundColor rgba(0, 188, 212, 0.2) =
  // cyan at transparency 80), no line ends.
  brush: { kind: "brush", pointCount: 2, preview: "line", isBbox: !1, freehand: !0, defaults: { color: J, width: 2, fillBackground: !1, backgroundColor: J, transparency: 80, leftEnd: 0, rightEnd: 0 } },
  highlighter: { kind: "highlighter", pointCount: 2, preview: "line", isBbox: !1, freehand: !0, defaults: { color: "#f23645", width: 20 } },
  // text annotations (inline editor on placement / double-click)
  // TV text factory: tv-blue-500 14px, no background (rgba(41,98,255,0.25)),
  // no border (#707070), no wrap (200px).
  text: { kind: "text", pointCount: 1, preview: "none", isBbox: !1, textEditable: !0, defaults: { color: $, fontSize: 14, fillBackground: !1, backgroundColor: $, transparency: 75, drawBorder: !1, borderColor: "#707070", wordWrap: !1, wordWrapWidth: 200 } },
  // TV Note (LineToolTextNote): anchor + text label, leader line #DBDBDB,
  // label #DBDBDB on #2E2E2E.
  note: { kind: "note", pointCount: 2, preview: "line", isBbox: !1, textEditable: !0, defaults: { color: "#dbdbdb", textColor: "#dbdbdb", backgroundColor: "#2e2e2e", fillBackground: !0, fontSize: 14 } },
  // TV Pin (LineToolNote): the map pin (marker #2962FF) with a text card.
  pin: { kind: "pin", pointCount: 1, preview: "none", isBbox: !1, textEditable: !0, defaults: { color: "#2962ff", textColor: "#dbdbdb", fontSize: 14, fillBackground: !0, backgroundColor: "#2e2e2e", transparency: 0, drawBorder: !1, borderColor: "#4a4a4a" } },
  // TV comment factory: white 16px text on a tv-blue-500 balloon, border
  // tv-blue-500 (2px), transparency 0.
  comment: { kind: "comment", pointCount: 1, preview: "none", isBbox: !1, textEditable: !0, defaults: { color: $, textColor: "#ffffff", fontSize: 16, backgroundColor: $, borderColor: $, transparency: 0 } },
  // TV price note text factory: tv-blue-500, 14px, centre / bottom (the
  // dialog's "Top": box above the line).
  "price-note": { kind: "price-note", pointCount: 2, preview: "line", isBbox: !1, textEditable: !0, defaults: { color: $, textColor: $, fontSize: 14, horzLabelsAlign: "center", vertLabelsAlign: "bottom", priceLabelTextColor: "#ffffff", priceLabelFontSize: 12, priceLabelBackgroundColor: $, priceLabelBorderColor: $ } },
  // TV signpost factory: 12px label, no emoji pin (plate tv-blue-500),
  // label halfway between the bar and the pane edge (position 50).
  signpost: { kind: "signpost", pointCount: 1, preview: "none", isBbox: !1, textEditable: !0, defaults: { fontSize: 12, showImage: !1, plateColor: $, signpostPosition: 50 } },
  // TV callout factory: sky-blue-700 border (2px) and background at
  // transparency 50, white 14px text, no wrap (200px).
  callout: { kind: "callout", pointCount: 2, preview: "line", isBbox: !1, textEditable: !0, defaults: { color: "#0097a7", width: 2, textColor: "#ffffff", fontSize: 14, backgroundColor: "#0097a7", transparency: 50, wordWrap: !1, wordWrapWidth: 200 } },
  // font-icon (emoji / sticker / icon glyph placed at one point)
  // TV icon factory: size 72, colour tv-blue-500 (font icons; emoji keep
  // their own colours).
  "font-icon": { kind: "font-icon", pointCount: 1, preview: "none", isBbox: !1, defaults: { fontSize: 72, color: $ } },
  // TV Table (line-tool-table, dark theme factory): 3 x 3 empty cells, columns
  // 120px, rows auto; background cold-gray-900 #0F0F0F, border cold-gray-650
  // #575757 (the toolbar line colour), text cold-gray-200 #DBDBDB 14px, left.
  table: { kind: "table", pointCount: 1, preview: "none", isBbox: !1, defaults: { color: "#575757", backgroundColor: "#0f0f0f", textColor: "#dbdbdb", fontSize: 14, horzLabelsAlign: "left" } },
  // TV Image (line-tool-image): transparency 0; the file comes from the
  // Image dialog opened when the tool is armed.
  image: { kind: "image", pointCount: 1, preview: "none", isBbox: !1, defaults: { transparency: 0 } },
  // data-driven (computed over the chart's bars in the selected range).
  // Regression trend (line-tool-regression-trend): base ± dev·σ study with
  // "Upper/Lower Deviation" inputs (+2/−2), channel fills, an "Extend Lines"
  // toggle (right only) and the Pearson's R label (styles.showPearsons).
  // TV factory styles: up / down lines #2962FF 2px solid, base line #F23645
  // 1px dashed, fills at transparency 70.
  "regression-trend": { kind: "regression-trend", pointCount: 2, preview: "line", isBbox: !1, defaults: { upperDeviation: 2, lowerDeviation: -2, useUpperDeviation: !0, useLowerDeviation: !0, regressionSource: "close", showPearsons: !0, fillBackground: !0, transparency: 70, regressionLines: Do } },
  // fillBackground defined (off) so the Settings Background checkbox shows —
  // the renderer's band-interior fill gates on it.
  // TV anchoredvwap factory: VWAP #1e88e5 1px; areaBackground #4caf50 at
  // transparency 95 between UpperBand / LowerBand (band #1), on.
  "anchored-vwap": { kind: "anchored-vwap", pointCount: 1, preview: "none", isBbox: !1, defaults: { color: "#1e88e5", width: 1, vwapSource: "hlc3", levels: An, fillBackground: !0, backgroundColor: "#4caf50", transparency: 95 } },
  "fixed-range-volume-profile": { kind: "fixed-range-volume-profile", pointCount: 2, preview: "rect", isBbox: !0 },
  "anchored-volume-profile": { kind: "anchored-volume-profile", pointCount: 1, preview: "none", isBbox: !1 }
}, Sr = new Set(Object.keys(Ne));
function sn(e) {
  if (e && Sr.has(e))
    return Ne[e];
}
function Kt(e) {
  const t = { ...vn, ...Ne[e].defaults, ..._o(e) };
  return t.levels && (t.levels = t.levels.map((n) => ({ ...n }))), t;
}
function sf(e) {
  const t = { ...vn, ...Ne[e].defaults };
  return t.levels && (t.levels = t.levels.map((n) => ({ ...n }))), t;
}
let _o = () => {
};
function cf(e) {
  _o = e;
}
const et = 6, L = 6, Jn = 9;
function R(e) {
  if (e.lineStyle === "dashed") return "6 4";
  if (e.lineStyle === "dotted") return "2 3";
}
function Ye(e) {
  return Math.max(L, ((e == null ? void 0 : e.width) ?? 1) / 2 + 2);
}
function be(e) {
  if (e.fillBackground === !1) return { fill: "none", fillOpacity: 0 };
  const t = e.backgroundColor || e.color, n = e.transparency != null ? Math.max(0, Math.min(1, (100 - e.transparency) / 100)) : 0.08;
  return { fill: t, fillOpacity: n };
}
function H(e, t, n, o) {
  const i = o.x - n.x, r = o.y - n.y, l = i * i + r * r;
  if (l === 0) return Math.hypot(e - n.x, t - n.y);
  let s = ((e - n.x) * i + (t - n.y) * r) / l;
  return s = Math.max(0, Math.min(1, s)), Math.hypot(e - (n.x + s * i), t - (n.y + s * r));
}
function Qt(e, t, n) {
  let o = !1;
  for (let i = 0, r = n.length - 1; i < n.length; r = i++) {
    const l = n[i].x, s = n[i].y, a = n[r].x, c = n[r].y;
    s > t != c > t && e < (a - l) * (t - s) / (c - s || 1e-9) + l && (o = !o);
  }
  return o;
}
function bt(e, t) {
  const n = Math.min(e.x, t.x), o = Math.max(e.x, t.x), i = Math.min(e.y, t.y), r = Math.max(e.y, t.y);
  return [
    { x: n, y: i },
    { x: o, y: i },
    { x: o, y: r },
    { x: n, y: r }
  ];
}
function D(e) {
  if (typeof e == "number") return e;
  if (typeof e == "string") {
    const t = Date.parse(e);
    return Number.isFinite(t) ? t / 1e3 : null;
  }
  return typeof e == "object" && e !== null && "year" in e ? Date.UTC(e.year, e.month - 1, e.day) / 1e3 : null;
}
function Cr(e, t) {
  const n = e[0];
  return Math.hypot(n.x - t.x, n.y - t.y) <= et + L ? { hit: "handle", handleIndex: 0 } : Math.abs(t.x - n.x) <= Jn + L && Math.abs(t.y - n.y) <= Jn + L ? { hit: "body" } : null;
}
function Ho(e, t) {
  const [n, o, i] = e, r = o.x - n.x, l = o.y - n.y, s = Math.hypot(r, l) || 1, a = l / s, c = -r / s;
  if (t) {
    const h = i ? Math.abs((i.x - n.x) * a + (i.y - n.y) * c) : 0;
    return [
      { x: n.x + a * h, y: n.y + c * h },
      { x: o.x + a * h, y: o.y + c * h },
      { x: o.x - a * h, y: o.y - c * h },
      { x: n.x - a * h, y: n.y - c * h }
    ];
  }
  const f = i ? (i.x - o.x) * -a + (i.y - o.y) * -c : 0;
  return [n, o, { x: o.x - a * f, y: o.y - c * f }, { x: n.x - a * f, y: n.y - c * f }];
}
const Tr = [
  ["tpPriceOffset", "TP price offset", !0],
  ["tpPercentOffset", "TP percent offset", !0],
  ["tpTickOffset", "TP tick offset", !0],
  ["tpAmount", "TP amount", !0],
  ["tpPL", "TP PL", !1],
  ["openClosePL", "Open/closed PL", !0],
  ["qty", "Qty", !0],
  ["riskRewardRatio", "Risk/reward ratio", !0],
  ["slPriceOffset", "SL price offset", !0],
  ["slPercentOffset", "SL percent offset", !0],
  ["slTickOffset", "SL tick offset", !0],
  ["slAmount", "SL amount", !0],
  ["slPL", "SL PL", !1]
];
function $e(e, t) {
  var o;
  return ((o = e.positionStats) == null ? void 0 : o[t]) ?? Tr.find((i) => i[0] === t)[2];
}
function Se(e, t) {
  const n = Math.abs(e).toLocaleString("en-US", { minimumFractionDigits: t, maximumFractionDigits: t });
  return e < 0 ? `−${n}` : n;
}
function to(e, t, n, o, i, r, l, s) {
  const a = (x) => $e(e, t + x), c = !!e.compactStats, f = Se(n, r), h = `${(o !== 0 ? Math.round(100 * 1e3 * n / o) / 1e3 : 0).toFixed(3)}%`;
  let u = "";
  return a("PriceOffset") && (u += c ? f : `${t === "tp" ? "Target" : "Stop"}: ${f}`), a("PercentOffset") && (u += u !== "" ? ` (${h})` : h), a("TickOffset") && (u += (u !== "" ? " " : "") + Se(Math.round(n / i), 0)), a("Amount") && (u += c ? (u !== "" ? " " : "") + String(l) : (u !== "" ? ", " : "") + `Amount: ${l}`), a("PL") && (u += c ? (u !== "" ? " " : "") + Se(s, r) : (u !== "" ? ", " : "") + `PnL: ${Se(s, r)}`), u;
}
function Ar(e, t, n, o, i) {
  const r = !!e.compactStats;
  let l = "";
  return $e(e, "openClosePL") && t && (l += r ? t : `${n ? "Closed" : "Open"} PnL: ${t}`), $e(e, "qty") && (l += (l !== "" ? r ? " ~ " : ", " : "") + (r ? String(o) : `Qty: ${o}`)), $e(e, "riskRewardRatio") && (l += (l !== "" ? `
` : "") + (r ? String(i) : `Risk/reward ratio: ${i}`)), l;
}
const pe = { accountSize: 1e3, risk: 25, leverage: 1e4 };
function No(e, t) {
  const n = e.points[0], o = e.points[1], i = n && o ? Math.abs(o.price - n.price) : 0;
  return {
    stop: e.style.stopLevel ?? (i || t * 100),
    profit: e.style.profitLevel ?? (i || t * 100)
  };
}
function $r(e) {
  const t = e.accountSize ?? pe.accountSize;
  return e.riskDisplayMode === "money" ? Math.min(e.riskAmount ?? t * (e.riskPercent ?? pe.risk) / 100, t) : (e.riskPercent ?? pe.risk) / 100 * t;
}
function Br(e, t) {
  if (!t || t === "default") return Math.floor(e);
  const n = Math.pow(10, parseInt(t, 10));
  return Math.round(e * n) / n;
}
function Ir(e, t, n) {
  const o = e.accountSize ?? pe.accountSize, i = e.leverage ?? pe.leverage, r = n > 0 ? $r(e) / n : 1 / 0, l = t > 0 ? i * o / t : 1 / 0, s = Math.min(r, l), a = Number.isFinite(s) ? s : 0, c = e.lotSize && e.lotSize > 0 ? e.lotSize : 1;
  return { qty: a, shown: Br(a / c, e.qtyPrecision) };
}
function Pn(e, t, n) {
  if (e.kind !== "long-position" && e.kind !== "short-position") return null;
  const [o, i] = t, r = e.points[0].price, { stop: l, profit: s } = No(e, (n == null ? void 0 : n.pipSize()) ?? 0.01), a = e.kind === "long-position" ? 1 : -1, c = (n == null ? void 0 : n.priceToY(r + a * s)) ?? o.y - 40, f = (n == null ? void 0 : n.priceToY(r - a * l)) ?? o.y + 40;
  return c == null || f == null ? null : {
    anchors: [o, { x: i.x, y: o.y }, { x: o.x, y: f }, { x: o.x, y: c }],
    yStop: f,
    yTarget: c,
    stop: l,
    profit: s
  };
}
function Pr(e, t, n, o, i) {
  if (!i || e.points.length < 2) return null;
  const r = i.bars();
  if (r.length === 0) return null;
  const l = r.length - 1, s = i.timeToBarIndex(e.points[0].time), a = e.points[1];
  if (!a) return null;
  const c = i.timeToBarIndex(a.time);
  if (s == null || c == null || c < 0) return null;
  const f = e.points[0].price, h = Math.min(l, c - 1);
  let u = null;
  for (let y = Math.max(s, 0); y <= h; y++)
    if (r[y].high >= f && r[y].low <= f) {
      u = y;
      break;
    }
  let x = null, d = null;
  if (u != null)
    for (let y = u; y <= h; y++) {
      const m = r[y];
      if (t === "long" ? m.low <= n ? d = n : m.high >= o && (d = o) : m.high >= n ? d = n : m.low <= o && (d = o), d != null) {
        x = y;
        break;
      }
    }
  if (x != null && d != null)
    return { entryIndex: u, closeIndex: x, closed: !0, closePrice: d, barIndex: Math.min(l, x) };
  const p = Math.min(l, c);
  return { entryIndex: u, closeIndex: null, closed: !1, closePrice: r[p].close, barIndex: p };
}
function Yo(e, t) {
  const [n, o] = t;
  if (!n || !o) return null;
  if (e.kind === "gann-square-fixed") {
    const l = o.x - n.x, s = o.y - n.y, a = Math.hypot(l, s);
    if (a < 1e-9) return null;
    const c = { x: n.x + 5 * a * (l < 0 ? -1 : 1), y: n.y + 5 * a * (s < 0 ? -1 : 1) };
    return { start: n, end: c, dx: c.x - n.x, dy: c.y - n.y };
  }
  const [i, r] = e.style.reverse ? [o, n] : [n, o];
  return { start: i, end: r, dx: r.x - i.x, dy: r.y - i.y };
}
function Er(e, t) {
  return t.map((n, o) => ({ l: n, t: o / 5 })).filter((n) => n.l.visible).map(({ l: n, t: o }) => ({ color: n.color, width: n.width, x: e.start.x + o * e.dx, y: e.start.y + o * e.dy }));
}
function zr(e, t) {
  return t.filter((n) => n.visible).map((n) => {
    const o = n.x > n.y ? { x: e.end.x, y: e.start.y + n.y / n.x * e.dy } : { x: e.start.x + n.x / n.y * e.dx, y: e.end.y };
    return { color: n.color, width: n.width, from: e.start, to: o };
  });
}
function Wr(e, t) {
  const n = e.dx !== 0 ? e.dy / e.dx : 0, o = (l, s) => n !== 0 ? Math.hypot(l, s / n) : Math.abs(l);
  let i = 0;
  const r = [];
  for (const l of t) {
    if (!l.visible) continue;
    const s = o(l.x / 5 * e.dx, l.y / 5 * e.dy);
    r.push({ color: l.color, width: l.width, r: s, prev: i }), i = s;
  }
  return r;
}
function Rr(e, t, n) {
  const o = e.dx < 0 ? -1 : 1, i = e.dy < 0 ? -1 : 1, r = e.dx !== 0 ? Math.abs(e.dy / e.dx) : 1, l = o * i > 0 ? 1 : 0, { x: s, y: a } = e.start, c = `M ${s + o * t} ${a} A ${t} ${t * r} 0 0 ${l} ${s} ${a + i * t * r}`, f = n > 0 ? `L ${s} ${a + i * n * r} A ${n} ${n * r} 0 0 ${1 - l} ${s + o * n} ${a}` : `L ${s} ${a}`, h = `M ${s + o * n} ${a} L ${s + o * t} ${a} A ${t} ${t * r} 0 0 ${l} ${s} ${a + i * t * r} ${f} Z`;
  return { stroke: c, fill: h };
}
function Vo(e) {
  return {
    left: Math.min(e.start.x, e.end.x),
    top: Math.min(e.start.y, e.end.y),
    right: Math.max(e.start.x, e.end.x),
    bottom: Math.max(e.start.y, e.end.y)
  };
}
function Uo(e, t, n) {
  const o = t.x - e.x || 1, i = t.y - e.y;
  return { x: o * n, y: i };
}
function Xo(e, t) {
  const [n, o, i] = t, r = { x: (o.x + i.x) / 2, y: (o.y + i.y) / 2 }, l = { x: (i.x - o.x) / 2, y: (i.y - o.y) / 2 };
  let s = n, a;
  if (e === "schiff-pitchfork")
    s = { x: n.x, y: (n.y + o.y) / 2 }, a = { x: r.x - s.x, y: r.y - s.y };
  else if (e === "modified-schiff-pitchfork")
    s = { x: (n.x + o.x) / 2, y: (n.y + o.y) / 2 }, a = { x: r.x - s.x, y: r.y - s.y };
  else if (e === "inside-pitchfork") {
    const c = { x: (n.x + o.x) / 2, y: (n.y + o.y) / 2 };
    s = r, a = { x: i.x - c.x, y: i.y - c.y };
  } else
    a = { x: r.x - s.x, y: r.y - s.y };
  return Math.hypot(a.x, a.y) < 1e-6 ? null : { pivot: s, dir: a, t1: o, t2: i, mid: r, half: l };
}
function Zt(e, t, n) {
  if (t.x <= 0) return e;
  const o = (n - e.x) / t.x;
  return { x: n, y: e.y + t.y * o };
}
function Go(e, t, n, o) {
  const [i, r, l] = t;
  if (!i || !r || !l) return [];
  const [s, a, c] = e.points, f = n && s ? n.timeToBarIndex(s.time) : null, h = n && a ? n.timeToBarIndex(a.time) : null, u = n && c ? n.timeToBarIndex(c.time) : null;
  return f != null && h != null && f === h ? [] : o.map((x) => {
    let d = null;
    if (n && f != null && h != null && u != null) {
      const p = n.barIndexToTime(Math.round(u + x.coeff * (h - f)));
      d = p != null ? n.timeToX(p) : null;
    }
    return { ...x, x: d ?? l.x + x.coeff * (r.x - i.x) };
  });
}
let he = null, eo = null;
function zt(e, t, n, o) {
  return he || (he = document.createElement("canvas").getContext("2d")), he ? (eo ?? (eo = getComputedStyle(document.body).fontFamily), he.font = `${o ? "italic " : ""}${n ? "bold " : ""}${t}px ${eo}`, he.measureText(e).width) : e.length * t * 0.6;
}
function Ve(e, t, n, o, i) {
  const r = e.split(/\r\n|\r|\n/);
  if (i == null || !Number.isFinite(i) || i <= 0) return r;
  const l = (c) => zt(c, t, n, o);
  if (l("x") > i) return r;
  const s = (c) => {
    const f = [];
    for (; c.length; ) {
      let h = 0, u = c.length;
      for (; h < u; ) {
        const d = h + u >> 1;
        l(c.slice(0, d + 1)) > i ? u = d : h = d + 1;
      }
      const x = Math.max(1, h);
      f.push(c.slice(0, x)), c = c.slice(x);
    }
    return f;
  }, a = [];
  for (const c of r) {
    if (l(c) <= i) {
      a.push(c);
      continue;
    }
    const f = [];
    let h = c;
    do {
      const d = h.match(/\s+/);
      if (!d || d.index === void 0) {
        f.push({ word: h, spaces: "" });
        break;
      }
      f.push({ word: h.slice(0, d.index), spaces: d[0] }), h = h.slice(d.index + d[0].length);
    } while (h.length);
    let u = "", x = 0;
    for (; x < f.length; ) {
      const d = f[x];
      let p = `${u}${d.word}`;
      if (l(p) > i) {
        if (u !== "")
          a.push(u), u = "";
        else if (p.length === 1)
          a.push(p), d.word = "";
        else {
          const y = s(p);
          for (let m = 0; m < y.length - 1; m++) a.push(y[m]);
          d.word = y[y.length - 1];
        }
        continue;
      }
      if (p = `${u}${d.word}${d.spaces}`, l(p) < i) {
        u = p, x += 1;
        continue;
      }
      a.push(s(p)[0]), u = "", x += 1;
    }
    u !== "" && a.push(u);
  }
  return a;
}
function G(e) {
  const t = e.fs;
  let n = e.wrapWidth != null ? Ve(e.text, t, !!e.bold, !!e.italic, e.wrapWidth) : e.text.split(`
`);
  e.maxHeight != null && (n = n.slice(0, Math.max(0, Math.floor(e.maxHeight / t))));
  const o = e.padV ?? t / 3, i = e.padH ?? t / 3, r = e.offsetX ?? 0, l = e.offsetY ?? 0, s = e.boxWidthFromWrap && e.wrapWidth != null ? e.wrapWidth : Math.max(0, ...n.map((M) => zt(M, t, !!e.bold, !!e.italic)));
  let a = Math.round(s + 2 * i);
  a % 2 && (a += 1);
  const c = e.lineSpacing ?? 0, f = t * n.length + c * Math.max(0, n.length - 1) + 2 * o, h = e.vert === "bottom" ? e.y - f - l : e.vert === "middle" ? e.y - f / 2 : e.y + l, u = e.horz === "left" ? e.x + r : e.horz === "center" ? e.x - a / 2 : e.x - a - r, x = e.horz === "center" ? u + a / 2 : e.horz === "left" ? u : u + a, d = e.vert === "middle" ? h + f / 2 : e.vert === "top" ? h : h + f, p = e.horz === "left" ? u + i : e.horz === "right" ? u + a - i : u + a / 2, y = e.horz === "left" ? "start" : e.horz === "right" ? "end" : "middle", m = e.angle ?? 0, b = Math.cos(m), g = Math.sin(m), w = (M, v) => ({ x: (M - x) * b - (v - d) * g + x, y: (M - x) * g + (v - d) * b + d });
  return {
    lines: n,
    fs: t,
    /** Distance between two line centres (fs + lineSpacing). */
    lineStep: t + c,
    tx: p,
    y0: h + o + t / 2 + 0.05 * t,
    anchor: y,
    rotate: `rotate(${m * 180 / Math.PI} ${x} ${d})`,
    box: { left: u, top: h, width: a, height: f },
    poly: [w(u, h), w(u + a, h), w(u + a, h + f), w(u, h + f)]
  };
}
function jo(e, t, n) {
  const [o, i] = t, r = e.points[0];
  if (!o || !i || !r) return null;
  const l = Math.round(Math.atan2(i.y - o.y, i.x - o.x) * 180 / Math.PI), [s, a] = l >= -135 && l <= -45 ? ["center", "bottom"] : l > -45 && l < 45 ? ["left", "middle"] : l >= 45 && l <= 135 ? ["center", "top"] : ["right", "middle"], c = e.style;
  return G({
    x: i.x,
    y: i.y,
    text: r.price.toFixed(n),
    fs: c.priceLabelFontSize ?? 12,
    bold: c.priceLabelBold,
    italic: c.priceLabelItalic,
    horz: s,
    vert: a,
    padV: 6,
    padH: 8
  });
}
function qo(e, t, n) {
  const [o, i] = t;
  if (!e.text || !o || !i) return null;
  const r = e.style, l = Math.min(o.x, i.x), s = Math.max(o.x, i.x), a = Math.min(o.y, i.y), c = Math.max(o.y, i.y), f = !!r.extendLeft, h = !!r.extendRight, u = (l <= n || f) && (s >= 0 || h), x = r.fontSize ?? 14, d = x / 3, p = r.horzLabelsAlign ?? "center", y = r.vertLabelsAlign ?? "middle", m = y === "middle", b = m ? d : 0, w = {
    x: p === "left" ? f ? u ? 0 : s : l : p === "right" ? h ? u ? n : l : s : ((f && u ? 0 : l) + (h && u ? n : s)) / 2,
    y: m ? (a + c) / 2 : y === "top" ? c : a,
    text: e.text,
    fs: x,
    bold: r.bold,
    italic: r.italic,
    vert: y,
    horz: p,
    padV: d,
    padH: b,
    wrapWidth: m ? (h ? n : s) - (f ? 0 : l) - 2 * b : void 0,
    maxHeight: m ? c - a : void 0
  }, M = G(w);
  if (p === "left" && f || p === "right" && h) {
    const v = f ? 0 : Math.max(l, 0), S = (h ? n : Math.min(s, n)) - v - M.box.width;
    if (S < 0) return G({ ...w, offsetX: S });
  }
  return M;
}
function Ce(e, t) {
  return Math.floor(e / t + 0.5 + 1e-7);
}
function Zo(e) {
  const t = new Array(e.length);
  let n = NaN, o = !0;
  for (let i = 0; i < e.length; i++) {
    const r = e[i];
    let l;
    r.close > r.open ? l = !0 : r.close < r.open ? l = !1 : r.close > n ? l = !0 : r.close < n ? l = !1 : l = o, t[i] = l, n = r.close, o = l;
  }
  return t;
}
function Fr(e, t, n, o) {
  const i = Math.max(1, Math.round(o)), r = Math.max(0, t - e);
  if (n === "Ticks Per Row") {
    const l = Math.floor(e / i) * i;
    return { start: l, tpr: i, count: Math.max(1, Math.ceil((t - l) / i)) };
  }
  return { start: e, ...Or(r, i) };
}
function Or(e, t) {
  const n = (l) => Math.max(1, Math.ceil(e / l)), o = Math.max(1, Math.floor(e / t)), i = Math.max(1, Math.ceil(e / t)), r = Math.abs(n(o) - t) <= Math.abs(n(i) - t) ? o : i;
  return { tpr: r, count: n(r) };
}
function Dr(e) {
  let t = 0;
  const n = (e.length - 1) / 2;
  for (let o = 1; o < e.length; o++)
    (e[o] > e[t] || e[o] === e[t] && Math.abs(o - n) <= Math.abs(t - n)) && (t = o);
  return t;
}
function _r(e, t, n) {
  let o = 0;
  for (const c of e) o += c;
  const i = o * Math.max(0, Math.min(100, n)) / 100;
  let r = t, l = t, s = e[t] ?? 0;
  const a = e.length;
  for (; r > 0 || l < a - 1; ) {
    const c = l < a - 1 ? e[l + 1] : -1, f = r > 0 ? e[r - 1] : -1;
    let h;
    c !== f ? h = c > f : h = l + 1 - t <= t - (r - 1);
    const u = h ? c : f;
    if (s + u > i) break;
    s += u, h ? l++ : r--;
  }
  return [r, l];
}
function no(e, t, n, o, i, r, l) {
  if (o < n) return null;
  let s = 1 / 0, a = -1 / 0;
  for (let b = n; b <= o; b++) {
    const g = Ce(e[b].low, i), w = Ce(e[b].high, i);
    g < s && (s = g), w > a && (a = w);
  }
  if (!Number.isFinite(s) || !Number.isFinite(a)) return null;
  let c, f, h;
  "fixedTpr" in r ? (f = Math.max(1, r.fixedTpr), c = Math.floor(s / f) * f, h = Math.max(1, Math.ceil((a - c) / f))) : { start: c, tpr: f, count: h } = Fr(s, a, r.layout, r.rowSize);
  const u = new Array(h).fill(0), x = new Array(h).fill(0);
  for (let b = n; b <= o; b++) {
    const g = e[b], w = g.volume ?? 0;
    if (!(w > 0)) continue;
    const M = t[b] ? u : x, v = Ce(g.low, i) - c, k = Ce(g.high, i) - c;
    if (k <= v) {
      M[Math.min(h - 1, Math.max(0, Math.floor(v / f)))] += w;
      continue;
    }
    const S = k - v, C = Math.max(0, Math.floor(v / f)), I = Math.min(h - 1, Math.ceil(k / f) - 1);
    for (let A = C; A <= I; A++) {
      const z = Math.max(v, A * f), O = Math.min(k, (A + 1) * f);
      O > z && (M[A] += w * (O - z) / S);
    }
  }
  const d = u.map((b, g) => b + x[g]), p = Dr(d), [y, m] = _r(d, p, l);
  return { lo: c * i, step: f * i, up: u, down: x, poc: p, vaLo: y, vaHi: m, boxLo: s * i, boxHi: a * i };
}
function Hr(e) {
  return { poc: e.lo + (e.poc + 0.5) * e.step, vah: e.lo + (e.vaHi + 1) * e.step, val: e.lo + e.vaLo * e.step };
}
const Nr = [["1", 60], ["5", 300], ["15", 900], ["30", 1800], ["60", 3600], ["240", 14400], ["1D", 86400]];
function Yr(e, t) {
  if (t || e <= 300) return "1S";
  for (const [n, o] of Nr) if (e / o < 5e3) return n;
  return "1D";
}
function oo(e, t) {
  let n = 0, o = e.length;
  for (; n < o; ) {
    const i = n + o >> 1;
    e[i].time < t ? n = i + 1 : o = i;
  }
  return n;
}
function Ue(e, t, n) {
  const o = Math.min(t, n), i = Math.max(t, n), r = [];
  for (const l of e) {
    const s = D(l.time);
    s != null && s >= o && s <= i && r.push(l);
  }
  return r;
}
function Vr(e) {
  const t = e.length;
  if (t < 2) return null;
  let n = 0, o = 0, i = 0, r = 0, l = 0;
  for (let x = 0; x < t; x++) {
    const d = e[x];
    n += x, o += d, i += x * x, r += x * d, l += d * d;
  }
  const s = t * i - n * n;
  if (Math.abs(s) < 1e-9) return null;
  const a = (t * r - n * o) / s, c = (o - a * n) / t;
  let f = 0;
  for (let x = 0; x < t; x++) {
    const d = e[x] - (c + a * x);
    f += d * d;
  }
  const h = t * l - o * o, u = h > 1e-12 ? (t * r - n * o) / Math.sqrt(s * h) : 0;
  return { m: a, b: c, sd: Math.sqrt(f / (t - 1)), r: u };
}
function Ur(e, t) {
  const [n, o] = e;
  if (o.x <= n.x || t <= o.x) return e;
  const i = (t - n.x) / (o.x - n.x);
  return [n, { x: t, y: n.y + (o.y - n.y) * i }];
}
function Ko(e, t, n) {
  const o = e.points[1], i = D(e.points[0].time), r = o ? D(o.time) : null;
  if (!t || i == null || r == null) return null;
  const l = Ue(t.bars(), i, r), s = e.style.regressionSource ?? "close", a = Vr(l.map((S) => Qo(S, s)));
  if (!a) return null;
  const c = l.length, f = a.b, h = a.b + a.m * (c - 1);
  let u = -1 / 0, x = -1 / 0;
  for (let S = 0; S < c; S++) {
    const C = a.b + a.m * S;
    u = Math.max(u, l[S].high - C), x = Math.max(x, C - l[S].low);
  }
  const d = e.style.useUpperDeviation === !1 ? u : (e.style.upperDeviation ?? 2) * a.sd, p = e.style.useLowerDeviation === !1 ? -x : (e.style.lowerDeviation ?? -2) * a.sd, y = (S, C) => {
    const I = t.timeToX(S), A = t.priceToY(C);
    return I == null || A == null ? null : { x: I, y: A };
  }, m = y(l[0].time, f), b = y(l[c - 1].time, h);
  if (!m || !b) return null;
  const g = y(l[0].time, f + d), w = y(l[c - 1].time, h + d), M = y(l[0].time, f + p), v = y(l[c - 1].time, h + p), k = (S) => e.style.extendRight && n != null ? Ur(S, n) : S;
  return {
    center: k([m, b]),
    upper: g && w ? k([g, w]) : null,
    lower: M && v ? k([M, v]) : null,
    pearsons: a.r,
    anchors: i <= r ? [m, b] : [b, m]
  };
}
function Qo(e, t) {
  switch (t) {
    case "open":
      return e.open;
    case "high":
      return e.high;
    case "low":
      return e.low;
    case "close":
      return e.close;
    case "hl2":
      return (e.high + e.low) / 2;
    case "ohlc4":
      return (e.open + e.high + e.low + e.close) / 4;
    case "hlcc4":
      return (e.high + e.low + e.close + e.close) / 4;
    case "hlc3":
    default:
      return (e.high + e.low + e.close) / 3;
  }
}
function cn(e, t, n) {
  const o = n === "upper" ? e.vwapUpper : e.vwapLower, i = (e.levels ?? An)[t], r = Qn[t] ?? Qn[0];
  return (o == null ? void 0 : o[t]) ?? { ...r, color: (i == null ? void 0 : i.color) ?? r.color, width: (i == null ? void 0 : i.width) ?? r.width };
}
const io = /* @__PURE__ */ new WeakMap();
function Jo(e, t, n, o) {
  const i = t[t.length - 1], r = `${n}|${o}|${t.length}|${i ? `${D(i.time)}:${i.close}:${i.volume}` : ""}`;
  let l = io.get(t);
  l || (l = /* @__PURE__ */ new Map(), io.set(t, l));
  const s = l.get(e.id);
  if (s && s.key === r) return s.data;
  let a = 0, c = t.length;
  for (; a < c; ) {
    const m = a + c >> 1, b = D(t[m].time);
    b != null && b < n ? a = m + 1 : c = m;
  }
  const f = t.length - a, h = new Float64Array(Math.max(0, f)), u = new Float64Array(Math.max(0, f));
  let x = 0, d = 0, p = 0;
  for (let m = 0; m < f; m++) {
    const b = t[a + m], g = Qo(b, o), w = b.volume && b.volume > 0 ? b.volume : 1;
    x += g * w, d += g * g * w, p += w;
    const M = x / p;
    h[m] = M, u[m] = Math.sqrt(Math.max(0, d / p - M * M));
  }
  const y = { start: a, vwap: h, sd: u };
  return l.set(e.id, { key: r, data: y }), y;
}
function ro(e, t) {
  let n = 0, o = e.length;
  for (; n < o; ) {
    const i = n + o >> 1, r = D(e[i].time);
    r != null && r < t ? n = i + 1 : o = i;
  }
  return n;
}
function Xr(e, t) {
  var n;
  return t ? ((n = Gr(e, t.bars())) == null ? void 0 : n.vwap) ?? null : null;
}
function Gr(e, t) {
  const n = e.points[0] ? D(e.points[0].time) : null;
  if (n == null || t.length === 0) return null;
  const o = Jo(e, t, n, e.style.vwapSource ?? "hlc3"), i = o.vwap.length - 1;
  return i >= 0 ? { vwap: o.vwap[i], sd: o.sd[i] } : null;
}
function ti(e, t) {
  const n = D(e.points[0].time), o = { line: [], bands: [] };
  if (!t || n == null) return o;
  const i = e.style.vwapSource ?? "hlc3";
  o.bands = (e.style.levels ?? An).map((h, u) => ({ level: h, index: u, upper: [], lower: [] })).filter((h) => h.level.visible);
  const r = e.style.vwapBandsMode === "percent", l = t.bars();
  if (l.length === 0) return o;
  const s = Jo(e, l, n, i);
  let a = s.start, c = l.length;
  const f = t.visibleTimeRange();
  f && (a = Math.max(a, ro(l, f.from) - 1), c = Math.min(c, ro(l, f.to) + 2));
  for (let h = a; h < c; h++) {
    const u = h - s.start, x = l[h], d = s.vwap[u], p = t.timeToX(x.time), y = t.priceToY(d);
    if (!(p == null || y == null) && (o.line.push({ x: p, y }), o.bands.length > 0)) {
      const m = r ? d * 0.01 : s.sd[u];
      for (const b of o.bands) {
        const g = t.priceToY(d + b.level.coeff * m), w = t.priceToY(d - b.level.coeff * m);
        g != null && b.upper.push({ x: p, y: g }), w != null && b.lower.push({ x: p, y: w });
      }
    }
  }
  return o;
}
function ei(e, t, n = 32) {
  const o = t.x - e.x, i = t.y - e.y;
  if (Math.abs(o) < 1 || Math.abs(i) < 1) return [e, t];
  const r = Math.abs(o), l = Math.abs(i), s = i < 0 ? Math.PI / 2 : -Math.PI / 2, a = o > 0 ? 0 : i < 0 ? Math.PI : -Math.PI, c = [];
  for (let f = 0; f <= n; f++) {
    const h = s + (a - s) * f / n;
    c.push({ x: e.x + r * Math.cos(h), y: t.y + l * Math.sin(h) });
  }
  return c;
}
function jr(e, t) {
  const n = e.points[1];
  if (!t || !n) return "waiting";
  const o = D(n.time);
  if (o == null) return "waiting";
  const i = t.bars();
  if (i.length === 0) return "waiting";
  const r = D(i[i.length - 1].time);
  if (r == null || o > r) return "waiting";
  let l = null, s = !1;
  for (let c = i.length - 1; c >= 0; c--) {
    const f = D(i[c].time);
    if (f != null && f <= o) {
      l = i[c], s = c === i.length - 1;
      break;
    }
  }
  return l ? (n.price > e.points[0].price ? l.high >= n.price : l.low <= n.price) ? "success" : s ? "waiting" : "failure" : "waiting";
}
const lo = /* @__PURE__ */ new WeakMap();
function qr(e) {
  let t = lo.get(e);
  return (!t || t.length !== e.length) && (t = Zo(e), lo.set(e, t)), t;
}
function ni(e, t, n, o = {}) {
  const i = Ue(e, t, n);
  if (i.length === 0) return null;
  const r = Math.min(1, Math.max(0, o.vaShare ?? 0.7)) * 100, l = o.tick && o.tick > 0 ? o.tick : 0.01, s = { layout: o.rowsLayout === "ticks" ? "Ticks Per Row" : "Number Of Rows", rowSize: Math.max(1, Math.round(o.rows ?? 24)) }, a = D(i[0].time) ?? 0, c = D(i[i.length - 1].time) ?? a;
  let f = i, h = 0, u = i.length - 1;
  const x = o.lower;
  if (x) {
    const g = x.barEnd(c), w = x.bars(Yr(g - a, x.seconds), a);
    if (w && w.length) {
      const M = w, v = oo(M, a), k = oo(M, g) - 1;
      k >= v && (f = w, h = v, u = k);
    }
  }
  const d = f === i ? Zo(i) : qr(f), p = no(f, d, h, u, l, s, r);
  if (!p) return null;
  let y = null;
  if (o.developing) {
    y = [];
    let g = h;
    for (let w = 0; w < i.length; w++) {
      const M = w + 1 < i.length ? D(i[w + 1].time) ?? 1 / 0 : 1 / 0;
      for (; g + 1 <= u && (D(f[g + 1].time) ?? 0) < M; ) g++;
      if ((D(f[h].time) ?? 0) >= M) continue;
      const v = g === u ? p : no(f, d, h, g, l, s, r);
      if (!v) continue;
      const k = Hr(v);
      y.push({ time: i[w].time, poc: k.poc, vah: k.vah, val: k.val });
    }
  }
  const m = p.up.map((g, w) => ({ up: g, down: p.down[w] })), b = m.map((g) => g.up + g.down);
  return {
    lo: p.lo,
    hi: p.lo + m.length * p.step,
    step: p.step,
    rows: m,
    poc: p.poc,
    vaFrom: p.vaLo,
    vaTo: p.vaHi,
    maxTotal: Math.max(...b),
    maxDelta: Math.max(...m.map((g) => Math.abs(g.up - g.down))),
    lastTime: i[i.length - 1].time,
    developing: y
  };
}
function oi(e, t) {
  const n = In(e.kind, e.style);
  return {
    rowsLayout: n.rowsLayout,
    rows: n.rows,
    tick: t.pipSize(),
    vaShare: n.vaVolume / 100,
    developing: n.developingPoc.visible || n.developingVah.visible || n.developingVal.visible,
    lower: t.lowerTimeframe
  };
}
function ii(e, t, n) {
  if (!n) return null;
  const o = n.bars();
  if (o.length === 0) return null;
  const i = D(e.points[0].time), r = D(o[o.length - 1].time);
  if (i == null || r == null) return null;
  const l = ni(o, i, r, oi(e, n));
  if (!l) return null;
  const s = n.timeToX(l.lastTime), a = n.priceToY(l.hi), c = n.priceToY(l.lo);
  return s == null || a == null || c == null ? null : { left: t[0].x, right: s, top: Math.min(a, c), bottom: Math.max(a, c), vp: l };
}
function ri(e, t, n) {
  if (!n || e.points.length < 2 || t.length < 2) return null;
  const o = D(e.points[0].time), i = D(e.points[1].time);
  if (o == null || i == null) return null;
  const r = n.bars(), l = In(e.kind, e.style).extendRight, s = r.length ? D(r[r.length - 1].time) : null, a = Math.min(o, i), c = l && s != null ? Math.max(s, a) : Math.max(o, i), f = ni(r, a, c, oi(e, n));
  if (!f) return null;
  const h = n.priceToY(f.hi), u = n.priceToY(f.lo);
  if (h == null || u == null) return null;
  const x = Math.min(t[0].x, t[1].x), d = l ? n.timeToX(f.lastTime) : null, p = d != null ? Math.max(x, d) : Math.max(t[0].x, t[1].x);
  return { left: x, right: p, top: Math.min(h, u), bottom: Math.max(h, u), vp: f };
}
function li(e, t, n, o) {
  const [i, r] = t, l = (e.style.levels ?? o).filter((M) => M.visible), s = (e.style.vLevels ?? e.style.levels ?? o).filter((M) => M.visible), a = !!e.style.reverse, c = e.points[0], f = e.points[1] ?? e.points[0], h = a ? c.price : f.price, u = a ? f.price - c.price : c.price - f.price, x = a ? i.y : r.y, d = a ? r.y - i.y : i.y - r.y, p = l.map((M) => {
    const v = (n == null ? void 0 : n.priceToY(h + M.coeff * u)) ?? x + M.coeff * d;
    return { coeff: M.coeff, color: M.color, y: v };
  }), y = (n == null ? void 0 : n.timeToBarIndex(c.time)) ?? null, m = (n == null ? void 0 : n.timeToBarIndex(f.time)) ?? null, b = a ? i.x : r.x, g = a ? r.x - i.x : i.x - r.x, w = s.map((M) => {
    let v = null;
    if (n && y != null && m != null) {
      const k = n.barIndexToTime(Math.round((a ? y : m) + M.coeff * (a ? m - y : y - m)));
      v = k != null ? n.timeToX(k) : null;
    }
    return { coeff: M.coeff, color: M.color, x: v ?? b + M.coeff * g };
  });
  return {
    h: p,
    v: w,
    box: { left: Math.min(i.x, r.x), top: Math.min(i.y, r.y), right: Math.max(i.x, r.x), bottom: Math.max(i.y, r.y) }
  };
}
function an(e, t, n, o) {
  const i = t.x - e.x, r = t.y - e.y, l = Math.hypot(i, r);
  if (l < 1e-9) return t;
  const s = Math.max(1, 2 * (n + o) / l);
  return { x: e.x + i * s, y: e.y + r * s };
}
const Zr = ["bars", "oc", "line", "line-open", "line-high", "line-low", "line-hl2"];
function so(e, t) {
  const [n, o, i, r] = e;
  switch (t) {
    case "bars":
      return [o, i];
    case "oc":
      return [n, r];
    case "line":
      return [r];
    case "line-open":
      return [n];
    case "line-high":
      return [o];
    case "line-low":
      return [i];
    default:
      return [(o + i) / 2];
  }
}
function co(e, t, n, o) {
  const [i, r, l, s] = e;
  if (t === "line-hl2") return (r + l) / 2;
  const a = n !== o;
  switch (t) {
    case "bars":
      return a ? r : l;
    case "oc":
      return a ? i : s;
    case "line":
      return s;
    case "line-open":
      return i;
    case "line-high":
      return r;
    default:
      return l;
  }
}
function si(e, t, n) {
  var O;
  if (e.kind !== "bar-pattern" || !n) return null;
  const o = ((O = e.pattern) == null ? void 0 : O.bars) ?? [];
  if (o.length === 0 || t.length < 2) return null;
  const i = e.style, [r, l] = t, s = Zr.includes(i.patternMode ?? "") ? i.patternMode : "bars";
  let a = o;
  if (i.mirrored) {
    let T = 1 / 0, E = -1 / 0;
    for (const P of a)
      T = Math.min(T, P[2], P[1]), E = Math.max(E, P[1], P[2]);
    if (T < E) {
      const P = (T + E) / 2, B = (F) => P - (F - P);
      a = a.map(([F, V, K, xt]) => [B(F), B(V), B(K), B(xt)]);
    }
  }
  i.flipped && (a = [...a].reverse());
  const c = !!i.mirrored != !!i.flipped, f = c ? e.points[1].price : e.points[0].price, h = c ? e.points[0].price : e.points[1].price, u = n.priceToY(f), x = n.priceToY(h), d = co(a[0], s, !0, !!i.flipped), p = co(a[a.length - 1], s, !1, !!i.flipped), y = n.priceToY(d), m = n.priceToY(p);
  if (u == null || x == null || y == null || m == null) return null;
  const b = m !== y ? +((x - u) / (m - y)).toFixed(8) : 1, g = (T) => (n.priceToY(T) ?? 0) * b, w = n.timeToBarIndex(e.points[0].time), M = n.timeToBarIndex(e.points[1].time), k = w == null || M == null || w <= M ? { x: r.x, y: u } : { x: l.x, y: x }, S = a.length, C = S > 1 ? Math.abs(r.x - l.x) / (S - 1) : 0, I = k.y - g(d), A = a.map((T, E) => Math.round(k.x + E * C + 0.5)), z = s !== "bars" && s !== "oc";
  return z ? { lineMode: z, bars: [], line: a.map((T, E) => ({ x: A[E], y: Math.round(g(so(T, s)[0])) + I })) } : {
    lineMode: z,
    line: [],
    bars: a.map((T, E) => {
      const [P, B] = so(T, s), F = Math.round(g(P)) + I, V = Math.round(g(B)) + I;
      return { x: A[E], top: Math.min(F, V), bottom: Math.max(F, V) };
    })
  };
}
let ue = null;
function Kr(e, t) {
  return ue || (ue = document.createElement("canvas").getContext("2d")), ue ? (ue.font = t, ue.measureText(e).width) : e.length * 8;
}
function ci(e, t) {
  const n = e.text ?? "";
  if (n === "" || e.kind !== "arrow-mark-up" && e.kind !== "arrow-mark-down") return null;
  const o = e.style, i = o.fontSize ?? 14, r = i / 3, l = Math.ceil(i), s = n.split(`
`), a = `${o.italic ? "italic " : ""}${o.bold ? "bold " : ""}${i}px ${getComputedStyle(document.body).fontFamily}`;
  let c = Math.round(Math.max(...s.map((u) => Kr(u, a))) + 2 * r);
  c % 2 && (c += 1);
  const f = s.length * l + 2 * r, h = e.kind === "arrow-mark-up" ? t.y + 20 : t.y - 20 - f;
  return { left: t.x - c / 2, top: h, width: c, height: f, lines: s, lineH: l, pad: r };
}
const Ht = 8, ht = 1, Qr = 2, ai = 120, fi = 1.3, Jr = "#2962ff", tl = "rgba(41, 98, 255, 0.2)", ao = 3, Jt = 1024;
function el(e) {
  return Jt + (e.row == null ? 0 : e.row + 1) * Jt + (e.col == null ? 0 : e.col + 1);
}
function hi(e) {
  if (e < Jt) return null;
  const t = e - Jt, n = Math.floor(t / Jt), o = t % Jt;
  return { row: n === 0 ? null : n - 1, col: o === 0 ? null : o - 1 };
}
function Wt(e) {
  return e.tableCells ?? [["", "", ""], ["", "", ""], ["", "", ""]];
}
function ge(e) {
  var o;
  const t = ((o = Wt(e)[0]) == null ? void 0 : o.length) ?? 0, n = e.tableColWidths ?? [];
  return Array.from({ length: t }, (i, r) => n[r] ?? ai);
}
function En(e) {
  const t = Wt(e).length, n = e.tableRowHeights ?? [];
  return Array.from({ length: t }, (o, i) => n[i] ?? 0);
}
const ui = (e) => e.fontSize ?? 14, xi = (e) => zt("0", e, !1, !1);
function nl(e) {
  return xi(e) + 2 * Ht + 2 * ht;
}
function di(e) {
  return e + 2 * Ht + ht;
}
function ol(e, t) {
  return Math.max(e - 2 * Ht - 2 * ht, xi(t));
}
function yi(e, t, n) {
  return e === "" ? [] : Ve(e, n, !1, !1, ol(t, n));
}
function il(e, t) {
  return e * t + (e - 1) * t * (fi - 1) + 2 * Ht + 2 * ht;
}
function pi(e, t = Wt(e), n = ge(e)) {
  const o = ui(e), i = En(e), r = [];
  return { heights: i.map((s, a) => {
    var f;
    let c = di(o);
    for (let h = 0; h < n.length; h++) c = Math.max(c, il(yi(((f = t[a]) == null ? void 0 : f[h]) ?? "", n[h], o).length, o));
    return r.push(c), Math.max(s, c);
  }), mins: r };
}
function zn(e, t) {
  const n = e.style, o = ui(n), i = Wt(n), r = ge(n), { heights: l } = pi(n, i, r), s = [Math.round(t.x)];
  let a = 0;
  for (const h of r)
    a += h, s.push(Math.round(t.x + a));
  const c = [Math.round(t.y)];
  a = 0;
  for (const h of l)
    a += h, c.push(Math.round(t.y + a));
  const f = i.map((h) => h.map((u, x) => yi(u, r[x], o)));
  return { left: s[0], top: c[0], right: s[s.length - 1], bottom: c[c.length - 1], xs: s, ys: c, cells: i, lines: f, fs: o };
}
function mi(e) {
  return [
    { x: e.left, y: e.top },
    { x: e.left, y: e.bottom },
    { x: e.right, y: e.top },
    { x: e.right, y: e.bottom }
  ];
}
function rl(e, t, n) {
  if (n) {
    let o = null, i = null;
    if (t.x >= e.left && t.x <= e.right) {
      for (let r = 0; r < e.ys.length - 1; r++) if (Math.abs(t.y - e.ys[r + 1]) <= ao) {
        o = r;
        break;
      }
    }
    if (t.y >= e.top && t.y <= e.bottom) {
      for (let r = 0; r < e.xs.length - 1; r++) if (Math.abs(t.x - e.xs[r + 1]) <= ao) {
        i = r;
        break;
      }
    }
    if (o != null || i != null) return { edge: { row: o, col: i } };
  }
  for (let o = 0; o < e.ys.length - 1; o++)
    for (let i = 0; i < e.xs.length - 1; i++)
      if (t.x >= e.xs[i] && t.x <= e.xs[i + 1] && t.y >= e.ys[o] && t.y <= e.ys[o + 1]) return { cell: [o, i] };
  return null;
}
function fn(e, t, n) {
  const o = (a) => a.reduce((c, f) => c + f, 0);
  let i = o(e), r = Math.max(n, o(t));
  if (i === r) return [...e];
  if (r < i)
    for (let a = 0; a < e.length; a++) e[a] === t[a] && (i -= e[a], r -= e[a]);
  const l = r / i, s = e.map((a, c) => Math.max(t[c], a * l));
  return o(s) > r + 0.01 ? fn(s, t, n) : s;
}
function ll(e, t, n) {
  var a;
  const o = Wt(e).map((c) => [...c]), i = ge(e), r = En(e), [l, s] = n ?? [o.length - 1, (((a = o[0]) == null ? void 0 : a.length) ?? 1) - 1];
  if (t === "row") {
    const c = l + 1;
    o.splice(c, 0, new Array(i.length).fill("")), r.splice(c, 0, 0);
  } else {
    const c = s + 1;
    for (const f of o) f.splice(c, 0, "");
    i.splice(c, 0, ai);
  }
  return { tableCells: o, tableColWidths: i, tableRowHeights: r };
}
function sl(e, t) {
  var o;
  const n = Wt(e);
  return t === "row" ? n.length > 1 : (((o = n[0]) == null ? void 0 : o.length) ?? 0) > 1;
}
function cl(e, t, n) {
  const o = Wt(e).map((c) => [...c]), i = ge(e), r = En(e), [l, s] = n;
  if (t === "row")
    o.splice(l, 1), r.splice(l, 1);
  else {
    for (const c of o) c.splice(s, 1);
    i.splice(s, 1);
  }
  const a = [Math.min(l, o.length - 1), Math.min(s, i.length - 1)];
  return { patch: { tableCells: o, tableColWidths: i, tableRowHeights: r }, cell: a };
}
function al(e, t, n) {
  const o = Wt(e).map((i) => [...i]);
  return o[t[0]] && (o[t[0]][t[1]] = n), { tableCells: o };
}
const af = 2e6, fo = 2e3, ff = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }, $t = /* @__PURE__ */ new Map();
let bi = () => Promise.reject(new Error("no image reader"));
const hn = /* @__PURE__ */ new Set();
function hf(e) {
  bi = e;
}
function fl(e) {
  return hn.add(e), () => hn.delete(e);
}
function gi() {
  for (const e of hn) e();
}
function hl(e) {
  return new Promise((t, n) => {
    const o = new Image();
    o.onload = () => t({ url: e, width: o.naturalWidth, height: o.naturalHeight }), o.onerror = () => n(new Error("image decode failed")), o.src = e;
  });
}
function Wn(e) {
  if (!e) return null;
  const t = $t.get(e);
  return t && t !== "loading" && t !== "error" ? t : (t || ($t.set(e, "loading"), bi(e).then((n) => hl(URL.createObjectURL(n))).then(
    (n) => $t.set(e, n),
    (n) => {
      $t.set(e, "error"), console.warn("[image] read failed:", n);
    }
  ).then(gi)), null);
}
function ul(e) {
  return !!e && $t.get(e) === "error";
}
function wi(e, t) {
  const n = e.image, o = Wn(n == null ? void 0 : n.name);
  if (!n || !o || o.width > fo || o.height > fo) return null;
  const i = t.x + (n.dx ?? 0);
  return { left: i - n.cssWidth / 2, top: t.y - n.cssHeight / 2, right: i + n.cssWidth / 2, bottom: t.y + n.cssHeight / 2 };
}
function Mi(e) {
  return [
    { x: e.left + 1, y: e.top + 1 },
    { x: e.right - 1, y: e.top + 1 },
    { x: e.left + 1, y: e.bottom - 1 },
    { x: e.right - 1, y: e.bottom - 1 }
  ];
}
const xl = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
function dl(e, t, n, o) {
  const i = Math.min(Math.min(1, n / 4 / e), Math.min(1, o / 4 / t));
  return { cssWidth: Math.round(i * e), cssHeight: Math.round(i * t) };
}
function uf(e, t) {
  (!$t.has(e) || $t.get(e) === "error") && $t.set(e, t), gi();
}
const yl = "Add text", pl = {
  text: "Text",
  note: "Add text",
  pin: "Note",
  comment: "Comment",
  "price-note": "Price note",
  signpost: "Signpost",
  callout: "Callout"
};
function ml(e) {
  const t = !!(e.text && e.text.length > 0);
  return { txt: t ? e.text : pl[e.kind] ?? "Text", faint: !t };
}
function vi(e, t, n, o) {
  const { txt: i, faint: r } = ml(e), l = t.fontSize ?? 14, s = zt(i, l, !1, !1) + 16, a = l + 12, c = Math.round(180 * Math.atan2(o.y - n.y, o.x - n.x) / Math.PI);
  let f = o.x, h = o.y - a / 2;
  return c >= -135 && c <= -45 ? (f = o.x - s / 2, h = o.y - a) : c > -45 && c < 45 ? f = o.x : c >= 45 && c <= 135 ? (f = o.x - s / 2, h = o.y) : f = o.x - s, { txt: i, faint: r, fs: l, box: { left: f, top: h, width: s, height: a } };
}
function gt(e) {
  return e.text ? { text: e.text, faint: !1 } : { text: yl, faint: !0 };
}
function ki(e, t) {
  const n = e.style, o = n.fontSize ?? 14, i = o / 6;
  return G({
    x: t.x,
    y: t.y,
    text: gt(e).text,
    fs: o,
    bold: n.bold,
    italic: n.italic,
    vert: "top",
    horz: "left",
    padV: i,
    padH: i,
    wrapWidth: n.wordWrap ? n.wordWrapWidth ?? 200 : void 0,
    boxWidthFromWrap: !0
  });
}
function Li(e, t) {
  const o = e.style.fontSize ?? 16, i = Math.round(o / 1.3), r = G({ x: t.x, y: t.y, text: gt(e).text, fs: o, vert: "bottom", horz: "left", padV: i, padH: 12 }), l = Math.min(r.box.width, o + 2 * i) / 2;
  return { l: r, r: l };
}
function bl(e, t, n, o, [i, r, l, s]) {
  return `M ${e + i} ${t} H ${e + n - r} A ${r} ${r} 0 0 1 ${e + n} ${t + r} V ${t + o - l} A ${l} ${l} 0 0 1 ${e + n - l} ${t + o} H ${e + s} A ${s} ${s} 0 0 1 ${e} ${t + o - s} V ${t + i} A ${i} ${i} 0 0 1 ${e + i} ${t} Z`;
}
const gl = "m12 30 .88-.77C20.25 22.73 24 17.07 24 12.09 24 5.04 18.54 0 12 0S0 5.04 0 12.1c0 4.97 3.75 10.64 11.12 17.13L12 30Zm0-13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z";
function Si(e, t, n) {
  const o = e.style, i = o.fontSize ?? 14, r = Math.min(236, n), l = Ve(gt(e).text, i, !!o.bold, !!o.italic, r - 24);
  let s = l.length * i + 24;
  l.length > 1 && (s += 5 * (l.length - 1));
  let a = Math.round(t.x - r / 2), c = Math.round(t.y - 30 - s - 13);
  const f = t.x < 24 || t.x + 24 > n;
  let h = f ? null : "top";
  return c < 10 ? c = t.y + 13 : f || (h = "bottom"), a < 10 ? a = 10 : a + r + 10 > n && (a = n - r - 10), { fs: i, width: r, height: s, left: a, top: c, lines: l, caret: h, marker: { left: t.x - 12, top: t.y - 30, right: t.x + 12, bottom: t.y } };
}
function ho(e, t) {
  const { left: n, top: o, width: i, height: r, caret: l } = e, s = 4, a = t - 6, c = t + 6;
  let f = `M ${n} ${o + s} A ${s} ${s} 0 0 1 ${n + s} ${o}`;
  return l === "top" && (f += ` L ${a} ${o} L ${t} ${o - 10} L ${c} ${o}`), f += ` L ${n + i - s} ${o} A ${s} ${s} 0 0 1 ${n + i} ${o + s} L ${n + i} ${o + r - s} A ${s} ${s} 0 0 1 ${n + i - s} ${o + r}`, l === "bottom" && (f += ` L ${c} ${o + r} L ${t} ${o + r + 10} L ${a} ${o + r}`), f += ` L ${n + s} ${o + r} A ${s} ${s} 0 0 1 ${n} ${o + r - s} Z`, f;
}
function Ci(e, t, n) {
  const o = zt(e, n, !0, !1) + 20, i = n + 10, r = t.x + 9, l = t.y - (i + 15);
  return { x: r, y: l, w: o, h: i, fs: n };
}
function wl(e) {
  const { x: t, y: n, w: o, h: i } = e, r = 3;
  return `M ${t + 12} ${n + i} L ${t - 9} ${n + i + 15} L ${t + 5} ${n + i} L ${t + r} ${n + i} A ${r} ${r} 0 0 1 ${t} ${n + i - r} L ${t} ${n + r} A ${r} ${r} 0 0 1 ${t + r} ${n} L ${t + o - r} ${n} A ${r} ${r} 0 0 1 ${t + o} ${n + r} L ${t + o} ${n + i - r} A ${r} ${r} 0 0 1 ${t + o - r} ${n + i} Z`;
}
function Ti(e, t) {
  const n = e.style, o = n.fontSize ?? 14, i = n.wordWrap ? n.wordWrapWidth ?? 200 : void 0, r = Ve(gt(e).text, o, !!n.bold, !!n.italic, i), l = i ?? Math.max(0, ...r.map((u) => zt(u, o, !!n.bold, !!n.italic))), s = o * r.length, a = l + 20, c = s + 20, f = t.x - a / 2, h = t.y - c / 2;
  return { fs: o, lines: r, textW: l, textH: s, x: f, y: h, w: a, h: c, wrap: i };
}
function Ml(e, t, n) {
  const { x: o, y: i, w: r, h: l, textW: s, textH: a } = e, c = t.x - o, f = t.y - i, h = n.x - o, u = n.y - i;
  let x = 0;
  t.x > o + r ? x = 20 : t.x > o && (x = 10), t.y > i + l ? x += 2 : t.y > i && (x += 1);
  const d = s + 4 > 16, p = a + 4 > 16, y = (g, w) => `${o + g} ${i + w}`, m = (g, w) => `A 8 8 0 0 1 ${y(g, w)}`;
  let b = `M ${y(8, 0)}`;
  return x === 10 ? b += d ? ` L ${y(h - 8, 0)} L ${y(c, f)} L ${y(h + 8, 0)} L ${y(r - 8, 0)}` : ` L ${y(c, f)} L ${y(r - 8, 0)}` : b += ` L ${y(r - 8, 0)}`, b += x === 20 ? ` L ${y(c, f)} L ${y(r, 8)}` : ` ${m(r, 8)}`, x === 21 ? b += p ? ` L ${y(r, u - 8)} L ${y(c, f)} L ${y(r, u + 8)} L ${y(r, l - 8)}` : ` L ${y(c, f)} L ${y(r, l - 8)}` : b += ` L ${y(r, l - 8)}`, b += x === 22 ? ` L ${y(c, f)} L ${y(r - 8, l)}` : ` ${m(r - 8, l)}`, x === 12 ? b += d ? ` L ${y(h + 8, l)} L ${y(c, f)} L ${y(h - 8, l)} L ${y(8, l)}` : ` L ${y(c, f)} L ${y(8, l)}` : b += ` L ${y(8, l)}`, b += x === 2 ? ` L ${y(c, f)} L ${y(0, l - 8)}` : ` ${m(0, l - 8)}`, x === 1 ? b += p ? ` L ${y(0, u + 8)} L ${y(c, f)} L ${y(0, u - 8)} L ${y(0, 8)}` : ` L ${y(c, f)} L ${y(0, 8)}` : b += ` L ${y(0, 8)}`, b += x === 0 ? ` L ${y(c, f)} L ${y(8, 0)}` : ` ${m(8, 0)}`, b + " Z";
}
const Ot = { pole: "#808080", labelBg: "#0f0f0f", labelBorder: "#2e2e2e", labelText: "#dbdbdb", plateBorder: "#0f0f0f" };
function Ai(e, t) {
  const n = e.barAt(t.time);
  return n ? { high: n.high, low: n.low } : null;
}
function $i(e, t, n) {
  const o = Ai(e, t), i = e.priceToY(t.price);
  if (i == null) return 50;
  let r = 1, l = n / 2;
  o ? (r = t.price >= o.low ? 1 : -1, l = e.priceToY(r === 1 ? o.high : o.low) ?? l) : r = i <= n / 2 ? 1 : -1;
  const s = r === 1 ? l : n - l, a = Math.min(n, Math.abs(i - l));
  return s > 0 ? Math.max(0, Math.min(100, 100 * a / s)) * r : 50 * r;
}
function vl(e, t, n, o) {
  const i = Math.min(t, Math.max(0, o === 1 ? n : t - n));
  return n - o * Math.abs(i * e / 100);
}
function Rn(e, t, n, o) {
  const i = e.style, r = i.signpostPosition ?? 50, l = r >= 0 ? 1 : -1, s = Ai(n, e.points[0]), a = s ? n.priceToY(l === 1 ? s.high : s.low) : null, c = a != null, f = c ? a : o / 2, h = c ? f - l * 3 : o, u = i.fontSize ?? 12, x = (v) => G({
    x: t.x,
    y: v,
    text: gt(e).text,
    fs: u,
    bold: i.bold,
    italic: i.italic,
    vert: l === 1 ? "top" : "bottom",
    horz: "center",
    padV: 6,
    padH: 8,
    wrapWidth: 134,
    lineSpacing: 3
  });
  let d = vl(r, o, f, l), p = x(d);
  const y = p.box.height, m = l === 1 ? Math.min(h - y, d) : Math.max(h + y, d);
  m !== d && (d = m, p = x(d));
  const b = i.showImage ? 80 : 0, g = d + (y + b) * l, w = d + (y + 10 + 35) * l, M = i.showImage ? [d + y * l, d + y * l + 10 * l] : null;
  return { l: p, anchor: { x: t.x, y: d }, poleStart: h, poleEnd: g, plateY: w, gap: M, n: l, x: t.x };
}
function uo(e, t, n, o) {
  const i = t.yToPrice(o);
  return i == null ? null : $i(t, { time: e.points[0].time, price: i }, n);
}
const ot = et + L;
function Dt(e, t) {
  return e.x >= t.left && e.x <= t.left + t.width && e.y >= t.top && e.y <= t.top + t.height;
}
function W(e, t) {
  for (let n = 0; n < e.length; n++)
    if (Math.hypot(e[n].x - t.x, e[n].y - t.y) <= ot)
      return { hit: "handle", handleIndex: n };
  return null;
}
function kl(e, t, n) {
  const o = bt(e, t);
  for (let i = 0; i < 4; i++)
    if (Math.hypot(o[i].x - n.x, o[i].y - n.y) <= ot)
      return { hit: "handle", handleIndex: i };
  return null;
}
function Ll(e, t, n, o = L) {
  const i = e[0];
  return Math.hypot(0.9 * n - t.x, i.y - t.y) <= ot ? { hit: "handle", handleIndex: 0 } : Math.abs(t.y - i.y) <= o ? { hit: "body" } : null;
}
function Sl(e, t, n, o = L) {
  const i = e[0];
  return Math.hypot(i.x - t.x, 0.9 * n - t.y) <= ot ? { hit: "handle", handleIndex: 0 } : Math.abs(t.x - i.x) <= o ? { hit: "body" } : null;
}
function Cl(e, t, n = L) {
  const o = e[0];
  return Math.hypot(o.x - t.x, o.y - t.y) <= ot ? { hit: "handle", handleIndex: 0 } : Math.abs(t.y - o.y) <= n || Math.abs(t.x - o.x) <= n ? { hit: "body" } : null;
}
function Bi(e, t, n = L) {
  const o = e[0];
  return Math.hypot(o.x - t.x, o.y - t.y) <= ot ? { hit: "handle", handleIndex: 0 } : t.x >= o.x - ot && Math.abs(t.y - o.y) <= n ? { hit: "body" } : null;
}
function Tl(e, t, n) {
  const o = W(t, n);
  if (o) return o;
  const i = e.style, r = i.extendLeft ? -1 / 0 : Math.min(t[0].x, t[1].x), l = i.extendRight ? 1 / 0 : Math.max(t[0].x, t[1].x), s = Math.min(t[0].y, t[1].y), a = Math.max(t[0].y, t[1].y);
  return n.x >= r - L && n.x <= l + L && n.y >= s - L && n.y <= a + L ? { hit: "body" } : null;
}
function Al(e, t, n, o, i) {
  const r = W(t, n);
  if (r) return r;
  const l = e.style, s = l.extendLeft ?? e.kind === "extended-line", a = l.extendRight ?? (e.kind === "ray" || e.kind === "extended-line"), [c, f] = t;
  let h = c, u = f;
  const x = f.x - c.x, d = f.y - c.y, p = Math.hypot(x, d);
  if (p > 1e-6) {
    const y = (o + i) * 2;
    a && (u = { x: f.x + x / p * y, y: f.y + d / p * y }), s && (h = { x: c.x - x / p * y, y: c.y - d / p * y });
  }
  return H(n.x, n.y, h, u) <= Ye(l) ? { hit: "body" } : null;
}
function Ii(e, t, n = L) {
  const o = W(e, t);
  return o || (H(t.x, t.y, e[0], e[1]) <= n ? { hit: "body" } : null);
}
function $l(e, t, n, o) {
  if (!e.points[0] || !e.points[1]) return null;
  const i = Pn(e, t, o);
  if (!i) return null;
  const { anchors: r, yStop: l, yTarget: s } = i, [a, c] = t, f = W(r, n);
  if (f) return f;
  const h = Math.min(a.x, c.x), u = Math.max(a.x, c.x), x = Math.min(s, l), d = Math.max(s, l);
  return n.x >= h - L && n.x <= u + L && n.y >= x - L && n.y <= d + L ? { hit: "body" } : null;
}
function Xe(e, t, n, o, i) {
  const r = t.x - e.x, l = t.y - e.y, s = Math.hypot(r, l) || 1;
  return [
    n ? { x: e.x - r / s * i, y: e.y - l / s * i } : e,
    o ? { x: t.x + r / s * i, y: t.y + l / s * i } : t
  ];
}
function Fn(e, t, n, o, i, r, l, s) {
  const a = n.x - t.x, c = n.y - t.y, f = a * o.y - c * o.x;
  if (Math.abs(f) < 1e-9) return !1;
  const h = e.x - t.x, u = e.y - t.y, x = (h * o.y - u * o.x) / f, d = (a * u - c * h) / f;
  return (l || x >= 0) && (s || x <= 1) && d >= Math.min(i, r) && d <= Math.max(i, r);
}
function Bl(e, t, n, o, i) {
  const r = W(t, n);
  if (r) return r;
  const l = Xo(e.kind, t);
  if (!l) return null;
  const s = e.style, a = (d) => Zt(d, l.dir, o), c = (o + i) * 2, f = Math.hypot(l.dir.x, l.dir.y) || 1, h = (d) => s.extendLines ? { x: d.x - l.dir.x / f * c, y: d.y - l.dir.y / f * c } : d, u = [
    [h(l.pivot), a(l.pivot)],
    [t[1], t[2]]
  ], x = (s.levels ?? kt).filter((d) => d.visible);
  for (const d of x)
    for (const p of [1, -1]) {
      const y = { x: l.mid.x + l.half.x * d.coeff * p, y: l.mid.y + l.half.y * d.coeff * p };
      u.push([h(y), a(y)]);
    }
  for (const [d, p] of u)
    if (H(n.x, n.y, d, p) <= L) return { hit: "body" };
  if (s.fillBackground !== !1 && x.length > 0) {
    const d = Math.max(...x.map((y) => y.coeff)), p = { x: l.mid.x + l.dir.x, y: l.mid.y + l.dir.y };
    if (Fn(n, l.mid, p, l.half, -d, d, !!s.extendLines, !0)) return { hit: "body" };
  }
  return null;
}
function Il(e, t, n) {
  const o = W(t, n);
  if (o) return o;
  const i = e.style, r = i.extendLeft ? -1 / 0 : Math.min(t[1].x, t[2].x), l = i.extendRight ? 1 / 0 : Math.max(t[1].x, t[2].x), s = Math.min(t[0].y, t[1].y, t[2].y), a = Math.max(t[0].y, t[1].y, t[2].y);
  return n.x >= r - L && n.x <= l + L && n.y >= s - L && n.y <= a + L ? { hit: "body" } : null;
}
function Pl(e, t, n, o, i) {
  const r = W(t, n);
  if (r) return r;
  const [l, s] = t, a = (o + i) * 2, c = (e.style.levels ?? kn).filter((f) => f.visible);
  for (const f of c) {
    const h = Uo(l, s, f.coeff), u = Math.hypot(h.x, h.y) || 1, x = { x: l.x + h.x / u * a, y: l.y + h.y / u * a };
    if (H(n.x, n.y, l, x) <= L) return { hit: "body" };
  }
  return null;
}
function El(e, t, n, o) {
  const i = W(t, n);
  if (i) return i;
  const r = t[1].x - t[0].x, l = (e.style.levels ?? Tn).filter((s) => s.visible);
  for (const s of l)
    if (Math.abs(n.x - (t[0].x + r * s.coeff)) <= Math.max(o, (s.width ?? 1) / 2 + 2))
      return { hit: "body" };
  return H(n.x, n.y, t[0], t[1]) <= o ? { hit: "body" } : null;
}
function zl(e, t, n) {
  const o = W(t, n);
  if (o) return o;
  if (e.fmt === 2) {
    const l = (e.style.levels ?? Bn).filter((u) => u.visible).map((u) => u.coeff);
    if (l.length === 0) return null;
    const s = Math.max(...l), a = Math.abs(t[1].x - t[0].x) / 2 * s + L, c = Math.abs(t[1].y - t[0].y) / 2 * s + L, f = (n.x - (t[0].x + t[1].x) / 2) / a, h = (n.y - (t[0].y + t[1].y) / 2) / c;
    return f * f + h * h <= 1 ? { hit: "body" } : null;
  }
  const i = Math.hypot(t[1].x - t[0].x, t[1].y - t[0].y);
  return Math.hypot(n.x - t[0].x, n.y - t[0].y) <= i + L ? { hit: "body" } : null;
}
function Wl(e, t, n, o, i, r) {
  const [l, s, a] = t, c = s.x - l.x === 0 ? 0 : (a.x - l.x) / (s.x - l.x), f = a.y - (l.y + (s.y - l.y) * c), h = { x: l.x, y: l.y + f }, u = { x: s.x, y: s.y + f }, x = { x: (l.x + s.x) / 2, y: (l.y + s.y) / 2 }, d = [l, s, h, u, { x: x.x, y: x.y + f }, x], p = W(d, n);
  if (p) return p;
  const y = e.style, m = (y.levels ?? He).filter((g) => g.visible);
  if (m.length === 0) return null;
  const b = (i + r) * 2;
  for (const g of m) {
    const w = f * g.coeff, [M, v] = Xe({ x: l.x, y: l.y + w }, { x: s.x, y: s.y + w }, !!y.extendLeft, !!y.extendRight, b);
    if (H(n.x, n.y, M, v) <= o) return { hit: "body" };
  }
  return y.fillBackground !== !1 && Fn(n, l, s, { x: 0, y: f }, m[0].coeff, m[m.length - 1].coeff, !!y.extendLeft, !!y.extendRight) ? { hit: "body" } : null;
}
function Rl(e, t, n, o, i, r) {
  const [l, s, a] = t, c = { x: s.x, y: a.y }, f = { x: l.x, y: a.y + (s.y - l.y) }, u = W([l, s, c, f], n);
  if (u) return u;
  const x = e.style, d = (i + r) * 2;
  for (const [p, y] of [[l, s], [f, c]]) {
    const [m, b] = Xe(p, y, !!x.extendLeft, !!x.extendRight, d);
    if (H(n.x, n.y, m, b) <= o) return { hit: "body" };
  }
  return null;
}
function Fl(e, t, n, o, i, r) {
  const l = W(t, n);
  if (l) return l;
  const [s, a, c] = t, f = e.style, h = (i + r) * 2;
  for (const [u, x] of [[s, a], [{ x: s.x, y: c.y }, { x: a.x, y: c.y }]]) {
    const [d, p] = Xe(u, x, !!f.extendLeft, !!f.extendRight, h);
    if (H(n.x, n.y, d, p) <= o) return { hit: "body" };
  }
  return null;
}
function Ol(e, t, n, o, i, r) {
  const l = W(t, n);
  if (l) return l;
  const [s, a, c] = t;
  if (!c) return H(n.x, n.y, s, a) <= o ? { hit: "body" } : null;
  const f = e.style, h = { x: c.x - s.x, y: c.y - s.y }, u = (f.levels ?? Pt).filter((d) => d.visible).map((d) => d.coeff);
  if (u.length === 0) return null;
  const x = (i + r) * 2;
  for (const d of u) {
    const [p, y] = Xe({ x: s.x + h.x * d, y: s.y + h.y * d }, { x: a.x + h.x * d, y: a.y + h.y * d }, !!f.extendLeft, !!f.extendRight, x);
    if (H(n.x, n.y, p, y) <= o) return { hit: "body" };
  }
  return f.fillBackground === !1 ? null : Fn(n, s, a, h, Math.min(...u), Math.max(...u), !!f.extendLeft, !!f.extendRight) ? { hit: "body" } : null;
}
function Dl(e, t) {
  const n = W(e, t);
  if (n) return n;
  const [o, i, r] = e;
  if (!r) return null;
  const l = (o.x + i.x) / 2, s = (o.y + i.y) / 2, a = Math.max(1, Math.hypot(i.x - o.x, i.y - o.y) / 2), c = Math.atan2(i.y - o.y, i.x - o.x), f = -Math.sin(c), h = Math.cos(c), u = Math.max(1, Math.abs((r.x - l) * f + (r.y - s) * h)), x = t.x - l, d = t.y - s, p = x * Math.cos(-c) - d * Math.sin(-c), y = x * Math.sin(-c) + d * Math.cos(-c);
  return (p / (a + L)) ** 2 + (y / (u + L)) ** 2 <= 1 ? { hit: "body" } : null;
}
function Pi(e, t) {
  const [n, o, i, r] = bt(e, t);
  return [
    { x: (n.x + o.x) / 2, y: n.y },
    { x: o.x, y: (o.y + i.y) / 2 },
    { x: (r.x + i.x) / 2, y: i.y },
    { x: n.x, y: (n.y + r.y) / 2 }
  ];
}
function un(e, t, n = !1) {
  const [o, i] = e, r = kl(o, i, t);
  if (r) return r;
  if (n) {
    const f = Pi(o, i);
    for (let h = 0; h < 4; h++)
      if (Math.hypot(f[h].x - t.x, f[h].y - t.y) <= ot)
        return { hit: "handle", handleIndex: 4 + h };
  }
  const l = Math.min(o.x, i.x), s = Math.max(o.x, i.x), a = Math.min(o.y, i.y), c = Math.max(o.y, i.y);
  return t.x >= l - L && t.x <= s + L && t.y >= a - L && t.y <= c + L ? { hit: "body" } : null;
}
function _l(e, t) {
  const n = W(e, t);
  if (n) return n;
  const [o, i] = e, r = Math.hypot(i.x - o.x, i.y - o.y);
  return Math.hypot(t.x - o.x, t.y - o.y) <= r + L ? { hit: "body" } : null;
}
function Hl(e, t, n, o) {
  const i = W(t, n);
  if (i) return i;
  const r = e.style.extendLeft ? 0 : Math.min(t[0].x, t[1].x), l = e.style.extendRight ? o : Math.max(t[0].x, t[1].x), s = Math.min(t[0].y, t[1].y), a = Math.max(t[0].y, t[1].y);
  return n.x >= r - L && n.x <= l + L && n.y >= s - L && n.y <= a + L ? { hit: "body" } : null;
}
function xo(e, t) {
  const n = W(e, t);
  if (n) return n;
  const o = Math.min(e[0].x, e[1].x), i = Math.max(e[0].x, e[1].x), r = Math.min(e[0].y, e[1].y), l = Math.max(e[0].y, e[1].y);
  return t.x >= o - L && t.x <= i + L && t.y >= r - L && t.y <= l + L ? { hit: "body" } : null;
}
function Nl(e, t, n) {
  const o = e.fmt === 2, i = Ho(t, o), r = o ? [t[0], t[1], ...i] : t, l = W(r, n);
  return l || (Qt(n.x, n.y, i) ? { hit: "body" } : null);
}
function Yl(e, t) {
  const n = W(e, t);
  return n || (Qt(t.x, t.y, e) ? { hit: "body" } : null);
}
function te(e, t, n = L) {
  for (let o = 1; o < e.length; o++)
    if (H(t.x, t.y, e[o - 1], e[o]) <= n)
      return { hit: "body" };
  return null;
}
function Vl(e, t, n, o, i = L) {
  const r = W(t, n);
  if (r) return r;
  const l = si(e, t, o);
  if (!l) {
    const [s, a] = t;
    return Math.abs(n.x - s.x) <= i || Math.abs(n.x - a.x) <= i ? { hit: "body" } : H(n.x, n.y, s, a) <= i ? { hit: "body" } : null;
  }
  if (l.lineMode) {
    for (let s = 1; s < l.line.length; s++)
      if (H(n.x, n.y, l.line[s - 1], l.line[s]) <= i) return { hit: "body" };
    return null;
  }
  for (const s of l.bars)
    if (Math.abs(n.x - s.x) <= 1 + i && n.y >= s.top - i && n.y <= s.bottom + i) return { hit: "body" };
  return null;
}
function Ul(e, t, n, o) {
  const i = W(t, n);
  if (i) return i;
  const r = t[0], l = o === "up" ? r.y : r.y - 22;
  if (n.x >= r.x - 9.75 && n.x <= r.x + 9.75 && n.y >= l && n.y <= l + 22) return { hit: "body" };
  const s = ci(e, r);
  return s && n.x >= s.left && n.x <= s.left + s.width && n.y >= s.top && n.y <= s.top + s.height ? { hit: "body" } : null;
}
function Xl(e, t, n, o, i) {
  const r = W(t, n);
  if (r) return r;
  const [l, s] = t, a = li(e, t, i, Pe), c = Math.max(o, Math.abs(s.y - l.y) + Math.max(l.y, s.y)), f = [...a.h.map((x) => ({ x: s.x, y: x.y })), ...a.v.map((x) => ({ x: x.x, y: s.y }))];
  for (const x of f) {
    const d = an(l, x, o, c);
    if (H(n.x, n.y, l, d) <= L) return { hit: "body" };
  }
  const h = { x: s.x, y: l.y }, u = { x: l.x, y: s.y };
  for (const [x, d] of [[l, h], [h, s], [s, u], [u, l]])
    if (H(n.x, n.y, x, d) <= L) return { hit: "body" };
  return null;
}
function Gl(e, t, n, o) {
  const i = W(t, n);
  if (i) return i;
  const [r, l, s] = t;
  if (!s) return null;
  const a = { x: (l.x + s.x) / 2, y: (l.y + s.y) / 2 }, c = { x: (s.x - l.x) / 2, y: (s.y - l.y) / 2 }, f = o * 4, h = [a], u = (e.style.levels ?? kt).filter((x) => x.visible);
  for (const x of u)
    h.push({ x: a.x + c.x * x.coeff, y: a.y + c.y * x.coeff }), h.push({ x: a.x - c.x * x.coeff, y: a.y - c.y * x.coeff });
  for (const x of h) {
    const d = x.x - r.x, p = x.y - r.y, y = Math.hypot(d, p) || 1, m = { x: r.x + d / y * f, y: r.y + p / y * f };
    if (H(n.x, n.y, r, m) <= L) return { hit: "body" };
  }
  return H(n.x, n.y, l, s) <= L ? { hit: "body" } : null;
}
function jl(e, t, n, o, i) {
  const r = W(t, n);
  if (r) return r;
  const [l, s, a] = t;
  if (H(n.x, n.y, l, s) <= o) return { hit: "body" };
  if (a && H(n.x, n.y, s, a) <= o) return { hit: "body" };
  const c = (e.style.levels ?? Sn).filter((f) => f.visible);
  for (const f of Go(e, t, i, c))
    if (Math.abs(n.x - f.x) <= Math.max(o, (f.width ?? 1) / 2 + 2)) return { hit: "body" };
  return null;
}
function ql(e, t, n) {
  const o = W(t, n);
  if (o) return o;
  const i = Yo(e, t);
  if (!i) return null;
  const r = Vo(i);
  return n.x >= r.left - L && n.x <= r.right + L && n.y >= r.top - L && n.y <= r.bottom + L ? { hit: "body" } : null;
}
function Zl(e, t) {
  const n = W(e, t);
  if (n) return n;
  const [o, i, r] = e;
  if (!r) return null;
  const l = Math.hypot(i.x - o.x, i.y - o.y);
  if (l < 1e-6) return null;
  const s = Math.atan2(i.y - o.y, i.x - o.x);
  let c = Math.atan2(r.y - o.y, r.x - o.x) - s;
  for (; c > Math.PI; ) c -= 2 * Math.PI;
  for (; c < -Math.PI; ) c += 2 * Math.PI;
  const f = Math.hypot(t.x - o.x, t.y - o.y);
  let h = Math.atan2(t.y - o.y, t.x - o.x) - s;
  for (; h > Math.PI; ) h -= 2 * Math.PI;
  for (; h < -Math.PI; ) h += 2 * Math.PI;
  return (c >= 0 ? h >= -0.05 && h <= c + 0.05 : h <= 0.05 && h >= c - 0.05) && f <= l + L ? { hit: "body" } : null;
}
function Kl(e, t, n) {
  const o = W(t, n);
  if (o) return o;
  const [i, r, l] = t;
  if (!l) return null;
  const s = Math.hypot(r.x - i.x, r.y - i.y);
  if (s < 1e-6) return null;
  const a = Math.atan2(r.y - i.y, r.x - i.x), c = Math.atan2(l.y - i.y, l.x - i.x), f = { x: i.x + Math.cos(c) * s, y: i.y + Math.sin(c) * s };
  if (H(n.x, n.y, i, r) <= L) return { hit: "body" };
  if (H(n.x, n.y, i, f) <= L) return { hit: "body" };
  let h = c - a;
  for (; h > Math.PI; ) h -= 2 * Math.PI;
  for (; h < -Math.PI; ) h += 2 * Math.PI;
  const u = Math.hypot(n.x - i.x, n.y - i.y);
  let x = Math.atan2(n.y - i.y, n.x - i.x) - a;
  for (; x > Math.PI; ) x -= 2 * Math.PI;
  for (; x < -Math.PI; ) x += 2 * Math.PI;
  if (h >= 0 ? x >= -0.05 && x <= h + 0.05 : x <= 0.05 && x >= h - 0.05) {
    const p = (e.style.levels ?? Ln).filter((y) => y.visible);
    for (const y of p)
      if (Math.abs(u - s * y.coeff) <= L) return { hit: "body" };
  }
  return null;
}
function Ql(e, t, n) {
  const o = W(t, n);
  if (o) return o;
  const [i, r] = t, l = Math.hypot(r.x - i.x, r.y - i.y);
  if (l < 1e-6) return null;
  const s = r.y >= i.y ? 1 : -1;
  if ((n.y - i.y) * s < -L) return null;
  const a = Math.hypot(n.x - i.x, n.y - i.y), c = (e.style.levels ?? $n).filter((f) => f.visible);
  for (const f of c)
    if (Math.abs(a - l * f.coeff) <= L) return { hit: "body" };
  return null;
}
const xe = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
function Ei(e, t, n = !1) {
  const o = t.x - e.x, i = t.y - e.y, r = Math.hypot(o, i);
  if (r < 1e-6) return [];
  const l = Math.atan2(i, o), s = [], a = 50 * (xe.length - 1);
  for (let c = 0; c <= a; c++) {
    const f = c / 50, h = Math.floor(f), u = Math.ceil(f);
    if (u >= xe.length) break;
    const x = Math.pow(f - h, 1.15), d = (xe[h] + (xe[u] - xe[h]) * x) * (r / 5), p = l + (n ? -1 : 1) * c * Math.PI / 100;
    s.push({ x: e.x + Math.cos(p) * d, y: e.y + Math.sin(p) * d });
  }
  return s;
}
function zi(e, t, n) {
  const o = Math.abs(t.x - e.x);
  if (o < 1e-3) return [];
  const i = t.y - e.y, r = Math.max(1, o / 30), l = [];
  for (let s = 0; s <= n + r; s += r)
    l.push({ x: s, y: e.y + i / 2 - Math.cos((s - e.x) * Math.PI / o) * i / 2 });
  return l;
}
function xn(e, t = !1, n = !1) {
  const [o, i, r] = e, l = t ? -4 : 0, s = n ? 5 : 1, a = Math.ceil(32 * (s - l)), c = [];
  for (let f = 0; f <= a; f++) {
    const h = l + (s - l) * f / a, u = 1 - h;
    c.push({ x: u * u * o.x + 2 * u * h * i.x + h * h * r.x, y: u * u * o.y + 2 * u * h * i.y + h * h * r.y });
  }
  return c;
}
function Wi(e, t, n) {
  const o = t.x - e.x, i = t.y - e.y, r = Math.hypot(o, i);
  if (r < 1e-3) return null;
  const l = o / r, s = i / r, a = -s * (n.x - e.x) + l * (n.y - e.y), c = Math.abs(a);
  if (c < 1) return null;
  const f = a < 0 ? -1 : 1, h = 1 - Math.sqrt(3) / 2, u = c / (r * h), x = [];
  for (let d = 0; d <= 48; d++) {
    const p = 2 * Math.PI / 3 - d / 48 * (Math.PI / 3), y = r / 2 + r * Math.cos(p), m = f * u * r * (Math.sin(p) - Math.sqrt(3) / 2);
    x.push({ x: e.x + l * y - s * m, y: e.y + s * y + l * m });
  }
  return x;
}
function dn(e, t = !1, n = !1) {
  const [o, i, r, l] = e, s = t ? -3 : 0, a = n ? 4 : 1, c = Math.ceil(32 * (a - s)), f = [];
  for (let h = 0; h <= c; h++) {
    const u = s + (a - s) * h / c, x = 1 - u;
    f.push({
      x: x * x * x * o.x + 3 * x * x * u * i.x + 3 * x * u * u * r.x + u * u * u * l.x,
      y: x * x * x * o.y + 3 * x * x * u * i.y + 3 * x * u * u * r.y + u * u * u * l.y
    });
  }
  return f;
}
const Jl = /* @__PURE__ */ new Set([
  "triangle-pattern"
]);
function ts(e, t, n) {
  const o = W(t, n);
  if (o) return o;
  const i = Ye(e.style);
  for (let r = 1; r < t.length; r++)
    if (H(n.x, n.y, t[r - 1], t[r]) <= i) return { hit: "body" };
  if (e.kind === "xabcd-pattern" || e.kind === "cypher-pattern")
    return t.length >= 3 && Qt(n.x, n.y, [t[0], t[1], t[2]]) ? { hit: "body" } : t.length >= 5 && Qt(n.x, n.y, [t[2], t[3], t[4]]) ? { hit: "body" } : null;
  if (Jl.has(e.kind) && t.length >= 3 && Qt(n.x, n.y, t))
    return { hit: "body" };
  if (e.kind === "polyline" && e.closed === !0 && e.style.fillBackground !== !1 && t.length >= 2) {
    if (H(n.x, n.y, t[t.length - 1], t[0]) <= i) return { hit: "body" };
    if (t.length >= 3 && Qt(n.x, n.y, t)) return { hit: "body" };
  }
  return null;
}
function es(e, t, n = L) {
  if (e.length === 0) return null;
  const o = e.length - 1;
  return Math.hypot(e[0].x - t.x, e[0].y - t.y) <= ot ? { hit: "handle", handleIndex: 0 } : Math.hypot(e[o].x - t.x, e[o].y - t.y) <= ot ? { hit: "handle", handleIndex: o } : te(e, t, n);
}
function de(e, t, n, o = L) {
  const i = W(t, n);
  return i || te(e, n, o);
}
function ns(e, t, n, o) {
  const i = W(e, t);
  if (i) return i;
  const [r, l] = e, s = l.x - r.x;
  if (Math.abs(s) < 1e-3) return null;
  for (let a = r.x; s > 0 ? a <= n + o : a >= -o; a += s)
    if (Math.abs(t.x - a) <= o) return { hit: "body" };
  return H(t.x, t.y, r, l) <= o ? { hit: "body" } : null;
}
function os(e, t, n, o) {
  const i = W(e, t);
  if (i) return i;
  const [r, l] = e, s = Math.abs(l.x - r.x);
  if (s < 1e-3) return null;
  const a = r.y;
  if (t.y - a > o) return null;
  const c = s / 2, f = Math.min(r.x, l.x), h = Math.floor(-f / s) - 1, u = Math.ceil((n - f) / s) + 1;
  for (let x = h; x <= u; x++) {
    const d = f + x * s + c, p = Math.hypot(t.x - d, t.y - a);
    if (Math.abs(p - c) <= o) return { hit: "body" };
  }
  return null;
}
function is(e, t, n, o) {
  var s;
  const i = W(t, n);
  if (i) return i;
  if (t[1] && H(n.x, n.y, t[0], t[1]) <= L) return { hit: "body" };
  const r = (o == null ? void 0 : o.pipSize()) ?? 0.01, l = (s = jo(e, t, Math.max(0, Math.min(8, Math.round(-Math.log10(r)))))) == null ? void 0 : s.box;
  return l && n.x >= l.left && n.x <= l.left + l.width && n.y >= l.top && n.y <= l.top + l.height ? { hit: "body" } : null;
}
function rs(e, t, n, o, i) {
  const r = Ko(e, i, o), l = W(r ? r.anchors : t, n);
  if (l) return l;
  if (!r) return Ii(t, n);
  const s = [r.center, r.upper, r.lower];
  for (const a of s)
    if (a && H(n.x, n.y, a[0], a[1]) <= L)
      return { hit: "body" };
  return null;
}
function ls(e, t, n, o) {
  if (Math.hypot(t[0].x - n.x, t[0].y - n.y) <= ot)
    return { hit: "handle", handleIndex: 0 };
  const i = ti(e, o);
  if (i.line.length < 2) return Bi(t, n);
  const r = te(i.line, n);
  if (r) return r;
  for (const l of i.bands) {
    if (l.upper.length >= 2 && cn(e.style, l.index, "upper").visible && te(l.upper, n)) return { hit: "body" };
    if (l.lower.length >= 2 && cn(e.style, l.index, "lower").visible && te(l.lower, n)) return { hit: "body" };
  }
  return null;
}
function ss(e, t, n = L) {
  const o = W(e, t);
  return o || te(ei(e[0], e[1]), t, n);
}
function cs(e, t) {
  const n = e[0];
  return Math.hypot(n.x - t.x, n.y - t.y) <= ot ? { hit: "handle", handleIndex: 0 } : t.x >= n.x - L && t.x <= n.x + 17 + L && t.y >= n.y - 22 - L && t.y <= n.y + L ? { hit: "body" } : null;
}
function as(e, t, n, o) {
  if (!e.ghost) return un(t, n);
  const i = W(t, n);
  if (i) return i;
  let r = L;
  if (o) {
    const l = o.priceToY(e.points[0].price), s = o.priceToY(e.points[0].price + e.ghost.amplitude);
    l != null && s != null && (r = Math.max(r, Math.abs(s - l)));
  }
  for (let l = 1; l < t.length; l++)
    if (H(n.x, n.y, t[l - 1], t[l]) <= r) return { hit: "body" };
  return null;
}
function fs(e, t, n, o, i, r, l = !1) {
  var a;
  const s = Ye(e.style);
  switch (e.kind) {
    case "horizontal-line":
      return Ll(t, n, o, s);
    case "horizontal-ray":
      return Bi(t, n, s);
    case "vertical-line":
      return Sl(t, n, i, s);
    case "cross-line":
      return Cl(t, n, s);
    case "arrow-mark-up":
    case "arrow-mark-down":
      return Ul(e, t, n, e.kind === "arrow-mark-up" ? "up" : "down");
    case "font-icon":
      return Cr(t, n);
    case "table": {
      const c = zn(e, t[0]), f = W(mi(c), n);
      if (f) return f;
      const h = rl(c, n, l);
      return h ? "edge" in h ? { hit: "handle", handleIndex: el(h.edge) } : { hit: "body", cell: h.cell } : null;
    }
    case "image": {
      const c = wi(e, t[0]);
      if (!c) return null;
      const f = W(Mi(c), n);
      return f || (n.x >= c.left && n.x <= c.right && n.y >= c.top && n.y <= c.bottom ? { hit: "body" } : null);
    }
    case "price-label": {
      const c = W(t, n);
      if (c) return c;
      const f = Ci(e.points[0].price.toFixed(Math.max(0, Math.min(8, Math.round(-Math.log10((r == null ? void 0 : r.pipSize()) ?? 0.01))))), t[0], e.style.fontSize ?? 14);
      return Dt(n, { left: f.x, top: f.y, width: f.w, height: f.h }) ? { hit: "body" } : null;
    }
    case "flag-mark":
      return cs(t, n);
    case "trend-line":
    case "ray":
    case "extended-line":
    case "info-line":
    case "arrow":
    case "trend-angle":
      return Al(e, t, n, o, i);
    case "arrow-marker":
      return Ii(t, n, s);
    case "position-forecast":
      return ss(t, n, s);
    case "long-position":
    case "short-position":
      return $l(e, t, n, r);
    case "bar-pattern":
      return Vl(e, t, n, r, s);
    case "ghost-feed":
      return as(e, t, n, r);
    case "gann-box":
      return un(t, n);
    case "gann-fan":
      return Pl(e, t, n, o, i);
    case "fib-time-zone":
      return El(e, t, n, s);
    case "fib-circles":
      return zl(e, t, n);
    case "fib-speed-resistance-fan":
      return Xl(e, t, n, o, r);
    case "pitchfan":
      return Gl(e, t, n, o);
    case "fib-wedge":
      return Kl(e, t, n);
    case "trend-based-fib-time":
      return jl(e, t, n, s, r);
    case "gann-square-fixed":
    case "gann-square":
      return ql(e, t, n);
    case "sector":
      return Zl(t, n);
    case "fib-speed-resistance-arcs":
      return Ql(e, t, n);
    case "fib-spiral":
      return de(Ei(t[0], t[1], !!e.style.counterclockwise), t, n, s);
    case "sine-line":
      return de(zi(t[0], t[1], o), t, n, s);
    case "time-cycles":
      return os(t, n, o, s);
    case "cyclic-lines":
      return ns(t, n, o, s);
    case "curve":
      return de(
        xn(t, !!e.style.extendLeft, !!e.style.extendRight),
        t,
        n,
        s
      );
    case "arc":
      return de(
        (t.length === 3 ? Wi(t[0], t[1], t[2]) : null) ?? [t[0], t[1]],
        t,
        n,
        s
      );
    case "double-curve":
      return de(
        dn(t, !!e.style.extendLeft, !!e.style.extendRight),
        t,
        n,
        s
      );
    case "text": {
      const c = ki(e, t[0]);
      if (l && e.style.wordWrap) {
        const f = W([t[0], { x: c.box.left + c.box.width, y: c.box.top + c.box.height / 2 }], n);
        if (f && f.hit === "handle" && f.handleIndex === 1) return f;
      }
      return Dt(n, c.box) ? { hit: "body" } : null;
    }
    case "comment": {
      const c = W(t, n);
      return c || (Dt(n, Li(e, t[0]).l.box) ? { hit: "body" } : null);
    }
    case "pin": {
      const c = W(t, n);
      if (c) return c;
      const f = Si(e, t[0], o), h = f.marker;
      return n.x >= h.left && n.x <= h.right && n.y >= h.top && n.y <= h.bottom ? { hit: "body" } : l && Dt(n, { left: f.left, top: f.top, width: f.width, height: f.height }) ? { hit: "body" } : null;
    }
    case "signpost": {
      if (!r) return null;
      const c = Rn(e, t[0], r, i);
      return Math.hypot(c.anchor.x - n.x, c.anchor.y - n.y) <= ot ? { hit: "handle", handleIndex: 0 } : H(n.x, n.y, { x: c.x, y: c.poleStart }, { x: c.x, y: c.poleEnd }) < 3 ? { hit: "body" } : e.style.showImage && Math.hypot(n.x - c.x, n.y - c.plateY) <= 38 ? { hit: "body" } : Dt(n, c.l.box) ? { hit: "body" } : null;
    }
    case "note": {
      const c = W(t, n);
      return c || (t[1] && H(n.x, n.y, t[0], t[1]) <= L ? { hit: "body" } : t[1] && Dt(n, vi(e, e.style, t[0], t[1]).box) ? { hit: "body" } : null);
    }
    case "price-note":
      return is(e, t, n, r);
    case "callout": {
      const c = Ti(e, t[1]);
      return Math.hypot(t[0].x - n.x, t[0].y - n.y) <= ot ? { hit: "handle", handleIndex: 0 } : l && c.wrap != null && Math.hypot(t[1].x + c.wrap / 2 + 10 - n.x, t[1].y - n.y) <= ot ? { hit: "handle", handleIndex: 1 } : Dt(n, { left: c.x, top: c.y, width: c.w, height: c.h }) ? { hit: "body" } : null;
    }
    case "regression-trend":
      return rs(e, t, n, o, r);
    case "fixed-range-volume-profile": {
      const c = W(t, n);
      if (c) return c;
      const f = ri(e, t, r);
      return f && n.x >= f.left && n.x <= f.right && n.y >= f.top && n.y <= f.bottom ? { hit: "body" } : null;
    }
    case "anchored-volume-profile": {
      const c = W([t[0]], n);
      if (c) return c;
      const f = ii(e, t, r);
      return f && n.x >= f.left && n.x <= f.right && n.y >= f.top && n.y <= f.bottom ? { hit: "body" } : null;
    }
    case "anchored-vwap":
      return ls(e, t, n, r);
    case "abcd-pattern":
    case "xabcd-pattern":
    case "cypher-pattern":
    case "head-and-shoulders":
    case "triangle-pattern":
    case "three-drives-pattern":
    case "elliott-impulse":
    case "elliott-correction":
    case "elliott-triangle":
    case "elliott-double-combo":
    case "elliott-triple-combo":
    case "polyline":
    case "path":
      return ts(e, t, n);
    case "brush":
    case "highlighter":
      return es(t, n, s);
    case "parallel-channel":
      return Wl(e, t, n, s, o, i);
    case "disjoint-channel":
      return Rl(e, t, n, s, o, i);
    case "flat-top-bottom":
      return Fl(e, t, n, s, o, i);
    case "pitchfork":
    case "schiff-pitchfork":
    case "modified-schiff-pitchfork":
    case "inside-pitchfork":
      return Bl(e, t, n, o, i);
    case "fib-channel":
      return Ol(e, t, n, s, o, i);
    case "rotated-rectangle":
      return Nl(e, t, n);
    case "trend-based-fib-extension":
      return Il(e, t, n);
    case "fib-retracement":
      return Tl(e, t, n);
    case "rectangle": {
      const c = (r == null ? void 0 : r.timeAxis().width) || o, f = un(t, n, !0);
      if (f) return f;
      if (e.style.extendLeft || e.style.extendRight) {
        const u = Math.min(t[0].y, t[1].y), x = Math.max(t[0].y, t[1].y), d = e.style.extendLeft ? 0 : Math.min(t[0].x, t[1].x), p = e.style.extendRight ? c : Math.max(t[0].x, t[1].x);
        if (n.x >= d && n.x <= p && n.y >= u - L && n.y <= x + L) return { hit: "body" };
      }
      const h = (a = qo(e, t, c)) == null ? void 0 : a.box;
      return h && n.x >= h.left && n.x <= h.left + h.width && n.y >= h.top && n.y <= h.top + h.height ? { hit: "body" } : null;
    }
    case "circle":
      return _l(t, n);
    case "ellipse":
      return Dl(t, n);
    case "price-range":
      return Hl(e, t, n, o);
    case "date-range":
      return xo(t, n);
    case "date-and-price-range":
      return xo(t, n);
    case "triangle":
      return Yl(t, n);
  }
}
function hs(e) {
  const t = e.replace("#", ""), n = t.length === 3 ? t.split("").map((o) => o + o).join("") : t;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
function ct(e) {
  if (/^rgba?\(/.test(e)) {
    const t = e.match(/[\d.]+/g);
    if (t && t.length >= 3)
      return { hex: ("#" + t.slice(0, 3).map((o) => Number(o).toString(16).padStart(2, "0")).join("")).toUpperCase(), opacity: t[3] != null ? Math.round(Number(t[3]) * 100) : 100 };
  }
  return { hex: (e || "#000000").toUpperCase(), opacity: 100 };
}
function Lt(e, t) {
  if (t >= 100) return e;
  const [n, o, i] = hs(e);
  return `rgba(${n}, ${o}, ${i}, ${(t / 100).toFixed(2)})`;
}
function us(e) {
  let t = 0, n = 0, o = 0;
  const i = e.match(/^#([0-9a-f]{6})/i);
  if (i) {
    const r = parseInt(i[1], 16);
    t = r >> 16, n = r >> 8 & 255, o = r & 255;
  } else {
    const r = e.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
    r && (t = +r[1], n = +r[2], o = +r[3]);
  }
  return 0.199 * t + 0.687 * n + 0.114 * o >= 150 ? "#000000" : "#ffffff";
}
const Gt = (e, t) => ({ ...e, back: t, color: us(t) });
function xs(e, t, n) {
  const o = e.style, i = [], r = [];
  if ((e.kind === "vertical-line" || e.kind === "cross-line") && o.showTime && e.points[0] && r.push(Gt({ time: e.points[0].time }, ct(o.color).hex)), e.kind === "long-position" || e.kind === "short-position") {
    if (o.showPriceLabels !== !1) {
      const l = Pn(e, t, n);
      if (l) {
        const s = e.points[0].price, a = e.kind === "long-position" ? 1 : -1;
        i.push(Gt({ price: s }, "#787b86"), Gt({ price: s + a * l.profit }, "#089981"), Gt({ price: s - a * l.stop }, "#f23645"));
      }
    }
    return { price: i, time: r };
  }
  if (e.kind === "anchored-vwap") {
    if (o.vwapPriceLabel !== !1) {
      const l = Xr(e, n);
      l != null && i.push(Gt({ price: l }, ct(o.color).hex));
    }
    return { price: i, time: r };
  }
  if (o.showPriceLabels && e.kind !== "vertical-line")
    for (const l of e.points) i.push(Gt({ price: l.price }, ct(o.color).hex));
  return { price: i, time: r };
}
let Ze = null, ze = null;
function Ri() {
  return Ze || (Ze = document.createElement("canvas").getContext("2d")), Ze;
}
function st(e, t) {
  const n = Ri();
  return n ? (ze ?? (ze = getComputedStyle(document.body).fontFamily), n.font = `${t}px ${ze}`, n.measureText(e).width) : e.length * t * 0.6;
}
function ds(e, t) {
  const n = Ri();
  return n ? (ze ?? (ze = getComputedStyle(document.body).fontFamily), n.font = `bold ${t}px ${ze}`, n.measureText(e).width) : e.length * t * 0.65;
}
function mt(e, t) {
  const n = Math.abs(e).toFixed(t);
  return e < 0 ? `−${n}` : n;
}
function On(e) {
  const t = e < 0;
  let n = Math.abs(Math.round(e));
  const o = Math.floor(n / 86400);
  n -= o * 86400;
  const i = Math.floor(n / 3600);
  n -= i * 3600;
  const r = Math.floor(n / 60);
  n -= r * 60;
  const l = [];
  o && l.push(`${o.toLocaleString("en-US")}d`), i && l.push(`${i}h`), r && l.push(`${r}m`), n && l.push(`${n}s`);
  const s = l.join(" ");
  return t ? `-${s}` : s;
}
function ys(e) {
  const t = [[1e9, " B"], [1e6, " M"], [1e3, " K"]];
  for (const [n, o] of t) if (Math.abs(e) >= n) return `${Number((e / n).toFixed(2))}${o}`;
  return String(Math.round(e));
}
function we(e) {
  return e.length % 2 === 1 && e[Math.floor(e.length / 2)].trim() !== "";
}
function Fi(e, t, n, o, i, r, l, s, a, c, f) {
  const h = Math.max(0, ...n.map((g) => zt(g, o, c, f))) + 2 * l, u = n.length * i + 2 * r, x = a === "left" ? e.x : a === "right" ? e.x - h : e.x - h / 2, d = s === "bottom" ? e.y - u : s === "top" ? e.y : e.y - u / 2, p = t * Math.PI / 180, y = Math.cos(p), m = Math.sin(p), b = (g, w) => ({ x: (g - e.x) * y - (w - e.y) * m + e.x, y: (g - e.x) * m + (w - e.y) * y + e.y });
  return [b(x, d), b(x + h, d), b(x + h, d + u), b(x, d + u)];
}
function U(e, t, n, o) {
  return {
    t: "group",
    transform: e.rotate,
    inert: !0,
    items: e.lines.map((i, r) => ({
      t: "text",
      x: e.tx,
      y: e.y0 + r * e.lineStep,
      text: i,
      size: e.fs,
      anchor: e.anchor,
      baseline: "central",
      weight: n ? 700 : 400,
      fontStyle: o ? "italic" : "normal",
      fill: t,
      pre: !0
    }))
  };
}
function Oi(e, t, n, o, i, r) {
  const l = i.text ?? "";
  if (l === "") return null;
  const s = i.vertLabelsAlign ?? "bottom", a = i.horzLabelsAlign ?? "left", c = s === "middle";
  let f, h;
  s === "bottom" ? [f, h] = e.y < n.y ? [e, t] : [n, o] : s === "top" ? [f, h] = e.y > n.y ? [e, t] : [n, o] : [f, h] = [{ x: (e.x + n.x) / 2, y: (e.y + n.y) / 2 }, { x: (t.x + o.x) / 2, y: (t.y + o.y) / 2 }];
  const u = f.x < h.x ? f : h, x = u === f ? h : f, d = a === "left" ? u : a === "right" ? x : { x: (u.x + x.x) / 2, y: (u.y + x.y) / 2 }, p = Math.atan((u.y - x.y) / (u.x - x.x)), y = Number.isNaN(p) ? 0 : p * 180 / Math.PI, m = i.fontSize ?? 14, b = m / 3, g = r ?? (c ? b : 0), w = l.split(`
`), M = Math.ceil(m), v = w.length * M + 2 * b, k = s === "bottom" ? d.y - v : s === "top" ? d.y : d.y - v / 2, S = a === "left" ? d.x + g : a === "right" ? d.x - g : d.x, C = a === "left" ? "start" : a === "right" ? "end" : "middle";
  return { u: d, angle: y, fs: m, lines: w, lineH: M, top: k + b, x: S, anchor: C, vert: s, horz: a, padV: b, padH: g };
}
function Ge(e, t, n, o, i, r) {
  const l = Oi(e, t, n, o, i, r);
  return l ? [
    {
      t: "group",
      transform: `rotate(${l.angle} ${l.u.x} ${l.u.y})`,
      inert: !0,
      items: l.lines.map((s, a) => ({
        t: "text",
        x: l.x,
        y: l.top + a * l.lineH,
        text: s,
        size: l.fs,
        anchor: l.anchor,
        baseline: "hanging",
        weight: i.bold ? 700 : 400,
        fontStyle: i.italic ? "italic" : "normal",
        fill: i.textColor ?? i.color,
        pre: !0
      }))
    }
  ] : [];
}
function Di(e, t, n, o, i, r, l) {
  const s = Oi(e, t, n, o, i, r);
  return !s || s.vert !== "middle" || !l && !we(s.lines) ? null : Fi(s.u, s.angle, s.lines, s.fs, s.lineH, s.padV, s.padH, s.vert, s.horz, !!i.bold, !!i.italic);
}
const Yt = {
  rectangle: [4, 5, 6, 7],
  // edge midpoints (line-tool-rectangle)
  disjointChannel: [2],
  // offset-edge end at p1.x (line-tool-disjoint-channel)
  parallelChannel: [4, 5],
  // the two middle anchors (line-tool-parallel-channel)
  position: [1, 2, 3],
  // close point, stop, target (line-tool-risk-reward)
  single: [0]
  // horizontal line, vertical line, signpost pole
}, ps = 50, ms = {
  price: "M3 2h11v1H3V2Zm5.5 1.8.35.35 2 2 .36.35-.71.7-.35-.35L9 5.71v6.58l1.15-1.14.35-.36.7.71-.35.35-2 2-.35.36-.35-.36-2-2-.36-.35.71-.7.35.35L8 12.29V5.71L6.85 6.85l-.35.36-.7-.71.35-.35 2-2 .35-.36ZM3.5 16H3v-1h11v1H3.5Z",
  bars: "M2 3v2H1v9h1v2h1v-2h1V5H3V3H2Zm6.2 4.5-.35.35L6.71 9h4.58l-1.14-1.15-.36-.35.71-.7.35.35 2 2 .36.35-.36.35-2 2-.35.36-.7-.71.35-.35L11.29 10H6.71l1.14 1.15.36.35-.71.7-.35-.35-2-2-.36-.35.36-.35 2-2 .35-.36.7.71ZM3 6H2v7h1V6Zm12-2.5V3h1v2h1v9h-1v2h-1v-2h-1V5h1V3.5ZM15 6h1v7h-1V6Z",
  angle: "M8.55 2.78 2.7 15H15v-1h-4.01a6.2 6.2 0 0 0-1.36-3.95 7.94 7.94 0 0 0-2.57-1.83l2.4-5-.91-.44ZM6.63 9.12 4.29 14H10a5.18 5.18 0 0 0-1.12-3.3 6.93 6.93 0 0 0-2.24-1.58Z"
};
function _i(e, t, n, o, i, r) {
  const l = e.points[0], s = e.points[1];
  if (!l || !s) return [];
  const a = [], c = s.price - l.price, f = (i == null ? void 0 : i.pipSize()) ?? 0.01, h = Math.max(0, Math.min(8, Math.round(-Math.log10(f))));
  if (o.showPriceRange || o.showPercentPriceRange || o.showPipsPriceRange) {
    const d = [];
    if (o.showPriceRange || o.showPercentPriceRange) {
      const p = [];
      if (o.showPriceRange && p.push(mt(c, h)), o.showPercentPriceRange) {
        const y = l.price !== 0 ? `${mt(c / Math.abs(l.price) * 100, 2)}%` : "";
        y && p.push(o.showPriceRange ? `(${y})` : y);
      }
      d.push(p.join(" "));
    }
    o.showPipsPriceRange && d.push(mt(Math.round(c / f), 0)), a.push({ icon: "price", text: d.join(", ") });
  }
  const u = r && !!o.showDateTimeRange, x = r && !!o.showDistance;
  if (o.showBarsRange || u || x) {
    let d = "";
    if (o.showBarsRange) {
      const p = i ? i.timeToBarIndex(l.time) : null, y = i ? i.timeToBarIndex(s.time) : null;
      d += `${p != null && y != null ? y - p : 0} bars`;
    }
    if (u) {
      const p = D(l.time), y = D(s.time), m = p != null && y != null ? On(y - p) : "";
      m && (d += o.showBarsRange ? ` (${m})` : m);
    }
    x && (d += (d ? ", " : "") + `distance: ${Math.round(Math.hypot(n.x - t.x, n.y - t.y))} px`), d && a.push({ icon: "bars", text: d });
  }
  if (r && o.showAngle && Math.hypot(n.x - t.x, n.y - t.y) > 0) {
    const d = Math.atan2(-(n.y - t.y), n.x - t.x) * 180 / Math.PI;
    a.push({ icon: "angle", text: `${Math.round(d * 100) / 100}º` });
  }
  return a;
}
function Hi(e, t, n, o, i, r) {
  const l = t.x - e.x, s = t.y - e.y;
  let a = 0, c = 1;
  const f = (h, u) => {
    if (h === 0) return u >= 0;
    const x = u / h;
    if (h < 0) {
      if (x > c) return !1;
      x > a && (a = x);
    } else {
      if (x < a) return !1;
      x < c && (c = x);
    }
    return !0;
  };
  return f(-l, e.x - n) && f(l, n + i - e.x) && f(-s, e.y - o) && f(s, o + r - e.y) && a <= c;
}
function bs(e, t, n, o) {
  return e.x === t.x && e.y === t.y ? e.x >= 0 && e.x <= n && e.y >= 0 && e.y <= o : Hi(e, t, 0, 0, n, o);
}
function Ni(e, t, n, o, i, r, l) {
  if (!i || n.length === 0) return [];
  const s = o === 3;
  if (s && !bs(e, t, r, l)) return [];
  const a = 12, c = 18, f = 8, h = 12;
  let x = Math.max(...n.map((k) => st(k.text, a))) + h * 2 + c + h;
  Math.round(x) % 2 !== 0 && (x = Math.round(x) + 1);
  const d = c * n.length + f * (n.length - 1) + h * 2, p = { x: (e.x + t.x) / 2, y: (e.y + t.y) / 2 }, y = o === 0 ? e : o === 2 ? t : p, m = t.y < e.y && t.x < e.x || t.y > e.y && t.x > e.x;
  let b = y.x + 12, g = m ? y.y - 12 - d : y.y + 12;
  s && (e.x !== t.x || e.y !== t.y) && (b < 0 ? b = 0 : b + x > r && (b = r - x), g < 0 ? g = 0 : g + d > l && (g = l - d), Hi(e, t, b, g, x, d) && (g = m ? p.y + 12 : p.y - 12 - d, b = Math.min(p.x, r) - x));
  const w = Math.floor(b), M = Math.floor(g), v = [{ t: "rect", x: w, y: M, w: x, h: d, rx: 4, ry: 4, fill: "#464646", fillOpacity: 230 / 255 }];
  return n.forEach((k, S) => {
    const C = M + h + S * (c + f);
    v.push({ t: "path", d: ms[k.icon], transform: `translate(${w + h}, ${C})`, fill: "#F9F9F9", fillRule: "evenodd" }), v.push({ t: "text", x: w + h + c + h, y: C + c / 2, text: k.text, size: a, fill: "#FFFFFF", baseline: "central" });
  }), [{ t: "group", inert: !0, items: v }];
}
function je(e, t, n) {
  const o = Math.hypot(t.x - e.x, t.y - e.y) || 1, i = (t.x - e.x) / o, r = (t.y - e.y) / o, l = 5 * n, s = t.x - i * l, a = t.y - r * l;
  return `M ${s - r * l} ${a + i * l} L ${t.x} ${t.y} L ${s + r * l} ${a - i * l}`;
}
function Bt(e, t, n) {
  return Math.hypot(t.x - e.x, t.y - e.y) < 1 ? [] : [{
    t: "path",
    d: je(e, t, n.width),
    fill: "none",
    stroke: n.color,
    strokeWidth: n.width,
    dash: R(n),
    join: "round",
    cap: (n.lineStyle ?? "solid") === "solid" ? "round" : "butt",
    inert: !0
  }];
}
function Yi(e) {
  return { ...e, horzLabelsAlign: e.horzLabelsAlign ?? "center", vertLabelsAlign: e.vertLabelsAlign ?? "bottom" };
}
function Dn(e, t, n) {
  return Di(e, t, e, t, Yi(n), (n.fontSize ?? 14) / 3, !1);
}
function ie(e, t) {
  return t && t.length ? { items: [{ t: "clip", name: e, polys: [t] }], clip: e } : { items: [], clip: void 0 };
}
function _n(e, t, n, o, i, r, l, s, a) {
  if (!e.points[0] || !e.points[1]) return [];
  const c = _i(e, t, n, o, l, !0), f = o.statsPosition ?? (e.kind === "info-line" ? 1 : 2), h = s || !!o.showStats, u = [{
    t: "group",
    clip: a,
    items: [...o.leftEnd === 1 ? Bt(n, t, o) : [], ...o.rightEnd === 1 ? Bt(t, n, o) : []]
  }];
  return o.showMiddlePoint && s && u.push({ t: "anchors", pts: [{ x: (t.x + n.x) / 2, y: (t.y + n.y) / 2 }] }), u.push(...Ge(t, n, t, n, Yi(o), (o.fontSize ?? 14) / 3)), u.push(...Ni(t, n, c, f, h, i, r)), u;
}
function gs(e, t, n) {
  if (!n.text) return null;
  const o = n.horzLabelsAlign ?? "center";
  return G({
    x: o === "left" ? 3 : o === "right" ? t : t / 2,
    y: e,
    text: n.text,
    fs: n.fontSize ?? 12,
    bold: n.bold,
    italic: n.italic,
    vert: n.vertLabelsAlign ?? "middle",
    horz: o,
    offsetX: o === "right" ? 3 : 0
  });
}
function ws(e, t, n) {
  if (!n.text) return null;
  const o = n.horzLabelsAlign ?? "center", i = { y: e.y, text: n.text, fs: n.fontSize ?? 12, bold: n.bold, italic: n.italic, vert: n.vertLabelsAlign ?? "top", horz: o };
  if (o === "right") {
    const r = G({ ...i, x: 0 }).box.width;
    return e.x + r + 3 >= t ? G({ ...i, x: e.x + r + 3 }) : G({ ...i, x: t, offsetX: 3 });
  }
  return G({ ...i, x: o === "center" ? (e.x + t) / 2 : e.x });
}
function Hn(e, t) {
  return e && t === "middle" && we(e.lines) ? e.poly : null;
}
const St = (e, t) => ({ t: "hit", a: e, b: t, width: 12 }), Vi = (e) => (e.lineStyle ?? "solid") === "solid" ? "round" : "butt";
function Ms(e, t, n, o) {
  const i = e[0], r = gs(i.y, n, o), l = ie("cut", Hn(r, o.vertLabelsAlign ?? "middle"));
  return [
    St({ x: 0, y: i.y }, { x: n, y: i.y }),
    ...l.items,
    { t: "line", a: { x: 0, y: i.y }, b: { x: n, y: i.y }, stroke: o.color, strokeWidth: o.width, dash: R(o), clip: l.clip },
    ...r ? [U(r, o.textColor ?? o.color, o.bold, o.italic)] : [],
    // TV line-tool-horizontal-line: the anchor sits at 90% of the pane width.
    ...t ? [{ t: "anchors", pts: [{ x: 0.9 * n, y: i.y }], squares: Yt.single }] : []
  ];
}
function vs(e, t, n, o) {
  var h;
  const i = e[0], r = o.vertLabelsAlign ?? "middle", l = o.horzLabelsAlign ?? "center", s = o.textOrientation === "horizontal", a = r === "top" ? n : r === "middle" ? n / 2 : 0, c = o.text ? G(s ? {
    x: i.x,
    y: a,
    text: o.text,
    fs: o.fontSize ?? 14,
    bold: o.bold,
    italic: o.italic,
    horz: l === "left" ? "right" : l === "right" ? "left" : "center",
    vert: r === "top" ? "bottom" : r === "bottom" ? "top" : "middle",
    offsetX: 5
  } : {
    x: i.x,
    y: a,
    text: o.text,
    fs: o.fontSize ?? 14,
    bold: o.bold,
    italic: o.italic,
    horz: r === "top" ? "left" : r === "middle" ? "center" : "right",
    vert: l === "left" ? "bottom" : l === "right" ? "top" : "middle",
    angle: -Math.PI / 2
  }) : null, f = ie("cut", s ? c && ((h = o.text) != null && h.trim()) ? c.poly : null : Hn(c, r));
  return [
    St({ x: i.x, y: 0 }, { x: i.x, y: n }),
    ...f.items,
    { t: "line", a: { x: i.x, y: 0 }, b: { x: i.x, y: n }, stroke: o.color, strokeWidth: o.width, dash: R(o), clip: f.clip },
    ...c ? [U(c, o.textColor ?? o.color, o.bold, o.italic)] : [],
    // TV line-tool-vertical-line: the anchor sits at 90% of the pane height.
    ...t ? [{ t: "anchors", pts: [{ x: i.x, y: 0.9 * n }], squares: Yt.single }] : []
  ];
}
function ks(e, t, n, o, i) {
  const r = e[0], l = R(i);
  return [
    St({ x: 0, y: r.y }, { x: n, y: r.y }),
    St({ x: r.x, y: 0 }, { x: r.x, y: o }),
    { t: "line", a: { x: 0, y: r.y }, b: { x: n, y: r.y }, stroke: i.color, strokeWidth: i.width, dash: l },
    { t: "line", a: { x: r.x, y: 0 }, b: { x: r.x, y: o }, stroke: i.color, strokeWidth: i.width, dash: l },
    ...t ? [{ t: "anchors", pts: [r] }] : []
  ];
}
function yo(e, t, n, o, i, r, l, s) {
  const [a, c] = t, f = ie("cut", Dn(a, c, r));
  return [
    St(a, c),
    ...f.items,
    { t: "line", a, b: c, stroke: r.color, strokeWidth: r.width, dash: R(r), cap: Vi(r), clip: f.clip },
    ..._n(e, a, c, r, o, i, l, s, f.clip),
    ...n ? [{ t: "anchors", pts: t }] : []
  ];
}
function Te(e, t, n, o, i, r, l, s, a, c) {
  const [f, h] = t, u = h.x - f.x, x = h.y - f.y, d = Math.hypot(u, x) || 1, p = u / d, y = x / d, m = (o + i) * 2, b = l ? { x: f.x - p * m, y: f.y - y * m } : f, g = s ? { x: h.x + p * m, y: h.y + y * m } : h, w = ie("cut", Dn(f, h, r));
  return [
    St(f, h),
    ...w.items,
    { t: "line", a: b, b: g, stroke: r.color, strokeWidth: r.width, dash: R(r), clip: w.clip },
    ..._n(e, f, h, r, o, i, a, c, w.clip),
    ...n ? [{ t: "anchors", pts: t }] : []
  ];
}
function Ls(e, t, n, o) {
  const i = e[0], r = ws(i, n, o), l = ie("cut", Hn(r, o.vertLabelsAlign ?? "top"));
  return [
    St(i, { x: n, y: i.y }),
    ...l.items,
    { t: "line", a: i, b: { x: n, y: i.y }, stroke: o.color, strokeWidth: o.width, dash: R(o), clip: l.clip },
    ...r ? [U(r, o.textColor ?? o.color, o.bold, o.italic)] : [],
    ...t ? [{ t: "anchors", pts: [i] }] : []
  ];
}
function Ss(e, t, n, o, i, r, l, s) {
  if (e.kind !== "info-line") return [];
  const [a, c] = t, f = ie("cut", Dn(a, c, r)), h = Math.hypot(c.x - a.x, c.y - a.y) || 1, u = (o + i) * 2, x = (c.x - a.x) / h, d = (c.y - a.y) / h, p = r.extendLeft ? { x: a.x - x * u, y: a.y - d * u } : a, y = r.extendRight ? { x: c.x + x * u, y: c.y + d * u } : c;
  return [
    St(a, c),
    ...f.items,
    { t: "line", a: p, b: y, stroke: r.color, strokeWidth: r.width, dash: R(r), cap: "round", clip: f.clip },
    ..._n(e, a, c, r, o, i, l, s, f.clip),
    ...n ? [{ t: "anchors", pts: t }] : []
  ];
}
function Cs(e, t, n, o, i, r, l, s) {
  const [a, c] = t, f = c.x - a.x, h = c.y - a.y, u = r.angle ?? Math.atan2(-h, f) * 180 / Math.PI, x = u * Math.PI / 180, d = ps, p = { x: a.x + d * Math.cos(x), y: a.y - d * Math.sin(x) }, y = `M ${a.x} ${a.y} L ${a.x + d} ${a.y} A ${d} ${d} 0 ${Math.abs(x) > Math.PI ? 1 : 0} ${x > 0 ? 0 : 1} ${p.x} ${p.y}`, m = r.fontSize ?? 12, b = Math.hypot(f, h) || 1, g = (o + i) * 2, w = r.extendLeft ? { x: a.x - f / b * g, y: a.y - h / b * g } : a, M = r.extendRight ? { x: c.x + f / b * g, y: c.y + h / b * g } : c;
  return [
    St(a, c),
    { t: "line", a: w, b: M, stroke: r.color, strokeWidth: r.width, dash: R(r), cap: Vi(r) },
    ...r.showMiddlePoint && s ? [{ t: "anchors", pts: [{ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }] }] : [],
    { t: "path", d: y, fill: "none", stroke: r.color, strokeWidth: 1, dash: "1 2", inert: !0 },
    {
      t: "text",
      x: a.x + d + 5 + m / 3,
      y: a.y,
      text: `${Math.round(u * 100) / 100}º`,
      size: m,
      anchor: "start",
      baseline: "central",
      weight: r.bold ? 700 : 400,
      fontStyle: r.italic ? "italic" : "normal",
      fill: r.color,
      inert: !0
    },
    // TV TrendToolWithStatsPaneView: price / bars stats (factory off) at the
    // second point (statsPosition 2), on hover / selection / always.
    ...Ni(a, c, _i(e, a, c, r, l, !1), r.statsPosition ?? 2, s || !!r.showStats, o, i),
    ...n ? [{ t: "anchors", pts: t }] : []
  ];
}
function Ct(e, t) {
  return (e.levels ?? t).filter((n) => n.visible).slice().sort((n, o) => n.coeff - o.coeff);
}
function Z(e) {
  return e.fillBackground === !1 ? 0 : Math.max(0, Math.min(1, (100 - (e.transparency ?? 80)) / 100));
}
function wt(e, t) {
  return e.width ?? t.width;
}
function Mt(e, t) {
  return e.style ? R({ ...t, lineStyle: e.style }) : R(t);
}
function We(e, t, n, o, i) {
  const r = t.x - e.x, l = t.y - e.y, s = Math.hypot(r, l) || 1;
  return {
    l: n ? { x: e.x - r / s * i, y: e.y - l / s * i } : e,
    r: o ? { x: t.x + r / s * i, y: t.y + l / s * i } : t
  };
}
function Ts(e) {
  const [t, n, o] = e, i = n.x - t.x === 0 ? 0 : (o.x - t.x) / (n.x - t.x), r = o.y - (t.y + (n.y - t.y) * i), l = { x: (t.x + n.x) / 2, y: (t.y + n.y) / 2 };
  return {
    anchors: [t, n, { x: t.x, y: t.y + r }, { x: n.x, y: n.y + r }, { x: l.x, y: l.y + r }, l],
    dy: r
  };
}
function As(e) {
  const [t, n, o] = e, i = { x: n.x, y: o.y }, r = { x: t.x, y: o.y + (n.y - t.y) };
  return { anchors: [t, n, i, r], P: i, A: r };
}
function $s(e, t, n, o, i) {
  const r = (i.vertLabelsAlign ?? "bottom") === "middle", l = r ? 0 : o.length > 0 ? o[0].coeff : 0, s = r ? 1 : o.length > 0 ? o[o.length - 1].coeff : 0;
  return { e: { x: e.x, y: e.y + n * l }, t: { x: t.x, y: t.y + n * l }, i: { x: e.x, y: e.y + n * s }, n: { x: t.x, y: t.y + n * s } };
}
function Bs(e, t, n, o, i) {
  const [r, l] = e, { anchors: s, dy: a } = Ts(e), c = (n.levels ?? He).filter((b) => b.visible), f = (o + i) * 2, h = (b) => We({ x: r.x, y: r.y + a * b }, { x: l.x, y: l.y + a * b }, !!n.extendLeft, !!n.extendRight, f), u = Z(n), x = n.backgroundColor ?? n.color, d = $s(r, l, a, c, n), p = Di(d.e, d.t, d.i, d.n, n, void 0, !0), y = p && p.length ? "cut" : void 0, m = [];
  y && m.push({ t: "clip", name: y, polys: [p] }), c.slice(1).forEach((b, g) => {
    const w = h(c[g].coeff), M = h(b.coeff);
    m.push({ t: "polygon", pts: [w.l, w.r, M.r, M.l], fill: x, fillOpacity: u, stroke: "transparent" });
  });
  for (const b of c) {
    const g = h(b.coeff);
    m.push({ t: "hit", a: g.l, b: g.r, width: 12 }), m.push({ t: "line", a: g.l, b: g.r, stroke: b.color, strokeWidth: wt(b, n), dash: Mt(b, n), clip: y });
  }
  return m.push(...Ge(d.e, d.t, d.i, d.n, n)), t && m.push({ t: "anchors", pts: s, squares: Yt.parallelChannel }), m;
}
function po(e, t, n, o, i) {
  const r = (s, a, c) => G({ x: s.x, y: s.y, text: c, fs: i.priceLabelFontSize ?? 12, bold: i.priceLabelBold, italic: i.priceLabelItalic, vert: "middle", horz: s.x > a.x ? "left" : "right", offsetX: 6, padH: 0, padV: 0 }), l = i.priceLabelTextColor ?? i.color;
  return [
    U(r(e, t, n), l, i.priceLabelBold, i.priceLabelItalic),
    U(r(t, e, o), l, i.priceLabelBold, i.priceLabelItalic)
  ];
}
function Ui(e, t, n, o, i, r, l, s, a, c, f) {
  var g, w;
  const h = (a + c) * 2, u = We(t, n, !!s.extendLeft, !!s.extendRight, h), x = We(o, i, !!s.extendLeft, !!s.extendRight, h), d = R(s), p = (s.lineStyle ?? "solid") === "solid" ? "round" : "butt", y = Math.max(0, Math.min(8, Math.round(-Math.log10((f == null ? void 0 : f.pipSize()) ?? 0.01)))), m = (M) => M.toFixed(y), b = [];
  return s.fillBackground !== !1 && b.push({ t: "polygon", pts: [u.l, u.r, x.r, x.l], fill: s.backgroundColor ?? s.color, fillOpacity: Z(s), stroke: "transparent" }), b.push(
    { t: "hit", a: t, b: n, width: 12 },
    { t: "hit", a: o, b: i, width: 12 },
    { t: "line", a: u.l, b: u.r, stroke: s.color, strokeWidth: s.width, dash: d, cap: p },
    { t: "line", a: x.l, b: x.r, stroke: s.color, strokeWidth: s.width, dash: d, cap: p }
  ), s.leftEnd === 1 && b.push(...Bt(n, t, s), ...Bt(i, o, s)), s.rightEnd === 1 && b.push(...Bt(t, n, s), ...Bt(o, i, s)), s.showPrices && (b.push(...po(t, n, m(((g = e.points[0]) == null ? void 0 : g.price) ?? 0), m(((w = e.points[1]) == null ? void 0 : w.price) ?? 0), s)), b.push(...po(i, o, m(r), m(l), s))), b;
}
function Is(e, t, n, o, i, r, l) {
  var x, d;
  const [s, a] = t, { anchors: c, P: f, A: h } = As(t), u = ((x = e.points[2]) == null ? void 0 : x.price) ?? e.points[0].price;
  return [
    ...Ui(e, s, a, h, f, u, u + ((((d = e.points[1]) == null ? void 0 : d.price) ?? 0) - e.points[0].price), o, i, r, l),
    ...Ge(s, a, h, f, o),
    ...n ? [{ t: "anchors", pts: c, squares: Yt.disjointChannel }] : []
  ];
}
function Ps(e, t, n, o, i, r, l) {
  var x;
  const [s, a, c] = t, f = { x: s.x, y: c.y }, h = { x: a.x, y: c.y }, u = ((x = e.points[2]) == null ? void 0 : x.price) ?? e.points[0].price;
  return [
    ...Ui(e, s, a, f, h, u, u, o, i, r, l),
    ...Ge(s, a, f, h, o),
    ...n ? [{ t: "anchors", pts: t }] : []
  ];
}
function Nn(e, t) {
  return t ? `${(100 * e).toFixed(2)}%` : String(Math.round(e * 1e4) / 1e4);
}
function Re(e) {
  if (!e.text) return null;
  let t, n;
  return e.horz === "left" ? (t = e.extendLeft ? 0 : e.left, n = e.extendLeft ? "left" : "right") : e.horz === "right" ? (t = e.extendRight ? e.paneW : e.right, n = e.extendRight ? "right" : "left") : (t = ((e.extendLeft ? 0 : e.left) + (e.extendRight ? e.paneW : e.right)) / 2, n = "center"), G({ x: t, y: e.y, text: e.text, fs: e.fs, vert: e.vert, horz: n, offsetX: 4 });
}
function It(e) {
  return e.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") || "0";
}
const lt = (e, t) => e ? [{ t: "anchors", pts: t }] : [], Yn = (e) => Math.max(0, Math.min(8, Math.round(-Math.log10((e == null ? void 0 : e.pipSize()) ?? 0.01))));
function Vn(e, t) {
  const n = t.filter((o) => !!o && o.length > 0);
  return n.length ? { items: [{ t: "clip", name: e, polys: n }], clip: e } : { items: [], clip: void 0 };
}
function Nt(e, t, n, o = !1) {
  const i = n.fibTrendLine ?? (o ? wr : gr);
  return i.visible ? [{ t: "line", a: e, b: t, stroke: i.color, strokeWidth: i.width, dash: R({ ...n, lineStyle: i.style }), cap: i.style === "solid" ? "round" : "butt", inert: !0 }] : [];
}
function Xi(e, t, n, o, i, r, l, s, a) {
  const c = { y: n, left: o, right: i, extendLeft: !!s.extendLeft, extendRight: !!s.extendRight, paneW: a, fs: s.labelFontSize ?? 12 }, f = s.showCoeffs !== !1, h = s.showPrices !== !1;
  let u = "";
  f && (u += Nn(t.coeff, !!s.fibLevelsAsPercents)), h && (u += ` (${r.toFixed(l)})`);
  const x = Re({ ...c, text: u, horz: s.horzLabelsAlign ?? "left", vert: s.vertLabelsAlign ?? "middle" }), d = s.showText !== !1 && t.text ? Re({ ...c, text: t.text, horz: s.horzTextAlign ?? "center", vert: s.vertTextAlign ?? "middle" }) : null, p = Vn(e, [(x == null ? void 0 : x.poly) ?? null, d == null ? void 0 : d.poly]);
  return [
    { t: "hit", a: { x: o, y: n }, b: { x: i, y: n }, width: 10 },
    ...p.items,
    { t: "line", a: { x: o, y: n }, b: { x: i, y: n }, stroke: t.color, strokeWidth: wt(t, s), dash: Mt(t, s), clip: p.clip },
    ...x ? [U(x, t.color)] : [],
    ...d ? [U(d, t.color)] : []
  ];
}
function Gi(e, t, n, o, i) {
  return i > 0 ? e.slice(1).map((r, l) => {
    const s = t(e[l].coeff), a = t(r.coeff);
    return { t: "rect", x: n, y: Math.min(s, a), w: Math.max(1, o - n), h: Math.abs(a - s), fill: r.color, fillOpacity: i, stroke: "none", inert: !0 };
  }) : [];
}
function xf(e, t, n, o, i) {
  const r = e.style;
  let l = null, s = 0, a = 0;
  if (e.kind === "fib-retracement" && t.length >= 2) {
    const [p, y] = t, m = e.points[0].price, b = e.points[1].price;
    s = r.extendLeft ? 0 : Math.min(p.x, y.x), a = r.extendRight ? o : Math.max(p.x, y.x);
    const g = !!r.fibLevelsBasedOnLogScale && !!(i != null && i.isLog()) && m > 0 && b > 0, w = (v) => {
      const k = r.reverse ? m : b, S = r.reverse ? b : m;
      return g ? Math.exp(Math.log(k) + v * (Math.log(S) - Math.log(k))) : k + v * (S - k);
    }, M = (v) => r.reverse ? p.y + (y.y - p.y) * v : y.y + (p.y - y.y) * v;
    l = (v) => g ? M(v) : (i == null ? void 0 : i.priceToY(w(v))) ?? M(v);
  } else if (e.kind === "trend-based-fib-extension" && t.length >= 3 && e.points.length >= 3) {
    const [, p, y] = t, m = e.points[0].price, b = e.points[1].price, g = e.points[2].price, w = r.reverse ? m - b : b - m, M = r.reverse ? t[0].y - t[1].y : t[1].y - t[0].y;
    s = r.extendLeft ? 0 : Math.min(p.x, y.x), a = r.extendRight ? o : Math.max(p.x, y.x);
    const v = !!r.fibLevelsBasedOnLogScale && !!(i != null && i.isLog()) && m > 0 && b > 0 && g > 0, k = (C) => {
      if (!v) return g + w * C;
      const I = r.reverse ? Math.log(m) - Math.log(b) : Math.log(b) - Math.log(m);
      return Math.exp(Math.log(g) + C * I);
    }, S = (C) => y.y + M * C;
    l = (C) => v ? S(C) : (i == null ? void 0 : i.priceToY(k(C))) ?? S(C);
  }
  if (!l || n.x < s - L || n.x > a + L) return null;
  const c = r.levels ?? Pt;
  let f = null;
  if (c.forEach((p, y) => {
    if (!p.visible) return;
    const m = l(p.coeff), b = Math.abs(n.y - m);
    b <= 6 && (!f || b < f.dist) && (f = { index: y, y: m, dist: b });
  }), !f) return null;
  const { index: h, y: u } = f, x = r.horzTextAlign ?? "center", d = x === "left" ? s : x === "right" ? a : (s + a) / 2;
  return { index: h, y: u, left: s, right: a, textX: d };
}
function Es(e, t, n, o, i, r) {
  if (e.kind !== "fib-retracement") return [];
  const [l, s] = t, a = e.points[0].price, c = e.points[1].price, f = i.extendLeft ? 0 : Math.min(l.x, s.x), h = i.extendRight ? o : Math.max(l.x, s.x), u = Ct(i, Pt), x = !!i.fibLevelsBasedOnLogScale && !!(r != null && r.isLog()) && a > 0 && c > 0, d = (b) => {
    const g = i.reverse ? a : c, w = i.reverse ? c : a;
    return x ? Math.exp(Math.log(g) + b * (Math.log(w) - Math.log(g))) : g + b * (w - g);
  }, p = (b) => i.reverse ? l.y + (s.y - l.y) * b : s.y + (l.y - s.y) * b, y = (b) => x ? p(b) : (r == null ? void 0 : r.priceToY(d(b))) ?? p(b), m = Yn(r);
  return [
    ...Gi(u, y, f, h, Z(i)),
    ...u.flatMap((b, g) => Xi(`l${g}`, b, y(b.coeff), f, h, d(b.coeff), m, i, o)),
    // TV draws the trend line after the levels, before the labels.
    ...Nt(l, s, i),
    ...lt(n, t)
  ];
}
function zs(e, t, n, o, i, r) {
  if (e.kind !== "trend-based-fib-extension") return [];
  const [, l, s] = t, a = e.points[0].price, c = e.points[1].price, f = e.points[2].price, h = i.reverse ? a - c : c - a, u = i.reverse ? t[0].y - t[1].y : t[1].y - t[0].y, x = Ct(i, Pt), d = i.extendLeft ? 0 : Math.min(l.x, s.x), p = i.extendRight ? o : Math.max(l.x, s.x), y = !!i.fibLevelsBasedOnLogScale && !!(r != null && r.isLog()) && a > 0 && c > 0 && f > 0, m = (M) => {
    if (!y) return f + h * M;
    const v = i.reverse ? Math.log(a) - Math.log(c) : Math.log(c) - Math.log(a);
    return Math.exp(Math.log(f) + M * v);
  }, b = (M) => s.y + u * M, g = (M) => y ? b(M) : (r == null ? void 0 : r.priceToY(m(M))) ?? b(M), w = Yn(r);
  return [
    ...Gi(x, g, d, p, Z(i)),
    ...x.flatMap((M, v) => Xi(`l${v}`, M, g(M.coeff), d, p, m(M.coeff), w, i, o)),
    // TV trend line: the measured move and the projection leg.
    ...Nt(t[0], t[1], i),
    ...Nt(t[1], t[2], i),
    ...lt(n, t)
  ];
}
function Ws(e, t, n, o, i, r, l) {
  if (e.kind !== "fib-channel") return [];
  const [s, a, c] = t, f = c.x - s.x, h = c.y - s.y, u = (r + l) * 2, x = (M) => ({ l: { x: s.x + f * M, y: s.y + h * M }, r: { x: a.x + f * M, y: a.y + h * M } }), d = (M) => {
    const v = x(M);
    return We(v.l, v.r, !!o.extendLeft, !!o.extendRight, u);
  }, p = Ct(o, Pt), y = Z(o), m = Yn(i), b = (M, v) => (i == null ? void 0 : i.yToPrice(v)) ?? e.points[0].price + (e.points[2].price - e.points[0].price) * M, g = (M, v) => {
    const k = o.showCoeffs !== !1, S = o.showPrices !== !1;
    if (!k && !S) return null;
    let C = "";
    k && (C += o.fibLevelsAsPercents ? `${(100 * M.coeff).toFixed(2)}%` : It(M.coeff)), S && (C += ` (${b(M.coeff, v.l.y).toFixed(m)})`);
    const I = o.horzLabelsAlign ?? "left", A = I === "left" ? v.l : I === "right" ? v.r : { x: (v.l.x + v.r.x) / 2, y: (v.l.y + v.r.y) / 2 };
    return G({ x: A.x, y: A.y, text: C, fs: o.labelFontSize ?? 12, vert: o.vertLabelsAlign ?? "middle", horz: I === "left" ? "right" : I === "right" ? "left" : "center", offsetX: 4 });
  }, w = [];
  return y > 0 && p.slice(1).forEach((M, v) => {
    const k = d(p[v].coeff), S = d(M.coeff);
    w.push({ t: "polygon", pts: [k.l, k.r, S.r, S.l], fill: p[v].color, fillOpacity: y, stroke: "none", inert: !0 });
  }), p.forEach((M, v) => {
    const k = x(M.coeff), S = d(M.coeff), C = g(M, k), I = Vn(`l${v}`, [C ? C.poly : null]);
    w.push({ t: "hit", a: k.l, b: k.r, width: 12 }, ...I.items), w.push({ t: "line", a: S.l, b: S.r, stroke: M.color, strokeWidth: wt(M, o), dash: Mt(M, o), clip: I.clip }), C && w.push(U(C, M.color));
  }), w.push(...lt(n, t)), w;
}
function ji(e, t, n, o, i, r, l) {
  const s = Vn(e, [l]);
  return [
    { t: "hit", a: { x: n, y: 0 }, b: { x: n, y: o }, width: 8 },
    ...s.items,
    { t: "line", a: { x: n, y: 0 }, b: { x: n, y: o }, stroke: t.color, strokeWidth: wt(t, i), dash: Mt(t, i), clip: s.clip },
    ...r ? [U(r, t.color)] : []
  ];
}
function Rs(e, t, n, o, i, r) {
  const [l, s, a] = t, c = i.fibTrendLine ?? Cn, f = R({ ...i, lineStyle: c.style, width: c.width }), h = Go(e, t, r, Ct(i, Sn)), u = Z(i), x = i.vertLabelsAlign ?? "bottom", d = i.horzLabelsAlign ?? "right", p = d === "left" ? "right" : d === "right" ? "left" : "center", y = (b, g) => i.showLabels === !1 ? null : G({ x: b, y: x === "top" ? 0 : x === "middle" ? 0.5 * o : o, text: String(g), fs: 12, vert: x, horz: p, offsetX: 2 }), m = [];
  return c.visible && (m.push({ t: "line", a: l, b: s, stroke: c.color, strokeWidth: c.width, dash: f }), a && m.push({ t: "line", a: s, b: a, stroke: c.color, strokeWidth: c.width, dash: f })), u > 0 && h.slice(1).forEach((b, g) => {
    const w = h[g].x;
    m.push({ t: "rect", x: Math.min(w, b.x), y: 0, w: Math.max(1, Math.abs(b.x - w)), h: o, fill: b.color, fillOpacity: u, stroke: "none", inert: !0 });
  }), h.forEach((b, g) => {
    const w = y(b.x, b.coeff);
    m.push(...ji(`l${g}`, b, b.x, o, i, w, w && d === "center" ? w.poly : null));
  }), m.push(...lt(n, t)), m;
}
function Fs(e, t, n, o) {
  const [i, r] = e, l = o.vertLabelsAlign ?? "bottom", s = o.horzLabelsAlign ?? "right", a = s === "left" ? "right" : s === "right" ? "left" : "center", c = (d, p) => o.showLabels === !1 ? null : G({ x: d, y: l === "top" ? 0 : l === "middle" ? 0.5 * n : n, text: String(p), fs: 12, vert: l, horz: a, offsetX: 2 }), f = r.x - i.x, h = Ct(o, Tn), u = Z(o), x = [{ t: "line", a: i, b: r, stroke: "#808080", strokeWidth: 1, dash: "6 4" }];
  return u > 0 && h.slice(1).forEach((d, p) => {
    const y = i.x + f * h[p].coeff, m = i.x + f * d.coeff;
    x.push({ t: "rect", x: Math.min(y, m), y: 0, w: Math.max(1, Math.abs(m - y)), h: n, fill: d.color, fillOpacity: u, stroke: "none", inert: !0 });
  }), h.forEach((d, p) => {
    const y = i.x + f * d.coeff, m = c(y, d.coeff);
    x.push(...ji(`l${p}`, d, y, n, o, m, m && l === "middle" && we(m.lines) ? m.poly : null));
  }), x.push(...lt(t, e)), x;
}
const Os = [0.236, 0.382, 0.5, 0.618, 1];
function Ds(e, t, n, o) {
  const [i, r] = t;
  if (e.fmt !== 2) {
    const d = Math.hypot(r.x - i.x, r.y - i.y), p = R(o);
    return [
      ...Os.map((y) => ({ t: "circle", cx: i.x, cy: i.y, r: d * y, fill: "none", stroke: o.color, strokeWidth: o.width, dash: p, strokeOpacity: y === 1 ? 1 : 0.55 })),
      { t: "line", a: i, b: r, stroke: o.color, strokeWidth: 1, strokeOpacity: 0.4, dash: "2 3" },
      ...lt(n, t)
    ];
  }
  const l = (i.x + r.x) / 2, s = (i.y + r.y) / 2, a = Math.abs(r.x - i.x) / 2, c = Math.abs(r.y - i.y) / 2, f = (o.levels ?? Bn).filter((d) => d.visible), h = Z(o), u = (d) => `M ${l - a * d} ${s} a ${a * d} ${c * d} 0 1 0 ${2 * a * d} 0 a ${a * d} ${c * d} 0 1 0 ${-2 * a * d} 0 Z`, x = [];
  h > 0 && f.forEach((d, p) => x.push({ t: "path", d: u(d.coeff) + (p > 0 ? " " + u(f[p - 1].coeff) : ""), fill: d.color, fillOpacity: h, fillRule: "evenodd", stroke: "none", inert: !0 }));
  for (const d of f) {
    const p = o.showCoeffs !== !1 ? Re({ text: Nn(d.coeff, !!o.fibLevelsAsPercents), y: s + c * d.coeff, left: l, right: l, extendLeft: !1, extendRight: !1, paneW: 0, horz: "left", vert: "middle", fs: 12 }) : null;
    x.push({ t: "ellipse", cx: l, cy: s, rx: a * d.coeff, ry: c * d.coeff, fill: "none", stroke: d.color, strokeWidth: wt(d, o), dash: Mt(d, o) }), p && x.push(U(p, d.color));
  }
  return x.push(...Nt(i, r, o), ...lt(n, t)), x;
}
function _s(e, t, n, o, i, r, l) {
  const [s, a] = t, c = li(e, t, l, Pe), f = R(r), h = Z(r), u = c.h.map((k) => ({ color: k.color, far: an(s, { x: a.x, y: k.y }, o, i) })), x = c.v.map((k) => ({ color: k.color, far: an(s, { x: k.x, y: a.y }, o, i) })), d = (k) => k.slice(1).map((S, C) => ({ color: S.color, pts: [s, S.far, k[C].far] })), { left: p, top: y, right: m, bottom: b } = c.box, g = r.fanGrid ?? Oo, w = R({ ...r, lineStyle: g.style, width: g.width }), M = (k, S, C, I, A, z, O) => G({ x: k, y: S, text: It(C), fs: 12, vert: I, horz: A, offsetX: z, offsetY: O }), v = [];
  if (h > 0)
    for (const k of [...d(u), ...d(x)]) v.push({ t: "polygon", pts: k.pts, fill: k.color, fillOpacity: h, stroke: "none", inert: !0 });
  for (const k of c.h)
    g.visible && v.push({ t: "line", a: { x: p, y: k.y }, b: { x: m, y: k.y }, stroke: g.color, strokeWidth: g.width, dash: w, inert: !0 }), r.showLeftLabels !== !1 && v.push(U(M(p, k.y, k.coeff, "middle", "right", 5, 0), k.color)), r.showRightLabels !== !1 && v.push(U(M(m, k.y, k.coeff, "middle", "left", 5, 0), k.color));
  for (const k of c.v)
    g.visible && v.push({ t: "line", a: { x: k.x, y }, b: { x: k.x, y: b }, stroke: g.color, strokeWidth: g.width, dash: w, inert: !0 }), r.showTopLabels !== !1 && v.push(U(M(k.x, y, k.coeff, "bottom", "center", 0, 5), k.color)), r.showBottomLabels !== !1 && v.push(U(M(k.x, b, k.coeff, "top", "center", 0, 5), k.color));
  for (const k of [...u, ...x])
    v.push({ t: "hit", a: s, b: k.far, width: L * 2 }), v.push({ t: "line", a: s, b: k.far, stroke: k.color, strokeWidth: r.width, dash: f, cap: "round" });
  return v.push(...lt(n, t)), v;
}
function Hs(e, t, n) {
  const [o, i] = e, r = Math.hypot(i.x - o.x, i.y - o.y), l = i.y >= o.y ? 1 : -1, s = R(n), a = Ct(n, $n), c = Z(n), f = !!n.fullCircles, h = (x) => f ? `M ${o.x - x} ${o.y} A ${x} ${x} 0 1 0 ${o.x + x} ${o.y} A ${x} ${x} 0 1 0 ${o.x - x} ${o.y}` : `M ${o.x - x} ${o.y} A ${x} ${x} 0 0 ${l > 0 ? 0 : 1} ${o.x + x} ${o.y}`, u = [];
  if (r >= 1e-6) {
    c > 0 && a.slice(1).forEach((x, d) => {
      const p = r * a[d].coeff, y = r * x.coeff, m = f ? `${h(y)} Z ${h(p)} Z` : `M ${o.x - y} ${o.y} A ${y} ${y} 0 0 ${l > 0 ? 0 : 1} ${o.x + y} ${o.y} L ${o.x + p} ${o.y} A ${p} ${p} 0 0 ${l > 0 ? 1 : 0} ${o.x - p} ${o.y} Z`;
      u.push({ t: "path", d: m, fill: x.color, fillOpacity: c, fillRule: "evenodd", stroke: "none", inert: !0 });
    });
    for (const x of a) {
      const d = r * x.coeff;
      if (u.push({ t: "hitPath", d: h(d), width: L * 2 }), u.push({ t: "path", d: h(d), fill: "none", stroke: x.color, strokeWidth: wt(x, n), dash: Mt(x, n) ?? s }), n.showCoeffs !== !1) {
        const p = Re({ text: Nn(x.coeff, !1), y: o.y + l * d, left: o.x, right: o.x, extendLeft: !1, extendRight: !1, paneW: 0, horz: "left", vert: "middle", fs: 12 });
        p && u.push(U(p, x.color));
      }
    }
    u.push(...Nt(o, i, n));
  }
  return u.push(...lt(t, e)), u;
}
function Ns(e, t, n, o, i) {
  const [r, l] = e, s = Ei(r, l, !!i.counterclockwise), a = R(i), c = l.x - r.x, f = l.y - r.y, h = Math.hypot(c, f) || 1, u = (n + o) * 2, x = { x: l.x + c / h * u, y: l.y + f / h * u };
  return [
    ...s.length >= 2 ? [
      { t: "line", a: r, b: x, stroke: i.color, strokeWidth: i.width, dash: a },
      { t: "polyline", pts: s, fill: "none", stroke: i.color, strokeWidth: i.width, dash: a, join: "round", cap: "round" }
    ] : [],
    ...lt(t, e)
  ];
}
function Ys(e, t, n) {
  const [o, i, r] = e, l = Math.hypot(i.x - o.x, i.y - o.y);
  if (l < 1e-6) return lt(t, e);
  const s = Math.atan2(i.y - o.y, i.x - o.x), a = Math.atan2(r.y - o.y, r.x - o.x), c = { x: o.x + Math.cos(a) * l, y: o.y + Math.sin(a) * l };
  let f = a - s;
  for (; f > Math.PI; ) f -= 2 * Math.PI;
  for (; f < -Math.PI; ) f += 2 * Math.PI;
  const h = R(n), u = Ct(n, Ln), x = Z(n), d = 24, p = (m) => {
    const b = [];
    for (let g = 0; g <= d; g++) {
      const w = s + f * g / d;
      b.push({ x: o.x + Math.cos(w) * m, y: o.y + Math.sin(w) * m });
    }
    return b;
  }, y = [
    { t: "hit", a: o, b: i, width: 12 },
    { t: "hit", a: o, b: c, width: 12 }
  ];
  x > 0 && u.slice(1).forEach((m, b) => {
    const g = p(l * m.coeff), w = p(l * u[b].coeff).reverse();
    y.push({ t: "polygon", pts: [...g, ...w], fill: m.color, fillOpacity: x, stroke: "none", inert: !0 });
  }), y.push(...Nt(o, i, n, !0), ...Nt(o, c, n, !0));
  for (const m of u) {
    const b = l * m.coeff, g = s + f / 2;
    y.push({ t: "polyline", pts: p(b), fill: "none", stroke: m.color, strokeWidth: wt(m, n), dash: Mt(m, n) ?? h }), n.showCoeffs !== !1 && y.push({ t: "text", x: o.x + Math.cos(g) * (b + 8), y: o.y + Math.sin(g) * (b + 8), text: It(m.coeff), size: 11, fill: m.color, anchor: "middle", inert: !0 });
  }
  return y.push(...lt(t, e)), y;
}
function Vs(e, t, n, o) {
  const [i, r, l] = e, s = { x: (r.x + l.x) / 2, y: (r.y + l.y) / 2 }, a = { x: (l.x - r.x) / 2, y: (l.y - r.y) / 2 }, c = R(o), f = Ct(o, kt), h = Z(o), u = n * 4, x = (y) => {
    const m = y.x - i.x, b = y.y - i.y, g = Math.hypot(m, b) || 1;
    return { x: i.x + m / g * u, y: i.y + b / g * u };
  }, d = [
    ...f.slice().reverse().map((y) => ({ t: { x: s.x - a.x * y.coeff, y: s.y - a.y * y.coeff }, color: y.color, lvl: y })),
    { t: s, color: o.color },
    ...f.map((y) => ({ t: { x: s.x + a.x * y.coeff, y: s.y + a.y * y.coeff }, color: y.color, lvl: y }))
  ], p = [{ t: "line", a: r, b: l, stroke: o.color, strokeWidth: o.width, dash: c }];
  for (const y of d) p.push({ t: "hit", a: i, b: x(y.t), width: L * 2 });
  h > 0 && d.slice(1).forEach((y, m) => p.push({ t: "polygon", pts: [i, x(d[m].t), x(y.t)], fill: y.color, fillOpacity: h, stroke: "none", inert: !0 }));
  for (const y of d)
    p.push({ t: "line", a: i, b: x(y.t), stroke: y.color, strokeWidth: y.lvl ? wt(y.lvl, o) : o.width, dash: y.lvl ? Mt(y.lvl, o) : c });
  return p.push(...lt(t, e)), p;
}
const me = (e, t) => e ? [{ t: "anchors", pts: t }] : [];
function Us(e, t, n, o, i) {
  var b;
  const r = Yo(e, t);
  if (!r) return me(n, t);
  const l = o.gannLevels ?? on, s = Er(r, l), a = zr(r, o.gannFans ?? rn), c = Wr(r, o.gannArcs ?? ln), f = Vo(r), h = o.fillBackground === !1 ? 0 : Math.max(0, Math.min(1, (100 - (o.transparency ?? 80)) / 100)), u = (() => {
    if (e.kind !== "gann-square" || o.showLabels === !1 || !i) return [];
    const [g, w] = e.points, M = i.timeToBarIndex(g.time), v = i.timeToBarIndex(w.time);
    if (M == null || v == null) return [];
    const k = o.reverse ? -1 : 1, S = (w.price - g.price) * k, C = (v - M) * k, I = Math.max(0, Math.min(8, Math.round(-Math.log10(i.pipSize())))), A = o.labelFontSize ?? 12, z = (T, E, P, B, F, V) => G({ x: T, y: E, text: P, fs: A, bold: o.bold, italic: o.italic, horz: B, vert: F, offsetX: 10, offsetY: V }), O = [
      z(r.start.x, r.end.y, mt(S, I), C > 0 ? "right" : "left", S > 0 ? "bottom" : "top", S > 0 ? 8 : 10),
      z(r.end.x, r.start.y, String(C), C > 0 ? "left" : "right", S > 0 ? "top" : "bottom", S > 0 ? 10 : 8)
    ];
    return C !== 0 && O.push(z(r.end.x, r.end.y, String(Number(Math.abs(S / C).toFixed(7))), C > 0 ? "left" : "right", S > 0 ? "bottom" : "top", S > 0 ? 8 : 10)), O;
  })(), x = ((b = l[l.length - 1]) == null ? void 0 : b.color) ?? "#808080", d = f.right - f.left, p = f.bottom - f.top, y = [
    { t: "clipRect", name: "box", x: f.left, y: f.top, w: d, h: p, idPrefix: "gann-clip-" },
    { t: "rect", x: f.left, y: f.top, w: d, h: p, fill: "transparent" }
  ];
  for (const g of s)
    y.push({ t: "line", a: { x: g.x, y: r.start.y }, b: { x: g.x, y: r.end.y }, stroke: g.color, strokeWidth: g.width, inert: !0 }), y.push({ t: "line", a: { x: r.start.x, y: g.y }, b: { x: r.end.x, y: g.y }, stroke: g.color, strokeWidth: g.width, inert: !0 });
  for (const g of a) y.push({ t: "line", a: g.from, b: g.to, stroke: g.color, strokeWidth: g.width, cap: "round", inert: !0 });
  const m = [];
  for (const g of c) {
    const w = Rr(r, g.r, g.prev);
    h > 0 && m.push({ t: "path", d: w.fill, fill: g.color, fillOpacity: h, stroke: "none" }), m.push({ t: "path", d: w.stroke, fill: "none", stroke: g.color, strokeWidth: g.width });
  }
  y.push({ t: "group", clip: "box", inert: !0, items: m });
  for (const g of u) y.push(U(g, x, o.bold, o.italic));
  return y.push(...me(n, t)), y;
}
function Xs(e, t, n, o, i) {
  const [r, l] = e, s = (n + o) * 2, a = l.x - r.x, c = l.y - r.y, f = (i.levels ?? kn).map((m, b) => ({ ...m, index: b + 1 })).filter((m) => m.visible), h = Z(i), u = (m) => m > 1 ? { x: l.x, y: r.y + c / m } : { x: r.x + a * m, y: l.y }, x = (m) => {
    const b = Uo(r, l, m), g = Math.hypot(b.x, b.y) || 1;
    return { x: r.x + b.x / g * s, y: r.y + b.y / g * s };
  }, d = [];
  f.forEach((m, b) => {
    m.index < 4 && b < f.length - 1 ? d.push({ from: m.coeff, to: f[b + 1].coeff, color: m.color }) : m.index > 4 && b > 0 && d.push({ from: m.coeff, to: f[b - 1].coeff, color: m.color });
  });
  const p = 12 / 3, y = [{ t: "hit", a: r, b: l, width: 12 }];
  for (const m of f) y.push({ t: "hit", a: r, b: x(m.coeff), width: L * 2 });
  if (h > 0) for (const m of d) y.push({ t: "polygon", pts: [r, x(m.from), x(m.to)], fill: m.color, fillOpacity: h, stroke: "none", inert: !0 });
  for (const m of f) {
    const b = x(m.coeff), g = u(m.coeff);
    y.push({ t: "line", a: r, b, stroke: m.color, strokeWidth: wt(m, i), dash: Mt(m, i) }), i.showLabels !== !1 && y.push({ t: "text", x: g.x + p, y: g.y, text: m.label ?? It(m.coeff), size: 12, fill: m.color, anchor: "start", baseline: "central", inert: !0 });
  }
  return y.push(...me(t, e)), y;
}
function Gs(e, t, n, o, i) {
  const [r, l] = t, s = Math.min(r.x, l.x), a = Math.max(r.x, l.x), c = Math.min(r.y, l.y), f = Math.max(r.y, l.y), h = bt(r, l), u = o.levels ?? Ee, x = o.vLevels ?? Ee, d = R(o), [p, y] = e.points, m = !!o.reverse, b = (T) => {
    const E = m ? y.price : p.price, P = m ? p.price - y.price : y.price - p.price;
    return (i == null ? void 0 : i.priceToY(E + T * P)) ?? (m ? l.y + T * (r.y - l.y) : r.y + T * (l.y - r.y));
  }, g = (i == null ? void 0 : i.timeToBarIndex(p.time)) ?? null, w = (i == null ? void 0 : i.timeToBarIndex(y.time)) ?? null, M = (T) => {
    if (i && g != null && w != null) {
      const E = m ? w : g, P = m ? g - w : w - g, B = i.barIndexToTime(Math.round(E + T * P)), F = B != null ? i.timeToX(B) : null;
      if (F != null) return F;
    }
    return m ? l.x + T * (r.x - l.x) : r.x + T * (l.x - r.x);
  }, v = u.filter((T) => T.visible).map((T) => ({ ...T, y: b(T.coeff) })), k = x.filter((T) => T.visible).map((T) => ({ ...T, x: M(T.coeff) })), S = o.fillBackground !== !1 ? Math.max(0, Math.min(1, (100 - (o.transparency ?? 80)) / 100)) : 0, C = o.fillVertBackground !== !1 ? Math.max(0, Math.min(1, (100 - (o.vertTransparency ?? 80)) / 100)) : 0, I = o.fans ?? { visible: !1, color: "#9C9C9C" }, A = [];
  if (I.visible)
    for (let T = 0; T < u.length; T++) {
      const E = M(u[T].coeff);
      A.push([{ x: s, y: f }, { x: E, y: c }], [{ x: a, y: f }, { x: E, y: c }], [{ x: s, y: c }, { x: E, y: f }], [{ x: a, y: c }, { x: E, y: f }]);
      const P = x[T];
      if (!P) continue;
      const B = b(P.coeff);
      A.push([{ x: s, y: f }, { x: a, y: B }], [{ x: a, y: f }, { x: s, y: B }], [{ x: s, y: c }, { x: a, y: B }], [{ x: a, y: c }, { x: s, y: B }]);
    }
  const z = (T, E, P, B, F, V, K, xt) => U(G({ x: T, y: E, text: P, fs: 12, horz: F, vert: V, offsetX: K, offsetY: xt }), B), O = [{ t: "rect", x: s, y: c, w: Math.max(1, a - s), h: Math.max(1, f - c), fill: "transparent" }];
  v.forEach((T, E) => {
    E > 0 && S > 0 && O.push({ t: "rect", x: s, y: Math.min(T.y, v[E - 1].y), w: a - s, h: Math.abs(T.y - v[E - 1].y), fill: T.color, fillOpacity: S, inert: !0 }), O.push({ t: "line", a: { x: s, y: T.y }, b: { x: a, y: T.y }, stroke: T.color, strokeWidth: o.width, dash: d }), o.showLeftLabels !== !1 && O.push(z(s, T.y, It(T.coeff), T.color, "right", "middle", 5, 0)), o.showRightLabels !== !1 && O.push(z(a, T.y, It(T.coeff), T.color, "left", "middle", 5, 0));
  }), k.forEach((T, E) => {
    E > 0 && C > 0 && O.push({ t: "rect", x: Math.min(T.x, k[E - 1].x), y: c, w: Math.abs(T.x - k[E - 1].x), h: f - c, fill: T.color, fillOpacity: C, inert: !0 }), O.push({ t: "line", a: { x: T.x, y: c }, b: { x: T.x, y: f }, stroke: T.color, strokeWidth: o.width, dash: d }), o.showTopLabels !== !1 && O.push(z(T.x, c, It(T.coeff), T.color, "center", "bottom", 0, 3)), o.showBottomLabels !== !1 && O.push(z(T.x, f, It(T.coeff), T.color, "center", "top", 0, 5));
  });
  for (const [T, E] of A) O.push({ t: "line", a: T, b: E, stroke: I.color, strokeWidth: o.width, dash: d, inert: !0 });
  return O.push(...me(n, h)), O;
}
function js(e, t, n, o, i) {
  const r = Xo(e, t);
  if (!r) return [];
  const l = Zt(r.pivot, r.dir, o), s = Math.hypot(r.dir.x, r.dir.y) || 1, a = (m) => i.extendLines ? { x: m.x - r.dir.x / s * o * 4, y: m.y - r.dir.y / s * o * 4 } : m, c = R(i), f = Ct(i, kt), h = Z(i), u = (m, b) => ({ x: r.mid.x + r.half.x * m * b, y: r.mid.y + r.half.y * m * b }), x = [];
  let d = 0;
  for (const m of f)
    x.push({ from: d, to: m.coeff, color: m.color }), d = m.coeff;
  const p = [1, -1], y = [{ t: "hit", a: r.pivot, b: l, width: L * 2 }];
  for (const m of p) for (const b of f) {
    const g = u(b.coeff, m);
    y.push({ t: "hit", a: g, b: Zt(g, r.dir, o), width: L * 2 });
  }
  if (h > 0)
    for (const m of p) for (const b of x) {
      const g = u(b.from, m), w = u(b.to, m);
      y.push({ t: "polygon", pts: [a(g), Zt(g, r.dir, o), Zt(w, r.dir, o), a(w)], fill: b.color, fillOpacity: h, stroke: "none", inert: !0 });
    }
  y.push({ t: "line", a: t[1], b: t[2], stroke: i.color, strokeWidth: i.width, dash: c, cap: "round" }), y.push({ t: "line", a: a(r.pivot), b: l, stroke: i.color, strokeWidth: i.width, dash: c, cap: "round" });
  for (const m of p) for (const b of f)
    y.push({ t: "line", a: a(u(b.coeff, m)), b: Zt(u(b.coeff, m), r.dir, o), stroke: b.color, strokeWidth: wt(b, i), dash: Mt(b, i), cap: "round" });
  return y.push(...me(n, t)), y;
}
const qs = 0.06;
function qe(e, t) {
  const n = be(e);
  return t && n.fillOpacity > 0 ? { fill: n.fill, fillOpacity: Math.min(1, n.fillOpacity + qs) } : n;
}
function qi(e, t, n, o) {
  return e.text ? [{
    t: "text",
    x: t,
    y: n,
    text: e.text,
    size: o.fontSize ?? 14,
    fill: o.textColor ?? o.color,
    anchor: "middle",
    baseline: "middle",
    weight: o.bold ? 700 : 400,
    fontStyle: o.italic ? "italic" : "normal",
    inert: !0
  }] : [];
}
function Zs(e, t) {
  if (e.length < 2) return [];
  const n = [];
  return t.leftEnd === 1 && n.push(...Bt(e[1], e[0], t)), t.rightEnd === 1 && n.push(...Bt(e[e.length - 2], e[e.length - 1], t)), n;
}
const yn = (e) => e.map((t, n) => `${n === 0 ? "M" : "L"} ${t.x} ${t.y}`).join(" "), at = (e, t, n) => e ? [n ? { t: "anchors", pts: t, squares: n } : { t: "anchors", pts: t }] : [];
function Ks(e, t, n, o, i, r) {
  const [l, s] = t, a = i.extendLeft ? -i.width : Math.min(l.x, s.x), c = i.extendRight ? o + i.width : Math.max(l.x, s.x), f = Math.min(l.y, s.y), h = Math.max(l.y, s.y), u = qe(i, r), x = qo(e, t, o), d = i.rectMiddleLine, p = [{
    t: "rect",
    x: a,
    y: f,
    w: c - a,
    h: h - f,
    fill: u.fill,
    fillOpacity: u.fillOpacity,
    stroke: i.color,
    strokeWidth: i.width,
    dash: R(i)
  }];
  if (d != null && d.visible) {
    const y = x && (i.vertLabelsAlign ?? "middle") === "middle" && we(x.lines) ? x.poly : null, m = y && y.length ? "mid" : void 0;
    m && p.push({ t: "clip", name: m, polys: [y] });
    const b = Math.floor((f + h) / 2);
    p.push({
      t: "line",
      a: { x: a, y: b },
      b: { x: c, y: b },
      stroke: d.color,
      strokeWidth: d.width,
      dash: R({ ...i, lineStyle: d.style, width: d.width }),
      cap: "butt",
      clip: m,
      inert: !0
    });
  }
  return x && p.push(U(x, i.textColor ?? i.color, i.bold, i.italic)), p.push(...at(n, [...bt(l, s), ...Pi(l, s)], Yt.rectangle)), p;
}
function Qs(e, t, n, o) {
  const i = e.fmt === 2, r = Ho(t, i), l = be(o), s = i ? [t[0], t[1], ...r] : t;
  return [
    { t: "polygon", pts: r, fill: l.fill, fillOpacity: l.fillOpacity, stroke: o.color, strokeWidth: o.width, dash: R(o), join: "round" },
    ...at(n, s)
  ];
}
function Js(e, t, n, o, i) {
  const [r, l] = t, s = Math.hypot(l.x - r.x, l.y - r.y), a = qe(o, i);
  return [
    { t: "circle", cx: r.x, cy: r.y, r: Math.max(0, s), fill: a.fill, fillOpacity: a.fillOpacity, stroke: o.color, strokeWidth: o.width, dash: R(o) },
    ...qi(e, r.x, r.y, o),
    ...at(n, t)
  ];
}
function tc(e, t, n, o, i) {
  const [r, l, s] = t, a = (r.x + l.x) / 2, c = (r.y + l.y) / 2, f = Math.max(1, Math.hypot(l.x - r.x, l.y - r.y) / 2), h = Math.atan2(l.y - r.y, l.x - r.x), u = -Math.sin(h), x = Math.cos(h), d = Math.max(1, Math.abs((s.x - a) * u + (s.y - c) * x)), p = h * 180 / Math.PI, y = qe(o, i);
  return [
    {
      t: "group",
      transform: `rotate(${p} ${a} ${c})`,
      items: [
        { t: "ellipse", cx: a, cy: c, rx: f, ry: d, fill: "transparent", stroke: "transparent", strokeWidth: L * 2 },
        { t: "ellipse", cx: a, cy: c, rx: f, ry: d, fill: y.fill, fillOpacity: y.fillOpacity, stroke: o.color, strokeWidth: o.width, dash: R(o) }
      ]
    },
    ...qi(e, a, c, o),
    ...at(n, t)
  ];
}
function ec(e, t, n, o) {
  const i = qe(n, o);
  return [
    { t: "polygon", pts: e, fill: i.fill, fillOpacity: i.fillOpacity, stroke: n.color, strokeWidth: n.width, dash: R(n), join: "round" },
    ...at(t, e)
  ];
}
function nc(e, t, n) {
  const [o, i] = e, r = R(n), l = e.length === 3 ? Wi(o, i, e[2]) : null;
  if (!l)
    return [{ t: "line", a: o, b: i, stroke: n.color, strokeWidth: n.width, dash: r, cap: "round" }, ...at(t, e)];
  const s = yn(l), a = be(n);
  return [
    // fill closes back to the chord start; only the arc itself is stroked
    { t: "path", d: `${s} Z`, fill: a.fill, fillOpacity: a.fillOpacity, stroke: "none" },
    { t: "path", d: s, fill: "none", stroke: n.color, strokeWidth: n.width, dash: r, cap: "round" },
    ...at(t, e)
  ];
}
function Zi(e, t, n, o, i, r) {
  const l = [];
  if (n.fillBackground) {
    const s = be(n);
    l.push({ t: "path", d: yn(i) + " Z", fill: s.fill, fillOpacity: s.fillOpacity, stroke: "none" });
  }
  if (l.push({ t: "path", d: yn(o), fill: "none", stroke: n.color, strokeWidth: n.width, dash: R(n), cap: "round" }), l.push(...Zs(i, n)), t) {
    for (const [s, a] of r) l.push({ t: "line", a: s, b: a, stroke: n.color, strokeOpacity: 0.3, dash: "3 3" });
    l.push({ t: "anchors", pts: e });
  }
  return l;
}
function oc(e, t, n) {
  const o = e.length >= 3 ? e : [e[0], { x: (e[0].x + e[1].x) / 2, y: (e[0].y + e[1].y) / 2 }, e[1]], [i, r, l] = o, s = xn(o, !!n.extendLeft, !!n.extendRight), a = n.extendLeft || n.extendRight ? xn(o) : s;
  return Zi(e, t, n, s, a, [[i, r], [l, r]]);
}
function ic(e, t, n) {
  const o = e.length >= 4 ? e : [
    e[0],
    { x: e[0].x + (e[1].x - e[0].x) / 3, y: e[0].y + (e[1].y - e[0].y) / 3 },
    { x: e[0].x + (e[1].x - e[0].x) * 2 / 3, y: e[0].y + (e[1].y - e[0].y) * 2 / 3 },
    e[1]
  ], [i, r, l, s] = o, a = dn(o, !!n.extendLeft, !!n.extendRight), c = n.extendLeft || n.extendRight ? dn(o) : a;
  return Zi(e, t, n, a, c, [[i, r], [s, l]]);
}
function rc(e, t, n) {
  const [o, i, r] = e, l = Math.hypot(i.x - o.x, i.y - o.y);
  if (!r || l < 1e-6)
    return [{ t: "line", a: o, b: i, stroke: n.color, strokeWidth: n.width }, ...at(t, e)];
  const s = Math.atan2(i.y - o.y, i.x - o.x), a = Math.atan2(r.y - o.y, r.x - o.x), c = { x: o.x + Math.cos(a) * l, y: o.y + Math.sin(a) * l };
  let f = a - s;
  for (; f > Math.PI; ) f -= 2 * Math.PI;
  for (; f < -Math.PI; ) f += 2 * Math.PI;
  const h = [];
  for (let x = 0; x <= 32; x++) {
    const d = s + f * x / 32;
    h.push({ x: o.x + Math.cos(d) * l, y: o.y + Math.sin(d) * l });
  }
  const u = n.fillBackground === !1 ? 0 : Math.max(0, Math.min(1, (100 - (n.transparency ?? 80)) / 100));
  return [
    {
      t: "radialGradient",
      name: "sector",
      idPrefix: "sector-grad-",
      cx: o.x,
      cy: o.y,
      r: l,
      stops: [
        { offset: 0, color: n.sectorColor1 ?? "#2962ff", opacity: u },
        { offset: 1, color: n.sectorColor2 ?? "#9c27b0", opacity: u }
      ]
    },
    { t: "polygon", pts: [o, ...h], fillRef: "sector", stroke: "none" },
    { t: "line", a: o, b: i, stroke: n.color, strokeWidth: n.width },
    { t: "line", a: o, b: c, stroke: n.color, strokeWidth: n.width },
    { t: "polyline", pts: h, fill: "none", stroke: n.color, strokeWidth: n.width },
    ...at(t, e)
  ];
}
function lc(e, t, n, o, i) {
  const [r, l] = e, s = l.x - r.x, a = R(i), c = [{ t: "line", a: r, b: l, stroke: "#808080", strokeWidth: 1, dash: "6 4" }];
  if (Math.abs(s) >= 2)
    for (let f = r.x; s > 0 ? f <= n + 2 : f >= -2; f += s)
      c.push({ t: "line", a: { x: f, y: 0 }, b: { x: f, y: o }, stroke: i.color, strokeWidth: i.width, dash: a });
  return c.push(...at(t, e)), c;
}
function sc(e, t, n, o) {
  const i = zi(e[0], e[1], n), r = [];
  return i.length >= 2 && r.push({ t: "polyline", pts: i, fill: "none", stroke: o.color, strokeWidth: o.width, dash: R(o) }), r.push(...at(t, e)), r;
}
function cc(e, t, n, o) {
  const [i, r] = e, l = Math.abs(r.x - i.x), s = l / 2, a = R(o), c = be(o), f = i.y, h = [];
  if (l >= 2) {
    const u = Math.min(i.x, r.x), x = Math.floor(-u / l) - 1, d = Math.ceil((n - u) / l) + 1;
    for (let p = x; p <= d; p++) {
      const y = u + p * l;
      c.fillOpacity > 0 && h.push({ t: "path", d: `M ${y} ${f} A ${s} ${s} 0 0 1 ${y + l} ${f} Z`, fill: c.fill, fillOpacity: c.fillOpacity, stroke: "none", inert: !0 }), h.push({ t: "path", d: `M ${y} ${f} A ${s} ${s} 0 0 1 ${y + l} ${f}`, fill: "none", stroke: o.color, strokeWidth: o.width, dash: a });
    }
  }
  return h.push(...at(t, e)), h;
}
const Un = {
  "xabcd-pattern": ["X", "A", "B", "C", "D"],
  "cypher-pattern": ["X", "A", "B", "C", "D"],
  "abcd-pattern": ["A", "B", "C", "D"],
  // 7 points (TV): labels only at the left shoulder / head / right shoulder.
  "head-and-shoulders": ["", "LS", "", "H", "", "RS", ""],
  "triangle-pattern": ["A", "B", "C", "D"],
  "three-drives-pattern": ["1", "2", "3", "4", "5", "6", "7"],
  // Elliott label sets start at "0" (TV; the first click is the wave origin).
  "elliott-impulse": ["0", "1", "2", "3", "4", "5"],
  "elliott-correction": ["0", "A", "B", "C"],
  "elliott-triangle": ["0", "A", "B", "C", "D", "E"],
  "elliott-double-combo": ["0", "W", "X", "Y"],
  "elliott-triple-combo": ["0", "W", "X", "Y", "X", "Z"]
}, ac = /* @__PURE__ */ new Set([
  "polyline"
]), fc = [
  { font: 11, circle: 14, bold: !0 },
  { font: 16, circle: 22, bold: !1 },
  { font: 18, circle: 22, bold: !1 },
  { font: 20, circle: 28, bold: !1 },
  { font: 24, circle: 36, bold: !0 }
], hc = {
  "elliott-impulse": ["0", "1", "2", "3", "4", "5"],
  "elliott-correction": ["0", "A", "B", "C"],
  "elliott-triangle": ["0", "A", "B", "C", "D", "E"],
  "elliott-double-combo": ["0", "W", "X", "Y"],
  "elliott-triple-combo": ["0", "W", "X", "Y", "X", "Z"]
}, mo = ["0", "i", "ii", "iii", "iv", "v"];
function uc(e, t) {
  const n = hc[e] ?? [];
  return e === "elliott-impulse" ? t === 1 ? mo : t === 3 ? mo.map((o) => o.toUpperCase()) : n : t % 2 === 1 ? n.map((o) => o.toLowerCase()) : n;
}
function xc(e, t, n, o) {
  const r = 14 - Math.max(0, Math.min(14, Math.round(o.elliottDegree ?? Mr))), l = Math.floor(r / 3), s = ["", "brackets", "circle"][r % 3], a = fc[l], c = uc(e.kind, l), f = 10 + a.circle / 2, h = t.length > 2 ? Math.sign(t[2].y - t[1].y) : 1, u = (d) => d % 2 === 0 ? h : -h, x = [{ t: "polyline", pts: t, fill: "none", stroke: "transparent", strokeWidth: Math.max(L * 2, o.width) }];
  return o.showWave !== !1 && x.push({ t: "polyline", pts: t, fill: "none", stroke: o.color, strokeWidth: o.width, dash: R(o), join: "round", cap: "round" }), t.forEach((d, p) => {
    if (p === 0 && !n) return;
    const y = d.y + (u(p) === 1 ? f : -f), m = c[p] ?? String(p);
    s === "circle" && x.push({ t: "circle", cx: d.x, cy: y, r: a.circle / 2 - 0.5, fill: "none", stroke: o.color, strokeWidth: 1, inert: !0 }), x.push({
      t: "text",
      x: d.x,
      y: y + 0.05 * a.font,
      text: s === "brackets" ? `(${m})` : m,
      size: a.font,
      weight: a.bold ? 700 : 400,
      fill: o.color,
      anchor: "middle",
      baseline: "central",
      inert: !0
    });
  }), n && x.push({ t: "anchors", pts: t }), x;
}
function Ki(e, t) {
  const n = e[t - 1] ?? e[t + 1] ?? e[t], o = e[t + 1] ?? e[t - 1] ?? e[t];
  return e[t].y <= Math.min(n.y, o.y) ? -8 : 16;
}
function Fe(e, t, n, o, i) {
  const r = o.length * i.fontSize * 0.62 + 8, l = i.fontSize + 6, s = n < 0 ? t + n - l : n > 0 ? t + n : t - l / 2;
  return {
    t: "group",
    inert: !0,
    items: [
      { t: "rect", x: e - r / 2, y: s, w: r, h: l, rx: 4, fill: i.bg },
      {
        t: "text",
        x: e,
        y: s + l / 2 + 0.5,
        text: o,
        size: i.fontSize,
        weight: i.bold ? 700 : 400,
        fontStyle: i.italic ? "italic" : "normal",
        fill: i.fg,
        anchor: "middle",
        baseline: "middle"
      }
    ]
  };
}
function pt(e, t, n, o) {
  const i = t - e;
  if (Math.abs(i) < 1e-12) return "∞";
  const r = Math.pow(10, o);
  return String(Math.round(Math.abs((n - t) / i) * r) / r);
}
function pn(e, t, n, o) {
  return [
    { t: "hit", a: e, b: t, width: L * 2 },
    { t: "line", a: e, b: t, stroke: n, strokeWidth: o, dash: "2 3" }
  ];
}
function oe(e, t, n, o, i, r) {
  return [
    ...pn(e[t], e[n], r.bg, o),
    Fe((e[t].x + e[n].x) / 2, (e[t].y + e[n].y) / 2, 0, i, r)
  ];
}
const re = (e) => ({ bg: e.color, fg: e.textColor ?? "#ffffff", fontSize: e.fontSize ?? 12, bold: e.bold, italic: e.italic });
function Qi(e, t, n) {
  const o = re(n), i = [];
  return e.forEach((r, l) => {
    t[l] && i.push(Fe(r.x, r.y, Ki(e, l) < 0 ? -5 : 5, t[l], o));
  }), i;
}
const Me = (e) => ({ t: "polyline", pts: e, fill: "none", stroke: "transparent", strokeWidth: L * 2 });
function dc(e, t, n, o) {
  const i = re(o), r = e.points.map((s) => s.price), l = [
    Me(t),
    { t: "polyline", pts: t, fill: "none", stroke: o.color, strokeWidth: o.width, dash: R(o), join: "round" }
  ];
  return t.length >= 3 && l.push(...oe(t, 0, 2, o.width, pt(r[0], r[1], r[2], 3), i)), t.length >= 4 && l.push(...oe(t, 1, 3, o.width, pt(r[1], r[2], r[3], 3), i)), l.push(...Qi(t, Un[e.kind], o)), n && l.push({ t: "anchors", pts: t }), l;
}
function yc(e, t, n, o) {
  const i = e.kind === "cypher-pattern", r = re(o), l = o.backgroundColor ?? o.color, s = o.fillBackground === !1 ? 0 : Z(o), a = e.points.map((f) => f.price), c = [];
  if (s > 0 && t.length >= 3 && c.push({ t: "polygon", pts: [t[0], t[1], t[2]], fill: l, fillOpacity: s, stroke: "none" }), s > 0 && t.length >= 5 && c.push({ t: "polygon", pts: [t[2], t[3], t[4]], fill: l, fillOpacity: s, stroke: "none" }), c.push(Me(t), { t: "polyline", pts: t, fill: "none", stroke: o.color, strokeWidth: o.width, dash: R(o), join: "round" }), t.length >= 3 && c.push(...oe(t, 0, 2, 1, pt(a[0], a[1], a[2], 3), r)), t.length >= 4 && c.push(...oe(t, 1, 3, 1, i ? pt(a[1], a[0], a[3], 3) : pt(a[1], a[2], a[3], 3), r)), t.length >= 5) {
    const f = i ? pt(a[0], a[2], a[4], 3) : pt(a[0], a[1], a[4], 3);
    c.push(
      ...pn(t[0], t[4], o.color, 1),
      ...pn(t[2], t[4], o.color, 1),
      Fe((t[2].x + t[4].x) / 2, (t[2].y + t[4].y) / 2, 0, pt(a[2], a[3], a[4], 3), r),
      Fe((t[0].x + t[4].x) / 2, (t[0].y + t[4].y) / 2, 0, f, r)
    );
  }
  return c.push(...Qi(t, Un[e.kind], o)), n && c.push({ t: "anchors", pts: t }), c;
}
function pc(e, t, n, o) {
  const i = re(o), r = e.points.map((s) => s.price), l = [
    Me(t),
    { t: "polyline", pts: t, fill: "none", stroke: o.color, strokeWidth: o.width, dash: R(o), join: "round" }
  ];
  return t.length >= 4 && l.push(...oe(t, 1, 3, o.width, pt(r[1], r[2], r[3], 2), i)), t.length >= 6 && l.push(...oe(t, 3, 5, o.width, pt(r[3], r[4], r[5], 2), i)), n && l.push({ t: "anchors", pts: t }), l;
}
function _t(e, t, n, o) {
  const i = o.fontSize / 3, r = zt(n, o.fontSize, !!o.bold, !!o.italic) + 2 * i, l = o.fontSize + 2 * i, s = t ? e.y - 5 - l : e.y + 5;
  return {
    t: "group",
    inert: !0,
    items: [
      { t: "rect", x: e.x - r / 2, y: s, w: r, h: l, rx: 4, fill: o.bg },
      {
        t: "text",
        x: e.x,
        y: s + l / 2,
        text: n,
        size: o.fontSize,
        weight: o.bold ? 700 : 400,
        fontStyle: o.italic ? "italic" : "normal",
        fill: o.fg,
        anchor: "middle",
        baseline: "central"
      }
    ]
  };
}
function mc(e, t, n) {
  const [o, i, r, l] = e, s = re(n);
  let a = null;
  if (Math.abs(r.x - o.x) >= 1 && Math.abs(l.x - i.x) >= 1) {
    const f = (r.y - o.y) / (r.x - o.x), h = (l.y - i.y) / (l.x - i.x);
    if (Math.abs(f - h) >= 1e-6) {
      let u = Math.min(o.x, i.x, r.x, l.x), x = { x: u, y: o.y + (u - o.x) * f }, d = { x: u, y: i.y + (u - i.x) * h };
      const p = (i.y - o.y + (o.x * f - i.x * h)) / (f - h);
      p < u && (u = Math.max(o.x, i.x, r.x, l.x), x = { x: u, y: o.y + (u - o.x) * f }, d = { x: u, y: i.y + (u - i.x) * h }), a = [x, d, { x: p, y: o.y + (p - o.x) * f }];
    }
  }
  const c = [Me(e)];
  return a && c.push({
    t: "polygon",
    pts: a,
    fill: n.fillBackground === !1 ? "none" : n.backgroundColor ?? n.color,
    fillOpacity: Z({ ...n, transparency: n.transparency ?? 85 }),
    stroke: n.color,
    strokeWidth: n.width,
    dash: R({ ...n, lineStyle: "dotted" }),
    inert: !0
  }), c.push(
    { t: "polyline", pts: e, fill: "none", stroke: n.color, strokeWidth: n.width, join: "round" },
    _t(o, i.y > o.y, "A", s),
    _t(i, i.y < o.y, "B", s),
    _t(r, r.y < i.y, "C", s),
    _t(l, l.y < r.y, "D", s)
  ), t && c.push({ t: "anchors", pts: e }), c;
}
function bo(e, t, n, o) {
  const i = { x: t.x - e.x, y: t.y - e.y }, r = { x: o.x - n.x, y: o.y - n.y }, l = i.x * r.y - i.y * r.x;
  if (Math.abs(l) < 1e-9) return null;
  const s = ((n.x - e.x) * i.y - (n.y - e.y) * i.x) / l;
  return s < 0 || s > 1 ? null : { x: n.x + r.x * s, y: n.y + r.y * s };
}
function bc(e, t, n) {
  const o = Z({ ...n, transparency: n.transparency ?? 85 }), i = n.backgroundColor ?? n.color, [r, l, s, a, c, f, h] = e, u = bo(s, c, r, l), x = bo(s, c, f, h), d = (b, g) => ({ x: b.x + (g.x - b.x) * 10, y: b.y + (g.y - b.y) * 10 }), p = re(n), y = (b, g, w) => ({ t: "polygon", pts: [b, g, w], fill: i, fillOpacity: o, stroke: "none", inert: !0 }), m = [Me(e)];
  return n.fillBackground !== !1 && (m.push(y(s, a, c)), u && m.push(y(u, l, s)), x && m.push(y(c, f, x))), m.push(
    { t: "line", a: u ?? d(c, s), b: x ?? d(s, c), stroke: n.color, strokeWidth: n.width, dash: R({ ...n, lineStyle: "dotted" }), inert: !0 },
    { t: "polyline", pts: e, fill: "none", stroke: n.color, strokeWidth: n.width, dash: R(n), join: "round" },
    _t(l, l.y < r.y, "Left Shoulder", p),
    _t(a, a.y < s.y, "Head", p),
    _t(f, f.y < c.y, "Right Shoulder", p)
  ), t && m.push({ t: "anchors", pts: e }), m;
}
function gc(e, t = 5) {
  if (e.length < 2) return e;
  const n = Math.max(1, t), o = [e[0]];
  for (let r = 1; r < e.length; r++) {
    const l = e[r].x - e[r - 1].x, s = e[r].y - e[r - 1].y, a = Math.hypot(l, s), c = Math.min(5, Math.floor(a / n));
    for (let f = 0; f < c - 1; f++) o.push({ x: e[r - 1].x + l / c * f, y: e[r - 1].y + s / c * f });
    o.push(e[r]);
  }
  const i = new Array(o.length);
  for (let r = 0; r < o.length; r++) {
    let l = 0, s = 0;
    for (let a = 0; a < n; a++) {
      const c = o[Math.max(r - a, 0)], f = o[Math.min(r + a, o.length - 1)];
      l += c.x + f.x, s += c.y + f.y;
    }
    i[r] = { x: l * 0.5 / n, y: s * 0.5 / n };
  }
  return i.push(o[o.length - 1]), i;
}
function wc(e, t, n, o) {
  if (e.kind === "triangle-pattern" && t.length >= 4) return mc(t, n, o);
  if (e.kind === "head-and-shoulders" && t.length >= 7) return bc(t, n, o);
  if (e.kind === "abcd-pattern" && t.length >= 2) return dc(e, t, n, o);
  if ((e.kind === "xabcd-pattern" || e.kind === "cypher-pattern") && t.length >= 2) return yc(e, t, n, o);
  if (e.kind === "three-drives-pattern" && t.length >= 2) return pc(e, t, n, o);
  if (e.kind.startsWith("elliott-")) return xc(e, t, n, o);
  const i = Un[e.kind], r = ac.has(e.kind) && e.closed === !0, l = e.kind === "highlighter", s = e.kind === "brush" || l, a = o.width, c = s ? gc(t) : t, f = s ? void 0 : R(o), h = s && t.length > 1 ? [t[0], t[t.length - 1]] : t, u = [];
  if (r) {
    const x = o.backgroundColor ?? o.color, d = o.fillBackground !== void 0 ? Z(o) : 0.08;
    u.push(
      { t: "polygon", pts: c, fill: x, fillOpacity: d, stroke: "transparent", strokeWidth: L * 2 },
      { t: "polygon", pts: c, fill: x, fillOpacity: d, stroke: o.color, strokeWidth: o.width, dash: f, join: "round" }
    );
  } else {
    e.kind === "brush" && o.fillBackground === !0 && u.push({ t: "polygon", pts: c, fill: o.backgroundColor ?? o.color, fillOpacity: Z(o), stroke: "none", inert: !0 }), u.push(
      { t: "polyline", pts: c, fill: "none", stroke: "transparent", strokeWidth: Math.max(L * 2, a) },
      { t: "polyline", pts: c, fill: "none", stroke: o.color, strokeWidth: a, strokeOpacity: l ? 0.2 : 1, dash: f, join: "round", cap: "round" }
    );
    const x = (p, y) => {
      const m = Math.hypot(y.x - p.x, y.y - p.y), g = (o.lineStyle ?? "solid") === "solid" && m >= 1 ? { x: p.x + (y.x - p.x) * (m + o.width / 2) / m, y: p.y + (y.y - p.y) * (m + o.width / 2) / m } : y;
      return { t: "path", d: je(p, g, o.width), fill: "none", stroke: o.color, strokeWidth: o.width, dash: f, join: "round", cap: "round", inert: !0 };
    }, d = e.kind === "path" || e.kind === "brush";
    d && c.length > 1 && (o.leftEnd ?? 0) === 1 && u.push(x(c[1], c[0])), d && c.length > 1 && (o.rightEnd ?? (e.kind === "path" ? 1 : 0)) === 1 && u.push(x(c[c.length - 2], c[c.length - 1]));
  }
  return i && t.forEach((x, d) => {
    u.push({ t: "text", x: x.x, y: x.y + Ki(t, d), text: i[d] ?? String(d + 1), size: 11, fill: o.color, anchor: "middle" });
  }), n && u.push({ t: "anchors", pts: h }), u;
}
function Mc(e) {
  return e < 92 ? 18 : Math.min(Math.max(e * 0.25, 18), 106, e * 0.9);
}
function vc(e, t, n) {
  const [o, i] = e, r = Math.hypot(i.x - o.x, i.y - o.y), l = n.fontSize ?? 16, s = (A, z, O) => n.text ? [{
    t: "text",
    x: A,
    y: z,
    text: n.text,
    anchor: O,
    size: l,
    weight: n.bold !== !1 ? 700 : 400,
    fontStyle: n.italic ? "italic" : "normal",
    fill: n.textColor ?? n.color,
    inert: !0
  }] : [];
  if (r < 1) {
    const A = [{ t: "circle", cx: i.x, cy: i.y, r: 9, fill: n.color }, ...s(i.x + 12, i.y + l * 0.35, "start")];
    return t && A.push({ t: "anchors", pts: [i] }), A;
  }
  let a = o;
  if (r < 22) {
    const A = { x: (i.x - o.x) / r, y: (i.y - o.y) / r };
    a = { x: i.x - A.x * 22, y: i.y - A.y * 22 };
  }
  const c = i.x - a.x, f = i.y - a.y, h = Math.hypot(c, f), u = c / h, x = f / h, d = -x, p = u, y = Mc(h), m = h >= 35 ? 0.1 : 0, b = [
    { x: 0, y: 0 },
    { x: h - y + y * m, y: 1.22 * y / 4 },
    { x: h - y, y: 1.22 * y / 2 },
    { x: h, y: 0 }
  ], g = (A, z) => ({ x: a.x + u * A.x + d * A.y * z, y: a.y + x * A.x + p * A.y * z }), w = [
    ...b.map((A) => g(A, 1)),
    ...b.slice(0, b.length - 1).reverse().map((A) => g(A, -1))
  ], M = Math.min(5, Math.max(2, Math.round(0.02 * h))), v = Math.atan2(c, f);
  let k = o.x, S = o.y, C = "middle";
  v > -Math.PI / 4 && v < Math.PI / 4 ? S -= 8 : v > 3 * Math.PI / 4 || v < -3 * Math.PI / 4 ? S += 8 + l : v < 0 ? (k += 10, C = "start", S += l * 0.35) : (k -= 10, C = "end", S += l * 0.35);
  const I = [
    { t: "hit", a, b: i, width: Math.max(12, 1.22 * y / 2) },
    { t: "polygon", pts: w, fill: n.color, stroke: n.color, strokeWidth: M, join: "round", cap: "round" },
    ...s(k, S, C)
  ];
  return t && I.push({ t: "anchors", pts: e }), I;
}
function kc(e, t) {
  const n = t === "up" ? 1 : -1, o = n * 12, i = n * 10, r = 19.5 / 2, l = 5;
  return `M ${e.x} ${e.y} L ${e.x + r} ${e.y + o} L ${e.x + l} ${e.y + o} L ${e.x + l} ${e.y + o + i} L ${e.x - l} ${e.y + o + i} L ${e.x - l} ${e.y + o} L ${e.x - r} ${e.y + o} Z`;
}
function go(e, t, n, o, i) {
  const r = t[0], l = ci(e, r), s = o.fontSize ?? 14, a = [{ t: "path", d: kc(r, i), fill: o.color }];
  return l && (a.push({ t: "rect", x: l.left, y: l.top, w: l.width, h: l.height, fill: "transparent" }), l.lines.forEach((c, f) => {
    a.push({
      t: "text",
      x: r.x,
      y: l.top + l.pad + f * l.lineH,
      text: c,
      anchor: "middle",
      baseline: "hanging",
      size: s,
      weight: o.bold ? 700 : 400,
      fontStyle: o.italic ? "italic" : "normal",
      fill: o.textColor ?? o.color,
      inert: !0,
      pre: !0
    });
  })), n && a.push({ t: "anchors", pts: [r] }), a;
}
const wo = 22, Ae = 17, Ke = 12, Lc = 5;
function Sc(e, t, n) {
  const o = e[0], i = o.y - wo, r = o.x, l = [
    { x: r, y: i },
    { x: r + Ae, y: i },
    { x: r + Ae - Lc, y: i + Ke / 2 },
    { x: r + Ae, y: i + Ke },
    { x: r, y: i + Ke }
  ], s = [
    // fat transparent hit target over pole + banner
    { t: "rect", x: r - L, y: i - L, w: Ae + L * 2, h: wo + L * 2, fill: "transparent" },
    { t: "line", a: { x: r, y: i }, b: { x: r, y: o.y }, stroke: n.color, strokeWidth: Math.max(2, n.width + 1), cap: "round" },
    { t: "polygon", pts: l, fill: n.color, stroke: n.color, strokeWidth: 1, join: "round" }
  ];
  return t && s.push({ t: "anchors", pts: [o] }), s;
}
function Cc(e, t, n, o, i) {
  const r = t[0], l = (i == null ? void 0 : i.pipSize()) ?? 0.01, s = Math.max(0, Math.min(8, Math.round(-Math.log10(l)))), a = e.points[0].price.toFixed(s), c = o.fontSize ?? 14, f = Ci(a, r, c), h = 100 - (o.transparency ?? 0), u = o.borderColor ?? o.color, x = [
    { t: "path", d: wl(f), fill: Lt(ct(o.backgroundColor ?? o.color).hex, h), stroke: u, strokeWidth: 2, join: "round" },
    { t: "text", x: f.x + 10, y: f.y + f.h / 2 + Math.floor(0.35 * c), text: a, size: c, weight: "bold", fill: o.textColor ?? "#ffffff", pre: !0 },
    { t: "circle", cx: r.x, cy: r.y, r: 2.5, fill: Lt(ct(u).hex, h), stroke: "#0f0f0f", strokeWidth: 1 }
  ];
  return n && x.push({ t: "anchors", pts: [r] }), x;
}
const Tc = 28;
function Ac(e, t, n) {
  const [o] = t, i = e.style.fontSize ?? Tc, r = i / 2, l = [];
  return n && l.push({ t: "rect", x: o.x - r - 2, y: o.y - r - 2, w: i + 4, h: i + 4, fill: "none", stroke: "#2962ff", strokeWidth: 1, dash: "3 3", rx: 3 }), l.push({ t: "glyph", x: o.x - r, y: o.y - r, size: i, glyph: e.glyph ?? "", color: e.style.color }), [{ t: "group", items: l }];
}
const $c = "#089981", Bc = "#f23645";
function Ic(e, t) {
  const n = [];
  for (const o of e) {
    const i = o.up ? $c : Bc, r = Math.min(o.openY, o.closeY), l = Math.max(1, Math.abs(o.closeY - o.openY));
    n.push(
      { t: "line", a: { x: o.x, y: o.highY }, b: { x: o.x, y: o.lowY }, stroke: i, strokeWidth: 1 },
      { t: "rect", x: o.x - t / 2, y: r, w: t, h: l, fill: i }
    );
  }
  return n;
}
function Pc(e, t, n, o, i) {
  if (e.kind !== "bar-pattern") return [];
  const [r, l] = t, s = si(e, t, i), a = n ? [{ t: "anchors", pts: t }] : [];
  if (!s) {
    const h = { stroke: "#808080", strokeWidth: 1, inert: !0 };
    return [
      { t: "line", a: { x: r.x, y: 0 }, b: { x: r.x, y: 99999 }, ...h },
      { t: "line", a: { x: l.x, y: 0 }, b: { x: l.x, y: 99999 }, ...h },
      { t: "line", a: r, b: l, ...h },
      ...a
    ];
  }
  const c = o.color, f = Ye(o);
  return s.lineMode ? [
    { t: "polyline", pts: s.line, fill: "none", stroke: "transparent", strokeWidth: f * 2 },
    { t: "polyline", pts: s.line, fill: "none", stroke: c, strokeOpacity: 0.9, strokeWidth: 2, inert: !0 },
    ...a
  ] : [
    ...s.bars.map((h) => ({ t: "rect", x: h.x - 1 - f, y: h.top - f, w: 2 + 2 * f, h: h.bottom - h.top + 2 * f, fill: "transparent" })),
    {
      t: "group",
      inert: !0,
      items: s.bars.map((h) => ({
        t: "rect",
        x: h.x - 1,
        y: h.top,
        w: 2,
        h: Math.max(1, h.bottom - h.top),
        fill: c,
        fillOpacity: 0.9,
        stroke: c,
        strokeWidth: 1
      }))
    },
    ...a
  ];
}
function Mo(e) {
  let t = e >>> 0;
  return () => {
    t += 1831565813;
    let n = Math.imul(t ^ t >>> 15, 1 | t);
    return n ^= n + Math.imul(n ^ n >>> 7, 61 | n), ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
const vo = 14;
function Ec(e, t, n, o, i) {
  if (e.kind !== "ghost-feed") return [];
  if (e.ghost && i && e.points.length >= 2) {
    const v = e.ghost.amplitude, k = Math.max(0, Math.min(1, (o.variance ?? 50) / 100)), S = [];
    let C = 8, I = !1;
    for (let A = 0; A < e.points.length - 1; A++) {
      const z = i.timeToBarIndex(e.points[A].time), O = i.timeToBarIndex(e.points[A + 1].time);
      if (z == null || O == null || z === O) continue;
      I = !0;
      const T = t[A].x <= t[A + 1].x, E = i.priceToY(T ? e.points[A].price : e.points[A + 1].price), P = i.priceToY(T ? e.points[A + 1].price : e.points[A].price);
      if (E == null || P == null) continue;
      const B = Math.min(z, O), F = Math.abs(O - z) - (A === 0 ? 0 : 1), V = F > 1 ? (P - E) / (F - 1) : 0;
      for (let K = 0; K < F; K++) {
        const xt = i.barIndexToTime(B + K), Vt = xt == null ? null : i.timeToX(xt);
        if (Vt == null) continue;
        if (K > 0) {
          const ce = i.barIndexToTime(B + K - 1), ae = ce == null ? null : i.timeToX(ce);
          ae != null && (C = Math.abs(Vt - ae) || C);
        }
        const vt = i.yToPrice(E + K * V);
        if (vt == null) continue;
        const Ut = Mo((e.ghost.seed ^ Math.imul(A, 2654435769) ^ Math.imul(K, 2654435761)) >>> 0), le = v * (1 - 2 * Ut()) * k, dt = Math.max(1e-9, v * (1 + (0.5 - Ut()) * k)), ft = le - dt / 2, Rt = ft + Ut() * dt, Ft = ft + Ut() * dt, se = i.priceToY(vt + Rt), Tt = i.priceToY(vt + ft + dt), ke = i.priceToY(vt + ft), Le = i.priceToY(vt + Ft);
        se == null || Tt == null || ke == null || Le == null || S.push({ x: Vt, openY: se, highY: Tt, lowY: ke, closeY: Le, up: Ft >= Rt });
      }
    }
    if (I) {
      const A = Math.floor(0.3 * C), z = o.ghostCandle ?? vr, O = i.priceToY(e.points[0].price), T = i.priceToY(e.points[0].price + v), E = O != null && T != null ? Math.abs(T - O) : 10, P = [];
      for (const F of S)
        z.drawWick && P.push({ t: "line", a: { x: F.x, y: F.highY }, b: { x: F.x, y: F.lowY }, stroke: z.wickColor, strokeWidth: 1 }), P.push({
          t: "rect",
          x: Math.round(F.x) - A - 0.5,
          y: Math.min(F.openY, F.closeY),
          w: 2 * A + 1,
          h: Math.max(1, Math.abs(F.closeY - F.openY)),
          fill: F.up ? z.upColor : z.downColor,
          stroke: z.drawBorder ? F.up ? z.borderUpColor : z.borderDownColor : "none",
          strokeWidth: 1
        });
      const B = [
        { t: "polyline", pts: t, fill: "none", stroke: "transparent", strokeWidth: Math.max(12, E * 2) },
        { t: "polyline", pts: t, fill: "none", stroke: "#808080", strokeWidth: 1, inert: !0 },
        { t: "group", inert: !0, opacity: 1 - (o.transparency ?? 50) / 100, items: P }
      ];
      return n && B.push({ t: "anchors", pts: t }), B;
    }
  }
  const [r, l] = t, s = Math.min(r.x, l.x), a = Math.max(r.x, l.x), c = Math.min(r.y, l.y), f = Math.max(r.y, l.y), h = a - s, u = f - c, x = Math.round((e.points[0].price + e.points[1].price) * 1e3) ^ ((D(e.points[0].time) ?? 0) | 0), d = Mo(x), p = h / vo, y = Math.max(1, p * 0.6), m = u * 0.06, b = u * 0.12;
  let g = c + u / 2;
  const w = [];
  for (let v = 0; v < vo; v++) {
    const k = g, S = (d() - 0.5) * 2 * b;
    let C = k + S;
    C = Math.max(c + m, Math.min(f - m, C));
    const I = Math.min(k, C) - d() * m, A = Math.max(k, C) + d() * m;
    w.push({ x: s + p * (v + 0.5), openY: k, highY: I, lowY: A, closeY: C, up: C <= k }), g = C;
  }
  const M = [
    { t: "rect", x: s, y: c, w: h, h: u, fill: o.color, fillOpacity: 0.04, stroke: o.color, strokeWidth: o.width, dash: "4 3" },
    // dotted guide line through the walk's midline (matches the icon)
    { t: "line", a: { x: s, y: c + u / 2 }, b: { x: a, y: c + u / 2 }, stroke: o.color, strokeWidth: 1, strokeOpacity: 0.4, dash: "2 3", inert: !0 },
    { t: "group", inert: !0, items: Ic(w, y) }
  ];
  if (n)
    for (const v of bt(r, l))
      M.push({ t: "circle", cx: v.x, cy: v.y, r: et, fill: "#fff", stroke: o.color, strokeWidth: 1.5, cursor: "nwse-resize" });
  return M;
}
const zc = "#2e2e2e", Wc = { dx: 0, dy: 1, blur: 4, color: "rgba(0,0,0,0.4)" };
function Rc(e, t, n, o) {
  const i = n / 2, r = 10 + i, l = Math.min(e.y, t.y), s = Math.max(e.y, t.y);
  let a;
  if (e.y > t.y) {
    a = l - r;
    const c = i - a;
    if (c > 0) {
      const f = s + r;
      f + i <= o ? a = f : a += c;
    }
  } else {
    a = s + r;
    const c = a + i - o;
    if (c > 0) {
      const f = l - r;
      f - i >= 0 ? a = f : a -= c;
    }
  }
  return a;
}
function Xn(e, t, n, o, i) {
  const r = (c) => c !== !1, l = [], [s, a] = e.points;
  if (!s || !a) return l;
  if (o) {
    const c = s.price, h = a.price - c, u = (n == null ? void 0 : n.pipSize()) ?? 0.01, x = Math.max(0, Math.min(8, Math.round(-Math.log10(u)))), d = r(t.showPriceRange), p = r(t.showPercentPriceRange), y = r(t.showPipsPriceRange);
    let m = "";
    if (d && (m += mt(h, x)), p) {
      const b = c !== 0 ? 100 * h / Math.abs(c) : 0;
      d && (m += " ("), m += `${mt(Math.round(b * 100) / 100, 2)}%`, d && (m += ")");
    }
    y && (d ? m += p ? " " : ", " : p && (m += ", "), m += mt(Math.round(h / u), 0)), m && l.push(m);
  }
  if (i) {
    const c = r(t.showBarsRange), f = r(t.showDateTimeRange), h = r(t.showVolume);
    let u = "";
    const x = D(s.time), d = D(a.time), p = (n == null ? void 0 : n.timeToBarIndex(s.time)) ?? null, y = (n == null ? void 0 : n.timeToBarIndex(a.time)) ?? null;
    if (c && p != null && y != null && (u += `${y - p} bars`), f && x != null && d != null && (c && (u += ", "), u += On(d - x)), u && l.push(u), h && n && x != null && d != null) {
      const m = Ue(n.bars(), Math.min(x, d), Math.max(x, d));
      let b = 0, g = !1;
      for (const w of m)
        w.volume != null && (b += w.volume, g = !0);
      g && l.push(`Vol ${ys(b)}`);
    }
  }
  return l;
}
function Fc(e, t, n, o, i, r) {
  if (!i.length) return [];
  const l = r.fontSize ?? 12, s = l * 0.4 + l / 3, a = l * 0.2 + l / 3, c = Math.max(...i.map((x) => st(x, l))) + s * 2, f = l * i.length + 8 * (i.length - 1) + a * 2, h = Rc(t, n, f, o), u = [];
  return r.fillLabelBackground !== !1 && u.push({ t: "rect", x: e - c / 2, y: h - f / 2, w: c, h: f, rx: 4, fill: r.labelBackgroundColor ?? zc, shadow: Wc }), i.forEach((x, d) => {
    u.push({ t: "text", x: e, y: h - f / 2 + a + d * (l + 8) + l / 2, text: x, size: l, fill: r.textColor ?? "#ffffff", anchor: "middle", baseline: "central" });
  }), [{ t: "group", inert: !0, items: u }];
}
function Ji(e, t, n) {
  const o = n.text ?? "";
  if (o === "") return null;
  const i = n.customTextSize ?? 12, r = o.split(`
`), l = Math.ceil(i), s = Math.round((e.y + t.y) / 2);
  return { x: (e.x + t.x) / 2, cy: s, top: s - r.length * l / 2, lines: r, lineH: l, fs: i };
}
function Oc(e, t, n) {
  const o = Ji(e, t, n);
  if (!o || !we(o.lines)) return { items: [], clip: void 0 };
  const i = o.fs / 3, r = Fi({ x: o.x, y: o.cy }, 0, o.lines, o.fs, o.lineH, i, i, "middle", "center", !!n.customTextBold, !!n.customTextItalic);
  return r.length ? { items: [{ t: "clip", name: "text", polys: [r] }], clip: "text" } : { items: [], clip: void 0 };
}
function Dc(e, t, n) {
  const o = Ji(e, t, n);
  return o ? o.lines.map((i, r) => ({
    t: "text",
    x: o.x,
    y: o.top + r * o.lineH,
    text: i,
    anchor: "middle",
    baseline: "hanging",
    size: o.fs,
    weight: n.customTextBold ? 700 : 400,
    fontStyle: n.customTextItalic ? "italic" : "normal",
    fill: n.customTextColor ?? "#2962ff",
    inert: !0,
    pre: !0
  })) : [];
}
function _c(e) {
  return e.fillBackground === !1 ? 0 : Math.max(0, Math.min(1, (100 - (e.transparency ?? 85)) / 100));
}
function Gn(e, t, n, o, i) {
  const r = _c(i);
  return { t: "rect", x: e, y: t, w: n, h: o, fill: r > 0 ? i.backgroundColor ?? i.color : "transparent", fillOpacity: r > 0 ? r : 1 };
}
const Et = (e, t, n) => ({ t: "line", a: e, b: t, stroke: n.color, strokeWidth: n.width, cap: "round" }), Oe = (e, t, n) => ({
  t: "path",
  d: je(e, t, n.width),
  fill: "none",
  stroke: n.color,
  strokeWidth: n.width,
  cap: "round",
  join: "round"
});
function jn(e, t, n, o, i, r, l, s, a) {
  const c = Oc(n, o, s), f = [
    ...c.items,
    ...e,
    { t: "group", clip: c.clip, items: t },
    ...Fc((n.x + o.x) / 2, n, o, l, a, s),
    ...Dc(i[0], i[1], s)
  ];
  return r && f.push({ t: "anchors", pts: i }), f;
}
function Hc(e, t, n, o, i, r, l) {
  if (e.kind !== "price-range") return [];
  const [s, a] = t, c = r.extendLeft ? 0 : Math.min(s.x, a.x), f = r.extendRight ? o : Math.max(s.x, a.x), h = Math.round((s.x + a.x) / 2), u = Xn(e, r, l, !0, !1), x = [Et({ x: h, y: s.y }, { x: h, y: a.y }, r)];
  Math.abs(a.y - s.y) >= 15 * r.width && x.push(Oe({ x: h, y: s.y }, { x: h, y: a.y }, r));
  const d = [
    Gn(c, Math.min(s.y, a.y), Math.max(1, f - c), Math.abs(a.y - s.y), r),
    Et({ x: c, y: s.y }, { x: f, y: s.y }, r),
    Et({ x: c, y: a.y }, { x: f, y: a.y }, r)
  ];
  return jn(d, x, s, a, t, n, i, r, u);
}
function Nc(e, t, n, o, i, r) {
  if (e.kind !== "date-range") return [];
  const [l, s] = t, a = i.extendTop ? 0 : Math.min(l.y, s.y), c = i.extendBottom ? o : Math.max(l.y, s.y), f = Math.round((l.y + s.y) / 2), h = Xn(e, i, r, !1, !0), u = [Et({ x: l.x, y: f }, { x: s.x, y: f }, i)];
  Math.abs(s.x - l.x) >= 15 * i.width && u.push(Oe({ x: l.x, y: f }, { x: s.x, y: f }, i));
  const x = [
    Gn(Math.min(l.x, s.x), a, Math.max(1, Math.abs(s.x - l.x)), Math.max(1, c - a), i),
    Et({ x: l.x, y: a }, { x: l.x, y: c }, i),
    Et({ x: s.x, y: a }, { x: s.x, y: c }, i)
  ];
  return jn(x, u, l, s, t, n, o, i, h);
}
function Yc(e, t, n, o, i, r) {
  if (e.kind !== "date-and-price-range") return [];
  const [l, s] = t, a = Math.round((l.y + s.y) / 2), c = Math.round((l.x + s.x) / 2), f = Xn(e, i, r, !0, !0), h = i.drawBorder ? i.borderWidth ?? 1 : 0, u = h / 2, x = l.x + Math.sign(s.x - l.x) * u, d = s.x + Math.sign(l.x - s.x) * u, p = l.y + Math.sign(s.y - l.y) * u, y = s.y + Math.sign(l.y - s.y) * u, m = [Gn(Math.min(l.x, s.x), Math.min(l.y, s.y), Math.max(1, Math.abs(s.x - l.x)), Math.max(1, Math.abs(s.y - l.y)), i)];
  h > 0 && m.push({ t: "rect", x: Math.min(l.x, s.x), y: Math.min(l.y, s.y), w: Math.abs(s.x - l.x), h: Math.abs(s.y - l.y), fill: "none", stroke: i.borderColor ?? i.color, strokeWidth: h });
  const b = [
    Et({ x, y: a }, { x: d, y: a }, i),
    Et({ x: c, y: p }, { x: c, y }, i)
  ];
  return Math.abs(s.x - l.x) >= 25 * i.width && b.push(Oe({ x, y: a }, { x: d, y: a }, i)), Math.abs(s.y - l.y) >= 25 * i.width && b.push(Oe({ x: c, y: p }, { x: c, y }, i)), jn(m, b, l, s, t, n, o, i, f);
}
function Vc(e, t, n, o, i, r) {
  const l = i.regressionLines ?? Do, s = Ko(e, r, o);
  if (!s) {
    const u = [{ t: "line", a: t[0], b: t[1], stroke: l.base.color, strokeWidth: l.base.width, dash: R({ ...i, lineStyle: l.base.style }), cap: "round" }];
    return n && u.push({ t: "anchors", pts: t }), u;
  }
  const a = [
    { seg: s.lower, st: l.down },
    { seg: s.center, st: l.base },
    { seg: s.upper, st: l.up }
  ].filter((u) => !!u.seg && u.st.visible), c = Z(i), f = [];
  c > 0 && a.slice(1).forEach((u, x) => {
    const d = a[x].seg;
    f.push({ t: "polygon", pts: [d[0], d[1], u.seg[1], u.seg[0]], fill: u.st.color, fillOpacity: c, stroke: "none", inert: !0 });
  });
  for (const u of a)
    f.push(
      { t: "hit", a: u.seg[0], b: u.seg[1], width: L * 2 },
      { t: "line", a: u.seg[0], b: u.seg[1], stroke: u.st.color, strokeWidth: u.st.width, dash: R({ ...i, lineStyle: u.st.style }), cap: "round" }
    );
  const h = s.lower;
  return i.showPearsons !== !1 && h && f.push({ t: "text", x: h[0].x, y: h[0].y + 4, text: String(s.pearsons), anchor: "middle", baseline: "hanging", size: 12, fill: l.down.color, inert: !0 }), n && f.push({ t: "anchors", pts: s.anchors }), f;
}
function Uc(e, t, n, o, i, r) {
  const l = R(i), s = ti(e, r), a = [{ t: "circle", cx: t[0].x, cy: t[0].y, r: et + L, fill: "transparent" }];
  if (n && a.push({ t: "anchors", pts: t }), s.line.length < 2) {
    const h = { x: o, y: t[0].y };
    return [
      { t: "hit", a: t[0], b: h, width: 12 },
      { t: "line", a: t[0], b: h, stroke: i.color, strokeWidth: i.width, dash: l },
      ...a
    ];
  }
  const c = [], f = (h, u, x, d) => [
    { t: "polyline", pts: h, fill: "none", stroke: "transparent", strokeWidth: L * 2, join: "round" },
    { t: "polyline", pts: h, fill: "none", stroke: u, strokeWidth: x, dash: d, join: "round" }
  ];
  for (const h of s.bands)
    if (!(h.upper.length < 2 || h.lower.length < 2)) {
      i.fillBackground !== !1 && h.index === 0 && c.push({ t: "polygon", pts: [...h.upper, ...h.lower.slice().reverse()], fill: i.backgroundColor ?? "#4caf50", fillOpacity: Z({ ...i, transparency: i.transparency ?? 95 }), stroke: "none", inert: !0 });
      for (const [u, x] of [["upper", h.upper], ["lower", h.lower]]) {
        const d = cn(i, h.index, u);
        d.visible && c.push(...f(x, d.color, d.width));
      }
    }
  return c.push(...f(s.line, i.color, i.width, l), ...a), c;
}
const ko = (e) => e === "dashed" ? "6 4" : e === "dotted" ? "2 3" : void 0;
function Xc(e) {
  const t = Math.abs(e), n = (o, i) => `${(e < 0 ? -o : o).toFixed(o >= 100 ? 0 : o >= 10 ? 1 : 2)}${i}`;
  return t >= 1e9 ? n(t / 1e9, "B") : t >= 1e6 ? n(t / 1e6, "M") : t >= 1e3 ? n(t / 1e3, "K") : String(Math.round(e));
}
function tr(e, t, n) {
  const o = In(n.kind, n.style), { left: i, right: r, top: l, bottom: s, vp: a } = e, c = Math.max(1, r - i), f = Math.max(0, Math.min(100, o.percentWidth)) / 100 * c, h = o.placement === "right", u = (p) => {
    const y = t.priceToY(a.lo + (p + 1) * a.step) ?? l, m = t.priceToY(a.lo + p * a.step) ?? s;
    return { y: Math.min(y, m), h: Math.abs(m - y) };
  }, x = [];
  if (o.visible) {
    const p = o.volume === "delta" ? a.maxDelta : a.maxTotal, y = 11;
    a.rows.forEach((m, b) => {
      const g = u(b), w = b >= a.vaFrom && b <= a.vaTo, M = w ? o.vaUpColor : o.upColor, v = w ? o.vaDownColor : o.downColor, k = Math.max(1, g.h - 1), S = (A) => p > 0 ? A / p * f : 0, C = o.volume === "total" ? [{ w: S(m.up + m.down), color: M }] : o.volume === "delta" ? [{ w: S(Math.abs(m.up - m.down)), color: m.up >= m.down ? M : v }] : [{ w: S(m.up), color: M }, { w: S(m.down), color: v }];
      let I = 0;
      for (const A of C) {
        const z = h ? r - I - A.w : i + I;
        x.push({ t: "rect", x: z, y: g.y, w: A.w, h: k, fill: A.color }), I += A.w;
      }
      if (o.showValues && g.h >= y - 2) {
        const A = o.volume === "delta" ? m.up - m.down : m.up + m.down;
        x.push({
          t: "text",
          x: h ? r - I - 4 : i + I + 4,
          y: g.y + g.h / 2,
          text: Xc(A),
          size: y,
          fill: o.valuesColor,
          anchor: h ? "end" : "start",
          baseline: "central"
        });
      }
    });
  }
  const d = (p, y) => {
    const m = t.priceToY(p);
    m != null && x.push({ t: "line", a: { x: i, y: m }, b: { x: r, y: m }, stroke: y.color, strokeWidth: y.width, dash: ko(y.style) });
  };
  if (o.vah.visible && d(a.lo + (a.vaTo + 1) * a.step, o.vah), o.val.visible && d(a.lo + a.vaFrom * a.step, o.val), o.poc.visible && d(a.lo + (a.poc + 0.5) * a.step, o.poc), a.developing) {
    const p = (y, m) => {
      if (!m.visible) return;
      const b = [];
      for (const g of a.developing) {
        const w = t.timeToX(g.time), M = t.priceToY(y(g));
        w == null || M == null || (b.length && b.push({ x: w, y: b[b.length - 1].y }), b.push({ x: w, y: M }));
      }
      b.length > 1 && x.push({ t: "polyline", pts: b, fill: "none", stroke: m.color, strokeWidth: m.width, dash: ko(m.style) });
    };
    p((y) => y.poc, o.developingPoc), p((y) => y.vah, o.developingVah), p((y) => y.val, o.developingVal);
  }
  return [
    { t: "rect", x: i, y: l, w: c, h: Math.max(1, s - l), fill: o.boxColor },
    { t: "group", inert: !0, items: x }
  ];
}
function Gc(e, t, n, o) {
  const i = ri(e, t, o), r = i && o ? tr(i, o, e) : [];
  return n && r.push({ t: "anchors", pts: t }), r;
}
function jc(e, t, n, o) {
  const i = ii(e, t, o), r = i && o ? tr(i, o, e) : [];
  return n && r.push({ t: "anchors", pts: [t[0]] }), r;
}
const Lo = /* @__PURE__ */ new Map();
function qc(e, t) {
  let n = Lo.get(t);
  n || (n = new Intl.DateTimeFormat("en-US", {
    timeZone: t,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }), Lo.set(t, n));
  const o = n.formatToParts(new Date(e * 1e3)), i = (r) => {
    var l;
    return ((l = o.find((s) => s.type === r)) == null ? void 0 : l.value) ?? "";
  };
  return { y: Number(i("year")), m: Number(i("month")), d: Number(i("day")), wd: i("weekday"), hh: i("hour"), mi: i("minute"), ss: i("second") };
}
const Qe = (e, t) => String(e).padStart(t, "0");
function Zc(e, t) {
  const n = qc(e, t);
  return { date: `${Qe(n.y, 4)}-${Qe(n.m, 2)}-${Qe(n.d, 2)}`, time: `${n.hh}:${n.mi}` };
}
const Be = { href: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAkAAAAJCAQAAABKmM6bAAAAZ0lEQVR4Xl2OsQmAMBRErwgSsHAJV3GHgEVKl3ADixSClViKYPkHfEI+Wsg1j8dxnCQCiQ1jJRFcFIybHsNYCCJXvCSsJonzp/YXbiKzs7d8pavyEBP2yQEji5YV+1KIkmjI/ouRID31wXKLSuZPUAAAAABJRU5ErkJggg==", w: 9, h: 9 }, Kc = { href: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAsAAAAKCAQAAADI+WwIAAAAb0lEQVQIHWXAMQpBAQAG4L9eKQdQSr3JpFzC5CoOoJzBSUzK+iallNWkrG99pUymDxHw5Z+RdX4ZOpnmm57aXiuWunnScXAxTGLhqMyNth1muVNq1AYKK2wVeTBGo8JZP2/mgEk+KWxQ5ZfSUS8vV97kThm/FD/aAAAAAElFTkSuQmCC", w: 11, h: 10 }, Qc = { href: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAkAAAAJCAQAAABKmM6bAAAARElEQVR4AWMgHvy/9//5f34gzQZiQYSeAyEPkOYE0iAhMJOTAc4ixXjR/13/r/7////h/zn/pSFCT/43/lcHS6X9fwgANMArS3ikrioAAAAASUVORK5CYII=", w: 9, h: 9 };
function Je(e, t, n, o, i, r, l, s) {
  const a = l.fontSize ?? 12, c = 4, f = a / 3, h = Math.max(...i.map((d) => st(d, a))) + c * 2, u = a * i.length + f * 2, x = n === "bottom" ? t - o - u : n === "top" ? t + o : t - u / 2 + o;
  return {
    t: "group",
    inert: !0,
    items: [
      { t: "rect", x: e - h / 2, y: x, w: h, h: u, rx: 4, fill: r, stroke: s ?? "none", strokeWidth: s ? 1 : 0 },
      ...i.map((d, p) => ({
        t: "text",
        x: e,
        y: x + f + p * a + a / 2,
        text: d,
        anchor: "middle",
        baseline: "central",
        size: a,
        fill: l.textColor ?? "#ffffff"
      }))
    ]
  };
}
function So(e, t, n, o, i, r) {
  const l = Pn(e, t, r);
  if (!l) return [];
  const [s, a] = t, c = e.points[0].price, f = Math.min(s.x, a.x), h = Math.max(s.x, a.x), u = Math.max(8, h - f), x = (f + h) / 2, d = ct(i.stopColor ?? "#f23645").hex, p = ct(i.targetColor ?? "#089981").hex, y = i.stopTransparency ?? 80, m = i.targetTransparency ?? 80, b = Lt(p, 100 - m), g = Lt(d, 100 - y), { yStop: w, yTarget: M, stop: v, profit: k } = l, S = i.accountSize ?? 1e3, { qty: C, shown: I } = Ir(i, c, v), A = (fe) => parseFloat(fe.toFixed(2)), z = A(S + k * C), O = A(S - v * C), T = v > 0 ? Math.round(100 * k / v) / 100 : 0, E = o === "long" ? 1 : -1, P = Pr(e, o, c - E * v, c + E * k, r), B = P ? (P.closePrice - c) * E : null, F = (r == null ? void 0 : r.pipSize()) ?? 0.01, V = Math.max(0, Math.min(8, Math.round(-Math.log10(F)))), K = to(i, "tp", k, c, F, V, z, k * C), xt = to(i, "sl", v, c, F, V, O, -v * C), Vt = Ar(i, B != null ? mt(B, V) : null, !!(P != null && P.closed), I, T), vt = Vt ? Vt.split(`
`) : [], Ut = B != null && B < 0 ? d : B != null && B > 0 ? p : i.color, le = (fe) => {
    var Kn;
    const Zn = (Kn = ((r == null ? void 0 : r.bars()) ?? [])[fe]) == null ? void 0 : Kn.time;
    return Zn != null && r ? r.timeToX(Zn) : null;
  }, dt = P && r ? r.priceToY(P.closePrice) : null, ft = (P == null ? void 0 : P.entryIndex) != null ? le(P.entryIndex) : a.x, Rt = (P == null ? void 0 : P.closeIndex) != null ? le(P.closeIndex) : a.x, Ft = ft != null && Rt != null && dt != null && ft !== Rt ? { x: Math.min(ft, Rt), y: Math.min(s.y, dt), w: Math.abs(Rt - ft), h: Math.abs(dt - s.y) } : null, se = P ? le(P.closed ? P.closeIndex : P.barIndex) : null, Tt = (P == null ? void 0 : P.entryIndex) != null && ft != null && se != null && dt != null ? { from: { x: ft, y: s.y }, to: { x: se, y: dt } } : null, ke = n || !!i.showStats, Le = Math.max(
    0,
    st(K, i.fontSize ?? 12),
    st(xt, i.fontSize ?? 12),
    ...vt.map((fe) => st(fe, i.fontSize ?? 12))
  ) + 8, ce = h - f - Le - et <= 8, ae = ce ? et + 8 : 0, yr = ce ? (M < w ? 1 : -1) * (k > v ? -1 : 1) * (0.5 * ((i.fontSize ?? 12) * 2 + 2 * (i.fontSize ?? 12) / 3) + et + 8) : 0, yt = [
    { t: "rect", x: f, y: Math.min(M, w), w: u, h: Math.abs(M - w), fill: "transparent" },
    // profit + stop zones; the P&L zone from the actual entry to the actual
    // close (or the close point) between the entry and close prices, alpha
    // 1 − (transparency / 100)^3 (TV)
    { t: "rect", x: f, y: Math.min(s.y, w), w: u, h: Math.abs(w - s.y), fill: g }
  ];
  return Ft && B != null && B < 0 && yt.push({ t: "rect", ...Ft, fill: d, fillOpacity: 1 - (y / 100) ** 3 }), yt.push({ t: "rect", x: f, y: Math.min(s.y, M), w: u, h: Math.abs(M - s.y), fill: b }), Ft && B != null && B > 0 && yt.push({ t: "rect", ...Ft, fill: p, fillOpacity: 1 - (m / 100) ** 3 }), Tt && yt.push(
    { t: "line", a: Tt.from, b: Tt.to, stroke: i.color, strokeWidth: 1, dash: "6 4", inert: !0 },
    { t: "path", d: je(Tt.from, Tt.to, 1), fill: "none", stroke: i.color, strokeWidth: 1, inert: !0 }
  ), yt.push(
    { t: "line", a: { x: f, y: s.y }, b: { x: h, y: s.y }, stroke: i.color, strokeWidth: i.width },
    { t: "line", a: { x: f, y: M }, b: { x: h, y: M }, stroke: b, strokeWidth: i.width },
    { t: "line", a: { x: f, y: w }, b: { x: h, y: w }, stroke: g, strokeWidth: i.width }
  ), ke && (K && yt.push(Je(x, M, M < s.y ? "bottom" : "top", ae, [K], p, i)), vt.length > 0 && yt.push(Je(x, s.y, "middle", yr, vt, Ut, i, "#ffffff")), xt && yt.push(Je(x, w, w > s.y ? "top" : "bottom", ae, [xt], d, i))), n && yt.push({ t: "anchors", pts: l.anchors, squares: Yt.position }), yt;
}
const Jc = "#202020", Co = Be.w;
function To(e, t, n) {
  const o = D(e);
  if (o == null) return "";
  const i = (n == null ? void 0 : n.timeInfo()) ?? { timeZone: "UTC", intraday: !0 }, { date: r, time: l } = Zc(o, i.timeZone);
  return i.intraday ? `${r}${t}${l}` : r;
}
function Ao(e) {
  const t = (u) => st(u.text, u.size) + (u.clockThen ? Co + 2 * st(" ", u.size) + st(u.clockThen, u.size) : 0), n = Math.max(...e.rows.map(t)) + 12, o = e.height, i = Math.max(20, Math.min(n - 15, e.cx + n - e.paneW + 5)), r = e.cx - i, l = e.below ? e.y + 11 : e.y - 11 - o, s = e.below ? l : l + o, a = e.y + (e.below ? 3 : -3);
  let c = l + 4;
  const f = [
    { t: "rect", x: r, y: l, w: n, h: o, rx: 3, fill: e.bg, fillOpacity: e.opacity, stroke: e.stroke, strokeOpacity: e.opacity, strokeWidth: 2 },
    { t: "path", d: `M ${e.cx - 5} ${s} L ${e.cx} ${a} L ${e.cx + 5} ${s} Z`, fill: e.bg, fillOpacity: e.opacity },
    { t: "circle", cx: e.cx, cy: e.y, r: 3, fill: Jc }
  ];
  for (const u of e.rows) {
    const x = u.dy != null ? l + u.dy : c;
    if (c = x + u.size + 4, f.push({ t: "text", x: r + 6, y: x, text: u.text, size: u.size, fill: e.fg, baseline: "hanging" }), u.clockThen) {
      const d = r + 6 + st(u.text, u.size) + st(" ", u.size);
      f.push(
        { t: "image", href: Be.href, x: d, y: x + 1, w: Be.w, h: Be.h },
        { t: "text", x: d + Co + st(" ", u.size), y: x, text: u.clockThen, size: u.size, fill: e.fg, baseline: "hanging" }
      );
    }
  }
  const h = e.banner;
  if (h) {
    const x = h.above ? l - 18 - 2 : l + o + 2, d = ds(h.text, 14), p = r + Math.round((n - d) / 2), y = h.icon, m = h.above ? x + Math.abs(18 - y.h) / 2 : x + 8 - Math.abs(18 - y.h) / 2;
    f.push(
      { t: "rect", x: r - 1, y: x, w: n + 2, h: 18, rx: 5, fill: h.bg, fillOpacity: e.opacity },
      { t: "text", x: p, y: x + 3, text: h.text, size: 14, weight: "bold", fill: h.fg, baseline: "hanging" },
      { t: "image", href: y.href, x: p - y.w - 4, y: m, w: y.w, h: y.h }
    );
  }
  return { t: "group", inert: !0, items: f };
}
function ta(e, t, n, o, i, r) {
  if (e.kind !== "position-forecast") return [];
  const [l, s] = t, a = s.y <= l.y, c = ei(l, s), f = c[c.length - 2] ?? l, h = Math.hypot(s.x - f.x, s.y - f.y) || 1, u = (s.x - f.x) / h, x = (s.y - f.y) / h, d = Math.max(8, 4 * i.width), p = s.x - u * d, y = s.y - x * d, m = [s, { x: p - x * (d / 2), y: y + u * (d / 2) }, { x: p + x * (d / 2), y: y - u * (d / 2) }], b = e.points[1].price - e.points[0].price, g = e.points[0].price !== 0 ? b / Math.abs(e.points[0].price) * 100 : 0, w = D(e.points[0].time), M = D(e.points[1].time), v = w != null && M != null ? On(M - w) : "", k = (r == null ? void 0 : r.pipSize()) ?? 0.01, S = Math.max(0, Math.min(8, Math.round(-Math.log10(k)))), C = jr(e, r), I = Math.max(0, Math.min(1, (100 - (i.transparency ?? 10)) / 100)), A = [
    { t: "polyline", pts: c, fill: "none", stroke: "transparent", strokeWidth: 12 },
    { t: "polyline", pts: c, fill: "none", stroke: i.color, strokeWidth: i.width, join: "round" },
    { t: "polygon", pts: m, fill: i.color, stroke: i.color, strokeWidth: 1, join: "round" },
    // source balloon on the direction side; target balloon opposite
    Ao({
      cx: l.x,
      y: l.y,
      below: a,
      paneW: o,
      height: 32,
      rows: [
        { text: e.points[0].price.toFixed(S), size: 12, dy: 4 },
        { text: To(e.points[0].time, " ", r), size: 10, dy: 18 }
      ],
      bg: i.sourceBackColor ?? "#2962FF",
      stroke: i.sourceStrokeColor ?? "#2962FF",
      fg: i.sourceTextColor ?? "#ffffff",
      opacity: I
    }),
    Ao({
      cx: s.x,
      y: s.y,
      below: !a,
      paneW: o,
      height: 38,
      rows: [
        { text: `${mt(b, S)} (${mt(Math.round(g * 100) / 100, 2)}%)${v ? ` in ${v}` : ""}`, size: 14, dy: 5 },
        { text: e.points[1].price.toFixed(S), size: 11, dy: 22, clockThen: To(e.points[1].time, "  ", r) }
      ],
      bg: i.targetBackColor ?? "#2962FF",
      stroke: i.targetStrokeColor ?? "#2962FF",
      fg: i.targetTextColor ?? "#ffffff",
      opacity: I,
      banner: C === "waiting" ? void 0 : {
        text: C === "success" ? "SUCCESS" : "FAILURE",
        icon: C === "success" ? Kc : Qc,
        bg: C === "success" ? i.successBackground ?? "#4caf50" : i.failureBackground ?? "#F23645",
        fg: C === "success" ? i.successTextColor ?? "#ffffff" : i.failureTextColor ?? "#ffffff",
        above: a
      }
    })
  ];
  return n && A.push({ t: "anchors", pts: t }), A;
}
const er = { dx: 0, dy: 2, blur: 4, color: "rgba(0,0,0,0.4)" }, ea = { dx: 0, dy: 1, blur: 4, color: "rgba(0,0,0,0.4)" }, ve = (e) => Lt(ct(e).hex, 50);
function na(e, t, n, o) {
  const i = e.style, r = ki(e, t), l = gt(e).faint, s = Math.max(1, Math.round(Math.max((i.fontSize ?? 14) / 12, 1))), a = n ? "#2962ff" : o ? "rgba(41, 98, 255, 0.4)" : null, c = r.box, f = [
    {
      t: "rect",
      x: c.left,
      y: c.top,
      w: c.width,
      h: c.height,
      fill: i.fillBackground ? Lt(ct(i.backgroundColor ?? i.color).hex, 100 - (i.transparency ?? 75)) : "transparent"
    }
  ];
  if (i.drawBorder && f.push({ t: "rect", x: c.left - s / 2, y: c.top - s / 2, w: c.width + s, h: c.height + s, fill: "none", stroke: i.borderColor ?? "#707070", strokeWidth: s, inert: !0 }), f.push(U(r, l ? ve(i.color) : i.color, i.bold, i.italic)), a) {
    const h = i.drawBorder ? s : 0;
    f.push({
      t: "path",
      d: `M ${c.left - h - 2} ${c.top - h - 2} h ${c.width + 2 * h + 4} v ${c.height + 2 * h + 4} h ${-(c.width + 2 * h + 4)} Z M ${c.left - h} ${c.top - h} v ${c.height + 2 * h} h ${c.width + 2 * h} v ${-(c.height + 2 * h)} Z`,
      fill: a,
      fillRule: "evenodd",
      inert: !0
    });
  }
  return n && i.wordWrap && f.push({ t: "anchors", pts: [{ x: c.left + c.width, y: c.top + c.height / 2 }] }), f;
}
function oa(e, t, n, o) {
  const i = e.style, r = [{ t: "path", d: gl, transform: `translate(${t.x - 12} ${t.y - 30})`, fill: i.color, fillRule: "evenodd" }];
  if (!n) return r;
  const l = Si(e, t, o), s = gt(e).faint, a = i.textColor ?? "#dbdbdb", c = [];
  return i.fillBackground !== !1 && c.push({ t: "path", d: ho(l, t.x), fill: Lt(ct(i.backgroundColor ?? "#2e2e2e").hex, 100 - (i.transparency ?? 0)), shadow: er }), i.drawBorder && c.push({ t: "path", d: ho(l, t.x), fill: "none", stroke: i.borderColor ?? "#4a4a4a", strokeWidth: 1, inert: !0 }), l.lines.forEach((f, h) => {
    c.push({
      t: "text",
      x: l.left + 12,
      y: l.top + 12 + l.fs / 2 + h * (l.fs + 5),
      text: f,
      baseline: "central",
      size: l.fs,
      weight: i.bold ? 700 : 400,
      fontStyle: i.italic ? "italic" : "normal",
      fill: s ? ve(a) : a,
      pre: !0,
      inert: !0
    });
  }), r.push({ t: "group", items: c }, { t: "anchors", pts: [t] }), r;
}
function ia(e, t, n, o) {
  const [i, r] = t;
  if (!r) return [];
  const { txt: l, faint: s, fs: a, box: c } = vi(e, o, i, r), f = c.left, h = c.top, u = c.width, x = c.height, d = o.color ?? "#dbdbdb", p = [
    { t: "hit", a: i, b: r, width: L * 2 },
    { t: "line", a: i, b: r, stroke: d, strokeWidth: 1 },
    { t: "circle", cx: i.x, cy: i.y, r: 2, fill: d },
    { t: "circle", cx: i.x, cy: i.y, r: 2.5, fill: "none", stroke: "#1f1f1f", strokeWidth: 1 },
    {
      t: "rect",
      x: f,
      y: h,
      w: u,
      h: x,
      rx: 4,
      fill: o.fillBackground === !1 ? "transparent" : o.backgroundColor ?? "#2e2e2e",
      stroke: o.drawBorder ? o.borderColor ?? "#4a4a4a" : void 0,
      strokeWidth: o.drawBorder ? 1 : void 0,
      shadow: o.fillBackground === !1 && !o.drawBorder ? void 0 : er
    },
    {
      t: "text",
      x: f + 8,
      y: h + x / 2,
      text: l,
      size: a,
      weight: o.bold ? 700 : 400,
      fontStyle: o.italic ? "italic" : "normal",
      fill: o.textColor ?? "#dbdbdb",
      baseline: "central",
      opacity: s ? 0.6 : 1
    }
  ];
  return n && p.push({ t: "anchors", pts: t }), p;
}
function ra(e, t, n, o) {
  const [i] = t, { l: r, r: l } = Li(e, i), s = gt(e).faint, a = o.textColor ?? "#ffffff", c = r.box, f = [
    {
      t: "path",
      d: bl(c.left, c.top, c.width, c.height, [l, l, l, 2]),
      fill: Lt(ct(o.backgroundColor ?? o.color).hex, 100 - (o.transparency ?? 0)),
      stroke: o.borderColor ?? o.color,
      strokeWidth: 2
    },
    U(r, s ? ve(a) : a)
  ];
  return n && f.push({ t: "anchors", pts: t }), f;
}
function la(e, t, n, o, i) {
  const r = n ? Rn(e, t, n, o) : null;
  if (!r) return [];
  const l = [{ t: "line", a: { x: r.x, y: r.poleStart }, b: { x: r.x, y: r.poleEnd }, stroke: Ot.pole, strokeWidth: 1 }];
  r.gap && l.push({ t: "line", a: { x: r.x, y: r.gap[0] }, b: { x: r.x, y: r.gap[1] }, stroke: Ot.pole, strokeWidth: 1 }), e.style.showImage && l.push(
    { t: "circle", cx: r.x, cy: r.plateY, r: 35, fill: e.style.plateColor ?? "#2962ff", stroke: Ot.plateBorder, strokeWidth: 1, shadow: ea },
    { t: "text", x: r.x, y: r.plateY, text: e.glyph || "🙂", anchor: "middle", baseline: "central", size: 32, inert: !0 }
  );
  const s = r.l.box;
  return l.push(
    { t: "rect", x: s.left, y: s.top, w: s.width, h: s.height, rx: 4, fill: Ot.labelBg, stroke: Ot.labelBorder, strokeWidth: 1 },
    U(r.l, gt(e).faint ? ve(Ot.labelText) : Ot.labelText, e.style.bold, e.style.italic)
  ), i && l.push({ t: "anchors", pts: [r.anchor], squares: Yt.single }), l;
}
function sa(e, t, n, o, i) {
  const [r, l] = t, s = (i == null ? void 0 : i.pipSize()) ?? 0.01, a = Math.max(0, Math.min(8, Math.round(-Math.log10(s)))), c = jo(e, t, a), f = (() => {
    if (!e.text) return null;
    const d = r.x < l.x ? r : l, p = d === r ? l : r, y = o.horzLabelsAlign ?? "center", m = y === "left" ? d : y === "right" ? p : { x: (r.x + l.x) / 2, y: (r.y + l.y) / 2 }, b = Math.atan((p.y - d.y) / (p.x - d.x));
    return G({ x: m.x, y: m.y, text: e.text, fs: o.fontSize ?? 14, bold: o.bold, italic: o.italic, vert: o.vertLabelsAlign ?? "bottom", horz: y, angle: Number.isNaN(b) ? 0 : b });
  })(), h = f && (o.vertLabelsAlign ?? "bottom") === "middle" ? f.poly : null, u = h && h.length ? "text" : void 0, x = [{ t: "hit", a: r, b: l, width: 12 }];
  if (f && x.push(U(f, o.textColor ?? "#2962ff", o.bold, o.italic)), x.push({ t: "circle", cx: r.x, cy: r.y, r: 2, fill: o.color }), u && x.push({ t: "clip", name: u, polys: [h] }), x.push({ t: "line", a: r, b: l, stroke: o.color, strokeWidth: 1, cap: "round", clip: u }), c) {
    const d = c.box;
    x.push(
      { t: "rect", x: d.left, y: d.top, w: d.width, h: d.height, rx: 4, fill: o.priceLabelBackgroundColor ?? "#2962ff", stroke: o.priceLabelBorderColor ?? "#2962ff", strokeWidth: 1 },
      U(c, o.priceLabelTextColor ?? "#ffffff", o.priceLabelBold, o.priceLabelItalic)
    );
  }
  return x.push({ t: "circle", cx: r.x, cy: r.y, r: 2.5, fill: "none", stroke: "#0f0f0f", strokeWidth: 1, inert: !0 }), n && x.push({ t: "anchors", pts: t }), x;
}
function ca(e, t, n, o) {
  const [i, r] = t, l = Ti(e, r), s = gt(e).faint, a = o.textColor ?? "#ffffff", c = [{
    t: "path",
    d: Ml(l, i, r),
    fill: Lt(ct(o.backgroundColor ?? o.color).hex, 100 - (o.transparency ?? 50)),
    stroke: o.borderColor ?? o.color,
    strokeWidth: o.width,
    join: "round"
  }];
  return l.lines.forEach((f, h) => {
    c.push({
      t: "text",
      x: l.x + 10,
      y: l.y + 10 + h * l.fs + l.fs / 2,
      text: f,
      baseline: "central",
      size: l.fs,
      weight: o.bold ? 700 : 400,
      fontStyle: o.italic ? "italic" : "normal",
      fill: s ? ve(a) : a,
      pre: !0
    });
  }), n && c.push({ t: "anchors", pts: l.wrap != null ? [i, { x: r.x + l.wrap / 2 + 10, y: r.y }] : [i] }), c;
}
function aa(e, t, n, o) {
  const i = zn(e, t), r = e.style, l = i.right - i.left, s = i.bottom - i.top;
  let a = "";
  for (const d of i.ys) a += `M${i.left} ${d}h${l}v${ht}h${-l}Z`;
  for (const d of i.xs) a += `M${d} ${i.top}h${ht}v${s}h${-ht}Z`;
  let c = "";
  if (o != null && o.cell && o.cell[0] < i.ys.length - 1 && o.cell[1] < i.xs.length - 1) {
    const [d, p] = o.cell, y = i.xs[p], m = i.xs[p + 1], b = i.ys[d], g = i.ys[d + 1], w = ht, M = Qr;
    c = [
      [y + w, b + w, m - y - w, M],
      [y + w, g - M, m - y - w, M],
      [y + w, b + w, M, g - b - w],
      [m - M, b + w, M, g - b - w]
    ].map(([k, S, C, I]) => `M${k} ${S}h${C}v${I}h${-C}Z`).join("");
  }
  let f = "";
  o != null && o.edge && (o.edge.col != null && i.xs[o.edge.col + 1] != null && (f += `M${i.xs[o.edge.col + 1] - 3} ${i.top}h7v${i.bottom - i.top}h-7Z`), o.edge.row != null && i.ys[o.edge.row + 1] != null && (f += `M${i.left} ${i.ys[o.edge.row + 1] - 3}h${i.right - i.left}v7h${-(i.right - i.left)}Z`));
  const h = r.horzLabelsAlign ?? "left", u = [];
  i.cells.forEach((d, p) => {
    d.forEach((y, m) => {
      var k;
      const b = o != null && o.editing && o.cell && o.cell[0] === p && o.cell[1] === m ? [] : ((k = i.lines[p]) == null ? void 0 : k[m]) ?? [], g = i.xs[m], w = i.xs[m + 1], M = h === "right" ? w - ht - Ht : h === "center" ? g + (w - g) / 2 : g + ht + Ht, v = i.ys[p] + ht + Ht + i.fs / 2 + 0.05 * i.fs;
      b.forEach((S, C) => {
        u.push({
          t: "text",
          x: M,
          y: v + C * i.fs * fi,
          text: S,
          anchor: h === "right" ? "end" : h === "center" ? "middle" : "start",
          baseline: "central",
          size: i.fs,
          fill: r.textColor ?? "#dbdbdb",
          pre: !0
        });
      });
    });
  });
  const x = [
    // hit surface reaching the edge tolerance past the right / bottom edges
    { t: "rect", x: i.left - 3, y: i.top - 3, w: l + 7, h: s + 7, fill: "transparent" },
    { t: "rect", x: i.left, y: i.top, w: l, h: s, fill: r.backgroundColor ?? "#0f0f0f" },
    { t: "path", d: a, fill: r.color, crisp: !0 }
  ];
  return c && x.push({ t: "path", d: c, fill: Jr, crisp: !0 }), x.push({ t: "group", inert: !0, items: u }), f && x.push({ t: "path", d: f, fill: tl, inert: !0 }), n && x.push({ t: "anchors", pts: mi(i) }), x;
}
function fa(e, t, n) {
  var r, l;
  const o = wi(e, t);
  if (!o) return [];
  const i = [{
    t: "image",
    href: ((l = Wn((r = e.image) == null ? void 0 : r.name)) == null ? void 0 : l.url) ?? "",
    x: o.left,
    y: o.top,
    w: o.right - o.left,
    h: o.bottom - o.top,
    stretch: !0,
    opacity: (100 - (e.style.transparency ?? 0)) / 100
  }];
  return n && i.push({ t: "anchors", pts: Mi(o) }), i;
}
function tn(e, t, n) {
  const { w: o, h: i, coords: r, selected: l } = n, s = !!n.hovered, a = l || s, c = e.style;
  switch (e.kind) {
    case "horizontal-line":
      return Ms(t, l, o, c);
    case "vertical-line":
      return vs(t, l, i, c);
    case "cross-line":
      return ks(t, l, o, i, c);
    case "trend-line":
      return c.extendLeft || c.extendRight ? Te(e, t, l, o, i, c, !!c.extendLeft, !!c.extendRight, r, a) : yo(e, t, l, o, i, c, r, a);
    case "horizontal-ray":
      return Ls(t, l, o, c);
    case "ray":
      return Te(e, t, l, o, i, c, c.extendLeft ?? !1, c.extendRight ?? !0, r, a);
    case "extended-line":
      return Te(e, t, l, o, i, c, c.extendLeft ?? !0, c.extendRight ?? !0, r, a);
    case "info-line":
      return Ss(e, t, l, o, i, c, r, a);
    case "trend-angle":
      return Cs(e, t, l, o, i, c, r, a);
    case "arrow": {
      const f = { ...c, leftEnd: c.leftEnd ?? 0, rightEnd: c.rightEnd ?? 1 };
      return f.extendLeft || f.extendRight ? Te(e, t, l, o, i, f, !!f.extendLeft, !!f.extendRight, r, a) : yo(e, t, l, o, i, f, r, a);
    }
    case "long-position":
      return So(e, t, l, "long", c, r);
    case "short-position":
      return So(e, t, l, "short", c, r);
    case "position-forecast":
      return ta(e, t, l, o, c, r);
    case "parallel-channel":
      return Bs(t, l, c, o, i);
    case "disjoint-channel":
      return Is(e, t, l, c, o, i, r);
    case "flat-top-bottom":
      return Ps(e, t, l, c, o, i, r);
    case "fib-retracement":
      return Es(e, t, l, o, c, r);
    case "trend-based-fib-extension":
      return zs(e, t, l, o, c, r);
    case "fib-channel":
      return Ws(e, t, l, c, r, o, i);
    case "trend-based-fib-time":
      return Rs(e, t, l, i, c, r);
    case "fib-time-zone":
      return Fs(t, l, i, c);
    case "fib-circles":
      return Ds(e, t, l, c);
    case "fib-speed-resistance-fan":
      return _s(e, t, l, o, i, c, r);
    case "fib-speed-resistance-arcs":
      return Hs(t, l, c);
    case "fib-spiral":
      return Ns(t, l, o, i, c);
    case "fib-wedge":
      return Ys(t, l, c);
    case "pitchfan":
      return Vs(t, l, o, c);
    case "pitchfork":
    case "schiff-pitchfork":
    case "modified-schiff-pitchfork":
    case "inside-pitchfork":
      return js(e.kind, t, l, o, c);
    case "gann-fan":
      return Xs(t, l, o, i, c);
    case "gann-box":
      return Gs(e, t, l, c, r);
    case "gann-square-fixed":
    case "gann-square":
      return Us(e, t, l, c, r);
    case "rectangle":
      return Ks(e, t, l, o, c, s);
    case "rotated-rectangle":
      return Qs(e, t, l, c);
    case "circle":
      return Js(e, t, l, c, s);
    case "ellipse":
      return tc(e, t, l, c, s);
    case "triangle":
      return ec(t, l, c, s);
    case "arc":
      return nc(t, l, c);
    case "curve":
      return oc(t, l, c);
    case "double-curve":
      return ic(t, l, c);
    case "sector":
      return rc(t, l, c);
    case "cyclic-lines":
      return lc(t, l, o, i, c);
    case "sine-line":
      return sc(t, l, o, c);
    case "time-cycles":
      return cc(t, l, o, c);
    case "abcd-pattern":
    case "xabcd-pattern":
    case "cypher-pattern":
    case "head-and-shoulders":
    case "triangle-pattern":
    case "three-drives-pattern":
    case "elliott-impulse":
    case "elliott-correction":
    case "elliott-triangle":
    case "elliott-double-combo":
    case "elliott-triple-combo":
    case "polyline":
    case "path":
    case "brush":
    case "highlighter":
      return wc(e, t, l, c);
    case "arrow-marker":
      return vc(t, l, c);
    case "arrow-mark-up":
      return go(e, t, l, c, "up");
    case "arrow-mark-down":
      return go(e, t, l, c, "down");
    case "flag-mark":
      return Sc(t, l, c);
    case "price-label":
      return Cc(e, t, l, c, r);
    case "font-icon":
      return Ac(e, t, l);
    case "bar-pattern":
      return Pc(e, t, l, c, r);
    case "ghost-feed":
      return Ec(e, t, l, c, r);
    case "price-range":
      return Hc(e, t, l, o, i, c, r);
    case "date-range":
      return Nc(e, t, l, i, c, r);
    case "date-and-price-range":
      return Yc(e, t, l, i, c, r);
    case "regression-trend":
      return Vc(e, t, l, o, c, r);
    case "anchored-vwap":
      return Uc(e, t, l, o, c, r);
    case "fixed-range-volume-profile":
      return Gc(e, t, l, r);
    case "anchored-volume-profile":
      return jc(e, t, l, r);
    case "text":
      return na(e, t[0], n.textSelected ?? l, s);
    case "pin":
      return oa(e, t[0], l, o);
    case "note":
      return ia(e, t, l, c);
    case "comment":
      return ra(e, t, l, c);
    case "price-note":
      return sa(e, t, l, c, r);
    case "signpost":
      return la(e, t[0], r, i, l);
    case "callout":
      return ca(e, t, l, c);
    case "table":
      return aa(e, t[0], l, n.tableUi ?? null);
    case "image":
      return fa(e, t[0], l);
  }
  return [];
}
function ha(e, t) {
  return e.map((n) => ({
    t: "group",
    inert: !0,
    items: [
      { t: "circle", cx: n.x, cy: n.y, r: et + 3, fill: "#fff", stroke: t, strokeWidth: 1.5 },
      // padlock: shackle arc over a filled body
      { t: "path", d: `M ${n.x - 2} ${n.y - 0.5} v -1.5 a 2 2 0 0 1 4 0 v 1.5`, fill: "none", stroke: t, strokeWidth: 1.2 },
      { t: "rect", x: n.x - 3.2, y: n.y - 0.5, w: 6.4, h: 4.6, rx: 1, fill: t }
    ]
  }));
}
function ua(e) {
  if (!Array.isArray(e)) return [];
  const t = [];
  for (const n of e)
    !n || typeof n != "object" || typeof n.id != "string" || typeof n.kind != "string" || !Array.isArray(n.points) || n.points.length === 0 || !n.points.every(
      (i) => i != null && typeof i == "object" && "time" in i && "price" in i && typeof i.price == "number"
    ) || ((!n.style || typeof n.style != "object") && (n.style = { ...vn }), t.push(xa(n)));
  return t;
}
function xa(e) {
  const t = e.points, n = t.length, o = (i) => ({ ...i });
  switch (e.kind) {
    case "polyline":
      return e.closed === void 0 ? { ...e, closed: !0 } : e;
    case "fib-speed-resistance-fan": {
      const i = e.style.levels;
      if (!i) return e;
      const r = (s) => i.some((a) => a.coeff === s);
      if (r(0) && r(1)) return e;
      const l = [
        ...r(0) ? [] : [{ coeff: 0, color: "#808080", visible: !0 }],
        ...i,
        ...r(1) ? [] : [{ coeff: 1, color: "#808080", visible: !0 }]
      ];
      return { ...e, style: { ...e.style, levels: l } };
    }
    case "parallel-channel": {
      if (e.style.levels) return e;
      const i = e.style, { middleLine: r, ...l } = i, s = He.map((a) => ({
        ...a,
        color: i.color,
        ...a.coeff === 0 || a.coeff === 1 ? { width: i.width, style: i.lineStyle ?? "solid" } : {},
        ...a.coeff === 0.5 ? { visible: r !== !1 } : {}
      }));
      return { ...e, style: { ...l, levels: s } };
    }
    case "fib-wedge":
    case "pitchfan":
      if (n === 2) {
        const i = { time: t[1].time, price: 2 * t[0].price - t[1].price };
        return { ...e, points: [t[0], t[1], i] };
      }
      return e;
    case "ellipse":
      if (n === 2) {
        const i = (t[0].price + t[1].price) / 2, r = Number(t[0].time), l = Number(t[1].time), s = Number.isFinite(r) && Number.isFinite(l) ? (r + l) / 2 : Number(t[0].time);
        return {
          ...e,
          points: [
            { time: t[0].time, price: i },
            { time: t[1].time, price: i },
            { time: s, price: t[1].price }
          ]
        };
      }
      return e;
    case "price-note":
      return n === 1 ? { ...e, points: [t[0], o(t[0])] } : e;
    case "head-and-shoulders":
      return n === 5 ? { ...e, points: [o(t[0]), ...t, o(t[4])] } : e;
    case "elliott-impulse":
    case "elliott-triangle":
    case "elliott-triple-combo":
      return n === 5 ? { ...e, points: [o(t[0]), ...t] } : e;
    case "elliott-correction":
    case "elliott-double-combo":
      return n === 3 ? { ...e, points: [o(t[0]), ...t] } : e;
    case "note":
      return n === 1 ? { ...e, kind: "pin", points: [t[0]] } : e;
    case "anchored-volume-profile":
      return n > 1 ? { ...e, points: [t[0]] } : e;
    case "anchored-vwap":
      return e.style.fillBackground === void 0 ? { ...e, style: { ...e.style, fillBackground: !1 } } : e;
    // Point-MEANING migrations (11/07/2026), marked with fmt: 2 since the
    // count doesn't change and would re-migrate on every load otherwise.
    case "circle":
      if (e.fmt !== 2 && n === 2) {
        const i = Number(t[0].time), r = Number(t[1].time), s = { time: Number.isFinite(i) && Number.isFinite(r) ? (i + r) / 2 : t[0].time, price: (t[0].price + t[1].price) / 2 };
        return { ...e, fmt: 2, points: [s, o(t[1])] };
      }
      return e;
    case "arc":
      return e.fmt !== 2 && n === 3 ? { ...e, fmt: 2, points: [t[0], t[2], t[1]] } : e;
    default:
      return e;
  }
}
const da = 3, nr = 5, ya = 2, pa = 50;
function ye(e, t, n) {
  return t.anchored ? [{ x: t.anchored.x * n.w, y: t.anchored.y * n.h }] : or(e, t.points);
}
function mn(e, t, n, o, i, r) {
  if (t.anchored && r && r.w > 0 && r.h > 0)
    return { ...t, anchored: { x: (n[0].x + o) / r.w, y: (n[0].y + i) / r.h } };
  const l = [];
  for (const s of n) {
    const a = _(e, { x: s.x + o, y: s.y + i });
    if (!a) return null;
    l.push(a);
  }
  return ma(e, t.points, l) ? Y(t, l.map((s, a) => {
    var c;
    return { time: ((c = t.points[a]) == null ? void 0 : c.time) ?? s.time, price: s.price };
  })) : Y(t, l);
}
function ma(e, t, n) {
  if (t.length !== n.length) return !1;
  for (let o = 0; o < t.length; o++) {
    if (t[o].time === n[o].time) continue;
    const i = e.timeToBarIndex(t[o].time), r = e.timeToBarIndex(n[o].time);
    if (i == null || r == null || i !== r) return !1;
  }
  return !0;
}
function Q(e, t) {
  const n = e.timeToX(t.time), o = e.priceToY(t.price);
  return n == null || o == null ? null : { x: n, y: o };
}
function or(e, t) {
  const n = [];
  for (const o of t) {
    const i = Q(e, o);
    if (!i) return null;
    n.push(i);
  }
  return n;
}
function _(e, t) {
  const n = e.xToTime(t.x), o = e.yToPrice(t.y);
  return n == null || o == null ? null : { time: n, price: o };
}
function $o(e, t, n, o, i = !0) {
  const r = t.barAt(e.time);
  if (!r) return null;
  const l = i ? [r.open, r.high, r.low, r.close] : [];
  if (l.length === 0) return null;
  const s = t.priceToY(e.price);
  let a = l[0], c = 1 / 0;
  for (const f of l) {
    const h = t.priceToY(f), u = s != null && h != null ? Math.abs(h - s) : Math.abs(e.price - f);
    u < c && (c = u, a = f);
  }
  return n === "weak" && s != null && c >= pa ? null : { time: e.time, price: a };
}
function Y(e, t) {
  switch (e.kind) {
    case "horizontal-line":
    case "horizontal-ray":
    case "vertical-line":
    case "cross-line":
    case "arrow-mark-up":
    case "arrow-mark-down":
    case "price-label":
    case "flag-mark":
    case "text":
    case "pin":
    case "comment":
    case "signpost":
    case "font-icon":
    case "table":
    case "image":
    case "anchored-vwap":
      return { ...e, points: [t[0]] };
    case "price-note":
    case "note":
      return { ...e, points: [t[0], t[1]] };
    case "arrow-marker":
    case "trend-line":
    case "ray":
    case "extended-line":
    case "info-line":
    case "trend-angle":
    case "long-position":
    case "short-position":
    case "gann-fan":
    case "gann-box":
    case "gann-square-fixed":
    case "gann-square":
    case "fib-time-zone":
    case "fib-circles":
    case "fib-speed-resistance-fan":
    case "fib-speed-resistance-arcs":
    case "fib-spiral":
    case "cyclic-lines":
    case "sine-line":
    case "time-cycles":
    case "arrow":
    case "rectangle":
    case "circle":
    case "fib-retracement":
    case "price-range":
    case "date-range":
    case "date-and-price-range":
    case "position-forecast":
    case "bar-pattern":
    case "callout":
    case "regression-trend":
    case "fixed-range-volume-profile":
      return { ...e, points: [t[0], t[1]] };
    case "anchored-volume-profile":
      return { ...e, points: [t[0]] };
    case "triangle":
    case "parallel-channel":
    case "pitchfork":
    case "schiff-pitchfork":
    case "modified-schiff-pitchfork":
    case "inside-pitchfork":
    case "trend-based-fib-extension":
    case "trend-based-fib-time":
    case "sector":
    case "disjoint-channel":
    case "flat-top-bottom":
    case "fib-channel":
    case "rotated-rectangle":
    case "curve":
    case "fib-wedge":
    case "pitchfan":
    case "ellipse":
    case "arc":
      return { ...e, points: [t[0], t[1], t[2]] };
    case "double-curve":
      return { ...e, points: [t[0], t[1], t[2], t[3]] };
    case "abcd-pattern":
    case "xabcd-pattern":
    case "cypher-pattern":
    case "head-and-shoulders":
    case "triangle-pattern":
    case "three-drives-pattern":
    case "elliott-impulse":
    case "elliott-correction":
    case "elliott-triangle":
    case "elliott-double-combo":
    case "elliott-triple-combo":
    case "polyline":
    case "path":
    case "brush":
    case "highlighter":
    case "ghost-feed":
      return { ...e, points: t };
  }
}
function ir(e, t) {
  return Math.atan2(-(t.y - e.y), t.x - e.x) * 180 / Math.PI;
}
const ba = /* @__PURE__ */ new Set([
  "abcd-pattern",
  "xabcd-pattern",
  "cypher-pattern",
  "head-and-shoulders",
  "triangle-pattern",
  "three-drives-pattern",
  "elliott-impulse",
  "elliott-correction",
  "elliott-triangle",
  "elliott-double-combo",
  "elliott-triple-combo"
]);
function bn(e, t) {
  switch (e) {
    case "horizontal-line":
    case "horizontal-ray":
    case "vertical-line":
    case "cross-line":
    case "arrow-mark-up":
    case "arrow-mark-down":
    case "price-label":
    case "flag-mark":
    case "text":
    case "pin":
    case "comment":
    case "signpost":
    case "font-icon":
    case "table":
    case "image":
    case "anchored-vwap":
      return { kind: e, points: [t[0]] };
    case "price-note":
      return { kind: e, points: [t[0], t[1]] };
    case "note":
      return { kind: e, points: [t[0], t[1]] };
    case "long-position":
    case "short-position":
      return { kind: e, points: [t[0], { ...t[0] }] };
    case "parallel-channel": {
      const [n, o, i] = t, r = Number(n.time), l = Number(o.time), s = Number(i.time);
      if (Number.isFinite(r) && Number.isFinite(l) && Number.isFinite(s) && l !== r) {
        const a = (s - r) / (l - r), c = i.price - (n.price + (o.price - n.price) * a);
        return { kind: e, points: [n, o, { time: n.time, price: n.price + c }] };
      }
      return { kind: e, points: [n, o, i] };
    }
    case "arrow-marker":
    case "trend-line":
    case "ray":
    case "extended-line":
    case "info-line":
    case "trend-angle":
    case "gann-fan":
    case "gann-box":
    case "gann-square-fixed":
    case "gann-square":
    case "fib-time-zone":
    case "fib-speed-resistance-fan":
    case "fib-speed-resistance-arcs":
    case "fib-spiral":
    case "cyclic-lines":
    case "sine-line":
    case "time-cycles":
    case "arrow":
    case "rectangle":
    case "fib-retracement":
    case "price-range":
    case "date-range":
    case "date-and-price-range":
    case "position-forecast":
    case "bar-pattern":
    case "callout":
    case "regression-trend":
    case "fixed-range-volume-profile":
      return { kind: e, points: [t[0], t[1]] };
    case "anchored-volume-profile":
      return { kind: e, points: [t[0]] };
    case "circle":
      return { kind: e, points: [t[0], t[1]], fmt: 2 };
    case "arc":
      return { kind: e, points: [t[0], t[1], t[2]], fmt: 2 };
    case "fib-circles":
      return { kind: e, points: [t[0], t[1]], fmt: 2 };
    case "rotated-rectangle":
      return { kind: e, points: [t[0], t[1], t[2]], fmt: 2 };
    case "triangle":
    case "pitchfork":
    case "schiff-pitchfork":
    case "modified-schiff-pitchfork":
    case "inside-pitchfork":
    case "trend-based-fib-extension":
    case "trend-based-fib-time":
    case "sector":
    // Disjoint channel keeps the raw 3rd click (TV stores it as clicked; the
    // mirror geometry reads only its price) — not the parallel-channel re-anchor.
    case "disjoint-channel":
    case "flat-top-bottom":
    case "fib-channel":
    case "fib-wedge":
    case "pitchfan":
    case "ellipse":
      return { kind: e, points: [t[0], t[1], t[2]] };
    case "curve": {
      const n = { time: (Number(t[0].time) + Number(t[1].time)) / 2, price: (t[0].price + t[1].price) / 2 };
      return { kind: e, points: [t[0], n, t[1]] };
    }
    case "double-curve": {
      const n = Number(t[0].time), o = Number(t[1].time), i = { time: n + (o - n) / 3, price: t[0].price + (t[1].price - t[0].price) / 3 }, r = { time: n + (o - n) * 2 / 3, price: t[0].price + (t[1].price - t[0].price) * 2 / 3 };
      return { kind: e, points: [t[0], i, r, t[1]] };
    }
    case "abcd-pattern":
    case "xabcd-pattern":
    case "cypher-pattern":
    case "head-and-shoulders":
    case "triangle-pattern":
    case "three-drives-pattern":
    case "elliott-impulse":
    case "elliott-correction":
    case "elliott-triangle":
    case "elliott-double-combo":
    case "elliott-triple-combo":
    case "polyline":
    case "path":
    case "brush":
    case "highlighter":
    case "ghost-feed":
      return { kind: e, points: t.slice() };
  }
  return null;
}
function ga(e, t, n, o, i) {
  const r = e.points[0], l = n.pipSize(), s = n.yToPrice(0), a = n.yToPrice(Math.max(1, i)), c = s != null && a != null ? Math.abs(s - a) : 0, f = Math.max(l, Math.round((c || l * 500) * 0.2 / l) * l), h = n.bars(), u = n.timeToBarIndex(r.time) ?? h.length, x = n.barIndexToTime(u), d = n.barIndexToTime(u + 1), p = x != null ? n.timeToX(x) : null, y = d != null ? n.timeToX(d) : null, m = p != null && y != null ? Math.abs(y - p) : 0, b = m > 0 ? Math.round(o / m) : 0, g = u + Math.max(3, Math.round(0.15 * b)), w = n.barIndexToTime(g) ?? r.time, M = { ...Kt(t), stopLevel: f, profitLevel: f };
  return {
    ...e,
    points: [r, { time: w, price: r.price }],
    style: M
  };
}
function wa(e, t, n) {
  const o = e.points[1];
  if (!o) return e;
  const i = D(e.points[0].time), r = D(o.time);
  if (i == null || r == null) return e;
  const l = Ue(t.bars(), Math.min(i, r), Math.max(i, r));
  if (l.length === 0) return e;
  const s = l[0], a = l[l.length - 1], c = t.priceToY(s.high), f = c != null ? t.yToPrice(c - 0.05 * n) ?? s.high : s.high, h = f + (a.low - s.high);
  return {
    ...e,
    points: [
      { time: s.time, price: f },
      { time: a.time, price: h }
    ],
    pattern: {
      base: s.open,
      bars: l.map((u) => [u.open, u.high, u.low, u.close])
    }
  };
}
function Ma(e, t) {
  const n = t.bars(), o = t.pipSize(), i = n.length > 0 ? n.reduce((l, s) => l + (s.high - s.low), 0) / n.length : 0, r = i > 0 ? Math.max(1, Math.round(i / o)) * o : Math.abs(e.points[0].price) * 0.01 || 1;
  return {
    ...e,
    ghost: { seed: Math.floor(Math.random() * 2147483647), amplitude: r }
  };
}
function va(e, t) {
  const n = e.points[0], o = e.points[e.points.length - 1];
  if (!n || !o) return e;
  const i = Q(t, n), r = Q(t, o);
  if (!i || !r) return e;
  const l = r.x - i.x, s = r.y - i.y, a = Math.hypot(l, s) || 1, c = -s / a * a * 0.15, f = l / a * a * 0.15, h = (u) => _(t, { x: i.x + l * u + c, y: i.y + s * u + f });
  if (e.kind === "curve") {
    const u = h(0.5);
    return u ? { ...e, points: [e.points[0], u, e.points[2]] } : e;
  }
  if (e.kind === "double-curve") {
    const u = h(0.3333333333333333), x = h(2 / 3);
    return !u || !x ? e : { ...e, points: [e.points[0], u, x, e.points[3]] };
  }
  return e;
}
function ka(e, t) {
  const n = Q(t, e.points[0]), o = e.points[1] ? Q(t, e.points[1]) : null;
  return !n || !o ? e : {
    ...e,
    style: { ...e.style ?? Kt("trend-angle"), angle: ir(n, o) }
  };
}
function rr(e, t) {
  const [n, o] = e.points;
  if (!n || !o || t.isLog()) return e;
  const i = t.timeToBarIndex(n.time), r = t.timeToBarIndex(o.time);
  if (i == null || r == null) return e;
  const l = t.priceToY(n.price), s = t.priceToY(n.price + 1), a = t.barIndexToTime(i), c = t.barIndexToTime(i + 1), f = a != null ? t.timeToX(a) : null, h = c != null ? t.timeToX(c) : null;
  if (l == null || s == null || f == null || h == null || l === s) return e;
  const u = Math.abs(h - f) / Math.abs(s - l), x = o.price - n.price >= 0 ? 1 : -1;
  return { ...e, points: [n, { ...o, price: n.price + x * Math.abs(r - i) * u }] };
}
function Bo(e, t, n, o, i = {}) {
  let r = bn(e, t);
  return r ? ((e === "long-position" || e === "short-position") && n && (r = ga(r, e, n, o.w, o.h)), (e === "curve" || e === "double-curve") && n && (r = va(r, n)), e === "gann-square" && n && (r = rr(r, n)), e === "bar-pattern" && n && (r = wa(r, n, Math.max(1, o.h))), e === "trend-angle" && n && (r = ka(r, n)), e === "polyline" && i.closed !== void 0 && (r = { ...r, closed: i.closed }), e === "ghost-feed" && n && (r = Ma(r, n)), e === "font-icon" && (r = { ...r, glyph: i.glyph }), r) : null;
}
const lr = /* @__PURE__ */ new Set([
  "trend-line",
  "ray",
  "extended-line",
  "info-line",
  "arrow",
  "trend-angle",
  "arrow-marker",
  "circle",
  "fib-circles",
  "fib-speed-resistance-fan",
  "price-note",
  "note",
  "rotated-rectangle"
]), La = /* @__PURE__ */ new Set(["parallel-channel", "flat-top-bottom", "disjoint-channel"]);
function Ie(e, t) {
  const n = e.barIndexToTime(t), o = n == null ? null : e.timeToX(n);
  return n == null || o == null ? null : { i: t, time: n, x: o };
}
function De(e, t) {
  const n = e.xToTime(t), o = n == null ? null : e.timeToBarIndex(n);
  return o == null ? null : Ie(e, o);
}
function ee(e, t, n) {
  const o = e.timeToX(n.time), i = e.timeToX(t.time), r = e.priceToY(n.price), l = e.priceToY(t.price);
  if (o == null || i == null || r == null || l == null) return t;
  const s = i - o, a = l - r, c = Math.round(Math.atan2(s, a) / Math.PI * 4);
  if (Math.abs(c) === 2) return { time: t.time, price: n.price };
  if (c === 0 || Math.abs(c) === 4) return { time: n.time, price: t.price };
  const f = Math.hypot(s, a), h = s < 0 ? -1 : 1, u = a < 0 ? -1 : 1;
  let x = Math.max(Math.abs(a), Math.abs(s));
  x /= x * Math.SQRT2 / f;
  const d = De(e, o + x * h);
  if (!d) return t;
  const p = e.yToPrice(r + Math.abs(d.x - o) * u);
  return p == null ? t : { time: d.time, price: p };
}
function sr(e, t, n) {
  const o = Q(e, t), i = Q(e, n);
  if (!o || !i) return t;
  const r = o.x - i.x, l = o.y - i.y, s = Math.max(Math.abs(r), Math.abs(l)), a = De(e, i.x + s * (r < 0 ? -1 : 1));
  if (!a) return t;
  const c = e.yToPrice(i.y + Math.abs(a.x - i.x) * (l < 0 ? -1 : 1));
  return c == null ? t : { time: a.time, price: c };
}
const At = [4.5, 9, 11.25, 18, 22.5, 36, 45], en = (() => {
  const e = [], t = At.length - 1;
  let n = 1, o = 0, i = 0;
  for (; i < 1e10; )
    i = At[o] * n, e.push(Math.round(i)), e.push(Math.ceil(-i)), o === t - 1 && (n *= 10), o = (o + 1) % t;
  return e.sort((r, l) => r - l);
})();
function cr(e, t, n) {
  let o = t.time;
  const i = e.timeToBarIndex(t.time), r = e.timeToBarIndex(n.time);
  if (i != null && r != null) {
    const a = i - r;
    if (a !== 0) {
      let c = en.length - 2;
      for (; c >= 0 && !(en[c] < a); --c) ;
      c += a > 0 ? 1 : 0, o = e.barIndexToTime(r + en[c]) ?? o;
    }
  }
  let l = t.price;
  const s = Math.round(1e6 * (t.price - n.price)) / 1e6;
  if (s !== 0) {
    const a = At[0], c = At[At.length - 1];
    let f = 1;
    const h = Math.abs(s);
    for (; h < a * f || c * f < h; )
      h < a * f ? f *= 0.1 : c * f < h && (f *= 10);
    let u = c * f;
    for (let x = At.length - 2; x >= 0 && !(At[x] * f < h); --x) u = At[x] * f;
    l = n.price + (s >= 0 ? u : -u);
  }
  return { time: o, price: l };
}
function ar(e, t, n, o) {
  const i = Math.atan2(n.y - t.y, n.x - t.x) + Math.PI / 2, r = o ?? Math.hypot(n.x - t.x, n.y - t.y) / 2;
  return _(e, { x: (t.x + n.x) / 2 + Math.cos(i) * r, y: (t.y + n.y) / 2 + Math.sin(i) * r });
}
function Io(e, t, n, o) {
  const i = t.length;
  if (i === 0) return { point: n };
  if (lr.has(e)) return { point: ee(o, n, t[i - 1]) };
  if (La.has(e)) return { point: i === 1 ? ee(o, n, t[0]) : n };
  if (e === "rectangle") return { point: i === 1 ? sr(o, n, t[0]) : n };
  if (e === "gann-box") return { point: cr(o, n, t[0]) };
  if (e === "ellipse" && i === 1) {
    const r = ee(o, n, t[0]), l = Q(o, t[0]), s = Q(o, r), a = l && s ? ar(o, l, s) : null;
    return a ? { point: r, extra: a } : { point: r };
  }
  return { point: n };
}
function qn(e, t) {
  const n = Math.abs(e), o = Math.abs(t);
  return n < 10 && o < 10 ? { dx: e, dy: t } : n < o ? { dx: 0, dy: t } : { dx: e, dy: 0 };
}
function Po(e, t, n) {
  return t && Q(e, t) || n;
}
function Sa(e, t, n) {
  const o = e.start;
  if (e.mode.hit !== "handle") return { cursor: t };
  const i = e.mode.handleIndex, r = o.points, l = e.startScreen, s = (f) => _(n, f), a = (f, h = ee) => {
    const u = s(t);
    return f ? { cursor: u ? Po(n, h(n, u, f), t) : t } : { cursor: t };
  }, c = (f, h) => {
    if (!h) return { cursor: t };
    const u = { x: f.x + t.x - e.startCursor.x, y: f.y + t.y - e.startCursor.y }, x = s(u);
    if (!x) return { cursor: t };
    const d = Po(n, ee(n, x, h), u);
    return { cursor: { x: e.startCursor.x + d.x - f.x, y: e.startCursor.y + d.y - f.y } };
  };
  switch (o.kind) {
    case "circle": {
      if (i === 1) return a(r[0]);
      if (i === 0 && l[0]) {
        const f = qn(t.x - l[0].x, t.y - l[0].y);
        return { cursor: { x: l[0].x + f.dx, y: l[0].y + f.dy } };
      }
      return { cursor: t };
    }
    case "rotated-rectangle":
      return a(i === 0 ? r[1] : r[i === 1 ? 0 : 1]);
    case "parallel-channel": {
      const [f, h, u] = l;
      if (!f || !h || !u) return { cursor: t };
      const x = { x: h.x + u.x - f.x, y: h.y + u.y - f.y }, d = s(x);
      return i === 0 ? c(f, r[1]) : i === 1 ? c(h, r[0]) : i === 2 && d ? c(u, d) : i === 3 ? c(x, r[2]) : { cursor: t };
    }
    case "flat-top-bottom":
    case "disjoint-channel":
      return i === 1 ? a(r[0]) : { cursor: t };
    case "ellipse":
      return { cursor: t, drawing: i <= 1 ? fr(e, t, n, !0) : void 0 };
    case "rectangle": {
      if (l.length !== 2) return { cursor: t };
      const f = bt(l[0], l[1]);
      if (i < 4) {
        const h = s(f[(i + 2) % 4]);
        return h ? a(h, sr) : { cursor: t };
      }
      return { cursor: t, drawing: Ta(e, t, n) };
    }
    case "gann-box": {
      if (l.length !== 2 || i >= 4) return { cursor: t };
      const f = s(bt(l[0], l[1])[(i + 2) % 4]);
      return f ? a(f, cr) : { cursor: t };
    }
    case "gann-square":
      return { cursor: t, drawing: i <= 1 ? Ca(e, t, n) : void 0 };
  }
  return lr.has(o.kind) && i <= 1 && r.length >= 2 ? a(r[i === 0 ? 1 : 0]) : { cursor: t };
}
function fr(e, t, n, o, i = (r) => r) {
  const r = e.start;
  if (r.kind !== "ellipse" || e.mode.hit !== "handle") return null;
  const l = e.mode.handleIndex, [s, a, c] = e.startScreen;
  if (!s || !a || !c || l > 1) return null;
  const f = _(n, t);
  if (!f) return null;
  const h = r.points[l === 0 ? 1 : 0], u = o ? ee(n, f, h) : i(f), x = [...r.points];
  x[l] = u;
  const d = Q(n, x[0]), p = Q(n, x[1]);
  if (!d || !p) return null;
  const y = a.x - s.x, m = a.y - s.y, b = Math.hypot(y, m) || 1, g = Math.abs(((c.x - s.x) * m - (c.y - s.y) * y) / b), w = ar(n, d, p, o ? void 0 : g);
  if (!w) return null;
  if (x[2] = w, o && n.timeToBarIndex(x[0].time) === n.timeToBarIndex(x[1].time)) {
    const M = x[l], v = x[l === 0 ? 1 : 0], k = Q(n, M), S = Q(n, v), C = n.timeToX(M.time), I = n.timeToX(w.time);
    if (k && S && C != null && I != null) {
      const A = 2 * Math.abs(C - I) * (v.price > M.price ? 1 : -1), z = n.yToPrice(S.y + A);
      z != null && (x[l] = { time: M.time, price: z });
    }
  }
  return Y(r, x);
}
function Ca(e, t, n) {
  const o = e.start;
  if (e.mode.hit !== "handle") return null;
  const i = e.mode.handleIndex, [r, l] = o.points, s = n.timeToBarIndex(r.time), a = n.timeToBarIndex(l.time), c = _(n, t);
  if (!c || s == null || a == null || s === a) return null;
  const f = Math.abs(l.price - r.price) / Math.abs(a - s), h = i === 0 ? l : r, u = n.timeToBarIndex(c.time), x = n.timeToBarIndex(h.time);
  if (u == null || x == null) return null;
  const d = [...o.points];
  return d[i] = { time: c.time, price: h.price + (c.price - h.price > 0 ? 1 : -1) * Math.abs(u - x) * f }, Y(o, d);
}
function Ta(e, t, n) {
  const o = e.start;
  if (e.mode.hit !== "handle") return null;
  const [i, , r] = bt(e.startScreen[0], e.startScreen[1]);
  let { x: l, y: s } = i, { x: a, y: c } = r;
  const f = e.mode.handleIndex;
  if (f === 5 || f === 7) {
    const x = f === 5 ? t.x - a : l - t.x;
    f === 5 ? a += x : l -= x, s -= x / 2, c += x / 2;
  } else {
    const x = f === 4 ? s - t.y : t.y - c, d = De(n, l), p = De(n, a);
    if (!d || !p) return null;
    const y = Ie(n, p.i + 1), m = y ? y.x - p.x : 0;
    if (m <= 0) return null;
    const b = Math.round(x / m), g = Ie(n, d.i - b), w = Ie(n, p.i + b);
    if (!g || !w) return null;
    const M = w.x - p.x;
    l = g.x, a = w.x, f === 4 ? s -= M : c += M;
  }
  const h = _(n, { x: l, y: s }), u = _(n, { x: a, y: c });
  return !h || !u ? null : Y(o, [h, u]);
}
function Aa(e, t, n, o) {
  const i = e.start;
  if (i.kind !== "long-position" && i.kind !== "short-position" || e.mode.hit !== "handle") return null;
  const r = e.mode.handleIndex, [l, s] = i.points, a = n.pipSize(), c = i.kind === "long-position" ? 1 : -1, { stop: f, profit: h } = No(i, a);
  if (r === 0) {
    const x = _(n, t);
    if (!x) return null;
    const d = o(x);
    return Y(i, [d, { time: s.time, price: d.price }]);
  }
  if (r === 1) {
    const x = n.xToTime(t.x);
    return x == null ? null : Y(i, [l, { time: x, price: l.price }]);
  }
  const u = n.yToPrice(t.y);
  if (u == null) return null;
  if (r === 2) {
    const x = Math.max(a, (l.price - u) * c);
    return { ...i, style: { ...i.style, stopLevel: x, profitLevel: h } };
  }
  if (r === 3) {
    const x = Math.max(a, (u - l.price) * c);
    return { ...i, style: { ...i.style, profitLevel: x, stopLevel: f } };
  }
  return null;
}
function $a(e, t, n) {
  const o = e.start;
  if (o.kind !== "parallel-channel" || e.mode.hit !== "handle") return null;
  const [i, r, l] = e.startScreen;
  if (!i || !r || !l) return null;
  const s = e.mode.handleIndex, a = t.x - e.startCursor.x, c = t.y - e.startCursor.y, f = (u) => _(n, u), h = o.points;
  if (s === 0 || s === 2) {
    const u = f({ x: i.x + a, y: i.y + c }), x = f({ x: l.x + a, y: l.y + c });
    return !u || !x ? null : Y(o, [u, h[1], x]);
  }
  if (s === 1 || s === 3) {
    const u = f({ x: r.x + a, y: r.y + c });
    return u ? Y(o, [h[0], u, h[2]]) : null;
  }
  if (s === 4) {
    const u = f({ x: l.x, y: l.y + c });
    return u ? Y(o, [h[0], h[1], u]) : null;
  }
  if (s === 5) {
    const u = f({ x: i.x, y: i.y + c }), x = f({ x: r.x, y: r.y + c }), d = f({ x: l.x, y: l.y + c });
    return !u || !x || !d ? null : Y(o, [u, x, d]);
  }
  return null;
}
function Ba(e, t, n, o) {
  const i = e.start;
  if (i.kind !== "disjoint-channel" || e.mode.hit !== "handle") return null;
  const r = e.mode.handleIndex, l = i.points;
  if (r === 0 || r === 1) {
    const a = _(n, t);
    if (!a) return null;
    const c = l.slice();
    return c[r] = o(a), Y(i, c);
  }
  const s = n.yToPrice(t.y);
  if (s == null) return null;
  if (r === 2)
    return Y(i, [l[0], l[1], { time: l[2].time, price: s }]);
  if (r === 3) {
    const a = l[2].price + l[1].price - s;
    return Y(i, [{ time: l[0].time, price: a }, l[1], l[2]]);
  }
  return null;
}
function Ia(e, t, n, o) {
  const i = e.start;
  if (i.kind !== "rotated-rectangle" || e.mode.hit !== "handle") return null;
  const r = e.mode.handleIndex, l = _(n, t);
  if (!l) return null;
  const s = i.points.slice();
  if (r >= 2)
    return s[2] = l, Y(i, s);
  const [a, c, f] = e.startScreen, h = c.x - a.x, u = c.y - a.y, x = Math.hypot(h, u) || 1, d = Math.abs(((f.x - a.x) * u - (f.y - a.y) * h) / x), p = o(l);
  s[r] = p;
  const y = r === 0 ? Q(n, p) : a, m = r === 1 ? Q(n, p) : c;
  if (!y || !m) return null;
  const b = Math.hypot(m.x - y.x, m.y - y.y) || 1, g = _(n, { x: y.x + (m.y - y.y) / b * d, y: y.y - (m.x - y.x) / b * d });
  return g ? (s[2] = g, Y(i, s)) : null;
}
function Pa(e, t, n, o, i = !1) {
  return Ea(n, e.start, za(e, t, n, o, i));
}
function Ea(e, t, n) {
  if (!n || n.points.length !== t.points.length) return n;
  let o = !1;
  const i = n.points.map((r, l) => {
    const s = t.points[l];
    if (r.time === s.time) return r;
    const a = e.timeToBarIndex(s.time);
    return a == null || a !== e.timeToBarIndex(r.time) ? r : (o = !0, { time: s.time, price: r.price });
  });
  return o ? { ...n, points: i } : n;
}
function za(e, t, n, o, i) {
  var f, h;
  const r = sn(e.start.kind);
  if (i && e.mode.hit === "handle") {
    const u = Sa(e, t, n);
    if (u.drawing !== void 0) return u.drawing;
    t = u.cursor;
  }
  if (i && e.mode.hit === "body") {
    const u = qn(t.x - e.startCursor.x, t.y - e.startCursor.y);
    t = { x: e.startCursor.x + u.dx, y: e.startCursor.y + u.dy };
  }
  if (e.mode.hit === "handle")
    switch (e.start.kind) {
      case "long-position":
      case "short-position":
        return Aa(e, t, n, o);
      case "parallel-channel":
        return $a(e, t, n);
      case "table":
        return Wa(e, t, n);
      case "signpost": {
        const u = ((f = e.pane) == null ? void 0 : f.h) ?? 0, x = uo(e.start, n, u, t.y);
        return x == null ? null : { ...e.start, style: { ...e.start.style, signpostPosition: x } };
      }
      // TV text: anchor 1 = the wrap width (min 100), from the point.
      case "text": {
        if (e.mode.handleIndex !== 1) break;
        const u = e.start.style.fontSize ?? 14;
        return { ...e.start, style: { ...e.start.style, wordWrapWidth: Math.max(100, t.x - e.startScreen[0].x - Math.floor(u / 6)) } };
      }
      // TV callout: anchor 1 = the wrap width (min 100) with the box's left
      // edge kept; the balloon centre follows.
      case "callout": {
        if (e.mode.handleIndex !== 1) break;
        const u = e.start.style, x = u.wordWrapWidth ?? 200, d = e.startScreen[1].x - x / 2 - 10, p = Math.max(100, t.x - d - 10), y = _(n, { x: d + p / 2 + 10, y: e.startScreen[1].y });
        return y ? { ...Y(e.start, [e.start.points[0], y]), style: { ...u, wordWrapWidth: p } } : null;
      }
      case "image":
        return Ra(e, t, n);
      // Anchored pin (TV Anchor drawing): its one anchor moves the fixed pane
      // position like a body move (TV refuses point changes of a fixed
      // drawing; the pin has a single point).
      case "pin":
        if (e.start.anchored) return mn(n, e.start, e.startScreen, t.x - e.startCursor.x, t.y - e.startCursor.y, e.pane);
        break;
      case "polyline": {
        const u = e.mode.handleIndex, x = e.startScreen.length;
        if (x > 2 && (u === 0 || u === x - 1)) {
          const d = e.startScreen[u === 0 ? x - 1 : 0];
          if (Math.hypot(t.x - d.x, t.y - d.y) < nr) {
            const p = _(n, t);
            if (!p) return null;
            const y = e.start.points.slice();
            return y[u] = o(p), { ...Y(e.start, y), closed: !0 };
          }
        }
        break;
      }
      case "disjoint-channel":
        return Ba(e, t, n, o);
      // TV Ellipse.setPoint: moving an end rebuilds the minor-axis point at
      // the radius the ellipse had when the drag started (Shift: see ./shift).
      case "ellipse":
        if (e.mode.handleIndex <= 1) return fr(e, t, n, !1, o);
        break;
      case "rotated-rectangle":
        if (e.start.fmt === 2) return Ia(e, t, n, o);
        break;
      // TV: the h-line anchor is a vertical resize (price only), the v-line
      // anchor a horizontal resize (time only).
      case "horizontal-line": {
        const u = _(n, t);
        return u ? Y(e.start, [{ time: e.start.points[0].time, price: o(u).price }]) : null;
      }
      case "vertical-line": {
        const u = _(n, t);
        return u ? Y(e.start, [{ time: o(u).time, price: e.start.points[0].price }]) : null;
      }
    }
  if (e.mode.hit === "body" && e.start.kind === "signpost") {
    const u = t.x - e.startCursor.x, x = t.y - e.startCursor.y, d = _(n, { x: e.startScreen[0].x + u, y: e.startScreen[0].y }), p = ((h = e.pane) == null ? void 0 : h.h) ?? 0, y = Rn(e.start, e.startScreen[0], n, p);
    if (!d) return null;
    const m = Y(e.start, [{ time: d.time, price: e.start.points[0].price }]), b = uo(m, n, p, y.anchor.y + x);
    return b == null ? m : { ...m, style: { ...m.style, signpostPosition: b } };
  }
  if (e.mode.hit === "body")
    return mn(n, e.start, e.startScreen, t.x - e.startCursor.x, t.y - e.startCursor.y, e.pane);
  if (e.start.kind === "rectangle" && e.mode.handleIndex >= 4 && e.startScreen.length === 2) {
    const [u, , x] = bt(e.startScreen[0], e.startScreen[1]);
    let { x: d, y: p } = u, { x: y, y: m } = x;
    switch (e.mode.handleIndex) {
      case 4:
        p = t.y;
        break;
      case 5:
        y = t.x;
        break;
      case 6:
        m = t.y;
        break;
      case 7:
        d = t.x;
        break;
    }
    const b = _(n, { x: d, y: p }), g = _(n, { x: y, y: m });
    return !b || !g ? null : Y(e.start, [b, g]);
  }
  if (r != null && r.isBbox && e.startScreen.length === 2 && e.mode.handleIndex < 4) {
    const x = bt(e.startScreen[0], e.startScreen[1])[(e.mode.handleIndex + 2) % 4], d = _(n, t), p = _(n, x);
    return !d || !p ? null : Y(e.start, [o(d), p]);
  }
  const l = _(n, t);
  if (!l) return null;
  const s = e.mode.handleIndex, a = e.start.points.slice();
  if (s < 0 || s >= a.length) return null;
  a[s] = o(l);
  const c = Y(e.start, a);
  if (c.kind === "trend-angle" && e.startScreen.length === 2 && s <= 1) {
    const u = s === 0 ? t : e.startScreen[0], x = s === 1 ? t : e.startScreen[1];
    return { ...c, style: { ...c.style, angle: ir(u, x) } };
  }
  return c;
}
function hr(e, t) {
  const n = e.xToTime(t);
  if (n == null) return null;
  const o = e.timeToX(n);
  if (o == null || o <= t + 1e-6) return n;
  const i = e.timeToBarIndex(n);
  return i == null ? n : e.barIndexToTime(i - 1) ?? n;
}
function Wa(e, t, n) {
  if (e.mode.hit !== "handle") return null;
  const o = e.start, i = o.style, r = e.mode.handleIndex, l = e.startScreen[0], s = i.fontSize ?? 14, a = ge(i), { heights: c, mins: f } = pi(i), h = nl(s), u = a.map(() => h), x = (B) => B.reduce((F, V) => F + V, 0), d = x(a), p = x(c), y = hi(r);
  if (y) {
    const B = {};
    if (y.col != null) {
      const F = l.x + x(a.slice(0, y.col));
      B.tableColWidths = a.map((V, K) => K === y.col ? Math.max(h, t.x - F) : V);
    }
    if (y.row != null) {
      const F = l.y + x(c.slice(0, y.row));
      B.tableRowHeights = c.map((V, K) => K === y.row ? Math.max(f[K], t.y - F) : V);
    }
    return { ...o, style: { ...i, ...B } };
  }
  if (r > 3) return null;
  const m = r === 0 || r === 1, b = r === 0 || r === 2, g = { x: l.x + (m ? 0 : d), y: l.y + (b ? 0 : p) }, w = { x: g.x + (m ? d : -d), y: g.y + (b ? p : -p) }, M = h * a.length, v = x(f);
  let k = m ? Math.min(t.x, w.x - M) : Math.max(t.x, w.x + M);
  const S = b ? Math.min(t.y, w.y - v) : Math.max(t.y, w.y + v);
  let C = o.points[0].time;
  const I = o.anchored && e.pane && e.pane.w > 0 && e.pane.h > 0 ? e.pane : null;
  if (m && !I) {
    const B = hr(n, k), F = B == null ? null : n.timeToX(B);
    if (B == null || F == null) return null;
    C = B, k = F;
  }
  let A = o.points[0].price;
  if (b && !I) {
    const B = n.yToPrice(S);
    if (B == null) return null;
    A = B;
  }
  const z = g.x - k, O = g.y - S, T = fn(a, u, m ? d + z : d - z);
  m && (T[T.length - 1] += Math.round(l.x + d) - k - x(T));
  const E = fn(c, f, b ? p + O : p - O), P = di(s);
  if (I) {
    const B = m ? k : l.x, F = b ? S : l.y;
    return {
      ...o,
      anchored: { x: B / I.w, y: F / I.h },
      style: { ...i, tableColWidths: T.map((V) => Math.max(V, h)), tableRowHeights: E.map((V) => Math.max(V, P)) }
    };
  }
  return {
    ...o,
    points: [{ time: C, price: A }],
    style: { ...i, tableColWidths: T.map((B) => Math.max(B, h)), tableRowHeights: E.map((B) => Math.max(B, P)) }
  };
}
function Ra(e, t, n) {
  const o = e.start, i = o.image, r = Wn(i == null ? void 0 : i.name);
  if (!i || !r || e.mode.hit !== "handle" || e.mode.handleIndex > 3) return null;
  const [l, s] = xl[e.mode.handleIndex], a = { x: e.startScreen[0].x + (i.dx ?? 0), y: e.startScreen[0].y }, c = { x: a.x - l * i.cssWidth / 2, y: a.y - s * i.cssHeight / 2 }, f = Math.max(Math.abs(c.x - t.x) / r.width, Math.abs(c.y - t.y) / r.height), h = Math.round(r.width * f), u = Math.round(r.height * f), x = { x: c.x + l * h / 2, y: c.y + s * u / 2 }, d = _(n, x);
  if (!d) return null;
  const p = n.timeToX(d.time);
  return { ...o, points: [d], image: { ...i, cssWidth: h, cssHeight: u, dx: p == null ? 0 : x.x - p } };
}
function Fa(e, t) {
  if (t.length < 2) return "grab";
  let n = 0, o = 0;
  for (const s of t)
    n += s.x, o += s.y;
  n /= t.length, o /= t.length;
  const i = e.x - n, r = e.y - o;
  if (Math.hypot(i, r) < 1) return "grab";
  const l = (Math.atan2(r, i) * 180 / Math.PI + 360) % 180;
  return l < 22.5 || l >= 157.5 ? "ew-resize" : l < 67.5 ? "nwse-resize" : l < 112.5 ? "ns-resize" : "nesw-resize";
}
const Oa = /* @__PURE__ */ new Set(["text", "pin", "table"]);
function Da(e) {
  return Oa.has(e);
}
function _a(e, t, n) {
  if (!Da(e.kind) || n.w <= 0 || n.h <= 0) return null;
  if (!e.anchored) {
    const c = Q(t, e.points[0]);
    return c ? { ...e, anchored: { x: c.x / n.w, y: c.y / n.h } } : null;
  }
  const o = e.anchored.x * n.w, i = e.anchored.y * n.h, r = hr(t, o), l = t.yToPrice(i);
  if (r == null || l == null) return null;
  const { anchored: s, ...a } = e;
  return Y(a, [{ time: r, price: l }]);
}
const Ha = 1;
function Na(e, t, n, o = () => [], i = () => ({ timeZone: "UTC", intraday: !0 }), r = () => null) {
  return {
    priceToY: (l) => t.priceToCoordinate(l),
    yToPrice: (l) => t.coordinateToPrice(l),
    isLog: () => t.priceScale().options().mode === Ha,
    // timeToCoordinate / coordinateToTime only map within the loaded data range;
    // off-data x (the empty space to the RIGHT of the last bar — i.e. the
    // future, where drawings should be anchorable just like in TradingView)
    // returns null. We fall back to the logical-index axis, which extends
    // infinitely, and extrapolate a synthetic time off the last bar using the
    // bar interval. Both directions share the same anchor + interval so a future
    // point round-trips (place → project) to the same pixel. With the host's
    // future axis a future time sits on the future bar that holds it and an x
    // gives the open time of its nearest future bar.
    timeToX: (l) => {
      const s = e.timeScale().timeToCoordinate(l);
      if (s != null) return s;
      const a = n();
      if (a.length === 0) return null;
      const c = tt(l);
      if (c == null) return null;
      const f = gn(a, c, r());
      return f == null ? null : ur(e, f);
    },
    xToTime: (l) => {
      const s = e.timeScale().coordinateToTime(l);
      if (s != null) return s;
      const a = n();
      if (a.length === 0) return null;
      const c = e.timeScale().coordinateToLogical(l), f = tt(a[a.length - 1].time);
      if (c == null || f == null) return null;
      const h = r();
      if (h && c > a.length - 1) {
        const d = Math.round(c - (a.length - 1));
        if (d <= 0) return a[a.length - 1].time;
        const p = h.time(d, f);
        if (p != null) return p;
      }
      const u = tt(a[0].time);
      if (h != null && h.pastTime && u != null && c < 0) {
        const d = Math.round(-c);
        if (d <= 0) return a[0].time;
        const p = h.pastTime(d, u);
        if (p != null) return p;
      }
      const x = _e(a);
      return x <= 0 ? null : Math.round(f + (c - (a.length - 1)) * x);
    },
    barAt: (l) => Va(n(), l),
    timeToBarIndex: (l) => {
      const s = n();
      if (s.length === 0) return null;
      const a = tt(l);
      if (a == null) return null;
      const c = gn(s, a, r());
      return c == null ? null : Math.round(c);
    },
    barIndexToTime: (l) => {
      const s = n();
      if (s.length === 0) return null;
      if (l >= 0 && l < s.length) return s[l].time;
      const a = s.length - 1, c = tt(s[a].time);
      if (c == null) return null;
      const f = r();
      if (f && l > a) {
        const x = f.time(l - a, c);
        if (x != null) return x;
      }
      const h = tt(s[0].time);
      if (f != null && f.pastTime && h != null && l < 0) {
        const x = f.pastTime(-l, h);
        if (x != null) return x;
      }
      const u = _e(s);
      return Math.round(c + (l - a) * u);
    },
    bars: n,
    visibleTimeRange: () => {
      const l = e.timeScale().getVisibleRange();
      if (!l) return null;
      const s = tt(l.from), a = tt(l.to);
      return s == null || a == null ? null : { from: s, to: a };
    },
    indicatorValuesAt: (l) => o(tt(l)),
    pipSize: () => {
      const l = t.options().priceFormat;
      return l && typeof l.minMove == "number" && l.minMove > 0 ? l.minMove : 0.01;
    },
    addPriceLine: (l) => t.createPriceLine(l),
    removePriceLine: (l) => t.removePriceLine(l),
    zoomToScreenRect: (l, s, a, c) => {
      const f = e.timeScale(), h = f.coordinateToLogical(Math.min(l, s)), u = f.coordinateToLogical(Math.max(l, s));
      h != null && u != null && u > h && f.setVisibleLogicalRange({ from: h, to: u });
      const x = t.coordinateToPrice(a), d = t.coordinateToPrice(c);
      if (x != null && d != null) {
        const p = Math.min(x, d), y = Math.max(x, d);
        if (y > p) {
          const m = t.priceScale();
          m.setAutoScale(!1), m.setVisibleRange({ from: p, to: y });
        }
      }
    },
    formatTime: (l) => {
      const s = e.options().localization.timeFormatter;
      if (s) return s(l);
      const a = tt(l);
      if (a == null) return String(l);
      const c = e.options(), f = new Date(a * 1e3), h = new Intl.DateTimeFormat(c.localization.locale, { month: "short", timeZone: "UTC" }).format(f), u = `${f.getUTCDate()} ${h} '${String(f.getUTCFullYear() % 100).padStart(2, "0")}`;
      if (!c.timeScale.timeVisible) return u;
      const x = (p) => String(p).padStart(2, "0"), d = `${x(f.getUTCHours())}:${x(f.getUTCMinutes())}${c.timeScale.secondsVisible ? `:${x(f.getUTCSeconds())}` : ""}`;
      return `${u}   ${d}`;
    },
    timeInfo: () => i(),
    timeAxis: () => {
      const l = e.options().layout;
      return { height: e.timeScale().height(), width: e.timeScale().width(), fontSize: l.fontSize, fontFamily: l.fontFamily };
    }
  };
}
function tt(e) {
  if (typeof e == "number") return e;
  if (typeof e == "string") {
    const t = Date.parse(e);
    return Number.isFinite(t) ? t / 1e3 : null;
  }
  return typeof e == "object" && e !== null && "year" in e ? Date.UTC(e.year, e.month - 1, e.day) / 1e3 : null;
}
function _e(e) {
  if (e.length < 2) return 86400;
  const t = [];
  for (let n = Math.max(1, e.length - 50); n < e.length; n++) {
    const o = tt(e[n - 1].time), i = tt(e[n].time);
    o != null && i != null && i > o && t.push(i - o);
  }
  return t.length === 0 ? 86400 : (t.sort((n, o) => n - o), t[Math.floor(t.length / 2)]);
}
function gn(e, t, n) {
  const o = e.length, i = tt(e[0].time), r = tt(e[o - 1].time);
  if (i == null || r == null) return null;
  const l = (n == null ? void 0 : n.timeKey) ?? ((a) => a), s = l(t);
  if (s >= l(r)) {
    if (n) return o - 1 + n.slots(t, r);
    if (t <= r) return o - 1;
    const a = _e(e);
    return a > 0 ? o - 1 + (t - r) / a : null;
  }
  if (s < l(i)) {
    if (n != null && n.pastSlots) return -n.pastSlots(t, i);
    const a = _e(e);
    return a > 0 ? (t - i) / a : null;
  }
  return Ya(e, s, l);
}
function Ya(e, t, n) {
  let o = 0, i = e.length - 1;
  for (; o < i; ) {
    const r = o + i + 1 >> 1, l = tt(e[r].time);
    l != null && n(l) <= t ? o = r : i = r - 1;
  }
  return o;
}
function ur(e, t) {
  const n = e.timeScale(), o = Math.floor(t), i = n.logicalToCoordinate(o);
  if (i == null) return null;
  const r = t - o;
  if (r === 0) return i;
  const l = n.logicalToCoordinate(o + 1);
  return l == null ? i : i + r * (l - i);
}
function df(e, t, n, o) {
  if (n.length === 0) return null;
  const i = gn(n, t, o);
  return i == null ? null : ur(e, i);
}
function Va(e, t) {
  if (e.length === 0) return null;
  const n = tt(t);
  if (n == null) return e[0];
  let o = e[0], i = 1 / 0;
  for (const r of e) {
    const l = tt(r.time);
    if (l == null) continue;
    const s = Math.abs(l - n);
    s < i && (o = r, i = s);
  }
  return o;
}
const Eo = "#1e53e5";
function Ua(e, t, n) {
  const o = { clips: /* @__PURE__ */ new Map(), grads: /* @__PURE__ */ new Map() };
  for (const i of t) wn(e, i, n, o);
}
function wn(e, t, n, o) {
  switch (t.t) {
    case "clip": {
      const l = t.polys;
      o.clips.set(t.name, (s) => {
        const c = new Path2D();
        c.rect(-1e5, -1e5, 2 * 1e5, 2 * 1e5);
        for (const f of l)
          if (f.length) {
            c.moveTo(f[0].x, f[0].y);
            for (let h = 1; h < f.length; h++) c.lineTo(f[h].x, f[h].y);
            c.closePath();
          }
        s.clip(c, "evenodd");
      });
      return;
    }
    case "clipRect": {
      const { x: l, y: s, w: a, h: c } = t;
      o.clips.set(t.name, (f) => {
        const h = new Path2D();
        h.rect(l, s, a, c), f.clip(h);
      });
      return;
    }
    case "radialGradient": {
      const l = e.createRadialGradient(t.cx, t.cy, 0, t.cx, t.cy, t.r);
      for (const s of t.stops) l.addColorStop(s.offset, dr(s.color, s.opacity));
      o.grads.set(t.name, l);
      return;
    }
    case "hit":
    case "hitPath":
      return;
    case "anchors":
      Qa(e, t.pts, t.squares, n.anchors);
      return;
  }
  const i = "clip" in t && t.clip ? o.clips.get(t.clip) : void 0, r = !!i || t.t === "group" || "transform" in t && !!t.transform;
  switch (r && e.save(), i && i(e), t.t) {
    case "line": {
      const l = new Path2D();
      l.moveTo(t.a.x, t.a.y), l.lineTo(t.b.x, t.b.y), jt(e, l, t, o, !1);
      break;
    }
    case "polyline":
    case "polygon": {
      const l = new Path2D();
      t.pts.forEach((s, a) => a === 0 ? l.moveTo(s.x, s.y) : l.lineTo(s.x, s.y)), t.t === "polygon" && t.pts.length && l.closePath(), jt(e, l, t, o, !0);
      break;
    }
    case "path": {
      t.transform && nn(e, t.transform), jt(e, new Path2D(t.d), t, o, !0);
      break;
    }
    case "rect": {
      if (t.w < 0 || t.h < 0) break;
      const l = new Path2D(), s = Math.min(t.rx ?? t.ry ?? 0, t.w / 2), a = Math.min(t.ry ?? t.rx ?? 0, t.h / 2);
      s > 0 || a > 0 ? Mn(l, t.x, t.y, t.w, t.h, s, a) : l.rect(t.x, t.y, t.w, t.h), jt(e, l, t, o, !0);
      break;
    }
    case "circle": {
      if (t.r <= 0) break;
      const l = new Path2D();
      l.arc(t.cx, t.cy, t.r, 0, Math.PI * 2), jt(e, l, t, o, !0);
      break;
    }
    case "ellipse": {
      if (t.transform && nn(e, t.transform), t.rx <= 0 || t.ry <= 0) break;
      const l = new Path2D();
      l.ellipse(t.cx, t.cy, t.rx, t.ry, 0, 0, Math.PI * 2), jt(e, l, t, o, !0);
      break;
    }
    case "text":
      ja(e, t, n);
      break;
    case "image":
      Za(e, t, n);
      break;
    case "glyph":
      Ka(e, t, n);
      break;
    case "group": {
      if (t.transform && nn(e, t.transform), t.opacity != null && t.opacity < 1) {
        const l = Xa(e);
        if (l) {
          for (const s of t.items) wn(l, s, n, o);
          e.save(), e.setTransform(1, 0, 0, 1, 0, 0), e.globalAlpha *= t.opacity, e.drawImage(l.canvas, 0, 0), e.restore();
          break;
        }
        e.globalAlpha *= t.opacity;
      }
      for (const l of t.items) wn(e, l, n, o);
      break;
    }
  }
  r && e.restore();
}
function Xa(e) {
  const t = e.canvas.width, n = e.canvas.height;
  if (!t || !n) return null;
  const o = document.createElement("canvas");
  o.width = t, o.height = n;
  const i = o.getContext("2d");
  return i ? (i.setTransform(e.getTransform()), i) : null;
}
function jt(e, t, n, o, i) {
  const r = n.fillRef ? o.grads.get(n.fillRef) ?? null : i ? n.fill ?? "#000000" : null, l = n.stroke, s = n.shadow;
  if (r && r !== "none" && r !== "transparent" && (e.save(), s && zo(e, s), e.globalAlpha *= n.fillOpacity ?? 1, e.fillStyle = r, e.fill(t, n.fillRule === "evenodd" ? "evenodd" : "nonzero"), e.restore()), l && l !== "none" && l !== "transparent") {
    const a = n.strokeWidth ?? 1;
    if (a <= 0) return;
    e.save(), s && (!r || r === "none" || r === "transparent") && zo(e, s), e.globalAlpha *= n.strokeOpacity ?? 1, e.strokeStyle = l, e.lineWidth = a, e.lineCap = n.cap ?? "butt", e.lineJoin = n.join ?? "miter", e.setLineDash(Ga(n.dash)), e.stroke(t), e.restore();
  }
}
function zo(e, t) {
  e.shadowOffsetX = t.dx, e.shadowOffsetY = t.dy, e.shadowBlur = t.blur, e.shadowColor = t.color;
}
function Ga(e) {
  if (!e || e === "none") return [];
  const t = e.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  return !t.length || t.every((n) => n === 0) ? [] : t.length % 2 ? [...t, ...t] : t;
}
function Mn(e, t, n, o, i, r, l) {
  e.moveTo(t + r, n), e.lineTo(t + o - r, n), e.ellipse(t + o - r, n + l, r, l, 0, -Math.PI / 2, 0), e.lineTo(t + o, n + i - l), e.ellipse(t + o - r, n + i - l, r, l, 0, 0, Math.PI / 2), e.lineTo(t + r, n + i), e.ellipse(t + r, n + i - l, r, l, 0, Math.PI / 2, Math.PI), e.lineTo(t, n + l), e.ellipse(t + r, n + l, r, l, 0, Math.PI, 3 * Math.PI / 2), e.closePath();
}
function nn(e, t) {
  const n = /(rotate|translate|scale|matrix)\s*\(([^)]*)\)/g;
  let o;
  for (; o = n.exec(t); ) {
    const i = o[2].split(/[\s,]+/).filter(Boolean).map(Number);
    switch (o[1]) {
      case "rotate": {
        const r = (i[0] ?? 0) * Math.PI / 180;
        i.length >= 3 ? (e.translate(i[1], i[2]), e.rotate(r), e.translate(-i[1], -i[2])) : e.rotate(r);
        break;
      }
      case "translate":
        e.translate(i[0] ?? 0, i[1] ?? 0);
        break;
      case "scale":
        e.scale(i[0] ?? 1, i[1] ?? i[0] ?? 1);
        break;
      case "matrix":
        e.transform(i[0], i[1], i[2], i[3], i[4], i[5]);
        break;
    }
  }
}
function ja(e, t, n) {
  const o = t.pre ? t.text : t.text.replace(/\s+/g, " ").trim();
  if (!o) return;
  e.save(), t.opacity != null && (e.globalAlpha *= t.opacity);
  const i = t.weight === "bold" ? 700 : t.weight ?? 400;
  e.font = `${t.fontStyle === "italic" ? "italic " : ""}${i} ${t.size}px ${t.family ?? n.fontFamily}`, e.textAlign = t.anchor === "middle" ? "center" : t.anchor === "end" ? "right" : "left";
  let r = t.y;
  t.baseline === "central" ? (e.textBaseline = "alphabetic", r += qa(e)) : e.textBaseline = t.baseline === "middle" ? "middle" : t.baseline === "hanging" ? "hanging" : "alphabetic", e.fillStyle = t.fill ?? "#000000", e.fillText(o, t.x, r), e.restore();
}
const Wo = /* @__PURE__ */ new Map();
function qa(e) {
  let t = Wo.get(e.font);
  if (t == null) {
    const n = e.measureText("H");
    t = (n.fontBoundingBoxAscent - n.fontBoundingBoxDescent) / 2, Wo.set(e.font, t);
  }
  return t;
}
const Ro = /* @__PURE__ */ new Map();
function xr(e, t) {
  let n = Ro.get(e);
  return n || (n = new Image(), n.onload = () => {
    var o;
    return (o = t.onAsyncLoad) == null ? void 0 : o.call(t);
  }, n.src = e, Ro.set(e, n)), n.complete && n.naturalWidth > 0 ? n : null;
}
function Za(e, t, n) {
  if (!t.href) return;
  const o = xr(t.href, n);
  if (o) {
    if (e.save(), t.opacity != null && (e.globalAlpha *= t.opacity), t.stretch) e.drawImage(o, t.x, t.y, t.w, t.h);
    else {
      const i = Math.min(t.w / o.naturalWidth, t.h / o.naturalHeight), r = o.naturalWidth * i, l = o.naturalHeight * i;
      e.drawImage(o, t.x + (t.w - r) / 2, t.y + (t.h - l) / 2, r, l);
    }
    e.restore();
  }
}
function Ka(e, t, n) {
  const o = t.glyph.trim();
  if (o) {
    if (o.startsWith("<svg")) {
      let i = o.replace(/currentColor/g, t.color);
      /xmlns=/.test(i) || (i = i.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"'));
      const r = xr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(i)}`, n);
      r && e.drawImage(r, t.x, t.y, t.size, t.size);
      return;
    }
    e.save(), e.font = `${t.size - 4}px ${n.fontFamily}`, e.textAlign = "center", e.textBaseline = "middle", e.fillStyle = t.color, e.fillText(o, t.x + t.size / 2, t.y + t.size / 2), e.restore();
  }
}
function Qa(e, t, n, o) {
  const i = o.selected ? 2 : 1;
  t.forEach((r, l) => {
    const s = !!(n != null && n.includes(l));
    if (e.save(), o.hovered === l) {
      e.strokeStyle = dr(Eo, 0.2), e.lineWidth = 3;
      const c = new Path2D();
      s ? Mn(c, r.x - et - 1.5, r.y - et - 1.5, 2 * et + 3, 2 * et + 3, 4.5, 4.5) : c.arc(r.x, r.y, et + 1.5, 0, Math.PI * 2), e.stroke(c);
    }
    const a = new Path2D();
    if (s) {
      const c = 2 * et - i;
      Mn(a, r.x - et + i / 2, r.y - et + i / 2, c, c, 3, 3);
    } else a.arc(r.x, r.y, et - i / 2, 0, Math.PI * 2);
    e.fillStyle = o.fillAt(r.y), e.fill(a), e.strokeStyle = Eo, e.lineWidth = i, e.stroke(a), e.restore();
  });
}
function dr(e, t) {
  if (t >= 1) return e;
  const n = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(e);
  if (n) {
    const i = n[1].length === 3 ? n[1].split("").map((l) => l + l).join("") : n[1], r = parseInt(i, 16);
    return `rgba(${r >> 16}, ${r >> 8 & 255}, ${r & 255}, ${t})`;
  }
  const o = /^rgba?\(([^)]*)\)$/i.exec(e);
  if (o) {
    const [i, r, l, s] = o[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return `rgba(${i}, ${r}, ${l}, ${(s ?? 1) * t})`;
  }
  return e;
}
const Ja = () => `dw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
class yf {
  constructor(t, n, o = {}) {
    N(this, "chart");
    N(this, "series");
    N(this, "opts");
    N(this, "coords");
    N(this, "primitive");
    N(this, "el");
    N(this, "listeners", { change: /* @__PURE__ */ new Set(), add: /* @__PURE__ */ new Set(), update: /* @__PURE__ */ new Set(), remove: /* @__PURE__ */ new Set(), selection: /* @__PURE__ */ new Set(), tool: /* @__PURE__ */ new Set(), visibility: /* @__PURE__ */ new Set(), textEdit: /* @__PURE__ */ new Set(), gestureEnd: /* @__PURE__ */ new Set(), tableEdit: /* @__PURE__ */ new Set() });
    N(this, "list", []);
    N(this, "selected", []);
    /** TV "Hide all drawings": off = nothing is drawn or hit (not saved). */
    N(this, "visible", !0);
    N(this, "hovered", null);
    N(this, "spec", null);
    N(this, "glyph");
    N(this, "pending", []);
    N(this, "cursor", null);
    N(this, "gesture", null);
    /** TV table UI of the selected table: active cell, open editor, hovered
     *  resize edge. */
    N(this, "tableUi", null);
    /** Cursor over the hovered drawing (TV: pointer, move when selected,
     *  resize cursors on anchors and table edges), null = the chart's own. */
    N(this, "hoverCursor", null);
    N(this, "shift", !1);
    N(this, "ctrl", !1);
    N(this, "savedScroll", null);
    N(this, "off", []);
    this.chart = t, this.series = n, this.opts = { magnet: "off", ...o };
    const i = o.bars ?? (() => ef(n));
    this.coords = Na(t, n, i, () => [], o.timeInfo), this.primitive = new of(this), n.attachPrimitive(this.primitive), this.el = t.chartElement(), this.listen(this.el, "pointerdown", (r) => this.onPointerDown(r), !0), this.listen(this.el, "pointermove", (r) => this.onHover(r)), this.listen(this.el, "pointerleave", () => {
      this.hoverCursor = null, this.setHover(null);
    }), this.listen(this.el, "dblclick", (r) => this.onDoubleClick(r), !0), this.listen(window, "keydown", (r) => this.onKey(r)), this.listen(window, "keyup", (r) => this.onKey(r)), this.listen(window, "blur", () => {
      this.shift = !1, this.ctrl = !1;
    }), this.off.push(fl(() => {
      var r;
      for (const l of this.list) l.kind === "image" && ul((r = l.image) == null ? void 0 : r.name) && this.remove(l.id);
      this.redraw();
    }));
  }
  on(t, n) {
    return this.listeners[t].add(n), () => this.listeners[t].delete(n);
  }
  /** Arm a tool (a DrawingKind of the core specs) or disarm (null). `glyph`:
   *  the font-icon glyph to place. */
  setTool(t, n = {}) {
    const o = t ? sn(t) ?? null : null;
    o && this.setDrawingsVisible(!0), this.spec = o, this.glyph = n.glyph, this.pending = [], this.cursor = null, this.emit("tool", o ? o.kind : null), this.redraw();
  }
  tool() {
    var t;
    return ((t = this.spec) == null ? void 0 : t.kind) ?? null;
  }
  setMagnet(t) {
    this.opts.magnet = t;
  }
  setInterval(t) {
    this.opts.interval = t, this.dropHidden(), this.redraw();
  }
  /** TV "Hide all drawings": hide / show every drawing without touching
   *  them (the drawings' own `hidden` flag and the saved JSON stay as they
   *  are). Hiding disarms the tool and clears the selection. */
  setDrawingsVisible(t) {
    this.visible !== t && (this.visible = t, t || (this.spec && this.setTool(null), this.dropHidden()), this.emit("visibility", t), this.redraw());
  }
  drawingsVisible() {
    return this.visible;
  }
  setStayInDrawingMode(t) {
    this.opts.stayInDrawingMode = t;
  }
  drawings() {
    return this.list;
  }
  get(t) {
    return this.list.find((n) => n.id === t);
  }
  /** Add a drawing (default style of its kind when none); returns its id. */
  add(t) {
    const n = { id: Ja(), style: Kt(t.kind), ...t };
    return this.list = [...this.list, n], this.emit("add", n), this.changed(), n.id;
  }
  update(t) {
    const n = this.get(t.id);
    n && (this.list = this.list.map((o) => o.id === t.id ? t : o), this.dropHidden(), this.emit("update", t, n), this.changed());
  }
  /** Hide / show one drawing (its `hidden` flag, saved with it): a hidden
   *  drawing is not drawn, hit or selected. */
  setHidden(t, n) {
    const o = this.get(t);
    !o || !!o.hidden === n || this.update({ ...o, hidden: n });
  }
  remove(t) {
    const n = this.get(t);
    n && (this.list = this.list.filter((o) => o.id !== t), this.selected.includes(t) && this.select(this.selected.filter((o) => o !== t)), this.emit("remove", n), this.changed());
  }
  clear() {
    this.list = [], this.select([]), this.changed();
  }
  /** Z-order (TV Visual order): the list order is the draw order. */
  bringToFront(t) {
    this.reorder(t, this.list.length - 1);
  }
  sendToBack(t) {
    this.reorder(t, 0);
  }
  select(t) {
    this.selected = t.filter((n) => this.get(n)), this.tableUi && !this.selected.includes(this.tableUi.id) && (this.tableUi = null), this.emit("selection", this.selected), this.redraw();
  }
  selection() {
    return this.selected;
  }
  /** TV image: placed at the pane centre at its initial size (a quarter of
   *  the pane at most) and selected. The file must be known to the core
   *  image cache (cacheImage / setImageReader) under `name`. */
  addImage(t) {
    const { w: n, h: o } = this.paneSize(), i = _(this.coords, { x: n / 2, y: o / 2 });
    if (!i) return null;
    const r = Kt("image"), l = this.add({
      kind: "image",
      points: [i],
      image: { name: t.name, ...dl(t.width, t.height, n, o) },
      style: { ...r, transparency: t.transparency ?? r.transparency }
    });
    return this.select([l]), l;
  }
  /** TV "Anchor drawing" (text, pin, table): an anchored drawing keeps its
   *  pane position when the chart scrolls; toggling back turns it into a
   *  time / price point again. Returns whether the drawing changed. */
  toggleAnchored(t) {
    const n = this.get(t);
    if (!n) return !1;
    const o = _a(n, this.coords, this.paneSize());
    return o ? (this.update(o), this.emit("gestureEnd"), !0) : !1;
  }
  /** The table UI state (active cell, editor open, hovered edge) or null. */
  tableState() {
    return this.tableUi;
  }
  setTableCellText(t, n, o) {
    const i = this.get(t);
    (i == null ? void 0 : i.kind) === "table" && this.update({ ...i, style: { ...i.style, ...al(i.style, n, o) } });
  }
  /** The cell editor closed (the cell stays active). */
  endTableEdit() {
    this.tableUi && (this.tableUi = { ...this.tableUi, editing: !1 }), this.redraw();
  }
  /** TV table context actions on the active cell (insert after it, or at the
   *  end without one; remove its row / column). */
  tableOp(t, n) {
    var r, l;
    const o = this.get(t);
    if ((o == null ? void 0 : o.kind) !== "table") return;
    const i = ((r = this.tableUi) == null ? void 0 : r.id) === t ? this.tableUi.cell : null;
    if (n === "insert-column" || n === "insert-row")
      this.update({ ...o, style: { ...o.style, ...ll(o.style, n === "insert-row" ? "row" : "column", i) } });
    else {
      const s = n === "remove-row" ? "row" : "column";
      if (!i || !sl(o.style, s)) return;
      const a = cl(o.style, s, i);
      this.update({ ...o, style: { ...o.style, ...a.patch } }), this.tableUi = { id: t, cell: a.cell, editing: ((l = this.tableUi) == null ? void 0 : l.editing) ?? !1, edge: null };
    }
    this.emit("gestureEnd");
  }
  /** The drawings as JSON (the core Drawing model). */
  exportJSON() {
    return JSON.stringify(this.list);
  }
  /** Replace the drawings from JSON (string or parsed): entries are checked
   *  and migrated (core parseDrawings); returns how many were loaded. */
  importJSON(t) {
    const n = typeof t == "string" ? JSON.parse(t) : t;
    return this.list = ua(n), this.select([]), this.changed(), this.list.length;
  }
  /** Redraw on the next frame (the chart repaints the primitive). */
  redraw() {
    this.primitive.requestUpdate();
  }
  destroy() {
    this.endGesture();
    for (const t of this.off) t();
    this.series.detachPrimitive(this.primitive);
  }
  // ── rendering (called by the primitive) ─────────────────────────────────
  /** Every visible drawing, then the placement preview, as scenes in pane
   *  coordinates, with the anchor state of their drawing (TV ring stroke 2
   *  when selected, the hovered anchor's halo). */
  scenes(t, n) {
    var s, a;
    const o = [], i = this.coords, r = { w: t, h: n };
    for (const c of this.list) {
      if (!this.shown(c)) continue;
      const f = ye(i, c, r);
      if (!f) continue;
      const h = this.selected.includes(c.id), u = ((s = this.hovered) == null ? void 0 : s.id) === c.id && !c.locked, x = h || u && !this.spec, d = c.kind === "table" && h && ((a = this.tableUi) == null ? void 0 : a.id) === c.id ? this.tableUi : null, p = tn(c, f, { w: t, h: n, coords: i, selected: x && !c.locked, hovered: u, textSelected: h, tableUi: d });
      o.push({ scene: p, selected: h, hoveredAnchor: u ? this.hovered.anchor : -1 }), h && c.locked && o.push({ scene: ha(f, c.style.color), selected: h, hoveredAnchor: -1 });
    }
    const l = this.previewScene(t, n);
    return l && o.push({ scene: l, selected: !1, hoveredAnchor: -1 }), o;
  }
  /** Axis labels of the visible drawings (core drawingAxisLabels) as
   *  lightweight-charts axis views: prices formatted by the series, times by
   *  the chart's time formatter. */
  axisViews() {
    const t = [], n = [], o = this.coords, i = this.paneSize(), r = this.series.priceFormatter();
    for (const l of this.list) {
      if (!this.shown(l)) continue;
      const s = ye(o, l, i);
      if (!s) continue;
      const a = xs(l, s, o);
      for (const c of a.price) {
        const f = o.priceToY(c.price);
        f != null && t.push(Fo(f, r.format(c.price), c.back, c.color));
      }
      for (const c of a.time) {
        const f = o.timeToX(c.time);
        f != null && n.push(Fo(f, o.formatTime(c.time), c.back, c.color));
      }
    }
    return { price: t, time: n };
  }
  /** The cursor at a pane point, for the primitive hitTest (lightweight-
   *  charts shows it): crosshair while a tool is armed, the hovered
   *  drawing's cursor, else null (the chart's own). */
  hoveredId() {
    var t;
    return ((t = this.hovered) == null ? void 0 : t.id) ?? null;
  }
  cursorAt() {
    var t;
    return this.spec ? "crosshair" : (t = this.gesture) != null && t.active ? this.gesture.mode.hit === "body" ? "move" : this.hoverCursor : this.hoverCursor;
  }
  fontFamily() {
    return this.opts.fontFamily ?? this.chart.options().layout.fontFamily;
  }
  /** Chart background at a y (the anchor fill). */
  backgroundAt(t, n) {
    const o = this.chart.options().layout.background;
    return o.type === "gradient" && o.topColor && o.bottomColor ? nf(o.topColor, o.bottomColor, n > 0 ? Math.max(0, Math.min(1, t / n)) : 0) : o.color ?? "#ffffff";
  }
  // ── internals ─────────────────────────────────────────────────────────────
  listen(t, n, o, i = !1) {
    t.addEventListener(n, o, i), this.off.push(() => t.removeEventListener(n, o, i));
  }
  emit(t, ...n) {
    for (const o of this.listeners[t]) o(...n);
  }
  changed() {
    this.emit("change", this.list), this.redraw();
  }
  reorder(t, n) {
    const o = this.list.findIndex((l) => l.id === t);
    if (o < 0) return;
    const i = this.list.slice(), [r] = i.splice(o, 1);
    i.splice(Math.max(0, Math.min(i.length, n)), 0, r), this.list = i, this.changed();
  }
  shown(t) {
    return this.visible && !t.hidden && (this.opts.interval == null || br(t.visibility, this.opts.interval));
  }
  /** Drawings that are no longer shown leave the selection and the hover:
   *  Delete must not remove a drawing the user cannot see. */
  dropHidden() {
    const t = (n) => {
      const o = this.get(n);
      return !!o && this.shown(o);
    };
    this.hovered && !t(this.hovered.id) && (this.hovered = null, this.hoverCursor = null), this.selected.every(t) || this.select(this.selected.filter(t));
  }
  paneSize() {
    const t = this.series.getPane().paneIndex(), n = this.chart.paneSize(t);
    return { w: n.width, h: n.height };
  }
  /** Pointer position in pane coordinates. */
  panePoint(t) {
    const o = (this.series.getPane().getHTMLElement() ?? this.el).getBoundingClientRect(), i = this.chart.priceScale("left").width(), r = this.el.getBoundingClientRect().left;
    return { x: t.clientX - r - i, y: t.clientY - o.top };
  }
  magnet() {
    var i;
    const t = this.opts.magnet ?? "off", n = t === "strong" ? "strong" : "weak", o = this.pending.length > 0 || !!((i = this.gesture) != null && i.active) && this.gesture.mode.hit === "handle";
    return this.shift && o ? { enabled: !1, mode: n } : this.ctrl ? { enabled: t === "off", mode: "strong" } : { enabled: t !== "off", mode: n };
  }
  snapFn() {
    const t = this.magnet(), n = this.coords;
    return t.enabled ? (o) => $o(o, n, t.mode) ?? o : (o) => o;
  }
  dataAt(t) {
    const n = _(this.coords, t);
    return n ? this.snapFn()(n) : null;
  }
  /** The magnet-snapped aim point of the preview (x and y lock onto the
   *  candle when the magnet engages). */
  aimAt(t) {
    const n = this.magnet();
    if (!n.enabled) return t;
    const o = _(this.coords, t), i = o ? $o(o, this.coords, n.mode) : null;
    return i && Q(this.coords, i) || t;
  }
  hitTopmost(t) {
    const { w: n, h: o } = this.paneSize();
    if (t.x < 0 || t.x > n || t.y < 0 || t.y > o) return null;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i];
      if (!this.shown(r)) continue;
      const l = ye(this.coords, r, { w: n, h: o });
      if (!l) continue;
      const s = fs(r, l, t, n, o, this.coords, this.selected.includes(r.id));
      if (s) return { drawing: r, mode: s, pts: l };
    }
    return null;
  }
  setHover(t) {
    var n, o;
    ((n = this.hovered) == null ? void 0 : n.id) === (t == null ? void 0 : t.id) && ((o = this.hovered) == null ? void 0 : o.anchor) === (t == null ? void 0 : t.anchor) || (this.hovered = t, this.redraw());
  }
  /** Take the pointer gesture from the chart: no pan / zoom until release. */
  holdChart() {
    if (this.savedScroll) return;
    const t = this.chart.options();
    this.savedScroll = { handleScroll: structuredClone(t.handleScroll), handleScale: structuredClone(t.handleScale) }, this.chart.applyOptions({ handleScroll: !1, handleScale: !1 });
  }
  releaseChart() {
    this.savedScroll && (this.chart.applyOptions(this.savedScroll), this.savedScroll = null);
  }
  onKey(t) {
    const n = t.type === "keydown";
    if (t.key === "Shift" ? this.shift = n : (t.key === "Control" || t.key === "Meta") && (this.ctrl = n), !n) return;
    const o = t.target;
    if (!(o && (o.tagName === "INPUT" || o.tagName === "TEXTAREA" || o.isContentEditable))) {
      if (t.key === "Escape") {
        if (this.pending.length)
          this.pending = [], this.redraw();
        else if (this.spec) this.setTool(null);
        else if (this.selected.length) this.select([]);
        else return;
        t.preventDefault();
      } else if ((t.key === "Delete" || t.key === "Backspace") && this.selected.length) {
        const i = this.selected.filter((r) => {
          var l;
          return !((l = this.get(r)) != null && l.locked);
        });
        if (!i.length) return;
        for (const r of i) this.remove(r);
        t.preventDefault();
      }
    }
  }
  onHover(t) {
    var l, s;
    if (this.gesture || t.buttons) return;
    const n = this.panePoint(t);
    if (this.spec) {
      this.cursor = n, this.redraw();
      return;
    }
    const o = this.hitTopmost(n);
    this.setHover(o ? { id: o.drawing.id, anchor: o.mode.hit === "handle" ? o.mode.handleIndex : -1 } : null);
    const i = (o == null ? void 0 : o.drawing.kind) === "table" && o.mode.hit === "handle" ? hi(o.mode.handleIndex) : null, r = this.tableUi;
    (o == null ? void 0 : o.drawing.kind) === "table" && this.selected.includes(o.drawing.id) ? ((((l = r == null ? void 0 : r.edge) == null ? void 0 : l.row) ?? -1) !== ((i == null ? void 0 : i.row) ?? -1) || (((s = r == null ? void 0 : r.edge) == null ? void 0 : s.col) ?? -1) !== ((i == null ? void 0 : i.col) ?? -1) || (r == null ? void 0 : r.id) !== o.drawing.id) && (this.tableUi = r && r.id === o.drawing.id ? { ...r, edge: i } : { id: o.drawing.id, cell: null, editing: !1, edge: i }, this.redraw()) : r != null && r.edge && (this.tableUi = { ...r, edge: null }, this.redraw()), this.hoverCursor = o ? o.drawing.locked ? "default" : i ? i.col != null && i.row != null ? "default" : i.col != null ? "ew-resize" : "ns-resize" : o.mode.hit === "handle" ? Fa(o.pts[o.mode.handleIndex] ?? n, o.pts) : this.selected.includes(o.drawing.id) ? "move" : "pointer" : null;
  }
  onPointerDown(t) {
    if (t.button !== 0) return;
    const n = this.panePoint(t), { w: o, h: i } = this.paneSize();
    if (!(n.x < 0 || n.x > o || n.y < 0 || n.y > i)) {
      if (this.spec) {
        t.stopPropagation(), this.holdChart(), this.spec.freehand ? this.startFreehand(n) : (this.placementClick(n), window.addEventListener("pointerup", () => this.releaseChart(), { once: !0 }));
        return;
      }
      this.selectionDown(t, n);
    }
  }
  onDoubleClick(t) {
    var o, i;
    if ((o = this.spec) != null && o.variableLength) {
      t.stopPropagation(), this.finishVariable(!1);
      return;
    }
    if (this.spec) return;
    const n = this.hitTopmost(this.panePoint(t));
    n && ((i = sn(n.drawing.kind)) != null && i.textEditable) && (t.stopPropagation(), this.emit("textEdit", n.drawing, tf(n.drawing, n.pts)));
  }
  placementClick(t) {
    const n = this.spec;
    if (n.kind === "image") return;
    const o = t, i = this.pending, r = this.coords;
    if (n.variableLength && i.length >= 1) {
      const x = (d) => {
        const p = Q(r, d);
        return !!p && Math.hypot(p.x - o.x, p.y - o.y) < nr;
      };
      if (x(i[i.length - 1])) {
        i.length >= 2 && this.finishVariable(!1);
        return;
      }
      if (n.kind === "polyline" && i.length >= 2 && x(i[0])) {
        this.finishVariable(!0);
        return;
      }
    }
    const l = this.dataAt(o);
    if (!l) return;
    const s = this.shift ? Io(n.kind, i, l, r) : { point: l }, a = s.point, c = s.extra ? [...i, a, s.extra] : [...i, a];
    if (n.variableLength || c.length < n.pointCount) {
      this.pending = c, this.cursor = o, this.redraw();
      return;
    }
    const { w: f, h } = this.paneSize();
    let u = Bo(n.kind, c, r, { w: f, h }, { glyph: this.glyph });
    u && n.kind === "signpost" && (u = { ...u, style: { ...Kt("signpost"), signpostPosition: $i(r, c[0], h) } }), this.pending = [], this.cursor = null, u ? this.placeNew(u, n.textEditable ? o : null) : this.afterPlacement();
  }
  finishVariable(t) {
    const n = this.spec;
    if (!(n != null && n.variableLength) || this.pending.length < 2) return;
    const { w: o, h: i } = this.paneSize(), r = Bo(n.kind, this.pending, this.coords, { w: o, h: i }, { closed: t });
    this.pending = [], this.cursor = null, r ? this.placeNew(r, null) : this.afterPlacement();
  }
  /** TV selects every new drawing once placed; text tools ask the host for
   *  their editor. */
  placeNew(t, n) {
    const o = this.add(t);
    this.opts.stayInDrawingMode || this.select([o]);
    const i = this.get(o);
    i && n && this.emit("textEdit", i, n), this.afterPlacement();
  }
  afterPlacement() {
    this.emit("gestureEnd"), this.opts.stayInDrawingMode ? this.redraw() : this.setTool(null);
  }
  /** Brush / highlighter: press, drag (a vertex every FREEHAND_SAMPLE_PX),
   *  release commits (no magnet, like TV). */
  startFreehand(t) {
    const n = this.spec, o = _(this.coords, t);
    if (!o) return;
    this.pending = [o], this.cursor = t;
    let i = t;
    const r = (s) => {
      const a = this.panePoint(s);
      if (this.cursor = a, Math.hypot(a.x - i.x, a.y - i.y) < ya) return;
      const c = _(this.coords, a);
      c && (i = a, this.pending = [...this.pending, c], this.redraw());
    }, l = () => {
      document.removeEventListener("pointermove", r), document.removeEventListener("pointerup", l), this.releaseChart();
      const s = this.pending;
      this.pending = [], this.cursor = null;
      const a = s.length >= 2 ? bn(n.kind, s) : null;
      a ? this.placeNew(a, null) : this.afterPlacement();
    };
    document.addEventListener("pointermove", r), document.addEventListener("pointerup", l);
  }
  selectionDown(t, n) {
    const o = this.hitTopmost(n), i = t.ctrlKey || t.metaKey;
    if (!o) {
      !i && this.selected.length && this.select([]);
      return;
    }
    t.stopPropagation(), this.holdChart();
    const r = this.selected, l = r.includes(o.drawing.id), s = l && r.length > 1;
    if (!i && !l && this.select([o.drawing.id]), o.drawing.locked) {
      i ? this.toggle(o.drawing.id) : s && this.select([o.drawing.id]), window.addEventListener("pointerup", () => this.releaseChart(), { once: !0 });
      return;
    }
    const a = this.paneSize(), c = s && o.mode.hit === "body" ? r.map((u) => this.get(u)).filter((u) => !!u && !u.locked && this.shown(u)).map((u) => ({ start: u, startScreen: ye(this.coords, u, a) })).filter((u) => !!u.startScreen) : void 0;
    this.gesture = {
      id: o.drawing.id,
      start: o.drawing,
      startCursor: n,
      startScreen: o.pts,
      mode: o.mode,
      active: !1,
      group: c,
      pendingToggle: i,
      pendingCollapse: !i && s,
      pane: a,
      canDrag: o.mode.hit === "handle" || l
    };
    const f = (u) => this.dragMove(this.panePoint(u)), h = () => {
      var x, d;
      document.removeEventListener("pointermove", f), document.removeEventListener("pointerup", h);
      const u = this.gesture;
      if (u && !u.active && (u.pendingToggle ? this.toggle(u.id) : u.pendingCollapse && this.select([u.id]), u.start.kind === "table" && !i && (u.mode.hit === "body" && u.mode.cell && l ? this.openCell(u.start, u.mode.cell) : u.mode.hit === "handle" && u.mode.handleIndex < 4 && ((x = this.tableUi) == null ? void 0 : x.id) === u.id && (this.tableUi = { ...this.tableUi, cell: null, editing: !1 }, this.redraw()))), u != null && u.active && u.start.kind === "image") {
        const p = this.get(u.id);
        if (((d = p == null ? void 0 : p.image) == null ? void 0 : d.dx) != null) {
          const { dx: y, ...m } = p.image;
          this.update({ ...p, image: m });
        }
      }
      this.endGesture(), this.emit("gestureEnd");
    };
    document.addEventListener("pointermove", f), document.addEventListener("pointerup", h);
  }
  dragMove(t) {
    const n = this.gesture;
    if (!n) return;
    if (!n.active) {
      if (!n.canDrag || Math.hypot(t.x - n.startCursor.x, t.y - n.startCursor.y) < da) return;
      if (n.pendingToggle && n.mode.hit === "body" && !n.group) {
        const { id: i, ...r } = n.start;
        this.add(r), this.select([n.id]);
      }
      n.active = !0, n.pendingToggle = !1, n.pendingCollapse = !1;
    }
    if (n.group) {
      const i = { dx: t.x - n.startCursor.x, dy: t.y - n.startCursor.y }, { dx: r, dy: l } = this.shift ? qn(i.dx, i.dy) : i;
      for (const s of n.group) {
        const a = mn(this.coords, s.start, s.startScreen, r, l, this.paneSize());
        a && this.update(a);
      }
      return;
    }
    const o = Pa(n, t, this.coords, this.snapFn(), this.shift);
    o && this.update(o);
  }
  endGesture() {
    this.gesture = null, this.releaseChart();
  }
  openCell(t, n) {
    this.tableUi = { id: t.id, cell: n, editing: !0, edge: null }, this.redraw();
    const o = ye(this.coords, t, this.paneSize());
    if (!o) return;
    const i = zn(t, o[0]), [r, l] = n;
    this.emit("tableEdit", t, n, { left: i.xs[l], top: i.ys[r], width: i.xs[l + 1] - i.xs[l], height: i.ys[r + 1] - i.ys[r] });
  }
  toggle(t) {
    this.select(this.selected.includes(t) ? this.selected.filter((n) => n !== t) : [...this.selected, t]);
  }
  /** The live placement preview: the real tool with the cursor standing in
   *  for the unplaced points (TV), the real freehand stroke, or the segment
   *  rubber band (patterns, Elliott, variable-length tools). */
  previewScene(t, n) {
    const o = this.spec, i = this.pending, r = this.cursor;
    if (!o || !i.length || !r) return null;
    const l = this.coords, s = i.map((x) => Q(l, x)).filter((x) => !!x);
    if (!s.length) return null;
    const a = Kt(o.kind), c = this.aimAt(r), f = s.map((x) => ({ t: "circle", cx: x.x, cy: x.y, r: 3, fill: a.color }));
    if (!o.variableLength && !o.freehand && !ba.has(o.kind) && s.length === i.length && s.length < o.pointCount) {
      const x = this.dataAt(c), d = x && this.shift ? Io(o.kind, i, x, l) : null, p = d ? d.point : x;
      if (p) {
        const y = [...i, p];
        for (d != null && d.extra && y.push(d.extra); y.length < o.pointCount; ) y.push(p);
        const m = bn(o.kind, y), b = m && o.kind === "gann-square" ? rr(m, l) : m, g = b ? { ...b, id: "__preview__", style: a } : null, w = g ? or(l, g.points) : null;
        if (g && w) return [...tn(g, w, { w: t, h: n, coords: l, selected: !1 }), ...f];
      }
    }
    if (o.freehand && s.length >= 2)
      return tn({ id: "__preview__", kind: o.kind, points: i, style: a }, s, { w: t, h: n, coords: l, selected: !1 });
    const h = s[s.length - 1], u = [];
    return s.length >= 2 && u.push({ t: "polyline", pts: s, fill: "none", stroke: a.color, strokeWidth: a.width, cap: "round" }), u.push({ t: "line", a: h, b: c, stroke: a.color, strokeWidth: a.width, cap: "round" }), [...u, ...f];
  }
}
function tf(e, t) {
  return (e.kind === "callout" || e.kind === "note") && t[1] ? t[1] : e.kind === "price-note" && t[1] ? { x: (t[0].x + t[1].x) / 2, y: (t[0].y + t[1].y) / 2 } : t[0];
}
function ef(e) {
  return e.data().map((t) => {
    const n = t, o = n.value ?? n.close ?? 0;
    return { time: n.time, open: n.open ?? o, high: n.high ?? o, low: n.low ?? o, close: n.close ?? o, volume: n.volume };
  });
}
function nf(e, t, n) {
  const o = /^#([0-9a-f]{6})$/i.exec(e), i = /^#([0-9a-f]{6})$/i.exec(t);
  if (!o || !i) return e;
  const r = parseInt(o[1], 16), l = parseInt(i[1], 16), s = (a) => Math.round((r >> a & 255) + ((l >> a & 255) - (r >> a & 255)) * n);
  return "#" + (s(16) << 16 | s(8) << 8 | s(0)).toString(16).padStart(6, "0");
}
function Fo(e, t, n, o) {
  return { coordinate: () => e, text: () => t, backColor: () => n, textColor: () => o, visible: () => !0, tickVisible: () => !0 };
}
class of {
  constructor(t) {
    N(this, "m");
    N(this, "request", null);
    N(this, "view");
    N(this, "axis", { price: [], time: [] });
    this.m = t;
    const n = { draw: (o) => this.draw(o) };
    this.view = { zOrder: () => "top", renderer: () => n };
  }
  attached(t) {
    this.request = t.requestUpdate;
  }
  detached() {
    this.request = null;
  }
  paneViews() {
    return [this.view];
  }
  updateAllViews() {
    this.axis = this.m.axisViews();
  }
  priceAxisViews() {
    return this.axis.price;
  }
  timeAxisViews() {
    return this.axis.time;
  }
  requestUpdate() {
    var t;
    (t = this.request) == null || t.call(this);
  }
  /** lightweight-charts sets the pane cursor from this (the manager's hover
   *  state, updated on pointer move). */
  hitTest() {
    const t = this.m.cursorAt();
    return t ? { cursorStyle: t, externalId: `lwcd:${this.m.hoveredId() ?? ""}:${t}`, zOrder: "top" } : null;
  }
  draw(t) {
    t.useMediaCoordinateSpace(({ context: n, mediaSize: o }) => {
      const i = o.width, r = o.height;
      n.save(), n.beginPath(), n.rect(0, 0, i, r), n.clip();
      const l = this.m.fontFamily(), s = (c) => this.m.backgroundAt(c, r), a = () => this.requestUpdate();
      for (const c of this.m.scenes(i, r))
        Ua(n, c.scene, { fontFamily: l, anchors: { fillAt: s, selected: c.selected, hovered: c.hoveredAnchor }, onAsyncLoad: a });
      n.restore();
    });
  }
}
const pf = "0.6.2";
export {
  Oa as ANCHORABLE_KINDS,
  vn as DEFAULT_STYLE,
  yf as DrawingManager,
  af as IMAGE_MAX_BYTES,
  fo as IMAGE_MAX_SIDE,
  ff as IMAGE_TYPES,
  Ne as OVERLAY_SPECS,
  Eo as TV_ANCHOR_COLOR,
  pf as VERSION,
  Fa as anchorCursor,
  Pa as applyDrag,
  bn as buildNewDrawing,
  uf as cacheImage,
  hl as decodeImage,
  Kt as defaultStyleFor,
  Ua as drawScene,
  xs as drawingAxisLabels,
  sf as factoryStyleFor,
  xf as fibLevelAt,
  sn as findOverlaySpec,
  Bo as finishPlacement,
  fs as hitTestKind,
  Da as isAnchorable,
  br as isVisibleOnInterval,
  Na as makeCoords,
  xa as migrateDrawing,
  fl as onImagesChanged,
  ua as parseDrawings,
  ha as sceneLockedAnchors,
  tn as sceneOf,
  cf as setDefaultStyleOverride,
  hf as setImageReader,
  df as timeToXFallback,
  _a as toggleAnchored,
  kr as volumeProfileDefaults,
  In as volumeProfileStyle
};
//# sourceMappingURL=lightweight-charts-drawing.es.js.map
