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

/** De standaardscènes van Hue, in het Nederlands en het Engels, met hun licht. */
const DEFAULTS: readonly [RegExp, readonly string[]][] = [
  [/^(helder|bright)$/, ['#fff6ea', '#ffe9c8']],
  [/^(concentreren|concentrate)$/, ['#f2f7ff', '#dce9ff']],
  [/^(lezen|read)$/, ['#ffefd2', '#ffd9a0']],
  [/^(energie|energize|energise)$/, ['#e6f1ff', '#ffffff']],
  [/^(ontspannen|relax)$/, ['#ffc27a', '#ffa757']],
  [/^(gedimd|dimmed)$/, ['#c98a4a', '#8a5a2b']],
  [/^(nachtlampje|nightlight)$/, ['#a2531b', '#5c2d0e']],
  [/^(rusten|rest)$/, ['#ffb46b', '#e08a3c']],
  [/^(natuurlijk licht|natural light)$/, ['#ffd1a3', '#e6f1ff']],
];

export function defaultSceneColors(naam: string): readonly string[] {
  const n = naam.trim().toLowerCase();
  return DEFAULTS.find(([re]) => re.test(n))?.[1] ?? [];
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
