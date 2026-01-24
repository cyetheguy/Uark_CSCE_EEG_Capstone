@echo off

::Make bin directory if not one
if not exist bin mkdir bin
if not exist bin\Device mkdir bin\Device

set FILES=Device.cpp DeviceBLEModule.cpp

::Compile all files
for %%f in (%FILES%) do (
    cl /c /EHsc /std:c++20 /I include\Device "src\Device\%%f" /Fo"bin\Device\%%~nf.obj"
)

::Link all obj files in bin to make .exe file
cl bin\Device\*.obj windowsapp.lib /Fe:bin\Device\main.exe

::Run main.exe
bin\Device\main.exe

pause