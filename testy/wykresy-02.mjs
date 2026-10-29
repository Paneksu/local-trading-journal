// wykresy-02: magazyn świec (format binarny, zakres, zapis atomowy, dwie warstwy 1m/1s, pokrycie jako zakresy w ciągu dnia, scalanie, luki w sekundach).
import { pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const load = async () => ({
    C: await import(pathToFileURL(path.join(ROOT, 'lib/candles-store.mjs')).href),
    S: await import(pathToFileURL(path.join(ROOT, 'public/js/swiece.js')).href),
  });
  const utc = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000;
  const bar = (t, o, h, l, c, v) => [t, o, h, l, c, v];
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

  test('wykresy-02: round trip rekordów, wartości skrajne, rozmiar 24 B, plik tylko w katalogu bazowym', async () => {
    const { C } = await load();
    const base = H.tmp();
    const d = '2026-10-26';
    const t0 = utc(2026, 10, 26, 14, 30);
    const bars = [
      bar(t0, 502575, 502600, 502550, 502575, 12), // 5025,75 x100
      bar(t0 + 60, -2147483648, 2147483647, -1, 0, 4294967295),
      bar(t0 + 125, 25, 25, 25, 25, 0),
    ];
    C.writeRange('ES', '1s', t0, t0 + 200, bars, {}, { baseDir: base });
    assert.deepEqual(C.readDay('ES', '1s', d, { baseDir: base }), bars);
    assert.equal(statSync(path.join(base, 'candles/ES/1s/2026-10-26.bin')).size, 3 * 24);
    assert.deepEqual(C.decode(C.encode(bars)), bars);
    const raw = readFileSync(path.join(base, 'candles/ES/1s/2026-10-26.bin'));
    assert.equal(raw.readUInt32LE(0), t0);
    assert.equal(raw.readInt32LE(4), 502575);
    for (const f of walk(base)) assert.ok(f.startsWith(base));
    assert.deepEqual(C.readDay('NQ', '1s', d, { baseDir: base }), [], 'brak pliku = brak świec');
  });

  test('wykresy-02: walidacja wejścia (symbol, data, ceny, kolejność, zakres)', async () => {
    const { C } = await load();
    const base = H.tmp();
    const t0 = utc(2026, 10, 26, 14);
    assert.throws(() => C.writeRange('ZZ', '1s', t0, t0 + 10, [], {}, { baseDir: base }), /symbol/);
    assert.throws(() => C.readDay('ES', '1s', '../../etc', { baseDir: base }), /data/);
    assert.throws(() => C.readDay('ES', '5s', '2026-10-26', { baseDir: base }), /rozdzielczość/);
    assert.throws(() => C.writeRange('ES', '1s', t0, t0 + 10, [bar(t0, 1.5, 2, 1, 2, 1)], {}, { baseDir: base }), /cena/);
    assert.throws(() => C.writeRange('ES', '1s', t0, t0 + 10, [bar(t0 + 1, 1, 1, 1, 1, 1), bar(t0 + 1, 1, 1, 1, 1, 1)], {}, { baseDir: base }), /czas/);
    assert.throws(() => C.writeRange('ES', '1s', t0, t0 + 10, [bar(t0 + 10, 1, 1, 1, 1, 1)], {}, { baseDir: base }), /spoza zakresu/);
    assert.throws(() => C.writeRange('ES', '1s', t0 + 10, t0, [], {}, { baseDir: base }), /zakres/);
    assert.throws(() => C.writeRange('ES', '1h', t0, t0 + 10, [], {}, { baseDir: base }), /rozdzielczość/);
    assert.deepEqual(walk(base), [], 'nieudane zapisy nie zostawiły plików');
  });

  test('wykresy-02: zakres przez granicę dni UTC i granice [from, to)', async () => {
    const { C } = await load();
    const base = H.tmp();
    const mk = (from, n) => Array.from({ length: n }, (_, i) => bar(from + i * 10, 100 + i, 101 + i, 99 + i, 100 + i, 1));
    const a = mk(utc(2026, 10, 26, 23, 59, 0), 6);
    const b = mk(utc(2026, 10, 27, 0, 0, 0), 6);
    const c = mk(utc(2026, 10, 28, 0, 0, 0), 3);
    C.writeRange('ES', '1s', utc(2026, 10, 26, 23, 59), utc(2026, 10, 27, 0, 1), [...a, ...b], {}, { baseDir: base }); // jedno wywołanie przez dwa dni
    C.writeRange('ES', '1s', utc(2026, 10, 28), utc(2026, 10, 28, 0, 1), c, {}, { baseDir: base });
    const lo = utc(2026, 10, 26, 23, 59, 30), hi = utc(2026, 10, 27, 0, 0, 30);
    const r = C.readRange('ES', '1s', lo, hi, { baseDir: base });
    assert.deepEqual(r.map((x) => x[0]), [...a.slice(3), ...b.slice(0, 3)].map((x) => x[0]));
    assert.equal(r[0][0], lo, 'from włącznie');
    assert.equal(r.at(-1)[0], hi - 10, 'to wyłącznie');
    assert.equal(C.readRange('ES', '1s', utc(2026, 10, 26), utc(2026, 10, 29), { baseDir: base }).length, 15, 'trzy dni naraz');
    assert.deepEqual(C.readRange('ES', '1s', hi, lo, { baseDir: base }), [], 'zakres odwrócony');
    assert.deepEqual(C.readRange('ES', '1s', utc(2026, 11, 5), utc(2026, 11, 7), { baseDir: base }), [], 'dni bez plików');
    assert.deepEqual(C.readDay('ES', '1s', '2026-10-20', { baseDir: base }), [], 'pusty dzień bez pliku');
  });

  test('wykresy-02: zapis atomowy: błąd przed rename zostawia stary plik cały i zero .tmp, pokrycie nie rośnie', async () => {
    const { C } = await load();
    const base = H.tmp();
    const t0 = utc(2026, 10, 26, 14);
    const old = [bar(t0, 1, 2, 0, 1, 1), bar(t0 + 1, 1, 2, 0, 2, 1)];
    C.writeRange('ES', '1s', t0, t0 + 60, old, {}, { baseDir: base });
    const before = readFileSync(path.join(base, 'candles/ES/1s/2026-10-26.bin'));
    const covBefore = readFileSync(path.join(base, 'candles/ES/coverage.json'));
    C._hooks.beforeRename = () => { throw new Error('symulowana awaria przed rename'); };
    try {
      assert.throws(() => C.writeRange('ES', '1s', t0, t0 + 60, [bar(t0, 9, 9, 9, 9, 9)], {}, { baseDir: base }), /symulowana/);
      assert.throws(() => C.writeRange('ES', '1s', t0 + 3600, t0 + 3700, [], {}, { baseDir: base }), /symulowana/);
    } finally { C._hooks.beforeRename = null; }
    assert.ok(readFileSync(path.join(base, 'candles/ES/1s/2026-10-26.bin')).equals(before), 'stary plik nietknięty');
    assert.ok(readFileSync(path.join(base, 'candles/ES/coverage.json')).equals(covBefore), 'pokrycie nietknięte');
    assert.deepEqual(C.readDay('ES', '1s', '2026-10-26', { baseDir: base }), old);
    assert.equal(walk(base).filter((f) => f.endsWith('.tmp')).length, 0, 'brak plików .tmp');
  });

  test('wykresy-02: pokrycie 1s jako zakresy w ciągu dnia: scalanie nakładających i stykających się, brakujące kawałki, niezależność symboli i warstw', async () => {
    const { C } = await load();
    const base = H.tmp();
    const o = { baseDir: base };
    const h = (hh, mm = 0) => utc(2026, 10, 26, hh, mm);
    C.writeRange('ES', '1s', h(14), h(15), [bar(h(14), 1, 1, 1, 1, 1)], {}, o);
    C.writeRange('ES', '1s', h(17), h(18), [], {}, o); // okno bez żadnej transakcji też jest "pobrane"
    assert.deepEqual(C.readCoverage('ES', o)['1s'], [[h(14), h(15)], [h(17), h(18)]]);
    assert.deepEqual(C.readCoverage('ES', o)['1m'], [], 'zapis 1s nie tworzy pokrycia 1m');
    assert.deepEqual(C.readRange('ES', '1m', h(0), h(23), o), [], 'ani świec 1m');
    C.writeRange('ES', '1s', h(14, 30), h(16), [], {}, o); // nakłada się na pierwsze, styka z drugim
    assert.deepEqual(C.readCoverage('ES', o)['1s'], [[h(14), h(16)], [h(17), h(18)]]);
    C.writeRange('ES', '1s', h(16), h(17), [], {}, o); // styka się z obu
    assert.deepEqual(C.readCoverage('ES', o)['1s'], [[h(14), h(18)]], 'stykające się zakresy scalone');
    assert.deepEqual(C.missingRanges('ES', '1s', h(13), h(19), o), [[h(13), h(14)], [h(18), h(19)]]);
    assert.deepEqual(C.missingRanges('ES', '1s', h(15), h(16), o), [], 'w pełni pokryte');
    assert.deepEqual(C.missingRanges('NQ', '1s', h(15), h(16), o), [[h(15), h(16)]], 'inny symbol ma własne pokrycie');
    assert.deepEqual(C.missingRanges('ES', '1m', h(15), h(16), o), [[h(15), h(16)]], 'inna warstwa ma własne pokrycie');
    // zakres w ciągu dnia nie zamyka całego dnia: dzień jest w pliku, a poza zakresem brakuje
    assert.deepEqual(C.missingRanges('ES', '1s', utc(2026, 10, 26), utc(2026, 10, 27), o), [[utc(2026, 10, 26), h(14)], [h(18), utc(2026, 10, 27)]]);
    JSON.parse(readFileSync(path.join(base, 'candles/ES/coverage.json'), 'utf8'));
  });

  test('wykresy-02: pure zakresy: mergeRanges, subtractRanges, clipRanges, intersectRanges', async () => {
    const { C } = await load();
    assert.deepEqual(C.mergeRanges([[5, 9], [1, 3], [3, 4], [8, 12], [20, 20]]), [[1, 4], [5, 12]]);
    assert.deepEqual(C.subtractRanges(0, 10, [[2, 4], [6, 8]]), [[0, 2], [4, 6], [8, 10]]);
    assert.deepEqual(C.subtractRanges(0, 10, [[-5, 20]]), []);
    assert.deepEqual(C.subtractRanges(3, 5, []), [[3, 5]]);
    assert.deepEqual(C.clipRanges(3, 7, [[0, 4], [6, 9], [10, 11]]), [[3, 4], [6, 7]]);
    assert.deepEqual(C.intersectRanges([[0, 5], [8, 12]], [[3, 9], [11, 20]]), [[3, 5], [8, 9], [11, 12]]);
  });

  test('wykresy-02: warstwy niezależne: zapis 1m z serwera nie jest nadpisywany przez 1s, ponowny zapis zakresu jest idempotentny i zastępuje tylko ten zakres', async () => {
    const { C } = await load();
    const base = H.tmp();
    const o = { baseDir: base };
    const t0 = utc(2026, 10, 26, 14);
    const m1 = Array.from({ length: 10 }, (_, i) => bar(t0 + i * 60, 100 + i, 101 + i, 99 + i, 100 + i, 5));
    C.writeRange('ES', '1m', t0, t0 + 600, m1, {}, o);
    C.writeRange('ES', '1s', t0, t0 + 120, [bar(t0, 1, 1, 1, 1, 1), bar(t0 + 61, 2, 2, 2, 2, 2)], {}, o);
    assert.deepEqual(C.readRange('ES', '1m', t0, t0 + 600, o), m1, 'warstwa 1m bez zmian po zapisie 1s');
    // powtórka tego samego zakresu: te same bajty
    const f = path.join(base, 'candles/ES/1m/2026-10-26.bin');
    const before = readFileSync(f);
    C.writeRange('ES', '1m', t0, t0 + 600, m1, {}, o);
    assert.ok(readFileSync(f).equals(before));
    // zapis węższego zakresu zastępuje tylko jego świece
    C.writeRange('ES', '1m', t0 + 120, t0 + 240, [bar(t0 + 120, 7, 7, 7, 7, 7)], {}, o);
    const r = C.readRange('ES', '1m', t0, t0 + 600, o);
    assert.equal(r.length, 9, 'druga świeca z zakresu 120-240 nie istnieje po zastąpieniu (sekunda bez transakcji)');
    assert.deepEqual(r.find((x) => x[0] === t0 + 120), bar(t0 + 120, 7, 7, 7, 7, 7));
    assert.ok(!r.some((x) => x[0] === t0 + 180));
    assert.deepEqual(r.filter((x) => x[0] < t0 + 120), m1.slice(0, 2), 'świece spoza zakresu zostają');
    assert.equal(C.readCoverage('ES', o)['1m'].length, 1);
  });

  test('wykresy-02: rolls w coverage.json bez duplikatów po t, posortowane', async () => {
    const { C } = await load();
    const base = H.tmp();
    const o = { baseDir: base };
    const t0 = utc(2026, 9, 14, 13);
    C.writeRange('ES', '1m', t0, t0 + 600, [], { rolls: [{ t: t0 + 300, label: '1→2' }] }, o);
    C.writeRange('ES', '1m', t0 + 300, t0 + 900, [], { rolls: [{ t: t0 + 300, label: '1→2' }, { t: t0 + 100, label: '0→1' }] }, o);
    assert.deepEqual(C.readCoverage('ES', o).rolls, [{ t: t0 + 100, label: '0→1' }, { t: t0 + 300, label: '1→2' }]);
  });

  test('wykresy-02: sekundy bez transakcji nie mają świecy: luki w 1s zostają lukami po zapisie i odczycie, agregacja 15 s i 1m nie zmyśla świec', async () => {
    const { C, S } = await load();
    const base = H.tmp();
    const o = { baseDir: base };
    const open = utc(2026, 10, 26, 14, 30); // 10:30 CDT, w sesji
    // w minucie 0 są sekundy 0, 1, 2 i 50; minuta 1 jest całkiem pusta; w minucie 2 sekundy 5 i 59
    const secs = [0, 1, 2, 50, 125, 179];
    const bars = secs.map((s, i) => bar(open + s, 1000 + i, 1005 + i, 995 + i, 1001 + i, 1 + i));
    C.writeRange('ES', '1s', open, open + 180, bars, {}, o);
    const back = C.readRange('ES', '1s', open, open + 180, o);
    assert.deepEqual(back, bars, 'żadnych dorysowanych sekund');
    assert.deepEqual(C.readCoverage('ES', o)['1s'], [[open, open + 180]], 'pokrycie obejmuje cały zakres mimo luk');
    const m = S.aggregate(back, '1m');
    assert.deepEqual(m.map((x) => x[0]), [open, open + 120], 'pusta minuta nie ma świecy');
    assert.equal(m[0][5], 1 + 2 + 3 + 4, 'wolumen tylko z istniejących sekund');
    const s15 = S.aggregate(back, '15s');
    assert.deepEqual(s15.map((x) => x[0]), [open, open + 45, open + 120, open + 165], 'kubełki 15 s tylko tam, gdzie były transakcje');
    assert.equal(S.aggregate([], '15s').length, 0);
  });

  test('wykresy-02: moduł nie importuje server.mjs ani node:sqlite i domyślna baza to CONFIG_DIR/chart-data', async () => {
    const { C } = await load();
    const src = readFileSync(path.join(ROOT, 'lib/candles-store.mjs'), 'utf8');
    assert.ok(!/server\.mjs|node:sqlite|node:http|fetch\(/.test(src.replace(/^\s*\/\/.*$/gm, '')));
    assert.equal(path.basename(C.defaultBase()), 'chart-data');
  });
};
