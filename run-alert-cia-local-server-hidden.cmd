@echo off
setlocal

cd /d "%~dp0"

set "ALERT_CIA_LOCAL_HOST=0.0.0.0"
if "%ALERT_CIA_LOCAL_PORT%"=="" set "ALERT_CIA_LOCAL_PORT=4000"
if "%ALERT_CIA_LOCAL_DATA_DIR%"=="" set "ALERT_CIA_LOCAL_DATA_DIR=%ProgramData%\ALERT-CIA\local-server"

if not exist "%ALERT_CIA_LOCAL_DATA_DIR%" mkdir "%ALERT_CIA_LOCAL_DATA_DIR%"

node --no-warnings=ExperimentalWarning "%~dp0scripts\local-alert-cia-server.mjs" >> "%ALERT_CIA_LOCAL_DATA_DIR%\server.log" 2>&1
