param([string]$Version = (Get-Date -Format 'yyyy.MM.dd-HHmm'))
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$releaseDir = Join-Path $root 'releases'
$stage = Join-Path $releaseDir "CertificationOps-$Version"
$archive = "$stage.zip"
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
foreach ($directory in @('static','scripts','config')) { New-Item -ItemType Directory -Force -Path (Join-Path $stage $directory) | Out-Null }
foreach ($file in @('server.py','requirements.txt','start-intranet.ps1','DINGTALK_DEPLOYMENT.md','README.md')) {
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $stage $file)
}
Copy-Item -Path (Join-Path $root 'static\*') -Destination (Join-Path $stage 'static') -Recurse
Copy-Item -Path (Join-Path $root 'scripts\*') -Destination (Join-Path $stage 'scripts') -Recurse
Copy-Item -LiteralPath (Join-Path $root 'config\server-config.ps1.example') -Destination (Join-Path $stage 'config\server-config.ps1.example')
Get-ChildItem -LiteralPath $stage -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force
Compress-Archive -LiteralPath $stage -DestinationPath $archive -CompressionLevel Optimal
Remove-Item -LiteralPath $stage -Recurse -Force
Write-Host $archive
