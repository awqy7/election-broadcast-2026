@echo off
rem ---------------------------------------------------------------------
rem  Election Broadcast 2026 - ENSAIO
rem  Sobe o programa com os dados de teste publicados pelo TSE.
rem  Mostra o aviso SIMULACAO na tela. Use para treinar sem risco.
rem  Fechar esta janela (ou Ctrl+C) encerra o programa.
rem ---------------------------------------------------------------------
setlocal
cd /d "%~dp0"
chcp 65001 >nul 2>&1
title Election Broadcast 2026 - ENSAIO

set "NODE=%~dp0runtime\node\node.exe"

if not exist "%NODE%" (
  echo.
  echo   ERRO: o Node que acompanha o programa nao foi encontrado.
  echo   Execute INSTALAR.bat novamente.
  echo.
  pause
  exit /b 1
)
if not exist "%~dp0.env" (
  echo.
  echo   ERRO: configuracao ausente.
  echo   Execute INSTALAR.bat primeiro.
  echo.
  pause
  exit /b 1
)

echo.
echo   Modo ENSAIO - dados de teste do TSE, aviso SIMULACAO na tela.
echo.
echo   A URL da saida e a que vai para a transmissao.
echo   Ctrl+C encerra.
echo.

rem O auxiliar espera o servidor responder e so entao abre as duas abas. Ele
rem roda em paralelo com o laco abaixo, que ocupa esta janela em primeiro
rem plano: se a espera ficasse aqui antes do :loop, ela rodaria contra um
rem servidor que ainda nao existe.
start "" /b "%NODE%" "%~dp0scripts\abrir-abas.mjs" "%~dp0." 8788 60

:loop
"%NODE%" "%~dp0dist\server\main.js" --tse-sim
set "CODIGO=%ERRORLEVEL%"
echo.
echo   O programa foi encerrado (codigo %CODIGO%).
if "%CODIGO%"=="0" goto :fim
echo   Reiniciando em 5 segundos. Ctrl+C para nao reiniciar.
timeout /t 5 /nobreak >nul
goto :loop

:fim
echo   Encerrado.
pause