// N3 (1.6.0): Ustawienia → Dane na dysku. Przegląd katalogu danych (świece per symbol i warstwa, sesje backtestu, newsy, earningsy, rysunki w kolejce,
// kopie baz, wolne miejsce), wybór katalogu danych przy starcie (config.local.json dataDir) i przenoszenie katalogu w trybie
// kopia → sprawdzenie → przełączenie → restart. Specyfikacja: backtest-wyniki/N-pierwsze-kroki-ustawienia.md §3.4, §4.4, §5.1 pkt 7, §5.2.
// Ścieżka celu przychodzi z przeglądarki, więc przechodzi validateTarget (bezwzględna, bez „..”, bez UNC, realpath, poza katalogiem aplikacji i obecnym
// katalogiem danych, nie systemowa, pusta albo nowa). Wszystkie inne ścieżki (otwieranie folderu, usuwanie warstwy) zna tylko serwer.
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 6: przenoszenie katalogu danych: kopia → sprawdzenie → przełączenie → restart, stary katalog zostaje)
import { existsSync, statSync, realpathSync, readdirSync, mkdirSync, rmSync, constants as FS } from 'node:fs';
import { promises as fsp, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { tr } from './i18n.mjs';

export class DiskError extends Error {
  constructor(message, status = 400, code = 'bad-request') { super(message); this.status = status; this.code = code; }
}
export const CANDLE_SYMBOLS = ['ES', 'NQ'];
// Wiersze tabeli świec: warstwy serii ciągłej 1m i 1s oraz wszystkie warstwy kontraktów (1m-ESH2026, 1s-NQZ2025…) razem
export const CANDLE_ROWS = ['1m', '1s', 'kontrakty'];
const CONTRACT_LAYER_RE = /^(1s|1m)-(ES|NQ)[HMUZ]\d{4}$/;
const DAY_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.bin$/;
export const layersOfRow = (row, layers) => (row === 'kontrakty' ? layers.filter((l) => CONTRACT_LAYER_RE.test(l)).sort() : layers.includes(row) ? [row] : []);
export const MOVE_PATH_MAX = 400;

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const listDir = async (p) => { try { return await fsp.readdir(p, { withFileTypes: true }); } catch { return []; } };

// Pliki drzewa (bez dowiązań i plików tymczasowych *.tmp): [{ rel, size, mtimeMs }] w kolejności przejścia
async function walk(root, rel = '', out = [], depth = 0) {
  if (depth > 8) return out;
  for (const e of await listDir(path.join(root, rel))) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) await walk(root, r, out, depth + 1);
    else if (e.isFile() && !e.name.endsWith('.tmp')) {
      try { const st = await fsp.stat(path.join(root, r)); out.push({ rel: r, size: st.size, mtimeMs: st.mtimeMs }); } catch { /* plik zniknął w trakcie */ }
    }
  }
  return out;
}
const sumOf = (files) => files.reduce((a, f) => a + f.size, 0);
const newest = (files) => (files.length ? new Date(Math.max(...files.map((f) => f.mtimeMs))).toISOString() : null);

// Wolne miejsce na dysku katalogu (albo najbliższego istniejącego katalogu nadrzędnego): { freeBytes, totalBytes } albo null
export async function freeSpace(p) {
  let cur = path.resolve(p);
  while (!existsSync(cur)) { const up = path.dirname(cur); if (up === cur) return null; cur = up; }
  try { const s = await fsp.statfs(cur); return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize }; } catch { return null; }
}

