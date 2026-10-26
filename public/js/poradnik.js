// Wizualne poradniki do ręcznych kroków instalacji: rozwijany link „Pokaż krok po kroku”, karuzela kadrów z numerowanymi
// znacznikami i obrysem miejsca do kliknięcia (nakładka z HTML na kadrze), podpis z numerem, ‹ › i kropki, strzałki klawiatury,
// powiększenie po kliknięciu w kadr. Kadry i opisy z public/img/poradnik/poradnik.json (wersje PL i EN).
// English: visual step-by-step guides (carousel with markers and click outlines) built from the guide manifest.
import { esc } from './format.js';
import { t, getLang } from './i18n.js';

let manifest = null, loading = null;
const L = (s, p) => esc(t(s, p));
const pick = (o) => (o && typeof o === 'object' ? o[getLang()] ?? o.pl ?? o.en ?? '' : o || '');
const ICON = {
  prev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  next: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

export async function loadManifest() {
  if (manifest) return manifest;
  if (!loading) loading = fetch('img/poradnik/poradnik.json').then((r) => (r.ok ? r.json() : { steps: {} })).catch(() => ({ steps: {} })).then((m) => (manifest = m));
  return loading;
}

// Platforma użytkownika do wyboru poradnika (Node, ostrzeżenia systemu)
export function platform() {
  const p = String(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '').toLowerCase();
  return /mac|iphone|ipad/.test(p) ? 'mac' : /win/.test(p) ? 'windows' : 'linux';
}

// Link rozwijający karuzelę. ids: kroki z manifestu łączone w jedną karuzelę.
export function poradnikLink(ids, { label = '' } = {}) {
  return `<div class="pr" data-pr="${esc(ids.join(','))}"><button type="button" class="pr-toggle" aria-expanded="false">${ICON.chev}<span>${esc(label || t('Pokaż krok po kroku'))}</span></button><div class="pr-body" hidden></div></div>`;
}

function frames(ids) {
  const out = [];
  for (const id of ids) for (const f of manifest?.steps?.[id]?.frames || []) out.push({ ...f, stepTitle: pick(manifest.steps[id].title) });
  return out;
}

// Kadry-ilustracje mają własny dyskretny napis „ilustracja” w obrazie, więc nakładka go nie powtarza.
function frameHtml(f, i, n) {
  const marks = (f.markers || []).map((m) => `<span class="pr-mark" style="left:${(m.x * 100).toFixed(2)}%;top:${(m.y * 100).toFixed(2)}%" aria-hidden="true">${esc(m.n)}</span>`).join('');
  const outl = (f.outlines || []).map((o) => `<span class="pr-out" style="left:${(o.x * 100).toFixed(2)}%;top:${(o.y * 100).toFixed(2)}%;width:${(o.w * 100).toFixed(2)}%;height:${(o.h * 100).toFixed(2)}%" aria-hidden="true"></span>`).join('');
  const note = pick(f.note);
  return `<button type="button" class="pr-frame" data-pr-zoom aria-label="${L('Powiększ kadr {a} z {b}', { a: i + 1, b: n })}">
      <img src="img/${esc(pick(f.img))}" width="${f.w || 1200}" height="${f.h || 720}" alt="${esc(pick(f.alt))}" loading="lazy" decoding="async">${outl}${marks}
      </button>
    <p class="pr-cap"><b>${i + 1}/${n}</b> ${esc(pick(f.caption))}${note ? `<small>${esc(note)}</small>` : ''}</p>`;
}

function render(box, list, idx) {
  const n = list.length;
  box.innerHTML = `<div class="pr-car" role="group" aria-roledescription="${L('karuzela')}" aria-label="${esc(list[idx]?.stepTitle || '')}" tabindex="0">
      <div class="pr-stage" aria-live="polite">${frameHtml(list[idx], idx, n)}</div>
      <div class="pr-nav"><button type="button" class="icon-btn" data-pr-go="-1" aria-label="${L('Poprzedni kadr')}" ${idx ? '' : 'disabled'}>${ICON.prev}</button>
        <span class="pr-dots">${list.map((_, i) => `<button type="button" class="pr-dot" data-pr-i="${i}" aria-label="${L('Kadr {n}', { n: i + 1 })}" aria-current="${i === idx}"></button>`).join('')}</span>
        <button type="button" class="icon-btn" data-pr-go="1" aria-label="${L('Następny kadr')}" ${idx < n - 1 ? '' : 'disabled'}>${ICON.next}</button></div></div>`;
  box.dataset.idx = String(idx);
}

// Powiększenie kadru: własna warstwa nad nakładką „Pierwszych kroków”, Esc i klik zamykają, strzałki przechodzą dalej.
function zoom(list, idx, back) {
  const wrap = document.createElement('div');
  wrap.className = 'pr-zoom';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', t('Powiększony kadr'));
  const paint = () => {
    wrap.innerHTML = `<div class="pr-zoom-in">${frameHtml(list[idx], idx, list.length).replace('data-pr-zoom', 'data-pr-close')}</div>
      <button type="button" class="icon-btn pr-zoom-x" data-pr-close aria-label="${L('Zamknij powiększenie')}">${ICON.close}</button>`;
  };
  paint();
  const close = () => { document.removeEventListener('keydown', key, true); wrap.remove(); back?.focus(); };
  const key = (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); }
    else if (ev.key === 'ArrowRight' && idx < list.length - 1) { ev.preventDefault(); ev.stopPropagation(); idx++; paint(); }
    else if (ev.key === 'ArrowLeft' && idx > 0) { ev.preventDefault(); ev.stopPropagation(); idx--; paint(); }
    else if (ev.key === 'Tab') { ev.preventDefault(); ev.stopPropagation(); wrap.querySelector('.pr-zoom-x').focus(); }
  };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-pr-close]')) close(); });
  document.addEventListener('keydown', key, true);
  document.body.append(wrap);
  wrap.querySelector('.pr-zoom-x').focus();
}

// Podpina działanie wszystkich poradników w danym kontenerze (wywoływane po każdym przerysowaniu treści).
export function bindPoradniki(root) {
  root.querySelectorAll('.pr').forEach((pr) => {
    if (pr.dataset.bound) return;
    pr.dataset.bound = '1';
    const ids = pr.dataset.pr.split(',');
    const btn = pr.querySelector('.pr-toggle');
    const box = pr.querySelector('.pr-body');
    let list = [];
    const go = (i) => { render(box, list, Math.max(0, Math.min(list.length - 1, i))); };
    btn.addEventListener('click', async () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      box.hidden = !open;
      if (open) { await loadManifest(); list = frames(ids); if (list.length) go(Number(box.dataset.idx) || 0); else box.textContent = t('Brak poradnika.'); }
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pr-go],[data-pr-i],[data-pr-zoom]');
      if (!b) return;
      const cur = Number(box.dataset.idx) || 0;
      if (b.dataset.prGo) { go(cur + Number(b.dataset.prGo)); box.querySelector(`[data-pr-go="${b.dataset.prGo}"]:not([disabled])`)?.focus() || box.querySelector('.pr-car').focus(); }
      else if (b.dataset.prI) { go(Number(b.dataset.prI)); box.querySelector(`[data-pr-i="${b.dataset.prI}"]`)?.focus(); }
      else zoom(list, cur, b);
    });
    box.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      if (e.target.matches('input, textarea')) return;
      e.preventDefault(); e.stopPropagation();
      go((Number(box.dataset.idx) || 0) + (e.key === 'ArrowRight' ? 1 : -1));
      box.querySelector('.pr-car').focus();
    });
  });
}
