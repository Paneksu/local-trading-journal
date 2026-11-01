// Magazyn rysunków replayu Backtest (1.5.0, pakiet D1; K 31.10.2026): rysunki żyją w pliku sesji (`session.drawings[Sym]` = DrawingDoc `{ v: 1, at, d }`), per sesja
// i instrument (rodzina: MNQ → NQ, MES → ES). K: jeden dokument na instrument, widoczny na całej osi czasu jak w FX Replay ([U] 31.10.2026 «dzialanie fx replay ma byc
// wzorem»); stare rysunki per dzień przenosi migrateSession (bt-sesja.js). Rysunki są widoczne na każdym wykresie tego instrumentu w każdym interwale i nie dotykają
// `drawings-cache` trade'ów Live (18a.6): zapis idzie przez `ctx.saveDoc` z rysunki.js do `set`, a plik sesji zapisuje wywołujący (`save`, klient sesji z opóźnieniem).
// Czysty moduł, bez DOM. E1 bierze `snapshot` przy zamknięciu trade'a (migawka rysunków do trade'a).
// English: per-session drawing store keyed by instrument family (one document for the whole timeline); subscribers get changes made on another chart; snapshot returns a deep copy.
import { FAMILY } from './kontrakty.js';

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
export const symOf = (inst) => (Object.hasOwn(FAMILY, inst) ? FAMILY[inst] : String(inst || ''));
const blank = () => ({ v: 1, at: new Date().toISOString(), d: [] });
const isDoc = (x) => !!x && typeof x === 'object' && Array.isArray(x.d);

// createDrawingStore({ getSession, save }) → { docOf, set, snapshot, subscribe }
// getSession() → dokument sesji (albo null), save() woła wywołujący po zmianie w pliku sesji.
export function createDrawingStore({ getSession, save = () => {} }) {
  const subs = new Map(); // sym → Set<fn>
  const cur = (sym) => { const d = getSession()?.drawings?.[sym]; return isDoc(d) ? d : null; };
  return {
    // Aktualny dokument instrumentu (referencja do pliku sesji; do odczytu). Brak rysunków → pusty dokument bez zapisu w sesji.
    docOf(sym) { return cur(symOf(sym)) || blank(); },
    // set(sym, doc, { origin, persist }): origin nie dostaje własnego powiadomienia; persist: false = tylko pamięć (podgląd na żywo między wykresami)
    set(sym, doc, { origin = null, persist = true } = {}) {
      const key = symOf(sym), prev = cur(key), s = getSession();
      if (!s) return false;
      const next = clone(doc) || blank();
      // bez zmiany: bez powiadomień
      if (prev && JSON.stringify(prev.d) === JSON.stringify(next.d)) { if (persist) save(); return false; }
      // pusty dokument instrumentu bez rysunków nie zaśmieca pliku sesji
      if (!prev && !(next.d || []).length) return false;
      (s.drawings ||= {})[key] = next;
      for (const fn of subs.get(key) || []) { try { fn(next, origin); } catch { /* subskrybent nie może zablokować zapisu */ } }
      if (persist) save();
      return true;
    },
    // Kopia dokumentu: zmiana po snapshocie nie rusza zwróconego obiektu, zmiana zwróconego nie rusza magazynu.
    snapshot(sym) { const d = cur(symOf(sym)); return d ? clone(d) : blank(); },
    // subscribe(sym, fn(doc, origin)) → off
    subscribe(sym, fn) {
      const key = symOf(sym);
      if (!subs.has(key)) subs.set(key, new Set());
      subs.get(key).add(fn);
      return () => subs.get(key)?.delete(fn);
    },
  };
}
