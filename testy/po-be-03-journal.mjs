// po-be-03: świece po wyjściu w oknie Journala backtestu: journalMaxT(trade, { limit, real1s }) = min(limit, max(koniec świecy wyjścia, koniec dnia handlowego)).
// [U] 04.11.2026 «niech journal w backtestingu ma wlasnie dostep podczas wyswietlania trade'a swiece nie do momentu wyjscia tylko jeszcze troche po zeby bylo widac ogolna reakcje rynku podczas trade,
// ale jak zapisuje trade i journaluje jeszcze podczas jak nie poznalem przyszlych swiec w backtestingowej sesji to nnie powinny mi sie ujawniac wtedy»; zakres: «Do końca dnia handlowego (Recommended)».
// Bez sieci i bez Notion: czysta funkcja, atrapa fetchRange i kontrola źródeł.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const utc = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000;
  // wtorek 3.11.2026: wyjście 10:00 ET (15:00Z), koniec dnia handlowego 17:00 ET = 22:00Z
  const EXIT = utc(2026, 11, 3, 15), END = utc(2026, 11, 3, 22);
  const manual = { exitT: EXIT, exits: [{ t: EXIT, reason: 'manual' }] };
  const stop = { exitT: EXIT, exits: [{ t: EXIT, reason: 'sl' }] };
  const maxT = async (tr, o) => (await lib('public/js/bt-journal-okno.js')).journalMaxT(tr, o);

  test('po-be-03: tuż po zamknięciu limit równy wyjściu nie daje świec po wyjściu', async () => {
    assert.equal(await maxT(manual, { limit: EXIT }), EXIT);
    // SL: świeca wyjścia trwa do exit + 60, ale limit sesji jej jeszcze nie pokazał
    assert.equal(await maxT(stop, { limit: EXIT }), EXIT);
  });

  test('po-be-03: limit godzinę po wyjściu daje świece do limitu', async () => {
    assert.equal(await maxT(manual, { limit: EXIT + 3600 }), EXIT + 3600);
    assert.equal(await maxT(stop, { limit: EXIT + 3600 }), EXIT + 3600);
  });

  test('po-be-03: limit po 17:00 ET daje 17:00 ET (koniec dnia handlowego)', async () => {
    assert.equal(await maxT(manual, { limit: END + 5 * 3600 }), END);
    assert.equal(await maxT(stop, { limit: Infinity }), END);
    // wyjście po 17:00 ET: koniec następnego dnia handlowego
    const late = { exitT: END + 600, exits: [{ t: END + 600, reason: 'manual' }] };
    assert.equal(await maxT(late, { limit: Infinity }), utc(2026, 11, 4, 22));
  });

  test('po-be-03: limit przed wyjściem (cofnięcie sesji) nie jest przekroczony', async () => {
    assert.equal(await maxT(manual, { limit: EXIT - 1800 }), EXIT - 1800);
    assert.equal(await maxT(stop, { limit: EXIT - 1800 }), EXIT - 1800);
  });

  test('po-be-03: bez wyjścia i bez limitu brak granicy, z limitem granicą jest limit', async () => {
    assert.equal(await maxT({ exits: [] }, { limit: EXIT + 60 }), EXIT + 60);
    assert.equal(await maxT({ exits: [] }, { limit: Infinity }), null);
  });

  test('po-be-03: journalSource z tym maxT nie zwraca świecy z t >= maxT (hostylna atrapa oddaje świece za granicą)', async () => {
    const { journalMaxT, journalSource } = await lib('public/js/bt-journal-okno.js');
    const limit = EXIT + 1800;
    const mt = journalMaxT(manual, { limit });
    assert.equal(mt, limit);
    // atrapa: minuty od EXIT - 2 h do EXIT + 3 h, niezależnie od `to`
    const mins = [];
    for (let t = EXIT - 7200; t < EXIT + 3 * 3600; t += 60) mins.push([t, 100, 101, 99, 100, 1]);
    const fetchRange = async ({ instruments, tf }) => ({ inst: { [instruments[0]]: tf === 'base' ? { m1: mins, s1: [], real1s: [] } : { bars: mins } } });
    const src1 = journalSource({ fetchRange, instrument: 'NQ', maxT: mt });
    const r = await src1.get(EXIT - 7200, EXIT + 3 * 3600, '1m');
    assert.ok(r.bars.length > 100, 'są świece po wyjściu');
    assert.ok(r.bars.some((k) => k[0] >= EXIT), 'widać świece po wyjściu');
    assert.ok(r.bars.every((k) => k[0] < mt), 'żadna świeca nie zaczyna się w maxT ani po nim');
    const r5 = await src1.get(EXIT - 7200, EXIT + 3 * 3600, '5m');
    assert.ok(r5.bars.every((k) => k[0] < mt), 'także po agregacji do 5m');
    // tuż po zamknięciu: nic po wyjściu
    const s0 = journalSource({ fetchRange, instrument: 'NQ', maxT: journalMaxT(manual, { limit: EXIT }) });
    const r0 = await s0.get(EXIT - 7200, EXIT + 3 * 3600, '1m');
    assert.ok(r0.bars.length > 0 && r0.bars.every((k) => k[0] < EXIT), 'zaraz po zamknięciu bez świec po wyjściu');
  });

  test('po-be-03: źródła: okno dostaje limit ze znaku wodnego (hwOf), nie kursor; migawka w chwili otwarcia; [U] w kodzie', () => {
    const rp = src('public/js/bt-replay.js'), ok = src('public/js/bt-journal-okno.js');
    assert.match(rp, /snap\[tr\.instrument\] \?\?= hwOf\(tr\.instrument\)/, 'limit z hwOf(instrument)');
    assert.match(rp, /journalMaxT\(tr, \{ limit: snap\[tr\.instrument\]/, 'journalMaxT dostaje limit, nie kursor');
    assert.doesNotMatch(rp, /journalMaxT\(tr, \{ cursor/, 'kursor nie jest granicą Journala');
    assert.match(ok, /export function journalMaxT\(trade, \{ limit = Infinity, real1s = \[\] \} = \{\}\)/);
    assert.match(ok, /tradingDayEnd/, 'koniec dnia handlowego z dzien-handlowy.js');
    assert.match(rp, /snap/i, 'limit zapamiętany w chwili otwarcia okna');
    for (const f of [ok, rp]) assert.match(f, /\[U\] 04\.11\.2026 «niech journal w backtestingu ma wlasnie dostep/, 'cytat decyzji');
    assert.match(ok, /Do końca dnia handlowego \(Recommended\)/);
    assert.match(src('docs/plany/backtest/postep.md'), /świece po wyjściu/i, 'wpis w postep.md');
    assert.doesNotMatch(ok, /journalMaxT\([^)]*cursor/, 'brak starego wywołania');
  });
};
