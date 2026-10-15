/*
 * Verwarmen en koelen per kamer (besluit 132, schets Wand-Indeling-Warmte).
 *
 * Wat er in een kamer warmt of koelt: een radiator op de cv, vloerverwarming
 * op water of elektrisch, een infraroodpaneel, een elektrische kachel, een
 * airco. Hoe het aangaat: met een thermostaat, een slimme radiatorknop, een
 * slimme stekker of module, of met de hand. De bewoner legt het vast in de
 * indeling, bij de kamer; wat Home Assistant al weet, stelt de app voor.
 *
 * Twee dingen doet de dienst ermee. Wat je huis kan zegt per functie waar het
 * werkt. En een elektrische bron die een apparaat van de regeling schakelt,
 * mag op zon opwarmen als de bewoner dat aanzet: dan rekent het met zijn
 * vermogen, buffert de zone, en mag het ook naast comfort op zon draaien
 * (`withHeatSources`). Zoals comfort (besluit 130) over de configuratie
 * gelegd; er gaat niets naar Home Assistant.
 */

/** Wat er hangt. Elektrisch zijn vloer-elektrisch, paneel en kachel. */
export const BRON_SOORTEN = ['radiator', 'vloer', 'vloer-elektrisch', 'paneel', 'kachel', 'airco'] as const;
export type BronSoort = (typeof BRON_SOORTEN)[number];
export const ELEKTRISCH: ReadonlySet<BronSoort> = new Set(['vloer-elektrisch', 'paneel', 'kachel']);

/** Hoe het aangaat. */
export const BRON_AAN = ['thermostaat', 'knop', 'stekker', 'hand'] as const;
export type BronAan = (typeof BRON_AAN)[number];

export interface Warmtebron {
  readonly id: string;
  /** Wat er hangt; meer dan één als ze samen aangaan, zoals vloer en paneel. */
  readonly soorten: readonly BronSoort[];
  readonly aan: BronAan;
  /** Wat het schakelt: een apparaat van de regeling of uit Home Assistant. Weg bij met de hand. */
  readonly apparaat?: string;
  /** Samen, in watt; alleen voor elektrisch dat slim aangaat. */
  readonly vermogenW?: number;
  /** Mag op zon opwarmen (besluit 132); alleen elektrisch, met vermogen. */
  readonly opZon?: boolean;
}

export const MAX_BRONNEN = 8;
const ID = /^[a-z0-9][a-z0-9_.-]{0,79}$/;

/** Elektrisch en slim: dan kent het huis zijn vermogen en kan het op zon. */
export const isElektrischSlim = (b: Pick<Warmtebron, 'soorten' | 'aan'>): boolean => b.aan !== 'hand' && b.soorten.some((s) => ELEKTRISCH.has(s));

/** De bronnen van een kamer uit wat de pagina stuurt, of een reden waarom niet. */
export function controleerBronnen(kamer: string, waarde: unknown): { ok: true; bronnen: Warmtebron[] } | { ok: false; reden: string } {
  if (!Array.isArray(waarde) || waarde.length > MAX_BRONNEN) return { ok: false, reden: `kamer ${kamer}: bronnen is een lijst van hooguit ${MAX_BRONNEN}` };
  const bronnen: Warmtebron[] = [];
  const ids = new Set<string>();
  for (const [i, v] of waarde.entries()) {
    const b = (typeof v === 'object' && v != null && !Array.isArray(v) ? v : null) as Record<string, unknown> | null;
    if (b == null) return { ok: false, reden: `kamer ${kamer}: bron ${i} is geen object` };
    const id = b['id'];
    if (typeof id !== 'string' || !ID.test(id) || ids.has(id)) return { ok: false, reden: `kamer ${kamer}: bron ${i} heeft geen geldig of een dubbel id` };
    ids.add(id);
    const so = b['soorten'];
    if (!Array.isArray(so) || so.length === 0 || so.length > 3 || so.some((s) => !(BRON_SOORTEN as readonly unknown[]).includes(s)) || new Set(so).size !== so.length) {
      return { ok: false, reden: `kamer ${kamer}: wat er hangt is een of meer van ${BRON_SOORTEN.join(', ')}` };
    }
    const soorten = so as BronSoort[];
    const aan = b['aan'];
    if (!(BRON_AAN as readonly unknown[]).includes(aan)) return { ok: false, reden: `kamer ${kamer}: aan is ${BRON_AAN.join(', ')}` };
    const ap = b['apparaat'];
    if (ap !== undefined && ap !== null && (typeof ap !== 'string' || ap.length === 0 || ap.length > 120)) return { ok: false, reden: `kamer ${kamer}: het apparaat van bron ${id} klopt niet` };
    const slim = isElektrischSlim({ soorten, aan: aan as BronAan });
    const vw = b['vermogenW'];
    let vermogenW: number | undefined;
    if (vw !== undefined && vw !== null) {
      if (typeof vw !== 'number' || !Number.isInteger(vw) || vw < 50 || vw > 10_000) return { ok: false, reden: `kamer ${kamer}: het vermogen is een heel getal van 50 tot 10.000 watt` };
      // Met de hand of niet elektrisch: dan doet het huis niets met een vermogen.
      if (slim) vermogenW = vw;
    }
    const opZon = b['opZon'] === true && slim && vermogenW != null && aan !== 'hand';
    bronnen.push({
      id,
      soorten,
      aan: aan as BronAan,
      ...(aan !== 'hand' && typeof ap === 'string' ? { apparaat: ap } : {}),
      ...(vermogenW != null ? { vermogenW } : {}),
      ...(opZon ? { opZon: true } : {}),
    });
  }
  return { ok: true, bronnen };
}

