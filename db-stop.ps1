param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$composeFile = Join-Path $projectRoot "docker-compose.yml"

if (-not (Test-Path $composeFile)) {
    throw "Missing docker-compose file at '$composeFile'."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI not found."
}

Write-Host "Stopping PostgreSQL container..."
if (-not $DryRun) {
    docker compose -f $composeFile stop postgres | Out-Null
    docker compose -f $composeFile ps postgres
}

Write-Host "Done."
