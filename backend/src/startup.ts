/**
 * Wat de omgeving zegt over hoe deze dienst draait (besluit 55).
 *
 * Dit stond verspreid door `main.ts`, tussen `process.exit`-aanroepen door, en
 * was daardoor niet te testen. Terwijl juist hier de schakelaars zitten die er
 * het meest toe doen: draaien we als add-on, mag de pagina configuratie
 * wegschrijven, luistert de dienst op het netwerk. De voorwaarde voor die
 * schrijfdeur stond er zelfs twee keer in, op twee plekken die niets
 * bewaakte om gelijk te blijven.
 *
 * Nu leidt één zuivere functie alles af uit de omgeving, en voert `main.ts` het
 * alleen nog uit. Wat hier fout is, komt in `fouten` en niet stil in een
 * standaardwaarde: een hartslag van "30s" of van nul is een typefout, geen
 * wens, en een dienst die daarop zonder pauze gaat rekenen merk je pas aan de
 * processor.
 */

export interface Startup {
  /** Draaien we als Home Assistant-add-on, met het token van de Supervisor? */
  readonly asAddon: boolean;
  readonly ha: { readonly url: string | null; readonly token: string | null };
  /** Wat er aan de verbinding met Home Assistant ontbreekt. Niet leeg: niet starten. */
  readonly haProblems: readonly string[];
  readonly web: {
    /** Null: de weergave staat uit. Luisteren is een keuze, geen standaard. */
    readonly port: number | null;
    readonly host: string;
    readonly dir: string | null;
  };
  /**
   * Mag de pagina configuratie wegschrijven (besluit 42)?
   *
   * Alleen met een weergave, en alleen achter Ingress — of wanneer iemand dat
   * uitdrukkelijk vraagt, en dan met een waarschuwing.
   */
  readonly onboarding: { readonly enabled: boolean; readonly withoutIngress: boolean };
  readonly logDir: string;
  readonly tickSeconds: number;
  readonly minIntervalSeconds: number;
  /** Nul zet de bewaking uit. */
  readonly watchdogMinutes: number;
  readonly configPath: string | null;
  readonly siteId: string | null;
  readonly sitesDir: string | null;
  /** Instellingen die niet kloppen. Niet leeg: niet starten. */
  readonly errors: readonly string[];
}

type Environment = Readonly<Record<string, string | undefined>>;

function readPoint(env: Environment, name: string): string | null {
  const v = env[name];
  return v != null && v.trim() !== '' ? v.trim() : null;
}

/** Een getal met een ondergrens, of een foutmelding. Ontbreken geeft de standaard. */
function numberAttr(
  env: Environment,
  name: string,
  defaults: number,
  minimum: number,
  errors: string[],
): number {
  const raw = readPoint(env, name);
  if (raw == null) return defaults;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < minimum) {
    errors.push(`${name} moet een getal van minstens ${minimum} zijn, niet "${raw}".`);
    return defaults;
  }
  return n;
}

export function readStartup(env: Environment): Startup {
  const errors: string[] = [];

  /*
   * Add-on of niet.
   *
   * De Supervisor zet `SUPERVISOR_TOKEN` en proxyt Home Assistant. De omgeving
   * wint nog steeds: wie `HA_URL` en `HA_TOKEN` zelf zet, krijgt die — en is
   * dan dus ook geen add-on meer in de zin van "achter Ingress".
   */
  const supervisorToken = readPoint(env, 'SUPERVISOR_TOKEN');
  const asAddon =
    supervisorToken != null && readPoint(env, 'HA_URL') == null && readPoint(env, 'HA_TOKEN') == null;
  const url = asAddon ? 'http://supervisor/core/websocket' : readPoint(env, 'HA_URL');
  const token = asAddon ? supervisorToken : readPoint(env, 'HA_TOKEN');

  // "Staat er niet" is iets anders dan "staat er wel maar is leeg": dat tweede
  // is het bestand dat je aanmaakte voordat je het token plakte.
  const haProblems: string[] = [];
  if (url == null) {
    haProblems.push('HA_URL' in env ? 'HA_URL staat er wel, maar is leeg.' : 'HA_URL ontbreekt.');
  }
  if (token == null) {
    haProblems.push(
      'HA_TOKEN' in env
        ? 'HA_TOKEN staat er wel, maar is leeg — het token is nog niet geplakt.'
        : 'HA_TOKEN ontbreekt.',
    );
  }

  const portRaw = readPoint(env, 'HEMS_WEB_PORT');
  let port: number | null = null;
  if (portRaw != null) {
    const n = Number(portRaw);
    if (Number.isInteger(n) && n >= 1 && n <= 65535) port = n;
    else errors.push(`HEMS_WEB_PORT is geen geldige poort: "${portRaw}".`);
  }

  // Eén definitie van de schrijfdeur. Stond in twee versies in main.ts.
  const onboardingRequested = readPoint(env, 'HEMS_ONBOARDING') === '1';
  const onboardingOn = port != null && (asAddon || onboardingRequested);

  return {
    asAddon,
    ha: { url, token },
    haProblems,
    web: {
      port,
      host: readPoint(env, 'HEMS_WEB_HOST') ?? '0.0.0.0',
      dir: readPoint(env, 'HEMS_WEB_DIR'),
    },
    onboarding: { enabled: onboardingOn, withoutIngress: onboardingOn && !asAddon },
    // Een lege SHADOW_LOG_DIR betekent bewust: niet loggen. Dus niet `lees`.
    logDir: env['SHADOW_LOG_DIR'] ?? 'data/shadow',
    tickSeconds: numberAttr(env, 'SHADOW_TICK_SECONDS', 30, 1, errors),
    minIntervalSeconds: numberAttr(env, 'SHADOW_MIN_INTERVAL_SECONDS', 15, 0, errors),
    watchdogMinutes: numberAttr(env, 'SHADOW_WATCHDOG_MINUTES', 10, 0, errors),
    configPath: readPoint(env, 'HEMS_CONFIG'),
    siteId: readPoint(env, 'HEMS_SITE'),
    sitesDir: readPoint(env, 'HEMS_SITES_DIR'),
    errors,
  };
}
