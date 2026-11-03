// Szuflada pod wykresami replayu Backtest (pakiet L, 31.10.2026), jak dolny panel FX Replay: zakładki Pozycje / Zlecenia / Historia.
// [U] 31.10.2026 «Przyjmuję wszystkie» (szuflada pozycji, zleceń i historii z wynikiem na żywo i akcjami, jak „Position Drawer” FX Replay)
// Pozycje: wynik na żywo ($, R, pkt), MAE/MFE do chwili bieżącej, czas w pozycji, ryzyko teraz, komórki SL i TP do edycji (1.7-1: klik → pole ceny, Enter zapisuje, Esc cofa, ↑/↓ o tick,
// Shift o 1 pkt, pusta wartość + Enter usuwa poziom, błąd pod polem), akcje BE, Część…, Zamknij. Zlecenia: cena, SL, TP, ryzyko $, Anuluj.
// Historia: zamknięte trade'y sesji (najnowsze u góry) ze stanem opisu i wysyłki oraz przyciskami „Journal” i „Usuń” ([U] 2026-11-01 «Archiwum Notion + Cofnij»: usuwanie trade'a z cofnięciem).
// Wiersze nie są przebudowywane przy każdej klatce odtwarzania: przy tym samym zestawie wierszy zmienia się tylko tekst komórek (kliknięcie w trakcie odtwarzania trafia).
// English: replay bottom drawer (positions / orders / history) with live P&L, MAE/MFE and actions; cells update in place while the row set is unchanged.
import { t, locale } from './i18n.js';
import { esc, fmtR, fmtUsdFull as fmtMoney } from './format.js';
import { pxText } from './bt-journal.js';
import { journalState } from './bt-notion.js';
import { TICK, MULT } from './bt-wypelnienia.js';
import { priceText } from './bt-czas.js';

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

  const th = (cols) => `<thead><tr>${cols.map(([l, n, c]) => { const cl = [n ? 'num' : '', c || ''].filter(Boolean).join(' '); return `<th scope="col"${cl ? ` class="${cl}"` : ''}>${esc(l)}</th>`; }).join('')}</tr></thead>`;
  const cell = (k, cl = 'num') => `<td class="${cl}" data-c="${k}"></td>`;
  // 1.7-2: powód wyjścia po ludzku (lista porcji w rozwiniętym wierszu pozycji)
  const reasonText = (r) => ({ sl: 'SL', tp: 'TP', manual: t('ręcznie'), partial: t('część'), eod: t('koniec dnia'), reverse: t('odwrócenie') })[r] || String(r || '');
  // 1.7-5: wyjście z poziomu drabiny nazywa się TP1…TP4 (numer z planu pozycji), pojedynczy TP zostaje „TP”
  const exitReason = (p, x) => { const rk = x.tpId && (p.tpPlan || []).length > 1 ? (p.tpPlan || []).find((r) => r.id === x.tpId)?.rank : null; return rk ? `TP${rk}` : reasonText(x.reason); };
  // komórka TP: nietrafione poziomy „18 330,00 (50%) · 18 370,00” (procent przy poziomach oprócz ostatniego), jeden poziom sama cena
  const tpCellText = (p) => {
    if (!p.tpPlan) return p.tp != null ? pxText(p.tp) : '–';
    const open = p.tpPlan.filter((r) => !r.hit);
    return open.length ? open.map((r) => (open.length > 1 && !r.last ? `${pxText(r.price)} (${r.pct}%)` : pxText(r.price))).join(' · ') : '–';
  };
  // lista porcji i wyjść pozycji: czas, cena, ilość, powód, wynik porcji (po średniej pozycji w chwili wyjścia)
  function detRow(p, cols) {
    const s = p.dir === 'Short' ? -1 : 1, m = MULT[p.instrument] || 0, tm = (x) => (last ? last.fmtTime(x) : '');
    const ins = (p.fills || []).map((x) => `<li><b class="pos">+${esc(x.qty)}</b> @ ${esc(pxText(x.price))} <span class="note">${esc(tm(x.t))}</span></li>`).join('');
    const outs = (p.exits || []).map((x) => { const usd = (x.price - (Number.isFinite(x.basis) ? x.basis : p.avg)) * s * x.qty * m; return `<li><b class="neg">−${esc(x.qty)}</b> @ ${esc(pxText(x.price))} <span class="note">${esc(tm(x.t))} · ${esc(exitReason(p, x))}</span> <span class="${cls(usd)}">${esc(fmtMoney(usd))}</span></li>`; }).join('');
    return `<tr class="bt-dk-det" data-det="${esc(p.instrument)}"><td colspan="${cols}"><div class="bt-dk-dl"><div><span class="lbl">${esc(t('Porcje wejścia'))}</span><ul>${ins}</ul></div><div><span class="lbl">${esc(t('Wyjścia pozycji'))}</span><ul>${outs || `<li class="note">${esc(t('brak'))}</li>`}</ul></div></div></td></tr>`;
  }
  const expanded = new Set();
  function posRows(m) {
    if (!m.positions.length) return `<p class="note bt-dk-empty">${esc(t('Brak otwartych pozycji.'))}</p>`;
    const head = th([[t('Instrument')], [t('Kierunek')], [t('Ilość'), 1], [t('Wejście'), 1], ['SL', 1], ['TP', 1], [t('Cena'), 1], ['P&L', 1], ['R', 1], [t('pkt'), 1], [t('Ryzyko'), 1, 'bt-dk-risk'], ['MAE / MFE', 1], [t('Auto BE'), 0, 'bt-dk-abec'], [t('W pozycji'), 1], ['']]);
    // komórki SL i TP to przyciski: klik zamienia komórkę w pole ceny (edycja w miejscu)
    const lv = (f, k) => `<td class="num bt-dk-lvc" data-c="${f}"><button type="button" class="bt-dk-lv" data-dka="edit" data-f="${f}" data-k="${esc(k)}" aria-label="${esc(f === 'sl' ? t('Zmień SL') : t('Zmień TP'))}"></button></td>`;
    return `<table class="tbl bt-dk-t bt-dk-pos">${head}<tbody>${m.positions.map((p) => `<tr data-row="${esc(p.instrument)}">
      <td><button type="button" class="icon-btn bt-dk-x" data-dka="expand" data-k="${esc(p.instrument)}" aria-expanded="${expanded.has(p.instrument)}" aria-label="${esc(t('Pokaż porcje i wyjścia'))}" title="${esc(t('Pokaż porcje i wyjścia'))}"></button>${esc(p.instrument)}</td><td class="${p.dir === 'Long' ? 'pos' : 'neg'}">${esc(p.dir === 'Short' ? t('Short') : t('Long'))}</td>
      ${cell('qty')}${cell('entry')}${lv('sl', p.instrument)}${lv('tp', p.instrument)}${cell('last')}${cell('usd')}${cell('r')}${cell('pts')}${cell('risk', 'num bt-dk-risk')}${cell('exc')}<td class="bt-dk-abec" data-c="abe"><span class="bt-dk-abet"></span><button type="button" class="icon-btn bt-dk-abex" data-dka="abeoff" data-k="${esc(p.instrument)}" aria-label="${esc(t('Wyłącz auto BE'))}" title="${esc(t('Wyłącz auto BE'))}" hidden>×</button></td>${cell('held')}
      <td class="bt-dk-a"><button type="button" class="btn sm" data-dka="be" data-k="${esc(p.instrument)}">BE</button><button type="button" class="btn sm" data-dka="part" data-k="${esc(p.instrument)}">${esc(t('Część…'))}</button><button type="button" class="btn sm" data-dka="close" data-k="${esc(p.instrument)}">${esc(t('Zamknij'))}</button><button type="button" class="btn sm" data-dka="reverse" data-k="${esc(p.instrument)}">${esc(t('Odwróć'))}</button></td></tr>${expanded.has(p.instrument) ? detRow(p, 14) : ''}`).join('')}</tbody></table>`;
  }
  function ordRows(m) {
    if (!m.orders.length) return `<p class="note bt-dk-empty">${esc(t('Brak zleceń oczekujących.'))}</p>`;
    const head = th([[t('Instrument')], [t('Strona')], [t('Typ')], [t('Ilość'), 1], [t('Cena'), 1], ['SL', 1], ['TP', 1], [t('Ryzyko'), 1], ['']]);
    return `<table class="tbl bt-dk-t bt-dk-ord">${head}<tbody>${m.orders.map((o) => `<tr data-row="${esc(o.id)}">
      <td>${esc(o.instrument)}</td><td class="${o.side === 'buy' ? 'pos' : 'neg'}">${esc(o.intent === 'add' ? t('Dołóż') : o.side === 'buy' ? t('Kup') : t('Sprzedaj'))}</td><td>${esc(o.type)}</td>
      ${cell('qty')}${cell('price')}${cell('sl')}${cell('tp')}${cell('risk')}
      <td class="bt-dk-a"><button type="button" class="btn sm" data-dka="cancel" data-id="${esc(o.id)}">${esc(t('Anuluj'))}</button></td></tr>`).join('')}</tbody></table>`;
  }
  function histRows(m) {
    if (!m.trades.length) return `<p class="note bt-dk-empty">${esc(t('Zamknięte trade\'y pojawią się tutaj.'))}</p>`;
    const L = STATE_LABEL();
    const head = th([['#'], [t('Instrument')], [t('Kierunek')], [t('Ilość'), 1], [t('Wejście'), 1], [t('Wyjście'), 1], ['P&L', 1], ['R', 1], ['MAE / MFE', 1], [t('Setup')], [t('Stan'), 0, 'bt-dk-stc'], ['']]);
    const rows = [...m.trades].reverse().map((x) => {
      const st = journalState(x);
      return `<tr data-row="${esc(x.id)}"><td>${esc(x.id)}${x.reverseOf ? `<span class="note bt-dk-rev" title="${esc(t('Odwrócenie trade\'a {id}', { id: x.reverseOf }))}"> ← ${esc(x.reverseOf)}</span>` : ''}</td><td>${esc(x.instrument)}<span class="bt-dk-st2"><span class="bt-st-j" data-st="${st}">${esc(L[st])}</span></span></td><td class="${x.dir === 'Long' ? 'pos' : 'neg'}">${esc(x.dir === 'Short' ? t('Short') : t('Long'))}</td>
        <td class="num">${esc(x.qty)}</td><td class="num">${(x.fills || []).length > 1 ? `<span class="note">${esc(t('śr.'))} </span>` : ''}${esc(pxText(x.entryPrice))}<span class="note"> ${esc(m.fmtTime(x.entryT))}</span></td><td class="num">${esc(pxText(x.exitPrice))}<span class="note"> ${esc(m.fmtTime(x.exitT))}</span></td>
        <td class="num ${cls(x.pnl)}">${esc(Number.isFinite(x.pnl) ? fmtMoney(x.pnl) : '–')}</td><td class="num ${cls(x.r)}">${esc(Number.isFinite(x.r) ? fmtR(x.r) : '–')}</td>
        <td class="num">${esc(Number.isFinite(x.maeR) ? fmtR(x.maeR) : '–')} / ${esc(Number.isFinite(x.mfeR) ? fmtR(x.mfeR) : '–')}</td>
        <td>${esc(x.setup || '–')}</td><td class="bt-dk-stc"><span class="bt-st-j" data-st="${st}" title="${esc(x.notion?.error || '')}">${esc(L[st])}</span></td>
        <td class="bt-dk-a"><button type="button" class="btn sm" data-dka="journal" data-id="${esc(x.id)}">Journal</button><button type="button" class="btn sm ghost bt-dk-del" data-dka="delete" data-id="${esc(x.id)}" aria-label="${esc(t('Usuń trade {id}', { id: x.id }))}">${esc(t('Usuń'))}</button></td></tr>`;
    }).join('');
    return `<table class="tbl bt-dk-t bt-dk-hist">${head}<tbody>${rows}</tbody></table>`;
  }
  // komórka SL/TP: przycisk z tekstem, albo (w edycji) pole ceny, którego paint nie rusza
  let editing = null;
  function setLv(row, f, inst, v) {
    if (editing && editing.k === inst && editing.f === f) return;
    const b = row.querySelector(`[data-c="${f}"] [data-dka="edit"]`);
    if (b && b.textContent !== v) b.textContent = v;
  }
  // ryzyko teraz: kwota przy SL po stronie straty (ujemna) albo zablokowany zysk (dodatnia), bez SL tekst ostrzeżenia
  function setRisk(row, p) {
    const td = row.querySelector('[data-c="risk"]');
    if (!td) return;
    const txt = p.sl == null ? t('bez SL') : fmtMoney(p.slSide > 0 ? p.risk : p.slSide < 0 ? -p.risk : 0);
    if (td.textContent !== txt) td.textContent = txt;
    td.classList.toggle('warn', p.sl == null); td.classList.toggle('pos', p.sl != null && p.slSide > 0); td.classList.toggle('neg', p.sl != null && p.slSide < 0);
  }
  const setText = (row, k, v, c) => { const td = row.querySelector(`[data-c="${k}"]`); if (!td) return; if (td.textContent !== v) td.textContent = v; if (c !== undefined) { td.classList.toggle('pos', c === 'pos'); td.classList.toggle('neg', c === 'neg'); } };
  function fill(m) {
    if (pref.tab === 'pos') for (const p of m.positions) {
      const row = body.querySelector(`[data-row="${CSS.escape(p.instrument)}"]`);
      if (!row) continue;
      setText(row, 'qty', `${p.qty}/${p.qty0}`);
      // 1.7-2: przy kilku porcjach „śr. 18 290,25 (3)” (średnia otwartej części i liczba wejść)
      setText(row, 'entry', (p.fills || []).length > 1 ? `${t('śr.')} ${pxText(p.entryPrice)} (${p.fills.length})` : pxText(p.entryPrice));
      setLv(row, 'sl', p.instrument, p.sl != null ? `${pxText(p.sl)}${p.be ? ' · BE' : ''}` : '–'); setLv(row, 'tp', p.instrument, tpCellText(p));
      setText(row, 'last', p.last != null ? pxText(p.last) : '–'); setText(row, 'usd', fmtMoney(p.usd), cls(p.usd)); setText(row, 'r', fmtR(p.r), cls(p.r)); setText(row, 'pts', pts(p.pts), cls(p.pts));
      // R „—” bez SL (P5); przy ryzyku pierwotnym 0 (BE postawiony zamiast SL) z notką
      const rc = row.querySelector('[data-c="r"]'); const rt = p.rUsd === 0 ? t('ryzyko pierwotne 0') : ''; if (rc && rc.title !== rt) rc.title = rt;
      setRisk(row, p);
      // 1.7-3: kolumna „Auto BE” (od 1280 px): ten sam opis co w panelu × („przy +1R (18 330,00) · BE+0t”), × wyłącza próg
      const abeT = row.querySelector('.bt-dk-abet'), abeX = row.querySelector('.bt-dk-abex'), ai = p.abe || { armed: false, text: '' };
      if (abeT && abeT.textContent !== (ai.text || '–')) abeT.textContent = ai.text || '–';
      if (abeX && abeX.hidden !== !ai.armed) abeX.hidden = !ai.armed;
      setText(row, 'exc', `${Number.isFinite(p.maeR) ? fmtR(p.maeR) : '–'} / ${Number.isFinite(p.mfeR) ? fmtR(p.mfeR) : '–'}`); setText(row, 'held', fmtHeld(p.held));
      row.querySelectorAll('button').forEach((b) => { b.disabled = b.dataset.dka === 'expand' ? false : !!m.rw; });
      const rv = row.querySelector('[data-dka="reverse"]');
      if (rv) { const tt = t('Odwróć: zamknie {n}, {dir} {n}', { n: p.qty, dir: p.dir === 'Long' ? t('Short') : t('Long') }); if (rv.title !== tt) rv.title = tt; }
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
    const s = JSON.stringify([pref.tab, pref.tab === 'pos' ? m.positions.map((p) => [p.instrument, p.dir, p.entryT, p.qty, p.openQty, expanded.has(p.instrument), (p.fills || []).length, (p.exits || []).length]) : pref.tab === 'ord' ? m.orders.map((o) => o.id) : m.trades.map((x) => [x.id, journalState(x), x.setup, x.pnl, x.notion?.error || '', x.reverseOf || ''])]);
    if (s !== sig) {
      sig = s; editing = null;
      body.innerHTML = pref.tab === 'pos' ? posRows(m) : pref.tab === 'ord' ? ordRows(m) : histRows(m);
    }
    fill(m);
  }
  function stopEdit(refocus = true) {
    const e = editing;
    if (!e) return;
    editing = null;
    const td = host.querySelector(`tr[data-row="${CSS.escape(e.k)}"] [data-c="${e.f}"]`);
    if (td) { td.innerHTML = `<button type="button" class="bt-dk-lv" data-dka="edit" data-f="${e.f}" data-k="${esc(e.k)}" aria-label="${esc(e.f === 'sl' ? t('Zmień SL') : t('Zmień TP'))}"></button>`; if (refocus) td.querySelector('button')?.focus({ preventScroll: true }); }
    if (last) paint(last);
  }
  // 1.7-5: edytor listy TP w komórce: wiersz na każdy nietrafiony poziom (cena, procent poza ostatnim = „reszta”) i pusty wiersz na nowy poziom (do 4); Enter zapisuje całość,
  // pusta cena usuwa poziom, Esc cofa. Błąd silnika zostaje pod listą, zaznaczone są pola zmienione w tej edycji.
  function startTpEdit(k) {
    stopEdit(false);
    const p = last?.positions.find((x) => x.instrument === k);
    const td = host.querySelector(`tr[data-row="${CSS.escape(k)}"] [data-c="tp"]`);
    if (!p || !td) return;
    editing = { k, f: 'tp' };
    const open = (p.tpPlan || []).filter((r) => !r.hit), total = (p.tps || []).length;
    const rows = open.map((r) => `<div class="bt-dk-tpr" data-id="${esc(r.id)}"><input class="sp-in bt-dk-in" name="tpr" type="text" inputmode="decimal" autocomplete="off" aria-label="${esc(t('TP{n} (cena)', { n: r.rank }))}" value="${esc(String(r.price))}" data-orig="${esc(String(r.price))}">${open.length > 1 ? (r.last ? `<span class="note bt-dk-rest">${esc(t('reszta'))}</span>` : `<input class="sp-in bt-dk-in bt-dk-pct" name="tpp" type="text" inputmode="numeric" autocomplete="off" aria-label="${esc(t('TP{n} (%)', { n: r.rank }))}" value="${esc(String(r.pct))}" data-orig="${esc(String(r.pct))}"><span class="note">%</span>`) : ''}</div>`);
    if (total < 4) rows.push(`<div class="bt-dk-tpr" data-id=""><input class="sp-in bt-dk-in" name="tpr" type="text" inputmode="decimal" autocomplete="off" aria-label="${esc(t('Nowy poziom TP (cena)'))}" placeholder="${esc(t('nowy poziom'))}" data-orig=""></div>`);
    td.innerHTML = `<div class="bt-dk-tpe">${rows.join('')}<span class="bt-dk-err" role="alert" hidden></span></div>`;
    const inp = td.querySelector('input');
    inp.focus({ preventScroll: true }); inp.select();
  }
  function saveTpEdit(inp) {
    const e = editing;
    if (!e || e.f !== 'tp') return;
    const box = inp.closest('.bt-dk-tpe'), err = box.querySelector('.bt-dk-err');
    const fail = (msg, bad) => { err.textContent = msg; err.hidden = false; box.querySelectorAll('input').forEach((x) => x.removeAttribute('aria-invalid')); bad.forEach((x) => x.setAttribute('aria-invalid', 'true')); };
    const rows = [...box.querySelectorAll('.bt-dk-tpr')].map((r) => ({ id: r.dataset.id || null, price: priceText(r.querySelector('[name="tpr"]').value, locale()), pct: r.querySelector('[name="tpp"]')?.value.trim() ?? '', el: r }));
    for (const r of rows) {
      if (r.price !== '' && !(Number.isFinite(Number(r.price)) && Number(r.price) > 0)) { fail(t('Wpisz cenę liczbą.'), [r.el.querySelector('[name="tpr"]')]); return; }
    }
    const res = onAction('tps', { instrument: e.k, rows: rows.map(({ id, price, pct }) => ({ id, price, pct })) });
    if (res && res.ok === false) {
      const changed = [...box.querySelectorAll('input')].filter((x) => x.value.trim() !== (x.dataset.orig ?? ''));
      fail(res.text || t('Zlecenie odrzucone.'), changed.length ? changed : [...box.querySelectorAll('input')]);
      return;
    }
    stopEdit();
  }
  function startEdit(k, f) {
    if (last?.rw) return;
    if (f === 'tp') { startTpEdit(k); return; }
    stopEdit(false);
    const p = last?.positions.find((x) => x.instrument === k);
    const td = host.querySelector(`tr[data-row="${CSS.escape(k)}"] [data-c="${f}"]`);
    if (!p || !td) return;
    editing = { k, f };
    const cur = f === 'sl' ? p.sl : p.tp;
    td.innerHTML = `<input class="sp-in bt-dk-in" name="lvl" type="text" inputmode="decimal" autocomplete="off" aria-label="${esc(f === 'sl' ? t('SL (cena)') : t('TP (cena)'))}" value="${cur != null ? esc(String(cur)) : ''}" placeholder="${esc(t('usuń: puste'))}"><span class="bt-dk-err" role="alert" hidden></span>`;
    const inp = td.querySelector('input');
    // tabela szuflady przewija się w poziomie (telefon): pole ceny wjeżdża na lewy brzeg widoku, spod przyklejonej kolumny akcji
    inp.focus({ preventScroll: true }); inp.select();
    // edytowana komórka w całości w widocznej części (przyklejona kolumna akcji po prawej ją zasłania): dock przewija się w poziomie
    requestAnimationFrame(() => {
      // przewija ten przodek, który faktycznie ma przewijanie w poziomie
      let sc = inp.parentElement;
      while (sc && sc !== document.body && !(sc.scrollWidth > sc.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(sc).overflowX))) sc = sc.parentElement;
      if (!sc || sc === document.body) sc = host;
      const dr = sc.getBoundingClientRect(), ir = inp.getBoundingClientRect(), stick = host.querySelector('td.bt-dk-a'), right = stick && getComputedStyle(stick).position === 'sticky' ? stick.getBoundingClientRect().left : dr.right;
      if (ir.left < dr.left + 4) sc.scrollLeft -= dr.left + 4 - ir.left;
      else if (ir.right > right - 4) sc.scrollLeft += ir.right - right + 4;
    });
  }
  // Enter: pusta wartość usuwa poziom (P6), zła liczba i odrzucenie silnika zostają pod polem (tekst z kropką w kolorze straty, bez podkładki)
  function saveEdit(inp) {
    const e = editing;
    if (!e) return;
    const raw = priceText(inp.value, locale()), err = inp.closest('td').querySelector('.bt-dk-err');
    const fail = (msg) => { err.textContent = msg; err.hidden = false; inp.setAttribute('aria-invalid', 'true'); };
    let price = null;
    if (raw !== '') { price = Number(raw); if (!Number.isFinite(price) || price <= 0) { fail(t('Wpisz cenę liczbą.')); return; } }
    const res = onAction('level', { instrument: e.k, field: e.f, price });
    if (res && res.ok === false) { fail(res.text || t('Zlecenie odrzucone.')); return; }
    stopEdit();
  }
  function setTab(k) { if (!TABS.includes(k)) return; pref.tab = k; pref.open = true; save(); markTabs(); sig = ''; if (last) paint(last); }
  function onClick(ev) {
    const b = ev.target.closest('button');
    if (!b || b.disabled || !host.contains(b)) return;
    if (b.dataset.dk) { setTab(b.dataset.dk); return; }
    if (b === fold) { pref.open = !pref.open; save(); markTabs(); sig = ''; if (last) paint(last); onAction('fold', { open: pref.open }); return; }
    if (b.dataset.dka === 'edit') { startEdit(b.dataset.k, b.dataset.f); return; }
    if (b.dataset.dka === 'expand') { const k = b.dataset.k; if (expanded.has(k)) expanded.delete(k); else expanded.add(k); sig = ''; if (last) paint(last); host.querySelector(`[data-dka="expand"][data-k="${CSS.escape(k)}"]`)?.focus({ preventScroll: true }); return; }
    if (b.dataset.dka) onAction(b.dataset.dka, { instrument: b.dataset.k, id: b.dataset.id });
  }
  // strzałki w liście zakładek (wzorzec tablist)
  function onKey(ev) {
    const tinp = ev.target.closest?.('.bt-dk-tpe input');
    if (tinp && editing?.f === 'tp') {
      if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); saveTpEdit(tinp); } else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); stopEdit(); } else if ((ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && tinp.name === 'tpr') {
        ev.preventDefault(); ev.stopPropagation();
        const cur = Number(priceText(tinp.value, locale())), base = Number.isFinite(cur) && tinp.value.trim() !== '' ? cur : Number(last?.positions.find((x) => x.instrument === editing.k)?.last);
        if (Number.isFinite(base)) { tinp.value = String(Number((base + (ev.key === 'ArrowUp' ? 1 : -1) * TICK * (ev.shiftKey ? 4 : 1)).toFixed(2))); tinp.removeAttribute('aria-invalid'); const er = tinp.closest('.bt-dk-tpe').querySelector('.bt-dk-err'); if (er) er.hidden = true; }
      }
      return;
    }
    const inp = ev.target.closest?.('input[name="lvl"]');
    if (inp && editing) {
      if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); saveEdit(inp); } else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); stopEdit(); } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
        ev.preventDefault(); ev.stopPropagation();
        const cur = Number(priceText(inp.value, locale())), base = Number.isFinite(cur) && inp.value.trim() !== '' ? cur : Number(last?.positions.find((x) => x.instrument === editing.k)?.last);
        if (Number.isFinite(base)) { inp.value = String(Number((base + (ev.key === 'ArrowUp' ? 1 : -1) * TICK * (ev.shiftKey ? 4 : 1)).toFixed(2))); inp.removeAttribute('aria-invalid'); const er = inp.closest('td').querySelector('.bt-dk-err'); if (er) er.hidden = true; }
      }
      return;
    }
    const b = ev.target.closest?.('[data-dk]');
    if (!b || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    ev.preventDefault(); ev.stopPropagation();
    const i = TABS.indexOf(pref.tab), n = TABS[(i + (ev.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setTab(n);
    host.querySelector(`[data-dk="${n}"]`)?.focus();
  }
  host.addEventListener('click', onClick);
  host.addEventListener('keydown', onKey);
  host.addEventListener('input', (ev) => { if (ev.target.name === 'tpr' || ev.target.name === 'tpp') { ev.target.removeAttribute('aria-invalid'); const er = ev.target.closest('.bt-dk-tpe')?.querySelector('.bt-dk-err'); if (er) er.hidden = true; } if (ev.target.name === 'lvl') { ev.target.removeAttribute('aria-invalid'); const er = ev.target.closest('td')?.querySelector('.bt-dk-err'); if (er) er.hidden = true; } });
  return {
    paint, setTab, tab: () => pref.tab, open: () => pref.open, el: host,
    destroy() { host.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); host.innerHTML = ''; host.hidden = true; },
  };
}
