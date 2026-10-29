// wykresy-09: rysunki w Notion (lib/drawings.mjs, trasy /api/drawings, public/js/rysunki.js): kawałki po 2 000 znaków, limit 190 000, walidacja,
// cache offline z pending, odczyt po restarcie i po skasowaniu cache, zapis z opóźnieniem (fałszywy zegar). Tylko atrapa Notion.
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  let port = 4830;
  const next = () => ++port;
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const D = () => lib('public/vendor/lightweight-charts-drawing/lightweight-charts-drawing.es.js');

  // dokument o dokładnie n znakach (jeden rysunek tekstowy z dopasowaną długością tekstu)
  async function docOfSize(n, text = 'x') {
    const { defaultStyleFor } = await D();
    const mk = (k) => ({ v: 1, lib: '0.6.2', at: new Date().toISOString(), d: [{ id: 'dw_test', kind: 'text', points: [{ time: 1793000000, price: 5800 }], text: text.repeat(k), style: defaultStyleFor('text') }] });
    const base = JSON.stringify(mk(0)).length;
    const doc = mk(Math.floor((n - base) / text.length));
    assert.equal(JSON.stringify(doc).length, n, 'dokument ma zadaną długość');
    return doc;
  }
  const small = async (label = 'a') => { const { defaultStyleFor } = await D(); return { v: 1, lib: '0.6.2', at: new Date().toISOString(), d: [{ id: `dw_${label}`, kind: 'horizontal-line', points: [{ time: 1793000000, price: 5800 }], style: defaultStyleFor('horizontal-line') }] }; };

  function envDir() {
    const fs = { writeFileSync };
    const dir = H.tmp();
    const I = H.IDS;
    fs.writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x\nNOTION_ROOT_URL=${H.PARENT_URL}\nDS_TRADES=${I.DS_TRADES}\nDS_KONTA=${I.DS_KONTA}\nDS_DZIENNIK=${I.DS_DZIENNIK}\nDS_FINANSE=${I.DS_FINANSE}\n`);
    fs.writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: 2, lang: 'pl' }));
    return dir;
  }
  async function rig({ migrate = true } = {}) {
    const A = await H.atrapa(next());
    const dir = envDir();
    const env = H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    if (migrate) { const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], env); assert.equal(mig.code, 0, mig.err); }
    let S = await H.server(next(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    const rows = async () => A.get('/__test/pages?ds=trades');
    const id = (await rows())[0].id;
    const props = async (pid = id) => (await rows()).find((p) => p.id === pid).p;
    const pieces = async (pid = id) => (await props(pid)).Rysunki?.rich_text || [];
    const save = (doc, pid = id, o = {}) => H.dash(S.base, '/api/drawings/save', { id: pid, doc }, o);
    const read = async (pid = id) => { const r = await fetch(`${S.base}/api/drawings/${pid}`); return { status: r.status, j: await r.json() }; };
    const patches = async () => (await A.writes()).filter((l) => l.startsWith('PATCH /v1/pages/')).length;
    const cacheFile = (pid = id) => path.join(dir, 'chart-data', 'drawings-cache', `${pid}.json`);
    const restart = async () => { S.stop(); await H.sleep(150); S = await H.server(next(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }); };
    return { A, dir, id, props, pieces, save, read, patches, cacheFile, restart, get S() { return S; }, stop: () => { S.stop(); A.stop(); } };
  }

  test('wykresy-09: chunkText tnie po 2 000 znaków bez rozcinania pary zastępczej, sklejenie jest identyczne', async () => {
    const { chunkText, CHUNK, MAX_CHARS } = await lib('lib/drawings.mjs');
    assert.equal(CHUNK, 2000); assert.equal(MAX_CHARS, 190000);
    const five = 'a'.repeat(5000);
    const ch = chunkText(five);
    assert.deepEqual(ch.map((c) => c.length), [2000, 2000, 1000]);
    assert.equal(ch.join(''), five);
    const pl = 'ąęłńóśźż'.repeat(700); // 5 600 znaków polskich liter na granicach kawałków
    assert.equal(chunkText(pl).join(''), pl);
    assert.ok(chunkText(pl).every((c) => c.length <= 2000));
    const emoji = 'a' + '😀'.repeat(1500); // para zastępcza na granicy: kawałek nie przekracza 2 000 jednostek UTF-16
    const ce = chunkText(emoji);
    assert.ok(ce.every((c) => c.length <= 2000 && !/[\uD800-\uDBFF]$/.test(c) && !/^[\uDC00-\uDFFF]/.test(c)));
    assert.equal(ce.join(''), emoji);
    assert.equal(chunkText('x'.repeat(190000)).length, 95);
    assert.deepEqual(chunkText(''), []);
  });

  test('wykresy-09: createSaver: 10 zmian w 1 s to jeden zapis po 2 s; zmiana w trakcie zapisu daje dokładnie jeden następny z najnowszym stanem; flush wysyła od razu', async () => {
    const { createSaver, usage, docOf, MAX_CHARS } = await lib('public/js/rysunki.js');
    let now = 0; const q = [];
    const timers = { set: (f, ms) => { const t = { f, at: now + ms }; q.push(t); return t; }, clear: (t) => { const i = q.indexOf(t); if (i >= 0) q.splice(i, 1); } };
    const advance = async (ms) => { now += ms; for (const t of q.filter((x) => x.at <= now)) { q.splice(q.indexOf(t), 1); t.f(); } await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); };
    const sent = []; let release = null;
    const sv = createSaver({ send: (doc) => { sent.push(doc); return new Promise((r) => { release = r; }); }, delay: 2000, timers });
    for (let i = 0; i < 10; i++) { sv.change(() => `stan${i}`); await advance(100); }
    assert.deepEqual(sent, [], 'w pierwszej sekundzie nic nie wysłano');
    await advance(1800);
    assert.deepEqual(sent, [], 'termin przesuwa się z każdą zmianą (ostatnia w 0,9 s)');
    await advance(200);
    assert.deepEqual(sent, ['stan9'], 'jeden zapis z ostatnim stanem');
    sv.change(() => 'A'); await advance(2000);
    sv.change(() => 'B'); await advance(2000);
    assert.deepEqual(sent, ['stan9'], 'zapis w toku blokuje kolejny; zmiany czekają w kolejce (jedna, najnowsza)');
    release(); await advance(10);
    assert.deepEqual(sent, ['stan9', 'B'], 'po zakończeniu idzie tylko najnowszy stan');
    release(); await advance(10);
    sv.change(() => 'C'); const fl = sv.flush(); await advance(0); assert.deepEqual(sent.slice(-1), ['C'], 'flush bez czekania na termin'); release(); await fl;
    assert.equal(sv.pending(), false);
    // licznik zajętości
    const doc = docOf([], { lib: '0.6.2' });
    assert.equal(usage(doc).show, false);
    const big = { ...doc, d: [{ id: 'x'.repeat(Math.ceil(MAX_CHARS * 0.8)) }] };
    assert.equal(usage(big).show, true); assert.equal(usage(big).warn, false);
    assert.equal(usage({ ...doc, d: [{ id: 'x'.repeat(Math.ceil(MAX_CHARS * 0.96)) }] }).warn, true);
    assert.equal(usage({ ...doc, d: [{ id: 'x'.repeat(MAX_CHARS) }] }).over, true);
  });

  test('wykresy-09: styleFor: FVG to prostokąt w --be z przerywaną linią środka, pozycje bez podpisów kwot, fib z poziomami P7, kolory tylko z tokenów', async () => {
    const { styleFor, FIB_LEVELS, TOOLS } = await lib('public/js/rysunki.js');
    const c = { profit: 'p', loss: 'l', be: 'b', fg: 'f', fg2: 'f2' };
    const fvg = styleFor('rectangle', c, true);
    assert.equal(fvg.color, 'b'); assert.equal(fvg.backgroundColor, 'b'); assert.equal(fvg.rectMiddleLine.visible, true); assert.equal(fvg.rectMiddleLine.style, 'dashed');
    assert.equal(styleFor('rectangle', c, false).color, 'f');
    assert.deepEqual(FIB_LEVELS, [0, 0.5, 0.618, 0.705, 0.79, 1]);
    assert.deepEqual(styleFor('fib-retracement', c).levels.map((l) => l.coeff), FIB_LEVELS);
    const lp = styleFor('long-position', c);
    assert.equal(lp.stopColor, 'l'); assert.equal(lp.targetColor, 'p'); assert.equal(lp.showPriceLabels, false);
    assert.equal(TOOLS.length, 9, 'P27: 8 rodzajów (z Gann boxem) + preset FVG');
  });

  test('wykresy-09: zapis dzieli JSON na kawałki po 2 000 znaków jednym PATCH, odczyt zwraca ten sam dokument także po restarcie serwera i skasowaniu cache', async () => {
    const R = await rig();
    try {
      const doc = await docOfSize(5000);
      const before = await R.patches();
      const r = await R.save(doc);
      assert.equal(r.status, 200, JSON.stringify(r.j));
      const { edited, previous, ...rest } = r.j; // P27: odpowiedź niesie też last_edited_time strony (edytor wykresu trzyma go dla zapisu cen) i znacznik sprzed zapisu (previous, poprawka po przeglądzie)
      assert.deepEqual(rest, { ok: true, pending: false });
      assert.match(String(edited), /^\d{4}-\d\d-\d\dT/);
      assert.equal(await R.patches() - before, 1, 'dokładnie jedno PATCH');
      const pcs = await R.pieces();
      assert.deepEqual(pcs.map((x) => x.text.content.length), [2000, 2000, 1000]);
      assert.equal(pcs.map((x) => x.text.content).join(''), JSON.stringify(doc));
      assert.deepEqual((await R.read()).j.doc, doc);
      // restart serwera i brak cache: dokument wraca z Notion
      await R.restart();
      rmSync(path.dirname(R.cacheFile()), { recursive: true, force: true });
      const back = await R.read();
      assert.equal(back.j.source, 'notion');
      assert.deepEqual(back.j.doc, doc);
      assert.ok(existsSync(R.cacheFile()), 'odczyt odtwarza cache');
      assert.deepEqual(await R.A.get('/__test/violations'), []);
    } finally { R.stop(); }
  });

  test('wykresy-09: dokładnie 190 000 znaków trafia do Notion w 95 kawałkach (odczyt 100 elementów), 190 001 jest odrzucone bez żądania do Notion', async () => {
    const R = await rig();
    try {
      const max = await docOfSize(190000);
      const before = await R.patches();
      const r = await R.save(max);
      assert.equal(r.status, 200, JSON.stringify(r.j).slice(0, 300));
      const pcs = await R.pieces();
      assert.equal(pcs.length, 95);
      assert.ok(pcs.every((x) => x.text.content.length <= 2000) && pcs.length <= 100, 'atrapa nigdy nie dostała kawałka > 2 000 ani tablicy > 100');
      assert.deepEqual((await R.read()).j.doc, max);
      const w = await R.patches();
      assert.equal(w - before, 1);
      const over = await docOfSize(190001);
      const ro = await R.save(over);
      assert.equal(ro.status, 400);
      assert.match(ro.j.error, /Za dużo rysunków na tym trade'zie \(190\D001 z 190 000 znaków\)\. Usuń część rysunków, zanim zapiszesz\./);
      assert.equal(await R.patches(), w, 'zero żądań do Notion po odrzuceniu');
      assert.deepEqual((await R.read()).j.doc, max, 'stan w Notion bez zmian');
    } finally { R.stop(); }
  });

  test('wykresy-09: walidacja serwera: zły identyfikator, zła wersja, śmieci w rysunkach, nie-JSON, za duże ciało, trade z innej bazy, brak nagłówków: zero PATCH', async () => {
    const R = await rig();
    try {
      const ok = await small();
      const w0 = await R.patches();
      assert.equal((await R.save(ok, 'nie-id')).status, 400);
      assert.equal((await R.save({ ...ok, v: 2 })).status, 400, 'zły v');
      assert.equal((await R.save({ ...ok, d: 'x' })).status, 400);
      assert.equal((await R.save({ ...ok, d: [{ kind: 'nie-ma-takiego', id: 'z' }] })).status, 400, 'śmieci w parseDrawings');
      assert.equal((await R.save({ ...ok, d: [ok.d[0], { foo: 1 }] })).status, 400);
      assert.equal((await R.save({ ...ok, at: 'wczoraj' })).status, 400);
      assert.equal((await R.save(null)).status, 400);
      const raw = await fetch(`${R.S.base}/api/drawings/save`, { method: 'POST', headers: { Origin: R.S.base, 'X-THQ': '1', 'Content-Type': 'application/json' }, body: '{nie json' });
      assert.equal(raw.status, 400);
      const huge = await fetch(`${R.S.base}/api/drawings/save`, { method: 'POST', headers: { Origin: R.S.base, 'X-THQ': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: R.id, doc: ok, pad: 'y'.repeat(700 * 1024) }) });
      assert.equal(huge.status, 413);
      const noHdr = await fetch(`${R.S.base}/api/drawings/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: R.id, doc: ok }) });
      assert.equal(noHdr.status, 403, 'zapis tylko z dashboardu');
      const konto = (await R.A.get('/__test/pages?ds=konta'))[0].id;
      const foreign = await R.save(ok, konto);
      assert.equal(foreign.status, 403, `strona z innej bazy: ${JSON.stringify(foreign.j)}`);
      assert.equal((await fetch(`${R.S.base}/api/drawings/zly-id`)).status, 404, 'zły adres odczytu nie jest trasą');
      assert.equal(await R.patches(), w0, 'żadna z odrzuconych prób nie dotknęła Notion');
    } finally { R.stop(); }
  });

  test('wykresy-09: awaria Notion: zapis do cache z pending, następny zapis i odczyt najpierw ratują stan, odczyt przy wyłączonym Notion daje cache', async () => {
    const R = await rig();
    try {
      const A1 = await small('A'), B = await small('B'), C = await small('C');
      await R.A.post('/__test/fail', { match: 'PATCH /v1/pages', after: 0, status: 500 });
      const r1 = await R.save(A1);
      assert.deepEqual(r1.j, { ok: true, pending: true }, 'komunikat „zapisano lokalnie”');
      const c1 = JSON.parse(readFileSync(R.cacheFile(), 'utf8'));
      assert.equal(c1.pending, true); assert.equal(c1.json, JSON.stringify(A1));
      assert.deepEqual((await R.pieces()), [], 'w Notion jeszcze nic');
      const rd = await R.read();
      assert.equal(rd.j.pending, false, 'odczyt wysłał zaległy stan');
      assert.deepEqual(rd.j.doc, A1);
      assert.equal((await R.pieces()).map((x) => x.text.content).join(''), JSON.stringify(A1));
      // nowy zapis zastępuje zaległy (ostatni wygrywa)
      await R.A.post('/__test/fail', { match: 'PATCH /v1/pages', after: 0, status: 503 });
      assert.equal((await R.save(B)).j.pending, true, '503 też odkłada zapis');
      assert.equal((await R.save(C)).j.pending, false);
      assert.equal((await R.pieces()).map((x) => x.text.content).join(''), JSON.stringify(C));
      assert.equal(JSON.parse(readFileSync(R.cacheFile(), 'utf8')).pending, false);
    } finally { R.stop(); }
  });

  test('wykresy-09: zły JSON w Notion: wykres bez rysunków i znacznik bad, cache nietknięty; nowszy zapis lokalny wygrywa z Notion', async () => {
    const R = await rig();
    try {
      const good = await small('G');
      assert.equal((await R.save(good)).status, 200);
      const cacheBefore = readFileSync(R.cacheFile(), 'utf8');
      const patch = await fetch(`${R.A.base}/v1/pages/${R.id}`, { method: 'PATCH', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify({ properties: { Rysunki: { rich_text: [{ type: 'text', text: { content: '{"v":1,"d":[uszkodzone' } }] } } }) });
      assert.equal(patch.status, 200);
      const r = await R.read();
      assert.equal(r.j.bad, true); assert.equal(r.j.doc, null);
      assert.equal(readFileSync(R.cacheFile(), 'utf8'), cacheBefore, 'cache nietknięty');
      // nowszy stan w cache (np. zapis z drugiego okna offline) wygrywa
      const newer = { ...(await small('N')), at: new Date(Date.now() + 60_000).toISOString() };
      await R.save(newer);
      const old = { ...(await small('O')), at: new Date(Date.now() - 3_600_000).toISOString() };
      await fetch(`${R.A.base}/v1/pages/${R.id}`, { method: 'PATCH', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify({ properties: { Rysunki: { rich_text: [{ type: 'text', text: { content: JSON.stringify(old) } }] } } }) });
      const w = await R.read();
      assert.deepEqual(w.j.doc, newer, 'nowszy `at` wygrywa');
    } finally { R.stop(); }
  });

  test('wykresy-09: baza bez pola „Rysunki” (przed migracją): odczyt mówi noField, zapis 409 z poleceniem aktualizacji; /api/data bez rysunków', async () => {
    const R = await rig({ migrate: false });
    try {
      const r = await R.read();
      assert.equal(r.j.noField, true); assert.equal(r.j.doc, null);
      const s = await R.save(await small());
      assert.equal(s.status, 409);
      assert.match(s.j.error, /Rysunki/);
      assert.equal(await R.patches(), 0);
    } finally { R.stop(); }
  });

  test('wykresy-09: brak literałów kolorów w rysunki.js i lib/drawings.mjs; trasy tylko przez guardWrite (zapis) i bez rysunków w /api/data', () => {
    for (const f of ['public/js/rysunki.js', 'public/js/wykres.js']) assert.equal((readFileSync(path.join(ROOT, f), 'utf8').match(/#[0-9a-f]{3,8}\b/gi) || []).length, 0, f);
    const srv = readFileSync(path.join(ROOT, 'server.mjs'), 'utf8');
    assert.match(srv, /\/api\/drawings\/save/);
    assert.match(readFileSync(path.join(ROOT, 'lib/data.mjs'), 'utf8'), /role === 'drawings'/);
  });
};
