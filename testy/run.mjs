// Wszystkie testy jednym poleceniem: node testy/run.mjs  (opcjonalnie fragment nazwy: node testy/run.mjs aktualizacja)
// Działają WYŁĄCZNIE na atrapie Notion (testy/atrapa-notion.mjs) i fałszywym serwerze wydań. Prawdziwe Notion ani GitHub
// nie dostają żadnego żądania: procesy potomne dostają czyste środowisko bez kluczy (pomocnicze.cleanEnv).
// Runs every test against the Notion mock and a fake release server only.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import * as H from './pomocnicze.mjs';
import { treeHash } from '../lib/updater.mjs';
import { loadMigrations, validateMigration } from '../lib/migrate.mjs';
import { patchDataSource } from '../lib/workspace.mjs';
import { backupAll, planRestore, applyRestore } from '../lib/backup.mjs';
import { createNotion } from '../lib/notion.mjs';

const { ROOT, IDS } = H;
const only = process.argv[2] || '';
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const json = (f) => JSON.parse(readFileSync(f, 'utf8'));
let port = 4600;
const nextPort = () => ++port;
const pagesOf = (dump) => Object.fromEntries(Object.values(dump).flatMap((d) => d.pages.map((p) => [p.id, H.canon({ props: p.properties, trash: !!p.in_trash })])));

// ---------- zasady migracji ----------
test('migracje: tylko dozwolone operacje, zakazane odrzucone', async () => {
  const ms = await loadMigrations(path.join(ROOT, 'migrations'));
  assert.ok(ms.length >= 1);
  for (const m of ms) validateMigration(m, m.file);
  const bad = [
    { ops: [{ op: 'deleteProperty', db: 'trades', role: 'r' }] },
    { ops: [{ op: 'renameProperty', db: 'trades', role: 'r' }] },
    { ops: [{ op: 'changeType', db: 'trades', role: 'r' }] },
    { ops: [{ op: 'removeOption', db: 'trades', role: 'setup' }] },
    { ops: [{ op: 'addProperty', db: 'trades', role: 'x', spec: { type: 'relation', name: 'X', to: 'konta', syncedRole: 'y' } }] },
    { ops: [{ op: 'addOption', db: 'trades', role: 'setup', option: { name: 'A' }, remove: true }] },
  ];
  for (const m of bad) assert.throws(() => validateMigration(m), /zabronion|niedozwolony|dwustronna/);
  // jedyny zapis schematu odmawia zanim wyśle żądanie
  const props = { R: { id: 'a', type: 'number' }, Setup: { id: 'b', type: 'select', select: { options: [{ name: 'A' }, { name: 'B' }] } } };
  let sent = 0;
  const fake = { get: async () => ({ properties: props }), patch: async () => { sent++; return {}; } };
  await assert.rejects(patchDataSource(fake, 'ds', { R: null }), /usuwanie/);
  await assert.rejects(patchDataSource(fake, 'ds', { R: { rich_text: {} } }), /typu/);
  await assert.rejects(patchDataSource(fake, 'ds', { R: { name: 'R2' } }), /nazwy/);
  await assert.rejects(patchDataSource(fake, 'ds', { Setup: { select: { options: [{ name: 'A' }] } } }), /opcji/);
  await assert.rejects(patchDataSource(fake, 'ds', { R: { number: { format: 'dollar' } } }), /definicji/);
  assert.equal(sent, 0);
  await patchDataSource(fake, 'ds', { Setup: { select: { options: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] } }, Nowe: { date: {} } });
  assert.equal(sent, 1);
  // CONTRIBUTING.md opisuje zasadę
  assert.match(readFileSync(path.join(ROOT, 'CONTRIBUTING.md'), 'utf8'), /addProperty/);
});

