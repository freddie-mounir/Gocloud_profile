$ErrorActionPreference = 'SilentlyContinue'

# Centralized watchdog: audits all critical GoCloud services, attempts automatic
# recovery, writes a status report, and emails the admin when recovery fails.
# Intended to run every 15 minutes via the GoCloudServiceWatchdog scheduled task.

$apiDir = $PSScriptRoot
$projectDir = Split-Path -Parent $apiDir
$logDir = Join-Path $projectDir 'logs'
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$logFile = Join-Path $logDir 'service_watchdog.log'
$statusFile = Join-Path $logDir 'service_status.json'
$alertScript = Join-Path $apiDir 'send-admin-alert.js'

$localHealthUrl = 'http://127.0.0.1:3001/api/health'
$supervisorTaskName = 'GoCloudApiSupervisor'
$healthMonitorTaskName = 'GoCloudApiHealthMonitor'
$newsletterTaskName = 'GoCloudNewsletterSend'
$iisServiceName = 'W3SVC'

function Write-WatchdogLog {
  param([string]$Message)
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $logFile -Value ("[$ts] $Message")
}

function Send-AdminAlert {
  param([string]$Subject, [string]$Message)

  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCmd -or -not (Test-Path $alertScript)) {
    Write-WatchdogLog "WARN: cannot send admin alert (node or send-admin-alert.js missing)."
    return
  }

  & $nodeCmd.Source $alertScript "--subject=$Subject" "--message=$Message" "--severity=CRITICAL" | Out-Null
}

function Test-LocalHealth {
  try {
    $resp = Invoke-WebRequest -Uri $localHealthUrl -UseBasicParsing -TimeoutSec 8
    if ($resp.StatusCode -ne 200) {
      return $false
    }
    $json = $resp.Content | ConvertFrom-Json
    return ($json.status -eq 'ok')
  } catch {
    return $false
  }
}

function Get-ScheduledTaskInfo {
  param([string]$TaskName)
  try {
    $result = schtasks /Query /TN $TaskName /FO LIST /V 2>&1
    if ($LASTEXITCODE -ne 0) {
      return $null
    }
    return ($result | Out-String)
  } catch {
    return $null
  }
}

$results = @()
$failedServices = @()

# 1) API server (chatbot + newsletter subscription backend)
Write-WatchdogLog '--- Checking API server health ---'
$apiOk = Test-LocalHealth
if ($apiOk) {
  Write-WatchdogLog 'PASS: API server is healthy.'
  $results += [pscustomobject]@{ service = 'api-server'; status = 'ok'; recovered = $false }
} else {
  Write-WatchdogLog 'WARN: API server health check failed. Restarting supervisor task...'
  schtasks /End /TN $supervisorTaskName | Out-Null
  Start-Sleep -Seconds 2
  schtasks /Run /TN $supervisorTaskName | Out-Null
  Start-Sleep -Seconds 12

  $apiOkAfter = Test-LocalHealth
  if ($apiOkAfter) {
    Write-WatchdogLog 'RECOVERED: API server restarted successfully.'
    $results += [pscustomobject]@{ service = 'api-server'; status = 'recovered'; recovered = $true }
  } else {
    Write-WatchdogLog 'FAIL: API server restart did not recover the service.'
    $results += [pscustomobject]@{ service = 'api-server'; status = 'failed'; recovered = $false }
    $failedServices += [pscustomobject]@{
      name = 'API server (chatbot + newsletter backend)'
      detail = "Local health check at $localHealthUrl failed even after restarting scheduled task '$supervisorTaskName'."
      action = "Check logs\api_runtime.log and logs\api_supervisor.log on the VPS, verify node is installed, and confirm port 3001 is free."
    }
  }
}

