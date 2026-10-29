// Test E2E P29 (28.10.2026) w pełnej aplikacji (headless Chromium), uruchamiany OSOBNO od testy/run.mjs (wymaga Playwrighta; repo ma zero npm).
// Słowa użytkownika (28.10.2026): miniatury «tylko szerokosc wykresu taka jaka byla dlugosc trade oraz deliaktnie rozszczweszyc o 2-3 swieczki» (wzór: «trade 26 paź
// 14:50 ES break even (test D)»), bez miniatur w „Ostatnie trade'y”; «nie da sie przesunac myszka poziomu be»; ustawienia rysunku pod zębatką (okienko / panel
// przypięty); «glowny pokaz trade to ma byc wykres, drugorzedne sa zrzuty»; schowanie szczegółów i strzałki w górnej linii między numerem a zamknięciem.
// Uruchomienie: dashboard testowy z atrapą (R:\PROJEKTY\trading-hq-wt\wykresy-wyniki\e2e-r\start-r.mjs → http://127.0.0.1:4399, atrapa 4398), potem
//   PW_CORE=<katalog z playwright-core> [PW_CHROME=<chrome-headless-shell.exe>] [BASE=http://127.0.0.1:4399] [SHOTS=<katalog zrzutów>] node testy/wykresy-e2e-p29.mjs
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
const rowOf = async (id) => (await (await fetch(`${BASE}/api/data?refresh=1`)).json()).data.trades.find((t) => t._id === id);

const data = await (await fetch(`${BASE}/api/data`)).json();
const byTitle = (s) => data.data.trades.find((t) => String(t.title).includes(s));
const BE_T = byTitle('ES break even'), WIN = byTitle('ES wygrana'), FX = byTitle('EURUSD');
if (!BE_T || !WIN) { console.error('Brak trade\'ów testowych w danych (uruchom start-r.mjs).'); process.exit(2); }

const browser = await chromium.launch({ executablePath: findChrome() });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1000 }, timezoneId: 'Europe/Warsaw' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
const minis = [];
page.on('response', async (r) => {
  const u = new URL(r.url());
  if (u.pathname !== '/api/candles' || !u.searchParams.get('from')) return;
  try { const j = await r.json(); minis.push({ tf: u.searchParams.get('tf'), from: Number(u.searchParams.get('from')), to: Number(u.searchParams.get('to')), n: (j.bars || []).length }); } catch { /* odpowiedź bez JSON */ }
});
await page.goto(BASE, { waitUntil: 'networkidle' });

// ===== P29-1: miniatury =====
check('P29-1 panel „Ostatnie trade\'y” bez miniatur', (await page.locator('.mini-list .swc-mini').count()) === 0, `${await page.locator('.mini-list .swc-mini').count()} miniatur w panelu`);
await page.locator('[data-act="view"][data-v="trades"]:visible').first().click();
await page.waitForSelector('.tt .swc-mini.is-chart', { timeout: 15000 }).catch(() => {});
await sleep(800);
const at = Math.floor(new Date(BE_T.date).getTime() / 1000);
const ex = Math.floor(new Date(BE_T.exit).getTime() / 1000), mins = (ex - at) / 60;
const m = minis.find((x) => x.from === at - 180 && x.tf === '1m');
check(`P29-1 miniatura wzorcowego trade'a (ES break even, ${mins} min): 1m, od 3 świec przed wejściem do 3 po wyjściu (${mins + 7} świec)`, m && m.n === mins + 7 && m.to === ex + 4 * 60, JSON.stringify(minis.slice(0, 8)));
check('P29-1 żadna miniatura nie prosi o tf=auto, każda ma najwyżej 16 + 7 świec', minis.length > 0 && minis.every((x) => x.tf !== 'auto' && x.n <= 23), JSON.stringify(minis));
check('P29-1 lista trade\'ów ma miniatury wykresów', (await page.locator('.tt .swc-mini.is-chart svg').count()) >= 3, `${await page.locator('.tt .swc-mini.is-chart svg').count()}`);
if (SHOTS) await page.locator('.tt-card').screenshot({ path: path.join(SHOTS, 'P29-1920-lista-miniatury.jpg'), type: 'jpeg', quality: 85 });

