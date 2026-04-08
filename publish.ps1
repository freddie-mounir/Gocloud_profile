# GoCloud Website - SSH Publish Script
# Builds, packages, and deploys to VPS via SSH/SCP
#
# Usage:
#   .\publish.ps1                    # Full build + deploy (no images)
#   .\publish.ps1 -WithImages        # Full build + deploy including images
#   .\publish.ps1 -SkipBuild         # Deploy without rebuilding
#   .\publish.ps1 -DryRun            # Build + show what would be deployed
#   .\publish.ps1 -User admin        # Use a different SSH username

param(
    [string]$VpsHost = "109.123.233.48",
    [string]$User = "Administrator",
    [string]$RemotePath = "C:\inetpub\wwwroot\GoCloud_website_project",
    [int]$SshPort = 22,
    [switch]$SkipBuild = $false,
    [switch]$DryRun = $false,
    [switch]$WithImages = $false
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$DeploymentFolder = Join-Path $ProjectRoot "deployment"

Write-Host ""
Write-Host "  GoCloud - Publish to VPS" -ForegroundColor Cyan
Write-Host "  ========================" -ForegroundColor Cyan
Write-Host "  Target: $User@$VpsHost" -ForegroundColor Gray
Write-Host "  Remote: $RemotePath" -ForegroundColor Gray
if ($WithImages) {
    Write-Host "  Images: Included" -ForegroundColor Yellow
} else {
    Write-Host "  Images: Skipped (use -WithImages to include)" -ForegroundColor DarkGray
}
Write-Host ""

# ── Step 1: Check SSH availability ──
Write-Host "[1/5] Checking SSH connectivity..." -ForegroundColor Yellow
$sshCmd = Get-Command ssh -ErrorAction SilentlyContinue
if (-not $sshCmd) {
    Write-Host "  ERROR: ssh.exe not found. Install OpenSSH client." -ForegroundColor Red
    Write-Host "  Settings > Apps > Optional Features > OpenSSH Client" -ForegroundColor Gray
    exit 1
}

$scpCmd = Get-Command scp -ErrorAction SilentlyContinue
if (-not $scpCmd) {
    Write-Host "  ERROR: scp.exe not found. Install OpenSSH client." -ForegroundColor Red
    exit 1
}

# Quick connectivity test
$testResult = ssh -o ConnectTimeout=5 -o BatchMode=yes -p $SshPort "$User@$VpsHost" "echo OK" 2>&1
if ($testResult -ne "OK") {
    Write-Host "  ERROR: Cannot connect to $User@$VpsHost" -ForegroundColor Red
    Write-Host "  Ensure SSH key is set up. Run:" -ForegroundColor Gray
    Write-Host "    ssh-keygen -t ed25519" -ForegroundColor White
    Write-Host "    ssh-copy-id $User@$VpsHost" -ForegroundColor White
    Write-Host ""
    Write-Host "  Or for Windows VPS, copy your public key to:" -ForegroundColor Gray
    Write-Host "    C:\ProgramData\ssh\administrators_authorized_keys" -ForegroundColor White
    Write-Host "    (or C:\Users\$User\.ssh\authorized_keys)" -ForegroundColor White
    exit 1
}
Write-Host "  OK - Connected to VPS" -ForegroundColor Green

# ── Step 2: Build ──
if (-not $SkipBuild) {
    Write-Host "[2/5] Building project..." -ForegroundColor Yellow
    Push-Location $ProjectRoot
    try {
        npm run build 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Build failed!" -ForegroundColor Red
            exit 1
        }
        Write-Host "  OK - Build succeeded" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[2/5] Skipping build (--SkipBuild)" -ForegroundColor DarkGray
}

# ── Step 3: Stage deployment folder ──
Write-Host "[3/5] Staging deployment package..." -ForegroundColor Yellow
Push-Location $ProjectRoot
try {
    $deployArgs = @('-ExecutionPolicy', 'Bypass', '-File', "$ProjectRoot\deploy-iis.ps1", '-BuildOnly')
    if ($WithImages) { $deployArgs += '-WithImages' }
    powershell @deployArgs 2>&1 | Out-Null
    if (-not (Test-Path $DeploymentFolder)) {
        Write-Host "  ERROR: Deployment folder not created!" -ForegroundColor Red
        exit 1
    }

    # Copy extra files that deploy-iis.ps1 might miss
    if (Test-Path "google8ec4a2e3b3ab7585.html") {
        Copy-Item "google8ec4a2e3b3ab7585.html" "$DeploymentFolder\" -Force
    }
    if ($WithImages -and (Test-Path "images\icons")) {
        New-Item -ItemType Directory -Path "$DeploymentFolder\images\icons" -Force | Out-Null
        Copy-Item "images\icons\*" "$DeploymentFolder\images\icons\" -Force
    }

    $fileCount = (Get-ChildItem $DeploymentFolder -Recurse -File).Count
    $sizeInMB = [math]::Round((Get-ChildItem $DeploymentFolder -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)
    Write-Host "  OK - $fileCount files ($sizeInMB MB)" -ForegroundColor Green
} finally {
    Pop-Location
}

# ── Step 4: Dry run check ──
if ($DryRun) {
    Write-Host "[4/5] DRY RUN - Would deploy these files:" -ForegroundColor Yellow
    Get-ChildItem $DeploymentFolder -Recurse -File |
        ForEach-Object { Write-Host "  $($_.FullName.Replace($DeploymentFolder, ''))" -ForegroundColor Gray }
    Write-Host ""
    Write-Host "  No files were uploaded." -ForegroundColor Yellow
    exit 0
}

# ── Step 5: Upload via SCP ──
Write-Host "[4/5] Backing up current site on VPS..." -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupCmd = "if (Test-Path '$RemotePath') { Copy-Item '$RemotePath' 'C:\inetpub\backups\gocloud-$timestamp' -Recurse -Force }"
ssh -p $SshPort "$User@$VpsHost" "powershell -Command `"New-Item -ItemType Directory -Path 'C:\inetpub\backups' -Force | Out-Null; $backupCmd`"" 2>&1 | Out-Null
Write-Host "  OK - Backup created: gocloud-$timestamp" -ForegroundColor Green

Write-Host "[5/5] Uploading to VPS..." -ForegroundColor Yellow
$startTime = Get-Date

# Use scp to upload the deployment folder
scp -r -P $SshPort "$DeploymentFolder\*" "${User}@${VpsHost}:`"$RemotePath`""

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Upload failed!" -ForegroundColor Red
    exit 1
}

$elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
Write-Host "  OK - Upload completed in ${elapsed}s" -ForegroundColor Green

# ── Step 6: Install API dependencies on VPS ──
Write-Host "[6/6] Installing API dependencies on VPS..." -ForegroundColor Yellow
$apiInstall = ssh -p $SshPort "$User@$VpsHost" "cd C:\inetpub\wwwroot\GoCloud_website_project\api; npm install --omit=dev 2>&1" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARN - API dependency install failed. May need manual setup." -ForegroundColor Yellow
} else {
    Write-Host "  OK - API dependencies installed" -ForegroundColor Green
}

# ── Done ──
Write-Host ""
Write-Host "  Publish complete!" -ForegroundColor Green
Write-Host "  =================" -ForegroundColor Green
Write-Host "  Site: https://www.gocloudeg.com" -ForegroundColor White
Write-Host "  Files: $fileCount | Size: $sizeInMB MB | Time: ${elapsed}s" -ForegroundColor Gray
Write-Host ""
