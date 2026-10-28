/*
 * De regeling per kamer in de app (besluit 138, schets Wand-Indeling-Regeling).
 *
 * Welk apparaat een kamer regelt, stond in het vaste bestand. Nu legt de
 * bewoner het vast bij de kamer, in Indeling, bij Verwarmen en koelen: per
 * klimaatapparaat wat de regeling ermee doet.
 *
 * - **Houdt op temperatuur** (`houdt`): warmt of koelt tot het doel bij
 *   Comfort, ook van het net. In de configuratie de rol `primary`.
 * - **Helpt op zon** (`zon`): springt bij als er eigen zon over is; van het
 *   net alleen als Comfort dat zegt. De rol `assist`.
 * - **Alleen kijken** (`kijken`): het huis volgt het apparaat, maar regelt het
 *   niet. Een kamer zonder iets anders doet niet mee in de regeling.
 *
 * `withRegeling` legt dat over de ruwe configuratie, zoals comfort (besluit
 * 130): een kamer met rollen krijgt een zone met precies die apparaten. Een
 * apparaat uit Home Assistant dat nog niet in de configuratie stond, wordt een
 * apparaat van de regeling, met wat Home Assistant erover zegt. Hoe snel het
 * aan en uit mag, krijgt een veilige waarde per soort. Er gaat niets naar Home
 * Assistant: de regeling kijkt mee tot stap B (besluit 64).
 */

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import { pointFor } from './meten.js';
import type { Warmtebron } from './warmte.js';
import { STANDAARD_KOEL, STANDAARD_WARM } from '../config/standaard.js';

export const ROLLEN = ['houdt', 'zon', 'kijken'] as const;
export type Rol = (typeof ROLLEN)[number];

/** Per apparaat in de kamer wat de regeling ermee doet; wat er niet in staat, kijkt alleen. */
export type Rollen = Readonly<Record<string, Rol>>;

const MAX_ROLLEN = 12;

/** De rollen van een kamer uit wat de pagina stuurt, of een reden waarom niet. */
export function controleerRollen(kamer: string, waarde: unknown, bekend: ReadonlySet<string>): { ok: true; rollen: Record<string, Rol> } | { ok: false; reden: string } {
  if (typeof waarde !== 'object' || waarde == null || Array.isArray(waarde)) return { ok: false, reden: `kamer ${kamer}: rollen is een object` };
  const paren = Object.entries(waarde as Record<string, unknown>);
  if (paren.length > MAX_ROLLEN) return { ok: false, reden: `kamer ${kamer}: hooguit ${MAX_ROLLEN} apparaten met een rol` };
  const rollen: Record<string, Rol> = {};
  for (const [id, rol] of paren) {
    if (!(ROLLEN as readonly unknown[]).includes(rol)) return { ok: false, reden: `kamer ${kamer}: de rol van ${id} is ${ROLLEN.join(', ')}` };
    // Een apparaat dat het huis niet meer kent, valt weg; een oude indeling mag het bewaren niet blokkeren.
    if (bekend.has(id)) rollen[id] = rol as Rol;
  }
  return { ok: true, rollen };
}

export const doetMee = (rollen: Rollen | undefined): boolean => Object.values(rollen ?? {}).some((r) => r !== 'kijken');

/** Wat de configuratie zegt, als rollen (de eenmalige overstap): primary is houdt, assist is zon. */
export function rollenUitConfig(
  raw: Record<string, unknown>,
  regelzone: string | null,
): Record<string, Rol> | null {
  if (!regelzone) return null;
  const zones = Array.isArray(raw['zones']) ? (raw['zones'] as Record<string, unknown>[]) : [];
  const actuators = Array.isArray(raw['actuators']) ? (raw['actuators'] as Record<string, unknown>[]) : [];
  const zone = zones.find((z) => z['id'] === regelzone);
  if (!zone || !Array.isArray(zone['actuatorIds'])) return null;
  const rollen: Record<string, Rol> = {};
  for (const id of zone['actuatorIds'] as unknown[]) {
    const a = actuators.find((x) => x['id'] === id);
    if (a) rollen[String(id)] = a['role'] === 'assist' ? 'zon' : 'houdt';
  }
  return rollen;
}

/** Een kamer zoals `withRegeling` hem leest. */
export interface RegelKamer {
  readonly id: string;
  readonly naam: string;
  readonly regelzone: string | null;
  readonly meten?: readonly string[];
  readonly rollen?: Rollen;
  readonly bronnen?: readonly Warmtebron[];
}

export interface RegelingApplied {
  readonly raw: Record<string, unknown>;
  /** Wat de app veranderde, voor in het logboek. */
  readonly toegevoegd: readonly string[];
  /** Wat niet kon, zoals een apparaat dat Home Assistant niet (meer) kent. */
  readonly overgeslagen: readonly string[];
}

