// Test E2E poprawek po przeglądzie D–F (28.10.2026) w pełnej aplikacji (headless Chromium), uruchamiany OSOBNO od testy/run.mjs, bo wymaga Playwrighta
// (repo ma zero npm). Sprawdza to, czego strona robocza z run.mjs nie widzi, czyli lightbox w app.js:
//   W2: edytor uruchamiany asynchronicznie nie przejmuje widoku innego trade'a ani zamkniętego lightboxa,
//   W6: nieudany odczyt rysunków blokuje edycję (inaczej pierwszy zapis kasuje rysunki w Notion),
//   W3: „Gotowe” przy nieudanym zapisie rysunków pyta o potwierdzenie,
//   P27: cudza zmiana trade'a w Notion przy otwartej edycji daje 409 przy zapisie cen z odblokowanej pozycji.
// Uruchomienie: dashboard testowy z atrapą (np. R:\PROJEKTY\trading-hq-wt\wykresy-wyniki\e2e-r\start-r.mjs → http://127.0.0.1:4399, atrapa 4398), potem
//   PW_CORE=<katalog z playwright-core> [BASE=http://127.0.0.1:4399] [MOCK=http://127.0.0.1:4398] node testy/wykresy-e2e-r.mjs
// Port 4321 i prawdziwe Notion są zakazane (skrypt odmawia). Wynik: linie ✓/✗ i podsumowanie „N passed, M failed”.
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = (process.env.BASE || 'http://127.0.0.1:4399').replace(/\/$/, '');
const MOCK = (process.env.MOCK || 'http://127.0.0.1:4398').replace(/\/$/, '');
if (/:4321\b/.test(BASE + MOCK)) { console.error('Port 4321 to prawdziwy dashboard: ten test działa tylko na dashboardzie testowym.'); process.exit(2); }
const PW_CORE = process.env.PW_CORE;
if (!PW_CORE) { console.error('Ustaw PW_CORE na katalog pakietu playwright-core.'); process.exit(2); }
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
const ONLY = (process.env.ONLY || 'W2,W6,W3,P27').split(',');
const want = (k) => ONLY.includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ' | ' + info}`); };
const browser = await chromium.launch({ executablePath: findChrome() });
const data = await (await fetch(`${BASE}/api/data`)).json();
const idOf = (part) => data.data.trades.find((t) => String(t.title).includes(part))?._id;
const TRADE_A = 'ES wygrana', TRADE_B = 'NQ wygrana TP';
const idA = idOf(TRADE_A);
if (!idA) { console.error('Brak trade\'a testowego w danych (uruchom start-r.mjs).'); process.exit(2); }

async function fresh(setup) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await setup?.(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Trade'y/ }).first().click().catch(() => page.locator('text=/^Trade.y/').first().click());
  return { ctx, page, errors };
}
// otwiera lightbox na trade'ie o podanej nazwie i czeka, aż podgląd wykresu będzie gotowy (przycisk „Edytuj wykres” widoczny)
async function openTrade(page, part) {
  await page.locator('.row-btn', { hasText: part }).first().click();
  await page.waitForSelector('.lb:not([hidden])');
  await page.waitForSelector('.lb-chart:not([hidden]) .swc-edit:not([hidden])', { timeout: 15000 });
}
// na wąskim ekranie narzędzia chowa przycisk „Rysuj”; na szerokim pasek jest zawsze widoczny
async function openTools(page) {
  if (await page.locator('[data-tool="horizontal-line"]').isVisible()) return;
  await page.locator('.swc-draw').click();
}
const caption = (page) => page.locator('.lb-cap').innerText();
const editorUp = (page) => page.locator('.lb-chart .swc-lwc').count();

// ---- W2: edytor ładuje się długo; w tym czasie użytkownik przechodzi do innego trade'a / zamyka lightbox ----
if (want('W2')) {
  const slow = async (page) => { await page.route('**/js/wykres.js', async (r) => { await sleep(2000); await r.continue(); }); };
  let { ctx, page, errors } = await fresh(slow);
  await openTrade(page, TRADE_A);
  await page.locator('.lb-chart .swc-edit').click();
  await sleep(300);
  await page.locator((await page.locator('.lb .next').isEnabled()) ? '.lb .next' : '.lb .prev').click();
  await sleep(3500);
  const cap = await caption(page);
  check('W2 przejście do innego trade\'a w trakcie startu edytora: edytor tamtego trade\'a nie przejmuje widoku', (await editorUp(page)) === 0 && !/ES wygrana/.test(cap), `edytor w widoku: ${await editorUp(page)}, podpis: ${cap}`);
  check('W2 bez błędów strony', errors.length === 0, errors.join(' | '));
  await ctx.close();
  ({ ctx, page, errors } = await fresh(slow));
  await openTrade(page, TRADE_A);
  await page.locator('.lb-chart .swc-edit').click();
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(3500);
  check('W2 zamknięcie lightboxa w trakcie startu edytora: edytor nie zostaje podpięty do ukrytego lightboxa', (await editorUp(page)) === 0, `edytorów: ${await editorUp(page)}`);
  await ctx.close();
}

// ---- W6: nieudany odczyt rysunków ----
if (want('W6')) {
  const { ctx, page } = await fresh(async (p) => { await p.route(/\/api\/drawings\/[0-9a-f-]{36}$/, (r) => r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Notion nie odpowiada' }) })); });
  await openTrade(page, TRADE_A);
  await page.locator('.lb-chart .swc-edit').click();
  await sleep(1500);
  check('W6 nieudany odczyt rysunków blokuje edycję (inaczej pierwszy zapis kasuje rysunki w Notion)', (await editorUp(page)) === 0, 'edytor wystartował z pustym dokumentem');
  const toast = await page.locator('#toast').innerText().catch(() => '');
  check('W6 komunikat mówi, co się stało i co zrobić', /rysunk/i.test(toast) && !(await page.locator('#toast').isHidden().catch(() => true)), `toast: «${toast}»`);
  check('W6 po powrocie sieci edycja da się uruchomić (ponowny odczyt)', await (async () => {
    await page.unroute(/\/api\/drawings\/[0-9a-f-]{36}$/);
    if ((await editorUp(page)) === 1) return false; // edytor już wystartował z pustym dokumentem (stan sprzed poprawki)
    await page.locator('.lb-chart .swc-edit').click();
    await page.waitForSelector('.lb-chart .swc-lwc', { timeout: 8000 }).catch(() => {});
    return (await editorUp(page)) === 1;
  })(), 'edycja nie wystartowała po przywróceniu odczytu');
  await ctx.close();
}

// ---- W3: „Gotowe” przy nieudanym zapisie (pełna aplikacja) ----
if (want('W3')) {
  const { ctx, page } = await fresh(async (p) => { await p.route('**/api/drawings/save', (r) => r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Notion nie odpowiada' }) })); });
  await openTrade(page, TRADE_A);
  await page.locator('.lb-chart .swc-edit').click();
  await page.waitForSelector('.lb-chart .swc-lwc canvas');
  await openTools(page);
  await page.locator('[data-tool="horizontal-line"]').click();
  const box = await page.locator('.lb-chart .swc-lwc').boundingBox();
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.45);
  await sleep(2600);
  const st = await page.locator('.swc-save').innerText();
  check('W3 nieudany zapis jest widoczny przy wykresie', /nie odpowiada|błąd|nie udało/i.test(st), `status: «${st}»`);
  await page.locator('.swc-done').click();
  await sleep(600);
  check('W3 „Gotowe” przy nieudanym zapisie pyta o potwierdzenie i nie zamyka edycji', (await page.locator('.scrim [data-cd="yes"]').count()) === 1 && (await editorUp(page)) === 1, 'brak okna potwierdzenia albo edycja zamknięta');
  await ctx.close();
}

// ---- P27: cudza zmiana trade'a w Notion przy otwartej edycji ----
if (want('P27')) {
  const { ctx, page } = await fresh();
  await openTrade(page, TRADE_A);
  await page.locator('.lb-chart .swc-edit').click();
  await page.waitForSelector('.lb-chart .swc-lwc canvas');
  const draw = async (fx, fy) => {
    await openTools(page);
    await page.locator('[data-tool="horizontal-line"]').click();
    const box = await page.locator('.lb-chart .swc-lwc').boundingBox();
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  };
  const saved = async () => { for (let i = 0; i < 30; i++) { if (/Zapisano\./.test(await page.locator('.swc-save').innerText())) return true; await sleep(300); } return false; };
  await draw(0.3, 0.4);
  check('P27 zapis rysunków (przed zmianą w Notion)', await saved(), await page.locator('.swc-save').innerText());
  await fetch(`${MOCK}/__test/notion-edit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer x' }, body: JSON.stringify({ id: idA, set: { Notatki: 'zmiana zrobiona w Notion przy otwartej edycji' } }) });
  await page.locator('.swc-save').evaluate((el) => { el.textContent = ''; });
  await draw(0.6, 0.5);
  check('P27 zapis rysunków po zmianie w Notion', await saved(), await page.locator('.swc-save').innerText());
  await page.locator('[data-act="lock"]').click();
  await page.waitForSelector('.swc-style [data-tk="sl"]');
  const sl = page.locator('.swc-style [data-tk="sl"]');
  const cur = Number(String(await sl.inputValue()).replace(',', '.'));
  await sl.fill(String(cur - 1).replace('.', ',')); await sl.dispatchEvent('change');
  await page.locator('.swc-style [data-act="tsave"]').click();
  await sleep(1500);
  const msg = await page.locator('.swc-tmsg').innerText({ timeout: 2000 }).catch(() => '');
  check('P27 zmiana trade\'a w Notion przy otwartej edycji: zapis cen daje zrozumiały konflikt, nie nadpisuje', /zmieniono w Notion/.test(msg), `komunikat: «${msg}»`);
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed, 0 skipped`);
process.exit(failed ? 1 : 0);
