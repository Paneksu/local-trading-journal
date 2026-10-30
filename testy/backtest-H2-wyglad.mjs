// backtest-H2: poprawki po ponownej ocenie wyglądu (runda 2, backtest-wyniki/H2/review-wyglad-2.md): kontrast tekstu na ramie --chrome w Platinum (notka back-adjust,
// podpisy sesji i newsów), pełne nazwy list w Ustawienia → Backtest → Skoki, odstęp kolumny „Ostatnio otwarta”, h1 statystyk backtestu, fokus na wybranej zakładce,
// prawy panel i stopka po starcie aplikacji prosto na zakładce Backtest. Dane syntetyczne i atrapa Notion.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { trade, session, SID, envDir } from './bt-notion-rig.mjs';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const css = (f) => readFileSync(path.join(ROOT, 'public', f), 'utf8');
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((s, v, k) => s + v * [0.2126, 0.7152, 0.0722][k], 0); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  test('backtest-H2: notka back-adjust i teksty w Platinum ≥ 4,5:1 (podgląd na --content, replay na --chrome)', () => {
    const s = css('styles.css');
    const plat = s.slice(s.indexOf(':root[data-theme="platinum"] {'), s.indexOf('}', s.indexOf(':root[data-theme="platinum"] {')));
    const tok = (n) => (new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(plat) || [])[1];
    // [U] 30.10.2026 «Jaśniejsze (#e0e0e0)»: tło podglądu trade'a i edytora = --content
    assert.match(plat, /--lb-chart-bg: var\(--content\)/, 'wykres podglądu na --content');
    assert.match(plat, /--lb-bg: color-mix\(in srgb, var\(--content\)/, 'okno podglądu na --content');
    const content = tok('content'), chrome = tok('chrome');
    assert.equal(content, '#e0e0e0');
    const lbWarn = /--lb-warn: var\(--([a-z-]+)\)/.exec(plat)?.[1];
    for (const k of [lbWarn, 'fg', 'fg-2', 'profit', 'loss', 'be']) assert.ok(ratio(tok(k), content) >= 4.5, `--${k} ${tok(k)} na --content ${content}: ${ratio(tok(k), content).toFixed(2)}`);
    // replay zostaje na ramie --chrome: notka i podpisy w ciemniejszych odcieniach
    assert.ok(ratio(tok('chrome-warn'), chrome) >= 4.5, `--chrome-warn na --chrome: ${ratio(tok('chrome-warn'), chrome).toFixed(2)}`);
    for (const k of ['fg', 'fg-2', 'profit', 'loss', 'be']) assert.ok(ratio(tok(k), chrome) >= 4.5, `--${k} ${tok(k)} na --chrome: ${ratio(tok(k), chrome).toFixed(2)}`);
    assert.match(css('features.css'), /:root\[data-theme="platinum"\] \.bt-screen \{[^}]*--n-orange: var\(--chrome-n-orange\)[^}]*--n-yellow: var\(--chrome-n-yellow\)/, 'replay w Platinum: ciemniejsze --n-orange i --n-yellow na ramie (tokeny ze styles.css)');
  });

  test('backtest-H2: odstęp kolumny „Ostatnio otwarta” wygrywa z .bt-tab td', () => {
    const f = css('features.css');
    assert.match(f, /\.bt-tab \.bt-l-ago \{[^}]*padding-left: 24px/, 'reguła o specyficzności wyższej niż .bt-tab td');
    assert.ok(/<th class="bt-l-ago">/.test(readFileSync(path.join(ROOT, 'public/js/bt-widok.js'), 'utf8')), 'nagłówek kolumny z tym samym odstępem');
  });

  test('backtest-H2: aplikacja (Platinum): skoki, statystyki, zakładki Ustawień, prawy panel po starcie na Backtest', async () => {
    const P = await imp('testy/przegladarka.mjs');
    if (!P.findBrowser()) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    const A = await H.atrapa(4947);
    const dir = envDir(H);
    const sdir = path.join(dir, 'chart-data', 'backtest', 'sessions');
    mkdirSync(sdir, { recursive: true });
    writeFileSync(path.join(sdir, `${SID}.json`), JSON.stringify(session([trade(1), trade(2, { r: -1, pnl: -200, setup: 'Pullback' })], { rev: 1, days: { '2024-03-12': { status: 'done' } } })));
    const S = await H.server(4948, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, THQ_TEST_PAGES: '1' });
    try {
      const extract = `(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50); } return null; };
        const out = {};
        await until(() => document.querySelector('.bt-view tr[data-id]'));
        await until(() => /w widoku/.test(document.querySelector('#entries')?.textContent || ''), 8000);
        out.theme = document.documentElement.dataset.theme;
        out.side = [...document.querySelectorAll('#side .lbl, #side h3, #side summary')].map((e) => e.textContent.trim()).filter(Boolean);
        out.entries = document.querySelector('#entries')?.textContent || '';
        // [U] 30.10.2026 «Ukryj na Backtest»: filtry „Typ” i „Okres” niewidoczne na zakładce Backtest
        const vis = (id) => { const el = document.getElementById(id)?.closest('.field'); return !!el && el.offsetParent !== null; };
        out.deskBt = { typ: vis('l-typ'), okres: vis('l-okres') };
        // Ustawienia → Backtest: listy skoków pokazują pełną nazwę
        document.querySelector('#gear').click();
        await until(() => document.querySelector('.sp-tabs'));
        [...document.querySelectorAll('.sp-tabs button')].find((b) => b.textContent.trim() === 'Backtest').click();
        await until(() => document.querySelector('.bt-sj select'));
        await sleep(200);
        out.focus = document.activeElement?.dataset?.fk || '';
        const ctx = document.createElement('canvas').getContext('2d');
        out.selects = [...document.querySelectorAll('.bt-sj > select')].map((s) => { const cs = getComputedStyle(s); ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
          const txt = s.options[s.selectedIndex]?.text || ''; return { txt, need: Math.ceil(ctx.measureText(txt).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)), have: s.clientWidth }; });
        out.skrot = Math.round(document.querySelector('.bt-sj > .bt-skrot')?.getBoundingClientRect().width || 0);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(200);
        // statystyki sesji: h1 i podtytuł zakresu
        document.querySelector('.bt-view tr[data-id] [data-bt="stats"]')?.click();
        await until(() => document.querySelector('.bt-st-tiles'));
        out.h1 = document.querySelector('.bt-st-head h1')?.textContent || '';
        out.sub = document.querySelector('.bt-st-head .page-sub')?.textContent || '';
        out.grp = [...document.querySelectorAll('th.bt-st-grp')].map((x) => getComputedStyle(x).textAlign);
        // inna zakładka: filtry i „Ostatnie trade'y” wracają
        document.querySelector('#tabbar [data-v="stats"], [data-act="view"][data-v="stats"]')?.click();
        await until(() => document.body.dataset.view === 'stats');
        await sleep(300);
        out.sideStats = [...document.querySelectorAll('#side .lbl, #side h3, #side summary')].map((e) => e.textContent.trim()).filter(Boolean);
        out.deskStats = { typ: vis('l-typ'), okres: vis('l-okres') };
        return JSON.stringify(out);
      })()`;
      const res = JSON.parse(await P.cdpPage(`${S.base}/`, { width: 1920, height: 1080, timeoutMs: 120_000, // start prosto na zakładce Backtest (zapamiętany widok) w Platinum: magazyn ustawiony przed pierwszym przeładowaniem
        until: "(sessionStorage.getItem('h2w') || (localStorage.clear(), localStorage.setItem('thq.theme', 'platinum'), localStorage.setItem('thq.filters.v1', JSON.stringify({ view: 'backtest' })), sessionStorage.setItem('h2w', '1'), location.reload(), false)) && document.readyState === 'complete' && !!document.querySelector('.topbar')", extract }));
      assert.equal(res.theme, 'platinum');
      assert.ok(res.side.includes('Podsumowanie okresu'), `prawy panel po starcie na Backtest: ${res.side.join(', ')}`);
      // [U] 30.10.2026 «Ukryj na Backtest»
      assert.ok(!res.side.includes("Ostatnie trade'y"), `bez „Ostatnich trade'ów” na Backtest: ${res.side.join(', ')}`);
      assert.deepEqual(res.deskBt, { typ: false, okres: false }, 'Typ i Okres ukryte na Backtest');
      assert.ok(res.sideStats.includes("Ostatnie trade'y"), `„Ostatnie trade'y” wracają na Statystykach: ${res.sideStats.join(', ')}`);
      assert.deepEqual(res.deskStats, { typ: true, okres: true }, 'Typ i Okres wracają na Statystykach');
      assert.match(res.entries, /w widoku: \d+/, `stopka: ${res.entries}`);
      assert.ok(res.selects.length >= 2, 'listy skoków');
      for (const s of res.selects) assert.ok(s.need <= s.have, `„${s.txt}”: potrzeba ${s.need} px, lista ma ${s.have} px`);
      assert.ok(res.skrot > 0 && res.skrot <= 70, `pole skrótu skoku: ${res.skrot} px`);
      assert.equal(res.focus, 'tab-backtest', 'fokus na wybranej zakładce, nie na poprzedniej');
      assert.equal(res.h1, 'Statystyki backtestu', 'h1 jak „Statystyki” dashboardu');
      assert.match(res.sub, /·/, `podtytuł zakresu: ${res.sub}`);
    } finally { S.stop(); A.stop(); }
  });
};
