/**
 * Een installatie ontdekken uit de registers van Home Assistant.
 *
 * Fase 6e stap 3. Stap 2 bracht het schema terug tot drie levensaders, maar
 * die drie moet iemand nog steeds zelf opschrijven — inclusief entity-ID's die
 * je alleen vindt door in de ontwikkelaarshulpmiddelen te graven. Dit bestand
 * doet dat werk: het leest wat er in huis staat en stelt een configuratie
 * voor.
 *
 * **Het stelt voor en het besluit niet.** Elke keuze komt met een bevinding
 * terug: wat is gekozen, waarom, en wat de alternatieven waren. Wat geraden is
 * heet geraden. De bewoner ziet die lijst straks in de weergave (stap 4) en
 * kan corrigeren; tot die tijd staat hij in de terminal.
 *
 * **Er wordt niets geschreven naar Home Assistant.** Alleen de registers
 * gelezen — `HaClient.query` laat niets anders toe (besluit 15).
 *
 * **Twee dingen die dit bestand vormgeven, en die uit de echte export van een
 * woning komen in plaats van uit de documentatie:**
 *
 *  1. *Gebieden hangen aan apparaten.* In de gemeten installatie hadden 3 van
 *     de 2.507 entiteiten een eigen `area_id`; de rest erft het van zijn
 *     apparaat. Wie alleen naar `entity.area_id` kijkt, vindt niets.
 *  2. *Zonder filter op `entity_category` wordt de schijftemperatuur van een
 *     NAS een woonkamerthermostaat.* Van de 36 temperatuursensoren daar was de
 *     meerderheid diagnostisch: schijven, telefoonaccu's, een router.
 */

import type { HaEntityState } from './client.js';

// --------------------------------------------------------------- vormen ----

export interface HaArea {
  readonly area_id: string;
  readonly name: string;
}

export interface HaDevice {
  readonly id: string;
  readonly area_id: string | null;
  readonly name?: string | null;
  readonly name_by_user?: string | null;
}

export interface HaRegistryEntity {
  readonly entity_id: string;
  readonly device_id?: string | null;
  readonly area_id?: string | null;
  readonly name?: string | null;
  readonly original_name?: string | null;
  readonly disabled_by?: string | null;
  readonly hidden_by?: string | null;
  readonly entity_category?: string | null;
  readonly device_class?: string | null;
  readonly original_device_class?: string | null;
  /** De integratie die deze entiteit levert, bijvoorbeeld "buienradar". */
  readonly platform?: string | null;
}

export interface HaCoreConfig {
  readonly time_zone?: string;
  /** De ligging van het huis. De dienst rondt af op één decimaal (besluit 90). */
  readonly latitude?: number;
  readonly longitude?: number;
}

/** Alles wat de ontdekking nodig heeft, zodat de functie zelf niets ophaalt. */
export interface Registers {
  readonly config: HaCoreConfig;
  readonly areas: readonly HaArea[];
  readonly devices: readonly HaDevice[];
  readonly entities: readonly HaRegistryEntity[];
  readonly states: readonly HaEntityState[];
}

export type FindingKind = 'gevonden' | 'geraden' | 'overgeslagen' | 'ontbreekt';

export interface Finding {
  readonly soort: FindingKind;
  /** Waar in de configuratie dit over gaat, of een losse aanduiding. */
  readonly pad: string;
  readonly tekst: string;
  /** Wat er nog meer had gekund. Bij `geraden` het belangrijkst. */
  readonly alternatieven?: readonly string[];
}

/**
 * Een punt waarop de ontdekking het niet zeker weet.
 *
 * Het verschil met een bevinding: een bevinding vertelt, een keuze vraagt. Ze
 * bestaan naast elkaar omdat de meeste bevindingen niets van de bewoner nodig
 * hebben — "6 bewoners gevonden" is prettig om te lezen en verder klaar.
 */
