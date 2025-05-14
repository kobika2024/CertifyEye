@echo off
echo Stopping CertifyEye Backend and UI...

REM Kill all node processes
taskkill /F /IM node.exe

echo CertifyEye has been stopped.
echo.
echo To start the application again, run start-app.bat or double-click it.

timeout /t 3 /nobreak > nul
