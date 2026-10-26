// Trading HQ: interfejs dashboardu. Cała logika po stronie przeglądarki, dane z /api/data.
// Układ "biurka": górny pasek, lewy panel DESK (filtry), karta treści, prawy panel (dzień), pasek statusu.
import * as F from './format.js';
import * as S from './stats.js';
import { drawEquity, drawUnderwater, drawColumns, drawLollipop } from './charts.js';
import { createForm } from './form.js';
import { createPeriod, migrateSaved } from './period.js';
import { createProp } from './prop.js';
import { logoHtml } from './firmy.js';
import { createSettings } from './ustawienia.js';
import { applyPalette, PALETTE_IDS, sanitizeCustom, defaultCustom, resolvedAll } from './palety.js';
import { overlay, confirmDialog, toast } from './modal.js';
import { t, getLang, bootMeta, rememberLang, translateStatic } from './i18n.js';
import { createUpdater } from './aktualizacja.js';
import { createOnboarding } from './pierwsze-kroki.js';
import { createGuide } from './przewodnik.js';
import { createSync, createDevices } from './urzadzenia.js';

const { esc, fmtR, fmtMoney, fmtPct, fmtPf, fmtVal, num, cls, DASH } = F;
const L = (s, p) => esc(t(s, p));
const tx = t; // t bywa nazwą zmiennej z elementem w obsłudze kliknięć
const P = (s, n, p) => esc(t.p(s, n, p));
let meta = bootMeta() || {};   // { lang, version, schemaVersion, installedSchema, updateCheck, notionUrl } z serwera
const upd = createUpdater({ getMeta: () => meta }); // moduł aktualizacji: pigułka w pasku statusu, okno, przebieg (aktualizacja.js)

// ---------- stan ----------
const DEFAULTS = {
  preset: '30d', from: '', to: '', typ: 'Live', konta: null, setups: null, unit: 'R', metric: 'sum', allAccounts: false, skipped: false,
  view: 'stats', res: 'all', eqPaper: false, heatYear: '', rStep: 'auto', sortK: 'date', sortD: 'desc',
};
const VIEWS = ['stats', 'trades', 'prop', 'gallery'];
const STORE_KEY = 'thq.filters.v1';
const THEME_KEY = 'thq.theme';
const SETTINGS_KEY = 'thq.settings.v1';
const UI_KEY = 'thq.ui.v1';
// Sekcje prawego panelu zwinięte domyślnie (dodatek 1, 25.10.2026): przy 1080 px panel ma się mieścić bez przewijania.
const CLOSED_BY_DEFAULT = new Set(['prop']);
const REFRESH_MS = 5 * 60 * 1000;

function loadSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    const out = {};
    for (const k of Object.keys(DEFAULTS)) {
      const d = DEFAULTS[k], v = raw[k];
      if (d === null ? (v === null || Array.isArray(v)) : typeof v === typeof d) out[k] = v;
    }
    if (out.view && !VIEWS.includes(out.view)) delete out.view;
    if (out.sortD && !['asc', 'desc'].includes(out.sortD)) delete out.sortD;
    return migrateSaved(out); // stare wartości okresu („Ten miesiąc”, „Własny” bez dat) mapowane na nowy model
  } catch { return {}; }
}
function save() {
  try {
    const o = {};
    for (const k of Object.keys(DEFAULTS)) o[k] = state[k];
    localStorage.setItem(STORE_KEY, JSON.stringify(o));
  } catch { /* localStorage niedostępny */ }
}
// stan sekcji prawego panelu: zapamiętujemy tylko ręczne wybory użytkownika
function loadUi() {
  try { const o = JSON.parse(localStorage.getItem(UI_KEY) || '{}'); return o && typeof o.closed === 'object' && o.closed ? o.closed : {}; } catch { return {}; }
}
function saveUi() { try { localStorage.setItem(UI_KEY, JSON.stringify({ closed: state.ui.closed })); } catch { /* brak */ } }
const isClosed = (key) => (key in state.ui.closed ? !!state.ui.closed[key] : CLOSED_BY_DEFAULT.has(key));

// ustawienia (ikona koła zębatego): paleta danych (gotowa albo własna, osobno dla Onyx i Platinum) i marginesy BE
function loadSettings() {
  const out = { palette: 'color', custom: defaultCustom(), customSeeded: false, ...S.BE_DEFAULTS };
  try {
    const o = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (PALETTE_IDS.includes(o.palette)) out.palette = o.palette; // stare „color” i „mono” zostają bez zmian
    if (typeof o.beR === 'number') out.beR = o.beR;
    if (typeof o.beUsd === 'number') out.beUsd = o.beUsd;
    if (o.custom) out.custom = sanitizeCustom(o.custom);
    out.customSeeded = o.customSeeded === true;
  } catch { /* brak lub uszkodzone */ }
  return out;
}
const settings = loadSettings();
// „resolved” to gotowe kolory obu motywów: skrypt w <head> stosuje je przed pierwszym malowaniem (bez błysku domyślnych kolorów)
// sync: synchronizacja ustawień między urządzeniami (urzadzenia.js); przypisywana niżej, po utworzeniu modułów
let sync = null;
let langOverride = '';
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, resolved: resolvedAll(settings) })); } catch { /* localStorage niedostępny */ }
  sync?.changed();
}
S.setBeMargins(settings.beR, settings.beUsd);

const state = { ...DEFAULTS, ...loadSaved(), month: null, q: '', ui: { dd: null, sheet: '', closed: loadUi() } };
let model = null;      // { trades, konta, finanse, colors, fields, notionUrl, fetchedAt, cached, sig }
let loadError = null;
let loading = true;
let chartJobs = [];
let ctx = null;        // ostatnio policzony kontekst widoku (dla prawego panelu i paska statusu)
let lastCheck = null;  // kiedy ostatnio udało się pobrać dane z serwera (ręcznie lub automatycznie)
let statusNote = '';
let refreshing = false;
let pendingRender = false;
let timers = [];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const hm = (d) => `${F.pad(d.getHours())}:${F.pad(d.getMinutes())}`;

// ---------- ikony ----------
const svg = (body, s = 16, sw = 1.7) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  chart: (s) => svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', s),
  image: (s) => svg('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/>', s),
  list: (s) => svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>', s),
  wallet: (s) => svg('<path d="M4 7a2 2 0 0 1 2-2h12v4M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2zM16 14h.01"/>', s),
  filter: (s) => svg('<path d="M3 5h18M6 12h12M10 19h4"/>', s),
  panel: (s) => svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>', s),
  refresh: (s) => svg('<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>', s),
  chev: (s) => svg('<path d="m6 9 6 6 6-6"/>', s, 2),
  close: (s) => svg('<path d="M6 6l12 12M18 6 6 18"/>', s, 2),
  gear: (s) => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', s),
  plus: (s) => svg('<path d="M12 5v14M5 12h14"/>', s, 2),
  edit: (s) => svg('<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>', s),
  sortUp: (s) => svg('<path d="m6 15 6-6 6 6"/>', s, 2),
  sortDown: (s) => svg('<path d="m6 9 6 6 6-6"/>', s, 2),
};

// ---------- motyw i paleta danych ----------
const getTheme = () => (document.documentElement.getAttribute('data-theme') === 'platinum' ? 'platinum' : 'onyx');
function paintTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t === 'platinum' ? '#bfbfbf' : '#1a1a1a';
  $$('#theme-seg [data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === t)));
  applyPalette(settings, t); // kolory danych zależą od motywu (własna paleta ma osobne wartości dla Onyx i Platinum)
  ust?.refreshTheme();
}
function setTheme(t, origin) {
  if (t === getTheme()) return;
  try { localStorage.setItem(THEME_KEY, t); } catch { /* localStorage niedostępny */ }
  setTimeout(() => sync?.changed(), 0); // motyw zapisany w localStorage przed odczytem przez collect()
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce && typeof document.startViewTransition === 'function') {
    const r = origin ? origin.getBoundingClientRect() : null;
    const root = document.documentElement;
    root.style.setProperty('--vt-x', `${r ? Math.round(r.left + r.width / 2) : innerWidth / 2}px`);
    root.style.setProperty('--vt-y', `${r ? Math.round(r.top + r.height / 2) : 20}px`);
    root.classList.add('theme-switching');
    const vt = document.startViewTransition(() => paintTheme(t));
    vt.finished.finally(() => root.classList.remove('theme-switching'));
  } else paintTheme(t);
}
function applyBe(key, raw) {
  const x = Number(String(raw).replace(',', '.'));
  if (raw === '' || !Number.isFinite(x)) return;
  settings[key] = key === 'beR' ? Math.min(0.5, Math.max(0, x)) : Math.max(0, x);
  S.setBeMargins(settings.beR, settings.beUsd);
  saveSettings();
  if (model) renderMain();
}

// ---------- dane ----------
// silent: odświeżenie w tle (powrót do karty, co 5 min). Bez migania: bez spinnera, bez przerysowania, gdy dane się nie zmieniły.
async function load(force = false, { silent = false } = {}) {
  if (silent && (refreshing || loading)) return;
  refreshing = true;
  if (!silent) { loading = true; document.body.classList.add('busy'); }
  let render = !silent;
  try {
    const res = await fetch('/api/data' + (force ? '?refresh=1' : ''));
    let j;
    try { j = await res.json(); } catch { throw new Error(t('Serwer zwrócił nieczytelną odpowiedź.')); }
    if (!res.ok) throw new Error(j.error || t('Błąd {status}', { status: res.status }));
    if (j.meta) meta = j.meta;
    const sig = JSON.stringify([j.data, j.colors, j.fields]);
    const changed = !model || model.sig !== sig;
    model = {
      trades: changed ? S.normalizeTrades(j.data.trades) : model.trades,
      konta: changed ? S.normalizeKonta(j.data.konta) : model.konta,
      finanse: changed ? S.normalizeFinanse(j.data.finanse) : model.finanse,
      colors: j.colors,
      fields: j.fields || {},
      notionUrl: j.notionUrl,
      fetchedAt: j.fetchedAt,
      cached: j.cached,
      sig,
    };
    loadError = null;
    statusNote = '';
    lastCheck = new Date();
    if (changed) { sanitizeSelections(); if (!silent || !state.month) resetMonth(); }
    if (silent) render = changed;
  } catch (e) {
    if (silent && model) {
      statusNote = t('Nie udało się odświeżyć o {time}', { time: hm(new Date()) });
      render = false;
      renderStatus();
    } else {
      loadError = e instanceof TypeError ? t('Nie mogę połączyć się z lokalnym serwerem. Uruchom dashboard ponownie (Dashboard.vbs albo start.sh).') : e.message;
      render = true;
    }
  } finally {
    refreshing = false;
    if (!silent) { loading = false; document.body.classList.remove('busy'); }
    if (render) { if (silent && modalOpen()) { pendingRender = true; renderStatus(); } else renderAll(); }
    else renderStatus();
  }
}

const modalOpen = () => !!overlay.current || lb.open;
function flushPending() { if (pendingRender && !modalOpen()) { pendingRender = false; renderAll(); } }

function sanitizeSelections() {
  const ids = new Set(model.konta.map((k) => k.id));
  if (state.konta) { state.konta = state.konta.filter((id) => ids.has(id)); if (!state.konta.length) state.konta = null; }
  const setups = new Set(model.trades.map((t) => t.setup).filter(Boolean));
  if (state.setups) { state.setups = state.setups.filter((s) => setups.has(s)); if (!state.setups.length) state.setups = null; }
}

// ---------- filtry ----------

function resolveRange() {
  const tk = F.todayKey();
  let from = null, to = null;
  switch (state.preset) {
    case '7d': from = F.addDays(tk, -6); to = tk; break;
    case '30d': from = F.addDays(tk, -29); to = tk; break;
    case '90d': from = F.addDays(tk, -89); to = tk; break;
    case 'year': from = tk.slice(0, 4) + '-01-01'; to = tk; break;
    case 'custom': from = state.from || null; to = state.to || null; if (from && to && from > to) [from, to] = [to, from]; break;
    default: break;
  }
  let prev = null;
  if (from && to) {
    const len = F.diffDays(from, to) + 1;
    const pTo = F.addDays(from, -1);
    prev = { from: F.addDays(pTo, -(len - 1)), to: pTo };
  }
  let label = t('Cały okres');
  if (from && to) label = `${F.shortDate(from)} – ${F.shortDate(to)}`;
  else if (from) label = t('od {date}', { date: F.shortDate(from) });
  else if (to) label = t('do {date}', { date: F.shortDate(to) });
  return { from, to, prev, label };
}

const inRange = (arr, r) => arr.filter((x) => (!r.from || x.date >= r.from) && (!r.to || x.date <= r.to));

// Wartości w Notion zostają ("Niewzięty"), zmienia się tylko etykieta w interfejsie: Paper.
const TYPES = [['Live', 'Live'], ['Backtest', 'Backtest'], ['Niewzięty', 'Paper']];
const typLabel = (t) => (TYPES.find((x) => x[0] === t) || [, t])[1];
const isLive = () => state.typ === 'Live';

// Trade'y wybranego typu po filtrach kont (tylko Live), setupu i wyszukiwarce. Live nigdy nie zawiera paper.
function baseTrades(typ = state.typ, withUncounted = false) {
  const q = F.fold(state.q.trim());
  return model.trades.filter((t) => {
    if (t.typ !== typ) return false;
    if (!t.counted && !withUncounted) return false;
    if (typ === 'Live' && state.konta && !t.konta.some((id) => state.konta.includes(id))) return false;
    if (state.setups && !state.setups.includes(t.setup)) return false;
    if (q && !t.hay.includes(q)) return false;
    return true;
  });
}