// ---------- tłumaczenia ----------
test('i18n: każdy tekst interfejsu i serwera ma tłumaczenie EN', () => {
  const en = json(path.join(ROOT, 'public/i18n/en.json'));
  const pl = json(path.join(ROOT, 'public/i18n/pl.json'));
  const files = [
    ...readdirSync(path.join(ROOT, 'public/js')).map((f) => path.join(ROOT, 'public/js', f)),
    ...readdirSync(path.join(ROOT, 'lib')).map((f) => path.join(ROOT, 'lib', f)),
    path.join(ROOT, 'server.mjs'), path.join(ROOT, 'public/index.html'),
  ];
  const re = /\b(?:t|tr)(\.p)?\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g;
  const reAttr = /data-i18n(?:-aria|-title)?="([^"]+)"/g;
  const missing = [];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(s))) {
      if (m[2] === '`' && m[3].includes('${')) continue;
      const k = m[3].replace(/\\(['"`\\])/g, '$1');
      if (!(k in en)) missing.push(`${path.basename(f)}: ${k}`);
      if (m[1] && (typeof en[k] !== 'object' || typeof pl[k] !== 'object')) missing.push(`${path.basename(f)}: liczba mnoga ${k}`);
    }
    if (f.endsWith('.html')) while ((m = reAttr.exec(s))) if (!(m[1] in en)) missing.push(`index.html: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});

// ---------- instalacja od zera ----------
for (const lang of ['pl', 'en']) {
  test(`setup ${lang.toUpperCase()} na pustej atrapie: bazy, widoki, DEMO, dashboard działa`, async () => {
    const A = await H.atrapa(nextPort(), { ATRAPA_PUSTA: '1' });
    const dir = H.tmp();
    const r = await H.run(path.join(ROOT, 'setup.mjs'), ['--lang', lang, '--token', 'test', '--parent', H.PARENT_URL, '--demo', '--yes'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
    assert.equal(r.code, 0, r.err || r.out);
    const env = readFileSync(path.join(dir, '.env'), 'utf8');
    for (const k of ['NOTION_TOKEN', 'DS_TRADES', 'DS_KONTA', 'DS_DZIENNIK', 'DS_FINANSE', 'NOTION_ROOT_URL']) assert.match(env, new RegExp(`^${k}=.+`, 'm'));
    const cfg = json(path.join(dir, 'config.local.json'));
    assert.equal(cfg.lang, lang);
    assert.equal(cfg.schemaVersion, json(path.join(ROOT, 'schema/notion-schema.json')).schemaVersion);
    assert.equal(cfg.onboarded, false);
    assert.ok(cfg.fields.trades.exit && cfg.fields.konta.saldo && cfg.fields.finanse.balance);
    assert.ok(existsSync(path.join(dir, lang === 'en' ? 'Open journal in Notion.url' : 'Otwórz journal w Notion.url')));
    const views = await A.get('/__test/views');
    assert.equal(views.filter((v) => v.name !== 'Default view').length, 11);
    const loose = await A.get('/__test/loose');
    const home = loose.find((p) => p.parent?.type === 'page_id');
    assert.equal(home.properties.title.title[0].plain_text, lang === 'en' ? 'Trading Journal' : 'Dziennik tradingowy');
    assert.equal(home.children.filter((c) => c.type === 'child_database').length, 4);
    const dump = await A.dump();
    const names = Object.values(dump).map((d) => d.name).sort();
    assert.deepEqual(names, (lang === 'en' ? ['Accounts', 'Expenses and payouts', 'Journal', 'Trades'] : ['Dziennik', 'Konta', "Trade'y", 'Wydatki i payouty']).sort());
    const konta = Object.values(dump).find((d) => d.name === (lang === 'en' ? 'Accounts' : 'Konta'));
    assert.ok(konta.schema[lang === 'en' ? 'Trades' : "Trade'y"], 'relacja zwrotna ma nazwę ze schematu');
    assert.equal(konta.schema[lang === 'en' ? 'Balance' : 'Saldo'].type, 'formula');
    // dashboard na tej instalacji (konfiguracja tylko z THQ_CONFIG_DIR)
    const S = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
    const d = await (await fetch(`${S.base}/api/data`)).json();
    assert.equal(d.data.trades.length, 10);
    assert.equal(d.data.konta.length, 2);
    assert.equal(d.data.finanse.length, 4);
    assert.deepEqual(d.requiredMissing, {});
    assert.ok(d.data.trades.some((t) => t.typ.name === 'Niewzięty'), 'Paper mapowany na znacznik');
    assert.ok(d.data.finanse.some((f) => f.kind.name === 'Payout'));
    assert.equal(d.meta.lang, lang);
    assert.equal(d.meta.onboarded, false);
    const h = await H.dash(S.base, '/api/health/full', {});
    const bad = h.j.checks.filter((c) => c.status === 'error');
    assert.deepEqual(bad, []);
    assert.equal(h.j.checks.find((c) => c.id === 'views').status, 'ok');
    assert.equal(h.j.checks.find((c) => c.id === 'schema').status, 'ok');
    assert.equal(h.j.checks.find((c) => c.id === 'demo').count, 17);
    // usuwanie DEMO: podgląd nic nie zmienia, potem tylko wpisy z prefiksem
    const w0 = (await A.writes()).length;
    const prev = await H.dash(S.base, '/api/demo/remove', {});
    assert.equal(prev.j.count, 17);
    assert.equal((await A.writes()).length, w0);
    const rm = await H.run(path.join(ROOT, 'setup.mjs'), ['--remove-demo', '--yes'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
    assert.equal(rm.code, 0, rm.err);
    const left = Object.values(await A.dump()).flatMap((x) => x.pages.filter((p) => !p.in_trash));
    assert.equal(left.length, 0);
    // ponowny setup bez --force niczego nie tworzy
    const again = await H.run(path.join(ROOT, 'setup.mjs'), ['--lang', lang, '--token', 'test', '--parent', H.PARENT_URL, '--yes'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
    assert.equal(again.code, 0);
    assert.equal(Object.keys(await A.dump()).length, 4);
    S.stop(); A.stop();
  });
}

// ---------- istniejąca instalacja (polski schemat sprzed wersji 1.0) ----------
test('migracja istniejącej instalacji: mapowanie po polskich nazwach, w Notion nic się nie zmienia', async () => {
  const A = await H.atrapa(nextPort());
  const dir = H.tmp();
  const before = await A.dump();
  const S = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'x', ...IDS });
  const d = await (await fetch(`${S.base}/api/data`)).json();
  assert.ok(d.data.trades.length > 100);
  assert.deepEqual(d.requiredMissing, {});
  await H.sleep(200);
  const cfg = json(path.join(dir, 'config.local.json'));
  assert.equal(cfg.legacy, true);
  assert.equal(cfg.onboarded, true, 'skonfigurowana instalacja nie dostaje automatycznie Pierwszych kroków');
  for (const r of ['title', 'typ', 'date', 'exit', 'r', 'pnl', 'konta']) assert.ok(cfg.fields.trades[r], `rola trades.${r}`);
  assert.ok(cfg.fields.konta.saldo && cfg.fields.finanse.kind);
  // zmiana nazwy pola w Notion niczego nie psuje (pole szukane po identyfikatorze)
  await A.post('/__test/rename-prop', { ds: 'trades', from: 'R', to: 'Wynik w R' });
  const d2 = await (await fetch(`${S.base}/api/data?refresh=1`)).json();
  assert.equal(d2.data.trades.filter((t) => t.r != null).length, d.data.trades.filter((t) => t.r != null).length);
  await A.post('/__test/rename-prop', { ds: 'trades', from: 'Wynik w R', to: 'R' });
  assert.deepEqual(await A.writes(), [], 'żadnych zapisów do Notion');
  assert.deepEqual(pagesOf(await A.dump()), pagesOf(before));
  S.stop(); A.stop();
});

// ---------- kopia i przywracanie ----------
test('kopia i przywracanie: podgląd bez zapisu, --apply przywraca wartości i wyjmuje z kosza', async () => {
  const A = await H.atrapa(nextPort());
  const dir = H.tmp();
  const notion = createNotion({ token: 'x', base: A.base });
  const sources = { trades: IDS.DS_TRADES, konta: IDS.DS_KONTA, dziennik: IDS.DS_DZIENNIK, finanse: IDS.DS_FINANSE };
  const b = await backupAll(notion, sources, path.join(dir, 'backups'));
  assert.ok(existsSync(path.join(b.dir, 'manifest.json')) && existsSync(path.join(b.dir, 'trades.json')));
  const before = pagesOf(await A.dump());
  const trades = (await A.get('/__test/pages?ds=trades'));
  const [p1, p2] = [trades[3], trades[7]];
  await A.post('/__test/notion-edit', { id: p1.id, set: { R: 99, Notatki: 'zepsute' } });
  await fetch(`${A.base}/v1/pages/${p2.id}`, { method: 'PATCH', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify({ in_trash: true }) });
  const w0 = (await A.writes()).length;
  // podgląd przez CLI (domyślny tryb)
  writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x\nDS_TRADES=${IDS.DS_TRADES}\nDS_KONTA=${IDS.DS_KONTA}\nDS_DZIENNIK=${IDS.DS_DZIENNIK}\nDS_FINANSE=${IDS.DS_FINANSE}\n`);
  const prev = await H.run(path.join(ROOT, 'restore.mjs'), [], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
  assert.equal(prev.code, 0, prev.err);
  assert.match(prev.out, /Do zmiany: 2/);
  assert.equal((await A.writes()).length, w0, 'podgląd nic nie zapisał');
  const plan = await planRestore(notion, sources, b.dir);
  assert.deepEqual(plan.items.map((i) => i.action).sort(), ['untrash', 'update']);
  const ap = await H.run(path.join(ROOT, 'restore.mjs'), ['--apply', '--yes'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
  assert.equal(ap.code, 0, ap.err);
  const after = pagesOf(await A.dump());
  assert.equal(after[p1.id], before[p1.id]);
  assert.equal(after[p2.id], before[p2.id]);
  assert.equal((await planRestore(notion, sources, b.dir)).items.length, 0, 'drugi przebieg bez zmian');
  void applyRestore;
  A.stop();
});

// ---------- aktualizacja ----------
// wydanie testowe = następna wersja minor z kolejną migracją (niezależnie od bieżącego numeru)
const CUR = json(path.join(ROOT, 'package.json')).version;
const NEXT = CUR.replace(/^(\d+)\.(\d+)\.\d+$/, (m, a, b) => `${a}.${Number(b) + 1}.0`);
const SV = json(path.join(ROOT, 'schema/notion-schema.json')).schemaVersion;
const NSV = SV + 1;
const MIGFILE = `migrations/${String(NSV).padStart(3, '0')}-test-ocena.mjs`;
const MIG2 = `export default {
  version: ${NSV},
  description: { pl: 'Test: pole Ocena, opcja Breaker, widok Wg oceny', en: 'Test: Rating property, Breaker option, By rating view' },
  ops: [
    { op: 'addProperty', db: 'trades', role: 'rating', spec: { type: 'number', name: { pl: 'Ocena', en: 'Rating' } } },
    { op: 'addOption', db: 'trades', role: 'setup', option: { name: 'Breaker', color: 'pink' } },
    { op: 'addView', db: 'trades', view: { key: 'rating', type: 'table', name: { pl: 'Wg oceny', en: 'By rating' }, sorts: [{ role: 'rating', direction: 'descending' }] } },
  ],
};
`;
function releaseFiles(version = NEXT) {
  const files = H.appFiles().map((f) => {
    if (f.path === 'package.json') { const p = JSON.parse(f.data); p.version = version; return { ...f, data: Buffer.from(JSON.stringify(p, null, 2) + '\n') }; }
    if (f.path === 'schema/notion-schema.json') { const s = JSON.parse(f.data); s.schemaVersion = NSV; return { ...f, data: Buffer.from(JSON.stringify(s, null, 2)) }; }
    return f;
  });
  files.push({ path: MIGFILE, data: Buffer.from(MIG2) });
  return files;
}
async function release(version = NEXT, { badHash = false } = {}) {
  const files = releaseFiles(version);
  const hash = badHash ? '0'.repeat(64) : treeHash(files);
  const gh = { release: { version, body: `## Zmiany\n- **Nowe** pole Ocena\n- widok \`Wg oceny\`\n\ntree-sha256: ${hash}`, tarball: H.tarGz(files, `local-trading-journal-${version}`) } };
  const srv = await H.fakeGitHub(nextPort(), gh);
  return { ...srv, gh, env: { UPDATE_API_BASE: srv.base, UPDATE_DOWNLOAD_BASE: srv.base } };
}
function install(dir, extraCfg = {}) {
  H.writeTree(dir, H.appFiles());
  writeFileSync(path.join(dir, '.env'), `# moje klucze\nNOTION_TOKEN=x\nDS_TRADES=${IDS.DS_TRADES}\nDS_KONTA=${IDS.DS_KONTA}\nDS_DZIENNIK=${IDS.DS_DZIENNIK}\nDS_FINANSE=${IDS.DS_FINANSE}\n`);
  writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: SV, lang: 'pl', updateCheck: true, fields: {}, options: {}, ...extraCfg }, null, 2));
  mkdirSync(path.join(dir, 'public/img/firmy/custom'), { recursive: true });
  writeFileSync(path.join(dir, 'public/img/firmy/custom/moja-firma.webp'), 'logo użytkownika');
}
const stripNew = (dump) => { const o = pagesOf(dump); for (const k of Object.keys(o)) o[k] = o[k].replace(/,?"Ocena":\{[^}]*\}/, ''); return o; };

