@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "API_DIR=C:\inetpub\wwwroot\GoCloud_website_project\api"
set "DIAG_SCRIPT=%~dp0newsletter-diagnostic.bat"
set "MAX_ATTEMPTS=3"
set "WAIT_SECONDS=15"
set "RESTART_MODE=TASK"
set "SERVICE_NAME=GoCloudApi"
set "SERVICE_DISPLAY_NAME=GoCloud Chatbot API"
set "SERVICE_SCRIPT=%API_DIR%\server.js"
set "TASK_NAME=GoCloudApiSupervisor"
set "SUPERVISOR_SCRIPT=%API_DIR%\run-api-supervisor.ps1"
set "MONITOR_TASK_NAME=GoCloudApiHealthMonitor"
set "MONITOR_SCRIPT=%API_DIR%\monitor-api-health.ps1"
set "NEWSLETTER_SEND_TASK_NAME=GoCloudNewsletterSend"
set "NEWSLETTER_SEND_SCRIPT=%API_DIR%\newsletter-send-task.ps1"
set "SERVICE_WATCHDOG_TASK_NAME=GoCloudServiceWatchdog"
set "SERVICE_WATCHDOG_SCRIPT=%API_DIR%\service-watchdog.ps1"
set "LOCAL_PORT=3001"
set "LOCAL_HEALTH_URL=http://127.0.0.1:3001/api/health"
set "HEALTH_WAIT_SECONDS=60"

set "LOG_DIR=%~dp0logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
for /f %%i in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyyMMdd_HHmmss')"') do set "TS=%%i"
set "LOG_FILE=%LOG_DIR%\restart_verify_%TS%.log"
set "API_START_LOG=%LOG_DIR%\api_start_%TS%.log"

call :log "===================================================="
call :log "Restart + Verify started"
call :log "Mode=%RESTART_MODE%  MaxAttempts=%MAX_ATTEMPTS%"
call :log "DiagScript=%DIAG_SCRIPT%"
call :log "ApiStartLog=%API_START_LOG%"
call :log "===================================================="

if not exist "%DIAG_SCRIPT%" (
  call :log "[FATAL] Missing diagnostics script: %DIAG_SCRIPT%"
  echo Missing: %DIAG_SCRIPT%
  goto end_fail
)

call :ensure_monitor_task_exists
if errorlevel 1 (
  call :log "[WARN] Monitor task could not be created: %MONITOR_TASK_NAME%"
) else (
  call :log "[PASS] Monitor task ready: %MONITOR_TASK_NAME%"
)

call :ensure_newsletter_send_task_exists
if errorlevel 1 (
  call :log "[WARN] Newsletter send task could not be created: %NEWSLETTER_SEND_TASK_NAME%"
) else (
  call :log "[PASS] Newsletter send task ready: %NEWSLETTER_SEND_TASK_NAME%"
)

call :ensure_service_watchdog_task_exists
if errorlevel 1 (
  call :log "[WARN] Service watchdog task could not be created: %SERVICE_WATCHDOG_TASK_NAME%"
) else (
  call :log "[PASS] Service watchdog task ready: %SERVICE_WATCHDOG_TASK_NAME%"
)

set /a attempt=1
:retry_loop
if %attempt% GTR %MAX_ATTEMPTS% goto failed_all

call :log ""
call :log "----- Attempt %attempt% of %MAX_ATTEMPTS% -----"

call :restart_api
if errorlevel 1 call :log "[WARN] Restart command reported issue. Continuing to diagnostics anyway."

call :log "Waiting %WAIT_SECONDS%s for API to come up..."
powershell -NoProfile -Command "Start-Sleep -Seconds %WAIT_SECONDS%"

call :wait_local_health
if errorlevel 1 (
  call :log "[FAIL] Local health endpoint is still not ready: %LOCAL_HEALTH_URL%"
  call :print_api_start_tail
) else (
  call :log "[PASS] Local health endpoint responded: %LOCAL_HEALTH_URL%"
)

call :check_local_port
if errorlevel 1 (
  call :log "[FAIL] Port %LOCAL_PORT% is not listening after restart."
  call :print_api_start_tail
)

call :log "Running diagnostics..."
set "DIAG_NO_PAUSE=1"
call "%DIAG_SCRIPT%"
set "DIAG_EXIT=%ERRORLEVEL%"

if "%DIAG_EXIT%"=="0" (
  call :log "[PASS] Diagnostics passed on attempt %attempt%."
  echo.
  echo SUCCESS: diagnostics passed.
  echo Log: %LOG_FILE%
  goto end_ok
) else (
  call :log "[FAIL] Diagnostics failed on attempt %attempt% with exit=%DIAG_EXIT%."
  call :print_last_diag_tail
  set /a attempt+=1
  goto retry_loop
)

