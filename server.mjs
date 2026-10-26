// JustJournal: lokalny serwer dashboardu. Zero zależności, Node 22+.
// Czyta .env i config.local.json, odpytuje Notion API, normalizuje dane (po rolach pól, nie po nazwach) i serwuje public/.
// Token nigdy nie trafia do frontendu ani do logów. / The token never reaches the browser or the logs.
import http from 'node:http';
import { existsSync, statSync, createReadStream, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import { ROOT, CONFIG_DIR, loadEnv, envSettings, loadConfig, saveConfig, saveEnv, configExists } from './lib/env.mjs';
import { createNotion, NotionError } from './lib/notion.mjs';
import { createData } from './lib/data.mjs';
import { createWriter, ValidationError, PAGE_ID_RE } from './lib/writes.mjs';
import { setLang, tr as t } from './lib/i18n.mjs';
import { APP_VERSION, SCHEMA_VERSION, REPO, loadSchemaFile } from './lib/version.mjs';
import { DBS } from './lib/roles.mjs';
import { spawn } from 'node:child_process';
import { fetchLatest, isNewer } from './lib/updater.mjs';
import { fullCheck, fixSchema, demoRemoval } from './lib/health.mjs';
import { createWorkspace } from './lib/workspace.mjs';
import { verifyToken, listPages, writeShortcut, hasShortcut } from './lib/wizard.mjs';
import { createSync } from './lib/sync.mjs';
import { sealPackage, openPackage, peekPackage, MAX_ATTEMPTS } from './lib/transfer.mjs';

const PUBLIC = path.join(ROOT, 'public');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 4321;

// S, SOURCES i notion są podmieniane w miejscu (reconfigure) po zapisaniu tokenu albo utworzeniu dziennika w kreatorze,
// więc moduły, które dostały do nich referencję (odczyt, zapis), od razu widzą nową konfigurację.
let S = envSettings(loadEnv());
const SOURCES = { ...S.sources };
let config = loadConfig();
const firstRun = !configExists();
setLang(config.lang);
// Test na atrapie API: NOTION_API_BASE=http://127.0.0.1:PORT (domyślnie prawdziwe Notion).
const notion = createNotion({ token: S.token, version: S.version, base: S.base, t });
let saveTimer = 0;
const persistConfig = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { saveConfig(config); } catch (e) { console.error('[config]', e.message); } }, 50); };
const data = createData({ notion, sources: SOURCES, getConfig: () => config, persistConfig, rootUrl: () => S.rootUrl });
const writer = createWriter({ notion, sources: SOURCES, data, t });
function reconfigure() {
  S = envSettings(loadEnv());
  for (const k of Object.keys(SOURCES)) delete SOURCES[k];
  Object.assign(SOURCES, S.sources);
  Object.assign(notion, createNotion({ token: S.token, version: S.version, base: S.base, t }));
  data.invalidate();
  if (typeof sync !== 'undefined') sync.invalidate();
}

// Pierwsze uruchomienie bez config.local.json (np. instalacja sprzed wersji 1.0): pola są rozpoznawane po znanych nazwach PL i EN,
// identyfikatory zapisują się do config.local.json, a w Notion nic się nie zmienia.
// Instalacja skonfigurowana wcześniej (są bazy w .env) nie dostaje automatycznie „Pierwszych kroków”; świeża kopia bez konfiguracji tak.
if (firstRun) { if (SOURCES.trades) config.legacy = true; config.onboarded = !!SOURCES.trades; persistConfig(); }
else if (config.onboarded === undefined) { config.onboarded = true; persistConfig(); }

const stats = data.stats;

