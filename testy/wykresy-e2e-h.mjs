// Test E2E pakietu H (28.10.2026), etapy 14 i 15, w pełnej aplikacji (headless Chromium), uruchamiany OSOBNO od testy/run.mjs (wymaga Playwrighta, repo ma zero npm).
// Decyzje P39-P42 (słowa użytkownika z AskUserQuestion): P39 bez przycisku usuwania świec, P40 limity tylko do podglądu, P41 strefa i B-ADJ w zakładce Wykresy,
// P42 nakładki w settings.chart (synchronizacja), stary zapis localStorage czytany raz jako wartość początkowa.
//   H1 zakładka Wykresy: pięć zakładek mieści się w popoverze, strefa i B-ADJ tylko w Wykresy, dane Databento bez edycji limitów i bez usuwania, klucz (przechwycone żądanie, bez sieci)
//   H2 styl wykresu: podgląd w Ustawieniach, zapis w settings.chart, żądanie synchronizacji z chart (bez klucza Databento)
//   H3 miniatury listy i podgląd w lightboxie zmieniają styl bez przeładowania; edycja LWC z linią bez błędów
//   H4 własne kolory świec, ostrzeżenie o kontraście i „Popraw”; siatka i poziomy trade'a; nakładki z Ustawień widoczne na wykresie i odwrotnie
//   H5 „Przywróć domyślne” per grupa; druga przeglądarka dostaje chart z Notion (atrapa); 375 px
// Uruchomienie: PW_CORE=<katalog playwright-core> [BASE=http://127.0.0.1:4399] [SHOTS=<katalog>] node testy/wykresy-e2e-h.mjs   (dashboard testowy z atrapą: dowody-rolla/start-4399.mjs)
// Port 4321 i prawdziwe Notion są zakazane. Wynik: linie ✓/✗ i podsumowanie „N passed, M failed, 0 skipped”.
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
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
const SETTINGS_KEY = 'thq.settings.v1', OVERLAY_KEY = 'thq.chart.overlays.v1';
const TRADE = 'ES wygrana TP 2R (po BE)';
const FAKE_KEY = 'db-E2E-fake-key-0123456789abcdef';

