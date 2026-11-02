// Klient magazynu sesji backtestu (1.5.0, pakiet C1): odczyt i zapis chart-data/backtest/sessions/<id>.json przez serwer dashboardu.
// Zapis zbiera zmiany z opóźnieniem 1 s (kursor przy odtwarzaniu zmienia się kilkadziesiąt razy na sekundę), flush() wysyła od razu,
// a przy pagehide z keepalive (przeglądarka dokończy wysyłkę po zamknięciu karty). Wersja (rev) pilnuje, żeby druga karta nie nadpisała stanu po cichu (409 stale).
// keepalive przyjmuje ciało do 64 KB: większy dokument idzie zwykłym fetch (zapis w trakcie pracy co 1 s i tak zwykle już się odbył).
// English: session store client: debounced save (1 s), immediate flush, keepalive on page hide, revision check.
export const SAVE_DELAY_MS = 1000;
const KEEPALIVE_MAX = 60 * 1024;
const HEADERS = { 'Content-Type': 'application/json', 'X-THQ': '1' };

export function newSessionId(rand = () => Math.random()) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  try { const b = new Uint8Array(12); globalThis.crypto.getRandomValues(b); for (const x of b) s += a[x % 36]; } catch { for (let i = 0; i < 12; i++) s += a[Math.floor(rand() * 36)]; }
  return 'bt-' + s;
}