// Przegląd katalogu danych. Liczy tylko z dysku (bez sieci); daty świec z nazw plików dni (RRRR-MM-DD.bin).
export async function scanData({ dataDir, backupsDir }) {
  const exists = isDir(dataDir);
  const all = exists ? await walk(dataDir) : [];
  const under = (...parts) => { const pre = path.join(...parts) + path.sep; return all.filter((f) => f.rel.startsWith(pre)); };
  const candles = [];
  for (const sym of CANDLE_SYMBOLS) {
    const layers = (await listDir(path.join(dataDir, 'candles', sym))).filter((e) => e.isDirectory()).map((e) => e.name);
    for (const row of CANDLE_ROWS) {
      const ls = layersOfRow(row, layers);
      const files = ls.flatMap((l) => under('candles', sym, l)).filter((f) => DAY_FILE_RE.test(path.basename(f.rel)));
      if (!files.length) continue;
      const days = files.map((f) => DAY_FILE_RE.exec(path.basename(f.rel))[1]).sort();
      candles.push({ symbol: sym, layer: row, layers: ls, files: files.length, bytes: sumOf(files), from: days[0], to: days[days.length - 1] });
    }
  }
  // usunięte sesje (sessions/usuniete) liczone osobno, nie jako sesje
  const sessAll = under('backtest', 'sessions').filter((f) => f.rel.endsWith('.json'));
  const removedSess = sessAll.filter((f) => /[\\/]usuniete[\\/]/.test(f.rel));
  const sessions = sessAll.filter((f) => !removedSess.includes(f));
  const news = under('news'), earnings = under('earnings');
  const drawFiles = under('drawings-cache').filter((f) => f.rel.endsWith('.json'));
  let pending = 0;
  for (const f of drawFiles) {
    try { if (JSON.parse(await fsp.readFile(path.join(dataDir, f.rel), 'utf8'))?.pending === true) pending++; } catch { /* uszkodzony wpis: nie liczymy */ }
  }
  const bdirs = (await listDir(backupsDir)).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const bfiles = isDir(backupsDir) ? await walk(backupsDir) : [];
  return {
    dataDir, exists, bytes: sumOf(all), files: all.length, free: await freeSpace(dataDir),
    candles,
    sessions: { count: sessions.length, bytes: sumOf(sessions) },
    removedSessions: { count: removedSess.length, bytes: sumOf(removedSess) },
    news: { bytes: sumOf(news), updatedAt: newest(news) },
    earnings: { bytes: sumOf(earnings), updatedAt: newest(earnings) },
    drawings: { files: drawFiles.length, pending, bytes: sumOf(drawFiles) },
    backups: { count: bdirs.length, bytes: sumOf(bfiles), latest: bdirs.length ? bdirs[bdirs.length - 1] : null },
  };
}

// Katalog danych przy starcie: config.local.json dataDir (ścieżka bezwzględna do istniejącego katalogu) albo CONFIG_DIR/chart-data.
// Katalog wskazany, ale niedostępny (odłączony dysk): domyślny i ostrzeżenie (missing) w Ustawieniach → Dane na dysku.
export function resolveDataDir(config, configDir) {
  const def = path.join(configDir, 'chart-data');
  const want = config?.dataDir;
  if (want === undefined || want === null || want === '') return { dir: def, custom: false, missing: null };
  if (typeof want === 'string' && path.isAbsolute(want) && isDir(want)) return { dir: want, custom: true, missing: null };
  return { dir: def, custom: false, missing: String(want).slice(0, MOVE_PATH_MAX) };
}

