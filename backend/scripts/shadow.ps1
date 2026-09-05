<#
.SYNOPSIS
  Start, stopt en bewaakt de schaduwmodus.

.DESCRIPTION
  Draait de gebouwde `dist/main.js` rechtstreeks met node, en niet via tsx of
  npx. Dat is met opzet: die wrappers starten een kindproces, en dan wijst het
  PID-bestand naar de wrapper in plaats van naar de dienst zelf. Stoppen laat
  dan een verweesd node-proces achter dat vrolijk doorlogt.

  De console-uitvoer gaat naar een bestand per run. Die uitvoer bevat alleen de
  momenten waarop het besluit verandert en is prettig om even doorheen te
  scrollen; de volledige gegevens staan in het NDJSON-logboek.

.EXAMPLE
  .\shadow.bat start
  .\shadow.bat status
  .\shadow.bat watch    # live meekijken; Ctrl+C sluit alleen het venster
  .\shadow.bat logs
  .\shadow.bat stop
#>

[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'restart', 'status', 'logs', 'watch')]
  [string]$Action = 'status',

  # Aantal regels dat `logs` toont.
  [Parameter(Position = 1)]
  [int]$Lines = 40
)

$ErrorActionPreference = 'Stop'

$Backend = Split-Path -Parent $PSScriptRoot
$RunDir = Join-Path $Backend 'data\shadow'
$PidFile = Join-Path $RunDir 'shadow.pid'
$Entry = Join-Path $Backend 'dist\main.js'

function Write-Head($text) {
  Write-Host ('─' * 64)
  Write-Host "  $text"
  Write-Host ('─' * 64)
}

function Get-RunningProcess {
  if (-not (Test-Path $PidFile)) { return $null }
  $raw = (Get-Content $PidFile -Raw).Trim()
  $processId = 0
  if (-not [int]::TryParse($raw, [ref]$processId)) { return $null }

  try { $proc = Get-Process -Id $processId -ErrorAction Stop } catch { return $null }

  # Een PID wordt na een herstart hergebruikt. Controleer dus of het echt onze
  # dienst is en niet een willekeurig proces dat toevallig hetzelfde nummer
  # kreeg — anders schiet `stop` iets anders af.
  if ($proc.ProcessName -ne 'node') { return $null }
  return $proc
}

<#
  Zoekt draaiende instanties die niet via dit script zijn gestart — bijvoorbeeld
  een handmatige `npm run shadow` in een ander venster. Twee instanties tegelijk
  schrijven in hetzelfde logboek en verdubbelen de last op Home Assistant, dus
  daar moet je voor gewaarschuwd worden.
#>
function Get-StrayProcesses {
  param([int]$Except = 0)
  try {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop |
      Where-Object {
        $_.ProcessId -ne $Except -and
        $_.CommandLine -and
        $_.CommandLine -match 'main\.(js|ts)'
      }
  } catch {
    @()
  }
}

function Get-CurrentLog {
  if (-not (Test-Path $RunDir)) { return $null }
  # Let op de tweede filter: 'console-*.log' matcht ook 'console-*.err.log',
  # en die staat er meestal leeg bij. Zonder deze regel toont status soms een
  # leeg bestand omdat dat toevallig als laatste is aangeraakt.
  Get-ChildItem -Path $RunDir -Filter 'console-*.log' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike '*.err.log' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

function Update-Build {
  $newest = Get-ChildItem -Path (Join-Path $Backend 'src') -Filter '*.ts' -Recurse |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  $needsBuild = -not (Test-Path $Entry)
  if (-not $needsBuild -and $newest) {
    $needsBuild = $newest.LastWriteTime -gt (Get-Item $Entry).LastWriteTime
  }

  if ($needsBuild) {
    Write-Host '  bouwen…'
    Push-Location $Backend
    try {
      & npm run build 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) {
        Write-Host '  BOUWEN MISLUKT. Draai `npm run build` om te zien wat er mis is.'
        exit 1
      }
    } finally {
      Pop-Location
    }
  }
}

