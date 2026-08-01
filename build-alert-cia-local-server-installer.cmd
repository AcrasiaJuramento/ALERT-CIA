@echo off
setlocal

set "INNO=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%INNO%" set "INNO=%ProgramFiles%\Inno Setup 6\ISCC.exe"

if not exist "%INNO%" (
  echo Inno Setup 6 was not found.
  echo Download and install Inno Setup, then run this file again.
  echo.
  echo Optional Node bundle:
  echo   Put node-v22-x64.msi inside installer\dependencies before building.
  pause
  exit /b 1
)

"%INNO%" "%~dp0installer\ALERT-CIA-Local-Server.iss"

echo.
echo Installer build complete.
echo Output folder:
echo   %~dp0installer\dist
pause