const winSys = (env) => [env.SystemRoot || env.windir || 'C:\\Windows', env.ProgramFiles || 'C:\\Program Files', env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', env.ProgramData || 'C:\\ProgramData'];
const POSIX_SYS = ['/bin', '/boot', '/dev', '/etc', '/lib', '/lib64', '/proc', '/sbin', '/sys', '/usr', '/var', '/System', '/Library', '/private/etc', '/private/var'];
const real = (p) => { try { return realpathSync.native(p); } catch { return path.resolve(p); } };
// a leży w b (albo a === b); na Windows bez rozróżniania wielkości liter
function inside(a, b, win) {
  const n = (x) => { const r = path.resolve(x); return win ? r.toLowerCase() : r; };
  const rel = path.relative(n(b), n(a));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Walidacja ścieżki celu przeniesienia (z przeglądarki). Zwraca ostateczną ścieżkę (po realpath najbliższego istniejącego katalogu) albo rzuca DiskError z kodem.
export function validateTarget(raw, { appRoot, dataDir, platform = process.platform, env = process.env, t = tr } = {}) {
  const win = platform === 'win32';
  const fail = (code, msg) => { throw new DiskError(msg, 400, code); };
  if (typeof raw !== 'string' || !raw.trim() || raw.length > MOVE_PATH_MAX || /[\0-\x1f]/.test(raw)) fail('bad-path', t('Wpisz ścieżkę folderu (najwyżej {n} znaków).', { n: MOVE_PATH_MAX }));
  const s = raw.trim();
  if (win && /^[\\/]{2}/.test(s)) fail('unc', t('Folder sieciowy (\\\\serwer\\…) nie jest obsługiwany. Wybierz dysk na tym komputerze.'));
  if (!path.isAbsolute(s) || (win && !/^[A-Za-z]:[\\/]/.test(s))) fail('relative', t('Podaj pełną ścieżkę, np. D:\\JustJournal\\dane.'));
  if (s.split(/[\\/]+/).some((seg) => seg === '..' || seg === '.')) fail('traversal', t('Ścieżka nie może zawierać „..” ani „.”.'));
  // Poprawki po review N1–N4 (bezp. P3-1): Node pisze na Windows z prefiksem przestrzeni nazw, więc człon z kropką albo spacją na końcu, dwukropek
  // (strumienie NTFS) i nazwy urządzeń tworzyłyby katalogi, których Eksplorator nie otworzy ani nie usunie, a porównania z folderem systemowym ich nie łapią
  if (win) {
    const segs = s.split(/[\\/]+/).slice(1).filter(Boolean);
    if (segs.some((seg) => /[. ]$/.test(seg) || seg.includes(':') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(seg))) fail('bad-name', t('Nazwa folderu nie może kończyć się kropką ani spacją, zawierać dwukropka ani być nazwą urządzenia (CON, PRN, AUX, NUL, COM1–9, LPT1–9).'));
  }
  const resolved = path.resolve(s);
  let anc = resolved;
  while (!existsSync(anc)) { const up = path.dirname(anc); if (up === anc) break; anc = up; }
  const target = path.join(real(anc), path.relative(anc, resolved));
  if (path.parse(target).root.replace(/[\\/]+$/, '') === target.replace(/[\\/]+$/, '')) fail('root', t('Wybierz folder, nie cały dysk.'));
  const sys = win ? winSys(env) : POSIX_SYS;
  if (sys.some((d) => inside(target, d, win))) fail('system', t('To folder systemowy. Wybierz inny.'));
  const app = real(appRoot);
  if (inside(target, app, win) || inside(app, target, win)) fail('app', t('Folder danych musi leżeć poza folderem aplikacji (aktualizacja podmienia jego pliki).'));
  const cur = real(dataDir);
  if (inside(target, cur, win) || inside(cur, target, win)) fail('same', t('To obecny folder danych albo jego część.'));
  if (existsSync(target)) {
    if (!isDir(target)) fail('not-dir', t('Pod tą ścieżką jest plik, nie folder.'));
    if (readdirSync(target).length) fail('not-empty', t('Ten folder nie jest pusty. Wybierz pusty albo nowy folder.'));
  }
  return target;
}

// Plan kopii: pliki źródła (bez *.tmp) i suma bajtów
export async function planTree(src) {
  const files = await walk(src);
  return { files, bytes: sumOf(files) };
}
// Kopia plików planu (COPYFILE_EXCL: nic w celu nie jest nadpisywane). onFile(n, bajty) po każdym pliku; signal.aborted przerywa.
export async function copyTree(src, dst, files, { onFile = async () => {}, signal = null, overwrite = false } = {}) {
  let n = 0, bytes = 0;
  for (const f of files) {
    if (signal?.aborted) throw new DiskError(tr('Przerwano.'), 409, 'cancelled');
    const to = path.join(dst, f.rel);
    await fsp.mkdir(path.dirname(to), { recursive: true });
    await fsp.copyFile(path.join(src, f.rel), to, overwrite ? 0 : FS.COPYFILE_EXCL);
    n++; bytes += f.size;
    await onFile(n, bytes);
  }
  return { files: n, bytes };
}
function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file).on('error', reject).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex')));
  });
}
// Sprawdzenie kopii: rozmiar i SHA-256 każdego pliku planu w źródle i celu. { ok, bad: [rel] }
export async function verifyTree(src, dst, files, { onFile = async () => {}, signal = null } = {}) {
  const bad = [];
  let n = 0;
  for (const f of files) {
    if (signal?.aborted) throw new DiskError(tr('Przerwano.'), 409, 'cancelled');
    try {
      const a = path.join(src, f.rel), b = path.join(dst, f.rel);
      if ((await fsp.stat(a)).size !== (await fsp.stat(b)).size || (await sha256(a)) !== (await sha256(b))) bad.push(f.rel);
    } catch { bad.push(f.rel); }
    n++;
    await onFile(n);
  }
  return { ok: !bad.length, bad };
}

