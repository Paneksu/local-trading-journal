// Pomocnicze funkcje testów: procesy (atrapa Notion, serwer, skrypty), żądania HTTP, kopia aplikacji do katalogu
// tymczasowego, archiwum wydania (tar.gz) i fałszywy serwer wydań GitHub. Tylko Node, zero zależności.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import http from 'node:http';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const IDS = {
  DS_TRADES: '11111111-1111-4111-8111-111111111111', DS_KONTA: '22222222-2222-4222-8222-222222222222',
  DS_DZIENNIK: '33333333-3333-4333-8333-333333333333', DS_FINANSE: '44444444-4444-4444-8444-444444444444',
};
// N4 (1.6.0): instalacja bez wpisanego kredytu Databento nie pobiera płatnych świec. Testy pobierania zakładają instalację z kredytem wpisanym
// przez użytkownika. Liczby neutralne (100 USD, nic nie wydano, ważny 2 lata od dziś), bez stanu żadnego prawdziwego konta.
// [U] 31.10.2026 «Wpisz tylko u mnie» (zero liczb kredytu właściciela w kodzie i testach)
export const TEST_CREDIT = Object.freeze({ startUsd: 100, expires: new Date(Date.now() + 730 * 86400000).toISOString().slice(0, 10), spentUsd: 0 });
export const PARENT_URL ='https://www.notion.so/Trading-aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa';
const procs = new Set();
const temps = [];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function tmp(prefix = 'ltj-test-') { const d = mkdtempSync(path.join(tmpdir(), prefix)); temps.push(d); return d; }

// Środowisko bez prawdziwych kluczy: zmienne Notion z procesu testów nigdy nie trafiają do procesów potomnych.
export function cleanEnv(extra = {}) {
  const e = { ...process.env };
  for (const k of ['NOTION_TOKEN', 'NOTION_VERSION', 'DS_TRADES', 'DS_KONTA', 'DS_DZIENNIK', 'DS_FINANSE', 'NOTION_ROOT_URL', 'NOTION_API_BASE', 'THQ_CONFIG_DIR', 'UPDATE_API_BASE', 'UPDATE_DOWNLOAD_BASE', 'PORT', 'DATABENTO_API_KEY', 'DATABENTO_API_BASE', 'FRED_API_KEY', 'FRED_API_BASE', 'FINNHUB_API_KEY', 'FINNHUB_API_BASE', 'EDGAR_DATA_BASE', 'EDGAR_WWW_BASE', 'EDGAR_CONTACT', 'THQ_NEWS_FEED_URL', 'FED_ARCHIVE_BASE']) delete e[k];
  return { ...e, THQ_NO_OPEN: '1', THQ_NO_AUTO_1S: '1', THQ_NO_NEWS: '1', UPDATE_API_BASE: 'http://127.0.0.1:9', DATABENTO_API_BASE: 'http://127.0.0.1:9', ...extra };
}

