$ErrorActionPreference = 'Continue'

$apiDir = $PSScriptRoot
$projectDir = Split-Path -Parent $apiDir
$logDir = Join-Path $projectDir 'logs'
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$supervisorLog = Join-Path $logDir 'api_supervisor.log'
$runtimeLog = Join-Path $logDir 'api_runtime.log'

function Write-SupervisorLog {
  param([string]$Message)
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $supervisorLog -Value ("[$ts] $Message")
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-SupervisorLog 'FATAL: node executable not found in PATH.'
  exit 1
}

$nodeExe = $nodeCmd.Source
$serverScript = Join-Path $apiDir 'server.js'
if (-not (Test-Path $serverScript)) {
  Write-SupervisorLog "FATAL: server.js not found at $serverScript"
  exit 1
}

Write-SupervisorLog "Supervisor starting. Node=$nodeExe Script=$serverScript"

while ($true) {
  try {
    Write-SupervisorLog 'Launching API process...'
    Push-Location $apiDir
    & $nodeExe $serverScript *>> $runtimeLog
    $exitCode = $LASTEXITCODE
    Pop-Location
    Write-SupervisorLog "API process exited with code $exitCode. Restarting in 3s..."
  } catch {
    if (Get-Location) {
      try { Pop-Location } catch { }
    }
    Write-SupervisorLog ("API process crashed in supervisor: " + $_.Exception.Message)
  }

  Start-Sleep -Seconds 3
}
