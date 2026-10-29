// Test E2E P35 (28.10.2026) w pełnej aplikacji (headless Chromium), uruchamiany OSOBNO od testy/run.mjs (wymaga Playwrighta, repo ma zero npm).
// Słowa użytkownika: «Tak żeby było jak najbardziej poprawnie», «Opcja, domyślnie wył.», «Tak, pole „Kontrakt”». Sprawdza na trade'ie z tygodnia rolla
// (ES 12.12.2025, Kontrakt ESH6, dashboard testowy z atrapą: wykresy-wyniki/e2e-r/start-r.mjs):
//   K1 znacznik zmiany kontraktu z nazwami („ESZ5 → ESH6”) na początku sesji trade'a z polem ESH6 (po niej weekend bez świec i od poniedziałku ESH6
//   wg pomiaru, więc bez pary znaczników tam i z powrotem), K2 trade trafia w świece dzięki polu
//   (piątek 12.12.2025: przewaga obrotu ESH6 dopiero w poniedziałek 15.12, więc seria wg reguły pokazuje tam ESZ5 ~55 pkt niżej),
//   K3 wybór kontraktu na wykresie zapisuje pole „Kontrakt” (PATCH) i przerysowuje świece, K4 B-ADJ domyślnie wyłączony, po włączeniu wyraźne
//   ostrzeżenie, wybór zapamiętany po przeładowaniu; edycja wyłącza go na czas edycji.
// Uruchomienie: PW_CORE=<katalog playwright-core> [BASE=http://127.0.0.1:4399] [MOCK=http://127.0.0.1:4398] [SHOTS=<katalog zrzutów>] node testy/wykresy-e2e-p35.mjs
// Port 4321 i prawdziwe Notion są zakazane (skrypt odmawia). Wynik: linie ✓/✗ i podsumowanie „N passed, M failed, 0 skipped”.
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = (process.env.BASE || 'http://127.0.0.1:4399').replace(/\/$/, '');
const MOCK = (process.env.MOCK || 'http://127.0.0.1:4398').replace(/\/$/, '');
if (/:4321\b/.test(BASE + MOCK)) { console.error('Port 4321 to prawdziwy dashboard: ten test działa tylko na dashboardzie testowym.'); process.exit(2); }
const PW_CORE = process.env.PW_CORE;
if (!PW_CORE) { console.error('Ustaw PW_CORE na katalog pakietu playwright-core.'); process.exit(2); }
const SHOTS = process.env.SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
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
const TRADE = 'ES tydzień rolla';
const data = await (await fetch(`${BASE}/api/data`)).json();
const row = data.data.trades.find((t) => String(t.title).includes(TRADE));
if (!row) { console.error('Brak trade\'a z tygodnia rolla w danych (uruchom start-r.mjs po imporcie okien rolli).'); process.exit(2); }
const mockContract = async () => {
  const pages = await (await fetch(`${MOCK}/__test/pages?ds=trades`, { headers: { Authorization: 'Bearer x' } })).json();
  const p = pages.find((x) => x.id === row._id)?.p;
  return (p?.Kontrakt?.rich_text || []).map((x) => x.text?.content ?? x.plain_text ?? '').join('');
};

const browser = await chromium.launch({ executablePath: findChrome() });
async function fresh(ctx0) {
  const ctx = ctx0 || await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Trade'y/ }).first().click().catch(() => page.locator('text=/^Trade.y/').first().click());
  await page.locator('[data-act="preset"][data-v="all"]').first().click(); // trade z grudnia 2025: poza domyślnym okresem
  await page.locator('.row-btn', { hasText: TRADE }).first().click();
  await page.waitForSelector('.lb:not([hidden])');
  await page.waitForSelector('.lb-chart:not([hidden]) .swc-edit:not([hidden])', { timeout: 20000 });
  return { ctx, page, errors };
}
const setTf = async (page, tf) => { await page.locator(`.lb-chart [data-swc-tf="${tf}"]`).first().click().catch(async () => { const i = page.locator('.lb-chart .swc-own input'); await i.fill(tf); await i.press('Enter'); }); await sleep(1200); };

