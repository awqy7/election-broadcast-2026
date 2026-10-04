@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
title Election Broadcast 2026 - OFICIAL
set "NODE=%~dp0runtime\node\node.exe"
if not exist "%NODE%" goto :missing
"%NODE%" "%~dp0scripts\launch-official.mjs"
set "CODIGO=%ERRORLEVEL%"
echo.
echo Processo encerrado. Log: data\startup.log
pause
exit /b %CODIGO%
:missing
echo ERRO: runtime\node\node.exe ausente. Reinstale o programa.
pause
exit /b 1
