// N2 (1.6.0): Ustawienia → Kopie i diagnostyka. Stan połączeń bez sieci (GET /api/diag), test jednego źródła (POST /api/diag/test),
// ostatnie linie dashboard.log bez sekretów (GET /api/diag/log) i „Otwórz folder” tylko dla ścieżek znanych serwerowi (POST /api/diag/open).
// Specyfikacja: backtest-wyniki/N-pierwsze-kroki-ustawienia.md §4.6 i §5.1. Klucze i tokeny nigdy nie wracają do przeglądarki:
// odpowiedzi mają tylko „skonfigurowany: tak/nie”, wynik testu i opis błędu, a log przechodzi przez scrubSecrets.
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 9: restart i zatrzymanie serwera zawsze widoczne w diagnostyce)
import { existsSync, statSync, openSync, readSync, closeSync, readdirSync } from 'node:fs';
import { rotatedName } from './log-rotacja.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { DBS } from './roles.mjs';

export const DIAG_SOURCES = ['notion', 'databento', 'fred', 'finnhub', 'github'];
// N3 (1.6.0): także świece, sesje backtestu i poprzedni katalog danych po przeniesieniu (config.local.json dataDirPrev)
export const OPEN_TARGETS = ['data', 'logs', 'backups', 'candles', 'sessions', 'prev'];
export const LOG_MAX_LINES = 500;
const LOG_TAIL_BYTES = 256 * 1024;
const MASK = '••••';
// zmienne środowiska, które w testach przekierowują połączenia na atrapy; w diagnostyce pokazujemy tylko ich nazwy (ostrzeżenie), nigdy wartości
const OVERRIDE_VARS = ['NOTION_API_BASE', 'DATABENTO_API_BASE', 'FRED_API_BASE', 'FINNHUB_API_BASE', 'UPDATE_API_BASE', 'UPDATE_DOWNLOAD_BASE', 'THQ_REPO', 'THQ_NEWS_FEED_URL', 'EDGAR_DATA_BASE', 'EDGAR_WWW_BASE', 'FED_ARCHIVE_BASE'];

// Maskuje sekrety w tekście (linie logu, opisy błędów). secrets: znane wartości kluczy z .env (maskowane dosłownie, od 8 znaków),
// do tego wzorce: tokeny Notion (secret_…, ntn_…), klucze Databento (db-…), nagłówek Bearer, pary nazwa=wartość z key/token/secret/password
// i każdy ciąg co najmniej 32 liter i cyfr (klucze FRED i Finnhub). Identyfikatory UUID z myślnikami zostają czytelne.
// Poprawki po review N1–N4 (bezp. P3-2): tokeny i klucze po podkreślniku (x_ntn_…, x_db-…) też: granica „nie litera ani cyfra” zamiast granicy słowa.
export function scrubSecrets(text, secrets = []) {
  let s = String(text ?? '');
  for (const v of secrets) if (typeof v === 'string' && v.length >= 8) s = s.split(v).join(MASK);
  return s
    .replace(/(?<![A-Za-z0-9])(secret_|ntn_)[A-Za-z0-9_-]{6,}/g, `$1${MASK}`)
    .replace(/(?<![A-Za-z0-9])db-[A-Za-z0-9_-]{6,}/g, `db-${MASK}`)
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{6,}/gi, `$1 ${MASK}`)
    .replace(/\b([A-Za-z_-]*(?:api[_-]?key|apikey|token|secret|password|haslo)[A-Za-z_-]*)(["']?\s*[=:]\s*["']?)[^\s"'&,;)}]{4,}/gi, `$1$2${MASK}`)
    .replace(/\b[A-Za-z0-9]{32,}\b/g, MASK);
}

