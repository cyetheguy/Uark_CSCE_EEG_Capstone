@echo off
:: Iterate through all arguments passed to the script
for %%a in (%*) do (
    if "%%a"=="--update" (
        echo update
    )
    if "%%a"=="--install" (
        echo installing packages
    )
)

:: Echo the final starting message with all original arguments
python3.12 .\backend\main.py %*