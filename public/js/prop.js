// Prop firmy: zakładka „Prop” (konta, ROI, wykresy, wpisy finansowe) oraz wszystkie akcje na bazach Konta i Wydatki i payouty:
// dodanie i edycja konta, szybka zmiana statusu i salda, wpis finansowy (payout, reset, opłata, zakup), historia konta.
// Zapis idzie do Notion przez lokalny serwer; usuwanie zostaje w Notion (link „Otwórz w Notion” w każdym formularzu).
import * as F from './format.js';
import * as S from './stats.js';
import { drawEquity, drawBars } from './charts.js';
import { overlay, trapTab, toast } from './modal.js';
import { openFormModal } from './formcore.js';
import { logoHtml, EXTRA_FIRMS, firmKey } from './firmy.js';
import { t as tr } from './i18n.js';

const { esc, fmtMoney, num, cls, DASH } = F;
const SIZES = [25000, 50000, 100000, 150000];
const svg = (body, s = 14, sw = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const PLUS = svg('<path d="M12 5v14M5 12h14"/>');
const PENCIL = svg('<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>', 13, 1.8);
const CLOSE = svg('<path d="M6 6l12 12M18 6 6 18"/>', 18);
const badge = (text, color) => `<span class="badge c-${esc(color || 'default')}">${esc(text)}</span>`;
// opcje z rolą (status konta, rodzaj wpisu) mają stały znacznik; w interfejsie pokazujemy tłumaczenie, a do serwera idzie znacznik
const L = (s) => esc(tr(s));
const isPayoutKind = (n) => /payout|wypłat/i.test(n || '');
const moneyFmt = (x) => fmtMoney(x, { plus: false });
const parseMoney = (v) => {
  const t = String(v ?? '').trim().toLowerCase().replace(/\s/g, '').replace('−', '-').replace(',', '.').replace(/\$$/, '');
  if (!t) return { val: null };
  const k = t.endsWith('k');
  const n = Number(k ? t.slice(0, -1) : t);
  return Number.isFinite(n) ? { val: k ? n * 1000 : n } : { err: true };
};
const sizeLabel = (n) => (n % 1000 === 0 ? `${n / 1000}k` : String(n));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const today = () => F.todayKey();

export function createProp({ state, getModel, reload, resolveRange, inRange }) {
  const model = () => getModel();
  const keys = (obj) => Object.keys(obj || {});
  const colorsOf = (src, prop) => model().colors?.[src]?.[prop] || {};
  const saldoEditable = () => model().fields?.konta?.saldo === 'number';
  const kontoName = (id) => model().konta.find((k) => k.id === id)?.name || '';
  const fld = (id, label, inner, { hint = '', cls: c = '', labelFor = true } = {}) => `<div class="fld ${c}" data-f="${id}">
      ${labelFor ? `<label class="lbl" for="f-${id}">${label}</label>` : `<span class="lbl" id="l-${id}">${label}</span>`}${inner}
      <p class="ferr" id="e-${id}" hidden></p>${hint ? `<p class="fhint">${hint}</p>` : ''}</div>`;
  const selectHtml = (id, options, val, blank = tr('Bez wyboru')) => `<select id="f-${id}" name="${id}" aria-describedby="e-${id}"><option value="">${esc(blank)}</option>${options.map((o) => `<option value="${esc(o.value ?? o)}"${(o.value ?? o) === val ? ' selected' : ''}>${esc(o.label ?? o)}</option>`).join('')}</select>`;

  // ---------- wiersz firm: pigułki z logo + „Inna” z polem tekstowym ----------
  function firmItems() {
    const opts = keys(colorsOf('konta', 'firma')).concat(keys(colorsOf('finanse', 'firma')));
    const base = [...new Set(opts)].filter((n) => n !== 'Inna');
    // ta sama firma pod inną nazwą (np. „Lucid” w bazie, „Lucid Trading” w podpowiedziach) nie dostaje drugiej pigułki
    const extra = EXTRA_FIRMS.filter((n) => !base.some((o) => firmKey(o) === firmKey(n)));
    return { items: [...base, ...extra], hasInna: opts.includes('Inna') };
  }
  function firmRow(selected) {
    const { items } = firmItems();
    const known = items.includes(selected);
    const other = !!selected && !known;
    return `<div class="pills" role="group" aria-labelledby="l-firma" id="f-firma" data-single="firma">${items.map((n) => `<button type="button" class="pill firm" data-v="${esc(n)}" aria-pressed="${n === selected}">${logoHtml(n, 18)}${esc(n)}</button>`).join('')}<button type="button" class="pill firm" data-v="__other" aria-pressed="${other}">${logoHtml(tr('Inna'), 18)}${L('Inna…')}</button></div>
      <input id="f-firmaOther" class="firm-other" type="text" maxlength="40" placeholder="${L('Nazwa firmy')}" aria-label="${L('Nazwa innej firmy')}" value="${other && selected !== 'Inna' ? esc(selected) : ''}" ${other ? '' : 'hidden'}>`;
  }
  function readFirm(dlg) {
    const pressed = dlg.querySelector('#f-firma [aria-pressed="true"]');
    if (!pressed) return { firma: '' };
    const { items, hasInna } = firmItems();
    const all = [...keys(colorsOf('konta', 'firma')), ...keys(colorsOf('finanse', 'firma'))];
    if (pressed.dataset.v !== '__other') {
      const v = pressed.dataset.v;
      return { firma: v, firmaNew: !all.includes(v) };
    }
    const t = dlg.querySelector('#f-firmaOther').value.trim();
    if (!t) return hasInna ? { firma: 'Inna' } : { firma: '', err: tr('Wpisz nazwę firmy.') };
    const hit = [...items, ...all].find((n) => n.toLowerCase() === t.toLowerCase());
    return hit ? { firma: hit, firmaNew: !all.includes(hit) } : { firma: t, firmaNew: true };
  }
  function bindFirm(dlg, onChange) {
    dlg.querySelector('#f-firma').addEventListener('click', (e) => {
      const b = e.target.closest('.pill');
      if (!b) return;
      dlg.querySelectorAll('#f-firma .pill').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const o = dlg.querySelector('#f-firmaOther');
      o.hidden = b.dataset.v !== '__other';
      if (!o.hidden) o.focus();
      onChange();
    });
    dlg.querySelector('#f-firmaOther').addEventListener('input', onChange);
  }

  // ---------- formularz konta ----------
  function openKontoForm(konto, opener) {
    const m = model();
    const editing = !!konto;
    const statuses = keys(colorsOf('konta', 'status'));
    const edSaldo = saldoEditable();
    const v = editing
      ? { name: konto.name, firma: konto.firma || '', status: konto.status || '', size: konto.size, bought: konto.bought || '', notes: konto.notes || '', saldo: konto.saldo }
      : { name: '', firma: '', status: statuses.includes('Challenge') ? 'Challenge' : statuses[0] || '', size: null, bought: today(), notes: '', saldo: null };
    const sizeRow = `<div class="size-row"><div class="pills" role="group" aria-labelledby="l-size" data-single="size">${SIZES.map((n) => `<button type="button" class="pill" data-v="${n}" aria-pressed="${v.size === n}">${sizeLabel(n)}</button>`).join('')}</div>
      <input id="f-size" type="text" inputmode="decimal" placeholder="${L('Inna, np. 75000')}" value="${v.size != null && !SIZES.includes(v.size) ? v.size : ''}" aria-describedby="e-size" aria-label="${L('Inny rozmiar konta w dolarach')}"></div>`;
    const body = `<div class="fgrid">
      ${fld('firma', L('Firma'), firmRow(v.firma), { cls: 'span4', labelFor: false })}
      ${fld('size', L('Rozmiar'), sizeRow, { cls: 'span4', labelFor: false })}
      ${fld('name', L('Nazwa konta'), `<input id="f-name" name="name" type="text" maxlength="120" value="${esc(v.name)}" aria-describedby="e-name">`, { cls: 'span2', hint: editing ? '' : L('Podpowiadana z firmy i rozmiaru; możesz ją zmienić.') })}
      ${fld('status', L('Status'), selectHtml('status', statuses.map((s) => ({ value: s, label: tr(s) })), v.status, tr('Bez statusu')), { cls: 'span1' })}
      ${fld('bought', L('Data zakupu'), `<input id="f-bought" name="bought" type="date" value="${esc(v.bought)}" aria-describedby="e-bought">`, { cls: 'span1' })}
      ${edSaldo
        ? fld('saldo', L('Saldo $'), `<input id="f-saldo" name="saldo" type="text" inputmode="decimal" value="${v.saldo ?? ''}" aria-describedby="e-saldo">`, { cls: 'span1', hint: editing ? '' : L('Domyślnie równe rozmiarowi.') })
        : `<div class="fld span1"><span class="lbl">${L('Saldo')}</span><p class="ro">${editing && konto.saldo != null ? moneyFmt(konto.saldo) : DASH}</p><p class="fhint">${L('Liczy Notion (formuła), tylko do odczytu.')}</p></div>`}
      ${editing ? '' : fld('cost', L('Koszt zakupu $'), `<input id="f-cost" name="cost" type="text" inputmode="decimal" placeholder="${L('np. 147')}" aria-describedby="e-cost">`, { cls: 'span1', hint: L('Po wpisaniu powstaje też wpis w Wydatkach.') })}
      ${fld('notes', L('Notatki'), `<textarea id="f-notes" name="notes" rows="3" maxlength="8000" aria-describedby="e-notes">${esc(v.notes)}</textarea>`, { cls: 'span4' })}
    </div>`;
    let nameTouched = editing, saldoTouched = editing;
    const suggest = (dlg) => {
      if (nameTouched) return;
      const f = readFirm(dlg).firma;
      const sizeNow = readSize(dlg).val;
      if (!f || f === 'Inna' || !sizeNow) return;
      const prefix = `${f} ${sizeLabel(sizeNow)} #`;
      const re = new RegExp(`^${reEsc(prefix)}(\\d+)$`, 'i');
      const max = Math.max(0, ...m.konta.map((k) => Number((re.exec(k.name) || [])[1] || 0)));
      dlg.querySelector('#f-name').value = `${prefix}${max + 1}`;
    };
    const readSize = (dlg) => { const pr = dlg.querySelector('[data-single="size"] [aria-pressed="true"]'); return pr ? { val: Number(pr.dataset.v) } : parseMoney(dlg.querySelector('#f-size').value); };
    return openFormModal({
      title: editing ? tr('Edytuj konto') : tr('Dodaj konto'),
      bodyHtml: body, opener, initialFocus: editing ? '#f-name' : '#f-firma button',
      endpoint: editing ? `/api/konta/${konto.id}` : '/api/konta', method: editing ? 'PATCH' : 'POST',
      notionUrl: editing ? konto.url : '', saveLabel: editing ? tr('Zapisz zmiany') : tr('Dodaj konto'),
      okMessage: editing ? tr('Zapisano konto w Notion.') : tr('Dodano konto do Notion.'),
      reload, onStale: async () => { await reload(true); const fresh = model().konta.find((k) => k.id === konto.id); if (fresh) openKontoForm(fresh, opener); },
      onMount(dlg) {
        bindFirm(dlg, () => suggest(dlg));
        dlg.querySelector('[data-single="size"]').addEventListener('click', (e) => {
          const b = e.target.closest('.pill');
          if (!b) return;
          const was = b.getAttribute('aria-pressed') === 'true';
          dlg.querySelectorAll('[data-single="size"] .pill').forEach((x) => x.setAttribute('aria-pressed', 'false'));
          const inp = dlg.querySelector('#f-size');
          if (was) { inp.value = ''; } else { b.setAttribute('aria-pressed', 'true'); inp.value = ''; }
          if (edSaldo && !saldoTouched) dlg.querySelector('#f-saldo').value = was ? '' : b.dataset.v;
          suggest(dlg);
        });
        dlg.querySelector('#f-size').addEventListener('input', () => {
          const n = readSize(dlg).val;
          dlg.querySelectorAll('[data-single="size"] .pill').forEach((x) => x.setAttribute('aria-pressed', String(n === Number(x.dataset.v))));
          if (edSaldo && !saldoTouched && n != null) dlg.querySelector('#f-saldo').value = n;
          suggest(dlg);
        });
        dlg.querySelector('#f-name').addEventListener('input', () => { nameTouched = true; });
        dlg.querySelector('#f-saldo')?.addEventListener('input', () => { saldoTouched = true; });
      },
      collect(dlg) {
        const errs = {};
        const firm = readFirm(dlg);
        if (!firm.firma) errs.firma = firm.err || tr('Wybierz firmę prop.');
        const sz = readSize(dlg);
        if (sz.err) errs.size = tr('Wpisz rozmiar w dolarach, np. 75000 albo 75k.');
        const p = { name: dlg.querySelector('#f-name').value.trim(), firma: firm.firma, firmaNew: !!firm.firmaNew, status: dlg.querySelector('#f-status').value, size: sz.val ?? null, bought: dlg.querySelector('#f-bought').value, notes: dlg.querySelector('#f-notes').value };
        if (!p.name) errs.name = tr('Wpisz nazwę konta, np. Lucid 50k #1.');
        if (edSaldo) { const s = parseMoney(dlg.querySelector('#f-saldo').value); if (s.err) errs.saldo = tr('Wpisz saldo w dolarach, np. 50000.'); else if (s.val != null) p.saldo = s.val; else if (editing) p.saldo = null; }
        if (!editing) { const c = parseMoney(dlg.querySelector('#f-cost').value); if (c.err || (c.val != null && c.val < 0)) errs.cost = tr('Wpisz koszt w dolarach, np. 147, albo zostaw puste.'); else if (c.val != null) p.cost = c.val; }
        if (editing) p.edited = konto.edited;
        return { payload: p, errs };
      },
    });
  }

  // ---------- formularz wpisu finansowego ----------
  function kindOptions() { return keys(colorsOf('finanse', 'kind')); }
  const payoutKind = () => kindOptions().find(isPayoutKind) || '';
  const purchaseKind = () => kindOptions().find((n) => n === 'Zakup challenge') || kindOptions().find((n) => /zakup|challenge|purchase/i.test(n)) || kindOptions().find((n) => !isPayoutKind(n)) || '';
  const expenseKind = (re) => kindOptions().find((n) => re.test(n)) || kindOptions().find((n) => !isPayoutKind(n) && n !== purchaseKind()) || purchaseKind();

  function openFinanseForm(entry, preset = {}, opener) {
    const m = model();
    const editing = !!entry;
    const kinds = kindOptions();
    const v = editing
      ? { name: entry.name, kind: entry.kind, amount: entry.amount, date: entry.date, firma: entry.firma === 'Inna' && !entry.name ? 'Inna' : entry.firma, konto: entry.konto || '' }
      : { name: '', kind: preset.kind ?? purchaseKind(), amount: preset.amount ?? null, date: today(), firma: preset.firma || '', konto: preset.konto || '' };
    const kontoOpts = m.konta.map((k) => ({ value: k.id, label: `${k.name}${k.firma ? ' · ' + k.firma : ''}` }));
    const kindPills = `<div class="pills" role="group" aria-labelledby="l-kind" id="f-kind" data-single="kind">${kinds.map((n) => `<button type="button" class="pill" data-v="${esc(n)}" aria-pressed="${n === v.kind}">${L(n)}</button>`).join('')}</div>`;
    const body = `<div class="fgrid">
      ${fld('kind', L('Rodzaj'), kindPills, { cls: 'span4', labelFor: false })}
      ${fld('amount', L('Kwota $'), `<input id="f-amount" name="amount" type="text" inputmode="decimal" value="${v.amount ?? ''}" placeholder="${L('np. 147')}" aria-describedby="e-amount">`, { cls: 'span1' })}
      ${fld('date', L('Data'), `<input id="f-date" name="date" type="date" value="${esc(v.date)}" aria-describedby="e-date">`, { cls: 'span1' })}
      ${fld('konto', L('Konto'), selectHtml('konto', kontoOpts, v.konto, tr('Bez konta')), { cls: 'span2' })}
      ${fld('firma', L('Firma'), firmRow(v.firma), { cls: 'span4', labelFor: false })}
      ${fld('name', L('Opis'), `<input id="f-name" name="name" type="text" maxlength="200" value="${esc(v.name)}" aria-describedby="e-name">`, { cls: 'span4', hint: editing ? '' : L('Podpowiadany z rodzaju, firmy i konta; możesz go zmienić.') })}
      ${editing ? '' : `<div class="fld span4" id="deduct-wrap" hidden><label class="check big"><input id="f-deductSaldo" type="checkbox"><span>${L('Odejmij kwotę od salda konta (payout wypłaca środki z konta)')}</span></label><p class="ferr" id="e-deductSaldo" hidden></p></div>`}
    </div>`;
    let nameTouched = editing;
    const kindNow = (dlg) => dlg.querySelector('#f-kind [aria-pressed="true"]')?.dataset.v || '';
    const sync = (dlg) => {
      const k = kindNow(dlg), id = dlg.querySelector('#f-konto').value;
      if (!nameTouched) {
        const f = readFirm(dlg).firma;
        dlg.querySelector('#f-name').value = [k ? tr(k) : '', f && f !== 'Inna' ? f : '', id ? kontoName(id) : ''].filter(Boolean).join(' · ');
      }
      const w = dlg.querySelector('#deduct-wrap');
      if (w) { w.hidden = !(isPayoutKind(k) && id && saldoEditable()); if (w.hidden) dlg.querySelector('#f-deductSaldo').checked = false; }
    };
    return openFormModal({
      title: editing ? tr('Edytuj wpis finansowy') : (preset.kind && isPayoutKind(preset.kind) ? tr('Dodaj payout') : tr('Dodaj wpis finansowy')),
      bodyHtml: body, opener, initialFocus: '#f-amount',
      endpoint: editing ? `/api/finanse/${entry.id}` : '/api/finanse', method: editing ? 'PATCH' : 'POST',
      notionUrl: editing ? entry.url : '', saveLabel: editing ? tr('Zapisz zmiany') : tr('Dodaj wpis'),
      okMessage: editing ? tr('Zapisano wpis w Notion.') : tr('Dodano wpis do Notion.'),
      reload, onStale: async () => { await reload(true); const fresh = model().finanse.find((f) => f.id === entry.id); if (fresh) openFinanseForm(fresh, {}, opener); },
      onMount(dlg) {
        bindFirm(dlg, () => sync(dlg));
        dlg.querySelector('#f-kind').addEventListener('click', (e) => {
          const b = e.target.closest('.pill');
          if (!b) return;
          dlg.querySelectorAll('#f-kind .pill').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          sync(dlg);
        });
        dlg.querySelector('#f-konto').addEventListener('change', () => {
          const k = m.konta.find((x) => x.id === dlg.querySelector('#f-konto').value);
          if (k && k.firma) {
            const { items } = firmItems();
            const target = items.includes(k.firma) ? k.firma : '__other';
            dlg.querySelectorAll('#f-firma .pill').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === target)));
            const o = dlg.querySelector('#f-firmaOther');
            o.hidden = target !== '__other';
            if (target === '__other') o.value = k.firma;
          }
          sync(dlg);
        });
        dlg.querySelector('#f-name').addEventListener('input', () => { nameTouched = true; });
        sync(dlg);
      },
      collect(dlg) {
        const errs = {};
        const kind = kindNow(dlg);
        if (!kind) errs.kind = tr('Wybierz rodzaj wpisu.');
        const a = parseMoney(dlg.querySelector('#f-amount').value);
        if (a.err || a.val == null || a.val < 0) errs.amount = tr('Wpisz kwotę w dolarach, np. 147 albo 1200.');
        const date = dlg.querySelector('#f-date').value;
        if (!date) errs.date = tr('Podaj datę wpisu.');
        const firm = readFirm(dlg);
        if (firm.err) errs.firma = firm.err;
        const p = { name: dlg.querySelector('#f-name').value.trim(), kind, amount: a.val, date, konto: dlg.querySelector('#f-konto').value, firma: firm.firma || '', firmaNew: !!firm.firmaNew };
        if (!p.firma) { delete p.firma; delete p.firmaNew; }
        if (!editing && dlg.querySelector('#f-deductSaldo')?.checked && !dlg.querySelector('#deduct-wrap').hidden) p.deductSaldo = true;
        if (editing) p.edited = entry.edited;
        return { payload: p, errs };
      },
    });
  }

  // ---------- szczegóły konta ----------
  let det = null;
  function kontoHistory(id) {
    const m = model();
    const fin = m.finanse.filter((f) => f.konta.includes(id)).sort((a, b) => b.date.localeCompare(a.date));
    const trades = m.trades.filter((t) => t.typ === 'Live' && t.konta.includes(id)).sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
    const money = S.money(fin);
    const tc = S.calc(trades.filter((t) => t.counted));
    return { fin, trades, money, tc };
  }
  function detailsHtml(k, st) {
    const m = model();
    const h = kontoHistory(k.id);
    const statuses = keys(colorsOf('konta', 'status'));
    const statusPills = statuses.map((s) => `<button type="button" class="pill" data-d="status" data-v="${esc(s)}" aria-pressed="${s === k.status}">${L(s)}</button>`).join('');
    const confirmRow = st.confirm ? `<div class="confirm-row" role="alert"><span>${tr('Oznaczyć to konto jako <b>{status}</b>? Konto przestanie być aktywne w dashboardzie.', { status: L(st.confirm) })}</span><button type="button" class="btn sm" data-d="status-yes">${L('Tak, zmień')}</button><button type="button" class="btn ghost sm" data-d="status-no">${L('Anuluj')}</button></div>` : '';
    const saldoBox = saldoEditable()
      ? `<div class="kd-saldo"><label class="lbl" for="d-saldo">${L('Saldo $')}</label><div class="kd-saldo-row"><input id="d-saldo" type="text" inputmode="decimal" value="${k.saldo ?? ''}" aria-describedby="d-saldo-h"><button type="button" class="btn" data-d="saldo-save">${L('Zapisz saldo')}</button></div><p class="fhint" id="d-saldo-h">${L('Jedno pole: wpisz aktualne saldo i zapisz.')}</p></div>`
      : `<div class="kd-saldo"><span class="lbl">${L('Saldo')}</span><p class="ro">${k.saldo != null ? moneyFmt(k.saldo) : DASH}</p><p class="fhint">${L('Liczy Notion (formuła), więc nie da się go zmienić z dashboardu.')}</p></div>`;
    const facts = [[tr('Firma'), k.firma], [tr('Rozmiar'), k.size != null ? moneyFmt(k.size) : null], [tr('Data zakupu'), k.bought ? F.longDate(k.bought) : null], [tr('Aktywne'), k.active ? tr('Tak') : tr('Nie')], [tr('Trade’y Live'), String(h.trades.length)], [tr('Wynik z trade’ów'), h.tc.hasPnl ? fmtMoney(h.tc.sumPnl) : null]].filter((x) => x[1]);
    const finRows = h.fin.slice(0, 12).map((f) => `<tr><td class="nw">${esc(F.shortDate(f.date))}</td><td>${badge(f.kind ? tr(f.kind) : DASH, colorsOf('finanse', 'kind')[f.kind])}</td><td class="r ${f.payout ? 'pos' : 'neg'}">${f.payout ? '+' : '−'}${moneyFmt(f.amount)}</td></tr>`).join('');
    const trRows = h.trades.slice(0, 8).map((t) => `<tr><td class="nw">${esc(F.shortDate(t.date))}</td><td class="nm">${esc(t.name || [t.instrument, t.dir].filter(Boolean).join(' ') || tr('Trade'))}</td><td class="r ${cls(t.r)}">${F.fmtR(t.r)}</td><td class="r ${cls(t.pnl)}">${t.pnl != null ? fmtMoney(t.pnl) : DASH}</td></tr>`).join('');
    void m;
    return `<div class="mh kd-h"><div class="kd-title">${logoHtml(k.firma, 28)}<div><h2 id="kd-t">${esc(k.name)}</h2><p class="fhint">${esc(k.firma || tr('bez firmy'))}${k.size ? ' · ' + sizeLabel(k.size) : ''}</p></div></div><button type="button" class="icon-btn" data-d="close" aria-label="${L('Zamknij szczegóły konta')}">${CLOSE}</button></div>
      <div class="mb kd">
        ${st.error ? `<div class="banner" role="alert"><span>${esc(st.error)}</span></div>` : ''}
        <div class="kd-facts">${facts.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</div>
        <div class="kd-row"><div><span class="lbl" id="d-st">${L('Status')}</span><div class="pills" role="group" aria-labelledby="d-st">${statusPills}</div>${confirmRow}</div>${saldoBox}</div>
        <div class="kd-actions"><button type="button" class="btn primary" data-d="edit">${PENCIL}${L('Edytuj konto')}</button><button type="button" class="btn" data-d="payout">${PLUS}${L('Dodaj payout')}</button><button type="button" class="btn" data-d="reset">${PLUS}${L('Dodaj reset / opłatę')}</button><a class="btn" href="${esc(k.url)}" target="_blank" rel="noopener">${L('Otwórz w Notion')}</a></div>
        <div class="kd-hist"><div><span class="lbl">${L('Wpisy finansowe')}</span>${h.fin.length ? `<div class="tbl-wrap"><table><tbody>${finRows}</tbody></table></div>` : `<p class="fhint">${L('Brak wpisów dla tego konta.')}</p>`}
          <p class="kd-sum">${L('Wypłacone')} <b class="pos">${moneyFmt(h.money.payout)}</b> · ${L('wydane')} <b>${moneyFmt(h.money.spend)}</b> · ${L('bilans')} <b class="${cls(h.money.balance)}">${fmtMoney(h.money.balance)}</b></p></div>
          <div><span class="lbl">${L('Trade’y Live na tym koncie')}</span>${h.trades.length ? `<div class="tbl-wrap"><table><tbody>${trRows}</tbody></table></div>` : `<p class="fhint">${L('Brak trade’ów Live przypisanych do tego konta.')}</p>`}
          <p class="kd-sum">${esc(tr.p("{n} trade'ów", h.tc.n))} · ${L('suma R')} <b class="${cls(h.tc.sumR)}">${F.fmtR(h.tc.sumR)}</b>${h.tc.hasPnl ? ` · P&amp;L <b class="${cls(h.tc.sumPnl)}">${fmtMoney(h.tc.sumPnl)}</b>` : ''}</p></div></div>
      </div>`;
  }
  function closeDetails({ restore = true } = {}) {
    if (!det) return;
    det.root.remove();
    overlay.current = null;
    document.documentElement.classList.remove('lb-lock');
    const o = det.opener;
    det = null;
    if (restore && o && document.contains(o)) o.focus();
  }
  async function patchKonto(id, body) {
    const res = await fetch(`/api/konta/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-THQ': '1' }, body: JSON.stringify(body) });
    let j = {};
    try { j = await res.json(); } catch { /* brak treści */ }
    if (!res.ok) throw new Error(j.error || tr('Nie udało się zapisać (błąd {status}).', { status: res.status }));
    return j;
  }
  function openKontoDetails(id, { opener, focusSaldo = false } = {}) {
    const k0 = model().konta.find((k) => k.id === id);
    if (!k0 || det) return;
    const root = document.createElement('div');
    root.className = 'scrim';
    root.innerHTML = '<div class="modal kd-modal" role="dialog" aria-modal="true" aria-labelledby="kd-t"></div>';
    document.body.appendChild(root);
    document.documentElement.classList.add('lb-lock');
    const dlg = root.firstElementChild;
    const st = { confirm: '', error: '' };
    det = { root, opener: opener || document.activeElement, id };
    const paint = () => {
      const k = model().konta.find((x) => x.id === id);
      if (!k) { closeDetails(); return; }
      dlg.innerHTML = detailsHtml(k, st);
    };
    const run = async (fn) => {
      st.error = '';
      try { await fn(); await reload(true); st.confirm = ''; }
      catch (e) { st.error = e.message || tr('Nie udało się zapisać.'); }
      paint();
    };
    paint();
    overlay.current = { onKey(ev) { if (ev.key === 'Escape') { ev.preventDefault(); if (st.confirm) { st.confirm = ''; paint(); } else closeDetails(); } else trapTab(ev, dlg); } };
    root.addEventListener('mousedown', (e) => { if (e.target === root) closeDetails(); });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-d]');
      if (!b) return;
      const act = b.dataset.d;
      const k = model().konta.find((x) => x.id === id);
      const from = det?.opener;
      if (act === 'close') closeDetails();
      else if (act === 'edit') { closeDetails({ restore: false }); openKontoForm(k, from); }
      else if (act === 'payout') { closeDetails({ restore: false }); openFinanseForm(null, { kind: payoutKind(), konto: id, firma: k.firma }, from); }
      else if (act === 'reset') { closeDetails({ restore: false }); openFinanseForm(null, { kind: expenseKind(/reset/i), konto: id, firma: k.firma }, from); }
      else if (act === 'status') {
        const s = b.dataset.v;
        if (s === k.status) return;
        if (/przegran|zamkni/i.test(s)) { st.confirm = s; paint(); dlg.querySelector('[data-d="status-yes"]')?.focus(); }
        else run(() => patchKonto(id, { status: s, edited: k.edited }));
      } else if (act === 'status-yes') run(() => patchKonto(id, { status: st.confirm, edited: k.edited }));
      else if (act === 'status-no') { st.confirm = ''; paint(); }
      else if (act === 'saldo-save') {
        const val = parseMoney(dlg.querySelector('#d-saldo').value);
        if (val.err || val.val == null) { st.error = tr('Wpisz saldo w dolarach, np. 50000.'); paint(); return; }
        run(() => patchKonto(id, { saldo: val.val, edited: k.edited }));
      }
    });
    if (focusSaldo) dlg.querySelector('#d-saldo')?.focus(); else dlg.querySelector('[data-d="edit"]')?.focus();
  }

  // ---------- menu „+” ----------
  let menu = null;
  function closeMenu({ restore = true } = {}) {
    if (!menu) return;
    menu.el.remove();
    menu.anchor.setAttribute('aria-expanded', 'false');
    const a = menu.anchor;
    menu = null;
    if (restore) a.focus();
  }
  function openMenu(anchor) {
    if (menu) { closeMenu(); return; }
    const el = document.createElement('div');
    el.className = 'menu';
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', tr('Dodaj'));
    el.innerHTML = `<button type="button" role="menuitem" data-m="konto">${PLUS}${L('Konto')}</button><button type="button" role="menuitem" data-m="payout">${PLUS}${L('Payout')}</button><button type="button" role="menuitem" data-m="wydatek">${PLUS}${L('Wydatek')}</button>`;
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    const w = 180;
    el.style.width = `${w}px`;
    el.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.right - w))}px`;
    el.style.top = `${Math.round(r.bottom + 6)}px`;
    anchor.setAttribute('aria-expanded', 'true');
    menu = { el, anchor };
    const items = [...el.querySelectorAll('button')];
    items[0].focus();
    el.addEventListener('keydown', (ev) => {
      const i = items.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); closeMenu(); }
      else if (ev.key === 'Tab') { ev.preventDefault(); closeMenu(); }
    });
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-m]');
      if (!b) return;
      const which = b.dataset.m;
      const a = menu.anchor;
      closeMenu({ restore: false });
      if (which === 'konto') openKontoForm(null, a);
      else if (which === 'payout') openFinanseForm(null, { kind: payoutKind() }, a);
      else openFinanseForm(null, { kind: purchaseKind() }, a);
    });
  }
  document.addEventListener('pointerdown', (ev) => { if (menu && !menu.el.contains(ev.target) && !ev.target.closest('[data-act="prop-plus"]')) closeMenu({ restore: false }); });

  // ---------- widok „Prop” ----------
  let barsData = [], balPts = [];
  const plusBtn = (cls2 = '') => `<button type="button" class="btn primary ${cls2}" data-act="prop-plus" aria-haspopup="menu" aria-expanded="false">${PLUS}${L('Dodaj')}<span class="caret" aria-hidden="true">▾</span></button>`;

  function viewHtml(range) {
    const m = model();
    const konta = m.konta, fin = m.finanse;
    const accs = konta.filter((k) => state.allAccounts || k.active);
    const edSaldo = saldoEditable();
    const live = m.trades.filter((t) => t.typ === 'Live');
    const accRows = accs.map((k) => {
      const mine = live.filter((t) => t.konta.includes(k.id));
      const pnl = mine.reduce((s, t) => s + (t.pnl ?? 0), 0);
      const ab = accBar(k);
      return `<tr class="trow" data-act="konto-open" data-id="${esc(k.id)}"><td class="name" title="${esc(k.name)}"><span class="nm-row">${logoHtml(k.firma, 22)}<span class="nm-col"><button type="button" class="row-btn" data-act="konto-open" data-id="${esc(k.id)}" title="${L('Pokaż szczegóły konta')}">${esc(k.name)}</button><span class="sub">${k.firma ? esc(k.firma) : ''}${k.size ? ' · ' + num(k.size / 1000, 0) + 'k' : ''}</span></span></span>${ab.bar}<span class="only-sm" style="margin-top:4px">${k.status ? badge(tr(k.status), k.statusColor) : ''}</span></td>
        <td class="hide-sm">${k.status ? badge(tr(k.status), k.statusColor) : DASH}</td>
        <td class="r">${k.saldo != null ? moneyFmt(k.saldo) : DASH}${edSaldo ? `<button type="button" class="mini-act" data-act="konto-saldo" data-id="${esc(k.id)}" aria-label="${esc(tr('Zmień saldo konta {name}', { name: k.name }))}">${PENCIL}</button>` : ''}${ab.pct}</td>
        <td class="r ${cls(pnl)}">${fmtMoney(pnl)}</td><td class="r hide-sm">${mine.length}</td></tr>`;
    }).join('');
    const accTable = accs.length
      ? `<div class="tbl-wrap"><table><thead><tr><th>${L('Konto')}</th><th class="hide-sm">${L('Status')}</th><th class="r">${L('Saldo')}</th><th class="r">P&amp;L</th><th class="r hide-sm">${L('Trade’y')}</th></tr></thead><tbody>${accRows}</tbody></table></div>`
      : `<div class="empty mini"><p>${konta.length ? L('Brak aktywnych kont. Zaznacz „Pokaż wszystkie”, aby zobaczyć także zamknięte.') : L('Nie ma jeszcze żadnego konta.')}</p>${konta.length ? '' : `<button type="button" class="btn primary" data-act="prop-new-konto">${L('Dodaj pierwsze konto')}</button>`}</div>`;

    // wykres miesięczny
    const todayM = F.monthKey(F.todayKey());
    const firstM = fin.length ? fin.reduce((mm, f) => (f.date < mm ? f.date : mm), '9999').slice(0, 7) : todayM;
    const addM = (k, n) => { const [y, mo] = k.split('-').map(Number); const t = y * 12 + (mo - 1) + n; return `${Math.floor(t / 12)}-${F.pad((t % 12) + 1)}`; };
    const endM = range.to ? F.monthKey(range.to) : todayM;
    let startM = range.from ? F.monthKey(range.from) : firstM;
    if (addM(endM, -5) < startM) startM = addM(endM, -5);
    if (addM(endM, -23) > startM) startM = addM(endM, -23);
    barsData = S.byMonth(fin, startM, endM).map((o) => ({
      label: F.MON_SHORT[o.m - 1] + (o.y !== new Date().getFullYear() ? ` ${String(o.y).slice(2)}` : ''), a: o.spend, b: o.payout,
      tip: `<b>${esc(F.monthTitle(o.y, o.m))}</b><br>${L('Wydatki')}: <b>${moneyFmt(o.spend)}</b><br>${L('Payouty')}: <b>${moneyFmt(o.payout)}</b><br>${L('Bilans')}: <b class="${cls(o.payout - o.spend)}">${fmtMoney(o.payout - o.spend)}</b>`,
    }));
    balPts = S.balanceSeries(fin);
    balPts.forEach((p) => {
      if (p.start) { p.xl = tr('Start'); p.tip = `<b>${L('Start')}</b><br><span class="t-muted">${moneyFmt(0)}</span>`; return; }
      p.xl = F.shortDate(p.f.date);
      p.tip = `<b>${esc(F.longDate(p.f.date))}</b><br><span class="t-muted">${esc([p.f.firma, p.f.kind ? tr(p.f.kind) : ''].filter(Boolean).join(' · '))}</span><br>${L('Ten wpis')}: <b class="${cls(p.d)}">${fmtMoney(p.d)}</b><br>${L('Bilans')}: <b class="${cls(p.cum)}">${fmtMoney(p.cum)}</b>`;
    });
    const balEnd = balPts[balPts.length - 1].cum;

    const roi = S.byFirma(fin).sort((a, b) => b.balance - a.balance);
    const fcol = (f) => colorsOf('finanse', 'firma')[f] || 'default';
    const roiRows = roi.map((r) => `<tr><td><span class="firm-cell">${logoHtml(r.firma, 20)}${badge(r.firma, fcol(r.firma))}</span></td><td class="r hide-sm">${moneyFmt(r.spend)}</td><td class="r hide-sm">${moneyFmt(r.payout)}</td><td class="r ${cls(r.balance)}">${fmtMoney(r.balance)}</td><td class="r ${cls(r.roi)}">${r.roi == null ? DASH : (r.roi > 0 ? '+' : r.roi < 0 ? '−' : '') + num(Math.abs(r.roi), 0) + '%'}</td></tr>`).join('');

    // lista wpisów finansowych z okresu
    const rows = inRange(fin, range).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
    const kc = colorsOf('finanse', 'kind');
    const finRows = rows.map((f) => `<tr class="trow" data-act="wpis-open" data-id="${esc(f.id)}"><td class="nw">${esc(F.shortDate(f.date))}</td><td><button type="button" class="row-btn" data-act="wpis-open" data-id="${esc(f.id)}" title="${L('Edytuj wpis')}">${badge(f.kind ? tr(f.kind) : DASH, kc[f.kind])}</button></td><td><span class="firm-cell">${logoHtml(f.firma, 18)}${esc(f.firma === 'Inna' ? tr('Inna') : f.firma)}</span></td><td class="hide-sm st">${f.konto ? esc(kontoName(f.konto)) : DASH}</td><td class="r ${f.payout ? 'pos' : 'neg'}">${f.payout ? '+' : '−'}${moneyFmt(f.amount)}</td></tr>`).join('');
    const finTable = rows.length
      ? `<div class="tbl-wrap"><table><thead><tr><th>${L('Data')}</th><th>${L('Rodzaj')}</th><th>${L('Firma')}</th><th class="hide-sm">${L('Konto')}</th><th class="r">${L('Kwota')}</th></tr></thead><tbody>${finRows}</tbody></table></div>`
      : `<div class="empty mini"><p>${esc(tr('W okresie {range} nie ma wpisów finansowych.', { range: range.label }))}</p></div>`;
    const noFin = `<div class="empty mini"><p>${L('Brak wpisów w bazie Wydatki i payouty.')}</p></div>`;

    return `<header class="page-head"><div><h1>${L('Prop firmy')}</h1><p class="page-sub">${esc(tr.p('{n} kont', konta.length))} · ${esc(tr('okres {range}', { range: range.label }))} · ${L('nie zależy od przełącznika Live / Backtest / Paper')}</p></div>${plusBtn()}</header>
      <section class="sec" aria-label="${L('Konta i ROI')}"><div class="gr row-p">
        <div class="card"><div class="card-h"><h3>${L('Konta')}</h3><label class="check"><input type="checkbox" data-act="all-accounts" ${state.allAccounts ? 'checked' : ''}> ${L('Pokaż wszystkie')}</label></div>${accTable}</div>
        <div class="card"><div class="card-h"><h3>${L('ROI per firma')} <span class="sub">${L('od początku')}</span></h3></div>${roi.length ? `<div class="tbl-wrap"><table><thead><tr><th>${L('Firma')}</th><th class="r hide-sm">${L('Wydane')}</th><th class="r hide-sm">${L('Wypłacone')}</th><th class="r">${L('Bilans')}</th><th class="r">ROI</th></tr></thead><tbody>${roiRows}</tbody></table></div>` : `<div class="empty mini"><p>${L('Brak danych.')}</p></div>`}</div>
      </div></section>
      <section class="sec" aria-label="${L('Wykresy prop')}"><div class="gr row-p">
        <div class="card"><div class="card-h"><h3>${L('Wydatki a payouty')} <span class="sub">${L('miesięcznie')}</span></h3><div class="legend"><span><i style="background:var(--loss)"></i>${L('Wydatki')}</span><span><i style="background:var(--profit)"></i>${L('Payouty')}</span></div></div>${fin.length ? '<div class="chart" id="bars"></div>' : noFin}</div>
        <div class="card"><div class="card-h"><h3>${L('Bilans narastająco')} <span class="sub">${esc(tr('wypłacone − wydane · {sum} od początku', { sum: fmtMoney(balEnd) }))}</span></h3></div>${fin.length ? '<div class="chart" id="bal"></div>' : noFin}</div>
      </div></section>
      <section class="sec" aria-label="${L('Wpisy finansowe')}"><div class="card"><div class="card-h"><h3>${L('Wpisy finansowe')} <span class="sub">${esc(range.label)} · ${L('klik edytuje wpis')}</span></h3></div>${finTable}</div></section>`;
  }

  // Pasek saldo / rozmiar: środek toru to rozmiar startowy, pełny tor to ±10% rozmiaru (ta sama skala dla każdego konta).
  function accBar(k) {
    if (!k.active || !k.size || k.saldo == null) return { bar: '', pct: '' };
    const diff = k.saldo - k.size;
    const f = Math.max(-1, Math.min(1, diff / (k.size * 0.1)));
    const w = Math.abs(f) * 50;
    const pct = (diff / k.size) * 100;
    const pctTxt = `${pct > 0.005 ? '+' : pct < -0.005 ? '−' : ''}${num(Math.abs(pct), 1)}%`;
    const label = tr('Saldo {saldo} przy rozmiarze {size} ({pct}). Pełny tor to ±10% rozmiaru.', { saldo: moneyFmt(k.saldo), size: moneyFmt(k.size), pct: pctTxt });
    return {
      bar: `<span class="sbar" role="img" aria-label="${esc(label)}" title="${esc(label)}"><span class="mid"></span><i class="${f >= 0 ? 'pos' : 'neg'}" style="left:${(f >= 0 ? 50 : 50 - w).toFixed(2)}%;width:${w.toFixed(2)}%"></i></span>`,
      pct: `<span class="sub ${cls(diff)}">${esc(tr('{pct} vs rozmiar', { pct: pctTxt }))}</span>`,
    };
  }

  function draw() {
    const fy = (v) => (v >= 1000 ? `${num(v / 1000, 1)}k` : num(v, 0));
    const b = document.querySelector('#bars'); if (b) drawBars(b, barsData, { fmtY: fy, classA: 'bar-spend', classB: 'bar-pay', label: tr('Miesięczne wydatki i payouty') });
    const l = document.querySelector('#bal'); if (l) drawEquity(l, balPts, { id: 'balfill', fmtY: (v) => F.compactVal(v, '$').replace(/^\+/, ''), label: tr('Bilans prop narastająco: wypłacone minus wydane') });
  }

  // lista aktywnych kont w prawym panelu (z logo)
  function activeList() {
    const act = model().konta.filter((k) => k.active).slice(0, 6);
    if (!act.length) return '';
    return `<ul class="mini-list acc-list">${act.map((k) => `<li><button type="button" class="t" data-act="konto-open" data-id="${esc(k.id)}" title="${esc(tr('{name}: pokaż szczegóły', { name: k.name }))}"><span class="firm-cell">${logoHtml(k.firma, 18)}${esc(k.name)}</span></button><span class="s">${k.status ? L(k.status) : ''}</span><span class="r">${k.saldo != null ? moneyFmt(k.saldo) : DASH}</span></li>`).join('')}</ul>`;
  }

  function handle(act, v, el) {
    switch (act) {
      case 'prop-plus': openMenu(el); return true;
      case 'prop-new-konto': openKontoForm(null, el); return true;
      case 'konto-open': openKontoDetails(el.dataset.id, { opener: el.closest('.trow')?.querySelector('.row-btn') || el }); return true;
      case 'konto-saldo': openKontoDetails(el.dataset.id, { opener: el, focusSaldo: true }); return true;
      case 'wpis-open': { const f = model().finanse.find((x) => x.id === el.dataset.id); if (f) openFinanseForm(f, {}, el.closest('.trow')?.querySelector('.row-btn') || el); return true; }
      default: return false;
    }
  }

  return { viewHtml, draw, handle, activeList, plusBtn, logoHtml, openKontoForm, openFinanseForm, closeMenu };
}