function resetMonth() {
  if (!model) return;
  const base = baseTrades();
  const cur = inRange(base, resolveRange());
  const pick = (arr) => arr.reduce((m, t) => (t.date > m ? t.date : m), '');
  const last = pick(cur) || pick(base) || F.todayKey();
  state.month = F.monthKey(last);
}

// Kwoty w $ są tylko dla Live. Backtest i Paper liczymy w R.
function unitNow() { return isLive() ? state.unit : 'R'; }

// ---------- pomocniki widoku ----------
function badge(text, color) { return `<span class="badge c-${esc(color || 'default')}">${esc(text)}</span>`; }
// „3 trade'y” / „3 trades” (liczba z odmianą)
const nTrades = (n) => t.p("{n} trade'ów", n);
const tLabel = (x) => x.name || [x.instrument, x.dir].filter(Boolean).join(' ') || t('Trade bez nazwy');
const whenText = (x) => `${F.shortDate(x.date)}${x.time ? ` ${x.time}` : ''}`;

function delta(cur, prev, { fmt, better = 'high', range }) {
  if (!range.prev) return '';
  if (prev == null || cur == null || !isFinite(cur) || !isFinite(prev)) return '';
  const d = cur - prev;
  if (Math.abs(d) < 1e-9) return `<div class="delta"><b>${L('bez zmian')}</b><span>${L('vs poprzedni okres')}</span></div>`;
  const good = better === 'high' ? d > 0 : better === 'low' ? d < 0 : null;
  const c = good == null ? '' : good ? 'up' : 'down';
  return `<div class="delta"><b class="${c}">${d > 0 ? '▲' : '▼'} ${esc(fmt(Math.abs(d)))}</b><span>${L('vs poprzedni okres')}</span></div>`;
}

function tile(label, val, sub, deltaHtml, { c = '', small = false } = {}) {
  return `<div class="tile"><span class="lbl">${esc(label)}</span><span class="val ${c}${small ? ' sm' : ''}">${val}</span><span class="sub">${sub}</span>${deltaHtml}</div>`;
}

const notionAppUrl = () => (model?.notionUrl ? model.notionUrl.replace('https://', 'notion://') : '#');

function emptyState(range) {
  const what = { Live: t("trade'ów live"), Backtest: t('backtestów'), Niewzięty: t("trade'ów paper") }[state.typ];
  const filtered = state.konta || state.setups;
  let body, actions = '';
  const box = `<span class="ico-box">${ICON.chart(20)}</span>`;
  if (!model.trades.length) {
    return `<div class="card empty">${box}<h3>${L("Baza trade'ów jest pusta")}</h3><p>${L("Dodaj pierwszy wpis przyciskiem „Dodaj trade” albo w bazie Trade'y w Notion.")}</p><div><button class="btn primary" type="button" data-act="add-trade">${ICON.plus(14)}${L('Dodaj trade')}</button> <a class="btn" href="${esc(notionAppUrl())}">${L('Otwórz journal w Notion')}</a></div></div>`;
  }
  if (state.q.trim()) {
    body = state.preset !== 'all'
      ? L('Nic nie pasuje do wyszukiwania „{q}” w okresie {range}.', { q: state.q.trim(), range: range.label })
      : L('Nic nie pasuje do wyszukiwania „{q}”.', { q: state.q.trim() });
    actions += `<button class="btn primary" type="button" data-act="q-clear">${L('Wyczyść wyszukiwanie')}</button>`;
    if (state.preset !== 'all') actions += ` <button class="btn" type="button" data-act="show-all">${L('Pokaż cały okres')}</button>`;
  } else if (state.preset !== 'all') {
    body = filtered
      ? L('W okresie {range} nie ma {what} dla wybranych kont lub setupów.', { range: range.label, what })
      : L('W okresie {range} nie ma {what}.', { range: range.label, what });
    actions += `<button class="btn primary" type="button" data-act="show-all">${L('Pokaż cały okres')}</button>`;
  } else {
    body = filtered ? L('Nie znalazłem {what} dla wybranych kont lub setupów.', { what }) : L('Nie znalazłem {what} w bazie Notion.', { what });
  }
  if (filtered) actions += ` <button class="btn ghost" type="button" data-act="reset-filters">${L('Wyczyść filtry kont i setupów')}</button>`;
  return `<div class="card empty">${box}<h3>${L('Brak danych do pokazania')}</h3><p>${body}</p><div>${actions}</div></div>`;
}

// ---------- sekcje centrum ----------
function sectionKpi(c, p, range, cur) {
  const d = (cur, prev, o) => delta(cur, prev, { ...o, range });
  const pr = p && p.n ? p : null;
  const tiles = [];
  if (isLive() && c.hasPnl) {
    tiles.push(tile(t('Wynik netto'), fmtMoney(c.sumPnl), L('suma P&L w okresie'), d(c.sumPnl, pr?.sumPnl, { fmt: (x) => fmtMoney(x, { plus: false }) }), { c: cls(c.sumPnl) }));
  } else {
    tiles.push(tile(t('Średnio na wygraną / stratę'), `${fmtR(c.avgWin)} / ${fmtR(c.avgLoss)}`, state.typ === 'Backtest' ? L('backtesty liczymy w R') : L('paper liczymy w R'), d(c.avgWin, pr?.avgWin, { fmt: (x) => fmtR(x, { plus: false }) }), { small: true }));
  }
  tiles.push(tile(t('Win rate'), fmtPct(c.winRate, 0), `${c.wins}W · ${c.losses}L · ${c.be}BE`, d(c.winRate, pr?.winRate, { fmt: (x) => `${num(x, 1)} pp` })));
  tiles.push(tile(t('Profit factor'), fmtPf(c.pfR), isLive() && c.hasPnl ? L('na R · na $: {pf}', { pf: fmtPf(c.pfPnl) }) : L('liczony na R'), d(c.pfR, pr?.pfR, { fmt: (x) => num(x, 2) })));
  tiles.push(tile(t('Średni R na trade'), fmtR(c.avgR), L('expectancy'), d(c.avgR, pr?.avgR, { fmt: (x) => fmtR(x, { plus: false }) }), { c: cls(c.avgR) }));
  tiles.push(tile(t("Liczba trade'ów"), String(c.n), L({ Live: 'live', Backtest: 'backtest', Niewzięty: 'paper, hipotetyczne' }[state.typ]), d(c.n, pr?.n, { fmt: (x) => String(x), better: 'none' })));
  if (state.typ === 'Niewzięty') {
    const rs = S.group(cur, (x) => [x.reason || t('Bez powodu')]).sort((a, b) => b.n - a.n)[0];
    tiles.push(tile(t('Najczęstszy powód'), rs ? esc(rs.key) : DASH, rs ? L("{k} z {n} trade'ów", { k: rs.n, n: c.n }) : '', '', { small: true }));
  }
  tiles.push(tile(t('Max drawdown'), c.maxDD > 1e-9 ? fmtR(-c.maxDD) : fmtR(0), L('z krzywej skumulowanej R'), d(c.maxDD, pr?.maxDD, { fmt: (x) => fmtR(x, { plus: false }), better: 'low' }), { c: c.maxDD > 1e-9 ? 'neg' : '' }));

  const best = c.best, worst = c.worst;
  const sub = (t) => (t ? `<small>${esc(F.shortDate(t.date))}</small>` : '');
  const strip = `<div class="strip">
    <div><span class="lbl">${L('Śr. wygrana')}</span><span class="v pos">${fmtR(c.avgWin)}</span></div>
    <div><span class="lbl">${L('Śr. strata')}</span><span class="v neg">${fmtR(c.avgLoss)}</span></div>
    <div><span class="lbl">${L('Najlepszy trade')}</span><span class="v ${cls(best?.r)}">${fmtR(best?.r)}${sub(best)}</span></div>
    <div><span class="lbl">${L('Najgorszy trade')}</span><span class="v ${cls(worst?.r)}">${fmtR(worst?.r)}${sub(worst)}</span></div>
    <div><span class="lbl">${L('Seria wygranych')}</span><span class="v">${c.maxWinStreak}</span></div>
    <div><span class="lbl">${L('Seria strat')}</span><span class="v">${c.maxLossStreak}</span></div>
  </div>`;
  const hero = `<div class="card hero"><div class="hero-main"><span class="lbl">${L('Suma R')}</span>
      <span class="hero-val ${cls(c.sumR)}">${fmtR(c.sumR)}</span>
      <span class="hero-sub">${P("{n} trade'ów z wynikiem w R", c.nR)}</span>${d(c.sumR, pr?.sumR, { fmt: (x) => fmtR(x, { plus: false }) })}</div>${strip}</div>`;
  return `<section class="sec" aria-label="${L('Najważniejsze wskaźniki')}">${hero}<div class="gr tiles n${tiles.length}">${tiles.join('')}</div>${sectionLeft(range)}</section>`;
}

function sectionLeft(range) {
  if (!isLive()) return '';
  const sk = inRange(baseTrades('Niewzięty'), range);
  if (!sk.length) return '';
  const c = S.calc(sk);
  return `<div class="card left"><span class="lbl">${L('Paper w okresie')}</span><span class="left-v"><b>${esc(nTrades(sk.length))}</b> · ${L('suma R')} <b class="${cls(c.sumR)}">${fmtR(c.sumR)}</b> · WR <b>${fmtPct(c.winRate, 0)}</b></span><button class="btn" type="button" data-act="typ" data-v="Niewzięty">${L('Zobacz')}</button></div>`;
}

function unitSeg() {
  const bt = !isLive();
  const u = unitNow();
  return `<div class="seg full" role="group" aria-label="${L('Jednostka')}">
    <button type="button" data-act="unit" data-v="R" aria-pressed="${u === 'R'}">R</button>
    <button type="button" data-act="unit" data-v="$" aria-pressed="${u === '$'}" ${bt ? `disabled title="${L('Kwoty w $ są tylko dla Live')}"` : ''}>$</button></div>`;
}

let equityPts = [];
let uwPts = [];
let equitySecond = false;
function sectionEquity(cur, range) {
  const u = unitNow();
  // Live + Paper (dodatek 16): tylko w Live, w R (paper nie ma kwot) i gdy w okresie są trade'y paper
  const paper = isLive() && u === 'R' ? inRange(baseTrades('Niewzięty'), range) : [];
  const withPaper = isLive() && state.eqPaper && paper.length > 0;
  const pts = withPaper ? S.equityCombined(cur, paper) : S.equityPoints(cur, u);
  equitySecond = withPaper;
  const fv = (x) => fmtVal(x, u);
  pts.forEach((p, i) => {
    if (p.start) { p.xl = t('Start'); p.tip = `<b>${L('Start')}</b><br><span class="t-muted">0</span>`; return; }
    const x = p.t;
    p.xl = F.shortDate(x.date);
    const head = `<b>#${i} · ${esc(whenText(x))}</b><br><span class="t-muted">${esc([x.instrument, x.dir].filter(Boolean).join(' '))}${x.setup ? ' · ' + esc(x.setup) : ''}${p.paper ? ' · paper' : ''}</span>`;
    p.tip = withPaper
      ? `${head}<br>${L('Trade')}: <b class="${cls(p.v)}">${fv(p.v)}</b><br>Live: <b class="${cls(p.cum)}">${fv(p.cum)}</b><br>Live + paper: <b class="${cls(p.cum2)}">${fv(p.cum2)}</b>`
      : `${head}<br>${L('Trade')}: <b class="${cls(p.v)}">${fv(p.v)}</b><br>${L('Narastająco')}: <b class="${cls(p.cum)}">${fv(p.cum)}</b>`;
  });
  equityPts = pts;
  const dds = S.drawdownSeries(pts);
  uwPts = pts.map((p, i) => ({
    dd: dds[i],
    tip: p.start ? `<b>${L('Start')}</b>` : `<b>#${i} · ${esc(F.shortDate(p.t.date))}</b><br>${L('Od szczytu')}: <b class="${cls(dds[i])}">${fv(dds[i])}</b>`,
  }));
  const maxDD = Math.min(0, ...dds);
  const end = pts[pts.length - 1].cum;
  let ctl = '';
  if (isLive()) {
    const dis = u !== 'R' || !paper.length;
    const why = u !== 'R' ? t('Paper nie ma kwot w $, przełącz jednostkę na R') : !paper.length ? t('W tym okresie nie ma trade\'ów paper') : '';
    ctl = `<div class="seg sm" role="group" aria-label="${L('Zakres krzywej')}"><button type="button" data-act="eqpaper" data-v="0" aria-pressed="${!withPaper}">${L('Tylko live')}</button><button type="button" data-act="eqpaper" data-v="1" aria-pressed="${withPaper}" ${dis ? `disabled title="${esc(why)}"` : ''}>+ paper</button></div>`;
  }
  const legend = withPaper ? '<div class="legend"><span><i class="ln"></i>Live</span><span><i class="ln dash"></i>Live + paper</span></div>' : '';
  return `<section class="sec"><div class="card">
    <div class="card-h"><h3>${L('Krzywa kapitału')} <span class="sub">${L('{v} narastająco', { v: fv(end) })} · ${esc(nTrades(cur.length))} · ${L('jednostka {u}', { u })}${withPaper ? ` · ${L('z {n} paper', { n: paper.length })}` : ''}</span></h3>${ctl}</div>
    ${legend}<div class="chart" id="equity"></div>
    <div class="uw-h"><span class="lbl">${L('Spadki od szczytu')}</span><span class="note">${L('najgłębszy')}: <b class="${cls(maxDD)}">${esc(fv(maxDD))}</b></span></div>
    <div class="chart uw" id="uw"></div></div></section>`;
}