test('aktualizacja do następnej wersji (ZIP): dry-run nic nie zapisuje, dane nietknięte, drugi przebieg bez zmian', async () => {
  const A = await H.atrapa(nextPort());
  const R = await release();
  const dir = H.tmp();
  install(dir);
  const envBefore = readFileSync(path.join(dir, '.env'));
  const before = await A.dump();
  const env = H.cleanEnv({ NOTION_API_BASE: A.base, ...R.env });
  // dry-run
  const dry = await H.run(path.join(dir, 'update.mjs'), ['--dry-run', '--json'], env, { cwd: dir });
  assert.equal(dry.code, 0, dry.err || dry.out);
  const plan = dry.lines.find((l) => l.plan).plan;
  assert.equal(plan.mode, 'zip'); assert.equal(plan.target, NEXT); assert.equal(plan.hasCode, true);
  assert.deepEqual(plan.notion.map((c) => `${c.kind}:${c.status}`).sort(), ['option:add', 'property:add', 'view:add']);
  assert.deepEqual(await A.writes(), [], 'dry-run nie zapisuje do Notion');
  assert.equal(json(path.join(dir, 'package.json')).version, CUR, 'dry-run nie podmienia plików');
  assert.ok(!existsSync(path.join(dir, 'backups')), 'dry-run nie robi kopii');
  // aktualizacja
  const up = await H.run(path.join(dir, 'update.mjs'), ['--yes', '--json'], env, { cwd: dir });
  assert.equal(up.code, 0, up.err || up.out);
  const done = up.lines.find((l) => l.done);
  assert.equal(done.target, NEXT);
  assert.equal(json(path.join(dir, 'package.json')).version, NEXT);
  assert.ok(existsSync(path.join(dir, MIGFILE)));
  assert.deepEqual(readFileSync(path.join(dir, '.env')), envBefore, '.env nietknięty');
  assert.equal(readFileSync(path.join(dir, 'public/img/firmy/custom/moja-firma.webp'), 'utf8'), 'logo użytkownika');
  const cfg = json(path.join(dir, 'config.local.json'));
  assert.equal(cfg.schemaVersion, NSV);
  assert.ok(cfg.fields.trades.rating && cfg.views.trades.rating);
  assert.ok(readdirSync(path.join(dir, 'backups')).length === 1);
  const after = await A.dump();
  const trades = Object.values(after).find((d) => d.name === 'trades');
  assert.equal(trades.schema.Ocena.type, 'number');
  assert.ok(trades.schema.Setup.select.options.some((o) => o.name === 'Breaker'));
  assert.ok(trades.schema.Setup.select.options.length === Object.values(before).find((d) => d.name === 'trades').schema.Setup.select.options.length + 1);
  assert.deepEqual(stripNew(after), stripNew(before), 'wartości wszystkich stron bez zmian');
  assert.deepEqual(await A.get('/__test/violations'), []);
  // drugi przebieg: kod aktualny, migracje bez zmian, zero zapisów
  const w1 = (await A.writes()).length;
  const again = await H.run(path.join(dir, 'update.mjs'), ['--yes', '--json'], env, { cwd: dir });
  assert.equal(again.code, 0, again.err || again.out);
  assert.deepEqual(again.lines.find((l) => l.done).changes.filter((c) => c.status !== 'skip'), []);
  assert.equal((await A.writes()).length, w1, 'drugi przebieg niczego nie zapisał');
  A.stop(); R.close();
});

