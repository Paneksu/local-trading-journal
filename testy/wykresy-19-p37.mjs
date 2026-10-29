// wykresy-19: P37 (28.10.2026), poprawki po weryfikacji rolli. Słowa użytkownika: «ma być wszystko idealnie … ma działać naprawdę wszystko przez pełny okres wszystkich lat».
// P7 sesje sprzed 20.09.2015 trwają do 17:00 (handel po 16:00), P1 znacznik rolla na pierwszej świecy nowego kontraktu, P2 dziury w danych,
// P3 PDH/PDL po dziurze, P5 znacznik rolla przy kadrze zaczynającym się po starym kontrakcie.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const at = (s) => Date.parse(s) / 1000;
  const iso = (s) => new Date(s * 1000).toISOString().replace('.000Z', 'Z');
  // minutowe świece [od, do) co 60 s w godzinach sesji wg funkcji ok(t); cena wg px(t) (grosze)
  const minutes = (a, b, px, ok = () => true) => { const out = []; for (let t = a; t < b; t += 60) if (ok(t)) { const p = px(t); out.push([t, p, p + 25, p - 25, p, 1]); } return out; };

  test('wykresy-19: P7 ES 21.03.2012: sesja trwa do 17:00 (handel do 16:29), 1D zamyka się na 1396,75, 5m i 1h mają świece po 16:00', async () => {
    const S = await lib('public/js/swiece.js');
    const open = at('2012-03-20T22:00:00Z'), last = at('2012-03-21T21:29:00Z'); // 17:00 CDT wtorku; 16:29 CDT środy
    const px = (t) => (t === last ? 139675 : t >= at('2012-03-21T21:00:00Z') ? 139700 : 139000 + ((t / 60) % 50));
    const bars = minutes(open, last + 60, px, (t) => !!S.sessionBounds(t));
    assert.equal(bars.at(-1)[0], last, 'sessionBounds nie odrzuca świec 16:00-16:29');
    const s = S.sessionBounds(last);
    assert.equal(iso(s.open), '2012-03-20T22:00:00Z'); assert.equal(iso(s.close), '2012-03-21T22:00:00Z', 'zamknięcie sesji 17:00');
    const d = S.aggregate(bars, '1D');
    assert.equal(d.length, 1);
    assert.equal(d[0][4], 139675, 'zamknięcie 1D = ostatnia transakcja 16:29');
    assert.equal(d[0][0], open);
    const h = S.aggregate(bars, '1h');
    assert.equal(h.at(-1)[0], at('2012-03-21T21:00:00Z'), 'ostatnia świeca 1h zaczyna się o 16:00');
    assert.equal(h.at(-1)[4], 139675);
    assert.equal(S.aggregate(bars, '5m').at(-1)[0], at('2012-03-21T21:25:00Z'));
    assert.equal(S.aggregate(bars, '1W')[0][4], 139675);
    // piątek 16:10 CDT 2012 należy do sesji czwartku; sobota 16:10 nadal poza sesją
    assert.equal(S.sessionBounds(at('2012-03-23T21:10:00Z')).open, at('2012-03-22T22:00:00Z'));
    assert.equal(S.sessionBounds(at('2012-03-24T21:10:00Z')), null);
    assert.equal(S.sessionBounds(at('2012-03-25T21:10:00Z')), null, 'niedziela przed 17:00');
  });

  test('wykresy-19: P7 granica zmiany godzin: ostatnia długa sesja otwarta 17.09.2015 (zamknięta 18.09 o 17:00), od 20.09.2015 przerwa 16:00-17:00 jak dziś', async () => {
    const S = await lib('public/js/swiece.js');
    assert.equal(iso(S.sessionBounds(at('2015-09-18T21:14:00Z')).close), '2015-09-18T22:00:00Z', 'piątek 18.09.2015 16:14 CDT: jeszcze handel');
    assert.equal(iso(S.sessionBounds(at('2015-09-17T22:00:00Z')).close), '2015-09-18T22:00:00Z');
    assert.equal(iso(S.sessionBounds(at('2015-09-20T22:00:00Z')).close), '2015-09-21T21:00:00Z', 'sesja z niedzieli 20.09.2015 zamyka się o 16:00');
    assert.equal(S.sessionBounds(at('2015-09-21T21:30:00Z')), null, 'poniedziałek 21.09.2015 16:30: przerwa');
    assert.equal(S.sessionBounds(at('2016-03-16T21:00:00Z')), null, '2016: 16:00 poza sesją');
    assert.equal(iso(S.sessionBounds(at('2025-12-10T23:00:00Z')).close), '2025-12-11T22:00:00Z', 'dziś zamknięcie 16:00 CST');
    assert.equal(iso(S.previousSession(at('2015-09-20T22:30:00Z')).close), '2015-09-18T22:00:00Z', 'poprzednia sesja niedzieli 20.09: piątkowa, zamknięta o 17:00');
    assert.equal(iso(S.previousSession(at('2012-03-21T20:00:00Z')).close), '2012-03-20T22:00:00Z');
  });

  test('wykresy-19: P7 PDH/PDL i sesja używają tych samych granic: poprzednia sesja z 2012 kończy się o 17:00', async () => {
    const S = await lib('public/js/swiece.js');
    const o1 = at('2012-03-20T22:00:00Z'), o2 = at('2012-03-21T22:00:00Z');
    const pd = S.pdhlSpans([o2 + 60, o2 + 120], [[o1, 1, 1400, 1380, 1390, 5]], { availableEnd: o2 + 7200 });
    assert.equal(pd.length, 1); assert.equal(pd[0].hi, 1400);
    assert.equal(S.previousSession(o2 + 60).open, o1);
    assert.equal(S.previousSession(o2 + 60).close, o2, 'bez luki między sesjami: poprzednia kończy się o 17:00, nie 16:00');
  });

  test('wykresy-19: P1 rollIndex: znacznik na pierwszej świecy nowego kontraktu (NQH1 → NQM1 10.03.2011: 16:27 stara, 17:02 nowa), także na 5m i 1D', async () => {
    const G = await lib('public/js/geometria.js');
    const T = at('2011-03-10T23:00:00Z'); // 17:00 CST
    const m1 = [[T - 3 * 3600, 1], [T - 1980, 1], [T + 120, 1], [T + 180, 1]]; // 16:27 stara, 17:02 nowa
    assert.equal(G.rollIndex(m1, T, 60, 60), 2, '1m: pierwsza świeca >= T (17:02), nie 16:27');
    assert.equal(G.timeToIndex(m1, T, 60), 1, 'stary sposób wskazywał ostatnią starą świecę');
    assert.equal(G.rollIndex([[T - 300, 1], [T, 1], [T + 300, 1]], T, 300, 300), 1, 'świeca dokładnie o T');
    assert.equal(G.rollIndex([[T - 86400 + 3600, 1], [T + 3600, 1]], T, 86400, 86400), 0, '1D: świeca zaczęta wcześniej, ale obejmująca T (roll w środku tygodnia)');
    assert.equal(G.rollIndex([[T - 7200, 1], [T + 3600, 1]], T, 60, 60), 1, 'przerwa: pierwsza po T');
    const tail = [[T - 7200, 1], [T - 3600, 1]];
    assert.equal(G.rollIndex(tail, T, 60, 60), G.timeToIndex(tail, T, 60), 'za ostatnią świecą bez zmian');
  });

  test('wykresy-19: P2 findGaps: dziura 12-13.06.2014 wykryta, święta i weekendy nie, skrócona sesja (16.03.2020) i 1 świeca w dniu to nie dziura', async () => {
    const L = await lib('lib/luki-danych.mjs');
    const S = await lib('public/js/swiece.js');
    const G = await lib('public/js/geometria.js');
    const from = at('2014-06-08T00:00:00Z'), to = at('2014-06-20T00:00:00Z');
    const cnt = (empty) => (o, c) => (empty.some(([a, b]) => o >= a && c <= b) ? 0 : 1);
    const hole = [[at('2014-06-11T22:00:00Z'), at('2014-06-13T22:00:00Z')]];
    const g = L.findGaps(from, to, { isCovered: () => true, barCount: cnt(hole) });
    assert.deepEqual(g.map((x) => [x.a, x.b, iso(x.t), iso(x.to)]), [['2014-06-12', '2014-06-13', '2014-06-11T22:00:00Z', '2014-06-13T22:00:00Z']]);
    assert.deepEqual(L.findGaps(from, to, { isCovered: () => false, barCount: cnt(hole) }), [], 'poza pokryciem to nie dziura');
    assert.equal(L.findGaps(to, from, { isCovered: () => true, barCount: () => 0 }).length, 0);
    // wszystko puste przez cały 2020: dziurą są tylko dni robocze, które nie są świętami
    const all = L.findGaps(at('2019-12-31T00:00:00Z'), at('2021-01-04T00:00:00Z'), { isCovered: () => true, barCount: () => 0 });
    const days = new Set();
    for (const x of all) for (let d = Date.parse(x.a) / 864e5; d <= Date.parse(x.b) / 864e5; d++) if (S.weekdayOf(d) >= 1 && S.weekdayOf(d) <= 5) days.add(d); // seria przez weekend obejmuje sobotę i niedzielę, ale to nie są dni handlowe
    for (let d = Date.UTC(2020, 0, 1) / 864e5; d <= Date.UTC(2020, 11, 31) / 864e5; d++) {
      const wd = S.weekdayOf(d), hol = L.isHoliday(d);
      assert.equal(days.has(d), wd >= 1 && wd <= 5 && !hol, `${new Date(d * 864e5).toISOString().slice(0, 10)}: dzień roboczy bez święta = dziura przy braku świec`);
    }
    for (const d of ['2020-01-01', '2020-01-20', '2020-02-17', '2020-04-10', '2020-05-25', '2020-07-03', '2020-09-07', '2020-11-26', '2020-12-25']) assert.ok(L.isHoliday(Date.parse(d) / 864e5), d);
    // 16.03.2020 (sesja z przerwami, ale ze świecami) nie jest świętem, więc o dziurze decyduje wyłącznie brak świec: 1 świeca wystarcza
    for (const d of ['2020-03-16', '2020-03-13', '2020-12-24']) assert.ok(!L.isHoliday(Date.parse(d) / 864e5), `${d} nie jest świętem zamkniętym`);
    const day16 = L.findGaps(at('2020-03-15T00:00:00Z'), at('2020-03-18T00:00:00Z'), { isCovered: () => true, barCount: () => 1 });
    assert.deepEqual(day16, [], 'dni ze świecami (także skrócone) nie są dziurą');
    for (const d of ['2022-06-20', '2022-12-26', '2021-12-24']) assert.ok(L.isHoliday(Date.parse(d) / 864e5), `przesunięcie święta: ${d}`);
    // serie: wt-czw to jedna dziura, piątek i poniedziałek (weekend między nimi) też są jedną
    const ser = L.findGaps(at('2014-09-21T00:00:00Z'), at('2014-10-04T00:00:00Z'), { isCovered: () => true, barCount: cnt([[at('2014-09-22T22:00:00Z'), at('2014-09-25T22:00:00Z')], [at('2014-09-28T22:00:00Z'), at('2014-09-30T22:00:00Z')]]) });
    assert.deepEqual(ser.map((x) => [x.a, x.b]), [['2014-09-23', '2014-09-25'], ['2014-09-29', '2014-09-30']]);
    assert.equal(G.gapDates({ a: '2014-06-12', b: '2014-06-13' }), '12–13.06.2014');
    assert.equal(G.gapDates({ a: '2014-12-31', b: '2014-12-31' }), '31.12.2014');
    assert.equal(G.gapDates({ a: '2014-09-30', b: '2014-10-02' }), '30.09–02.10.2014');
    assert.equal(G.gapDates({ a: '2014-12-31', b: '2015-01-02' }), '31.12.2014–02.01.2015');
  });

  // ---- magazyn syntetyczny: tydzień 2014 z dziurą w czwartek i piątek ----
  async function store2014() {
    const C = await lib('lib/candles-store.mjs');
    const S = await lib('public/js/swiece.js');
    const dir = H.tmp(); const o = { baseDir: dir };
    const A = at('2014-06-08T22:00:00Z'), B = at('2014-06-19T22:00:00Z'); // niedziela 17:00 CDT – czwartek 16:00 CDT
    const hole = [at('2014-06-11T22:00:00Z'), at('2014-06-13T22:00:00Z')];
    const bars = [];
    for (let t = A; t < B; t += 900) if (S.sessionBounds(t) && !(t >= hole[0] && t < hole[1])) { const p = 190000 + Math.floor((t - A) / 86400) * 100; bars.push([t, p, p + 25, p - 25, p, 1]); }
    C.writeRange('ES', '1m', A, B, bars, { rolls: [] }, o);
    C.writeAux('contracts-es', { resolvedTo: '2014-07-01', v0: [], names: {} }, o);
    const { createCandles } = await lib('lib/candles.mjs');
    return createCandles({ getKey: () => '', getConfig: () => ({}), baseDir: dir, now: () => Date.UTC(2014, 6, 1) });
  }

  test('wykresy-19: P2 read(): odpowiedź niesie gaps z dniami handlowymi dziury (także gdy kadr obejmuje tylko jej skrawek), bez dziur w zwykłych dniach', async () => {
    const K = await store2014();
    const q = (f, t, tf) => K.read({ instrument: 'ES', from: String(at(f)), to: String(at(t)), tf });
    assert.deepEqual(q('2014-06-08T22:00:00Z', '2014-06-19T21:00:00Z', '1h').gaps.map((g) => [g.a, g.b]), [['2014-06-12', '2014-06-13']]);
    assert.deepEqual(q('2014-06-12T12:00:00Z', '2014-06-16T12:00:00Z', '1h').gaps.map((g) => [g.a, g.b]), [['2014-06-12', '2014-06-13']], 'kadr zaczyna się w środku dziury');
    assert.deepEqual(q('2014-06-08T22:00:00Z', '2014-06-11T22:00:00Z', '1h').gaps, []);
    assert.deepEqual(q('2014-06-08T22:00:00Z', '2014-06-19T21:00:00Z', '1D').gaps.map((g) => g.a), ['2014-06-12']);
  });

  test('wykresy-19: P3 PDH/PDL po sesji z dziury danych: bez linii (nie bierze środy), po prawdziwym święcie dalej ostatnia sesja z danymi', async () => {
    const K = await store2014();
    const S = await lib('public/js/swiece.js');
    const d = K.read({ instrument: 'ES', from: String(at('2014-06-08T22:00:00Z')), to: String(at('2014-06-19T22:00:00Z')), tf: '1D' });
    const mon = [at('2014-06-15T22:00:00Z') + 3600];
    assert.equal(S.pdhlSpans(mon, d.bars, { gaps: [] }).length, 1, 'bez wiedzy o dziurze (stare zachowanie) bierze środę');
    assert.deepEqual(S.pdhlSpans(mon, d.bars, { gaps: d.gaps }), [], 'z dziurą: brak PDH/PDL');
    assert.equal(S.pdhlSpans([at('2014-06-16T22:00:00Z') + 3600], d.bars, { gaps: d.gaps }).length, 1, 'wtorek ma poniedziałek z danymi');
    // święto: 27.05.2013 (Memorial Day), sesja z poniedziałku 17:00 UTC-5 jest pusta, bez dziury w gaps → PDH bierze ostatnią sesję z danymi (zachowanie bez zmian)
    const fri = at('2013-05-23T22:00:00Z');
    assert.equal(S.pdhlSpans([at('2013-05-28T22:00:00Z') + 3600], [[fri, 1, 1500, 1400, 1450, 1]], { gaps: [] }).length, 1);
  });

  test('wykresy-19: P5 znacznik rolla także gdy kadr zaczyna się po ostatniej świecy starego kontraktu, bez dublowania przy zwykłym kadrze', async () => {
    const C = await lib('lib/candles-store.mjs');
    const S = await lib('public/js/swiece.js');
    const dir = H.tmp(); const o = { baseDir: dir };
    const qOf = (y, m) => y * 4 + (m / 3 - 1);
    const Z5 = qOf(2025, 12), H6 = qOf(2026, 3);
    const T_R = at('2025-12-11T23:00:00Z'), T_V = at('2025-12-17T00:00:00Z');
    const A = at('2025-12-07T23:00:00Z'), B = at('2025-12-19T22:00:00Z');
    const mk = (a, b, base, vol) => { const out = []; for (let t = a; t < b; t += 900) if (S.sessionBounds(t)) out.push([t, base, base + 25, base - 25, base, vol(t)]); return out; };
    C.writeRange('ES', '1m', A, T_V, mk(A, T_V, 680000, () => 10), { rolls: [] }, o);
    C.writeRange('ES', '1m', T_V, B, mk(T_V, B, 685500, () => 10), { rolls: [{ t: T_V, label: 'x' }] }, o);
    const P = at('2025-12-09T23:00:00Z');
    C.writeRange('ES', '1m-ESH2026', P, T_V, mk(P, T_V, 685500, (t) => (t < T_R ? 1 : 30)), {}, o);
    C.writeAux('contracts-es', { resolvedTo: '2026-01-01', v0: [[at('2025-09-17T00:00:00Z'), Z5], [T_V, H6]], names: { [Z5]: { name: 'ESZ5', id: '1' }, [H6]: { name: 'ESH6', id: '2' } } }, o);
    const { createCandles } = await lib('lib/candles.mjs');
    const K = createCandles({ getKey: () => '', getConfig: () => ({}), baseDir: dir, now: () => Date.UTC(2026, 0, 5) });
    const base = { instrument: 'ES', to: String(at('2025-12-12T22:00:00Z')), tf: '1h' };
    const rolls = (from) => K.read({ ...base, from: String(from) }).rolls.map((r) => [r.t, r.label]);
    assert.deepEqual(rolls(T_R - 7200), [[T_R, 'ESZ5 → ESH6']], 'kadr z końcówką starego kontraktu: znacznik jak dotąd');
    assert.deepEqual(rolls(T_R - 3600), [[T_R, 'ESZ5 → ESH6']], 'kadr zaczyna się po ostatniej świecy starego kontraktu (przerwa 16:00-17:00)');
    assert.deepEqual(rolls(T_R), [[T_R, 'ESZ5 → ESH6']], 'roll dokładnie na początku kadru');
    assert.deepEqual(rolls(T_R + 3600), [], 'roll sprzed kadru nie jest znacznikiem');
    assert.deepEqual(rolls(A), [[T_R, 'ESZ5 → ESH6']], 'bez duplikatu, gdy kadr ma stary kontrakt');
  });
};