function renderCalendar() {
  const base = baseTrades();
  const u = unitNow();
  const days = S.byDay(base);
  const [y, m] = state.month.split('-').map(Number);
  const first = `${y}-${F.pad(m)}-01`;
  const off = F.weekdayIdx(first);
  const dim = F.daysInMonth(y, m);
  const rows = Math.ceil((off + dim) / 7);
  const val = (d) => (d ? (u === 'R' ? d.r : d.hasPnl ? d.pnl : null) : null);
  const th = Math.max(1e-9, u === 'R' ? S.cfg.beR : S.cfg.beUsd); // dzień w marginesie BE to remis
  let maxAbs = 0, total = 0, tr = 0, green = 0, red = 0;
  for (let i = 1; i <= dim; i++) {
    const d = days.get(`${y}-${F.pad(m)}-${F.pad(i)}`);
    const v = val(d);
    if (d) { tr += d.n; }
    if (v != null) { maxAbs = Math.max(maxAbs, Math.abs(v)); total += v; if (v > th) green++; else if (v < -th) red++; }
  }
  const today = F.todayKey();
  let cells = '';
  for (const w of F.WEEKDAYS) cells += `<div class="dow">${w}</div>`;
  cells += `<div class="dow wk">${L('Tydz.')}</div>`;
  for (let r = 0; r < rows; r++) {
    let wkSum = 0, wkAny = false;
    for (let c = 0; c < 7; c++) {
      const dn = r * 7 + c - off + 1;
      if (dn < 1 || dn > dim) { cells += '<div class="cell out" aria-hidden="true"></div>'; continue; }
      const key = `${y}-${F.pad(m)}-${F.pad(dn)}`;
      const d = days.get(key);
      const v = val(d);
      let kind = '', style = '', body = '';
      if (v != null) {
        wkSum += v; wkAny = true;
        kind = v > th ? 'win' : v < -th ? 'loss' : 'zero';
        style = `--k:${Math.round(12 + 30 * (maxAbs ? Math.abs(v) / maxAbs : 0))}%`;
        body = `<span class="cv">${F.compactVal(v, u)}</span><span class="cn">${d.n === 1 ? L('1 trade') : L('{n} tr.', { n: d.n })}</span>`;
      } else if (d) {
        body = `<span class="cv muted">${DASH}</span><span class="cn">${L('{n} tr.', { n: d.n })}</span>`;
      } else body = '<span class="cv"></span><span class="cn"></span>';
      const label = v != null ? `${F.dayMonth(key)}: ${fmtVal(v, u)}, ${nTrades(d.n)}` : `${F.dayMonth(key)}: ${t("brak trade'ów")}`;
      cells += `<div class="cell ${kind}${key === today ? ' today' : ''}" style="${style}" role="img" aria-label="${esc(label)}" title="${esc(label)}"><span class="d">${dn}</span>${body}</div>`;
    }
    cells += wkAny
      ? `<div class="cell wk" role="img" aria-label="${L('Suma tygodnia {v}', { v: fmtVal(wkSum, u) })}"><span class="d">${L('T{n}', { n: r + 1 })}</span><span class="cv ${cls(wkSum)}">${F.compactVal(wkSum, u)}</span><span class="cn"></span></div>`
      : '<div class="cell wk"><span class="d"></span><span class="cv"></span><span class="cn"></span></div>';
  }
  return `<div class="card-h">
      <h3>${L('Kalendarz P&L')} <span class="sub">${L('jednostka {u}', { u })}</span></h3>
      <div class="cal-nav"><button class="icon-btn" type="button" data-act="month-prev" aria-label="${L('Poprzedni miesiąc')}">‹</button>
        <span class="ttl" aria-live="polite">${esc(F.monthTitle(y, m))}</span>
        <button class="icon-btn" type="button" data-act="month-next" aria-label="${L('Następny miesiąc')}">›</button></div></div>
    <div class="cal has-wk">${cells}</div>
    <div class="cal-sum">${tr ? `<span>${L('Miesiąc')}: <b class="${cls(total)}">${fmtVal(total, u)}</b></span><span>${L('Dni na plusie')}: <b>${green}</b></span><span>${L('Na minusie')}: <b>${red}</b></span><span>${L("Trade'ów")}: <b>${tr}</b></span>` : `<span>${L("Brak trade'ów w tym miesiącu.")}</span>`}</div>`;
}

// Heatmapa dni (dodatek 21): domyślnie ostatnie 12 miesięcy (53 tygodnie do dziś), po wybraniu roku cały rok od 1 stycznia do 31 grudnia.
// Pokazuje filtry (typ, konta, setup), nie okres. Dni liczone w lokalnym kluczu dnia (t.date), tak samo jak kalendarz.
function heatYears() {
  return [...new Set(baseTrades().map((t) => t.date.slice(0, 4)))].sort().reverse();
}
function renderHeatmap() {
  const u = unitNow();
  const days = S.byDay(baseTrades());
  const years = heatYears();
  if (state.heatYear && !years.includes(state.heatYear)) state.heatYear = '';
  const yr = state.heatYear;
  const today = F.todayKey();
  let start, end, from, to;
  if (!yr) { to = today; start = F.addDays(F.addDays(today, -F.weekdayIdx(today)), -52 * 7); from = start; end = F.addDays(start, 53 * 7 - 1); }
  else { from = `${yr}-01-01`; to = `${yr}-12-31`; start = F.addDays(from, -F.weekdayIdx(from)); end = F.addDays(to, 6 - F.weekdayIdx(to)); }
  const cols = (F.diffDays(start, end) + 1) / 7;
  const last = to < today ? to : today; // ostatni dzień, który już był
  const inView = (key) => key >= from && key <= last;
  const val = (d) => (d ? (u === 'R' ? d.r : d.hasPnl ? d.pnl : null) : null);
  const th = Math.max(1e-9, u === 'R' ? S.cfg.beR : S.cfg.beUsd);
  let maxAbs = 0, active = 0, plus = 0, minus = 0, total = 0, best = null, worst = null;
  for (let key = from; key <= last; key = F.addDays(key, 1)) {
    const d = days.get(key);
    const v = val(d);
    if (d) active++;
    if (v == null) continue;
    maxAbs = Math.max(maxAbs, Math.abs(v)); total += v;
    if (v > th) plus++; else if (v < -th) minus++;
    if (!best || v > best.v) best = { key, v };
    if (!worst || v < worst.v) worst = { key, v };
  }
  const wd = [F.WEEKDAYS[0], '', F.WEEKDAYS[2], '', F.WEEKDAYS[4], '', ''];
  let cells = wd.map((w) => `<span class="hw" aria-hidden="true">${w}</span>`).join('');
  let months = '';
  let prevMonth = '';
  let todayCol = -1;
  for (let c = 0; c < cols; c++) {
    const monday = F.addDays(start, c * 7);
    const ref = monday < from ? from : monday;
    const mk = F.monthKey(ref);
    if (mk !== prevMonth && !(!yr && c === 0 && monday.slice(8) > '20')) months += `<span class="hmn" style="grid-column:${c + 2}">${F.MON_SHORT[Number(mk.slice(5)) - 1]}</span>`;
    prevMonth = mk;
    for (let r = 0; r < 7; r++) {
      const key = F.addDays(start, c * 7 + r);
      if (!inView(key)) { cells += '<i class="hc out" aria-hidden="true"></i>'; continue; }
      const isToday = key === today;
      if (isToday) todayCol = c;
      const d = days.get(key);
      const v = val(d);
      if (v == null) { cells += `<i class="hc${isToday ? ' today' : ''}" aria-hidden="true" title="${esc(F.shortDate(key))}${d ? `: ${esc(nTrades(d.n))}, ${L('bez wyniku')}` : ''}"></i>`; continue; }
      const kind = v > th ? 'win' : v < -th ? 'loss' : 'zero';
      const label = `${F.longDate(key)}: ${fmtVal(v, u)}, ${nTrades(d.n)}`;
      cells += `<i class="hc ${kind}${isToday ? ' today' : ''}" style="--k:${Math.round(14 + 66 * (maxAbs ? Math.abs(v) / maxAbs : 0))}%" role="img" aria-label="${esc(label)}" title="${esc(label)}"></i>`;
    }
  }
  const dayTxt = (x) => `${fmtVal(x.v, u)} <span class="muted">(${esc(F.shortDate(x.key))})</span>`;
  const sum = active
    ? `<span>${L("Dni z trade'ami")}: <b>${active}</b></span><span>${L('Na plusie')}: <b class="pos">${plus}</b></span><span>${L('Na minusie')}: <b class="neg">${minus}</b></span><span>${L('Razem')}: <b class="${cls(total)}">${fmtVal(total, u)}</b></span>${best ? `<span>${L('Najlepszy dzień')}: <b class="${cls(best.v)}">${dayTxt(best)}</b></span>` : ''}${worst ? `<span>${L('Najgorszy dzień')}: <b class="${cls(worst.v)}">${dayTxt(worst)}</b></span>` : ''}`
    : `<span>${yr ? L("Brak trade'ów w roku {y} dla wybranych filtrów (typ: {typ}).", { y: yr, typ: typLabel(state.typ) }) : L("Brak trade'ów w ostatnich 12 miesiącach dla wybranych filtrów (typ: {typ}).", { typ: typLabel(state.typ) })}</span>`;
  const YL = ['', ...years];
  const idx = YL.indexOf(yr);
  const nav = `<div class="cal-nav"><button class="icon-btn" type="button" data-act="heat-prev" aria-label="${L('Starszy rok')}" ${idx >= YL.length - 1 ? 'disabled' : ''}>‹</button>
      <span class="ttl" aria-live="polite">${yr ? yr : L('Ostatnie 12 mies.')}</span>
      <button class="icon-btn" type="button" data-act="heat-next" aria-label="${L('Nowszy rok')}" ${idx <= 0 ? 'disabled' : ''}>›</button></div>`;
  const focus = !yr ? 1 : todayCol >= 0 ? todayCol / cols : 0;
  return `<div class="card"><div class="card-h"><h3>${yr ? L('Rok {y}', { y: yr }) : L('Ostatnie 12 miesięcy')} <span class="sub">${L('wynik dnia')} · ${L('jednostka {u}', { u })}</span></h3>
      <div class="heat-ctl">${nav}<div class="legend"><span><i class="sw loss"></i>${L('strata')}</span><span><i class="sw"></i>${L('brak')}</span><span><i class="sw win"></i>${L('zysk')}</span></div></div></div>
    <div class="heat-scroll" id="heat-scroll" data-focus="${focus}"><div class="heat-in" style="--cols:${cols}"><div class="hm-m">${months}</div><div class="hm" role="group" aria-label="${yr ? L('Wyniki dni, rok {y}', { y: yr }) : L('Wyniki dni, ostatnie 12 miesięcy')}">${cells}</div></div></div>
    <div class="cal-sum">${sum}</div></div>`;
}
function scrollHeat() {
  const hs = $('#heat-scroll');
  if (!hs) return;
  const f = Number(hs.dataset.focus);
  hs.scrollLeft = f >= 1 ? hs.scrollWidth : Math.max(0, f * hs.scrollWidth - hs.clientWidth / 2);
}

function bkCard(title, rows, { metric, order, note, foot = '', span = '' }) {
  const useAvg = metric === 'avg';
  const items = rows.map((r) => ({ ...r, v: useAvg ? r.avgR : r.sumR })).filter((r) => r.key != null);
  if (order) items.sort((a, b) => order(a) - order(b));
  else items.sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));
  const vals = items.map((r) => r.v).filter((v) => v != null);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const range = hi - lo || 1;
  const z = ((0 - lo) / range) * 100;
  const body = items.length
    ? items.map((r) => {
        let bar = '';
        if (r.v != null) {
          const w = (Math.abs(r.v) / range) * 100;
          const left = r.v >= 0 ? z : z - w;
          bar = `<i class="${r.v >= 0 ? 'pos' : 'neg'}" style="left:${left.toFixed(2)}%;width:${w.toFixed(2)}%"></i>`;
        }
        const main = r.v == null ? DASH : fmtR(r.v);
        const meta = `${r.n && useAvg ? `Σ ${fmtR(r.sumR)} · ` : ''}${r.n && r.wr != null ? `WR ${Math.round(r.wr)}% · ` : ''}${L('{n} tr.', { n: r.n })}`;
        return `<div class="bk-row"><span class="bk-name${r.mono ? ' mono' : ''}" title="${esc(r.label ?? r.key)}">${esc(r.label ?? r.key)}</span>
          ${r.n ? `<div class="bk-track" aria-hidden="true"><span class="z" style="left:${z.toFixed(2)}%"></span>${bar}</div>` : '<div aria-hidden="true"></div>'}
          <span class="bk-val"><b class="${cls(r.v)}">${main}</b><small>${meta}</small></span></div>`;
      }).join('')
    : `<div class="muted" style="padding:10px 0">${L('Brak danych.')}</div>`;
  return `<div class="card glint ${span}"><div class="card-h"><h3>${esc(title)}${note ? `<span class="sub">${esc(note)}</span>` : ''}</h3></div><div class="bk">${body}</div>${foot ? `<p class="note bk-foot">${foot}</p>` : ''}</div>`;
}

