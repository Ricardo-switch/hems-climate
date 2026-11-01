/**
 * Eén stap van een geplande opdracht uitvoeren, op zijn moment (besluit 218,
 * en sinds besluit 240 ook klimaat met de hand en witgoed). Dezelfde deuren als
 * op de pagina, alleen wat aan staat: een deur die er niet is (uit bij
 * Functies, of niet in de add-on) geeft null, en dan komt het in het logboek.
 */

import type { Stap } from './brein.js';
import type { HandTot } from './gepland.js';
import { totWanneer } from './klimaatbrug.js';

type Uitkomst = { readonly ok: boolean; readonly reden?: string };

export interface GeplandeDeuren {
  readonly licht?: ((body: unknown) => Promise<Uitkomst>) | null;
  readonly scene?: ((body: unknown) => Promise<Uitkomst>) | null;
  readonly scherm?: ((body: unknown) => Promise<Uitkomst>) | null;
  /** Klimaat met de hand (besluit 235); alleen als die bij Functies aan staat. */
  readonly hand?: {
    readonly zet: (id: string, modus: 'verwarmen' | 'koelen', doelC: number, totMs: number, totDoel: boolean) => Promise<Uitkomst>;
    readonly zetKnop: (id: string, doelC: number, totMs: number, totDoel: boolean) => Promise<Uitkomst>;
    readonly schakelAan: (id: string, totMs: number) => Promise<Uitkomst>;
    readonly isKnop: (id: string) => boolean;
  } | null;
  /** Witgoed starten (besluit 238). */
  readonly witgoed?: ((id: string) => Promise<Uitkomst>) | null;
  readonly tz: string;
}

/** Tot wanneer klimaat met de hand duurt: een of twee uur, of het eind van het dagdeel (ook bij tot het doel). */
export function handTotMs(tot: HandTot, nuMs: number, tz: string): number {
  if (tot === 'uur1') return nuMs + 3_600_000;
  if (tot === 'uur2') return nuMs + 7_200_000;
  return totWanneer(null, nuMs, tz, false);
}

export async function voerStapUit(s: Stap, d: GeplandeDeuren, nuMs = Date.now()): Promise<Uitkomst | null> {
  if (s.pad === 'api/licht') return d.licht ? d.licht(s.body) : null;
  if (s.pad === 'api/scene') return d.scene ? d.scene(s.body) : null;
  if (s.pad === 'api/scherm') return d.scherm ? d.scherm(s.body) : null;
  if (s.pad === 'api/witgoed') return d.witgoed ? d.witgoed(String(s.body['id'])) : null;
  if (s.pad === 'api/hand') {
    if (!d.hand) return null;
    const id = String(s.body['id']);
    const tot = s.body['tot'] as HandTot;
    const totMs = handTotMs(tot, nuMs, d.tz);
    const totDoel = tot === 'doel';
    if (id.startsWith('switch.')) return d.hand.schakelAan(id, totMs);
    const doel = Number(s.body['doelC']);
    if (d.hand.isKnop(id)) return d.hand.zetKnop(id, doel, totMs, totDoel);
    return d.hand.zet(id, s.body['modus'] === 'koelen' ? 'koelen' : 'verwarmen', doel, totMs, totDoel);
  }
  return null;
}
