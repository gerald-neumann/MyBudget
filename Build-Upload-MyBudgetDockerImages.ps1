#Requires -Version 5.1
<#
.SYNOPSIS
  Build mybudget-api:local + mybudget-ui:local, save a single tar, and scp it to your Portainer/Docker host (default: Hetzner).

.DESCRIPTION
  Builds linux/amd64 images (UI needs FONTAWESOME_PRO_TOKEN). Generic docker build / save / scp / optional ssh load.

  Optional: after upload, **-RemoteDockerLoad** runs `docker load -i …` on the server via **ssh** (same **-IdentityFile** as scp).
  Optional: **-PortainerEndpointId** runs **deploy/portainer/Deploy-PortainerMyBudgetStack.ps1** in a **pwsh** child (Portainer API from your PC — same token flow as that script).

.PARAMETER SkipBuild
  Only docker save + scp (images must already exist locally).

.PARAMETER SkipSave
  Only build (no tar, no scp).

.PARAMETER SkipScp
  Build + save tar locally only.

.PARAMETER RemoteDockerLoad
  After scp: run `docker load -i <tar>` on the remote host via ssh (same host as **RemoteUserHost**).

.PARAMETER RemoveRemoteTarAfterLoad
  After a successful remote **docker load**, run `rm -f` on the uploaded tar on the server.

.PARAMETER PortainerEndpointId
  If greater than zero: after upload/load, run **deploy/portainer/Deploy-PortainerMyBudgetStack.ps1** in a **pwsh** child (Portainer HTTP API from this machine).

.PARAMETER PortainerDeploySkipCertificateCheck
  Pass **-SkipCertificateCheck** to the Portainer deploy script (self-signed Portainer TLS).

.EXAMPLE
  $env:FONTAWESOME_PRO_TOKEN = '...'
  pwsh ./Build-Upload-MyBudgetDockerImages.ps1

.EXAMPLE
  pwsh ./Build-Upload-MyBudgetDockerImages.ps1 -RemoteUserHost "root@65.109.84.102" -RemoteDir "/opt/stacks/mybudget" -IdentityFile "$env:USERPROFILE\.ssh\hetzner_root_ed25519"