// Godzina wejścia (rozszerzenie dodatku 22): wykres lizakowy. Każdy trade to osobny znak w swojej dokładnej minucie,
// oś tylko od pierwszej do ostatniej minuty wejścia, przełącznik sesji zawęża zakres. Pod osią pasek gęstości.
let minSession = '';
let minPts = [];
function minuteData(ext) {
  const timed = ext.filter((t) => t.time);
  const order = Object.keys(model.colors?.trades?.session || {});
  const present = [...new Set(timed.map((t) => t.session).filter(Boolean))].sort((x, y) => (order.indexOf(x) + 1 || 99) - (order.indexOf(y) + 1 || 99));
  if (minSession && !present.includes(minSession)) minSession = '';
  const scoped = minSession ? timed.filter((t) => t.session === minSession) : timed;
  const shown = scoped.filter((t) => t.r != null).sort((x, y) => x.time.localeCompare(y.time) || x.created.localeCompare(y.created));
  return { all: timed.length, noTime: ext.length - timed.length, noR: scoped.length - shown.length, sessions: present, shown };
}
const KIND_OF = { win: 'pos', loss: 'neg', be: 'be' };
const KIND_WORD = { win: t('wygrana'), loss: t('strata'), be: 'BE' };
function minuteCardHtml(ext) {
  const D = minuteData(ext);
  minPts = [];
  if (!D.all) {
    return `<div class="card glint span-wide" id="minute-card"><div class="card-h"><h3>${L('Godzina wejścia')}<span class="sub">${L('każdy trade w swojej minucie')}</span></h3></div>
      <div class="empty mini"><p>${L("Brak trade'ów z godziną wejścia")}${D.noTime ? ` (${L('{n} bez godziny', { n: D.noTime })})` : ''}. ${L('Wpisz godzinę w polu „Data” w Notion albo w formularzu „Dodaj trade”.')}</p></div></div>`;
  }
  minPts = D.shown.map((x) => {
    const o = S.outcome(x);
    const bm = S.beByMargin(x);
    const what = [x.instrument, x.dir].filter(Boolean).join(' ') || 'trade';
    return {
      id: x.id, t: x, m: F.hmToMin(x.time), v: x.r, kind: KIND_OF[o],
      tip: `<b>${esc(x.time)}</b> · ${esc(what)}<br>R: <b class="${cls(x.r)}">${fmtR(x.r)}</b> · <span class="${RES_CLASS[o]}">${RES_LABEL[o]}</span>${bm ? ` <span class="t-muted">(${L('margines ±{v}R', { v: num(bm.v, 2) })})</span>` : ''}`,
      aria: `${x.time}, ${what}, ${fmtR(x.r)}, ${KIND_WORD[o]}. ${t('Enter otwiera szczegóły.')}`,
    };
  });
  const seg = D.sessions.length
    ? `<div class="seg sm" role="group" aria-label="${L('Sesja wejścia')}"><button type="button" data-act="msession" data-v="" aria-pressed="${!minSession}">${L('Wszystko')}</button>${D.sessions.map((x) => `<button type="button" data-act="msession" data-v="${esc(x)}" aria-pressed="${minSession === x}">${esc(x)}</button>`).join('')}</div>`
    : '';
  const n = minPts.length;
  const range = n ? `${minPts[0].t.time}–${minPts[n - 1].t.time}` : '';
  const foot = [D.noTime ? `<b>${L('{n} bez godziny', { n: D.noTime })}</b> ${L('(pominięte)')}` : '', D.noR ? `<b>${L('{n} bez R', { n: D.noR })}</b> ${L('(pominięte)')}` : '', L('Strzałki przechodzą między trade\'ami, Enter pokazuje szczegóły.')].filter(Boolean).join(' · ');
  const body = n ? '<div class="chart lolli" id="minute"></div>' : `<div class="empty mini"><p>${L('Brak trade\'ów z godziną i R w tej sesji.')}</p></div>`;
  return `<div class="card glint span-wide" id="minute-card"><div class="card-h"><h3>${L('Godzina wejścia')}<span class="sub">${L('R wg minuty wejścia')}${n ? ` · ${L('zakres {r}', { r: range })} · ${esc(nTrades(n))}` : ''}</span></h3>${seg}</div>
    ${body}<p class="note bk-foot">${foot}</p></div>`;
}
function drawMinute() {
  const el = $('#minute');
  if (!el || !minPts.length) return;
  drawLollipop(el, minPts, {
    fmtY: (v) => `${num(v, 1)}R`,
    label: t('R każdego trade\'a wg minuty wejścia'),
    onOpen: (id, node) => openDetail(minPts.map((p) => p.t), id, node),
  });
}

// Rozkład R: histogram o automatycznie dobranej szerokości przedziału (0,1 / 0,25 / 0,5 / 1R) albo wybranej w nagłówku.
// Pusty przedział nie ma słupka, przedział ujemny jest w kolorze straty, dodatni zysku, a BE (margines) to neutralny słupek w miejscu 0.
// Klik lub Enter na słupku filtruje zakładkę Trade'y do tego przedziału (rFilter, niezapamiętywany).
let rdistItems = [];
let rdistBins = [];
let rFilter = null; // { bin, text }
const rStepLabel = (v) => (v === 'auto' ? t('Auto') : F.num(Number(v), 2));
const edgeR = (x) => (x === 0 ? '0' : (x > 0 ? '+' : '−') + F.num(Math.abs(x), 2) + 'R');
const rangeR = (b) => (b.kind === 'be' ? 'BE' : b.hi === Infinity ? `≥ ${edgeR(b.lo)}` : b.lo === -Infinity ? `≤ ${edgeR(b.hi)}` : t('{a} do {b}', { a: edgeR(b.lo), b: edgeR(b.hi) }));
function rDistCard(set) {
  const H = S.rHistogram(set, state.rStep);
  rdistItems = []; rdistBins = [];
  const seg = `<div class="seg sm" role="group" aria-label="${L('Szerokość przedziału')}">${['auto', '0.1', '0.25', '0.5'].map((v) => `<button type="button" data-act="rstep" data-v="${v}" aria-pressed="${state.rStep === v}">${esc(rStepLabel(v))}</button>`).join('')}</div>`;
  if (!H.n) return `<div class="card glint" id="rdist-card"><div class="card-h"><h3>${L('Rozkład R')}</h3>${seg}</div><div class="empty mini"><p>${L("Brak trade'ów z wartością R.")}</p></div></div>`;
  rdistBins = H.items;
  rdistItems = H.items.map((b) => {
    const pct = Math.round((b.n / H.n) * 100);
    const name = b.kind === 'be' ? `BE (±${F.num(S.cfg.beR, 2)}R)` : rangeR(b);
    return {
      kind: b.kind, tail: !!b.tail, v: b.n > 0 ? b.n : null,
      edge: b.kind === 'be' || b.tail ? '' : edgeR(b.lo),
      center: b.kind === 'be' ? '0' : b.tail ? (b.hi === Infinity ? `≥${edgeR(b.lo)}` : `≤${edgeR(b.hi)}`) : '',
      tip: `<b>${esc(name)}</b> · ${esc(nTrades(b.n))} · ${L('{p}% wszystkich', { p: pct })}<br><span class="t-muted">${L("klik: pokaż w zakładce Trade'y")}</span>`,
      aria: `${name}: ${nTrades(b.n)}, ${t('{p}% wszystkich', { p: pct })}. ${t("Enter pokazuje je w zakładce Trade'y.")}`,
    };
  });
  const sm = H.summary;
  const line = `${L('Mediana R')} <b class="${cls(sm.median)}">${fmtR(sm.median)}</b> · ${L('średnia R')} <b class="${cls(sm.mean)}">${fmtR(sm.mean)}</b> · ≥ +1R: <b>${F.num(sm.pGe1, 0)}%</b> · ≤ −1R: <b>${F.num(sm.pLe1, 0)}%</b>`;
  return `<div class="card glint" id="rdist-card"><div class="card-h"><h3>${L('Rozkład R')}<span class="sub">${L('przedziały co {s}R', { s: F.num(H.step, 2) })} · BE ±${F.num(S.cfg.beR, 2)}R · ${esc(nTrades(H.n))}</span></h3>${seg}</div>
    <div class="chart" id="rdist"></div><p class="note bk-foot">${line}${H.noR ? ` · <b>${L('{n} bez R', { n: H.noR })}</b> ${L('(pominięte)')}` : ''}</p></div>`;
}
function drawRdist() {
  const el = $('#rdist');
  if (!el || !rdistItems.length) return;
  drawColumns(el, rdistItems, {
    fmtY: (v) => String(v), yInt: true, yTitle: t("liczba trade'ów"), edgeLabels: true, barFill: 0.8, height: 210,
    label: t('Rozkład R: liczba trade\'ów w przedziałach'),
    onPick: (i) => pickRBin(i),
  });
}
function pickRBin(i) {
  const bin = rdistBins[i];
  if (!bin) return;
  rFilter = { bin, text: bin.kind === 'be' ? 'BE' : rangeR(bin) };
  state.view = 'trades'; save();
  renderTabs(); applySheetAttr(); renderMain();
  $('#main').scrollTo({ top: 0 });
}

// Zbiór do rozbić. W Live przełącznik „+ paper” dolicza trade'y paper (KPI zostają czyste).
function extendedSet(cur, range) {
  if (!isLive() || !state.skipped) return cur;
  return cur.concat(inRange(baseTrades('Niewzięty'), range));
}

function sectionBreakdowns(cur, ext) {
  const metric = state.metric;
  const live = isLive();
  const paperMode = state.typ === 'Niewzięty';
  const note = (metric === 'avg' ? t('średni R') : t('suma R')) + (live && state.skipped ? ' · ' + t('z paper') : '');
  const dayRows = S.group(ext, (t) => [F.weekdayIdx(t.date)]);
  const have = new Set(dayRows.map((r) => r.key));
  const wdays = [0, 1, 2, 3, 4, 5, 6].filter((i) => i < 5 || have.has(i)).map((i) => dayRows.find((r) => r.key === i) || { key: i, n: 0, sumR: null, avgR: null, wr: null });
  wdays.forEach((r) => { r.label = F.DAYS_TITLE[r.key]; });
  const nth = S.nthTradeGroups(ext);
  const nthFoot = L('Kolejność wg godziny wejścia; gdy trade dnia nie ma godziny, wg kolejności dodania do Notion.');
  const skipSeg = live
    ? `<div class="seg sm" role="group" aria-label="${L('Zakres rozbić')}"><button type="button" data-act="skipped" data-v="0" aria-pressed="${!state.skipped}">${L('Tylko live')}</button><button type="button" data-act="skipped" data-v="1" aria-pressed="${state.skipped}">+ paper</button></div>`
    : '';
  const seg = `<div class="sec-ctl">${skipSeg}<div class="seg sm" role="group" aria-label="${L('Miara rozbić')}"><button type="button" data-act="metric" data-v="sum" aria-pressed="${metric === 'sum'}">${L('Suma R')}</button><button type="button" data-act="metric" data-v="avg" aria-pressed="${metric === 'avg'}">${L('Średni R')}</button></div></div>`;
  const dirRows = S.group(ext, (t) => [t.dir]);
  // czas trwania (dodatek 23)
  const D = S.durationGroups(ext);
  const missingTxt = D.missing ? `<b>${L('{n} bez czasu', { n: D.missing })}</b> ${L('(brak godziny wejścia lub wyjścia z godziną)')}` : '';
  const durFoot = D.n
    ? `${L('Mediana czasu: wygrane {w} · straty {l} · BE {b}', { w: F.fmtDur(D.medWin), l: F.fmtDur(D.medLoss), b: F.fmtDur(D.medBe) })}<br>${L('Najkrótszy {a} · najdłuższy {b}', { a: F.fmtDur(D.min), b: F.fmtDur(D.max) })}<br>${P("{n} trade'ów z czasem", D.n)}${missingTxt ? ' · ' + missingTxt : ''}`
    : `${L("Brak trade'ów z godziną wejścia i wyjścia")}${D.missing ? ` (${L('{n} bez czasu', { n: D.missing })})` : ''}. ${L('Wpisz godziny w polach „Data” i „Wyjście” w Notion albo w formularzu.')}`;
  return {
    side: (paperMode
      ? bkCard(t('Powód (paper)'), S.group(cur, (x) => [x.reason || t('Bez powodu')]), { metric: 'sum', note: t('suma R · WR · liczba') })
      : '') + `${bkCard(t('Kolejny trade w dniu'), nth, { metric, note, order: (r) => r.key, foot: nthFoot })}${rDistCard(ext)}`,
    html: `<section class="sec" aria-label="${L('Rozbicia')}"><div class="sec-h"><h2>${L('Rozbicia')}</h2>${seg}</div>
      <div class="gr bk-grid">
        ${bkCard(t('Setup'), S.group(ext, (x) => [x.setup || t('Bez setupu')]), { metric, note })}
        ${bkCard(t('Instrument'), S.group(ext, (x) => [x.instrument || t('Bez instrumentu')]), { metric, note })}
        ${bkCard(t('Sesja'), S.group(ext, (x) => [x.session || t('Bez sesji')]), { metric, note })}
        ${bkCard(t('Dzień tygodnia'), wdays, { metric, note, order: (r) => r.key })}
        ${bkCard(t('Kierunek'), dirRows, { metric, note })}
        ${minuteCardHtml(ext)}
        ${bkCard(t('Czas trwania'), D.rows, { metric, note, order: (r) => r.key, foot: durFoot, span: 'span-side' })}
      </div></section>`,
  };
}

// Prop firmy: liczniki i kwoty idą do prawego panelu, tabele i wykresy zostają w centrum.
function propData(range) {
  const konta = model.konta;
  const cnt = {
    active: konta.filter((k) => k.active).length,
    funded: konta.filter((k) => k.status === 'Funded').length,
    chall: konta.filter((k) => k.status === 'Challenge' || k.status === 'Weryfikacja').length,
    lost: konta.filter((k) => k.status === 'Przegrane').length,
  };
  const all = S.money(model.finanse);
  const per = range.from || range.to ? S.money(inRange(model.finanse, range)) : null;
  return { cnt, all, per };
}

