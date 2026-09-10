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
}

export interface HaCoreConfig {
  readonly time_zone?: string;
}

/** Alles wat de ontdekking nodig heeft, zodat de functie zelf niets ophaalt. */
export interface Registers {
  readonly config: HaCoreConfig;
  readonly areas: readonly HaArea[];
  readonly devices: readonly HaDevice[];
  readonly entities: readonly HaRegistryEntity[];
  readonly states: readonly HaEntityState[];
}

export type Soort = 'gevonden' | 'geraden' | 'overgeslagen' | 'ontbreekt';

export interface Bevinding {
  readonly soort: Soort;
  /** Waar in de configuratie dit over gaat, of een losse aanduiding. */
  readonly pad: string;
  readonly tekst: string;
  /** Wat er nog meer had gekund. Bij `geraden` het belangrijkst. */
  readonly alternatieven?: readonly string[];
}

export interface Voorstel {
  /** De JSON zoals hij in `sites/<naam>.json` zou staan. */
  readonly config: Record<string, unknown>;
  readonly bevindingen: readonly Bevinding[];
}

// -------------------------------------------------------------- hulpjes ----

function slug(tekst: string): string {
  return tekst
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** De naam die een mens zou herkennen, met terugval op de entity-ID. */
function naamVan(e: HaRegistryEntity, state: HaEntityState | undefined): string {
  const attr = state?.attributes as Record<string, unknown> | undefined;
  const vriendelijk = typeof attr?.['friendly_name'] === 'string' ? attr['friendly_name'] : null;
  return e.name ?? vriendelijk ?? e.original_name ?? e.entity_id;
}

function deviceClass(e: HaRegistryEntity, state: HaEntityState | undefined): string | null {
  const attr = state?.attributes as Record<string, unknown> | undefined;
  const uitState = typeof attr?.['device_class'] === 'string' ? attr['device_class'] : null;
  return e.device_class ?? e.original_device_class ?? uitState;
}

function getal(state: HaEntityState | undefined, sleutel: string): number | null {
  const v = (state?.attributes as Record<string, unknown> | undefined)?.[sleutel];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function lijst(state: HaEntityState | undefined, sleutel: string): string[] {
  const v = (state?.attributes as Record<string, unknown> | undefined)?.[sleutel];
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
const GRENS_VOOR = '(?:^|[^a-z0-9])';
const GRENS_NA = '(?:[^a-z0-9]|$)';
const METERWOORDEN = new RegExp(
  `${GRENS_VOOR}(?:p1|grid|net|netto)${GRENS_NA}|smart[ _-]?meter|slimme[ _-]?meter`,
  'i',
);
const BUITENWOORDEN = new RegExp(
  `${GRENS_VOOR}(?:buiten|outdoor|outside|extern|external)${GRENS_NA}`,
  'i',
);

// ------------------------------------------------------------ ontdekken ----

export function ontdek(r: Registers): Voorstel {
  const bevindingen: Bevinding[] = [];
  const statePer = new Map(r.states.map((s) => [s.entity_id, s]));
  const areaVanDevice = new Map(r.devices.map((d) => [d.id, d.area_id]));
  const areaNaam = new Map(r.areas.map((a) => [a.area_id, a.name]));

  /**
   * Het gebied van een entiteit.
   *
   * Eerst wat er op de entiteit zelf staat, dan dat van zijn apparaat. In de
   * praktijk komt vrijwel alles uit die tweede regel: in Home Assistant wijs je
   * een apparaat aan een gebied toe, niet elke entiteit apart.
   */
  const gebiedVan = (e: HaRegistryEntity): string | null =>
    e.area_id ?? (e.device_id ? (areaVanDevice.get(e.device_id) ?? null) : null);

  /*
   * Wat we sowieso niet willen zien.
   *
   * Uitgeschakeld en verborgen spreken voor zich. `entity_category` is de
   * belangrijke: die markeert entiteiten die bij het apparaat horen en niet bij
   * het huis — de temperatuur van een harde schijf, het signaal van een
   * batterij, de bijwerkknop van een integratie.
   */
  const bruikbaar = r.entities.filter(
    (e) => e.disabled_by == null && e.hidden_by == null && e.entity_category == null,
  );

  const overgeslagen = r.entities.length - bruikbaar.length;
  if (overgeslagen > 0) {
    bevindingen.push({
      soort: 'overgeslagen',
      pad: '(register)',
      tekst:
        `${overgeslagen} van de ${r.entities.length} entiteiten blijven buiten beeld: ` +
        'uitgeschakeld, verborgen, of horend bij een apparaat in plaats van bij het huis',
    });
  }

  const van = (domein: string): HaRegistryEntity[] =>
    bruikbaar.filter((e) => e.entity_id.startsWith(`${domein}.`));

  const sensorenVan = (klasse: string): HaRegistryEntity[] =>
    van('sensor').filter((e) => deviceClass(e, statePer.get(e.entity_id)) === klasse);

  // ---- tijdzone -----------------------------------------------------------

  const timezone = r.config.time_zone;
  if (timezone) {
    bevindingen.push({
      soort: 'gevonden',
      pad: 'timezone',
      tekst: `${timezone}, overgenomen van Home Assistant`,
    });
  } else {
    bevindingen.push({
      soort: 'ontbreekt',
      pad: 'timezone',
      tekst: 'Home Assistant gaf geen tijdzone terug; vul hem zelf in',
    });
  }

  // ---- buitentemperatuur --------------------------------------------------
  //
  // Eerst, want een buitensensor mag geen zonethermometer worden.

  const temperatuurSensoren = sensorenVan('temperature');
  const buitenKandidaten = temperatuurSensoren.filter(
    (e) => BUITENWOORDEN.test(e.entity_id) || BUITENWOORDEN.test(naamVan(e, statePer.get(e.entity_id))),
  );
  // Thermometers die aan geen enkel gebied hangen: kandidaten, geen keuze.
  const zwervend = temperatuurSensoren.filter((e) => gebiedVan(e) == null);
  /*
   * Geen naam die naar buiten wijst? Dan niet kiezen.
   *
   * De eerste versie viel terug op "een thermometer die aan geen enkel gebied
   * hangt". Dat leek redelijk — een weersintegratie zit nergens in huis — maar
   * op de gemeten woning leverde het zeventien kandidaten op, waarvan de
   * eerste een Formule 1-sensor was.
   *
   * Dit veld is optioneel: zonder hem regelt alles gewoon door en mist alleen
   * de dataset een kolom (besluit 30). Een verkeerde keuze kost meer dan geen
   * keuze, dus tonen we de kandidaten en laten we het aan de bewoner.
   */
  const buiten = buitenKandidaten[0] ?? null;
  if (buiten) {
    bevindingen.push({
      soort: buitenKandidaten.length > 1 ? 'geraden' : 'gevonden',
      pad: 'outdoorTemperature',
      tekst: `${buiten.entity_id} — ${naamVan(buiten, statePer.get(buiten.entity_id))}`,
      ...(buitenKandidaten.length > 1
        ? { alternatieven: buitenKandidaten.slice(1).map((e) => e.entity_id) }
        : {}),
    });
  } else if (zwervend.length > 0) {
    bevindingen.push({
      soort: 'ontbreekt',
      pad: 'outdoorTemperature',
      tekst:
        `geen sensor heet naar buiten. Deze ${zwervend.length} hangen aan geen enkel ` +
        'gebied en zijn dus kandidaat; kies er zelf een. Zonder buitentemperatuur ' +
        'regelt alles gewoon door, maar mist de dataset een kolom (besluit 30).',
      alternatieven: zwervend.map((e) => e.entity_id),
    });
  } else {
    bevindingen.push({
      soort: 'ontbreekt',
      pad: 'outdoorTemperature',
      tekst:
        'geen sensor gevonden die naar buiten verwijst; de regeling werkt zonder, ' +
        'maar de dataset mist dan een kolom (besluit 30)',
    });
  }

  // ---- zones en apparaten -------------------------------------------------

  const klimaat = van('climate');
  const vochtSensoren = sensorenVan('humidity');
  const vermogenSensoren = sensorenVan('power');

  const zones: Record<string, unknown>[] = [];
  const actuators: Record<string, unknown>[] = [];
  const gebruikteActuatorIds = new Set<string>();

  const gebieden = new Set<string>();
  for (const e of [...klimaat, ...temperatuurSensoren]) {
    const g = gebiedVan(e);
    if (g) gebieden.add(g);
  }

  for (const gebied of [...gebieden].sort()) {
    const naam = areaNaam.get(gebied) ?? gebied;
    const inGebied = <T extends HaRegistryEntity>(lijstje: readonly T[]): T[] =>
      lijstje.filter((e) => gebiedVan(e) === gebied);

    const apparaten = inGebied(klimaat);
    const thermometers = inGebied(temperatuurSensoren).filter((e) => e !== buiten);

    if (apparaten.length === 0) {
      bevindingen.push({
        soort: 'overgeslagen',
        pad: `zones.${gebied}`,
        tekst: `${naam} heeft wel een thermometer maar geen klimaatapparaat`,
      });
      continue;
    }
    if (thermometers.length === 0) {
      bevindingen.push({
        soort: 'overgeslagen',
        pad: `zones.${gebied}`,
        tekst:
          `${naam} heeft wel een klimaatapparaat maar geen losse temperatuursensor. ` +
          'De ingebouwde meting van het apparaat is nog niet als bron te gebruiken.',
      });
      continue;
    }

    const thermometer = thermometers[0]!;
    if (thermometers.length > 1) {
      bevindingen.push({
        soort: 'geraden',
        pad: `zones.${gebied}.temperature`,
        tekst: `${naam} heeft ${thermometers.length} thermometers; ${thermometer.entity_id} gekozen`,
        alternatieven: thermometers.slice(1).map((e) => e.entity_id),
      });
    }

    const actuatorIds: string[] = [];
    for (const apparaat of apparaten) {
      const st = statePer.get(apparaat.entity_id);
      const modi = lijst(st, 'hvac_modes');
      const canHeat = modi.includes('heat') || modi.includes('heat_cool');
      const canCool = modi.includes('cool') || modi.includes('heat_cool');

      if (!canHeat && !canCool) {
        bevindingen.push({
          soort: 'overgeslagen',
          pad: `actuators.${apparaat.entity_id}`,
          tekst:
            modi.length === 0
              ? `${apparaat.entity_id} meldde geen hvac_modes; stond hij aan tijdens het uitlezen?`
              : `${apparaat.entity_id} kan alleen ${modi.join(', ')} en dus niet verwarmen of koelen`,
        });
        continue;
      }

      let id = slug(apparaat.entity_id.split('.')[1] ?? apparaat.entity_id);
      while (gebruikteActuatorIds.has(id)) id = `${id}-2`;
      gebruikteActuatorIds.add(id);

      /*
       * Twee integraties die dezelfde airco aanbieden.
       *
       * In de gemeten woning stonden `climate.air_conditioning_woonkamer` en
       * `...woonkamer_2` naast elkaar, op verschillende apparaten, allebei
       * echt. Wij kunnen niet weten welke de goede is — maar we kunnen wel
       * zeggen dat er iets te kiezen valt, want ze allebei aansturen betekent
       * hetzelfde apparaat twee keer commanderen.
       */
      const kaal = apparaat.entity_id.replace(/_\d+$/, '');
      const tweeling = apparaten.find(
        (x) => x !== apparaat && x.entity_id.replace(/_\d+$/, '') === kaal,
      );
      if (tweeling && apparaat.entity_id.length <= tweeling.entity_id.length) {
        bevindingen.push({
          soort: 'geraden',
          pad: `actuators.${id}`,
          tekst:
            `${apparaat.entity_id} en ${tweeling.entity_id} lijken hetzelfde apparaat ` +
            'via twee integraties. Houd er één over.',
          alternatieven: [tweeling.entity_id],
        });
      }

      // Een vermogenssensor op hetzelfde apparaat is bijna altijd de zijne.
      const eigenMeter =
        apparaat.device_id == null
          ? null
          : (vermogenSensoren.find((s) => s.device_id === apparaat.device_id) ?? null);

      const min = getal(st, 'min_temp');
      const max = getal(st, 'max_temp');

      actuators.push({
        id,
        name: naamVan(apparaat, st),
        ref: apparaat.entity_id,
        // Altijd `primary`. Assist is de bijzondere rol — opportunistisch
        // meedraaien op overschot — en dat is een keuze van de bewoner, geen
        // eigenschap die in een register staat.
        role: 'primary',
        capabilities: {
          canHeat,
          canCool,
          ...(min != null && max != null && min < max ? { setpointRange: [min, max] } : {}),
        },
        ...(eigenMeter ? { power: { estimatedW: 0, sensor: eigenMeter.entity_id } } : {}),
      });
      actuatorIds.push(id);

      if (min == null || max == null) {
        bevindingen.push({
          soort: 'geraden',
          pad: `actuators.${id}.capabilities.setpointRange`,
          tekst: `${apparaat.entity_id} gaf geen min_temp/max_temp; er wordt 5-35 °C aangehouden`,
        });
      }
    }

    if (actuatorIds.length === 0) continue;

    const vocht = inGebied(vochtSensoren)[0] ?? null;
    zones.push({
      id: slug(gebied),
      name: naam,
      temperature: thermometer.entity_id,
      ...(vocht ? { humidity: vocht.entity_id } : {}),
      actuatorIds,
    });

    bevindingen.push({
      soort: 'gevonden',
      pad: `zones.${slug(gebied)}`,
      tekst:
        `${naam}: ${thermometer.entity_id} met ` +
        `${actuatorIds.length} ${actuatorIds.length === 1 ? 'apparaat' : 'apparaten'} ` +
        `(${actuatorIds.join(', ')})`,
    });
  }

  if (zones.length === 0) {
    bevindingen.push({
      soort: 'ontbreekt',
      pad: 'zones',
      tekst:
        'geen enkel gebied heeft zowel een klimaatapparaat als een temperatuursensor. ' +
        'Deel je apparaten in gebieden in bij Instellingen → Gebieden.',
    });
  }

  // ---- netmeting ----------------------------------------------------------

  const meterKandidaten = vermogenSensoren.filter(
    (e) => METERWOORDEN.test(e.entity_id) || METERWOORDEN.test(naamVan(e, statePer.get(e.entity_id))),
  );
  const meter = meterKandidaten[0] ?? null;
  if (meter) {
    bevindingen.push({
      soort: 'geraden',
      pad: 'power.gridPower',
      tekst:
        `${meter.entity_id} lijkt de netmeting. Controleer dat hij negatief wordt ` +
        'bij teruglevering — anders klopt het hele overschot niet.',
      ...(meterKandidaten.length > 1
        ? { alternatieven: meterKandidaten.slice(1).map((e) => e.entity_id) }
        : {}),
    });
  } else {
    bevindingen.push({
      soort: 'ontbreekt',
      pad: 'power.gridPower',
      tekst:
        'geen slimme meter herkend; pv-surplus doet dan niet mee. ' +
        'Comfort en heat-assist werken gewoon (besluit 40).',
    });
  }

  // ---- bewoners en zon ----------------------------------------------------

  const personen = van('person');
  if (personen.length > 0) {
    bevindingen.push({
      soort: 'gevonden',
      pad: 'occupancy',
      tekst: `${personen.length} bewoner${personen.length === 1 ? '' : 's'}: ${personen
        .map((e) => e.entity_id)
        .join(', ')}`,
    });
  } else {
    bevindingen.push({
      soort: 'ontbreekt',
      pad: 'occupancy',
      tekst: 'geen person-entiteiten; het huis geldt dan altijd als bewoond (besluit 40)',
    });
  }

  const zon = r.states.some((s) => s.entity_id === 'sun.sun');

  // ---- het voorstel -------------------------------------------------------

  const config: Record<string, unknown> = {
    schemaVersion: 1,
    id: 'mijn-huis',
    ...(timezone ? { timezone } : {}),
    ...(meter ? { power: { gridPower: meter.entity_id } } : {}),
    ...(personen.length > 0
      ? {
          occupancy: personen.map((e) => ({
            id: slug(e.entity_id.split('.')[1] ?? e.entity_id),
            ref: e.entity_id,
          })),
        }
      : {}),
    actuators,
    zones,
    ...(zon ? { sun: 'sun.sun' } : {}),
    ...(buiten ? { outdoorTemperature: buiten.entity_id } : {}),
  };

  return { config, bevindingen };
}

// ------------------------------------------------------------- ophalen -----

/** Wat `ontdek` nodig heeft, opgehaald bij een verbonden client. */
export async function haalRegisters(
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
