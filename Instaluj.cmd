@echo off
rem JustJournal: instalacja (Windows). Sprawdza Node.js, tworzy skrot na pulpicie, uruchamia dashboard w tle
rem i otwiera przegladarke na kreatorze "Pierwsze kroki" (token Notion, strona, utworzenie dziennika).
rem Instalacja w terminalu (zapasowo): Instaluj.cmd --cli
rem Installer (Windows): checks Node.js, creates a desktop shortcut, starts the dashboard and opens the setup wizard.
setlocal
cd /d "%~dp0"
chcp 65001 >nul
if /i "%~1"=="--cli" goto cli

where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)"
if errorlevel 1 goto oldnode

echo Tworze skrot "JustJournal" na pulpicie...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0narzedzia\utworz-skrot.ps1" >nul 2>nul
echo Uruchamiam dashboard i otwieram kreator w przegladarce: http://127.0.0.1:4321
echo Starting the dashboard and opening the setup wizard: http://127.0.0.1:4321
start "" wscript "%~dp0Dashboard.vbs"
exit /b 0

:cli
where node >nul 2>nul
if errorlevel 1 goto nonode
node setup.mjs --cli %2 %3 %4 %5 %6 %7 %8 %9
pause
exit /b 0

:oldnode
for /f "delims=" %%v in ('node -v') do echo Masz Node.js %%v, a potrzebny jest 22 lub nowszy. / You have Node.js %%v, version 22+ is required.
:nonode
echo.
echo Potrzebny jest Node.js 22 lub nowszy. / Node.js 22 or newer is required.
where winget >nul 2>nul
if errorlevel 1 goto manual
set /p ANS="Zainstalowac Node.js LTS przez winget? / Install Node.js LTS with winget? [t/n] "
if /i "%ANS%"=="t" goto winget
if /i "%ANS%"=="y" goto winget
goto manual
:winget
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
echo.
echo Gotowe. Zamknij to okno i uruchom Instaluj.cmd jeszcze raz (nowe okno widzi juz Node.js).
echo Done. Close this window and run Instaluj.cmd again (a new window sees Node.js).
pause
exit /b 0
:manual
echo Pobierz instalator: https://nodejs.org (wersja LTS), zainstaluj i uruchom Instaluj.cmd jeszcze raz.
echo Download the installer: https://nodejs.org (LTS), install it and run Instaluj.cmd again.
start "" https://nodejs.org/en/download
pause
exit /b 1
