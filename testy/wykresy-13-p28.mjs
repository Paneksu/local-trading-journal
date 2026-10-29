// wykresy-13: P28 (28.10.2026), poprawki użytkownika do pozycji trade'a po odblokowaniu kłódką. Słowa użytkownika: «dopracuj i zrob te 3 pkt»:
// 1) cena wyjścia przeciągana na wykresie (własna kropka-uchwyt, spójna z podglądem i geometrią), 2) R przeliczane z cen przy zapisie i nadpisujące
// wpisane R (P&L bez zmian: trade nie ma pola liczby kontraktów, pytanie w raporcie P28), 3) przesunięcie pozycji w bok zmienia datę i godzinę wejścia
// i wyjścia (świeca bieżącego interwału, strefa jak w formularzu), wyjście nie przed wejściem. Testy sprawdzają zachowanie: funkcje czyste w Node,
// zapis przez serwer i atrapę Notion (Notion przechowuje datę z przesunięciem), edytor w przeglądarce (testy/pozycja-p28.html).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  let port = 4900;
  const next = () => ++port;
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const T0 = 1793000000 - (1793000000 % 300);
  const bars5 = Array.from({ length: 60 }, (_, k) => [T0 + k * 300, 100, 101, 99, 100, 1]); // 5m
  const pos = (p0, p1, style = {}) => ({ kind: 'long-position', points: [{ time: p0, price: 5840 }, { time: p1, price: 5840 }], style: { stopLevel: 4, profitLevel: 8, ...style } });

  test('wykresy-13: P28 R z cen: (wyjście − wejście) × kierunek / |wejście − SL|, zaokrąglone do 0,01; bez wyjścia albo SL brak R', async () => {
    const R = await lib('public/js/rysunki.js');
    assert.equal(R.resultR({ entryPrice: 5840, exitPrice: 5846, sl: 5836 }, 1), 1.5);
    assert.equal(R.resultR({ entryPrice: 5840, exitPrice: 5838, sl: 5836 }, 1), -0.5);
    assert.equal(R.resultR({ entryPrice: 5840, exitPrice: 5831, sl: 5843 }, -1), 3, 'short');
    assert.equal(R.resultR({ entryPrice: 5840, exitPrice: 5841, sl: 5837 }, 1), 0.33);
    assert.equal(R.resultR({ entryPrice: 5840, exitPrice: null, sl: 5836 }, 1), null);
    assert.equal(R.resultR({ entryPrice: 5840, exitPrice: 5846, sl: 5840 }, 1), null, 'SL na wejściu: ryzyko 0');
  });

  test('wykresy-13: P28 wyjście w rysunku pozycji: pole trade\'a → exitLevel (long i short), panel ↔ rysunek, geometria daje kropkę i ścieżkę', async () => {
    const R = await lib('public/js/rysunki.js'), W = await lib('public/js/wykres.js'), G = await lib('public/js/geometria.js');
    const D = { defaultStyleFor: () => ({}) }, C = { fg: '#fff', fg2: '#aaa', loss: '#f00', profit: '#0f0' };
    const tr = { at: T0 * 1000, exitAt: (T0 + 3000) * 1000, entryPrice: 100, exitPrice: 104, sl: 98, tp: 106 };
    assert.equal(W.positionDrawing(tr, D, C, 0).style.exitLevel, 4);
    assert.equal(W.positionDrawing({ ...tr, sl: 102, tp: 94, exitPrice: 99 }, D, C, 0).style.exitLevel, 1, 'short: w stronę zysku dodatnio');
    assert.equal(W.positionDrawing({ ...tr, exitPrice: null }, D, C, 0).style.exitLevel, undefined);
    const d = pos(T0, T0 + 3000, { exitLevel: 6.1 });
    assert.equal(R.positionPrices(d).exitPrice, 5846, 'cena wyjścia z rysunku, tick 0,25');
    assert.equal(R.positionPrices({ ...d, kind: 'short-position' }).exitPrice, 5834);
    assert.equal(R.withPositionPrice(d, 'exitPrice', 5850).style.exitLevel, 10);
    assert.equal(R.withPositionPrice(d, 'exitPrice', null).style.exitLevel, undefined, 'puste wyjście czyści pole');
    assert.equal(R.withPositionPrice(d, 'entryPrice', 5841).style.exitLevel, 6.1, 'wyjście jedzie z pozycją jak SL/TP');
    // geometria: kropka na prawej krawędzi pozycji (czas wyjścia) w cenie wyjścia, ścieżka od wejścia (jak levelsSvg w podglądzie)
    const xs = G.indexScale({ lastIndex: bars5.length - 1, right: 590, spacing: 10 }), ys = G.priceScaleFrom(5830, 300, 5850, 100);
    const s = G.chartScales({ candles: bars5, xs, ys, box: { left: 0, right: 600, top: 0, bottom: 400 }, pip: 0.25 });
    const parts = G.shapes(pos(bars5[10][0], bars5[20][0], { exitLevel: 6 }), s).parts;
    const dot = parts.find((p) => p.role === 'exit'), path1 = parts.find((p) => p.role === 'exit-path');
    assert.ok(dot && path1, 'kropka i ścieżka wyjścia');
    assert.deepEqual([dot.x, dot.y, dot.price], [s.x(20), s.y(5846), 5846]);
    assert.deepEqual([path1.x1, path1.y1, path1.x2, path1.y2], [s.x(10), s.y(5840), s.x(20), s.y(5846)]);
    assert.equal(dot.cls, 'lvl-d exit', 'te same klasy CSS co kropka wyjścia w podglądzie (tokeny)');
    assert.ok(!G.shapes(pos(bars5[10][0], bars5[20][0]), s).parts.some((p) => p.role === 'exit'), 'pozycja bez wyjścia: bez kropki');
  });

  test('wykresy-13: P28 przesunięcie pozycji: czas przyciągnięty do świecy interwału, ta sama świeca zostawia dokładną minutę, wyjście nie przed wejściem', async () => {
    const R = await lib('public/js/rysunki.js'), G = await lib('public/js/geometria.js');
    assert.equal(G.snapTime(bars5, T0 + 300 * 7 + 140, 300), T0 + 300 * 7);
    assert.equal(G.snapTime(bars5, T0 + 300 * 59 + 900, 300), T0 + 300 * 62, 'za ostatnią świecą: siatka co krok');
    assert.equal(G.snapTime(bars5, T0 - 310, 300), T0 - 600, 'przed pierwszą świecą');
    const opts = { candles: bars5, step: 300, tz: 'Europe/Warsaw' };
    const at = (T0 + 300 * 10 + 120) * 1000, exitAt = (T0 + 300 * 20) * 1000; // wejście 2 min po otwarciu świecy 5m
    const tr = { at, exitAt, entryPrice: 5840, exitPrice: 5846, sl: 5836, tp: 5848, be: null, r: 0.5 };
    // bez przesunięcia (także drobne przesunięcie w tej samej świecy): bez pól dat
    const same = R.planTradeSave(tr, pos(T0 + 3000 + 120 + 30, T0 + 6000 + 60, { exitLevel: 6 }), opts);
    assert.ok(!('date' in same.body) && !('exitDate' in same.body), JSON.stringify(same.body));
    assert.equal(same.at, at); assert.equal(same.exitAt, exitAt);
    // o 3 świece w prawo
    const moved = R.planTradeSave(tr, pos(T0 + 300 * 13 + 120, T0 + 300 * 23, { exitLevel: 6 }), opts);
    assert.equal(moved.at, (T0 + 300 * 13) * 1000, 'wejście na początku nowej świecy');
    assert.equal(moved.exitAt, (T0 + 300 * 23) * 1000);
    const wIn = R.wallClock(moved.at, 'Europe/Warsaw');
    assert.deepEqual([moved.body.date, moved.body.time, moved.body.tz], [wIn.date, wIn.time, 'Europe/Warsaw']);
    assert.ok(moved.body.exitDate && moved.body.exitTime, 'wyjście też');
    assert.ok(moved.changes.some((c) => c.label === 'Czas wejścia') && moved.changes.some((c) => c.label === 'Czas wyjścia'), 'lista zmian ma czasy');
    // wyjście przed wejściem: błąd, nic do zapisu
    const bad = R.planTradeSave(tr, pos(T0 + 300 * 13, T0 + 300 * 11, { exitLevel: 6 }), opts);
    assert.match(bad.error, /przed wejściem/);
    assert.equal(bad.body, undefined);
    // wyjście w świecy wejścia: ta sama chwila co wejście, nie wcześniej
    const inBar = R.planTradeSave(tr, pos(T0 + 300 * 10 + 120, T0 + 300 * 10, { exitLevel: 6 }), opts);
    assert.equal(inBar.exitAt, at);
    // trade bez czasu wyjścia nie dostaje go z przesunięcia
    const noExit = R.planTradeSave({ ...tr, exitAt: null }, pos(T0 + 300 * 13, T0 + 300 * 59, { exitLevel: 6 }), opts);
    assert.ok(!('exitDate' in noExit.body) && noExit.body.date, JSON.stringify(noExit.body));
  });

  test('wykresy-13: P28 data w strefie formularza: wallClock daje datę i godzinę chwili w podanej strefie (lato i zima, przez północ)', async () => {
    const R = await lib('public/js/rysunki.js');
    assert.deepEqual(R.wallClock(Date.UTC(2026, 9, 27, 8, 47), 'Europe/Warsaw'), { date: '2026-10-27', time: '09:47' }, 'zima UTC+1');
    assert.deepEqual(R.wallClock(Date.UTC(2026, 6, 1, 22, 30), 'Europe/Warsaw'), { date: '2026-07-02', time: '00:30' }, 'lato UTC+2, po północy');
    assert.deepEqual(R.wallClock(Date.UTC(2026, 6, 1, 13, 30), 'America/New_York'), { date: '2026-07-01', time: '09:30' });
  });

  // P32 (28.10.2026), słowa użytkownika: «tez ma byc reczny» (R, jak P&L w P30): odstępstwo od P28, zapis pozycji nie wysyła R ani P&L i nie pokazuje R w liście zmian.
  test('wykresy-13: P32 zapis pozycji nie zmienia R ani P&L (oba ręczne), lista zmian bez R', async () => {
    const R = await lib('public/js/rysunki.js');
    const tr = { at: (T0 + 3000) * 1000, exitAt: (T0 + 6000) * 1000, entryPrice: 5840, exitPrice: 5846, sl: 5836, tp: 5848, be: null, r: 0.5, pnl: 312 };
    const p = R.planTradeSave(tr, pos(T0 + 3000, T0 + 6000, { exitLevel: 10 }), { candles: bars5, step: 300, fmt: { r: (v) => `${v}R` } });
    assert.ok(!('r' in p.body), `R nie jest wysyłane (${JSON.stringify(p.body)})`);
    assert.ok(!('pnl' in p.body), 'P&L nie jest wysyłany');
    assert.equal(p.changes.find((c) => c.label === 'R'), undefined, 'lista zmian bez R');
    assert.equal(p.body.exitPrice, 5850, 'ceny dalej z rysunku');
  });

  // ---- serwer + atrapa Notion: ta sama trasa zapisu (PATCH /api/trades/:id, X-THQ, edited) ----
  function envDir() {
    const dir = H.tmp();
    const I = H.IDS;
    writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x\nNOTION_ROOT_URL=${H.PARENT_URL}\nDS_TRADES=${I.DS_TRADES}\nDS_KONTA=${I.DS_KONTA}\nDS_DZIENNIK=${I.DS_DZIENNIK}\nDS_FINANSE=${I.DS_FINANSE}\n`);
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: 2, lang: 'pl' }));
    return dir;
  }
  test('wykresy-13: P28 zapis planu przez serwer (P32: R bez zmian): Notion dostaje ceny i daty z przesunięciem (ta sama chwila), P&L bez zmian, cudza zmiana dalej daje 409', async () => {
    const A = await H.atrapa(next());
    const dir = envDir();
    const env = H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], env);
    assert.equal(mig.code, 0, mig.err);
    const S = await H.server(next(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    try {
      const R = await lib('public/js/rysunki.js');
      const pages = await A.get('/__test/pages?ds=trades');
      const id = pages[0].id;
      const data0 = await (await fetch(`${S.base}/api/data`)).json();
      const row0 = data0.data.trades.find((t) => t._id === id);
      const tz = 'Europe/Warsaw';
      const at = Date.UTC(2026, 9, 27, 8, 47), exitAt = Date.UTC(2026, 9, 27, 9, 15);
      const plan = R.planTradeSave({ at: Date.UTC(2026, 9, 27, 8, 30), exitAt: Date.UTC(2026, 9, 27, 8, 40), entryPrice: 5840, sl: 5836, r: 0.5 },
        { kind: 'long-position', points: [{ time: at / 1000, price: 5840 }, { time: exitAt / 1000, price: 5840 }], style: { stopLevel: 4, profitLevel: 8, exitLevel: 10 } },
        { candles: Array.from({ length: 120 }, (_, k) => [Date.UTC(2026, 9, 27, 8, 0) / 1000 + k * 60, 1, 1, 1, 1, 1]), step: 60, tz });
      const r = await H.dash(S.base, `/api/trades/${id}`, { ...plan.body, edited: row0._edited }, { method: 'PATCH' });
      assert.equal(r.status, 200, JSON.stringify(r.j));
      const data1 = await (await fetch(`${S.base}/api/data?refresh=1`)).json();
      const row = data1.data.trades.find((t) => t._id === id);
      assert.equal(row.r, row0.r, 'P32: R bez zmian (ręczne)');
      assert.equal(row.exitPrice, 5850);
      assert.equal(row.pnl, row0.pnl, 'P&L bez zmian');
      assert.equal(new Date(row.date).getTime(), at, `wejście: ta sama chwila (${row.date})`);
      assert.match(row.date, /\+01:00$/, 'Notion przechowuje z przesunięciem strefy');
      assert.equal(new Date(row.exit).getTime(), exitAt, `wyjście: ta sama chwila (${row.exit})`);
      // cudza zmiana w Notion: zapis z tym samym (starym) znacznikiem dostaje 409
      await A.post('/__test/notion-edit', { id, set: { Notatki: 'zmiana z Notion' } });
      const stale = await H.dash(S.base, `/api/trades/${id}`, { ...plan.body, edited: r.j.edited }, { method: 'PATCH' });
      assert.equal(stale.status, 409); assert.equal(stale.j.code, 'stale');
    } finally { S.stop(); A.stop(); }
  });

  // ---- edytor w przeglądarce ----
  let pageRun = null;
  async function pageResult() {
    pageRun ||= (async () => {
      const { findBrowser, dumpDom } = await import(pathToFileURL(path.join(ROOT, 'testy/przegladarka.mjs')).href);
      if (!findBrowser()) return null;
      const S = await H.server(next(), { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: H.tmp() });
      try {
        const dom = await dumpDom(`${S.base}/__testy/pozycja-p28.html`);
        const m = /<pre id="wynik">([\s\S]*?)<\/pre>/.exec(dom);
        assert.ok(m, 'strona zwróciła wynik');
        return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
      } finally { S.stop(); }
    })();
    return pageRun;
  }
  async function tagged(tag, min) {
    const res = await pageResult();
    if (!res) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }
  test('wykresy-13: P28-1 edytor: kropka wyjścia zgodna z LWC (1 px), przeciągnięcie zmienia cenę i czas wyjścia, paczka nie przejmuje gestu, wykres stoi', () => tagged('P28-1', 8));
  test('wykresy-13: P28-2 edytor: PATCH bez P&L', () => tagged('P28-2', 1));
  test('wykresy-13: P32-8 edytor: R ręczne, panel bez R w liście zmian, PATCH bez R', () => tagged('P32-8', 2));
  test('wykresy-13: P28-3 edytor: przesunięcie w bok zmienia daty wejścia i wyjścia w PATCH, edytor i aplikacja mają nowe czasy, wyjście przed wejściem blokuje zapis', () => tagged('P28-3', 7));
};
