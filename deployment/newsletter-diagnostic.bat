@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SITE_URL=https://www.gocloudeg.com"
set "ENV_PATH=C:\inetpub\wwwroot\GoCloud_website_project\api\.env"
set "LOCAL_API_URL=http://127.0.0.1:3001/api/health"
set "PUBLIC_HEALTH_URL=%SITE_URL%/api/health"
set "PUBLIC_NEWSLETTER_URL=%SITE_URL%/api/newsletter"

set "LOG_DIR=%~dp0logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

for /f %%i in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyyMMdd_HHmmss')"') do set "TS=%%i"
set "LOG_FILE=%LOG_DIR%\newsletter_diag_%TS%.log"

set /a PASS_COUNT=0
set /a FAIL_COUNT=0

call :log "===================================================="
call :log "GoCloud Newsletter Diagnostics Started"
call :log "Site: %SITE_URL%"
call :log "Log:  %LOG_FILE%"
call :log "===================================================="

call :log "[STEP 1] Checking local API health on port 3001..."
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; $r=Invoke-WebRequest -Uri '%LOCAL_API_URL%' -UseBasicParsing -TimeoutSec 15; if($r.StatusCode -ne 200){exit 2}; $j=$r.Content | ConvertFrom-Json; if($j.status -ne 'ok'){exit 3}"
if errorlevel 1 (call :fail "Local API health FAILED - URL: http://127.0.0.1:3001/api/health") else (call :pass "Local API health OK")

call :log "[STEP 2] Checking public API health through IIS proxy..."
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; $r=Invoke-WebRequest -Uri '%PUBLIC_HEALTH_URL%' -UseBasicParsing -TimeoutSec 20; if($r.StatusCode -ne 200){exit 2}; $j=$r.Content | ConvertFrom-Json; if($j.status -ne 'ok'){exit 3}; $ct=$r.Headers['Content-Type']; if($ct -notmatch 'application/json'){exit 4}"
if errorlevel 1 (call :fail "Public API health FAILED - URL: %PUBLIC_HEALTH_URL%") else (call :pass "Public API health OK and returns JSON")

call :log "[STEP 3] Posting test newsletter request and validating response format..."
powershell -NoProfile -Command "$ErrorActionPreference='Stop';$u='%PUBLIC_NEWSLETTER_URL%';$email='diag+' + [guid]::NewGuid().ToString('N').Substring(0,8) + '@example.com';$payload=@{email=$email;source='diag-script';pageUrl='%SITE_URL%';language='en';captchaToken='invalid-token'} | ConvertTo-Json -Compress;try{$resp=Invoke-WebRequest -Uri $u -Method Post -ContentType 'application/json' -Headers @{'X-Requested-With'='XMLHttpRequest'} -Body $payload -UseBasicParsing -TimeoutSec 25;$code=[int]$resp.StatusCode;$body=$resp.Content}catch{$code=[int]$_.Exception.Response.StatusCode;$sr=New-Object IO.StreamReader($_.Exception.Response.GetResponseStream());$body=$sr.ReadToEnd()};if($code -lt 200 -or $code -gt 499){exit 7};if($body -match '^\s*<!DOCTYPE|^\s*<html'){exit 5};$null=$body | ConvertFrom-Json"
if errorlevel 1 (
  call :fail "Newsletter POST format check FAILED - likely HTML/error-page replacing JSON"
) else (
  call :pass "Newsletter POST returns parseable JSON - good"
)
call :log "[STEP 4] Validating required keys in production API .env..."
if not exist "%ENV_PATH%" (
  call :fail "Env file not found: %ENV_PATH%"
) else (
  call :checkEnvKey "ODOO_URL"
  call :checkEnvKey "ODOO_DB"
  call :checkEnvKey "ODOO_USERNAME"
  call :checkEnvKey "ODOO_PASSWORD"
  call :checkEnvKeyNonEmpty "TURNSTILE_SITE_KEY"
  call :checkEnvKeyNonEmpty "TURNSTILE_SECRET_KEY"
  call :checkEnvKey "TURNSTILE_ACTION"
  call :checkEnvKey "SMTP_HOST"
  call :checkEnvKey "SMTP_USER"
  call :checkEnvKey "SMTP_FROM"
  call :checkEnvKey "SMTP_PASS"
  call :checkEnvKey "NEWSLETTER_CONFIRMATION_URL"
)

call :log "[STEP 5] Checking Turnstile site key meta in homepage HTML..."
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; $r=Invoke-WebRequest -Uri '%SITE_URL%/' -UseBasicParsing -TimeoutSec 20; $html=$r.Content; if($html -notmatch 'gocloud-turnstile-site-key' -and $html -notmatch 'GOCLOUD_TURNSTILE_SITE_KEY'){exit 2}"
if errorlevel 1 (call :fail "Turnstile site key marker not found in homepage HTML - meta or window var") else (call :pass "Turnstile site key marker found")

call :log "===================================================="
call :log "Diagnostics finished. PASS=!PASS_COUNT! FAIL=!FAIL_COUNT!"
call :log "Log file: %LOG_FILE%"
call :log "===================================================="

echo.
echo Diagnostics complete.
echo PASS=!PASS_COUNT! FAIL=!FAIL_COUNT!
echo Log file: %LOG_FILE%
echo.

set "EXIT_CODE=0"
if !FAIL_COUNT! GTR 0 set "EXIT_CODE=1"

if not defined DIAG_NO_PAUSE (
  echo Press any key to close...
  pause >nul
)

exit /b !EXIT_CODE!

:checkEnvKey
set "K=%~1"
findstr /B /C:"%K%=" "%ENV_PATH%" >nul
if errorlevel 1 (call :fail "Missing env key: %K%") else (call :pass "Found env key: %K%")
exit /b 0

:checkEnvKeyNonEmpty
set "K=%~1"
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; $p='%ENV_PATH%'; $k='%K%'; $m=Select-String -Path $p -Pattern ('^' + [Regex]::Escape($k) + '=(.*)$') -AllMatches | Select-Object -First 1; if(-not $m){exit 2}; $v=$m.Matches[0].Groups[1].Value.Trim(); if([string]::IsNullOrWhiteSpace($v)){exit 3}"
if errorlevel 1 (call :fail "Missing or empty env key: %K%") else (call :pass "Found non-empty env key: %K%")
exit /b 0

:pass
set /a PASS_COUNT+=1
call :log "[PASS] %~1"
exit /b 0

:fail
set /a FAIL_COUNT+=1
call :log "[FAIL] %~1"
exit /b 0

:log
echo [%date% %time%] %~1>>"%LOG_FILE%"
if "%~1"=="" (
  echo.
) else (
  echo(%~1
)
exit /b 0
