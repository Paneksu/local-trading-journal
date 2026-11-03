// Ustawienia (koło zębate). N2 (1.6.0): pełny widok zamiast popovera: nawigacja po lewej (7 sekcji), treść sekcji po prawej,
// głębokie linki #ustawienia/<sekcja>[/<grupa>], koło zębate otwiera ostatnio używaną sekcję; na telefonie lista sekcji, potem sekcja z „‹ Ustawienia”.
// Specyfikacja: backtest-wyniki/N-pierwsze-kroki-ustawienia.md §4.1–4.3. Sekcje w osobnych modułach (ust-*.js), żeby N3 i N4 pracowały w osobnych plikach;
// logika pól bez zmian względem popovera 1.5.0 (lista pól przed i po: docs/plany/backtest/etap-N1-N2.md).
// [U] 31.10.2026 «oraz zaktualizuj wyglad pierwszych krokow w journalu oraz modul ustawien zreworkuj na o wiele zrozumialszy i czyterlniejszy i dopracowny»
import { t } from './i18n.js';
import { esc, L, X_ICON, svgI, dot, getJson, postJson } from './ust-wspolne.js';
import { createKonto } from './ust-konto.js';
import { createZrodla } from './ust-zrodla.js';
import { createDysk } from './ust-dysk.js';
import { createWyglad } from './ust-wyglad.js';
import { createWykresy } from './ust-wykresy.js';
import { createBacktestSec } from './ust-backtest.js';
import { createDiagSec, connState } from './ust-diag.js';

