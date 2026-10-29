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
  | { readonly soort: 'onbekend'; readonly antwoord: string; readonly gesproken: string; readonly voorbeelden: readonly string[] };

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
    sterk: ['indeling', 'plattegrond', 'etage*', 'verdieping*', 'buitenruimte*', 'layout', 'floor', 'floors', 'floor plan', 'outdoor space*'],
    zwak: ['kamer toevoegen', 'kamers', 'ruimte*', 'tuin', 'oprit', 'terras', 'balkon', 'voortuin', 'zolder toevoegen', 'kelder', 'rooms', 'add a room', 'garden', 'driveway', 'patio', 'balcony', 'basement'],
    nl: {
      antwoord:
        'De indeling pas je aan bij Instellingen, onder Indeling. Daar sleep je een apparaat naar een andere kamer, voeg je een etage toe of haal je er een weg, en kies je wat er buiten is, zoals een tuin of een oprit.',
      label: 'Naar Indeling',
    },
    en: {
      antwoord:
        'You change the layout under Settings, Rooms and layout. Drag a device to another room, add or remove a floor, and choose what is outside, such as a garden or a driveway.',
      label: 'Go to Rooms and layout',
    },
  },
  {
    id: 'prijzen',
    href: 'energie.html#prijzen',
    sterk: ['prijs*', 'prijzen', 'tarief*', 'daltarief', 'dal', 'normaal tarief', 'netbeheer*', 'vastrecht', 'vaste kosten', 'contract', 'energieprijs*', 'stroomprijs*', 'gasprijs*', 'salder*', 'teruglever*', 'energiebelasting', 'price*', 'tariff*', 'off peak', 'peak rate', 'standing charge*', 'fixed costs', 'net metering', 'feed in', 'energy tax'],
    zwak: ['kosten', 'meter', 'meters', 'kwh', 'gas', 'stroom', 'energie', 'leverancier', 'rekening', 'electricity', 'supplier', 'bill', 'energy'],
    nl: {
      antwoord:
        'De prijzen vul je in bij Instellingen, onder Energie: Contract en prijzen. Neem ze over van je contract: stroom normaal en dal, teruglevering, gas, en eventueel de vaste kosten per dag, maand of jaar.',
      label: 'Naar Contract en prijzen',
    },
    en: {
      antwoord:
        'You enter prices under Settings, Energy setup: Contract and prices. Copy them from your contract: electricity normal and off-peak, export, gas, and if you like the fixed costs per day, month or year.',
      label: 'Go to Contract and prices',
    },
  },
  {
    id: 'aansluiting',
    href: 'energie.html#aansluiting',
    sterk: ['zekering*', 'hoofdzekering*', 'aansluiting', 'fase*', 'ampere', 'omvormer', 'ligging', 'fuse*', 'connection', 'main fuse', 'phase*', 'amp*', 'inverter'],
    zwak: ['panelen', 'zonnepanelen', 'dak', 'dakvlak*', 'netaansluiting', 'panels', 'solar panels', 'roof'],
    nl: {
      antwoord:
        'Je aansluiting stel je in bij Instellingen, onder Energie: waar je panelen liggen, je hoofdzekering en je verwarming. Welke apparaten op zon mogen starten, staat bij Regeling.',
      label: 'Naar Energie',
    },
    en: {
      antwoord:
        'You set up your connection under Settings, Energy setup: where your panels are, your main fuse and your heating. Which devices may start on sun is under Control.',
      label: 'Go to Energy setup',
    },
  },
  {
    // Alle batterijen en filters, ook als niets bijna leeg is (besluit 131).
    id: 'batterijen',
    href: 'thuis.html#batterijen',
    sterk: ['batterij', 'batterijen', 'batterijtje', 'filter', 'filters', 'battery', 'batteries'],
    zwak: ['leeg', 'vervangen', 'vol', 'empty', 'replace', 'flat', 'full'],
    nl: {
      antwoord: 'Alle apparaten met een batterij, de leegste eerst, en de filters van de airco staan op Thuis. Onder de 10% komt er vanzelf een melding bij.',
      label: 'Naar de batterijen',
    },
    en: {
      antwoord: 'Every device with a battery, emptiest first, and the air conditioner filters are on Home. Below 10% a notice appears by itself.',
      label: 'Go to the batteries',
    },
  },
  {
    id: 'comfort',
    href: 'comfort.html',
    // Smal: "hoe warm is het op zolder" is een vraag over het huis, geen instelling.
    sterk: ['comfort', 'dagdeel', 'dagdelen', 'nachttemperatuur', 'vakantie', 'part of the day', 'night temperature', 'holiday'],
    zwak: ['temperatuur', 'instellen', 'temperature'],
    nl: {
      antwoord: 'Hoe warm of koel je het wilt, zet je bij Instellingen, onder Comfort: per kamer en per dagdeel, en wanneer de dag en de nacht beginnen. De regeling rekent er meteen mee.',
      label: 'Naar Comfort',
    },
    en: {
      antwoord: 'How warm or cool you want it is under Settings, Comfort: per room and per part of the day, and when day and night begin. The control uses it right away.',
      label: 'Go to Comfort',
    },
  },
  {
    id: 'functies',
    href: 'functies.html',
    // Het weer zelf is een vraag over morgen (besluit 142); hier alleen waar het vandaan komt.
    sterk: ['camera*', 'deurbel*', 'bel', 'aanbellen', 'buienradar', 'weerdienst', 'weerbron', 'functie*', 'doorbell', 'weather source', 'feature*'],
    zwak: ['beeld', 'videodeurbel', 'lampen bedienen', 'licht bedienen', 'weer', 'weather', 'video', 'light control'],
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
    sterk: ['inrichten', 'wizard', 'installeren', 'installatie', 'opzetten', 'beginnen', 'eerste keer', 'setup', 'set up', 'install*', 'getting started', 'first time'],
    zwak: ['stappen', 'begin', 'steps', 'start'],
    nl: {
      antwoord:
        'Bij Inrichten loop je stap voor stap langs alles wat per huis anders is: je huis, klimaat, zon en aansluiting, meters en prijzen, en functies. Je vindt het bovenaan bij Instellingen.',
      label: 'Naar Inrichten',
    },
    en: {
      antwoord:
        'Set up walks you through everything that differs per house: your house, climate, sun and connection, meters and prices, and features. It is at the top of Settings.',
      label: 'Go to Set up',
    },
  },
  {
    id: 'inloggen',
    href: 'toegang.html',
    sterk: ['inloggen', 'inlog*', 'aanmelden', 'uitloggen', 'wachtwoord', 'login', 'log in', 'sign in', 'log out', 'sign out', 'password'],
    zwak: ['account', 'toegang', 'access'],
    nl: {
      antwoord:
        'Je logt in met je account van Home Assistant; de hele app vraagt dat. Uitloggen kan bij Instellingen, onder Bewoners en toegang.',
      label: 'Naar Bewoners en toegang',
    },
    en: {
      antwoord: 'You sign in with your Home Assistant account; the whole app asks for it. Signing out is under Settings, Residents and access.',
      label: 'Go to Residents and access',
    },
  },
  {
    id: 'opbrengst',
    href: 'opbrengst.html',
    sterk: ['opbrengst', 'bespaard', 'besparing', 'bespaar*', 'verdiend', 'verdien*', 'terugverdien*', 'savings', 'saved', 'saving', 'earned', 'pay back', 'payback'],
    zwak: ['oplevert', 'oplevering', 'geld', 'euro', 'money', 'yield'],
    nl: {
      antwoord:
        'Wat de zon en het slimme schakelen opleveren, staat bij Opbrengst: per dag, week, maand en jaar, in kWh en in euro’s.',
      label: 'Naar Opbrengst',
    },
    en: {
      antwoord: 'What the sun and smart switching bring in is under Energy: per day, week, month and year, in kWh and in euros.',
      label: 'Go to Energy',
    },
  },
  {
    id: 'vandaag',
    href: 'vandaag.html',
    sterk: ['verbruik*', 'grafiek', 'tijdlijn', 'usage', 'consumption', 'graph', 'chart', 'timeline'],
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
    sterk: ['apparaten', 'alle apparaten', 'devices', 'all devices'],
    zwak: ['lijst', 'overzicht', 'list', 'overview'],
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
    sterk: ['bedien*', 'lamp aan', 'lamp uit', 'licht aan', 'licht uit', 'aanzetten', 'uitzetten', 'scene*', 'operate', 'switch on', 'switch off'],
    zwak: ['lamp', 'lampen', 'licht', 'screen', 'screens', 'thermostaat', 'lights', 'light', 'blinds', 'thermostat'],
    nl: {
      antwoord:
        'Bedienen doe je in het huis op Thuis: tik op een kamer of een apparaat. Daarvoor moet je ingelogd zijn.',
      label: 'Naar Thuis',
    },
    en: {
      antwoord: 'You operate things in the house on Home: tap a room or a device. You need to be signed in.',
      label: 'Go to Home',
    },
  },
  {
    id: 'schakelen',
    href: 'huis-kan.html',
    sterk: ['schaduw*', 'meekijken', 'echt schakelen', 'echt regelen', 'zelf regelen', 'bewijs', 'leert', 'leren', 'shadow', 'watching', 'really switch', 'take over', 'learn*'],
    zwak: ['slim', 'slimme', 'smart'],
    nl: {
      antwoord:
        'Smart Climate kijkt nu mee: het zegt wat het zou doen en leert van je huis, maar schakelt het klimaat nog niet zelf. Bij Wat je huis kan zie je per functie hoe het ervoor staat.',
      label: 'Naar Wat je huis kan',
    },
    en: {
      antwoord:
        'Smart Climate is watching for now: it says what it would do and learns from your house, but does not switch the climate itself yet. What your house can do shows each function and where it stands.',
      label: 'Go to What your house can do',
    },
  },
];

