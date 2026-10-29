// Test E2E P32 (28.10.2026) w pełnej aplikacji (headless Chromium), uruchamiany OSOBNO od testy/run.mjs (wymaga Playwrighta; repo ma zero npm).
// Słowa użytkownika (28.10.2026): «tryb auto nawet jak jest wylaczony po wejsciu na wykres to jest on wlaczony i trzeba go przeklikac dwa razy»; sesje jako box
// z liniami high/low do sweepu i PDH/PDL do sweepu z ustawieniami; panel przypięty z X; strefy w kolejności; tekst wpisywany w miejscu; grubość ramki 0.
// Uruchomienie: dashboard testowy z atrapą (R:\PROJEKTY\trading-hq-wt\wykresy-wyniki\e2e-r\start-r.mjs → http://127.0.0.1:4399, atrapa 4398), potem
//   PW_CORE=<katalog z playwright-core> [PW_CHROME=<chrome-headless-shell.exe>] [BASE=http://127.0.0.1:4399] [SHOTS=<katalog zrzutów>] node testy/wykresy-e2e-p32.mjs
// Port 4321 i prawdziwe Notion są zakazane (skrypt odmawia). Wynik: linie ✓/✗ i podsumowanie „N passed, M failed, 0 skipped”.
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = (process.env.BASE || 'http://127.0.0.1:4399').replace(/\/$/, '');
if (/:4321\b/.test(BASE)) { console.error('Port 4321 to prawdziwy dashboard: ten test działa tylko na dashboardzie testowym.'); process.exit(2); }
const PW_CORE = process.env.PW_CORE;
if (!PW_CORE) { console.error('Ustaw PW_CORE na katalog pakietu playwright-core.'); process.exit(2); }
const SHOTS = process.env.SHOTS || '';
const { chromium } = createRequire(path.join(PW_CORE, 'x.js'))(PW_CORE);
function findChrome() {
  if (process.env.PW_CHROME) return process.env.PW_CHROME;
  const root = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local'), 'ms-playwright');
  if (!existsSync(root)) return undefined;
  for (const d of readdirSync(root).filter((x) => x.startsWith('chromium_headless_shell')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
    if (existsSync(p)) return p;
  }
  return undefined;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ' | ' + info}`); };

const browser = await chromium.launch({ executablePath: findChrome() });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1000 }, timezoneId: 'Europe/Warsaw' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('thq.chart.autoscale.v1', '0'); // P32-1: zapamiętane wyłączenie „Auto”
  localStorage.setItem('thq.chart.overlays.v1', JSON.stringify({ sessions: false, pdhl: false }));
  localStorage.setItem('thq.chart.styleDock.v1', 'pin');
  localStorage.setItem('thq.chart.tf.v1', '1m');
  localStorage.removeItem('thq.chart.toolStyle.v1');
});
await page.reload({ waitUntil: 'networkidle' });
const lb = (s) => page.locator(`.lb-chart ${s}`);
const axis = () => page.evaluate(() => [...document.querySelectorAll('.lb-chart .swc-plot svg text.axis')].filter((x) => x.getAttribute('text-anchor') === 'end').map((x) => `${x.textContent}@${x.getAttribute('y')}`).join(',')); // cena i jej położenie: przesunięcie w pionie zmienia y
async function vdrag() {
  const b = await lb('.swc-plot').boundingBox();
  await page.mouse.move(b.x + 300, b.y + 150); await page.mouse.down(); await page.mouse.move(b.x + 300, b.y + 250, { steps: 6 }); await page.mouse.up();
  await sleep(250);
}

// ===== P32-1: „Auto” =====
await page.locator('[data-act="view"][data-v="trades"]:visible').first().click();
await page.locator('.row-btn', { hasText: 'ES wygrana' }).first().click();
await page.waitForSelector('.lb-chart .swc-plot svg', { timeout: 15000 });
await sleep(500);
check('P32-1 po otwarciu wykresu „Auto” wyłączone jak zapis', (await lb('[data-swc="auto"]').getAttribute('aria-pressed')) === 'false');
let a0 = await axis(); await vdrag();
check('P32-1 pierwsze przeciągnięcie w pionie przesuwa skalę (bez przeklikiwania)', (await axis()) !== a0, a0);
const fwd = await page.locator('.lb-top .lb-nav.next').isEnabled();
await page.locator(fwd ? '.lb-top .lb-nav.next' : '.lb-top .lb-nav.prev').click();
await page.waitForSelector('.lb-chart .swc-plot svg', { timeout: 15000 }); await sleep(500);
a0 = await axis(); await vdrag();
check('P32-1 następny trade (strzałka): „Auto” dalej wyłączone i działa od razu', (await lb('[data-swc="auto"]').getAttribute('aria-pressed')) === 'false' && (await axis()) !== a0, a0);
await page.locator(fwd ? '.lb-top .lb-nav.prev' : '.lb-top .lb-nav.next').click();
await page.waitForSelector('.lb-chart .swc-plot svg', { timeout: 15000 }); await sleep(500);
await lb('.swc-edit').click();
await page.waitForSelector('.lb-chart .swc-lwc canvas'); await sleep(600);
check('P32-1 podgląd → edycja: „Auto” wyłączone w przycisku i w skali', (await lb('[data-swc="auto"]').getAttribute('aria-pressed')) === 'false');
await lb('[data-swc="auto"]').click(); await sleep(150);
check('P32-1 jedno kliknięcie włącza „Auto” w edycji', (await lb('[data-swc="auto"]').getAttribute('aria-pressed')) === 'true' && (await page.evaluate(() => localStorage.getItem('thq.chart.autoscale.v1'))) === '1');

// ===== P32-3, P32-5, P32-6, P32-7 w edycji =====
const panel = page.locator('.swc-style');
check('P32-3 panel przypięty schowany do kliknięcia zębatki', !(await panel.isVisible()));
await page.locator('[data-tool="rectangle"]').click();
const pb = await lb('.swc-plot').boundingBox();
const r0 = { x: pb.x + pb.width * 0.5, y: pb.y + pb.height * 0.3 }, r1 = { x: pb.x + pb.width * 0.66, y: pb.y + pb.height * 0.5 };
await page.mouse.click(r0.x, r0.y); await sleep(100); await page.mouse.click(r1.x, r1.y); await sleep(300);
await page.locator('.swc-gear').click(); await sleep(200);
check('P32-3 zębatka otwiera panel przypięty z X', (await panel.getAttribute('data-dock')) === 'pin' && await panel.isVisible() && (await page.locator('.swc-style [data-act="pclose"]').count()) === 1);
await page.locator('.swc-style [data-k="width"]').selectOption('0'); await sleep(150);
check('P32-7 grubość ramki prostokąta 0 do wyboru', (await page.locator('.swc-style [data-k="width"]').inputValue()) === '0');
// dwuklik w środek prostokąta (tam stoi jego tekst): edycja w miejscu
const mid = { x: (r0.x + r1.x) / 2, y: (r0.y + r1.y) / 2 };
await page.mouse.dblclick(mid.x, mid.y); await sleep(250);
const inp = page.locator('.lb-chart .swc-text');
check('P32-6 dwuklik w miejscu tekstu prostokąta zaczyna pisanie', await inp.count() === 1);
// P34 (28.10.2026): migający kursor widoczny przy wpisywaniu, także w pustym polu (słowa użytkownika: «tam gdzie mozna wpisac tekst powinien migac taki pasek...»)
const caretInfo = () => page.evaluate(() => {
  const c = document.querySelector('.lb-chart .swc-caret'), i = document.querySelector('.lb-chart .swc-text');
  if (!c || !i) return null;
  c.getAnimations().forEach((an) => { an.pause(); an.currentTime = 0; }); // faza widoczna
  const r = c.getBoundingClientRect(), ir = i.getBoundingClientRect(), cs = getComputedStyle(c), is = getComputedStyle(i);
  const m = document.createElement('canvas').getContext('2d'); m.font = is.font;
  const w = m.measureText(i.value).width, fs = parseFloat(is.fontSize);
  const end = is.textAlign === 'right' || is.textAlign === 'end' ? ir.right : is.textAlign === 'center' ? ir.left + ir.width / 2 + w / 2 : ir.left + w;
  return { w: r.width, h: r.height, fs, op: cs.opacity, vis: cs.visibility, disp: cs.display, dx: Math.abs(r.left + r.width / 2 - end), anim: cs.animationName };
});
const ci0 = await caretInfo();
check('P34 dwuklik w pustym polu: kursor widoczny, w miejscu tekstu, wysokość = rozmiar czcionki', ci0 && ci0.w >= 1 && ci0.op === '1' && ci0.vis === 'visible' && ci0.disp !== 'none' && Math.abs(ci0.h - ci0.fs) <= 1 && ci0.dx <= 2, JSON.stringify(ci0));
check('P34 kursor miga (animacja CSS)', ci0 && ci0.anim === 'swc-caret-blink', JSON.stringify(ci0));
await page.keyboard.type('OB 15m', { delay: 20 }); await sleep(150);
const ci1 = await caretInfo();
check('P34 po wpisaniu kursor stoi na końcu tekstu (±2 px)', ci1 && ci1.w >= 1 && ci1.op === '1' && ci1.dx <= 2, JSON.stringify(ci1));
if (SHOTS) await page.locator('.lb-chart .swc-stage').screenshot({ path: path.join(SHOTS, 'P34-1920-kursor.jpg'), type: 'jpeg', quality: 85 }); // kursor wstrzymany w fazie widocznej (caretInfo)
const st = await inp.evaluate((el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, bw: c.borderTopWidth, color: c.color, fs: c.fontSize }; }).catch(() => null);
check('P32-5 w trakcie pisania pole bez ramki i tła, tekst rysuje wykres', st && st.bg === 'rgba(0, 0, 0, 0)' && st.bw === '0px' && st.color === 'rgba(0, 0, 0, 0)', JSON.stringify(st));
if (SHOTS) await page.locator('.lb-chart .swc-stage').screenshot({ path: path.join(SHOTS, 'P32-1920-tekst-w-miejscu.jpg'), type: 'jpeg', quality: 85 });
await page.keyboard.press('Enter'); await sleep(200);
check('P32-6 Enter zatwierdza, panel pokazuje nowy tekst', (await inp.count()) === 0 && (await page.locator('.swc-style [data-k="text"]').inputValue()) === 'OB 15m');
// odznaczenie: panel zostaje z ostatnim rysunkiem
await page.mouse.click(pb.x + pb.width * 0.85, pb.y + pb.height * 0.85); await sleep(300);
check('P32-3 po odznaczeniu panel zostaje i mówi, którego rysunku dotyczy', await panel.isVisible() && /ostatnio wybrany/.test(await page.locator('.swc-style .swc-ph').innerText()));
if (SHOTS) await page.locator('.lb-chart .swc-stage').screenshot({ path: path.join(SHOTS, 'P32-1920-panel-przypiety-x.jpg'), type: 'jpeg', quality: 85 });
await page.locator('.swc-style [data-act="pclose"]').click(); await sleep(200);
check('P32-3 X chowa panel całkowicie', !(await panel.isVisible()));
await page.mouse.click(mid.x, mid.y); await sleep(300);
check('P32-3 kliknięcie w prostokąt bez ramki zaznacza go, a panel po X nie wraca sam', !(await panel.isVisible()) && await page.locator('.swc-gear').isVisible());
await lb('.swc-done').click();
await page.waitForSelector('.lb-chart .swc-plot svg', { timeout: 15000 }); await sleep(500);

// ===== P32-2: sesje i PDH/PDL w podglądzie, ustawienia =====
await lb('[data-swc-tf="15m"]').click(); await sleep(800);
await lb('label:has([data-swc-ov="sessions"])').click(); await lb('label:has([data-swc-ov="pdhl"])').click(); await sleep(800);
for (let k = 0; k < 6; k++) { const b = await lb('.swc-plot').boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.wheel(0, 300); await sleep(120); }
await sleep(500);
const ov = await page.evaluate(() => {
  const s = document.querySelector('.lb-chart .swc-plot svg');
  return { boxes: s.querySelectorAll('rect.sess').length, lines: s.querySelectorAll('line.ovl').length, labels: [...s.querySelectorAll('text.ovl-l')].map((x) => x.textContent) };
});
check('P32-2 podgląd: boxy sesji i linie high/low z opisami', ov.boxes >= 2 && ov.lines >= 4 && ov.labels.some((x) => /^(Azja|Londyn|NY) [HL]$/.test(x)), JSON.stringify(ov));
if (SHOTS) await page.locator('.lb-chart .swc-plot').screenshot({ path: path.join(SHOTS, 'P32-1920-sesje-sweep.jpg'), type: 'jpeg', quality: 85 });
await lb('.swc-ovbtn').click(); await sleep(200);
check('P32-2 ustawienia nakładek na wykresie: godziny, kolory, linie, PDH/PDL', await lb('.swc-ovpop').isVisible() && (await lb('.swc-ovpop input[type="time"]').count()) === 6);
if (SHOTS) await page.locator('.lb-chart .swc-ovpop').screenshot({ path: path.join(SHOTS, 'P32-1920-ustawienia-sesji.jpg'), type: 'jpeg', quality: 90 });
await lb('.swc-ovpop label:has([data-ovk="sess.asia.on"])').click(); await sleep(300);
const ov2 = await page.evaluate(() => document.querySelectorAll('.lb-chart svg rect.sess.asia').length);
check('P32-2 wyłączenie sesji w ustawieniach zdejmuje jej box', ov2 === 0, String(ov2));
await lb('.swc-ovpop [data-ovreset]').click(); await sleep(200);
// edycja z nakładkami: bez błędów, ten sam przełącznik
await lb('.swc-edit').click(); await page.waitForSelector('.lb-chart .swc-lwc canvas'); await sleep(800);
check('P32-2 edycja z nakładkami: przełączniki włączone', await lb('[data-swc-ov="sessions"]').isChecked() && await lb('[data-swc-ov="pdhl"]').isChecked());
await lb('.swc-done').click(); await sleep(600);

// ===== P32-4: strefy w kolejności na wykresie =====
const tzs = await page.evaluate(() => [...document.querySelectorAll('.lb-chart select[data-swc="tz"] option')].map((o) => o.textContent).slice(1));
const offOf = (s) => { const m = /UTC(?:([+−])(\d+)(?::(\d+))?)?/.exec(s); return !m ? NaN : !m[1] ? 0 : (m[1] === '−' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)); };
const offs = tzs.map(offOf);
check('P32-4 lista stref na wykresie rosnąco po UTC', offs.length > 30 && offs.every((v, k) => k === 0 || v >= offs[k - 1]), tzs.join(' | '));

// ===== 375 px =====
await page.setViewportSize({ width: 375, height: 800 }); await sleep(500);
await lb('.swc-ovbtn').click(); await sleep(250);
const sc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, pop: (() => { const r = document.querySelector('.lb-chart .swc-ovpop').getBoundingClientRect(); return [r.left, r.right]; })() }));
check('P32 375 px: popover nakładek mieści się w ekranie, bez przewijania w bok', sc.sw <= sc.cw && sc.pop[0] >= 0 && sc.pop[1] <= 375, JSON.stringify(sc));
check('P32 bez błędów strony i konsoli', errors.length === 0, errors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed, 0 skipped`);
process.exit(failed ? 1 : 0);
