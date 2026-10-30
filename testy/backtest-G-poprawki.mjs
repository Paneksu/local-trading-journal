// backtest-G2: poprawki po review F1–G (kod, indeks, szablony filtra, statystyki). Część czysta w Node, widoki w przeglądarce (strony testy/backtest-kreator.html ?part=poprawki
// i testy/backtest-staty.html ?part=plural). Test przeglądarkowy bez Chrome/Edge jest POMINIĘTY (osobny licznik w runnerze), nie zdany. Dane tylko syntetyczne.
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const skip = (msg) => { const e = new Error(msg); e.skipTest = true; throw e; };
  const XSS = '"><img src=x onerror=window.__xss=1>';
  let seq = 0;
  const loc = (o) => ({ id: `t${++seq}`, day: '2024-03-12', instrument: 'NQ', dir: 'Long', entryT: Date.UTC(2024, 2, 12, 13, 40) / 1000, exits: [{ t: 1, price: 1, qty: 1, reason: 'tp' }], r: 1, pnl: 10, maeR: -0.2, mfeR: 1.2, setup: 'ORB', be: false, journal: 'done', ...o });
  const nt = (o) => ({ typ: 'Backtest', counted: true, date: '2024-03-12', at: Date.UTC(2024, 2, 12, 13, 40), dir: 'Long', instrument: 'NQ', setup: 'ORB', r: 1, btMae: null, btMfe: null, btSession: '', ...o });

  // ---- #1 walidacja szablonu ----
  test('backtest-G2: szablon z ładunkiem XSS i zły szablon są odrzucane', async () => {
    const C = await imp('public/js/bt-czas.js');
    const cond = (c) => ({ op: 'and', not: false, items: [c] });
    const ok = C.templateOf(C.templateEntry('Dobry', cond({ k: 'gap', unit: 'pct', min: 0.5 })));
    assert.ok(ok, 'poprawny szablon przechodzi');
    const bad = [
      cond({ k: 'gap', unit: 'pct', min: XSS }), // napis w polu liczbowym
      cond({ k: 'gap', unit: XSS }),
      cond({ k: 'nieznany' }), cond({ k: 'wd', days: 'x' }), cond({ k: 'wd', days: [9] }), cond({ k: 'month', months: [0] }),
      cond({ k: 'impAtLeast', imp: XSS }), cond({ k: 'newsWhen', when: 'kiedyś' }), cond({ k: 'opex', type: 'x' }), cond({ k: 'prevDir', dir: 'bok' }),
      cond({ k: 'dateRange', from: XSS, to: '' }), cond({ k: 'earnings', maxCls: 99 }), cond({ k: 'event', name: 5 }),
      { op: 'xor', items: [] }, { op: 'and', items: 'x' },
    ];
    for (const f of bad) assert.equal(C.templateOf(C.templateEntry('Zły', f)), null, `odrzucony: ${JSON.stringify(f).slice(0, 80)}`);
    // limity kawałków (kontrola ujemna: szablon z kawałkiem > 400 znaków albo > 20 kawałkami odpada)
    const okE = C.templateEntry('Limit', cond({ k: 'inside' }));
    assert.ok(C.templateOf(okE), 'sprawdzian: poprawny wpis przechodzi');
    // poprawny JSON filtra (puste grupy z odstępami), więc odrzucić go może tylko limit rozmiaru, nie parsowanie ani walidacja
    const padded = (n) => '{"op":"and","items":[' + ' '.repeat(n) + ']}';
    assert.ok(C.templateOf({ name: 'Mały', filterJ: [padded(300)] }), 'sprawdzian: kawałek ≤ 400 przechodzi');
    assert.equal(C.templateOf({ name: 'Za długi kawałek', filterJ: [padded(450)] }), null, 'kawałek > 400 znaków');
    const long = padded(8200);
    assert.equal(C.templateOf({ name: 'Za dużo kawałków', filterJ: long.match(/[sS]{1,400}/g) }), null, 'więcej niż 20 kawałków');
    assert.equal(C.templateOf({ name: 'Zły typ', filterJ: [5] }), null, 'kawałek nie jest napisem');
    // zbyt głębokie drzewo
    let deep = { k: 'inside' };
    for (let i = 0; i < 15; i++) deep = { op: 'and', items: [deep] };
    assert.equal(C.templateOf(C.templateEntry('Głęboki', deep)), null, 'drzewo głębsze niż limit odrzucone');
    // sanitizeBt wyrzuca zły szablon z listy
    const s = C.sanitizeBt({ templates: [C.templateEntry('Dobry', cond({ k: 'inside' })), C.templateEntry('Zły', cond({ k: 'gap', min: XSS }))] });
    assert.deepEqual(s.templates.map((x) => x.name), ['Dobry']);
  });

  // ---- #2 formy mnogie ----
  test('backtest-G2: formy mnogie przez t.p w obu słownikach', async () => {
    const en = JSON.parse(readFileSync(path.join(ROOT, 'public/i18n/en.json'), 'utf8'));
    const pl = JSON.parse(readFileSync(path.join(ROOT, 'public/i18n/pl.json'), 'utf8'));
    const src = readFileSync(path.join(ROOT, 'public/js/bt-staty-widok.js'), 'utf8');
    const used = [...src.matchAll(/\bt\.p\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2].replace(/\\(['"\\])/g, '$1'));
    assert.ok(used.length >= 5, `statystyki używają t.p (${used.length})`);
    for (const k of used) {
      assert.equal(typeof en[k], 'object', `en: ${k}`);
      assert.equal(typeof pl[k], 'object', `pl: ${k}`);
      for (const f of ['one', 'few', 'many', 'other']) assert.equal(typeof pl[k][f], 'string', `pl ${k}: ${f}`);
      for (const f of ['one', 'other']) assert.equal(typeof en[k][f], 'string', `en ${k}: ${f}`);
    }
    // liczby w tekstach bez t.p: stare literały z {n} bez mnogiej w nowych plikach bt-* (lista: tylko dozwolone, np. „Do uzupełnienia: {n}” to dwukropek, nie rzeczownik)
    const bare = [];
    for (const f of ['bt-staty-widok.js', 'bt-filtr-widok.js', 'bt-kreator.js', 'bt-widok.js']) {
      const s = readFileSync(path.join(ROOT, 'public/js', f), 'utf8');
      for (const m of s.matchAll(/\bt\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) if (/\{(n|w|l|b|x)\}\s+(wygran|strat|trade|sesj|dni|zwyci)/i.test(m[2])) bare.push(`${f}: ${m[2]}`);
    }
    assert.deepEqual(bare, [], 'rzeczownik po liczbie wymaga t.p');
  });

  // ---- #3 kolejność losowa: dzień w toku ukryty ----
  test('backtest-G2: kolejność losowa ukrywa trade\'y dnia w toku', async () => {
    const S = await imp('public/js/bt-staty.js');
    const sess = (order, status) => ({ id: 'bt-rand01', name: 'Los', def: { order }, days: { '2024-03-12': { status: 'done' }, '2024-03-13': { status } },
      trades: [loc({ id: 't1', day: '2024-03-12' }), loc({ id: 't2', day: '2024-03-13', entryT: Date.UTC(2024, 2, 13, 13, 40) / 1000 })] });
    const hidden = S.mergeBacktest([], [sess('random', 'active')]);
    assert.deepEqual(hidden.map((x) => x.id), ['t1'], 'dzień active w sesji losowej ukryty');
    assert.equal(S.mergeBacktest([], [sess('random', 'done')]).length, 2, 'dzień done widoczny');
    assert.equal(S.mergeBacktest([], [sess('chrono', 'active')]).length, 2, 'kolejność chronologiczna: data i tak jest znana');
    // kopia ukrytego trade'a, wysłana do Notion przyciskiem, też nie wraca tylnymi drzwiami
    const n = nt({ date: '2024-03-13', at: Date.UTC(2024, 2, 13, 13, 40), btSession: 'Los [bt-rand01/t2]' });
    assert.deepEqual(S.mergeBacktest([n], [sess('random', 'active')]).map((x) => x.id), ['t1'], 'dubel z Notion ukrytego trade\'a pominięty');
    assert.equal(S.hiddenCount([sess('random', 'active')]), 1);
    assert.equal(S.hiddenCount([sess('chrono', 'active')]), 0);
  });

  // ---- #4, #5, #10 źródło trade'ów ----
  test('backtest-G2: typ z Notion, wynik ręczny, BE i dubel stron', async () => {
    const S = await imp('public/js/bt-staty.js');
    const { calc } = await imp('public/js/stats.js');
    assert.equal(S.mergeBacktest([nt({ typ: null }), nt({ typ: undefined }), nt({ typ: 'Live' })], []).length, 0, 'bez typu Backtest nie liczy się');
    assert.equal(S.mergeBacktest([nt({ typ: 'Backtest' })], []).length, 1);
    // wynik ręczny z Notion
    const m = S.mergeBacktest([nt({ r: -0.05, manual: 'win' })], []);
    assert.equal(m[0].manual, 'win');
    assert.equal(S.summary(m).wins, calc([{ ...nt({}), date: '2024-03-12', r: -0.05, manual: 'win' }]).wins, 'wygrana jak w dashboardzie');
    assert.equal(S.summary(m).wins, 1);
    // „po BE” jednakowo lokalnie i z Notion: stop na BE, ale częściowy zysk (r 0,5): w obu przypadkach nie „po BE”; r 0 po stopie: w obu „po BE”
    const part = S.mergeBacktest([nt({ r: 0.5, be: 18000, btMae: -0.1, btMfe: 2, btSession: 'S [bt-abc123/t1]' })], []);
    const partLocal = S.mergeBacktest([], [{ id: 'bt-abc123', name: 'S', trades: [loc({ id: 't1', r: 0.5, be: true, exits: [{ t: 1, price: 1, qty: 1, reason: 'sl' }] })] }]);
    assert.equal(part[0].beHit, partLocal[0].beHit, 'ta sama decyzja z Notion i lokalnie (r 0,5)');
    assert.equal(part[0].beHit, false);
    const zero = S.mergeBacktest([nt({ r: 0, be: 18000, btMae: -0.1, btMfe: 1, btSession: 'S [bt-abc123/t2]' })], []);
    const zeroLocal = S.mergeBacktest([], [{ id: 'bt-abc123', name: 'S', trades: [loc({ id: 't2', r: 0, be: true, exits: [{ t: 1, price: 1, qty: 1, reason: 'sl' }] })] }]);
    assert.equal(zero[0].beHit, true);
    assert.equal(zeroLocal[0].beHit, true);
    // dwie strony Notion z tym samym znacznikiem (bez pliku lokalnego) liczą się raz
    const dup = S.mergeBacktest([nt({ btSession: 'S [bt-zzz999/t7]' }), nt({ btSession: 'S [bt-zzz999/t7]' })], []);
    assert.equal(dup.length, 1);
  });

  // ---- #6 lekka trasa i indeks bez cech rynku ----
  test('backtest-G2: lekkie źródło statystyk (bez rysunków, z informacją o błędach)', async () => {
    const { createBacktestStore } = await imp('lib/backtest-store.mjs');
    const base = H.tmp();
    const st = createBacktestStore({ baseDir: base, log: () => {} });
    const big = { v: 1, name: 'A', def: { instruments: ['NQ'], order: 'random', from: '2024-03-01', to: '2024-03-29' }, pool: ['2024-03-12'], dayIdx: 0, cursor: 0, hw: 0, days: { '2024-03-12': { status: 'done' } },
      drawings: { NQ: { '2024-03-12': { v: 1, d: ['x'.repeat(5000)] } } }, trades: [loc({ id: 't1', drawings: { v: 1, d: ['y'.repeat(5000)] } })], book: { orders: [], positions: [] } };
    st.save('bt-aaaaaa', big, 0);
    st.save('bt-bbbbbb', { ...big, name: 'B' }, 0);
    writeFileSync(path.join(base, 'backtest', 'sessions', 'bt-cccccc.json'), '{nie json');
    const one = st.forStats(['bt-aaaaaa']);
    assert.equal(one.sessions.length, 1);
    assert.deepEqual(one.failed, []);
    const s = one.sessions[0];
    assert.equal(s.id, 'bt-aaaaaa'); assert.equal(s.def.order, 'random'); assert.equal(s.days['2024-03-12'].status, 'done');
    assert.ok(!('drawings' in s) && !('book' in s), 'bez rysunków i księgi');
    assert.ok(!('drawings' in s.trades[0]), 'trade bez migawki rysunków');
    assert.equal(s.trades[0].r, 1);
    const all = st.forStats(null);
    assert.deepEqual(all.sessions.map((x) => x.id).sort(), ['bt-aaaaaa', 'bt-bbbbbb']);
    assert.deepEqual(all.failed, ['bt-cccccc'], 'uszkodzona sesja zgłoszona, nie połknięta');
    assert.throws(() => st.forStats(['../x']), /sesj|id/i, 'zły id odrzucony');
    // trasa HTTP
    const dir = H.tmp();
    const { createBacktestStore: mk } = await imp('lib/backtest-store.mjs');
    mk({ baseDir: path.join(dir, 'chart-data'), log: () => {} }).save('bt-aaaaaa', big, 0);
    const S = await H.server(4925, { THQ_CONFIG_DIR: dir });
    try {
      const r = await (await fetch(`${S.base}/api/backtest/stats-source?ids=bt-aaaaaa`)).json();
      assert.equal(r.sessions.length, 1);
      assert.ok(!('drawings' in r.sessions[0]));
      const bad = await fetch(`${S.base}/api/backtest/stats-source?ids=${encodeURIComponent('../../x')}`);
      assert.equal(bad.status, 400);
      const none = await (await fetch(`${S.base}/api/backtest/stats-source`)).json();
      assert.equal(none.sessions.length, 1);
    } finally { S.stop(); }
  });

  test('backtest-G2: indeks dni bez cech rynku nie czyta świec', async () => {
    const { createDayIndex } = await imp('lib/backtest-index.mjs');
    const { createCandles } = await imp('lib/candles.mjs');
    const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
    const baseDir = path.join(H.tmp(), 'chart-data');
    await syntheticDay(baseDir, { instrument: 'NQ', day: '2024-03-12', seed: 3 });
    const none = { range: (from, to) => ({ from, to, events: [] }) };
    const idx = createDayIndex({ baseDir, candles: createCandles({ getKey: () => null, getConfig: () => ({}), baseDir }), news: none, earnings: none });
    const a = idx.get({ instruments: ['NQ'], from: '2024-03-11', to: '2024-03-13', mkt: false });
    assert.equal(idx.stats.reads, 0, 'bez cech rynku: zero odczytów świec');
    const d = a.days.find((x) => x.day === '2024-03-12');
    assert.equal(d.has1m.NQ, true, 'pokrycie nadal jest');
    assert.ok(!d.mkt || !d.mkt.NQ, 'brak cech rynku');
    assert.ok(Array.isArray(d.news), 'cechy kalendarza są');
    const b = idx.get({ instruments: ['NQ'], from: '2024-03-11', to: '2024-03-13' });
    assert.ok(idx.stats.reads > 0, 'domyślnie cechy rynku liczone jak dotąd');
    assert.ok(b.days.find((x) => x.day === '2024-03-12').mkt.NQ);
  });

  // ---- #9 zapis indeksu ----
  test('backtest-G2: błąd zapisu pliku indeksu nie wywraca get', async () => {
    const { createDayIndex } = await imp('lib/backtest-index.mjs');
    const { createCandles } = await imp('lib/candles.mjs');
    const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
    const baseDir = path.join(H.tmp(), 'chart-data');
    await syntheticDay(baseDir, { instrument: 'NQ', day: '2024-03-12', seed: 3 });
    mkdirSync(path.join(baseDir, 'backtest', 'day-index-NQ.json'), { recursive: true }); // rename na katalog = EPERM/EISDIR jak przy pliku zajętym przez antywirus
    const logs = [];
    const none = { range: (from, to) => ({ from, to, events: [] }) };
    const idx = createDayIndex({ baseDir, candles: createCandles({ getKey: () => null, getConfig: () => ({}), baseDir }), news: none, earnings: none, log: (...a) => logs.push(a.join(' ')) });
    let r;
    assert.doesNotThrow(() => { r = idx.get({ instruments: ['NQ'], from: '2024-03-11', to: '2024-03-13' }); });
    assert.ok(r.days.find((x) => x.day === '2024-03-12').mkt.NQ, 'cechy policzone mimo błędu zapisu');
    assert.ok(logs.some((l) => /indeks/i.test(l)), `błąd zapisu w logu: ${JSON.stringify(logs)}`);
  });

  // ---- #7 etykieta ATR, #10c budżet szablonów ----
  test('backtest-G2: etykieta ATR zgodna z liczeniem i budżet szablonów', async () => {
    const w = readFileSync(path.join(ROOT, 'public/js/bt-filtr-widok.js'), 'utf8');
    const en = JSON.parse(readFileSync(path.join(ROOT, 'public/i18n/en.json'), 'utf8'));
    assert.ok(!w.includes('Zakres poprzedniej sesji do ATR(14)'), 'stara etykieta usunięta');
    assert.ok(w.includes('ATR(14) do średniej z 60 sesji'), 'nowa etykieta PL');
    assert.match(en['ATR(14) do średniej z 60 sesji'] || '', /60/, 'etykieta EN');
    const C = await imp('public/js/bt-czas.js');
    assert.equal(typeof C.templatesSize, 'function');
    const f = (i) => ({ op: 'and', not: false, items: Array.from({ length: 30 }, (_, j) => ({ k: 'event', name: `Wydarzenie numer ${i}-${j} ${'x'.repeat(20)}` })) });
    const list = Array.from({ length: 40 }, (_, i) => C.templateEntry(`S${i}`, f(i)));
    assert.ok(C.templatesSize(list) > C.TEMPLATES_BUDGET, 'zestaw testowy przekracza budżet');
    const s = C.sanitizeBt({ templates: list });
    assert.ok(C.templatesSize(s.templates) <= C.TEMPLATES_BUDGET, 'sanitizeBt trzyma budżet');
    assert.ok(s.templates.length >= 1 && s.templates[0].name === 'S0', 'zostają pierwsze');
  });

  // ---- przeglądarka ----
  const runs = {};
  function page(file, part, port, width = 1920) {
    runs[`${file}${part}`] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      const S = await H.server(port, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try { return JSON.parse(await P.cdpPage(`${S.base}/__testy/${file}?part=${part}`, { width, height: width === 375 ? 800 : 1080, timeoutMs: 120_000 })); } finally { S.stop(); }
    })();
    return runs[`${file}${part}`];
  }
  async function tagged(file, part, port, tag, min) {
    const res = await page(file, part, port);
    if (!res) skip('brak Chrome/Edge');
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }
  const K = (tag, min) => tagged('backtest-kreator.html', 'poprawki', 4926, tag, min);
  test('backtest-G2: edytor filtra nie wstrzykuje HTML z szablonu ani z sesji', () => K('xss', 5));
  test('backtest-G2: Utwórz po zwinięciu filtra i zmianie dat', () => K('utworz', 3));
  test('backtest-G2: lista szablonów świeża przy zapisie', () => K('szablony', 3));
  test('backtest-G2: wydarzenie całodniowe bez 0:00, notka przy gap', () => K('drobne', 4));
  test('backtest-G2: liczby mnogie w nagłówku statystyk', () => tagged('backtest-staty.html', 'plural', 4927, 'plural', 4));
  test('backtest-G2: statystyki czytają lekkie źródło i raportują pominięte sesje', () => tagged('backtest-staty.html', 'zrodlo', 4928, 'zrodlo', 6));
};
