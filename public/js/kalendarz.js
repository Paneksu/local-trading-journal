// Kalendarz newsów i earningów (zakładka „Kalendarz”, 1.4.0): dzień, tydzień, miesiąc, filtry wag, rodzajów i klas, wyszukiwanie w całej historii od 2010.
// Funkcje czyste (zakres, grupowanie, filtry, wiersze) są testowane w Node; kontroler (createCalendar) pobiera dane z lokalnego serwera
// (GET /api/news, /api/earnings oraz /api/news/search, /api/earnings/search) i rysuje widok w designie reszty strony (karty, tabela jak „Trade'y”, tokeny motywu).
// Godziny w strefie z Ustawień. Stan widoku (tryb i filtry) w localStorage; wybrany dzień tylko do końca sesji karty przeglądarki.
// English: news and earnings calendar view: day/week/month, filters, whole-history search; pure helpers plus a small controller.
import * as F from './format.js';
import { t, locale } from './i18n.js';
import { eventName, impWord, sessionText, NEWS_IMPS, EARN_CLASSES, NEWS_TOKENS, EARN_TOKENS } from './newsy.js';

const { esc } = F;
const L = (s) => esc(t(s));
export const CAL_KEY = 'thq.calendar.v1';
export const MIN_DAY = '2010-01-01';
export const MODES = ['day', 'week', 'month'];
export const KINDS = ['data', 'fomc', 'speech', 'holiday', 'opex'];
const KIND_LABEL = { data: 'Dane', fomc: 'FOMC', speech: 'Przemówienie', holiday: 'Święto', opex: 'OPEX', earn: 'Wyniki' };
const IMP_LABEL = { high: 'Czerwone', medium: 'Pomarańczowe', low: 'Żółte', holiday: 'Szare', opex: 'OPEX' };
const IMP_RANK = { high: 0, opex: 1, medium: 2, low: 3, holiday: 4 };
const SESSION_SHORT = { bmo: 'przed otw.', amc: 'po zamk.', dmh: 'w sesji', weekend: 'weekend', unknown: 'bez pory' };

// ---- stan i filtry ----
// Decyzja gustu (29.10.2026): kalendarz domyślnie pokazuje wszystkie wagi (przeglądanie), a earningsy klas 1-2; widok tygodnia.
export function calDefaults() {
  return { mode: 'week', imp: { high: true, medium: true, low: true, holiday: true, opex: true }, kind: { data: true, fomc: true, speech: true, holiday: true, opex: true }, earn: { on: true, cls: { 1: true, 2: true, 3: false, 4: false } } };
}
const bools = (src, keys, def) => Object.fromEntries(keys.map((k) => [k, typeof src?.[k] === 'boolean' ? src[k] : def[k]]));
export function normCal(x) {
  const d = calDefaults(), o = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  return { mode: MODES.includes(o.mode) ? o.mode : d.mode, imp: bools(o.imp, NEWS_IMPS, d.imp), kind: bools(o.kind, KINDS, d.kind), earn: { on: typeof o.earn?.on === 'boolean' ? o.earn.on : d.earn.on, cls: bools(o.earn?.cls, EARN_CLASSES, d.earn.cls) } };
}
export const filterCal = (news, earn, st) => ({
  news: (news || []).filter((e) => st.imp[e.imp] && st.kind[e.kind]),
  earn: st.earn.on ? (earn || []).filter((e) => st.earn.cls[e.cls]) : [],
});

