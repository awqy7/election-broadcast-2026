@echo off
rem ---------------------------------------------------------------------
rem  Election Broadcast 2026 - instalacao
rem  Basta dar dois cliques neste arquivo. Nao precisa de internet,
rem  nem de Node instalado, nem de permissao de administrador.
rem
rem  Ao terminar, o programa sobe no modo de ENSAIO (dados publicados pelo
rem  TSE para teste) e o painel abre sozinho no navegador. O aviso
rem  SIMULACAO aparece na tela. Para o ao vivo, use INICIAR-OFICIAL.bat.
rem ---------------------------------------------------------------------
setlocal
cd /d "%~dp0"
chcp 65001 >nul 2>&1
title Election Broadcast 2026 - Instalacao

set "NODE=%~dp0runtime\node\node.exe"

if not exist "%NODE%" (
  echo.
  echo   ERRO: o Node que acompanha o programa nao foi encontrado.
  echo.
  echo   Pasta esperada: %~dp0runtime\node\node.exe
  echo.
  echo   Extraia o instalador de novo, em uma pasta vazia.
  echo   Nao execute a partir de dentro do arquivo ZIP.
  echo.
  pause
  exit /b 1
)

rem O ponto no fim e obrigatorio. "%~dp0" sempre termina em barra, e uma
rem barra na sequencia da aspa de fechamento vira aspa escapada no parser de
rem argumentos do Windows: o script receberia o caminho terminado em aspas e
rem nenhum arquivo seria encontrado. Com o ponto, o caminho chega limpo.
"%NODE%" "%~dp0scripts\setup.mjs" "%~dp0."
if errorlevel 1 (
  echo.
  echo   A instalacao parou no passo acima. Leia a mensagem em vermelho.
  echo.
  pause
  exit /b 1
)

echo.
echo   Subindo o programa em modo de ENSAIO...
start "Election Broadcast 2026 - ENSAIO" "%~dp0INICIAR-SIMULADO.bat"

rem Espera o programa responder, para mostrar a confirmacao so depois que ele
rem subir de verdade. A URL e resolvida pelo proprio script: se fosse capturada
rem aqui com "for /f", um pipe que falhe deixaria a variavel vazia e o
rem endereco cairia em 127.0.0.1, que nao abre no outro PC.
"%NODE%" "%~dp0scripts\wait-for-health.mjs" "%~dp0." 8788 90
if errorlevel 1 (
  echo.
  echo   O programa demorou para responder. Veja a janela
  echo   "Election Broadcast 2026 - ENSAIO" e execute INICIAR-SIMULADO.bat
  echo   de novo se ela estiver fechada.
  echo.
  pause
  exit /b 1
)

rem As duas abas NAO sao abertas aqui. Quem abre e INICIAR-SIMULADO.bat, na
rem janela que foi lancada acima. Abrir aqui tambem daria quatro abas em vez
rem de duas.
echo.
echo   Instalacao concluida. As duas abas abriram no navegador:
echo.
echo   As duas estao em modo de ENSAIO, com aviso de SIMULACAO na saida.
echo.
echo   - Anote a chave de acesso mostrada acima.
echo   - No dia, troque para os dados de verdade: INICIAR-OFICIAL.bat
echo   - A aba "Saida" e a URL que vai para a transmissao. Nao mexa nela.
echo.
pause