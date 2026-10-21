/*
 * De thuisbatterij en de auto (besluit 182, schets Thuis-Tel-Kaarten): wat de
 * app ervan laat zien, alleen lezen. Tot nu toe sloeg de app ze bewust over,
 * bij de batterijen van kleine apparaten (besluit 127); nu krijgen ze een
 * eigen kaart op Thuis en bij Apparaten, als het huis ze heeft.
 *
 * Home Assistant kent geen vaste soort voor een thuisbatterij of een auto.
 * Herkennen gaat daarom per apparaat, op wat het meet en wie het levert:
 *
 *  - **een auto:** een apparaat met een actieradius (`distance`), of van een
 *    koppeling voor auto's (Tesla, Volkswagen, Kia, ...);
 *  - **een laadpaal:** een apparaat van een koppeling voor laadpalen (Easee,
 *    Zaptec, Wallbox, ...). Zonder auto in Home Assistant is de laadpaal de
 *    auto: hij weet of er een auto aan hangt en of die laadt;
 *  - **een thuisbatterij:** een apparaat met een lading in procenten dat
 *    energie opslaat (`energy_storage`), of van een koppeling of een type
 *    voor thuisbatterijen (Powerwall, Sessy, Marstek, ...), en geen auto.
 *
 * Wat hij doet, volgt uit het vermogen: wat er naar de batterij gaat is laden,
 * wat eruit komt is leveren. Niet elke koppeling telt even: een vermogen met
 * "discharge" of "ontlaad" in de naam is leveren, en een paar merken tellen
 * omgekeerd (`LEVEREN_POSITIEF`). Weet de app het niet zeker, dan zegt hij
 * alleen het percentage.
 */

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { HaDevice, HaRegistryEntity } from '../adapters/homeassistant/discovery.js';

export interface Thuisbatterij {
  readonly id: string;
  readonly naam: string;
  /** De lading in procenten, of null als het apparaat het niet zegt. */
  readonly pct: number | null;
  /** Het vermogen in watt: positief is laden, negatief is leveren aan het huis. */
  readonly vermogenW: number | null;
  readonly stand: 'laadt' | 'levert' | 'rust' | null;
}

export interface Auto {
  readonly id: string;
  readonly naam: string;
  readonly pct: number | null;
  /** Of er een kabel in zit; null als niets het meet. */
  readonly aangesloten: boolean | null;
  readonly laadt: boolean | null;
  /** Het laadvermogen in watt, of null. */
  readonly vermogenW: number | null;
  /** Het bereik in kilometers, of null. */
  readonly bereikKm: number | null;
}

export interface Opslag {
  readonly batterij: Thuisbatterij | null;
  readonly auto: Auto | null;
}

const AUTO_KOPPELING = /^(tesla_fleet|teslemetry|tessie|tesla_custom|volkswagencarnet|volkswagen_we_connect_id|renault|kia_uvo|hyundai|bmw_connected_drive|mercedes_me|mbapi2020|polestar_api|nissan_leaf|audiconnect|skodaconnect|myskoda|peugeot|stellantis|toyota|volvo|ford|mg_saic|byd)$/;
const AUTO_MERK = /\b(volkswagen|renault|kia|hyundai|polestar|bmw|mercedes|audi|skoda|škoda|nissan|peugeot|toyota|volvo|ford|mg|cupra|lynk)\b/i;
const LAADPAAL_KOPPELING = /^(easee|zaptec|wallbox|alfen_wallbox|peblar|ohme|myenergi|go_echarger|goecharger|openevse|nrgkick|tesla_wall_connector|ocpp|evse_load_balancer|smappee)$/;
const LAADPAAL_MERK = /\b(easee|zaptec|wallbox|alfen|peblar|ohme|zappi|go-e|openevse|nrgkick|wall connector)\b/i;
const BATTERIJ_KOPPELING = /^(powerwall|tesla_gateway|sessy|marstek|zendure|zendure_ha|victron|huawei_solar|sungrow|goodwe|solaredge|enphase_envoy|growatt_server|ecoflow|ecoflow_cloud|anker_solix|sonnen|sonnenbatterie|fronius|byd)$/;
const BATTERIJ_TYPE = /\b(batter(y|ij)|accu|powerwall|luna|storage|opslag|sessy|venus|solarbank|delta|sonnen)\b/i;
/** Merken die het vermogen van de batterij positief noemen als hij levert. */
const LEVEREN_POSITIEF = /^(powerwall|tesla_gateway|ecoflow|ecoflow_cloud)$/;
/** Onder dit vermogen doet hij niets: een paar watt is ruis. */
const RUST_W = 40;

