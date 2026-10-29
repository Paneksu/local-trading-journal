// wykresy-18: P35 (28.10.2026), zmiana kontraktu (roll) jak rynek i ES1!/NQ1! w TradingView. Słowa użytkownika:
// 1) «Tak żeby było jak najbardziej poprawnie» (przełączenie na otwarciu sesji CME dnia rolla rynku zamiast .v.0);
// 2) «Tak, do 0,40 USD» (świece kontraktu w oknach rolla po symbolu surowym, przez strażnika kredytu);
// 3) «Opcja, domyślnie wył.» (back-adjust jak B-ADJ TradingView); 4) «Tak, pole „Kontrakt”» (migracja 005, wybór na wykresie zapisuje pole).
// Daty rolli z audytu R:\PROJEKTY\trading-hq-wt\wykresy-wyniki\roll-audyt.md (czwartek rolla CME, przełączenie .v.0 z symbology.resolve).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

export default ({ test, H, assert, ROOT }) => {
  let port = 5080;
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const iso = (s) => new Date(s * 1000).toISOString().replace('.000Z', 'Z');
  const at = (s) => Date.parse(s) / 1000;
  const json = (f) => JSON.parse(readFileSync(f, 'utf8'));
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const qOf = (y, m) => y * 4 + (m / 3 - 1);
  const Z5 = qOf(2025, 12), H6 = qOf(2026, 3);
  // Roll ESZ5 → ESH6. Reguła P35 = zmierzona sesja przewagi obrotu nowego kontraktu. W danych testowych przewaga wypada w piątek (sesja od czwartku 17:00 CST),
  // czyli ani w czwartek rolla CME z kalendarza (T_CAL), ani w poniedziałek reguły zapasowej (T_FB): test pokazuje, że wygrywa pomiar.
  const T_R = at('2025-12-11T23:00:00Z');
  const T_CAL = at('2025-12-10T23:00:00Z'); // czwartek 8 dni przed 3. piątkiem (konwencja CME): od sesji przed nim zaczyna się okno pomiaru
  const T_FB = at('2025-12-14T23:00:00Z'); // reguła zapasowa: poniedziałek tygodnia wygaśnięcia (niedziela 17:00 CST)
  const ROLLS = { [qOf(2025, 12)]: T_R };
  const T_V = at('2025-12-17T00:00:00Z'); // przełączenie ES.v.0 (symbology.resolve)

  test('wykresy-18: P35 reguła rolla: zmierzone przełączenie wygrywa, bez pomiaru poniedziałek tygodnia wygaśnięcia; kalendarz czwartku CME (8 rolli z audytu, CST/CDT)', async () => {
    const K = await lib('public/js/kontrakty.js');
    const S = await lib('public/js/swiece.js');
    // „Roll CME (czw.)” z tabeli audytu: dzień handlowy sesji, od której seria pokazuje nowy kontrakt
    const audit = [['2024-12', '2024-12-12'], ['2025-03', '2025-03-13'], ['2025-06', '2025-06-12'], ['2025-09', '2025-09-11'], ['2025-12', '2025-12-11'], ['2026-03', '2026-03-12'], ['2026-06', '2026-06-11'], ['2026-09', '2026-09-10']];
    for (const [ym, thu] of audit) {
      const q = qOf(Number(ym.slice(0, 4)), Number(ym.slice(5)));
      const r = K.rollEpoch(q);
      const sess = S.sessionBounds(r);
      assert.equal(sess.open, r, `${ym}: przełączenie na otwarciu sesji`);
      assert.equal(new Date((sess.close) * 1000).toISOString().slice(0, 10), thu, `${ym}: sesja czwartku ${thu}`);
      assert.equal(K.frontQ(r - 1, 8), q, `${ym}: minutę wcześniej stary kontrakt (reguła stała 8 dni)`);
      assert.equal(K.frontQ(r, 8), q + 1, `${ym}: od otwarcia nowy kontrakt`);
    }
    assert.equal(iso(K.rollEpoch(Z5)), '2025-12-10T23:00:00Z', 'grudzień: 17:00 CST = 23:00 UTC');
    assert.equal(iso(K.rollEpoch(qOf(2026, 3))), '2026-03-11T22:00:00Z', 'marzec 2026 po zmianie czasu (8.03): 17:00 CDT = 22:00 UTC');
    assert.equal(iso(K.rollEpoch(qOf(2024, 3))), '2024-03-06T23:00:00Z', 'marzec 2024 przed zmianą czasu (10.03): 17:00 CST = 23:00 UTC');
    assert.equal(K.contractName('ES', Z5), 'ESZ5'); assert.equal(K.contractName('MNQ', H6), 'MNQH6'); assert.equal(K.code4('NQ', H6), 'NQH2026');
    assert.deepEqual(K.parseCode4('ESH2026'), { root: 'ES', q: H6 });
    // reguła P35: pomiar, a bez pomiaru reguła zapasowa (poniedziałek, sesja od niedzieli 17:00)
    assert.equal(K.rollAtFn()(Z5), T_FB);
    assert.equal(iso(K.rollAtFn()(qOf(2026, 6))), '2026-06-14T22:00:00Z', 'czerwiec 2026 (Juneteenth w piątek wygaśnięcia): poniedziałek 15.06');
    assert.equal(K.rollAtFn(ROLLS)(Z5), T_R);
    assert.equal(K.rollAtFn(ROLLS)(H6), K.rollEpoch(H6, K.ROLL_FALLBACK_DAYS), 'roll bez pomiaru: zapas');
    assert.equal(K.frontQ(T_R - 1, ROLLS), Z5); assert.equal(K.frontQ(T_R, ROLLS), H6);
    assert.equal(K.frontQ(T_R, undefined), Z5, 'bez pomiaru piątek to jeszcze stary kontrakt');
    assert.equal(K.frontQ(T_FB, undefined), H6);
    assert.equal(T_CAL, K.rollEpoch(Z5), 'okno pomiaru zaczyna się sesją przed czwartkiem CME');
  });

  test('wykresy-18: P35 wygaśnięcie: trzeci piątek, święto giełdowe (Juneteenth 2026, obchodzony 2027, Wielki Piątek 2008) przesuwa na czwartek', async () => {
    const K = await lib('public/js/kontrakty.js');
    assert.equal(iso(K.expiryEpoch(Z5)), '2025-12-19T14:30:00Z', 'ESZ5: 8:30 CST w trzeci piątek');
    assert.equal(iso(K.expiryEpoch(qOf(2026, 6))), '2026-06-18T13:30:00Z', 'ESM6: 19.06.2026 to Juneteenth (piątek) → czwartek');
    assert.equal(iso(K.expiryEpoch(qOf(2027, 6))), '2027-06-17T13:30:00Z', 'ESM7: Juneteenth w sobotę obchodzony w piątek 18.06 → czwartek 17.06');
    assert.equal(iso(K.expiryEpoch(qOf(2008, 3))), '2008-03-20T13:30:00Z', 'ESH8: Wielki Piątek 21.03.2008 → czwartek');
    assert.equal(iso(K.expiryEpoch(qOf(2021, 6))), '2021-06-18T13:30:00Z', 'przed 2022 Juneteenth nie był świętem giełdowym');
    // roll liczony od trzeciego piątku (nie od przesuniętego wygaśnięcia): czerwiec 2026 jak pozostałe kwartały
    assert.equal(iso(K.rollEpoch(qOf(2026, 6))), '2026-06-10T22:00:00Z');
  });

  test('wykresy-18: P35 pole „Kontrakt”: format (kod miesiąca FGHJKMNQUVXZ), ES/NQ tylko kwartalne, zgodność z instrumentem, rok z daty trade\'a', async () => {
    const K = await lib('public/js/kontrakty.js');
    for (const [v, inst] of [['ESZ6', 'ES'], ['esz6', 'ES'], ['MNQH7', 'MNQ'], ['ESZ25', 'ES'], ['', 'ES'], ['6EZ6', 'EURUSD'], ['CLF7', 'CL'], ['NQM6', '']]) assert.equal(K.contractProblem(v, inst), null, `${v} dla ${inst}`);
    const bad = (v, inst, re) => { const p = K.contractProblem(v, inst); assert.ok(p, `${v} dla ${inst} odrzucone`); assert.match(p.key.replace(/\{(\w+)\}/g, (m, k) => p.vars[k]), re); };
    bad('ESA6', 'ES', /„ESA6” nie jest kodem kontraktu.*F G H J K M N Q U V X Z/);
    bad('ES6', 'ES', /nie jest kodem kontraktu/);
    bad('ESZ', 'ES', /nie jest kodem kontraktu/);
    bad('ES Z6', 'ES', /nie jest kodem kontraktu/);
    bad('ESF6', 'ES', /ES ma tylko kontrakty kwartalne.*„ESF6”/);
    bad('ESF6', '', /ES ma tylko kontrakty kwartalne/);
    bad('NQZ6', 'ES', /„NQZ6” nie pasuje do instrumentu ES.*ESZ6/);
    bad('ESZ6', 'MES', /nie pasuje do instrumentu MES/);
    assert.equal(K.contractQ('ESZ5', at('2025-12-15T15:00:00Z')), Z5);
    assert.equal(K.contractQ('ESH6', at('2025-12-15T15:00:00Z')), H6);
    assert.equal(K.contractQ('esz25', at('2025-12-15T15:00:00Z')), Z5, 'rok dwucyfrowy, małe litery');
    assert.equal(K.contractQ('MESZ5', at('2025-12-15T15:00:00Z')), Z5, 'MES: miesiąc ES');
    assert.equal(K.contractQ('ESZ5', at('2025-12-22T15:00:00Z')), null, 'po wygaśnięciu ESZ5 kod nie przeskakuje na ESZ2035');
    assert.equal(K.contractQ('ESZ5', at('2015-11-02T15:00:00Z')), qOf(2015, 12), 'ESZ5 w 2015 to grudzień 2015');
  });

  test('wykresy-18: P35 odcinki serii: reguła, przełączenie .v.0, kontrakt trade\'a w sesjach trade\'a, trade bez godziny, przerwa, brak wiedzy o .v.0', async () => {
    const K = await lib('public/js/kontrakty.js');
    const v0 = [[at('2025-09-17T00:00:00Z'), Z5], [T_V, H6]];
    const from = at('2025-12-08T00:00:00Z'), to = at('2025-12-19T00:00:00Z');
    assert.deepEqual(K.seriesSegments(from, to, v0, { rolls: ROLLS }), [{ from, to: T_R, q: Z5, src: 'v0' }, { from: T_R, to: T_V, q: H6, src: 'k' }, { from: T_V, to, q: H6, src: 'v0' }]);
    assert.deepEqual(K.seriesSegments(from, to, v0).map((s) => [iso(s.from), s.src]), [['2025-12-08T00:00:00Z', 'v0'], ['2025-12-14T23:00:00Z', 'k'], ['2025-12-17T00:00:00Z', 'v0']], 'bez pomiaru: reguła zapasowa');
    // trade w piątek z polem ESZ5: cała sesja piątku w ESZ5 (z .v.0), potem reguła
    const ov = { q: Z5, ...K.tradeSessions(at('2025-12-12T15:00:00Z'), at('2025-12-12T16:00:00Z')) };
    assert.deepEqual([ov.from, ov.to].map(iso), ['2025-12-11T23:00:00Z', '2025-12-12T22:00:00Z']);
    assert.deepEqual(K.seriesSegments(from, to, v0, { override: ov, rolls: ROLLS }).map((s) => [iso(s.from), K.contractName('ES', s.q), s.src]),
      [['2025-12-08T00:00:00Z', 'ESZ5', 'v0'], ['2025-12-12T22:00:00Z', 'ESH6', 'k'], ['2025-12-17T00:00:00Z', 'ESH6', 'v0']]);
    // trade w środę tygodnia wygaśnięcia z ESZ5: do północy UTC ESZ5 jest jeszcze w .v.0, od przełączenia .v.0 z warstwy kontraktu
    const ov2 = { q: Z5, ...K.tradeSessions(at('2025-12-17T15:00:00Z'), at('2025-12-17T15:30:00Z')) };
    assert.deepEqual(K.seriesSegments(at('2025-12-16T00:00:00Z'), to, v0, { override: ov2, rolls: ROLLS }).map((s) => [iso(s.from), K.contractName('ES', s.q), s.src]),
      [['2025-12-16T00:00:00Z', 'ESH6', 'k'], ['2025-12-16T23:00:00Z', 'ESZ5', 'v0'], ['2025-12-17T00:00:00Z', 'ESZ5', 'k'], ['2025-12-17T22:00:00Z', 'ESH6', 'v0']]);
    // kontrakt po wygaśnięciu nie ma świec: zostaje reguła
    const ov3 = { q: Z5, from: at('2025-12-19T14:00:00Z'), to: at('2025-12-19T22:00:00Z') };
    assert.deepEqual(K.seriesSegments(at('2025-12-19T00:00:00Z'), at('2025-12-20T00:00:00Z'), v0, { override: ov3, rolls: ROLLS }).map((s) => [iso(s.from), K.contractName('ES', s.q)]),
      [['2025-12-19T00:00:00Z', 'ESH6'], ['2025-12-19T14:00:00Z', 'ESZ5'], ['2025-12-19T14:30:00Z', 'ESH6']]);
    // wejście w przerwie 16:00-17:00: sesja następna
    assert.equal(iso(K.tradeSessions(at('2025-12-11T22:30:00Z')).from), '2025-12-11T23:00:00Z');
    // trade bez godziny: południe w Chicago dnia handlowego
    assert.equal(iso(K.dateRef('2025-12-11')), '2025-12-11T18:00:00Z');
    assert.equal(K.frontQ(K.dateRef('2025-12-12'), ROLLS), H6, 'dzień rolla bez godziny: nowy kontrakt');
    assert.equal(K.frontQ(K.dateRef('2025-12-11'), ROLLS), Z5, 'dzień przed rollem: stary');
    // bez wiedzy o .v.0 (brak danych) seria zachowuje się jak przed P35: wszystko z .v.0
    assert.ok(K.seriesSegments(from, to, []).length > 0 && K.seriesSegments(from, to, []).every((s) => s.src === 'v0'));
    // przełączenia z danych: tylko między rollem rynku a wygaśnięciem; wpis testowy w innym miejscu nic nie zmienia
    assert.deepEqual(K.v0FromRolls([{ t: T_V, label: '294973→42140878' }, { t: at('2026-10-26T00:01:40Z'), label: '1→2' }]), [[T_V, H6]]);
    assert.deepEqual(K.contractOptions(at('2025-12-12T15:00:00Z'), ROLLS).map((q) => K.contractName('ES', q)), ['ESZ5', 'ESH6'], 'tydzień rolla: stary i nowy');
    assert.deepEqual(K.contractOptions(at('2025-11-12T15:00:00Z')).map((q) => K.contractName('ES', q)), ['ESZ5', 'ESH6'], 'poza rollem: bieżący i następny');
  });

  test('wykresy-18: P35 back-adjust: przesunięcie kontraktu = suma luk późniejszych rolli (kumulatywnie wstecz, najnowszy 0)', async () => {
    const K = await lib('public/js/kontrakty.js');
    const off = K.adjustOffsets({ [H6]: 5500, [H6 + 1]: 5150 });
    assert.equal(off(H6 + 1), 0, 'najnowszy kontrakt bez przesunięcia');
    assert.equal(off(H6), 5150);
    assert.equal(off(Z5), 10650, 'ESZ5: obie luki');
    assert.equal(off(Z5 - 4), 10650, 'starsze bez znanych luk: ta sama suma');
  });

  // ---- magazyn: roll grudzień 2025 na danych syntetycznych ----
  async function store() {
    const C = await lib('lib/candles-store.mjs');
    const dir = H.tmp();
    const o = { baseDir: dir };
    const px = (t, base) => base + ((t / 900) % 4) * 25; // grosze: base + 0..0,75
    const W = await lib('public/js/swiece.js');
    // świece tylko w godzinach sesji CME (bez przerwy 16-17 Chicago i weekendu), jak w prawdziwych danych
    const bars = (a, b, base, vol = () => 10) => { const out = []; for (let t = a; t < b; t += 900) { if (!W.sessionBounds(t)) continue; const p = px(t, base); out.push([t, p, p + 25, p - 25, p, vol(t)]); } return out; };
    const A = at('2025-12-07T23:00:00Z'), B = at('2025-12-19T22:00:00Z');
    C.writeRange('ES', '1m', A, T_V, bars(A, T_V, 680000), { rolls: [] }, o); // .v.0 = ESZ5 6800
    C.writeRange('ES', '1m', T_V, B, bars(T_V, B, 685500), { rolls: [{ t: T_V, label: '294973→42140878' }] }, o); // .v.0 = ESH6 6855
    const P = at('2025-12-09T23:00:00Z'); // sesja przed rollem rynku (wtorek 17:00 CST)
    C.writeRange('ES', '1m-ESH2026', P, T_V, bars(P, T_V, 685500, (t) => (t < T_R ? 1 : 30)), {}, o); // obrót ESH6 przewyższa ESZ5 od sesji piątku
    C.writeAux('contracts-es', { resolvedTo: '2026-01-01', v0: [[at('2025-09-17T00:00:00Z'), Z5], [T_V, H6]], names: { [Z5]: { name: 'ESZ5', id: '294973' }, [H6]: { name: 'ESH6', id: '42140878' } } }, o);
    const { createCandles } = await lib('lib/candles.mjs');
    const K = createCandles({ getKey: () => '', getConfig: () => ({}), baseDir: dir, now: () => Date.UTC(2026, 0, 5) });
    return { C, K, dir, o };
  }
  const Q = { instrument: 'ES', from: String(at('2025-12-07T23:00:00Z')), to: String(at('2025-12-19T22:00:00Z')) };

  test('wykresy-18: P35 odczyt: seria przechodzi na ESH6 na otwarciu sesji rolla, znacznik z nazwami, 1D czysta, 1W jak ES1! (dwa kontrakty)', async () => {
    const { K } = await store();
    const h = K.read({ ...Q, tf: '1h' });
    assert.deepEqual(h.rolls, [{ t: T_R, from: 'ESZ5', to: 'ESH6', label: 'ESZ5 → ESH6' }], 'znacznik w chwili rolla rynku, nie .v.0');
    const before = h.bars.filter((b) => b[0] < T_R), after = h.bars.filter((b) => b[0] >= T_R);
    assert.ok(before.length > 0 && before.every((b) => b[3] >= 6799 && b[2] <= 6801.5), 'przed rollem ESZ5');
    assert.ok(after.length > 0 && after.every((b) => b[3] >= 6854 && b[2] <= 6856.5), 'od rolla ESH6, także przed przełączeniem .v.0 (bez wiszenia 55 pkt)');
    assert.deepEqual(h.missing, []);
    const d = K.read({ ...Q, tf: '1D' });
    const rollDay = d.bars.find((b) => b[0] === T_R);
    assert.ok(rollDay && rollDay[1] >= 6855 && rollDay[3] >= 6854, `świeca dnia rolla tylko z ESH6: ${JSON.stringify(rollDay)}`);
    assert.ok(d.bars.find((b) => b[0] === T_R - 86400)[2] <= 6801.5, 'dzień przed: tylko ESZ5');
    // PDH/PDL w dniu rolla z ESH6 (poprzednia sesja w nowym kontrakcie), nie z ESZ5
    assert.deepEqual(d.prevIn, [[T_R, 6856, 6854.75]]);
    const w = K.read({ ...Q, tf: '1W' });
    assert.equal(w.bars.length, 2);
    const [wk] = w.bars;
    assert.equal(iso(wk[0]), '2025-12-07T23:00:00Z');
    assert.ok(wk[1] < 6802 && wk[4] > 6854 && wk[2] >= 6856 && wk[3] <= 6800, `tydzień rolla: open ESZ5, close ESH6 (jak ES1! bez B-ADJ): ${JSON.stringify(wk)}`);
    assert.deepEqual(w.rolls.map((r) => r.label), ['ESZ5 → ESH6'], 'znacznik na świecy tygodnia');
    // MES: te same dane, nazwy z przedrostkiem M
    assert.deepEqual(K.read({ ...Q, instrument: 'MES', tf: '1h' }).rolls.map((r) => r.label), ['MESZ5 → MESH6']);
  });

  test('wykresy-18: P35 okno rolla niepobrane: seria pokazuje .v.0 (bez dziury, znacznik w chwili faktycznej zmiany), missing wskazuje okno do pobrania; jawny kontrakt bez podmiany', async () => {
    const { C, K, o } = await store();
    // bez warstwy ESH6: pokrycie warstwy kontraktu usunięte (stan przed importem okien rolli)
    const covFile = path.join(o.baseDir, 'candles', 'ES', 'coverage.json');
    const cov = json(covFile); delete cov['1m-ESH2026']; writeFileSync(covFile, JSON.stringify(cov));
    const h = K.read({ ...Q, tf: '1h' });
    assert.deepEqual(h.rolls.map((r) => [iso(r.t), r.label]), [['2025-12-17T00:00:00Z', 'ESZ5 → ESH6']]);
    assert.ok(h.bars.some((b) => b[0] === T_R) && h.bars.filter((b) => b[0] >= T_R && b[0] < T_V).length > 3 && h.bars.filter((b) => b[0] >= T_R && b[0] < T_V).every((b) => b[2] < 6802), 'świece ESZ5 z .v.0 zamiast dziury');
    assert.deepEqual(h.missing.map(([a, b]) => [iso(a), iso(b)]), [['2025-12-14T23:00:00Z', '2025-12-17T00:00:00Z']], 'do pobrania: ESH6 od reguły zapasowej (bez świec nie ma pomiaru)');
    const pinned = K.read({ ...Q, tf: '1h', tfrom: String(at('2025-12-12T15:00:00Z')), contract: 'ESH6' });
    assert.ok(pinned.bars.length > 0 && pinned.missing.length > 0 && !pinned.bars.some((b) => b[0] >= at('2025-12-11T23:00:00Z') && b[0] < at('2025-12-12T22:00:00Z')), 'jawny ESH6 bez świec: dziura, nie ESZ5 pod nazwą ESH6');
    void C;
  });

  test('wykresy-18: P35 PDH/PDL z prevIn: w dniu rolla linie z kontraktu wyświetlanego, brak danych = bez linii', async () => {
    const S = await lib('public/js/swiece.js');
    const times = [T_R + 3600, T_R + 7200];
    const daily = [[T_R - 86400, 6800, 6801, 6799, 6800, 1]];
    assert.deepEqual(S.pdhlSpans(times, daily).map((x) => [x.hi, x.lo]), [[6801, 6799]], 'bez prevIn: poprzednia sesja serii (ESZ5)');
    assert.deepEqual(S.pdhlSpans(times, daily, { prevIn: [[T_R, 6856, 6854.75]] }).map((x) => [x.hi, x.lo]), [[6856, 6854.75]], 'z prevIn: ESH6');
    assert.deepEqual(S.pdhlSpans(times, daily, { prevIn: [[T_R, null, null]] }), [], 'poprzednia sesja w ESH6 niepobrana: bez linii');
  });

  test('wykresy-18: P35 kontrakt trade\'a: ESZ5 w dniu rolla zostaje w sesji trade\'a, po przełączeniu .v.0 brakujące świece ESZ5 w missing, zły kod 400', async () => {
    const { K } = await store();
    const r = K.read({ ...Q, tf: '1h', tfrom: String(at('2025-12-12T15:00:00Z')), tto: String(at('2025-12-12T16:00:00Z')), contract: 'esz5' });
    assert.deepEqual(r.rolls.map((x) => [iso(x.t), x.label]), [['2025-12-12T22:00:00Z', 'ESZ5 → ESH6']]);
    assert.ok(r.bars.filter((b) => b[0] < at('2025-12-12T22:00:00Z')).length > 3 && r.bars.filter((b) => b[0] < at('2025-12-12T22:00:00Z')).every((b) => b[2] < 6802), 'sesja trade\'a w ESZ5');
    assert.deepEqual(r.contract, { code: 'ESZ5', auto: false, rule: 'ESH6', options: ['ESZ5', 'ESH6'], shown: true });
    const auto = K.read({ ...Q, tf: '1h', tfrom: String(at('2025-12-12T15:00:00Z')), tto: String(at('2025-12-12T16:00:00Z')) });
    assert.deepEqual(auto.contract, { code: 'ESH6', auto: true, rule: 'ESH6', options: ['ESZ5', 'ESH6'], shown: true });
    assert.deepEqual(auto.rolls.map((x) => x.label), ['ESZ5 → ESH6']);
    // ESH6 z pola w czwartek: sesja trade'a w ESH6, przerwa 16-17 (ESZ5 wg reguły, bez świec), od piątku ESH6 wg pomiaru: jeden znacznik, bez pary przez pustą przerwę
    const thu = K.read({ ...Q, tf: '1h', tfrom: String(at('2025-12-11T15:00:00Z')), tto: String(at('2025-12-11T16:00:00Z')), contract: 'ESH6' });
    assert.deepEqual(thu.rolls.map((x) => [iso(x.t), x.label]), [['2025-12-10T23:00:00Z', 'ESZ5 → ESH6']], JSON.stringify(thu.rolls.map((x) => [iso(x.t), x.label])));
    const late = K.read({ ...Q, tf: '1h', tfrom: String(at('2025-12-17T15:00:00Z')), tto: String(at('2025-12-17T15:30:00Z')), contract: 'ESZ5' });
    assert.deepEqual(late.missing.map(([a, b]) => [iso(a), iso(b)]), [['2025-12-17T00:00:00Z', '2025-12-17T22:00:00Z']], 'ESZ5 po przełączeniu .v.0: do pobrania (wcześniej jest w .v.0)');
    assert.deepEqual(late.rolls.map((x) => x.label), ['ESZ5 → ESH6', 'ESH6 → ESZ5', 'ESZ5 → ESH6']);
    for (const c of ['ESF6', 'NQZ5', 'ESQ']) assert.throws(() => K.read({ ...Q, tf: '1h', tfrom: String(at('2025-12-11T15:00:00Z')), contract: c }), (e) => e.status === 400 && e.code === 'bad-contract', c);
    assert.throws(() => K.read({ ...Q, tf: '1h', tfrom: String(at('2025-12-22T15:00:00Z')), contract: 'ESZ5' }), (e) => e.code === 'bad-contract' && /wygasł przed wejściem/.test(e.message));
  });

  test('wykresy-18: P35 back-adjust w odczycie: ESZ5 przesunięty o lukę 55 pkt (zamknięcia z ostatniej wspólnej minuty), domyślnie wyłączony', async () => {
    const { K } = await store();
    const plain = K.read({ ...Q, tf: '1h' });
    assert.equal(plain.adjust, undefined, 'domyślnie bez back-adjust');
    const adj = K.read({ ...Q, tf: '1h', adjust: '1' });
    assert.equal(adj.adjust.on, true); assert.deepEqual(adj.adjust.missing, [], 'okno widoczne: luka rolla ESZ5 → ESH6 znana');
    assert.equal(adj.adjust.unknown, 62, '63 rolli od 06.2010 do 12.2025 w zasięgu pokrycia, jedna luka znana (ESZ5 → ESH6), reszta bez świec = nieznana, liczona jak 0');
    const b0 = plain.bars.find((b) => b[0] < T_R), a0 = adj.bars.find((b) => b[0] === b0[0]);
    assert.equal(a0[1] - b0[1], 55, 'ESZ5 + 55 pkt');
    assert.deepEqual(adj.bars.filter((b) => b[0] >= T_R), plain.bars.filter((b) => b[0] >= T_R), 'najnowszy kontrakt bez zmian');
    const d = K.read({ ...Q, tf: '1D', adjust: '1' });
    assert.deepEqual(d.prevIn, [[T_R, 6856, 6854.75]], 'prevIn w kontrakcie ESH6 (przesunięcie 0)');
  });

  test('wykresy-18: P35 plan pobrania i kolejka: okno rolla i sesja przed nim w ESH6 po symbolu surowym, trade z polem „Kontrakt” w kolejce, strażnik kredytu', async () => {
    const A = await H.atrapaDb(++port);
    const old = process.env.DATABENTO_API_BASE;
    process.env.DATABENTO_API_BASE = A.base;
    try {
      await A.config({ end: '2026-01-05T10:00:00.000000000Z', resolve: {
        'ES.v.0': [{ d0: '2025-09-17', d1: '2025-12-17', s: '294973' }, { d0: '2025-12-17', d1: '2026-01-05', s: '42140878' }],
        ESZ5: [{ d0: '2025-09-17', d1: '2026-01-05', s: '294973' }], ESH6: [{ d0: '2025-09-17', d1: '2026-01-05', s: '42140878' }], ESU5: [], ESM6: [],
      } });
      const { createCandles } = await lib('lib/candles.mjs');
      const TEST_KEY = 'db-test-key-0123456789abcdef'; // klucz atrapy (testy/atrapa-databento.mjs; import pliku uruchomiłby atrapę)
      const cfg = {};
      const dir = H.tmp();
      const C = createCandles({ getKey: () => TEST_KEY, getConfig: () => cfg, baseDir: dir, now: () => Date.UTC(2026, 0, 5, 12) });
      const q = await C.quote({ instrument: 'ES', from: at('2025-12-08T00:00:00Z'), to: at('2025-12-19T00:00:00Z'), layer: '1m' });
      const cs = json(path.join(dir, 'contracts-es.json'));
      assert.deepEqual(cs.v0, [[at('2025-09-17T00:00:00Z'), Z5], [T_V, H6]], 'przełączenia .v.0 z darmowego symbology.resolve');
      assert.deepEqual(cs.names[H6], { name: 'ESH6', id: '42140878' });
      const L = (await A.log()).log.filter((e) => e.path.endsWith('get_cost')).map((e) => [e.params.symbols, e.params.stype_in, e.params.start, e.params.end]).sort((x, y) => x[2].localeCompare(y[2]) || x[0].localeCompare(y[0])); // wyceny równolegle: kolejność w logu nie jest stała
      assert.deepEqual(L, [
        ['ES.v.0', 'continuous', '2025-12-08T00:00:00Z', '2025-12-14T23:00:00Z'],
        ['ESH6', 'raw_symbol', '2025-12-09T23:00:00Z', '2025-12-17T00:00:00Z'],
        ['ES.v.0', 'continuous', '2025-12-17T00:00:00Z', '2025-12-19T00:00:00Z'],
      ], '.v.0 do reguły zapasowej (bez danych nie ma pomiaru), ESH6 w oknie pomiaru od sesji przed czwartkiem CME do przełączenia .v.0: ' + JSON.stringify(L));
      assert.equal(q.ranges.length, 3);
      // pobranie: świece ESH6 trafiają do warstwy kontraktu, licznik kredytu rośnie
      await C.fetchDays({ instrument: 'ES', from: at('2025-12-08T00:00:00Z'), to: at('2025-12-19T00:00:00Z'), layer: '1m', confirmedCostUsd: q.costUsd });
      for (let i = 0; i < 300 && C.status().running; i++) await H.sleep(30);
      assert.equal(C.status().error, null, JSON.stringify(C.status().error));
      const r = C.read({ instrument: 'ES', from: String(at('2025-12-08T00:00:00Z')), to: String(at('2025-12-19T00:00:00Z')), tf: '1h' });
      assert.deepEqual(r.missing, []);
      assert.ok(r.bars.filter((b) => b[0] >= T_FB && b[0] < T_V).length > 3 && r.bars.filter((b) => b[0] >= T_FB && b[0] < T_V).every((b) => b[1] >= 5080), 'okno rolla z symbolu surowego (atrapa: +55)');
      assert.ok(r.bars.filter((b) => b[0] < T_CAL - 86400).length > 3 && r.bars.filter((b) => b[0] < T_CAL - 86400).every((b) => b[1] < 5030), 'przed oknem pomiaru .v.0');
      assert.ok(cfg.chartCredit.spentUsd > 0.02, 'wydatek w liczniku kredytu (P25)');
      // kolejka (P36, 28.10.2026): trade w środę tygodnia wygaśnięcia z polem ESZ5 → tylko okno 1s w kontrakcie trade'a; minutówki sesji na kliknięcie z wyceną
      await A.reset();
      const e = C.enqueue({ trades: [{ instrument: 'ES', entry: at('2025-12-17T15:00:00Z'), exit: at('2025-12-17T15:20:00Z'), contract: 'ESZ5' }] });
      assert.equal(e.invalid, 0);
      const items = C.status().queue.items.map((i) => [i.layer, iso(i.from), iso(i.to)]).sort();
      assert.deepEqual(items, [['1s-ESZ2025', '2025-12-17T14:30:00Z', '2025-12-17T15:50:00Z']], 'w kolejce tylko okno sekundowe');
      assert.equal(C.enqueue({ trades: [{ instrument: 'ES', entry: at('2025-12-17T15:00:00Z'), exit: at('2025-12-17T15:20:00Z'), contract: 'ESF6' }] }).invalid, 1, 'zły kod kontraktu: pozycja pominięta');
      await C.tick();
      const got = (await A.log()).log.filter((x) => x.path.endsWith('get_range')).map((x) => [x.params.symbols, x.params.stype_in, x.params.schema]);
      assert.deepEqual(got, [['ESZ5', 'raw_symbol', 'ohlcv-1s']], 'tick pobiera tylko 1s kontraktu trade, żadnych minutówek (P36)');
      const t2 = C.read({ instrument: 'ES', from: String(at('2025-12-16T00:00:00Z')), to: String(at('2025-12-19T00:00:00Z')), tf: '1m', tfrom: String(at('2025-12-17T15:00:00Z')), tto: String(at('2025-12-17T15:20:00Z')), contract: 'ESZ5' });
      assert.ok(t2.missing.length > 0, 'minutówki reszty sesji brakują: wykres pokaże przycisk z wyceną zamiast pobierać sam');
      assert.ok(t2.bars.some((b) => b[0] === at('2025-12-17T15:00:00Z') && b[1] >= 5080), 'świece ESZ5 w sesji trade\'a');
      assert.deepEqual((await A.log()).violations, []);
    } finally { if (old === undefined) delete process.env.DATABENTO_API_BASE; else process.env.DATABENTO_API_BASE = old; A.stop(); }
  });

  test('wykresy-18: P35 import okien rolli (series=contracts): tylko warstwy kontraktów, wycena przed pobraniem, nieznana seria odrzucona', async () => {
    const A = await H.atrapaDb(++port);
    const old = process.env.DATABENTO_API_BASE;
    process.env.DATABENTO_API_BASE = A.base;
    try {
      await A.config({ end: '2026-01-05T10:00:00.000000000Z', resolve: { 'ES.v.0': [{ d0: '2025-09-17', d1: '2025-12-17', s: '294973' }, { d0: '2025-12-17', d1: '2026-01-05', s: '42140878' }], ESZ5: [{ d0: '2025-09-17', d1: '2026-01-05', s: '294973' }], ESH6: [{ d0: '2025-09-17', d1: '2026-01-05', s: '42140878' }] } });
      const { createCandles } = await lib('lib/candles.mjs');
      const C = createCandles({ getKey: () => 'db-test-key-0123456789abcdef', getConfig: () => ({}), baseDir: H.tmp(), now: () => Date.UTC(2026, 0, 5, 12) });
      const dry = await C.importHistory({ instrument: 'ES', series: 'contracts', from: at('2025-12-01T00:00:00Z'), to: at('2026-01-01T00:00:00Z'), dryRun: true });
      assert.equal(dry.runs, 1, 'okno rolla z sesją przed nim jednym żądaniem');
      assert.equal(dry.dryRun, true);
      const L = (await A.log()).log.filter((e) => e.path.endsWith('get_cost')).map((e) => [e.params.symbols, e.params.start, e.params.end]);
      assert.deepEqual(L, [['ESH6', '2025-12-09T23:00:00Z', '2025-12-17T00:00:00Z']], JSON.stringify(L));
      assert.equal((await A.log()).log.filter((e) => e.path.endsWith('get_range')).length, 0, 'wycena bez pobierania');
      await assert.rejects(C.importHistory({ instrument: 'ES', series: 'v1', dryRun: true }), /Nieprawidłowa seria importu: v1/);
    } finally { if (old === undefined) delete process.env.DATABENTO_API_BASE; else process.env.DATABENTO_API_BASE = old; A.stop(); }
  });

  test('wykresy-18: P35 migracja 005 i zapis pola „Kontrakt” przez dashboard: wybór na wykresie = PATCH z edited, walidacja, 409 przy cudzej zmianie', async () => {
    const { loadMigrations, validateMigration } = await lib('lib/migrate.mjs');
    const { ROLES } = await lib('lib/roles.mjs');
    const m = (await loadMigrations(path.join(ROOT, 'migrations'))).find((x) => x.version === 5);
    validateMigration(m, m.file);
    assert.deepEqual(m.ops, [{ op: 'addProperty', db: 'trades', role: 'contract', spec: { type: 'rich_text', name: { pl: 'Kontrakt', en: 'Contract' } } }]);
    assert.ok(ROLES.trades.contract.optional);
    const sch = json(path.join(ROOT, 'schema/notion-schema.json'));
    assert.equal(sch.schemaVersion, 5);
    assert.deepEqual(sch.databases.trades.properties.contract, { type: 'rich_text', name: { pl: 'Kontrakt', en: 'Contract' } });
    const A = await H.atrapa(++port);
    const dir = H.tmp();
    const I = H.IDS;
    writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x\nNOTION_ROOT_URL=${H.PARENT_URL}\nDS_TRADES=${I.DS_TRADES}\nDS_KONTA=${I.DS_KONTA}\nDS_DZIENNIK=${I.DS_DZIENNIK}\nDS_FINANSE=${I.DS_FINANSE}\n`);
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: 4, lang: 'pl' }));
    const env = H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    const before = await A.dump();
    const mg = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], env);
    assert.equal(mg.code, 0, mg.err);
    const sTr = (await A.dump())[I.DS_TRADES].schema;
    assert.equal(sTr.Kontrakt?.type, 'rich_text');
    const added = Object.keys(sTr).filter((k) => !(k in before[I.DS_TRADES].schema));
    assert.ok(added.includes('Kontrakt') && !added.includes('Contract'), JSON.stringify(added));
    const S = await H.server(++port, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    try {
      const data = async () => (await fetch(`${S.base}/api/data?refresh=1`)).json();
      const d0 = await data();
      assert.equal(d0.fields.trades.contract, 'rich_text');
      const row0 = d0.data.trades.find((x) => x.instrument?.name === 'ES') || d0.data.trades[0];
      const id = row0._id;
      // to samo żądanie, które wysyła lista kontraktów na wykresie (app.js saveContract)
      const r = await H.dash(S.base, `/api/trades/${id}`, { contract: 'esh6', edited: row0._edited }, { method: 'PATCH' });
      assert.equal(r.status, 200, JSON.stringify(r.j));
      const p = (await A.get('/__test/pages?ds=trades')).find((x) => x.id === id).p;
      assert.equal(p.Kontrakt.rich_text.map((x) => x.text?.content ?? x.plain_text).join(''), 'ESH6', 'zapis wielkimi literami');
      const row = (await data()).data.trades.find((x) => x._id === id);
      assert.equal(row.contract, 'ESH6');
      const St = await lib('public/js/stats.js');
      assert.equal(St.normalizeTrades([row])[0].contract, 'ESH6');
      const bad = await H.dash(S.base, `/api/trades/${id}`, { contract: 'ESF6', edited: row._edited }, { method: 'PATCH' });
      assert.equal(bad.status, 400);
      assert.match(bad.j.fields?.contract || '', /kwartalne/);
      // D2 (przegląd P35): sam PATCH „contract” sprawdza kod względem instrumentu ZAPISANEGO trade'a, nie tylko tego z żądania
      const wrongRow = (await data()).data.trades.find((x) => x.instrument?.name === 'NQ');
      const esRow = (await data()).data.trades.find((x) => x.instrument?.name === 'ES');
      assert.ok(esRow, 'dane testowe mają trade ES');
      const mism = await H.dash(S.base, `/api/trades/${esRow._id}`, { contract: 'NQZ5', edited: esRow._edited }, { method: 'PATCH' });
      assert.equal(mism.status, 400, 'NQZ5 przy trade ES odrzucone');
      assert.match(mism.j.fields?.contract || '', /„NQZ5” nie pasuje do instrumentu ES.*ESZ6/);
      assert.equal((await data()).data.trades.find((x) => x._id === esRow._id).contract, esRow.contract || '', 'pole bez zmian');
      const nqRow = wrongRow;
      const okNq = await H.dash(S.base, `/api/trades/${nqRow._id}`, { contract: 'NQZ5', edited: nqRow._edited }, { method: 'PATCH' });
      assert.equal(okNq.status, 200, 'NQZ5 przy trade NQ przechodzi: ' + JSON.stringify(okNq.j));
      const stale = await H.dash(S.base, `/api/trades/${id}`, { contract: 'ESZ5', edited: row0._edited }, { method: 'PATCH' });
      assert.equal(stale.status, 409, 'stary znacznik edycji: konflikt, bez nadpisania');
      assert.equal(stale.j.code, 'stale');
      const clr = await H.dash(S.base, `/api/trades/${id}`, { contract: '', edited: row._edited }, { method: 'PATCH' });
      assert.equal(clr.status, 200, 'Auto czyści pole');
      assert.equal((await data()).data.trades.find((x) => x._id === id).contract, '');
      assert.deepEqual(await A.get('/__test/violations'), []);
    } finally { S.stop(); A.stop(); }
    // Zachowanie wykresu (klik na liście = PATCH z edited, edycja z zablokowanym B-ADJ) sprawdza E2E: testy/wykresy-e2e-p35.mjs (K3, K4, K5); tu trasa serwera wyżej.
  });

  // P35-poprawki W2 (przegląd 28.10.2026): pamięć podręczna pomiaru rolla musi się unieważniać po każdym dopisaniu świec, także gdy zakres
  // wydłuża się w środku listy zakresów (bez scalenia z ostatnim). Scenariusz: wrzesień 2025 dociągnięty do przełączenia .v.0, osobny zakres w grudniu.
  test('wykresy-18: P35 pomiar rolla: dociągnięcie świec w środku listy zakresów odświeża pomiar w tym samym procesie (jak po restarcie)', async () => {
    const C = await lib('lib/candles-store.mjs');
    const S = await lib('public/js/swiece.js');
    const K = await lib('public/js/kontrakty.js');
    const { createCandles } = await lib('lib/candles.mjs');
    const dir = H.tmp();
    const o = { baseDir: dir };
    const bars = (a, b, p, vol) => { const out = []; for (let t = a; t < b; t += 900) { if (!S.sessionBounds(t)) continue; out.push([t, p, p + 25, p - 25, p, vol(t)]); } return out; };
    const qU = K.qOf(2025, 9), qZ = K.qOf(2025, 12), qH = K.qOf(2026, 3);
    const TVs = at('2025-09-17T00:00:00Z'), FRI = at('2025-09-11T22:00:00Z'), Ps = at('2025-09-08T22:00:00Z'), cut = at('2025-09-12T18:00:00Z');
    C.writeRange('ES', '1m', Ps, cut, bars(Ps, cut, 650000, () => 10), { rolls: [] }, o); // .v.0 do piątku 18:00Z (sesja piątku niepełna: bez pomiaru)
    C.writeRange('ES', '1m-ESZ2025', at('2025-09-09T22:00:00Z'), TVs, bars(at('2025-09-09T22:00:00Z'), TVs, 655000, (t) => (t < FRI ? 1 : 30)), {}, o);
    C.writeRange('ES', '1m', at('2025-12-08T00:00:00Z'), at('2025-12-19T00:00:00Z'), bars(at('2025-12-08T00:00:00Z'), at('2025-12-19T00:00:00Z'), 680000, () => 10), { rolls: [] }, o); // ostatni zakres listy = grudzień
    C.writeAux('contracts-es', { resolvedTo: '2026-01-01', v0: [[at('2025-06-18T00:00:00Z'), qU], [TVs, qZ], [at('2025-12-17T00:00:00Z'), qH]], names: {} }, o);
    const mk = () => createCandles({ getKey: () => '', getConfig: () => ({}), baseDir: dir, now: () => Date.UTC(2026, 0, 5) });
    const Cn = mk();
    const Qs = { instrument: 'ES', from: String(Ps), to: String(TVs), tf: '1h' };
    const label = (r) => r.rolls.map((x) => iso(x.t) + ' ' + x.label);
    assert.deepEqual(label(Cn.read(Qs)), ['2025-09-14T22:00:00Z ESU5 → ESZ5'], 'przed dociągnięciem: piątek niepełny, zapas (poniedziałek)');
    C.writeRange('ES', '1m', cut, TVs, bars(cut, TVs, 650000, () => 10), { rolls: [] }, o); // dociągnięcie reszty: wydłuża pierwszy zakres, bez scalenia z grudniem
    const fresh = label(mk().read(Qs));
    assert.deepEqual(fresh, ['2025-09-11T22:00:00Z ESU5 → ESZ5'], 'nowy proces mierzy piątek');
    assert.deepEqual(label(Cn.read(Qs)), fresh, 'ten sam proces: pomiar odświeżony po dopisaniu');
  });

  // P35-poprawki (przegląd 28.10.2026, D5/D6): migracja 005 uruchomiona ponownie nic nie zmienia, a pole „Kontrakt” innego typu zatrzymuje aktualizację
  // z czytelnym komunikatem i bez nadpisania pola.
  const migEnv = async (port0, version, { root = true } = {}) => {
    const A = await H.atrapa(port0);
    const dir = H.tmp(), I = H.IDS;
    writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x
${root ? `NOTION_ROOT_URL=${H.PARENT_URL}
` : ''}DS_TRADES=${I.DS_TRADES}
DS_KONTA=${I.DS_KONTA}
DS_DZIENNIK=${I.DS_DZIENNIK}
DS_FINANSE=${I.DS_FINANSE}
`);
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: version, lang: 'pl' }));
    return { A, dir, env: H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }) };
  };
  test('wykresy-18: P35 migracja 005 uruchomiona ponownie (idempotencja): drugi przebieg i przebieg od wersji 4 nie dodają pola ani nie piszą do Notion', async () => {
    const { A, dir, env } = await migEnv(++port, 4);
    try {
      const run = (extra = []) => H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json', ...extra], env);
      const r1 = await run();
      assert.equal(r1.code, 0, r1.err);
      assert.deepEqual(r1.lines.find((l) => l.migrations).migrations.changes.filter((c) => c.version === 5).map((c) => c.status), ['add']);
      const schema1 = (await A.dump())[H.IDS.DS_TRADES].schema;
      assert.equal(schema1.Kontrakt?.type, 'rich_text');
      const w1 = (await A.writes()).length;
      const r2 = await run();
      assert.equal(r2.code, 0, r2.err);
      assert.equal((await A.writes()).length, w1, 'drugi przebieg niczego nie zapisuje');
      writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: 4, lang: 'pl' })); // wymuszone ponowne przejście migracji 005
      const r3 = await run();
      assert.equal(r3.code, 0, r3.err);
      assert.deepEqual(r3.lines.find((l) => l.migrations).migrations.changes.filter((c) => c.version === 5).map((c) => c.status), ['skip'].slice(1), 'pole już jest: krok pominięty (skip nie trafia na listę zmian)');
      assert.equal((await A.writes()).length, w1, 'ponowne przejście niczego nie zapisuje');
      const schema3 = (await A.dump())[H.IDS.DS_TRADES].schema;
      assert.deepEqual(Object.keys(schema3).filter((k) => /kontrakt|contract/i.test(k)), ['Kontrakt'], 'jedno pole, bez duplikatu');
      assert.equal(json(path.join(dir, 'config.local.json')).schemaVersion, 5);
    } finally { A.stop(); }
  });

  test('wykresy-18: P35 migracja 005 przy istniejącym polu „Kontrakt” innego typu: konflikt, czytelny komunikat, pole nietknięte, wersja schematu nie rośnie', async () => {
    const { A, dir, env } = await migEnv(++port, 4);
    try {
      const notion = (await lib('lib/notion.mjs')).createNotion({ token: 'x', base: A.base });
      await notion.patch(`/v1/data_sources/${H.IDS.DS_TRADES}`, { properties: { Kontrakt: { number: {} } } });
      assert.equal((await A.dump())[H.IDS.DS_TRADES].schema.Kontrakt?.type, 'number', 'warunek wstępny: pole liczbowe o tej nazwie');
      const w0 = (await A.writes()).length;
      const r = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], env);
      assert.equal(r.code, 2, 'konflikt = kod wyjścia 2');
      const ch = r.lines.find((l) => l.migrations).migrations.changes.find((c) => c.version === 5);
      assert.equal(ch.status, 'conflict');
      assert.match(ch.detail, /„Kontrakt” już istnieje i ma typ number.*zmień jego nazwę w Notion/);
      assert.equal((await A.dump())[H.IDS.DS_TRADES].schema.Kontrakt?.type, 'number', 'pole nie zostało nadpisane');
      assert.equal((await A.writes()).length, w0, 'migracja nic nie zapisała');
      assert.equal(json(path.join(dir, 'config.local.json')).schemaVersion, 4, 'konflikt zatrzymuje podniesienie wersji schematu');
      const again = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], env);
      assert.equal(again.code, 2, 'kolejne uruchomienie znów zgłasza konflikt (nie udaje, że jest dobrze)');
    } finally { A.stop(); }
  });

  // Regresja c99e4ee (28.10.2026): instalacja bez NOTION_ROOT_URL. Krok bloku ustawień (migracja 002) zgłasza konflikt „brak strony głównej”,
  // ale to nie jest konflikt pola: migracje 003–005 i tak dodają kolumny, a wersja schematu dochodzi do 5.
  test('wykresy-18: migracje bez NOTION_ROOT_URL: brak strony głównej nie zatrzymuje dodania pól 003–005 (regresja c99e4ee)', async () => {
    const { A, dir, env } = await migEnv(++port, 1, { root: false });
    try {
      const r = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], env);
      const changes = r.lines.find((l) => l.migrations).migrations.changes;
      const block = changes.find((c) => c.version === 2 && c.kind === 'block');
      assert.equal(block?.status, 'conflict', 'warunek wstępny: blok ustawień bez strony głównej = konflikt');
      assert.match(block.detail, /NOTION_ROOT_URL/);
      for (const v of [3, 4, 5]) assert.ok(changes.some((c) => c.version === v && c.kind === 'property' && c.status === 'add'), `migracja ${v} dodaje pole`);
      const schema = (await A.dump())[H.IDS.DS_TRADES].schema;
      for (const name of ['Cena wejścia', 'Cena wyjścia', 'SL', 'TP', 'Rysunki', 'BE', 'Kontrakt']) assert.ok(schema[name], `pole „${name}” dodane`);
      assert.equal(json(path.join(dir, 'config.local.json')).schemaVersion, 5, 'wersja schematu dochodzi do 5');
    } finally { A.stop(); }
  });

  test('wykresy-18: P35 front: parametry zapytania trade\'a (bez godziny: dzień handlowy), B-ADJ domyślnie wł. (P38)', async () => {
    const P = await lib('public/js/podglad.js');
    const K = await lib('public/js/kontrakty.js');
    const ent = Date.parse('2025-12-11T15:00:00Z');
    assert.deepEqual(P.tradeQuery({ at: ent, exitAt: ent + 3600e3, time: '16:00', contract: 'esz5' }), { tfrom: ent / 1000, tto: ent / 1000 + 3600, contract: 'ESZ5' });
    assert.deepEqual(P.tradeQuery({ at: Date.parse('2025-12-10T23:00:00Z'), date: '2025-12-11', time: null }), { tfrom: K.dateRef('2025-12-11'), tto: K.dateRef('2025-12-11') });
    const mem = new Map();
    globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
    try {
      // P38 (28.10.2026): od P38 domyślnie WŁĄCZONY (ustawienie w Ustawieniach, szczegóły: wykresy-20); localStorage wykresu nie zapamiętuje już wyboru z przycisku
      assert.equal(P.loadBadj(), true, 'domyślnie włączony');
      P.setBadjDefault(false); assert.equal(P.loadBadj(), false); P.setBadjDefault(true);
    } finally { delete globalThis.localStorage; }
    assert.match(P.barToggles(0), /data-swc="badj" aria-pressed="false"/);
    assert.match(src('public/styles.css'), /\.swc-warn \{[^}]*var\(--warn\)/, 'kolor ostrzeżenia z tokenu');
  });
};