// ===== P29-6 i P29-7: okno trade'a =====
await page.locator('.row-btn', { hasText: 'ES wygrana' }).first().click();
await page.waitForSelector('.lb:not([hidden])');
await sleep(500);
const modeBtns = await page.locator('.lb-mode button').allInnerTexts();
check('P29-6 przełącznik widoku: Wykres | Zrzuty, domyślnie Wykres', modeBtns.join('|') === 'Wykres|Zrzuty' && (await page.locator('.lb-mode [data-v="chart"]').getAttribute('aria-pressed')) === 'true' && await page.locator('.lb-chart').isVisible(), modeBtns.join('|'));
const box = async (s) => page.locator(s).boundingBox();
const [cnt, prev, next, det, close] = [await box('.lb-count'), await box('.lb-top .lb-nav.prev'), await box('.lb-top .lb-nav.next'), await box('.lb-det'), await box('.lb-close')];
const cy = (b) => b.y + b.height / 2;
check('P29-7 strzałki w górnej linii między numerem a zamknięciem, nie po bokach wykresu',
  prev && next && cnt.x + cnt.width < prev.x && prev.x < next.x && next.x < close.x && Math.abs(cy(prev) - cy(close)) < 4 && Math.abs(cy(cnt) - cy(prev)) < 6 && (await page.locator('.lb-stage .lb-nav').count()) === 0,
  JSON.stringify({ cnt, prev, next, close }));
const cnt0 = await page.locator('.lb-count').innerText();
const fwd = await page.locator('.lb-top .lb-nav.next').isEnabled();
await page.locator(fwd ? '.lb-top .lb-nav.next' : '.lb-top .lb-nav.prev').click(); await sleep(400);
const cnt1 = await page.locator('.lb-count').innerText();
await page.keyboard.press(fwd ? 'ArrowLeft' : 'ArrowRight'); await sleep(400);
check('P29-7 strzałka i klawisz ← → przechodzą między trade\'ami', cnt1 !== cnt0 && (await page.locator('.lb-count').innerText()) === cnt0, `${cnt0} → ${cnt1} → ${await page.locator('.lb-count').innerText()}`);
const h0 = (await box('.lb-stage')).height;
await page.locator('.lb-det').click(); await sleep(400);
const h1 = (await box('.lb-stage')).height;
check('P29-7 „Schowaj szczegóły”: szczegóły znikają, wykres zajmuje całą wysokość', !(await page.locator('.lb-info').isVisible()) && h1 > h0 + 100 && (await page.locator('.lb-det').getAttribute('aria-pressed')) === 'true', `${h0} → ${h1}`);
await page.locator('.lb-close').click(); await sleep(200);
await page.locator('.row-btn', { hasText: 'ES wygrana' }).first().click(); await sleep(500);
check('P29-7 schowane szczegóły zapamiętane po ponownym otwarciu', !(await page.locator('.lb-info').isVisible()), 'szczegóły znów widoczne');
await page.locator('.lb-mode [data-v="shots"]').click(); await sleep(300);
check('P29-7 przy zrzutach szczegóły też schowane, zrzut na całą wysokość', !(await page.locator('.lb-info').isVisible()) && (await box('.lb-stage')).height > h0 + 100, 'szczegóły widoczne');
await page.locator('.lb-mode [data-v="chart"]').click(); await sleep(500);

