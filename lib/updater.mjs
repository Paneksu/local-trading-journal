// Pobieranie nowych wersji: zapytanie o ostatnie wydanie (GitHub Releases), pobranie archiwum z codeload.github.com,
// sprawdzenie sumy drzewa plików (tree-sha256 w treści wydania), podmiana wyłącznie plików aplikacji, tryb git (pull --ff-only).
// Downloading new versions: latest GitHub release, archive from codeload.github.com, tree hash check, app files only, git mode.
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { compareVersions } from './version.mjs';

// Nigdy nie nadpisywane ani nie usuwane przy aktualizacji (dane i ustawienia użytkownika).
export const PROTECTED = ['.env', 'config.local.json', 'config.local.json.tmp', 'backups', 'public/img/firmy/custom', '.git', 'node_modules', 'dashboard.log', 'screens', 'chart-data'];
export const isProtected = (rel) => {
  const p = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (/\.url$/i.test(p) && !p.includes('/')) return true;
  return PROTECTED.some((x) => p === x || p.startsWith(x + '/'));
};

const API = () => (process.env.UPDATE_API_BASE || 'https://api.github.com').replace(/\/$/, '');
const DL = () => (process.env.UPDATE_DOWNLOAD_BASE || 'https://codeload.github.com').replace(/\/$/, '');
const ALLOWED_HOSTS = new Set(['api.github.com', 'github.com', 'codeload.github.com']);
function checkUrl(u) {
  const url = new URL(u);
  if (process.env.UPDATE_API_BASE || process.env.UPDATE_DOWNLOAD_BASE) return url; // testy: lokalny fałszywy serwer wydań
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) throw new Error(`Niedozwolony adres pobierania: ${url.host} / download host not allowed`);
  return url;
}

