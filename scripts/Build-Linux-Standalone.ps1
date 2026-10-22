param([string]$Version = "0.8.0")

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $projectRoot "releases"
$packageName = "CertificationOps-Linux-Standalone-$Version"
$stageRoot = Join-Path $releaseRoot $packageName
$archivePath = Join-Path $releaseRoot "$packageName.tar.gz"
$sitePackages = Join-Path $projectRoot ".build-venv\Lib\site-packages"

if (-not (Test-Path (Join-Path $projectRoot "server.py"))) { throw "server.py not found in $projectRoot" }
if (-not (Test-Path $sitePackages)) { throw "Offline dependency directory not found: $sitePackages" }

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }

New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageRoot "static") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageRoot "vendor") | Out-Null

Copy-Item -LiteralPath (Join-Path $projectRoot "server.py") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "requirements.txt") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "LINUX_STANDALONE_UPDATE.md") -Destination $stageRoot
Copy-Item -Path (Join-Path $projectRoot "static\*") -Destination (Join-Path $stageRoot "static") -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "linux\start.sh") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "linux\stop.sh") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "linux\server.env.example") -Destination $stageRoot

foreach ($entry in @("openpyxl", "openpyxl-3.1.5.dist-info", "et_xmlfile", "et_xmlfile-2.0.0.dist-info")) {
    $source = Join-Path $sitePackages $entry
    if (-not (Test-Path -LiteralPath $source)) { throw "Required offline dependency missing: $source" }
    Copy-Item -LiteralPath $source -Destination (Join-Path $stageRoot "vendor") -Recurse
}

Get-ChildItem -LiteralPath (Join-Path $stageRoot "vendor") -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force
Get-ChildItem -LiteralPath (Join-Path $stageRoot "vendor") -Recurse -File -Filter "*.pyc" | Remove-Item -Force

[System.IO.File]::WriteAllText((Join-Path $stageRoot "VERSION"), "$Version`n", [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText(
    (Join-Path $stageRoot "PACKAGE_CONTENTS.txt"),
    "独立目录版程序包。包含 server.py、static、vendor、start.sh、stop.sh、server.env.example 和升级指引；不包含 data、backups、config 或任何业务数据。`n",
    [System.Text.UTF8Encoding]::new($false)
)

Get-ChildItem -LiteralPath $stageRoot -File | Where-Object { $_.Extension -in @(".sh", ".md", ".txt", ".example") -or $_.Name -eq "VERSION" } | ForEach-Object {
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
Write-Host "Size: $((Get-Item -LiteralPath $archivePath).Length) bytes"
Write-Host "SHA256: $($hash.Hash)"