test('aktualizacja: zła suma archiwum przerywa bez zmian w plikach', async () => {
  const A = await H.atrapa(nextPort());
  const R = await release(NEXT, { badHash: true });
  const dir = H.tmp();
  install(dir);
  const up = await H.run(path.join(dir, 'update.mjs'), ['--yes', '--json'], H.cleanEnv({ NOTION_API_BASE: A.base, ...R.env }), { cwd: dir });
  assert.notEqual(up.code, 0);
  assert.match(up.lines.find((l) => l.error).error.message, /Suma|checksum/);
  assert.equal(json(path.join(dir, 'package.json')).version, CUR);
  assert.ok(!existsSync(path.join(dir, MIGFILE)));
  A.stop(); R.close();
});

test('aktualizacja przez git: odmowa przy lokalnych zmianach, potem git pull --ff-only i migracje', async () => {
  const A = await H.atrapa(nextPort());
  const R = await release();
  const git = (cwd, ...a) => { const r = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'core.autocrlf=false', ...a], { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`); return r.stdout; };
  const bare = H.tmp('ltj-bare-'), seed = H.tmp('ltj-seed-'), work = H.tmp('ltj-work-');
  git(bare, 'init', '--bare', '-q', '-b', 'main');
  H.writeTree(seed, H.appFiles());
  git(seed, 'init', '-q', '-b', 'main'); git(seed, 'add', '-A'); git(seed, 'commit', '-q', '-m', 'v1.0.0'); git(seed, 'remote', 'add', 'origin', bare); git(seed, 'push', '-q', 'origin', 'main');
  git(work, 'clone', '-q', bare, '.');
  writeFileSync(path.join(work, '.env'), `NOTION_TOKEN=x\nDS_TRADES=${IDS.DS_TRADES}\nDS_KONTA=${IDS.DS_KONTA}\nDS_DZIENNIK=${IDS.DS_DZIENNIK}\nDS_FINANSE=${IDS.DS_FINANSE}\n`);
  writeFileSync(path.join(work, 'config.local.json'), JSON.stringify({ schemaVersion: SV, lang: 'pl' }));
  H.writeTree(seed, releaseFiles()); git(seed, 'add', '-A'); git(seed, 'commit', '-q', '-m', `v${NEXT}`); git(seed, 'push', '-q', 'origin', 'main');
  const env = H.cleanEnv({ NOTION_API_BASE: A.base, ...R.env });
  // lokalna zmiana w kodzie: odmowa z wyjaśnieniem
  writeFileSync(path.join(work, 'server.mjs'), readFileSync(path.join(work, 'server.mjs'), 'utf8') + '\n// moja zmiana\n');
  const dirty = await H.run(path.join(work, 'update.mjs'), ['--yes', '--json'], env, { cwd: work });
  assert.notEqual(dirty.code, 0);
  const e = dirty.lines.find((l) => l.error).error;
  assert.equal(e.code, 'dirty'); assert.match(e.message, /lokalne zmiany/);
  assert.equal(json(path.join(work, 'package.json')).version, CUR);
  git(work, 'checkout', '--', 'server.mjs');
  const dry = await H.run(path.join(work, 'update.mjs'), ['--dry-run', '--json'], env, { cwd: work });
  assert.equal(dry.lines.find((l) => l.plan).plan.notion.length, 3, dry.err || dry.out);
  const up = await H.run(path.join(work, 'update.mjs'), ['--yes', '--json'], env, { cwd: work });
  assert.equal(up.code, 0, up.err || up.out);
  assert.equal(json(path.join(work, 'package.json')).version, NEXT);
  assert.equal(json(path.join(work, 'config.local.json')).schemaVersion, NSV);
  assert.ok(existsSync(path.join(work, '.env')));
  A.stop(); R.close();
});

test('moduł aktualizacji w dashboardzie: wykrycie, obcy Origin, plan, aktualizacja z restartem, brak sieci', async () => {
  const A = await H.atrapa(nextPort());
  const R = await release();
  const dir = H.tmp();
  install(dir);
  const before = await A.dump();
  const S = await H.server(nextPort(), { NOTION_API_BASE: A.base, ...R.env }, { cwd: dir });
  const chk = await H.dash(S.base, '/api/update/check', {});
  assert.equal(chk.j.available, true); assert.equal(chk.j.latest, NEXT); assert.match(chk.j.notes, /Ocena/);
  for (const p of ['/api/update/run', '/api/update/plan', '/api/update/check', '/api/health/full', '/api/demo/remove']) {
    const bad = await H.dash(S.base, p, {}, { origin: 'http://evil.example' });
    assert.equal(bad.status, 403, p);
  }
  const noHeader = await fetch(`${S.base}/api/update/run`, { method: 'POST', headers: { Origin: S.base, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noHeader.status, 403);
  const plan = await H.dash(S.base, '/api/update/plan', {});
  assert.equal(plan.j.canUpdate, true, JSON.stringify(plan.j));
  assert.equal(plan.j.notion.length, 3);
  assert.deepEqual(await A.writes(), []);
  const run = await H.dash(S.base, '/api/update/run', {});
  assert.equal(run.j.started, true);
  let st;
  for (let i = 0; i < 200; i++) {
    try { st = await (await fetch(`${S.base}/api/update/status`)).json(); } catch { break; }
    if (st.error || st.done) break;
    await H.sleep(150);
  }
  assert.equal(st.error, null, JSON.stringify(st));
  assert.deepEqual(st.steps.map((s) => s.status), ['done', 'done', 'done', 'running']);
  let v = '';
  for (let i = 0; i < 120 && v !== NEXT; i++) {
    await H.sleep(250);
    try { v = (await (await fetch(`${S.base}/api/health`)).json()).version; } catch { /* restart w toku */ }
  }
  assert.equal(v, NEXT, 'serwer wrócił w nowej wersji');
  const d = await (await fetch(`${S.base}/api/data`)).json();
  assert.ok(d.data.trades.length > 100);
  assert.deepEqual(stripNew(await A.dump()), stripNew(before));
  await H.dash(S.base, '/api/shutdown', {}); // zatrzymuje proces uruchomiony przez restart
  // brak sieci: cicho, bez błędu
  const S2 = await H.server(nextPort(), { NOTION_API_BASE: A.base, UPDATE_API_BASE: 'http://127.0.0.1:9' }, { cwd: dir });
  const off2 = await H.dash(S2.base, '/api/update/check', {}); // świeże sprawdzenie (pomija cache z poprzedniego testu)
  assert.equal(off2.status, 200); assert.equal(off2.j.offline, true);
  const off = await (await fetch(`${S2.base}/api/update-check`)).json();
  assert.equal(off.offline, true); assert.equal(off.available, false);
  await H.sleep(100);
  assert.equal(S2.p.err.trim(), '', 'brak błędów w logu serwera');
  S2.stop(); A.stop(); R.close();
});

// ---------- gotowość („Pierwsze kroki”, część A) ----------
test('gotowość: brak tokenu, zły token, brak dostępu, brak bazy, brak pola i naprawa z podglądem', async () => {
  const A = await H.atrapa(nextPort());
  const check = async (env, atr = A) => {
    const S = await H.server(nextPort(), { NOTION_API_BASE: atr.base, THQ_CONFIG_DIR: H.tmp(), ...env });
    const r = await H.dash(S.base, '/api/health/full', {});
    S.stop();
    return Object.fromEntries(r.j.checks.map((c) => [c.id, c]));
  };
  let c = await check({ ...IDS });
  assert.equal(c.token.status, 'error'); assert.equal(c.token.code, 'missing');
  const A401 = await H.atrapa(nextPort(), { ATRAPA_TOKEN: 'dobry' });
  c = await check({ NOTION_TOKEN: 'zly', ...IDS }, A401);
  assert.equal(c.token.status, 'error'); assert.equal(c.token.code, 'invalid');
  c = await check({ NOTION_TOKEN: 'dobry', ...IDS }, A401);
  assert.equal(c.token.status, 'ok');
  A401.stop();
  c = await check({ NOTION_TOKEN: 'x', ...IDS, DS_KONTA: '99999999-9999-4999-8999-999999999999' });
  assert.equal(c.databases.status, 'error');
  assert.equal(c.databases.items.find((i) => i.db === 'konta').code, 'noaccess');
  c = await check({ NOTION_TOKEN: 'x', ...IDS, DS_DZIENNIK: '' });
  assert.equal(c.databases.items.find((i) => i.db === 'dziennik').code, 'missing');
  c = await check({ NOTION_TOKEN: 'x', ...IDS });
  assert.equal(c.write.status, 'ok');
  assert.equal(c.security.status, 'ok');
  A.stop();
  // brak pola Wyjście, naprawa: podgląd bez zapisu, potem zapis
  const B = await H.atrapa(nextPort(), { ATRAPA_BEZ_WYJSCIA: '1' });
  const dir = H.tmp();
  const S = await H.server(nextPort(), { NOTION_API_BASE: B.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'x', ...IDS });
  let h = await H.dash(S.base, '/api/health/full', {});
  const schema = h.j.checks.find((x) => x.id === 'schema');
  assert.ok(schema.missing.some((m) => m.db === 'trades' && m.role === 'exit'));
  const w0 = (await B.writes()).length;
  const dry = await H.dash(S.base, '/api/health/fix-schema', {});
  assert.equal(dry.j.applied, false);
  assert.ok(dry.j.changes.some((x) => x.kind === 'property' && x.name === 'Wyjście'));
  assert.equal((await B.writes()).length, w0, 'podgląd nic nie zapisał');
  const ap = await H.dash(S.base, '/api/health/fix-schema', { apply: true });
  assert.equal(ap.j.applied, true);
  h = await H.dash(S.base, '/api/health/full', {});
  const s2 = h.j.checks.find((x) => x.id === 'schema');
  assert.ok(!s2.missing.some((m) => m.role === 'exit'));
  assert.equal(h.j.checks.find((x) => x.id === 'views').status, 'ok');
  assert.deepEqual(await B.get('/__test/violations'), []);
  S.stop(); B.stop();
});

// ---------- kreator instalacji w przeglądarce (API) ----------
test('kreator: od pustego katalogu do gotowego dziennika, czekanie na dostęp, awaria i wznowienie, połączenie istniejącego', async () => {
  const A = await H.atrapa(nextPort(), { ATRAPA_PUSTA: '1', ATRAPA_NIEUDOSTEPNIONA: '1', ATRAPA_TOKEN: 'ntn_dobry_token_testowy_123456' });
  const dir = H.tmp();
  const t0 = Date.now();
  const S = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
  const st = await (await fetch(`${S.base}/api/setup/state`)).json();
  assert.deepEqual([st.hasToken, st.configured, st.onboarded], [false, false, false]);
  // obcy Origin
  for (const p of ['/api/setup/token', '/api/setup/pages', '/api/setup/create', '/api/setup/connect', '/api/health/fix-all']) assert.equal((await H.dash(S.base, p, {}, { origin: 'http://evil.example' })).status, 403, p);
  // zły token: nic nie trafia do .env
  const bad = await H.dash(S.base, '/api/setup/token', { token: 'ntn_zly_token_testowy_1234567' });
  assert.equal(bad.status, 400); assert.ok(bad.j.fields.token);
  assert.ok(!existsSync(path.join(dir, '.env')));
  const ok = await H.dash(S.base, '/api/setup/token', { token: 'ntn_dobry_token_testowy_123456' });
  assert.equal(ok.status, 200, JSON.stringify(ok.j)); assert.equal(ok.j.workspace, 'Atrapa Workspace');
  assert.match(readFileSync(path.join(dir, '.env'), 'utf8'), /^NOTION_TOKEN=ntn_dobry/m);
  assert.equal((await H.dash(S.base, '/api/setup/token', { token: 'ntn_inny_token_testowy_1234567' })).j.code, 'has-token', 'działającego tokenu nie nadpisuje bez „Zmień token”');
  // dostęp: lista pusta, po udostępnieniu strona pojawia się przy kolejnym odpytaniu
  assert.equal((await H.dash(S.base, '/api/setup/pages', {})).j.pages.length, 0);
  await A.post('/__test/share', { shared: true });
  const pages = (await H.dash(S.base, '/api/setup/pages', {})).j.pages;
  assert.equal(pages.length, 1); assert.equal(pages[0].journal, null);
  // awaria przy trzeciej bazie, potem „Ponów” bez duplikatów
  await A.post('/__test/fail', { match: 'POST /v1/databases', after: 2 });
  const waitJob = async () => { for (let i = 0; i < 200; i++) { const j = await (await fetch(`${S.base}/api/setup/status`)).json(); if (!j.running) return j; await H.sleep(50); } throw new Error('tworzenie trwa za długo'); };
  assert.equal((await H.dash(S.base, '/api/setup/create', { pageId: pages[0].id, lang: 'pl', demo: true })).j.started, true);
  let job = await waitJob();
  assert.equal(job.error?.resumable, true);
  assert.equal(job.steps.find((s) => s.id === 'databases').status, 'error');
  assert.equal((await H.dash(S.base, '/api/setup/create', { pageId: pages[0].id, lang: 'pl', demo: true })).j.started, true);
  job = await waitJob();
  assert.equal(job.done, true, JSON.stringify(job));
  assert.equal(Object.keys(await A.dump()).length, 4, 'cztery bazy, bez duplikatów');
  assert.equal((await A.get('/__test/loose')).length, 2, 'jedna strona główna');
  const d = await (await fetch(`${S.base}/api/data`)).json();
  assert.equal(d.data.trades.length, 10);
  const h = await H.dash(S.base, '/api/health/full', {});
  assert.deepEqual(h.j.checks.filter((c) => c.status === 'error'), []);
  const elapsed = Date.now() - t0;
  console.log(`    czas ścieżki API (pusty katalog → gotowość OK): ${(elapsed / 1000).toFixed(1)} s`);
  assert.ok(existsSync(path.join(dir, 'Otwórz journal w Notion.url')));
  // drugi komputer: połączenie istniejącego dziennika
  const dir2 = H.tmp();
  const S2 = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir2 });
  await H.dash(S2.base, '/api/setup/token', { token: 'ntn_dobry_token_testowy_123456' });
  const list = (await H.dash(S2.base, '/api/setup/pages', {})).j.pages;
  const journal = list.find((p) => p.journal);
  assert.ok(journal, 'dziennik rozpoznany po schemacie');
  const w0 = (await A.writes()).length;
  // dziennik niekompletny (pole „Wyjście” nierozpoznawalne): schemaVersion zostaje 0, żeby naprawa uzupełniła braki
  const dir3 = H.tmp();
  const S3 = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir3 });
  await H.dash(S3.base, '/api/setup/token', { token: 'ntn_dobry_token_testowy_123456' });
  await A.post('/__test/rename-prop', { ds: "Trade'y", from: 'Wyjście', to: 'Koniec trade' });
  const half = await H.dash(S3.base, '/api/setup/connect', { pageId: journal.id });
  assert.equal(half.j.complete, false); assert.equal(half.j.schemaVersion, 0);
  assert.equal(json(path.join(dir3, 'config.local.json')).schemaVersion, 0);
  await A.post('/__test/rename-prop', { ds: "Trade'y", from: 'Koniec trade', to: 'Wyjście' });
  S3.stop();
  const con = await H.dash(S2.base, '/api/setup/connect', { pageId: journal.id });
  assert.equal(con.j.ok, true);
  assert.equal(con.j.complete, true, 'kompletny dziennik dostaje bieżącą wersję schematu');
  assert.equal(json(path.join(dir2, 'config.local.json')).schemaVersion, json(path.join(ROOT, 'schema/notion-schema.json')).schemaVersion);
  const d2 = await (await fetch(`${S2.base}/api/data`)).json();
  assert.equal(d2.data.trades.length, 10);
  assert.equal((await A.writes()).length, w0, 'połączenie niczego nie zapisuje w Notion');
  assert.equal(Object.keys(await A.dump()).length, 4);
  // utrata dostępu (integracja odłączona od strony): dane się nie wczytują, gotowość pokazuje brak dostępu do baz
  await A.post('/__test/share', { shared: false });
  const lost = await fetch(`${S2.base}/api/data?refresh=1`);
  assert.equal(lost.status, 502);
  const hl = await H.dash(S2.base, '/api/health/full', { quick: true });
  const dbs = hl.j.checks.find((c) => c.id === 'databases');
  assert.equal(dbs.status, 'error'); assert.ok(dbs.items.every((i) => i.code === 'noaccess'));
  S.stop(); S2.stop(); A.stop();
});

test('szablon: zduplikowany dziennik (nowe ID, te same nazwy) łączy się przez kreator', async () => {
  const A = await H.atrapa(nextPort(), { ATRAPA_PUSTA: '1' });
  const dir = H.tmp();
  const r = await H.run(path.join(ROOT, 'setup.mjs'), ['--lang', 'en', '--token', 'test', '--parent', H.PARENT_URL, '--demo', '--yes'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
  assert.equal(r.code, 0, r.err);
  const orig = json(path.join(dir, 'config.local.json'));
  const dup = await A.post('/__test/duplicate', { pageId: orig.rootPageId });
  const dir2 = H.tmp();
  const S = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir2 });
  await H.dash(S.base, '/api/setup/token', { token: 'ntn_inny_komputer_token_12345' });
  const pages = (await H.dash(S.base, '/api/setup/pages', {})).j.pages.filter((p) => p.journal);
  assert.equal(pages.length, 2, 'oryginał i kopia rozpoznane jako dzienniki');
  const copy = pages.find((p) => p.id === dup.id);
  assert.ok(copy, 'kopia na liście');
  assert.equal(copy.journal.lang, 'en');
  const con = await H.dash(S.base, '/api/setup/connect', { pageId: copy.id });
  assert.equal(con.j.ok, true); assert.equal(con.j.complete, true);
  const env = readFileSync(path.join(dir2, '.env'), 'utf8');
  for (const [k, v] of Object.entries({ DS_TRADES: 'trades', DS_KONTA: 'konta' })) {
    const id = env.match(new RegExp(`^${k}=(.+)$`, 'm'))[1].trim();
    assert.notEqual(id, orig.databases ? json(path.join(dir, 'config.local.json')).setupProgress?.dsIds?.[v] ?? readFileSync(path.join(dir, '.env'), 'utf8').match(new RegExp(`^${k}=(.+)$`, 'm'))[1].trim() : '', `${k} wskazuje kopię`);
  }
  const d = await (await fetch(`${S.base}/api/data`)).json();
  assert.equal(d.data.trades.length, 10);
  assert.ok(d.data.trades.some((t) => t.konta.length), 'relacje kopii działają');
  assert.equal(d.meta.lang, 'en');
  const h = await H.dash(S.base, '/api/health/full', {});
  assert.deepEqual(h.j.checks.filter((c) => c.status === 'error'), []);
  S.stop(); A.stop();
});

// ---------- kolejne urządzenie ----------
test('kolejne urządzenie: kod i PIN, zły PIN, 5 prób, wygaśnięcie, plik, synchronizacja ustawień bez pętli, urządzenia', async () => {
  const A = await H.atrapa(nextPort(), { ATRAPA_PUSTA: '1' });
  const dirA = H.tmp();
  const r = await H.run(path.join(ROOT, 'setup.mjs'), ['--lang', 'pl', '--token', 'ntn_wspolny_token_testowy_123', '--parent', H.PARENT_URL, '--demo', '--yes'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dirA }));
  assert.equal(r.code, 0, r.err);
  const cfgA = json(path.join(dirA, 'config.local.json'));
  assert.equal(cfgA.schemaVersion, SV);
  const home = (await A.get('/__test/loose')).find((p) => p.id === cfgA.rootPageId);
  const tog = home.children.find((c) => c.type === 'toggle');
  assert.ok(tog && tog.children[0].type === 'code', 'nowa instalacja ma blok ustawień');
  const SA = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dirA });
  // ustawienia A → Notion (sekret w ustawieniach jest wycinany)
  const t1 = new Date(Date.now() - 60_000).toISOString();
  const p1 = await H.dash(SA.base, '/api/sync', { settings: { palette: 'mono', beR: 0.2, token: 'nie-zapisuj' }, updatedAt: t1 });
  assert.equal(p1.j.written, true, JSON.stringify(p1.j));
  const block = JSON.stringify(await A.get('/__test/loose'));
  assert.ok(!block.includes('nie-zapisuj') && !block.includes('ntn_wspolny'), 'w Notion nie ma tokenu ani sekretów');
  // eksport: obcy Origin odrzucony, kod i PIN
  assert.equal((await H.dash(SA.base, '/api/transfer/export', {}, { origin: 'http://evil.example' })).status, 403);
  const ex = (await H.dash(SA.base, '/api/transfer/export', {})).j;
  assert.match(ex.pin, /^\d{6}$/); assert.match(ex.code, /^LTJ1\./); assert.match(ex.fileName, /\.ltj$/);
  assert.ok(!SA.p.out.includes(ex.pin) && !SA.p.out.includes(ex.code.slice(5, 40)) && !SA.p.err.includes(ex.code.slice(5, 40)), 'kod i PIN nie trafiają do logów');
  const wrong = ex.pin === '000000' ? '111111' : '000000';
  // urządzenie B: zły kod, zły PIN, dobry PIN, ponowne użycie
  const dirB = H.tmp();
  const SB = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dirB });
  assert.equal((await H.dash(SB.base, '/api/transfer/import', {}, { origin: 'http://evil.example' })).status, 403);
  assert.equal((await H.dash(SB.base, '/api/transfer/import', { code: 'cokolwiek', pin: '123456' })).j.code, 'bad-code');
  const bad = await H.dash(SB.base, '/api/transfer/import', { code: ex.code, pin: wrong });
  assert.equal(bad.status, 400); assert.equal(bad.j.code, 'bad-pin'); assert.equal(bad.j.left, 4);
  const t0 = Date.now();
  const ok = await H.dash(SB.base, '/api/transfer/import', { code: ex.code, pin: ex.pin });
  assert.equal(ok.status, 200, JSON.stringify(ok.j)); assert.equal(ok.j.workspace, 'Atrapa Workspace');
  console.log(`    import kodem (PIN + sprawdzenie tokenu + zapis): ${Date.now() - t0} ms`);
  assert.equal((await H.dash(SB.base, '/api/transfer/import', { code: ex.code, pin: ex.pin, replace: true })).j.code, 'used');
  const dB = await (await fetch(`${SB.base}/api/data`)).json();
  assert.equal(dB.data.trades.length, 10, 'B widzi te same dane');
  assert.equal(json(path.join(dirB, 'config.local.json')).schemaVersion, SV);
  assert.notEqual(json(path.join(dirB, 'config.local.json')).deviceId, json(path.join(dirA, 'config.local.json')).deviceId);
  // ustawienia A → B
  const sB = await (await fetch(`${SB.base}/api/sync`)).json();
  assert.equal(sB.remote.settings.palette, 'mono'); assert.equal(sB.remote.settings.token, undefined);
  // B → A, ostatni zapis wygrywa
  const t2 = new Date().toISOString();
  assert.equal((await H.dash(SB.base, '/api/sync', { settings: { palette: 'dalton', beR: 0.1 }, updatedAt: t2 })).j.written, true);
  const sA = await (await fetch(`${SA.base}/api/sync?force`)).json();
  assert.equal(sA.remote.settings.palette, 'dalton');
  const older = await H.dash(SA.base, '/api/sync', { settings: { palette: 'mono' }, updatedAt: t1 });
  assert.equal(older.j.written, false); assert.equal(older.j.reason, 'older');
  const same = await H.dash(SA.base, '/api/sync', { settings: { palette: 'dalton', beR: 0.1 }, updatedAt: new Date(Date.now() + 1000).toISOString() });
  assert.equal(same.j.written, false, 'te same ustawienia nie są zapisywane ponownie');
  // brak pętli: wielokrotne odczyty na obu urządzeniach nic nie zapisują
  const w0 = (await A.writes()).length;
  for (let i = 0; i < 5; i++) { await fetch(`${SA.base}/api/sync?force`); await fetch(`${SB.base}/api/sync?force`); }
  assert.equal((await A.writes()).length, w0, 'odczyty ustawień nie zapisują w kółko');
  // lista urządzeń i zmiana nazwy
  const devB = json(path.join(dirB, 'config.local.json')).deviceId;
  await H.dash(SB.base, '/api/devices/rename', { id: devB, name: 'Laptop testowy' });
  const devs = await (await fetch(`${SA.base}/api/devices`)).json();
  assert.equal(devs.devices.length, 2);
  assert.ok(devs.devices.some((d) => d.name === 'Laptop testowy' && !d.current));
  // wygaśnięcie (zegar przesunięty o 16 min) i plik .ltj (kod z końcem linii)
  const ex2 = (await H.dash(SA.base, '/api/transfer/export', {})).j;
  const SC = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: H.tmp(), THQ_CLOCK_OFFSET_MS: String(16 * 60_000) });
  const exp = await H.dash(SC.base, '/api/transfer/import', { code: ex2.code, pin: ex2.pin });
  assert.equal(exp.status, 410); assert.equal(exp.j.code, 'expired');
  const SD = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: H.tmp() });
  const file = await H.dash(SD.base, '/api/transfer/import', { code: `${ex2.code}\r\n`, pin: ex2.pin });
  assert.equal(file.status, 200, JSON.stringify(file.j));
  // 5 prób: po piątym złym PIN-ie kod jest zablokowany, także dla dobrego PIN-u
  const ex3 = (await H.dash(SA.base, '/api/transfer/export', {})).j;
  const w3 = ex3.pin === '000000' ? '111111' : '000000';
  const SE = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: H.tmp() });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await H.dash(SE.base, '/api/transfer/import', { code: ex3.code, pin: w3 })).j.code);
  assert.deepEqual(codes, ['bad-pin', 'bad-pin', 'bad-pin', 'bad-pin', 'locked']);
  assert.equal((await H.dash(SE.base, '/api/transfer/import', { code: ex3.code, pin: ex3.pin })).j.code, 'locked');
  // ścieżka bez kodu: ten sam token, połączenie istniejącego, ustawienia dociągają się z Notion
  const SF = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: H.tmp() });
  await H.dash(SF.base, '/api/setup/token', { token: 'ntn_wspolny_token_testowy_123' });
  const j = (await H.dash(SF.base, '/api/setup/pages', {})).j.pages.find((p) => p.journal);
  assert.equal((await H.dash(SF.base, '/api/setup/connect', { pageId: j.id })).j.ok, true);
  assert.equal((await (await fetch(`${SF.base}/api/sync`)).json()).remote.settings.palette, 'dalton');
  for (const s of [SA, SB, SC, SD, SE, SF]) s.stop();
  A.stop();
});

test('migracja 002: blok ustawień na istniejącej stronie, treść nietknięta, drugi przebieg bez zmian', async () => {
  const A = await H.atrapa(nextPort());
  const dir = H.tmp();
  writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x\nNOTION_ROOT_URL=${H.PARENT_URL}\nDS_TRADES=${IDS.DS_TRADES}\nDS_KONTA=${IDS.DS_KONTA}\nDS_DZIENNIK=${IDS.DS_DZIENNIK}\nDS_FINANSE=${IDS.DS_FINANSE}\n`);
  writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: 1, lang: 'pl' }));
  const env = H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
  const page0 = (await A.get('/__test/loose'))[0];
  const dry = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--dry-run', '--json'], env);
  assert.deepEqual(dry.lines.find((l) => l.migrations).migrations.changes.map((c) => `${c.kind}:${c.status}`), ['block:add']);
  assert.deepEqual(await A.writes(), []);
  const run1 = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], env);
  assert.equal(run1.code, 0, run1.err);
  const page1 = (await A.get('/__test/loose'))[0];
  assert.equal(page1.children.length, page0.children.length + 1);
  assert.deepEqual(page1.children.slice(0, page0.children.length), page0.children, 'treść strony bez zmian');
  assert.equal(page1.children.at(-1).type, 'toggle');
  assert.equal(json(path.join(dir, 'config.local.json')).schemaVersion, SV);
  const w = (await A.writes()).length;
  const run2 = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
  assert.equal(run2.code, 0);
  assert.equal((await A.writes()).length, w, 'drugi przebieg niczego nie zapisuje');
  // nawet od wersji 0 (ponowne przejście wszystkich migracji) blok nie powstaje drugi raz
  writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: 0, lang: 'pl' }));
  await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], env);
  assert.equal((await A.get('/__test/loose'))[0].children.filter((c) => c.type === 'toggle').length, 1);
  A.stop();
});

