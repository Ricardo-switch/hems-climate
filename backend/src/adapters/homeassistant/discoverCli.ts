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
import { haalRegisters, ontdek, type Bevinding, type Voorstel } from './discovery.js';

const MERK: Record<Bevinding['soort'], string> = {
  gevonden: 'GEVONDEN   ',
  geraden: 'GERADEN    ',
  overgeslagen: 'OVERGESLAGEN',
  ontbreekt: 'ONTBREEKT  ',
};

/** Volgorde waarin een mens dit wil lezen: eerst wat aandacht vraagt. */
const VOLGORDE: Bevinding['soort'][] = ['ontbreekt', 'geraden', 'gevonden', 'overgeslagen'];

export function rapport(voorstel: Voorstel): string {
  const regels: string[] = [];
  regels.push('─'.repeat(72));
  regels.push('  WAT ER IN HUIS STAAT');
  regels.push('─'.repeat(72));

  for (const soort of VOLGORDE) {
    const groep = voorstel.bevindingen.filter((b) => b.soort === soort);
    if (groep.length === 0) continue;
    regels.push('');
    for (const b of groep) {
      regels.push(`  ${MERK[b.soort]}  ${b.pad}`);
      regels.push(`                ${b.tekst}`);
      if (b.alternatieven?.length) {
        // Een lijst van zeventien leest niemand. Zes en een telling wel.
        const eerste = b.alternatieven.slice(0, 6);
        const rest = b.alternatieven.length - eerste.length;
        regels.push(
          `                ook mogelijk: ${eerste.join(', ')}` +
            (rest > 0 ? ` … en nog ${rest}` : ''),
        );
      }
    }
  }

  const zones = (voorstel.config['zones'] as unknown[] | undefined)?.length ?? 0;
  const apparaten = (voorstel.config['actuators'] as unknown[] | undefined)?.length ?? 0;
  regels.push('');
  regels.push('─'.repeat(72));
  regels.push(`  Voorstel: ${zones} zone${zones === 1 ? '' : 's'}, ${apparaten} ${apparaten === 1 ? 'apparaat' : 'apparaten'}`);
  regels.push('─'.repeat(72));
  return regels.join('\n');
}

export interface DiscoverOpties {
  readonly url: string;
  readonly token: string;
  /** Waar het voorstel heen moet, of null om het te tonen. */
  readonly doel: string | null;
  /** Hoe lang we op Home Assistant wachten voordat we opgeven. */
  readonly wachtMs?: number;
}

export async function discoverCli(opties: DiscoverOpties): Promise<number> {
  const client = new HaClient({
    url: opties.url,
    token: opties.token,
    // Ook hier expliciet. Ontdekken is lezen (besluit 15).
    allowWrites: false,
  });

  const states = await new Promise<HaEntityState[] | Error>((resolve) => {
    const timer = setTimeout(
      () => resolve(new Error('Home Assistant antwoordde niet binnen de wachttijd.')),
      opties.wachtMs ?? 30_000,
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
    const registers = await haalRegisters(client, states);
    const voorstel = ontdek(registers);
    const json = `${JSON.stringify(voorstel.config, null, 2)}\n`;

    console.log(rapport(voorstel));

    if (opties.doel == null) {
      console.log('');
      console.log(json);
      console.log('Wegschrijven kan met:  node dist/main.js --discover <pad>');
      return 0;
    }

    // Niet over een bestaande configuratie heen. Een tweede keer draaien is
    // makkelijk; de keuzes die in dat bestand staan zijn dat niet.
    const bestaatAl = await access(opties.doel).then(
      () => true,
      () => false,
    );
    if (bestaatAl) {
      console.error('');
      console.error(`${opties.doel} bestaat al; er is niets geschreven.`);
      console.error('Verplaats of hernoem dat bestand eerst.');
      return 1;
    }

    await mkdir(dirname(opties.doel), { recursive: true });
    await writeFile(opties.doel, json, 'utf-8');
    console.log('');
    console.log(`Geschreven naar ${opties.doel}`);
    console.log('Kijk het na en draai daarna:  node dist/main.js --check-config');
    return 0;
  } catch (error) {
    console.error(`Ontdekken mislukt: ${(error as Error).message}`);
    return 1;
  } finally {
    client.close();
  }
}