const browser = await chromium.launch({ executablePath: findChrome() });
const errors = [];
const syncBodies = [];
async function newPage(ctx, { width = 1440, height = 900, theme } = {}) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (r.url().endsWith('/api/sync') && r.method() === 'POST') syncBodies.push(r.postData() || ''); });
  if (theme) await page.addInitScript((th) => { try { if (!localStorage.getItem('thq.theme.set')) { localStorage.setItem('thq.theme', th); localStorage.setItem('thq.theme.set', '1'); } } catch { /* brak */ } }, theme);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForSelector('#gear');
  return page;
}
const settingsOf = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), SETTINGS_KEY);
const openSettings = async (page, tab = 'wykresy') => {
  if (!(await page.locator('.sp').count())) await page.locator('#gear').click();
  await page.locator(`[data-act="sp-tab"][data-v="${tab}"]`).click();
  await sleep(150);
};
const closeSettings = async (page) => { if (await page.locator('.sp').count()) { await page.keyboard.press('Escape'); await sleep(100); if (await page.locator('.sp').count()) await page.locator('#gear').click(); } };
const clickAct = (page, act, v) => page.locator(`.sp [data-act="${act}"]${v ? `[data-v="${v}"]` : ''}`).click();
async function openTrade(page, name = TRADE) {
  await page.getByRole('button', { name: /^Trade'y/ }).first().click().catch(() => page.locator('text=/^Trade.y/').first().click());
  await page.locator('[data-act="preset"][data-v="all"]').first().click().catch(() => {});
  await page.locator('.row-btn', { hasText: name }).first().click();
  await page.waitForSelector('.lb:not([hidden])');
  await page.waitForSelector('.lb-chart:not([hidden]) .swc-plot svg', { timeout: 30000 });
  await sleep(600);
}
const closeLb = async (page) => { await page.keyboard.press('Escape'); await sleep(300); if (await page.locator('.lb:not([hidden])').count()) { await page.keyboard.press('Escape'); await sleep(300); } };
const shot = async (page, file, sel) => { if (!SHOTS) return; const t = sel ? page.locator(sel).first() : page; await t.screenshot({ path: path.join(SHOTS, file), type: 'jpeg', quality: 85 }); };

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Europe/Warsaw' });

// ---------- H1 ----------
let page = await newPage(ctx);
await page.locator('#gear').click();
const tabs = await page.locator('.sp-tabs button').evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), l: r.left, r: r.right, w: b.scrollWidth, cw: b.clientWidth }; }));
const pr = await page.locator('.sp').evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right }; });
check('H1 pięć zakładek (Kolory, Wynik BE, Wykresy, Ogólne, Urządzenia) mieści się w popoverze (1440 px)', tabs.length === 5 && tabs.map((x) => x.t).join('|') === 'Kolory|Wynik BE|Wykresy|Ogólne|Urządzenia' && tabs.every((x) => x.l >= pr.l - 1 && x.r <= pr.r + 1 && x.w <= x.cw + 1), JSON.stringify(tabs));
await clickAct(page, 'sp-tab', 'ogolne');
check('H1 P41: w „Ogólne” nie ma strefy czasowej ani B-ADJ, zostaje przełącznik ustawień rysunku', (await page.locator('#sp-tz, #sp-badj').count()) === 0 && (await page.locator('[data-act="sp-dock"]').count()) === 2);
await clickAct(page, 'sp-tab', 'wykresy');
check('H1 P41: w „Wykresy” są strefa czasowa i B-ADJ (klucze chartTz / chartBadj bez zmian)', (await page.locator('#sp-tz').count()) === 1 && (await page.locator('#sp-badj').count()) === 1 && (await page.locator('#sp-badj').isChecked()));
const wick = await page.locator('.pvc .wick').evaluateAll((ps) => ps.reduce((n, p) => n + (p.getAttribute('d').match(/M/g) || []).length, 0));
check('H1 podgląd na górze: 40 świec, poziomy wejścia i wyjścia, siatka niepotrzebna w miniaturze', wick === 40 && (await page.locator('.pvc .lvl-t.entry').count()) === 1 && (await page.locator('.pvc .lvl-t.exit').count()) === 1, String(wick));
await shot(page, 'H-1920-onyx-ustawienia-wykresy.jpg', '.sp');
const dataTxt = await page.locator('.sp-kvs').innerText();
check('H1 P40: limity, dzisiejsze wydatki i kredyt tylko do podglądu (bez pól edycji)', /Limit na jedno pobranie/.test(dataTxt) && /Limit dzienny/.test(dataTxt) && /Wydano dziś/.test(dataTxt) && /Kredyt Databento/.test(dataTxt) && (await page.locator('.sp-kvs input, .sp-kvs select').count()) === 0, dataTxt);
await page.waitForFunction(() => /(B|KB|MB|GB)\b/.test(document.querySelector('.sp-kvs')?.innerText || ''), null, { timeout: 8000 }).catch(() => {});
const sizeTxt = (await page.locator('.sp-kv', { hasText: 'Pobrane świece' }).innerText()).replace(/\s+/g, ' ');
check('H1 P39: rozmiar chart-data/ widoczny, bez przycisku „Usuń pobrane świece”', /\d/.test(sizeTxt) && /(KB|MB|GB)/.test(sizeTxt) && (await page.locator('.sp button', { hasText: /Usuń/ }).count()) === 0, sizeTxt);
// klucz Databento: żądanie przechwycone, nic nie idzie do sieci
let keyCalls = 0, keyReply = { status: 400, body: { error: 'Databento odrzucił klucz (401). Klucz jest błędny lub wygasł.' } };
await page.route('**/api/candles/key', (route) => { keyCalls++; route.fulfill({ status: keyReply.status, contentType: 'application/json', body: JSON.stringify(keyReply.body) }); });
await page.locator('#sp-dbkey').fill(FAKE_KEY);
await page.locator('[data-act="ch-key-save"]').click();
await page.waitForFunction(() => /odrzucił klucz/.test(document.querySelector('#sp-dbkey-d')?.innerText || ''), null, { timeout: 5000 }).catch(() => {});
check('H1 klucz Databento: błąd serwera pokazany użytkownikowi, żądanie jedno', keyCalls === 1 && /odrzucił klucz/.test(await page.locator('#sp-dbkey-d').innerText()), String(keyCalls));
keyReply = { status: 200, body: { ok: true } };
await page.locator('#sp-dbkey').fill(FAKE_KEY);
await page.locator('[data-act="ch-key-save"]').click();
await page.waitForFunction(() => /Klucz sprawdzony i zapisany/.test(document.querySelector('#sp-dbkey-d')?.innerText || ''), null, { timeout: 5000 }).catch(() => {});
check('H1 klucz Databento: po sukcesie komunikat; pole hasła wyczyszczone, klucz nie trafia do localStorage ani do ustawień', /Klucz sprawdzony i zapisany/.test(await page.locator('#sp-dbkey-d').innerText()) && (await page.locator('#sp-dbkey').inputValue()) === '' && !JSON.stringify(await page.evaluate(() => ({ ...localStorage }))).includes(FAKE_KEY));

