#Requires -Version 5.1
<#
.SYNOPSIS
  Single entry point for MyBudget deployment (host or Synology).

.DESCRIPTION
  **Host** (default): build mybudget-api:local + mybudget-ui:local (linux/amd64), save one tar, scp to the
  Docker host, remote **docker load**, then **deploy/portainer/Deploy-PortainerMyBudgetStack.ps1** (endpoint **3**,
  **-SkipCertificateCheck** unless **-PortainerValidateCertificate**).

  Step durations are stored in **.local/deploy-pipeline-timing.json** (gitignored) and drive a Docker-style
  progress bar on later runs.

  Runs **pre-flight checks** first (Docker, Font Awesome token, SSH, Portainer auth, etc.) and reports what
  is missing with hints before starting the pipeline.

  By default only the **progress bar** is shown (docker/scp/ssh/portainer output is hidden). Pass **-Verbose**
  to stream full command output. Failures always print captured output.

  **Synology**: delegates to **deploy/synology/Deploy-SynologyPrebuiltFromLocal.ps1** when present.

.PARAMETER Target
  **Host** or **Synology**.

.PARAMETER SkipBuild
  Host only: skip image build (images must exist locally).

.PARAMETER SkipSave
  Host only: build only, no tar or upload.

.PARAMETER SkipScp
  Host only: build + save tar locally, no upload/load/Portainer.

.PARAMETER SkipRemoteDockerLoad
  Host only: upload tar but skip remote **docker load**.

.PARAMETER RemoveRemoteTarAfterLoad
  Host only: delete remote tar after successful **docker load**.

.PARAMETER SkipPortainerDeploy
  Host only: skip Portainer stack update.

.PARAMETER PortainerEndpointId
  Host only: Portainer environment id (default **3**).

.PARAMETER PortainerValidateCertificate
  Host only: do not pass **-SkipCertificateCheck** to the Portainer deploy script.

.EXAMPLE
  $env:FONTAWESOME_PRO_TOKEN = '...'
  pwsh ./deploy-my-budget.ps1 -IdentityFile "$env:USERPROFILE\.ssh\hetzner_root_ed25519"

.EXAMPLE
  pwsh ./deploy-my-budget.ps1 -Verbose

.EXAMPLE
  pwsh ./deploy-my-budget.ps1 -SkipRemoteDockerLoad -SkipPortainerDeploy

.EXAMPLE
  pwsh ./deploy-my-budget.ps1 -Target Synology `
    -SshHost diskstation.local -SshUser admin -RemoteDirectory /volume1/docker/mybudget
#>
[CmdletBinding(DefaultParameterSetName = "Host")]
param(
    [ValidateSet("Host", "Synology")]
    [string] $Target = "Host",

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
    [switch] $RemoteDockerLoad,

    [Parameter(ParameterSetName = "Host")]
    [switch] $RemoveRemoteTarAfterLoad,

    [Parameter(ParameterSetName = "Host")]
    [switch] $SkipPortainerDeploy,

    [Parameter(ParameterSetName = "Host")]
    [int] $PortainerEndpointId = 3,

    [Parameter(ParameterSetName = "Host")]
    [switch] $PortainerValidateCertificate,

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
    $synologyScript = Join-Path $repoRoot "deploy\synology\Deploy-SynologyPrebuiltFromLocal.ps1"
    if (-not (Test-Path -LiteralPath $synologyScript)) {
        throw "Synology script not found: $synologyScript"
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
    Write-Host "deploy-my-budget: Synology -> $synologyScript"
    & $synologyScript @synArgs
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        throw "Deploy-SynologyPrebuiltFromLocal.ps1 exited with code $LASTEXITCODE."
    }
    return
}

$doRemoteLoad = (-not $SkipScp) -and (
    $RemoteDockerLoad.IsPresent -or (-not $SkipRemoteDockerLoad.IsPresent)
)
$doPortainerDeploy = (-not $SkipPortainerDeploy) -and ($PortainerEndpointId -gt 0)
$portainerSkipCertCheck = -not $PortainerValidateCertificate.IsPresent

. (Join-Path $repoRoot "scripts\deploy-output.ps1")
Initialize-DeployOutput -RepoRoot $repoRoot

. (Join-Path $repoRoot "scripts\deploy-preconditions.ps1")
Assert-DeployHostPreconditions `
    -RepoRoot $repoRoot `
    -SkipBuild $SkipBuild.IsPresent `
    -SkipSave $SkipSave.IsPresent `
    -SkipScp $SkipScp.IsPresent `
    -DoRemoteLoad $doRemoteLoad `
    -DoPortainerDeploy $doPortainerDeploy `
    -RemoteUserHost $RemoteUserHost `
    -IdentityFile $IdentityFile

. (Join-Path $repoRoot "scripts\deploy-pipeline-progress.ps1")

function Write-RemoteDeployInstructions {
    param([string] $RemoteUserHost, [string] $RemoteDir, [string] $TarFileName)
    $rTar = "$RemoteDir/$TarFileName".Replace("\", "/")
    @"

--- On the remote host ($RemoteUserHost) ---

1) Load images (or re-run without **-SkipRemoteDockerLoad**):

   docker load -i $rTar

2) Confirm:

   docker images | grep -E 'mybudget-api|mybudget-ui'

3) Portainer stack (or re-run without **-SkipPortainerDeploy**):

   pwsh ./deploy-my-budget.ps1 -SkipBuild -SkipSave

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
    Write-DeployDetail ("ssh " + ($all -join " "))
    Invoke-DeployExecutable -FilePath $SshPath -ArgumentList $all -FailureMessage "ssh remote command failed"
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
    Write-DeployDetail "Invoking Portainer stack deploy: $($pwsh.Source) $($childArgs -join ' ')"
    Invoke-DeployPwshFile -PwshPath $pwsh.Source -ArgumentList $childArgs `
        -FailureMessage "Deploy-PortainerMyBudgetStack.ps1 failed"
}