/**
 * Woorden die zeggen dat het om de app gaat: waar of hoe iets moet. "Hoe" alleen
 * telt niet: "hoe warm is het" en "hoe wordt het weer" gaan over het huis.
 */
const HULP = ['waar', 'hoe stel', 'hoe pas', 'hoe voeg', 'hoe zet', 'hoe kan', 'hoe moet', 'hoe werkt', 'hoe doe', 'hoe vul', 'instel*', 'invul*', 'aanpas*', 'wijzig*', 'verander*', 'toevoeg*', 'voeg', 'verwijder*', 'vind', 'vinden', 'kan ik', 'moet ik', 'where', 'how do', 'how can', 'how to', 'change', 'set', 'add', 'enter', 'edit', 'remove', 'find', 'configure', 'can i', 'do i'];

/* -------------------------------------------------------- over het huis */

const NU = ['nu', 'momenteel', 'op dit moment', 'wat doe je', 'wat doe', 'wat gebeurt', 'gebeurt er', 'bezig', 'now', 'doing', 'right now', 'currently', 'happening', 'status'];
const STRAKS = ['straks', 'later', 'wanneer', 'vanavond', 'vannacht', 'morgen', 'zo meteen', 'gaat doen', 'ga je', 'gaan', 'plan*', 'tonight', 'tomorrow', 'next', 'going to', 'will you', 'when'];
const ZON = ['zon', 'zonnig', 'zonne*', 'zonnestroom', 'opgewekt', 'opwek*', 'zonuren', 'sun', 'sunny', 'solar', 'generated', 'produced', 'panels'];
/** Het weer en de zon van morgen (besluit 142). */
const MORGEN = ['morgen', 'overmorgen', 'regen', 'regent', 'regenen', 'bui', 'buien', 'weer', 'weersverwachting', 'weerbericht', 'tomorrow', 'rain', 'raining', 'shower*', 'weather', 'forecast'];
/** Wat iets kost (besluit 142). */
const KOSTEN = ['kost', 'kosten', 'kostte', 'kostten', 'geld', 'euro', 'cost', 'costs', 'costing', 'money', 'euros', 'how much do', 'how much does', 'how much did'];
/** Het sluipverbruik (besluit 192). */
const SLUIP = ['sluipverbruik', 'sluip*', 'sluimer*', 'standby', 'stand by', 'basislast', 'nachtverbruik', 'verbruik vannacht', 'nachts verbruik', 'baseload', 'base load', 'phantom*', 'vampire', 'idle power', 'overnight use', 'night use'];
/** Of er iemand thuis is, wat er terugging, en of een apparaat draait (29 oktober 2026). */
const THUIS = ['iemand thuis', 'wie is thuis', 'wie is er thuis', 'wie zijn er thuis', 'wie zijn thuis', 'niemand thuis', 'is er iemand', 'anyone home', 'anybody home', 'someone home', 'somebody home', 'who is home', 'who is at home', 'nobody home'];
const TERUG = ['teruggeleverd', 'terugleveren', 'teruglevering', 'terug geleverd', 'terug naar het net', 'terug het net', 'exported', 'export', 'fed back', 'fed in', 'back to the grid', 'sent back'];
const DRAAIT = ['draait', 'draaien', 'draaide', 'aan het draaien', 'klaar', 'bezig', 'running', 'done', 'finished', 'still on'];
/** Waar een opdracht zonder kamer over gaat: alleen klimaat; licht en schermen zijn van de opdrachten (besluit 148). */
const KLIMAAT = ['airco', 'aircos', 'airco’s', 'airconditioning', 'ac', 'verwarming', 'kachel', 'cv', 'warmtepomp', 'heater', 'heating', 'heat pump', 'air conditioner', 'air conditioning', 'aircon'];
const NIET_KLIMAAT = ['licht', 'lichten', 'lamp', 'lampen', 'lampje', 'scène', 'scene', 'scherm', 'schermen', 'zonnescherm', 'rolluik', 'gordijn', 'light', 'lights', 'screen', 'blind', 'blinds', 'awning', 'tv', 'muziek', 'music'];
const MACHINES = ['wasmachine', 'vaatwasser', 'vaatwasmachine', 'droger', 'wasdroger', 'washing machine', 'washer', 'dishwasher', 'dryer', 'tumble dryer'];

