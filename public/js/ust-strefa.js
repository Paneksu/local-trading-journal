// Ustawienia → Kopie i diagnostyka → „Strefa starych wpisów” (1.7.0, odbiór): poprawa strefy dat wejścia i wyjścia trade'ów w Notion.
// Kolejność: Podgląd (tylko odczyt: ile wpisów, przykład „2026-11-02 15:35 → 2026-11-02 15:35 America/New_York”, co zostaje bez zmian) → wpisanie „TAK” (jak przy
// przywracaniu kopii) i „Popraw” → kopia zapasowa baz → zmiana. Serwer: lib/strefa-notion.mjs (POST /api/tz-fix/preview, POST /api/tz-fix/apply, GET /api/tz-fix).
// Przeglądarka niczego nie zapisuje do Notion sama. Cel jest zawsze America/New_York, niezależnie od strefy w Ustawieniach.
// [U] 3.11.2026 «Popraw strefę na NY (Recommended)» (ta sama godzina na zegarze, oznaczona jako NY; przed zmianą kopia zapasowa bazy)
// [U] 3.11.2026 «Przelicz na NY, ten sam moment (Recommended)» (wpisy DEMO: osobna grupa z liczbą)
// [U] 2026-11-03 «Odznaczanie w podglądzie (Recommended)» (lista wpisów z wyborem na wpis: ta sama godzina NY / ten sam moment / pomiń)
// Decyzja sesji głównej 3.11.2026: zgodę wpisuje człowiek („TAK”), przycisk nie wysyła jej sam.
import { t } from './i18n.js';
import { esc, L, gHead, getJson, postJson } from './ust-wspolne.js';
import { appTz, DEFAULT_TZ } from './strefa.js';

