@echo off
setlocal
rem A primeira abertura configura a instalacao e inicia o OFICIAL.
call "%~dp0INICIAR-OFICIAL.bat"
exit /b %ERRORLEVEL%
