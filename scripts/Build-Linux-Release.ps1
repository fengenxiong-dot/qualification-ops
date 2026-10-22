param(
    [string]$Version = "0.4.0"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $projectRoot "releases"
$packageName = "CertificationOps-Linux-$Version"
$stageRoot = Join-Path $releaseRoot $packageName
$archivePath = Join-Path $releaseRoot "$packageName.tar.gz"
$sitePackages = Join-Path $projectRoot ".portable-build-venv\Lib\site-packages"

if (-not (Test-Path (Join-Path $projectRoot "server.py"))) {
    throw "server.py not found in $projectRoot"
}
if (-not (Test-Path $sitePackages)) {
    throw "Portable dependency directory not found: $sitePackages"
}

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
if (Test-Path $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
if (Test-Path $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}

New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageRoot "static") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageRoot "vendor") | Out-Null

Copy-Item -LiteralPath (Join-Path $projectRoot "server.py") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "requirements.txt") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "LINUX_DEPLOYMENT.md") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "UPGRADE_AND_DATA_SAFETY.md") -Destination $stageRoot
Copy-Item -Path (Join-Path $projectRoot "static\*") -Destination (Join-Path $stageRoot "static") -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "linux\install.sh") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "linux\start.sh") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "linux\certification-ops.service") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "linux\certification-ops-backup.service") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "linux\certification-ops-backup.timer") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "linux\server.env.example") -Destination $stageRoot

$vendorEntries = @(
    "openpyxl",
    "openpyxl-3.1.5.dist-info",
    "et_xmlfile",
    "et_xmlfile-2.0.0.dist-info"
)
foreach ($entry in $vendorEntries) {
    $source = Join-Path $sitePackages $entry
    if (-not (Test-Path $source)) {
        throw "Required offline dependency missing: $source"
    }
    Copy-Item -LiteralPath $source -Destination (Join-Path $stageRoot "vendor") -Recurse
}

[System.IO.File]::WriteAllText(
    (Join-Path $stageRoot "VERSION"),
    "$Version`n",
    [System.Text.UTF8Encoding]::new($false)
)

$unixTextFiles = Get-ChildItem -LiteralPath $stageRoot -File | Where-Object {
    $_.Extension -in @(".sh", ".service", ".timer", ".example")
}
foreach ($file in $unixTextFiles) {
    $content = [System.IO.File]::ReadAllText($file.FullName)
    $content = $content.Replace("`r`n", "`n")
    [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.UTF8Encoding]::new($false))
}

Push-Location $releaseRoot
try {
    & tar -czf "$packageName.tar.gz" $packageName
    if ($LASTEXITCODE -ne 0) {
        throw "tar failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

$archive = Get-Item -LiteralPath $archivePath
$hash = Get-FileHash -LiteralPath $archivePath -Algorithm SHA256
Write-Host "Created: $($archive.FullName)"
Write-Host "Size: $($archive.Length) bytes"
Write-Host "SHA256: $($hash.Hash)"
