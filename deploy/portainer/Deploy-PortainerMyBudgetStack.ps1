#Requires -Version 7.0
<#
.SYNOPSIS
  Create or update the MyBudget Docker Compose stack in Portainer via HTTP API (standalone + string method).

.DESCRIPTION
  Reads deploy/portainer/docker-compose.yml, merges env from deploy/portainer/.env,
  then POST/PUT to Portainer (same pattern as deploy/portainer/Deploy-PortainerKeycloakStack.ps1).

.PARAMETER ListEndpointsOnly
  Lists Docker environment IDs and exits (use to find -EndpointId).

.NOTES
  Auth (pick one; avoid -AccessToken on the command line — it is visible in shell history):
  - Lines in deploy/portainer/.env: MYBUDGET_PORTAINER_ACCESS_TOKEN_OP_REF (1Password) or MYBUDGET_PORTAINER_ACCESS_TOKEN (plain ptr_…); both stripped before Portainer upload
  - -AccessTokenOpRef 'op://Vault/Item/field'   # 1Password CLI (`op signin`); see https://developer.1password.com/docs/cli/secrets-reference-syntax/
  - or MYBUDGET_PORTAINER_ACCESS_TOKEN_OP_REF / PORTAINER_ACCESS_TOKEN_OP_REF in the process environment
  - -AccessTokenFile (file contains one line: the token), or
  - environment variable MYBUDGET_PORTAINER_ACCESS_TOKEN or PORTAINER_ACCESS_TOKEN in the current process, or
  Portainer personal access tokens (prefix ptr_) are sent as header X-API-Key. JWT from -PortainerUsername login uses Bearer.

  Keys MYBUDGET_PORTAINER_ACCESS_TOKEN and PORTAINER_ACCESS_TOKEN are stripped from the stack .env before upload
  so they are not stored as Portainer stack environment variables.

  Set MYBUDGET_UI_CONFIG_PATH in .env to an absolute path on the Portainer host (e.g. /opt/stacks/mybudget/ui-config.json).

  Default -PortainerBaseUrl is https://portainer.flowparity.com. Override for another host, or set MYBUDGET_PORTAINER_BASE_URL / PORTAINER_BASE_URL in the environment.

  If no token is set elsewhere, the script tries 1Password reference -DefaultAccessTokenOpRef (default: op://myerp/…/credential). Run op signin first. Use -SkipDefaultAccessTokenOpRef to disable.

.EXAMPLE
  op signin
  pwsh ./deploy/portainer/Deploy-PortainerMyBudgetStack.ps1 -EndpointId 2 -SkipCertificateCheck

.EXAMPLE
  op signin
  pwsh ./deploy/portainer/Deploy-PortainerMyBudgetStack.ps1 `
    -AccessTokenOpRef "op://Private/Portainer flowparity/credential" `
    -EndpointId 2 -SkipCertificateCheck

.EXAMPLE
  pwsh ./deploy/portainer/Deploy-PortainerMyBudgetStack.ps1 -ListEndpointsOnly `
    -AccessTokenFile "$env:USERPROFILE\.secrets\portainer.ptr" `
    -SkipCertificateCheck
#>
param(
    [string] $PortainerBaseUrl = "https://portainer.flowparity.com",

    [string] $AccessToken,

    [string] $AccessTokenOpRef,

    [string] $AccessTokenFile,

    [string] $PortainerUsername,
    [string] $PortainerPassword,

    [string] $PortainerPasswordOpRef,

    [string] $PortainerPasswordFile,

    [int] $EndpointId = 0,

    [string] $StackName = "mybudget",

    [string] $StackDir,

    [string] $EnvFile,

    [switch] $SkipCertificateCheck,

    [switch] $ListEndpointsOnly,

    # If no token from flags/env/.env, try this 1Password ref (spaces in item name → %20). Override if your field is not "credential".
    [string] $DefaultAccessTokenOpRef = "op://myerp/portainer.flowparity.com%20api%20token/credential",

    [switch] $SkipDefaultAccessTokenOpRef
)

if (-not [string]::IsNullOrWhiteSpace($env:MYBUDGET_PORTAINER_DEFAULT_ACCESS_TOKEN_OP_REF)) {
    $DefaultAccessTokenOpRef = $env:MYBUDGET_PORTAINER_DEFAULT_ACCESS_TOKEN_OP_REF.Trim()
}

$ErrorActionPreference = "Stop"

function Normalize-BaseUrl([string] $u) {
    $t = $u.Trim()
    if ($t.Length -eq 0) {
        return $t
    }
    if ($t -notmatch '^(https?|HTTPS?)://') {
        $t = "https://$t"
    }
    return $t.TrimEnd("/")
}

function New-PortainerAccessHeaders([string] $token) {
    $t = $token.Trim()
    # Portainer API keys / personal access tokens (prefix ptr_) require X-API-Key — Bearer is only for JWT from POST /api/auth.
    if ($t.StartsWith("ptr_", [StringComparison]::OrdinalIgnoreCase)) {
        return @{ "X-API-Key" = $t }
    }
    return @{ Authorization = "Bearer $t" }
}

function Get-PortainerHeaders {
    param(
        [string] $BaseUrl,
        [string] $Token,
        [string] $User,
        [string] $Pass,
        [bool] $SkipCert
    )
    $params = @{ Uri = "$BaseUrl/api/auth"; Method = "Post"; ContentType = "application/json" }
    if ($SkipCert) { $params["SkipCertificateCheck"] = $true }

    if (-not [string]::IsNullOrEmpty($Token)) {
        return (New-PortainerAccessHeaders $Token)
    }
    if ([string]::IsNullOrEmpty($User) -or [string]::IsNullOrEmpty($Pass)) {
        throw @"
Missing Portainer authentication. Prefer (no token on the command line):

  -AccessTokenOpRef 'op://Vault/Item/credential'   # 1Password CLI (`op signin`)

  -AccessTokenFile '$env:USERPROFILE\.secrets\portainer.ptr'   # one line: ptr_...

or set for this shell only:

  `$env:MYBUDGET_PORTAINER_ACCESS_TOKEN = (Get-Content ... -Raw).Trim()

or:

  -PortainerUsername 'you' -PortainerPassword '...'   # or -PortainerPasswordOpRef / -PortainerPasswordFile

Then:

  pwsh ./deploy/portainer/Deploy-PortainerMyBudgetStack.ps1 `
    -PortainerBaseUrl 'https://portainer.flowparity.com' `
    -AccessTokenOpRef 'op://Private/Portainer/credential' `
    -SkipCertificateCheck -ListEndpointsOnly
"@
    }
    $body = @{ Username = $User; Password = $Pass } | ConvertTo-Json
    $auth = Invoke-RestMethod @params -Body $body
    if (-not $auth.jwt) {
        throw "Portainer auth response missing 'jwt'."
    }
    return @{ Authorization = "Bearer $($auth.jwt)" }
}

function Invoke-Portainer {
    param(
        [string] $Uri,
        [hashtable] $Headers,
        [string] $Method = "Get",
        $Body,
        [bool] $SkipCert
    )
    $p = @{
        Uri             = $Uri
        Method          = $Method
        Headers         = $Headers
        ContentType     = "application/json"
    }
    if ($null -ne $Body) {
        $p["Body"] = $Body
    }
    if ($SkipCert) { $p["SkipCertificateCheck"] = $true }
    Invoke-RestMethod @p
}

function Invoke-PortainerStackDeploy {
    param(
        [string] $Uri,
        [hashtable] $Headers,
        [string] $Method,
        [string] $Body,
        [bool] $SkipCert
    )
    try {
        Invoke-Portainer -Uri $Uri -Headers $Headers -Method $Method -Body $Body -SkipCert:$SkipCert
    }
    catch {
        $msg = $_.Exception.Message
        if ($msg -match 'port is already allocated|Bind for .+ failed') {
            throw @"
Host port bind conflict while deploying the stack (mybudget-ui publish from MYBUDGET_EDGE_PUBLISH).

See deploy/portainer/PORTAINER-FLOWPARITY-DEPLOY.md §2.5: on the Docker host, find and stop the container still using that host port (often a stale mybudget-ui or legacy mybudget-reverse-proxy), or change MYBUDGET_EDGE_PUBLISH to a free port and update host nginx proxy_pass.

Original error:
$msg
"@
        }
        throw
    }
}

function Test-OnePasswordCliAvailable {
    return $null -ne (Get-Command op -ErrorAction SilentlyContinue)
}

function Read-OnePasswordSecret([string] $secretRef) {
    $ref = $secretRef.Trim()
    if ($ref.Length -eq 0) {
        return $null
    }
    if ($ref -notmatch '^op://') {
        throw "AccessTokenOpRef / PortainerPasswordOpRef must start with op:// (got: $($ref.Substring(0, [Math]::Min(20, $ref.Length)))…). See https://developer.1password.com/docs/cli/secrets-reference-syntax/"
    }
    $opCmd = Get-Command op -ErrorAction SilentlyContinue
    if (-not $opCmd) {
        throw "1Password CLI 'op' not found on PATH. Install: https://developer.1password.com/docs/cli/get-started/"
    }
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        # Single-arg URI after "read" — avoids splitting vault/item names that contain spaces.
        $stdout = & $opCmd.Source @("read", $ref) 2>$null
    }
    finally {
        $ErrorActionPreference = $prevEap
    }
    if ($LASTEXITCODE -ne 0) {
        throw "op read failed (exit code $LASTEXITCODE). Run ``op signin`` and check the reference. Docs: https://developer.1password.com/docs/cli/secrets-reference-syntax/"
    }
    $t = if ($null -eq $stdout) {
        ""
    }
    elseif ($stdout -is [string]) {
        $stdout.Trim()
    }
    else {
        ($stdout | Out-String).Trim()
    }
    if ($t.Length -eq 0) {
        throw "op read returned empty output for: $ref"
    }
    return $t
}