// ---------- proxy zrzutów ----------
function safeRemoteUrl(u) {
  let url;
  try { url = new URL(u); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  const h = url.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return null;
  if (/^[0-9.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return null; // adresy IP wprost
  return url;
}
async function fetchImage(urlStr) {
  const url = safeRemoteUrl(urlStr);
  if (!url) return { status: 400 };
  const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  return { status: r.status, res: r };
}
async function handleImg(url, res) {
  const pageId = url.searchParams.get('page') || '';
  const i = Number(url.searchParams.get('i'));
  const fail = (code, msg) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(msg); };
  if (!PAGE_ID_RE.test(pageId) || !Number.isInteger(i) || i < 0 || i > 50) return fail(400, t('Zły parametr'));
  let entry = data.imgIndex.get(pageId);
  if (!entry) return fail(404, t('Nieznana strona'));
  // kolejność: pliki z Notion, potem snapshot TradingView
  let upstream = null;
  const pick = (e) => {
    if (i < e.files.length) return e.files[i];
    if (i === e.files.length && e.tv) return { kind: 'tv', url: `https://s3.tradingview.com/snapshots/${e.tv[0].toLowerCase()}/${e.tv}.png`, expiry: 0 };
    return null;
  };
  let f = pick(entry);
  if (!f) return fail(404, t('Brak obrazu'));
  try {
    if (f.kind === 'file' && f.expiry - Date.now() < 60_000) { entry = await data.refreshImgEntry(pageId); f = pick(entry); if (!f) return fail(404, t('Brak obrazu')); }
    upstream = await fetchImage(f.url);
    if ((upstream.status === 403 || upstream.status === 404) && f.kind === 'file') {
      stats.imgRetry++;
      entry = await data.refreshImgEntry(pageId); f = pick(entry);
      if (!f) return fail(404, t('Brak obrazu'));
      upstream = await fetchImage(f.url);
    }
  } catch (e) {
    console.error('[img]', e instanceof NotionError ? e.message : 'fetch error');
    return fail(502, t('Nie udało się pobrać obrazu'));
  }
  const ct = upstream.res?.headers.get('content-type') || '';
  if (!upstream.res || !upstream.res.ok || !ct.startsWith('image/')) return fail(502, t('Nie udało się pobrać obrazu'));
  res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' });
  Readable.fromWeb(upstream.res.body).on('error', () => res.destroy()).pipe(res);
}

// ---------- informacja o nowej wersji ----------
// Jedyne połączenie poza Notion: raz na dobę serwer pyta publiczne API GitHub o ostatnie wydanie (wyłącznik: Ustawienia albo updateCheck w config.local.json).
// The only connection besides Notion: once a day the server asks the public GitHub API for the latest release (can be switched off).
// Brak sieci jest cichy: wynik { offline: true }, ponowna próba za kilka godzin, bez błędów w konsoli.
async function updateInfo({ force = false } = {}) {
  if (config.updateCheck === false && !force) return { disabled: true, current: APP_VERSION, available: false };
  const c = config.updateCache;
  if (force || !c || Date.now() - c.at > 24 * 3600_000) {
    try {
      const rel = await fetchLatest(REPO);
      config.updateCache = { at: Date.now(), latest: rel?.version || '', url: rel?.url || '', notes: (rel?.notes || '').slice(0, 20000), offline: false };
    } catch {
      config.updateCache = { ...(c || {}), at: Date.now() - 20 * 3600_000, offline: true };
    }
    persistConfig();
  }
  const u = config.updateCache || {};
  const available = isNewer(u.latest, APP_VERSION);
  return {
    current: APP_VERSION, latest: u.latest || '', url: u.url || '', notes: available ? u.notes || '' : '', available,
    skipped: available && config.skipVersion === u.latest, checkedAt: u.at ? new Date(u.at).toISOString() : null, offline: !!u.offline, disabled: config.updateCheck === false,
  };
}

// ---------- aktualizacja z dashboardu ----------
// Plan i wykonanie robi update.mjs (osobny proces, wynik jako linie JSON). Po udanej aktualizacji serwer uruchamia
// lib/restart.mjs (czeka na koniec tego procesu i startuje nowy kod), a strona czeka na /api/health.
const STEPS = ['backup', 'download', 'migrate', 'restart'];
let upd = { running: false, done: false, target: '', steps: STEPS.map((id) => ({ id, status: 'pending', detail: '' })), error: null };
function runUpdateScript(extra, onLine) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'update.mjs'), '--json', ...extra], { cwd: ROOT, env: process.env, windowsHide: true });
    let buf = '', err = '';
    const lines = [];
    const feed = (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!l) continue;
        try { const o = JSON.parse(l); lines.push(o); onLine?.(o); } catch { /* zwykły tekst */ }
      }
    };
    p.stdout.on('data', (d) => feed(d.toString('utf8')));
    p.stderr.on('data', (d) => { err += d.toString('utf8'); });
    const timer = setTimeout(() => p.kill(), 10 * 60_000);
    p.on('close', (code) => { clearTimeout(timer); feed('\n'); resolve({ code, lines, stderr: err.trim() }); });
    p.on('error', (e) => { clearTimeout(timer); resolve({ code: 1, lines, stderr: e.message }); });
  });
}
async function updatePlan() {
  const r = await runUpdateScript(['--dry-run']);
  const e = r.lines.find((l) => l.error);
  if (e) return { ok: false, canUpdate: false, reason: e.error.message, code: e.error.code || '', current: APP_VERSION, notion: [] };
  const plan = r.lines.find((l) => l.plan)?.plan;
  if (!plan) return { ok: false, canUpdate: false, reason: r.stderr || t('Nie udało się przygotować planu aktualizacji.'), current: APP_VERSION, notion: [] };
  return {
    ok: true, mode: plan.mode, current: plan.current, target: plan.target, canUpdate: plan.hasCode,
    reason: plan.hasCode ? '' : t('Masz najnowszą wersję.'), notion: plan.notion.map(({ db, kind, name, detail, status }) => ({ db, kind, name, detail, status })), notionError: plan.notionError || null,
  };
}
function startUpdate() {
  upd = { running: true, done: false, target: '', steps: STEPS.map((id) => ({ id, status: 'pending', detail: '' })), error: null };
  const setStep = (id, status, detail) => { const s = upd.steps.find((x) => x.id === id); if (s) { s.status = status; if (detail) s.detail = detail; } };
  runUpdateScript(['--yes'], (o) => {
    if (o.step) setStep(o.step, o.status, o.detail);
    if (o.error) upd.error = { message: o.error.message, backupDir: o.error.backupDir || '', command: o.error.command || 'node update.mjs' };
    if (o.done) upd.target = o.target;
  }).then((r) => {
    if (r.code !== 0 || upd.error) {
      upd.running = false;
      if (!upd.error) upd.error = { message: r.stderr || t('Aktualizacja się nie udała.'), backupDir: '', command: 'node update.mjs' };
      const running = upd.steps.find((s) => s.status === 'running');
      if (running) running.status = 'error';
      return;
    }
    setStep('restart', 'running', '');
    upd.done = true;
    console.log(`Update to ${upd.target} finished, restarting.`);
    // chwila na odebranie statusu przez stronę, potem restart (nowy proces czeka na zwolnienie portu)
    setTimeout(() => {
      try {
        const h = spawn(process.execPath, [path.join(ROOT, 'lib', 'restart.mjs'), String(process.pid)], { cwd: ROOT, env: process.env, detached: true, stdio: 'ignore', windowsHide: true });
        h.unref();
      } catch (e) { console.error('[restart]', e.message); }
      server.close();
      setTimeout(() => process.exit(0), 200);
    }, 1500);
  });
}