// ---------- H2 ----------
await clickAct(page, 'ch-style', 'line');
await sleep(200);
const sty = await settingsOf(page);
check('H2 styl linii: podgląd w Ustawieniach rysuje linię zamknięć bez świec, zapis w settings.chart.style', (await page.locator('.pvc .close-line').count()) === 1 && (await page.locator('.pvc .candle').count()) === 0 && sty.chart?.style === 'line', JSON.stringify(sty.chart?.style));
await sleep(3500);
const chartSync = syncBodies.filter((b) => /"chart"/.test(b)).pop() || '';
check('H2 synchronizacja: żądanie ma settings.chart ze stylem linii, bez klucza Databento i limitów', /"style":"line"/.test(chartSync) && !/databento|DATABENTO|chartCostLimit|chartDaily|chartCredit|db-E2E/i.test(chartSync), chartSync.slice(0, 200));

// ---------- H3: miniatury i podgląd bez przeładowania ----------
// v2 (P46): miniatury mają osobny styl (Ustawienia → Wykresy → „Styl miniatur na liście”)
await openSettings(page); await clickAct(page, 'ch-mini-style', 'line'); await sleep(200);
await closeSettings(page);
await page.evaluate(() => { window.__h = 1; });
await page.getByRole('button', { name: /^Trade'y/ }).first().click().catch(() => page.locator('text=/^Trade.y/').first().click());
await page.locator('[data-act="preset"][data-v="all"]').first().click().catch(() => {});
await page.waitForSelector('.swc-mini.is-chart svg', { timeout: 30000 });
await sleep(600);
const minis = () => page.evaluate(() => ({ line: document.querySelectorAll('.swc-mini svg .close-line').length, candle: document.querySelectorAll('.swc-mini svg .candle').length }));
let m = await minis();
check('H3 miniatury listy w stylu linii (bez świec)', m.line > 0 && m.candle === 0, JSON.stringify(m));
await shot(page, 'H-1920-onyx-lista-linia.jpg');
await openSettings(page); await clickAct(page, 'ch-style', 'candles'); await sleep(300);
await closeSettings(page); await sleep(700);
m = await minis();
check('H3 (P46) styl podglądu nie zmienia miniatur (osobny styl miniatur)', m.line > 0 && m.candle === 0, JSON.stringify(m));
await openSettings(page); await clickAct(page, 'ch-mini-style', 'candles'); await sleep(300);
await closeSettings(page); await sleep(700);
m = await minis();
check('H3 powrót do świec zmienia miniatury bez przeładowania strony', m.candle > 0 && m.line === 0 && (await page.evaluate(() => window.__h)) === 1, JSON.stringify(m));
await openSettings(page); await clickAct(page, 'ch-style', 'line'); await closeSettings(page); await sleep(400);
await openTrade(page);
const pv = () => page.evaluate(() => ({ line: document.querySelectorAll('.lb-chart .swc-plot svg .close-line').length, candle: document.querySelectorAll('.lb-chart .swc-plot svg .candle').length, grid: document.querySelectorAll('.lb-chart .swc-plot svg line.grid').length, entry: document.querySelectorAll('.lb-chart .swc-plot svg .lvl-t.entry').length, sl: document.querySelectorAll('.lb-chart .swc-plot svg .lvl.sl').length }));
let v = await pv();
check('H3 podgląd w lightboxie: linia zamknięć, siatka i poziomy włączone domyślnie', v.line === 1 && v.candle === 0 && v.grid > 0 && v.entry === 1 && v.sl === 1, JSON.stringify(v));
await page.locator('.lb-chart .swc-edit').click();
await page.waitForSelector('.lb-chart .swc-lwc canvas', { timeout: 20000 });
await sleep(1200);
const errN = errors.length;
const lineShot = await page.locator('.lb-chart .swc-lwc').screenshot();
check('H3 edycja LWC ze stylem linii: wykres się rysuje (LineSeries), bez błędów w konsoli', (await page.locator('.lb-chart .swc-lwc canvas').count()) > 0 && errors.length === errN, errors.slice(-2).join(' | '));
await shot(page, 'H-1920-onyx-edycja-linia.jpg', '.lb-chart');
await closeLb(page);
await openSettings(page); await clickAct(page, 'ch-style', 'candles'); await closeSettings(page);
await openTrade(page);
await page.locator('.lb-chart .swc-edit').click();
await page.waitForSelector('.lb-chart .swc-lwc canvas', { timeout: 20000 });
await sleep(1200);
const candleShot = await page.locator('.lb-chart .swc-lwc').screenshot();
check('H3 edycja LWC: świece i linia wyglądają inaczej (te same dane, inna seria)', !lineShot.equals(candleShot));
await closeLb(page);

// ---------- H4: kolory, siatka, poziomy, nakładki ----------
await openSettings(page);
await clickAct(page, 'ch-colors', 'custom');
await page.locator('.cc-h[data-ck="up"]').fill('#ff00ff');
await sleep(200);
const cv = await page.evaluate(() => ({ up: document.documentElement.style.getPropertyValue('--chart-up'), fill: getComputedStyle(document.querySelector('.pvc .candle.up')).fill }));
check('H4 własny kolor świecy wzrostowej: zmienna --chart-up na <html> i kolor świec w podglądzie', cv.up === '#ff00ff' && /rgb\(255, 0, 255\)/.test(cv.fill), JSON.stringify(cv));
await page.locator('.cc-h[data-ck="down"]').fill('#333333');
await sleep(200);
check('H4 słaby kontrast własnego koloru: ostrzeżenie „słaby kontrast” i przycisk Popraw', (await page.locator('.cc[data-ck="down"] .cr-ct.weak').count()) === 1 && /słaby kontrast/.test(await page.locator('.cc[data-ck="down"] .cr-ct').innerText()));
await page.locator('[data-act="ch-fix"][data-ck="down"]').click();
await sleep(200);
const fixed = await page.locator('.cc-h[data-ck="down"]').inputValue();
check('H4 „Popraw” podnosi kontrast do progu (ostrzeżenie znika, kolor zmieniony)', (await page.locator('.cc[data-ck="down"] .cr-ct.weak').count()) === 0 && fixed !== '#333333' && /^#[0-9a-f]{6}$/.test(fixed), fixed);
await clickAct(page, 'ch-edit-theme', 'platinum');
const platHex = await page.locator('.cc-h[data-ck="up"]').inputValue();
check('H4 własne kolory osobno dla Onyx i Platinum', platHex !== '#ff00ff', platHex);
await clickAct(page, 'ch-edit-theme', 'onyx');
await shot(page, 'H-1920-onyx-kolory-wlasne.jpg', '.sp');
// siatka i poziomy
await page.locator('[data-chk="grid"]').uncheck({ force: true });
await page.locator('[data-chk="entry"]').uncheck({ force: true });
await page.locator('[data-chk="sl"]').uncheck({ force: true });
await sleep(200);
check('H4 podgląd w Ustawieniach: wejście i SL zniknęły, wyjście zostaje', (await page.locator('.pvc .lvl-t.entry').count()) === 0 && (await page.locator('.pvc .lvl.sl').count()) === 0 && (await page.locator('.pvc .lvl-t.exit').count()) === 1);
// nakładki z Ustawień
await page.locator('[data-chk="sessions"]').check({ force: true });
await page.locator('[data-ovt="london.from"]').fill('03:00'); await page.locator('[data-ovt="london.from"]').press('Tab');
await sleep(200);
const ovs = await settingsOf(page);
check('H4 P42: nakładki zapisane w settings.chart.overlays (tło sesji, godziny)', ovs.chart?.overlays?.sessions === true && ovs.chart?.overlays?.sess?.london?.from === '03:00', JSON.stringify(ovs.chart?.overlays?.sess?.london));
await closeSettings(page);
await openTrade(page);
v = await pv();
check('H4 wykres: siatka i poziomy zgodnie z ustawieniami (bez siatki, bez wejścia i SL)', v.grid === 0 && v.entry === 0 && v.sl === 0, JSON.stringify(v));
check('H4 P42: przełącznik „Sesje” na wykresie jest zaznaczony z Ustawień', await page.locator('.lb-chart [data-swc-ov="sessions"]').isChecked());
await page.locator('.lb-chart [data-swc-ov="pdhl"]').check({ force: true });
await sleep(300);
const ov2 = await settingsOf(page);
const legacy = await page.evaluate((k) => localStorage.getItem(k), OVERLAY_KEY);
check('H4 P42: przełącznik na wykresie zapisuje do settings.chart, a nie do starego klucza localStorage', ov2.chart?.overlays?.pdhl === true && (legacy == null || !/"pdhl":true/.test(legacy)), String(legacy));
await closeLb(page);

// ---------- H5: reset per grupa, druga przeglądarka, 375 px ----------
await openSettings(page);
await clickAct(page, 'ch-reset', 'look');
const rs = await settingsOf(page);
check('H5 „Przywróć domyślne (Wygląd)”: styl, kolory, siatka i poziomy wracają, nakładki bez zmian', rs.chart.style === 'candles' && rs.chart.colorMode === 'palette' && rs.chart.grid === true && rs.chart.entry === true && rs.chart.sl === true && rs.chart.overlays.sessions === true && rs.chart.overlays.pdhl === true, JSON.stringify({ s: rs.chart.style, g: rs.chart.grid, o: rs.chart.overlays.sessions }));
check('H5 po resecie Wygląd: pola w UI zgodne (siatka zaznaczona, usunięty własny kolor)', (await page.locator('[data-chk="grid"]').isChecked()) && (await page.locator('.cc').count()) === 0);
await clickAct(page, 'ch-reset', 'overlays');
const rs2 = await settingsOf(page);
check('H5 „Przywróć domyślne (Nakładki)”: tylko nakładki', rs2.chart.overlays.sessions === false && rs2.chart.overlays.pdhl === false && rs2.chart.overlays.sess.london.from === '02:00');
await page.locator('#sp-tz').selectOption('UTC'); await sleep(150);
await page.locator('#sp-badj').uncheck({ force: true }); await sleep(150);
let rs3 = await settingsOf(page);
check('H5 strefa i B-ADJ zapisują się pod starymi kluczami', rs3.chartTz === 'UTC' && rs3.chartBadj === false);
await clickAct(page, 'ch-reset', 'time');
rs3 = await settingsOf(page);
check('H5 „Przywróć domyślne (Czas i ceny)”: strefa przeglądarki i B-ADJ włączony', rs3.chartTz === '' && rs3.chartBadj === true && (await page.locator('#sp-badj').isChecked()) && (await page.locator('#sp-tz').inputValue()) === '');
// synchronizacja: drugie urządzenie (nowa przeglądarka) dostaje settings.chart z Notion. Dashboard 4399 nie ma bloku ustawień na stronie głównej atrapy
// (odpowiedź /api/sync: no-block), więc odpowiedź GET podstawiamy; zapis do Notion i blok ustawień sprawdza test jednostkowy wykresy-14 na pełnej atrapie.
const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctxB.route((u) => u.pathname === '/api/sync', (route) => (route.request().method() === 'GET'
  ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, deviceId: 'inne-urzadzenie', deviceName: 'drugie', remote: { deviceId: 'inne', updatedAt: '2099-01-01T00:00:00.000Z', settings: { palette: 'color', chart: { style: 'line', grid: false, databentoKey: 'nie', overlays: { sessions: true } } } } }) })
  : route.continue()));
