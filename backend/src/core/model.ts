/**
 * Configuratiemodel: alles wat huisspecifiek is leeft hier, en nergens anders.
 *
 * De kern kent geen entity-ID's, geen kamernamen en geen bewonersnamen. Een
 * adapter vertaalt DeviceRef naar wat zijn platform ook gebruikt
 * (`climate.air_conditioning_zolder`, een Modbus-register, een MQTT-topic).
 */

/** Ondoorzichtige verwijzing naar een apparaat of meetpunt bij één adapter. */
export interface DeviceRef {
  readonly adapter: string;
  readonly id: string;
}

/**
 * Een meetwaarde, eventueel uit een attribuut van een entiteit.
 *
 * Zonder `attribute` is het de waarde van de entiteit zelf — een
 * `sensor.woonkamer_temperatuur` en klaar. Mét `attribute` staat de waarde
 * ergens ín die entiteit: `climate.thermostaat_badkamer` meldt zijn
 * kamertemperatuur als `current_temperature` en niet als eigen sensor.
 *
 * Dat komt vaker voor dan je zou denken. Een airco of thermostaat met een
 * ingebouwde thermometer levert lang niet altijd een losse `sensor.`-entiteit,
 * en zonder deze vorm kon zo'n kamer helemaal geen zone worden — precies wat
 * er bij de badkamer van de gemeten woning gebeurde (besluit 41).
 *
 * De kern merkt hier niets van: die krijgt een getal. Het uitlezen is werk van
 * de adapter, en beide adapters — live en replay — konden attributen al lezen.
 */
export interface MeasurementPoint extends DeviceRef {
  readonly attribute?: string;
}

/**
 * De bedrijfsmodi van de woning. Dit is een gesloten union: een modus die hier
 * niet in staat compileert niet. Precies de klasse fouten die in de YAML-versie
 * pas op de draaiende installatie zichtbaar werd (`handmatig` bestond niet als
 * optie, `'Uit '` had een spatie).
 */
export const MODES = [
  'dag',
  'nacht',
  'voorverwarmen',
  'afwezig',
  'vakantie',
  'handmatig',
] as const;
export type Mode = (typeof MODES)[number];

/**
 * Modi waarin de regeling zich terugtrekt.
 *
 * `handmatig` is geen temperatuurregime maar een instructie: laat staan wat er
 * staat. De bewoner heeft de knoppen overgenomen, en dan hoort de arbiter geen
 * setpoint te sturen, geen apparaat te starten en ook geen draaiend apparaat af
 * te schakelen. Dat laatste is het verschil met `nacht`, waar "niets te doen"
 * juist wél betekent dat de boel uit mag.
 */
export const HANDS_OFF_MODES: ReadonlySet<Mode> = new Set<Mode>(['handmatig']);

export function isHandsOff(mode: Mode): boolean {
  return HANDS_OFF_MODES.has(mode);
}

/** Wat een actuator op enig moment doet. */
export const ACTIONS = ['heat', 'cool', 'standby', 'off'] as const;
export type Action = (typeof ACTIONS)[number];

export interface SetpointPair {
  /** Doeltemperatuur bij verwarmen, in °C. */
  readonly heat?: number;
  /** Doeltemperatuur bij koelen, in °C. */
  readonly cool?: number;
}

/**
 * Standby: het apparaat blijft aan maar vraagt geen vermogen, doordat het
 * setpoint naar een onbereikbare waarde wordt geduwd. Bespaart compressorstarts
 * ten opzichte van hard uitschakelen. Overgenomen uit de YAML-versie, waar dit
 * als vaste 18/25 in de regellogica stond.
 */
export interface StandbySetpoints {
  readonly heat: number;
  readonly cool: number;
}

export interface ActuatorCapabilities {
  readonly canHeat: boolean;
  readonly canCool: boolean;
  /** Toegestane setpointband van het apparaat zelf, in °C. */
  readonly setpointRange: readonly [min: number, max: number];
  /** Weglaten wanneer het apparaat alleen hard aan/uit kan. */
  readonly standby?: StandbySetpoints;
}

export interface ActuatorPower {
  /** Live vermogensmeting, wanneer beschikbaar. */
  readonly sensor?: DeviceRef;
  /** Terugval wanneer er geen meting is, of het apparaat uit staat, in W. */
  readonly estimatedW: number;
}

export interface ActuatorTiming {
  /** Minimale draaitijd voordat afschakelen is toegestaan. */
  readonly minRunMinutes: number;
  /** Minimale rusttijd voordat opnieuw starten is toegestaan. */
  readonly minRestMinutes: number;
  /**
   * Periode na een schakeling waarin het vermogen nog niet representatief is.
   * Voorkomt dat de regeling op een startpiek reageert.
   */
  readonly settleMinutes: number;
}

