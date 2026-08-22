$ErrorActionPreference = 'Stop'
$lovenseExe = 'C:\Users\davil\AppData\Local\Lovense\Remote\Lovense_Remote.exe'
$debugUrl = 'http://127.0.0.1:9223/json/version'

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
    Start-Process -FilePath $lovenseExe -ArgumentList '--remote-debugging-address=127.0.0.1','--remote-debugging-port=9223'
    Start-Sleep -Seconds 6
    Invoke-RestMethod -Uri $debugUrl -TimeoutSec 5 | Out-Null
}

Write-Host 'Lovense Remote is ready. Starting the local review dashboard...' -ForegroundColor Green
npm start

