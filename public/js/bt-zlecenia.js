// Panel zleceń replayu Backtest (1.5.0, pakiet C2): Buy/Sell (market, limit, stop), SL i TP w punktach od wejścia, wielkość z ryzyka sesji albo ręczna,
// BE, zamknięcie części i całości, oczekujące zlecenia z anulowaniem. Panel nie liczy wypełnień: woła silnik z bt-wypelnienia.js z `last` = { t: kursor,
// price: zamknięcie ostatniej widocznej świecy bazowej } i oddaje nowy Book przez setBook (wywołujący zapisuje sesję od razu). Pozycja i linie zleceń na wykresie
// idą przez chart.setTrading, a przeciągnięcie SL/TP w rysunku wraca tu jako onPositionEdit → modifyPosition (cena do 0,25; sl0 bez zmian).
// Po cofnięciu kursora przed znak wodny (kursor < book.hw) handel jest zablokowany do „Wróć do bieżącej chwili” (§7, 18a.3).
// D1: kilka wykresów. Panel działa na instrumencie aktywnego wykresu, ale pozycje i zlecenia innych instrumentów też rysują się na swoich wykresach: gdy chart ma setTradingFor(k, stan),
// refresh woła go dla każdego instrumentu z instruments(); edycja SL/TP w rysunku wraca z nazwą instrumentu wykresu (onPositionEdit(pr, k)), a cena bieżąca dla modyfikacji to getLast(k).
// English: order ticket for the replay: market/limit/stop with SL/TP in points, size from session risk or manual, BE, partial/full close, pending orders; locked when rewound.
import { t } from './i18n.js';
import { esc } from './format.js';
import { pxText } from './bt-journal.js';
import { sizeFromRisk, placeOrder, cancelOrder, modifyPosition, moveToBE, closePartial, closeAll, TICK } from './bt-wypelnienia.js';
import { orderFromDrawing } from './pozycja-staty.js';

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
    default: return t('Zlecenie odrzucone.');
  }
}

