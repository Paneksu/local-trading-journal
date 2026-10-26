// Test E2E dodawania zrzutów do trade'a z dashboardu (headless Chromium), uruchamiany OSOBNO od testy/run.mjs,
// bo wymaga Playwrighta, którego repo nie ma (zero npm). Nie dotyka prawdziwego Notion: działa wyłącznie na dashboardzie testowym z atrapą.
//
// Uruchomienie (dwa terminale):
//   1) node testy/start-test.mjs                      → dashboard testowy na http://127.0.0.1:4331 (atrapa Notion)
//      (zajęty port: TEST_PORT=4332 ATRAPA_PORT=4398 node testy/start-test.mjs, a w kroku 2 BASE=http://127.0.0.1:4332)
//   2) PW_CORE=<katalog z node_modules/playwright-core> [PW_CHROME=<chrome.exe>] [BASE=...] node testy/zrzuty-e2e.mjs
// Zrzuty ekranu trafiają do screens/zrzuty-*.png (katalog poza gitem). Port 4321 i prawdziwe Notion są zakazane.
// Wklejenie i upuszczenie to zdarzenia ClipboardEvent / DragEvent z prawdziwym obiektem DataTransfer i plikiem (headless nie ma schowka systemowego).
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.BASE || 'http://127.0.0.1:4331').replace(/\/$/, '');
if (/:4321\b/.test(BASE)) { console.error('Port 4321 to prawdziwy dashboard: ten test działa tylko na dashboardzie testowym.'); process.exit(2); }
const PW_CORE = process.env.PW_CORE;
if (!PW_CORE) { console.error('Ustaw PW_CORE na katalog pakietu playwright-core (instrukcja w nagłówku pliku).'); process.exit(2); }
const { chromium } = createRequire(path.join(PW_CORE, 'x.js'))(PW_CORE);
const SCREENS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'screens');
mkdirSync(SCREENS, { recursive: true });
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