const WAAROM = ['waarom', 'hoe komt', 'warm', 'warmer', 'koud', 'kouder', 'heet', 'temperatuur', 'graden', 'wacht', 'why', 'how come', 'hot', 'cold', 'colder', 'temperature', 'degrees', 'waiting'];

/** Koel, verwarm of zet uit; null als er geen wens in staat. */
function wensIn(los: readonly string[], tekst: string): Wish | null {
  if (los.some((t) => t.startsWith('koel') || t === 'cool' || t === 'cooling')) return 'koelen';
  if (los.some((t) => t.startsWith('verwarm') || t === 'heat' || t === 'heating') || ` ${tekst} `.includes(' warm op ') || ` ${tekst} `.includes(' warm up ')) return 'verwarmen';
  const zet = los.includes('zet') || los.includes('doe') || los.includes('turn') || los.includes('switch');
  if (zet && (los.includes('uit') || los.includes('off'))) return 'uit';
  // "Zet de airco aan" (29 oktober 2026): aan zonder meer.
  if (zet && (los.includes('aan') || los.includes('on'))) return 'aan';
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

/**
 * Andere namen voor een kamer (29 oktober 2026): "living room" en "attic"
 * vonden de woonkamer en de zolder niet, en dan ging het antwoord over iets
 * anders. Alleen als er precies één kamer bij past: bij twee slaapkamers raadt
 * hij niet.
 */
const OOK: readonly (readonly [RegExp, readonly string[]])[] = [
  [/woon|living|lounge/, ['woonkamer', 'huiskamer', 'zitkamer', 'living room', 'living', 'lounge', 'sitting room']],
  [/zolder|attic|loft/, ['zolder', 'attic', 'loft']],
  [/slaap|bedroom/, ['slaapkamer', 'bedroom']],
  [/badkamer|bathroom/, ['badkamer', 'bathroom']],
  [/keuken|kitchen/, ['keuken', 'kitchen']],
  [/^(hal|gang)$|hallway/, ['hal', 'gang', 'hall', 'hallway']],
];
function ookNamen(config: SiteConfig, z: SiteConfig['zones'][number]): string[] {
  const past = (re: RegExp, x: SiteConfig['zones'][number]) => re.test(gewoon(x.name)) || re.test(x.id);
  return OOK.filter(([re]) => past(re, z) && config.zones.filter((x) => past(re, x)).length === 1).flatMap(([, w]) => w);
}

/** De kamer die in de tekst staat; bij twee de langste naam. */
function kamerIn(config: SiteConfig, tekst: string): string | null {
  let beste: { id: string; lengte: number } | null = null;
  for (const z of config.zones) {
    for (const naam of [z.name, z.id, ...ookNamen(config, z)]) {
      const n = gewoon(naam.replace(/[-_]+/g, ' '));
      if (n !== '' && ` ${tekst} `.includes(` ${n} `) && (beste == null || n.length > beste.lengte)) {
        beste = { id: z.id, lengte: n.length };
      }
    }
  }
  return beste?.id ?? null;
}

/* ---------------------------------------------------------------- ruis en klaar */

/** Wat de spraakherkenning van een geluid maakt, geen zin: "(noise)", "[Muziek]", "...". */
const RUIS_WOORDEN = new Set(['noise', 'ruis', 'muziek', 'music', 'geluid', 'stilte', 'silence', 'blank audio', 'applaus', 'applause', 'gelach', 'laughter', 'hoest', 'cough', 'inaudible', 'onverstaanbaar', 'achtergrondgeluid', 'background noise']);
/** Wat Whisper verzint bij stilte, van de ondertitels waarmee hij leerde. */
const RUIS_ZINNEN = ['ondertiteld door', 'ondertiteling', 'amara org', 'bedankt voor het kijken', 'bedankt voor het luisteren', 'abonneer', 'thanks for watching', 'subtitles by'];

/**
 * Ruis (21 oktober 2026): alleen geluid, geen woorden. Eerst ging dat door als
 * een vraag; dan stond er "noise" bovenin en zei het huis dat het je niet kon
 * helpen. Nu telt het als niets gezegd.
 */
export function isRuis(ruw: string): boolean {
  const t = ruw.trim();
  // Alles tussen haakjes is een geluid, geen zin.
  if (/^[[(*][^\])*]*[\])*]?\.?$/.test(t)) return true;
  const g = gewoon(t);
  if (g === '') return true;
  return RUIS_WOORDEN.has(g) || RUIS_ZINNEN.some((z) => ` ${g} `.includes(` ${z} `));
}

