// Formularz dodawania i edycji trade'a. Zapis idzie do Notion przez lokalny serwer (POST /api/trades, PATCH /api/trades/:id).
// Opcje wyborów pochodzą ze schematu bazy (model.colors.trades), nic nie jest wpisane na sztywno.
import { esc, numInput } from './format.js';
import { t as tr } from './i18n.js';
import { overlay, trapTab, toast, guide } from './modal.js';
import { bindShots, buttonHtml, statusHtml } from './shots.js';

const ICON_CLOSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw'; } catch { return 'Europe/Warsaw'; } })();

const parseNum = (s) => {
  const t = String(s ?? '').trim().replace(/\s/g, '').replace('−', '-').replace(',', '.');
  if (t === '') return { val: null };
  const n = Number(t);
  return Number.isFinite(n) && Math.abs(n) <= 1e7 ? { val: n } : { err: true };
};

export function createForm({ getModel, types, getDefaults, reload, onSaved, onClose }) {
  let root = null, dlg = null, trade = null, opener = null, saving = false, snapshot = '', discarding = false, shotsCtl = null;

  const model = () => getModel();
  const optsOf = (prop) => Object.keys(model().colors?.trades?.[prop] || {});
  const hasField = (prop) => !!model().fields?.trades?.[prop];

  function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function initial(t) {
    if (!t) {
      return { id: null, edited: '', name: '', typ: getDefaults().typ, date: todayLocal(), time: '', exitDate: '', exitTime: '', instrument: '', dir: '', setup: '', session: '', r: '', pnl: '', konta: [], reason: '', chart: '', notes: '' };
    }
    return {
      id: t.id, edited: t.edited, name: t.name, typ: t.typ || 'Live', date: t.date || '', time: t.time || '', exitDate: t.exitDate || '', exitTime: t.exitTime || '',
      instrument: t.instrument || '', dir: t.dir || '', setup: t.setup || '', session: t.session || '', r: numInput(t.r), pnl: numInput(t.pnl),
      konta: [...t.konta], reason: t.reason || '', chart: t.chart || '', notes: t.notes || '',
    };
  }

  // Zrzuty: miniatury istniejących (z proxy /api/img) i dodawanie nowych. Nowy trade nie ma jeszcze strony w Notion, więc zrzut dodaje się po zapisaniu.
  const thumbsHtml = (t) => {
    const n = Math.min(t?.imgs || 0, 12);
    return n ? Array.from({ length: n }, (_, i) => `<img src="/api/img?page=${encodeURIComponent(t.id)}&i=${i}&n=${t.imgs}" alt="${esc(tr('Zrzut {n}', { n: i + 1 }))}" loading="lazy">`).join('') : '';
  };
  const shotsField = () => `<div class="fld span4 shots-fld" data-f="shots"><span class="lbl">${esc(tr('Zrzuty'))}</span>
      <div class="shot-strip"${trade?.imgs ? '' : ' hidden'}>${thumbsHtml(trade)}</div>
      ${trade ? `<div class="shot-row">${buttonHtml(tr('Dodaj zrzut'))}<span class="fhint">${esc(tr('Wybierz plik, przeciągnij go tutaj albo wklej zrzut ze schowka (Ctrl+V).'))}</span></div>${statusHtml()}`
        : `<p class="fhint">${esc(tr("Zrzut dodasz po zapisaniu trade'a: otwórz go i kliknij „Dodaj zrzut”."))}</p>`}</div>`;

  const fld = (id, label, inner, { hint = '', cls = '', labelFor = true } = {}) => `<div class="fld ${cls}" data-f="${id}">
      ${labelFor ? `<label class="lbl" for="f-${id}">${label}</label>` : `<span class="lbl" id="l-${id}">${label}</span>`}${inner}
      <p class="ferr" id="e-${id}" hidden></p>${hint ? `<p class="fhint">${hint}</p>` : ''}</div>`;

  const select = (id, prop, val) => {
    const o = optsOf(prop);
    const extra = val && !o.includes(val) ? [val] : [];
    return `<select id="f-${id}" name="${id}" aria-describedby="e-${id}"><option value="">${esc(tr('Bez wyboru'))}</option>${[...o, ...extra].map((x) => `<option value="${esc(x)}"${x === val ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  };
  const seg = (id, items, val, { clearable = false } = {}) => `<div class="seg full" role="group" aria-labelledby="l-${id}" id="f-${id}" data-seg="${id}" data-clear="${clearable}">${items.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${v === val}">${esc(l)}</button>`).join('')}</div>`;
  const pills = (id, items, selected) => `<div class="pills" role="group" aria-labelledby="l-${id}" id="f-${id}" data-pills="${id}">${items.map(([v, l]) => `<button type="button" class="pill" data-v="${esc(v)}" aria-pressed="${selected.includes(v)}">${esc(l)}</button>`).join('')}</div>`;

  function html(v) {
    const typOpts = optsOf('typ');
    const typItems = types.filter(([val]) => !typOpts.length || typOpts.includes(val));
    const dirOpts = optsOf('dir');
    const konta = model().konta;
    const exitOk = hasField('exit');
    const title = trade ? tr('Edytuj trade') : tr('Dodaj trade');
    const L = (s) => esc(tr(s));
    return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="f-title" id="trade-form">
      <div class="mh"><h2 id="f-title">${esc(title)}</h2><button type="button" class="icon-btn" data-f-act="close" aria-label="${L('Zamknij formularz')}">${ICON_CLOSE}</button></div>
      <form class="mb" id="f-form" novalidate autocomplete="off">
        <div id="f-banner" class="banner" role="alert" hidden></div>
        <div class="fgrid">
          ${fld('typ', L('Typ'), seg('typ', typItems, v.typ), { cls: 'span4', labelFor: false })}
          ${fld('date', L('Data wejścia'), `<input id="f-date" name="date" type="date" value="${esc(v.date)}" required aria-describedby="e-date">`, { cls: 'span1' })}
          ${fld('time', L('Godzina wejścia'), `<input id="f-time" name="time" type="time" step="60" value="${esc(v.time)}" aria-describedby="e-time">`, { cls: 'span1', hint: L('Puste, jeśli nie znasz godziny.') })}
          ${exitOk
            ? `${fld('exitDate', L('Data wyjścia'), `<input id="f-exitDate" name="exitDate" type="date" value="${esc(v.exitDate)}" aria-describedby="e-exitDate">`, { cls: 'span1', hint: L('Puste = ta sama data.') })}
               ${fld('exitTime', L('Godzina wyjścia'), `<input id="f-exitTime" name="exitTime" type="time" step="60" value="${esc(v.exitTime)}" aria-describedby="e-exitTime">`, { cls: 'span1', hint: L('Daje czas trwania trade\'a.') })}`
            : `<div class="fld span2"><span class="lbl">${L('Wyjście')}</span><p class="fhint">${L('W bazie Trade\'y nie ma jeszcze pola „Wyjście”. Uruchom aktualizację (Aktualizuj.cmd albo update.sh), która je doda.')}</p></div>`}
          ${fld('instrument', L('Instrument'), select('instrument', 'instrument', v.instrument), { cls: 'span1' })}
          ${fld('setup', L('Setup'), select('setup', 'setup', v.setup), { cls: 'span1' })}
          ${fld('session', L('Sesja'), select('session', 'session', v.session), { cls: 'span1' })}
          ${fld('dir', L('Kierunek'), seg('dir', dirOpts.map((x) => [x, x]), v.dir, { clearable: true }), { cls: 'span1', labelFor: false })}
          ${fld('r', 'R', `<input id="f-r" name="r" type="text" inputmode="decimal" value="${esc(v.r)}" placeholder="${L('np. 1,5 lub −0,8')}" aria-describedby="e-r">`, { cls: 'span1' })}
          <div class="span1 only-pnl">${fld('pnl', 'P&amp;L $', `<input id="f-pnl" name="pnl" type="text" inputmode="decimal" value="${esc(v.pnl)}" placeholder="${L('np. 320 lub −150')}" aria-describedby="e-pnl">`)}</div>
          <div class="span1 only-reason">${fld('reason', L('Powód (paper)'), select('reason', 'reason', v.reason))}</div>
          <div class="span4 only-konta">${fld('konta', L('Konta'), konta.length ? pills('konta', konta.map((k) => [k.id, k.name]), v.konta) : `<p class="fhint">${L('Brak kont w bazie Konta.')}</p>`, { labelFor: false })}</div>
          ${fld('chart', L('Wykres (link)'), `<input id="f-chart" name="chart" type="url" inputmode="url" value="${esc(v.chart)}" placeholder="https://www.tradingview.com/x/…" aria-describedby="e-chart">`, { cls: 'span2' })}
          ${fld('name', L('Nazwa'), `<input id="f-name" name="name" type="text" maxlength="200" value="${esc(v.name)}" placeholder="${L('Opcjonalnie')}" aria-describedby="e-name">`, { cls: 'span2' })}
          ${fld('notes', L('Notatki'), `<textarea id="f-notes" name="notes" rows="4" maxlength="8000" aria-describedby="e-notes">${esc(v.notes)}</textarea>`, { cls: 'span4' })}
          ${shotsField()}
        </div>
      </form>
      <div class="mf" id="f-foot"></div></div>`;
  }

  function footHtml() {
    if (discarding) {
      return `<span class="fmsg" role="alert">${esc(tr('Masz niezapisane zmiany. Odrzucić je?'))}</span><span class="grow"></span>
        <button type="button" class="btn ghost" data-f-act="keep">${esc(tr('Wróć do formularza'))}</button><button type="button" class="btn" data-f-act="discard">${esc(tr('Odrzuć zmiany'))}</button>`;
    }
    const left = guide.on ? `<span class="fmsg">${esc(tr('Tryb przewodnika: zapis zostaje w pamięci przeglądarki, Notion bez zmian.'))}</span>`
      : trade ? `<a class="fmsg link" href="${esc(trade.url)}" target="_blank" rel="noopener">${esc(tr('Otwórz w Notion (tam też usuniesz wpis)'))}</a>` : `<span class="fmsg">${esc(tr('Zapis idzie wprost do bazy Trade\'y w Notion.'))}</span>`;
    return `${left}<span class="grow"></span><button type="button" class="btn ghost" data-f-act="close">${esc(tr('Anuluj'))}</button>
      <button type="submit" form="f-form" class="btn primary" data-f-act="save" id="f-save">${esc(trade ? tr('Zapisz zmiany') : tr('Dodaj do Notion'))}</button>`;
  }

  const field = (n) => dlg.querySelector(`[name="${n}"]`);
  const pressed = (sel) => [...dlg.querySelectorAll(`${sel} [aria-pressed="true"]`)].map((b) => b.dataset.v);
  const visible = (cls) => !dlg.querySelector(cls)?.hidden;

  function syncTyp() {
    const typ = pressed('[data-seg="typ"]')[0] || '';
    dlg.querySelector('.only-pnl').hidden = typ === 'Niewzięty';
    dlg.querySelector('.only-konta').hidden = typ !== 'Live';
    dlg.querySelector('.only-reason').hidden = typ !== 'Niewzięty';
  }

  // Zbiera wartości z formularza. Pola ukryte dla danego typu nie są wysyłane, więc nic ich nie nadpisuje ani nie czyści.
  function collect() {
    const errs = {};
    const p = { tz: TZ };
    const g = (n) => (field(n)?.value ?? '').trim();
    p.name = g('name');
    p.typ = pressed('[data-seg="typ"]')[0] || '';
    p.date = g('date'); p.time = g('time');
    if (dlg.querySelector('[name="exitTime"]')) { p.exitDate = g('exitDate'); p.exitTime = g('exitTime'); }
    for (const k of ['instrument', 'setup', 'session']) p[k] = g(k);
    p.dir = pressed('[data-seg="dir"]')[0] || '';
    const r = parseNum(g('r'));
    if (r.err) errs.r = tr('Wpisz liczbę, np. 1,5 lub −0,8.'); else p.r = r.val;
    if (visible('.only-pnl')) { const x = parseNum(g('pnl')); if (x.err) errs.pnl = tr('Wpisz kwotę w dolarach, np. 320 lub −150.'); else p.pnl = x.val; }
    if (visible('.only-konta')) p.konta = pressed('[data-pills="konta"]');
    if (visible('.only-reason')) p.reason = g('reason');
    p.chart = g('chart');
    p.notes = field('notes').value;
    if (!p.typ) errs.typ = tr('Wybierz typ trade\'a.');
    if (!p.date) errs.date = tr('Podaj datę wejścia.');
    if (p.chart && !/^https?:\/\/\S+$/i.test(p.chart)) errs.chart = tr('Wklej pełny adres zaczynający się od https://, np. link do zrzutu z TradingView.');
    if (p.exitDate && !p.exitTime) errs.exitTime = tr('Podaj godzinę wyjścia albo wyczyść datę wyjścia.');
    if (p.exitTime && p.time && `${p.exitDate || p.date}T${p.exitTime}` < `${p.date}T${p.time}`) errs.exitTime = tr('Wyjście jest przed wejściem. Jeśli trade trwał przez północ, ustaw datę wyjścia na następny dzień.');
    if (trade) p.edited = trade.edited;
    return { payload: p, errs };
  }

  const snap = () => JSON.stringify(collect().payload);

  function clearErrors() {
    dlg.querySelectorAll('.ferr').forEach((e) => { e.hidden = true; e.textContent = ''; });
    dlg.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
    banner('');
  }
  function showErrors(map) {
    let first = null;
    for (const [k, msg] of Object.entries(map)) {
      const e = dlg.querySelector(`#e-${k}`);
      const ctl = dlg.querySelector(`#f-${k}`);
      if (e) { e.textContent = msg; e.hidden = false; }
      if (ctl) { ctl.setAttribute('aria-invalid', 'true'); if (!first && (ctl.matches('input,select,textarea') || ctl.querySelector('button'))) first = ctl.matches('input,select,textarea') ? ctl : ctl.querySelector('button'); }
    }
    if (first) first.focus();
  }
  function banner(msg, action) {
    const b = dlg.querySelector('#f-banner');
    b.hidden = !msg;
    b.innerHTML = msg ? `<span>${esc(msg)}</span>${action ? `<button type="button" class="btn sm" data-f-act="reload">${esc(action)}</button>` : ''}` : '';
    if (msg) b.scrollIntoView({ block: 'nearest' });
  }

  function setSaving(on) {
    saving = on;
    const b = dlg?.querySelector('#f-save');
    if (!b) return;
    b.disabled = on;
    b.textContent = on ? tr('Zapisuję…') : (trade ? tr('Zapisz zmiany') : tr('Dodaj do Notion'));
  }

  async function save() {
    if (saving) return;
    clearErrors();
    // zrzut jeszcze się wysyła: po jego końcu zmienia się znacznik edycji wpisu, więc zapis teraz skończyłby się fałszywym konfliktem
    if (shotsCtl?.busy()) { banner(tr('Zrzut jest jeszcze wysyłany. Poczekaj, aż skończy, i zapisz ponownie.')); return; }
    const { payload, errs } = collect();
    if (Object.keys(errs).length) { showErrors(errs); banner(tr('Popraw zaznaczone pola i spróbuj jeszcze raz.')); return; }
    setSaving(true);
    try {
      const res = await fetch(trade ? `/api/trades/${trade.id}` : '/api/trades', {
        method: trade ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', 'X-THQ': '1' },
        body: JSON.stringify(payload),
      });
      let j = {};
      try { j = await res.json(); } catch { /* brak treści */ }
      if (res.ok) {
        const t = payload;
        closeNow();
        toast(guide.on ? tr('Zapisano w pamięci (tryb przewodnika).') : trade ? tr('Zapisano zmiany w Notion.') : tr('Dodano trade do Notion.'));
        await reload(true);
        onSaved?.(t, !trade);
        return;
      }
      if (res.status === 400 && j.fields && Object.keys(j.fields).length) { showErrors(j.fields); banner(j.error || tr('Popraw zaznaczone pola.')); }
      else if (res.status === 409 && j.code === 'stale') banner(j.error, tr('Wczytaj zmiany'));
      else banner(j.error || tr('Nie udało się zapisać (błąd {status}).', { status: res.status }));
    } catch {
      banner(tr('Nie mogę połączyć się z lokalnym serwerem. Dane są jeszcze w formularzu: uruchom dashboard ponownie i zapisz jeszcze raz.'));
    } finally {
      setSaving(false);
    }
  }

  async function reloadAndReopen() {
    const id = trade?.id;
    await reload(true);
    const fresh = id ? model().trades.find((x) => x.id === id) : null;
    closeNow();
    if (fresh) open(fresh, opener);
  }

  function closeNow() {
    if (!root) return;
    shotsCtl?.unbind(); shotsCtl = null;
    root.remove();
    root = dlg = null;
    discarding = false;
    overlay.current = null;
    document.documentElement.classList.remove('lb-lock');
    if (opener && document.contains(opener)) opener.focus();
    else document.querySelector('[data-act="add-trade"]')?.focus();
    onClose?.();
  }

  function requestClose() {
    if (!root || saving) return;
    if (snap() !== snapshot && !discarding) { discarding = true; dlg.querySelector('#f-foot').innerHTML = footHtml(); dlg.querySelector('[data-f-act="keep"]').focus(); return; }
    closeNow();
  }

  function onKey(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); if (discarding) { discarding = false; dlg.querySelector('#f-foot').innerHTML = footHtml(); } else requestClose(); return; }
    trapTab(ev, dlg);
  }

  function open(t, from) {
    if (root) return;
    if (!model()) return;
    trade = t || null;
    opener = from || document.activeElement;
    const v = initial(trade);
    root = document.createElement('div');
    root.className = 'scrim';
    root.innerHTML = html(v);
    document.body.appendChild(root);
    dlg = root.firstElementChild;
    dlg.querySelector('#f-foot').innerHTML = footHtml();
    document.documentElement.classList.add('lb-lock');
    syncTyp();
    snapshot = snap();
    overlay.current = { onKey };
    root.addEventListener('mousedown', (e) => { if (e.target === root) requestClose(); });
    root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-f-act]');
      if (a) {
        const act = a.dataset.fAct;
        if (act === 'close') requestClose();
        else if (act === 'keep') { discarding = false; dlg.querySelector('#f-foot').innerHTML = footHtml(); field('date').focus(); }
        else if (act === 'discard') closeNow();
        else if (act === 'reload') reloadAndReopen();
        return;
      }
      const segBtn = e.target.closest('[data-seg] button');
      if (segBtn) {
        const g = segBtn.closest('[data-seg]');
        const was = segBtn.getAttribute('aria-pressed') === 'true';
        g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        if (!(was && g.dataset.clear === 'true')) segBtn.setAttribute('aria-pressed', 'true');
        if (g.dataset.seg === 'typ') syncTyp();
        return;
      }
      const pill = e.target.closest('[data-pills] .pill');
      if (pill) pill.setAttribute('aria-pressed', String(pill.getAttribute('aria-pressed') !== 'true'));
    });
    dlg.querySelector('#f-form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
    const sf = dlg.querySelector('.shots-fld');
    if (trade) {
      shotsCtl = bindShots({
        root: sf, zone: dlg, isActive: () => !!root && !saving, getTrade: () => trade,
        onUploaded: async (res) => {
          // odświeżone dane: nowa liczba zrzutów i miniatury; znacznik edycji przejmujemy tylko wtedy, gdy nic innego nie zmieniło wpisu w Notion
          await reload(true);
          const fresh = model().trades.find((x) => x.id === trade?.id);
          if (!trade) return;
          if (res.editedMatched && res.edited) trade.edited = res.edited;
          if (fresh) { trade.imgs = fresh.imgs; const strip = sf.querySelector('.shot-strip'); strip.innerHTML = thumbsHtml(fresh); strip.hidden = !fresh.imgs; }
        },
      });
    }
    // pierwsze pole do wpisania
    field('date').focus();
  }

  return { open, isOpen: () => !!root };
}