function Read-FirstNonCommentLine([string] $path) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Secret file not found: $path"
    }
    foreach ($line in [System.IO.File]::ReadLines($path)) {
        $t = $line.Trim()
        if ($t.Length -eq 0 -or $t.StartsWith("#")) {
            continue
        }
        return $t
    }
    throw "Secret file is empty or only comments: $path"
}

function Remove-PortainerLocalSecretsFromEnvPairs([object[]] $pairs) {
    $blocked = [System.Collections.Generic.HashSet[string]]::new(
        [StringComparer]::OrdinalIgnoreCase)
    [void]$blocked.Add("PORTAINER_ACCESS_TOKEN")
    [void]$blocked.Add("MYBUDGET_PORTAINER_ACCESS_TOKEN")
    [void]$blocked.Add("PORTAINER_ACCESS_TOKEN_OP_REF")
    [void]$blocked.Add("MYBUDGET_PORTAINER_ACCESS_TOKEN_OP_REF")
    [void]$blocked.Add("PORTAINER_PASSWORD")
    [void]$blocked.Add("MYBUDGET_PORTAINER_PASSWORD")
    [void]$blocked.Add("PORTAINER_PASSWORD_OP_REF")
    [void]$blocked.Add("MYBUDGET_PORTAINER_PASSWORD_OP_REF")
    [void]$blocked.Add("MYBUDGET_PORTAINER_BASE_URL")
    [void]$blocked.Add("PORTAINER_BASE_URL")
    [void]$blocked.Add("MYBUDGET_PORTAINER_DEFAULT_ACCESS_TOKEN_OP_REF")
    return @($pairs | Where-Object { -not $blocked.Contains([string]$_.name) })
}

