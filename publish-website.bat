@echo off
REM ============================================================
REM  GoCloud Website - Build & Publish to VPS
REM  Run this from your DEV PC to deploy the website
REM  Usage:
REM    publish-website.bat              Deploy without images (fast)
REM    publish-website.bat /WITHIMAGES  Deploy including images (full)
REM ============================================================

title GoCloud - Publish Website
color 0A

set VPS_HOST=109.123.233.48
set VPS_USER=Administrator
set VPS_REMOTE_PATH=C:\inetpub\wwwroot\GoCloud_website_project
set SSH_PORT=22
set PROJECT_DIR=%~dp0
set DEPLOYMENT_DIR=%PROJECT_DIR%deployment
set WITH_IMAGES=0

REM Parse arguments
:parse_args
if "%~1"=="" goto done_args
if /i "%~1"=="/WITHIMAGES" set WITH_IMAGES=1
shift
goto parse_args
:done_args

echo.
echo  =========================================
echo   GoCloud - Build ^& Publish to VPS
echo  =========================================
echo  Target: %VPS_USER%@%VPS_HOST%
echo  Remote: %VPS_REMOTE_PATH%
if "%WITH_IMAGES%"=="1" (
echo  Images: Included
) else (
echo  Images: Skipped ^(use /WITHIMAGES to include^)
)
echo  =========================================
echo.

REM --- Check prerequisites ---
echo  [1/6] Checking prerequisites...

where ssh >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] ssh.exe not found!
    echo  Install OpenSSH Client: Settings ^> Apps ^> Optional Features ^> OpenSSH Client
    pause
    exit /b 1
)

where scp >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] scp.exe not found!
    pause
    exit /b 1
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found! Install from https://nodejs.org
    pause
    exit /b 1
)

echo  [OK] ssh, scp, node found
echo.

REM --- Test SSH connectivity ---
echo  [2/6] Testing SSH connection to %VPS_HOST%...

ssh -o ConnectTimeout=10 -o BatchMode=yes -p %SSH_PORT% %VPS_USER%@%VPS_HOST% "echo OK" >%TEMP%\ssh_test.txt 2>&1
findstr /i "OK" %TEMP%\ssh_test.txt >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Cannot connect to %VPS_USER%@%VPS_HOST% via SSH
    echo.
    echo  Possible causes:
    echo    - VPS setup not done yet: run setup-vps.bat on the VPS first
    echo    - SSH key not copied: run these commands:
    echo        ssh-keygen -t ed25519
    echo        type %%USERPROFILE%%\.ssh\id_ed25519.pub ^| ssh %VPS_USER%@%VPS_HOST% "Add-Content C:\ProgramData\ssh\administrators_authorized_keys"
    echo    - Firewall blocking port 22
    echo.
    del %TEMP%\ssh_test.txt >nul 2>&1
    pause
    exit /b 1
)
del %TEMP%\ssh_test.txt >nul 2>&1
echo  [OK] SSH connection successful
echo.

REM --- Build project ---
echo  [3/6] Building project...
echo  ------------------------------------------------

pushd "%PROJECT_DIR%"

call npm run build
if %errorlevel% neq 0 (
    echo  [ERROR] Build failed!
    popd
    pause
    exit /b 1
)

echo  [OK] Build succeeded
echo.

REM --- Stage deployment package ---
echo  [4/6] Staging deployment package...
echo  ------------------------------------------------

if "%WITH_IMAGES%"=="1" (
    powershell -ExecutionPolicy Bypass -File "%PROJECT_DIR%deploy-iis.ps1" -BuildOnly -WithImages
) else (
    powershell -ExecutionPolicy Bypass -File "%PROJECT_DIR%deploy-iis.ps1" -BuildOnly
)
if %errorlevel% neq 0 (
    echo  [ERROR] Deployment staging failed!
    popd
    pause
    exit /b 1
)

if not exist "%DEPLOYMENT_DIR%" (
    echo  [ERROR] Deployment folder not created!
    popd
    pause
    exit /b 1
)

REM Copy extra files that deploy-iis.ps1 might miss
if exist "google8ec4a2e3b3ab7585.html" (
    copy /y "google8ec4a2e3b3ab7585.html" "%DEPLOYMENT_DIR%\" >nul 2>&1
)
if "%WITH_IMAGES%"=="1" (
    if exist "images\icons" (
        if not exist "%DEPLOYMENT_DIR%\images\icons" mkdir "%DEPLOYMENT_DIR%\images\icons"
        xcopy /y /q "images\icons\*" "%DEPLOYMENT_DIR%\images\icons\" >nul 2>&1
    )
)

popd

REM Count files and size
for /f %%A in ('powershell -Command "(Get-ChildItem '%DEPLOYMENT_DIR%' -Recurse -File).Count"') do set FILE_COUNT=%%A
for /f %%A in ('powershell -Command "[math]::Round((Get-ChildItem '%DEPLOYMENT_DIR%' -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)"') do set SIZE_MB=%%A

echo  [OK] Deployment package ready: %FILE_COUNT% files (%SIZE_MB% MB)
echo.

REM --- Backup current site on VPS ---
echo  [5/6] Backing up current site on VPS...

for /f %%A in ('powershell -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set TIMESTAMP=%%A

ssh -p %SSH_PORT% %VPS_USER%@%VPS_HOST% "New-Item -ItemType Directory -Path C:\inetpub\backups -Force | Out-Null; if (Test-Path C:\inetpub\wwwroot\GoCloud_website_project) { Copy-Item C:\inetpub\wwwroot\GoCloud_website_project C:\inetpub\backups\gocloud-%TIMESTAMP% -Recurse -Force; Write-Host 'Backup created: gocloud-%TIMESTAMP%' } else { Write-Host 'No existing site to backup' }"

echo  [OK] Backup done
echo.

REM --- Upload to VPS ---
echo  [6/6] Uploading to VPS...
echo  This may take a few minutes depending on connection speed...
echo  ------------------------------------------------

set START_TIME=%TIME%
scp -r -P %SSH_PORT% deployment/* %VPS_USER%@%VPS_HOST%:C:/inetpub/wwwroot/GoCloud_website_project/

if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Upload failed!
    echo  Check your SSH connection and try again.
    pause
    exit /b 1
)

echo  [OK] Upload completed
echo.

REM --- Install API dependencies on VPS ---
echo  [7/7] Installing API dependencies on VPS...
ssh -p %SSH_PORT% %VPS_USER%@%VPS_HOST% "cd C:\inetpub\wwwroot\GoCloud_website_project\api && npm install --omit=dev 2>&1"

if %errorlevel% neq 0 (
    echo  [WARN] API dependency install failed - may need manual setup
) else (
    echo  [OK] API dependencies installed
)

echo.
echo  =========================================
echo   Publish Complete!
echo  =========================================
echo.
echo  Files uploaded: %FILE_COUNT%
echo  Package size:   %SIZE_MB% MB
echo  Backup:         gocloud-%TIMESTAMP%
echo  Site URL:       https://www.gocloudeg.com
echo.
echo  Post-publish verification:
echo    - Open https://www.gocloudeg.com in a browser
echo    - Check https://www.gocloudeg.com/robots.txt
echo    - Verify SSL at https://www.ssllabs.com/ssltest/analyze.html?d=gocloudeg.com
echo.

pause