// ---------- ramka: pasek górny, DESK, panel dnia, status ----------
function renderTabs() {
  const range = resolveRange();
  const nG = model ? gallerySet(false).length : 0;
  const nT = model ? inRange(baseTrades(state.typ, true), range).length : 0;
  const cnt = (n) => (model ? `<span class="cnt">${n}</span>` : '');
  const sel = (v) => state.view === v;
  $('#tabs').innerHTML = `
    <button type="button" class="nav-tab" role="tab" data-act="view" data-v="stats" aria-selected="${sel('stats')}">${ICON.chart(15)}${L('Statystyki')}</button>
    <button type="button" class="nav-tab" role="tab" data-act="view" data-v="trades" aria-selected="${sel('trades')}">${ICON.list(15)}${L("Trade'y")} ${cnt(nT)}</button>
    <button type="button" class="nav-tab" role="tab" data-act="view" data-v="prop" aria-selected="${sel('prop')}">${ICON.wallet(15)}${L('Prop')}</button>
    <button type="button" class="nav-tab" role="tab" data-act="view" data-v="gallery" aria-selected="${sel('gallery')}">${ICON.image(15)}${L('Galeria')} ${cnt(nG)}</button>`;
  $('#tabs').setAttribute('aria-label', t('Widok'));
  const item = (act, v, ico, label, attr) => `<button type="button" class="tb-item" data-act="${act}" data-v="${v}" ${attr}>${ico(24)}<span class="t">${label}</span></button>`;
  $('#tabbar').innerHTML =
    item('view', 'stats', ICON.chart, L('Statystyki'), `aria-selected="${sel('stats') && !state.ui.sheet}"`) +
    item('view', 'trades', ICON.list, L("Trade'y"), `aria-selected="${sel('trades') && !state.ui.sheet}"`) +
    item('view', 'prop', ICON.wallet, L('Prop'), `aria-selected="${sel('prop') && !state.ui.sheet}"`) +
    item('view', 'gallery', ICON.image, L('Galeria'), `aria-selected="${sel('gallery') && !state.ui.sheet}"`) +
    item('sheet', 'desk', ICON.filter, L('Filtry'), `aria-pressed="${state.ui.sheet === 'desk'}"`) +
    item('sheet', 'side', ICON.panel, L('Panel'), `aria-pressed="${state.ui.sheet === 'side'}"`);
}

function renderDesk() {
  const kontaOpts = model ? model.konta.map((k) => ({ value: k.id, label: k.name, logo: logoHtml(k.firma, 18) })) : [];
  const setupOpts = model ? [...new Set(model.trades.map((x) => x.setup).filter(Boolean))].sort((a, b) => a.localeCompare(b, getLang())).map((s) => ({ value: s, label: s })) : [];
  const list = (key, label, opts, selected, disabled, title) => {
    const open = state.ui.dd === key && !disabled;
    const val = selected && selected.length ? L('{a} z {b}', { a: selected.length, b: opts.length }) : L('wszystkie');
    return `<div class="field"><button type="button" class="sec-btn" data-act="dd" data-v="${key}" aria-expanded="${open}" ${disabled ? `disabled title="${esc(title)}"` : ''}><span class="lbl">${esc(label)}</span><span class="sec-val" data-lbl="${key}">${val}</span><span class="chev">${ICON.chev(14)}</span></button>
      ${open ? `<div class="chk-list" role="group" aria-label="${esc(label)}">${opts.map((o) => `<label class="chk"><input type="checkbox" data-dd-item="${key}" value="${esc(o.value)}" ${!selected || selected.includes(o.value) ? 'checked' : ''}>${o.logo || ''}<span title="${esc(o.label)}">${esc(o.label)}</span></label>`).join('') || `<div class="note">${L('Brak pozycji')}</div>`}
        <div><button type="button" class="btn ghost sm" data-act="dd-all" data-v="${key}">${L('Wszystkie')}</button></div></div>` : ''}</div>`;
  };
  $('#desk').innerHTML = `
    <div class="panel-h"><span class="lbl">Desk</span><button type="button" class="icon-btn only-m" data-act="sheet" data-v="" aria-label="${L('Zamknij filtry')}">${ICON.close(16)}</button></div>
    <div class="field" style="padding-top:4px"><label class="lbl" for="q">${L('Szukaj')}</label>
      <div class="srch"><input id="q" type="search" value="${esc(state.q)}" placeholder="${L('Nazwa lub notatka')}" autocomplete="off" spellcheck="false" aria-label="${L("Szukaj po nazwie i notatkach trade'a")}">${state.q ? `<button type="button" class="icon-btn clr" data-act="q-clear" aria-label="${L('Wyczyść wyszukiwanie')}">${ICON.close(14)}</button>` : ''}</div></div>
    <div class="rule-x"></div>
    <div class="field"><span class="lbl" id="l-typ">${L('Typ')}</span>
      <div class="seg full" role="group" aria-labelledby="l-typ">${TYPES.map(([v, l]) => `<button type="button" data-act="typ" data-v="${v}" aria-pressed="${state.typ === v}">${l}</button>`).join('')}</div></div>
    <div class="rule-x"></div>
    <div class="field"><span class="lbl" id="l-okres">${L('Okres')}</span><div id="period-slot"></div></div>
    <div class="rule-x"></div>
    ${list('konta', t('Konta'), kontaOpts, state.konta, !isLive(), t("Filtr kont dotyczy tylko trade'ów Live"))}
    <div class="rule-x"></div>
    ${list('setups', t('Setup'), setupOpts, state.setups, false)}
    <div class="rule-x"></div>
    <div class="field"><span class="lbl" id="l-unit">${L('Jednostka')}</span>${unitSeg()}</div>
`;
  period.mount($('#period-slot'));
}

const DAYS_FULL = F.DAYS_FULL;
function sideSection(key, label, body, action = '') {
  const open = !isClosed(key);
  return `<div class="rule-x"></div><div class="field"><div class="sec-row"><button type="button" class="sec-btn" data-act="sec" data-v="${key}" aria-expanded="${open}" aria-controls="sec-${key}"><span class="lbl">${esc(label)}</span><span class="chev">${ICON.chev(14)}</span></button>${action}</div>
    ${open ? `<div class="sec-body" id="sec-${key}">${body}</div>` : ''}</div>`;
}

function renderSide() {
  const tk = F.todayKey();
  const { m, d } = F.parseKey(tk);
  const dayNum = getLang() === 'en' ? `${F.MON_SHORT[m - 1]} ${d}` : `${F.pad(d)}.${F.pad(m)}`;
  const dayBlock = `<div class="day"><span class="lbl">${L('Dziś')}</span><div class="day-date"><b>${esc(dayNum)}</b><span>${esc(DAYS_FULL[F.weekdayIdx(tk)])} · ${tk.slice(0, 4)}</span></div></div>`;
  let html = `<div class="panel-h"><span class="lbl">${L('Panel')}</span><button type="button" class="icon-btn only-m" data-act="sheet" data-v="" aria-label="${L('Zamknij panel')}">${ICON.close(16)}</button></div>${dayBlock}`;
  if (!model || !ctx) {
    html += `<div class="rule-x"></div><p class="note" style="padding-top:12px">${model || loading ? '' : L('Brak danych. Odśwież po naprawieniu połączenia.')}</p>`;
  } else {
    const { range, cur, ext, c } = ctx;
    // podsumowanie okresu
    const sum = `<div class="kv">
      <div><span class="k">${L('Typ')}</span><span class="v">${esc(typLabel(state.typ))}</span></div>
      <div><span class="k">${L('Okres')}</span><span class="v">${esc(range.label)}</span></div>
      <div><span class="k">${L("Trade'y")}</span><span class="v">${cur.length}</span></div>
      <div><span class="k">${L('Suma R')}</span><span class="v ${cls(c?.sumR)}">${c ? fmtR(c.sumR) : DASH}</span></div>
      <div><span class="k">${L('Win rate')}</span><span class="v">${c ? fmtPct(c.winRate, 0) : DASH}${c ? `<small>${c.wins}W ${c.losses}L ${c.be}BE</small>` : ''}</span></div>
    </div>`;
    html += sideSection('sum', t('Podsumowanie okresu'), sum);
    // ostatnie trade'y: klik otwiera szczegóły (dodatek 3)
    const showTyp = ext !== cur || state.typ === 'Niewzięty';
    const rows = [...ext].sort(cmpRecent).slice(0, 10);
    ctx.recent = rows;
    const res = (tr) => {
      const o = S.outcome(tr);
      return o === 'win' ? '<small class="pos">✓ Win</small>' : o === 'loss' ? '<small class="neg">✗ Loss</small>' : '<small class="be">– BE</small>';
    };
    const list = rows.length
      ? `<ul class="mini-list">${rows.map((tr) => `<li><button type="button" class="t" data-act="trade-open" data-src="recent" data-id="${esc(tr.id)}" title="${L('{name}: pokaż szczegóły', { name: tLabel(tr) })}">${showTyp ? `${esc(typLabel(tr.typ))} · ` : ''}${esc(tLabel(tr))}</button>
        <span class="s">${esc([whenText(tr), tr.instrument, tr.dir, tr.setup].filter(Boolean).join(' · '))}${tr.pnl != null ? ` · ${fmtMoney(tr.pnl)}` : ''}</span>
        <span class="r ${cls(tr.r)}">${fmtR(tr.r)}${res(tr)}</span></li>`).join('')}</ul>`
      : `<p class="note">${L('Brak trade\'ów w wybranym okresie.')}</p>`;
    html += sideSection('recent', t("Ostatnie trade'y"), list + (rows.length ? `<p class="note" style="padding-top:6px">${L('10 najnowszych w wybranym okresie · klik pokazuje szczegóły')}</p>` : ''));
    // prop firmy (domyślnie zwinięte)
    const pd = propData(range);
    const money = (l, v, c, p) => `<div><span class="k">${L(l)}</span><span class="v ${c}">${v}</span></div>${pd.per ? `<div><span class="k" style="padding-left:8px">${L('w okresie')}</span><span class="v">${p}</span></div>` : ''}`;
    const propHtml = `<div class="counters">
        <div><span class="n">${pd.cnt.active}</span><span class="l">${L('Aktywne')}</span></div>
        <div><span class="n pos">${pd.cnt.funded}</span><span class="l">${L('Funded')}</span></div>
        <div><span class="n">${pd.cnt.chall}</span><span class="l">${L('W challenge')}</span></div>
        <div><span class="n neg">${pd.cnt.lost}</span><span class="l">${L('Przegrane')}</span></div></div>
      <div class="kv">${money('Wydane', fmtMoney(pd.all.spend, { plus: false }), '', pd.per ? fmtMoney(pd.per.spend, { plus: false }) : '')}
        ${money('Wypłacone', fmtMoney(pd.all.payout, { plus: false }), pd.all.payout > 0 ? 'pos' : '', pd.per ? fmtMoney(pd.per.payout, { plus: false }) : '')}
        ${money('Bilans', fmtMoney(pd.all.balance), cls(pd.all.balance), pd.per ? fmtMoney(pd.per.balance) : '')}</div>
      <span class="note">${pd.per ? L('Łącznie od początku i w wybranym okresie.') : L('Łącznie, od początku.')}</span>${prop_.activeList()}`;
    html += sideSection('prop', t('Prop firmy'), propHtml, `<button type="button" class="icon-btn sec-plus" data-act="prop-plus" aria-haspopup="menu" aria-expanded="false" aria-label="${L('Dodaj: konto, payout lub wydatek')}">${ICON.plus(14)}</button>`);
  }
  html += `<div class="side-foot"><div class="rule-x" style="margin-bottom:10px"></div>${L('Źródło')}: <a data-notion="app" href="#">Notion</a> · <a data-notion="web" href="#" target="_blank" rel="noopener">${L('w przeglądarce')}</a></div>`;
  $('#side').innerHTML = html;
  linkNotion();
}

const cmpRecent = (a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '') || b.created.localeCompare(a.created);

