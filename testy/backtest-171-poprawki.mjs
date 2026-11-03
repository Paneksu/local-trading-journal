// backtest-171 (poprawki po przeglądach pakietu 1.7-1): MAE/MFE na żywo po wyjściu częściowym (przyrostowo), `book.gone`, BE nigdy nie cofa SL, odporność migracji i magazynu
// na nietypowy plik sesji (lista, statystyki, odczyt 422), atomowa kopia kopie-1.6, licznik dysku. Dane syntetyczne, zero sieci.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const T = 1000;
  const S = (...bars) => ({ bars, len: bars.map(() => 60) });
  const bar = (t, o, h, l, c) => [t, o, h, l, c, 10];
  const long = (extra = {}) => ({ instrument: 'NQ', side: 'buy', type: 'market', qty: 1, sl: 99, tp: null, ...extra });

  // przykład z przeglądu: Long 2 @100, SL 90 (rUsd 400 $), zamknięcie 1 @101 w T+60, potem high 120 i low 80
  const partialCase = async () => {
    const W = await imp('public/js/bt-wypelnienia.js');
    let { book } = W.placeOrder(W.emptyBook(), long({ qty: 2, sl: 90 }), { t: T, price: 100 });
    book = W.closePartial(book, 'NQ', 1, { t: T + 60, price: 101 }).book;
    const st = S(bar(T, 100, 100.5, 99.5, 100.25), bar(T + 60, 100.5, 120, 100, 110), bar(T + 120, 110, 111, 80, 90));
    return { W, pos: book.positions.NQ, st };
  };

  test('backtest-171: MAE/MFE otwartej pozycji liczą się dalej po wyjściu częściowym (1,05 / −0,95)', async () => {
    const { W, pos, st } = await partialCase();
    const K = await imp('public/js/bt-konto.js');
    assert.deepEqual(K.liveExcursions(pos, st, T + 180), { maeR: -0.95, mfeR: 1.05 });
    assert.deepEqual(W.excursions(pos, st, { eff: T + 180 }), { maeR: -0.95, mfeR: 1.05 });
    // do świecy po wyjściu częściowym, ale przed spadkiem: MFE 1,05, MAE tylko z pierwszej świecy
    assert.deepEqual(K.liveExcursions(pos, st, T + 120), { maeR: -0.05, mfeR: 1.05 });
  });

  test('backtest-171: tracker MAE/MFE z wyjściami jest przyrostowy i zgodny z liczeniem od początku', async () => {
    const { pos, st } = await partialCase();
    const K = await imp('public/js/bt-konto.js');
    const tr = K.createExcursionTracker();
    for (const eff of [T + 60, T + 120, T + 180, T + 180]) assert.deepEqual(tr.get(pos, st, eff), K.liveExcursions(pos, st, eff), `eff ${eff}`);
    // cofnięcie kursora liczy od nowa
    assert.deepEqual(tr.get(pos, st, T + 120), K.liveExcursions(pos, st, T + 120));
    // przyrostowość: drugie wywołanie z tym samym eff nie wraca do początku strumienia (stan wznawia od ostatniej świecy)
    const W = await imp('public/js/bt-wypelnienia.js');
    const state = {};
    W.excursions(pos, st, { eff: T + 180, state });
    assert.equal(state.i, 3, 'stan zapamiętał trzy przetworzone świece');
    // zmiana danych w już przetworzonej świecy nie wpływa na wynik wznowiony ze stanu (nie czyta jej drugi raz), a liczenie od początku ją widzi
    const keep = st.bars[0][2];
    st.bars[0][2] = 1e6;
    assert.deepEqual(W.excursions(pos, st, { eff: T + 180, state }), { maeR: -0.95, mfeR: 1.05 });
    assert.notDeepEqual(W.excursions(pos, st, { eff: T + 180 }), { maeR: -0.95, mfeR: 1.05 });
    st.bars[0][2] = keep;
  });

  // [U] 3.11.2026 «wywalamy to cofniecie czasu usuwa trade, zbedne, mam usuwanie juz manualne wiec jak bede chcial to usune» (pakiet 6 odwołany): book.gone i order.hist nie są zapisywane (odbiór 1.7.0, P2-1)
  test('backtest-171: anulowanie, wypełnienie, przeciwne wejście i eod nie zostawiają book.gone (zdarzenia silnika bez zmian)', async () => {
    const W = await imp('public/js/bt-wypelnienia.js');
    const lim = (price, extra = {}) => ({ instrument: 'NQ', side: 'buy', type: 'limit', price, qty: 1, sl: 90, ...extra });
    let b = W.placeOrder(W.emptyBook(), lim(99.5), { t: T, price: 100 }).book;
    const id = b.orders[0].id;
    const c = W.cancelOrder(b, id);
    assert.equal(c.orders.length, 0);
    assert.ok(!('gone' in c) && !('gone' in b), 'anulowanie bez book.gone');
    // wypełnienie jednego i drugie kupno dotknięte w tej samej świecy wchodzi jako dokładka (1.7-2 P3)
    b = W.placeOrder(b, lim(99), { t: T, price: 100 }).book;
    const r = W.advance(b, 'NQ', S(bar(T, 100, 100.25, 98.5, 99.75)), T + 60);
    assert.ok(!('gone' in r.book), 'wypełnienie bez book.gone');
    const sell = W.placeOrder(b, lim(101, { side: 'sell', sl: 110 }), { t: T, price: 100 }).book;
    const rs = W.advance(sell, 'NQ', S(bar(T, 100, 100.25, 98.5, 99.75)), T + 60);
    assert.ok(rs.events.some((e) => e.type === 'cancelled' && e.reason === 'filled-other'), 'przeciwne wejście: zdarzenie filled-other zostaje');
    assert.ok(!('gone' in rs.book));
    const e = W.placeOrder(W.emptyBook(), { instrument: 'ES', side: 'buy', type: 'limit', price: 4990, qty: 1, sl: 4980 }, { t: T, price: 5000 }).book;
    const eod = W.closeAll(e, 'ES', { t: T + 9, price: 5000 }, 'eod');
    assert.ok(eod.events.some((x) => x.type === 'cancelled' && x.reason === 'eod'), 'eod: zdarzenie zostaje');
    assert.ok(!('gone' in eod.book));
    assert.equal(W.closeAll(e, 'ES', { t: T + 9, price: 5000 }, 'manual').book.orders.length, 0);
  });

  test('backtest-171: BE nigdy nie cofa SL: przy SL po stronie zysku przycisk nieaktywny, silnik odrzuca', async () => {
    const W = await imp('public/js/bt-wypelnienia.js');
    let { book } = W.placeOrder(W.emptyBook(), long({ sl: 99 }), { t: T, price: 100 });
    book = W.modifyPosition(book, 'NQ', { sl: 103 }, { t: T + 1, price: 105 }).book;
    assert.deepEqual(W.beState(book, 'NQ', { t: T, price: 105 }), { ok: false, why: 'sl-above' });
    const r = W.moveToBE(book, 'NQ', { t: T + 2, price: 105 });
    assert.equal(r.events[0].reason, 'sl-better');
    assert.equal(r.book.positions.NQ.sl, 103, 'SL nietknięty');
    // Short: lustro
    let sh = W.placeOrder(W.emptyBook(), { instrument: 'NQ', side: 'sell', type: 'market', qty: 1, sl: 101 }, { t: T, price: 100 }).book;
    sh = W.modifyPosition(sh, 'NQ', { sl: 97 }, { t: T + 1, price: 95 }).book;
    assert.deepEqual(W.beState(sh, 'NQ', { t: T, price: 95 }), { ok: false, why: 'sl-below' });
    assert.equal(W.moveToBE(sh, 'NQ', { t: T + 2, price: 95 }).book.positions.NQ.sl, 97);
    // SL po stronie straty nadal idzie na BE
    const ok = W.moveToBE(W.placeOrder(W.emptyBook(), long({ sl: 95 }), { t: T, price: 100 }).book, 'NQ', { t: T + 1, price: 102 });
    assert.equal(ok.book.positions.NQ.sl, 100);
  });

  test('backtest-171: migracja i derive znoszą nietypowy kształt księgi i wielką drabinkę TP', async () => {
    const W = await imp('public/js/bt-wypelnienia.js');
    const pos = (x) => ({ id: 'p1', instrument: 'NQ', dir: 'Long', qty: 1, openQty: 1, entryT: 5, entryPrice: 100, sl: 99, tp: null, exits: [], ...x });
    const bad = [
      { positions: { ES: 5 } }, { positions: 'x' }, { positions: [1, 2] }, 'tekst', { orders: [null, 5, { id: 'o1', price: 1 }] },
      { positions: { NQ: pos({ fills: [null] }) } }, { positions: { NQ: pos({ exits: 5 }) } }, { positions: { NQ: pos({ tps: 'x', log: 7 }) } },
      { positions: { NQ: pos({ fills: [{ t: 5, at: 5, price: 100, qty: 1, slRef: 99 }], tps: [null, { id: 'tp1', price: 101, pct: 100, hit: null }] }) } }, { gone: 'x', orders: 'y' },
    ];
    for (const x of bad) assert.doesNotThrow(() => W.migrateBook(x), JSON.stringify(x).slice(0, 60));
    const m = W.migrateBook({ positions: { ES: 5, NQ: pos({ fills: [null] }) } });
    assert.equal(m.positions.ES, null);
    assert.equal(m.v, 3);
    assert.deepEqual(W.migrateBook(m), m, 'idempotentna także po sprzątaniu');
    // 300 tys. poziomów TP: bez RangeError z Math.max(...)
    const tps = Array.from({ length: 300000 }, (_, i) => ({ id: `tp${i}`, price: 101 + i * 0.25, pct: 0, hit: null }));
    const big = W.derive({ ...pos({}), fills: [{ t: 5, at: 5, price: 100, qty: 1, slRef: 99 }], tps });
    assert.equal(big.tp, 101 + 299999 * 0.25);
  });

  test('backtest-171: magazyn: plik z nietypową księgą nie wywraca listy, statystyk ani odczytu; uszkodzony JSON dalej 422', async () => {
    const { createBacktestStore } = await imp('lib/backtest-store.mjs');
    const dir = H.tmp(), sdir = path.join(dir, 'backtest', 'sessions');
    mkdirSync(sdir, { recursive: true });
    const base = { v: 2, rev: 1, name: 'x', def: { instruments: ['NQ'], from: '2024-03-12' }, trades: [], book: { v: 3, orders: [], positions: { ES: null, NQ: null, MES: null, MNQ: null }, hw: 0, seq: 0 } };
    writeFileSync(path.join(sdir, 'bt-dobra001.json'), JSON.stringify({ ...base, name: 'dobra' }));
    writeFileSync(path.join(sdir, 'bt-zla00001.json'), JSON.stringify({ ...base, name: 'zla', book: { positions: { ES: 5 }, orders: [null], fills: 3 } }));
    writeFileSync(path.join(sdir, 'bt-zla00002.json'), JSON.stringify({ ...base, name: 'zla2', book: 'tekst' }));
    const logs = [];
    const store = createBacktestStore({ baseDir: dir, log: (...a) => logs.push(a.join(' ')) });
    // migrateBook sprząta nietypowy kształt zamiast rzucać: wszystkie trzy sesje są na liście, w statystykach i da się je odczytać (księga v3 z pustymi pozycjami)
    assert.deepEqual(store.list().map((x) => x.id).sort(), ['bt-dobra001', 'bt-zla00001', 'bt-zla00002']);
    const st = store.forStats(null);
    assert.equal(st.sessions.length, 3);
    assert.deepEqual(st.failed, []);
    for (const id of ['bt-zla00001', 'bt-zla00002']) {
      const d = store.read(id);
      assert.equal(d.book.v, 3);
      assert.equal(d.book.positions.ES, null);
    }
    // uszkodzony JSON dalej daje 422 corrupt, a lista i statystyki go pomijają z wpisem w logu (nazwa pliku)
    writeFileSync(path.join(sdir, 'bt-zepsuty1.json'), '{ nie json');
    assert.deepEqual(store.list().map((x) => x.id).sort(), ['bt-dobra001', 'bt-zla00001', 'bt-zla00002']);
    assert.ok(logs.some((l) => /bt-zepsuty1.json/.test(l)), `wpis w logu z nazwą pliku: ${logs.join(' | ')}`);
    let err = null;
    try { store.read('bt-zepsuty1'); } catch (e) { err = e; }
    assert.ok(err && err.status === 422 && err.code === 'corrupt');
    assert.equal(store.read('bt-dobra001').name, 'dobra');
  });

  test('backtest-171: kopia kopie-1.6: pierwszy zapis w formacie 1.7 dopiero po udanej kopii; przerwana kopia nie zostaje, plik 1.6 nietknięty, następny zapis ponawia', async () => {
    const { createBacktestStore } = await imp('lib/backtest-store.mjs');
    const fs = await import('node:fs');
    const dir = H.tmp(), sdir = path.join(dir, 'backtest', 'sessions'), id = 'bt-abc123', file = path.join(sdir, `${id}.json`), kopia = path.join(sdir, 'kopie-1.6', `${id}.json`);
    mkdirSync(sdir, { recursive: true });
    const raw = JSON.stringify({ v: 2, id, rev: 2, def: { instruments: ['NQ'] }, trades: [], book: { orders: [], positions: { ES: null, NQ: null, MES: null, MNQ: null }, hw: 0, seq: 0 } });
    writeFileSync(file, raw);
    const logs = [];
    // (1) kopia przerwana w połowie: zapis połowy bajtów do pliku, potem błąd (jak pełny dysk w trakcie kopiowania)
    const przerwana = { copyFileSync: (from, to) => { fs.writeFileSync(to, fs.readFileSync(from).subarray(0, 20)); throw new Error('dysk pełny'); }, renameSync: fs.renameSync };
    let store = createBacktestStore({ baseDir: dir, log: (...x) => logs.push(x.join(' ')), fsx: przerwana });
    const doc = store.read(id);
    let err = null;
    try { store.save(id, { ...doc, name: 'p1' }, 2); } catch (e) { err = e; }
    assert.ok(err && err.status === 500 && err.code === 'legacy-copy', `zapis odrzucony kodem legacy-copy (jest: ${err?.status} ${err?.code})`);
    assert.match(err.message, /kopii sesji/, 'czytelny komunikat');
    assert.equal(readFileSync(file, 'utf8'), raw, 'plik sesji nietknięty, nadal format 1.6');
    assert.equal(existsSync(kopia), false, 'żadnej uciętej kopii pod docelową nazwą');
    assert.deepEqual(readdirSync(path.join(sdir, 'kopie-1.6')), [], 'ani pliku tymczasowego');
    assert.ok(logs.some((l) => /kopia pliku sesji 1\.6 nie powiodła się/.test(l) && /bt-abc123/.test(l)), 'wpis w logu');
    // (2) rename rzuca (blokada pliku): to samo
    const bezRename = { copyFileSync: fs.copyFileSync, renameSync: () => { throw new Error('EBUSY'); } };
    store = createBacktestStore({ baseDir: dir, log: () => {}, fsx: bezRename });
    assert.throws(() => store.save(id, { ...doc, name: 'p2' }, 2), (e) => e.code === 'legacy-copy');
    assert.equal(readFileSync(file, 'utf8'), raw);
    assert.equal(existsSync(kopia), false);
    assert.deepEqual(readdirSync(path.join(sdir, 'kopie-1.6')), []);
    // (3) następny zapis (kopia działa): kopia powstaje atomowo z bajtami 1.6, dopiero potem plik ma format 1.7
    store = createBacktestStore({ baseDir: dir, log: () => {} });
    assert.doesNotThrow(() => store.save(id, { ...doc, name: 'p3' }, 2));
    assert.equal(readFileSync(kopia, 'utf8'), raw, 'kopia = bajty pliku 1.6');
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).book.v, 3);
    assert.deepEqual(readdirSync(path.join(sdir, 'kopie-1.6')), [`${id}.json`]);
  });

  test('backtest-171: licznik dysku nie liczy kopie-1.6 jako sesji ani jako usuniętych', async () => {
    const D = await imp('lib/dysk.mjs');
    const dir = H.tmp(), sdir = path.join(dir, 'backtest', 'sessions');
    mkdirSync(path.join(sdir, 'kopie-1.6'), { recursive: true });
    mkdirSync(path.join(sdir, 'usuniete'), { recursive: true });
    writeFileSync(path.join(sdir, 'bt-abc123.json'), '{}');
    writeFileSync(path.join(sdir, 'kopie-1.6', 'bt-abc123.json'), '{"a":1}');
    writeFileSync(path.join(sdir, 'usuniete', 'bt-zzz999-20260101T000000Z.json'), '{}');
    const r = await D.scanData({ dataDir: dir, backupsDir: path.join(dir, 'kopie') });
    assert.equal(r.sessions.count, 1);
    assert.equal(r.removedSessions.count, 1);
  });

};
