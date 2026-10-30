// Strona w przeglądarce bez zależności: zainstalowany Chrome albo Edge w trybie headless zwraca DOM po wykonaniu skryptów.
// Strona robocza zapisuje wynik w <pre id="wynik">PASS …</pre> albo FAIL …. Brak Chrome i Edge: findBrowser() zwraca null (test „pominięty”).
// Flagi sprawdzone 27.10.2026 na Chrome i Edge (Windows): --headless=new --virtual-time-budget=10000 --dump-dom.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Profile tymczasowe przeglądarki (~480 MB każdy) sprzątamy zawsze: po zakończeniu (z ponowieniami, bo Edge trzyma pliki chwilę po zamknięciu),
// a gdy proces testów kończy się przed sprzątaniem, w obsłudze wyjścia. Wcześniej zostawały w %TEMP% i zapełniały dysk C.
const profiles = new Set();
function newProfile() { const d = mkdtempSync(path.join(tmpdir(), 'thq-chrome-')); profiles.add(d); return d; }
function dropProfile(d) {
  try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); profiles.delete(d); } catch { /* Windows: plik zajęty, spróbuje obsługa wyjścia */ }
}
// Zabija całe drzewo procesów przeglądarki (na Windows procesy potomne trzymają profil po p.kill()).
function killTree(p) {
  if (p.exitCode != null) return;
  try { if (process.platform === 'win32' && p.pid) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true }); else p.kill(); } catch { /* już nie żyje */ }
}
process.on('exit', () => { for (const d of [...profiles]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* zajęty */ } } });
export function findBrowser() {
  const env = process.env;
  const c = [
    env.THQ_BROWSER,
    // instalacje systemowe najpierw: Chrome zainstalowany per użytkownik (LOCALAPPDATA) bywa blokowany przez własny sandbox
    // („Sandbox cannot access executable”, sprawdzone 27.10.2026), Edge z Program Files (x86) działa
    env.ProgramFiles && path.join(env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  ];
  return c.find((p) => p && existsSync(p)) || null;
}

// DOM strony po wykonaniu skryptów (czas wirtualny do 10 s). Osobny profil tymczasowy: nie dotyka profilu użytkownika.
export function dumpDom(url, { timeoutMs = 60_000, width = 1200, height = 800 } = {}) {
  const exe = findBrowser();
  if (!exe) return Promise.reject(new Error('Brak Chrome/Edge'));
  const prof = newProfile();
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--user-data-dir=${prof}`,
    `--window-size=${width},${height}`, '--virtual-time-budget=10000', '--dump-dom', url];
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => killTree(p), timeoutMs);
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', () => {
      clearTimeout(timer);
      dropProfile(prof);
      if (!out) reject(new Error('Pusta odpowiedź przeglądarki: ' + err.slice(0, 300))); else resolve(out);
    });
  });
}

// Pakiet J (etap 18): strona w CZASIE RZECZYWISTYM przez protokół DevTools (CDP) wbudowanym WebSocketem Node (bez npm). Potrzebne do MediaRecorder:
// pod --virtual-time-budget nagrywanie nie kończy się (sprawdzone 28.10.2026 na Edge: --dump-dom zwraca stronę przed wynikiem).
// Port DevTools losowy (--remote-debugging-port=0, odczyt z DevToolsActivePort), więc nie zajmuje stałych portów (9222, 9223).
// until: wyrażenie JS, na które czekamy; extract: wyrażenie, którego wartość zwracamy (returnByValue).
export async function cdpPage(url, { timeoutMs = 90_000, width = 1200, height = 800, until = "document.getElementById('wynik')?.textContent !== '…'", extract = "document.getElementById('wynik').textContent", shot = null, mobile = false } = {}) {
  const exe = findBrowser();
  if (!exe) throw new Error('Brak Chrome/Edge');
  const prof = newProfile();
  const p = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--user-data-dir=${prof}`,
    `--window-size=${width},${height}`, '--remote-debugging-port=0', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { windowsHide: true });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const deadline = Date.now() + timeoutMs;
  let ws = null;
  try {
    let port = 0;
    const f = path.join(prof, 'DevToolsActivePort');
    // H2: Windows bywa, że przeglądarka jeszcze pisze plik (EBUSY przy odczycie, pełny przebieg 30.10.2026): czekamy i czytamy znowu
    while (!port && Date.now() < deadline) { try { if (existsSync(f)) port = Number(readFileSync(f, 'utf8').split('\n')[0]) || 0; } catch { port = 0; } if (!port) await sleep(100); }
    if (!port) throw new Error('DevTools: brak portu');
    let target = null;
    while (!target && Date.now() < deadline) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === 'page'); } catch { await sleep(100); } }
    if (!target) throw new Error('DevTools: brak karty');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('DevTools: WebSocket')); });
    let id = 0;
    const pend = new Map();
    ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } };
    const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))?.result?.result?.value;
    // H2: mobile = prawdziwa szerokość telefonu (headless nie zmniejsza okna poniżej ~500 px, więc emulacja zamiast --window-size)
    if (mobile) await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url });
    while (Date.now() < deadline) {
      if (await ev(`(() => { try { return !!(${until}); } catch { return false; } })()`)) {
        const v = await ev(extract);
        // H1: zrzut roboczy po wyniku (shot = ścieżka PNG poza repo, np. backtest-wyniki/); strona zostawia na ekranie stan do obejrzenia
        if (shot) { const r = await send('Page.captureScreenshot', { format: 'png' }); if (r?.result?.data) writeFileSync(shot, Buffer.from(r.result.data, 'base64')); }
        return v;
      }
      await sleep(250);
    }
    throw new Error('DevTools: przekroczony czas strony: ' + String(await ev(extract)).slice(0, 300));
  } finally {
    try { ws?.close(); } catch { /* zamknięty */ }
    killTree(p);
    await new Promise((r) => { if (p.exitCode != null) r(); else { p.once('close', r); setTimeout(r, 3000); } });
    dropProfile(prof);
  }
}
