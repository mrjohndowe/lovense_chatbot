param([switch]$Once, [switch]$Paired, [switch]$Restore, [int]$AssistantProcessId = 0)

$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class LovenseWindowHotkey {
  [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int pt_x; public int pt_y; }
  private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint key);
  [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetMessage(out MSG message, IntPtr hWnd, uint min, uint max);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr hWnd, uint command);

  public static IntPtr FindTopLevelWindow(int[] processIds, string expectedTitle) {
    IntPtr hiddenCandidate = IntPtr.Zero;
    IntPtr visibleCandidate = IntPtr.Zero;
    EnumWindows((hWnd, lParam) => {
      if (GetWindow(hWnd, 4) != IntPtr.Zero) return true; // owned windows are not the application window
      uint processId;
      GetWindowThreadProcessId(hWnd, out processId);
      if (processIds.Length > 0 && Array.IndexOf(processIds, (int)processId) < 0) return true;
      var title = new StringBuilder(512);
      GetWindowText(hWnd, title, title.Capacity);
      if (!string.IsNullOrEmpty(expectedTitle) && !string.Equals(title.ToString(), expectedTitle, StringComparison.Ordinal)) return true;
      if (IsWindowVisible(hWnd)) { visibleCandidate = hWnd; return false; }
      if (hiddenCandidate == IntPtr.Zero) hiddenCandidate = hWnd;
      return true;
    }, IntPtr.Zero);
    return visibleCandidate != IntPtr.Zero ? visibleCandidate : hiddenCandidate;
  }
}
'@

$hotkeyId = 8201
$modifiers = 0x0001 -bor 0x0002 -bor 0x0004 # Alt + Ctrl + Shift
$virtualKeyL = 0x4C
$hide = 0
$restoreCommand = 9
$lastWindow = [IntPtr]::Zero

function Get-LovenseWindow {
    if ($lastWindow -ne [IntPtr]::Zero -and [LovenseWindowHotkey]::IsWindow($lastWindow)) { return $lastWindow }
    $processIds = @(Get-Process -Name 'Lovense_Remote' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    if ($processIds.Count) { $lastWindow = [LovenseWindowHotkey]::FindTopLevelWindow([int[]]$processIds, '') }
    return $lastWindow
}

function Get-AssistantWindow {
    $processIds = @()
    if ($AssistantProcessId -gt 0) { $processIds += $AssistantProcessId }
    $processIds += @(Get-Process -Name 'Lovense Remote Reply Assistant' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    $processIds = @($processIds | Select-Object -Unique)
    $window = [LovenseWindowHotkey]::FindTopLevelWindow([int[]]$processIds, 'Lovense Remote Reply Assistant')
    if ($window -ne [IntPtr]::Zero) { return $window }
    return [LovenseWindowHotkey]::FindTopLevelWindow([int[]]@(), 'Lovense Remote Reply Assistant')
}

function Toggle-LovenseWindow {
    $window = Get-LovenseWindow
    if ($window -eq [IntPtr]::Zero) { return }
    if ([LovenseWindowHotkey]::IsWindowVisible($window)) {
        [LovenseWindowHotkey]::ShowWindow($window, $hide) | Out-Null
    } else {
        [LovenseWindowHotkey]::ShowWindow($window, $restoreCommand) | Out-Null
        [LovenseWindowHotkey]::SetForegroundWindow($window) | Out-Null
    }
}

function Toggle-PairedWindows {
    $lovenseWindow = Get-LovenseWindow
    $assistantWindow = Get-AssistantWindow
    if ($lovenseWindow -eq [IntPtr]::Zero -or $assistantWindow -eq [IntPtr]::Zero) { return $false }
    $hidePairedWindows = [LovenseWindowHotkey]::IsWindowVisible($lovenseWindow) -or [LovenseWindowHotkey]::IsWindowVisible($assistantWindow)
    if ($hidePairedWindows) {
        [LovenseWindowHotkey]::ShowWindow($lovenseWindow, $hide) | Out-Null
        Start-Sleep -Milliseconds 100
        if ([LovenseWindowHotkey]::IsWindowVisible($lovenseWindow)) { return $false }
        [LovenseWindowHotkey]::ShowWindow($assistantWindow, $hide) | Out-Null
        Start-Sleep -Milliseconds 100
        if ([LovenseWindowHotkey]::IsWindowVisible($assistantWindow)) {
            [LovenseWindowHotkey]::ShowWindow($lovenseWindow, $restoreCommand) | Out-Null
            return $false
        }
    } else {
        [LovenseWindowHotkey]::ShowWindow($lovenseWindow, $restoreCommand) | Out-Null
        Start-Sleep -Milliseconds 100
        if (-not [LovenseWindowHotkey]::IsWindowVisible($lovenseWindow)) { return $false }
        [LovenseWindowHotkey]::ShowWindow($assistantWindow, $restoreCommand) | Out-Null
        Start-Sleep -Milliseconds 100
        if (-not [LovenseWindowHotkey]::IsWindowVisible($assistantWindow)) {
            [LovenseWindowHotkey]::ShowWindow($lovenseWindow, $hide) | Out-Null
            return $false
        }
        [LovenseWindowHotkey]::SetForegroundWindow($assistantWindow) | Out-Null
    }
    return $true
}

function Restore-PairedWindows {
    $lovenseWindow = Get-LovenseWindow
    $assistantWindow = Get-AssistantWindow
    if ($lovenseWindow -ne [IntPtr]::Zero) { [LovenseWindowHotkey]::ShowWindow($lovenseWindow, $restoreCommand) | Out-Null }
    if ($assistantWindow -ne [IntPtr]::Zero) {
        [LovenseWindowHotkey]::ShowWindow($assistantWindow, $restoreCommand) | Out-Null
        [LovenseWindowHotkey]::SetForegroundWindow($assistantWindow) | Out-Null
    } elseif ($lovenseWindow -ne [IntPtr]::Zero) {
        [LovenseWindowHotkey]::SetForegroundWindow($lovenseWindow) | Out-Null
    }
}

if ($Restore) {
    Restore-PairedWindows
    exit 0
}

if ($Once) {
    Toggle-LovenseWindow
    exit 0
}

if ($Paired) {
    if (Toggle-PairedWindows) { exit 0 }
    exit 1
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
