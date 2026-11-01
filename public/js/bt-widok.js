// Zakładka „Backtest” (1.5.0, pakiet C1): lista sesji (nazwa, instrumenty, start i bieżąca chwila replayu (K), wynik w R, ostatnio otwarta), „Nowa sesja”, „Otwórz”,
// „Statystyki” (miejsce na pakiet G). Działa bez Notion: dane z lokalnego serwera (jak kalendarz). Otwarta sesja wraca po przeładowaniu strony (OPEN_KEY).
// English: Backtest tab: session list, new-session form and replay launcher; works without Notion.
import { t } from './i18n.js';
import { esc, fmtR, fmtMoney, dateTimeShort, shortDate } from './format.js';
import { nyDayOf } from './bt-sesja.js';
import { createSessionClient } from './bt-klient.js';
import { openKreator } from './bt-kreator.js';
import { openReplay, OPEN_KEY } from './bt-replay.js';
import { mountStats } from './bt-staty-widok.js';

const rClass = (x) => (x > 1e-9 ? 'pos' : x < -1e-9 ? 'neg' : '');
function ago(isoStr) {
  if (!isoStr) return '–';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '–';
  return dateTimeShort(d); // H2 #7: język aplikacji (getLang), nie przeglądarki
}

export function createBacktestView({ client = createSessionClient(), getAccounts = () => [], replayRoot = () => document.body, storage = globalThis.localStorage, open = openReplay, getSettings = () => null, onTemplates = () => {}, getSetups = () => [], onStats = null, onList = () => {}, getTrades = () => [], loadFeatures = null } = {}) {
  let root = null, mode = 'list', kreator = null, replay = null, seq = 0, stats = null;

  // N1 (1.6.0): bez świec na dysku lista mówi, skąd je wziąć (głęboki link do Ustawień → Źródła danych), zamiast „Utwórz pierwszą”
  const noDataHtml = () => `<div class="card empty bt-nodata"><h3>${esc(t('Backtest potrzebuje świec'))}</h3><p id="bt-nodata-d">${esc(t('Na tym komputerze nie ma jeszcze świec ES ani NQ. Pobierasz je z Databento własnym kluczem, a dłuższą historię importujesz według instrukcji w Źródłach danych.'))}</p>
      <div><a class="btn primary" href="#ustawienia/zrodla/databento">${esc(t('Połącz Databento'))}</a> <a class="btn" href="#ustawienia/zrodla/import">${esc(t('Jak pobrać historię'))}</a></div></div>`;
  function listHtml(sessions, hasData = true) {
    // final (ocena wyglądu P3): bez świec „Nowa sesja” jest nieaktywna, powód w karcie pod spodem (aria-describedby) i w podpowiedzi
    const newBtn = hasData || sessions.length
      ? `<button type="button" class="btn primary" data-bt="new">${esc(t('Nowa sesja'))}</button>`
      : `<button type="button" class="btn primary" data-bt="new" disabled aria-describedby="bt-nodata-d" title="${esc(t('Najpierw pobierz świece: Ustawienia → Źródła danych.'))}">${esc(t('Nowa sesja'))}</button>`;
    const head = `<div class="sec-h"><h2>${esc(t('Sesje'))}</h2><div class="sec-ctl">${sessions.length ? `<button type="button" class="btn" data-bt="stats-all">${esc(t('Statystyki wszystkich'))}</button> ` : ''}${newBtn}</div></div>`;
    if (!sessions.length && !hasData) return `${head}${noDataHtml()}`;
    if (!sessions.length) {
      return `<div class="card empty"><h3>${esc(t('Brak sesji backtestu'))}</h3><p>${esc(t('Sesja startuje w wybranym dniu i płynie świeca po świecy przez lokalne świece aż do końca danych. Utwórz pierwszą.'))}</p><div><button type="button" class="btn primary" data-bt="new">${esc(t('Nowa sesja'))}</button></div></div>`;
    }
    const rows = sessions.map((s) => `<tr data-id="${esc(s.id)}">
      <td class="bt-l-name"><b>${esc(s.name || s.id)}</b>${s.todo ? ` <span class="bt-l-todo note" title="${esc(t("Trade'y bez opisu setupu"))}">${esc(t('Do opisania: {n}', { n: s.todo }))}</span>` : ''}</td>
      <td>${esc((s.instruments || []).join(', '))}</td>
      <td class="num">${esc(s.from ? `${shortDate(s.from)} ${s.from.slice(0, 4)}` : '–')} → ${esc(Number.isFinite(s.cursor) ? (() => { const d = nyDayOf(s.cursor); return `${shortDate(d)} ${d.slice(0, 4)}`; })() : '–')}</td>
      <td class="num bt-l-res"><b class="${rClass(s.sumR)}">${esc(fmtR(s.sumR))}</b><span class="bt-l-sub">${Number.isFinite(s.sumUsd) && s.trades ? `${esc(fmtMoney(s.sumUsd))} · ` : ''}${esc(t.p("{n} trade'ów", s.trades || 0))}</span></td>
      <td class="bt-l-ago">${esc(ago(s.lastOpened))}</td>
      <td class="bt-l-act"><button type="button" class="btn sm" data-bt="open">${esc(t('Otwórz'))}</button> <button type="button" class="btn sm" data-bt="stats">${esc(t('Statystyki'))}</button></td>
    </tr>`).join('');
    return `${head}<div class="card bt-list"><table class="bt-tab"><thead><tr><th>${esc(t('Nazwa'))}</th><th>${esc(t('Instrument'))}</th><th class="num">${esc(t('Start → teraz'))}</th><th class="num">${esc(t('Wynik'))}</th><th class="bt-l-ago">${esc(t('Ostatnio otwarta'))}</th><th aria-label="${esc(t('Akcje'))}"></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async function refresh() {
    if (!root || mode !== 'list') return;
    const my = ++seq;
    root.setAttribute('aria-busy', 'true');
    try {
      const sessions = await client.list();
      // N1: przy pustej liście sprawdzamy, czy są świece (granice danych); błąd odczytu nie straszy brakiem danych
      let hasData = true;
      if (!sessions.length) { try { const b = await client.bounds(['NQ', 'ES']); hasData = Number.isFinite(b?.first) && Number.isFinite(b?.last); } catch { hasData = true; } }
      if (my !== seq || !root || mode !== 'list') return;
      root.innerHTML = listHtml(sessions, hasData);
      onList(sessions); // E2: kopia definicji sesji w ustawieniach (app.js)
    } catch {
      if (my !== seq || !root) return;
      root.innerHTML = `<div class="card empty err"><h3>${esc(t('Nie udało się wczytać sesji'))}</h3><p>${esc(t('Sprawdź, czy dashboard działa.'))}</p><button type="button" class="btn primary" data-bt="retry">${esc(t('Spróbuj ponownie'))}</button></div>`;
    } finally { root?.removeAttribute('aria-busy'); }
  }

  function showList() { mode = 'list'; kreator?.destroy(); kreator = null; stats?.destroy(); stats = null; refresh(); }
  // Statystyki (G): w miejscu listy; id = sesja albo null (wszystkie Backtest). Wejście z ekranu „Sesja ukończona” zamyka replay (onClose nie odświeża listy w trybie stats).
  // final (ocena wyglądu P3): z replayu przycisk wraca do tej sesji, z listy do listy sesji
  function showStats(id = null, { fromReplay = false } = {}) {
    if (!root) return;
    mode = 'stats';
    kreator?.destroy(); kreator = null; stats?.destroy();
    root.innerHTML = '';
    const back = fromReplay && id ? { onBack: () => { showList(); openSession(id); }, backLabel: t('Wróć do sesji') } : { onBack: showList, backLabel: t('Wróć do listy sesji') };
    stats = mountStats(root, { client, getTrades, sessionId: id, loadFeatures, ...back });
    stats.ready.then(() => root?.scrollIntoView?.({ block: 'start' })).catch(() => {});
  }
  const statsFromReplay = (sid) => { const r = replay; showStats(sid, { fromReplay: true }); r?.close(); };
  function showKreator() {
    mode = 'new';
    kreator = openKreator(root, { client, accounts: getAccounts(), onCreated: (doc) => { showList(); openSession(doc.id); }, onCancel: showList, defaults: getSettings(), getDefaults: getSettings, onTemplates });
    kreator.form.querySelector('[name="name"]')?.focus();
  }
  function openSession(id) {
    if (replay) return;
    replay = open(replayRoot(), { sessionId: id, client, storage, getSettings, getSetups, onStats: onStats || statsFromReplay, onReopen: (sid) => openSession(sid), onClose: () => { replay = null; refresh(); } });
  }

  function onClick(ev) {
    const b = ev.target.closest('button');
    if (!b || b.disabled || !root?.contains(b)) return;
    if (b.dataset.bt === 'new') showKreator();
    else if (b.dataset.bt === 'open') openSession(b.closest('tr').dataset.id);
    else if (b.dataset.bt === 'stats') showStats(b.closest('tr').dataset.id);
    else if (b.dataset.bt === 'stats-all') showStats(null);
    else if (b.dataset.bt === 'retry') refresh();
  }

  return {
    mount(host) {
      root = host; mode = 'list';
      host.addEventListener('click', onClick);
      refresh();
      let last = null;
      try { last = storage?.getItem(OPEN_KEY); } catch { /* localStorage niedostępny */ }
      if (last && /^bt-[a-z0-9]{6,20}$/.test(last)) openSession(last);
    },
    isMounted: (el) => !!el && el === root && el.isConnected !== false,
    unmount() { root?.removeEventListener('click', onClick); stats?.destroy(); stats = null; root = null; },
    showStats, stats: () => stats,
    refresh,
    replay: () => replay,
  };
}