// ---- K1, K2: znacznik i trafienie w świece ----
let { ctx, page, errors } = await fresh();
await setTf(page, '1h');
// kadr z rollem rynku (11.12.2025 sesja od 10.12 23:00 UTC): oddal kółkiem, aż znacznik będzie w kadrze
for (let i = 0; i < 14 && !(await page.locator('.lb-chart svg .roll-l').count()); i++) { await page.locator('.lb-chart .swc-plot').hover(); await page.mouse.wheel(0, 400); await sleep(250); }
const labels = await page.locator('.lb-chart svg .roll-l').allTextContents();
check('K1 znacznik zmiany kontraktu z nazwami „ESZ5 → ESH6”, bez pustej pary „ESH6 → ESZ5” przez weekend', labels.includes('ESZ5 → ESH6') && !labels.includes('ESH6 → ESZ5'), JSON.stringify(labels));
const pos = await page.locator('.lb-chart svg .roll-l').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.top]; }));
check('K1 napisy znaczników nie nachodzą na siebie', pos.every((a, i) => pos.every((b, j) => i === j || a[2] !== b[2] || a[1] <= b[0] || b[1] <= a[0])), JSON.stringify(pos));
if (SHOTS) await page.locator('.lb-chart').screenshot({ path: path.join(SHOTS, 'P35-znacznik-ESZ5-ESH6.png') });
// K2: cena wejścia trade'a w zakresie świecy 1m wejścia, w kontrakcie wyświetlanym (API, ten sam zapytanie co wykres)
const entry = Math.floor(Date.parse(row.date.start ?? row.date) / 1000);
const q = new URLSearchParams({ instrument: 'ES', from: String(entry - 600), to: String(entry + 600), tf: '1m', tfrom: String(entry), tto: String(Math.floor(Date.parse(row.exit.start ?? row.exit) / 1000)), contract: 'ESH6' });
const c = await (await fetch(`${BASE}/api/candles?${q}`)).json();
const bar = (c.bars || []).find((b) => b[0] === Math.floor(entry / 60) * 60);
const ep = row.entryPrice;
check('K2 trade z tygodnia rolla trafia w świece (cena wejścia w zakresie świecy 1m wejścia)', bar && ep >= bar[3] && ep <= bar[2], `wejście ${ep}, świeca ${JSON.stringify(bar)}`);
const zq = new URLSearchParams({ instrument: 'ES', from: String(entry - 600), to: String(entry + 600), tf: '1m' });
const raw = await (await fetch(`${BASE}/api/candles?${zq}`)).json(); // bez parametrów trade'a: seria wg reguły (piątek: jeszcze ESZ5)
const rbar = (raw.bars || []).find((b) => b[0] === Math.floor(entry / 60) * 60);
check('K2 bez pola „Kontrakt” seria w piątek to ESZ5 (przewaga obrotu ESH6 dopiero w poniedziałek): cena wejścia ESH6 wisi nad świecą o ok. 55 pkt', rbar && ep - rbar[2] > 40 && ep - rbar[2] < 80, `świeca serii ${JSON.stringify(rbar)}, wejście ${ep}`);
await setTf(page, '5m');
if (SHOTS) await page.locator('.lb-chart').screenshot({ path: path.join(SHOTS, 'P35-trade-tydzien-rolla.png') });
check('K1/K2 bez błędów strony', errors.length === 0, errors.join(' | '));