function Start-Shadow {
  $existing = Get-RunningProcess
  if ($existing) {
    Write-Host "  Draait al (PID $($existing.Id)). Gebruik restart om opnieuw te starten."
    return
  }

  $strays = @(Get-StrayProcesses)
  if ($strays.Count -gt 0) {
    Write-Host '  LET OP: er draait al een schaduwmodus die niet via dit script is gestart:'
    foreach ($s in $strays) { Write-Host "    PID $($s.ProcessId)" }
    Write-Host '  Twee instanties schrijven in hetzelfde logboek. Sluit die eerst af'
    Write-Host '  (het venster waarin je `npm run shadow` typte), of gebruik:'
    Write-Host "    Stop-Process -Id $($strays[0].ProcessId)"
    return
  }

  Update-Build
  New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

  $stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
  $out = Join-Path $RunDir "console-$stamp.log"
  $err = Join-Path $RunDir "console-$stamp.err.log"

  $proc = Start-Process -FilePath 'node' `
    -ArgumentList 'dist/main.js' `
    -WorkingDirectory $Backend `
    -RedirectStandardOutput $out `
    -RedirectStandardError $err `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -Path $PidFile -Value $proc.Id -Encoding ascii

  # Even wachten: een configuratiefout of een geweigerd token laat het proces
  # meteen afbreken, en dan wil je dat hier zien in plaats van een vrolijk
  # "gestart" gevolgd door stilte.
  Start-Sleep -Milliseconds 1500

  if ($proc.HasExited) {
    Write-Host "  GESTOPT DIRECT NA START (afsluitcode $($proc.ExitCode)):"
    Write-Host ''
    foreach ($file in @($out, $err)) {
      if ((Test-Path $file) -and (Get-Item $file).Length -gt 0) {
        Get-Content $file -Encoding UTF8 | Select-Object -Last 20 |
          ForEach-Object { Write-Host "  $_" }
      }
    }
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    exit 1
  }

  Write-Host "  Gestart (PID $($proc.Id))."
  Write-Host "  console : $out"
  Write-Host "  besluiten: $RunDir\decisions-*.ndjson"
}

function Stop-Shadow {
  $proc = Get-RunningProcess
  if (-not $proc) {
    Write-Host '  Draait niet (geen proces dat via dit script is gestart).'
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    $strays = @(Get-StrayProcesses)
    foreach ($s in $strays) {
      Write-Host "  Wel gevonden, buiten dit script om gestart: PID $($s.ProcessId)"
      Write-Host "    Stop-Process -Id $($s.ProcessId)"
    }
    return
  }
  Stop-Process -Id $proc.Id -Force
  Remove-Item $PidFile -ErrorAction SilentlyContinue
  Write-Host "  Gestopt (PID $($proc.Id))."
}

function Show-Status {
  $proc = Get-RunningProcess
  if (-not $proc) {
    Write-Host '  Draait niet.'
    foreach ($s in @(Get-StrayProcesses)) {
      Write-Host "  Wel actief buiten dit script om: PID $($s.ProcessId)"
    }
  } else {
    $uptime = (Get-Date) - $proc.StartTime
    $geheugen = [math]::Round($proc.WorkingSet64 / 1MB, 1)
    Write-Host "  Draait   PID $($proc.Id), $([int]$uptime.TotalHours) u $($uptime.Minutes) min, $geheugen MB"
  }

  $today = Join-Path $RunDir ("decisions-{0}.ndjson" -f (Get-Date -Format 'yyyy-MM-dd'))
  if (Test-Path $today) {
    $all = Get-Content $today -Encoding UTF8
    $changed = ($all | Select-String -SimpleMatch '"changed":true').Count
    $size = [math]::Round((Get-Item $today).Length / 1KB, 0)
    Write-Host "  Vandaag  $($all.Count) besluiten, waarvan $changed met een wijziging ($size KB)"
  } else {
    Write-Host '  Vandaag  nog geen besluiten vastgelegd'
  }

  $log = Get-CurrentLog
  if ($log) {
    Write-Host ''
    Write-Host '  Laatste regels:'
    Get-Content $log.FullName -Tail 8 -Encoding UTF8 |
      ForEach-Object { Write-Host "    $_" }
  }
}

<#
  Live meekijken met de uitvoer.

  Bewust een aparte lezer op het logbestand, en geen zichtbaar consolevenster
  voor de dienst zelf: dat venster sluiten zou de opname stoppen. Zo kun je hier
  Ctrl+C drukken of het venster wegklikken zonder dat er iets gebeurt met wat er
  draait.
#>
function Watch-Shadow {
  $proc = Get-RunningProcess
  if (-not $proc) {
    Write-Host '  Draait niet. Start hem eerst met: shadow start'
    return
  }
  $log = Get-CurrentLog
  if (-not $log) {
    Write-Host '  Nog geen console-logboek.'
    return
  }
  Write-Host "  Meekijken met PID $($proc.Id) — $($log.Name)"
  Write-Host '  Ctrl+C stopt alleen het meekijken, niet de schaduwmodus.'
  Write-Host ('─' * 64)
  Get-Content $log.FullName -Tail 20 -Wait -Encoding UTF8
}

function Show-Logs {
  $log = Get-CurrentLog
  if (-not $log) {
    Write-Host '  Nog geen console-logboek.'
    return
  }
  Write-Host "  $($log.FullName)"
  Write-Host ''
  Get-Content $log.FullName -Tail $Lines -Encoding UTF8
}

switch ($Action) {
  'start' { Write-Head 'SCHADUWMODUS starten'; Start-Shadow }
  'stop' { Write-Head 'SCHADUWMODUS stoppen'; Stop-Shadow }
  'restart' {
    Write-Head 'SCHADUWMODUS herstarten'
    Stop-Shadow
    Start-Sleep -Milliseconds 500
    Start-Shadow
  }
  'status' { Write-Head 'SCHADUWMODUS status'; Show-Status }
  'logs' { Show-Logs }
  'watch' { Watch-Shadow }
}
