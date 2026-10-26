#!/bin/sh
# JustJournal: start dashboardu (macOS / Linux) w tle, log w dashboard.log, otwiera przeglądarkę.
# Starts the dashboard in the background (log in dashboard.log) and opens the browser.
# Na pierwszym planie (z logami w terminalu) / in the foreground: ./start.sh --foreground
cd "$(dirname "$0")" || exit 1
PORT=4321
URL="http://127.0.0.1:$PORT"
if ! command -v node >/dev/null 2>&1; then
  echo "Nie znaleziono Node.js 22+: https://nodejs.org / Node.js 22+ not found: https://nodejs.org"
  exit 1
fi
if ! node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)"; then
  echo "Potrzebny jest Node.js 22 lub nowszy (masz $(node -v)): https://nodejs.org / Node.js 22+ is required."
  exit 1
fi
open_url() {
  if command -v open >/dev/null 2>&1; then open "$1"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1
  else echo "$1"; fi
}
alive() { node -e "fetch('$URL/api/ping').then(r=>r.json()).then(j=>process.exit(j.app==='trading-hq'?0:1)).catch(()=>process.exit(1))"; }
if alive; then open_url "$URL"; exit 0; fi
if [ "$1" = "--foreground" ]; then
  (sleep 1; open_url "$URL") &
  exec node server.mjs
fi
nohup node server.mjs >> dashboard.log 2>&1 &
i=0
while [ $i -lt 25 ]; do
  sleep 0.3
  if alive; then break; fi
  i=$((i + 1))
done
open_url "$URL"
echo "Dashboard: $URL (zatrzymanie: przycisk w pasku statusu / stop: status bar button)"
