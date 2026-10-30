// Kreator sesji backtestu (1.5.0, pakiet C1): formularz klasyczny (§12); F2: zwinięta sekcja „Filtr dni (zaawansowane)” (bt-filtr-widok.js) z licznikiem na żywo i szablonami.
// Pola: nazwa, instrumenty, zakres dat, saldo startowe, ryzyko (USD albo % salda), godzina startu NY (domyślnie 09:00), kolejność dni, konto z Notion (opcjonalnie).
// Pula = matchDays (dni z danymi: 1s NQ, 1m ES) + orderDays; sesja zapisuje się od razu (rev 0) i otwiera replay.
// English: classic session form: builds the day pool from the coverage index and creates the session file.
import { t } from './i18n.js';
import { esc } from './format.js';
import { matchDays, orderDays } from './bt-filtr.js';
import { newSessionId } from './bt-klient.js';
import { emptyBook } from './bt-wypelnienia.js';
import { sanitizeBt } from './bt-czas.js';
import { mountFilterEditor } from './bt-filtr-widok.js';

export const INSTRUMENTS = ['NQ', 'ES', 'MNQ', 'MES'];
export const ORDERS = ['chrono', 'newest', 'random'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

// Walidacja i definicja sesji z wartości formularza; błędy jako { pole: komunikat }.
export function readDef(v) {
  const err = {};
  const name = String(v.name || '').trim().slice(0, 80);
  if (!name) err.name = t('Podaj nazwę sesji.');
  const instruments = INSTRUMENTS.filter((i) => (v.instruments || []).includes(i));
  if (!instruments.length) err.instruments = t('Wybierz co najmniej jeden instrument.');
  if (!DAY_RE.test(v.from || '') || !DAY_RE.test(v.to || '') || v.from > v.to) err.dates = t('Podaj poprawny zakres dat (od nie później niż do).');
  const balance = Number(v.balance);
  if (!(balance > 0)) err.balance = t('Saldo startowe musi być większe od zera.');
  const mode = v.riskMode === 'pct' ? 'pct' : 'usd', value = Number(v.risk);
  if (!(value > 0) || (mode === 'pct' && value > 100)) err.risk = mode === 'pct' ? t('Ryzyko w % salda: od 0 do 100.') : t('Ryzyko musi być większe od zera.');
  const startTime = String(v.startTime || '09:00');
  // godzina startu leży w sesji dnia (otwarcie poprzedniego wieczoru, koniec 16:00 NY)
  if (!TIME_RE.test(startTime) || startTime >= '16:00') err.startTime = t('Godzina startu: od 00:00 do 15:59 NY.');
  const order = ORDERS.includes(v.order) ? v.order : 'chrono';
  const def = { instruments, from: v.from, to: v.to, balance, risk: { mode, value }, startTime, order, seed: Number(v.seed) >>> 0, accountId: v.accountId || null, filter: null, excluded: [] };
  return { name, def, err };
}

export function newSessionDoc({ id, name, def, pool, now }) {
  const at = new Date(now).toISOString();
  return {
    v: 1, id, rev: 0, name, created: at, updated: at, def, pool, dayIdx: 0, cursor: null, hw: null,
    layout: { kind: '1', charts: [{ instrument: def.instruments[0], tf: '1m' }], active: 0 },
    days: {}, book: emptyBook(), trades: [], drawings: {},
  };
}

// openKreator(host, { client, accounts: [{ id, name }], onCreated(doc), onCancel() }) → { destroy() }
export function openKreator(host, { client, defaults = null, getDefaults = null, onTemplates = () => {}, accounts = [], onCreated = () => {}, onCancel = () => {}, now = () => Date.now(), seed = () => (Math.random() * 2 ** 32) >>> 0 } = {}) {
  const dflt = sanitizeBt(defaults); // domyślne ryzyko i godzina startu z Ustawień → Backtest (C2)
  const to = iso(now() - 86400000), from = iso(now() - 366 * 86400000);
  const seg = (k, opts, cur) => `<div class="seg sm" role="group" data-k="${k}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === cur}">${esc(l)}</button>`).join('')}</div>`;
  host.innerHTML = `
    <form class="card bt-form" novalidate>
      <div class="card-h"><h3>${esc(t('Nowa sesja'))}</h3></div>
      <div class="bt-fgrid">
        <label class="bt-f"><span class="lbl">${esc(t('Nazwa'))}</span><input class="sp-in" name="name" maxlength="80" autocomplete="off" placeholder="${esc(t('np. NQ otwarcie 2024'))}"></label>
        <fieldset class="bt-f" data-k="instruments"><legend class="lbl">${esc(t('Instrumenty'))}</legend><div class="bt-chk">${INSTRUMENTS.map((i) => `<label class="check"><input type="checkbox" name="inst" value="${i}" ${i === 'NQ' ? 'checked' : ''}> ${i}</label>`).join('')}</div></fieldset>
        <div class="bt-f bt-f-wide" data-k="dates"><span class="lbl">${esc(t('Zakres dat'))}</span><div class="bt-row"><input class="sp-in" type="date" name="from" value="${from}" aria-label="${esc(t('Od'))}"><span>–</span><input class="sp-in" type="date" name="to" value="${to}" aria-label="${esc(t('Do'))}"></div></div>
        <label class="bt-f"><span class="lbl">${esc(t('Saldo startowe (USD)'))}</span><input class="sp-in" type="number" name="balance" min="1" step="1" value="50000"></label>
        <div class="bt-f" data-k="risk"><span class="lbl">${esc(t('Ryzyko na trade'))}</span><div class="bt-row">${seg('riskMode', [['usd', 'USD'], ['pct', t('% salda')]], dflt.risk.mode)}<input class="sp-in" type="number" name="risk" min="0" step="any" value="${dflt.risk.value}" aria-label="${esc(t('Wartość ryzyka'))}"></div></div>
        <label class="bt-f"><span class="lbl">${esc(t('Godzina startu (NY)'))}</span><input class="sp-in" type="time" name="startTime" value="${dflt.startTime}"></label>
        <div class="bt-f bt-f-wide"><span class="lbl">${esc(t('Kolejność dni'))}</span>${seg('order', [['chrono', t('Chronologicznie')], ['newest', t('Od najnowszych')], ['random', t('Losowo, z ukrytą datą')]], 'chrono')}</div>
        <label class="bt-f"><span class="lbl">${esc(t('Konto z Notion (opcjonalnie)'))}</span><select class="sp-in sp-sel" name="account"><option value="">${esc(t('Bez konta'))}</option>${accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label>
      </div>
      <details class="bt-adv"><summary aria-expanded="false">${esc(t('Filtr dni (zaawansowane)'))}<span class="bt-fbadge note" hidden></span></summary><div class="bt-advb"></div></details>
      <p class="note bt-err" role="alert"></p>
      <div class="bt-factions"><button type="button" class="btn ghost" data-bt="cancel">${esc(t('Anuluj'))}</button><button type="submit" class="btn primary" data-bt="create">${esc(t('Utwórz sesję'))}</button></div>
    </form>`;
  const form = host.querySelector('form');
  const segVal = (k) => form.querySelector(`[data-k="${k}"] [aria-pressed="true"]`)?.dataset.v;
  form.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const g = b.closest('.seg[data-k]');
    if (g) { g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); return; }
    if (b.dataset.bt === 'cancel') onCancel();
  });
  // ---- filtr zaawansowany (F2): edytor budowany przy pierwszym rozwinięciu; indeks dni pobierany raz na zakres dat i instrumenty ----
  const adv = form.querySelector('details.bt-adv'), advSum = adv.querySelector('summary'), badge = advSum.querySelector('.bt-fbadge');
  const createBtn = form.querySelector('[data-bt="create"]');
  let editor = null, ctxKey = '', loadSeq = 0, loadTimer = 0, tpls = dflt.templates;
  const fieldsCtx = () => {
    const f = new FormData(form);
    // [U] 30.10.2026 «Gap od ceny startu»: cechy rynku w filtrze liczone do godziny startu sesji, więc indeks dni zależy też od niej
    return { instruments: INSTRUMENTS.filter((i) => f.getAll('inst').includes(i)), from: String(f.get('from') || ''), to: String(f.get('to') || ''), start: String(f.get('startTime') || '09:00') };
  };
  const onEditor = (filter, info) => {
    badge.hidden = !info.active; badge.textContent = info.active ? ` · ${t('aktywny')}` : '';
    // zero pasujących dni przy gotowym indeksie: Utwórz wyłączone (notka w edytorze mówi dlaczego)
    createBtn.disabled = !!(editor && info.ready && info.count === 0 && (adv.open || info.active));
  };
  async function loadIndex(force = false) {
    if (!editor) return;
    const c = fieldsCtx();
    editor.setContext(c);
    const key = JSON.stringify(c);
    if (!force && key === ctxKey) return;
    if (!c.instruments.length || !DAY_RE.test(c.from) || !DAY_RE.test(c.to) || c.from > c.to) return; // zły zakres: błąd pokaże walidacja przy zapisie
    ctxKey = key;
    const my = ++loadSeq;
    editor.setLoading(true);
    try {
      const idx = await client.days(c);
      if (my === loadSeq && editor) editor.setDays(idx.days || []);
    } catch (e) {
      if (my === loadSeq && editor) { ctxKey = ''; editor.setError(t('Nie udało się wczytać indeksu dni: {msg}', { msg: e?.message || '' })); }
    }
  }
  adv.addEventListener('toggle', () => {
    advSum.setAttribute('aria-expanded', String(adv.open));
    if (!adv.open) { onEditor(editor?.value() ?? null, editor?.info() ?? { active: false, ready: false, count: 0 }); return; }
    if (!editor) editor = mountFilterEditor(adv.querySelector('.bt-advb'), { ...fieldsCtx(), days: [], templates: tpls, getTemplates: () => (getDefaults ? sanitizeBt(getDefaults()).templates : tpls), onChange: onEditor, onTemplates: (list) => { tpls = list; onTemplates(list); } });
    loadIndex();
  });
  form.addEventListener('change', (ev) => {
    if (!editor) return;
    // review G #8: przy zwiniętej sekcji z aktywnym filtrem zmiana pól też przelicza pulę (inaczej Utwórz zostaje wyłączone z poprzedniego zakresu)
    if (!adv.open && !editor.info().active) return;
    const n = ev.target.name;
    if (n === 'inst') loadIndex();
    else if (n === 'from' || n === 'to' || n === 'startTime') { clearTimeout(loadTimer); loadTimer = setTimeout(loadIndex, 60); }
  });
  let busy = false;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (busy) return;
    const f = new FormData(form);
    const { name, def, err } = readDef({
      name: f.get('name'), instruments: f.getAll('inst'), from: f.get('from'), to: f.get('to'), balance: f.get('balance'),
      riskMode: segVal('riskMode'), risk: f.get('risk'), startTime: f.get('startTime'), order: segVal('order'), seed: seed(), accountId: f.get('account'),
    });
    // filtr z edytora (jeśli był otwarty i ma warunki albo ręcznie wyrzucone dni); bez rozwijania sekcji filter zostaje null
    if (editor) { def.filter = editor.value(); def.excluded = editor.excludedDays(); }
    form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
    const out = form.querySelector('.bt-err');
    if (Object.keys(err).length) {
      for (const k of Object.keys(err)) (form.querySelector(`[name="${k}"]`) || form.querySelector(`[data-k="${k}"]`))?.setAttribute('aria-invalid', 'true');
      out.textContent = Object.values(err).join(' ');
      return;
    }
    busy = true; out.textContent = t('Liczę pulę dni…');
    try {
      const idx = await client.days({ instruments: def.instruments, from: def.from, to: def.to, start: def.startTime });
      const m = matchDays(def, idx.days || []);
      const pool = orderDays(m.days, def.order, def.seed);
      if (!pool.length) {
        // F1/F2: powód 'filter' (dzień nie spełnia filtra) nie jest brakiem danych, więc nie wchodzi do liczby wykluczonych
        const noData = m.counts.no1s + m.counts.no1m;
        out.textContent = m.counts.filter > 0 || m.counts.manual > 0
          ? t('Żaden dzień z zakresu nie spełnia filtra (wykluczone z braku danych: {n}). Zmień warunki albo zakres dat.', { n: noData })
          : t('W tym zakresie nie ma dni z danymi dla wybranych instrumentów (wykluczone: {n}). Zmień zakres albo pobierz świece.', { n: m.excluded.length });
        return;
      }
      const doc = newSessionDoc({ id: newSessionId(), name, def, pool, now: now() });
      await client.create(doc);
      out.textContent = '';
      onCreated(doc);
    } catch (e) {
      out.textContent = t('Nie udało się utworzyć sesji: {msg}', { msg: e?.message || '' });
    } finally { busy = false; }
  });
  return { destroy() { clearTimeout(loadTimer); editor?.destroy(); editor = null; host.innerHTML = ''; }, form, filterEditor: () => editor };
}