# 2) API health monitor task existence
Write-WatchdogLog '--- Checking health monitor task ---'
$monitorInfo = Get-ScheduledTaskInfo -TaskName $healthMonitorTaskName
if ($monitorInfo) {
  Write-WatchdogLog "PASS: $healthMonitorTaskName task exists."
  $results += [pscustomobject]@{ service = 'health-monitor-task'; status = 'ok'; recovered = $false }
} else {
  Write-WatchdogLog "WARN: $healthMonitorTaskName task missing. Recreating..."
  $monitorScript = Join-Path $apiDir 'monitor-api-health.ps1'
  schtasks /Create /F /TN $healthMonitorTaskName /SC MINUTE /MO 5 /RU SYSTEM /RL HIGHEST /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$monitorScript`"" | Out-Null
  $monitorInfoAfter = Get-ScheduledTaskInfo -TaskName $healthMonitorTaskName
  if ($monitorInfoAfter) {
    Write-WatchdogLog "RECOVERED: $healthMonitorTaskName task recreated."
    $results += [pscustomobject]@{ service = 'health-monitor-task'; status = 'recovered'; recovered = $true }
  } else {
    Write-WatchdogLog "FAIL: could not recreate $healthMonitorTaskName task."
    $results += [pscustomobject]@{ service = 'health-monitor-task'; status = 'failed'; recovered = $false }
    $failedServices += [pscustomobject]@{
      name = 'API health monitor scheduled task'
      detail = "Task '$healthMonitorTaskName' is missing and could not be recreated."
      action = "Run api\register-service-tasks.ps1 manually as Administrator on the VPS."
    }
  }
}

# 3) Newsletter campaign send task (periodic blog/campaign emails)
Write-WatchdogLog '--- Checking newsletter send task ---'
$newsletterInfo = Get-ScheduledTaskInfo -TaskName $newsletterTaskName
if (-not $newsletterInfo) {
  Write-WatchdogLog "WARN: $newsletterTaskName task missing. Recreating..."
  $sendScript = Join-Path $apiDir 'newsletter-send-task.ps1'
  schtasks /Create /F /TN $newsletterTaskName /SC DAILY /ST 08:00 /RU SYSTEM /RL HIGHEST /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$sendScript`"" | Out-Null
  $newsletterInfo = Get-ScheduledTaskInfo -TaskName $newsletterTaskName
}

if ($newsletterInfo) {
  $lastResultLine = ($newsletterInfo -split "`r`n" | Where-Object { $_ -match 'Last Result' } | Select-Object -First 1)
  $lastRunLine = ($newsletterInfo -split "`r`n" | Where-Object { $_ -match 'Last Run Time' } | Select-Object -First 1)
  Write-WatchdogLog "PASS: $newsletterTaskName task exists. $lastRunLine $lastResultLine"
  $results += [pscustomobject]@{ service = 'newsletter-send-task'; status = 'ok'; recovered = $false }
} else {
  Write-WatchdogLog "FAIL: could not create $newsletterTaskName task."
  $results += [pscustomobject]@{ service = 'newsletter-send-task'; status = 'failed'; recovered = $false }
  $failedServices += [pscustomobject]@{
    name = 'Newsletter campaign send task'
    detail = "Scheduled task '$newsletterTaskName' does not exist and could not be created."
    action = "Run api\register-service-tasks.ps1 manually as Administrator on the VPS, or run: node scripts\newsletter-automation.js --send"
  }
}

# 4) IIS (W3SVC) service
Write-WatchdogLog '--- Checking IIS service ---'
$iisService = Get-Service -Name $iisServiceName -ErrorAction SilentlyContinue
if (-not $iisService) {
  Write-WatchdogLog "INFO: $iisServiceName service not found on this host (skipping IIS check)."
} elseif ($iisService.Status -eq 'Running') {
  Write-WatchdogLog 'PASS: IIS (W3SVC) is running.'
  $results += [pscustomobject]@{ service = 'iis'; status = 'ok'; recovered = $false }
} else {
  Write-WatchdogLog 'WARN: IIS (W3SVC) is not running. Attempting to start...'
  Start-Service -Name $iisServiceName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 5
  $iisAfter = Get-Service -Name $iisServiceName -ErrorAction SilentlyContinue
  if ($iisAfter -and $iisAfter.Status -eq 'Running') {
    Write-WatchdogLog 'RECOVERED: IIS (W3SVC) started successfully.'
    $results += [pscustomobject]@{ service = 'iis'; status = 'recovered'; recovered = $true }
  } else {
    Write-WatchdogLog 'FAIL: IIS (W3SVC) could not be started.'
    $results += [pscustomobject]@{ service = 'iis'; status = 'failed'; recovered = $false }
    $failedServices += [pscustomobject]@{
      name = 'IIS (W3SVC)'
      detail = 'The IIS World Wide Web Publishing Service is stopped and could not be restarted automatically.'
      action = 'Check Windows Event Viewer (Application/System logs) and start the service manually: Start-Service W3SVC'
    }
  }
}

# Write status report
$report = [pscustomobject]@{
  checkedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  services = $results
  failedCount = $failedServices.Count
}
$report | ConvertTo-Json -Depth 5 | Set-Content -Path $statusFile -Encoding utf8

if ($failedServices.Count -gt 0) {
  Write-WatchdogLog "ALERTING: $($failedServices.Count) service(s) failed recovery."
  $messageLines = @("The GoCloud service watchdog detected $($failedServices.Count) failing service(s) on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'):", '')
  foreach ($item in $failedServices) {
    $messageLines += "- $($item.name)"
    $messageLines += "  Detail: $($item.detail)"
    $messageLines += "  Suggested action: $($item.action)"
    $messageLines += ''
  }
  $messageLines += "Full log: $logFile"
  $subject = "$($failedServices.Count) service(s) require manual attention"
  Send-AdminAlert -Subject $subject -Message ($messageLines -join "`n")
} else {
  Write-WatchdogLog 'PASS: all monitored services are healthy.'
}

exit 0
