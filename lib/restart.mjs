// Ponowne uruchomienie dashboardu po aktualizacji: czeka, aż stary proces serwera się zakończy (zwolni port),
// i startuje server.mjs w tle (bez okna), z logiem w dashboard.log. Działa tak samo na Windows, macOS i Linuksie.
// Restarts the dashboard after an update: waits for the old server process to exit, then starts server.mjs detached.
// Użycie: node lib/restart.mjs <pid starego serwera>
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pid = Number(process.argv[2]);
const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 0; i < 100 && pid && alive(pid); i++) await sleep(150);
await sleep(300);
const logDir = process.env.THQ_CONFIG_DIR || ROOT;
const out = openSync(path.join(logDir, 'dashboard.log'), 'a');
const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { cwd: ROOT, env: process.env, detached: true, stdio: ['ignore', out, out], windowsHide: true });
child.unref();
process.exit(0);
