param(
    [string]$InstallDir = 'C:\CertificationOps',
    [string]$TaskName = 'CertificationOpsServer'
)

$ErrorActionPreference = 'Stop'
$isAdministrator = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdministrator) { throw 'Run PowerShell as Administrator, then run this updater again.' }
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = [System.IO.Path]::GetFullPath($InstallDir)
$targetRoot = [System.IO.Path]::GetPathRoot($target)
if ($target -eq $targetRoot) { throw 'InstallDir cannot be a drive root.' }

$targetExe = Join-Path $target 'CertificationOpsServer.exe'
$targetData = Join-Path $target 'data'
$targetDatabase = Join-Path $targetData 'certification.db'
if (-not (Test-Path -LiteralPath $targetExe)) { throw "CertificationOpsServer.exe was not found in: $target" }
if (-not (Test-Path -LiteralPath $targetDatabase)) { throw "Business database was not found: $targetDatabase" }
foreach ($forbidden in @('data','backups','config')) {
    if (Test-Path -LiteralPath (Join-Path $sourceRoot $forbidden)) { throw "The update package must not contain $forbidden." }
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rollback = Join-Path $target "rollback\program-$timestamp"
$scheduledTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$updated = $false

function Stop-CertificationOps {
    if ($scheduledTask) { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
    Get-Process -Name 'CertificationOpsServer' -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 1
}

function Start-CertificationOps {
    if ($scheduledTask) {
        Start-ScheduledTask -TaskName $TaskName
    } else {
        Start-Process -FilePath 'powershell.exe' -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $target 'start-intranet.ps1')
        ) -WorkingDirectory $target -WindowStyle Hidden
    }
}

try {
    Write-Host '1/7 Creating a business-data backup...'
    & $targetExe --backup | Write-Host
    if ($LASTEXITCODE -ne 0) { throw 'Business-data backup failed. The update was not applied.' }

    Write-Host '2/7 Stopping the service...'
    Stop-CertificationOps

    Write-Host "3/7 Saving the previous program to $rollback"
    New-Item -ItemType Directory -Force -Path $rollback | Out-Null
    foreach ($item in @('CertificationOpsServer.exe','_internal','static','start-intranet.ps1','VERSION')) {
        $existing = Join-Path $target $item
        if (Test-Path -LiteralPath $existing) { Copy-Item -LiteralPath $existing -Destination $rollback -Recurse -Force }
    }
    $updated = $true

    Write-Host '4/7 Installing program files only. Business data and configuration are preserved...'
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'CertificationOpsServer.exe') -Destination $targetExe -Force
    foreach ($directory in @('_internal','static')) {
        $destination = Join-Path $target $directory
        if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Recurse -Force }
        Copy-Item -LiteralPath (Join-Path $sourceRoot $directory) -Destination $target -Recurse -Force
    }
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'VERSION') -Destination (Join-Path $target 'VERSION') -Force

    Write-Host '5/7 Starting the service...'
    Start-CertificationOps
    Start-Sleep -Seconds 3

    Write-Host '6/7 Checking the process...'
    if (-not (Get-Process -Name 'CertificationOpsServer' -ErrorAction SilentlyContinue)) {
        throw 'The updated service process did not start.'
    }

    Write-Host '7/7 Complete.'
    $updated = $false
    Write-Host "Update succeeded. Previous program: $rollback"
    Write-Host 'The database, scores, attachments, configuration, and backups were preserved.'
    Write-Host 'Open the results dashboard and verify individual and batch Excel exports.'
}
catch {
    Write-Error $_
    if ($updated -and (Test-Path -LiteralPath $rollback)) {
        Write-Host 'Restoring the previous program automatically...'
        Stop-CertificationOps
        foreach ($directory in @('_internal','static')) {
            $destination = Join-Path $target $directory
            if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Recurse -Force }
        }
        foreach ($item in @('CertificationOpsServer.exe','_internal','static','start-intranet.ps1','VERSION')) {
            $oldItem = Join-Path $rollback $item
            if (Test-Path -LiteralPath $oldItem) { Copy-Item -LiteralPath $oldItem -Destination $target -Recurse -Force }
        }
        Start-CertificationOps
        Write-Host 'The previous program was restored.'
    }
    exit 1
}