// ---------- ochrona endpointów zapisu ----------
// Serwer słucha tylko na 127.0.0.1, ale strona otwarta w tej samej przeglądarce mogłaby próbować pisać po cichu.
// Dlatego zapis wymaga: Hosta z loopbacka (anty DNS rebinding), Origin równego adresowi dashboardu, własnego nagłówka
// X-THQ i JSON-a (to wymusza preflight CORS dla obcych stron, którego serwer nigdy nie zatwierdza).
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);
const isLoopback = (a) => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';

function guardWrite(req, { json = true } = {}) {
  if (!isLoopback(req.socket.remoteAddress)) return 'adres spoza komputera';
  if (!ALLOWED_ORIGINS.has(req.headers.origin || '')) return 'obcy lub brakujący Origin';
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return 'żądanie z innej strony';
  if (req.headers['x-thq'] !== '1') return 'brak nagłówka X-THQ';
  if (json && !String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return 'zły Content-Type';
  return null;
}

function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new ValidationError({}, 'Dane są zbyt duże.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new ValidationError({}, 'Nieczytelne dane formularza.')); }
    });
    req.on('error', reject);
  });
}

// ---------- HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp',
};
const SEC_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' };

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', ...SEC_HEADERS });
  res.end(body);
}

function sendError(res, e) {
  if (e instanceof ValidationError) return sendJson(res, 400, { error: e.msgKey ? t(e.message) : e.message, fields: e.fields });
  console.error('[write]', e.message);
  const s = e instanceof NotionError ? e.status : 500;
  // 401 z Notion to problem tokenu, nie klienta: oddajemy 502 z czytelnym komunikatem
  const status = s === 401 || s < 400 || s > 599 ? 502 : s;
  return sendJson(res, status, { error: e.message, code: e.code, ...(e.left !== undefined ? { left: e.left } : {}) });
}

