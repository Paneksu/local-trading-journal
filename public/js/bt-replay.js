// Ekran replayu modułu Backtest (1.5.0, pakiety C1 i D1): pełnoekranowa warstwa .bt-screen nad dashboardem, układ 1, 2h, 2v albo 4 wykresów na jednym zegarze, pasek górny i sterowanie.
// Kursor C (sekundy UTC) jest jedynym zegarem: świece widoczne liczy bt-swieca.js (t + len ≤ C), więc żaden widok nie dostaje przyszłości.
// Krok = jedna świeca aktywnego TF (nextCursor z bt-czas.js), odtwarzanie przez requestAnimationFrame: na klatkę C += szybkość × dt i jeden render.
// Stan sesji (dzień, kursor, TF) zapisuje bt-klient.js z opóźnieniem 1 s, przy pagehide z keepalive; po przeładowaniu kursor i dzień są te same.
// Sesja z kolejnością losową ukrywa datę dnia (pasek i oś czasu) do „Zakończ dzień”. Journaling i Zakończ dzień w pełni: E1.
// C2: zlecenia (panel bt-zlecenia.js, silnik bt-wypelnienia.js), skoki z listy i skróty. Silnik dostaje kursor po każdym przesunięciu (advance dla instrumentów z pozycją albo
// zleceniem; dla pozostałych tylko znak wodny), każde zdarzenie silnika zapisuje sesję od razu. Skróty: jeden nasłuch keydown w fazie capture na window, zarejestrowany
// przed rysunkami (te dochodzą później), więc stopImmediatePropagation na obsłużonym skrócie wystarcza; Escape, Ctrl+Z i strzałki zostają rysunkom (RESERVED_SKROTY).
// D1: każdy wykres ma własny instrument i interwał (nagłówek komórki), wszystkie czytają ten sam kursor; krok liczy aktywny wykres (ramka, klik), zlecenia idą na jego instrument,
// pozycje rysują się na każdym wykresie swojego instrumentu (huby setTradingFor/onPositionEdit), wspólny krzyżyk czasu to linia na pozostałych wykresach (bez ruchu kursora).
// Rysunki: bt-rysunki.js (magazyn w pliku sesji, per rodzina instrumentu i dzień), pasek narzędzi rysunki.js na każdym wykresie, zmiana na jednym wykresie odświeża pozostałe tego instrumentu.
// E1: po pełnym zamknięciu pozycji trade trafia do pliku sesji od razu (toTrade z bt-journal.js, z migawką rysunków), a w rogu wykresu instrumentu otwiera się opcjonalny panel
// journalingu (setup + notatka); replay nigdy na niego nie czeka. Lista „do uzupełnienia” w pasku. „Zakończ dzień” (endDay): pytanie o otwartą pozycję, zamknięcie po cenie kursora
// ('eod'), anulowanie zleceń, status done; „Następny dzień” przechodzi do kolejnego dnia z puli, po ostatnim jest ekran „Sesja ukończona”.
// E2: licznik „Niezapisane w Notion: N” w pasku i przycisk „Zapisz do Notion” (wszystkie zaległe, także bez opisu i z błędem); „Zakończ dzień” wysyła trade'y dnia;
// zaległe opisane trade'y ponawiane co 60 s przy otwartym ekranie (429, brak sieci). Stan wysyłki (trade.notion) należy do serwera, ekran tylko go pokazuje.
// English: full-screen replay: one or more charts driven by a single cursor, step and rAF playback, debounced session persistence, hidden date for random order; orders, jumps and keyboard shortcuts (C2); journaling panel and end-of-day (E1).
import { t } from './i18n.js';
import { esc, fmtR, WEEKDAYS, weekdayIdx, shortDate } from './format.js';
import { mergeBase, createBuilder, REPLAY_TFS, visibleCount } from './bt-swieca.js';
import { nyAt, nextCursor, visibleNews, jumpTarget, skrotOf, sanitizeBt } from './bt-czas.js';
import { emptyBook, advance, closeAll } from './bt-wypelnienia.js';
import { toTrade, mountJournal, todoOf, setupSuggestions } from './bt-journal.js';
import { isUnsent, needsUpdate } from './bt-notion.js';
import { mountOrders, rejectText } from './bt-zlecenia.js';
import { createSessionClient } from './bt-klient.js';
import { createReplayChart } from './bt-wykres.js';
import { createDrawingStore, symOf } from './bt-rysunki.js';
import { confirmDialog } from './modal.js';
import { LWC_URL, DRAW_URL, readColors } from './wykres.js';
import { dayTypeLabel } from './bt-filtr-widok.js';
import { chartTz, fmtIn } from './podglad.js';
import { aggregate, parseTf, sessionBounds } from './swiece.js';

export const SPEEDS = [1, 10, 60, 100, 300];
export const DEFAULT_SPEED = 100;
export const OPEN_KEY = 'thq.bt.open.v1'; // otwarta sesja: po przeładowaniu strony zakładka Backtest otwiera ją ponownie
export const JUMP_KEY = 'thq.bt.jump.v1'; // wybrany skok z listy (preferencja przeglądarki)
export const NOTION_RETRY_MS = 60_000; // E2: ponawianie zaległej wysyłki do Notion przy otwartym ekranie replayu
export const LAYOUT_KEY = 'thq.bt.layout.v1'; // ostatni układ wykresów: dostaje go nowa sesja (D1)
const LAYOUTS = ['1', '2h', '2v', '4'];
const CELLS = { 1: 1, '2h': 2, '2v': 2, 4: 4 };
const GEAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

