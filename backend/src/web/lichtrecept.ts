/**
 * Licht dat meteen goed voelt (besluit 209): wie "doe het licht in de keuken
 * aan" zegt of "het is donker in de keuken", krijgt licht dat past bij het
 * moment, niet de stand van de vorige keer. Overdag helder en neutraal wit
 * (het is donker in de kamer, dus vol), 's avonds warm en wat zachter, laat
 * op de avond en 's nachts warm en zacht, zodat je niet verblind wordt.
 *
 * Alleen als het licht uit is: een lamp die al aan staat, houdt zijn stand.
 * Een helderheid of tint die je zelf noemt, gaat altijd voor.
 */

import type { WeatherKind } from './weather.js';

export type Lichtmoment = 'dag' | 'grijs' | 'schemer' | 'avond' | 'laat' | 'nacht';

export interface Lichtrecept {
  readonly moment: Lichtmoment;
  readonly helderheidPct: number;
  readonly kleur: 'warm' | 'neutraal';
}

/** Per moment: hoe fel, en welk wit. */
const RECEPT: Readonly<Record<Lichtmoment, Omit<Lichtrecept, 'moment'>>> = {
  dag: { helderheidPct: 100, kleur: 'neutraal' },
  grijs: { helderheidPct: 100, kleur: 'neutraal' },
  schemer: { helderheidPct: 80, kleur: 'warm' },
  avond: { helderheidPct: 70, kleur: 'warm' },
  laat: { helderheidPct: 45, kleur: 'warm' },
  nacht: { helderheidPct: 20, kleur: 'warm' },
};

/** Het uur van de dag in de tijdzone van het huis, met minuten als breuk. */
function uurVan(nuMs: number, tijdzone: string): number {
  const d = new Intl.DateTimeFormat('en-GB', { timeZone: tijdzone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(nuMs));
  const uur = Number(d.find((p) => p.type === 'hour')?.value ?? 0);
  const min = Number(d.find((p) => p.type === 'minute')?.value ?? 0);
  return uur + min / 60;
}

/**
 * Het recept voor nu. `zonHoogteDeg` is hoe hoog de zon staat (null als de
 * ligging onbekend is: dan alleen de klok), `weer` het weer van nu.
 */
export function lichtRecept(o: { readonly nuMs: number; readonly tijdzone: string; readonly zonHoogteDeg: number | null; readonly weer: WeatherKind | null }): Lichtrecept {
  const uur = uurVan(o.nuMs, o.tijdzone);
  const moment = ((): Lichtmoment => {
    // De nacht en laat op de avond gaan voor: dan wil je geen vol licht, wat de zon ook doet.
    if (uur >= 23.5 || uur < 6) return 'nacht';
    if (uur >= 22) return 'laat';
    const h = o.zonHoogteDeg;
    if (h == null) return uur >= 18 ? 'avond' : uur < 8 ? 'schemer' : 'dag';
    if (h < -4) return uur < 12 ? 'schemer' : 'avond';
    if (h < 6) return 'schemer';
    return o.weer === 'bewolkt' || o.weer === 'regen' || o.weer === 'onweer' || o.weer === 'mist' || o.weer === 'sneeuw' ? 'grijs' : 'dag';
  })();
  return { moment, ...RECEPT[moment] };
}

/** "voor de avond", in de zin die het huis erbij zegt. */
export function momentWoorden(m: Lichtmoment, nl: boolean): string {
  return nl
    ? { dag: 'helder voor overdag', grijs: 'helder, het is grijs buiten', schemer: 'warm voor de schemer', avond: 'warm voor de avond', laat: 'zacht en warm voor de late avond', nacht: 'zacht voor de nacht' }[m]
    : { dag: 'bright for daytime', grijs: 'bright, it is grey outside', schemer: 'warm for dusk', avond: 'warm for the evening', laat: 'soft and warm for late evening', nacht: 'soft for the night' }[m];
}

/** Avond en later: dan stelt het huis bij aan de sfeerverlichting voor. */
export const SFEERMOMENT: ReadonlySet<Lichtmoment> = new Set(['avond', 'laat']);