$tarPath = Join-Path $repoRoot $TarFileName

$fallbackSeconds = @{
    'stamp'       = 3.0
    'build-api'   = 90.0
    'build-ui'    = 180.0
    'save'        = 25.0
    'ssh-mkdir'   = 2.0
    'scp'         = 120.0
    'remote-load' = 45.0
    'remote-rm'   = 2.0
    'portainer'   = 15.0
}

$plannedSteps = [System.Collections.Generic.List[string]]::new()
if (-not $SkipBuild) {
    $plannedSteps.Add("stamp") | Out-Null
    $plannedSteps.Add("build-api") | Out-Null
    $plannedSteps.Add("build-ui") | Out-Null
}
if (-not $SkipSave) {
    $plannedSteps.Add("save") | Out-Null
}
if (-not $SkipScp) {
    $plannedSteps.Add("ssh-mkdir") | Out-Null
    $plannedSteps.Add("scp") | Out-Null
    if ($doRemoteLoad) {
        $plannedSteps.Add("remote-load") | Out-Null
        if ($RemoveRemoteTarAfterLoad) { $plannedSteps.Add("remote-rm") | Out-Null }
    }
}
if ($doPortainerDeploy) { $plannedSteps.Add("portainer") | Out-Null }

$pipelineProgress = $null
if ($plannedSteps.Count -gt 0) {
    $pipelineProgress = New-DeployPipelineProgress -RepoRoot $repoRoot -StepIds $plannedSteps.ToArray() -FallbackSecondsByStep $fallbackSeconds
    if ($script:DeployOutputVerbose) { Write-Host "" }
}

$platform = "linux/amd64"
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue

if (-not $SkipBuild) {
    $buildTimestampUtc = [DateTime]::UtcNow.ToString("o")

    Invoke-DeployPipelineStep -Progress $pipelineProgress -StepId stamp -Label "Stamping version / build time" -Action {
        Write-DeployDetail "Stamping shared version and build time (UTC $buildTimestampUtc)..."
        Invoke-DeployExecutable -FilePath $nodeCmd.Source -ArgumentList @(
            (Join-Path $repoRoot "scripts\stamp-build-info.cjs"), "--timestamp", $buildTimestampUtc
        ) -FailureMessage "stamp-build-info failed"
    }

    $dockerBuildArgs = @("--build-arg", "BUILD_TIMESTAMP_UTC=$buildTimestampUtc")
    if (-not $script:DeployOutputVerbose) {
        $dockerBuildArgs += "--progress=quiet"
    }

    $apiDockerBuildArgs = @("build", "--platform=$platform") + $dockerBuildArgs + @(
        "-f", "backend/MyBudget.Api/Dockerfile", "-t", "mybudget-api:local", "."
    )
    $uiDockerBuildArgs = @("build", "--platform=$platform") + $dockerBuildArgs + @(
        "-f", "frontend/my-budget-ui/Dockerfile", "-t", "mybudget-ui:local",
        "--secret", "id=fontawesome_npm_token,env=FONTAWESOME_PRO_TOKEN", "."
    )

    Push-Location $repoRoot
    try {
        Invoke-DeployPipelineStep -Progress $pipelineProgress -StepId build-api -Label "Building API image ($platform)" -Action {
            Invoke-DeployExecutable -FilePath "docker" -ArgumentList $apiDockerBuildArgs `
                -FailureMessage "docker build (API) failed"
        }

        Invoke-DeployPipelineStep -Progress $pipelineProgress -StepId build-ui -Label "Building UI image ($platform)" -Action {
            Invoke-DeployExecutable -FilePath "docker" -ArgumentList $uiDockerBuildArgs `
                -FailureMessage "docker build (UI) failed"
        }
    }
    finally {
        Pop-Location
    }

    Write-DeployDetail "Done build. Tags: mybudget-api:local, mybudget-ui:local"
}

