# Automatisch uitrollen op de NAS

`deploy.sh` haalt de nieuwste code uit GitHub en zet die neer. Veilig om elk
kwartier te draaien: hij doet niets wanneer er niets veranderd is, en weigert
wanneer hij iets zou moeten overschrijven.

## Eenmalig instellen

**1. De repository binnenhalen.** Via SSH op de NAS:

```bash
cd /volume1/docker/hems-climate
mv src src-oud                                  # als er al een src staat
git clone https://github.com/Ricardo-switch/hems-climate.git src
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
