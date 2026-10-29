// wykresy-01: parser interwału, sesja CME, agregacja świec (dane syntetyczne, czysty moduł).
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, assert, ROOT }) => {
  const load = () => import(pathToFileURL(path.join(ROOT, 'public/js/swiece.js')).href);
  const utc = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
  // otwarcia sesji w UTC wyliczone ręcznie: CDT (UTC-5) 17:00 = 22:00Z, CST (UTC-6) 17:00 = 23:00Z
  const OPEN_MON_26_10 = utc(2026, 10, 25, 22); // niedziela 25.10 17:00 CDT, sesja poniedziałku
  const bar = (t, o, h, l, c, v) => [t, o, h, l, c, v];

  test('wykresy-01: parseTf i pickSource', async () => {
    const S = await load();
    for (const ok of ['1s', '7s', '45s', '90s', '13m', '2h', '4h', '1D', '1W', '9999m']) assert.ok(S.parseTf(ok), ok);
    // P27 (28.10.2026): '5M' to teraz poprawny interwał (5 miesięcy), test miesiąca w wykresy-09b-p27
    for (const bad of ['0s', '10000m', '5x', '', 's', '-5m', '1.5h', ' 5m', '5Y', null, undefined, 5]) assert.equal(S.parseTf(bad), null, String(bad));
    assert.equal(S.parseTf('13m').sec, 780);
    assert.equal(S.parseTf('4h').sec, 14400);
    for (const t of ['13m', '2h', '1D', '1W', '60s', '120s', '1m']) assert.equal(S.pickSource(t), '1m', t);
    for (const t of ['7s', '45s', '90s', '1s']) assert.equal(S.pickSource(t), '1s', t);
    assert.equal(S.pickSource('zly'), null);
    assert.equal(S.aggregate([bar(OPEN_MON_26_10, 1, 1, 1, 1, 1)], '0s'), null);
  });

  test('wykresy-01: sessionBounds, przerwa 16-17 CT, otwarcie w niedzielę 17:00 CT', async () => {
    const S = await load();
    const s = S.sessionBounds(OPEN_MON_26_10 + 100);
    assert.equal(s.open, OPEN_MON_26_10);
    assert.equal(s.close, utc(2026, 10, 26, 21), 'poniedziałek 16:00 CDT = 21:00Z');
    assert.equal(S.sessionBounds(OPEN_MON_26_10).open, OPEN_MON_26_10, 'dokładnie o otwarciu');
    assert.equal(S.sessionBounds(OPEN_MON_26_10 - 1), null, 'sekunda przed otwarciem (niedziela 16:59:59)');
    assert.equal(S.sessionBounds(s.close - 1).open, OPEN_MON_26_10, 'ostatnia sekunda sesji');
    for (const t of [s.close, s.close + 1800, s.close + 3599]) assert.equal(S.sessionBounds(t), null, 'przerwa 16:00-17:00 CT');
    assert.equal(S.sessionBounds(s.close + 3600).open, s.close + 3600, 'wtorek 17:00 CDT otwiera kolejną sesję');
    // piątek 16:00 koniec tygodnia, sobota pusta, niedziela przed 17:00 pusta
    assert.equal(S.sessionBounds(utc(2026, 10, 30, 21)), null, 'piątek 16:00 CDT');
    assert.equal(S.sessionBounds(utc(2026, 10, 30, 22)), null, 'piątek 17:00 CDT: brak sesji');
    assert.equal(S.sessionBounds(utc(2026, 10, 31, 15)), null, 'sobota');
    assert.equal(S.sessionBounds(utc(2026, 11, 1, 20)), null, 'niedziela 14:00 CST');
    assert.equal(S.sessionBounds(utc(2026, 11, 1, 22, 59)), null, 'niedziela 16:59 CST');
    assert.equal(S.sessionBounds(utc(2026, 11, 1, 23)).open, utc(2026, 11, 1, 23), 'niedziela 17:00 CST = 23:00Z');
  });

  test('wykresy-01: DST USA 2026 (8.03 i 1.11) i Europy (29.03 i 25.10): godzina otwarcia w UTC', async () => {
    const S = await load();
    const openAt = (y, mo, d, h) => S.sessionBounds(utc(y, mo, d, h, 1)).open;
    // przed 8.03 zima (23:00Z), od 8.03 CDT (22:00Z); Europa przechodzi 29.03, ale CME liczy Chicago
    assert.equal(openAt(2026, 3, 1, 23), utc(2026, 3, 1, 23), 'niedziela 1.03 CST');
    assert.equal(openAt(2026, 3, 5, 23), utc(2026, 3, 5, 23), 'czwartek 5.03 CST');
    assert.equal(openAt(2026, 3, 8, 22), utc(2026, 3, 8, 22), 'niedziela 8.03 CDT');
    assert.equal(S.sessionBounds(utc(2026, 3, 8, 22) - 1), null, 'niedziela 8.03 21:59:59Z = 16:59 CDT');
    assert.equal(openAt(2026, 3, 15, 22), utc(2026, 3, 15, 22), 'tydzień rozjazdu USA/Europa');
    assert.equal(openAt(2026, 3, 29, 22), utc(2026, 3, 29, 22), '29.03: w Europie zmiana, w Chicago bez zmian');
    assert.equal(openAt(2026, 10, 25, 22), utc(2026, 10, 25, 22), '25.10: Europa zmienia, Chicago nadal CDT');
    assert.equal(openAt(2026, 10, 29, 22), utc(2026, 10, 29, 22), 'czwartek 29.10 CDT');
    assert.equal(openAt(2026, 11, 1, 23), utc(2026, 11, 1, 23), 'niedziela 1.11 po zmianie USA: CST');
    // zamknięcie sesji w piątek 6.03 (CST) i poniedziałek 9.03 (CDT)
    assert.equal(S.sessionBounds(utc(2026, 3, 5, 23) + 60).close, utc(2026, 3, 6, 22), 'piątek 6.03 16:00 CST');
    assert.equal(S.sessionBounds(utc(2026, 3, 8, 22) + 60).close, utc(2026, 3, 9, 21), 'poniedziałek 9.03 16:00 CDT');
    // aggregate na granicy DST: 4h i 1D bez zgubionej/zdublowanej godziny (sesja zawsze 23 h, zmiana w niedzielę 2:00)
    for (const open of [utc(2026, 3, 8, 22), utc(2026, 11, 1, 23), utc(2026, 3, 1, 23)]) {
      const bars = [];
      for (let m = 0; m < 23 * 60; m++) bars.push(bar(open + m * 60, 100, 100 + (m % 5), 99, 100, 1));
      const h4 = S.aggregate(bars, '4h');
      assert.deepEqual(h4.map((c) => (c[0] - open) / 3600), [0, 4, 8, 12, 16, 20], 'sześć świec 4h, bez dziur i duplikatów');
      assert.equal(h4.reduce((a, c) => a + c[5], 0), 23 * 60, 'żadna minuta nie zginęła ani się nie zdublowała');
      const d = S.aggregate(bars, '1D');
      assert.equal(d.length, 1);
      assert.equal(d[0][0], open);
      assert.equal(d[0][5], 23 * 60);
    }
  });

  test('wykresy-01: 7s, 45s, 90s z 1s: kotwica, OHLCV, luki zostają lukami', async () => {
    const S = await load();
    const o = OPEN_MON_26_10;
    // 1s: cena = 100 + i, high = cena + 0,5, low = cena - 0,5, v = 1; brakuje sekund 10-13
    const bars = [];
    for (let i = 0; i < 200; i++) if (i < 10 || i > 13) bars.push(bar(o + i, 100 + i, 100.5 + i, 99.5 + i, 100 + i + 0.25, 1));
    const a7 = S.aggregate(bars, '7s');
    assert.equal(a7[0][0], o);
    assert.deepEqual(a7[0], [o, 100, 106.5, 99.5, 106.25, 7]);
    // świeca 7-13 ma tylko sekundy 7-9 (10-13 brak)
    assert.deepEqual(a7[1], [o + 7, 107, 109.5, 106.5, 109.25, 3]);
    assert.equal(a7[2][0], o + 14);
    assert.equal(a7.length, Math.ceil(200 / 7));
    assert.ok(a7.every((c, i) => i === 0 || c[0] > a7[i - 1][0]));
    const a45 = S.aggregate(bars, '45s');
    assert.equal(a45[0][0], o);
    assert.deepEqual(a45[0], [o, 100, 144.5, 99.5, 144.25, 45 - 4]);
    assert.equal(a45[1][0], o + 45);
    assert.equal(a45.length, 5, '200 s = 4 pełne + 1 (180-199)');
    const a90 = S.aggregate(bars, '90s');
    assert.equal(a90[1][0], o + 90);
    assert.equal(a90[0][1], 100);
    assert.equal(a90[0][4], 100 + 89 + 0.25);
    assert.equal(a90[0][5], 90 - 4);
    // całkowita luka 90 s → brak świecy
    const gap = [bar(o, 1, 2, 0, 1, 1), bar(o + 200, 5, 6, 4, 5, 1)];
    assert.deepEqual(S.aggregate(gap, '90s').map((c) => c[0]), [o, o + 180]);
    assert.equal(S.aggregate([], '7s').length, 0);
  });

  test('wykresy-01: 13m z 1m: kotwica na otwarciu sesji', async () => {
    const S = await load();
    const o = OPEN_MON_26_10;
    const bars = [];
    for (let m = 0; m < 60; m++) bars.push(bar(o + m * 60, 4000 + m, 4001 + m, 3999 + m, 4000.5 + m, 10));
    const a = S.aggregate(bars, '13m');
    assert.deepEqual(a.map((c) => (c[0] - o) / 60), [0, 13, 26, 39, 52]);
    assert.deepEqual(a[0], [o, 4000, 4013, 3999, 4012.5, 130]);
    assert.deepEqual(a[4], [o + 52 * 60, 4052, 4060, 4051, 4059.5, 80], 'ostatnia świeca z 8 minut danych');
  });

  test('wykresy-01: 4h kotwica 17-21-1-5 czasu sesji, ostatnia przycięta, bar w przerwie odrzucony', async () => {
    const S = await load();
    const o = OPEN_MON_26_10;
    const h = 3600;
    const bars = [
      bar(o, 10, 11, 9, 10.5, 1), bar(o + 4 * h - 60, 10.5, 15, 10, 14, 2),
      bar(o + 4 * h, 14, 16, 13, 15, 3), bar(o + 8 * h + 60, 15, 17, 8, 9, 4),
      bar(o + 20 * h, 9, 9.5, 8.5, 9.2, 5), bar(o + 23 * h - 60, 9.2, 20, 9, 19, 6), // 15:59 CT, ostatnia minuta sesji
      bar(o + 23 * h, 777, 777, 777, 777, 99), // 16:00 CT: przerwa
    ];
    const a = S.aggregate(bars, '4h');
    assert.deepEqual(a, [
      [o, 10, 15, 9, 14, 3],
      [o + 4 * h, 14, 16, 13, 15, 3],
      [o + 8 * h, 15, 17, 8, 9, 4],
      [o + 20 * h, 9, 20, 8.5, 19, 11],
    ]);
    assert.equal(a[0][0], utc(2026, 10, 25, 22), '17:00 CDT');
    assert.equal(a[1][0], utc(2026, 10, 26, 2), '21:00 CDT');
    assert.equal(a[2][0], utc(2026, 10, 26, 6), '1:00 CDT');
    assert.equal(a[3][0], utc(2026, 10, 26, 18), '13:00 CDT, świeca 13-16 (3 h)');
  });

  test('wykresy-01: 1D = jedna sesja, 1W od otwarcia tygodnia, luki zostają', async () => {
    const S = await load();
    const mon = utc(2026, 10, 25, 22), tue = mon + 86400, wed = tue + 86400, fri = mon + 4 * 86400, nextSun = utc(2026, 11, 1, 23);
    const bars = [
      bar(mon + 600, 1, 5, 1, 4, 10), bar(mon + 30000, 4, 9, 3, 8, 20), bar(mon + 23 * 3600, 99, 99, 99, 99, 1000), // ostatni w przerwie
      bar(tue + 60, 8, 8, 2, 3, 5),
      // środa bez danych: brak świecy
      bar(fri + 60, 3, 7, 3, 6, 7),
      bar(nextSun + 60, 6, 6, 6, 6, 1),
    ];
    const d = S.aggregate(bars, '1D');
    assert.deepEqual(d, [
      [mon, 1, 9, 1, 8, 30],
      [tue, 8, 8, 2, 3, 5],
      [fri, 3, 7, 3, 6, 7],
      [nextSun, 6, 6, 6, 6, 1],
    ]);
    assert.ok(!d.some((c) => c[0] === wed), 'dzień bez danych nie ma świecy');
    const w = S.aggregate(bars, '1W');
    assert.deepEqual(w, [
      [mon, 1, 9, 1, 6, 42],
      [nextSun, 6, 6, 6, 6, 1],
    ]);
    assert.equal(w[0][0], utc(2026, 10, 25, 22), 'tydzień od niedzieli 17:00 CDT');
    assert.equal(w[1][0], utc(2026, 11, 1, 23), 'kolejny tydzień po zmianie na CST');
    // tydzień widziany tylko przez sesję wtorkową: kotwica i tak niedziela 17:00
    const w2 = S.aggregate([bar(tue + 60, 1, 2, 0, 1, 1)], '1W');
    assert.equal(w2[0][0], mon);
  });
};