/**
 * `primary` levert de basiswarmte (CV, warmtepomp). `assist` springt bij en mag
 * altijd wijken: de arbiter schakelt assist-apparaten als eerste terug wanneer
 * het vermogensbudget krimpt.
 */
export type ActuatorRole = 'primary' | 'assist';

export interface Actuator {
  readonly id: string;
  readonly name: string;
  readonly ref: DeviceRef;
  readonly role: ActuatorRole;
  readonly capabilities: ActuatorCapabilities;
  readonly power: ActuatorPower;
  readonly timing: ActuatorTiming;
}

/**
 * Aparte in- en uitschakeldrempels. De YAML-versie had dit alleen voor de
 * zolder (18,0 aan / 18,5 uit); hier is het een eigenschap van elke zone.
 */
export interface Hysteresis {
  /**
   * Hoe ver voorbij het doel de vraag ontstaat, in °C. Verwarmen begint bij
   * `doel - onDelta`, koelen bij `doel + onDelta`.
   */
  readonly onDelta: number;
  /**
   * Hoe ver voorbij het doel de vraag pas vervalt, in °C. Verwarmen loopt door
   * tot `doel + offDelta`, koelen tot `doel - offDelta`.
   *
   * Mag groter zijn dan `onDelta` — dat is juist het geval bij de zolder, die
   * bij 18,0 aangaat en pas bij 18,5 loslaat. De band loopt van
   * `doel - onDelta` tot `doel + offDelta`; is die band nul breed, dan gaat het
   * apparaat klapperen.
   */
  readonly offDelta: number;
}

/**
 * Hoe traag de zone reageert. Bepaalt hoe ver vooruit gebufferd mag worden en
 * hoeveel overschrijding van het setpoint acceptabel is bij gratis stroom.
 */
export type ThermalMass = 'low' | 'medium' | 'high';

export interface Zone {
  readonly id: string;
  readonly name: string;
  readonly temperature: MeasurementPoint;
  readonly humidity?: MeasurementPoint;
  /** Verwijst naar Actuator.id. Volgorde is niet betekenisvol. */
  readonly actuatorIds: readonly string[];
  /** Lager wint bij schaarste. 1 is de belangrijkste zone. */
  readonly priority: number;
  readonly thermalMass: ThermalMass;
  readonly hysteresis: Hysteresis;
  readonly setpoints: Readonly<Record<Mode, SetpointPair>>;
  readonly buffering: Buffering;
  /**
   * De temperatuur die comfort niet laat overschrijden, in °C — desnoods op
   * netstroom (besluit 50).
   *
   * Zonder dit veld bestaat er geen comfortpad voor koelen in een zone waar
   * geen enkele primary kan koelen. De airco's zijn `assist`, en assist draait
   * alleen op overschot. Op een bewolkte dag van 28 graden koelt er dan niets,
   * hoe warm het ook wordt. In het septemberlogboek zat de woonkamer 96,6% van
   * de tijd meer dan een halve graad boven zijn doel.
   *
   * Dit is een plafond en geen doel: hij koelt tót deze waarde, niet tot het
   * koeldoel. Dat is het verschil tussen "het mag niet warmer worden dan dit"
   * en "het moet hier naartoe", en het scheelt het grootste deel van de
   * netstroom.
   *
   * Weglaten betekent: geen plafond, en dan is het gedrag zoals het was.
   */
  readonly comfortMaxC?: number;
}

/**
 * Voorladen op gratis stroom.
 *
 * `enabled` en `bandC` zijn bewust twee velden. Eerder deed één getal beide:
 * nul betekende "geen buffering", en dat is een bijwerking van een waarde in
 * plaats van een keuze. Wie de band per ongeluk op nul zette, schakelde de hele
 * strategie voor die zone uit zonder het te merken — precies het soort
 * stilzwijgende koppeling dat we uit de YAML-versie kennen.
 */
export interface Buffering {
  readonly enabled: boolean;
  /** Hoeveel graden voorbij het doel mag worden doorgeladen, in °C. */
  readonly bandC: number;
}

