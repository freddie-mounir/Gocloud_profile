@echo off
REM ============================================================
REM  GoCloud VPS Setup Script
REM  Run this ON THE VPS (Windows Server 2022) as Administrator
REM  Installs all prerequisites for website hosting & SSH deploy
REM ============================================================

title GoCloud VPS Setup
color 0B

echo.
echo  =========================================
echo   GoCloud VPS Setup - Prerequisites
echo  =========================================
echo.

REM --- Check if running as Administrator ---
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] This script must be run as Administrator!
    echo  Right-click the file and select "Run as administrator"
    echo.
    pause
    exit /b 1
)
echo  [OK] Running as Administrator
echo.

REM ============================================================
REM  1. Install IIS Features
REM ============================================================
echo  [1/8] Installing IIS features...
echo  ------------------------------------------------

echo    - Static Content Compression...
powershell -Command "Install-WindowsFeature Web-Static-Compression -IncludeManagementTools" >nul 2>&1
echo    - Dynamic Content Compression...
powershell -Command "Install-WindowsFeature Web-Dyn-Compression -IncludeManagementTools" >nul 2>&1
echo    - URL Rewrite prerequisites (Web-Filtering)...
powershell -Command "Install-WindowsFeature Web-Filtering -IncludeManagementTools" >nul 2>&1
echo    - HTTP Logging...
powershell -Command "Install-WindowsFeature Web-Http-Logging" >nul 2>&1

echo  [OK] IIS features installed
echo.

REM ============================================================
REM  2. Install OpenSSH Server
REM ============================================================
echo  [2/8] Installing OpenSSH Server...
echo  ------------------------------------------------

powershell -Command "Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*' | Select-Object -ExpandProperty State" > %TEMP%\ssh_state.txt 2>&1
findstr /i "Installed" %TEMP%\ssh_state.txt >nul 2>&1
if %errorlevel% equ 0 (
    echo    OpenSSH Server already installed - skipping
) else (
    echo    Installing OpenSSH Server...
    powershell -Command "Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0"
    if %errorlevel% neq 0 (
        echo  [WARN] OpenSSH install via capability failed, trying DISM...
        dism /Online /Add-Capability /CapabilityName:OpenSSH.Server~~~~0.0.1.0
    )
)
del %TEMP%\ssh_state.txt >nul 2>&1

echo  [OK] OpenSSH Server installed
echo.

REM ============================================================
REM  3. Configure & Start SSH Service
REM ============================================================
echo  [3/8] Configuring OpenSSH service...
echo  ------------------------------------------------

echo    - Setting sshd to auto-start...
powershell -Command "Set-Service -Name sshd -StartupType Automatic" >nul 2>&1
echo    - Starting sshd service...
powershell -Command "Start-Service sshd" >nul 2>&1
echo    - Setting ssh-agent to auto-start...
powershell -Command "Set-Service -Name ssh-agent -StartupType Automatic" >nul 2>&1
powershell -Command "Start-Service ssh-agent" >nul 2>&1

REM Set PowerShell as default SSH shell
echo    - Setting PowerShell as default SSH shell...
powershell -Command "New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -PropertyType String -Force" >nul 2>&1

echo  [OK] SSH service configured and started
echo.

REM ============================================================
REM  4. Configure Firewall for SSH
REM ============================================================
echo  [4/8] Configuring firewall rules...
echo  ------------------------------------------------

echo    - Adding SSH (port 22) firewall rule...
powershell -Command "if (-not (Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd) Port 22' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -Profile Any; Write-Host '    Rule created' } else { Write-Host '    Rule already exists - skipping' }"

echo  [OK] Firewall configured
echo.

REM ============================================================
REM  5. Prepare SSH Key Authentication Directory
REM ============================================================
echo  [5/8] Preparing SSH key authentication...
echo  ------------------------------------------------

set SSH_DIR=C:\ProgramData\ssh
set AUTH_FILE=%SSH_DIR%\administrators_authorized_keys

if not exist "%AUTH_FILE%" (
    echo    - Creating administrators_authorized_keys...
    type nul > "%AUTH_FILE%"
)

REM Fix permissions on the authorized_keys file (must only be readable by SYSTEM and Administrators)
echo    - Setting file permissions on authorized_keys...
powershell -Command "$acl = Get-Acl '%AUTH_FILE%'; $acl.SetAccessRuleProtection($true, $false); $adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule('BUILTIN\Administrators','FullControl','Allow'); $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule('SYSTEM','FullControl','Allow'); $acl.AddAccessRule($adminRule); $acl.AddAccessRule($systemRule); Set-Acl '%AUTH_FILE%' $acl"

