/**
 * De woordzoeker van de assistent (besluit 115): een vraag in eigen woorden,
 * zonder taalmodel. Hij zoekt woorden en kamernamen in de tekst en kiest:
 *
 * - een vraag over het huis, die de vaste vragen van de assistent beantwoorden
 *   ("wat doe je nu", "waarom de zolder", "hoeveel zon", "koel de zolder");
 * - een vraag over de app ("waar vul ik de prijzen in?"), met een kort antwoord
 *   en een knop naar de pagina waar het kan;
 * - of niets, en dan een paar voorbeelden van wat wel kan.
 *
 * Alles hier is vast en getest; de tekst van de bewoner wordt niet bewaard en
 * niet gelogd.
 */

import type { SiteConfig } from '../core/model.js';
import type { Lang, Question, Wish } from './assistant.js';

/** Hoe lang een vraag mag zijn. */
export const MAX_TEKST = 200;

export interface Verwijzing {
  readonly href: string;
  readonly label: string;
}

export type Begrepen =
  | { readonly soort: 'huis'; readonly vraag: Question }
  | { readonly soort: 'app'; readonly onderwerp: string; readonly antwoord: string; readonly link: Verwijzing }
  | { readonly soort: 'onbekend'; readonly antwoord: string; readonly voorbeelden: readonly string[] };