export interface Choice {
  /** Stabiel, zodat een antwoord bij de juiste vraag terechtkomt. */
  readonly id: string;
  readonly soort: 'veld' | 'zoneTemperatuur' | 'dubbelApparaat';
  readonly vraag: string;
  readonly toelichting?: string;
  /** Wat de ontdekking zelf zou kiezen, of null als hij niets kiest. */
  readonly huidig: string | null;
  readonly opties: readonly string[];
  /** Mag "geen van deze" het antwoord zijn? */
  readonly magLeeg: boolean;
  /** Bij `veld`: waar in de configuratie. */
  readonly pad?: string;
  /** Bij `zoneTemperatuur`: welke zone. */
  readonly zoneId?: string;
}

export interface Proposal {
  /** De JSON zoals hij in `sites/<naam>.json` zou staan. */
  readonly config: Record<string, unknown>;
  readonly bevindingen: readonly Finding[];
  /** Wat er nog beslist moet worden voordat dit klopt. */
  readonly keuzes: readonly Choice[];
}

// -------------------------------------------------------------- hulpjes ----

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** De naam die een mens zou herkennen, met terugval op de entity-ID. */
function nameOf(e: HaRegistryEntity, state: HaEntityState | undefined): string {
  const attr = state?.attributes as Record<string, unknown> | undefined;
  const friendly = typeof attr?.['friendly_name'] === 'string' ? attr['friendly_name'] : null;
  return e.name ?? friendly ?? e.original_name ?? e.entity_id;
}

function deviceClass(e: HaRegistryEntity, state: HaEntityState | undefined): string | null {
  const attr = state?.attributes as Record<string, unknown> | undefined;
  const offState = typeof attr?.['device_class'] === 'string' ? attr['device_class'] : null;
  return e.device_class ?? e.original_device_class ?? offState;
}

