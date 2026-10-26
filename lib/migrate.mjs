// Migracje schematu Notion: pliki migrations/NNN-*.mjs uruchamiane po kolei od wersji zapisanej w config.local.json.
// Migracja to lista DEKLARATYWNYCH operacji, wyłącznie dodających: addProperty, addOption, addView.
// Runner sprawdza listę przed pierwszym żądaniem do Notion i odrzuca każdą inną operację.
// Schema migrations: declarative, add-only operations, applied in order from the stored schemaVersion.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureProperty, ensureOption, ensureView } from './workspace.mjs';

export const ALLOWED_OPS = new Set(['addProperty', 'addOption', 'addView']);
const FILE_RE = /^(\d{3})-[a-z0-9-]+\.mjs$/;

export async function loadMigrations(dir) {
  const files = readdirSync(dir).filter((f) => FILE_RE.test(f)).sort();
  const out = [];
  for (const f of files) {
    const mod = (await import(pathToFileURL(path.join(dir, f)).href)).default;
    const version = Number(f.match(FILE_RE)[1]);
    if (!mod || mod.version !== version) throw new Error(`${f}: pole version musi być równe numerowi pliku (${version}) / version must match the file number`);
    validateMigration(mod, f);
    out.push({ file: f, ...mod });
  }
  return out;
}

// Sprawdzenie zasad (używa go też test): tylko dozwolone operacje, kompletne dane.
export function validateMigration(m, name = 'migration') {
  if (!Array.isArray(m.ops)) throw new Error(`${name}: brak listy ops`);
  for (const op of m.ops) {
    if (!ALLOWED_OPS.has(op.op)) throw new Error(`${name}: operacja „${op.op}” jest zabroniona (dozwolone: ${[...ALLOWED_OPS].join(', ')}) / forbidden operation`);
    if (!op.db) throw new Error(`${name}: operacja bez bazy (db)`);
    if (op.op === 'addProperty' && (!op.role || !op.spec?.type || !op.spec?.name)) throw new Error(`${name}: addProperty wymaga role i spec {type, name}`);
    if (op.op === 'addProperty' && op.spec.type === 'relation' && op.spec.syncedRole) throw new Error(`${name}: relacja dwustronna zmienia drugą bazę; użyj relacji jednostronnej`);
    if (op.op === 'addOption' && (!op.role || !op.option?.name)) throw new Error(`${name}: addOption wymaga role i option {name}`);
    if (op.op === 'addView' && (!op.view?.key || !op.view?.type || !op.view?.name)) throw new Error(`${name}: addView wymaga view {key, type, name}`);
    for (const k of Object.keys(op)) if (/delete|remove|rename|archive|trash/i.test(k)) throw new Error(`${name}: niedozwolony klucz „${k}”`);
  }
}

// ctx: { notion, sources, config, lang, schema, dryRun }. Zwraca { changes, from, to, applied }.
// Po każdej w pełni wykonanej migracji podnosi config.schemaVersion (przerwanie w połowie jest bezpieczne: operacje są idempotentne).
export async function runMigrations(ctx, migrations, { onStep, persist } = {}) {
  const from = Number(ctx.config.schemaVersion) || 0;
  const pending = migrations.filter((m) => m.version > from);
  // role dodane przez migracje (np. pole spoza ROLES) są potrzebne kolejnym operacjom do znalezienia pola po nazwie
  ctx.extraSpecs = {};
  for (const m of migrations) for (const op of m.ops) if (op.op === 'addProperty') (ctx.extraSpecs[op.db] ||= {})[op.role] = op.spec;
  const changes = [];
  let to = from;
  for (const m of pending) {
    onStep?.(m);
    for (const op of m.ops) {
      let ch;
      if (op.op === 'addProperty') ch = await ensureProperty(ctx, op.db, op.role, op.spec);
      else if (op.op === 'addOption') ch = await ensureOption(ctx, op.db, op.role, op.option);
      else ch = await ensureView(ctx, op.db, op.view);
      changes.push({ version: m.version, ...ch });
    }
    to = m.version;
    if (!ctx.dryRun) { ctx.config.schemaVersion = m.version; persist?.(); }
  }
  return { changes, from, to, pending: pending.map((m) => ({ version: m.version, description: m.description })) };
}