export function start(file, args = [], env = {}, { cwd = ROOT } = {}) {
  const p = spawn(process.execPath, [file, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  p.out = ''; p.err = ''; p.exited = false;
  p.stdout.on('data', (d) => { p.out += d; });
  p.stderr.on('data', (d) => { p.err += d; });
  procs.add(p);
  p.on('exit', (code) => { p.exited = true; p.exitCode = code; procs.delete(p); });
  return p;
}
// asynchronicznie (spawnSync zablokowałby pętlę zdarzeń, a fałszywy serwer wydań działa w tym samym procesie)
export function run(file, args = [], env = {}, { cwd = ROOT } = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [file, ...args], { cwd, env, windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => p.kill(), 180_000);
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err, lines: out.split(/\r?\n/).filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)) });
    });
  });
}
// porównanie niezależne od kolejności kluczy
export const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
// Port zajęty = ktoś słucha (połączenie się udaje). Cudzy proces na porcie testu nie może być rozmówcą testu (runda 4, P2-1 przeglądu kodu).
export const portBusy = (port) => new Promise((ok) => {
  const s = net.connect({ port, host: '127.0.0.1' });
  s.setTimeout(1500, () => { s.destroy(); ok(false); });
  s.once('connect', () => { s.destroy(); ok(true); });
  s.once('error', () => ok(false));
});
// wolny port: podany, a gdy zajęty przez obcy proces, wolny port przydzielony przez system (zakres efemeryczny, więc nie wchodzi w drogę portom
// przydzielanym kolejno przez run.mjs i testy); ostrzeżenie na stderr. Brak portu od systemu = jasny błąd.
// Własne procesy testu, które dostały kill(), ale jeszcze się nie zakończyły, są najpierw dokańczane (do 3 s): ostrzeżenie dotyczy wtedy tylko naprawdę obcego procesu.
export async function freePort(port) {
  const dying = [...procs].filter((p) => p.killed && !p.exited);
  if (dying.length) await Promise.race([Promise.all(dying.map((p) => new Promise((ok) => p.once('exit', ok)))), sleep(3000)]);
  if (!(await portBusy(port))) return port;
  const p = await new Promise((ok, fail) => { const s = net.createServer(); s.once('error', fail); s.listen(0, '127.0.0.1', () => { const x = s.address().port; s.close(() => ok(x)); }); });
  console.warn(`[testy] port ${port} zajęty przez obcy proces (nie z tego przebiegu testów), używam ${p}`);
  return p;
}
// Gotowość = odpowiedź WŁASNEGO procesu: proces potomny żyje, a odpowiedź niesie znacznik (nonce) przekazany przy starcie.
// opts.proc: proces potomny (jego wyjście przed odpowiedzią = błąd z jego stderr); opts.nonce + opts.read(r) → znacznik z odpowiedzi; bez nonce tylko status < 500.
export async function waitHttp(url, ms = 15000, opts = {}) {
  const { proc, nonce, read } = opts;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (proc?.exited) throw new Error(`Proces testowy zakończył się przed gotowością (kod ${proc.exitCode}): ${url}\n${String(proc.err || proc.out).slice(-400)}`);
    try {
      const r = await fetch(url, { headers: { Authorization: 'Bearer x' } });
      if (r.status < 500) {
        if (!nonce) return true;
        const got = await read(r);
        // proces mógł paść tuż po odpowiedzi cudzego serwera: sprawdzamy żywotność jeszcze raz
        if (got === nonce && !proc?.exited) return true;
        if (!proc?.exited) { await sleep(120); if (proc?.exited) throw new Error(`Port zajęty przez obcy proces: ${url} (odpowiedź bez znacznika testu; ${String(proc.err).slice(-200)})`); }
      }
    } catch (e) { if (/obcy proces|zakończył się/.test(String(e?.message))) throw e; /* jeszcze nie */ }
    await sleep(120);
  }
  throw new Error(`Nie odpowiada: ${url}`);
}
const newNonce = () => randomBytes(8).toString('hex');
const nonceHeader = (r) => r.headers.get('x-test-nonce');
export async function atrapa(port0, env = {}) {
  const port = await freePort(port0), nonce = newNonce();
  const p = start(path.join(ROOT, 'testy', 'atrapa-notion.mjs'), [String(port)], cleanEnv({ ...env, THQ_TEST_NONCE: nonce }));
  await waitHttp(`http://127.0.0.1:${port}/__test/log`, 15000, { proc: p, nonce, read: nonceHeader });
  const base = `http://127.0.0.1:${port}`;
  const get = async (pth) => (await fetch(base + pth, { headers: { Authorization: 'Bearer x' } })).json();
  const post = async (pth, body) => (await fetch(base + pth, { method: 'POST', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  return { p, base, port, get, post, writes: () => get('/__test/writes'), dump: () => get('/__test/dump'), stop: () => p.kill() };
}
export async function atrapaDb(port0, env = {}) {
  const port = await freePort(port0), nonce = newNonce();
  const p = start(path.join(ROOT, 'testy', 'atrapa-databento.mjs'), [String(port)], cleanEnv({ ...env, THQ_TEST_NONCE: nonce }));
  await waitHttp(`http://127.0.0.1:${port}/__test/log`, 15000, { proc: p, nonce, read: nonceHeader });
  const base = `http://127.0.0.1:${port}`;
  const j = async (pth, body) => (await fetch(base + pth, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) })).json();
  return { p, base, port, log: () => j('/__test/log'), config: (c) => j('/__test/config', c), reset: () => j('/__test/reset', {}), stop: () => p.kill() };
}
export async function server(port0, env, { cwd = ROOT } = {}) {
  const port = await freePort(port0), nonce = newNonce();
  const p = start(path.join(cwd, 'server.mjs'), [], cleanEnv({ PORT: String(port), ...env, THQ_TEST_NONCE: nonce }), { cwd });
  await waitHttp(`http://127.0.0.1:${port}/api/ping`, 15000, { proc: p, nonce, read: async (r) => (await r.json().catch(() => ({}))).testNonce });
  return { p, base: `http://127.0.0.1:${port}`, port, stop: () => p.kill() };
}
// żądanie do dashboardu z nagłówkami jak z samej strony (ochrona zapisu)
export async function dash(base, pth, body, { origin = base, method } = {}) {
  const r = await fetch(base + pth, body === undefined && !method ? {} : {
    method: method || 'POST', body: JSON.stringify(body ?? {}),
    headers: { Origin: origin, 'X-THQ': '1', 'Content-Type': 'application/json' },
  });
  let j = null;
  try { j = await r.json(); } catch { /* brak treści */ }
  return { status: r.status, j };
}
export function killAll() { for (const p of procs) { try { p.kill(); } catch { /* już nie żyje */ } } }
export function cleanupTemps() { for (const d of temps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* Windows: plik zajęty */ } } }

