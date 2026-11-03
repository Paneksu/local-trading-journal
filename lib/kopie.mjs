// N5 (1.6.0): kopie baz Notion i przywracanie z Ustawień → Kopie i diagnostyka.
// Logika kopii i planu zostaje w lib/backup.mjs (backupAll, planRestore, applyRestore): ten moduł tylko listuje kopie, prowadzi jedno zadanie
// naraz (kopia teraz, podgląd, przywrócenie) z postępem i pilnuje kolejności: przywrócenie tylko po podglądzie tej samej kopii, po wpisaniu
// słowa potwierdzenia i zawsze po kopii bieżącego stanu (powód „before-restore”). Nazwa kopii przychodzi z żądania, ale katalog wybieramy
// wyłącznie z listy (wzorzec znacznika czasu, katalog z manifest.json, nie dowiązanie), więc żądanie nie wskaże ścieżki.
// Odpowiedzi nie mają tokenu, identyfikatorów baz ani ścieżek plików kopii; wpisy z podglądu mają tylko bazę, tytuł, rodzaj zmiany i nazwy pól.
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 7: usuwania kopii baz z UI nie ma)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 8: przywracanie Notion z kopii z UI po wpisaniu „TAK”)
import { existsSync, readdirSync, readFileSync, lstatSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { DBS } from './roles.mjs';
import { backupAll, planRestore, applyRestore, foreignDbs } from './backup.mjs';

// znacznik z backupAll: 2026-10-31T09-14-00Z (starsze kopie bywają bez „Z”)
export const BACKUP_NAME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z?$/;
// podgląd w odpowiedzi: najwyżej tyle wpisów z nazwami (liczby w podsumowaniu zawsze pełne)
export const PREVIEW_ITEMS = 200;
// final (review kodu P2-2, bezp. P3-2): zgoda z podglądu to jednorazowy znacznik ważny tyle czasu i tylko dla planu, który pokazał podgląd
export const PREVIEW_TTL_MS = 10 * 60 * 1000;
const REASONS = new Set(['update', 'manual', 'before-restore', 'before-tz-fix']);

export class BackupError extends Error {
  constructor(message, status = 400, code = 'error') { super(message); this.status = status; this.code = code; }
}
const fmt = (s, p) => (p ? s.replace(/\{(\w+)\}/g, (_, k) => p[k] ?? '') : s);
const stampNow = () => new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function dirBytes(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isFile()) n += statSync(p).size;
  }
  return n;
}

// Katalog kopii o tej nazwie albo null. Nazwa spoza wzorca, dowiązanie albo katalog bez manifest.json = null.
export function findBackup(backupsDir, name) {
  if (typeof name !== 'string' || !BACKUP_NAME_RE.test(name)) return null;
  const dir = path.join(backupsDir, name);
  try {
    const st = lstatSync(dir);
    if (!st.isDirectory() || st.isSymbolicLink()) return null;
    if (!lstatSync(path.join(dir, 'manifest.json')).isFile()) return null;
  } catch { return null; }
  return dir;
}

