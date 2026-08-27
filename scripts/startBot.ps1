Set-Location -LiteralPath 'G:\.gitClones\chatbot'

$VenvPython = '.\.venv\Scripts\python.exe'
$Requirements = '.\requirements.txt'
$Bot = '.\bot.py'

if (-not (Test-Path -LiteralPath $VenvPython)) {
    Write-Host 'Virtual environment not found. Creating it...' -ForegroundColor Yellow

    py -m venv .venv

    if ($LASTEXITCODE -ne 0) {
        Write-Host 'ERROR: Failed to create virtual environment.' -ForegroundColor Red
        exit 1
    }
}

if (Test-Path -LiteralPath $Requirements) {
    Write-Host 'Checking/installing requirements...' -ForegroundColor Cyan

    & $VenvPython -m pip install -r $Requirements

    if ($LASTEXITCODE -ne 0) {
        Write-Host 'ERROR: Failed to install requirements.' -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path -LiteralPath $Bot)) {
    Write-Host "ERROR: bot.py was not found in $(Get-Location)" -ForegroundColor Red
    Write-Host ''
    Write-Host 'Files in this directory:' -ForegroundColor Yellow
    Get-ChildItem
    exit 1
}

Write-Host 'Starting chatbot...' -ForegroundColor Green
Write-Host ''

& $VenvPython $Bot