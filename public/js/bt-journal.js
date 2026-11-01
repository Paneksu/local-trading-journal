// Journaling po zamknięciu trade'a w replayu Backtest (1.5.0, pakiet E1, §10): trade z pozycji (`toTrade`), mały panel w rogu wykresu (`mountJournal`) i lista „do uzupełnienia”.
// W trakcie trade'a nic nie przerywa, po pełnym zamknięciu pojawia się panel: ceny, czasy, R/USD i MAE/MFE są już wypełnione, użytkownik wybiera setup (podpowiedzi + nowy) i opcjonalnie pisze notatkę.
// Enter zapisuje (journal: 'done'), Esc zostawia trade bez opisu na liście „do uzupełnienia”. Panel nie ma żadnych innych pól [U] 30.10.2026 «usuń ocenę wykonania…».
// Trade jest w pliku sesji już w chwili zamknięcia (zapis robi bt-replay.js razem z book), więc zamknięcie karty z otwartym panelem niczego nie gubi.
// L (31.10.2026): panel odchudzony do wyniku, setupu i przycisku „Journal” (notatka i rysunki w klasycznym oknie trade'a, bt-journal-okno.js); trade z prowizją (pnl netto, fee).
// English: closed-position → Trade mapping and the small journaling panel (result + setup + Journal button); Enter saves, Esc leaves the trade to describe.
import { t, locale } from './i18n.js';
import { esc, fmtR, fmtMoney } from './format.js';
import { excursions } from './bt-wypelnienia.js';
import { netResult } from './bt-konto.js';
import { SETUP_RE, SETUP_MAX, listOf } from './bt-notion.js';

export const JOURNAL_MARGIN = 40; // px: panel nie może przecinać pionu świecy przy kursorze ± tyle

// Następny wolny numer trade'a w sesji: 't1', 't2', … (liczy też trade'y z innych dni; numeru nie używa się ponownie)
export function nextTradeId(trades) {
  const ids = (trades || []).map((x) => Number(String(x?.id).slice(1)) || 0);
  return 't' + (Math.max(0, ...ids) + 1);
}

// toTrade(position, { day, contract, stream, drawings, trades }) → Trade (kształt z 00-wspolne). `position` to zamknięta pozycja silnika (exits, entryT, sl0…),
// `stream` to strumień bazowy instrumentu (MAE/MFE z excursions), `drawings` to migawka rysunków instrumentu z dnia (DrawingDoc), `trades` to dotychczasowe trade'y sesji (numeracja).
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 1: prowizja $ za kontrakt opcjonalna, domyślnie 0)
// L: commission = prowizja w obie strony za kontrakt: pnl netto, fee osobno, R z cen.
export function toTrade(position, { day, contract = null, stream = null, drawings = null, trades = [], id = null, commission = 0 } = {}) {
  const res = netResult(position, commission);
  const ex = stream ? excursions(position, stream) : { maeR: null, mfeR: null };
  return {
    id: id || nextTradeId(trades), day, instrument: position.instrument, contract, dir: position.dir, qty: position.qty,
    entryT: position.entryT, entryPrice: position.entryPrice, sl0: position.sl0, sl: position.sl, tp: position.tp ?? null, be: !!position.be,
    exits: (position.exits || []).map((x) => ({ ...x })), exitT: res.exitT, exitPrice: res.exitPrice,
    r: res.r, pnl: res.pnl, fee: res.fee, maeR: ex.maeR, mfeR: ex.mfeR,
    setup: '', notes: '', journal: 'todo', drawings, notion: { id: null, state: 'pending', error: '' },
  };
}

// Lista „do uzupełnienia” = trade'y bez opisu (Esc albo zamknięcie bez zapisu) oraz z błędem wysyłki do Notion (poprawki po review E2, #1).
export const todoOf = listOf;

// Podpowiedzi setupu: opcje z Notion (optionNames.setup), potem setupy z trade'ów sesji; bez duplikatów i pustych.
export function setupSuggestions(notionSetups, trades) {
  const seen = new Set(), out = [];
  for (const s of [...(notionSetups || []), ...(trades || []).map((x) => x?.setup)]) {
    const v = String(s || '').trim();
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  }
  return out;
}

