/**
 * De poortkeuze van de testservers (zie ports.ts).
 */

import { describe, expect, it } from 'vitest';

import { isBlockedPort, onUsablePort } from './ports.js';

describe('een bruikbare poort voor testservers', () => {
  it('weigert wat fetch weigert, en laat de rest door', async () => {
    expect(isBlockedPort(6666)).toBe(true);
    expect(isBlockedPort(10080)).toBe(true);
    expect(isBlockedPort(6670)).toBe(false);

    // Niet alleen de lijst: Node zelf weigert de poort, zonder te verbinden.
    const refused = await fetch('http://127.0.0.1:6666/').then(
      () => 'verbonden',
      (error: unknown) => String((error as { cause?: unknown }).cause),
    );
    expect(refused).toContain('bad port');
  });

  it('houdt een geweigerde poort vast tot er een goede is, en ruimt hem dan op', async () => {
    const handedOut = [5060, 6000, 49_731];
    const open: number[] = [];
    const port = await onUsablePort(
      () => {
        const p = handedOut.shift()!;
        open.push(p);
        return Promise.resolve(p);
      },
      (p) => p,
      (p) => {
        // Pas weg als de goede er is: anders kon dezelfde poort terugkomen.
        expect(open).toContain(49_731);
        open.splice(open.indexOf(p), 1);
        return Promise.resolve();
      },
    );
    expect(port).toBe(49_731);
    expect(open).toEqual([49_731]);
  });
});
