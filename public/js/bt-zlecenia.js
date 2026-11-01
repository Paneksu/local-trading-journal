// Panel zleceń replayu Backtest (1.5.0, pakiet C2): Buy/Sell (market, limit, stop), SL i TP w punktach od wejścia, wielkość z ryzyka sesji albo ręczna,
// BE, zamknięcie części i całości, oczekujące zlecenia z anulowaniem. Panel nie liczy wypełnień: woła silnik z bt-wypelnienia.js z `last` = { t: kursor,
// price: zamknięcie ostatniej widocznej świecy bazowej } i oddaje nowy Book przez setBook (wywołujący zapisuje sesję od razu). Pozycja i linie zleceń na wykresie
// idą przez chart.setTrading, a przeciągnięcie SL/TP w rysunku wraca tu jako onPositionEdit → modifyPosition (cena do 0,25; sl0 bez zmian).
// Po cofnięciu kursora przed znak wodny (kursor < book.hw) handel jest zablokowany do „Wróć do bieżącej chwili” (§7, 18a.3).
// D1: kilka wykresów. Panel działa na instrumencie aktywnego wykresu, ale pozycje i zlecenia innych instrumentów też rysują się na swoich wykresach: gdy chart ma setTradingFor(k, stan),
// refresh woła go dla każdego instrumentu z instruments(); edycja SL/TP w rysunku wraca z nazwą instrumentu wykresu (onPositionEdit(pr, k)), a cena bieżąca dla modyfikacji to getLast(k).
// L (31.10.2026): SL/TP w punktach, tickach albo cenie, podgląd ryzyka i celu ($, % salda, R:R) przed złożeniem, akcje dla szuflady i wykresu (zamknięcie procentem,
// BE, anulowanie, przesunięcie zlecenia oczekującego).
// English: order ticket for the replay: market/limit/stop with SL/TP in points, ticks or price, risk preview, size from session risk or manual, BE, partial/full close, pending orders; locked when rewound.
import { t, locale } from './i18n.js';
import { esc, fmtMoney, fmtR } from './format.js';
import { pxText } from './bt-journal.js';
import { sizeFromRisk, placeOrder, cancelOrder, modifyPosition, modifyOrder, moveToBE, closePartial, closeAll, TICK, MULT } from './bt-wypelnienia.js';
import { pctQty } from './bt-konto.js';
import { orderFromDrawing } from './pozycja-staty.js';
import { hintOf } from './bt-czas.js';

const q = (x) => Math.round(x / TICK) * TICK;
const fx = pxText; // H2: ceny pozycji i zleceń jak na osi (spacja tysięcy, przecinek w PL)

// Kody odrzuceń silnika → komunikaty (silnik zwraca kody, UI tłumaczy).
export function rejectText(reason) {
  switch (reason) {
    case 'rewound': return t('Przeglądasz wstecz: handel jest zablokowany.');
    case 'position-open': return t('Na tym instrumencie jest już otwarta pozycja.');
    case 'bad-qty': return t('Wielkość musi być liczbą całkowitą od 1.');
    case 'bad-price': return t('Cena zlecenia jest po złej stronie rynku albo niepoprawna.');
    case 'bad-sl': return t('SL jest po złej stronie ceny.');
    case 'bad-tp': return t('TP jest po złej stronie ceny.');
    case 'no-position': return t('Brak otwartej pozycji.');
    case 'no-order': return t('Tego zlecenia już nie ma.');
    default: return t('Zlecenie odrzucone.');
  }
}

