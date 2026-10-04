$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale Node.js 22 LTS (https://nodejs.org), feche e abra o terminal, depois repita.' }
& node -e "if(Number(process.versions.node.split('.')[0]) < 22) process.exit(1)"
if ($LASTEXITCODE -ne 0) { throw 'Node.js 22 ou superior e necessario.' }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  & npm.cmd install --global pnpm@10.34.6
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar pnpm.' }
}
& pnpm.cmd install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependencias. Consulte README.md.' }
& pnpm.cmd build
if ($LASTEXITCODE -ne 0) { throw 'Falha no build. Consulte README.md.' }
Write-Host 'Instalacao concluida. Para ensaio: INICIAR-SIMULADO.bat. Para oficial: INICIAR-OFICIAL.bat.'
