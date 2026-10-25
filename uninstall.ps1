$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'disable-auto.ps1')
& (Join-Path $PSScriptRoot 'stop.ps1')
$petHome = Join-Path $env:USERPROFILE '.dsh\dsh-pet'
$runtimeFile = Join-Path $petHome 'standalone-runtime.json'
$petRoot = $null
if (Test-Path -LiteralPath $runtimeFile) {
    $details = Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
    $petRoot = $details.pluginRoot
    try {
        Invoke-RestMethod "http://127.0.0.1:$($details.port)/shutdown" -Method Post -Headers @{'X-DSH-Pet-Token'=$details.token} -TimeoutSec 5 | Out-Null
    } catch { throw 'Could not stop dsh-pet. Stop the standalone service before restoring its configuration.' }
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (!(Test-Path -LiteralPath $runtimeFile)) { break }
        Start-Sleep -Milliseconds 200
    }
    if (Test-Path -LiteralPath $runtimeFile) { throw 'dsh-pet is still stopping. Try uninstall again after it exits.' }
}
if (!$petRoot) { $petRoot = if ($env:CODEX_PET_DSH_ROOT) { $env:CODEX_PET_DSH_ROOT } else { Join-Path ((& npm.cmd root -g).Trim()) 'dsh-pet' } }
$spriteBackup = Join-Path $PSScriptRoot 'backups\sprite.js.original'
if (Test-Path -LiteralPath $spriteBackup) { Copy-Item -LiteralPath $spriteBackup -Destination (Join-Path $petRoot 'runtime\electron-helper\sprite.js') -Force }
$aiBackup = Join-Path $petHome 'standalone-ai.before-codex.json'
$aiFile = Join-Path $petHome 'standalone-ai.json'
if (Test-Path -LiteralPath $aiBackup) { Copy-Item -LiteralPath $aiBackup -Destination $aiFile -Force }
elseif (Test-Path -LiteralPath $aiFile) {
    $settings = Get-Content -LiteralPath $aiFile -Raw | ConvertFrom-Json
    if ($settings.model -eq 'codex-local') {
        $settings.enabled = $false
        [IO.File]::WriteAllText($aiFile, ($settings | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
    }
}
Write-Output 'Integration stopped and original local settings restored where backups exist.'
Write-Output 'Source, runtime history and upstream packages have been kept. Start dsh-pet separately to use its original mode.'
