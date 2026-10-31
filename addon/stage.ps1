<#
.SYNOPSIS
  Zet de add-on klaar in de vorm die de Supervisor verwacht.

.DESCRIPTION
  De Supervisor bouwt een add-on met de map van de add-on zélf als bouwcontext:
  hij koppelt alleen die map aan (read-only op /addon) en draait daar
  `docker buildx build .`. Alles daarbuiten bestaat tijdens het bouwen niet.

  Onze code staat in `backend/` en `frontend/`, een niveau hoger dan `addon/`.
  Die twee werelden komen hier bij elkaar: dit script slaat de boom plat tot één
  map die de Supervisor in zijn geheel kan bouwen.

      dist-addon/
        config.yaml      build.yaml      Dockerfile      run.sh
        backend/         frontend/       .dockerignore

  Wat er níet in gaat: node_modules, dist, de HA-back-up, .git, .env. Dat is
  geen netheid maar noodzaak — de map gaat naar een Samba-share die op het
  netwerk staat, en in die back-up zitten secrets.yaml en aanmeldtokens.

.EXAMPLE
  pwsh addon/stage.ps1
  # en dan de inhoud van dist-addon naar \\homeassistant\addons\hems-climate\
#>

[CmdletBinding()]
param(
  # Waar de platgeslagen boom komt. Leeg betekent: naast de projectwortel.
  # (Niet als standaardwaarde hierboven, want $PSScriptRoot is in het
  # param-blok van Windows PowerShell 5.1 nog leeg.)
  [string]$Doel = '',

  # Meteen doorkopiëren naar de add-on-share van Home Assistant. Bijvoorbeeld
  # \\homeassistant\addons\hems-climate
  [string]$Share
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$wortel = Split-Path $PSScriptRoot -Parent
if (-not $Doel) { $Doel = Join-Path $wortel 'dist-addon' }

# Wat er mee moet, en waarvandaan. Bewust een opsomming en geen "kopieer alles
# behalve": een nieuwe map in de repository hoort niet stilzwijgend in het image
# te belanden.
$bestanden = @(
  @{ Van = 'addon/config.yaml';            Naar = 'config.yaml' }
  @{ Van = 'addon/build.yaml';             Naar = 'build.yaml' }
  @{ Van = 'addon/Dockerfile';             Naar = 'Dockerfile' }
  @{ Van = 'addon/run.sh';                 Naar = 'run.sh' }
  @{ Van = 'addon/README.md';              Naar = 'README.md' }
  @{ Van = 'addon/DOCS.md';                Naar = 'DOCS.md' }
  # Het teken van SunArc (besluit 222), gemaakt met frontend/tools/iconen.cjs.
  @{ Van = 'addon/icon.png';               Naar = 'icon.png' }
  @{ Van = 'addon/logo.png';               Naar = 'logo.png' }
  @{ Van = 'addon/dark_logo.png';          Naar = 'dark_logo.png' }
  @{ Van = 'addon/translations/nl.yaml';   Naar = 'translations/nl.yaml' }
  @{ Van = 'addon/translations/en.yaml';   Naar = 'translations/en.yaml' }
  @{ Van = '.dockerignore';                Naar = '.dockerignore' }
  @{ Van = 'backend/package.json';         Naar = 'backend/package.json' }
  @{ Van = 'backend/package-lock.json';    Naar = 'backend/package-lock.json' }
  @{ Van = 'backend/tsconfig.json';        Naar = 'backend/tsconfig.json' }
  @{ Van = 'backend/tsconfig.build.json';  Naar = 'backend/tsconfig.build.json' }
  @{ Van = 'frontend/package.json';        Naar = 'frontend/package.json' }
  @{ Van = 'frontend/package-lock.json';   Naar = 'frontend/package-lock.json' }
  @{ Van = 'frontend/build.js';            Naar = 'frontend/build.js' }
)

$mappen = @(
  @{ Van = 'backend/src';   Naar = 'backend/src' }
  @{ Van = 'backend/test';  Naar = 'backend/test' }
  @{ Van = 'backend/tools'; Naar = 'backend/tools' }
  # Het wekwoord dat de dienst zelf hoort (besluit 208).
  @{ Van = 'backend/wekwoord'; Naar = 'backend/wekwoord' }
  @{ Van = 'frontend/src';  Naar = 'frontend/src' }
  @{ Van = 'frontend/kit';  Naar = 'frontend/kit' }
  # Het wekwoord "Hé huis" (besluit 177): run.sh zet het klaar voor openWakeWord.
  @{ Van = 'addon/wekwoord'; Naar = 'wekwoord' }
  # De integratie voor Home Assistant (besluit 184): de add-on zet hem neer voor wie geen HACS heeft.
  @{ Van = 'custom_components/smart_climate'; Naar = 'integratie/smart_climate' }
)

if (Test-Path $Doel) { Remove-Item $Doel -Recurse -Force }
New-Item -ItemType Directory -Path $Doel | Out-Null

foreach ($b in $bestanden) {
  $bron = Join-Path $wortel $b.Van
  if (-not (Test-Path $bron)) { throw "Ontbreekt: $($b.Van)" }
  $naar = Join-Path $Doel $b.Naar
  $map = Split-Path $naar -Parent
  if (-not (Test-Path $map)) { New-Item -ItemType Directory -Path $map | Out-Null }
  Copy-Item $bron $naar
}

foreach ($m in $mappen) {
  $bron = Join-Path $wortel $m.Van
  if (-not (Test-Path $bron)) { throw "Ontbreekt: $($m.Van)" }
  Copy-Item $bron (Join-Path $Doel $m.Naar) -Recurse
}

# Een shellscript met CRLF geeft op Linux `$'\r': command not found`, en die
# melding wijst nergens naar. .gitattributes houdt het in de repository op LF;
# dit controleert of het ook zo aankomt.
$ruw = [System.IO.File]::ReadAllText((Join-Path $Doel 'run.sh'))
$cr = [regex]::Matches($ruw, "`r").Count
if ($cr -gt 0) { throw "run.sh heeft $cr keer CR. Op Linux start dat niet." }

# Met `image:` haalt de Supervisor het kant-en-klare image van GitHub op in
# plaats van te bouwen. Een lokale add-on hoort juist deze code te bouwen, dus
# die regel gaat er in de kopie uit (besluit 153).
$manifest = Join-Path $Doel 'config.yaml'
$regels = [System.IO.File]::ReadAllLines($manifest) | Where-Object { $_ -notmatch '^image:' }
[System.IO.File]::WriteAllText($manifest, (($regels -join "`n") + "`n"))

$aantal = (Get-ChildItem $Doel -Recurse -File).Count
$mb = [math]::Round(((Get-ChildItem $Doel -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Host "Klaargezet in $Doel — $aantal bestanden, $mb MB"

if ($Share) {
  # Eerst kijken of de share zelf bestaat, en niet of de doelmap bestaat. Doet
  # hij dat niet, dan komt er anders een `New-Item`-fout over een "ongeldige
  # indeling" die nergens naar wijst; de werkelijke oorzaak is dat de
  # Samba-add-on niet draait.
  if ($Share.StartsWith('\\')) {
    $delen = $Share.TrimStart('\') -split '\\'
    if ($delen.Count -lt 2) { throw "Geen geldig netwerkpad: $Share" }
    $wortelShare = '\\' + $delen[0] + '\' + $delen[1]
    if (-not (Test-Path $wortelShare)) {
      Write-Host ""
      Write-Host "$wortelShare is niet bereikbaar."
      Write-Host ""
      Write-Host "Meestal betekent dat de Samba-add-on in Home Assistant niet draait,"
      Write-Host "of dat deze share niet in enabled_shares staat. Nakijken met:"
      Write-Host ""
      Write-Host "  net view $('\\' + $delen[0])"
      Write-Host ""
      Write-Host "Zonder share kun je het resultaat met de hand kopieren; het staat"
      Write-Host "klaar in $Doel"
      exit 1
    }
  }
  if (-not (Test-Path $Share)) { New-Item -ItemType Directory -Path $Share -Force | Out-Null }
  # Eerst leegmaken: een oud bestand dat blijft liggen wordt meegebouwd.
  Get-ChildItem $Share -Force | Remove-Item -Recurse -Force
  Copy-Item (Join-Path $Doel '*') $Share -Recurse -Force
  Write-Host "Gekopieerd naar $Share"
  Write-Host "Nu in Home Assistant: Instellingen -> Add-ons -> Add-on store -> drie puntjes -> Vernieuwen"
}