// Układ z sesji (albo z localStorage) sprowadzony do poprawnego: tyle wykresów, ile pokazuje układ, instrumenty tylko z puli sesji, interwały z REPLAY_TFS.
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
      tf: REPLAY_TFS.includes(c?.tf) ? c.tf : (REPLAY_TFS.includes(tfPrev) ? tfPrev : '1m'),
    });
  }
  const active = Number.isInteger(layout?.active) && layout.active >= 0 && layout.active < charts.length ? layout.active : 0;
  return { kind, charts, active };
}
// Zakończenie dnia (E1, 18a.3): czysta funkcja na dokumencie sesji, zwraca NOWY dokument (płytka kopia), oryginał zostaje nietknięty.
// Otwarta pozycja → pytanie „Zamknąć po bieżącej cenie?” ([U] tak = closeAll 'eod' po cenie i czasie kursora, trade'y zapisane jako 'todo'; nie = dzień się nie kończy).
// Oczekujące zlecenia są anulowane (zdarzenia 'cancelled'), dzień dostaje status 'done'. Odmowa silnika (np. przeglądanie wstecz) przerywa całość bez zmian: { ended: false, reason }.
// last(k) = { t, price } instrumentu k, streamOf(k) = strumień bazowy (MAE/MFE), snapshot(k, day) = migawka rysunków, contractOf(k) = kontrakt.
export async function endDay(session, { last, confirm = (o) => confirmDialog(o), streamOf = () => null, contractOf = () => null, snapshot = () => null, day = null } = {}) {
  const d = day ?? session.pool?.[session.dayIdx];
  const book0 = session.book || emptyBook();
  const openKeys = Object.keys(book0.positions || {}).filter((k) => book0.positions[k]);
  if (openKeys.length) {
    const ok = await confirm({ title: t('Zakończyć dzień?'), text: t('Masz otwartą pozycję. Zamknąć po bieżącej cenie?'), ok: t('Zamknij i zakończ dzień'), cancel: t('Anuluj') });
    if (!ok) return { session, closed: [], events: [], ended: false, reason: null };
  }
  let book = session.book || emptyBook();
  const trades = [...(session.trades || [])], closed = [], events = [];
  const insts = new Set([...Object.keys(book.positions || {}).filter((k) => book.positions[k]), ...(book.orders || []).map((o) => o.instrument)]);
  for (const k of insts) {
    const r = closeAll(book, k, last(k), 'eod');
    const bad = r.events.find((e) => e.type === 'rejected');
    if (bad) return { session, closed: [], events: [], ended: false, reason: bad.reason };
    book = r.book;
    for (const ev of r.events) {
      events.push(ev);
      if (ev.type !== 'closed') continue;
      const tr = toTrade(ev.position, { day: d, contract: contractOf(k), stream: streamOf(k), drawings: snapshot(k, d), trades });
      trades.push(tr); closed.push(tr);
    }
  }
  const out = { ...session, book, hw: book.hw ?? session.hw, trades, days: { ...(session.days || {}), [d]: { ...(session.days?.[d] || {}), status: 'done' } } };
  return { session: out, closed, events, ended: true, reason: null };
}

const MAX_DT = 0.25; // s: po powrocie do karty odtwarzanie nie przeskakuje o całą przerwę

const inside = (ranges, c) => (ranges || []).some(([a, b]) => c >= a && c < b);
const closeIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

function dayLabel(day) {
  // H2 (ocena wyglądu #7, ta sama klasa co lista sesji): data dnia w języku aplikacji, nie przeglądarki („Wt, 12 mar 2024”)
  return `${WEEKDAYS[weekdayIdx(day)]}, ${shortDate(day)} ${day.slice(0, 4)}`;
}

