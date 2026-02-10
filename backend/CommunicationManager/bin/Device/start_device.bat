@echo off
rem Start the device, send "start", wait 15 s for client to connect, then send incrementing integer every second

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_device.ps1" | main.exe

pause
