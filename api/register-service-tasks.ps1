$ErrorActionPreference = 'Stop'

# Idempotently creates/updates all scheduled tasks that keep GoCloud services running:
#   - GoCloudApiSupervisor:    keeps the Node API process alive (auto-restart on crash)
#   - GoCloudApiHealthMonitor: pings /api/health every 5 minutes, restarts supervisor on failure
#   - GoCloudNewsletterSend:   sends the periodic newsletter campaign once a day
#   - GoCloudServiceWatchdog:  audits API/IIS/newsletter task health every 15 minutes and alerts on failure
# Run as Administrator on the VPS: powershell -ExecutionPolicy Bypass -File register-service-tasks.ps1

$apiDir = $PSScriptRoot
$supervisorScript = Join-Path $apiDir 'run-api-supervisor.ps1'
$monitorScript = Join-Path $apiDir 'monitor-api-health.ps1'
$newsletterSendScript = Join-Path $apiDir 'newsletter-send-task.ps1'
$watchdogScript = Join-Path $apiDir 'service-watchdog.ps1'

function Register-Task {
  param(
    [string]$TaskName,
    [string]$ScriptPath,
    [string]$Schedule,
    [string[]]$ScheduleArgs
  )

  if (-not (Test-Path $ScriptPath)) {
    Write-Host "  [SKIP] $TaskName - script not found: $ScriptPath" -ForegroundColor Yellow
    return
  }

  $trigger = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
  $createArgs = @('/Create', '/F', '/TN', $TaskName, '/RU', 'SYSTEM', '/RL', 'HIGHEST', '/TR', $trigger) + $ScheduleArgs
  & schtasks $createArgs | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] $TaskName registered ($Schedule)" -ForegroundColor Green
  } else {
    Write-Host "  [WARN] Failed to register $TaskName" -ForegroundColor Yellow
  }
}

Write-Host 'Registering GoCloud service scheduled tasks...' -ForegroundColor Cyan

Register-Task -TaskName 'GoCloudApiSupervisor' -ScriptPath $supervisorScript -Schedule 'on startup' -ScheduleArgs @('/SC', 'ONSTART')
Register-Task -TaskName 'GoCloudApiHealthMonitor' -ScriptPath $monitorScript -Schedule 'every 5 minutes' -ScheduleArgs @('/SC', 'MINUTE', '/MO', '5')
Register-Task -TaskName 'GoCloudNewsletterSend' -ScriptPath $newsletterSendScript -Schedule 'daily at 08:00' -ScheduleArgs @('/SC', 'DAILY', '/ST', '08:00')
Register-Task -TaskName 'GoCloudServiceWatchdog' -ScriptPath $watchdogScript -Schedule 'every 15 minutes' -ScheduleArgs @('/SC', 'MINUTE', '/MO', '15')

# Ensure the API supervisor and watchdog are running now, not only on next trigger.
schtasks /Run /TN 'GoCloudApiSupervisor' | Out-Null
schtasks /Run /TN 'GoCloudServiceWatchdog' | Out-Null

Write-Host 'Done. Use "schtasks /Query /TN <TaskName> /V /FO LIST" to inspect a task.' -ForegroundColor Cyan
