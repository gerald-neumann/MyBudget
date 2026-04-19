<#
.SYNOPSIS
  Copies the image tar to the NAS and runs docker load (no project source required on the NAS).

.PARAMETER TarPath
  Local path to the .tar from Export-MyBudgetDockerImages.ps1.

.PARAMETER RemoteTarName
  Filename placed in RemoteDirectory on the NAS (default: MyBudget-app-images.tar).
#>
#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string] $SshHost,

    [Parameter(Mandatory = $true)]
    [string] $SshUser,

    [Parameter(Mandatory = $true)]
    [string] $RemoteDirectory,

    [Parameter(Mandatory = $true)]
    [string] $TarPath,

    [string] $RemoteTarName = "MyBudget-app-images.tar"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $TarPath)) {
    throw "Tar not found: $TarPath"
}
if (-not (Get-Command scp -ErrorAction SilentlyContinue)) {
    throw "scp not found."
}

$remoteTar = "${RemoteDirectory}/${RemoteTarName}".Replace("//", "/")
$remote = "${SshUser}@${SshHost}:${remoteTar}"

Write-Host "Ensuring remote directory exists..."
ssh "${SshUser}@${SshHost}" "mkdir -p `"$RemoteDirectory`""

Write-Host "Uploading image archive..."
scp $TarPath $remote

Write-Host "Loading images on the NAS..."
# Synology: non-interactive ssh often has a minimal PATH (docker not found). Login shell fixes it.
$loadInner = "cd `"$RemoteDirectory`" && docker load -i `"$RemoteTarName`""
$loadCmd = "bash -lc `"$loadInner`""
ssh "${SshUser}@${SshHost}" $loadCmd

Write-Host "Done. MyBudget images on the NAS should include mybudget-api:local and mybudget-ui:local."
