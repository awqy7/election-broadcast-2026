$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale Node.js 22 LTS.' }
if (-not (Test-Path 'dist/server/main.js')) { throw 'Execute pnpm install e pnpm build antes de iniciar.' }
$retryDelaySeconds = 3
Write-Host 'Studio: http://127.0.0.1:8787/studio | Ctrl+C para encerrar'
while ($true) {
  & node 'dist/server/main.js'
  if ($LASTEXITCODE -eq 0) { break }
  Write-Warning "Servidor encerrou com erro. Reiniciando em $retryDelaySeconds segundos."
  Start-Sleep -Seconds $retryDelaySeconds
  $retryDelaySeconds = [Math]::Min(60, $retryDelaySeconds * 2)
}
