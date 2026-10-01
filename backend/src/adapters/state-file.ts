/**
 * De eigen stand van de dienst, bewaard over een herstart heen (besluit 62).
 *
 * Wat de dienst zelf bijhoudt, zat tot nu toe alleen in het geheugen: de modus
 * en de timers (`OwnState`, besluit 39) en de veronderstelde stand van de
 * apparaten (`ShadowActuators`, besluit 49). Elke herstart wiste dat — en de
 * NAS herstart bij elke uitrol, soms een paar keer per dag. Daarna begon de
 * schaduw opnieuw vanaf het échte apparaat, met een draaitijd die ineens weer
 * het oude systeem mat. Onder echte regeling wordt dat erger: een herstart
 * midden in een rit vergeet wanneer de airco startte, en dan geldt de minimale
 * draaitijd niet meer.
 *
 * Eén klein JSON-bestand in de logmap, zodat het meegaat in de back-up. Bij
 * elke wijziging weggeschreven, en minstens elke vijf minuten, zodat het
 * tijdstip zegt hoe vers de stand is. Eerst een tijdelijk bestand, dan een
 * atomaire rename: een onderbreking laat de vorige versie heel.
 *
 * Een bestand dat niet te lezen is, is geen reden om niet te starten. Dan
 * begint de dienst zoals vroeger, en zegt hij waarom.
 */

import { readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ACTIONS, MODES, type Action, type Mode } from '../core/model.js';
import { TIMER_IDS, type TimerId, type TimerState } from '../core/state.js';
import type { ShadowActuator } from './shadow-actuators.js';

export const STATE_FILE_NAME = 'own-state.json';

export interface SavedState {
  readonly version: 1;
  readonly savedAtMs: number;
  readonly mode: Mode | null;
  readonly timers: Readonly<Record<TimerId, TimerState>>;
  readonly actuators: Readonly<Record<string, ShadowActuator>>;
}

/** Ook zonder wijziging opnieuw wegschrijven, zodat `savedAtMs` vers blijft. */
const REFRESH_MS = 5 * 60_000;

const isNumberOrNull = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isFinite(v));
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Leest en controleert de inhoud. Geeft de reden terug als het niet deugt. */
export function parseSavedState(text: string): SavedState | string {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return 'geen geldige JSON';
  }
  if (!isRecord(raw)) return 'geen object';
  if (raw['version'] !== 1) return `onbekende versie ${String(raw['version'])}`;
  if (typeof raw['savedAtMs'] !== 'number') return 'savedAtMs ontbreekt';

  const mode = raw['mode'];
  if (mode !== null && !(MODES as readonly unknown[]).includes(mode)) {
    return `onbekende modus ${String(mode)}`;
  }

  const timersRaw = raw['timers'];
  if (!isRecord(timersRaw)) return 'timers ontbreken';
  const timers = {} as Record<TimerId, TimerState>;
  for (const id of TIMER_IDS) {
    const t = timersRaw[id];
    if (!isRecord(t) || !isNumberOrNull(t['endsAtMs'])) return `timer ${id} is onleesbaar`;
    timers[id] = { endsAtMs: t['endsAtMs'] };
  }

  const actuatorsRaw = raw['actuators'];
  if (!isRecord(actuatorsRaw)) return 'actuators ontbreken';
  const actuators: Record<string, ShadowActuator> = {};
  for (const [id, a] of Object.entries(actuatorsRaw)) {
    if (!isRecord(a)) return `apparaat ${id} is onleesbaar`;
    const action = a['action'];
    if (action !== null && !(ACTIONS as readonly unknown[]).includes(action)) {
      return `apparaat ${id}: onbekende actie ${String(action)}`;
    }
    if (!isNumberOrNull(a['setpointC']) || !isNumberOrNull(a['lastChangeMs'])) {
      return `apparaat ${id} is onleesbaar`;
    }
    actuators[id] = {
      action: action as Action | null,
      setpointC: a['setpointC'],
      lastChangeMs: a['lastChangeMs'],
    };
  }

  return {
    version: 1,
    savedAtMs: raw['savedAtMs'],
    mode: mode as Mode | null,
    timers,
    actuators,
  };
}

export class StateFile {
  readonly #path: string;
  readonly #onError: (error: unknown) => void;
  #queue: Promise<void> = Promise.resolve();
  #lastContent: string | null = null;
  #lastWriteMs = Number.NEGATIVE_INFINITY;

  constructor(dir: string, onError: (error: unknown) => void) {
    this.#path = join(dir, STATE_FILE_NAME);
    this.#onError = onError;
  }

  /**
   * Synchroon, en alleen bij het starten: de eerste evaluatie hoort de
   * herstelde stand al te zien. Geen bestand is geen fout.
   */
  load(): SavedState | { readonly problem: string } | null {
    let text: string;
    try {
      text = readFileSync(this.#path, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      return { problem: `niet te lezen: ${String(error)}` };
    }
    const parsed = parseSavedState(text);
    return typeof parsed === 'string' ? { problem: parsed } : parsed;
  }

  /** Schrijft weg wanneer er iets veranderde, of wanneer het te lang geleden is. */
  save(state: SavedState): void {
    const { savedAtMs: _omitted, ...content } = state;
    const key = JSON.stringify(content);
    if (key === this.#lastContent && state.savedAtMs - this.#lastWriteMs < REFRESH_MS) return;
    this.#lastContent = key;
    this.#lastWriteMs = state.savedAtMs;

    const text = `${JSON.stringify(state, null, 2)}\n`;
    const tmp = `${this.#path}.tmp`;
    this.#queue = this.#queue
      .then(async () => {
        await writeFile(tmp, text, 'utf-8');
        await rename(tmp, this.#path);
      })
      .catch((error: unknown) => {
        // Volgende keer opnieuw proberen, ook als er dan niets veranderde.
        this.#lastContent = null;
        this.#onError(error);
      });
  }

  /** Belooft dat alles wat tot nu toe is aangeboden, op schijf staat. */
  settled(): Promise<void> {
    return this.#queue;
  }
}
