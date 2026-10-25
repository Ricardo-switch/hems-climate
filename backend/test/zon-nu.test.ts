/**
 * Waar de zon staat voor de kop op Thuis (25 oktober 2026): op, nog niet op,
 * of vandaag niet meer genoeg. Dan zegt het huis niet "wacht op zon".
 */

import { describe, expect, it } from 'vitest';

import { zonNuVan } from '../src/web/assistant.js';

describe('waar de zon staat', () => {
  it('is op overdag, nog niet op voor de ochtend, en weg als hij s middags laag staat of onder is', () => {
    expect(zonNuVan(30, 180)).toBe('op');
    expect(zonNuVan(12, 230)).toBe('op');
    expect(zonNuVan(8, 240)).toBe('weg');
    expect(zonNuVan(-20, 330)).toBe('weg');
    expect(zonNuVan(-20, 30)).toBe('nog');
    expect(zonNuVan(1, 100)).toBe('nog');
    expect(zonNuVan(5, 110)).toBe('op');
  });
});