test('aktualizacja z wydanego v1.0.0 do bieżącego kodu: blok ustawień dodany, dane i treść strony nietknięte', async () => {
  const ref = spawnSync('git', ['rev-parse', '--verify', '-q', 'v1.0.0^{commit}'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  if (!ref) { console.log('    (pominięty: brak tagu v1.0.0 w tym klonie)'); return; }
  const { parseTar } = await import('../lib/updater.mjs');
  const old = parseTar(spawnSync('git', ['archive', '--format=tar', ref], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }).stdout);
  const A = await H.atrapa(nextPort());
  const dir = H.tmp();
  H.writeTree(dir, old);
  writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x\nNOTION_ROOT_URL=${H.PARENT_URL}\nDS_TRADES=${IDS.DS_TRADES}\nDS_KONTA=${IDS.DS_KONTA}\nDS_DZIENNIK=${IDS.DS_DZIENNIK}\nDS_FINANSE=${IDS.DS_FINANSE}\n`);
  writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: 1, lang: 'pl' }));
  const files = H.appFiles();
  const gh = { release: { version: CUR, body: `## ${CUR}\n\ntree-sha256: ${treeHash(files)}`, tarball: H.tarGz(files, `local-trading-journal-${CUR}`) } };
  const srv = await H.fakeGitHub(nextPort(), gh);
  const before = await A.dump();
  const page0 = (await A.get('/__test/loose'))[0];
  const env = H.cleanEnv({ NOTION_API_BASE: A.base, UPDATE_API_BASE: srv.base, UPDATE_DOWNLOAD_BASE: srv.base });
  const up = await H.run(path.join(dir, 'update.mjs'), ['--yes', '--json'], env, { cwd: dir });
  assert.equal(up.code, 0, up.err || up.out);
  assert.equal(json(path.join(dir, 'package.json')).version, CUR);
  assert.equal(json(path.join(dir, 'config.local.json')).schemaVersion, SV);
  const page1 = (await A.get('/__test/loose'))[0];
  assert.deepEqual(page1.children.slice(0, page0.children.length), page0.children);
  assert.equal(page1.children.at(-1).type, 'toggle');
  assert.deepEqual(pagesOf(await A.dump()), pagesOf(before), 'wpisy bez zmian');
  assert.deepEqual(await A.get('/__test/violations'), []);
  A.stop(); srv.close();
});

test('Napraw wszystko: podgląd bez zapisu, potem brakujące pole, widoki i skrót', async () => {
  const A = await H.atrapa(nextPort(), { ATRAPA_BEZ_WYJSCIA: '1' });
  const dir = H.tmp();
  const S = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'x', NOTION_ROOT_URL: 'https://www.notion.so/atrapa-aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa', ...IDS });
  const w0 = (await A.writes()).length;
  const dry = await H.dash(S.base, '/api/health/fix-all', {});
  assert.equal(dry.j.applied, false); assert.equal(dry.j.shortcut, 'missing');
  assert.equal(dry.j.changes.filter((c) => c.name === 'Wyjście').length, 1, 'bez duplikatów');
  assert.equal((await A.writes()).length, w0);
  const ap = await H.dash(S.base, '/api/health/fix-all', { apply: true });
  assert.equal(ap.j.applied, true); assert.equal(ap.j.shortcut, 'created');
  const h = await H.dash(S.base, '/api/health/full', { quick: true });
  const c = Object.fromEntries(h.j.checks.map((x) => [x.id, x]));
  assert.ok(!c.schema.missing.some((m) => m.role === 'exit'));
  assert.equal(c.views.status, 'ok');
  assert.equal(c.write.code, 'skipped', 'szybkie sprawdzenie bez prób zapisu');
  assert.deepEqual(await A.get('/__test/violations'), []);
  S.stop(); A.stop();
});

// ---------- uruchomienie ----------
let pass = 0, fail = 0;
const t0 = Date.now();
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  const s = Date.now();
  try {
    await t.fn();
    pass++;
    console.log(`✓ ${t.name} (${((Date.now() - s) / 1000).toFixed(1)} s)`);
  } catch (e) {
    fail++;
    console.log(`✗ ${t.name}\n  ${String(e.stack || e).split('\n').slice(0, 6).join('\n  ')}`);
  } finally {
    H.killAll();
  }
}
H.cleanupTemps();
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(fail ? 1 : 0);
