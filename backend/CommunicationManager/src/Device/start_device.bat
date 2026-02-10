@echo off
rem Ready and start the Device binary for broadcasting

rem Always operate from this script's folder
cd /d "%~dp0"

echo.
echo === Building Device executable ===
echo.
pushd "..\..\"
call buildDevice.bat
if errorlevel 1 (
  echo.
  echo Build failed. Please check the compiler output above.
  popd
  pause
  exit /b 1
)
popd

echo.
echo === Starting Device for broadcasting ===
echo   (running bin\Device\main.exe)
echo.

pushd "..\..\bin\Device"
main.exe
popd

echo.
echo Device process has exited.
pause

