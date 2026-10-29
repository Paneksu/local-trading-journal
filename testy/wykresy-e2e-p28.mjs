// Test E2E P28 (28.10.2026) w pełnej aplikacji (headless Chromium), uruchamiany OSOBNO od testy/run.mjs (wymaga Playwrighta; repo ma zero npm).
// Słowa użytkownika: «dopracuj i zrob te 3 pkt». Prawdziwą myszą w lightboxie: odblokowanie pozycji trade'a, przeciągnięcie kropki wyjścia
// (cena i czas wyjścia), lista zmian przed zapisem, zapis tą samą trasą co formularz (PATCH, 409 nietknięte), R z cen w Notion (atrapa),
// czas wyjścia przyciągnięty do świecy, P&L bez zmian, po zapisie pozycja zablokowana, podpis i fakty lightboxa odświeżone, podgląd po „Gotowe”.
// Uruchomienie: dashboard testowy z atrapą (R:\PROJEKTY\trading-hq-wt\wykresy-wyniki\e2e-r\start-r.mjs → http://127.0.0.1:4399, atrapa 4398), potem
//   PW_CORE=<katalog z playwright-core> [BASE=http://127.0.0.1:4399] [SHOTS=<katalog zrzutów>] node testy/wykresy-e2e-p28.mjs
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
const num = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.'));
const rowOf = async (id) => (await (await fetch(`${BASE}/api/data?refresh=1`)).json()).data.trades.find((t) => t._id === id);

const TRADE = 'ES wygrana';
const data = await (await fetch(`${BASE}/api/data`)).json();
const id = data.data.trades.find((t) => String(t.title).includes(TRADE))?._id;
if (!id) { console.error('Brak trade\'a testowego w danych (uruchom start-r.mjs).'); process.exit(2); }
const row0 = await rowOf(id);

const browser = await chromium.launch({ executablePath: findChrome() });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Europe/Warsaw' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /^Trade'y/ }).first().click().catch(() => page.locator('text=/^Trade.y/').first().click());
await page.locator('.row-btn', { hasText: TRADE }).first().click();
await page.waitForSelector('.lb:not([hidden])');
await page.waitForSelector('.lb-chart:not([hidden]) .swc-edit:not([hidden])', { timeout: 15000 });
await page.locator('.lb-chart .swc-edit').click();
await page.waitForSelector('.lb-chart .swc-lwc canvas');
await sleep(400);
await page.locator('[data-act="lock"]').click();
await page.waitForSelector('.swc-style [data-tk="exitPrice"]');
const field = (k) => page.locator(`.swc-style [data-tk="${k}"]`).inputValue();
const entry0 = num(await field('entryPrice')), exit0 = num(await field('exitPrice')), sl0 = num(await field('sl'));
check('P28-1 po odblokowaniu pole wyjścia ma cenę wyjścia trade\'a', exit0 === row0.exitPrice, `pole ${exit0}, trade ${row0.exitPrice}`);

// kropka wyjścia: szukamy jej tak, jak użytkownik kursorem (podświetlenie uchwytu), potem przeciągamy prawdziwą myszą
const dot = await page.evaluate(() => {
  const plot = document.querySelector('.lb-chart .swc-plot'), r = plot.getBoundingClientRect();
  for (let y = 4; y < r.height - 30; y += 6) for (let x = 4; x < r.width - 60; x += 6) {
    plot.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + x, clientY: r.top + y, buttons: 0 }));
    if (plot.dataset.exitHover === '1') return { x: r.left + x, y: r.top + y };
  }
  return null;
});
check('P28-1 kropka wyjścia jest uchwytem (kursor nad nią zmienia się na „chwyć”)', !!dot, 'nie znaleziono uchwytu');
if (dot) {
  await page.mouse.move(dot.x, dot.y);
  await page.mouse.down();
  await page.mouse.move(dot.x + 70, dot.y - 40, { steps: 12 });
  await page.mouse.up();
  await sleep(300);
}
const exit1 = num(await field('exitPrice')), entry1 = num(await field('entryPrice'));
check('P28-1 przeciągnięcie kropki zmienia cenę wyjścia (tick 0,25), wejście bez zmian', exit1 !== exit0 && Math.abs(exit1 * 4 - Math.round(exit1 * 4)) < 1e-9 && entry1 === entry0, `wyjście ${exit0} → ${exit1}, wejście ${entry0} → ${entry1}`);
const diff = await page.locator('.swc-style .swc-tdiff').innerText();
check('P28-3 przed zapisem panel pokazuje, co się zmieni (wyjście, czas wyjścia; P32: bez R)', /Wyjście/.test(diff) && /Czas wyjścia/.test(diff) && !/\bR\b/.test(diff) && diff.includes('→'), `«${diff}»`);
if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'P28-1440-pozycja-przed-zapisem.jpg'), type: 'jpeg', quality: 80 });

