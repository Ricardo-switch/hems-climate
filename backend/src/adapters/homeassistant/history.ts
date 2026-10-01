/**
 * De ruwe historie, live vastgelegd (besluit 52).
 *
 * De replay-harness rekent op een dataset met elke toestandswijziging van de
 * entiteiten die de regeling leest. Die kwam uit de recorder van Home Assistant,
 * met de hand geëxporteerd — en die recorder ruimt op. Op de standaard van tien
 * dagen was half september al weg voordat iemand exporteerde, en een nachtelijke
 * export zou een geplande taak, een Samba-share en een wachtwoord op de NAS
 * vragen.
 *
 * Terwijl de schaduwdienst diezelfde wijzigingen al live ontvangt, gefilterd op
 * precies de entiteiten uit de configuratie. Dan is wegschrijven de kortste weg:
 * geen bewaartermijn, geen tweede systeem, en per definitie de entiteiten die de
 * replay nodig heeft — de store volgt dezelfde lijst als de vertaling leest.
 *
 * **Het formaat is dat van de dataset** (`DatasetRow`), één regel per wijziging
 * in `history-JJJJ-MM-DD.ndjson` naast het beslislogboek. `tools/stitch-history.ts`
 * maakt er een replay-bestand van.
 *
 * **Het bestand volgt de dag van ontvangst, niet van de meting.** Bij elk
 * (her)verbinden wordt de volledige stand vastgelegd, zodat de replay weet waar
 * hij begint. Een sensor die drie dagen niet veranderde heeft dan een tijdstempel
 * van drie dagen terug; die rij in het bestand van die dag zetten zou een
 * afgesloten dag openbreken. `loadHistory` sorteert per entiteit, dus de volgorde
 * in het bestand doet er niet toe.
 *
 * **Wat hier niet in zit: de gaten.** Ligt de dienst eruit, dan mist deze
 * historie wat er in die tijd gebeurde; bij het herverbinden komt alleen de stand
 * op dat moment binnen. De recorder, die sinds 30 september 2026 zestig dagen
 * bewaart, blijft daarvoor het vangnet.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  KEPT_ATTRIBUTES,
  type DatasetRow,
  type KeptAttribute,
} from '../../replay/dataset.js';
import type { HaEntityState } from './client.js';

/** Eén toestand uit Home Assistant als datasetregel, of null als hij onleesbaar is. */
export function toRow(s: HaEntityState): DatasetRow | null {
  const t = Date.parse(s.last_updated);
  if (!Number.isFinite(t)) return null;

  const a: Partial<Record<KeptAttribute, string | number | null>> = {};
  let kept = false;
  for (const k of KEPT_ATTRIBUTES) {
    if (!(k in s.attributes)) continue;
    const v = s.attributes[k];
    if (typeof v === 'string' || typeof v === 'number' || v === null) {
      a[k] = v;
      kept = true;
    }
  }
  return { t, e: s.entity_id, s: s.state, ...(kept ? { a } : {}) };
}

export class HistoryWriter {
  readonly #map: string;
  readonly #now: () => number;
  readonly #onError: (error: unknown) => void;
  /**
   * Alles achter elkaar. `appendFile` garandeert geen volgorde tussen
   * gelijktijdige aanroepen, en een event-handler wacht niet.
   */
  #queue: Promise<void> = Promise.resolve();

  constructor(map: string, now: () => number, error: (error: unknown) => void) {
    this.#map = map;
    this.#now = now;
    this.#onError = error;
  }

  /**
   * Zet toestanden in de wachtrij om weg te schrijven. Keert meteen terug: dit
   * wordt vanuit een event-handler aangeroepen, en een trage schijf hoort de
   * regeling niet op te houden. Een fout gaat naar `fout` en breekt de rij niet.
   */
  record(states: readonly HaEntityState[]): void {
    const lines = states
      .map(toRow)
      .filter((r): r is DatasetRow => r != null)
      .map((r) => `${JSON.stringify(r)}\n`)
      .join('');
    if (lines === '') return;

    const day = new Date(this.#now()).toISOString().slice(0, 10);
    const file = join(this.#map, `history-${day}.ndjson`);
    this.#queue = this.#queue
      .then(async () => {
        await mkdir(this.#map, { recursive: true });
        await appendFile(file, lines, 'utf-8');
      })
      .catch((error: unknown) => this.#onError(error));
  }

  /** Belooft dat alles tot nu toe op schijf staat. Voor afsluiten en tests. */
  settled(): Promise<void> {
    return this.#queue;
  }
}
