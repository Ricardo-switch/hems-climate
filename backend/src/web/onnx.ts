/**
 * Een kleine rekenaar voor ONNX-modellen, zonder bibliotheek (besluit 208).
 * Het image houdt nul runtime-afhankelijkheden (besluit 57); een volledige
 * ONNX-runtime is tientallen megabytes voor drie kleine modellen. Hier staat
 * alleen wat de modellen van het wekwoord gebruiken (openWakeWord: het
 * mel-spectrogram, de spraakkenmerken van Google, en "Hé huis" zelf), en elke
 * andere bewerking werpt bij het laden, niet pas bij het rekenen.
 *
 * Alles rekent in float32, in de volgorde van de grafiek (ONNX zet de knopen
 * al op volgorde). Het bestand zelf is protobuf; dat lezen we met de hand.
 */

export interface Tensor {
  readonly dims: readonly number[];
  readonly data: Float32Array;
}

const grootte = (dims: readonly number[]): number => dims.reduce((a, b) => a * b, 1);

export function tensor(dims: readonly number[], data?: ArrayLike<number>): Tensor {
  const n = grootte(dims);
  const d = new Float32Array(n);
  if (data) {
    if (data.length !== n) throw new Error(`tensor: ${data.length} waarden voor ${JSON.stringify(dims)}`);
    d.set(data);
  }
  return { dims: [...dims], data: d };
}

/* ------------------------------------------------------------- protobuf lezen */

type Veld = { readonly nr: number; readonly soort: 0 | 1 | 2 | 5; readonly getal: bigint; readonly bytes: Uint8Array; readonly vlot: number };

function* velden(buf: Uint8Array): Generator<Veld> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 0;
  const varint = (): bigint => {
    let r = 0n;
    let s = 0n;
    for (;;) {
      if (p >= buf.length) throw new Error('onnx: bestand houdt op midden in een getal');
      const b = buf[p++]!;
      r |= BigInt(b & 0x7f) << s;
      if (!(b & 0x80)) return r;
      s += 7n;
    }
  };
  const leeg = new Uint8Array(0);
  while (p < buf.length) {
    const tag = Number(varint());
    const nr = tag >>> 3;
    const soort = tag & 7;
    if (soort === 0) yield { nr, soort, getal: varint(), bytes: leeg, vlot: 0 };
    else if (soort === 2) {
      const n = Number(varint());
      const begin = p;
      p += n;
      if (p > buf.length) throw new Error('onnx: bestand is korter dan het zegt');
      yield { nr, soort, getal: 0n, bytes: buf.subarray(begin, p), vlot: 0 };
    } else if (soort === 5) {
      const v = dv.getFloat32(p, true);
      p += 4;
      yield { nr, soort, getal: 0n, bytes: leeg, vlot: v };
    } else if (soort === 1) {
      const v = dv.getFloat64(p, true);
      p += 8;
      yield { nr, soort, getal: 0n, bytes: leeg, vlot: v };
    } else throw new Error(`onnx: onbekende soort veld ${soort}`);
  }
}

const tekst = (b: Uint8Array): string => new TextDecoder().decode(b);
const int64 = (v: bigint): number => Number(BigInt.asIntN(64, v));

/** Herhaalde gehele getallen: los of samengepakt. */
function gehelen(v: Veld, uit: number[]): void {
  if (v.soort === 0) uit.push(int64(v.getal));
  else for (const w of velden(v.bytes)) uit.push(int64(w.getal));
}
/** Een samengepakt veld met gehele getallen (packed), zonder tags ertussen. */
function gepakt(b: Uint8Array, uit: number[]): void {
  let p = 0;
  while (p < b.length) {
    let r = 0n;
    let s = 0n;
    for (;;) {
      const x = b[p++]!;
      r |= BigInt(x & 0x7f) << s;
      if (!(x & 0x80)) break;
      s += 7n;
    }
    uit.push(int64(r));
  }
}

