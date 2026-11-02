// Ekran replayu modułu Backtest (1.5.0, pakiety C1 i D1; K 31.10.2026: ciągła oś czasu): pełnoekranowa warstwa .bt-screen nad dashboardem, układ 1, 2h, 2v albo 4 wykresów
// na jednym zegarze, pasek górny i sterowanie.
// K: [U] 31.10.2026 «nie wazne w jaki sposob powinines miec pelna przeszlosc tak daleko jak siega historia w danym momencie oraz nie powinno byc takiego czegos jak koniec dnia,
// tylko mozesz przesuwac czas tyle ile chcesz a po prostu jest opcja skokow, dzialanie fx replay ma byc wzorem». Sesja ma datę startu (def.from + godzina startu) i kursor,
// który płynie przez noc, dni i weekendy do końca danych ([U] «Do końca danych»); przerwy bez handlu są pomijane (skipGap, stepCursor z bt-czas.js). Nie ma „Zakończ dzień”,
// „Następny dzień”, ekranu „Sesja ukończona”, puli dni ani ukrytej daty. Dane: bt-dane.js (okno bazowe z wyprzedzeniem, historia wykresu do początku danych).
// Kursor C (sekundy UTC) jest jedynym zegarem: świece widoczne liczy bt-swieca.js (t + len ≤ C), więc żaden widok nie dostaje przyszłości.
// Krok = jedna świeca aktywnego TF, odtwarzanie przez requestAnimationFrame: na klatkę C += szybkość × dt i jeden render.
// Stan sesji (kursor, TF, książka zleceń) zapisuje bt-klient.js z opóźnieniem 1 s, przy pagehide z keepalive; po przeładowaniu kursor jest ten sam.
// C2: zlecenia (panel bt-zlecenia.js, silnik bt-wypelnienia.js), skoki z listy i skróty. Silnik dostaje kursor po każdym przesunięciu; pozycje i zlecenia przechodzą przez noc
// i dni (K: bez wymuszonego zamknięcia, reguła wypełnień na luce otwarcia jak dotąd). Skróty: jeden nasłuch keydown w fazie capture na window.
// D1: każdy wykres ma własny instrument i interwał, wszystkie czytają ten sam kursor. Rysunki: bt-rysunki.js (K: jeden dokument na instrument, cała oś czasu).
// E1: po pełnym zamknięciu pozycji trade trafia do pliku sesji od razu, a w rogu wykresu otwiera się opcjonalny panel journalingu (setup + notatka).
// E2 / K: [U] 31.10.2026 «od razu»: trade idzie do Notion zaraz po zamknięciu pozycji, opis zapisany później aktualizuje tę samą stronę; „Zapisz do Notion” ponawia zaległe,
// timer ponawia błędy przejściowe. Stan wysyłki (trade.notion) należy do serwera, ekran tylko go pokazuje.
// L (31.10.2026): «takze sposob egzekucji realziacji ma byc taki jak fx replay, u nas wgl nie widac profitu aktualnego ani nic […]». Pasek konta (saldo, equity, otwarty,
// dziś, sesja w $, % i R), szuflada `.bt-dock` (pozycje, zlecenia, historia; bt-szuflada.js), etykieta otwartego wyniku na linii pozycji z X i procentami, przeciągane
// zlecenia oczekujące (bt-wykres.js), konto z prowizją i ryzykiem % od bieżącego salda (bt-konto.js), Journal w klasycznym oknie trade'a (bt-journal-okno.js, Ctrl+J).
// English: full-screen replay on a continuous timeline: one cursor for all charts, gaps skipped, jumps, orders, journaling, immediate Notion sync.
import { t, locale } from './i18n.js';
import { esc, fmtR, WEEKDAYS, weekdayIdx, shortDate } from './format.js';
import { createBuilder, REPLAY_TFS, visibleCount, isReplayTf, checkCustomTf, tfNeeds1s } from './bt-swieca.js';
import { nyAt, visibleNews, nextNews, jumpTarget, skrotOf, sanitizeBt, skipGap, stepCursor, hintOf, skrotLabel } from './bt-czas.js';
import { emptyBook, advance, MULT } from './bt-wypelnienia.js';
import { toTrade, nextTradeId, mountJournal, todoOf, setupSuggestions } from './bt-journal.js';
import { isUnsent, needsUpdate } from './bt-notion.js';
import { account as accountOf, openPL, riskBalance, commissionOf, createExcursionTracker } from './bt-konto.js';
import { mountDock } from './bt-szuflada.js';
import { openJournalWindow, journalMaxT } from './bt-journal-okno.js';
import { fmtMoney } from './format.js';
import { mountOrders } from './bt-zlecenia.js';
import { createSessionClient } from './bt-klient.js';
import { createReplayChart } from './bt-wykres.js';
import { createDrawingStore, symOf } from './bt-rysunki.js';
import { createReplayData, sessionOpenAt, nextOpen } from './bt-dane.js';
import { migrateSession, nyDayOf } from './bt-sesja.js';
import { matchDays } from './bt-filtr.js';
import { confirmDialog, toast } from './modal.js';
import { LWC_URL, DRAW_URL, readColors } from './wykres.js';
import { dayTypeLabel } from './bt-filtr-widok.js';
import { chartTz, fmtIn, tzLabel } from './podglad.js';
import { aggregate, parseTf } from './swiece.js';
import { FAMILY } from './kontrakty.js';

export const SPEEDS = [1, 10, 60, 100, 300];
export const DEFAULT_SPEED = 100;
export const OPEN_KEY = 'thq.bt.open.v1'; // otwarta sesja: po przeładowaniu strony zakładka Backtest otwiera ją ponownie
export const JUMP_KEY = 'thq.bt.jump.v1'; // wybrany skok z listy (preferencja przeglądarki)
export const NOTION_RETRY_MS = 60_000; // E2: ponawianie zaległej wysyłki do Notion przy otwartym ekranie replayu
export const LAYOUT_KEY = 'thq.bt.layout.v1'; // ostatni układ wykresów: dostaje go nowa sesja (D1)
// K: skok „Następny news” szuka tak daleko poza wczytanym oknem
export const NEWS_AHEAD_SEC = 31 * 86400;
const LAYOUTS = ['1', '2h', '2v', '4'];
const CELLS = { 1: 1, '2h': 2, '2v': 2, 4: 4 };
const GEAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

// Układ z sesji (albo z localStorage) sprowadzony do poprawnego: tyle wykresów, ile pokazuje układ, instrumenty tylko z sesji, interwały poprawne wg isReplayTf (lista REPLAY_TFS to tylko domyślne wartości).
// Brakujące wykresy dostają kolejne instrumenty sesji i interwał ostatniego wykresu.
export function normLayout(layout, instruments, valid = null) {
  const kind = LAYOUTS.includes(layout?.kind) ? layout.kind : '1';
  const pool = (instruments?.length ? instruments : ['NQ']).filter((i) => !valid || valid(i));
  const have = Array.isArray(layout?.charts) ? layout.charts : [];
  const charts = [];
  for (let i = 0; i < CELLS[kind]; i++) {
    const c = have[i];
    const tfPrev = charts[i - 1]?.tf || have[have.length - 1]?.tf;
    charts.push({
      instrument: c && pool.includes(c.instrument) ? c.instrument : pool[i % pool.length],
      tf: isReplayTf(c?.tf) ? c.tf : (isReplayTf(tfPrev) ? tfPrev : '1m'),
      // [U] 1.11.2026 «nie ma do wybrania auto trybu w backtest…»: autoskalowanie osi ceny per wykres, domyślnie włączone
      auto: c?.auto !== false,
    });
  }
  const active = Number.isInteger(layout?.active) && layout.active >= 0 && layout.active < charts.length ? layout.active : 0;
  return { kind, charts, active };
}

const MAX_DT = 0.25; // s: po powrocie do karty odtwarzanie nie przeskakuje o całą przerwę
const inside = (ranges, c) => (ranges || []).some(([a, b]) => c >= a && c < b);
const closeIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

const MULT_OF = (i) => MULT[i] || 0;
// L: krótka data w strefie osi wykresu („12 mar”) przed godziną w szufladzie i Journalu
const dayLabelShort = (s) => fmtIn(chartTz()).DAY.format(new Date(Math.floor(s) * 1000));

function dayLabel(day) {
  // H2 (ocena wyglądu #7): data dnia w języku aplikacji, nie przeglądarki („Wt, 12 mar 2024”)
  return `${WEEKDAYS[weekdayIdx(day)]}, ${shortDate(day)} ${day.slice(0, 4)}`;
}

