// Wysyłka trade'ów backtestu do bazy Trade'y w Notion (1.5.0, pakiet E2, projekt §11). Plik sesji (lib/backtest-store.mjs) jest źródłem prawdy, Notion dostaje kopię.
// Kolejność dla każdego trade'a ([B] karta E2):
//   (1) state 'sent' → pomiń; (2) brak notion.id, a w świeżych danych z Notion jest strona ze znacznikiem „[<sessionId>/<tradeId>]” w polu „Sesja backtestu”
//   → zapisz jej id lokalnie i nie twórz drugiej; (3) POST strony i natychmiast zapis notion.id w pliku sesji; (4) rysunki przez drawings.save(id, doc); (5) state 'sent'.
// Awaria po (3), a przed zapisem id (utracona odpowiedź, zamknięty proces) jest pokryta krokiem (2) przy następnej próbie: ponowna wysyłka niczego nie dubluje.
// Po zerwanym POST nowy POST tego trade'a dopiero po RECREATE_MS (notion.postAt), żeby wyszukanie po znaczniku zobaczyło stronę (review E2 #6).
// Trade z id, ale bez 'sent' (np. przerwa między (3) a (5)) wznawia od (4).
// Poprawki po review E2 (decyzja sesji głównej 30.10.2026, #2): opis (setup, notatka) zmieniony po wysyłce (trade.jEdited > notion.edited) aktualizuje istniejącą
// stronę (PATCH), nie tworzy nowej. Trade z błędem, którego opis zmieniono, próbuje znowu bez przycisku.
// Ponawianie: 429, 5xx, 409 conflict_error, sieć i przekroczony czas (timeoutMs) → state 'pending' z notion.error (licznik bez zmian), reszta kolejki czeka;
// wszystko inne (walidacja, w tym zły kształt trade'a, odmowa Notion 400/403/404, 409 kosza) → state 'error', bez automatycznego ponawiania.
// Tryby: day = trade'y jednego dnia (Zakończ dzień); all = także bez opisu i z błędem (przycisk „Zapisz do Notion”); auto = timer: wyłącznie ponowienie
// trade'ów już próbowanych (notion.error) z dni zakończonych, bieżący dzień nigdy (review E2 #3).
// Pole notion trade'a należy do serwera: zapis stanu sesji z przeglądarki go nie nadpisuje (backtest-store.mjs save), a ta wysyłka zmienia je bez podbijania rev.
// Jedna wysyłka sesji naraz (kolejka obietnic jak serial w lib/drawings.mjs).
// English: pushes backtest trades to the Notion Trades database, idempotent through the "[session/trade]" marker, retry-safe at every step.
import { NotionError } from './notion.mjs';
import { ValidationError } from './writes.mjs';
import { BacktestError, SESSION_ID_RE } from './backtest-store.mjs';
import { SESSIONS } from '../public/js/swiece.js';
import { RECREATE_MS, editedAfter } from '../public/js/bt-notion.js';

export const BT_SESSION_MAX = 200; // pole „Sesja backtestu” (writes.mjs): do 200 znaków
export const REQUEST_TIMEOUT_MS = 30_000; // review E2 #8: jeden krok wysyłki (żądanie do Notion) najwyżej tyle, potem błąd przejściowy
// znacznik na końcu pola; ta sama reguła co parseBtSession w public/js/stats.js (test backtest-E2 sprawdza zgodność)
export const MARKER_RE = /\[(bt-[a-z0-9]{6,20})\/(t\d{1,9})\]\s*$/;
export const btMarker = (sessionId, tradeId) => `[${sessionId}/${tradeId}]`;
// „<nazwa sesji> [<sessionId>/<tradeId>]”: nazwa skracana tak, żeby znacznik (klucz idempotencji) zawsze się zmieścił
export function btSessionValue(name, sessionId, tradeId) {
  const mk = btMarker(sessionId, tradeId);
  const nm = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, BT_SESSION_MAX - mk.length - 1).trim();
  return nm ? `${nm} ${mk}` : mk;
}

