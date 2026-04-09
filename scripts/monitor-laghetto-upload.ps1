param(
  [int]$PollSeconds = 2
)

$ErrorActionPreference = 'SilentlyContinue'
$logPath = '.\\.runtime\\api.log'

function Get-LatestLaghettoRequestId {
  if (!(Test-Path $logPath)) { return $null }
  $tail = Get-Content $logPath -Tail 800
  if (-not $tail) { return $null }
  $text = $tail -join "`n"
  $regex = [regex]'/laghetto-sports/([0-9a-fA-F-]{36})/status'
  $matches = $regex.Matches($text)
  if ($matches.Count -eq 0) { return $null }
  return $matches[$matches.Count - 1].Groups[1].Value.ToLower()
}

$baseline = Get-LatestLaghettoRequestId
$target = $null
$lastPrinted = ''

Write-Output ("MONITOR_READY baseline=" + ($(if ($baseline) { $baseline } else { 'none' })))
Write-Output 'AGUARDANDO_UPLOAD'

while ($true) {
  $latest = Get-LatestLaghettoRequestId

  if (-not $target -and $latest -and $latest -ne $baseline) {
    $target = $latest
    Write-Output ("NOVO_REQUEST=" + $target)
  }

  if ($target) {
    try {
      $s = Invoke-RestMethod -Uri ("http://localhost:3001/laghetto-sports/" + $target + "/status") -Method GET -TimeoutSec 10
      $line = ("STATUS ts={0} req={1} status={2} stage={3} percent={4} success={5} error={6}" -f (Get-Date -Format 'HH:mm:ss'), $target, $s.status, $s.stage, $s.percent, $s.successCount, $s.errorCount)
      if ($line -ne $lastPrinted) {
        Write-Output $line
        $lastPrinted = $line
      }

      if ($s.status -in @('SUCCESS', 'ERROR', 'CANCELED') -or $s.stage -eq 'FINISHED') {
        Write-Output ("FINAL req=" + $target + " status=" + $s.status + " stage=" + $s.stage + " success=" + $s.successCount + " error=" + $s.errorCount)
        break
      }
    } catch {
      Write-Output ("STATUS_ERROR " + $_.Exception.Message)
    }
  }

  Start-Sleep -Seconds $PollSeconds
}