const getal = (s: HaEntityState | undefined): number | null => {
  if (!s || s.state === '' || s.state === 'unknown' || s.state === 'unavailable') return null;
  const n = Number(s.state);
  return Number.isFinite(n) ? n : null;
};
/** Een vermogen in watt, ook als het in kW staat. */
const watt = (s: HaEntityState | undefined): number | null => {
  const n = getal(s);
  if (n == null) return null;
  const eenheid = String(s?.attributes['unit_of_measurement'] ?? 'W');
  return eenheid === 'kW' ? n * 1000 : eenheid === 'MW' ? n * 1e6 : n;
};

interface Apparaat {
  readonly device: HaDevice;
  readonly entiteiten: readonly HaRegistryEntity[];
  readonly platform: string;
}

/** De thuisbatterij en de auto in Home Assistant, of null als het huis ze niet heeft. */
export function vindOpslag(registers: { readonly devices: readonly HaDevice[]; readonly entities: readonly HaRegistryEntity[] }, states: ReadonlyMap<string, HaEntityState>): Opslag {
  const klasse = (e: HaRegistryEntity) => e.device_class ?? e.original_device_class ?? (states.get(e.entity_id)?.attributes['device_class'] as string | undefined) ?? null;
  const perApparaat = new Map<string, HaRegistryEntity[]>();
  for (const e of registers.entities) {
    if (!e.device_id || e.disabled_by) continue;
    perApparaat.set(e.device_id, [...(perApparaat.get(e.device_id) ?? []), e]);
  }
  const apparaten: Apparaat[] = registers.devices.flatMap((d) => {
    const entiteiten = perApparaat.get(d.id) ?? [];
    return entiteiten.length ? [{ device: d, entiteiten, platform: entiteiten.find((e) => e.platform)?.platform ?? '' }] : [];
  });
  const merk = (a: Apparaat) => `${a.device.manufacturer ?? ''} ${a.device.model ?? ''} ${a.device.name ?? ''}`;
  const heeft = (a: Apparaat, k: string) => a.entiteiten.some((e) => klasse(e) === k);
  const naam = (a: Apparaat) => a.device.name_by_user || a.device.name || a.device.model || 'De auto';
  /** De lading in procenten: een sensor met de klasse batterij. */
  const pctVan = (a: Apparaat): number | null => {
    for (const e of a.entiteiten) {
      if (!e.entity_id.startsWith('sensor.') || klasse(e) !== 'battery') continue;
      const s = states.get(e.entity_id);
      const n = getal(s);
      if (n != null && n >= 0 && n <= 100 && s?.attributes['unit_of_measurement'] === '%') return n;
    }
    return null;
  };
  const vermogens = (a: Apparaat) => a.entiteiten.filter((e) => e.entity_id.startsWith('sensor.') && klasse(e) === 'power');
  const naamVan = (e: HaRegistryEntity) => `${e.entity_id} ${e.name ?? e.original_name ?? ''} ${String(states.get(e.entity_id)?.attributes['friendly_name'] ?? '')}`.toLowerCase();
  const aanUit = (a: Apparaat, k: string): boolean | null => {
    const e = a.entiteiten.find((x) => x.entity_id.startsWith('binary_sensor.') && klasse(x) === k);
    const s = e ? states.get(e.entity_id) : undefined;
    return s == null || s.state === 'unavailable' || s.state === 'unknown' ? null : s.state === 'on';
  };

  const isAuto = (a: Apparaat) => heeft(a, 'distance') || AUTO_KOPPELING.test(a.platform) || (AUTO_MERK.test(merk(a)) && pctVan(a) != null && !BATTERIJ_TYPE.test(merk(a)));
  const isLaadpaal = (a: Apparaat) => LAADPAAL_KOPPELING.test(a.platform) || LAADPAAL_MERK.test(merk(a));
  const isBatterij = (a: Apparaat) =>
    !isAuto(a) && !isLaadpaal(a) && pctVan(a) != null && (heeft(a, 'energy_storage') || BATTERIJ_KOPPELING.test(a.platform) || BATTERIJ_TYPE.test(merk(a)));

  /* ---- de thuisbatterij ---- */
  const accu = apparaten.find(isBatterij) ?? null;
  let batterij: Thuisbatterij | null = null;
  if (accu) {
    const p = vermogens(accu);
    // Bij voorkeur een vermogen van de batterij zelf, niet dat van de panelen of het net.
    const eigen = p.filter((e) => /batter|accu|charge|laad/.test(naamVan(e)));
    let w: number | null = null;
    const laad = eigen.find((e) => /(?<!dis)charg|(?<!ont)laad/.test(naamVan(e)) && !/discharg|ontlaad/.test(naamVan(e)));
    const ontlaad = eigen.find((e) => /discharg|ontlaad/.test(naamVan(e)));
    if (laad || ontlaad) {
      w = (laad ? (watt(states.get(laad.entity_id)) ?? 0) : 0) - (ontlaad ? (watt(states.get(ontlaad.entity_id)) ?? 0) : 0);
    } else {
      const een = eigen[0] ?? (p.length === 1 ? p[0] : undefined);
      const n = een ? watt(states.get(een.entity_id)) : null;
      w = n == null ? null : LEVEREN_POSITIEF.test(accu.platform) ? -n : n;
    }
    const stand = w == null ? null : w > RUST_W ? 'laadt' : w < -RUST_W ? 'levert' : 'rust';
    batterij = { id: accu.device.id, naam: accu.device.name_by_user || 'De batterij', pct: pctVan(accu), vermogenW: w == null ? null : Math.round(w), stand };
  }

  /* ---- de auto, of de laadpaal als de auto er niet is ---- */
  const wagen = apparaten.find(isAuto) ?? null;
  const paal = apparaten.find(isLaadpaal) ?? null;
  let auto: Auto | null = null;
  if (wagen || paal) {
    const bron = [wagen, paal].filter((x): x is Apparaat => x != null);
    const eerst = <T>(f: (a: Apparaat) => T | null): T | null => {
      for (const a of bron) {
        const v = f(a);
        if (v != null) return v;
      }
      return null;
    };
    // Het laadvermogen: van de laadpaal, anders een laadvermogen van de auto.
    const laadW = eerst((a) => {
      const e = vermogens(a).find((x) => a === paal || /charg|laad/.test(naamVan(x)));
      return e ? watt(states.get(e.entity_id)) : null;
    });
    /** De stand van een laadpaal als woord, zoals "charging" of "connected". */
    const status = paal
      ? paal.entiteiten
          .filter((e) => e.entity_id.startsWith('sensor.') && klasse(e) !== 'power' && /status|state|stand|mode/.test(naamVan(e)))
          .map((e) => String(states.get(e.entity_id)?.state ?? '').toLowerCase())
          .find((s) => /charg|laad|connect|disconnect|awaiting|ready|available|idle|paused|completed|vol/.test(s)) ?? null
      : null;
    const laadtStatus = status == null ? null : /^(charging|laden|laadt)$|charging/.test(status) && !/not.?charging|discharg/.test(status);
    const losStatus = status == null ? null : /disconnect|available|idle|niet aangesloten|vrij/.test(status);
    const laadt = eerst((a) => aanUit(a, 'battery_charging')) ?? laadtStatus ?? (laadW == null ? null : laadW > 200);
    const aangesloten = eerst((a) => aanUit(a, 'plug')) ?? (losStatus == null ? null : !losStatus) ?? (laadt ? true : null);
    const bereik = wagen
      ? (() => {
          const e = wagen.entiteiten.find((x) => x.entity_id.startsWith('sensor.') && klasse(x) === 'distance' && /range|bereik|actieradius/.test(naamVan(x)));
          const s = e ? states.get(e.entity_id) : undefined;
          const n = getal(s);
          if (n == null) return null;
          return String(s?.attributes['unit_of_measurement'] ?? 'km') === 'mi' ? Math.round(n * 1.609) : Math.round(n);
        })()
      : null;
    auto = {
      id: (wagen ?? paal)!.device.id,
      naam: wagen ? naam(wagen) : 'De auto',
      pct: eerst(pctVan),
      aangesloten,
      laadt,
      vermogenW: laadW == null ? null : Math.round(laadW),
      bereikKm: bereik,
    };
  }
  return { batterij, auto };
}
