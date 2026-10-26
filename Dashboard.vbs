' Trading HQ: uruchomienie BEZ okna konsoli.
' Jeśli dashboard już działa, tylko otwiera przeglądarkę. Jeśli nie, startuje serwer w ukryciu (logi: dashboard.log),
' czeka aż odpowie i dopiero wtedy otwiera przeglądarkę. Zatrzymanie: przycisk „Zatrzymaj serwer” w pasku statusu.
Option Explicit
Dim sh, fso, dir, url, tries
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
url = "http://127.0.0.1:4321"
sh.CurrentDirectory = dir

Function Alive()
  Dim http
  Alive = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 800, 800, 800, 800
  http.open "GET", url & "/api/ping", False
  http.send
  If Err.Number = 0 Then
    If http.status = 200 Then
      If InStr(http.responseText, "trading-hq") > 0 Then Alive = True
    End If
  End If
  On Error GoTo 0
End Function

Dim rc
rc = sh.Run("cmd /c node -e ""process.exit(+process.versions.node.split('.')[0]>=22?0:1)""", 0, True)
If rc <> 0 Then
  MsgBox "Potrzebny jest Node.js 22 lub nowszy: https://nodejs.org" & vbCrLf & "Node.js 22 or newer is required: https://nodejs.org", 48, "Local Trading Journal"
  WScript.Quit 1
End If

If Not Alive() Then
  ' okno ukryte (0), nie czekamy na zakończenie (False)
  sh.Run "cmd /c node server.mjs >> dashboard.log 2>&1", 0, False
  For tries = 1 To 25
    WScript.Sleep 300
    If Alive() Then Exit For
  Next
End If
sh.Run url, 1, False
