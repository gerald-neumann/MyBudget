<#
.SYNOPSIS
  Copies deploy/synology stack files (compose, .env, ui-config.json) to the NAS via scp.

.PARAMETER RemoteDirectory
  Target folder on the NAS (e.g. /volume1/docker/mybudget). Must match Invoke-SynologyCompose.ps1.

.NOTES
  Requires OpenSSH (ssh, scp).

  Default: uploads docker-compose.yml (build on NAS). Use -UsePrebuiltImagesCompose to upload
  docker-compose.images.yml as docker-compose.yml (API/UI images built on your PC and docker load on the NAS).
#>
#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string] $SshHost,

    [Parameter(Mandatory = $true)]
    [string] $SshUser,

    [Parameter(Mandatory = $true)]
    [string] $RemoteDirectory,

    [switch] $UsePrebuiltImagesCompose
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$synologyDir = $here

if (-not (Get-Command scp -ErrorAction SilentlyContinue)) {
    throw "scp not found. Install OpenSSH Client (Windows Optional Feature) or use Git Bash."
}

$composeSource = if ($UsePrebuiltImagesCompose) {
    Join-Path $synologyDir "docker-compose.images.yml"
}
else {
    Join-Path $synologyDir "docker-compose.yml"
}
$envFile = Join-Path $synologyDir ".env"
$uiFile = Join-Path $synologyDir "ui-config.json"

if (-not (Test-Path $composeSource)) {
    throw "Missing compose file: $composeSource"
}
if (-not (Test-Path $envFile)) {
    throw "Missing deploy/synology/.env. Run New-SynologyDeploymentPackage.ps1 or copy env.example to .env."
}
if (-not (Test-Path $uiFile)) {
    throw "Missing deploy/synology/ui-config.json. Run New-SynologyDeploymentPackage.ps1 or copy ui-config.json.example to ui-config.json."
}

$remote = "${SshUser}@${SshHost}:${RemoteDirectory}"
Write-Host "Ensuring remote directory exists..."
ssh "${SshUser}@${SshHost}" "mkdir -p `"$RemoteDirectory`""

Write-Host "Uploading stack files..."
if ($UsePrebuiltImagesCompose) {
    scp $composeSource "${remote}/docker-compose.yml"
}
else {
    scp $composeSource "${remote}/"
}
scp $envFile "${remote}/"
scp $uiFile "${remote}/"

if ($UsePrebuiltImagesCompose) {
    Write-Host "Done. Run Invoke-SynologyCompose.ps1 to apply (no --build). Ensure images were loaded on the NAS first."
}
else {
    Write-Host "Done. Run Invoke-SynologyCompose.ps1 to apply, or on the NAS: cd `"$RemoteDirectory`" && docker compose up -d --build"
}