// ---- dni i strefy ----
const dtf = new Map();
function fmtKey(tz) { const k = tz || ''; if (!dtf.has(k)) dtf.set(k, new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' })); return dtf.get(k); }
export const dayKeyOf = (sec, tz) => fmtKey(tz).format(new Date(sec * 1000));
function tzOffsetSec(u, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz || undefined, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(u * 1000)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000 - u;
}
// Początek doby lokalnej (północ w strefie tz) dla daty RRRR-MM-DD, jako sekundy UTC.
export function dayStart(key, tz) {
  const { y, m, d } = F.parseKey(key), day = Date.UTC(y, m - 1, d) / 1000;
  let u = day;
  for (let i = 0; i < 3; i++) u = day - tzOffsetSec(u, tz);
  return u;
}
export const clampDay = (key, today) => { const max = F.addDays(today, 400); return key < MIN_DAY ? MIN_DAY : key > max ? max : key; };
// Zakres widoku dla dnia-kotwicy: { from, to (daty włącznie), keys (wszystkie dni) }. Tydzień od poniedziałku, miesiąc kalendarzowy.
export function calRange(mode, anchor) {
  let from = anchor, to = anchor;
  if (mode === 'week') { from = F.addDays(anchor, -F.weekdayIdx(anchor)); to = F.addDays(from, 6); }
  else if (mode === 'month') { const { y, m } = F.parseKey(anchor); from = `${y}-${F.pad(m)}-01`; to = `${y}-${F.pad(m)}-${F.pad(F.daysInMonth(y, m))}`; }
  const keys = []; for (let k = from; k <= to; k = F.addDays(k, 1)) keys.push(k);
  return { from, to, keys };
}
export function shiftAnchor(mode, anchor, dir) {
  if (mode === 'day') return F.addDays(anchor, dir);
  if (mode === 'week') return F.addDays(anchor, 7 * dir);
  const { y, m } = F.parseKey(anchor), n = y * 12 + (m - 1) + dir, ny = Math.floor(n / 12), nm = (n % 12) + 1;
  return `${ny}-${F.pad(nm)}-${F.pad(Math.min(F.parseKey(anchor).d, F.daysInMonth(ny, nm)))}`;
}

// ---- wiersze ----
// Zdarzenie całodzienne należy do dnia ET (e.day); godzinowe do doby lokalnej w strefie tz.
export const dayOfEvent = (e, tz) => (e.allDay ? e.day : dayKeyOf(e.t, tz));
export function newsRow(e, tz, nowSec) {
  const tags = [];
  if (e.tentative) tags.push(t('godzina niepewna'));
  if (e.approx) tags.push(t('termin przybliżony'));
  return { type: 'news', t: e.t, day: dayOfEvent(e, tz), allDay: !!e.allDay, imp: e.imp, kind: e.kind, name: eventName(e), tags, note: e.note || '', past: e.allDay ? e.day < dayKeyOf(nowSec, tz) : e.t < nowSec, rank: IMP_RANK[e.imp] ?? 9 };
}
export function earnRow(e, tz, nowSec) {
  const tags = [e.name && e.name !== e.symbol ? e.name : '', `${t('klasa {n}', { n: e.cls })}`, sessionText(e.session)];
  if (Number.isInteger(e.quarter) && Number.isInteger(e.year)) tags.push(`Q${e.quarter} ${e.year}`);
  if (Number.isFinite(e.epsEst)) tags.push(`${t('szac. EPS')} ${F.num(e.epsEst, 2)}`);
  if (e.src === 'finnhub') tags.push(t('termin przybliżony'));
  return { type: 'earn', t: e.t, day: dayOfEvent(e, tz), allDay: !!e.allDay, cls: e.cls, kind: 'earn', name: e.symbol, tags: tags.filter(Boolean), session: e.session, exact: e.src === 'edgar', past: e.allDay ? e.day < dayKeyOf(nowSec, tz) : e.t < nowSec, rank: 5 + e.cls / 10 };
}
// Dni z wierszami, w kolejności dat. Dzień całodzienny najpierw, potem godziny; w obrębie godziny waga. range (keys) odcina zdarzenia spoza widoku (nakładanie dób ET i lokalnych).
export function buildDays({ news = [], earn = [], tz, nowSec, keys, alwaysShow = [] }) {
  const set = new Set(keys), by = new Map();
  const put = (r) => { if (!set.has(r.day)) return; if (!by.has(r.day)) by.set(r.day, []); by.get(r.day).push(r); };
  for (const e of news) put(newsRow(e, tz, nowSec));
  for (const e of earn) put(earnRow(e, tz, nowSec));
  for (const k of alwaysShow) if (set.has(k) && !by.has(k)) by.set(k, []);
  const today = dayKeyOf(nowSec, tz);
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, rows]) => {
    rows.sort((a, b) => (b.allDay - a.allDay) || a.t - b.t || a.rank - b.rank || (a.name < b.name ? -1 : 1));
    // linia „teraz” w dzisiejszym dniu: przed pierwszym nieminionym wierszem godzinowym (albo na końcu, gdy wszystkie minęły)
    let nowAt = -1;
    if (day === today) { const i = rows.findIndex((r) => !r.allDay && !r.past); nowAt = i < 0 ? rows.length : i; }
    return { day, today: day === today, rows, nowAt };
  });
}

