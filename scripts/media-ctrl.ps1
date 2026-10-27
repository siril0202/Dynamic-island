param([string]$Action)

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

switch ($Action) {
    'play'    { [NativeMediaControl]::Send(179); Write-Output "PLAY_PAUSE_SENT" }
    'next'    { [NativeMediaControl]::Send(176); Write-Output "NEXT_SENT" }
    'prev'    { [NativeMediaControl]::Send(177); Write-Output "PREV_SENT" }
    'forward' { [NativeMediaControl]::Send(176); Write-Output "FWD_SENT" }
    'rewind'  { [NativeMediaControl]::Send(177); Write-Output "REW_SENT" }
    'mute'    { [NativeMediaControl]::Send(173); Write-Output "MUTE_SENT" }
}
