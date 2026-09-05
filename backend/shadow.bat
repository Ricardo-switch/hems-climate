@echo off
REM Ingang voor de schaduwmodus.
REM
REM   shadow start     starten (bouwt eerst als de code nieuwer is dan dist)
REM   shadow stop      stoppen
REM   shadow restart   stoppen en opnieuw starten
REM   shadow status    draait hij, en wat heeft hij vandaag gedaan
REM   shadow logs      laatste regels van de console-uitvoer
REM   shadow watch     live meekijken (Ctrl+C stopt alleen het kijken)
REM
REM Zonder argument toont hij de status en blijft het venster open staan, zodat
REM je hem ook kunt dubbelklikken zonder dat het scherm meteen wegvalt.

setlocal
set "ACTION=%~1"

if "%ACTION%"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\shadow.ps1" status
  echo.
  echo   Dubbelklik shadow-watch.bat om live mee te kijken.
  echo.
  pause
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\shadow.ps1" %ACTION% %2 %3
endlocal
