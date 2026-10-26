# Tworzy skrot "Local Trading Journal" na pulpicie: uruchamia Dashboard.vbs (bez okna konsoli) z ikona trading-hq.ico.
# Creates a "Local Trading Journal" desktop shortcut that starts Dashboard.vbs (no console window).
# Uzycie / usage: powershell -ExecutionPolicy Bypass -File narzedzia\utworz-skrot.ps1
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'Local Trading Journal.lnk'
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$s.Arguments = '"' + (Join-Path $root 'Dashboard.vbs') + '"'
$s.WorkingDirectory = $root
$s.IconLocation = (Join-Path $root 'trading-hq.ico') + ',0'
$s.WindowStyle = 7
$s.Description = 'Local Trading Journal: dashboard (http://127.0.0.1:4321)'
$s.Save()
Write-Output "OK: $lnk"
