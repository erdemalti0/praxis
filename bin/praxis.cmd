@echo off
REM Praxis CLI — open a project folder in Praxis
REM Usage: praxis [path]  (defaults to current directory)

setlocal enabledelayedexpansion

set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=."

pushd "%TARGET%" 2>nul
if errorlevel 1 (
    echo praxis: '%TARGET%' is not a valid directory
    exit /b 1
)
set "ABSOLUTE_PATH=%CD%"
popd

for %%I in ("%ABSOLUTE_PATH%") do set "PROJECT_NAME=%%~nxI"

REM Try installed app location
set "APP_PATH=%LOCALAPPDATA%\Programs\Praxis\Praxis.exe"
if exist "%APP_PATH%" (
    start "" "%APP_PATH%" "--open-project=%ABSOLUTE_PATH%"
    goto :eof
)

REM Try Program Files
set "APP_PATH=%PROGRAMFILES%\Praxis\Praxis.exe"
if exist "%APP_PATH%" (
    start "" "%APP_PATH%" "--open-project=%ABSOLUTE_PATH%"
    goto :eof
)

REM Development mode
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
if exist "%PROJECT_ROOT%\node_modules\.bin\electron-vite.cmd" (
    cd /d "%PROJECT_ROOT%"
    start "" npx electron-vite dev -- "--open-project=%ABSOLUTE_PATH%"
    goto :eof
)

echo praxis: Cannot find Praxis installation
exit /b 1
