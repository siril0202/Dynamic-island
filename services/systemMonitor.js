const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PS_MONITOR_PATH = path.join(os.tmpdir(), 'codewithsiril_system_monitor.ps1');

const PS_MONITOR_CONTENT = [
  'Add-Type -TypeDefinition @"',
  'using System;',
  'using System.Runtime.InteropServices;',
  '',
  'public class SystemWatcher {',
  '    [DllImport("user32.dll")]',
  '    public static extern short GetKeyState(int nVirtKey);',
  '',
  '    [DllImport("user32.dll")]',
  '    public static extern IntPtr GetForegroundWindow();',
  '',
  '    [DllImport("user32.dll")]',
  '    [return: MarshalAs(UnmanagedType.Bool)]',
  '    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);',
  '',
  '    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]',
  '    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);',
  '',
  '    [DllImport("psapi.dll")]',
  '    public static extern int EmptyWorkingSet(IntPtr hwProc);',
  '',
  '    [StructLayout(LayoutKind.Sequential)]',
  '    public struct RECT {',
  '        public int Left;',
  '        public int Top;',
  '        public int Right;',
  '        public int Bottom;',
  '    }',
  '',
  '    public static bool IsCapsLockOn() {',
  '        return (GetKeyState(0x14) & 0x0001) != 0;',
  '    }',
  '',
  '    public static bool IsFullscreen() {',
  '        IntPtr hwnd = GetForegroundWindow();',
  '        if (hwnd == IntPtr.Zero) return false;',
  '        ',
  '        System.Text.StringBuilder sb = new System.Text.StringBuilder(256);',
  '        GetWindowText(hwnd, sb, 256);',
  '        string title = sb.ToString();',
  '        if (title == "Program Manager" || title == "" || title.Contains("CodeWithSiril Dynamic Island")) return false;',
  '',
  '        RECT rect;',
  '        if (GetWindowRect(hwnd, out rect)) {',
  '            int w = rect.Right - rect.Left;',
  '            int h = rect.Bottom - rect.Top;',
  '            int sw = [System.Windows.Forms.SystemInformation]::PrimaryMonitorSize.Width;',
  '            int sh = [System.Windows.Forms.SystemInformation]::PrimaryMonitorSize.Height;',
  '            return (w >= sw && h >= sh);',
  '        }',
  '        return false;',
  '    }',
  '',
  '    public static void TrimSelf() {',
  '        try {',
  '            EmptyWorkingSet([System.Diagnostics.Process]::GetCurrentProcess().Handle);',
  '        } catch {}',
  '    }',
  '}',
  '',
  '[ComImport]',
  '[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
  'internal interface IMMDeviceEnumerator {',
  '    int NotImpl1();',
  '    [PreserveSig]',
  '    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);',
  '}',
  '',
  '[ComImport]',
  '[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
  'internal interface IMMDevice {',
  '    [PreserveSig]',
  '    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);',
  '}',
  '',
  '[ComImport]',
  '[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
  'public interface IAudioEndpointVolume {',
  '    int NotImpl1();',
  '    int NotImpl2();',
  '    int GetChannelCount(out uint pnChannelCount);',
  '    int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);',
  '    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);',
  '    int GetMasterVolumeLevel(out float pfLevelDB);',
  '    [PreserveSig]',
  '    int GetMasterVolumeLevelScalar(out float pfLevel);',
  '    [PreserveSig]',
  '    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);',
  '    [PreserveSig]',
  '    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);',
  '}',
  '',
  '[ComImport]',
  '[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]',
  'internal class MMDeviceEnumeratorComObject { }',
  '',
  'public class AudioMaster {',
  '    public static float GetVolume() {',
  '        try {',
  '            var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());',
  '            IMMDevice dev = null;',
  '            enumerator.GetDefaultAudioEndpoint(0, 1, out dev);',
  '            if (dev == null) return -1;',
  '            var iid = typeof(IAudioEndpointVolume).GUID;',
  '            object epvObj;',
  '            dev.Activate(ref iid, 23, IntPtr.Zero, out epvObj);',
  '            var epv = (IAudioEndpointVolume)epvObj;',
  '            float vol = 0;',
  '            epv.GetMasterVolumeLevelScalar(out vol);',
  '            return (float)Math.Round(vol * 100);',
  '        } catch {',
  '            return -1;',
  '        }',
  '    }',
  '}',
  '"@ -ReferencedAssemblies "System.Windows.Forms"',
  '',
  '$lastCaps = [System.Convert]::ToInt32([SystemWatcher]::IsCapsLockOn())',
  '$lastFs = -1',
  '$lastVol = [AudioMaster]::GetVolume()',
  '$lastBright = -1',
  '$lastPower = -1',
  '$lastHpName = ""',
  '$counter = 0',
  '',
  'try {',
  '    $initEps = @((Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue).FriendlyName)',
  '    foreach ($ep in $initEps) {',
  '        if ($ep -match "Headphone|Headset|Earbud|AirPods|Buds|AirBass|Enbeatz|Melody|Bluetooth|Wireless|Hands-Free|TWS|Earphones|Pods" -and $ep -notmatch "Microphone Array") {',
  '            $lastHpName = $ep',
  '            break',
  '        }',
  '    }',
  '} catch {}',
  '',
  'try { [SystemWatcher]::TrimSelf() } catch {}',
  '',
  'while ($true) {',
  '    try {',
  '        $caps = [System.Convert]::ToInt32([SystemWatcher]::IsCapsLockOn())',
  '        if ($caps -ne $lastCaps) {',
  '            $lastCaps = $caps',
  '            $stateStr = if ($caps -eq 1) { "ON" } else { "OFF" }',
  '            [Console]::WriteLine("CAPS:" + $stateStr)',
  '        }',
  '',
  '        # Check Volume every iteration (approx 350ms)',
  '        $vol = [AudioMaster]::GetVolume()',
  '        if ($vol -ge 0 -and $vol -ne $lastVol) {',
  '            if ($lastVol -ne -1) {',
  '                [Console]::WriteLine("VOL:" + $vol)',
  '            }',
  '            $lastVol = $vol',
  '        }',
  '',
  '        # Check Charger / AC power every iteration (~350ms) for INSTANT response',
  '        try {',
  '            $pStatus = [System.Windows.Forms.SystemInformation]::PowerStatus',
  '            $isOnline = if ($pStatus.PowerLineStatus -eq [System.Windows.Forms.PowerLineStatus]::Online) { 1 } else { 0 }',
  '            $pct = [int]([Math]::Round($pStatus.BatteryLifePercent * 100))',
  '            if ($isOnline -ne $lastPower) {',
  '                if ($lastPower -ne -1) {',
  '                    [Console]::WriteLine("CHARGER:" + $isOnline + "|" + $pct)',
  '                }',
  '                $lastPower = $isOnline',
  '            }',
  '        } catch {}',
  '',
  '        # Check fullscreen every 2 iterations (approx 700ms)',
  '        if (($counter % 2) -eq 0) {',
  '            $fs = [System.Convert]::ToInt32([SystemWatcher]::IsFullscreen())',
  '            if ($fs -ne $lastFs) {',
  '                $lastFs = $fs',
  '                [Console]::WriteLine("FS:" + $fs)',
  '            }',
  '        }',
  '',
  '        # Check Brightness every 6 iterations (~2s)',
  '        if (($counter % 6) -eq 0) {',
  '            try {',
  '                $b = (Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue).CurrentBrightness',
  '                if ($b -and $b -ne $lastBright) {',
  '                    if ($lastBright -ne -1) {',
  '                        [Console]::WriteLine("BRIGHT:" + $b)',
  '                    }',
  '                    $lastBright = $b',
  '                }',
  '            } catch {}',
  '        }',
  '',
  '        # Periodic working set trim every 20 iterations (~7s) to maintain low RAM',
  '        if (($counter % 20) -eq 0) {',
  '            try { [SystemWatcher]::TrimSelf() } catch {}',
  '        }',
  '',
  '        # Check connected headphones / Bluetooth earbuds every 3 iterations (~1.1s)',
  '        if (($counter % 3) -eq 0) {',
  '            try {',
  '                $curHp = ""',
  '                $eps = @((Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue).FriendlyName)',
  '                foreach ($ep in $eps) {',
  '                    if ($ep -match "Headphone|Headset|Earbud|AirPods|Buds|AirBass|Enbeatz|Melody|Bluetooth|Wireless|Hands-Free|TWS|Earphones|Pods" -and $ep -notmatch "Microphone Array") {',
  '                        $curHp = $ep',
  '                        break',
  '                    }',
  '                }',
  '                if ($curHp -eq "") {',
  '                    $bts = Get-PnpDevice -Class Bluetooth -Status OK -ErrorAction SilentlyContinue | Where-Object {',
  '                        $_.FriendlyName -match "Headphone|Headset|Earbud|AirPods|Buds|AirBass|Enbeatz|Melody|Wireless|TWS|Earphones|Pods" -and',
  '                        $_.FriendlyName -notmatch "Avrcp|Transport|Enumerator|Adapter|Service|Protocol"',
  '                    } | Select-Object -First 1',
  '                    if ($bts) {',
  '                        $curHp = $bts.FriendlyName',
  '                    }',
  '                }',
  '                if ($curHp -ne $lastHpName) {',
  '                    if ($lastHpName -ne "" -or $curHp -ne "") {',
  '                        if ($curHp -ne "") {',
  '                            [Console]::WriteLine("HP:1|" + $curHp)',
  '                        } else {',
  '                            [Console]::WriteLine("HP:0|" + $lastHpName)',
  '                        }',
  '                    }',
  '                    $lastHpName = $curHp',
  '                }',
  '            } catch {}',
  '        }',
  '',
  '        $counter++',
  '        [System.Threading.Thread]::Sleep(350)',
  '    } catch {',
  '        [System.Threading.Thread]::Sleep(1000)',
  '    }',
  '}',
].join('\n');

