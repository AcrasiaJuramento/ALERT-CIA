#define MyAppName "ALERT-CIA Local Server"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "ALERT-CIA"
#define IncludeNodeInstaller FileExists("dependencies\node-v22-x64.msi")

[Setup]
AppId={{58B4C69A-A92C-4E52-AE35-4A1512404000}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\ALERT-CIA Local Server
DefaultGroupName=ALERT-CIA
OutputDir=dist
OutputBaseFilename=ALERT-CIA-Local-Server-Installer
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

[Dirs]
Name: "{commonappdata}\ALERT-CIA\local-server"; Permissions: users-modify

[Files]
#if IncludeNodeInstaller
Source: "dependencies\node-v22-x64.msi"; DestDir: "{tmp}"; Flags: deleteafterinstall
#endif
Source: "..\scripts\local-alert-cia-server.mjs"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\start-alert-cia-local-server.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\run-alert-cia-local-server-hidden.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\run-alert-cia-local-server.vbs"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Start ALERT-CIA Local Server"; Filename: "{app}\start-alert-cia-local-server.cmd"
Name: "{group}\Start ALERT-CIA Local Server Hidden"; Filename: "wscript.exe"; Parameters: """{app}\run-alert-cia-local-server.vbs"""
Name: "{group}\Open Local Server Data"; Filename: "{commonappdata}\ALERT-CIA\local-server"

[Run]
#if IncludeNodeInstaller
Filename: "msiexec.exe"; Parameters: "/i ""{tmp}\node-v22-x64.msi"" /qn"; StatusMsg: "Installing Node.js runtime..."; Flags: runhidden waituntilterminated
#endif
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""ALERT-CIA Local Server"" dir=in action=allow protocol=TCP localport=4000"; StatusMsg: "Opening Windows Firewall port 4000..."; Flags: runhidden waituntilterminated
Filename: "schtasks.exe"; Parameters: "/Create /TN ""ALERT-CIA Local Server"" /TR ""wscript.exe """"{app}\run-alert-cia-local-server.vbs"""""" /SC ONLOGON /RL HIGHEST /F"; StatusMsg: "Registering ALERT-CIA local server startup task..."; Flags: runhidden waituntilterminated
Filename: "wscript.exe"; Parameters: """{app}\run-alert-cia-local-server.vbs"""; StatusMsg: "Starting ALERT-CIA local server..."; Flags: runhidden nowait

[UninstallRun]
Filename: "schtasks.exe"; Parameters: "/Delete /TN ""ALERT-CIA Local Server"" /F"; Flags: runhidden waituntilterminated
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""ALERT-CIA Local Server"" protocol=TCP localport=4000"; Flags: runhidden waituntilterminated

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
#if !IncludeNodeInstaller
  MsgBox(
    'Node.js is not bundled with this installer.' + #13#10 + #13#10 +
    'Install Node.js LTS on the office PC before running the ALERT-CIA Local Server installer, or place node-v22-x64.msi in installer\dependencies before compiling.',
    mbInformation,
    MB_OK
  );
#endif
end;