// mountOrders(host, { getBook, setBook, getLast, getCursor, instrument, risk, chart, onEvent, onReturn }) → { refresh, submit, closeAll, destroy }
// instrument i risk mogą być wartością albo funkcją; risk = { mode: 'usd'|'pct', value, balance }. chart: createReplayChart (opcjonalnie, bez niego brak rysunku).
// lock() zwraca tekst powodu blokady handlu (dzień zakończony, sesja zmieniona w innej karcie) albo ''. onCommit() woła się raz po każdej akcji (po setBook i zdarzeniach): jeden zapis sesji.
// J (30.10.2026): getDrawing() → zaznaczony rysunek pozycji aktywnego wykresu albo null, useDrawing(d) → usunięcie rysunku po złożeniu zlecenia; fromDrawing() składa zlecenie
// według rysunku (pozycja-staty.js orderFromDrawing), syncDrawing() odświeża tylko ten przycisk (zmiana zaznaczenia). Słowa użytkownika: «w backtescie powinna byc funkcja ze jak mamy
// zaznaczony dana pozycje rysunek to mozna na podstawie tego wejsc w ta sama pozycje co rysunek, jest takie rozwiazanie w fx replay».
export function mountOrders(host, { getBook, setBook, getLast, getCursor, instrument, instruments = null, risk, chart = null, onEvent = () => {}, onReturn = () => {}, lock = () => '', onCommit = () => {}, getDrawing = () => null, useDrawing = () => {} }) {
  const inst = () => (typeof instrument === 'function' ? instrument() : instrument);
  const riskUsd = () => { const r = typeof risk === 'function' ? risk() : risk; return !r ? NaN : r.mode === 'pct' ? (Number(r.balance) * Number(r.value)) / 100 : Number(r.value); };
  let type = 'market', manual = false, flash = '', partFor = null;
  const el = document.createElement('div');
  el.className = 'bt-ord';
  el.setAttribute('role', 'group'); el.setAttribute('aria-label', t('Zlecenia'));
  const typeBtn = (v, l) => `<button type="button" data-ot="${v}" aria-pressed="${v === 'market'}">${esc(l)}</button>`;
  el.innerHTML = `
    <div class="bt-ord-row">
      <button type="button" class="btn sm bt-buy" data-o="buy">${esc(t('Kup'))}</button>
      <button type="button" class="btn sm bt-sell" data-o="sell">${esc(t('Sprzedaj'))}</button>
      <button type="button" class="btn sm bt-draw" data-o="draw">${esc(t('Wejdź według rysunku'))}</button>
      <div class="seg sm" role="group" aria-label="${esc(t('Rodzaj zlecenia'))}">${typeBtn('market', t('Rynkowe'))}${typeBtn('limit', 'Limit')}${typeBtn('stop', 'Stop')}</div>
      <label class="bt-ord-f bt-ord-price" hidden><span class="lbl">${esc(t('Cena'))}</span><input class="sp-in" name="price" type="number" step="0.25" inputmode="decimal"></label>
      <label class="bt-ord-f"><span class="lbl">${esc(t('SL (pkt)'))}</span><input class="sp-in" name="sl" type="number" min="0" step="0.25" inputmode="decimal"></label>
      <label class="bt-ord-f"><span class="lbl">${esc(t('TP (pkt)'))}</span><input class="sp-in" name="tp" type="number" min="0" step="0.25" inputmode="decimal"></label>
      <label class="bt-ord-f"><span class="lbl">${esc(t('Wielkość'))}</span><input class="sp-in" name="qty" type="number" min="1" step="1" inputmode="numeric"></label>
    </div>
    <div class="bt-ord-row bt-ord-pos" hidden>
      <span class="bt-ord-info"></span>
      <button type="button" class="btn sm" data-o="be">BE</button>
      <label class="bt-ord-f"><span class="lbl">${esc(t('Część'))}</span><input class="sp-in" name="part" type="number" min="1" step="1" inputmode="numeric"></label>
      <button type="button" class="btn sm" data-o="partial">${esc(t('Zamknij część'))}</button>
      <button type="button" class="btn sm" data-o="close">${esc(t('Zamknij pozycję'))}</button>
    </div>
    <div class="bt-ord-row bt-ord-pend" hidden></div>
    <div class="bt-ord-row"><p class="note bt-ord-note" role="status"></p><button type="button" class="btn sm" data-o="back" hidden>${esc(t('Wróć do bieżącej chwili'))}</button></div>`;
  host.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const field = (n) => $(`[name="${n}"]`);
  const book = () => getBook();
  const rewound = () => getCursor() < (book().hw || 0);

  function slPts() { const v = field('sl').value.trim(); return v === '' ? null : q(Math.abs(Number(v))); }
  function tpPts() { const v = field('tp').value.trim(); return v === '' ? null : q(Math.abs(Number(v))); }
  const autoQty = () => { const d = slPts(); return d ? sizeFromRisk({ riskUsd: riskUsd(), entry: d, sl: 0, instrument: inst() }) : 0; };

  // Zlecenie z pól panelu dla strony side albo { err } (komunikat do notki).
  function build(side) {
    const last = getLast();
    const ty = type;
    const entry = ty === 'market' ? Number(last?.price) : Number(field('price').value);
    if (!Number.isFinite(entry) || (ty !== 'market' && field('price').value.trim() === '')) return { err: ty === 'market' ? t('Brak ceny: kursor jest przed pierwszą świecą.') : t('Wpisz cenę zlecenia.') };
    const s = slPts(), p = tpPts(), dir = side === 'buy' ? 1 : -1;
    let qty;
    if (manual) qty = Number(field('qty').value);
    else qty = autoQty();
    if (!Number.isInteger(qty) || qty < 1) return { err: manual ? t('Wielkość musi być liczbą całkowitą od 1.') : s ? t('Ryzyko za małe na ten SL: wpisz liczbę kontraktów ręcznie.') : t('Wpisz SL albo wielkość.') };
    return { order: { instrument: inst(), side, type: ty, price: ty === 'market' ? undefined : entry, qty, sl: s ? entry - dir * s : null, tp: p ? entry + dir * p : null } };
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
    act(placeOrder(book(), b.order, getLast()));
    return true;
  }
  // J: stan przycisku „Wejdź według rysunku”: { d, order } albo { why } (powód w title). Blokady jak Kup/Sprzedaj: dzień zakończony / sesja z innej karty,
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
    b.title = s.order ? `${s.order.side === 'buy' ? t('Kup') : t('Sprzedaj')} ${s.order.type} ${s.order.qty}× · SL ${fx(s.order.sl)}${s.order.tp != null ? ` · TP ${fx(s.order.tp)}` : ''}` : s.why;
  }
  function closeNow() {
    if (rewound() || lock()) return false;
    flash = '';
    act(closeAll(book(), inst(), getLast(), 'manual'));
    return true;
  }

  function onClick(ev) {
    const b = ev.target.closest('button');
    if (!b || b.disabled || !el.contains(b)) return;
    if (b.dataset.ot) { type = b.dataset.ot; flash = ''; el.querySelectorAll('[data-ot]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); refresh(); return; }
    const o = b.dataset.o;
    if (o === 'buy' || o === 'sell') submit(o);
    else if (o === 'draw') fromDrawing();
    else if (o === 'close') closeNow();
    else if (o === 'be') { flash = ''; act(moveToBE(book(), inst(), getLast())); }
    else if (o === 'partial') { flash = ''; act(closePartial(book(), inst(), Number(field('part').value), getLast())); }
    else if (o === 'back') onReturn();
    else if (b.dataset.cancel) { flash = ''; act({ book: cancelOrder(book(), b.dataset.cancel), events: [] }); }
  }
  function onInput(ev) {
    const n = ev.target.name;
    flash = '';
    if (n === 'qty') manual = ev.target.value.trim() !== '';
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
      $('.bt-ord-info').textContent = `${pos.dir === 'Long' ? t('Long') : t('Short')} ${pos.openQty}/${pos.qty} · ${t('wejście')} ${fx(pos.entryPrice)} · SL ${fx(pos.sl)} · TP ${fx(pos.tp)}${pos.be ? ' · BE' : ''}`;
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
    for (const s of ['buy', 'sell']) { const bb = $(`[data-o="${s}"]`); bb.title = bb.disabled ? (lk || (back ? t('Przeglądasz wstecz: handel jest zablokowany.') : '') || why || (pos ? t('Na tym instrumencie jest już otwarta pozycja.') : '')) : ''; }
    note.dataset.state = back && !lk ? 'rewound' : '';
    syncDrawing();
    const stateOf = (k) => ({ position: b.positions[k] || null, orders: b.orders.filter((o) => o.instrument === k).map((o) => ({ id: o.id, price: o.price, side: o.side, title: label(o) })) });
    if (chart?.setTradingFor) for (const k of new Set([i, ...(typeof instruments === 'function' ? instruments() : [])])) chart.setTradingFor(k, stateOf(k));
    else chart?.setTrading(stateOf(i));
  }
  function label(o) { return `${o.side === 'buy' ? t('Kup') : t('Sprzedaj')} ${o.type} ${o.qty}× @ ${fx(o.price)}`; }

  refresh();
  return {
    refresh, submit, closeAll: closeNow, fromDrawing, syncDrawing,
    // przegląd J P3-5: ilość zlecenia z rysunku przy ryzyku sesji i bieżącej cenie instrumentu (null, gdy zlecenia nie da się złożyć)
    drawingQty: (d, k = inst()) => orderFromDrawing(d, { last: getLast(k), instrument: k, riskUsd: riskUsd(), tick: TICK }).order?.qty ?? null,
    destroy() { el.removeEventListener('click', onClick); el.removeEventListener('input', onInput); chart?.onPositionEdit(null); el.remove(); },
  };
}
