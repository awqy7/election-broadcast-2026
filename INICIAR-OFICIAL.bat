@echo off
rem ---------------------------------------------------------------------
rem  Election Broadcast 2026 - OFICIAL
rem  Sobe o programa com os dados oficiais do TSE, sem aviso de simulacao.
rem  Fechar esta janela (ou Ctrl+C) encerra o programa.
rem ---------------------------------------------------------------------
setlocal
cd /d "%~dp0"
chcp 65001 >nul 2>&1
title Election Broadcast 2026 - OFICIAL

set "NODE=%~dp0runtime\node\node.exe"

if not exist "%NODE%" (
  echo.
  echo   ERRO: o Node que acompanha o programa nao foi encontrado.
  echo   Execute INSTALAR.bat novamente.
  echo.
  pause
  exit /b 1
)

"%NODE%" "%~dp0scripts\check-official.mjs" "%~dp0.env"
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)

rem dotenv nao sobrescreve variavel ja existente, entao isto tem prioridade
rem sobre o .env e garante o modo oficial.
set "DATA_MODE=tse"

echo.
echo   Modo OFICIAL - dados do TSE, sem aviso de simulacao.
echo.
echo   A URL da saida e a que vai para a transmissao.
echo   Ctrl+C encerra.
echo.

rem O auxiliar espera o servidor responder e so entao abre as duas abas. Ele
rem roda em paralelo com o laco abaixo, que ocupa esta janela em primeiro
rem plano: se a espera ficasse aqui antes do :loop, ela rodaria contra um
rem servidor que ainda nao existe.
start "" /b "%NODE%" "%~dp0scripts\abrir-abas.mjs" "%~dp0." 8787 60

:loop
"%NODE%" "%~dp0dist\server\main.js"
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