function leesTensor(buf: Uint8Array): { naam: string; t: Tensor } {
  const dims: number[] = [];
  let soort = 1;
  let naam = '';
  let ruw: Uint8Array | null = null;
  const vlot: number[] = [];
  const heel: number[] = [];
  for (const v of velden(buf)) {
    if (v.nr === 1) {
      if (v.soort === 0) dims.push(int64(v.getal));
      else gepakt(v.bytes, dims);
    } else if (v.nr === 2) soort = Number(v.getal);
    else if (v.nr === 4) {
      if (v.soort === 5) vlot.push(v.vlot);
      else {
        const dv = new DataView(v.bytes.buffer, v.bytes.byteOffset, v.bytes.byteLength);
        for (let i = 0; i + 4 <= v.bytes.length; i += 4) vlot.push(dv.getFloat32(i, true));
      }
    } else if (v.nr === 5 || v.nr === 7) {
      if (v.soort === 0) heel.push(int64(v.getal));
      else gepakt(v.bytes, heel);
    } else if (v.nr === 8) naam = tekst(v.bytes);
    else if (v.nr === 9) ruw = v.bytes;
  }
  const n = grootte(dims);
  const data = new Float32Array(n);
  if (ruw) {
    const dv = new DataView(ruw.buffer, ruw.byteOffset, ruw.byteLength);
    for (let i = 0; i < n; i++) {
      if (soort === 1) data[i] = dv.getFloat32(i * 4, true);
      else if (soort === 7) data[i] = Number(dv.getBigInt64(i * 8, true));
      else if (soort === 6) data[i] = dv.getInt32(i * 4, true);
      else if (soort === 11) data[i] = dv.getFloat64(i * 8, true);
      else if (soort === 9 || soort === 2) data[i] = dv.getUint8(i);
      else throw new Error(`onnx: tensor ${naam} heeft een soort (${soort}) die hier niet kan`);
    }
  } else if (vlot.length) data.set(vlot.slice(0, n));
  else if (heel.length) data.set(heel.slice(0, n));
  return { naam, t: { dims, data } };
}

type Waarde = number | string | Tensor | number[];

function leesAttribuut(buf: Uint8Array): [string, Waarde] {
  let naam = '';
  let w: Waarde | null = null;
  const lijst: number[] = [];
  for (const v of velden(buf)) {
    if (v.nr === 1) naam = tekst(v.bytes);
    else if (v.nr === 2) w = v.vlot;
    else if (v.nr === 3) w = int64(v.getal);
    else if (v.nr === 4) w = tekst(v.bytes);
    else if (v.nr === 5) w = leesTensor(v.bytes).t;
    else if (v.nr === 7) {
      if (v.soort === 5) lijst.push(v.vlot);
      else {
        const dv = new DataView(v.bytes.buffer, v.bytes.byteOffset, v.bytes.byteLength);
        for (let i = 0; i + 4 <= v.bytes.length; i += 4) lijst.push(dv.getFloat32(i, true));
      }
      w = lijst;
    } else if (v.nr === 8) {
      gehelen(v, lijst);
      w = lijst;
    }
  }
  return [naam, w ?? lijst];
}

interface Knoop {
  readonly op: string;
  readonly in: readonly string[];
  readonly uit: readonly string[];
  readonly at: ReadonlyMap<string, Waarde>;
}

/* ------------------------------------------------------------- de bewerkingen */

const getal = (at: ReadonlyMap<string, Waarde>, naam: string, standaard: number): number => {
  const w = at.get(naam);
  return typeof w === 'number' ? w : standaard;
};
const lijst = (at: ReadonlyMap<string, Waarde>, naam: string): number[] | null => {
  const w = at.get(naam);
  return Array.isArray(w) ? w : null;
};

/** Twee vormen samen zoals numpy dat doet; null als het niet kan. */
function samen(a: readonly number[], b: readonly number[]): number[] {
  const n = Math.max(a.length, b.length);
  const uit: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = a[a.length - n + i] ?? 1;
    const y = b[b.length - n + i] ?? 1;
    if (x !== y && x !== 1 && y !== 1) throw new Error(`onnx: vormen ${JSON.stringify(a)} en ${JSON.stringify(b)} passen niet`);
    uit.push(Math.max(x, y));
  }
  return uit;
}

/** Per uitgangsplek de plek in een invoer met kleinere of gelijke vorm. */
function stappen(dims: readonly number[], uit: readonly number[]): number[] {
  const st: number[] = new Array<number>(uit.length).fill(0);
  let s = 1;
  for (let i = dims.length - 1; i >= 0; i--) {
    const j = uit.length - dims.length + i;
    st[j] = dims[i] === 1 ? 0 : s;
    s *= dims[i]!;
  }
  return st;
}

