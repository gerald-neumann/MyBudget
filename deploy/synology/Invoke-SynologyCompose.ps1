<#
.SYNOPSIS
  Runs docker compose on the Synology over SSH (Container Manager / Docker CLI).

.PARAMETER RemoteCommand
  Arguments after 'docker compose' (default: up -d).

.EXAMPLE
  pwsh ./deploy/synology/Invoke-SynologyCompose.ps1 -SshUser admin -SshHost diskstation.local `
    -RemoteDirectory /volume1/repos/private-budget-planner/deploy/synology -Build

.EXAMPLE
  pwsh ./deploy/synology/Invoke-SynologyCompose.ps1 -SshUser admin -SshHost diskstation.local `
    -RemoteDirectory /volume1/docker/mybudget -RemoteCommand "pull"
#>
#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string] $SshHost,

    [Parameter(Mandatory = $true)]
    [string] $SshUser,

    [Parameter(Mandatory = $true)]
    [string] $RemoteDirectory,

    [switch] $Build,

    [string] $RemoteCommand = "up -d"
)

$ErrorActionPreference = "Stop"

$extra = $RemoteCommand.Trim()
if ($Build) {
    if ($extra.StartsWith("up ")) {
        $extra = $extra -replace '^up\s+', 'up --build '
    }
    elseif ($extra -eq "up" -or $extra -eq "up -d") {
        $extra = "up --build -d"
    }
}

# Synology: non-interactive ssh often has a minimal PATH (docker compose not found). Login shell fixes it.
$composeInner = "cd `"$RemoteDirectory`" && docker compose $extra"
$remoteShell = "bash -lc `"$composeInner`""
Write-Host "ssh ${SshUser}@${SshHost} $remoteShell"
ssh "${SshUser}@${SshHost}" $remoteShell
