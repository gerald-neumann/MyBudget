<#
.SYNOPSIS
  Creates or updates a Portainer Docker Compose stack from deploy/keycloak/docker-compose.yml and .env.

.DESCRIPTION
  Uses the Portainer HTTP API (standalone + string method). Requires PowerShell 7+ for -SkipCertificateCheck
  when your Portainer uses a self-signed TLS certificate.

.PARAMETER ListEndpointsOnly
  Prints Docker environment IDs and exits (helps find -EndpointId).

.NOTES
  Authentication: -AccessToken (Portainer API key ptr_… uses X-API-Key; JWT uses Bearer), or -PortainerUsername + -PortainerPassword.

  -PortainerBaseUrl defaults to https://portainer.flowparity.com (override for another Portainer host).
#>
#Requires -Version 7.0
param(
    [string] $PortainerBaseUrl = "https://portainer.flowparity.com",

    [string] $AccessToken,

    [string] $PortainerUsername,
    [string] $PortainerPassword,

    [int] $EndpointId = 0,

    [string] $StackName = "MyBudget-keycloak",

    [string] $KeycloakDir,

    [switch] $SkipCertificateCheck,

    [switch] $ListEndpointsOnly
)

$ErrorActionPreference = "Stop"

function Normalize-BaseUrl([string] $u) {
    return $u.TrimEnd("/")
}

function New-PortainerAccessHeaders([string] $token) {
    $t = $token.Trim()
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
        throw "Provide -AccessToken or both -PortainerUsername and -PortainerPassword."
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

$BaseUrl = Normalize-BaseUrl $PortainerBaseUrl
$headers = Get-PortainerHeaders -BaseUrl $BaseUrl -Token $AccessToken -User $PortainerUsername -Pass $PortainerPassword -SkipCert:$SkipCertificateCheck

if ($ListEndpointsOnly) {
    $eps = Invoke-Portainer -Uri "$BaseUrl/api/endpoints" -Headers $headers -SkipCert:$SkipCertificateCheck
    $eps | ForEach-Object { Write-Host ("Id={0}  Name={1}" -f $_.Id, $_.Name) }
    return
}

if ($EndpointId -le 0) {
    throw "Specify -EndpointId (use -ListEndpointsOnly to list environments)."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if ([string]::IsNullOrWhiteSpace($KeycloakDir)) {
    $KeycloakDir = Join-Path $repoRoot "deploy\keycloak"
}
$composePath = Join-Path $KeycloakDir "docker-compose.yml"
$envPath = Join-Path $KeycloakDir ".env"

if (-not (Test-Path $composePath)) {
    throw "Missing compose file: $composePath"
}
if (-not (Test-Path $envPath)) {
    throw "Missing $envPath. Copy deploy/keycloak/env.example or deploy/keycloak/flowparity.env.example to deploy/keycloak/.env and set secrets."
}

$composeText = [System.IO.File]::ReadAllText($composePath)
$envPairs = Read-EnvFilePairs $envPath

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
    $created = Invoke-Portainer -Uri $createUri -Headers $headers -Method Post -Body $createBody -SkipCert:$SkipCertificateCheck
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
    $updated = Invoke-Portainer -Uri $updateUri -Headers $headers -Method Put -Body $updateBody -SkipCert:$SkipCertificateCheck
    Write-Host "Updated stack Id=$($updated.Id) Name=$($updated.Name)"
}

Write-Host "Done. Configure realm and clients per deploy/portainer/PORTAINER-FLOWPARITY-DEPLOY.md §6. For flowparity Keycloak env, start from deploy/keycloak/flowparity.env.example."
