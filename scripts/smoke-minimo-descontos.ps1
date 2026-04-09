$ErrorActionPreference = 'Stop'

$apiDir = Join-Path $PSScriptRoot '../apps/api'
$pgcCode = 'PGC-DINAMICO-03'
$pgcDir = Join-Path $apiDir "artifacts/pgc-$pgcCode"
New-Item -ItemType Directory -Path $pgcDir -Force | Out-Null

$minimoPath = Join-Path $pgcDir 'MINIMO.xlsx'
$descontosPath = Join-Path $pgcDir 'DESCONTOS.xlsx'
$empPath = Join-Path $pgcDir 'EMPRESAS_NOMECURTO_CNPJ.xlsx'

node -e "const XLSX=require('xlsx'); const wb1=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb1,XLSX.utils.json_to_sheet([{CREDOR:'Maria da Silva','MINIMO/FIXO':'R$ 500,00','EMPRESA EMISSAO':'EMP_TESTE',CNPJ:''}]),'MINIMO'); XLSX.writeFile(wb1, process.argv[1]); const wb2=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2,XLSX.utils.json_to_sheet([{CREDOR:'Maria da Silva',DESCRICAO:'ADIANTAMENTO',VALOR:'R$ 120,00'},{CREDOR:'Maria da Silva',DESCRICAO:'AJUSTE',VALOR:'R$ 15,40'}]),'DESCONTOS'); XLSX.writeFile(wb2, process.argv[2]); const wb3=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb3,XLSX.utils.json_to_sheet([{nome_curto:'EMP_TESTE',cnpj:'12.345.678/0001-99'}]),'MAPA'); XLSX.writeFile(wb3, process.argv[3]);" "$minimoPath" "$descontosPath" "$empPath"

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$gname = "GRUPO_EMAIL_DINAMICO_$suffix"
$email = "maria.dinamico.$suffix@example.com"

$grupo = Invoke-RestMethod -Method Post -Uri 'http://localhost:3001/grupos' -ContentType 'application/json' -Body (@{ nome = $gname } | ConvertTo-Json)
$credor = Invoke-RestMethod -Method Post -Uri 'http://localhost:3001/credores' -ContentType 'application/json' -Body (@{ nome = 'Maria da Silva'; email = $email; grupoId = $grupo.id } | ConvertTo-Json)

Invoke-RestMethod -Method Post -Uri 'http://localhost:3001/rendimentos' -ContentType 'application/json' -Body (@{ credorId = $credor.id; numero_pgc = $pgcCode; referencia = '2026-03'; valor = 'R$ 1000,00' } | ConvertTo-Json) | Out-Null

$hist = Invoke-RestMethod -Method Get -Uri "http://localhost:3001/historico-pgc?credorId=$($credor.id)"
if ($hist -and $hist[0] -and $hist[0].id) {
  Invoke-RestMethod -Method Put -Uri "http://localhost:3001/historico-pgc/$($hist[0].id)" -ContentType 'application/json' -Body (@{ numero_pgc = $pgcCode; periodo = '2026-03' } | ConvertTo-Json) | Out-Null
}

$send = Invoke-RestMethod -Method Post -Uri 'http://localhost:3001/emails/enviar' -ContentType 'application/json' -Body (@{ grupoId = $grupo.id; numero_pgc = $pgcCode; escopo = 'todos' } | ConvertTo-Json)
$detail = @($send.details)[0]

[pscustomobject]@{
  sent = $send.sent
  failed = $send.failed
  info_minimo = $detail.info_minimo
  info_descontos = $detail.info_descontos
  mensagem = $detail.mensagem
} | ConvertTo-Json -Depth 8
