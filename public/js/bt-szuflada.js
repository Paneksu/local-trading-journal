// Szuflada pod wykresami replayu Backtest (pakiet L, 31.10.2026), jak dolny panel FX Replay: zakładki Pozycje / Zlecenia / Historia.
// [U] 31.10.2026 «Przyjmuję wszystkie» (szuflada pozycji, zleceń i historii z wynikiem na żywo i akcjami, jak „Position Drawer” FX Replay)
// Pozycje: wynik na żywo ($, R, pkt), MAE/MFE do chwili bieżącej, czas w pozycji, akcje BE, 50%, Zamknij. Zlecenia: cena, SL, TP, ryzyko $, Anuluj.
// Historia: zamknięte trade'y sesji (najnowsze u góry) ze stanem opisu i wysyłki i przyciskiem „Journal”.
// Wiersze nie są przebudowywane przy każdej klatce odtwarzania: przy tym samym zestawie wierszy zmienia się tylko tekst komórek (kliknięcie w trakcie odtwarzania trafia).
// English: replay bottom drawer (positions / orders / history) with live P&L, MAE/MFE and actions; cells update in place while the row set is unchanged.
import { t } from './i18n.js';
import { esc, fmtR, fmtMoney } from './format.js';
import { pxText } from './bt-journal.js';
import { journalState } from './bt-notion.js';

export const DOCK_KEY = 'thq.bt.dock.v1'; // wybrana zakładka i zwinięcie (preferencja przeglądarki)
const TABS = ['pos', 'ord', 'hist'];
const cls = (x) => (x > 1e-9 ? 'pos' : x < -1e-9 ? 'neg' : '');
export const STATE_LABEL = () => ({ todo: t('do opisania'), done: t('opisany'), sent: t('wysłany'), changed: t('zmieniony, czeka na wysyłkę'), error: t('błąd wysyłki') });

// Czas w pozycji: „4 min 12 s”, „2 h 05 min”, „3 d 4 h”
export function fmtHeld(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;
  return `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h`;
}
const pts = (x) => `${x > 1e-9 ? '+' : x < -1e-9 ? '−' : ''}${pxText(Math.abs(x))}`;

