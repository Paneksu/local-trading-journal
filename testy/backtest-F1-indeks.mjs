// backtest-F1: indeks cech dnia (lib/backtest-index.mjs): kalendarz, newsy, OPEX, earningsy, rynek przed 9:30, pamięć i wydajność.
// Dane wyłącznie syntetyczne w katalogach tymczasowych; newsy z plików data/news (bez sieci), earningsy to atrapa.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const noEarn = { range: (from, to) => ({ from, to, events: [] }) };
  const noNews = { range: (from, to) => ({ from, to, events: [] }) };

  async function realNews() {
    const { createNews } = await imp('lib/news-service.mjs');
    return createNews({ baseDir: H.tmp(), fetchImpl: async () => { throw new Error('brak sieci w testach'); }, now: () => Date.UTC(2026, 9, 30), log: () => {} });
  }
  async function candlesOf(baseDir) {
    const { createCandles } = await imp('lib/candles.mjs');
    return createCandles({ getKey: () => null, getConfig: () => ({}), baseDir });
  }

  // ---- ręcznie zbudowane świece 1m (ceny w punktach, w magazynie ×100) ----
  const px = (x) => Math.round(x * 100);
  async function nyUtc(day, hh, mm) {
    const { etToUtc } = await imp('lib/news.mjs');
    const { dayNum } = await imp('public/js/swiece.js');
    const [y, m, d] = day.split('-').map(Number);
    return etToUtc(dayNum(y, m, d), hh, mm);
  }
  // putDay: noc [18:00 poprzedniego dnia, 9:30) i sesja [9:30, 16:00) jednego dnia.
  // on = { mid, hi, lo, last }: cała noc płaska na mid, jedna świeca z maksimum hi, jedna z minimum lo, ostatnia świeca zamyka się na last.
  // rth = { o, h, l, c }: pierwsza świeca otwiera na o, jedna ma maksimum h, jedna minimum l, ostatnia (15:59) zamyka na c; środek płaski między o i c.
  async function putDay(baseDir, sym, day, { on, rth, prevCal }) {
    const store = await imp('lib/candles-store.mjs');
    const open = await nyUtc(day, 9, 30), end = await nyUtc(day, 16, 0), onFrom = await nyUtc(prevCal, 18, 0);
    if (on) {
      const bars = [];
      for (let t = onFrom; t < open; t += 60) bars.push([t, px(on.mid), px(on.mid), px(on.mid), px(on.mid), 1]);
      bars[0] = [bars[0][0], px(on.mid), px(on.hi), px(on.mid), px(on.mid), 1];
      bars[1] = [bars[1][0], px(on.mid), px(on.mid), px(on.lo), px(on.mid), 1];
      const last = bars.length - 1;
      bars[last] = [bars[last][0], px(on.mid), px(on.mid), px(on.mid), px(on.last), 1];
      store.writeRange(sym, '1m', onFrom, open, bars, {}, { baseDir });
    }
    if (rth) {
      const bars = [];
      for (let t = open; t < end; t += 60) bars.push([t, px(rth.o), px(rth.o), px(rth.o), px(rth.o), 1]);
      bars[0] = [bars[0][0], px(rth.o), px(rth.o), px(rth.o), px(rth.o), 1];
      bars[1] = [bars[1][0], px(rth.o), px(rth.h), px(rth.o), px(rth.o), 1];
      bars[2] = [bars[2][0], px(rth.o), px(rth.o), px(rth.l), px(rth.o), 1];
      const last = bars.length - 1;
      bars[last] = [bars[last][0], px(rth.c), px(rth.c), px(rth.c), px(rth.c), 1];
      store.writeRange(sym, '1m', open, end, bars, {}, { baseDir });
    }
  }
  // Pt 8.03 → pn 11.03 → wt 12.03 → śr 13.03.2024 (NQ).
  async function handDataset(baseDir, tamperTue = false) {
    await putDay(baseDir, 'NQ', '2024-03-08', { rth: { o: 17990, h: 18120, l: 17900, c: 17980 }, prevCal: '2024-03-07' });
    await putDay(baseDir, 'NQ', '2024-03-11', { on: { mid: 18010, hi: 18030, lo: 17990, last: 17995 }, rth: { o: 18000, h: 18100, l: 17950, c: 18050 }, prevCal: '2024-03-10' });
    await putDay(baseDir, 'NQ', '2024-03-12', {
      on: { mid: 18060, hi: 18090, lo: 18040, last: 18070 }, prevCal: '2024-03-11',
      rth: { o: 18062.5, h: tamperTue ? 18500 : 18200, l: tamperTue ? 17000 : 18000, c: tamperTue ? 18300 : 18150 },
    });
    await putDay(baseDir, 'NQ', '2024-03-13', { on: { mid: 18150, hi: 18170, lo: 18140, last: 18160 }, rth: { o: 18155, h: 18210, l: 18120, c: 18190 }, prevCal: '2024-03-12' });
  }
  // Wt 12.03: tamperTue zmienia tylko świece PO 9:30 tego dnia (nocne i otwarcie bez zmian), ale od otwarcia o jedną świecę dalej (wiersz 9:30 identyczny).
  async function tamperAfterOpen(baseDir) {
    const store = await imp('lib/candles-store.mjs');
    const open = await nyUtc('2024-03-12', 9, 30), end = await nyUtc('2024-03-12', 16, 0);
    const bars = store.readRange('NQ', '1m', open, end, { baseDir });
    const out = bars.map((b, i) => (i === 0 ? b : [b[0], b[1], b[2] + px(300), b[3] - px(300), b[4] + px(120), b[5]]));
    store.writeRange('NQ', '1m', open, end, out, {}, { baseDir });
  }

  test('backtest-F1: gap, overnight, poprzedni dzień', async () => {
    const { createDayIndex } = await imp('lib/backtest-index.mjs');
    const baseDir = H.tmp();
    await handDataset(baseDir);
    const idx = createDayIndex({ baseDir, candles: await candlesOf(baseDir), news: noNews, earnings: noEarn });
    const g = idx.get({ instruments: ['NQ'], from: '2024-03-11', to: '2024-03-13' });
    const by = Object.fromEntries(g.days.map((d) => [d.day, d]));
    const m = by['2024-03-12'].mkt.NQ;
    assert.equal(m.gapPts, 12.5, 'otwarcie 9:30 wtorku 18062,5 względem zamknięcia 16:00 poniedziałku 18050');
    assert.ok(Math.abs(m.gapPct - (12.5 / 18050) * 100) < 1e-9, 'gapPct z zamknięcia 16:00');
    assert.equal(m.onRange, 50, '18:00–9:30: 18090 − 18040');
    assert.equal(m.prevRange, 150, 'poniedziałek 18100 − 17950');
    assert.equal(m.prevDir, 'up');
    assert.equal(m.inside, true, 'poniedziałek mieści się w zakresie piątku (18100 < 18120, 17950 > 17900)');
    assert.equal(m.preVsPd, 'inside', 'ostatnia cena przed 9:30 (18070) między PDL 17950 a PDH 18100');
    assert.equal(m.atr14, null, 'za mało dni historii na ATR(14)');
    assert.equal(m.atrRatio, null);
    // środa: wczorajszy wtorek 200 pkt, poniedziałek–wtorek nie jest dniem wewnętrznym (wtorek wychodzi poza poniedziałek)
    const w = by['2024-03-13'].mkt.NQ;
    assert.equal(w.prevRange, 200); assert.equal(w.prevDir, 'up'); assert.equal(w.inside, false);
    assert.equal(w.preVsPd, 'inside');
    // pokrycie: dzień ma 1m, ale nie ma 1s
    assert.equal(by['2024-03-12'].has1m.NQ, true); assert.equal(by['2024-03-12'].has1s.NQ, false);
  });

  test('backtest-F1: bez przyszłości w cechach rynku', async () => {
    const { createDayIndex } = await imp('lib/backtest-index.mjs');
    const A = H.tmp(), B = H.tmp();
    await handDataset(A); await handDataset(B);
    await tamperAfterOpen(B); // po 9:30 wtorku dane inne (wyższe maksima, niższe minima, inne zamknięcie)
    const feat = async (dir) => {
      const idx = createDayIndex({ baseDir: dir, candles: await candlesOf(dir), news: noNews, earnings: noEarn });
      return Object.fromEntries(idx.get({ instruments: ['NQ'], from: '2024-03-11', to: '2024-03-13' }).days.map((d) => [d.day, d]));
    };
    const a = await feat(A), b = await feat(B);
    assert.deepEqual(a['2024-03-12'].mkt, b['2024-03-12'].mkt, 'cechy rynku wtorku nie zależą od świec po 9:30 wtorku');
    assert.deepEqual(a['2024-03-11'].mkt, b['2024-03-11'].mkt);
    assert.notDeepEqual(a['2024-03-13'].mkt, b['2024-03-13'].mkt, 'środa już widzi zakończony wtorek (kontrola, że zmiana danych była widoczna)');
  });

  // ---- [U] 30.10.2026 «Gap od ceny startu»: gap i cechy nocy liczone do godziny startu replayu sesji (najpóźniej 9:30 NY) ----
  test('backtest-F1: gap od ceny startu (start 9:00 i 9:45)', async () => {
    const { createDayIndex } = await imp('lib/backtest-index.mjs');
    const baseDir = H.tmp();
    await handDataset(baseDir);
    const idx = createDayIndex({ baseDir, candles: await candlesOf(baseDir), news: noNews, earnings: noEarn });
    const at = (start) => Object.fromEntries(idx.get({ instruments: ['NQ'], from: '2024-03-11', to: '2024-03-13', start }).days.map((d) => [d.day, d]));
    const m9 = at('09:00')['2024-03-12'].mkt.NQ;
    assert.equal(m9.gapPts, 10, 'start 9:00: ostatnia cena przed 9:00 (noc płaska 18060) względem zamknięcia poniedziałku 18050');
    assert.ok(Math.abs(m9.gapPct - (10 / 18050) * 100) < 1e-9);
    assert.equal(m9.onRange, 50, 'noc 18:00–9:00: 18090 − 18040');
    assert.equal(m9.preVsPd, 'inside');
    const m945 = at('09:45')['2024-03-12'].mkt.NQ;
    assert.equal(m945.gapPts, 12.5, 'start ≥ 9:30: jak dotąd, od otwarcia 9:30');
    assert.deepEqual(m945, at(undefined)['2024-03-12'].mkt.NQ, 'bez godziny startu: jak dotąd');
    // ten sam dzień w pamięci indeksu z dwiema godzinami startu nie miesza wyników
    assert.equal(at('09:00')['2024-03-12'].mkt.NQ.gapPts, 10);
    assert.throws(() => idx.get({ instruments: ['NQ'], from: '2024-03-11', to: '2024-03-13', start: '9:00' }), /godzin/i, 'zła godzina startu');
  });

  test('backtest-F1: bez danych po godzinie startu w cechach rynku', async () => {
    const { createDayIndex } = await imp('lib/backtest-index.mjs');
    const store = await imp('lib/candles-store.mjs');
    const A = H.tmp(), B = H.tmp();
    await handDataset(A); await handDataset(B);
    // B: świece wtorku między 9:00 a 9:30 inne (skrajne maksimum i minimum, inna ostatnia cena przed 9:30)
    const from = await nyUtc('2024-03-12', 9, 0), open = await nyUtc('2024-03-12', 9, 30);
    const bars = store.readRange('NQ', '1m', from, open, { baseDir: B });
    store.writeRange('NQ', '1m', from, open, bars.map((b) => [b[0], b[1], b[2] + px(400), b[3] - px(400), b[4] + px(200), b[5]]), {}, { baseDir: B });
    const feat = async (dir, start) => {
      const idx = createDayIndex({ baseDir: dir, candles: await candlesOf(dir), news: noNews, earnings: noEarn });
      return idx.get({ instruments: ['NQ'], from: '2024-03-12', to: '2024-03-12', start }).days[0].mkt;
    };
    assert.deepEqual(await feat(A, '09:00'), await feat(B, '09:00'), 'start 9:00: cechy wtorku nie zależą od świec 9:00–9:30');
    assert.notDeepEqual(await feat(A, '09:15'), await feat(B, '09:15'), 'kontrola: start 9:15 widzi zmienione świece 9:00–9:15');
  });

  test('backtest-F1: newsy dnia', async () => {
    const { createDayIndex } = await imp('lib/backtest-index.mjs');
    const idx = createDayIndex({ baseDir: H.tmp(), news: await realNews(), earnings: noEarn });
    const g = idx.get({ instruments: ['NQ'], from: '2024-03-11', to: '2024-03-22' });
    const by = Object.fromEntries(g.days.map((d) => [d.day, d]));
    const cpi = by['2024-03-12'].news;
    assert.equal(cpi.filter((n) => n.name === 'CPI').length, 1, 'cztery odczyty CPI o 8:30 to jedno wydarzenie dnia');
    assert.deepEqual(cpi.find((n) => n.name === 'CPI'), { name: 'CPI', kind: 'data', imp: 'high', hm: '08:30', when: 'pre' });
    const fomc = by['2024-03-20'].news.find((n) => n.name === 'FOMC');
    assert.ok(fomc, 'FOMC 20.03.2024');
    assert.equal(fomc.hm, '14:00'); assert.equal(fomc.when, 'post'); assert.equal(fomc.imp, 'high');
    assert.ok(by['2024-03-20'].news.some((n) => n.name === 'FOMC Press Conference' && n.hm === '14:30'));
    assert.ok(by['2024-03-20'].news.every((n) => !['holiday', 'opex'].includes(n.kind)), 'święta i OPEX to osobne cechy');
    assert.equal(by['2024-03-12'].fedChair, false);
    // godzina w czasie zimowym i okno 9:30–11:00
    const w = createDayIndex({ baseDir: H.tmp(), news: { range: () => ({ events: [
      { t: Date.UTC(2024, 0, 10, 15, 0) / 1000, day: '2024-01-10', name: 'ISM Services PMI', imp: 'high', kind: 'data', allDay: false },
      { t: Date.UTC(2024, 0, 10, 16, 30) / 1000, day: '2024-01-10', name: 'Fed Chair Speaks', imp: 'high', kind: 'speech', allDay: false },
    ] }) }, earnings: noEarn }).get({ instruments: ['NQ'], from: '2024-01-10', to: '2024-01-10' }).days[0];
    assert.deepEqual(w.news.map((n) => [n.name, n.hm, n.when]), [['ISM Services PMI', '10:00', 'open'], ['Fed Chair Speaks', '11:30', 'post']]);
    assert.equal(w.fedChair, true, 'przemówienie przewodniczącego');
  });

  test('backtest-F1: OPEX, tydzień rolla, święta', async () => {
    const { createDayIndex } = await imp('lib/backtest-index.mjs');
    const idx = createDayIndex({ baseDir: H.tmp(), news: await realNews(), earnings: noEarn });
    const g = idx.get({ instruments: ['NQ'], from: '2024-03-04', to: '2024-04-26' });
    const by = Object.fromEntries(g.days.map((d) => [d.day, d]));
    assert.equal(by['2024-03-15'].opex, 'quarterly', 'trzeci piątek marca');
    assert.equal(by['2024-04-19'].opex, 'monthly', 'trzeci piątek kwietnia');
    assert.equal(by['2024-03-14'].opex, null);
    for (const d of ['2024-03-11', '2024-03-12', '2024-03-13', '2024-03-14', '2024-03-15']) { assert.equal(by[d].opexWeek, true, d); assert.equal(by[d].rollWeek, true, `rolla ${d}`); }
    for (const d of ['2024-03-04', '2024-03-18', '2024-04-12']) assert.equal(by[d].opexWeek, false, d);
    assert.equal(by['2024-04-15'].opexWeek, true); assert.equal(by['2024-04-15'].rollWeek, false, 'kwiecień nie jest miesiącem wygaśnięcia ES i NQ');
    assert.equal(by['2024-03-18'].rollWeek, false);
    // święto: Dziękczynienie 28.11.2024
    const h = idx.get({ instruments: ['NQ'], from: '2024-11-25', to: '2024-12-02' }).days;
    const hb = Object.fromEntries(h.map((d) => [d.day, d]));
    assert.deepEqual(hb['2024-11-27'].holiday, { before: true, after: false });
    assert.deepEqual(hb['2024-11-29'].holiday, { before: false, after: true });
    assert.deepEqual(hb['2024-11-26'].holiday, { before: false, after: false });
  });

  test('backtest-F1: earningsy dnia', async () => {
    const { createDayIndex } = await imp('lib/backtest-index.mjs');
    const ev = (day, session, cls) => ({ day, session, cls, t: 0 });
    const earnings = { range: () => ({ events: [ev('2024-03-12', 'bmo', 1), ev('2024-03-12', 'amc', 2), ev('2024-03-15', 'amc', 3), ev('2024-03-13', 'dmh', 1)] }) };
    const g = createDayIndex({ baseDir: H.tmp(), news: noNews, earnings }).get({ instruments: ['NQ'], from: '2024-03-11', to: '2024-03-18' });
    const by = Object.fromEntries(g.days.map((d) => [d.day, d]));
    assert.deepEqual(by['2024-03-12'].earnings, [{ cls: 1, when: 'bmo' }]);
    assert.deepEqual(by['2024-03-13'].earnings, [{ cls: 2, when: 'prevAmc' }], 'wyniki po zamknięciu poprzedniego dnia; w trakcie sesji pominięte');
    assert.deepEqual(by['2024-03-18'].earnings, [{ cls: 3, when: 'prevAmc' }], 'piątkowe AMC działa w poniedziałek');
    assert.deepEqual(by['2024-03-11'].earnings, []);
  });

  test('backtest-F1: dzień bez danych', async () => {
    const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
    const { createDayIndex } = await imp('lib/backtest-index.mjs');
    const store = await imp('lib/candles-store.mjs');
    const baseDir = H.tmp();
    await syntheticDay(baseDir, { instrument: 'NQ', day: '2024-03-12', seed: 3, gaps: [[await nyUtc('2024-03-12', 10, 0), await nyUtc('2024-03-12', 10, 5)]] }); // dziury sekund w pokrytym oknie: ok
    await syntheticDay(baseDir, { instrument: 'NQ', day: '2024-03-13', seed: 4, has1s: false });
    await syntheticDay(baseDir, { instrument: 'ES', day: '2024-03-12', seed: 5, has1s: false });
    // ES: wytnij pokrycie 1m na wtorek po 15:00 przez zapis tylko do 15:00 innego dnia
    const idx = createDayIndex({ baseDir, candles: await candlesOf(baseDir), news: noNews, earnings: noEarn });
    const g = idx.get({ instruments: ['NQ', 'ES'], from: '2024-03-11', to: '2024-03-14' });
    const by = Object.fromEntries(g.days.map((d) => [d.day, d]));
    assert.equal(by['2024-03-12'].has1s.NQ, true);
    assert.equal(by['2024-03-13'].has1s.NQ, false, 'okno 1s niepełne');
    assert.equal(by['2024-03-12'].has1m.ES, true);
    assert.equal(by['2024-03-13'].has1m.ES, false, 'ES bez pokrycia 1m');
    assert.ok(!('ES' in by['2024-03-12'].has1s), 'ES nie ma has1s (decyzja 30.10.2026)');
    assert.ok(by['2024-03-12'].mkt.ES, 'cechy rynku także dla ES'); assert.ok(!by['2024-03-13'].mkt.ES, 'brak 1m ES: brak mkt');
    // pokrycie 1m ES niepełne: tylko do 15:00 NY
    const baseDir2 = H.tmp();
    const from = await nyUtc('2024-03-12', 9, 30), to = await nyUtc('2024-03-12', 15, 0);
    const bars = []; for (let t = from; t < to; t += 60) bars.push([t, px(5000), px(5001), px(4999), px(5000), 1]);
    store.writeRange('ES', '1m', from, to, bars, {}, { baseDir: baseDir2 });
    const d = createDayIndex({ baseDir: baseDir2, candles: await candlesOf(baseDir2), news: noNews, earnings: noEarn }).get({ instruments: ['ES'], from: '2024-03-12', to: '2024-03-12' }).days[0];
    assert.equal(d.has1m.ES, false, 'pokrycie 1m [9:30, 16:00) niepełne');
  });

  test('backtest-F1: pamięć indeksu', async () => {
    const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
    const { createDayIndex, INDEX_VERSION } = await imp('lib/backtest-index.mjs');
    const baseDir = H.tmp();
    const days = ['04', '05', '06', '07', '08', '11', '12', '13', '14', '15', '18', '19', '20', '21', '22'].map((d) => `2024-03-${d}`);
    for (const day of days) await syntheticDay(baseDir, { instrument: 'NQ', day, seed: Number(day.slice(-2)), has1s: false });
    const mk = async () => createDayIndex({ baseDir, candles: await candlesOf(baseDir), news: await realNews(), earnings: noEarn });
    const idx = await mk();
    const q = { instruments: ['NQ'], from: '2024-03-04', to: '2024-03-22' };
    const g1 = idx.get(q);
    const first = idx.stats.reads;
    assert.ok(first >= 15, `pierwsze zbudowanie czyta świece dni z danymi (${first})`);
    const g2 = idx.get(q);
    assert.equal(idx.stats.reads, first, 'drugie get nie liczy dni ponownie (licznik obliczeń 0)');
    assert.deepEqual(g2, g1);
    const file = path.join(baseDir, 'backtest', 'day-index-NQ.json');
    assert.ok(existsSync(file), 'indeks zapisany w chart-data/backtest/day-index-NQ.json');
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(saved.version, INDEX_VERSION); assert.equal(typeof saved.coverageVersion, 'number');
    // nowy proces: indeks wczytany z pliku, zero odczytów świec
    const idx2 = await mk();
    assert.deepEqual(idx2.get(q), g1);
    assert.equal(idx2.stats.reads, 0, 'drugi proces nie czyta świec');
    // nowe pokrycie jednego dnia: przeliczony tylko ten dzień
    await syntheticDay(baseDir, { instrument: 'NQ', day: '2024-03-25', seed: 25, has1s: false });
    const g3 = idx2.get({ ...q, to: '2024-03-25' });
    assert.equal(idx2.stats.reads, 1, 'przeliczony tylko dzień ze zmienionym pokryciem');
    assert.equal(g3.days.find((d) => d.day === '2024-03-25').has1m.NQ, true);
    assert.deepEqual(g3.days.filter((d) => d.day <= '2024-03-22'), g1.days, 'dni sprzed zmiany bez zmian');
    // inna wersja indeksu: przeliczenie całości
    const bad = JSON.parse(readFileSync(file, 'utf8')); bad.version = INDEX_VERSION - 1;
    writeFileSync(file, JSON.stringify(bad));
    const idx3 = await mk();
    idx3.get(q);
    assert.ok(idx3.stats.reads >= first, `INDEX_VERSION inny: przeliczenie całości (${idx3.stats.reads})`);
  });

  test('backtest-F1: rok w czasie', async () => {
    const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
    const { createDayIndex } = await imp('lib/backtest-index.mjs');
    const { dayNum, fromDayNum, weekdayOf } = await imp('public/js/swiece.js');
    const baseDir = H.tmp();
    const days = [];
    for (let n = dayNum(2024, 1, 1); n <= dayNum(2024, 12, 31); n++) if (weekdayOf(n) >= 1 && weekdayOf(n) <= 5) { const { y, mo, d } = fromDayNum(n); days.push(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`); }
    assert.equal(days.length, 262);
    for (const day of days) await syntheticDay(baseDir, { instrument: 'NQ', day, seed: Number(day.replace(/-/g, '')) % 99991, has1s: false, ctx: 1 });
    const idx = createDayIndex({ baseDir, candles: await candlesOf(baseDir), news: await realNews(), earnings: noEarn });
    const q = { instruments: ['NQ'], from: '2024-01-01', to: '2024-12-31' };
    let t0 = performance.now();
    const g = idx.get(q);
    const build = performance.now() - t0;
    t0 = performance.now();
    idx.get(q);
    const cached = performance.now() - t0;
    assert.equal(g.days.length, 262);
    assert.ok(build < 4000, `pierwsze zbudowanie roku ${Math.round(build)} ms (limit 4000)`);
    assert.ok(cached < 100, `odczyt z pamięci ${Math.round(cached)} ms (limit 100)`);
    const last = g.days[g.days.length - 1].mkt.NQ;
    assert.ok(Number.isFinite(last.atr14) && last.atr14 > 0 && Number.isFinite(last.atrRatio), 'pod koniec roku jest ATR(14) i jego stosunek do 60 dni');
  });
};
