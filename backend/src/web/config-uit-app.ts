/**
 * De configuratie met alles wat de app erover legt: de aansluiting (besluit
 * 103), de regeling per kamer (138), meten met (123), wat er per kamer warmt
 * (132), comfort (130) en comfort per bewoner (147). Bij het starten, en
 * meteen als de bewoner iets verandert: dan neemt de regeling het over zonder
 * herstart.
 *
 * Stond in main.ts (besluit 180, verder geknipt op 23 oktober 2026); hier
 * zuiver: het bestand lezen en de stand van nu geeft main mee.
 */

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import { parseSiteConfig } from '../config/schema.js';
import type { OccupancySource, SiteConfig } from '../core/model.js';
import { withConnection, type Applied, type ConnectionAnswers } from './aansluiting.js';
import { profielenVoor, type Bewoners } from './bewoners.js';
import { withComfort, type Comfort } from './comfort.js';
import type { Layout } from './layout.js';
import { withMeasurement } from './meten.js';
import { doelenBinnenBereik, withRegeling } from './regeling.js';
import { withHeatSources } from './warmte.js';

export interface UitDeApp {
  /** De antwoorden over de aansluiting bij het starten, en wat die toevoegden. */
  readonly aansluiting: ConnectionAnswers | null;
  readonly aansluitingToegevoegd: Pick<Applied, 'toegevoegd'>;
  /** De indeling van nu. */
  readonly layout: Layout | null;
  readonly state: (id: string) => HaEntityState | undefined;
  readonly vermogenSensor: (entityId: string) => string | null;
  readonly comfort: Comfort | null;
  readonly bewoners: Bewoners;
  readonly occupancy: readonly OccupancySource[];
  readonly strategieen: readonly string[];
  /** Voor wat er niet over te nemen viel, zoals een regeling die een apparaat mist. */
  readonly waarschuw?: (tekst: string) => void;
}

/** De ruwe configuratie met alles wat de app erover legt, getoetst. */
export function configUitDeApp(base: Record<string, unknown>, i: UitDeApp): { ok: true; config: SiteConfig; toegevoegd: string[] } | { ok: false; reden: string } {
  const metAansluiting = i.aansluiting && i.aansluitingToegevoegd.toegevoegd.length ? withConnection(base, i.aansluiting).raw : base;
  const layout = i.layout;
  // De regeling per kamer uit de app (besluit 138): welke apparaten een kamer regelen, en hoe.
  const metRegeling = withRegeling(metAansluiting, layout?.kamers ?? null, {
    state: i.state,
    vermogenSensor: i.vermogenSensor,
    kamerVan: (id) => layout?.apparaten[id]?.kamer ?? null,
  });
  for (const t of metRegeling.overgeslagen) i.waarschuw?.(`Regeling uit de app: ${t}`);
  // Meten met (besluit 123) uit de indeling van nu: de regeling neemt een andere sensor meteen over (138).
  const metMeten = withMeasurement(metRegeling.raw, layout).raw;
  // De bronnen per kamer (besluit 132): uit de indeling van nu, want op zon gaat meteen in.
  const metBronnen = withHeatSources(metMeten, layout?.kamers ?? null);
  const metComfort = withComfort(metBronnen.raw, i.comfort);
  // Comfort per bewoner (besluit 147): de profielen op volgorde, en "toch die van" als iemand dat koos.
  const zoneIds = new Set((Array.isArray(metComfort.raw['zones']) ? (metComfort.raw['zones'] as Record<string, unknown>[]) : []).map((z) => String(z['id'])));
  const profiles = profielenVoor(i.bewoners, i.comfort, i.occupancy, zoneIds);
  if (profiles.length > 0) {
    metComfort.raw = { ...metComfort.raw, profiles, ...(i.bewoners.vasthouden ? { profileHold: { id: i.bewoners.vasthouden.id, home: i.bewoners.vasthouden.home } } : {}) };
    metComfort.toegevoegd.push(`comfort per bewoner: ${profiles.map((x) => x.name).join(', ')}`);
  }
  // Een kamer die een apparaat kwijtraakte (besluit 138): doelen binnen wat de apparaten kunnen.
  const checked = parseSiteConfig(metRegeling.toegevoegd.length || (layout?.kamers ?? []).some((k) => k.rollen) ? doelenBinnenBereik(metComfort.raw) : metComfort.raw, { knownStrategies: i.strategieen });
  if (!checked.ok) return { ok: false, reden: `${checked.problems[0]?.path ?? ''} ${checked.problems[0]?.message ?? 'past niet'}`.trim() };
  return { ok: true, config: checked.config, toegevoegd: [...metRegeling.toegevoegd, ...metBronnen.toegevoegd, ...metComfort.toegevoegd] };
}
