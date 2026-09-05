/**
 * Waar de configuratie vandaan komt.
 *
 * Bewust gescheiden van `schema.ts`: die kent alleen `unknown` in en een
 * gevalideerde `SiteConfig` uit, en weet niets van bestanden. Straks komt de
 * configuratie uit Postgres of achter een API vandaan, en dan is dat een nieuwe
 * bron in dit bestand — geen herschrijving van de validatie.
 */

import { existsSync, readFileSync } from 'node:fs';
import { readdirSync, type Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import {
  formatProblems,
  parseSiteConfig,
  type ConfigResult,
  type ParseOptions,
} from './schema.js';

/** Waar configuraties standaard staan, gerekend vanaf de projectwortel. */
export const SITES_DIR = 'config/sites';

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ConfigError';
  }

  /** De hele klacht als leesbaar blok, klaar voor de console. */
  format(): string {
    return [this.message, ...this.details].join('\n');
  }
}

function parseJson(text: string, source: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    // JSON.parse noemt de positie maar niet de regel; die erbij zoeken scheelt
    // zoeken in een bestand van tweehonderd regels.
    const message = error instanceof Error ? error.message : String(error);
    const at = /position (\d+)/.exec(message)?.[1];
    let where = '';
    if (at != null) {
      const upto = text.slice(0, Number(at));
      const line = upto.split('\n').length;
      const column = Number(at) - upto.lastIndexOf('\n');
      where = ` (regel ${line}, kolom ${column})`;
    }
    throw new ConfigError(`${source} bevat geen geldige JSON${where}.`, [`  ${message}`]);
  }
}

/** Leest en valideert. Werpt met een leesbare uitleg wanneer er iets mankeert. */
export function parseOrThrow(
  text: string,
  source: string,
  options: ParseOptions = {},
): { config: ReturnType<typeof mustBeOk>; warnings: readonly string[] } {
  const result = parseSiteConfig(parseJson(text, source), options);
  return mustBeOkWithWarnings(result, source);
}

function mustBeOk(result: ConfigResult, source: string) {
  if (!result.ok) {
    throw new ConfigError(
      `De configuratie in ${source} klopt niet (${result.problems.length} ${
        result.problems.length === 1 ? 'probleem' : 'problemen'
      }):`,
      formatProblems(result.problems),
    );
  }
  return result.config;
}

function mustBeOkWithWarnings(result: ConfigResult, source: string) {
  const config = mustBeOk(result, source);
  const warnings = result.ok ? formatProblems(result.warnings) : [];
  return { config, warnings };
}

/** Synchrone variant, voor tests en opstartcode. */
export function loadSiteConfigFileSync(
  path: string,
  options: ParseOptions = {},
): { config: ReturnType<typeof mustBeOk>; warnings: readonly string[]; source: string } {
  const source = resolve(path);
  let text: string;
  try {
    text = readFileSync(source, 'utf-8');
  } catch {
    throw new ConfigError(`Kan de configuratie niet lezen: ${source}`);
  }
  return { ...parseOrThrow(text, source, options), source };
}

export async function loadSiteConfigFile(
  path: string,
  options: ParseOptions = {},
): Promise<{ config: ReturnType<typeof mustBeOk>; warnings: readonly string[]; source: string }> {
  const source = resolve(path);
  let text: string;
  try {
    text = await readFile(source, 'utf-8');
  } catch {
    throw new ConfigError(`Kan de configuratie niet lezen: ${source}`);
  }
  return { ...parseOrThrow(text, source, options), source };
}

/**
 * Zoekt `config/sites` omhoog vanaf een startpunt.
 *
 * De configuratie hoort bij de installatie, niet bij de backend-code, en staat
 * daarom in de wortel van de monorepo. Maar `npm run shadow` draait vanuit
 * `backend/`, en een gecompileerde `dist/` zit weer een niveau anders. Omhoog
 * zoeken werkt in alle drie de gevallen, en faalt luid als er niets is.
 */
function findSitesDir(from: string): string | null {
  let dir = resolve(from);
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, SITES_DIR);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}


/**
 * Legt uit wat er dan wél in de map staat.
 *
 * "Geen configuratiebestanden gevonden" is waar maar niet behulpzaam. Meestal
 * staat het bestand er wel, alleen een niveau te diep — bijvoorbeeld doordat een
 * container-mount de map hernoemde. Dan wil je dat meteen zien in plaats van te
 * moeten gaan graven in een draaiende container.
 */
