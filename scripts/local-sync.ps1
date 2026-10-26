# Cerium opt-in Windows local sync.
# Run -Install once inside your local clone after switching to main.
# No force/reset/rebase: skips dirty trees and diverged branches.
param(
  [switch]$Install,
  [switch]$Remove,
  [switch]$Status
)

$ErrorActionPreference = 'Stop'
$taskName = 'Cerium - Local Main Sync'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$logDir = Join-Path $env:LOCALAPPDATA 'Cerium'
$logPath = Join-Path $logDir 'local-sync.log'

function Write-SyncLog([string]$Message) {
  if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  }
  Add-Content -LiteralPath $logPath -Value ('[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
}

if ($Install) {
  if ($env:OS -ne 'Windows_NT') {
    throw 'The automatic installer supports Windows only.'
  }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git must be installed and available in PATH.'
  }
  $branch = (& git -C $repo branch --show-current)
  if ($LASTEXITCODE -ne 0 -or ($branch | Out-String).Trim() -ne 'main') {
    throw 'Switch to main and resolve local changes before installing: git switch main'
  }
  $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $PSCommandPath + '"'
  $action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $repo
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  $account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Fast-forward clean local Cerium main from origin/main once per minute while signed in.' -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Write-Host 'Cerium local sync installed. Changes merged into origin/main will be pulled about once a minute.'
  Write-Host 'Your development server still needs to be running: npm run dev'
  Write-Host "Sync log: $logPath"
  return
}

if ($Remove) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host 'Cerium local sync disabled.'
  return
}

if ($Status) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($null -eq $task) { Write-Host 'Cerium local sync is not installed.'; return }
  $info = Get-ScheduledTaskInfo -TaskName $taskName
  Write-Host ("Sync: {0}; last run: {1}; last result: {2}" -f $task.State, $info.LastRunTime, $info.LastTaskResult)
  Write-Host "Log: $logPath"
  return
}

try {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git is not available to the scheduled task.'
  }
  $branch = (& git -C $repo branch --show-current)
  if ($LASTEXITCODE -ne 0) { throw 'Could not read local Git branch.' }
  if (($branch | Out-String).Trim() -ne 'main') { return }

  # Preserve unfinished tracked AND untracked work. Ignored .env and database
  # files are never touched by Git and need not prevent a safe update.
  $changes = @(& git -C $repo status --porcelain --untracked-files=normal)
  if ($LASTEXITCODE -ne 0) { throw 'Could not check working tree.' }
  if ($changes.Count -gt 0) { return }

  & git -C $repo fetch --quiet origin main 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Could not fetch origin/main. Check Git connectivity and credentials.' }

  & git -C $repo merge-base --is-ancestor HEAD origin/main
  if ($LASTEXITCODE -ne 0) {
    Write-SyncLog 'Skipped update: local main has diverged from origin/main (manual Git review required).'
    return
  }

  $before = (& git -C $repo rev-parse HEAD | Out-String).Trim()
  & git -C $repo merge --ff-only --quiet origin/main 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Fast-forward failed; no force or reset attempted.' }
  $after = (& git -C $repo rev-parse HEAD | Out-String).Trim()
  if ($before -ne $after) { Write-SyncLog "Updated main from $before to $after" }
} catch {
  # Only operational status is logged; never account records, tokens or env.
  Write-SyncLog ('Sync warning: ' + $_.Exception.Message)
  exit 1
}
