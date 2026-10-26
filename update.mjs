#!/usr/bin/env node
// Aktualizacja bez utraty danych: 1) kopia 4 baz Notion do backups/<data>/, 2) nowa wersja (git pull --ff-only albo
// wydanie z GitHuba z kontrolą sumy), 3) migracje schematu Notion (tylko dodające), 4) restart dashboardu.
// Nigdy nie nadpisuje .env, config.local.json, backups/ ani public/img/firmy/custom/.
// Update without data loss: backup, new version (git or GitHub release with checksum), add-only migrations, restart.
//
//   node update.mjs              aktualizacja z pytaniem o potwierdzenie / update with confirmation
//   node update.mjs --dry-run    tylko plan: co się zmieni w plikach i w Notion; niczego nie zapisuje
//   node update.mjs --yes        bez pytania
//   node update.mjs --json       postęp jako linie JSON (używa go dashboard)
//   node update.mjs --migrate-only [--dry-run]   tylko migracje Notion z tej wersji kodu
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) { console.error(`Potrzebny jest Node.js 22 lub nowszy (masz ${process.versions.node}). / Node.js 22+ required.`); process.exit(1); }

const { ROOT, CONFIG_DIR, loadEnv, envSettings, loadConfig, saveConfig } = await import('./lib/env.mjs');
const { createNotion } = await import('./lib/notion.mjs');
const { APP_VERSION, REPO, loadSchemaFile } = await import('./lib/version.mjs');
const { loadMigrations, runMigrations } = await import('./lib/migrate.mjs');
const { backupAll } = await import('./lib/backup.mjs');
const U = await import('./lib/updater.mjs');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const JSON_OUT = flag('json');
const DRY = flag('dry-run');
const config = loadConfig();
const lang = config.lang === 'en' ? 'en' : 'pl';
const L = (pl, en) => (lang === 'en' ? en : pl);
const say = (...a) => { if (!JSON_OUT) console.log(...a); };
const emit = (o) => { if (JSON_OUT) process.stdout.write(JSON.stringify(o) + '\n'); };
const step = (id, status, detail = '') => { emit({ step: id, status, detail }); if (!JSON_OUT && status !== 'pending') say(`[${id}] ${status}${detail ? ': ' + detail : ''}`); };
const manualCmd = process.platform === 'win32' ? 'node update.mjs' : './update.sh';
function fail(message, extra = {}) {
  emit({ error: { message, command: manualCmd, ...extra } });
  if (!JSON_OUT) console.error(`\n${message}`);
  process.exit(1);
}

const S = envSettings(loadEnv());
const notion = createNotion({ token: S.token, version: S.version, base: S.base });
const persist = () => saveConfig(config);

async function migrateCtx(dryRun) {
  return { notion, sources: S.sources, config, lang, schema: loadSchemaFile(), dryRun, rootUrl: S.rootUrl };
}
async function runLocalMigrations(dryRun) {
  if (!S.token || !S.sources.trades) throw new Error(L('Brak konfiguracji Notion w .env.', 'No Notion configuration in .env.'));
  const migrations = await loadMigrations(path.join(ROOT, 'migrations'));
  const ctx = await migrateCtx(dryRun);
  const out = await runMigrations(ctx, migrations, { persist });
  if (!dryRun) persist(); // identyfikatory nowych pól i widoków
  return out;
}

