// Uruchamia atrapę Notion i serwer dashboardu podłączony WYŁĄCZNIE do niej (token i bazy fałszywe).
// Użycie: node testy/start-test.mjs   → dashboard testowy: http://127.0.0.1:4331
// TEST_CONFIG_DIR=<katalog> (H1, odbiór backtestu): konfiguracja i chart-data z tego katalogu zamiast tymczasowego, np. kopia prawdziwych świec
// R:/PROJEKTY/trading-hq-wt/backtest-dane (narzedzia/kopia-swiec-odbior.mjs). Katalog nie może być instalacją produkcyjną ani mieć klucza Databento w .env.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkTestDir } from '../narzedzia/katalog-testowy.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCK_PORT = process.env.ATRAPA_PORT || '4399';
const PORT = process.env.TEST_PORT || '4331';
// H2 (S7): TEST_CONFIG_DIR tylko z allowlisty (backtest-dane albo katalog tymczasowy), po realpath; produkcja odrzucona
let CFG;
try { CFG = process.env.TEST_CONFIG_DIR ? checkTestDir(process.env.TEST_CONFIG_DIR, { what: 'TEST_CONFIG_DIR' }) : mkdtempSync(path.join(tmpdir(), 'thq-test-')); } catch (e) { console.error(e.message); process.exit(2); }
if (process.env.TEST_CONFIG_DIR) {
  if (/[\\/]trading-hq[\\/]?$/i.test(CFG) || PORT === '4321') { console.error('TEST_CONFIG_DIR: produkcyjna instalacja i port 4321 są zakazane.'); process.exit(2); }
  const envF = path.join(CFG, '.env');
  if (existsSync(envF) && /^\s*DATABENTO_API_KEY\s*=\s*\S/m.test(readFileSync(envF, 'utf8'))) { console.error('TEST_CONFIG_DIR: .env ma klucz Databento, instancja testowa musi działać bez niego.'); process.exit(2); }
}
const env = {
  ...process.env,
  PORT,
  THQ_TEST_PAGES: '1', // serwer poda strony robocze z testy/ pod /__testy/ (tylko dashboard testowy)
  NOTION_API_BASE: `http://127.0.0.1:${MOCK_PORT}`,
  NOTION_TOKEN: 'test-token-atrapa',
  NOTION_VERSION: '2026-03-11',
  DS_TRADES: '11111111-1111-4111-8111-111111111111',
  DS_KONTA: '22222222-2222-4222-8222-222222222222',
  DS_DZIENNIK: '33333333-3333-4333-8333-333333333333',
  DS_FINANSE: '44444444-4444-4444-8444-444444444444',
  NOTION_ROOT_URL: 'https://www.notion.so/atrapa',
  THQ_NO_NEWS: '1', // dashboard testowy nie sięga po newsy z internetu
  THQ_NO_AUTO_1S: '1', // bez automatycznego dociągania okien 1s (Databento)
  DATABENTO_API_KEY: '', DATABENTO_API_BASE: 'http://127.0.0.1:9', // bez klucza i bez sieci Databento
  THQ_CONFIG_DIR: CFG, // konfiguracja testowa nie dotyka prawdziwej
};
const run = (file, args, e) => spawn(process.execPath, [path.join(ROOT, file), ...args], { stdio: 'inherit', env: e });
const a = run('testy/atrapa-notion.mjs', [MOCK_PORT], env);
setTimeout(() => {
  const s = run('server.mjs', [], env);
  const stop = () => { a.kill(); s.kill(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  s.on('exit', () => { a.kill(); process.exit(0); });
}, 500);
