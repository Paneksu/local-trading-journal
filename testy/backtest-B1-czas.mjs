// backtest-B1: kroki, skoki, skróty i newsy bez przyszłości (public/js/bt-czas.js). Bez danych rynkowych: same chwile i syntetyczne zdarzenia.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const mod = () => imp('public/js/bt-czas.js');
  const DAY = '2024-03-12';
  const ny = (h, m, s = 0) => Date.UTC(2024, 2, 12, h + 4, m, s) / 1000; // 12.03.2024: czas letni NY (UTC−4)
  const real1s = [[ny(9, 30), ny(11, 0)]];
  const times = { ctxFrom: ny(-1, 0) - 2 * 86400, open: ny(9, 30), w1sEnd: ny(11, 0), end: ny(16, 0) };
  const bounds = { min: times.ctxFrom, max: times.end };
  const ev = (h, m, imp, name = 'CPI', extra = {}) => ({ t: ny(h, m), day: DAY, name, imp, kind: 'data', allDay: false, tentative: false, src: 'ff', basis: 'feed', note: 'x', ...extra });

  test('backtest-B1: nyAt w DST', async () => {
    const { nyAt } = await mod();
    assert.equal(nyAt('2024-03-11', '09:30'), Date.UTC(2024, 2, 11, 13, 30) / 1000);
    assert.equal(nyAt('2024-03-08', '09:30'), Date.UTC(2024, 2, 8, 14, 30) / 1000);
    assert.equal(nyAt('2024-11-04', '09:30'), Date.UTC(2024, 10, 4, 14, 30) / 1000);
    assert.equal(nyAt('2024-11-01', '16:00'), Date.UTC(2024, 10, 1, 20, 0) / 1000);
    assert.throws(() => nyAt('2024-03-11', '9:30'));
  });

  test('backtest-B1: krok = jedna świeca aktywnego TF', async () => {
    const { nextCursor } = await mod();
    assert.equal(nextCursor(ny(10, 0), 1, '15s', real1s, bounds), ny(10, 0, 15));
    assert.equal(nextCursor(ny(10, 0, 7), 1, '15s', real1s, bounds), ny(10, 0, 15));
    assert.equal(nextCursor(ny(10, 2), 1, '5m', real1s, bounds), ny(10, 5));
    assert.equal(nextCursor(ny(10, 0, 15), -1, '15s', real1s, bounds), ny(10, 0));
    assert.equal(nextCursor(ny(10, 0, 7), -1, '15s', real1s, bounds), ny(10, 0));
    assert.equal(nextCursor(ny(10, 5), -1, '5m', real1s, bounds), ny(10, 0));
    assert.equal(nextCursor(ny(10, 3, 10), -1, '5m', real1s, bounds), ny(10, 0));
    assert.equal(nextCursor(ny(10, 0), 1, '1h', real1s, bounds), ny(11, 0));
  });

  test('backtest-B1: TF sekundowy poza oknem krokuje o 1 min', async () => {
    const { stepSec, nextCursor } = await mod();
    assert.equal(stepSec('15s', ny(9, 10), real1s), 60);
    assert.equal(stepSec('15s', ny(11, 0), real1s), 60);
    assert.equal(stepSec('15s', ny(10, 0), real1s), 15);
    assert.equal(stepSec('5m', ny(10, 0), real1s), 300);
    const a = nextCursor(ny(9, 29), 1, '15s', real1s, bounds);
    assert.equal(a, ny(9, 30));
    assert.equal(nextCursor(a, 1, '15s', real1s, bounds), ny(9, 30, 15));
    // symetrycznie w tył: z 9:30:00 do 9:29:00 (przed oknem świece są minutowe), z 11:01 do 11:00, z 11:00 do 10:59:45
    assert.equal(nextCursor(ny(9, 30), -1, '15s', real1s, bounds), ny(9, 29));
    assert.equal(nextCursor(ny(11, 1), -1, '15s', real1s, bounds), ny(11, 0));
    assert.equal(nextCursor(ny(11, 0), -1, '15s', real1s, bounds), ny(10, 59, 45));
    // bez okna 1s (ES): zawsze minuta
    assert.equal(stepSec('1s', ny(10, 0), []), 60);
  });

  test('backtest-B1: koniec dnia 16:00 NY', async () => {
    const { nextCursor } = await mod();
    const { REPLAY_TFS } = await imp('public/js/bt-swieca.js');
    for (const tf of REPLAY_TFS) {
      let C = ny(15, 0);
      for (let i = 0; i < 4000 && C < times.end; i++) { const n = nextCursor(C, 1, tf, real1s, bounds); assert.ok(n > C && n <= times.end, `${tf}: ${n}`); C = n; }
      assert.equal(C, times.end, tf);
      assert.equal(nextCursor(C, 1, tf, real1s, bounds), times.end);
      assert.equal(nextCursor(nextCursor(C, 1, tf, real1s, bounds), 1, tf, real1s, bounds), times.end);
    }
    assert.equal(nextCursor(ny(15, 50), 1, '1h', real1s, bounds), times.end);
    assert.equal(nextCursor(bounds.min, -1, '1m', real1s, bounds), bounds.min);
  });

  test('backtest-B1: skoki', async () => {
    const { DEFAULT_JUMPS, jumpTarget } = await mod();
    const kinds = DEFAULT_JUMPS.map((j) => j.cel.kind);
    assert.ok(DEFAULT_JUMPS.some((j) => j.cel.kind === 'time' && j.cel.at === '09:30'), 'do 9:30 NY');
    assert.ok(kinds.filter((k) => k === 'nextDay').length >= 2, 'następna sesja NY i następny dzień z filtra');
    assert.ok(DEFAULT_JUMPS.some((j) => j.cel.kind === 'news' && j.cel.minImp === 'high'), 'następny news');
    assert.ok(DEFAULT_JUMPS.some((j) => j.cel.kind === 'offset' && j.cel.sec === 900), '+15 min');
    for (const j of DEFAULT_JUMPS) assert.ok(j.id && j.name && typeof j.skrot === 'string');
    assert.equal(new Set(DEFAULT_JUMPS.map((j) => j.id)).size, DEFAULT_JUMPS.length);

    const news = [ev(8, 30, 'high', 'CPI'), ev(10, 0, 'medium', 'ISM'), ev(14, 0, 'high', 'FOMC'), ev(0, 0, 'holiday', 'Święto', { allDay: true, kind: 'holiday' })];
    const ctx = (cursor) => ({ cursor, day: DAY, times, news, startTime: '09:00' });
    const at930 = { id: 'x', name: 'x', cel: { kind: 'time', at: '09:30' }, skrot: '' };
    assert.deepEqual(jumpTarget(at930, ctx(ny(9, 5))), { cursor: ny(9, 30) });
    assert.equal(jumpTarget(at930, ctx(ny(9, 45))), null);
    assert.equal(jumpTarget(at930, ctx(ny(9, 30))), null);
    const off = { id: 'o', name: 'o', cel: { kind: 'offset', sec: 900 }, skrot: '' };
    assert.deepEqual(jumpTarget(off, ctx(ny(10, 0))), { cursor: ny(10, 15) });
    assert.deepEqual(jumpTarget(off, ctx(ny(15, 50))), { cursor: times.end });
    assert.equal(jumpTarget(off, ctx(times.end)), null);
    const hi = { id: 'n', name: 'n', cel: { kind: 'news', minImp: 'high' }, skrot: '' };
    const med = { id: 'm', name: 'm', cel: { kind: 'news', minImp: 'medium' }, skrot: '' };
    assert.deepEqual(jumpTarget(hi, ctx(ny(9, 0))), { cursor: ny(14, 0) });
    assert.deepEqual(jumpTarget(med, ctx(ny(9, 0))), { cursor: ny(10, 0) });
    assert.deepEqual(jumpTarget(hi, ctx(ny(8, 0))), { cursor: ny(8, 30) });
    assert.deepEqual(jumpTarget(hi, ctx(ny(8, 30))), { cursor: ny(14, 0) }, 'tylko t > kursor');
    assert.equal(jumpTarget(hi, ctx(ny(14, 0))), null);
    const nd = { id: 'd', name: 'd', cel: { kind: 'nextDay' }, skrot: '' };
    assert.deepEqual(jumpTarget(nd, ctx(ny(10, 0))), { nextDay: true, at: '09:00' });
    const lon = { id: 'l', name: 'l', cel: { kind: 'session', id: 'london' }, skrot: '' };
    assert.deepEqual(jumpTarget(lon, ctx(ny(1, 0))), { cursor: ny(2, 0) });
    assert.equal(jumpTarget(lon, ctx(ny(3, 0))), null);
    // poprzedni dzień kontekstu: z 11.03 1:00 NY do 11.03 2:00 NY
    assert.deepEqual(jumpTarget(lon, ctx(ny(1, 0) - 86400)), { cursor: ny(2, 0) - 86400 });
    const asia = { id: 'a', name: 'a', cel: { kind: 'session', id: 'asia' }, skrot: '' };
    assert.deepEqual(jumpTarget(asia, ctx(ny(-1, 0) - 86400)), { cursor: ny(-4, 0) }, 'Azja 20:00 NY dzień wcześniej');
    assert.equal(jumpTarget(asia, ctx(ny(9, 0))), null, '20:00 w dniu replayu jest po 16:00');
    assert.equal(jumpTarget({ cel: { kind: 'nieznany' } }, ctx(ny(9, 0))), null);
  });

  test('backtest-B1: visibleNews pokazuje plan dnia bez wyniku', async () => {
    const { visibleNews, nextNews } = await mod();
    const allowed = new Set(['t', 'day', 'name', 'imp', 'kind', 'allDay', 'tentative']);
    const news = [
      ev(8, 30, 'high', 'CPI', { actual: '3.1%', forecast: '3.0%' }),
      ev(14, 0, 'high', 'FOMC', { kind: 'fomc', variant: 'sep', unverified: true }),
      { ...ev(8, 30, 'high', 'NFP'), t: ny(8, 30) + 3 * 86400, day: '2024-03-15' }, // inny dzień, przyszły
      { ...ev(10, 0, 'medium', 'PPI'), t: ny(10, 0) - 86400, day: '2024-03-11' }, // dzień kontekstu, przeszły
    ];
    const v = visibleNews(news, ny(9, 0));
    assert.deepEqual(v.map((e) => e.name), ['PPI', 'CPI', 'FOMC'], 'plan dnia (także po kursorze) i przeszłe dni, bez przyszłych dni');
    for (const e of v) for (const k of Object.keys(e)) assert.ok(allowed.has(k), `pole spoza listy: ${k}`);
    assert.equal(v[2].t, ny(14, 0));
    assert.equal(nextNews(news, ny(9, 0), 'high').name, 'FOMC');
    assert.equal(nextNews(news, ny(15, 0), 'medium').name, 'NFP');
    for (const k of Object.keys(nextNews(news, ny(9, 0), 'high'))) assert.ok(allowed.has(k), k);
    assert.equal(nextNews([], ny(9, 0), 'high'), null);
  });

  test('backtest-B1: kolizja skrótów', async () => {
    const { DEFAULT_SKROTY, DEFAULT_JUMPS, RESERVED_SKROTY, skrotOf, collisions } = await mod();
    assert.deepEqual(DEFAULT_SKROTY, { play: 'Space', stepFwd: 'Shift+ArrowRight', stepBack: 'Shift+ArrowLeft', jump: 'J', speedUp: ']', speedDown: '[', buy: 'B', sell: 'S', closeAll: 'Shift+C', endDay: 'Shift+E', drawEntry: 'D' }); // J: wejście według rysunku
    assert.deepEqual(RESERVED_SKROTY, ['Escape', 'Ctrl+Z', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Enter', 'Delete', 'Backspace']);
    assert.deepEqual(collisions(DEFAULT_SKROTY, DEFAULT_JUMPS), [], 'domyślne bez kolizji');
    // klucze ustawień nie mogą pasować do filtra sanitizeSettings (key, hotkey…)
    for (const k of [...Object.keys(DEFAULT_SKROTY), ...Object.keys(DEFAULT_JUMPS[0])]) assert.ok(!/key/i.test(k), k);

    assert.equal(skrotOf({ key: 'ArrowRight', shiftKey: true }), 'Shift+ArrowRight');
    assert.equal(skrotOf({ key: ' ' }), 'Space');
    assert.equal(skrotOf({ key: 'b' }), 'B');
    assert.equal(skrotOf({ key: 'C', shiftKey: true }), 'Shift+C');
    assert.equal(skrotOf({ key: 'z', ctrlKey: true }), 'Ctrl+Z');
    assert.equal(skrotOf({ key: 'z', metaKey: true }), 'Ctrl+Z');
    assert.equal(skrotOf({ key: '+', shiftKey: true }), '+', 'shift wpisany w znak');
    assert.equal(skrotOf({ key: 'Shift', shiftKey: true }), '');

    const j = (id, skrot) => ({ id, name: id, cel: { kind: 'offset', sec: 60 }, skrot });
    const esc = collisions(DEFAULT_SKROTY, [j('a', 'Escape')]);
    assert.equal(esc.length, 1); assert.equal(esc[0].skrot, 'Escape'); assert.equal(esc[0].a, 'jump:a'); assert.equal(esc[0].b, 'reserved');
    const two = collisions(DEFAULT_SKROTY, [j('a', '7'), j('b', '7')]);
    assert.deepEqual(two, [{ a: 'jump:a', b: 'jump:b', skrot: '7' }]);
    const act = collisions(DEFAULT_SKROTY, [j('a', 'Space')]);
    assert.deepEqual(act, [{ a: 'play', b: 'jump:a', skrot: 'Space' }]);
    assert.equal(collisions(DEFAULT_SKROTY, [j('a', 'space')]).length, 1, 'wielkość liter bez znaczenia');
    assert.equal(collisions({ ...DEFAULT_SKROTY, buy: 'ArrowUp' }, []).length, 1, 'akcja na klawiszu wykresu');
    assert.deepEqual(collisions(DEFAULT_SKROTY, [j('a', ''), j('b', '')]), [], 'pusty skrót nie koliduje');
  });
};