// Który róg: panel (szerokość `panelW`) stoi domyślnie w lewym rogu; jeśli jego prostokąt przecina pion kursora ± margin, idzie do prawego. Przy kolizji w obu zostaje domyślny.
export function pickCorner({ hostW, panelW, cursorX, pad = 8, margin = JOURNAL_MARGIN, prefer = 'left' }) {
  if (!Number.isFinite(cursorX)) return prefer;
  const span = (side) => (side === 'left' ? [pad, pad + panelW] : [hostW - pad - panelW, hostW - pad]);
  const hits = (side) => { const [a, b] = span(side); return b > cursorX - margin && a < cursorX + margin; };
  const other = prefer === 'left' ? 'right' : 'left';
  return hits(prefer) && !hits(other) ? other : prefer;
}

// H2 (ocena wyglądu #10): cena jak na osi wykresu (spacja tysięcy, przecinek w PL)
export const pxText = (x) => (Number.isFinite(x) ? new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x) : '–'); // ten sam format co priceFormatter w bt-wykres.js
// H2 (ocena wyglądu, P2): pion panelu. band = [yMin, yMax] świec pod panelem (albo null); dół, gdy zasłania mniej świec niż góra.
// M poprawki (ocena wyglądu #3): priceY = pion ceny świecy przy kursorze, gdy panel w poziomie leży nad kursorem (na wąskim ekranie panel ma pełną szerokość):
// panel staje po przeciwnej stronie niż ta cena (pasmo wszystkich świec pod panelem obejmowało wtedy cały wykres i wybór był przypadkowy)
export function pickVert({ hostH, panelH, band, bottom = JOURNAL_BOTTOM, pad = 8, priceY = null }) {
  if (Number.isFinite(priceY) && hostH > 0) {
    const hitsB = priceY > hostH - bottom - panelH - 12 && priceY < hostH - bottom + 12, hitsT = priceY > pad - 12 && priceY < pad + panelH + 12;
    if (hitsB !== hitsT) return hitsB ? 'top' : 'bottom';
    if (hitsB && hitsT) return priceY > hostH / 2 ? 'top' : 'bottom';
  }
  if (!band || !Number.isFinite(band[0]) || !Number.isFinite(band[1]) || !(hostH > 0)) return 'bottom';
  const ov = (a, b) => Math.max(0, Math.min(b, band[1]) - Math.max(a, band[0]));
  const low = ov(hostH - bottom - panelH, hostH - bottom), high = ov(pad, pad + panelH);
  return low > high ? 'top' : 'bottom';
}
const JOURNAL_BOTTOM = 36; // .bt-jr { bottom: 36px } w features.css

const defTime = (sec) => new Date(Math.floor(sec) * 1000).toISOString().slice(11, 19);

