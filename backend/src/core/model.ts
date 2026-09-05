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
  readonly temperature: DeviceRef;
  readonly humidity?: DeviceRef;
  /** Verwijst naar Actuator.id. Volgorde is niet betekenisvol. */
  readonly actuatorIds: readonly string[];
  /** Lager wint bij schaarste. 1 is de belangrijkste zone. */
  readonly priority: number;
  readonly thermalMass: ThermalMass;
  readonly hysteresis: Hysteresis;
  readonly setpoints: Readonly<Record<Mode, SetpointPair>>;
  readonly buffering: Buffering;
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
  /** Netvermogen. Negatief bij teruglevering. */
  readonly gridPower: DeviceRef;
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