const pageB = await newPage(ctxB);
let got = null;
for (let i = 0; i < 20; i++) { await sleep(500); got = (await settingsOf(pageB)).chart; if (got?.style === 'line') break; }
check('H5 drugie urządzenie: settings.chart ze zdalnych ustawień zastosowane (styl linii, bez siatki, nakładki), obce klucze odrzucone', got?.style === 'line' && got.grid === false && got.overlays?.sessions === true && !('databentoKey' in got), JSON.stringify(got)?.slice(0, 160));
await pageB.locator('#gear').click(); await pageB.locator('[data-act="sp-tab"][data-v="wykresy"]').click(); await sleep(250);
check('H5 drugie urządzenie: Ustawienia pokazują zdalny styl i siatkę', (await pageB.locator('[data-act="ch-style"][data-v="line"]').getAttribute('aria-pressed')) === 'true' && !(await pageB.locator('[data-chk="grid"]').isChecked()) && (await pageB.locator('.pvc .close-line').count()) === 1);
await ctxB.close();
await page.close();

// 375 px
const ctxM = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
const pm = await newPage(ctxM, { width: 375, height: 812 });
await pm.locator('#gear').click();
await sleep(300);
const mt = await pm.locator('.sp-tabs button').evaluateAll((bs) => bs.map((b) => ({ t: b.textContent.trim(), over: b.scrollWidth > b.clientWidth + 1, r: b.getBoundingClientRect().right })));
const mw = await pm.evaluate(() => document.querySelector('.sp').getBoundingClientRect().right);
check('H5 375 px: pięć zakładek mieści się bez ucięcia etykiet', mt.length === 5 && mt.every((x) => !x.over && x.r <= mw + 1), JSON.stringify(mt));
await pm.locator('[data-act="sp-tab"][data-v="wykresy"]').click();
await sleep(300);
const sc = await pm.evaluate(() => ({ doc: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, sp: document.querySelector('.sp').scrollWidth > document.querySelector('.sp').clientWidth + 1 }));
check('H5 375 px: brak przewijania w poziomie (strona i popover)', !sc.doc && !sc.sp, JSON.stringify(sc));
await shot(pm, 'H-375-onyx-ustawienia-wykresy.jpg');
await pm.locator('[data-act="ch-colors"][data-v="custom"]').click();
await pm.locator('.cc-h[data-ck="up"]').scrollIntoViewIfNeeded();
const cc = await pm.locator('.cc').first().evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
check('H5 375 px: własne kolory bez wyjścia poza ekran', cc);
await ctxM.close();
// Platinum 1920
const ctxP = await browser.newContext({ viewport: { width: 1920, height: 1080 }, timezoneId: 'Europe/Warsaw' });
const pp = await newPage(ctxP, { width: 1920, height: 1080, theme: 'platinum' });
await pp.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.chart = { style: 'line' }; localStorage.setItem(k, JSON.stringify(s)); }, SETTINGS_KEY);
await pp.reload({ waitUntil: 'networkidle' });
await pp.locator('#gear').click(); await pp.locator('[data-act="sp-tab"][data-v="wykresy"]').click(); await sleep(300);
check('H5 Platinum: motyw jasny, podgląd z linią', (await pp.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'platinum' && (await pp.locator('.pvc .close-line').count()) === 1);
await shot(pp, 'H-1920-platinum-ustawienia-wykresy.jpg', '.sp');
await ctxP.close();

// ---------- H6 (przegląd HIJ, pkt 2, 29.10.2026): migracja starego klucza nakładek a synchronizacja ----------
// Urządzenie ze starym zapisem nakładek (P32) i bez settings.chart; drugie urządzenie ma w Notion domyślne nakładki z updatedAt nowszym niż lokalny,
// ale starszym niż chwila migracji. Decyzja sesji głównej: wygrywa zwykła reguła (nowsze updatedAt), a migracja daje lokalnym nakładkom świeży czas.
const MOVED_KEY = 'thq.chart.overlays.v1.moved', SYNC_KEY = 'thq.sync.v1';
const ctxG = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pushes = [];
await ctxG.route((u) => u.pathname === '/api/sync', (route) => {
  if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, deviceId: 'ten', deviceName: 'ten', remote: { deviceId: 'inne', updatedAt: '2026-06-01T00:00:00.000Z', settings: { palette: 'color', chart: { style: 'candles', overlays: { sessions: false, pdhl: false } } } } }) });
  pushes.push(route.request().postData() || '');
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ written: true, remoteUpdatedAt: new Date().toISOString() }) });
});
await ctxG.addInitScript(([ov, sk, syk]) => {
  try {
    if (localStorage.getItem('e2e.h6')) return;
    localStorage.setItem('e2e.h6', '1');
    localStorage.removeItem(sk);
    localStorage.setItem(ov, JSON.stringify({ sessions: true, pdhl: true, sess: { london: { from: '03:00', to: '05:00' } } }));
    localStorage.setItem(syk, JSON.stringify({ updatedAt: '2026-01-01T00:00:00.000Z' }));
  } catch { /* brak */ }
}, [OVERLAY_KEY, SETTINGS_KEY, SYNC_KEY]);
const pg = await newPage(ctxG);
const g0 = await pg.evaluate(([sk, mk, syk]) => ({ ov: JSON.parse(localStorage.getItem(sk) || '{}').chart?.overlays, moved: localStorage.getItem(mk), sync: JSON.parse(localStorage.getItem(syk) || '{}').updatedAt }), [SETTINGS_KEY, MOVED_KEY, SYNC_KEY]);
check('H6 migracja zapisana od razu: settings.chart.overlays ze starego klucza (tło sesji, PDH/PDL, Londyn 03:00), znacznik „przeniesione”, świeży czas synchronizacji',
  g0.ov?.sessions === true && g0.ov?.pdhl === true && g0.ov?.sess?.london?.from === '03:00' && !!g0.moved && g0.sync > '2026-06-01T00:00:00.000Z', JSON.stringify(g0));
