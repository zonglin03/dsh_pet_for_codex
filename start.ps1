$ErrorActionPreference = 'Stop'
$bridgeFile = Join-Path $PSScriptRoot 'bridge.mjs'
$runtimeDir = Join-Path $PSScriptRoot '.runtime'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$nodePath = (Get-Command node -ErrorAction Stop).Source
$petRuntimeFile = Join-Path $env:USERPROFILE '.dsh\dsh-pet\standalone-runtime.json'
function Test-PetService {
    try {
        $details = Get-Content -LiteralPath $petRuntimeFile -Raw | ConvertFrom-Json
        $health = Invoke-RestMethod "http://127.0.0.1:$($details.port)/health" -TimeoutSec 2
        return ($health.name -eq 'dsh-pet-standalone' -and $health.pid -eq $details.pid)
    } catch { return $false }
}
if (!(Test-PetService)) {
    $petRoot = if ($env:CODEX_PET_DSH_ROOT) { $env:CODEX_PET_DSH_ROOT } else { Join-Path $env:APPDATA 'npm\node_modules\dsh-pet' }
    if (!(Test-Path -LiteralPath $petRoot)) { $petRoot = Join-Path ((& npm.cmd root -g).Trim()) 'dsh-pet' }
    $petEntry = Join-Path $petRoot 'lib\standalone.js'
    if (!(Test-Path -LiteralPath $petEntry)) { throw "Installed dsh-pet was not found: $petEntry" }
    Start-Process -FilePath $nodePath -ArgumentList @('"' + $petEntry + '"') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'pet.log') -RedirectStandardError (Join-Path $runtimeDir 'pet-error.log') | Out-Null
    $petReady = $false
    for ($attempt = 0; $attempt -lt 25; $attempt++) {
        Start-Sleep -Milliseconds 400
        if (Test-PetService) { $petReady = $true; break }
    }
    if (!$petReady) { throw "dsh-pet did not become ready. Check $runtimeDir\pet-error.log" }
    Write-Output 'dsh-pet started.'
}
$pidFile = Join-Path $runtimeDir 'bridge.pid'
if (Test-Path -LiteralPath $pidFile) {
    $bridgePid = [int](Get-Content -LiteralPath $pidFile -Raw)
    $running = Get-CimInstance Win32_Process -Filter "ProcessId=$bridgePid" -ErrorAction SilentlyContinue
    if ($running -and $running.CommandLine -like "*$bridgeFile*") {
        Write-Output "Codex pet bridge is already running (PID $bridgePid)."
        exit 0
    }
}
$process = Start-Process -FilePath $nodePath -ArgumentList @('"' + $bridgeFile + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'bridge.log') -RedirectStandardError (Join-Path $runtimeDir 'bridge-error.log')
Start-Sleep -Seconds 2
if ($process.HasExited) { throw "Bridge exited. Check $runtimeDir\bridge.log and bridge-error.log" }
Write-Output "Codex pet bridge started (PID $($process.Id))."
