// po-be-04: wynik po BE przy trade'ach i w statystykach (public/js/po-be-widok.js, bt-staty.js, bt-journal-okno.js, app.js).
// [U] 04.11.2026 (decyzje przy zadaniu): typy «Wszystkie trzy»; statystyki «Procenty + R bez BE, per setup (Recommended)»; bez sesji «Osobny status „bez sesji” (Recommended)»; zapis «Tylko w aplikacji (Recommended)».
// [U] 04.11.2026 «jak zapisuje trade i journaluje jeszcze podczas jak nie poznalem przyszlych swiec w backtestingowej sesji to nnie powinny mi sie ujawniac wtedy»:
// dla Backtestu DOM statusu i statystyk jest identyczny, gdy TP albo SL leży tuż za granicą sesji (pending, te same sumy).
// Bez sieci i bez Notion: czyste funkcje, atrapa fetch, prawdziwy createAfterBe na atrapach magazynu i świec.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const utc = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000;
  const T0 = utc(2026, 11, 3, 15), END = utc(2026, 11, 3, 22);
  const view = () => imp('public/js/po-be-widok.js');
  const res = (status, extra = {}) => ({ status, at: null, rIfHeld: null, mfeR: null, hitSl: null, ...extra });

  test('po-be-04: afterBeLabel: tekst i ton dla każdego statusu', async () => {
    const { afterBeLabel } = await view();
    const L = (r) => afterBeLabel(r);
    assert.equal(L(res('tp', { rIfHeld: 2.3 })).text, 'Po BE: doszedłby do TP · +2,3R');
    assert.equal(L(res('sl', { rIfHeld: -1 })).text, 'Po BE: doszedłby do SL · −1R');
    assert.equal(L(res('open')).text, 'Po BE: nierozstrzygnięty');
    assert.equal(L(res('mfe', { mfeR: 1.8, hitSl: false })).text, 'Po BE: bez TP, przeszedł +1,8R');
    assert.match(L(res('mfe', { mfeR: 1.8, hitSl: true })).text, /^Po BE: bez TP, przeszedł \+1,8R/);
    assert.notEqual(L(res('mfe', { mfeR: 1.8, hitSl: true })).text, L(res('mfe', { mfeR: 1.8, hitSl: false })).text, 'dotknięcie SL jest widoczne');
    assert.equal(L(res('pending')).text, 'Po BE: czeka na świece');
    assert.equal(L(res('no-data')).text, 'Po BE: brak danych');
    assert.equal(L(res('no-levels')).text, 'Po BE: brak poziomów');
    assert.equal(L(res('no-session')).text, 'Po BE: bez sesji');
    for (const s of ['tp', 'sl', 'open', 'mfe', 'pending', 'no-data', 'no-levels', 'no-session']) {
      const l = L(res(s, { rIfHeld: 1, mfeR: 1 }));
      assert.ok(l.text && l.short && l.tone, `status ${s}: text, short i tone`);
    }
    // ten sam wygląd dla statusów bez wyniku: tylko ton neutralny
    assert.equal(L(res('pending')).tone, 'muted');
    assert.equal(L(res('no-session')).tone, 'muted');
    assert.equal(L(null).tone, 'muted', 'brak wyniku (jeszcze nie pobrano) nie rzuca');
  });

  test('po-be-04: tabela statystyk ze stałymi danymi: kafle, liczby osobno, R bez BE i faktyczne, tabela per setup', async () => {
    const { afterBeSection } = await view();
    const { afterBeStats } = await imp('public/js/po-be.js');
    const rows = [
      { setup: 'A', r: 0.02, afterBe: res('tp', { rIfHeld: 2 }) },
      { setup: 'A', r: -0.03, afterBe: res('tp', { rIfHeld: 3 }) },
      { setup: 'A', r: 0.0, afterBe: res('sl', { rIfHeld: -1 }) },
      { setup: 'B', r: 0.01, afterBe: res('open') },
      { setup: 'B', r: 0.0, afterBe: res('mfe', { mfeR: 1.5, hitSl: true }) },
      { setup: 'B', r: 0.0, afterBe: res('pending') },
      { setup: 'B', r: 0.0, afterBe: res('no-data') },
      { setup: 'B', r: 0.0, afterBe: res('no-levels') },
      { setup: 'B', r: 0.0, afterBe: res('no-session') },
    ];
    const html = afterBeSection(afterBeStats(rows));
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(html, /<section class="sec abe-sec"/);
    assert.match(text, /Wynik po BE/);
    // 9 trade'ów po BE; rozstrzygniętych (tp, sl, open) 4: tp 2 = 50%, sl 1 = 25%, open 1 = 25%
    assert.match(text, /9/);
    assert.match(text, /50%/);
    assert.match(text, /25%/);
    // R bez BE: +2 +3 −1 = +4R; faktycznie 0,02 − 0,03 + 0 = −0,01R (te same trade'y)
    assert.match(text, /\+4R/);
    assert.match(text, /−0,01R/);
    // liczby osobno: bez TP 1, czeka 1, brak danych 1, brak poziomów 1, bez sesji 1
    for (const k of ['Bez TP', 'Czeka na świece', 'Brak danych', 'Brak poziomów', 'Bez sesji']) assert.match(text, new RegExp(k), k);
    // tabela per setup: wiersze A i B
    assert.match(html, /<table[^>]*class="[^"]*abe-tab/);
    assert.match(html, /<td>A[ <]/);
    assert.match(html, /<td>B[ <]/);
    // poniżej 10 rozstrzygniętych: notka o małej próbie
    assert.match(text, /za mało do wniosków/);
  });

  test('po-be-04: 10 rozstrzygniętych i więcej: bez notki o małej próbie; zero trade\'ów: sekcja pusta; ładowanie i błąd sieci', async () => {
    const { afterBeSection } = await view();
    const { afterBeStats } = await imp('public/js/po-be.js');
    const ten = Array.from({ length: 10 }, (_, i) => ({ setup: 'A', r: 0, afterBe: res(i % 2 ? 'tp' : 'sl', { rIfHeld: i % 2 ? 2 : -1 }) }));
    assert.doesNotMatch(afterBeSection(afterBeStats(ten)), /za mało do wniosków/);
    assert.equal(afterBeSection(afterBeStats([])), '', 'bez trade\'ów po BE nie ma sekcji');
    const loading = afterBeSection(afterBeStats([]), { loading: true, total: 3 });
    assert.match(loading, /Liczę wynik po BE/);
    assert.match(loading, /aria-busy="true"|role="status"/);
    const err = afterBeSection(afterBeStats([]), { error: true, total: 3 });
    assert.match(err, /Nie udało się pobrać wyniku po BE/);
    // część wyników już jest, część jeszcze się ładuje: liczby widać, a ładowanie to osobna notka
    const mid = afterBeSection(afterBeStats(ten), { loading: true });
    assert.match(mid, /Liczę wynik po BE/);
    assert.match(mid, /<table/);
  });

  // ---- blokada przyszłości: DOM identyczny dla TP i SL tuż za granicą ----
  function minutes(over = {}) {
    const out = [];
    for (let t = T0, i = 0; t < END + 3 * 3600; t += 60, i++) { const [h, l] = over[i] || [100.5, 99.5]; out.push([t, 100, h, l, 100, 1]); }
    return out;
  }
  const fakeRange = (bars) => ({ readAfterBe(instrument, from, to) { const c = Math.floor(to / 60) * 60; return { m1: bars.filter((b) => b[0] >= from), s1: [], real1s: [], covered: c <= from || true }; } });
  const sessionDoc = (hw) => ({ v: 2, book: { hw, hwi: { NQ: hw } }, trades: [{ id: 't1', instrument: 'NQ', dir: 'long', entryPrice: 100, sl0: 99, tp: 102, exitT: T0 }] });
  async function svcFor(bars, hw) {
    const { createAfterBe } = await imp('lib/po-be.mjs');
    const docs = { 'bt-test0001': sessionDoc(hw) };
    return createAfterBe({ btStore: { read: (id) => docs[id] ?? null }, replayRange: fakeRange(bars), candles: { read() { throw new Error('zabronione'); } }, baseDir: H.tmp(), now: () => (END + 3600) * 1000 });
  }

  test('po-be-04: Backtest: TP i SL tuż za granicą dają identyczny DOM wiersza, tabeli i sekcji statystyk (pending, te same sumy)', async () => {
    const { afterBeLabel, afterBeSection, afterBeRows, createAfterBeStore } = await view();
    const { afterBeStats } = await imp('public/js/po-be.js');
    const out = [];
    for (const over of [{ 10: [103, 100] }, { 10: [100.5, 98] }]) {
      const svc = await svcFor(minutes(over), T0 + 600);
      const store = createAfterBeStore({ fetchImpl: async (url, o) => ({ ok: true, status: 200, json: async () => svc.resolve(JSON.parse(o.body).items) }) });
      const trades = [{ id: 'p1', typ: 'Backtest', btSession: 'Sesja [bt-test0001/t1]', r: 0, be: 100, counted: true, setup: 'S1', date: '2026-11-03' }];
      const rows = afterBeRows(trades, { typ: 'Backtest' });
      await store.ensure(rows);
      const results = rows.map((x) => ({ setup: x.setup, r: x.r, afterBe: store.get(x.key) }));
      out.push({ label: afterBeLabel(results[0].afterBe), html: afterBeSection(afterBeStats(results)), status: results[0].afterBe.status });
    }
    assert.equal(out[0].status, 'pending');
    assert.equal(out[0].status, out[1].status);
    assert.equal(JSON.stringify(out[0].label), JSON.stringify(out[1].label));
    assert.equal(out[0].html, out[1].html, 'DOM sekcji bajt w bajt');
    assert.doesNotMatch(out[0].html, /[1-9]\d*%/, 'pending nie wchodzi do procentów');
    // po przesunięciu granicy wynik się pojawia
    const svc = await svcFor(minutes({ 10: [103, 100] }), T0 + 661);
    const r = (await svc.resolve([{ key: 'bt-test0001/t1', typ: 'Backtest' }])).results['bt-test0001/t1'];
    assert.equal(r.status, 'tp');
  });

  test('po-be-04: dashboard: filtr Typ zmienia zbiór; niekwalifikujący się trade nie ma wiersza; wiersze mają klucz, setup i R', async () => {
    const { afterBeRows } = await view();
    const base = { counted: true, date: '2026-11-03', instrument: 'NQ', dir: 'Long', entryPrice: 100, sl: 99, tp: 102, at: Date.UTC(2026, 10, 3, 15) , dur: 5, contract: 'NQZ6' };
    const trades = [
      { ...base, id: 'live-1', typ: 'Live', r: 0.02, be: 100, setup: 'A' },
      { ...base, id: 'live-2', typ: 'Live', r: 1.5, be: 100, setup: 'A' },
      { ...base, id: 'live-3', typ: 'Live', r: 0.0, be: null, setup: 'A' },
      { ...base, id: 'pap-1', typ: 'Niewzięty', r: 0.0, be: 100, setup: 'B' },
      { ...base, id: 'bt-1', typ: 'Backtest', r: 0.0, be: 100, btSession: 'S [bt-abcdef123456/t4]', setup: 'C' },
      { ...base, id: 'bt-2', typ: 'Backtest', r: 0.0, be: 100, btSession: '', setup: 'C' },
      { ...base, id: 'bt-3', typ: 'Backtest', r: 0.0, be: 100, btSession: 'S [bt-abcdef123456/t5]', counted: false },
    ];
    const keys = (typ) => afterBeRows(trades, { typ }).map((x) => x.key);
    assert.deepEqual(keys('Live'), ['live-1'], 'tylko BE z polem BE i wynikiem w marginesie; trade z R 1,5 i bez pola BE nie ma wiersza');
    assert.deepEqual(keys('Niewzięty'), ['pap-1']);
    assert.equal(keys('Backtest').length, 2);
    assert.ok(keys('Backtest').includes('bt-abcdef123456/t4'));
    const live = afterBeRows(trades, { typ: 'Live' })[0];
    assert.equal(live.setup, 'A'); assert.equal(live.r, 0.02);
    // Backtest bez znacznika: lokalny no-session, bez żądania; ze znacznikiem: tylko { key, typ }
    const b = afterBeRows(trades, { typ: 'Backtest' });
    const withMark = b.find((x) => x.key === 'bt-abcdef123456/t4'), noMark = b.find((x) => x.key !== 'bt-abcdef123456/t4');
    assert.deepEqual(withMark.item, { key: 'bt-abcdef123456/t4', typ: 'Backtest' });
    assert.equal(noMark.item, null);
    assert.equal(noMark.local.status, 'no-session');
  });

  test('po-be-04: Live i Paper: żądanie niesie at i contract (kontrakt przy rolowaniu), czasy w ms, typ Niewzięty dla Paper; nieobsługiwany instrument nie idzie do serwera', async () => {
    const { afterBeRows } = await view();
    const at = Date.UTC(2026, 10, 3, 15);
    const mk = (o) => ({ counted: true, date: '2026-11-03', typ: 'Live', r: 0, be: 100, instrument: 'NQ', dir: 'Short', entryPrice: 101, sl: 102, tp: 99, at, dur: 7, contract: 'NQZ6', setup: 'A', ...o });
    const [lv] = afterBeRows([mk({ id: 'x1' })], { typ: 'Live' });
    assert.deepEqual(lv.item, { key: 'x1', typ: 'Live', instrument: 'NQ', contract: 'NQZ6', dir: 'Short', entryPrice: 101, sl: 102, tp: 99, exitAt: at + 7 * 60000, at });
    const [pp] = afterBeRows([mk({ id: 'x2', typ: 'Niewzięty' })], { typ: 'Niewzięty' });
    assert.equal(pp.item.typ, 'Paper', 'serwer zna typ Paper, pole Typ w dashboardzie to Niewzięty');
    const [eur] = afterBeRows([mk({ id: 'x3', instrument: 'EURUSD' })], { typ: 'Live' });
    assert.equal(eur.item, null);
    assert.equal(eur.local.status, 'no-data');
    const [noex] = afterBeRows([mk({ id: 'x4', dur: null })], { typ: 'Live' });
    assert.equal(noex.item.exitAt, null);
    const [badc] = afterBeRows([mk({ id: 'x5', contract: 'NQ Z6!' })], { typ: 'Live' });
    assert.equal(badc.item.contract, '');
  });

  test('po-be-04: fetchAfterBe i bufor: duplikaty usuwane, porcje nie większe niż AFTER_BE_CHUNK (50, limit serwera 500), pending nie jest buforowany na stałe, ostateczne tak; błąd sieci nie rzuca przy odświeżeniu', async () => {
    const { fetchAfterBe, createAfterBeStore, AFTER_BE_CHUNK } = await view();
    assert.ok(AFTER_BE_CHUNK > 0 && AFTER_BE_CHUNK <= 500, 'porcja nie większa niż limit serwera (500)');
    const calls = [];
    let mode = 'pending';
    const fetchImpl = async (url, o) => {
      const items = JSON.parse(o.body).items;
      calls.push({ url, n: items.length, keys: items.map((i) => i.key) });
      assert.equal(new Set(items.map((i) => i.key)).size, items.length, 'serwer odrzuca powtórzony klucz');
      assert.ok(items.length <= 500 && items.length <= AFTER_BE_CHUNK);
      assert.equal(o.headers['X-THQ'], '1');
      return { ok: true, status: 200, json: async () => ({ results: Object.fromEntries(items.map((i) => [i.key, { status: mode, at: null, rIfHeld: null, mfeR: null, hitSl: null }])) }) };
    };
    const items = Array.from({ length: 1203 }, (_, i) => ({ key: `bt-abcdef123456/t${(i % 1100) + 1}`, typ: 'Backtest' }));
    const m = await fetchAfterBe(items, { fetchImpl });
    assert.equal(m.size, 1100, 'duplikaty zebrane do jednego klucza');
    assert.equal(calls.reduce((a, c) => a + c.n, 0), 1100, 'wszystkie pozycje poszły, raz każda');
    assert.ok(calls.length >= Math.ceil(1100 / AFTER_BE_CHUNK) && calls.every((c) => c.n <= AFTER_BE_CHUNK));
    assert.equal(calls[0].url, '/api/after-be');
    // bufor
    calls.length = 0;
    const store = createAfterBeStore({ fetchImpl });
    const rows = [{ key: 'bt-abcdef123456/t1', item: { key: 'bt-abcdef123456/t1', typ: 'Backtest' } }, { key: 'ns:1', item: null, local: res('no-session') }];
    assert.equal(await store.ensure(rows), true, 'pierwsze pobranie zmienia stan');
    assert.equal(store.get('ns:1').status, 'no-session');
    assert.equal(calls.length, 1);
    assert.equal(await store.ensure(rows), false, 'drugi render bez odświeżenia nie pobiera ponownie (brak pętli)');
    assert.equal(calls.length, 1);
    assert.equal(await store.ensure(rows, { refresh: true }), false, 'odświeżenie pending, wynik ten sam: bez zmiany');
    assert.equal(calls.length, 2, 'pending odświeżany przy wejściu na widok');
    mode = 'tp';
    assert.equal(await store.ensure(rows, { refresh: true }), true);
    assert.equal(store.get('bt-abcdef123456/t1').status, 'tp');
    const n = calls.length;
    await store.ensure(rows, { refresh: true });
    assert.equal(calls.length, n, 'wynik ostateczny nie jest pobierany ponownie');
    // błąd sieci
    const bad = createAfterBeStore({ fetchImpl: async () => { throw new Error('offline'); } });
    assert.equal(await bad.ensure([rows[0]]), false);
    assert.equal(bad.failed(), true);
    assert.equal(bad.get('bt-abcdef123456/t1'), undefined);
    // wynik już pobierany równolegle nie jest zamawiany drugi raz
    calls.length = 0;
    const slow = createAfterBeStore({ fetchImpl: async (u, o) => { await new Promise((r) => setTimeout(r, 20)); return fetchImpl(u, o); } });
    const both = await Promise.all([slow.ensure(rows), slow.ensure(rows)]);
    assert.deepEqual(both, [true, true], 'drugie wywołanie czeka na trwające pobranie i też zgłasza zmianę (widok dorysuje komórkę)');
    assert.ok(slow.has('bt-abcdef123456/t1'));
    assert.equal(calls.length, 1, 'jedno pobranie naraz');
  });

  test('po-be-04: kwalifikacja: auto-BE z offsetem (be: false, beAt) kwalifikuje się jako „po BE”, zwykły SL w stracie nie', async () => {
    const { mergeBacktest } = await imp('public/js/bt-staty.js');
    const trade = (id, o) => ({ id, instrument: 'NQ', dir: 'Long', entryT: T0, exitT: T0 + 600, r: 0.03, pnl: 12, day: '2026-11-03', exits: [{ t: T0 + 600, reason: 'sl' }], be: false, ...o });
    const s = { id: 'bt-test0001', name: 'S', trades: [trade('t1', { beAt: 100.5 }), trade('t2', { be: true }), trade('t3', {}), trade('t4', { r: -1, beAt: 100.5 }), trade('t5', { beAt: 100.5, exits: [{ t: T0 + 600, reason: 'tp' }] })] };
    const m = new Map(mergeBacktest([], [s]).map((x) => [x.id, x]));
    assert.equal(m.get('t1').beHit, true, 'offset: be false, ale jest beAt');
    assert.equal(m.get('t2').beHit, true);
    assert.equal(m.get('t3').beHit, false, 'bez BE i bez beAt');
    assert.equal(m.get('t4').beHit, false, 'wynik poza marginesem BE');
    assert.equal(m.get('t5').beHit, false, 'wyjście celem, nie stopem');
  });

  test('po-be-04: statystyki backtestu: wiersze z bt-staty: beHit idzie do serwera jako { key, typ }, bez znacznika lokalny no-session', async () => {
    const { btAfterBeRows } = await view();
    const ts = [
      { src: 'local', id: 't1', key: 'bt-test0001/t1', session: 'bt-test0001', setup: 'A', r: 0.02, beHit: true },
      { src: 'notion', id: 'n1', key: 'bt-test0001/t2', session: 'bt-test0001', setup: 'A', r: 0.0, beHit: true },
      { src: 'notion', id: 'n2', key: null, session: null, setup: 'B', r: 0.0, beHit: true },
      { src: 'local', id: 't3', key: 'bt-test0001/t3', session: 'bt-test0001', setup: 'A', r: 2, beHit: false },
    ];
    const rows = btAfterBeRows(ts);
    assert.equal(rows.length, 3, 'trade bez beHit nie ma wiersza');
    assert.deepEqual(rows[0].item, { key: 'bt-test0001/t1', typ: 'Backtest' });
    assert.equal(rows[2].item, null);
    assert.equal(rows[2].local.status, 'no-session');
    assert.equal(rows[0].setup, 'A'); assert.equal(rows[0].r, 0.02);
  });

  test('po-be-04: źródła: wiersz Po BE w facts Journala i dashboardu, sekcja w statystykach, kolumna w tabeli, [U] i brak timera', () => {
    const jw = src('public/js/bt-journal-okno.js'), app = src('public/js/app.js'), sv = src('public/js/bt-staty-widok.js'), v = src('public/js/po-be-widok.js'), css = src('public/features.css'), st = src('public/js/bt-staty.js');
    assert.match(jw, /po-be-widok\.js/);
    assert.match(jw, /data-abe/, 'wiersz Po BE w faktach Journala');
    assert.match(app, /po-be-widok\.js/);
    assert.match(app, /afterBeRows/);
    assert.match(app, /data-abe/);
    assert.match(sv, /afterBeSection/);
    assert.match(sv, /btAfterBeRows/);
    assert.match(st, /isNum\(tr\.beAt\)/, 'rozszerzone beHit');
    assert.match(css, /\.abe-sec|\.abe\b/);
    const appAbe = app.slice(app.indexOf('wynik po BE (Live'), app.indexOf('const TABLE_CAP'));
    assert.ok(appAbe.length > 500, 'blok wyniku po BE w app.js');
    for (const f of [v, appAbe, jw, sv]) assert.doesNotMatch(f.replace(/\/\/[^\n]*/g, ''), /setInterval|setTimeout/, 'bez timera');
    for (const f of [v]) {
      assert.match(f, /\[U\] 04\.11\.2026/);
      assert.match(f, /Wszystkie trzy/);
      assert.match(f, /Procenty \+ R bez BE, per setup \(Recommended\)/);
      assert.match(f, /Osobny status „bez sesji” \(Recommended\)/);
      assert.match(f, /Tylko w aplikacji \(Recommended\)/);
    }
    assert.match(src('docs/plany/backtest/postep.md'), /wynik po BE przy trade'ach i w statystykach/i, 'wpis w postep.md');
    // Dashboard i Backtest nigdy nie liczą wyniku sami: w widoku nie ma importu resolveAfterBe
    assert.doesNotMatch(v, /resolveAfterBe/);
  });

  test('po-be-04: serwer oddaje pętlę w trakcie resolve (setImmediate innego zadania wykonuje się między pozycjami), wynik bez zmian', async () => {
    const { createAfterBe } = await imp('lib/po-be.mjs');
    const N = 60;
    const doc = { v: 2, book: { hw: END, hwi: { NQ: END } }, trades: Array.from({ length: N }, (_, i) => ({ id: `t${i + 1}`, instrument: 'NQ', dir: 'long', entryPrice: 100, sl0: 99, tp: 102, exitT: T0 })) };
    // atrapa odczytu: ok. 3 ms pracy synchronicznej na pozycję (jak odczyt z dysku)
    const slow = { readAfterBe(instrument, from, to) { const t0 = performance.now(); while (performance.now() - t0 < 3) { /* praca */ } const c = Math.floor(to / 60) * 60; return { m1: minutes({ 5: [103, 100] }).filter((b) => b[0] >= from), s1: [], real1s: [], covered: c <= from || true }; } };
    const svc = createAfterBe({ btStore: { read: () => doc }, replayRange: slow, candles: { read() { throw new Error('zabronione'); } }, baseDir: H.tmp(), now: () => (END + 3600) * 1000 });
    let ticks = 0, maxGap = 0, last = performance.now(), run = true;
    const spin = () => { if (!run) return; const n = performance.now(); maxGap = Math.max(maxGap, n - last); last = n; ticks++; setImmediate(spin); };
    setImmediate(spin);
    const p = svc.resolve(Array.from({ length: N }, (_, i) => ({ key: `bt-test0001/t${i + 1}`, typ: 'Backtest' })));
    assert.ok(p instanceof Promise, 'resolve jest asynchroniczne');
    const out = await p;
    run = false;
    assert.equal(Object.keys(out.results).length, N);
    assert.equal(out.results['bt-test0001/t1'].status, 'tp');
    assert.ok(ticks >= 5, `pętla działała w trakcie resolve (ticków: ${ticks})`);
    assert.ok(maxGap < 100, `najdłuższa przerwa pętli ${maxGap.toFixed(0)} ms (próg 100)`);
    // błąd walidacji nadal odrzuca zanim cokolwiek zostanie odczytane
    await assert.rejects(() => svc.resolve([{ key: 'zly', typ: 'Backtest' }]), (e) => e.status === 400);
  });

  test('po-be-04: błąd pobrania: osobna etykieta (nie „czeka na świece”), po błędzie klucz nie jest pytany częściej niż co 30 s', async () => {
    const { afterBeLabel, createAfterBeStore } = await view();
    const e = afterBeLabel({ status: 'error' });
    assert.equal(e.text, 'Po BE: nie udało się pobrać');
    assert.notEqual(e.text, afterBeLabel(res('pending')).text);
    let clock = 1000, calls = 0;
    const store = createAfterBeStore({ now: () => clock, fetchImpl: async () => { calls++; throw new Error('offline'); } });
    const rows = [{ key: 'bt-abcdef123456/t1', item: { key: 'bt-abcdef123456/t1', typ: 'Backtest' } }];
    await store.ensure(rows);
    assert.equal(calls, 1); assert.equal(store.failed(), true);
    await store.ensure(rows); await store.ensure(rows, { refresh: true });
    assert.equal(calls, 1, 'render po błędzie nie ponawia żądania');
    assert.equal(store.failed(), true, 'błąd nadal widoczny');
    clock += 31000;
    await store.ensure(rows);
    assert.equal(calls, 2, 'po 30 s ponowna próba');
  });

  test('po-be-04: kwota R w etykiecie ma osobny, neutralny znacznik, a znaczenie wyniku jest w podpowiedzi (SL: BE ochroniło, TP: BE kosztowało)', async () => {
    const { afterBeBadge, afterBeFact } = await view();
    const sl = afterBeBadge(res('sl', { rIfHeld: -1 }), { short: true });
    assert.match(sl, /abe-pos/);
    assert.match(sl, /<span class="abe-r">−1R<\/span>/);
    assert.match(sl, /title="BE ochroniło przed stratą/);
    const tp = afterBeFact(res('tp', { rIfHeld: 2.3 }));
    assert.match(tp, /abe-be/);
    assert.match(tp, /<span class="abe-r">\+2,3R<\/span>/);
    assert.match(tp, /title="BE kosztowało zysk/);
    assert.doesNotMatch(afterBeBadge(res('pending')), /abe-r/);
  });

  test('po-be-04: zasiew zrzutów (testy/bt-po-be-seed.js): R bez BE liczone ręcznie dla każdego setupu (TP 2 do 3R, SL 20 pkt)', async () => {
    const { seedTrades, expectedR, ENTRY } = await imp('testy/bt-po-be-seed.js');
    const { resolveAfterBe, afterBeStats } = await imp('public/js/po-be.js');
    const trades = seedTrades(T0, T0 + 1200);
    // ścieżka: po wyjściu cena idzie o 70 pkt w górę i nie schodzi poniżej wejścia - 1: longi dochodzą do TP, shorty do SL
    const bars = Array.from({ length: 120 }, (_, i) => [T0 + 1200 + 60 + i * 60, ENTRY, i === 5 ? ENTRY + 70 : ENTRY + 1, ENTRY - 1, ENTRY, 1]);
    const rows = trades.map((x) => {
      const long = x.dir === 'Long';
      const a = resolveAfterBe({ dir: x.dir.toLowerCase(), entry: x.entryPrice, sl: x.sl0, tp: x.tp, exitT: x.exitT, exitPrecise: false, end: END, limit: END, bars, secs: [], covered: true });
      assert.equal(a.status, long ? 'tp' : 'sl', `${x.id} ${x.dir}`);
      assert.ok(Math.abs(a.rIfHeld - expectedR(x, a.status)) < 1e-9, `${x.id}: rIfHeld zgodne z ręcznym`);
      return { setup: x.setup, r: x.r, afterBe: a };
    });
    const st = afterBeStats(rows);
    const by = Object.fromEntries(st.bySetup.map((s) => [s.setup, s]));
    // ręcznie: Breakout longi 2 + 2,5 + 3 = 7,5 i short -1 = +6,5R; Pullback longi 2 + 3 = 5, shorty -2 = +3R; Reversal longi 2 + 2,5 = 4,5, shorty -2 = +2,5R
    assert.ok(Math.abs(by.Breakout.sumIfHeld - 6.5) < 1e-9);
    assert.ok(Math.abs(by.Pullback.sumIfHeld - 3) < 1e-9);
    assert.ok(Math.abs(by.Reversal.sumIfHeld - 2.5) < 1e-9);
    assert.ok(Math.abs(st.sumIfHeld - 12) < 1e-9);
    assert.ok(Math.abs(st.sumActual - 12 * 0.02) < 1e-9, 'faktyczne R tych samych trade\'ów');
    assert.ok(src('testy/po-be-04-zrzuty.html').includes('bt-po-be-seed.js'), 'strona zrzutów używa tego zasiewu');
  });
};
