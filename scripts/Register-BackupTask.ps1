param(
    [string]$InstallDir = 'C:\CertificationOps',
    [string]$At = '02:00'
)
$ErrorActionPreference = 'Stop'
$target = [System.IO.Path]::GetFullPath($InstallDir)
$python = Join-Path $target '.venv\Scripts\python.exe'
$script = Join-Path $target 'scripts\backup.py'
$portable = Join-Path $target 'CertificationOpsServer.exe'
if (Test-Path -LiteralPath $portable) {
    $action = New-ScheduledTaskAction -Execute $portable -Argument '--backup'
} elseif ((Test-Path -LiteralPath $python) -and (Test-Path -LiteralPath $script)) {
    $action = New-ScheduledTaskAction -Execute $python -Argument "`"$script`" --retention 14"
} else { throw 'CertificationOps is not installed at the selected path.' }
$trigger = New-ScheduledTaskTrigger -Daily -At $At
Register-ScheduledTask -TaskName 'CertificationOpsDailyBackup' -Action $action -Trigger $trigger -Description '任职资格认证数据库与附件每日备份' -RunLevel Highest -Force | Out-Null
Write-Host "Daily backup task registered at $At"
