<#
.SYNOPSIS
    Haalt de schaduwlogboeken van de NAS en draait er de divergentietool over.

.DESCRIPTION
    Twee handelingen die altijd samen gaan: zonder verse logboeken kijk je naar
    het rapport van gisteren zonder dat te merken. Vandaar in één script.

    De divergentietool zelf heeft geen netwerk nodig — het logboek is
    zelfvoorzienend (zie DECISIONS.md, besluit 11). Alleen het ophalen ervan
    wel. Mislukt dat, dan draait de analyse gewoon door op wat er lokaal al
    staat, met een waarschuwing erbij. Dat is beter dan afbreken: oude logboeken
    analyseren kan prima, je moet alleen weten dat je het doet.

.PARAMETER Dagen
    Aantal dagbestanden om mee te nemen, nieuwste eerst. Standaard alles.

.PARAMETER Json
    Geeft het rapport als JSON in plaats van als tekst.

.PARAMETER MinMinuten
    Episodes korter dan dit worden weggelaten. Standaard 2.

.PARAMETER GeenSync
    Slaat het ophalen over en analyseert wat er lokaal staat.

.EXAMPLE
    .\tools\sync-start-divergence.ps1
    .\tools\sync-start-divergence.ps1 -Dagen 7
    .\tools\sync-start-divergence.ps1 -Json | Out-File rapport.json
#>
[CmdletBinding()]
param(
    [int]    $Dagen,
    [switch] $Json,
    [int]    $MinMinuten,
    [switch] $GeenSync
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Paden ten opzichte van dit script, zodat een verplaatste map niets breekt.
$Backend  = Join-Path (Split-Path $PSScriptRoot -Parent) 'backend'
$LokaalPad = Join-Path $Backend 'data\shadow'
$NasPad   = '\\NAS\docker\hems-climate\logs'

# Dit is een UNC-pad en moet met twee backslashes beginnen. Met één ziet Windows
# er een gewoon relatief pad in, en dan maakt robocopy vrolijk een lege map aan
# in plaats van te klagen. Dat is hier al twee keer gebeurd, dus liever luid
# falen dan een analyse op logboeken die er niet zijn (DECISIONS.md, besluit 7).
if (-not $NasPad.StartsWith('\\')) {
    Write-Error "NasPad moet een UNC-pad zijn dat met \\ begint, niet '$NasPad'."
    exit 1
}

# In -Json mag alleen JSON op stdout staan, anders is de uitvoer niet te
# pipen. Alle voortgang gaat daarom naar de informatiestroom.
function Say([string]$Text, [string]$Color = 'Gray') {
    if ($Json) { Write-Information $Text -InformationAction Continue }
    else       { Write-Host $Text -ForegroundColor $Color }
}

if (-not (Test-Path $Backend)) {
    Write-Error "De map $Backend bestaat niet. Staat dit script nog naast de projectmap?"
    exit 1
}

Say '==== HEMS-CLIMATE DIVERGENTIETOOL ====' 'Cyan'

# ---- 1. Logboeken ophalen ---------------------------------------------------
if ($GeenSync) {
    Say 'Ophalen overgeslagen (-GeenSync).' 'DarkGray'
}
else {
    Say '1. Nieuwste logboeken ophalen van de NAS...' 'Yellow'

    if (-not (Test-Path $LokaalPad)) { New-Item -ItemType Directory -Path $LokaalPad | Out-Null }

    # /xo = alleen nieuwer dan wat er al staat. De rest onderdrukt de banner.
    # Ook de .gz: dagen ouder dan een week staan op de NAS gecomprimeerd
    # (besluit 58). Staat een dag hier daarna als beide, dan telt de lezer er een.
    robocopy $NasPad $LokaalPad 'decisions-*.ndjson' 'decisions-*.ndjson.gz' /xo /njh /njs /ndl /nc /ns | Out-Null
    $rc = $LASTEXITCODE

    # Robocopy telt anders dan de rest van de wereld: 0-7 is goed (0 = niets
    # te doen), vanaf 8 is er echt iets mis.
    if ($rc -ge 8) {
        Say "  Ophalen mislukt (robocopy-code $rc)." 'Red'
        Say "  Controleer of $NasPad bereikbaar is." 'Red'
        Say '  De analyse draait door op de logboeken die lokaal staan.' 'Red'
    }
    elseif ($rc -eq 0) {
        Say '  Niets nieuws; lokaal was al bij.' 'DarkGray'
    }
    else {
        Say '  Logboeken bijgewerkt.' 'Green'
    }
}

if (-not (Test-Path $LokaalPad) -or -not (Get-ChildItem $LokaalPad -Filter 'decisions-*')) {
    Write-Error "Geen decisions-*.ndjson in $LokaalPad, en ophalen leverde niets op."
    exit 1
}

# Zeggen hoe vers de invoer is. Een rapport over logboeken van vier dagen oud
# ziet er precies hetzelfde uit als een rapport over die van vanochtend.
$nieuwste = Get-ChildItem $LokaalPad -Filter 'decisions-*' |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
$ouderdom = [int]((Get-Date) - $nieuwste.LastWriteTime).TotalHours
Say "  Nieuwste logboek: $($nieuwste.Name), $ouderdom uur oud." `
    $(if ($ouderdom -gt 24) { 'Yellow' } else { 'DarkGray' })

# ---- 2. Analyseren ----------------------------------------------------------
Say ''
Say '2. Divergentietool starten...' 'Yellow'

$argumenten = @()
if ($PSBoundParameters.ContainsKey('Dagen'))      { $argumenten += '--dagen', $Dagen }
if ($PSBoundParameters.ContainsKey('MinMinuten')) { $argumenten += '--min-minuten', $MinMinuten }
if ($Json)                                        { $argumenten += '--json' }

# Push/Pop in plaats van Set-Location: anders staat de shell van de gebruiker
# na afloop ergens anders dan waar hij begon.
Push-Location $Backend
try {
    # `--` scheidt onze argumenten van die van npm zelf.
    if ($argumenten.Count -gt 0) { npm run divergence -- @argumenten }
    else                         { npm run divergence }
    $analyse = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($analyse -ne 0) {
    Say ''
    Say "De divergentietool stopte met foutcode $analyse." 'Red'
    exit $analyse
}

Say ''
Say 'Klaar met analyseren.' 'Green'

# Alleen wachten wanneer er iemand kijkt. Dubbelklikken op het script geeft een
# venster dat anders meteen weer dichtklapt; vanuit een pijplijn of de
# Taakplanner zou dezelfde regel het script laten hangen tot de time-out.
if (-not $Json -and $Host.Name -eq 'ConsoleHost' -and -not [Console]::IsInputRedirected) {
    Say 'Druk op een toets om af te sluiten...' 'DarkGray'
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}