// ---------- tryb: same migracje (uruchamiany też przez nowy kod po pobraniu) ----------
if (flag('migrate-only')) {
  try {
    const out = await runLocalMigrations(DRY);
    const changes = out.changes.filter((c) => c.status !== 'skip');
    emit({ migrations: { from: out.from, to: out.to, changes } });
    if (!JSON_OUT) {
      if (!out.pending.length) say(L('Schemat Notion jest aktualny.', 'The Notion schema is up to date.'));
      for (const c of out.changes) say(`  ${c.status === 'add' ? (DRY ? L('DODAM', 'WILL ADD') : L('DODANO', 'ADDED')) : c.status === 'skip' ? L('jest', 'exists') : L('KONFLIKT', 'CONFLICT')} · ${c.db} · ${c.kind}: ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
      if (DRY) say(L('Podgląd: niczego nie zapisałem.', 'Preview only: nothing was written.'));
    }
    process.exit(out.changes.some((c) => c.status === 'conflict') ? 2 : 0);
  } catch (e) { fail(e.message); }
}

// ---------- plan ----------
const mode = U.isGitInstall(ROOT) ? 'git' : 'zip';
let latest = null;
try { latest = await U.fetchLatest(REPO); } catch (e) {
  if (mode === 'zip') fail(L(`Nie mogę sprawdzić nowej wersji (${e.message}). Sprawdź połączenie z internetem.`, `Cannot check for a new version (${e.message}). Check your internet connection.`));
}
let gs = null;
if (mode === 'git') {
  gs = U.gitState(ROOT, { fetch: true });
  if (!gs.ok) fail(gs.reason, { code: gs.code, files: gs.files });
}
const target = latest && U.isNewer(latest.version, APP_VERSION) ? latest.version : APP_VERSION;
const hasCode = mode === 'git' ? gs.behind > 0 : U.isNewer(latest?.version, APP_VERSION);

// Notion: podgląd migracji z NOWEJ wersji kodu (pobranej do katalogu tymczasowego), żeby było widać, co dojdzie.
async function notionPreview() {
  if (!hasCode) return (await runLocalMigrations(true)).changes.filter((c) => c.status !== 'skip');
  const tmp = mkdtempSync(path.join(tmpdir(), 'ltj-plan-'));
  try {
    const files = mode === 'git' ? U.gitUpstreamFiles(ROOT) : await U.downloadRelease(latest, { allowUnverified: flag('allow-unverified') });
    U.writeFiles(tmp, files);
    const r = spawnSync(process.execPath, [path.join(tmp, 'update.mjs'), '--migrate-only', '--dry-run', '--json'], { env: { ...process.env, THQ_CONFIG_DIR: CONFIG_DIR }, encoding: 'utf8', windowsHide: true });
    const lines = r.stdout.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const err = lines.find((l) => l.error);
    if (err) throw new Error(err.error.message);
    return lines.find((l) => l.migrations)?.migrations.changes || [];
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

if (DRY) {
  let notionChanges = [], notionError = null;
  try { notionChanges = await notionPreview(); } catch (e) { notionError = e.message; }
  const plan = { mode, current: APP_VERSION, target, hasCode, behind: gs?.behind ?? null, notes: latest?.notes || '', notion: notionChanges, notionError, canUpdate: true };
  emit({ plan });
  if (!JSON_OUT) {
    say(L(`Tryb: ${mode === 'git' ? 'repozytorium git (git pull --ff-only)' : 'wydanie z GitHuba (archiwum z kontrolą sumy)'}`, `Mode: ${mode === 'git' ? 'git repository (git pull --ff-only)' : 'GitHub release (archive with checksum)'}`));
    say(L(`Wersja: ${APP_VERSION} → ${hasCode ? target : 'bez zmian'}`, `Version: ${APP_VERSION} → ${hasCode ? target : 'no change'}`));
    say(L('Kopia baz Notion: tak, do backups/<data>/', 'Notion backup: yes, to backups/<date>/'));
    say(L('Zmiany w Notion (tylko dodawanie, nic nie zostanie usunięte):', 'Notion changes (add only, nothing will be removed):'));
    if (notionError) say(`  ${L('nie udało się sprawdzić', 'could not check')}: ${notionError}`);
    else if (!notionChanges.length) say(L('  brak', '  none'));
    for (const c of notionChanges) say(`  + ${c.db} · ${c.kind}: ${c.name}${c.status === 'conflict' ? ` (${L('konflikt', 'conflict')}: ${c.detail})` : ''}`);
    say(L('\nPodgląd: niczego nie zapisałem.', '\nPreview only: nothing was written.'));
  }
  process.exit(0);
}

// ---------- aktualizacja ----------
if (!flag('yes') && !JSON_OUT) {
  say(L(`Aktualizacja ${APP_VERSION} → ${hasCode ? target : APP_VERSION}. Najpierw zrobię kopię baz Notion.`, `Update ${APP_VERSION} → ${hasCode ? target : APP_VERSION}. A Notion backup comes first.`));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(L('Kontynuować? [t/N] ', 'Continue? [y/N] '))).trim();
  rl.close();
  if (!/^(t|tak|y|yes)$/i.test(a)) { say(L('Przerwano, nic nie zmieniono.', 'Cancelled, nothing changed.')); process.exit(0); }
}
for (const s of ['backup', 'download', 'migrate', 'restart']) step(s, 'pending');

let backupDir = '';
step('backup', 'running');
try {
  if (!S.token || !S.sources.trades) throw new Error(L('Brak konfiguracji Notion w .env.', 'No Notion configuration in .env.'));
  const b = await backupAll(notion, S.sources, path.join(CONFIG_DIR, 'backups'), { appVersion: APP_VERSION, schemaVersion: config.schemaVersion || 0 });
  backupDir = b.dir;
  step('backup', 'done', path.relative(CONFIG_DIR, b.dir));
} catch (e) { step('backup', 'error', e.message); fail(L(`Kopia zapasowa się nie udała, więc niczego nie aktualizuję: ${e.message}`, `Backup failed, so nothing was updated: ${e.message}`)); }

step('download', 'running');
try {
  if (!hasCode) step('download', 'done', L('kod jest aktualny', 'code is up to date'));
  else if (mode === 'git') { U.gitPull(ROOT); step('download', 'done', `git pull (${gs.behind})`); }
  else {
    const files = await U.downloadRelease(latest, { allowUnverified: flag('allow-unverified') });
    const n = U.writeFiles(ROOT, files);
    step('download', 'done', `${latest.tag}: ${n} ${L('plików', 'files')}`);
  }
} catch (e) { step('download', 'error', e.message); fail(e.message, { backupDir }); }

step('migrate', 'running');
// migracje uruchamia NOWY kod (osobny proces), bo update.mjs w pamięci to jeszcze stara wersja
const r = spawnSync(process.execPath, [path.join(ROOT, 'update.mjs'), '--migrate-only', '--json'], { env: { ...process.env, THQ_CONFIG_DIR: CONFIG_DIR }, encoding: 'utf8', windowsHide: true });
const lines = r.stdout.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const mErr = lines.find((l) => l.error);
const mig = lines.find((l) => l.migrations)?.migrations;
if (r.status !== 0 || mErr || !mig) {
  const msg = mErr?.error.message || r.stderr.trim() || L('migracja zakończyła się błędem', 'migration failed');
  step('migrate', 'error', msg);
  fail(L(`Pliki są już w nowej wersji, ale migracja Notion się nie udała: ${msg}. Dane są w kopii.`, `Files are updated but the Notion migration failed: ${msg}. Your data is in the backup.`), { backupDir, command: 'node update.mjs --migrate-only' });
}
const added = mig.changes.filter((c) => c.status === 'add');
step('migrate', 'done', added.length ? added.map((c) => `${c.kind}: ${c.name}`).join(', ') : L('bez zmian w Notion', 'no Notion changes'));
emit({ done: true, target, backupDir, changes: mig.changes });
step('restart', 'pending');
if (!JSON_OUT) {
  say(L(`\nZaktualizowano do ${target}. Kopia: ${backupDir}`, `\nUpdated to ${target}. Backup: ${backupDir}`));
  say(L('Jeśli dashboard działa, zatrzymaj go (przycisk w pasku statusu) i uruchom ponownie (Dashboard.vbs / ./start.sh).', 'If the dashboard is running, stop it (status bar button) and start it again (Dashboard.vbs / ./start.sh).'));
}
void existsSync;
process.exit(0);
