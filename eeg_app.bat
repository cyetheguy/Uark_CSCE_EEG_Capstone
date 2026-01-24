@echo off
:: Iterate through all arguments passed to the script
for %%a in (%*) do (
    if "%%a"=="--update" (
        echo update
    )
    if "%%a"=="--install" (
        echo installing

		:: Python install
		winget install 9NQ7512CXL7T
		py install 3.14
		py -m ensurepip --upgrade
		py -m pip install --upgrade pip

		:: pip libraries
		py -m pip install pycryptodome

		:: Node.js install
		nvm install latest

		:: React install - must be in frontend directory
		cd .\frontend
		npm install
		npm install vite @vitejs/plugin-react
		npm install vite --save-dev
		npm audit fix
		cd ..

		exit
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
    echo.
    echo ========================================
    echo Frontend dependencies not found.
    echo Installing npm packages...
    echo ========================================
    echo.
    cd frontend
    call npm install
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
    echo.
    echo Dependencies installed successfully!
    echo.
)

:: Echo the final starting message with all original arguments
echo.
echo ========================================
echo Starting EEG Application...
echo ========================================
echo.

:: Start backend in a new window
start "EEG Backend" cmd /k %PYTHON_CMD% backend\main.py %*

:: Start frontend in current window
cd frontend
call npm run dev
