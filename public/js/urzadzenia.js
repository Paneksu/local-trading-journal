// Kilka urządzeń: synchronizacja ustawień przez Notion (GET/POST /api/sync), lista urządzeń (GET /api/devices, zmiana nazwy)
// i „Dodaj kolejne urządzenie”: jednorazowy kod z PIN-em (POST /api/transfer/export), ważny 15 minut.
// Synchronizowane: paleta (osobno dla motywów, także własna), marginesy BE, język, motyw, sprawdzanie aktualizacji.
// Filtry i stan paneli (thq.filters.v1, thq.ui.v1) zostają na każdym urządzeniu osobno.
// Kod i PIN nie trafiają do localStorage ani do konsoli; po zamknięciu okna znikają z DOM.
// English: settings sync across devices through Notion, device list, and one-time transfer code with PIN.
import { esc } from './format.js';
import { overlay, trapTab, toast, guide } from './modal.js';
import { t } from './i18n.js';

const SYNC_KEY = 'thq.sync.v1';
const L = (s, p) => esc(t(s, p));
const svg = (body, s = 16, sw = 1.8) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>', 18, 2),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>', 14),
  file: svg('<path d="M6 3.5h8l4 4v13H6Z"/><path d="M14 3.5v4h4M12 11v6M9.5 14.5 12 17l2.5-2.5"/>', 14),
  device: svg('<rect x="3.5" y="5" width="17" height="11" rx="2"/><path d="M8.5 19.5h7M12 16v3.5"/>', 18, 1.5),
  shield: svg('<path d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6Z"/><path d="M12 8.5v4M12 15.5h.01"/>', 18, 1.6),
};

async function call(url, body) {
  const r = await fetch(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-THQ': '1' }, body: JSON.stringify(body) });
  let j = {};
  try { j = await r.json(); } catch { /* brak treści */ }
  if (!r.ok) throw Object.assign(new Error(j.error || t('Błąd {status}', { status: r.status })), { status: r.status, code: j.code, body: j });
  return j;
}
const readLocal = () => { try { return JSON.parse(localStorage.getItem(SYNC_KEY) || '{}') || {}; } catch { return {}; } };
const writeLocal = (o) => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(o)); } catch { /* brak */ } };

// ---------- synchronizacja ustawień ----------
// collect(): bieżące ustawienia do zapisu; apply(settings): zastosowanie zdalnych bez zapisu (applying blokuje pętlę).
export function createSync({ getMeta, collect, apply }) {
  let timer = 0, applying = false, pulling = false;
  const enabled = () => getMeta()?.syncEnabled !== false && !guide.on;

  async function pull() {
    if (!enabled() || pulling) return null;
    pulling = true;
    try {
      const r = await call('/api/sync');
      const remote = r.remote;
      const local = readLocal();
      if (r.enabled !== false && remote?.settings && remote.updatedAt && (!local.updatedAt || remote.updatedAt > local.updatedAt)) {
        applying = true;
        try {
          writeLocal({ updatedAt: remote.updatedAt });
          await apply(remote.settings);
        } finally { applying = false; }
        return { applied: true, from: remote.deviceId };
      }
      return { applied: false };
    } catch { return null; } finally { pulling = false; }
  }

  async function push() {
    if (!enabled()) return;
    const updatedAt = new Date().toISOString();
    try {
      const r = await call('/api/sync', { settings: collect(), updatedAt });
      writeLocal({ updatedAt: r.remoteUpdatedAt || updatedAt });
    } catch { /* zapis spróbuje przy następnej zmianie */ }
  }

  // zmiana ustawień przez użytkownika: zapis po 2 s spokoju; now: od razu (np. przed przeładowaniem po zmianie języka)
  function changed({ now = false } = {}) {
    if (applying || !enabled()) return Promise.resolve();
    clearTimeout(timer);
    if (now) return push();
    timer = setTimeout(push, 2000);
    return Promise.resolve();
  }

  // Przegląd HIJ, pkt 2: lokalna zmiana bez gestu użytkownika (migracja starych nakładek) dostaje znacznik czasu od razu, żeby pull przy starcie nie
  // nadpisał jej starszymi ustawieniami z innego urządzenia; zapis do Notion idzie zwykłym changed() (saveSettings). Nowsze zdalne nadal wygrywa.
  function touch(at = new Date().toISOString()) {
    const l = readLocal();
    if (!l.updatedAt || at > l.updatedAt) writeLocal({ ...l, updatedAt: at });
  }

  return { pull, changed, touch, get applying() { return applying; } };
}