// Pliki aplikacji z repozytorium (śledzone + nowe, bez ignorowanych), jako lista { path, data }.
export function appFiles() {
  const ls = (args) => spawnSync('git', ['ls-files', '-z', ...args], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
  const list = [...new Set([...ls([]), ...ls(['--others', '--exclude-standard'])])]
    .filter((f) => !f.startsWith('screens/') && !f.startsWith('docs/img/'));
  const out = [];
  for (const f of list) { try { out.push({ path: f, data: readFileSync(path.join(ROOT, f)) }); } catch { /* usunięty w drzewie roboczym */ } }
  return out;
}
export function writeTree(dir, files) {
  for (const f of files) { const t = path.join(dir, f.path); mkdirSync(path.dirname(t), { recursive: true }); writeFileSync(t, f.data); }
}
export function copyFile(a, b) { mkdirSync(path.dirname(b), { recursive: true }); copyFileSync(a, b); }

// ---------- tar.gz (ustar), jak archiwum z codeload.github.com: katalog nadrzędny + nagłówek pax globalny ----------
function tarHeader(name, size, type = '0') {
  const h = Buffer.alloc(512);
  const put = (s, off, len) => h.write(s, off, len, 'utf8');
  let prefix = '';
  if (Buffer.byteLength(name) > 100) { const i = name.lastIndexOf('/', 154); prefix = name.slice(0, i); name = name.slice(i + 1); }
  put(name, 0, 100); put('0000644\0', 100, 8); put('0000000\0', 108, 8); put('0000000\0', 116, 8);
  put(size.toString(8).padStart(11, '0') + '\0', 124, 12); put('00000000000\0', 136, 12);
  put('        ', 148, 8); put(type, 156, 1); put('ustar\0', 257, 6); put('00', 263, 2); put(prefix, 345, 155);
  let sum = 0; for (const b of h) sum += b;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}
export function tarGz(files, root) {
  const parts = [];
  const pax = Buffer.from('52 comment=0123456789abcdef0123456789abcdef01234567\n');
  parts.push(tarHeader('pax_global_header', pax.length, 'g'), pax, Buffer.alloc((512 - (pax.length % 512)) % 512));
  for (const f of files) {
    parts.push(tarHeader(`${root}/${f.path}`, f.data.length), f.data, Buffer.alloc((512 - (f.data.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts));
}

// Fałszywe API wydań GitHub i codeload: /repos/<repo>/releases/latest oraz /<repo>/tar.gz/refs/tags/<tag>
export function fakeGitHub(port, state) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    state.hits = (state.hits || 0) + 1;
    if (u.pathname.endsWith('/releases/latest')) {
      if (!state.release) { res.writeHead(404); return res.end('{}'); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ tag_name: `v${state.release.version}`, html_url: `https://github.com/Paneksu/local-trading-journal/releases/tag/v${state.release.version}`, body: state.release.body }));
    }
    if (u.pathname.includes('/tar.gz/refs/tags/') && state.release?.tarball) { res.writeHead(200, { 'Content-Type': 'application/gzip' }); return res.end(state.release.tarball); }
    res.writeHead(404); res.end();
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r({ close: () => srv.close(), base: `http://127.0.0.1:${port}` })));
}