function paarsgewijs(a: Tensor, b: Tensor, f: (x: number, y: number) => number): Tensor {
  // Snel pad: gelijke vorm, of een los getal.
  if (b.data.length === 1) {
    const y = b.data[0]!;
    const d = new Float32Array(a.data.length);
    for (let i = 0; i < d.length; i++) d[i] = f(a.data[i]!, y);
    return { dims: samen(a.dims, b.dims), data: d };
  }
  if (a.data.length === b.data.length && a.dims.length === b.dims.length && a.dims.every((x, i) => x === b.dims[i])) {
    const d = new Float32Array(a.data.length);
    for (let i = 0; i < d.length; i++) d[i] = f(a.data[i]!, b.data[i]!);
    return { dims: [...a.dims], data: d };
  }
  const dims = samen(a.dims, b.dims);
  const sa = stappen(a.dims, dims);
  const sb = stappen(b.dims, dims);
  const n = grootte(dims);
  const d = new Float32Array(n);
  const idx = new Array<number>(dims.length).fill(0);
  for (let i = 0; i < n; i++) {
    let pa = 0;
    let pb = 0;
    for (let k = 0; k < dims.length; k++) {
      pa += idx[k]! * sa[k]!;
      pb += idx[k]! * sb[k]!;
    }
    d[i] = f(a.data[pa]!, b.data[pb]!);
    for (let k = dims.length - 1; k >= 0; k--) {
      if (++idx[k]! < dims[k]!) break;
      idx[k] = 0;
    }
  }
  return { dims, data: d };
}

function perPunt(a: Tensor, f: (x: number) => number): Tensor {
  const d = new Float32Array(a.data.length);
  for (let i = 0; i < d.length; i++) d[i] = f(a.data[i]!);
  return { dims: [...a.dims], data: d };
}

function transponeer(a: Tensor, perm: readonly number[]): Tensor {
  const dims = perm.map((p) => a.dims[p]!);
  const bron = stappen(a.dims, a.dims);
  const st = perm.map((p) => bron[p]!);
  const n = a.data.length;
  const d = new Float32Array(n);
  const idx = new Array<number>(dims.length).fill(0);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (let k = 0; k < dims.length; k++) p += idx[k]! * st[k]!;
    d[i] = a.data[p]!;
    for (let k = dims.length - 1; k >= 0; k--) {
      if (++idx[k]! < dims[k]!) break;
      idx[k] = 0;
    }
  }
  return { dims, data: d };
}

function matmul(a: Tensor, b: Tensor): Tensor {
  if (b.dims.length !== 2 || a.dims.length < 2) throw new Error('onnx: MatMul alleen met een matrix rechts');
  const [k, n] = b.dims as [number, number];
  if (a.dims.at(-1) !== k) throw new Error('onnx: MatMul past niet');
  const m = a.data.length / k;
  const d = new Float32Array(m * n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < k; j++) {
      const x = a.data[i * k + j]!;
      if (x === 0) continue;
      const rij = j * n;
      const o = i * n;
      for (let c = 0; c < n; c++) d[o + c]! += x * b.data[rij + c]!;
    }
  }
  return { dims: [...a.dims.slice(0, -1), n], data: d };
}

function gemm(a: Tensor, b: Tensor, c: Tensor | null, at: ReadonlyMap<string, Waarde>): Tensor {
  const alpha = getal(at, 'alpha', 1);
  const beta = getal(at, 'beta', 1);
  const ta = getal(at, 'transA', 0) === 1;
  const tb = getal(at, 'transB', 0) === 1;
  const [ar, ac] = a.dims as [number, number];
  const [br, bc] = b.dims as [number, number];
  const m = ta ? ac : ar;
  const k = ta ? ar : ac;
  const n = tb ? br : bc;
  const d = new Float32Array(m * n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let q = 0; q < k; q++) s += a.data[ta ? q * ac + i : i * ac + q]! * b.data[tb ? j * bc + q : q * bc + j]!;
      d[i * n + j] = alpha * s;
    }
  }
  const uit: Tensor = { dims: [m, n], data: d };
  return c ? paarsgewijs(uit, c, (x, y) => x + beta * y) : uit;
}

