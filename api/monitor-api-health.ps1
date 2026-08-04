$ErrorActionPreference = 'SilentlyContinue'

$apiDir = $PSScriptRoot
$projectDir = Split-Path -Parent $apiDir
$logDir = Join-Path $projectDir 'logs'
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$logFile = Join-Path $logDir 'api_health_monitor.log'
$localHealthUrl = 'http://127.0.0.1:3001/api/health'
$publicHealthUrl = 'https://www.gocloudeg.com/api/health'
$supervisorTaskName = 'GoCloudApiSupervisor'

function Write-MonitorLog {
  param([string]$Message)
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $logFile -Value ("[$stamp] $Message")
}

function Test-Health {
  param([string]$Url, [int]$TimeoutSec = 8)

  try {
    $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
    if ($resp.StatusCode -ne 200) {
      return @{ Ok = $false; Status = $resp.StatusCode; Reason = 'status-not-200' }
    }

    $json = $resp.Content | ConvertFrom-Json
    if ($json.status -ne 'ok') {
      return @{ Ok = $false; Status = $resp.StatusCode; Reason = 'status-field-not-ok' }
    }

    return @{ Ok = $true; Status = $resp.StatusCode; Reason = 'ok' }
  } catch {
    return @{ Ok = $false; Status = 0; Reason = $_.Exception.Message }
  }
}

$localResult = Test-Health -Url $localHealthUrl
$publicResult = Test-Health -Url $publicHealthUrl

if ($localResult.Ok -and $publicResult.Ok) {
  Write-MonitorLog 'PASS: local and public health are OK.'
  exit 0
}

Write-MonitorLog ("WARN: local_ok=$($localResult.Ok) public_ok=$($publicResult.Ok) local_reason=$($localResult.Reason) public_reason=$($publicResult.Reason)")

if (-not $localResult.Ok) {
  Write-MonitorLog 'ACTION: restarting supervisor task due to local health failure.'
  schtasks /End /TN $supervisorTaskName | Out-Null
  Start-Sleep -Seconds 2
  schtasks /Run /TN $supervisorTaskName | Out-Null
  Start-Sleep -Seconds 12

  $localAfter = Test-Health -Url $localHealthUrl
  $publicAfter = Test-Health -Url $publicHealthUrl

  if ($localAfter.Ok -and $publicAfter.Ok) {
    Write-MonitorLog 'RECOVERED: health restored after supervisor restart.'
    exit 0
  }

  Write-MonitorLog ("FAIL: recovery failed local_ok=$($localAfter.Ok) public_ok=$($publicAfter.Ok) local_reason=$($localAfter.Reason) public_reason=$($publicAfter.Reason)")
  exit 1
}

Write-MonitorLog 'WARN: local API is healthy but public API failed. No automatic IIS action taken.'
exit 1
