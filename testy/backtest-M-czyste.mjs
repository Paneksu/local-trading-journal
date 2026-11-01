// backtest-M: czyste pomocniki pakietu M (funkcjonalny design modułu Backtest): podpis skrótu, skróty BE i połowy pozycji, domyślna data startu w kreatorze,
// pamięć SL/TP panelu zleceń.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

  test('backtest-M: podpis skrótu do podpowiedzi (strzałki, Spacja, modyfikatory) i podpowiedź „akcja (skrót)”', async () => {
    const C = await imp('public/js/bt-czas.js');
    assert.equal(C.skrotLabel('Shift+ArrowRight'), 'Shift+→');
    assert.equal(C.skrotLabel('Shift+ArrowLeft'), 'Shift+←');
    assert.equal(C.skrotLabel('Space'), 'Spacja');
    assert.equal(C.skrotLabel('Ctrl+J'), 'Ctrl+J');
    assert.equal(C.skrotLabel(''), '');
    assert.equal(C.hintOf('Kup rynkowo', 'B'), 'Kup rynkowo (B)');
    assert.equal(C.hintOf('Kup rynkowo', ''), 'Kup rynkowo');
  });

  test('backtest-M: skróty BE (E) i zamknięcia połowy pozycji (H) bez kolizji z domyślnymi skrótami i skokami', async () => {
    const C = await imp('public/js/bt-czas.js');
    assert.equal(C.DEFAULT_SKROTY.be, 'E');
    assert.equal(C.DEFAULT_SKROTY.half, 'H');
    assert.deepEqual(C.collisions(C.DEFAULT_SKROTY, C.DEFAULT_JUMPS), []);
    const s = C.sanitizeBt({ skroty: { be: 'Q' } });
    assert.equal(s.skroty.be, 'Q');
    assert.equal(s.skroty.half, 'H', 'brak wpisu = domyślny');
    assert.ok(C.SKROT_ACTIONS.includes('be') && C.SKROT_ACTIONS.includes('half'));
  });

  test('backtest-M: domyślna data startu w kreatorze w zakresie danych (rok przed końcem danych, nie przed początkiem)', async () => {
    const K = await imp('public/js/bt-kreator.js');
    const day = (s) => Date.parse(`${s}T12:00:00Z`) / 1000;
    const now = Date.parse('2026-10-31T10:00:00Z');
    // dane kończą się w 2024: rok przed końcem danych
    assert.equal(K.defaultStart({ first: day('2019-09-01'), last: day('2024-12-31') }, now), '2023-12-31');
    // krótkie dane: nie przed pierwszym dniem
    assert.equal(K.defaultStart({ first: day('2024-06-03'), last: day('2024-12-31') }, now), '2024-06-03');
    // dane aktualne: rok temu jak dotąd
    assert.equal(K.defaultStart({ first: day('2019-09-01'), last: day('2026-10-30') }, now), '2025-10-30');
    // bez granic: rok temu
    assert.equal(K.defaultStart(null, now), '2025-10-30');
  });

  test('backtest-M: pamięć SL/TP panelu zleceń na instrument (zapis, odczyt, zły wpis)', async () => {
    const Z = await imp('public/js/bt-zlecenia.js');
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
    Z.rememberOrderFields(storage, 'NQ', { unit: 'pt', sl: '12', tp: '24' });
    Z.rememberOrderFields(storage, 'ES', { unit: 'tick', sl: '16', tp: '' });
    assert.deepEqual(Z.recallOrderFields(storage, 'NQ'), { unit: 'pt', sl: '12', tp: '24' });
    assert.deepEqual(Z.recallOrderFields(storage, 'ES'), { unit: 'tick', sl: '16', tp: '' });
    assert.equal(Z.recallOrderFields(storage, 'MES'), null);
    // cena (jednostka „cena”) nie jest zapamiętywana: przy następnym otwarciu rynek jest gdzie indziej
    Z.rememberOrderFields(storage, 'NQ', { unit: 'px', sl: '18000', tp: '18100' });
    assert.deepEqual(Z.recallOrderFields(storage, 'NQ'), { unit: 'pt', sl: '12', tp: '24' });
    mem.set(Z.ORD_MEM_KEY, '{zły');
    assert.equal(Z.recallOrderFields(storage, 'NQ'), null);
    mem.set(Z.ORD_MEM_KEY, JSON.stringify({ NQ: { unit: 'pt', sl: '<b>', tp: '-3' } }));
    assert.equal(Z.recallOrderFields(storage, 'NQ'), null, 'tylko liczby dodatnie');
  });
};