function Read-EnvFilePairs([string] $path) {
    if (-not (Test-Path $path)) {
        return @()
    }
    $pairs = New-Object System.Collections.Generic.List[object]
    Get-Content -Path $path | ForEach-Object {
        $line = $_.Trim()
        if ($line.Length -eq 0 -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -lt 1) { return }
        $name = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim()
        $pairs.Add([ordered]@{ name = $name; value = $value })
    }
    return $pairs.ToArray()
}

if ([string]::IsNullOrWhiteSpace($PortainerBaseUrl)) {
    $PortainerBaseUrl = $env:MYBUDGET_PORTAINER_BASE_URL
}
if ([string]::IsNullOrWhiteSpace($PortainerBaseUrl)) {
    $PortainerBaseUrl = $env:PORTAINER_BASE_URL
}
if ([string]::IsNullOrWhiteSpace($PortainerBaseUrl)) {
    $PortainerBaseUrl = "https://portainer.flowparity.com"
}

$PortainerBaseUrl = Normalize-BaseUrl $PortainerBaseUrl
$BaseUrl = $PortainerBaseUrl

$effectiveToken = $AccessToken
if ([string]::IsNullOrWhiteSpace($effectiveToken) -and -not [string]::IsNullOrWhiteSpace($AccessTokenOpRef)) {
    if (-not (Test-OnePasswordCliAvailable)) {
        throw "-AccessTokenOpRef requires the 1Password CLI 'op' on PATH. Install: https://developer.1password.com/docs/cli/get-started/"
    }
    $effectiveToken = Read-OnePasswordSecret $AccessTokenOpRef
}
if ([string]::IsNullOrWhiteSpace($effectiveToken) -and -not [string]::IsNullOrWhiteSpace($env:MYBUDGET_PORTAINER_ACCESS_TOKEN_OP_REF)) {
    if (-not (Test-OnePasswordCliAvailable)) {
        throw "`$env:MYBUDGET_PORTAINER_ACCESS_TOKEN_OP_REF is set but 'op' is not on PATH. Install the 1Password CLI or use MYBUDGET_PORTAINER_ACCESS_TOKEN instead."
    }
    $effectiveToken = Read-OnePasswordSecret $env:MYBUDGET_PORTAINER_ACCESS_TOKEN_OP_REF
}
if ([string]::IsNullOrWhiteSpace($effectiveToken) -and -not [string]::IsNullOrWhiteSpace($env:PORTAINER_ACCESS_TOKEN_OP_REF)) {
    if (-not (Test-OnePasswordCliAvailable)) {
        throw "`$env:PORTAINER_ACCESS_TOKEN_OP_REF is set but 'op' is not on PATH. Install the 1Password CLI or use PORTAINER_ACCESS_TOKEN instead."
    }
    $effectiveToken = Read-OnePasswordSecret $env:PORTAINER_ACCESS_TOKEN_OP_REF
}
if ([string]::IsNullOrWhiteSpace($effectiveToken) -and -not [string]::IsNullOrWhiteSpace($AccessTokenFile)) {
    $effectiveToken = Read-FirstNonCommentLine $AccessTokenFile
}
if ([string]::IsNullOrWhiteSpace($effectiveToken)) {
    $effectiveToken = $env:MYBUDGET_PORTAINER_ACCESS_TOKEN
}
if ([string]::IsNullOrWhiteSpace($effectiveToken)) {
    $effectiveToken = $env:PORTAINER_ACCESS_TOKEN
}