/**
 * Woorden waar een zin niet op eindigt (besluit 208): "zet de lamp in de".
 * Bewust zonder "aan", "uit", "op", "open" en "dicht": daar eindigt een
 * opdracht juist wél op; en zonder "het", "wat" en "dan" ("hoe warm is het",
 * "doe dat dan").
 */
const HALF_EINDE = new Set([
  'de', 'een', 'en', 'of', 'om', 'naar', 'van', 'met', 'bij', 'voor', 'tot', 'als', 'maar', 'in', 'zet', 'doe', 'maak',
  'the', 'a', 'an', 'and', 'or', 'to', 'with', 'for', 'at', 'turn', 'set', 'make',
]);

/**
 * Een gesproken zin die nog niet af is (besluit 208): je hield even je adem in
 * en de microfoon stopte. Dan luistert het huis door en plakt het vervolg
 * erachter, in plaats van te antwoorden op een halve vraag. Alleen bij een
 * zin van meer dan één woord: "Hé huis, de…" is geen begin van iets.
 */
export function isHalf(ruw: string): boolean {
  // Een punt zegt niets: Whisper zet er bijna altijd een achter, ook bij een halve zin.
  const woorden = gewoon(ruw).split(' ').filter((w) => w !== '');
  return woorden.length >= 2 && HALF_EINDE.has(woorden.at(-1)!);
}

