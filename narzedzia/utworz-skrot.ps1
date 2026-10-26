# Tworzy skrot "JustJournal" na pulpicie: uruchamia Dashboard.vbs (bez okna konsoli) z ikona trading-hq.ico (nazwa pliku ikony bez zmian).
# Creates a "JustJournal" desktop shortcut that starts Dashboard.vbs (no console window).
# Uzycie / usage: powershell -ExecutionPolicy Bypass -File narzedzia\utworz-skrot.ps1
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'JustJournal.lnk'
# Stare skroty z poprzednich nazw (Local Trading Journal, Trading HQ) usuwamy, zeby nie zostaly sieroty. / Remove old-name shortcuts so no orphan is left.
foreach ($old in 'Local Trading Journal.lnk','Trading HQ.lnk') { $p = Join-Path $desktop $old; if (Test-Path $p) { Remove-Item $p -Force } }
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$s.Arguments = '"' + (Join-Path $root 'Dashboard.vbs') + '"'
$s.WorkingDirectory = $root
$s.IconLocation = (Join-Path $root 'trading-hq.ico') + ',0'
$s.WindowStyle = 7
$s.Description = 'JustJournal: dashboard (http://127.0.0.1:4321)'
$s.Save()
Write-Output "OK: $lnk"
