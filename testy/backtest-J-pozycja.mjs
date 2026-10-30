// backtest-J: rysunek pozycji long/short jak w TradingView (podpisy, ustawienia) i wejście według rysunku w replayu. Etap J (30.10.2026), karta docs/plany/backtest/etap-J.md.
// Słowa użytkownika: «ulepsz jeszcze rysunek pozycji long short tak zeby dzialalo i wygladalo jak na tradingview ale nie usuwujac naszych zadnych roznic [...] oraz w backtescie
// powinna byc funkcja ze jak mamy zaznaczony dana pozycje rysunek to mozna na podstawie tego wejsc w ta sama pozycje co rysunek». Decyzje [U] 1–4 w karcie.
// Funkcje czyste w Node; przeglądarka (edytor Live i replay) w testy/backtest-J.html.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const C = { fg: '#f3f3f3', fg2: '#9aa0a6', loss: '#ff6a6a', profit: '#1db954', be: '#7aa7ff', asia: '#80bdfb', london: '#ffa460', ny: '#cca7f8' };
  const T0 = 1710250200; // 2024-03-12 13:30 UTC
  const pos = (style = {}, kind = 'long-position', entry = 18000) => ({ kind, points: [{ time: T0, price: entry }, { time: T0 + 1800, price: entry }], style: { stopLevel: 10, profitLevel: 20, ...style } });

  test('backtest-J: domyślne podpisy włączone jak TV (nowy rysunek), paczka bez własnych pigułek', async () => {
    const R = await imp('public/js/rysunki.js'), S = await imp('public/js/pozycja-staty.js');
    for (const k of ['long-position', 'short-position']) {
      const st = R.styleFor(k, C);
      assert.deepEqual(S.statsOf(st), S.DEFAULT_STATS, `${k}: wszystkie podpisy włączone`);
      assert.ok(Object.values(S.DEFAULT_STATS).every((v) => v === true) && S.STAT_KEYS.length === 11);
      assert.equal(st.priceLabels, true, 'ceny na osi włączone');
      assert.equal(st.compactStats, false); assert.equal(st.showStats, false, 'jak TV: statystyki po zaznaczeniu, „zawsze” wyłączone');
      assert.ok(Object.values(st.positionStats).every((v) => v === false), 'pigułki paczki (po angielsku, bez mnożnika) dalej wyłączone');
      assert.equal(st.showPriceLabels, false, 'etykiety osi paczki (kolory na sztywno) wyłączone, rysujemy własne');
      assert.equal(st.showRR, true, 'R:R bez zaznaczenia zostaje (nasza różnica)');
    }
    // rysunek zapisany przed J (bez statsOn) też dostaje domyślne podpisy
    assert.deepEqual(S.statsOf({ positionStats: R.NO_STATS }), S.DEFAULT_STATS);
    const s = S.positionStats(pos({ riskDisplayMode: 'money', riskAmount: 500 }), { instrument: 'NQ' });
    const tx = S.statsText(s, S.statsOf({}));
    assert.match(tx.tp, /^Cel: 20 \(0,11%\) 80 ticków, Kwota: \+800\s\$$/, `cel: cena, %, ticki, kwota (${tx.tp})`);
    assert.match(tx.sl, /^Stop: 10 \(0,06%\) 40 ticków, Kwota: −400\s\$$/, `stop (${tx.sl})`);
    assert.deepEqual(tx.mid, ['Ilość: 2', 'R:R 2'], 'środek: ilość i R:R (P&L bez świec nieznany)');
  });

  test('backtest-J: podpisy wyłączalne pojedynczo i tryb kompaktowy', async () => {
    const S = await imp('public/js/pozycja-staty.js');
    const s = S.positionStats(pos({ riskDisplayMode: 'money', riskAmount: 500 }), { instrument: 'NQ' });
    const cfg = S.statsOf({ statsOn: { tpAmount: false, slTicks: false, qty: false } });
    assert.equal(cfg.tpAmount, false); assert.equal(cfg.rr, true);
    const tx = S.statsText(s, cfg);
    assert.ok(!/Kwota/.test(tx.tp) && /Kwota/.test(tx.sl) && !/ticków/.test(tx.sl) && !tx.mid.some((l) => /Ilość/.test(l)), JSON.stringify(tx));
    const none = S.statsText(s, Object.fromEntries(S.STAT_KEYS.map((k) => [k, false])));
    assert.deepEqual(none, { tp: '', mid: [], sl: '' }, 'wszystko wyłączone: bez podpisów');
    const cp = S.statsText(s, S.DEFAULT_STATS, { compact: true });
    assert.match(cp.tp, /^20 \(0,11%\) 80 \+800\s\$$/, `kompaktowy cel: same liczby (${cp.tp})`);
    assert.deepEqual(cp.mid, ['2', '2'], 'kompaktowy środek');
    // prostokąty: cel nad linią celu (long), stop pod linią stopu, środek na linii wejścia
    const b = S.statBoxes(S.statsText(s, S.DEFAULT_STATS), { x1: 100, x2: 300, yE: 200, yT: 120, yS: 240 }, (txt, sz) => txt.length * sz * 0.5, 12);
    const by = Object.fromEntries(b.map((x) => [x.role, x]));
    assert.ok(by.tp.y + by.tp.h <= 120 && by.sl.y >= 240 && Math.abs(by.mid.y + by.mid.h / 2 - 200) < 0.01 && Math.abs(by.tp.x + by.tp.w / 2 - 200) < 0.01, JSON.stringify(b));
  });

  test('backtest-J: ilość i kwoty z konta i ryzyka (kwota albo % konta), mnożnik kontraktu', async () => {
    const S = await imp('public/js/pozycja-staty.js');
    const a = S.positionStats(pos({ riskDisplayMode: 'percents', accountSize: 50000, riskPercent: 1 }), { instrument: 'NQ' });
    assert.equal(a.qty, 2, 'floor(500 / (10 × 20))'); assert.equal(a.tp.usd, 800); assert.equal(a.sl.usd, -400); assert.equal(a.rr, 2);
    assert.equal(a.tp.ticks, 80); assert.equal(a.sl.price, 17990); assert.equal(a.tp.price, 18020);
    const es = S.positionStats(pos({ riskDisplayMode: 'money', riskAmount: 1000 }, 'short-position', 5000), { instrument: 'ES' });
    assert.equal(es.qty, 2, 'ES: floor(1000 / (10 × 50))'); assert.equal(es.tp.price, 4980); assert.equal(es.sl.price, 5010);
    assert.equal(S.positionStats(pos({ riskDisplayMode: 'percents', accountSize: 50000 }), { instrument: 'NQ' }).qty, null, 'bez % ryzyka brak ilości');
    assert.equal(S.positionStats(pos({ riskAmount: 500 }), { instrument: 'XYZ' }).qty, null, 'instrument bez mnożnika: brak ilości');
  });

  test('backtest-J: rysunek z pól trade\'a Live bez zmyślonej ilości i kwot', async () => {
    const W = await imp('public/js/wykres.js'), S = await imp('public/js/pozycja-staty.js');
    // domyślne paczki (konto 1000, ryzyko 25%) nie mogą dać ilości: trade nie ma liczby kontraktów
    const D = { defaultStyleFor: () => ({ accountSize: 1000, riskPercent: 25, riskDisplayMode: 'percents', lotSize: 1, leverage: 10000 }) };
    const tr = { at: T0 * 1000, exitAt: (T0 + 1800) * 1000, entryPrice: 18000, exitPrice: 18012, sl: 17990, tp: 18020 };
    const d = W.positionDrawing(tr, D, C, 0);
    const s = S.positionStats(d, { instrument: 'NQ' });
    assert.equal(s.qty, null); assert.equal(s.tp.usd, null); assert.equal(s.sl.usd, null);
    const tx = S.statsText(s, S.DEFAULT_STATS);
    const all = [tx.tp, tx.sl, ...tx.mid].join(' | ');
    assert.ok(!/Ilość|Kwota|\$/.test(all), `bez ilości i kwot: ${all}`);
    assert.match(tx.tp, /Cel: 20 \(0,11%\) 80 ticków/); assert.match(tx.sl, /Stop: 10/);
    assert.deepEqual(tx.mid, ['Zamknięty P&L: +12 pkt', 'R:R 2'], 'P&L w punktach z wyjścia trade\'a, R:R');
  });

  test('backtest-J: P&L przebiegu ceny (TP, SL, SL przed TP w jednej świecy, otwarta, wejście nie dotknięte)', async () => {
    const S = await imp('public/js/pozycja-staty.js');
    const bar = (k, o, h, l, c) => [T0 + k * 60, o, h, l, c, 1];
    const d = pos();
    assert.deepEqual(S.positionPL(d, [bar(0, 18005, 18006, 18001, 18003)], 60), null, 'wejście nie dotknięte');
    assert.deepEqual(S.positionPL(d, [bar(0, 18001, 18002, 17999, 18000), bar(1, 18000, 18021, 17999, 18015)], 60), { diff: 20, closed: true });
    assert.deepEqual(S.positionPL(d, [bar(0, 18001, 18002, 17999, 18000), bar(1, 18000, 18030, 17985, 18015)], 60), { diff: -10, closed: true }, 'SL i TP w jednej świecy: SL');
    assert.deepEqual(S.positionPL(d, [bar(0, 18001, 18002, 17999, 18000), bar(1, 18000, 18008, 17995, 18006)], 60), { diff: 6, closed: false });
    assert.deepEqual(S.positionPL(d, [bar(0, 18001, 18002, 17999, 18000), bar(30, 18000, 18030, 17999, 18025)], 60), { diff: 0, closed: false }, 'świeca na prawej krawędzi poza zakresem (jak TV)');
    assert.deepEqual(S.positionPL(pos({ exitLevel: -4 }), [], 60), { diff: -4, closed: true }, 'wyjście z rysunku (nasze) wygrywa');
  });

  test('backtest-J: nowe ustawienia zapisują się w pamięci stylu i przeżywają zapis rysunków (paczka, serwer, motyw)', async () => {
    const R = await imp('public/js/rysunki.js'), K = await imp('public/js/rysunki-kolory.js'), Dr = await imp('lib/drawings.mjs');
    const P = await imp('public/vendor/lightweight-charts-drawing/lightweight-charts-drawing.es.js');
    const extra = { statsOn: { tpAmount: false, rr: true }, compactStats: true, showStats: true, priceLabels: false, accountSize: 25000, riskDisplayMode: 'percents', riskPercent: 2, riskAmount: 300,
      stopColor: '#aa0000', targetColor: '#00aa00', stopTransparency: 70, targetTransparency: 60, fontSize: 14, textColor: '#123456', width: 2, color: '#654321' };
    const keys = Object.keys(extra);
    for (const k of keys) assert.ok(R.STYLE_KEYS.includes(k), `STYLE_KEYS zawiera ${k}`);
    const SECRET = /token|secret|password|haslo|hasło|pin|key|databento|chartcost|chartdaily|chartcredit|chartspen/i;
    for (const k of [...R.STYLE_KEYS, 'statsOn', ...Object.keys(extra.statsOn)]) assert.ok(!SECRET.test(k), `nazwa ${k} przechodzi sanitizeSettings`);
    const st = { ...R.styleFor('long-position', C), ...extra };
    assert.deepEqual(Object.fromEntries(keys.map((k) => [k, R.pickStyle(st)[k]])), extra, 'pamięć stylu narzędzia niesie nowe pola');
    const mem = new Map();
    globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    try {
      R.saveToolStyle('long-position', st);
      const next = R.styleForTool('long-position', C, false);
      for (const k of keys) assert.deepEqual(next[k], extra[k], `nowy rysunek dostaje zapamiętane ${k}`);
    } finally { delete globalThis.localStorage; }
    const d = { id: 'x1', ...pos(st) };
    const doc = { v: 1, lib: '0.6.2', at: new Date().toISOString(), d: [K.canonical(K.themed(d, C))] };
    const back = await Dr.parseDoc(JSON.parse(JSON.stringify(doc)), (s) => s);
    const parsed = P.parseDrawings(back.d)[0];
    for (const k of keys) assert.deepEqual(parsed.style[k], extra[k], `po zapisie i odczycie (paczka): ${k}`);
  });

  test('backtest-J: wczytanie czyści tylko konto i ryzyko podsunięte przez paczkę (1000 / 25% / percents), wpisane zostają', async () => {
    const R = await imp('public/js/rysunki.js');
    const old = (st) => ({ kind: 'long-position', points: [{ time: T0, price: 18000 }], style: { stopLevel: 10, profitLevel: 20, ...st } });
    const a = R.cleanPosition(old({ accountSize: 1000, riskPercent: 25, riskDisplayMode: 'percents' })).style;
    assert.deepEqual([a.accountSize, a.riskPercent, a.riskAmount, a.riskDisplayMode], [null, null, null, 'money'], 'domyślne paczki wyczyszczone');
    assert.ok(Object.values(a.positionStats).every((v) => v === false), 'bez pigułek paczki');
    for (const st of [{ accountSize: 50000, riskDisplayMode: 'money', riskAmount: 500 }, { accountSize: 1000, riskPercent: 25, riskDisplayMode: 'percents', riskAmount: 300 },
      { accountSize: 1000, riskPercent: 25, riskDisplayMode: 'percents', statsOn: {} }, { accountSize: 1000, riskPercent: 2, riskDisplayMode: 'percents' }]) {
      const c = R.cleanPosition(old(st)).style;
      for (const k of Object.keys(st)) assert.deepEqual(c[k], st[k], `wartość wpisana zostaje: ${JSON.stringify(st)} → ${k}`);
    }
    assert.equal(R.cleanPosition({ kind: 'rectangle', points: [], style: { accountSize: 1000 } }).style.accountSize, 1000, 'inne rysunki bez zmian');
  });

  test('backtest-J: zlecenie i pozycja z rysunku niosą id rysunku (blokada drugiego wejścia)', async () => {
    const E = await imp('public/js/bt-wypelnienia.js');
    const last = { t: T0, price: 18000 };
    const lim = E.placeOrder(E.emptyBook(), { instrument: 'NQ', side: 'buy', type: 'limit', price: 17990, qty: 1, sl: 17980, tp: 18010, fromDrawing: 'd7' }, last);
    assert.equal(lim.book.orders[0].fromDrawing, 'd7');
    const mk = E.placeOrder(E.emptyBook(), { instrument: 'NQ', side: 'buy', type: 'market', qty: 1, sl: 17990, tp: 18020, fromDrawing: 'd8' }, last);
    assert.equal(mk.book.positions.NQ.fromDrawing, 'd8');
    assert.equal(E.placeOrder(E.emptyBook(), { instrument: 'NQ', side: 'buy', type: 'market', qty: 1, sl: 17990 }, last).book.positions.NQ.fromDrawing, undefined, 'zwykłe zlecenie bez pola');
  });

  test('backtest-J: BE, wyjście i R:R rysunku dalej działają', async () => {
    const G = await imp('public/js/geometria.js'), R = await imp('public/js/rysunki.js');
    const d = pos({ beLevel: 2, exitLevel: 8, showRR: true });
    const s = G.chartScales({ candles: Array.from({ length: 40 }, (_, k) => [T0 + k * 60, 18000, 18001, 17999, 18000]), xs: G.indexScale({ lastIndex: 39, right: 790, spacing: 20 }), ys: G.priceScaleFrom(17980, 400, 18030, 0), box: { left: 0, right: 800, top: 0, bottom: 400 }, step: 60 });
    const roles = (G.shapes(d, s)?.parts || []).map((p) => p.role).filter(Boolean);
    for (const r of ['be', 'be-label', 'exit', 'exit-path', 'rr']) assert.ok(roles.includes(r), `część ${r} (${roles.join(',')})`);
    const pr = R.positionPrices(d);
    assert.deepEqual([pr.be, pr.exitPrice, pr.sl, pr.tp], [18002, 18008, 17990, 18020]);
    assert.equal(R.positionPrices(R.withPositionPrice(d, 'be', 18004)).be, 18004);
  });

  test('backtest-J: zlecenie z rysunku: market (± 1 tick), limit albo stop wg strony ceny, SL/TP z rysunku, ilość z ryzyka sesji', async () => {
    const S = await imp('public/js/pozycja-staty.js'), E = await imp('public/js/bt-wypelnienia.js');
    const go = (d, price) => S.orderFromDrawing(d, { last: { t: T0 + 600, price }, instrument: 'NQ', riskUsd: 500 });
    const long = pos(), short = pos({}, 'short-position');
    const m = go(long, 18000.25);
    assert.deepEqual(m.order, { instrument: 'NQ', side: 'buy', type: 'market', price: undefined, qty: sizeQ(E, 500, 18000.25, 17990), sl: 17990, tp: 18020 });
    assert.equal(go(long, 17999.75).order.type, 'market');
    assert.equal(go(long, 17995).order.type, 'stop', 'long, wejście nad ceną: buy stop');
    assert.equal(go(long, 18005).order.type, 'limit', 'long, wejście pod ceną: buy limit');
    assert.equal(go(short, 18005).order.type, 'stop', 'short, wejście pod ceną: sell stop');
    assert.equal(go(short, 17995).order.type, 'limit', 'short, wejście nad ceną: sell limit');
    const sh = go(short, 17995).order;
    assert.deepEqual([sh.side, sh.price, sh.sl, sh.tp, sh.qty], ['sell', 18000, 18010, 17980, 2]);
    for (const [d, p] of [[long, 18000], [long, 17995], [long, 18005], [short, 18005], [short, 17995]]) {
      const r = E.placeOrder(E.emptyBook(), go(d, p).order, { t: T0 + 600, price: p });
      assert.ok(!r.events.some((e) => e.type === 'rejected'), `silnik przyjmuje (${d.kind} @ ${p}): ${JSON.stringify(r.events)}`);
    }
    assert.equal(go(pos({ stopLevel: 0 }), 18000).code, 'no-sl', 'bez SL: wielkość z ryzyka niemożliwa');
    assert.equal(go(long, NaN).code, 'no-price');
    assert.equal(S.orderFromDrawing(long, { last: { price: 18000 }, instrument: 'NQ', riskUsd: 50 }).code, 'risk');
    assert.equal(S.orderFromDrawing({ kind: 'rectangle', points: [] }, { last: { price: 1 } }).code, 'no-drawing');
  });
  const sizeQ = (E, riskUsd, entry, sl) => E.sizeFromRisk({ riskUsd, entry, sl, instrument: 'NQ' });

  test('backtest-J: skrót „Wejdź według rysunku” (domyślnie D, bez kolizji, stare ustawienia nie tracą skrótu skoku)', async () => {
    const B = await imp('public/js/bt-czas.js');
    assert.equal(B.DEFAULT_SKROTY.drawEntry, 'D');
    assert.ok(B.SKROT_ACTIONS.includes('drawEntry'));
    assert.deepEqual(B.collisions(B.DEFAULT_SKROTY, B.DEFAULT_JUMPS), [], 'domyślne bez kolizji');
    assert.equal(B.sanitizeBt({}).skroty.drawEntry, 'D');
    assert.equal(B.sanitizeBt({ skroty: { drawEntry: 'Shift+D' } }).skroty.drawEntry, 'Shift+D');
    // zapis sprzed J: skok ze skrótem D zostaje, nowa akcja bez skrótu
    const old = { skroty: { ...B.DEFAULT_SKROTY, drawEntry: undefined }, jumps: [{ id: 'x', name: 'Moje', cel: { kind: 'time', at: '10:00' }, skrot: 'D' }] };
    delete old.skroty.drawEntry;
    const s = B.sanitizeBt(old);
    assert.equal(s.jumps[0].skrot, 'D'); assert.equal(s.skroty.drawEntry, '');
    assert.ok(B.collisions({ ...B.DEFAULT_SKROTY, drawEntry: 'B' }, []).length > 0, 'kolizja z Kup wykryta');
  });
};