function linkNotion() {
  const root = model?.notionUrl;
  $$('[data-notion="web"]').forEach((a) => { a.href = root || '#'; });
  $$('[data-notion="app"]').forEach((a) => { a.href = root ? root.replace(/^https?:\/\//, 'notion://') : '#'; });
}

function renderStatus() {
  const el = $('#updated');
  if (model) {
    const t0 = new Date(model.fetchedAt);
    const checked = lastCheck ? `${t('Odświeżono {time}', { time: hm(lastCheck) })} · ` : '';
    el.textContent = `${checked}${t('dane z Notion {time}', { time: hm(t0) })}${model.cached ? ' (cache)' : ''}${statusNote ? ` · ${statusNote}` : ''}`;
    $('#entries').textContent = `${t('Wpisy: {n}', { n: model.trades.length })}${ctx ? ` · ${t('w widoku: {n}', { n: ctx.cur.length })}` : ''}`;
  } else {
    el.textContent = loading ? t('Łączę z Notion…') : t('Brak połączenia z Notion');
    $('#entries').textContent = '';
  }
  upd.renderPill();
  linkNotion();
}

// Zapis ustawień serwera (config.local.json): język i sprawdzanie aktualizacji. Zmiana języka przeładowuje stronę.
async function saveConfig(patch) {
  try {
    const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-THQ': '1' }, body: JSON.stringify(patch) });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    meta = { ...meta, ...j };
    if (patch.lang) { langOverride = patch.lang; await sync?.changed({ now: true }); rememberLang(patch.lang); location.reload(); return; }
    if ('updateCheck' in patch) { upd.check(); sync?.changed(); }
    if ('syncEnabled' in patch && patch.syncEnabled) { const r = await sync.pull(); if (!r?.applied) sync.changed({ now: true }); }
    if ('syncEnabled' in patch) devices.refresh();
    toast(t('Zapisano ustawienia.'));
  } catch {
    toast(t('Nie udało się zapisać ustawień. Sprawdź, czy dashboard działa.'), { error: true });
    ust.rerender();
  }
}

// ---------- render centrum ----------
function renderMain() {
  const view = $('#view');
  chartJobs = [];
  if (loading && !model) return;
  if (!model) {
    ctx = null;
    view.innerHTML = `<div class="card empty err"><span class="ico-box">${ICON.close(20)}</span><h3>${L('Nie udało się pobrać danych')}</h3><p>${esc(loadError || t('Nieznany błąd.'))}</p><button class="btn primary" type="button" data-act="refresh">${L('Spróbuj ponownie')}</button></div>`;
    renderSide(); renderStatus();
    return;
  }
  const range = resolveRange();
  const base = baseTrades();
  const cur = inRange(base, range);
  const ext = extendedSet(cur, range);
  const c = cur.length ? S.calc(cur) : null;
  ctx = { range, base, cur, ext, c, recent: [] };
  if (state.view === 'gallery') {
    view.innerHTML = renderGallery(range) + footLine();
    bindGallery();
    renderSide(); renderStatus();
    return;
  }
  if (state.view === 'trades') {
    view.innerHTML = renderTrades(range) + footLine();
    renderSide(); renderStatus();
    return;
  }
  if (state.view === 'prop') {
    view.innerHTML = prop.viewHtml(range) + footLine();
    chartJobs.push(() => prop.draw());
    drawCharts();
    renderSide(); renderStatus();
    return;
  }
  const banner = loadError ? `<div class="card empty mini err"><h3>${L('Odświeżenie nie powiodło się')}</h3><p>${esc(loadError)} ${L('Pokazuję ostatnio pobrane dane.')}</p></div>` : '';
  let html = pageHead(t('Statystyki'), `${typLabel(state.typ)} · ${range.label}${searchNote()}${range.prev && c && !S.calc(inRange(base, range.prev)).n ? ' · ' + t('poprzedni okres jest pusty, więc bez porównań') : ''}`) + banner;
  if (!cur.length) {
    html += `<section class="sec">${emptyState(range)}</section>`;
    if (model.trades.length) html += `<section class="sec"><div class="card" id="cal">${renderCalendar()}</div></section>`;
  } else {
    const p = range.prev ? S.calc(inRange(base, range.prev)) : null;
    const bk = sectionBreakdowns(cur, ext);
    html += sectionKpi(c, p, range, cur);
    html += sectionEquity(cur, range);
    html += `<section class="sec" aria-label="${L('Kalendarz i dyscyplina')}"><div class="gr row-c"><div class="card" id="cal">${renderCalendar()}</div><div class="stack">${bk.side}</div></div></section>`;
    html += `<section class="sec" id="heat-sec" aria-label="${L('Mapa dni')}">${renderHeatmap()}</section>`;
    html += bk.html;
  }
  html += footLine();
  view.innerHTML = html;
  const fy = () => (unitNow() === 'R' ? (v) => `${num(v, 1)}R` : (v) => F.compactVal(v, '$').replace(/^\+/, ''));
  if ($('#equity')) chartJobs.push(() => drawEquity($('#equity'), equityPts, { fmtY: fy(), label: t('Krzywa kapitału narastająco'), second: equitySecond }));
  if ($('#uw')) chartJobs.push(() => drawUnderwater($('#uw'), uwPts, { fmtY: fy(), label: t('Spadki od szczytu krzywej kapitału') }));
  chartJobs.push(() => drawRdist());
  chartJobs.push(() => drawMinute());
  drawCharts();
  scrollHeat();
  renderSide(); renderStatus();
}

function footLine() {
  return `<p class="foot">${L('Dane z Notion. Dodawanie i edycja trade\'ów zapisuje się do Notion, usuwanie robisz w Notion.')}</p>`;
}
const searchNote = () => (state.q.trim() ? ' · ' + t('szukaj: „{q}”', { q: state.q.trim() }) : '');

function pageHead(title, sub, right = '') {
  return `<header class="page-head"><div><h1>${esc(title)}</h1><p class="page-sub">${esc(sub)}</p></div>${right}</header>`;
}

function drawCharts() { chartJobs.forEach((j) => j()); }

function renderAll() { renderDesk(); renderTabs(); renderMain(); applySheetAttr(); }
function applySheetAttr() { document.body.dataset.sheet = state.ui.sheet || ''; }

// ---------- zakładka Trade'y (dodatek 26) ----------
const resOf = (t) => (t.counted ? S.outcome(t) : 'none');
const RES_LABEL = { win: '✓ Win', loss: '✗ Loss', be: '– BE', none: t('bez wyniku') };
const RES_CLASS = { win: 'pos', loss: 'neg', be: 'be', none: 'muted' };
const RES_RANK = { win: 3, be: 2, loss: 1, none: 0 };

const SORT_VAL = {
  date: (t) => `${t.date}T${t.time || '00:00'}`,
  name: (t) => F.fold(tLabel(t)),
  instrument: (t) => t.instrument,
  dir: (t) => t.dir,
  setup: (t) => t.setup,
  dur: (t) => t.dur,
  res: (t) => RES_RANK[resOf(t)],
  r: (t) => t.r,
  pnl: (t) => t.pnl,
};
const COLS = [['date', t('Data'), ''], ['name', t('Trade'), ''], ['instrument', t('Instrument'), ''], ['dir', t('Kierunek'), ''], ['setup', t('Setup'), ''], ['dur', t('Czas'), 'r'], ['res', t('Wynik'), ''], ['r', 'R', 'r'], ['pnl', 'P&L', 'r']];

function sortRows(rows) {
  const val = SORT_VAL[state.sortK] || SORT_VAL.date;
  const dir = state.sortD === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return cmpRecent(a, b);
    if (x == null) return 1;   // puste zawsze na końcu, niezależnie od kierunku
    if (y == null) return -1;
    const c = typeof x === 'string' ? x.localeCompare(y, getLang()) : x - y;
    return c * dir || cmpRecent(a, b);
  });
}

const TABLE_CAP = 400;
function renderTrades(range) {
  let all = inRange(baseTrades(state.typ, true), range);
  if (rFilter) all = all.filter((t) => S.inRBin(t, rFilter.bin));
  const rows = sortRows(all);
  const shown = rows.slice(0, TABLE_CAP);
  ctx.rows = shown;
  const chip = rFilter ? `<button type="button" class="chip" data-act="rf-clear" aria-label="${L('Usuń filtr przedziału R')}">${L('Przedział R: {r}', { r: rFilter.text })} ${ICON.close(12)}</button>` : '';
  const add = `${chip}<button class="btn primary" type="button" data-act="add-trade">${ICON.plus(14)}${L('Dodaj trade')}</button>`;
  const head = pageHead(t("Trade'y"), `${typLabel(state.typ)} · ${range.label}${searchNote()} · ${nTrades(all.length)}`, add);
  if (!all.length) return `${head}<section class="sec">${emptyState(range)}</section>`;
  const th = COLS.map(([k, l, a]) => {
    const on = state.sortK === k;
    return `<th class="${a}" aria-sort="${on ? (state.sortD === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" class="th-btn" data-act="sort" data-v="${k}">${esc(l)}<span class="si" aria-hidden="true">${on ? (state.sortD === 'asc' ? ICON.sortUp(12) : ICON.sortDown(12)) : ''}</span></button></th>`;
  }).join('');
  const tr = shown.map((t) => {
    const r = resOf(t);
    return `<tr class="trow" data-act="trade-open" data-src="rows" data-id="${esc(t.id)}"><td class="nw">${esc(F.shortDate(t.date))}${t.time ? `<small>${esc(t.time)}</small>` : ''}</td>
      <td class="nm"><button type="button" class="row-btn" data-act="trade-open" data-src="rows" data-id="${esc(t.id)}" title="${L('Pokaż szczegóły')}">${esc(tLabel(t))}</button></td>
      <td>${t.instrument ? esc(t.instrument) : DASH}</td><td>${t.dir ? badge(t.dir, t.dirColor) : DASH}</td><td class="st" title="${esc(t.setup || '')}">${t.setup ? esc(t.setup) : DASH}</td>
      <td class="r">${t.dur != null ? esc(F.fmtDur(t.dur)) : DASH}</td><td class="res ${RES_CLASS[r]}">${RES_LABEL[r]}</td>
      <td class="r ${cls(t.r)}"><b>${rText(t)}</b></td><td class="r ${cls(t.pnl)}">${t.pnl != null ? fmtMoney(t.pnl) : DASH}</td></tr>`;
  }).join('');
  const cards = shown.map((t) => {
    const r = resOf(t);
    return `<button type="button" class="tcard" data-act="trade-open" data-src="rows" data-id="${esc(t.id)}"><span class="tc1"><b>${esc(tLabel(t))}</b><b class="${cls(t.r)}">${rText(t)}</b></span>
      <span class="tc2">${esc([whenText(t), t.instrument, t.dir, t.setup].filter(Boolean).join(' · '))}</span>
      <span class="tc3"><span class="${RES_CLASS[r]}">${RES_LABEL[r]}</span>${t.dur != null ? `<span>${esc(F.fmtDur(t.dur))}</span>` : ''}${t.pnl != null ? `<span class="${cls(t.pnl)}">${fmtMoney(t.pnl)}</span>` : ''}</span></button>`;
  }).join('');
  const cap = rows.length > TABLE_CAP ? `<p class="note">${L("Pokazuję {a} z {b} trade'ów. Zawęź okres lub filtry, żeby zobaczyć resztę.", { a: TABLE_CAP, b: rows.length })}</p>` : '';
  return `${head}<section class="sec" aria-label="${L("Lista trade'ów")}"><div class="card tt-card"><div class="tbl-wrap tt-table"><table class="tt"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div><div class="tcards">${cards}</div></div>${cap}</section>`;
}

// ---------- galeria zrzutów ----------
// Lista kafelków (trade + numer obrazu) wg aktualnych filtrów. Filtr wyniku działa tylko tutaj.
function gallerySet(applyRes = true) {
  const range = resolveRange();
  let cur = inRange(baseTrades(state.typ, true), range).filter((t) => t.imgs > 0);
  if (applyRes && state.res !== 'all') cur = cur.filter((t) => resOf(t) === state.res);
  cur.sort(cmpRecent);
  const items = [];
  for (const t of cur) for (let i = 0; i < t.imgs; i++) items.push({ t, i, k: t.imgs });
  return items;
}

const imgSrc = (it) => `/api/img?page=${encodeURIComponent(it.t.id)}&i=${it.i}`;
const capParts = (x) => [F.shortDate(x.date), x.instrument, x.setup, x.dir === 'NO TRADE' ? t('bez wejścia') : x.dir].filter(Boolean);
const rText = (t) => (t.r != null ? fmtR(t.r) : DASH);

function renderGallery(range) {
  const items = gallerySet();
  galleryItems = items;
  const trades = new Set(items.map((x) => x.t.id)).size;
  const resBtn = (v, l) => `<button type="button" data-act="res" data-v="${v}" aria-pressed="${state.res === v}">${l}</button>`;
  const resSeg = `<div class="seg sm" role="group" aria-label="${L('Wynik')}">${resBtn('all', L('Wszystkie'))}${resBtn('win', 'Win')}${resBtn('loss', 'Loss')}${resBtn('be', 'BE')}</div>`;
  const note = items.length ? `${t.p('{n} zrzutów', items.length)} ${t.p("z {n} trade'ów", trades)}` : t('Brak zrzutów');
  let body;
  if (!items.length) {
    body = `<div class="card empty"><span class="ico-box">${ICON.image(20)}</span><h3>${L('Brak zrzutów dla tych filtrów')}</h3><p>${L("Zmień okres, typ albo wynik. Zrzuty bierzemy z pola „Zrzut” w bazie Trade'y (oraz z linków TradingView w polu „Wykres”).")}</p><div>${state.preset !== 'all' ? `<button class="btn primary" type="button" data-act="show-all">${L('Pokaż cały okres')}</button>` : ''}${state.res !== 'all' ? ` <button class="btn ghost" type="button" data-act="res" data-v="all">${L('Wszystkie wyniki')}</button>` : ''}</div></div>`;
  } else {
    body = `<div class="gal">${items.map((it, idx) => {
      const t0 = it.t, r = resOf(t0);
      return `<button type="button" class="g-tile glint" data-act="lb-open" data-i="${idx}" aria-label="${L('Otwórz zrzut: {c}', { c: capParts(t0).join(', ') })}">
        <span class="g-img"><img src="${imgSrc(it)}" alt="${L('Zrzut: {c}', { c: capParts(t0).join(', ') })}" loading="lazy" decoding="async"><span class="g-err">${L('Nie udało się wczytać zrzutu')}</span></span>
        <span class="g-cap"><span class="g-l1">${esc(capParts(t0).slice(0, 2).join(' · '))}${it.k > 1 ? ` <span class="muted">(${it.i + 1}/${it.k})</span>` : ''}</span>
          <span class="g-l2"><span class="g-s">${esc(capParts(t0).slice(2).join(' · '))}</span><span class="g-r"><span class="${RES_CLASS[r]}">${esc(RES_LABEL[r])}</span> <b class="${cls(t0.r)}">${rText(t0)}</b></span></span></span></button>`;
    }).join('')}</div>`;
  }
  return `${pageHead(t('Galeria'), `${typLabel(state.typ)} · ${range.label} · ${note}`, resSeg)}<section class="sec" aria-label="${L('Galeria zrzutów')}">${body}</section>`;
}

let galleryItems = [];
function bindGallery() {
  // obraz, który się nie wczytał, pokazuje komunikat zamiast pustego pola
  document.querySelectorAll('.g-img img').forEach((img) => {
    const mark = () => img.closest('.g-img').classList.add('failed');
    img.addEventListener('error', mark);
    if (img.complete && img.naturalWidth === 0 && img.currentSrc) mark();
  });
}

// ---------- szczegóły trade'a (lightbox) ----------
// Ten sam podgląd służy galerii (zrzuty) i szczegółom trade'a z listy, panelu i tabeli. Trade bez zrzutu dostaje kartę zamiast obrazu.
const lb = { open: false, idx: 0, opener: null, el: null, items: [] };
function lbEl() {
  if (lb.el) return lb.el;
  const d = document.createElement('div');
  d.className = 'lb';
  d.hidden = true;
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-modal', 'true');
  d.setAttribute('aria-label', t("Szczegóły trade'a"));
  d.innerHTML = `<div class="lb-top"><span class="lb-count" aria-live="polite"></span><button type="button" class="icon-btn lb-close" data-act="lb-close" aria-label="${L('Zamknij podgląd')}">${ICON.close(18)}</button></div>
    <div class="lb-stage"><button type="button" class="lb-nav prev" data-act="lb-prev" aria-label="${L('Poprzedni')}">‹</button>
      <div class="lb-frame"><img class="lb-img" alt=""><span class="g-err">${L('Nie udało się wczytać zrzutu')}</span>
        <div class="lb-empty" hidden><span class="ico-box">${ICON.image(22)}</span><h3>${L('Ten trade nie ma zrzutu')}</h3><p>${L('Dodaj plik w polu „Zrzut” w Notion albo wklej link do TradingView w polu „Wykres” (przycisk „Edytuj”).')}</p></div></div>
      <button type="button" class="lb-nav next" data-act="lb-next" aria-label="${L('Następny')}">›</button></div>
    <div class="lb-info"><div class="lb-cap"></div><dl class="lb-facts"></dl><div class="lb-notes"></div>
      <div class="lb-actions"><button type="button" class="btn primary lb-edit" data-act="trade-edit">${ICON.edit(14)}${L('Edytuj')}</button><a class="btn lb-link" target="_blank" rel="noopener">${L('Otwórz w Notion')}</a></div></div>`;
  document.body.appendChild(d);
  const img = d.querySelector('.lb-img');
  img.addEventListener('error', () => d.querySelector('.lb-frame').classList.add('failed'));
  img.addEventListener('load', () => d.querySelector('.lb-frame').classList.remove('failed'));
  // przesunięcie palcem
  let x0 = null;
  d.querySelector('.lb-stage').addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  d.querySelector('.lb-stage').addEventListener('pointerup', (e) => {
    if (x0 != null && Math.abs(e.clientX - x0) > 60 && e.pointerType === 'touch') stepLightbox(e.clientX < x0 ? 1 : -1);
    x0 = null;
  });
  d.addEventListener('click', (e) => { if (e.target.classList.contains('lb-stage') || e.target === d) closeLightbox(); });
  lb.el = d;
  return d;
}

function factsOf(x) {
  const kontaNames = x.konta.map((id) => model.konta.find((k) => k.id === id)?.name).filter(Boolean);
  const exit = x.exitTime ? `${x.exitDate && x.exitDate !== x.date ? F.shortDate(x.exitDate) + ' ' : ''}${x.exitTime}` : null;
  const f = [
    [t('Typ'), typLabel(x.typ)],
    [t('Wejście'), `${F.longDate(x.date)}${x.time ? ' · ' + x.time : ''}`],
    [t('Wyjście'), exit],
    [t('Czas trwania'), x.dur != null ? F.fmtDur(x.dur) : null],
    [t('Instrument'), x.instrument], [t('Kierunek'), x.dir], [t('Setup'), x.setup], [t('Sesja'), x.session],
    ['R', x.r != null ? fmtR(x.r) : null, cls(x.r)], ['P&L', x.pnl != null ? fmtMoney(x.pnl) : null, cls(x.pnl)],
    [t('Konta'), kontaNames.join(', ') || null], [t('Powód'), x.reason],
  ];
  return f.filter((x) => x[1]);
}

function showLightbox() {
  const d = lbEl();
  const it = lb.items[lb.idx];
  if (!it) return;
  const tt = it.t, r = resOf(tt);
  const hasImg = it.i >= 0;
  const frame = d.querySelector('.lb-frame');
  frame.classList.remove('failed');
  const img = d.querySelector('.lb-img');
  img.hidden = !hasImg;
  frame.querySelector('.g-err').hidden = !hasImg;
  frame.querySelector('.lb-empty').hidden = hasImg;
  if (hasImg) { img.src = imgSrc(it); img.alt = t('Zrzut: {c}', { c: capParts(tt).join(', ') }); } else img.removeAttribute('src');
  d.querySelector('.lb-count').textContent = `${lb.idx + 1} / ${lb.items.length}`;
  const bm = S.beByMargin(tt);
  const bmTxt = bm ? (bm.unit === 'R' ? `±${num(bm.v, 2)}R` : `±${fmtMoney(bm.v, { plus: false })}`) : '';
  d.querySelector('.lb-cap').innerHTML = `<b>${esc(tLabel(tt))}</b> <span class="${RES_CLASS[r]}">${esc(RES_LABEL[r])}</span>${bm ? ` <span class="muted">(${L('w marginesie {v}', { v: bmTxt })})</span>` : ''} <b class="${cls(tt.r)}">${rText(tt)}</b>${hasImg && it.k > 1 ? `<span class="muted"> · ${L('zrzut {a}/{b}', { a: it.i + 1, b: it.k })}</span>` : ''}`;
  d.querySelector('.lb-facts').innerHTML = factsOf(tt).map(([k, v, c]) => `<div><dt>${esc(k)}</dt><dd class="${c || ''}">${esc(v)}</dd></div>`).join('');
  d.querySelector('.lb-notes').textContent = tt.notes || '';
  d.querySelector('.lb-notes').hidden = !tt.notes;
  d.querySelector('.lb-link').href = tt.url;
  d.querySelector('.lb-edit').dataset.id = tt.id;
  d.querySelector('.prev').disabled = lb.idx === 0;
  d.querySelector('.next').disabled = lb.idx === lb.items.length - 1;
  // wczytaj z wyprzedzeniem sąsiednie zrzuty
  [lb.idx - 1, lb.idx + 1].forEach((j) => { const n = lb.items[j]; if (n && n.i >= 0) new Image().src = imgSrc(n); });
}

function openLightbox(items, idx, opener) {
  if (!items[idx]) return;
  lb.items = items; lb.idx = idx; lb.open = true; lb.opener = opener || null;
  const d = lbEl();
  d.hidden = false;
  document.documentElement.classList.add('lb-lock');
  showLightbox();
  d.querySelector('.lb-close').focus();
}
// Szczegóły jednego trade'a z listy: każdy zrzut to osobna strona, trade bez zrzutu to jedna strona z kartą.
function openDetail(rows, id, opener) {
  const items = [];
  for (const t of rows) {
    const n = Math.max(1, t.imgs);
    for (let i = 0; i < n; i++) items.push({ t, i: t.imgs ? i : -1, k: t.imgs });
  }
  const idx = items.findIndex((x) => x.t.id === id);
  if (idx >= 0) openLightbox(items, idx, opener);
}
function closeLightbox({ restore = true } = {}) {
  if (!lb.open) return;
  lb.open = false;
  lbEl().hidden = true;
  lbEl().querySelector('.lb-img').removeAttribute('src');
  document.documentElement.classList.remove('lb-lock');
  if (restore) {
    const o = lb.opener && document.contains(lb.opener) ? lb.opener : document.querySelector(`.g-tile[data-i="${lb.idx}"]`);
    if (o) o.focus();
  }
  flushPending();
}
function stepLightbox(d) {
  const n = lb.idx + d;
  if (n < 0 || n >= lb.items.length) return;
  lb.idx = n;
  showLightbox();
}
function lightboxKey(ev) {
  if (ev.key === 'Escape') { ev.preventDefault(); closeLightbox(); }
  else if (ev.key === 'ArrowLeft') { ev.preventDefault(); stepLightbox(-1); }
  else if (ev.key === 'ArrowRight') { ev.preventDefault(); stepLightbox(1); }
  else if (ev.key === 'Tab') {
    const f = [...lbEl().querySelectorAll('button:not([disabled]), a[href]')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    else if (!lbEl().contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
  }
}

// ---------- formularz dodawania i edycji (dodatek 30) ----------
const form = createForm({
  getModel: () => model,
  types: TYPES,
  getDefaults: () => ({ typ: state.typ }),
  reload: (force) => load(force),
  onClose: () => { flushPending(); tour?.resume(); },
  onSaved: (payload, created) => {
    // nowy trade od razu widać: jeśli jest innego typu niż aktualny filtr, przełączamy filtr
    if (created && payload.typ && payload.typ !== state.typ && TYPES.some((x) => x[0] === payload.typ)) { state.typ = payload.typ; save(); refilter(); }
  },
});

// ---------- okres: segmenty, pole zakresu i popover (period.js) ----------
const period = createPeriod({
  state, save,
  refilter: () => refilter(),
  resolveRange,
  firstTradeDate: () => (model && model.trades.length ? model.trades.reduce((m, t) => (t.date < m ? t.date : m), '9999-12-31') : null),
  dayMap: () => (model ? S.byDay(baseTrades()) : new Map()),
});

// ---------- prop firmy: konta, wpisy finansowe, szczegóły konta (prop.js) ----------
const prop_ = createProp({ state, getModel: () => model, reload: (f) => load(f), resolveRange, inRange });
const prop = prop_;

// ---------- ustawienia: palety danych i marginesy BE (ustawienia.js) ----------
const ust = createSettings({ settings, save: saveSettings, getTheme, applyAll: () => applyPalette(settings, getTheme()), onBe: (k, raw) => applyBe(k, raw), getMeta: () => meta, onConfig: (p) => saveConfig(p), updateHtml: () => upd.settingsHtml() + ob.settingsHtml(), devicesHtml: () => devices.settingsHtml(), onSyncToggle: (on) => saveConfig({ syncEnabled: on }), onTab: () => devices.refresh() });
upd.onChange = () => { if (ust.isOpen()) ust.rerender(); };

// ---------- zatrzymanie serwera (dodatek 37) ----------
async function stopServer(opener) {
  const ok = await confirmDialog({
    title: t('Zatrzymać dashboard?'),
    text: t('Strona przestanie działać, dopóki nie uruchomisz jej ponownie (Dashboard.vbs albo start.sh). Dane w Notion zostają bez zmian.'),
    ok: t('Zatrzymaj'), cancel: t('Anuluj'),
  });
  if (!ok) { opener?.focus(); return; }
  try {
    const res = await fetch('/api/shutdown', { method: 'POST', headers: { 'X-THQ': '1' } });
    if (!res.ok) throw new Error('odmowa');
  } catch {
    toast(t('Nie udało się zatrzymać serwera. Zamknij okno Dashboard.cmd / terminala albo proces node.'), { error: true });
    return;
  }
  timers.forEach(clearInterval);
  const d = document.createElement('div');
  d.className = 'stopped';
  d.setAttribute('role', 'alertdialog');
  d.setAttribute('aria-label', t('Dashboard zatrzymany'));
  d.innerHTML = `<div class="card empty"><span class="ico-box">${ICON.close(20)}</span><h3>${L('Dashboard zatrzymany')}</h3><p>${L('Możesz zamknąć tę kartę. Aby uruchomić go ponownie, użyj Dashboard.vbs (Windows) albo start.sh (macOS, Linux).')}</p></div>`;
  document.body.appendChild(d);
}

// ---------- zdarzenia ----------
function refilter() { save(); resetMonth(); renderDesk(); renderTabs(); renderMain(); }

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-act]');
  if (!t) return;
  const a = t.dataset.act, v = t.dataset.v;
  const refocus = (sel) => { const e = document.querySelector(sel); if (e) e.focus(); };
  switch (a) {
    case 'typ': state.typ = v; state.ui.dd = null; refilter(); refocus(`[data-act="typ"][data-v="${v}"]`); break;
    case 'preset': state.preset = v; state.from = ''; state.to = ''; state.ui.dd = null; refilter(); refocus(`[data-act="preset"][data-v="${v}"]`); break;
    case 'dd': state.ui.dd = state.ui.dd === v ? null : v; renderDesk(); refocus(`[data-act="dd"][data-v="${v}"]`); break;
    case 'dd-all': state[v] = null; state.ui.dd = v; refilter(); refocus(`[data-act="dd-all"][data-v="${v}"]`); break;
    case 'unit': state.unit = v; save(); renderDesk(); renderMain(); refocus(`[data-act="unit"][data-v="${v}"]`); break;
    case 'view': state.view = v; state.ui.sheet = ''; save(); renderTabs(); applySheetAttr(); renderMain(); $('#main').scrollTo({ top: 0 }); refocus(`[data-act="view"][data-v="${v}"]`); break;
    case 'sheet': {
      state.ui.sheet = state.ui.sheet === v ? '' : v;
      applySheetAttr(); renderTabs();
      if (state.ui.sheet) { const f = $(state.ui.sheet === 'desk' ? '#desk .icon-btn' : '#side .icon-btn'); if (f) f.focus(); } else refocus(`.tb-item[data-act="sheet"][data-v="${v || 'desk'}"]`);
      break;
    }
    case 'sec': state.ui.closed[v] = !isClosed(v); saveUi(); renderSide(); refocus(`[data-act="sec"][data-v="${v}"]`); break;
    case 'theme': setTheme(v, t); break;
    case 'res': state.res = v; save(); renderMain(); refocus(`[data-act="res"][data-v="${v}"]`); break;
    case 'lb-open': openLightbox(galleryItems, Number(t.dataset.i), t); break;
    case 'lb-close': closeLightbox(); break;
    case 'lb-prev': stepLightbox(-1); break;
    case 'lb-next': stepLightbox(1); break;
    case 'trade-open': {
      const src = t.dataset.src === 'recent' ? ctx?.recent : ctx?.rows;
      if (src) openDetail(src, t.dataset.id, t.closest('.trow')?.querySelector('.row-btn') || t);
      break;
    }
    case 'trade-edit': {
      const tr = model?.trades.find((x) => x.id === t.dataset.id);
      const from = lb.opener;
      closeLightbox({ restore: false });
      if (tr) form.open(tr, from && document.contains(from) ? from : null);
      break;
    }
    case 'add-trade': form.open(null, t); break;
    case 'sort': {
      if (state.sortK === v) state.sortD = state.sortD === 'asc' ? 'desc' : 'asc';
      else { state.sortK = v; state.sortD = ['name', 'instrument', 'dir', 'setup'].includes(v) ? 'asc' : 'desc'; }
      save(); renderMain(); refocus(`[data-act="sort"][data-v="${v}"]`);
      break;
    }
    case 'rstep': {
      state.rStep = v; save();
      const card = $('#rdist-card');
      if (card && ctx) { card.outerHTML = rDistCard(ctx.ext); drawRdist(); refocus(`[data-act="rstep"][data-v="${v}"]`); }
      break;
    }
    case 'rf-clear': rFilter = null; renderTabs(); renderMain(); break;
    case 'eqpaper': state.eqPaper = v === '1'; save(); renderMain(); refocus(`[data-act="eqpaper"][data-v="${v}"]`); break;
    case 'q-clear': state.q = ''; resetMonth(); renderDesk(); renderTabs(); renderMain(); refocus('#q'); break;
    case 'stop': stopServer(t); break;
    case 'msession': {
      minSession = v;
      const card = $('#minute-card');
      if (card && ctx) { card.outerHTML = minuteCardHtml(ctx.ext); drawMinute(); refocus(`[data-act="msession"][data-v="${v}"]`); }
      break;
    }
    case 'heat-prev': case 'heat-next': {
      const L = ['', ...heatYears()];
      const i = L.indexOf(state.heatYear);
      const n = L[i + (a === 'heat-prev' ? 1 : -1)];
      if (n === undefined) break;
      state.heatYear = n; save();
      $('#heat-sec').innerHTML = renderHeatmap();
      scrollHeat();
      refocus(`[data-act="${a}"]:not([disabled])`);
      break;
    }
    case 'skipped': state.skipped = v === '1'; save(); renderMain(); refocus(`[data-act="skipped"][data-v="${v}"]`); break;
    case 'metric': state.metric = v; save(); renderMain(); refocus(`[data-act="metric"][data-v="${v}"]`); break;
    case 'month-prev': case 'month-next': {
      const [y, m] = state.month.split('-').map(Number);
      const n = y * 12 + (m - 1) + (a === 'month-next' ? 1 : -1);
      state.month = `${Math.floor(n / 12)}-${F.pad((n % 12) + 1)}`;
      $('#cal').innerHTML = renderCalendar();
      refocus(`[data-act="${a}"]`);
      break;
    }
    case 'show-all': state.preset = 'all'; refilter(); break;
    case 'reset-filters': state.konta = null; state.setups = null; refilter(); break;
    case 'refresh': load(true); break;
    case 'upd-open': if (ust.isOpen()) ust.toggle(); upd.handle(a, $('#upd') && !$('#upd').hidden ? $('#upd') : $('#gear')); break;
    case 'upd-check-now': upd.handle(a, t); break;
    case 'ob-open': if (ust.isOpen()) ust.toggle(); if (tour.active) break; ob.show({ at: 0, from: t }); break;
    case 'dv-add': case 'dv-rename': case 'dv-cancel': case 'dv-save': case 'dv-remove-toggle': devices.handle(a, v, t, $('.sp')); break;
    case 'ob-attn': if (tour.active) break; ob.show({ at: 'gotowosc', from: t }); break;
    case 'ob-token': {
      if (ust.isOpen()) ust.toggle();
      confirmDialog({ title: tx('Zmienić token Notion?'), text: tx('Wkleisz nowy token integracji. Stary zostanie zastąpiony dopiero wtedy, gdy nowy zadziała. Dane w Notion zostają bez zmian.'), ok: tx('Zmień token') })
        .then((ok) => { if (ok) ob.show({ mode: 'token-replace', from: $('#gear') }); });
      break;
    }
    default: if (!ust.handle(a, v, t) && !period.handle(a, v)) prop_.handle(a, v, t); break;
  }
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.matches('[data-dd-item]')) {
    const key = el.dataset.ddItem;
    const boxes = [...document.querySelectorAll(`[data-dd-item="${key}"]`)];
    const sel = boxes.filter((b) => b.checked).map((b) => b.value);
    state[key] = sel.length === 0 || sel.length === boxes.length ? null : sel;
    if (!sel.length) boxes.forEach((b) => { b.checked = true; });
    save(); resetMonth();
    const lbl = document.querySelector(`[data-lbl="${key}"]`);
    if (lbl) lbl.textContent = state[key] ? t('{a} z {b}', { a: state[key].length, b: boxes.length }) : t('wszystkie');
    renderTabs(); renderMain();
  } else if (ust.onChange(ev)) {
    /* ustawienia: sprawdzanie aktualizacji */
  } else if (el.matches('[data-act="all-accounts"]')) {
    state.allAccounts = el.checked; save(); renderMain();
    const e = document.querySelector('[data-act="all-accounts"]'); if (e) e.focus();
  }
});