/** Woorden die er bij het afsluiten omheen staan: "oké", "top", "hé huis". */
const VULWOORDEN = new Set(['oke', 'ok', 'okay', 'oké', 'okee', 'prima', 'top', 'super', 'mooi', 'fijn', 'goed', 'hoor', 'huis', 'he', 'hey', 'hee', 'nou', 'heel', 'erg', 'alright', 'great', 'fine', 'perfect']);
/** Wat het gesprek afsluit, na de vulwoorden. Leeg ("oké") ook. */
const AFSLUITERS = new Set([
  '', 'bedankt', 'dank je', 'dank je wel', 'dankjewel', 'dank u', 'dank u wel', 'dankuwel', 'thanks', 'thank you', 'merci',
  'nee', 'nee dank je', 'nee dank je wel', 'nee dankjewel', 'nee bedankt', 'nee hoor', 'no', 'no thanks', 'no thank you',
  'dat was het', 'dat was alles', 'dat is alles', 'dat is het', 'dat was t', 'verder niks', 'verder niets', 'niks', 'niets', 'niks meer', 'niets meer', 'laat maar',
  'klaar', 'tot ziens', 'tot zo', 'doei', 'dag', 'later', 'welterusten', 'slaap lekker', 'thats all', 'thats it', 'nothing', 'goodbye', 'bye', 'good night',
]);