// Ostatnie linie pliku (czyta najwyżej 256 KB od końca; pierwsza, ucięta linia odpada)
export function readTail(file, maxLines) {
  if (!existsSync(file)) return [];
  const size = statSync(file).size;
  const len = Math.min(size, LOG_TAIL_BYTES);
  const buf = Buffer.alloc(len);
  const fd = openSync(file, 'r');
  try { readSync(fd, buf, 0, len, size - len); } finally { closeSync(fd); }
  const lines = buf.toString('utf8').split(/\r?\n/);
  if (len < size) lines.shift();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.slice(-maxLines);
}

const isoDay = (sec) => new Date(sec * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

// openPath(p): otwiera folder w menedżerze plików systemu (Explorer, Finder, xdg-open). THQ_NO_OPEN=1 (testy): nic nie otwiera.
export function systemOpen(p) {
  if (process.env.THQ_NO_OPEN) return false;
  const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const h = spawn(cmd, [p], { detached: true, stdio: 'ignore', windowsHide: false });
  h.on('error', () => { /* brak menedżera plików: użytkownik ma ścieżkę w odpowiedzi */ });
  h.unref();
  return true;
}

export function createDiag({ version, started, host, port, repoUrl = '', configDir, dataDir, backupsDir, logFile, prevDir = () => null, configCorrupt = null, notion, sources, getConfig, schemaVersion, candles, news, earnings, updateInfo, secrets = () => [], badRequest = (m) => Object.assign(new Error(m), { status: 400 }), t = (s, p) => (p ? s.replace(/\{(\w+)\}/g, (_, k) => p[k] ?? '') : s), now = Date.now, openPath = systemOpen }) {
  // ostatni wynik testu każdego źródła (pamięć procesu)
  const last = {};
  const notionConfigured = () => !!notion.hasToken && DBS.every((db) => !!sources[db]);
  const configured = {
    notion: notionConfigured,
    databento: () => candles.hasKey(),
    fred: () => news.hasKey(),
    finnhub: () => earnings.hasKey(),
    github: () => getConfig().updateCheck !== false,
  };
  const scrub = (s) => scrubSecrets(s, secrets());

  // N6: starsze pliki logu po rotacji (dashboard.1.log, dashboard.2.log)
  function rotatedInfo() {
    let rotated = 0, rotatedBytes = 0;
    for (let n = 1; n <= 9; n++) { const f = rotatedName(logFile, n); if (!existsSync(f)) continue; rotated++; rotatedBytes += statSync(f).size; }
    return { rotated, rotatedBytes };
  }
  function backupsInfo() {
    if (!existsSync(backupsDir)) return { count: 0, latest: null };
    const dirs = readdirSync(backupsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    return { count: dirs.length, latest: dirs.length ? dirs[dirs.length - 1] : null };
  }

  function state() {
    const cfg = getConfig();
    const logExists = existsSync(logFile);
    return {
      version, node: process.versions.node, platform: process.platform, address: `http://${host}:${port}`, port, pid: process.pid, repoUrl,
      started, uptimeSec: Math.max(0, Math.round((now() - started) / 1000)),
      connections: Object.fromEntries(DIAG_SOURCES.map((s) => [s, { configured: configured[s](), last: last[s] || null }])),
      paths: { config: configDir, data: dataDir, backups: backupsDir, log: logFile },
      log: { exists: logExists, bytes: logExists ? statSync(logFile).size : 0, ...rotatedInfo() },
      backups: backupsInfo(),
      schema: { installed: Number(cfg.schemaVersion) || 0, current: schemaVersion },
      overrides: OVERRIDE_VARS.filter((k) => !!process.env[k]),
      // poprawki po review N1–N4: nazwa odłożonej kopii nieczytelnego config.local.json (albo null)
      configCorrupt,
    };
  }

  async function run(source) {
    if (source === 'notion') {
      if (!notionConfigured()) return { ok: false, code: 'not-configured', detail: t('Brak tokenu albo identyfikatorów baz w .env. Połącz dziennik w pierwszych krokach.') };
      const me = await notion.get('/v1/users/me');
      let ok = 0;
      for (const db of DBS) { await notion.post(`/v1/data_sources/${sources[db]}/query`, { page_size: 1 }); ok++; }
      return { ok: true, detail: t('Połączono z {ws}, bazy: {n} z {all}', { ws: me.bot?.workspace_name || me.name || 'Notion', n: String(ok), all: String(DBS.length) }) };
    }
    if (source === 'databento') {
      if (!candles.hasKey()) return { ok: false, code: 'no-key', detail: t('Brak klucza Databento.') };
      const r = await candles.testKey();
      return r.ok ? { ok: true, detail: t('Klucz działa, dane dostępne do {d}', { d: isoDay(r.endSec) }) } : { ok: false, code: r.code || 'error', detail: t('Brak klucza Databento.') };
    }
    if (source === 'fred' || source === 'finnhub') {
      const svc = source === 'fred' ? news : earnings;
      const name = source === 'fred' ? 'FRED' : 'Finnhub';
      if (!svc.hasKey()) return { ok: false, code: 'no-key', detail: t('Brak klucza {name} (opcjonalny).', { name }) };
      // N4 (1.6.0): „Testuj” = jedno najtańsze zapytanie u dostawcy (§4.6); usługa bez testKey (starsze atrapy) pokazuje wynik ostatniego pobrania
      if (svc.testKey) { await svc.testKey(); return { ok: true, detail: t('Klucz {name} działa.', { name }) }; }
      const st = source === 'fred' ? svc.status().fred : svc.status().calendar;
      if (st?.lastError && (!st.lastOkAt || (st.lastAttemptAt || '') >= st.lastOkAt)) return { ok: false, code: 'error', detail: t('Ostatnie pobranie nie udało się: {msg}', { msg: scrub(st.lastError?.message || st.lastError) }) };
      if (st?.lastOkAt) return { ok: true, detail: t('Ostatnie udane pobranie: {at}', { at: String(st.lastOkAt).slice(0, 16).replace('T', ' ') }) };
      return { ok: null, code: 'pending', detail: t('Klucz zapisany. Pierwsze pobranie jeszcze się nie odbyło.') };
    }
    // github
    const u = await updateInfo({ force: true });
    if (u.offline) return { ok: false, code: 'offline', detail: t('Brak połączenia z GitHub. Spróbuj później.') };
    return { ok: true, detail: u.available && u.latest ? t('Dostępna wersja {v}.', { v: u.latest }) : t('Masz najnowszą wersję.') };
  }

  async function test(source) {
    if (!DIAG_SOURCES.includes(source)) throw badRequest(t('Nieznane źródło do sprawdzenia.'));
    let r;
    try { r = await run(source); } catch (e) { r = { ok: false, code: 'error', detail: scrub(e?.message || t('Nie udało się połączyć.')) }; }
    last[source] = { ok: r.ok, code: r.code || null, detail: scrub(r.detail), checkedAt: new Date(now()).toISOString() };
    return { source, ...last[source] };
  }

  function logTail(n) {
    const k = Math.max(1, Math.min(LOG_MAX_LINES, Math.floor(Number(n)) || 200));
    return { file: logFile, exists: existsSync(logFile), lines: readTail(logFile, k).map(scrub) };
  }

  // „Otwórz folder”: tylko ścieżki znane serwerowi (nigdy ścieżka z żądania)
  function open(which) {
    if (!OPEN_TARGETS.includes(which)) throw badRequest(t('Nieznany folder.'));
    const p = { data: dataDir, backups: backupsDir, logs: path.dirname(logFile), candles: path.join(dataDir, 'candles'), sessions: path.join(dataDir, 'backtest', 'sessions'), prev: which === 'prev' ? prevDir() : null }[which];
    if (!p || !existsSync(p)) return { ok: false, code: 'missing', path: p || null, opened: false };
    return { ok: true, path: p, opened: openPath(p) };
  }

  return { state, test, logTail, open };
}