// mountJournal(host, { trade, setups, onSave(patch), onSkip(), fmtTime, cursorX }) → { close(), el, corner(), place() }
// host = scena wykresu instrumentu (position: relative). cursorX() zwraca x piksela świecy przy kursorze (albo null): od niego zależy róg.
// onSave({ setup, notes }) po Enter (setup wymagany), onSkip() po Esc albo przycisku „Później”. Panel nie przejmuje fokusu: skróty replayu działają dalej, dopóki użytkownik nie kliknie w pole.
// [U] 31.10.2026 «Przyjmuję wszystkie» (J1: szybki panel po zamknięciu zostaje, odchudzony: wynik + Setup + przycisk „Journal”; notatka przechodzi do Journala)
// L: onJournal() otwiera klasyczne okno trade'a (bt-journal-okno.js); onSave dostaje notatkę trade'a bez zmian (pole notatki jest tylko w Journalu).
export function mountJournal(host, { trade, setups = [], known = [], onSave = () => {}, onSkip = () => {}, onJournal = null, fmtTime = defTime, cursorX = () => null, bandY = () => null, priceY = () => null }) {
  const el = document.createElement('div');
  el.className = 'bt-jr';
  el.setAttribute('role', 'group'); el.setAttribute('aria-label', t("Opis trade'a"));
  const r = Number.isFinite(trade.r) ? trade.r : null, usd = Number.isFinite(trade.pnl) ? trade.pnl : null;
  const cl = (x) => (x > 1e-9 ? 'pos' : x < -1e-9 ? 'neg' : '');
  const px = pxText;
  const opts = setups.map((s) => `<option value="${esc(s)}"></option>`).join('');
  const dl = 'btjr-' + String(trade.id).replace(/\W/g, '');
  el.innerHTML = `
    <div class="bt-jr-h"><b>${esc(trade.instrument)} ${esc(trade.dir === 'Short' ? t('Short') : t('Long'))} × ${esc(trade.qty)}</b>
      <span class="bt-jr-r ${cl(r)}">${r == null ? '–' : esc(fmtR(r))}</span><span class="bt-jr-usd ${cl(usd)}">${usd == null ? '' : esc(fmtMoney(usd))}</span></div>
    <p class="bt-jr-px note">${esc(px(trade.entryPrice))} → ${esc(px(trade.exitPrice))} · ${esc(fmtTime(trade.exitT))}</p>
    <label class="bt-jr-f"><span class="lbl">${esc(t('Setup'))}</span><input class="sp-in" name="setup" type="text" list="${dl}" maxlength="${SETUP_MAX}" autocomplete="off" value="${esc(trade.setup || '')}"><datalist id="${dl}">${opts}</datalist></label>
    <div class="bt-jr-b"><span class="note bt-jr-hint" role="status">${onJournal ? `<span>${esc(t('Enter: wpisz setup'))}</span> <span>${esc(t('Ctrl+J: Journal'))}</span>` : `<span>${esc(t('Enter: wpisz setup'))}</span>`}</span>
      <button type="button" class="btn sm" data-jr="skip">${esc(t('Później'))}</button>${onJournal ? `<button type="button" class="btn sm" data-jr="journal" title="${esc(t('Notatka i rysunki w oknie trade\'a (Ctrl+J)'))}">Journal</button>` : ''}<button type="button" class="btn sm primary" data-jr="save">${esc(t('Zapisz'))}</button></div>`;
  host.appendChild(el);
  const f = (n) => el.querySelector(`[name="${n}"]`);
  const hint = el.querySelector('.bt-jr-hint');
  let closed = false, corner = 'left';
  const place = () => {
    const w = el.offsetWidth || 300, hw = host.clientWidth || 0;
    corner = pickCorner({ hostW: hw, panelW: w, cursorX: cursorX() });
    el.dataset.corner = corner;
    const x0 = corner === 'left' ? 8 : hw - 8 - w, cx = cursorX();
    const over = Number.isFinite(cx) && cx >= x0 - 12 && cx <= x0 + w + 12;
    el.dataset.v = pickVert({ hostH: host.clientHeight || 0, panelH: el.offsetHeight || 0, band: bandY(x0, x0 + w), priceY: over ? priceY() : null });
  };
  // M poprawki: położenie liczone ponownie przy zmianie rozmiaru wykresu
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!closed) place(); }) : null;
  ro?.observe(host);
  const close = () => { if (closed) return; closed = true; ro?.disconnect(); el.remove(); };
  const save = () => {
    const setup = f('setup').value.trim();
    if (!setup) { hint.textContent = t('Wybierz albo wpisz setup'); f('setup').setAttribute('aria-invalid', 'true'); f('setup').focus(); return; }
    // review E2 #1: nowy setup tworzy opcję w Notion tylko wg reguły zapisu (lib/writes.mjs); setup z danych Notion (known) przechodzi zawsze
    if (!known.includes(setup) && !SETUP_RE.test(setup)) { hint.textContent = t('Setup: do 40 znaków, tylko litery, cyfry, spacja i znaki . & + -'); f('setup').setAttribute('aria-invalid', 'true'); f('setup').focus(); return; }
    close(); onSave({ setup, notes: trade.notes || '' });
  };
  const skip = () => { close(); onSkip(); };
  // Klawisze w polach panelu nie wychodzą dalej (skróty replayu i rysunków są dla wykresu); poza polami panel nic nie łapie.
  el.addEventListener('keydown', (ev) => {
    const tg = ev.target;
    if (!(tg === f('setup') || tg.closest?.('button'))) return;
    ev.stopPropagation();
    if (ev.key === 'Escape') { ev.preventDefault(); skip(); }
    else if (ev.key === 'Enter' && tg.tagName !== 'BUTTON') { ev.preventDefault(); save(); }
  });
  f('setup').addEventListener('input', () => { f('setup').removeAttribute('aria-invalid'); hint.textContent = t('Enter zapisuje, Esc zostawia do opisania'); });
  // M (31.10.2026): podpowiedź zależy od fokusu: poza polem mówi, jak do niego wejść z klawiatury (Enter w replayu), w polu jak zapisać
  f('setup').addEventListener('focus', () => { if (!f('setup').hasAttribute('aria-invalid')) hint.textContent = t('Enter zapisuje, Esc zostawia do opisania'); });
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-jr]');
    if (b?.dataset.jr === 'save') save(); else if (b?.dataset.jr === 'skip') skip();
    // setup wpisany w panelu idzie do Journala (bez zapisu; zapis w oknie)
    else if (b?.dataset.jr === 'journal') { const s = f('setup').value.trim(); close(); onJournal?.({ setup: s }); }
  });
  place();
  return { close, el, corner: () => corner, place, isOpen: () => !closed, tradeId: trade.id };
}
