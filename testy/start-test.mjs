// Uruchamia atrapę Notion i serwer dashboardu podłączony WYŁĄCZNIE do niej (token i bazy fałszywe).
// Użycie: node testy/start-test.mjs   → dashboard testowy: http://127.0.0.1:4331
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCK_PORT = process.env.ATRAPA_PORT || '4399';
const PORT = process.env.TEST_PORT || '4331';
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
  THQ_CONFIG_DIR: mkdtempSync(path.join(tmpdir(), 'thq-test-')), // konfiguracja testowa nie dotyka prawdziwej
};
const run = (file, args, e) => spawn(process.execPath, [path.join(ROOT, file), ...args], { stdio: 'inherit', env: e });
const a = run('testy/atrapa-notion.mjs', [MOCK_PORT], env);
setTimeout(() => {
  const s = run('server.mjs', [], env);
  const stop = () => { a.kill(); s.kill(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  s.on('exit', () => { a.kill(); process.exit(0); });
}, 500);