REM Make sure sshd_config allows key auth and disables password eventually
echo    - Verifying sshd_config settings...
powershell -Command "$cfgPath = '%SSH_DIR%\sshd_config'; $cfg = Get-Content $cfgPath -Raw; $changed = $false; $rules = @(@('PubkeyAuthentication','yes'),@('PasswordAuthentication','no'),@('PermitEmptyPasswords','no'),@('ChallengeResponseAuthentication','no'),@('MaxAuthTries','3')); foreach ($r in $rules) { $k = $r[0]; $v = $r[1]; $pattern = '(?im)^\s*#?\s*' + [regex]::Escape($k) + '\s+.*$'; if ($cfg -match $pattern) { $newLine = $k + ' ' + $v; $cfg = [regex]::Replace($cfg, $pattern, $newLine, 1); $changed = $true } else { $cfg += "`r`n" + $k + ' ' + $v; $changed = $true } }; $adminsMatch = [regex]::IsMatch($cfg, '(?im)^\s*Match\s+Group\s+administrators\s*$', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase); if (-not $adminsMatch) { $cfg += "`r`n`r`nMatch Group administrators`r`nAuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys"; $changed = $true }; if ($changed) { Set-Content $cfgPath $cfg -Encoding ascii; Restart-Service sshd; Write-Host '    sshd_config hardened and service restarted' } else { Write-Host '    sshd_config already hardened' }"

echo  [OK] SSH key auth directory ready
echo.

REM ============================================================
REM  6. Create Website Directory & Verify
REM ============================================================
echo  [6/8] Verifying website directory...
echo  ------------------------------------------------

set WEB_ROOT=C:\inetpub\wwwroot\GoCloud_website_project
if not exist "%WEB_ROOT%" (
    echo    - Creating website directory: %WEB_ROOT%
    mkdir "%WEB_ROOT%"
) else (
    echo    - Website directory already exists
)

REM Create backup directory
if not exist "C:\inetpub\backups" (
    echo    - Creating backup directory: C:\inetpub\backups
    mkdir "C:\inetpub\backups"
) else (
    echo    - Backup directory already exists
)

echo  [OK] Directories ready
echo.

REM ============================================================
REM  7. Configure API Environment (.env) for Newsletter Workflow
REM ============================================================
echo  [7/8] Configuring API environment for newsletter workflow...
echo  ------------------------------------------------

set API_DIR=%WEB_ROOT%\api
set API_ENV=%API_DIR%\.env
set API_ENV_EXAMPLE=%API_DIR%\.env.example

if "%ODOO_URL%"=="" set "ODOO_URL=https://erp.gocloudeg.com/"
if "%ODOO_DB%"=="" set "ODOO_DB=GoCloud"
if "%ODOO_USERNAME%"=="" set "ODOO_USERNAME=marketing@gocloudeg.com"
if "%ODOO_CRM_MODEL%"=="" set "ODOO_CRM_MODEL=crm.lead"
if "%ODOO_MAILING_LIST_ID%"=="" set "ODOO_MAILING_LIST_ID=0"

if "%SMTP_PORT%"=="" set "SMTP_PORT=587"
if "%SMTP_SECURE%"=="" set "SMTP_SECURE=false"
if "%SMTP_USER%"=="" set "SMTP_USER=marketing@gocloudeg.com"
if "%SMTP_FROM%"=="" set "SMTP_FROM=marketing@gocloudeg.com"

if "%TURNSTILE_ACTION%"=="" set "TURNSTILE_ACTION=newsletter_subscribe"
if "%NEWSLETTER_CONFIRMATION_URL%"=="" set "NEWSLETTER_CONFIRMATION_URL=https://www.gocloudeg.com/api/newsletter/confirm"
if "%NEWSLETTER_SOURCE_LABEL%"=="" set "NEWSLETTER_SOURCE_LABEL=Website Newsletter (Subscribe for Practical Updates)"
if "%NEWSLETTER_TOKEN_TTL_HOURS%"=="" set "NEWSLETTER_TOKEN_TTL_HOURS=48"

