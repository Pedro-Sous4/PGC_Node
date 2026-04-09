$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host 'Reiniciando ambiente (down -> up)...'

powershell -ExecutionPolicy Bypass -File './scripts/dev-down.ps1'
if ($LASTEXITCODE -ne 0) {
  throw 'Falha no dev:down durante restart.'
}

powershell -ExecutionPolicy Bypass -File './scripts/dev-up.ps1'
if ($LASTEXITCODE -ne 0) {
  throw 'Falha no dev:up durante restart.'
}

Write-Host 'Restart concluido com sucesso.'
