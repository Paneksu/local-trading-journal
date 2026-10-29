// Test E2E pakietu I (28.10.2026), etapy 16 i 17, w pełnej aplikacji (headless Chromium), uruchamiany OSOBNO od testy/run.mjs (wymaga Playwrighta, repo ma zero npm).
//   I1 karta trade'a z wykresem: jedno żądanie /api/candles na kartę (tf=auto, maxBars=60, B-ADJ wg ustawienia), zmiana formatu bez nowego żądania
//   I2 Ustawienia → Wykresy → „Karty udostępniania”: przełączniki i styl karty, zapis w settings.chart, opcje filmów (od pakietu J)
//   I3 wykres w kartach wyłączony: zero żądań z okna, karta jak bez świec; „Przywróć domyślne (Karty)”; styl karty „Linia zamknięć”
//   I4 EURUSD: zero żądań; I5 krzywa kapitału: przełącznik w oknie (wartość początkowa z Ustawień, zmiana chwilowa); 375 px bez poziomego przewijania; Platinum
// Uruchomienie: PW_CORE=<katalog playwright-core> [BASE=http://127.0.0.1:4399] [SHOTS=<katalog>] node testy/wykresy-e2e-i.mjs   (dashboard testowy z atrapą: dowody-rolla/start-4399.mjs)
// Port 4321 i prawdziwe Notion są zakazane. Wynik: linie ✓/✗ i podsumowanie „N passed, M failed, 0 skipped”.
import { createRequire } from 'node:module';
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
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
const TRADE = 'ES wygrana TP 2R (po BE)', FX = 'EURUSD (brak źródła)';