const TZ = 'America/New_York';
const nyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function nyParts(sec) {
  const o = {};
  for (const p of nyFmt.formatToParts(new Date(sec * 1000))) if (p.type !== 'literal') o[p.type] = p.value;
  return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour}:${o.minute}` };
}
// opcja „Sesja” z godziny wejścia (sesje CME w czasie NY, swiece.js), tylko gdy baza ma taką opcję (nazwy PL i EN)
const SESSION_NAMES = { asia: ['Azja', 'Asia'], london: ['Londyn', 'London'], ny: ['Nowy Jork', 'New York', 'NY'] };
function sessionOption(entryT, optionNames = []) {
  const hm = nyParts(entryT).time;
  const s = SESSIONS.find((x) => (x.to > x.from ? hm >= x.from && hm < x.to : hm >= x.from || hm < x.to)); // to <= from: przez północ
  if (!s) return null;
  const want = (SESSION_NAMES[s.id] || []).map((n) => n.toLowerCase());
  return optionNames.find((n) => want.includes(String(n).trim().toLowerCase())) || null;
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const TIME_MIN = Date.UTC(2000, 0, 1) / 1000, TIME_MAX = Date.UTC(2100, 0, 1) / 1000;
const okTime = (v) => typeof v === 'number' && Number.isFinite(v) && v >= TIME_MIN && v < TIME_MAX;

// Przegląd bezpieczeństwa E2 (S1): plik sesji przychodzi z przeglądarki, więc kształt trade'a sprawdzamy przed wysyłką; zły trade → ValidationError → state 'error'
// tego jednego trade'a (nie blokuje kolejki i nie wraca co 60 s).
export function checkTradeShape(tr, t = (s) => s) {
  const bad = (field) => new ValidationError({ [field]: t('Uszkodzony trade w pliku sesji (pole {field}).', { field }) }, 'Uszkodzony trade w pliku sesji.');
  if (!/^t\d{1,9}$/.test(String(tr.id))) throw bad('id'); // H2 (S8): id = klucz idempotencji (MARKER_RE); spoza wzorca krok (2) by go nie rozpoznał
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tr.day))) throw bad('day');
  if (!okTime(tr.entryT)) throw bad('entryT');
  if (tr.exitT != null && !okTime(tr.exitT)) throw bad('exitT');
  if (!['ES', 'NQ', 'MES', 'MNQ'].includes(tr.instrument)) throw bad('instrument');
  if (tr.dir !== 'Long' && tr.dir !== 'Short') throw bad('dir');
  for (const k of ['setup', 'notes', 'contract']) if (tr[k] != null && typeof tr[k] !== 'string') throw bad(k);
}

// Trade sesji → dane formularza buildTradeProps (mapowanie z karty E2)
export function tradeInput(session, tr, { sessionOptions = [], kontaIds = [], t } = {}) {
  checkTradeShape(tr, t);
  const e = nyParts(tr.entryT);
  const inp = {
    name: `Backtest ${tr.instrument} ${tr.dir} ${tr.day}`, typ: 'Backtest', tz: TZ, date: e.date, time: e.time,
    instrument: tr.instrument, dir: tr.dir, btSession: btSessionValue(session.name, session.id, tr.id),
  };
  if (num(tr.exitT) != null) { const x = nyParts(tr.exitT); inp.exitDate = x.date; inp.exitTime = x.time; }
  if (tr.setup) inp.setup = String(tr.setup);
  const so = sessionOption(tr.entryT, sessionOptions);
  if (so) inp.session = so;
  for (const [k, v] of [['r', tr.r], ['pnl', tr.pnl], ['entryPrice', tr.entryPrice], ['exitPrice', tr.exitPrice], ['sl', tr.sl0], ['tp', tr.tp], ['btMae', tr.maeR], ['btMfe', tr.mfeR]]) if (num(v) != null) inp[k] = v;
  if (tr.be === true && num(tr.entryPrice) != null) inp.be = tr.entryPrice; // BE = stop przesunięty na cenę wejścia (B2)
  if (tr.contract) inp.contract = String(tr.contract);
  if (tr.notes) inp.notes = String(tr.notes);
  const acc = session.def?.accountId;
  if (acc && kontaIds.some((k) => String(k).replace(/-/g, '').toLowerCase() === String(acc).replace(/-/g, '').toLowerCase())) inp.konta = [acc]; // konto usunięte z bazy: trade bez konta
  return inp;
}
// opis trade'a do aktualizacji istniejącej strony (review E2 #2): pusty setup/notatka czyści pole
const updateInput = (tr) => ({ setup: tr.setup ? String(tr.setup) : '', notes: tr.notes ? String(tr.notes) : '' });

class TimeoutError extends Error { constructor(msg) { super(msg); this.name = 'TimeoutError'; } }
// Przejściowe (ponowić): Notion 429, 5xx, 409 conflict_error (transakcja nie przeszła), błąd sieci fetch, przekroczony czas. Reszta to błąd trade'a.
export function transient(e) {
  if (e instanceof NotionError) return e.status === 429 || e.status >= 500 || (e.status === 409 && e.notionCode === 'conflict_error');
  if (e instanceof TimeoutError || e?.name === 'AbortError' || e?.name === 'TimeoutError') return true;
  return e instanceof TypeError && /fetch failed|network|terminated|ECONN|socket/i.test(`${e.message} ${e.cause?.code || ''}`);
}
const errText = (e) => (e instanceof ValidationError && e.fields && Object.values(e.fields).some((x) => typeof x === 'string' && x.length > 4)
  ? Object.values(e.fields).filter((x) => typeof x === 'string').join(' ')
  : String(e?.message || e)).slice(0, 500);
const unsent = (doc) => (Array.isArray(doc?.trades) ? doc.trades.filter((x) => x && (x.notion?.state !== 'sent' || (x.notion.id && editedAfter(x)))).length : 0);

export function createBacktestSync({ store, writer, drawings, data, t = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? '')) : s), log = (...a) => console.error(...a), now = () => Date.now(), timeoutMs = REQUEST_TIMEOUT_MS }) {
  const queues = new Map();
  const serial = (id, fn) => {
    const run = (queues.get(id) || Promise.resolve()).catch(() => {}).then(fn);
    queues.set(id, run);
    run.finally(() => { if (queues.get(id) === run) queues.delete(id); }).catch(() => {});
    return run;
  };
  // review E2 #8: limit czasu tylko w tej wysyłce (wspólny klient Notion bez zmian: wgrywanie zrzutów do 10 MB może trwać dłużej). Zawieszone żądanie dalej trwa
  // w tle, ale kolejka sesji rusza dalej; zerwany POST pokrywają krok (2) i odstęp RECREATE_MS.
  const timed = (p) => {
    let tm;
    return Promise.race([p, new Promise((_, rej) => { tm = setTimeout(() => rej(new TimeoutError(t('Notion nie odpowiedział w ciągu {s} s.', { s: Math.max(1, Math.round(timeoutMs / 1000)) }))), timeoutMs); })]).finally(() => clearTimeout(tm));
  };
  const readSession = (sessionId) => {
    if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) throw new BacktestError(t('Nieprawidłowy identyfikator sesji backtestu.'), 400, 'bad-id');
    const doc = store.read(sessionId);
    if (!doc) throw new BacktestError(t('Nie ma takiej sesji backtestu.'), 404, 'not-found');
    return doc;
  };

  async function run({ sessionId, day = null, all = false, auto = false }) {
    const doc = readSession(sessionId);
    const res = { sent: 0, skipped: 0, failed: [], pending: 0, notion: {} };
    const dayDone = (d) => doc.days?.[d]?.status === 'done';
    const todo = [];
    for (const tr of Array.isArray(doc.trades) ? doc.trades : []) {
      if (!tr || typeof tr.id !== 'string' || (day && tr.day !== day)) continue;
      const n = tr.notion || {}, st = n.state;
      const edited = editedAfter(tr);
      if (st === 'sent' && !(n.id && edited)) { res.skipped++; continue; }
      if (auto && !(dayDone(tr.day) && n.error)) continue; // timer: tylko ponowienie próbowanych z dni zakończonych
      if (st === 'error' && !all && !edited) { res.failed.push({ tradeId: tr.id, error: n.error || '' }); continue; }
      if (st !== 'sent' && tr.journal === 'todo' && !all) continue; // czeka na opis (setup), liczy się do „niezapisanych”
      todo.push(tr);
    }
    const setNotion = (tr, nn) => { tr.notion = nn; store.setNotion(sessionId, tr.id, nn); };
    if (todo.length) {
      let byMarker = new Map(), sch = null, kontaIds = [];
      if (todo.some((tr) => !tr.notion?.id)) {
        try {
          sch = await timed(data.loadSchema('trades'));
          // krok (2): świeże dane z Notion (pomijają pamięć podręczną), znacznik → id strony
          const p = await timed(data.getPayload(true));
          kontaIds = (p.data?.konta || []).map((k) => k._id);
          for (const row of p.data?.trades || []) {
            const m = typeof row.btSession === 'string' ? MARKER_RE.exec(row.btSession) : null;
            if (m && m[1] === sessionId) byMarker.set(m[2], row._id);
          }
        } catch (e) {
          if (!transient(e)) throw e;
          log('[backtest] Notion niedostępne, wysyłka odłożona:', e.message);
          const error = errText(e);
          for (const tr of todo) { res.failed.push({ tradeId: tr.id, error }); setNotion(tr, { ...(tr.notion || {}), state: tr.notion?.state === 'sent' ? 'sent' : 'pending', error }); }
          todo.length = 0;
        }
      }
      for (let i = 0; i < todo.length; i++) {
        const tr = todo[i];
        const n0 = tr.notion || {};
        let id = n0.id || null, posting = false;
        const base = { edited: Number.isFinite(n0.edited) ? n0.edited : undefined, postAt: Number.isFinite(n0.postAt) ? n0.postAt : undefined };
        try {
          const ed = Number(tr.jEdited) || 0;
          if (!id && byMarker.has(tr.id)) { id = byMarker.get(tr.id); setNotion(tr, { id, state: 'pending', error: null, edited: base.edited }); }
          if (!id) {
            const inp = tradeInput(doc, tr, { sessionOptions: sch?.optionNames?.session || [], kontaIds, t }); // zły kształt → ValidationError, przed POST
            if (Number.isFinite(base.postAt) && now() - base.postAt < RECREATE_MS) {
              res.failed.push({ tradeId: tr.id, error: t('Czekam na potwierdzenie z Notion po zerwanym połączeniu.') });
              continue;
            }
            setNotion(tr, { id: null, state: 'pending', error: n0.error || null, postAt: now() }); // czas próby przed POST (także gdy proces padnie w trakcie)
            posting = true;
            const out = await timed(writer.backtestTrade(inp));
            posting = false;
            id = out.id;
            setNotion(tr, { id, state: 'pending', error: null, edited: ed }); // (3) id od razu w pliku sesji; opis z chwili utworzenia
          } else if (ed > (Number(tr.notion?.edited) || 0)) {
            checkTradeShape(tr, t);
            await timed(writer.backtestUpdate(updateInput(tr), id)); // review E2 #2: zmieniony opis → PATCH istniejącej strony
            setNotion(tr, { id, state: tr.notion?.state === 'sent' ? 'sent' : 'pending', error: null, edited: ed });
          }
          if (tr.notion?.state !== 'sent' && tr.drawings && Array.isArray(tr.drawings.d) && tr.drawings.d.length) await timed(drawings.save(id, tr.drawings));
          setNotion(tr, { id, state: 'sent', error: null, edited: Number(tr.notion?.edited) || ed });
          res.sent++;
        } catch (e) {
          const error = errText(e);
          res.failed.push({ tradeId: tr.id, error });
          // H2 (przegląd kodu #4): po przekroczonym czasie POST dalej trwa w tle, więc odstęp przed ponownym POST liczy się od chwili awarii, nie od wysłania
          const keep = { edited: tr.notion?.edited, ...(posting && !(e instanceof NotionError && e.status === 429) ? { postAt: e instanceof TimeoutError ? now() : tr.notion?.postAt } : {}) };
          if (transient(e)) {
            setNotion(tr, { id, state: tr.notion?.state === 'sent' ? 'sent' : 'pending', error, ...keep });
            // awaria przejściowa: reszta kolejki czeka na następną próbę (bez serii żądań do niedostępnego Notion), ale jest oznaczona jako próbowana (timer ją ponowi)
            for (const rest of todo.slice(i + 1)) { res.failed.push({ tradeId: rest.id, error }); setNotion(rest, { ...(rest.notion || {}), state: rest.notion?.state === 'sent' ? 'sent' : 'pending', error }); }
            break;
          }
          setNotion(tr, { id, state: 'error', error, edited: Number(tr.jEdited) || 0 }); // błąd przy tym opisie; nowy opis (jEdited) spróbuje znowu
        }
      }
    }
    const fresh = store.read(sessionId) || doc;
    res.pending = unsent(fresh);
    for (const tr of fresh.trades || []) if (tr?.id && tr.notion) res.notion[tr.id] = tr.notion;
    return res;
  }

  return {
    push: (opts = {}) => serial(String(opts.sessionId), () => run(opts)),
    pending: (sessionId) => unsent(readSession(sessionId)),
  };
}
