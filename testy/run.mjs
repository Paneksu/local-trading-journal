// Wszystkie testy jednym poleceniem: node testy/run.mjs  (opcjonalnie fragment nazwy: node testy/run.mjs aktualizacja)
// Działają WYŁĄCZNIE na atrapie Notion (testy/atrapa-notion.mjs) i fałszywym serwerze wydań. Prawdziwe Notion ani GitHub
// nie dostają żadnego żądania: procesy potomne dostają czyste środowisko bez kluczy (pomocnicze.cleanEnv).
// Runs every test against the Notion mock and a fake release server only.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as H from './pomocnicze.mjs';
import { treeHash } from '../lib/updater.mjs';
import { parseMarkdown } from '../public/js/markdown.js';
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

// ---------- karty Udostępnij: dane ----------
test('udostepnij: dane kart (tydzień, pusty okres, % bez rozmiaru, tylko Live)', async () => {
  const S = await import('../public/js/stats.js');
  const U = await import('../public/js/udostepnij-dane.js');
  const A = 'aaaaaaaa-0000-4000-8000-000000000001', B = 'bbbbbbbb-0000-4000-8000-000000000002', C = 'cccccccc-0000-4000-8000-000000000003';
  const konta = S.normalizeKonta([{ _id: A, name: 'A 50k', size: 50000 }, { _id: B, name: 'B bez rozmiaru', size: null }, { _id: C, name: 'C 100k', size: 100000 }]);
  let i = 0;
  // data jako sam dzień (bez godziny i strefy): wynik testu nie zależy od strefy czasowej maszyny
  const row = (date, r, pnl, o = {}) => ({ _id: `t${++i}`, _created: `${date}T12:0${i % 10}:00.000Z`, title: '', typ: { name: o.typ || 'Live' }, date, r, pnl, konta: o.konta || [A], dir: { name: o.dir || 'Long' }, instrument: { name: 'NQ' } });
  // tydzień od poniedziałku 19.10.2026 (jak w inspiracji: Pn, Wt, Śr, Cz z wynikiem, Pt bez trade'ów)
  const rows = [
    row('2026-10-19', 0.3, 50), row('2026-10-20', 2.4, 600),
    row('2026-10-21', 3, 1000), row('2026-10-21', -0.5, -125), row('2026-10-22', 1.2, 300),
    row('2026-10-23', 5, null, { typ: 'Backtest', konta: [] }), // nie Live: poza recapem
    row('2026-10-23', null, null, { dir: 'NO TRADE' }), // dzień bez trade'u: nie liczy się
    row('2026-10-16', 9, 2000), // poprzedni tydzień
  ];
  const trades = S.normalizeTrades(rows);
  const w = U.weekCard(trades, konta, '2026-10-22', 'R');
  assert.equal(w.from, '2026-10-19'); assert.equal(w.to, '2026-10-25');
  assert.equal(w.n, 5);
  assert.equal(w.winRate, 80);
  assert.equal(w.greenDays, 4); assert.equal(w.tradingDays, 4);
  assert.equal(w.bestDay.date, '2026-10-21'); // 3 − 0,5 = 2,5R > 2,4R
  assert.ok(Math.abs(w.v.R - 6.4) < 1e-9);
  assert.equal(w.v.$, 1825);
  assert.ok(Math.abs(w.v['%'] - 3.65) < 1e-9); // 1825 $ / 50 000 $ (konto A liczone raz)
  assert.deepEqual(w.days.map((d) => d.n), [1, 1, 2, 1, 0]); // Pn–Pt, weekend bez trade'ów pominięty
  // pusty okres
  const e = U.weekCard(trades, konta, '2026-11-04', 'R');
  assert.equal(e.n, 0); assert.equal(e.v.R, null); assert.equal(e.v.$, null); assert.equal(e.v['%'], null);
  assert.equal(e.bestDay, null); assert.equal(e.greenDays, 0);
  // % bez rozmiaru konta → null (trade i cały okres), dwa konta z rozmiarem → suma rozmiarów
  const tB = S.normalizeTrades([row('2026-10-20', 1, 400, { konta: [B] })]);
  assert.equal(U.tradeCard(tB[0], konta).v['%'], null);
  assert.equal(U.weekCard([...trades, ...tB], konta, '2026-10-20', 'R').v['%'], null);
  const tC = S.normalizeTrades([row('2026-10-20', 1, 300, { konta: [C] })]);
  assert.ok(Math.abs(U.weekCard([...trades, ...tC], konta, '2026-10-20', '%').v['%'] - (2125 / 150000) * 100) < 1e-9);
  // karta trade'a: Backtest dostaje etykietę i nie ma kwot; Live ma % konta
  const bt = trades.find((t) => t.typ === 'Backtest');
  const bc = U.tradeCard(bt, konta);
  assert.equal(bc.tag, 'Backtest'); assert.equal(bc.v.$, null); assert.equal(bc.v['%'], null); assert.equal(bc.v.R, 5);
  assert.ok(Math.abs(U.tradeCard(trades[1], konta).v['%'] - 1.2) < 1e-9); // 600 / 50 000
  // dzień, miesiąc, rok
  const d = U.dayCard(trades, konta, '2026-10-21', '$');
  assert.equal(d.n, 2); assert.equal(d.wins, 1); assert.equal(d.losses, 1); assert.equal(d.best.v.$, 1000);
  const m = U.monthCard(trades, konta, 2026, 10, 'R');
  assert.equal(m.n, 6); assert.equal(m.weeks[0].from, '2026-10-01'); assert.equal(m.weeks.at(-1).to, '2026-10-31');
  assert.equal(m.bestDay.date, '2026-10-16');
  const y = U.yearCard(trades, konta, 2026, 'R');
  assert.equal(y.months[9].n, 6); assert.equal(y.bestMonth.m, 10); assert.equal(y.greenMonths, 1); assert.equal(y.tradingMonths, 1);
  // % konta: trade na dwóch kontach, z których jedno nie ma rozmiaru → null (nie 1000/50 000) i dla trade'a, i dla okresu
  const tAB = S.normalizeTrades([row('2026-10-20', 1, 1000, { konta: [A, B] })]);
  assert.equal(U.pctOf(tAB, new Map(konta.map((k) => [k.id, k]))), null);
  assert.equal(U.tradeCard(tAB[0], konta).v['%'], null);
  assert.equal(U.weekCard(tAB, konta, '2026-10-20', 'R').v['%'], null);
  // margines BE jak w aplikacji: dzień +0,05R przy beR 0,1 nie jest zielony (ani najlepszy); +0,3R jest
  const oldBe = { ...S.cfg };
  try {
    S.cfg.beR = 0.1; S.cfg.beUsd = 0;
    const tBe = S.normalizeTrades([row('2026-11-02', 0.05, null), row('2026-11-03', 0.3, null)]);
    const wBe = U.weekCard(tBe, konta, '2026-11-02', 'R');
    assert.equal(wBe.greenDays, 1); assert.equal(wBe.bestDay.date, '2026-11-03');
    assert.equal(U.signOf({ R: 0.05, $: null, '%': null }, 'R'), 'be'); assert.equal(U.signOf({ R: -0.05 }, 'R'), 'be'); assert.equal(U.signOf({ R: 0.11 }, 'R'), 'win');
    const tOnlyBe = S.normalizeTrades([row('2026-11-09', 0.05, null)]);
    assert.equal(U.weekCard(tOnlyBe, konta, '2026-11-09', 'R').bestDay, null);
    S.cfg.beR = 0; S.cfg.beUsd = 50;
    assert.equal(U.signOf({ R: null, $: 40, '%': 0.08 }, '%'), 'be'); // % o znaku decyduje $ z marginesem $
    assert.equal(U.signOf({ R: null, $: 60, '%': 0.1 }, '%'), 'win');
  } finally { Object.assign(S.cfg, oldBe); }
  // przycięcie tygodnia (komórka kalendarza na przełomie miesięcy): tylko dni z zakresu
  const tClip = S.normalizeTrades([row('2026-10-29', 1, 100), row('2026-10-31', 2, 200), row('2026-11-01', 4, 400)]);
  const wc = U.weekCard(tClip, konta, '2026-10-29', 'R', { from: '2026-10-26', to: '2026-10-31' });
  assert.equal(wc.n, 2); assert.equal(wc.to, '2026-10-31'); assert.ok(Math.abs(wc.v.R - 3) < 1e-9);
  assert.equal(U.weekCard(tClip, konta, '2026-10-29', 'R').n, 3);
});

