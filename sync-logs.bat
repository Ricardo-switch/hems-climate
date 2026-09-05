@echo off
REM Haalt de beslislogboeken van de NAS naar deze pc.
REM
REM Alleen nieuwe en gewijzigde .ndjson-bestanden. Het logboek van vandaag groeit
REM nog, dus dat wordt elke keer opnieuw opgehaald; de afgeronde dagen niet.
REM
REM   sync-logs            haal op
REM   sync-logs /L         alleen tonen wat er zou gebeuren, niets kopieren

setlocal

set "BRON=\\NAS\docker\hems-climate\logs"
set "DOEL=%~dp0backend\data\shadow"

echo Bron : %BRON%
echo Doel : %DOEL%
echo.

if not exist "%DOEL%" mkdir "%DOEL%"

REM /xo   alleen nieuwer dan wat er al staat
REM /njh  geen kop
REM /njs  geen samenvatting
REM /ndl  geen mappenlijst
REM /nc   geen klassekolom
REM /ns   geen bestandsgroottes
REM /r:2  hoogstens twee pogingen bij een netwerkhapering
REM /w:5  vijf seconden wachten tussen pogingen
robocopy "%BRON%" "%DOEL%" *.ndjson /xo /njh /njs /ndl /nc /ns /r:2 /w:5 %1

REM Robocopy gebruikt afsluitcodes als bitvlaggen: 0 = niets te doen,
REM 1 = bestanden gekopieerd, 2 = extra bestanden op het doel, 3 = beide.
REM Pas vanaf 8 is er echt iets mis. Zonder deze vertaling ziet elke geslaagde
REM synchronisatie eruit als een fout.
set "RC=%ERRORLEVEL%"

if %RC% GEQ 8 (
  echo.
  echo MISLUKT ^(robocopy-code %RC%^).
  echo   Staat de NAS aan en is \\NAS\docker bereikbaar in Verkenner?
  echo   Netwerkschijven zijn per gebruiker; open de map eenmalig in Verkenner
  echo   zodat Windows de verbinding kent.
  exit /b 1
)

if %RC% EQU 0 echo Niets nieuws.
if %RC% GEQ 1 if %RC% LSS 8 echo Klaar.

REM Wat er nu lokaal staat.
echo.
for /f %%A in ('dir /b "%DOEL%\decisions-*.ndjson" 2^>nul ^| find /c /v ""') do (
  echo   %%A dagbestanden in backend\data\shadow
)

exit /b 0
