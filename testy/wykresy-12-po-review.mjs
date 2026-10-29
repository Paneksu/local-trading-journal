// wykresy-12: poprawki po przeglądzie D–F (28.10.2026, review-DF.txt). Każdy test sprawdza zachowanie, nie istnienie funkcji:
// B1 tokeny lightboxa w features.css, W1 listenery po destroy (strona robocza w przeglądarce), W3 zapis rysunków, który się nie udał,
// W4 zaległy zapis odczytany przy otwarciu, W5 kolejka miniatur, P27 kontrola 409 przy zapisie cen, D3 PDH/PDL po dniu bez sesji, D4 limit ciała żądania.
// W2 i W6 (lightbox w pełnej aplikacji) sprawdza osobny skrypt Playwrighta testy/wykresy-e2e-r.mjs (jak zrzuty-e2e.mjs, poza run.mjs).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  let port = 4880;
  const next = () => ++port;
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

  // ---- B1: features.css bez literałów kolorów, lightbox bierze wartości z tokenów --lb-* ----
  test('wykresy-12: B1 features.css nie ma literałów kolorów, a .lb czyta tokeny --lb-* zdefiniowane w styles.css', () => {
    const css = src('public/features.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const lits = css.match(/#[0-9a-fA-F]{3,8}\b|oklch\(\s*[\d.]|rgba?\(\s*\d|hsla?\(\s*\d|hwb\(|lab\(|lch\(/g) || [];
    assert.deepEqual(lits, [], `literały kolorów w features.css: ${lits.join(' ')}`);
    const st = src('public/styles.css');
    for (const k of ['--lb-primary', '--lb-primary-fg', '--lb-well', '--lb-edge', '--lb-input', '--lb-seg-on', '--lb-well-shadow', '--lb-n-blue', '--lb-n-orange', '--lb-n-purple']) {
      assert.match(st, new RegExp(`${k}:`), `${k} zdefiniowany w styles.css`);
      assert.ok(css.includes(`var(${k})`), `${k} użyty w features.css`);
    }
  });

  // ---- W3: zapis, który się nie udał, nie ginie ----
  test('wykresy-12: W3 createSaver: nieudana wysyłka zostawia stan w kolejce (failed), następny flush wysyła go ponownie, brak pętli', async () => {
    const R = await lib('public/js/rysunki.js');
    const immediate = { set: (f) => { queueMicrotask(f); return 1; }, clear: () => {} };
    const sent = []; let fail = true;
    const s = R.createSaver({ send: async (doc) => { sent.push(doc); if (fail) throw new Error('Notion 502'); }, delay: 0, timers: immediate });
    s.change(() => 'A');
    await s.flush();
    assert.deepEqual(sent, ['A'], 'jedna próba, bez pętli ponowień');
    assert.equal(s.pending(), true, 'stan z nieudanej wysyłki zostaje w kolejce');
    assert.equal(s.failed(), true, 'saver mówi, że ostatni zapis się nie udał');
    fail = false;
    await s.flush();
    assert.deepEqual(sent, ['A', 'A'], 'ten sam stan poszedł drugi raz');
    assert.equal(s.pending(), false); assert.equal(s.failed(), false);
    // nowsza zmiana po porażce zastępuje zaległy stan
    fail = true;
    s.change(() => 'B'); await s.flush();
    s.change(() => 'C'); fail = false; await s.flush();
    assert.equal(sent.at(-1), 'C'); assert.equal(s.failed(), false);
  });

  // ---- W5: kolejka miniatur ----
  test('wykresy-12: W5 createMiniQueue: nowy element z tym samym kluczem dostaje dane, gdy poprzedni zniknął z ekranu przed startem żądania', async () => {
    const { createMiniQueue } = await lib('public/js/podglad.js');
    const loads = []; const gate = {};
    const q = createMiniQueue({ limit: 1, load: (key) => new Promise((res) => { loads.push(key); gate[key] = () => res({ key, bars: [1] }); }) });
    const first = q.get('zajmuje', {});
    assert.deepEqual(loads, ['zajmuje']);
    // render 1: element stary czeka w kolejce; render 2: nowy element tego samego trade'a, stary już odpięty
    const oldP = q.get('k', { skip: () => true });
    const newP = q.get('k', { skip: () => false });
    gate.zajmuje(); await first;
    await new Promise((r) => setTimeout(r, 5)); gate.k?.(); // kolejka rusza dalej po zakończeniu pierwszego żądania
    const [o, n] = await Promise.all([oldP, newP]);
    assert.ok(n && n.key === 'k', `nowy element dostał dane (zamiast ${JSON.stringify(n)})`);
    assert.ok(o && o.key === 'k', 'ten sam wynik dla obu (jedno żądanie)');
    assert.deepEqual(loads, ['zajmuje', 'k'], 'jedno żądanie dla klucza');
    // gdy wszystkie elementy zniknęły, żądania nie ma i klucz nie zostaje w cache
    const gone = q.get('x', { skip: () => true });
    assert.equal(await gone, null);
    const again = q.get('x', { skip: () => false });
    await new Promise((r) => setTimeout(r, 5)); gate.x?.();
    assert.deepEqual(await again, { key: 'x', bars: [1] }, 'po pominięciu klucz można zamówić ponownie');
  });

  // ---- D3: PDH/PDL po dniu bez sesji ----
  test('wykresy-12: D3 pdhlSpans po dniu bez sesji (święto CME) bierze ostatnią faktyczną sesję, ale nie zgaduje przy dziurze w pobranych świecach', async () => {
    const SW = await lib('public/js/swiece.js');
    const mon = Date.UTC(2026, 9, 26, 15) / 1000; // poniedziałek 10:00 CDT
    const sess = SW.sessionBounds(mon);
    const fri = SW.previousSession(sess.open), thu = SW.previousSession(fri.open);
    const times = [mon, mon + 60, mon + 120];
    const bar = [thu.open, 100, 110, 90, 105, 1];
    // piątek bez świecy 1D i bez dziury w pokryciu = dzień bez sesji
    const ok = SW.pdhlSpans(times, [bar], { missing: [], derived: [], availableEnd: null });
    assert.equal(ok.length, 1, 'jest linia PDH/PDL z ostatniej faktycznej sesji');
    assert.deepEqual([ok[0].hi, ok[0].lo], [110, 90]);
    // piątek w pobranych świecach z dziurą: nie zgadujemy
    const gap = SW.pdhlSpans(times, [bar], { missing: [[fri.open, fri.close]], derived: [], availableEnd: null });
    assert.equal(gap.length, 0, 'dziura w pobranych świecach: bez linii');
    // zwykły dzień (piątek ma świecę): bierze piątek
    const normal = SW.pdhlSpans(times, [bar, [fri.open, 200, 210, 190, 205, 1]], { missing: [], derived: [], availableEnd: null });
    assert.deepEqual([normal[0].hi, normal[0].lo], [210, 190]);
    // sesja po końcu dostępnych danych nie jest brana
    const early = SW.pdhlSpans(times, [bar], { missing: [], derived: [], availableEnd: thu.close - 1 });
    assert.equal(early.length, 0);
  });

  // ---- serwer: W4, P27, D4 ----
  function envDir() {
    const dir = H.tmp();
    const I = H.IDS;
    writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x\nNOTION_ROOT_URL=${H.PARENT_URL}\nDS_TRADES=${I.DS_TRADES}\nDS_KONTA=${I.DS_KONTA}\nDS_DZIENNIK=${I.DS_DZIENNIK}\nDS_FINANSE=${I.DS_FINANSE}\n`);
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: 2, lang: 'pl' }));
    return dir;
  }
  async function rig() {
    const A = await H.atrapa(next());
    const dir = envDir();
    const env = H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], env);
    assert.equal(mig.code, 0, mig.err);
    const S = await H.server(next(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    const id = (await A.get('/__test/pages?ds=trades'))[0].id;
    const edited = async () => (await A.get('/__test/pages?ds=trades')).find((p) => p.id === id).edited;
    const { defaultStyleFor } = await lib('public/vendor/lightweight-charts-drawing/lightweight-charts-drawing.es.js');
    const doc = (label = 'a', at = new Date().toISOString(), text) => ({ v: 1, lib: '0.6.2', at, d: [text !== undefined
      ? { id: `dw_${label}`, kind: 'text', points: [{ time: 1793000000, price: 5800 }], text, style: defaultStyleFor('text') }
      : { id: `dw_${label}`, kind: 'horizontal-line', points: [{ time: 1793000000, price: 5800 }], style: defaultStyleFor('horizontal-line') }] });
    return { A, S, dir, id, edited, doc, stop: () => { S.stop(); A.stop(); } };
  }

  test('wykresy-12: W4 odczyt rysunków, który wysłał zaległy stan do Notion, unieważnia dane i mówi o tym klientowi (flushed)', async () => {
    const R = await rig();
    try {
      const d0 = await R.S.base;
      const data0 = await (await fetch(`${R.S.base}/api/data`)).json();
      const e0 = data0.data.trades.find((t) => t._id === R.id)._edited;
      // zaległy zapis lokalny (Notion było niedostępne), jak po awarii sieci
      const { mkdirSync } = await import('node:fs');
      const cdir = path.join(R.dir, 'chart-data', 'drawings-cache');
      mkdirSync(cdir, { recursive: true });
      const pend = R.doc('p', new Date(Date.now() + 1000).toISOString());
      writeFileSync(path.join(cdir, `${R.id}.json`), JSON.stringify({ at: pend.at, json: JSON.stringify(pend), pending: true }));
      const r = await (await fetch(`${R.S.base}/api/drawings/${R.id}`)).json();
      assert.equal(r.doc.d[0].id, 'dw_p');
      assert.equal(r.flushed, true, 'odpowiedź mówi, że przy odczycie poszedł zapis do Notion (strona w Notion się zmieniła)');
      const e1 = await R.edited();
      assert.notEqual(e1, e0, 'strona w Notion rzeczywiście się zmieniła');
      const data1 = await (await fetch(`${R.S.base}/api/data`)).json();
      assert.equal(data1.data.trades.find((t) => t._id === R.id)._edited, e1, 'zwykły odczyt danych nie podaje starego znacznika edycji');
      const again = await (await fetch(`${R.S.base}/api/drawings/${R.id}`)).json();
      assert.ok(!again.flushed, 'drugi odczyt nic już nie wysyła');
      void d0;
    } finally { R.stop(); }
  });

  test('wykresy-12: P27 zapis rysunków podaje znacznik strony sprzed zapisu (previous), a adoptEdited przyjmuje nowy tylko gdy nikt inny nie zmienił trade\'a', async () => {
    const R = await rig();
    try {
      const { adoptEdited } = await lib('public/js/rysunki.js');
      const e0 = await R.edited();
      const s1 = await H.dash(R.S.base, '/api/drawings/save', { id: R.id, doc: R.doc('a') });
      assert.equal(s1.status, 200, JSON.stringify(s1.j));
      assert.equal(s1.j.previous, e0, 'previous = znacznik strony tuż przed własnym zapisem');
      assert.equal(s1.j.edited, await R.edited());
      assert.equal(adoptEdited(e0, s1.j), s1.j.edited, 'własny zapis: znacznik przesuwa się o własny zapis');
      // zmiana zrobiona „w Notion” przy otwartej edycji
      await R.A.post('/__test/notion-edit', { id: R.id, set: { Notatki: 'zmiana z Notion' } });
      const s2 = await H.dash(R.S.base, '/api/drawings/save', { id: R.id, doc: R.doc('b') });
      assert.notEqual(s2.j.previous, s1.j.edited, 'serwer widzi, że między zapisami strona zmieniła się sama');
      assert.equal(adoptEdited(s1.j.edited, s2.j), s1.j.edited, 'cudza zmiana: znacznik zostaje stary, więc zapis cen dostanie 409');
      const body = { entryPrice: 5841, exitPrice: 5847, sl: 5835, tp: 5849, be: 5843 };
      const stale = await H.dash(R.S.base, `/api/trades/${R.id}`, { ...body, edited: adoptEdited(s1.j.edited, s2.j) }, { method: 'PATCH' });
      assert.equal(stale.status, 409); assert.equal(stale.j.code, 'stale');
      // brak starego znacznika (trade bez znacznika) i odpowiedź bez previous (stary serwer) działają jak dotąd
      assert.equal(adoptEdited('', s2.j), s2.j.edited);
      assert.equal(adoptEdited('x', { edited: 'y' }), 'y');
      assert.equal(adoptEdited('x', { pending: true }), 'x');
    } finally { R.stop(); }
  });

  test('wykresy-12: D4 zapis w limicie znaków z wielobajtowymi literami przechodzi, a przekroczenie limitu rozmiaru Notion (500 KB) dostaje komunikat o rysunkach, nie ogólne 413', async () => {
    const R = await rig();
    try {
      const { MAX_CHARS } = await lib('lib/drawings.mjs');
      const base = JSON.stringify(R.doc('t', undefined, '')).length;
      const k = MAX_CHARS - base; // tekst wypełniający limit 190 000 znaków co do jednego
      // 2 bajty na znak (ł): ~380 KB, mieści się w limicie znaków i w 500 KB Notion, ale było większe niż dawny limit żądania 256 KB (ogólne 413)
      const two = R.doc('t', undefined, 'ł'.repeat(k));
      assert.equal(JSON.stringify(two).length, MAX_CHARS);
      assert.ok(Buffer.byteLength(JSON.stringify({ id: R.id, doc: two })) > 256 * 1024, 'żądanie większe niż dawny limit 256 KB');
      const ok = await H.dash(R.S.base, '/api/drawings/save', { id: R.id, doc: two });
      assert.equal(ok.status, 200, JSON.stringify(ok.j).slice(0, 200));
      // 3 bajty na znak (€): ~570 KB po stronie Notion, więcej niż jego limit 500 KB: komunikat o rysunkach, zero żądań zapisu do Notion
      const writes0 = (await R.A.writes()).length;
      const three = R.doc('t', undefined, '€'.repeat(k));
      const big = await H.dash(R.S.base, '/api/drawings/save', { id: R.id, doc: three });
      assert.equal(big.status, 400, JSON.stringify(big.j).slice(0, 200));
      assert.match(big.j.error, /Za dużo rysunków.*500 KB/);
      assert.equal((await R.A.writes()).length, writes0, 'za duży zapis nie poszedł do Notion');
      // ponad limit znaków: komunikat o liczbie znaków
      const over = await H.dash(R.S.base, '/api/drawings/save', { id: R.id, doc: R.doc('t', undefined, 'ł'.repeat(k + 50)) });
      assert.equal(over.status, 400); assert.match(over.j.error, /Za dużo rysunków.*190 000/);
      // ponad limit żądania serwera: 413 z komunikatem o rysunkach
      const huge = await H.dash(R.S.base, '/api/drawings/save', { id: R.id, doc: R.doc('t', undefined, '€'.repeat(400_000)) });
      assert.equal(huge.status, 413); assert.match(huge.j.error, /rysunk/i);
    } finally { R.stop(); }
  });

  // ---- W1, W3, P27 na prawdziwych modułach w przeglądarce (jedna strona robocza, trzy osobne testy) ----
  let pageRun = null;
  async function pageResult() {
    pageRun ||= (async () => {
      const { findBrowser, dumpDom } = await import(pathToFileURL(path.join(ROOT, 'testy/przegladarka.mjs')).href);
      if (!findBrowser()) return null;
      const S = await H.server(next(), { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: H.tmp() });
      try {
        const dom = await dumpDom(`${S.base}/__testy/poprawki-wykresow.html`);
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
  test('wykresy-12: W1 podgląd i edytor po destroy() nie zostawiają listenerów na trwałym elemencie, oknie ani dokumencie', () => tagged('W1', 2));
  test('wykresy-12: W3 „Gotowe” przy nieudanym zapisie rysunków pyta o potwierdzenie, a stan zostaje w kolejce do ponowienia', () => tagged('W3', 5));
  test('wykresy-12: P27 własny zapis rysunków nie psuje zapisu cen, a cudza zmiana trade’a w Notion przy otwartej edycji daje 409 ze zrozumiałym komunikatem', () => tagged('P27', 3));
};
