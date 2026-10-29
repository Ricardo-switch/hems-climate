/**
 * Luisteren in de dienst (besluit 208): de kleine ONNX-rekenaar, het wekwoord
 * met zijn gevoeligheid, het einde van je zin, en hoe de luisterpost die
 * samen met Home Assistant gebruikt.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Gesprek, SpraakEvent } from '../src/adapters/homeassistant/client.js';
import { Luisterpost, type LuisterDeur } from '../src/web/luisterpost.js';
import { OnnxModel, Schuifstand, tensor } from '../src/web/onnx.js';
import { BEGIN_MS, Spraakeinde, WACHTTIJD, db } from '../src/web/spraakeinde.js';
import { GEVOELIGHEID, gevoeligheidVan, laadWekmodellen, Wekluisteraar, Wekmelder } from '../src/web/wekwoord.js';
import { isHalf } from '../src/web/woordzoeker.js';

const MODELLEN = fileURLToPath(new URL('../wekwoord', import.meta.url));

/* ------------------------------------------------- een ONNX-bestand maken */

/** Net genoeg protobuf om een kleine grafiek te schrijven. */
const varint = (n: number): number[] => {
  const uit: number[] = [];
  let v = BigInt.asUintN(64, BigInt(n));
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v) b |= 0x80;
    uit.push(b);
  } while (v);
  return uit;
};
const veld = (nr: number, data: number[] | Uint8Array): number[] => [...varint((nr << 3) | 2), ...varint(data.length), ...data];
const getalVeld = (nr: number, n: number): number[] => [...varint(nr << 3), ...varint(n)];
const tekstVeld = (nr: number, s: string): number[] => veld(nr, [...new TextEncoder().encode(s)]);
function tensorProto(naam: string, dims: number[], waarden: number[]): number[] {
  const ruw = new Uint8Array(new Float32Array(waarden).buffer);
  return [...dims.flatMap((d) => getalVeld(1, d)), ...getalVeld(2, 1), ...tekstVeld(8, naam), ...veld(9, ruw)];
}
function attribuut(naam: string, w: number | number[]): number[] {
  return Array.isArray(w) ? [...tekstVeld(1, naam), ...w.flatMap((x) => getalVeld(8, x))] : [...tekstVeld(1, naam), ...getalVeld(3, w)];
}
function knoop(op: string, ins: string[], uit: string, at: Record<string, number | number[]> = {}): number[] {
  return [...ins.flatMap((i) => tekstVeld(1, i)), ...tekstVeld(2, uit), ...tekstVeld(4, op), ...Object.entries(at).flatMap(([k, v]) => veld(5, attribuut(k, v)))];
}
function model(knopen: number[][], vast: number[][], invoer: string, uitvoer: string): OnnxModel {
  const grafiek = [...knopen.flatMap((k) => veld(1, k)), ...vast.flatMap((t) => veld(5, t)), ...veld(11, tekstVeld(1, invoer)), ...veld(12, tekstVeld(1, uitvoer))];
  return new OnnxModel(new Uint8Array(veld(7, grafiek)));
}

