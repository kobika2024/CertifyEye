@echo off
echo Starting CertifyEye Backend and UI...

REM Check if backend is running
netstat -ano | findstr :3000 > nul
if %ERRORLEVEL% NEQ 0 (
  echo Backend not running, starting it now...
  start cmd /k "cd /d C:\projects\CertifyEye && npm start"
  REM Wait for backend to start
  timeout /t 5 /nobreak > nul
) else (
  echo Backend already running on port 3000
)

REM Check if UI is running
netstat -ano | findstr :3002 > nul
if %ERRORLEVEL% NEQ 0 (
  echo UI not running, starting it now...
  start cmd /k "cd /d C:\projects\certify-eye-ui && npm run dev"
  REM Wait for UI to start
  timeout /t 5 /nobreak > nul
) else (
  echo UI already running on port 3002
)

echo CertifyEye is now running!
echo Backend: http://localhost:3000
echo UI: http://localhost:3002
echo.
echo You can close this window, the application will continue running.
echo To stop the application, run stop-app.bat

timeout /t 3 /nobreak > nul
start http://localhost:3002