/** Hoe ver een zone mag doorwarmen op zon, boven het doel van verwarmen. */
export const OP_ZON_BAND_C = 1;

/**
 * Een elektrische bron die op zon mag (besluit 132), over de ruwe
 * configuratie: het apparaat van de regeling dat hem schakelt, mag ook op zon
 * over draaien en rekent met het vermogen; zijn zone buffert. Alleen voor een
 * apparaat dat in de zone van die kamer zit en kan verwarmen.
 */
export function withHeatSources(
  raw: Record<string, unknown>,
  kamers: readonly { readonly regelzone: string | null; readonly bronnen?: readonly Warmtebron[] }[] | null,
): { raw: Record<string, unknown>; toegevoegd: string[] } {
  if (!kamers) return { raw, toegevoegd: [] };
  const toegevoegd: string[] = [];
  const actuators = Array.isArray(raw['actuators']) ? (raw['actuators'] as Record<string, unknown>[]) : [];
  const zones = Array.isArray(raw['zones']) ? (raw['zones'] as Record<string, unknown>[]) : [];
  const opZon = new Map<string, { zone: string; vermogenW: number }>();
  for (const k of kamers) {
    if (!k.regelzone) continue;
    const zone = zones.find((z) => z['id'] === k.regelzone);
    const inZone = Array.isArray(zone?.['actuatorIds']) ? (zone['actuatorIds'] as unknown[]) : [];
    for (const b of k.bronnen ?? []) {
      if (!b.opZon || b.vermogenW == null || !b.apparaat || !inZone.includes(b.apparaat)) continue;
      const a = actuators.find((x) => x['id'] === b.apparaat);
      const caps = a?.['capabilities'] as Record<string, unknown> | undefined;
      if (caps?.['canHeat'] !== true) continue;
      opZon.set(b.apparaat, { zone: k.regelzone, vermogenW: b.vermogenW });
    }
  }
  if (opZon.size === 0) return { raw, toegevoegd: [] };
  const nieuweActuators = actuators.map((a) => {
    const z = opZon.get(String(a['id']));
    if (!z) return a;
    toegevoegd.push(`${String(a['name'] ?? a['id'])} op zon, ${z.vermogenW} W`);
    const power = { ...((a['power'] as Record<string, unknown> | undefined) ?? {}), estimatedW: z.vermogenW };
    return { ...a, onSurplus: true, power };
  });
  const bufferZones = new Set([...opZon.values()].map((z) => z.zone));
  const nieuweZones = zones.map((z) => {
    if (!bufferZones.has(String(z['id']))) return z;
    const buf = (z['buffering'] as Record<string, unknown> | undefined) ?? {};
    if (buf['enabled'] === true && Number(buf['bandC']) > 0) return z;
    return { ...z, buffering: { ...buf, enabled: true, bandC: OP_ZON_BAND_C } };
  });
  return { raw: { ...raw, actuators: nieuweActuators, zones: nieuweZones }, toegevoegd };
}
