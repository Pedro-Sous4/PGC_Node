$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-ServiceStatus {
  param(
    [string]$Name,
    [int]$ProcessId,
    [string]$Url,
    [string[]]$Patterns,
    [int]$HttpAttempts = 3
  )

  $running = $false
  $resolvedPid = $ProcessId
  if ($ProcessId -gt 0) {
    $running = $null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
  }

  if (-not $running -and $Patterns.Count -gt 0) {
    $proc = Get-CimInstance Win32_Process |
      Where-Object {
        $line = $_.CommandLine
        if ([string]::IsNullOrWhiteSpace($line)) { return $false }
        foreach ($pattern in $Patterns) {
          if ($line -match $pattern) { return $true }
        }
        return $false
      } |
      Select-Object -First 1

    if ($null -ne $proc) {
      $running = $true
      $resolvedPid = [int]$proc.ProcessId
    }
  }

  $http = 'N/A'
  if ($Url) {
    for ($attempt = 0; $attempt -lt $HttpAttempts; $attempt++) {
      try {
        $code = (Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 4).StatusCode
        $http = [string]$code
        break
      } catch {
        $http = 'DOWN'
        if ($attempt -lt ($HttpAttempts - 1)) {
          Start-Sleep -Milliseconds 800
        }
      }
    }
  }

  [PSCustomObject]@{
    service = $Name
    process = if ($running) { 'UP' } else { 'DOWN' }
    pid = if ($resolvedPid -gt 0) { $resolvedPid } else { '' }
    http = $http
  }
}

Write-Host '== App Services =='
$pids = $null
if (Test-Path '.runtime/dev-pids.json') {
  try {
    $pids = Get-Content '.runtime/dev-pids.json' | ConvertFrom-Json
  } catch {
    $pids = $null
  }
}

$apiPid = 0
$workerPid = 0
$webPid = 0
if ($null -ne $pids) {
  $apiPid = [int]$pids.api
  $workerPid = [int]$pids.worker
  $webPid = [int]$pids.web
}

@(
  Get-ServiceStatus -Name 'api' -ProcessId $apiPid -Url 'http://localhost:3001/health' -Patterns @('@pgc/api run dev', 'ts-node-dev\\lib\\wrap\.js src/main\.ts')
  Get-ServiceStatus -Name 'worker' -ProcessId $workerPid -Url '' -Patterns @('@pgc/worker run dev', 'ts-node-dev\\lib\\wrap\.js src/main\.ts')
  Get-ServiceStatus -Name 'web' -ProcessId $webPid -Url 'http://localhost:3000' -Patterns @('next dev -p 3000', '@pgc/web run dev', 'next\\dist\\server\\lib\\start-server\.js')
) | Format-Table -AutoSize

if ($null -eq $pids) {
  Write-Host ''
  Write-Host 'Aviso: .runtime/dev-pids.json ausente ou invalido; status baseado em descoberta por processo/HTTP.'
}

Write-Host ''
Write-Host '== Docker Services =='
docker compose ps
