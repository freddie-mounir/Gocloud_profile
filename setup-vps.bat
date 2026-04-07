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
echo  [1/6] Installing IIS features...
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
echo  [2/6] Installing OpenSSH Server...
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
echo  [3/6] Configuring OpenSSH service...
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
echo  [4/6] Configuring firewall rules...
echo  ------------------------------------------------

echo    - Adding SSH (port 22) firewall rule...
powershell -Command "if (-not (Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd) Port 22' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -Profile Any; Write-Host '    Rule created' } else { Write-Host '    Rule already exists - skipping' }"

echo  [OK] Firewall configured
echo.

REM ============================================================
REM  5. Prepare SSH Key Authentication Directory
REM ============================================================
echo  [5/6] Preparing SSH key authentication...
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
powershell -Command "$cfg = Get-Content '%SSH_DIR%\sshd_config' -Raw; $changed = $false; if ($cfg -match '#PubkeyAuthentication yes') { $cfg = $cfg -replace '#PubkeyAuthentication yes','PubkeyAuthentication yes'; $changed = $true }; if ($cfg -match '#AuthorizedKeysFile') { $cfg = $cfg -replace '#AuthorizedKeysFile.*','AuthorizedKeysFile .ssh/authorized_keys'; $changed = $true }; if ($changed) { Set-Content '%SSH_DIR%\sshd_config' $cfg; Restart-Service sshd; Write-Host '    sshd_config updated and service restarted' } else { Write-Host '    sshd_config already configured' }"

echo  [OK] SSH key auth directory ready
echo.

REM ============================================================
REM  6. Create Website Directory & Verify
REM ============================================================
echo  [6/6] Verifying website directory...
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
