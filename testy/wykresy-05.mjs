// wykresy-05: migracja 003 (ceny wejścia/wyjścia, SL, TP, Rysunki), odczyt i zapis cen, brak rysunków w /api/data, strefa czasu wejścia. Tylko atrapa Notion.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  let port = 4780;
  const next = () => ++port;
  const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const SCHEMA = () => json(path.join(ROOT, 'schema/notion-schema.json'));
  const ROLES5 = { entryPrice: 'number', exitPrice: 'number', sl: 'number', tp: 'number', drawings: 'rich_text' };
  const NAMES = {
    pl: { entryPrice: 'Cena wejścia', exitPrice: 'Cena wyjścia', sl: 'SL', tp: 'TP', drawings: 'Rysunki' },
    en: { entryPrice: 'Entry price', exitPrice: 'Exit price', sl: 'SL', tp: 'TP', drawings: 'Drawings' },
  };
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

  function envDir(lang = 'pl', version = 2) {
    const dir = H.tmp();
    const I = H.IDS;
    writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x\nNOTION_ROOT_URL=${H.PARENT_URL}\nDS_TRADES=${I.DS_TRADES}\nDS_KONTA=${I.DS_KONTA}\nDS_DZIENNIK=${I.DS_DZIENNIK}\nDS_FINANSE=${I.DS_FINANSE}\n`);
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: version, lang }));
    return dir;
  }
  const dumpPages = (dump) => Object.fromEntries(Object.values(dump).flatMap((d) => d.pages.map((p) => [p.id, H.canon({ props: p.properties, trash: !!p.in_trash })])));

  test('wykresy-05: migracja 003 jest addytywna, ma 5 pól o właściwych typach i nazwach PL/EN, zgodna ze schematem nowej instalacji', async () => {
    const { loadMigrations, validateMigration } = await lib('lib/migrate.mjs');
    const { ROLES } = await lib('lib/roles.mjs');
    const ms = await loadMigrations(path.join(ROOT, 'migrations'));
    const m = ms.find((x) => x.version === 3);
    assert.ok(m, 'migracja 003 istnieje');
    validateMigration(m, m.file);
    assert.deepEqual(m.ops.map((o) => o.op), Array(5).fill('addProperty'), 'tylko addProperty');
    assert.ok(m.ops.every((o) => o.db === 'trades'));
    for (const o of m.ops) {
      assert.equal(o.spec.type, ROLES5[o.role], o.role);
      assert.equal(o.spec.name.pl, NAMES.pl[o.role]);
      assert.equal(o.spec.name.en, NAMES.en[o.role]);
      assert.ok(ROLES.trades[o.role]?.optional, `rola ${o.role} jest opcjonalna`);
      assert.deepEqual(ROLES.trades[o.role].types, [o.spec.type]);
      assert.ok(ROLES.trades[o.role].names.includes(o.spec.name.pl) && ROLES.trades[o.role].names.includes(o.spec.name.en), `${o.role}: nazwy PL i EN znane roli`);
    }
    assert.deepEqual(m.ops.map((o) => o.role).sort(), Object.keys(ROLES5).sort());
    // nowe instalacje: schemat ma te same pola
    const sch = SCHEMA();
    assert.ok(sch.schemaVersion >= 3);
    const tp = sch.databases.trades.properties;
    for (const o of m.ops) {
      assert.equal(tp[o.role]?.type, o.spec.type, `schemat: ${o.role}`);
      assert.deepEqual(tp[o.role].name, o.spec.name);
    }
  });

  for (const lang of ['pl', 'en']) {
    test(`wykresy-05: migracja 003 na atrapie (${lang}): dry-run pokazuje 5 pól bez zapisu, zapis dodaje tylko pola, drugi przebieg bez zmian`, async () => {
      const A = await H.atrapa(next());
      const dir = envDir(lang);
      const env = H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
      const before = await A.dump();
      const upd = path.join(ROOT, 'update.mjs');
      const dry = await H.run(upd, ['--migrate-only', '--dry-run', '--json'], env);
      assert.equal(dry.code, 0, dry.err);
      const ch = dry.lines.find((l) => l.migrations).migrations.changes.filter((c) => c.version === 3);
      assert.deepEqual(ch.map((c) => `${c.kind}:${c.status}`), Array(5).fill('property:add'));
      assert.deepEqual(ch.map((c) => c.name).sort(), Object.values(NAMES[lang]).sort());
      assert.deepEqual(await A.writes(), [], 'dry-run niczego nie zapisuje');
      const r1 = await H.run(upd, ['--migrate-only', '--json'], env);
      assert.equal(r1.code, 0, r1.err);
      const after = await A.dump();
      const sTr = after[H.IDS.DS_TRADES].schema;
      for (const [role, type] of Object.entries(ROLES5)) assert.equal(sTr[NAMES[lang][role]]?.type, type, `${lang}: pole ${NAMES[lang][role]}`);
      // addytywność: wszystkie dotychczasowe pola schematu i wszystkie strony bez zmian
      for (const [k, v] of Object.entries(before[H.IDS.DS_TRADES].schema)) {
        if (k === 'Wyjście' || k === 'Exit') continue; // pole z migracji 001 (atrapa startuje bez niego)
        assert.equal(H.canon(sTr[k]), H.canon(v), `pole „${k}” nietknięte`);
      }
      for (const ds of [H.IDS.DS_KONTA, H.IDS.DS_DZIENNIK, H.IDS.DS_FINANSE]) assert.equal(H.canon(after[ds].schema), H.canon(before[ds].schema), 'inne bazy nietknięte');
      assert.deepEqual(dumpPages(after), dumpPages(before), 'trade\'y i inne wpisy bez zmian');
      assert.equal(json(path.join(dir, 'config.local.json')).schemaVersion, SCHEMA().schemaVersion);
      assert.deepEqual(await A.get('/__test/violations'), [], 'zero naruszeń zasad schematu');
      const w = (await A.writes()).length;
      const r2 = await H.run(upd, ['--migrate-only', '--json'], env);
      assert.equal(r2.code, 0, r2.err);
      assert.equal((await A.writes()).length, w, 'drugi przebieg niczego nie zapisuje');
      // ponowne przejście od wersji 0 nie dubluje pól
      writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: 0, lang }));
      await H.run(upd, ['--migrate-only', '--json'], env);
      const names = Object.keys((await A.dump())[H.IDS.DS_TRADES].schema);
      for (const n of Object.values(NAMES[lang])) assert.equal(names.filter((x) => x === n).length, 1, n);
      assert.deepEqual(await A.get('/__test/violations'), []);
      A.stop();
    });
  }

  for (const lang of ['pl', 'en']) {
    test(`wykresy-05: nowa instalacja (kreator, ${lang}) dostaje 5 pól w bazie Trade'y`, async () => {
      const A = await H.atrapa(next(), { ATRAPA_PUSTA: '1', ATRAPA_TOKEN: 'ntn_dobry_token_testowy_123456' });
      const dir = H.tmp();
      const S = await H.server(next(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
      try {
        assert.equal((await H.dash(S.base, '/api/setup/token', { token: 'ntn_dobry_token_testowy_123456' })).status, 200);
        const pages = (await H.dash(S.base, '/api/setup/pages', {})).j.pages;
        assert.equal((await H.dash(S.base, '/api/setup/create', { pageId: pages[0].id, lang, demo: false })).j.started, true);
        let job;
        for (let i = 0; i < 300; i++) {
          job = await (await fetch(`${S.base}/api/setup/status`)).json();
          if (!job.running) break;
          await H.sleep(50);
        }
        assert.equal(job.done, true, JSON.stringify(job.error || job));
        const dump = await A.dump();
        const keys = (d) => Object.keys(d.schema);
        const trades = Object.values(dump).find((d) => keys(d).some((k) => /^(Typ|Type)$/.test(k)) && keys(d).some((k) => /^(Wyjście|Exit)$/.test(k)));
        assert.ok(trades, 'baza Trade\'y utworzona');
        for (const [role, type] of Object.entries(ROLES5)) assert.equal(trades.schema[NAMES[lang][role]]?.type, type, `${lang}: ${NAMES[lang][role]}`);
        assert.equal(json(path.join(dir, 'config.local.json')).schemaVersion, SCHEMA().schemaVersion);
        assert.deepEqual(await A.get('/__test/violations'), []);
      } finally { S.stop(); A.stop(); }
    });
  }

  // dashboard na atrapie po migracji: odczyt i zapis cen, brak rysunków w /api/data, strefa czasu
  async function rig() {
    const A = await H.atrapa(next());
    const dir = envDir('pl', 2);
    const env = H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], env);
    assert.equal(mig.code, 0, mig.err);
    const S = await H.server(next(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    const data = async () => (await fetch(`${S.base}/api/data?refresh=1`)).json();
    const row = async (id) => (await data()).data.trades.find((t) => t._id === id);
    const props = async (id) => (await A.get('/__test/pages?ds=trades')).find((p) => p.id === id).p;
    return { A, S, dir, data, row, props, stop: () => { S.stop(); A.stop(); } };
  }
  const NEW = { typ: 'Live', date: '2026-10-26', time: '09:30', tz: 'America/New_York', dir: 'Long', instrument: 'ES' };

  test('wykresy-05: zapis i odczyt cen przez dashboard (przecinek, czyszczenie, brak zmiany), walidacja zakresu', async () => {
    const R = await rig();
    try {
      const c = await H.dash(R.S.base, '/api/trades', { ...NEW, entryPrice: '5842,25', exitPrice: 5850.5, sl: '5838', tp: '5860.75' });
      assert.equal(c.status, 200, JSON.stringify(c.j));
      const p = await R.props(c.j.id);
      assert.equal(p['Cena wejścia'].number, 5842.25);
      assert.equal(p['Cena wyjścia'].number, 5850.5);
      assert.equal(p.SL.number, 5838);
      assert.equal(p.TP.number, 5860.75);
      const t = await R.row(c.j.id);
      assert.deepEqual([t.entryPrice, t.exitPrice, t.sl, t.tp], [5842.25, 5850.5, 5838, 5860.75]);
      // edycja istniejącego (wstępnie wczytanego) trade'a: atrapa nie wiąże stron utworzonych przez POST z bazą, więc PATCH idzie na stronie z danych startowych
      const id = (await R.data()).data.trades.find((x) => x._id !== c.j.id)._id;
      const pe = await H.dash(R.S.base, `/api/trades/${id}`, { entryPrice: '5842,25', exitPrice: 5850.5, sl: '5838', tp: '5860.75' }, { method: 'PATCH' });
      assert.equal(pe.status, 200, JSON.stringify(pe.j));
      assert.deepEqual(((x) => [x.entryPrice, x.exitPrice, x.sl, x.tp])(await R.row(id)), [5842.25, 5850.5, 5838, 5860.75]);
      // bez kluczy cen nic się nie zmienia; pusty ciąg czyści tylko wskazane pole
      const pn = await H.dash(R.S.base, `/api/trades/${id}`, { notes: 'x' }, { method: 'PATCH' });
      assert.equal(pn.status, 200, JSON.stringify(pn.j));
      assert.equal((await R.row(id)).entryPrice, 5842.25, 'brak klucza = brak zmiany');
      assert.equal((await H.dash(R.S.base, `/api/trades/${id}`, { sl: '' }, { method: 'PATCH' })).status, 200);
      const t2 = await R.row(id);
      assert.deepEqual([t2.entryPrice, t2.sl, t2.tp], [5842.25, null, 5860.75]);
      // walidacja po stronie serwera
      for (const [k, v] of [['entryPrice', 'abc'], ['sl', '-5'], ['tp', '1e9'], ['exitPrice', '12 34 x'], ['entryPrice', 'Infinity']]) {
        const r = await H.dash(R.S.base, `/api/trades/${id}`, { [k]: v }, { method: 'PATCH' });
        assert.equal(r.status, 400, `${k}=${v} → ${r.status}`);
        assert.ok(r.j.fields?.[k], `komunikat przy polu ${k}`);
      }
      assert.equal((await R.row(id)).entryPrice, 5842.25, 'odrzucone żądanie nie zmienia danych');
      assert.deepEqual(await R.A.get('/__test/violations'), []);
    } finally { R.stop(); }
  });

  test('wykresy-05: /api/data nie zawiera rysunków (także długich), lista trade\'ów nie rośnie', async () => {
    const R = await rig();
    try {
      const id = (await H.dash(R.S.base, '/api/trades', { ...NEW, entryPrice: 5842 })).j.id;
      const base = JSON.stringify(await R.data());
      // rysunki 3 × 2000 znaków wpisane bezpośrednio w atrapę (zapis rysunków to etap 9)
      const chunk = (c) => ({ text: { content: c.repeat(2000) } });
      const r = await fetch(`${R.A.base}/v1/pages/${id}`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { Rysunki: { rich_text: [chunk('A'), chunk('B'), chunk('C')] } } }),
      });
      assert.equal(r.status, 200);
      const stored = (await R.A.get('/__test/pages?ds=trades')).find((p) => p.id === id).p.Rysunki.rich_text;
      assert.equal(stored.map((x) => x.plain_text ?? x.text?.content ?? '').join('').length, 6000, 'atrapa przyjęła 6000 znaków');
      const d = await R.data();
      const raw = JSON.stringify(d);
      assert.ok(!raw.includes('AAAAAAAAAA') && !raw.includes('CCCCCCCCCC'), 'treść rysunków nie jest w /api/data');
      assert.ok(d.data.trades.every((t) => !('drawings' in t)), 'brak klucza drawings w trade\'ach');
      assert.ok(Math.abs(raw.length - base.length) < 400, `rozmiar odpowiedzi bez zmian (${base.length} → ${raw.length})`);
      assert.equal(d.fields.trades.drawings, 'rich_text', 'dashboard wie, że pole istnieje');
    } finally { R.stop(); }
  });

  test('wykresy-05: stats.normalizeTrades: ceny jako liczby albo null, puste pola nie psują statystyk', async () => {
    const S = await lib('public/js/stats.js');
    const base = { _id: 'a', date: '2026-10-26', typ: { name: 'Live' }, dir: { name: 'Long' }, r: 2, pnl: 100 };
    const [x, y, z] = S.normalizeTrades([
      { ...base, entryPrice: 5842.25, exitPrice: 5850, sl: 5838, tp: 5860 },
      { ...base, _id: 'b' },
      { ...base, _id: 'c', entryPrice: '5842', sl: NaN, tp: null },
    ]);
    assert.deepEqual([x.entryPrice, x.exitPrice, x.sl, x.tp], [5842.25, 5850, 5838, 5860]);
    assert.deepEqual([y.entryPrice, y.exitPrice, y.sl, y.tp], [null, null, null, null]);
    assert.deepEqual([z.entryPrice, z.sl, z.tp], [null, null, null], 'tekst i NaN to null');
    assert.ok(x.counted && y.counted && z.counted);
    assert.equal([x, y, z].reduce((a, t) => a + t.r, 0), 6);
  });

  test('wykresy-05: R4 strefa czasu: wejście zapisane z time_zone wraca jako ten sam moment (UTC), niezależnie od strefy komputera', async () => {
    const R = await rig();
    try {
      const S = await lib('public/js/stats.js');
      const id = (await H.dash(R.S.base, '/api/trades', { ...NEW, exitDate: '2026-10-26', exitTime: '10:15' })).j.id;
      const p = await R.props(id);
      assert.equal(p.Data.date.time_zone, 'America/New_York', 'zapis ustawia time_zone');
      assert.equal(p['Wyjście'].date.time_zone, 'America/New_York');
      const t = S.normalizeTrades([await R.row(id)])[0];
      assert.equal(t.at, Date.UTC(2026, 9, 26, 13, 30), '09:30 w Nowym Jorku (EDT) = 13:30 UTC');
      assert.equal(t.dur, 45, 'czas trwania z wejścia i wyjścia w tej samej strefie');
      // tz niepoprawna → Europe/Warsaw (09:30 CEST = 07:30 UTC 26.10.2026)
      const id2 = (await H.dash(R.S.base, '/api/trades', { ...NEW, tz: 'Nie/Ma' })).j.id;
      assert.equal((await R.props(id2)).Data.date.time_zone, 'Europe/Warsaw');
      assert.equal(S.normalizeTrades([await R.row(id2)])[0].at, Date.UTC(2026, 9, 26, 8, 30), '26.10.2026 Warszawa ma jeszcze CET (zmiana czasu 25.10): 09:30 = 08:30 UTC');
    } finally { R.stop(); }
  });

  test('wykresy-05: formularz ma cztery pola cen i teksty EN (źródło)', () => {
    const f = readFileSync(path.join(ROOT, 'public/js/form.js'), 'utf8');
    for (const k of ['entryPrice', 'exitPrice', 'sl', 'tp']) assert.ok(f.includes(`'${k}'`), `form.js: ${k}`);
    const en = json(path.join(ROOT, 'public/i18n/en.json'));
    for (const k of ['Cena wejścia', 'Cena wyjścia', 'np. 5842,25']) assert.ok(en[k], `en.json: ${k}`);
  });
};
