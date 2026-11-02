// usun-trade (1.6.1): usuwanie trade'ów z cofnięciem, w backteście (szuflada Historia, okno Journala) i w dzienniku (okno szczegółów, formularz).
// [U] 2026-11-01 «DODAJ takze mozliwosc usuwania ogolnie tradow bo nie ma takiej opcji» + «Backtest i dziennik» + «Archiwum Notion + Cofnij»:
// strona trade'a w Notion trafia do archiwum (in_trash), nie jest kasowana na stałe, a Cofnij przywraca ją i trade w aplikacji.
// Wyłącznie atrapa Notion (testy/atrapa-notion.mjs, rozszerzona o archiwizację i przywracanie stron w testach poniżej) i dane syntetyczne; prawdziwe Notion nie dostaje żądań.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rig, trade, session, SID, envDir } from './bt-notion-rig.mjs';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const pageOf = async (R, id) => Object.values(await R.A.dump()).flatMap((d) => d.pages).find((p) => p.id === id);
  const patches = (R) => R.calls.filter((c) => c.startsWith('PATCH')).length;
  const liveRows = async (R) => (await R.data.getPayload(true)).data.trades;
  const rejects = async (p, status, code) => {
    let err = null;
    try { await p; } catch (e) { err = e; }
    assert.ok(err, 'oczekiwano błędu');
    assert.equal(err.status, status, `${err.message}`);
    if (code) assert.equal(err.code, code);
    return err;
  };

  test('usun-trade: numer trade\'a nie wraca po usunięciu (doc.tradeSeq)', async () => {
    const { nextTradeId } = await lib('public/js/bt-journal.js');
    assert.equal(nextTradeId([{ id: 't1' }, { id: 't2' }]), 't3');
    assert.equal(nextTradeId([{ id: 't1' }], 2), 't3', 'usunięty t2 nie jest nadawany ponownie');
    assert.equal(nextTradeId([], 7), 't8');
    assert.equal(nextTradeId([{ id: 't9' }], 3), 't10', 'wyższy numer z trade\'ów wygrywa');
    assert.equal(nextTradeId([], undefined), 't1');
    const rp = src('public/js/bt-replay.js');
    assert.match(rp, /nextTradeId\(doc\.trades, doc\.tradeSeq\)/);
    assert.match(rp, /doc\.tradeSeq = Math\.max/);
  });

  test('usun-trade: księga usuniętych trade\'ów w magazynie (zapis, odczyt, sprzątanie, walidacja identyfikatorów, poza listą sesji)', async () => {
    const { createBacktestStore } = await lib('lib/backtest-store.mjs');
    const base = H.tmp();
    let clock = Date.UTC(2026, 10, 1, 10, 0, 0);
    const st = createBacktestStore({ baseDir: base, now: () => clock });
    st.save('bt-ksiega001', session([trade(1), trade(2)], { id: 'bt-ksiega001' }), 0);
    const f1 = st.ledgerPut('bt-ksiega001', 't1', { pageId: 'x', trade: trade(1) });
    assert.match(f1, /^bt-ksiega001-t1-20261101T100000Z\.json$/);
    clock += 5000;
    st.ledgerPut('bt-ksiega001', 't1', { pageId: 'y', trade: trade(1) });
    assert.equal(st.ledgerGet('bt-ksiega001', 't1').pageId, 'y', 'ostatni wpis wygrywa');
    assert.equal(st.ledgerGet('bt-ksiega001', 't2'), null);
    st.ledgerDrop('bt-ksiega001', 't1');
    assert.equal(st.ledgerGet('bt-ksiega001', 't1').pageId, 'x', 'sprzątany jest tylko ostatni wpis');
    st.ledgerDrop('bt-ksiega001', 't1');
    assert.equal(st.ledgerGet('bt-ksiega001', 't1'), null);
    assert.deepEqual(st.list().map((s) => s.id), ['bt-ksiega001'], 'księga nie jest sesją');
    assert.ok(!existsSync(path.join(base, 'backtest', 'sessions', 'usuniete')) || readdirSync(path.join(base, 'backtest', 'sessions', 'usuniete')).length === 0);
    assert.equal(st.sessionTrade('bt-ksiega001', 't2').id, 't2');
    assert.equal(st.sessionTrade('bt-ksiega001', 't9'), null);
    for (const bad of ['../x', 'bt-../x', 'BT-1', '', null]) assert.throws(() => st.ledgerPut(bad, 't1', {}), (e) => e.status === 400, String(bad));
    for (const bad of ['../t1', 't', 'T1', 't1/../x', 't12345678901', '', null, 5]) {
      assert.throws(() => st.ledgerPut('bt-ksiega001', bad, {}), (e) => e.status === 400 && e.code === 'bad-trade-id', String(bad));
      assert.throws(() => st.ledgerGet('bt-ksiega001', bad), (e) => e.status === 400, String(bad));
    }
  });

  test('usun-trade: writer.trashTradePage: archiwum Notion i przywrócenie, strona obcej bazy odrzucona, ponowienie bez błędu, odmowa guard', async () => {
    const R = await rig(H, assert, ROOT, 5640);
    try {
      R.store.save(SID, session([trade(1), trade(2)]), 0);
      assert.equal((await R.sync.push({ sessionId: SID })).sent, 2);
      const id1 = R.tr('t1').notion.id, id2 = R.tr('t2').notion.id;
      assert.equal((await pageOf(R, id1)).in_trash, false);
      const r = await R.writer.trashTradePage(id1, true);
      assert.deepEqual([r.ok, r.already], [true, false]);
      assert.equal((await pageOf(R, id1)).in_trash, true, 'strona w archiwum Notion (in_trash), nie skasowana');
      assert.ok(await pageOf(R, id1), 'strona nadal istnieje');
      const live1 = (await liveRows(R)).map((x) => x._id);
      assert.ok(!live1.includes(id1) && live1.includes(id2), 'zapytanie o trade-y nie zwraca strony z archiwum, inne zostają');
      assert.equal((await R.writer.trashTradePage(id1, true)).already, true, 'drugi raz: sukces bez PATCH');
      const n = patches(R);
      await R.writer.trashTradePage(id1, true);
      assert.equal(patches(R), n, 'bez zbędnego PATCH');
      const back = await R.writer.trashTradePage(id1, false);
      assert.deepEqual([back.ok, back.already], [true, false]);
      assert.equal((await pageOf(R, id1)).in_trash, false);
      assert.equal((await R.writer.trashTradePage(id1, false)).already, true);
      const live2 = (await liveRows(R)).map((x) => x._id);
      assert.ok(live2.includes(id1) && live2.includes(id2), 'po przywróceniu obie strony są w zapytaniu');
      // strona z innej bazy (konto) nie jest trade'em: 403 i nic się nie zmienia
      const kontoId = (await R.data.getPayload(true)).data.konta[0]._id;
      assert.ok(kontoId, 'atrapa ma konto');
      const before = patches(R);
      const e = await rejects(R.writer.trashTradePage(kontoId, true), 403);
      assert.equal(e.code, 'foreign');
      assert.equal(patches(R), before, 'obca strona nietknięta');
      // identyfikator spoza wzorca: walidacja przed jakimkolwiek żądaniem
      const calls = R.calls.length;
      for (const bad of ['../x', 'abc', '', null, 'x'.repeat(36)]) await assert.rejects(R.writer.trashTradePage(bad, true), (x) => x.status === 400, String(bad));
      assert.equal(R.calls.length, calls, 'zły identyfikator nie dociera do Notion');
      // guard może odmówić: strona zostaje taka, jaka była
      await assert.rejects(R.writer.trashTradePage(id2, true, { guard: () => { throw Object.assign(new Error('nie'), { status: 409, code: 'backtest-owned' }); } }), (x) => x.code === 'backtest-owned');
      assert.equal((await pageOf(R, id2)).in_trash, false);
    } finally { R.A.stop(); }
  });

  test('usun-trade: błędy Notion przy archiwizacji i przywracaniu: jasny komunikat z kodem, strona bez zmian, bez tokenu w komunikacie', async () => {
    const R = await rig(H, assert, ROOT, 5641);
    try {
      R.store.save(SID, session([trade(1)]), 0);
      assert.equal((await R.sync.push({ sessionId: SID })).sent, 1);
      const id = R.tr('t1').notion.id;
      const cases = [['before-net', 503, 'notion-offline', /połączyć z Notion.*trade nie został usunięty/], ['before-404', 404, 'notion-missing', /nie znalazł strony.*trade nie został usunięty/],
        ['before-403', 403, 'notion-denied', /uprawnień.*trade nie został usunięty/], ['before-401', 502, 'notion-denied', /Token Notion.*trade nie został usunięty/], ['before-429', 503, 'notion-offline', /połączyć z Notion/]];
      for (const [fault, status, code, re] of cases) {
        R.fault = (m, p) => (m === 'PATCH' && p === `/v1/pages/${id}` ? fault : null);
        const e = await rejects(R.writer.trashTradePage(id, true), status, code);
        assert.match(e.message, re, fault);
        assert.doesNotMatch(e.message, /secret|Bearer|token=/i);
        assert.equal((await pageOf(R, id)).in_trash, false, `${fault}: strona nietknięta`);
      }
      // błąd już przy odczycie strony (GET) mapuje się tak samo
      R.fault = (m, p) => (m === 'GET' && p === `/v1/pages/${id}` ? 'before-net' : null);
      await rejects(R.writer.trashTradePage(id, true), 503, 'notion-offline');
      // przywracanie: komunikat o tym, że trade nie wrócił
      R.fault = null;
      await R.writer.trashTradePage(id, true);
      R.fault = (m, p) => (m === 'PATCH' && p === `/v1/pages/${id}` ? 'before-net' : null);
      const e = await rejects(R.writer.trashTradePage(id, false), 503, 'notion-offline');
      assert.match(e.message, /trade nie wrócił z archiwum Notion/);
      assert.equal((await pageOf(R, id)).in_trash, true, 'po nieudanym przywróceniu strona zostaje w archiwum');
      // błąd Notion z tokenem w treści i zwykły wyjątek z tokenem: komunikat nie może ich powtórzyć (odpowiedź HTTP bierze e.message)
      R.fault = null;
      await R.writer.trashTradePage(id, false);
      for (const fault of ['before-400tok', 'before-plain']) {
        R.fault = (m, p) => (m === 'PATCH' && p === `/v1/pages/${id}` ? fault : null);
        const e2 = await rejects(R.writer.trashTradePage(id, true), fault === 'before-400tok' ? 400 : 500);
        assert.doesNotMatch(`${e2.message} ${e2.code}`, /secret_abc123XYZ|Bearer|token=/i, fault);
        assert.match(e2.message, /trade nie został usunięty/, fault);
        const e3 = await rejects(R.sync.trashTrade({ sessionId: SID, tradeId: 't1' }), fault === 'before-400tok' ? 400 : 500);
        assert.doesNotMatch(`${e3.message} ${e3.code}`, /secret_abc123XYZ|Bearer|token=/i, `sync ${fault}`);
        assert.equal((await pageOf(R, id)).in_trash, false, `${fault}: strona bez zmian`);
      }
    } finally { R.A.stop(); }
  });

  test('usun-trade: backtest, strona w Notion: archiwum, księga, usunięcie z pliku sesji, Cofnij przywraca stronę i trade bez dubla', async () => {
    const R = await rig(H, assert, ROOT, 5642);
    try {
      R.store.save(SID, session([trade(1), trade(2), trade(3)]), 0);
      assert.equal((await R.sync.push({ sessionId: SID })).sent, 3);
      const id1 = R.tr('t1').notion.id, id2 = R.tr('t2').notion.id;
      const pagesBefore = (await R.pages()).length;
      const r = await R.sync.trashTrade({ sessionId: SID, tradeId: 't1' });
      assert.deepEqual([r.ok, r.trashed, r.pageId], [true, true, id1]);
      assert.equal((await pageOf(R, id1)).in_trash, true, 'strona w archiwum Notion');
      assert.equal((await pageOf(R, id2)).in_trash, false, 'inne strony nietknięte');
      const led = R.store.ledgerGet(SID, 't1');
      assert.equal(led.pageId, id1);
      assert.equal(led.trade.id, 't1');
      assert.equal(led.trade.notes, 'notatka 1', 'księga trzyma pełny trade (do ręcznego odzyskania)');
      assert.ok(R.store.read(SID).trades.some((x) => x.id === 't1'), 'plik sesji zmienia przeglądarka, nie serwer (kontrola wersji rev)');
      // przeglądarka zapisuje sesję bez trade'a; wysyłka nie wskrzesza ani nie dubluje strony
      R.edit((d) => { d.trades = d.trades.filter((x) => x.id !== 't1'); d.tradeSeq = 3; });
      const posts = R.calls.filter((c) => c === 'POST /v1/pages').length;
      const p = await R.sync.push({ sessionId: SID });
      assert.deepEqual([p.sent, p.failed.length], [0, 0]);
      assert.equal(R.calls.filter((c) => c === 'POST /v1/pages').length, posts, 'brak nowej strony');
      assert.equal(R.store.read(SID).trades.length, 2);
      // Cofnij: strona wraca, trade wraca do pliku, wysyłka rozpoznaje stronę po znaczniku (bez drugiej)
      const u = await R.sync.untrashTrade({ sessionId: SID, tradeId: 't1' });
      assert.deepEqual([u.ok, u.restored, u.pageId], [true, true, id1]);
      assert.equal((await pageOf(R, id1)).in_trash, false);
      assert.equal(R.store.ledgerGet(SID, 't1'), null, 'księga posprzątana po przywróceniu');
      R.edit((d) => { d.trades.splice(0, 0, { ...led.trade, notion: { id: null, state: 'pending', error: null } }); });
      assert.equal(R.tr('t1').notion.id, null, 'zapis z przeglądarki zaczyna od stanu do wysłania');
      const p2 = await R.sync.push({ sessionId: SID });
      assert.deepEqual([p2.sent, p2.failed.length, p2.pending], [1, 0, 0], JSON.stringify(p2.failed));
      assert.equal(R.tr('t1').notion.id, id1, 'ta sama strona');
      assert.equal(R.tr('t1').notion.state, 'sent');
      assert.equal((await R.pages()).length, pagesBefore, 'żadnej nowej strony');
      assert.equal(R.calls.filter((c) => c === 'POST /v1/pages').length, posts);
      const live3 = (await liveRows(R)).map((x) => x._id);
      assert.ok([id1, id2, R.tr('t3').notion.id].every((x) => live3.includes(x)), 'wszystkie trzy strony są widoczne');
      // drugi Cofnij: nie ma czego przywracać; trade już jest w sesji
      await rejects(R.sync.untrashTrade({ sessionId: SID, tradeId: 't1' }), 409, 'exists');
      await rejects(R.sync.untrashTrade({ sessionId: SID, tradeId: 't2' }), 409, 'exists');
    } finally { R.A.stop(); }
  });

  test('usun-trade: backtest, trade niewysłany do Notion: usunięcie tylko lokalne, zero żądań do Notion, Cofnij bez Notion', async () => {
    const R = await rig(H, assert, ROOT, 5643);
    try {
      R.store.save(SID, session([trade(1), trade(2)]), 0);
      const calls = R.calls.length;
      const r = await R.sync.trashTrade({ sessionId: SID, tradeId: 't2' });
      assert.deepEqual([r.ok, r.trashed, r.pageId], [true, false, null]);
      assert.equal(R.calls.length, calls, 'Notion nie dostał żadnego żądania');
      assert.equal(R.store.ledgerGet(SID, 't2').pageId, null);
      R.edit((d) => { d.trades = d.trades.filter((x) => x.id !== 't2'); });
      const u = await R.sync.untrashTrade({ sessionId: SID, tradeId: 't2' });
      assert.deepEqual([u.ok, u.restored, u.pageId], [true, false, null]);
      assert.equal(R.calls.length, calls, 'Cofnij też bez Notion');
    } finally { R.A.stop(); }
  });

  test('usun-trade: backtest, otwarta pozycja ani nieznany trade nie dają się usunąć, zły identyfikator 400, obca sesja 404', async () => {
    const R = await rig(H, assert, ROOT, 5644);
    try {
      R.store.save(SID, session([trade(1), trade(2, { exitT: null, exits: [] })]), 0);
      await rejects(R.sync.trashTrade({ sessionId: SID, tradeId: 't2' }), 409, 'open');
      await rejects(R.sync.trashTrade({ sessionId: SID, tradeId: 't9' }), 404, 'no-trade');
      await rejects(R.sync.trashTrade({ sessionId: SID, tradeId: '../t1' }), 400, 'bad-trade-id');
      await rejects(R.sync.trashTrade({ sessionId: SID, tradeId: null }), 400, 'bad-trade-id');
      await rejects(R.sync.trashTrade({ sessionId: '../x', tradeId: 't1' }), 400, 'bad-id');
      await rejects(R.sync.trashTrade({ sessionId: 'bt-nieistnieje', tradeId: 't1' }), 404);
      await rejects(R.sync.untrashTrade({ sessionId: SID, tradeId: 't1' }), 409, 'exists');
      await rejects(R.sync.untrashTrade({ sessionId: SID, tradeId: 't5' }), 404, 'no-ledger');
      assert.equal(R.store.ledgerGet(SID, 't2'), null, 'odmowa nie zostawia wpisu w księdze');
      assert.equal(R.calls.filter((c) => c.startsWith('PATCH')).length, 0);
    } finally { R.A.stop(); }
  });

  test('usun-trade: backtest, błąd Notion (sieć, 404, 403, czas) nie zostawia stanu połowicznego: księga sprzątnięta, sesja i strona bez zmian, 404 ma osobny kod', async () => {
    const R = await rig(H, assert, ROOT, 5645, { timeoutMs: 400 });
    try {
      R.store.save(SID, session([trade(1)]), 0);
      assert.equal((await R.sync.push({ sessionId: SID })).sent, 1);
      const id = R.tr('t1').notion.id;
      const bytes = readFileSync(path.join(R.dir, 'chart-data', 'backtest', 'sessions', `${SID}.json`));
      for (const [fault, status, code] of [['before-net', 503, 'notion-offline'], ['before-404', 404, 'notion-missing'], ['before-403', 403, 'notion-denied'], ['hang', 503, 'notion-offline']]) {
        R.fault = (m, p) => (m === 'PATCH' && p === `/v1/pages/${id}` ? fault : null);
        const e = await rejects(R.sync.trashTrade({ sessionId: SID, tradeId: 't1' }), status, code);
        assert.match(e.message, /trade nie został usunięty/, fault);
        assert.equal(R.store.ledgerGet(SID, 't1'), null, `${fault}: księga posprzątana`);
        assert.equal((await pageOf(R, id)).in_trash, false, `${fault}: strona w Notion bez zmian`);
        assert.ok(readFileSync(path.join(R.dir, 'chart-data', 'backtest', 'sessions', `${SID}.json`)).equals(bytes), `${fault}: plik sesji bez zmian`);
      }
      // po 404 użytkownik może zgodzić się na usunięcie tylko lokalne: Notion nie dostaje żądania
      R.fault = () => 'before-404';
      const calls = R.calls.length;
      const r = await R.sync.trashTrade({ sessionId: SID, tradeId: 't1', skipNotion: true });
      assert.deepEqual([r.ok, r.trashed, r.pageId], [true, false, null]);
      assert.equal(R.calls.length, calls);
      assert.equal(R.store.ledgerGet(SID, 't1').pageId, null, 'Cofnij po usunięciu lokalnym nie rusza Notion');
      R.fault = null;
      // po błędzie wszystko działa jak przedtem: zwykłe usunięcie przechodzi
      R.store.ledgerDrop(SID, 't1');
      const ok = await R.sync.trashTrade({ sessionId: SID, tradeId: 't1' });
      assert.equal(ok.trashed, true);
      assert.equal((await pageOf(R, id)).in_trash, true);
      // Cofnij z błędem Notion: trade nie wraca, strona zostaje w archiwum, wpis w księdze zostaje (można spróbować znowu)
      R.edit((d) => { d.trades = []; });
      R.fault = (m, p) => (m === 'PATCH' && p === `/v1/pages/${id}` ? 'before-net' : null);
      const e = await rejects(R.sync.untrashTrade({ sessionId: SID, tradeId: 't1' }), 503, 'notion-offline');
      assert.match(e.message, /trade nie wrócił z archiwum Notion/);
      assert.ok(R.store.ledgerGet(SID, 't1'), 'wpis księgi zostaje');
      R.fault = null;
      assert.equal((await R.sync.untrashTrade({ sessionId: SID, tradeId: 't1' })).restored, true, 'druga próba przechodzi');
    } finally { R.A.stop(); }
  });

  test('usun-trade: backtest, zerwana wysyłka (próba POST bez zapisanego id): strona jest szukana po znaczniku i trafia do archiwum, nie zostaje osierocona', async () => {
    const R = await rig(H, assert, ROOT, 5646);
    try {
      R.store.save(SID, session([trade(1)]), 0);
      assert.equal((await R.sync.push({ sessionId: SID })).sent, 1);
      const id = R.tr('t1').notion.id;
      R.store.setNotion(SID, 't1', { id: null, state: 'pending', error: 'Notion nie odpowiedział', postAt: R.clock - 1000 });
      assert.equal(R.tr('t1').notion.id, null);
      const r = await R.sync.trashTrade({ sessionId: SID, tradeId: 't1' });
      assert.deepEqual([r.trashed, r.pageId], [true, id], 'znaleziona po znaczniku w polu „Sesja backtestu”');
      assert.equal((await pageOf(R, id)).in_trash, true);
      // bez postAt (nigdy nie próbowano utworzyć strony) wyszukiwanie w Notion się nie odbywa
      R.store.ledgerDrop(SID, 't1');
      R.store.setNotion(SID, 't1', { id: null, state: 'pending', error: null });
      const calls = R.calls.length;
      const r2 = await R.sync.trashTrade({ sessionId: SID, tradeId: 't1' });
      assert.deepEqual([r2.trashed, r2.pageId], [false, null]);
      assert.equal(R.calls.length, calls);
    } finally { R.A.stop(); }
  });

  // ---- poprawki po trzech przeglądach (2.11.2026) ----
  test('usun-trade: księga sortuje sufiks numerycznie i bierze najnowszy wpis (-10 po -2), wpis po Cofnij trafia do restored/ i znika dopiero po zapisie sesji z trade\'em', async () => {
    const { createBacktestStore } = await lib('lib/backtest-store.mjs');
    const base = H.tmp();
    const st = createBacktestStore({ baseDir: base, now: () => Date.UTC(2026, 10, 2, 10, 0, 0) });
    st.save('bt-ksiega002', session([trade(1), trade(2)], { id: 'bt-ksiega002' }), 0);
    const names = [];
    for (let i = 0; i < 12; i++) names.push(st.ledgerPut('bt-ksiega002', 't1', { pageId: `p${i}`, trade: trade(1) }));
    assert.match(names[11], /Z-11\.json$/);
    assert.equal(st.ledgerGet('bt-ksiega002', 't1').pageId, 'p11', 'najnowszy wpis z tej samej sekundy (-11 po -2), nie ostatni alfabetycznie');
    st.ledgerDrop('bt-ksiega002', 't1');
    assert.equal(st.ledgerGet('bt-ksiega002', 't1').pageId, 'p10', 'sprzątany jest najnowszy');
    assert.deepEqual([...st.ledgerIds('bt-ksiega002')], ['t1']);
    // przeniesienie do restored/: wpis nie jest kasowany, główna księga go już nie widzi
    const rec = st.ledgerGet('bt-ksiega002', 't1');
    st.ledgerRestored('bt-ksiega002', 't1', rec.file);
    assert.ok(existsSync(path.join(base, 'backtest', 'removed-trades', 'restored', rec.file)), 'kopia w restored/');
    assert.equal(st.ledgerGet('bt-ksiega002', 't1').pageId, 'p9', 'następny wpis tego trade\'a');
    assert.equal(st.ledgerGet('bt-ksiega002', 't1', { restored: true }) && true, true);
    // zapis sesji, w której trade'a nie ma, nie sprząta restored/; zapis z trade'em tak
    const rdir = path.join(base, 'backtest', 'removed-trades', 'restored');
    const cur = st.read('bt-ksiega002');
    st.save('bt-ksiega002', { ...cur, trades: cur.trades.filter((x) => x.id !== 't1') }, cur.rev);
    assert.equal(readdirSync(rdir).length, 1, 'trade\'a nie ma w sesji: kopia zostaje');
    const cur2 = st.read('bt-ksiega002');
    st.save('bt-ksiega002', { ...cur2, trades: [trade(1), ...cur2.trades] }, cur2.rev);
    assert.equal(readdirSync(rdir).length, 0, 'po potwierdzonym zapisie sesji z trade\'em kopia jest sprzątnięta');
  });

  test('usun-trade: Cofnij: wpis księgi przeżywa do zapisu sesji (ponowienie po nieudanym zapisie), trade jeszcze w pliku sesji nie daje 409 a przywraca stronę', async () => {
    const R = await rig(H, assert, ROOT, 5647);
    try {
      R.store.save(SID, session([trade(1), trade(2)]), 0);
      assert.equal((await R.sync.push({ sessionId: SID })).sent, 2);
      const id1 = R.tr('t1').notion.id;
      await R.sync.trashTrade({ sessionId: SID, tradeId: 't1' });
      assert.equal((await pageOf(R, id1)).in_trash, true);
      // zapis sesji z przeglądarki się nie udał: trade nadal w pliku, strona w koszu. Cofnij naprawia ten rozjazd zamiast 409.
      const u = await R.sync.untrashTrade({ sessionId: SID, tradeId: 't1' });
      assert.deepEqual([u.ok, u.restored, u.inSession], [true, true, true]);
      assert.equal((await pageOf(R, id1)).in_trash, false, 'strona wróciła z kosza');
      assert.equal(R.tr('t1').notion.state, 'sent', 'trade w sesji zachował stan i id strony');
      // druga próba nie ma już co przywracać
      await rejects(R.sync.untrashTrade({ sessionId: SID, tradeId: 't1' }), 409, 'exists');
      // usunięcie, zapis bez trade'a, Cofnij; zapis z trade'em nie powiódł się: ponowny Cofnij nadal działa (kopia w restored/), strona już jest poza koszem
      await R.sync.trashTrade({ sessionId: SID, tradeId: 't2' });
      R.edit((d) => { d.trades = d.trades.filter((x) => x.id !== 't2'); });
      const u2 = await R.sync.untrashTrade({ sessionId: SID, tradeId: 't2' });
      assert.deepEqual([u2.ok, u2.restored], [true, true]);
      const u3 = await R.sync.untrashTrade({ sessionId: SID, tradeId: 't2' });
      assert.deepEqual([u3.ok, u3.restored, u3.again], [true, true, true], 'ponowienie po nieudanym zapisie sesji: wpis z restored/, strona bez zmian');
      assert.ok(R.store.ledgerGet(SID, 't2', { restored: true }), 'kopia istnieje do potwierdzenia zapisu');
      R.edit((d) => { d.trades.push({ ...trade(2), notion: { id: null, state: 'pending', error: null } }); });
      assert.equal(R.store.ledgerGet(SID, 't2', { restored: true }), null, 'zapis sesji z trade\'em sprząta kopię');
    } finally { R.A.stop(); }
  });

  test('usun-trade: wysyłka pomija trade z wpisem w księdze (usuwany nie dostaje nowej strony, także z błędem i po „Zapisz do Notion”)', async () => {
    const R = await rig(H, assert, ROOT, 5648);
    try {
      R.store.save(SID, session([trade(1, { notion: { id: null, state: 'pending', error: 'Notion nie odpowiedział', postAt: R.clock - 3_600_000 } })]), 0);
      const r = await R.sync.trashTrade({ sessionId: SID, tradeId: 't1' });
      assert.equal(r.trashed, false);
      const posts = R.calls.filter((c) => c === 'POST /v1/pages').length;
      for (const opts of [{}, { all: true }, { auto: true }]) {
        const p = await R.sync.push({ sessionId: SID, ...opts });
        assert.equal(p.sent, 0, JSON.stringify(opts));
        assert.deepEqual(p.failed, [], JSON.stringify(opts));
      }
      assert.equal(R.calls.filter((c) => c === 'POST /v1/pages').length, posts, 'żadnej nowej strony w Notion');
      assert.equal((await R.pages()).length, 0);
      // po Cofnij (kopia przeniesiona do restored/) wysyłka znowu działa
      await R.sync.untrashTrade({ sessionId: SID, tradeId: 't1' });
      assert.equal((await R.sync.push({ sessionId: SID, all: true })).sent, 1);
    } finally { R.A.stop(); }
  });

  test('usun-trade: blokada trade\'ów backtestu w dzienniku jest fail-closed: błąd odczytu schematu odmawia (503), a nie przepuszcza', async () => {
    const R = await rig(H, assert, ROOT, 5649);
    try {
      R.store.save(SID, session([trade(1)]), 0);
      assert.equal((await R.sync.push({ sessionId: SID })).sent, 1);
      const id = R.tr('t1').notion.id;
      R.fault = (m, p) => (m === 'GET' && p.includes('/v1/data_sources/') ? 'before-net' : null);
      let guarded = 0;
      const e = await rejects(R.writer.trashTradePage(id, true, { guard: () => { guarded++; } }), 503, 'notion-offline');
      assert.match(e.message, /nie mogę sprawdzić|trade nie został usunięty/i);
      assert.equal(guarded, 0, 'guard nie dostał pustego tekstu');
      assert.equal((await pageOf(R, id)).in_trash, false, 'strona nietknięta');
      R.fault = null;
      assert.equal((await R.writer.trashTradePage(id, true, { guard: () => {} })).ok, true, 'bez błędu schematu usuwa');
    } finally { R.A.stop(); }
  });

  test('usun-trade: klient: jeden sposób zapisu zaległych zmian (kod flush, przerwanie bez żądania do serwera) w remove, trashTrade i restoreTrade; stale nie blokuje', async () => {
    const { createSessionClient } = await lib('public/js/bt-klient.js');
    const mk = (saveStatus) => {
      const calls = [];
      const fetchImpl = async (u, o = {}) => {
        calls.push(String(u));
        const ok = (j) => ({ ok: true, status: 200, json: async () => j });
        if (String(u).includes('/session/save')) return saveStatus === 200 ? ok({ rev: 2 }) : { ok: false, status: saveStatus, json: async () => ({ error: 'zapis', code: saveStatus === 409 ? 'stale' : 'io' }) };
        return ok({ ok: true });
      };
      return { calls, client: createSessionClient({ fetchImpl, delayMs: 5 }) };
    };
    for (const name of ['remove', 'trashTrade', 'restoreTrade']) {
      const { calls, client } = mk(500);
      await client.save({ id: 'bt-flush0001', trades: [] });
      const call = () => (name === 'remove' ? client.remove('bt-flush0001') : client[name]('bt-flush0001', 't1'));
      const err = await call().then(() => null, (x) => x);
      assert.ok(err && err.code === 'flush', `${name}: błąd z kodem flush, jest ${err && err.code}`);
      assert.ok(!calls.some((c) => /session\/delete|trade\/(trash|restore)/.test(c)), `${name}: żądanie usunięcia nie poszło`);
    }
    const ok = mk(409);
    await ok.client.save({ id: 'bt-flush0002', trades: [] });
    await ok.client.trashTrade('bt-flush0002', 't1');
    assert.ok(ok.calls.some((c) => /trade\/trash/.test(c)), 'stale nie blokuje usunięcia');
  });

  // ---- runda 3 (2.11.2026): scrubToken, przenoszenie do restored/ ----
  test('usun-trade: scrubToken: log błędu archiwizacji nie powtarza tokenu (Bearer, token=), a tekst bez tokenu przechodzi bez zmian', async () => {
    const R = await rig(H, assert, ROOT, 5651);
    const logs = [];
    const orig = console.error;
    try {
      R.store.save(SID, session([trade(1)]), 0);
      assert.equal((await R.sync.push({ sessionId: SID })).sent, 1);
      const id = R.tr('t1').notion.id;
      console.error = (...a) => { logs.push(a.map(String).join(' ')); };
      for (const fault of ['before-400tok', 'before-plain', 'before-400plain']) {
        R.fault = (m, p) => (m === 'PATCH' && p === `/v1/pages/${id}` ? fault : null);
        await rejects(R.writer.trashTradePage(id, true), fault === 'before-plain' ? 500 : 400);
      }
    } finally { console.error = orig; R.A.stop(); }
    const text = logs.join('\n');
    assert.ok(/\[write\]/.test(text), `log zawiera wpisy archiwizacji: ${text.slice(0, 200)}`);
    assert.doesNotMatch(text, /secret_abc123XYZ/, 'token nie trafia do logu (Bearer ani token=)');
    assert.match(text, /\[token\]/, 'token zastąpiony znacznikiem');
    assert.match(text, /Zwykły komunikat bez tokenu/, 'tekst bez tokenu przechodzi bez zmian');
    // dowód, że asercja jest czerwona bez scrubToken: ten sam test na kodzie, w którym scrubToken niczego nie zmienia
    const w = src('lib/writes.mjs');
    assert.match(w, /scrubToken\(e\?\.message \?\? e\)/, 'scrubToken użyty przy wyjątkach spoza klienta Notion');
    assert.match(w, /scrubToken\(e\.message\)/, 'scrubToken użyty przy odmowie Notion');
  });

  test('usun-trade: błąd przeniesienia wpisu do restored/ nie blokuje wysyłki przywróconego trade\'a (wpis jest usuwany z bieżącej księgi albo test odmawia po cichu)', async () => {
    const { createBacktestStore } = await lib('lib/backtest-store.mjs');
    const base = H.tmp();
    const logs = [];
    const st = createBacktestStore({ baseDir: base, now: () => Date.UTC(2026, 10, 2, 11, 0, 0), log: (...a) => logs.push(a.join(' ')) });
    st.save('bt-restored01', session([trade(1)], { id: 'bt-restored01' }), 0);
    const file = st.ledgerPut('bt-restored01', 't1', { pageId: null, trade: trade(1) });
    // restored/ jest plikiem, więc ani mkdir, ani rename nie mogą się udać
    writeFileSync(path.join(base, 'backtest', 'removed-trades', 'restored'), 'blokada');
    assert.deepEqual([...st.ledgerIds('bt-restored01')], ['t1']);
    const r = st.ledgerRestored('bt-restored01', 't1', file);
    assert.equal(r, 'dropped', 'przeniesienie nie wyszło: wpis usunięty z bieżącej księgi, a nie zostawiony po cichu');
    assert.deepEqual([...st.ledgerIds('bt-restored01')], [], 'trade wraca do wysyłki do Notion');
    assert.ok(logs.some((l) => /restored/.test(l)), 'błąd przeniesienia jest w logu');
    // zwykłe przeniesienie: wynik „moved”
    const base2 = H.tmp();
    const st2 = createBacktestStore({ baseDir: base2, now: () => Date.UTC(2026, 10, 2, 11, 0, 0) });
    st2.save('bt-restored02', session([trade(1)], { id: 'bt-restored02' }), 0);
    const f2 = st2.ledgerPut('bt-restored02', 't1', { pageId: null, trade: trade(1) });
    assert.equal(st2.ledgerRestored('bt-restored02', 't1', f2), 'moved');
  });

  // ---- trasy HTTP na dashboardzie testowym z atrapą Notion po migracjach ----
  async function stand(port) {
    const A = await H.atrapa(port);
    const dir = envDir(H);
    const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
    assert.equal(mig.code, 0, mig.err);
    const S = await H.server(port + 1, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, THQ_TEST_PAGES: '1' });
    return { A, S, dir, stop: () => { S.stop(); A.stop(); } };
  }
  const dataTrades = async (S) => (await (await fetch(`${S.base}/api/data?refresh=1`)).json()).data.trades;

  test('usun-trade: trasy dziennika POST /api/trades/<id>/trash i /untrash: ochrona zapisu, walidacja, archiwum i przywrócenie, obca baza 403, trade z sesji backtestu 409', async () => {
    const U = await stand(5650);
    const { S, A } = U;
    try {
      const rows = await dataTrades(S);
      assert.ok(rows.length >= 3, 'atrapa ma trade\'y Live');
      const live = rows.find((x) => !x.btSession);
      const id = live._id;
      const raw = (headers, p, body = '{}') => fetch(S.base + p, { method: 'POST', headers, body });
      assert.equal((await raw({ Origin: S.base, 'Content-Type': 'application/json' }, `/api/trades/${id}/trash`)).status, 403, 'bez X-THQ');
      assert.equal((await raw({ Origin: 'http://evil.example', 'X-THQ': '1', 'Content-Type': 'application/json' }, `/api/trades/${id}/trash`)).status, 403, 'obcy Origin');
      assert.equal((await raw({ Origin: 'http://evil.example', 'X-THQ': '1', 'Content-Type': 'application/json' }, `/api/trades/${id}/untrash`)).status, 403, 'untrash: obcy Origin');
      assert.equal((await fetch(`${S.base}/api/trades/${id}/trash`)).status, 404, 'GET nie usuwa');
      for (const bad of ['abc', '../x', `${id}x`, 'x'.repeat(36)]) assert.equal((await H.dash(S.base, `/api/trades/${bad}/trash`, {})).status, 405, `zły identyfikator ${bad}`);
      assert.equal((await dataTrades(S)).length, rows.length, 'odrzucone żądania nic nie usunęły');
      const del = await H.dash(S.base, `/api/trades/${id}/trash`, {});
      assert.equal(del.status, 200, JSON.stringify(del.j));
      assert.deepEqual([del.j.ok, del.j.already], [true, false]);
      const dump = Object.values(await A.dump()).flatMap((d) => d.pages).find((p) => p.id === id);
      assert.equal(dump.in_trash, true, 'strona w archiwum Notion');
      assert.ok(!(await dataTrades(S)).some((x) => x._id === id), 'dashboard jej nie widzi');
      assert.equal((await H.dash(S.base, `/api/trades/${id}/trash`, {})).j.already, true, 'powtórka bez błędu');
      const back = await H.dash(S.base, `/api/trades/${id}/untrash`, {});
      assert.equal(back.status, 200, JSON.stringify(back.j));
      assert.ok((await dataTrades(S)).some((x) => x._id === id), 'po Cofnij trade wrócił');
      // strona spoza bazy Trade'y (konto) i nieistniejąca
      const konto = (await (await fetch(`${S.base}/api/data`)).json()).data.konta[0]._id;
      const k = await H.dash(S.base, `/api/trades/${konto}/trash`, {});
      assert.equal(k.status, 403, JSON.stringify(k.j));
      assert.equal(k.j.code, 'foreign');
      const ghost = await H.dash(S.base, '/api/trades/11111111-2222-4333-8444-555555555555/trash', {});
      assert.equal(ghost.status, 404, JSON.stringify(ghost.j));
      assert.equal(ghost.j.code, 'notion-missing');
      assert.match(ghost.j.error, /trade nie został usunięty/);
      // trade z sesji backtestu: odmowa z wyjaśnieniem, strona nietknięta; po usunięciu trade'a z sesji (albo samej sesji) wolno
      const sess = { ...session([trade(1)], { id: 'bt-trasa0007', name: 'Sesja trasy' }) };
      assert.equal((await H.dash(S.base, '/api/backtest/session/save', { id: 'bt-trasa0007', doc: sess, rev: 0 })).status, 200);
      const sent = await H.dash(S.base, '/api/backtest/notion', { sessionId: 'bt-trasa0007' });
      assert.equal(sent.status, 200, JSON.stringify(sent.j));
      const bt = (await dataTrades(S)).find((x) => /\[bt-trasa0007\/t1\]$/.test(x.btSession || ''));
      assert.ok(bt, 'trade backtestu jest w Notion');
      const own = await H.dash(S.base, `/api/trades/${bt._id}/trash`, {});
      assert.equal(own.status, 409, JSON.stringify(own.j));
      assert.equal(own.j.code, 'backtest-owned');
      assert.match(own.j.error, /Sesja trasy/);
      assert.ok((await dataTrades(S)).some((x) => x._id === bt._id), 'strona nietknięta');
      assert.equal((await H.dash(S.base, `/api/trades/${bt._id}/untrash`, {})).status, 200, 'przywracanie nie jest blokowane');
      assert.equal((await H.dash(S.base, '/api/backtest/session/delete', { id: 'bt-trasa0007' })).status, 200);
      assert.equal((await H.dash(S.base, `/api/trades/${bt._id}/trash`, {})).status, 200, 'po usunięciu sesji strony zostają i da się je usunąć z dziennika');
    } finally { U.stop(); }
  });

  test('usun-trade: trasy backtestu POST /api/backtest/trade/trash i /restore: ochrona zapisu, walidacja, pełny przebieg usuń → Cofnij → powtórne Cofnij', async () => {
    const U = await stand(5660);
    const { S, A, dir } = U;
    try {
      const sess = session([trade(1), trade(2)], { id: 'bt-trasa0008', name: 'Sesja usuwania' });
      assert.equal((await H.dash(S.base, '/api/backtest/session/save', { id: 'bt-trasa0008', doc: sess, rev: 0 })).status, 200);
      assert.equal((await H.dash(S.base, '/api/backtest/notion', { sessionId: 'bt-trasa0008' })).j.sent, 2);
      const pageId = (await dataTrades(S)).find((x) => /\[bt-trasa0008\/t1\]$/.test(x.btSession || ''))._id;
      const raw = (headers, body, p) => fetch(S.base + p, { method: 'POST', headers, body: JSON.stringify(body) });
      const T = '/api/backtest/trade/trash', Rs = '/api/backtest/trade/restore';
      assert.equal((await raw({ Origin: S.base, 'Content-Type': 'application/json' }, { sessionId: 'bt-trasa0008', tradeId: 't1' }, T)).status, 403, 'bez X-THQ');
      assert.equal((await raw({ Origin: 'http://evil.example', 'X-THQ': '1', 'Content-Type': 'application/json' }, { sessionId: 'bt-trasa0008', tradeId: 't1' }, T)).status, 403, 'obcy Origin');
      assert.equal((await raw({ Origin: 'http://evil.example', 'X-THQ': '1', 'Content-Type': 'application/json' }, { sessionId: 'bt-trasa0008', tradeId: 't1' }, Rs)).status, 403, 'restore: obcy Origin');
      assert.equal((await fetch(S.base + T)).status, 404, 'GET nie usuwa');
      for (const sessionId of ['../x', 'bt-..%2f', 'BT-1', '', null, 5]) assert.equal((await H.dash(S.base, T, { sessionId, tradeId: 't1' })).status, 400, `sessionId ${sessionId}`);
      for (const tradeId of ['../t1', 't', 'T1', '', null, 5, 't1/../x']) assert.equal((await H.dash(S.base, T, { sessionId: 'bt-trasa0008', tradeId })).status, 400, `tradeId ${tradeId}`);
      assert.equal((await H.dash(S.base, Rs, { sessionId: 'bt-trasa0008', tradeId: '../x' })).status, 400);
      assert.equal((await H.dash(S.base, T, { sessionId: 'bt-trasa0008', tradeId: 't7' })).status, 404);
      const del = await H.dash(S.base, T, { sessionId: 'bt-trasa0008', tradeId: 't1' });
      assert.equal(del.status, 200, JSON.stringify(del.j));
      assert.deepEqual([del.j.trashed, del.j.pageId], [true, pageId]);
      assert.ok(!(await dataTrades(S)).some((x) => x._id === pageId), 'strona w archiwum Notion');
      const led = readdirSync(path.join(dir, 'chart-data', 'backtest', 'removed-trades'));
      assert.equal(led.length, 1);
      assert.match(led[0], /^bt-trasa0008-t1-\d{8}T\d{6}Z\.json$/);
      // zapis sesji bez trade'a jeszcze nie doszedł (trade nadal w pliku, strona w koszu): Cofnij naprawia rozjazd, przywraca samą stronę (200, inSession) zamiast 409
      const back = await H.dash(S.base, Rs, { sessionId: 'bt-trasa0008', tradeId: 't1' });
      assert.equal(back.status, 200, JSON.stringify(back.j));
      assert.deepEqual([back.j.restored, back.j.inSession, back.j.pageId], [true, true, pageId]);
      assert.ok((await dataTrades(S)).some((x) => x._id === pageId), 'strona wróciła z archiwum');
      // przeglądarka zapisuje sesję bez trade'a, potem Cofnij ponownie (wpis czeka w restored/ do zapisu sesji z trade'em)
      const cur = await (await fetch(`${S.base}/api/backtest/session/bt-trasa0008`)).json();
      const without = { ...cur, trades: cur.trades.filter((x) => x.id !== 't1') };
      const sv = await H.dash(S.base, '/api/backtest/session/save', { id: 'bt-trasa0008', doc: without, rev: cur.rev });
      assert.equal(sv.status, 200);
      const back2 = await H.dash(S.base, Rs, { sessionId: 'bt-trasa0008', tradeId: 't1' });
      assert.equal(back2.status, 200, JSON.stringify(back2.j));
      assert.deepEqual([back2.j.restored, back2.j.again, back2.j.pageId], [true, true, pageId]);
      const rdir = path.join(dir, 'chart-data', 'backtest', 'removed-trades', 'restored');
      assert.equal(readdirSync(rdir).length, 1, 'kopia czeka w restored/');
      assert.equal(readdirSync(path.join(dir, 'chart-data', 'backtest', 'removed-trades')).filter((x) => x.endsWith('.json')).length, 0, 'bieżąca księga pusta');
      // zapis sesji z trade'em potwierdza przywrócenie: kopia sprzątnięta, kolejne Cofnij to 409
      const cur2 = await (await fetch(`${S.base}/api/backtest/session/bt-trasa0008`)).json();
      assert.equal((await H.dash(S.base, '/api/backtest/session/save', { id: 'bt-trasa0008', doc: { ...cur2, trades: [cur.trades.find((x) => x.id === 't1'), ...cur2.trades] }, rev: cur2.rev })).status, 200);
      assert.equal(readdirSync(rdir).length, 0, 'kopia sprzątnięta po zapisie z trade\'em');
      assert.equal((await H.dash(S.base, Rs, { sessionId: 'bt-trasa0008', tradeId: 't1' })).status, 409, 'powtórne Cofnij: trade jest w sesji, nie ma czego przywracać');
    } finally { U.stop(); }
  });

  async function diaryRun(port, narrow) {
    const P = await lib('testy/przegladarka.mjs');
    if (!P.findBrowser()) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    const A = await H.atrapa(port);
    const dir = H.tmp();
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ lang: 'pl', onboarded: true, defaultsUpgraded: '1.6.0' }));
    const S = await H.server(port + 1, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'secret_atrapa', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL });
    try {
      const opt = narrow ? { width: 375, height: 812, mobile: true } : { width: 1920, height: 1080 };
      const txt = await P.cdpPage(S.base + '/', { ...opt, timeoutMs: 150_000, until: "window.__thq && document.querySelector('#view .page-head')", extract: src('testy/scen-usun-dziennik.js') });
      const res = JSON.parse(txt);
      assert.ok(!res.fatal, res.fatal);
      const mine = res.checks.filter((c) => c.tag === 'usun-dziennik');
      assert.ok(mine.length >= 17, `scenariusz wykonał sprawdzenia (${mine.length})`);
      assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], 'nieudane sprawdzenia');
      // stan końcowy w atrapie: trade usunięty i przywrócony dwa razy, strona żyje
      const pages = Object.values(await A.dump()).flatMap((d) => d.pages);
      assert.equal(pages.filter((p) => p.in_trash).length, 0, 'żadna strona nie została w koszu po Cofnij');
    } finally { S.stop(); A.stop(); }
  }
  test('usun-trade: dziennik w przeglądarce (1920): okno szczegółów i formularz: Usuń z potwierdzeniem, kosz Notion, Cofnij kliknięciem i Ctrl+Z', () => diaryRun(5680, false));
  test('usun-trade: dziennik w przeglądarce (375): przycisk Usuń w widoku, ten sam przebieg', () => diaryRun(5685, true));

  test('usun-trade: wygląd: cele dotyku akcji w Historii ≥ 44 px przy ≤ 480 px, powiadomienie poza tabelą, Cofnij jako tekst akcji (źródła CSS)', () => {
    const css = src('public/features.css');
    assert.match(css, /@media \(max-width: 480px\)[^{]*\{[^}]*\.bt-dk-a \.btn[^}]*min-height: 44px/s, 'cele dotyku w wierszu Historii');
    assert.match(css, /\.toast\.has-act/, 'powiadomienie z akcją ma własne położenie');
    assert.match(css, /\.toast \.toast-act[^}]*font-weight: 600/s, 'Cofnij pogrubione');
    assert.match(css, /\.toast \.toast-act:(hover|focus-visible)[^}]*text-decoration: underline/s, 'podkreślenie po najechaniu');
    // runda 3: jedna reguła położenia dla wszystkich powiadomień (bez wariantów zależnych od akcji i od replayu), przy ≤ 480 px u góry
    assert.doesNotMatch(css, /body:has\(\.bt-screen\)/, 'położenie nie zależy od obecności replayu');
    assert.match(css, /@media \(max-width: 480px\)[^{]*\{[^}]*\.toast[^}]*top: calc\(env\(safe-area-inset-top\) \+ 8px\)[^}]*bottom: auto[^}]*left: 8px[^}]*right: 8px/s, 'przy ≤ 480 px powiadomienia u góry, na pełną szerokość');
    assert.match(css, /@media \(hover: none\)[^{]*\{[^}]*\.toast-key[^}]*display: none/s, 'skróty klawiszowe ukryte na ekranach dotykowych');
    assert.match(css, /@media \(hover: none\)[^{]*\{[^}]*\.bt-jw-kbd[^}]*display: none/s);
    assert.match(css, /@media \(max-width: 480px\)[^{]*\{[^}]*\.bt-dk-stc[^}]*display: none/s, 'kolumna STAN ukryta przy ≤ 480 px, stan w komórce instrumentu');
  });

  test('usun-trade: źródła (trasy za guardWrite, walidacja identyfikatorów, Esc nad Journalem, Cofnij z Ctrl+Z bez przejmowania fokusu, teksty EN, [U] w kodzie i w postep.md)', () => {
    const sv = src('server.mjs');
    assert.match(sv, /\/api\/backtest\/trade\/trash/);
    assert.match(sv, /trash\|untrash/);
    assert.match(sv, /SESSION_ID_RE\.test\(bb\.sessionId\)/);
    assert.match(sv, /backtest-owned/);
    const okno = src('public/js/bt-journal-okno.js');
    assert.match(okno, /if \(overlay\.current\) return;/, 'okno pytania nad Journalem dostaje Escape przed Journalem');
    const modal = src('public/js/modal.js');
    assert.doesNotMatch(modal, /toast-act'\)\.focus\(/, 'powiadomienie nie przejmuje fokusu (Spacja replayu nie może wcisnąć Cofnij)');
    assert.match(modal, /ctrlKey/, 'Ctrl+Z cofa, póki powiadomienie jest widoczne');
    const en = JSON.parse(src('public/i18n/en.json'));
    for (const k of ['Usuń trade', 'Trade usunięty', 'Trade przywrócony', 'Usunąć ten trade?', 'Usuń tylko z aplikacji', 'Nie znaleziono strony w Notion', 'Ten trade nie jest zamknięty. Najpierw zamknij pozycję.']) assert.ok(en[k], k);
    assert.match(en['Jego strona trafi do kosza w Notion. Przywrócisz ją stamtąd w ciągu 30 dni, potem zniknie na stałe.'], /30 days/);
    for (const f of ['lib/writes.mjs', 'lib/backtest-sync.mjs', 'lib/backtest-store.mjs', 'public/js/bt-replay.js', 'public/js/app.js']) assert.match(src(f), /\[U\] 2026-11-01 «/, f);
    // decyzje sesji głównej (gust) nie noszą znacznika [U]: opisane jako „Decyzja sesji głównej” albo „Decyzja 2026-11-02”
    for (const f of ['public/js/modal.js', 'public/js/bt-klient.js', 'public/js/bt-replay.js']) assert.match(src(f), /Decyzja (sesji głównej )?2026-11-02/, f);
    assert.match(src('docs/plany/backtest/postep.md'), /Decyzja sesji głównej[^]*Ctrl\+Z/, 'postep.md opisuje decyzję o Cofnij z klawiatury');
    assert.match(src('docs/plany/backtest/postep.md'), /Archiwum Notion \+ Cofnij/);
    // trwałego kasowania nie ma: jedyny zapis usuwający to in_trash
    const hasDelete = (s) => /method: 'DELETE'|request\('DELETE'|notion\.delete\b/.test(s);
    assert.ok(!hasDelete(src('lib/writes.mjs')), 'writes.mjs nie wysyła DELETE');
    // ślad czerwieni asercji: ten sam predykat na kodzie ze wstrzykniętym DELETE musi go wykryć
    assert.ok(hasDelete(`${src('lib/writes.mjs')}\nawait notion.request('DELETE', p);`), 'predykat wykrywa wstrzyknięty DELETE');
    assert.ok(hasDelete("fetch(u, { method: 'DELETE' })"), 'predykat wykrywa DELETE we fetch');
    assert.match(src('lib/writes.mjs'), /\{ in_trash: trashed \}/);
  });

  // ---- przeglądarka: szuflada Historia, okno Journala, Cofnij, błędy (strona robocza testy/backtest-usun-trade.html) ----
  test('usun-trade: replay w przeglądarce: Usuń w Historii, potwierdzenie z informacją o archiwum Notion, przeliczenie konta, Cofnij, błędy Notion, okno Journala', async () => {
    const P = await lib('testy/przegladarka.mjs');
    if (!P.findBrowser()) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    const { syntheticDay } = await lib('testy/bt-dane-syntetyczne.mjs');
    const A = await H.atrapa(5670);
    const dir = envDir(H);
    const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
    assert.equal(mig.code, 0, mig.err);
    await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
    await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'ES', day: '2024-03-12', seed: 5, has1s: false });
    const S = await H.server(5671, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, THQ_TEST_PAGES: '1' });
    try {
      const res = JSON.parse(await P.cdpPage(`${S.base}/__testy/backtest-usun-trade.html`, { width: 1920, height: 1080, timeoutMs: 170_000, bridge: {} }));
      assert.ok(!res.fatal, res.fatal);
      const mine = res.checks.filter((c) => c.tag === 'usun-trade');
      assert.ok(mine.length >= 28, `strona wykonała sprawdzenia (${mine.length})`);
      assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], 'nieudane sprawdzenia');
      assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
      // stan końcowy w atrapie Notion: t1 usunięty i przywrócony (jedna strona, poza archiwum), t2 usunięty i zostaje w archiwum, t3 nigdy nie miał strony
      const pages = Object.values(await A.dump()).flatMap((d) => d.pages).filter((p) => (p.properties['Sesja backtestu']?.rich_text || []).length);
      const txt = (p) => p.properties['Sesja backtestu'].rich_text.map((x) => x.text?.content ?? x.plain_text ?? '').join('');
      const byT = (name, t) => pages.filter((p) => txt(p).startsWith(`${name} [`) && txt(p).endsWith(`/${t}]`));
      assert.deepEqual([byT('Sesja A', 't1').length, byT('Sesja A', 't1')[0]?.in_trash], [1, false], 'A t1: jedna strona, przywrócona');
      assert.deepEqual([byT('Sesja A', 't2').length, byT('Sesja A', 't2')[0]?.in_trash], [1, true], 'A t2: strona w archiwum Notion');
      assert.equal(byT('Sesja A', 't3').length, 0, 'A t3 (niewysłany) nie ma strony');
      // sesja C (zamknięcie w trakcie usuwania, nieudane zapisy): po wszystkim obie strony żyją, po jednej (bez dubli)
      assert.deepEqual([byT('Sesja C', 't1').length, byT('Sesja C', 't1')[0]?.in_trash, byT('Sesja C', 't2').length, byT('Sesja C', 't2')[0]?.in_trash], [1, false, 1, false], 'C: dwie żywe strony, bez dubli');
    } finally { S.stop(); A.stop(); }
  });
};
