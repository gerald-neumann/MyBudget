<#
.SYNOPSIS
  Copies deploy/keycloak (compose + .env) to a Synology folder via scp.

.PARAMETER SshHost
  Hostname or IP of the DiskStation.

.PARAMETER SshUser
  SSH user with write access to RemoteDirectory.

.PARAMETER RemoteDirectory
  Target path on the NAS (e.g. /volume1/docker/mybudget-keycloak).

.NOTES
  Requires OpenSSH client (scp) on Windows. Run from repo root recommended.
#>
#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string] $SshHost,

    [Parameter(Mandatory = $true)]
    [string] $SshUser,

    [Parameter(Mandatory = $true)]
    [string] $RemoteDirectory
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$keycloakDir = Join-Path $repoRoot "deploy\keycloak"

if (-not (Get-Command scp -ErrorAction SilentlyContinue)) {
    throw "scp not found. Install OpenSSH Client (Windows Optional Feature) or use Git Bash."
}

if (-not (Test-Path (Join-Path $keycloakDir "docker-compose.yml"))) {
    throw "Missing docker-compose.yml under deploy/keycloak."
}

$remote = "${SshUser}@${SshHost}:${RemoteDirectory}"
Write-Host "Ensuring remote directory exists..."
ssh "${SshUser}@${SshHost}" "mkdir -p `"$RemoteDirectory`""

Write-Host "Uploading Keycloak stack files..."
scp (Join-Path $keycloakDir "docker-compose.yml") "${remote}/"
if (Test-Path (Join-Path $keycloakDir ".env")) {
    scp (Join-Path $keycloakDir ".env") "${remote}/"
}
else {
    Write-Warning "No deploy/keycloak/.env found. Upload env.example manually or run New-KeycloakDeploymentPackage.ps1 first."
    scp (Join-Path $keycloakDir "env.example") "${remote}/"
}

Write-Host "Done. On the NAS: cd `"$RemoteDirectory`" && docker compose up -d"
Write-Host "Or create/update a Portainer stack pointing at these files."