:failed_all
call :log ""
call :log "[FATAL] All attempts failed."
call :print_last_diag_tail
echo.
echo FAILED: diagnostics did not pass after %MAX_ATTEMPTS% attempts.
echo Log: %LOG_FILE%
goto end_fail

:restart_api
call :log "Restart mode: %RESTART_MODE%"
if /I "%RESTART_MODE%"=="PM2" goto restart_pm2
if /I "%RESTART_MODE%"=="SERVICE" goto restart_service
if /I "%RESTART_MODE%"=="TASK" goto restart_task
if /I "%RESTART_MODE%"=="NPM" goto restart_npm
if /I "%RESTART_MODE%"=="AUTO" goto restart_auto
call :log "[ERROR] Unknown RESTART_MODE=%RESTART_MODE%"
exit /b 1

:restart_auto
call :log "AUTO: trying task supervisor mode first..."
call :restart_task
if not errorlevel 1 exit /b 0

call :log "AUTO: task mode failed. Trying PM2..."
where pm2 >nul 2>&1
if not errorlevel 1 (
  pm2 restart all >> "%LOG_FILE%" 2>&1
  if not errorlevel 1 (
    call :log "AUTO: PM2 restart succeeded."
    exit /b 0
  )
  call :log "AUTO: PM2 restart failed."
)

call :log "AUTO: fallback to npm start in new window..."
goto restart_npm

:restart_pm2
where pm2 >nul 2>&1
if errorlevel 1 (
  call :log "[ERROR] PM2 not found in PATH."
  exit /b 1
)
pm2 restart all >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :log "[ERROR] PM2 restart failed."
  exit /b 1
)
call :log "PM2 restart succeeded."
exit /b 0

:restart_service
if "%SERVICE_NAME%"=="" (
  call :log "[ERROR] SERVICE_NAME is empty."
  exit /b 1
)
call :ensure_service_exists
if errorlevel 1 (
  call :log "[ERROR] Could not ensure service exists: %SERVICE_NAME%"
  exit /b 1
)

powershell -NoProfile -Command "$svc=Get-Service -Name '%SERVICE_NAME%' -ErrorAction Stop; if($svc.Status -eq 'Running'){Restart-Service -Name '%SERVICE_NAME%' -ErrorAction Stop}else{Start-Service -Name '%SERVICE_NAME%' -ErrorAction Stop}" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :log "[ERROR] Service restart failed: %SERVICE_NAME%"
  exit /b 1
)
call :log "Service restart succeeded: %SERVICE_NAME%"
exit /b 0

:restart_task
call :ensure_api_dependencies
if errorlevel 1 exit /b 1

call :ensure_task_exists
if errorlevel 1 (
  call :log "[ERROR] Could not ensure scheduled task exists: %TASK_NAME%"
  exit /b 1
)

schtasks /End /TN "%TASK_NAME%" >> "%LOG_FILE%" 2>&1

call :kill_existing_port_owner

schtasks /Run /TN "%TASK_NAME%" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :log "[ERROR] Failed to run scheduled task: %TASK_NAME%"
  exit /b 1
)

call :log "Task restart succeeded: %TASK_NAME%"
exit /b 0

:ensure_task_exists
schtasks /Query /TN "%TASK_NAME%" >nul 2>&1
if not errorlevel 1 exit /b 0

if not exist "%SUPERVISOR_SCRIPT%" (
  call :log "[ERROR] Supervisor script not found: %SUPERVISOR_SCRIPT%"
  exit /b 1
)

call :log "[INFO] Creating scheduled task %TASK_NAME%"
schtasks /Create /F /TN "%TASK_NAME%" /SC ONSTART /RU SYSTEM /RL HIGHEST /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%SUPERVISOR_SCRIPT%\"" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :log "[ERROR] Failed to create task: %TASK_NAME%"
  exit /b 1
)

call :log "[PASS] Scheduled task created: %TASK_NAME%"
exit /b 0

:ensure_monitor_task_exists
schtasks /Query /TN "%MONITOR_TASK_NAME%" >nul 2>&1
if not errorlevel 1 exit /b 0

if not exist "%MONITOR_SCRIPT%" (
  call :log "[ERROR] Monitor script not found: %MONITOR_SCRIPT%"
  exit /b 1
)

call :log "[INFO] Creating monitor task %MONITOR_TASK_NAME%"
schtasks /Create /F /TN "%MONITOR_TASK_NAME%" /SC MINUTE /MO 5 /RU SYSTEM /RL HIGHEST /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%MONITOR_SCRIPT%\"" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :log "[ERROR] Failed to create monitor task: %MONITOR_TASK_NAME%"
  exit /b 1
)

