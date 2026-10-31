/**
 * Plaatjes bij de Hue-scènes (besluit 100, aangevuld).
 *
 * Home Assistant geeft de plaatjes van de Hue-app niet door, en ze zijn van
 * Philips Hue: SunArc levert ze niet mee. Wie ze heeft, zet ze in de map
 * `scene-plaatjes/` naast de dataset; de app toont dan bij een scène het plaatje
 * met zijn naam. Zonder plaatje blijven de kleuren (scene-colors.ts).
 *
 * De bekende verzameling (github.com/mattmon/hue-scene-icons) heeft Engelse
 * namen: `bright.png`, `arctic_aurora.png`. Een Nederlandse Hue-app noemt die
 * scènes "Helder" en "Arctische dageraad"; daarvoor de tabel hieronder. Een
 * eigen plaatje met de Nederlandse naam (`helder.png`) gaat altijd voor.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const SCENE_PICTURES_DIR = 'scene-plaatjes';

/** Bestandsnamen die de app serveert: kleine letters, cijfers, _ en -. */
export const PICTURE_FILE = /^[a-z0-9_-]+\.(png|jpe?g|webp)$/;

/** Nederlandse namen uit de Hue-app, naar de Engelse van de plaatjes. */
const DUTCH: Readonly<Record<string, string>> = {
  helder: 'bright',
  concentreren: 'concentrate',
  energie: 'energize',
  lezen: 'read',
  ontspannen: 'relax',
  gedimd: 'dimmed',
  nachtlampje: 'nightlight',
  rusten: 'rest',
  'natuurlijk licht': 'natural_light',
  'koel helder': 'cool_bright',
  'arctische dageraad': 'arctic_aurora',
  'savanne zonsondergang': 'savanna_sunset',
  'tropische schemering': 'tropical_twilight',
  lentebloesem: 'spring_blossom',
  amberbloesem: 'amber_bloom',
  bosavontuur: 'forest_adventure',
  'dromerige schemering': 'dreamy_dusk',
  'geschilderde lucht': 'painted_sky',
  'oranje velden': 'orange_fields',
  peinzend: 'pensive',
  schitterend: 'resplendent',
  'smaragd-gefladder': 'emerald_flutter',
  winterschoonheid: 'winter_beauty',
  'gouden vijver': 'golden_pond',
  maanlicht: 'moonlight',
  sterrenlicht: 'starlight',
  zonsondergang: 'sundown',
  'eerste licht': 'first_light',
  'blauwe lagune': 'blue_lagoon',
  'blauwe planeet': 'blue_planet',
  'bloedmaan': 'blood_moon',
  'herfstgoud': 'autumn_gold',
  'krokus': 'crocus',
  'midzomerzon': 'midsummer_sun',
  'stille wateren': 'still_waters',
  'zondagochtend': 'sunday_morning',
  'warme omhelzing': 'warm_embrace',
};

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** De bestandsnamen die bij een scènenaam horen, de beste eerst. */
export function pictureCandidates(naam: string): string[] {
  // "Natuurlijk licht 3" en "Lezen 2" zijn kopieën van dezelfde scène.
  const base = naam.trim().toLowerCase().replace(/\s+\d+$/, '');
  const english = DUTCH[base];
  return [...new Set([slug(base), ...(english ? [english] : [])].filter(Boolean))];
}

export class ScenePictures {
  readonly #dir: string;
  /** Per naam zonder extensie het bestand dat er staat. */
  #files = new Map<string, string>();

  constructor(logDir: string) {
    this.#dir = join(logDir, SCENE_PICTURES_DIR);
  }

  get dir(): string {
    return this.#dir;
  }

  /** Leest de map opnieuw; zonder map zijn er gewoon geen plaatjes. */
  async refresh(): Promise<void> {
    try {
      const names = (await readdir(this.#dir)).map((n) => n.toLowerCase()).filter((n) => PICTURE_FILE.test(n));
      this.#files = new Map(names.map((n) => [n.replace(/\.[a-z]+$/, ''), n]));
    } catch {
      this.#files = new Map();
    }
  }

  /** Het pad voor de app (`scene-plaatjes/bright.png`), of null. */
  pictureFor(naam: string): string | null {
    for (const c of pictureCandidates(naam)) {
      const file = this.#files.get(c);
      if (file) return `${SCENE_PICTURES_DIR}/${file}`;
    }
    return null;
  }
}
