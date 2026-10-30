// backtest-E2: migracja 006 (pola „Sesja backtestu”, „MAE (R)”, „MFE (R)” w bazie Trade'y) i zapis tych pól przez buildTradeProps. Tylko atrapa Notion.
// Decyzja użytkownika 30.10.2026: «Tak, dodać pola» (projekt §11, 18a).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const SCHEMA = () => json(path.join(ROOT, 'schema/notion-schema.json'));
  const TYPES = { btSession: 'rich_text', btMae: 'number', btMfe: 'number' };
  const NAMES = {
    pl: { btSession: 'Sesja backtestu', btMae: 'MAE (R)', btMfe: 'MFE (R)' },
    en: { btSession: 'Backtest session', btMae: 'MAE (R)', btMfe: 'MFE (R)' },
  };
  function envDir(lang = 'pl', version = 5) {
    const dir = H.tmp();
    const I = H.IDS;
    writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x\nNOTION_ROOT_URL=${H.PARENT_URL}\nDS_TRADES=${I.DS_TRADES}\nDS_KONTA=${I.DS_KONTA}\nDS_DZIENNIK=${I.DS_DZIENNIK}\nDS_FINANSE=${I.DS_FINANSE}\n`);
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: version, lang }));
    return dir;
  }
  const dumpPages = (dump) => Object.fromEntries(Object.values(dump).flatMap((d) => d.pages.map((p) => [p.id, H.canon({ props: p.properties, trash: !!p.in_trash })])));

  test('backtest-E2: migracja 006 jest addytywna i zgodna ze schematem', async () => {
    const { loadMigrations, validateMigration } = await lib('lib/migrate.mjs');
    const { ROLES } = await lib('lib/roles.mjs');
    const m = (await loadMigrations(path.join(ROOT, 'migrations'))).find((x) => x.version === 6);
    assert.ok(m, 'migracja 006 istnieje');
    validateMigration(m, m.file);
    assert.deepEqual(m.ops.map((o) => `${o.op}:${o.db}:${o.role}:${o.spec.type}`), ['addProperty:trades:btSession:rich_text', 'addProperty:trades:btMae:number', 'addProperty:trades:btMfe:number']);
    for (const o of m.ops) {
      assert.deepEqual(o.spec.name, { pl: NAMES.pl[o.role], en: NAMES.en[o.role] }, o.role);
      assert.ok(ROLES.trades[o.role]?.optional, `rola ${o.role} opcjonalna`);
      assert.deepEqual(ROLES.trades[o.role].types, [TYPES[o.role]]);
      assert.ok(ROLES.trades[o.role].names.includes(o.spec.name.pl) && ROLES.trades[o.role].names.includes(o.spec.name.en), `${o.role}: nazwy PL i EN znane roli`);
    }
    const sch = SCHEMA();
    assert.equal(sch.schemaVersion, 6);
    for (const o of m.ops) assert.deepEqual(sch.databases.trades.properties[o.role], { type: o.spec.type, name: o.spec.name }, `schemat: ${o.role}`);
  });

  for (const lang of ['pl', 'en']) {
    test(`backtest-E2: migracja 006 na atrapie (${lang})`, async () => {
      // atrapa startuje ze schematem wersji 2: dry-run pokazuje migracje 003–006, sprawdzamy kroki wersji 6
      const B = await H.atrapa(lang === 'pl' ? 5600 : 5601);
      const upd = path.join(ROOT, 'update.mjs');
        try {
          const dirB = envDir(lang, 2);
          const envB = H.cleanEnv({ NOTION_API_BASE: B.base, THQ_CONFIG_DIR: dirB });
          const before = await B.dump();
          const dry = await H.run(upd, ['--migrate-only', '--dry-run', '--json'], envB);
          assert.equal(dry.code, 0, dry.err);
          const ch = dry.lines.find((l) => l.migrations).migrations.changes.filter((c) => c.version === 6);
          assert.deepEqual(ch.map((c) => `${c.kind}:${c.status}`), Array(3).fill('property:add'));
          assert.deepEqual(ch.map((c) => c.name).sort(), Object.values(NAMES[lang]).sort());
          assert.deepEqual(await B.writes(), [], 'dry-run niczego nie zapisuje');
          const r1 = await H.run(upd, ['--migrate-only', '--json'], envB);
          assert.equal(r1.code, 0, r1.err);
          const after = await B.dump();
          const sTr = after[H.IDS.DS_TRADES].schema;
          for (const [role, type] of Object.entries(TYPES)) assert.equal(sTr[NAMES[lang][role]]?.type, type, `${lang}: pole ${NAMES[lang][role]}`);
          for (const [k, v] of Object.entries(before[H.IDS.DS_TRADES].schema)) {
            if (k === 'Wyjście' || k === 'Exit') continue; // pole z migracji 001 (atrapa startuje bez niego)
            assert.equal(H.canon(sTr[k]), H.canon(v), `pole „${k}” nietknięte`);
          }
          for (const ds of [H.IDS.DS_KONTA, H.IDS.DS_DZIENNIK, H.IDS.DS_FINANSE]) assert.equal(H.canon(after[ds].schema), H.canon(before[ds].schema), 'inne bazy nietknięte');
          assert.deepEqual(dumpPages(after), dumpPages(before), 'wpisy bez zmian');
          assert.equal(json(path.join(dirB, 'config.local.json')).schemaVersion, 6);
          const w = (await B.writes()).length;
          const r2 = await H.run(upd, ['--migrate-only', '--json'], envB);
          assert.equal(r2.code, 0, r2.err);
          assert.equal((await B.writes()).length, w, 'drugi przebieg niczego nie zapisuje');
          // ponowne przejście od wersji 5 nie dubluje pól (instalacja z polem pod znaną nazwą pomija krok)
          writeFileSync(path.join(dirB, 'config.local.json'), JSON.stringify({ schemaVersion: 5, lang }));
          await H.run(upd, ['--migrate-only', '--json'], envB);
          const names = Object.keys((await B.dump())[H.IDS.DS_TRADES].schema);
          for (const n of new Set(Object.values(NAMES[lang]))) assert.equal(names.filter((x) => x === n).length, 1, n);
          assert.deepEqual(await B.get('/__test/violations'), [], 'zero naruszeń zasad schematu');
      } finally { B.stop(); }
    });
  }

  // schemat bazy w postaci, jakiej używa buildTradeProps (role → nazwa i typ), bez Notion
  const schOf = (roles) => ({ roles: Object.fromEntries(Object.entries(roles).map(([r, type]) => [r, { name: `P_${r}`, type }])), optionNames: {}, optMaps: {} });
  const T = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? '')) : s);

  test('backtest-E2: zapis btSession', async () => {
    const { buildTradeProps } = await lib('lib/writes.mjs');
    const sch = schOf({ title: 'title', btSession: 'rich_text' });
    const p = buildTradeProps({ btSession: 'CPI 2024 [bt-abc123/t1]' }, sch, [], { creating: false }, T);
    assert.deepEqual(p.P_btSession, { rich_text: [{ text: { content: 'CPI 2024 [bt-abc123/t1]' } }] });
    assert.throws(() => buildTradeProps({ btSession: 'x'.repeat(201) }, sch, [], { creating: false }, T), (e) => e.status === 400 && /200/.test(e.fields.btSession));
    // przed migracją 006: pola nie ma w bazie → komunikat jak przy „Kontrakt”
    const old = schOf({ title: 'title' });
    assert.throws(() => buildTradeProps({ btSession: 'CPI 2024 [bt-abc123/t1]' }, old, [], { creating: false }, T), (e) => e.status === 400 && /nie ma jeszcze pola „Sesja backtestu”.*aktualizację/.test(e.fields.btSession));
    // brak klucza = brak zmian
    assert.deepEqual(buildTradeProps({}, old, [], { creating: false }, T), {});
  });
};
