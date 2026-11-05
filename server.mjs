// JustJournal: lokalny serwer dashboardu. Zero zależności, Node 22+.
// Czyta .env i config.local.json, odpytuje Notion API, normalizuje dane (po rolach pól, nie po nazwach) i serwuje public/.
// Token nigdy nie trafia do frontendu ani do logów. / The token never reaches the browser or the logs.
import http from 'node:http';
import { existsSync, statSync, createReadStream, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import { ROOT, CONFIG_DIR, CONFIG_FILE, loadEnv, envSettings, loadConfig, saveConfig, saveEnv, configExists, keyHint } from './lib/env.mjs';
import { createNotion, NotionError } from './lib/notion.mjs';
import { createData } from './lib/data.mjs';
import { createWriter, ValidationError, PAGE_ID_RE } from './lib/writes.mjs';
import { createCandles, LIMIT_MAX_USD, CREDIT_MAX_USD, IMPORT_MAX_USD, OPEN_IMPORT_MAX_USD } from './lib/candles.mjs';
import { upgradeDefaults } from './lib/config-migracje.mjs';
import { scrubSecrets } from './lib/diag.mjs';
import { DatabentoError } from './lib/databento.mjs';
import { createNews } from './lib/news-service.mjs';
import { createReplayRange, parseFindQuery } from './lib/backtest-range.mjs';
import { createBacktestStore, BacktestError, SESSION_BODY_LIMIT, SESSION_ID_RE } from './lib/backtest-store.mjs';
import { createBacktestSync, MARKER_RE } from './lib/backtest-sync.mjs';
import { createAfterBe, readTradeCandles } from './lib/po-be.mjs';
import { createDayIndex } from './lib/backtest-index.mjs';
import { NewsError } from './lib/news.mjs';
import { normSymbol } from './lib/earnings.mjs';
import { createEarnings } from './lib/earnings-service.mjs';
import { createShots, SHOT_BODY_LIMIT } from './lib/shots.mjs';
import { createDrawings, BODY_LIMIT as DRAWINGS_BODY_LIMIT } from './lib/drawings.mjs';
import { setLang, tr as t } from './lib/i18n.mjs';
import { APP_VERSION, SCHEMA_VERSION, REPO, loadSchemaFile, readDiskVersion } from './lib/version.mjs';
import { DBS } from './lib/roles.mjs';
import { spawn } from 'node:child_process';
import { fetchLatest, isNewer } from './lib/updater.mjs';
import { fullCheck, fixSchema, demoRemoval } from './lib/health.mjs';
import { createWorkspace } from './lib/workspace.mjs';
import { verifyToken, listPages, writeShortcut, hasShortcut } from './lib/wizard.mjs';
import { createSync, discoverSettings, pickSettings } from './lib/sync.mjs';
import { sealPackage, openPackage, peekPackage, MAX_ATTEMPTS } from './lib/transfer.mjs';
import { createDiag } from './lib/diag.mjs';
import { resolveDataDir, scanData, createMover, layersOfRow, CANDLE_ROWS, CANDLE_SYMBOLS, DiskError, freeSpace } from './lib/dysk.mjs';
import { createBackups, BackupError } from './lib/kopie.mjs';
import { createTzFix, TzFixError } from './lib/strefa-notion.mjs';

const PUBLIC = path.join(ROOT, 'public');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 4321;
// N2 (1.6.0): znacznik startu procesu (GET /api/health, /api/diag): strona po restarcie z Ustawień czeka na nowy start, a nie na stary proces
const STARTED = Date.now();

// S, SOURCES i notion są podmieniane w miejscu (reconfigure) po zapisaniu tokenu albo utworzeniu dziennika w kreatorze,
// więc moduły, które dostały do nich referencję (odczyt, zapis), od razu widzą nową konfigurację.
let S = envSettings(loadEnv());
const SOURCES = { ...S.sources };
let config = loadConfig();
// Poprawki po review N1–N4 (P1-1, bezp. P2-1): nieczytelny config.local.json odkładamy jako config.local.json.corrupt-<czas> przed jakimkolwiek zapisem;
// ten start traktuje instalację jak nową (bez migracji wartości), a diagnostyka pokazuje nazwę kopii, żeby dało się odzyskać ustawienia
let CONFIG_CORRUPT = null;
if (config.corrupt) {
  CONFIG_CORRUPT = `${CONFIG_FILE}.corrupt-${new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}`;
  try { renameSync(path.join(CONFIG_DIR, CONFIG_FILE), path.join(CONFIG_DIR, CONFIG_CORRUPT)); console.error(`[config] ${CONFIG_FILE} is not valid JSON, moved to ${CONFIG_CORRUPT}.`); }
  catch (e) { console.error('[config] cannot move the unreadable config:', e.message); }
}
const firstRun = !configExists();
setLang(config.lang);
// N3 (1.6.0): katalog danych (świece, sesje backtestu, newsy, earningsy, rysunki) z config.local.json dataDir albo CONFIG_DIR/chart-data.
// Czytany raz przy starcie, więc jego zmiana (przeniesienie z Ustawień → Dane na dysku) wymaga restartu (§5.2).
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 6: przenoszenie katalogu danych: kopia → sprawdzenie → przełączenie → restart, stary katalog zostaje)
const DATA = resolveDataDir(config, CONFIG_DIR);
const DATA_DIR = DATA.dir;
if (DATA.missing) console.error(`[data] Data folder from config.local.json (dataDir) is not available, using ${DATA_DIR}.`);
// Test na atrapie API: NOTION_API_BASE=http://127.0.0.1:PORT (domyślnie prawdziwe Notion).
const notion = createNotion({ token: S.token, version: S.version, base: S.base, t });
let saveTimer = 0;
const persistConfig = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { saveConfig(config); } catch (e) { console.error('[config]', e.message); } }, 50); };
// Zapis natychmiast (bez opóźnienia 50 ms): liczniki wydatków Databento muszą przetrwać zamknięcie procesu zaraz po wysłaniu get_range (P25).
const persistConfigNow = () => { clearTimeout(saveTimer); try { saveConfig(config); } catch (e) { console.error('[config]', e.message); } };
const data = createData({ notion, sources: SOURCES, getConfig: () => config, persistConfig, rootUrl: () => S.rootUrl });
const writer = createWriter({ notion, sources: SOURCES, data, t });
const shots = createShots({ notion, sources: SOURCES, data, t });
const drawings = createDrawings({ notion, sources: SOURCES, data, t, baseDir: DATA_DIR });
// Świece (Databento): klucz tylko z .env, magazyn w CONFIG_DIR/chart-data, limit kosztu w config.local.json (nigdy w settings).
const candles = createCandles({
  getKey: () => loadEnv().DATABENTO_API_KEY, getConfig: () => config, persistConfig, persistConfigNow,
  saveKey: (key) => saveEnv({ DATABENTO_API_KEY: key }), baseDir: DATA_DIR, t,
  // P50: kolejka dokłada codzienne okno 1s NQ 9:30–11:00 NY (przełącznik chartNq1sDaily, domyślnie włączony). THQ_NO_AUTO_1S=1 ustawiają tylko
  // testy (pomocnicze.cleanEnv): serwer testowy z pustym magazynem nadrabiałby okna od 2020 na atrapie.
  autoOpenWindows: process.env.THQ_NO_AUTO_1S !== '1',
});
// Newsy makro USD (pakiet A, 1.4.0): klucz FRED tylko z .env (jak Databento), magazyn w CONFIG_DIR/chart-data/news, profil świąt z config.local.json (newsHolidayProfile).
// Odświeżanie w tle (feed FF najwyżej raz na godzinę, FRED raz dziennie i tylko z kluczem, RSS Fed raz dziennie) startuje niżej; THQ_NO_NEWS=1 ustawiają tylko testy.
const news = createNews({
  baseDir: DATA_DIR, getKey: () => loadEnv().FRED_API_KEY, getProfile: () => config.newsHolidayProfile,
  userAgent: `JustJournal/${APP_VERSION} (+https://github.com/${REPO})`,
});
// Earningsy spółek S&P 100 (pakiet A2, 1.4.0): klucz Finnhub tylko z .env, magazyn w CONFIG_DIR/chart-data/earnings, ręczne wyjątki klas w config.local.json
// (earningsClassOverrides: { TICKER: 1-4 }, earningsExtra: [tickery]). Aplikacja nie łączy się z SEC; Finnhub tylko z kluczem.
const earnings = createEarnings({ baseDir: DATA_DIR, getKey: () => loadEnv().FINNHUB_API_KEY, getConfig: () => config });
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
// N4 (1.6.0): okno 1s NQ wyłączone w nowych instalacjach, u istniejących zostaje włączone (lib/config-migracje.mjs); kredytu migracja nie wpisuje nikomu.
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 4: okno 1s NQ wyłączone w nowych instalacjach, u obecnych włączone)
// [U] 31.10.2026 «Wpisz tylko u mnie» (migracja w kodzie nie wpisuje nikomu kwot kredytu)
{
  const had = !!config.defaultsUpgraded;
  const changed = upgradeDefaults(config, { firstRun });
  if (changed.length) console.log(`[config] 1.6.0 defaults kept for this installation: ${changed.join(', ')}.`);
  if (!had) persistConfigNow();
}