function meta() {
  return {
    lang: config.lang, version: APP_VERSION, schemaVersion: SCHEMA_VERSION, installedSchema: config.schemaVersion || 0,
    updateCheck: config.updateCheck !== false, notionUrl: S.rootUrl, onboarded: config.onboarded !== false, syncEnabled: config.syncEnabled !== false, deviceId: config.deviceId, deviceName: config.deviceName,
  };
}

const SCHEMA = loadSchemaFile();
const healthCtx = () => ({ notion, sources: SOURCES, config, schema: SCHEMA, schemaVersion: SCHEMA_VERSION, host: HOST, updateInfo, rootUrl: S.rootUrl, t });
// POST z ochroną zapisu: ścieżka → obsługa (body) → odpowiedź
const ACTIONS = {
  '/api/config': async (body) => {
    if (typeof body.updateCheck === 'boolean') config.updateCheck = body.updateCheck;
    if (typeof body.onboarded === 'boolean') config.onboarded = body.onboarded;
    if (typeof body.syncEnabled === 'boolean') config.syncEnabled = body.syncEnabled;
    if (body.lang === 'pl' || body.lang === 'en') { config.lang = body.lang; setLang(body.lang); }
    persistConfig();
    return { ok: true, ...meta() };
  },
  '/api/update/check': async () => updateInfo({ force: true }),
  '/api/update/skip': async (body) => {
    if (typeof body.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(body.version)) throw new ValidationError({}, 'Nieprawidłowy numer wersji.');
    config.skipVersion = body.version; persistConfig();
    return { ok: true };
  },
  '/api/update/plan': async () => updatePlan(),
  '/api/update/run': async () => {
    if (upd.running) throw Object.assign(new NotionError(t('Aktualizacja już trwa.'), 409), { code: 'running' });
    startUpdate();
    return { started: true };
  },
  '/api/health/full': async (body) => fullCheck({ ...healthCtx(), probeWrite: body.quick !== true }),
  '/api/health/fix-schema': async (body) => {
    const out = await fixSchema({ ...healthCtx(), migrationsDir: path.join(ROOT, 'migrations'), dryRun: body.apply !== true, persist: () => saveConfig(config) });
    if (body.apply === true) data.invalidate();
    return { ok: true, applied: body.apply === true, ...out };
  },
  '/api/demo/remove': async (body) => {
    const out = await demoRemoval({ notion, sources: SOURCES, dryRun: body.apply !== true });
    if (body.apply === true) data.invalidate();
    return { ok: true, applied: body.apply === true, count: out.n, items: out.found.map(({ db, title }) => ({ db, title })) };
  },
};

