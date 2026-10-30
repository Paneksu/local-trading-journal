// Magazyn sesji modułu Backtest (1.5.0, pakiet C1): plik chart-data/backtest/sessions/<id>.json jest źródłem prawdy stanu sesji.
// Zapis atomowy (plik tymczasowy + rename, jak lib/candles-store.mjs writeAtomic) i kontrola wersji: save(id, doc, baseRev) przechodzi tylko,
// gdy baseRev równa się rev pliku na dysku (nowa sesja: 0), inaczej 409 `stale` i plik zostaje bez zmian (dwie karty tej samej sesji).
// Identyfikator wyłącznie z SESSION_ID_RE, więc ścieżka nie wychodzi poza katalog sesji.
// English: backtest session store: one JSON file per session, atomic write, optimistic revision check (409 stale).
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const SESSION_ID_RE = /^bt-[a-z0-9]{6,20}$/;
export const SESSION_BODY_LIMIT = 4 * 1024 * 1024;

export class BacktestError extends Error {
  constructor(message, status = 400, code = 'bad-request') { super(message); this.status = status; this.code = code; }
}

const tt = (t, s, v) => (t ? t(s, v) : v ? s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? '')) : s);

function writeAtomic(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, file);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* nie było pliku tymczasowego */ }
    throw e;
  }
}