/** Hoe snel een apparaat aan en uit mag: een airco wat rustiger dan een thermostaat. */
const TIMING_AIRCO = { minRunMinutes: 15, minRestMinutes: 5, settleMinutes: 3 };
const TIMING_WARMTE = { minRunMinutes: 10, minRestMinutes: 5, settleMinutes: 2 };
/** Een airco zonder bekend vermogen: zo rekent het huis met een gewone split-unit. */
const AIRCO_W = 1000;

/**
 * De doelen van een zone die andere apparaten kreeg: wat geen apparaat kan
 * (koelen zonder airco), valt weg; wat buiten het bereik valt, schuift erin.
 * Zo blijft een kamer bewaarbaar als de bewoner een apparaat weghaalt.
 */
export function binnenBereik(zone: Record<string, unknown>, actuators: readonly Record<string, unknown>[]): Record<string, unknown> {
  const caps = (zone['actuatorIds'] as string[]).map((id) => actuators.find((a) => a['id'] === id)?.['capabilities'] as Record<string, unknown> | undefined).filter((c): c is Record<string, unknown> => c != null);
  const bereik = (soort: 'canHeat' | 'canCool') => {
    const r = caps.filter((c) => c[soort] === true).map((c) => (Array.isArray(c['setpointRange']) ? (c['setpointRange'] as number[]) : [5, 35]));
    return r.length ? [Math.min(...r.map((x) => x[0]!)), Math.max(...r.map((x) => x[1]!))] : null;
  };
  const warm = bereik('canHeat');
  const koel = bereik('canCool');
  const sp = (zone['setpoints'] as Record<string, Record<string, number>> | undefined) ?? {};
  const pas = (v: number | undefined, b: number[] | null) => (v == null || b == null ? undefined : Math.min(b[1]!, Math.max(b[0]!, v)));
  const setpoints = Object.fromEntries(
    Object.entries(sp).map(([mode, paar]) => {
      const heat = pas(paar['heat'], warm);
      const cool = pas(paar['cool'], koel);
      return [mode, { ...(heat != null ? { heat } : {}), ...(cool != null && (heat == null || cool > heat) ? { cool } : {}) }];
    }),
  );
  return { ...zone, setpoints };
}

/**
 * Het bereik dat de bewoner koos bij Wat elk apparaat kan (besluit 197): voor
 * een apparaat dat iets opgeeft wat niet kan kloppen, zoals een thermostaat met
 * 0° tot 80°. Op het id van het apparaat of zijn entiteit; de stand-by blijft
 * erbinnen. Zonder keuze verandert er niets.
 */
export function withBereik(raw: Record<string, unknown>, apparaten: Readonly<Record<string, { readonly bereik?: readonly [number, number] }>> | null): { raw: Record<string, unknown>; toegevoegd: string[] } {
  const toegevoegd: string[] = [];
  if (!apparaten || !Array.isArray(raw['actuators'])) return { raw, toegevoegd };
  const actuators = (raw['actuators'] as Record<string, unknown>[]).map((a) => {
    const ref = typeof a['ref'] === 'string' ? a['ref'] : (a['ref'] as { id?: unknown } | undefined)?.id;
    const bereik = apparaten[String(a['id'])]?.bereik ?? (typeof ref === 'string' ? apparaten[ref]?.bereik : undefined);
    const caps = a['capabilities'] as Record<string, unknown> | undefined;
    if (!bereik || !caps) return a;
    const [lo, hi] = bereik;
    const sb = caps['standby'] as { heat?: number; cool?: number } | undefined;
    const binnen = (x: number) => Math.min(hi, Math.max(lo, x));
    toegevoegd.push(`${String(a['name'] ?? a['id'])} houdt ${lo}° tot ${hi}° aan`);
    return { ...a, capabilities: { ...caps, setpointRange: [lo, hi], ...(sb ? { standby: { ...sb, ...(sb.heat != null ? { heat: binnen(sb.heat) } : {}), ...(sb.cool != null ? { cool: binnen(sb.cool) } : {}) } } : {}) } };
  });
  return { raw: { ...raw, actuators }, toegevoegd };
}

/** Alle zones binnen het bereik van hun apparaten: als laatste stap, na Comfort. */
export function doelenBinnenBereik(raw: Record<string, unknown>): Record<string, unknown> {
  const zones = Array.isArray(raw['zones']) ? (raw['zones'] as Record<string, unknown>[]) : null;
  const actuators = Array.isArray(raw['actuators']) ? (raw['actuators'] as Record<string, unknown>[]) : [];
  if (!zones) return raw;
  return { ...raw, zones: zones.map((z) => (Array.isArray(z['actuatorIds']) ? binnenBereik(z, actuators) : z)) };
}