describe('de ONNX-rekenaar', () => {
  it('rekent een Conv met rand, een MaxPool en een LeakyRelu zoals het hoort', () => {
    // Eén kanaal van 3×3, een kader van 2×2 met gewichten 1, rand rechts en onder.
    const m = model(
      [knoop('Conv', ['x', 'w', 'b'], 'c', { kernel_shape: [2, 2], pads: [0, 0, 1, 1] }), knoop('MaxPool', ['c'], 'p', { kernel_shape: [2, 2], strides: [2, 2] }), knoop('LeakyRelu', ['p'], 'y')],
      [tensorProto('w', [1, 1, 2, 2], [1, 1, 1, 1]), tensorProto('b', [1], [-20])],
      'x',
      'y',
    );
    const uit = m.run({ x: tensor([1, 1, 3, 3], [1, 2, 3, 4, 5, 6, 7, 8, 9]) });
    // Conv: [[12,16,9],[24,28,15],[15,17,9]] − 20; MaxPool 2×2 van de eerste vier: 28 − 20 = 8.
    expect(uit.dims).toEqual([1, 1, 1, 1]);
    expect([...uit.data]).toEqual([8]);
  });

  it('rekent Gemm met transB, en optellen met uitbreiden zoals numpy', () => {
    const m = model(
      [knoop('Gemm', ['x', 'w', 'b'], 'g', { transB: 1 }), knoop('Add', ['g', 'r'], 'y')],
      [tensorProto('w', [2, 3], [1, 0, 0, 0, 1, 1]), tensorProto('b', [2], [10, 20]), tensorProto('r', [2, 1], [100, 200])],
      'x',
      'y',
    );
    const uit = m.run({ x: tensor([1, 3], [1, 2, 3]) });
    expect(uit.dims).toEqual([2, 2]);
    expect([...uit.data]).toEqual([111, 125, 211, 225]);
  });

  it('weigert bij het laden een bewerking die het niet kent', () => {
    expect(() => model([knoop('Softmax', ['x'], 'y')], [], 'x', 'y')).toThrow(/Softmax kan hier niet/);
  });

  it('rekent schuivend precies hetzelfde als alles opnieuw, met de echte modellen', () => {
    const m = laadWekmodellen(MODELLEN);
    const stand = new Schuifstand();
    let raam = Float32Array.from({ length: 76 * 32 }, (_, i) => Math.sin(i * 0.37) * 2 + 1);
    for (let stap = 0; stap < 5; stap++) {
      if (stap > 0) {
        const n = new Float32Array(76 * 32);
        n.set(raam.subarray(8 * 32));
        for (let i = 68 * 32; i < n.length; i++) n[i] = Math.cos(i * 0.11 + stap) * 2 + 1;
        raam = n;
      }
      const t = tensor([1, 76, 32, 1], raam);
      const a = m.kenmerk.runSchuivend(t, 1, stap === 0 ? 76 : 8, stand).data;
      const b = m.kenmerk.run({ [m.kenmerk.invoer[0]!]: t }).data;
      for (let i = 0; i < 96; i++) expect(a[i]).toBeCloseTo(b[i]!, 4);
    }
  });
});

describe('het wekwoord', () => {
  const m = laadWekmodellen(MODELLEN);

  it('herkent "Hé huis" in kenmerken uit de training, en iets anders niet', () => {
    const voorbeelden = JSON.parse(readFileSync(new URL('./fixtures/wekwoord-kenmerken.json', import.meta.url), 'utf8')) as Record<'positive' | 'negative', number[][][]>;
    const kans = (k: number[][]) => m.woord.run({ [m.woord.invoer[0]!]: tensor([1, 16, 96], k.flat()) }).data[0]!;
    for (const k of voorbeelden.positive) expect(kans(k)).toBeGreaterThan(0.9);
    for (const k of voorbeelden.negative) expect(kans(k)).toBeLessThan(0.05);
  });

  it('hoort niets in stilte en in ruis, en de eerste vijf stappen tellen niet', () => {
    const l = new Wekluisteraar(m);
    const stil = l.voeg(new Int16Array(1280 * 5));
    expect(stil).toEqual([0, 0, 0, 0, 0]);
    let s = 7;
    const ruis = Int16Array.from({ length: 1280 * 20 }, () => ((s = (s * 48271) % 2147483647), (s % 600) - 300));
    // In stukken die niet op een stap vallen: de rest wacht tot de volgende keer.
    const kansen = [...l.voeg(ruis.subarray(0, 5000)), ...l.voeg(ruis.subarray(5000))];
    expect(kansen).toHaveLength(20);
    expect(Math.max(...kansen)).toBeLessThan(0.5);
  });

  it('kiest de gevoeligheid: een drempel, en hoe vaak achter elkaar', () => {
    expect(gevoeligheidVan('5')).toBe(5);
    expect(gevoeligheidVan('9')).toBe(3);
    expect(gevoeligheidVan(null)).toBe(3);
    const normaal = new Wekmelder(3);
    expect(normaal.kans(0.49)).toBe(false);
    expect(normaal.kans(0.51)).toBe(true);
    // Streng: twee stappen achter elkaar boven 0,7.
    const streng = new Wekmelder(2);
    expect(GEVOELIGHEID[2].drempel).toBe(0.7);
    expect(streng.kans(0.8)).toBe(false);
    expect(streng.kans(0.6)).toBe(false);
    expect(streng.kans(0.8)).toBe(false);
    expect(streng.kans(0.9)).toBe(true);
    expect(streng.hoogste).toBe(0.9);
  });
});