try {
  fs.writeFileSync(PS_MONITOR_PATH, PS_MONITOR_CONTENT, 'utf8');
} catch (e) {
  console.error('Failed to write system monitor script:', e);
}

class SystemMonitor {
  constructor() {
    this.ps = null;
    this.callbacks = {
      keyboard: null,
      fullscreen: null,
      headphone: null,
      volume: null,
      brightness: null,
      power: null,
    };
    this.lastCaps = null;
    this.lastFullscreen = null;
    this.lastAudioDevice = null;
    this.isRunning = false;
  }

  start(callbacks = {}) {
    this.callbacks = callbacks;
    this.isRunning = true;
    this.spawnWorker();
  }

  spawnWorker() {
    if (!this.isRunning) return;

    try {
      fs.writeFileSync(PS_MONITOR_PATH, PS_MONITOR_CONTENT, 'utf8');
    } catch (_) {}

    try {
      this.ps = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', PS_MONITOR_PATH
      ], { windowsHide: true });

      let lineBuffer = '';

      this.ps.stdout.on('data', (chunk) => {
        lineBuffer += chunk.toString();
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop(); // Keep incomplete trailing fragment

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('CAPS:')) {
            const state = trimmed.slice(5);
            if (this.callbacks.keyboard) {
              this.callbacks.keyboard({ key: 'Caps Lock', state });
            }
          } else if (trimmed.startsWith('VOL:')) {
            const level = parseInt(trimmed.slice(4), 10);
            if (!isNaN(level) && this.callbacks.volume) {
              this.callbacks.volume({ level });
            }
          } else if (trimmed.startsWith('CHARGER:')) {
            const parts = trimmed.slice(8).split('|');
            const isCharging = parts[0] === '1';
            const percent = parseInt(parts[1], 10) || 50;
            if (this.callbacks.power) {
              this.callbacks.power({ isCharging, percent });
            }
          } else if (trimmed.startsWith('BRIGHT:')) {
            const level = parseInt(trimmed.slice(7), 10);
            if (!isNaN(level) && this.callbacks.brightness) {
              this.callbacks.brightness({ level });
            }
          } else if (trimmed.startsWith('FS:')) {
            const isFs = trimmed.slice(3) === '1';
            if (this.callbacks.fullscreen) {
              this.callbacks.fullscreen(isFs);
            }
          } else if (trimmed.startsWith('HP:')) {
            const parts = trimmed.slice(3).split('|');
            const connected = parts[0] === '1';
            const rawName = parts.slice(1).join('|') || 'Airbuds';
            let cleanName = rawName
              .replace(/^(?:Headphones?|Headset)\s*\((.+)\)$/i, '$1')
              .replace(/\s*Hands-Free.*$/i, '')
              .replace(/\s*Stereo.*$/i, '')
              .replace(/\s*AG Audio.*$/i, '')
              .trim();
            if (!cleanName) cleanName = rawName;

            if (this.callbacks.headphone) {
              this.callbacks.headphone({
                connected,
                name: cleanName,
                rawName,
                isHeadphone: true
              });
            }
          } else if (trimmed.startsWith('AUDIO:')) {
            const devName = trimmed.slice(6);
            if (this.lastAudioDevice && this.lastAudioDevice !== devName) {
              const isHeadphone = /headphone|headset|earbud|airpod|bluetooth|buds|wireless/i.test(devName);
              const prevHeadphone = /headphone|headset|earbud|airpod|bluetooth|buds|wireless/i.test(this.lastAudioDevice);
              if (this.callbacks.headphone) {
                if (isHeadphone) {
                  this.callbacks.headphone({ connected: true, name: devName, isHeadphone: true });
                } else if (prevHeadphone) {
                  this.callbacks.headphone({ connected: false, name: this.lastAudioDevice, isHeadphone: false });
                }
              }
            }
            this.lastAudioDevice = devName;
          }
        }
      });

      this.ps.on('error', (err) => {
        console.error('[SystemMonitor] Error:', err.message);
        this.ps = null;
      });

      this.ps.on('exit', () => {
        this.ps = null;
        if (this.isRunning) {
          setTimeout(() => this.spawnWorker(), 3000);
        }
      });
    } catch (e) {
      console.error('[SystemMonitor] Failed to start:', e);
    }
  }

  stop() {
    this.isRunning = false;
    if (this.ps) {
      try { this.ps.kill(); } catch (_) {}
      this.ps = null;
    }
    try { fs.unlinkSync(PS_MONITOR_PATH); } catch (_) {}
  }
}

module.exports = new SystemMonitor();

