@echo off
setlocal

set "INNO=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%INNO%" set "INNO=%ProgramFiles%\Inno Setup 6\ISCC.exe"

echo Building ALERT-CIA frontend...
call npm run build
if errorlevel 1 (
  echo.
  echo Frontend build failed. Fix the build errors before creating the installer.
  pause
  exit /b 1
)

if not exist "%~dp0dist\index.html" (
  echo.
  echo Frontend build output was not found:
  echo   %~dp0dist\index.html
  echo.
  echo The local server installer needs the dist folder so /admin can load.
  pause
  exit /b 1
)

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
