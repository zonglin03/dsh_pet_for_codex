$ErrorActionPreference = 'Stop'
$runtimeDir = Join-Path $PSScriptRoot '.runtime'
$pidFile = Join-Path $runtimeDir 'bridge.pid'
if (!(Test-Path -LiteralPath $pidFile)) { Write-Output 'Bridge is not running.'; exit 0 }
$bridgePid = [int](Get-Content -LiteralPath $pidFile -Raw)
$running = Get-CimInstance Win32_Process -Filter "ProcessId=$bridgePid" -ErrorAction SilentlyContinue
$bridgeFile = Join-Path $PSScriptRoot 'bridge.mjs'
if (!$running -or $running.CommandLine -notlike "*$bridgeFile*") { Write-Output 'Bridge is not running.'; exit 0 }
New-Item -ItemType File -Force -Path (Join-Path $runtimeDir 'stop') | Out-Null
for ($attempt = 0; $attempt -lt 8; $attempt++) {
    Start-Sleep -Seconds 1
    if (!(Test-Path -LiteralPath $pidFile)) { Write-Output 'Bridge stopped; pet returned to idle.'; exit 0 }
}
throw 'Bridge has not stopped yet. Check .runtime logs.'
