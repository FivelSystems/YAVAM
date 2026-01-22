@echo off
REM ===============================================================================
REM YAVAM Local Update Test Script
REM ===============================================================================
REM This script helps you verify the self-update functionality of YAVAM.
REM
REM HOW IT WORKS:
REM 1. It builds the application to ensure we have a fresh binary.
REM 2. It starts a local "Mock GitHub Server" (scripts/test_update_server.go).
REM    This server pretends to be GitHub and serves the local 'yavam.exe'
REM    as a new version "v9.9.9".
REM 3. It launches YAVAM with a special environment variable (YAVAM_UPDATE_URL)
REM    pointing to this local server instead of the real GitHub API.
REM
REM WHAT YOU SHOULD DO:
REM 1. Wait for the YAVAM window to open.
REM 2. You should see an "Update Available" modal immediately.
REM    (The mock server reports version v9.9.9, which is likely > your version)
REM 3. Click "Update Now".
REM 4. Observe the app closing.
REM 5. Watch for it to RESTART automatically.
REM
REM IF IT RESTARTS: The test is a SUCCESS.
REM ===============================================================================

echo [TEST] Step 1: Building application...
wails build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed. Fix errors and try again.
    pause
    exit /b %errorlevel%
)

echo.
echo [TEST] Step 2: Starting Mock Update Server...
echo [INFO] This will open in a separate window.
start "YAVAM Mock Update Server" go run scripts\test_update_server.go

echo [TEST] Waiting 3 seconds for server to come alive...
ping -n 4 127.0.0.1 > nul

echo.
echo [TEST] Step 3: Launching YAVAM with YAVAM_UPDATE_URL configured...
set YAVAM_UPDATE_URL=http://localhost:8090/latest

REM Launching the built binary
build\bin\yavam.exe

echo.
echo [TEST] Main process exited.
echo [TEST] If you performed an update, a new detached process should have appeared.
echo [TEST] Don't forget to close the Mock Server window when done!
pause
