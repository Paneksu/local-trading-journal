// Warstwa interakcji nakładki newsów i earningsów (pakiet C, 1.4.0): przezroczyste przyciski nad znacznikami i etykietami oraz jeden dymek.
// Wspólna dla podglądu SVG i edytora LWC (rysunek jest osobno: SVG albo canvas), więc dymek działa tak samo wszędzie: mysz (najechanie), klawiatura (Tab, fokus)
// i dotyk (stuknięcie). Przycisk ma pełny opis w aria-label, więc czytnik ekranu nie potrzebuje dymka. Kolory dymka z tokenów (.tip, .nws-dot).
// English: interaction layer for the news/earnings overlay: transparent buttons over markers and day labels plus one tooltip (hover, keyboard focus, tap).
import { tipFor } from './newsy.js';

// host: element wykresu (position: relative). fmt(): { HM, DAY } w strefie wykresu. Zwraca { update(geo, model, sig), hide(), destroy() }.
export function mountNewsLayer(host, { fmt }) {
  const layer = document.createElement('div');
  layer.className = 'nws-layer';
  const tip = document.createElement('div');
  tip.className = 'tip nws-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  layer.appendChild(tip);
  host.appendChild(layer);
  const btns = new Map();
  let model = null, sig = '', openKey = null;

  function place(b) {
    const hw = host.clientWidth, w = tip.offsetWidth, h = tip.offsetHeight;
    const x = Number(b.dataset.x), y = Number(b.dataset.y);
    const below = y < host.clientHeight / 2; // etykiety dni u góry: dymek pod nimi, znaczniki u dołu: nad nimi
    tip.style.left = `${Math.max(4, Math.min(hw - w - 4, x - w / 2))}px`;
    tip.style.top = `${Math.max(4, below ? y + 14 : y - h - 12)}px`;
  }
  function show(b) {
    const d = model && tipFor(b.dataset.k, model, fmt());
    if (!d) return hide();
    tip.innerHTML = d.html;
    tip.hidden = false;
    openKey = b.dataset.k;
    b.setAttribute('aria-describedby', tip.id || (tip.id = `nwt-${Math.random().toString(36).slice(2, 8)}`));
    place(b);
  }
  function hide() {
    tip.hidden = true;
    if (openKey) btns.get(openKey)?.removeAttribute('aria-describedby');
    openKey = null;
  }
  // Przyciski nie przekazują wskaźnika do wykresu: przeciąganie i krzyżyk wykresu nie startują na znaczniku.
  const stop = (ev) => ev.stopPropagation();
  function make(h) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nws-hit';
    b.dataset.k = h.key;
    b.addEventListener('pointerdown', stop);
    b.addEventListener('pointermove', stop);
    b.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') show(b); });
    b.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') hide(); });
    b.addEventListener('focus', () => show(b));
    b.addEventListener('blur', () => { if (openKey === b.dataset.k) hide(); });
    b.addEventListener('click', (ev) => { ev.stopPropagation(); if (openKey === b.dataset.k && ev.detail !== 0 && !tip.hidden) hide(); else show(b); });
    b.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !tip.hidden) { ev.stopPropagation(); hide(); } });
    layer.appendChild(b);
    return b;
  }
  const outside = (ev) => { if (!tip.hidden && !ev.target.closest?.('.nws-hit')) hide(); };
  document.addEventListener('pointerdown', outside, true);

  // geo: wynik newsGeometry (albo null = nakładka wyłączona); model: wynik buildNewsModel; sig: podpis modelu i strefy (zmiana odświeża opisy przycisków).
  function update(geo, m, newSig = '') {
    model = m;
    const hits = geo ? geo.hits : [];
    const seen = new Set();
    for (const h of hits) {
      seen.add(h.key);
      let b = btns.get(h.key);
      if (!b) { b = make(h); btns.set(h.key, b); }
      const l = `${Math.round(h.x - h.w / 2)}px`, tp = `${Math.round(h.y - h.h / 2)}px`, w = `${h.w}px`, ht = `${h.h}px`;
      if (b.style.left !== l) b.style.left = l;
      if (b.style.top !== tp) b.style.top = tp;
      if (b.style.width !== w) b.style.width = w;
      if (b.style.height !== ht) b.style.height = ht;
      b.dataset.x = String(h.x); b.dataset.y = String(h.y);
      if (b._sig !== newSig || sig !== newSig) {
        b._sig = newSig;
        const d = m ? tipFor(h.key, m, fmt()) : null;
        if (d) b.setAttribute('aria-label', d.text);
      }
    }
    sig = newSig;
    for (const [k, b] of btns) if (!seen.has(k)) { if (openKey === k) hide(); b.remove(); btns.delete(k); }
    if (openKey && btns.has(openKey)) { const b = btns.get(openKey); if (!tip.hidden) { const d = tipFor(openKey, m, fmt()); if (d) { tip.innerHTML = d.html; place(b); } } }
  }
  function destroy() { document.removeEventListener('pointerdown', outside, true); layer.remove(); btns.clear(); }
  return { update, hide, destroy, element: layer };
}
