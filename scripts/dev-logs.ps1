param(
  [ValidateSet('all','api','worker','web','docker')]
  [string]$Service = 'all',
  [int]$Tail = 120,
  [switch]$Follow
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Show-FileLog {
  param([string]$Path)

  if (!(Test-Path $Path)) {
    Write-Host "Sem log em $Path"
    return
  }

  if ($Follow) {
    Get-Content $Path -Tail $Tail -Wait
  } else {
    Get-Content $Path -Tail $Tail
  }
}

switch ($Service) {
  'api' { Show-FileLog '.runtime/api.log'; break }
  'worker' { Show-FileLog '.runtime/worker.log'; break }
  'web' { Show-FileLog '.runtime/web.log'; break }
  'docker' {
    if ($Follow) {
      docker compose logs -f --tail $Tail
    } else {
      docker compose logs --tail $Tail
    }
    break
  }
  default {
    Write-Host '== API Log =='
    Show-FileLog '.runtime/api.log'
    Write-Host ''
    Write-Host '== Worker Log =='
    Show-FileLog '.runtime/worker.log'
    Write-Host ''
    Write-Host '== Web Log =='
    Show-FileLog '.runtime/web.log'
    Write-Host ''
    Write-Host '== Docker Log =='
    if ($Follow) {
      docker compose logs -f --tail $Tail
    } else {
      docker compose logs --tail 50
    }
  }
}
