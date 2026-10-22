$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$configFile = Join-Path $root 'config\server-config.ps1'
if (Test-Path -LiteralPath $configFile) { . $configFile }

if (-not $env:CERT_HOST) { $env:CERT_HOST = '127.0.0.1' }
if (-not $env:CERT_PORT) { $env:CERT_PORT = '8787' }
if (-not $env:CERT_BASE_URL) { $env:CERT_BASE_URL = "http://127.0.0.1:$($env:CERT_PORT)" }
if (-not $env:CERT_DINGTALK_MODE) { $env:CERT_DINGTALK_MODE = 'mock' }

$portableServer = Join-Path $root 'CertificationOpsServer.exe'
if (Test-Path -LiteralPath $portableServer) {
    & $portableServer
} else {
    $bundledPython = Join-Path $root '.venv\Scripts\python.exe'
    $python = if (Test-Path -LiteralPath $bundledPython) { $bundledPython } else { 'python' }
    & $python (Join-Path $root 'server.py')
}
