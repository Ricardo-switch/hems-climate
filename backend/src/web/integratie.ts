/*
 * De integratie SunArc neerzetten vanuit de add-on (besluit 184), voor
 * wie geen HACS heeft. Na een tik van de beheerder in de app kopieert de
 * add-on de map van de integratie (die in zijn image zit) naar
 * `custom_components/sunarc` in de configuratie van Home Assistant, en
 * zet er een merkje bij. Daarna houdt hij hem bij: past een update van de
 * add-on de integratie aan, dan zet hij de nieuwe versie neer. Hij raakt
 * niets anders aan, geen YAML en geen andere map.
 *
 * Staat de map er al zonder merkje (via HACS, of met de hand), dan blijft de
 * add-on ervan af: twee bronnen voor dezelfde map gaat mis.
 *
 * Tot 2 november 2026 heette de integratie `smart_climate` (die naam was in
 * Home Assistant al van een ander project). Staat de oude map er nog van de
 * add-on, dan zet hij `sunarc` neer en haalt de oude weg; een oude map via
 * HACS of met de hand blijft staan, die werk je bij waar hij vandaan kwam.
 *
 * Home Assistant laadt een integratie bij het starten; na neerzetten of een
 * nieuwe versie is dus een herstart nodig. Dat doet de bewoner zelf: de app
 * zegt het, want herstarten is schrijven naar Home Assistant.
 */

import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Het merkje: van de add-on, met welke versie. */
export const MERKJE = '.van-de-add-on';

export interface IntegratieStand {
  /** Of de add-on hem kan neerzetten: de map uit het image en de configuratie van Home Assistant zijn er. */
  readonly kan: boolean;
  /** Nee, van de add-on, of anders (HACS of met de hand). */
  readonly staat: 'nee' | 'add-on' | 'anders';
  /** De versie die in de configuratie staat, of null. */
  readonly versie: string | null;
  /** De versie in het image van de add-on. */
  readonly nieuw: string | null;
  /** Staat de integratie er nog onder de oude naam (smart_climate), en van wie. */
  readonly oud: 'nee' | 'add-on' | 'anders';
}

/** De mappen in custom_components: nu, en de oude naam van voor 2 november 2026. */
export const MAP = 'sunarc';
export const OUDE_MAP = 'smart_climate';

const bestaat = async (pad: string) => stat(pad).then(() => true, () => false);
async function versieVan(map: string): Promise<string | null> {
  try {
    const m = JSON.parse(await readFile(join(map, 'manifest.json'), 'utf-8')) as { version?: unknown };
    return typeof m.version === 'string' ? m.version : null;
  } catch {
    return null;
  }
}

export class Integratie {
  readonly #bron: string;
  readonly #config: string;

  /** `bron`: de map in het image; `config`: de configuratie van Home Assistant (`/homeassistant` in de add-on). */
  constructor(bron: string, config: string) {
    this.#bron = bron;
    this.#config = config;
  }

  get #doel(): string {
    return join(this.#config, 'custom_components', MAP);
  }

  get #oud(): string {
    return join(this.#config, 'custom_components', OUDE_MAP);
  }

  async stand(): Promise<IntegratieStand> {
    const kan = (await bestaat(join(this.#bron, 'manifest.json'))) && (await bestaat(this.#config));
    const nieuw = await versieVan(this.#bron);
    const oud = !(await bestaat(this.#oud)) ? 'nee' : (await bestaat(join(this.#oud, MERKJE))) ? 'add-on' : 'anders';
    if (!(await bestaat(this.#doel))) {
      // Alleen de oude naam, via HACS of met de hand: die blijft van wie hem neerzette.
      if (oud === 'anders') return { kan, staat: 'anders', versie: await versieVan(this.#oud), nieuw, oud };
      return { kan, staat: 'nee', versie: null, nieuw, oud };
    }
    const staat = (await bestaat(join(this.#doel, MERKJE))) ? 'add-on' : 'anders';
    return { kan, staat, versie: await versieVan(this.#doel), nieuw, oud };
  }

  /** Neerzetten, of de nieuwe versie; nooit over een map die niet van de add-on is. */
  async zetNeer(): Promise<{ ok: true; stand: IntegratieStand } | { ok: false; reden: string }> {
    const nu = await this.stand();
    if (!nu.kan) return { ok: false, reden: 'de add-on kan de integratie hier niet neerzetten' };
    if (nu.staat === 'anders') return { ok: false, reden: 'de integratie staat er al, via HACS of met de hand; de add-on blijft ervan af' };
    await mkdir(join(this.#config, 'custom_components'), { recursive: true });
    // Eerst de oude weg, zodat een bestand dat in de nieuwe versie niet meer bestaat niet blijft liggen.
    await rm(this.#doel, { recursive: true, force: true });
    await cp(this.#bron, this.#doel, { recursive: true, filter: (pad) => !pad.includes('__pycache__') });
    await writeFile(join(this.#doel, MERKJE), `${nu.nieuw ?? ''}\n`, 'utf-8');
    // De oude naam weg, als die ook van de add-on was: anders laadt Home Assistant hem er nog naast.
    if (nu.oud === 'add-on') await rm(this.#oud, { recursive: true, force: true });
    return { ok: true, stand: await this.stand() };
  }

  /**
   * Bij het starten van de add-on: staat hij er van de add-on en is er een
   * nieuwe versie, dan die. Staat alleen de oude naam er van de add-on, dan
   * de nieuwe naam en de oude weg.
   */
  async bijwerken(): Promise<boolean> {
    const nu = await this.stand();
    if (!nu.kan) return false;
    if (nu.staat === 'nee' && nu.oud === 'add-on') return (await this.zetNeer()).ok;
    if (nu.staat !== 'add-on' || (nu.versie === nu.nieuw && nu.oud !== 'add-on')) return false;
    return (await this.zetNeer()).ok;
  }
}
