@echo off
title Maechan SolarRoof - Git Sync & Deploy to GitHub
echo ========================================================
echo    Maechan SolarRoof: 1-Click Sync & Deploy to GitHub
echo ========================================================
powershell -ExecutionPolicy Bypass -File "%~dp0push.ps1"
pause
