param([string]$Version = '0.6.2')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$python = if ($env:CERT_BUILD_PYTHON) { $env:CERT_BUILD_PYTHON } else { (Get-Command python -ErrorAction Stop).Source }
$env:PYTHONNOUSERSITE = '1'
& $python -c "import PyInstaller" 2>$null
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller is required on the development computer.' }

$work = Join-Path $root '.tmp\windows-update-build'
$dist = Join-Path $root '.tmp\windows-update-dist'
$releaseDir = Join-Path $root 'releases'
$packageName = "CertificationOps-Windows-Update-$Version"
$stage = Join-Path $releaseDir $packageName
$archive = "$stage.zip"

foreach ($path in @($work,$dist,$stage)) {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
}
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
if (Test-Path -LiteralPath "$archive.sha256") { Remove-Item -LiteralPath "$archive.sha256" -Force }
New-Item -ItemType Directory -Force -Path $releaseDir,$stage | Out-Null

& $python -m PyInstaller --noconfirm --clean --onedir --name CertificationOpsServer --distpath $dist --workpath $work --specpath $work (Join-Path $root 'server.py')
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller build failed.' }

$built = Join-Path $dist 'CertificationOpsServer'
Copy-Item -LiteralPath (Join-Path $built 'CertificationOpsServer.exe') -Destination $stage
Copy-Item -LiteralPath (Join-Path $built '_internal') -Destination $stage -Recurse
Copy-Item -LiteralPath (Join-Path $root 'static') -Destination $stage -Recurse
Copy-Item -LiteralPath (Join-Path $root 'scripts\Update-CertificationOps-Windows.ps1') -Destination $stage
Copy-Item -LiteralPath (Join-Path $root 'WINDOWS_UPDATE_GUIDE.md') -Destination $stage
Copy-Item -LiteralPath (Join-Path $root 'UPGRADE_AND_DATA_SAFETY.md') -Destination $stage
Copy-Item -LiteralPath (Join-Path $root 'CHANGELOG.zh.md') -Destination $stage
Copy-Item -LiteralPath (Join-Path $root 'LOGGING_AND_DIAGNOSTICS.md') -Destination $stage
[System.IO.File]::WriteAllText((Join-Path $stage 'VERSION'), "$Version`r`n", [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText(
    (Join-Path $stage 'PACKAGE_CONTENTS.txt'),
    "Windows portable incremental update. Contains the EXE, runtime, static site, updater, and guides. It does not contain data, config, backups, logs, or business data.`r`n",
    [System.Text.UTF8Encoding]::new($false)
)

Compress-Archive -LiteralPath $stage -DestinationPath $archive -CompressionLevel Optimal
$hash = Get-FileHash -LiteralPath $archive -Algorithm SHA256
[System.IO.File]::WriteAllText("$archive.sha256", "$($hash.Hash.ToLower())  $packageName.zip`r`n", [System.Text.UTF8Encoding]::new($false))
Remove-Item -LiteralPath $stage -Recurse -Force
Write-Host "Created: $archive"
Write-Host "SHA256: $($hash.Hash)"
