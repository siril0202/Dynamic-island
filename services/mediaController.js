const { execFile, spawn } = require('child_process');
const path = require('path');

const CTRL_SCRIPT = path.join(__dirname, '..', 'scripts', 'media-ctrl.ps1');

class MediaController {
  constructor() {
    this.ps = null;
    this.idleTimer = null;
    this.IDLE_TIMEOUT_MS = 30000;
  }

  resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.stop();
    }, this.IDLE_TIMEOUT_MS);
  }

  spawnWorker() {
    try {
      this.ps = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class NativeMediaControl {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    public static void Send(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        keybd_event(vk, 0, 2, UIntPtr.Zero);
    }
}
"@
while ($line = [Console]::ReadLine()) {
    switch ($line.Trim().ToLower()) {
        'play'    { [NativeMediaControl]::Send(179) }
        'next'    { [NativeMediaControl]::Send(176) }
        'prev'    { [NativeMediaControl]::Send(177) }
        'forward' { [NativeMediaControl]::Send(176) }
        'rewind'  { [NativeMediaControl]::Send(177) }
        'mute'    { [NativeMediaControl]::Send(173) }
    }
}
        `
      ], { windowsHide: true });

      this.ps.on('error', () => { this.ps = null; });
      this.ps.on('exit', () => { this.ps = null; });
    } catch (_) {
      this.ps = null;
    }
  }

  send(action) {
    if (!action) return;
    const act = action.toLowerCase();

    // Fast execution using standalone script if worker is starting
    if (!this.ps || !this.ps.stdin || !this.ps.stdin.writable) {
      execFile('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', CTRL_SCRIPT,
        '-Action', act
      ], { windowsHide: true }, () => {});

      this.spawnWorker();
      return;
    }

    this.resetIdleTimer();
    try {
      this.ps.stdin.write(act + '\n');
    } catch (_) {
      execFile('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', CTRL_SCRIPT,
        '-Action', act
      ], { windowsHide: true }, () => {});
    }
  }

  stop() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.ps) {
      try { this.ps.kill(); } catch (_) {}
      this.ps = null;
    }
  }
}

module.exports = new MediaController();
