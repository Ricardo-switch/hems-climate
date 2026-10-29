/**
 * De stem kiezen (besluit 212): uit de stemmen die Home Assistant heeft, een
 * korte lijst om uit te kiezen, per vrouw of man, met een paar woorden over
 * hoe hij klinkt. Google Chirp 3 HD klinkt het menselijkst (de tekst van het
 * antwoord gaat naar Google, je stem niet); Piper draait in huis. "Dit
 * apparaat" is de stem van de tablet of telefoon zelf en werkt altijd.
 *
 * Niet elke stem: van Google de twaalf die het best Nederlands klinken, van
 * Piper alleen de stemmen die niet brabbelen (niet mls, besluit 150).
 */

export type Geslacht = 'vrouw' | 'man';
export type StemSoort = 'hd' | 'huis' | 'apparaat';

export interface StemOptie {
  /** `engine|voice`, of `apparaat`. */
  readonly id: string;
  readonly naam: string;
  readonly geslacht: Geslacht | null;
  readonly soort: StemSoort;
  /** Hoe hij klinkt, in een paar woorden. */
  readonly kenmerk: { readonly nl: string; readonly en: string };
}

export const APPARAAT = 'apparaat';

/** Google Chirp 3 HD: geslacht en hoe hij klinkt (naar de beschrijving van Google). */
const CHIRP: Readonly<Record<string, readonly [Geslacht, string, string]>> = {
  Kore: ['vrouw', 'stevig, rustig', 'firm, calm'],
  Aoede: ['vrouw', 'luchtig', 'breezy'],
  Leda: ['vrouw', 'jong, zacht', 'youthful'],
  Zephyr: ['vrouw', 'helder', 'bright'],
  Sulafat: ['vrouw', 'warm', 'warm'],
  Achernar: ['vrouw', 'zacht', 'soft'],
  Charon: ['man', 'rustig, duidelijk', 'calm, clear'],
  Puck: ['man', 'vrolijk', 'upbeat'],
  Orus: ['man', 'stevig', 'firm'],
  Fenrir: ['man', 'levendig', 'lively'],
  Iapetus: ['man', 'helder', 'clear'],
  Umbriel: ['man', 'ontspannen', 'easy-going'],
};

/** Piper in het Nederlands, zonder de mls-stemmen die brabbelen. */
const PIPER: Readonly<Record<string, readonly [Geslacht, string, string, string]>> = {
  'nl_BE-nathalie-medium': ['vrouw', 'Nathalie', 'Vlaams', 'Flemish'],
  'nl_NL-pim-medium': ['man', 'Pim', 'Nederlands', 'Dutch'],
  'nl_NL-ronnie-medium': ['man', 'Ronnie', 'Nederlands', 'Dutch'],
  'nl_BE-rdh-medium': ['man', 'Rdh', 'Vlaams', 'Flemish'],
};

/**
 * De stemmen om uit te kiezen, uit wat Home Assistant per spraakentiteit
 * heeft. Google eerst (in de volgorde hierboven), dan Piper, dan dit apparaat.
 */
export function stemOpties(beschikbaar: ReadonlyMap<string, readonly string[]>): StemOptie[] {
  const uit: StemOptie[] = [];
  for (const [engine, stemmen] of beschikbaar) {
    for (const [naam, [geslacht, nl, en]] of Object.entries(CHIRP)) {
      const voice = stemmen.find((v) => v === `nl-NL-Chirp3-HD-${naam}`) ?? stemmen.find((v) => v === `nl-BE-Chirp3-HD-${naam}`);
      if (voice) uit.push({ id: `${engine}|${voice}`, naam, geslacht, soort: 'hd', kenmerk: { nl, en } });
    }
  }
  for (const [engine, stemmen] of beschikbaar) {
    for (const [voice, [geslacht, naam, nl, en]] of Object.entries(PIPER)) {
      if (stemmen.includes(voice)) uit.push({ id: `${engine}|${voice}`, naam, geslacht, soort: 'huis', kenmerk: { nl, en } });
    }
  }
  uit.push({ id: APPARAAT, naam: 'Dit apparaat', geslacht: null, soort: 'apparaat', kenmerk: { nl: 'werkt overal', en: 'works everywhere' } });
  return uit;
}

/** Een keuze uit elkaar: spraakentiteit en stem, of null als het geen stem van Home Assistant is. */
export function stemUit(id: string | null | undefined): { readonly engine: string; readonly voice: string } | null {
  const m = /^(tts\.[a-z0-9_]+)\|([A-Za-z0-9_-]{1,80})$/.exec(id ?? '');
  return m ? { engine: m[1]!, voice: m[2]! } : null;
}

/** Of een keuze er zo uit kan zien, voor het bewaren bij Functies. */
export function geldigeStemKeuze(id: unknown): boolean {
  return id === null || id === APPARAAT || (typeof id === 'string' && stemUit(id) != null);
}

/** De taal van een stem uit zijn naam: "nl-NL-Chirp3-HD-Kore" is nl-NL, "nl_BE-nathalie-medium" nl_BE. */
export function taalVanStem(voice: string): string | null {
  return /^(nl[-_](NL|BE)|en[-_](GB|US))/i.exec(voice)?.[1] ?? null;
}

/** Wat een stem als voorbeeld zegt. */
export const VOORBEELD = {
  nl: 'Hallo, ik ben je huis. Het is 20,5° in de woonkamer; zal ik hem tot 22:00 op 21° zetten?',
  en: 'Hello, I am your house. It is 20.5° in the living room; shall I set it to 21° until 22:00?',
} as const;
