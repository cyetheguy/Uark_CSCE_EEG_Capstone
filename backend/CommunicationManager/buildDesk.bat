@echo off
setlocal enabledelayedexpansion

REM Ensure paths are relative to this script location.
pushd "%~dp0"

REM Bootstrap MSVC toolchain if cl.exe is not already available.
where cl >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
    if exist "%VSWHERE%" (
        for /f "usebackq delims=" %%i in (`"%VSWHERE%" -latest -products * -property installationPath`) do (
            set "VSINSTALL=%%i"
        )
        if defined VSINSTALL (
            call "!VSINSTALL!\Common7\Tools\VsDevCmd.bat" -host_arch=x64 -arch=x64 >nul 2>&1
        )
    )

    if %ERRORLEVEL% NEQ 0 (
        if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" (
            call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -host_arch=x64 -arch=x64 >nul 2>&1
        )
    )
)

where cl >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: cl.exe not found.
    echo Open this from a "Developer Command Prompt for VS" or install Visual Studio C++ Build Tools.
    popd
    exit /b 1
)

::Make bin directory if not one
if not exist bin mkdir bin
if not exist bin\Desktop mkdir bin\Desktop

set FILES=SecurityManager.cpp ECDHE.cpp EC_Point.cpp EC_Curve.cpp Desktop.cpp ConnectionManager.cpp AES_128_CCM.cpp

::Compile all files
for %%f in (%FILES%) do (
    cl /c /EHsc /std:c++20 /I include\Desktop "src\Desktop\%%f" /Fo"bin\Desktop\%%~nf.obj"
    if !ERRORLEVEL! NEQ 0 (
        echo ERROR: Failed compiling %%f
        popd
        exit /b 1
    )
)

::Link all obj files in bin to make .exe file
cl bin\Desktop\*.obj windowsapp.lib /Fe:bin\Desktop\main.exe
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Link step failed. main.exe was not updated.
    popd
    exit /b 1
)

echo SUCCESS: Built bin\Desktop\main.exe
popd
exit /b 0