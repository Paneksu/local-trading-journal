// Test E2E pakietu J (28.10.2026), etap 18: filmy w oknie Udostępnij w pełnej aplikacji (headless Chromium), uruchamiany OSOBNO od testy/run.mjs.
//   J1 segment „Obraz | Film”: opcje filmu (9:16 / 16:9, 1080p / 720p, 6 / 10 / 15 s, tło motyw / zdjęcie / film), „Kopiuj” ukryte, „Nagraj film”
//   J2 Ustawienia → Wykresy → Karty udostępniania: format, długość, czarno-białe, przyciemnienie (zapis settings.chart, wartości początkowe okna, reset)
//   J3 film tła z pliku (syntetyczny WebM nagrany w tej przeglądarce): notka o prawach, czarno-białe, suwak przyciemnienia; zero żądań sieci i zero zapisu
//      filmu do localStorage w trakcie wyboru i nagrywania
//   J4 nagranie 6 s: postęp „Nagrywanie x / 6 s, nie przełączaj karty”, kontrolki nieaktywne, „Pobierz MP4” z nazwą justjournal-trade-…-9x16.mp4
//   J5 „Anuluj”; J6 ukrycie karty przerywa nagranie z ostrzeżeniem; J7 Esc anuluje nagrywanie, nie zamyka okna; 375 px bez poziomego przewijania; Platinum
// Uruchomienie: PW_CORE=<katalog playwright-core> [BASE=http://127.0.0.1:4399] [SHOTS=<katalog>] [PW_CHROME=<chrome.exe>] node testy/wykresy-e2e-j.mjs
// Dashboard testowy z atrapą Notion: dowody-rolla/start-4399.mjs. Port 4321 i prawdziwe Notion są zakazane. Wynik: linie ✓/✗ i „N passed, M failed, 0 skipped”.
import { createRequire } from 'node:module';
import { readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = (process.env.BASE || 'http://127.0.0.1:4399').replace(/\/$/, '');
if (/:4321\b/.test(BASE) || /:4331\b/.test(BASE)) { console.error('Ten test działa tylko na dashboardzie testowym (4399).'); process.exit(2); }
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
const SETTINGS_KEY = 'thq.settings.v1';
const TRADE = 'ES wygrana TP 2R (po BE)';

const browser = await chromium.launch({ executablePath: findChrome() });
const errors = [];
let reqs = []; // wszystkie żądania strony (licznik zerowany przed częścią z filmem tła)
async function newPage(ctx, { width = 1920, height = 1080, theme } = {}) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(`${r.method()} ${r.url()}`));
  if (theme) await page.addInitScript((th) => { try { if (!localStorage.getItem('thq.theme.set')) { localStorage.setItem('thq.theme', th); localStorage.setItem('thq.theme.set', '1'); } } catch { /* brak */ } }, theme);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForSelector('#gear');
  return page;
}
const settingsOf = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), SETTINGS_KEY);
const openSettings = async (page) => {
  if (!(await page.locator('.sp').count())) await page.locator('#gear').click();
  await page.locator('[data-act="sp-tab"][data-v="wykresy"]').click();
  await sleep(150);
};
const spClick = (p, sel) => p.locator(sel).first().evaluate((e) => e.click());
const closeSettings = async (page) => { if (await page.locator('.sp').count()) { await page.keyboard.press('Escape'); await sleep(100); if (await page.locator('.sp').count()) await page.locator('#gear').click(); } };
async function openTrade(page, name = TRADE) {
  await page.getByRole('button', { name: /^Trade'y/ }).first().click().catch(() => page.locator('text=/^Trade.y/').first().click());
  await page.locator('[data-act="preset"][data-v="all"]').first().click().catch(() => {});
  await page.locator('.row-btn', { hasText: name }).first().click();
  await page.waitForSelector('.lb:not([hidden])');
  await sleep(800);
}
const closeAll = async (page) => { for (let i = 0; i < 4; i++) { if (!(await page.locator('.sh-scrim, .lb:not([hidden])').count())) break; await page.keyboard.press('Escape'); await sleep(250); } };
const waitCard = async (page) => { await page.waitForFunction(() => /\d+×\d+ px/.test(document.querySelector('#sh-msg')?.textContent || ''), null, { timeout: 20000 }); await sleep(200); };
async function shareTrade(page, name) { await openTrade(page, name); await page.locator('.lb [data-act="share-trade"]').first().click(); await page.waitForSelector('.sh-scrim'); await waitCard(page); }
// v2 (P52): jakość, długość, czarno-białe i przyciemnienie są w zwijanym „Więcej opcji”: otwieramy je, gdy kontrolki nie widać
const more = async (page) => { if (await page.locator('.sh-more').count() && !(await page.locator('.sh-more[open]').count())) { await page.locator('.sh-more summary').click(); await sleep(150); } };
const sh = async (page, attr, v) => { if (!(await page.locator(`.sh [data-sh="${attr}"][data-v="${v}"]`).isVisible())) await more(page); await page.locator(`.sh [data-sh="${attr}"][data-v="${v}"]`).click(); await sleep(150); await waitCard(page); };
const pressed = (page, attr) => page.evaluate((a) => [...document.querySelectorAll(`.sh [data-sh="${a}"]`)].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.v).join(','), attr);
const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, sel);
const cardHash = (page) => page.evaluate(() => {
  const cv = document.querySelector('#sh-cv'); const d = new Uint32Array(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data.buffer);
  let a = 0x811c9dc5; for (let i = 0; i < d.length; i++) { a ^= d[i]; a = Math.imul(a, 0x01000193) >>> 0; } return `${a.toString(16)}:${cv.width}x${cv.height}`;
});
const shot = async (page, file, sel) => { if (!SHOTS) return; const t = sel ? page.locator(sel).first() : page; await t.screenshot({ path: path.join(SHOTS, file), type: 'jpeg', quality: 85 }); };
const toastText = (page) => page.evaluate(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.textContent : ''; });
const lsSnapshot = (page) => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k).length; } return o; });
const lsHasBlob = (page) => page.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const v = localStorage.getItem(localStorage.key(i)); if (/blob:|data:video|webm|tlo\.webm/i.test(v)) return localStorage.key(i); } return ''; });
// syntetyczny film tła (1 s) nagrany w tej przeglądarce: animowany gradient, bez cudzych plików
const makeBgVideo = (page) => page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 480; c.height = 270; const x = c.getContext('2d');
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp8' }); const parts = [];
  rec.ondataavailable = (e) => parts.push(e.data); const done = new Promise((r) => (rec.onstop = r)); rec.start();
  await new Promise((res) => { const t0 = performance.now(); const f = () => { const t = (performance.now() - t0) / 1000; const g = x.createLinearGradient(0, 0, 480, 270); g.addColorStop(0, `hsl(${200 + t * 120}, 60%, 35%)`); g.addColorStop(1, `hsl(${20 + t * 90}, 70%, 55%)`); x.fillStyle = g; x.fillRect(0, 0, 480, 270); x.fillStyle = '#fff'; x.fillRect(40 + t * 360, 120, 30, 30); if (t < 1) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  rec.stop(); await done;
  const b = new Uint8Array(await new Blob(parts).arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
});
const waitRecDone = (page, ms = 30000) => page.waitForFunction(() => document.querySelector('.sh [data-sh="cancel"]')?.hidden !== false, null, { timeout: ms });

// ---------- J1: okno Udostępnij → Film ----------
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await newPage(ctx, { theme: 'onyx' });
await shareTrade(page, TRADE);
check('J1 segment „Obraz | Film”, domyślnie Obraz', (await pressed(page, 'mode')) === 'image' && (await page.locator('.sh [data-sh="mode"][data-v="film"]:not([disabled])').count()) === 1);
const hImg = await cardHash(page);
await sh(page, 'mode', 'film');
const j1 = {
  format: await page.evaluate(() => [...document.querySelectorAll('.sh [data-sh="fformat"]')].map((b) => b.dataset.v).join(',')),
  quality: await page.evaluate(() => [...document.querySelectorAll('.sh [data-sh="quality"]')].map((b) => b.dataset.v).join(',')),
  seconds: await page.evaluate(() => [...document.querySelectorAll('.sh [data-sh="seconds"]')].map((b) => b.dataset.v).join(',')),
  bg: await page.evaluate(() => [...document.querySelectorAll('.sh [data-sh="fbg"]')].map((b) => b.dataset.v).join(',')),
  on: [await pressed(page, 'fformat'), await pressed(page, 'quality'), await pressed(page, 'seconds')].join('|'),
  copy: await visible(page, '.sh [data-sh="copy"]'), rec: await visible(page, '.sh [data-sh="record"]'), dl: await visible(page, '.sh [data-sh="download"]'),
  msg: await page.locator('#sh-msg').textContent(),
};
check('J1 opcje filmu: 9:16 / 1:1 / 16:9 (v2), 1080p / 720p, 6 / 10 / 15 s, tło motyw / zdjęcie / film; domyślnie 9:16, 1080p, 10 s (z Ustawień)', j1.format === '9:16,1:1,16:9' && j1.quality === '1080p,720p' && j1.seconds === '6,10,15' && j1.bg === 'theme,photo,video' && j1.on === '9:16|1080p|10', JSON.stringify(j1));
check('J1 stopka filmu: „Nagraj film”, bez „Kopiuj” i bez „Pobierz” przed nagraniem; podpis 1080×1920 px, 10 s', !j1.copy && j1.rec && !j1.dl && /1080×1920 px, 10 s/.test(j1.msg), JSON.stringify(j1));
check('J1 podgląd filmu = ostatnia klatka karty (na tle motywu ta sama co PNG)', (await cardHash(page)) === hImg, `${hImg}`);
check('J1 bez opcji dźwięku (P21)', !(await page.evaluate(() => /dźwięk z filmu|audio/i.test(document.querySelector('.sh-ctl').textContent))));
await sh(page, 'quality', '720p');
check('J1 720p: podpis 720×1280 px', /720×1280 px/.test(await page.locator('#sh-msg').textContent()));
await sh(page, 'quality', '1080p');
await sh(page, 'fformat', '16:9');
check('J1 16:9: podpis 1920×1080 px, podgląd w proporcji 16:9', /1920×1080 px/.test(await page.locator('#sh-msg').textContent()) && (await page.evaluate(() => document.querySelector('#sh-cv').width)) === 1920);
await closeAll(page);

// ---------- J2: Ustawienia → Wykresy → opcje filmów ----------
await openSettings(page);
const j2 = await page.evaluate(() => ({
  f: [...document.querySelectorAll('.sp [data-act="ch-film-format"]')].map((b) => b.dataset.v).join(','), s: [...document.querySelectorAll('.sp [data-act="ch-film-seconds"]')].map((b) => b.dataset.v).join(','),
  bw: !!document.querySelector('.sp [data-chk="filmBw"]'), dim: document.querySelector('.sp [data-range="filmDim"]')?.value, out: document.querySelector('.sp [data-out="filmDim"]')?.textContent,
  lic: /Filmy tła/.test(document.querySelector('.sp #ch-g-lic')?.parentElement?.textContent || ''), audio: /dźwięk z filmu/i.test(document.querySelector('.sp').textContent),
}));
check('J2 Ustawienia: format filmu 9:16 / 1:1 / 16:9 (v2), długość 6 / 10 / 15, czarno-białe, przyciemnienie 0,6 (60%), Licencje z notką o filmach tła, bez dźwięku', j2.f === '9:16,1:1,16:9' && j2.s === '6,10,15' && j2.bw && Number(j2.dim) === 0.6 && j2.out === '60%' && j2.lic && !j2.audio, JSON.stringify(j2));
await spClick(page, '.sp [data-act="ch-film-seconds"][data-v="15"]'); await sleep(150);
await spClick(page, '.sp [data-act="ch-film-format"][data-v="16:9"]'); await sleep(150);
await spClick(page, '.sp [data-chk="filmBw"]'); await sleep(150);
await page.locator('.sp [data-range="filmDim"]').evaluate((e) => { e.value = '0.3'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(200);
let st = await settingsOf(page);
check('J2 zapis w settings.chart: 15 s, 16:9, czarno-białe, 0,3', st.chart?.filmSeconds === 15 && st.chart?.filmFormat === '16:9' && st.chart?.filmBw === true && st.chart?.filmDim === 0.3, JSON.stringify(st.chart));
await closeSettings(page);
await shareTrade(page, TRADE);
await sh(page, 'mode', 'film');
check('J2 wartości początkowe okna z Ustawień: 16:9, 15 s', (await pressed(page, 'fformat')) === '16:9' && (await pressed(page, 'seconds')) === '15');
await closeAll(page);
await openSettings(page);
await spClick(page, '.sp [data-act="ch-reset"][data-v="cards"]'); await sleep(200);
st = await settingsOf(page);
check('J2 „Przywróć domyślne (Karty)” przywraca też filmy: 9:16, 10 s, kolor, 0,6', st.chart?.filmSeconds === 10 && st.chart?.filmFormat === '9:16' && st.chart?.filmBw === false && st.chart?.filmDim === 0.6, JSON.stringify(st.chart));
await closeSettings(page);

// ---------- J3: film tła z pliku, bez sieci i bez zapisu ----------
const bgB64 = await makeBgVideo(page);
await shareTrade(page, TRADE);
await sh(page, 'mode', 'film');
const ls0 = await lsSnapshot(page);
reqs = [];
await page.locator('#sh-vfile').setInputFiles({ name: 'tlo.webm', mimeType: 'video/webm', buffer: Buffer.from(bgB64, 'base64') });
await page.waitForFunction(() => document.querySelector('.sh [data-sh="fbg"][data-v="video"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 15000 });
await waitCard(page);
const j3 = await page.evaluate(() => ({ note: document.querySelector('#sh-vnote')?.textContent || '', bw: !!document.querySelector('.sh [data-sh-chk="bw"]'), dim: document.querySelector('.sh [data-sh-range="dim"]')?.value, out: document.querySelector('#sh-dim-v')?.textContent, pick: document.querySelector('.sh [data-sh="vpick"]')?.textContent }));
check('J3 film tła wybrany: notka o prawach pod wyborem, „Zmień film”, czarno-białe, przyciemnienie 60%', /Film zostaje na tym urządzeniu\. Używaj tylko nagrań, do których masz prawa \(także muzyki\)\./.test(j3.note) && j3.bw && Number(j3.dim) === 0.6 && j3.out === '60%' && /Zmień film/.test(j3.pick), JSON.stringify(j3));
const hVid = await cardHash(page);
check('J3 podgląd na tle filmu inny niż na tle motywu', hVid !== hImg);
await more(page); await page.locator('.sh label.check:has([data-sh-chk="bw"])').click(); await sleep(250);
const hBw = await cardHash(page);
await page.locator('.sh [data-sh-range="dim"]').evaluate((e) => { e.value = '0.2'; e.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(250);
const hDim = await cardHash(page);
check('J3 czarno-białe i suwak przyciemnienia zmieniają podgląd (suwak bez przebudowy kontrolek)', hBw !== hVid && hDim !== hBw && (await page.locator('#sh-dim-v').textContent()) === '20%');
await page.locator('.sh label.check:has([data-sh-chk="bw"])').click(); await sleep(200);

// ---------- J4: nagranie 6 s ----------
await sh(page, 'seconds', '6');
await page.locator('.sh [data-sh="record"]').click();
await sleep(1500);
const j4 = await page.evaluate(() => ({ rec: document.querySelector('#sh-rec')?.textContent || '', recVis: !document.querySelector('#sh-rec').hidden, cancel: !document.querySelector('.sh [data-sh="cancel"]').hidden, inert: document.querySelector('#sh-ctl').inert, dl: !document.querySelector('.sh [data-sh="download"]').hidden }));
check('J4 w trakcie: „Nagrywanie x / 6 s, nie przełączaj karty”, „Anuluj”, kontrolki nieaktywne, bez „Pobierz”', /^Nagrywanie [0-6] \/ 6 s, nie przełączaj karty$/.test(j4.rec) && j4.recVis && j4.cancel && j4.inert && !j4.dl, JSON.stringify(j4));
await shot(page, 'J-1920-onyx-nagrywanie.jpg');
await waitRecDone(page);
await waitCard(page);
const dlLabel = (await page.locator('.sh [data-sh="download"]').textContent()).trim();
check('J4 po nagraniu: „Pobierz MP4” (albo WebM), „Nagraj ponownie”, podpis 1080×1920 px, 6 s', /^Pobierz (MP4|WebM)$/.test(dlLabel) && /Nagraj ponownie/.test(await page.locator('.sh [data-sh="record"]').textContent()) && /1080×1920 px, 6 s/.test(await page.locator('#sh-msg').textContent()), dlLabel);
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.locator('.sh [data-sh="download"]').click()]);
// rozmiar pobranego pliku z kopii Playwrighta (bez zapisu w katalogu użytkownika); DL_DIR = katalog na kopię do ręcznego obejrzenia
const dlSize = statSync(await dl.path()).size;
if (process.env.DL_DIR) await dl.saveAs(path.join(process.env.DL_DIR, dl.suggestedFilename()));
check('J4 pobrany plik: justjournal-trade-…-9x16.mp4, niepusty', /^justjournal-trade-\d{4}-\d{2}-\d{2}-9x16\.(mp4|webm)$/.test(dl.suggestedFilename()) && dlSize > 50000, `${dl.suggestedFilename()} ${dlSize}`);
const net = reqs.filter((r) => !/^GET (blob|data):/.test(r)); // blob: / data: to adresy w pamięci przeglądarki (podgląd filmu tła, pobranie wyniku), nie sieć
check('J4 zero żądań sieciowych od wyboru filmu tła do końca nagrania (film tła nie wychodzi z przeglądarki)', net.length === 0, net.slice(0, 5).join(' | '));
const ls1 = await lsSnapshot(page);
const grew = Object.keys(ls1).filter((k) => !(k in ls0) || ls1[k] > ls0[k] + 64);
check('J4 localStorage bez filmu tła (bez nowych kluczy, bez blob: i danych wideo)', grew.length === 0 && !(await lsHasBlob(page)), `${grew.join(',')} ${await lsHasBlob(page)}`);

// ---------- J5: Anuluj ----------
await page.locator('.sh [data-sh="record"]').click();
await sleep(1000);
await page.locator('.sh [data-sh="cancel"]').click();
await waitRecDone(page);
await sleep(300);
check('J5 „Anuluj”: koniec nagrywania, bez wyniku („Nagraj film”, bez „Pobierz”), komunikat', (await visible(page, '.sh [data-sh="record"]')) && !(await visible(page, '.sh [data-sh="download"]')) && /Nagraj film/.test(await page.locator('.sh [data-sh="record"]').textContent()) && /anulowane/.test(await toastText(page)), await toastText(page));

// ---------- J6: ukrycie karty przerywa nagranie ----------
await page.locator('.sh [data-sh="record"]').click();
await sleep(1000);
await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
await waitRecDone(page);
await sleep(300);
const t6 = await toastText(page);
await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
check('J6 ukrycie karty przerywa nagranie z ostrzeżeniem, bez wyniku', /przerwane/.test(t6) && !(await visible(page, '.sh [data-sh="download"]')), t6);

// ---------- J7: Esc w trakcie nagrywania ----------
await page.locator('.sh [data-sh="record"]').click();
await sleep(800);
await page.keyboard.press('Escape');
await waitRecDone(page);
await sleep(300);
check('J7 Esc w trakcie nagrywania: anuluje, okno zostaje otwarte', (await page.locator('.sh-scrim').count()) === 1 && /anulowane/.test(await toastText(page)));
await sh(page, 'mode', 'image');
check('J7 powrót do obrazu: „Kopiuj” jak dotąd, „Pobierz PNG”', /Pobierz PNG/.test(await page.locator('.sh [data-sh="download"]').textContent()) && !(await visible(page, '.sh [data-sh="record"]')));
await closeAll(page);
await shareTrade(page, TRADE);
await sh(page, 'mode', 'film');
check('J7 po zamknięciu okna film tła nie jest zapamiętany (tło znowu motyw)', (await pressed(page, 'fbg')) === 'theme' && !(await page.locator('#sh-vnote').count()));
await closeAll(page);
await ctx.close();

// ---------- Platinum, 375 px: okno w trybie Film z filmem tła, w trakcie nagrywania ----------
const ctxP = await browser.newContext();
const pp = await newPage(ctxP, { theme: 'platinum' });
const bgP = await makeBgVideo(pp);
await shareTrade(pp, TRADE);
await sh(pp, 'mode', 'film');
await pp.locator('#sh-vfile').setInputFiles({ name: 'tlo.webm', mimeType: 'video/webm', buffer: Buffer.from(bgP, 'base64') });
await pp.waitForFunction(() => document.querySelector('.sh [data-sh="fbg"][data-v="video"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 15000 });
await waitCard(pp);
await pp.setViewportSize({ width: 375, height: 812 }); await sleep(500);
const hs = await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && [...document.querySelectorAll('.sh *')].every((e) => e.getBoundingClientRect().right <= window.innerWidth + 1));
check('375 px Platinum: okno w trybie Film bez poziomego przewijania', hs);
await more(pp); await pp.locator('.sh [data-sh="seconds"][data-v="6"]').click(); await sleep(200); await waitCard(pp);
await pp.locator('.sh [data-sh="record"]').click();
await sleep(1200);
const recVis = await pp.evaluate(() => { const e = document.querySelector('#sh-rec'); const r = e.getBoundingClientRect(); return !e.hidden && r.width > 0 && r.right <= window.innerWidth + 1 && /Nagrywanie/.test(e.textContent); });
check('375 px: postęp nagrywania widoczny w stopce (na telefonie podpis rozmiaru jest ukryty)', recVis);
await shot(pp, 'J-375-platinum-film-nagrywanie.jpg');
await waitRecDone(pp);
await waitCard(pp);
check('Platinum 375 px: nagranie skończone, „Pobierz” widoczne', await visible(pp, '.sh [data-sh="download"]'));
await shot(pp, 'J-375-platinum-film-gotowy.jpg');
await closeAll(pp);
await pp.setViewportSize({ width: 1920, height: 1080 }); await sleep(300);
await openSettings(pp);
await sleep(1000); // zakładka Wykresy przerysowuje się po wczytaniu rozmiaru chart-data (przewinięcie wcześniej by przepadło)
await pp.locator('.sp [data-range="filmDim"]').evaluate((e) => { const sp = e.closest('.sp'); sp.scrollTop += e.getBoundingClientRect().top - sp.getBoundingClientRect().top - sp.clientHeight * 0.55; });
await sleep(300);
await shot(pp, 'J-1920-platinum-ustawienia-filmy.jpg');
await ctxP.close();

check('bez błędów strony', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed, 0 skipped`);
process.exit(failed ? 1 : 0);