schtasks /Run /TN "%MONITOR_TASK_NAME%" >> "%LOG_FILE%" 2>&1
call :log "[PASS] Monitor task created: %MONITOR_TASK_NAME%"
exit /b 0

:ensure_newsletter_send_task_exists
schtasks /Query /TN "%NEWSLETTER_SEND_TASK_NAME%" >nul 2>&1
if not errorlevel 1 exit /b 0

if not exist "%NEWSLETTER_SEND_SCRIPT%" (
  call :log "[ERROR] Newsletter send script not found: %NEWSLETTER_SEND_SCRIPT%"
  exit /b 1
)

call :log "[INFO] Creating newsletter send task %NEWSLETTER_SEND_TASK_NAME%"
schtasks /Create /F /TN "%NEWSLETTER_SEND_TASK_NAME%" /SC DAILY /ST 08:00 /RU SYSTEM /RL HIGHEST /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%NEWSLETTER_SEND_SCRIPT%\"" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :log "[ERROR] Failed to create newsletter send task: %NEWSLETTER_SEND_TASK_NAME%"
  exit /b 1
)

call :log "[PASS] Newsletter send task created: %NEWSLETTER_SEND_TASK_NAME%"
exit /b 0

:ensure_service_watchdog_task_exists
schtasks /Query /TN "%SERVICE_WATCHDOG_TASK_NAME%" >nul 2>&1
if not errorlevel 1 exit /b 0

if not exist "%SERVICE_WATCHDOG_SCRIPT%" (
  call :log "[ERROR] Service watchdog script not found: %SERVICE_WATCHDOG_SCRIPT%"
  exit /b 1
)

call :log "[INFO] Creating service watchdog task %SERVICE_WATCHDOG_TASK_NAME%"
schtasks /Create /F /TN "%SERVICE_WATCHDOG_TASK_NAME%" /SC MINUTE /MO 15 /RU SYSTEM /RL HIGHEST /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%SERVICE_WATCHDOG_SCRIPT%\"" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :log "[ERROR] Failed to create service watchdog task: %SERVICE_WATCHDOG_TASK_NAME%"
  exit /b 1
)

schtasks /Run /TN "%SERVICE_WATCHDOG_TASK_NAME%" >> "%LOG_FILE%" 2>&1
call :log "[PASS] Service watchdog task created: %SERVICE_WATCHDOG_TASK_NAME%"
exit /b 0

:ensure_api_dependencies
if exist "%API_DIR%\node_modules\express" exit /b 0

call :log "[INFO] API dependencies not found. Running npm ci in %API_DIR%..."
pushd "%API_DIR%"
if errorlevel 1 (
  call :log "[ERROR] Failed to enter API directory: %API_DIR%"
  exit /b 1
)

npm ci --omit=dev >> "%LOG_FILE%" 2>&1
set "NPM_INSTALL_EXIT=%ERRORLEVEL%"
popd

if not "%NPM_INSTALL_EXIT%"=="0" (
  call :log "[ERROR] npm ci failed with exit code %NPM_INSTALL_EXIT%."
  exit /b %NPM_INSTALL_EXIT%
)

call :log "[PASS] API dependencies installed successfully."
exit /b 0

:ensure_service_exists
sc query "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 exit /b 0

if not exist "%SERVICE_SCRIPT%" (
  call :log "[ERROR] Service script not found: %SERVICE_SCRIPT%"
  exit /b 1
)

set "NODE_EXE="
for /f "delims=" %%N in ('where node 2^>nul') do (
  if not defined NODE_EXE set "NODE_EXE=%%N"
)

if not defined NODE_EXE set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not exist "!NODE_EXE!" (
  call :log "[ERROR] node.exe not found for service install."
  exit /b 1
)

call :log "[INFO] Creating service %SERVICE_NAME% using !NODE_EXE!"
sc create "%SERVICE_NAME%" binPath= "\"!NODE_EXE!\" \"%SERVICE_SCRIPT%\"" start= auto DisplayName= "%SERVICE_DISPLAY_NAME%" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :log "[ERROR] Service creation failed: %SERVICE_NAME%"
  exit /b 1
)

sc description "%SERVICE_NAME%" "GoCloud API service for chatbot and newsletter endpoints" >> "%LOG_FILE%" 2>&1
sc failure "%SERVICE_NAME%" reset= 86400 actions= restart/5000/restart/5000/restart/5000 >> "%LOG_FILE%" 2>&1
call :log "[PASS] Service created: %SERVICE_NAME%"
exit /b 0

