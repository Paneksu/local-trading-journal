// backtest-F1: moduł filtra dni (public/js/bt-filtr.js): warunki, i / lub / nie, matchDays z filtrem, tagi dnia, kopia filtra bez kluczy wrażliwych.
// Wejście to ręcznie zbudowane DayFeatures (bez świec i bez sieci).
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

export default ({ test, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const N = (name, imp_ = 'high', hm = '08:30', when = 'pre', kind = 'data') => ({ name, kind, imp: imp_, hm, when });
  const MKT = { gapPts: 12.5, gapPct: 0.4, onRange: 80, prevRange: 150, prevDir: 'up', inside: false, preVsPd: 'above', atr14: 200, atrRatio: 1.3 };
  // bazowy dzień: wtorek 12.03.2024, CPI o 8:30, NQ z 1s, rynek MKT
  const F = (o = {}) => ({
    day: '2024-03-12', wd: 2, month: 3, has1s: { NQ: true }, has1m: { ES: true, NQ: true }, holiday: { before: false, after: false }, rollWeek: false,
    news: [N('CPI')], fedChair: false, opex: null, opexWeek: false, earnings: [], mkt: { NQ: { ...MKT }, ES: { ...MKT, gapPts: -3, gapPct: -0.06, prevDir: 'down' } }, ...o,
  });

  // [warunek, dzień pasujący, dzień niepasujący]
  const CASES = {
    wd: [{ k: 'wd', days: [2, 4] }, F(), F({ wd: 3 })],
    dateRange: [{ k: 'dateRange', from: '2024-03-01', to: '2024-03-12' }, F(), F({ day: '2024-03-13' })],
    month: [{ k: 'month', months: [3, 4] }, F(), F({ month: 5 })],
    preHoliday: [{ k: 'preHoliday' }, F({ holiday: { before: true, after: false } }), F()],
    postHoliday: [{ k: 'postHoliday' }, F({ holiday: { before: false, after: true } }), F()],
    rollWeek: [{ k: 'rollWeek' }, F({ rollWeek: true }), F()],
    event: [{ k: 'event', name: 'cpi' }, F(), F({ news: [N('NFP')] })],
    impAtLeast: [{ k: 'impAtLeast', imp: 'medium' }, F({ news: [N('Empire State Manufacturing Index', 'medium')] }), F({ news: [N('Trade Balance', 'low')] })],
    noImpAtLeast: [{ k: 'noImpAtLeast', imp: 'medium' }, F({ news: [N('Trade Balance', 'low')] }), F()],
    newsWhen: [{ k: 'newsWhen', when: 'post', imp: 'high' }, F({ news: [N('FOMC', 'high', '14:00', 'post')] }), F({ news: [N('FOMC', 'medium', '14:00', 'post'), N('CPI')] })],
    fedChair: [{ k: 'fedChair' }, F({ fedChair: true }), F()],
    opex: [{ k: 'opex', type: 'quarterly' }, F({ opex: 'quarterly' }), F({ opex: 'monthly' })],
    opexWeek: [{ k: 'opexWeek' }, F({ opexWeek: true }), F()],
    earnings: [{ k: 'earnings', maxCls: 2, when: 'bmo' }, F({ earnings: [{ cls: 2, when: 'bmo' }] }), F({ earnings: [{ cls: 3, when: 'bmo' }, { cls: 1, when: 'prevAmc' }] })],
    gap: [{ k: 'gap', unit: 'pts', min: 10, max: 20 }, F(), F({ mkt: { NQ: { ...MKT, gapPts: 3 } } })],
    onRange: [{ k: 'onRange', min: 50, max: 100 }, F(), F({ mkt: { NQ: { ...MKT, onRange: 30 } } })],
    prevRange: [{ k: 'prevRange', min: 100 }, F(), F({ mkt: { NQ: { ...MKT, prevRange: 60 } } })],
    prevDir: [{ k: 'prevDir', dir: 'up' }, F(), F({ mkt: { NQ: { ...MKT, prevDir: 'down' } } })],
    inside: [{ k: 'inside' }, F({ mkt: { NQ: { ...MKT, inside: true } } }), F()],
    preVsPd: [{ k: 'preVsPd', pos: 'above' }, F(), F({ mkt: { NQ: { ...MKT, preVsPd: 'inside' } } })],
    atrRatio: [{ k: 'atrRatio', min: 1.2, max: 1.5 }, F(), F({ mkt: { NQ: { ...MKT, atrRatio: 0.8 } } })],
  };

  test('backtest-F1: każdy warunek', async () => {
    const { evalFilter, COND_KINDS } = await imp('public/js/bt-filtr.js');
    assert.deepEqual([...COND_KINDS].sort(), Object.keys(CASES).sort(), 'wszystkie rodzaje z karty i tylko one');
    for (const k of COND_KINDS) {
      const [cond, yes, no] = CASES[k];
      assert.equal(evalFilter(cond, yes, 'NQ'), true, `${k}: dzień pasujący`);
      assert.equal(evalFilter(cond, no, 'NQ'), false, `${k}: dzień niepasujący`);
      assert.equal(evalFilter({ ...cond, not: true }, yes, 'NQ'), false, `${k}: not odwraca pasujący`);
      assert.equal(evalFilter({ ...cond, not: true }, no, 'NQ'), true, `${k}: not odwraca niepasujący`);
    }
    // szczegóły: granice zakresów są włączone, procent a punkty, instrument sesji
    const gap = (o) => evalFilter({ k: 'gap', ...o }, F(), 'NQ');
    assert.equal(gap({ unit: 'pts', min: 12.5, max: 12.5 }), true); assert.equal(gap({ unit: 'pct', min: 0.5 }), false); assert.equal(gap({ unit: 'pct', min: 0.4 }), true);
    assert.equal(evalFilter({ k: 'gap', unit: 'pts', max: -2 }, F(), 'ES'), true, 'warunki rynku biorą cechy instrumentu sesji (ES)');
    assert.equal(evalFilter({ k: 'gap', unit: 'pts', max: -2 }, F(), 'NQ'), false);
    assert.equal(evalFilter({ k: 'gap', unit: 'pts', min: 0 }, F({ mkt: {} }), 'NQ'), false, 'brak cech rynku dnia: warunek rynku nie przechodzi');
    assert.equal(evalFilter({ k: 'dateRange', from: '2024-03-12' }, F(), 'NQ'), true, 'otwarty koniec zakresu dat');
    assert.equal(evalFilter({ k: 'newsWhen', when: 'pre' }, F(), 'NQ'), true, 'bez wagi: dowolne wydarzenie w porze');
    assert.equal(evalFilter({ k: 'impAtLeast', imp: 'high' }, F({ news: [N('X', 'medium')] }), 'NQ'), false, 'waga co najmniej: high > medium > low');
    assert.equal(evalFilter({ k: 'event', name: 'CPI' }, F({ news: [N('CPI', 'high', '08:30', 'pre'), N('NFP')] }), 'NQ'), true);
  });

  test('backtest-F1: i / lub / nie', async () => {
    const { evalFilter } = await imp('public/js/bt-filtr.js');
    const cpi = { k: 'event', name: 'CPI' }, tue = { k: 'wd', days: [2] }, wed = { k: 'wd', days: [3] };
    const and = { op: 'and', not: false, items: [cpi, tue] };
    assert.equal(evalFilter(and, F(), 'NQ'), true);
    assert.equal(evalFilter(and, F({ wd: 3 }), 'NQ'), false);
    const or = { op: 'or', not: false, items: [wed, cpi] };
    assert.equal(evalFilter(or, F(), 'NQ'), true); assert.equal(evalFilter(or, F({ news: [] }), 'NQ'), false); assert.equal(evalFilter(or, F({ wd: 3, news: [] }), 'NQ'), true);
    assert.equal(evalFilter({ ...and, not: true }, F(), 'NQ'), false, 'not na grupie');
    assert.equal(evalFilter({ op: 'and', not: false, items: [cpi, { ...tue, not: true }] }, F(), 'NQ'), false, 'not na warunku');
    // dwa poziomy zagnieżdżenia: CPI i (wtorek lub środa) i nie (OPEX)
    const deep = { op: 'and', not: false, items: [cpi, { op: 'or', not: false, items: [tue, wed] }, { op: 'and', not: true, items: [{ k: 'opexWeek' }] }] };
    assert.equal(evalFilter(deep, F(), 'NQ'), true);
    assert.equal(evalFilter(deep, F({ opexWeek: true }), 'NQ'), false);
    assert.equal(evalFilter(deep, F({ wd: 4 }), 'NQ'), false);
    // pusta grupa nie odrzuca niczego (kreator może mieć pustą grupę w trakcie edycji); brak filtra = wszystko
    assert.equal(evalFilter({ op: 'and', not: false, items: [] }, F(), 'NQ'), true);
    assert.equal(evalFilter({ op: 'or', not: false, items: [] }, F(), 'NQ'), true);
    assert.equal(evalFilter(null, F(), 'NQ'), true);
  });

  test('backtest-F1: matchDays z filtrem', async () => {
    const { matchDays } = await imp('public/js/bt-filtr.js');
    const D = (day, wd, o = {}) => F({ day, wd, has1s: { NQ: o.s1 ?? true }, has1m: { ES: o.es ?? true, NQ: true }, news: o.cpi ? [N('CPI')] : [] });
    const days = [D('2024-03-11', 1), D('2024-03-12', 2, { cpi: true }), D('2024-03-13', 3, { cpi: true, s1: false }), D('2024-03-14', 4, { cpi: true }), D('2024-03-15', 5), D('2024-03-18', 1, { cpi: true })];
    const def = { instruments: ['NQ'], from: '2024-03-11', to: '2024-03-15', filter: { op: 'and', not: false, items: [{ k: 'event', name: 'CPI' }] }, excluded: ['2024-03-14'] };
    const r = matchDays(def, days, { done: [] });
    assert.deepEqual(r.days, ['2024-03-12'], 'dzień z CPI, z 1s, niewyrzucony');
    assert.deepEqual(r.excluded, [
      { day: '2024-03-11', reason: 'filter' }, { day: '2024-03-13', reason: 'no1s' }, { day: '2024-03-14', reason: 'manual' }, { day: '2024-03-15', reason: 'filter' },
    ], 'dni poza zakresem dat nie występują; powód filter dopiero po sprawdzeniu danych');
    assert.deepEqual(r.counts, { manual: 1, done: 0, no1s: 1, no1m: 0, filter: 2 }, 'licznik zawiera filtr (kreator pokazuje w liście wykluczeń tylko pozostałe powody)');
    // zrobione dni; ES wymaga 1m; sym filtra = pierwszy instrument sesji
    const es = matchDays({ instruments: ['ES', 'NQ'], from: '2024-03-11', to: '2024-03-15', filter: { k: 'gap', unit: 'pts', max: -2 }, excluded: [] }, days, { done: ['2024-03-12'] });
    assert.deepEqual(es.days, ['2024-03-11', '2024-03-14', '2024-03-15'].filter((d) => d !== '2024-03-13'), 'ES jest instrumentem filtra: gap ES = −3');
    assert.deepEqual(es.excluded.map((x) => [x.day, x.reason]), [['2024-03-12', 'done'], ['2024-03-13', 'no1s']]);
    // filtr null: jak w C1 (nic nie ma powodu filter)
    const none = matchDays({ instruments: ['NQ'], from: '2024-03-11', to: '2024-03-15', filter: null, excluded: [] }, days);
    assert.ok(none.excluded.every((x) => x.reason !== 'filter'));
    assert.deepEqual(none.days, ['2024-03-11', '2024-03-12', '2024-03-14', '2024-03-15']);
  });

  test('backtest-F1: dayTags', async () => {
    const { dayTags } = await imp('public/js/bt-filtr.js');
    const pl = (s) => s;
    const tags = dayTags(F({ opex: 'quarterly', opexWeek: true }), pl);
    assert.ok(tags.includes('CPI')); assert.ok(tags.includes('OPEX'));
    assert.ok(!tags.includes('bez newsów'));
    assert.deepEqual(dayTags(F({ news: [N('Trade Balance', 'low', '08:30', 'pre')] }), pl), ['bez newsów'], 'tylko słabe newsy: bez newsów o wadze co najmniej pomarańczowej');
    assert.deepEqual(dayTags(F({ news: [] }), pl), ['bez newsów']);
    assert.ok(dayTags(F({ news: [N('Empire State Manufacturing Index', 'medium')] }), pl).length === 0, 'dzień z pomarańczowym newsem bez wielkiej nazwy nie ma tagu');
    const withFed = dayTags(F({ news: [N('FOMC', 'high', '14:00', 'post')], fedChair: true, holiday: { before: true, after: false }, earnings: [{ cls: 1, when: 'bmo' }], rollWeek: true }), pl);
    for (const x of ['FOMC', 'przed świętem', 'wyniki spółek', 'tydzień rolla', 'przewodniczący Fed']) assert.ok(withFed.includes(x), x);
    // nazwy przez tłumacza
    const en = dayTags(F({ news: [], opex: 'monthly' }), (s) => `<${s}>`);
    assert.deepEqual(en, ['<bez newsów>', 'OPEX']);
    // bez tłumacza = polskie napisy
    assert.deepEqual(dayTags(F({ news: [] })), ['bez newsów']);
  });

  test('backtest-F1: zły filtr', async () => {
    const { evalFilter, matchDays } = await imp('public/js/bt-filtr.js');
    assert.throws(() => evalFilter({ k: 'nieznany' }, F(), 'NQ'), /nieznany/);
    assert.throws(() => evalFilter({ op: 'and', not: false, items: [{ k: 'wd', days: [2] }, { k: 'zly' }] }, F(), 'NQ'), /zly/);
    assert.throws(() => evalFilter({ op: 'xor', items: [] }, F(), 'NQ'), /xor/);
    assert.throws(() => evalFilter({ foo: 1 }, F(), 'NQ'), /filtr/i);
    assert.throws(() => evalFilter({ k: 'gap', unit: 'km' }, F(), 'NQ'), /km/);
    assert.throws(() => matchDays({ instruments: ['NQ'], from: '2024-03-11', to: '2024-03-15', filter: { k: 'zly' }, excluded: [] }, [F()], {}), /zly/, 'matchDays nie połyka błędu filtra');
  });

  test('backtest-F1: kopia filtra bez kluczy wrażliwych', async () => {
    const { copyDef, defFromCopy, SECRET_KEY: secretCopy, stripSecretKeys } = await imp('public/js/bt-czas.js');
    // zgodność reguły z lib/sync.mjs (SECRET_KEY nie jest eksportowany: porównanie tekstu)
    const src = readFileSync(path.join(ROOT, 'lib/sync.mjs'), 'utf8');
    assert.ok(src.includes('const SECRET_KEY = ' + secretCopy.toString()), 'bt-czas.js ma tę samą regułę co lib/sync.mjs');
    const { sanitizeSettings } = await imp('lib/sync.mjs');
    const tree = { op: 'and', not: false, items: [{ k: 'event', name: 'CPI', apiKey: 'x', token: 'y' }, { op: 'or', not: false, items: [{ k: 'wd', days: [2], password: 'p', pin: 1, Databento: 'd' }] }] };
    const def = copyDef({ instruments: ['NQ'], from: '2024-03-01', to: '2024-03-31', filter: tree, excluded: [] });
    const restored = defFromCopy(def).filter;
    assert.deepEqual(restored, { op: 'and', not: false, items: [{ k: 'event', name: 'CPI' }, { op: 'or', not: false, items: [{ k: 'wd', days: [2] }] }] }, 'klucze sekretów wycięte z drzewa przed pocięciem na napisy');
    assert.ok(!JSON.stringify(def).match(/apikey|token|password|databento/i), 'w kopii nie ma śladu po wyciętych kluczach');
    // kopia przechodzi przez sanitizeSettings bez zmian (nic nie wycina po cichu)
    assert.deepEqual(sanitizeSettings({ x: { y: { z: def } } }).x.y.z.filterJ, def.filterJ);
    // zwykły filtr przechodzi bez zmian; kształty nie-obiektowe nietknięte
    const plain = { op: 'and', not: false, items: [{ k: 'gap', unit: 'pct', min: 0.5 }] };
    assert.deepEqual(defFromCopy(copyDef({ filter: plain })).filter, plain);
    assert.deepEqual(stripSecretKeys(null), null); assert.deepEqual(stripSecretKeys([1, 'a']), [1, 'a']);
  });
};
