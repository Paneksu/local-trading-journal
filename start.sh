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
# N1 (1.6.0): 0 = dashboard JustJournal (trading-hq), 1 = nikt nie odpowiada, 2 = inny program na porcie. Przeglądarka otwiera się tylko przy 0.
probe() { node -e "fetch('$URL/api/ping').then(r=>r.json().catch(()=>({}))).then(j=>process.exit(j.app==='trading-hq'?0:2)).catch(()=>process.exit(1))"; }
busy() {
  echo "Port $PORT zajmuje inny program. Zamknij go i uruchom JustJournal jeszcze raz (inny port: README, FAQ)."
  echo "Port $PORT is used by another program. Close it and start JustJournal again (different port: README, FAQ)."
  exit 1
}
probe; st=$?
if [ $st -eq 0 ]; then open_url "$URL"; exit 0; fi
if [ $st -eq 2 ]; then busy; fi
if [ "$1" = "--foreground" ]; then
  (sleep 1; open_url "$URL") &
  exec node server.mjs
fi
# N6 (1.6.0): rotacja dashboard.log przed otwarciem (ponad 5 MB -> dashboard.1.log, najwyżej 3 pliki)
node lib/log-rotacja.mjs >/dev/null 2>&1
nohup node server.mjs >> dashboard.log 2>&1 &
# Poprawki po review N1-N4 (P3-4): wolny pierwszy start dostaje do 30 s; po 7,5 s informacja, że serwer jeszcze startuje
i=0
while [ $i -lt 100 ]; do
  sleep 0.3
  probe; st=$?
  if [ $st -ne 1 ]; then break; fi
  if [ $i -eq 25 ]; then echo "JustJournal jeszcze startuje, czekam do 30 s... / JustJournal is still starting, waiting up to 30 s..."; fi
  i=$((i + 1))
done
if [ $st -eq 2 ]; then busy; fi
if [ $st -ne 0 ]; then
  echo "Serwer JustJournal nie odpowiada po 30 s. Zobacz dashboard.log w folderze aplikacji."
  echo "The JustJournal server is not responding after 30 s. See dashboard.log in the app folder."
  exit 1
fi
open_url "$URL"
echo "Dashboard: $URL (zatrzymanie: przycisk w pasku statusu / stop: status bar button)"
