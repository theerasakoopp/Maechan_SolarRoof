@echo off
title Maechan Smart SolarRoof Web-GIS
echo ========================================================
echo   Maechan Smart SolarRoof: Municipal 3D Web-GIS Platform
echo ========================================================
echo Starting local HTTP server on http://127.0.0.1:8080 ...
echo Press Ctrl+C in this window to stop the server.
echo.
start http://127.0.0.1:8080/index.html#3d
python -m http.server 8080
pause
