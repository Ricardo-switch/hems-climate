@echo off
REM Live meekijken met de schaduwmodus.
REM
REM Dubbelklikken mag: dit venster leest alleen het logboek mee. Sluiten of
REM Ctrl+C stopt het kijken, niet de opname. Je kunt er meerdere openen.

title Schaduwmodus - live
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\shadow.ps1" watch

REM Kom je hier, dan is het meekijken gestopt (of hij draaide niet).
echo.
pause
