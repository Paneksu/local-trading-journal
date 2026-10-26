@echo off
rem Local Trading Journal: start dashboardu z oknem konsoli (do diagnozy). Zamkniecie okna zatrzymuje serwer.
rem Starts the dashboard with a console window. Closing the window stops the server.
setlocal
cd /d "%~dp0"
chcp 65001 >nul
set PORT=4321
where node >nul 2>nul
if errorlevel 1 (
  echo Nie znaleziono Node.js 22+: https://nodejs.org / Node.js 22+ not found: https://nodejs.org
  pause
  exit /b 1
)
node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)"
if errorlevel 1 (
  echo Potrzebny jest Node.js 22 lub nowszy: https://nodejs.org / Node.js 22+ is required: https://nodejs.org
  pause
  exit /b 1
)
rem Jesli dashboard juz dziala na porcie, tylko otworz przegladarke.
node -e "fetch('http://127.0.0.1:%PORT%/api/ping').then(r=>r.json()).then(j=>process.exit(j.app==='trading-hq'?0:1)).catch(()=>process.exit(1))"
if %errorlevel%==0 (
  start "" "http://127.0.0.1:%PORT%"
  exit /b 0
)
start "" /b cmd /c "timeout /t 1 /nobreak >nul & start "" http://127.0.0.1:%PORT%"
title Local Trading Journal (zamknij okno, aby zatrzymac / close to stop)
node server.mjs
pause
