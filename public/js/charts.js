// Własne wykresy SVG (bez bibliotek). Rysują się do szerokości kontenera.
import { esc, minToHm } from './format.js';

export function niceTicks(min, max, count = 5) {
  if (!(max > min)) { max = min + 1; min = min - 1; }
  const step0 = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e8) / 1e8);
  return ticks;
}

function placeTip(el, tip, x, y) {
  tip.hidden = false;
  const w = tip.offsetWidth;
  const maxX = el.clientWidth - w - 4;
  tip.style.left = `${Math.max(4, Math.min(maxX, x + 14))}px`;
  tip.style.top = `${Math.max(4, y - tip.offsetHeight - 12)}px`;
}

function ensureTip(el) {
  let tip = el.querySelector(':scope > .tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tip';
    tip.hidden = true;
    el.appendChild(tip);
  }
  return tip;
}

/**
 * pts: [{cum, xl, tip}] (pierwszy to start). o: {fmtY, height}
 */
export function drawEquity(el, pts, o) {
  const W = Math.max(280, el.clientWidth || 600);
  const H = o.height ?? (W < 520 ? 230 : 320);
  const ml = W < 520 ? 44 : 56, mr = 14, mt = 14, mb = 28;
  const pw = W - ml - mr, ph = H - mt - mb;
  const second = !!o.second; // druga, przerywana seria w p.cum2 (np. Live + Paper)
  const gid = o.id || 'eqfill';
  const vals = pts.map((p) => p.cum).concat(second ? pts.map((p) => p.cum2) : [], 0);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals), W < 520 ? 4 : 5);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const X = (i) => ml + (pts.length === 1 ? 0 : (i / (pts.length - 1)) * pw);
  const Y = (v) => mt + (1 - (v - lo) / (hi - lo)) * ph;

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.cum).toFixed(1)}`).join('');
  const line2 = second ? pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.cum2).toFixed(1)}`).join('') : '';
  const area = `${line}L${X(pts.length - 1).toFixed(1)},${Y(0).toFixed(1)}L${X(0).toFixed(1)},${Y(0).toFixed(1)}Z`;

  const grid = ticks.map((t) => {
    const y = Y(t).toFixed(1);
    return `<line class="grid${t === 0 ? ' zero' : ''}" x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}"/>` +
      `<text class="axis" x="${ml - 8}" y="${y}" text-anchor="end" dominant-baseline="middle">${esc(o.fmtY(t))}</text>`;
  }).join('');

  const want = Math.min(pts.length, W < 520 ? 3 : 6);
  const idxs = new Set();
  for (let k = 0; k < want; k++) idxs.add(Math.round((k / Math.max(1, want - 1)) * (pts.length - 1)));
  const xl = [...idxs].map((i) => {
    const anchor = i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle';
    return `<text class="axis" x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${esc(pts[i].xl)}</text>`;
  }).join('');

  const last = pts[pts.length - 1];
  // ostatni punkt dostaje kolor wyniku (zysk / strata), reszta jest w kolorze linii
  const endCls = last.cum > 1e-9 ? ' end pos' : last.cum < -1e-9 ? ' end neg' : '';
  const endDot = `<circle class="dot${endCls}" cx="${X(pts.length - 1).toFixed(1)}" cy="${Y(last.cum).toFixed(1)}" r="3.8"/>`;
  const dots = pts.length <= 40 && !second
    ? pts.slice(1, -1).map((p, i) => `<circle class="dot" cx="${X(i + 1).toFixed(1)}" cy="${Y(p.cum).toFixed(1)}" r="3"/>`).join('') + (pts.length > 1 ? endDot : '')
    : endDot;

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.label)}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop class="eq-a" offset="0"/><stop class="eq-b" offset="1"/></linearGradient></defs>
    ${grid}${xl}
    <path d="${area}" fill="url(#${gid})"/>
    ${second ? `<path class="eq-line2" d="${line2}"/>` : ''}
    <path class="eq-line" d="${line}"/>
    ${dots}
    <g class="cross" hidden><line class="cross-v" y1="${mt}" y2="${H - mb}"/><circle class="cross-dot" r="5"/></g>
    <rect class="hit" x="${ml}" y="${mt}" width="${pw}" height="${ph}" fill="transparent"/>
  </svg>`;
  const tip = ensureTip(el);
  const cross = el.querySelector('.cross');
  const cv = cross.querySelector('.cross-v');
  const cd = cross.querySelector('.cross-dot');
  const hit = el.querySelector('.hit');
  const show = (ev) => {
    const r = el.getBoundingClientRect();
    const px = ev.clientX - r.left;
    const i = pts.length === 1 ? 0 : Math.max(0, Math.min(pts.length - 1, Math.round(((px - ml) / pw) * (pts.length - 1))));
    const x = X(i), y = Y(pts[i].cum);
    cross.hidden = false;
    cv.setAttribute('x1', x); cv.setAttribute('x2', x);
    cd.setAttribute('cx', x); cd.setAttribute('cy', y);
    tip.innerHTML = pts[i].tip;
    placeTip(el, tip, x, y);
  };
  const hide = () => { cross.hidden = true; tip.hidden = true; };
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', hide);
}

function rbar(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Słupki grupowane: months [{label, a, b, tipA, tipB}], o: {fmtY, classA, classB}
 */
export function drawBars(el, months, o) {
  const W = Math.max(280, el.clientWidth || 500);
  const H = o.height ?? (W < 520 ? 220 : 260);
  const ml = W < 520 ? 44 : 52, mr = 8, mt = 12, mb = 26;
  const pw = W - ml - mr, ph = H - mt - mb;
  const maxV = Math.max(1, ...months.flatMap((m) => [m.a, m.b]));
  const ticks = niceTicks(0, maxV, 4);
  const hi = ticks[ticks.length - 1];
  const Y = (v) => mt + (1 - v / hi) * ph;
  const gw = pw / months.length;
  const bw = Math.max(6, Math.min(26, gw * 0.3));
  const gap = 3;
  const grid = ticks.map((t) => {
    const y = Y(t).toFixed(1);
    return `<line class="grid${t === 0 ? ' zero' : ''}" x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}"/>` +
      `<text class="axis" x="${ml - 8}" y="${y}" text-anchor="end" dominant-baseline="middle">${esc(o.fmtY(t))}</text>`;
  }).join('');
  const every = Math.ceil(months.length / Math.max(1, Math.floor(pw / 46)));
  const bars = months.map((m, i) => {
    const cx = ml + gw * i + gw / 2;
    const xa = cx - gap / 2 - bw, xb = cx + gap / 2;
    const ha = (m.a / hi) * ph, hb = (m.b / hi) * ph;
    const lab = i % every === 0 ? `<text class="axis" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(m.label)}</text>` : '';
    return `${lab}
      <g class="bar-g" data-tip="${esc(m.tip)}">
        <rect class="bar-hit" x="${(cx - gw / 2).toFixed(1)}" y="${mt}" width="${gw.toFixed(1)}" height="${ph}" fill="transparent"/>
        <path class="${o.classA}" d="${rbar(xa, Y(m.a), bw, ha, 4)}"/>
        <path class="${o.classB}" d="${rbar(xb, Y(m.b), bw, hb, 4)}"/>
      </g>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.label)}">${grid}${bars}</svg>`;
  const tip = ensureTip(el);
  el.querySelectorAll('.bar-g').forEach((g) => {
    const on = (ev) => {
      const r = el.getBoundingClientRect();
      tip.innerHTML = g.dataset.tip;
      placeTip(el, tip, ev.clientX - r.left, ev.clientY - r.top);
      g.classList.add('hl');
    };
    const off = () => { tip.hidden = true; g.classList.remove('hl'); };
    g.addEventListener('pointermove', on);
    g.addEventListener('pointerdown', on);
    g.addEventListener('pointerleave', off);
  });
}

/**
 * Wykres spadków (underwater): obszar od 0 w dół. pts: [{dd, xl, tip}] (ta sama oś i marginesy co krzywa kapitału, żeby słupki pasowały pod nią).
 */
export function drawUnderwater(el, pts, o) {
  const W = Math.max(280, el.clientWidth || 600);
  const H = o.height ?? (W < 520 ? 120 : 130);
  const ml = W < 520 ? 44 : 56, mr = 14, mt = 8, mb = 8;
  const pw = W - ml - mr, ph = H - mt - mb;
  const minV = Math.min(0, ...pts.map((p) => p.dd));
  const lo = minV < -1e-9 ? niceTicks(minV, 0, 2)[0] : -1;
  const X = (i) => ml + (pts.length === 1 ? 0 : (i / (pts.length - 1)) * pw);
  const Y = (v) => mt + (v / lo) * ph; // v <= 0, lo < 0: 0 na górze, lo na dole
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.dd).toFixed(1)}`).join('');
  const area = `${line}L${X(pts.length - 1).toFixed(1)},${Y(0).toFixed(1)}L${X(0).toFixed(1)},${Y(0).toFixed(1)}Z`;
  const ticks = minV < -1e-9 ? [0, lo] : [0];
  const grid = ticks.map((t) => `<line class="grid${t === 0 ? ' zero' : ''}" x1="${ml}" x2="${W - mr}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/><text class="axis" x="${ml - 8}" y="${Y(t).toFixed(1)}" text-anchor="end" dominant-baseline="middle">${esc(o.fmtY(t))}</text>`).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.label)}">
    ${grid}<path class="uw-area" d="${area}"/><path class="uw-line" d="${line}"/>
    <g class="cross" hidden><line class="cross-v" y1="${mt}" y2="${H - mb}"/><circle class="cross-dot" r="4"/></g>
    <rect class="hit" x="${ml}" y="${mt}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;
  const tip = ensureTip(el);
  const cross = el.querySelector('.cross');
  const hit = el.querySelector('.hit');
  const show = (ev) => {
    const r = el.getBoundingClientRect();
    const i = pts.length === 1 ? 0 : Math.max(0, Math.min(pts.length - 1, Math.round(((ev.clientX - r.left - ml) / pw) * (pts.length - 1))));
    const x = X(i), y = Y(pts[i].dd);
    cross.hidden = false;
    cross.querySelector('.cross-v').setAttribute('x1', x); cross.querySelector('.cross-v').setAttribute('x2', x);
    cross.querySelector('.cross-dot').setAttribute('cx', x); cross.querySelector('.cross-dot').setAttribute('cy', y);
    tip.innerHTML = pts[i].tip;
    placeTip(el, tip, x, y);
  };
  const hide = () => { cross.hidden = true; tip.hidden = true; };
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', hide);
}

