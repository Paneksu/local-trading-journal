@echo off
rem Local Trading Journal: aktualizacja (Windows). Najpierw kopia baz Notion, potem nowa wersja i migracje (tylko dodajace).
rem Update (Windows): Notion backup first, then the new version and add-only migrations.
setlocal
cd /d "%~dp0"
chcp 65001 >nul
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
node update.mjs %*
pause
