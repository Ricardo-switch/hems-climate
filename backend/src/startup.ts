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
  /**
   * Mag de pagina lampen aan- en uitzetten (besluit 97)?
   *
   * Alleen met een weergave. Achter Ingress standaard aan, want daar staat de
   * inlog van Home Assistant voor; elders alleen met `HEMS_LIGHTS=1`, en dan met
   * een waarschuwing. `HEMS_LIGHTS=0` zet het overal uit.
   */
  readonly lights: { readonly enabled: boolean; readonly withoutIngress: boolean };
  /**
   * Mag de bewoner schermen bedienen in de app (besluit 121)? Volgt licht
   * bedienen, tenzij `HEMS_SCREENS` het anders zegt (1 of 0).
   */
  readonly screens: { readonly enabled: boolean };
  /**
   * Wie mag bedienen (besluit 99). In de add-on staat Ingress ervoor; elders een
   * eigen inlog via Home Assistant, met het adres waaronder de browser Home
   * Assistant bereikt. `HEMS_OPEN=1` zet alles open, zoals vóór 99, met een
   * waarschuwing.
   */
  readonly access:
    | { readonly kind: 'ingress' }
    | { readonly kind: 'open' }
    | { readonly kind: 'sessions'; readonly haLoginUrl: string | null; readonly hosts: readonly string[] };
  /**
   * Een eigen poort voor de add-on (besluit 160), naast Ingress, of null. Daar
   * installeer je de app los op de telefoon, via Tailscale, met een eigen inlog
   * via Home Assistant: de browser gaat naar `haLoginUrl` (het adres waarop de
   * telefoon Home Assistant bereikt), de dienst zelf naar `haDienstUrl`.
   */
  readonly eigenPoort: { readonly port: number; readonly haLoginUrl: string; readonly haDienstUrl: string } | null;
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

  const lightsRaw = readPoint(env, 'HEMS_LIGHTS');
  if (lightsRaw != null && lightsRaw !== '0' && lightsRaw !== '1') {
    errors.push(`HEMS_LIGHTS is 1 (licht bedienen) of 0 (niet), niet "${lightsRaw}".`);
  }
  const lightsOn = port != null && (lightsRaw === '1' || (asAddon && lightsRaw !== '0'));
  const screensRaw = readPoint(env, 'HEMS_SCREENS');
  if (screensRaw != null && screensRaw !== '0' && screensRaw !== '1') {
    errors.push(`HEMS_SCREENS is 1 (schermen bedienen) of 0 (niet), niet "${screensRaw}".`);
  }
  const screensOn = port != null && (screensRaw === '1' || (screensRaw == null && lightsOn));

  const openRaw = readPoint(env, 'HEMS_OPEN');
  if (openRaw != null && openRaw !== '0' && openRaw !== '1') {
    errors.push(`HEMS_OPEN is 1 (iedereen mag bedienen) of 0, niet "${openRaw}".`);
  }
  const hosts = (readPoint(env, 'HEMS_HOSTS') ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter((h) => h !== '');
  const access: Startup['access'] = asAddon
    ? { kind: 'ingress' }
    : openRaw === '1'
      ? { kind: 'open' }
      : { kind: 'sessions', haLoginUrl: readPoint(env, 'HEMS_HA_LOGIN_URL') ?? url, hosts };

  /*
   * De eigen poort (besluit 160). Alleen in de add-on: elders is er al een
   * eigen inlog op de gewone poort. Zonder het adres van Home Assistant voor de
   * browser kan niemand er inloggen, dus dat is een fout, geen stille poort.
   */
  let eigenPoort: Startup['eigenPoort'] = null;
  const eigenRaw = readPoint(env, 'HEMS_EIGEN_POORT');
  if (eigenRaw != null) {
    const n = Number(eigenRaw);
    const loginUrl = readPoint(env, 'HEMS_HA_LOGIN_URL');
    if (!Number.isInteger(n) || n < 1 || n > 65535) errors.push(`HEMS_EIGEN_POORT is geen geldige poort: "${eigenRaw}".`);
    else if (!asAddon) errors.push('HEMS_EIGEN_POORT is alleen voor de add-on; elders heeft de gewone poort al een eigen inlog.');
    else if (port == null) errors.push('HEMS_EIGEN_POORT vraagt ook HEMS_WEB_PORT: zonder weergave is er niets te openen.');
    else if (n === port) errors.push(`HEMS_EIGEN_POORT moet een andere poort zijn dan HEMS_WEB_PORT (${port}).`);
    else if (loginUrl == null) errors.push('HEMS_EIGEN_POORT vraagt HEMS_HA_LOGIN_URL: het adres waarop de telefoon Home Assistant bereikt.');
    else eigenPoort = { port: n, haLoginUrl: loginUrl, haDienstUrl: readPoint(env, 'HEMS_HA_DIENST_URL') ?? 'http://homeassistant:8123' };
  }

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
    // Zonder Ingress en zonder inlog kan iedereen die de weergave opent schakelen.
    lights: { enabled: lightsOn, withoutIngress: lightsOn && access.kind === 'open' },
    screens: { enabled: screensOn },
    access,
    eigenPoort,
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
