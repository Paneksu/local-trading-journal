// Przewodnik „Jak działa dziennik”: dashboard na danych przykładowych z podświetleniem prawdziwych elementów krok po kroku.
// Tryb przewodnika podmienia odpowiedź /api/data na dane z pamięci (demo-dane.js), zapisy formularzy trafiają tylko do pamięci,
// a ustawienia, filtry i motyw nie zapisują się w localStorage. Wyjście przeładowuje stronę: wracają prawdziwe dane i ustawienia.
// English: guided tour on in-memory demo data; no Notion writes, no localStorage writes, exit reloads the real dashboard.
import { esc } from './format.js';
import { guide, toast } from './modal.js';
import { t } from './i18n.js';
import { demoPayload, applyDemoWrite } from './demo-dane.js';

const L = (s, p) => esc(t(s, p));
const isMobile = () => window.matchMedia('(max-width: 1023px)').matches;

export function createGuide(api) {
  let on = false, idx = 0, els = null, payload = null, paused = false;
  const realFetch = window.fetch.bind(window);
  const realSet = Storage.prototype.setItem, realRemove = Storage.prototype.removeItem;

  // ---------- kroki: cel (prawdziwy element), przygotowanie widoku, tekst ----------
  const steps = [
    { title: 'Filtry po lewej', text: 'Wybierasz tu typ (Live, Backtest albo Paper), okres i konta. Wszystkie liczby, wykresy i listy liczą się z tego wyboru.',
      before: () => api.setView('stats'), target: () => (isMobile() ? document.querySelector('.tb-item[data-v="desk"]') : document.getElementById('desk')) },
    { title: 'Najważniejsze liczby', text: 'Suma R na górze i kafle z win rate, profit factor czy max drawdown. Strzałki porównują z poprzednim okresem tej samej długości.',
      target: () => document.querySelector('#view .hero')?.closest('.sec') },
    { title: 'Krzywa kapitału', text: 'Wynik narastająco trade po trade, pod nią spadki od szczytu. Przełącznik „+ paper” dorysowuje linię z trade\'ami, których nie wziąłeś.',
      target: () => document.getElementById('equity')?.closest('.card') },
    { title: 'Rozbicia i rozkład R', text: 'Niżej są godziny wejścia, czas trwania, kolejny trade w dniu i setupy. Klik w słupek rozkładu R pokazuje te trade\'y w zakładce Trade\'y.',
      target: () => document.getElementById('rdist-card') },
    { title: 'Dodawanie trade\'ów', text: 'Trade dodany tutaj ląduje w bazie Notion, a zmiany zrobione w Notion widać po odświeżeniu. W przewodniku zapis zostaje tylko w pamięci.',
      target: () => document.querySelector('.top-actions [data-act="add-trade"]'), extra: { label: 'Otwórz przykład', run: () => openExample() } },
    { title: 'Konta prop', text: 'Zakładka Prop zbiera konta, payouty i wydatki. Widać saldo względem rozmiaru konta, ROI każdej firmy i bilans od początku.',
      before: () => api.setView('prop'), target: () => document.querySelector('#view .gr.row-p') },
    { title: 'Ustawienia', text: 'Koło zębate: margines BE, paleta kolorów, język i aktualizacje. Tu też wrócisz do pierwszych kroków.',
      before: () => { api.setView('stats'); if (!isMobile()) api.openSettings(); }, after: () => api.closeSettings(),
      target: () => (isMobile() ? document.getElementById('gear') : document.querySelector('.sp')) },
    { title: 'Gotowe. Wróć do swoich danych', text: 'Przewodnik możesz uruchomić ponownie w Ustawieniach albo przyciskiem „?” w pasku statusu.', target: () => null, final: true },
  ];

  // ---------- podmiana danych i blokada zapisów ----------
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  async function fakeFetch(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const method = (init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    if (url.origin === location.origin && url.pathname === '/api/data') {
      let meta = {};
      try { meta = await (await realFetch('/api/meta')).json(); } catch { /* brak */ }
      return json({ ...payload, fetchedAt: new Date().toISOString(), cached: false, meta });
    }
    if (url.origin === location.origin && method !== 'GET' && url.pathname.startsWith('/api/')) {
      const m = url.pathname.match(/^\/api\/(trades|konta|finanse)(?:\/([0-9a-f-]{36}))?$/i);
      if (m) {
        let body = {};
        try { body = JSON.parse(init.body || '{}'); } catch { /* puste */ }
        return json(applyDemoWrite(payload, m[1].toLowerCase(), m[2] || null, body));
      }
      return json({ error: t('W trybie przewodnika ta akcja jest wyłączona.') }, 409);
    }
    return realFetch(input, init);
  }
  function blockStorage() {
    Storage.prototype.setItem = function (k, v) { if (on && String(k).startsWith('thq.')) return; return realSet.call(this, k, v); };
    Storage.prototype.removeItem = function (k) { if (on && String(k).startsWith('thq.')) return; return realRemove.call(this, k); };
  }

  // ---------- warstwa: przyciemnienie z wycięciem, karta kroku, pigułka trybu ----------
  function build() {
    const block = document.createElement('div');
    block.className = 'gd-block';
    const hole = document.createElement('div');
    hole.className = 'gd-hole';
    const card = document.createElement('div');
    card.className = 'gd-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'gd-title');
    card.tabIndex = -1;
    const pill = document.createElement('div');
    pill.className = 'gd-pill';
    pill.innerHTML = `<span class="gd-dot" aria-hidden="true"></span><span>${L('Tryb przewodnika · dane przykładowe')}</span><button type="button" class="btn sm" data-gd="exit">${L('Zakończ')}</button>`;
    document.body.append(block, hole, card, pill);
    els = { block, hole, card, pill };
    for (const e of [card, pill]) e.addEventListener('click', onClick);
    block.addEventListener('click', () => els.card.focus());
  }

  function paintCard(s) {
    const n = steps.length;
    els.card.innerHTML = `<p class="gd-n">${L('Krok {a} z {b}', { a: idx + 1, b: n })}</p>
      <h2 class="gd-t" id="gd-title">${L(s.title)}</h2>
      <p class="gd-x" aria-live="polite">${L(s.text)}</p>
      <div class="gd-f">${idx ? `<button type="button" class="btn ghost sm" data-gd="back">${L('Wstecz')}</button>` : ''}<span class="grow"></span>
        ${s.extra ? `<button type="button" class="btn sm" data-gd="extra">${L(s.extra.label)}</button>` : ''}
        ${s.final ? `<button type="button" class="btn primary sm" data-gd="exit">${L('Wróć do moich danych')}</button>` : `<button type="button" class="btn primary sm" data-gd="next">${L('Dalej')}</button>`}</div>`;
  }

  function place() {
    if (!on || paused || !els) return;
    const s = steps[idx];
    const el = s.target();
    const { hole, card } = els;
    const mobile = isMobile();
    card.classList.toggle('sheet', mobile);
    if (!el || !el.getClientRects().length) {
      card.classList.remove('top');
      hole.classList.add('none');
      card.classList.add('center');
      card.style.left = card.style.top = '';
      return;
    }
    card.classList.remove('center');
    hole.classList.remove('none');
    const r = el.getBoundingClientRect();
    const pad = 6;
    const vh = innerHeight, vw = innerWidth;
    const top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad);
    const bottom = Math.min(vh - 4, r.bottom + pad), right = Math.min(vw - 4, r.right + pad);
    const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 6;
    Object.assign(hole.style, { top: `${top}px`, left: `${left}px`, width: `${Math.max(0, right - left)}px`, height: `${Math.max(0, bottom - top)}px`, borderRadius: `${rad + pad}px` });
    // telefon: arkusz od dołu, a gdy podświetlony element jest w dolnej części ekranu (pasek nawigacji), arkusz idzie na górę
    card.classList.toggle('top', mobile && r.top > vh * 0.55);
    if (mobile) { card.style.left = card.style.top = ''; return; }
    const cw = card.offsetWidth, ch = card.offsetHeight, gap = 16;
    let x, y;
    if (right + gap + cw <= vw - 12) { x = right + gap; y = top; }
    else if (left - gap - cw >= 12) { x = left - gap - cw; y = top; }
    else if (bottom + gap + ch <= vh - 12) { y = bottom + gap; x = left; }
    else if (top - gap - ch >= 12) { y = top - gap - ch; x = left; }
    else { x = vw - cw - 24; y = vh - ch - 24; }
    x = Math.max(12, Math.min(vw - cw - 12, x));
    y = Math.max(12, Math.min(vh - ch - 12, y));
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
  }

  async function show(i) {
    const prev = steps[idx];
    if (prev && prev !== steps[i]) prev.after?.();
    idx = Math.max(0, Math.min(steps.length - 1, i));
    const s = steps[idx];
    s.before?.();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const el = s.target();
    if (el && document.getElementById('main')?.contains(el)) {
      el.scrollIntoView({ block: isMobile() ? 'start' : 'center', behavior: 'auto' });
      await new Promise((r) => requestAnimationFrame(r));
    }
    paintCard(s);
    place();
    els.card.focus({ preventScroll: true });
  }

  function openExample() {
    const m = api.getModel();
    const ex = m?.trades.filter((x) => x.typ === 'Live').sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!ex) return;
    paused = true;
    for (const e of Object.values(els)) e.hidden = true;
    api.openForm(ex);
  }
  // wywoływane po zamknięciu formularza (app.js, onClose formularza)
  function resume() {
    if (!on || !paused) return;
    paused = false;
    for (const e of Object.values(els)) e.hidden = false;
    show(idx);
  }

  function onClick(e) {
    const b = e.target.closest('[data-gd]');
    if (!b) return;
    const a = b.dataset.gd;
    if (a === 'next') show(idx + 1);
    else if (a === 'back') show(idx - 1);
    else if (a === 'extra') steps[idx].extra?.run();
    else if (a === 'exit') exit();
  }
  // klawiatura: przechwytywana przed resztą aplikacji (faza capture), gdy przewodnik jest widoczny
  function onKey(ev) {
    if (!on || paused) return;
    if (ev.key === 'ArrowRight') { ev.preventDefault(); ev.stopPropagation(); if (idx < steps.length - 1) show(idx + 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); ev.stopPropagation(); if (idx) show(idx - 1); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); exit(); }
    else if (ev.key === 'Tab') {
      const f = [...els.card.querySelectorAll('button'), ...els.pill.querySelectorAll('button')];
      if (!f.length) return;
      ev.preventDefault(); ev.stopPropagation();
      const i = f.indexOf(document.activeElement);
      f[(i + (ev.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  }
  const relayout = () => requestAnimationFrame(place);

  async function start() {
    if (on) return;
    on = true;
    guide.on = true;
    document.documentElement.dataset.guide = '1';
    payload = demoPayload(api.lang());
    blockStorage();
    window.fetch = fakeFetch;
    api.closeOverlays();
    api.resetForTour();
    build();
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', relayout);
    document.getElementById('main')?.addEventListener('scroll', relayout, { passive: true });
    await api.load(true);
    show(0);
  }

  function exit() {
    // wyjście: prawdziwe dane, filtry i ustawienia wracają po przeładowaniu (localStorage nie był zmieniany)
    toast(t('Wracam do Twoich danych…'));
    on = false;
    Storage.prototype.setItem = realSet; Storage.prototype.removeItem = realRemove;
    window.fetch = realFetch;
    location.reload();
  }

  return { start, exit, resume, get active() { return on; }, get paused() { return paused; } };
}
