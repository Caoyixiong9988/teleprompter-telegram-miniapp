@echo off
cd /d "%~dp0"
echo ==========================================
echo   One-click backup to Gitee (private)
echo ==========================================
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set TS=%%i
git add -A
git commit -m "backup %TS%"
if errorlevel 1 echo [i] No changes to commit, or commit failed. Continuing...
git push
echo.
echo === Backup finished. Press any key to close. ===
pause >nul
