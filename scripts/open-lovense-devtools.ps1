$ErrorActionPreference = 'Stop'

$debugOrigin = 'http://127.0.0.1:9223'
$targets = Invoke-RestMethod -Uri "$debugOrigin/json/list" -TimeoutSec 5
$target = $targets |
    Where-Object { $_.type -eq 'page' -and $_.title -eq 'Lovense Remote' } |
    Select-Object -First 1

if (-not $target) {
    throw 'The Lovense Remote debugging target is unavailable. Start Lovense Remote with scripts\start-personal.ps1 first.'
}

$frontendPath = [string]$target.devtoolsFrontendUrl
if (-not $frontendPath) {
    throw 'Lovense Remote did not publish a DevTools inspector URL.'
}

$devToolsUrl = if ($frontendPath.StartsWith('/')) {
    "$debugOrigin$frontendPath"
} else {
    $frontendPath
}

Write-Host "Opening Lovense Remote Developer Tools: $devToolsUrl" -ForegroundColor Cyan
Start-Process -FilePath $devToolsUrl