test('udostepnij: sanitizeShare nie przepuszcza kluczy z prototypu ani złych typów', async () => {
  const { sanitizeShare, SHARE_DEFAULTS } = await import('../public/js/udostepnij.js');
  for (const bad of ['toString', 'constructor', '__proto__', 'hasOwnProperty', null, 5, {}, ['9:16'], undefined, '']) assert.equal(sanitizeShare({ format: bad }).format, SHARE_DEFAULTS.format, String(bad));
  assert.equal(sanitizeShare({ format: '1:1' }).format, '1:1');
  assert.equal(sanitizeShare({ format: '16:9', metric: '%', numberColor: 'neutral', nick: '  Trader  ' }).metric, '%');
  assert.equal(sanitizeShare({ metric: 'toString' }).metric, SHARE_DEFAULTS.metric);
  assert.equal(sanitizeShare(null).nick, ''); assert.equal(sanitizeShare({ nick: 5 }).nick, '');
  assert.equal(sanitizeShare({ nick: 'a'.repeat(90) }).nick.length, 40);
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

test('notatki wydania: obrazki i HTML pomijane, nagłówek zrzutów znika, ---/tree-sha256 ukryte, link bez adresu', () => {
  const md = [
    '## Zmiany', '- **Nowe** pole `Ocena`', '- widok [Wg oceny](https://x.example/a)', '', '<details><summary>Więcej</summary>', 'Akapit w środku', '</details>', '',
    '## Zrzuty / Screenshots', '', '**Podpis zrzutu**',
    '![Karta](https://x.example/karta.png)', '<img src="https://x.example/b.png" width="300">', '[![Podgląd](https://x.example/p.png)](https://x.example/film)', '',
        '', '## Inne', 'Tekst z obrazkiem ![mały](https://x.example/m.png) w środku <b>linii</b>.', '', '---', 'tree-sha256: ' + 'a'.repeat(64),
  ].join('\r\n');
  const r = parseMarkdown(md);
  assert.equal(r.hadImages, true);
  const txt = r.blocks.map((b) => b.type + ':' + b.text);
  assert.deepEqual(txt, ['h:Zmiany', 'li:**Nowe** pole `Ocena`', 'li:widok [Wg oceny](https://x.example/a)', 'p:Akapit w środku', 'h:Inne', 'p:Tekst z obrazkiem  w środku linii.']);
  const all = JSON.stringify(r.blocks);
  for (const bad of ['png', '<', '---', 'tree-sha256', 'Zrzuty', 'details', 'Podpis']) assert.ok(!all.includes(bad), bad);
  // bez obrazków: brak znacznika, nagłówek zrzutów z treścią zostaje, ciągły akapit łączy linie
  const r2 = parseMarkdown('## Screenshots\nOpis zrzutów\n\nLinia 1\nLinia 2\n\n### Zrzuty\n');
  assert.equal(r2.hadImages, false);
  assert.deepEqual(r2.blocks.map((b) => b.type + ':' + b.text), ['h:Screenshots', 'p:Opis zrzutów', 'p:Linia 1 Linia 2']);
  assert.deepEqual(parseMarkdown('').blocks, []);
  // render nie używa innerHTML dla notatek
  const src = readFileSync(path.join(ROOT, 'public/js/aktualizacja.js'), 'utf8');
  const fn = src.slice(src.indexOf('export function renderMarkdown'), src.indexOf('export function createUpdater'));
  assert.ok(!/innerHTML/.test(fn));
});

test('dashboard działający na starszym kodzie: restartNeeded, brak oferty wersji z dysku, restart na nowym kodzie', async () => {
  const A = await H.atrapa(nextPort());
  const R = await release(); // najnowsze wydanie = NEXT
  const dir = H.tmp();
  install(dir);
  const S = await H.server(nextPort(), { NOTION_API_BASE: A.base, ...R.env }, { cwd: dir });
  let c = (await H.dash(S.base, '/api/update/check', {})).j;
  assert.equal(c.restartNeeded, false); assert.equal(c.available, true); assert.equal(c.latest, NEXT);
  // „git pull” przy działającym procesie: na dysku jest już NEXT
  const pj = path.join(dir, 'package.json');
  const pkg = json(pj); pkg.version = NEXT; writeFileSync(pj, JSON.stringify(pkg, null, 2) + String.fromCharCode(10));
  c = (await H.dash(S.base, '/api/update/check', {})).j;
  assert.equal(c.restartNeeded, true); assert.equal(c.diskVersion, NEXT); assert.equal(c.current, CUR);
  assert.equal(c.available, false, 'nie oferuje wersji, która już jest na dysku');
  assert.equal((await (await fetch(`${S.base}/api/update-check`)).json()).restartNeeded, true);
  const d = await (await fetch(`${S.base}/api/data`)).json();
  assert.equal(d.meta.restartNeeded, true); assert.equal(d.meta.diskVersion, NEXT); assert.equal(d.meta.version, CUR);
  // ochrona zapisu
  assert.equal((await H.dash(S.base, '/api/restart', {}, { origin: 'http://evil.example' })).status, 403);
  assert.equal((await fetch(`${S.base}/api/restart`, { method: 'POST', headers: { Origin: S.base, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  const rs = await H.dash(S.base, '/api/restart', {});
  assert.equal(rs.status, 200); assert.equal(rs.j.restarting, true);
  let v = '';
  for (let i = 0; i < 120 && v !== NEXT; i++) {
    await H.sleep(250);
    try { v = (await (await fetch(`${S.base}/api/health`)).json()).version; } catch { /* restart w toku */ }
  }
  assert.equal(v, NEXT, 'serwer wstał na kodzie z dysku');
  c = (await H.dash(S.base, '/api/update/check', {})).j;
  assert.equal(c.restartNeeded, false);
  await H.dash(S.base, '/api/shutdown', {});
  A.stop(); R.close();
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

test('blok ustawień: nazwa w języku instalacji, po zmianie nazwy dalej rozpoznawany po ID', async () => {
  const A = await H.atrapa(nextPort(), { ATRAPA_PUSTA: '1' });
  const dir = H.tmp();
  const r = await H.run(path.join(ROOT, 'setup.mjs'), ['--lang', 'en', '--token', 'test', '--parent', H.PARENT_URL, '--yes'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
  assert.equal(r.code, 0, r.err);
  const rootId = json(path.join(dir, 'config.local.json')).rootPageId;
  const tog = (await A.get('/__test/loose')).find((p) => p.id === rootId).children.find((c) => c.type === 'toggle');
  assert.equal(tog.toggle.rich_text[0].text.content, 'Dashboard settings (do not edit)');
  const S = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
  assert.equal((await H.dash(S.base, '/api/sync', { settings: { palette: 'mono' }, updatedAt: new Date().toISOString() })).j.written, true);
  await H.sleep(150);
  assert.ok(json(path.join(dir, 'config.local.json')).settingsBlock?.codeId, 'ID bloku zapamiętane');
  // użytkownik zmienia nazwę bloku w Notion
  await fetch(`${A.base}/v1/blocks/${tog.id}`, { method: 'PATCH', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify({ toggle: { rich_text: [{ type: 'text', text: { content: 'My stuff' } }] } }) });
  const s = await (await fetch(`${S.base}/api/sync?force`)).json();
  assert.equal(s.remote?.settings?.palette, 'mono', JSON.stringify(s));
  const h = await H.dash(S.base, '/api/health/full', { quick: true });
  assert.equal(h.j.checks.find((c) => c.id === 'settings').status, 'ok');
  const fix = await H.dash(S.base, '/api/health/fix-all', {});
  assert.ok(!fix.j.changes.some((c) => c.kind === 'block'), 'nie proponuje drugiego bloku');
  S.stop(); A.stop();
});

test('migracja 002: blok ustawień na istniejącej stronie, treść nietknięta, drugi przebieg bez zmian', async () => {
  const A = await H.atrapa(nextPort());
  const dir = H.tmp();
  writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x\nNOTION_ROOT_URL=${H.PARENT_URL}\nDS_TRADES=${IDS.DS_TRADES}\nDS_KONTA=${IDS.DS_KONTA}\nDS_DZIENNIK=${IDS.DS_DZIENNIK}\nDS_FINANSE=${IDS.DS_FINANSE}\n`);
  writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: 1, lang: 'pl' }));
  const env = H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir });
  const page0 = (await A.get('/__test/loose'))[0];
  const dry = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--dry-run', '--json'], env);
  assert.deepEqual(dry.lines.find((l) => l.migrations).migrations.changes.filter((c) => c.version === 2).map((c) => `${c.kind}:${c.status}`), ['block:add']); // tylko zmiany migracji 002 (003 dodaje pola cen, sprawdza je wykresy-05)
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

// ---------- zrzuty dodawane z dashboardu (lib/shots.mjs) ----------
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const pngPadded = (n) => Buffer.concat([PNG_1PX, Buffer.alloc(n - PNG_1PX.length)]);
// THQ_TEST_PAGES=1: tryb dashboardu testowego (proxy obrazów wolno wtedy pobrać plik spod adresu atrapy, http://127.0.0.1)
async function shotEnv(atrapaEnv = {}) {
  const A = await H.atrapa(nextPort(), atrapaEnv);
  const dir = H.tmp();
  const S = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'x', THQ_TEST_PAGES: '1', ...IDS });
  const d = await (await fetch(`${S.base}/api/data`)).json();
  return { A, S, dir, d, trade: d.data.trades[0], trade2: d.data.trades[1] };
}
const shotBody = (buf, type = 'image/png') => ({ type, data: buf.toString('base64') });
async function until(fn, ms = 15000) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('until: przekroczono czas'); await H.sleep(100); }
}
const apiData = async (S, q = '') => (await fetch(`${S.base}/api/data${q}`)).json();
const imgsOf = (d, id) => d.data.trades.find((x) => x._id === id)._imgs;
const settled = (S) => until(async () => { const d = await apiData(S); return d.scanning ? null : d; });
const childrenGets = async (A, id) => (await A.get('/__test/log')).filter((l) => id ? l === `GET /v1/blocks/${id}/children` : /^GET \/v1\/blocks\/[0-9a-f-]{36}\/children$/.test(l)).length;

test('zrzuty: dodanie nie usuwa istniejących, plik trafia do Notion, cache unieważniony, obraz serwowany, drugi start widzi bloki', async () => {
  const { A, S, dir, trade } = await shotEnv();
  await settled(S);
  const page0 = () => A.dump().then((d) => d[IDS.DS_TRADES].pages.find((p) => p.id === trade._id));
  await A.post('/__test/page-files', { id: trade._id, files: [{ name: 'stary.png', type: 'external', external: { url: 'https://example.com/stary.png' } }] });
  const propBefore = JSON.stringify((await page0()).properties.Zrzut);
  await until(async () => imgsOf(await apiData(S, '?refresh=1'), trade._id) === 1);
  const r = await H.dash(S.base, `/api/trades/${trade._id}/shots`, shotBody(PNG_1PX));
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal(r.j.ok, true); assert.equal(r.j.imgs, 2); assert.equal(r.j.index, 1, 'indeks nowego zrzutu w /api/img');
  // pole „Zrzut” nietknięte (zrzut dodany jako blok), plik wgrany i dołączony
  assert.equal(JSON.stringify((await page0()).properties.Zrzut), propBefore, 'pole Zrzut bez zmian');
  const ups = await A.get('/__test/uploads');
  assert.equal(ups.length, 1); assert.equal(ups[0].status, 'attached'); assert.equal(ups[0].content_type, 'image/png'); assert.equal(ups[0].size, PNG_1PX.length);
  assert.match(ups[0].filename, /^zrzut-\d{8}-\d{6}\.png$/);
  assert.equal((await A.get(`/v1/blocks/${trade._id}/children`)).results.filter((b) => b.type === 'image').length, 1);
  // cache /api/data unieważniony: bez ?refresh od razu widać nowy zrzut
  const d2 = await apiData(S);
  assert.equal(d2.cached, false);
  assert.equal(imgsOf(d2, trade._id), 2);
  // obraz z proxy (indeks 1 = dodany blok) ma bajty wgranego pliku
  const img = await fetch(`${S.base}/api/img?page=${trade._id}&i=1`);
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png');
  assert.ok(Buffer.from(await img.arrayBuffer()).equals(PNG_1PX));
  // drugi zrzut: kolejne dołączenie, pierwszy dalej jest
  const r2 = await H.dash(S.base, `/api/trades/${trade._id}/shots`, shotBody(pngPadded(2000)));
  assert.equal(r2.j.imgs, 3); assert.equal(r2.j.index, 2);
  // identyfikator wielkimi literami trafia na tę samą stronę
  const r3 = await H.dash(S.base, `/api/trades/${trade._id.toUpperCase()}/shots`, shotBody(pngPadded(3000)));
  assert.equal(r3.status, 200, JSON.stringify(r3.j)); assert.equal(r3.j.imgs, 4);
  // źródłem prawdy jest Notion, nie plik lokalny: konfiguracja nie zna listy stron ze zrzutami
  await H.sleep(200);
  assert.equal(json(path.join(dir, 'config.local.json')).shotPages, undefined);
  S.stop();
  const S2 = await H.server(nextPort(), { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: H.tmp(), NOTION_TOKEN: 'x', THQ_TEST_PAGES: '1', ...IDS });
  const d3 = await until(async () => { const d = await apiData(S2); return imgsOf(d, trade._id) === 4 ? d : null; });
  assert.equal(d3.scanning, false);
  S2.stop(); A.stop();
});

test('zrzuty: zrzut dodany „na innym urządzeniu” (blok bez lokalnego wpisu) jest widoczny, strona bez zmian nie jest skanowana drugi raz, limit 3 odczytów naraz', async () => {
  const { A, S, d, trade, trade2 } = await shotEnv();
  const first = await settled(S);
  const nTrades = first.data.trades.length;
  assert.ok(nTrades > 100);
  // /api/data wróciło od razu (bez czekania na skan), a skan objął każdą stronę trade'a dokładnie raz
  assert.equal(await childrenGets(A), nTrades, 'pełny skan: jeden odczyt bloków na stronę (bez paginacji)');
  assert.ok((await A.get('/__test/stats')).childrenMax <= 3, 'nie więcej niż 3 odczyty bloków naraz');
  assert.ok((await A.get('/__test/stats')).childrenMax >= 2, 'skan faktycznie idzie równolegle');
  void d;
  // „drugie urządzenie” dodaje obraz do strony trade'a bezpośrednio w Notion
  const FILE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await A.post('/__test/put-file', { id: FILE, base64: PNG_1PX.toString('base64') });
  await A.post('/__test/add-blocks', { id: trade._id, images: 1, fileId: FILE });
  const d1 = await apiData(S, '?refresh=1');
  assert.ok(typeof d1.scanning === 'boolean');
  await until(async () => imgsOf(await apiData(S), trade._id) === 1);
  const img = await fetch(`${S.base}/api/img?page=${trade._id}&i=0`);
  assert.equal(img.status, 200);
  assert.ok(Buffer.from(await img.arrayBuffer()).equals(PNG_1PX));
  // przeskanowana została tylko zmieniona strona
  assert.equal(await childrenGets(A), nTrades + 1, 'zmieniona strona skanowana raz, reszta z pamięci');
  const before = await childrenGets(A);
  for (let i = 0; i < 3; i++) await apiData(S, '?refresh=1');
  await H.sleep(500);
  assert.equal(await childrenGets(A), before, 'strony bez zmian nie są skanowane drugi raz');
  // paginacja: 130 akapitów (druga strona wyników has_more) i obraz na samym końcu
  await A.post('/__test/add-blocks', { id: trade2._id, paragraphs: 130, images: 1, fileId: FILE });
  await apiData(S, '?refresh=1');
  await until(async () => imgsOf(await apiData(S), trade2._id) === 1);
  assert.equal(await childrenGets(A, trade2._id), 3, 'strona z 131 blokami: pierwszy skan (1 odczyt) + po zmianie dwie strony wyników (2 odczyty)');
  assert.deepEqual(await A.get('/__test/violations'), []);
  S.stop(); A.stop();
});

test('zrzuty: zły typ, bajty zamiast deklaracji, za duży, pusty i odrzucenie przez Notion nic nie zapisują; ciało ponad limit = 413', async () => {
  const { A, S, trade } = await shotEnv();
  const url = `/api/trades/${trade._id}/shots`;
  const bad = async (body, re, status = 400) => { const r = await H.dash(S.base, url, body); assert.equal(r.status, status, JSON.stringify(r.j)); assert.match(r.j.error, re); };
  const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
  await bad({ type: 'image/svg+xml', data: SVG.toString('base64') }, /PNG, JPEG, WebP i GIF/);
  await bad({ type: 'application/pdf', data: Buffer.from('%PDF-1.4 nie obraz').toString('base64') }, /PNG, JPEG, WebP i GIF/);
  await bad(shotBody(Buffer.from('to nie jest obraz, tylko tekst udający PNG'), 'image/png'), /PNG, JPEG, WebP i GIF/);
  await bad({ type: 'image/png', data: '' }, /pusty/);
  await bad({ type: 'image/png', data: '%%%nie-base64%%%' }, /Nieprawidłowe dane/);
  await bad(shotBody(pngPadded(10 * 1024 * 1024 + 1)), /za duży/); // tuż nad limitem 10 MB, jeszcze w limicie ciała żądania
  await bad(shotBody(pngPadded(12 * 1024 * 1024)), /za duży/, 413); // ciało ponad limit: 413 i zamknięcie połączenia
  assert.deepEqual(await A.get('/__test/uploads'), [], 'żadne ze złych żądań nie dotarło do Notion');
  // deklaracja niezgodna z bajtami: decydują bajty (PNG zadeklarowany jako JPEG to PNG)
  const mism = await H.dash(S.base, url, shotBody(PNG_1PX, 'image/jpeg'));
  assert.equal(mism.status, 200, JSON.stringify(mism.j));
  assert.equal((await A.get('/__test/uploads'))[0].content_type, 'image/png');
  const exact = await H.dash(S.base, url, shotBody(pngPadded(10 * 1024 * 1024)));
  assert.equal(exact.status, 200, 'dokładnie 10 MB przechodzi');
  const wrong = await H.dash(S.base, '/api/trades/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/shots', shotBody(PNG_1PX));
  assert.equal(wrong.status, 403, "strona spoza bazy Trade'y (tu: strona nadrzędna) nie przechodzi");
  const gone = await H.dash(S.base, '/api/trades/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/shots', shotBody(PNG_1PX));
  assert.equal(gone.status, 404, 'nieistniejący wpis');
  assert.equal((await A.get('/__test/uploads')).length, 2);
  // limit ciała dotyczy każdego endpointu zapisu: 300 KB do /api/config (limit 64 KB) → 413, serwer dalej działa
  const huge = await H.dash(S.base, '/api/config', { pad: 'x'.repeat(300 * 1024) });
  assert.equal(huge.status, 413, JSON.stringify(huge.j));
  assert.match(huge.j.error, /zbyt duże/);
  assert.equal((await H.dash(S.base, '/api/config', { onboarded: true })).status, 200, 'po odrzuceniu serwer odpowiada dalej');
  S.stop(); A.stop();
  // Notion odrzuca plik w kroku wysyłania: błąd z komunikatem, żaden blok nie powstaje
  const E = await shotEnv({ ATRAPA_ODRZUC_PLIKI: '1' });
  const r = await H.dash(E.S.base, `/api/trades/${E.trade._id}/shots`, shotBody(PNG_1PX));
  assert.equal(r.status, 400); assert.match(r.j.error, /odrzucony typ pliku/);
  assert.equal((await E.A.get(`/v1/blocks/${E.trade._id}/children`)).results.length, 0);
  assert.equal(imgsOf(await apiData(E.S, '?refresh=1'), E.trade._id), 0);
  E.S.stop(); E.A.stop();
});

test('zrzuty: brak uprawnienia „Insert content” (403), limit pliku z przestrzeni Notion (5 MiB), błąd odświeżenia po dodaniu to ostrzeżenie, nie błąd', async () => {
  // 403 przy dołączaniu bloku: własny komunikat o uprawnieniu integracji
  const P = await shotEnv({ ATRAPA_BRAK_INSERT: '1' });
  const rp = await H.dash(P.S.base, `/api/trades/${P.trade._id}/shots`, shotBody(PNG_1PX));
  assert.equal(rp.status, 403, JSON.stringify(rp.j));
  assert.match(rp.j.error, /Insert content/); assert.match(rp.j.error, /Capabilities/);
  assert.equal((await P.A.get(`/v1/blocks/${P.trade._id}/children`)).results.length, 0);
  P.S.stop(); P.A.stop();
  // limit z GET /v1/users/me (bot.workspace_limits.max_file_upload_size_in_bytes), jak w darmowym planie Notion
  const L = await shotEnv({ ATRAPA_LIMIT_PLIKU: String(5 * 1024 * 1024) });
  const url = `/api/trades/${L.trade._id}/shots`;
  const over = await H.dash(L.S.base, url, shotBody(pngPadded(5 * 1024 * 1024 + 1)));
  assert.equal(over.status, 400); assert.match(over.j.error, /najwyżej 5 MB/);
  assert.equal((await L.A.get('/__test/uploads')).length, 0, 'za duży plik nie dociera do Notion');
  const okFile = await H.dash(L.S.base, url, shotBody(pngPadded(5 * 1024 * 1024)));
  assert.equal(okFile.status, 200, JSON.stringify(okFile.j));
  L.S.stop(); L.A.stop();
  // zrzut JEST w Notion, a odświeżenie podglądu zawodzi: 200 z ostrzeżeniem (ponowienie zrobiłoby duplikat)
  const W = await shotEnv();
  await settled(W.S);
  await W.A.post('/__test/fail', { match: `GET /v1/pages/${W.trade._id}`, after: 1, status: 500 });
  const rw = await H.dash(W.S.base, `/api/trades/${W.trade._id}/shots`, shotBody(PNG_1PX));
  assert.equal(rw.status, 200, JSON.stringify(rw.j));
  assert.equal(rw.j.ok, true); assert.ok(rw.j.warning);
  assert.equal((await W.A.get(`/v1/blocks/${W.trade._id}/children`)).results.filter((b) => b.type === 'image').length, 1);
  assert.equal((await W.A.get('/__test/uploads')).length, 1);
  await until(async () => imgsOf(await apiData(W.S, '?refresh=1'), W.trade._id) === 1);
  W.S.stop(); W.A.stop();
});

test('zrzuty: ochrona zapisu (obcy Origin, brak X-THQ, zły Content-Type, GET) i brak zapisu w Notion', async () => {
  const { A, S, trade } = await shotEnv();
  const url = `/api/trades/${trade._id}/shots`;
  const body = shotBody(PNG_1PX);
  const evil = await H.dash(S.base, url, body, { origin: 'http://evil.example' });
  assert.equal(evil.status, 403);
  const noOrigin = await fetch(S.base + url, { method: 'POST', headers: { 'X-THQ': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(noOrigin.status, 403);
  const noThq = await fetch(S.base + url, { method: 'POST', headers: { Origin: S.base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(noThq.status, 403);
  const plain = await fetch(S.base + url, { method: 'POST', headers: { Origin: S.base, 'X-THQ': '1', 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
  assert.equal(plain.status, 403, 'bez JSON-a nie ma obejścia preflightu');
  // GET na tej trasie nie jest endpointem zapisu: serwer oddaje zwykłe 404 (plik statyczny nie istnieje), nic nie zapisuje
  const get = await fetch(S.base + url, { headers: { Origin: S.base, 'X-THQ': '1' } });
  assert.equal(get.status, 404);
  assert.deepEqual(await A.get('/__test/uploads'), [], 'żadne z odrzuconych żądań nie dotarło do Notion');
  assert.deepEqual(await A.writes(), []);
  S.stop(); A.stop();
});

// ---------- moduł wykresów: testy z testy/wykresy-NN*.mjs ----------
for (const f of readdirSync(path.join(ROOT, 'testy')).filter((n) => /^wykresy-\d+.*\.mjs$/.test(n)).sort()) {
  (await import(pathToFileURL(path.join(ROOT, 'testy', f)).href)).default({ test, H, assert, ROOT });
}

// ---------- newsy makro USD: testy z testy/newsy-NN*.mjs (bez sieci) ----------
for (const f of readdirSync(path.join(ROOT, 'testy')).filter((n) => /^newsy-\d+.*\.mjs$/.test(n)).sort()) {
  (await import(pathToFileURL(path.join(ROOT, 'testy', f)).href)).default({ test, H, assert, ROOT });
}

// ---------- moduł Backtest (1.5.0): testy z testy/backtest-<karta>-*.mjs, dane tylko syntetyczne (testy/bt-dane-syntetyczne.mjs) ----------
// backtest-e2e.mjs (H1) to odbiór na kopii prawdziwych świec, uruchamiany osobno: run.mjs go nie importuje
for (const f of readdirSync(path.join(ROOT, 'testy')).filter((n) => /^backtest-.*\.mjs$/.test(n) && n !== 'backtest-e2e.mjs').sort()) {
  (await import(pathToFileURL(path.join(ROOT, 'testy', f)).href)).default({ test, H, assert, ROOT });
}

// ---------- uruchomienie ----------
let pass = 0, fail = 0, skipped = 0, skipEnv = 0; // skipEnv: test sam się pominął (np. brak Chrome/Edge): e.skipTest, liczony osobno, nie jako zdany // skipped: odfiltrowane fragmentem nazwy z linii poleceń (D2, przegląd 28.10.2026)
const t0 = Date.now();
for (const t of tests) {
  if (only && !t.name.includes(only)) { skipped++; continue; }
  const s = Date.now();
  try {
    await t.fn();
    pass++;
    console.log(`✓ ${t.name} (${((Date.now() - s) / 1000).toFixed(1)} s)`);
  } catch (e) {
    if (e && e.skipTest) { skipEnv++; console.log(`- ${t.name} (POMINIĘTY: ${e.message})`); continue; } // finally poniżej i tak sprząta
    fail++;
    console.log(`✗ ${t.name}\n  ${String(e.stack || e).split('\n').slice(0, 6).join('\n  ')}`);
  } finally {
    H.killAll();
  }
}
H.cleanupTemps();
console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped${skipEnv ? `, ${skipEnv} pominiętych (brak środowiska)` : ''} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(fail ? 1 : 0);