export function createTzSec(ctx) {
  // st: ostatni stan zadania z GET /api/tz-fix; err: komunikat błędu; started: czy użytkownik uruchomił podgląd w tej wizycie (stary stan nie jest pokazywany)
  let st = null, err = '', timer = 0, seen = null, started = false;
  // wybór na wpis (tylko odstępstwa od domyślnego), sortowanie listy i znacznik podglądu, dla którego wybory obowiązują
  let choices = {}, sortDir = 'asc', choicesTok = null;
  const MODES = ['clock', 'moment', 'skip'];
  const modeLabel = (m) => (m === 'clock' ? t('ta sama godzina NY') : m === 'moment' ? t('ten sam moment') : t('pomiń'));

  async function load() {
    try { st = await getJson('/api/tz-fix'); } catch (e) { err = e.message; }
    if (st && !st.running && st.finishedAt && st.finishedAt !== seen) {
      seen = st.finishedAt;
      if (st.kind === 'apply' && !st.error) ctx.opts.onRestored?.();
    }
    if (ctx.isActive('diag')) ctx.rerender();
    clearTimeout(timer);
    if (st?.running && ctx.isActive('diag')) timer = setTimeout(load, 500);
  }
  async function start(url, body) {
    err = '';
    try { await postJson(url, body); } catch (e) { err = e.message; }
    await load();
  }

  function skippedHtml(r) {
    const s = r.skipped || {};
    const parts = [];
    if (s.same) parts.push(t('już w NY: {n}', { n: s.same }));
    if (s.noTime) parts.push(t('data bez godziny: {n}', { n: s.noTime }));
    if (s.other) parts.push(t('inne przesunięcie niż Warszawa i NY: {n}', { n: s.other }));
    if (s.noZone) parts.push(t('godzina bez przesunięcia i strefy: {n}', { n: s.noZone }));
    if (s.bad) parts.push(t('nieczytelna data: {n}', { n: s.bad }));
    return parts.length ? `<p class="note">${esc(t('Bez zmian: {list}.', { list: parts.join(', ') }))}</p>` : '';
  }
  const items = () => st?.result?.items || [];
  const effective = (it) => choices[it.id] || it.group;
  const countsHtml = () => {
    const c = { clock: 0, moment: 0, skip: 0 };
    for (const it of items()) c[effective(it)]++;
    return esc(t('Ta sama godzina NY: {a} · Ten sam moment: {b} · Pomiń: {c}', { a: c.clock, b: c.moment, c: c.skip }));
  };
  // godzina po poprawie; gdy „ten sam moment” zmienia dzień, z datą (MM-DD), żeby wybór nie był ślepy
  const afterTime = (v, was) => (v.slice(0, 10) === was.slice(0, 10) ? v.slice(-5) : `${v.slice(5, 10)} ${v.slice(-5)}`);
  const resultOf = (it) => { const m = effective(it); return m === 'skip' ? '–' : it.fields.map((f) => afterTime(m === 'moment' ? f.toMoment : f.to, f.was)).join(' · '); };
  function listHtml() {
    const rows = items().slice().sort((a, b) => (a.fields[0].was < b.fields[0].was ? -1 : a.fields[0].was > b.fields[0].was ? 1 : 0) * (sortDir === 'asc' ? 1 : -1));
    const opt = (it, m) => `<option value="${m}"${effective(it) === m ? ' selected' : ''}>${esc(modeLabel(m))}</option>`;
    const body = rows.map((it) => {
      const f0 = it.fields[0];
      const was = it.fields.map((f) => `${f.was.slice(-5)} ${f.offset}`).join(' · ');
      const name = [it.title || t('(bez nazwy)'), it.instrument].filter(Boolean).join(' · ');
      return `<tr data-tzr="${esc(it.id)}"><td class="nw">${esc(f0.was.slice(0, 10))}</td><td class="nw">${esc(was)}</td><td>${esc(name)}</td><td class="nw" data-tzo="${esc(it.id)}">${esc(resultOf(it))}</td><td><select class="sp-in sp-sel" data-tzc="${esc(it.id)}" aria-label="${esc(t('Wybór dla wpisu: {name}', { name }))}">${MODES.map((m) => opt(it, m)).join('')}</select></td></tr>`;
    }).join('');
    return `<div class="sv-tz-list" role="region" tabindex="0" aria-label="${esc(t('Lista wpisów do poprawy'))}"><table><thead><tr><th><button type="button" class="th-btn" data-act="tz-sort" data-fk="tz-sort" aria-label="${esc(t('Sortuj po dacie'))}">${L('Data')} ${sortDir === 'asc' ? '▲' : '▼'}</button></th><th>${L('Godzina z przesunięciem')}</th><th>${L('Wpis')}</th><th>${L('Po poprawie (NY)')}</th><th>${L('Wybór')}</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
  function previewHtml(r) {
    if (!r.pages) return `<div class="sv-confirm sv-tz-pv"><p><b>${L('Nie ma wpisów z godziną w czasie polskim. Nie ma czego poprawiać.')}</b></p>${skippedHtml(r)}</div>`;
    if (choicesTok !== st?.result?.token) { choicesTok = st?.result?.token; choices = {}; }
    const g = r.groups || {};
    const lines = [];
    if (g.clock?.pages) lines.push(t('Ta sama godzina na zegarze, strefa NY: {n} wpisów. Moment wpisu przesuwa się o różnicę stref.', { n: g.clock.pages }));
    if (g.moment?.pages) lines.push(t('Ten sam moment przeliczony na NY (wpisy DEMO): {n} wpisów. Godzina na zegarze się zmienia, moment nie.', { n: g.moment.pages }));
    const ex = r.example ? `<p>${esc(t('Przykład: {from} → {to} {zone}', { from: r.example.from, to: r.example.to, zone: r.example.zone }))}</p>` : '';
    const w = st?.result?.word || 'TAK';
    const zoneNote = appTz() !== DEFAULT_TZ ? `<p class="note sv-warn">${esc(t('Strefa w Ustawieniach to {tz}, ale poprawa ustawia zawsze America/New_York.', { tz: appTz() }))}</p>` : '';
    return `<div class="sv-confirm sv-tz-pv" role="group" aria-labelledby="sv-tz-pv-h"><p id="sv-tz-pv-h"><b>${esc(t.p('Poprawa zmieni strefę w {n} wpisach.', r.pages))}</b> ${esc(t('Pól dat do zmiany: {f}.', { f: r.fields }))}</p>
      <ul class="sv-bk-sum">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>${ex}${skippedHtml(r)}
      <p class="note sv-warn">${L('Wpisy, których godzinę przesuwałeś na wykresie, nie mają znacznika: wybierz dla nich „ten sam moment” albo „pomiń”. Domyślnie wpisy mają „ta sama godzina NY”, a wpisy DEMO „ten sam moment”.')}</p>${zoneNote}
      <p class="sv-tz-cnt" id="sv-tz-cnt" role="status">${countsHtml()}</p>
      <div class="upd-actions sv-tz-bulk"><span class="note">${L('Wszystkie wpisy:')}</span><button type="button" class="btn sm" data-act="tz-all" data-v="clock">${esc(modeLabel('clock'))}</button><button type="button" class="btn sm" data-act="tz-all" data-v="moment">${esc(modeLabel('moment'))}</button><button type="button" class="btn sm" data-act="tz-all" data-v="skip">${esc(modeLabel('skip'))}</button><button type="button" class="btn ghost sm" data-act="tz-all" data-v="reset">${L('Domyślne')}</button></div>
      ${listHtml()}
      <p class="note">${L('Przed zapisem dashboard zrobi kopię czterech baz (Kopie baz Notion wyżej). Zmienia się tylko strefa dat wejścia i wyjścia. Przerwaną poprawę uruchom jeszcze raz: poprawione wpisy zostaną pominięte. W czasie poprawy nie da się dodawać, edytować ani usuwać trade\'ów.')}</p>
      <label class="lbl" for="sv-tz-confirm">${esc(t('Wpisz {word}, aby poprawić', { word: w }))}</label>
      <div class="sp-keyrow"><input id="sv-tz-confirm" class="sp-in" type="text" autocomplete="off" spellcheck="false" maxlength="8" data-fk="tz-confirm" placeholder="${esc(w)}">
        <button type="button" class="btn primary danger sm" data-act="tz-apply" data-fk="tz-apply">${esc(t.p('Popraw {n} wpisów', r.pages))}</button><button type="button" class="btn ghost sm" data-act="tz-close" data-fk="tz-close">${L('Zamknij')}</button></div></div>`;
  }
  function resultHtml(r) {
    const bad = r.errors?.length ? `<ul class="sv-bk-sum">${r.errors.map((e) => `<li>${esc(e.title || t('(bez nazwy)'))}: ${esc(e.message)}</li>`).join('')}</ul>` : '';
    const head = r.errors?.length ? t('Poprawiono {n} wpisów, błędy: {e}. Uruchom podgląd i poprawę jeszcze raz, żeby dokończyć.', { n: r.changed, e: r.errors.length }) : t.p('Poprawiono strefę w {n} wpisach.', r.changed);
    return `<p class="note sv-bk-msg${r.errors?.length ? ' sv-warn' : ''}" role="${r.errors?.length ? 'alert' : 'status'}">${esc(head)} ${r.backup ? esc(t('Kopia przed zmianą: {name}.', { name: r.backup })) : ''}</p>${bad}`;
  }
  function html() {
    // stan zadania sprzed otwarcia tej sekcji (inna karta, poprzedni podgląd) nie jest pokazywany: jego zgoda mogła wygasnąć
    const running = !!st?.running, shown = started || running;
    const view = shown ? st : null;
    const head = `<div class="sv-gh">${gHead('sv-diag-tz', 'Strefa starych wpisów')}<button type="button" class="btn sm" data-act="tz-preview" data-fk="tz-preview"${running || !st ? ' disabled' : ''}>${running && st.kind === 'preview' ? L('Sprawdzam…') : L('Podgląd poprawy')}</button></div>
      <p class="note sv-gd">${L('Wpisy zapisane przez dziennik w czasie polskim mają w Notion przesunięcie Warszawy (+01:00 albo +02:00), a godziny wpisywałeś według czasu Nowego Jorku. Ta poprawa ustawia w datach wejścia i wyjścia strefę America/New_York przy tej samej godzinie na zegarze. Wpisy DEMO mają prawdziwy moment w czasie polskim i dostają ten sam moment w NY. Podgląd tylko czyta Notion.')}</p>`;
    let body = '';
    if (err) body += `<p class="note sv-warn" role="alert">${esc(err)}</p>`;
    if (running && view.kind === 'preview') body += `<div class="sv-confirm sv-tz-pv"><p class="note" role="status"><span class="spin" aria-hidden="true"></span> ${L('Czytam daty trade\'ów z Notion. To tylko odczyt.')}</p></div>`;
    else if (running && view.kind === 'apply') {
      const p = view.step === 'apply' && view.total ? Math.round((view.done / view.total) * 100) : 0;
      const line = view.step === 'apply' ? t('Poprawiam: {done} z {total} wpisów', { done: view.done, total: view.total }) : view.step === 'backup' ? t('Zapisuję kopię czterech baz…') : t('Porównuję z Notion…');
      body += `<div class="sv-confirm sv-tz-pv"><div class="sv-prog"><div class="sv-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-label="${esc(line)}"><i style="width:${p}%"></i></div><p class="note" aria-live="polite">${esc(line)}</p></div>
        <p class="note">${L('Nie zamykaj dashboardu do końca poprawy.')}</p></div>`;
    } else if (view?.error) body += `<p class="note sv-warn" role="alert">${esc(t('Nie udało się: {msg}', { msg: view.error.message }))}</p>`;
    else if (view?.kind === 'preview' && view.result) body += previewHtml(view.result);
    else if (view?.kind === 'apply' && view.result) body += resultHtml(view.result);
    return head + body;
  }
  function handle(act, v) {
    switch (act) {
      case 'tz-sort': { const sc = ctx.root()?.querySelector('.sv-tz-list')?.scrollTop || 0; sortDir = sortDir === 'asc' ? 'desc' : 'asc'; ctx.rerender(); const l = ctx.root()?.querySelector('.sv-tz-list'); if (l) l.scrollTop = sc; return true; }
      case 'tz-all': {
        const sc = ctx.root()?.querySelector('.sv-tz-list')?.scrollTop || 0;
        choices = {};
        if (MODES.includes(v)) for (const it of items()) choices[it.id] = v;
        ctx.rerender();
        const l = ctx.root()?.querySelector('.sv-tz-list'); if (l) l.scrollTop = sc;
        return true;
      }
      case 'tz-preview': started = true; start('/api/tz-fix/preview', {}); return true;
      case 'tz-close': started = false; err = ''; ctx.rerender(); return true;
      case 'tz-apply': {
        const typed = ctx.root()?.querySelector('#sv-tz-confirm')?.value.trim() || '', w = st?.result?.word || 'TAK';
        if (typed !== w) { err = t('Wpisz dokładnie {word}.', { word: w }); ctx.rerender(); ctx.root()?.querySelector('#sv-tz-confirm')?.focus(); return true; }
        err = '';
        const token = st?.kind === 'preview' ? st.result?.token : '';
        // wysyłamy tylko odstępstwa od domyślnych wyborów
        const sel = {};
        for (const it of items()) if (choices[it.id] && choices[it.id] !== it.group) sel[it.id] = choices[it.id];
        start('/api/tz-fix/apply', { confirm: typed, token, choices: sel });
        return true;
      }
      default: return false;
    }
  }
  // zmiana wyboru przy wpisie: liczniki i kolumna „Po poprawie” odświeżane bez przerysowania listy (zostaje przewinięcie)
  function onChange(ev) {
    const sel = ev.target.closest?.('[data-tzc]');
    if (!sel) return false;
    const id = sel.dataset.tzc, it = items().find((x) => x.id === id);
    if (!it || !MODES.includes(sel.value)) return true;
    choices[id] = sel.value;
    const cnt = ctx.root()?.querySelector('#sv-tz-cnt'); if (cnt) cnt.innerHTML = countsHtml();
    const o = ctx.root()?.querySelector(`[data-tzo="${CSS.escape(id)}"]`); if (o) o.textContent = resultOf(it);
    return true;
  }
  return { html, handle, onChange, enter: () => { load(); }, leave: () => clearTimeout(timer), started: () => started };
}
