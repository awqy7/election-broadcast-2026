@echo off
rem ---------------------------------------------------------------------
rem  Election Broadcast 2026 - menu
rem  Escolha como quer subir o programa.
rem ---------------------------------------------------------------------
setlocal
cd /d "%~dp0"
chcp 65001 >nul 2>&1
title Election Broadcast 2026
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
  echo   ERRO: configuracao ainda nao foi criada.
  echo   Execute INSTALAR.bat primeiro.
  echo.
  pause
  exit /b 1
)

:menu
cls
echo.
echo   ================================================
echo     Election Broadcast 2026
echo   ================================================
echo.
echo    1  ENSAIO   - dados de teste do TSE, aviso SIMULACAO na tela
echo    2  OFICIAL  - dados do TSE de verdade, usar na transmissao
echo    3  DIAGNOSTICO - testa se o programa esta respondendo
echo    4  SAIR
echo.
echo   Use o ENSAIO para treinar. So use OFICIAL com a fonte do TSE
echo   conferida e a transmissao monitorada.
echo.
set "OPCAO="
set /p "OPCAO=Escolha uma opcao e tecle Enter: "

if "%OPCAO%"=="1" goto :ensaio
if "%OPCAO%"=="2" goto :oficial
if "%OPCAO%"=="3" goto :diagnostico
if "%OPCAO%"=="4" goto :fim
echo.
echo   Opcao invalida.
timeout /t 2 /nobreak >nul
goto :menu

:ensaio
rem So abre o navegador se o programa ja estiver de pe. Este menu nao sobe o
rem servidor: quem sobe e INICIAR-SIMULADO.bat, em outra janela.
rem A URL e resolvida pelo proprio script. Capturar aqui com "for /f"
rem dependeria de um pipe funcionar, e se ele falhar a variavel fica vazia:
rem o endereco cairia em 127.0.0.1, que nao abre no outro PC.
echo.
"%NODE%" "%~dp0scripts\abrir-abas.mjs" "%~dp0." 8788 2
if errorlevel 1 goto :ensaio_parado
echo   As duas abas de ENSAIO foram abertas no navegador.
goto :fim

:ensaio_parado
echo.
echo   O programa de ENSAIO nao esta rodando.
echo.
echo   Abra a janela INICIAR-SIMULADO.bat. Os dois enderecos
echo   aparecem nela assim que o programa sobe.
echo.
goto :fim

:oficial
echo.
"%NODE%" "%~dp0scripts\abrir-abas.mjs" "%~dp0." 8787 2
if errorlevel 1 goto :oficial_parado
echo   As duas abas OFICIAIS foram abertas no navegador.
goto :fim

:oficial_parado
echo.
echo   O programa OFICIAL nao esta rodando.
echo.
echo   Abra a janela INICIAR-OFICIAL.bat. Os dois enderecos
echo   aparecem nela assim que o programa sobe.
echo.
goto :fim

:diagnostico
cls
"%NODE%" "%~dp0scripts\show-info.mjs" "%~dp0."
echo   O que fazer:
echo     - "parado": abra INICIAR-OFICIAL.bat ou INICIAR-SIMULADO.bat.
echo     - "sem resposta" com o programa aberto: feche e abra novamente.
echo.
pause
goto :menu

:fim
endlocal