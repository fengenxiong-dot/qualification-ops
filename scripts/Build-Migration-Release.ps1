param([string]$Version = (Get-Date -Format 'yyyy.MM.dd-HHmm'))
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$portableVersion = "$Version-program"
& (Join-Path $root 'scripts\Build-Portable-Release.ps1') -Version $portableVersion

$releaseDir = Join-Path $root 'releases'
$portableArchive = Join-Path $releaseDir "CertificationOps-Portable-$portableVersion.zip"
$work = Join-Path $root '.tmp\migration-release'
$stage = Join-Path $releaseDir "CertificationOps-Migration-$Version"
$archive = "$stage.zip"
foreach ($path in @($work,$stage)) {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
}
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
New-Item -ItemType Directory -Force -Path $work | Out-Null
Expand-Archive -LiteralPath $portableArchive -DestinationPath $work -Force
$expandedRoot = Get-ChildItem -LiteralPath $work -Directory | Select-Object -First 1
Move-Item -LiteralPath $expandedRoot.FullName -Destination $stage

$snapshot = Join-Path $stage 'data-snapshot'
New-Item -ItemType Directory -Force -Path $snapshot | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'data\certification.db') -Destination $snapshot
Copy-Item -LiteralPath (Join-Path $root 'data\submissions') -Destination $snapshot -Recurse

$manifest = [ordered]@{
    version = $Version
    createdAt = (Get-Date).ToString('o')
    includesBusinessData = $true
    source = 'current local certification database and imported submissions'
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'data-snapshot\manifest.json') -Encoding UTF8
Compress-Archive -LiteralPath $stage -DestinationPath $archive -CompressionLevel Optimal
Remove-Item -LiteralPath $work -Recurse -Force
Remove-Item -LiteralPath $stage -Recurse -Force
Remove-Item -LiteralPath $portableArchive -Force
Write-Host $archive
