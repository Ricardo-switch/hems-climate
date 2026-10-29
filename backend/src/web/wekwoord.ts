/**
 * Het wekwoord in de dienst zelf (besluit 208): "Hé huis" horen zonder de
 * openWakeWord-add-on, zodat de gevoeligheid per scherm in te stellen is. Het
 * geluid van de wand komt al langs de dienst (besluit 150); hier gaat het
 * eerst door hetzelfde model dat in de add-on zit (`he_huis.onnx`, besluit
 * 177), met de twee voorstappen van openWakeWord ervoor:
 *
 * 1. elke 80 ms (1280 samples) een stukje mel-spectrogram (8 rijen van 32);
 * 2. de laatste 76 rijen worden één kenmerk van 96 getallen (het model van
 *    Google waar openWakeWord op traint);
 * 3. de laatste 16 kenmerken (ruim een seconde) geven de kans dat het
 *    wekwoord net gezegd is, van 0 tot 1.
 *
 * Dat volgt `openwakeword/utils.py` (AudioFeatures) en `model.py` (predict)
 * stap voor stap, ook het begin: de eerste vijf uitkomsten tellen niet. Het
 * geluid wordt nergens bewaard.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OnnxModel, Schuifstand, tensor } from './onnx.js';

/** Zoveel samples per stap: 80 ms bij 16 kHz. */
export const STAP = 1280;
const MEL_RIJEN = 76;
const KENMERKEN = 16;

export interface Wekmodellen {
  readonly mel: OnnxModel;
  readonly kenmerk: OnnxModel;
  readonly woord: OnnxModel;
  /** Hoe het wekwoord heet, zoals openWakeWord het noemt: "he_huis". */
  readonly naam: string;
}

/** De drie modellen uit een map: melspectrogram.onnx, embedding_model.onnx en het wekwoord. */
export function laadWekmodellen(map: string, naam = 'he_huis'): Wekmodellen {
  const lees = (f: string) => new OnnxModel(new Uint8Array(readFileSync(join(map, f))));
  const m: Wekmodellen = { mel: lees('melspectrogram.onnx'), kenmerk: lees('embedding_model.onnx'), woord: lees(`${naam}.onnx`), naam };
  // Het begin meteen, niet pas bij het eerste scherm dat luistert.
  BEGIN.set(m, beginKenmerken(m));
  return m;
}

/** Een vast "ruisje" om mee te beginnen, zoals openWakeWord dat doet: altijd hetzelfde. */
function ruis(n: number): Int16Array {
  const uit = new Int16Array(n);
  let s = 12345;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    uit[i] = (s % 2000) - 1000;
  }
  return uit;
}

/** Beginkenmerken per set modellen: één keer uitgerekend, daarna gedeeld. */
const BEGIN = new WeakMap<Wekmodellen, readonly Float32Array[]>();

/**
 * Luistert naar één stroom geluid. `voeg` krijgt ruwe PCM (16 kHz, 16 bit,
 * mono) en geeft per volle stap van 80 ms de kans op het wekwoord terug.
 */
export class Wekluisteraar {
  readonly #m: Wekmodellen;
  /** Het ruwe geluid van de laatste stap plus drie hops ervoor (wat het mel-spectrogram nodig heeft). */
  #ruw = new Int16Array(0);
  /** Wat nog geen volle stap is. */
  #rest = new Int16Array(0);
  #mel: Float32Array[];
  #kenmerken: Float32Array[];
  #uitkomsten = 0;
  /** Wat het kenmerkmodel de vorige stap uitrekende: elke stap zijn maar 8 van de 76 rijen nieuw. */
  readonly #stand = new Schuifstand();

  constructor(m: Wekmodellen) {
    this.#m = m;
    this.#mel = Array.from({ length: MEL_RIJEN }, () => new Float32Array(32).fill(1));
    let begin = BEGIN.get(m);
    if (!begin) {
      begin = beginKenmerken(m);
      BEGIN.set(m, begin);
    }
    this.#kenmerken = [...begin];
  }