$effectivePassword = $PortainerPassword
if ([string]::IsNullOrWhiteSpace($effectivePassword) -and -not [string]::IsNullOrWhiteSpace($PortainerPasswordOpRef)) {
    if (-not (Test-OnePasswordCliAvailable)) {
        throw "-PortainerPasswordOpRef requires the 1Password CLI 'op' on PATH. Install: https://developer.1password.com/docs/cli/get-started/"
    }
    $effectivePassword = Read-OnePasswordSecret $PortainerPasswordOpRef
}
if ([string]::IsNullOrWhiteSpace($effectivePassword) -and -not [string]::IsNullOrWhiteSpace($env:MYBUDGET_PORTAINER_PASSWORD_OP_REF)) {
    if (-not (Test-OnePasswordCliAvailable)) {
        throw "`$env:MYBUDGET_PORTAINER_PASSWORD_OP_REF is set but 'op' is not on PATH."
    }
    $effectivePassword = Read-OnePasswordSecret $env:MYBUDGET_PORTAINER_PASSWORD_OP_REF
}
if ([string]::IsNullOrWhiteSpace($effectivePassword) -and -not [string]::IsNullOrWhiteSpace($env:PORTAINER_PASSWORD_OP_REF)) {
    if (-not (Test-OnePasswordCliAvailable)) {
        throw "`$env:PORTAINER_PASSWORD_OP_REF is set but 'op' is not on PATH."
    }
    $effectivePassword = Read-OnePasswordSecret $env:PORTAINER_PASSWORD_OP_REF
}
if ([string]::IsNullOrWhiteSpace($effectivePassword) -and -not [string]::IsNullOrWhiteSpace($PortainerPasswordFile)) {
    $effectivePassword = Read-FirstNonCommentLine $PortainerPasswordFile
}

