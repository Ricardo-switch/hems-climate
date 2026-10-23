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

/*
 * Dezelfde vragen in het Engels (besluit 185, stap 9 deel 6). Ook hier geen
 * zinnen die Home Assistant zelf kent en uitvoert, zoals "turn off the attic"
 * of "what is the temperature in the attic".
 */
const NU_EN = [
  'what (are you|is smart climate|is the control) doing <nu>',
  'how (is|are) (the climate|the house|the control|the air conditioners|the heating) doing <nu>',
  '(give|tell) me [a] [short] (overview|status|update) [of] [the climate|the house]',
  'climate status',
  'status of the climate',
  'what is (running|going on) <nu>',
  'what is happening [in the house] <nu>',
];
const WAAROM_EN = [
  'why (is|are) <kamer> [not] (running|cooling|heating|on|off) <nu>',
  'why is the (air conditioner|aircon|heating|thermostat) <in_kamer> [not] (running|cooling|heating|on|off) <nu>',
  'why is it [so] (warm|cold|hot|chilly) <in_kamer>',
  'why is (nothing|something) happening <in_kamer>',
  'why (are you|is smart climate) [not] doing (anything|nothing) <in_kamer>',
  'what is (happening|going on) <in_kamer>',
  'how is <kamer> doing',
  '(explain|tell me) (what|why) [it] is (happening|running) <in_kamer>',
  'why <kamer>',
  'explain <kamer>',
];
const STRAKS_EN = [
  'what (are you|is smart climate|is the control) going to do [later|tonight|next|today]',
  'what (is|are) [the|your] plan[s] [for] [later|tonight|today]',
  'what (comes|is) next',
  'when (are you|is the control) going to [the] (night|day) [mode|setting]',
  'what is planned',
];
const ZON_EN = [
  'how much (sun|solar|solar power|electricity|energy) (have we|did we|did i|has been) (generated|produced|made) [today]',
  'how much (have|did) <panelen> (produced|produce|generated|generate|delivered|deliver) [today]',
  'what (are|is) <panelen> (doing|producing) <nu>',
  '[what is the] (output|yield) [of] <panelen> [today]',
  'how much (are we|did we|am i) (exporting|export) [today]',
  'how are <panelen> doing',
  'solar [power] [today]',
];
const KOELEN_EN = [
  'cool [down] <kamer> [to {temperatuur} [degrees]]',
  'make <kamer> (cooler|colder)',
  '(can|will) (you|smart climate) cool [down] <kamer> [to {temperatuur} [degrees]]',
];
const VERWARMEN_EN = [
  'heat [up] <kamer> [to {temperatuur} [degrees]]',
  'warm up <kamer> [to {temperatuur} [degrees]]',
  'make <kamer> warmer',
  '(can|will) (you|smart climate) (heat|warm) [up] <kamer> [to {temperatuur} [degrees]]',
];
const UIT_EN = ['can <kamer> [go] off', 'smart climate switch off <kamer>', '(can|may) the air conditioner <in_kamer> [go] off'];

/** De zinnen en de woorden eromheen, per taal. */
const TAAL = {
  nl: {
    regels: {
      kamer: '[de|het] {kamer}',
      in_kamer: '[in|op|van] [de|het] {kamer}',
      sc: '(je|jij|smart climate|het systeem|de regeling|het klimaat)',
      nu: '[nu|op dit moment|momenteel|eigenlijk]',
      panelen: '[de] (zonnepanelen|panelen)',
    },
    zinnen: { nu: NU, waarom: WAAROM, straks: STRAKS, zon: ZON, koelen: KOELEN, verwarmen: VERWARMEN, uit: UIT },
    geenKamer: 'geen kamer bekend',
  },
  en: {
    regels: {
      kamer: '[the] {kamer}',
      in_kamer: '[in|on|of] [the] {kamer}',
      sc: '(you|smart climate|the system|the control|the climate)',
      nu: '[now|right now|at the moment|currently]',
      panelen: '[the] [solar] panels',
    },
    zinnen: { nu: NU_EN, waarom: WAAROM_EN, straks: STRAKS_EN, zon: ZON_EN, koelen: KOELEN_EN, verwarmen: VERWARMEN_EN, uit: UIT_EN },
    geenKamer: 'no room known',
  },
} as const;

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

/** Het zinnenbestand in een taal, als gegevens; de integratie schrijft het weg. */
export function zinnenVoor(lang: keyof typeof TAAL, kamers: readonly AssistKamer[]): Record<string, unknown> {
  const t = TAAL[lang];
  const lijst = kamerlijst(kamers);
  return {
    language: lang,
    expansion_rules: t.regels,
    intents: {
      [INTENTIE]: {
        data: [
          { sentences: t.zinnen.nu, slots: { vraag: 'nu' } },
          { sentences: t.zinnen.waarom, slots: { vraag: 'waarom' } },
          { sentences: t.zinnen.straks, slots: { vraag: 'straks' } },
          { sentences: t.zinnen.zon, slots: { vraag: 'zon' } },
          // Een opdracht: tijdens het meekijken zegt Smart Climate wat hij zou doen. Er gaat niets naar de airco.
          { sentences: t.zinnen.koelen, slots: { vraag: 'doe', wens: 'koelen' } },
          { sentences: t.zinnen.verwarmen, slots: { vraag: 'doe', wens: 'verwarmen' } },
          { sentences: t.zinnen.uit, slots: { vraag: 'doe', wens: 'uit' } },
        ],
      },
    },
    lists: {
      // Zonder kamers een woord dat niemand zegt: een lege lijst laat Home Assistant het bestand weigeren.
      kamer: { values: lijst.length ? lijst : [{ in: t.geenKamer, out: '' }] },
      temperatuur: { range: { from: 10, to: 35 } },
    },
  };
}

/** Het zinnenbestand in het Nederlands. */
export const zinnenNl = (kamers: readonly AssistKamer[]): Record<string, unknown> => zinnenVoor('nl', kamers);