function reduceer(a: Tensor, at: ReadonlyMap<string, Waarde>, gem: boolean): Tensor {
  const r = a.dims.length;
  const assen = (lijst(at, 'axes') ?? a.dims.map((_, i) => i)).map((x) => (x < 0 ? x + r : x));
  const houd = getal(at, 'keepdims', 1) === 1;
  const uitDims = a.dims.map((x, i) => (assen.includes(i) ? 1 : x));
  const n = grootte(uitDims);
  const d = new Float32Array(n).fill(gem ? 0 : -Infinity);
  const st = stappen(uitDims, a.dims);
  const idx = new Array<number>(r).fill(0);
  for (let i = 0; i < a.data.length; i++) {
    let p = 0;
    for (let k = 0; k < r; k++) p += idx[k]! * st[k]!;
    const x = a.data[i]!;
    if (gem) d[p]! += x;
    else if (x > d[p]!) d[p] = x;
    for (let k = r - 1; k >= 0; k--) {
      if (++idx[k]! < a.dims[k]!) break;
      idx[k] = 0;
    }
  }
  if (gem) {
    const deel = a.data.length / n;
    for (let i = 0; i < n; i++) d[i]! /= deel;
  }
  return { dims: houd ? uitDims : a.dims.filter((_, i) => !assen.includes(i)), data: d };
}

/** De vorm in vier dimensies (N, C, H, W); een 1D-invoer krijgt H = 1. */
function vier(dims: readonly number[]): [number, number, number, number] {
  if (dims.length === 4) return dims as [number, number, number, number];
  if (dims.length === 3) return [dims[0]!, dims[1]!, 1, dims[2]!];
  throw new Error(`onnx: Conv of MaxPool met ${dims.length} dimensies kan hier niet`);
}
/** Kader, stap, rand en verwijding in twee richtingen. */
function venster(at: ReadonlyMap<string, Waarde>, eenD: boolean, kader?: readonly number[]) {
  // Een 1D-venster heeft in de hoogte altijd stap en verwijding 1.
  const twee = (l: number[] | null, standaard: number): [number, number] => (l == null ? [standaard, standaard] : eenD ? [1, l[0]!] : [l[0]!, l[1]!]);
  const auto = at.get('auto_pad');
  if (typeof auto === 'string' && auto !== 'NOTSET' && auto !== 'VALID') throw new Error(`onnx: auto_pad ${auto} kan hier niet`);
  const k = kader ?? lijst(at, 'kernel_shape')!;
  const [kh, kw] = eenD ? [1, k[0]!] : [k[0]!, k[1]!];
  const [sh, sw] = twee(lijst(at, 'strides'), 1);
  const [dh, dw] = twee(lijst(at, 'dilations'), 1);
  const p = lijst(at, 'pads');
  const [pt, pl, pb, pr] = p == null ? [0, 0, 0, 0] : eenD ? [0, p[0]!, 0, p[1]!] : [p[0]!, p[1]!, p[2]!, p[3]!];
  return { kh, kw, sh, sw, dh, dw, pt, pl, pb, pr };
}

