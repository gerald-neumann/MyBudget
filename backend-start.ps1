param(
    [switch]$EnsureDockerDb,
    # Same as -EnsureDockerDb (common alternate name).
    [switch]$UseDockerDb,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$projectPath = Join-Path $projectRoot "backend\MyBudget.Api\MyBudget.Api.csproj"
$dbStartScript = Join-Path $projectRoot "db-start.ps1"

if (-not (Test-Path $projectPath)) {
    throw "Backend project not found at '$projectPath'."
}

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw ".NET SDK is not installed or not on PATH."
}

if ($EnsureDockerDb -or $UseDockerDb) {
    if (-not (Test-Path $dbStartScript)) {
        throw "db-start.ps1 not found at '$dbStartScript'."
    }
    if ($DryRun) {
        & $dbStartScript -DryRun
    }
    else {
        & $dbStartScript
    }
}

Write-Host "Backend uses PostgreSQL (ConnectionStrings:Database from appsettings / environment)."
Write-Host "Starting backend API on http://localhost:5256 ..."
if (-not $DryRun) {
    dotnet restore $projectPath | Out-Null
    dotnet run --project $projectPath
}
