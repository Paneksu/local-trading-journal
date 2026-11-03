// backtest-173 (presety): pakiet 1.7-3, nazwane presety zleceń (docs/plany/backtest/1.7.0/etap-1-7-3-auto-be-presety.md, sekcje C i D, krawędzie 11-14).
// Testy czyste (Node): sanitizeBt presetów (zakresy, nazwy, limit 20, budżet, zły wpis nie psuje reszty), preset → zlecenie (SL/TP w pkt, tickach i R:R, cztery tryby wielkości),
// przejście przez sanitizeSettings bez wycięcia, opis skrótowy i walidacja edytora. Dane syntetyczne, zero sieci. Każda asercja ma wartość policzoną na papierze.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const P = (o = {}) => ({ id: 'p1', name: 'Scalp', sl: { unit: 'pts', value: 10 }, tps: [{ unit: 'rr', value: 2, pct: 100 }], size: { mode: 'session', value: 0 }, autoBe: { kind: 'r', value: 1, offsetTicks: 0 }, ...o });

  test('backtest-173: sanitizeBt presetów: kształt, zakresy, nazwy, limit 20, budżet, zły wpis nie psuje reszty', async () => {
    const { sanitizeBt } = await imp('public/js/bt-czas.js');
    const S = (list, extra = {}) => sanitizeBt({ presets: list, ...extra });
    // poprawny preset przechodzi bez zmian, obce pola odpadają
    const ok = S([{ ...P(), key: 'x', foo: 1 }]).presets;
    assert.deepEqual(ok, [P()]);
    // zły wpis w środku nie psuje pozostałych
    const mixed = S([P({ id: 'a1', name: 'A' }), { id: 'bad', name: 'Zły', sl: { unit: 'km', value: 3 }, size: { mode: 'qty', value: 1 } }, P({ id: 'c1', name: 'C' })]).presets;
    assert.deepEqual(mixed.map((p) => p.name), ['A', 'C']);
    // zakresy i typy
    const bad = [
      P({ id: 'b1', name: 'b1', sl: { unit: 'pts', value: 0 } }), P({ id: 'b2', name: 'b2', sl: { unit: 'pts', value: -3 } }), P({ id: 'b3', name: 'b3', sl: { unit: 'pts', value: 'abc' } }),
      P({ id: 'b4', name: 'b4', size: { mode: 'pct', value: 101 } }), P({ id: 'b5', name: 'b5', size: { mode: 'qty', value: 2.5 } }), P({ id: 'b6', name: 'b6', size: { mode: 'usd', value: 0 } }),
      P({ id: 'b7', name: 'b7', autoBe: { kind: 'price', value: 100, offsetTicks: 0 } }), P({ id: 'b8', name: 'b8', autoBe: { kind: 'pts', value: 2, offsetTicks: 21 } }),
      P({ id: 'b9', name: 'b9', tps: [{ unit: 'rr', value: -1, pct: 100 }] }), P({ id: 'ba', name: '   ' }), P({ id: '', name: 'bez id' }), P({ id: 'bb', name: 'bb', size: { mode: 'foo', value: 1 } }),
    ];
    assert.deepEqual(S(bad).presets, [], 'żaden zły wpis nie przechodzi');
    // zależności: R:R, wielkość z ryzyka i auto-BE w R wymagają SL
    assert.deepEqual(S([P({ id: 'd1', name: 'd1', sl: null })]).presets, [], 'TP w R:R bez SL');
    assert.deepEqual(S([P({ id: 'd1b', name: 'd1b', sl: null, tps: [{ unit: 'rr', value: 2, pct: 100 }], size: { mode: 'qty', value: 1 }, autoBe: null })]).presets, [], 'sam TP w R:R bez SL (reszta poprawna)');
    assert.deepEqual(S([P({ id: 'd2', name: 'd2', sl: null, tps: [], autoBe: null })]).presets, [], 'ryzyko sesji bez SL');
    assert.deepEqual(S([P({ id: 'd3', name: 'd3', sl: null, tps: [], size: { mode: 'qty', value: 2 } })]).presets, [], 'auto BE w R bez SL');
    assert.equal(S([P({ id: 'd4', name: 'd4', sl: null, tps: [{ unit: 'pts', value: 20, pct: 100 }], size: { mode: 'qty', value: 2 }, autoBe: { kind: 'pts', value: 5, offsetTicks: 0 } })]).presets.length, 1, 'bez SL wolno, gdy nic go nie wymaga');
    // nazwa: przycięta do 24 znaków i bez białych znaków na brzegach; id i nazwa unikalne (wielkość liter bez znaczenia)
    assert.equal(S([P({ name: `  ${'x'.repeat(40)}  ` })]).presets[0].name, 'x'.repeat(24));
    assert.deepEqual(S([P({ id: 'u1', name: 'Scalp' }), P({ id: 'u2', name: 'SCALP' }), P({ id: 'u1', name: 'Inny' }), P({ id: 'u3', name: 'Runner' })]).presets.map((p) => p.id), ['u1', 'u3']);
    // limit 20: pierwsze dwadzieścia
    const many = Array.from({ length: 25 }, (_, i) => P({ id: `m${i}`, name: `Preset ${i}` }));
    const lim = S(many).presets;
    assert.equal(lim.length, 20);
    assert.equal(lim[19].id, 'm19');
    // budżet znaków: nadmiar odrzucany (budżet testowy mieści dwa wpisy)
    const { sanitizePresets } = await imp('public/js/bt-presety.js');
    const one = JSON.stringify([P()]).length;
    assert.deepEqual(sanitizePresets(many.slice(0, 5), { budget: one * 2 + 40 }).map((p) => p.id), ['m0', 'm1'], 'trzeci wpis przekracza budżet');
    // nie-tablica i brak pola: domyślne
    assert.deepEqual(S('x').presets, []);
    assert.deepEqual(sanitizeBt({}).presets, []);
    assert.equal(sanitizeBt({}).activePreset, null);
    assert.equal(sanitizeBt({}).beOffset, 0);
    // aktywny preset: tylko istniejące id; offset BE: liczba całkowita 0..20
    assert.equal(S([P()], { activePreset: 'p1' }).activePreset, 'p1');
    assert.equal(S([P()], { activePreset: 'nie-ma' }).activePreset, null, 'usunięty albo nieistniejący wraca na Brak (krawędź 14)');
    assert.equal(S([], { activePreset: 'p1' }).activePreset, null);
    assert.deepEqual([0, 3, 20, 21, -1, 1.5, 'x'].map((v) => S([], { beOffset: v }).beOffset), [0, 3, 20, 0, 0, 0, 0]);
  });

  test('backtest-173: preset → zlecenie (SL/TP w pkt, tickach i R:R, wielkość z czterech trybów)', async () => {
    const { presetOrder } = await imp('public/js/bt-presety.js');
    const run = (p, o = {}) => presetOrder(p, { side: 'buy', entry: 18000, instrument: 'NQ', riskUsd: 900, balance: 50000, ...o });
    // Runner: SL 15 pkt, TP 3R, ryzyko sesji 900 $, auto BE 1R. NQ: 15 · 20 = 300 $ na kontrakt → 3 kontrakty
    const runner = P({ id: 'r1', name: 'Runner', sl: { unit: 'pts', value: 15 }, tps: [{ unit: 'rr', value: 3, pct: 100 }] });
    let r = run(runner);
    assert.deepEqual(r.order, { instrument: 'NQ', side: 'buy', type: 'market', qty: 3, sl: 17985, tp: 18045, autoBe: { kind: 'r', value: 1, offsetTicks: 0 } }, 'SL 18000 − 15, TP 18000 + 3 · 15');
    assert.equal(r.slPts, 15);
    // Short: lustro
    r = run(runner, { side: 'sell' });
    assert.deepEqual([r.order.sl, r.order.tp, r.order.side], [18015, 17955, 'sell']);
    // ticki: SL 20 ticków = 5 pkt, TP 40 ticków = 10 pkt; ryzyko 900 $ / (5 · 20) = 9
    r = run(P({ sl: { unit: 'ticks', value: 20 }, tps: [{ unit: 'ticks', value: 40, pct: 100 }], autoBe: null }));
    assert.deepEqual([r.order.sl, r.order.tp, r.order.qty, r.order.autoBe], [17995, 18010, 9, null]);
    // TP w punktach, bez SL (wielkość stała)
    r = run(P({ sl: null, tps: [{ unit: 'pts', value: 12.5, pct: 100 }], size: { mode: 'qty', value: 4 }, autoBe: { kind: 'pts', value: 5, offsetTicks: 2 } }));
    assert.deepEqual([r.order.sl, r.order.tp, r.order.qty, r.order.autoBe], [null, 18012.5, 4, { kind: 'pts', value: 5, offsetTicks: 2 }]);
    // bez TP
    assert.equal(run(P({ tps: [] })).order.tp, null);
    // cztery tryby wielkości przy SL 15 pkt (300 $ na kontrakt): sesja 900 → 3, $ 1500 → 5, % salda 3 z 50 000 = 1500 → 5, stała 7
    const sz = (size, o) => run(P({ id: 'z', name: 'z', sl: { unit: 'pts', value: 15 }, tps: [], autoBe: null, size }), o).order.qty;
    assert.equal(sz({ mode: 'session', value: 0 }), 3);
    assert.equal(sz({ mode: 'usd', value: 1500 }), 5);
    assert.equal(sz({ mode: 'pct', value: 3 }), 5);
    assert.equal(sz({ mode: 'qty', value: 7 }), 7);
    // ES ma mnożnik 50: 15 · 50 = 750 $ na kontrakt, 1500 $ → 2
    assert.equal(sz({ mode: 'usd', value: 1500 }, { instrument: 'ES' }), 2);
    // ryzyko za małe na ten SL (krawędź 12): 200 $ / 300 $ = 0
    assert.deepEqual(run(runner, { riskUsd: 200 }), { err: 'small', slPts: 15 });
    // zależności, gdy preset przeszedł obok edytora
    assert.equal(run({ ...P(), sl: null }).err, 'rr-no-sl');
    assert.equal(run({ ...P(), sl: null, tps: [] }).err, 'size-no-sl');
    assert.equal(run(P(), { entry: NaN }).err, 'no-entry');
    assert.equal(run(null).err, 'no-entry');
  });

  test('backtest-173: presety przechodzą sanitizeSettings bez wycięcia (głębokość, klucze, 20 wpisów)', async () => {
    const { sanitizeSettings } = await imp('lib/sync.mjs');
    const { sanitizeBt } = await imp('public/js/bt-czas.js');
    const list = Array.from({ length: 20 }, (_, i) => P({ id: `s${i}`, name: `Preset ${i}`, autoBe: { kind: 'usd', value: 100 + i, offsetTicks: 2 } }));
    const bt = sanitizeBt({ presets: list, activePreset: 's7', beOffset: 3 });
    assert.equal(bt.presets.length, 20);
    const synced = sanitizeSettings({ bt });
    assert.deepEqual(synced.bt.presets, bt.presets, 'wszystkie pola presetów (sl, tps[0], size, autoBe) zostają');
    assert.equal(synced.bt.activePreset, 's7');
    assert.equal(synced.bt.beOffset, 3);
    // ten sam wynik po drugim przejściu (idempotencja sanitizeBt)
    assert.deepEqual(sanitizeBt(synced.bt).presets, bt.presets);
  });

  test('backtest-173: opis skrótowy presetu i walidacja edytora z powodem przy polu', async () => {
    const { presetSummary, presetErrors } = await imp('public/js/bt-presety.js');
    assert.equal(presetSummary(P()), 'SL 10 pkt · TP 2R · ryzyko sesji · auto BE 1R');
    assert.equal(presetSummary(P({ sl: { unit: 'ticks', value: 8 }, tps: [{ unit: 'pts', value: 20, pct: 100 }], size: { mode: 'usd', value: 250 }, autoBe: { kind: 'pts', value: 5, offsetTicks: 2 } })), 'SL 8 ticki · TP 20 pkt · ryzyko 250 $ · auto BE 5 pkt +2t');
    // liczba mnoga „3 kontrakty” pochodzi ze słownika pl.json (w Node niezaładowanego), więc sprawdzamy początek zdania
    assert.match(presetSummary(P({ sl: null, tps: [], size: { mode: 'qty', value: 3 }, autoBe: null })), /^bez SL · 3 kontrakt/);
    assert.deepEqual(presetErrors(P()), {});
    assert.equal(presetErrors(P({ name: '' })).name, 'Wpisz nazwę presetu.');
    assert.equal(presetErrors(P({ name: 'scalp' }), [P({ id: 'inny', name: 'Scalp' })]).name, 'Preset o tej nazwie już jest.');
    assert.equal(presetErrors(P(), [P()]).name, undefined, 'ten sam preset nie koliduje sam ze sobą');
    assert.equal(presetErrors(P({ sl: null })).tp, 'TP w R:R wymaga SL.');
    assert.equal(presetErrors(P({ sl: null })).size, 'Wielkość z ryzyka wymaga SL.');
    assert.equal(presetErrors(P({ sl: null })).abe, 'Auto BE w R wymaga SL.');
    assert.deepEqual(presetErrors(P({ sl: null, tps: [], size: { mode: 'qty', value: 1 }, autoBe: null })), {});
  });

  test('backtest-173: pamięć panelu: pole abe tylko z poprawnym kształtem (on boolean, rodzaj, wartość, offset), stary zapis bez abe znaczy wyłączony', async () => {
    const { recallOrderFields, rememberOrderFields, ORD_MEM_KEY } = await imp('public/js/bt-zlecenia.js');
    const store = (o) => { const d = { [ORD_MEM_KEY]: JSON.stringify(o) }; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; } }; };
    const base = { unit: 'pt', sl: '10', tp: '20' };
    const get = (abe) => recallOrderFields(store({ NQ: { ...base, ...(abe === undefined ? {} : { abe }) } }), 'NQ');
    assert.deepEqual(get({ on: true, kind: 'r', value: '1', off: '' }).abe, { on: true, kind: 'r', value: '1', off: '' });
    assert.equal(get().abe, undefined, 'stary zapis bez abe');
    assert.equal(get({ on: 'yes', kind: 'r', value: '1', off: '' }).abe, undefined, 'on nie jest boolean');
    assert.equal(get({ on: true, kind: 'foo', value: '1', off: '' }).abe, undefined, 'zły rodzaj');
    assert.equal(get({ on: true, kind: 'r', value: '-3', off: '' }).abe, undefined, 'wartość ujemna');
    assert.equal(get({ on: true, kind: 'r', value: '1', off: 'x' }).abe, undefined, 'offset nie jest liczbą');
    assert.equal(get({ on: true, kind: 'r', value: '1', off: '123' }).abe, undefined, 'offset trzycyfrowy');
    // zapis przez rememberOrderFields ma ten sam kształt
    const st = store({}); rememberOrderFields(st, 'NQ', { ...base, abe: { on: false, kind: 'ticks', value: '8', off: '2' } });
    assert.deepEqual(recallOrderFields(st, 'NQ').abe, { on: false, kind: 'ticks', value: '8', off: '2' });
  });
};
