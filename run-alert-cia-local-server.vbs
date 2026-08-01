Set shell = CreateObject("WScript.Shell")
Set filesystem = CreateObject("Scripting.FileSystemObject")

scriptDirectory = filesystem.GetParentFolderName(WScript.ScriptFullName)
rootDataDirectory = shell.ExpandEnvironmentStrings("%ProgramData%") & "\ALERT-CIA"
dataDirectory = shell.ExpandEnvironmentStrings("%ProgramData%") & "\ALERT-CIA\local-server"
serverScript = scriptDirectory & "\scripts\local-alert-cia-server.mjs"

If Not filesystem.FolderExists(rootDataDirectory) Then
  filesystem.CreateFolder(rootDataDirectory)
End If

If Not filesystem.FolderExists(dataDirectory) Then
  filesystem.CreateFolder(dataDirectory)
End If

shell.Environment("PROCESS")("ALERT_CIA_LOCAL_HOST") = "0.0.0.0"
shell.Environment("PROCESS")("ALERT_CIA_LOCAL_PORT") = "4000"
shell.Environment("PROCESS")("ALERT_CIA_LOCAL_DATA_DIR") = dataDirectory

command = "node.exe --no-warnings=ExperimentalWarning " & """" & serverScript & """"
shell.Run command, 0, False
