// Zakładka „Backtest” (1.5.0, pakiet C1): lista sesji (nazwa, instrumenty, start i bieżąca chwila replayu (K), wynik w R, ostatnio otwarta), „Nowa sesja”, „Otwórz”,
// „Statystyki” (miejsce na pakiet G). Działa bez Notion: dane z lokalnego serwera (jak kalendarz). Otwarta sesja wraca po przeładowaniu strony (OPEN_KEY).
// English: Backtest tab: session list, new-session form and replay launcher; works without Notion.
import { t } from './i18n.js';
import { esc, fmtR, fmtUsdFull as fmtMoney, dateTimeShort, shortDate } from './format.js';
import { nyDayOf } from './bt-sesja.js';
import { createSessionClient } from './bt-klient.js';
import { openKreator } from './bt-kreator.js';
import { openReplay, OPEN_KEY } from './bt-replay.js';
import { mountStats } from './bt-staty-widok.js';
import { confirmDialog, toast } from './modal.js';

const rClass = (x) => (x > 1e-9 ? 'pos' : x < -1e-9 ? 'neg' : '');
function ago(isoStr) {
  if (!isoStr) return '–';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '–';
  // H2 #7: język aplikacji (getLang), nie przeglądarki
  return dateTimeShort(d, new Date(), { withTz: true });
}

export function createBacktestView({ client = createSessionClient(), getAccounts = () => [], replayRoot = () => document.body, storage = globalThis.localStorage, open = openReplay, getSettings = () => null, onTemplates = () => {}, onFavTfs = () => {}, onPresets = null, onRemoved = () => {}, confirm = (o) => confirmDialog(o), notify = (m, o) => toast(m, o), getSetups = () => [], onStats = null, onList = () => {}, getTrades = () => [], loadFeatures = null } = {}) {
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
      <td class="bt-l-act"><button type="button" class="btn sm" data-bt="open">${esc(t('Otwórz'))}</button> <button type="button" class="btn sm" data-bt="stats">${esc(t('Statystyki'))}</button> <button type="button" class="btn sm ghost" data-bt="delete">${esc(t('Usuń'))}</button></td>
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
    replay = open(replayRoot(), { sessionId: id, client, storage, getSettings, onFavTfs, getSetups, onStats: onStats || statsFromReplay, onReopen: (sid) => openSession(sid), onPresets, onClose: () => { replay = null; refresh(); } });
  }

  // [U] 1.11.2026 «oraz dodaj mozliwosc usuniecia sesji bo aktualnie sie nie da»: okno potwierdzenia z liczbami i ostrzeżeniem o niewysłanych trade'ach, usunięcie odwracalne („Cofnij”)
  async function deleteSession(id) {
    // otwartej w replayu sesji nie usuwamy
    if (replay || !id) return;
    let s = null;
    try { s = (await client.list()).find((x) => x.id === id) || null; } catch { s = null; }
    if (!s) { notify(t('Nie ma takiej sesji backtestu.'), { error: true }); refresh(); return; }
    const total = s.trades || 0;
    let unsent = s.unsent || 0;
    const name = s.name || s.id;
    const noteOf = () => (unsent ? t("Uwaga: niewysłanych do Notion trade'ów: {n}. Po usunięciu sesji wrócisz do nich tylko przez „Cofnij” albo z folderu usuniętych sesji.", { n: unsent }) : '');
    const ok = await confirm({
      title: t('Usunąć sesję „{name}”?', { name }),
      text: `${t("Trade'ów w sesji: {n}", { n: total })}, ${t('w Notion: {n}', { n: total - unsent })}. ${t("Trade'y wysłane do Notion zostają w bazie Trade'y; usuwasz tylko sesję z tego komputera (kursor, zlecenia, rysunki, niewysłane trade'y).")}`,
      note: noteOf(), ok: t('Usuń sesję'), danger: true,
      extra: unsent ? { label: t('Najpierw wyślij do Notion'), run: async (btn, noteEl) => {
        btn.disabled = true; btn.setAttribute('aria-busy', 'true');
        try {
          const r = await client.notion({ sessionId: id, all: true });
          unsent = r.pending || 0;
          if (noteEl) { noteEl.textContent = unsent ? noteOf() : t("Wszystkie trade'y są już w Notion."); noteEl.classList.toggle('ok', !unsent); }
          if (!unsent) btn.hidden = true;
        } catch (e) { if (noteEl) noteEl.textContent = e.message || t('Wysyłka do Notion nie powiodła się.'); } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
      } } : null,
    });
    if (!ok) return;
    try { await client.remove(id); } catch (e) { notify(e.code === 'flush' ? t('Nie udało się zapisać sesji przed usunięciem, więc jej nie usunięto. Spróbuj ponownie za chwilę.') : e.message || t('Nie udało się usunąć sesji backtestu.'), { error: true }); refresh(); return; }
    onRemoved(id);
    refresh();
    notify(t('Sesja usunięta'), { ms: 9000, action: { label: t('Cofnij'), undo: true, run: async () => { try { await client.restore(id); } catch (e) { notify(e.message || t('Nie udało się przywrócić sesji backtestu.'), { error: true }); return; } refresh(); notify(t('Sesja przywrócona')); } } });
  }

  function onClick(ev) {
    const b = ev.target.closest('button');
    if (!b || b.disabled || !root?.contains(b)) return;
    if (b.dataset.bt === 'new') showKreator();
    else if (b.dataset.bt === 'open') openSession(b.closest('tr').dataset.id);
    else if (b.dataset.bt === 'stats') showStats(b.closest('tr').dataset.id);
    else if (b.dataset.bt === 'stats-all') showStats(null);
    else if (b.dataset.bt === 'delete') deleteSession(b.closest('tr').dataset.id);
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