// wyszukiwarka (dodatek 27): filtruje wszystkie zakładki, bez przerysowania lewego panelu, żeby nie gubić kursora
let qTimer = 0;
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (ust.onInput(ev)) return;
  if (!t.matches('#q')) return;
  clearTimeout(qTimer);
  qTimer = setTimeout(() => {
    state.q = t.value;
    if (!model) return;
    resetMonth(); renderTabs(); renderMain();
    const had = !!$('#desk .clr');
    if (!!state.q !== had) { const pos = t.selectionStart; renderDesk(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); }
  }, 140);
});

document.addEventListener('keydown', (ev) => {
  if (overlay.current) { overlay.current.onKey(ev); return; }
  if (ust.isOpen() && (ev.key === 'Escape' || ev.key === 'Tab') && ust.onKey(ev)) return;
  if (lb.open) { lightboxKey(ev); return; }
  if (ev.key !== 'Escape') return;
  if (state.ui.sheet) {
    const v = state.ui.sheet;
    state.ui.sheet = ''; applySheetAttr(); renderTabs();
    const e = document.querySelector(`.tb-item[data-v="${v}"]`); if (e) e.focus();
  } else if (state.ui.dd) {
    const k = state.ui.dd;
    state.ui.dd = null; renderDesk();
    const e = document.querySelector(`[data-act="dd"][data-v="${k}"]`); if (e) e.focus();
  }
});

