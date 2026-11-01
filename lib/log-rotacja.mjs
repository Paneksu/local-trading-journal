#!/usr/bin/env node
// N6 (1.6.0): rotacja dashboard.log. Log rósł bez limitu (§3.4 specyfikacji N), więc przed każdym otwarciem pliku do dopisywania
// (Dashboard.vbs, start.sh, lib/restart.mjs) plik większy niż 5 MB przechodzi w dashboard.1.log, a starsze przesuwają się o jeden;
// zostają najwyżej 3 pliki (bieżący, .1, .2). Działa przed startem serwera, bo na Windows otwartego pliku nie da się przemianować.
// Log rotation before the log is opened: over 5 MB → dashboard.1.log, at most 3 files.
//   node lib/log-rotacja.mjs [ścieżka]   (domyślnie <THQ_CONFIG_DIR albo katalog aplikacji>/dashboard.log)
import { existsSync, statSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOG_MAX_BYTES = 5 * 1024 * 1024;
export const LOG_KEEP = 3;

// dashboard.log → dashboard.1.log (n ≥ 1)
export const rotatedName = (file, n) => {
  const ext = path.extname(file);
  return path.join(path.dirname(file), `${path.basename(file, ext)}.${n}${ext}`);
};

// fs: podmiana funkcji systemu plików (test blokady pliku)
export function rotateLog(file, { maxBytes = LOG_MAX_BYTES, keep = LOG_KEEP, fs = {} } = {}) {
  const F = { existsSync, statSync, renameSync, rmSync, ...fs };
  // final (review kodu P3-1): najpierw bieżący plik idzie na bok (.rotating). Na Windows otwarty log (cmd … >> dashboard.log) daje tu EBUSY
  // i wtedy nic nie kasujemy ani nie przesuwamy; dopiero po udanym przemianowaniu najstarszy wypada, a reszta przesuwa się o jeden
  const side = file + '.rotating';
  try {
    // .rotating z przerwanej rotacji: kończymy ją tym plikiem, bieżący log czeka na następny start
    const leftover = F.existsSync(side);
    if (!leftover) {
      if (!F.existsSync(file) || F.statSync(file).size < maxBytes) return { rotated: false };
      F.renameSync(file, side);
    }
  } catch (e) {
    // plik zajęty (inny proces trzyma log) albo brak praw: log zostaje, start serwera idzie dalej
    return { rotated: false, error: e.message };
  }
  try {
    F.rmSync(rotatedName(file, keep - 1), { force: true });
    for (let n = keep - 2; n >= 1; n--) if (F.existsSync(rotatedName(file, n))) F.renameSync(rotatedName(file, n), rotatedName(file, n + 1));
    F.renameSync(side, rotatedName(file, 1));
    return { rotated: true };
  } catch (e) {
    // przesunięcie starszych nie wyszło: plik z boku zostaje jako .rotating i następny start dokończy rotację
    return { rotated: false, error: e.message };
  }
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  const root = path.join(path.dirname(self), '..');
  const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(process.env.THQ_CONFIG_DIR || root, 'dashboard.log');
  const r = rotateLog(file);
  if (r.error) console.error(`[log] ${r.error}`);
  process.exit(0);
}