function conv(x: Tensor, w: Tensor, b: Tensor | null, at: ReadonlyMap<string, Waarde>): Tensor {
  const eenD = x.dims.length === 3;
  const [n, c, h, wd] = vier(x.dims);
  const [m, cg] = w.dims as [number, number];
  const groep = getal(at, 'group', 1);
  if (cg * groep !== c) throw new Error('onnx: Conv past niet bij de kanalen');
  const v = venster(at, eenD, eenD ? [w.dims[2]!] : [w.dims[2]!, w.dims[3]!]);
  const oh = Math.floor((h + v.pt + v.pb - v.dh * (v.kh - 1) - 1) / v.sh) + 1;
  const ow = Math.floor((wd + v.pl + v.pr - v.dw * (v.kw - 1) - 1) / v.sw) + 1;
  /*
   * Eerst het venster uitvouwen tot een matrix (K = kanalen × kader, P =
   * uitgangsplekken), dan gewichten keer matrix. Zo worden de binnenste lussen
   * lang en recht; met losse lussen per kaderpunt was één kenmerk 80 ms.
   */
  const p = oh * ow;
  const k = cg * v.kh * v.kw;
  const mg = m / groep;
  const d = new Float32Array(n * m * p);
  const kort = p < 32;
  const col = new Float32Array(k * p);
  for (let ni = 0; ni < n; ni++) {
    for (let g = 0; g < groep; g++) {
      col.fill(0);
      for (let ci = 0; ci < cg; ci++) {
        const kanaal = (ni * c + g * cg + ci) * h * wd;
        for (let ki = 0; ki < v.kh; ki++) {
          for (let kj = 0; kj < v.kw; kj++) {
            const r = (ci * v.kh + ki) * v.kw + kj;
            for (let y = 0; y < oh; y++) {
              const iy = y * v.sh - v.pt + ki * v.dh;
              if (iy < 0 || iy >= h) continue;
              const rij = kanaal + iy * wd;
              for (let xx = 0; xx < ow; xx++) {
                const ix = xx * v.sw - v.pl + kj * v.dw;
                if (ix < 0 || ix >= wd) continue;
                // Bij weinig plekken per plek een rij (een inproduct), anders per gewicht een rij.
                if (kort) col[(y * ow + xx) * k + r] = x.data[rij + ix]!;
                else col[r * p + y * ow + xx] = x.data[rij + ix]!;
              }
            }
          }
        }
      }
      let mj = 0;
      // Vier uitgangskanalen tegelijk: elke waarde uit de matrix wordt dan één keer gelezen voor vier.
      if (!kort) {
        for (; mj + 4 <= mg; mj += 4) {
          const mi = g * mg + mj;
          const u0 = (ni * m + mi) * p;
          const u1 = u0 + p;
          const u2 = u1 + p;
          const u3 = u2 + p;
          d.fill(b ? b.data[mi]! : 0, u0, u1);
          d.fill(b ? b.data[mi + 1]! : 0, u1, u2);
          d.fill(b ? b.data[mi + 2]! : 0, u2, u3);
          d.fill(b ? b.data[mi + 3]! : 0, u3, u3 + p);
          for (let r = 0; r < k; r++) {
            const w0 = w.data[mi * k + r]!;
            const w1 = w.data[(mi + 1) * k + r]!;
            const w2 = w.data[(mi + 2) * k + r]!;
            const w3 = w.data[(mi + 3) * k + r]!;
            const co = r * p;
            for (let q = 0; q < p; q++) {
              const x = col[co + q]!;
              d[u0 + q]! += w0 * x;
              d[u1 + q]! += w1 * x;
              d[u2 + q]! += w2 * x;
              d[u3 + q]! += w3 * x;
            }
          }
        }
      }
      for (; mj < mg; mj++) {
        const mi = g * mg + mj;
        const uit = (ni * m + mi) * p;
        const wo = mi * k;
        const bias = b ? b.data[mi]! : 0;
        if (kort) {
          for (let q = 0; q < p; q++) {
            let s = bias;
            const co = q * k;
            for (let r = 0; r < k; r++) s += w.data[wo + r]! * col[co + r]!;
            d[uit + q] = s;
          }
        } else {
          d.fill(bias, uit, uit + p);
          for (let r = 0; r < k; r++) {
            const gewicht = w.data[wo + r]!;
            if (gewicht === 0) continue;
            const co = r * p;
            for (let q = 0; q < p; q++) d[uit + q]! += gewicht * col[co + q]!;
          }
        }
      }
    }
  }
  return { dims: eenD ? [n, m, ow] : [n, m, oh, ow], data: d };
}

function maxPool(x: Tensor, at: ReadonlyMap<string, Waarde>): Tensor {
  const eenD = x.dims.length === 3;
  const [n, c, h, wd] = vier(x.dims);
  const v = venster(at, eenD);
  const oh = Math.floor((h + v.pt + v.pb - v.dh * (v.kh - 1) - 1) / v.sh) + 1;
  const ow = Math.floor((wd + v.pl + v.pr - v.dw * (v.kw - 1) - 1) / v.sw) + 1;
  const d = new Float32Array(n * c * oh * ow);
  for (let k = 0; k < n * c; k++) {
    const bron = k * h * wd;
    for (let y = 0; y < oh; y++) {
      for (let xx = 0; xx < ow; xx++) {
        let best = -Infinity;
        for (let ki = 0; ki < v.kh; ki++) {
          const iy = y * v.sh - v.pt + ki * v.dh;
          if (iy < 0 || iy >= h) continue;
          for (let kj = 0; kj < v.kw; kj++) {
            const ix = xx * v.sw - v.pl + kj * v.dw;
            if (ix < 0 || ix >= wd) continue;
            const w = x.data[bron + iy * wd + ix]!;
            if (w > best) best = w;
          }
        }
        d[(k * oh + y) * ow + xx] = best;
      }
    }
  }
  return { dims: eenD ? [n, c, ow] : [n, c, oh, ow], data: d };
}