if ($SkipSave) {
    if ($null -ne $pipelineProgress) { Complete-DeployPipelineProgress -Progress $pipelineProgress }
    Write-DeployUserMessage "SkipSave: not writing tar or upload."
    return
}

Invoke-DeployPipelineStep -Progress $pipelineProgress -StepId save -Label "Saving images to tar" -Action {
    Write-DeployDetail "Saving images to $tarPath ..."
    Invoke-DeployExecutable -FilePath "docker" -ArgumentList @(
        "image", "inspect", "mybudget-api:local", "mybudget-ui:local"
    ) -FailureMessage "Local images mybudget-api:local / mybudget-ui:local not found"
    Invoke-DeployExecutable -FilePath "docker" -ArgumentList @(
        "save", "-o", $tarPath, "mybudget-api:local", "mybudget-ui:local"
    ) -FailureMessage "docker save failed"
    Write-DeployDetail "Tar size: $([math]::Round((Get-Item -LiteralPath $tarPath).Length / 1MB, 2)) MB"
}

if ($SkipScp) {
    Write-DeployUserMessage "SkipScp: tar is at $tarPath — upload manually if needed."
    if ($doRemoteLoad) {
        throw "Remote docker load cannot be used with -SkipScp."
    }
    if ($RemoveRemoteTarAfterLoad) {
        throw "-RemoveRemoteTarAfterLoad requires remote docker load and upload (omit -SkipScp)."
    }
    if (-not $doPortainerDeploy) {
        Write-DeployUserMessage ""
        Write-RemoteDeployInstructions -RemoteUserHost $RemoteUserHost -RemoteDir $RemoteDir -TarFileName $TarFileName
    }
}
else {
    $sshCmd = Get-Command ssh
    $scpCmd = Get-Command scp

    $sshBase = @()
    $scpBase = @()
    if (-not [string]::IsNullOrWhiteSpace($IdentityFile)) {
        $sshBase += "-i", $IdentityFile
        $scpBase += "-i", $IdentityFile
    }

    $remoteTar = "$RemoteDir/$TarFileName".Replace("\", "/")

    Invoke-DeployPipelineStep -Progress $pipelineProgress -StepId ssh-mkdir -Label "Preparing remote directory" -Action {
        Write-DeployDetail "Ensuring remote directory exists: ${RemoteUserHost}:$RemoteDir"
        Invoke-DeployExecutable -FilePath $sshCmd.Source -ArgumentList @($sshBase + @($RemoteUserHost, "mkdir -p $RemoteDir")) `
            -FailureMessage "ssh mkdir failed"
    }

    Invoke-DeployPipelineStep -Progress $pipelineProgress -StepId scp -Label "Uploading image tar (scp)" -Action {
        Write-DeployDetail "Uploading via scp to ${RemoteUserHost}:$remoteTar"
        $scpArgs = $scpBase + @($tarPath, "${RemoteUserHost}:$remoteTar")
        Write-DeployDetail ("scp " + ($scpArgs -join " "))
        Invoke-DeployExecutable -FilePath $scpCmd.Source -ArgumentList $scpArgs -FailureMessage "scp failed"
        Write-DeployDetail "Upload finished."
    }

    if ($doRemoteLoad) {
        Invoke-DeployPipelineStep -Progress $pipelineProgress -StepId remote-load -Label "Remote docker load" -Action {
            Write-DeployDetail "Running docker load on $RemoteUserHost ..."
            $loadCmd = "docker load -i '$remoteTar'"
            Invoke-RemoteSshCommand -SshPath $sshCmd.Source -SshBaseArgs $sshBase -RemoteUserHost $RemoteUserHost -RemoteShellCommand $loadCmd
            Write-DeployDetail "Remote docker load finished."
        }

        if ($RemoveRemoteTarAfterLoad) {
            Invoke-DeployPipelineStep -Progress $pipelineProgress -StepId remote-rm -Label "Removing remote tar" -Action {
                Write-DeployDetail "Removing remote tar: $remoteTar"
                Invoke-RemoteSshCommand -SshPath $sshCmd.Source -SshBaseArgs $sshBase -RemoteUserHost $RemoteUserHost -RemoteShellCommand "rm -f '$remoteTar'"
            }
        }
    }
    elseif (-not $doPortainerDeploy) {
        Write-DeployUserMessage ""
        Write-RemoteDeployInstructions -RemoteUserHost $RemoteUserHost -RemoteDir $RemoteDir -TarFileName $TarFileName
    }
}

if ($doPortainerDeploy) {
    Invoke-DeployPipelineStep -Progress $pipelineProgress -StepId portainer -Label "Portainer stack deploy (endpoint $PortainerEndpointId)" -Action {
        Invoke-PortainerMyBudgetDeploy -RepoRoot $repoRoot -EndpointId $PortainerEndpointId -SkipCertificateCheck $portainerSkipCertCheck
    }
}

if ($null -ne $pipelineProgress) {
    Complete-DeployPipelineProgress -Progress $pipelineProgress
}
