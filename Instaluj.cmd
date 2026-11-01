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
:start
node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)"
if errorlevel 1 goto oldnode

echo Tworze skrot "JustJournal" na pulpicie... / Creating the "JustJournal" desktop shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0narzedzia\utworz-skrot.ps1" >nul 2>nul
echo Uruchamiam dashboard i otwieram kreator w przegladarce: http://127.0.0.1:4321
echo Starting the dashboard and opening the setup wizard: http://127.0.0.1:4321
echo Pozniej uruchamiasz JustJournal skrotem na pulpicie. To okno mozesz zamknac.
echo Next time start JustJournal with the desktop shortcut. You can close this window.
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
echo Moge zainstalowac Node.js LTS przez winget (instalator Windows). / I can install Node.js LTS with winget.
set /p ANS="Wpisz t i nacisnij Enter, aby zainstalowac (n = nie). / Type y and press Enter to install (n = no): "
if /i "%ANS%"=="t" goto winget
if /i "%ANS%"=="y" goto winget
goto manual
:winget
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
set "WGCODE=%errorlevel%"
rem N6 (1.6.0): to okno nie widzi jeszcze nowej sciezki PATH; probujemy Node.js z domyslnego folderu i jedziemy dalej bez ponownego uruchamiania
rem final (1.6.0): dalej tylko wtedy, gdy ten Node.js ma wersje 22 lub nowsza; nieudany winget konczy sie komunikatem i strona Node.js
if exist "%ProgramFiles%\nodejs\node.exe" (
  "%ProgramFiles%\nodejs\node.exe" -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)"
  if not errorlevel 1 (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    echo.
    echo Node.js zainstalowany. Kontynuuje instalacje JustJournal... / Node.js installed. Continuing the JustJournal setup...
    goto start
  )
)
if not "%WGCODE%"=="0" goto wingetfail
echo.
echo Node.js zainstalowany, ale to okno jeszcze go nie widzi. Zamknij je i uruchom Instaluj.cmd jeszcze raz.
echo Node.js is installed, but this window does not see it yet. Close it and run Instaluj.cmd again.
pause
exit /b 0
:wingetfail
echo.
echo Instalacja Node.js przez winget sie nie udala (kod %WGCODE%). Zainstaluj Node.js 22 lub nowszy recznie.
echo Installing Node.js with winget failed (code %WGCODE%). Install Node.js 22 or newer manually.
goto manual
:manual
echo Otwieram strone Node.js. Pobierz instalator w wersji LTS, zainstaluj go i uruchom Instaluj.cmd jeszcze raz.
echo Opening the Node.js website. Download the LTS installer, install it and run Instaluj.cmd again.
start "" https://nodejs.org/en/download
pause
exit /b 1
