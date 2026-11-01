// N2 (1.6.0): Ustawienia → Wygląd: język, paleta danych (gotowe palety, własna osobno dla Onyx i Platinum, kontrast, podgląd na żywo),
// wynik BE (marginesy) i nick do podpisu kart. Logika przeniesiona bez zmian z popovera 1.5.0 (zakładki Kolory, Wynik BE, Ogólne).
// BE stoi przy wyglądzie, bo to dwie krótkie grupy (decyzja gustu §5.3, alternatywa: „Wygląd i liczenie”).
import * as F from './format.js';
import { BE_DEFAULTS } from './stats.js';
import { PALETTES, THEMES, SWATCHES, SURFACES, normHex, ratioOn, fixContrast, defaultCustom, resolve } from './palety.js';
import { t, getLang } from './i18n.js';
import { sanitizeShare } from './udostepnij.js';
import { esc, L, THEME_NAME, ratioTxt, gHead, grp } from './ust-wspolne.js';

const NAMES = () => ({ profit: t('Zysk'), loss: t('Strata'), be: t('Remis (BE)') });
const PREVIEW = { profit: F.fmtR(1.25), loss: F.fmtR(-1.25), be: '0R' };
const fmtMargin = (x) => F.num(x, 2);

export function createWyglad(ctx) {
  const { settings } = ctx;
  // klucz wiersza z otwartym wyborem koloru
  let picker = null;
  const root = () => ctx.root();

  function previewHtml() {
    return `<div class="pv" aria-label="${L('Podgląd palety na żywo')}" role="group">
      <div class="pv-nums"><b class="pos">${F.fmtR(2.4)}</b><b class="neg">${F.fmtR(-1)}</b><b class="be">0R</b></div>
      <svg class="pv-chart" width="132" height="34" viewBox="0 0 132 34" aria-hidden="true"><rect class="col-pos" x="4" y="6" width="14" height="22" rx="3"/><rect class="col-neg" x="24" y="17" width="14" height="11" rx="3"/><rect class="col-be" x="44" y="26" width="14" height="2" rx="1"/>
        <line class="lp-stem" x1="82" x2="82" y1="28" y2="9" style="stroke:var(--profit)"/><circle cx="82" cy="9" r="4" style="fill:var(--profit)"/><line class="lp-stem" x1="100" x2="100" y1="28" y2="22" style="stroke:var(--loss)"/><circle cx="100" cy="22" r="4" style="fill:var(--loss)"/><line class="lp-stem" x1="118" x2="118" y1="28" y2="28" style="stroke:var(--be)"/><circle cx="118" cy="28" r="4" style="fill:var(--be)"/></svg></div>`;
  }
  function cardsHtml() {
    const th = ctx.getTheme();
    return `<div class="pcards" role="group" aria-label="${L('Gotowe palety')}">${PALETTES.map((p) => {
      const c = p.id === 'wlasna' ? resolve({ palette: 'wlasna', custom: settings.custom }, th) : p.colors[th];
      const on = settings.palette === p.id;
      return `<button type="button" class="pcard" data-act="palette" data-v="${p.id}" data-fk="pal-${p.id}" aria-pressed="${on}" aria-label="${esc(t('Paleta {name}: {hint}', { name: t(p.name), hint: t(p.hint) }))}">
        <span class="dots" aria-hidden="true"><i style="background:${c.profit}"></i><i style="background:${c.loss}"></i><i style="background:${c.be}"></i></span><span class="pn">${L(p.name)}</span></button>`;
    }).join('')}</div>`;
  }
  function ctHtml(k, r) {
    return r < 4.5
      ? `<span class="warnb">${esc(t('słaby kontrast {ratio}:1', { ratio: ratioTxt(r) }))}</span><button type="button" class="btn ghost sm" data-act="ct-fix" data-k="${k}" data-fk="fix-${k}">${L('Popraw')}</button>`
      : `<span class="okb">${esc(t('kontrast {ratio}:1', { ratio: ratioTxt(r) }))}</span>`;
  }
  function pickerHtml(k, hex) {
    const et = ctx.edit.theme, N = NAMES();
    return `<div class="cr-pick" role="group" aria-label="${esc(t('Wybór koloru: {name}', { name: N[k] }))}">
      <div class="swgrid">${SWATCHES[et].map((c) => `<button type="button" class="sw${c === hex ? ' on' : ''}" data-act="sw-pick" data-k="${k}" data-v="${c}" data-fk="g-${k}-${c}" style="--c:${c}" aria-label="${esc(t('Kolor {hex}', { hex: c }))}" aria-pressed="${c === hex}"></button>`).join('')}</div>
      <div class="hexrow"><label class="lbl" for="hex-${k}">HEX</label><input id="hex-${k}" class="sp-in hexin" data-k="${k}" type="text" maxlength="7" value="${hex}" spellcheck="false" autocomplete="off" aria-describedby="hexe-${k}"><button type="button" class="btn sm" data-act="sw-any" data-k="${k}" data-fk="any-${k}">${L('Dowolny…')}</button>
        <input class="anycolor" data-k="${k}" type="color" value="${hex}" tabindex="-1" aria-label="${esc(t('Dowolny kolor: {name}', { name: N[k] }))}"></div>
      <p class="ferr" id="hexe-${k}" hidden>${L('Wpisz kolor w formacie #RRGGBB.')}</p></div>`;
  }
  function rowHtml(k) {
    const et = ctx.edit.theme, N = NAMES();
    const hex = settings.custom[et][k];
    const r = ratioOn(hex, et);
    const surf = SURFACES[et];
    const open = picker === k;
    return `<div class="cr" data-k="${k}"><span class="lbl cr-l" id="cr-l-${k}">${N[k]}</span>
      <button type="button" class="cr-sw" data-act="sw-open" data-k="${k}" data-fk="sw-${k}" aria-expanded="${open}" aria-label="${esc(t('{name}: kolor {hex}. Wybierz kolor', { name: N[k], hex }))}" style="--c:${hex}"></button>
      <span class="cr-pv" style="color:${hex};background:${surf.float}">${PREVIEW[k]}</span>
      <span class="cr-hex mono">${hex}</span>
      <span class="cr-ct${r < 4.5 ? ' weak' : ''}" data-ct="${k}">${ctHtml(k, r)}</span>
      ${open ? pickerHtml(k, hex) : ''}</div>`;
  }
  function customHtml() {
    if (settings.palette !== 'wlasna') return '';
    return `<div class="cust"><div class="cust-h"><span class="lbl" id="cust-t">${L('Własna paleta dla motywu')}</span>
      <div class="seg sm" role="group" aria-labelledby="cust-t">${THEMES.map((th) => `<button type="button" data-act="pal-edit-theme" data-v="${th}" data-fk="et-${th}" aria-pressed="${ctx.edit.theme === th}">${THEME_NAME[th]}</button>`).join('')}</div></div>
      <p class="note">${L('Każdy motyw ma osobne kolory. Zmiana w jednym nie rusza drugiego. Kontrast liczony względem karty i kafla tego motywu.')}</p>
      ${['profit', 'loss', 'be'].map(rowHtml).join('')}</div>`;
  }
  function langHtml() {
    const lang = getLang();
    return `<div class="sp-f"><span class="lbl" id="sp-lang">${L('Język')}</span>
      <div class="seg full" role="group" aria-labelledby="sp-lang"><button type="button" data-act="sp-lang" data-v="pl" data-fk="lang-pl" aria-pressed="${lang === 'pl'}" lang="pl">Polski</button><button type="button" data-act="sp-lang" data-v="en" data-fk="lang-en" aria-pressed="${lang === 'en'}" lang="en">English</button></div>
      <p class="note">${L('Język interfejsu. Nazwy baz i pól w Notion zostają bez zmian.')}</p></div>`;
  }
  function nickHtml() {
    return `<div class="sp-f"><label class="lbl" for="sp-nick">${L('Nick do podpisu')}</label>
      <input id="sp-nick" class="sp-in sp-nick" type="text" maxlength="40" value="${esc(settings.share?.nick || '')}" placeholder="JustJournal" autocomplete="off" spellcheck="false" aria-describedby="sp-nick-d">
      <p class="note" id="sp-nick-d">${L('Podpis na kartach z okna Udostępnij: „JustJournal × nick”. Puste pole oznacza sam podpis JustJournal.')}</p></div>`;
  }
  function daneHtml() {
    return `${previewHtml()}<span class="lbl" id="sp-pal">${L('Paleta danych')}</span>${cardsHtml()}<div id="cust">${customHtml()}</div>
      <div class="sp-reset"><button type="button" class="btn ghost sm" data-act="pal-reset" data-fk="pal-reset">${L('Przywróć domyślne (Kolor)')}</button></div>
      <p class="note sp-foot">${L('Palety zmieniają kolor liczb, wykresów, heatmapy, kalendarza, rozkładu R, lizaków i plakietek Win / Loss / BE. Kolory serii wykresów zostają.')}</p>`;
  }
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
    return grp(`${gHead('sv-wyglad-lang', 'Język i podpis')}${langHtml()}<div class="rule-x"></div>${nickHtml()}`, 'jezyk')
      + grp(`${gHead('sv-wyglad-pal', 'Kolory danych')}${daneHtml()}`, 'kolory')
      + grp(`${gHead('sv-wyglad-be', 'Wynik BE')}${beHtml()}`, 'be');
  }

  // ---------- zmiany kolorów ----------
  function setColor(k, hex) {
    const et = ctx.edit.theme;
    settings.custom[et][k] = hex;
    settings.palette = 'wlasna';
    ctx.save();
    if (et === ctx.getTheme()) ctx.opts.applyAll();
  }
  function refreshRow(k) {
    const row = root()?.querySelector(`.cr[data-k="${k}"]`);
    if (!row) return;
    const et = ctx.edit.theme, N = NAMES();
    const hex = settings.custom[et][k];
    const r = ratioOn(hex, et);
    row.querySelector('.cr-sw').style.setProperty('--c', hex);
    row.querySelector('.cr-sw').setAttribute('aria-label', t('{name}: kolor {hex}. Wybierz kolor', { name: N[k], hex }));
    row.querySelector('.cr-pv').style.color = hex;
    row.querySelector('.cr-hex').textContent = hex;
    const ct = row.querySelector('.cr-ct');
    ct.classList.toggle('weak', r < 4.5);
    ct.innerHTML = ctHtml(k, r);
    row.querySelectorAll('.sw').forEach((b) => { const on = b.dataset.v === hex; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    const anyI = row.querySelector('.anycolor'); if (anyI) anyI.value = hex;
    // karty gotowych palet: kropki „Własnej” zależą od kolorów
    const cust = root().querySelector('[data-act="palette"][data-v="wlasna"] .dots');
    if (cust && et === ctx.getTheme()) { const c = settings.custom[ctx.getTheme()]; const d = cust.querySelectorAll('i'); d[0].style.background = c.profit; d[1].style.background = c.loss; d[2].style.background = c.be; }
  }
  function refreshCards() {
    const cards = root()?.querySelector('.pcards');
    if (cards) { const fk = document.activeElement?.dataset?.fk; cards.outerHTML = cardsHtml(); if (fk) root().querySelector(`[data-fk="${fk}"]`)?.focus(); }
  }

  function handle(act, v, el) {
    switch (act) {
      case 'palette': {
        if (v === 'wlasna' && !settings.customSeeded) {
          // pierwsze wejście w „Własną”: zaczynamy od kolorów aktualnie używanej palety
          const cur = { palette: settings.palette, custom: settings.custom };
          settings.custom = { onyx: { ...resolve(cur, 'onyx') }, platinum: { ...resolve(cur, 'platinum') } };
          for (const th of THEMES) delete settings.custom[th].cellmix;
          settings.customSeeded = true;
        }
        settings.palette = v;
        ctx.edit.theme = ctx.getTheme();
        picker = null;
        ctx.save(); ctx.opts.applyAll(); ctx.rerender();
        return true;
      }
      case 'pal-edit-theme': ctx.edit.theme = v; picker = null; ctx.rerender(); return true;
      case 'sp-lang': if (v !== getLang()) ctx.opts.onConfig({ lang: v }); return true;
      case 'sw-open': { const k = el.dataset.k; picker = picker === k ? null : k; ctx.rerender(); if (picker) (root().querySelector(`[data-fk="g-${k}-${settings.custom[ctx.edit.theme][k]}"]`) || root().querySelector(`#hex-${k}`))?.focus(); return true; }
      case 'sw-pick': setColor(el.dataset.k, el.dataset.v); refreshRow(el.dataset.k); refreshCards(); return true;
      case 'sw-any': { const i = root().querySelector(`.anycolor[data-k="${el.dataset.k}"]`); if (i.showPicker) { try { i.showPicker(); } catch { i.click(); } } else i.click(); return true; }
      case 'ct-fix': { const k = el.dataset.k; setColor(k, fixContrast(settings.custom[ctx.edit.theme][k], ctx.edit.theme)); ctx.rerender(); return true; }
      case 'pal-reset': settings.palette = 'color'; settings.custom = defaultCustom(); settings.customSeeded = false; picker = null; ctx.save(); ctx.opts.applyAll(); ctx.rerender(); return true;
      case 'be-reset': { const inp = root().querySelector(v === 'beR' ? '#be-r' : '#be-usd'); inp.value = BE_DEFAULTS[v]; ctx.opts.onBe(v, inp.value); inp.focus(); return true; }
      default: return false;
    }
  }
  function onInput(ev) {
    const el = ev.target;
    if (el.matches('#be-r')) { ctx.opts.onBe('beR', el.value); return true; }
    if (el.matches('#be-usd')) { ctx.opts.onBe('beUsd', el.value); return true; }
    if (el.matches('#sp-nick')) { settings.share = settings.share || sanitizeShare(); settings.share.nick = sanitizeShare({ nick: el.value }).nick; ctx.save(); return true; }
    if (el.matches('.hexin:not(.cc-h)')) {
      const k = el.dataset.k, hex = normHex(el.value);
      const err = root().querySelector(`#hexe-${k}`);
      el.setAttribute('aria-invalid', String(!hex));
      err.hidden = !!hex;
      if (hex) { setColor(k, hex); refreshRow(k); refreshCards(); }
      return true;
    }
    if (el.matches('.anycolor')) {
      const k = el.dataset.k, hex = normHex(el.value);
      if (hex) { setColor(k, hex); refreshRow(k); const h = root().querySelector(`#hex-${k}`); if (h) { h.value = hex; h.removeAttribute('aria-invalid'); root().querySelector(`#hexe-${k}`).hidden = true; } refreshCards(); }
      return true;
    }
    return false;
  }
  // Esc najpierw zamyka wybór koloru, potem cały widok (ustawienia.js)
  function onEscape() {
    if (!picker) return false;
    const k = picker; picker = null; ctx.rerender({ keep: false }); root().querySelector(`[data-fk="sw-${k}"]`)?.focus();
    return true;
  }
  return { id: 'wyglad', html, handle, onInput, onChange: () => false, onEscape, leave() { picker = null; } };
}
