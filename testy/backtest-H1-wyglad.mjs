// backtest-H1: poprawki wyglądu po ocenie H2 (visual-reviewer): rozsuwanie etykiet poziomów, data na liście sesji i ceny w panelu journalingu w języku aplikacji,
// pion panelu journalingu, 375 px bez poziomego przewijania (nagłówek aplikacji, zakładka Backtest, tabela „Gdzie mam przewagę”). Dane syntetyczne i atrapa Notion.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { trade, session, SID, envDir } from './bt-notion-rig.mjs';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

  test('backtest-H1: etykiety poziomów się nie nakładają (PDL i Londyn L)', async () => {
    const { overlayGeometry, overlayDefaults } = await imp('public/js/podglad.js');
    const p = { ...overlayDefaults(), lines: true, labels: true, pdStyle: 'dashed', lineStyle: 'solid', pdWidth: 1, lineWidth: 1, pdColor: '' };
    const m = { boxes: [], lines: [
      { kind: 'pd', id: 'pd', side: 'lo', price: 100, x0: 0, x1: 60 },
      { kind: 'sess', id: 'london', side: 'lo', price: 100.3, x0: 0, x1: 60 },
      { kind: 'sess', id: 'asia', side: 'hi', price: 150, x0: 0, x1: 60 },
    ] };
    const sc = { x: (i) => i * 10, y: (pr) => 600 - pr * 2 };
    const g = overlayGeometry(m, sc, p, { left: 0, right: 600 });
    const L = g.lines.filter((l) => l.label);
    assert.equal(L.length, 3, 'trzy etykiety');
    const box = (l) => ({ x0: l.lx, x1: l.lx + l.label.length * 6.2, y: l.ly });
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = box(L[i]), b = box(L[j]);
      assert.ok(!(Math.abs(a.y - b.y) < 12 && a.x0 < b.x1 && b.x0 < a.x1), `„${L[i].label}” i „${L[j].label}” nachodzą: ${JSON.stringify([a, b])}`);
    }
    assert.equal(L.find((l) => l.id === 'pd').lx, 4, 'pierwsza etykieta zostaje na swoim miejscu');
    assert.equal(L.find((l) => l.id === 'asia').lx, 4, 'etykieta bez kolizji zostaje na swoim miejscu');
  });

  test('backtest-H1: data na liście sesji w języku aplikacji', async () => {
    const F = await imp('public/js/format.js');
    assert.equal(typeof F.dateTimeShort, 'function');
    const now = new Date(2026, 9, 30, 18, 0);
    assert.match(F.dateTimeShort(new Date(2026, 9, 30, 15, 24), now), /^30\spaź, 15:24$/u);
    assert.match(F.dateTimeShort(new Date(2025, 0, 5, 9, 7), now), /^5\ssty 2025, 09:07$/u);
    const src = readFileSync(path.join(ROOT, 'public/js/bt-widok.js'), 'utf8');
    assert.ok(/dateTimeShort\(/.test(src) && !/Intl\.DateTimeFormat\(undefined/.test(src), 'lista sesji bez języka przeglądarki');
    // ta sama klasa błędu w całym module (pasek replayu pisał „Tue, 12 Mar 2024”)
    for (const f of ['bt-replay.js', 'bt-widok.js', 'bt-journal.js', 'bt-staty-widok.js', 'bt-kreator.js', 'bt-filtr-widok.js']) {
      assert.ok(!/(DateTimeFormat|NumberFormat)\(undefined/.test(readFileSync(path.join(ROOT, 'public/js', f), 'utf8')), `${f}: format w języku przeglądarki`);
    }
  });

  test('backtest-H1: ceny w panelu journalingu jak na osi', async () => {
    const J = await imp('public/js/bt-journal.js');
    assert.equal(typeof J.pxText, 'function');
    assert.match(J.pxText(18299.75), /^18\s299,75$/u);
    assert.match(J.pxText(18293), /^18\s293,00$/u, 'dwa miejsca po przecinku jak na osi');
    assert.equal(J.pxText(NaN), '–');
  });

  test('backtest-H1: panel journalingu omija świece w pionie', async () => {
    const J = await imp('public/js/bt-journal.js');
    assert.equal(typeof J.pickVert, 'function');
    // świece nisko pod panelem (dół wykresu) → panel na górę; świece wysoko → zostaje na dole; brak świec → dół
    assert.equal(J.pickVert({ hostH: 600, panelH: 180, band: [420, 560] }), 'top');
    assert.equal(J.pickVert({ hostH: 600, panelH: 180, band: [40, 200] }), 'bottom');
    assert.equal(J.pickVert({ hostH: 600, panelH: 180, band: null }), 'bottom');
  });

  // ---- podgląd trade'a idzie za motywem (H2, słowa użytkownika: «Cały podgląd trade'a») ----
  test('backtest-H1: podgląd trade\'a w motywie Onyx i Platinum', async () => {
    const P = await imp('testy/przegladarka.mjs');
    if (!P.findBrowser()) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    const A = await H.atrapa(4940);
    const S = await H.server(4941, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: envDir(H), THQ_TEST_PAGES: '1' });
    try {
      const extract = `(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50); } return null; };
        await until(() => document.querySelector('#view')?.children.length);
        [...document.querySelectorAll('.panel-l button')].find((b) => b.textContent.trim() === 'Wsz.')?.click();
        document.querySelector('[data-act="view"][data-v="trades"]').click();
        (await until(() => document.querySelector('[data-act="trade-open"]')))?.click();
        const lb = await until(() => { const x = document.querySelector('.lb'); return x && !x.hidden ? x : null; });
        await sleep(300);
        const m = () => { const cs = getComputedStyle(lb); return { bg: cs.backgroundColor, fg: cs.color, chartBg: cs.getPropertyValue('--chart-bg').trim(), btn: getComputedStyle(lb.querySelector('.lb-mode button, .btn') || lb).color }; };
        const out = { onyx: m() };
        document.documentElement.setAttribute('data-theme', 'platinum');
        await sleep(600); // przejścia kolorów .btn trwają 0,15 s; 200 ms bywało za mało przy obciążonej maszynie (pełny przebieg H2 final)
        out.platinum = m();
        document.documentElement.setAttribute('data-theme', 'onyx');
        await sleep(600);
        out.onyx2 = m();
        return JSON.stringify(out);
      })()`;
      const res = JSON.parse(await P.cdpPage(`${S.base}/`, { width: 1920, height: 1080, timeoutMs: 90_000, until: "document.readyState === 'complete' && !!document.querySelector('.topbar')", extract }));
      assert.notEqual(res.onyx.bg, res.platinum.bg, `tło okna: ${JSON.stringify(res)}`);
      assert.notEqual(res.onyx.fg, res.platinum.fg, 'kolor tekstu okna');
      assert.notEqual(res.onyx.chartBg, res.platinum.chartBg, 'tło wykresu (--chart-bg)');
      assert.deepEqual(res.onyx2, res.onyx, 'powrót do Onyx na żywo');
      assert.equal(res.onyx.bg, 'rgba(14, 15, 16, 0.97)', 'Onyx bez zmian wyglądu');
    } finally { S.stop(); A.stop(); }
  });

  // ---- 375 px: nagłówek aplikacji, zakładka Backtest, tabela statystyk (prawdziwa aplikacja, emulacja telefonu) ----
  test('backtest-H1: 375 px bez poziomego przewijania (nagłówek, Backtest, tabela statystyk)', async () => {
    const P = await imp('testy/przegladarka.mjs');
    if (!P.findBrowser()) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    const A = await H.atrapa(4937);
    const dir = envDir(H);
    const sdir = path.join(dir, 'chart-data', 'backtest', 'sessions');
    mkdirSync(sdir, { recursive: true });
    const doc = session([trade(1), trade(2, { r: -1, pnl: -200, setup: 'Pullback' })], { rev: 1, days: { '2024-03-12': { status: 'done' } } });
    writeFileSync(path.join(sdir, `${SID}.json`), JSON.stringify(doc));
    const S = await H.server(4938, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, THQ_TEST_PAGES: '1' });
    try {
      const extract = `(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50); } return null; };
        localStorage.clear();
        const m = (k) => ({ k, vw: innerWidth, doc: document.documentElement.scrollWidth, top: document.querySelector('.topbar')?.scrollWidth, act: Math.round(document.querySelector('.top-actions')?.getBoundingClientRect().right || 0) });
        await until(() => document.querySelector('.topbar') && document.querySelector('#view')?.children.length);
        await sleep(800);
        const out = [m('start')];
        (await until(() => document.querySelector('#tabbar [data-v="backtest"]')))?.click();
        await until(() => document.querySelector('.bt-view tr[data-id]'));
        await sleep(300);
        out.push(m('backtest'));
        document.querySelector('.bt-view tr[data-id] [data-bt="stats"]')?.click();
        const tab = await until(() => document.querySelector('.bt-st-tab tbody td'));
        await sleep(500);
        const r = m('statystyki');
        r.td = tab ? getComputedStyle(tab).display : null;
        const tw = document.querySelector('.bt-st-tw');
        r.frame = tw ? { cw: tw.clientWidth, sw: tw.scrollWidth, ox: getComputedStyle(tw).overflowX } : null;
        const ths = [...document.querySelectorAll('.bt-st-tab')[0].querySelectorAll('thead th')].map((x) => Math.round(x.getBoundingClientRect().left));
        const tds = [...document.querySelectorAll('.bt-st-tab')[0].querySelector('tbody tr').children].map((x) => Math.round(x.getBoundingClientRect().left));
        r.cols = { ths, tds };
        out.push(r);
        return JSON.stringify(out);
      })()`;
      const txt = await P.cdpPage(`${S.base}/`, { width: 375, height: 812, mobile: true, timeoutMs: 90_000, until: "document.readyState === 'complete' && !!document.querySelector('.topbar')", extract });
      const res = JSON.parse(txt);
      for (const x of res) assert.ok(x.vw === 375 && x.doc <= 375 && x.top <= 375 && x.act <= 375, `${x.k}: szerokość okna ${x.vw}, scrollWidth dokumentu ${x.doc}, nagłówka ${x.top}, prawa krawędź .top-actions ${x.act}`);
      const st = res.find((x) => x.k === 'statystyki');
      assert.equal(st.td, 'table-cell', 'komórki tabeli „Gdzie mam przewagę” jako tabela');
      assert.deepEqual(st.cols.tds, st.cols.ths, `kolumny pod nagłówkami: ${JSON.stringify(st.cols)}`);
      assert.ok(st.frame && (st.frame.sw <= st.frame.cw || st.frame.ox === 'auto'), `tabela przewijana w ramce: ${JSON.stringify(st.frame)}`);
    } finally { S.stop(); A.stop(); }
  });
};