/* ------------------------------------------------------- het einde van je zin */

/** Geluid in stukjes van 10 ms: een toon (praten) of bijna niets (stil). */
function geluid(delen: readonly (readonly ['praat' | 'stil', number])[]): Int16Array {
  const n = delen.reduce((s, [, ms]) => s + ms * 16, 0);
  const uit = new Int16Array(n);
  let p = 0;
  for (const [soort, ms] of delen) {
    for (let i = 0; i < ms * 16; i++, p++) uit[p] = soort === 'praat' ? Math.round(Math.sin(p * 0.2) * 6000) : (p % 7) - 3;
  }
  return uit;
}

describe('het einde van je zin', () => {
  it('meet de luidheid in dB', () => {
    expect(db(new Int16Array(160))).toBe(-120);
    expect(db(new Int16Array(160).fill(32767))).toBeCloseTo(0, 1);
  });

  it('begint bij praten en stopt na de wachttijd, niet bij een korte pauze', () => {
    const z = new Spraakeinde({ wachttijd: 'normaal' });
    // Een halve seconde stil, praten, een pauze van 600 ms midden in de zin, weer praten, dan stil.
    const uit = z.voeg(geluid([['stil', 500], ['praat', 800], ['stil', 600], ['praat', 700], ['stil', WACHTTIJD.normaal + 100]]));
    expect(uit).toEqual(['praat', 'stil']);
  });

  it('stopt met Vlot al bij een kortere pauze', () => {
    const z = new Spraakeinde({ wachttijd: 'vlot' });
    expect(z.voeg(geluid([['stil', 300], ['praat', 800], ['stil', 800]]))).toEqual(['praat', 'stil']);
    // Daarna niets meer: de zin is klaar.
    expect(z.voeg(geluid([['praat', 500]]))).toEqual([]);
  });

  it('zegt "niets" als er binnen vijf seconden geen woord komt', () => {
    const z = new Spraakeinde({ wachttijd: 'normaal' });
    expect(z.voeg(geluid([['stil', BEGIN_MS - 100]]))).toEqual([]);
    expect(z.voeg(geluid([['stil', 200]]))).toEqual(['niets']);
  });

  it('telt na het wekwoord de staart van "huis" niet als begin', () => {
    const z = new Spraakeinde({ wachttijd: 'normaal', negeerMs: 300 });
    // Nog 250 ms "huis", dan stil: geen begin, dus ook geen einde.
    expect(z.voeg(geluid([['praat', 250], ['stil', 2000]]))).toEqual([]);
    expect(z.praat).toBe(false);
  });

  it('een klik is geen begin', () => {
    const z = new Spraakeinde({ wachttijd: 'normaal' });
    expect(z.voeg(geluid([['stil', 400], ['praat', 60], ['stil', 2000]]))).toEqual([]);
  });
});

describe('een halve zin', () => {
  it('hoort dat een zin nog niet af is', () => {
    expect(isHalf('Zet de lamp in de')).toBe(true);
    expect(isHalf('Doe het licht in de keuken en.')).toBe(true);
    expect(isHalf('Turn on the')).toBe(true);
    expect(isHalf('Doe het licht aan')).toBe(false);
    expect(isHalf('Hoe warm is het?')).toBe(false);
    expect(isHalf('Doe dat dan')).toBe(false);
    // Eén woord is geen begin van een zin.
    expect(isHalf('de')).toBe(false);
  });
});

