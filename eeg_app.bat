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

		:: React install
		npm install
		npm install vite @vitejs/plugin-react
		npm install vite --save-dev
		npm audit fix

		exit
    )
)

:: Echo the final starting message with all original arguments

start "EEG App" cmd /k py .\backend\main.py %*
cd .\frontend
npm run dev