# Deploy-only secrets in deploy/portainer/.env (these keys are stripped before upload to Portainer).
$repoRootEarly = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$stackDirEarly = if (-not [string]::IsNullOrWhiteSpace($StackDir)) {
    $StackDir
}
else {
    Join-Path $repoRootEarly "deploy\portainer"
}
$envFileEarly = if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile
}
else {
    Join-Path $stackDirEarly ".env"
}

$envLocalTokenOpRef = $null
$envLocalTokenPlain = $null
$envLocalPasswordOpRef = $null
$envLocalPasswordPlain = $null
$envLocalDefaultAccessTokenOpRef = $null
if (Test-Path -LiteralPath $envFileEarly) {
    foreach ($p in (Read-EnvFilePairs $envFileEarly)) {
        $n = [string]$p.name
        $v = [string]$p.value
        if ([string]::IsNullOrWhiteSpace($v)) {
            continue
        }
        $v = $v.Trim()
        if ($n -match '^(?i)MYBUDGET_PORTAINER_DEFAULT_ACCESS_TOKEN_OP_REF$') {
            $envLocalDefaultAccessTokenOpRef = $v
            continue
        }
        if ($n -match '^(?i)(MYBUDGET_PORTAINER_ACCESS_TOKEN_OP_REF|PORTAINER_ACCESS_TOKEN_OP_REF)$') {
            $envLocalTokenOpRef = $v
            continue
        }
        if ($n -match '^(?i)(MYBUDGET_PORTAINER_ACCESS_TOKEN|PORTAINER_ACCESS_TOKEN)$') {
            $envLocalTokenPlain = $v
            continue
        }
        if ($n -match '^(?i)(MYBUDGET_PORTAINER_PASSWORD_OP_REF|PORTAINER_PASSWORD_OP_REF)$') {
            $envLocalPasswordOpRef = $v
            continue
        }
        if ($n -match '^(?i)(MYBUDGET_PORTAINER_PASSWORD|PORTAINER_PASSWORD)$') {
            $envLocalPasswordPlain = $v
            continue
        }
    }
}

if ([string]::IsNullOrWhiteSpace($effectiveToken)) {
    if (-not [string]::IsNullOrWhiteSpace($envLocalTokenOpRef)) {
        if (-not (Test-OnePasswordCliAvailable)) {
            throw "deploy/portainer/.env sets MYBUDGET_PORTAINER_ACCESS_TOKEN_OP_REF (or PORTAINER_*) but the 1Password CLI 'op' is not on PATH. Install: https://developer.1password.com/docs/cli/get-started/ — or use MYBUDGET_PORTAINER_ACCESS_TOKEN=ptr_... instead."
        }
        $effectiveToken = Read-OnePasswordSecret $envLocalTokenOpRef
    }
    elseif (-not [string]::IsNullOrWhiteSpace($envLocalTokenPlain)) {
        $effectiveToken = $envLocalTokenPlain
    }
}
if ([string]::IsNullOrWhiteSpace($effectivePassword)) {
    if (-not [string]::IsNullOrWhiteSpace($envLocalPasswordOpRef)) {
        if (-not (Test-OnePasswordCliAvailable)) {
            throw "deploy/portainer/.env sets a Portainer password OP_REF but the 1Password CLI 'op' is not on PATH. Install the CLI or use MYBUDGET_PORTAINER_PASSWORD=... instead."
        }
        $effectivePassword = Read-OnePasswordSecret $envLocalPasswordOpRef
    }
    elseif (-not [string]::IsNullOrWhiteSpace($envLocalPasswordPlain)) {
        $effectivePassword = $envLocalPasswordPlain
    }
}

