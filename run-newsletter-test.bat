@echo off
setlocal
cd /d "%~dp0"
set TEST_SUBSCRIBER_EMAIL=walid.azhary@gocloudeg.com
echo Running newsletter test...
powershell -ExecutionPolicy Bypass -File "%~dp0run-newsletter-test.ps1"
if errorlevel 1 exit /b %errorlevel%
