@echo off
setlocal enabledelayedexpansion
set DEBUG_MODE=0

:: Iterate through all arguments passed to the script
for %%a in (%*) do (
    if "%%a"=="--update" (
        echo updating
        mkdir temp
        git init
        git clone https://github.com/cyetheguy/Uark_CSCE_EEG_Capstone.git temp
        xcopy temp .\ /E /I
        rmdir /S /Q temp 
    )
    
    if "%%a"=="--install" (
        echo Initializing installation...
        echo Detailed installation logs will be saved to install_log.txt
        echo Initializing... > install_log.txt

        cls
        echo Installing Python...
        echo [==                  ] 10%%
        winget install 9NQ7512CXL7T --silent --accept-package-agreements --accept-source-agreements >> install_log.txt 2>&1
        py install 3.14 >> install_log.txt 2>&1

        cls
        echo Upgrading pip...
        echo [====                ] 20%%
        py -m ensurepip --upgrade >> install_log.txt 2>&1
        py -m pip install --upgrade pip -q >> install_log.txt 2>&1

        cls
        echo Installing pycryptodome...
        echo [======              ] 30%%
        py -m pip install pycryptodome -q >> install_log.txt 2>&1

        cls
        echo Installing Flask ^& CORS...
        echo [========            ] 40%%
        py -m pip install Flask flask-cors -q >> install_log.txt 2>&1

        cls
        echo Installing numpy...
        echo [==========          ] 50%%
        py -m pip install numpy -q >> install_log.txt 2>&1

        cls
        echo Installing matplotlib...
        echo [============        ] 60%%
        py -m pip install matplotlib -q >> install_log.txt 2>&1

        cls
        echo Installing Node.js...
        echo [================    ] 70%%
        nvm install latest >> install_log.txt 2>&1

        cls
        echo [==================  ] 80%% - Installing Frontend React Packages ^(This takes a moment^)...
        cd .\frontend
        call npm install --silent --no-fund --no-audit >> ..\install_log.txt 2>&1
        call npm install vite @vitejs/plugin-react --silent --no-fund --no-audit >> ..\install_log.txt 2>&1
        call npm install vite --save-dev --silent --no-fund --no-audit >> ..\install_log.txt 2>&1
        call npm audit fix --silent >> ..\install_log.txt 2>&1
        cd ..

        cls
        echo [====================] 100%% - Installation Complete!
        echo.
        echo Dependencies installed successfully. You can now run the app normally, or use --update to download latest software version.
        exit
    )
  
    if "%%a"=="--debug" (
        set DEBUG_MODE=1
    )
)

:: Check for Python
where py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON_CMD=py
) else (
    where python >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        set PYTHON_CMD=python
    ) else (
        where python3 >nul 2>&1
        if %ERRORLEVEL% EQU 0 (
            set PYTHON_CMD=python3
        ) else (
            echo ERROR: Python is not installed or not in PATH.
            echo Please install Python or run: .\eeg_app.bat --install
            pause
            exit /b 1
        )
    )
)

:: Check for Node.js/npm
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js/npm is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    echo Or run: .\eeg_app.bat --install
    pause
    exit /b 1
)

:: Check if frontend node_modules exists, if not install dependencies
if not exist "frontend\node_modules" (
    cls
    echo [==================  ] 90%% - Missing Frontend Packages. Installing...
    cd frontend
    call npm install --silent --no-fund --no-audit
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ERROR: Failed to install frontend dependencies.
        echo Please check your internet connection and Node.js installation.
        echo Or run: .\eeg_app.bat --install
        cd ..
        pause
        exit /b 1
    )
    cd ..
    cls
    echo [====================] 100%% - Installation Complete!
    echo.
)

:: Print startup banner
echo.
echo ========================================
if !DEBUG_MODE!==1 (
    echo Starting DreamRT Application  [DEBUG MODE]
) else (
    echo Starting DreamRT Application...
)
echo ========================================
echo.

:: GitHub status
echo GitHub Updates (--update) {
git init
git fetch
git branch -vv
echo }


:: Start backend in a new window
start "DreamRT Backend" cmd /k %PYTHON_CMD% backend\main.py %*

:: NOTE: The Desktop client (main.exe) is now launched automatically by the
:: Python backend on startup. Its output appears in the "EEG Backend" window.
:: No separate client window needed.

:: Start frontend — pass VITE_DEBUG_MODE so the UI can show the Scan button
cd frontend
if "!DEBUG_MODE!"=="1" goto start_debug_frontend
call npm run dev
goto end

:start_debug_frontend
echo DEBUG MODE: Scan button will be visible after login.
set VITE_DEBUG_MODE=true
call npm run dev

:end