await sleep(3000); // pull przy starcie i zapis po 2 s spokoju
const g1 = (await settingsOf(pg)).chart?.overlays;
check('H6 starsze domyślne nakładki z innego urządzenia nie nadpisują zmigrowanych', g1?.sessions === true && g1?.pdhl === true, JSON.stringify(g1)?.slice(0, 120));
check('H6 zmigrowane nakładki poszły do synchronizacji (POST /api/sync z tłem sesji i PDH/PDL)', pushes.some((b) => { try { const o = JSON.parse(b).settings?.chart?.overlays; return o?.sessions === true && o?.pdhl === true; } catch { return false; } }), String(pushes.length));
await openSettings(pg);
check('H6 Ustawienia → Wykresy pokazują zmigrowane nakładki', (await pg.locator('.sp [data-chk="sessions"]').isChecked()) && (await pg.locator('.sp [data-chk="pdhl"]').isChecked()));
// stary klucz nie jest czytany ponownie: bez nakładek w ustawieniach start daje domyślne, nie stary zapis
await closeSettings(pg);
await pg.evaluate(([sk, ov]) => { const s = JSON.parse(localStorage.getItem(sk) || '{}'); delete s.chart; localStorage.setItem(sk, JSON.stringify(s)); localStorage.setItem(ov, JSON.stringify({ sessions: true, pdhl: true })); }, [SETTINGS_KEY, OVERLAY_KEY]);
await pg.reload({ waitUntil: 'load' }); await pg.waitForSelector('#gear'); await sleep(500);
const g2 = (await settingsOf(pg)).chart?.overlays;
check('H6 po przeniesieniu stary klucz nie wraca (start bez nakładek w ustawieniach = domyślne)', !g2 || (g2.sessions === false && g2.pdhl === false), JSON.stringify(g2)?.slice(0, 120));

// ---------- H7 (przegląd HIJ, pkt 7): wklejony, niezapisany klucz Databento przeżywa przerysowanie Ustawień ----------
await openSettings(pg);
await pg.locator('#sp-dbkey').fill('db-NIEZAPISANY-0123456789');
await clickAct(pg, 'ch-style', 'line'); await sleep(200); // render: true
await clickAct(pg, 'ch-style', 'candles'); await sleep(1200); // i przerysowanie po wczytaniu rozmiaru chart-data
const k7 = await pg.locator('#sp-dbkey').inputValue();
const ls7 = await pg.evaluate(() => { let s = ''; for (let i = 0; i < localStorage.length; i++) s += localStorage.getItem(localStorage.key(i)); return s.includes('NIEZAPISANY'); });
check('H7 niezapisany klucz zostaje w polu po przerysowaniu i nie trafia do localStorage', k7 === 'db-NIEZAPISANY-0123456789' && !ls7, `${k7} ${ls7}`);
await ctxG.close();

check('bez błędów strony', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed, 0 skipped`);
process.exit(failed ? 1 : 0);
