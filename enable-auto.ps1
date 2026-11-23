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
try {
    $taskName = 'Codex dsh-pet auto bridge'
    $action = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $psPath + '" -Wait') -WorkingDirectory $PSScriptRoot
    $userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
    $trigger.Delay = 'PT30S'
    $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Listen for Codex Show Mini and recover dsh-pet services when needed.' -Force | Out-Null
} catch {
    Write-Warning ('Scheduled logon task unavailable; using the Startup shortcut: ' + $_.Exception.Message)
    & $psPath
    exit 0
}
# Replace the previous shortcut only after the logon task is registered.
Remove-Item -LiteralPath (Join-Path $startup 'Codex dsh-pet auto bridge.lnk')
$pidFile = Join-Path $runtimeDir 'auto.pid'
if (Test-Path -LiteralPath $pidFile) {
    New-Item -ItemType File -Force -Path (Join-Path $runtimeDir 'auto-stop') | Out-Null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if (!(Test-Path -LiteralPath $pidFile)) { break }
        Start-Sleep -Milliseconds 500
    }
}
Start-ScheduledTask -TaskName $taskName
Write-Output 'Enabled: delayed logon task with listener restart on failure.'
