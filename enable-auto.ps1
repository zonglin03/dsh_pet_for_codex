$ErrorActionPreference = 'Stop'
$runtimeDir = Join-Path $PSScriptRoot '.runtime'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$nodePath = (Get-Command node -ErrorAction Stop).Source
$watcher = Join-Path $PSScriptRoot 'auto-bridge.mjs'
$launcher = Join-Path $PSScriptRoot 'auto-launch.vbs'
$psPath = Join-Path $PSScriptRoot 'start-auto.ps1'
$command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $psPath + '"'
$vbs = 'CreateObject("WScript.Shell").Run "' + $command.Replace('"', '""') + '", 0, False'
Set-Content -LiteralPath $launcher -Value $vbs -Encoding Unicode
$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path $startup 'Codex dsh-pet auto bridge.lnk'))
$link.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$link.Arguments = '"' + $launcher + '"'
$link.WorkingDirectory = $PSScriptRoot
$link.Description = 'Start dsh-pet and its bridge when Codex Show pet is enabled'
$link.Save()
& $psPath
Write-Output 'Enabled: Codex Show pet automatically starts dsh-pet and bridge; listener starts at user login.'
