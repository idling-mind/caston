@echo off
title CastOn - Whitelist Windows Firewall
cd /d "%~dp0"

:: Check for administrative rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges to update Windows Firewall...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ========================================================
echo   Configuring Windows Firewall for CastOn Console
echo ========================================================
echo.

:: 1. Whitelist TCP Port 8000
echo [*] Adding Inbound TCP Port 8000 rule...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-NetFirewallRule -DisplayName 'CastOn Console - Port 8000' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName 'CastOn Console - Port 8000' -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow -Profile Any"

:: 2. Whitelist Python Venv executable if it exists
if exist "%~dp0.venv\Scripts\python.exe" (
    echo [*] Adding Inbound Python Virtual Environment rule...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-NetFirewallRule -DisplayName 'CastOn Console - Python Venv' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName 'CastOn Console - Python Venv' -Direction Inbound -Program '%~dp0.venv\Scripts\python.exe' -Action Allow -Profile Any"
)

echo.
echo ========================================================
echo   [OK] CastOn has been whitelisted successfully!
echo   Phones and TVs on your Wi-Fi can now connect.
echo ========================================================
echo.
pause

