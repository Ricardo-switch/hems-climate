/**
 * De eigen stand op schijf (besluit 62).
 *
 * Het bestand is klein en de logica ook; wat hier bewaakt wordt, is dat het
 * nooit de reden wordt dat de dienst niet start, en dat het niet bij elke
 * evaluatie opnieuw de schijf op gaat.
 */

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { StateFile, parseSavedState, type SavedState } from '../src/adapters/state-file.js';

const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const dirs: string[] = [];

afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

async function freshDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'hems-state-'));
  dirs.push(d);
  return d;
}

function state(over: Partial<SavedState> = {}): SavedState {
  return {
    version: 1,
    savedAtMs: NOW,
    mode: null,
    timers: { stabilisation: { endsAtMs: NOW + 300_000 }, manualOverride: { endsAtMs: null } },
    actuators: { 'ac-zolder': { action: 'cool', setpointC: 21.5, lastChangeMs: NOW - 60_000 } },
    ...over,
  };
}

function fail(error: unknown): never {
  throw error;
}

describe('de eigen stand op schijf', () => {
  it('leest terug wat hij schreef', async () => {
    const dir = await freshDir();
    const file = new StateFile(dir, fail);
    file.save(state());
    await file.settled();

    expect(new StateFile(dir, fail).load()).toEqual(state());
  });

  it('kent geen bestand als een gewone eerste start', async () => {
    expect(new StateFile(await freshDir(), fail).load()).toBeNull();
  });

  it('noemt de reden wanneer het bestand niet deugt', () => {
    expect(parseSavedState('{ half')).toBe('geen geldige JSON');
    expect(parseSavedState(JSON.stringify({ ...state(), version: 2 }))).toBe('onbekende versie 2');
    expect(parseSavedState(JSON.stringify({ ...state(), mode: 'disco' }))).toBe('onbekende modus disco');
    expect(
      parseSavedState(
        JSON.stringify({ ...state(), actuators: { x: { action: 'dansen', setpointC: null, lastChangeMs: null } } }),
      ),
    ).toBe('apparaat x: onbekende actie dansen');
    expect(
      parseSavedState(JSON.stringify({ ...state(), timers: { stabilisation: { endsAtMs: 'straks' } } })),
    ).toBe('timer stabilisation is onleesbaar');
  });

  it('schrijft niet opnieuw zolang er niets verandert', async () => {
    const dir = await freshDir();
    const file = new StateFile(dir, fail);
    file.save(state());
    await file.settled();
    // Iemand anders zet er iets neer; een ongewijzigde stand mag dat niet overschrijven.
    await writeFile(join(dir, 'own-state.json'), 'van iemand anders', 'utf-8');

    file.save(state({ savedAtMs: NOW + 60_000 }));
    await file.settled();
    expect(await readFile(join(dir, 'own-state.json'), 'utf-8')).toBe('van iemand anders');

    // Een echte wijziging wel.
    file.save(state({ savedAtMs: NOW + 120_000, mode: 'nacht' }));
    await file.settled();
    expect(new StateFile(dir, fail).load()).toMatchObject({ mode: 'nacht' });
  });

  it('ververst het tijdstip minstens elke vijf minuten, ook zonder wijziging', async () => {
    const dir = await freshDir();
    const file = new StateFile(dir, fail);
    file.save(state());
    file.save(state({ savedAtMs: NOW + 5 * 60_000 }));
    await file.settled();
    expect(new StateFile(dir, fail).load()).toMatchObject({ savedAtMs: NOW + 5 * 60_000 });
  });

  it('laat geen tijdelijk bestand achter', async () => {
    const dir = await freshDir();
    const file = new StateFile(dir, fail);
    file.save(state());
    await file.settled();
    expect(await readdir(dir)).toEqual(['own-state.json']);
  });

  it('meldt een schrijffout en probeert het de volgende keer opnieuw', async () => {
    const errors: unknown[] = [];
    const file = new StateFile(join(await freshDir(), 'bestaat-niet'), (e) => errors.push(e));
    file.save(state());
    await file.settled();
    expect(errors).toHaveLength(1);

    file.save(state({ savedAtMs: NOW + 1_000 }));
    await file.settled();
    expect(errors).toHaveLength(2);
  });
});
