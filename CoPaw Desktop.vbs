Option Explicit

Dim fso, shell, appDir, appCmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

appDir = "D:\CoPaw"
appCmd = appDir & "\copaw.cmd"

If fso.FileExists(appCmd) Then
  shell.CurrentDirectory = appDir
  shell.Run """" & appCmd & """", 0, False
  WScript.Quit 0
End If

MsgBox "找不到: " & appCmd, vbCritical, "CoPaw Desktop"
WScript.Quit 1

