// backtest-H1: poprawki po przeglądzie H2 (code-reviewer #1–#5, security-auditor S6–S8, zgłoszenie z zrzutów). Dane wyłącznie syntetyczne, atrapa Notion,
// katalogi tymczasowe jako atrapa produkcji (prawdziwego R:/PROJEKTY/trading-hq testy nie dotykają).
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdirSync, writeFileSync, symlinkSync, existsSync, readdirSync } from 'node:fs';
import { rig, trade, session, SID } from './bt-notion-rig.mjs';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

  // ---- #1 (P1): znak wodny per instrument ----
  test('backtest-H1: znak wodny per instrument (ES przy NQ w oknie 1s)', async () => {
    const W = await imp('public/js/bt-wypelnienia.js');
    const T = 1710250500; // 9:35 NY 12.03.2024
    // stan jak w replayu: NQ (świece 1s) doszedł do 9:35:30, ES (tylko 1m) widzi koniec świecy 9:34 = 9:35:00
    const b0 = { ...W.emptyBook(), hw: T + 30, hwi: { NQ: T + 30, ES: T } };
    const lastES = { t: T, price: 5100 };
    const r1 = W.placeOrder(b0, { instrument: 'ES', side: 'buy', type: 'market', qty: 2, sl: 5095, tp: 5120 }, lastES);
    assert.ok(r1.book.positions.ES, `Kup ES przyjęte: ${JSON.stringify(r1.events)}`);
    const r2 = W.modifyPosition(r1.book, 'ES', { tp: 5125 }, { t: T, price: 5102 });
    assert.equal(r2.book.positions.ES.tp, 5125, `zmiana TP ES: ${JSON.stringify(r2.events)}`);
    const r3 = W.moveToBE(r2.book, 'ES', { t: T, price: 5102 });
    assert.equal(r3.book.positions.ES.be, true, `BE ES: ${JSON.stringify(r3.events)}`);
    const r4 = W.closePartial(r3.book, 'ES', 1, { t: T, price: 5103 });
    assert.equal(r4.book.positions.ES.openQty, 1, `część ES: ${JSON.stringify(r4.events)}`);
    const r5 = W.closeAll(r4.book, 'ES', { t: T, price: 5104 }, 'eod');
    assert.ok(!r5.book.positions.ES && r5.events.some((e) => e.type === 'closed'), `zamknięcie ES (eod): ${JSON.stringify(r5.events.map((e) => e.type))}`);
    // cofnięcie ES przed jego znak wodny dalej blokuje (NQ nie ma tu znaczenia)
    const back = W.placeOrder(b0, { instrument: 'ES', side: 'buy', type: 'market', qty: 1, sl: 5095 }, { t: T - 60, price: 5100 });
    assert.equal(back.events[0]?.reason, 'rewound');
    const backNQ = W.placeOrder(b0, { instrument: 'NQ', side: 'buy', type: 'market', qty: 1, sl: 18000 }, { t: T + 15, price: 18010 });
    assert.equal(backNQ.events[0]?.reason, 'rewound', 'NQ przed swoim znakiem wodnym zablokowany');
    // księga bez hwi (stare pliki): porównanie z hw jak dotąd
    const old = W.placeOrder({ ...W.emptyBook(), hw: T + 30, hwi: undefined }, { instrument: 'ES', side: 'buy', type: 'market', qty: 1, sl: 5095 }, lastES);
    assert.equal(old.events[0]?.reason, 'rewound');
  });

  // ---- strona w przeglądarce: ES obok NQ 15s, podpowiedź, podwójne „Następny dzień”, kolejka wysyłek ----
  const runs = {};
  function pageResult(part, port) {
    runs[part] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      for (const day of ['2024-03-12', '2024-03-13']) {
        await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day, seed: 3 });
        await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'ES', day, seed: 5, has1s: false });
      }
      const S = await H.server(port, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try { return JSON.parse(await P.cdpPage(`${S.base}/__testy/backtest-h1-poprawki.html?part=${part}`, { width: 1920, height: 1080, timeoutMs: 120_000 })); } finally { S.stop(); }
    })();
    return runs[part];
  }
  async function tagged(part, port, tag, min) {
    const res = await pageResult(part, port);
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }
  test('backtest-H1: handel ES obok NQ 15s w oknie 1s (przeglądarka)', () => tagged('es', 4931, 'es', 9));
  test('backtest-H1: wyłączone Kup mówi, czego brakuje', () => tagged('es', 4931, 'podpowiedz', 1));
  test('backtest-H1: pytanie „Zakończ dzień” stoi nad ekranem replayu', () => tagged('dialog', 4939, 'dialog', 2));
  test('backtest-H1: podwójne „Następny dzień” nie kończy nowego dnia', () => tagged('dni', 4932, 'nastepny', 3));
  test('backtest-H1: „Zakończ dzień” w trakcie wysyłki trafia do kolejki', () => tagged('dni', 4932, 'kolejka', 1));

  // ---- #4 (P3): odstęp przed ponownym POST liczony od przekroczenia czasu ----
  test('backtest-H1: odstęp przed ponownym POST po przekroczonym czasie', async () => {
    const R = await rig(H, assert, ROOT, 5691, { timeoutMs: 300 });
    try {
      R.store.save(SID, session([trade(1)]), 0);
      // POST wisi; w tym czasie zegar wysyłki idzie o 30 s (tyle trwa prawdziwy limit), więc „od wysłania” odstęp już minął
      let first = true;
      R.fault = (m, p) => { if (m === 'POST' && p === '/v1/pages' && first) { first = false; R.clock += 30_000; return 'hang'; } return null; };
      await R.sync.push({ sessionId: SID });
      const n = R.calls.filter((c) => c === 'POST /v1/pages').length;
      const r1 = await R.sync.push({ sessionId: SID, all: true });
      assert.equal(R.calls.filter((c) => c === 'POST /v1/pages').length, n, 'zaraz po przekroczonym czasie bez nowego POST (pierwszy może jeszcze utworzyć stronę)');
      assert.equal(r1.sent, 0);
      R.clock += 31_000;
      const r2 = await R.sync.push({ sessionId: SID });
      assert.equal(r2.sent, 1);
    } finally { R.A.stop(); }
  });

  // ---- S8 (P3): id trade'a poza wzorcem znacznika ----
  test('backtest-H1: trade z id spoza t<n> to błąd trade\'a, nie dubel', async () => {
    const { checkTradeShape } = await imp('lib/backtest-sync.mjs');
    assert.throws(() => checkTradeShape(trade(1, { id: 'x1' })), /id|Uszkodzony/);
    assert.throws(() => checkTradeShape(trade(1, { id: 't1/../t2' })), /id|Uszkodzony/);
    assert.doesNotThrow(() => checkTradeShape(trade(12)));
  });

  // ---- zgłoszenie z zrzutów (P1): NQ z 1s, ale bez 1m 9:30–16:00 nie trafia do puli ----
  test('backtest-H1: NQ bez 1m 9:30–16:00 poza pulą', async () => {
    const { matchDays } = await imp('public/js/bt-filtr.js');
    const f = (day, has1s, has1m) => ({ day, wd: 2, has1s: { NQ: has1s }, has1m: { NQ: has1m } });
    const m = matchDays({ instruments: ['NQ'], filter: null, excluded: [] }, [f('2026-10-27', true, true), f('2026-10-28', true, false), f('2026-10-29', false, false)]);
    assert.deepEqual(m.days, ['2026-10-27']);
    assert.deepEqual(m.excluded, [{ day: '2026-10-28', reason: 'no1m' }, { day: '2026-10-29', reason: 'no1s' }]);
  });

  // ---- #5 (P3): komunikat filtra przez t() ----
  test('backtest-H1: komunikat złego filtra przetłumaczony', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(path.join(ROOT, 'public/js/bt-filtr-widok.js'), 'utf8');
    const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/i18n/en.json'), 'utf8'));
    const m = /errText = t\('([^']+)'\)/.exec(src);
    assert.ok(m && !/\{msg\}/.test(m[1]), 'komunikat bez wstawionego polskiego tekstu modułu');
    assert.ok(en[m[1]], `en.json ma „${m?.[1]}”`);
  });

  // ---- S6/S7 (P1): katalog odbioru tylko z allowlisty, po realpath ----
  test('backtest-H1: katalog odbioru tylko z allowlisty (realpath)', async () => {
    const { checkTestDir } = await imp('narzedzia/katalog-testowy.mjs');
    const { copyForAcceptance } = await imp('narzedzia/kopia-swiec-odbior.mjs');
    const base = H.tmp();
    const prod = path.join(base, 'trading-hq'), allowed = path.join(base, 'trading-hq-wt', 'backtest-dane'), other = path.join(base, 'inne');
    for (const d of [path.join(prod, 'chart-data'), allowed, other]) mkdirSync(d, { recursive: true });
    const opt = { allowed: [allowed], prod };
    assert.ok(checkTestDir(path.join(allowed, 'chart-data'), opt), 'cel w backtest-dane (jeszcze nieistniejący podkatalog)');
    assert.throws(() => checkTestDir(path.join(prod, 'chart-data'), opt), /produkcyjnej/);
    assert.throws(() => checkTestDir(path.join(prod, 'public', 'x'), opt), /produkcyjnej/);
    assert.throws(() => checkTestDir(other, opt), /poza dozwolonymi/);
    assert.throws(() => checkTestDir(path.join(base, 'trading-hq-wt'), opt), /poza dozwolonymi/, 'trading-hq-wt nie jest w trading-hq, ale też nie w allowliście');
    // junction w allowliście prowadzący do produkcji: odrzucony po realpath
    const link = path.join(allowed, 'skrot');
    let linked = false;
    try { symlinkSync(prod, link, 'junction'); linked = true; } catch { /* system bez dowiązań: przypadek pominięty */ }
    if (linked) assert.throws(() => checkTestDir(path.join(link, 'chart-data'), opt), /produkcyjnej/);
    // skrypt kopii: cel w (atrapie) produkcji z innym źródłem → odmowa, nic nie zapisane
    const src = path.join(base, 'zrodlo', 'chart-data');
    mkdirSync(path.join(src, 'candles', 'NQ'), { recursive: true });
    writeFileSync(path.join(src, 'candles', 'NQ', 'coverage.json'), '{}');
    await assert.rejects(copyForAcceptance({ src, dst: path.join(prod, 'chart-data'), ...opt }), /produkcyjnej/);
    if (linked) await assert.rejects(copyForAcceptance({ src, dst: path.join(link, 'chart-data'), ...opt }), /produkcyjnej/);
    assert.deepEqual(readdirSync(path.join(prod, 'chart-data')), [], 'atrapa produkcji bez zmian');
    const ok = await copyForAcceptance({ src, dst: path.join(allowed, 'chart-data'), ...opt });
    assert.equal(ok.copied, 1);
    // domyślna allowlista: katalog tymczasowy przechodzi, katalog w worktree nie
    assert.ok(checkTestDir(H.tmp()));
    assert.throws(() => checkTestDir(path.join(ROOT, 'x')), /poza dozwolonymi/);
    // start-test i backtest-e2e odmawiają katalogu spoza allowlisty, zanim cokolwiek uruchomią albo skasują
    const bad = 'R:/PROJEKTY/trading-hq-wt/nie-ma-katalogu-h1'; // poza allowlistą i poza produkcją, nie istnieje (nic się nie tworzy)
    const st = await H.run(path.join(ROOT, 'testy', 'start-test.mjs'), [], H.cleanEnv({ TEST_CONFIG_DIR: bad, TEST_PORT: '4933', ATRAPA_PORT: '4934' }));
    assert.equal(st.code, 2, st.err + st.out);
    assert.match(st.err, /poza dozwolonymi/);
    const e2e = await H.run(path.join(ROOT, 'testy', 'backtest-e2e.mjs'), [], H.cleanEnv({ TEST_CONFIG_DIR: bad, TEST_PORT: '4935', ATRAPA_PORT: '4936' }));
    assert.equal(e2e.code, 2, e2e.err + e2e.out);
    assert.match(e2e.err, /poza dozwolonymi/);
    assert.ok(!existsSync(bad), 'nic nie utworzone');
  });
};
