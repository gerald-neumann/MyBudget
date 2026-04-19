<#
.SYNOPSIS
  Orchestrates Keycloak packaging and Portainer deployment for MyBudget.

  For API + UI + Keycloak on the NAS without Portainer, use Deploy-SynologyStack.ps1
  and deploy/SYNOLOGY-KEYCLOAK.md (Option D).

.EXAMPLE
  pwsh ./deploy/synology/Deploy-MyBudgetKeycloak.ps1 `
    -PortainerBaseUrl "https://diskstation:9443" -AccessToken "ptr_..." `
    -EndpointId 2 -SkipCertificateCheck

.EXAMPLE
  # After .env exists, only upload to NAS (no Portainer):
  pwsh ./deploy/synology/Deploy-MyBudgetKeycloak.ps1 -SyncOnly `
    -SshUser "admin" -SshHost "diskstation.local" -RemoteDirectory "/volume1/docker/mybudget-keycloak"
#>
#Requires -Version 7.0
param(
    [string] $PortainerBaseUrl,
    [string] $AccessToken,
    [string] $PortainerUsername,
    [string] $PortainerPassword,
    [int] $EndpointId = 0,
    [string] $StackName = "MyBudget-keycloak",
    [switch] $SkipCertificateCheck,

    [switch] $SkipPackagePrompt,
    [switch] $SyncOnly,

    [string] $SshUser,
    [string] $SshHost,
    [string] $RemoteDirectory
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $here "..\..")
$keycloakEnv = Join-Path $repoRoot "deploy\keycloak\.env"

if (-not (Test-Path $keycloakEnv)) {
    if ($SkipPackagePrompt) {
        throw "Missing deploy/keycloak/.env. Run New-KeycloakDeploymentPackage.ps1 or copy env.example to .env."
    }
    Write-Host "No deploy/keycloak/.env found. Launching interactive package script..."
    & (Join-Path $here "New-KeycloakDeploymentPackage.ps1")
}

if ($SyncOnly) {
    if ([string]::IsNullOrWhiteSpace($SshUser) -or [string]::IsNullOrWhiteSpace($SshHost) -or [string]::IsNullOrWhiteSpace($RemoteDirectory)) {
        throw "-SyncOnly requires -SshUser, -SshHost, and -RemoteDirectory."
    }
    & (Join-Path $here "Sync-KeycloakToSynology.ps1") -SshUser $SshUser -SshHost $SshHost -RemoteDirectory $RemoteDirectory
    return
}

if ([string]::IsNullOrWhiteSpace($PortainerBaseUrl)) {
    throw "Provide -PortainerBaseUrl (or use -SyncOnly with SSH parameters)."
}
if ($EndpointId -le 0) {
    throw "Provide -EndpointId (hint: Deploy-PortainerKeycloakStack.ps1 -ListEndpointsOnly)."
}

$portainerScript = Join-Path $here "Deploy-PortainerKeycloakStack.ps1"
& $portainerScript `
    -PortainerBaseUrl $PortainerBaseUrl `
    -AccessToken $AccessToken `
    -PortainerUsername $PortainerUsername `
    -PortainerPassword $PortainerPassword `
    -EndpointId $EndpointId `
    -StackName $StackName `
    -SkipCertificateCheck:$SkipCertificateCheck

if (-not [string]::IsNullOrWhiteSpace($SshHost) -and -not [string]::IsNullOrWhiteSpace($SshUser) -and -not [string]::IsNullOrWhiteSpace($RemoteDirectory)) {
    Write-Host "Also syncing files to NAS..."
    & (Join-Path $here "Sync-KeycloakToSynology.ps1") -SshUser $SshUser -SshHost $SshHost -RemoteDirectory $RemoteDirectory
}
