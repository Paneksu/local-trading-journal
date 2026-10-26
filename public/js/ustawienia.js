// Popover Ustawień (koło zębate): zakładka „Kolory danych” (gotowe palety, własna paleta osobno dla Onyx i Platinum, kontrast, podgląd na żywo)
// oraz „Wynik BE” (marginesy). Układ w dwóch zakładkach zamiast jednej długiej kolumny: popover mieści się przy 1080 px bez przewijania
// okna, a sekcja własnych kolorów rozwija się tylko wtedy, gdy jest potrzebna.
import * as F from './format.js';
import { BE_DEFAULTS } from './stats.js';
import { PALETTES, THEMES, SWATCHES, SURFACES, normHex, ratioOn, fixContrast, defaultCustom, resolve } from './palety.js';
import { t, getLang } from './i18n.js';

const { esc } = F;
const L = (s) => esc(t(s));
const NAMES = { profit: t('Zysk'), loss: t('Strata'), be: t('Remis (BE)') };
const PREVIEW = { profit: F.fmtR(1.25), loss: F.fmtR(-1.25), be: '0R' };
const THEME_NAME = { onyx: 'Onyx', platinum: 'Platinum' };
const fmtMargin = (x) => F.num(x, 2);
const ratioTxt = (r) => F.num(Math.floor(r * 10) / 10, 1);
const svgI = (body, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// getMeta(): { lang, version, updateCheck } z serwera; onConfig(patch): zapis do config.local.json (język, sprawdzanie aktualizacji)
// updateHtml(): sekcja „Aktualizacje” z modułu aktualizacja.js (wersja, stan, „Sprawdź teraz”, przycisk okna aktualizacji)
export function createSettings({ settings, save, getTheme, applyAll, onBe, getMeta = () => ({}), onConfig = async () => {}, updateHtml = () => '' }) {
  let pop = null, scrim = null;
  let tab = 'dane';
  let editTheme = getTheme();
  let picker = null; // klucz wiersza z otwartym wyborem koloru
  const isSheet = () => window.matchMedia('(max-width: 1023px)').matches;
  const gear = () => document.getElementById('gear');
  const body = () => pop?.querySelector('#sp-body');

  // ---------- zakładka: kolory danych ----------
  function previewHtml() {
    return `<div class="pv" aria-label="${L('Podgląd palety na żywo')}" role="group">
      <div class="pv-nums"><b class="pos">${F.fmtR(2.4)}</b><b class="neg">${F.fmtR(-1)}</b><b class="be">0R</b></div>
      <svg class="pv-chart" width="132" height="34" viewBox="0 0 132 34" aria-hidden="true"><rect class="col-pos" x="4" y="6" width="14" height="22" rx="3"/><rect class="col-neg" x="24" y="17" width="14" height="11" rx="3"/><rect class="col-be" x="44" y="26" width="14" height="2" rx="1"/>
        <line class="lp-stem" x1="82" x2="82" y1="28" y2="9" style="stroke:var(--profit)"/><circle cx="82" cy="9" r="4" style="fill:var(--profit)"/><line class="lp-stem" x1="100" x2="100" y1="28" y2="22" style="stroke:var(--loss)"/><circle cx="100" cy="22" r="4" style="fill:var(--loss)"/><line class="lp-stem" x1="118" x2="118" y1="28" y2="28" style="stroke:var(--be)"/><circle cx="118" cy="28" r="4" style="fill:var(--be)"/></svg></div>`;
  }
  function cardsHtml() {
    const th = getTheme();
    return `<div class="pcards" role="group" aria-label="${L('Gotowe palety')}">${PALETTES.map((p) => {
      const c = p.id === 'wlasna' ? resolve({ palette: 'wlasna', custom: settings.custom }, th) : p.colors[th];
      const on = settings.palette === p.id;
      return `<button type="button" class="pcard" data-act="palette" data-v="${p.id}" data-fk="pal-${p.id}" aria-pressed="${on}" aria-label="${esc(t('Paleta {name}: {hint}', { name: t(p.name), hint: t(p.hint) }))}">
        <span class="dots" aria-hidden="true"><i style="background:${c.profit}"></i><i style="background:${c.loss}"></i><i style="background:${c.be}"></i></span><span class="pn">${L(p.name)}</span></button>`;
    }).join('')}</div>`;
  }
  function rowHtml(k) {
    const hex = settings.custom[editTheme][k];
    const r = ratioOn(hex, editTheme);
    const weak = r < 4.5;
    const surf = SURFACES[editTheme];
    const open = picker === k;
    return `<div class="cr" data-k="${k}"><span class="lbl cr-l" id="cr-l-${k}">${NAMES[k]}</span>
      <button type="button" class="cr-sw" data-act="sw-open" data-k="${k}" data-fk="sw-${k}" aria-expanded="${open}" aria-label="${esc(t('{name}: kolor {hex}. Wybierz kolor', { name: NAMES[k], hex }))}" style="--c:${hex}"></button>
      <span class="cr-pv" style="color:${hex};background:${surf.float}">${PREVIEW[k]}</span>
      <span class="cr-hex mono">${hex}</span>
      <span class="cr-ct${weak ? ' weak' : ''}" data-ct="${k}">${ctHtml(k, r)}</span>
      ${open ? pickerHtml(k, hex) : ''}</div>`;
  }
  function ctHtml(k, r) {
    return r < 4.5
      ? `<span class="warnb">${esc(t('słaby kontrast {ratio}:1', { ratio: ratioTxt(r) }))}</span><button type="button" class="btn ghost sm" data-act="ct-fix" data-k="${k}" data-fk="fix-${k}">${L('Popraw')}</button>`
      : `<span class="okb">${esc(t('kontrast {ratio}:1', { ratio: ratioTxt(r) }))}</span>`;
  }
  function pickerHtml(k, hex) {
    return `<div class="cr-pick" role="group" aria-label="${esc(t('Wybór koloru: {name}', { name: NAMES[k] }))}">
      <div class="swgrid">${SWATCHES[editTheme].map((c) => `<button type="button" class="sw${c === hex ? ' on' : ''}" data-act="sw-pick" data-k="${k}" data-v="${c}" data-fk="g-${k}-${c}" style="--c:${c}" aria-label="${esc(t('Kolor {hex}', { hex: c }))}" aria-pressed="${c === hex}"></button>`).join('')}</div>
      <div class="hexrow"><label class="lbl" for="hex-${k}">HEX</label><input id="hex-${k}" class="sp-in hexin" data-k="${k}" type="text" maxlength="7" value="${hex}" spellcheck="false" autocomplete="off" aria-describedby="hexe-${k}"><button type="button" class="btn sm" data-act="sw-any" data-k="${k}" data-fk="any-${k}">${L('Dowolny…')}</button>
        <input class="anycolor" data-k="${k}" type="color" value="${hex}" tabindex="-1" aria-label="${esc(t('Dowolny kolor: {name}', { name: NAMES[k] }))}"></div>
      <p class="ferr" id="hexe-${k}" hidden>${L('Wpisz kolor w formacie #RRGGBB.')}</p></div>`;
  }
  function customHtml() {
    if (settings.palette !== 'wlasna') return '';
    return `<div class="cust"><div class="cust-h"><span class="lbl" id="cust-t">${L('Własna paleta dla motywu')}</span>
      <div class="seg sm" role="group" aria-labelledby="cust-t">${THEMES.map((th) => `<button type="button" data-act="pal-edit-theme" data-v="${th}" data-fk="et-${th}" aria-pressed="${editTheme === th}">${THEME_NAME[th]}</button>`).join('')}</div></div>
      <p class="note">${L('Każdy motyw ma osobne kolory. Zmiana w jednym nie rusza drugiego. Kontrast liczony względem karty i kafla tego motywu.')}</p>
      ${['profit', 'loss', 'be'].map(rowHtml).join('')}</div>`;
  }
  function daneHtml() {
    return `${previewHtml()}<span class="lbl" id="sp-pal">${L('Paleta danych')}</span>${cardsHtml()}<div id="cust">${customHtml()}</div>
      <div class="sp-reset"><button type="button" class="btn ghost sm" data-act="pal-reset" data-fk="pal-reset">${L('Przywróć domyślne (Kolor)')}</button></div>
      <p class="note sp-foot">${L('Palety zmieniają kolor liczb, wykresów, heatmapy, kalendarza, rozkładu R, lizaków i plakietek Win / Loss / BE. Kolory serii wykresów zostają.')}</p>`;
  }

  // ---------- zakładka: ogólne (język, aktualizacje, wersja) ----------
  function ogolneHtml() {
    const m = getMeta() || {};
    const lang = getLang();
    const upd = m.updateCheck !== false;
    return `<div class="sp-f"><span class="lbl" id="sp-lang">${L('Język')}</span>
      <div class="seg full" role="group" aria-labelledby="sp-lang"><button type="button" data-act="sp-lang" data-v="pl" data-fk="lang-pl" aria-pressed="${lang === 'pl'}" lang="pl">Polski</button><button type="button" data-act="sp-lang" data-v="en" data-fk="lang-en" aria-pressed="${lang === 'en'}" lang="en">English</button></div>
      <p class="note">${L('Język interfejsu. Nazwy baz i pól w Notion zostają bez zmian.')}</p></div>
    <div class="rule-x"></div>
    <div class="sp-f"><label class="check"><input type="checkbox" data-act="sp-upd" data-fk="upd" ${upd ? 'checked' : ''}> ${L('Sprawdzaj aktualizacje')}</label>
      <p class="note">${L('Raz na dobę serwer pyta publiczne API GitHub o najnowsze wydanie. To jedyne połączenie poza Notion; nie wysyła żadnych danych.')}</p></div>
    ${updateHtml()}
    <div class="rule-x"></div>
    <p class="note sp-foot">${m.installedSchema != null ? esc(t('schemat baz {v}', { v: m.installedSchema })) : ''}</p>`;
  }

  // ---------- zakładka: wynik BE ----------
  function beHtml() {
    return `<div class="sp-f"><label class="lbl" for="be-r">${L('Margines BE (R)')}</label>
      <input id="be-r" class="sp-in" type="number" inputmode="decimal" min="0" max="0.5" step="0.05" value="${settings.beR}" aria-describedby="be-r-d">
      <p class="note" id="be-r-d">${L('Trade z wynikiem w granicach ±tego marginesu liczy się jako BE. Rekomendacja 0,1R: koszty, spread i poślizg przy wyjściu na BE mieszczą się zwykle w tym zakresie.')}</p>
      <button type="button" class="btn ghost sm" data-act="be-reset" data-v="beR">${esc(t('Przywróć rekomendowane ({v})', { v: fmtMargin(BE_DEFAULTS.beR) + 'R' }))}</button></div>
    <div class="rule-x"></div>
    <div class="sp-f"><label class="lbl" for="be-usd">${L('Margines BE ($)')}</label>
      <input id="be-usd" class="sp-in" type="number" inputmode="decimal" min="0" max="100000" step="1" value="${settings.beUsd}" aria-describedby="be-usd-d">
      <p class="note" id="be-usd-d">${L('Działa tylko dla wpisów bez R. 0 wyłącza go (rekomendowane, bo bez R nie znamy ryzyka).')}</p>
      <button type="button" class="btn ghost sm" data-act="be-reset" data-v="beUsd">${esc(t('Przywróć rekomendowane ({v})', { v: F.fmtMoney(BE_DEFAULTS.beUsd, { plus: false }) }))}</button></div>
    <p class="note sp-foot">${L('Zmiana przelicza widok od razu. Sumy R i $, profit factor i krzywa zostają na surowych wartościach.')}</p>`;
  }

  function html() {
    const tabBtn = (v, label) => `<button type="button" role="tab" data-act="sp-tab" data-v="${v}" data-fk="tab-${v}" aria-selected="${tab === v}">${L(label)}</button>`;
    return `<div class="sp-h"><h2 id="sp-t">${L('Ustawienia')}</h2><button type="button" class="icon-btn" data-act="settings" aria-label="${L('Zamknij ustawienia')}">${svgI('<path d="M6 6l12 12M18 6 6 18"/>')}</button></div>
      <div class="seg full sp-tabs" role="tablist" aria-label="${L('Sekcje ustawień')}">${tabBtn('dane', 'Dane · kolory')}${tabBtn('be', 'Wynik BE')}${tabBtn('ogolne', 'Ogólne')}</div>
      <div id="sp-body" role="tabpanel">${tab === 'dane' ? daneHtml() : tab === 'be' ? beHtml() : ogolneHtml()}</div>`;
  }

  // odświeża zawartość, zachowując fokus (po kluczu data-fk)
  function rerender({ keep = true } = {}) {
    if (!pop) return;
    const fk = keep ? document.activeElement?.dataset?.fk : null;
    pop.innerHTML = html();
    if (fk) pop.querySelector(`[data-fk="${fk}"]`)?.focus();
  }

  // ---------- otwieranie i zamykanie ----------
  function open() {
    if (pop) return;
    editTheme = getTheme();
    tab = 'dane';
    picker = null;
    pop = document.createElement('div');
    pop.className = 'sp';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-labelledby', 'sp-t');
    pop.innerHTML = html();
    scrim = document.createElement('div');
    scrim.className = 'rp-scrim';
    scrim.addEventListener('click', () => close());
    document.body.append(scrim, pop);
    gear().setAttribute('aria-expanded', 'true');
    pop.querySelector('[data-fk="tab-dane"]').focus();
  }
  function close({ restore = true } = {}) {
    if (!pop) return;
    pop.remove(); scrim.remove();
    pop = null; scrim = null; picker = null;
    gear().setAttribute('aria-expanded', 'false');
    if (restore) gear().focus();
  }
  const toggle = () => (pop ? close() : open());

  // ---------- zmiany kolorów ----------
  function setColor(k, hex) {
    settings.custom[editTheme][k] = hex;
    settings.palette = 'wlasna';
    save();
    if (editTheme === getTheme()) applyAll();
  }
  function refreshRow(k) {
    const row = pop?.querySelector(`.cr[data-k="${k}"]`);
    if (!row) return;
    const hex = settings.custom[editTheme][k];
    const r = ratioOn(hex, editTheme);
    row.querySelector('.cr-sw').style.setProperty('--c', hex);
    row.querySelector('.cr-sw').setAttribute('aria-label', t('{name}: kolor {hex}. Wybierz kolor', { name: NAMES[k], hex }));
    row.querySelector('.cr-pv').style.color = hex;
    row.querySelector('.cr-hex').textContent = hex;
    const ct = row.querySelector('.cr-ct');
    ct.classList.toggle('weak', r < 4.5);
    ct.innerHTML = ctHtml(k, r);
    row.querySelectorAll('.sw').forEach((b) => { const on = b.dataset.v === hex; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    const anyI = row.querySelector('.anycolor'); if (anyI) anyI.value = hex;
    // karty gotowych palet: kropki „Własnej” zależą od kolorów
    const cust = pop.querySelector('[data-act="palette"][data-v="wlasna"] .dots');
    if (cust && editTheme === getTheme()) { const c = settings.custom[getTheme()]; const d = cust.querySelectorAll('i'); d[0].style.background = c.profit; d[1].style.background = c.loss; d[2].style.background = c.be; }
  }

  function handle(act, v, el) {
    switch (act) {
      case 'settings': toggle(); return true;
      case 'sp-tab': tab = v; picker = null; rerender(); return true;
      case 'palette': {
        if (v === 'wlasna' && !settings.customSeeded) {
          // pierwsze wejście w „Własną”: zaczynamy od kolorów aktualnie używanej palety
          const cur = { palette: settings.palette, custom: settings.custom };
          settings.custom = { onyx: { ...resolve(cur, 'onyx') }, platinum: { ...resolve(cur, 'platinum') } };
          for (const t of THEMES) delete settings.custom[t].cellmix;
          settings.customSeeded = true;
        }
        settings.palette = v;
        editTheme = getTheme();
        picker = null;
        save(); applyAll(); rerender();
        return true;
      }
      case 'pal-edit-theme': editTheme = v; picker = null; rerender(); return true;
      case 'sp-lang': if (v !== getLang()) onConfig({ lang: v }); return true;
      case 'sw-open': { const k = el.dataset.k; picker = picker === k ? null : k; rerender(); if (picker) (pop.querySelector(`[data-fk="g-${k}-${settings.custom[editTheme][k]}"]`) || pop.querySelector(`#hex-${k}`))?.focus(); return true; }
      case 'sw-pick': setColor(el.dataset.k, el.dataset.v); refreshRow(el.dataset.k); refreshCards(); return true;
      case 'sw-any': { const i = pop.querySelector(`.anycolor[data-k="${el.dataset.k}"]`); if (i.showPicker) { try { i.showPicker(); } catch { i.click(); } } else i.click(); return true; }
      case 'ct-fix': { const k = el.dataset.k; setColor(k, fixContrast(settings.custom[editTheme][k], editTheme)); rerender(); return true; }
      case 'pal-reset': settings.palette = 'color'; settings.custom = defaultCustom(); settings.customSeeded = false; picker = null; save(); applyAll(); rerender(); return true;
      case 'be-reset': { const inp = pop.querySelector(v === 'beR' ? '#be-r' : '#be-usd'); inp.value = BE_DEFAULTS[v]; onBe(v, inp.value); inp.focus(); return true; }
      default: return false;
    }
  }
  function refreshCards() {
    if (!pop) return;
    const cards = pop.querySelector('.pcards');
    if (cards) { const fk = document.activeElement?.dataset?.fk; cards.outerHTML = cardsHtml(); if (fk) pop.querySelector(`[data-fk="${fk}"]`)?.focus(); }
  }

  function onInput(ev) {
    const el = ev.target;
    if (el.matches('#be-r')) { onBe('beR', el.value); return true; }
    if (el.matches('#be-usd')) { onBe('beUsd', el.value); return true; }
    if (el.matches('.hexin')) {
      const k = el.dataset.k, hex = normHex(el.value);
      const err = pop.querySelector(`#hexe-${k}`);
      el.setAttribute('aria-invalid', String(!hex));
      err.hidden = !!hex;
      if (hex) { setColor(k, hex); refreshRow(k); refreshCards(); }
      return true;
    }
    if (el.matches('.anycolor')) {
      const k = el.dataset.k, hex = normHex(el.value);
      if (hex) { setColor(k, hex); refreshRow(k); const h = pop.querySelector(`#hex-${k}`); if (h) { h.value = hex; h.removeAttribute('aria-invalid'); pop.querySelector(`#hexe-${k}`).hidden = true; } refreshCards(); }
      return true;
    }
    return false;
  }

  // Esc najpierw zamyka wybór koloru, potem cały popover
  function onKey(ev) {
    if (!pop) return false;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      if (picker) { const k = picker; picker = null; rerender({ keep: false }); pop.querySelector(`[data-fk="sw-${k}"]`)?.focus(); } else close();
      return true;
    }
    if (ev.key === 'Tab') {
      const f = [...pop.querySelectorAll('button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), a[href]')].filter((e) => e.getClientRects().length);
      if (!f.length) return false;
      const first = f[0], last = f[f.length - 1];
      if (isSheet()) {
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); return true; }
        if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); return true; }
      }
    }
    return false;
  }
  function onPointerDown(ev) {
    if (pop && !pop.contains(ev.target) && !ev.target.closest('#gear') && !ev.target.closest('.rp-scrim')) close({ restore: false });
  }
  // checkbox „Sprawdzaj aktualizacje” (zdarzenie change)
  function onChange(ev) {
    if (!pop || !ev.target.matches('[data-act="sp-upd"]')) return false;
    onConfig({ updateCheck: ev.target.checked });
    return true;
  }
  return { toggle, handle, onInput, onChange, onKey, onPointerDown, isOpen: () => !!pop, rerender, refreshTheme() { editTheme = getTheme(); if (pop) rerender(); } };
}
