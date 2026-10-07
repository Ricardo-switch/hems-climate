/**
 * Plaatjes bij de Hue-scènes (besluit 100): uit een map van de bewoner, op de
 * naam van de scène, ook als die Nederlands is en het plaatje Engels heet.
 */

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SCENE_PICTURES_DIR, ScenePictures, pictureCandidates } from '../src/web/scene-pictures.js';

describe('scèneplaatjes', () => {
  it('zoekt eerst de eigen naam, dan de Engelse uit de Hue-app; een nummer erachter telt niet', () => {
    expect(pictureCandidates('Arctische dageraad')).toEqual(['arctische_dageraad', 'arctic_aurora']);
    expect(pictureCandidates('Natuurlijk licht 3')).toEqual(['natuurlijk_licht', 'natural_light']);
    expect(pictureCandidates('Smaragd-gefladder')).toEqual(['smaragd_gefladder', 'emerald_flutter']);
    expect(pictureCandidates('Palm Beach')).toEqual(['palm_beach']);
    expect(pictureCandidates("'s Nachts")).toEqual(['s_nachts']);
  });

  it('leest de map, en zonder map zijn er geen plaatjes', async () => {
    const logDir = await mkdtemp(join(tmpdir(), 'hems-plaatjes-'));
    const pics = new ScenePictures(logDir);
    await pics.refresh();
    expect(pics.pictureFor('Helder')).toBeNull();
    await mkdir(join(logDir, SCENE_PICTURES_DIR));
    for (const f of ['bright.png', 'relax.png', 'lezen.jpg', 'niet goed.png', 'notes.txt']) await writeFile(join(logDir, SCENE_PICTURES_DIR, f), 'x');
    await pics.refresh();
    expect(pics.pictureFor('Helder')).toBe('scene-plaatjes/bright.png');
    expect(pics.pictureFor('Ontspannen 2')).toBe('scene-plaatjes/relax.png');
    // Een eigen plaatje met de Nederlandse naam gaat voor.
    expect(pics.pictureFor('Lezen')).toBe('scene-plaatjes/lezen.jpg');
    expect(pics.pictureFor('Tyrell')).toBeNull();
  });
});
