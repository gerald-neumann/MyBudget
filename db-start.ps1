param(
    [switch]$DryRun,
    # Drops and recreates the local dev database used by appsettings.Development.json (my_budget_dev).
    # Use after replacing migrations so EF Migrate() applies to an empty schema (avoids "relation already exists").
    [switch]$ResetDevDatabase
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

if ($ResetDevDatabase -and -not $DryRun) {
    Write-Host "Waiting for PostgreSQL to accept connections..."
    $ready = $false
    for ($i = 0; $i -lt 45; $i++) {
        docker exec mybudget-postgres pg_isready -U postgres 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) {
        throw "PostgreSQL did not become ready in time (container mybudget-postgres)."
    }

    Write-Host "Resetting database 'my_budget_dev' (DROP + CREATE)..."
    docker exec mybudget-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS my_budget_dev WITH (FORCE);" | Out-Host
    docker exec mybudget-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE my_budget_dev OWNER postgres;" | Out-Host
    Write-Host "Database 'my_budget_dev' is empty and ready for migrations."
}

Write-Host "PostgreSQL target: Host=localhost;Port=5432;Database=my_budget_dev;Username=postgres;Password=postgres"