// M (31.10.2026): pamięć pól SL/TP na instrument (preferencja przeglądarki): po ponownym otwarciu replayu Kup/Sprzedaj działają od razu, bez wpisywania SL.
// Jednostka „cena” nie jest zapamiętywana (rynek jest przy następnym otwarciu gdzie indziej); zapis tylko liczb dodatnich.
export const ORD_MEM_KEY = 'thq.bt.ord.v1';
const MEM_UNITS = ['pt', 'tick'];
const memNum = (v) => v === '' || (/^\d+(\.\d+)?$/.test(String(v)) && Number(v) > 0);
function readMem(storage) { try { const o = JSON.parse(storage?.getItem(ORD_MEM_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return null; } }
export function rememberOrderFields(storage, inst, { unit, sl, tp }) {
  if (!MEM_UNITS.includes(unit) || !memNum(sl) || !memNum(tp)) return;
  const all = readMem(storage) || {};
  all[inst] = { unit, sl: String(sl), tp: String(tp) };
  try { storage?.setItem(ORD_MEM_KEY, JSON.stringify(all)); } catch { /* localStorage niedostępny */ }
}
export function recallOrderFields(storage, inst) {
  const m = readMem(storage)?.[inst];
  if (!m || !MEM_UNITS.includes(m.unit) || !memNum(m.sl) || !memNum(m.tp) || m.sl === '') return null;
  return { unit: m.unit, sl: String(m.sl), tp: String(m.tp) };
}

// mountOrders(host, { getBook, setBook, getLast, getCursor, instrument, risk, chart, onEvent, onReturn }) → { refresh, submit, closeAll, destroy }
// instrument i risk mogą być wartością albo funkcją; risk = { mode: 'usd'|'pct', value, balance }. chart: createReplayChart (opcjonalnie, bez niego brak rysunku).
// lock() zwraca tekst powodu blokady handlu (sesja zmieniona w innej karcie; K: bez „dzień zakończony”) albo ''. onCommit() woła się raz po każdej akcji (po setBook i zdarzeniach): jeden zapis sesji.
// J (30.10.2026): getDrawing() → zaznaczony rysunek pozycji aktywnego wykresu albo null, useDrawing(d) → usunięcie rysunku po złożeniu zlecenia; fromDrawing() składa zlecenie
// według rysunku (pozycja-staty.js orderFromDrawing), syncDrawing() odświeża tylko ten przycisk (zmiana zaznaczenia). Słowa użytkownika: «w backtescie powinna byc funkcja ze jak mamy
// zaznaczony dana pozycje rysunek to mozna na podstawie tego wejsc w ta sama pozycje co rysunek, jest takie rozwiazanie w fx replay».
export function mountOrders(host, { getBook, setBook, getLast, getCursor, instrument, instruments = null, risk, chart = null, onEvent = () => {}, onReturn = () => {}, lock = () => '', onCommit = () => {}, getDrawing = () => null, useDrawing = () => {}, getSkroty = () => ({}), storage = globalThis.localStorage }) {
  const inst = () => (typeof instrument === 'function' ? instrument() : instrument);
  const riskUsd = () => { const r = typeof risk === 'function' ? risk() : risk; return !r ? NaN : r.mode === 'pct' ? (Number(r.balance) * Number(r.value)) / 100 : Number(r.value); };
  // [U] 31.10.2026 «Przyjmuję wszystkie» (panel zleceń jak w FX Replay: SL/TP w tickach, punktach albo cenie, podgląd ryzyka przed złożeniem)
  // L: jednostka pól SL/TP: 'pt' punkty od wejścia, 'tick' ticki (0,25), 'px' cena
  let type = 'market', manual = false, flash = '', partFor = null, unit = 'pt';
  const unitBtn = (v, l, tip) => `<button type="button" data-unit="${v}" aria-pressed="${v === 'pt'}" title="${esc(tip)}">${esc(l)}</button>`;
  const el = document.createElement('div');
  el.className = 'bt-ord';
  // final (ocena wyglądu P1-1): jednostka SL/TP w atrybucie (przy cenie pola SL i TP są szersze, jak pole ceny)
  el.dataset.unit = 'pt';
  el.setAttribute('role', 'group'); el.setAttribute('aria-label', t('Zlecenia'));
  const typeBtn = (v, l) => `<button type="button" data-ot="${v}" aria-pressed="${v === 'market'}">${esc(l)}</button>`;
  // M (31.10.2026): układ jak bilet zlecenia FX Replay: Kup/Sprzedaj z ceną z przodu, parametry w jednej grupie (na wąskim ekranie zwinięte do podsumowania),
  // pozycja w jednym zwartym wierszu (opis, BE, część, zamknięcie obok siebie)
  el.innerHTML = `
    <div class="bt-ord-row bt-ord-main">
      <div class="bt-ord-l">
      <div class="bt-ord-side">
        <button type="button" class="btn bt-buy" data-o="buy"><span class="bt-ord-k">${esc(t('Kup'))}</span><span class="bt-ord-px"></span></button>
        <button type="button" class="btn bt-sell" data-o="sell"><span class="bt-ord-k">${esc(t('Sprzedaj'))}</span><span class="bt-ord-px"></span></button>
        <button type="button" class="btn sm bt-draw" data-o="draw">${esc(t('Wejdź według rysunku'))}</button>
      </div>
      <p class="bt-ord-prev" role="status" aria-live="polite" hidden></p>
      </div>
      <button type="button" class="bt-ord-more" aria-expanded="false" aria-controls="bt-ord-fields"><span class="bt-ord-sum"></span><span class="bt-ord-chev" aria-hidden="true"></span></button>
      <div class="bt-ord-fields" id="bt-ord-fields">
        <div class="seg sm" role="group" aria-label="${esc(t('Rodzaj zlecenia'))}">${typeBtn('market', t('Rynkowe'))}${typeBtn('limit', 'Limit')}${typeBtn('stop', 'Stop')}</div>
        <label class="bt-ord-f bt-ord-price" hidden><span class="lbl">${esc(t('Cena'))}</span><input class="sp-in" name="price" type="number" step="0.25" inputmode="decimal"></label>
        <div class="seg sm bt-unit" role="group" aria-label="${esc(t('Jednostka SL i TP'))}">${unitBtn('pt', t('pkt'), t('Punkty od wejścia'))}${unitBtn('tick', t('ticki'), t('Ticki od wejścia (0,25)'))}${unitBtn('px', t('cena'), t('Cena'))}</div>
        <label class="bt-ord-f"><span class="lbl bt-sl-l">${esc(t('SL (pkt)'))}</span><input class="sp-in" name="sl" type="number" min="0" step="0.25" inputmode="decimal"></label>
        <label class="bt-ord-f"><span class="lbl bt-tp-l">${esc(t('TP (pkt)'))}</span><input class="sp-in" name="tp" type="number" min="0" step="0.25" inputmode="decimal"></label>
        <label class="bt-ord-f"><span class="lbl">${esc(t('Wielkość'))}</span><input class="sp-in" name="qty" type="number" min="1" step="1" inputmode="numeric"></label>
      </div>
    </div>
    <div class="bt-ord-row bt-ord-pos" hidden>
      <span class="bt-ord-info"></span>
      <button type="button" class="btn sm" data-o="be">BE</button>
      <label class="bt-ord-f bt-ord-part"><span class="lbl">${esc(t('Część'))}</span><input class="sp-in" name="part" type="number" min="1" step="1" inputmode="numeric"></label>
      <button type="button" class="btn sm" data-o="partial">${esc(t('Zamknij część'))}</button>
      <button type="button" class="btn sm bt-close" data-o="close">${esc(t('Zamknij pozycję'))}</button>
    </div>
    <div class="bt-ord-row bt-ord-pend" hidden></div>
    <div class="bt-ord-row bt-ord-msg"><p class="note bt-ord-note" role="status"></p><button type="button" class="btn sm" data-o="one" hidden></button><button type="button" class="btn sm" data-o="back" hidden>${esc(t('Wróć do bieżącej chwili'))}</button></div>`;
  host.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const field = (n) => $(`[name="${n}"]`);
  // M: zapis do DOM tylko przy zmianie (refresh idzie przy każdej klatce odtwarzania)
  const setText = (n, v) => { if (n && n.textContent !== v) n.textContent = v; };
  const setTitle = (n, v) => { if (n && n.title !== v) n.title = v; };
  const book = () => getBook();
  const rewound = () => getCursor() < (book().hw || 0);
  // M: pamięć SL/TP: wpisy zapisywane przy każdej zmianie pól, przywracane przy otwarciu i przy zmianie instrumentu aktywnego wykresu
  let memFor = null;
  function applyMem() {
    const k = inst();
    if (!k || memFor === k) return;
    memFor = k;
    const m = recallOrderFields(storage, k);
    if (!m) return;
    if (unit !== m.unit) setUnit(m.unit);
    field('sl').value = m.sl; field('tp').value = m.tp;
  }
  const saveMem = () => { if (memFor) rememberOrderFields(storage, memFor, { unit, sl: field('sl').value.trim(), tp: field('tp').value.trim() }); };
  // M: na wąskim ekranie parametry zlecenia są zwinięte do podsumowania
  const moreBtn = $('.bt-ord-more');
  function setMore(open) { el.dataset.more = String(open); moreBtn.setAttribute('aria-expanded', String(open)); }
  setMore(false);

  // cena wejścia z pól (market: bieżąca)
  const entryNow = () => (type === 'market' ? Number(getLast()?.price) : (field('price').value.trim() === '' ? NaN : Number(field('price').value)));
  // wartość pola w punktach od wejścia (jednostka z przełącznika); cena: odległość od wejścia
  function ptsOf(n) {
    const v = field(n).value.trim();
    if (v === '' || !Number.isFinite(Number(v))) return null;
    if (unit === 'tick') return q(Math.abs(Number(v)) * TICK);
    if (unit === 'px') { const e = entryNow(); return Number.isFinite(e) ? q(Math.abs(e - Number(v))) : null; }
    return q(Math.abs(Number(v)));
  }
  function slPts() { return ptsOf('sl'); }
  function tpPts() { return ptsOf('tp'); }
  const autoQty = () => { const d = slPts(); return d ? sizeFromRisk({ riskUsd: riskUsd(), entry: d, sl: 0, instrument: inst() }) : 0; };
  // cena SL/TP dla strony side: jednostka 'px' bierze cenę wprost (zła strona → odrzucenie silnika z komunikatem), inaczej wejście ∓ punkty
  function levelOf(n, side, entry) {
    if (unit === 'px') { const v = field(n).value.trim(); return v === '' ? null : q(Number(v)); }
    const p = n === 'sl' ? slPts() : tpPts(), dir = side === 'buy' ? 1 : -1;
    if (!p) return null;
    return n === 'sl' ? entry - dir * p : entry + dir * p;
  }
  // strona dla jednostki „cena”: SL poniżej wejścia = kupno; bez SL ostatnia strona (domyślnie kupno)
  let lastSide = 'buy';
  function sideGuess() {
    const e = entryNow(), sl = Number(field('sl').value);
    if (unit === 'px' && field('sl').value.trim() !== '' && Number.isFinite(e) && Number.isFinite(sl) && sl !== e) return sl < e ? 'buy' : 'sell';
    return lastSide;
  }
  // przełączenie jednostki przelicza wpisane wartości (z ceny wejścia; bez niej pola się czyszczą przy przejściu na cenę albo z ceny)
  function setUnit(next) {
    if (next === unit || !['pt', 'tick', 'px'].includes(next)) return;
    const e = entryNow(), dir = sideGuess() === 'buy' ? 1 : -1;
    const conv = (n) => {
      const p = ptsOf(n);
      if (p == null) return '';
      if (next === 'tick') return String(Math.round(p / TICK));
      if (next === 'px') return Number.isFinite(e) ? String(n === 'sl' ? e - dir * p : e + dir * p) : '';
      return String(p);
    };
    const sl = conv('sl'), tp = conv('tp');
    unit = next;
    el.dataset.unit = unit;
    field('sl').value = sl; field('tp').value = tp;
    const lab = unit === 'tick' ? [t('SL (ticki)'), t('TP (ticki)')] : unit === 'px' ? [t('SL (cena)'), t('TP (cena)')] : [t('SL (pkt)'), t('TP (pkt)')];
    $('.bt-sl-l').textContent = lab[0]; $('.bt-tp-l').textContent = lab[1];
    for (const n of ['sl', 'tp']) { field(n).step = unit === 'tick' ? '1' : '0.25'; if (unit === 'px') field(n).removeAttribute('min'); else field(n).min = '0'; }
    el.querySelectorAll('[data-unit]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.unit === unit)));
  }
  // L: podgląd przed złożeniem jak w FX Replay: ryzyko w $ i % salda (podstawa ryzyka sesji), cel w $, R:R, liczba kontraktów
  function preview() {
    const e = entryNow(), sp = slPts(), tpP = tpPts(), m = MULT[inst()] || 0;
    const qty = manual ? Number(field('qty').value) : autoQty();
    if (!Number.isFinite(e) || !sp || !(Number.isInteger(qty) && qty >= 1)) return null;
    const r = typeof risk === 'function' ? risk() : risk, bal = Number(r?.balance) || 0;
    const loss = sp * m * qty, gain = tpP ? tpP * m * qty : null;
    return { qty, loss, pct: bal > 0 ? (loss / bal) * 100 : null, gain, rr: tpP ? Math.round((tpP / sp) * 100) / 100 : null };
  }
  const pctTxt = (x) => `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(x)}%`;
  // final (ocena wyglądu P2-2): podgląd pod Kup/Sprzedaj, kwota ryzyka w kolorze straty; zapis tylko przy zmianie (refresh co klatkę)
  function paintPreview() {
    const p = preview(), out = $('.bt-ord-prev');
    if (out.hidden !== !p) out.hidden = !p;
    if (!p) { if (out.textContent) out.textContent = ''; return; }
    const risk = `${t('Ryzyko')} ${fmtMoney(-p.loss)}${p.pct != null ? ` (${pctTxt(p.pct)})` : ''}`;
    const rest = [];
    if (p.gain != null) rest.push(`${t('Cel')} ${fmtMoney(p.gain)}`, `R:R ${fmtR(p.rr, { plus: false }).replace(/R$/, '')}`);
    rest.push(t.p('{n} kontraktów', p.qty));
    const html = `<span class="bt-ord-risk">${esc(risk)}</span> · ${esc(rest.join(' · '))}`;
    if (out.dataset.h !== html) { out.dataset.h = html; out.innerHTML = html; }
  }

  // Zlecenie z pól panelu dla strony side albo { err } (komunikat do notki).
  function build(side) {
    const last = getLast();
    const ty = type;
    const entry = ty === 'market' ? Number(last?.price) : Number(field('price').value);
    if (!Number.isFinite(entry) || (ty !== 'market' && field('price').value.trim() === '')) return { err: ty === 'market' ? t('Brak ceny: kursor jest przed pierwszą świecą.') : t('Wpisz cenę zlecenia.') };
    const s = slPts();
    let qty;
    if (manual) qty = Number(field('qty').value);
    else qty = autoQty();
    if (!Number.isInteger(qty) || qty < 1) return { err: manual ? t('Wielkość musi być liczbą całkowitą od 1.') : s ? t('Ryzyko za małe na ten SL: wpisz liczbę kontraktów ręcznie.') : t('Wpisz SL albo wielkość.') };
    return { order: { instrument: inst(), side, type: ty, price: ty === 'market' ? undefined : entry, qty, sl: levelOf('sl', side, entry), tp: levelOf('tp', side, entry) } };
  }

  function act(res) {
    setBook(res.book);
    for (const ev of res.events) {
      if (ev.type === 'rejected') flash = rejectText(ev.reason);
      onEvent(ev);
    }
    onCommit();
    refresh();
  }

  function submit(side) {
    if (rewound() || lock() || book().positions[inst()]) return false;
    const b = build(side);
    if (b.err) { flash = b.err; refresh(); return false; }
    flash = '';
    lastSide = side;
    act(placeOrder(book(), b.order, getLast()));
    return true;
  }
  // J: stan przycisku „Wejdź według rysunku”: { d, order } albo { why } (powód w title). Blokady jak Kup/Sprzedaj: sesja z innej karty (K: bez dnia zakończonego),
  // cofnięty kursor, otwarta pozycja na instrumencie (jedna pozycja na instrument, reguła silnika), brak ceny; do tego rysunek bez SL (wielkość z ryzyka wymaga SL).
  function drawState() {
    const d = getDrawing(), lk = lock();
    if (lk) return { why: lk };
    if (rewound()) return { why: t('Przeglądasz wstecz: handel jest zablokowany.') };
    if (!d) return { why: t('Zaznacz rysunek pozycji long albo short na aktywnym wykresie.') };
    // przegląd J P2-1: rysunek przywrócony (Ctrl+Z, awaria przed zapisem) nie składa drugiego zlecenia, gdy jego zlecenie czeka albo pozycja jest otwarta
    const b0 = book(), used = b0.orders.some((o) => o.fromDrawing === d.id) || Object.values(b0.positions).some((p) => p && p.fromDrawing === d.id);
    if (used) return { why: t('Z tego rysunku jest już zlecenie albo otwarta pozycja.') };
    if (book().positions[inst()]) return { why: t('Na tym instrumencie jest już otwarta pozycja.') };
    const r = orderFromDrawing(d, { last: getLast(), instrument: inst(), riskUsd: riskUsd(), tick: TICK });
    return r.err ? { why: r.err } : { d, order: r.order };
  }
  // [U] 30.10.2026 «Automatycznie» (market / limit / stop wg ceny) i «Ryzyko sesji, rysunek znika»: po przyjętym zleceniu rysunek usuwa się z rysunków sesji
  // (zastępuje go prawdziwe zlecenie albo pozycja na wykresie). Cofnięcie zlecenia nie przywraca rysunku (Ctrl+Z w rysunkach dalej działa).
  function fromDrawing() {
    const s = drawState();
    if (!s.order) { flash = s.why || ''; refresh(); return false; }
    flash = '';
    const res = placeOrder(book(), { ...s.order, fromDrawing: s.d.id }, getLast());
    const ok = !res.events.some((e) => e.type === 'rejected');
    // przegląd J P2-1: jeden zapis sesji. useDrawing usuwa rysunek i od razu wpisuje dokument rysunków do sesji (bez osobnego zapisu),
    // a act → onCommit zapisuje zlecenie i usunięcie razem
    if (ok) useDrawing(s.d);
    act(res);
    if (ok) syncDrawing();
    return ok;
  }
  function syncDrawing() {
    const b = $('[data-o="draw"]'), s = drawState();
    b.disabled = !s.order;
    b.title = s.order ? hintOf(`${s.order.side === 'buy' ? t('Kup') : t('Sprzedaj')} ${s.order.type} ${s.order.qty}× · SL ${fx(s.order.sl)}${s.order.tp != null ? ` · TP ${fx(s.order.tp)}` : ''}`, (getSkroty() || {}).drawEntry) : s.why;
  }
  function closeNow(k = inst()) {
    if (rewound() || lock()) return false;
    flash = '';
    act(closeAll(book(), k, getLast(k), 'manual'));
    return true;
  }
  // L: akcje z szuflady i z linii pozycji na wykresie (instrument jawnie, nie tylko aktywny wykres)
  function closeQty(k, qty) {
    const p = book().positions[k];
    if (!p || rewound() || lock()) return false;
    flash = '';
    act(qty >= p.openQty ? closeAll(book(), k, getLast(k), 'manual') : closePartial(book(), k, qty, getLast(k)));
    return true;
  }
  const closePct = (k, pc) => { const p = book().positions[k]; return p ? closeQty(k, pctQty(p.openQty, pc)) : false; };
  function beFor(k) { if (!book().positions[k] || rewound() || lock()) return false; flash = ''; act(moveToBE(book(), k, getLast(k))); return true; }
  function cancel(id) { if (rewound() || lock()) return false; flash = ''; act({ book: cancelOrder(book(), id), events: [] }); return true; }
  // przeciągnięcie zlecenia oczekującego albo jego SL/TP na wykresie → modifyOrder (odrzucenie wraca linię na miejsce przez refresh)
  function moveOrder(id, changes) {
    const o = book().orders.find((x) => x.id === id);
    if (!o) { refresh(); return false; }
    if (lock()) { refresh(); return false; }
    flash = '';
    const res = modifyOrder(book(), id, changes, getLast(o.instrument));
    act(res);
    return !res.events.some((e) => e.type === 'rejected');
  }

  function onClick(ev) {
    const b = ev.target.closest('button');
    if (!b || b.disabled || !el.contains(b)) return;
    if (b === moreBtn) { setMore(el.dataset.more !== 'true'); return; }
    if (b.dataset.ot) { type = b.dataset.ot; flash = ''; el.querySelectorAll('[data-ot]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); refresh(); return; }
    if (b.dataset.unit) { setUnit(b.dataset.unit); saveMem(); flash = ''; refresh(); return; }
    const o = b.dataset.o;
    if (o === 'buy' || o === 'sell') submit(o);
    else if (o === 'draw') fromDrawing();
    else if (o === 'close') closeNow();
    else if (o === 'be') { flash = ''; act(moveToBE(book(), inst(), getLast())); }
    else if (o === 'partial') { flash = ''; act(closePartial(book(), inst(), Number(field('part').value), getLast())); }
    else if (o === 'back') onReturn();
    // final (ocena wyglądu P2-5): „Ryzyko za małe” z jednym kliknięciem: 1 kontrakt wpisany ręcznie
    else if (o === 'one') { manual = true; field('qty').value = '1'; flash = ''; refresh(); }
    else if (b.dataset.cancel) { flash = ''; act({ book: cancelOrder(book(), b.dataset.cancel), events: [] }); }
  }
  function onInput(ev) {
    const n = ev.target.name;
    flash = '';
    if (n === 'qty') manual = ev.target.value.trim() !== '';
    if (n === 'sl' || n === 'tp') saveMem();
    refresh();
  }
  el.addEventListener('click', onClick);
  el.addEventListener('input', onInput);

  // Przeciągnięcie SL/TP w rysunku pozycji → modifyPosition. Przesunięte wejście wraca na miejsce (refresh), przy odrzuceniu rysunek wraca do book.
  chart?.onPositionEdit((pr, k = inst()) => {
    const pos = book().positions[k];
    if (!pos) return;
    if (lock()) { refresh(); return; }
    const ch = {};
    if (pr.sl != null && pr.sl !== pos.sl) ch.sl = pr.sl;
    if ((pr.tp ?? null) !== (pos.tp ?? null)) ch.tp = pr.tp ?? null;
    if (!Object.keys(ch).length) { refresh(); return; }
    flash = '';
    act(modifyPosition(book(), k, ch, getLast(k)));
  });

  function refresh() {
    applyMem();
    const b = book(), i = inst(), pos = b.positions[i], back = rewound(), lk = lock(), rw = back || !!lk, last = getLast();
    const price = field('price').closest('label');
    price.hidden = type === 'market';
    if (!manual) { const a = autoQty(); field('qty').value = a > 0 ? String(a) : ''; }
    field('qty').placeholder = manual ? '' : t('auto');
    const canTrade = !rw && !pos && Number.isFinite(Number(last?.price));
    const ok = (side) => { if (!canTrade) return false; const r = build(side); return !r.err; };
    $('[data-o="buy"]').disabled = !ok('buy');
    $('[data-o="sell"]').disabled = !ok('sell');
    $('.bt-ord-pos').hidden = !pos;
    if (pos) {
      // M poprawki (ocena wyglądu #6): kierunek, ilość i wejście zawsze; SL/TP w dopisku, schowanym na wąskim ekranie (są na etykietach wykresu)
      const info = $('.bt-ord-info'), sig = [pos.dir, pos.openQty, pos.qty, pos.entryPrice, pos.sl, pos.tp, pos.be].join('|');
      if (info.dataset.sig !== sig) {
        info.dataset.sig = sig;
        info.innerHTML = `<b>${esc(pos.dir === 'Long' ? t('Long') : t('Short'))} ${esc(pos.openQty)}/${esc(pos.qty)}</b> @ ${esc(fx(pos.entryPrice))}<span class="bt-ord-info-x"> · SL ${esc(fx(pos.sl))} · TP ${esc(fx(pos.tp))}${pos.be ? ' · BE' : ''}</span>`;
      }
      for (const s of ['be', 'partial', 'close']) $(`[data-o="${s}"]`).disabled = rw;
      const part = field('part');
      // domyślna część = połowa otwartej wielkości; nowa pozycja albo wpis spoza zakresu zeruje pole
      if (partFor !== pos.id || !(Number(part.value) >= 1 && Number(part.value) < pos.openQty)) { part.value = String(Math.max(1, Math.floor(pos.openQty / 2))); partFor = pos.id; }
      part.disabled = rw;
      $('[data-o="partial"]').disabled = rw || pos.openQty < 2;
    }
    const orders = b.orders.filter((o) => o.instrument === i);
    const pend = $('.bt-ord-pend');
    pend.hidden = !orders.length;
    pend.innerHTML = orders.map((o) => `<span class="bt-chip" data-oid="${esc(o.id)}">${esc(label(o))}<button type="button" class="icon-btn" data-cancel="${esc(o.id)}" aria-label="${esc(t('Anuluj zlecenie'))}" ${rw ? 'disabled' : ''}>×</button></span>`).join('');
    $('[data-o="back"]').hidden = !back || !!lk;
    const note = $('.bt-ord-note');
    const small = canTrade && !manual && slPts() && !autoQty();
    // H2 (zgłoszenie z zrzutów): Kup/Sprzedaj wyłączone bez powodu wyglądały na awarię; teraz notka mówi, czego brakuje (SL albo wielkość, cena przed pierwszą świecą)
    const why = !rw && !pos ? (build('buy').err || '') : '';
    note.textContent = flash || lk || (back ? t('Przeglądasz wstecz: handel jest zablokowany.') : small ? t('Ryzyko za małe na ten SL: wpisz liczbę kontraktów ręcznie.') : why);
    // final (P2-5): przy „Ryzyko za małe” przycisk z ryzykiem jednego kontraktu
    const oneBtn = $('[data-o="one"]'), oneOn = !!small && !flash && !lk && !back;
    if (oneBtn.hidden !== !oneOn) oneBtn.hidden = !oneOn;
    if (oneOn) setText(oneBtn, t('Użyj 1 kontraktu (ryzyko {usd})', { usd: fmtMoney(slPts() * (MULT[inst()] || 0), { plus: false }) }));
    // M: przycisk mówi, co zrobi (rodzaj i cena), a podpowiedź podaje skrót; wyłączony podaje powód
    const sk = getSkroty() || {};
    const pxNow = type === 'market' ? Number(last?.price) : Number(field('price').value);
    for (const s of ['buy', 'sell']) {
      const bb = $(`[data-o="${s}"]`);
      const verb = s === 'buy' ? (type === 'market' ? t('Kup rynkowo') : type === 'limit' ? t('Kup limit') : t('Kup stop')) : (type === 'market' ? t('Sprzedaj rynkowo') : type === 'limit' ? t('Sprzedaj limit') : t('Sprzedaj stop'));
      setText(bb.querySelector('.bt-ord-px'), Number.isFinite(pxNow) && (type === 'market' || field('price').value.trim() !== '') ? fx(pxNow) : '');
      if (bb.getAttribute('aria-keyshortcuts') !== (sk[s] || '')) bb.setAttribute('aria-keyshortcuts', sk[s] || '');
      setTitle(bb, bb.disabled ? (lk || (back ? t('Przeglądasz wstecz: handel jest zablokowany.') : '') || why || (pos ? t('Na tym instrumencie jest już otwarta pozycja.') : '')) : hintOf(verb, sk[s]));
    }
    setTitle($('[data-o="be"]'), hintOf(t('SL na cenę wejścia (BE)'), sk.be));
    setTitle($('[data-o="close"]'), hintOf(t('Zamknij całą pozycję'), sk.closeAll));
    setTitle($('[data-o="partial"]'), t('Zamknij podaną liczbę kontraktów'));
    // podsumowanie parametrów (wąski ekran: przycisk rozwijający pola)
    const sumParts = [];
    const ul = unit === 'tick' ? t('ticki') : unit === 'px' ? '' : t('pkt');
    const fv = (n) => field(n).value.trim();
    if (type !== 'market') sumParts.push(`${type === 'limit' ? 'Limit' : 'Stop'} ${fv('price') ? fx(Number(fv('price'))) : '–'}`);
    sumParts.push(`SL ${fv('sl') || '–'}${fv('sl') && ul ? ` ${ul}` : ''}`);
    sumParts.push(`TP ${fv('tp') || '–'}${fv('tp') && ul ? ` ${ul}` : ''}`);
    const qn = Number(field('qty').value);
    if (qn >= 1) sumParts.push(t.p('{n} kontraktów', qn));
    setText($('.bt-ord-sum'), sumParts.join(' · '));
    setTitle(moreBtn, t('Parametry zlecenia'));
    // final (ocena wyglądu 2, P2-N2): „Ryzyko za małe” jako stan ostrzeżenia (kolor uwagi z kropką, rozmiar podglądu ryzyka)
    note.dataset.state = back && !lk ? 'rewound' : oneOn ? 'small' : '';
    // M: pusty wiersz komunikatu nie zajmuje miejsca (wąski ekran)
    const msgRow = $('.bt-ord-msg'), msgOff = !note.textContent && $('[data-o="back"]').hidden && oneBtn.hidden;
    if (msgRow.hidden !== msgOff) msgRow.hidden = msgOff;
    syncDrawing();
    paintPreview();
    // L: zlecenia oczekujące z SL/TP, ilością i ryzykiem w $ (etykiety przeciągane na wykresie); rw = handel zablokowany (bez przeciągania)
    const orderRisk = (o) => (o.sl != null ? Math.abs(o.price - o.sl) * (MULT[o.instrument] || 0) * o.qty : null);
    const stateOf = (k) => ({ position: b.positions[k] || null, rw, orders: b.orders.filter((o) => o.instrument === k).map((o) => ({ id: o.id, price: o.price, side: o.side, type: o.type, qty: o.qty, sl: o.sl, tp: o.tp, risk: orderRisk(o), title: label(o) })) });
    if (chart?.setTradingFor) for (const k of new Set([i, ...(typeof instruments === 'function' ? instruments() : [])])) chart.setTradingFor(k, stateOf(k));
    else chart?.setTrading(stateOf(i));
  }
  function label(o) { return `${o.side === 'buy' ? t('Kup') : t('Sprzedaj')} ${o.type} ${o.qty}× @ ${fx(o.price)}`; }

  refresh();
  return {
    refresh, submit, closeAll: closeNow, fromDrawing, syncDrawing, closeQty, closePct, beFor, cancel, moveOrder, setUnit, unit: () => unit, preview,
    // przegląd J P3-5: ilość zlecenia z rysunku przy ryzyku sesji i bieżącej cenie instrumentu (null, gdy zlecenia nie da się złożyć)
    drawingQty: (d, k = inst()) => orderFromDrawing(d, { last: getLast(k), instrument: k, riskUsd: riskUsd(), tick: TICK }).order?.qty ?? null,
    destroy() { el.removeEventListener('click', onClick); el.removeEventListener('input', onInput); chart?.onPositionEdit(null); el.remove(); },
  };
}