// Przenoszenie katalogu danych. Fazy: idle → copy → verify → ready (albo error / cancelled) → switched.
// getDataDir(): obecny katalog; isBusy(): powód blokady (np. trwa pobieranie świec) albo null; saveConfig(): zapis config.local.json natychmiast.
// switchTo(): dosynchronizowanie plików zmienionych po kopii (sesje zapisane w międzyczasie), ich sprawdzenie, zapis dataDir i dataDirPrev. Restart robi serwer.
export function createMover({ getDataDir, appRoot, getConfig, saveConfig, isBusy = () => null, onFile = async () => {}, now = Date.now, t = tr }) {
  let st = { phase: 'idle', target: null, total: 0, done: 0, bytes: 0, totalBytes: 0, verified: 0, error: null, bad: [], startedAt: null, finishedAt: null };
  let plan = null, ctrl = null, created = false, job = null;
  // busy(): trwa praca na plikach (sprawdzanie przed kopią, kopia, sprawdzenie sum, przełączenie): blokuje restart, zatrzymanie i aktualizację.
  // writesBlocked(): dodatkowo gotowa i przełączona kopia (poprawki po review N1–N4, P3-1): zapis świec albo usunięcie warstwy w starym katalogu
  // po skopiowaniu nie trafiłby do nowego. Zdejmuje ją anulowanie (kopia z fazy ready jest usuwana) albo restart po przełączeniu.
  let starting = false;
  const busy = () => starting || st.phase === 'copy' || st.phase === 'verify' || st.phase === 'switching';
  const writesBlocked = () => busy() || st.phase === 'ready' || st.phase === 'switched';
  const reset = (o) => { st = { phase: 'idle', target: null, total: 0, done: 0, bytes: 0, totalBytes: 0, verified: 0, error: null, bad: [], startedAt: null, finishedAt: null, ...o }; };

  async function check(raw) {
    const target = validateTarget(raw, { appRoot, dataDir: getDataDir(), t });
    const p = await planTree(getDataDir());
    const free = await freeSpace(target);
    // zapas: 5% i 50 MB ponad rozmiar danych
    const needBytes = Math.ceil(p.bytes * 1.05) + 50 * 1024 * 1024;
    return { target, files: p.files.length, bytes: p.bytes, needBytes, freeBytes: free?.freeBytes ?? null, enough: free ? free.freeBytes >= needBytes : true, plan: p };
  }
  function cleanup(target) {
    try {
      if (created) rmSync(target, { recursive: true, force: true });
      else for (const f of plan?.files || []) rmSync(path.join(target, f.rel), { force: true });
    } catch { /* zostawiamy: użytkownik widzi ścieżkę w komunikacie */ }
  }
  async function start(raw) {
    if (writesBlocked()) throw new DiskError(t('Przenoszenie już trwa.'), 409, 'running');
    const why = isBusy();
    if (why) throw new DiskError(why, 409, 'busy');
    // poprawki po review N1–N4 (P2-2): blokada zajęta synchronicznie, przed pierwszym await (drugie równoległe żądanie dostaje 409)
    starting = true;
    let c;
    try {
      c = await check(raw);
      if (!c.enough) throw new DiskError(t('Za mało miejsca: potrzeba {need}, wolne {free}.', { need: mb(c.needBytes), free: mb(c.freeBytes) }), 409, 'no-space');
    } finally { starting = false; }
    plan = c.plan; created = !existsSync(c.target); ctrl = new AbortController();
    reset({ phase: 'copy', target: c.target, total: plan.files.length, totalBytes: plan.bytes, startedAt: new Date(now()).toISOString() });
    mkdirSync(c.target, { recursive: true });
    const src = getDataDir(), target = c.target, signal = ctrl.signal;
    job = (async () => {
      try {
        await copyTree(src, target, plan.files, { signal, onFile: async (n, b) => { st.done = n; st.bytes = b; await onFile(n); } });
        st.phase = 'verify';
        const v = await verifyTree(src, target, plan.files, { signal, onFile: async (n) => { st.verified = n; } });
        if (!v.ok) { st.bad = v.bad.slice(0, 20); throw new DiskError(t('Kopia różni się od oryginału w {n} plikach. Nic nie przełączono.', { n: v.bad.length }), 500, 'verify'); }
        st.phase = 'ready';
      } catch (e) {
        cleanup(target);
        if (signal.aborted) st.phase = 'cancelled';
        else { st.phase = 'error'; st.error = e.message; }
      } finally { st.finishedAt = new Date(now()).toISOString(); }
    })();
    return { started: true, target: c.target, files: plan.files.length, bytes: plan.bytes };
  }
  async function cancel() {
    // gotowa (niewłączona) kopia: usuwamy ją i zdejmujemy blokadę zapisów
    if (st.phase === 'ready') { cleanup(st.target); st.phase = 'cancelled'; st.finishedAt = new Date(now()).toISOString(); return { ok: true, phase: 'cancelled' }; }
    if (!busy()) return { ok: true, phase: st.phase };
    ctrl?.abort();
    return { ok: true, phase: 'cancelling' };
  }
  async function switchTo() {
    if (st.phase !== 'ready') throw new DiskError(t('Najpierw skopiuj i sprawdź dane.'), 409, 'not-ready');
    const why = isBusy();
    if (why) throw new DiskError(why, 409, 'busy');
    const src = getDataDir(), target = st.target;
    st.phase = 'switching';
    try {
      // dosynchronizowanie: pliki nowe albo zmienione po kopii (np. zapis sesji backtestu w międzyczasie)
      const known = new Map(plan.files.map((f) => [f.rel, f]));
      const delta = (await walk(src)).filter((f) => { const k = known.get(f.rel); return !k || k.size !== f.size || k.mtimeMs !== f.mtimeMs; });
      if (delta.length) {
        await copyTree(src, target, delta, { overwrite: true });
        const v = await verifyTree(src, target, delta);
        if (!v.ok) throw new DiskError(t('Kopia różni się od oryginału w {n} plikach. Nic nie przełączono.', { n: v.bad.length }), 500, 'verify');
      }
      const cfg = getConfig();
      cfg.dataDirPrev = src;
      cfg.dataDir = target;
      saveConfig();
      st.phase = 'switched';
      return { ok: true, dataDir: target, previous: src, synced: delta.length };
    } catch (e) { st.phase = 'ready'; throw e; }
  }
  return { check: async (raw) => { const { plan: _p, ...rest } = await check(raw); void _p; return rest; }, start, cancel, switchTo, status: () => ({ ...st }), busy, writesBlocked, _job: () => job };
}
const mb = (b) => (b == null ? '?' : `${Math.round(b / 1024 / 1024)} MB`);
