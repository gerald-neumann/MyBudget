#Requires -Version 5.1
<#
.SYNOPSIS
  Single entry point for MyBudget deployment: delegates to existing scripts.

.DESCRIPTION
  **Host** (default): runs **Build-Upload-MyBudgetDockerImages.ps1** — build, docker save, scp, then by default **ssh** + **docker load** on the remote host (same identity as scp). Optionally chains **deploy/portainer/Deploy-PortainerMyBudgetStack.ps1** when **-PortainerEndpointId** is set.

  **Synology**: runs **deploy/synology/Deploy-SynologyPrebuiltFromLocal.ps1** (local Synology build/export + import + stack sync + compose).

.PARAMETER Target
  **Host** — Docker host reachable by ssh/scp (Portainer optional). **Synology** — NAS workflow via deploy/synology scripts.

.PARAMETER SkipRemoteDockerLoad
  For **Host** only: upload the tar but do not run **docker load** on the server (omit **-RemoteDockerLoad** on the build-upload script).

.EXAMPLE
  $env:FONTAWESOME_PRO_TOKEN = '...'
  pwsh ./Deploy-MyBudget.ps1 -IdentityFile "$env:USERPROFILE\.ssh\hetzner_root_ed25519"

.EXAMPLE
  pwsh ./Deploy-MyBudget.ps1 `
    -IdentityFile "$env:USERPROFILE\.ssh\hetzner_root_ed25519" `
    -RemoveRemoteTarAfterLoad `
    -PortainerEndpointId 3 -PortainerDeploySkipCertificateCheck

.EXAMPLE
  pwsh ./Deploy-MyBudget.ps1 -Target Synology `
    -SshHost diskstation.local -SshUser admin -RemoteDirectory /volume1/docker/mybudget
#>
[CmdletBinding(DefaultParameterSetName = "Host")]
param(
    [ValidateSet("Host", "Synology")]
    [string] $Target = "Host",

    # --- Host / Build-Upload (ParameterSetName Host) ---
    [Parameter(ParameterSetName = "Host")]
    [string] $RemoteUserHost = "root@65.109.84.102",

    [Parameter(ParameterSetName = "Host")]
    [string] $RemoteDir = "/opt/stacks/mybudget",

    [Parameter(ParameterSetName = "Host")]
    [string] $TarFileName = "MyBudget-app-images.tar",

    [Parameter(ParameterSetName = "Host")]
    [string] $IdentityFile = "",

    [Parameter(ParameterSetName = "Host")]
    [switch] $SkipBuild,

    [Parameter(ParameterSetName = "Host")]
    [switch] $SkipSave,

    [Parameter(ParameterSetName = "Host")]
    [switch] $SkipScp,

    [Parameter(ParameterSetName = "Host")]
    [switch] $SkipRemoteDockerLoad,

    [Parameter(ParameterSetName = "Host")]
    [switch] $RemoveRemoteTarAfterLoad,

    [Parameter(ParameterSetName = "Host")]
    [int] $PortainerEndpointId = 0,

    [Parameter(ParameterSetName = "Host")]
    [switch] $PortainerDeploySkipCertificateCheck,

    # --- Synology (ParameterSetName Synology) ---
    [Parameter(Mandatory = $true, ParameterSetName = "Synology")]
    [string] $SshHost,

    [Parameter(Mandatory = $true, ParameterSetName = "Synology")]
    [string] $SshUser,

    [Parameter(Mandatory = $true, ParameterSetName = "Synology")]
    [string] $RemoteDirectory,

    [Parameter(ParameterSetName = "Synology")]
    [switch] $SkipPackagePrompt,

    [Parameter(ParameterSetName = "Synology")]
    [switch] $SkipBuildSynology,

    [Parameter(ParameterSetName = "Synology")]
    [switch] $SkipExport,

    [Parameter(ParameterSetName = "Synology")]
    [string] $TarPath,

    [Parameter(ParameterSetName = "Synology")]
    [switch] $UseAppOnlyPrebuiltImagesCompose
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot

if ($Target -eq "Synology") {
    $synologyScript = [System.IO.Path]::Combine($repoRoot, "deploy", "synology", "Deploy-SynologyPrebuiltFromLocal.ps1")
    if (-not (Test-Path -LiteralPath $synologyScript)) {
        throw "Script not found: $synologyScript"
    }
    $synArgs = @{
        SshHost         = $SshHost
        SshUser         = $SshUser
        RemoteDirectory = $RemoteDirectory
    }
    if ($SkipPackagePrompt) { $synArgs.SkipPackagePrompt = $true }
    if ($SkipBuildSynology) { $synArgs.SkipBuild = $true }
    if ($SkipExport) { $synArgs.SkipExport = $true }
    if ($UseAppOnlyPrebuiltImagesCompose) { $synArgs.UseAppOnlyPrebuiltImagesCompose = $true }
    if (-not [string]::IsNullOrWhiteSpace($TarPath)) { $synArgs.TarPath = $TarPath }
    Write-Host "Deploy-MyBudget: invoking Synology pipeline -> $synologyScript"
    & $synologyScript @synArgs
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        throw "Deploy-SynologyPrebuiltFromLocal.ps1 exited with code $LASTEXITCODE."
    }
    return
}

$buildUpload = [System.IO.Path]::Combine($repoRoot, "Build-Upload-MyBudgetDockerImages.ps1")
if (-not (Test-Path -LiteralPath $buildUpload)) {
    throw "Script not found: $buildUpload"
}

$buArgs = @{
    RemoteUserHost = $RemoteUserHost
    RemoteDir      = $RemoteDir
    TarFileName    = $TarFileName
}
if ($SkipBuild) { $buArgs.SkipBuild = $true }
if ($SkipSave) { $buArgs.SkipSave = $true }
if ($SkipScp) { $buArgs.SkipScp = $true }
if (-not [string]::IsNullOrWhiteSpace($IdentityFile)) { $buArgs.IdentityFile = $IdentityFile }
if (-not $SkipScp -and -not $SkipRemoteDockerLoad) { $buArgs.RemoteDockerLoad = $true }
if ($RemoveRemoteTarAfterLoad) { $buArgs.RemoveRemoteTarAfterLoad = $true }
if ($PortainerEndpointId -gt 0) { $buArgs.PortainerEndpointId = $PortainerEndpointId }
if ($PortainerDeploySkipCertificateCheck) { $buArgs.PortainerDeploySkipCertificateCheck = $true }

Write-Host "Deploy-MyBudget: invoking host pipeline -> $buildUpload"
& $buildUpload @buArgs
if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw "Build-Upload-MyBudgetDockerImages.ps1 exited with code $LASTEXITCODE."
}
