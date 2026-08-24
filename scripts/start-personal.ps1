$ErrorActionPreference = 'Stop'
$lovenseExe = 'C:\Users\davil\AppData\Local\Lovense\Remote\Lovense_Remote.exe'
$debugUrl = 'http://127.0.0.1:9223/json/version'
$lovenseDirectory = [System.IO.Path]::GetDirectoryName($lovenseExe)
if (-not (Test-Path -LiteralPath 'config.ini') -and -not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath 'config.example.ini' -Destination 'config.ini'
    Write-Host 'Created config.ini. You can edit its identity and reply settings before enabling automatic sending.' -ForegroundColor Yellow
}

if (-not (Test-Path -LiteralPath $lovenseExe)) {
    throw "Lovense Remote was not found at $lovenseExe"
}

try {
    Invoke-RestMethod -Uri $debugUrl -TimeoutSec 2 | Out-Null
} catch {
    $expectedPath = [System.IO.Path]::GetFullPath($lovenseExe)
    Get-Process -Name Lovense_Remote -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and [System.IO.Path]::GetFullPath($_.Path) -eq $expectedPath } |
        Stop-Process -Force
    Start-Sleep -Seconds 2
    Write-Host 'Approve the Windows Administrator prompt for Lovense Remote.' -ForegroundColor Yellow
    Start-Process -FilePath $lovenseExe -ArgumentList '--remote-debugging-address=127.0.0.1','--remote-debugging-port=9223' -WorkingDirectory $lovenseDirectory -Verb RunAs
    Start-Sleep -Seconds 10
    Invoke-RestMethod -Uri $debugUrl -TimeoutSec 5 | Out-Null
}

Write-Host 'Lovense Remote is ready. Starting the local review dashboard...' -ForegroundColor Green
& (Join-Path $PSScriptRoot 'open-lovense-devtools.ps1')
npm start




