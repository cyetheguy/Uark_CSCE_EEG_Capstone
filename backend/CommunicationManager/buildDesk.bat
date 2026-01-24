@echo off

::Make bin directory if not one
if not exist bin mkdir bin
if not exist bin\Desktop mkdir bin\Desktop

set FILES=SecurityManager.cpp ECDHE.cpp EC_Point.cpp EC_Curve.cpp Desktop.cpp ConnectionManager.cpp AES_128_CCM.cpp

::Compile all files
for %%f in (%FILES%) do (
    cl /c /EHsc /std:c++20 /I include\Desktop "src\Desktop\%%f" /Fo"bin\Desktop\%%~nf.obj"
)

::Link all obj files in bin to make .exe file
cl bin\Desktop\*.obj windowsapp.lib /Fe:bin\Desktop\main.exe

::Run main.exe
bin\Desktop\main.exe

pause