<#
.SYNOPSIS
  Builds API/UI images on this PC, exports a tar, loads it on the Synology, syncs compose+env, runs docker compose up.

.EXAMPLE
  pwsh ./deploy/synology/Deploy-SynologyPrebuiltFromLocal.ps1 `
    -SshUser admin -SshHost diskstation.local -RemoteDirectory /volume1/docker/mybudget

.EXAMPLE
  pwsh ./deploy/synology/Deploy-SynologyPrebuiltFromLocal.ps1 -SkipBuild -SkipExport `
    -SshUser admin -SshHost diskstation.local -RemoteDirectory /volume1/docker/mybudget `
    -TarPath D:\backup\MyBudget-app-images.tar
#>
#Requires -Version 7.0
param(
    [Parameter(Mandatory = $true)]
    [string] $SshHost,

    [Parameter(Mandatory = $true)]
    [string] $SshUser,

    [Parameter(Mandatory = $true)]
    [string] $RemoteDirectory,

    [switch] $SkipPackagePrompt,
    [switch] $SkipBuild,
    [switch] $SkipExport,
    [string] $TarPath
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$envPath = Join-Path $here ".env"

if (-not (Test-Path $envPath)) {
    if ($SkipPackagePrompt) {
        throw "Missing deploy/synology/.env. Run New-SynologyDeploymentPackage.ps1 first."
    }
    Write-Host "No deploy/synology/.env — starting interactive package script..."
    & (Join-Path $here "New-SynologyDeploymentPackage.ps1")
}

if (-not $SkipBuild) {
    & (Join-Path $here "Build-MyBudgetDockerImages.ps1")
}

if (-not $SkipExport) {
    if ([string]::IsNullOrWhiteSpace($TarPath)) {
        $TarPath = Join-Path $here "MyBudget-app-images.tar"
    }
    & (Join-Path $here "Export-MyBudgetDockerImages.ps1") -OutputPath $TarPath
}
else {
    if ([string]::IsNullOrWhiteSpace($TarPath)) {
        $TarPath = Join-Path $here "MyBudget-app-images.tar"
    }
    if (-not (Test-Path $TarPath)) {
        throw "SkipExport was set but TarPath is missing: $TarPath"
    }
}

& (Join-Path $here "Import-MyBudgetDockerImagesToSynology.ps1") `
    -SshUser $SshUser -SshHost $SshHost -RemoteDirectory $RemoteDirectory -TarPath $TarPath

& (Join-Path $here "Sync-SynologyStack.ps1") `
    -SshUser $SshUser -SshHost $SshHost -RemoteDirectory $RemoteDirectory -UsePrebuiltImagesCompose

& (Join-Path $here "Invoke-SynologyCompose.ps1") `
    -SshUser $SshUser -SshHost $SshHost -RemoteDirectory $RemoteDirectory

Write-Host "Done. Open UI port from .env (UI_HOST_PORT) and API port (API_HOST_PORT)."
