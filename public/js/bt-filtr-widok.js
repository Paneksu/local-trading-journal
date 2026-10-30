// Edytor filtra dni w kreatorze sesji backtestu (1.5.0, pakiet F2): sekcja „Filtr dni (zaawansowane)”, domyślnie zwinięta (§12 [U] «te warunki to ma być dodatkowa funkcja,
// nie ma się wyświetlać jako główna»). Drzewo warunków (grupy i / lub / nie, warunki z F1: COND_KINDS), licznik pasujących dni i ich lista na żywo, ręczne wyrzucenie dnia,
// dni bez danych z powodem, szablony filtrów. Wszystko liczone w przeglądarce na indeksie cech dnia pobranym raz (GET /api/backtest/days); zmiana warunku nie pyta serwera.
// Filtr w definicji sesji: null (brak warunków) albo { op, not, items } wprost dla evalFilter z bt-filtr.js. Pusta grupa przepuszcza wszystko, więc edytor oddaje null.
// English: advanced day-filter editor (and / or / not groups, live match counter and day list, manual drop, no-data days with reasons, templates) over the cached feature index.
import { t } from './i18n.js';
import { esc } from './format.js';
import { COND_KINDS, matchDays, dayTags, validateFilter } from './bt-filtr.js';
import { templateEntry, templateFilter, templateOf, templatesSize, TEMPLATES_MAX, TEMPLATES_BUDGET } from './bt-czas.js';