/* ---------------------------------------------------------- de luisterpost */

function nepDeur(o: { wekwoord: boolean }): { deur: LuisterDeur; starts: string[]; events: () => (e: SpraakEvent) => void; geluid: number[]; eind: { n: number } } {
  const starts: string[] = [];
  let op: (e: SpraakEvent) => void = () => {};
  const geluid: number[] = [];
  const eind = { n: 0 };
  const gesprek: Gesprek = { send: (p) => void geluid.push(p.length), end: () => void (eind.n += 1), stop: () => {} };
  const m = o.wekwoord ? laadWekmodellen(MODELLEN) : null;
  return {
    deur: {
      start: (x) => {
        starts.push(x.start);
        op = x.onEvent;
        return Promise.resolve(gesprek);
      },
      pipeline: () => null,
      wekwoord: () => m,
    },
    starts,
    events: () => op,
    geluid,
    eind,
  };
}
function nepVerbinding(): { v: { tekst: (s: string) => void; sluit: () => void; open: () => boolean }; berichten: Record<string, unknown>[]; dicht: () => boolean } {
  const berichten: Record<string, unknown>[] = [];
  let dicht = false;
  return {
    v: { tekst: (s) => void berichten.push(JSON.parse(s) as Record<string, unknown>), sluit: () => void (dicht = true), open: () => !dicht },
    berichten,
    dicht: () => dicht,
  };
}
const buf = (pcm: Int16Array) => Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);

describe('de luisterpost', () => {
  it('hoort het wekwoord zelf: Home Assistant komt er pas na het wekwoord bij', async () => {
    const n = nepDeur({ wekwoord: true });
    const post = new Luisterpost(n.deur);
    const c = nepVerbinding();
    const r = await post.begin(c.v, 'wake_word', { gevoeligheid: 3, wachttijd: 'normaal' });
    expect(c.berichten).toEqual([{ soort: 'klaar' }]);
    r.geluid(buf(geluid([['stil', 1000]])));
    // Zonder wekwoord geen spraakopdracht in Home Assistant, en geen geluid erheen.
    expect(n.starts).toEqual([]);
    expect(n.geluid).toEqual([]);
    expect(post.stand.zelf).toBe(true);
    expect(post.stand.rekentijd).not.toBeNull();
    r.dicht();
    expect(post.lopend).toBe(0);
  });

  it('volgt na het wekwoord van Home Assistant zelf je zin, en zegt Home Assistant wanneer het klaar is', async () => {
    const n = nepDeur({ wekwoord: false });
    const post = new Luisterpost(n.deur, () => 1_000);
    const c = nepVerbinding();
    const r = await post.begin(c.v, 'wake_word', { gevoeligheid: 3, wachttijd: 'vlot' });
    expect(n.starts).toEqual(['wake_word']);
    n.events()({ type: 'run-start', data: {} });
    n.events()({ type: 'wake_word-end', data: { wake_word_output: { wake_word_id: 'he_huis' } } });
    r.geluid(buf(geluid([['stil', 400], ['praat', 800], ['stil', 900]])));
    expect(c.berichten.map((b) => b['soort'])).toEqual(['klaar', 'wakker', 'praat', 'stil']);
    expect(n.eind.n).toBe(1);
    n.events()({ type: 'stt-end', data: { stt_output: { text: 'doe het licht aan' } } });
    expect(post.stand.boek).toEqual([{ ms: 1_000, kans: null, gevoeligheid: null, vraag: true }]);
  });

  it('stopt stil als er na het begin geen woord komt', async () => {
    const n = nepDeur({ wekwoord: false });
    const post = new Luisterpost(n.deur);
    const c = nepVerbinding();
    const r = await post.begin(c.v, 'stt', { gevoeligheid: 3, wachttijd: 'normaal' });
    r.geluid(buf(geluid([['stil', BEGIN_MS + 100]])));
    expect(c.berichten.at(-1)).toEqual({ soort: 'niets' });
    expect(c.dicht()).toBe(true);
    expect(post.lopend).toBe(0);
  });
});