// Lista kopii, najnowsza pierwsza: { name, createdAt, appVersion, schemaVersion, reason, restoreFrom, counts, total, bytes, unreadable, otherJournal }
// sources (bieżące bazy): otherJournal = kopia z innego dziennika (final, bezp. P3-1); bez sources zawsze false
export function listBackups(backupsDir, sources = null) {
  if (!existsSync(backupsDir)) return [];
  const out = [];
  for (const e of readdirSync(backupsDir, { withFileTypes: true })) {
    const dir = findBackup(backupsDir, e.name);
    if (!dir) continue;
    let m = null;
    try { m = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { m = null; }
    const counts = m && typeof m.counts === 'object' && m.counts ? Object.fromEntries(DBS.filter((db) => Number.isFinite(m.counts[db])).map((db) => [db, m.counts[db]])) : {};
    out.push({
      name: e.name,
      createdAt: typeof m?.createdAt === 'string' ? m.createdAt : null,
      appVersion: typeof m?.appVersion === 'string' ? m.appVersion : null,
      schemaVersion: Number.isFinite(m?.schemaVersion) ? m.schemaVersion : null,
      // kopie z aktualizacji (update.mjs) nie mają powodu w manifeście
      reason: REASONS.has(m?.reason) ? m.reason : 'update',
      restoreFrom: typeof m?.restoreFrom === 'string' && BACKUP_NAME_RE.test(m.restoreFrom) ? m.restoreFrom : null,
      counts, total: Object.values(counts).reduce((a, b) => a + b, 0),
      bytes: dirBytes(dir),
      unreadable: !m,
      otherJournal: !!sources && foreignDbs(dir, sources).length > 0,
    });
  }
  return out.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

// Podsumowanie planu (bez wartości pól): liczby stron i pól, rozbicie na bazy, do PREVIEW_ITEMS wpisów z nazwami pól
export function summarizePlan(plan) {
  const s = { pages: plan.items.length, update: 0, untrash: 0, recreate: 0, fields: 0, unchanged: plan.unchanged, already: plan.already || 0, byDb: {} };
  for (const it of plan.items) {
    s[it.action]++;
    s.fields += it.fields.length;
    const d = (s.byDb[it.db] ||= { update: 0, untrash: 0, recreate: 0 });
    d[it.action]++;
  }
  // wpis bez tytułu: planRestore podstawia identyfikator strony, którego w podglądzie nie pokazujemy
  const items = plan.items.slice(0, PREVIEW_ITEMS).map(({ db, id, was, title, action, fields, already }) => ({ db, title: title === id || title === was ? '' : String(title).slice(0, 200), action, fields: fields.slice(0, 30), already: !!already }));
  return { summary: s, items, more: Math.max(0, plan.items.length - items.length) };
}
// Skrót planu (bazy, strony, rodzaj zmiany, pola): przywrócenie odrzuca plan inny niż ten z podglądu
export function planKey(plan) {
  const rows = plan.items.map((it) => [it.db, it.id, it.action, [...it.fields].sort()]);
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

// notion, sources: klient i identyfikatory baz serwera; meta(): { appVersion, schemaVersion }; isBusy(): powód cudzej blokady (aktualizacja, tworzenie
// dziennika, kopia katalogu, pobieranie świec) albo null; lang(): 'pl' | 'en' (słowo potwierdzenia); onRestored(): po zapisie (odświeżenie danych dashboardu)
export function createBackups({ notion, sources, backupsDir, meta = () => ({}), isBusy = () => null, lang = () => 'pl', t = fmt, onRestored = () => {}, scrub = (s) => s, log = (m) => console.log(m), now = () => Date.now() }) {
  const idle = () => ({ running: false, kind: null, step: null, name: null, done: 0, total: 0, result: null, error: null, startedAt: null, finishedAt: null });
  let job = idle();
  // ostatni udany podgląd: { name, token, key, at }. Przywrócenie wymaga tej samej kopii, znacznika z wyniku podglądu, świeżości (PREVIEW_TTL_MS)
  // i tego samego planu. final (P2-2): znacznik jest jednorazowy, kasowany na początku każdej próby przywrócenia
  let previewed = null;
  const word = () => (lang() === 'en' ? 'YES' : 'TAK');
  const busy = () => (job.running ? t('Trwa kopia albo przywracanie baz Notion. Spróbuj po zakończeniu.') : null);

  function guard() {
    if (job.running) throw new BackupError(busy(), 409, 'running');
    const other = isBusy();
    if (other) throw new BackupError(other, 409, 'running');
    if (!DBS.some((db) => sources[db]) || notion.hasToken === false) throw new BackupError(t('Dashboard nie jest połączony z Notion. Najpierw połącz dziennik w pierwszych krokach.'), 409, 'not-configured');
  }
  function named(name) {
    const dir = findBackup(backupsDir, name);
    if (!dir) throw new BackupError(t('Nie ma takiej kopii. Odśwież listę kopii.'), 400, 'bad-name');
    return dir;
  }
  // final (bezp. P3-1): kopia z innego dziennika (inne identyfikatory baz) odtworzyłaby cudze wpisy jako nowe
  function sameJournal(dir) {
    if (foreignDbs(dir, sources).length) throw new BackupError(t('Ta kopia pochodzi z innego dziennika. Przywrócić można tylko kopię dziennika, który jest teraz połączony.'), 409, 'other-journal');
  }
  // backupAll nazywa katalog sekundą startu: druga kopia w tej samej sekundzie nadpisałaby pierwszą, więc czekamy na następną
  async function freshBackup(extra) {
    while (existsSync(path.join(backupsDir, stampNow()))) await sleep(250);
    // postęp po bazach: backupAll czyta każdą bazę jednym queryAll
    const counting = Object.create(notion);
    counting.queryAll = (...a) => { job.done = Math.min(job.total, job.done + 1); return notion.queryAll(...a); };
    job.done = 0; job.total = DBS.filter((db) => sources[db]).length;
    const b = await backupAll(counting, sources, backupsDir, { ...meta(), ...extra });
    return path.basename(b.dir);
  }
  function start(kind, name, fn) {
    job = { ...idle(), running: true, kind, name, startedAt: new Date().toISOString() };
    Promise.resolve().then(fn).then((result) => {
      job = { ...job, running: false, step: null, result, finishedAt: new Date().toISOString() };
    }, (e) => {
      job = { ...job, running: false, error: { message: scrub(e?.message || t('Nie udało się.')), code: e?.code || null }, finishedAt: new Date().toISOString() };
      log(`[backups] ${kind} failed: ${scrub(e?.message || '')}`);
    });
    return { started: true, kind };
  }

  async function create() {
    guard();
    return start('create', null, async () => {
      job.step = 'backup';
      const name = await freshBackup({ reason: 'manual' });
      log(`[backups] Backup created: ${name}.`);
      return { name };
    });
  }
  async function preview(name) {
    const dir = named(name);
    guard();
    sameJournal(dir);
    previewed = null;
    return start('preview', name, async () => {
      job.step = 'plan';
      const plan = await planRestore(notion, sources, dir);
      const token = randomBytes(16).toString('hex');
      previewed = { name, token, key: planKey(plan), at: now() };
      return { name, token, expiresInSec: Math.round(PREVIEW_TTL_MS / 1000), ...summarizePlan(plan) };
    });
  }
  async function restore(name, confirm, token) {
    // final (P2-2): zgoda z podglądu przepada przy każdej próbie (także odrzuconej); kolejna próba wymaga nowego podglądu
    const pv = previewed;
    previewed = null;
    const dir = named(name);
    if (confirm !== word()) throw new BackupError(t('Wpisz dokładnie {word}, aby przywrócić.', { word: word() }), 400, 'confirm-required');
    guard();
    sameJournal(dir);
    if (!pv || pv.name !== name) throw new BackupError(t('Najpierw otwórz podgląd przywracania tej kopii.'), 409, 'preview-required');
    if (typeof token !== 'string' || token !== pv.token || now() - pv.at > PREVIEW_TTL_MS) throw new BackupError(t('Podgląd jest nieaktualny. Otwórz podgląd przywracania jeszcze raz.'), 409, 'preview-required');
    return start('restore', name, async () => {
      try {
        job.step = 'plan';
        const plan = await planRestore(notion, sources, dir);
        if (planKey(plan) !== pv.key) throw new BackupError(t('Dane w Notion zmieniły się od podglądu. Otwórz podgląd przywracania jeszcze raz.'), 409, 'plan-changed');
        if (!plan.items.length) return { name, restored: 0, safety: null, summary: summarizePlan(plan).summary };
        // kopia bieżącego stanu przed zapisem: zmiany pól i wyjęcie z kosza da się nią cofnąć (odtworzonych wpisów nie usuwa)
        job.step = 'backup';
        const safety = await freshBackup({ reason: 'before-restore', restoreFrom: name });
        job.step = 'apply'; job.done = 0; job.total = plan.items.length;
        const restored = await applyRestore(notion, sources, plan, { log: () => { job.done++; }, dir });
        log(`[backups] Restored ${restored} entries from ${name} (safety copy ${safety}).`);
        onRestored();
        return { name, restored, safety, summary: summarizePlan(plan).summary };
      } catch (e) {
        // final (P2-2): częściowy zapis też odświeża dane dashboardu
        if (job.step === 'apply' && job.done > 0) onRestored();
        throw e;
      } finally {
        previewed = null;
      }
    });
  }
  // kopia dla innego zadania, które samo pilnuje swojej blokady (poprawa strefy czasu starych wpisów, lib/strefa-notion.mjs): bez isBusy(), bo to zadanie jest w nim zliczone
  async function copyNow(extra = {}) {
    if (job.running) throw new BackupError(busy(), 409, 'running');
    if (!DBS.some((db) => sources[db]) || notion.hasToken === false) throw new BackupError(t('Dashboard nie jest połączony z Notion. Najpierw połącz dziennik w pierwszych krokach.'), 409, 'not-configured');
    const name = await freshBackup(extra);
    log(`[backups] Backup created: ${name} (${extra.reason || 'manual'}).`);
    return name;
  }
  const status = () => ({ ...job });
  const list = () => ({ dir: backupsDir, items: listBackups(backupsDir, sources), job: status(), word: word() });
  return { list, status, busy, create, preview, restore, copyNow };
}
