// backtest-H1: odbiór na kopii prawdziwych świec. Tu tylko testy szybkie, na danych syntetycznych (run.mjs): skrypt kopii (źródło wyłącznie czytane,
// cel poza worktree) i regresje usterek P1 znalezionych w odbiorze. Scenariusz pełny i pomiary na prawdziwych świecach: testy/backtest-e2e.mjs (osobno).
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import fsp from 'node:fs/promises';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

  // źródło syntetyczne w układzie chart-data (bez prawdziwych świec): warstwy, pliki dni, pliki pomocnicze i takie, których kopiować nie wolno
  function fakeSource() {
    const src = path.join(H.tmp(), 'chart-data');
    const put = (rel, txt = 'x') => { const f = path.join(src, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, txt); };
    for (const sym of ['NQ', 'ES']) {
      put(`candles/${sym}/coverage.json`, '{}');
      for (const d of ['2023-10-31', '2023-11-01', '2024-06-03', '2024-12-31', '2025-01-02']) put(`candles/${sym}/1m/${d}.bin`, d);
      put(`candles/${sym}/1m-${sym}H2024/2024-03-11.bin`);
      put(`candles/${sym}/obce/2024-03-11.bin`);
    }
    put('candles/NQ/1s/2024-03-13.bin'); put('candles/NQ/1s-NQH2024/2024-03-12.bin');
    put('contracts-nq.json', '{}'); put('contracts-es.json', '{}');
    put('news/fred.json', '{}'); put('news/ff/2026-W44.json', '{}'); put('earnings/caps.json', '{}');
    put('queue.json', '{}'); put('import-1s-nq.json', '{}'); put('backtest/sessions/bt-abcdef.json', '{}'); put('drawings-cache/a.json', '{}');
    writeFileSync(path.join(path.dirname(src), '.env'), 'DATABENTO_API_KEY=nie-kopiowac\n');
    return src;
  }
  // fs z rejestrem wywołań: każda operacja z argumentami ścieżek
  function spyFs() {
    const calls = [];
    const wrap = (name) => async (...a) => { calls.push([name, ...a.filter((x) => typeof x === 'string')]); return fsp[name](...a); };
    return { calls, fs: { readdir: wrap('readdir'), stat: wrap('stat'), mkdir: wrap('mkdir'), copyFile: wrap('copyFile') } };
  }
  const under = (p, dir) => path.resolve(p).toLowerCase().startsWith(path.resolve(dir).toLowerCase());

  test('backtest-H1: kopia świec tylko czyta źródło', async () => {
    const { copyForAcceptance } = await imp('narzedzia/kopia-swiec-odbior.mjs');
    const src = fakeSource(), dst = path.join(H.tmp(), 'backtest-dane', 'chart-data');
    const S = spyFs();
    const r = await copyForAcceptance({ src, dst, from: '2023-11-01', to: '2024-12-31', fs: S.fs });
    // operacje na ścieżkach źródła: readdir, stat i copyFile wyłącznie jako ŹRÓDŁO (pierwszy argument)
    for (const [op, a, b] of S.calls) {
      if (op === 'copyFile') { assert.ok(under(a, src) && under(b, dst) && !under(b, src), `copyFile ${a} → ${b}`); continue; }
      if (op === 'mkdir') { assert.ok(under(a, dst), `mkdir tylko w celu: ${a}`); continue; }
      assert.ok(op === 'readdir' || op === 'stat', `dozwolone tylko odczyty: ${op}`);
    }
    const ops = new Set(S.calls.map((c) => c[0]));
    assert.deepEqual([...ops].filter((o) => !['readdir', 'stat', 'mkdir', 'copyFile'].includes(o)), [], 'żadnych innych operacji');
    // co trafiło do celu
    const has = (rel) => existsSync(path.join(dst, rel));
    for (const sym of ['NQ', 'ES']) {
      assert.ok(has(`candles/${sym}/coverage.json`) && has(`candles/${sym}/1m/2023-11-01.bin`) && has(`candles/${sym}/1m/2024-12-31.bin`) && has(`candles/${sym}/1m-${sym}H2024/2024-03-11.bin`), `${sym}: dni z zakresu i coverage`);
      assert.ok(!has(`candles/${sym}/1m/2023-10-31.bin`) && !has(`candles/${sym}/1m/2025-01-02.bin`), `${sym}: dni spoza zakresu pominięte`);
      assert.ok(!has(`candles/${sym}/obce`), `${sym}: katalog spoza warstw pominięty`);
    }
    assert.ok(has('candles/NQ/1s/2024-03-13.bin') && has('candles/NQ/1s-NQH2024/2024-03-12.bin'), 'warstwy 1s i 1s kontraktu');
    assert.ok(has('contracts-nq.json') && has('contracts-es.json') && has('news/fred.json') && has('news/ff/2026-W44.json') && has('earnings/caps.json'), 'kontrakty, newsy, earningsy');
    for (const rel of ['queue.json', 'import-1s-nq.json', 'backtest', 'drawings-cache', '../.env']) assert.ok(!has(rel), `nie kopiuje: ${rel}`);
    assert.equal(readFileSync(path.join(dst, 'candles/NQ/1m/2024-06-03.bin'), 'utf8'), '2024-06-03', 'treść bez zmian');
    // drugi przebieg nic nie kopiuje (te same rozmiary); --proba niczego nie zapisuje
    const r2 = await copyForAcceptance({ src, dst, from: '2023-11-01', to: '2024-12-31' });
    assert.equal(r2.copied, 0); assert.equal(r2.skipped, r.files);
    const dst2 = path.join(H.tmp(), 'proba');
    const S2 = spyFs();
    const r3 = await copyForAcceptance({ src, dst: dst2, from: '2023-11-01', to: '2024-12-31', dry: true, fs: S2.fs });
    assert.equal(r3.files, r.files); assert.ok(!S2.calls.some((c) => c[0] === 'copyFile' || c[0] === 'mkdir'), 'próba bez zapisu');
    // tekst skryptu: żadnych funkcji zapisu poza mkdir i copyFile
    const txt = readFileSync(path.join(ROOT, 'narzedzia/kopia-swiec-odbior.mjs'), 'utf8');
    assert.ok(!/\b(writeFile|appendFile|rename|unlink|rm|rmdir|truncate|open|createWriteStream|utimes|chmod)(Sync)?\s*\(/.test(txt), 'skrypt nie ma innych operacji zapisu');
  });

  test('backtest-H1: kopia świec odmawia celu w worktree i w źródle', async () => {
    const { copyForAcceptance } = await imp('narzedzia/kopia-swiec-odbior.mjs');
    const src = fakeSource();
    await assert.rejects(copyForAcceptance({ src, dst: path.join(ROOT, 'chart-data'), root: ROOT }), /worktree/);
    await assert.rejects(copyForAcceptance({ src, dst: path.join(src, 'kopia'), root: ROOT }), /nachodzą/);
    await assert.rejects(copyForAcceptance({ src, dst: path.join(H.tmp(), 'x'), from: '2024-12-31', to: '2024-01-01' }), /zakres/);
  });

  // Usterka P1 z odbioru (30.10.2026): indeks dni liczył has1s tylko z warstwy .v.0 (`1s`), a w tygodniu rolla okno 1s leży w warstwie kontraktu
  // (`1s-NQH2024`), z której czyta trasa dnia replayu. Na prawdziwych danych 2020–2024 wypadło 39 dni (m.in. CPI 2024-03-12) z powodem „brak sekund”.
  test('backtest-H1: indeks liczy 1s z warstwy kontraktu (tydzień rolla)', async () => {
    const { createDayIndex } = await imp('lib/backtest-index.mjs');
    const { tr: t } = await imp('lib/i18n.mjs');
    const { etToUtc } = await imp('lib/news.mjs');
    const { dayNum } = await imp('public/js/swiece.js');
    const ny = (y, m, d, hh, mm) => etToUtc(dayNum(y, m, d), hh, mm);
    const base = path.join(H.tmp(), 'chart-data');
    mkdirSync(path.join(base, 'candles', 'NQ'), { recursive: true });
    const win = (d) => [ny(2024, 3, d, 9, 30), ny(2024, 3, d, 11, 0)];
    const cov = {
      '1m': [[ny(2024, 3, 1, 0, 0), ny(2024, 3, 20, 0, 0)]],
      '1s': [win(13)], // .v.0: tylko 13.03
      '1s-NQH2024': [win(11), win(12)], // tydzień rolla: okna 11 i 12.03 w warstwie kontraktu
      '1s-NQM2024': [[ny(2024, 3, 14, 9, 30), ny(2024, 3, 14, 10, 0)], [ny(2024, 3, 14, 10, 0), ny(2024, 3, 14, 11, 0)]], // dwa kawałki jednego okna
    };
    writeFileSync(path.join(base, 'candles', 'NQ', 'coverage.json'), JSON.stringify(cov));
    const noEv = { range: (from, to) => ({ from, to, events: [] }) };
    const idx = createDayIndex({ candles: null, news: noEv, earnings: noEv, baseDir: base, t });
    const r = idx.get({ instruments: ['NQ'], from: '2024-03-11', to: '2024-03-15', mkt: false });
    const has = Object.fromEntries(r.days.map((d) => [d.day, d.has1s.NQ]));
    assert.deepEqual(has, { '2024-03-11': true, '2024-03-12': true, '2024-03-13': true, '2024-03-14': true, '2024-03-15': false });
  });

  // Usterka P1 z odbioru H1 (30.10.2026, Review Focus 1): rynek zamknięty (2024-01-01, Wielki Piątek 2024-03-29, 2024-12-25) ma pokrycie w coverage.json (Databento
  // oddał pusty zakres), więc indeks dawał has1s/has1m = true, a pula sesji zawierała dzień bez jednej świecy. Dzień bez świec 9:30–16:00 NY wypada z powodem braku danych.
  test('backtest-H1: dzień z pokryciem, ale bez świec (święto) nie trafia do puli', async () => {
    const { createDayIndex } = await imp('lib/backtest-index.mjs');
    const { matchDays } = await imp('public/js/bt-filtr.js');
    const { tr: t } = await imp('lib/i18n.mjs');
    const { etToUtc } = await imp('lib/news.mjs');
    const { dayNum } = await imp('public/js/swiece.js');
    const store = await imp('lib/candles-store.mjs');
    const { createCandles } = await imp('lib/candles.mjs');
    const ny = (d, hh, mm) => etToUtc(dayNum(2024, 3, d), hh, mm);
    const base = path.join(H.tmp(), 'chart-data');
    const flat = (from, to, step, p) => { const out = []; for (let x = from; x < to; x += step) out.push([x, p, p + 100, p - 100, p, 1]); return out; };
    for (const sym of ['NQ', 'ES']) {
      // 1m: pokrycie ciągłe 2024-03-01 … 2024-03-20, świece tylko w dni handlowe poza 2024-03-13 (dzień „zamknięty”)
      store.writeRange(sym, '1m', ny(1, 0, 0), ny(20, 0, 0), [], {}, { baseDir: base });
      for (const d of [4, 5, 6, 7, 8, 11, 12, 14, 15]) store.writeRange(sym, '1m', ny(d - 1, 18, 0) + (d === 11 || d === 4 ? -2 * 86400 : 0), ny(d, 16, 0), flat(ny(d - 1, 18, 0) + (d === 11 || d === 4 ? -2 * 86400 : 0), ny(d, 16, 0), 60, 1800000), {}, { baseDir: base });
    }
    // 1s NQ: okna 9:30–11:00 pobrane w każdy dzień roboczy, także 13.03 (pusty zakres)
    for (const d of [11, 12, 13, 14, 15]) store.writeRange('NQ', '1s', ny(d, 9, 30), ny(d, 11, 0), d === 13 ? [] : flat(ny(d, 9, 30), ny(d, 11, 0), 1, 1800000), {}, { baseDir: base });
    const noEv = { range: (from, to) => ({ from, to, events: [] }) };
    const candles = createCandles({ getKey: () => null, getConfig: () => ({}), baseDir: base });
    const idx = createDayIndex({ candles, news: noEv, earnings: noEv, baseDir: base, t, log: () => {} });
    const r = idx.get({ instruments: ['NQ', 'ES'], from: '2024-03-11', to: '2024-03-15' });
    const by = Object.fromEntries(r.days.map((d) => [d.day, [d.has1s.NQ, d.has1m.NQ, d.has1m.ES]]));
    assert.deepEqual(by['2024-03-12'], [true, true, true], 'zwykły dzień');
    assert.deepEqual(by['2024-03-13'], [false, false, false], 'dzień z pokryciem bez świec');
    const m = matchDays({ instruments: ['NQ'], filter: null, excluded: [] }, r.days);
    assert.ok(!m.days.includes('2024-03-13') && m.excluded.some((x) => x.day === '2024-03-13' && x.reason === 'no1s'), `pula NQ bez 13.03: ${JSON.stringify(m.excluded)}`);
    const me = matchDays({ instruments: ['ES'], filter: null, excluded: [] }, r.days);
    assert.ok(!me.days.includes('2024-03-13') && me.excluded.some((x) => x.day === '2024-03-13' && x.reason === 'no1m'), 'pula ES bez 13.03');
    assert.deepEqual(m.days, ['2024-03-11', '2024-03-12', '2024-03-14', '2024-03-15']);
  });
};
