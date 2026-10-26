// Wersja aplikacji (package.json) i wersja schematu baz Notion (schema/notion-schema.json).
// App version (package.json) and the Notion schema version (schema/notion-schema.json).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
export const APP_VERSION = pkg.version;
// Slug repozytorium na GitHubie: repo nie jest przemianowane, a fetch ma redirect:error, więc zostaje stary slug. / The GitHub repo is not renamed; keep the slug.
export const REPO = process.env.THQ_REPO || pkg.repoSlug || 'Paneksu/local-trading-journal';
export function loadSchemaFile(root = ROOT) {
  return JSON.parse(readFileSync(path.join(root, 'schema', 'notion-schema.json'), 'utf8'));
}
export const SCHEMA_VERSION = loadSchemaFile().schemaVersion;

// porównanie semver (major.minor.patch, bez przyrostków): -1 / 0 / 1
export function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}