export interface PowerSources {
  /**
   * Netvermogen. Negatief bij teruglevering.
   *
   * Optioneel: niet elke woning heeft een slimme meter die dit uitleest. Zonder
   * hem valt `pv-surplus` weg — die strategie is de enige die vermogen claimt.
   * Comfort en heat-assist vragen `budgetW: 0` en merken er niets van.
   */
  readonly gridPower?: DeviceRef;
  /** Overschot waarboven een apparaat mag starten, in W. */
  readonly startSurplusW: number;
  /**
   * Import waarboven draaiende apparaten moeten terugvallen, in W.
   * Bewust hoger dan nul: een kleine import is goedkoper dan een herstart.
   */
  readonly stopImportW: number;
  /**
   * Lagere drempel voor een apparaat dat al draaide en kortstondig uitviel.
   * Voorkomt pendelen bij wisselende bewolking.
   */
  readonly resumeSurplusW: number;
  /** Rustperiode na elke schakeling voordat opnieuw geschakeld mag worden. */
  readonly stabilisationMinutes: number;
}

/**
 * Waar een richting vandaan komt. Wat de bewoner zegt, wint van een meting; een
 * schatting is een begin tot er gemeten is (besluit 93).
 */
export const GEOMETRY_SOURCES = ['bewoner', 'gemeten', 'schatting'] as const;
export type GeometrySource = (typeof GEOMETRY_SOURCES)[number];

/** Een gevel, met de kant waar hij naartoe kijkt. */
export interface Facade {
  readonly id: string;
  readonly name: string;
  /** Kompasrichting waar de gevel naartoe kijkt: 90 is oost. */
  readonly azimuthDeg: number;
  /** De zones achter deze gevel; daar komt de zon binnen. */
  readonly zoneIds: readonly string[];
  readonly source: GeometrySource;
}

/** Een dakvlak met panelen. */
export interface SolarPlane {
  readonly id: string;
  readonly azimuthDeg: number;
  /** 0 is plat, 90 staat rechtop. */
  readonly tiltDeg: number;
  /** Wattpiek van de panelen op dit vlak. */
  readonly peakW: number;
  /** Waar de richting en de helling vandaan komen. */
  readonly source: GeometrySource;
}

export interface Geometry {
  readonly facades: readonly Facade[];
  readonly solarPlanes: readonly SolarPlane[];
  /** Wat de omvormer hooguit levert; daarboven kapt hij af. */
  readonly inverterMaxW?: number;
}

/**
 * Eén fase van de aansluiting (besluit 78): de stroommeter en de zekering.
 *
 * Een woning met één fase heeft er één; met drie fasen drie. De spanning is
 * optioneel: zonder meting rekent de arbiter met 230 V.
 */
export interface GridPhase {
  readonly id: string;
  /** De stroom op deze fase in A, zoals de P1-meter hem meet. */
  readonly current: DeviceRef;
  /** De spanning op deze fase in V; weglaten is 230 V. */
  readonly voltage?: DeviceRef;
  /** De hoofdzekering op deze fase, in A. */
  readonly maxA: number;
}

/**
 * Het tweede budget naast vermogen (besluit 78): de stroom per fase blijft
 * onder de hoofdzekering min een marge.
 */
export interface GridLimits {
  readonly phases: readonly GridPhase[];
  /** Hoeveel ampère onder de zekering de arbiter wegblijft. */
  readonly marginA: number;
}

/**
 * Een apparaat dat één programma draait en dan stopt, en dat Smart Climate op
 * zon laat beginnen (besluit 98).
 */
export interface Deferrable {
  readonly id: string;
  readonly name: string;
  /** "Start op afstand toegestaan": een programma staat klaar en de bewoner laat het toe. */
  readonly remoteStart: DeviceRef;
  /** De bedrijfsstatus, om te zien of het programma al draait of klaar is. */
  readonly operationState?: DeviceRef;
  /** Wat het apparaat ongeveer trekt als het draait, in W. */
  readonly estimatedW: number;
  /** Uiterlijk om deze tijd beginnen, ook zonder zon, als "HH:MM". */
  readonly latestStart: string;
}

export interface OccupancySource {
  readonly id: string;
  readonly ref: DeviceRef;
}

export interface DayScheduleConfig {
  /** Uur waarop voorverwarmen begint, 0-23. */
  readonly preheatFromHour: number;
  /** Uur waarop de dagmodus begint, 0-23. */
  readonly dayFromHour: number;
  /** Uur waarop de nachtmodus begint, 0-23. */
  readonly nightFromHour: number;
  /**
   * Verlengt de dagmodus na `nightFromHour` zolang deze lampen aan zijn en er
   * iemand thuis is. Leeg laten schakelt de verlenging uit.
   */
  readonly eveningExtensionLights: readonly DeviceRef[];
}