const browser = await chromium.launch({ executablePath: findChrome() });
const errors = [];
const cardReqs = []; // żądania świec okna Udostępnij (v2: jawny tf, plan 1s → 1m; liczone tylko przy otwartym oknie)
let inShare = false;
async function newPage(ctx, { width = 1920, height = 1080, theme } = {}) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (inShare && r.url().includes('/api/candles?')) cardReqs.push(r.url()); });
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
// kliknięcie kontrolki w Ustawieniach przez element.click(): przyklejony podgląd u góry zakładki zasłania kontrolki dla kliknięć myszą w headless
const spClick = (p, sel) => p.locator(sel).first().evaluate((e) => e.click());
const closeSettings = async (page) => { if (await page.locator('.sp').count()) { await page.keyboard.press('Escape'); await sleep(100); if (await page.locator('.sp').count()) await page.locator('#gear').click(); } };
async function openTrade(page, name = TRADE) {
  await page.getByRole('button', { name: /^Trade'y/ }).first().click().catch(() => page.locator('text=/^Trade.y/').first().click());
  await page.locator('[data-act="preset"][data-v="all"]').first().click().catch(() => {});
  await page.locator('.row-btn', { hasText: name }).first().click();
  await page.waitForSelector('.lb:not([hidden])');
  await sleep(800);
}
// karty okresu: przycisk Udostępnij w karcie wyniku widoku Statystyki
const openPeriodShare = async (p) => { await p.locator('[data-act="view"][data-v="stats"]').first().click(); await sleep(400); inShare = true; await p.locator('[data-act="share-open"]').first().click(); await p.waitForSelector('.sh-scrim'); await waitCard(p); };
const closeAll = async (page) => { inShare = false; cardReqs.length = 0; for (let i = 0; i < 3; i++) { if (!(await page.locator('.sh-scrim, .lb:not([hidden])').count())) break; await page.keyboard.press('Escape'); await sleep(250); } };
// okno Udostępnij gotowe: podpis rozmiaru karty w stopce (rysunek i blob policzone)
const waitCard = async (page) => { await page.waitForFunction(() => /\d+×\d+ px/.test(document.querySelector('#sh-msg')?.textContent || ''), null, { timeout: 20000 }); await sleep(200); };
async function shareTrade(page, name) { await openTrade(page, name); inShare = true; await page.locator('.lb [data-act="share-trade"]').first().click(); await page.waitForSelector('.sh-scrim'); await waitCard(page); }
const sh = async (page, attr, v) => { await page.locator(`.sh [data-sh="${attr}"][data-v="${v}"]`).click(); await sleep(150); await waitCard(page); };
const cardHash = (page) => page.evaluate(() => {
  const cv = document.querySelector('#sh-cv'); const d = new Uint32Array(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data.buffer);
  let a = 0x811c9dc5; for (let i = 0; i < d.length; i++) { a ^= d[i]; a = Math.imul(a, 0x01000193) >>> 0; } return `${a.toString(16)}:${cv.width}x${cv.height}`;
});
const saveCard = async (page, file) => { if (!SHOTS) return; const url = await page.evaluate(() => document.querySelector('#sh-cv').toDataURL('image/jpeg', 0.9)); writeFileSync(path.join(SHOTS, file), Buffer.from(url.split(',')[1], 'base64')); };
const shot = async (page, file, sel) => { if (!SHOTS) return; const t = sel ? page.locator(sel).first() : page; await t.screenshot({ path: path.join(SHOTS, file), type: 'jpeg', quality: 85 }); };

// ---------- I1: karta trade'a z wykresem ----------
const ctx = await browser.newContext();
const page = await newPage(ctx, { theme: 'onyx' });
await shareTrade(page, TRADE);
await sh(page, 'format', '16:9');
// v2 (P43): krótki trade najpierw 1s, przy braku 1s drugie żądanie 1m; zmiana formatu bez nowego żądania
const n1 = cardReqs.length;
check('I1 żądania świec karty: 1 albo 2 (plan 1s → 1m), zmiana formatu bez nowego', n1 >= 1 && n1 <= 2, `${n1} ${cardReqs.map((u) => decodeURIComponent(u.split('?')[1])).join(' | ')}`);
const q1 = new URL(cardReqs[n1 - 1] || 'http://x/').searchParams;
check('I1 żądanie lokalne: jawny tf (bez tf=auto i maxBars), ES, kotwica trade\'a (tfrom/tto), B-ADJ wg ustawienia (domyślnie wł.)', /^\d+[sm]$/.test(q1.get('tf') || '') && !q1.get('maxBars') && q1.get('instrument') === 'ES' && q1.get('tfrom') && q1.get('tto') && q1.get('adjust') === '1', cardReqs.join(' '));
const hOn = await cardHash(page);
check('I1 karta trade\'a bez przełącznika krzywej kapitału', (await page.locator('.sh [data-sh="equity"]').count()) === 0);
await saveCard(page, 'I-1920-onyx-karta-wykres-trade.jpg');
await sh(page, 'metric', 'R');
check('I1 zmiana jednostki bez nowego żądania', cardReqs.length === n1, String(cardReqs.length));
// v2 (P46, P45): wygląd i rysunek w oknie bez nowego żądania, wybór zapisany w settings.chart
const hC = await cardHash(page);
await sh(page, 'style', 'line');
const hL = await cardHash(page);
await sh(page, 'draw', 'marks');
const hM = await cardHash(page);
let st0 = await settingsOf(page);
check('I1 (P46/P45) linia i znaczniki zmieniają kartę bez nowego żądania; wybór zapisany (shareStyle, shareDraw)', hC !== hL && hL !== hM && cardReqs.length === n1 && st0.chart?.shareStyle === 'line' && st0.chart?.shareDraw === 'marks', `${cardReqs.length} ${JSON.stringify({ s: st0.chart?.shareStyle, d: st0.chart?.shareDraw })}`);
// v2 (P52): wiersze danych: przełączenie zapisuje rowsTrade, czwarty wiersz, piąty zablokowany
await sh(page, 'row', 'dur');
st0 = await settingsOf(page);
const full = await page.evaluate(() => [...document.querySelectorAll('.sh [data-sh="row"]')].filter((b) => b.getAttribute('aria-pressed') !== 'true').every((b) => b.disabled));
check('I1 (P52) wiersze danych: zapis rowsTrade (4 z 4), pozostałe zablokowane', JSON.stringify(st0.chart?.rowsTrade) === JSON.stringify(['entry', 'exit', 'alt', 'dur']) && full, JSON.stringify(st0.chart?.rowsTrade));
await sh(page, 'row', 'dur'); await sh(page, 'style', 'candles'); await sh(page, 'draw', 'position');
// P54 (29.10.2026): «pokaz 6 najczestczszych i reszte pokaz wszystkie»
const rowsUi = () => page.evaluate(() => ({ n: document.querySelectorAll('.sh [data-sh="row"]').length, exp: document.querySelector('.sh [data-sh="rows-all"]')?.getAttribute('aria-expanded'), ids: [...document.querySelectorAll('.sh [data-sh="row"]')].map((b) => b.dataset.v) }));
let ru = await rowsUi();
check('I1 (P54) „Dane”: 6 pigułek i „Pokaż wszystkie” (aria-expanded=false)', ru.n === 6 && ru.exp === 'false', JSON.stringify(ru));
await sh(page, 'rows-all', 'toggle');
ru = await rowsUi();
const focusOk = await page.evaluate(() => document.activeElement?.dataset?.sh === 'rows-all');
check('I1 (P54) po „Pokaż wszystkie”: wszystkie pigułki, aria-expanded=true, fokus zostaje na przycisku', ru.n === 14 && ru.exp === 'true' && focusOk, JSON.stringify({ ...ru, focusOk }));
await sh(page, 'row', 'setup'); await sh(page, 'rows-all', 'toggle');
ru = await rowsUi();
check('I1 (P54) po „Zwiń”: szóstka + zaznaczony „Setup” spoza niej, aria-expanded=false', ru.n === 7 && ru.ids.includes('setup') && ru.exp === 'false', JSON.stringify(ru));
await sh(page, 'row', 'setup');
await sh(page, 'metric', '$');
await closeAll(page);

// ---------- I2: Ustawienia → Wykresy → Karty udostępniania ----------
await openSettings(page);
const ui = await page.evaluate(() => ({
  head: !!document.querySelector('.sp #ch-g-cards'), share: !!document.querySelector('.sp [data-chk="shareChart"]'), styles: [...document.querySelectorAll('.sp [data-act="ch-share-style"]')].map((b) => b.dataset.v),
  sl: !!document.querySelector('.sp [data-chk="slCard"]'), tp: !!document.querySelector('.sp [data-chk="tpCard"]'), eq: !!document.querySelector('.sp [data-chk="equity"]'),
  reset: !!document.querySelector('.sp [data-act="ch-reset"][data-v="cards"]'), film: document.querySelectorAll('.sp [data-chk^="film"], .sp [data-act^="ch-film"]').length,
}));
check('I2 grupa „Karty udostępniania” (v2): wykres ceny, styl (świece / linia), rysunek pozycji, bez SL/TP w kartach (P45), krzywa, reset; opcje filmów', ui.head && ui.share && ui.styles.join() === 'candles,line' && !ui.sl && !ui.tp && ui.eq && ui.reset && ui.film >= 3 && (await page.locator('.sp [data-act="ch-share-draw"]').count()) === 2, JSON.stringify(ui));
await spClick(page, '.sp [data-chk="shareChart"]'); await sleep(200);
let st = await settingsOf(page);
check('I2 „Wykres ceny w kartach” wyłączony: zapis settings.chart.shareChart, styl karty wyszarzony', st.chart?.shareChart === false && (await page.locator('.sp [data-act="ch-share-style"][disabled]').count()) === 2 && (await page.locator('.sp [data-act="ch-share-draw"][disabled]').count()) === 2, JSON.stringify(st.chart?.shareChart));
await closeSettings(page);

// ---------- I3: wyłączony przełącznik, reset, linia ----------
await shareTrade(page, TRADE);
await sh(page, 'format', '16:9');
const n3 = cardReqs.length;
check('I3 wyłączony: zero żądań świec z okna Udostępnij', n3 === 0, String(n3));
const hOff = await cardHash(page);
check('I3 wyłączony: karta bez wykresu (inne piksele niż z wykresem)', hOff !== hOn, `${hOff} ${hOn}`);
await closeAll(page);
await openSettings(page);
await spClick(page, '.sp [data-act="ch-share-draw"][data-v="marks"]'); await sleep(100);
await spClick(page, '.sp [data-act="ch-reset"][data-v="cards"]'); await sleep(200);
st = await settingsOf(page);
check('I3 „Przywróć domyślne (Karty)” (v2): wykres wł., rysunek „Pozycja”, styl świece, wiersze domyślne', st.chart?.shareChart === true && st.chart?.shareDraw === 'position' && st.chart?.shareStyle === 'candles' && JSON.stringify(st.chart?.rowsTrade) === JSON.stringify(['entry', 'exit', 'alt']), JSON.stringify(st.chart));
await spClick(page, '.sp [data-act="ch-share-style"][data-v="line"]'); await sleep(200);
st = await settingsOf(page);
check('I3 styl karty „Linia zamknięć” zapisany', st.chart?.shareStyle === 'line', st.chart?.shareStyle);
await closeSettings(page);
await shareTrade(page, TRADE);
await sh(page, 'format', '16:9');
const hLine = await cardHash(page);
check('I3 nowe okno: żądania świec (plan 1s → 1m), karta z linią (inne piksele niż świece i niż karta bez wykresu)', cardReqs.length >= 1 && cardReqs.length <= 2 && hLine !== hOn && hLine !== hOff, `${cardReqs.length}`);
await closeAll(page);
await openSettings(page); await spClick(page, '.sp [data-act="ch-reset"][data-v="cards"]'); await sleep(150); await closeSettings(page);

// ---------- I4: EURUSD ----------
await shareTrade(page, FX);
check('I4 EURUSD (brak źródła): zero żądań świec', cardReqs.length === 0, String(cardReqs.length));
await closeAll(page);

// ---------- I5: krzywa kapitału ----------
await openPeriodShare(page);
await sh(page, 'kind', 'week');
await sh(page, 'format', '16:9');
const eqOn = await page.locator('.sh [data-sh="equity"][data-v="on"][aria-pressed="true"]').count();
const hEq = await cardHash(page);
await sh(page, 'equity', 'off');
const hNoEq = await cardHash(page);
st = await settingsOf(page);
check('I5 przełącznik „Krzywa kapitału” w oknie: domyślnie wł., wyłączenie zmienia kartę, bez zapisu w Ustawieniach', eqOn === 1 && hEq !== hNoEq && st.chart?.equity !== false, `${eqOn} ${hEq} ${hNoEq} ${st.chart?.equity}`);
await closeAll(page);
await openSettings(page); await spClick(page, '.sp [data-chk="equity"]'); await sleep(150); await closeSettings(page);
await openPeriodShare(page);
await sh(page, 'kind', 'week');
check('I5 wartość początkowa z Ustawień (equity wył. → przełącznik „Nie”)', (await page.locator('.sh [data-sh="equity"][data-v="off"][aria-pressed="true"]').count()) === 1);
await closeAll(page);
await openSettings(page); await spClick(page, '.sp [data-act="ch-reset"][data-v="cards"]'); await sleep(150); await closeSettings(page);

// ---------- 375 px (Onyx): okno Udostępnij z kartą trade'a ----------
// okno otwierane przy 1920 px (lista trade'ów na telefonie ma inny układ wierszy), potem zwężenie do 375 px z otwartym oknem
await shareTrade(page, TRADE);
await sh(page, 'format', '9:16');
await page.setViewportSize({ width: 375, height: 812 }); await sleep(500);
const hs = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && [...document.querySelectorAll('.sh *')].every((e) => e.getBoundingClientRect().right <= window.innerWidth + 1));
check('375 px: okno Udostępnij bez poziomego przewijania', hs);
await shot(page, 'I-375-onyx-udostepnij-trade.jpg');
await closeAll(page);
await ctx.close();

// ---------- Platinum: krzywa kapitału (karta 16:9) i Ustawienia przy 375 px ----------
const ctxP = await browser.newContext();
const pp = await newPage(ctxP, { theme: 'platinum' });
check('Platinum: motyw jasny', (await pp.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'platinum');
await openPeriodShare(pp);
await sh(pp, 'kind', 'month');
await sh(pp, 'format', '16:9');
await saveCard(pp, 'I-1920-platinum-karta-krzywa.jpg');
check('Platinum: karta miesiąca z krzywą narysowana', (await pp.evaluate(() => { const c = document.querySelector('#sh-cv'); return !c.hidden && c.width === 1920 && c.height === 1080; })) && (await pp.locator('.sh [data-sh="equity"][data-v="on"][aria-pressed="true"]').count()) === 1);
await closeAll(pp);
await pp.setViewportSize({ width: 375, height: 812 }); await sleep(300);
await openSettings(pp);
await pp.locator('.sp #ch-g-cards').scrollIntoViewIfNeeded();
await sleep(200);
const hs2 = await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check('375 px Platinum: Ustawienia → Wykresy → Karty bez poziomego przewijania', hs2);
await shot(pp, 'I-375-platinum-ustawienia-karty.jpg');
await ctxP.close();

check('bez błędów strony', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed, 0 skipped`);
process.exit(failed ? 1 : 0);
