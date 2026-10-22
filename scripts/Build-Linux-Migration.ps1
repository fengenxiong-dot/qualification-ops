param([string]$Version = '0.7.0')

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $projectRoot 'releases'
$packageName = "CertificationOps-Linux-Migration-$Version"
$stageRoot = Join-Path $releaseRoot $packageName
$archivePath = Join-Path $releaseRoot "$packageName.tar.gz"
$sitePackages = Join-Path $projectRoot '.portable-build-venv\Lib\site-packages'

foreach ($path in @($stageRoot,$archivePath,"$archivePath.sha256")) {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
}
New-Item -ItemType Directory -Force -Path $stageRoot,(Join-Path $stageRoot 'static'),(Join-Path $stageRoot 'vendor') | Out-Null

foreach ($file in @(
    'server.py','requirements.txt','VERSION','CHANGELOG.zh.md','WINDOWS_TO_LINUX_MIGRATION.md',
    'LINUX_DEPLOYMENT.md','UPGRADE_AND_DATA_SAFETY.md','LOGGING_AND_DIAGNOSTICS.md'
)) { Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $stageRoot }
Copy-Item -Path (Join-Path $projectRoot 'static\*') -Destination (Join-Path $stageRoot 'static') -Recurse
foreach ($file in @(
    'install.sh','start.sh','migrate-from-windows.sh','certification-ops.service',
    'certification-ops-backup.service','certification-ops-backup.timer','server.env.example'
)) { Copy-Item -LiteralPath (Join-Path $projectRoot "linux\$file") -Destination $stageRoot }
Copy-Item -LiteralPath (Join-Path $projectRoot 'scripts\Export-Windows-DataForLinux.ps1') -Destination $stageRoot

foreach ($entry in @('openpyxl','openpyxl-3.1.5.dist-info','et_xmlfile','et_xmlfile-2.0.0.dist-info')) {
    $source = Join-Path $sitePackages $entry
    if (-not (Test-Path -LiteralPath $source)) { throw "Required offline dependency missing: $source" }
    Copy-Item -LiteralPath $source -Destination (Join-Path $stageRoot 'vendor') -Recurse
}

[IO.File]::WriteAllText((Join-Path $stageRoot 'VERSION'), "$Version`n", [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $stageRoot 'PACKAGE_CONTENTS.txt'), "Linux原生程序与Windows业务数据迁移工具；不包含任何业务数据、数据库、附件、日志或生产配置。`n", [Text.UTF8Encoding]::new($false))

Get-ChildItem -LiteralPath $stageRoot -Recurse -File | Where-Object {
    $_.Extension -in @('.sh','.service','.timer','.example','.md','.txt','.ps1') -or $_.Name -eq 'VERSION'
} | ForEach-Object {
    $content = [IO.File]::ReadAllText($_.FullName).Replace("`r`n","`n")
    [IO.File]::WriteAllText($_.FullName,$content,[Text.UTF8Encoding]::new($false))
}

Get-ChildItem -LiteralPath $stageRoot -Recurse -File | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($stageRoot.Length + 1).Replace('\','/')
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower()
    "$hash  $relative"
} | Set-Content -LiteralPath (Join-Path $stageRoot 'PACKAGE_MANIFEST.sha256') -Encoding utf8

foreach ($forbidden in @('data','logs','backups','config')) {
    if (Test-Path -LiteralPath (Join-Path $stageRoot $forbidden)) { throw "Package must not contain $forbidden" }
}
Push-Location $releaseRoot
try {
    & tar -czf "$packageName.tar.gz" $packageName
    if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
}
finally { Pop-Location }

$hash = Get-FileHash -LiteralPath $archivePath -Algorithm SHA256
[IO.File]::WriteAllText("$archivePath.sha256", "$($hash.Hash.ToLower())  $packageName.tar.gz`n", [Text.UTF8Encoding]::new($false))
Remove-Item -LiteralPath $stageRoot -Recurse -Force
Write-Host "Created: $archivePath"
Write-Host "SHA256: $($hash.Hash)"