// ---- opis rodzajów warunków ----
const L = {
  wd: () => t('Dzień tygodnia'), dateRange: () => t('Zakres dat'), month: () => t('Miesiąc'), preHoliday: () => t('Dzień przed świętem'), postHoliday: () => t('Dzień po święcie'), rollWeek: () => t('Tydzień rolla kontraktów'),
  event: () => t('Konkretne wydarzenie'), impAtLeast: () => t('Jest wydarzenie o wadze co najmniej'), noImpAtLeast: () => t('Brak wydarzeń o wadze co najmniej'), newsWhen: () => t('Wydarzenie w porze'), fedChair: () => t('Przemawia przewodniczący Fed'),
  opex: () => t('Wygasanie opcji (OPEX)'), opexWeek: () => t('Tydzień wygasania opcji'),
  earnings: () => t('Wyniki spółek'),
  // [U] 30.10.2026 «Gap od ceny startu»: gap od ostatniej ceny przed godziną startu sesji (najpóźniej 9:30), cena „przed” też do startu
  gap: () => t('Gap do startu'), onRange: () => t('Zakres nocy (pkt)'), prevRange: () => t('Zakres poprzedniej sesji (pkt)'), prevDir: () => t('Kierunek poprzedniej sesji'), inside: () => t('Poprzednia sesja wewnątrz (inside day)'),
  preVsPd: () => t('Cena przed startem względem zakresu poprzedniej sesji'), atrRatio: () => t('ATR(14) do średniej z 60 sesji'), // backtest-index.mjs: ATR(14) sesji / średnia ATR(14) z 60 sesji (review G #7)
};
const GROUPS = [
  [() => t('Kalendarz'), ['wd', 'dateRange', 'month', 'preHoliday', 'postHoliday', 'rollWeek']],
  [() => t('Newsy'), ['event', 'impAtLeast', 'noImpAtLeast', 'newsWhen', 'fedChair']],
  [() => t('Wygasanie'), ['opex', 'opexWeek']],
  [() => t('Earningsy'), ['earnings']],
  [() => t('Rynek (liczone z danych przed godziną startu, najpóźniej 9:30)'), ['gap', 'onRange', 'prevRange', 'prevDir', 'inside', 'preVsPd', 'atrRatio']],
];
const IMPS = () => [['high', t('wysoka')], ['medium', t('średnia')], ['low', t('niska')]];
const WHENS = () => [['pre', t('przed 9:30')], ['open', t('9:30–11:00')], ['post', t('po 11:00')]];
const WDS = () => [[1, t('Pn')], [2, t('Wt')], [3, t('Śr')], [4, t('Cz')], [5, t('Pt')]];
const MONTHS = () => [t('sty'), t('lut'), t('mar'), t('kwi'), t('maj'), t('cze'), t('lip'), t('sie'), t('wrz'), t('paź'), t('lis'), t('gru')].map((l, i) => [i + 1, l]);
// Param: { p, type: 'multi'|'text'|'date'|'select'|'num', ... }. Domyślne wartości = to, co warunek dostaje po dodaniu.
const SPEC = {
  wd: { init: () => ({ days: [] }), ui: [{ p: 'days', type: 'multi', opts: WDS }] },
  dateRange: { init: () => ({ from: '', to: '' }), ui: [{ p: 'from', type: 'date', label: () => t('Od') }, { p: 'to', type: 'date', label: () => t('Do') }] },
  month: { init: () => ({ months: [] }), ui: [{ p: 'months', type: 'multi', opts: MONTHS }] },
  preHoliday: { init: () => ({}), ui: [] }, postHoliday: { init: () => ({}), ui: [] }, rollWeek: { init: () => ({}), ui: [] },
  event: { init: () => ({ name: '' }), ui: [{ p: 'name', type: 'text', ph: () => t('np. CPI'), list: true }] },
  impAtLeast: { init: () => ({ imp: 'high' }), ui: [{ p: 'imp', type: 'select', opts: IMPS }] },
  noImpAtLeast: { init: () => ({ imp: 'medium' }), ui: [{ p: 'imp', type: 'select', opts: IMPS }] },
  newsWhen: { init: () => ({ when: 'pre' }), ui: [{ p: 'when', type: 'select', opts: WHENS }, { p: 'imp', type: 'select', opts: IMPS, any: () => t('dowolna waga') }] },
  fedChair: { init: () => ({}), ui: [] },
  opex: { init: () => ({ type: 'monthly' }), ui: [{ p: 'type', type: 'select', opts: () => [['monthly', t('miesięczne')], ['quarterly', t('kwartalne')]] }] },
  opexWeek: { init: () => ({}), ui: [] },
  earnings: { init: () => ({}), ui: [{ p: 'maxCls', type: 'select', num: true, opts: () => [[1, t('klasa 1')], [2, t('klasy 1–2')], [3, t('klasy 1–3')], [4, t('klasy 1–4')]], any: () => t('dowolna klasa') }, { p: 'when', type: 'select', opts: () => [['bmo', t('przed otwarciem')], ['prevAmc', t('po zamknięciu poprzedniego dnia')]], any: () => t('dowolna pora') }] },
  gap: { init: () => ({ unit: 'pct' }), ui: [{ p: 'unit', type: 'select', opts: () => [['pct', '%'], ['pts', t('pkt')]] }, { p: 'min', type: 'num', label: () => t('od') }, { p: 'max', type: 'num', label: () => t('do') }] },
  onRange: { init: () => ({}), ui: [{ p: 'min', type: 'num', label: () => t('od') }, { p: 'max', type: 'num', label: () => t('do') }] },
  prevRange: { init: () => ({}), ui: [{ p: 'min', type: 'num', label: () => t('od') }, { p: 'max', type: 'num', label: () => t('do') }] },
  prevDir: { init: () => ({ dir: 'up' }), ui: [{ p: 'dir', type: 'select', opts: () => [['up', t('wzrostowy')], ['down', t('spadkowy')]] }] },
  inside: { init: () => ({}), ui: [] },
  preVsPd: { init: () => ({ pos: 'above' }), ui: [{ p: 'pos', type: 'select', opts: () => [['above', t('powyżej')], ['below', t('poniżej')], ['inside', t('wewnątrz')]] }] },
  atrRatio: { init: () => ({}), ui: [{ p: 'min', type: 'num', label: () => t('od') }, { p: 'max', type: 'num', label: () => t('do') }] },
};
// Kolejność i lista rodzajów muszą pokrywać COND_KINDS (test backtest-F2: grupy warunków)
const KIND_ORDER = GROUPS.flatMap(([, ks]) => ks);
if (KIND_ORDER.length !== COND_KINDS.length || !COND_KINDS.every((k) => KIND_ORDER.includes(k))) throw new Error('bt-filtr-widok: lista rodzajów warunków rozjechała się z COND_KINDS');