// PNG o zadanym kolorze (gradient), żeby miniatura była widoczna na zrzucie ekranu testu
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = Math.min(255, rgb[0] + x / 4); raw[o + 1] = Math.min(255, rgb[1] + y / 3); raw[o + 2] = rgb[2]; }
  }
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ' ' + info}`); };
const browser = await chromium.launch({ executablePath: findChrome() });
const errors = [];
const log = [];

async function open(viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') log.push(m.text()); });
  p.on('request', (r) => { if (r.url().endsWith('/shots')) log.push(`SHOT ${r.method()} ${r.headers()['x-thq'] || 'brak X-THQ'}`); });
  await p.goto(BASE + '/'); await p.waitForSelector('.hero', { timeout: 15000 });
  return { ctx, p };
}
const noScroll = (p) => p.evaluate(() => ({ v: document.documentElement.scrollHeight > innerHeight + 1, h: document.documentElement.scrollWidth > innerWidth + 1 }));
const lbImgOk = (p) => p.waitForFunction(() => { const i = document.querySelector('.lb-img'); return i && !i.hidden && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 });
const countOf = (p, id) => p.evaluate((i) => __thq.model.trades.find((x) => x.id === i).imgs, id);
const waitCount = (p, id, n) => p.waitForFunction(([i, k]) => __thq.model.trades.find((x) => x.id === i)?.imgs === k, [id, n], { timeout: 10000 });
// wklejenie / upuszczenie: pliki w prawdziwym DataTransfer
const pasteFile = (p, bytes, type = 'image/png') => p.evaluate(({ b64, type }) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dt = new DataTransfer(); dt.items.add(new File([bin], 'schowek.png', { type }));
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  document.activeElement.dispatchEvent(ev);
  return ev.defaultPrevented;
}, { b64: bytes.toString('base64'), type });
const dropFile = (p, selector, bytes, type = 'image/png') => p.evaluate(({ sel, b64, type }) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dt = new DataTransfer(); dt.items.add(new File([bin], 'upuszczony.png', { type }));
  const el = document.querySelector(sel);
  const over = new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true });
  el.dispatchEvent(over);
  const drop = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
  el.dispatchEvent(drop);
  return { overPrevented: over.defaultPrevented, dropPrevented: drop.defaultPrevented };
}, { sel: selector, b64: bytes.toString('base64'), type });

try {
  // ---------- desktop 1920×1080 ----------
  {
    const { ctx, p } = await open({ width: 1920, height: 1080 }, false);
    // trade z listy (Live, bez zrzutu), jak kliknięcie w wiersz
    const id = await p.evaluate(() => { const t = __thq.model.trades.find((x) => x.imgs === 0 && x.typ === 'Live'); __thq.openDetail([t], t.id, null); return t.id; });
    await p.waitForSelector('.lb:not([hidden])');
    check('szczegóły trade\'a bez zrzutu: karta „Ten trade nie ma zrzutu” i przycisk „Dodaj zrzut”', (await p.locator('.lb-empty').isVisible()) && (await p.locator('.lb .shot-add').isVisible()));
    check('input pliku przyjmuje tylko 4 dozwolone typy obrazów (na telefonie galeria/aparat)', (await p.locator('.lb .shot-file').getAttribute('accept')) === 'image/png,image/jpeg,image/webp,image/gif');
    await p.screenshot({ path: path.join(SCREENS, 'zrzuty-1-szczegoly-bez-zrzutu-1920.png') });

    // 1) wybór pliku
    await p.locator('.lb .shot-file').setInputFiles({ name: 'wybrany.png', mimeType: 'image/png', buffer: png(640, 360, [30, 80, 200]) });
    await waitCount(p, id, 1);
    await lbImgOk(p);
    check('wybór pliku: miniatura pojawia się od razu w podglądzie (obraz wczytany, licznik zrzutów 1)', (await countOf(p, id)) === 1 && (await p.locator('.lb-count').textContent()).trim() === '1 / 1', await p.locator('.lb-count').textContent());
    check('wybór pliku: toast po sukcesie', /Dodano zrzut/.test(await p.locator('#toast').textContent()), await p.locator('#toast').textContent());
    await p.screenshot({ path: path.join(SCREENS, 'zrzuty-2-po-wyborze-pliku-1920.png') });

    // 2) wklejenie ze schowka (Ctrl+V): fokus na przycisku w podglądzie, nie w polu tekstowym
    await p.locator('.lb .shot-add').focus();
    const prevented = await pasteFile(p, png(640, 360, [200, 60, 60]));
    await waitCount(p, id, 2);
    await lbImgOk(p);
    check('wklejenie obrazu: zdarzenie przejęte, zrzut dodany, podgląd pokazuje nowy (2 / 2)', prevented && (await p.locator('.lb-count').textContent()).trim() === '2 / 2', await p.locator('.lb-count').textContent());

    // 3) przeciągnij i upuść na podgląd
    const dr = await dropFile(p, '.lb', png(640, 360, [40, 160, 80]));
    await waitCount(p, id, 3);
    await lbImgOk(p);
    check('przeciągnięcie pliku: dragover i drop przejęte, zrzut dodany (3 / 3)', dr.overPrevented && dr.dropPrevented && (await p.locator('.lb-count').textContent()).trim() === '3 / 3', JSON.stringify(dr));

    // 4) kolejność i zawartość: trzy różne obrazy pod trzema indeksami
    const sums = await p.evaluate(async (i) => {
      const out = [];
      for (let k = 0; k < 3; k++) { const b = new Uint8Array(await (await fetch(`/api/img?page=${i}&i=${k}&n=3`)).arrayBuffer()); out.push(b.length + ':' + b.slice(-30, -20).join(',')); }
      return out;
    }, id);
    check('trzy zrzuty pod indeksami 0–2 to trzy różne pliki, w kolejności dodania', new Set(sums).size === 3, JSON.stringify(sums));
    await p.screenshot({ path: path.join(SCREENS, 'zrzuty-3-po-wklejeniu-i-upuszczeniu-1920.png') });

    // 5) błędy: zły typ i pusty plik pokazują czytelny komunikat, nic nie dochodzi do Notion
    await p.locator('.lb .shot-file').setInputFiles({ name: 'notatki.txt', mimeType: 'text/plain', buffer: Buffer.from('to nie obraz') });
    await p.waitForSelector('.lb .shot-st.err');
    check('zły typ pliku: komunikat o dozwolonych typach, liczba zrzutów bez zmian', /PNG, JPEG, WebP i GIF/.test(await p.locator('.lb .shot-st').textContent()) && (await countOf(p, id)) === 3, await p.locator('.lb .shot-st').textContent());
    await p.screenshot({ path: path.join(SCREENS, 'zrzuty-4-blad-typu-1920.png') });
    const big = png(640, 360, [1, 2, 3]);
    await p.locator('.lb .shot-file').setInputFiles({ name: 'ogromny.png', mimeType: 'image/png', buffer: Buffer.concat([big, Buffer.alloc(10 * 1024 * 1024)]) });
    await p.waitForFunction(() => /za duży/.test(document.querySelector('.lb .shot-st')?.textContent || ''));
    check('za duży plik (>10 MB): komunikat „za duży” zanim cokolwiek zostanie wysłane', (await countOf(p, id)) === 3);
    const lay = await noScroll(p);
    check('1920×1080 z otwartym podglądem: bez przewijania okna', !lay.v && !lay.h, JSON.stringify(lay));

    // 6) formularz edycji: miniatury istniejących, dodanie nowego, zapis bez fałszywego konfliktu 409
    await p.locator('.lb .lb-edit').click();
    await p.waitForSelector('#trade-form');
    check('formularz edycji: pasek miniatur ma 3 zrzuty', (await p.locator('#trade-form .shot-strip img').count()) === 3, String(await p.locator('#trade-form .shot-strip img').count()));
    await p.locator('#trade-form .shot-file').setInputFiles({ name: 'z-formularza.png', mimeType: 'image/png', buffer: png(640, 360, [220, 180, 40]) });
    await waitCount(p, id, 4);
    await p.waitForFunction(() => document.querySelectorAll('#trade-form .shot-strip img').length === 4);
    check('formularz edycji: po wgraniu miniatura pojawia się od razu (4)', true);
    await p.locator('#trade-form #f-notes').fill('notatka po dodaniu zrzutu');
    await p.locator('#trade-form #f-save').click();
    await p.waitForFunction(() => /Zapisano zmiany/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 8000 });
    check('zapis formularza po dodaniu zrzutu przechodzi (znacznik edycji przejęty, brak 409)', true);
    check('po zapisie trade nadal ma 4 zrzuty', (await countOf(p, id)) === 4);
    // formularz pod wklejanie: pole tekstowe dostaje zwykły tekst, obraz ze schowka trafia do zrzutów
    await p.evaluate((i) => __thq.form.open(__thq.model.trades.find((x) => x.id === i), null), id);
    await p.waitForSelector('#trade-form');
    await p.locator('#trade-form #f-notes').focus();
    const pr2 = await pasteFile(p, png(640, 360, [90, 90, 230]));
    await waitCount(p, id, 5);
    check('wklejenie obrazu, gdy fokus jest w polu Notatki: obraz ląduje w zrzutach (5)', pr2 === true);
    await p.screenshot({ path: path.join(SCREENS, 'zrzuty-5-formularz-1920.png') });
    const lay2 = await noScroll(p);
    check('1920×1080 z otwartym formularzem: bez przewijania okna', !lay2.v && !lay2.h, JSON.stringify(lay2));
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    if (await p.locator('#trade-form').count()) await p.locator('[data-f-act="discard"]').click().catch(() => {});

    // 7) nowy trade: informacja, że zrzut dodaje się po zapisaniu
    await p.evaluate(() => __thq.form.open(null, null));
    await p.waitForSelector('#trade-form');
    check('nowy trade: zamiast przycisku jest podpowiedź „po zapisaniu trade\'a”', (await p.locator('#trade-form .shots-fld .shot-add').count()) === 0 && /po zapisaniu/.test(await p.locator('#trade-form .shots-fld').textContent()));
    await p.keyboard.press('Escape');
    await ctx.close();
  }

  // ---------- telefon 375 ----------
  {
    const { ctx, p } = await open({ width: 375, height: 812 }, true);
    const id = await p.evaluate(() => { const t = __thq.model.trades.find((x) => x.imgs === 0 && x.typ === 'Live'); __thq.openDetail([t], t.id, null); return t.id; });
    await p.waitForSelector('.lb:not([hidden])');
    await p.locator('.lb .shot-file').setInputFiles({ name: 'telefon.png', mimeType: 'image/png', buffer: png(320, 640, [60, 120, 180]) });
    await waitCount(p, id, 1);
    await lbImgOk(p);
    const l1 = await noScroll(p);
    const btnH = await p.locator('.lb .shot-add').evaluate((e) => e.getBoundingClientRect().height);
    check('375 px z podglądem po wgraniu: bez poziomego przewijania, przycisk dotykowy ≥ 40 px', !l1.h && btnH >= 40, JSON.stringify({ ...l1, btnH }));
    await p.screenshot({ path: path.join(SCREENS, 'zrzuty-6-telefon-podglad-375.png') });
    await p.locator('.lb .lb-edit').click();
    await p.waitForSelector('#trade-form');
    const l2 = await noScroll(p);
    check('375 px z formularzem: bez poziomego przewijania, przycisk „Dodaj zrzut” widoczny', !l2.h && (await p.locator('#trade-form .shot-add').isVisible()), JSON.stringify(l2));
    await p.locator('#trade-form .shots-fld').scrollIntoViewIfNeeded();
    await p.screenshot({ path: path.join(SCREENS, 'zrzuty-7-telefon-formularz-375.png') });
    await ctx.close();
  }

  check('wszystkie wysyłki zrzutów szły z nagłówkiem X-THQ', log.filter((l) => l.startsWith('SHOT')).length > 0 && log.filter((l) => l.startsWith('SHOT')).every((l) => l.endsWith(' 1')), JSON.stringify(log.filter((l) => l.startsWith('SHOT')).slice(0, 3)));
  const consoleErr = log.filter((l) => !l.startsWith('SHOT') && !/status of 400|status of 413/.test(l));
  check('brak błędów JS na stronie i w konsoli (poza oczekiwanymi odpowiedziami 400)', errors.length === 0 && consoleErr.length === 0, JSON.stringify([...errors, ...consoleErr].slice(0, 3)));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
