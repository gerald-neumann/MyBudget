<#
.SYNOPSIS
  Prepares secrets (optional), syncs deploy/synology to the NAS, and runs docker compose.

.EXAMPLE
  pwsh ./deploy/synology/Deploy-SynologyStack.ps1 -SshUser admin -SshHost diskstation.local `
    -RemoteDirectory /volume1/repos/private-budget-planner/deploy/synology -Build

.EXAMPLE
  pwsh ./deploy/synology/Deploy-SynologyStack.ps1 -SkipPackagePrompt -SshUser admin `
    -SshHost diskstation.local -RemoteDirectory /volume1/docker/mybudget -Build
#>
#Requires -Version 7.0
param(
    [Parameter(Mandatory = $true)]
    [string] $SshHost,

    [Parameter(Mandatory = $true)]
    [string] $SshUser,

    [Parameter(Mandatory = $true)]
    [string] $RemoteDirectory,

    [switch] $Build,
    [switch] $SkipPackagePrompt,
    [switch] $SyncOnly,

    # Upload docker-compose.images.yml; NAS must already have MyBudget images mybudget-api:local and mybudget-ui:local (docker load).
    [switch] $UsePrebuiltImagesCompose
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$envPath = Join-Path $here ".env"

if (-not (Test-Path $envPath)) {
    if ($SkipPackagePrompt) {
        throw "Missing deploy/synology/.env. Run New-SynologyDeploymentPackage.ps1 or copy env.example to .env."
    }
    Write-Host "No deploy/synology/.env — starting interactive package script..."
    & (Join-Path $here "New-SynologyDeploymentPackage.ps1")
}

& (Join-Path $here "Sync-SynologyStack.ps1") -SshUser $SshUser -SshHost $SshHost -RemoteDirectory $RemoteDirectory -UsePrebuiltImagesCompose:$UsePrebuiltImagesCompose

if ($SyncOnly) {
    Write-Host "SyncOnly: not running docker compose."
    return
}

$doBuild = $Build -and -not $UsePrebuiltImagesCompose
if ($Build -and $UsePrebuiltImagesCompose) {
    Write-Host "Ignoring -Build because -UsePrebuiltImagesCompose is set (images are not built on the NAS)."
}

& (Join-Path $here "Invoke-SynologyCompose.ps1") -SshUser $SshUser -SshHost $SshHost -RemoteDirectory $RemoteDirectory -Build:$doBuild

Write-Host "Done. Configure DSM reverse proxy per deploy/SYNOLOGY-KEYCLOAK.md; realm setup unchanged."
