#Requires -Version 5.1
<#
  Quiet vs verbose console output for deploy-my-budget.ps1. Dot-sourced, not run directly.
#>

$script:DeployOutputVerbose = $false

function Initialize-DeployOutput {
    param(
        [string] $RepoRoot,
        [switch] $ForceVerbose
    )
    $fromPreference = ($VerbosePreference -eq 'Continue') -or ($DebugPreference -eq 'Continue')
    $script:DeployOutputVerbose = $ForceVerbose.IsPresent -or $fromPreference
}

function Test-DeployHasTimingHistory {
    param([string] $RepoRoot)
    $path = Join-Path $RepoRoot ".local\deploy-pipeline-timing.json"
    if (-not (Test-Path -LiteralPath $path)) {
        return $false
    }
    try {
        $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        $obj = $raw | ConvertFrom-Json
        if ($null -eq $obj.steps) { return $false }
        foreach ($prop in $obj.steps.PSObject.Properties) {
            if ($prop.Value.count -gt 0) { return $true }
        }
    }
    catch { }
    return $false
}

function Write-DeployDetail {
    param([string] $Message)
    if ($script:DeployOutputVerbose) {
        Write-Host $Message
    }
}

function Write-DeployUserMessage {
    param([string] $Message)
    Write-Host $Message
}

function Test-DeployCapturedCommandFailed {
    param(
        [int] $ExitCode,
        $CapturedOutput
    )
    if ($ExitCode -ne 0) { return $true }
    if ($null -eq $CapturedOutput) { return $false }
    $text = ($CapturedOutput | Out-String).Trim()
    if ($text.Length -eq 0) { return $false }
    return $text -match '(?m)^ERROR:'
}

function Write-DeployCapturedOutput {
    param($CapturedOutput)
    if ($null -eq $CapturedOutput) { return }
    $text = ($CapturedOutput | Out-String).Trim()
    if ($text.Length -gt 0) {
        Write-Host ""
        Write-Host $text
    }
}

function Invoke-DeployExecutable {
    param(
        [string] $FilePath,
        [object[]] $ArgumentList = @(),
        [string] $FailureMessage = "Command failed."
    )
    if ($script:DeployOutputVerbose) {
        & $FilePath @ArgumentList
        $exitCode = $LASTEXITCODE
    }
    else {
        $captured = & $FilePath @ArgumentList 2>&1
        $exitCode = $LASTEXITCODE
        if (Test-DeployCapturedCommandFailed -ExitCode $exitCode -CapturedOutput $captured) {
            Write-DeployCapturedOutput -CapturedOutput $captured
            throw "$FailureMessage (exit $exitCode)"
        }
        return
    }
    if ($exitCode -ne 0) {
        throw "$FailureMessage (exit $exitCode)"
    }
}

function Invoke-DeployPwshFile {
    param(
        [string] $PwshPath,
        [string[]] $ArgumentList,
        [string] $FailureMessage
    )
    if ($script:DeployOutputVerbose) {
        & $PwshPath @ArgumentList
        $exitCode = $LASTEXITCODE
    }
    else {
        $captured = & $PwshPath @ArgumentList 2>&1
        $exitCode = $LASTEXITCODE
        if (Test-DeployCapturedCommandFailed -ExitCode $exitCode -CapturedOutput $captured) {
            Write-DeployCapturedOutput -CapturedOutput $captured
            throw "$FailureMessage (exit $exitCode)"
        }
        return
    }
    if ($exitCode -ne 0) {
        throw "$FailureMessage (exit $exitCode)"
    }
}
