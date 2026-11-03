@echo off
cd /d "%~dp0"
echo ==========================================
echo   One-click backup to Gitee (private)
echo ==========================================
rem ---------------------------------------------------------------------------
rem  [注意] 本脚本会把当前所有改动一次性提交，提交信息只有时间戳
rem         （形如 "backup 2026-11-03_13-42-51"），会冲淡提交历史的可读性。
rem
rem  日常优先用带描述的提交：
rem      git add -A
rem      git commit -m "feat: 做了什么"
rem      git push
rem
rem  本脚本只作"应急一键备份"。若要保留可读性，可带一句摘要：
rem      backup.bat "改了客户文案"
rem
rem  推送前请记得在 CHANGELOG.md 顶部追加一条变更记录。
rem ---------------------------------------------------------------------------
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set TS=%%i
if not "%~1"=="" goto withmsg
set MSG=backup %TS%
goto docommit
:withmsg
set MSG=backup %TS% - %~1
:docommit
git add -A
git commit -m "%MSG%"
if errorlevel 1 echo [i] No changes to commit, or commit failed. Continuing...
git push
echo.
echo === Backup finished. Remember to update CHANGELOG.md ===
pause >nul