function nieuweVorm(a: Tensor, vorm: Tensor): Tensor {
  const dims = Array.from(vorm.data, (x, i) => (x === 0 ? a.dims[i]! : x));
  const vrij = dims.indexOf(-1);
  if (vrij >= 0) dims[vrij] = a.data.length / -grootte(dims);
  if (grootte(dims) !== a.data.length) throw new Error('onnx: Reshape past niet');
  return { dims, data: a.data };
}

function erbij(a: Tensor, assen: readonly number[]): Tensor {
  const r = a.dims.length + assen.length;
  const as = assen.map((x) => (x < 0 ? x + r : x));
  const dims: number[] = [];
  let j = 0;
  for (let i = 0; i < r; i++) dims.push(as.includes(i) ? 1 : a.dims[j++]!);
  return { dims, data: a.data };
}

/** Wat elke bewerking doet; een bewerking die hier niet staat, werpt bij het laden. */
const BEWERKINGEN: Readonly<Record<string, (ins: readonly (Tensor | null)[], at: ReadonlyMap<string, Waarde>) => Tensor>> = {
  Add: ([a, b]) => paarsgewijs(a!, b!, (x, y) => x + y),
  Sub: ([a, b]) => paarsgewijs(a!, b!, (x, y) => x - y),
  Mul: ([a, b]) => paarsgewijs(a!, b!, (x, y) => x * y),
  Div: ([a, b]) => paarsgewijs(a!, b!, (x, y) => x / y),
  Pow: ([a, b]) => (b!.data.length === 1 && b!.data[0] === 2 ? perPunt(a!, (x) => x * x) : paarsgewijs(a!, b!, (x, y) => x ** y)),
  Max: (ins) => ins.slice(1).reduce<Tensor>((acc, t) => paarsgewijs(acc, t!, (x, y) => (x > y ? x : y)), ins[0]!),
  Log: ([a]) => perPunt(a!, Math.log),
  Sqrt: ([a]) => perPunt(a!, Math.sqrt),
  Relu: ([a]) => perPunt(a!, (x) => (x > 0 ? x : 0)),
  Sigmoid: ([a]) => perPunt(a!, (x) => 1 / (1 + Math.exp(-x))),
  LeakyRelu: ([a], at) => {
    const alpha = getal(at, 'alpha', 0.01);
    return perPunt(a!, (x) => (x >= 0 ? x : alpha * x));
  },
  // Naar float (1) verandert niets; naar een geheel getal kapt af.
  Cast: ([a], at) => (getal(at, 'to', 1) === 1 ? a! : perPunt(a!, Math.trunc)),
  Clip: ([a, lo, hi], at) => {
    const min = lo ? lo.data[0]! : getal(at, 'min', -Infinity);
    const max = hi ? hi.data[0]! : getal(at, 'max', Infinity);
    return perPunt(a!, (x) => (x < min ? min : x > max ? max : x));
  },
  MatMul: ([a, b]) => matmul(a!, b!),
  Gemm: ([a, b, c], at) => gemm(a!, b!, c ?? null, at),
  ReduceMax: ([a], at) => reduceer(a!, at, false),
  ReduceMean: ([a], at) => reduceer(a!, at, true),
  Conv: ([x, w, b], at) => conv(x!, w!, b ?? null, at),
  MaxPool: ([x], at) => maxPool(x!, at),
  Reshape: ([a, v]) => nieuweVorm(a!, v!),
  Unsqueeze: ([a, assen], at) => erbij(a!, assen ? Array.from(assen.data) : lijst(at, 'axes') ?? []),
  Transpose: ([a], at) => transponeer(a!, lijst(at, 'perm') ?? a!.dims.map((_, i) => a!.dims.length - 1 - i)),
  Flatten: ([a], at) => {
    const as = getal(at, 'axis', 1);
    const ax = as < 0 ? as + a!.dims.length : as;
    return { dims: [grootte(a!.dims.slice(0, ax)), grootte(a!.dims.slice(ax))], data: a!.data };
  },
};

/* ------------------------------------------------------- schuiven in de tijd */

/** Wat per punt werkt: een nieuwe rij hangt alleen van dezelfde rij af. */
const PER_PUNT: ReadonlySet<string> = new Set(['Add', 'Sub', 'Mul', 'Div', 'Pow', 'Max', 'Log', 'Sqrt', 'Relu', 'Sigmoid', 'LeakyRelu', 'Cast', 'Clip']);

