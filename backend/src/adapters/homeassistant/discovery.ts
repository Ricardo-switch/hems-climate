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

/**
 * Een punt waarop de ontdekking het niet zeker weet.
 *
 * Het verschil met een bevinding: een bevinding vertelt, een keuze vraagt. Ze
 * bestaan naast elkaar omdat de meeste bevindingen niets van de bewoner nodig
 * hebben — "6 bewoners gevonden" is prettig om te lezen en verder klaar.
 */
export interface Keuze {
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

export interface Voorstel {
  /** De JSON zoals hij in `sites/<naam>.json` zou staan. */
  readonly config: Record<string, unknown>;
  readonly bevindingen: readonly Bevinding[];
  /** Wat er nog beslist moet worden voordat dit klopt. */
  readonly keuzes: readonly Keuze[];
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
/**
 * Wat een weerintegratie naast de huidige temperatuur nog meer levert.
 *
 * Buienradar geeft dertien temperatuursensoren: de huidige, de gevoels- en
 * grondtemperatuur, en per dag een verwachting met een minimum. Voor het
 * beslislogboek willen we er precies één — wat het buiten nú is.
 */
const AFGELEIDE_TEMPERATUUR =
  /(_\d+d$)|forecast|verwacht|gevoels|apparent|feels|grond|ground|soil|dauw|dew|minimale|maximale|minimum|maximum/i;

/** Woorden die op de opbrengst van zonnepanelen wijzen. */
const OPBRENGSTWOORDEN =
  /solar|zonne|zonnepane|pv[_ ]|photovolta|omvormer|inverter|huidig[_ ]vermogen/i;

const BUITENWOORDEN = new RegExp(
  `${GRENS_VOOR}(?:buiten|outdoor|outside|extern|external)${GRENS_NA}`,
  'i',
);

/** Heet deze sensor gewoon "temperatuur", zonder verdere bijstelling? */
function kaleNaam(e: HaRegistryEntity): boolean {
  const object = e.entity_id.split('.')[1] ?? '';
  return object === 'temperatuur' || object === 'temperature';
}

// ------------------------------------------------------------ ontdekken ----

export function ontdek(r: Registers): Voorstel {
  const bevindingen: Bevinding[] = [];
  const keuzes: Keuze[] = [];
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
  const weerPlatforms = new Set(
    bruikbaar
      .filter((e) => e.entity_id.startsWith('weather.'))
      .map((e) => e.platform)
      .filter((x): x is string => x != null),
  );
  const uitWeerbericht = temperatuurSensoren
    .filter(
      (e) =>
        e.platform != null &&
        weerPlatforms.has(e.platform) &&
        !AFGELEIDE_TEMPERATUUR.test(e.entity_id),
    )
    /*
     * Blijven er meer over, dan bovenaan degene die gewoon "temperatuur" heet.
     *
     * Een weerintegratie voor je eigen postcode noemt zijn sensor zelden
     * anders. Wie er daarnaast een heeft voor een circuit — dat komt voor —
     * herkent die aan de naam. Wij kiezen dan niet; we leggen alleen de meest
     * waarschijnlijke bovenop.
     */
    .sort((a, b) => Number(!kaleNaam(a)) - Number(!kaleNaam(b)));

  const buiten = buitenKandidaten[0] ?? (uitWeerbericht.length === 1 ? uitWeerbericht[0]! : null);
  if (buiten) {
    const opNaam = buitenKandidaten.length > 0;
    const anderen = opNaam ? buitenKandidaten.slice(1).map((e) => e.entity_id) : [];
    bevindingen.push({
      soort: opNaam && anderen.length === 0 ? 'gevonden' : 'geraden',
      pad: 'outdoorTemperature',
      tekst: opNaam
        ? `${buiten.entity_id} — ${naamVan(buiten, statePer.get(buiten.entity_id))}`
        : `${buiten.entity_id}, de enige actuele buitentemperatuur van je weerintegratie`,
      ...(anderen.length > 0 ? { alternatieven: anderen } : {}),
    });
    if (anderen.length > 0) {
      keuzes.push({
        id: 'outdoorTemperature',
        soort: 'veld',
        pad: 'outdoorTemperature',
        vraag: 'Welke sensor meet de buitentemperatuur?',
        huidig: buiten.entity_id,
        opties: [buiten.entity_id, ...anderen],
        magLeeg: true,
      });
    }
  } else if (uitWeerbericht.length > 1 || zwervend.length > 0) {
    const kandidaten = uitWeerbericht.length > 1 ? uitWeerbericht : zwervend;
    keuzes.push({
      id: 'outdoorTemperature',
      soort: 'veld',
      pad: 'outdoorTemperature',
      vraag: 'Welke sensor meet de buitentemperatuur?',
      toelichting:
        'De regeling gebruikt hem niet; hij gaat mee het logboek in zodat de ' +
        'dataset compleet is. Overslaan mag.',
      huidig: null,
      opties: kandidaten.map((e) => e.entity_id),
      magLeeg: true,
    });
    bevindingen.push({
      soort: 'ontbreekt',
      pad: 'outdoorTemperature',
      tekst:
        `geen sensor heet naar buiten, en er is er niet één aan te wijzen. Deze ` +
        `${kandidaten.length} komen in aanmerking; kies er zelf een. Zonder ` +
        'buitentemperatuur regelt alles gewoon door, maar mist de dataset een ' +
        'kolom (besluit 30).',
      alternatieven: kandidaten.map((e) => e.entity_id),
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
    const zelfmeters = apparaten.filter(
      (a) => getal(statePer.get(a.entity_id), 'current_temperature') != null,
    );

    if (thermometers.length === 0 && zelfmeters.length === 0) {
      bevindingen.push({
        soort: 'overgeslagen',
        pad: `zones.${gebied}`,
        tekst:
          `${naam} heeft wel een klimaatapparaat maar niets dat de temperatuur meet — ` +
          'ook het apparaat zelf meldt er geen',
      });
      continue;
    }

    /** Waar de temperatuur van deze zone vandaan komt. */
    let bron: { id: string; attribute?: string };
    if (thermometers.length === 0) {
      const zelfmeter = zelfmeters[0]!;
      bron = { id: zelfmeter.entity_id, attribute: 'current_temperature' };
      bevindingen.push({
        soort: 'geraden',
        pad: `zones.${gebied}.temperature`,
        tekst:
          `${naam} heeft geen losse thermometer; de eigen meting van ` +
          `${zelfmeter.entity_id} wordt gebruikt. Die zit in het apparaat en leest ` +
          'daardoor anders dan de kamer — een losse sensor is nauwkeuriger.',
        ...(zelfmeters.length > 1
          ? { alternatieven: zelfmeters.slice(1).map((e) => e.entity_id) }
          : {}),
      });
    } else {
      bron = { id: thermometers[0]!.entity_id };
    }

    if (thermometers.length > 1) {
      const thermometer = thermometers[0]!;
      bevindingen.push({
        soort: 'geraden',
        pad: `zones.${gebied}.temperature`,
        tekst: `${naam} heeft ${thermometers.length} thermometers; ${thermometer.entity_id} gekozen`,
        alternatieven: thermometers.slice(1).map((e) => e.entity_id),
      });
      keuzes.push({
        id: `zone:${slug(gebied)}:temperature`,
        soort: 'zoneTemperatuur',
        zoneId: slug(gebied),
        vraag: `Welke thermometer geldt voor ${naam}?`,
        toelichting: 'Hierop wordt geregeld, dus dit moet de kamer zijn en niet een apparaat.',
        huidig: thermometer.entity_id,
        opties: thermometers.map((e) => e.entity_id),
        magLeeg: false,
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
        keuzes.push({
          id: `dubbel:${id}`,
          soort: 'dubbelApparaat',
          vraag: 'Welke van deze twee stuurt dit apparaat aan?',
          toelichting:
            'Ze lijken hetzelfde apparaat via twee integraties. Allebei aanhouden ' +
            'betekent hetzelfde apparaat twee keer commanderen; de ander wordt weggelaten.',
          huidig: apparaat.entity_id,
          opties: [apparaat.entity_id, tweeling.entity_id],
          magLeeg: false,
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

    /*
     * Luchtvochtigheid langs dezelfde weg: liever een losse sensor, anders de
     * eigen meting van het apparaat waar de temperatuur ook vandaan komt. Dit
     * is waarneming en geen invoer (besluit 30), dus een minder nauwkeurige
     * bron kost hier geen regelgedrag.
     */
    const vocht = inGebied(vochtSensoren)[0] ?? null;
    const eigenVocht =
      vocht == null && bron.attribute != null &&
      getal(statePer.get(bron.id), 'current_humidity') != null
        ? { id: bron.id, attribute: 'current_humidity' }
        : null;

    // Een verwijzing zonder attribuut blijft een gewone tekst, zodat het
    // bestand er niet ingewikkelder uitziet dan het is.
    const alsRef = (m: { id: string; attribute?: string }): unknown =>
      m.attribute == null ? m.id : { id: m.id, attribute: m.attribute };

    zones.push({
      id: slug(gebied),
      name: naam,
      temperature: alsRef(bron),
      ...(vocht ? { humidity: vocht.entity_id } : {}),
      ...(eigenVocht ? { humidity: alsRef(eigenVocht) } : {}),
      actuatorIds,
    });

    bevindingen.push({
      soort: 'gevonden',
      pad: `zones.${slug(gebied)}`,
      tekst:
        `${naam}: ${bron.id}${bron.attribute ? ` (${bron.attribute})` : ''} met ` +
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
    keuzes.push({
      id: 'gridPower',
      soort: 'veld',
      pad: 'power.gridPower',
      vraag: 'Welke sensor meet wat er van het net komt?',
      toelichting:
        'Hij hoort negatief te worden bij teruglevering. Klopt dat niet, dan klopt ' +
        'het hele overschot niet. Zonder meter doet pv-surplus niet mee.',
      huidig: meter.entity_id,
      opties: meterKandidaten.map((e) => e.entity_id),
      magLeeg: true,
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

  // ---- opbrengst van de panelen -------------------------------------------
  //
  // De beste instralingsmeter die een woning met panelen al in huis heeft
  // (besluit 47). Herkenbaar aan de naam plus de eis dat hij in watt meet:
  // een omvormer die in kW rapporteert kan ook, maar dan klopt de eenheid in
  // het logboek niet meer met de rest.
  const opbrengstKandidaten = vermogenSensoren.filter((e) => {
    const st = statePer.get(e.entity_id);
    const eenheid = (st?.attributes as Record<string, unknown> | undefined)?.[
      'unit_of_measurement'
    ];
    return (
      OPBRENGSTWOORDEN.test(e.entity_id) &&
      !METERWOORDEN.test(e.entity_id) &&
      eenheid === 'W'
    );
  });
  const opbrengst = opbrengstKandidaten[0] ?? null;
  if (opbrengst) {
    bevindingen.push({
      soort: 'geraden',
      pad: 'solarProduction',
      tekst: `${opbrengst.entity_id} lijkt te meten wat de panelen leveren`,
      ...(opbrengstKandidaten.length > 1
        ? { alternatieven: opbrengstKandidaten.slice(1).map((e) => e.entity_id) }
        : {}),
    });
    if (opbrengstKandidaten.length > 1) {
      keuzes.push({
        id: 'solarProduction',
        soort: 'veld',
        pad: 'solarProduction',
        vraag: 'Welke sensor meet wat je panelen leveren?',
        toelichting:
          'De regeling gebruikt hem niet. Hij gaat mee het logboek in als maat ' +
          'voor instraling, zodat later te berekenen valt hoeveel de zon een ' +
          'kamer opwarmt. Overslaan mag.',
        huidig: opbrengst.entity_id,
        opties: opbrengstKandidaten.map((e) => e.entity_id),
        magLeeg: true,
      });
    }
  } else {
    bevindingen.push({
      soort: 'ontbreekt',
      pad: 'solarProduction',
      tekst:
        'geen sensor herkend die de opbrengst van zonnepanelen meet. Zonder die ' +
        'maat kan later niet worden uitgerekend hoeveel de zon een kamer opwarmt.',
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
    ...(opbrengst ? { solarProduction: opbrengst.entity_id } : {}),
  };

  return { config, bevindingen, keuzes };
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
export function pasKeuzesToe(
  voorstel: Voorstel,
  antwoorden: Readonly<Record<string, string | null>>,
): Record<string, unknown> {
  const config: Record<string, unknown> = structuredClone(voorstel.config);

  for (const keuze of voorstel.keuzes) {
    if (!(keuze.id in antwoorden)) continue;
    const antwoord = antwoorden[keuze.id] ?? null;

    // Een antwoord dat niet in de lijst stond komt er niet in. De weergave
    // levert een keuzelijst aan; alles daarbuiten is een fout of iets ergers.
    if (antwoord != null && !keuze.opties.includes(antwoord)) continue;
    if (antwoord == null && !keuze.magLeeg) continue;

    if (keuze.soort === 'veld' && keuze.pad === 'outdoorTemperature') {
      if (antwoord == null) delete config['outdoorTemperature'];
      else config['outdoorTemperature'] = antwoord;
    } else if (keuze.soort === 'veld' && keuze.pad === 'power.gridPower') {
      if (antwoord == null) delete config['power'];
      else config['power'] = { ...(config['power'] as object | undefined), gridPower: antwoord };
    } else if (keuze.soort === 'zoneTemperatuur') {
      const zones = (config['zones'] as Record<string, unknown>[] | undefined) ?? [];
      for (const zone of zones) {
        if (zone['id'] === keuze.zoneId) zone['temperature'] = antwoord;
      }
    } else if (keuze.soort === 'dubbelApparaat' && antwoord != null) {
      const teVerwijderen = keuze.opties.filter((o) => o !== antwoord);
      verwijderApparaten(config, teVerwijderen);
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
function verwijderApparaten(config: Record<string, unknown>, refs: readonly string[]): void {
  const actuators = (config['actuators'] as Record<string, unknown>[] | undefined) ?? [];
  const weg = new Set(
    actuators.filter((a) => refs.includes(String(a['ref']))).map((a) => String(a['id'])),
  );
  if (weg.size === 0) return;

  config['actuators'] = actuators.filter((a) => !weg.has(String(a['id'])));

  const zones = (config['zones'] as Record<string, unknown>[] | undefined) ?? [];
  config['zones'] = zones
    .map((zone) => ({
      ...zone,
      actuatorIds: ((zone['actuatorIds'] as string[] | undefined) ?? []).filter(
        (id) => !weg.has(id),
      ),
    }))
    .filter((zone) => (zone['actuatorIds'] as string[]).length > 0);
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