export async function fetchLatest(repo, { timeout = 8000 } = {}) {
  const url = checkUrl(`${API()}/repos/${repo}/releases/latest`);
  // User-Agent 'local-trading-journal' celowo bez zmian (nazwa repo na GitHubie). / Intentionally unchanged: GitHub repo name.
  const r = await fetch(url, { headers: { 'User-Agent': 'local-trading-journal', Accept: 'application/vnd.github+json' }, redirect: 'error', signal: AbortSignal.timeout(timeout) });
  if (r.status === 404) return null; // brak wydań
  if (!r.ok) throw new Error(`GitHub: ${r.status}`);
  const j = await r.json();
  const tag = String(j.tag_name || '');
  const version = tag.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Nieprawidłowy numer wersji w wydaniu: ${tag}`);
  const notes = String(j.body || '');
  const m = notes.match(/tree-sha256:\s*`?([0-9a-f]{64})`?/i);
  return { tag, version, notes, url: j.html_url || '', treeHash: m ? m[1].toLowerCase() : null, tarball: `${DL()}/${repo}/tar.gz/refs/tags/${tag}` };
}
export const isNewer = (latest, current) => !!latest && compareVersions(latest, current) > 0;

// ---------- tar (ustar + pax + GNU long name) ----------
export function parseTar(buf) {
  const files = [];
  let off = 0, longName = null, pax = {};
  const str = (b, s, l) => b.subarray(s, s + l).toString('utf8').replace(/\0.*$/s, '');
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((x) => x === 0)) break;
    const size = parseInt(str(h, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48);
    const prefix = str(h, 345, 155);
    let name = (prefix ? prefix + '/' : '') + str(h, 0, 100);
    const mode = parseInt(str(h, 100, 8).trim() || '644', 8);
    const data = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x' || type === 'g') {
      if (type === 'x') {
        const txt = data.toString('utf8');
        let i = 0;
        while (i < txt.length) { const sp = txt.indexOf(' ', i); const len = parseInt(txt.slice(i, sp), 10); if (!len) break; const rec = txt.slice(sp + 1, i + len - 1); const eq = rec.indexOf('='); pax[rec.slice(0, eq)] = rec.slice(eq + 1); i += len; }
      }
      continue;
    }
    if (type === 'L') { longName = data.toString('utf8').replace(/\0.*$/s, ''); continue; }
    if (longName) { name = longName; longName = null; }
    if (pax.path) name = pax.path;
    pax = {};
    if (type === '0' || type === '\0' || type === '7') files.push({ path: name, data: Buffer.from(data), mode });
  }
  return files;
}
// Archiwum z GitHuba ma katalog nadrzędny „repo-tag/”: zdejmujemy pierwszy segment.
export function stripRoot(files) {
  return files.map((f) => ({ ...f, path: f.path.split('/').slice(1).join('/') })).filter((f) => f.path);
}

// Suma drzewa: SHA-256 z posortowanej listy „ścieżka\0sha256(treść)\n”. Pliki tekstowe liczone z końcami linii LF,
// żeby wynik nie zależał od tego, czy archiwum ma CRLF (Windows) czy LF.
const BINARY = /\.(png|webp|ico|jpg|jpeg|gif|woff2?|ttf|zip|gz)$/i;
export function treeHash(files) {
  const lines = files
    .map((f) => {
      let d = f.data;
      if (!BINARY.test(f.path) && !d.includes(0)) d = Buffer.from(d.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
      return `${f.path}\0${createHash('sha256').update(d).digest('hex')}\n`;
    })
    .sort();
  return createHash('sha256').update(lines.join('')).digest('hex');
}

export async function downloadRelease(rel, { allowUnverified = false } = {}) {
  const url = checkUrl(rel.tarball);
  const r = await fetch(url, { headers: { 'User-Agent': 'local-trading-journal' }, redirect: 'error', signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`Pobieranie archiwum: ${r.status}`);
  const files = stripRoot(parseTar(gunzipSync(Buffer.from(await r.arrayBuffer()))));
  if (!files.some((f) => f.path === 'package.json') || !files.some((f) => f.path === 'server.mjs')) throw new Error('Archiwum nie wygląda na wydanie JustJournal / archive is not a release');
  const hash = treeHash(files);
  if (!rel.treeHash && !allowUnverified) throw new Error('Wydanie nie ma sumy tree-sha256, więc nie mogę sprawdzić pobranych plików / release has no tree-sha256');
  if (rel.treeHash && rel.treeHash !== hash) throw new Error(`Suma pobranych plików się nie zgadza (${hash.slice(0, 12)}… zamiast ${rel.treeHash.slice(0, 12)}…). Nic nie zmieniłem / checksum mismatch, nothing changed`);
  return files;
}

export function writeFiles(dir, files, { skipProtected = true } = {}) {
  let n = 0;
  for (const f of files) {
    if (skipProtected && isProtected(f.path)) continue;
    const target = path.resolve(dir, f.path);
    if (!target.startsWith(path.resolve(dir) + path.sep)) throw new Error(`Niebezpieczna ścieżka w archiwum: ${f.path}`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, f.data);
    if (f.mode & 0o111) { try { chmodSync(target, 0o755); } catch { /* Windows */ } }
    n++;
  }
  return n;
}

// ---------- git ----------
const git = (root, args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
export const isGitInstall = (root) => existsSync(path.join(root, '.git'));
export function gitState(root, { fetch = true } = {}) {
  const v = git(root, ['--version']);
  if (v.error || v.status !== 0) return { ok: false, code: 'nogit', reason: 'Git nie jest zainstalowany albo nie ma go w PATH.' };
  const st = git(root, ['status', '--porcelain', '--untracked-files=no']);
  if (st.status !== 0) return { ok: false, code: 'git', reason: st.stderr.trim() };
  if (st.stdout.trim()) return { ok: false, code: 'dirty', reason: 'W katalogu aplikacji są lokalne zmiany w kodzie (git status nie jest czysty). Zapisz je (git stash) albo cofnij (git checkout -- .), a potem spróbuj ponownie.', files: st.stdout.trim().split(/\r?\n/) };
  const up = git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (up.status !== 0) return { ok: false, code: 'noupstream', reason: 'Ta gałąź nie śledzi zdalnego repozytorium (brak upstream), więc nie wiem, skąd pobrać nową wersję. Ustaw ją: git branch --set-upstream-to=origin/main.' };
  if (fetch) {
    const f = git(root, ['fetch', '--quiet', '--tags']);
    if (f.status !== 0) return { ok: false, code: 'fetch', reason: `git fetch: ${f.stderr.trim() || 'błąd sieci'}` };
  }
  const behind = Number(git(root, ['rev-list', '--count', 'HEAD..@{u}']).stdout.trim()) || 0;
  const ahead = Number(git(root, ['rev-list', '--count', '@{u}..HEAD']).stdout.trim()) || 0;
  return { ok: true, upstream: up.stdout.trim(), behind, ahead };
}
export function gitPull(root) {
  const r = git(root, ['pull', '--ff-only', '--quiet']);
  if (r.status !== 0) throw new Error(`git pull --ff-only: ${r.stderr.trim()}`);
}
// pliki wersji z gałęzi zdalnej (bez zmian w katalogu roboczym) do podglądu migracji
export function gitUpstreamFiles(root) {
  const r = spawnSync('git', ['archive', '--format=tar', '@{u}'], { cwd: root, windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git archive: ${String(r.stderr)}`);
  return parseTar(r.stdout);
}

// lista plików katalogu (do sumy drzewa przy wydawaniu i w testach)
export function readTree(dir, rel = '') {
  const out = [];
  for (const e of readdirSync(path.join(dir, rel))) {
    const p = rel ? `${rel}/${e}` : e;
    const full = path.join(dir, p);
    if (statSync(full).isDirectory()) out.push(...readTree(dir, p));
    else out.push({ path: p, data: readFileSync(full) });
  }
  return out;
}
