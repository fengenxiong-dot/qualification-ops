param(
    [string]$InstallDir = 'C:\CertificationOps',
    [switch]$CreateStartupTask
)
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$target = [System.IO.Path]::GetFullPath($InstallDir)
if ($target -eq [System.IO.Path]::GetPathRoot($target)) { throw 'InstallDir cannot be a drive root.' }

New-Item -ItemType Directory -Force -Path $target | Out-Null
foreach ($directory in @('static','scripts','config','data','data\submissions','data\staging','backups','logs')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $target $directory) | Out-Null
}
foreach ($file in @('server.py','requirements.txt','start-intranet.ps1','DINGTALK_DEPLOYMENT.md','README.md')) {
    $sourceFile = Join-Path $sourceRoot $file
    if (Test-Path -LiteralPath $sourceFile) { Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $target $file) -Force }
}
Copy-Item -Path (Join-Path $sourceRoot 'static\*') -Destination (Join-Path $target 'static') -Recurse -Force
Copy-Item -Path (Join-Path $sourceRoot 'scripts\*') -Destination (Join-Path $target 'scripts') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'config\server-config.ps1.example') -Destination (Join-Path $target 'config\server-config.ps1.example') -Force
$config = Join-Path $target 'config\server-config.ps1'
if (-not (Test-Path -LiteralPath $config)) {
    Copy-Item -LiteralPath (Join-Path $target 'config\server-config.ps1.example') -Destination $config
}

$snapshot = Join-Path $sourceRoot 'data-snapshot'
$targetDatabase = Join-Path $target 'data\certification.db'
if ((Test-Path -LiteralPath $snapshot) -and -not (Test-Path -LiteralPath $targetDatabase)) {
    $snapshotDatabase = Join-Path $snapshot 'certification.db'
    if (Test-Path -LiteralPath $snapshotDatabase) {
        Copy-Item -LiteralPath $snapshotDatabase -Destination $targetDatabase -Force
    }
    $snapshotSubmissions = Join-Path $snapshot 'submissions'
    if (Test-Path -LiteralPath $snapshotSubmissions) {
        Copy-Item -LiteralPath $snapshotSubmissions -Destination (Join-Path $target 'data') -Recurse -Force
    }
    Write-Host 'Bundled business data snapshot restored.'
} elseif ((Test-Path -LiteralPath $snapshot) -and (Test-Path -LiteralPath $targetDatabase)) {
    Write-Host 'Existing database detected; bundled snapshot was not used.'
}

$portableServer = Join-Path $sourceRoot 'CertificationOpsServer.exe'
if (Test-Path -LiteralPath $portableServer) {
    Copy-Item -LiteralPath $portableServer -Destination (Join-Path $target 'CertificationOpsServer.exe') -Force
    if (Test-Path -LiteralPath (Join-Path $sourceRoot '_internal')) { Copy-Item -LiteralPath (Join-Path $sourceRoot '_internal') -Destination $target -Recurse -Force }
} else {
    $python = Get-Command python -ErrorAction Stop
    & $python.Source -m venv (Join-Path $target '.venv')
    $wheelhouse = Join-Path $sourceRoot 'wheelhouse'
    if (Test-Path -LiteralPath $wheelhouse) {
        & (Join-Path $target '.venv\Scripts\python.exe') -m pip install --no-index --find-links $wheelhouse -r (Join-Path $target 'requirements.txt')
    } else {
        & (Join-Path $target '.venv\Scripts\python.exe') -m pip install -r (Join-Path $target 'requirements.txt')
    }
}

if ($CreateStartupTask) {
    $taskName = 'CertificationOpsServer'
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $target 'start-intranet.ps1')`""
    $trigger = New-ScheduledTaskTrigger -AtStartup
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Description '任职资格认证内网服务' -RunLevel Highest -Force | Out-Null
}
Write-Host "Installed to $target"
Write-Host "Next: edit $config, then run start-intranet.ps1"