  /** Nieuw geluid; per volle stap de kans op het wekwoord (0 tot 1). */
  voeg(pcm: Int16Array): number[] {
    const al = new Int16Array(this.#rest.length + pcm.length);
    al.set(this.#rest);
    al.set(pcm, this.#rest.length);
    const kansen: number[] = [];
    let p = 0;
    for (; p + STAP <= al.length; p += STAP) kansen.push(this.#stap(al.subarray(p, p + STAP)));
    this.#rest = al.slice(p);
    return kansen;
  }

  #stap(stuk: Int16Array): number {
    // Het mel-spectrogram over deze stap plus drie hops (480 samples) ervoor.
    const ruw = new Int16Array(Math.min(STAP + 480, this.#ruw.length + STAP));
    const oud = this.#ruw.subarray(this.#ruw.length - (ruw.length - STAP));
    ruw.set(oud);
    ruw.set(stuk, oud.length);
    this.#ruw = ruw;
    const nieuw = melRijen(this.#m, ruw);
    for (const rij of nieuw) this.#mel.push(rij);
    if (this.#mel.length > MEL_RIJEN) this.#mel.splice(0, this.#mel.length - MEL_RIJEN);
    this.#kenmerken.push(kenmerk(this.#m, this.#mel, { schuif: nieuw.length, stand: this.#stand }));
    if (this.#kenmerken.length > KENMERKEN) this.#kenmerken.splice(0, this.#kenmerken.length - KENMERKEN);
    const invoer = tensor([1, KENMERKEN, 96]);
    this.#kenmerken.forEach((k, i) => invoer.data.set(k, i * 96));
    const kans = this.#m.woord.run({ [this.#m.woord.invoer[0]!]: invoer }).data[0]!;
    // De eerste vijf tellen niet: dan zit er nog beginruis in (zoals openWakeWord).
    return ++this.#uitkomsten <= 5 ? 0 : kans;
  }
}

/** De rijen van het mel-spectrogram, met de bewerking die openWakeWord erop doet (x/10 + 2). */
function melRijen(m: Wekmodellen, ruw: Int16Array): Float32Array[] {
  const uit = m.mel.run({ [m.mel.invoer[0]!]: tensor([1, ruw.length], ruw) });
  const n = uit.data.length / 32;
  const rijen: Float32Array[] = [];
  for (let i = 0; i < n; i++) rijen.push(uit.data.slice(i * 32, i * 32 + 32).map((x) => x / 10 + 2));
  return rijen;
}

/** Eén kenmerk uit de laatste 76 rijen; met een stand alleen de nieuwe rijen opnieuw. */
function kenmerk(m: Wekmodellen, mel: readonly Float32Array[], verder?: { readonly schuif: number; readonly stand: Schuifstand }): Float32Array {
  const invoer = tensor([1, MEL_RIJEN, 32, 1]);
  mel.slice(-MEL_RIJEN).forEach((r, i) => invoer.data.set(r, i * 32));
  const uit = verder ? m.kenmerk.runSchuivend(invoer, 1, verder.schuif, verder.stand) : m.kenmerk.run({ [m.kenmerk.invoer[0]!]: invoer });
  return uit.data.slice(0, 96);
}

/** De kenmerken van vier seconden ruis, zoals openWakeWord begint. */
function beginKenmerken(m: Wekmodellen): Float32Array[] {
  const mel = melRijen(m, ruis(16000 * 4));
  const uit: Float32Array[] = [];
  // Schuivend, net als bij het luisteren: anders staat de dienst op de Pi seconden stil.
  const stand = new Schuifstand();
  for (let i = MEL_RIJEN; i <= mel.length; i += 8) uit.push(kenmerk(m, mel.slice(i - MEL_RIJEN, i), { schuif: i === MEL_RIJEN ? MEL_RIJEN : 8, stand }));
  return uit.slice(-KENMERKEN);
}

/* --------------------------------------------------------------- de gevoeligheid */

/**
 * De standen van de schuif, van "hoort bijna alles" tot "alleen als je het
 * duidelijk zegt". Een stand is een drempel en hoe vaak achter elkaar die
 * gehaald moet worden (een stap is 80 ms). Getoetst op de opnames van de
 * training (besluit 208): bij 0,5 werd 93% van de schone opnames herkend.
 */
export const GEVOELIGHEID = {
  1: { drempel: 0.85, achterElkaar: 2 },
  2: { drempel: 0.7, achterElkaar: 2 },
  3: { drempel: 0.5, achterElkaar: 1 },
  4: { drempel: 0.4, achterElkaar: 1 },
  5: { drempel: 0.3, achterElkaar: 1 },
} as const;
export type Gevoeligheid = keyof typeof GEVOELIGHEID;
export const GEVOELIGHEID_STANDAARD: Gevoeligheid = 3;

export function gevoeligheidVan(s: string | null | undefined): Gevoeligheid {
  const n = Number(s);
  return n in GEVOELIGHEID ? (n as Gevoeligheid) : GEVOELIGHEID_STANDAARD;
}

/** Beslist of het wekwoord er was, uit de kansen per stap. */
export class Wekmelder {
  readonly #drempel: number;
  readonly #nodig: number;
  #achter = 0;
  #hoogste = 0;

  constructor(g: Gevoeligheid) {
    this.#drempel = GEVOELIGHEID[g].drempel;
    this.#nodig = GEVOELIGHEID[g].achterElkaar;
  }

  /** De hoogste kans in de reeks die het wekwoord gaf (voor het logboek bij Functies). */
  get hoogste(): number {
    return this.#hoogste;
  }

  /** Een nieuwe kans; true als het wekwoord nu gehoord is. */
  kans(k: number): boolean {
    if (k >= this.#drempel) {
      this.#achter += 1;
      this.#hoogste = Math.max(this.#hoogste, k);
      if (this.#achter >= this.#nodig) return true;
    } else {
      this.#achter = 0;
      this.#hoogste = 0;
    }
    return false;
  }
}
