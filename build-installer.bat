@echo off
REM =========================================================================
REM  DreamRT - one-command installer builder (developer-side)
REM
REM  Produces a single Windows setup.exe that end users can double-click.
REM  The produced installer bundles:
REM    * Electron runtime + the Vite-built frontend
REM    * A PyInstaller-frozen Python backend (no Python needed on the target)
REM    * The compiled CommunicationManager main.exe for BLE
REM
REM  Requirements on THIS (build) machine only:
REM    * Python 3.10+ on PATH (the `py` launcher)
REM    * Node.js 18+ on PATH (`npm`)
REM    * Internet access (to install pip + npm packages the first time)
REM    * Administrator rights (UAC). This script will auto-elevate if needed.
REM      electron-builder extracts a toolchain archive that contains
REM      macOS symlinks; Windows refuses to create them without admin
REM      privileges (or "Developer Mode" enabled). Running elevated is
REM      the most portable fix.
REM
REM  End users need NONE of the above - they just get a setup.exe.
REM =========================================================================

setlocal enabledelayedexpansion

REM --- Self-elevate to admin if we're not already ---------------------------
net session >nul 2>&1
if errorlevel 1 (
    echo [i] Requesting administrator privileges for electron-builder...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b 0
)

pushd "%~dp0" >nul

echo.
echo ============================================================
echo  Building DreamRT one-click installer
echo ============================================================
echo.

where py >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python launcher 'py' not found.
    echo         Install Python 3.10+ from https://www.python.org/ and retry.
    goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found.
    echo         Install Node.js 18+ from https://nodejs.org/ and retry.
    goto :fail
)

echo [1/3] Installing frontend npm packages...
pushd frontend >nul
call npm install --no-fund --no-audit
if errorlevel 1 (
    popd >nul
    echo [ERROR] npm install failed.
    goto :fail
)

echo.
echo [2/3] Freezing backend with PyInstaller and building frontend...
echo       (this step takes several minutes on a clean machine)
call npm run dist
if errorlevel 1 (
    popd >nul
    echo [ERROR] Build failed. See messages above.
    goto :fail
)
popd >nul

echo.
echo [3/3] Done.
echo.

set "OUTDIR=%~dp0frontend\release-oneclick"
if exist "%OUTDIR%" (
    echo Installer(s) produced in:
    echo     %OUTDIR%
    echo.
    dir /b "%OUTDIR%\*.exe" 2>nul
    echo.
    start "" "%OUTDIR%"
) else (
    echo [WARN] Expected output folder not found: %OUTDIR%
)

popd >nul
echo.
echo Press any key to close this window...
pause >nul
exit /b 0

:fail
popd >nul
echo.
echo Build aborted.
echo.
echo Press any key to close this window...
pause >nul
exit /b 1