function numberAttr(state: HaEntityState | undefined, key: string): number | null {
  const v = (state?.attributes as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function listAttr(state: HaEntityState | undefined, key: string): string[] {
  const v = (state?.attributes as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Verwijzingen naar buiten, in de trant van "dit is de meterkast".
 *
 * Bewust op woordgrenzen, en die grens is niet alleen een liggend streepje:
 * in `sensor.p1_meter_power` staat er een punt voor. Dat kostte de eerste
 * versie twee tests.
 *
 * De grens zelf is er ook niet voor niets: "net" zit in tientallen
 * Nederlandse woorden, en `sensor.internet_verbruik` is geen slimme meter.
 */
const BEFORE_BOUNDARY = '(?:^|[^a-z0-9])';
const AFTER_BOUNDARY = '(?:[^a-z0-9]|$)';
const METER_WORDS = new RegExp(
  `${BEFORE_BOUNDARY}(?:p1|grid|net|netto)${AFTER_BOUNDARY}|smart[ _-]?meter|slimme[ _-]?meter`,
  'i',
);
/**
 * Wat een weerintegratie naast de huidige temperatuur nog meer levert.
 *
 * Buienradar geeft dertien temperatuursensoren: de huidige, de gevoels- en
 * grondtemperatuur, en per dag een verwachting met een minimum. Voor het
 * beslislogboek willen we er precies één — wat het buiten nú is.
 */
const DERIVED_TEMPERATURE =
  /(_\d+d$)|forecast|verwacht|gevoels|apparent|feels|grond|ground|soil|dauw|dew|minimale|maximale|minimum|maximum/i;

/** Woorden die op de opbrengst van zonnepanelen wijzen. */
const PRODUCTION_WORDS =
  /solar|zonne|zonnepane|pv[_ ]|photovolta|omvormer|inverter|huidig[_ ]vermogen/i;

const OUTDOOR_WORDS = new RegExp(
  `${BEFORE_BOUNDARY}(?:buiten|outdoor|outside|extern|external)${AFTER_BOUNDARY}`,
  'i',
);

/** Heet deze sensor gewoon "temperatuur", zonder verdere bijstelling? */
function bareName(e: HaRegistryEntity): boolean {
  const object = e.entity_id.split('.')[1] ?? '';
  return object === 'temperatuur' || object === 'temperature';
}

// ------------------------------------------------------------ ontdekken ----

export function discover(r: Registers): Proposal {
  const findings: Finding[] = [];
  const choices: Choice[] = [];
  const statePer = new Map(r.states.map((s) => [s.entity_id, s]));
  const areaOfDevice = new Map(r.devices.map((d) => [d.id, d.area_id]));
  const areaName = new Map(r.areas.map((a) => [a.area_id, a.name]));

  /**
   * Het gebied van een entiteit.
   *
   * Eerst wat er op de entiteit zelf staat, dan dat van zijn apparaat. In de
   * praktijk komt vrijwel alles uit die tweede regel: in Home Assistant wijs je
   * een apparaat aan een gebied toe, niet elke entiteit apart.
   */
  const areaOf = (e: HaRegistryEntity): string | null =>
    e.area_id ?? (e.device_id ? (areaOfDevice.get(e.device_id) ?? null) : null);

  /*
   * Wat we sowieso niet willen zien.
   *
   * Uitgeschakeld en verborgen spreken voor zich. `entity_category` is de
   * belangrijke: die markeert entiteiten die bij het apparaat horen en niet bij
   * het huis — de temperatuur van een harde schijf, het signaal van een
   * batterij, de bijwerkknop van een integratie.
   */
  const usable = r.entities.filter(
    (e) => e.disabled_by == null && e.hidden_by == null && e.entity_category == null,
  );

  const skipped = r.entities.length - usable.length;
  if (skipped > 0) {
    findings.push({
      soort: 'overgeslagen',
      pad: '(register)',
      tekst:
        `${skipped} van de ${r.entities.length} entiteiten blijven buiten beeld: ` +
        'uitgeschakeld, verborgen, of horend bij een apparaat in plaats van bij het huis',
    });
  }

  const from = (domain: string): HaRegistryEntity[] =>
    usable.filter((e) => e.entity_id.startsWith(`${domain}.`));

  const sensorsOf = (wantedClass: string): HaRegistryEntity[] =>
    from('sensor').filter((e) => deviceClass(e, statePer.get(e.entity_id)) === wantedClass);

  // ---- tijdzone -----------------------------------------------------------

  const timezone = r.config.time_zone;
  if (timezone) {
    findings.push({
      soort: 'gevonden',
      pad: 'timezone',
      tekst: `${timezone}, overgenomen van Home Assistant`,
    });
  } else {
    findings.push({
      soort: 'ontbreekt',
      pad: 'timezone',
      tekst: 'Home Assistant gaf geen tijdzone terug; vul hem zelf in',
    });
  }

  // ---- buitentemperatuur --------------------------------------------------
  //
  // Eerst, want een buitensensor mag geen zonethermometer worden.

  const temperatureSensors = sensorsOf('temperature');
  const outdoorCandidates = temperatureSensors.filter(
    (e) => OUTDOOR_WORDS.test(e.entity_id) || OUTDOOR_WORDS.test(nameOf(e, statePer.get(e.entity_id))),
  );
  // Thermometers die aan geen enkel gebied hangen: kandidaten, geen keuze.
  const stray = temperatureSensors.filter((e) => areaOf(e) == null);
  /*
   * Geen naam die naar buiten wijst? Dan de weerintegratie vragen.
   *
   * Wie een weerdienst gekoppeld heeft, heeft daarmee een buitentemperatuur —
   * dat is waar zo'n integratie voor is. Welke integraties dat zijn hoeven we
   * niet te weten: een integratie die een `weather.`-entiteit levert, is er
   * een. Zo hoeft er geen lijst met namen bijgehouden te worden die
   * veroudert.
   *
   * De eerste versie viel hier terug op "een thermometer die aan geen enkel
   * gebied hangt". Op de gemeten woning gaf dat achttien kandidaten met een
   * Formule 1-sensor bovenaan. Dit filter houdt er daar één van over.
   */
  const weatherPlatforms = new Set(
    usable
      .filter((e) => e.entity_id.startsWith('weather.'))
      .map((e) => e.platform)
      .filter((x): x is string => x != null),
  );
  const fromForecast = temperatureSensors
    .filter(
      (e) =>
        e.platform != null &&
        weatherPlatforms.has(e.platform) &&
        !DERIVED_TEMPERATURE.test(e.entity_id),
    )
    /*
     * Blijven er meer over, dan bovenaan degene die gewoon "temperatuur" heet.
     *
     * Een weerintegratie voor je eigen postcode noemt zijn sensor zelden
     * anders. Wie er daarnaast een heeft voor een circuit — dat komt voor —
     * herkent die aan de naam. Wij kiezen dan niet; we leggen alleen de meest
     * waarschijnlijke bovenop.
     */
    .sort((a, b) => Number(!bareName(a)) - Number(!bareName(b)));

  const outdoor = outdoorCandidates[0] ?? (fromForecast.length === 1 ? fromForecast[0]! : null);
  if (outdoor) {
    const byName = outdoorCandidates.length > 0;
    const others = byName ? outdoorCandidates.slice(1).map((e) => e.entity_id) : [];
    findings.push({
      soort: byName && others.length === 0 ? 'gevonden' : 'geraden',
      pad: 'outdoorTemperature',
      tekst: byName
        ? `${outdoor.entity_id} — ${nameOf(outdoor, statePer.get(outdoor.entity_id))}`
        : `${outdoor.entity_id}, de enige actuele buitentemperatuur van je weerintegratie`,
      ...(others.length > 0 ? { alternatieven: others } : {}),
    });
    if (others.length > 0) {
      choices.push({
        id: 'outdoorTemperature',
        soort: 'veld',
        pad: 'outdoorTemperature',
        vraag: 'Welke sensor meet de buitentemperatuur?',
        huidig: outdoor.entity_id,
        opties: [outdoor.entity_id, ...others],
        magLeeg: true,
      });
    }
  } else if (fromForecast.length > 1 || stray.length > 0) {
    const candidates = fromForecast.length > 1 ? fromForecast : stray;
    choices.push({
      id: 'outdoorTemperature',
      soort: 'veld',
      pad: 'outdoorTemperature',
      vraag: 'Welke sensor meet de buitentemperatuur?',
      toelichting:
        'De regeling gebruikt hem niet; hij gaat mee het logboek in zodat de ' +
        'dataset compleet is. Overslaan mag.',
      huidig: null,
      opties: candidates.map((e) => e.entity_id),
      magLeeg: true,
    });
    findings.push({
      soort: 'ontbreekt',
      pad: 'outdoorTemperature',
      tekst:
        `geen sensor heet naar buiten, en er is er niet één aan te wijzen. Deze ` +
        `${candidates.length} komen in aanmerking; kies er zelf een. Zonder ` +
        'buitentemperatuur regelt alles gewoon door, maar mist de dataset een ' +
        'kolom (besluit 30).',
      alternatieven: candidates.map((e) => e.entity_id),
    });
  } else {
    findings.push({
      soort: 'ontbreekt',
      pad: 'outdoorTemperature',
      tekst:
        'geen sensor gevonden die naar buiten verwijst; de regeling werkt zonder, ' +
        'maar de dataset mist dan een kolom (besluit 30)',
    });
  }

  // ---- zones en apparaten -------------------------------------------------

  const climate = from('climate');
  const humiditySensors = sensorsOf('humidity');
  const powerSensors = sensorsOf('power');

  const zones: Record<string, unknown>[] = [];
  const actuators: Record<string, unknown>[] = [];
  const usedActuatorIds = new Set<string>();

  const areaList = new Set<string>();
  for (const e of [...climate, ...temperatureSensors]) {
    const g = areaOf(e);
    if (g) areaList.add(g);
  }

  for (const area of [...areaList].sort()) {
    const name = areaName.get(area) ?? area;
    const inArea = <T extends HaRegistryEntity>(shortList: readonly T[]): T[] =>
      shortList.filter((e) => areaOf(e) === area);

    const climateDevices = inArea(climate);
    const thermometers = inArea(temperatureSensors).filter((e) => e !== outdoor);

    if (climateDevices.length === 0) {
      findings.push({
        soort: 'overgeslagen',
        pad: `zones.${area}`,
        tekst: `${name} heeft wel een thermometer maar geen klimaatapparaat`,
      });
      continue;
    }
    /*
     * Geen losse thermometer? Vraag het apparaat zelf.
     *
     * Een thermostaat of airco met een ingebouwde meting geeft die door als
     * `current_temperature`, zonder er een `sensor.`-entiteit voor aan te
     * maken. Bij de gemeten woning kostte dat de badkamer een zone.
     *
     * Wel met een kanttekening, en die staat in de bevinding: die thermometer
     * zit ín het apparaat. Vlak bij de uitblaas of tegen het plafond leest hij
     * anders dan de kamer. Bruikbaar, maar iets om te weten.
     */
    const selfMeters = climateDevices.filter(
      (a) => numberAttr(statePer.get(a.entity_id), 'current_temperature') != null,
    );

    if (thermometers.length === 0 && selfMeters.length === 0) {
      findings.push({
        soort: 'overgeslagen',
        pad: `zones.${area}`,
        tekst:
          `${name} heeft wel een klimaatapparaat maar niets dat de temperatuur meet — ` +
          'ook het apparaat zelf meldt er geen',
      });
      continue;
    }

    /** Waar de temperatuur van deze zone vandaan komt. */
    let source: { id: string; attribute?: string };
    if (thermometers.length === 0) {
      const selfMeter = selfMeters[0]!;
      source = { id: selfMeter.entity_id, attribute: 'current_temperature' };
      findings.push({
        soort: 'geraden',
        pad: `zones.${area}.temperature`,
        tekst:
          `${name} heeft geen losse thermometer; de eigen meting van ` +
          `${selfMeter.entity_id} wordt gebruikt. Die zit in het apparaat en leest ` +
          'daardoor anders dan de kamer — een losse sensor is nauwkeuriger.',
        ...(selfMeters.length > 1
          ? { alternatieven: selfMeters.slice(1).map((e) => e.entity_id) }
          : {}),
      });
    } else {
      source = { id: thermometers[0]!.entity_id };
    }

    if (thermometers.length > 1) {
      const thermometer = thermometers[0]!;
      findings.push({
        soort: 'geraden',
        pad: `zones.${area}.temperature`,
        tekst: `${name} heeft ${thermometers.length} thermometers; ${thermometer.entity_id} gekozen`,
        alternatieven: thermometers.slice(1).map((e) => e.entity_id),
      });
      choices.push({
        id: `zone:${slug(area)}:temperature`,
        soort: 'zoneTemperatuur',
        zoneId: slug(area),
        vraag: `Welke thermometer geldt voor ${name}?`,
        toelichting: 'Hierop wordt geregeld, dus dit moet de kamer zijn en niet een apparaat.',
        huidig: thermometer.entity_id,
        opties: thermometers.map((e) => e.entity_id),
        magLeeg: false,
      });
    }

    const actuatorIds: string[] = [];
    for (const device of climateDevices) {
      const st = statePer.get(device.entity_id);
      const modes = listAttr(st, 'hvac_modes');
      const canHeat = modes.includes('heat') || modes.includes('heat_cool');
      const canCool = modes.includes('cool') || modes.includes('heat_cool');

      if (!canHeat && !canCool) {
        findings.push({
          soort: 'overgeslagen',
          pad: `actuators.${device.entity_id}`,
          tekst:
            modes.length === 0
              ? `${device.entity_id} meldde geen hvac_modes; stond hij aan tijdens het uitlezen?`
              : `${device.entity_id} kan alleen ${modes.join(', ')} en dus niet verwarmen of koelen`,
        });
        continue;
      }

      let id = slug(device.entity_id.split('.')[1] ?? device.entity_id);
      while (usedActuatorIds.has(id)) id = `${id}-2`;
      usedActuatorIds.add(id);

      /*
       * Twee integraties die dezelfde airco aanbieden.
       *
       * In de gemeten woning stonden `climate.air_conditioning_woonkamer` en
       * `...woonkamer_2` naast elkaar, op verschillende apparaten, allebei
       * echt. Wij kunnen niet weten welke de goede is — maar we kunnen wel
       * zeggen dat er iets te kiezen valt, want ze allebei aansturen betekent
       * hetzelfde apparaat twee keer commanderen.
       */
      const bare = device.entity_id.replace(/_\d+$/, '');
      const twin = climateDevices.find(
        (x) => x !== device && x.entity_id.replace(/_\d+$/, '') === bare,
      );
      if (twin && device.entity_id.length <= twin.entity_id.length) {
        findings.push({
          soort: 'geraden',
          pad: `actuators.${id}`,
          tekst:
            `${device.entity_id} en ${twin.entity_id} lijken hetzelfde apparaat ` +
            'via twee integraties. Houd er één over.',
          alternatieven: [twin.entity_id],
        });
        choices.push({
          id: `dubbel:${id}`,
          soort: 'dubbelApparaat',
          vraag: 'Welke van deze twee stuurt dit apparaat aan?',
          toelichting:
            'Ze lijken hetzelfde apparaat via twee integraties. Allebei aanhouden ' +
            'betekent hetzelfde apparaat twee keer commanderen; de ander wordt weggelaten.',
          huidig: device.entity_id,
          opties: [device.entity_id, twin.entity_id],
          magLeeg: false,
        });
      }

      // Een vermogenssensor op hetzelfde apparaat is bijna altijd de zijne.
      const ownMeter =
        device.device_id == null
          ? null
          : (powerSensors.find((s) => s.device_id === device.device_id) ?? null);

      const min = numberAttr(st, 'min_temp');
      const max = numberAttr(st, 'max_temp');

      actuators.push({
        id,
        name: nameOf(device, st),
        ref: device.entity_id,
        // Altijd `primary`. Assist is de bijzondere rol — opportunistisch
        // meedraaien op overschot — en dat is een keuze van de bewoner, geen
        // eigenschap die in een register staat.
        role: 'primary',
        capabilities: {
          canHeat,
          canCool,
          ...(min != null && max != null && min < max ? { setpointRange: [min, max] } : {}),
        },
        ...(ownMeter ? { power: { estimatedW: 0, sensor: ownMeter.entity_id } } : {}),
      });
      actuatorIds.push(id);

      if (min == null || max == null) {
        findings.push({
          soort: 'geraden',
          pad: `actuators.${id}.capabilities.setpointRange`,
          tekst: `${device.entity_id} gaf geen min_temp/max_temp; er wordt 5-35 °C aangehouden`,
        });
      }
    }

    if (actuatorIds.length === 0) continue;

    /*
     * Luchtvochtigheid langs dezelfde weg: liever een losse sensor, anders de
     * eigen meting van het apparaat waar de temperatuur ook vandaan komt. Dit
     * is waarneming en geen invoer (besluit 30), dus een minder nauwkeurige
     * bron kost hier geen regelgedrag.
     */
    const humidity = inArea(humiditySensors)[0] ?? null;
    const ownHumidity =
      humidity == null && source.attribute != null &&
      numberAttr(statePer.get(source.id), 'current_humidity') != null
        ? { id: source.id, attribute: 'current_humidity' }
        : null;

    // Een verwijzing zonder attribuut blijft een gewone tekst, zodat het
    // bestand er niet ingewikkelder uitziet dan het is.
    const asRef = (m: { id: string; attribute?: string }): unknown =>
      m.attribute == null ? m.id : { id: m.id, attribute: m.attribute };

    zones.push({
      id: slug(area),
      name,
      temperature: asRef(source),
      ...(humidity ? { humidity: humidity.entity_id } : {}),
      ...(ownHumidity ? { humidity: asRef(ownHumidity) } : {}),
      actuatorIds,
    });

    findings.push({
      soort: 'gevonden',
      pad: `zones.${slug(area)}`,
      tekst:
        `${name}: ${source.id}${source.attribute ? ` (${source.attribute})` : ''} met ` +
        `${actuatorIds.length} ${actuatorIds.length === 1 ? 'apparaat' : 'apparaten'} ` +
        `(${actuatorIds.join(', ')})`,
    });
  }

  if (zones.length === 0) {
    findings.push({
      soort: 'ontbreekt',
      pad: 'zones',
      tekst:
        'geen enkel gebied heeft zowel een klimaatapparaat als een temperatuursensor. ' +
        'Deel je apparaten in gebieden in bij Instellingen → Gebieden.',
    });
  }

  // ---- netmeting ----------------------------------------------------------

  const meterCandidates = powerSensors.filter(
    (e) => METER_WORDS.test(e.entity_id) || METER_WORDS.test(nameOf(e, statePer.get(e.entity_id))),
  );
  const meter = meterCandidates[0] ?? null;
  if (meter) {
    findings.push({
      soort: 'geraden',
      pad: 'power.gridPower',
      tekst:
        `${meter.entity_id} lijkt de netmeting. Controleer dat hij negatief wordt ` +
        'bij teruglevering — anders klopt het hele overschot niet.',
      ...(meterCandidates.length > 1
        ? { alternatieven: meterCandidates.slice(1).map((e) => e.entity_id) }
        : {}),
    });
    choices.push({
      id: 'gridPower',
      soort: 'veld',
      pad: 'power.gridPower',
      vraag: 'Welke sensor meet wat er van het net komt?',
      toelichting:
        'Hij hoort negatief te worden bij teruglevering. Klopt dat niet, dan klopt ' +
        'het hele overschot niet. Zonder meter doet pv-surplus niet mee.',
      huidig: meter.entity_id,
      opties: meterCandidates.map((e) => e.entity_id),
      magLeeg: true,
    });
  } else {
    findings.push({
      soort: 'ontbreekt',
      pad: 'power.gridPower',
      tekst:
        'geen slimme meter herkend; pv-surplus doet dan niet mee. ' +
        'Comfort en heat-assist werken gewoon (besluit 40).',
    });
  }

  // ---- opbrengst van de panelen -------------------------------------------
  //
  // De beste instralingsmeter die een woning met panelen al in huis heeft
  // (besluit 47). Herkenbaar aan de naam plus de eis dat hij in watt meet:
  // een omvormer die in kW rapporteert kan ook, maar dan klopt de eenheid in
  // het logboek niet meer met de rest.
  const productionCandidates = powerSensors.filter((e) => {
    const st = statePer.get(e.entity_id);
    const unit = (st?.attributes as Record<string, unknown> | undefined)?.[
      'unit_of_measurement'
    ];
    return (
      PRODUCTION_WORDS.test(e.entity_id) &&
      !METER_WORDS.test(e.entity_id) &&
      unit === 'W'
    );
  });
  const production = productionCandidates[0] ?? null;
  if (production) {
    findings.push({
      soort: 'geraden',
      pad: 'solarProduction',
      tekst: `${production.entity_id} lijkt te meten wat de panelen leveren`,
      ...(productionCandidates.length > 1
        ? { alternatieven: productionCandidates.slice(1).map((e) => e.entity_id) }
        : {}),
    });
    if (productionCandidates.length > 1) {
      choices.push({
        id: 'solarProduction',
        soort: 'veld',
        pad: 'solarProduction',
        vraag: 'Welke sensor meet wat je panelen leveren?',
        toelichting:
          'De regeling gebruikt hem niet. Hij gaat mee het logboek in als maat ' +
          'voor instraling, zodat later te berekenen valt hoeveel de zon een ' +
          'kamer opwarmt. Overslaan mag.',
        huidig: production.entity_id,
        opties: productionCandidates.map((e) => e.entity_id),
        magLeeg: true,
      });
    }
  } else {
    findings.push({
      soort: 'ontbreekt',
      pad: 'solarProduction',
      tekst:
        'geen sensor herkend die de opbrengst van zonnepanelen meet. Zonder die ' +
        'maat kan later niet worden uitgerekend hoeveel de zon een kamer opwarmt.',
    });
  }

  // ---- bewoners en zon ----------------------------------------------------

  const persons = from('person');
  if (persons.length > 0) {
    findings.push({
      soort: 'gevonden',
      pad: 'occupancy',
      tekst: `${persons.length} bewoner${persons.length === 1 ? '' : 's'}: ${persons
        .map((e) => e.entity_id)
        .join(', ')}`,
    });
  } else {
    findings.push({
      soort: 'ontbreekt',
      pad: 'occupancy',
      tekst: 'geen person-entiteiten; het huis geldt dan altijd als bewoond (besluit 40)',
    });
  }

  const sun = r.states.some((s) => s.entity_id === 'sun.sun');

  // ---- het voorstel -------------------------------------------------------

  const config: Record<string, unknown> = {
    schemaVersion: 1,
    id: 'mijn-huis',
    ...(timezone ? { timezone } : {}),
    ...(meter ? { power: { gridPower: meter.entity_id } } : {}),
    ...(persons.length > 0
      ? {
          occupancy: persons.map((e) => ({
            id: slug(e.entity_id.split('.')[1] ?? e.entity_id),
            ref: e.entity_id,
          })),
        }
      : {}),
    actuators,
    zones,
    ...(sun ? { sun: 'sun.sun' } : {}),
    ...(outdoor ? { outdoorTemperature: outdoor.entity_id } : {}),
    ...(production ? { solarProduction: production.entity_id } : {}),
  };

  return { config, bevindingen: findings, keuzes: choices };
}

// -------------------------------------------------------- keuzes maken -----

/**
 * De antwoorden van de bewoner op het voorstel toepassen.
 *
 * Bewust hier en niet in de weergave. De pagina kiest wát er gebeurt; wat dat
 * betekent voor de configuratie is domeinkennis, en die hoort op één plek te
 * staan waar hij te toetsen is. De pagina stuurt dus antwoorden en geen JSON.
 *
 * Onbekende antwoorden worden genegeerd: de weergave kan achterlopen op wat de
 * ontdekking net vond, en dan is stilzwijgend overslaan beter dan weigeren.
 */
export function applyChoices(
  proposal: Proposal,
  answers: Readonly<Record<string, string | null>>,
): Record<string, unknown> {
  const config: Record<string, unknown> = structuredClone(proposal.config);

  for (const choice of proposal.keuzes) {
    if (!(choice.id in answers)) continue;
    const response = answers[choice.id] ?? null;

    // Een antwoord dat niet in de lijst stond komt er niet in. De weergave
    // levert een keuzelijst aan; alles daarbuiten is een fout of iets ergers.
    if (response != null && !choice.opties.includes(response)) continue;
    if (response == null && !choice.magLeeg) continue;

    if (choice.soort === 'veld' && choice.pad === 'outdoorTemperature') {
      if (response == null) delete config['outdoorTemperature'];
      else config['outdoorTemperature'] = response;
    } else if (choice.soort === 'veld' && choice.pad === 'power.gridPower') {
      if (response == null) delete config['power'];
      else config['power'] = { ...(config['power'] as object | undefined), gridPower: response };
    } else if (choice.soort === 'zoneTemperatuur') {
      const zones = (config['zones'] as Record<string, unknown>[] | undefined) ?? [];
      for (const zone of zones) {
        if (zone['id'] === choice.zoneId) zone['temperature'] = response;
      }
    } else if (choice.soort === 'dubbelApparaat' && response != null) {
      const toRemove = choice.opties.filter((o) => o !== response);
      removeActuators(config, toRemove);
    }
  }

  return config;
}

/**
 * Een apparaat uit het voorstel halen, inclusief de verwijzingen ernaar.
 *
 * Alleen uit de lijst schrappen is niet genoeg: een zone die naar een apparaat
 * wijst dat niet bestaat, wordt door de samenhangscontrole afgekeurd. En een
 * zone die daardoor helemaal geen apparaat meer heeft, kan niet blijven staan.
 */
function removeActuators(config: Record<string, unknown>, refs: readonly string[]): void {
  const actuators = (config['actuators'] as Record<string, unknown>[] | undefined) ?? [];
  const gone = new Set(
    actuators.filter((a) => refs.includes(String(a['ref']))).map((a) => String(a['id'])),
  );
  if (gone.size === 0) return;

  config['actuators'] = actuators.filter((a) => !gone.has(String(a['id'])));

  const zones = (config['zones'] as Record<string, unknown>[] | undefined) ?? [];
  config['zones'] = zones
    .map((zone) => ({
      ...zone,
      actuatorIds: ((zone['actuatorIds'] as string[] | undefined) ?? []).filter(
        (id) => !gone.has(id),
      ),
    }))
    .filter((zone) => (zone['actuatorIds'] as string[]).length > 0);
}

// ------------------------------------------------------------- ophalen -----

/** Wat `ontdek` nodig heeft, opgehaald bij een verbonden client. */
export async function fetchRegistries(
  client: {
    query<T>(type: string): Promise<T>;
  },
  states: readonly HaEntityState[],
): Promise<Registers> {
  const [config, areas, devices, entities] = await Promise.all([
    client.query<HaCoreConfig>('get_config'),
    client.query<HaArea[]>('config/area_registry/list'),
    client.query<HaDevice[]>('config/device_registry/list'),
    client.query<HaRegistryEntity[]>('config/entity_registry/list'),
  ]);
  return { config, areas, devices, entities, states };
}
