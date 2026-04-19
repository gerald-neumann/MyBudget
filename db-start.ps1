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
    throw "Docker CLI not found. Please install Docker Desktop."
}

try {
    docker info | Out-Null
}
catch {
    throw "Docker daemon is not running. Start Docker Desktop and retry."
}

Write-Host "Starting PostgreSQL container..."
if (-not $DryRun) {
    docker compose -f $composeFile up -d postgres | Out-Null
}

if (-not $DryRun) {
    $status = docker compose -f $composeFile ps postgres
    Write-Host $status
}

Write-Host "PostgreSQL target: Host=localhost;Port=5432;Database=my_budget_dev;Username=postgres;Password=postgres"