if "%TURNSTILE_SITE_KEY%"=="" (
    echo    - TURNSTILE_SITE_KEY is not set in environment.
    set /p TURNSTILE_SITE_KEY=    Enter TURNSTILE_SITE_KEY for API .env:
)

if "%ODOO_PASSWORD%"=="" (
    echo    - ODOO_PASSWORD is not set in environment.
    set /p ODOO_PASSWORD=    Enter ODOO_PASSWORD for API .env:
)

if "%GEMINI_API_KEY%"=="" (
    echo    - GEMINI_API_KEY is not set in environment.
    set /p GEMINI_API_KEY=    Enter GEMINI_API_KEY for API .env:
)

if "%TURNSTILE_SECRET_KEY%"=="" (
    echo    - TURNSTILE_SECRET_KEY is not set in environment.
    set /p TURNSTILE_SECRET_KEY=    Enter TURNSTILE_SECRET_KEY for API .env:
)

if "%SMTP_HOST%"=="" (
    echo    - SMTP_HOST is not set in environment.
    set /p SMTP_HOST=    Enter SMTP_HOST for API .env:
)

if "%SMTP_PASS%"=="" (
    echo    - SMTP_PASS is not set in environment.
    set /p SMTP_PASS=    Enter SMTP_PASS for API .env:
)

if not exist "%API_DIR%" (
    echo    - API directory not found at %API_DIR%
    echo    - Deploy website files first, then re-run this script to configure API .env
) else (
    if not exist "%API_ENV%" (
        if exist "%API_ENV_EXAMPLE%" (
            echo    - Creating API .env from .env.example
            copy /Y "%API_ENV_EXAMPLE%" "%API_ENV%" >nul
        ) else (
            echo    - Creating new API .env file
            type nul > "%API_ENV%"
        )
    ) else (
        echo    - API .env already exists, updating newsletter workflow values
    )

    powershell -Command "$envPath = '%API_ENV%'; function Set-Or-Add([string]$k,[string]$v){ $lines = @(); if (Test-Path $envPath) { $lines = Get-Content $envPath }; $escaped = [regex]::Escape($k); $idx = -1; for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match ('^\s*' + $escaped + '=')) { $idx = $i; break } }; if ($idx -ge 0) { $lines[$idx] = ($k + '=' + $v) } else { $lines += ($k + '=' + $v) }; Set-Content -Path $envPath -Value $lines -Encoding ascii }; Set-Or-Add 'GEMINI_API_KEY' '%GEMINI_API_KEY%'; Set-Or-Add 'ODOO_URL' '%ODOO_URL%'; Set-Or-Add 'ODOO_DB' '%ODOO_DB%'; Set-Or-Add 'ODOO_USERNAME' '%ODOO_USERNAME%'; Set-Or-Add 'ODOO_PASSWORD' '%ODOO_PASSWORD%'; Set-Or-Add 'ODOO_CRM_MODEL' '%ODOO_CRM_MODEL%'; Set-Or-Add 'ODOO_MAILING_LIST_ID' '%ODOO_MAILING_LIST_ID%'; Set-Or-Add 'TURNSTILE_SITE_KEY' '%TURNSTILE_SITE_KEY%'; Set-Or-Add 'TURNSTILE_SECRET_KEY' '%TURNSTILE_SECRET_KEY%'; Set-Or-Add 'TURNSTILE_ACTION' '%TURNSTILE_ACTION%'; Set-Or-Add 'NEWSLETTER_CONFIRMATION_URL' '%NEWSLETTER_CONFIRMATION_URL%'; Set-Or-Add 'NEWSLETTER_SOURCE_LABEL' '%NEWSLETTER_SOURCE_LABEL%'; Set-Or-Add 'NEWSLETTER_TOKEN_TTL_HOURS' '%NEWSLETTER_TOKEN_TTL_HOURS%'; Set-Or-Add 'SMTP_HOST' '%SMTP_HOST%'; Set-Or-Add 'SMTP_PORT' '%SMTP_PORT%'; Set-Or-Add 'SMTP_SECURE' '%SMTP_SECURE%'; Set-Or-Add 'SMTP_USER' '%SMTP_USER%'; Set-Or-Add 'SMTP_PASS' '%SMTP_PASS%'; Set-Or-Add 'SMTP_FROM' '%SMTP_FROM%'"

    echo    - Newsletter API environment configured:
    echo      GEMINI_API_KEY=[set]
    echo      ODOO_URL=%ODOO_URL%
    echo      ODOO_DB=%ODOO_DB%
    echo      ODOO_USERNAME=%ODOO_USERNAME%
    echo      TURNSTILE_SITE_KEY=%TURNSTILE_SITE_KEY%
    echo      TURNSTILE_ACTION=%TURNSTILE_ACTION%
    echo      NEWSLETTER_CONFIRMATION_URL=%NEWSLETTER_CONFIRMATION_URL%
    echo      SMTP_HOST=%SMTP_HOST%
    echo      SMTP_USER=%SMTP_USER%
)

