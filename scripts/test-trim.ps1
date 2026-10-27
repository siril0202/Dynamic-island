# scripts/test-trim.ps1
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Mem {
    [DllImport("psapi.dll")]
    public static extern int EmptyWorkingSet(IntPtr hwProc);
}
"@

$appDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$electronExe = Join-Path $appDir "node_modules\electron\dist\electron.exe"

$proc = Start-Process -FilePath $electronExe -ArgumentList "." -WorkingDirectory $appDir -PassThru
Start-Sleep -Seconds 6

$pids = @($proc.Id)
Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $proc.Id } | ForEach-Object { $pids += $_.ProcessId }

Write-Host "--- BEFORE TRIM ---"
$totalPWS = 0
foreach ($id in $pids) {
    $perf = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "IDProcess = $id" -ErrorAction SilentlyContinue
    if ($perf -and $perf.WorkingSetPrivate) {
        $pws = [Math]::Round($perf.WorkingSetPrivate / 1MB, 2)
        $totalPWS += $pws
        Write-Host "PID $id ($($perf.Name)): Private WS = $pws MB"
    }
}
Write-Host "Total Private WS BEFORE: $totalPWS MB`n"

# Empty working set for each process
foreach ($id in $pids) {
    try {
        $hProc = [System.Diagnostics.Process]::GetProcessById($id).Handle
        [Win32Mem]::EmptyWorkingSet($hProc) | Out-Null
    } catch {}
}

Start-Sleep -Seconds 2

Write-Host "--- AFTER TRIM ---"
$totalPWSAfter = 0
foreach ($id in $pids) {
    $perf = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "IDProcess = $id" -ErrorAction SilentlyContinue
    if ($perf -and $perf.WorkingSetPrivate) {
        $pws = [Math]::Round($perf.WorkingSetPrivate / 1MB, 2)
        $totalPWSAfter += $pws
        Write-Host "PID $id ($($perf.Name)): Private WS = $pws MB"
    }
}
Write-Host "Total Private WS AFTER: $totalPWSAfter MB"

Stop-Process -Id $proc.Id -Force
Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force