// ---- HTML (czysty) ----
const dayHead = (key) => { const { y } = F.parseKey(key); return `${F.WEEKDAYS[F.weekdayIdx(key)]} ${F.shortDate(key)} ${y}`; };
const dot = (token) => `<i class="nws-dot" style="background:var(${token})" aria-hidden="true"></i>`;
export function rowHtml(r, tz) {
  const tf = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', timeZone: tz || undefined });
  let time, imp, name;
  if (r.type === 'earn') {
    time = r.exact && !r.allDay ? tf.format(new Date(r.t * 1000)) : t(SESSION_SHORT[r.session] || SESSION_SHORT.unknown);
    imp = `${dot(EARN_TOKENS[r.cls])}<span class="sr">${esc(t('klasa {n}', { n: r.cls }))}</span>`;
    name = `<b>${esc(r.name)}</b>`;
  } else {
    time = r.allDay ? t('cały dzień') : tf.format(new Date(r.t * 1000));
    imp = `${dot(NEWS_TOKENS[r.imp])}<span class="sr">${esc(impWord(r.imp))}</span>`;
    name = `<span class="cal-nm">${esc(r.name)}</span>`;
  }
  const tags = (r.tags.length ? ` <small class="cal-tags">${esc(r.tags.join(' · '))}</small>` : '') + (r.note ? `<small class="cal-tags cal-note">${esc(r.note)}</small>` : '');
  return `<tr class="cal-r${r.past ? ' past' : ''}"><td class="cal-t">${esc(time)}</td><td class="cal-i">${imp}</td><td class="cal-n">${name}${tags}</td><td class="cal-k">${esc(t(KIND_LABEL[r.kind] || r.kind))}</td></tr>`;
}
export function dayHtml(d, { tz, nowSec, trades = 0 }) {
  const nowRow = (nowTxt) => `<tr class="cal-now" aria-hidden="true"><td colspan="4"><span>${esc(nowTxt)}</span></td></tr>`;
  const nowTxt = `${t('Teraz')} ${new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', timeZone: tz || undefined }).format(new Date(nowSec * 1000))}`;
  const rows = d.rows.map((r, i) => (i === d.nowAt ? nowRow(nowTxt) : '') + rowHtml(r, tz)).join('') + (d.nowAt === d.rows.length && d.today ? nowRow(nowTxt) : '');
  const tr = trades ? `<button type="button" class="cal-tr" data-cal-trades="${d.day}" aria-label="${esc(t("Pokaż trade'y z dnia {d}", { d: dayHead(d.day) }))}">${esc(t.p("{n} trade'ów", trades))}</button>` : '';
  return `<section class="cal-day${d.today ? ' today' : ''}" aria-label="${esc(dayHead(d.day))}"><h3 class="cal-dh"><span>${esc(dayHead(d.day))}</span>${d.today ? `<em>${L('dziś')}</em>` : ''}${tr}</h3>
    ${d.rows.length ? `<table class="cal-tab"><caption class="sr">${esc(dayHead(d.day))}</caption><thead class="sr"><tr><th>${L('Godzina')}</th><th>${L('Waga')}</th><th>${L('Wydarzenie')}</th><th>${L('Rodzaj')}</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="note cal-empty">${L('Brak wydarzeń w tym dniu przy wybranych filtrach.')}</p>`}</section>`;
}
// Wyniki wyszukiwania: dwie sekcje. „Nadchodzące” (od dziś, rosnąco) i „Wcześniejsze” (od dziś wstecz, najnowsze pierwsze, stronicowane przyciskiem „Pokaż wcześniejsze”).
// Wiersz to przycisk przenoszący do dnia. res: { up: { rows, total }, past: { rows, total, more }, loadingMore }.
function resRow(r, tz) {
  const tf = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', timeZone: tz || undefined });
  const time = r.type === 'earn' ? (r.exact && !r.allDay ? tf.format(new Date(r.t * 1000)) : t(SESSION_SHORT[r.session] || SESSION_SHORT.unknown)) : r.allDay ? t('cały dzień') : tf.format(new Date(r.t * 1000));
  const imp = r.type === 'earn' ? `${dot(EARN_TOKENS[r.cls])}<span class="sr">${esc(t('klasa {n}', { n: r.cls }))}</span>` : `${dot(NEWS_TOKENS[r.imp])}<span class="sr">${esc(impWord(r.imp))}</span>`;
  const tags = (r.tags.length ? ` <small class="cal-tags">${esc(r.tags.join(' · '))}</small>` : '') + (r.note ? `<small class="cal-tags cal-note">${esc(r.note)}</small>` : '');
  return `<tr class="cal-r cal-go${r.past ? ' past' : ''}"><td class="cal-d"><button type="button" class="row-btn" data-cal-go="${r.day}" aria-label="${esc(t('Pokaż dzień {d}', { d: dayHead(r.day) }))}">${esc(dayHead(r.day))}</button></td><td class="cal-t">${esc(time)}</td><td class="cal-i">${imp}</td><td class="cal-n">${r.type === 'earn' ? `<b>${esc(r.name)}</b>` : `<span class="cal-nm">${esc(r.name)}</span>`}${tags}</td><td class="cal-k">${esc(t(KIND_LABEL[r.kind] || r.kind))}</td></tr>`;
}
const resTable = (rows, tz) => `<table class="cal-tab cal-res"><thead class="sr"><tr><th>${L('Data')}</th><th>${L('Godzina')}</th><th>${L('Waga')}</th><th>${L('Wydarzenie')}</th><th>${L('Rodzaj')}</th></tr></thead><tbody>${rows.map((r) => resRow(r, tz)).join('')}</tbody></table>`;
export function searchHtml(res, { tz }) {
  const total = (res.up?.total || 0) + (res.past?.total || 0), shown = (res.up?.rows.length || 0) + (res.past?.rows.length || 0);
  const sum = `<div class="ncal-sum" role="status">${esc(t.p('Znaleziono {n} wyników', total))}${shown < total ? ` · ${esc(t('pokazuję {n}', { n: shown }))}` : ''}</div>`;
  if (!shown) return `${sum}<p class="note cal-empty">${L('Nic nie znaleziono. Spróbuj krótszej frazy, np. CPI, NFP albo NVDA.')}</p>`;
  const up = res.up?.rows.length ? `<h3 class="cal-sh">${L('Nadchodzące')}</h3>${resTable(res.up.rows, tz)}` : '';
  const past = res.past?.rows.length ? `<h3 class="cal-sh">${L('Wcześniejsze')}</h3>${resTable(res.past.rows, tz)}` : '';
  const more = res.past?.more ? `<button type="button" class="btn sm cal-more" data-cal-more="1"${res.loadingMore ? ' disabled' : ''}>${L(res.loadingMore ? 'Szukam…' : 'Pokaż wcześniejsze')}</button>` : '';
  return `${sum}${up}${past}${more}`;
}
export function rangeLabel(mode, range) {
  if (mode === 'day') return `${F.DAYS_TITLE[F.weekdayIdx(range.from)]} ${F.longDate(range.from)}`;
  if (mode === 'week') return `${F.shortDate(range.from)} – ${F.shortDate(range.to)} ${F.parseKey(range.to).y}`;
  const { y, m } = F.parseKey(range.from);
  return F.monthTitle(y, m);
}

