' JustJournal: uruchomienie BEZ okna konsoli.
' Jeśli dashboard już działa, tylko otwiera przeglądarkę. Jeśli nie, startuje serwer w ukryciu (logi: dashboard.log),
' czeka aż odpowie i dopiero wtedy otwiera przeglądarkę. Zatrzymanie: przycisk „Zatrzymaj serwer” w pasku statusu.
' N1 (1.6.0): przeglądarka otwiera się tylko wtedy, gdy /api/ping odpowiada jako trading-hq. Port zajęty przez inny program albo serwer,
' który nie wstał, kończy się komunikatem (wcześniej skrypt i tak otwierał adres, a użytkownik widział cudzą aplikację albo błąd przeglądarki).
' Komunikaty bez polskich znaków: Windows Script Host czyta plik w stronie kodowej ANSI.
Option Explicit
Dim sh, fso, dir, url, tries, st
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
url = "http://127.0.0.1:4321"
sh.CurrentDirectory = dir

' 0 = nikt nie odpowiada, 1 = dashboard JustJournal (trading-hq), 2 = inny program na tym porcie
Function Probe()
  Dim http
  Probe = 0
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 800, 800, 800, 800
  http.open "GET", url & "/api/ping", False
  http.send
  If Err.Number = 0 Then
    Probe = 2
    If http.status = 200 Then
      If InStr(http.responseText, "trading-hq") > 0 Then Probe = 1
    End If
  End If
  On Error GoTo 0
End Function

Sub Busy()
  MsgBox "Port 4321 zajmuje inny program. Zamknij go i uruchom JustJournal jeszcze raz. Inny port: README, FAQ." & vbCrLf & vbCrLf & _
    "Port 4321 is used by another program. Close it and start JustJournal again. Different port: README, FAQ.", 48, "JustJournal"
  WScript.Quit 1
End Sub

Dim rc
rc = sh.Run("cmd /c node -e ""process.exit(+process.versions.node.split('.')[0]>=22?0:1)""", 0, True)
If rc <> 0 Then
  MsgBox "Potrzebny jest Node.js 22 lub nowszy: https://nodejs.org" & vbCrLf & "Node.js 22 or newer is required: https://nodejs.org", 48, "JustJournal"
  WScript.Quit 1
End If

st = Probe()
If st = 2 Then Busy
If st = 0 Then
  ' N6 (1.6.0): rotacja dashboard.log przed otwarciem (ponad 5 MB -> dashboard.1.log, najwyzej 3 pliki); czekamy na koniec (True)
  sh.Run "cmd /c node lib\log-rotacja.mjs", 0, True
  ' okno ukryte (0), nie czekamy na zakończenie (False)
  sh.Run "cmd /c node server.mjs >> dashboard.log 2>&1", 0, False
  ' Poprawki po review N1-N4 (P3-4): wolny pierwszy start (aktualizacja, skan antywirusa) dostaje do 30 s; po 7,5 s krotka informacja, ze serwer jeszcze startuje
  For tries = 1 To 100
    WScript.Sleep 300
    st = Probe()
    If st <> 0 Then Exit For
    If tries = 25 Then sh.Popup "JustJournal jeszcze startuje, czekam do 30 s..." & vbCrLf & "JustJournal is still starting, waiting up to 30 s...", 3, "JustJournal", 64
  Next
End If
If st = 2 Then Busy
If st <> 1 Then
  MsgBox "Serwer JustJournal nie odpowiada po 30 s. Zobacz plik dashboard.log w folderze aplikacji." & vbCrLf & vbCrLf & _
    "The JustJournal server is not responding after 30 s. See dashboard.log in the app folder.", 48, "JustJournal"
  WScript.Quit 1
End If
sh.Run url, 1, False