// mountDock(host, { storage, onAction(kind, payload) }) → { paint(model), tab(), setTab(k), el, destroy }
// model = { positions: [{ instrument, dir, qty, qty0, entryPrice, sl, tp, be, last, pts, usd, r, maeR, mfeR, held }], orders: [{ id, instrument, side, type, qty, price, sl, tp, risk }],
//   trades: Trade[] (zamknięte, kolejność sesji), rw: handel zablokowany, fmtTime(sec) }
export function mountDock(host, { storage = globalThis.localStorage, onAction = () => {} } = {}) {
  // na wąskim ekranie (≤ 640 px) szuflada startuje zwinięta, żeby wykres miał miejsce; wybór użytkownika zostaje zapamiętany
  const narrow = !!globalThis.matchMedia?.('(max-width: 640px)')?.matches;
  let pref = { tab: 'pos', open: !narrow };
  try { pref = { ...pref, ...JSON.parse(storage?.getItem(DOCK_KEY) || '{}') }; } catch { /* zły wpis */ }
  if (!TABS.includes(pref.tab)) pref.tab = 'pos';
  host.hidden = false;
  host.innerHTML = `
    <div class="bt-dk-h">
      <div class="seg sm bt-dk-tabs" role="tablist" aria-label="${esc(t('Pozycje i konto'))}">
        <button type="button" role="tab" data-dk="pos">${esc(t('Pozycje'))} <span class="bt-dk-n" data-n="pos"></span></button>
        <button type="button" role="tab" data-dk="ord">${esc(t('Zlecenia'))} <span class="bt-dk-n" data-n="ord"></span></button>
        <button type="button" role="tab" data-dk="hist">${esc(t('Historia'))} <span class="bt-dk-n" data-n="hist"></span></button>
      </div>
      <button type="button" class="btn sm ghost bt-dk-fold" aria-expanded="true">${esc(t('Zwiń'))}</button>
    </div>
    <div class="bt-dk-b" role="tabpanel"></div>`;
  const body = host.querySelector('.bt-dk-b'), fold = host.querySelector('.bt-dk-fold');
  let sig = '', last = null;
  const save = () => { try { storage?.setItem(DOCK_KEY, JSON.stringify(pref)); } catch { /* localStorage niedostępny */ } };
  function markTabs() {
    host.querySelectorAll('[data-dk]').forEach((b) => { const on = b.dataset.dk === pref.tab; b.setAttribute('aria-selected', String(on)); b.setAttribute('aria-pressed', String(on)); b.tabIndex = on ? 0 : -1; });
    body.hidden = !pref.open;
    host.dataset.open = String(pref.open);
    fold.setAttribute('aria-expanded', String(pref.open));
    fold.textContent = pref.open ? t('Zwiń') : t('Rozwiń');
  }
  markTabs();

  const th = (cols) => `<thead><tr>${cols.map(([l, n]) => `<th scope="col"${n ? ' class="num"' : ''}>${esc(l)}</th>`).join('')}</tr></thead>`;
  const cell = (k, cl = 'num') => `<td class="${cl}" data-c="${k}"></td>`;
  function posRows(m) {
    if (!m.positions.length) return `<p class="note bt-dk-empty">${esc(t('Brak otwartych pozycji.'))}</p>`;
    const head = th([[t('Instrument')], [t('Kierunek')], [t('Ilość'), 1], [t('Wejście'), 1], ['SL', 1], ['TP', 1], [t('Cena'), 1], ['P&L', 1], ['R', 1], [t('pkt'), 1], ['MAE / MFE', 1], [t('W pozycji'), 1], ['']]);
    return `<table class="tbl bt-dk-t bt-dk-pos">${head}<tbody>${m.positions.map((p) => `<tr data-row="${esc(p.instrument)}">
      <td>${esc(p.instrument)}</td><td class="${p.dir === 'Long' ? 'pos' : 'neg'}">${esc(p.dir === 'Short' ? t('Short') : t('Long'))}</td>
      ${cell('qty')}${cell('entry')}${cell('sl')}${cell('tp')}${cell('last')}${cell('usd')}${cell('r')}${cell('pts')}${cell('exc')}${cell('held')}
      <td class="bt-dk-a"><button type="button" class="btn sm" data-dka="be" data-k="${esc(p.instrument)}">BE</button><button type="button" class="btn sm" data-dka="half" data-k="${esc(p.instrument)}">50%</button><button type="button" class="btn sm" data-dka="close" data-k="${esc(p.instrument)}">${esc(t('Zamknij'))}</button></td></tr>`).join('')}</tbody></table>`;
  }
  function ordRows(m) {
    if (!m.orders.length) return `<p class="note bt-dk-empty">${esc(t('Brak zleceń oczekujących.'))}</p>`;
    const head = th([[t('Instrument')], [t('Strona')], [t('Typ')], [t('Ilość'), 1], [t('Cena'), 1], ['SL', 1], ['TP', 1], [t('Ryzyko'), 1], ['']]);
    return `<table class="tbl bt-dk-t bt-dk-ord">${head}<tbody>${m.orders.map((o) => `<tr data-row="${esc(o.id)}">
      <td>${esc(o.instrument)}</td><td class="${o.side === 'buy' ? 'pos' : 'neg'}">${esc(o.side === 'buy' ? t('Kup') : t('Sprzedaj'))}</td><td>${esc(o.type)}</td>
      ${cell('qty')}${cell('price')}${cell('sl')}${cell('tp')}${cell('risk')}
      <td class="bt-dk-a"><button type="button" class="btn sm" data-dka="cancel" data-id="${esc(o.id)}">${esc(t('Anuluj'))}</button></td></tr>`).join('')}</tbody></table>`;
  }
  function histRows(m) {
    if (!m.trades.length) return `<p class="note bt-dk-empty">${esc(t('Zamknięte trade\'y pojawią się tutaj.'))}</p>`;
    const L = STATE_LABEL();
    const head = th([['#'], [t('Instrument')], [t('Kierunek')], [t('Ilość'), 1], [t('Wejście'), 1], [t('Wyjście'), 1], ['P&L', 1], ['R', 1], ['MAE / MFE', 1], [t('Setup')], [t('Stan')], ['']]);
    const rows = [...m.trades].reverse().map((x) => {
      const st = journalState(x);
      return `<tr data-row="${esc(x.id)}"><td>${esc(x.id)}</td><td>${esc(x.instrument)}</td><td class="${x.dir === 'Long' ? 'pos' : 'neg'}">${esc(x.dir === 'Short' ? t('Short') : t('Long'))}</td>
        <td class="num">${esc(x.qty)}</td><td class="num">${esc(pxText(x.entryPrice))}<span class="note"> ${esc(m.fmtTime(x.entryT))}</span></td><td class="num">${esc(pxText(x.exitPrice))}<span class="note"> ${esc(m.fmtTime(x.exitT))}</span></td>
        <td class="num ${cls(x.pnl)}">${esc(Number.isFinite(x.pnl) ? fmtMoney(x.pnl) : '–')}</td><td class="num ${cls(x.r)}">${esc(Number.isFinite(x.r) ? fmtR(x.r) : '–')}</td>
        <td class="num">${esc(Number.isFinite(x.maeR) ? fmtR(x.maeR) : '–')} / ${esc(Number.isFinite(x.mfeR) ? fmtR(x.mfeR) : '–')}</td>
        <td>${esc(x.setup || '–')}</td><td><span class="bt-st-j" data-st="${st}" title="${esc(x.notion?.error || '')}">${esc(L[st])}</span></td>
        <td class="bt-dk-a"><button type="button" class="btn sm" data-dka="journal" data-id="${esc(x.id)}">Journal</button></td></tr>`;
    }).join('');
    return `<table class="tbl bt-dk-t bt-dk-hist">${head}<tbody>${rows}</tbody></table>`;
  }
  const setText = (row, k, v, c) => { const td = row.querySelector(`[data-c="${k}"]`); if (!td) return; if (td.textContent !== v) td.textContent = v; if (c !== undefined) { td.classList.toggle('pos', c === 'pos'); td.classList.toggle('neg', c === 'neg'); } };
  function fill(m) {
    if (pref.tab === 'pos') for (const p of m.positions) {
      const row = body.querySelector(`[data-row="${CSS.escape(p.instrument)}"]`);
      if (!row) continue;
      setText(row, 'qty', `${p.qty}/${p.qty0}`); setText(row, 'entry', pxText(p.entryPrice)); setText(row, 'sl', `${pxText(p.sl)}${p.be ? ' · BE' : ''}`); setText(row, 'tp', p.tp != null ? pxText(p.tp) : '–');
      setText(row, 'last', p.last != null ? pxText(p.last) : '–'); setText(row, 'usd', fmtMoney(p.usd), cls(p.usd)); setText(row, 'r', fmtR(p.r), cls(p.r)); setText(row, 'pts', pts(p.pts), cls(p.pts));
      setText(row, 'exc', `${Number.isFinite(p.maeR) ? fmtR(p.maeR) : '–'} / ${Number.isFinite(p.mfeR) ? fmtR(p.mfeR) : '–'}`); setText(row, 'held', fmtHeld(p.held));
      row.querySelectorAll('button').forEach((b) => { b.disabled = !!m.rw || (b.dataset.dka === 'half' && p.qty < 2); });
    }
    if (pref.tab === 'ord') for (const o of m.orders) {
      const row = body.querySelector(`[data-row="${CSS.escape(o.id)}"]`);
      if (!row) continue;
      setText(row, 'qty', String(o.qty)); setText(row, 'price', pxText(o.price)); setText(row, 'sl', o.sl != null ? pxText(o.sl) : '–'); setText(row, 'tp', o.tp != null ? pxText(o.tp) : '–');
      setText(row, 'risk', o.risk != null ? fmtMoney(-o.risk) : '–');
      row.querySelector('button').disabled = !!m.rw;
    }
  }
  // paint(model): wiersze przebudowane tylko przy zmianie zestawu (zakładka, id wierszy, stany historii), inaczej tylko tekst komórek
  function paint(m) {
    last = m;
    host.querySelector('[data-n="pos"]').textContent = m.positions.length ? `(${m.positions.length})` : '';
    host.querySelector('[data-n="ord"]').textContent = m.orders.length ? `(${m.orders.length})` : '';
    host.querySelector('[data-n="hist"]').textContent = m.trades.length ? `(${m.trades.length})` : '';
    if (!pref.open) return;
    const s = JSON.stringify([pref.tab, pref.tab === 'pos' ? m.positions.map((p) => p.instrument) : pref.tab === 'ord' ? m.orders.map((o) => o.id) : m.trades.map((x) => [x.id, journalState(x), x.setup, x.pnl, x.notion?.error || ''])]);
    if (s !== sig) {
      sig = s;
      body.innerHTML = pref.tab === 'pos' ? posRows(m) : pref.tab === 'ord' ? ordRows(m) : histRows(m);
    }
    fill(m);
  }
  function setTab(k) { if (!TABS.includes(k)) return; pref.tab = k; pref.open = true; save(); markTabs(); sig = ''; if (last) paint(last); }
  function onClick(ev) {
    const b = ev.target.closest('button');
    if (!b || b.disabled || !host.contains(b)) return;
    if (b.dataset.dk) { setTab(b.dataset.dk); return; }
    if (b === fold) { pref.open = !pref.open; save(); markTabs(); sig = ''; if (last) paint(last); onAction('fold', { open: pref.open }); return; }
    if (b.dataset.dka) onAction(b.dataset.dka, { instrument: b.dataset.k, id: b.dataset.id });
  }
  // strzałki w liście zakładek (wzorzec tablist)
  function onKey(ev) {
    const b = ev.target.closest?.('[data-dk]');
    if (!b || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    ev.preventDefault(); ev.stopPropagation();
    const i = TABS.indexOf(pref.tab), n = TABS[(i + (ev.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setTab(n);
    host.querySelector(`[data-dk="${n}"]`)?.focus();
  }
  host.addEventListener('click', onClick);
  host.addEventListener('keydown', onKey);
  return {
    paint, setTab, tab: () => pref.tab, open: () => pref.open, el: host,
    destroy() { host.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); host.innerHTML = ''; host.hidden = true; },
  };
}
