@echo off
cd /d "%~dp0"
if not exist "tools\livekit-server\livekit-server.exe" (
  echo Missing tools\livekit-server\livekit-server.exe
  echo Run setup-livekit-windows.ps1 first.
  pause
  exit /b 1
)
"tools\livekit-server\livekit-server.exe" --dev