export function createSessionClient({ fetchImpl = (...a) => globalThis.fetch(...a), delayMs = SAVE_DELAY_MS, onError: onError0 = () => {} } = {}) {
  let onError = onError0;
  const revs = new Map(); // id → rev ostatnio znany z serwera
  let queued = null, timer = 0, inflight = null, lastError = null;

  async function getJson(url) {
    const r = await fetchImpl(url, { cache: 'no-store' });
    let j = null;
    try { j = await r.json(); } catch { /* bez treści */ }
    if (!r.ok) { const e = new Error(j?.error || String(r.status)); e.status = r.status; e.code = j?.code; throw e; }
    return j;
  }

  async function load(id) {
    const doc = await getJson(`/api/backtest/session/${encodeURIComponent(id)}`);
    revs.set(id, doc.rev || 0);
    return doc;
  }
  const list = async () => (await getJson('/api/backtest/sessions')).sessions || [];
  // start: godzina startu replayu sesji ('HH:MM' NY): cechy rynku do tej godziny ([U] 30.10.2026 «Gap od ceny startu»)
  const days = async ({ instruments, from, to, mkt = true, start = '' }) => getJson(`/api/backtest/days?instruments=${encodeURIComponent(instruments.join(','))}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${mkt ? '' : '&mkt=0'}${start ? `&start=${encodeURIComponent(start)}` : ''}`);
  // G: lekkie źródło statystyk (trade'y i status dni, bez rysunków); ids = tablica identyfikatorów albo null (wszystkie sesje) → { sessions, failed }
  const statsSource = async ({ ids = null } = {}) => getJson(`/api/backtest/stats-source${ids && ids.length ? `?ids=${encodeURIComponent(ids.join(','))}` : ''}`);
  // K (31.10.2026): ciągła oś czasu: zakres (tf=base strumień bazowy, tf=<interwał> historia wykresu), granice danych i newsy z wyprzedzeniem dla skoku „Następny news”
  const range = async ({ instruments, from, to, tf = 'base' }) => getJson(`/api/backtest/range?instruments=${encodeURIComponent(instruments.join(','))}&from=${from}&to=${to}&tf=${encodeURIComponent(tf)}`);
  // [U] 1.11.2026 «oraz dodaj mozliwosc usuniecia sesji…»: usunięcie przenosi plik sesji do sessions/usuniete, restore przywraca
  async function post(url, body) {
    let r;
    // brak sieci: błąd bez statusu i z kodem 'network' (wywołujący pokazuje własny, zrozumiały komunikat)
    try { r = await fetchImpl(url, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) }); } catch (err) { const e = new Error(String(err?.message || 'network')); e.code = 'network'; throw e; }
    let j = null;
    try { j = await r.json(); } catch { /* bez treści */ }
    if (!r.ok) { const e = new Error(j?.error || String(r.status)); e.status = r.status; e.code = j?.code; throw e; }
    return j;
  }
  // Jeden sposób dla usuwania sesji i trade'ów oraz ich cofania: zaległy zapis musi się udać przed żądaniem (stale znaczy, że plik zmieniła inna karta, więc nic nie czeka);
  // inaczej serwer czytałby plik bez zmian z przeglądarki (sesja wróciłaby jako nowa, trade dostałby 404 albo 409). Błąd zapisu przerywa z kodem 'flush', żądanie nie idzie.
  const settle = async () => {
    try { await flush(); } catch (e) {
      if (e.code !== 'stale') { const err = new Error(e.message); err.code = 'flush'; err.status = e.status; throw err; }
    }
  };
  const remove = async (id) => { await settle(); revs.delete(id); return post('/api/backtest/session/delete', { id }); };
  const restore = (id) => post('/api/backtest/session/restore', { id });
  // Decyzja 2026-11-02 (poprawki po przeglądach): usunięcie trade'a sesji i Cofnij. Najpierw zapis zaległych zmian (settle), potem strona trade'a w Notion do kosza albo z powrotem;
  // trade ze swojej kopii sesji usuwa (i dopisuje) wywołujący, z awaitowanym zapisem. skipNotion = usuń tylko lokalnie (za zgodą, gdy Notion nie zna strony).
  const trashTrade = async (sessionId, tradeId, { skipNotion = false } = {}) => { await settle(); return post('/api/backtest/trade/trash', { sessionId, tradeId, ...(skipNotion ? { skipNotion: true } : {}) }); };
  const restoreTrade = async (sessionId, tradeId) => { await settle(); return post('/api/backtest/trade/restore', { sessionId, tradeId }); };
  const bounds = async (instruments) => getJson(`/api/backtest/bounds?instruments=${encodeURIComponent(instruments.join(','))}`);
  const news = async ({ from, to }) => getJson(`/api/news?from=${Math.floor(from)}&to=${Math.floor(to)}`);

  async function send(doc, { keepalive = false, rev = null } = {}) {
    const id = doc.id;
    const body = JSON.stringify({ id, doc, rev: rev ?? (revs.get(id) || 0) });
    const r = await fetchImpl('/api/backtest/session/save', { method: 'POST', headers: HEADERS, body, keepalive: keepalive && body.length <= KEEPALIVE_MAX });
    let j = null;
    try { j = await r.json(); } catch { /* bez treści */ }
    if (!r.ok) { const e = new Error(j?.error || String(r.status)); e.status = r.status; e.code = j?.code; throw e; }
    revs.set(id, Math.max(revs.get(id) || 0, j.rev)); // zapis keepalive mógł już podnieść wersję
    doc.rev = revs.get(id);
    return j;
  }

  // Wysyła to, co czeka w kolejce (najnowszy stan dokumentu); kolejne zapisy idą jeden po drugim, nigdy równolegle (rev rośnie po kolei).
  async function flush({ keepalive = false } = {}) {
    clearTimeout(timer); timer = 0;
    // pagehide: zapis w toku nie może blokować ostatniego zapisu (karta zaraz zniknie): wysyłamy od razu z następną wersją (serwer przetworzy je po kolei)
    if (inflight && keepalive && queued) {
      const doc = queued; queued = null;
      const next = (revs.get(doc.id) || 0) + 1;
      revs.set(doc.id, next);
      const p = send(doc, { keepalive: true, rev: next }).catch((e) => { lastError = e; onError(e); throw e; });
      return p;
    }
    if (inflight) { await inflight.catch(() => {}); }
    if (!queued) return null;
    const doc = queued; queued = null;
    inflight = send(doc, { keepalive });
    try { const r = await inflight; lastError = null; return r; } catch (e) { lastError = e; if (e.code !== 'stale') queued = queued || doc; onError(e); throw e; } finally { inflight = null; }
  }

  // save(doc, { now }) — now: true zapisuje od razu (np. nowa sesja, koniec dnia), inaczej po SAVE_DELAY_MS od ostatniej zmiany.
  function save(doc, { now = false } = {}) {
    if (!doc?.id) return Promise.reject(new Error('bt-klient: dokument bez id'));
    queued = doc;
    if (now) return flush();
    clearTimeout(timer);
    timer = setTimeout(() => { flush().catch(() => {}); }, delayMs);
    return Promise.resolve(null);
  }

  // Nowa sesja: rev 0 (serwer odrzuci, gdy plik o tym id już jest).
  function create(doc) { revs.set(doc.id, 0); queued = doc; return flush(); }

  // E2: wysyłka trade'ów sesji do Notion (POST /api/backtest/notion). Serwer wysyła z pliku sesji, więc najpierw idzie zaległy zapis stanu.
  // K: [U] 31.10.2026 «od razu»: bez trybu dnia. Domyślnie wszystkie niewysłane (bez błędu, także bez opisu); all: także z błędem (jawne „Zapisz do Notion”);
  // auto: tylko ponowienie już próbowanych z błędem przejściowym (timer). Wynik: { sent, skipped, failed, pending, notion }.
  async function notion({ sessionId, all = false, auto = false } = {}) {
    await flush().catch(() => {});
    const r = await fetchImpl('/api/backtest/notion', { method: 'POST', headers: HEADERS, body: JSON.stringify({ sessionId, ...(all ? { all: true } : {}), ...(auto ? { auto: true } : {}) }) });
    let j = null;
    try { j = await r.json(); } catch { /* bez treści */ }
    if (!r.ok) { const e = new Error(j?.error || String(r.status)); e.status = r.status; e.code = j?.code; throw e; }
    return j;
  }

  return { setOnError: (fn) => { onError = fn || onError0; }, remove, restore, trashTrade, restoreTrade, load, list, days, statsSource, range, bounds, news, save, create, flush, notion, pending: () => (queued ? 1 : 0) + (inflight ? 1 : 0), lastError: () => lastError };
}
