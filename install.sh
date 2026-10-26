#!/bin/sh
# JustJournal: instalacja (macOS / Linux). Sprawdza Node.js, tworzy skrót na pulpicie, uruchamia dashboard
# w tle i otwiera przeglądarkę na kreatorze „Pierwsze kroki”. Instalacja w terminalu (zapasowo): ./install.sh --cli
# Installer (macOS / Linux): checks Node.js, creates a desktop shortcut, starts the dashboard and opens the setup wizard.
cd "$(dirname "$0")" || exit 1
DIR="$(pwd)"
if ! command -v node >/dev/null 2>&1 || ! node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)"; then
  echo "Potrzebny jest Node.js 22 lub nowszy. / Node.js 22 or newer is required."
  if [ "$(uname)" = "Darwin" ]; then
    echo "  macOS: brew install node   (albo instalator / or the installer: https://nodejs.org/en/download)"
  else
    echo "  Linux: https://nodejs.org/en/download (np. / e.g. nvm install 22)"
  fi
  echo "Potem uruchom ./install.sh jeszcze raz. / Then run ./install.sh again."
  exit 1
fi
chmod +x start.sh update.sh install.sh 2>/dev/null
if [ "$1" = "--cli" ]; then shift; exec node setup.mjs --cli "$@"; fi

# skrót na pulpicie
DESK="$HOME/Desktop"
[ -d "$DESK" ] || DESK="$(xdg-user-dir DESKTOP 2>/dev/null)"
if [ -n "$DESK" ] && [ -d "$DESK" ]; then
  # stare skróty z poprzedniej nazwy (Local Trading Journal) usuwamy, żeby nie zostały sieroty
  rm -f "$DESK/Local Trading Journal.command" "$DESK/local-trading-journal.desktop"
  if [ "$(uname)" = "Darwin" ]; then
    printf '#!/bin/sh\nexec "%s/start.sh"\n' "$DIR" > "$DESK/JustJournal.command"
    chmod +x "$DESK/JustJournal.command"
  else
    printf '[Desktop Entry]\nType=Application\nName=JustJournal\nExec=sh "%s/start.sh"\nTerminal=false\n' "$DIR" > "$DESK/justjournal.desktop"
    chmod +x "$DESK/justjournal.desktop"
  fi
fi
echo "Uruchamiam dashboard i otwieram kreator: http://127.0.0.1:4321 / Starting the dashboard and the setup wizard."
exec ./start.sh
