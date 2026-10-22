param([string]$Version = (Get-Date -Format 'yyyy.MM.dd-HHmm'))
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$python = if ($env:CERT_BUILD_PYTHON) { $env:CERT_BUILD_PYTHON } else { (Get-Command python -ErrorAction Stop).Source }
$env:PYTHONNOUSERSITE = '1'
& $python -c "import PyInstaller" 2>$null
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller is required on the development computer: python -m pip install pyinstaller' }

$work = Join-Path $root '.tmp\pyinstaller'
$dist = Join-Path $root '.tmp\portable-dist'
$releaseDir = Join-Path $root 'releases'
$stage = Join-Path $releaseDir "CertificationOps-Portable-$Version"
$archive = "$stage.zip"
foreach ($path in @($work,$dist,$stage)) { if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force } }
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
New-Item -ItemType Directory -Force -Path $releaseDir,$stage | Out-Null

& $python -m PyInstaller --noconfirm --clean --onedir --name CertificationOpsServer --distpath $dist --workpath $work --specpath $work (Join-Path $root 'server.py')
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller build failed.' }
$built = Join-Path $dist 'CertificationOpsServer'
Copy-Item -LiteralPath (Join-Path $built 'CertificationOpsServer.exe') -Destination $stage
Copy-Item -LiteralPath (Join-Path $built '_internal') -Destination $stage -Recurse
foreach ($directory in @('static','scripts','config')) { New-Item -ItemType Directory -Force -Path (Join-Path $stage $directory) | Out-Null }
Copy-Item -Path (Join-Path $root 'static\*') -Destination (Join-Path $stage 'static') -Recurse
Copy-Item -Path (Join-Path $root 'scripts\*') -Destination (Join-Path $stage 'scripts') -Recurse
Copy-Item -LiteralPath (Join-Path $root 'config\server-config.ps1.example') -Destination (Join-Path $stage 'config\server-config.ps1.example')
foreach ($file in @('start-intranet.ps1','DINGTALK_DEPLOYMENT.md','README.md')) { Copy-Item -LiteralPath (Join-Path $root $file) -Destination $stage }
Get-ChildItem -LiteralPath $stage -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force
Compress-Archive -LiteralPath $stage -DestinationPath $archive -CompressionLevel Optimal
Remove-Item -LiteralPath $stage -Recurse -Force
Write-Host $archive