// ---------- kreator instalacji w przeglądarce („Pierwsze kroki”, część A) ----------
// Token zapisuje się do .env tylko wtedy, gdy nie ma działającego tokenu, albo po jawnym „Zmień token” (replace: true).
// Tworzenie dziennika zapisuje postęp w config.local.json po każdym kroku, więc przerwane da się wznowić bez duplikatów.
const SETUP_STEPS = ['page', 'databases', 'relations', 'formulas', 'views', 'demo', 'save'];
const STEP_OF = { page: 'page', database: 'databases', relations: 'relations', formula: 'formulas', view: 'views', demo: 'demo' };
let setupJob = { running: false, done: false, error: null, steps: SETUP_STEPS.map((id) => ({ id, status: 'pending' })), rootUrl: '', skippedViews: [] };
async function tokenWorks() {
  if (!notion.hasToken) return false;
  try { await notion.get('/v1/users/me'); return true; } catch { return false; }
}
function finishInstall({ dsIds, dbIds, rootUrl, rootPageId, fields = {}, views = {}, lang, schemaVersion }) {
  saveEnv({ DS_TRADES: dsIds.trades, DS_KONTA: dsIds.konta, DS_DZIENNIK: dsIds.dziennik, DS_FINANSE: dsIds.finanse, NOTION_ROOT_URL: rootUrl });
  Object.assign(config, { fields, databases: dbIds, views, rootPageId, lang, schemaVersion });
  delete config.setupProgress; delete config.legacy;
  setLang(lang);
  saveConfig(config);
  writeShortcut(CONFIG_DIR, lang, rootUrl);
  reconfigure();
}
function runSetupJob({ pageId, lang, demo }) {
  setupJob = { running: true, done: false, error: null, steps: SETUP_STEPS.map((id) => ({ id, status: 'pending' })), rootUrl: '', skippedViews: [] };
  if (!config.setupProgress || config.setupProgress.parentPageId !== pageId || config.setupProgress.lang !== lang) config.setupProgress = {};
  const state = config.setupProgress;
  let current = null;
  const mark = (id, status) => { const s = setupJob.steps.find((x) => x.id === id); if (s) s.status = status; };
  const log = (kind) => {
    const id = STEP_OF[kind];
    if (!id || id === current) return;
    for (const s of setupJob.steps) { if (s.id === id) break; if (s.status !== 'done') s.status = s.id === 'demo' && !demo ? 'skipped' : 'done'; }
    current = id; mark(id, 'running');
  };
  createWorkspace(notion, { schema: SCHEMA, parentPageId: pageId, lang, demo, log, state, save: () => saveConfig(config) })
    .then((r) => {
      log('demo'); mark('demo', demo ? 'done' : 'skipped');
      for (const s of setupJob.steps) if (s.id !== 'save' && s.status !== 'skipped') s.status = 'done';
      mark('save', 'running');
      finishInstall({ ...r, lang, schemaVersion: SCHEMA_VERSION });
      mark('save', 'done');
      Object.assign(setupJob, { running: false, done: true, rootUrl: r.rootUrl, skippedViews: r.skippedViews });
    })
    .catch((e) => {
      console.error('[setup]', e.message);
      if (current) mark(current, 'error');
      Object.assign(setupJob, { running: false, error: { message: e.message, resumable: true } });
    });
}
Object.assign(ACTIONS, {
  '/api/setup/token': async (body) => {
    const token = String(body.token || '').trim();
    if (!token) throw new ValidationError({ token: t('Wklej token integracji.') });
    if (!/^[A-Za-z0-9_\-]{20,200}$/.test(token) && !process.env.NOTION_API_BASE) throw new ValidationError({ token: t('To nie wygląda na token Notion (zaczyna się od ntn_).') });
    if (body.replace !== true && (await tokenWorks())) throw Object.assign(new NotionError(t('Token jest już zapisany i działa. Zmienisz go w Ustawieniach: „Zmień token”.'), 409), { code: 'has-token' });
    const probe = createNotion({ token, version: S.version, base: S.base, t });
    let who;
    try { who = await verifyToken(probe); } catch (e) {
      throw new ValidationError({ token: e.status === 401 ? t('Notion nie przyjął tego tokenu. Skopiuj go jeszcze raz z ustawień integracji.') : e.message });
    }
    saveEnv({ NOTION_TOKEN: token, NOTION_VERSION: S.version });
    reconfigure();
    return { ok: true, ...who };
  },
  '/api/setup/pages': async () => {
    if (!notion.hasToken) throw Object.assign(new NotionError(t('Najpierw wklej token.'), 409), { code: 'no-token' });
    return { pages: await listPages(notion, SCHEMA) };
  },
  '/api/setup/create': async (body) => {
    if (!PAGE_ID_RE.test(String(body.pageId || ''))) throw new ValidationError({ pageId: t('Wybierz stronę z listy.') });
    if (!notion.hasToken) throw Object.assign(new NotionError(t('Najpierw wklej token.'), 409), { code: 'no-token' });
    if (SOURCES.trades && config.databases) throw Object.assign(new NotionError(t('Dziennik jest już utworzony.'), 409), { code: 'already' });
    if (setupJob.running) throw Object.assign(new NotionError(t('Tworzenie dziennika już trwa.'), 409), { code: 'running' });
    runSetupJob({ pageId: body.pageId, lang: body.lang === 'en' ? 'en' : body.lang === 'pl' ? 'pl' : config.lang, demo: body.demo !== false });
    return { started: true };
  },
  '/api/setup/connect': async (body) => {
    if (!PAGE_ID_RE.test(String(body.pageId || ''))) throw new ValidationError({ pageId: t('Wybierz stronę z listy.') });
    const page = (await listPages(notion, SCHEMA)).find((p) => p.id === body.pageId);
    if (!page?.journal) throw new ValidationError({ pageId: t('Na tej stronie nie ma kompletnego dziennika (4 baz).') });
    finishInstall({ dsIds: page.journal.dsIds, dbIds: page.journal.dbIds, rootUrl: page.url, rootPageId: page.id, lang: page.journal.lang, schemaVersion: 0 });
    // Bieżąca wersja schematu tylko wtedy, gdy w dzienniku niczego nie brakuje (podgląd naprawy jest pusty).
    // Inaczej zostaje 0, żeby „Napraw wszystko” i aktualizacja uzupełniły braki migracjami.
    const probe = await fixSchema({ ...healthCtx(), migrationsDir: path.join(ROOT, 'migrations'), dryRun: true });
    const complete = !probe.changes.length && !probe.manual.length;
    if (complete) { config.schemaVersion = SCHEMA_VERSION; saveConfig(config); }
    return { ok: true, rootUrl: page.url, lang: page.journal.lang, complete, schemaVersion: config.schemaVersion };
  },
  '/api/health/fix-all': async (body) => {
    const apply = body.apply === true;
    const fix = await fixSchema({ ...healthCtx(), migrationsDir: path.join(ROOT, 'migrations'), dryRun: !apply, persist: () => saveConfig(config) });
    let remapped = 0;
    if (apply) {
      const before = JSON.stringify(config.fields || {});
      config.fields = {};
      for (const db of DBS) if (SOURCES[db]) { try { await data.loadSchema(db); } catch { /* błąd pokaże gotowość */ } }
      saveConfig(config);
      remapped = before === JSON.stringify(config.fields) ? 0 : 1;
      data.invalidate();
    }
    const shortcut = hasShortcut(CONFIG_DIR) ? 'ok' : S.rootUrl ? (apply ? (writeShortcut(CONFIG_DIR, config.lang, S.rootUrl), 'created') : 'missing') : 'none';
    return { ok: true, applied: apply, changes: fix.changes, manual: fix.manual, remapped, shortcut };
  },
});

