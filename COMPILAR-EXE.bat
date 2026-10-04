@echo off
rem ---------------------------------------------------------------------
rem  Election Broadcast 2026 - GERAR O INSTALADOR .EXE
rem
rem  Rode este arquivo no Windows. Ele faz tudo sozinho:
rem    1. baixa o Inno Setup 6, se ainda nao estiver instalado
rem    2. compila scripts\ElectionBroadcast2026.iss
rem    3. deixa o .exe pronto na pasta artifacts\
rem
rem  So precisa de internet no primeiro uso. Nao pede administrador.
rem  Depois de rodar, envie artifacts\Instalar-ElectionBroadcast2026.exe
rem  para o cliente.
rem ---------------------------------------------------------------------
rem EnableDelayedExpansion e obrigatorio nos blocos entre parenteses: "%TMP%" e
rem "%IS_TAM%" lidos dentro do bloco sao expandidos quando o bloco e lido, antes
rem do "set" rodar, e dariam caminho vazio. Com "!", o valor e lido na hora.
setlocal EnableDelayedExpansion
cd /d "%~dp0"
chcp 65001 >nul 2>&1
title Election Broadcast 2026 - gerar instalador

rem Versao fixada do Inno Setup. Fixar e importante: o .iss foi validado com
rem ela, e "baixar a ultima" traria mudancas nao testadas no dia da eleicao.
rem A URL direta do release do GitHub e a que entrega o arquivo de verdade;
rem o endereco de redirecionamento do site devolve HTML.
set "IS_VER=6"
set "IS_VER_FULL=6.7.3"
set "IS_URL=https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe"

rem "%ProgramFiles(x86)%" contem parenteses, e no cmd um parenteses vira sintaxe.
rem Testado no Windows: uma lista "for %%I in (...)" com esse caminho nao
rem encontra o arquivo nenhum, e o mesmo caminho dentro de um bloco "if (...)"
rem da erro de sintaxe. A busca certa e "if exist" em linhas soltas, com o
rem caminho montado antes em variaveis proprias (a expansao adiada com "!" evita
rem que o parentese do valor vire sintaxe).
set "PF86=!ProgramFiles(x86)!"
set "PF64=!ProgramFiles!"
set "ISCC="

if exist "%PF86%\Inno Setup 6\ISCC.exe" set "ISCC=%PF86%\Inno Setup 6\ISCC.exe"
if not defined ISCC if exist "%PF64%\Inno Setup 6\ISCC.exe" set "ISCC=%PF64%\Inno Setup 6\ISCC.exe"

if not defined ISCC (
  echo.
  echo   O Inno Setup %IS_VER% nao esta instalado. Baixando...
  echo.
  set "TMP=%TEMP%\innosetup-%IS_VER%.exe"
  echo   %IS_URL%
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference='SilentlyContinue';" ^
    "Invoke-WebRequest -Uri '%IS_URL%' -OutFile '!TMP!'"
  if not exist "!TMP!" (
    echo.
    echo   ERRO: nao consegui baixar o Inno Setup.
    echo   Baixe em https://jrsoftware.org/isinfo.php e rode este arquivo de novo.
    echo.
    pause
    exit /b 1
  )
  rem O endereco antigo do site (jrsoftware.org/download.php/is.exe) devolve
  rem uma pagina de HTML em vez do instalador, e o script "/" do Windows aceitou
  rem esse HTML como se fosse o programa. O instalador do Inno tem varios MB;
  rem qualquer coisa menor e pagina de erro.
  for %%F in ("!TMP!") do set "IS_TAM=%%~zF"
  if not defined IS_TAM set "IS_TAM=0"
  if !IS_TAM! LSS 1000000 (
    echo.
    echo   ERRO: o download veio com !IS_TAM! bytes, que nao e um instalador.
    echo   O site pode ter devolvido uma pagina de erro.
    echo.
    del "!TMP!" >nul 2>&1
    pause
    exit /b 1
  )
  echo   Instalando o Inno Setup %IS_VER%...
  start /wait "" "!TMP!" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
  del "!TMP!" >nul 2>&1
  rem Mesma busca do inicio, agora dentro do bloco: por isso "!" no caminho.
  if exist "!PF86!\Inno Setup %IS_VER%\ISCC.exe" set "ISCC=!PF86!\Inno Setup %IS_VER%\ISCC.exe"
  if not defined ISCC if exist "!PF64!\Inno Setup %IS_VER%\ISCC.exe" set "ISCC=!PF64!\Inno Setup %IS_VER!\ISCC.exe"
  if not defined ISCC (
    echo.
    echo   ERRO: o Inno Setup foi instalado mas o compilador nao apareceu.
    echo   Procure ISCC.exe e me diga o caminho.
    echo.
    pause
    exit /b 1
  )
)

if not exist "artifacts\runtime-stage\ElectionBroadcast2026\dist\server\main.js" (
  echo.
  echo   ERRO: o pacote ainda nao foi montado.
  echo   Rode antes, neste mesmo computador:
  echo.
  echo       node scripts\build-delivery.mjs
  echo.
  pause
  exit /b 1
)

echo.
echo   Compilando o instalador. Pode levar alguns minutos...
echo.
"%ISCC%" /Q "scripts\ElectionBroadcast2026.iss"
if errorlevel 1 (
  echo.
  echo   ERRO na compilacao. A mensagem do Inno Setup esta acima.
  echo.
  pause
  exit /b 1
)

if not exist "artifacts\Instalar-ElectionBroadcast2026.exe" (
  echo.
  echo   ERRO: a compilacao terminou, mas o .exe nao apareceu.
  echo.
  pause
  exit /b 1
)

echo.
echo   ==============================================
echo     INSTALADOR PRONTO
echo   ==============================================
echo.
echo   artifacts\Instalar-ElectionBroadcast2026.exe
echo.
for %%F in ("artifacts\Instalar-ElectionBroadcast2026.exe") do echo   Tamanho: %%~zF bytes
echo.
echo   Para conferir se o arquivo chegou inteiro, compare o codigo SHA256
echo   abaixo com o que veio junto no e-mail. E o mesmo arquivo testado aqui.
echo.
certutil -hashfile "artifacts\Instalar-ElectionBroadcast2026.exe" SHA256
echo.
echo   E esse arquivo que voce envia para o cliente.
echo.
echo   O instalador tem cerca de 28 MB. Se estiver com muito menos que isso,
echo   a compilacao nao foi ate o fim.
echo.
pause
exit /b 0
