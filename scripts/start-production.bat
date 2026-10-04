@echo off
cd /d "%~dp0\.."
if not exist dist\server\main.js (
  echo Execute pnpm install e pnpm build antes de iniciar.
  pause
  exit /b 1
)
node dist\server\main.js
pause
