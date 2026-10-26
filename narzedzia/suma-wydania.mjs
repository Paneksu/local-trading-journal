// Suma drzewa plików wydania (tree-sha256) do wklejenia w treść wydania na GitHubie. Aktualizacja z dashboardu
// i update.mjs porównują ją z pobranym archiwum i bez zgodności niczego nie podmieniają. Szczegóły: CONTRIBUTING.md.
// Release tree hash for the GitHub release notes; the updater refuses archives that do not match it.
//
// Użycie / usage:  node narzedzia/suma-wydania.mjs v1.0.0      (tag albo dowolny commit; liczy z `git archive`)
import { spawnSync } from 'node:child_process';
import { parseTar, treeHash } from '../lib/updater.mjs';

const ref = process.argv[2];
if (!ref) { console.error('Podaj tag, np. node narzedzia/suma-wydania.mjs v1.0.0'); process.exit(1); }
const r = spawnSync('git', ['archive', '--format=tar', ref], { maxBuffer: 256 * 1024 * 1024 });
if (r.status !== 0) { console.error(String(r.stderr)); process.exit(1); }
const files = parseTar(r.stdout);
console.log(`tree-sha256: ${treeHash(files)}`);
console.error(`(${files.length} plików z ${ref})`);
