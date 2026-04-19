<#
.SYNOPSIS
  Builds MyBudget Docker images (tags mybudget-api:local, mybudget-ui:local) from the repository root on your PC.

.EXAMPLE
  pwsh ./deploy/synology/Build-MyBudgetDockerImages.ps1
#>
#Requires -Version 5.1
param()

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker CLI not found. Install Docker Desktop and ensure it is running."
}

Push-Location $repoRoot
try {
    Write-Host "Building API image..."
    docker build -f backend/MyBudget.Api/Dockerfile -t mybudget-api:local .
    if ($LASTEXITCODE -ne 0) { throw "docker build (API) failed with exit $LASTEXITCODE." }

    Write-Host "Building UI image..."
    docker build -f frontend/my-budget-ui/Dockerfile -t mybudget-ui:local .
    if ($LASTEXITCODE -ne 0) { throw "docker build (UI) failed with exit $LASTEXITCODE." }
}
finally {
    Pop-Location
}

Write-Host "Done. Tags: mybudget-api:local, mybudget-ui:local"
