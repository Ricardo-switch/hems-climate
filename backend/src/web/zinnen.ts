/*
 * De zinnen voor Assist (besluit 184), voor dit huis.
 *
 * Assist herkent alleen zinnen uit een bestand in `custom_sentences/<taal>/`
 * van Home Assistant. De integratie Smart Climate schrijft daar één eigen
 * bestand en houdt het bij; wat erin staat, komt van hier (`/api/assist`).
 * Zo komt een nieuwe zin, of een betere herkenning, met een gewone update van
 * de add-on, en hoeft de integratie zelf bijna nooit bij.
 *
 * Alles gaat naar één intentie, `SmartClimateVraag`, met de soort vraag als
 * vaste waarde: `nu`, `waarom`, `straks`, `zon` of `doe`. Bewust niet: zinnen
 * die Home Assistant zelf ook kent en dan uitvoert, zoals "zet de zolder uit";
 * dan schakelt Assist echt, buiten de regeling om (ONTWERP §7).
 */

import type { AssistKamer } from './assist.js';
import { alsWoord } from './assist.js';

export const INTENTIE = 'SmartClimateVraag';

const NU = [
  'wat (doe|doet) <sc> <nu>',
  'wat (ben je|is smart climate) <nu> aan het doen',
  "hoe staat [het] [er] [met] (het klimaat|het huis|de regeling|de airco's|de verwarming) [ervoor] <nu>",
  '(geef|vertel) [me] [een] [kort] (overzicht|status|update) [van] [het klimaat|het huis]',
  'klimaat status',
  'status [van het] klimaat',
  'wat (draait|staat aan|is er aan de hand) [er] <nu>',
  'wat gebeurt er <nu> [in huis]',
];
const WAAROM = [
  'waarom (draait|koelt|verwarmt|staat) <kamer> [niet] [aan|uit] <nu>',
  'waarom (draait|koelt|verwarmt|staat) de (airco|verwarming|thermostaat) <in_kamer> [niet] [aan|uit] <nu>',
  'waarom (is|wordt) het [zo] (warm|koud|heet|fris) <in_kamer>',
  'waarom gebeurt er [niets|niks|iets] <in_kamer>',
  'waarom (doe|doet) <sc> [niets|niks] <in_kamer>',
  'wat (doet|is er met) [de airco] <in_kamer>',
  'hoe staat [het] [er] [met] <kamer> [ervoor]',
  '(leg|vertel) [me] [eens] uit (wat|waarom) [er] <in_kamer> [gebeurt|draait]',
  'waarom <kamer>',
  'uitleg <kamer>',
];
const STRAKS = [
  'wat (ga je|gaat smart climate|gaat de regeling) [straks|vanavond|vannacht|hierna|vandaag|zo] doen',
  'wat (is|zijn) [het|je] plan[nen] [voor] [straks|vanavond|vannacht|vandaag]',
  'wat komt er [straks|hierna]',
  'wanneer (ga je|gaat het|gaat de regeling) naar [de] (nacht|nachtstand|dag|dagstand)',
  'wat (staat er|is er) gepland',
];
const ZON = [
  'hoeveel (zon|zonnestroom|stroom|energie) [hebben we|heb ik|is er] vandaag [opgewekt|geleverd|gehad|gemaakt]',
  'hoeveel (hebben|leveren|leverden) <panelen> [vandaag] [al] [op]geleverd',
  'wat (leveren|doen|deden) <panelen> <nu>',
  '[wat is de] opbrengst [van] <panelen> [vandaag]',
  'hoeveel (lever ik|leveren we|leverden we) [vandaag] terug',
  'hoe (gaat het met|staat het met) <panelen>',
  'zonnestroom [vandaag]',
];
const KOELEN = [
  'koel <kamer> [af] [naar|op|tot] [{temperatuur} [graden]]',
  'maak <kamer> (koeler|kouder|koel|frisser)',
  '(kan|wil) <sc> <kamer> [even] (koelen|afkoelen) [naar|tot] [{temperatuur} [graden]]',
  'laat <kamer> [even] (koelen|afkoelen) [naar|tot] [{temperatuur} [graden]]',
];
const VERWARMEN = [
  'verwarm <kamer> [naar|op|tot] [{temperatuur} [graden]]',
  'maak <kamer> (warmer|warm)',
  '(kan|wil) <sc> <kamer> [even] (verwarmen|opwarmen) [naar|tot] [{temperatuur} [graden]]',
  'laat <kamer> [even] (verwarmen|opwarmen) [naar|tot] [{temperatuur} [graden]]',
];
const UIT = ['mag <kamer> uit', 'smart climate zet <kamer> uit', '(kan|mag) de airco <in_kamer> uit'];

/** De lijst `kamer`: per zone de naam en zijn andere woorden, uit naar het id van de zone. Een woord hoort bij één kamer. */
export function kamerlijst(kamers: readonly AssistKamer[]): { in: string; out: string }[] {
  const gezien = new Set<string>();
  const uit: { in: string; out: string }[] = [];
  for (const k of kamers) {
    const woorden = [...new Set([alsWoord(k.naam), ...k.woorden.map(alsWoord)])].filter((w) => w && !gezien.has(w));
    if (!woorden.length || !k.id) continue;
    for (const w of woorden) gezien.add(w);
    uit.push({ in: woorden.length === 1 ? woorden[0]! : `(${woorden.join('|')})`, out: k.id });
  }
  return uit;
}

/** Het zinnenbestand in het Nederlands, als gegevens; de integratie schrijft het weg. */
export function zinnenNl(kamers: readonly AssistKamer[]): Record<string, unknown> {
  const lijst = kamerlijst(kamers);
  return {
    language: 'nl',
    expansion_rules: {
      kamer: '[de|het] {kamer}',
      in_kamer: '[in|op|van] [de|het] {kamer}',
      sc: '(je|jij|smart climate|het systeem|de regeling|het klimaat)',
      nu: '[nu|op dit moment|momenteel|eigenlijk]',
      panelen: '[de] (zonnepanelen|panelen)',
    },
    intents: {
      [INTENTIE]: {
        data: [
          { sentences: NU, slots: { vraag: 'nu' } },
          { sentences: WAAROM, slots: { vraag: 'waarom' } },
          { sentences: STRAKS, slots: { vraag: 'straks' } },
          { sentences: ZON, slots: { vraag: 'zon' } },
          // Een opdracht: tijdens het meekijken zegt Smart Climate wat hij zou doen. Er gaat niets naar de airco.
          { sentences: KOELEN, slots: { vraag: 'doe', wens: 'koelen' } },
          { sentences: VERWARMEN, slots: { vraag: 'doe', wens: 'verwarmen' } },
          { sentences: UIT, slots: { vraag: 'doe', wens: 'uit' } },
        ],
      },
    },
    lists: {
      // Zonder kamers een woord dat niemand zegt: een lege lijst laat Home Assistant het bestand weigeren.
      kamer: { values: lijst.length ? lijst : [{ in: 'geen kamer bekend', out: '' }] },
      temperatuur: { range: { from: 10, to: 35 } },
    },
  };
}
