# Project: Smart Climate OS (met HEMS roadmap)

## 1. De Visie (Think Big)
We bouwen een onafhankelijk, predictief besturingssysteem voor autonoom klimaatbeheer, dat in een latere fase schaalt naar een volwaardig Home Energy Management System (HEMS). 
Home Assistant fungeert uitsluitend als 'Hardware Abstraction Layer' (HAL) en doorgeefluik. 
De logica, AI-predictie en de interface draaien in een losse Node.js / web-stack. De datastromen (P1-meter, weer, temperatuur) worden modulair binnengehaald, zodat ze eerst voor klimaat en later voor energiebalancering gebruikt kunnen worden.

## 2. De Architectuur
- **Hardware Laag (Driver):** Home Assistant (headless). Communicatie verloopt strikt via de officiële WebSocket API.
- **Backend (Het Brein):** Node.js applicatie. Ontworpen in modulaire blokken (bijv. `climate_controller.js`, en later `energy_balancer.js`). 
- **Frontend (Kiosk UI):** Ultralichte, single-page applicatie (HTML/Tailwind/Vanilla JS). Geoptimaliseerd voor een low-end display (Samsung Tab A7 Lite). Visuele intelligentie zit in CSS/SVG-animaties, DOM-manipulatie is minimaal.

## 3. Ontwerpprincipes (Lean)
- **Eliminatie van verspilling:** Geen UI-logica in de frontend, de Node.js backend berekent alles. 
- **Gedeelde Databronnen:** Zowel klimaat als HEMS leunen op dezelfde sensoren (netto verbruik via P1, weersvoorspelling via Open-Meteo, lokale temperatuur).
- **Harde Failsafes:** Ingebouwde wiskundige limieten in de backend om pendelen van apparatuur (zoals airco's) te voorkomen.

## 4. Roadmap & Fases
- **Fase 1 (Huidige focus): Autonoom Klimaatbeheer.** Het vertalen van de huidige 'Zomer/Winter' en 'PV-Koelen' logica naar Node.js. Aanvoelen van de thermische inertie en autonoom sturen van airco's/verwarming.
- **Fase 2 (Toekomst): HEMS.** Toevoegen van energie-balancering (EV, thuisbatterij, dynamische tarieven) op basis van exact dezelfde datastromen, plus visuele uitbreiding van de energiestromen in de UI.

## 5. Huidige Taak (Start Small)
Start met de Proof of Concept voor Fase 1 in een Docker-sandbox:
1. Initialiseer de Node.js backend (`package.json`).
2. Bouw de WebSocket verbinding met de Home Assistant driver.
3. Lees succesvol de state van één demo temperatuursensor en de P1-meter uit.

## 6. Repository & Infrastructuur (Monorepo)
Het project wordt beheerd als een Monorepo om frontend en backend naadloos op elkaar te laten aansluiten. De Home Assistant (HAL) code wordt **niet** in deze repository ontwikkeld, maar behandeld als een externe dependency.

**Mappenstructuur:**
- `/backend`: Node.js applicatie (bevat de logica, websockets, en het abstracte device registry).
- `/frontend`: HTML/Tailwind/JS Kiosk UI.
- `/docs`: Referentiemateriaal en legacy code.

**Deployment & Docker:**
- Het project gebruikt uiteindelijk een `docker-compose.yml` in de root.
- **SaaS Type A (Bring your own HAL):** Gebruikers draaien onze backend/frontend containers en verbinden met hun eigen, bestaande Home Assistant via een token.
- **SaaS Type B (Plug & Play):** De `docker-compose.yml` rolt een onzichtbare, lege Home Assistant container uit die puur fungeert als Zigbee/Matter antenne voor de Node.js backend.