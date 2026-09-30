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

export interface Opstart {
  /** Draaien we als Home Assistant-add-on, met het token van de Supervisor? */
  readonly alsAddon: boolean;
  readonly ha: { readonly url: string | null; readonly token: string | null };
  /** Wat er aan de verbinding met Home Assistant ontbreekt. Niet leeg: niet starten. */
  readonly haProblemen: readonly string[];
  readonly web: {
    /** Null: de weergave staat uit. Luisteren is een keuze, geen standaard. */
    readonly poort: number | null;
    readonly host: string;
    readonly dir: string | null;
  };
  /**
   * Mag de pagina configuratie wegschrijven (besluit 42)?
   *
   * Alleen met een weergave, en alleen achter Ingress — of wanneer iemand dat
   * uitdrukkelijk vraagt, en dan met een waarschuwing.
   */
  readonly onboarding: { readonly aan: boolean; readonly zonderIngress: boolean };
  readonly logDir: string;
  readonly tickSeconds: number;
  readonly minIntervalSeconds: number;
  /** Nul zet de bewaking uit. */
  readonly watchdogMinutes: number;
  readonly configPad: string | null;
  readonly siteId: string | null;
  readonly sitesDir: string | null;
  /** Instellingen die niet kloppen. Niet leeg: niet starten. */
  readonly fouten: readonly string[];
}

type Omgeving = Readonly<Record<string, string | undefined>>;

function lees(env: Omgeving, naam: string): string | null {
  const v = env[naam];
  return v != null && v.trim() !== '' ? v.trim() : null;
}

/** Een getal met een ondergrens, of een foutmelding. Ontbreken geeft de standaard. */
function getal(
  env: Omgeving,
  naam: string,
  standaard: number,
  minimum: number,
  fouten: string[],
): number {
  const ruw = lees(env, naam);
  if (ruw == null) return standaard;
  const n = Number(ruw);
  if (!Number.isFinite(n) || n < minimum) {
    fouten.push(`${naam} moet een getal van minstens ${minimum} zijn, niet "${ruw}".`);
    return standaard;
  }
  return n;
}

export function leesOpstart(env: Omgeving): Opstart {
  const fouten: string[] = [];

  /*
   * Add-on of niet.
   *
   * De Supervisor zet `SUPERVISOR_TOKEN` en proxyt Home Assistant. De omgeving
   * wint nog steeds: wie `HA_URL` en `HA_TOKEN` zelf zet, krijgt die — en is
   * dan dus ook geen add-on meer in de zin van "achter Ingress".
   */
  const supervisorToken = lees(env, 'SUPERVISOR_TOKEN');
  const alsAddon =
    supervisorToken != null && lees(env, 'HA_URL') == null && lees(env, 'HA_TOKEN') == null;
  const url = alsAddon ? 'http://supervisor/core/websocket' : lees(env, 'HA_URL');
  const token = alsAddon ? supervisorToken : lees(env, 'HA_TOKEN');

  // "Staat er niet" is iets anders dan "staat er wel maar is leeg": dat tweede
  // is het bestand dat je aanmaakte voordat je het token plakte.
  const haProblemen: string[] = [];
  if (url == null) {
    haProblemen.push('HA_URL' in env ? 'HA_URL staat er wel, maar is leeg.' : 'HA_URL ontbreekt.');
  }
  if (token == null) {
    haProblemen.push(
      'HA_TOKEN' in env
        ? 'HA_TOKEN staat er wel, maar is leeg — het token is nog niet geplakt.'
        : 'HA_TOKEN ontbreekt.',
    );
  }

  const poortRuw = lees(env, 'HEMS_WEB_PORT');
  let poort: number | null = null;
  if (poortRuw != null) {
    const n = Number(poortRuw);
    if (Number.isInteger(n) && n >= 1 && n <= 65535) poort = n;
    else fouten.push(`HEMS_WEB_PORT is geen geldige poort: "${poortRuw}".`);
  }

  // Eén definitie van de schrijfdeur. Stond in twee versies in main.ts.
  const onboardingGevraagd = lees(env, 'HEMS_ONBOARDING') === '1';
  const onboardingAan = poort != null && (alsAddon || onboardingGevraagd);

  return {
    alsAddon,
    ha: { url, token },
    haProblemen,
    web: {
      poort,
      host: lees(env, 'HEMS_WEB_HOST') ?? '0.0.0.0',
      dir: lees(env, 'HEMS_WEB_DIR'),
    },
    onboarding: { aan: onboardingAan, zonderIngress: onboardingAan && !alsAddon },
    // Een lege SHADOW_LOG_DIR betekent bewust: niet loggen. Dus niet `lees`.
    logDir: env['SHADOW_LOG_DIR'] ?? 'data/shadow',
    tickSeconds: getal(env, 'SHADOW_TICK_SECONDS', 30, 1, fouten),
    minIntervalSeconds: getal(env, 'SHADOW_MIN_INTERVAL_SECONDS', 15, 0, fouten),
    watchdogMinutes: getal(env, 'SHADOW_WATCHDOG_MINUTES', 10, 0, fouten),
    configPad: lees(env, 'HEMS_CONFIG'),
    siteId: lees(env, 'HEMS_SITE'),
    sitesDir: lees(env, 'HEMS_SITES_DIR'),
    fouten,
  };
}
