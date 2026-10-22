param(
    [string]$InstallDir = 'C:\CertificationOps',
    [string]$OutputDir = "$env:USERPROFILE\Desktop",
    [string]$TaskName = 'CertificationOpsServer'
)

$ErrorActionPreference = 'Stop'
$target = [IO.Path]::GetFullPath($InstallDir)
$exe = Join-Path $target 'CertificationOpsServer.exe'
$database = Join-Path $target 'data\certification.db'
if (-not (Test-Path -LiteralPath $exe)) { throw "未找到程序：$exe" }
if (-not (Test-Path -LiteralPath $database)) { throw "未找到业务数据库：$database" }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '1/4 正在生成一致性业务备份……'
$before = @(Get-ChildItem -LiteralPath (Join-Path $target 'backups') -Filter 'certification-backup-*.zip' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
Push-Location $target
try {
    & $exe --backup | Write-Host
    if ($LASTEXITCODE -ne 0) { throw '业务备份失败，迁移包未生成。' }
}
finally { Pop-Location }

$backup = Get-ChildItem -LiteralPath (Join-Path $target 'backups') -Filter 'certification-backup-*.zip' |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $backup) { throw '程序未生成备份文件。' }

Write-Host '2/4 正在复制迁移数据……'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$output = Join-Path ([IO.Path]::GetFullPath($OutputDir)) "CertificationOps-Windows-Data-$stamp.zip"
Copy-Item -LiteralPath $backup.FullName -Destination $output -Force

Write-Host '3/4 正在校验ZIP内容……'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($output)
try {
    $names = @($archive.Entries | Select-Object -ExpandProperty FullName)
    if ('data/certification.db' -notin $names) { throw '迁移包缺少data/certification.db。' }
    $unsafe = @($names | Where-Object { $_ -match '(^|/)\.\.(/|$)|^/' })
    if ($unsafe.Count) { throw '迁移包包含不安全路径。' }
}
finally { $archive.Dispose() }

Write-Host '4/4 正在生成SHA-256……'
$hash = Get-FileHash -LiteralPath $output -Algorithm SHA256
$hashFile = "$output.sha256"
[IO.File]::WriteAllText($hashFile, "$($hash.Hash.ToLower())  $([IO.Path]::GetFileName($output))`r`n", [Text.UTF8Encoding]::new($false))
Write-Host "迁移数据包：$output"
Write-Host "校验文件：$hashFile"
Write-Host "SHA256：$($hash.Hash)"
Write-Host '原Windows系统和数据没有被删除。确认Linux验证通过前，请保持虚拟机不变。'