await page.locator('.swc-style [data-act="tsave"]').click();
await sleep(1500);
const st = await page.locator('.swc-save').innerText();
check('P28 zapis pozycji potwierdzony przy wykresie', /Zapisano pozycję/.test(st), `status «${st}»`);
check('P28 po zapisie pozycja wraca do blokady', (await page.locator('[data-act="lock"]').getAttribute('aria-pressed')) === 'false' && (await page.locator('.swc-style [data-tk]').count()) === 0, 'pozycja nadal odblokowana');
const row1 = await rowOf(id);
const dir = row0.tp != null ? (row0.tp >= row0.entryPrice ? 1 : -1) : (row0.sl <= row0.entryPrice ? 1 : -1);
const rWant = Math.round(((exit1 - entry0) * dir / Math.abs(entry0 - sl0)) * 100) / 100;
check('P32-8 Notion: R bez zmian po zapisie pozycji (ręczne), wyjście z rysunku', row1.r === row0.r && row1.exitPrice === exit1, `R ${row0.r} → ${row1.r} (z cen byłoby ${rWant}), wyjście ${row1.exitPrice}`);
check('P28-2 Notion: P&L bez zmian (trade nie ma liczby kontraktów)', row1.pnl === row0.pnl, `${row0.pnl} → ${row1.pnl}`);
const ex0 = new Date(row0.exit).getTime(), ex1 = new Date(row1.exit).getTime(), at0 = new Date(row0.date).getTime(), at1 = new Date(row1.date).getTime();
check('P28-3 Notion: czas wyjścia przesunięty w prawo, na początku świecy (pełna minuta), z przesunięciem strefy; wejście bez zmian',
  ex1 > ex0 && ex1 % 60000 === 0 && /[+-]\d\d:\d\d$/.test(row1.exit) && at1 === at0, `wyjście ${row0.exit} → ${row1.exit}, wejście ${row0.date} → ${row1.date}`);
const cap = await page.locator('.lb-cap').innerText();
const rTxt = (rWant >= 0 ? '+' : '−') + String(Math.abs(rWant)).replace('.', ',');
const rOld = (row0.r >= 0 ? '+' : '−') + String(Math.abs(row0.r)).replace('.', ',');
check('P32-8 podpis lightboxa z niezmienionym, ręcznym R', cap.includes(rOld) && !cap.includes(rTxt), `podpis «${cap}», ręczne ${rOld}, z cen byłoby ${rTxt}`);
const hm = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' }).format(new Date(ex1));
check('P28 fakty lightboxa z nowym czasem wyjścia', (await page.locator('.lb-facts').innerText()).includes(hm), `szukano ${hm}`);

await page.locator('.swc-done').click();
await page.waitForSelector('.lb-chart svg .lvl-d.exit', { timeout: 10000 }).catch(() => {});
check('P28 podgląd po „Gotowe” ma kropkę wyjścia', (await page.locator('.lb-chart svg circle.lvl-d.exit').count()) >= 1, 'brak kropki wyjścia w podglądzie');
check('P28 bez błędów strony i konsoli', errors.length === 0, errors.join(' | '));
if (SHOTS) {
  await page.setViewportSize({ width: 375, height: 812 });
  await sleep(500);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check('P28 375 px: bez przewijania w bok', sw <= 375, `scrollWidth ${sw}`);
}
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed, 0 skipped`);
process.exit(failed ? 1 : 0);
