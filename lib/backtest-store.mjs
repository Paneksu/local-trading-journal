// Magazyn sesji modułu Backtest (1.5.0, pakiet C1): plik chart-data/backtest/sessions/<id>.json jest źródłem prawdy stanu sesji.
// Zapis atomowy (plik tymczasowy + rename, jak lib/candles-store.mjs writeAtomic) i kontrola wersji: save(id, doc, baseRev) przechodzi tylko,
// gdy baseRev równa się rev pliku na dysku (nowa sesja: 0), inaczej 409 `stale` i plik zostaje bez zmian (dwie karty tej samej sesji).
// Identyfikator wyłącznie z SESSION_ID_RE, więc ścieżka nie wychodzi poza katalog sesji.
// English: backtest session store: one JSON file per session, atomic write, optimistic revision check (409 stale).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { migrateSession } from '../public/js/bt-sesja.js';

export const SESSION_ID_RE = /^bt-[a-z0-9]{6,20}$/;
export const SESSION_BODY_LIMIT = 4 * 1024 * 1024;
export const REMOVED_DIR = 'usuniete';
// 1.7.0: kopia pliku sesji w kształcie 1.6.x (księga sprzed migracji) przy pierwszym zapisie sesji w nowej wersji: sessions/kopie-1.6/<id>.json (raz, nie nadpisuje)
export const LEGACY_DIR = 'kopie-1.6';

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
// fsx: operacje na plikach kopii (do wstrzykiwania błędów w testach); domyślnie prawdziwe
export function createBacktestStore({ baseDir, t, log = (...a) => console.error(...a), now = () => Date.now(), fsx = { copyFileSync, renameSync } } = {}) {
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
    // K (31.10.2026) [U] «Przenieś»: plik v1 wraca jako v2; na dysku zmienia się dopiero przy zapisie z przeglądarki
    // nietypowy kształt księgi nie może zwrócić 500: plik, którego migracja rzuca, to „uszkodzony” (422)
    try { return migrateSession(loadSafe(file)); } catch (e) { if (e instanceof BacktestError) throw e; log('[backtest] migracja pliku sesji nie powiodła się', path.basename(file), e.message); throw corrupt(); }
  }

  // Powrót do 1.6.x po otwarciu sesji w 1.7.0 (model pozycji §6.2): plik z księgą sprzed wersji 3 jest kopiowany bajt w bajt, zanim pierwszy zapis go zastąpi; kopii nie nadpisujemy.
  // Decyzja sesji głównej 2.11.2026: pierwszy zapis w formacie 1.7 następuje DOPIERO po udanej kopii. Gdy kopia się nie uda (pełny dysk, blokada pliku), zapis sesji kończy się błędem
  // 500 `legacy-copy`, plik zostaje w formacie 1.6 nietknięty, sesja w przeglądarce zostaje, a następny zapis ponawia próbę kopii (plik nadal jest sprzed wersji 3).
  // Kopia jest atomowa (plik tymczasowy + rename), więc przerwana kopia nie udaje gotowej.
  function keepLegacy(id, file, old) {
    if (!old || !old.book || (Number(old.book.v) || 0) >= 3) return;
    const to = path.join(dir, LEGACY_DIR, id + '.json');
    if (existsSync(to)) return;
    const tmp = to + '.tmp';
    try { mkdirSync(path.dirname(to), { recursive: true }); fsx.copyFileSync(file, tmp); fsx.renameSync(tmp, to); } catch (e) {
      try { unlinkSync(tmp); } catch { /* nie było pliku tymczasowego */ }
      log('[backtest] kopia pliku sesji 1.6 nie powiodła się, plik sesji zostaje w formacie 1.6 (zapis odrzucony, następny zapis ponowi kopię)', id, e.message);
      throw new BacktestError(tt(t, 'Nie udało się zrobić kopii sesji sprzed wersji 1.7, więc jej nie zapisałem. Plik sesji jest bez zmian, spróbuję przy następnym zapisie.'), 500, 'legacy-copy');
    }
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
    keepLegacy(id, file, old);
    writeSafe(file, body);
    sweepRestored(id, out.trades);
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
    // L (31.10.2026): drawn = dEdited rysunków ostatnio wysłanych do Notion (ponowna wysyłka migawki poprawionej w Journalu); brak w zmianie = bez zmian
    const drawn = Number.isFinite(notion?.drawn) ? notion.drawn : tr.notion?.drawn;
    tr.notion = { id: notion?.id || null, state: notion?.state || 'pending', error: notion?.error || null };
    if (Number.isFinite(notion?.edited)) tr.notion.edited = notion.edited;
    if (Number.isFinite(notion?.postAt)) tr.notion.postAt = notion.postAt;
    if (Number.isFinite(drawn)) tr.notion.drawn = drawn;
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
      try { d = migrateSession(d); } catch (e) { log('[backtest] pominięty plik sesji (migracja nie powiodła się)', f, e.message); continue; }
      const trades = Array.isArray(d.trades) ? d.trades : [];
      const sumR = trades.reduce((a, x) => a + (Number.isFinite(x?.r) ? x.r : 0), 0);
      out.push({
        id: f.slice(0, -5), name: String(d.name ?? ''), instruments: Array.isArray(d.def?.instruments) ? d.def.instruments : [],
        // K: zamiast „dni zrobione / w puli” data startu i kursor (ciągła oś czasu)
        from: String(d.def?.from ?? ''), cursor: Number.isFinite(d.cursor) ? d.cursor : null,
        // M (31.10.2026): wynik sesji także w $ (netto, jak w replayu i statystykach sesji)
        sumR: Math.round(sumR * 100) / 100, sumUsd: Math.round(trades.reduce((a, x) => a + (Number.isFinite(x?.pnl) ? x.pnl : 0), 0) * 100) / 100, trades: trades.length, unsent: trades.filter((x) => x && x.notion?.state !== 'sent').length, todo: trades.filter((x) => x?.journal === 'todo').length, lastOpened: d.opened || d.updated || null, updated: d.updated || '',
        def: d.def && typeof d.def === 'object' ? d.def : null, // E2: kopia definicji w ustawieniach (bt.sessionsCopy)
      });
    }
    return out.sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
  }

  // G (review F1–G #6): lekkie źródło statystyk: tylko to, co liczą statystyki (nazwa, instrumenty, trade'y bez migawek rysunków), bez rysunków sesji i księgi. K: bez statusów dni.
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
      try { d = migrateSession(d); } catch (e) { log('[backtest] statystyki: pominięty plik sesji (migracja nie powiodła się)', id, e.message); failed.push(id); continue; }
      sessions.push({
        id, name: String(d.name ?? ''), def: d.def && typeof d.def === 'object' ? { instruments: d.def.instruments, from: d.def.from, ...(Number.isFinite(d.def.balance) ? { balance: d.def.balance } : {}) } : {}, // L: saldo startowe do % w statystykach sesji
        trades: (Array.isArray(d.trades) ? d.trades : []).filter((x) => x && typeof x === 'object').map(({ drawings, ...rest }) => rest),
      });
    }
    return { sessions, failed };
  }

  // [U] 1.11.2026 «oraz dodaj mozliwosc usuniecia sesji bo aktualnie sie nie da»: usunięcie przenosi plik sesji do sessions/usuniete/<id>-<czas>.json (nie kasuje),
  // restore przywraca ostatnią usuniętą wersję bajt w bajt. list() i forStats() czytają tylko pliki z katalogu sesji, więc usunięte nie wchodzą do listy ani do statystyk.
  const rdir = path.join(dir, REMOVED_DIR);
  const stampOf = () => new Date(now()).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  function remove(id) {
    const file = checkId(id);
    if (!existsSync(file)) throw new BacktestError(tt(t, 'Nie ma takiej sesji backtestu.'), 404, 'not-found');
    try {
      mkdirSync(rdir, { recursive: true });
      let name = `${id}-${stampOf()}.json`, n = 1;
      while (existsSync(path.join(rdir, name))) name = `${id}-${stampOf()}-${n++}.json`;
      renameSync(file, path.join(rdir, name));
      return { ok: true, file: name };
    } catch (e) { log('[backtest] usuwanie pliku sesji', id, e.message); throw new BacktestError(tt(t, 'Nie udało się usunąć sesji backtestu.'), 500, 'io'); }
  }
  // kolejność od najstarszej: znacznik czasu, potem numer sufiksu jako liczba (tekstowo „-10” wypadałoby przed „-2”, a nazwa bez sufiksu po wszystkich)
  const byNewest = (a, b) => {
    const k = (n) => { const m = /(\d{8}T\d{6}Z)(?:-(\d+))?\.json$/.exec(n); return [m[1], Number(m[2] || 0)]; };
    const [sa, na] = k(a), [sb, nb] = k(b);
    return sa < sb ? -1 : sa > sb ? 1 : na - nb;
  };
  function restore(id) {
    const file = checkId(id);
    if (existsSync(file)) throw new BacktestError(tt(t, 'Sesja o tym identyfikatorze już istnieje.'), 409, 'exists');
    const re = new RegExp(`^${id}-\\d{8}T\\d{6}Z(-\\d+)?\\.json$`);
    const found = existsSync(rdir) ? readdirSync(rdir).filter((f) => re.test(f)).sort(byNewest) : [];
    if (!found.length) throw new BacktestError(tt(t, 'Nie ma usuniętej sesji o tym identyfikatorze.'), 404, 'not-found');
    try { renameSync(path.join(rdir, found[found.length - 1]), file); return { ok: true }; } catch (e) { log('[backtest] przywracanie pliku sesji', id, e.message); throw new BacktestError(tt(t, 'Nie udało się przywrócić sesji backtestu.'), 500, 'io'); }
  }

  // [U] 2026-11-01 «Archiwum Notion + Cofnij» (usuwanie trade'ów): księga usuniętych trade'ów w backtest/removed-trades/<sesja>-<trade>-<czas>.json (poza katalogiem sesji,
  // więc lista, statystyki i licznik dysku jej nie widzą). Wpis powstaje przed zmianą w Notion: trade z pełnymi danymi i id strony wraca stąd przy Cofnij i do ręcznego odzyskania.
  const ldir = path.join(path.dirname(dir), 'removed-trades');
  const TRADE_ID_RE = /^t\d{1,9}$/;
  const checkTradeId = (tradeId) => {
    if (typeof tradeId !== 'string' || !TRADE_ID_RE.test(tradeId)) throw new BacktestError(tt(t, 'Nieprawidłowy numer trade\'a.'), 400, 'bad-trade-id');
    return tradeId;
  };
  // restored: false = księga bieżąca, true = kopie po Cofnij (sprzątane dopiero po potwierdzonym zapisie sesji z trade'em, patrz sweepRestored); sortowanie jak w restore sesji (byNewest)
  const redir = path.join(ldir, 'restored');
  const ledgerFiles = (id, tradeId, restored = false) => {
    checkId(id); checkTradeId(tradeId);
    const re = new RegExp(`^${id}-${tradeId}-\\d{8}T\\d{6}Z(-\\d+)?\\.json$`);
    const d = restored ? redir : ldir;
    return existsSync(d) ? readdirSync(d).filter((f) => re.test(f)).sort(byNewest) : [];
  };
  function ledgerPut(id, tradeId, rec) {
    ledgerFiles(id, tradeId);
    let name = `${id}-${tradeId}-${stampOf()}.json`, n = 1;
    while (existsSync(path.join(ldir, name))) name = `${id}-${tradeId}-${stampOf()}-${n++}.json`;
    writeSafe(path.join(ldir, name), JSON.stringify(rec));
    return name;
  }
  // ostatni wpis księgi tego trade'a albo null
  function ledgerGet(id, tradeId, { restored = false } = {}) {
    const f = ledgerFiles(id, tradeId, restored).pop();
    if (!f) return null;
    try { return { file: f, restored, ...load(path.join(restored ? redir : ldir, f)) }; } catch (e) { log('[backtest] nieczytelny wpis księgi usuniętych trade\'ów', f, e.message); throw corrupt(); }
  }
  function ledgerDrop(id, tradeId, file = null) {
    for (const f of file ? [file] : ledgerFiles(id, tradeId).slice(-1)) { try { unlinkSync(path.join(ldir, path.basename(f))); } catch { /* już go nie ma */ } }
  }
  // po Cofnij wpis nie jest kasowany, tylko przenoszony do restored/ (jedyna pełna kopia trade'a z rysunkami, MAE/MFE i notatką)
  function ledgerRestored(id, tradeId, file) {
    checkId(id); checkTradeId(tradeId);
    const from = path.join(ldir, path.basename(file)), to = path.join(redir, path.basename(file));
    // dwie próby (Windows potrafi chwilowo blokować plik); gdy obie zawiodą, wpis i tak wychodzi z bieżącej księgi, bo inaczej ledgerIds wykluczałby przywrócony trade
    // z wysyłki do Notion na zawsze i nikt by tego nie widział (kopia przepada, ale trade jest już w sesji przeglądarki); gdy nie da się nawet skasować, błąd io
    for (let attempt = 0; attempt < 2; attempt++) {
      try { mkdirSync(redir, { recursive: true }); renameSync(from, to); return 'moved'; } catch (e) { log('[backtest] przenoszenie wpisu księgi do restored nie powiodło się', file, e.message); }
    }
    try { unlinkSync(from); } catch (e) {
      log('[backtest] nie da się usunąć wpisu księgi po nieudanym przeniesieniu do restored', file, e.message);
      throw new BacktestError(tt(t, 'Nie udało się zapisać kopii trade\'a. Spróbuj ponownie za chwilę.'), 500, 'io');
    }
    return 'dropped';
  }
  // numery trade'ów sesji, które mają wpis w bieżącej księdze (trwa albo jest niedokończone usuwanie): wysyłka do Notion ich pomija
  function ledgerIds(id) {
    checkId(id);
    const out = new Set();
    if (!existsSync(ldir)) return out;
    const re = new RegExp(`^${id}-(t\\d{1,9})-\\d{8}T\\d{6}Z(-\\d+)?\\.json$`);
    for (const f of readdirSync(ldir)) { const m = re.exec(f); if (m) out.add(m[1]); }
    return out;
  }
  // zapis sesji z trade'em potwierdza, że Cofnij się udało: kopia z restored/ jest już niepotrzebna
  function sweepRestored(id, trades) {
    if (!existsSync(redir)) return;
    const have = new Set((Array.isArray(trades) ? trades : []).filter((x) => x && typeof x.id === 'string').map((x) => x.id));
    const re = new RegExp(`^${id}-(t\\d{1,9})-\\d{8}T\\d{6}Z(-\\d+)?\\.json$`);
    for (const f of readdirSync(redir)) { const m = re.exec(f); if (m && have.has(m[1])) { try { unlinkSync(path.join(redir, f)); } catch { /* już go nie ma */ } } }
  }
  // trade o tym numerze w pliku sesji albo null (Dziennik odmawia usunięcia trade'a, który należy do sesji backtestu)
  function sessionTrade(id, tradeId) {
    const file = checkId(id);
    if (!existsSync(file)) return null;
    try { return (load(file).trades || []).find((x) => x && x.id === tradeId) || null; } catch { return null; }
  }

  return { read, save, setNotion, list, forStats, remove, restore, ledgerPut, ledgerGet, ledgerDrop, ledgerRestored, ledgerIds, sessionTrade, dir };
}