// openReplay(root, { sessionId }) → API ekranu. loadRange/loadBounds/loadFeatures podmienia strona testowa (np. syntetyczne newsy).
export function openReplay(root, { sessionId, client = createSessionClient(), loadRange = null, loadBounds = null, loadFeatures = null, loadDays = null, loadNews = null, loadLwc = () => import(LWC_URL), loadDraw = () => import(DRAW_URL).catch(() => null), getSettings = () => sanitizeBt(null), getSetups = () => [], confirm = (o) => confirmDialog(o), notify = (m, o) => toast(m, o), onStats = null, onClosed = () => {}, onReopen = () => {}, onClose = () => {}, onFavTfs = () => {}, notionEveryMs = NOTION_RETRY_MS, storage = globalThis.localStorage, raf = (f) => globalThis.requestAnimationFrame(f), caf = (id) => globalThis.cancelAnimationFrame(id), now = () => Date.now() } = {}) {
  const el = document.createElement('div');
  el.className = 'bt-screen';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', t('Replay backtestu'));
  const speed0 = sanitizeBt(getSettings()).speed;
  const speedBtns = SPEEDS.map((s) => `<button type="button" data-speed="${s}" aria-pressed="${s === speed0}">${s}×</button>`).join('');
  const layoutBtns = LAYOUTS.map((l) => `<button type="button" data-layout="${l}" aria-pressed="${l === '1'}">${esc(l)}</button>`).join('');
  // M (31.10.2026): skok to przycisk „Skocz <skok>” (powtarza wybrany) i menu skoków (wybór skacze od razu); ukryta lista .bt-jump trzyma wybrany skok
  el.innerHTML = `
    <header class="bt-top">
      <div class="bt-ttl"><b class="bt-name"></b><span class="bt-when"><span class="bt-date"></span><span class="bt-clock"></span><span class="bt-clock-ny"></span></span><span class="bt-daytype"></span></div>
      <div class="bt-stats"><span class="bt-acct" aria-label="${esc(t('Konto'))}"></span><span class="bt-ac bt-res" data-ac="ses"></span><span class="bt-notion" role="status"></span><button type="button" class="btn sm" data-bt="notion">${esc(t('Zapisz do Notion'))}</button><span class="bt-todo-w"><button type="button" class="btn sm bt-todo" data-bt="todo" aria-expanded="false" hidden></button><div class="bt-todo-l" role="menu" hidden></div></span></div>
      <div class="seg sm bt-layout" role="group" aria-label="${esc(t('Układ wykresów'))}">${layoutBtns}</div>
      ${onStats ? `<button type="button" class="btn sm" data-bt="stats">${esc(t('Statystyki'))}</button>` : ''}
      <button type="button" class="icon-btn" data-bt="close" aria-label="${esc(t('Zamknij replay'))}">${closeIcon}</button>
    </header>
    <div class="bt-charts"><div class="bt-chart"><div class="bt-grid" data-kind="1"></div></div><div class="bt-state empty" hidden></div></div>
    <div class="bt-stale note" role="alert" hidden><span>${esc(t('Sesja zmieniła się w innej karcie. Otwórz ją ponownie.'))}</span> <button type="button" class="btn sm" data-bt="reopen">${esc(t('Otwórz ponownie'))}</button></div>
    <div class="bt-ordhost"></div>
    <section class="bt-dock" aria-label="${esc(t('Pozycje i konto'))}" hidden></section>
    <footer class="bt-ctl">
      <button type="button" class="btn sm" data-bt="back" aria-label="${esc(t('Krok wstecz'))}">◀</button>
      <button type="button" class="btn sm primary" data-bt="play" aria-pressed="false">${esc(t('Odtwarzaj'))}</button>
      <button type="button" class="btn sm" data-bt="step" aria-label="${esc(t('Krok w przód'))}">▶</button>
      <div class="seg sm bt-speed" role="group" aria-label="${esc(t('Szybkość odtwarzania'))}">${speedBtns}</div>
      <label class="bt-tfl"><span class="lbl">${esc(t('Interwał'))}</span><select class="sp-in sp-sel bt-tf" data-bt="tf">${REPLAY_TFS.map((x) => `<option value="${x}">${x}</option>`).join('')}</select></label>
      <div class="bt-jumpw">
        <button type="button" class="btn sm bt-jump-go" data-bt="jump"><span class="bt-jump-k">${esc(t('Skocz'))}</span> <span class="bt-jump-n"></span></button><button type="button" class="btn sm bt-jump-dd" data-bt="jumpmenu" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(t('Wybierz skok'))}" title="${esc(t('Wybierz skok'))}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <div class="bt-jump-l" role="menu" aria-label="${esc(t('Skoki'))}" hidden></div>
        <select class="sp-in sp-sel bt-jump" data-bt="jumpsel" aria-label="${esc(t('Wybrany skok'))}" hidden></select>
      </div>
      <span class="note bt-msg" role="status"></span><button type="button" class="btn ghost sm bt-msg-more" data-bt="msgmore" aria-expanded="false" hidden>${esc(t('więcej'))}</button>
    </footer>`;
  root.appendChild(el);
  const $ = (s) => el.querySelector(s);

  let doc = null, data = null, LWC = null, D = null, cursor = 0, startCur = 0, endT = Infinity, speed = speed0, orders = null, stale = false, store = null;
  let cells = [], activeIdx = 0, posEditFn = null, curDay = '';
  let playing = false, rafId = 0, lastTs = 0, closed = false, colors = null, sendingNotion = false, notionTimer = 0;
  // K: dni z danymi i dni z filtra sesji (indeks cech dnia), do skoków
  let tradingDays = null, filterDays = null;
  // final (ocena wyglądu P1-4): komunikat w stopce najwyżej w 2 liniach; dłuższy rozwija przycisk „więcej” (pełny tekst także w title)
  const msg = (s) => {
    const m = $('.bt-msg'), more = $('.bt-msg-more');
    m.textContent = s || ''; m.title = s || ''; m.classList.remove('open');
    more.hidden = true; more.setAttribute('aria-expanded', 'false'); more.textContent = t('więcej');
    if (s) requestAnimationFrame(() => { if (m.textContent === s && m.scrollHeight > m.clientHeight + 1) more.hidden = false; });
  };
  // aktywny wykres: jego instrument dostaje zlecenia, jego interwał wyznacza krok
  const cur = () => cells[activeIdx] || cells[0] || null;
  const curInst = () => cur()?.instrument || '';
  const curTf = () => cur()?.tf || '1m';
  // [U] 1.11.2026 «oraz nie da sie dowolnie zmieniac timeframe i ustawiac ulubonych stalych i powinny byc od razu poakzane ulubione a nie lsita rozwiajana»:
  // ulubione interwały replayu to przyciski w nagłówku każdego wykresu (lista w bloku ustawień bt.favTfs, wspólna dla wykresów sesji, osobna od Live); aktywny własny interwał
  // spoza ulubionych dochodzi jako dodatkowy przycisk. Decyzja gustu: osobna lista dla replayu, bo ma inne dozwolone interwały niż wykres trade'a.
  let favs = sanitizeBt(getSettings()).favTfs;
  const sec1sAt = (inst) => !!data && inside(data.real1s(inst), cursor);
  const autoTitle = (on) => `${t('Automatyczna skala ceny. Wyłącz, żeby przesuwać wykres w pionie i skalować oś ceny (przeciąganie, kółko).')} ${on ? t('Teraz włączone.') : t('Teraz wyłączone.')}`;
  const tfProblemText = (code) => ({
    format: t('Interwał to liczba i jednostka: s, m albo h, np. 7m, 45s, 2h.'),
    unit: t('W replayu interwał podaje się w sekundach, minutach albo godzinach (s, m, h).'),
    max: t('Najdłuższy interwał własny to 24 godziny.'),
    multiple: t('Od minuty w górę interwał musi być wielokrotnością 60 sekund (świeca bazowa to 1m).'),
    no1s: t('Interwały krótsze niż minuta są tylko w oknie z danymi 1s (NQ, 9:30–11:00 czasu NY). Tu najmniejszy interwał to 1m.'),
  })[code] || '';
  // przycisk ulubionego interwału sekundowego bez dzielnika minuty jest wyłączony poza oknem 1s (jak pole „Własny”), z powodem w title
  function gateTfs(c) {
    const ok = sec1sAt(c.instrument);
    c.el.querySelectorAll('.bt-tfs button').forEach((b) => {
      const off = !ok && tfNeeds1s(b.dataset.tf);
      b.disabled = off;
      if (off) b.title = tfProblemText('no1s'); else b.removeAttribute('title');
    });
  }
  function paintTfs(only = null) {
    for (const c of only ? [only] : cells) {
      const list = favs.includes(c.tf) ? favs : [...favs, c.tf].sort((a, b) => parseTf(a).sec - parseTf(b).sec);
      c.el.querySelector('.bt-tfs').innerHTML = list.map((x) => `<button type="button" data-tf="${esc(x)}" aria-pressed="${x === c.tf}">${esc(x)}</button>`).join('');
      gateTfs(c);
      const fav = c.el.querySelector('.bt-tffav'), isFav = favs.includes(c.tf);
      fav.textContent = isFav ? t('★ Usuń {tf} z ulubionych', { tf: c.tf }) : t('☆ Dodaj {tf} do ulubionych', { tf: c.tf });
      fav.setAttribute('aria-pressed', String(isFav));
      c.el.querySelector('.bt-tfchips').innerHTML = favs.map((x) => `<span class="swc-chip">${esc(x)}<button type="button" data-tfdel="${esc(x)}" aria-label="${esc(t('Usuń {tf}', { tf: x }))}"${favs.length < 2 ? ' disabled' : ''}>×</button></span>`).join('');
    }
  }
  function toggleFav(tf) {
    if (!isReplayTf(tf)) return;
    const next = favs.includes(tf) ? favs.filter((x) => x !== tf) : [...favs, tf].sort((a, b) => parseTf(a).sec - parseTf(b).sec);
    if (!next.length) return;
    favs = sanitizeBt({ favTfs: next }).favTfs;
    paintTfs();
    onFavTfs(favs);
  }
  // wspólny wybór interwału w stopce: lista ulubionych/standardowych plus aktywny własny interwał
  function footTf() {
    const s = $('.bt-tf'), v = curTf();
    if (!s) return;
    if (![...s.options].some((o) => o.value === v)) { const o = document.createElement('option'); o.value = v; o.textContent = v; o.dataset.custom = '1'; s.appendChild(o); }
    for (const o of [...s.options]) if (o.dataset.custom && o.value !== v) o.remove();
    s.value = v;
  }
  const sessionInstruments = () => (doc?.def?.instruments?.length ? doc.def.instruments : ['NQ']).filter((i) => Object.hasOwn(FAMILY, i));
  // 409 stale (sesja zmieniona w innej karcie) to osobny stan: handel stoi, zapisy ustają, komunikat z przyciskiem „Otwórz ponownie”; inne błędy to zwykły komunikat
  function onSaveError(e) {
    if (closed) return;
    if (e?.code === 'stale') { stale = true; pause(); $('.bt-stale').hidden = false; msg(''); orders?.refresh(); }
    else if (e?.code === 'corrupt') msg(t('Plik tej sesji jest uszkodzony, więc zmiany nie są zapisywane. Zamknij replay i otwórz sesję ponownie.'));
    else msg(t('Nie udało się zapisać stanu sesji. Sprawdź, czy dashboard działa.'));
  }
  const persist = (opts) => { if (doc && !stale) { doc.cursor = cursor; client.save(doc, opts).catch(onSaveError); } };

  const cfg = () => sanitizeBt(getSettings());
  const streamOf = (k) => data?.stream(k) || null;
  // Silnik i znak wodny liczą na chwili „eff” = koniec ostatniej widocznej świecy bazowej (kursor bywa ułamkowy, w środku świecy w budowie): wejście i MAE/MFE
  // nie widzą wtedy sekund, które jeszcze „się nie wydarzyły” (przegląd C2, pkt 1 i 3).
  function effOf(k) {
    const st = streamOf(k), n = st ? visibleCount(st, cursor) : 0;
    return n > 0 ? st.bars[n - 1][0] + st.len[n - 1] : cursor;
  }
  // last(k) = chwila bieżąca silnika i zamknięcie ostatniej widocznej świecy bazowej instrumentu k (domyślnie aktywnego wykresu)
  function last(k = curInst()) {
    const st = streamOf(k), n = st ? visibleCount(st, cursor) : 0;
    return { t: effOf(k), price: n > 0 ? st.bars[n - 1][4] : NaN };
  }
  const busy = () => !!doc?.book && (Object.values(doc.book.positions || {}).some(Boolean) || (doc.book.orders || []).length > 0);
  function setBook(b) { doc.book = b; doc.hw = b.hw; } // zapis robi wywołujący raz po wszystkich zmianach (book + trade w jednym zapisie)
  // zdarzenie silnika → trade sesji (tylko 'closed' = pełne zamknięcie pozycji): toTrade z migawką rysunków instrumentu, zapis razem z book (wywołujący), panel journalingu,
  // a potem od razu wysyłka do Notion ([U] 31.10.2026 «od razu»)
  let notionSoon = false;
  function onEngine(ev) {
    if (ev.type !== 'closed') return;
    const trade = tradeFrom(ev.position);
    (doc.trades ||= []).push(trade);
    doc.tradeSeq = Math.max(Number(doc.tradeSeq) || 0, Number(String(trade.id).slice(1)) || 0);
    onClosed({ ...ev.position, maeR: trade.maeR, mfeR: trade.mfeR, tradeId: trade.id });
    openJournal(trade);
    // zapis trade'a robi wywołujący (onCommit panelu albo advanceAll) jednym zapisem; client.notion wysyła zaległy zapis przed POST
    if (!notionSoon) { notionSoon = true; queueMicrotask(() => { notionSoon = false; sendNotion({}); }); }
  }
  function tradeFrom(pos) {
    syncDrawings(); // rysunki z ostatnich 120 ms trafiają do magazynu przed migawką
    // [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 1: prowizja $ za kontrakt z kreatora, domyślnie 0)
    return toTrade(pos, { day: nyDayOf(pos.entryT), contract: null, stream: streamOf(pos.instrument), drawings: store ? store.snapshot(pos.instrument) : null, trades: doc.trades, id: nextTradeId(doc.trades, doc.tradeSeq), commission: commissionOf(doc.def) });
  }
  // ---- L: Journal trade'a w klasycznym oknie (bt-journal-okno.js) ----
  // [U] 31.10.2026 «Przyjmuję wszystkie» (J2: tylko zamknięte trade'y; J4: rysunki Journala to migawka trade'a, rysunki sesji bez zmian; J5: poprawki wysłanego trade'a w tle do Notion)
  let jw = null, jwDirty = false;
  const lastClosedId = () => { const l = (doc?.trades || []).filter((x) => x && Number.isFinite(x.exitT)); return l.length ? l[l.length - 1].id : null; };
  function openJournalWin(id, { setup = '' } = {}) {
    const x = (doc?.trades || []).find((y) => y.id === id);
    if (!x || !Number.isFinite(x.exitT) || closed) return null;
    pause();
    if (journal?.id === id) closeJournal();
    if (jw) { jw.show(id); return jw; }
    const f = fmtIn(chartTz());
    jwDirty = false;
    jw = openJournalWindow({
      trades: () => doc?.trades || [], id,
      onDelete: (tid) => { deleteTrade(tid); },
      fetchRange: loadRange || ((q) => client.range(q)),
      maxTOf: (tr) => journalMaxT(tr, { cursor, real1s: data?.real1s(tr.instrument) || [] }),
      setups: setupSuggestions(getSetups(), doc.trades), known: getSetups(),
      fmtTime: (s) => (Number.isFinite(s) ? `${dayLabelShort(s)} ${f.HMS.format(new Date(Math.floor(s) * 1000))}` : '–'),
      setup,
      onSave: (tid, patch) => {
        const y = (doc.trades || []).find((z) => z.id === tid);
        if (!y) return;
        y.setup = patch.setup; y.notes = patch.notes; y.journal = 'done'; y.jEdited = now();
        persist({ now: true }); paintBar(); paintDock();
        sendNotion({});
      },
      onDrawings: (tid, dd) => {
        const y = (doc.trades || []).find((z) => z.id === tid);
        if (!y) return;
        y.drawings = JSON.parse(JSON.stringify(dd)); y.dEdited = now(); jwDirty = true;
        persist();
      },
      onClose: () => {
        jw = null;
        if (closed) return;
        if (jwDirty) { jwDirty = false; persist({ now: true }); sendNotion({}); }
        paintBar(); paintDock();
      },
    });
    return jw;
  }

  // ---- [U] 2026-11-01 «Archiwum Notion + Cofnij»: usuwanie zamkniętego trade'a (Historia w szufladzie i okno Journala) ----
  // Trade sesji powstaje dopiero przy pełnym zamknięciu pozycji, więc otwartej pozycji tą drogą nie da się usunąć (najpierw ją zamknij); lista trade'ów to same zamknięte.
  // Kolejność: potwierdzenie → serwer przenosi stronę trade'a do kosza Notion (błąd Notion = nic się u nas nie zmienia, komunikat w powiadomieniu) → trade znika z sesji,
  // saldo, equity, wynik dnia i statystyki liczą się od nowa (account() z doc.trades) → zapis sesji (awaitowany) → powiadomienie „Cofnij” (9 s, Ctrl+Z): strona wraca z kosza,
  // trade wraca na swoje miejsce i jest wysyłany do Notion jak nowy (idempotentnie po znaczniku, bez dubla). Trade bez strony w Notion (niewysłany) usuwa się tylko lokalnie.
  // Numer trade'a nie wraca (doc.tradeSeq).
  // Decyzja 2026-11-02 (poprawki po przeglądach), zamknięcie replayu w trakcie usuwania: usuwanie kończy się też po zamknięciu (trade znika z pliku sesji, powiadomienie z Cofnij żyje),
  // więc Notion i plik sesji nigdy nie rozchodzą się z powodu samego zamknięcia karty. Zapis sesji po usunięciu, który się nie udał, zostawia trade w pliku, ale Cofnij to naprawia
  // (serwer przywraca samą stronę), a nieudany zapis ponawia się też sam przy następnym zapisie klienta (kolejka klienta).
  let deleting = false, busyRestore = () => {};
  const failText = (e, what = 'delete') => {
    if (e?.code === 'network' || !e?.status) return e?.code === 'flush' ? flushText(what) : t('Nie mogę połączyć się z lokalnym serwerem. Uruchom dashboard ponownie (Dashboard.vbs albo start.sh).');
    if (e.code === 'flush') return flushText(what);
    return e.message || (what === 'delete' ? t('Nie udało się usunąć trade\'a.') : t('Nie udało się przywrócić trade\'a.'));
  };
  const flushText = (what) => (what === 'delete' ? t('Nie udało się zapisać sesji, więc trade nie został usunięty. Spróbuj ponownie za chwilę.') : t('Nie udało się zapisać sesji, więc trade nie został przywrócony. Spróbuj ponownie za chwilę.'));
  // zapis sesji z potwierdzeniem (persist połyka błąd, a tu wynik jest potrzebny do komunikatu)
  async function saveNow() {
    try { await client.save(doc, { now: true }); return true; } catch (e) { onSaveError(e); return false; }
  }
  async function deleteTrade(id) {
    if (deleting || closed || stale || !doc) return false;
    const x = (doc.trades || []).find((y) => y && y.id === id);
    if (!x || !Number.isFinite(x.exitT)) return false;
    pause();
    deleting = true;
    // stan „w trakcie usuwania”: przyciski usuwania nieaktywne, dopóki serwer nie odpowie (podwójne kliknięcie niczego nie dubluje)
    document.documentElement.setAttribute('data-deleting', '1');
    try {
      const hasPage = !!x.notion?.id || Number.isFinite(x.notion?.postAt);
      const dirT = x.dir === 'Short' ? t('Short') : t('Long');
      const sum = `${x.instrument} ${dirT} × ${x.qty} · ${Number.isFinite(x.r) ? fmtR(x.r) : '–'} · ${Number.isFinite(x.pnl) ? fmtMoney(x.pnl) : '–'}`;
      const ok = await confirm({
        title: t('Usunąć trade {id}?', { id }),
        text: `${sum}. ${t('Trade zniknie z sesji, a saldo, equity i statystyki przeliczą się bez niego.')} ${hasPage ? t('Jego strona trafi do kosza w Notion i po 30 dniach zniknie na stałe. Trade przywrócisz przyciskiem „Cofnij” zaraz po usunięciu.') : t('Nie ma jeszcze strony w Notion, więc nic tam się nie zmieni.')}`,
        ok: t('Usuń trade'), danger: true,
      });
      if (!ok || closed || !doc) return false;
      // stan „w trakcie”: w klikniętym wierszu (i w oknie Journala tego trade'a) „Usuń” zmienia się w „Usuwanie…”, pozostałe przyciski są przygaszone (CSS [data-deleting])
      const busy = [...document.querySelectorAll(`[data-dka="delete"][data-id="${id}"]`), ...(jw && jw.tradeId() === id ? document.querySelectorAll('.bt-jw-del') : [])];
      for (const b of busy) { b.dataset.orig = b.textContent; b.textContent = t('Usuwanie…'); }
      busyRestore = () => { for (const b of busy) if (b.isConnected && b.dataset.orig) { b.textContent = b.dataset.orig; delete b.dataset.orig; } };
      let skip = false;
      for (;;) {
        try { await client.trashTrade(sessionId, id, { skipNotion: skip }); break; } catch (e) {
          if (closed) return false;
          // Notion nie zna strony (usunięta na stałe albo brak dostępu): usunięcie tylko lokalne wyłącznie za osobną zgodą
          if (e?.code === 'notion-missing' && !skip) {
            const go = await confirm({ title: t('Nie znaleziono strony w Notion'), text: t('W Notion nie ma strony tego trade\'a albo integracja nie ma do niej dostępu. Usunąć trade tylko z aplikacji? Niczego w Notion nie zmienię.'), ok: t('Usuń tylko z aplikacji'), danger: true });
            if (!go || closed) return false;
            skip = true; continue;
          }
          notify(failText(e, 'delete'), { error: true });
          return false;
        }
      }
      // strona jest już w koszu: od tej chwili wszystkie ścieżki kończą usunięcie (także po zamknięciu replayu)
      if (closed || !doc) return finishClosed(id);
      const index = (doc.trades || []).findIndex((y) => y && y.id === id);
      if (index < 0) return false;
      const [removed] = doc.trades.splice(index, 1);
      doc.tradeSeq = Math.max(Number(doc.tradeSeq) || 0, Number(String(id).slice(1)) || 0);
      if (journal?.id === id) closeJournal();
      if (jw && jw.tradeId() === id) {
        const rest = doc.trades.filter((y) => y && Number.isFinite(y.exitT));
        const next = rest[Math.min(index, rest.length - 1)];
        if (next) jw.show(next.id); else jw.close();
      }
      computeAccount(); paintBar(); paintDock();
      const saved = await saveNow();
      notify(saved ? t('Trade usunięty') : t('Trade usunięty, ale zapis sesji się nie udał. Cofnij przywróci stronę w Notion.'), { ms: 9000, error: !saved, action: { label: t('Cofnij'), undo: true, run: () => undoDelete(removed, index) } });
      return true;
    } finally { deleting = false; busyRestore(); busyRestore = () => {}; document.documentElement.removeAttribute('data-deleting'); }
  }
  // replay zamknięty w trakcie usuwania: trade znika z pliku sesji (świeżo wczytanego), powiadomienie z Cofnij działa jak zwykle
  async function finishClosed(id) {
    try {
      // zapis wysłany przy zamykaniu replayu musi się skończyć przed odczytem pliku (inaczej load wyprzedza zapis, a nasz zapis nadpisuje plik starszą wersją)
      await client.flush().catch(() => {});
      const d = await client.load(sessionId);
      const index = (d.trades || []).findIndex((y) => y && y.id === id);
      if (index < 0) return false;
      const [removed] = d.trades.splice(index, 1);
      d.tradeSeq = Math.max(Number(d.tradeSeq) || 0, Number(String(id).slice(1)) || 0);
      await client.save(d, { now: true });
      notify(t('Trade usunięty'), { ms: 9000, action: { label: t('Cofnij'), undo: true, run: () => undoDelete(removed, index) } });
      return true;
    } catch (e) { notify(failText(e, 'delete'), { error: true }); return false; }
  }
  async function undoDelete(removed, index) {
    let back;
    try { back = await client.restoreTrade(sessionId, removed.id); } catch (e) { notify(failText(e, 'restore'), { error: true }); return false; }
    removed.notion = { id: null, state: 'pending', error: null };
    let ok = false;
    if (!closed && doc) {
      if (!(doc.trades || []).some((y) => y && y.id === removed.id)) (doc.trades ||= []).splice(Math.min(index, doc.trades.length), 0, removed);
      computeAccount(); paintBar(); paintDock();
      ok = await saveNow();
    } else {
      // replay zamknięty w czasie powiadomienia: trade wraca do świeżo wczytanego pliku sesji
      try {
        await client.flush().catch(() => {});
        const d = await client.load(sessionId);
        if (!(d.trades || []).some((y) => y && y.id === removed.id)) (d.trades ||= []).splice(Math.min(index, d.trades.length), 0, removed);
        await client.save(d, { now: true });
        ok = true;
      } catch { ok = false; }
    }
    // „Trade przywrócony” dopiero po potwierdzonym zapisie sesji; kopia trade'a w księdze serwera czeka do tego zapisu, więc ponowienie jest możliwe
    if (!ok) {
      notify(t('Strona wróciła z kosza, ale zapis sesji się nie udał. Spróbuj ponownie.'), { error: true, ms: 9000, action: { label: t('Spróbuj ponownie'), run: () => undoDelete(removed, index) } });
      return false;
    }
    // strona wróciła z kosza: wysyłka rozpoznaje ją po znaczniku i podpina, bez dubla; trade bez strony czeka jak każdy niewysłany
    if (back?.restored) { if (!closed && doc) sendNotion({}); else client.notion({ sessionId }).catch(() => {}); }
    notify(t('Trade przywrócony'));
    return true;
  }

  // ---- E1: panel journalingu w rogu wykresu instrumentu (opcjonalny, replay na niego nie czeka) i lista „do uzupełnienia” ----
  let journal = null, placedAt = 0;
  const closeJournal = () => { journal?.ui.close(); journal = null; };
  const curX = (cell) => {
    const bs = cell.chart.bars(), lastB = bs[bs.length - 1];
    if (!lastB) return null;
    try { return cell.chart.chart.timeScale().timeToCoordinate(lastB[0]); } catch { return null; }
  };
  // pion świec (w pikselach) między x0 i x1 wykresu komórki: panel journalingu stawia się tam, gdzie zasłania mniej (H2, ocena wyglądu)
  const bandOf = (cell, x0, x1) => {
    try {
      const ts = cell.chart.chart.timeScale(), s = cell.chart.series, bs = cell.chart.bars();
      let lo = Infinity, hi = -Infinity;
      for (let i = Math.max(0, bs.length - 400); i < bs.length; i++) {
        const b = bs[i], x = ts.timeToCoordinate(b[0]);
        if (x == null || x < x0 || x > x1) continue;
        const yh = s.priceToCoordinate(b[2]), yl = s.priceToCoordinate(b[3]);
        if (yh != null) lo = Math.min(lo, yh); if (yl != null) hi = Math.max(hi, yl);
      }
      return Number.isFinite(lo) ? [lo, hi] : null;
    } catch { return null; }
  };
  function openJournal(trade) {
    closeJournal(); // poprzedni panel bez zapisu: jego trade zostaje 'todo' na liście
    if (!cells.length || closed) { paintBar(); return; }
    const cell = cells.find((c) => c.instrument === trade.instrument) || cells.find((c) => symOf(c.instrument) === symOf(trade.instrument)) || cur();
    const host = cell?.el.querySelector('.bt-stage');
    if (!host) { paintBar(); return; }
    const id = trade.id, f = fmtIn(chartTz());
    const ui = mountJournal(host, {
      trade, setups: setupSuggestions(getSetups(), doc.trades), known: getSetups(), fmtTime: (s) => f.HMS.format(new Date(Math.floor(s) * 1000)), cursorX: () => curX(cell), bandY: (x0, x1) => bandOf(cell, x0, x1),
      // M poprawki: pion zamknięcia ostatniej świecy (cena przy kursorze), panel staje po drugiej stronie
      priceY: () => { const bs = cell.chart.bars(), lb = bs[bs.length - 1]; try { return lb ? cell.chart.series.priceToCoordinate(lb[4]) : null; } catch { return null; } },
      // L (J1): „Journal” z szybkiego panelu: klasyczne okno trade'a z wpisanym setupem
      onJournal: ({ setup }) => { if (journal?.id === id) journal = null; openJournalWin(id, { setup }); },
      onSave: (patch) => {
        const x = (doc.trades || []).find((y) => y.id === id);
        // jEdited (review E2 #2): opis zapisany po wysyłce → serwer aktualizuje tę samą stronę w Notion (PATCH); K: zawsze od razu, bez czekania na koniec dnia
        if (x) { x.setup = patch.setup; x.notes = patch.notes; x.journal = 'done'; x.jEdited = now(); persist({ now: true }); }
        if (journal?.id === id) journal = null;
        paintBar();
        if (x) sendNotion({});
      },
      onSkip: () => { if (journal?.id === id) journal = null; paintBar(); },
    });
    journal = { id, ui };
    paintBar();
  }
  // ---- Notion (E2, K: od razu) ----
  const unsent = () => (doc?.trades || []).filter(isUnsent);
  function paintNotion() {
    const n = unsent(), errs = n.filter((x) => x.notion?.state === 'error');
    const lab = $('.bt-notion'), b = $('[data-bt="notion"]');
    // M (31.10.2026): bez zaległości sam stan („Notion: zapisane”) i bez przycisku; z zaległościami licznik i „Zapisz do Notion”
    lab.textContent = n.length ? t('Niezapisane w Notion: {n}', { n: n.length }) : t('Notion: zapisane');
    lab.dataset.n = String(n.length);
    b.hidden = !n.length;
    lab.title = errs.map((x) => `${x.id}: ${x.notion.error || ''}`).join('\n');
    lab.classList.toggle('err', errs.length > 0);
    b.disabled = !n.length || sendingNotion || !client.notion || stale;
    b.setAttribute('aria-busy', String(sendingNotion));
  }
  // {}: wszystkie niewysłane bez błędu (zaraz po zamknięciu i po opisie); all: także z błędem (przycisk). Replay nigdy na to nie czeka.
  // H2 (przegląd kodu #3): prośba w trakcie trwającej wysyłki trafia do kolejki i idzie zaraz po bieżącej. Timer (auto) pomija się przy trwającej wysyłce.
  const notionQueue = [];
  async function sendNotion(opts = {}) {
    if (!client.notion || !doc || stale || closed) return null;
    if (sendingNotion) {
      if (!opts.auto && !notionQueue.some((q) => JSON.stringify(q) === JSON.stringify(opts))) notionQueue.push(opts);
      return null;
    }
    sendingNotion = true; paintNotion();
    try {
      const r = await client.notion({ sessionId, ...opts });
      if (closed || !doc) return r;
      for (const x of doc.trades || []) if (x && r?.notion?.[x.id]) x.notion = r.notion[x.id];
      // wiersze Historii pokazują stan wysyłki, więc po odpowiedzi serwera odświeżamy też szufladę (po Cofnij stan wraca do „wysłany” bez ruchu kursora)
      paintDock();
      if (r?.failed?.length) msg(t('Nie zapisano w Notion: {n}. {err}', { n: r.failed.length, err: r.failed[0].error || '' }));
      else if (r?.sent) msg(t('Zapisano w Notion: {n}', { n: r.sent }));
      return r;
    } catch (e) {
      if (!closed) msg(t('Nie udało się wysłać do Notion: {msg}', { msg: e?.message || '' }));
      return null;
    } finally {
      sendingNotion = false;
      if (!closed && doc) paintNotion();
      if (!closed && notionQueue.length) sendNotion(notionQueue.shift());
    }
  }
  // co NOTION_RETRY_MS: wyłącznie ponowienie trade'ów już raz próbowanych z błędem przejściowym (notion.error). Serwer stosuje tę samą regułę (auto).
  const retryable = () => unsent().some((x) => !!x.notion?.error && (x.notion.state === 'pending' || needsUpdate(x)));
  function notionTick() { if (!closed && retryable()) sendNotion({ auto: true }); }

  function paintTodo() {
    const todo = todoOf(doc), btn = $('.bt-todo'), list = $('.bt-todo-l');
    btn.hidden = !todo.length;
    btn.textContent = t('Do opisania: {n}', { n: todo.length });
    if (!todo.length) { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    list.innerHTML = todo.map((x) => `<button type="button" role="menuitem" class="btn sm" data-todo="${esc(x.id)}">${esc(x.id)} · ${esc(x.instrument)} ${esc(x.dir)} · ${esc(Number.isFinite(x.r) ? fmtR(x.r) : '–')}</button>`).join('');
  }

  // kursor → silnik: instrumenty z pozycją albo zleceniem przechodzą advance, pozostałym rośnie sam znak wodny (cofnięcie blokuje handel)
  function advanceAll() {
    let b = doc.book; const evs = [];
    b.hwi ||= {};
    for (const k of sessionInstruments()) {
      const e = effOf(k);
      if (b.positions[k] || b.orders.some((o) => o.instrument === k)) { const r = advance(b, k, streamOf(k), e); b = r.book; evs.push(...r.events); }
      else if (e > (b.hwi[k] ?? -Infinity)) b.hwi[k] = e;
    }
    b.hw = Math.max(b.hw || 0, effOf(curInst()));
    doc.book = b; doc.hw = b.hw;
    if (evs.length) { for (const e of evs) onEngine(e); persist({ now: true }); }
  }

  // ---- L: stan konta przy kursorze (przy każdym przesunięciu kursora), pasek konta i szuflada ----
  let account = null, dock = null;
  // „dziś” = od otwarcia sesji CME kursora (18:00 NY dnia poprzedniego); kalendarz sesji liczony raz na sesję
  let dayMemo = { open: -Infinity, until: -Infinity };
  const dayStart = () => { if (!(cursor >= dayMemo.open && cursor < dayMemo.until)) dayMemo = { open: sessionOpenAt(cursor), until: nextOpen(cursor) }; return dayMemo.open; };
  const computeAccount = () => (account = accountOf({ book: doc.book, trades: doc.trades, def: doc.def, last, dayStart: dayStart() }));
  // [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 6: wyniki w $ i % na ekranie replayu i w statystykach sesji; „Backtest kontra Live” dalej w R)
  const pctTxt = (x) => `${x > 1e-9 ? '+' : x < -1e-9 ? '−' : ''}${new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(Math.abs(x))}%`;
  const cls = (x) => (x > 1e-9 ? 'pos' : x < -1e-9 ? 'neg' : '');
  function paintAcct() {
    const a = account || computeAccount(), box = $('.bt-acct');
    // M (31.10.2026): etykieta nad wartością jak kafle dashboardu; dopisek (R, %) w osobnym elemencie, na wąskim ekranie schowany
    const item = (k, label, val, c = '', x = '') => `<span class="bt-ac" data-ac="${k}"><span class="lbl">${esc(label)}</span> <span class="bt-ac-v"><b class="${c}">${esc(val)}</b>${x ? ` <span class="bt-ac-x ${c}">${esc(x)}</span>` : ''}</span></span>`;
    const html = item('bal', t('Saldo'), fmtMoney(a.balance, { plus: false }))
      + item('eq', t('Equity'), fmtMoney(a.equity, { plus: false }))
      + item('open', t('Otwarty'), a.open.length ? fmtMoney(a.upl) : '–', cls(a.upl), a.open.length ? fmtR(a.open.reduce((s, o) => s + o.r, 0)) : '')
      + item('day', t('Dziś'), fmtMoney(a.day.usd), cls(a.day.usd), `${pctTxt(a.day.pct)} · ${fmtR(a.day.r)}`);
    if (box._h !== html) { box._h = html; box.innerHTML = html; }
  }
  function dockModel() {
    const a = account || computeAccount(), b = doc.book, f = fmtIn(chartTz());
    const positions = a.open.map((o) => {
      const p = b.positions[o.instrument];
      const ex = excTrack.get(p, streamOf(o.instrument), effOf(o.instrument));
      return { ...o, sl: p.sl, tp: p.tp, be: p.be, usd: o.usd, maeR: ex.maeR, mfeR: ex.mfeR, held: effOf(o.instrument) - p.entryT };
    });
    const orders = (b.orders || []).map((o) => ({ id: o.id, instrument: o.instrument, side: o.side, type: o.type, qty: o.qty, price: o.price, sl: o.sl, tp: o.tp, risk: o.sl != null ? Math.abs(o.price - o.sl) * (MULT_OF(o.instrument)) * o.qty : null }));
    const rw = stale || cursor < (b.hw || 0);
    return { positions, orders, trades: (doc.trades || []).filter((x) => x && Number.isFinite(x.exitT)), rw, fmtTime: (s) => (Number.isFinite(s) ? `${dayLabelShort(s)} ${f.HMS.format(new Date(Math.floor(s) * 1000))}` : '–') };
  }
  const excTrack = createExcursionTracker();
  function paintDock() { if (dock) dock.paint(dockModel()); }

  let clockTz = '';
  function paintBar() {
    const d = curDay;
    $('.bt-name').textContent = doc.name || '';
    $('.bt-date').textContent = d ? dayLabel(d) : '';
    const f = fmtIn(chartTz());
    $('.bt-clock').textContent = f.HMS.format(new Date(Math.floor(cursor) * 1000));
    // M (31.10.2026): zegar w strefie wykresu ma podpis strefy, a godzina startu i skoki są w NY, więc obok stoi godzina NY (gdy strefa wykresu nie jest NY)
    const tz = chartTz();
    if (tz !== clockTz) { clockTz = tz; $('.bt-clock').title = t('Czas wykresu: {tz}', { tz: tzLabel(tz, cursor) }); }
    const nyTxt = tz === 'America/New_York' ? '' : `${fmtIn('America/New_York').HMS.format(new Date(Math.floor(cursor) * 1000))} NY`, nyEl = $('.bt-clock-ny');
    if (nyEl.textContent !== nyTxt) nyEl.textContent = nyTxt;
    const trades = doc.trades || [];
    const a = account || computeAccount();
    paintAcct();
    // L: wynik sesji w $, % salda startowego i R (wcześniej tylko suma R)
    // M poprawki (ocena wyglądu #10): wynik sesji jako piąty kafel konta (etykieta nad kwotą, dopisek % · R · liczba trade'ów)
    const res = $('.bt-res'), c0 = cls(a.session.usd);
    const html = `<span class="lbl">${esc(t('Sesja'))}</span> <span class="bt-ac-v"><b class="${c0}">${esc(fmtMoney(a.session.usd))}</b> <span class="bt-ac-x ${c0}">${esc(`${pctTxt(a.session.pct)} · ${fmtR(a.session.r)} · ${t.p("{n} trade'ów", trades.length)}`)}</span></span>`;
    if (res._h !== html) { res._h = html; res.innerHTML = html; }
    paintNotion();
    for (const c of cells) {
      const secTf = (parseTf(c.tf)?.sec ?? 60) < 60;
      const r1 = data?.real1s(c.instrument) || [], show = secTf && !inside(r1, cursor);
      c.secnote.hidden = !show;
      gateTfs(c);
      if (show) c.secnote.textContent = r1.length ? t('Sekundy od 9:30 do 11:00 NY, poza tym świece 1m.') : t('Ten instrument ma tylko świece 1m.');
    }
    paintTodo();
    footTf();
    el.querySelectorAll('[data-layout]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === (doc.layout?.kind || '1'))));
  }

  function render() {
    if (!cells.length) return;
    for (const c of cells) c.chart.apply(c.builder.seek(cursor));
    if (journal && Date.now() - placedAt > 400) { placedAt = Date.now(); journal.ui.place(); } // róg panelu zależy od położenia świecy przy kursorze
    const d = nyDayOf(cursor);
    if (d !== curDay) { curDay = d; paintDayType(d); }
    computeAccount();
    paintBar();
    orders?.refresh();
    paintDock();
  }

  function state(text) {
    const s = $('.bt-state');
    s.hidden = !text; s.innerHTML = text ? `<p>${esc(text)}</p>` : '';
    $('.bt-chart').hidden = !!text;
  }

  // ---- D1: wykresy (komórki układu) ----
  // Rysunki zmienione na jednym wykresie trafiają do magazynu sesji (bt-rysunki.js) i odświeżają pozostałe wykresy tego instrumentu; do pliku sesji idzie zapis z rysunki.js (saveDoc).
  function syncDrawings() {
    for (const c of cells) {
      const r = c.chart.rysunki?.();
      if (!r) continue;
      const dd = r.currentDoc(), sig = JSON.stringify(dd.d);
      if (sig === c.sig) continue;
      c.sig = sig;
      store?.set(c.instrument, dd, { origin: c, persist: false });
    }
  }
  function destroyCells() {
    closeJournal();
    syncDrawings();
    for (const c of cells) { clearTimeout(c.liveTimer); c.off?.(); try { c.chart.destroy(); } catch { /* już zniszczony */ } c.el.remove(); }
    cells = [];
  }
  // PDH/PDL: świece 1D sesji zamkniętych w oknie bazowym przed sesją kursora (w całości przed kursorem); pamięć do zmiany sesji kursora albo okna
  const dailyMemo = new Map();
  function dailyOf(inst) {
    const st = streamOf(inst);
    if (!st) return [];
    const m = dailyMemo.get(symOf(inst)), base = `${data.baseFrom()}|${st.bars.length ? st.bars[0][0] : 0}`;
    // w obrębie tej samej sesji kursora wynik się nie zmienia (kalendarz sesji jest drogi przy każdej klatce)
    if (m && m.base === base && cursor >= m.open && cursor < m.until) return m.daily;
    const open = sessionOpenAt(cursor);
    const n = visibleCount(st, open);
    const daily = aggregate(st.bars.slice(0, n), '1D') || [];
    dailyMemo.set(symOf(inst), { base, open, until: nextOpen(cursor), daily });
    return daily;
  }
  function cellHtml(i, cfgC) {
    const ins = sessionInstruments().map((x) => `<option value="${esc(x)}"${x === cfgC.instrument ? ' selected' : ''}>${esc(x)}</option>`).join('');
    return `
      <div class="bt-ch">
        <select class="sp-in sp-sel bt-ci" aria-label="${esc(t('Instrument wykresu'))}">${ins}</select>
        <div class="seg sm bt-tfs" role="group" aria-label="${esc(t('Interwał wykresu'))}"></div>
        <span class="bt-tfw"><button type="button" class="icon-btn bt-tfmore" aria-expanded="false" aria-label="${esc(t('Własny interwał i ulubione'))}" title="${esc(t('Własny interwał i ulubione'))}">⋯</button>
          <div class="bt-tfpop" hidden>
            <form class="bt-tfadd"><input class="sp-in" type="text" maxlength="6" placeholder="${esc(t('Własny, np. 7m'))}" spellcheck="false" autocomplete="off" aria-label="${esc(t('Własny interwał'))}"><button type="submit" class="btn sm">${esc(t('Ustaw'))}</button></form>
            <p class="note bt-tfmsg" role="status"></p>
            <button type="button" class="btn sm bt-tffav"></button>
            <p class="lbl">${esc(t('Ulubione'))}</p><div class="swc-chips bt-tfchips"></div>
          </div></span>
        <div class="seg sm bt-auto" role="group" aria-label="${esc(t('Skala ceny'))}"><button type="button" data-swc="auto" aria-pressed="${cfgC.auto !== false}" title="${esc(autoTitle(cfgC.auto !== false))}">${esc(t('Auto'))}</button></div>
        <span class="swc-save" aria-live="polite"></span><span class="swc-meter" hidden></span>
        <button type="button" class="btn sm swc-draw" aria-expanded="false">${esc(t('Rysuj'))}</button>
        <div class="swc-tools" role="toolbar" aria-label="${esc(t('Narzędzia rysowania'))}"></div>
      </div>
      <div class="swc-stage bt-stage"><div class="bt-plot swc-plot swc-lwc" data-i="${i}"></div>
        <button type="button" class="icon-btn swc-gear" hidden title="${esc(t('Ustawienia rysunku'))}" aria-label="${esc(t('Ustawienia rysunku'))}">${GEAR}</button>
        <div class="swc-style" role="group" aria-label="${esc(t('Ustawienia rysunku'))}" hidden></div>
        <p class="note bt-secnote" hidden></p></div>`;
  }
  function makeCell(i, cfgC) {
    const sym = symOf(cfgC.instrument);
    const host = document.createElement('div');
    host.className = 'bt-cell swc';
    host.dataset.i = String(i); host.dataset.active = 'false';
    host.innerHTML = cellHtml(i, cfgC);
    $('.bt-grid').appendChild(host);
    const cell = { i, el: host, instrument: cfgC.instrument, tf: cfgC.tf, liveTimer: 0, sig: '', off: null, ext: false };
    const sel = (s) => host.querySelector(s);
    cell.secnote = sel('.bt-secnote');
    cell.builder = createBuilder(streamOf(cfgC.instrument), cfgC.tf);
    const base = store.docOf(sym);
    cell.chart = createReplayChart(sel('.bt-plot'), {
      LWC, D, instrument: cfgC.instrument, tf: cfgC.tf, colors: (colors = readColors(sel('.bt-plot'))), getNews: () => visibleNews(data.news(), cursor),
      autoScale: cfgC.auto !== false,
      onAutoChange: (on) => { const ab = sel('[data-swc="auto"]'); ab.setAttribute('aria-pressed', String(on)); ab.title = autoTitle(on); if (doc.layout.charts[i]) doc.layout.charts[i] = { ...doc.layout.charts[i], auto: on }; persist(); },
      // K: pełna historia: porcje świec interwału wykresu sprzed okna bazowego, do początku danych
      getHistory: (before) => data.history(cell.instrument, cell.tf, before), historyEnd: () => data.baseFrom(), getDaily: () => dailyOf(cell.instrument),
      // L: etykieta otwartego wyniku na linii pozycji (cena bieżąca instrumentu, prowizja sesji) i akcje z warstwy handlu
      plOf: (p) => openPL(p, last(p.instrument).price, { commission: commissionOf(doc.def) }), fmtUsd: (x) => fmtMoney(x),
      labels: { close: t('Zamknij część pozycji'), closePart: t('Zamknij część pozycji'), cancel: t('Anuluj zlecenie'), buy: t('Kup'), sell: t('Sprzedaj'), pts: t('pkt') },
      onTradeAction: (a) => {
        if (!orders) return;
        if (a.kind === 'pct') { const p = doc.book.positions[cell.instrument]; if (p) orders.closePct(cell.instrument, a.pct); }
        else if (a.kind === 'cancel') orders.cancel(a.id);
        else if (a.kind === 'move') { orders.moveOrder(a.id, a.changes); if (a.focus) cell.chart.focusTag(a.focus); }
      },
      onCrosshair: (time) => { for (const o of cells) if (o !== cell) o.chart.setCursorLine(time); },
      rysunki: D ? {
        bar: sel('.swc-tools'), panel: sel('.swc-style'), stage: sel('.swc-stage'), gear: sel('.swc-gear'), foot: { save: sel('.swc-save'), meter: sel('.swc-meter') },
        doc: base, confirm: (o) => confirmDialog(o), isActive: () => cells[activeIdx] === cell,
        // J (30.10.2026): nowa pozycja rysowana w replayu bierze konto i ryzyko z definicji sesji (jak panel zleceń); zaznaczenie odświeża „Wejdź według rysunku”
        positionDefaults: () => {
          const r = doc.def?.risk || {}, out = {};
          // L: konto rysunku = saldo, od którego liczy się ryzyko (bieżące albo startowe, decyzja 2)
          const bal = riskBalance({ def: doc.def, trades: doc.trades, book: doc.book });
          if (bal > 0) out.accountSize = bal;
          if (r.mode === 'pct' && Number(r.value) > 0) Object.assign(out, { riskDisplayMode: 'percents', riskPercent: Number(r.value) });
          else if (Number(r.value) > 0) Object.assign(out, { riskDisplayMode: 'money', riskAmount: Number(r.value) });
          return out;
        },
        onSelect: () => { if (cells[activeIdx] === cell) orders?.syncDrawing?.(); },
        // przegląd J P3-5: ile kontraktów faktycznie złoży „Wejdź według rysunku” (ryzyko sesji), do notki w panelu Wejścia
        sessionQty: (d) => orders?.drawingQty?.(d, cell.instrument) ?? null,
        saveDoc: async (dd) => { cell.sig = JSON.stringify(dd.d); store.set(sym, dd, { origin: cell }); return { ok: true }; },
        // zmiana w trakcie rysowania widoczna na pozostałych wykresach tego instrumentu od razu (po 120 ms ciszy), zapis do pliku robi saveDoc
        onChange: () => {
          if (cell.ext) return;
          clearTimeout(cell.liveTimer);
          cell.liveTimer = setTimeout(() => {
            const r = cell.chart.rysunki?.();
            if (!r || closed) return;
            const dd = r.currentDoc(), sig = JSON.stringify(dd.d);
            if (sig === cell.sig) return;
            cell.sig = sig;
            store.set(sym, dd, { origin: cell, persist: false });
          }, 120);
        },
      } : null,
    });
    cell.sig = JSON.stringify(cell.chart.rysunki?.()?.currentDoc().d ?? base.d);
    cell.off = store.subscribe(sym, (dd, origin) => {
      if (origin === cell) return;
      cell.ext = true;
      try { cell.chart.rysunki?.()?.applyExternal(dd); cell.sig = JSON.stringify(cell.chart.rysunki?.()?.currentDoc().d ?? dd.d); } finally { cell.ext = false; }
    });
    if (posEditFn) cell.chart.onPositionEdit((pr) => posEditFn(pr, cell.instrument));
    host.addEventListener('pointerdown', () => activate(i), true);
    sel('.bt-ci').addEventListener('change', (ev) => setCell(i, { instrument: ev.target.value }));
    paintTfs(cell);
    const pop = sel('.bt-tfpop'), more = sel('.bt-tfmore'), tmsg = sel('.bt-tfmsg');
    // zamykanie kliknięciem obok panelu (jak wybierak daty): nasłuch tylko, gdy menu jest otwarte
    let offOutside = null;
    const openPop = (on) => {
      pop.hidden = !on; more.setAttribute('aria-expanded', String(on));
      offOutside?.(); offOutside = null;
      if (!on) return;
      const h = (ev) => { if (!pop.contains(ev.target) && !more.contains(ev.target)) openPop(false); };
      document.addEventListener('pointerdown', h, true);
      offOutside = () => document.removeEventListener('pointerdown', h, true);
      tmsg.textContent = ''; paintTfs(cell); sel('.bt-tfadd input').focus();
    };
    more.addEventListener('click', () => openPop(pop.hidden));
    pop.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') { openPop(false); more.focus(); } });
    sel('.bt-tfs').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tf]'); if (b) setCell(i, { tf: b.dataset.tf }); });
    sel('.bt-tffav').addEventListener('click', () => { toggleFav(cell.tf); });
    pop.addEventListener('click', (ev) => { const d = ev.target.closest('[data-tfdel]'); if (d) toggleFav(d.dataset.tfdel); });
    sel('.bt-tfadd').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const inp = ev.currentTarget.querySelector('input'), r = checkCustomTf(inp.value, { sec1s: sec1sAt(cell.instrument) });
      if (r.problem) { const why = `${inp.value.trim()}: ${tfProblemText(r.problem)}`; inp.setAttribute('aria-invalid', 'true'); inp.title = why; tmsg.textContent = why; tmsg.classList.add('err'); return; }
      inp.removeAttribute('aria-invalid'); inp.title = ''; tmsg.textContent = ''; tmsg.classList.remove('err');
      setCell(i, { tf: r.tf }); inp.value = ''; openPop(false);
    });
    sel('[data-swc="auto"]').addEventListener('click', () => cell.chart.setAuto(!cell.chart.auto()));
    sel('.swc-draw').addEventListener('click', (ev) => { const o = sel('.swc-tools').classList.toggle('open'); ev.currentTarget.setAttribute('aria-expanded', String(o)); });
    return cell;
  }
  // Buduje wszystkie komórki z doc.layout (po zmianie układu albo instrumentu wykresu); kursor i silnik zostają.
  function buildCells() {
    destroyCells();
    doc.layout = normLayout(doc.layout, sessionInstruments());
    activeIdx = doc.layout.active;
    const grid = $('.bt-grid');
    grid.dataset.kind = doc.layout.kind;
    cells = doc.layout.charts.map((c, i) => makeCell(i, c));
    markActive();
    orders?.refresh();
  }
  function markActive() {
    cells.forEach((c, i) => { c.el.dataset.active = String(i === activeIdx); });
    footTf();
  }
  function activate(i) {
    if (i === activeIdx || !cells[i]) return;
    activeIdx = i;
    doc.layout.active = i;
    markActive();
    paintBar();
    orders?.refresh();
    persist();
  }
  function setCell(i, patch) {
    const c = cells[i];
    if (!c) return;
    if (patch.instrument && patch.instrument !== c.instrument && sessionInstruments().includes(patch.instrument)) {
      doc.layout.charts[i] = { ...doc.layout.charts[i], instrument: patch.instrument };
      activeIdx = i; doc.layout.active = i;
      buildCells(); render(); persist();
      return;
    }
    // 1.6.1: ulubiony 45s albo 7s poza oknem 1s nie włącza się (nierówne świece), tak samo jak w polu „Własny”
    if (patch.tf && tfNeeds1s(patch.tf) && !sec1sAt(c.instrument)) return;
    if (patch.tf && isReplayTf(patch.tf) && patch.tf !== c.tf) {
      c.tf = patch.tf;
      doc.layout.charts[i] = { ...doc.layout.charts[i], tf: c.tf };
      c.builder = createBuilder(streamOf(c.instrument), c.tf);
      c.chart.setTf(c.tf);
      if (i !== activeIdx) { activeIdx = i; doc.layout.active = i; markActive(); }
      paintTfs();
      render(); persist();
    }
  }
  function setLayout(kind) {
    if (!LAYOUTS.includes(kind) || !cells.length || kind === doc.layout.kind) return;
    doc.layout = normLayout({ kind, charts: doc.layout.charts, active: activeIdx }, sessionInstruments());
    try { storage?.setItem(LAYOUT_KEY, JSON.stringify({ kind: doc.layout.kind, charts: doc.layout.charts })); } catch { /* localStorage niedostępny */ }
    buildCells(); render(); persist();
  }
  // K: okno bazowe przesunięte (trim) albo przeładowane (reload): historia wykresów i budowniczowie świec od nowa, kursor bez zmian
  function onData(ev) {
    if (closed || !cells.length || !ev) return;
    dailyMemo.clear();
    for (const c of cells) {
      if (ev.kind === 'trim') { const dr = ev.dropped[symOf(c.instrument)]; c.chart.appendHistory(dr ? aggregate(dr.bars, c.tf) || [] : [], ev.from); }
      // reload: historia od nowa (porcje od nowego początku okna)
      else c.chart.setTf(c.tf);
      c.builder = createBuilder(streamOf(c.instrument), c.tf);
    }
    render();
  }

  // F2: typ dnia w pasku (np. „CPI 8:30”): cechy dnia kursora z indeksu. Nie blokuje replayu; błąd = pusty typ.
  function paintDayType(d) {
    $('.bt-daytype').textContent = '';
    const load = loadFeatures || (async ({ instruments: ins, day: dd }) => ((await client.days({ instruments: ins, from: dd, to: dd, start: doc.def?.startTime || '' })).days || []).find((x) => x.day === dd) || null);
    Promise.resolve().then(() => load({ instruments: sessionInstruments(), day: d })).then((f) => {
      if (closed || curDay !== d) return;
      $('.bt-daytype').textContent = f ? dayTypeLabel(f, doc.def?.filter) : '';
    }).catch(() => { /* bez cech dnia pasek nie pokazuje typu */ });
  }
  // K: dni handlowe i dni z filtra (skoki „Następna sesja NY” i „Następny dzień z filtra”, [U] 31.10.2026 «Filtr jako skok»): indeks cech dnia od daty startu do końca danych
  async function loadSkipDays() {
    try {
      const to = nyDayOf(Number.isFinite(endT) ? endT : cursor + 86400 * 365);
      const ins = sessionInstruments();
      const days = loadDays ? await loadDays({ instruments: ins, from: doc.def.from, to }) : ((await client.days({ instruments: ins, from: doc.def.from, to, start: doc.def?.startTime || '' })).days || []);
      if (closed) return;
      const fams = [...new Set(ins.map((i) => FAMILY[i]))];
      tradingDays = days.filter((f) => fams.some((s) => f.has1m?.[s] === true)).map((f) => f.day).sort();
      filterDays = matchDays({ ...doc.def, to: undefined }, days).days;
    } catch { tradingDays = null; filterDays = null; /* bez indeksu skoki dnia liczą dni robocze */ }
  }

  // ---- kursor ----
  const minCur = () => startCur;
  // przerwa w handlu na którymkolwiek instrumencie sesji pomijana tylko, gdy żaden nie handluje (najwcześniejsza świeca po przerwie)
  function gapTarget(from, to) {
    let best = Infinity;
    for (const k of sessionInstruments()) best = Math.min(best, skipGap(streamOf(k), from, to));
    return Number.isFinite(best) ? best : to;
  }
  // Ustawia kursor w wczytanych danych (synchronicznie): silnik, render, zapis. Dalsze dane doładowują się w tle.
  function setCursor(c) {
    let nc = Math.min(endT, Math.max(minCur(), c));
    if (!data.covers(nc)) nc = Math.max(cursor, Math.min(nc, data.baseTo()));
    const newsBefore = visibleNews(data.news(), cursor).length;
    cursor = nc;
    advanceAll();
    if (visibleNews(data.news(), cursor).length !== newsBefore) for (const x of cells) x.chart.newsChanged();
    render();
    persist();
    prefetch();
    if (cursor >= endT) { pause(); msg(t('Koniec danych.')); }
  }
  let prefetching = null;
  function prefetch() {
    if (prefetching || closed) return;
    prefetching = data.ensure(cursor).then((ev) => { if (ev) onData(ev); }).catch((e) => { if (!closed) msg(t('Nie udało się wczytać świec: {msg}', { msg: e?.message || '' })); }).finally(() => { prefetching = null; });
  }
  // Przejście do chwili c (kroki, skoki, „Wróć”): dane do c wczytane przed ruchem. Skok w przód z pozycją albo zleceniem idzie przez dane porcjami (silnik widzi każdą
  // świecę po drodze); bez nich (i przy cofaniu) okno przeładowuje się od razu wokół celu.
  let moving = false;
  // cel w środku przerwy (np. +15 min w weekend): na pierwszą świecę po przerwie; cel na końcu świecy przed przerwą zostaje
  const landing = (t) => Math.min(endT, gapTarget(t - 1, t));
  async function goTo(c) {
    if (moving || !data) return false;
    let target = Math.min(endT, Math.max(minCur(), c));
    // szybka ścieżka (synchronicznie, bez czekania): cel w wczytanym oknie, więc silnik widzi każdą świecę po drodze
    if (target >= data.baseFrom() && data.covers(target)) { setCursor(landing(target)); return true; }
    moving = true;
    try {
      if (prefetching) await prefetching;
      if (target > cursor && busy() && target > (doc.book.hw || 0)) {
        while (cursor < target && !closed) {
          const ev = await data.ensure(cursor);
          if (ev) onData(ev);
          const next = Math.min(target, data.baseTo());
          if (next <= cursor) break;
          cursor = next; advanceAll();
        }
      } else {
        const ev = await data.ensure(target);
        if (ev) onData(ev);
      }
      if (closed) return false;
      target = Math.min(target, data.baseTo() >= data.last() ? endT : data.baseTo());
      setCursor(landing(target));
      return true;
    } finally { moving = false; }
  }

  function step(dir) {
    if (!cells.length || moving) return Promise.resolve(false);
    pause();
    const k = curInst();
    const t1 = stepCursor(cursor, dir, curTf(), streamOf(k), data.real1s(k), { min: minCur(), max: endT });
    return goTo(t1);
  }

  let playAt = NaN;
  function loop(ts) {
    if (!playing) return;
    const dt = lastTs ? Math.min(MAX_DT, Math.max(0, ts - lastTs) / 1000) : 0;
    // M poprawki (C1): znacznik czasu pierwszej klatki bywa sprzed kliknięcia (klatka zaczęła się w trakcie długiego zadania przed startem),
    // wtedy kursor doliczał czas tego zadania (np. 100 ms × 100 = 10 s); start liczony od chwili kliknięcia
    lastTs = !lastTs && Number.isFinite(playAt) && ts < playAt && playAt - ts < 1000 ? playAt : ts;
    if (dt > 0 && !moving) {
      const want = cursor + speed * dt;
      setCursor(gapTarget(cursor, want));
    }
    if (cursor >= endT) { pause(); return; }
    rafId = raf(loop);
  }
  function play() {
    if (!cells.length || playing || cursor >= endT) return;
    playing = true; lastTs = 0; playAt = globalThis.performance?.now?.() ?? NaN; msg('');
    $('[data-bt="play"]').setAttribute('aria-pressed', 'true'); $('[data-bt="play"]').textContent = t('Pauza');
    rafId = raf(loop);
  }
  function pause() {
    if (!playing) return;
    playing = false; caf(rafId); rafId = 0;
    $('[data-bt="play"]').setAttribute('aria-pressed', 'false'); $('[data-bt="play"]').textContent = t('Odtwarzaj');
    persist();
  }

  // interwał aktywnego wykresu (lista w pasku); interwał dowolnego wykresu zmienia się w jego nagłówku
  function setTf(next) { if (cells.length) setCell(activeIdx, { tf: next }); }

  // ---- skoki (§8): lista przy pasku + skróty ----
  // skróty z Ustawień w pamięci (panel zleceń czyta je przy każdej klatce odtwarzania); odświeżane przy zmianie ustawień (refreshJumps)
  let skrotyNow = {};
  function fillJumps() {
    const sel = $('.bt-jump'), c = cfg();
    skrotyNow = c.skroty;
    let want = '';
    try { want = storage?.getItem(JUMP_KEY) || ''; } catch { /* localStorage niedostępny */ }
    sel.innerHTML = c.jumps.map((j) => '<option value="' + esc(j.id) + '">' + esc(t(j.name)) + (j.skrot ? ' (' + esc(j.skrot) + ')' : '') + '</option>').join('');
    if (c.jumps.some((j) => j.id === want)) sel.value = want;
    // M: menu skoków: wybór w menu skacze od razu i zostaje skokiem przycisku (oraz skrótu „skok wybrany na liście”)
    $('.bt-jump-l').innerHTML = c.jumps.map((j) => `<button type="button" role="menuitem" data-jumpid="${esc(j.id)}"><span>${esc(t(j.name))}</span>${j.skrot ? `<kbd class="bt-kbd">${esc(skrotLabel(j.skrot))}</kbd>` : ''}</button>`).join('');
    paintJumpBtn();
    paintHints();
  }
  function paintJumpBtn() {
    const j = jumpById($('.bt-jump').value), b = $('[data-bt="jump"]');
    $('.bt-jump-n').textContent = j ? t(j.name) : '';
    b.disabled = !j;
    b.title = hintOf(t('Skocz: {name}', { name: j ? t(j.name) : '' }), cfg().skroty.jump);
    b.setAttribute('aria-keyshortcuts', cfg().skroty.jump || '');
    el.querySelectorAll('.bt-jump-l [data-jumpid]').forEach((x) => x.setAttribute('aria-current', String(x.dataset.jumpid === j?.id)));
  }
  function jumpMenu(open) {
    const l = $('.bt-jump-l'), b = $('[data-bt="jumpmenu"]');
    l.hidden = !open; b.setAttribute('aria-expanded', String(open));
    if (open) (l.querySelector('[aria-current="true"]') || l.querySelector('button'))?.focus();
  }
  // M (31.10.2026): skróty widoczne w podpowiedziach (title) i dla czytników (aria-keyshortcuts), zawsze z bieżących Ustawień → Backtest
  function paintHints() {
    const sk = cfg().skroty;
    const hint = (sel, label, k) => { const b = $(sel); if (!b) return; b.title = hintOf(label, k); if (k) b.setAttribute('aria-keyshortcuts', k); else b.removeAttribute('aria-keyshortcuts'); };
    hint('[data-bt="play"]', t('Odtwarzaj / pauza'), sk.play);
    hint('[data-bt="step"]', t('Krok w przód o świecę aktywnego wykresu'), sk.stepFwd);
    hint('[data-bt="back"]', t('Krok wstecz'), sk.stepBack);
    $('.bt-speed').title = `${t('Szybkość odtwarzania')}: ${hintOf(t('wolniej'), sk.speedDown)}, ${hintOf(t('szybciej'), sk.speedUp)}`;
    const todo = $('.bt-todo');
    if (todo) todo.title = t("Trade'y bez opisu: wybierz, żeby otworzyć Journal (Ctrl+J: ostatni zamknięty)");
    orders?.refresh();
  }
  async function newsAhead() {
    const have = data.news();
    if (have.some((e) => e.t > cursor)) return have;
    try { const r = await (loadNews ? loadNews({ from: cursor, to: cursor + NEWS_AHEAD_SEC }) : client.news({ from: cursor, to: cursor + NEWS_AHEAD_SEC })); return [...have, ...(r?.events || [])]; } catch { return have; }
  }
  async function runJump(j) {
    if (!j || !cells.length || moving) return false;
    pause(); msg('');
    if ((j.cel?.kind === 'nextDay' || j.cel?.kind === 'filterDay' || j.cel?.kind === 'time') && tradingDays == null) await loadSkipDays();
    let news = data.news();
    if (j.cel?.kind === 'news' && !nextNews(news, cursor, j.cel.minImp)) news = await newsAhead();
    const tg = jumpTarget(j, { cursor, startTime: doc.def?.startTime || '09:00', news, tradingDays, filterDays, max: endT });
    if (!tg) { msg(j.cel?.kind === 'filterDay' ? t('Nie ma dalej dnia z filtra.') : t('Nie ma dokąd skoczyć przed końcem danych.')); return false; }
    return goTo(tg.cursor);
  }
  const jumpById = (id) => cfg().jumps.find((j) => j.id === id);

  // ---- klawiatura ----
  const norm = (x) => String(x || '').trim().toUpperCase();
  function setSpeedVal(v) {
    speed = v;
    el.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.speed) === v)));
  }
  function onKey(ev) {
    if (closed || !el.isConnected) return;
    // L: otwarty Journal ma własne klawisze, skróty replayu czekają na jego zamknięcie
    if (jw) return;
    // L: Ctrl+J (jak w FX Replay) otwiera Journal ostatniego zamkniętego trade'a (albo trade'a z szybkiego panelu); skrót zarezerwowany (RESERVED_SKROTY)
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && String(ev.key).toLowerCase() === 'j') {
      ev.preventDefault(); ev.stopImmediatePropagation();
      // M: Ctrl+J z pola setupu szybkiego panelu zabiera wpisany setup do okna (wcześniej ginął)
      if (!ev.repeat) { const id = journal?.id || lastClosedId(), setup = journal?.ui?.el?.querySelector('[name="setup"]')?.value.trim() || ''; if (id) openJournalWin(id, { setup: journal?.id === id ? setup : '' }); else msg(t('Journal otwiera się po zamknięciu trade\'a.')); }
      return;
    }
    const tg = ev.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return; // notatka journalingu i pola panelu
    // M (31.10.2026): Enter przy otwartym szybkim panelu przenosi do pola setupu i zatrzymuje odtwarzanie (droga z klawiatury bez myszy); Enter jest zarezerwowany, więc nie koliduje
    if (ev.key === 'Enter' && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey && journal?.ui?.isOpen?.() && !(tg && tg.closest?.('button, a, [role="slider"], [role="menuitem"]'))) {
      const inp = journal.ui.el.querySelector('[name="setup"]');
      if (inp) { ev.preventDefault(); ev.stopImmediatePropagation(); pause(); inp.focus(); return; }
    }
    const sk = norm(skrotOf(ev));
    if (!sk) return;
    // Spacja na przycisku robi swoje, z jednym wyjątkiem: „Cofnij” w powiadomieniu ignoruje Spację (decyzja 2026-11-02, wariant a), więc w replayu znaczy ona „graj” jak bez fokusu
    if (sk === 'SPACE' && tg && (tg.tagName === 'BUTTON' || tg.tagName === 'A') && !tg.closest?.('.toast-act')) return;
    const c = cfg();
    const action = Object.entries(c.skroty).find(([, v]) => norm(v) === sk)?.[0];
    const jmp = action ? null : c.jumps.find((j) => norm(j.skrot) === sk);
    if (!action && !jmp) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (ev.repeat && action !== 'stepFwd' && action !== 'stepBack') return; // przytrzymany klawisz nie mnoży zleceń ani skoków
    if (!cells.length) return;
    if (jmp) { runJump(jmp); return; }
    switch (action) {
      case 'play': if (playing) pause(); else play(); break;
      case 'stepFwd': step(1); break;
      case 'stepBack': step(-1); break;
      case 'jump': runJump(jumpById($('.bt-jump').value)); break;
      case 'speedUp': case 'speedDown': {
        const i = SPEEDS.indexOf(speed), n = Math.min(SPEEDS.length - 1, Math.max(0, i + (action === 'speedUp' ? 1 : -1)));
        setSpeedVal(SPEEDS[n]); break;
      }
      case 'buy': case 'sell': orders?.submit(action); break;
      case 'closeAll': orders?.closeAll(); break;
      case 'drawEntry': orders?.fromDrawing(); break; // J: wejście według zaznaczonego rysunku
      // M (31.10.2026): BE i zamknięcie połowy pozycji instrumentu aktywnego wykresu z klawiatury (te same akcje co BE i 50% w szufladzie)
      case 'be': if (doc.book.positions[curInst()]) orders?.beFor(curInst()); else msg(t('Brak otwartej pozycji.')); break;
      case 'half': if (doc.book.positions[curInst()]) orders?.closePct(curInst(), 50); else msg(t('Brak otwartej pozycji.')); break;
      default: break;
    }
  }
  globalThis.addEventListener?.('keydown', onKey, true);

  function failed(e) {
    state(e?.code === 'corrupt' ? t('Plik tej sesji jest uszkodzony i nie da się go otworzyć.') : t('Nie udało się wczytać świec replayu: {msg}', { msg: e?.message || '' }));
  }

  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.speed) { setSpeedVal(Number(b.dataset.speed)); return; }
    if (b.dataset.jumpid) {
      const sel = $('.bt-jump');
      sel.value = b.dataset.jumpid;
      try { storage?.setItem(JUMP_KEY, sel.value); } catch { /* localStorage niedostępny */ }
      paintJumpBtn(); jumpMenu(false);
      runJump(jumpById(sel.value));
      return;
    }
    if (b.dataset.todo) { const x = (doc.trades || []).find((y) => y.id === b.dataset.todo); $('.bt-todo-l').hidden = true; $('.bt-todo').setAttribute('aria-expanded', 'false'); if (x) openJournal(x); return; }
    if (b.closest('.bt-dock')) return; // szuflada ma własny nasłuch (bt-szuflada.js)
    if (b.dataset.layout) { setLayout(b.dataset.layout); return; }
    switch (b.dataset.bt) {
      case 'back': step(-1); break;
      case 'step': step(1); break;
      case 'msgmore': { const open = $('.bt-msg').classList.toggle('open'); b.setAttribute('aria-expanded', String(open)); b.textContent = open ? t('mniej') : t('więcej'); break; }
      case 'play': if (playing) pause(); else play(); break;
      case 'stats': if (onStats) onStats(sessionId); break;
      case 'notion': sendNotion({ all: true }); break;
      case 'todo': { const l = $('.bt-todo-l'); l.hidden = !l.hidden; b.setAttribute('aria-expanded', String(!l.hidden)); break; }
      case 'jump': runJump(jumpById($('.bt-jump').value)); break;
      case 'jumpmenu': jumpMenu($('.bt-jump-l').hidden); break;
      case 'reopen': { const sid = sessionId; close(); onReopen(sid); break; }
      case 'close': close(); break;
      default: break;
    }
  });
  $('.bt-tf').addEventListener('change', (ev) => setTf(ev.target.value));
  $('.bt-jump').addEventListener('change', (ev) => { try { storage?.setItem(JUMP_KEY, ev.target.value); } catch { /* localStorage niedostępny */ } paintJumpBtn(); });
  // menu skoków: Escape zamyka, strzałki przechodzą po pozycjach, klik poza menu zamyka
  $('.bt-jump-l').addEventListener('keydown', (ev) => {
    const items = [...el.querySelectorAll('.bt-jump-l [data-jumpid]')], i = items.indexOf(document.activeElement);
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); jumpMenu(false); $('[data-bt="jumpmenu"]').focus(); }
    else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); ev.stopPropagation(); items[(i + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
  });
  el.addEventListener('pointerdown', (ev) => { if (!$('.bt-jump-l').hidden && !ev.target.closest('.bt-jumpw')) jumpMenu(false); });
  fillJumps();
  const onHide = () => { if (doc && !stale) { syncDrawings(); doc.cursor = cursor; client.flush({ keepalive: true }).catch(() => {}); } };
  globalThis.addEventListener?.('pagehide', onHide);

  function close() {
    if (closed) return;
    closed = true;
    pause();
    jw?.close(); jw = null;
    dock?.destroy(); dock = null;
    clearInterval(notionTimer); notionTimer = 0;
    globalThis.removeEventListener?.('pagehide', onHide);
    globalThis.removeEventListener?.('keydown', onKey, true);
    orders?.destroy(); orders = null;
    try { storage?.removeItem(OPEN_KEY); } catch { /* localStorage niedostępny */ }
    syncDrawings(); // rysunki z ostatnich 120 ms trafiają do pliku sesji razem ze stanem
    if (doc && !stale) { doc.cursor = cursor; client.save(doc, { now: true }).catch(() => {}); }
    client.setOnError?.(null);
    destroyCells();
    el.remove();
    onClose();
  }

  async function start() {
    state(t('Wczytuję świece…'));
    const instruments = sessionInstruments();
    startCur = nyAt(doc.def.from, doc.def?.startTime || '09:00');
    const saved = Number(doc.cursor);
    const c0 = Number.isFinite(saved) && saved >= startCur ? saved : startCur;
    data = createReplayData({
      instruments,
      fetchRange: loadRange || ((q) => client.range(q)),
      fetchBounds: loadBounds || ((ins) => client.bounds(ins)),
    });
    const b = await data.init(c0);
    if (closed) return;
    endT = Number.isFinite(b?.last) ? b.last : Infinity;
    cursor = Math.min(c0, endT);
    if (!Number.isFinite(b?.last)) { state(t('Brak świec dla instrumentów tej sesji. Klucz Databento i import historii są w Ustawieniach → Źródła danych.')); return; }
    state('');
    LWC ||= await loadLwc();
    D ||= await loadDraw();
    if (closed) return;
    store ||= createDrawingStore({ getSession: () => doc, save: () => persist() });
    doc.book ||= emptyBook();
    buildCells();
    advanceAll();
    const hub = {
      // pozycje i zlecenia rysują się na każdym wykresie swojego instrumentu; edycja SL/TP wraca z nazwą instrumentu wykresu, na którym ją zrobiono
      setTradingFor(k, st) { for (const c of cells) if (c.instrument === k) c.chart.setTrading(st); },
      onPositionEdit(fn) { posEditFn = fn; for (const c of cells) c.chart.onPositionEdit(fn ? (pr) => fn(pr, c.instrument) : null); },
    };
    orders = mountOrders($('.bt-ordhost'), {
      getBook: () => doc.book, setBook, onCommit: () => { persist({ now: true }); computeAccount(); paintBar(); paintDock(); }, getLast: last,
      lock: () => (stale ? t('Sesja zmieniła się w innej karcie. Otwórz ją ponownie.') : ''), getCursor: () => cursor, instrument: () => curInst(), instruments: () => sessionInstruments(), chart: hub, onEvent: onEngine,
      // [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 2: ryzyko % od bieżącego salda, wybór w kreatorze)
      risk: () => ({ ...(doc.def?.risk || { mode: 'usd', value: 0 }), balance: riskBalance({ def: doc.def, trades: doc.trades, book: doc.book }) }),
      // J (Zakres B): zaznaczony rysunek pozycji na aktywnym wykresie (instrument wykresu = instrument zlecenia) i jego usunięcie po złożeniu zlecenia
      getDrawing: () => cur()?.chart.rysunki?.()?.selectedPosition() || null,
      // przegląd J P2-1: dokument rysunków bez rysunku trafia do sesji od razu (w pamięci), więc onCommit zapisuje zlecenie i usunięcie jednym zapisem
      useDrawing: (d) => {
        const c = cur(), r = c?.chart.rysunki?.();
        if (!r) return;
        r.removeDrawing(d.id);
        const dd = r.currentDoc();
        c.sig = JSON.stringify(dd.d);
        store?.set(c.instrument, dd, { origin: c, persist: false });
      },
      onReturn: () => { pause(); goTo(doc.book.hw); },
      // M: skróty w podpowiedziach Kup/Sprzedaj/BE/Zamknij i pamięć SL/TP (przeglądarka)
      getSkroty: () => skrotyNow, storage,
    });
    // L: szuflada pozycji, zleceń i historii (K zostawił miejsce `.bt-dock`)
    dock = mountDock($('.bt-dock'), {
      storage,
      onAction: (kind, { instrument: k, id }) => {
        if (kind === 'journal') { openJournalWin(id); return; }
        if (kind === 'delete') { deleteTrade(id); return; }
        if (!orders) return;
        if (kind === 'be') orders.beFor(k);
        else if (kind === 'half') orders.closePct(k, 50);
        else if (kind === 'close') orders.closeAll(k);
        else if (kind === 'cancel') orders.cancel(id);
      },
    });
    render();
    paintHints();
    persist();
    loadSkipDays();
  }

  const ready = (async () => {
    try { storage?.setItem(OPEN_KEY, sessionId); } catch { /* localStorage niedostępny */ }
    client.setOnError?.(onSaveError);
    // K: sesja v1 z 1.5.0 otwiera się w modelu v2 ([U] 31.10.2026 «Przenieś»)
    doc = migrateSession(await client.load(sessionId));
    // nowa sesja (jeszcze nigdy nie otwarta) dostaje ostatni użyty układ wykresów (D1)
    if (!doc.opened && doc.layout?.kind === '1' && (doc.layout.charts?.length ?? 1) <= 1) {
      try {
        const s = JSON.parse(storage?.getItem(LAYOUT_KEY) || 'null');
        if (s && LAYOUTS.includes(s.kind)) doc.layout = { ...doc.layout, kind: s.kind, charts: [...(doc.layout.charts || []), ...(Array.isArray(s.charts) ? s.charts.slice((doc.layout.charts || []).length) : [])] };
      } catch { /* zły wpis: zostaje układ z sesji */ }
    }
    doc.opened = new Date(now()).toISOString();
    await start();
    if (!closed && notionEveryMs > 0) notionTimer = setInterval(notionTick, notionEveryMs);
  })().catch((e) => { if (!closed) failed(e); throw e; });
  ready.catch(() => {});

  return {
    close, ready,
    cursor: () => cursor,
    chart: () => cur()?.chart ?? null,
    charts: () => cells.map((c) => c.chart),
    activeIndex: () => activeIdx,
    activate, setLayout, setCell,
    drawings: () => store,
    doc: () => doc,
    data: () => data,
    sendNotion,
    goTo,
    accountState: () => (doc ? computeAccount() : null),
    dock: () => dock, journalWindow: () => jw, openJournalWindow: (id) => openJournalWin(id),
    play, pause, step, setTf, setSpeed: setSpeedVal, runJump: (id) => runJump(jumpById(id)), runJumpDef: (j) => runJump(j), refreshJumps: fillJumps,
    busy: () => moving || !!prefetching,
    book: () => doc?.book, orders: () => orders, speed: () => speed, journal: () => journal?.ui ?? null, openJournal: (id) => { const x = (doc?.trades || []).find((y) => y.id === id); if (x) openJournal(x); },
  };
}
