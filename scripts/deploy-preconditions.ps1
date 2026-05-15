#Requires -Version 5.1
<#
  Pre-flight checks for deploy-my-budget.ps1 (host target). Dot-sourced, not run directly.
#>

$script:DefaultPortainerAccessTokenOpRef = "op://myerp/portainer.flowparity.com%20api%20token/credential"

function New-DeployPreconditionFailure {
    param(
        [string] $Category,
        [string] $Message,
        [string[]] $Hints = @()
    )
    [PSCustomObject]@{
        Category = $Category
        Message  = $Message
        Hints    = @($Hints)
    }
}

function Read-DeployEnvFilePairs {
    param([string] $Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        return @()
    }
    $pairs = New-Object System.Collections.Generic.List[object]
    foreach ($line in [System.IO.File]::ReadLines($Path)) {
        $t = $line.Trim()
        if ($t.Length -eq 0 -or $t.StartsWith("#")) { continue }
        $idx = $t.IndexOf("=")
        if ($idx -lt 1) { continue }
        $pairs.Add([ordered]@{
                name  = $t.Substring(0, $idx).Trim()
                value = $t.Substring($idx + 1).Trim()
            }) | Out-Null
    }
    return $pairs.ToArray()
}

function Get-PortainerDeployAuthState {
    param([string] $RepoRoot)

    $envFile = Join-Path $RepoRoot "deploy\portainer\.env"
    $envLocalTokenPlain = $null
    $envLocalTokenOpRef = $null
    $envLocalDefaultOpRef = $null

    if (Test-Path -LiteralPath $envFile) {
        foreach ($p in (Read-DeployEnvFilePairs $envFile)) {
            $n = [string]$p.name
            $v = [string]$p.value
            if ([string]::IsNullOrWhiteSpace($v)) { continue }
            if ($n -match '^(?i)MYBUDGET_PORTAINER_DEFAULT_ACCESS_TOKEN_OP_REF$') {
                $envLocalDefaultOpRef = $v.Trim()
            }
            elseif ($n -match '^(?i)(MYBUDGET_PORTAINER_ACCESS_TOKEN_OP_REF|PORTAINER_ACCESS_TOKEN_OP_REF)$') {
                $envLocalTokenOpRef = $v.Trim()
            }
            elseif ($n -match '^(?i)(MYBUDGET_PORTAINER_ACCESS_TOKEN|PORTAINER_ACCESS_TOKEN)$') {
                $envLocalTokenPlain = $v.Trim()
            }
        }
    }

    $opCli = Get-Command op -ErrorAction SilentlyContinue
    $tokenSource = $null
    $needsOp = $false
    $opRefsToTry = @()

    if (-not [string]::IsNullOrWhiteSpace($env:MYBUDGET_PORTAINER_ACCESS_TOKEN)) {
        $tokenSource = 'environment variable MYBUDGET_PORTAINER_ACCESS_TOKEN'
    }
    elseif (-not [string]::IsNullOrWhiteSpace($env:PORTAINER_ACCESS_TOKEN)) {
        $tokenSource = 'environment variable PORTAINER_ACCESS_TOKEN'
    }
    elseif (-not [string]::IsNullOrWhiteSpace($envLocalTokenPlain)) {
        $tokenSource = 'deploy/portainer/.env (MYBUDGET_PORTAINER_ACCESS_TOKEN)'
    }
    elseif (-not [string]::IsNullOrWhiteSpace($env:MYBUDGET_PORTAINER_ACCESS_TOKEN_OP_REF)) {
        $needsOp = $true
        $opRefsToTry += $env:MYBUDGET_PORTAINER_ACCESS_TOKEN_OP_REF.Trim()
        $tokenSource = 'environment MYBUDGET_PORTAINER_ACCESS_TOKEN_OP_REF (1Password)'
    }
    elseif (-not [string]::IsNullOrWhiteSpace($env:PORTAINER_ACCESS_TOKEN_OP_REF)) {
        $needsOp = $true
        $opRefsToTry += $env:PORTAINER_ACCESS_TOKEN_OP_REF.Trim()
        $tokenSource = 'environment PORTAINER_ACCESS_TOKEN_OP_REF (1Password)'
    }
    elseif (-not [string]::IsNullOrWhiteSpace($envLocalTokenOpRef)) {
        $needsOp = $true
        $opRefsToTry += $envLocalTokenOpRef
        $tokenSource = 'deploy/portainer/.env (MYBUDGET_PORTAINER_ACCESS_TOKEN_OP_REF)'
    }
    else {
        $defaultRef = $script:DefaultPortainerAccessTokenOpRef
        if (-not [string]::IsNullOrWhiteSpace($env:MYBUDGET_PORTAINER_DEFAULT_ACCESS_TOKEN_OP_REF)) {
            $defaultRef = $env:MYBUDGET_PORTAINER_DEFAULT_ACCESS_TOKEN_OP_REF.Trim()
        }
        elseif (-not [string]::IsNullOrWhiteSpace($envLocalDefaultOpRef)) {
            $defaultRef = $envLocalDefaultOpRef
        }
        $needsOp = $true
        $opRefsToTry += $defaultRef
        $tokenSource = "built-in default 1Password ref ($defaultRef)"
    }

    return [PSCustomObject]@{
        EnvFilePath           = $envFile
        EnvFileExists         = (Test-Path -LiteralPath $envFile)
        TokenSource           = $tokenSource
        HasResolvableToken    = (-not $needsOp)
        NeedsOnePassword      = $needsOp
        OnePasswordRefs       = $opRefsToTry
        OnePasswordCliOnPath  = ($null -ne $opCli)
        EnvHasPlainTokenKey   = (-not [string]::IsNullOrWhiteSpace($envLocalTokenPlain))
        EnvHasOpRefKey        = (-not [string]::IsNullOrWhiteSpace($envLocalTokenOpRef))
    }
}

