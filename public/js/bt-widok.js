// Zakładka „Backtest” (1.5.0, pakiet C1): lista sesji (nazwa, instrumenty, dni zrobione / w puli, wynik w R, ostatnio otwarta), „Nowa sesja”, „Otwórz”,
// „Statystyki” (miejsce na pakiet G). Działa bez Notion: dane z lokalnego serwera (jak kalendarz). Otwarta sesja wraca po przeładowaniu strony (OPEN_KEY).
// English: Backtest tab: session list, new-session form and replay launcher; works without Notion.
import { t } from './i18n.js';
import { esc, fmtR, dateTimeShort } from './format.js';
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

  function listHtml(sessions) {
    const head = `<div class="sec-h"><h2>${esc(t('Sesje'))}</h2><div class="sec-ctl">${sessions.length ? `<button type="button" class="btn" data-bt="stats-all">${esc(t('Statystyki wszystkich'))}</button> ` : ''}<button type="button" class="btn primary" data-bt="new">${esc(t('Nowa sesja'))}</button></div></div>`;
    if (!sessions.length) {
      return `<div class="card empty"><h3>${esc(t('Brak sesji backtestu'))}</h3><p>${esc(t('Sesja to zakres dni z lokalnych świec, które przechodzisz świeca po świecy. Utwórz pierwszą.'))}</p><div><button type="button" class="btn primary" data-bt="new">${esc(t('Nowa sesja'))}</button></div></div>`;
    }
    const rows = sessions.map((s) => `<tr data-id="${esc(s.id)}">
      <td class="bt-l-name"><b>${esc(s.name || s.id)}</b>${s.todo ? ` <span class="bt-l-todo note" title="${esc(t("Trade'y bez opisu setupu"))}">${esc(t('Do uzupełnienia: {n}', { n: s.todo }))}</span>` : ''}</td>
      <td>${esc((s.instruments || []).join(', '))}</td>
      <td class="num">${esc(t('{d} / {n}', { d: s.done, n: s.pool }))}</td>
      <td class="num ${rClass(s.sumR)}">${esc(fmtR(s.sumR))}</td>
      <td class="bt-l-ago">${esc(ago(s.lastOpened))}</td>
      <td class="bt-l-act"><button type="button" class="btn sm" data-bt="open">${esc(t('Otwórz'))}</button> <button type="button" class="btn sm" data-bt="stats">${esc(t('Statystyki'))}</button></td>
    </tr>`).join('');
    return `${head}<div class="card bt-list"><table class="bt-tab"><thead><tr><th>${esc(t('Nazwa'))}</th><th>${esc(t('Instrument'))}</th><th class="num">${esc(t('Dni zrobione / w puli'))}</th><th class="num">${esc(t('Wynik'))}</th><th class="bt-l-ago">${esc(t('Ostatnio otwarta'))}</th><th aria-label="${esc(t('Akcje'))}"></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async function refresh() {
    if (!root || mode !== 'list') return;
    const my = ++seq;
    root.setAttribute('aria-busy', 'true');
    try {
      const sessions = await client.list();
      if (my !== seq || !root || mode !== 'list') return;
      root.innerHTML = listHtml(sessions);
      onList(sessions); // E2: kopia definicji sesji w ustawieniach (app.js)
    } catch {
      if (my !== seq || !root) return;
      root.innerHTML = `<div class="card empty err"><h3>${esc(t('Nie udało się wczytać sesji'))}</h3><p>${esc(t('Sprawdź, czy dashboard działa.'))}</p><button type="button" class="btn primary" data-bt="retry">${esc(t('Spróbuj ponownie'))}</button></div>`;
    } finally { root?.removeAttribute('aria-busy'); }
  }

  function showList() { mode = 'list'; kreator?.destroy(); kreator = null; stats?.destroy(); stats = null; refresh(); }
  // Statystyki (G): w miejscu listy; id = sesja albo null (wszystkie Backtest). Wejście z ekranu „Sesja ukończona” zamyka replay (onClose nie odświeża listy w trybie stats).
  function showStats(id = null) {
    if (!root) return;
    mode = 'stats';
    kreator?.destroy(); kreator = null; stats?.destroy();
    root.innerHTML = '';
    stats = mountStats(root, { client, getTrades, sessionId: id, loadFeatures, onBack: showList });
    stats.ready.then(() => root?.scrollIntoView?.({ block: 'start' })).catch(() => {});
  }
  const statsFromReplay = (sid) => { const r = replay; showStats(sid); r?.close(); };
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