/** Wat een vorige keer uitrekende, per tensor; één per stroom. */
export class Schuifstand {
  readonly uit = new Map<string, Tensor>();
}

/** De rijen `van` tot `tot` langs een as. */
function rijen(t: Tensor, as: number, van: number, tot: number): Tensor {
  const buiten = grootte(t.dims.slice(0, as));
  const binnen = grootte(t.dims.slice(as + 1));
  const h = t.dims[as]!;
  const n = tot - van;
  const d = new Float32Array(buiten * n * binnen);
  for (let o = 0; o < buiten; o++) d.set(t.data.subarray((o * h + van) * binnen, (o * h + tot) * binnen), o * n * binnen);
  return { dims: t.dims.map((x, i) => (i === as ? n : x)), data: d };
}

/** De oude rijen zonder de eerste `s`, met de nieuwe erachter. */
function plak(oud: Tensor, s: number, nieuw: Tensor, as: number): Tensor {
  const buiten = grootte(oud.dims.slice(0, as));
  const binnen = grootte(oud.dims.slice(as + 1));
  const h = oud.dims[as]!;
  const d = new Float32Array(oud.data.length);
  for (let o = 0; o < buiten; o++) {
    d.set(oud.data.subarray((o * h + s) * binnen, (o * h + h) * binnen), o * h * binnen);
    d.set(nieuw.data.subarray(o * s * binnen, (o + 1) * s * binnen), (o * h + h - s) * binnen);
  }
  return { dims: [...oud.dims], data: d };
}

/** Waar de tijd-as na een Reshape zit, of -1 als die niet heel blijft. */
function tijdAs(voor: readonly number[], as: number, na: readonly number[]): number {
  const ervoor = grootte(voor.slice(0, as));
  let p = 1;
  for (let j = 0; j < na.length; j++) {
    if (p === ervoor && na[j] === voor[as]) return j;
    p *= na[j]!;
  }
  return -1;
}

/* ------------------------------------------------------------------ het model */

export class OnnxModel {
  readonly #knopen: readonly Knoop[];
  readonly #vast: ReadonlyMap<string, Tensor>;
  readonly invoer: readonly string[];
  readonly uitvoer: readonly string[];

  constructor(bytes: Uint8Array) {
    let grafiek: Uint8Array | null = null;
    for (const v of velden(bytes)) if (v.nr === 7) grafiek = v.bytes;
    if (!grafiek) throw new Error('onnx: geen grafiek in het bestand');
    const knopen: Knoop[] = [];
    const vast = new Map<string, Tensor>();
    const invoer: string[] = [];
    const uitvoer: string[] = [];
    for (const v of velden(grafiek)) {
      if (v.nr === 1) {
        let op = '';
        const ins: string[] = [];
        const uit: string[] = [];
        const at = new Map<string, Waarde>();
        for (const w of velden(v.bytes)) {
          if (w.nr === 1) ins.push(tekst(w.bytes));
          else if (w.nr === 2) uit.push(tekst(w.bytes));
          else if (w.nr === 4) op = tekst(w.bytes);
          else if (w.nr === 5) {
            const [naam, waarde] = leesAttribuut(w.bytes);
            at.set(naam, waarde);
          }
        }
        knopen.push({ op, in: ins, uit, at });
      } else if (v.nr === 5) {
        const { naam, t } = leesTensor(v.bytes);
        vast.set(naam, t);
      } else if (v.nr === 11 || v.nr === 12) {
        let naam = '';
        for (const w of velden(v.bytes)) if (w.nr === 1) naam = tekst(w.bytes);
        (v.nr === 11 ? invoer : uitvoer).push(naam);
      }
    }
    // Vaste waarden meteen; een onbekende bewerking nu, niet pas bij het rekenen.
    const rest: Knoop[] = [];
    for (const k of knopen) {
      if (k.op === 'Constant') {
        const t = k.at.get('value');
        if (t == null || typeof t !== 'object' || Array.isArray(t)) throw new Error('onnx: Constant zonder waarde');
        vast.set(k.uit[0]!, t);
      } else if (!(k.op in BEWERKINGEN)) throw new Error(`onnx: de bewerking ${k.op} kan hier niet`);
      else rest.push(k);
    }
    this.#knopen = rest;
    this.#vast = vast;
    this.invoer = invoer.filter((n) => !vast.has(n));
    this.uitvoer = uitvoer;
  }

