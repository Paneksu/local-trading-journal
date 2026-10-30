// Kopia prawdziwych świec do odbioru backtestu (pakiet H1, 1.5.0). Jedyny dozwolony dotyk produkcji: ODCZYT.
// Kopiuje z R:/PROJEKTY/trading-hq/chart-data/ do R:/PROJEKTY/trading-hq-wt/backtest-dane/chart-data/ (poza worktree):
//   candles/NQ i candles/ES: pliki dni RRRR-MM-DD.bin z zakresu [--od, --do] we wszystkich warstwach (1m, 1s, 1m-<kontrakt>, 1s-<kontrakt>) i coverage.json,
//   contracts-nq.json, contracts-es.json, cały news/ i earnings/.
// Nigdy: .env, config.local.json, queue.json, import-*.json, backtest/, drawings-cache/. Źródło jest wyłącznie czytane (readdir, stat, copyFile jako źródło):
// żadnego zapisu, zmiany nazwy ani kasowania po stronie źródła (test backtest-H1: kopia świec tylko czyta źródło). Cel musi leżeć poza worktree i poza źródłem.
// Dane CME tylko do użytku własnego: kopia nigdy nie trafia do repo, testów (fixture), zrzutów wydania ani commitów.
// coverage.json kopiowany bez zmian (obejmuje też dni spoza zakresu): dzień spoza kopii czyta się jako pusty, a bez klucza Databento nic się nie pobiera.
// Użycie:
//   node narzedzia/kopia-swiec-odbior.mjs [--od=2023-11-01] [--do=2024-12-31] [--zrodlo=R:/PROJEKTY/trading-hq/chart-data] [--cel=R:/PROJEKTY/trading-hq-wt/backtest-dane/chart-data] [--proba]
// --proba: tylko liczy pliki i bajty, nic nie kopiuje. Ponowne uruchomienie pomija pliki o tym samym rozmiarze.
// English: read-only copy of real candles (NQ, ES), news and earnings for the backtest acceptance run; the source is never written.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkTestDir, ALLOWED_DIRS, PROD_DIR } from './katalog-testowy.mjs';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULTS = { src: 'R:/PROJEKTY/trading-hq/chart-data', dst: 'R:/PROJEKTY/trading-hq-wt/backtest-dane/chart-data', from: '2023-11-01', to: '2024-12-31' };
const SYMS = ['NQ', 'ES'];
const ROOT_FILES = ['contracts-nq.json', 'contracts-es.json'];
const TREES = ['news', 'earnings'];
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.bin$/;
const LAYER = /^1[ms](-[A-Z]{2}[FGHJKMNQUVXZ]\d{4})?$/;

const norm = (p) => path.resolve(p).toLowerCase();
const inside = (p, dir) => { const a = norm(p), b = norm(dir); return a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep); };

// Plan i wykonanie kopii. fs wstrzykiwany (test sprawdza, że źródło dostaje tylko odczyty); wynik: { files, bytes, copied, skipped }.
export async function copyForAcceptance({ src = DEFAULTS.src, dst = DEFAULTS.dst, from = DEFAULTS.from, to = DEFAULTS.to, root = ROOT, dry = false, fs = fsp, log = () => {}, allowed = ALLOWED_DIRS, prod = PROD_DIR } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new Error(`Zły zakres dat: ${from} … ${to}`);
  if (inside(dst, root) || inside(root, dst)) throw new Error(`Cel ${dst} leży w worktree ${root}: świece nie mogą trafić do repo.`);
  // H2 (S6, P1): cel tylko z allowlisty (backtest-dane albo katalog tymczasowy), po realpath; R:/PROJEKTY/trading-hq zawsze odrzucony, także z innym źródłem
  dst = checkTestDir(dst, { allowed, prod, what: 'Cel' });
  if (inside(dst, src) || inside(src, dst)) throw new Error(`Cel ${dst} i źródło ${src} nachodzą na siebie.`);
  const res = { files: 0, bytes: 0, copied: 0, skipped: 0 };
  const statOr = async (p) => { try { return await fs.stat(p); } catch { return null; } };
  // jedyne operacje zapisu: mkdir i copyFile, zawsze z celem w dst
  const put = async (a, b) => {
    if (!inside(b, dst) || inside(b, src)) throw new Error(`Zapis poza celem: ${b}`);
    const s = await fs.stat(a);
    res.files += 1; res.bytes += s.size;
    if (dry) return;
    const d = await statOr(b);
    if (d && d.size === s.size) { res.skipped += 1; return; }
    await fs.mkdir(path.dirname(b), { recursive: true });
    await fs.copyFile(a, b);
    res.copied += 1;
  };
  const list = async (dir) => { try { return await fs.readdir(dir, { withFileTypes: true }); } catch { return []; } };
  for (const sym of SYMS) {
    const base = path.join(src, 'candles', sym);
    for (const e of await list(base)) {
      if (e.isFile() && e.name === 'coverage.json') { await put(path.join(base, e.name), path.join(dst, 'candles', sym, e.name)); continue; }
      if (!e.isDirectory() || !LAYER.test(e.name)) continue;
      const layer = path.join(base, e.name);
      for (const f of await list(layer)) {
        const m = DAY_FILE.exec(f.name);
        if (!f.isFile() || !m || m[1] < from || m[1] > to) continue;
        await put(path.join(layer, f.name), path.join(dst, 'candles', sym, e.name, f.name));
      }
    }
    log(`po ${sym}: razem ${res.files} plików, ${(res.bytes / 1048576).toFixed(1)} MB`);
  }
  for (const f of ROOT_FILES) if (await statOr(path.join(src, f))) await put(path.join(src, f), path.join(dst, f));
  const tree = async (rel) => {
    for (const e of await list(path.join(src, rel))) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) await tree(r);
      else if (e.isFile() && e.name.endsWith('.json')) await put(path.join(src, r), path.join(dst, r));
    }
  };
  for (const t of TREES) await tree(t);
  return res;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([a-z]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const known = new Set(['od', 'do', 'zrodlo', 'cel', 'proba']);
  for (const k of Object.keys(args)) if (!known.has(k)) { console.error(`Nieznany parametr --${k}. Dozwolone: ${[...known].map((x) => '--' + x).join(', ')}.`); process.exit(2); }
  const t0 = Date.now();
  copyForAcceptance({ src: args.zrodlo || DEFAULTS.src, dst: args.cel || DEFAULTS.dst, from: args.od || DEFAULTS.from, to: args.do || DEFAULTS.to, dry: !!args.proba, log: (s) => console.log(s) })
    .then((r) => console.log(`${args.proba ? 'Próba' : 'Kopia'}: ${r.files} plików, ${(r.bytes / 1048576).toFixed(1)} MB, skopiowano ${r.copied}, pominięto ${r.skipped} (${((Date.now() - t0) / 1000).toFixed(1)} s)`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
