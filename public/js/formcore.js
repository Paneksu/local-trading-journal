// Wspólny silnik okna z formularzem (konta, wpisy finansowe): scrim, dialog, fokus, Esc, odrzucanie zmian,
// walidacja z komunikatami „jak naprawić”, zapis do lokalnego serwera z ochroną (X-THQ), konflikt 409.
// Konwencja pól: kontrolka ma id="f-<klucz>", komunikat <p class="ferr" id="e-<klucz>">, klucz zgodny z odpowiedzią serwera.
import { esc } from './format.js';
import { overlay, trapTab, toast, guide } from './modal.js';
import { t } from './i18n.js';

const ICON_CLOSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

let active = null;
export const formOpen = () => !!active;

/**
 * cfg: { title, bodyHtml, endpoint, method, collect(dlg) -> {payload, errs}, onMount(dlg), notionUrl, saveLabel,
 *        okMessage, reload(force), onStale(), afterSave(result, payload), onClosed(), opener }
 */
export function openFormModal(cfg) {
  if (active) return null;
  const opener = cfg.opener || document.activeElement;
  const root = document.createElement('div');
  root.className = 'scrim';
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="f-title" id="trade-form">
    <div class="mh"><h2 id="f-title">${esc(cfg.title)}</h2><button type="button" class="icon-btn" data-f-act="close" aria-label="${esc(t('Zamknij formularz'))}">${ICON_CLOSE}</button></div>
    <form class="mb" id="f-form" novalidate autocomplete="off"><div id="f-banner" class="banner" role="alert" hidden></div>${cfg.bodyHtml}</form>
    <div class="mf" id="f-foot"></div></div>`;
  document.body.appendChild(root);
  const dlg = root.firstElementChild;
  document.documentElement.classList.add('lb-lock');
  let saving = false, discarding = false, snapshot = '';
  const label = cfg.saveLabel || t('Zapisz w Notion');

  const foot = () => {
    if (discarding) {
      return `<span class="fmsg" role="alert">${esc(t('Masz niezapisane zmiany. Odrzucić je?'))}</span><span class="grow"></span><button type="button" class="btn ghost" data-f-act="keep">${esc(t('Wróć do formularza'))}</button><button type="button" class="btn" data-f-act="discard">${esc(t('Odrzuć zmiany'))}</button>`;
    }
    const left = guide.on ? `<span class="fmsg">${esc(t('Tryb przewodnika: zapis zostaje w pamięci przeglądarki, Notion bez zmian.'))}</span>` : cfg.notionUrl
      ? `<a class="fmsg link" href="${esc(cfg.notionUrl)}" target="_blank" rel="noopener">${esc(t('Otwórz w Notion (tam też usuniesz wpis)'))}</a>`
      : `<span class="fmsg">${esc(t('Zapis idzie wprost do Notion. Usuwanie zostaje w Notion.'))}</span>`;
    return `${left}<span class="grow"></span><button type="button" class="btn ghost" data-f-act="close">${esc(t('Anuluj'))}</button><button type="submit" form="f-form" class="btn primary" id="f-save">${esc(label)}</button>`;
  };
  const renderFoot = () => { dlg.querySelector('#f-foot').innerHTML = foot(); };

  const banner = (msg, action) => {
    const b = dlg.querySelector('#f-banner');
    b.hidden = !msg;
    b.innerHTML = msg ? `<span>${esc(msg)}</span>${action ? `<button type="button" class="btn sm" data-f-act="stale">${esc(action)}</button>` : ''}` : '';
    if (msg) b.scrollIntoView({ block: 'nearest' });
  };
  const clearErrors = () => {
    dlg.querySelectorAll('.ferr').forEach((e) => { e.hidden = true; e.textContent = ''; });
    dlg.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
    banner('');
  };
  const showErrors = (map) => {
    let first = null;
    for (const [k, msg] of Object.entries(map)) {
      const e = dlg.querySelector(`#e-${k}`);
      const ctl = dlg.querySelector(`#f-${k}`);
      if (e) { e.textContent = msg; e.hidden = false; }
      if (ctl) {
        ctl.setAttribute('aria-invalid', 'true');
        if (!first) first = ctl.matches('input,select,textarea,button') ? ctl : ctl.querySelector('button, input');
      }
    }
    if (first) first.focus();
  };
  const setSaving = (on) => {
    saving = on;
    const b = dlg.querySelector('#f-save');
    if (!b) return;
    b.disabled = on;
    b.textContent = on ? t('Zapisuję…') : label;
  };

  function closeNow() {
    root.remove();
    overlay.current = null;
    active = null;
    document.documentElement.classList.remove('lb-lock');
    if (opener && document.contains(opener)) opener.focus();
    cfg.onClosed?.();
  }
  function requestClose() {
    if (saving) return;
    if (!discarding && JSON.stringify(cfg.collect(dlg).payload) !== snapshot) { discarding = true; renderFoot(); dlg.querySelector('[data-f-act="keep"]').focus(); return; }
    closeNow();
  }

  async function save() {
    if (saving) return;
    clearErrors();
    const { payload, errs } = cfg.collect(dlg);
    if (Object.keys(errs).length) { showErrors(errs); banner(t('Popraw zaznaczone pola i spróbuj jeszcze raz.')); return; }
    setSaving(true);
    try {
      const res = await fetch(cfg.endpoint, { method: cfg.method, headers: { 'Content-Type': 'application/json', 'X-THQ': '1' }, body: JSON.stringify(payload) });
      let j = {};
      try { j = await res.json(); } catch { /* brak treści */ }
      if (res.ok) {
        closeNow();
        if (j.warning) toast(j.warning, { error: true }); else toast(guide.on ? t('Zapisano w pamięci (tryb przewodnika).') : cfg.okMessage || t('Zapisano w Notion.'));
        await cfg.reload?.(true);
        cfg.afterSave?.(j, payload);
        return;
      }
      if (res.status === 400 && j.fields && Object.keys(j.fields).length) { showErrors(j.fields); banner(j.error || t('Popraw zaznaczone pola.')); }
      else if (res.status === 409 && j.code === 'stale') banner(j.error, t('Wczytaj zmiany'));
      else banner(j.error || t('Nie udało się zapisać (błąd {status}).', { status: res.status }));
    } catch {
      banner(t('Nie mogę połączyć się z lokalnym serwerem. Dane są jeszcze w formularzu: uruchom dashboard ponownie i zapisz jeszcze raz.'));
    } finally {
      setSaving(false);
    }
  }

  function onKey(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); if (discarding) { discarding = false; renderFoot(); } else requestClose(); return; }
    trapTab(ev, dlg);
  }

  renderFoot();
  cfg.onMount?.(dlg);
  snapshot = JSON.stringify(cfg.collect(dlg).payload);
  overlay.current = { onKey };
  root.addEventListener('mousedown', (e) => { if (e.target === root) requestClose(); });
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-f-act]');
    if (!a) return;
    const act = a.dataset.fAct;
    if (act === 'close') requestClose();
    else if (act === 'keep') { discarding = false; renderFoot(); dlg.querySelector(cfg.initialFocus || 'input, select, button')?.focus(); }
    else if (act === 'discard') closeNow();
    else if (act === 'stale') { closeNow(); cfg.onStale?.(); }
  });
  dlg.querySelector('#f-form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
  active = { close: closeNow };
  (dlg.querySelector(cfg.initialFocus || 'input, select, button:not([data-f-act])'))?.focus();
  return { close: closeNow, dlg };
}
