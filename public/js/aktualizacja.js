// Moduł aktualizacji w dashboardzie: pigułka „Nowa wersja X” w pasku statusu, okno z listą zmian (markdown z wydania GitHub,
// renderowany bezpiecznie przez createElement i textContent), planem zmian w Notion, przebiegiem aktualizacji krok po kroku
// i powrotem po restarcie serwera. Umowa z serwerem: GET /api/update-check, POST /api/update/check | skip | plan | run,
// GET /api/update/status, GET /api/health. Wszystkie POST z ochroną zapisu (X-THQ, JSON, Origin dashboardu).
// English: in-app updater UI. Release notes are untrusted text: never innerHTML, only createElement + textContent.
import { esc } from './format.js';
import { overlay, trapTab, toast } from './modal.js';
import { t } from './i18n.js';

const TARGET_KEY = 'thq.updTarget';
const STEP_IDS = ['backup', 'download', 'migrate', 'restart'];
const STEP_LABEL = { backup: 'Kopia baz Notion', download: 'Pobranie nowej wersji', migrate: 'Migracje schematu', restart: 'Restart dashboardu' };
const DB_LABEL = { trades: "Trade'y", konta: 'Konta', dziennik: 'Dziennik', finanse: 'Wydatki i payouty' };
const HEALTH_LIMIT_MS = 60_000;

const svg = (body, s = 16, sw = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>', 18),
  done: svg('<path d="m5 12 5 5 9-10"/>', 14, 2.4),
  error: svg('<path d="M7 7l10 10M17 7 7 17"/>', 14, 2.4),
  pending: svg('<circle cx="12" cy="12" r="2.5" fill="currentColor"/>', 14, 1.8),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>', 14, 1.8),
};

async function post(url, body = {}) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-THQ': '1' }, body: JSON.stringify(body) });
  let j = {};
  try { j = await r.json(); } catch { /* brak treści */ }
  if (!r.ok) throw Object.assign(new Error(j.error || j.message || t('Błąd {status}', { status: r.status })), { status: r.status, body: j });
  return j;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- bezpieczny, prosty markdown: nagłówki #, listy - i *, **pogrubienie**, `kod`, akapity ----------
