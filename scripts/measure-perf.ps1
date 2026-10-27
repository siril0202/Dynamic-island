# scripts/measure-perf.ps1
param(
    [int]$DurationSec = 30,
    [int]$IntervalSec = 5,
    [string]$Label = "Baseline",
    [switch]$KeepOpen = $false
)

$ErrorActionPreference = "Stop"
$appDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$electronExe = Join-Path $appDir "node_modules\electron\dist\electron.exe"

if (-not (Test-Path $electronExe)) {
    Write-Error "Electron binary not found at $electronExe. Run npm install first."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Dynamic Island Performance Monitor: $Label" -ForegroundColor Cyan
Write-Host " OS: $([System.Environment]::OSVersion.VersionString)" -ForegroundColor DarkGray
Write-Host " Electron: $electronExe" -ForegroundColor DarkGray
Write-Host " App Directory: $appDir" -ForegroundColor DarkGray
Write-Host " Duration: $DurationSec s | Sample Interval: $IntervalSec s" -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor Cyan

# Launch Electron directly
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $electronExe
$psi.Arguments = "."
$psi.WorkingDirectory = $appDir
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $false
$psi.RedirectStandardError = $false

$rootProcess = [System.Diagnostics.Process]::Start($psi)
$startupTimeMs = $sw.ElapsedMilliseconds
Write-Host "[+] Launched root process PID: $($rootProcess.Id) (took ${startupTimeMs}ms to spawn)" -ForegroundColor Green

function Get-TreePids ($rootPid) {
    $pids = @($rootPid)
    $allProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
    $lookup = @{}
    foreach ($proc in $allProcesses) {
        $ppid = [int]$proc.ParentProcessId
        $pidNum = [int]$proc.ProcessId
        if (-not $lookup.ContainsKey($ppid)) {
            $lookup[$ppid] = [System.Collections.Generic.List[int]]::new()
        }
        $lookup[$ppid].Add($pidNum)
    }

    $queue = [System.Collections.Generic.Queue[int]]::new()
    $queue.Enqueue($rootPid)

    while ($queue.Count -gt 0) {
        $curr = $queue.Dequeue()
        if ($lookup.ContainsKey($curr)) {
            foreach ($child in $lookup[$curr]) {
                if (-not $pids.Contains($child)) {
                    $pids += $child
                    $queue.Enqueue($child)
                }
            }
        }
    }

    return $pids
}

$snapshots = [System.Collections.Generic.List[PSObject]]::new()
$startTime = [DateTime]::UtcNow
$endTime = $startTime.AddSeconds($DurationSec)
$sampleIndex = 0

try {
    while ([DateTime]::UtcNow -lt $endTime) {
        if ($rootProcess.HasExited) {
            Write-Warning "Root process exited prematurely!"
            break
        }

        $sampleIndex++
        $elapsedSec = [Math]::Round(([DateTime]::UtcNow - $startTime).TotalSeconds, 1)
        $treePids = Get-TreePids $rootProcess.Id

        # Query process memory and CPU
        $totalWS = 0
        $totalPrivateWS = 0
        $totalCommit = 0
        $totalCpu = 0
        $procDetails = @()

        foreach ($pidNum in $treePids) {
            try {
                $p = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
                if (-not $p) { continue }

                $wsMB = [Math]::Round($p.WorkingSet64 / 1MB, 2)
                $commitMB = [Math]::Round($p.PrivateMemorySize64 / 1MB, 2)

                # Try to get Private Working Set and CPU from PerfCounter / WMI
                $pwsMB = $commitMB # Default conservative fallback
                $cpuPct = 0.0
                try {
                    $perf = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "IDProcess = $pidNum" -ErrorAction SilentlyContinue
                    if ($perf) {
                        if ($perf.WorkingSetPrivate) {
                            $pwsMB = [Math]::Round($perf.WorkingSetPrivate / 1MB, 2)
                        }
                        if ($perf.PercentProcessorTime) {
                            $cpuPct = [Math]::Round([double]$perf.PercentProcessorTime / [System.Environment]::ProcessorCount, 1)
                        }
                    }
                } catch {}

                # Role / type heuristic
                $role = "Electron"
                if ($p.ProcessName -like "*powershell*") {
                    $role = "PowerShell-Child"
                } else {
                    try {
                        $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $pidNum" -ErrorAction SilentlyContinue).CommandLine
                        if ($cmd -match "--type=([^ ]+)") {
                            $role = $Matches[1]
                        } elseif ($pidNum -eq $rootProcess.Id) {
                            $role = "main-browser"
                        }
                    } catch {}
                }

                $totalWS += $wsMB
                $totalPrivateWS += $pwsMB
                $totalCommit += $commitMB
                $totalCpu += $cpuPct

                $procDetails += [PSCustomObject]@{
                    PID       = $pidNum
                    Name      = $p.ProcessName
                    Role      = $role
                    WS_MB     = $wsMB
                    PWS_MB    = $pwsMB
                    Commit_MB = $commitMB
                    CPU_Pct   = $cpuPct
                }
            } catch {}
        }

        $snapshot = [PSCustomObject]@{
            Sample       = $sampleIndex
            ElapsedSec   = $elapsedSec
            ProcessCount = $procDetails.Count
            TotalWS_MB   = [Math]::Round($totalWS, 2)
            TotalPWS_MB  = [Math]::Round($totalPrivateWS, 2)
            TotalCommit  = [Math]::Round($totalCommit, 2)
            TotalCpu     = [Math]::Round($totalCpu, 1)
            Processes    = $procDetails
        }
        $snapshots.Add($snapshot)

        Write-Host "[$elapsedSec s] Procs: $($procDetails.Count) | Private WS: ${totalPrivateWS} MB | Total WS: ${totalWS} MB | Commit: ${totalCommit} MB | CPU: ${totalCpu}%" -ForegroundColor Yellow

        # Detail lines
        foreach ($pd in $procDetails) {
            Write-Host "   -> PID $($pd.PID) [$($pd.Role)]: PrivateWS=$($pd.PWS_MB) MB | WS=$($pd.WS_MB) MB | Commit=$($pd.Commit_MB) MB | CPU=$($pd.CPU_Pct)%" -ForegroundColor DarkGray
        }

        Start-Sleep -Seconds $IntervalSec
    }
} finally {
    if (-not $KeepOpen) {
        Write-Host "`nStopping process tree..." -ForegroundColor Cyan
        $treePids = Get-TreePids $rootProcess.Id
        foreach ($pidNum in $treePids) {
            try {
                Stop-Process -Id $pidNum -Force -ErrorAction SilentlyContinue
            } catch {}
        }
    }
}

Write-Host "`n================== BENCHMARK SUMMARY ($Label) ==================" -ForegroundColor Green
if ($snapshots.Count -gt 0) {
    $first = $snapshots[0]
    $last = $snapshots[$snapshots.Count - 1]
    $avgPWS = [Math]::Round(($snapshots | Measure-Object -Property TotalPWS_MB -Average).Average, 2)
    $avgWS = [Math]::Round(($snapshots | Measure-Object -Property TotalWS_MB -Average).Average, 2)
    $avgCommit = [Math]::Round(($snapshots | Measure-Object -Property TotalCommit -Average).Average, 2)
    $avgCpu = [Math]::Round(($snapshots | Measure-Object -Property TotalCpu -Average).Average, 1)

    Write-Host "Startup Time (spawn): ${startupTimeMs} ms"
    Write-Host "Immediate (T=0)  - Private WS: $($first.TotalPWS_MB) MB | Total WS: $($first.TotalWS_MB) MB | Commit: $($first.TotalCommit) MB | CPU: $($first.TotalCpu)%"
    Write-Host "Final ($($last.ElapsedSec)s)   - Private WS: $($last.TotalPWS_MB) MB | Total WS: $($last.TotalWS_MB) MB | Commit: $($last.TotalCommit) MB | CPU: $($last.TotalCpu)%"
    Write-Host "Average over run - Private WS: ${avgPWS} MB | Total WS: ${avgWS} MB | Commit: ${avgCommit} MB | Avg CPU: ${avgCpu}%"
}
Write-Host "================================================================" -ForegroundColor Green
