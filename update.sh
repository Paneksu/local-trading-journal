#!/bin/sh
# JustJournal: aktualizacja (macOS / Linux). Najpierw kopia baz Notion, potem nowa wersja i migracje.
# Update (macOS / Linux): Notion backup first, then the new version and add-only migrations.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1 || ! node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)"; then
  echo "Potrzebny jest Node.js 22 lub nowszy: https://nodejs.org / Node.js 22+ is required: https://nodejs.org"
  exit 1
fi
exec node update.mjs "$@"
