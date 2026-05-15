#Requires -Version 5.1
<#
  Local deploy pipeline timing + console progress (gitignored stats under .local/).
  Dot-sourced from deploy-my-budget.ps1 — not invoked directly.
#>

function Get-DeployPipelineTimingPath {
    param([string] $RepoRoot)
    $dir = Join-Path $RepoRoot ".local"
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    Join-Path $dir "deploy-pipeline-timing.json"
}

function Get-DeployPipelineTimingStore {
    param([string] $RepoRoot)
    $path = Get-DeployPipelineTimingPath -RepoRoot $RepoRoot
    if (-not (Test-Path -LiteralPath $path)) {
        return @{ version = 1; steps = @{} }
    }
    try {
        $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        $obj = $raw | ConvertFrom-Json
        $steps = @{}
        if ($null -ne $obj.steps) {
            $obj.steps.PSObject.Properties | ForEach-Object {
                $steps[$_.Name] = @{
                    count        = [long]$_.Value.count
                    totalSeconds = [double]$_.Value.totalSeconds
                }
            }
        }
        return @{ version = 1; steps = $steps }
    }
    catch {
        return @{ version = 1; steps = @{} }
    }
}

function Save-DeployPipelineTimingStore {
    param(
        [string] $RepoRoot,
        [hashtable] $Store
    )
    $path = Get-DeployPipelineTimingPath -RepoRoot $RepoRoot
    $stepsOut = @{}
    foreach ($key in ($Store.steps.Keys | Sort-Object)) {
        $s = $Store.steps[$key]
        $stepsOut[$key] = @{
            count        = $s.count
            totalSeconds = [math]::Round($s.totalSeconds, 2)
        }
    }
    ($stepsOut | ConvertTo-Json -Depth 4) | Set-Content -LiteralPath $path -Encoding UTF8 -NoNewline
}

function Get-DeployStepAverageSeconds {
    param(
        [hashtable] $Store,
        [string] $StepId,
        [double] $FallbackSeconds
    )
    if (-not $Store.steps.ContainsKey($StepId)) { return $FallbackSeconds }
    $s = $Store.steps[$StepId]
    if ($s.count -le 0) { return $FallbackSeconds }
    return $s.totalSeconds / $s.count
}

function Add-DeployStepTimingSample {
    param(
        [hashtable] $Store,
        [string] $StepId,
        [double] $Seconds
    )
    if (-not $Store.steps.ContainsKey($StepId)) {
        $Store.steps[$StepId] = @{ count = 0; totalSeconds = 0.0 }
    }
    $Store.steps[$StepId].count++
    $Store.steps[$StepId].totalSeconds += $Seconds
}

function New-DeployPipelineProgress {
    param(
        [string] $RepoRoot,
        [string[]] $StepIds,
        [hashtable] $FallbackSecondsByStep
    )
    $store = Get-DeployPipelineTimingStore -RepoRoot $RepoRoot
    $estimates = @{}
    $totalEstimate = 0.0
    foreach ($id in $StepIds) {
        $fb = 30.0
        if ($FallbackSecondsByStep.ContainsKey($id)) { $fb = $FallbackSecondsByStep[$id] }
        $avg = Get-DeployStepAverageSeconds -Store $store -StepId $id -FallbackSeconds $fb
        $estimates[$id] = $avg
        $totalEstimate += $avg
    }
    if ($totalEstimate -le 0) { $totalEstimate = 1.0 }

    return [PSCustomObject]@{
        RepoRoot           = $RepoRoot
        Store              = $store
        StepIds            = $StepIds
        Estimates          = $estimates
        TotalEstimate      = $totalEstimate
        CompletedSeconds   = 0.0
        CurrentStepId      = $null
        CurrentStepStarted = $null
        PipelineStarted    = [DateTime]::UtcNow
        LastRenderUtc      = [DateTime]::MinValue
        BarWidth           = 36
    }
}

function Format-DeployPipelineDuration {
    param([TimeSpan] $Span)
    if ($Span.TotalHours -ge 1) {
        return $Span.ToString('h\:mm\:ss')
    }
    return $Span.ToString('m\:ss')
}

