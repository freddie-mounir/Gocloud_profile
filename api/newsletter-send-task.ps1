$ErrorActionPreference = 'SilentlyContinue'

# Runs the periodic newsletter campaign send. Safe to invoke daily: newsletter-automation.js
# only sends to subscribers whose frequency window has elapsed (see shouldSendForFrequency).
$apiDir = $PSScriptRoot
$projectDir = Split-Path -Parent $apiDir
$logDir = Join-Path $projectDir 'logs'
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$logFile = Join-Path $logDir 'newsletter_send.log'
$alertScript = Join-Path $apiDir 'send-admin-alert.js'
$automationScript = Join-Path $projectDir 'scripts\newsletter-automation.js'

function Write-SendLog {
  param([string]$Message)
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $logFile -Value ("[$ts] $Message")
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-SendLog 'FATAL: node executable not found in PATH.'
  exit 1
}

if (-not (Test-Path $automationScript)) {
  Write-SendLog "FATAL: newsletter-automation.js not found at $automationScript"
  exit 1
}

Write-SendLog 'Starting scheduled newsletter send...'
Push-Location $projectDir
$output = & $nodeCmd.Source $automationScript --send 2>&1
$exitCode = $LASTEXITCODE
Pop-Location

$outputText = ($output | Out-String).Trim()
Write-SendLog "Exit code: $exitCode"
if ($outputText) {
  Write-SendLog "Output: $outputText"
}

if ($exitCode -ne 0) {
  Write-SendLog 'FAILED: newsletter send exited with a non-zero code. Sending admin alert.'
  if (Test-Path $alertScript) {
    $subject = 'Newsletter campaign send failed'
    $message = "The scheduled newsletter send task failed on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss').`nExit code: $exitCode`nOutput:`n$outputText`n`nSuggested actions:`n- Check logs\newsletter_send.log on the VPS.`n- Verify SMTP credentials in api\.env.`n- Verify data\newsletter\calendar.json and data\posts content.`n- Re-run manually: node scripts\newsletter-automation.js --send"
    & $nodeCmd.Source $alertScript "--subject=$subject" "--message=$message" "--severity=CRITICAL" | Out-Null
  }
  exit 1
}

Write-SendLog 'PASS: newsletter send completed.'
exit 0