/**
 * Waar de modus vandaan komt, en wanneer de bewoner het overneemt.
 *
 * Stond tot fase 6b hard in `mapping.ts`: één `input_select`, één vertaaltabel
 * en één knop voor "handen af". Dat is per woning anders — en het waren
 * uitgerekend deze twee entiteiten die de 151 minuten uit besluit 8b
 * veroorzaakten, doordat de code er maar één van kende.
 */
export interface ModeSource {
  /** De keuzelijst met de modus. */
  readonly select: DeviceRef;
  /** De waarde die "laat de regeling zelf kiezen" betekent. */
  readonly automatic: string;
  /**
   * Van de standen van die lijst naar onze modi.
   *
   * Een stand die hier niet in staat levert geen modus op, en dan valt de
   * regeling terug op het dagritme. Dat is met opzet geen fout: een bewoner die
   * een stand toevoegt hoort geen kapotte regeling te krijgen.
   */
  readonly aliases: Readonly<Record<string, Mode>>;
  /**
   * Extra knoppen die "handen af" betekenen, ongeacht de modus hierboven.
   *
   * Elke ingang is een entiteit met de stand waarbij de regeling zich
   * terugtrekt. Ze winnen van de modus-keuze, want zo werkte het oude systeem
   * ook: de handmatige koelstand schermde daar zelfs de vakantiestand af.
   */
  readonly handsOffWhen: readonly { readonly ref: DeviceRef; readonly state: string }[];
}

/**
 * De timers die de kern als invoer krijgt, wanneer ze uit Home Assistant komen.
 *
 * Per timer: wat hier niet staat, houdt de dienst zelf bij (besluit 39).
 */
export interface TimerSources {
  /**
   * Optioneel, en voor een woning met een oud systeem ernaast hoort hij weg.
   * Een `timer.`-entiteit van dat systeem loopt alleen wanneer dát systeem iets
   * startte, niet wanneer de arbiter dat deed (besluit 60).
   */
  readonly stabilisation?: DeviceRef;
  /**
   * Loopt er een handmatige ingreep van de bewoner.
   *
   * Optioneel, en op dit moment leest niets in de kern hem uit — hij wordt
   * alleen meegedragen. Wie hem weglaat verandert dus geen enkel besluit. Het
   * veld blijft staan omdat de detectie van "de bewoner heeft zelf iets
   * gedaan" er straks op landt; nu komt die informatie nog van het oude
   * systeem, dat de timer zelf startte.
   */
  readonly manualOverride?: DeviceRef;
}