function Write-DeployPipelineProgressLine {
    param(
        [PSCustomObject] $Progress,
        [string] $Label
    )
    $now = [DateTime]::UtcNow
    if (($now - $Progress.LastRenderUtc).TotalMilliseconds -lt 200 -and $Progress.LastRenderUtc -ne [DateTime]::MinValue) {
        return
    }
    $Progress.LastRenderUtc = $now

    $elapsed = $now - $Progress.PipelineStarted
    $done = $Progress.CompletedSeconds
    if ($null -ne $Progress.CurrentStepId -and $null -ne $Progress.CurrentStepStarted) {
        $stepElapsed = ($now - $Progress.CurrentStepStarted).TotalSeconds
        $stepEst = $Progress.Estimates[$Progress.CurrentStepId]
        $done += [math]::Min($stepElapsed, [math]::Max($stepEst, 1.0))
    }
    $pct = [math]::Min(99, [math]::Max(0, [int](100.0 * $done / $Progress.TotalEstimate)))
    $etaSpan = [TimeSpan]::FromSeconds([math]::Max(0, $Progress.TotalEstimate - $done))

    $filled = [int]($Progress.BarWidth * $pct / 100)
    if ($filled -gt $Progress.BarWidth) { $filled = $Progress.BarWidth }
    $arrow = if ($filled -lt $Progress.BarWidth) { '>' } else { '' }
    $empty = $Progress.BarWidth - $filled - $arrow.Length
    if ($empty -lt 0) { $empty = 0 }
    $bar = ('=' * $filled) + $arrow + (' ' * $empty)

    $elapsedText = Format-DeployPipelineDuration -Span $elapsed
    $etaText = Format-DeployPipelineDuration -Span $etaSpan
    $line = "[$bar] $pct% | $elapsedText / ~$etaText | $Label"
    $pad = ' ' * [math]::Max(0, 100 - $line.Length)
    Write-Host ("`r" + $line + $pad) -NoNewline
}

function Start-DeployPipelineStep {
    param(
        [PSCustomObject] $Progress,
        [string] $StepId,
        [string] $Label
    )
    $Progress.CurrentStepId = $StepId
    $Progress.CurrentStepStarted = [DateTime]::UtcNow
    Write-DeployPipelineProgressLine -Progress $Progress -Label $Label
}

function Complete-DeployPipelineStep {
    param(
        [PSCustomObject] $Progress,
        [string] $StepId,
        [double] $ElapsedSeconds,
        [string] $Label
    )
    Add-DeployStepTimingSample -Store $Progress.Store -StepId $StepId -Seconds $ElapsedSeconds
    $Progress.CompletedSeconds += $ElapsedSeconds
    $Progress.CurrentStepId = $null
    $Progress.CurrentStepStarted = $null
    Write-DeployPipelineProgressLine -Progress $Progress -Label $Label
}

function Invoke-DeployPipelineStep {
    param(
        [PSCustomObject] $Progress,
        [string] $StepId,
        [string] $Label,
        [scriptblock] $Action
    )
    Start-DeployPipelineStep -Progress $Progress -StepId $StepId -Label $Label
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $timer = New-Object System.Timers.Timer
    $timer.Interval = 400
    $timer.AutoReset = $true
    $tickState = @{ Progress = $Progress; Label = $Label }
    Register-ObjectEvent -InputObject $timer -EventName Elapsed -MessageData $tickState -Action {
        $s = $Event.MessageData
        Write-DeployPipelineProgressLine -Progress $s.Progress -Label $s.Label
    } -SourceIdentifier "DeployProgress_$StepId" | Out-Null
    $timer.Start()
    try {
        & $Action
    }
    finally {
        $timer.Stop()
        Unregister-Event -SourceIdentifier "DeployProgress_$StepId" -ErrorAction SilentlyContinue
        Remove-Event -SourceIdentifier "DeployProgress_$StepId" -ErrorAction SilentlyContinue
        $timer.Dispose()
        $sw.Stop()
        Complete-DeployPipelineStep -Progress $Progress -StepId $StepId -ElapsedSeconds $sw.Elapsed.TotalSeconds -Label $Label
    }
}

function Complete-DeployPipelineProgress {
    param([PSCustomObject] $Progress)
    Save-DeployPipelineTimingStore -RepoRoot $Progress.RepoRoot -Store $Progress.Store
    $elapsed = [DateTime]::UtcNow - $Progress.PipelineStarted
    $elapsedText = Format-DeployPipelineDuration -Span $elapsed
    $bar = '=' * $Progress.BarWidth
    Write-Host ("`r[$bar] 100% | $elapsedText | Done.                    ")
}