echo  [OK] API environment configuration completed
echo.

REM ============================================================
REM  8. Configure API Supervisor and Health Monitor Tasks
REM ============================================================
echo  [8/8] Configuring API supervisor and health monitor tasks...
echo  ------------------------------------------------

set SUPERVISOR_SCRIPT=%API_DIR%\run-api-supervisor.ps1
set MONITOR_SCRIPT=%API_DIR%\monitor-api-health.ps1
set SUPERVISOR_TASK=GoCloudApiSupervisor
set MONITOR_TASK=GoCloudApiHealthMonitor

if not exist "%API_DIR%\package.json" (
    echo    - API package.json not found at %API_DIR%
    echo    - Deploy website files first, then run restart-and-verify-newsletter.bat to provision tasks.
) else (
    if exist "%SUPERVISOR_SCRIPT%" (
        echo    - Creating/updating supervisor task: %SUPERVISOR_TASK%
        schtasks /Create /F /TN "%SUPERVISOR_TASK%" /SC ONSTART /RU SYSTEM /RL HIGHEST /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%SUPERVISOR_SCRIPT%\"" >nul 2>&1
        if %errorlevel% neq 0 (
            echo    - [WARN] Failed to create supervisor task
        ) else (
            echo    - [OK] Supervisor task ready
        )
    ) else (
        echo    - Supervisor script missing: %SUPERVISOR_SCRIPT%
    )

    if exist "%MONITOR_SCRIPT%" (
        echo    - Creating/updating monitor task: %MONITOR_TASK%
        schtasks /Create /F /TN "%MONITOR_TASK%" /SC MINUTE /MO 5 /RU SYSTEM /RL HIGHEST /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%MONITOR_SCRIPT%\"" >nul 2>&1
        if %errorlevel% neq 0 (
            echo    - [WARN] Failed to create monitor task
        ) else (
            echo    - [OK] Monitor task ready
        )
    ) else (
        echo    - Monitor script missing: %MONITOR_SCRIPT%
    )
)

echo  [OK] API task configuration completed
echo.

REM ============================================================
REM  Summary & Next Steps
REM ============================================================
echo  =========================================
echo   Setup Complete!
echo  =========================================
echo.
echo  Installed / Configured:
echo    [x] IIS Static Compression
echo    [x] IIS Dynamic Compression
echo    [x] OpenSSH Server (port 22)
echo    [x] Firewall rule for SSH
echo    [x] SSH key auth directory
echo    [x] PowerShell as default SSH shell
echo    [x] Website + backup directories
echo    [x] API .env newsletter workflow configuration
echo    [x] API supervisor + health monitor task setup (when API files exist)
echo.
echo  ------------------------------------------------
echo   NEXT STEP (from your Dev PC):
echo  ------------------------------------------------
echo.
echo   1. Generate an SSH key (if you haven't already):
echo      ssh-keygen -t ed25519
echo.
echo   2. Copy your public key to this VPS:
echo      type %USERPROFILE%\.ssh\id_ed25519.pub ^| ssh Administrator@%COMPUTERNAME% "Add-Content C:\ProgramData\ssh\administrators_authorized_keys"
echo.
echo   3. Test SSH connection from Dev PC:
echo      ssh Administrator@109.123.233.48 "hostname"
echo.
echo   4. Run the publish batch file from Dev PC:
echo      publish-website.bat
echo.

REM Verify SSH is listening
echo  Verifying SSH service status...
powershell -Command "$svc = Get-Service sshd -ErrorAction SilentlyContinue; if ($svc.Status -eq 'Running') { Write-Host '  [OK] SSH service is running on port 22' -ForegroundColor Green } else { Write-Host '  [WARN] SSH service is NOT running!' -ForegroundColor Yellow }"
echo.

pause