const stats = data.stats;

// ---------- proxy zrzutów ----------
function safeRemoteUrl(u) {
  let url;
  try { url = new URL(u); } catch { return null; }
  // Tylko dashboard testowy (THQ_TEST_PAGES=1, jak start-test.mjs) na atrapie Notion: jej pliki leżą pod adresem http://127.0.0.1. Prawdziwa instalacja ma https i tej gałęzi nie widzi.
  if (process.env.THQ_TEST_PAGES === '1' && process.env.NOTION_API_BASE) { try { if (url.origin === new URL(process.env.NOTION_API_BASE).origin) return url; } catch { /* zły adres bazowy: reguły poniżej */ } }
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
// Proces mógł wystartować przed aktualizacją plików (git pull, ręczne kopiowanie): wtedy wersja na dysku różni się od APP_VERSION. / The process may run older code than the files on disk.
function versionState() {
  let diskVersion = APP_VERSION;
  try { diskVersion = readDiskVersion(); } catch { /* brak odczytu: traktuj jak zgodną */ }
  const restartNeeded = diskVersion !== APP_VERSION;
  return { diskVersion, restartNeeded };
}
async function updateInfo({ force = false } = {}) {
  const vs = versionState();
  if (config.updateCheck === false && !force) return { disabled: true, current: APP_VERSION, available: false, restartNeeded: vs.restartNeeded, diskVersion: vs.diskVersion };
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
  // oferta dotyczy wersji nowszej niż pliki na dysku (nie niż działający proces), a przy niezgodności zamiast oferty jest prośba o restart
  const available = !vs.restartNeeded && isNewer(u.latest, vs.diskVersion);
  return {
    restartNeeded: vs.restartNeeded, diskVersion: vs.diskVersion,
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
// Ponowne uruchomienie na kodzie z dysku: lib/restart.mjs czeka na koniec tego procesu i startuje nowy.
function scheduleRestart(delay) {
  setTimeout(() => {
    try {
      const h = spawn(process.execPath, [path.join(ROOT, 'lib', 'restart.mjs'), String(process.pid)], { cwd: ROOT, env: process.env, detached: true, stdio: 'ignore', windowsHide: true });
      h.unref();
    } catch (e) { console.error('[restart]', e.message); }
    server.close();
    setTimeout(() => process.exit(0), 200);
  }, delay);
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
    scheduleRestart(1500);
  });
}

// ---------- ochrona endpointów zapisu ----------
// Serwer słucha tylko na 127.0.0.1, ale strona otwarta w tej samej przeglądarce mogłaby próbować pisać po cichu.
// Dlatego zapis wymaga: Hosta z loopbacka (anty DNS rebinding), Origin równego adresowi dashboardu, własnego nagłówka
// X-THQ i JSON-a (to wymusza preflight CORS dla obcych stron, którego serwer nigdy nie zatwierdza).
// K (31.10.2026): ciągła oś czasu zamiast dnia replayu ([U] «nie powinno byc takiego czegos jak koniec dnia»)
const replayRange = createReplayRange({ candles, news, earnings, baseDir: DATA_DIR, t });
// Backtest (1.5.0, pakiet C1): sesje w CONFIG_DIR/chart-data/backtest/sessions (źródło prawdy stanu sesji), pula dni z indeksu pokrycia świec.
const btStore = createBacktestStore({ baseDir: DATA_DIR, t });
// po-be-02 (04.11.2026): wynik po BE liczy serwer (granica sesji z pliku sesji, pamięć podręczna w chart-data/after-be-cache.json)
// [U] 04.11.2026 «Dobieraj automatycznie świece 1m», «Wyłącznik, u ciebie włączony»: wantWindows (tylko Live i Paper) dokłada okna do kolejki; przełącznik i strażników pilnuje lib/candles.mjs
// Przy kopii katalogu danych wynik dalej się liczy (odczyt), ale nic nie dopisujemy do kolejki starego katalogu, jak queueTick; następne pytanie po kopii dołoży pozycję.
const afterBe = createAfterBe({ btStore, replayRange, candles, baseDir: DATA_DIR, t, wantWindows: (list) => (mover.writesBlocked() ? undefined : candles.wantAfterBeWindows(list)), heldWindows: (list) => candles.afterBeHeld(list), writesBlocked: () => mover.writesBlocked() });
// E2: wysyłka trade'ów sesji do bazy Trade'y (typ Backtest), idempotentna po znaczniku w polu „Sesja backtestu”
const btSync = createBacktestSync({ store: btStore, writer, drawings, data, t });
const btIndex = createDayIndex({ candles, news, earnings, baseDir: DATA_DIR, t });
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

function readJson(req, limit = 64 * 1024, tooBig = 'Dane są zbyt duże.') {
  return new Promise((resolve, reject) => {
    let size = 0, done = false, draining = false;
    const chunks = [];
    const tooLarge = () => Object.assign(new ValidationError({}, tooBig), { tooLarge: true });
    req.on('data', (c) => {
      size += c.length;
      // final (1.6.0): nadmiar do 4× limitu doczytujemy bez zapisu i dopiero wtedy odpowiadamy 413; odpowiedź w trakcie wysyłania ciała
      // zrywała połączenie po stronie klienta („fetch failed” zamiast komunikatu, niestabilny test wykresy-12 D4). Większe ciało: 413 od razu.
      if (draining) { if (size > limit * 4) { draining = false; req.pause(); reject(tooLarge()); } return; }
      if (done) return;
      if (size > limit) { done = true; draining = true; chunks.length = 0; return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (draining) { draining = false; reject(tooLarge()); return; }
      if (done) return;
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
  if (e instanceof ValidationError) {
    if (e.tooLarge) { res.setHeader('Connection', 'close'); res.on('finish', () => res.req?.destroy()); }
    return sendJson(res, e.tooLarge ? 413 : 400, { error: e.msgKey ? t(e.message) : e.message, fields: e.fields });
  }
  console.error('[write]', e.message);
  const s = e instanceof NotionError || e instanceof DatabentoError || e instanceof NewsError || e instanceof BacktestError || e instanceof DiskError || e instanceof BackupError || e instanceof TzFixError ? e.status : 500;
  // 401 z Notion to problem tokenu, nie klienta: oddajemy 502 z czytelnym komunikatem
  const status = s === 401 || s < 400 || s > 599 ? 502 : s;
  return sendJson(res, status, { error: e.message, code: e.code, ...(e.left !== undefined ? { left: e.left } : {}) });
}

function meta() {
  return {
    ...versionState(), lang: config.lang, version: APP_VERSION, schemaVersion: SCHEMA_VERSION, installedSchema: config.schemaVersion || 0,
    updateCheck: config.updateCheck !== false, notionUrl: S.rootUrl, onboarded: config.onboarded !== false, hasDatabentoKey: candles.hasKey(), hasFredKey: news.hasKey(), hasFinnhubKey: earnings.hasKey(), chartCostLimitUsd: candles.limitUsd(), chartDailyLimitUsd: candles.dailyLimitUsd(), chartSpentTodayUsd: candles.spentToday(), chartCredit: candles.credit(), chartNq1sDaily: config.chartNq1sDaily === true, chart1mDaily: config.chart1mDaily === true, chartAfterBe: config.chartAfterBe === true, syncEnabled: config.syncEnabled !== false, deviceId: config.deviceId, deviceName: config.deviceName,
  };
}

const SCHEMA = loadSchemaFile();
// N6: grupa „Dane rynkowe” w Gotowości: klucze tak/nie, kredyt, kolejka i wolne miejsce, bez żadnego zapytania do dostawców
async function marketState() {
  const free = await freeSpace(DATA_DIR).catch(() => null);
  return { databento: { key: candles.hasKey(), credit: candles.credit(), nq1sDaily: config.chartNq1sDaily === true, queue: candles.status().queue }, fred: news.hasKey(), finnhub: earnings.hasKey(), freeBytes: free?.freeBytes ?? null };
}
const healthCtx = () => ({ notion, sources: SOURCES, config, schema: SCHEMA, schemaVersion: SCHEMA_VERSION, host: HOST, updateInfo, rootUrl: S.rootUrl, t, market: marketState });
// POST z ochroną zapisu: ścieżka → obsługa (body) → odpowiedź
const ACTIONS = {
  '/api/config': async (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BacktestError(t('Nieprawidłowe dane ustawień.'), 400, 'bad-body');
    if (typeof body.updateCheck === 'boolean') config.updateCheck = body.updateCheck;
    if (typeof body.onboarded === 'boolean') config.onboarded = body.onboarded;
    if (typeof body.syncEnabled === 'boolean') config.syncEnabled = body.syncEnabled;
    if (typeof body.chartNq1sDaily === 'boolean') config.chartNq1sDaily = body.chartNq1sDaily; // P50: urządzenie i pieniądze, nie settings ani Notion
    // P57 (3.11.2026): automatyczne minutówki ES i NQ; tak samo urządzenie i pieniądze, domyślnie wyłączone
    if (typeof body.chart1mDaily === 'boolean') config.chart1mDaily = body.chart1mDaily;
    // P57, przegląd (4.11.2026): wyłączenie automatu zatrzymuje wydawanie od razu, więc jego pozycje znikają z kolejki (okna trade'ów zostają)
    // [U] 04.11.2026 «Wyłącznik, u ciebie włączony»: dobieranie świec do wyniku po BE, urządzenie i pieniądze, domyślnie wyłączone; włącza je tylko jawne true z Ustawień
    if (typeof body.chartAfterBe === 'boolean') config.chartAfterBe = body.chartAfterBe;
    if (body.chart1mDaily === false || body.chartNq1sDaily === false || body.chartAfterBe === false) candles.dropAutomatic();
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
  '/api/restart': async () => {
    // N2–N4 i poprawki po review: wspólna blokada (aktualizacja, tworzenie dziennika, kopia katalogu danych, każde pobieranie świec)
    const why = busyReason();
    if (why) throw Object.assign(new NotionError(why, 409), { code: 'running' });
    const vs = versionState();
    console.log(`Restart requested (running ${APP_VERSION}, on disk ${vs.diskVersion}).`);
    scheduleRestart(800);
    return { restarting: true, diskVersion: vs.diskVersion };
  },
  '/api/update/run': async () => {
    // poprawki po review N1–N4 (P3-2): aktualizacja kończy się restartem, więc czeka na te same prace co restart
    const why = busyReason();
    if (why) throw Object.assign(new NotionError(why, 409), { code: 'running' });
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
let setupJob = { running: false, done: false, error: null, steps: SETUP_STEPS.map((id) => ({ id, status: 'pending' })), rootUrl: '', skippedViews: [], settings: null };
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
// 1.6.1: kreator najpierw szuka istniejącego bloku „Ustawienia dashboardu” w całym zakresie integracji (nie tylko na stronie z bazami) i go podpina,
// zamiast zakładać nowy pusty. Wynik: { state: 'own' | 'adopted' | 'none' | 'off' | 'error', pageTitle, pageUrl, updatedAt, others, truncated }.
// Decyzja gustu 1.11.2026: przy kilku blokach bez pytania wybieramy najnowszy (ostatni zapis ustawień) i mówimy użytkownikowi, co wybrano.
async function adoptSettingsBlock(rootPageId, pages) {
  if (config.syncEnabled === false) return { state: 'off' };
  try {
    // najpierw sama strona z bazami (zwykle blok leży tu i nie trzeba przeglądać reszty), dopiero potem wszystkie strony integracji
    let found = rootPageId ? await discoverSettings(notion, pages.filter((p) => p.id === rootPageId)) : null;
    if (!found?.candidates.length) found = await discoverSettings(notion, pages);
    const pick = pickSettings(found.candidates, rootPageId);
    const base = { scanned: found.scanned, failed: found.failed, truncated: found.truncated };
    if (!pick) return { state: 'none', ...base };
    const c = pick.chosen;
    config.settingsBlock = { toggleId: c.toggleId, codeId: c.codeId };
    saveConfig(config);
    sync.invalidate();
    return { state: pick.own ? 'own' : 'adopted', pageTitle: c.pageTitle, pageUrl: c.pageUrl, updatedAt: c.updatedAt, others: pick.others, ...base };
  } catch (e) {
    console.error(`[setup] szukanie bloku ustawień nie powiodło się (${e.message}); zostaje zachowanie domyślne: blok powstanie na stronie dziennika, jeśli go tam nie ma`);
    return { state: 'error' };
  }
}
function runSetupJob({ pageId, lang, demo }) {
  setupJob = { running: true, done: false, error: null, steps: SETUP_STEPS.map((id) => ({ id, status: 'pending' })), rootUrl: '', skippedViews: [], settings: null };
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
  const prepare = async () => {
    // wznowienie (blok już założony w tym przebiegu) nie szuka ponownie
    if (state.settingsBlock) return;
    const adopted = await adoptSettingsBlock(null, await listPages(notion, SCHEMA).catch(() => []));
    setupJob.settings = adopted;
    // istniejący blok z innej strony: nowy dziennik go używa, więc nie zakładamy drugiego
    if (adopted.state === 'adopted') { state.settingsBlock = true; saveConfig(config); }
  };
  prepare()
    .then(() => createWorkspace(notion, { schema: SCHEMA, parentPageId: pageId, lang, demo, log, state, save: () => saveConfig(config) }))
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
  '/api/candles/quote': (body) => candles.quote(body ?? {}),
  // po-be-02: POST (nie GET), bo lista pozycji jest długa; chroniona jak zapis (guardWrite), odpowiedź { results } to wyłącznie Result, bez świec i cen
  '/api/after-be': (body) => afterBe.resolve(body?.items),
  // N3: w trakcie przenoszenia katalogu danych nic nie dopisuje świec do starego katalogu (moveBusy rzuca 409)
  '/api/candles/fetch': (body) => moveBusy() || candles.fetchDays(body ?? {}),
  '/api/candles/key': (body) => candles.setKey(body ?? {}),
  '/api/candles/limit': async (body) => candles.setLimit(body ?? {}),
  // P25: okna 1s wokół trade'ów trafiają do kolejki (połączone, bez duplikatów); pobieranie rusza od razu, o ile strażniki przepuszczają
  '/api/candles/windows': async (body) => { const r = candles.enqueue(body ?? {}); setTimeout(queueTick, 0); return r; },
  '/api/candles/queue-run': async () => { setTimeout(queueTick, 0); return { ok: true }; },
  // P25: import historii 1m (dryRun = sama wycena; pobranie wymaga confirmedCostUsd, ewentualnie limitsOverrideUsd)
  '/api/candles/import': (body) => (body?.dryRun === true ? null : moveBusy()) || candles.importHistory(body ?? {}),
  // P49: okna 1s NQ 9:30–11:00 NY, budżet 36 USD (narzedzia/import-okien-1s.mjs)
  '/api/candles/import-1s': (body) => (body?.dryRun === true ? null : moveBusy()) || candles.importOpen(body ?? {}),
});
// Newsy i earningsy (1.4.0): klucze FRED i Finnhub tylko do .env (jak Databento, nigdy do Notion ani do ustawień), ręczne wyjątki klas earningów w config.local.json.
// Po zapisie klucza odświeżenie rusza w tle (zapytań do FRED jest kilkadziesiąt), wynik widać w statusie (GET /api/news/status, /api/earnings/status).
const FRED_KEY_RE = /^[A-Za-z0-9]{32}$/, FINNHUB_KEY_RE = /^[A-Za-z0-9]{10,60}$/;
// THQ_NO_NEWS=1 (tylko testy i dashboard testowy): zapis klucza nie uruchamia zapytań do FRED ani Finnhub
const background = (label, fn) => { if (process.env.THQ_NO_NEWS === '1') return; Promise.resolve().then(fn).catch((e) => console.error(`[${label}]`, e.message)); };
Object.assign(ACTIONS, {
  '/api/news/key': async (body) => {
    const key = String(body?.key ?? '').trim();
    if (!FRED_KEY_RE.test(key)) throw new NewsError(t('To nie wygląda na klucz FRED (32 znaki: litery i cyfry).'), 400, 'bad-key');
    saveEnv({ FRED_API_KEY: key });
    background('news', () => news.refreshFred());
    return { ok: true };
  },
  '/api/earnings/key': async (body) => {
    const key = String(body?.key ?? '').trim();
    if (!FINNHUB_KEY_RE.test(key)) throw new NewsError(t('To nie wygląda na klucz Finnhub (10 do 60 znaków: litery i cyfry).'), 400, 'bad-key');
    saveEnv({ FINNHUB_API_KEY: key });
    background('earnings', async () => { await earnings.refreshCalendar(); await earnings.refreshCaps(); });
    return { ok: true };
  },
  // { symbol, cls: 1-4 } przenosi spółkę do klasy (nieznany ticker zostaje dopisany do listy własnych); { symbol, remove: true } cofa wyjątek
  '/api/earnings/classes': async (body) => {
    const symbol = normSymbol(body?.symbol);
    if (!/^[A-Z0-9.]{1,10}$/.test(symbol)) throw new NewsError(t('Ticker to 1 do 10 znaków: litery, cyfry i kropka.'), 400, 'bad-symbol');
    const overrides = { ...(config.earningsClassOverrides || {}) }, extra = new Set(Array.isArray(config.earningsExtra) ? config.earningsExtra : []);
    if (body?.remove === true) { delete overrides[symbol]; extra.delete(symbol); }
    else {
      const cls = Number(body?.cls);
      if (![1, 2, 3, 4].includes(cls)) throw new NewsError(t('Klasa to liczba od 1 do 4.'), 400, 'bad-class');
      if (!earnings.classes().map.has(symbol)) extra.add(symbol);
      overrides[symbol] = cls;
    }
    config.earningsClassOverrides = overrides; config.earningsExtra = [...extra];
    persistConfig();
    return { ok: true, overrides, extra: [...extra] };
  },
});
// ---------- źródła danych (N4, 1.6.0): Ustawienia → Źródła danych ----------
// Klucze Databento, FRED i Finnhub: zapis do .env dopiero po bezpłatnym teście u dostawcy, „Usuń” usuwa linię; odpowiedzi mają tylko „zapisany: tak/nie”
// i 4 ostatnie znaki. Klucz nie trafia do odpowiedzi, logu ani komunikatów błędów (scrubSecrets z wartością klucza), ani do settings i bloku w Notion.
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 1: klucze w Ustawieniach z „Testuj” i „Usuń”, zapis wyłącznie do .env przez serwer, maska z 4 ostatnimi znakami)
const SOURCE_KEYS = { databento: 'DATABENTO_API_KEY', fred: 'FRED_API_KEY', finnhub: 'FINNHUB_API_KEY' };
// Poprawki po review N1–N4 (bezp. P3-2): klucze usunięte albo zastąpione w tej sesji maskujemy w logu dalej (nie leżą już w .env, więc maska dosłowna by ich nie znała)
const forgottenSecrets = new Set();
const rememberOld = (envKey) => { const v = loadEnv()[envKey]; if (v) forgottenSecrets.add(v); };
function sourcesState() {
  const env = loadEnv();
  const st = candles.status();
  return {
    keys: Object.fromEntries(Object.entries(SOURCE_KEYS).map(([s, k]) => [s, { configured: !!env[k], hint: keyHint(env[k]) }])),
    databento: {
      limitUsd: candles.limitUsd(), dailyLimitUsd: candles.dailyLimitUsd(), spentTodayUsd: candles.spentToday(), credit: candles.credit(), nq1sDaily: config.chartNq1sDaily === true, min1Daily: config.chart1mDaily === true, afterBe: config.chartAfterBe === true, afterBeSpentUsd: candles.afterBeSpent(), afterBeReadyTo: candles.readyUntil(),
      // [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 2: bez podnoszenia twardych sufitów): UI tylko je pokazuje, pilnuje serwer
      caps: { limitMaxUsd: LIMIT_MAX_USD, creditMaxUsd: CREDIT_MAX_USD, importMaxUsd: IMPORT_MAX_USD, open1sMaxUsd: OPEN_IMPORT_MAX_USD },
      queue: st.queue, open1s: st.open1s, import1s: st.import1s,
      status: { running: st.running, phase: st.phase, done: st.done, total: st.total, costUsd: st.costUsd, error: st.error, result: st.result, finishedAt: st.finishedAt },
    },
  };
}
async function sourceKey(body) {
  const source = body?.source;
  if (!Object.hasOwn(SOURCE_KEYS, source)) throw new NewsError(t('Nieznane źródło danych.'), 400, 'bad-source');
  if (body.remove !== undefined) {
    if (body.remove !== true) throw new NewsError(t('Nieprawidłowe żądanie.'), 400, 'bad-request');
    rememberOld(SOURCE_KEYS[source]);
    saveEnv({ [SOURCE_KEYS[source]]: null });
    console.log(`[sources] Key removed: ${source}.`);
    return { ok: true, source, configured: false, hint: '' };
  }
  const key = String(body.key ?? '').trim();
  const fail = (e) => {
    const msg = scrubSecrets(e?.message || '', [key]);
    // błąd dostawcy (zły klucz, brak sieci): 400 z komunikatem bez klucza; zapis nie nastąpił
    return new NewsError(t('Klucz nie został zapisany: {msg}', { msg }), e?.status === 409 || e?.status === 422 ? e.status : 400, e?.code || 'bad-key');
  };
  rememberOld(SOURCE_KEYS[source]);
  if (source === 'databento') {
    try { await candles.setKey({ key }); } catch (e) { throw fail(e); }
  } else {
    if (source === 'fred' && !FRED_KEY_RE.test(key)) throw new NewsError(t('To nie wygląda na klucz FRED (32 znaki: litery i cyfry).'), 400, 'bad-key');
    if (source === 'finnhub' && !FINNHUB_KEY_RE.test(key)) throw new NewsError(t('To nie wygląda na klucz Finnhub (10 do 60 znaków: litery i cyfry).'), 400, 'bad-key');
    try { await (source === 'fred' ? news : earnings).testKey(key); } catch (e) { throw fail(e); }
    saveEnv({ [SOURCE_KEYS[source]]: key });
    if (source === 'fred') background('news', () => news.refreshFred());
    else background('earnings', async () => { await earnings.refreshCalendar(); await earnings.refreshCaps(); });
  }
  console.log(`[sources] Key saved after a test: ${source}.`);
  return { ok: true, source, configured: true, hint: keyHint(key) };
}
Object.assign(ACTIONS, {
  '/api/sources/key': async (body) => sourceKey(body),
});

Object.assign(ACTIONS, {
  '/api/setup/token': async (body) => {
    const token = String(body.token || '').trim();
    if (!token) throw new ValidationError({ token: t('Wklej token integracji.') });
    if (!/^[A-Za-z0-9_\-]{20,200}$/.test(token) && !process.env.NOTION_API_BASE) throw new ValidationError({ token: t('To nie wygląda na token Notion (zaczyna się od ntn_).') });
    if (body.replace !== true && (await tokenWorks())) throw Object.assign(new NotionError(t('Token jest już zapisany i działa. Zmienisz go w Ustawieniach: „Zmień token”.'), 409), { code: 'has-token' });
    // final (review kodu P2-1): podmiana klienta Notion w trakcie kopii albo przywracania baz pisałaby dalej starym tokenem do starego dziennika
    if (backups.busy()) throw Object.assign(new NotionError(backups.busy(), 409), { code: 'running' });
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
    // final (review kodu P2-1): zmiana baz (SOURCES) w trakcie kopii albo przywracania mieszałaby dwa dzienniki
    if (backups.busy()) throw Object.assign(new NotionError(backups.busy(), 409), { code: 'running' });
    const allPages = await listPages(notion, SCHEMA);
    const page = allPages.find((p) => p.id === body.pageId);
    if (!page?.journal) throw new ValidationError({ pageId: t('Na tej stronie nie ma kompletnego dziennika (4 baz).') });
    finishInstall({ dsIds: page.journal.dsIds, dbIds: page.journal.dbIds, rootUrl: page.url, rootPageId: page.id, lang: page.journal.lang, schemaVersion: 0 });
    const settings = await adoptSettingsBlock(page.id, allPages);
    // Bieżąca wersja schematu tylko wtedy, gdy w dzienniku niczego nie brakuje (podgląd naprawy jest pusty).
    // Inaczej zostaje 0, żeby „Napraw wszystko” i aktualizacja uzupełniły braki migracjami.
    const probe = await fixSchema({ ...healthCtx(), migrationsDir: path.join(ROOT, 'migrations'), dryRun: true });
    const complete = !probe.changes.length && !probe.manual.length;
    if (complete) { config.schemaVersion = SCHEMA_VERSION; saveConfig(config); }
    return { ok: true, rootUrl: page.url, lang: page.journal.lang, complete, schemaVersion: config.schemaVersion, settings };
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

// ---------- diagnostyka (N2, 1.6.0): Ustawienia → Kopie i diagnostyka ----------
// Stan bez sieci, test źródła (guardWrite przez ACTIONS), log bez sekretów, „Otwórz folder” tylko dla ścieżek serwera.
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 9: restart i zatrzymanie serwera zawsze widoczne w diagnostyce)
const diag = createDiag({
  version: APP_VERSION, started: STARTED, host: HOST, port: PORT, repoUrl: `https://github.com/${REPO}`,
  configDir: CONFIG_DIR, dataDir: DATA_DIR, backupsDir: path.join(CONFIG_DIR, 'backups'), logFile: path.join(CONFIG_DIR, 'dashboard.log'), prevDir: () => prevDataDir(), configCorrupt: CONFIG_CORRUPT,
  notion, sources: SOURCES, getConfig: () => config, schemaVersion: SCHEMA_VERSION, candles, news, earnings, updateInfo, t,
  secrets: () => { const e = loadEnv(); return [...['NOTION_TOKEN', 'DATABENTO_API_KEY', 'FRED_API_KEY', 'FINNHUB_API_KEY'].map((k) => e[k]).filter(Boolean), ...forgottenSecrets]; },
  badRequest: (msg) => new ValidationError({}, msg),
});
Object.assign(ACTIONS, {
  '/api/diag/test': async (body) => diag.test(body?.source),
  '/api/diag/open': async (body) => diag.open(body?.which),
});

// ---------- dane na dysku (N3, 1.6.0): Ustawienia → Dane na dysku ----------
// Przegląd bez sieci (GET /api/disk), usuwanie warstwy świec z potwierdzeniem nazwą, przenoszenie katalogu danych (kopia → sprawdzenie → przełączenie → restart).
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 6: przenoszenie katalogu danych: kopia → sprawdzenie → przełączenie → restart, stary katalog zostaje)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 7: usuwanie świec z UI tak, kopii baz nie)
const BACKUPS_DIR = path.join(CONFIG_DIR, 'backups');
// poprzedni katalog danych (po przeniesieniu) tylko z config.local.json i tylko jako ścieżka bezwzględna
function prevDataDir() { const p = config.dataDirPrev; return typeof p === 'string' && path.isAbsolute(p) && p !== DATA_DIR ? p : null; }
// Poprawki po review N1–N4 (kod P3-2, bezp. „poza punktacją”): jeden powód blokady dla restartu, zatrzymania i aktualizacji. Przerwanie kopii zostawia
// niepełny katalog, przerwanie pobierania traci opłaconą (zarezerwowaną w liczniku) partię. null = można.
// N5: zadanie kopii baz (kopia teraz, podgląd, przywrócenie) też blokuje restart, zatrzymanie i aktualizację (kopie sprawdzają własne zadanie przed tą funkcją)
function busyReason() {
  if (backups.busy()) return backups.busy();
  if (tzFix.busy()) return tzFix.busy();
  if (upd.running) return t('Aktualizacja już trwa.');
  if (setupJob.running) return t('Trwa tworzenie dziennika. Spróbuj po jego zakończeniu.');
  if (mover.busy()) return t('Trwa przenoszenie danych. Spróbuj po jego zakończeniu.');
  const c = candles.status();
  if (c.running) return c.phase === 'import' || c.phase === 'import-1s' ? t('Trwa import świec. Spróbuj po jego zakończeniu.') : t('Trwa pobieranie świec. Spróbuj po jego zakończeniu.');
  return null;
}
const mover = createMover({
  getDataDir: () => DATA_DIR, appRoot: ROOT, getConfig: () => config, saveConfig: () => persistConfigNow(), t,
  isBusy: () => (candles.status().running ? t('Trwa pobieranie świec. Spróbuj po jego zakończeniu.') : null),
});
// Blokada zapisów świec w trakcie kopii: zwraca nic (można działać) albo rzuca 409
function moveBusy() {
  if (mover.busy()) throw new DiskError(t('Trwa przenoszenie danych. Spróbuj po jego zakończeniu.'), 409, 'moving');
  if (mover.writesBlocked()) throw new DiskError(t('Kopia danych czeka na przełączenie. Przełącz albo anuluj w Ustawieniach → Dane na dysku.'), 409, 'moving');
  return null;
}
// Przebieg kolejki świec (timer co 5 minut i żądania z dashboardu); w trakcie kopii katalogu czeka
function queueTick() {
  if (mover.writesBlocked()) return;
  candles.tick().catch((e) => console.error('[candles] kolejka:', e.message));
}
// Dozwolone nazwy wierszy i symbole: tylko z list (nigdy ścieżka z żądania)
function deleteCandles(body) {
  moveBusy();
  const symbol = body?.symbol, layer = body?.layer;
  if (!CANDLE_SYMBOLS.includes(symbol) || !CANDLE_ROWS.includes(layer)) throw new DiskError(t('Nieznany instrument albo warstwa świec.'), 400, 'bad-layer');
  if (body.confirm !== `${symbol} ${layer}`) throw new DiskError(t('Żeby usunąć, wpisz dokładnie: {name}', { name: `${symbol} ${layer}` }), 400, 'confirm-required');
  const symDir = path.join(DATA_DIR, 'candles', symbol);
  const present = existsSync(symDir) ? readdirSync(symDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
  const layers = layersOfRow(layer, present);
  if (!layers.length) return { ok: true, removed: [], bytes: 0 };
  let bytes = 0;
  const count = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) count(p); else if (e.isFile()) bytes += statSync(p).size; } };
  for (const l of layers) count(path.join(symDir, l));
  const r = candles.deleteLayers(symbol, layers);
  // indeks cech dni liczony z pokrycia świec: po usunięciu warstwy liczy się od nowa
  try { rmSync(path.join(DATA_DIR, 'backtest', `day-index-${symbol}.json`), { force: true }); } catch { /* brak pliku */ }
  console.log(`[data] Removed candle layers ${symbol}: ${layers.join(', ')}.`);
  return { ok: true, removed: layers, bytes, queueDropped: r.dropped };
}
Object.assign(ACTIONS, {
  '/api/disk/candles/delete': async (body) => moveBusy() || deleteCandles(body),
  // { target, dryRun: true } sprawdza ścieżkę i miejsce; { target, confirm: true } zaczyna kopię
  '/api/disk/move': async (body) => {
    if (body?.dryRun === true) return { ok: true, ...(await mover.check(body.target)) };
    if (body?.confirm !== true) throw new DiskError(t('Przeniesienie wymaga potwierdzenia.'), 400, 'confirm-required');
    return mover.start(body.target);
  },
  '/api/disk/move/cancel': async () => mover.cancel(),
  // Przełączenie: zapis dataDir w config.local.json, potem restart (nowy proces czyta nowy katalog); stary katalog zostaje
  '/api/disk/move/switch': async () => {
    // final (review kodu P2-1): ta sama blokada co restart (kopia i przywracanie baz, aktualizacja, tworzenie dziennika, pobieranie świec)
    const why = busyReason();
    if (why) throw new DiskError(why, 409, 'running');
    const r = await mover.switchTo();
    console.log(`[data] Data folder switched to ${r.dataDir}, restarting.`);
    scheduleRestart(800);
    return { ...r, restarting: true };
  },
});

// ---------- kopie baz Notion (N5, 1.6.0): Ustawienia → Kopie i diagnostyka ----------
// Lista kopii, kopia teraz, podgląd przywracania bez zapisu i przywrócenie po wpisaniu „TAK” (EN „YES”) z kopią bieżącego stanu przed zapisem.
// Logika kopii i planu bez zmian w lib/backup.mjs; nazwy kopii tylko z listy; usuwania kopii nie ma.
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 7: usuwania kopii baz z UI nie ma)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 8: przywracanie Notion z kopii z UI po wpisaniu „TAK”)
const backups = createBackups({
  notion, sources: SOURCES, backupsDir: BACKUPS_DIR, t,
  meta: () => ({ appVersion: APP_VERSION, schemaVersion: Number(config.schemaVersion) || 0 }),
  isBusy: () => busyReason(),
  lang: () => (config.lang === 'en' ? 'en' : 'pl'),
  onRestored: () => data.invalidate(),
  scrub: (s) => scrubSecrets(s, [...['NOTION_TOKEN', 'DATABENTO_API_KEY', 'FRED_API_KEY', 'FINNHUB_API_KEY'].map((k) => loadEnv()[k]).filter(Boolean), ...forgottenSecrets]),
});
// Poprawa strefy czasu starych wpisów (1.7.0, odbiór): podgląd → kopia baz → zmiana pola time_zone dat wejścia i wyjścia na strefę aplikacji (lib/strefa-notion.mjs)
// [U] 3.11.2026 «Popraw strefę na NY (Recommended)» (przed zmianą kopia zapasowa bazy; uruchamia użytkownik z Ustawień po podglądzie)
// Liczba zapisów trade'ów (dziennik, kosz, backtest, usuwanie DEMO) przyjętych i jeszcze niezakończonych: poprawa strefy nie startuje przy liczniku > 0 (R3-1)
let tradeWritesInFlight = 0;
const tzFix = createTzFix({
  notion, sources: SOURCES, t,
  writesInFlight: () => tradeWritesInFlight,
  loadRoles: async () => { const sch = await data.loadSchema('trades'); return { date: sch.roles.date?.name, exit: sch.roles.exit?.name, instrument: sch.roles.instrument?.name }; },
  copy: (extra) => backups.copyNow(extra),
  isBusy: () => { if (backups.busy()) return backups.busy(); if (upd.running) return t('Aktualizacja już trwa.'); if (setupJob.running) return t('Trwa tworzenie dziennika. Spróbuj po jego zakończeniu.'); if (mover.busy()) return t('Trwa przenoszenie danych. Spróbuj po jego zakończeniu.'); return null; },
  lang: () => (config.lang === 'en' ? 'en' : 'pl'),
  onDone: () => data.invalidate(),
  // odstęp między zapisami stron (limit Notion ok. 3 żądań na sekundę); zmienna tylko dla testów na atrapie
  pace: process.env.THQ_TZFIX_PACE_MS != null ? Math.max(0, Number(process.env.THQ_TZFIX_PACE_MS) || 0) : undefined,
  scrub: (s) => scrubSecrets(s, [...['NOTION_TOKEN', 'DATABENTO_API_KEY', 'FRED_API_KEY', 'FINNHUB_API_KEY'].map((k) => loadEnv()[k]).filter(Boolean), ...forgottenSecrets]),
});
Object.assign(ACTIONS, {
  '/api/tz-fix/preview': async (body) => tzFix.preview(body?.tz),
  '/api/tz-fix/apply': async (body) => tzFix.apply(body?.tz, body?.confirm, body?.token, body?.choices ?? {}),
});
Object.assign(ACTIONS, {
  '/api/backups/create': async () => backups.create(),
  '/api/backups/preview': async (body) => backups.preview(body?.name),
  // final (P2-2, bezp. P3-2): przywrócenie wymaga znacznika z wyniku podglądu (jednorazowy, ważny kilka minut)
  '/api/backups/restore': async (body) => backups.restore(body?.name, body?.confirm, body?.token),
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
      // Zrzut do trade'a: JSON { type, data: base64 }, żeby zostać przy Content-Type JSON i nagłówku X-THQ (preflight CORS dla obcych stron).
      const sh = req.method === 'POST' ? url.pathname.match(/^\/api\/trades\/([0-9a-f-]{36})\/shots$/i) : null;
      // Rysunki wykresu: JSON { id, doc } do 256 KB (maksimum 190 000 znaków po zapisie, z zapasem na znaki specjalne)
      const dr = req.method === 'POST' && url.pathname === '/api/drawings/save';
      // Backtest (C1): stan sesji JSON { id, doc, rev } do 4 MB (rysunki i trade'y całej sesji), wersja sprawdzana w magazynie (409 stale)
      const bts = req.method === 'POST' && url.pathname === '/api/backtest/session/save';
      // Backtest (E2): wysyłka trade'ów sesji do Notion, JSON { sessionId, day?, all?, auto? } do 4 KB
      const btn = req.method === 'POST' && url.pathname === '/api/backtest/notion';
      // [U] 1.11.2026 «oraz dodaj mozliwosc usuniecia sesji…»: usunięcie sesji (plik do sessions/usuniete) i cofnięcie, JSON { id } do 1 KB
      const btdel = req.method === 'POST' && (url.pathname === '/api/backtest/session/delete' || url.pathname === '/api/backtest/session/restore');
      // [U] 2026-11-01 «Archiwum Notion + Cofnij»: usunięcie trade'a (strona do archiwum Notion) i cofnięcie. Dziennik: POST /api/trades/<id>/trash|untrash,
      // backtest: POST /api/backtest/trade/trash|restore { sessionId, tradeId, skipNotion? }. Ciało JSON do 1 KB, identyfikatory walidowane po stronie serwera.
      const trTrash = req.method === 'POST' ? url.pathname.match(/^\/api\/trades\/([0-9a-f-]{36})\/(trash|untrash)$/i) : null;
      const btTrade = req.method === 'POST' && (url.pathname === '/api/backtest/trade/trash' || url.pathname === '/api/backtest/trade/restore');
      const demoRm = req.method === 'POST' && url.pathname === '/api/demo/remove';
      if (!isShutdown && !action && !isPage && !sh && !dr && !bts && !btn && !btdel && !trTrash && !btTrade) { res.writeHead(405, SEC_HEADERS); return res.end(); }
      const bad = guardWrite(req, { json: !isShutdown });
      if (bad) {
        console.error('[write] rejected:', bad);
        return sendJson(res, 403, { error: t('Żądanie odrzucone: zapis jest możliwy tylko z samego dashboardu.') });
      }
      if (isShutdown) {
        const why = busyReason();
        if (why) return sendJson(res, 409, { error: why, code: 'running' });
        sendJson(res, 200, { ok: true });
        console.log('Shutdown requested from the status bar.');
        res.on('finish', () => setTimeout(() => process.exit(0), 100));
        return;
      }
      // licznik zapisów w toku (R3-1): zwiększany przy przyjęciu zapisu trade'a, zmniejszany w finally po ZAKOŃCZENIU pracy handlera (nie po zamknięciu odpowiedzi)
      let counted = false;
      try {
        // Decyzja sesji głównej 3.11.2026 (bezpieczeństwo P3-1): w czasie poprawy strefy starych wpisów zapis, edycja i usuwanie trade'ów dostają 409, żeby poprawa
        // nie nadpisała daty zmienionej w trakcie jej przebiegu
        // Bezpieczeństwo R3-1 i R3-2a (rundy 4 i 5): zapis w toku jest liczony do końca pracy handlera (finally niżej), także gdy klient zerwie połączenie,
        // a poprawa nie startuje, gdy licznik > 0. Sprawdzenie blokady i zwiększenie licznika idą bez await, więc nie ma okna między przyjęciem zapisu a startem poprawy.
        // Usunięcie wpisów DEMO też zmienia strony z planu poprawy.
        if ((isPage && m[1].toLowerCase() === 'trades') || trTrash || btTrade || demoRm) {
          const why = tzFix.busy();
          if (why) return sendJson(res, 409, { error: why, code: 'running' });
          tradeWritesInFlight++;
          counted = true;
        }
        if (sh) {
          if (!PAGE_ID_RE.test(sh[1])) throw new ValidationError({}, 'Nieprawidłowy identyfikator wpisu.');
          const body = await readJson(req, SHOT_BODY_LIMIT, 'Plik jest za duży: najwyżej 10 MB.');
          return sendJson(res, 200, await shots.add(sh[1].toLowerCase(), body));
        }
        if (bts) {
          const body = await readJson(req, SESSION_BODY_LIMIT, 'Sesja jest zbyt duża.');
          const bb = body && typeof body === 'object' && !Array.isArray(body) ? body : {}; // null/tablica: 400 z magazynu zamiast 500
          return sendJson(res, 200, btStore.save(bb.id, bb.doc, bb.rev));
        }
        if (btdel) {
          const body = await readJson(req, 1024);
          const bb = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
          if (typeof bb.id !== 'string' || !SESSION_ID_RE.test(bb.id)) throw new BacktestError(t('Nieprawidłowy identyfikator sesji backtestu.'), 400, 'bad-id');
          if (url.pathname.endsWith('/delete')) {
            if (btSync.busy(bb.id)) throw new BacktestError(t('Trwa wysyłka tej sesji do Notion. Spróbuj za chwilę.'), 409, 'busy');
            return sendJson(res, 200, btStore.remove(bb.id));
          }
          return sendJson(res, 200, btStore.restore(bb.id));
        }
        if (trTrash) {
          if (!PAGE_ID_RE.test(trTrash[1])) throw new ValidationError({}, 'Nieprawidłowy identyfikator wpisu.');
          await readJson(req, 1024);
          const trashing = trTrash[2].toLowerCase() === 'trash';
          // trade z sesji backtestu usuwa się w sesji (tam liczą się saldo i statystyki); po usunięciu samej sesji strony zostają i da się je usunąć stąd
          const guard = (btText) => {
            const m = MARKER_RE.exec(btText || '');
            if (!trashing || !m || !btStore.sessionTrade(m[1], m[2])) return;
            const nm = String(btStore.read(m[1])?.name || m[1]);
            throw new BacktestError(t('Ten trade należy do sesji backtestu „{name}”. Usuń go w sesji (Backtest, zakładka Historia).', { name: nm }), 409, 'backtest-owned');
          };
          return sendJson(res, 200, await writer.trashTradePage(trTrash[1].toLowerCase(), trashing, { guard }));
        }
        if (btTrade) {
          const body = await readJson(req, 1024);
          const bb = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
          if (typeof bb.sessionId !== 'string' || !SESSION_ID_RE.test(bb.sessionId)) throw new BacktestError(t('Nieprawidłowy identyfikator sesji backtestu.'), 400, 'bad-id');
          if (url.pathname.endsWith('/trash')) return sendJson(res, 200, await btSync.trashTrade({ sessionId: bb.sessionId, tradeId: bb.tradeId, skipNotion: bb.skipNotion === true }));
          return sendJson(res, 200, await btSync.untrashTrade({ sessionId: bb.sessionId, tradeId: bb.tradeId }));
        }
        if (btn) {
          const body = await readJson(req, 4096);
          const bb = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
          if (typeof bb.sessionId !== 'string' || !SESSION_ID_RE.test(bb.sessionId)) throw new BacktestError(t('Nieprawidłowy identyfikator sesji backtestu.'), 400, 'bad-id');
          // K (31.10.2026) [U] «od razu»: bez trybu dnia; pole day ignorowane (stara karta przeglądarki)
          return sendJson(res, 200, await btSync.push({ sessionId: bb.sessionId, all: bb.all === true, auto: bb.auto === true }));
        }
        if (dr) {
          const body = await readJson(req, DRAWINGS_BODY_LIMIT, 'Rysunki są zbyt duże.');
          return sendJson(res, 200, await drawings.save(body.id, body.doc));
        }
        // po-be-02: do 500 pozycji Live po ok. 230 B przekracza domyślne 64 KB, więc ta trasa ma 256 KB
        const body = await readJson(req, url.pathname === '/api/after-be' ? 256 * 1024 : undefined);
        if (action) return sendJson(res, 200, await action(body));
        if (m[2] && !PAGE_ID_RE.test(m[2])) throw new ValidationError({}, 'Nieprawidłowy identyfikator wpisu.');
        return sendJson(res, 200, await writer[m[1].toLowerCase()](body, m[2] || null));
      } catch (e) {
        return sendError(res, e);
      } finally {
        if (counted) { counted = false; tradeWritesInFlight--; }
      }
    }

    // Audyt 1.3.0, N1 (29.10.2026): odczyty /api/* odrzucają żądania oznaczone przez przeglądarkę jako obce (obca strona na tej samej przeglądarce nie może na ślepo
    // zlecać kosztownych odczytów, np. świec); ten sam warunek co w guardWrite, plus 'none' (adres wpisany ręcznie). Brak nagłówka (CLI, testy) przechodzi.
    if (url.pathname.startsWith('/api/')) {
      const site = req.headers['sec-fetch-site'];
      if (site && site !== 'same-origin' && site !== 'none') return sendJson(res, 403, { error: t('Żądanie odrzucone: odczyt jest możliwy tylko z samego dashboardu.') });
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
    if (url.pathname === '/api/news' || url.pathname === '/api/news/today' || url.pathname === '/api/news/status' || url.pathname === '/api/news/search') {
      try {
        if (url.pathname === '/api/news/search') return sendJson(res, 200, news.search(Object.fromEntries(['q', 'kinds', 'imps', 'limit', 'before', 'from', 'year'].map((k) => [k, url.searchParams.get(k) ?? undefined]))));
        if (url.pathname === '/api/news/status') return sendJson(res, 200, news.status());
        if (url.pathname === '/api/news/today') return sendJson(res, 200, news.today({ tz: url.searchParams.get('tz') ?? undefined }));
        const num = (k) => (/^\d{1,12}$/.test(url.searchParams.get(k) ?? '') ? Number(url.searchParams.get(k)) : NaN);
        return sendJson(res, 200, news.range(num('from'), num('to')));
      } catch (e) { return sendError(res, e); }
    }
    if (url.pathname === '/api/earnings' || url.pathname === '/api/earnings/today' || url.pathname === '/api/earnings/status' || url.pathname === '/api/earnings/search') {
      try {
        if (url.pathname === '/api/earnings/search') return sendJson(res, 200, earnings.search(Object.fromEntries(['q', 'classes', 'limit', 'before', 'from', 'year'].map((k) => [k, url.searchParams.get(k) ?? undefined]))));
        if (url.pathname === '/api/earnings/status') return sendJson(res, 200, { ...earnings.status(), overrides: config.earningsClassOverrides || {}, extra: config.earningsExtra || [] });
        if (url.pathname === '/api/earnings/today') return sendJson(res, 200, earnings.today({ tz: url.searchParams.get('tz') ?? undefined }));
        const num = (k) => (/^\d{1,12}$/.test(url.searchParams.get(k) ?? '') ? Number(url.searchParams.get(k)) : NaN);
        const mc = url.searchParams.get('maxClass');
        return sendJson(res, 200, earnings.range(num('from'), num('to'), mc === null ? {} : { maxClass: /^\d$/.test(mc) ? Number(mc) : NaN }));
      } catch (e) { return sendError(res, e); }
    }
    if (url.pathname === '/api/candles/status') return sendJson(res, 200, candles.status());
    if (url.pathname === '/api/candles/size') return sendJson(res, 200, { bytes: await candles.dataBytes() }); // Ustawienia → Wykresy → Dane (P39: tylko rozmiar); przegląd HIJ, pkt 1: asynchronicznie, wynik z pamięci 60 s
    if (url.pathname === '/api/candles') {
      // [U] 05.11.2026 «Ogranicz do granicy sesji (Recommended)»: pole btTrade tnie świece do granicy sesji po stronie serwera (lib/po-be.mjs)
      try { return sendJson(res, 200, readTradeCandles({ candles, btStore, t }, Object.fromEntries(url.searchParams))); } catch (e) { return sendError(res, e); }
    }
    // Backtest K (31.10.2026): zakres replayu (strumień bazowy tf=base albo historia wykresu tf=<interwał>) i granice danych; tylko lokalne świece.
    if (url.pathname === '/api/backtest/range') {
      try {
        const q = (k) => url.searchParams.get(k) ?? '';
        return sendJson(res, 200, replayRange.read({ instruments: q('instruments').split(',').filter(Boolean), from: q('from'), to: q('to'), tf: q('tf') || 'base' }));
      } catch (e) { return sendError(res, e); }
    }
    if (url.pathname === '/api/backtest/bounds') {
      try { return sendJson(res, 200, replayRange.bounds({ instruments: (url.searchParams.get('instruments') ?? '').split(',').filter(Boolean) })); } catch (e) { return sendError(res, e); }
    }
    // 1.7-4: skok do ceny: pierwsza świeca bazowa instrumentu po kursorze, która dotyka ceny, w limicie dni handlowych (tylko lokalne świece). Parametry liczbowe przechodzą przez parseFindQuery
    // (typy, zakresy, długości), strażnik Sec-Fetch-Site działa wyżej dla wszystkich odczytów /api/*, a przerwane żądanie (Anuluj, zamknięcie karty) przerywa wyszukiwanie.
    if (url.pathname === '/api/backtest/find-price') {
      const ac = new AbortController();
      res.on('close', () => { if (!res.writableFinished) ac.abort(); });
      try {
        const qy = parseFindQuery(url.searchParams, t);
        return sendJson(res, 200, await replayRange.findPrice({ ...qy, signal: ac.signal }));
      } catch (e) { if (e?.code === 'aborted') return undefined; return sendError(res, e); }
    }
    if (url.pathname === '/api/backtest/sessions') {
      try { return sendJson(res, 200, { sessions: btStore.list() }); } catch (e) { return sendError(res, e); }
    }
    const bsm = url.pathname.match(/^\/api\/backtest\/session\/([^/]{1,64})$/);
    if (bsm) {
      try {
        const doc = btStore.read(bsm[1]);
        return doc ? sendJson(res, 200, doc) : sendJson(res, 404, { error: t('Nie ma takiej sesji backtestu.'), code: 'not-found' });
      } catch (e) { return sendError(res, e); }
    }
    // G (review F1–G #6): lekkie źródło statystyk (bez rysunków); ids=a,b albo bez parametru = wszystkie. Zły identyfikator = 400 (sendError).
    if (url.pathname === '/api/backtest/stats-source') {
      try {
        const q = url.searchParams.get('ids');
        return sendJson(res, 200, btStore.forStats(q === null || q === '' ? null : q.split(',').slice(0, 200)));
      } catch (e) { return sendError(res, e); }
    }
    // Pula dni (C1; F1 rozszerza cechy dnia): dni robocze zakresu z pokryciem 1s NQ i 1m ES/NQ
    if (url.pathname === '/api/backtest/days') {
      try {
        const q = (k) => url.searchParams.get(k) ?? '';
        return sendJson(res, 200, btIndex.get({ instruments: q('instruments').split(',').filter(Boolean), from: q('from'), to: q('to'), mkt: q('mkt') !== '0', start: q('start') })); // mkt=0: statystyki nie liczą cech rynku (review G #6); start: [U] 30.10.2026 «Gap od ceny startu»
      } catch (e) { return sendError(res, e); }
    }
    const dm = url.pathname.match(/^\/api\/drawings\/([0-9a-f-]{36})$/i);
    if (dm) {
      try { return sendJson(res, 200, await drawings.read(dm[1])); } catch (e) { return sendError(res, e); }
    }
    if (url.pathname === '/api/meta') return sendJson(res, 200, meta());
    if (url.pathname === '/api/update-check') return sendJson(res, 200, await updateInfo());
    if (url.pathname === '/api/update/status') return sendJson(res, 200, upd);
    if (url.pathname === '/api/setup/status') return sendJson(res, 200, setupJob);
    if (url.pathname === '/api/sync') return sendJson(res, 200, await sync.pull({ force: url.searchParams.has('force') }));
    if (url.pathname === '/api/devices') return sendJson(res, 200, await sync.devices());
    if (url.pathname === '/api/setup/state') return sendJson(res, 200, { hasToken: notion.hasToken, configured: !!SOURCES.trades, lang: config.lang, onboarded: config.onboarded !== false, resumable: !!config.setupProgress?.rootPageId, parentPageId: config.setupProgress?.parentPageId || null });
    if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, version: APP_VERSION, started: STARTED });
    if (url.pathname === '/api/diag') return sendJson(res, 200, diag.state());
    if (url.pathname === '/api/diag/log') return sendJson(res, 200, diag.logTail(url.searchParams.get('lines')));
    // N3: przegląd katalogu danych (tylko dysk) i stan przenoszenia
    if (url.pathname === '/api/disk') {
      try {
        const s = await scanData({ dataDir: DATA_DIR, backupsDir: BACKUPS_DIR });
        return sendJson(res, 200, { ...s, custom: DATA.custom, missing: DATA.missing, prev: prevDataDir(), move: mover.status(), busy: mover.busy() ? 'move' : candles.status().running ? 'candles' : null });
      } catch (e) { return sendError(res, e); }
    }
    if (url.pathname === '/api/disk/move/status') return sendJson(res, 200, mover.status());
    // N5: lista kopii baz Notion i stan zadania (tylko dysk, bez sieci)
    if (url.pathname === '/api/tz-fix') return sendJson(res, 200, tzFix.status());
    if (url.pathname === '/api/backups') { try { return sendJson(res, 200, backups.list()); } catch (e) { return sendError(res, e); } }
    // N4: stan źródeł danych (bez sieci): klucze tak/nie z 4 znakami, limity, kredyt, sufity, kolejka, import
    if (url.pathname === '/api/sources') return sendJson(res, 200, sourcesState());
    if (url.pathname === '/api/ping') return sendJson(res, 200, { ok: true, app: 'trading-hq', version: APP_VERSION, img: stats, ...(process.env.THQ_TEST_NONCE ? { testNonce: process.env.THQ_TEST_NONCE } : {}) });
    if (url.pathname === '/api/img') return await handleImg(url, res);

    // Strony robocze z testy/ (np. podgląd kart Udostępnij) tylko dla dashboardu testowego: testy/start-test.mjs ustawia THQ_TEST_PAGES=1.
    // K (31.10.2026): także pomocnicze moduły stron testowych testy/bt-*.js (np. bt-zgodnosc.js), tylko z THQ_TEST_PAGES=1
    if (process.env.THQ_TEST_PAGES === '1' && url.pathname.startsWith('/__testy/') && (url.pathname.endsWith('.html') || /^bt-[a-z0-9-]+\.js$/.test(path.basename(url.pathname)))) {
      const tf = path.normalize(path.join(ROOT, 'testy', path.basename(url.pathname)));
      if (existsSync(tf) && statSync(tf).isFile()) { res.writeHead(200, { 'Content-Type': MIME[path.extname(tf)], 'Cache-Control': 'no-cache', ...SEC_HEADERS }); return createReadStream(tf).pipe(res); }
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
    // N1 (1.6.0): drugi start obok działającego dashboardu kończy się jak dotąd (kod 0), a inny program na porcie jest nazwany wprost (kod 1),
    // bo wcześniej log mówił „dashboard już działa”, a przeglądarka otwierała cudzą aplikację
    fetch(`http://${HOST}:${PORT}/api/ping`, { signal: AbortSignal.timeout(1500) }).then((r) => r.json()).then((j) => j?.app === 'trading-hq', () => false).then((ours) => {
      if (ours) { console.log(`Port ${PORT} is busy: the dashboard is already running.`); process.exit(0); }
      console.error(`Port ${PORT} is used by another program (inny program zajmuje port ${PORT}). Close it or set another port: README, FAQ.`);
      process.exit(1);
    });
    return;
  }
  console.error(e.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => console.log(`JustJournal ${APP_VERSION}: http://${HOST}:${PORT}`));
// P25: kolejka okien 1s przechodzi co 5 minut (puste = zero sieci). Start dopiero tu, nie przy imporcie modułu candles.
setInterval(queueTick, 5 * 60_000).unref();
// Newsy: pierwszy przebieg po 5 s od startu, potem co 10 minut (tick sam pilnuje godzinnego odstępu feedu i dobowego FRED; brak sieci nic nie psuje).
if (process.env.THQ_NO_NEWS !== '1') {
  setTimeout(() => news.tick().catch((e) => console.error('[news]', e.message)), 5000).unref();
  setInterval(() => { news.tick().catch((e) => console.error('[news]', e.message)); }, 10 * 60_000).unref();
  setTimeout(() => earnings.tick().catch((e) => console.error('[earnings]', e.message)), 8000).unref();
  setInterval(() => { earnings.tick().catch((e) => console.error('[earnings]', e.message)); }, 10 * 60_000).unref();
}
void DBS;
