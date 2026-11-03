// backtest-K: model sesji v2 (ciągła oś czasu) i migracja v1 → v2 przy odczycie (public/js/bt-sesja.js, lib/backtest-store.mjs).
// [U] 31.10.2026 «Przenieś»: stare sesje 1.5.0 otwierają się w nowym modelu bez utraty danych. Dane syntetyczne, katalogi tymczasowe.
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  // Dokument v1 jak z 1.5.0: pula w kolejności „od najnowszych”, dzień 2 w toku, otwarta pozycja i zlecenie w książce, rysunki per dzień, dwa trade'y.
  const v1 = () => ({
    v: 1, id: 'bt-stara01', rev: 7, name: 'Stara sesja', created: '2026-10-30T10:00:00.000Z', updated: '2026-10-30T11:00:00.000Z', opened: '2026-10-30T10:30:00.000Z',
    def: { instruments: ['NQ', 'ES'], from: '2024-03-01', to: '2024-03-29', balance: 50000, risk: { mode: 'usd', value: 500 }, startTime: '09:00', order: 'newest', seed: 42, accountId: null, filter: { op: 'and', not: false, items: [{ k: 'wd', days: [2] }] }, excluded: ['2024-03-05'] },
    pool: ['2024-03-26', '2024-03-19', '2024-03-12'], dayIdx: 1, cursor: 1710854100, hw: 1710854100,
    layout: { kind: '2h', charts: [{ instrument: 'NQ', tf: '1m' }, { instrument: 'ES', tf: '5m' }], active: 1 },
    days: { '2024-03-26': { status: 'done' }, '2024-03-19': { status: 'active' } },
    book: { positions: { NQ: { instrument: 'NQ', dir: 'Long', qty: 1, openQty: 1, entryT: 1710853800, entryPrice: 18000, sl0: 17990, sl: 17990, tp: 18030, exits: [] } }, orders: [{ id: 'o3', instrument: 'ES', side: 'sell', type: 'limit', price: 5200, qty: 1, sl: 5210, tp: 5180, placedT: 1710853900 }], hw: 1710854100, hwi: { NQ: 1710854100, ES: 1710854100 } },
    trades: [
      { id: 't1', day: '2024-03-26', instrument: 'NQ', dir: 'Short', qty: 1, entryT: 1711460000, entryPrice: 18300, sl0: 18310, r: 1.5, journal: 'done', setup: 'ORB', notion: { id: 'p1', state: 'sent', error: null } },
      { id: 't2', day: '2024-03-19', instrument: 'ES', dir: 'Long', qty: 2, entryT: 1710853000, entryPrice: 5190, sl0: 5185, r: -1, journal: 'todo', notion: { id: null, state: 'pending', error: null } },
    ],
    drawings: {
      NQ: {
        '2024-03-26': { v: 1, at: '2026-10-30T10:10:00.000Z', d: [{ id: 'a', kind: 'horizontal-line', points: [{ time: 1711450000000, price: 18200 }] }, { id: 'b', kind: 'trend-line', points: [] }] },
        '2024-03-19': { v: 1, at: '2026-10-30T10:40:00.000Z', d: [{ id: 'b', kind: 'trend-line', points: [{ time: 1, price: 2 }] }, { id: 'c', kind: 'callout', text: 'CPI' }] },
      },
      ES: { '2024-03-19': { v: 1, at: '2026-10-30T10:41:00.000Z', d: [{ id: 'e', kind: 'rectangle' }] } },
    },
  });

  test('backtest-K: migracja sesji v1 → v2 (trade\'y, rysunki, książka, kursor)', async () => {
    const { migrateSession, SESSION_V } = await imp('public/js/bt-sesja.js');
    assert.equal(SESSION_V, 2);
    const src = v1(), before = JSON.stringify(src);
    const d = migrateSession(src);
    assert.equal(JSON.stringify(src), before, 'wejście bez zmian (czysta funkcja)');
    assert.equal(d.v, 2);
    assert.equal(d.def.from, '2024-03-12', 'data startu = najwcześniejszy dzień dawnej puli');
    assert.equal(d.def.to, undefined, 'bez daty końca («Do końca danych»)');
    for (const k of ['order', 'seed']) assert.ok(!(k in d.def), `def.${k} znika`);
    for (const k of ['pool', 'dayIdx', 'days']) assert.ok(!(k in d), `${k} znika z modelu`);
    assert.equal(d.cursor, 1710854100, 'kursor tam, gdzie był');
    assert.equal(d.hw, 1710854100);
    // 1.7-1: księga przechodzi migrateBook (v: 3, fills, tps, hist), a lustro pozycji i pola zleceń z 1.6 zostają bez zmian
    assert.equal(d.book.v, 3);
    for (const k of Object.keys(src.book.positions)) {
      const a = src.book.positions[k], b = d.book.positions[k];
      if (!a) { assert.equal(b, null); continue; }
      for (const f of ['id', 'instrument', 'dir', 'qty', 'openQty', 'entryT', 'entryPrice', 'sl', 'tp', 'be', 'orderId']) if (a[f] !== undefined) assert.deepEqual(b[f], a[f], `pozycja ${k}.${f} bez zmian`);
    }
    assert.deepEqual(d.book.orders.map(({ intent, tps, hist, ...o }) => o), src.book.orders, 'zlecenia oczekujące bez zmian (poza intent, tps, hist)');
    assert.equal(d.book.hw, src.book.hw);
    assert.deepEqual(d.trades, src.trades, "trade'y bez zmian");
    assert.deepEqual(d.layout, src.layout, 'układ bez zmian');
    assert.deepEqual(d.def.filter, src.def.filter, 'filtr zostaje (skok „następny dzień z filtra”)');
    assert.deepEqual(d.def.excluded, src.def.excluded);
    // rysunki: jeden dokument per instrument, wszystkie kształty, dubel id = wersja z nowszego zapisu (at)
    assert.deepEqual(d.drawings.NQ.d.map((x) => x.id).sort(), ['a', 'b', 'c']);
    assert.deepEqual(d.drawings.NQ.d.find((x) => x.id === 'b').points, [{ time: 1, price: 2 }], 'dubel id: nowszy zapis (at) wygrywa');
    assert.equal(d.drawings.NQ.v, 1);
    assert.deepEqual(d.drawings.ES.d.map((x) => x.id), ['e']);
    // nic nie ginie: stare pola w v1
    assert.deepEqual(d.v1.pool, src.pool); assert.equal(d.v1.dayIdx, 1); assert.deepEqual(d.v1.days, src.days);
    assert.equal(d.v1.order, 'newest'); assert.equal(d.v1.seed, 42); assert.equal(d.v1.to, '2024-03-29');
    assert.deepEqual(d.v1.drawings, src.drawings, 'stare rysunki per dzień zachowane w v1');
    // idempotentna
    assert.deepEqual(migrateSession(d), d);
    // v1 bez kursora: startTime dnia pool[dayIdx]
    const { nyAt } = await imp('public/js/bt-czas.js');
    const e = migrateSession({ ...v1(), cursor: null });
    assert.equal(e.cursor, nyAt('2024-03-19', '09:00'));
    // pusta pula: data startu z def.from
    assert.equal(migrateSession({ ...v1(), pool: [], dayIdx: 0, cursor: null }).def.from, '2024-03-01');
  });

  test('backtest-K: magazyn oddaje sesję v1 jako v2 (odczyt, lista, statystyki), zapis v2', async () => {
    const { createBacktestStore } = await imp('lib/backtest-store.mjs');
    const base = H.tmp();
    const dir = path.join(base, 'backtest', 'sessions');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'bt-stara01.json'), JSON.stringify(v1()));
    const st = createBacktestStore({ baseDir: base });
    const d = st.read('bt-stara01');
    assert.equal(d.v, 2); assert.equal(d.rev, 7, 'rev bez zmian (migracja nie zapisuje)');
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'bt-stara01.json'), 'utf8')).v, 1, 'plik na dysku dopiero przy zapisie z przeglądarki');
    const l = st.list()[0];
    assert.equal(l.from, '2024-03-12'); assert.equal(l.cursor, 1710854100); assert.equal(l.trades, 2);
    assert.ok(!('pool' in l) && !('done' in l), 'lista bez „dni zrobione / w puli”');
    const s = st.forStats(['bt-stara01']).sessions[0];
    assert.equal(s.trades.length, 2); assert.ok(!('days' in s));
    st.save('bt-stara01', d, 7);
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'bt-stara01.json'), 'utf8')).v, 2);
  });
};