// Kolejność (§4.2): najpierw konto i dane, potem wygląd, na końcu diagnostyka
export const SECTIONS = [
  { id: 'konto', label: 'Konto i Notion', short: 'Połączenie, dziennik, urządzenia', desc: 'Połączenie z Notion, Twój dziennik, dane przykładowe i urządzenia, które dzielą ustawienia.' },
  { id: 'zrodla', label: 'Źródła danych', short: 'Świece, newsy, earningsy, klucze', desc: 'Skąd dashboard bierze świece, newsy makro i earningsy. Klucze zostają w pliku .env na tym komputerze.' },
  { id: 'dysk', label: 'Dane na dysku', short: 'Gdzie leżą świece i sesje', desc: 'Gdzie leżą pobrane świece, sesje backtestu i pliki konfiguracji.' },
  { id: 'wyglad', label: 'Wygląd', short: 'Język, kolory, wynik BE', desc: 'Język, kolory zysku i straty, margines BE i podpis na kartach.' },
  { id: 'wykresy', label: 'Wykresy', short: 'Wygląd wykresu, nakładki, karty', desc: 'Wygląd wykresów świecowych, nakładki sesji, strefa czasowa, edytor rysunków i karty do udostępniania.' },
  { id: 'backtest', label: 'Backtest', short: 'Skoki, skróty, nowe sesje', desc: 'Skoki, skróty klawiszowe, szablony filtra dni i domyślne wartości nowej sesji.' },
  { id: 'diag', label: 'Kopie i diagnostyka', short: 'Połączenia, serwer, log', desc: 'Stan połączeń, serwer, log, aktualizacje i kopie baz. Tu sprawdzisz, co nie działa.' },
];
// Stare identyfikatory zakładek popovera 1.5.0 (wywołania toggle('wykresy'), toggle('backtest'), handle('sp-tab', 'ogolne'))
export const ALIAS = { dane: 'wyglad', be: 'wyglad', ogolne: 'wyglad', urzadzenia: 'konto' };
export const sectionOf = (id) => (SECTIONS.some((s) => s.id === id) ? id : ALIAS[id] || null);
const LAST_KEY = 'thq.ust.sekcja.v1';
const ICONS = {
  konto: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  zrodla: '<path d="M4 6h16M4 12h10M4 18h6"/><circle cx="18" cy="16" r="3"/>',
  dysk: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18M7 17h.01"/>',
  wyglad: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
  wykresy: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/>',
  backtest: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  diag: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// getMeta(): meta serwera (wersja, klucze tak/nie, limity Databento, synchronizacja); onConfig(patch): zapis do config.local.json (język, aktualizacje, okno 1s NQ, synchronizacja)
// updateHtml(): grupa „Aktualizacje” (aktualizacja.js), onboardingHtml(): „Pierwsze kroki” (pierwsze-kroki.js), devicesHtml(): urządzenia (urzadzenia.js)
// onChartTz, onChartBadj, onChart: zmiany wykresów (app.js); onEarnClass: ręczne wyjątki klas earningów (config.local.json)
// onSourcesChanged(): po zmianie klucza, kredytu albo limitów w Źródłach danych (odświeżenie meta i kart panelu); loadNewsStatus(): statusy newsów i earningsów; onBt, btCopyInfo: Backtest; demoCount(): wpisy DEMO w danych (app.js)
// onStop(opener): zatrzymanie serwera z potwierdzeniem (app.js stopServer); reload(): odświeżenie strony po restarcie; onRestored(): po przywróceniu kopii baz (N5: dane z Notion od nowa)
const DEFAULTS = {
  getMeta: () => ({}), onConfig: async () => {}, updateHtml: () => '', onboardingHtml: () => '', devicesHtml: () => '', onSyncToggle: () => {}, onTab: () => {},
  onChartTz: () => {}, onChartBadj: () => {}, onChart: () => {}, onSourcesChanged: async () => {}, loadNewsStatus: async () => null,
  onEarnClass: async () => ({}), onBt: () => {}, btCopyInfo: () => null, demoCount: () => 0,
  onStop: null, reload: () => location.reload(), onRestored: () => {},
};

export function createSettings(options) {
  const opts = { ...DEFAULTS, ...options };
  const { settings, save, getTheme } = opts;
  let pop = null;
  let sec = 'konto';
  // telefon: lista sekcji (true) albo treść sekcji (false)
  let mList = false;
  let diagState = null, openMsg = '', logState = null;
  const testing = new Set();
  const restart = { waiting: false, error: '' };
  const edit = { theme: getTheme() };
  const isSheet = () => window.matchMedia('(max-width: 1023px)').matches;
  const gear = () => document.getElementById('gear');

  const ctx = {
    settings, save, getTheme, opts, edit,
    getMeta: () => opts.getMeta() || {},
    root: () => pop,
    rerender: (o) => rerender(o),
    refreshPreview: () => mods.wykresy.refreshPreview(),
    isActive: (id) => !!pop && sec === id,
    diag: () => diagState,
    testing: () => testing,
    restartState: () => restart,
    logState: () => logState,
    openMsg: () => openMsg,
    // N3: restart wywołany przez akcję sekcji (np. przełączenie katalogu danych): trigger() wysyła żądanie, widok czeka na nowy start serwera
    restartVia: (trigger) => restartServer(trigger),
    // N3/N4: odświeżenie stanu połączeń (kropki w nawigacji) po zmianie klucza
    reloadDiag: () => loadDiag(),
  };
  const mods = {
    konto: createKonto(ctx), zrodla: createZrodla(ctx), dysk: createDysk(ctx), wyglad: createWyglad(ctx),
    wykresy: createWykresy(ctx), backtest: createBacktestSec(ctx), diag: createDiagSec(ctx),
  };
  const cur = () => mods[sec];
  // N3/N4: moduły sekcji dopisują własne pola (keepTyped), np. ścieżkę przeniesienia i potwierdzenia kwot
  const KEEP_TYPED = [...new Set(['#sp-dbkey', '#sp-fredkey', '#sp-fhkey', '#sp-earn-sym', ...Object.values(mods).flatMap((m) => m.keepTyped || [])])];

  function lastSection() { try { return sectionOf(localStorage.getItem(LAST_KEY)); } catch { return null; } }
  function rememberSection(id) { try { localStorage.setItem(LAST_KEY, id); } catch { /* bez localStorage */ } }
  function setHash(group = '') {
    try { history.replaceState(null, '', `#ustawienia/${sec}${group ? '/' + group : ''}`); } catch { /* strona bez historii */ }
  }
  function clearHash() {
    if (!/^#ustawienia/.test(location.hash)) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* bez historii */ }
  }

  // ---------- szkielet ----------
  function navHtml() {
    const d = diagState;
    const items = SECTIONS.map((s) => {
      const on = s.id === sec;
      return `<li class="sv-ni" role="presentation"><button type="button" role="tab" id="sv-tab-${s.id}" class="sv-nb" data-act="sp-tab" data-v="${s.id}" data-fk="tab-${s.id}" aria-selected="${on}" aria-controls="sp-body"${attn(s.id) ? ' data-attn="1"' : ''}>${svgI(ICONS[s.id], 16)}<span class="sv-nl">${L(s.label)}</span></button><span class="sv-nd" aria-hidden="true">${L(s.short)}</span></li>`;
    }).join('');
    const dots = d ? ['notion', 'databento', 'fred', 'finnhub'].map((s) => `<span class="sv-nf-c">${dot(connState(s, d.connections?.[s]).st)}${esc({ notion: 'Notion', databento: 'Databento', fred: 'FRED', finnhub: 'Finnhub' }[s])}</span>`).join('') : '';
    return `<nav class="sv-nav" aria-label="${L('Sekcje ustawień')}"><ul class="sp-tabs" role="tablist" aria-orientation="vertical" aria-label="${L('Sekcje ustawień')}">${items}</ul>
      <div class="sv-nf"><span class="sv-nf-v">${esc(t('Wersja {v}', { v: d?.version || ctx.getMeta().version || '?' }))}</span><span class="sv-nf-d">${dots}</span></div></nav>`;
  }
  // Kropka przy sekcji: Notion niepołączony albo ostatni test źródła z błędem
  function attn(id) {
    const c = diagState?.connections;
    if (!c) return false;
    // poprawki po review N1–N4: odłożony nieczytelny config.local.json
    if (id === 'diag') return !!diagState?.configCorrupt;
    if (id === 'konto') return !c.notion?.configured || c.notion?.last?.ok === false;
    if (id === 'zrodla') return ['databento', 'fred', 'finnhub'].some((s) => c[s]?.configured && c[s]?.last?.ok === false);
    return false;
  }
  function bodyHtml() {
    const s = SECTIONS.find((x) => x.id === sec);
    return `<div class="sv-back"><button type="button" class="btn ghost sm" data-act="sp-back" data-fk="sp-back">‹ ${L('Ustawienia')}</button></div>
      <header class="sv-head"><h2 id="sv-h">${L(s.label)}</h2><p class="page-sub">${L(s.desc)}</p></header>
      <div class="sv-body">${cur().html()}</div>`;
  }
  function html() {
    return `<div class="sv-top"><h2 id="sp-t">${L('Ustawienia')}</h2><button type="button" class="icon-btn" data-act="settings" aria-label="${L('Zamknij ustawienia')}">${X_ICON}</button></div>
      <div class="sv-wrap">${navHtml()}<div class="sv-main" id="sp-body" role="tabpanel" aria-labelledby="sv-tab-${sec}" tabindex="-1">${bodyHtml()}</div></div>`;
  }

  // odświeża zawartość, zachowując fokus (po kluczu data-fk), przewinięcie treści i wpisane, jeszcze niezapisane klucze
  function rerender({ keep = true } = {}) {
    if (!pop) return;
    const fk = keep ? document.activeElement?.dataset?.fk : null;
    // przegląd HIJ, pkt 7 (29.10.2026): wklejony, jeszcze niezapisany klucz przeżywa przerysowanie; wartość zostaje tylko w polu na stronie
    const typed = KEEP_TYPED.map((id) => [id, pop.querySelector(id)?.value || '']);
    const main = pop.querySelector('.sv-main'), top = keep ? main?.scrollTop || 0 : 0;
    pop.dataset.m = mList ? 'list' : 'sec';
    pop.innerHTML = html();
    for (const [id, v] of typed) if (v) { const k = pop.querySelector(id); if (k) k.value = v; }
    if (top) pop.querySelector('.sv-main').scrollTop = top;
    if (fk) pop.querySelector(`[data-fk="${fk}"]`)?.focus({ preventScroll: true });
  }

  // ---------- diagnostyka (wspólna dla sekcji Konto i Kopie i diagnostyka oraz kropek w nawigacji) ----------
  async function loadDiag() {
    try { diagState = { ...await getJson('/api/diag') }; } catch { diagState = diagState || null; }
    if (pop) rerender();
  }
  async function testSource(s) {
    const list = s === 'all' ? Object.keys(diagState?.connections || {}).filter((k) => diagState.connections[k].configured) : [s];
    for (const k of list) testing.add(k);
    rerender();
    await Promise.all(list.map(async (k) => {
      try { const r = await postJson('/api/diag/test', { source: k }); if (diagState?.connections?.[k]) diagState.connections[k].last = { ok: r.ok, code: r.code, detail: r.detail, checkedAt: r.checkedAt }; }
      catch (e) { if (diagState?.connections?.[k]) diagState.connections[k].last = { ok: false, detail: e.message }; }
      finally { testing.delete(k); }
    }));
    rerender();
  }
  async function openFolder(which) {
    try { const r = await postJson('/api/diag/open', { which }); openMsg = r.ok ? (r.opened ? t('Otwarto folder: {path}', { path: r.path }) : t('Ścieżka: {path}', { path: r.path })) : t('Folder jeszcze nie istnieje: {path}', { path: r.path }); }
    catch (e) { openMsg = e.message; }
    rerender();
  }
  async function loadLog() {
    try { logState = await getJson('/api/diag/log?lines=200'); } catch (e) { logState = { error: e.message }; }
    rerender();
    const pre = pop?.querySelector('.sv-log'); if (pre) pre.scrollTop = pre.scrollHeight;
  }
  async function copyLog() {
    try { await navigator.clipboard.writeText((logState?.lines || []).join('\n')); logState = { ...logState, copied: true }; } catch { logState = { ...logState, copied: false }; }
    rerender();
  }
  // Restart z UI: POST /api/restart (lib/restart.mjs startuje nowy proces na tym samym porcie), strona czeka, aż /api/health pokaże nowy start serwera
  async function restartServer(trigger = () => postJson('/api/restart', {})) {
    restart.waiting = true; restart.error = ''; rerender();
    let before = null;
    try { before = (await getJson('/api/health')).started ?? null; } catch { before = null; }
    try { await trigger(); }
    catch (e) { restart.waiting = false; restart.error = e.message || t('Trwa aktualizacja albo tworzenie dziennika. Spróbuj za chwilę.'); rerender(); return; }
    const until = Date.now() + 60_000;
    while (Date.now() < until) {
      await sleep(1000);
      try { const h = await getJson('/api/health'); if (h.ok && h.started !== before) { opts.reload(); return; } } catch { /* serwer jeszcze wstaje */ }
    }
    restart.waiting = false; restart.error = t('Dashboard nie wrócił po restarcie w ciągu minuty. Uruchom go ręcznie (Dashboard.vbs albo start.sh).');
    rerender();
  }
  async function stopServer(el) {
    if (opts.onStop) return opts.onStop(el);
    try { await postJson('/api/shutdown', {}); } catch { /* serwer już zatrzymany */ }
  }

  // ---------- przełączanie sekcji, otwieranie i zamykanie ----------
  function switchTo(id, { focusTab = true } = {}) {
    if (id !== sec) cur().leave?.();
    sec = id; mList = false;
    rememberSection(id);
    rerender({ keep: false });
    setHash();
    cur().enter?.();
    // H2 #28: fokus idzie z zakładką; na telefonie na „‹ Ustawienia”
    if (focusTab) (isSheet() ? pop.querySelector('[data-fk="sp-back"]') : pop.querySelector(`[data-fk="tab-${id}"]`))?.focus();
  }
  function scrollToGroup(group) {
    const g = group && pop?.querySelector(`#sv-g-${group}`);
    if (!g) return;
    g.scrollIntoView({ block: 'start' });
    g.querySelector('input:not([type="hidden"]):not([disabled]), select, button:not([disabled])')?.focus({ preventScroll: true });
  }
  // open(sekcja, grupa): sekcja z nazwy, aliasu albo ostatnio używana; bez sekcji na telefonie lista sekcji
  function open(at = '', group = '') {
    const want = typeof at === 'string' ? sectionOf(at) : null;
    const id = want || lastSection() || 'konto';
    if (pop) {
      if (id !== sec || mList) switchTo(id, { focusTab: !group });
      setHash(group);
      scrollToGroup(group);
      return;
    }
    edit.theme = getTheme();
    sec = id;
    mList = isSheet() && !want;
    pop = document.createElement('div');
    pop.className = 'sp sv';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    pop.setAttribute('aria-labelledby', 'sp-t');
    pop.dataset.m = mList ? 'list' : 'sec';
    pop.innerHTML = html();
    document.body.append(pop);
    document.documentElement.classList.add('sv-open');
    gear()?.setAttribute('aria-expanded', 'true');
    pop.addEventListener('keydown', (ev) => mods.backtest.onKeyDown(ev));
    for (const type of ['dragstart', 'dragover', 'drop', 'dragend']) pop.addEventListener(type, (ev) => { if (sec === 'backtest') mods.backtest.onDrag?.(ev); });
    if (want) rememberSection(id);
    setHash(group);
    cur().enter?.();
    loadDiag();
    if (group) scrollToGroup(group);
    else pop.querySelector(`[data-fk="tab-${sec}"]`)?.focus();
  }
  function close({ restore = true } = {}) {
    if (!pop) return;
    cur().leave?.();
    pop.remove();
    pop = null; openMsg = ''; logState = null;
    document.documentElement.classList.remove('sv-open');
    clearHash();
    gear()?.setAttribute('aria-expanded', 'false');
    if (restore) gear()?.focus();
  }
  const toggle = (at) => (pop ? close() : open(at));

  function handle(act, v, el) {
    switch (act) {
      case 'settings': toggle(); return true;
      case 'sp-tab': { const id = sectionOf(v); if (!id || !pop) return true; switchTo(id); return true; }
      case 'sp-back': mList = true; rerender({ keep: false }); pop.querySelector(`[data-fk="tab-${sec}"]`)?.focus(); return true;
      case 'diag-test': testSource(v); return true;
      case 'diag-open': openFolder(v); return true;
      case 'diag-log': loadLog(); return true;
      case 'diag-log-copy': copyLog(); return true;
      case 'diag-restart': restartServer(); return true;
      case 'diag-stop': stopServer(el); return true;
      default: return pop ? cur().handle(act, v, el) : false;
    }
  }
  function onInput(ev) { return pop && pop.contains(ev.target) ? cur().onInput(ev) : false; }
  function onChange(ev) {
    if (!pop || !pop.contains(ev.target)) return false;
    return cur().onChange(ev);
  }
  // Esc: najpierw sekcja (np. wybór koloru), potem cały widok. Tab: fokus zostaje w widoku.
  function onKey(ev) {
    if (!pop) return false;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      if (!cur().onEscape()) close();
      return true;
    }
    if (ev.key === 'Tab') {
      const f = [...pop.querySelectorAll('button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), a[href], [tabindex="0"]')].filter((e) => e.getClientRects().length);
      if (!f.length) return false;
      const first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); return true; }
      if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); return true; }
    }
    return false;
  }
  // Pełny widok zakrywa obszar roboczy: zamyka go przejście do innej zakładki dashboardu (pasek u góry albo na dole)
  function onPointerDown(ev) {
    if (pop && ev.target.closest?.('#tabs, #tabbar, [data-act="add-trade"]')) close({ restore: false });
  }
  return {
    toggle, open, close, handle, onInput, onChange, onKey, onPointerDown,
    isOpen: () => !!pop, section: () => sec, rerender,
    refreshTheme() { edit.theme = getTheme(); if (pop) rerender(); },
  };
}