export interface SiteConfig {
  readonly id: string;
  readonly timezone: string;
  readonly zones: readonly Zone[];
  readonly actuators: readonly Actuator[];
  readonly power: PowerSources;
  readonly occupancy: readonly OccupancySource[];
  readonly schedule: DayScheduleConfig;
  /** Strategie-ID's in volgorde van afnemende voorrang. */
  readonly enabledStrategies: readonly string[];
  /**
   * Meetpunten die betrouwbaar moeten zijn. Valt er één weg, dan schakelt de
   * failsafe alle assist-apparaten terug.
   */
  readonly criticalInputs: readonly DeviceRef[];
  /**
   * Waar de modus vandaan komt, wanneer dat Home Assistant is.
   *
   * Optioneel sinds fase 6e. Staat hij er niet, dan houdt de dienst de modus
   * zelf bij en is er geen `input_select` in Home Assistant nodig. Dat is de
   * enige manier waarop een verse installatie kan draaien: die knoppen bestaan
   * daar niet, en ze aanmaken zou schrijven zijn (besluit 15).
   */
  readonly mode?: ModeSource;
  /**
   * Waar de timers vandaan komen, wanneer dat Home Assistant is.
   *
   * Ook optioneel. Ontbreekt hij, dan houdt de dienst ze zelf bij: de kern
   * vraagt er met een commando om, en die vraag komt bij ons eigen boekhoudingetje
   * terecht in plaats van bij een `timer.`-entiteit.
   */
  readonly timers?: TimerSources;
  /**
   * Staat de zon boven de horizon. In HA `sun.sun`.
   *
   * Optioneel. Alleen `pv-surplus` leest hem, om 's nachts niet op een
   * spookoverschot te reageren. Zonder zonnepanelen is die strategie toch uit.
   */
  readonly sun?: DeviceRef;
  /**
   * Buitentemperatuur.
   *
   * De regeling gebruikt hem niet; hij gaat mee het beslislogboek in zodat de
   * dataset compleet is voor fase 7 (besluit 30). Optioneel, want een woning
   * zonder buitensensor moet gewoon kunnen draaien.
   */
  readonly outdoorTemperature?: DeviceRef;
  /**
   * Wat de zonnepanelen op dit moment leveren, in W.
   *
   * Net als de buitentemperatuur: waarneming, geen invoer voor de regeling
   * (besluit 30). Hij gaat mee het logboek in omdat het thermische model van
   * fase 7 hem nodig heeft.
   *
   * Waarvoor precies: de term "hoeveel warmt de zon deze kamer op". Zon boven
   * of onder de horizon is daarvoor te grof — een heldere februarimiddag en
   * een grijze zijn allebei "boven". De eigen opbrengst is de beste
   * instralingsmeter die een woning met panelen al in huis heeft.
   */
  readonly solarProduction?: MeasurementPoint;
  /**
   * De aansluiting: stroom per fase tegen de hoofdzekering (besluit 78).
   * Optioneel; zonder blijft het alleen een vermogensbudget, zoals het was.
   */
  readonly grid?: GridLimits;
  /**
   * Uitstelbare apparaten, zoals de droger (besluit 98). Optioneel; zonder blijft
   * alles zoals het was.
   */
  readonly deferrables?: readonly Deferrable[];
  /**
   * Hoe het huis en de panelen liggen (besluit 93).
   *
   * Waarneming over het huis, geen invoer voor de regeling: de weergave en de
   * assistent zeggen ermee op welke gevel de zon staat, en wat de panelen bij
   * een heldere lucht zouden leveren. Later rekenen de prognose (E) en het
   * thermisch model (D) ermee. Optioneel: zonder valt alleen dat weg.
   */
  readonly geometry?: Geometry;
  /**
   * Alleen vastleggen (besluit 65).
   *
   * Entiteiten die de regeling niet leest, maar die in de ruwe historie horen
   * omdat een later model ze nodig heeft. Het gasverbruik is in de winter de
   * warmte die er in huis gaat; de ventilatie is een deel van wat eruit gaat.
   * Ze komen in `history-*.ndjson` en niet in het beslislogboek, en een
   * wijziging is geen reden om opnieuw te beslissen.
   *
   * Wat hier niet staat en niet elders in de configuratie, wordt niet
   * vastgelegd, en dat is achteraf niet meer te herstellen.
   */
  readonly recordOnly?: readonly DeviceRef[];
  readonly migration?: MigrationConfig;
}

/**
 * Wat er nodig is zolang er een oud systeem naast draait.
 *
 * Optioneel en tijdelijk: zodra de overstap gemaakt is, haal je dit blok weg en
 * verdwijnt de vergelijking vanzelf. Het staat in de configuratie en niet in de
 * code omdat het per installatie verschilt — welke sensor de uitleg van het
 * oude systeem bevat, weet alleen de bewoner.
 */
export interface MigrationConfig {
  /**
   * De sensor waarin het oude systeem zijn eigen verklaring toont. Wordt
   * meegeschreven in het beslislogboek, zodat de vergelijking achteraf geen
   * verbinding met het oude systeem meer nodig heeft.
   */
  readonly legacyExplanation?: DeviceRef;
  /**
   * De helpers waarin de bewoner zijn setpoints zet in het oude systeem.
   *
   * Zonder deze zou de arbiter tegen andere doelen regelen dan het systeem
   * waarmee hij wordt vergeleken, en zegt de vergelijking niets. Per zone en
   * per modus, en alleen wat er werkelijk is: wat hier ontbreekt houdt de
   * waarde uit de configuratie zelf.
   *
   * Hoort bij `migration` en niet bij de kern: zodra de overstap gemaakt is,
   * bestaan deze helpers niet meer.
   */
  readonly setpoints?: Readonly<
    Record<string, Partial<Record<Mode, { readonly heat?: DeviceRef; readonly cool?: DeviceRef }>>>
  >;
  /** Idem voor de vermogensdrempels. */
  readonly power?: {
    readonly startSurplusW?: DeviceRef;
    readonly stopImportW?: DeviceRef;
  };
}

/** Zoekt een actuator op id. Werpt wanneer de configuratie inconsistent is. */
export function actuatorById(config: SiteConfig, id: string): Actuator {
  const found = config.actuators.find((a) => a.id === id);
  if (!found) {
    throw new Error(`Onbekende actuator "${id}" in configuratie "${config.id}"`);
  }
  return found;
}

/** Alle actuatoren van een zone, in configuratievolgorde. */
export function actuatorsOf(config: SiteConfig, zone: Zone): Actuator[] {
  return zone.actuatorIds.map((id) => actuatorById(config, id));
}