function Test-OnePasswordCliSignedIn {
    $op = Get-Command op -ErrorAction SilentlyContinue
    if (-not $op) { return $false }
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        & $op.Source whoami 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    }
    finally {
        $ErrorActionPreference = $prev
    }
}

function Test-RemoteSshAccess {
    param(
        [string] $SshExe,
        [string[]] $SshBaseArgs,
        [string] $RemoteUserHost,
        [int] $ConnectTimeoutSeconds = 15
    )
    $probeArgs = @(
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=$ConnectTimeoutSeconds",
        "-o", "StrictHostKeyChecking=accept-new"
    ) + $SshBaseArgs + @($RemoteUserHost, "echo deploy-precondition-ok")
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        $out = & $SshExe @probeArgs 2>&1
        $ok = ($LASTEXITCODE -eq 0) -and ($out -match "deploy-precondition-ok")
        return @{
            Ok      = $ok
            ExitCode = $LASTEXITCODE
            Detail  = ($out | Out-String).Trim()
        }
    }
    finally {
        $ErrorActionPreference = $prev
    }
}

function Test-DockerEngineAvailable {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        docker info 2>&1 | Out-Null
        return ($LASTEXITCODE -eq 0)
    }
    finally {
        $ErrorActionPreference = $prev
    }
}

function Test-LocalMyBudgetImagesPresent {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        docker image inspect mybudget-api:local mybudget-ui:local 2>&1 | Out-Null
        return ($LASTEXITCODE -eq 0)
    }
    finally {
        $ErrorActionPreference = $prev
    }
}