// ---------- kolejne urządzenie: synchronizacja ustawień, lista urządzeń, kod przeniesienia ----------
// Zegar z przesunięciem tylko do testów (THQ_CLOCK_OFFSET_MS), żeby sprawdzić wygaśnięcie kodu bez czekania 15 min.
const now = () => Date.now() + (Number(process.env.THQ_CLOCK_OFFSET_MS) || 0);
if (!config.deviceId) { config.deviceId = randomUUID(); persistConfig(); }
if (!config.deviceName) { config.deviceName = (hostname() || 'device').replace(/\.local$/i, '').slice(0, 24); persistConfig(); }
const sync = createSync(() => ({ notion, config, rootUrl: S.rootUrl, now }), () => saveConfig(config));
// Licznik prób PIN-u i zużyte kody tylko w pamięci tego serwera (urządzenie B). 5 prób na kod, potem trzeba wygenerować nowy.
const pinTries = new Map();
const usedCodes = new Set();
const CUSTOM_DIR = path.join(ROOT, 'public', 'img', 'firmy', 'custom');
const CUSTOM_RE = /^[\w.-]{1,60}\.(webp|png|jpe?g)$/i;
function customFiles() {
  const out = [], skipped = [];
  let total = 0;
  if (!existsSync(CUSTOM_DIR)) return { out, skipped };
  for (const f of readdirSync(CUSTOM_DIR)) {
    if (!CUSTOM_RE.test(f)) continue;
    const buf = readFileSync(path.join(CUSTOM_DIR, f));
    if (buf.length > 60_000 || total + buf.length > 150_000) { skipped.push(f); continue; }
    total += buf.length;
    out.push({ name: f, b64: buf.toString('base64') });
  }
  return { out, skipped };
}
Object.assign(ACTIONS, {
  '/api/sync': async (body) => sync.push(body.settings, body.updatedAt),
  '/api/devices/rename': async (body) => {
    const name = String(body.name || '').trim();
    if (!name || name.length > 40) throw new ValidationError({ name: t('Nazwa urządzenia: od 1 do 40 znaków.') });
    return sync.rename(String(body.id || config.deviceId), name);
  },
  // Eksport tylko po jawnym kliknięciu; kod i PIN nie trafiają do logów.
  '/api/transfer/export': async () => {
    if (!notion.hasToken || !SOURCES.trades) throw Object.assign(new NotionError(t('Najpierw skonfiguruj dziennik na tym urządzeniu.'), 409), { code: 'not-configured' });
    const { out, skipped } = customFiles();
    const pack = sealPackage({
      token: S.token, version: S.version, rootUrl: S.rootUrl, sources: { ...SOURCES },
      rootPageId: config.rootPageId || null, databases: config.databases || null, fields: config.fields || {}, views: config.views || {},
      options: config.options || {}, lang: config.lang, schemaVersion: config.schemaVersion || 0, custom: out, from: config.deviceName,
    }, { now: now() });
    const stamp = new Date(now()).toISOString().slice(0, 16).replace(/[:T]/g, '-');
    return { code: pack.code, pin: pack.pin, expiresAt: pack.expiresAt, fileName: `justjournal-${stamp}.ltj`, skipped };
  },
  '/api/transfer/import': async (body) => {
    let head;
    try { head = peekPackage(body.code); } catch (e) { throw Object.assign(new NotionError(t('To nie jest kod przeniesienia. Skopiuj go jeszcze raz z pierwszego urządzenia.'), 400), { code: 'bad-code' }); }
    const id = head.h.id;
    if (usedCodes.has(id)) throw Object.assign(new NotionError(t('Ten kod został już użyty. Wygeneruj nowy na pierwszym urządzeniu.'), 409), { code: 'used' });
    if ((pinTries.get(id) || 0) >= MAX_ATTEMPTS) throw Object.assign(new NotionError(t('Za dużo prób. Wygeneruj nowy kod na pierwszym urządzeniu.'), 429), { code: 'locked' });
    if (body.replace !== true && (await tokenWorks()) && SOURCES.trades) throw Object.assign(new NotionError(t('To urządzenie ma już skonfigurowany dziennik.'), 409), { code: 'configured' });
    let data;
    try { data = openPackage(body.code, String(body.pin || ''), { now: now() }); } catch (e) {
      if (e.code === 'expired') throw Object.assign(new NotionError(t('Kod wygasł. Wygeneruj nowy na pierwszym urządzeniu.'), 410), { code: 'expired' });
      const n = (pinTries.get(id) || 0) + 1;
      pinTries.set(id, n);
      if (n >= MAX_ATTEMPTS) throw Object.assign(new NotionError(t('Za dużo prób. Wygeneruj nowy kod na pierwszym urządzeniu.'), 429), { code: 'locked' });
      const err = new NotionError(t('Zły PIN. Zostało prób: {n}.', { n: MAX_ATTEMPTS - n }), 400);
      throw Object.assign(err, { code: 'bad-pin', left: MAX_ATTEMPTS - n });
    }
    const probe = createNotion({ token: data.token, version: data.version || S.version, base: S.base, t });
    let who;
    try { who = await verifyToken(probe); } catch { throw Object.assign(new NotionError(t('Token z kodu nie działa (może został zmieniony). Użyj ścieżki „Nie mam kodu” z aktualnym tokenem.'), 400), { code: 'token' }); }
    usedCodes.add(id);
    saveEnv({ NOTION_TOKEN: data.token, NOTION_VERSION: data.version || S.version });
    finishInstall({ dsIds: data.sources, dbIds: data.databases || {}, rootUrl: data.rootUrl, rootPageId: data.rootPageId, fields: data.fields, views: data.views, lang: data.lang === 'en' ? 'en' : 'pl', schemaVersion: data.schemaVersion || 0 });
    config.options = data.options || {};
    mkdirSync(CUSTOM_DIR, { recursive: true });
    for (const f of data.custom || []) if (CUSTOM_RE.test(f.name)) writeFileSync(path.join(CUSTOM_DIR, path.basename(f.name)), Buffer.from(f.b64, 'base64'));
    saveConfig(config);
    sync.invalidate();
    return { ok: true, lang: config.lang, workspace: who.workspace, name: who.name, rootUrl: data.rootUrl, from: data.from || '' };
  },
});

