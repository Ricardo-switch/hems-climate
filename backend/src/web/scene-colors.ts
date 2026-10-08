/**
 * De kleuren van een Hue-scène (besluit 100, aangevuld).
 *
 * Home Assistant geeft de plaatjes van de Hue-app niet door, en ook niet welke
 * kleuren een scène zet. Wel zien we de lampen: zet de bewoner een scène aan,
 * dan staan de lampen van die Hue-groep een paar tellen later in die kleuren.
 * Die onthouden we per scène, zodat de knop zijn echte kleuren toont, zoals in
 * de Hue-app. Alleen lezen; de kleuren staan in `scene-kleuren.json` naast de
 * dataset.
 *
 * Tot een scène een keer gebruikt is, krijgen de standaardscènes van Hue vaste
 * kleuren die bij hun naam passen; een andere scène krijgt nog geen kleur.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { HouseDevice } from './house.js';

export const SCENE_COLORS_FILE = 'scene-kleuren.json';

/** Kleurtemperatuur als ongeveer de kleur die je ziet. */
const KELVIN: readonly [number, string][] = [
  [2000, '#ff8b27'],
  [2400, '#ff9d45'],
  [2700, '#ffa757'],
  [3000, '#ffb46b'],
  [3500, '#ffc48a'],
  [4000, '#ffd1a3'],
  [5000, '#ffe4ce'],
  [6500, '#fff4f0'],
];

function kelvinCss(k: number): string {
  let best = KELVIN[0]!;
  for (const e of KELVIN) if (Math.abs(e[0] - k) < Math.abs(best[0] - k)) best = e;
  return best[1];
}

/** Tint en verzadiging (Home Assistant) als CSS-kleur op volle helderheid. */
export function hsCss(h: number, s: number): string {
  const sv = Math.max(0, Math.min(100, s)) / 100;
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (1 - sv * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${hex(f(5))}${hex(f(3))}${hex(f(1))}`;
}

/** De kleuren van lampen die aan staan: hooguit vier, zonder bijna-dubbele. */
export function colorsFromLamps(lamps: readonly HouseDevice[]): string[] {
  const out: string[] = [];
  for (const d of lamps) {
    if (!d.aan || d.soort !== 'licht') continue;
    const c = d.licht?.tint ? hsCss(d.licht.tint[0], d.licht.tint[1]) : d.licht?.kelvin ? kelvinCss(d.licht.kelvin) : null;
    if (c && !out.includes(c)) out.push(c);
    if (out.length === 4) break;
  }
  return out;
}

/**
 * De standaardscènes van Hue, in het Nederlands en het Engels, met de kleur die
 * de Hue-app erbij toont. De kleuren komen uit een draad op het forum van Home
 * Assistant ("Hue scenes mimicked in HA"); een tweede, lichtere tint geeft het
 * bolletje diepte.
 */
const DEFAULTS: readonly [RegExp, readonly string[]][] = [
  [/^(helder|bright)$/, ['#fcdb97', '#fff3d6']],
  [/^(concentreren|concentrate)$/, ['#a2eaf2', '#e6fbfd']],
  [/^(lezen|read)$/, ['#fdfb9f', '#fffde0']],
  [/^(energie|energize|energise)$/, ['#a8dfed', '#e8f7fb']],
  [/^(ontspannen|relax)$/, ['#ffc059', '#ffe0a8']],
  [/^(gedimd|dimmed)$/, ['#8c642b', '#b88c4e']],
  [/^(nachtlampje|nightlight)$/, ['#814346', '#a8605f']],
  [/^(rusten|rest)$/, ['#ffb46b', '#e08a3c']],
  [/^(natuurlijk licht|natural light)$/, ['#fcdb97', '#a8dfed']],
  [/^(arctische dageraad|arctic aurora)$/, ['#00d0a0', '#5be3c2']],
  [/^(savanne zonsondergang|savanna sunset)$/, ['#ff7935', '#ffb07a']],
  [/^(tropische schemering|tropical twilight)$/, ['#a03aa3', '#d37ad6']],
  [/^(lentebloesem|spring blossom)$/, ['#ba496c', '#e08aa4']],
];

export function defaultSceneColors(naam: string): readonly string[] {
  const n = naam.trim().toLowerCase();
  return DEFAULTS.find(([re]) => re.test(n))?.[1] ?? [];
}

/** De standaardscènes van Hue die alleen wit zetten: die kan elke lamp. */
const WHITE = /^(helder|bright|concentreren|concentrate|lezen|read|energie|energize|energise|ontspannen|relax|gedimd|dimmed|nachtlampje|nightlight|rusten|rest|natuurlijk licht|natural light)$/;

/** Ligt een kleur dicht bij een kleurtemperatuur, dan is het wit. */
function nearWhite(css: string): boolean {
  const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r, g, b] = rgb(css);
  return KELVIN.some(([, k]) => {
    const [kr, kg, kb] = rgb(k);
    return Math.hypot(r! - kr!, g! - kg!, b! - kb!) <= 30;
  });
}

/**
 * Kan een witte lamp deze scène laten zien? De witte standaardscènes wel, een
 * andere standaardscène niet. Van de rest weten we het pas als hij een keer
 * aan was: dan zegt de kleur van de lampen het. Tot dan telt hij als kleur,
 * want de scènes uit de galerij van Hue zijn dat.
 */
export function whiteScene(naam: string, kleuren: readonly string[]): boolean {
  const n = naam.trim().toLowerCase();
  if (WHITE.test(n)) return true;
  if (DEFAULTS.some(([re]) => re.test(n))) return false;
  return kleuren.length > 0 && kleuren.every(nearWhite);
}

export class SceneColorStore {
  readonly #path: string;
  #current: Record<string, string[]> = {};
  #writing: Promise<void> = Promise.resolve();

  constructor(logDir: string) {
    this.#path = join(logDir, SCENE_COLORS_FILE);
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.#path, 'utf-8')) as { versie?: unknown; kleuren?: unknown };
      const list = raw?.versie === 1 && typeof raw.kleuren === 'object' && raw.kleuren != null ? (raw.kleuren as Record<string, unknown>) : {};
      this.#current = Object.fromEntries(
        Object.entries(list)
          .filter(([id, v]) => id.startsWith('scene.') && Array.isArray(v))
          .map(([id, v]) => [id, (v as unknown[]).filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/.test(c)).slice(0, 4)]),
      );
    } catch {
      this.#current = {};
    }
  }

  /** Wat we van deze scène zagen, of de vaste kleuren bij zijn naam. */
  colors(sceneId: string, naam: string): readonly string[] {
    const seen = this.#current[sceneId];
    return seen && seen.length > 0 ? seen : defaultSceneColors(naam);
  }

  /** Onthoudt wat de lampen na het aanzetten deden; niets als er geen aan staat. */
  remember(sceneId: string, colors: readonly string[]): Promise<void> {
    if (colors.length === 0 || this.#current[sceneId]?.join() === colors.join()) return this.#writing;
    this.#current = { ...this.#current, [sceneId]: [...colors] };
    const text = `${JSON.stringify({ versie: 1, kleuren: this.#current }, null, 2)}\n`;
    const tmp = `${this.#path}.nieuw`;
    this.#writing = this.#writing.catch(() => {}).then(async () => {
      await writeFile(tmp, text, 'utf-8');
      await rename(tmp, this.#path);
    });
    return this.#writing;
  }
}