// baseDir = katalog chart-data (jak magazyn świec i rysunków); sesje w <baseDir>/backtest/sessions.
export function createBacktestStore({ baseDir, t, log = (...a) => console.error(...a), now = () => Date.now() } = {}) {
  const dir = path.join(baseDir, 'backtest', 'sessions');
  const checkId = (id) => {
    if (typeof id !== 'string' || !SESSION_ID_RE.test(id)) throw new BacktestError(tt(t, 'Nieprawidłowy identyfikator sesji backtestu.'), 400, 'bad-id');
    return path.join(dir, id + '.json');
  };
  const load = (file) => JSON.parse(readFileSync(file, 'utf8'));
  // Przegląd bezpieczeństwa E2 (S3, S4): nieczytelny plik sesji albo błąd systemu plików wraca jako BacktestError z ogólnym komunikatem (bez ścieżki i treści
  // wyjątku w odpowiedzi HTTP), szczegóły tylko w logu serwera. Uszkodzony plik = kod 'corrupt' (422), nie „zmiana w innej karcie”.
  const corrupt = () => new BacktestError(tt(t, 'Plik sesji backtestu jest uszkodzony.'), 422, 'corrupt');
  function loadSafe(file) {
    let d;
    try { d = load(file); } catch (e) { log('[backtest] nieczytelny plik sesji', path.basename(file), e.message); throw corrupt(); }
    if (!d || typeof d !== 'object' || Array.isArray(d)) { log('[backtest] plik sesji nie jest obiektem', path.basename(file)); throw corrupt(); }
    return d;
  }
  function writeSafe(file, body) {
    try { writeAtomic(file, body); } catch (e) { log('[backtest] zapis pliku sesji', path.basename(file), e.message); throw new BacktestError(tt(t, 'Nie udało się zapisać pliku sesji backtestu.'), 500, 'io'); }
  }
  const NEW_NOTION = () => ({ id: null, state: 'pending', error: null });

  function read(id) {
    const file = checkId(id);
    if (!existsSync(file)) return null;
    return loadSafe(file);
  }

  function save(id, doc, baseRev) {
    const file = checkId(id);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new BacktestError(tt(t, 'Nieprawidłowe dane sesji backtestu.'), 400, 'bad-doc');
    const base = baseRev == null ? 0 : Number(baseRev);
    if (!Number.isInteger(base) || base < 0) throw new BacktestError(tt(t, 'Nieprawidłowe dane sesji backtestu.'), 400, 'bad-rev');
    let cur = 0, old = null;
    if (existsSync(file)) { old = loadSafe(file); cur = Number(old.rev) || 0; } // uszkodzony plik: 422 corrupt, żadna wersja klienta go nie nadpisze po cichu
    if (cur !== base) throw new BacktestError(tt(t, 'Sesja zmieniła się w innej karcie. Otwórz ją ponownie.'), 409, 'stale');
    const rev = base + 1;
    const out = { ...doc, id, rev, updated: new Date(now()).toISOString() };
    // E2: pole notion trade'a należy do serwera (wysyłka do Notion, lib/backtest-sync.mjs): stan z pliku wygrywa ze stanem przeglądarki, która mogła go jeszcze nie znać
    // S2: trade nieznany serwerowi zawsze zaczyna od stanu „do wysłania”, cokolwiek przysłała przeglądarka (np. skopiowane id strony)
    const known = new Map((Array.isArray(old?.trades) ? old.trades : []).filter((x) => x && typeof x.id === 'string' && x.notion).map((x) => [x.id, x.notion]));
    if (Array.isArray(out.trades)) out.trades = out.trades.map((x) => (x && typeof x === 'object' ? { ...x, notion: known.get(x.id) || NEW_NOTION() } : x));
    const body = JSON.stringify(out);
    if (Buffer.byteLength(body) > SESSION_BODY_LIMIT) throw new BacktestError(tt(t, 'Sesja jest zbyt duża.'), 413, 'too-large');
    writeSafe(file, body);
    return { rev };
  }

  // E2: stan wysyłki do Notion jednego trade'a (id strony, state, error), zapis od razu, bez podbijania rev (zapis przeglądarki i tak go zachowa, patrz save).
  // Synchroniczny odczyt i zapis w jednym procesie, więc nie przeplata się z save().
  function setNotion(id, tradeId, notion) {
    const file = checkId(id);
    if (!existsSync(file)) throw new BacktestError(tt(t, 'Nie ma takiej sesji backtestu.'), 404, 'not-found');
    const d = loadSafe(file);
    const tr = (Array.isArray(d.trades) ? d.trades : []).find((x) => x && x.id === tradeId);
    if (!tr) return false;
    // edited: jEdited opisu wysłanego do Notion; postAt: czas ostatniej próby utworzenia strony (odstęp po zerwanym POST, review E2 #6)
    tr.notion = { id: notion?.id || null, state: notion?.state || 'pending', error: notion?.error || null };
    if (Number.isFinite(notion?.edited)) tr.notion.edited = notion.edited;
    if (Number.isFinite(notion?.postAt)) tr.notion.postAt = notion.postAt;
    writeSafe(file, JSON.stringify(d));
    return true;
  }

  // Lista do zakładki: skrót każdej sesji, od ostatnio zmienionej. Uszkodzony plik jest pomijany (wpis w logu), reszta listy działa.
  function list() {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json') || !SESSION_ID_RE.test(f.slice(0, -5))) continue;
      let d;
      try { d = load(path.join(dir, f)); } catch (e) { log('[backtest] pominięty uszkodzony plik sesji', f, e.message); continue; }
      if (!d || typeof d !== 'object') { log('[backtest] pominięty uszkodzony plik sesji', f); continue; }
      const trades = Array.isArray(d.trades) ? d.trades : [];
      const sumR = trades.reduce((a, x) => a + (Number.isFinite(x?.r) ? x.r : 0), 0);
      out.push({
        id: f.slice(0, -5), name: String(d.name ?? ''), instruments: Array.isArray(d.def?.instruments) ? d.def.instruments : [],
        done: Object.values(d.days || {}).filter((x) => x?.status === 'done').length, pool: Array.isArray(d.pool) ? d.pool.length : 0,
        sumR: Math.round(sumR * 100) / 100, trades: trades.length, unsent: trades.filter((x) => x && x.notion?.state !== 'sent').length, todo: trades.filter((x) => x?.journal === 'todo').length, lastOpened: d.opened || d.updated || null, updated: d.updated || '',
        def: d.def && typeof d.def === 'object' ? d.def : null, // E2: kopia definicji w ustawieniach (bt.sessionsCopy)
      });
    }
    return out.sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
  }

  // G (review F1–G #6): lekkie źródło statystyk: tylko to, co liczą statystyki (nazwa, kolejność dni, status dni, trade'y bez migawek rysunków), bez rysunków sesji i księgi.
  // ids = tablica identyfikatorów albo null (wszystkie sesje). Zły identyfikator = 400; plik nieczytelny albo brakujący trafia do failed (widok mówi, ile sesji pominął).
  function forStats(ids) {
    const files = ids == null
      ? (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json') && SESSION_ID_RE.test(f.slice(0, -5))).map((f) => f.slice(0, -5)) : [])
      : (Array.isArray(ids) ? ids : []).map((id) => { checkId(id); return id; });
    const sessions = [], failed = [];
    for (const id of [...new Set(files)]) {
      let d;
      try { d = existsSync(checkId(id)) ? load(checkId(id)) : null; } catch (e) { log('[backtest] statystyki: nieczytelny plik sesji', id, e.message); d = null; }
      if (!d || typeof d !== 'object' || Array.isArray(d)) { failed.push(id); continue; }
      sessions.push({
        id, name: String(d.name ?? ''), def: d.def && typeof d.def === 'object' ? { order: d.def.order, instruments: d.def.instruments, from: d.def.from, to: d.def.to } : {},
        days: Object.fromEntries(Object.entries(d.days && typeof d.days === 'object' ? d.days : {}).map(([k, v]) => [k, { status: v?.status }])),
        trades: (Array.isArray(d.trades) ? d.trades : []).filter((x) => x && typeof x === 'object').map(({ drawings, ...rest }) => rest),
      });
    }
    return { sessions, failed };
  }

  return { read, save, setNotion, list, forStats, dir };
}
