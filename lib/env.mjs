// Ścieżki projektu, parser .env i konfiguracja lokalna (config.local.json). Zero zależności.
// Paths, .env parser and local config (config.local.json). No dependencies.
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// katalog z config.local.json i kopiami (domyślnie katalog projektu; testy ustawiają THQ_CONFIG_DIR, żeby nie dotykać prawdziwej konfiguracji)
export const CONFIG_DIR = process.env.THQ_CONFIG_DIR || ROOT;
export const ENV_KEYS = ['NOTION_TOKEN', 'NOTION_VERSION', 'DS_TRADES', 'DS_KONTA', 'DS_DZIENNIK', 'DS_FINANSE', 'NOTION_ROOT_URL', 'DATABENTO_API_KEY', 'FRED_API_KEY', 'FINNHUB_API_KEY'];

export function loadEnv(root = CONFIG_DIR) {
  const out = {};
  const file = path.join(root, '.env');
  if (existsSync(file)) {
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 1) continue;
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[line.slice(0, i).trim()] = v;
    }
  }
  // zmienne procesu mają pierwszeństwo (testy na atrapie nie dotykają prawdziwych kluczy ani baz)
  for (const k of ENV_KEYS) if (process.env[k]) out[k] = process.env[k];
  return out;
}

// N4 (1.6.0): maska klucza w Ustawieniach: tylko 4 ostatnie znaki, i to dopiero od 8 znaków (krótszy klucz bez podpowiedzi)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 1: klucze w UI, maska z 4 ostatnimi znakami)
export const keyHint = (v) => (typeof v === 'string' && v.length >= 8 ? v.slice(-4) : '');

export function envSettings(env) {
  return {
    token: env.NOTION_TOKEN,
    version: env.NOTION_VERSION || '2026-03-11',
    base: process.env.NOTION_API_BASE || 'https://api.notion.com',
    sources: { trades: env.DS_TRADES, konta: env.DS_KONTA, dziennik: env.DS_DZIENNIK, finanse: env.DS_FINANSE },
    rootUrl: env.NOTION_ROOT_URL || '',
  };
}

export const CONFIG_FILE = 'config.local.json';
export function defaultConfig() {
  return { schemaVersion: 0, lang: 'pl', updateCheck: true, fields: {}, options: {} };
}
export function loadConfig(root = CONFIG_DIR) {
  const file = path.join(root, CONFIG_FILE);
  const cfg = defaultConfig();
  if (existsSync(file)) {
    // Poprawki po review N1–N4 (P1-1): nieczytelny plik daje wartości domyślne ze znacznikiem corrupt (niewyliczalnym, więc nie trafia do zapisu);
    // serwer odkłada wtedy plik jako config.local.json.corrupt-<czas> przed pierwszym zapisem i nie migruje go jak istniejącej instalacji
    try { Object.assign(cfg, JSON.parse(readFileSync(file, 'utf8'))); } catch { Object.defineProperty(cfg, 'corrupt', { value: true, enumerable: false }); }
  }
  cfg.fields = cfg.fields || {};
  cfg.options = cfg.options || {};
  if (cfg.lang !== 'en') cfg.lang = 'pl';
  return cfg;
}
export function configExists(root = CONFIG_DIR) { return existsSync(path.join(root, CONFIG_FILE)); }
// zapis atomowy: plik tymczasowy, potem zmiana nazwy (przerwany zapis nie zostawia uciętego pliku)
export function saveConfig(cfg, root = CONFIG_DIR) {
  const file = path.join(root, CONFIG_FILE);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  renameSync(tmp, file);
}
export function ensureDir(p) { mkdirSync(p, { recursive: true }); }
// Zapis .env (instalator, Ustawienia). Klucze spoza listy i komentarze zostają, kolejność zachowana. / Writes .env, keeping unknown keys.
// N4 (1.6.0): wartość null usuwa wszystkie linie tego klucza („Usuń klucz” w Ustawieniach → Źródła danych).
export function saveEnv(values, root = CONFIG_DIR) {
  const file = path.join(root, '.env');
  const raw = existsSync(file) ? readFileSync(file, 'utf8') : '';
  // poprawki po review (P3-3): plik zapisany z CRLF zostaje z CRLF
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw ? raw.split(/\r?\n/) : [];
  const done = new Set();
  const out = lines.flatMap((l) => {
    const i = l.indexOf('=');
    const k = i > 0 && !l.trimStart().startsWith('#') ? l.slice(0, i).trim() : '';
    if (k && k in values) {
      if (values[k] === null) return [];
      if (done.has(k)) return [];
      done.add(k);
      return [`${k}=${values[k]}`];
    }
    return [l];
  });
  while (out.length && out[out.length - 1] === '') out.pop();
  for (const [k, v] of Object.entries(values)) if (!done.has(k) && v !== null) out.push(`${k}=${v}`);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, out.join(eol) + eol, { encoding: 'utf8', mode: 0o600 });
  renameSync(tmp, file);
}