// ---------- urządzenia: lista, nazwy, przeniesienie kodem ----------
export function createDevices({ getMeta, onConfig, onChange = () => {} }) {
  let list = null, err = '', renaming = '', removeOpen = false;
  let win = null;

  async function refresh() {
    try { list = await call('/api/devices'); err = ''; } catch (e) { err = e.message; }
    onChange();
  }
  const ago = (iso) => {
    if (!iso) return '';
    const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (min < 2) return t('aktywne teraz');
    if (min < 60) return t('{n} min temu', { n: min });
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  };

  function settingsHtml() {
    if (list === null && !err) refresh();
    const sync = getMeta()?.syncEnabled !== false;
    const devices = list?.devices || [];
    const rows = devices.map((d) => renaming === d.id
      ? `<li class="dv"><span class="dv-ico">${ICON.device}</span><span class="dv-edit"><label class="sr" for="dv-name">${L('Nazwa urządzenia')}</label><input id="dv-name" class="sp-in" type="text" maxlength="40" value="${esc(d.name)}" data-fk="dv-name"><span class="dv-act"><button type="button" class="btn primary sm" data-act="dv-save" data-v="${esc(d.id)}">${L('Zapisz')}</button><button type="button" class="btn ghost sm" data-act="dv-cancel">${L('Anuluj')}</button></span><span class="ferr" id="dv-err" hidden></span></span></li>`
      : `<li class="dv"><span class="dv-ico">${ICON.device}</span><span class="dv-txt"><b>${esc(d.name)}${d.current ? ` <span class="um-add">${L('to urządzenie')}</span>` : ''}</b><span>${esc(ago(d.lastSeen))}</span></span><button type="button" class="btn ghost sm" data-act="dv-rename" data-v="${esc(d.id)}" data-fk="dv-r-${esc(d.id)}" aria-label="${L('Zmień nazwę: {name}', { name: d.name })}">${L('Zmień nazwę')}</button></li>`).join('');
    return `<div class="sp-f"><label class="check"><input type="checkbox" data-act="sync-toggle" data-fk="sync" ${sync ? 'checked' : ''}> ${L('Synchronizuj ustawienia między urządzeniami')}</label>
        <p class="note">${L('Paleta, marginesy BE, język, motyw i sprawdzanie aktualizacji zapisują się w Twoim Notion i trafiają na pozostałe urządzenia. Filtry i układ paneli zostają osobno na każdym urządzeniu.')}</p></div>
      <div class="rule-x"></div>
      <div class="sp-f"><span class="lbl">${L('Twoje urządzenia')}</span>
        ${err ? `<p class="ferr">${esc(err)}</p>` : list === null ? `<p class="note">${L('Wczytuję…')}</p>` : `<ul class="dv-list">${rows}</ul>`}
        <div class="upd-actions"><button type="button" class="btn primary sm" data-act="dv-add" data-fk="dv-add">${L('Dodaj kolejne urządzenie')}</button></div>
        <details class="dv-remove" ${removeOpen ? 'open' : ''}><summary data-act="dv-remove-toggle">${L('Usuń urządzenie')}</summary>
          <p class="note">${L('Wszystkie urządzenia używają tego samego tokenu integracji, więc odłączenie jednego oznacza nowy token dla pozostałych:')}</p>
          <ol class="ck-how"><li>${L('W Notion otwórz integrację JustJournal i odśwież secret (Refresh).')}</li><li>${L('Na urządzeniach, które zostają, wklej nowy token przez „Zmień token”.')}</li><li>${L('Stare urządzenie traci dostęp, bo jego token przestaje działać.')}</li></ol></details></div>`;
  }

  async function rename(id, root) {
    const input = root.querySelector('#dv-name');
    const name = input.value.trim();
    const e = root.querySelector('#dv-err');
    if (name.length < 1 || name.length > 40) { e.textContent = t('Nazwa ma od 1 do 40 znaków.'); e.hidden = false; input.focus(); return; }
    try { await call('/api/devices/rename', { id, name }); renaming = ''; toast(t('Zmieniono nazwę urządzenia.')); await refresh(); }
    catch (er) { e.textContent = er.message; e.hidden = false; }
  }

  // ---------- okno „Dodaj kolejne urządzenie” ----------
  function openAdd(opener) {
    if (win) return;
    const root = document.createElement('div');
    root.className = 'scrim';
    root.innerHTML = `<div class="modal dvm" role="dialog" aria-modal="true" aria-labelledby="dvm-t">
      <div class="mh"><h2 id="dvm-t">${L('Dodaj kolejne urządzenie')}</h2><button type="button" class="icon-btn" data-dv="close" aria-label="${L('Zamknij')}">${ICON.close}</button></div>
      <div class="mb"></div><div class="mf"></div></div>`;
    document.body.append(root);
    document.documentElement.classList.add('lb-lock');
    win = { root, dlg: root.firstElementChild, opener: opener || document.activeElement, data: null, timer: 0, loading: false, err: '' };
    overlay.current = { onKey(ev) { if (ev.key === 'Escape') { ev.preventDefault(); closeAdd(); } else trapTab(ev, win.dlg); } };
    root.addEventListener('mousedown', (e) => { if (e.target === root) closeAdd(); });
    root.addEventListener('click', onAddClick);
    paintAdd();
    win.dlg.querySelector('[data-dv="gen"]')?.focus();
  }
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function leftMs() { return win?.data ? Date.parse(win.data.expiresAt) - Date.now() : 0; }
  function paintAdd() {
    if (!win) return;
    const { dlg, data } = win;
    const body = dlg.querySelector('.mb');
    const foot = dlg.querySelector('.mf');
    const intro = `<p class="ob-lead">${L('Na nowym urządzeniu zainstaluj dashboard (Instaluj.cmd albo install.sh) i w pierwszym kroku wybierz „Mam już dziennik na innym urządzeniu”. Potem wklej tam kod i wpisz PIN.')}</p>`;
    const warn = `<div class="dv-warn" role="note">${ICON.shield}<p>${L('Kod daje dostęp do Twojego Notion. Nie wysyłaj go nikomu, zwłaszcza przez czat. PIN podaj tylko sobie.')}</p></div>`;
    if (!data) {
      body.innerHTML = `${intro}${warn}${win.err ? `<p class="ferr" role="alert">${esc(win.err)}</p>` : ''}`;
      foot.innerHTML = `<span class="grow"></span><button type="button" class="btn ghost" data-dv="close">${L('Anuluj')}</button><button type="button" class="btn primary" data-dv="gen" ${win.loading ? 'disabled' : ''}>${win.loading ? L('Generuję…') : L('Wygeneruj kod')}</button>`;
      return;
    }
    const left = leftMs();
    const expired = left <= 0;
    const total = 15 * 60 * 1000;
    const pin = String(data.pin || '').replace(/\D/g, '');
    const pinShow = pin.length === 6 ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin;
    const mins = Math.max(0, Math.ceil(left / 60000));
    body.innerHTML = `${intro}
      <div class="fld"><label class="lbl" for="dv-code">${L('Kod')}</label>
        <textarea id="dv-code" class="dv-code" readonly rows="3" spellcheck="false" ${expired ? 'disabled' : ''}>${expired ? '' : esc(data.code)}</textarea>
        <div class="upd-actions"><button type="button" class="btn sm" data-dv="copy" ${expired ? 'disabled' : ''}>${ICON.copy}${L('Kopiuj kod')}</button><button type="button" class="btn sm" data-dv="file" ${expired ? 'disabled' : ''}>${ICON.file}${L('Zapisz jako plik .ltj')}</button></div></div>
      <div class="dv-pin-wrap"><span class="lbl" id="dv-pin-l">${L('PIN')}</span><output class="dv-pin" aria-labelledby="dv-pin-l">${expired ? '––– –––' : esc(pinShow)}</output>
        <p class="note">${L('Przepisz PIN ręcznie na drugim urządzeniu. Nie kopiuj go razem z kodem.')}</p></div>
      <div class="dv-exp ${expired ? 'gone' : ''}"><div class="um-bar" role="progressbar" aria-valuemin="0" aria-valuemax="15" aria-valuenow="${mins}" aria-label="${L('Ważność kodu')}"><i style="width:${Math.max(0, (left / total) * 100).toFixed(2)}%"></i></div>
        <p class="note" aria-live="polite">${expired ? L('Kod wygasł, wygeneruj nowy.') : esc(t.p('Ważny jeszcze {n} min.', mins))}</p></div>
      ${(data.skipped || []).length ? `<p class="note">${L('Pominięte pliki logo (za duże na kod): {list}. Dodasz je ręcznie na nowym urządzeniu.', { list: data.skipped.join(', ') })}</p>` : ''}
      ${warn}`;
    foot.innerHTML = `<span class="grow"></span>${expired ? `<button type="button" class="btn primary" data-dv="gen">${L('Wygeneruj nowy kod')}</button>` : ''}<button type="button" class="btn ${expired ? 'ghost' : 'primary'}" data-dv="close">${L('Gotowe')}</button>`;
  }
  function tick() {
    if (!win?.data) return;
    const left = leftMs();
    const bar = win.dlg.querySelector('.dv-exp .um-bar i');
    const txt = win.dlg.querySelector('.dv-exp .note');
    if (left <= 0) { clearInterval(win.timer); win.timer = 0; paintAdd(); return; }
    if (bar) bar.style.width = `${((left / (15 * 60 * 1000)) * 100).toFixed(2)}%`;
    const mins = Math.ceil(left / 60000);
    if (txt) { const s = t.p('Ważny jeszcze {n} min.', mins); if (txt.textContent !== s) txt.textContent = s; }
  }
  async function onAddClick(e) {
    const b = e.target.closest('[data-dv]');
    if (!b || !win) return;
    const a = b.dataset.dv;
    if (a === 'close') closeAdd();
    else if (a === 'gen') {
      win.loading = true; win.err = ''; win.data = null; paintAdd();
      try { win.data = await call('/api/transfer/export', {}); } catch (er) { win.err = er.message; }
      win.loading = false;
      if (!win) return;
      paintAdd();
      clearInterval(win.timer);
      // co sekundę pasek; przy ograniczeniu ruchu tylko tekst raz na minutę
      win.timer = setInterval(tick, reduce() ? 60000 : 1000);
      win.dlg.querySelector('[data-dv="copy"]')?.focus();
    } else if (a === 'copy') {
      try { await navigator.clipboard.writeText(win.data.code); toast(t('Skopiowano kod. PIN przepisz osobno.')); }
      catch { const ta = win.dlg.querySelector('#dv-code'); ta.focus(); ta.select(); toast(t('Nie udało się skopiować. Kod jest zaznaczony, skopiuj go ręcznie.'), { error: true }); }
    } else if (a === 'file') {
      const blob = new Blob([win.data.code], { type: 'text/plain' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = win.data.fileName || 'urzadzenie.ltj';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }
  }
  function closeAdd() {
    if (!win) return;
    clearInterval(win.timer);
    win.data = null; // kod i PIN znikają z pamięci okna i z DOM
    win.root.remove();
    overlay.current = null;
    document.documentElement.classList.remove('lb-lock');
    const o = win.opener;
    win = null;
    if (o && document.contains(o)) o.focus();
  }

  // akcje z Ustawień (data-act); zwraca true, gdy obsłużone
  function handle(act, v, el, root) {
    switch (act) {
      case 'dv-add': openAdd(el); return true;
      case 'dv-rename': renaming = v; onChange(); setTimeout(() => { const i = document.querySelector('#dv-name'); i?.focus(); i?.select(); }, 0); return true;
      case 'dv-cancel': renaming = ''; onChange(); return true;
      case 'dv-save': rename(v, root || document); return true;
      case 'dv-remove-toggle': removeOpen = !removeOpen; return false;
      default: return false;
    }
  }
  async function onToggle(checked) { await onConfig({ syncEnabled: checked }); }
  // Enter w polu nazwy zapisuje, Esc anuluje edycję
  document.addEventListener('keydown', (e) => {
    if (e.target?.id !== 'dv-name') return;
    if (e.key === 'Enter') { e.preventDefault(); rename(renaming, e.target.closest('.sp') || document); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); renaming = ''; onChange(); }
  }, true);

  return { settingsHtml, handle, refresh, onToggle, openAdd, closeAdd, isOpen: () => !!win };
}
