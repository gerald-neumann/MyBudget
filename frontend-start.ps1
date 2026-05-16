param(
    [switch]$Install,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$frontendDir = Join-Path $projectRoot "frontend\my-budget-ui"
$packageJson = Join-Path $frontendDir "package.json"
$nodeModules = Join-Path $frontendDir "node_modules"

if (-not (Test-Path $frontendDir)) {
    throw "Frontend folder not found at '$frontendDir'."
}

if (-not (Test-Path $packageJson)) {
    throw "package.json missing at '$packageJson'."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is not installed or not on PATH."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is not installed or not on PATH."
}

Push-Location $frontendDir
try {
    if ($Install -or -not (Test-Path $nodeModules)) {
        Write-Host "Installing npm dependencies..."
        if (-not $DryRun) {
            npm install
        }
    }

    Write-Host "Starting frontend on http://localhost:4200 ..."
    if (-not $DryRun) {
        npm start
    }
}
finally {
    Pop-Location
}