/** Wat Home Assistant zegt over een klimaatapparaat: kan het verwarmen of koelen, en tussen welke graden. */
export function vermogensVan(state: HaEntityState | undefined): { canHeat: boolean; canCool: boolean; range: [number, number] } | null {
  if (!state) return null;
  const modes = Array.isArray(state.attributes['hvac_modes']) ? (state.attributes['hvac_modes'] as unknown[]).map(String) : [];
  const canHeat = modes.some((m) => m === 'heat' || m === 'heat_cool' || m === 'auto');
  const canCool = modes.some((m) => m === 'cool' || m === 'heat_cool');
  if (!canHeat && !canCool) return null;
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const min = Math.max(5, Math.min(30, n(state.attributes['min_temp'], 7)));
  const max = Math.min(35, Math.max(min + 1, n(state.attributes['max_temp'], 35)));
  return { canHeat, canCool, range: [min, max] };
}

/**
 * Legt de rollen uit de app over de ruwe configuratie. Alleen kamers met
 * rollen; de rest blijft zoals het bestand zegt. Zuiver: het resultaat gaat
 * daarna door het eigen schema.
 */
export function withRegeling(
  raw: Record<string, unknown>,
  kamers: readonly RegelKamer[] | null,
  ha: {
    readonly state: (entityId: string) => HaEntityState | undefined;
    /** De stroommeter bij hetzelfde apparaat in Home Assistant, als die er is. */
    readonly vermogenSensor?: (entityId: string) => string | null;
    /** In welke kamer een apparaat staat volgens de indeling; weg is: waar de rol staat. */
    readonly kamerVan?: (deviceId: string) => string | null;
  },
): RegelingApplied {
  const metRollen = (kamers ?? []).filter((k) => k.rollen != null);
  if (metRollen.length === 0) return { raw, toegevoegd: [], overgeslagen: [] };
  const toegevoegd: string[] = [];
  const overgeslagen: string[] = [];
  let actuators = Array.isArray(raw['actuators']) ? [...(raw['actuators'] as Record<string, unknown>[])] : [];
  let zones = Array.isArray(raw['zones']) ? [...(raw['zones'] as Record<string, unknown>[])] : [];
  const geclaimd = new Set<string>();

  // Eerst alle apparaten uit de kamers met rollen uit elke zone: daarna krijgt elke kamer precies wat ze kiest.
  const beheerd = new Set(metRollen.flatMap((k) => Object.keys(k.rollen ?? {})));
  zones = zones.map((z) => {
    const lijst = Array.isArray(z['actuatorIds']) ? (z['actuatorIds'] as string[]) : [];
    const over = lijst.filter((x) => !beheerd.has(x));
    return over.length === lijst.length ? z : { ...z, actuatorIds: over };
  });

  for (const k of metRollen) {
    const zid = k.regelzone;
    const actief = Object.entries(k.rollen ?? {})
      .filter(([id, r]) => r !== 'kijken' && !geclaimd.has(id) && (ha.kamerVan?.(id) ?? k.id) === k.id)
      // Wat de kamer op temperatuur houdt, eerst.
      .sort(([, a], [, b]) => (a === b ? 0 : a === 'houdt' ? -1 : 1));
    const ids: string[] = [];
    for (const [id, rol] of actief) {
      const role = rol === 'houdt' ? 'primary' : 'assist';
      const i = actuators.findIndex((a) => a['id'] === id);
      const bron = (k.bronnen ?? []).find((b) => b.apparaat === id && b.vermogenW != null);
      if (i >= 0) {
        const a = actuators[i]!;
        const power = (a['power'] as Record<string, unknown> | undefined) ?? {};
        const zonderVermogen = role === 'assist' && !(Number(power['estimatedW']) > 0);
        const caps = a['capabilities'] as Record<string, unknown> | undefined;
        const w = bron?.vermogenW ?? (caps?.['canCool'] === true ? AIRCO_W : null);
        if (zonderVermogen && w == null) {
          overgeslagen.push(`${String(a['name'] ?? id)}: helpt op zon kan pas met een vermogen`);
          continue;
        }
        if (a['role'] !== role || zonderVermogen) {
          actuators[i] = { ...a, role, ...(zonderVermogen ? { power: { ...power, estimatedW: w } } : {}) };
          toegevoegd.push(`${String(a['name'] ?? id)}: ${rol === 'houdt' ? 'houdt op temperatuur' : 'helpt op zon'}`);
        }
        ids.push(id);
        geclaimd.add(id);
        continue;
      }
      // Nieuw: een klimaatapparaat uit Home Assistant.
      if (!id.startsWith('climate.')) {
        overgeslagen.push(`${id}: geen klimaatapparaat`);
        continue;
      }
      const st = ha.state(id);
      const kan = vermogensVan(st);
      if (!kan) {
        overgeslagen.push(`${id}: Home Assistant zegt niet wat het kan`);
        continue;
      }
      const sensor = ha.vermogenSensor?.(id) ?? null;
      const w = bron?.vermogenW ?? (kan.canCool ? AIRCO_W : role === 'assist' ? null : 0);
      if (w == null) {
        overgeslagen.push(`${id}: helpt op zon kan pas met een vermogen`);
        continue;
      }
      const standby = kan.canCool && kan.canHeat && kan.range[0] <= 18 && kan.range[1] >= 25 ? { standby: { heat: 18, cool: 25 } } : {};
      actuators.push({
        id,
        name: String(st?.attributes['friendly_name'] ?? id),
        ref: id,
        role,
        capabilities: { canHeat: kan.canHeat, canCool: kan.canCool, setpointRange: kan.range, ...standby },
        power: { estimatedW: w, ...(sensor ? { sensor } : {}) },
        timing: kan.canCool ? TIMING_AIRCO : TIMING_WARMTE,
      });
      toegevoegd.push(`${String(st?.attributes['friendly_name'] ?? id)} doet mee in ${k.naam}`);
      ids.push(id);
      geclaimd.add(id);
    }

    if (!zid) continue;
    const j = zones.findIndex((z) => z['id'] === zid);
    if (ids.length === 0) {
      if (j >= 0) {
        zones.splice(j, 1);
        toegevoegd.push(`${k.naam} doet niet mee in de regeling`);
      }
      continue;
    }
    if (j >= 0) {
      zones[j] = binnenBereik({ ...zones[j]!, actuatorIds: ids }, actuators);
      continue;
    }
    // Een nieuwe zone, met veilige waarden; Comfort zet daarna de temperaturen.
    const kunnen = ids.map((id) => actuators.find((a) => a['id'] === id)?.['capabilities'] as Record<string, unknown> | undefined);
    const warm = kunnen.some((c) => c?.['canHeat'] === true);
    const koel = kunnen.some((c) => c?.['canCool'] === true);
    const opZon = actief.some(([, r]) => r === 'zon');
    const ref = (id: string) => String(actuators.find((a) => a['id'] === id)?.['ref'] ?? id);
    const meetpunt = k.meten?.[0] ? pointFor(actuators.some((a) => a['id'] === k.meten![0]) ? ref(k.meten[0]) : k.meten[0]) : pointFor(ref(ids[0]!));
    const prioriteit = Math.max(0, ...zones.map((z) => Number(z['priority']) || 0)) + 1;
    zones.push(binnenBereik({
      id: zid,
      name: k.naam,
      temperature: meetpunt,
      actuatorIds: ids,
      priority: prioriteit,
      thermalMass: 'medium',
      hysteresis: { onDelta: 0.3, offDelta: 0.2 },
      buffering: { enabled: opZon, bandC: opZon ? 1 : 0 },
      // De standaard voor een nieuw huis (besluit 204).
      setpoints: {
        dag: { ...(warm ? { heat: STANDAARD_WARM.dag } : {}), ...(koel ? { cool: STANDAARD_KOEL.dag } : {}) },
        nacht: warm ? { heat: STANDAARD_WARM.nacht } : {},
        voorverwarmen: warm ? { heat: STANDAARD_WARM.voorverwarmen } : {},
        afwezig: warm ? { heat: STANDAARD_WARM.afwezig } : {},
        vakantie: warm ? { heat: STANDAARD_WARM.vakantie } : {},
        handmatig: {},
      },
    }, actuators));
    toegevoegd.push(`${k.naam} doet mee in de regeling`);
  }

  // Een zone zonder apparaten valt weg; het schema vraagt er minstens één.
  zones = zones.filter((z) => Array.isArray(z['actuatorIds']) && (z['actuatorIds'] as unknown[]).length > 0);
  // Een apparaat uit Home Assistant dat alleen kijkt, hoeft niet in de configuratie: het huis volgt het toch.
  actuators = actuators.filter((a) => !String(a['id']).startsWith('climate.') || zones.some((z) => (z['actuatorIds'] as string[]).includes(String(a['id']))));
  // De oude helpers per zone (migration.setpoints) alleen voor zones die er nog zijn.
  const ids = new Set(zones.map((z) => String(z['id'])));
  const mig = raw['migration'] as Record<string, unknown> | undefined;
  const sp = mig?.['setpoints'] as Record<string, unknown> | undefined;
  const migration = sp && Object.keys(sp).some((z) => !ids.has(z)) ? { ...mig, setpoints: Object.fromEntries(Object.entries(sp).filter(([z]) => ids.has(z))) } : mig;
  return { raw: { ...raw, actuators, zones, ...(migration !== undefined ? { migration } : {}) }, toegevoegd, overgeslagen };
}