$('#refresh').addEventListener('click', () => load(true));
// klik poza popoverem ustawień zamyka go
document.addEventListener('pointerdown', (ev) => { if (!tour.active) ust.onPointerDown(ev); });

// automatyczne odświeżanie (dodatek 4): powrót do karty i co 5 minut, po cichu
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && lastCheck && Date.now() - lastCheck.getTime() > 20_000) { load(false, { silent: true }); sync.pull(); }
});
timers.push(setInterval(() => { if (!document.hidden) { load(false, { silent: true }); sync.pull(); } }, REFRESH_MS));

let lastW = 0;
new ResizeObserver((entries) => {
  const w = Math.round(entries[0].contentRect.width);
  if (w !== lastW) { lastW = w; requestAnimationFrame(drawCharts); }
}).observe($('#view'));

// ikony w przyciskach górnego paska
$('.refresh-ico').innerHTML = ICON.refresh(14);
$('.add-ico').innerHTML = ICON.plus(14);
$('#gear').innerHTML = ICON.gear(16);

// ---------- kilka urządzeń: synchronizacja ustawień przez Notion i dodawanie urządzeń (urzadzenia.js) ----------
// Zdalne ustawienia: paleta i marginesy BE, motyw, sprawdzanie aktualizacji; inny język zapisuje się w konfiguracji i przeładowuje stronę.
async function applyRemoteSettings(r = {}) {
  if (PALETTE_IDS.includes(r.palette)) settings.palette = r.palette;
  if (r.custom) settings.custom = sanitizeCustom(r.custom);
  if (typeof r.customSeeded === 'boolean') settings.customSeeded = r.customSeeded;
  if (typeof r.beR === 'number') settings.beR = Math.min(0.5, Math.max(0, r.beR));
  if (typeof r.beUsd === 'number') settings.beUsd = Math.max(0, r.beUsd);
  S.setBeMargins(settings.beR, settings.beUsd);
  saveSettings(); // sync.applying blokuje zapis zwrotny
  if ((r.theme === 'onyx' || r.theme === 'platinum') && r.theme !== getTheme()) { try { localStorage.setItem(THEME_KEY, r.theme); } catch { /* brak */ } paintTheme(r.theme); }
  applyPalette(settings, getTheme());
  if (typeof r.updateCheck === 'boolean' && r.updateCheck !== (meta.updateCheck !== false)) {
    try { await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-THQ': '1' }, body: JSON.stringify({ updateCheck: r.updateCheck }) }); meta.updateCheck = r.updateCheck; upd.check(); } catch { /* następnym razem */ }
  }
  if ((r.lang === 'pl' || r.lang === 'en') && r.lang !== getLang()) {
    try { await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-THQ': '1' }, body: JSON.stringify({ lang: r.lang }) }); } catch { /* brak */ }
    rememberLang(r.lang); location.reload(); return;
  }
  if (ust.isOpen()) ust.rerender();
  if (model) renderMain();
}
sync = createSync({
  getMeta: () => meta,
  collect: () => ({ palette: settings.palette, custom: settings.custom, customSeeded: settings.customSeeded, beR: settings.beR, beUsd: settings.beUsd, theme: getTheme(), lang: langOverride || getLang(), updateCheck: meta.updateCheck !== false }),
  apply: (r) => applyRemoteSettings(r),
});
const devices = createDevices({ getMeta: () => meta, onConfig: (p) => saveConfig(p), onChange: () => { if (ust.isOpen()) ust.rerender(); } });

// ---------- pierwsze kroki (pierwsze-kroki.js) i przewodnik na danych przykładowych (przewodnik.js) ----------
const tour = createGuide({
  lang: () => getLang(),
  getModel: () => model,
  load: (f) => load(f),
  setView: (v) => { state.view = v; state.ui.sheet = ''; save(); renderTabs(); applySheetAttr(); renderMain(); $('#main').scrollTo({ top: 0 }); },
  openSettings: () => { if (!ust.isOpen()) ust.toggle(); },
  closeSettings: () => { if (ust.isOpen()) ust.toggle(); },
  openForm: (tr) => form.open(tr, null),
  closeOverlays: () => { if (ust.isOpen()) ust.toggle(); if (lb.open) closeLightbox({ restore: false }); ob.close(); },
  // przewodnik zaczyna od czytelnego widoku: Live, 90 dni, bez filtrów (zapis do localStorage jest w tym trybie zablokowany)
  resetForTour: () => {
    Object.assign(state, { typ: 'Live', preset: '90d', from: '', to: '', konta: null, setups: null, q: '', unit: 'R', metric: 'sum', skipped: false, eqPaper: true, res: 'all', heatYear: '', rStep: 'auto', view: 'stats' });
    state.ui.sheet = ''; state.ui.dd = null; rFilter = null; minSession = '';
  },
});
const ob = createOnboarding({
  getMeta: () => meta,
  onGuide: () => tour.start(),
  onUpdate: () => upd.handle('upd-open', $('#gear')),
  // po zapisaniu tokenu, utworzeniu lub połączeniu dziennika i naprawach: świeża konfiguracja i dane z serwera
  onConfigured: async (what = {}) => {
    try { const r = await fetch('/api/meta', { cache: 'no-store' }); if (r.ok) meta = { ...meta, ...(await r.json()) }; } catch { /* zostaje poprzednia */ }
    if (what.token) return; // sam token: baz jeszcze nie ma, dane wczytamy po utworzeniu dziennika
    if (what.sync) await sync.pull(); // przeniesienie z innego urządzenia albo połączenie: ustawienia z Notion
    await load(true);
  },
  // szybkie sprawdzenie w tle: przy błędzie pigułka „Wymaga uwagi” w pasku statusu i kropka przy kole zębatym
  onAttention: (bad) => {
    const b = $('#attn');
    if (b) b.hidden = !bad;
    $('#gear')?.classList.toggle('has-attn', bad);
  },
});
window.__thq = {
  gallerySet, state, get model() { return model; }, calc: S.calc, baseTrades, resolveRange, load, form,
  get lastCheck() { return lastCheck; }, openDetail, get ctx() { return ctx; }, S, renderAll, period, pickRBin, prop: prop_, settings, ust, tour, ob,
};

translateStatic();
paintTheme(getTheme());
applyPalette(settings, getTheme());
renderDesk();
renderTabs();
renderSide();
// Świeża instalacja (przed kreatorem): bez zapytania o dane, którego serwer i tak nie obsłuży; pod kreatorem pusty stan dashboardu.
async function start() {
  if (meta.onboarded === false) {
    let st = null;
    try { st = await (await fetch('/api/setup/state', { cache: 'no-store' })).json(); } catch { /* serwer odpowie przy load */ }
    if (st && !st.configured) {
      loading = false;
      loadError = t('Dashboard nie jest jeszcze połączony z Notion.');
      renderAll();
      return ob.auto({ loadFailed: true });
    }
  }
  await load(false);
  sync.pull();
  return ob.auto({ loadFailed: !model });
}
start();
upd.afterReload();
upd.check();