$default1PasswordTokenFailure = $null
$defaultRefSkippedNoOpCli = $false
$opRefForDefaultTry = $DefaultAccessTokenOpRef
if (-not [string]::IsNullOrWhiteSpace($envLocalDefaultAccessTokenOpRef)) {
    $opRefForDefaultTry = $envLocalDefaultAccessTokenOpRef
}
if (
    -not $SkipDefaultAccessTokenOpRef -and
    [string]::IsNullOrWhiteSpace($effectiveToken) -and
    -not [string]::IsNullOrWhiteSpace($opRefForDefaultTry)
) {
    if (-not (Test-OnePasswordCliAvailable)) {
        $defaultRefSkippedNoOpCli = $true
    }
    else {
        try {
            $effectiveToken = Read-OnePasswordSecret $opRefForDefaultTry
        }
        catch {
            $default1PasswordTokenFailure = $_.Exception.Message
        }
    }
}

if (-not [string]::IsNullOrWhiteSpace($effectiveToken)) {
    $effectiveToken = $effectiveToken.Trim()
}
if (-not [string]::IsNullOrWhiteSpace($effectivePassword)) {
    $effectivePassword = $effectivePassword.Trim()
}

function Throw-PortainerAuthMissing {
    param(
        [string] $ExpectedEnvPath,
        [string] $DefaultOpFailure,
        [string] $DefaultOpRef,
        [switch] $SkippedDefaultRefBecauseNoOpCli,
        [switch] $EnvFileHasNoDeployTokenKeys
    )
    Write-Host ""
    Write-Host "Missing Portainer authentication." -ForegroundColor Yellow
    Write-Host ""
    if ($EnvFileHasNoDeployTokenKeys) {
        Write-Host "Hint: $ExpectedEnvPath exists but has no MYBUDGET_PORTAINER_ACCESS_TOKEN (or *_OP_REF) for the deploy script. Add a line like MYBUDGET_PORTAINER_ACCESS_TOKEN=ptr_... — it is stripped before upload to Portainer." -ForegroundColor Cyan
        Write-Host ""
    }
    if ($SkippedDefaultRefBecauseNoOpCli) {
        Write-Host "The 1Password CLI (op) is not on PATH, so the script default ref was not used:" -ForegroundColor DarkYellow
        Write-Host "  $DefaultOpRef"
        Write-Host ""
        Write-Host "Choose one:"
        Write-Host "  1) Fastest (no op): add MYBUDGET_PORTAINER_ACCESS_TOKEN=ptr_... to deploy/portainer/.env (keep that file gitignored)."
        Write-Host "  2) Install 1Password CLI and restart the terminal (PATH): https://developer.1password.com/docs/cli/get-started/"
        Write-Host "  3) -AccessTokenFile path\to\portainer.ptr   or   `$env:MYBUDGET_PORTAINER_ACCESS_TOKEN = 'ptr_...'"
        Write-Host ""
    }
    elseif (-not [string]::IsNullOrWhiteSpace($DefaultOpFailure)) {
        Write-Host "Tried default 1Password token ref but it failed (fix vault/item/field or use -DefaultAccessTokenOpRef):" -ForegroundColor DarkYellow
        Write-Host "  $DefaultOpRef"
        Write-Host "  $($DefaultOpFailure.Trim())"
        Write-Host ""
    }
    Write-Host "Easiest: add ONE of these to your gitignored file (values are NOT sent to Portainer as stack env):"
    Write-Host "  deploy/portainer/.env"
    Write-Host ""
    Write-Host "  MYBUDGET_PORTAINER_ACCESS_TOKEN_OP_REF=op://Vault/Item/credential   (requires 'op' on PATH + op signin)"
    Write-Host "  ... or"
    Write-Host "  MYBUDGET_PORTAINER_ACCESS_TOKEN=ptr_..."
    Write-Host ""
    if (-not $SkippedDefaultRefBecauseNoOpCli) {
        Write-Host "Or rely on the built-in default (myerp / portainer.flowparity.com api token) after op signin; override with -DefaultAccessTokenOpRef or disable with -SkipDefaultAccessTokenOpRef."
        Write-Host ""
    }
    Write-Host "Expected .env path: $ExpectedEnvPath"
    Write-Host "  (copy deploy/portainer/env.example -> .env if missing)"
    Write-Host ""
    Write-Host "Alternatives: -AccessTokenFile, `$env:MYBUDGET_PORTAINER_ACCESS_TOKEN, -PortainerUsername + password / -PortainerPasswordFile."
    Write-Host ""
    throw "Missing Portainer authentication (see messages above)."
}

