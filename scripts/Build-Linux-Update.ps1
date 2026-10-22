param([string]$Version = "0.5.0")

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $projectRoot "releases"
$packageName = "CertificationOps-Linux-Update-$Version"
$stageRoot = Join-Path $releaseRoot $packageName
$archivePath = Join-Path $releaseRoot "$packageName.tar.gz"

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }

New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageRoot "static") | Out-Null

Copy-Item -LiteralPath (Join-Path $projectRoot "server.py") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "requirements.txt") -Destination $stageRoot
Copy-Item -Path (Join-Path $projectRoot "static\*") -Destination (Join-Path $stageRoot "static") -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "linux\update.sh") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "LINUX_UPDATE_GUIDE.md") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "UPGRADE_AND_DATA_SAFETY.md") -Destination $stageRoot

[System.IO.File]::WriteAllText((Join-Path $stageRoot "VERSION"), "$Version`n", [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText(
    (Join-Path $stageRoot "PACKAGE_CONTENTS.txt"),
    "程序增量更新包。包含 server.py、static、requirements.txt、更新脚本和说明；不包含 data、backups、config 或任何业务数据。`n",
    [System.Text.UTF8Encoding]::new($false)
)

Get-ChildItem -LiteralPath $stageRoot -File | Where-Object { $_.Extension -in @(".sh", ".md", ".txt") -or $_.Name -eq "VERSION" } | ForEach-Object {
    $content = [System.IO.File]::ReadAllText($_.FullName).Replace("`r`n", "`n")
    [System.IO.File]::WriteAllText($_.FullName, $content, [System.Text.UTF8Encoding]::new($false))
}

Push-Location $releaseRoot
try {
    & tar -czf "$packageName.tar.gz" $packageName
    if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
}
finally { Pop-Location }

$hash = Get-FileHash -LiteralPath $archivePath -Algorithm SHA256
[System.IO.File]::WriteAllText("$archivePath.sha256", "$($hash.Hash.ToLower())  $packageName.tar.gz`n", [System.Text.UTF8Encoding]::new($false))
Write-Host "Created: $archivePath"
Write-Host "SHA256: $($hash.Hash)"
