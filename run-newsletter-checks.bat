@echo off
setlocal EnableExtensions

REM Always run from this script folder
cd /d "%~dp0"

REM Keep child scripts from pausing
set "RESTART_NO_PAUSE=1"
set "DIAG_NO_PAUSE=1"

REM Open persistent terminal and run restart+verify
cmd /k "cd /d %~dp0 && restart-and-verify-newsletter.bat"