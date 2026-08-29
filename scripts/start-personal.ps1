$ErrorActionPreference = 'Stop'
$lovenseExe = 'C:\\Users\\MrJohnDowe\\AppData\\Local\\Lovense\\Remote\\Lovense_Remote.exe'
$debugUrl = 'http://127.0.0.1:9223/json/version'
$lovenseDirectory = [System.IO.Path]::GetDirectoryName($lovenseExe)
$windowHotkeyScript = Join-Path $PSScriptRoot 'toggle-lovense-window.ps1'
if (-not (Test-Path -LiteralPath 'config.ini') -and -not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath 'config.example.ini' -Destination 'config.ini'
    Write-Host 'Created config.ini. The Reply Assistant can now be configured with identity, reply, and Lovense sign-in settings.' -ForegroundColor Yellow
}

if (-not (Test-Path -LiteralPath $lovenseExe)) {
    throw "Lovense Remote was not found at $lovenseExe"
}

if (Test-Path -LiteralPath $windowHotkeyScript) {
    Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',$windowHotkeyScript -WindowStyle Hidden
    Write-Host 'Lovense window hotkey is ready: Ctrl+Alt+Shift+L hides or restores the app.' -ForegroundColor DarkCyan
}

try {
    Invoke-RestMethod -Uri $debugUrl -TimeoutSec 2 | Out-Null
} catch {
    $expectedPath = [System.IO.Path]::GetFullPath($lovenseExe)
    Get-Process -Name Lovense_Remote -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and [System.IO.Path]::GetFullPath($_.Path) -eq $expectedPath } |
        Stop-Process -Force
    Start-Sleep -Seconds 2
    Write-Host 'Approve the Windows prompt so the Reply Assistant can open Lovense Remote with its local automation connection.' -ForegroundColor Yellow
    Start-Process -FilePath $lovenseExe -ArgumentList '--remote-debugging-address=127.0.0.1','--remote-debugging-port=9223' -WorkingDirectory $lovenseDirectory -Verb RunAs
    Start-Sleep -Seconds 10
    Invoke-RestMethod -Uri $debugUrl -TimeoutSec 5 | Out-Null
}

Write-Host 'Lovense Remote is ready. Starting the Reply Assistant, which will sign in when needed and open the chat area...' -ForegroundColor Green
& (Join-Path $PSScriptRoot 'open-lovense-devtools.ps1')
npm start




