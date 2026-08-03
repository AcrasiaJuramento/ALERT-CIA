@echo off
setlocal

set "TASK_NAME=ALERT-CIA Local Server"
set "START_SCRIPT=%~dp0run-alert-cia-local-server.vbs"

echo Installing ALERT-CIA local LAN server startup task...
echo.
echo Task name:
echo   %TASK_NAME%
echo.
echo Startup script:
echo   %START_SCRIPT%
echo.

schtasks /Create /TN "%TASK_NAME%" /TR "wscript.exe \"%START_SCRIPT%\"" /SC ONLOGON /RL LIMITED /F

echo.
echo Done. The local ALERT-CIA server will start when this Windows user logs in.
echo Keep this office PC awake while tablets need LAN sync.
pause