// Nazwy wydarzeń z indeksu (kanoniczne z lib/backtest-index.mjs) jako podpowiedzi; reszta z załadowanych dni
const BASE_EVENTS = ['CPI', 'PPI', 'NFP', 'PCE', 'GDP', 'FOMC', 'FOMC Press Conference', 'FOMC Minutes', 'Retail Sales', 'Durable Goods'];

const REASONS = {
  no1s: (d) => t('brak sekund 9:30–11:00 NY dla NQ'),
  no1m: (d) => t('brak minut 9:30–16:00 NY dla ES'),
};
const WD_SHORT = () => [t('Nd'), t('Pn'), t('Wt'), t('Śr'), t('Cz'), t('Pt'), t('So')];

const emptyGroup = () => ({ op: 'and', not: false, items: [] });
const newCond = (k) => ({ k, not: false, ...SPEC[k].init() });
const isGroup = (n) => Array.isArray(n?.items);

// Model → filtr dla evalFilter (bez pustych grup i bez kluczy pomocniczych); null, gdy nie ma żadnego warunku
function clean(n) {
  if (isGroup(n)) {
    const items = n.items.map(clean).filter(Boolean);
    if (!items.length) return null;
    return { op: n.op === 'or' ? 'or' : 'and', not: !!n.not, items };
  }
  const o = {};
  for (const [k, v] of Object.entries(n)) {
    if (v === undefined || v === null || v === '') continue; // puste pole = brak ograniczenia (pusta lista dni zostaje: warunek nie przepuszcza nic)
    o[k] = v;
  }
  if (!o.not) delete o.not;
  return o;
}
// Filtr (ze szablonu, z sesji) → model edytora: korzeń zawsze grupą
function toModel(f) {
  const walk = (n) => (isGroup(n) ? { op: n.op === 'or' ? 'or' : 'and', not: !!n.not, items: n.items.map(walk) } : { not: false, ...n });
  if (!f || typeof f !== 'object' || !validateFilter(f)) return emptyGroup(); // review G #1: filtr z niepoprawnym parametrem (szablon, sesja z innego urządzenia) odpada w całości
  return isGroup(f) ? walk(f) : { op: 'and', not: false, items: [walk(f)] };
}
const countConds = (n) => (isGroup(n) ? n.items.reduce((a, x) => a + countConds(x), 0) : 1);

// dayTypeLabel(features, filter, tr) → krótki typ dnia do paska replayu. Z filtrem: wydarzenia nazwane w warunkach „konkretne wydarzenie” (bez negacji), które padły
// tego dnia, np. „CPI 8:30”; bez dopasowania albo bez filtra: najwyżej dwie etykiety dayTags (np. „CPI, OPEX”, „bez newsów”).
export function dayTypeLabel(f, filter = null, tr = t) {
  if (!f) return '';
  const names = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object' || n.not) return;
    if (Array.isArray(n.items)) n.items.forEach(walk);
    else if (n.k === 'event' && n.name) names.push(String(n.name).trim().toLowerCase());
  };
  walk(filter);
  const hit = [];
  if (names.length) for (const n of f.news || []) if (names.includes(String(n.name).toLowerCase()) && !hit.some((h) => h.name === n.name)) hit.push(n);
  if (hit.length) return hit.slice(0, 2).map((n) => `${n.name} ${n.allDay || n.hm === '00:00' ? '' : String(n.hm || '').replace(/^0/, '')}`.trim()).join(', ');
  return dayTags(f, tr).slice(0, 2).join(', ');
}