  /**
   * Rekent een keten door waarvan de invoer in de tijd opschuift: de eerste
   * rijen vallen weg en er komen evenveel nieuwe achteraan (`schuif`, langs
   * as `as`). Een laag zonder rand in de tijd hoeft dan alleen zijn nieuwe
   * rijen uit te rekenen; de rest komt uit de vorige keer (`stand`). Waar dat
   * niet kan (een andere schuif, een laag die alle rijen samenneemt), rekent
   * hij gewoon alles. De uitkomst is dezelfde als bij `run`.
   */
  runSchuivend(invoer: Tensor, as: number, schuif: number, stand: Schuifstand): Tensor {
    const w = new Map<string, Tensor>(this.#vast);
    /** Per tensor: langs welke as de tijd loopt, en hoeveel rijen er nieuw zijn (null: onbekend). */
    const tijd = new Map<string, { as: number; s: number | null }>();
    w.set(this.invoer[0]!, invoer);
    tijd.set(this.invoer[0]!, { as, s: stand.uit.size ? schuif : null });
    for (const k of this.#knopen) {
      const ins = k.in.map((n) => (n === '' ? null : (w.get(n) ?? null)));
      const x = ins[0];
      if (x == null) throw new Error(`onnx: ${k.op} mist zijn invoer ${k.in[0] ?? ''}`);
      const naam = k.uit[0]!;
      const t = tijd.get(k.in[0]!);
      const oud = stand.uit.get(naam);
      const rest = ins.slice(1).every((v, i) => v == null || this.#vast.has(k.in[i + 1]!));
      let uit: Tensor | null = null;
      let na: { as: number; s: number | null } | null = null;
      if (k.op === 'Reshape') {
        uit = BEWERKINGEN[k.op]!(ins, k.at);
        const j = t ? tijdAs(x.dims, t.as, uit.dims) : -1;
        na = j >= 0 ? { as: j, s: t!.s } : null;
      } else if (t?.s != null && oud && rest) {
        const s = t.s;
        if (PER_PUNT.has(k.op)) {
          uit = plak(oud, s, BEWERKINGEN[k.op]!([rijen(x, t.as, x.dims[t.as]! - s, x.dims[t.as]!), ...ins.slice(1)], k.at), t.as);
          na = { as: t.as, s };
        } else if ((k.op === 'Conv' || k.op === 'MaxPool') && t.as === 2 && x.dims.length === 4) {
          const v = venster(k.at, false, k.op === 'Conv' ? [ins[1]!.dims[2]!, ins[1]!.dims[3]!] : undefined);
          const hOut = oud.dims[2]!;
          if (v.pt === 0 && v.pb === 0 && v.dh === 1 && s % v.sh === 0 && s / v.sh < hOut) {
            const sOut = s / v.sh;
            const nieuw = BEWERKINGEN[k.op]!([rijen(x, 2, (hOut - sOut) * v.sh, x.dims[2]!), ...ins.slice(1)], k.at);
            if (nieuw.dims[2] === sOut) {
              uit = plak(oud, sOut, nieuw, 2);
              na = { as: 2, s: sOut };
            }
          }
        }
      }
      if (uit == null) {
        uit = BEWERKINGEN[k.op]!(ins, k.at);
        na = t && PER_PUNT.has(k.op) ? { as: t.as, s: null } : null;
      }
      w.set(naam, uit);
      if (na) tijd.set(naam, na);
      stand.uit.set(naam, uit);
    }
    const uit = w.get(this.uitvoer[0]!);
    if (!uit) throw new Error('onnx: geen uitvoer');
    return uit;
  }

  /** Rekent de grafiek door; geeft de eerste uitvoer terug. */
  run(invoer: Readonly<Record<string, Tensor>>): Tensor {
    const w = new Map<string, Tensor>(this.#vast);
    for (const [k, t] of Object.entries(invoer)) w.set(k, t);
    for (const k of this.#knopen) {
      const ins = k.in.map((n) => (n === '' ? null : (w.get(n) ?? null)));
      if (ins[0] == null) throw new Error(`onnx: ${k.op} mist zijn invoer ${k.in[0] ?? ''}`);
      w.set(k.uit[0]!, BEWERKINGEN[k.op]!(ins, k.at));
    }
    const uit = w.get(this.uitvoer[0]!);
    if (!uit) throw new Error('onnx: geen uitvoer');
    return uit;
  }
}
