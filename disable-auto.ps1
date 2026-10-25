$ErrorActionPreference = 'Stop'
$shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'Codex dsh-pet auto bridge.lnk'
if (Test-Path -LiteralPath $shortcut) { Remove-Item -LiteralPath $shortcut }
$runtimeDir = Join-Path $PSScriptRoot '.runtime'
if (Test-Path -LiteralPath (Join-Path $runtimeDir 'auto.pid')) {
    New-Item -ItemType File -Force -Path (Join-Path $runtimeDir 'auto-stop') | Out-Null
}
Write-Output 'Automatic listener disabled. Existing pet and bridge continue running.'