/**
 * "Oké bedankt" of "dat was het" (21 oktober 2026): het gesprek is klaar. Het
 * huis zegt iets terug en luistert niet verder. Null als het geen afsluiter is.
 */
export function afsluiter(ruw: string, lang: Lang): string | null {
  const woorden = gewoon(ruw).split(' ').filter((w) => w !== '');
  if (woorden.length === 0 || woorden.length > 6) return null;
  const rest = woorden.filter((w) => !VULWOORDEN.has(w)).join(' ');
  if (!AFSLUITERS.has(rest)) return null;
  const nl = lang === 'nl';
  if (/welterusten|slaap lekker|good night/.test(rest)) return nl ? 'Welterusten.' : 'Good night.';
  if (/tot ziens|tot zo|doei|^dag$|later|goodbye|bye/.test(rest)) return nl ? 'Tot ziens.' : 'Goodbye.';
  if (/dank|bedankt|thank|merci/.test(rest)) return nl ? 'Graag gedaan.' : 'You are welcome.';
  return nl ? 'Prima. Ik ben er als je me nodig hebt.' : 'All right. I am here when you need me.';
}

/* ---------------------------------------------------------------- kiezen */

/** Wat je kunt vragen; elk voorbeeld verstaat de woordzoeker zelf (een test houdt dat zo). */
export function voorbeelden(_config: SiteConfig, lang: Lang): string[] {
  return lang === 'nl'
    ? ['Wat doe je nu?', 'Hoe warm is het overal?', 'Wat wordt het weer morgen?', 'Wat kosten de airco’s?', 'Waar vul ik de prijzen in?']
    : ['What are you doing now?', 'How warm is it everywhere?', 'What is the weather tomorrow?', 'What do the air conditioners cost?', 'Where do I enter the prices?'];
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
  // Zonder kamer zoekt de assistent zelf de kamer die het kan, of vraagt welke (29 oktober 2026).
  const klimaat = telt(KLIMAAT, tekst, los) > 0;
  const nietKlimaat = telt(NIET_KLIMAAT, tekst, los) > 0;
  if (wens != null && !los.includes('waarom') && !los.includes('why') && !((wens === 'aan' || wens === 'uit') && nietKlimaat) && (kamer != null || klimaat)) {
    huis.push({ vraag: { kind: 'doe', kamer: kamer ?? '', wens, temperatuurC: getalIn(los) }, score: kamer != null ? 4 : 3 });
  }
  if (kamer != null) huis.push({ vraag: { kind: 'waarom', kamer }, score: 2 + waarom });
  const straks = telt(STRAKS, tekst, los);
  if (straks) huis.push({ vraag: { kind: 'straks' }, score: 2 * straks });
  const zon = telt(ZON, tekst, los);
  if (zon) huis.push({ vraag: { kind: 'zon' }, score: 2 * zon });
  // Wat het huis vandaag deed, en hoe warm het overal is (besluit 141).
  const vandaag = telt(['vandaag gedaan', 'wat deed je', 'heb je gedaan', 'vandaag besloten', 'besloten', 'today did', 'what did you do', 'what have you done', 'did you do', 'decided'], tekst, los);
  if (vandaag) huis.push({ vraag: { kind: 'vandaag' }, score: 3 * vandaag });
  const overal = telt(['overal', 'alle kamers', 'elke kamer', 'in huis', 'everywhere', 'every room', 'all rooms', 'in the house', 'whole house'], tekst, los);
  if (overal && kamer == null && telt(['warm', 'koud', 'temperatuur', 'graden', 'temperature', 'hot', 'cold', 'degrees'], tekst, los)) huis.push({ vraag: { kind: 'warm' }, score: 5 });
  // Het weer van morgen, en wat iets kost (besluit 142).
  const morgen = telt(MORGEN, tekst, los);
  // Het weer zonder morgen erbij gaat over vandaag (besluit 166): "wat voor weer wordt het vandaag?".
  const overMorgen = telt(['morgen', 'overmorgen', 'tomorrow'], tekst, los) > 0;
  if (morgen && kamer == null) huis.push({ vraag: { kind: overMorgen ? 'morgen' : 'weer' }, score: 3 * morgen });
  const kosten = telt(KOSTEN, tekst, los);
  if (kosten) huis.push({ vraag: { kind: 'kosten' }, score: 3 * kosten });
  const sluip = telt(SLUIP, tekst, los);
  if (sluip) huis.push({ vraag: { kind: 'sluip' }, score: 6 * sluip });
  const thuis = telt(THUIS, tekst, los);
  if (thuis) huis.push({ vraag: { kind: 'thuis' }, score: 5 * thuis });
  const terug = telt(TERUG, tekst, los);
  if (terug) huis.push({ vraag: { kind: 'terug' }, score: 4 * terug });
  // Een apparaat dat op zon wacht, bij zijn naam of een gewone naam; wat het kost, blijft kosten.
  const machine = (config.deferrables ?? []).map((a) => gewoon(a.name)).find((n) => n !== '' && ` ${tekst} `.includes(` ${n} `)) ?? MACHINES.find((m) => ` ${tekst} `.includes(` ${m} `)) ?? null;
  if (machine != null && !kosten) huis.push({ vraag: { kind: 'draait', apparaat: machine }, score: 3 + 2 * telt(DRAAIT, tekst, los) });
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
  const vb = voorbeelden(config, lang);
  // Hardop zijn er geen knoppen: dan noemt de zin zelf twee voorbeelden (besluit 166).
  const twee = vb.slice(0, 2).map((t) => `"${t.replace(/\?$/, '')}"`);
  return {
    soort: 'onbekend',
    antwoord:
      lang === 'nl'
        ? 'Dat begrijp ik nog niet. Vraag iets over je huis of over de app, bijvoorbeeld:'
        : 'I do not understand that yet. Ask something about your house or the app, for example:',
    gesproken: lang === 'nl' ? `Dat begrijp ik nog niet. Vraag bijvoorbeeld ${twee.join(' of ')}.` : `I do not understand that yet. Ask for example ${twee.join(' or ')}.`,
    voorbeelden: vb,
  };
}
