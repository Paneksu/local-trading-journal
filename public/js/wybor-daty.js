// Wybierak daty i godziny (1.6.1) zamiast natywnych pól date/time: jedno okno w stylu dashboardu dla całej aplikacji.
// [U] 1.11.2026 «stworz w naszym stylu design okna ustawiania czasu i daty, ma byc proste w uzytku najlepiej»
//
// Użycie: <input class="sp-in" type="text" data-wd="date" name="from" value="2024-03-12"> albo data-wd="time" (GG:MM).
// Atrybuty: min / max (RRRR-MM-DD), data-wd-tz="NY" (etykieta strefy), data-wd-presety="09:00,09:30" (szybki wybór godziny),
// data-wd-pusty (pole może zostać puste: przycisk „Wyczyść”), data-wd-poza (powód dla dni spoza min/max).
// Pole dostaje wybierak samo (MutationObserver), także gdy moduł wstawia znaczniki przez innerHTML.
//
// Wartość dla kodu aplikacji się nie zmienia: el.value zwraca 'RRRR-MM-DD' / 'GG:MM' (albo '' jak natywne pole z niepełną datą),
// el.value = '2024-03-12' ustawia pole, FormData dostaje ten sam format (zdarzenie formdata). W polu widać tekst do wpisania z klawiatury:
// PL dd.mm.rrrr, EN mm/dd/yyyy. Zdarzenia: 'input', gdy wartość się zmienia, 'change' po zatwierdzeniu (wybór w oknie, Enter, wyjście z pola).
// Klawiatura (wzorzec APG „Date Picker Combobox”): strzałka w dół / Alt+↓ / F4 otwiera kalendarz, strzałki, PageUp/PageDown (z Shiftem rok),
// Home/End, Enter, Escape, Tab w oknie. Godzina: ↑/↓ zmieniają część pod kursorem (Shift: minuty co 10), kółko tak samo, Alt+↓ otwiera okno.
// Na wąskim ekranie (≤ 1023 px) okno to arkusz od dołu na całą szerokość z celami 44 px.
// English: custom date/time picker; the field keeps the old value format (YYYY-MM-DD / HH:MM) so app code does not change.
import { t, getLang } from './i18n.js';
import * as F from './format.js';
import * as L from './wybor-daty-logika.js';

// moduł bywa importowany w Node (testy kreatora): bez DOM nic się nie podłącza
const HAS_DOM = typeof document !== 'undefined' && typeof HTMLInputElement !== 'undefined';
const NATIVE = HAS_DOM ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') : null;
const ST = new WeakMap();
const FORMS = new WeakSet();
let langOverride = null;
// testy: język formatu bez zmiany języka interfejsu
export function setLang(l) { langOverride = l === 'en' ? 'en' : l === 'pl' ? 'pl' : null; }
const lg = () => langOverride || (getLang() === 'en' ? 'en' : 'pl');
const isSheet = () => matchMedia('(max-width: 1023px)').matches;
const esc = F.esc;
let emitting = 0, seq = 0, cur = null;
// ostatnia interakcja: klawiatura czy wskaźnik (po wyborze w arkuszu na telefonie fokus nie wraca do pola, żeby nie wyskakiwała klawiatura ekranowa)
let viaKeys = false;

const ICON_CAL = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>';
const ICON_CLOCK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const CHEV = (d) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const UP = CHEV('m6 15 6-6 6 6'), DOWN = CHEV('m6 9 6 6 6-6');

const placeholder = (kind) => (kind === 'time' ? t('gg:mm') : lg() === 'en' ? 'mm/dd/yyyy' : t('dd.mm.rrrr'));
const fmt = (iso) => L.formatDate(iso, lg());
const today = () => F.todayKey();

