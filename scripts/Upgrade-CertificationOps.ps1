param(
    [Parameter(Mandatory=$true)][string]$InstallDir
)
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$target = [System.IO.Path]::GetFullPath($InstallDir)
if (-not (Test-Path -LiteralPath (Join-Path $target 'server.py'))) { throw 'The target is not a CertificationOps installation.' }

$portable = Join-Path $target 'CertificationOpsServer.exe'
$python = Join-Path $target '.venv\Scripts\python.exe'
if (Test-Path -LiteralPath $portable) { & $portable --backup }
else {
    if (-not (Test-Path -LiteralPath $python)) { $python = (Get-Command python -ErrorAction Stop).Source }
    & $python (Join-Path $target 'scripts\backup.py')
}

$rollback = Join-Path $target 'rollback\previous'
if (Test-Path -LiteralPath $rollback) { Remove-Item -LiteralPath $rollback -Recurse -Force }
New-Item -ItemType Directory -Force -Path $rollback | Out-Null
foreach ($item in @('server.py','requirements.txt','start-intranet.ps1','CertificationOpsServer.exe','_internal','static','scripts')) {
    $existing = Join-Path $target $item
    if (Test-Path -LiteralPath $existing) { Copy-Item -LiteralPath $existing -Destination $rollback -Recurse -Force }
}
Copy-Item -LiteralPath (Join-Path $sourceRoot 'server.py') -Destination (Join-Path $target 'server.py') -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'requirements.txt') -Destination (Join-Path $target 'requirements.txt') -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'start-intranet.ps1') -Destination (Join-Path $target 'start-intranet.ps1') -Force
Copy-Item -Path (Join-Path $sourceRoot 'static\*') -Destination (Join-Path $target 'static') -Recurse -Force
Copy-Item -Path (Join-Path $sourceRoot 'scripts\*') -Destination (Join-Path $target 'scripts') -Recurse -Force
if (Test-Path -LiteralPath (Join-Path $sourceRoot 'CertificationOpsServer.exe')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'CertificationOpsServer.exe') -Destination (Join-Path $target 'CertificationOpsServer.exe') -Force
    if (Test-Path -LiteralPath (Join-Path $target '_internal')) { Remove-Item -LiteralPath (Join-Path $target '_internal') -Recurse -Force }
    Copy-Item -LiteralPath (Join-Path $sourceRoot '_internal') -Destination $target -Recurse -Force
} else { & $python -m pip install -r (Join-Path $target 'requirements.txt') }
Write-Host 'Upgrade copied. Config, data, backups and attachments were preserved.'
Write-Host "Rollback files: $rollback"
