@echo off
chcp 65001 >nul
title CUESTIONARIO - servidor local
cd /d "%~dp0"

echo ============================================
echo   CUESTIONARIO - arranque en local
echo ============================================
echo.

REM --- 1) Comprobar que Node.js esta instalado ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encuentra Node.js.
  echo Instalalo desde https://nodejs.org  ^(version 22.13 o superior^)
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODEVER=%%v
echo Node.js detectado: %NODEVER%
echo.

REM --- 1b) La libreria que lee los PDF exige Node 22.13 o superior ---
set NODEMAJOR=%NODEVER:~1,2%
if %NODEMAJOR% LSS 22 (
  echo [ERROR] Tu version de Node.js es demasiado antigua: %NODEVER%
  echo Necesitas la 22.13 o superior ^(la 24 LTS es la recomendada^).
  echo Descargala en https://nodejs.org
  echo.
  pause
  exit /b 1
)

REM --- 2) Instalar dependencias la primera vez ---
if not exist "node_modules" (
  echo Instalando dependencias ^(solo la primera vez, puede tardar^)...
  echo.
  call npm install --cache .npm-cache --no-audit --no-fund --ignore-scripts
  if errorlevel 1 (
    echo.
    echo [ERROR] Fallo la instalacion de dependencias.
    pause
    exit /b 1
  )
  echo.
) else (
  echo Dependencias ya instaladas: se omite npm install.
  echo.
)

REM --- 3) Abrir el navegador y arrancar el servidor ---
echo Abriendo http://localhost:3000 en el navegador...
start "" "http://localhost:3000"

echo.
echo --------------------------------------------
echo  Servidor en marcha. Para detenerlo: Ctrl + C
echo --------------------------------------------
echo.

node servidor\index.js

echo.
echo El servidor se ha detenido.
pause