// ---------- wartość ----------
function read(el) {
  const s = ST.get(el), txt = NATIVE.get.call(el);
  if (s.kind === 'time') return L.parseTime(txt) || '';
  return L.parseDate(txt, lg()) || '';
}
function write(el, v) {
  const s = ST.get(el), str = String(v ?? '');
  let disp = str;
  if (s.kind === 'time') { const hm = L.parseTime(str, { loose: true }); if (hm) disp = hm; }
  else { const iso = L.validIso(str) ? str : L.parseDate(str, lg(), { loose: true, today: today() }); if (iso) disp = fmt(iso); }
  NATIVE.set.call(el, disp);
  s.last = s.lastInput = read(el);
  if (s.bad) { el.removeAttribute('aria-invalid'); s.bad = false; }
  if (cur?.el === el) syncPop();
}
function emit(el, type) {
  emitting++;
  try { el.dispatchEvent(new Event(type, { bubbles: true })); } finally { emitting--; }
}
// Zatwierdzenie tekstu z pola: luźniejszy odczyt (rok dwucyfrowy, bez roku, „930”), zakres min/max, zapis w formacie pola i 'change'.
// Tekst, którego nie da się odczytać, zostaje w polu z aria-invalid i bez zdarzenia (aplikacja widzi '' dopiero przy zapisie formularza).
function commit(el) {
  const s = ST.get(el);
  if (!s) return;
  const txt = NATIVE.get.call(el).trim();
  let v;
  if (!txt) v = '';
  else if (s.kind === 'time') v = L.parseTime(txt, { loose: true });
  else { v = L.parseDate(txt, lg(), { loose: true, today: today() }); if (v) v = L.clamp(v, el.min, el.max); }
  if (v === null) { el.setAttribute('aria-invalid', 'true'); s.bad = true; return; }
  if (s.bad) { el.removeAttribute('aria-invalid'); s.bad = false; }
  NATIVE.set.call(el, s.kind === 'time' ? v : v ? fmt(v) : '');
  if (v !== s.lastInput) { s.lastInput = v; emit(el, 'input'); }
  if (v !== s.last) { s.last = v; emit(el, 'change'); }
}
function setFromPicker(el, v, { change = true } = {}) {
  const s = ST.get(el);
  NATIVE.set.call(el, s.kind === 'time' ? v : v ? fmt(v) : '');
  if (s.bad) { el.removeAttribute('aria-invalid'); s.bad = false; }
  if (v !== s.lastInput) { s.lastInput = v; emit(el, 'input'); }
  if (change && v !== s.last) { s.last = v; emit(el, 'change'); }
}