// openReplay(root, { sessionId }) → { close(), ready, cursor() }. loadDay i loadLwc podmienia strona testowa (ReplayDay z window.__btDay).
export function openReplay(root, { sessionId, client = createSessionClient(), loadDay = null, loadFeatures = null, loadLwc = () => import(LWC_URL), loadDraw = () => import(DRAW_URL).catch(() => null), getSettings = () => sanitizeBt(null), getSetups = () => [], confirm = (o) => confirmDialog(o), onStats = null, onClosed = () => {}, onReopen = () => {}, onClose = () => {}, notionEveryMs = NOTION_RETRY_MS, storage = globalThis.localStorage, raf = (f) => globalThis.requestAnimationFrame(f), caf = (id) => globalThis.cancelAnimationFrame(id), now = () => Date.now() } = {}) {
  const el = document.createElement('div');
  el.className = 'bt-screen';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', t('Replay backtestu'));
  const speed0 = sanitizeBt(getSettings()).speed;
  const speedBtns = SPEEDS.map((s) => `<button type="button" data-speed="${s}" aria-pressed="${s === speed0}">${s}×</button>`).join('');
  const layoutBtns = LAYOUTS.map((l) => `<button type="button" data-layout="${l}" aria-pressed="${l === '1'}">${esc(l)}</button>`).join('');
  el.innerHTML = `
    <header class="bt-top">
      <div class="bt-ttl"><b class="bt-name"></b><span class="bt-dayn"></span><span class="bt-date"></span><span class="bt-clock"></span><span class="bt-daytype"></span></div>
      <div class="bt-stats"><span class="bt-res"></span><span class="bt-notion" role="status"></span><button type="button" class="btn sm" data-bt="notion">${esc(t('Zapisz do Notion'))}</button><span class="bt-todo-w"><button type="button" class="btn sm bt-todo" data-bt="todo" aria-expanded="false" hidden></button><div class="bt-todo-l" role="menu" hidden></div></span></div>
      <div class="seg sm bt-layout" role="group" aria-label="${esc(t('Układ wykresów'))}">${layoutBtns}</div>
      <button type="button" class="btn sm primary" data-bt="end-day">${esc(t('Zakończ dzień'))}</button>
      <button type="button" class="icon-btn" data-bt="close" aria-label="${esc(t('Zamknij replay'))}">${closeIcon}</button>
    </header>
    <div class="bt-charts"><div class="bt-chart"><div class="bt-grid" data-kind="1"></div></div><div class="bt-state empty" hidden></div>
      <div class="bt-fin card" role="status" hidden><h3>${esc(t('Sesja ukończona'))}</h3><p class="muted bt-fin-s"></p><div class="bt-fin-b"><button type="button" class="btn primary" data-bt="stats">${esc(t('Statystyki'))}</button><button type="button" class="btn" data-bt="fin-close">${esc(t('Zamknij replay'))}</button></div></div></div>
    <div class="bt-stale note" role="alert" hidden><span>${esc(t('Sesja zmieniła się w innej karcie. Otwórz ją ponownie.'))}</span> <button type="button" class="btn sm" data-bt="reopen">${esc(t('Otwórz ponownie'))}</button></div>
    <div class="bt-ordhost"></div>
    <footer class="bt-ctl">
      <button type="button" class="btn sm" data-bt="back" aria-label="${esc(t('Krok wstecz'))}">◀</button>
      <button type="button" class="btn sm primary" data-bt="play" aria-pressed="false">${esc(t('Odtwarzaj'))}</button>
      <button type="button" class="btn sm" data-bt="step" aria-label="${esc(t('Krok w przód'))}">▶</button>
      <div class="seg sm bt-speed" role="group" aria-label="${esc(t('Szybkość odtwarzania'))}">${speedBtns}</div>
      <label class="bt-tfl"><span class="lbl">${esc(t('Interwał'))}</span><select class="sp-in sp-sel bt-tf" data-bt="tf">${REPLAY_TFS.map((x) => `<option value="${x}">${x}</option>`).join('')}</select></label>
      <label class="bt-tfl"><span class="lbl">${esc(t('Skok'))}</span><select class="sp-in sp-sel bt-jump" data-bt="jumpsel" aria-label="${esc(t('Wybrany skok'))}"></select></label><button type="button" class="btn sm" data-bt="jump">${esc(t('Skocz'))}</button>
      <span class="note bt-msg" role="status"></span>
    </footer>`;
  root.appendChild(el);
  const $ = (s) => el.querySelector(s);

  let doc = null, rd = null, LWC = null, D = null, cursor = 0, startCur = 0, speed = speed0, orders = null, streams = {}, stale = false, store = null;
  let cells = [], activeIdx = 0, posEditFn = null, endT = 0, endPrompted = false;
  let playing = false, rafId = 0, lastTs = 0, closed = false, colors = null, sendingNotion = false, notionTimer = 0;
  const day = () => doc?.pool?.[doc.dayIdx];
  const dayState = () => (doc.days ||= {})[day()] || null;
  const hidden = () => doc?.def?.order === 'random' && dayState()?.status !== 'done';
  const msg = (s) => { $('.bt-msg').textContent = s || ''; };
  // aktywny wykres: jego instrument dostaje zlecenia, jego interwał wyznacza krok
  const cur = () => cells[activeIdx] || cells[0] || null;
  const curInst = () => cur()?.instrument || '';
  const curTf = () => cur()?.tf || '1m';
  const sessionInstruments = () => (doc?.def?.instruments?.length ? doc.def.instruments : ['NQ']);
  // 409 stale (sesja zmieniona w innej karcie) to osobny stan: handel stoi, zapisy ustają, komunikat z przyciskiem „Otwórz ponownie”; inne błędy to zwykły komunikat
  function onSaveError(e) {
    if (closed) return;
    if (e?.code === 'stale') { stale = true; pause(); $('.bt-stale').hidden = false; msg(''); orders?.refresh(); }
    else if (e?.code === 'corrupt') msg(t('Plik tej sesji jest uszkodzony, więc zmiany nie są zapisywane. Zamknij replay i otwórz sesję ponownie.'));
    else msg(t('Nie udało się zapisać stanu sesji. Sprawdź, czy dashboard działa.'));
  }
  const persist = (opts) => { if (doc && !stale) { doc.cursor = cursor; client.save(doc, opts).catch(onSaveError); } };

  const cfg = () => sanitizeBt(getSettings());
  const streamOf = (k) => (streams[k] ||= (rd.inst[k] ? mergeBase(rd.inst[k].m1, rd.inst[k].s1, rd.inst[k].real1s) : null));
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
  const hasOpen = () => Object.values(doc.book.positions).some(Boolean);
  function setBook(b) { doc.book = b; doc.hw = b.hw; } // zapis robi wywołujący raz po wszystkich zmianach (book + trade w jednym zapisie)
  // zdarzenie silnika → trade sesji (tylko 'closed' = pełne zamknięcie pozycji): toTrade z migawką rysunków instrumentu z dnia, zapis razem z book (wywołujący), potem opcjonalny panel journalingu (E1)
  function onEngine(ev) {
    if (ev.type !== 'closed') return;
    const trade = tradeFrom(ev.position);
    (doc.trades ||= []).push(trade);
    onClosed({ ...ev.position, maeR: trade.maeR, mfeR: trade.mfeR, tradeId: trade.id });
    openJournal(trade);
  }
  function tradeFrom(pos) {
    syncDrawings(); // rysunki z ostatnich 120 ms trafiają do magazynu przed migawką
    return toTrade(pos, { day: day(), contract: rd.inst[pos.instrument]?.contract ?? null, stream: streamOf(pos.instrument), drawings: store ? store.snapshot(pos.instrument, day()) : null, trades: doc.trades });
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
      const ts = cell.chart.chart.timeScale(), s = cell.chart.series;
      let lo = Infinity, hi = -Infinity;
      for (const b of cell.chart.bars()) {
        const x = ts.timeToCoordinate(b[0]);
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
      onSave: (patch) => {
        const x = (doc.trades || []).find((y) => y.id === id);
        // jEdited (review E2 #2): opis zmieniony po wysyłce albo po błędzie → serwer aktualizuje stronę w Notion albo próbuje znowu
        if (x) { x.setup = patch.setup; x.notes = patch.notes; x.journal = 'done'; x.jEdited = now(); persist({ now: true }); }
        if (journal?.id === id) journal = null;
        paintBar();
        // dzień już zakończony (data odsłonięta): poprawiony opis idzie od razu; bieżący dzień czeka na „Zakończ dzień”
        if (x && (doc.days || {})[x.day]?.status === 'done') sendNotion({ day: x.day });
      },
      onSkip: () => { if (journal?.id === id) journal = null; paintBar(); },
    });
    journal = { id, ui };
    paintBar();
  }
  // ---- Notion (E2) ----
  const unsent = () => (doc?.trades || []).filter(isUnsent);
  function paintNotion() {
    const n = unsent(), errs = n.filter((x) => x.notion?.state === 'error');
    const lab = $('.bt-notion'), b = $('[data-bt="notion"]');
    lab.textContent = t('Niezapisane w Notion: {n}', { n: n.length });
    lab.title = errs.map((x) => `${x.id}: ${x.notion.error || ''}`).join('\n');
    lab.classList.toggle('err', errs.length > 0);
    b.disabled = !n.length || sendingNotion || !client.notion || stale;
    b.setAttribute('aria-busy', String(sendingNotion));
  }
  // day: trade'y jednego dnia (Zakończ dzień); all: wszystkie zaległe, także bez opisu i z błędem (przycisk). Replay nigdy na to nie czeka.
  // H2 (przegląd kodu #3): prośba w trakcie trwającej wysyłki nie przepada (np. „Zakończ dzień” dnia 2, gdy jeszcze idzie dzień 1): trafia do kolejki i idzie
  // zaraz po bieżącej. Timer (auto) dalej pomija się przy trwającej wysyłce: ponawia co 60 s.
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
  // co NOTION_RETRY_MS (review E2 #3): wyłącznie ponowienie trade'ów już raz próbowanych (błąd przejściowy zapisany w notion.error) z dni zakończonych;
  // bieżący, niezakończony dzień nigdy nie wychodzi automatycznie (data ukryta do „Zakończ dzień”). Serwer stosuje tę samą regułę (auto).
  const retryable = () => unsent().some((x) => (doc.days || {})[x.day]?.status === 'done' && !!x.notion?.error && (x.notion.state === 'pending' || needsUpdate(x)));
  function notionTick() { if (!closed && retryable()) sendNotion({ auto: true }); }

  function paintTodo() {
    const todo = todoOf(doc), btn = $('.bt-todo'), list = $('.bt-todo-l');
    btn.hidden = !todo.length;
    btn.textContent = t('Do uzupełnienia: {n}', { n: todo.length });
    if (!todo.length) { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    list.innerHTML = todo.map((x) => `<button type="button" role="menuitem" class="btn sm" data-todo="${esc(x.id)}">${esc(x.id)} · ${esc(x.instrument)} ${esc(x.dir)} · ${esc(Number.isFinite(x.r) ? fmtR(x.r) : '–')}</button>`).join('');
  }

  // kursor → silnik: instrumenty z pozycją albo zleceniem przechodzą advance, pozostałym rośnie sam znak wodny (cofnięcie blokuje handel)
  function advanceAll() {
    let b = doc.book; const evs = [];
    b.hwi ||= {};
    for (const k of Object.keys(rd.inst)) {
      const e = effOf(k);
      if (b.positions[k] || b.orders.some((o) => o.instrument === k)) { const r = advance(b, k, streamOf(k), e); b = r.book; evs.push(...r.events); }
      else if (e > (b.hwi[k] ?? -Infinity)) b.hwi[k] = e;
    }
    b.hw = Math.max(b.hw || 0, effOf(curInst()));
    doc.book = b; doc.hw = b.hw;
    if (evs.length) { for (const e of evs) onEngine(e); persist({ now: true }); }
  }

  function paintBar() {
    const d = day(), hide = hidden();
    $('.bt-name').textContent = doc.name || '';
    $('.bt-dayn').textContent = t('Dzień {i} / {n}', { i: Math.min(doc.dayIdx + 1, doc.pool.length), n: doc.pool.length });
    $('.bt-date').textContent = d && !hide ? dayLabel(d) : '';
    $('.bt-date').hidden = !d || hide;
    const f = fmtIn(chartTz());
    $('.bt-clock').textContent = d ? f.HMS.format(new Date(Math.floor(cursor) * 1000)) : '';
    const trades = doc.trades || [];
    const sum = trades.reduce((a, x) => a + (Number.isFinite(x?.r) ? x.r : 0), 0);
    $('.bt-res').textContent = `${fmtR(sum)} · ${t.p("{n} trade'ów", trades.length)}`;
    paintNotion();
    const done = dayState()?.status === 'done';
    $('[data-bt="end-day"]').textContent = done ? (doc.dayIdx + 1 < doc.pool.length ? t('Następny dzień') : t('Wszystkie dni zrobione')) : t('Zakończ dzień');
    $('[data-bt="end-day"]').disabled = !d || loadingDay || (done && doc.dayIdx + 1 >= doc.pool.length);
    for (const c of cells) {
      const secTf = (parseTf(c.tf)?.sec ?? 60) < 60;
      const r1 = rd?.inst?.[c.instrument]?.real1s || [], show = secTf && !inside(r1, cursor);
      c.secnote.hidden = !show;
      if (show) c.secnote.textContent = r1.length ? t('Sekundy od 9:30 do 11:00 NY, poza tym świece 1m.') : t('Ten instrument ma tylko świece 1m.');
    }
    paintTodo();
    paintFinished();
    $('.bt-tf').value = curTf();
    el.querySelectorAll('[data-layout]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === (doc.layout?.kind || '1'))));
  }

  // Ostatni dzień puli zakończony: ekran „Sesja ukończona” z wejściem do statystyk (E1). Wynik sesji w R i liczba trade'ów, bez daty (kolejność losowa już odsłonięta).
  function paintFinished() {
    const fin = $('.bt-fin'), all = !!doc && doc.dayIdx + 1 >= doc.pool.length && dayState()?.status === 'done';
    fin.hidden = !all;
    if (!all) return;
    const tr = doc.trades || [];
    $('.bt-fin-s').textContent = `${fmtR(tr.reduce((a, x) => a + (Number.isFinite(x?.r) ? x.r : 0), 0))} · ${t.p("{n} trade'ów", tr.length)}`;
    $('[data-bt="stats"]').disabled = !onStats;
    if (!onStats) $('[data-bt="stats"]').title = t('Statystyki sesji: wkrótce');
  }

  function render() {
    if (!cells.length) return;
    for (const c of cells) c.chart.apply(c.builder.seek(cursor));
    if (journal && Date.now() - placedAt > 400) { placedAt = Date.now(); journal.ui.place(); } // róg panelu zależy od położenia świecy przy kursorze
    paintBar();
    orders?.refresh();
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
      if (!r || !c.day) continue;
      const dd = r.currentDoc(), sig = JSON.stringify(dd.d);
      if (sig === c.sig) continue;
      c.sig = sig;
      store?.set(c.instrument, c.day, dd, { origin: c, persist: false });
    }
  }
  function destroyCells() {
    closeJournal();
    syncDrawings();
    for (const c of cells) { clearTimeout(c.liveTimer); c.off?.(); try { c.chart.destroy(); } catch { /* już zniszczony */ } c.el.remove(); }
    cells = [];
  }
  const instOpts = () => sessionInstruments().filter((i) => rd.inst[i]);
  function cellHtml(i, cfgC) {
    const ins = instOpts().map((x) => `<option value="${esc(x)}"${x === cfgC.instrument ? ' selected' : ''}>${esc(x)}</option>`).join('');
    const tfs = REPLAY_TFS.map((x) => `<option value="${x}"${x === cfgC.tf ? ' selected' : ''}>${x}</option>`).join('');
    return `
      <div class="bt-ch">
        <select class="sp-in sp-sel bt-ci" aria-label="${esc(t('Instrument wykresu'))}">${ins}</select>
        <select class="sp-in sp-sel bt-ct" aria-label="${esc(t('Interwał wykresu'))}">${tfs}</select>
        <span class="swc-save" aria-live="polite"></span><span class="swc-meter" hidden></span>
        <button type="button" class="btn sm swc-draw" aria-expanded="false">${esc(t('Rysuj'))}</button>
        <div class="swc-tools" role="toolbar" aria-label="${esc(t('Narzędzia rysowania'))}"></div>
      </div>
      <div class="swc-stage bt-stage"><div class="bt-plot swc-plot swc-lwc" data-i="${i}"></div>
        <button type="button" class="icon-btn swc-gear" hidden title="${esc(t('Ustawienia rysunku'))}" aria-label="${esc(t('Ustawienia rysunku'))}">${GEAR}</button>
        <div class="swc-style" role="group" aria-label="${esc(t('Ustawienia rysunku'))}" hidden></div>
        <p class="note bt-secnote" hidden></p></div>`;
  }
  function makeCell(i, cfgC, dayId) {
    const sym = symOf(cfgC.instrument);
    const host = document.createElement('div');
    host.className = 'bt-cell swc';
    host.dataset.i = String(i); host.dataset.active = 'false';
    host.innerHTML = cellHtml(i, cfgC);
    $('.bt-grid').appendChild(host);
    const q = rd.inst[cfgC.instrument];
    const sOpen = sessionBounds(startCur)?.open ?? startCur;
    const daily = aggregate(q.m1.filter((b) => b[0] < sOpen), '1D') || []; // PDH/PDL: sesje dzienne zamknięte przed sesją dnia replayu (w całości przed kursorem)
    const cell = { i, el: host, instrument: cfgC.instrument, tf: cfgC.tf, day: dayId, liveTimer: 0, sig: '', off: null, ext: false };
    const sel = (s) => host.querySelector(s);
    cell.secnote = sel('.bt-secnote');
    cell.builder = createBuilder(streamOf(cfgC.instrument), cfgC.tf);
    const base = store.docOf(sym, dayId);
    cell.chart = createReplayChart(sel('.bt-plot'), {
      LWC, D, instrument: cfgC.instrument, tf: cfgC.tf, colors: (colors = readColors(sel('.bt-plot'))), hideDate: hidden(), daily, getNews: () => visibleNews(rd.news, cursor),
      onCrosshair: (time) => { for (const o of cells) if (o !== cell) o.chart.setCursorLine(time); },
      rysunki: D ? {
        bar: sel('.swc-tools'), panel: sel('.swc-style'), stage: sel('.swc-stage'), gear: sel('.swc-gear'), foot: { save: sel('.swc-save'), meter: sel('.swc-meter') },
        doc: base, confirm: (o) => confirmDialog(o), isActive: () => cells[activeIdx] === cell,
        // J (30.10.2026): nowa pozycja rysowana w replayu bierze konto i ryzyko z definicji sesji (jak panel zleceń); zaznaczenie odświeża „Wejdź według rysunku”
        positionDefaults: () => {
          const r = doc.def?.risk || {}, out = {};
          if (Number(doc.def?.balance) > 0) out.accountSize = Number(doc.def.balance);
          if (r.mode === 'pct' && Number(r.value) > 0) Object.assign(out, { riskDisplayMode: 'percents', riskPercent: Number(r.value) });
          else if (Number(r.value) > 0) Object.assign(out, { riskDisplayMode: 'money', riskAmount: Number(r.value) });
          return out;
        },
        onSelect: () => { if (cells[activeIdx] === cell) orders?.syncDrawing?.(); },
        // przegląd J P3-5: ile kontraktów faktycznie złoży „Wejdź według rysunku” (ryzyko sesji), do notki w panelu Wejścia
        sessionQty: (d) => orders?.drawingQty?.(d, cell.instrument) ?? null,
        saveDoc: async (dd) => { cell.sig = JSON.stringify(dd.d); store.set(sym, dayId, dd, { origin: cell }); return { ok: true }; },
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
            store.set(sym, dayId, dd, { origin: cell, persist: false });
          }, 120);
        },
      } : null,
    });
    cell.sig = JSON.stringify(cell.chart.rysunki?.()?.currentDoc().d ?? base.d);
    cell.off = store.subscribe(sym, (dy, dd, origin) => {
      if (dy !== dayId || origin === cell) return;
      cell.ext = true;
      try { cell.chart.rysunki?.()?.applyExternal(dd); cell.sig = JSON.stringify(cell.chart.rysunki?.()?.currentDoc().d ?? dd.d); } finally { cell.ext = false; }
    });
    if (posEditFn) cell.chart.onPositionEdit((pr) => posEditFn(pr, cell.instrument));
    host.addEventListener('pointerdown', () => activate(i), true);
    sel('.bt-ci').addEventListener('change', (ev) => setCell(i, { instrument: ev.target.value }));
    sel('.bt-ct').addEventListener('change', (ev) => setCell(i, { tf: ev.target.value }));
    sel('.swc-draw').addEventListener('click', (ev) => { const o = sel('.swc-tools').classList.toggle('open'); ev.currentTarget.setAttribute('aria-expanded', String(o)); });
    return cell;
  }
  // Buduje wszystkie komórki z doc.layout (po zmianie układu, instrumentu wykresu albo dnia); kursor i silnik zostają.
  function buildCells() {
    destroyCells();
    doc.layout = normLayout(doc.layout, sessionInstruments(), (i) => !!rd.inst[i]);
    activeIdx = doc.layout.active;
    const grid = $('.bt-grid');
    grid.dataset.kind = doc.layout.kind;
    cells = doc.layout.charts.map((c, i) => makeCell(i, c, day()));
    markActive();
    orders?.refresh();
  }
  function markActive() {
    cells.forEach((c, i) => { c.el.dataset.active = String(i === activeIdx); });
    $('.bt-tf').value = curTf();
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
    if (patch.instrument && patch.instrument !== c.instrument && rd.inst[patch.instrument]) {
      doc.layout.charts[i] = { ...doc.layout.charts[i], instrument: patch.instrument };
      activeIdx = i; doc.layout.active = i;
      buildCells(); render(); persist();
      return;
    }
    if (patch.tf && REPLAY_TFS.includes(patch.tf) && patch.tf !== c.tf) {
      c.tf = patch.tf;
      doc.layout.charts[i] = { ...doc.layout.charts[i], tf: c.tf };
      c.builder = createBuilder(streamOf(c.instrument), c.tf);
      c.chart.setTf(c.tf);
      if (i !== activeIdx) { activeIdx = i; doc.layout.active = i; markActive(); }
      c.el.querySelector('.bt-ct').value = c.tf;
      render(); persist();
    }
  }
  function setLayout(kind) {
    if (!LAYOUTS.includes(kind) || !cells.length || kind === doc.layout.kind) return;
    doc.layout = normLayout({ kind, charts: doc.layout.charts, active: activeIdx }, sessionInstruments(), (i) => !!rd.inst[i]);
    try { storage?.setItem(LAYOUT_KEY, JSON.stringify({ kind: doc.layout.kind, charts: doc.layout.charts })); } catch { /* localStorage niedostępny */ }
    buildCells(); render(); persist();
  }

  // F2: typ dnia w pasku (np. „CPI 8:30”): cechy dnia z indeksu (GET /api/backtest/days dla jednego dnia), etykieta z filtra sesji albo dayTags. Nie blokuje replayu; błąd = pusty typ.
  function paintDayType(d, instruments) {
    const load = loadFeatures || (async ({ instruments: ins, day: dd }) => ((await client.days({ instruments: ins, from: dd, to: dd, start: doc.def?.startTime || '' })).days || []).find((x) => x.day === dd) || null);
    Promise.resolve().then(() => load({ instruments, day: d })).then((f) => {
      if (closed || day() !== d) return;
      $('.bt-daytype').textContent = f ? dayTypeLabel(f, doc.def?.filter) : '';
    }).catch(() => { /* bez cech dnia pasek nie pokazuje typu */ });
  }

  let loadingDay = false; // H2 (przegląd kodu #2): w trakcie wczytywania dnia „Zakończ dzień / Następny dzień” nic nie robi (przycisk wyłączony)
  async function openDay() {
    loadingDay = true;
    try { await openDayInner(); } finally { loadingDay = false; if (!closed && doc) paintBar(); }
  }
  async function openDayInner() {
    pause();
    $('[data-bt="end-day"]').disabled = true;
    orders?.destroy(); orders = null;
    destroyCells();
    const d = day();
    if (!d) { state(t('W tej sesji nie ma już dni do przejścia.')); paintBar(); return; }
    state(t('Wczytuję dzień…'));
    $('.bt-daytype').textContent = '';
    const instruments = sessionInstruments();
    rd = await (loadDay ? loadDay({ instruments, day: d }) : client.day({ instruments, day: d }));
    if (closed) return;
    paintDayType(d, instruments);
    streams = {};
    startCur = nyAt(d, doc.def?.startTime || '09:00');
    const saved = Number(doc.cursor);
    endT = dataEnd(); endPrompted = false;
    cursor = Number.isFinite(saved) && saved >= startCur && saved <= endT ? saved : startCur;
    if (!dayState()) doc.days[d] = { status: 'active' };
    state('');
    LWC ||= await loadLwc();
    D ||= await loadDraw();
    if (closed) return;
    store ||= createDrawingStore({ getSession: () => doc, save: () => persist() });
    doc.layout = normLayout(doc.layout, instruments, (i) => !!rd.inst[i]);
    buildCells();
    doc.book ||= emptyBook();
    advanceAll();
    orders?.destroy();
    const hub = {
      // pozycje i zlecenia rysują się na każdym wykresie swojego instrumentu; edycja SL/TP wraca z nazwą instrumentu wykresu, na którym ją zrobiono
      setTradingFor(k, st) { for (const c of cells) if (c.instrument === k) c.chart.setTrading(st); },
      onPositionEdit(fn) { posEditFn = fn; for (const c of cells) c.chart.onPositionEdit(fn ? (pr) => fn(pr, c.instrument) : null); },
    };
    orders = mountOrders($('.bt-ordhost'), {
      getBook: () => doc.book, setBook, onCommit: () => persist({ now: true }), getLast: last,
      lock: () => (stale ? t('Sesja zmieniła się w innej karcie. Otwórz ją ponownie.') : dayState()?.status === 'done' ? t('Dzień jest zakończony: handel zablokowany.') : ''), getCursor: () => cursor, instrument: () => curInst(), instruments: () => Object.keys(rd.inst), chart: hub, onEvent: onEngine,
      risk: () => ({ ...(doc.def?.risk || { mode: 'usd', value: 0 }), balance: doc.def?.balance }),
      // J (Zakres B): zaznaczony rysunek pozycji na aktywnym wykresie (instrument wykresu = instrument zlecenia) i jego usunięcie po złożeniu zlecenia
      getDrawing: () => cur()?.chart.rysunki?.()?.selectedPosition() || null,
      // przegląd J P2-1: dokument rysunków bez rysunku trafia do sesji od razu (w pamięci), więc onCommit zapisuje zlecenie i usunięcie jednym zapisem
      useDrawing: (d) => {
        const c = cur(), r = c?.chart.rysunki?.();
        if (!r) return;
        r.removeDrawing(d.id);
        const dd = r.currentDoc();
        c.sig = JSON.stringify(dd.d);
        store?.set(c.instrument, c.day, dd, { origin: c, persist: false });
      },
      onReturn: () => { pause(); setCursor(doc.book.hw); },
    });
    render();
    persist();
  }

  // Koniec dnia = koniec danych: 16:00 NY, a gdy handel kończy się wcześniej (dzień skrócony, dziura na końcu) ostatnia zamknięta świeca 1m któregokolwiek instrumentu sesji (Review Focus 2).
  function dataEnd() {
    let e = 0;
    for (const k of Object.keys(rd.inst)) { const m = rd.inst[k].m1, lb = m[m.length - 1]; if (lb) e = Math.max(e, lb[0] + 60); }
    return e > 0 ? Math.min(rd.times.end, e) : rd.times.end;
  }
  function setCursor(c) {
    const nc = Math.min(endT, Math.max(startCur, c));
    const newsBefore = visibleNews(rd.news, cursor).length;
    cursor = nc;
    advanceAll();
    if (visibleNews(rd.news, cursor).length !== newsBefore) for (const x of cells) x.chart.newsChanged();
    render();
    persist();
    // kursor dotarł do końca danych z otwartą pozycją: to samo pytanie i ta sama ścieżka co „Zakończ dzień” (E1)
    if (cursor >= endT && hasOpen() && dayState()?.status !== 'done') { if (!endPrompted) { endPrompted = true; pause(); finishDayUi(); } } else if (cursor < endT) endPrompted = false;
  }

  function step(dir) {
    if (!cells.length) return;
    pause();
    setCursor(nextCursor(cursor, dir, curTf(), rd.inst[curInst()].real1s, { min: startCur, max: endT }));
  }

  function loop(ts) {
    if (!playing) return;
    const dt = lastTs ? Math.min(MAX_DT, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (dt > 0) setCursor(cursor + speed * dt);
    if (cursor >= endT) { pause(); return; }
    rafId = raf(loop);
  }
  function play() {
    if (!cells.length || playing || cursor >= endT) return;
    playing = true; lastTs = 0;
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

  // Zakończenie dnia (E1): endDay() na dokumencie sesji (pytanie o otwartą pozycję, zamknięcie 'eod' po cenie kursora, anulowanie zleceń, status done), potem zapis od razu.
  // Panel journalingu nie blokuje przejścia: otwarty panel zamyka się bez zapisu, a jego trade zostaje na liście „do uzupełnienia”. Zwraca true, gdy dzień jest zakończony.
  let ending = false;
  async function finishDayUi() {
    if (dayState()?.status === 'done') return true;
    if (ending) return false;
    ending = true;
    try {
      pause();
      const d = day();
      const res = await endDay(doc, { last, confirm, streamOf, contractOf: (k) => rd.inst[k]?.contract ?? null, snapshot: (k, dd) => { syncDrawings(); return store ? store.snapshot(k, dd) : null; }, day: d });
      if (closed || day() !== d) return false;
      if (!res.ended) { if (res.reason) msg(rejectText(res.reason)); return false; }
      closeJournal();
      Object.assign(doc, res.session); // ten sam obiekt: klient sesji trzyma go w kolejce zapisu
      for (const tr of res.closed) onClosed({ instrument: tr.instrument, dir: tr.dir, qty: tr.qty, entryT: tr.entryT, entryPrice: tr.entryPrice, exits: tr.exits, exitT: tr.exitT, exitPrice: tr.exitPrice, r: tr.r, pnl: tr.pnl, maeR: tr.maeR, mfeR: tr.mfeR, tradeId: tr.id });
      for (const c of cells) c.chart.setHideDate(false);
      orders?.refresh();
      paintBar();
      persist({ now: true });
      sendNotion({ day: d }); // E2: trade'y kończonego dnia do Notion (zapis stanu idzie pierwszy, patrz bt-klient notion)
      return true;
    } finally { ending = false; }
  }
  // Następny dzień puli: znak wodny silnika zaczyna od zera (nowy dzień ma inny przedział czasu)
  async function gotoNextDay() {
    if (doc.dayIdx + 1 >= doc.pool.length) return false;
    if (hasOpen()) { msg(t('Zamknij pozycję przed przejściem do następnego dnia.')); return false; } // pozycja nie przechodzi między dniami (przegląd C2, pkt 2)
    doc.dayIdx += 1; doc.cursor = null;
    doc.book = { ...doc.book, orders: [], hw: 0, hwi: {} }; doc.hw = 0;
    await openDay().catch(failed);
    return true;
  }
  async function endDayUi() {
    const d = day();
    if (!d || loadingDay || !cells.length) return;
    msg('');
    if (dayState()?.status === 'done') { await gotoNextDay(); return; }
    await finishDayUi();
  }

  // ---- skoki (§8): lista przy pasku + skróty ----
  function fillJumps() {
    const sel = $('.bt-jump'), c = cfg();
    let want = '';
    try { want = storage?.getItem(JUMP_KEY) || ''; } catch { /* localStorage niedostępny */ }
    sel.innerHTML = c.jumps.map((j) => '<option value="' + esc(j.id) + '">' + esc(t(j.name)) + (j.skrot ? ' (' + esc(j.skrot) + ')' : '') + '</option>').join('');
    if (c.jumps.some((j) => j.id === want)) sel.value = want;
  }
  async function runJump(j) {
    if (!j || !cells.length) return false;
    pause(); msg('');
    const tg = jumpTarget(j, { cursor, day: day(), times: rd.times, news: rd.news, startTime: doc.def?.startTime || '09:00' });
    if (!tg) { msg(t('Nie ma dokąd skoczyć w tym dniu.')); return false; }
    if (tg.nextDay) {
      if (doc.dayIdx + 1 >= doc.pool.length) { msg(t('To ostatni dzień w puli.')); return false; }
      if (!(await finishDayUi())) return false;
      return gotoNextDay();
    }
    setCursor(tg.cursor);
    return true;
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
    const tg = ev.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return; // notatka journalingu i pola panelu
    const sk = norm(skrotOf(ev));
    if (!sk) return;
    if (sk === 'SPACE' && tg && (tg.tagName === 'BUTTON' || tg.tagName === 'A')) return; // Spacja na przycisku robi swoje
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
      case 'reopen': { const sid = sessionId; close(); onReopen(sid); break; }
      case 'speedUp': case 'speedDown': {
        const i = SPEEDS.indexOf(speed), n = Math.min(SPEEDS.length - 1, Math.max(0, i + (action === 'speedUp' ? 1 : -1)));
        setSpeedVal(SPEEDS[n]); break;
      }
      case 'buy': case 'sell': orders?.submit(action); break;
      case 'closeAll': orders?.closeAll(); break;
      case 'drawEntry': orders?.fromDrawing(); break; // J: wejście według zaznaczonego rysunku
      case 'endDay': endDayUi(); break;
      default: break;
    }
  }
  globalThis.addEventListener?.('keydown', onKey, true);

  function failed(e) {
    state(e?.code === 'corrupt' ? t('Plik tej sesji jest uszkodzony i nie da się go otworzyć.') : t('Nie udało się wczytać dnia replayu: {msg}', { msg: e?.message || '' }));
  }

  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.speed) { setSpeedVal(Number(b.dataset.speed)); return; }
    if (b.dataset.todo) { const x = (doc.trades || []).find((y) => y.id === b.dataset.todo); $('.bt-todo-l').hidden = true; $('.bt-todo').setAttribute('aria-expanded', 'false'); if (x) openJournal(x); return; }
    if (b.dataset.layout) { setLayout(b.dataset.layout); return; }
    switch (b.dataset.bt) {
      case 'back': step(-1); break;
      case 'step': step(1); break;
      case 'play': if (playing) pause(); else play(); break;
      case 'end-day': endDayUi(); break;
      case 'stats': if (onStats) onStats(sessionId); break;
      case 'notion': sendNotion({ all: true }); break;
      case 'fin-close': close(); break;
      case 'todo': { const l = $('.bt-todo-l'); l.hidden = !l.hidden; b.setAttribute('aria-expanded', String(!l.hidden)); break; }
      case 'jump': runJump(jumpById($('.bt-jump').value)); break;
      case 'close': close(); break;
      default: break;
    }
  });
  $('.bt-tf').addEventListener('change', (ev) => setTf(ev.target.value));
  $('.bt-jump').addEventListener('change', (ev) => { try { storage?.setItem(JUMP_KEY, ev.target.value); } catch { /* localStorage niedostępny */ } });
  fillJumps();
  const onHide = () => { if (doc && !stale) { syncDrawings(); doc.cursor = cursor; client.flush({ keepalive: true }).catch(() => {}); } };
  globalThis.addEventListener?.('pagehide', onHide);

  function close() {
    if (closed) return;
    closed = true;
    pause();
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

  const ready = (async () => {
    try { storage?.setItem(OPEN_KEY, sessionId); } catch { /* localStorage niedostępny */ }
    client.setOnError?.(onSaveError);
    doc = await client.load(sessionId);
    // nowa sesja (jeszcze nigdy nie otwarta) dostaje ostatni użyty układ wykresów (D1)
    if (!doc.opened && doc.layout?.kind === '1' && (doc.layout.charts?.length ?? 1) <= 1) {
      try {
        const s = JSON.parse(storage?.getItem(LAYOUT_KEY) || 'null');
        if (s && LAYOUTS.includes(s.kind)) doc.layout = { ...doc.layout, kind: s.kind, charts: [...(doc.layout.charts || []), ...(Array.isArray(s.charts) ? s.charts.slice((doc.layout.charts || []).length) : [])] };
      } catch { /* zły wpis: zostaje układ z sesji */ }
    }
    doc.opened = new Date(now()).toISOString();
    doc.dayIdx = Number.isInteger(doc.dayIdx) && doc.dayIdx >= 0 ? doc.dayIdx : 0;
    await openDay();
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
    sendNotion,
    play, pause, step, setTf, endDay: endDayUi, setSpeed: setSpeedVal, runJump: (id) => runJump(jumpById(id)), refreshJumps: fillJumps,
    book: () => doc?.book, orders: () => orders, speed: () => speed, journal: () => journal?.ui ?? null, openJournal: (id) => { const x = (doc?.trades || []).find((y) => y.id === id); if (x) openJournal(x); },
  };
}