.EXAMPLE
  # Upload, docker load on server, then update the Portainer stack (token from deploy/portainer/.env or env)
  pwsh ./Build-Upload-MyBudgetDockerImages.ps1 `
    -IdentityFile "$env:USERPROFILE\.ssh\hetzner_root_ed25519" `
    -RemoteDockerLoad -RemoveRemoteTarAfterLoad `
    -PortainerEndpointId 3 -PortainerDeploySkipCertificateCheck
#>
param(
    [string] $RemoteUserHost = "root@65.109.84.102",

    [string] $RemoteDir = "/opt/stacks/mybudget",

    [string] $TarFileName = "MyBudget-app-images.tar",

    [string] $IdentityFile = "",

    [switch] $SkipBuild,

    [switch] $SkipSave,

    [switch] $SkipScp,

    # After scp: ssh to the same host and run docker load (requires a successful upload in this run, or use without -SkipScp after a prior upload).
    [switch] $RemoteDockerLoad,

    # After a successful **RemoteDockerLoad**: remove the tar on the server to save disk.
    [switch] $RemoveRemoteTarAfterLoad,

    # If > 0: invoke deploy/portainer/Deploy-PortainerMyBudgetStack.ps1 via pwsh (reads deploy/portainer/.env for Portainer token).
    [int] $PortainerEndpointId = 0,

    [switch] $PortainerDeploySkipCertificateCheck
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$tarPath = Join-Path $repoRoot $TarFileName

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker CLI not found. Install Docker Desktop and ensure it is running."
}

function Write-RemoteInstructions {
    param([string] $RemoteUserHost, [string] $RemoteDir, [string] $TarFileName)
    $rTar = "$RemoteDir/$TarFileName".Replace("\", "/")
    @"

--- On the remote host ($RemoteUserHost) ---

1) Load images into Docker (run once per new tar), or from your PC add **-RemoteDockerLoad** to Build-Upload-MyBudgetDockerImages.ps1 after scp:

   docker load -i $rTar

   You should see 'Loaded image: mybudget-api:local' and 'Loaded image: mybudget-ui:local'.

2) Confirm:

   docker images | grep -E 'mybudget-api|mybudget-ui'

3) Deploy / refresh the stack (from your PC):

   pwsh ./deploy/portainer/Deploy-PortainerMyBudgetStack.ps1 -EndpointId 3 -SkipCertificateCheck

   Or in Portainer: Stacks -> mybudget -> Editor / Pull & redeploy as you prefer.

   Or pass **-PortainerEndpointId** to Build-Upload-MyBudgetDockerImages.ps1 after **-RemoteDockerLoad**.

4) Optional: remove the tar on the server after load: **-RemoveRemoteTarAfterLoad** on Build-Upload, or:

   rm -f $rTar

---
"@ | Write-Host
}

function Invoke-RemoteSshCommand {
    param(
        [string] $SshPath,
        [string[]] $SshBaseArgs,
        [string] $RemoteUserHost,
        [string] $RemoteShellCommand
    )
    $all = @($SshBaseArgs + @($RemoteUserHost, $RemoteShellCommand))
    Write-Host ("ssh " + ($all -join " "))
    & $SshPath @all
    if ($LASTEXITCODE -ne 0) { throw "ssh remote command failed with exit $LASTEXITCODE." }
}

function Invoke-PortainerMyBudgetDeploy {
    param(
        [string] $RepoRoot,
        [int] $EndpointId,
        [bool] $SkipCertificateCheck
    )
    $deployScript = Join-Path $RepoRoot "deploy\portainer\Deploy-PortainerMyBudgetStack.ps1"
    if (-not (Test-Path -LiteralPath $deployScript)) {
        throw "Deploy script not found: $deployScript"
    }
    $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
    if (-not $pwsh) {
        throw "pwsh not found on PATH. Install PowerShell 7+ or run deploy/portainer/Deploy-PortainerMyBudgetStack.ps1 manually."
    }
    $childArgs = @("-NoProfile", "-File", $deployScript, "-EndpointId", "$EndpointId")
    if ($SkipCertificateCheck) {
        $childArgs += "-SkipCertificateCheck"
    }
    Write-Host "Invoking Portainer stack deploy: $($pwsh.Source) $($childArgs -join ' ')"
    & $pwsh.Source @childArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Deploy-PortainerMyBudgetStack.ps1 exited with code $LASTEXITCODE."
    }
}

$platform = "linux/amd64"

if (-not $SkipBuild) {
    if ([string]::IsNullOrWhiteSpace($env:FONTAWESOME_PRO_TOKEN)) {
        throw "FONTAWESOME_PRO_TOKEN is not set (required for Font Awesome Pro npm install). Set it in this shell, then re-run."
    }

    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        throw "node not found on PATH (required to stamp shared version/build time before docker build)."
    }

    $buildTimestampUtc = [DateTime]::UtcNow.ToString("o")
    Write-Host "Stamping shared version and build time (UTC $buildTimestampUtc)..."
    & $nodeCmd.Source (Join-Path $repoRoot "scripts\stamp-build-info.cjs") --timestamp $buildTimestampUtc
    if ($LASTEXITCODE -ne 0) { throw "stamp-build-info failed with exit $LASTEXITCODE." }

    $dockerBuildArgs = @("--build-arg", "BUILD_TIMESTAMP_UTC=$buildTimestampUtc")

    Push-Location $repoRoot
    try {
        Write-Host "Building API image (platform $platform)..."
        docker build --platform=$platform @dockerBuildArgs -f backend/MyBudget.Api/Dockerfile -t mybudget-api:local .
        if ($LASTEXITCODE -ne 0) { throw "docker build (API) failed with exit $LASTEXITCODE." }

        Write-Host "Building UI image (platform $platform)..."
        docker build --platform=$platform @dockerBuildArgs -f frontend/my-budget-ui/Dockerfile -t mybudget-ui:local --secret id=fontawesome_npm_token,env=FONTAWESOME_PRO_TOKEN .
        if ($LASTEXITCODE -ne 0) { throw "docker build (UI) failed with exit $LASTEXITCODE." }
    }
    finally {
        Pop-Location
    }

    Write-Host "Done build. Tags: mybudget-api:local, mybudget-ui:local"
}

if ($SkipSave) {
    Write-Host "SkipSave: not writing tar or scp."
    return
}

Write-Host "Saving images to $tarPath ..."
docker image inspect mybudget-api:local mybudget-ui:local | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Local images mybudget-api:local / mybudget-ui:local not found. Omit -SkipBuild or run a successful build in this script first."
}
docker save -o $tarPath mybudget-api:local mybudget-ui:local
if ($LASTEXITCODE -ne 0) { throw "docker save failed with exit $LASTEXITCODE." }
Write-Host "Tar size: $([math]::Round((Get-Item -LiteralPath $tarPath).Length / 1MB, 2)) MB"

if ($SkipScp) {
    Write-Host "SkipScp: tar is at $tarPath — upload manually if needed."
    if ($RemoteDockerLoad) {
        throw "-RemoteDockerLoad cannot be used with -SkipScp (no tar was uploaded in this run)."
    }
    if ($RemoveRemoteTarAfterLoad) {
        throw "-RemoveRemoteTarAfterLoad requires -RemoteDockerLoad and a successful upload (omit -SkipScp)."
    }
    Write-Host ""
    if ($PortainerEndpointId -le 0) {
        Write-RemoteInstructions -RemoteUserHost $RemoteUserHost -RemoteDir $RemoteDir -TarFileName $TarFileName
    }
}
else {
    $sshCmd = Get-Command ssh -ErrorAction SilentlyContinue
    $scpCmd = Get-Command scp -ErrorAction SilentlyContinue
    if (-not $sshCmd -or -not $scpCmd) {
        throw "ssh/scp not found on PATH (install OpenSSH Client)."
    }

    $sshBase = @()
    $scpBase = @()
    if (-not [string]::IsNullOrWhiteSpace($IdentityFile)) {
        if (-not (Test-Path -LiteralPath $IdentityFile)) { throw "Identity file not found: $IdentityFile" }
        $sshBase += "-i", $IdentityFile
        $scpBase += "-i", $IdentityFile
    }

    Write-Host "Ensuring remote directory exists: ${RemoteUserHost}:$RemoteDir"
    & $sshCmd.Source @($sshBase + @($RemoteUserHost, "mkdir -p $RemoteDir"))
    if ($LASTEXITCODE -ne 0) { throw "ssh mkdir failed with exit $LASTEXITCODE." }

    $remoteTar = "$RemoteDir/$TarFileName".Replace("\", "/")
    Write-Host "Uploading via scp to ${RemoteUserHost}:$remoteTar"
    $scpArgs = $scpBase + @($tarPath, "${RemoteUserHost}:$remoteTar")
    Write-Host ("scp " + ($scpArgs -join " "))
    & $scpCmd.Source @scpArgs
    if ($LASTEXITCODE -ne 0) { throw "scp failed with exit $LASTEXITCODE." }

    Write-Host "Upload finished."

    if ($RemoteDockerLoad) {
        Write-Host "Running docker load on $RemoteUserHost ..."
        $loadCmd = "docker load -i '$remoteTar'"
        Invoke-RemoteSshCommand -SshPath $sshCmd.Source -SshBaseArgs $sshBase -RemoteUserHost $RemoteUserHost -RemoteShellCommand $loadCmd
        Write-Host "Remote docker load finished."
        if ($RemoveRemoteTarAfterLoad) {
            Write-Host "Removing remote tar: $remoteTar"
            Invoke-RemoteSshCommand -SshPath $sshCmd.Source -SshBaseArgs $sshBase -RemoteUserHost $RemoteUserHost -RemoteShellCommand "rm -f '$remoteTar'"
        }
    }
    else {
        Write-Host ""
        Write-RemoteInstructions -RemoteUserHost $RemoteUserHost -RemoteDir $RemoteDir -TarFileName $TarFileName
    }
}

if ($PortainerEndpointId -gt 0) {
    Invoke-PortainerMyBudgetDeploy -RepoRoot $repoRoot -EndpointId $PortainerEndpointId -SkipCertificateCheck $PortainerDeploySkipCertificateCheck.IsPresent
}
elseif (-not $SkipScp -and $RemoteDockerLoad) {
    Write-Host "Tip: pass -PortainerEndpointId N to refresh the Portainer stack from this script after load."
}