const server = http.createServer(async (req, res) => {
  try {
    if (!isLoopback(req.socket.remoteAddress) || !ALLOWED_HOSTS.has(req.headers.host || '')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Forbidden');
    }
    const url = new URL(req.url, `http://${HOST}:${PORT}`);

    if (req.method !== 'GET') {
      const isShutdown = url.pathname === '/api/shutdown' && req.method === 'POST';
      const action = req.method === 'POST' && Object.hasOwn(ACTIONS, url.pathname) ? ACTIONS[url.pathname] : null;
      const m = url.pathname.match(/^\/api\/(trades|konta|finanse)(?:\/([0-9a-f-]{36}))?$/i);
      const isPage = m && ((req.method === 'POST' && !m[2]) || (req.method === 'PATCH' && m[2]));
      if (!isShutdown && !action && !isPage) { res.writeHead(405, SEC_HEADERS); return res.end(); }
      const bad = guardWrite(req, { json: !isShutdown });
      if (bad) {
        console.error('[write] rejected:', bad);
        return sendJson(res, 403, { error: t('Żądanie odrzucone: zapis jest możliwy tylko z samego dashboardu.') });
      }
      if (isShutdown) {
        sendJson(res, 200, { ok: true });
        console.log('Shutdown requested from the status bar.');
        res.on('finish', () => setTimeout(() => process.exit(0), 100));
        return;
      }
      try {
        const body = await readJson(req);
        if (action) return sendJson(res, 200, await action(body));
        if (m[2] && !PAGE_ID_RE.test(m[2])) throw new ValidationError({}, 'Nieprawidłowy identyfikator wpisu.');
        return sendJson(res, 200, await writer[m[1].toLowerCase()](body, m[2] || null));
      } catch (e) {
        return sendError(res, e);
      }
    }

    if (url.pathname === '/api/data') {
      try {
        const payload = await data.getPayload(url.searchParams.has('refresh'));
        return sendJson(res, 200, { ...payload, meta: meta() });
      } catch (e) {
        const status = e instanceof NotionError ? e.status : 500;
        console.error('[api]', e.message);
        const msg = e.missingDs ? t('Brak identyfikatorów baz w .env: {list}.', { list: e.missingDs.join(', ') }) : e.message;
        return sendJson(res, 502, { error: msg, status });
      }
    }
    if (url.pathname === '/api/meta') return sendJson(res, 200, meta());
    if (url.pathname === '/api/update-check') return sendJson(res, 200, await updateInfo());
    if (url.pathname === '/api/update/status') return sendJson(res, 200, upd);
    if (url.pathname === '/api/setup/status') return sendJson(res, 200, setupJob);
    if (url.pathname === '/api/sync') return sendJson(res, 200, await sync.pull({ force: url.searchParams.has('force') }));
    if (url.pathname === '/api/devices') return sendJson(res, 200, await sync.devices());
    if (url.pathname === '/api/setup/state') return sendJson(res, 200, { hasToken: notion.hasToken, configured: !!SOURCES.trades, lang: config.lang, onboarded: config.onboarded !== false, resumable: !!config.setupProgress?.rootPageId, parentPageId: config.setupProgress?.parentPageId || null });
    if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, version: APP_VERSION });
    if (url.pathname === '/api/ping') return sendJson(res, 200, { ok: true, app: 'trading-hq', version: APP_VERSION, img: stats });
    if (url.pathname === '/api/img') return await handleImg(url, res);

    // Strony robocze z testy/ (np. podgląd kart Udostępnij) tylko dla dashboardu testowego: testy/start-test.mjs ustawia THQ_TEST_PAGES=1.
    if (process.env.THQ_TEST_PAGES === '1' && url.pathname.startsWith('/__testy/') && url.pathname.endsWith('.html')) {
      const tf = path.normalize(path.join(ROOT, 'testy', path.basename(url.pathname)));
      if (existsSync(tf) && statSync(tf).isFile()) { res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache', ...SEC_HEADERS }); return createReadStream(tf).pipe(res); }
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SEC_HEADERS });
    createReadStream(file).pipe(res);
  } catch (e) {
    console.error('[server]', e.message);
    res.writeHead(500); res.end();
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is busy: assuming the dashboard is already running.`);
    process.exit(0);
  }
  console.error(e.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => console.log(`JustJournal ${APP_VERSION}: http://${HOST}:${PORT}`));
void DBS;
