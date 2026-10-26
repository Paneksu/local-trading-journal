// Wspólne elementy okien: pułapka fokusu, okno potwierdzenia, powiadomienie (toast).
import { esc } from './format.js';
import { t } from './i18n.js';

// Aktywne okno przechwytuje klawisze (Esc, Tab). Ustawia je okno przy otwarciu i zdejmuje przy zamknięciu.
export const overlay = { current: null };
// Tryb przewodnika (przewodnik.js): formularze zapisują tylko w pamięci, więc pokazują inny dopisek i komunikat.
export const guide = { on: false };

export const focusables = (root) => [...root.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
  .filter((e) => !e.closest('[hidden]') && e.getClientRects().length);

export function trapTab(ev, root) {
  if (ev.key !== 'Tab') return;
  const f = focusables(root);
  if (!f.length) { ev.preventDefault(); return; }
  const first = f[0], last = f[f.length - 1];
  if (ev.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { ev.preventDefault(); first.focus(); }
}

// Okno potwierdzenia. Zwraca Promise<boolean>.
export function confirmDialog({ title, text, ok = t('Potwierdź'), cancel = t('Anuluj'), danger = false }) {
  return new Promise((resolve) => {
    const prev = overlay.current;
    const opener = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'scrim';
    wrap.innerHTML = `<div class="modal sm" role="alertdialog" aria-modal="true" aria-labelledby="cd-t" aria-describedby="cd-d">
      <div class="mh"><h2 id="cd-t">${esc(title)}</h2></div>
      <div class="mb"><p id="cd-d" class="muted">${esc(text)}</p></div>
      <div class="mf"><span class="grow"></span><button type="button" class="btn ghost" data-cd="no">${esc(cancel)}</button><button type="button" class="btn primary${danger ? ' danger' : ''}" data-cd="yes">${esc(ok)}</button></div></div>`;
    document.body.appendChild(wrap);
    document.documentElement.classList.add('lb-lock');
    const dlg = wrap.firstElementChild;
    const done = (v) => {
      wrap.remove();
      overlay.current = prev;
      if (!prev) document.documentElement.classList.remove('lb-lock');
      if (opener && document.contains(opener)) opener.focus();
      resolve(v);
    };
    overlay.current = { onKey(ev) { if (ev.key === 'Escape') { ev.preventDefault(); done(false); } else trapTab(ev, dlg); } };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cd]');
      if (b) done(b.dataset.cd === 'yes');
      else if (e.target === wrap) done(false);
    });
    dlg.querySelector('[data-cd="no"]').focus();
  });
}

let toastTimer = 0;
export function toast(msg, { error = false } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.classList.toggle('err', error);
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, error ? 7000 : 4200);
}