:restart_npm
if not exist "%API_DIR%\package.json" (
  call :log "[ERROR] API_DIR invalid: %API_DIR%"
  exit /b 1
)

call :ensure_api_dependencies
if errorlevel 1 exit /b 1

call :kill_existing_port_owner

powershell -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm start >> \"%API_START_LOG%\" 2>&1' -WorkingDirectory '%API_DIR%' -WindowStyle Hidden"
if errorlevel 1 (
  call :log "[ERROR] npm start launch failed."
  exit /b 1
)
call :log "npm start launched in new window and output redirected to: %API_START_LOG%"
exit /b 0

:kill_existing_port_owner
set "KILLED_ANY="
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; Get-NetTCPConnection -LocalPort %LOCAL_PORT% -State Listen ^| Select-Object -ExpandProperty OwningProcess -Unique"`) do (
  if not "%%P"=="0" (
    set "CUR_PID=%%P"
    call :log "[INFO] Stopping existing process on port %LOCAL_PORT% (PID=!CUR_PID!)..."
    powershell -NoProfile -Command "Stop-Process -Id !CUR_PID! -Force -ErrorAction SilentlyContinue" >> "%LOG_FILE%" 2>&1
    taskkill /PID !CUR_PID! /T /F >> "%LOG_FILE%" 2>&1
    set "KILLED_ANY=1"
  )
)
if defined KILLED_ANY (
  call :log "[INFO] Waiting for port %LOCAL_PORT% to clear..."
  call :wait_for_port_free
)
exit /b 0

:wait_for_port_free
set /a "PORT_REMAIN=20"
:wait_for_port_free_loop
netstat -ano | findstr /R /C:":%LOCAL_PORT% .*LISTENING" >nul
if errorlevel 1 exit /b 0
set /a "PORT_REMAIN-=1"
if %PORT_REMAIN% LEQ 0 exit /b 1
powershell -NoProfile -Command "Start-Sleep -Seconds 1"
goto wait_for_port_free_loop

:wait_local_health
set /a "WAIT_REMAIN=%HEALTH_WAIT_SECONDS%"
:wait_local_health_loop
powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; try { $r=Invoke-WebRequest -Uri '%LOCAL_HEALTH_URL%' -UseBasicParsing -TimeoutSec 3; if($r.StatusCode -ne 200){exit 1}; $j=$r.Content | ConvertFrom-Json; if($j.status -eq 'ok'){exit 0}; exit 1 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 exit /b 0
set /a "WAIT_REMAIN-=1"
if %WAIT_REMAIN% LEQ 0 exit /b 1
powershell -NoProfile -Command "Start-Sleep -Seconds 1"
goto wait_local_health_loop

:check_local_port
netstat -ano | findstr /R /C:":%LOCAL_PORT% .*LISTENING" >nul
if errorlevel 1 exit /b 1
exit /b 0

:print_api_start_tail
if not exist "%API_START_LOG%" (
  call :log "[WARN] API startup log not found: %API_START_LOG%"
  exit /b 0
)
call :log "[INFO] Last API startup log: %API_START_LOG%"
echo.
echo -------- LAST 30 LINES FROM API START LOG --------
powershell -NoProfile -Command "Get-Content -Path '%API_START_LOG%' -Tail 30"
echo ---------------------------------------------------
echo.
exit /b 0

:print_last_diag_tail
set "LAST_DIAG_LOG="
for /f "delims=" %%F in ('dir /b /a-d /o-d "%~dp0logs\newsletter_diag_*.log" 2^>nul') do (
  set "LAST_DIAG_LOG=%~dp0logs\%%F"
  goto foundDiagLog
)

if not defined LAST_DIAG_LOG (
  call :log "[WARN] No diagnostic log found to tail."
  exit /b 0
)

:foundDiagLog

call :log "[INFO] Last diagnostic log: !LAST_DIAG_LOG!"
echo.
echo -------- LAST 30 LINES FROM DIAGNOSTIC LOG --------
powershell -NoProfile -Command "Get-Content -Path '!LAST_DIAG_LOG!' -Tail 30"
echo ----------------------------------------------------
echo.
exit /b 0

:log
echo [%date% %time%] %~1>>"%LOG_FILE%"
if "%~1"=="" (
  echo.
) else (
  echo(%~1
)
exit /b 0

:end_ok
if not defined RESTART_NO_PAUSE (
  echo Press any key to close...
  pause >nul
)
exit /b 0

:end_fail
if not defined RESTART_NO_PAUSE (
  echo Press any key to close...
  pause >nul
)
exit /b 1