// mountFilterEditor(host, { filter, days, instruments, from, to, excluded, templates, onChange(filter, info), onTemplates(list) }) → { value(), excludedDays(), setDays(days), setContext({ instruments, from, to }), setLoading(b), setError(msg), destroy() }
// info = { count, active, excluded, result } (result = wynik matchDays); filter = null przy braku warunków.
export function mountFilterEditor(host, { filter = null, days = [], instruments = ['NQ'], from = '', to = '', excluded = [], templates = [], getTemplates = null, onChange = () => {}, onTemplates = () => {} } = {}) {
  let tree = toModel(filter);
  let all = days || [], ctx = { instruments, from, to };
  let manual = new Set(excluded || []);
  let tpls = (templates || []).map(templateOf).filter(Boolean);
  // Review G #10d: zapis i usunięcie szablonu działają na ŚWIEŻEJ liście (getTemplates: bieżące ustawienia), nie na migawce z otwarcia kreatora, żeby nie nadpisać szablonów
  // zsynchronizowanych z innego urządzenia w międzyczasie.
  const freshTpls = () => (getTemplates ? (getTemplates() || []).map(templateOf).filter(Boolean) : tpls.slice());
  let loading = false, err = '', tplSel = '', tplName = '', last = null;
  const root = document.createElement('div');
  root.className = 'bt-fe';
  host.appendChild(root);

  const nodeAt = (path) => path.split('.').filter(Boolean).reduce((n, i) => n.items[Number(i)], tree);
  const parentAt = (path) => { const p = path.split('.').filter(Boolean); return { parent: p.slice(0, -1).reduce((n, i) => n.items[Number(i)], tree), index: Number(p[p.length - 1]) }; };

  // ---- drzewo ----
  const optGroups = () => GROUPS.map(([lab, ks]) => `<optgroup label="${esc(lab())}">${ks.map((k) => `<option value="${k}">${esc(L[k]())}</option>`).join('')}</optgroup>`).join('');
  const eventNames = () => {
    const s = new Set(BASE_EVENTS);
    for (const d of all) for (const n of d.news || []) s.add(n.name);
    return [...s].sort((a, b) => a.localeCompare(b));
  };
  const notBox = (n, lab) => `<label class="check bt-fnot"><input type="checkbox" data-act="not"${n.not ? ' checked' : ''}> ${esc(lab)}</label>`;
  function paramHtml(c, spec, path) {
    const v = c[spec.p];
    switch (spec.type) {
      case 'multi': return `<span class="bt-fmulti" data-p="${spec.p}">${spec.opts().map(([val, lab]) => `<label class="check"><input type="checkbox" value="${val}"${(v || []).includes(val) ? ' checked' : ''}> ${esc(lab)}</label>`).join('')}</span>`;
      case 'text': return `<input class="sp-in bt-fev" type="text" data-p="${spec.p}" value="${esc(v ?? '')}" placeholder="${esc(spec.ph())}" list="bt-fev-${path.replace(/\./g, '-') || 'r'}" autocomplete="off" aria-label="${esc(L[c.k]())}">${spec.list ? `<datalist id="bt-fev-${path.replace(/\./g, '-') || 'r'}">${eventNames().map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>` : ''}`;
      case 'date': return `<label class="bt-fnl"><span class="note">${esc(spec.label())}</span><input class="sp-in" type="date" data-p="${spec.p}" value="${esc(v ?? '')}"></label>`;
      case 'num': return `<label class="bt-fnl"><span class="note">${esc(spec.label())}</span><input class="sp-in bt-fnum" type="number" step="any" data-p="${spec.p}" value="${esc(v ?? '')}"></label>`; // review G #1: każda wartość warunku przez esc
      case 'select': return `<select class="sp-in sp-sel" data-p="${spec.p}"${spec.num ? ' data-num="1"' : ''}>${spec.any ? `<option value=""${v == null ? ' selected' : ''}>${esc(spec.any())}</option>` : ''}${spec.opts().map(([val, lab]) => `<option value="${val}"${String(v) === String(val) ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;
      default: return '';
    }
  }
  function nodeHtml(n, path) {
    if (isGroup(n)) {
      const first = path === '';
      const items = n.items.map((x, i) => nodeHtml(x, path ? `${path}.${i}` : String(i))).join('');
      const seg = `<div class="seg sm" role="group" data-k="op" aria-label="${esc(t('Łączenie warunków'))}"><button type="button" data-v="and" aria-pressed="${n.op !== 'or'}">${esc(t('i'))}</button><button type="button" data-v="or" aria-pressed="${n.op === 'or'}">${esc(t('lub'))}</button></div>`;
      return `<div class="bt-fgrp${first ? ' bt-froot' : ''}" data-path="${path}" role="group" aria-label="${esc(first ? t('Warunki filtra') : t('Grupa warunków'))}">
        <div class="bt-fgh">${seg}${notBox(n, t('nie'))}${first ? '' : `<button type="button" class="icon-btn" data-act="del" aria-label="${esc(t('Usuń grupę'))}">${X}</button>`}</div>
        <div class="bt-fitems">${items || `<p class="note bt-fempty">${esc(t('Brak warunków: filtr przepuszcza wszystkie dni.'))}</p>`}</div>
        <div class="bt-fgf"><select class="sp-in sp-sel bt-fadd" aria-label="${esc(t('Dodaj warunek'))}"><option value="">${esc(t('Dodaj warunek…'))}</option>${optGroups()}</select><button type="button" class="btn ghost sm" data-act="addgrp">${esc(t('Dodaj grupę'))}</button></div>
      </div>`;
    }
    const spec = SPEC[n.k];
    return `<div class="bt-fcond" data-kind="${n.k}" data-path="${path}">${notBox(n, t('nie'))}<span class="bt-fl">${esc(L[n.k]())}</span><span class="bt-fp">${spec.ui.map((u) => paramHtml(n, u, path)).join('')}</span><button type="button" class="icon-btn" data-act="del" aria-label="${esc(t('Usuń warunek'))}">${X}</button>${n.k === 'gap' ? `<p class="note bt-fgapnote">${esc(t('Gap: ostatnia cena przed godziną startu sesji (najpóźniej otwarcie 9:30 NY) minus zamknięcie poprzedniej sesji. Nie zdradza kierunku otwarcia.'))}</p>` : ''}</div>`;
  }
  const X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  function tplHtml() {
    return `<div class="bt-fts"><select class="sp-in sp-sel bt-ftsel" aria-label="${esc(t('Szablon filtra'))}"><option value="">${esc(t('Szablon filtra…'))}</option>${tpls.map((e, i) => `<option value="${i}"${String(i) === tplSel ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
      <button type="button" class="btn ghost sm" data-act="tdel"${tplSel === '' ? ' disabled' : ''}>${esc(t('Usuń szablon'))}</button>
      <input class="sp-in bt-ftname" type="text" maxlength="60" value="${esc(tplName)}" placeholder="${esc(t('Nazwa szablonu'))}" aria-label="${esc(t('Nazwa szablonu'))}"><button type="button" class="btn ghost sm" data-act="tsave">${esc(t('Zapisz jako szablon'))}</button></div>`;
  }

  function skeleton() {
    root.innerHTML = `
      <div class="bt-ftree"></div>
      ${tplHtml()}
      <div class="bt-fres" role="status" aria-live="polite"><b class="bt-fcount"></b> <span class="bt-fload note" hidden></span></div>
      <p class="note bt-fnote" role="alert" hidden></p>
      <ul class="bt-fdays" aria-label="${esc(t('Pasujące dni'))}"></ul>
      <div class="bt-fman-w" hidden><span class="lbl">${esc(t('Wyrzucone ręcznie'))}</span><ul class="bt-fman"></ul></div>
      <details class="bt-fno-w" hidden><summary>${esc(t('Wyłączone (brak danych)'))}</summary><ul class="bt-fno"></ul></details>`;
    paintTree(); recalc();
  }
  function paintTree() {
    root.querySelector('.bt-ftree').innerHTML = nodeHtml(tree, '');
  }
  function paintTpl() {
    const w = root.querySelector('.bt-fts');
    w.outerHTML = tplHtml();
  }

  // ---- licznik, lista, wykluczone ----
  const wdOf = (f) => WD_SHORT()[f.wd] || '';
  function recalc() {
    const f = clean(tree);
    const def = { instruments: ctx.instruments, from: ctx.from, to: ctx.to, filter: f, excluded: [...manual] };
    let m, errText = '';
    try { m = matchDays(def, all); } catch (e) { m = { days: [], excluded: [], counts: { manual: 0, done: 0, no1s: 0, no1m: 0, filter: 0 } }; console.warn('[bt-filtr]', e?.message); errText = t('Filtr jest nieprawidłowy. Usuń ostatni warunek albo wybierz inny szablon.'); } // H2 (przegląd #5): komunikat przez t(), szczegół modułu (po polsku) tylko w konsoli
    last = { filter: f, m };
    const byDay = new Map(all.map((d) => [d.day, d]));
    root.querySelector('.bt-fcount').textContent = t('Pasujące dni: {n}', { n: m.days.length });
    root.querySelector('.bt-fload').hidden = !loading;
    root.querySelector('.bt-fload').textContent = loading ? t('Wczytuję indeks dni…') : '';
    root.querySelector('.bt-fdays').innerHTML = m.days.map((d) => {
      const tags = dayTags(byDay.get(d) || {}, t).slice(0, 2).join(', ');
      return `<li data-day="${d}"><span class="bt-fd">${d} <i>${esc(wdOf(byDay.get(d) || {}))}</i></span><span class="bt-ftag" title="${esc(tags)}">${esc(tags)}</span><button type="button" class="icon-btn" data-act="drop" aria-label="${esc(t('Wyrzuć dzień {d}', { d }))}" title="${esc(t('Wyrzuć dzień'))}">${X}</button></li>`;
    }).join('');
    const man = root.querySelector('.bt-fman');
    man.innerHTML = [...manual].sort().map((d) => `<li data-day="${d}"><span class="bt-fd">${d}</span><button type="button" class="btn ghost sm" data-act="restore">${esc(t('Przywróć'))}</button></li>`).join('');
    root.querySelector('.bt-fman-w').hidden = !manual.size;
    const no = m.excluded.filter((x) => x.reason === 'no1s' || x.reason === 'no1m');
    root.querySelector('.bt-fno').innerHTML = no.map((x) => `<li data-day="${x.day}" data-reason="${x.reason}">${x.day}: ${esc(REASONS[x.reason](x.day))}</li>`).join('');
    const nw = root.querySelector('.bt-fno-w');
    nw.hidden = !no.length;
    nw.querySelector('summary').textContent = t('Wyłączone (brak danych): {n}', { n: no.length });
    // notka przy zerze pasujących dni (Utwórz jest wtedy wyłączone w kreatorze)
    const note = root.querySelector('.bt-fnote');
    let text = errText || err;
    if (!text && !loading && !m.days.length) text = m.counts.filter > 0 || m.counts.manual > 0 ? t('Żaden dzień nie spełnia filtra. Zmień warunki, zakres dat albo przywróć wyrzucone dni.') : t('W tym zakresie nie ma dni z danymi dla wybranych instrumentów. Zmień zakres albo pobierz świece.');
    note.textContent = text; note.hidden = !text;
    return m;
  }
  const info = () => ({ count: last.m.days.length, active: !!last.filter || manual.size > 0, excluded: [...manual], result: last.m, ready: !loading && !err });
  const changed = () => { recalc(); onChange(last.filter, info()); };

  // ---- zdarzenia ----
  function readParam(el, c) {
    const p = el.closest('[data-p]')?.dataset.p || el.dataset.p;
    if (!p) return;
    const wrap = el.closest('.bt-fmulti');
    if (wrap) {
      const vals = [...wrap.querySelectorAll('input:checked')].map((x) => Number(x.value));
      c[p] = vals;
      return;
    }
    let v = el.value;
    if (el.type === 'number') v = v === '' ? undefined : Number(v);
    else if (el.dataset.num) v = v === '' ? undefined : Number(v);
    else if (v === '') v = undefined;
    if (el.type === 'number' && !Number.isFinite(v)) v = undefined;
    c[p] = v;
  }
  root.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.classList.contains('bt-ftname')) { tplName = el.value; return; }
    if (!el.matches('input[data-p], .bt-fmulti input')) return;
    if (el.type === 'checkbox') return; // pola wielokrotnego wyboru obsługuje 'change'
    const node = el.closest('.bt-fcond'); if (!node) return;
    readParam(el, nodeAt(node.dataset.path)); changed();
  });
  root.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.classList.contains('bt-ftsel')) {
      tplSel = el.value;
      if (tplSel !== '') {
        const f = templateFilter(tpls[Number(tplSel)]);
        if (f) { tree = toModel(f); tplName = tpls[Number(tplSel)].name; paintTree(); }
      }
      paintTpl(); changed(); return;
    }
    if (el.classList.contains('bt-fadd')) {
      const k = el.value; if (!k || !SPEC[k]) return;
      addNode(el.closest('.bt-fgrp'), newCond(k));
      el.value = '';
      return;
    }
    if (el.dataset.act === 'not') {
      const node = el.closest('.bt-fcond, .bt-fgrp'); nodeAt(node.dataset.path).not = el.checked; changed(); return;
    }
    if (el.matches('[data-p], .bt-fmulti input')) {
      const node = el.closest('.bt-fcond'); if (!node) return;
      readParam(el, nodeAt(node.dataset.path)); changed();
    }
  });
  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || !root.contains(b)) return;
    if (b.parentElement?.dataset.k === 'op') {
      const g = nodeAt(b.closest('.bt-fgrp').dataset.path); g.op = b.dataset.v === 'or' ? 'or' : 'and';
      b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); changed(); return;
    }
    switch (b.dataset.act) {
      case 'addgrp': addNode(b.closest('.bt-fgrp'), emptyGroup()); break;
      case 'del': { const { parent, index } = parentAt(b.closest('[data-path]').dataset.path); parent.items.splice(index, 1); paintTree(); changed(); break; }
      case 'drop': manual.add(b.closest('li').dataset.day); changed(); break;
      case 'restore': manual.delete(b.closest('li').dataset.day); changed(); break;
      case 'tsave': {
        const name = (root.querySelector('.bt-ftname').value || '').trim().slice(0, 60);
        const f = clean(tree);
        if (!name || !f) { flash(!name ? t('Podaj nazwę szablonu.') : t('Dodaj najpierw co najmniej jeden warunek.')); break; }
        const e = templateEntry(name, f);
        if (!templateOf(e)) { flash(t('Filtr jest za duży na szablon.')); break; }
        const next = freshTpls();
        const i = next.findIndex((x) => x.name === name);
        if (i >= 0) next[i] = e; else if (next.length < TEMPLATES_MAX) next.push(e); else { flash(t('Za dużo szablonów (maksymalnie {n}).', { n: TEMPLATES_MAX })); break; }
        if (templatesSize(next) > TEMPLATES_BUDGET) { flash(t('Szablony zajęłyby za dużo miejsca w ustawieniach (limit {n} znaków). Usuń któryś szablon.', { n: TEMPLATES_BUDGET })); break; }
        tpls = next;
        tplSel = String(tpls.findIndex((x) => x.name === name)); tplName = name;
        paintTpl(); onTemplates(tpls.map((x) => ({ ...x }))); break;
      }
      case 'tdel': {
        if (tplSel === '') break;
        const gone = tpls[Number(tplSel)]?.name;
        tpls = freshTpls().filter((x) => x.name !== gone); tplSel = '';
        paintTpl(); onTemplates(tpls.map((x) => ({ ...x }))); break;
      }
      default:
    }
  });
  // Dodanie węzła dopisuje tylko jego kod HTML (reszta drzewa, fokus i wpisane wartości zostają); usunięcie przerysowuje drzewo, bo ścieżki się przesuwają
  function addNode(groupEl, node) {
    const path = groupEl.dataset.path, g = nodeAt(path);
    g.items.push(node);
    const box = groupEl.querySelector(':scope > .bt-fitems');
    box.querySelector(':scope > .bt-fempty')?.remove();
    box.insertAdjacentHTML('beforeend', nodeHtml(node, path ? `${path}.${g.items.length - 1}` : String(g.items.length - 1)));
    changed();
  }
  function flash(text) { const n = root.querySelector('.bt-fnote'); n.textContent = text; n.hidden = false; }

  skeleton();
  return {
    value: () => last.filter,
    excludedDays: () => [...manual].sort(),
    count: () => last.m.days.length,
    info,
    setDays(d) { all = d || []; err = ''; loading = false; changed(); },
    setContext(c) { ctx = { ...ctx, ...c }; changed(); },
    setLoading(b) { loading = !!b; if (b) err = ''; changed(); },
    setError(msg) { err = msg || ''; loading = false; changed(); },
    destroy() { root.remove(); },
  };
}
