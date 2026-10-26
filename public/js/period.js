// Moduł wyboru okresu w lewym panelu: segmenty 7D / 30D / 90D / Rok / Wsz., pole zakresu ze strzałkami i popover
// z gotowymi zakresami oraz mini-kalendarzem (dwa kliknięcia: od i do). Stan okresu to state.preset + state.from / state.to.
import * as F from './format.js';
import { cfg } from './stats.js';
import { overlay, trapTab } from './modal.js';
import { t } from './i18n.js';

const SEGMENTS = [
  ['7d', t('7D'), t('Ostatnie 7 dni')], ['30d', t('30D'), t('Ostatnie 30 dni')], ['90d', t('90D'), t('Ostatnie 90 dni')], ['year', t('Rok'), t('Ten rok (od 1 stycznia)')], ['all', t('Wsz.'), t('Wszystko, cały okres')],
];
const PRESET_LEN = { '7d': 7, '30d': 30, '90d': 90 };
const { esc } = F;

const lastOfMonth = (key) => { const { y, m } = F.parseKey(key); return `${y}-${F.pad(m)}-${F.pad(F.daysInMonth(y, m))}`; };
const addMonths = (key, n) => { const { y, m } = F.parseKey(key); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${F.pad((t % 12) + 1)}-01`; };

// ten sam dzień miesiąca w sąsiednim miesiącu (przycięty do długości miesiąca)
const shiftMonthKeep = (key, n) => { const { y, m } = F.parseKey(addMonths(key.slice(0, 8) + '01', n)); return `${y}-${F.pad(m)}-${F.pad(Math.min(F.parseKey(key).d, F.daysInMonth(y, m)))}`; };

// Gotowe zakresy (poniedziałek jako początek tygodnia).
export function readyRanges(today = F.todayKey()) {
  const wd = F.weekdayIdx(today);
  const mon = F.addDays(today, -wd);
  const m0 = today.slice(0, 8) + '01';
  const qm = Math.floor((F.parseKey(today).m - 1) / 3) * 3 + 1;
  const q0 = `${today.slice(0, 4)}-${F.pad(qm)}-01`;
  const py = Number(today.slice(0, 4)) - 1;
  const pm = addMonths(m0, -1);
  return [
    { id: 'tydzien', label: t('Ten tydzień'), from: mon, to: today },
    { id: 'poprz-tydzien', label: t('Poprzedni tydzień'), from: F.addDays(mon, -7), to: F.addDays(mon, -1) },
    { id: 'miesiac', label: t('Ten miesiąc'), from: m0, to: today },
    { id: 'poprz-miesiac', label: t('Poprzedni miesiąc'), from: pm, to: lastOfMonth(pm) },
    { id: 'kwartal', label: t('Ten kwartał'), from: q0, to: today },
    { id: 'rok', label: t('Ten rok'), from: `${today.slice(0, 4)}-01-01`, to: today },
    { id: 'poprz-rok', label: t('Poprzedni rok'), from: `${py}-01-01`, to: `${py}-12-31` },
  ];
}

export function rangeText(from, to) {
  const y1 = from.slice(0, 4), y2 = to.slice(0, 4);
  return y1 === y2 ? `${F.shortDate(from)} — ${F.shortDate(to)} ${y2}` : `${F.shortDate(from)} ${y1} — ${F.shortDate(to)} ${y2}`;
}

// Stare zapisane wartości: „Ten miesiąc” (month) staje się zakresem od 1. dnia miesiąca do dziś, „Własny” zostaje.
export function migrateSaved(saved, today = F.todayKey()) {
  const out = { ...saved };
  if (out.preset === 'month') { out.preset = 'custom'; out.from = today.slice(0, 8) + '01'; out.to = today; }
  if (out.preset === 'custom' && (!out.from || !out.to)) { out.preset = '30d'; out.from = ''; out.to = ''; }
  return out;
}

export function createPeriod({ state, save, refilter, resolveRange, firstTradeDate, dayMap }) {
  let el = null;      // trwały węzeł modułu (przeżywa przerysowanie lewego panelu, dzięki temu segment się animuje)
  let pop = null;     // popover
  let scrim = null;
  let rp = null;      // { from, to, anchor, month, focus }
  let opener = null;

  // ---------- moduł w panelu ----------
  function build() {
    el = document.createElement('div');
    el.className = 'period no-anim';
    el.id = 'period';
    el.innerHTML = `<div class="pseg" role="group" aria-labelledby="l-okres"><span class="pseg-on" aria-hidden="true"></span>${SEGMENTS.map(([v, l, full]) => `<button type="button" data-act="preset" data-v="${v}" aria-label="${esc(full)}" title="${esc(full)}" aria-pressed="false">${esc(l)}</button>`).join('')}</div>
      <div class="pfield"><button type="button" class="pf-arrow" data-act="pshift" data-v="-1" aria-label="${esc(t('Poprzedni okres'))}">‹</button>
        <button type="button" class="pf-mid" data-act="rp-open" aria-haspopup="dialog" aria-expanded="false"></button>
        <button type="button" class="pf-arrow" data-act="pshift" data-v="1" aria-label="${esc(t('Następny okres'))}">›</button></div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('no-anim')));
    return el;
  }

  function update() {
    if (!el) return;
    const r = resolveRange();
    const idx = SEGMENTS.findIndex(([v]) => v === state.preset);
    const seg = el.querySelector('.pseg');
    void seg.offsetWidth; // wymusza przeliczenie stylu, żeby po ponownym wstawieniu węzła segment przesunął się z animacją
    seg.style.setProperty('--i', String(Math.max(idx, 0)));
    seg.classList.toggle('none', idx < 0);
    el.querySelectorAll('.pseg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === state.preset)));
    const mid = el.querySelector('.pf-mid');
    const first = firstTradeDate();
    if (state.preset === 'all') mid.innerHTML = `<span class="pf-t">${esc(t('cały okres'))}${first ? ` · ${esc(t('od {date}', { date: `${F.shortDate(first)} ${first.slice(0, 4)}` }))}` : ''}</span>`;
    else mid.innerHTML = `<span class="pf-t">${esc(rangeText(r.from, r.to))}</span>`;
    mid.setAttribute('aria-label', t('Okres: {range}. Otwórz wybór zakresu', { range: state.preset === 'all' ? t('cały okres') : rangeText(r.from, r.to) }));
    mid.setAttribute('aria-expanded', String(!!pop));
    const all = state.preset === 'all';
    const [prev, next] = el.querySelectorAll('.pf-arrow');
    const today = F.todayKey();
    prev.disabled = all || !r.from || (!!first && r.from <= first);
    next.disabled = all || !r.to || r.to >= today;
    el.classList.toggle('is-all', all);
  }

  function mount(slot) {
    if (!el) build();
    slot.replaceWith(el);
    update();
  }

  // ---------- strzałki: przesunięcie o długość okresu ----------
  function snap() {
    const today = F.todayKey();
    if (state.to !== today) return;
    const len = F.diffDays(state.from, state.to) + 1;
    const hit = Object.entries(PRESET_LEN).find(([, n]) => n === len && state.from === F.addDays(today, -(n - 1)));
    if (hit) { state.preset = hit[0]; state.from = ''; state.to = ''; return; }
    if (state.from === `${today.slice(0, 4)}-01-01`) { state.preset = 'year'; state.from = ''; state.to = ''; }
  }

  function shift(dir) {
    const r = resolveRange();
    if (!r.from || !r.to) return;
    const today = F.todayKey();
    let from = r.from, to = r.to;
    const len = F.diffDays(from, to) + 1;
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    const isYear = state.preset === 'year' || (from.slice(5) === '01-01' && to.slice(5) === '12-31' && sameYear);
    const isMonth = !isYear && from.slice(8) === '01' && to === lastOfMonth(from);
    if (isYear) {
      const y = Number(from.slice(0, 4)) + dir;
      from = `${y}-01-01`; to = `${y}-12-31`;
    } else if (isMonth) {
      from = addMonths(from, dir); to = lastOfMonth(from);
    } else { from = F.addDays(from, dir * len); to = F.addDays(to, dir * len); }
    if (dir > 0 && to > today) {
      // wyszło poza dziś: okno kończy się dziś (dla roku: od 1 stycznia do dziś)
      to = today;
      from = isYear ? `${today.slice(0, 4)}-01-01` : isMonth ? today.slice(0, 8) + '01' : F.addDays(today, -(len - 1));
    }
    state.preset = 'custom'; state.from = from; state.to = to;
    snap();
    refilter();
  }

  // ---------- popover ----------
  const isSheet = () => window.matchMedia('(max-width: 1023px)').matches;

  function dayKind(key) {
    const d = dayMap().get(key);
    if (!d) return '';
    const v = d.r;
    const th = Math.max(1e-9, cfg.beR);
    return v > th ? 'win' : v < -th ? 'loss' : 'zero';
  }

  function calHtml() {
    const [y, m] = rp.month.split('-').map(Number);
    const first = `${y}-${F.pad(m)}-01`;
    const start = F.addDays(first, -F.weekdayIdx(first));
    const today = F.todayKey();
    const lo = rp.from, hi = rp.to || rp.from;
    let cells = F.WEEKDAYS.map((w) => `<span class="rdow">${w}</span>`).join('');
    for (let i = 0; i < 42; i++) {
      const key = F.addDays(start, i);
      const inMonth = key.slice(0, 7) === rp.month;
      const sel = key === lo || key === hi;
      const inr = lo && key > lo && key < hi;
      const kind = dayKind(key);
      const label = `${F.longDate(key)}${kind ? t(', są trade\'y') : ''}`;
      cells += `<button type="button" class="rd${inMonth ? '' : ' off'}${sel ? ' sel' : ''}${inr ? ' in' : ''}${key === lo ? ' start' : ''}${key === hi ? ' end' : ''}${key === today ? ' today' : ''}" data-act="rp-day" data-v="${key}" tabindex="${key === rp.focus ? 0 : -1}" aria-label="${esc(label)}" aria-pressed="${sel}"><span>${F.parseKey(key).d}</span>${kind ? `<i class="rdot ${kind}"></i>` : ''}</button>`;
    }
    return `<div class="rp-ch"><button type="button" class="icon-btn" data-act="rp-month" data-v="-1" aria-label="${esc(t('Poprzedni miesiąc'))}">‹</button><span class="ttl" aria-live="polite">${esc(F.monthTitle(y, m))}</span><button type="button" class="icon-btn" data-act="rp-month" data-v="1" aria-label="${esc(t('Następny miesiąc'))}">›</button></div>
      <div class="rp-grid" role="group" aria-label="${esc(t('Kalendarz zakresu'))}">${cells}</div>`;
  }

  function popHtml() {
    const ready = readyRanges();
    const lo = rp.from, hi = rp.to || rp.from;
    const list = ready.map((x) => `<button type="button" class="rl${x.from === lo && x.to === hi ? ' on' : ''}" data-act="rp-ready" data-v="${x.id}">${esc(x.label)}</button>`).join('');
    const sel = lo ? `<b>${esc(F.shortDate(lo))} ${esc(lo.slice(0, 4))}</b> — <b>${esc(F.shortDate(hi))} ${esc(hi.slice(0, 4))}</b>${rp.to ? '' : ` <span class="muted">${esc(t('(kliknij drugi dzień)'))}</span>`}` : esc(t('Kliknij pierwszy dzień zakresu'));
    return `<div class="rp-body"><div class="rp-l" role="group" aria-label="${esc(t('Gotowe zakresy'))}">${list}</div>
        <div class="rp-r" id="rp-cal">${calHtml()}</div></div>
      <div class="rp-sel" id="rp-sel" aria-live="polite">${sel}</div>
      <div class="rp-f"><button type="button" class="btn ghost" data-act="rp-cancel">${esc(t('Anuluj'))}</button><button type="button" class="btn primary" data-act="rp-apply" ${lo ? '' : 'disabled'}>${esc(t('Zastosuj'))}</button></div>`;
  }

  function refresh({ keepFocus = true } = {}) {
    if (!pop) return;
    const wasDay = document.activeElement?.dataset?.act === 'rp-day';
    pop.querySelector('.rp-inner').innerHTML = popHtml();
    if (keepFocus && wasDay) pop.querySelector(`[data-act="rp-day"][data-v="${rp.focus}"]`)?.focus();
  }

  function position() {
    if (!pop || isSheet()) { if (pop) { pop.style.left = ''; pop.style.top = ''; } return; }
    const a = el.querySelector('.pfield').getBoundingClientRect();
    const w = Math.min(560, innerWidth - 24);
    pop.style.width = `${w}px`;
    let left = Math.max(12, Math.min(a.left, innerWidth - w - 12));
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.round(a.bottom + 6)}px`;
    const h = pop.offsetHeight;
    if (a.bottom + 6 + h > innerHeight - 8) pop.style.top = `${Math.max(8, innerHeight - h - 8)}px`;
  }

  function open() {
    if (pop) return;
    const r = resolveRange();
    const today = F.todayKey();
    const from = r.from || (firstTradeDate() || today);
    const to = r.to || today;
    rp = { from, to, anchor: null, month: to.slice(0, 7), focus: to };
    opener = el.querySelector('.pf-mid');
    pop = document.createElement('div');
    pop.className = 'rp';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', t('Wybór okresu'));
    pop.innerHTML = '<div class="rp-grab" aria-hidden="true"></div><div class="rp-inner"></div>';
    pop.querySelector('.rp-inner').innerHTML = popHtml();
    scrim = document.createElement('div');
    scrim.className = 'rp-scrim';
    scrim.addEventListener('click', () => close());
    document.body.append(scrim, pop);
    position();
    overlay.current = { onKey };
    update();
    (pop.querySelector(`[data-act="rp-day"][data-v="${rp.focus}"]`) || pop.querySelector('button')).focus();
  }

  function close({ restore = true } = {}) {
    if (!pop) return;
    pop.remove(); scrim.remove();
    pop = null; scrim = null; rp = null;
    overlay.current = null;
    update();
    if (restore && opener && document.contains(opener)) opener.focus();
  }

  function apply() {
    if (!rp || !rp.from) return;
    const from = rp.from, to = rp.to || rp.from;
    state.preset = 'custom'; state.from = from; state.to = to;
    close();
    refilter();
    const f = el.querySelector('.pf-mid'); if (f) f.focus();
  }

  function dayClick(key) {
    if (!rp) return;
    if (!rp.anchor) { rp.anchor = key; rp.from = key; rp.to = null; }
    else { rp.from = key < rp.anchor ? key : rp.anchor; rp.to = key > rp.anchor ? key : rp.anchor; rp.anchor = null; }
    rp.focus = key;
    refresh();
  }

  function ready(id) {
    const x = readyRanges().find((r) => r.id === id);
    if (!x || !rp) return;
    rp.from = x.from; rp.to = x.to; rp.anchor = null; rp.month = x.to.slice(0, 7); rp.focus = x.to;
    refresh({ keepFocus: false });
    pop.querySelector(`[data-act="rp-ready"][data-v="${id}"]`)?.focus();
  }

  function month(dir) {
    if (!rp) return;
    rp.month = addMonths(rp.month + '-01', dir).slice(0, 7);
    if (rp.focus.slice(0, 7) !== rp.month) rp.focus = `${rp.month}-01`;
    refresh({ keepFocus: false });
    pop.querySelector(`[data-act="rp-month"][data-v="${dir}"]`)?.focus();
  }

  function onKey(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); close(); return; }
    const d = document.activeElement;
    if (d && d.dataset && d.dataset.act === 'rp-day') {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
      if (step || ev.key === 'PageUp' || ev.key === 'PageDown' || ev.key === 'Home' || ev.key === 'End') {
        ev.preventDefault();
        let t = d.dataset.v;
        if (step) t = F.addDays(t, step);
        else if (ev.key === 'PageUp') t = shiftMonthKeep(t, -1);
        else if (ev.key === 'PageDown') t = shiftMonthKeep(t, 1);
        else if (ev.key === 'Home') t = F.addDays(t, -F.weekdayIdx(t));
        else t = F.addDays(t, 6 - F.weekdayIdx(t));
        rp.focus = t; rp.month = t.slice(0, 7);
        refresh({ keepFocus: false });
        pop.querySelector(`[data-act="rp-day"][data-v="${t}"]`)?.focus();
        return;
      }
    }
    trapTab(ev, pop);
  }

  // klik poza popoverem zamyka go (bez zatwierdzania)
  document.addEventListener('pointerdown', (ev) => {
    if (pop && !pop.contains(ev.target) && !ev.target.closest('#period') && !ev.target.closest('.rp-scrim')) close({ restore: false });
  });
  window.addEventListener('resize', () => position());

  function handle(act, v) {
    switch (act) {
      case 'rp-open': if (pop) close(); else open(); return true;
      case 'pshift': shift(Number(v)); return true;
      case 'rp-day': dayClick(v); return true;
      case 'rp-ready': ready(v); return true;
      case 'rp-month': month(Number(v)); return true;
      case 'rp-apply': apply(); return true;
      case 'rp-cancel': close(); return true;
      default: return false;
    }
  }

  return { mount, update, handle, close, isOpen: () => !!pop };
}
