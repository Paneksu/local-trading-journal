// Magazyn rysunków replayu Backtest (1.5.0, pakiet D1): rysunki żyją w pliku sesji (`session.drawings[Sym][Day]` = DrawingDoc `{ v: 1, at, d }`), per sesja, instrument
// (rodzina: MNQ → NQ, MES → ES) i dzień replayu. Są widoczne na każdym wykresie tego instrumentu w każdym interwale i nie dotykają `drawings-cache` trade'ów Live (18a.6):
// zapis idzie przez `ctx.saveDoc` z rysunki.js do `set`, a plik sesji zapisuje wywołujący (`save`, klient sesji z opóźnieniem).
// Czysty moduł, bez DOM: testuje go strona testy/backtest-uklady.html. E1 bierze `snapshot` przy zamknięciu trade'a (migawka rysunków do trade'a).
// English: per-session drawing store keyed by instrument family and replay day; subscribers get changes made on another chart; snapshot returns a deep copy.
import { FAMILY } from './kontrakty.js';

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
export const symOf = (inst) => (Object.hasOwn(FAMILY, inst) ? FAMILY[inst] : String(inst || ''));
const blank = () => ({ v: 1, at: new Date().toISOString(), d: [] });

// createDrawingStore({ getSession, save }) → { docOf, set, snapshot, subscribe }
// getSession() → dokument sesji (albo null), save() woła wywołujący po zmianie w pliku sesji.
export function createDrawingStore({ getSession, save = () => {} }) {
  const subs = new Map(); // sym → Set<fn>
  const slot = (sym, create) => {
    const s = getSession();
    if (!s) return null;
    if (!create) return s.drawings?.[sym] || null;
    const all = (s.drawings ||= {});
    return (all[sym] ||= {});
  };
  return {
    // Aktualny dokument (referencja do pliku sesji; do odczytu). Brak rysunków → pusty dokument bez zapisu w sesji.
    docOf(sym, day) { return slot(symOf(sym), false)?.[day] || blank(); },
    // set(sym, day, doc, { origin, persist }): origin nie dostaje własnego powiadomienia; persist: false = tylko pamięć (podgląd na żywo między wykresami)
    set(sym, day, doc, { origin = null, persist = true } = {}) {
      const key = symOf(sym), prev = slot(key, false)?.[day];
      const next = clone(doc) || blank();
      if (prev && JSON.stringify(prev.d) === JSON.stringify(next.d)) { if (persist) save(); return false; } // bez zmiany: bez powiadomień (zapis na żądanie: wcześniejszy podgląd na żywo był tylko w pamięci)
      if (!prev && !(next.d || []).length) return false; // pusty dokument dla dnia bez rysunków nie zaśmieca pliku sesji
      slot(key, true)[day] = next;
      for (const fn of subs.get(key) || []) { try { fn(day, next, origin); } catch { /* subskrybent nie może zablokować zapisu */ } }
      if (persist) save();
      return true;
    },
    // Kopia dokumentu: zmiana po snapshocie nie rusza zwróconego obiektu, zmiana zwróconego nie rusza magazynu.
    snapshot(sym, day) { const d = slot(symOf(sym), false)?.[day]; return d ? clone(d) : blank(); },
    // subscribe(sym, fn(day, doc, origin)) → off
    subscribe(sym, fn) {
      const key = symOf(sym);
      if (!subs.has(key)) subs.set(key, new Set());
      subs.get(key).add(fn);
      return () => subs.get(key)?.delete(fn);
    },
  };
}
