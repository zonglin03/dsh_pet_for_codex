param([switch]$AutoStart, [string]$Workspace)
$ErrorActionPreference = 'Stop'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$nodeVersion = & $nodePath -p 'process.versions.node'
if ([version]$nodeVersion -lt [version]'22.12.0') { throw 'Node.js 22.12.0 or later is required.' }
Get-Command codex -ErrorAction Stop | Out-Null
$petRoot = if ($env:CODEX_PET_DSH_ROOT) { $env:CODEX_PET_DSH_ROOT } else { Join-Path ((& npm.cmd root -g).Trim()) 'dsh-pet' }
$petEntry = Join-Path $petRoot 'lib\standalone.js'
if (!(Test-Path -LiteralPath $petEntry)) {
    & npm.cmd install -g dsh-pet@0.3.8
    if ($LASTEXITCODE -ne 0) { throw 'dsh-pet installation failed.' }
}
& (Join-Path $PSScriptRoot 'start.ps1')
& $nodePath (Join-Path $PSScriptRoot 'bridge.mjs') --install-ui
if ($LASTEXITCODE -ne 0) { throw 'dsh-pet menu integration failed.' }
& $nodePath (Join-Path $PSScriptRoot 'install-codex.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Codex provider integration failed.' }
if ($Workspace) {
    $resolved = (Resolve-Path -LiteralPath $Workspace).Path
    if (!(Test-Path -LiteralPath $resolved -PathType Container)) { throw 'Workspace must be a directory.' }
    $stateFile = Join-Path $PSScriptRoot '.runtime\conversation.json'
    if (!(Test-Path -LiteralPath $stateFile)) {
        $json = @{threadId=$null;cwd=$resolved} | ConvertTo-Json
        [IO.File]::WriteAllText($stateFile, $json, (New-Object Text.UTF8Encoding($false)))
        Write-Output 'Workspace saved. Restarting bridge to apply.'
        & (Join-Path $PSScriptRoot 'stop.ps1')
        & (Join-Path $PSScriptRoot 'start.ps1')
    } else { Write-Output 'Existing conversation kept. Change its workspace in the Codex console.' }
}
if ($AutoStart) { & (Join-Path $PSScriptRoot 'enable-auto.ps1') }
Write-Output 'Installed. Right-click the pet to open the Codex console or send a task.'
