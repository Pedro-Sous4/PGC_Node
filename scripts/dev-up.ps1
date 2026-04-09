$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-EnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$DefaultValue
  )

  if (!(Test-Path $Path)) {
    return $DefaultValue
  }

  $line = Get-Content $Path | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($line)) {
    return $DefaultValue
  }

  $value = $line.Substring($Key.Length + 1).Trim()
  if ($value.StartsWith('"') -and $value.EndsWith('"')) {
    return $value.Trim('"')
  }

  return $value
}

function Get-ProcessIdByPattern {
  param([string]$Pattern)

  $proc = Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -match $Pattern } |
    Select-Object -First 1

  if ($null -eq $proc) { return $null }
  return [int]$proc.ProcessId
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

function Wait-ForHttp {
  param(
    [string]$Name,
    [string]$Url,
    [int]$MaxAttempts = 25,
    [int]$DelaySeconds = 2
  )

  for ($i = 0; $i -lt $MaxAttempts; $i++) {
    try {
      $statusCode = (Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 4).StatusCode
      if ($statusCode -ge 200 -and $statusCode -lt 500) {
        return $true
      }
    } catch {
      # no-op
    }
    Start-Sleep -Seconds $DelaySeconds
  }

  throw "$Name nao respondeu em $Url no tempo esperado."
}

function Start-AppProcess {
  param(
    [string]$Name,
    [string]$Command
  )

  $logPath = ".runtime/$Name.log"

  $fullLogPath = Join-Path $root $logPath
  $cmdLine = "cd /d `"$root`" && $Command >> `"$fullLogPath`" 2>&1"

  $proc = Start-Process `
    -FilePath 'cmd.exe' `
    -ArgumentList @('/c', $cmdLine) `
    -WindowStyle Hidden `
    -PassThru

  return $proc.Id
}

if (!(Test-Path '.env') -and (Test-Path '.env.example')) {
  Copy-Item '.env.example' '.env'
}

$databaseUrl = Get-EnvValue -Path '.env' -Key 'DATABASE_URL' -DefaultValue 'postgresql://postgres:postgres@localhost:5432/pgc'
$apiPort = Get-EnvValue -Path '.env' -Key 'APP_PORT' -DefaultValue '3001'
$webPort = '3000'

New-Item -ItemType Directory -Path '.runtime' -Force | Out-Null

Write-Host 'Limpando processos stale locais...'
Stop-ByPattern -Pattern '@pgc/api run dev'
Stop-ByPattern -Pattern '@pgc/worker run dev'
Stop-ByPattern -Pattern '@pgc/web run dev'
Stop-ByPattern -Pattern 'ts-node-dev\\lib\\wrap\.js src/main\.ts'
Stop-ByPattern -Pattern 'ts-node-dev\\lib\\bin\.js.*src/main\.ts'
Stop-ByPattern -Pattern 'next dev -p 3000'
Stop-ByPattern -Pattern 'next\\dist\\server\\lib\\start-server\.js'
Stop-ByPort -Port 3000
Stop-ByPort -Port 3001
Start-Sleep -Seconds 1

Write-Host 'Limpando cache de build do frontend (.next)...'
try {
  Remove-Item -Recurse -Force (Join-Path $root 'apps\web\.next') -ErrorAction SilentlyContinue
} catch {
  # no-op
}

Write-Host 'Subindo infraestrutura Docker...'
docker compose up -d | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw 'Falha ao subir infraestrutura Docker.'
}

Write-Host 'Aguardando Postgres ficar pronto...'
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 2
  try {
    $null = docker exec pgc-postgres pg_isready -U postgres -d pgc
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
  } catch {
    # no-op
  }
}

if (-not $ready) {
  throw 'Postgres nao ficou pronto a tempo.'
}

Write-Host 'Aguardando Redis ficar pronto...'
$redisReady = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 1
  try {
    $null = docker exec pgc-redis redis-cli ping
    if ($LASTEXITCODE -eq 0) {
      $redisReady = $true
      break
    }
  } catch {
    # no-op
  }
}

if (-not $redisReady) {
  throw 'Redis nao ficou pronto a tempo.'
}

Write-Host 'Aplicando migracoes Prisma...'
$env:DATABASE_URL = $databaseUrl
npm --workspace @pgc/api run prisma:deploy | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw 'Falha ao aplicar migracoes Prisma.'
}

$apiPid = Start-AppProcess -Name 'api' -Command "set DATABASE_URL=$databaseUrl && npm --workspace @pgc/api run dev"
$workerPid = Start-AppProcess -Name 'worker' -Command 'npm --workspace @pgc/worker run dev'
$webPid = Start-AppProcess -Name 'web' -Command 'npm --workspace @pgc/web run dev'

Write-Host 'Aguardando API e Web ficarem disponiveis...'
$null = Wait-ForHttp -Name 'API' -Url "http://localhost:$apiPort/health"
$null = Wait-ForHttp -Name 'Web' -Url "http://localhost:$webPort"

$pids = [ordered]@{
  api = $apiPid
  worker = $workerPid
  web = $webPid
  createdAt = (Get-Date).ToString('o')
}

$pids | ConvertTo-Json | Set-Content '.runtime/dev-pids.json'

Write-Host ''
Write-Host 'Ambiente iniciado com sucesso:'
Write-Host "- Frontend: http://localhost:$webPort"
Write-Host "- API:      http://localhost:$apiPort"
Write-Host "- Swagger:  http://localhost:$apiPort/docs"
Write-Host '- Prometheus: http://localhost:9090'
Write-Host '- MinIO:      http://localhost:9001'
