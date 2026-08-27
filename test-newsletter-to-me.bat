@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "TEST_EMAIL=walid.azhary@gocloudeg.com"
set "ENTRY_ID=%~1"
if "%ENTRY_ID%"=="" set "ENTRY_ID=m1-1"
set "VPS_HOST=Administrator@109.123.233.48"
set "REMOTE_ROOT=C:\inetpub\wwwroot\GoCloud_website_project"

echo ============================================================
echo  GoCloud Newsletter Test Send
echo  Recipient:      %TEST_EMAIL%
echo  Campaign entry: %ENTRY_ID%
echo ============================================================
echo.
echo This runs the send ON the production VPS (not locally), so
echo the "Manage preferences" / "Unsubscribe" links are signed with
echo the SAME secret the live https://www.gocloudeg.com API verifies
echo against. Running this locally would sign links with your local
echo dev .env secret and they would fail as "Invalid"/"expired".
echo The send is tagged as a test in dispatch-log.json so it will
echo NOT block or count as delivery to real subscribers.
echo.
echo Tip: pass a different entry id as the first argument, e.g.
echo   test-newsletter-to-me.bat m1-2
echo.

ssh %VPS_HOST% "node %REMOTE_ROOT%\scripts\newsletter-automation.js --send --test-email=%TEST_EMAIL% --entry=%ENTRY_ID%"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo SUCCESS: check the %TEST_EMAIL% inbox now and verify:
  echo   1. "Read the full article" opens the correct blog post.
  echo   2. "Book a consultation" opens WhatsApp with a pre-filled message.
  echo   3. "Manage preferences" opens the preferences page ^(no "Invalid" error^).
  echo   4. "Unsubscribe" opens the unsubscribe confirmation page.
) else (
  echo FAILED with exit code %EXIT_CODE%. Check the output above for details.
  echo Make sure your SSH key is set up for Administrator@109.123.233.48.
)
echo.
pause
exit /b %EXIT_CODE%

