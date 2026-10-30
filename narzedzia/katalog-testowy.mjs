// Strażnik katalogów odbioru backtestu (H2, przegląd bezpieczeństwa S6/S7, sesja główna podniosła do P1): cel kopii świec (narzedzia/kopia-swiec-odbior.mjs) i katalog
// konfiguracji instancji testowej (testy/start-test.mjs, testy/backtest-e2e.mjs) wolno brać WYŁĄCZNIE z allowlisty: R:/PROJEKTY/trading-hq-wt/backtest-dane albo katalog
// tymczasowy systemu. Ścieżka sprawdzana po realpath (junction, subst, nazwa 8.3 nie przemycą produkcji), wszystko w R:/PROJEKTY/trading-hq odrzucane zawsze.
// Ścieżka, której jeszcze nie ma: realpath najbliższego istniejącego przodka + reszta.
// English: allowlist guard for acceptance-test data/config directories (realpath-checked; the production install is always refused).
import { realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const PROD_DIR = 'R:/PROJEKTY/trading-hq';
export const TEST_DATA_DIR = 'R:/PROJEKTY/trading-hq-wt/backtest-dane';
export const ALLOWED_DIRS = [TEST_DATA_DIR, tmpdir()];

export function realOf(p) {
  let cur = path.resolve(String(p));
  const rest = [];
  while (!existsSync(cur)) {
    const up = path.dirname(cur);
    if (up === cur) break;
    rest.unshift(path.basename(cur));
    cur = up;
  }
  let base = cur;
  try { base = realpathSync.native(cur); } catch { /* korzeń dysku bez dostępu: zostaje ścieżka po resolve */ }
  return path.join(base, ...rest);
}
const norm = (p) => path.resolve(p).toLowerCase();
export const insideDir = (p, dir) => { const a = norm(p), b = norm(dir); return a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep); };

// Zwraca realpath katalogu albo rzuca błąd z powodem. allowed/prod wstrzykiwane w testach (katalogi tymczasowe zamiast prawdziwej produkcji).
export function checkTestDir(p, { allowed = ALLOWED_DIRS, prod = PROD_DIR, what = 'Katalog' } = {}) {
  if (!p) throw new Error(`${what}: brak ścieżki.`);
  const real = realOf(p);
  const prods = [path.resolve(prod), realOf(prod)];
  if (prods.some((d) => insideDir(real, d) || insideDir(path.resolve(String(p)), d))) throw new Error(`${what} ${p} leży w instalacji produkcyjnej (${prod}): odmowa.`);
  const ok = allowed.map((d) => realOf(d)).some((d) => insideDir(real, d));
  if (!ok) throw new Error(`${what} ${p} (${real}) jest poza dozwolonymi: ${allowed.join(', ')}.`);
  return real;
}
