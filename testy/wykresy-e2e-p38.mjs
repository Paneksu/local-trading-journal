// Test E2E P38 (28.10.2026) w pełnej aplikacji (headless Chromium), uruchamiany OSOBNO od testy/run.mjs (wymaga Playwrighta, repo ma zero npm).
// Słowa użytkownika: «okej wedle naszej rozmowy  BADJ domyslnie wlaczony w ustawieniach przelacznik». Kotwica B-ADJ = kontrakt trade'a, B-ADJ także w trybie edycji.
// Trade testowy: „ES stary kontrakt po rollu (Kontrakt ESZ5)” (15.12.2025: pole Kontrakt = ESZ5, nowszy ESH6 jest wtedy ok. 55 pkt wyżej).
//   S1 B-ADJ domyślnie włączony, serwer zwraca kotwicę ESZ5, cena wejścia trafia w świecę wejścia (przed P38 świece ESZ5 były przesunięte o ok. 55 pkt),
//   S2 Ustawienia: przełącznik „B-ADJ domyślnie włączony” (domyślnie zaznaczony); wyłączony: nowy wykres startuje bez B-ADJ; po włączeniu znów z B-ADJ,
//   S3 edytor: przycisk B-ADJ aktywny, włączony; przełączenie w edytorze wysyła zapytanie bez/z adjust=1 i wraca; zmiana ceny wyjścia przy włączonym B-ADJ
//   zapisuje się w Notion w cenach kontraktu trade'a (wejście, SL, TP bez zmian, wyjście = wpisane), a świece po zapisie dalej są przeliczone do ESZ5.
// Uruchomienie: PW_CORE=<katalog playwright-core> [BASE=http://127.0.0.1:4399] node testy/wykresy-e2e-p38.mjs   (dashboard testowy z atrapą: dowody-rolla/start-4399.mjs)
// Port 4321 i prawdziwe Notion są zakazane. Wynik: linie ✓/✗ i podsumowanie „N passed, M failed, 0 skipped”.
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = (process.env.BASE || 'http://127.0.0.1:4399').replace(/\/$/, '');
if (/:4321\b/.test(BASE)) { console.error('Port 4321 to prawdziwy dashboard: ten test działa tylko na dashboardzie testowym.'); process.exit(2); }
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ' | ' + info}`); };
const num = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.'));
const rowOf = async (id) => (await (await fetch(`${BASE}/api/data?refresh=1`)).json()).data.trades.find((t) => t._id === id);

const TRADE = 'ES stary kontrakt po rollu';
const data = await (await fetch(`${BASE}/api/data`)).json();
const row0 = data.data.trades.find((t) => String(t.title).includes(TRADE));
if (!row0) { console.error('Brak trade\'a testowego w danych (uruchom start-4399.mjs).'); process.exit(2); }
const entrySec = Math.floor(Date.parse(row0.date.start ?? row0.date) / 1000), exitSec = Math.floor(Date.parse(row0.exit.start ?? row0.exit) / 1000);

const browser = await chromium.launch({ executablePath: findChrome() });
const errors = [];
async function open(ctx) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Trade'y/ }).first().click().catch(() => page.locator('text=/^Trade.y/').first().click());
  await page.locator('[data-act="preset"][data-v="all"]').first().click().catch(() => {});
  await page.locator('.row-btn', { hasText: TRADE }).first().click();
  await page.waitForSelector('.lb:not([hidden])');
  await page.waitForSelector('.lb-chart:not([hidden]) .swc-plot svg', { timeout: 30000 });
  await sleep(800);
  return page;
}
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Europe/Warsaw' });
const reqs = [];
ctx.on('request', (r) => { if (r.url().includes('/api/candles?')) reqs.push(r.url()); });

// ---- S1 ----
let page = await open(ctx);
const bj = () => page.locator('.lb-chart [data-swc="badj"]');
check('S1 B-ADJ domyślnie włączony', (await bj().getAttribute('aria-pressed')) === 'true');
const qs = { instrument: 'ES', from: String(entrySec - 600), to: String(entrySec + 600), tf: '1m', tfrom: String(entrySec), tto: String(exitSec), contract: row0.contract, adjust: '1' };
const jAdj = await (await fetch(`${BASE}/api/candles?${new URLSearchParams(qs)}`)).json();
const bar = (jAdj.bars || []).filter((b) => b[0] <= entrySec).pop();
check('S1 serwer: kontrakt trade\'a ESZ5 jest kotwicą', jAdj.contract?.code === 'ESZ5' && jAdj.adjust?.anchor === 'ESZ5', JSON.stringify({ c: jAdj.contract, a: jAdj.adjust }));
check('S1 cena wejścia trafia w świecę wejścia przy włączonym B-ADJ', bar && bar[3] <= row0.entryPrice && row0.entryPrice <= bar[2], JSON.stringify({ bar, entry: row0.entryPrice }));
check('S1 wykres w przeglądarce prosił o świece z adjust=1', reqs.some((u) => /adjust=1/.test(u)), reqs.slice(0, 3).join(' '));
await page.close();

// ---- S2: Ustawienia ----
page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.locator('#gear').click();
await page.locator('[data-act="sp-tab"][data-v="wykresy"]').click(); // P41: B-ADJ w zakładce Wykresy
const sw = page.locator('#sp-badj');
check('S2 Ustawienia: „B-ADJ domyślnie włączony” istnieje i jest zaznaczony', (await sw.count()) === 1 && (await sw.isChecked()));
await sw.setChecked(false, { force: true });
await sleep(400);
await page.keyboard.press('Escape').catch(() => {});
await page.close();
page = await open(ctx);
check('S2 po wyłączeniu w Ustawieniach nowy wykres startuje bez B-ADJ', (await bj().getAttribute('aria-pressed')) === 'false' && await page.locator('.lb-chart .swc-warn').isHidden());
await bj().click(); await sleep(1500);
check('S2 przycisk włącza widok chwilowo', (await bj().getAttribute('aria-pressed')) === 'true' && /przeliczone do kontraktu trade'a/.test(await page.locator('.lb-chart .swc-warn').innerText()));
await page.close();
page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.locator('#gear').click();
await page.locator('[data-act="sp-tab"][data-v="wykresy"]').click(); // P41: B-ADJ w zakładce Wykresy
await page.locator('#sp-badj').setChecked(true, { force: true });
await sleep(400);
await page.close();

// ---- S3: edytor ----
page = await open(ctx);
await page.locator('.lb-chart .swc-edit').click();
await page.waitForSelector('.lb-chart .swc-lwc canvas', { timeout: 20000 });
await sleep(1000);
check('S3 edytor: B-ADJ aktywny i włączony, ostrzeżenie widoczne', !(await bj().isDisabled()) && (await bj().getAttribute('aria-pressed')) === 'true' && await page.locator('.lb-chart .swc-warn').isVisible());
const n0 = reqs.length;
await bj().click(); await sleep(1800);
const off = reqs.slice(n0).filter((u) => /tf=\w+/.test(u));
check('S3 edytor: przełączenie wyłącza B-ADJ (zapytanie bez adjust), ostrzeżenie znika', (await bj().getAttribute('aria-pressed')) === 'false' && off.length > 0 && off.every((u) => !/adjust=1/.test(u)) && await page.locator('.lb-chart .swc-warn').isHidden(), off.join(' '));
const n1 = reqs.length;
await bj().click(); await sleep(1800);
const on = reqs.slice(n1);
check('S3 edytor: ponowne włączenie wysyła adjust=1 i pokazuje ostrzeżenie', (await bj().getAttribute('aria-pressed')) === 'true' && on.some((u) => /adjust=1/.test(u)) && await page.locator('.lb-chart .swc-warn').isVisible(), on.join(' '));
await page.locator('[data-act="lock"]').click();
await page.waitForSelector('.swc-style [data-tk="exitPrice"]');
const field = (k) => page.locator(`.swc-style [data-tk="${k}"]`);
const before = { entry: num(await field('entryPrice').inputValue()), exit: num(await field('exitPrice').inputValue()), sl: num(await field('sl').inputValue()) };
const newExit = before.exit + 1;
await field('exitPrice').fill(String(newExit).replace('.', ','));
await field('exitPrice').press('Enter');
await sleep(300);
await page.locator('.swc-style [data-act="tsave"]').click();
await sleep(1800);
const st = await page.locator('.swc-save').innerText();
const row1 = await rowOf(row0._id);
check('S3 zapis przy włączonym B-ADJ potwierdzony', /Zapisano pozycję/.test(st), `status «${st}»`);
check('S3 Notion: ceny w kontrakcie trade\'a: wyjście = wpisane, wejście/SL/TP bez zmian (bez przesunięcia o lukę rolla)',
  row1.exitPrice === newExit && row1.entryPrice === row0.entryPrice && row1.sl === row0.sl && row1.tp === row0.tp, `przed ${JSON.stringify({ e: row0.entryPrice, x: row0.exitPrice, sl: row0.sl, tp: row0.tp })} po ${JSON.stringify({ e: row1.entryPrice, x: row1.exitPrice, sl: row1.sl, tp: row1.tp })} wpisano ${newExit}`);
check('S3 po zapisie B-ADJ nadal włączony', (await bj().getAttribute('aria-pressed')) === 'true');
await page.close();
// przywrócenie danych testowych
try { await fetch(`${BASE}/api/trades/${row0._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-THQ': '1' }, body: JSON.stringify({ exitPrice: row0.exitPrice, edited: (await rowOf(row0._id))._edited }) }); } catch { /* dane testowe atrapy */ }
check('bez błędów strony', errors.length === 0, errors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed, 0 skipped`);
process.exit(failed ? 1 : 0);
