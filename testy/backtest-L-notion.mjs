// backtest-L: Journal backtestu a Notion. [U] 31.10.2026 «Przyjmuję wszystkie» (J5: poprawki trade'a już wysłanego, opis i rysunki, same idą do Notion w tle).
// Wysyłka w Node na atrapie Notion (testy/bt-notion-rig.mjs), prawdziwe moduły serwera. Nigdy prawdziwe Notion.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rig as makeRig, SID, T0, trade, session } from './bt-notion-rig.mjs';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  async function drawing(label, price = 18000) {
    const { defaultStyleFor } = await lib('public/vendor/lightweight-charts-drawing/lightweight-charts-drawing.es.js');
    return { v: 1, lib: '0.6.2', at: '2024-03-12T14:00:00.000Z', d: [{ id: `dw_${label}`, kind: 'horizontal-line', points: [{ time: T0, price }], style: defaultStyleFor('horizontal-line') }] };
  }

  test('backtest-L: poprawka wysłanego trade\'a w Journalu aktualizuje tę samą stronę w atrapie Notion (opis i rysunki)', async () => {
    const R = await makeRig(H, assert, ROOT, 5711);
    try {
      const dw1 = await drawing('a');
      R.store.save(SID, session([trade(1, { drawings: dw1 })]), 0);
      const r1 = await R.sync.push({ sessionId: SID });
      assert.deepEqual([r1.sent, r1.failed.length], [1, 0], JSON.stringify(r1.failed));
      const p1 = await R.page('t1');
      assert.deepEqual(JSON.parse(R.text(p1, 'Rysunki')), dw1, 'pierwsza wysyłka z rysunkami');
      // Journal: nowa notatka i dopracowana migawka rysunków (tylko ten trade)
      const dw2 = await drawing('b', 18010);
      const now = Date.now();
      R.edit((d) => { const x = d.trades.find((y) => y.id === 't1'); Object.assign(x, { notes: 'opis w Journalu', jEdited: now, drawings: dw2, dEdited: now }); });
      const { isUnsent, needsUpdate } = await lib('public/js/bt-notion.js');
      assert.ok(needsUpdate(R.tr('t1')) && isUnsent(R.tr('t1')), 'licznik „Niezapisane w Notion” widzi zmianę opisu i rysunków');
      R.calls.length = 0;
      const r2 = await R.sync.push({ sessionId: SID });
      assert.deepEqual([r2.sent, r2.failed.length, r2.pending], [1, 0, 0], JSON.stringify(r2.failed));
      const pages = await R.pages();
      assert.equal(pages.length, 1, 'bez drugiej strony');
      const q1 = pages[0];
      assert.equal(q1.id, p1.id);
      assert.equal(R.text(q1, 'Notatki'), 'opis w Journalu');
      assert.deepEqual(JSON.parse(R.text(q1, 'Rysunki')), dw2, 'rysunki poprawione w tej samej stronie');
      assert.ok(!R.calls.some((c) => c.startsWith('POST /v1/pages')), 'bez nowej strony (POST)');
      // same rysunki (bez zmiany opisu) też idą
      const dw3 = await drawing('c', 18020);
      R.edit((d) => { const x = d.trades.find((y) => y.id === 't1'); Object.assign(x, { drawings: dw3, dEdited: Date.now() + 5 }); });
      assert.ok(needsUpdate(R.tr('t1')), 'zmiana samych rysunków liczy się jako niezapisana');
      const r3 = await R.sync.push({ sessionId: SID });
      assert.deepEqual([r3.sent, r3.pending], [1, 0]);
      assert.deepEqual(JSON.parse(R.text((await R.pages())[0], 'Rysunki')), dw3);
      // bez zmian: nic nie idzie
      const r4 = await R.sync.push({ sessionId: SID });
      assert.deepEqual([r4.sent, r4.skipped], [0, 1]);
      // timer (auto) nie rusza zmian bez błędu: ponawia tylko próbowane
      assert.equal(R.tr('t1').notion.state, 'sent');
    } finally { R.A.stop(); }
  });

  test('backtest-L: stan opisu i wysyłki trade\'a: do opisania, opisany, wysłany, zmieniony, błąd', async () => {
    const { journalState } = await lib('public/js/bt-notion.js');
    const base = { journal: 'done', notion: { id: 'x', state: 'sent', edited: 5, drawn: 5 }, jEdited: 5, dEdited: 5 };
    assert.equal(journalState({ ...base, journal: 'todo', notion: { state: 'pending' } }), 'todo');
    assert.equal(journalState({ ...base, notion: { state: 'pending' } }), 'done');
    assert.equal(journalState(base), 'sent');
    assert.equal(journalState({ ...base, jEdited: 9 }), 'changed');
    assert.equal(journalState({ ...base, dEdited: 9 }), 'changed');
    assert.equal(journalState({ ...base, notion: { state: 'error', error: 'x' } }), 'error');
  });
};