// ===== edycja: panel przypięty (komputer), zębatka, okienko =====
await page.waitForSelector('.lb-chart .swc-edit:not([hidden])', { timeout: 15000 });
await page.locator('.lb-chart .swc-edit').click();
await page.waitForSelector('.lb-chart .swc-lwc canvas');
await sleep(500);
check('P29-7 w edycji szczegóły też schowane (wykres na całą wysokość)', !(await page.locator('.lb-info').isVisible()), 'szczegóły widoczne w edycji');
const panel = page.locator('.swc-style');
const plotBox0 = await box('.swc-plot');
// P32 (28.10.2026): panel przypięty nie stoi od startu, otwiera go zębatka przy rysunku (słowa użytkownika w testy/wykresy-17-p32.mjs)
check('P29-4 komputer (P32): panel przypięty schowany do kliknięcia zębatki', !(await panel.isVisible()), await panel.innerText().catch(() => ''));
// prostokąt prawdziwą myszą
await page.locator('[data-tool="rectangle"]').click();
const pb = await box('.swc-plot');
const r0 = { x: pb.x + pb.width * 0.55, y: pb.y + pb.height * 0.35 }, r1 = { x: pb.x + pb.width * 0.68, y: pb.y + pb.height * 0.5 };
await page.mouse.click(r0.x, r0.y); await sleep(100); await page.mouse.click(r1.x, r1.y); await sleep(300);
await page.locator('.swc-gear').click(); await sleep(200); // P32: zębatka otwiera panel przypięty
check('P29-4 (P32) panel przypięty po zębatce z lewej, z X', (await panel.getAttribute('data-dock')) === 'pin' && await panel.isVisible() && (await page.locator('.swc-style [data-act="pclose"]').count()) === 1, await panel.getAttribute('data-dock'));
const groups = await page.locator('.swc-style .swc-grp > .lbl').allInnerTexts();
check('P29-4 zaznaczony prostokąt: panel przypięty pokazuje grupy Obramowanie, Wypełnienie, Tekst', groups.join('|').toLowerCase() === 'obramowanie|wypełnienie|tekst', groups.join('|'));
const plotBox1 = await box('.swc-plot');
check('P29-4 panel przypięty nie zmienia rozmiaru wykresu', JSON.stringify(plotBox0) === JSON.stringify(plotBox1), `${JSON.stringify(plotBox0)} → ${JSON.stringify(plotBox1)}`);
if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'P29-1920-panel-przypiety.jpg'), type: 'jpeg', quality: 80 });
// odpięcie → okienko; klik obok zamyka; najechanie na rysunek → zębatka → okienko
await page.locator('.swc-style [data-act="pdock"]').click(); await sleep(200);
check('P29-4 „Odepnij”: okienko z tym samym rysunkiem', (await panel.getAttribute('data-dock')) === 'pop' && await panel.isVisible(), await panel.getAttribute('data-dock'));
await page.mouse.click(pb.x + pb.width * 0.25, pb.y + pb.height * 0.8); await sleep(300);
check('P29-4 klik obok zamyka okienko', !(await panel.isVisible()), 'okienko widoczne');
await page.mouse.move((r0.x + r1.x) / 2, (r0.y + r1.y) / 2, { steps: 4 }); await sleep(200);
const gearVisible = await page.locator('.swc-gear').isVisible();
check('P29-4 najechanie na rysunek pokazuje zębatkę', gearVisible, 'brak zębatki');
if (gearVisible) {
  const g = await box('.swc-gear');
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2, { steps: 6 }); await sleep(150);
  await page.mouse.click(g.x + g.width / 2, g.y + g.height / 2); await sleep(300);
}
check('P29-4 klik w zębatkę otwiera okienko ustawień', await panel.isVisible() && (await panel.getAttribute('data-dock')) === 'pop', 'okienko zamknięte');
const hb = await box('.swc-style .swc-ph');
if (hb) { await page.mouse.move(hb.x + 30, hb.y + 12); await page.mouse.down(); await page.mouse.move(hb.x - 200, hb.y + 60, { steps: 8 }); await page.mouse.up(); await sleep(200); }
const hb2 = await box('.swc-style .swc-ph');
check('P29-4 okienko przesuwa się za nagłówek', hb && hb2 && Math.abs(hb2.x - (hb.x - 230)) <= 2, `${hb && hb.x} → ${hb2 && hb2.x}`);
if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'P29-1920-okienko.jpg'), type: 'jpeg', quality: 80 });
await page.keyboard.press('Escape'); await sleep(150);
check('P29-4 Esc zamyka okienko, nie okno trade\'a', !(await panel.isVisible()) && await page.locator('.lb').isVisible(), 'stan po Esc');

