# Automatisch uitrollen op de NAS

`deploy.sh` haalt de nieuwste code uit GitHub en zet die neer. Veilig om elk
kwartier te draaien: hij doet niets wanneer er niets veranderd is, en weigert
wanneer hij iets zou moeten overschrijven.

## Eenmalig instellen

**1. De repository binnenhalen.** Via SSH op de NAS:

```bash
cd /volume1/docker/hems-climate
mv src src-oud                                  # als er al een src staat
git clone https://github.com/Ricardo-switch/SunARC-HA-APP.git src
cp src/deploy/docker-compose.yml .              # de compose hoort in de wortel
```

Je `.env`, `config/` en `logs/` blijven waar ze staan. Die horen bij deze
installatie en komen niet uit git.

**2. Het script neerzetten en uitvoerbaar maken:**

```bash
cp /volume1/docker/hems-climate/src/deploy/deploy.sh /volume1/docker/hems-climate/
chmod +x /volume1/docker/hems-climate/deploy.sh
```

Het script staat bewust in de wortel en niet in `src/`, zodat een `git pull`
nooit het script kan raken dat op dat moment draait.

Die scheiding heeft een keerzijde: een verbetering in `deploy.sh` komt pas mee
nadat je stap 2 opnieuw doet. Het script werkt zichzelf niet bij, met opzet.

**3. Eerst proefdraaien**, voordat je iets inplant:

```bash
/volume1/docker/hems-climate/deploy.sh --dry-run
```

Dat wijzigt niets en laat zien wat hij zou doen.

**4. Inplannen.** DSM → *Configuratiescherm* → *Taakplanner* →
*Maken* → *Geplande taak* → *Door gebruiker gedefinieerd script*

- Taak: `HEMS uitrollen`
- Gebruiker: `root` (nodig voor docker)
- Schema: elke dag, herhalen elk uur (of elk kwartier; hij doet niets als er
  niets veranderd is)
- Opdracht: `/volume1/docker/hems-climate/deploy.sh`

Zet onder *Instellingen* het e-mailen van details aan, maar vink
**"alleen bij afwijkende uitvoer"** aan. Anders krijg je elk uur een mail dat
er niets te doen was.

## Wat hij doet, en wat niet

**Alleen wat nodig is.** Wijziging in `backend/` → herbouwen en omwisselen.
Alleen `deploy/docker-compose.yml` → opnieuw aanmaken zonder herbouw. Een
gewijzigd README raakt de draaiende dienst niet en levert geen werk op.

**Eerst bouwen, dan omwisselen.** Mislukt het bouwen, dan blijft de draaiende
container ongemoeid en is er niets gebeurd.

**Onderbreking van seconden, geen nul.** Eén container die vervangen wordt
betekent altijd even niets. Echte nul-downtime vraagt twee containers en een
proxy, en dat is voor een schaduwlogger onzin: het logboek schrijft elke 15 tot
30 seconden, dus een gat van een paar seconden is niet te onderscheiden van een
rustige minuut.

**Hij overschrijft je werk niet.** Staan er lokale wijzigingen in `src/`, dan
stopt hij ermee en zegt welke. Samenvoegen gebeurt alleen fast-forward, zodat er
op de NAS nooit geschiedenis ontstaat.

**De configuratie blijft van jou.** `config/sites/*.json` hoort bij deze
installatie en wordt niet uit git overgezet. Verschilt de versie in git van wat
er draait, dan meldt hij dat — kopiëren doe je zelf.

**Hij weet wat er draait.** In `.deployed` staat de commit die werkelijk is
neergezet. Zonder dat onderscheid ontstaat een stille val: mislukt het bouwen,
dan staat de werkmap al op de nieuwe commit, en zou de volgende run concluderen
dat er niets te doen valt. De mislukte uitrol wordt dan nooit meer geprobeerd.

**Twee taken tegelijk kan niet.** Een slot op basis van `mkdir` houdt
overlappende runs tegen; een slot dat ouder is dan een uur wordt als restant
van een afgebroken run opgeruimd.

## De Taakplanner is een andere wereld

Een geplande taak draait niet in jouw shell. Drie dingen zijn daar anders, en
alle drie hebben ze dit script een keer laten struikelen:

- **Geen PATH** naar docker en git. Het script zoekt ze daarom expliciet op.
- **Geen `HOME=/root`**, waardoor ssh de sleutel niet vond. Die wordt nu
  expliciet meegegeven.
- **Geen bash.** DSM start scripts met `/bin/sh`, en dat is busybox ash. Die
  kent geen arrays en geen procesvervanging. Het script start zichzelf daarom
  opnieuw onder bash zodra het merkt dat het niet onder bash draait.

Daardoor werkt het nu ongeacht hoe de taak is ingesteld — of je nu het pad
opgeeft, `bash /pad/deploy.sh`, of `sh /pad/deploy.sh`.

**Toets een wijziging in dit script altijd via de Taakplanner zelf**, met
*Uitvoeren*, en niet alleen vanaf de commandoregel. Alleen zo draai je in
dezelfde omgeving als straks om drie uur 's nachts.

## De sleutel en de Taakplanner

Een geplande taak draait niet in een loginshell. `HOME` kan daardoor ergens
anders wijzen dan `/root`, en dan zoekt ssh de sleutel op de verkeerde plek —
met een `Permission denied (publickey)` die niets met GitHub te maken heeft.

Het script geeft de sleutel daarom expliciet mee via `GIT_SSH_COMMAND`, en gaat
uit van `/root/.ssh/id_ed25519`. Staat die ergens anders, zet dan bovenin het
script `GIT_SSH_KEY` op het juiste pad.

**Toets de taak altijd via de Taakplanner zelf** en niet alleen vanaf de
commandoregel. Alleen zo draai je in dezelfde omgeving als straks. Selecteer de
taak, kies *Uitvoeren*, en kijk daarna in `deploy.log`.

## Als het misgaat

Komt de nieuwe container niet op, dan stopt het script met een foutcode, toont
de laatste regels uit de container, en geeft het commando om terug te vallen op
`hems-climate/shadow:vorige` — het image van vóór deze uitrol. Dat terugvallen
gebeurt niet vanzelf: automatisch terugrollen op een container die misschien
alleen traag opstart maakt het erger.

Het logboek staat in `/volume1/docker/hems-climate/deploy.log` en wordt op
2000 regels afgekapt.

## Handmatig

```bash
./deploy.sh --dry-run    # tonen wat er zou gebeuren
./deploy.sh              # normaal
./deploy.sh --force      # herbouwen ook zonder wijzigingen
```

## Als de geschiedenis is herschreven

Wordt er op GitHub geforceerd gepusht — bijvoorbeeld omdat er iets uit de
geschiedenis moest dat er niet in hoorde — dan is de commit op de NAS geen
voorouder meer van wat er op origin staat. `deploy.sh` merkt dat sinds
10 september zelf op en zet de werkmap terug in plaats van te proberen samen te
voegen; hij logt daarbij de oude commit, zodat je terug kunt.

Draait er nog een oudere versie van het script, dan strandt de uitrol op
`refusing to merge unrelated histories` en stopt hij met code 128 zonder iets
te wijzigen. Eenmalig rechtzetten:

```bash
cd /volume1/docker/hems-climate/src
git fetch origin
git reset --hard origin/main
cp deploy/deploy.sh /volume1/docker/hems-climate/deploy.sh
chmod +x /volume1/docker/hems-climate/deploy.sh
```

De eerstvolgende uitrol bouwt daarna volledig opnieuw: de commit die in
`.deployed` staat bestaat niet meer, dus er valt niets te vergelijken.