/** Kleine letters, zonder accenten en leestekens; woorden met één spatie ertussen. */
export function gewoon(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9,]+/g, ' ')
    .replace(/,(?!\d)|(?<!\d),/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Een woord met een sterretje is een begin ("prijs*" past op prijzen); een
 * woord met een spatie is een stukje zin; de rest moet precies kloppen.
 */
function telt(woorden: readonly string[], tekst: string, los: readonly string[]): number {
  let n = 0;
  for (const w of woorden) {
    if (w.includes(' ')) {
      if (` ${tekst} `.includes(` ${w} `)) n += 1;
    } else if (w.endsWith('*')) {
      const begin = w.slice(0, -1);
      if (los.some((t) => t.startsWith(begin))) n += 1;
    } else if (los.includes(w)) n += 1;
  }
  return n;
}

/* --------------------------------------------------------- over de app */

interface Onderwerp {
  readonly id: string;
  readonly href: string;
  /** Sterke woorden tellen dubbel. */
  readonly sterk: readonly string[];
  readonly zwak: readonly string[];
  readonly nl: { readonly antwoord: string; readonly label: string };
  readonly en: { readonly antwoord: string; readonly label: string };
}

const ONDERWERPEN: readonly Onderwerp[] = [
  {
    id: 'indeling',
    href: 'indeling.html',
    sterk: ['indeling', 'plattegrond', 'etage*', 'verdieping*', 'buitenruimte*', 'layout', 'floor', 'floors'],
    zwak: ['kamer toevoegen', 'kamers', 'ruimte*', 'tuin', 'oprit', 'terras', 'balkon', 'voortuin', 'zolder toevoegen', 'kelder', 'rooms'],
    nl: {
      antwoord:
        'De indeling pas je aan bij Instellingen, onder Indeling. Daar sleep je een apparaat naar een andere kamer, voeg je een etage toe of haal je er een weg, en kies je wat er buiten is, zoals een tuin of een oprit.',
      label: 'Naar Indeling',
    },
    en: {
      antwoord:
        'You change the layout under Settings, Layout. Drag a device to another room, add or remove a floor, and choose what is outside, such as a garden or a driveway.',
      label: 'Go to Layout',
    },
  },
  {
    id: 'prijzen',
    href: 'meters.html',
    sterk: ['prijs*', 'prijzen', 'tarief*', 'daltarief', 'dal', 'normaal tarief', 'netbeheer*', 'vastrecht', 'vaste kosten', 'contract', 'energieprijs*', 'stroomprijs*', 'gasprijs*', 'salder*', 'teruglever*', 'energiebelasting', 'price*', 'tariff*'],
    zwak: ['kosten', 'meter', 'meters', 'kwh', 'gas', 'stroom', 'energie', 'leverancier', 'rekening'],
    nl: {
      antwoord:
        'De prijzen vul je in bij Instellingen, onder Meters en prijzen. Neem ze over van je contract: stroom normaal en dal, teruglevering, gas, en eventueel de vaste kosten per dag, maand of jaar.',
      label: 'Naar Meters en prijzen',
    },
    en: {
      antwoord:
        'You enter prices under Settings, Meters and prices. Copy them from your contract: electricity normal and off-peak, feed-in, gas, and if you like the fixed costs per day, month or year.',
      label: 'Go to Meters and prices',
    },
  },
  {
    id: 'aansluiting',
    href: 'aansluiting.html',
    sterk: ['zekering*', 'hoofdzekering*', 'aansluiting', 'fase*', 'ampere', 'omvormer', 'ligging', 'fuse*', 'connection'],
    zwak: ['panelen', 'zonnepanelen', 'dak', 'dakvlak*', 'netaansluiting'],
    nl: {
      antwoord:
        'Je aansluiting stel je in bij Instellingen, onder Zon en aansluiting: waar je panelen liggen, je hoofdzekering, je contract, en welke apparaten op zon mogen starten.',
      label: 'Naar Zon en aansluiting',
    },
    en: {
      antwoord:
        'You set up your connection under Settings, Sun and connection: where your panels are, your main fuse, your contract, and which devices may start on sun.',
      label: 'Go to Sun and connection',
    },
  },
  {
    id: 'functies',
    href: 'functies.html',
    sterk: ['camera*', 'deurbel*', 'bel', 'aanbellen', 'weerbericht', 'weer', 'buienradar', 'weerdienst', 'functie*', 'doorbell', 'weather'],
    zwak: ['beeld', 'videodeurbel', 'lampen bedienen', 'licht bedienen'],
    nl: {
      antwoord:
        'Camera’s, de deurbel, licht bedienen en het weer stel je in bij Instellingen, onder Functies. Daar kies je welke camera’s de app toont, wat er gebeurt als er wordt aangebeld, en waar het weer vandaan komt.',
      label: 'Naar Functies',
    },
    en: {
      antwoord:
        'Cameras, the doorbell, light control and the weather are under Settings, Features. Choose which cameras the app shows, what happens when someone rings, and where the weather comes from.',
      label: 'Go to Features',
    },
  },
  {
    id: 'inrichten',
    href: 'inrichten.html',
    sterk: ['inrichten', 'wizard', 'installeren', 'installatie', 'opzetten', 'beginnen', 'eerste keer', 'setup', 'set up'],
    zwak: ['stappen', 'begin'],
    nl: {
      antwoord:
        'Bij Inrichten loop je stap voor stap langs alles wat per huis anders is: je huis, klimaat, zon en aansluiting, meters en prijzen, en functies. Je vindt het bovenaan bij Instellingen.',
      label: 'Naar Inrichten',
    },
    en: {
      antwoord:
        'Setup walks you through everything that differs per house: your house, climate, sun and connection, meters and prices, and features. It is at the top of Settings.',
      label: 'Go to Setup',
    },
  },
  {
    id: 'inloggen',
    href: 'instellingen.html',
    sterk: ['inloggen', 'inlog*', 'aanmelden', 'uitloggen', 'wachtwoord', 'login', 'log in', 'sign in'],
    zwak: ['account', 'toegang'],
    nl: {
      antwoord:
        'Kijken kan zonder inloggen. Om te bedienen log je in met je account van Home Assistant, bij Instellingen.',
      label: 'Naar Instellingen',
    },
    en: {
      antwoord: 'Viewing works without logging in. To operate, log in with your Home Assistant account under Settings.',
      label: 'Go to Settings',
    },
  },
  {
    id: 'opbrengst',
    href: 'opbrengst.html',
    sterk: ['opbrengst', 'bespaard', 'besparing', 'bespaar*', 'verdiend', 'verdien*', 'terugverdien*', 'savings', 'saved'],
    zwak: ['oplevert', 'oplevering', 'geld', 'euro'],
    nl: {
      antwoord:
        'Wat de zon en het slimme schakelen opleveren, staat bij Opbrengst: per dag, week, maand en jaar, in kWh en in euro’s.',
      label: 'Naar Opbrengst',
    },
    en: {
      antwoord: 'What the sun and smart switching bring in is under Yield: per day, week, month and year, in kWh and in euros.',
      label: 'Go to Yield',
    },
  },
  {
    id: 'vandaag',
    href: 'vandaag.html',
    sterk: ['verbruik*', 'grafiek', 'tijdlijn', 'usage', 'consumption'],
    zwak: ['vandaag', 'today'],
    nl: {
      antwoord: 'Het verbruik en de zon van vandaag staan bij Vandaag, kwartier voor kwartier, met wat elk apparaat deed.',
      label: 'Naar Vandaag',
    },
    en: {
      antwoord: 'Today’s use and sun are under Today, quarter by quarter, with what each device did.',
      label: 'Go to Today',
    },
  },
  {
    id: 'apparaten',
    href: 'apparaten.html',
    sterk: ['apparaten', 'alle apparaten', 'devices'],
    zwak: ['lijst', 'overzicht'],
    nl: {
      antwoord: 'Alle apparaten staan bij Apparaten, per kamer, met wat ze nu doen.',
      label: 'Naar Apparaten',
    },
    en: {
      antwoord: 'All devices are under Devices, per room, with what they are doing now.',
      label: 'Go to Devices',
    },
  },
  {
    id: 'bedienen',
    href: 'thuis.html',
    sterk: ['bedien*', 'lamp aan', 'lamp uit', 'licht aan', 'licht uit', 'aanzetten', 'uitzetten', 'scene*', 'operate', 'control'],
    zwak: ['lamp', 'lampen', 'licht', 'screen', 'screens', 'thermostaat', 'lights'],
    nl: {
      antwoord:
        'Bedienen doe je in het huis op Thuis: tik op een kamer of een apparaat. Daarvoor moet je ingelogd zijn.',
      label: 'Naar Thuis',
    },
    en: {
      antwoord: 'You operate things in the house on Home: tap a room or a device. You need to be logged in.',
      label: 'Go to Home',
    },
  },
  {
    id: 'schakelen',
    href: 'instellingen.html',
    sterk: ['schaduw*', 'meekijken', 'echt schakelen', 'echt regelen', 'zelf regelen', 'bewijs', 'leert', 'leren', 'shadow'],
    zwak: ['slim', 'slimme'],
    nl: {
      antwoord:
        'Smart Climate kijkt nu mee: het zegt wat het zou doen en leert van je huis, maar schakelt het klimaat nog niet zelf. Bij Instellingen zie je hoeveel het al weet.',
      label: 'Naar Instellingen',
    },
    en: {
      antwoord:
        'Smart Climate is watching for now: it says what it would do and learns from your house, but does not switch the climate itself yet. Settings shows how much it knows.',
      label: 'Go to Settings',
    },
  },
];

/** Woorden die zeggen dat het om de app gaat: waar of hoe iets moet. */
const HULP = ['waar', 'hoe', 'instel*', 'invul*', 'aanpas*', 'wijzig*', 'verander*', 'toevoeg*', 'voeg', 'verwijder*', 'vind', 'vinden', 'kan ik', 'moet ik', 'where', 'how', 'change', 'set', 'add'];

/* -------------------------------------------------------- over het huis */

const NU = ['nu', 'momenteel', 'op dit moment', 'wat doe je', 'wat doe', 'wat gebeurt', 'gebeurt er', 'bezig', 'now', 'doing'];
const STRAKS = ['straks', 'later', 'wanneer', 'vanavond', 'vannacht', 'morgen', 'zo meteen', 'gaat doen', 'ga je', 'gaan', 'plan*', 'tonight', 'tomorrow'];
const ZON = ['zon', 'zonnig', 'zonne*', 'zonnestroom', 'opgewekt', 'opwek*', 'zonuren', 'sun', 'sunny', 'solar'];
const WAAROM = ['waarom', 'hoe komt', 'warm', 'warmer', 'koud', 'kouder', 'heet', 'temperatuur', 'graden', 'wacht', 'why'];

/** Koel, verwarm of zet uit; null als er geen wens in staat. */
function wensIn(los: readonly string[], tekst: string): Wish | null {
  if (los.some((t) => t.startsWith('koel') || t === 'cool')) return 'koelen';
  if (los.some((t) => t.startsWith('verwarm') || t === 'heat') || ` ${tekst} `.includes(' warm op ')) return 'verwarmen';
  if ((los.includes('zet') || los.includes('turn')) && (los.includes('uit') || los.includes('off'))) return 'uit';
  return null;
}

/** Een getal met hooguit een decimaal, zoals 22 of 21,5. */
function getalIn(los: readonly string[]): number | null {
  for (const t of los) {
    const m = /^(\d{1,2})(?:[.,](\d))?$/.exec(t.replace(/graden$/, ''));
    if (m) return Number(`${m[1]}.${m[2] ?? '0'}`);
  }
  return null;
}

/** De kamer die in de tekst staat; bij twee de langste naam. */
function kamerIn(config: SiteConfig, tekst: string): string | null {
  let beste: { id: string; lengte: number } | null = null;
  for (const z of config.zones) {
    for (const naam of [z.name, z.id]) {
      const n = gewoon(naam.replace(/[-_]+/g, ' '));
      if (n !== '' && ` ${tekst} `.includes(` ${n} `) && (beste == null || n.length > beste.lengte)) {
        beste = { id: z.id, lengte: n.length };
      }
    }
  }
  return beste?.id ?? null;
}

/* ---------------------------------------------------------------- kiezen */

export function voorbeelden(config: SiteConfig, lang: Lang): string[] {
  const kamer = config.zones[0]?.name.toLowerCase();
  return lang === 'nl'
    ? ['Wat doe je nu?', ...(kamer ? [`Waarom de ${kamer}?`] : []), 'Waar vul ik de prijzen in?', 'Hoe pas ik de indeling aan?']
    : ['What are you doing now?', ...(kamer ? [`Why the ${kamer}?`] : []), 'Where do I enter prices?', 'How do I change the layout?'];
}

/** Leest een vraag in eigen woorden. */
export function begrijp(ruw: string, config: SiteConfig, lang: Lang): Begrepen {
  const tekst = gewoon(ruw.slice(0, MAX_TEKST));
  const los = tekst === '' ? [] : tekst.split(' ');

  // De app: sterke woorden tellen dubbel, en "waar" of "hoe" geeft een duwtje.
  const hulp = telt(HULP, tekst, los) > 0;
  let app: { o: Onderwerp; score: number } | null = null;
  for (const o of ONDERWERPEN) {
    const sterk = telt(o.sterk, tekst, los);
    const zwak = telt(o.zwak, tekst, los);
    if (sterk + zwak === 0) continue;
    const score = sterk * 2 + zwak + (hulp ? 1 : 0);
    if (app == null || score > app.score) app = { o, score };
  }

  // Het huis: een kamer, een wens, of een van de vaste vragen.
  const kamer = kamerIn(config, tekst);
  const waarom = telt(WAAROM, tekst, los);
  const wens = wensIn(los, tekst);
  const huis: { vraag: Question; score: number }[] = [];
  if (kamer != null && wens != null && !los.includes('waarom') && !los.includes('why')) {
    huis.push({ vraag: { kind: 'doe', kamer, wens, temperatuurC: getalIn(los) }, score: 4 });
  }
  if (kamer != null) huis.push({ vraag: { kind: 'waarom', kamer }, score: 2 + waarom });
  const straks = telt(STRAKS, tekst, los);
  if (straks) huis.push({ vraag: { kind: 'straks' }, score: 2 * straks });
  const zon = telt(ZON, tekst, los);
  if (zon) huis.push({ vraag: { kind: 'zon' }, score: 2 * zon });
  const nu = telt(NU, tekst, los);
  // "Waarom staat de airco aan?" zonder kamer gaat over wat hij nu doet.
  if (nu || (waarom && kamer == null)) huis.push({ vraag: { kind: 'nu' }, score: Math.max(1, 2 * nu - 1) });
  const beste = huis.sort((a, b) => b.score - a.score)[0];

  // Een hulpvraag over de app wint van het huis; anders telt de hoogste.
  if (app != null && (hulp || beste == null || app.score > beste.score)) {
    const t = app.o[lang];
    return { soort: 'app', onderwerp: app.o.id, antwoord: t.antwoord, link: { href: app.o.href, label: t.label } };
  }
  if (beste != null) return { soort: 'huis', vraag: beste.vraag };
  return {
    soort: 'onbekend',
    antwoord:
      lang === 'nl'
        ? 'Dat begrijp ik nog niet. Vraag iets over je huis of over de app, bijvoorbeeld:'
        : 'I do not understand that yet. Ask something about your house or the app, for example:',
    voorbeelden: voorbeelden(config, lang),
  };
}
