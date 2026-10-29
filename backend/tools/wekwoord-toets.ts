/**
 * Toetst het wekwoord in de dienst (besluit 208) op opnames, zoals
 * `toets_model.py` dat in de training deed: per opname de hoogste kans, met
 * een seconde stilte ervoor en erna, en hoeveel er bij elke stand van de
 * gevoeligheid gehoord worden. Ook hoe lang een stap van 80 ms rekent.
 *
 *   npx tsx tools/wekwoord-toets.ts <map met modellen> <map positief> <map negatief> [aantal]
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GEVOELIGHEID, laadWekmodellen, Wekluisteraar, Wekmelder, type Gevoeligheid } from '../src/web/wekwoord.js';

function wav(pad: string): Int16Array {
  const b = readFileSync(pad);
  let p = 12;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4);
    const n = b.readUInt32LE(p + 4);
    if (id === 'fmt ') {
      const kanalen = b.readUInt16LE(p + 10);
      const sr = b.readUInt32LE(p + 12);
      const bits = b.readUInt16LE(p + 22);
      if (kanalen !== 1 || sr !== 16000 || bits !== 16) throw new Error(`${pad}: ${kanalen} kanalen, ${sr} Hz, ${bits} bit`);
    }
    if (id === 'data') return new Int16Array(b.buffer.slice(b.byteOffset + p + 8, b.byteOffset + p + 8 + n));
    p += 8 + n + (n % 2);
  }
  throw new Error(`${pad}: geen geluid`);
}

const [modellen, positief, negatief, aantalTekst] = process.argv.slice(2);
if (!modellen || !positief || !negatief) throw new Error('gebruik: <modellen> <positief> <negatief> [aantal]');
const aantal = Number(aantalTekst ?? 200);
const m = laadWekmodellen(modellen);

let stappen = 0;
let ms = 0;
function kansen(x: Int16Array): number[] {
  const l = new Wekluisteraar(m);
  const al = new Int16Array(x.length + 32000);
  al.set(x, 16000);
  const uit: number[] = [];
  for (let i = 0; i + 1280 <= al.length; i += 1280) {
    const t = performance.now();
    uit.push(...l.voeg(al.subarray(i, i + 1280)));
    ms += performance.now() - t;
    stappen += 1;
  }
  return uit;
}

function toets(map: string): number[][] {
  const namen = readdirSync(map).filter((f) => f.endsWith('.wav')).sort().slice(0, aantal);
  return namen.map((f) => kansen(wav(join(map, f))));
}

const pos = toets(positief);
const neg = toets(negatief);
const gehoord = (reeks: number[], g: Gevoeligheid) => {
  const melder = new Wekmelder(g);
  return reeks.some((k) => melder.kans(k));
};
const pct = (n: number, van: number) => `${((100 * n) / van).toFixed(1)}%`;
console.log(`opnames: ${pos.length} met het wekwoord, ${neg.length} zonder`);
console.log(`hoogste kans 0,5: ${pct(pos.filter((r) => Math.max(...r) >= 0.5).length, pos.length)} gehoord, ${pct(neg.filter((r) => Math.max(...r) >= 0.5).length, neg.length)} vals`);
for (const g of Object.keys(GEVOELIGHEID).map(Number) as Gevoeligheid[]) {
  console.log(`stand ${g} (${GEVOELIGHEID[g].drempel}, ${GEVOELIGHEID[g].achterElkaar}x): ${pct(pos.filter((r) => gehoord(r, g)).length, pos.length)} gehoord, ${pct(neg.filter((r) => gehoord(r, g)).length, neg.length)} vals`);
}
console.log(`rekentijd: ${(ms / stappen).toFixed(2)} ms per stap van 80 ms`);
