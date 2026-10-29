// wykresy-07b: P26 (28.10.2026), poprawki użytkownika do podglądu (pakiet D) i edytora (pakiet E):
// 1) przełącznik automatycznej skali ceny, 2) bez automatycznej zmiany interwału, 3) bez podpisów wejścia/wyjścia,
// 4) pole BE (migracja 004) i linia BE na pozycji, 5) strefa czasowa osi (Ustawienia + szybki przełącznik na wykresie).
// Tylko atrapa Notion; przeglądarkowa część w testy/edytor-wykresu.html (test wykresy-08).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  let port = 4840;
  const next = () => ++port;
  const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const P = () => lib('public/js/podglad.js');

  // ---- 1) skala ceny ----
  test('wykresy-07: P26 skala ceny: przesuwanie i przybliżanie zakresu w pionie, stan przełącznika w localStorage (domyślnie auto)', async () => {
    const { panPrice, zoomPrice, loadAutoScale, saveAutoScale, AUTO_KEY } = await P();
    assert.equal(AUTO_KEY, 'thq.chart.autoscale.v1');
    assert.deepEqual(panPrice({ min: 100, max: 110 }, 50, 100), { min: 105, max: 115 }, 'ciągnięcie w dół o pół pola pokazuje wyższe ceny');
    assert.deepEqual(panPrice({ min: 100, max: 110 }, -100, 100), { min: 90, max: 100 });
    const z = zoomPrice({ min: 100, max: 110 }, 105, 2);
    assert.deepEqual(z, { min: 95, max: 115 }, 'oddalenie wokół kursora');
    const z2 = zoomPrice({ min: 100, max: 110 }, 100, 0.5);
    assert.deepEqual(z2, { min: 100, max: 105 }, 'cena pod kursorem zostaje na miejscu');
    const z3 = zoomPrice({ min: 100, max: 110 }, 105, 1e-9);
    assert.ok(z3.max - z3.min >= 0.5, 'jeden krok przybliżenia ma granicę: zakres nie zapada się do zera');
    // bez localStorage (Node): domyślnie auto, zapis bez wyjątku
    assert.equal(loadAutoScale(), true);
    saveAutoScale(false);
    const mem = {};
    globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
    try {
      saveAutoScale(false);
      assert.equal(mem[AUTO_KEY], '0');
      assert.equal(loadAutoScale(), false);
      saveAutoScale(true);
      assert.equal(loadAutoScale(), true);
      globalThis.localStorage = { getItem: () => { throw new Error('zablokowany'); }, setItem: () => { throw new Error('zablokowany'); } };
      assert.equal(loadAutoScale(), true, 'zablokowany localStorage = auto');
      saveAutoScale(false);
    } finally { delete globalThis.localStorage; }
    const w = src('public/js/wykres.js');
    assert.match(w, /autoScale/, 'edytor przełącza autoScale skali ceny LWC');
    assert.match(w, /loadAutoScale\(\)/, 'edytor czyta ten sam stan przełącznika');
  });

  // ---- 2) interwał ----
  test('wykresy-07: P26 interwał: brak automatycznego podnoszenia TF i etykiety „wyświetlane”, limit oddalenia 1 500 świec wybranego TF', async () => {
    const M = await P();
    assert.equal(M.displayTf, undefined, 'displayTf usunięte');
    assert.equal(M.raisedLabel, undefined, 'raisedLabel usunięte');
    assert.equal(M.MAX_VISIBLE, 1500);
    assert.deepEqual(M.limitSpan(10, 100), { fromIndex: 10, toIndex: 100 }, 'mieści się: bez zmian');
    assert.deepEqual(M.limitSpan(0, 3000), { fromIndex: 0, toIndex: 1500 }, 'za szeroki kadr skrócony od prawej (wejście zostaje w kadrze)');
    assert.deepEqual(M.limitSpan(0, 3000, 1500, 'center'), { fromIndex: 750, toIndex: 2250 }, 'oddalenie: wokół środka');
    const pod = src('public/js/podglad.js'), wyk = src('public/js/wykres.js');
    for (const [f, s] of [['podglad.js', pod], ['wykres.js', wyk]]) {
      assert.doesNotMatch(s, /displayTf|raisedLabel|swc-raised|wyświetlane \{shown\}/, `${f}: brak podnoszenia TF`);
      assert.match(s, /P26 \(28\.10\.2026\)/, `${f}: komentarz z datą decyzji`);
    }
    assert.match(wyk, /minBarSpacing/, 'edytor: limit oddalenia przez minBarSpacing');
    assert.ok(!('wyświetlane {shown} (wybrano {tf})' in json(path.join(ROOT, 'public/i18n/en.json'))), 'martwy tekst usunięty z en.json');
  });

  // ---- 3) podpisy ----
  test('wykresy-07: P26 bez podpisów wejścia i wyjścia: kreska i kropka zostają, linie LWC bez tytułów', async () => {
    const pod = src('public/js/podglad.js');
    assert.doesNotMatch(pod, /lvl-n/, 'podgląd nie rysuje etykiety wejścia/wyjścia');
    assert.match(pod, /lvl-d/, 'kropka zostaje');
    assert.match(pod, /lvl-k/, 'kreska zostaje');
    const { tradeLevels } = await lib('public/js/wykres.js');
    const C = { profit: 'p', loss: 'l', be: 'b', fg: 'f', fg2: 'f2' };
    const lv = tradeLevels({ entryPrice: 100, exitPrice: 104, sl: 98, tp: 106 }, C);
    assert.deepEqual(lv.map((l) => l.title), ['', '', 'SL', 'TP']);
  });

  // ---- 4) BE ----
  test('wykresy-07: P26 migracja 004: jedno pole liczbowe „BE” (PL i EN), addytywna, zgodna ze schematem nowej instalacji i rolą', async () => {
    const { loadMigrations, validateMigration } = await lib('lib/migrate.mjs');
    const { ROLES } = await lib('lib/roles.mjs');
    const ms = await loadMigrations(path.join(ROOT, 'migrations'));
    const m = ms.find((x) => x.version === 4);
    assert.ok(m, 'migracja 004 istnieje');
    validateMigration(m, m.file);
    assert.deepEqual(m.ops, [{ op: 'addProperty', db: 'trades', role: 'be', spec: { type: 'number', name: { pl: 'BE', en: 'BE' } } }]);
    assert.ok(ROLES.trades.be?.optional);
    assert.deepEqual(ROLES.trades.be.types, ['number']);
    assert.ok(ROLES.trades.be.names.includes('BE'));
    const sch = json(path.join(ROOT, 'schema/notion-schema.json'));
    assert.ok(sch.schemaVersion >= 4, 'P35: migracja 005 podnosi wersję schematu do 5');
    assert.deepEqual(sch.databases.trades.properties.be, { type: 'number', name: { pl: 'BE', en: 'BE' } });
  });

  function envDir(lang, version) {
    const dir = H.tmp();
    const I = H.IDS;
    writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x\nNOTION_ROOT_URL=${H.PARENT_URL}\nDS_TRADES=${I.DS_TRADES}\nDS_KONTA=${I.DS_KONTA}\nDS_DZIENNIK=${I.DS_DZIENNIK}\nDS_FINANSE=${I.DS_FINANSE}\n`);
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: version, lang }));
    return dir;
  }
  const dumpPages = (dump) => Object.fromEntries(Object.values(dump).flatMap((d) => d.pages.map((p) => [p.id, H.canon({ props: p.properties, trash: !!p.in_trash })])));

  for (const lang of ['pl', 'en']) {
    test(`wykresy-07: P26 migracja 004 na atrapie (${lang}): dry-run bez zapisu, zapis dodaje tylko „BE”, drugi przebieg bez zmian`, async () => {
      const A = await H.atrapa(next());
      try {
        const dir = envDir(lang, 2);
        const env = H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
        const upd = path.join(ROOT, 'update.mjs');
        const before = await A.dump();
        const NEW3 = lang === 'pl' ? ['Cena wejścia', 'Cena wyjścia', 'SL', 'TP', 'Rysunki'] : ['Entry price', 'Exit price', 'SL', 'TP', 'Drawings'];
        const dry = await H.run(upd, ['--migrate-only', '--dry-run', '--json'], env);
        assert.equal(dry.code, 0, dry.err);
        const ch = dry.lines.find((l) => l.migrations).migrations.changes.filter((c) => c.version === 4);
        assert.deepEqual(ch.map((c) => `${c.kind}:${c.status}:${c.name}`), ['property:add:BE']);
        const w0 = (await A.writes()).length;
        const r1 = await H.run(upd, ['--migrate-only', '--json'], env);
        assert.equal(r1.code, 0, r1.err);
        const after = await A.dump();
        const sTr = after[H.IDS.DS_TRADES].schema;
        assert.equal(sTr.BE?.type, 'number');
        for (const [k, v] of Object.entries(before[H.IDS.DS_TRADES].schema)) {
          if (k === 'Wyjście' || k === 'Exit') continue; // pole z migracji 001 (atrapa startuje bez niego)
          assert.equal(H.canon(sTr[k]), H.canon(v), `pole „${k}” nietknięte`);
        }
        const added = Object.keys(sTr).filter((k) => !(k in before[H.IDS.DS_TRADES].schema) && !NEW3.includes(k) && k !== 'Wyjście' && k !== 'Exit' && k !== 'Kontrakt' && k !== 'Contract'); // Kontrakt: migracja 005 (P35)
        assert.deepEqual(added, ['BE'], 'migracja 004 dodaje tylko BE');
        assert.deepEqual(dumpPages(after), dumpPages(before), 'trade\'y bez zmian');
        assert.equal(json(path.join(dir, 'config.local.json')).schemaVersion, json(path.join(ROOT, 'schema/notion-schema.json')).schemaVersion); // P35: do najnowszej (005)
        assert.ok((await A.writes()).length > w0);
        const w = (await A.writes()).length;
        assert.equal((await H.run(upd, ['--migrate-only', '--json'], env)).code, 0);
        assert.equal((await A.writes()).length, w, 'drugi przebieg niczego nie zapisuje');
        assert.deepEqual(await A.get('/__test/violations'), []);
      } finally { A.stop(); }
    });
  }

  test('wykresy-07: P26 BE: zapis i odczyt przez dashboard, walidacja, normalizeTrades, formularz i poziomy na wykresie', async () => {
    const A = await H.atrapa(next());
    const dir = envDir('pl', 2);
    const env = H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    assert.equal((await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], env)).code, 0);
    const S = await H.server(next(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    try {
      const data = async () => (await fetch(`${S.base}/api/data?refresh=1`)).json();
      const d0 = await data();
      assert.equal(d0.fields.trades.be, 'number', 'dashboard widzi pole BE');
      const id = d0.data.trades[0]._id;
      const r = await H.dash(S.base, `/api/trades/${id}`, { be: '5843,5' }, { method: 'PATCH' });
      assert.equal(r.status, 200, JSON.stringify(r.j));
      const p = (await A.get('/__test/pages?ds=trades')).find((x) => x.id === id).p;
      assert.equal(p.BE.number, 5843.5);
      const row = (await data()).data.trades.find((x) => x._id === id);
      assert.equal(row.be, 5843.5);
      const bad = await H.dash(S.base, `/api/trades/${id}`, { be: '-1' }, { method: 'PATCH' });
      assert.equal(bad.status, 400);
      assert.ok(bad.j.fields?.be, 'komunikat przy polu BE');
      const St = await lib('public/js/stats.js');
      const [x] = St.normalizeTrades([row]);
      assert.equal(x.be, 5843.5);
      assert.deepEqual(await A.get('/__test/violations'), []);
    } finally { S.stop(); A.stop(); }
    assert.match(src('public/js/form.js'), /\['be', 'BE'\]/, 'formularz ma pole BE obok cen');
    assert.match(src('public/js/app.js'), /be: x\.be/, 'wykres dostaje cenę BE');
    const { tradeLevels } = await lib('public/js/wykres.js');
    const lv = tradeLevels({ entryPrice: 100, be: 101 }, { be: 'b', fg2: 'f2', fg: 'f', loss: 'l', profit: 'p' });
    assert.deepEqual(lv.find((l) => l.price === 101), { price: 101, color: 'b', title: 'BE' }, 'edytor: linia BE w kolorze --be');
    const pod = src('public/js/podglad.js');
    assert.match(pod, /hline\(be, 'be'\)/, 'podgląd: linia BE na pozycji');
    assert.match(src('public/styles.css'), /svg \.lvl\.be \{[^}]*var\(--be\)/, 'kolor BE z tokenu --be');
  });

  // ---- 5) strefa czasowa ----
  test('wykresy-07: P26 strefa czasowa: przesunięcie z DST, etykieta, kolejność szybkiego przełącznika, domyślna z Ustawień', async () => {
    const Z = await P();
    const summer = Date.UTC(2026, 6, 1, 12) / 1000, winter = Date.UTC(2026, 0, 15, 12) / 1000;
    assert.equal(Z.tzOffset('UTC', summer), 0);
    assert.equal(Z.tzOffset('America/New_York', summer), -4 * 3600);
    assert.equal(Z.tzOffset('America/New_York', winter), -5 * 3600);
    assert.equal(Z.tzOffset('Europe/Warsaw', summer), 2 * 3600);
    assert.equal(Z.tzOffset('Europe/Warsaw', winter), 3600);
    // zmiana czasu w USA 1.11.2026 o 2:00 EDT = 06:00 UTC
    assert.equal(Z.tzOffset('America/New_York', Date.UTC(2026, 10, 1, 5, 59) / 1000), -4 * 3600);
    assert.equal(Z.tzOffset('America/New_York', Date.UTC(2026, 10, 1, 6, 0) / 1000), -5 * 3600);
    assert.equal(Z.validTz('America/New_York'), true);
    assert.equal(Z.validTz('Nie/Ma'), false);
    assert.equal(Z.validTz(''), false);
    assert.equal(Z.tzLabel('UTC', summer), 'UTC');
    assert.equal(Z.tzLabel('America/New_York', summer), 'Nowy Jork UTC−4');
    assert.equal(Z.tzLabel('Europe/Warsaw', winter), 'Warszawa UTC+1');
    assert.equal(Z.tzLabel('Asia/Kolkata', summer), 'Kolkata UTC+5:30');
    Z.setChartTzDefault('Europe/Warsaw');
    assert.equal(Z.chartTz(), 'Europe/Warsaw');
    // P27 (28.10.2026): zamiast przycisku po kolei lista rozwijana; wybór na wykresie dalej tymczasowy
    assert.equal(Z.setChartTzOverride('UTC'), 'UTC');
    assert.equal(Z.chartTz(), 'UTC', 'nadpisanie na wykresie');
    assert.equal(Z.setChartTzOverride('America/Chicago'), 'America/Chicago');
    assert.equal(Z.setChartTzOverride(''), 'Europe/Warsaw', 'pusta wartość wraca do strefy z Ustawień');
    Z.setChartTzOverride('America/New_York');
    Z.setChartTzDefault('Nie/Ma');
    assert.equal(Z.chartTz(), Z.BROWSER_TZ, 'zmiana w Ustawieniach zdejmuje nadpisanie; zła strefa = strefa przeglądarki');
    Z.setChartTzDefault('');
    // formatowanie w wybranej strefie
    const t0 = Date.UTC(2026, 9, 26, 13, 30) / 1000;
    assert.equal(Z.fmtIn('America/New_York', 'pl').HM.format(new Date(t0 * 1000)), '09:30');
    assert.equal(Z.fmtIn('Europe/Warsaw', 'pl').HM.format(new Date(t0 * 1000)), '14:30');
    assert.equal(Z.fmtIn('UTC', 'pl').HM.format(new Date(t0 * 1000)), '13:30');
    // Ustawienia, synchronizacja, oba widoki
    const app = src('public/js/app.js');
    assert.match(app, /chartTz: settings\.chartTz/, 'strefa w synchronizowanych ustawieniach');
    assert.match(app, /setChartTzDefault\(settings\.chartTz\)/);
    assert.match(src('public/js/ustawienia.js'), /id="sp-tz"/, 'wybór strefy w Ustawieniach');
    for (const f of ['public/js/podglad.js', 'public/js/wykres.js']) assert.match(src(f), /data-swc="tz"/, `${f}: przełącznik strefy na wykresie`);
    assert.doesNotMatch(src('public/js/podglad.js'), /getTimezoneOffset/, 'podgląd nie liczy w strefie przeglądarki na sztywno');
    const en = json(path.join(ROOT, 'public/i18n/en.json'));
    for (const k of ['Nowy Jork', 'Warszawa', 'Strefa czasowa wykresu', 'Auto']) assert.ok(en[k], `en.json: ${k}`);
  });
};
