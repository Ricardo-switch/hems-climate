/**
 * Bijwerken vanuit de app (21 oktober 2026). In de add-on ziet de app zelf
 * dat er een nieuwe versie klaarstaat: Home Assistant heeft voor elke add-on
 * een `update.`-entiteit, met de versie die er is en de nieuwste. Dan staat er
 * een melding; een tik geeft wat er nieuw is en een knop Bijwerken.
 *
 * Wat er nieuw is, komt uit `addon/CHANGELOG.md`. Dat bestand maakt
 * `changelog()` uit `NIEUW` in version.ts (een test houdt ze gelijk); de
 * Supervisor leest het van GitHub, en Home Assistant geeft het als
 * releasenotes van de nieuwste versie (`update/release_notes`). Zo kent de app
 * ook wat er in een versie staat die hij zelf nog niet heeft.
 *
 * Bijwerken is een smalle schrijfdeur: `update.install` op de eigen
 * `update.`-entiteit, verder niets, en alleen voor de beheerder. Alleen in de
 * add-on; de NAS rolt zichzelf uit (besluit 152). Alles hier is zuiver.
 */

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { Nieuw } from '../version.js';

/** De naam van de add-on, zoals Home Assistant hem als titel van de update geeft. */
export const ADDON_NAAM = 'Smart Climate';

/** De update-entiteit van de eigen add-on, of null. */
export function eigenUpdate(states: Iterable<HaEntityState>): HaEntityState | null {
  for (const s of states) {
    if (!/^update\.[a-z0-9_]+$/.test(s.entity_id)) continue;
    if (s.attributes['title'] === ADDON_NAAM) return s;
  }
  return null;
}

/** Is versie a nieuwer dan b? Versies als 0.46.1. */
export function nieuwer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x !== y) return x > y;
  }
  return false;
}

const KOPPEN = [['nieuw', 'Nieuw'], ['beter', 'Beter'], ['opgelost', 'Opgelost']] as const;
const DATUM = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** `addon/CHANGELOG.md` uit `NIEUW`: per versie de datum en wat nieuw, beter en opgelost is. */
export function changelog(nieuw: readonly Nieuw[]): string {
  const delen = nieuw.map((n) => {
    const regels = [`## ${n.versie}`, '', `*${DATUM.format(Date.parse(`${n.datum}T12:00:00Z`))}*`];
    for (const [k, kop] of KOPPEN) {
      const lijst = n[k] ?? [];
      if (lijst.length) regels.push('', `**${kop}**`, '', ...lijst.map((x) => `- ${x}`));
    }
    return regels.join('\n');
  });
  return `# Wat is er nieuw\n\n${delen.join('\n\n')}\n`;
}

export interface Notitie {
  readonly versie: string;
  readonly nieuw: readonly string[];
  readonly beter: readonly string[];
  readonly opgelost: readonly string[];
}

/** Leest de changelog terug, per versie; wat het niet herkent, slaat het over. */
export function leesChangelog(md: string): Notitie[] {
  const uit: { versie: string; nieuw: string[]; beter: string[]; opgelost: string[] }[] = [];
  let soort: 'nieuw' | 'beter' | 'opgelost' | null = null;
  for (const ruw of md.split(/\r?\n/)) {
    const regel = ruw.trim();
    const v = /^##\s+v?(\d+\.\d+\.\d+)\b/.exec(regel);
    if (v) {
      uit.push({ versie: v[1]!, nieuw: [], beter: [], opgelost: [] });
      soort = null;
      continue;
    }
    const kop = /^\*\*(Nieuw|Beter|Opgelost)\*\*$/i.exec(regel);
    if (kop) {
      soort = kop[1]!.toLowerCase() as 'nieuw' | 'beter' | 'opgelost';
      continue;
    }
    const punt = /^[-*]\s+(.+)$/.exec(regel);
    if (punt && soort && uit.length) uit.at(-1)![soort].push(punt[1]!);
  }
  return uit;
}

export interface UpdateView {
  /** Staat er een nieuwere versie klaar? */
  readonly beschikbaar: boolean;
  readonly nu: string;
  readonly nieuwste: string | null;
  /** Wordt er nu bijgewerkt? */
  readonly bezig: boolean;
  /** Wat er nieuw is in elke versie na die van nu, de nieuwste eerst. */
  readonly notities: readonly Notitie[];
  /** Mag wie kijkt bijwerken (de beheerder)? */
  readonly magBijwerken: boolean;
}

/** Wat de app laat zien: uit de update-entiteit en de releasenotes van de nieuwste versie. */
export function updateView(nu: string, s: HaEntityState | null, releaseNotes: string | null, magBijwerken: boolean): UpdateView {
  const nieuwste = typeof s?.attributes['latest_version'] === 'string' ? (s.attributes['latest_version'] as string).replace(/^v/, '') : null;
  const beschikbaar = s?.state === 'on' && nieuwste != null && nieuwer(nieuwste, nu);
  const notities = beschikbaar && releaseNotes ? leesChangelog(releaseNotes).filter((n) => nieuwer(n.versie, nu) && !nieuwer(n.versie, nieuwste!)) : [];
  return { beschikbaar, nu, nieuwste, bezig: s?.attributes['in_progress'] === true, notities, magBijwerken };
}
