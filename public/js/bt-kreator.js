// Kreator sesji backtestu (1.5.0, pakiet C1): formularz klasyczny (§12); F2: zwinięta sekcja „Filtr dni (zaawansowane)” (bt-filtr-widok.js) z licznikiem na żywo i szablonami.
// K (31.10.2026): sesja ma datę startu i ciągły czas do końca danych ([U] «Do końca danych»), bez pola „do”, kolejności dni i ukrytej daty ([U] «Filtr jako skok»).
// Pola: nazwa, instrumenty, data startu, saldo startowe, ryzyko (USD albo % salda), L: podstawa ryzyka % (bieżące / startowe saldo) i prowizja $ za kontrakt,
// godzina startu NY (domyślnie 09:00), konto z Notion (opcjonalnie).
// Filtr dni służy skokowi „Następny dzień z filtra”: licznik liczy dni od daty startu do ostatniego dnia danych. Sesja zapisuje się od razu (rev 0) i otwiera replay.
// English: classic session form: start date + continuous time to the end of data; the day filter drives the "next filter day" jump.
import { t } from './i18n.js';
import { esc, shortDate } from './format.js';
import { newSessionId } from './bt-klient.js';
import { emptyBook } from './bt-wypelnienia.js';
import { sanitizeBt, nyAt, BT_PRESETS } from './bt-czas.js';
import { SESSION_V, nyDayOf } from './bt-sesja.js';
import { mountFilterEditor } from './bt-filtr-widok.js';
import { setDayRule, refreshDayRule } from './wybor-daty.js';
import { addDays, weekdayMon } from './wybor-daty-logika.js';
import { FAMILY } from './kontrakty.js';

