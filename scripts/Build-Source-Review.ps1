param([string]$Version = '0.6.2')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$releaseDir = Join-Path $root 'releases'
$packageName = "CertificationOps-Source-Review-$Version"
$stage = Join-Path $releaseDir $packageName
$archive = "$stage.zip"

foreach ($path in @($stage,$archive,"$archive.sha256")) {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
}
New-Item -ItemType Directory -Force -Path $stage | Out-Null

foreach ($file in @(
    'server.py','requirements.txt','README.md','VERSION','CHANGELOG.zh.md',
    'SOURCE_REVIEW_GUIDE.md','LOGGING_AND_DIAGNOSTICS.md','UPGRADE_AND_DATA_SAFETY.md',
    'WINDOWS_UPDATE_GUIDE.md','DINGTALK_DEPLOYMENT.md'
)) {
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination $stage
}
foreach ($directory in @('static','scripts','tests')) {
    Copy-Item -LiteralPath (Join-Path $root $directory) -Destination $stage -Recurse
}
$cacheDirectories = @(Get-ChildItem -LiteralPath $stage -Recurse -Directory | Where-Object { $_.Name -eq '__pycache__' })
foreach ($cacheDirectory in $cacheDirectories) { Remove-Item -LiteralPath $cacheDirectory.FullName -Recurse -Force }
$compiledFiles = @(Get-ChildItem -LiteralPath $stage -Recurse -File | Where-Object { $_.Extension -in @('.pyc','.pyo') })
foreach ($compiledFile in $compiledFiles) { Remove-Item -LiteralPath $compiledFile.FullName -Force }
if (Test-Path -LiteralPath (Join-Path $root 'config\server-config.ps1.example')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $stage 'config') | Out-Null
    Copy-Item -LiteralPath (Join-Path $root 'config\server-config.ps1.example') -Destination (Join-Path $stage 'config')
}

Get-ChildItem -LiteralPath $stage -Recurse -File | Where-Object {
    $_.Extension -in @('.py','.js','.css','.html','.ps1','.md','.txt','.xlsx') -or $_.Name -in @('VERSION','requirements.txt')
} | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($stage.Length + 1).Replace('\','/')
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower()
    "$hash  $relative"
} | Set-Content -LiteralPath (Join-Path $stage 'SOURCE_MANIFEST.sha256') -Encoding utf8

foreach ($forbidden in @('data','logs','backups','releases','.tmp','.git')) {
    if (Test-Path -LiteralPath (Join-Path $stage $forbidden)) { throw "Forbidden review-package content: $forbidden" }
}
Compress-Archive -LiteralPath $stage -DestinationPath $archive -CompressionLevel Optimal
$hash = Get-FileHash -LiteralPath $archive -Algorithm SHA256
[IO.File]::WriteAllText("$archive.sha256", "$($hash.Hash.ToLower())  $packageName.zip`r`n", [Text.UTF8Encoding]::new($false))
Remove-Item -LiteralPath $stage -Recurse -Force
Write-Host "Created: $archive"
Write-Host "SHA256: $($hash.Hash)"
