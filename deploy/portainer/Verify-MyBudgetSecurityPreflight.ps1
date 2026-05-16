param(
    [string]$EnvFilePath = (Join-Path $PSScriptRoot ".env"),
    [string]$UiConfigPath = (Join-Path $PSScriptRoot "ui-config.json")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-EnvFile {
    param([string]$Path)
    $result = @{}
    foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
            continue
        }
        $parts = $trimmed.Split("=", 2)
        if ($parts.Count -ne 2) {
            continue
        }
        $result[$parts[0].Trim()] = $parts[1].Trim()
    }
    return $result
}

function Assert-Setting {
    param(
        [string]$Name,
        [string]$Expected,
        [string]$Actual,
        [System.Collections.Generic.List[string]]$Errors
    )
    if ($Actual -ne $Expected) {
        $Errors.Add("$Name should be '$Expected' but is '$Actual'.")
    }
}

function Get-EnvValue {
    param(
        [hashtable]$Map,
        [string]$Key
    )
    if ($Map.ContainsKey($Key)) {
        return [string]$Map[$Key]
    }
    return ""
}

if (-not (Test-Path -LiteralPath $EnvFilePath)) {
    throw "Env file not found: $EnvFilePath"
}
if (-not (Test-Path -LiteralPath $UiConfigPath)) {
    throw "UI config file not found: $UiConfigPath"
}

$envMap = Read-EnvFile -Path $EnvFilePath
$uiConfig = Get-Content -LiteralPath $UiConfigPath -Raw | ConvertFrom-Json
$errors = [System.Collections.Generic.List[string]]::new()

Assert-Setting -Name "AUTH_ENABLED" -Expected "true" -Actual (Get-EnvValue -Map $envMap -Key "AUTH_ENABLED") -Errors $errors
Assert-Setting -Name "ASPNETCORE_ENVIRONMENT" -Expected "Production" -Actual (Get-EnvValue -Map $envMap -Key "ASPNETCORE_ENVIRONMENT") -Errors $errors
Assert-Setting -Name "ENABLE_SWAGGER" -Expected "false" -Actual (Get-EnvValue -Map $envMap -Key "ENABLE_SWAGGER") -Errors $errors
Assert-Setting -Name "SWAGGER_ALLOW_IN_PRODUCTION" -Expected "false" -Actual (Get-EnvValue -Map $envMap -Key "SWAGGER_ALLOW_IN_PRODUCTION") -Errors $errors
Assert-Setting -Name "AUTH_REQUIRE_HTTPS_METADATA" -Expected "true" -Actual (Get-EnvValue -Map $envMap -Key "AUTH_REQUIRE_HTTPS_METADATA") -Errors $errors

$edgePublish = Get-EnvValue -Map $envMap -Key "MYBUDGET_EDGE_PUBLISH"
if (-not $edgePublish.StartsWith("127.0.0.1:", [System.StringComparison]::Ordinal)) {
    $errors.Add("MYBUDGET_EDGE_PUBLISH should bind loopback (127.0.0.1:hostPort:80) when TLS terminates at host nginx.")
}

if (($uiConfig.keycloak.enabled -ne $true)) {
    $errors.Add("ui-config.json keycloak.enabled must be true for production.")
}
if ($uiConfig.keycloak.debug -eq $true) {
    $errors.Add("ui-config.json keycloak.debug must be false in production.")
}
if ([string]::IsNullOrWhiteSpace($uiConfig.apiBaseUrl) -or -not $uiConfig.apiBaseUrl.StartsWith("https://", [System.StringComparison]::OrdinalIgnoreCase)) {
    $errors.Add("ui-config.json apiBaseUrl should be HTTPS in production.")
}

if ($errors.Count -gt 0) {
    Write-Host "Security preflight failed:" -ForegroundColor Red
    foreach ($err in $errors) {
        Write-Host " - $err" -ForegroundColor Red
    }
    exit 1
}

Write-Host "Security preflight checks passed." -ForegroundColor Green