export const INSTRUMENTS = ['NQ', 'ES', 'MNQ', 'MES'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const fmtDay = (d) => `${shortDate(d)} ${d.slice(0, 4)}`;
// M (31.10.2026): domyślna data startu = rok temu, ale w zakresie danych (kopia świec kończy się np. w 2024: wtedy rok przed końcem danych, nie przed pierwszym dniem)
// bounds = { first, last } w sekundach epoki (GET /api/backtest/bounds) albo null
export function defaultStart(bounds, nowMs) {
  let d = iso(nowMs - 366 * 86400000);
  const last = Number(bounds?.last), first = Number(bounds?.first);
  if (Number.isFinite(last)) { const lastDay = nyDayOf(last - 1); if (d > lastDay) d = iso(Date.parse(`${lastDay}T12:00:00Z`) - 366 * 86400000); }
  if (Number.isFinite(first)) { const firstDay = nyDayOf(first); if (d < firstDay) d = firstDay; }
  return d;
}

// Walidacja i definicja sesji z wartości formularza; błędy jako { pole: komunikat }.
export function readDef(v) {
  const err = {};
  const name = String(v.name || '').trim().slice(0, 80);
  if (!name) err.name = t('Podaj nazwę sesji.');
  const instruments = INSTRUMENTS.filter((i) => (v.instruments || []).includes(i));
  if (!instruments.length) err.instruments = t('Wybierz co najmniej jeden instrument.');
  if (!DAY_RE.test(v.from || '')) err.dates = t('Podaj datę startu.');
  const balance = Number(v.balance);
  if (!(balance > 0)) err.balance = t('Saldo startowe musi być większe od zera.');
  const mode = v.riskMode === 'pct' ? 'pct' : 'usd', value = Number(v.risk);
  if (!(value > 0) || (mode === 'pct' && value > 100)) err.risk = mode === 'pct' ? t('Ryzyko w % salda: od 0 do 100.') : t('Ryzyko musi być większe od zera.');
  // [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 1: prowizja $ za kontrakt opcjonalna, domyślnie 0, bez spreadu i poślizgu)
  const commission = v.commission === undefined || String(v.commission).trim() === '' ? 0 : Number(v.commission);
  if (!(commission >= 0) || commission > 1000) err.commission = t('Prowizja: od 0 do 1000 USD za kontrakt.');
  // [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 2: ryzyko % od bieżącego salda, wybór bieżące / startowe)
  const riskBase = v.riskBase === 'start' ? 'start' : 'current';
  const startTime = String(v.startTime || '09:00');
  // godzina startu leży w sesji dnia (otwarcie poprzedniego wieczoru, koniec 16:00 NY)
  if (!TIME_RE.test(startTime) || startTime >= '16:00') err.startTime = t('Godzina startu: od 00:00 do 15:59 NY.');
  const def = { instruments, from: v.from, balance, risk: { mode, value }, riskBase, commission: commission >= 0 ? commission : 0, startTime, accountId: v.accountId || null, filter: null, excluded: [] };
  return { name, def, err };
}

export function newSessionDoc({ id, name, def, now }) {
  const at = new Date(now).toISOString();
  return {
    v: SESSION_V, id, rev: 0, name, created: at, updated: at, def, cursor: null, hw: null,
    layout: { kind: '1', charts: [{ instrument: def.instruments[0], tf: '1m' }], active: 0 },
    book: emptyBook(), trades: [], drawings: {},
  };
}

// openKreator(host, { client, accounts: [{ id, name }], onCreated(doc), onCancel() }) → { destroy() }
export function openKreator(host, { client, defaults = null, getDefaults = null, onTemplates = () => {}, accounts = [], onCreated = () => {}, onCancel = () => {}, now = () => Date.now() } = {}) {
  const dflt = sanitizeBt(defaults); // domyślne ryzyko i godzina startu z Ustawień → Backtest (C2)
  const from = iso(now() - 366 * 86400000);
  // K: koniec danych dla wybranych instrumentów (licznik filtra i sprawdzenie, że po dacie startu są świece); bez pamięci: świece mogą dojść w trakcie
  const dataEnd = async (ins) => { try { return (await client.bounds(ins))?.last ?? null; } catch { return null; } };
  const seg = (k, opts, cur) => `<div class="seg sm" role="group" data-k="${k}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === cur}">${esc(l)}</button>`).join('')}</div>`;
  host.innerHTML = `
    <form class="card bt-form" novalidate>
      <div class="card-h"><h3>${esc(t('Nowa sesja'))}</h3></div>
      <div class="bt-fgrid">
        <label class="bt-f"><span class="lbl">${esc(t('Nazwa'))}</span><input class="sp-in" name="name" maxlength="80" autocomplete="off" placeholder="${esc(t('np. NQ otwarcie 2024'))}"></label>
        <fieldset class="bt-f" data-k="instruments"><legend class="lbl">${esc(t('Instrumenty'))}</legend><div class="bt-chk">${INSTRUMENTS.map((i) => `<label class="check"><input type="checkbox" name="inst" value="${i}" ${i === 'NQ' ? 'checked' : ''}> ${i}</label>`).join('')}</div></fieldset>
        <label class="bt-f" data-k="dates"><span class="lbl">${esc(t('Data startu'))}</span><input class="sp-in" type="text" data-wd="date" name="from" value="${from}" aria-describedby="bt-fdata" data-wd-poza="${esc(t('Poza zakresem danych'))}"><span class="note bt-fsub" id="bt-fdata" role="status"></span></label>
        <label class="bt-f"><span class="lbl">${esc(t('Saldo startowe (USD)'))}</span><input class="sp-in" type="number" name="balance" min="1" step="1" value="50000"></label>
        <div class="bt-f" data-k="risk"><span class="lbl">${esc(t('Ryzyko na trade'))}</span><div class="bt-row">${seg('riskMode', [['usd', 'USD'], ['pct', t('% salda')]], dflt.risk.mode)}<input class="sp-in" type="number" name="risk" min="0" step="any" value="${dflt.risk.value}" aria-label="${esc(t('Wartość ryzyka'))}"></div></div>
        <div class="bt-f" data-k="riskBase" ${dflt.risk.mode === 'pct' ? '' : 'hidden'}><span class="lbl">${esc(t('Ryzyko % liczone od'))}</span>${seg('riskBase', [['current', t('bieżącego salda')], ['start', t('salda startowego')]], 'current')}</div>
        <label class="bt-f"><span class="lbl">${esc(t('Prowizja za kontrakt (USD)'))}</span><input class="sp-in" type="number" name="commission" min="0" step="0.01" value="0" aria-describedby="bt-fcom"><span class="note bt-fsub" id="bt-fcom">${esc(t('W obie strony, odejmowana od wyniku. 0 = bez prowizji.'))}</span></label>
        <label class="bt-f"><span class="lbl">${esc(t('Godzina startu (NY)'))}</span><input class="sp-in" type="text" data-wd="time" data-wd-tz="NY" data-wd-presety="${BT_PRESETS}" name="startTime" value="${dflt.startTime}"></label>
        <label class="bt-f"><span class="lbl">${esc(t('Konto z Notion (opcjonalnie)'))}</span><select class="sp-in sp-sel" name="account"><option value="">${esc(t('Bez konta'))}</option>${accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label>
      </div>
      <p class="note bt-fhint">${esc(t('Replay płynie od daty startu do końca danych, bez końca dnia. Filtr dni wyznacza skok „Następny dzień z filtra”.'))}</p>
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
    if (g) {
      g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      // M: podstawa ryzyka ma sens tylko przy ryzyku w % salda
      if (g.dataset.k === 'riskMode') form.querySelector('[data-k="riskBase"]').hidden = b.dataset.v !== 'pct';
      return;
    }
    if (b.dataset.bt === 'cancel') onCancel();
  });
  // ---- filtr zaawansowany (F2): edytor budowany przy pierwszym rozwinięciu; indeks dni pobierany raz na zakres dat i instrumenty ----
  const adv = form.querySelector('details.bt-adv'), advSum = adv.querySelector('summary'), badge = advSum.querySelector('.bt-fbadge');
  const createBtn = form.querySelector('[data-bt="create"]');
  let editor = null, ctxKey = '', loadSeq = 0, loadTimer = 0, tpls = dflt.templates;
  const fieldsCtx = async () => {
    const f = new FormData(form);
    const instruments = INSTRUMENTS.filter((i) => f.getAll('inst').includes(i));
    const end = instruments.length ? await dataEnd(instruments) : null;
    // [U] 30.10.2026 «Gap od ceny startu»: cechy rynku w filtrze liczone do godziny startu sesji, więc indeks dni zależy też od niej
    // K: dni filtra od daty startu do ostatniego dnia danych ([U] 31.10.2026 «Do końca danych»)
    return { instruments, from: String(f.get('from') || ''), to: Number.isFinite(end) ? nyDayOf(end - 1) : '', start: String(f.get('startTime') || '09:00') };
  };
  const onEditor = (filter, info) => {
    badge.hidden = !info.active; badge.textContent = info.active ? ` · ${t('aktywny')}` : '';
    // zero pasujących dni przy gotowym indeksie: Utwórz wyłączone (notka w edytorze mówi dlaczego)
    createBtn.disabled = !!(editor && info.ready && info.count === 0 && (adv.open || info.active));
  };
  async function loadIndex(force = false) {
    if (!editor) return;
    const c = await fieldsCtx();
    if (!editor) return;
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
    if (!editor) editor = mountFilterEditor(adv.querySelector('.bt-advb'), { instruments: ['NQ'], from: '', to: '', days: [], templates: tpls, getTemplates: () => (getDefaults ? sanitizeBt(getDefaults()).templates : tpls), onChange: onEditor, onTemplates: (list) => { tpls = list; onTemplates(list); } });
    loadIndex();
  });
  form.addEventListener('change', (ev) => {
    if (!editor) return;
    // review G #8: przy zwiniętej sekcji z aktywnym filtrem zmiana pól też przelicza pulę (inaczej Utwórz zostaje wyłączone z poprzedniego zakresu)
    if (!adv.open && !editor.info().active) return;
    const n = ev.target.name;
    if (n === 'inst') loadIndex();
    else if (n === 'from' || n === 'startTime') { clearTimeout(loadTimer); loadTimer = setTimeout(loadIndex, 60); }
  });
  // M: zakres danych wybranych instrumentów pod datą startu, a domyślna data (dopóki użytkownik jej nie zmienił) w tym zakresie
  let fromTouched = false, dataSeq = 0;
  const fromIn = form.querySelector('[name="from"]'), dataNote = form.querySelector('#bt-fdata');
  fromIn.addEventListener('input', () => { fromTouched = true; });
  async function showData() {
    const ins = INSTRUMENTS.filter((i) => new FormData(form).getAll('inst').includes(i));
    const my = ++dataSeq;
    if (!ins.length) { dataNote.textContent = ''; return; }
    let b = null;
    try { b = await client.bounds(ins); } catch { b = null; }
    if (my !== dataSeq || !form.isConnected) return;
    // N1 (1.6.0): brak świec z głębokim linkiem do Ustawień → Źródła danych → Databento
    if (!Number.isFinite(b?.first) || !Number.isFinite(b?.last)) { dataNote.innerHTML = `${esc(t('Brak świec dla wybranych instrumentów.'))} <a href="#ustawienia/zrodla/databento">${esc(t('Połącz Databento'))}</a>`; return; }
    const a = nyDayOf(b.first), z = nyDayOf(b.last - 1);
    fromIn.min = a; fromIn.max = z;
    dataNote.textContent = t('Dane: {a} – {z}', { a: fmtDay(a), z: fmtDay(z) });
    if (!fromTouched) fromIn.value = defaultStart(b, now());
  }
  // wybor-daty (1.6.1): w kalendarzu daty startu przekreślone dni bez świec wybranych instrumentów (z powodem w podpowiedzi), poza zakresem danych też
  setDayRule(fromIn, async (a, z) => {
    const ins = INSTRUMENTS.filter((i) => new FormData(form).getAll('inst').includes(i));
    if (!ins.length) return new Map();
    const idx = await client.days({ instruments: ins, from: a, to: z, mkt: false });
    const fams = [...new Set(ins.map((i) => FAMILY[i]))];
    const ok = new Set((idx.days || []).filter((f) => fams.some((x) => f.has1m?.[x] === true)).map((f) => f.day));
    const out = new Map();
    for (let d = a; d <= z; d = addDays(d, 1)) if (!ok.has(d)) out.set(d, weekdayMon(d) >= 5 ? t('Weekend: giełda zamknięta') : t('Brak świec w tym dniu'));
    return out;
  });
  form.addEventListener('change', (ev) => { if (ev.target.name === 'inst') { refreshDayRule(fromIn); showData(); } });
  showData();
  let busy = false;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (busy) return;
    const f = new FormData(form);
    const { name, def, err } = readDef({
      name: f.get('name'), instruments: f.getAll('inst'), from: f.get('from'), balance: f.get('balance'),
      riskMode: segVal('riskMode'), risk: f.get('risk'), riskBase: segVal('riskBase'), commission: f.get('commission'), startTime: f.get('startTime'), accountId: f.get('account'),
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
    busy = true; out.textContent = t('Sprawdzam dane…');
    try {
      // K: po dacie startu muszą być świece (koniec danych z granic); filtr dni nie jest warunkiem utworzenia (to cel skoku), ale pusty filtr przy gotowym indeksie wyłącza Utwórz
      const end = await dataEnd(def.instruments);
      if (!Number.isFinite(end) || end <= nyAt(def.from, def.startTime)) {
        out.textContent = t('Po dacie startu nie ma świec dla wybranych instrumentów. Zmień datę albo pobierz świece.');
        return;
      }
      const doc = newSessionDoc({ id: newSessionId(), name, def, now: now() });
      await client.create(doc);
      out.textContent = '';
      onCreated(doc);
    } catch (e) {
      out.textContent = t('Nie udało się utworzyć sesji: {msg}', { msg: e?.message || '' });
    } finally { busy = false; }
  });
  return { destroy() { clearTimeout(loadTimer); editor?.destroy(); editor = null; host.innerHTML = ''; }, form, filterEditor: () => editor };
}