function Get-DeployHostPreconditionFailures {
    param(
        [string] $RepoRoot,
        [bool] $SkipBuild,
        [bool] $SkipSave,
        [bool] $SkipScp,
        [bool] $DoRemoteLoad,
        [bool] $DoPortainerDeploy,
        [string] $RemoteUserHost,
        [string] $IdentityFile
    )

    $failures = New-Object System.Collections.Generic.List[object]
    $needsDocker = (-not $SkipBuild) -or (-not $SkipSave) -or ($SkipBuild -and -not $SkipScp)
    $needsUpload = -not $SkipScp

    if ($needsDocker) {
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
            $failures.Add((New-DeployPreconditionFailure -Category "Docker" -Message "docker CLI not found on PATH." -Hints @(
                    "Install Docker Desktop: https://docs.docker.com/desktop/"
                    "Restart the terminal after install so docker is on PATH."
                ))) | Out-Null
        }
        elseif (-not (Test-DockerEngineAvailable)) {
            $failures.Add((New-DeployPreconditionFailure -Category "Docker" -Message "Docker CLI is installed but the engine is not reachable (is Docker Desktop running?)." -Hints @(
                    "Start Docker Desktop and wait until it reports Running."
                    "Run: docker info"
                ))) | Out-Null
        }
    }

    if (-not $SkipBuild) {
        if ([string]::IsNullOrWhiteSpace($env:FONTAWESOME_PRO_TOKEN)) {
            $failures.Add((New-DeployPreconditionFailure -Category "Font Awesome Pro" -Message "FONTAWESOME_PRO_TOKEN is not set in this shell." -Hints @(
                    "Create a token at https://fontawesome.com/account"
                    "In PowerShell: `$env:FONTAWESOME_PRO_TOKEN = 'your-token'"
                    "Then re-run: pwsh ./deploy-my-budget.ps1"
                ))) | Out-Null
        }

        if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
            $failures.Add((New-DeployPreconditionFailure -Category "Node.js" -Message "node is not on PATH (required to stamp version before docker build)." -Hints @(
                    "Install Node.js LTS: https://nodejs.org/"
                    "Verify: node --version"
                ))) | Out-Null
        }
    }

    if ($SkipBuild -and $needsUpload -and -not $SkipSave) {
        if (-not (Test-LocalMyBudgetImagesPresent)) {
            $failures.Add((New-DeployPreconditionFailure -Category "Docker images" -Message "Local images mybudget-api:local and/or mybudget-ui:local are missing (-SkipBuild)." -Hints @(
                    "Run a full deploy without -SkipBuild, or build the images manually."
                    "Verify: docker images | Select-String mybudget"
                ))) | Out-Null
        }
    }

    if ($needsUpload) {
        $ssh = Get-Command ssh -ErrorAction SilentlyContinue
        $scp = Get-Command scp -ErrorAction SilentlyContinue
        if (-not $ssh -or -not $scp) {
            $failures.Add((New-DeployPreconditionFailure -Category "SSH / SCP" -Message "ssh or scp not found on PATH." -Hints @(
                    "Windows: Settings → Apps → Optional features → OpenSSH Client"
                    "Or install Git for Windows (includes ssh/scp in Git Bash)."
                ))) | Out-Null
        }

        $sshBase = @()
        $identityFileOk = $true
        if (-not [string]::IsNullOrWhiteSpace($IdentityFile)) {
            if (-not (Test-Path -LiteralPath $IdentityFile)) {
                $identityFileOk = $false
                $failures.Add((New-DeployPreconditionFailure -Category "SSH key" -Message "Identity file not found: $IdentityFile" -Hints @(
                        "Pass -IdentityFile with the path to your private key (e.g. `$env:USERPROFILE\.ssh\hetzner_root_ed25519)."
                        "Ensure the matching public key is in authorized_keys on $RemoteUserHost."
                    ))) | Out-Null
            }
            else {
                $sshBase += "-i", $IdentityFile
            }
        }

        if ($ssh -and $identityFileOk) {
            $probe = Test-RemoteSshAccess -SshExe $ssh.Source -SshBaseArgs $sshBase -RemoteUserHost $RemoteUserHost
            if (-not $probe.Ok) {
                $detail = if ([string]::IsNullOrWhiteSpace($probe.Detail)) { "(no output)" } else { $probe.Detail }
                $hints = @(
                    "Target: $RemoteUserHost (override with -RemoteUserHost user@host)."
                )
                if ([string]::IsNullOrWhiteSpace($IdentityFile)) {
                    $hints += "If you use a non-default key, pass: -IdentityFile `"`$env:USERPROFILE\.ssh\your_key`""
                }
                $hints += @(
                    "Test manually: ssh $($sshBase -join ' ') $RemoteUserHost echo ok"
                    "BatchMode=yes requires key-based auth (no password prompt)."
                    "Ensure the host is reachable and your public key is in ~/.ssh/authorized_keys on the server."
                )
                if ($DoRemoteLoad) {
                    $hints += "Remote docker load uses the same SSH session as scp."
                }
                $msg = "Cannot reach $RemoteUserHost via ssh (exit $($probe.ExitCode))."
                if ($detail -ne "(no output)" -and $detail.Length -lt 400) {
                    $msg += " $detail"
                }
                $failures.Add((New-DeployPreconditionFailure -Category "SSH access" -Message $msg -Hints $hints)) | Out-Null
            }
        }
    }

    if ($DoPortainerDeploy) {
        if (-not (Get-Command pwsh -ErrorAction SilentlyContinue)) {
            $failures.Add((New-DeployPreconditionFailure -Category "PowerShell 7" -Message "pwsh (PowerShell 7+) not found on PATH (required for Portainer API deploy)." -Hints @(
                    "Install: https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows"
                    "Or skip Portainer: -SkipPortainerDeploy"
                ))) | Out-Null
        }

        $portainerScript = Join-Path $RepoRoot "deploy\portainer\Deploy-PortainerMyBudgetStack.ps1"
        if (-not (Test-Path -LiteralPath $portainerScript)) {
            $failures.Add((New-DeployPreconditionFailure -Category "Portainer script" -Message "Missing: deploy/portainer/Deploy-PortainerMyBudgetStack.ps1" -Hints @(
                    "Ensure the repository deploy/portainer folder is intact."
                ))) | Out-Null
        }

        $auth = Get-PortainerDeployAuthState -RepoRoot $RepoRoot
        if (-not $auth.EnvFileExists) {
            $failures.Add((New-DeployPreconditionFailure -Category "Portainer stack .env" -Message "Missing deploy/portainer/.env (stack secrets and image tags)." -Hints @(
                    "Copy: cp deploy/portainer/env.example deploy/portainer/.env"
                    "Edit POSTGRES_PASSWORD, MYBUDGET_UI_CONFIG_PATH, and other stack values."
                    "Add MYBUDGET_PORTAINER_ACCESS_TOKEN=ptr_... for the deploy script (stripped before upload to Portainer)."
                ))) | Out-Null
        }
        if ($auth.HasResolvableToken) {
            # plain token in env or .env — OK
        }
        elseif ($auth.NeedsOnePassword) {
            if (-not $auth.OnePasswordCliOnPath) {
                $failures.Add((New-DeployPreconditionFailure -Category "Portainer token" -Message "Portainer auth expects 1Password (op CLI) but 'op' is not on PATH." -Hints @(
                        "Fastest fix: add to deploy/portainer/.env → MYBUDGET_PORTAINER_ACCESS_TOKEN=ptr_..."
                        "Get ptr_… from Portainer → your user → Access tokens (personal access token)."
                        "That key is read locally only and is NOT uploaded as a stack env var."
                        "Or install 1Password CLI: https://developer.1password.com/docs/cli/get-started/"
                    ))) | Out-Null
            }
            elseif (-not (Test-OnePasswordCliSignedIn)) {
                $refHint = ($auth.OnePasswordRefs | Select-Object -First 1)
                $failures.Add((New-DeployPreconditionFailure -Category "Portainer token" -Message "1Password CLI is installed but not signed in (op whoami failed)." -Hints @(
                        "Run: op signin"
                        "Configured source: $($auth.TokenSource)"
                        "Or add MYBUDGET_PORTAINER_ACCESS_TOKEN=ptr_... to deploy/portainer/.env (no op required)."
                        "Test: op read `"$refHint`""
                    ))) | Out-Null
            }
        }
    }

    return $failures.ToArray()
}

function Assert-DeployHostPreconditions {
    param(
        [string] $RepoRoot,
        [bool] $SkipBuild,
        [bool] $SkipSave,
        [bool] $SkipScp,
        [bool] $DoRemoteLoad,
        [bool] $DoPortainerDeploy,
        [string] $RemoteUserHost,
        [string] $IdentityFile
    )

    $failures = Get-DeployHostPreconditionFailures `
        -RepoRoot $RepoRoot `
        -SkipBuild $SkipBuild `
        -SkipSave $SkipSave `
        -SkipScp $SkipScp `
        -DoRemoteLoad $DoRemoteLoad `
        -DoPortainerDeploy $DoPortainerDeploy `
        -RemoteUserHost $RemoteUserHost `
        -IdentityFile $IdentityFile

    if ($failures.Count -eq 0) {
        if (Get-Command Write-DeployDetail -ErrorAction SilentlyContinue) {
            Write-DeployDetail "Pre-flight checks passed."
        }
        return
    }

    Write-Host ""
    Write-Host "Pre-flight checks failed ($($failures.Count)):" -ForegroundColor Red
    Write-Host ""
    foreach ($f in $failures) {
        Write-Host "  [$($f.Category)] $($f.Message)" -ForegroundColor Yellow
        foreach ($h in $f.Hints) {
            Write-Host "    → $h" -ForegroundColor DarkGray
        }
        Write-Host ""
    }
    throw "Fix the pre-flight issues above, then re-run deploy-my-budget.ps1."
}