# Early auth check (clearer than failing inside Get-PortainerHeaders)
if (
    [string]::IsNullOrWhiteSpace($effectiveToken) -and
    ([string]::IsNullOrWhiteSpace($PortainerUsername) -or [string]::IsNullOrWhiteSpace($effectivePassword))
) {
    $envFileExistsOnDisk = Test-Path -LiteralPath $envFileEarly
    $envFileHasNoDeployTokenKeys = $envFileExistsOnDisk -and
        [string]::IsNullOrWhiteSpace($envLocalTokenPlain) -and
        [string]::IsNullOrWhiteSpace($envLocalTokenOpRef)
    Throw-PortainerAuthMissing -ExpectedEnvPath $envFileEarly `
        -DefaultOpFailure $default1PasswordTokenFailure `
        -DefaultOpRef $opRefForDefaultTry `
        -SkippedDefaultRefBecauseNoOpCli:$defaultRefSkippedNoOpCli `
        -EnvFileHasNoDeployTokenKeys:$envFileHasNoDeployTokenKeys
}

$headers = Get-PortainerHeaders -BaseUrl $BaseUrl -Token $effectiveToken -User $PortainerUsername -Pass $effectivePassword -SkipCert:$SkipCertificateCheck

if ($ListEndpointsOnly) {
    $eps = Invoke-Portainer -Uri "$BaseUrl/api/endpoints" -Headers $headers -SkipCert:$SkipCertificateCheck
    $eps | ForEach-Object { Write-Host ("Id={0}  Name={1}" -f $_.Id, $_.Name) }
    return
}

if ($EndpointId -le 0) {
    throw "Specify -EndpointId (use -ListEndpointsOnly to list environments)."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if ([string]::IsNullOrWhiteSpace($StackDir)) {
    $StackDir = Join-Path $repoRoot "deploy\portainer"
}
$composePath = Join-Path $StackDir "docker-compose.yml"
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path $StackDir ".env"
}

if (-not (Test-Path $composePath)) {
    throw "Missing compose file: $composePath"
}
if (-not (Test-Path $EnvFile)) {
    throw "Missing env file: $EnvFile (copy deploy/portainer/env.example to .env and edit secrets)."
}

$composeText = [System.IO.File]::ReadAllText($composePath)

$envPairs = Remove-PortainerLocalSecretsFromEnvPairs (Read-EnvFilePairs $EnvFile)

$stacks = Invoke-Portainer -Uri "$BaseUrl/api/stacks" -Headers $headers -SkipCert:$SkipCertificateCheck
$existing = $stacks | Where-Object { $_.Name -eq $StackName -and $_.EndpointId -eq $EndpointId } | Select-Object -First 1

if ($null -eq $existing) {
    $createBody = [ordered]@{
        Name               = $StackName
        StackFileContent   = $composeText
        Env                = @($envPairs)
        FromAppTemplate    = $false
    } | ConvertTo-Json -Depth 8

    $createUri = "$BaseUrl/api/stacks/create/standalone/string?endpointId=$EndpointId"
    $created = Invoke-PortainerStackDeploy -Uri $createUri -Headers $headers -Method Post -Body $createBody -SkipCert:$SkipCertificateCheck
    Write-Host "Created stack Id=$($created.Id) Name=$($created.Name)"
}
else {
    $updateBody = [ordered]@{
        StackFileContent         = $composeText
        Env                      = @($envPairs)
        Prune                    = $false
        RepullImageAndRedeploy   = $true
    } | ConvertTo-Json -Depth 8

    $updateUri = "$BaseUrl/api/stacks/$($existing.Id)?endpointId=$EndpointId"
    $updated = Invoke-PortainerStackDeploy -Uri $updateUri -Headers $headers -Method Put -Body $updateBody -SkipCert:$SkipCertificateCheck
    Write-Host "Updated stack Id=$($updated.Id) Name=$($updated.Name)"
}

Write-Host "Done. See deploy/portainer/PORTAINER-FLOWPARITY-DEPLOY.md for host nginx and Keycloak."