function inline(parent, text) {
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.append(document.createTextNode(text.slice(last, m.index)));
    const tok = m[0];
    if (tok.startsWith('**')) { const b = document.createElement('strong'); b.textContent = tok.slice(2, -2); parent.append(b); }
    else if (tok.startsWith('`')) { const c = document.createElement('code'); c.textContent = tok.slice(1, -1); parent.append(c); }
    else parent.append(document.createTextNode(tok.slice(1, tok.indexOf(']')))); // link: tylko tekst, bez adresu
    last = m.index + tok.length;
  }
  if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
}
export function renderMarkdown(md) {
  const root = document.createElement('div');
  root.className = 'md';
  let list = null, para = null;
  const close = () => { list = null; para = null; };
  for (const raw of String(md || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { close(); continue; }
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    const li = line.match(/^\s*[-*+]\s+(.*)$/);
    if (h) {
      close();
      const el = document.createElement(h[1].length <= 2 ? 'h4' : 'h5');
      inline(el, h[2].replace(/\s*#+\s*$/, ''));
      root.append(el);
    } else if (li) {
      para = null;
      if (!list) { list = document.createElement('ul'); root.append(list); }
      const el = document.createElement('li');
      inline(el, li[1]);
      list.append(el);
    } else {
      list = null;
      if (!para) { para = document.createElement('p'); root.append(para); } else para.append(document.createTextNode(' '));
      inline(para, line.trim());
    }
  }
  return root;
}

export function createUpdater({ getMeta = () => ({}) } = {}) {
  let info = null;          // ostatnia odpowiedź /api/update-check
  let checking = false;
  let win = null;           // { root, dlg, opener }
  let plan = null, planErr = '', planLoading = false;
  let run = null;           // { status, error, waiting, phase }
  let onChange = () => {};

  const available = () => !!(info && info.available && !info.disabled && !info.skipped);

  // ---------- pigułka w pasku statusu i kropka przy kole zębatym (na telefonie pasek statusu jest ukryty) ----------
  function renderPill() {
    const b = document.getElementById('upd');
    const gear = document.getElementById('gear');
    const on = available();
    if (b) {
      b.hidden = !on;
      if (on) {
        b.querySelector('.upd-t').textContent = t('Nowa wersja {v}', { v: info.latest });
        b.setAttribute('aria-label', t('Nowa wersja {v}. Otwórz okno aktualizacji', { v: info.latest }));
      }
    }
    if (gear) gear.classList.toggle('has-upd', on);
    onChange();
  }

  async function check(force = false) {
    if (checking) return info;
    checking = true;
    try {
      info = force ? await post('/api/update/check') : await (await fetch('/api/update-check', { cache: 'no-store' })).json();
    } catch (e) {
      if (force) { info = { ...(info || {}), offline: true }; toast(t('Nie udało się sprawdzić aktualizacji: {msg}', { msg: e.message }), { error: true }); }
    } finally { checking = false; }
    renderPill();
    return info;
  }

  // po powrocie z restartu: strona przeładowana przez moduł pokazuje komunikat o udanej aktualizacji
  function afterReload() {
    let target = '';
    try { target = sessionStorage.getItem(TARGET_KEY) || ''; } catch { /* brak */ }
    if (!target) return;
    const v = getMeta()?.version;
    if (v && v === target) {
      try { sessionStorage.removeItem(TARGET_KEY); } catch { /* brak */ }
      setTimeout(() => toast(t('Zaktualizowano do {v}', { v: target })), 400);
    }
  }

  // ---------- okno ----------
  const dbName = (db) => t(DB_LABEL[db] || db);
  function planItemText(p) {
    if (p.kind === 'option') return t('Nowa opcja „{name}” w bazie {db}', { name: p.name, db: dbName(p.db) });
    if (p.kind === 'view') return t('Nowy widok „{name}” w bazie {db}', { name: p.name, db: dbName(p.db) });
    return t('Nowe pole „{name}” w bazie {db}', { name: p.name, db: dbName(p.db) });
  }

  function notionSection() {
    const sec = document.createElement('section');
    sec.className = 'um-sec';
    const h = document.createElement('h3');
    h.className = 'lbl';
    h.textContent = t('Zmiany w Notion');
    sec.append(h);
    const body = document.createElement('div');
    body.className = 'um-plan';
    if (planLoading) {
      body.innerHTML = `<p class="um-loading"><span class="spin" aria-hidden="true"></span>${esc(t('Sprawdzam, co zmieni się w Notion…'))}</p>`;
    } else if (planErr) {
      const p = document.createElement('p'); p.className = 'ferr'; p.textContent = t('Nie udało się przygotować planu: {msg}', { msg: planErr }); body.append(p);
    } else if (plan) {
      const items = Array.isArray(plan.notion) ? plan.notion : [];
      if (!items.length) {
        const p = document.createElement('p'); p.className = 'um-none'; p.textContent = t('W Notion nic się nie zmieni.'); body.append(p);
      } else {
        const ul = document.createElement('ul');
        for (const it of items) {
          const li = document.createElement('li');
          const b = document.createElement('span'); b.className = 'um-add'; b.textContent = t('dodane');
          const s = document.createElement('span'); s.textContent = planItemText(it);
          li.append(b, s);
          if (it.detail) { const d = document.createElement('small'); d.textContent = String(it.detail); li.append(d); }
          ul.append(li);
        }
        body.append(ul);
      }
    }
    const note = document.createElement('p');
    note.className = 'fhint';
    note.textContent = t('Aktualizacja tylko dodaje. Nic nie zostanie usunięte ani nadpisane, a przed zmianami powstaje kopia wszystkich baz w folderze backups/.');
    sec.append(body, note);
    return sec;
  }

  function stepsSection() {
    const st = run?.status;
    const steps = STEP_IDS.map((id) => (st?.steps || []).find((s) => s.id === id) || { id, status: 'pending' });
    const done = steps.filter((s) => s.status === 'done').length;
    const sec = document.createElement('section');
    sec.className = 'um-sec';
    const h = document.createElement('h3'); h.className = 'lbl'; h.textContent = t('Przebieg aktualizacji'); sec.append(h);
    const bar = document.createElement('div');
    bar.className = 'um-bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '4'); bar.setAttribute('aria-valuenow', String(done));
    bar.setAttribute('aria-label', t('Postęp aktualizacji'));
    const fill = document.createElement('i'); fill.style.width = `${(done / 4) * 100}%`; bar.append(fill);
    sec.append(bar);
    const ol = document.createElement('ol');
    ol.className = 'um-steps';
    for (const s of steps) {
      const li = document.createElement('li');
      li.className = `st-${s.status}`;
      const ic = document.createElement('span');
      ic.className = 'um-ic';
      ic.innerHTML = s.status === 'running' ? '<span class="spin" aria-hidden="true"></span>' : ICON[s.status === 'done' ? 'done' : s.status === 'error' ? 'error' : 'pending']; // tylko nasze ikony, bez danych z zewnątrz
      const tx = document.createElement('span');
      tx.className = 'um-st';
      tx.textContent = t(STEP_LABEL[s.id] || s.id);
      const sr = document.createElement('span');
      sr.className = 'sr';
      sr.textContent = ` (${t({ pending: 'czeka', running: 'w toku', done: 'gotowe', error: 'błąd' }[s.status] || s.status)})`;
      li.append(ic, tx, sr);
      if (s.detail) { const d = document.createElement('small'); d.textContent = String(s.detail); li.append(d); }
      ol.append(li);
    }
    sec.append(ol);
    if (run?.waiting) {
      const p = document.createElement('p'); p.className = 'fhint'; p.textContent = t('Dashboard uruchamia się ponownie. Strona odświeży się sama, nie zamykaj tej karty.'); sec.append(p);
    }
    const err = st?.error || run?.error;
    if (err) sec.append(errorBox(err));
    return sec;
  }

  function errorBox(err) {
    const box = document.createElement('div');
    box.className = 'um-err';
    box.setAttribute('role', 'alert');
    const h = document.createElement('b'); h.textContent = t('Aktualizacja przerwana'); box.append(h);
    const p = document.createElement('p'); p.textContent = String(err.message || t('Nieznany błąd.')); box.append(p);
    if (err.backupDir) {
      const b = document.createElement('p');
      b.append(document.createTextNode(t('Kopia baz przed aktualizacją:') + ' '));
      const c = document.createElement('code'); c.textContent = String(err.backupDir); b.append(c);
      box.append(b);
    }
    if (err.command) {
      const l = document.createElement('p'); l.textContent = t('Możesz dokończyć ręcznie w terminalu, w folderze dashboardu:'); box.append(l);
      const row = document.createElement('div'); row.className = 'um-cmd';
      const c = document.createElement('code'); c.textContent = String(err.command);
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn sm'; btn.dataset.u = 'copy';
      btn.innerHTML = ICON.copy; btn.append(document.createTextNode(t('Kopiuj')));
      btn.dataset.cmd = String(err.command);
      row.append(c, btn);
      box.append(row);
    }
    const n = document.createElement('p'); n.className = 'fhint'; n.textContent = t('Dane w Notion są bezpieczne: migracje tylko dodają pola i opcje.'); box.append(n);
    return box;
  }

  function paint() {
    if (!win) return;
    const { dlg } = win;
    const body = dlg.querySelector('.mb');
    const keep = body.scrollTop;
    body.textContent = '';
    // wersje
    const ver = document.createElement('div');
    ver.className = 'um-ver';
    const cur = document.createElement('span'); cur.className = 'mono'; cur.textContent = info?.current || getMeta()?.version || '?';
    const arr = document.createElement('span'); arr.className = 'um-arr'; arr.setAttribute('aria-hidden', 'true'); arr.textContent = '→';
    const nxt = document.createElement('b'); nxt.className = 'mono'; nxt.textContent = info?.latest || '?';
    const lab = document.createElement('span'); lab.className = 'sr'; lab.textContent = t('Obecna wersja {a}, nowa wersja {b}', { a: cur.textContent, b: nxt.textContent });
    ver.append(cur, arr, nxt, lab);
    if (info?.url) {
      const a = document.createElement('a'); a.className = 'um-link'; a.href = info.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = t('Wydanie na GitHubie');
      ver.append(a);
    }
    body.append(ver);
    // lista zmian
    const notes = document.createElement('section');
    notes.className = 'um-sec';
    const nh = document.createElement('h3'); nh.className = 'lbl'; nh.textContent = t('Co nowego'); notes.append(nh);
    const box = document.createElement('div'); box.className = 'um-notes';
    if (info?.notes && String(info.notes).trim()) box.append(renderMarkdown(info.notes));
    else { const p = document.createElement('p'); p.className = 'fhint'; p.textContent = t('Wydanie nie ma opisu zmian.'); box.append(p); }
    notes.append(box);
    body.append(notes);
    body.append(run ? stepsSection() : notionSection());
    if (!run && plan && plan.canUpdate === false) {
      const why = document.createElement('p');
      why.className = 'um-why';
      why.id = 'um-why';
      why.textContent = t('Automatyczna aktualizacja jest niedostępna: {reason}', { reason: plan.reason || t('nieznany powód') });
      body.append(why);
    }
    body.scrollTop = keep;
    // stopka
    const foot = dlg.querySelector('.mf');
    const running = run && !run.error && !run.status?.error && !run.status?.done;
    const canUpdate = !!plan && plan.canUpdate !== false && !planLoading && !planErr;
    if (running) {
      foot.innerHTML = `<span class="fmsg">${esc(t('Aktualizacja trwa. Nie zamykaj tej karty.'))}</span>`;
    } else if (run) {
      foot.innerHTML = `<span class="grow"></span><button type="button" class="btn" data-u="close">${esc(t('Zamknij'))}</button>`;
    } else {
      foot.innerHTML = `<button type="button" class="um-skip" data-u="skip">${esc(t('Pomiń tę wersję'))}</button><span class="grow"></span>
        <button type="button" class="btn ghost" data-u="close">${esc(t('Później'))}</button>
        <button type="button" class="btn primary" data-u="run" ${canUpdate ? '' : `disabled aria-describedby="um-why"`}>${esc(planLoading ? t('Przygotowuję…') : t('Aktualizuj'))}</button>`;
      if (!canUpdate && plan && plan.canUpdate === false) body.querySelector('.um-why')?.setAttribute('id', 'um-why');
    }
  }

  async function loadPlan() {
    planLoading = true; planErr = ''; plan = null; paint();
    try { plan = await post('/api/update/plan'); } catch (e) { planErr = e.message; }
    planLoading = false; paint();
  }

  function open(opener) {
    if (win || !info?.latest) return;
    const root = document.createElement('div');
    root.className = 'scrim';
    root.innerHTML = `<div class="modal um" role="dialog" aria-modal="true" aria-labelledby="um-t">
      <div class="mh"><h2 id="um-t">${esc(t('Aktualizacja dashboardu'))}</h2><button type="button" class="icon-btn" data-u="close" aria-label="${esc(t('Zamknij okno aktualizacji'))}">${ICON.close}</button></div>
      <div class="mb"></div><div class="mf"></div></div>`;
    document.body.append(root);
    document.documentElement.classList.add('lb-lock');
    win = { root, dlg: root.firstElementChild, opener: opener || document.activeElement };
    overlay.current = { onKey(ev) { if (ev.key === 'Escape') { ev.preventDefault(); close(); } else trapTab(ev, win.dlg); } };
    root.addEventListener('mousedown', (e) => { if (e.target === root) close(); });
    root.addEventListener('click', onClick);
    run = null;
    paint();
    win.dlg.querySelector('[data-u="close"]').focus();
    loadPlan();
  }

  function close() {
    if (!win) return;
    const busy = run && !run.error && !run.status?.error && !run.status?.done;
    if (busy) return; // w trakcie aktualizacji okno zostaje (strona i tak przeładuje się po restarcie)
    win.root.remove();
    overlay.current = null;
    document.documentElement.classList.remove('lb-lock');
    const o = win.opener;
    win = null;
    if (o && document.contains(o)) o.focus();
  }

  async function onClick(e) {
    const b = e.target.closest('[data-u]');
    if (!b) return;
    const act = b.dataset.u;
    if (act === 'close') close();
    else if (act === 'skip') {
      try {
        await post('/api/update/skip', { version: info.latest });
        info = { ...info, skipped: true };
        toast(t('Pominięto wersję {v}. Następna nowa wersja znów się pokaże.', { v: info.latest }));
        renderPill();
        close();
      } catch (err) { toast(t('Nie udało się pominąć wersji: {msg}', { msg: err.message }), { error: true }); }
    } else if (act === 'run') startRun();
    else if (act === 'copy') {
      try { await navigator.clipboard.writeText(b.dataset.cmd); toast(t('Skopiowano polecenie.')); } catch { toast(t('Nie udało się skopiować. Zaznacz polecenie i skopiuj ręcznie.'), { error: true }); }
    }
  }

  async function startRun() {
    const target = plan?.target || info?.latest;
    run = { status: { running: true, steps: [] }, error: null, waiting: false };
    paint();
    try { sessionStorage.setItem(TARGET_KEY, target); } catch { /* brak */ }
    try {
      await post('/api/update/run');
    } catch (e) {
      run.error = { message: e.status === 409 ? t('Aktualizacja już trwa w innym oknie.') : e.message };
      paint();
      return;
    }
    // przebieg: status co 0,8 s, aż do kroku restartu albo błędu
    for (;;) {
      await sleep(800);
      let st;
      try { st = await (await fetch('/api/update/status', { cache: 'no-store' })).json(); }
      catch { break; } // serwer zniknął: restart
      run.status = st;
      paint();
      if (st.error) return;
      const rs = (st.steps || []).find((s) => s.id === 'restart');
      if (st.done || (rs && rs.status !== 'pending')) break;
    }
    run.waiting = true;
    paint();
    await waitForHealth(target);
  }

  async function waitForHealth(target) {
    const until = Date.now() + HEALTH_LIMIT_MS;
    while (Date.now() < until) {
      await sleep(1000);
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          if (j.version === target) { location.reload(); return; }
        }
      } catch { /* serwer jeszcze wstaje */ }
    }
    run.waiting = false;
    run.error = {
      message: t('Dashboard nie wrócił po restarcie w ciągu minuty. Uruchom go ręcznie (Dashboard.vbs albo start.sh).'),
      backupDir: run.status?.error?.backupDir || '',
      command: run.status?.error?.command || '',
    };
    paint();
  }

  // ---------- sekcja w Ustawieniach (zakładka Ogólne) ----------
  function settingsHtml() {
    const m = getMeta() || {};
    const disabled = m.updateCheck === false;
    let line;
    if (disabled) line = t('Sprawdzanie aktualizacji jest wyłączone.');
    else if (checking) line = t('Sprawdzam…');
    else if (!info) line = t('Jeszcze nie sprawdzono.');
    else if (info.offline) line = t('Brak połączenia z GitHub. Spróbuj później.');
    else if (info.available) line = info.skipped ? t('Dostępna wersja {v} (pominięta).', { v: info.latest }) : t('Dostępna wersja {v}.', { v: info.latest });
    else line = t('Masz najnowszą wersję.');
    const when = info?.checkedAt ? ` ${t('Sprawdzono {time}.', { time: new Date(info.checkedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) })}` : '';
    return `<div class="sp-f"><span class="lbl">${esc(t('Aktualizacje'))}</span>
      <p class="upd-line">${esc(t('Wersja {v}', { v: m.version || '?' }))} · ${esc(line)}${esc(when)}</p>
      <div class="upd-actions"><button type="button" class="btn sm" data-act="upd-check-now" data-fk="upd-now" ${checking ? 'disabled' : ''}>${esc(t('Sprawdź teraz'))}</button>${info?.available && info.latest ? `<button type="button" class="btn primary sm" data-act="upd-open" data-fk="upd-open">${esc(t('Zobacz wersję {v}', { v: info.latest }))}</button>` : ''}</div></div>`;
  }

  function handle(act, el) {
    if (act === 'upd-open') { open(el); return true; }
    if (act === 'upd-check-now') { check(true).then(() => { if (info && !info.available && !info.offline) toast(t('Masz najnowszą wersję.')); }); onChange(); return true; }
    return false;
  }

  return {
    check, renderPill, open, close, handle, settingsHtml, afterReload,
    set onChange(fn) { onChange = fn; },
    get info() { return info; },
    isOpen: () => !!win,
  };
}