// ---- K3: wybór kontraktu zapisuje pole ----
const sel = page.locator('.lb-chart select[data-swc="contract"]');
check('K3 lista kontraktów widoczna: Auto, ESZ5, ESH6; wybrany ESH6 z pola', await sel.isVisible() && (await sel.inputValue()) === 'ESH6' && (await sel.locator('option').allTextContents()).join('|') === 'Auto: ESZ5|ESZ5|ESH6', `${await sel.inputValue()} ${(await sel.locator('option').allTextContents()).join('|')}`);
const patches = [];
page.on('request', (r) => { if (r.method() === 'PATCH' && /\/api\/trades\//.test(r.url())) patches.push(r.postDataJSON()); });
await sel.selectOption('ESZ5');
for (let i = 0; i < 30 && (await mockContract()) !== 'ESZ5'; i++) await sleep(300);
check('K3 wybór ESZ5 = PATCH pola „Kontrakt” z edited (ta sama trasa co formularz), Notion ma ESZ5', (await mockContract()) === 'ESZ5' && patches.some((p) => p.contract === 'ESZ5' && p.edited), JSON.stringify(patches));
await sleep(1500);
const labels2 = await page.locator('.lb-chart svg .roll-l').allTextContents();
const q5 = new URLSearchParams({ instrument: 'ES', from: String(entry - 600), to: String(entry + 600), tf: '1m', tfrom: String(entry), tto: String(Math.floor(Date.parse(row.exit.start ?? row.exit) / 1000)), contract: 'ESZ5' });
const c5 = await (await fetch(`${BASE}/api/candles?${q5}`)).json();
const b5 = (c5.bars || []).find((b) => b[0] === Math.floor(entry / 60) * 60);
check('K3 po wyborze ESZ5 sesja trade\'a w ESZ5 (cena ESH6 ok. 55 pkt nad świecą)', c5.contract?.code === 'ESZ5' && b5 && ep - b5[2] > 40, `${JSON.stringify(c5.contract)} ${JSON.stringify(b5)} ${JSON.stringify(labels2)}`);
await sel.selectOption('');
for (let i = 0; i < 30 && (await mockContract()) !== ''; i++) await sleep(300);
check('K3 „Auto” czyści pole', (await mockContract()) === '', `Notion: «${await mockContract()}»`);
await sel.selectOption('ESH6');
for (let i = 0; i < 30 && (await mockContract()) !== 'ESH6'; i++) await sleep(300);
check('K3 powrót do ESH6 (stan wyjściowy danych testowych)', (await mockContract()) === 'ESH6');
await ctx.close();

// ---- K4: B-ADJ (P38, 28.10.2026: domyślnie WŁĄCZONY z Ustawień, przycisk przełącza chwilowo, kotwica = kontrakt trade'a, edytor bez blokady) ----
({ ctx, page, errors } = await fresh());
const bj = page.locator('.lb-chart [data-swc="badj"]');
check('K4 B-ADJ domyślnie włączony, z ostrzeżeniem o przeliczeniu do kontraktu trade\'a', (await bj.getAttribute('aria-pressed')) === 'true' && /przeliczone do kontraktu trade'a/.test(await page.locator('.lb-chart .swc-warn').innerText().catch(() => '')));
await setTf(page, '1h');
await bj.click();
await sleep(1500);
check('K4 przycisk wyłącza widok chwilowo (bez ostrzeżenia)', (await bj.getAttribute('aria-pressed')) === 'false' && await page.locator('.lb-chart .swc-warn').isHidden());
await bj.click();
await sleep(1500);
const warn = await page.locator('.lb-chart .swc-warn').innerText().catch(() => '');
check('K4 włączony ponownie: ostrzeżenie, że poziomy trade\'a i rysunki pasują do świec', /Back-adjust włączony/.test(warn) && /pasują do świec/.test(warn) && !/mogą nie pasować/.test(warn) && (await bj.getAttribute('aria-pressed')) === 'true', `«${warn}»`);
for (let i = 0; i < 10; i++) { await page.locator('.lb-chart .swc-plot').hover(); await page.mouse.wheel(0, 500); await sleep(200); }
if (SHOTS) await page.locator('.lb-chart').screenshot({ path: path.join(SHOTS, 'P35-przelacznik-back-adjust.png') });
const store = await page.evaluate(() => localStorage.getItem('thq.chart.badj.v1'));
check('K4 wybór z przycisku nie zapisuje się (chwilowy)', store === null, String(store));
await bj.click(); await sleep(1500); // wyłączony na tym wykresie
await page.close();
const again = await fresh(ctx);
check('K4 po ponownym otwarciu wykresu znów włączony (wartość z Ustawień)', (await again.page.locator('.lb-chart [data-swc="badj"]').getAttribute('aria-pressed')) === 'true' && await again.page.locator('.lb-chart .swc-warn').isVisible());
await again.page.locator('.lb-chart .swc-edit').click();
await again.page.waitForSelector('.lb-chart .swc-lwc canvas', { timeout: 15000 }).catch(() => {});
const eb = again.page.locator('.lb-chart [data-swc="badj"]');
check('K4 edycja: B-ADJ aktywny i włączony (kotwica = kontrakt trade\'a: zapisywane ceny są prawdziwe)', !(await eb.isDisabled()) && (await eb.getAttribute('aria-pressed')) === 'true' && /przeliczone do kontraktu trade'a/.test(await again.page.locator('.lb-chart .swc-warn').innerText().catch(() => '')));
check('K4 bez błędów strony', errors.length === 0 && again.errors.length === 0, [...errors, ...again.errors].join(' | '));
await ctx.close();

// ---- K5 (W1 przeglądu P35, P38): spóźniona odpowiedź nie trafia do edytora; edytor dostaje świece zgodne ze stanem B-ADJ ----
// Scenariusz: B-ADJ domyślnie włączony; zmiana interwału wysyła żądanie adjust=1 (wstrzymane), od razu „Edytuj wykres”: start edytora czeka na to żądanie
// (settle), po jego zakończeniu edytor dostaje świece PRZELICZONE (B-ADJ), a jego przycisk B-ADJ jest włączony.
{
  const gate = () => { let open; const p = new Promise((r) => { open = r; }); return { p, open }; };
  let adjG = null;
  const ctx5 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx5.route(/\/api\/candles\?.*adjust=1/, async (route) => { if (adjG) await adjG.p; await route.continue().catch(() => {}); });
  await ctx5.route(/\/js\/wykres\.js(\?|$)/, async (route) => {
    const r = await route.fetch();
    await route.fulfill({ response: r, body: (await r.text()).replace('let candles = frame.candles.slice();', 'let candles = frame.candles.slice(); window.__edFrame = frame.candles.map((b) => b.slice()); window.__edBadj = frame.badj;') });
  });
  const f5 = await fresh(ctx5);
  await setTf(f5.page, '1h');
  adjG = gate();
  await f5.page.locator('.lb-chart [data-swc-tf="5m"]').first().click();
  await sleep(300);
  await f5.page.locator('.lb-chart .swc-edit').click();
  await sleep(1500); // żądanie 5m (adjust=1) nadal wstrzymane: edytor czeka
  const early = await f5.page.evaluate(() => window.__edFrame || null);
  check('K5 edytor nie startuje na świecach sprzed zakończenia ładowania', early === null);
  adjG.open();
  await f5.page.waitForSelector('.lb-chart .swc-lwc canvas', { timeout: 20000 }).catch(() => {});
  await sleep(500);
  const fr = await f5.page.evaluate(() => window.__edFrame || null);
  check('K5 edytor otwarty ze świecami (ramka przechwycona), B-ADJ w ramce włączony', Array.isArray(fr) && fr.length > 10 && (await f5.page.evaluate(() => window.__edBadj)) === true, String(fr && fr.length));
  if (fr?.length) {
    const t0 = fr[0][0];
    const qs = { instrument: 'ES', from: String(t0), to: String(t0 + 7200), tf: '5m', tfrom: String(entry), tto: String(Math.floor(Date.parse(row.exit.start ?? row.exit) / 1000)), contract: 'ESH6' };
    const plain = (await (await fetch(`${BASE}/api/candles?${new URLSearchParams(qs)}`)).json()).bars.find((b) => b[0] === t0);
    const adj = (await (await fetch(`${BASE}/api/candles?${new URLSearchParams({ ...qs, adjust: '1' })}`)).json()).bars.find((b) => b[0] === t0);
    check('K5 sanity: B-ADJ naprawdę przesuwa pierwszą świecę kadru', plain && adj && adj[4] !== plain[4], JSON.stringify({ plain, adj }));
    check('K5 edytor dostał świece przeliczone (B-ADJ), zgodne ze stanem przycisku', adj && fr[0][4] === adj[4], JSON.stringify({ frame: fr[0], plain, adj }));
  }
  check('K5 bez błędów strony', f5.errors.length === 0, f5.errors.join(' | '));
  await ctx5.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed, 0 skipped`);
process.exit(failed ? 1 : 0);
