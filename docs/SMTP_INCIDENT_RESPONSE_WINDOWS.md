# SMTP Incident Response (Windows VPS)

Use this checklist when your provider reports unusual outgoing traffic on port 25.

## 1) Immediate Containment

Run as Administrator PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Block Outbound SMTP 25 (Emergency)" -Direction Outbound -Protocol TCP -RemotePort 25 -Action Block
```

If a similar rule exists already:

```powershell
Get-NetFirewallRule | Where-Object DisplayName -like "*SMTP 25*"
```

## 2) Find the Process Sending SMTP

Current SMTP connections:

```powershell
Get-NetTCPConnection -State Established | Where-Object RemotePort -eq 25 | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,OwningProcess
```

Map PID to process:

```powershell
Get-Process -Id <PID> | Select-Object Id,ProcessName,Path,StartTime
```

Find parent process and command line:

```powershell
Get-CimInstance Win32_Process | Where-Object ProcessId -eq <PID> | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine
```

## 3) Triage Persistence and Lateral Risk

Scheduled tasks:

```powershell
Get-ScheduledTask | Where-Object State -ne 'Disabled' | Select-Object TaskName,TaskPath,State
```

Startup entries:

```powershell
Get-CimInstance Win32_StartupCommand | Select-Object Name,Command,Location,User
```

Services not from Microsoft:

```powershell
Get-CimInstance Win32_Service | Where-Object { $_.PathName -and $_.PathName -notmatch 'Windows' } | Select-Object Name,DisplayName,State,StartMode,PathName
```

## 4) Account and Access Review

Local users and admins:

```powershell
Get-LocalUser
Get-LocalGroupMember -Group Administrators
```

Recent logon events (interactive + network):

```powershell
Get-WinEvent -LogName Security -MaxEvents 1000 |
  Where-Object { $_.Id -in 4624,4625,4648,4672 } |
  Select-Object TimeCreated,Id,Message
```

RDP and SSH service state:

```powershell
Get-Service TermService,sshd -ErrorAction SilentlyContinue | Select-Object Name,Status,StartType
```

## 5) Credential and Key Rotation

Rotate immediately:
- Windows Administrator password
- SSH keys in C:\ProgramData\ssh\administrators_authorized_keys
- API keys (Gemini and any cloud credentials)
- Git/deployment credentials

Then restart impacted services.

## 6) Harden Before Re-Opening SMTP

Recommended controls:
- Keep outbound 25 blocked unless absolutely needed.
- If mail is required, allow only your trusted relay host/IP.
- SSH key-only auth (PasswordAuthentication no).
- Restrict inbound SSH to known management IPs.
- Enable Windows Updates and reboot.
- Remove unknown users/tasks/services.

## 7) Rebuild Decision

Rebuild from clean image if any of the following is true:
- Unknown binaries/services executed.
- Unknown admin accounts or credential theft suspected.
- You cannot confidently explain all SMTP traffic sources.

After rebuild:
- Restore only verified application content.
- Recreate keys/secrets from scratch.
- Re-apply hardening and monitoring before go-live.

## 8) Provider Response Template

```text
We contained the issue by blocking outbound SMTP/25 and started forensic triage.
We identified and removed suspicious activity, rotated credentials, and hardened SSH and firewall policy.
Please keep the temporary SMTP limitation while we complete verification. We will request a controlled allow-list if legitimate SMTP is required.
```
