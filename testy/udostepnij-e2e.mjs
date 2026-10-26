// Test E2E okna „Udostępnij” w prawdziwej przeglądarce (headless Chromium, emulacja telefonu), uruchamiany OSOBNO od testy/run.mjs,
// bo wymaga Playwrighta, którego repo nie ma (zero npm). Nie dotyka prawdziwego Notion: działa wyłącznie na dashboardzie testowym z atrapą.
//
// Uruchomienie (dwa terminale):
//   1) node testy/start-test.mjs                      → dashboard testowy na http://127.0.0.1:4331 (atrapa Notion)
//   2) PW_CORE=<katalog z node_modules/playwright-core> [PW_CHROME=<chrome.exe>] node testy/udostepnij-e2e.mjs
// PW_CORE: ścieżka do pakietu playwright-core (np. ~/projekt/node_modules/playwright-core), wymagana.
// PW_CHROME: opcjonalnie plik wykonywalny chrome/chrome-headless-shell (domyślnie szukany w %LOCALAPPDATA%/ms-playwright).
// BASE: opcjonalnie inny adres dashboardu testowego (domyślnie http://127.0.0.1:4331; port 4321 i prawdziwe Notion są zakazane).
// Uwaga: przeglądarka MCP Playwright ma skalę 125% i przy emulacji telefonu fałszuje trafienia kliknięć („intercepts pointer events”),
// dlatego ten test uruchamia własną przeglądarkę headless z prawdziwym viewportem.
import { createRequire } from 'node:module';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = (process.env.BASE || 'http://127.0.0.1:4331').replace(/\/$/, '');
if (/:4321\b/.test(BASE)) { console.error('Port 4321 to prawdziwy dashboard: ten test działa tylko na dashboardzie testowym.'); process.exit(2); }
const PW_CORE = process.env.PW_CORE;
if (!PW_CORE) { console.error('Ustaw PW_CORE na katalog pakietu playwright-core (instrukcja w nagłówku pliku).'); process.exit(2); }
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

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ' ' + info}`); };
const pngSize = (file) => { const b = readFileSync(file); return b.readUInt32BE(16) + '×' + b.readUInt32BE(20); };
const DIMS = { '9:16': '1080×1920', '4:5': '1080×1350', '1:1': '1080×1080', '16:9': '1920×1080' };

const browser = await chromium.launch({ executablePath: findChrome() });
const errors = [];
async function page(viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Error: toBlob')) errors.push(m.text()); }); // błąd toBlob jest wstrzykiwany celowo w teście błędu rysowania
  await p.goto(BASE + '/'); await p.waitForSelector('.hero', { timeout: 15000 });
  return { ctx, p };
}
const openWeek = async (p) => { await p.locator('.hero button[data-act="share-open"]').click(); await p.waitForSelector('.sh #sh-cv'); await p.waitForFunction(() => document.querySelector('[data-sh="download"]') && !document.querySelector('[data-sh="download"]').disabled); };

try {
  // ---------- telefon 375: prawdziwe kliknięcia, proporcje podglądu, pobranie PNG w każdym formacie ----------
  for (const h of [812, 667]) {
    const { ctx, p } = await page({ width: 375, height: h }, true);
    check(`nazwa: tytuł strony to JustJournal (375×${h})`, (await p.title()) === 'JustJournal', await p.title());
    await openWeek(p);
    const btns = p.locator('.sh-ctl button');
    const n = await btns.count(); let ok = 0, bad = '';
    for (let i = 0; i < n; i++) { const b = btns.nth(i); if (!(await b.isEnabled())) continue; try { await b.click({ timeout: 4000 }); ok++; } catch (e) { bad += ` #${i}`; } }
    check(`375×${h}: prawdziwe kliknięcie (bez force) każdego aktywnego przycisku w oknie`, !bad && ok >= 10, `ok=${ok} błędy:${bad}`);
    for (const f of Object.keys(DIMS)) {
      await p.locator(`.sh [data-sh="format"][data-v="${f}"]`).click();
      await p.waitForFunction(() => !document.querySelector('[data-sh="download"]').disabled);
      const ar = await p.evaluate(() => { const r = document.querySelector('.sh-prev').getBoundingClientRect(); return { w: r.width, h: r.height, hs: document.documentElement.scrollWidth > innerWidth }; });
      const [fw, fh] = DIMS[f].split('×').map(Number);
      // pudełko podglądu ma proporcję formatu, więc nie ma pustki nad/pod kartą
      check(`375×${h} ${f}: proporcja podglądu zgodna z formatem, bez poziomego scrolla`, Math.abs(ar.w / ar.h - fw / fh) < 0.03 && !ar.hs, JSON.stringify(ar));
      const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('.sh [data-sh="download"]').click()]);
      check(`375×${h} ${f}: pobrany PNG ma wymiary ${DIMS[f]}`, pngSize(await dl.path()) === DIMS[f], pngSize(await dl.path()));
    }
    await ctx.close();
  }

  // ---------- desktop 1920×1080: bez scrolla, filtry, Live-only, podwójne otwarcie, błąd rysowania ----------
  const { ctx, p } = await page({ width: 1920, height: 1080 }, false);
  check('desktop: nagłówek ma nazwę JustJournal', (await p.locator('.brand-name').textContent()).trim() === 'JustJournal');
  await openWeek(p);
  const ov = await p.evaluate(() => { const b = document.querySelector('.sh-body'); return { body: b.scrollHeight > b.clientHeight, page: document.documentElement.scrollHeight > innerHeight }; });
  check('1920×1080: okno bez scrolla (ciało i strona)', !ov.body && !ov.page, JSON.stringify(ov));
  check('bez aktywnych filtrów nie ma notki o filtrach', (await p.locator('#sh-filt').count()) === 0);
  await p.locator('.sh [data-sh="close"]').click();

  // podwójne otwarcie: dwa szybkie wywołania dają jedno okno
  await p.evaluate(() => { const b = document.querySelector('.hero button[data-act="share-open"]'); b.click(); b.click(); });
  await p.waitForSelector('.sh');
  await p.waitForTimeout(600);
  check('podwójne kliknięcie otwiera jedno okno', (await p.locator('.sh').count()) === 1, String(await p.locator('.sh').count()));
  await p.keyboard.press('Escape');

  // filtr wyszukiwarki z widoku obowiązuje na karcie (notka o filtrach) i znika po wyczyszczeniu
  await p.locator('#q').fill('NQ'); await p.waitForTimeout(500);
  await openWeek(p).catch(() => {});
  check('filtr widoku (wyszukiwarka) → notka „Karta uwzględnia filtry” w oknie', (await p.locator('#sh-filt').count()) === 1);
  await p.keyboard.press('Escape');
  await p.locator('#q').fill(''); await p.waitForTimeout(400);

  // notka przy wyłączonej jednostce: gdy któraś jednostka jest nieaktywna, widać powód
  await openWeek(p);
  const dis = await p.locator('.sh [data-sh="metric"]:disabled').count();
  check('wyłączona jednostka ma widoczną notkę z powodem (albo wszystkie aktywne)', dis === 0 || (await p.locator('#sh-metric-note').isVisible()), `wyłączone=${dis}`);

  // błąd rysowania: toBlob zwraca null → komunikat w podglądzie, przyciski wyłączone, brak nieobsłużonego odrzucenia
  await p.evaluate(() => { window.__tb = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (cb) { cb(null); }; });
  await p.locator('.sh [data-sh="format"][data-v="1:1"]').click(); await p.waitForTimeout(700);
  const broken = await p.evaluate(() => ({ msg: document.querySelector('#sh-empty').hidden ? '' : document.querySelector('#sh-empty').textContent, dl: document.querySelector('[data-sh="download"]').disabled }));
  check('błąd rysowania: komunikat w podglądzie i wyłączone przyciski', broken.msg.includes('Nie udało się narysować karty') && broken.dl, JSON.stringify(broken));
  await p.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.__tb; });
  await p.locator('.sh [data-sh="format"][data-v="9:16"]').click();
  await p.waitForFunction(() => !document.querySelector('[data-sh="download"]').disabled);
  check('po błędzie kolejne rysowanie działa', true);
  await p.keyboard.press('Escape');

  // Share/Kopiuj korzystają z gotowego blobu: dostępny po draw, bez czekania na toBlob
  await openWeek(p);
  const preBlob = await p.evaluate(() => new Promise((res) => { const c = document.querySelector('#sh-cv'); let t0 = performance.now(); c.toBlob((b) => res({ ok: !!b, ms: performance.now() - t0 }), 'image/png'); }));
  check('toBlob działa na gotowej karcie', preBlob.ok);
  await p.keyboard.press('Escape');

  // Backtest/Paper: przycisk Udostępnij w hero zniknął (karty okresów tylko dla Live)
  await p.locator('[data-act="typ"][data-v="Backtest"]').click(); await p.waitForTimeout(600);
  check('widok Backtest: brak przycisku Udostępnij w hero', (await p.locator('.hero button[data-act="share-open"]').count()) === 0);
  await p.locator('[data-act="typ"][data-v="Live"]').click(); await p.waitForTimeout(400);

  // kalendarz: komórka „Tydz.” na przełomie miesięcy otwiera kartę z tym samym zakresem
  const wk = p.locator('.cell.wk[data-from]').first();
  const fromTo = await wk.evaluate((el) => [el.dataset.from, el.dataset.to]);
  check('komórka „Tydz.” przy początku miesiąca niesie przycięty zakres (mniej niż 7 dni)', fromTo[0] < fromTo[1] && (new Date(fromTo[1]) - new Date(fromTo[0])) / 864e5 < 6, fromTo.join('..'));
  await wk.click(); await p.waitForSelector('.sh #sh-cv');
  const lbl = await p.locator('.sh-per-t').textContent();
  const d1 = Number(fromTo[0].slice(8)), d2 = Number(fromTo[1].slice(8));
  check('karta z komórki pokazuje ten sam zakres dni co komórka (nie cały tydzień)', lbl.includes(d1 + '–' + d2), lbl + ' vs ' + fromTo.join('..'));
  await p.locator('.sh [data-sh="next"]').click(); await p.waitForTimeout(400);
  check('po przejściu do następnego okresu przycięcie znika (pełny tydzień)', /–/.test(await p.locator('.sh-per-t').textContent()));
  await ctx.close();
} catch (e) {
  check('wyjątek w teście', false, e.stack || e.message);
}
await browser.close();
check('brak błędów w konsoli i wyjątków strony', errors.length === 0, errors.slice(0, 3).join(' | '));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed} passed, ${results.length - passed} failed`);
process.exit(results.length === passed ? 0 : 1);