// ---------- pole ----------
export function upgrade(el) {
  if (!HAS_DOM || !(el instanceof HTMLInputElement) || ST.has(el) || !el.dataset.wd) return;
  const kind = el.dataset.wd === 'time' ? 'time' : 'date';
  const s = { kind, last: '', lastInput: '', bad: false, rule: null, cache: new Map(), wrap: null };
  ST.set(el, s);
  const raw = NATIVE.get.call(el);
  Object.defineProperty(el, 'value', { configurable: true, get() { return read(el); }, set(v) { write(el, v); } });
  if (el.type !== 'text') el.type = 'text';
  el.autocomplete = 'off';
  el.spellcheck = false;
  el.setAttribute('role', 'combobox');
  el.setAttribute('aria-haspopup', 'dialog');
  el.setAttribute('aria-expanded', 'false');
  if (!el.placeholder) el.placeholder = placeholder(kind);
  if (!el.title) el.title = kind === 'time' ? t('Wpisz godzinę (gg:mm). Strzałki i kółko zmieniają godziny albo minuty, zależnie od kursora.') : t('Wpisz datę ({f}) albo wybierz ją w kalendarzu (strzałka w dół).', { f: placeholder('date') });
  write(el, raw);
  const tz = el.dataset.wdTz || '';
  const wrap = document.createElement('span');
  wrap.className = `wd wd-${kind}${tz ? ' has-tz' : ''}`;
  el.before(wrap);
  wrap.append(el);
  wrap.insertAdjacentHTML('beforeend', `${tz ? `<span class="wd-tz" aria-hidden="true">${esc(tz)}</span>` : ''}<button type="button" class="wd-ico" tabindex="-1" aria-hidden="true">${kind === 'time' ? ICON_CLOCK : ICON_CAL}</button>`);
  s.wrap = wrap;
  const ico = wrap.querySelector('.wd-ico');
  ico.addEventListener('pointerdown', (ev) => { ev.preventDefault(); });
  ico.addEventListener('click', () => { if (cur?.el === el) close(); else open(el, { focus: true }); });
  // Pisanie w polu (zdarzenia przeglądarki, isTrusted): aplikacja dostaje 'input' tylko przy zmianie wartości (jak w natywnym polu daty),
  // a 'change' dopiero po zatwierdzeniu (commit). Zdarzenia wysłane z kodu (dispatchEvent) przechodzą bez zmian, z wartością w starym formacie.
  el.addEventListener('input', (ev) => {
    if (emitting) return;
    if (s.bad) { el.removeAttribute('aria-invalid'); s.bad = false; }
    const v = read(el);
    if (ev.isTrusted) { ev.stopImmediatePropagation(); if (v !== s.lastInput) { s.lastInput = v; emit(el, 'input'); } }
    else s.lastInput = v;
    if (cur?.el === el) syncPop();
  });
  el.addEventListener('change', (ev) => {
    if (emitting) return;
    if (ev.isTrusted) ev.stopImmediatePropagation();
    else s.last = s.lastInput = read(el);
  });
  el.addEventListener('blur', (ev) => {
    if (cur?.el === el && ev.relatedTarget && cur.pop.contains(ev.relatedTarget)) return;
    if (cur?.el === el) close({ restore: false });
    else commit(el);
  });
  el.addEventListener('keydown', (ev) => fieldKey(el, ev));
  el.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || el.disabled || el.readOnly) return;
    // dotyk i wąski ekran: arkusz zamiast klawiatury ekranowej
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen' || isSheet()) {
      ev.preventDefault();
      open(el, { focus: true });
      // pole tylko do odczytu, dopóki arkusz jest otwarty: dotknięcie nie otwiera klawiatury ekranowej
      if (cur?.el === el && !el.readOnly) { el.readOnly = true; cur.ro = true; }
      return;
    }
    // mysz: fokus zostaje w polu (można pisać), okno otwiera się pod polem
    if (cur?.el !== el) open(el, { focus: false });
  });
  if (kind === 'time') el.addEventListener('wheel', (ev) => {
    if (document.activeElement !== el || !ev.deltaY) return;
    ev.preventDefault();
    stepField(el, L.partAt(el.selectionStart ?? 5), ev.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  const form = el.form;
  if (form && !FORMS.has(form)) {
    FORMS.add(form);
    form.addEventListener('formdata', (ev) => { for (const x of form.querySelectorAll('input[data-wd]')) if (x.name && ST.has(x) && !x.disabled) ev.formData.set(x.name, x.value); });
  }
}

function stepField(el, part, delta) {
  const s = ST.get(el);
  const base = L.parseTime(NATIVE.get.call(el), { loose: true }) || s.lastInput || '00:00';
  const v = L.stepTime(base, part, delta);
  NATIVE.set.call(el, v);
  if (part === 'h') el.setSelectionRange?.(0, 2); else el.setSelectionRange?.(3, 5);
  if (v !== s.lastInput) { s.lastInput = v; emit(el, 'input'); }
  if (cur?.el === el) syncPop();
}

function fieldKey(el, ev) {
  const s = ST.get(el), isOpen = cur?.el === el;
  if (ev.key === 'Escape' && isOpen) { ev.preventDefault(); ev.stopPropagation(); close({ revert: true }); return; }
  if (ev.key === 'Enter') { if (isOpen) close({ restore: false }); commit(el); return; }
  if (ev.key === 'Tab') { if (isOpen) close({ restore: false }); return; }
  if (ev.key === 'F4' || (ev.altKey && ev.key === 'ArrowDown')) { ev.preventDefault(); open(el, { focus: true }); return; }
  if (s.kind === 'date' && ev.key === 'ArrowDown' && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); open(el, { focus: true }); return; }
  if (s.kind === 'time' && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && !ev.altKey && !ev.ctrlKey && !ev.metaKey) {
    ev.preventDefault();
    const part = L.partAt(el.selectionStart ?? 5);
    const d = (ev.key === 'ArrowUp' ? 1 : -1) * (ev.shiftKey && part === 'm' ? 10 : 1);
    stepField(el, part, d);
  }
}

// ---------- dni wyłączone ----------
// fn(od, do) → Promise<Map|obiekt { 'RRRR-MM-DD': powód }> dla widocznej siatki (6 tygodni); wynik trzymany do refreshDayRule(el).
export function setDayRule(el, fn) { upgrade(el); const s = ST.get(el); if (!s) return; s.rule = fn; s.cache = new Map(); if (cur?.el === el) render(); }
export function refreshDayRule(el) { const s = ST.get(el); if (!s) return; s.cache = new Map(); if (cur?.el === el) render(); }

function rangeReason(el) {
  const a = L.validIso(el.min) ? el.min : '', b = L.validIso(el.max) ? el.max : '';
  const base = el.dataset.wdPoza || t('Poza dostępnym zakresem');
  if (a && b) return `${base}: ${F.longDate(a)} – ${F.longDate(b)}`;
  if (a) return `${base}: ${t('najwcześniej {d}', { d: F.longDate(a) })}`;
  return `${base}: ${t('najpóźniej {d}', { d: F.longDate(b) })}`;
}
function reasonOf(el, iso, rules) {
  if (!L.inRange(iso, el.min, el.max)) return rangeReason(el);
  return rules instanceof Map ? rules.get(iso) || '' : '';
}

// ---------- okno ----------
function labelOf(el) {
  const own = el.getAttribute('aria-label');
  let txt = own || '';
  const lab = el.labels?.[0];
  if (!txt && lab) {
    const c = lab.cloneNode(true);
    c.querySelectorAll('.wd, .fhint, .ferr, [role="status"], .wd-pop').forEach((x) => x.remove());
    txt = c.textContent.replace(/\s+/g, ' ').trim();
  }
  const tz = el.dataset.wdTz;
  if (tz && !txt.includes(tz)) txt = `${txt} (${tz})`.trim();
  return txt || (ST.get(el).kind === 'time' ? t('Godzina') : t('Data'));
}

function open(el, { focus = false } = {}) {
  if (cur?.el === el) { if (focus) focusActive(); return; }
  if (cur) close({ restore: false });
  const s = ST.get(el);
  if (!s || el.disabled || el.readOnly || !el.isConnected) return;
  const sheet = isSheet();
  const pop = document.createElement('div');
  pop.className = `wd-pop wd-pop-${s.kind}${sheet ? ' is-sheet' : ''}`;
  pop.id = `wd-pop-${++seq}`;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', s.kind === 'time' ? t('{pole}: wybierz godzinę', { pole: labelOf(el) }) : t('{pole}: wybierz datę', { pole: labelOf(el) }));
  if (sheet) pop.setAttribute('aria-modal', 'true');
  const hasPopover = typeof pop.showPopover === 'function';
  if (hasPopover) pop.setAttribute('popover', 'manual');
  // okno w drzewie obok pola (nie w etykiecie: jej tekst to nazwa pola), więc kliknięcia w nim są „w środku” Ustawień i formularzy;
  // warstwa górna (popover) wyprowadza je ponad przewijane panele i okna
  (el.closest('label') || s.wrap).after(pop);
  const v = read(el) || '';
  // pole puste otwiera się na miesiącu z data-wd-start (np. data startu sesji), a gdy go brak, na dzisiejszym
  const startIso = s.kind === 'date' ? (v || L.clamp(L.validIso(el.dataset.wdStart) ? el.dataset.wdStart : today(), el.min, el.max)) : '';
  cur = { el, pop, kind: s.kind, sheet, view: 'days', focus: startIso, month: startIso.slice(0, 7), year: +startIso.slice(0, 4) || 0, start: NATIVE.get.call(el), startVal: v, tbuf: '', tbufAt: 0 };
  el.setAttribute('aria-expanded', 'true');
  el.setAttribute('aria-controls', pop.id);
  render();
  // starsza przeglądarka bez popover: zostaje zwykła warstwa fixed
  if (hasPopover) { try { pop.showPopover(); } catch { pop.removeAttribute('popover'); } }
  place();
  pop.addEventListener('keydown', popKey);
  pop.addEventListener('pointerdown', (ev) => {
    // mysz: kliknięcie w oknie nie zabiera fokusu z pola (dalej można pisać); dotyk i arkusz: zwykły fokus
    if (!cur?.sheet && document.activeElement === el && !ev.target.closest('[role="spinbutton"]')) ev.preventDefault();
  });
  pop.addEventListener('click', popClick);
  pop.addEventListener('wheel', popWheel, { passive: false });
  if (focus || sheet) focusActive();
}

function close({ revert = false, restore = true } = {}) {
  if (!cur) return;
  const { el, pop, kind, start, sheet, ro } = cur;
  cur = null;
  if (ro) el.readOnly = false;
  // okno mogło już zniknąć z warstwy górnej
  try { pop.hidePopover?.(); } catch { pop.removeAttribute('popover'); }
  pop.remove();
  el.setAttribute('aria-expanded', 'false');
  el.removeAttribute('aria-controls');
  if (restore && el.isConnected && (!sheet || viaKeys)) el.focus({ preventScroll: true });
  if (revert) {
    const s = ST.get(el);
    NATIVE.set.call(el, start);
    const v = read(el);
    if (v !== s.lastInput) { s.lastInput = v; emit(el, 'input'); }
    return;
  }
  if (kind === 'time' || document.activeElement !== el) commit(el);
}

function place() {
  if (!cur) return;
  const { pop, el, sheet } = cur;
  if (sheet) { pop.style.left = ''; pop.style.top = ''; return; }
  const r = ST.get(el).wrap.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
  let top = r.bottom + 6;
  if (top + h > innerHeight - 8) top = r.top - 6 - h >= 8 ? r.top - 6 - h : Math.max(8, innerHeight - h - 8);
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

function focusActive() {
  if (!cur) return;
  const p = cur.pop;
  const x = cur.kind === 'time' ? p.querySelector('[role="spinbutton"]')
    : cur.view === 'days' ? p.querySelector('td[tabindex="0"]') : p.querySelector('.wd-cell[tabindex="0"]') || p.querySelector('.wd-cell');
  (x || p).focus({ preventScroll: true });
}

function syncPop() {
  if (!cur) return;
  if (cur.kind === 'time') { paintTime(); return; }
  const v = read(cur.el);
  if (v && v !== cur.focus) { cur.focus = v; cur.month = v.slice(0, 7); cur.view = 'days'; render(); }
}

// ---------- kalendarz ----------
function navHtml(prevAct, nextAct, prevLabel, nextLabel, title, titleAct, titleLabel, extra = null) {
  const b = (act, v, lab, txt) => `<button type="button" class="icon-btn wd-nb" data-wa="${act}" data-v="${v}" aria-label="${esc(lab)}" title="${esc(lab)}">${txt}</button>`;
  return `<div class="wd-nav">${extra ? b(extra[0], -1, extra[1], '«') : ''}${b(prevAct, -1, prevLabel, '‹')}
    <button type="button" class="wd-ttl" data-wa="${titleAct}" id="${cur.pop.id}-t" aria-label="${esc(titleLabel)}"${titleAct ? '' : ' disabled'}><span aria-live="polite">${esc(title)}</span>${titleAct ? DOWN : ''}</button>
    ${b(nextAct, 1, nextLabel, '›')}${extra ? b(extra[0], 1, extra[2], '»') : ''}</div>`;
}

function footHtml() {
  const el = cur.el, s = ST.get(el);
  const tdy = today();
  const rules = s.rule ? s.cache.get(gridKey()) : null;
  const why = cur.kind === 'date' ? reasonOf(el, tdy, rules) : '';
  const clear = el.hasAttribute('data-wd-pusty') && !el.required ? `<button type="button" class="btn ghost sm" data-wa="clear">${esc(t('Wyczyść'))}</button>` : '';
  let legend = '';
  if (cur.kind === 'date' && s.rule) legend = rules === 'loading' ? t('Sprawdzam dni z danymi…') : rules === 'error' ? t('Nie udało się sprawdzić dni z danymi.') : t('Przekreślone dni: bez danych');
  if (cur.kind === 'time') return `<div class="wd-f">${clear}<span class="grow"></span><button type="button" class="btn primary sm" data-wa="done">${esc(t('Gotowe'))}</button></div>`;
  // „Dziś” poza zakresem min i max nic nie robi, więc go nie pokazujemy (zostaje legenda)
  const todayBtn = L.inRange(tdy, el.min, el.max) ? `<button type="button" class="btn ghost sm" data-wa="today"${why ? ` disabled title="${esc(why)}"` : ''}>${esc(t('Dziś'))}</button>` : '';
  return `<div class="wd-f">${todayBtn}${clear}${legend ? `<span class="note wd-legend" role="status">${esc(legend)}</span>` : ''}</div>`;
}

const gridKey = () => { const g = L.monthGrid(cur.month); return `${g[0]}|${g[41]}`; };

function loadRules() {
  const el = cur.el, s = ST.get(el);
  if (!s.rule) return null;
  const key = gridKey();
  if (s.cache.has(key)) return s.cache.get(key);
  s.cache.set(key, 'loading');
  const [a, b] = key.split('|');
  Promise.resolve().then(() => s.rule(a, b)).then((res) => {
    s.cache.set(key, res instanceof Map ? res : new Map(Object.entries(res || {})));
  }, () => { s.cache.set(key, 'error'); }).then(() => {
    if (cur?.el === el && cur.view === 'days' && gridKey() === key) { const had = cur.pop.contains(document.activeElement); render(); if (had) focusActive(); }
  });
  return 'loading';
}

function daysHtml() {
  const el = cur.el, v = read(el), tdy = today();
  const rules = loadRules();
  const [y, m] = cur.month.split('-').map(Number);
  const head = F.WEEKDAYS.map((w, i) => `<th scope="col" abbr="${esc(F.DAYS_FULL[i])}"><span aria-hidden="true">${esc(w)}</span><span class="wd-sr">${esc(F.DAYS_FULL[i])}</span></th>`).join('');
  const g = L.monthGrid(cur.month);
  let rows = '';
  for (let r = 0; r < 6; r++) {
    rows += '<tr>';
    for (let c = 0; c < 7; c++) {
      const iso = g[r * 7 + c];
      const why = reasonOf(el, iso, rules);
      const cls = [iso.slice(0, 7) !== cur.month && 'off', iso === v && 'sel', iso === tdy && 'today', why && 'dis'].filter(Boolean).join(' ');
      rows += `<td class="${cls}" data-iso="${iso}" tabindex="${iso === cur.focus ? 0 : -1}" aria-label="${esc(F.longDate(iso) + (why ? `, ${why}` : ''))}"${iso === v ? ' aria-selected="true"' : ''}${iso === tdy ? ' aria-current="date"' : ''}${why ? ` aria-disabled="true" title="${esc(why)}"` : ''}>${+iso.slice(8)}</td>`;
    }
    rows += '</tr>';
  }
  return navHtml('m', 'm', t('Poprzedni miesiąc'), t('Następny miesiąc'), F.monthTitle(y, m), 'months', t('Wybierz miesiąc i rok, teraz: {m}', { m: F.monthTitle(y, m) }), ['y', t('Poprzedni rok'), t('Następny rok')])
    + `<table class="wd-grid" role="grid" aria-labelledby="${cur.pop.id}-t"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

const monthDisabled = (el, y, m) => { const a = L.isoOf(y, m, 1), b = L.isoOf(y, m, L.daysIn(y, m)); return !!((el.max && L.validIso(el.max) && a > el.max) || (el.min && L.validIso(el.min) && b < el.min)); };
const yearDisabled = (el, y) => !!(el.max && L.validIso(el.max) && `${y}-01-01` > el.max) || (el.min && L.validIso(el.min) && `${y}-12-31` < el.min);

function monthsHtml() {
  const el = cur.el, y = cur.year, [cy, cm] = cur.month.split('-').map(Number);
  const nowY = +today().slice(0, 4), nowM = +today().slice(5, 7);
  const cells = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1, on = y === cy && m === cm, dis = monthDisabled(el, y, m);
    return `<button type="button" class="wd-cell${y === nowY && m === nowM ? ' now' : ''}" data-wa="pickm" data-v="${m}" aria-pressed="${on}" tabindex="${on || (!(y === cy) && m === 1) ? 0 : -1}" aria-label="${esc(F.monthTitle(y, m))}"${dis ? ` disabled title="${esc(rangeReason(el))}"` : ''}>${esc(F.MON_SHORT[i])}</button>`;
  }).join('');
  return navHtml('y', 'y', t('Poprzedni rok'), t('Następny rok'), String(y), 'years', t('Wybierz rok, teraz: {y}', { y }))
    + `<div class="wd-mgrid" role="group" aria-label="${esc(t('Miesiące roku {y}', { y }))}">${cells}</div>`;
}

function yearsHtml() {
  const el = cur.el, a = L.yearPageStart(cur.year), cy = +cur.month.slice(0, 4), nowY = +today().slice(0, 4);
  const cells = Array.from({ length: 12 }, (_, i) => {
    const y = a + i, on = y === cur.year, dis = yearDisabled(el, y);
    return `<button type="button" class="wd-cell${y === nowY ? ' now' : ''}" data-wa="picky" data-v="${y}" aria-pressed="${y === cy}" tabindex="${on ? 0 : -1}"${dis ? ` disabled title="${esc(rangeReason(el))}"` : ''}>${y}</button>`;
  }).join('');
  return navHtml('yp', 'yp', t('Poprzednie lata'), t('Następne lata'), `${a} – ${a + 11}`, '', `${a} – ${a + 11}`)
    + `<div class="wd-mgrid" role="group" aria-label="${esc(t('Lata'))}">${cells}</div>`;
}

// ---------- godzina ----------
function timeHtml() {
  const el = cur.el;
  const pre = (el.dataset.wdPresety || '').split(',').map((x) => x.trim()).filter(L.validHm);
  const spin = (p, lab) => `<div class="wd-spin"><button type="button" class="wd-step" data-wa="t" data-p="${p}" data-v="1" tabindex="-1" aria-label="${esc(p === 'h' ? t('Godzina później') : t('Minuty później (co 5)'))}">${UP}</button>
      <div class="wd-num" role="spinbutton" tabindex="0" data-p="${p}" aria-label="${esc(lab)}" aria-valuemin="0" aria-valuemax="${p === 'h' ? 23 : 59}"></div>
      <button type="button" class="wd-step" data-wa="t" data-p="${p}" data-v="-1" tabindex="-1" aria-label="${esc(p === 'h' ? t('Godzina wcześniej') : t('Minuty wcześniej (co 5)'))}">${DOWN}</button></div>`;
  return `<div class="wd-h">${esc(labelOf(el))}</div>
    <div class="wd-clock">${spin('h', t('Godziny'))}<span class="wd-colon" aria-hidden="true">:</span>${spin('m', t('Minuty'))}${el.dataset.wdTz ? `<span class="wd-ztag">${esc(el.dataset.wdTz)}</span>` : ''}</div>
    ${pre.length ? `<div class="seg sm full wd-pre" role="group" aria-label="${esc(t('Szybki wybór godziny'))}">${pre.map((h) => `<button type="button" data-wa="pre" data-v="${h}" aria-pressed="false">${h}</button>`).join('')}</div>` : ''}`;
}
function curTime() { return L.parseTime(NATIVE.get.call(cur.el), { loose: true }) || ST.get(cur.el).lastInput || '00:00'; }
function paintTime() {
  const hm = curTime(), [h, m] = hm.split(':');
  cur.pop.querySelectorAll('[role="spinbutton"]').forEach((x) => { const v = x.dataset.p === 'h' ? h : m; x.textContent = v; x.setAttribute('aria-valuenow', String(+v)); x.setAttribute('aria-valuetext', x.dataset.p === 'h' ? `${v} ${t('godz.')}` : `${v} ${t('min')}`); });
  const has = !!read(cur.el);
  cur.pop.querySelectorAll('.wd-pre button').forEach((b) => b.setAttribute('aria-pressed', String(has && b.dataset.v === hm)));
}
function setTime(hm) {
  const el = cur.el, s = ST.get(el);
  NATIVE.set.call(el, hm);
  if (s.bad) { el.removeAttribute('aria-invalid'); s.bad = false; }
  if (hm !== s.lastInput) { s.lastInput = hm; emit(el, 'input'); }
  paintTime();
}

function render() {
  if (!cur) return;
  const grab = cur.sheet ? '<div class="rp-grab wd-grab" aria-hidden="true"></div>' : '';
  const head = cur.sheet && cur.kind === 'date' ? `<div class="wd-h">${esc(labelOf(cur.el))}</div>` : '';
  const body = cur.kind === 'time' ? timeHtml() : cur.view === 'months' ? monthsHtml() : cur.view === 'years' ? yearsHtml() : daysHtml();
  cur.pop.innerHTML = grab + head + body + footHtml();
  if (cur.kind === 'time') paintTime();
}

// ---------- obsługa okna ----------
function pick(iso) {
  const el = cur.el;
  if (reasonOf(el, iso, ST.get(el).rule ? ST.get(el).cache.get(gridKey()) : null)) return;
  close();
  setFromPicker(el, iso);
}
function goMonth(ym, focus) {
  cur.month = ym;
  if (focus) cur.focus = focus;
  else if (cur.focus.slice(0, 7) !== ym) { const [y, m] = ym.split('-').map(Number); cur.focus = L.clamp(L.isoOf(y, m, Math.min(+cur.focus.slice(8) || 1, L.daysIn(y, m))), cur.el.min, cur.el.max); }
  render();
}
function popClick(ev) {
  if (!cur) return;
  const td = ev.target.closest('td[data-iso]');
  if (td) { pick(td.dataset.iso); return; }
  const b = ev.target.closest('[data-wa]');
  if (!b || b.disabled) return;
  const a = b.dataset.wa, v = b.dataset.v;
  const keep = cur.pop.contains(document.activeElement) ? `[data-wa="${a}"][data-v="${v}"]` : null;
  switch (a) {
    case 'm': goMonth(L.addMonths(`${cur.month}-01`, +v).slice(0, 7)); break;
    case 'y':
      if (cur.view === 'months') { cur.year += +v; render(); }
      else goMonth(L.addYears(`${cur.month}-01`, +v).slice(0, 7));
      break;
    case 'yp': cur.year += 12 * +v; render(); break;
    case 'months': cur.view = 'months'; cur.year = +cur.month.slice(0, 4); render(); break;
    case 'years': cur.view = 'years'; render(); break;
    case 'pickm': cur.view = 'days'; goMonth(`${cur.year}-${L.pad(+v)}`); focusActive(); return;
    case 'picky': cur.year = +v; cur.view = 'months'; render(); focusActive(); return;
    case 'today': { const d = today(); cur.month = d.slice(0, 7); pick(d); return; }
    case 'clear': { const el = cur.el; close(); setFromPicker(el, ''); return; }
    case 'done': close(); return;
    case 'pre': setTime(v); return;
    case 't': setTime(L.stepTime(curTime(), b.dataset.p, +v * (b.dataset.p === 'm' ? 5 : 1), { snap: b.dataset.p === 'm' })); return;
    default: return;
  }
  if (keep) (cur.pop.querySelector(keep) || null)?.focus({ preventScroll: true });
  place();
}
function popWheel(ev) {
  const n = ev.target.closest('[role="spinbutton"]');
  if (!n || !cur || !ev.deltaY) return;
  ev.preventDefault();
  const p = n.dataset.p, d = ev.deltaY < 0 ? 1 : -1;
  setTime(L.stepTime(curTime(), p, p === 'm' ? 5 * d : d, { snap: p === 'm' }));
}
function trap(ev) {
  const f = [...cur.pop.querySelectorAll('button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]')].filter((x) => x.getClientRects().length);
  if (!f.length) return;
  const i = f.indexOf(document.activeElement);
  ev.preventDefault();
  const n = ev.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === -1 || i === f.length - 1 ? 0 : i + 1);
  f[n].focus({ preventScroll: true });
}
function popKey(ev) {
  if (!cur) return;
  const k = ev.key, a = document.activeElement;
  const stop = () => { ev.preventDefault(); ev.stopPropagation(); };
  if (k === 'Escape') { stop(); if (cur.kind === 'date' && cur.view !== 'days') { cur.view = 'days'; render(); focusActive(); return; } close({ revert: true }); return; }
  if (k === 'Tab') { ev.stopPropagation(); trap(ev); return; }
  // komórka dnia
  if (a?.matches?.('td[data-iso]')) {
    if (k === 'Enter' || k === ' ') { stop(); pick(a.dataset.iso); return; }
    const to = L.moveKey(a.dataset.iso, k, { shift: ev.shiftKey });
    if (to) {
      stop();
      const iso = L.clamp(to, cur.el.min, cur.el.max);
      cur.focus = iso;
      if (iso.slice(0, 7) !== cur.month) { cur.month = iso.slice(0, 7); render(); }
      else { a.tabIndex = -1; const n = cur.pop.querySelector(`td[data-iso="${iso}"]`); n.tabIndex = 0; }
      cur.pop.querySelector(`td[data-iso="${iso}"]`)?.focus({ preventScroll: true });
      return;
    }
    return;
  }
  // szybki wybór miesiąca i roku: strzałki po siatce 3 × 4
  if (a?.classList?.contains('wd-cell')) {
    const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[k];
    if (d) {
      stop();
      const cells = [...cur.pop.querySelectorAll('.wd-cell')], i = cells.indexOf(a);
      const n = cells[Math.max(0, Math.min(cells.length - 1, i + d))];
      cells.forEach((c) => { c.tabIndex = c === n ? 0 : -1; });
      n.focus({ preventScroll: true });
    }
    return;
  }
  // godzina: pole obrotowe (spinbutton)
  if (a?.getAttribute?.('role') === 'spinbutton') {
    const p = a.dataset.p;
    if (k === 'ArrowUp' || k === 'ArrowDown') { stop(); setTime(L.stepTime(curTime(), p, (k === 'ArrowUp' ? 1 : -1) * (ev.shiftKey && p === 'm' ? 10 : 1))); return; }
    if (k === 'PageUp' || k === 'PageDown') { stop(); setTime(L.stepTime(curTime(), p, (k === 'PageUp' ? 1 : -1) * (p === 'm' ? 15 : 6))); return; }
    if (k === 'Home' || k === 'End') { stop(); const [h, m] = curTime().split(':'); const x = k === 'Home' ? '00' : p === 'h' ? '23' : '59'; setTime(p === 'h' ? `${x}:${m}` : `${h}:${x}`); return; }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { stop(); cur.pop.querySelector(`[role="spinbutton"][data-p="${k === 'ArrowLeft' ? 'h' : 'm'}"]`)?.focus(); return; }
    if (/^\d$/.test(k)) {
      stop();
      const now = performance.now();
      cur.tbuf = now - cur.tbufAt < 1200 && cur.tbuf.length === 1 && cur.tbufP === p ? cur.tbuf + k : k;
      cur.tbufAt = now; cur.tbufP = p;
      const n = Math.min(+cur.tbuf, p === 'h' ? 23 : 59), [h, m] = curTime().split(':');
      setTime(p === 'h' ? `${L.pad(n)}:${m}` : `${h}:${L.pad(n)}`);
      if (p === 'h' && cur.tbuf.length === 2) cur.pop.querySelector('[role="spinbutton"][data-p="m"]')?.focus();
      return;
    }
    if (k === 'Enter') { stop(); close(); return; }
    return;
  }
  if (k === 'Enter' && cur.kind === 'time' && !a?.matches?.('button')) { stop(); close(); }
}

if (HAS_DOM) {
  addEventListener('keydown', () => { viaKeys = true; }, true);
  addEventListener('pointerdown', () => { viaKeys = false; }, true);
  // kliknięcie poza oknem i polem zamyka okno (tło arkusza też: klik poza prostokątem okna)
  document.addEventListener('pointerdown', (ev) => {
    if (!cur) return;
    const r = cur.pop.getBoundingClientRect();
    const outsideRect = ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom;
    if (cur.pop.contains(ev.target) && !outsideRect) return;
    if (ST.get(cur.el).wrap.contains(ev.target)) return;
    close({ restore: false });
  }, true);
  addEventListener('resize', () => { if (cur && cur.sheet !== isSheet()) close({ restore: false }); else place(); });
  addEventListener('scroll', (ev) => { if (cur && !cur.pop.contains(ev.target)) place(); }, true);
}

// ---------- automatyczne podłączanie pól ----------
function scan(root) { if (root.matches?.('input[data-wd]')) upgrade(root); else root.querySelectorAll?.('input[data-wd]').forEach(upgrade); }
if (HAS_DOM && !globalThis.__wdObserver) {
  globalThis.__wdObserver = new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.tagName === 'INPUT' || n.firstElementChild)) scan(n);
    // pole zniknęło razem z oknem (np. przerysowanie Ustawień): bez martwych odwołań
    if (cur && !cur.el.isConnected) { const p = cur.pop; cur = null; p.remove(); }
  });
  globalThis.__wdObserver.observe(document.documentElement, { childList: true, subtree: true });
  scan(document);
}
export const isOpen = () => !!cur;
