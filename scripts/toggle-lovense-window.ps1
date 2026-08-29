param([switch]$Once)

$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LovenseWindowHotkey {
  [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int pt_x; public int pt_y; }
  [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint key);
  [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetMessage(out MSG message, IntPtr hWnd, uint min, uint max);
}
'@

$hotkeyId = 8201
$modifiers = 0x0001 -bor 0x0002 -bor 0x0004 # Alt + Ctrl + Shift
$virtualKeyL = 0x4C
$hide = 0
$restore = 9
$lastWindow = [IntPtr]::Zero

function Get-LovenseWindow {
    if ($lastWindow -ne [IntPtr]::Zero) { return $lastWindow }
    $process = Get-Process -Name 'Lovense_Remote' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($process) { $lastWindow = $process.MainWindowHandle }
    return $lastWindow
}

function Get-AssistantWindow {
    $process = Get-Process -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -eq 'Lovense Remote Reply Assistant' } |
        Select-Object -First 1
    if ($process) { return $process.MainWindowHandle }
    return [IntPtr]::Zero
}

function Toggle-LovenseWindow {
    $window = Get-LovenseWindow
    if ($window -eq [IntPtr]::Zero) { return }
    if ([LovenseWindowHotkey]::IsWindowVisible($window)) {
        [LovenseWindowHotkey]::ShowWindow($window, $hide) | Out-Null
    } else {
        [LovenseWindowHotkey]::ShowWindow($window, $restore) | Out-Null
        [LovenseWindowHotkey]::SetForegroundWindow($window) | Out-Null
    }
}

function Toggle-PairedWindows {
    $lovenseWindow = Get-LovenseWindow
    $assistantWindow = Get-AssistantWindow
    if ($lovenseWindow -eq [IntPtr]::Zero) { return }
    if ([LovenseWindowHotkey]::IsWindowVisible($lovenseWindow)) {
        [LovenseWindowHotkey]::ShowWindow($lovenseWindow, $hide) | Out-Null
        if ($assistantWindow -ne [IntPtr]::Zero) { [LovenseWindowHotkey]::ShowWindow($assistantWindow, $hide) | Out-Null }
    } else {
        [LovenseWindowHotkey]::ShowWindow($lovenseWindow, $restore) | Out-Null
        if ($assistantWindow -ne [IntPtr]::Zero) {
            [LovenseWindowHotkey]::ShowWindow($assistantWindow, $restore) | Out-Null
            [LovenseWindowHotkey]::SetForegroundWindow($assistantWindow) | Out-Null
        } else {
            [LovenseWindowHotkey]::SetForegroundWindow($lovenseWindow) | Out-Null
        }
    }
}

if ($Once) {
    Toggle-LovenseWindow
    exit 0
}

$createdNew = $false
$mutex = [System.Threading.Mutex]::new($true, 'LovenseReplyAssistantWindowHotkey', [ref]$createdNew)
if (-not $createdNew) { exit 0 }
if (-not [LovenseWindowHotkey]::RegisterHotKey([IntPtr]::Zero, $hotkeyId, $modifiers, $virtualKeyL)) { exit 1 }
try {
    $message = New-Object LovenseWindowHotkey+MSG
    while ([LovenseWindowHotkey]::GetMessage([ref]$message, [IntPtr]::Zero, 0, 0) -gt 0) {
        if ($message.message -eq 0x0312 -and $message.wParam.ToInt32() -eq $hotkeyId) { Toggle-PairedWindows }
    }
} finally {
    [LovenseWindowHotkey]::UnregisterHotKey([IntPtr]::Zero, $hotkeyId) | Out-Null
    $mutex.ReleaseMutex() | Out-Null
    $mutex.Dispose()
}
