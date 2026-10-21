import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { KAMERWOORDEN, metLidwoord } from '../src/web/kamerwoorden.js';

describe('kamerwoorden (besluit 131)', () => {
  it('geeft een gewone kamer zijn lidwoord en laat een eigen naam staan', () => {
    expect(metLidwoord('Zolder')).toBe('de zolder');
    expect(metLidwoord('Kantoor boven')).toBe('het kantoor boven');
    expect(metLidwoord('Tuinhuis')).toBe('het tuinhuis');
    expect(metLidwoord('Beneden')).toBe('Beneden');
    expect(metLidwoord('Kamerplant')).toBe('Kamerplant');
  });

  it('is dezelfde lijst als in de app (frontend/src/basis.js)', () => {
    const basis = readFileSync(join(import.meta.dirname, '..', '..', 'frontend', 'src', 'basis.js'), 'utf-8');
    const blok = /const KAMERWOORDEN = \{([^}]*)\}/.exec(basis)?.[1] ?? '';
    const app = Object.fromEntries([...blok.matchAll(/(\w+): '(de|het)'/g)].map((m) => [m[1], m[2]]));
    expect(app).toEqual(KAMERWOORDEN);
  });
});