// ===== P29-3: BE przeciągany myszą na pozycji trade'a =====
const row0 = await rowOf(WIN._id);
await page.locator('[data-act="lock"]').click();
await page.waitForSelector('.swc-style [data-tk="be"]');
const handle = await page.evaluate(() => {
  const plot = document.querySelector('.lb-chart .swc-plot'), r = plot.getBoundingClientRect();
  for (let y = 4; y < r.height - 30; y += 2) for (let x = 4; x < r.width - 60; x += 8) {
    plot.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + x, clientY: r.top + y, buttons: 0 }));
    if (plot.dataset.exitHover === 'be') return { x: r.left + x, y: r.top + y };
  }
  return null;
});
check('P29-3 linia BE odblokowanej pozycji to uchwyt (kursor góra-dół)', !!handle, 'nie znaleziono uchwytu BE');
const be0 = await page.locator('.swc-style [data-tk="be"]').inputValue();
if (handle) { await page.mouse.move(handle.x, handle.y); await page.mouse.down(); await page.mouse.move(handle.x + 10, handle.y - 25, { steps: 10 }); await page.mouse.up(); await sleep(300); }
const be1 = await page.locator('.swc-style [data-tk="be"]').inputValue();
check('P29-3 przeciągnięcie zmienia pole BE (tick 0,25)', be1 !== be0 && Number(be1.replace(',', '.')) * 4 % 1 === 0, `${be0} → ${be1}`);
await page.locator('.swc-style [data-act="tsave"]').click(); await sleep(1500);
const row1 = await rowOf(WIN._id);
check('P29-3 zapis tą samą ścieżką: Notion ma nowe BE, reszta pozycji bez zmian', row1.be === Number(be1.replace(',', '.')) && row1.sl === row0.sl && row1.entryPrice === row0.entryPrice, `BE ${row0.be} → ${row1.be}`);
await page.locator('.swc-done').click(); await sleep(800);

// ===== P29-6: instrument bez źródła świec: zrzuty =====
if (FX) {
  await page.locator('.lb-close').click(); await sleep(200);
  await page.locator('.row-btn', { hasText: 'EURUSD' }).first().click(); await sleep(800);
  check('P29-6 EURUSD (bez źródła świec) otwiera się na zrzutach', (await page.locator('.lb-mode [data-v="shots"]').getAttribute('aria-pressed')) === 'true' && !(await page.locator('.lb-chart').isVisible()), 'widok wykresu');
}

// ===== telefon 375 =====
await page.locator('.lb-close').click(); await sleep(200);
await page.setViewportSize({ width: 375, height: 812 });
await sleep(400);
await page.locator('.tcard', { hasText: 'ES break even' }).first().click().catch(() => page.locator('[data-act="trade-open"]').first().click());
await sleep(900);
const sw = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.querySelector('.lb').scrollWidth));
const top = await box('.lb-top');
check('P29 375 px: okno trade\'a bez przewijania w bok, górna linia w jednym wierszu', sw <= 375 && top.height < 60 && (await box('.lb-close')).x + 30 <= 375, `scrollWidth ${sw}, top ${JSON.stringify(top)}`);
check('P29 375 px: szczegóły schowane, wykres na całą wysokość', !(await page.locator('.lb-info').isVisible()) && (await box('.lb-stage')).height > 600, `${(await box('.lb-stage')).height}`);
if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'P29-375-lightbox-bez-szczegolow.jpg'), type: 'jpeg', quality: 80 });

check('P29 bez błędów strony i konsoli', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed, 0 skipped`);
process.exit(failed ? 1 : 0);
