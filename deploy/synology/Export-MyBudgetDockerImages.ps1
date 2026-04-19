<#
.SYNOPSIS
  Saves MyBudget API/UI Docker images (tags mybudget-api:local, mybudget-ui:local) into one .tar for the Synology.

.EXAMPLE
  pwsh ./deploy/synology/Export-MyBudgetDockerImages.ps1 -OutputPath ./deploy/synology/MyBudget-app-images.tar
#>
#Requires -Version 5.1
param(
    [string] $OutputPath
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker CLI not found."
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $PSScriptRoot "MyBudget-app-images.tar"
}

$dir = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($dir) -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

Write-Host "Saving images to $OutputPath ..."
docker save mybudget-api:local mybudget-ui:local -o $OutputPath
if ($LASTEXITCODE -ne 0) { throw "docker save failed with exit $LASTEXITCODE." }

Write-Host "Done."