// Podziałka tylko z liczb całkowitych, bez powtórzeń: co 1 przy małych liczbach, potem 2, 5, 10, 20 ...
function intTicks(maxV) {
  const m = Math.max(1, maxV);
  let step = 1;
  for (const s of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) { step = s; if (m / s <= 5) break; }
  const top = Math.ceil(m / step) * step;
  const t = [];
  for (let v = 0; v <= top; v += step) t.push(v);
  return t;
}

/**
 * Słupki od zera: items [{label, v, tip, kind, edge, center, aria}] (v == null: brak słupka). Kolor wg kind ('pos' | 'neg' | 'be'), a gdy brak, wg znaku v.
 * o: {fmtY, label, height, yInt, yTitle, barFill, edgeLabels, onPick(i)}. edgeLabels: etykiety jako granice przedziałów (item.edge przy lewej krawędzi słupka,
 * item.center pod środkiem słupka), co 2–5 słupków zależnie od gęstości, w Geist Mono. onPick: słupki są dostępne z klawiatury (strzałki, Enter).
 */
export function drawColumns(el, items, o) {
  const W = Math.max(280, el.clientWidth || 600);
  const H = o.height ?? (W < 520 ? 200 : 230);
  const ml = (o.yTitle ? 8 : 0) + (W < 520 ? 44 : 52), mr = 10, mt = 12, mb = 28;
  const pw = W - ml - mr, ph = H - mt - mb;
  const vals = items.map((m) => m.v).filter((v) => v != null);
  const ticks = o.yInt ? intTicks(Math.max(0, ...vals)) : niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 4);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const Y = (v) => mt + (1 - (v - lo) / (hi - lo)) * ph;
  const gw = pw / items.length;
  const bw = Math.max(3, Math.min(34, gw * (o.barFill ?? 0.62)));
  const grid = ticks.map((t) => `<line class="grid${t === 0 ? ' zero' : ''}" x1="${ml}" x2="${W - mr}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/><text class="axis" x="${ml - 8}" y="${Y(t).toFixed(1)}" text-anchor="end" dominant-baseline="middle">${esc(o.fmtY(t))}</text>`).join('');
  const every = Math.max(1, Math.ceil(items.length / Math.max(1, Math.floor(pw / 44))));
  const y0 = Y(0);
  // etykiety osi X
  const k = Math.max(2, Math.min(5, Math.ceil(46 / gw)));
  const anchor = Math.max(0, items.findIndex((m) => m.kind === 'be'));
  const tailIdx = items.map((m, i) => (m.tail ? i : -1)).filter((i) => i >= 0);
  const showEdge = (i) => !!items[i].edge && (i - anchor) % k === 0 && !tailIdx.some((t) => Math.abs(t - i) < 2) && i !== anchor;
  const cols = items.map((m, i) => {
    const cx = ml + gw * i + gw / 2;
    let lab = '';
    if (o.edgeLabels) {
      if (m.center) lab = `<text class="axis mono" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(m.center)}</text>`;
      else if (showEdge(i)) lab = `<text class="axis mono" x="${(cx - gw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(m.edge)}</text>`;
    } else if (i % every === 0) lab = `<text class="axis" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(m.label)}</text>`;
    let bar = '';
    if (m.v != null) {
      const y = Y(m.v);
      const top = Math.min(y, y0), h = Math.max(2, Math.abs(y - y0));
      const c = m.kind === 'be' ? 'col-be' : m.kind === 'neg' ? 'col-neg' : m.kind === 'pos' ? 'col-pos' : m.v >= 0 ? 'col-pos' : 'col-neg';
      bar = `<rect class="${c}" x="${(cx - bw / 2).toFixed(1)}" y="${(m.v >= 0 ? top : y0).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${bw > 8 ? 3 : 1.5}"/>`;
    }
    const pick = o.onPick ? ` tabindex="${i === 0 ? 0 : -1}" role="button" aria-label="${esc(m.aria || m.label || '')}"` : '';
    return `${lab}<g class="bar-g${o.onPick ? ' pick' : ''}" data-i="${i}" data-tip="${esc(m.tip)}"${pick}><rect class="hitc" x="${(cx - gw / 2).toFixed(1)}" y="${mt}" width="${gw.toFixed(1)}" height="${ph}" fill="transparent"/>${bar}</g>`;
  }).join('');
  const title = o.yTitle ? `<text class="axis" transform="rotate(-90)" x="${(-(mt + ph / 2)).toFixed(1)}" y="11" text-anchor="middle">${esc(o.yTitle)}</text>` : '';
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="${esc(o.label)}">${grid}${title}${cols}</svg>`;
  const tip = ensureTip(el);
  const gs = [...el.querySelectorAll('.bar-g')];
  gs.forEach((g, i) => {
    const on = (ev) => {
      const r = el.getBoundingClientRect();
      tip.innerHTML = g.dataset.tip;
      if (ev && ev.clientX != null && ev.type !== 'focus') placeTip(el, tip, ev.clientX - r.left, ev.clientY - r.top);
      else { const b = g.getBoundingClientRect(); placeTip(el, tip, b.left - r.left + b.width / 2, b.top - r.top + 30); }
      g.classList.add('hl');
    };
    const off = () => { tip.hidden = true; g.classList.remove('hl'); };
    g.addEventListener('pointermove', on);
    g.addEventListener('pointerdown', on);
    g.addEventListener('pointerleave', off);
    if (o.onPick) {
      g.addEventListener('focus', on);
      g.addEventListener('blur', off);
      g.addEventListener('click', () => o.onPick(i));
      g.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); o.onPick(i); return; }
        const t = ev.key === 'ArrowRight' ? i + 1 : ev.key === 'ArrowLeft' ? i - 1 : ev.key === 'Home' ? 0 : ev.key === 'End' ? gs.length - 1 : null;
        if (t == null || !gs[t]) return;
        ev.preventDefault();
        gs[i].tabIndex = -1; gs[t].tabIndex = 0; gs[t].focus();
      });
    }
  });
}

/**
 * Wykres lizakowy wejść: każdy trade to osobny znak w swojej minucie. Łodyga od 0 do wartości, kropka na końcu.
 * pts: [{id, m (minuta doby), v (R), kind: 'pos'|'neg'|'be', tip, aria}] posortowane wg czasu.
 * Oś X: od pierwszej do ostatniej minuty zaokrąglone do pełnych 5 min. Pod osią pasek gęstości (kreski 6 px).
 * Strzałki przenoszą fokus między kropkami, Enter / spacja / klik wołają o.onOpen(id, element).
 */
export function drawLollipop(el, pts, o) {
  const W = Math.max(280, el.clientWidth || 600);
  const narrow = W < 520;
  const H = o.height ?? (narrow ? 230 : 270);
  const ml = narrow ? 44 : 52, mr = 14, mt = 14, mb = 44;
  const pw = W - ml - mr, ph = H - mt - mb;
  const mins = pts.map((p) => p.m);
  let from = Math.floor(Math.min(...mins) / 5) * 5, to = Math.ceil(Math.max(...mins) / 5) * 5;
  if (to - from < 10) { const mid = (from + to) / 2; from = Math.floor((mid - 5) / 5) * 5; to = from + 10; } // 1–2 trade'y: oś nie może się zapaść
  const span = to - from;
  const X = (m) => ml + ((m - from) / span) * pw;
  const vals = pts.map((p) => p.v);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), narrow ? 4 : 5);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const Y = (v) => mt + (1 - (v - lo) / (hi - lo)) * ph;
  const y0 = Y(0), yb = mt + ph;
  // etykiety osi: krok 5/10/15/30/60 min (dla bardzo długich dni 120/180), najwyżej ok. 10 (na telefonie 5)
  const maxLabels = narrow ? 5 : 10;
  let step = 180;
  for (const s of [5, 10, 15, 30, 60, 120, 180]) { if (Math.floor(span / s) + 1 <= maxLabels) { step = s; break; } }
  let xl = '';
  for (let m = Math.ceil(from / step) * step; m <= to; m += step) xl += `<text class="axis mono" x="${X(m).toFixed(1)}" y="${H - 8}" text-anchor="middle">${minToHm(m)}</text>`;
  const grid = ticks.map((t) => `<line class="grid${t === 0 ? ' zero' : ''}" x1="${ml}" x2="${W - mr}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/><text class="axis" x="${ml - 8}" y="${Y(t).toFixed(1)}" text-anchor="end" dominant-baseline="middle">${esc(o.fmtY(t))}</text>`).join('');
  // rozmiary kropek maleją przy dużej liczbie wejść, łodyga zostaje cienka
  const n = pts.length;
  const r = n <= 40 ? 4 : n <= 100 ? 3.5 : Math.max(1.8, 3.5 - (n - 100) / 130);
  const hitR = n > 80 ? Math.max(8, r + 5) : 22; // pole dotyku 44x44 (przy gęstych danych mniejsze, żeby sąsiednie kropki dało się trafić)
  const pxMin = pw / span;
  const groups = new Map();
  pts.forEach((p, i) => { const a = groups.get(p.m) || []; a.push(i); groups.set(p.m, a); });
  const pos = pts.map(() => 0);
  for (const idx of groups.values()) {
    const k = idx.length;
    // kilka trade'ów w tej samej minucie: lekkie rozsunięcie w poziomie, ale w obrębie szerokości tej minuty
    const gap = k > 1 ? Math.min(2 * r + 1, (pxMin * 0.9) / (k - 1)) : 0;
    idx.forEach((i, j) => { pos[i] = Math.max(ml, Math.min(W - mr, X(pts[i].m) + (j - (k - 1) / 2) * gap)); });
  }
  const rug = pts.map((p) => `<line class="rug" x1="${X(p.m).toFixed(1)}" x2="${X(p.m).toFixed(1)}" y1="${(yb + 6).toFixed(1)}" y2="${(yb + 12).toFixed(1)}"/>`).join('');
  const dots = pts.map((p, i) => {
    const x = pos[i].toFixed(1), y = Y(p.v).toFixed(1);
    return `<g class="lp ${p.kind}" data-i="${i}" tabindex="${i === 0 ? 0 : -1}" role="button" aria-label="${esc(p.aria)}"><circle class="lp-hit" cx="${x}" cy="${y}" r="${hitR}"/><line class="lp-stem" x1="${x}" x2="${x}" y1="${y0.toFixed(1)}" y2="${y}"/><circle class="lp-dot" cx="${x}" cy="${y}" r="${r.toFixed(2)}" fill-opacity="${n > 60 ? 0.78 : 0.95}"/></g>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="${esc(o.label)}">${grid}<line class="grid" x1="${ml}" x2="${W - mr}" y1="${yb}" y2="${yb}"/>${rug}${xl}${dots}</svg>`;
  const tip = ensureTip(el);
  const gs = [...el.querySelectorAll('.lp')];
  const show = (g) => {
    const i = Number(g.dataset.i);
    const c = g.querySelector('.lp-dot');
    tip.innerHTML = pts[i].tip;
    placeTip(el, tip, Number(c.getAttribute('cx')), Number(c.getAttribute('cy')));
  };
  const hide = () => { tip.hidden = true; };
  gs.forEach((g, i) => {
    g.addEventListener('pointerenter', () => show(g));
    g.addEventListener('pointerleave', hide);
    g.addEventListener('focus', () => show(g));
    g.addEventListener('blur', hide);
    g.addEventListener('click', () => o.onOpen?.(pts[i].id, g));
    g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); o.onOpen?.(pts[i].id, g); return; }
      const t = ev.key === 'ArrowRight' ? i + 1 : ev.key === 'ArrowLeft' ? i - 1 : ev.key === 'Home' ? 0 : ev.key === 'End' ? gs.length - 1 : null;
      if (t == null || !gs[t]) return;
      ev.preventDefault();
      gs[i].tabIndex = -1; gs[t].tabIndex = 0; gs[t].focus();
    });
  });
}