function describeDir(dir: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return ['  (de map is niet te lezen)'];
  }
  if (entries.length === 0) return ['  De map is leeg.'];

  const lines = ['  Wat er wel staat:'];
  for (const e of entries.slice(0, 12)) {
    lines.push(`    ${e.name}${e.isDirectory() ? '/' : ''}`);
  }
  if (entries.length > 12) lines.push(`    … en nog ${entries.length - 12}`);

  // De meest voorkomende vergissing benoemen we expliciet.
  const nested = entries.filter(
    (e) => e.isDirectory() && readdirSafe(join(dir, e.name)).some((n) => n.endsWith('.json')),
  );
  for (const n of nested) {
    lines.push('');
    lines.push(`  In ${n.name}/ staan wel .json-bestanden. Staat je configuratie`);
    lines.push('  een niveau te diep? Vergelijk de mount met de mappenstructuur');
    lines.push('  van het project.');
  }
  return lines;
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

export interface ResolveOptions {
  /** Expliciet pad; wint van alles. Meestal uit HEMS_CONFIG. */
  readonly explicitPath?: string | undefined;
  /** Site-id; zoekt `config/sites/<id>.json`. Meestal uit HEMS_SITE. */
  readonly siteId?: string | undefined;
  /** Wortel waarin `config/sites` gezocht wordt. */
  readonly root?: string;
}

/**
 * Kiest welk configuratiebestand geladen wordt.
 *
 * Eén site is het gewone geval en hoeft niets in te stellen: staat er precies
 * één bestand in `config/sites`, dan is dat hem. Zijn het er meer, dan moet je
 * kiezen — en dan noemt de fout ze allemaal op, in plaats van er stilzwijgend
 * één te pakken.
 */
export async function resolveConfigPath(options: ResolveOptions = {}): Promise<string> {
  const root = options.root ?? process.cwd();

  if (options.explicitPath) {
    return isAbsolute(options.explicitPath)
      ? options.explicitPath
      : resolve(root, options.explicitPath);
  }

  const dir = findSitesDir(root);
  if (dir == null) {
    throw new ConfigError(`Geen map ${SITES_DIR} gevonden vanaf ${resolve(root)}.`, [
      '  Zet er een configuratiebestand neer, of wijs met HEMS_CONFIG een pad aan.',
    ]);
  }
  if (options.siteId) return join(dir, `${options.siteId}.json`);

  let entries: string[];
  try {
    entries = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  } catch {
    throw new ConfigError(`De map ${dir} is niet te lezen.`);
  }

  if (entries.length === 1) return join(dir, entries[0]!);
  if (entries.length === 0) {
    throw new ConfigError(`Geen configuratiebestanden gevonden in ${dir}.`, [
      ...describeDir(dir),
      '',
      '  Zet er een .json neer, of wijs met HEMS_CONFIG een pad aan.',
    ]);
  }
  throw new ConfigError(`Er staan ${entries.length} configuraties in ${dir}.`, [
    '  Kies er een met HEMS_SITE=<naam zonder .json> of HEMS_CONFIG=<pad>:',
    ...entries.map((e) => `    ${e.replace(/\.json$/, '')}`),
  ]);
}

/** Synchrone variant, voor de offline gereedschappen. */
export function resolveConfigPathSync(options: ResolveOptions = {}): string {
  const root = options.root ?? process.cwd();
  if (options.explicitPath) {
    return isAbsolute(options.explicitPath)
      ? options.explicitPath
      : resolve(root, options.explicitPath);
  }
  const dir = findSitesDir(root);
  if (dir == null) {
    throw new ConfigError(`Geen map ${SITES_DIR} gevonden vanaf ${resolve(root)}.`, [
      '  Zet er een configuratiebestand neer, of wijs met HEMS_CONFIG een pad aan.',
    ]);
  }
  if (options.siteId) return join(dir, `${options.siteId}.json`);
  const entries = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (entries.length === 1) return join(dir, entries[0]!);
  if (entries.length === 0) {
    throw new ConfigError(`Geen configuratiebestanden gevonden in ${dir}.`, [
      ...describeDir(dir),
    ]);
  }
  throw new ConfigError(`Er staan ${entries.length} configuraties in ${dir}.`, [
    '  Kies er een met HEMS_SITE=<naam zonder .json> of HEMS_CONFIG=<pad>:',
    ...entries.map((e) => `    ${e.replace(/\.json$/, '')}`),
  ]);
}

/** Het gewone startpad: kiezen, lezen, valideren. */
export async function loadSiteConfig(
  options: ResolveOptions & ParseOptions = {},
): Promise<{ config: ReturnType<typeof mustBeOk>; warnings: readonly string[]; source: string }> {
  const path = await resolveConfigPath(options);
  return loadSiteConfigFile(path, options);
}
