@echo off
setlocal
title LanguageTool Server - localhost:8081
set "LT_ROOT=%LOCALAPPDATA%\LanguageTool"
set "PORT=8081"

echo ==================================================
echo   LanguageTool cho POD Text QA Dashboard
echo ==================================================
echo.

REM --- 1. Kiem tra Java ---
where java >nul 2>nul
if errorlevel 1 goto :nojava

REM --- 2. Neu da chay roi thi thoi ---
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:%PORT%/v2/languages' | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  echo LanguageTool DA DANG CHAY tai http://localhost:%PORT%
  echo Ban co the dong cua so nay.
  pause
  exit /b 0
)

REM --- 3. Tim ban LanguageTool da tai ---
set "LT_HOME="
for /d %%D in ("%LT_ROOT%\LanguageTool-*") do set "LT_HOME=%%D"
if defined LT_HOME goto :run

REM --- 4. Lan dau: tai va giai nen ---
echo Lan dau chay: dang tai LanguageTool, khoang 250MB, vui long doi...
if not exist "%LT_ROOT%" mkdir "%LT_ROOT%"
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'https://languagetool.org/download/LanguageTool-stable.zip' -OutFile '%LT_ROOT%\lt.zip'"
if errorlevel 1 goto :downloadfail
echo Dang giai nen...
powershell -NoProfile -Command "Expand-Archive -Force '%LT_ROOT%\lt.zip' '%LT_ROOT%'"
del "%LT_ROOT%\lt.zip"
for /d %%D in ("%LT_ROOT%\LanguageTool-*") do set "LT_HOME=%%D"
if not defined LT_HOME goto :downloadfail

:run
if not exist "%LT_HOME%\languagetool-server.jar" goto :downloadfail
echo.
echo Dang khoi dong LanguageTool tai http://localhost:%PORT%
echo GIU CUA SO NAY MO trong luc lam viec. Dong cua so = tat LanguageTool.
echo.
cd /d "%LT_HOME%"
java -Xmx1536m -cp languagetool-server.jar org.languagetool.server.HTTPServer --port %PORT%
echo.
echo LanguageTool da dung.
pause
exit /b 0

:nojava
echo [LOI] May chua cai Java (can Java 17 tro len).
echo Mo PowerShell va chay lenh:
echo     winget install EclipseAdoptium.Temurin.21.JRE
echo Hoac tai tai https://adoptium.net
echo Cai xong, dong va mo lai file nay.
pause
exit /b 1

:downloadfail
echo [LOI] Khong tai hoac giai nen duoc LanguageTool.
echo Kiem tra mang, hoac tai thu cong:
echo   https://languagetool.org/download/LanguageTool-stable.zip
echo roi giai nen vao: %LT_ROOT%
pause
exit /b 1
