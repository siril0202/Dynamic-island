# scripts/test-procs.ps1
$appDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$electronExe = Join-Path $appDir "node_modules\electron\dist\electron.exe"

$proc = Start-Process -FilePath $electronExe -ArgumentList "." -WorkingDirectory $appDir -PassThru
Start-Sleep -Seconds 4

Write-Host "Started PID: $($proc.Id)"
Get-CimInstance Win32_Process | Where-Object { $_.Name -like "*electron*" -or $_.Name -like "*powershell*" } | ForEach-Object {
    [PSCustomObject]@{
        PID = $_.ProcessId
        PPID = $_.ParentProcessId
        Name = $_.Name
        CommandLine = ($_.CommandLine -split " ")[0..3] -join " "
    }
} | Format-Table -AutoSize

Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force
