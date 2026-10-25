$ErrorActionPreference = 'Stop'
$runtimeDir = Join-Path $PSScriptRoot '.runtime'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$watcher = Join-Path $PSScriptRoot 'auto-bridge.mjs'
$pidFile = Join-Path $runtimeDir 'auto.pid'
if (Test-Path -LiteralPath $pidFile) {
    $watcherPid = [int](Get-Content -LiteralPath $pidFile -Raw)
    $running = Get-CimInstance Win32_Process -Filter "ProcessId=$watcherPid" -ErrorAction SilentlyContinue
    if ($running -and $running.CommandLine -like "*$watcher*") { Write-Output 'Auto bridge listener is already running.'; exit 0 }
}
$nodePath = (Get-Command node -ErrorAction Stop).Source
$process = Start-Process -FilePath $nodePath -ArgumentList @('"' + $watcher + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'auto.log') -RedirectStandardError (Join-Path $runtimeDir 'auto-error.log')
Start-Sleep -Seconds 1
if ($process.HasExited) { throw 'Auto listener exited. Check .runtime/auto-error.log' }
Write-Output "Auto bridge listener started (PID $($process.Id))."
