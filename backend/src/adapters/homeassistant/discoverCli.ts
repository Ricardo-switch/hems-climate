/**
 * `--discover`: kijk wat er in huis staat en stel een configuratie voor.
 *
 *   node dist/main.js --discover
 *   node dist/main.js --discover config/sites/mijn-huis.json
 *
 * Zonder pad komt het voorstel op het scherm. Mét pad wordt het weggeschreven,
 * maar nooit over een bestaand bestand heen: een configuratie is het resultaat
 * van keuzes, en die overschrijf je niet omdat iemand een commando herhaalt.
 *
 * Wat hier gebeurt is lezen en voorstellen. Het besluit ligt bij de bewoner —
 * daarom komt elke keuze terug met de reden en de alternatieven, en heet wat
 * geraden is ook geraden.
 */

import { writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mkdir, access } from 'node:fs/promises';

import { HaClient, type HaEntityState } from './client.js';
import { fetchRegistries, discover, type Finding, type Proposal } from './discovery.js';

const BRAND: Record<Finding['soort'], string> = {
  gevonden: 'GEVONDEN   ',
  geraden: 'GERADEN    ',
  overgeslagen: 'OVERGESLAGEN',
  ontbreekt: 'ONTBREEKT  ',
};

/** Volgorde waarin een mens dit wil lezen: eerst wat aandacht vraagt. */
const ORDER: Finding['soort'][] = ['ontbreekt', 'geraden', 'gevonden', 'overgeslagen'];

export function formatReport(proposal: Proposal): string {
  const lines: string[] = [];
  lines.push('─'.repeat(72));
  lines.push('  WAT ER IN HUIS STAAT');
  lines.push('─'.repeat(72));

  for (const kind of ORDER) {
    const group = proposal.bevindingen.filter((b) => b.soort === kind);
    if (group.length === 0) continue;
    lines.push('');
    for (const b of group) {
      lines.push(`  ${BRAND[b.soort]}  ${b.pad}`);
      lines.push(`                ${b.tekst}`);
      if (b.alternatieven?.length) {
        // Een lijst van zeventien leest niemand. Zes en een telling wel.
        const first = b.alternatieven.slice(0, 6);
        const rest = b.alternatieven.length - first.length;
        lines.push(
          `                ook mogelijk: ${first.join(', ')}` +
            (rest > 0 ? ` … en nog ${rest}` : ''),
        );
      }
    }
  }

  const zones = (proposal.config['zones'] as unknown[] | undefined)?.length ?? 0;
  const actuators = (proposal.config['actuators'] as unknown[] | undefined)?.length ?? 0;
  lines.push('');
  lines.push('─'.repeat(72));
  lines.push(`  Voorstel: ${zones} zone${zones === 1 ? '' : 's'}, ${actuators} ${actuators === 1 ? 'apparaat' : 'apparaten'}`);
  lines.push('─'.repeat(72));
  return lines.join('\n');
}

export interface DiscoverOptions {
  readonly url: string;
  readonly token: string;
  /** Waar het voorstel heen moet, of null om het te tonen. */
  readonly target: string | null;
  /** Hoe lang we op Home Assistant wachten voordat we opgeven. */
  readonly waitMs?: number;
}

export async function discoverCli(options: DiscoverOptions): Promise<number> {
  const client = new HaClient({
    url: options.url,
    token: options.token,
    // Ook hier expliciet. Ontdekken is lezen (besluit 15).
    allowWrites: false,
  });

  const states = await new Promise<HaEntityState[] | Error>((resolve) => {
    const timer = setTimeout(
      () => resolve(new Error('Home Assistant antwoordde niet binnen de wachttijd.')),
      options.waitMs ?? 30_000,
    );
    timer.unref?.();
    client.once('ready', (s: HaEntityState[]) => {
      clearTimeout(timer);
      resolve(s);
    });
    client.once('error', (e: Error) => {
      clearTimeout(timer);
      resolve(e);
    });
    client.connect();
  });

  if (states instanceof Error) {
    client.close();
    console.error(`Verbinden mislukt: ${states.message}`);
    return 1;
  }

  try {
    const registers = await fetchRegistries(client, states);
    const proposal = discover(registers);
    const json = `${JSON.stringify(proposal.config, null, 2)}\n`;

    console.log(formatReport(proposal));

    if (options.target == null) {
      console.log('');
      console.log(json);
      console.log('Wegschrijven kan met:  node dist/main.js --discover <pad>');
      return 0;
    }

    // Niet over een bestaande configuratie heen. Een tweede keer draaien is
    // makkelijk; de keuzes die in dat bestand staan zijn dat niet.
    const alreadyExists = await access(options.target).then(
      () => true,
      () => false,
    );
    if (alreadyExists) {
      console.error('');
      console.error(`${options.target} bestaat al; er is niets geschreven.`);
      console.error('Verplaats of hernoem dat bestand eerst.');
      return 1;
    }

    await mkdir(dirname(options.target), { recursive: true });
    await writeFile(options.target, json, 'utf-8');
    console.log('');
    console.log(`Geschreven naar ${options.target}`);
    console.log('Kijk het na en draai daarna:  node dist/main.js --check-config');
    return 0;
  } catch (error) {
    console.error(`Ontdekken mislukt: ${(error as Error).message}`);
    return 1;
  } finally {
    client.close();
  }
}
