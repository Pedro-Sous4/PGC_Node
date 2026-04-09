$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Stop-IfRunning {
  param([int]$ProcessId)

  if ($ProcessId -le 0) { return }
  $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($null -ne $proc) {
    try {
      taskkill /PID $ProcessId /T /F *> $null
    } catch {
      Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
}

function Stop-ByPattern {
  param([string]$Pattern)

  $procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match $Pattern }
  foreach ($proc in $procs) {
    try {
      taskkill /PID ([int]$proc.ProcessId) /T /F *> $null
    } catch {
      # no-op
    }
  }
}

function Stop-ByPort {
  param([int]$Port)

  try {
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
      try {
        taskkill /PID ([int]$connection.OwningProcess) /T /F *> $null
      } catch {
        # no-op
      }
    }
  } catch {
    # no-op
  }
}

if (Test-Path '.runtime/dev-pids.json') {
  $pids = Get-Content '.runtime/dev-pids.json' | ConvertFrom-Json
  Stop-IfRunning -ProcessId ([int]$pids.api)
  Stop-IfRunning -ProcessId ([int]$pids.worker)
  Stop-IfRunning -ProcessId ([int]$pids.web)
  Remove-Item '.runtime/dev-pids.json' -Force -ErrorAction SilentlyContinue
}

Stop-ByPattern -Pattern '@pgc/api run dev'
Stop-ByPattern -Pattern '@pgc/worker run dev'
Stop-ByPattern -Pattern '@pgc/web run dev'
Stop-ByPattern -Pattern 'ts-node-dev\\lib\\wrap\.js src/main\.ts'
Stop-ByPattern -Pattern 'ts-node-dev\\lib\\bin\.js.*src/main\.ts'
Stop-ByPattern -Pattern 'next dev -p 3000'
Stop-ByPattern -Pattern 'next\\dist\\server\\lib\\start-server\.js'
Stop-ByPort -Port 3000
Stop-ByPort -Port 3001

Write-Host 'Parando infraestrutura Docker...'
docker compose down | Out-Host

Write-Host 'Ambiente desligado.'
