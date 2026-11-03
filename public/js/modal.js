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

// Twarde spacje po pojedynczych literach (a, i, o, u, w, z) i w „na stałe”: żadna nie zostaje sama na końcu linii (przegląd wyglądu, runda 3). Tylko warstwa wyświetlania.
const NBSP = String.fromCharCode(160);
export const nb = (s) => String(s ?? '').replace(/(^|[ „(])([aAiIoOuUwWzZ]) /g, '$1$2' + NBSP).replace(/na stałe/g, 'na' + NBSP + 'stałe');

// Okno potwierdzenia. Zwraca Promise<boolean>.
// note: dodatkowy akapit ostrzeżenia (tekst), extra: { label, run(btn, noteEl) } = przycisk obok „Anuluj”, który nie zamyka okna (np. „Najpierw wyślij do Notion”).
export function confirmDialog({ title, text, ok = t('Potwierdź'), cancel = t('Anuluj'), danger = false, note = '', extra = null }) {
  return new Promise((resolve) => {
    const prev = overlay.current;
    const opener = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'scrim';
    wrap.innerHTML = `<div class="modal sm" role="alertdialog" aria-modal="true" aria-labelledby="cd-t" aria-describedby="cd-d">
      <div class="mh"><h2 id="cd-t">${esc(nb(title))}</h2></div>
      <div class="mb"><p id="cd-d" class="muted">${esc(nb(text))}</p>${note ? `<p class="cd-note" role="alert">${esc(nb(note))}</p>` : ''}</div>
      <div class="mf">${extra ? `<button type="button" class="btn" data-cd="extra">${esc(extra.label)}</button>` : ''}<span class="grow"></span><button type="button" class="btn ghost" data-cd="no">${esc(cancel)}</button><button type="button" class="btn primary${danger ? ' danger' : ''}" data-cd="yes">${esc(ok)}</button></div></div>`;
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
      if (b && b.dataset.cd === 'extra') { if (!b.disabled) Promise.resolve(extra.run(b, dlg.querySelector('.cd-note'))).catch(() => {}); return; }
      if (b) done(b.dataset.cd === 'yes');
      else if (e.target === wrap) done(false);
    });
    dlg.querySelector('[data-cd="no"]').focus();
  });
}

let toastTimer = 0;
// Decyzja sesji głównej 2026-11-02 (poprawki po przeglądach usuwania trade'ów, wspólne dla usuwania sesji, trade'ów w backteście i w dzienniku):
// powiadomienie z akcją NIE przejmuje fokusu (Spacja replayu nie może wcisnąć „Cofnij”), przycisk jest normalnie w kolejności Tab, a póki powiadomienie jest widoczne,
// Ctrl+Z (Cmd+Z na Macu) cofa, ale nie w polach tekstowych i nie nad otwartym oknem pytania. Licznik stoi tylko, gdy mysz jest nad powiadomieniem albo użytkownik sam
// przeszedł na nie Tabem.
let toastUndo = null;
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
function hideToast() {
  const el = typeof document !== 'undefined' ? document.getElementById('toast') : null;
  clearTimeout(toastTimer);
  toastUndo = null;
  if (el) el.hidden = true;
}
if (typeof window !== 'undefined') {
  // przechwytywanie na oknie, zarejestrowane przy ładowaniu modułu, czyli przed skrótami replayu i edytora rysunków (Ctrl+Z cofa wtedy usunięcie, nie rysunek)
  window.addEventListener('keydown', (ev) => {
    if (!toastUndo || overlay.current) return;
    if (!(ev.ctrlKey || ev.metaKey) || ev.shiftKey || ev.altKey || String(ev.key).toLowerCase() !== 'z') return;
    const tg = ev.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
    const run = toastUndo;
    ev.preventDefault(); ev.stopImmediatePropagation();
    run();
  }, true);
}
// action: { label, run, undo } = przycisk w powiadomieniu (np. „Cofnij”); undo: true dopisuje skrót Ctrl+Z i go obsługuje. ms = czas widoczności
export function toast(msg, { error = false, action = null, ms = 0 } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  toastUndo = null;
  el.classList.toggle('err', error);
  el.classList.toggle('has-act', !!action);
  el.textContent = nb(msg);
  const life = ms || (error ? 7000 : 4200);
  const arm = (d) => { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, d); };
  // nasłuchy myszy i fokusu: poprzednie zdejmowane przy każdym powiadomieniu (element jest jeden), bo właściwość onfocusin nie istnieje w przeglądarkach
  if (el._in) { for (const [ev, fn] of [['mouseenter', el._in], ['focusin', el._in], ['mouseleave', el._out], ['focusout', el._out]]) el.removeEventListener(ev, fn); el._in = el._out = null; }
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn sm ghost toast-act';
    // skrót klawiszowy tylko tam, gdzie jest klawiatura: na dotyku i wąskim ekranie samo „Cofnij”
    const noKeys = typeof matchMedia === 'function' && matchMedia('(hover: none), (max-width: 640px)').matches;
    const hint = action.undo && !noKeys ? (isMac ? '⌘Z' : 'Ctrl+Z') : '';
    b.textContent = action.label;
    // podpowiedź skrótu w osobnym elemencie: ekrany dotykowe ją chowają (CSS @media (hover: none))
    if (hint) { const k = document.createElement('span'); k.className = 'toast-key'; k.textContent = ` (${hint})`; b.append(k); }
    if (hint) b.setAttribute('aria-keyshortcuts', isMac ? 'Meta+Z' : 'Control+Z');
    const go = () => { hideToast(); action.run(); };
    // Decyzja sesji głównej 2026-11-02 (wariant a): Spacja na przycisku powiadomienia nigdy nie cofa (Enter, kliknięcie i Ctrl+Z działają); keyup też, bo to on klika przycisk
    b.addEventListener('keydown', (ev) => { if (ev.key === ' ') ev.preventDefault(); });
    b.addEventListener('keyup', (ev) => { if (ev.key === ' ') ev.preventDefault(); });
    b.addEventListener('click', go);
    el.append(' ', b);
    el._in = () => clearTimeout(toastTimer);
    el._out = () => arm(Math.min(life, 4000));
    el.addEventListener('mouseenter', el._in); el.addEventListener('focusin', el._in);
    el.addEventListener('mouseleave', el._out); el.addEventListener('focusout', el._out);
    if (action.undo) toastUndo = go;
  }
  el.hidden = false;
  arm(life);
}