// ---- kontroler ----
const NO_STORE = { cache: 'no-store' };
const PAGE = 100, UP = 50;
export function createCalendar({ getTz = () => '', getTradeCount = () => 0, onTrades = () => {}, fetchImpl = (...a) => globalThis.fetch(...a), now = () => Date.now(), storage = globalThis.localStorage } = {}) {
  let st = (() => { try { return normCal(JSON.parse(storage?.getItem(CAL_KEY) || 'null')); } catch { return calDefaults(); } })();
  const sec = () => Math.floor(now() / 1000);
  const tz = () => getTz() || '';
  const todayKey = () => dayKeyOf(sec(), tz());
  let anchor = todayKey(), root = null, ac = null, pending = Promise.resolve();
  const data = { key: '', news: [], earn: [], loading: false, error: false };
  const cache = new Map();
  const S = { q: '', year: '', res: null, loading: false, error: null, seq: 0, timer: 0, cur: { n: null, e: null }, moreFlags: { n: false, e: false } };
  const save = () => { try { storage?.setItem(CAL_KEY, JSON.stringify(st)); } catch { /* localStorage niedostępny */ } };
  // Błąd 400 z serwera (np. zła fraza) niesie komunikat po polsku: pokazujemy go jako walidację, a nie „sprawdź, czy dashboard działa”.
  const get = async (url) => {
    const r = await fetchImpl(url, NO_STORE);
    if (!r.ok) { const e = new Error(String(r.status)); e.status = r.status; if (r.status === 400) { try { e.validation = (await r.json()).error; } catch { /* bez treści */ } } throw e; }
    return r.json();
  };
  const curKey = () => { const r = calRange(st.mode, anchor); return `${r.from}|${r.to}|${tz()}|${st.earn.on ? 1 : 0}`; };

  async function load() {
    const r = calRange(st.mode, anchor), z = tz(), key = curKey();
    const hit = cache.get(key);
    if (hit && now() - hit.at < 10 * 60_000) { Object.assign(data, { key, news: hit.news, earn: hit.earn, loading: false, error: false }); paintOut(); return; }
    // zmiana zakresu: dane poprzedniego zakresu znikają od razu (inaczej na chwilę widać pusty tydzień zamiast „Wczytuję”)
    Object.assign(data, { key, news: [], earn: [], loading: true, error: false }); paintOut();
    const from = dayStart(r.from, z) - 3600, to = dayStart(F.addDays(r.to, 1), z) + 3600;
    try {
      const [n, e] = await Promise.all([get(`/api/news?from=${from}&to=${to}`), st.earn.on ? get(`/api/earnings?from=${from}&to=${to}`) : Promise.resolve({ events: [] })]);
      if (data.key !== key) return;
      cache.set(key, { news: n.events || [], earn: e.events || [], at: now() });
      if (cache.size > 8) cache.delete(cache.keys().next().value);
      Object.assign(data, cache.get(key), { loading: false, error: false });
    } catch { if (data.key === key) Object.assign(data, { news: [], earn: [], loading: false, error: true }); }
    if (data.key === key) paintOut();
  }

  // ---- wyszukiwanie w całej historii: nadchodzące osobno, przeszłość od dziś wstecz stronami ----
  const filters = () => ({
    kinds: KINDS.filter((k) => st.kind[k]).join(','), imps: NEWS_IMPS.filter((k) => st.imp[k]).join(','), cls: EARN_CLASSES.filter((k) => st.earn.cls[k]).join(','),
  });
  const qs = (extra) => Object.entries({ q: S.q.trim(), ...(S.year ? { year: S.year } : {}), ...extra }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  function fetchSearch({ dir, curN = null, curE = null }) {
    const f = filters(), base = dir === 'up' ? { from: sec(), limit: UP } : { limit: PAGE };
    const nQ = { ...base, ...(dir === 'past' ? { before: curN ?? sec() } : {}), kinds: f.kinds, imps: f.imps }, eQ = { ...base, ...(dir === 'past' ? { before: curE ?? sec() } : {}), classes: f.cls };
    return Promise.all([
      f.kinds && f.imps ? get(`/api/news/search?${qs(nQ)}`) : Promise.resolve({ events: [], total: 0, truncated: false }),
      st.earn.on && f.cls ? get(`/api/earnings/search?${qs(eQ)}`) : Promise.resolve({ events: [], total: 0, truncated: false }),
    ]);
  }
  const rowsOf = (n, e) => { const z = tz(), ns = sec(); return [...n.events.map((x) => newsRow(x, z, ns)), ...e.events.map((x) => earnRow(x, z, ns))]; };
  async function runSearch() {
    const q = S.q.trim(), my = ++S.seq;
    if (q.length < 2) { S.res = null; S.loading = false; S.error = null; paintOut(); return; }
    S.loading = true; S.error = null; paintOut();
    try {
      const [[un, ue], [pn, pe]] = await Promise.all([fetchSearch({ dir: 'up' }), fetchSearch({ dir: 'past' })]);
      if (my !== S.seq) return;
      const up = rowsOf(un, ue).sort((a, b) => a.t - b.t || a.rank - b.rank);
      const past = rowsOf(pn, pe).sort((a, b) => b.t - a.t || a.rank - b.rank);
      S.cur = { n: pn.events.length ? pn.events[pn.events.length - 1].t : null, e: pe.events.length ? pe.events[pe.events.length - 1].t : null };
      S.moreFlags = { n: !!pn.truncated, e: !!pe.truncated };
      S.res = { up: { rows: up, total: (un.total || 0) + (ue.total || 0) }, past: { rows: past, total: (pn.total || 0) + (pe.total || 0), more: S.moreFlags.n || S.moreFlags.e }, loadingMore: false };
    } catch (e) { if (my === S.seq) { S.res = null; S.error = e.validation ? { text: e.validation, validation: true } : { text: '', validation: false }; } }
    if (my === S.seq) { S.loading = false; paintOut(); }
  }
  async function more() {
    const res = S.res, my = S.seq;
    if (!res || res.loadingMore || !res.past.more) return;
    res.loadingMore = true; paintOut();
    try {
      const f = filters();
      const [n, e] = await Promise.all([
        S.moreFlags.n && f.kinds && f.imps ? get(`/api/news/search?${qs({ limit: PAGE, before: S.cur.n, kinds: f.kinds, imps: f.imps })}`) : Promise.resolve({ events: [], truncated: false }),
        S.moreFlags.e && st.earn.on && f.cls ? get(`/api/earnings/search?${qs({ limit: PAGE, before: S.cur.e, classes: f.cls })}`) : Promise.resolve({ events: [], truncated: false }),
      ]);
      if (my !== S.seq) return;
      if (n.events.length) S.cur.n = n.events[n.events.length - 1].t;
      if (e.events.length) S.cur.e = e.events[e.events.length - 1].t;
      S.moreFlags = { n: !!n.truncated, e: !!e.truncated };
      res.past.rows = [...res.past.rows, ...rowsOf(n, e)].sort((a, b) => b.t - a.t || a.rank - b.rank);
      res.past.more = S.moreFlags.n || S.moreFlags.e;
    } catch { /* zostają wyniki, przycisk można nacisnąć ponownie */ }
    res.loadingMore = false; paintOut();
  }

  // Filtry: na telefonie zwinięte (lista ma być od razu widoczna), na szerokim ekranie rozwinięte; stan otwarcia przeżywa przerysowania
  let filtersOpen = globalThis.matchMedia ? globalThis.matchMedia('(min-width: 641px)').matches : true;
  const activeNote = () => { const off = NEWS_IMPS.filter((k) => !st.imp[k]).length + KINDS.filter((k) => !st.kind[k]).length; return off || !st.earn.on ? ` <small class="muted">${esc(t('zmienione'))}</small>` : ''; };
  const chk = (key, on, label, extra = '') => `<label class="check"><input type="checkbox" data-cal="${key}"${on ? ' checked' : ''}>${extra}<span>${esc(label)}</span></label>`;
  const yearOpts = () => { const y = F.parseKey(todayKey()).y; return `<option value="">${L('Wszystkie lata')}</option>${Array.from({ length: y + 1 - 2009 }, (_, i) => y + 1 - i).map((v) => `<option value="${v}"${String(v) === String(S.year) ? ' selected' : ''}>${v}</option>`).join('')}`; };
  const rangeText = () => rangeLabel(st.mode, calRange(st.mode, anchor));
  function barHtml() {
    const today = todayKey();
    const seg = MODES.map((m) => `<button type="button" data-cal-mode="${m}" aria-pressed="${st.mode === m}">${L({ day: 'Dzień', week: 'Tydzień', month: 'Miesiąc' }[m])}</button>`).join('');
    const imps = NEWS_IMPS.map((k) => chk(`imp.${k}`, st.imp[k], t(IMP_LABEL[k]), dot(NEWS_TOKENS[k]))).join('');
    const kinds = KINDS.map((k) => chk(`kind.${k}`, st.kind[k], t(KIND_LABEL[k]))).join('');
    const cls = EARN_CLASSES.map((k) => chk(`cls.${k}`, st.earn.cls[k], t('Klasa {n}', { n: k }), dot(EARN_TOKENS[k]))).join('');
    return `<div class="ncal-nav"><div class="cal-step" role="group" aria-label="${L('Zakres')}"><button type="button" class="icon-btn" data-cal-step="-1" aria-label="${L('Poprzedni zakres')}">‹</button>
        <button type="button" class="btn sm" data-cal-today="1">${L('Dziś')}</button><button type="button" class="icon-btn" data-cal-step="1" aria-label="${L('Następny zakres')}">›</button></div>
      <h2 class="cal-range" aria-live="polite">${esc(rangeText())}</h2>
      <input type="date" class="sp-in cal-date" data-cal-date="1" value="${anchor}" min="${MIN_DAY}" max="${F.addDays(today, 400)}" aria-label="${L('Wybierz dzień')}">
      <div class="seg" role="group" aria-label="${L('Widok')}">${seg}</div></div>
      <div class="cal-find"><input type="search" class="sp-in cal-q" data-cal-q="1" maxlength="60" value="${esc(S.q)}" placeholder="${L('Szukaj w całej historii: CPI, NFP, NVDA…')}" autocomplete="off" spellcheck="false" aria-label="${L('Szukaj newsów i wyników spółek')}">
        <select class="sp-in sp-sel cal-year" data-cal-year="1" aria-label="${L('Rok wyników wyszukiwania')}">${yearOpts()}</select></div>
      <details class="cal-filters"${filtersOpen ? ' open' : ''}><summary>${L('Filtry')}${activeNote()}</summary>
      <div class="cal-fl"><span class="lbl">${L('Waga')}</span><div class="cal-chk">${imps}</div></div>
      <div class="cal-fl"><span class="lbl">${L('Rodzaj')}</span><div class="cal-chk">${kinds}</div></div>
      <div class="cal-fl"><span class="lbl">${L('Wyniki spółek')}</span><div class="cal-chk">${chk('earn.on', st.earn.on, t('Pokaż'))}${cls}</div></div></details>`;
  }
  function outHtml() {
    const z = tz(), ns = sec();
    if (S.q.trim().length >= 2) {
      if (S.loading && !S.res) return `<p class="note">${L('Szukam…')}</p>`;
      if (S.error) return S.error.validation ? `<p class="note warnb" role="alert">${esc(S.error.text)}</p>` : `<p class="note">${L('Nie udało się wyszukać. Sprawdź, czy dashboard działa, i spróbuj ponownie.')}</p>`;
      return S.res ? searchHtml(S.res, { tz: z }) : '';
    }
    // dane innego zakresu niż wybrany nigdy nie są rysowane (powrót do zakresu z pamięci też przechodzi przez load)
    if (data.key !== curKey() || (data.loading && !data.news.length && !data.earn.length)) return `<p class="note">${L('Wczytuję kalendarz…')}</p>`;
    if (data.error) return `<p class="note">${L('Nie udało się wczytać kalendarza. Sprawdź, czy dashboard działa, i spróbuj ponownie.')}</p>`;
    const r = calRange(st.mode, anchor), f = filterCal(data.news, data.earn, st);
    const days = buildDays({ news: f.news, earn: f.earn, tz: z, nowSec: ns, keys: r.keys, alwaysShow: st.mode === 'day' ? [anchor] : [todayKey()] });
    if (!days.length) return `<p class="note cal-empty">${L('Brak wydarzeń w tym zakresie przy wybranych filtrach.')}</p>`;
    return days.map((d) => dayHtml(d, { tz: z, nowSec: ns, trades: getTradeCount(d.day) })).join('');
  }
  const html = () => `<div class="card cal-card"><div class="cal-bar">${barHtml()}</div></div><div class="card cal-card cal-out" aria-busy="${data.loading || S.loading}">${outHtml()}</div>`;
  function paintOut() { const o = root?.querySelector('.cal-out'); if (o) { o.innerHTML = outHtml(); o.setAttribute('aria-busy', String(data.loading || S.loading)); } }
  function paintAll(focus) { if (!root) return; root.querySelector('.cal-bar').innerHTML = barHtml(); paintOut(); if (focus) root.querySelector(focus)?.focus(); }
  const run = () => { pending = S.q.trim().length >= 2 ? runSearch() : load(); return pending; };
  function setState(fn, focus) { fn(); save(); paintAll(focus); return run(); }

  function mount(el) {
    ac?.abort(); ac = new AbortController(); root = el;
    el.innerHTML = html();
    const sig = { signal: ac.signal };
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if (d.calMode) setState(() => { st.mode = d.calMode; }, `[data-cal-mode="${d.calMode}"]`);
      else if (d.calStep) setState(() => { anchor = clampDay(shiftAnchor(st.mode, anchor, Number(d.calStep)), todayKey()); }, `[data-cal-step="${d.calStep}"]`);
      else if (d.calToday) setState(() => { anchor = todayKey(); S.q = ''; S.res = null; }, '[data-cal-today]');
      else if (d.calGo) { S.q = ''; S.res = null; setState(() => { anchor = d.calGo; st.mode = 'day'; }, '[data-cal-mode="day"]'); }
      else if (d.calMore) more();
      else if (d.calTrades) onTrades(d.calTrades);
    }, sig);
    el.addEventListener('change', (ev) => {
      const i = ev.target;
      if (i.matches('[data-cal-date]')) {
        // pole daty nie jest przerysowywane (wpisywanie roku z klawiatury resetowałoby je): odświeżamy tylko nagłówek zakresu i wyniki
        if (/^\d{4}-\d{2}-\d{2}$/.test(i.value)) { anchor = clampDay(i.value, todayKey()); S.q = ''; S.res = null; const h = root.querySelector('.cal-range'); if (h) h.textContent = rangeText(); const q = root.querySelector('[data-cal-q]'); if (q) q.value = ''; run(); }
        return;
      }
      if (i.matches('[data-cal-year]')) { S.year = i.value; run(); return; }
      const k = i.dataset.cal;
      if (!k) return;
      const [a, b] = k.split('.');
      setState(() => { if (a === 'earn') st.earn.on = i.checked; else if (a === 'cls') st.earn.cls[b] = i.checked; else st[a][b] = i.checked; }, `[data-cal="${k}"]`);
    }, sig);
    el.addEventListener('toggle', (ev) => { if (ev.target.matches?.('.cal-filters')) filtersOpen = ev.target.open; }, { ...sig, capture: true });
    el.addEventListener('input', (ev) => {
      if (!ev.target.matches('[data-cal-q]')) return;
      S.q = ev.target.value;
      clearTimeout(S.timer);
      S.timer = setTimeout(() => { if (S.q.trim().length >= 2) pending = runSearch(); else { S.seq++; S.res = null; S.loading = false; S.error = null; paintOut(); pending = load(); } }, 300);
    }, sig);
    run();
  }
  return {
    mount, html, state: () => st, anchor: () => anchor, search: S, data, idle: () => pending,
    isMounted: (el) => !!el && el === root && el.isConnected !== false,
    // wywoływane po zmianie strefy albo danych: przeładowanie bez zrywania pola szukaj i przewinięcia
    refresh() { cache.clear(); if (root) { paintAll(); run(); } },
    goTo(day, mode = 'day') { anchor = clampDay(day || todayKey(), todayKey()); st.mode = mode; S.q = ''; S.res = null; save(); },
    // klasy earningów z karty „Wyniki spółek”: kalendarz otwiera się z tymi samymi klasami (tydzień z kart)
    applyEarn(cls) { st.earn.on = true; for (const k of EARN_CLASSES) st.earn.cls[k] = !!cls?.[k]; save(); },
    find(q, { year = '' } = {}) { S.q = q; S.year = year; return run(); },
    unmount() { ac?.abort(); root = null; clearTimeout(S.timer); },
  };
}
