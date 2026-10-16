/**
 * Het taalmodel van de assistent (besluit 148), via een AI-taak van Home
 * Assistant. Twee taken, allebei met het vaste antwoord als vangnet:
 *
 * - **In eigen woorden:** het model zegt het vaste antwoord anders. Elk getal
 *   in de nieuwe zin moet letterlijk een feit uit het vaste antwoord zijn
 *   (besluit 88), een getal in woorden dat er niet stond mag niet, en het
 *   blijft kort. Klopt dat niet, of duurt het te lang, dan het vaste antwoord.
 * - **Kiezen:** een zin die de woordzoeker niet begrijpt, legt de dienst voor
 *   met de lijst van wat de app mag bedienen en de vaste vragen. Het model
 *   kiest; de dienst toetst die keuze (`vanKeuze`) en bouwt de opdracht met
 *   dezelfde bouwers als de woordzoeker. Het model roept zelf niets aan.
 *
 * Wat naar het model gaat: de vraag als tekst, het vaste antwoord met zijn
 * getallen, en de namen van kamers, lampen, scènes en schermen. Geen stem,
 * geen camerabeeld, niet wie er thuis is.
 */

import type { AiTaskField } from '../adapters/homeassistant/client.js';
import type { Fact, Lang, Question } from './assistant.js';
import type { Bedienbaar, Herkend, LichtActie, SchermActie } from './opdracht.js';
import { lichtOpdracht, sceneOpdracht, schermOpdracht } from './opdracht.js';

/** Vraagt de AI-taak om een tekst; geeft terug wat de taak antwoordt. */
export type Vraag = (instructions: string, structure?: Readonly<Record<string, AiTaskField>>) => Promise<unknown>;

/**
 * Zo lang wacht de assistent op het model; daarna het vaste antwoord. Een
 * snel model (flash-lite) antwoordt in een à twee seconden; een groter model
 * kan er tien seconden over doen, en dan is het vaste antwoord beter.
 */
export const WACHT_MS = 5_000;
/** Zo lang wacht "Proberen" bij Functies: lang genoeg om te zien hoe traag het model is. */
export const PROEF_MS = 30_000;
/** Zo lang mag een zin in eigen woorden zijn. */
export const MAX_ZIN = 400;

function opTijd<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((ok, fout) => {
    const t = setTimeout(() => fout(new Error('het taalmodel deed er te lang over')), ms);
    t.unref?.();
    p.then(
      (v) => {
        clearTimeout(t);
        ok(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        fout(e as Error);
      },
    );
  });
}

/* ------------------------------------------------------- in eigen woorden */

/** Getallen in woorden: die mogen alleen als ze al in het vaste antwoord stonden. */
const GETALWOORD =
  /\b(twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf|dertien|veertien|vijftien|zestien|zeventien|achttien|negentien|twintig|dertig|veertig|vijftig|zestig|zeventig|tachtig|negentig|honderd|duizend|miljoen|procent|graden|kilowatt|kilowattuur|watt|euro|cent|kwart|anderhalf|anderhalve|helft|dubbel|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|percent|degrees|kilowatts?|watts?|euros?|half|quarter|double)\b/gi;

/**
 * De nieuwe zin, schoongemaakt, als hij mag; anders null. Dezelfde regel als de
 * test van besluit 88, maar dan bij elk antwoord.
 */
export function controleerZin(nieuw: unknown, vast: { readonly antwoord: string; readonly feiten: readonly Fact[] }): string | null {
  if (typeof nieuw !== 'string') return null;
  let zin = nieuw.replace(/\s+/g, ' ').trim();
  // Aanhalingstekens om het hele antwoord heen.
  zin = zin.replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '').trim();
  if (zin === '' || zin.length > MAX_ZIN) return null;
  // Geen opmaak, geen lijst, geen code.
  if (/[*#`_<>{}[\]|\\]|^\s*[-•]/.test(zin) || /\n/.test(nieuw.trim())) return null;
  if (/undefined|NaN|null|\[object/.test(zin)) return null;
  // Geen entity-ID (besluit 45).
  if (/\b[a-z_]+\.[a-z0-9_]+\b/.test(zin)) return null;
  // Hooguit drie zinnen.
  if ((zin.match(/[.!?](?=\s|$)/g) ?? []).length > 3) return null;
  // Elk cijfer hoort bij een feit, precies zoals het er staat.
  let rest = zin;
  for (const f of [...vast.feiten].sort((a, b) => b.tekst.length - a.tekst.length)) rest = rest.split(f.tekst).join('');
  if (/\d/.test(rest)) return null;
  // Een getal in woorden alleen als het er al stond.
  const al = new Set((vast.antwoord.match(GETALWOORD) ?? []).map((w) => w.toLowerCase()));
  for (const w of zin.match(GETALWOORD) ?? []) if (!al.has(w.toLowerCase())) return null;
  return zin;
}

/** De opdracht aan het model om het vaste antwoord anders te zeggen. */
export function opdrachtEigenWoorden(vraag: string | null, vast: { readonly antwoord: string; readonly feiten: readonly Fact[] }, lang: Lang): string {
  const getallen = vast.feiten.map((f) => f.tekst);
  if (lang === 'en') {
    return [
      'You are the voice of a house talking with the person who lives there. Say the fixed answer below in your own words: warm, short and plain English, in the first person, at most three sentences. The answer first, then at most one short friendly sentence.',
      'Copy every number exactly as it is written below, with its unit. Do not add numbers, facts, advice or promises. Do not write numbers as words. No lists, no formatting, no quotation marks. Reply with the new text only.',
      vraag ? `Question: ${vraag}` : '',
      `Fixed answer: ${vast.antwoord}`,
      getallen.length ? `Numbers: ${getallen.join(' ; ')}` : 'There are no numbers.',
    ].filter(Boolean).join('\n');
  }
  return [
    'Je bent de stem van een huis dat praat met de bewoner. Zeg het vaste antwoord hieronder in je eigen woorden: warm, kort en in gewoon Nederlands, in de ik-vorm, hooguit drie zinnen. Eerst het antwoord, daarna hooguit één kort zinnetje sfeer.',
    'Neem elk getal precies over zoals het hieronder staat, met de eenheid (zoals "0,8 kW", "21,5°" of "16:30"). Voeg geen getallen, feiten, adviezen of beloftes toe. Schrijf geen getallen in woorden. Geen opsomming, geen opmaak, geen aanhalingstekens, geen Engelse woorden. Antwoord alleen met de nieuwe tekst.',
    vraag ? `Vraag van de bewoner: ${vraag}` : '',
    `Vast antwoord: ${vast.antwoord}`,
    getallen.length ? `Getallen: ${getallen.join(' ; ')}` : 'Er staan geen getallen in.',
  ].filter(Boolean).join('\n');
}

export interface EigenWoorden {
  readonly antwoord: string;
  readonly eigen: boolean;
  /** Waarom het het vaste antwoord werd, in gewone woorden; null als het lukte. */
  readonly reden: string | null;
  /** Hoe lang het model erover deed, of null als het niet antwoordde. */
  readonly ms: number | null;
}

/** Het vaste antwoord in eigen woorden, of het vaste antwoord als dat niet lukt. */
export async function inEigenWoorden(
  vraagModel: Vraag,
  vraag: string | null,
  vast: { readonly antwoord: string; readonly feiten: readonly Fact[] },
  lang: Lang,
  wachtMs = WACHT_MS,
): Promise<EigenWoorden> {
  const t0 = Date.now();
  try {
    const data = await opTijd(vraagModel(opdrachtEigenWoorden(vraag, vast, lang)), wachtMs);
    const ms = Date.now() - t0;
    const tekst = typeof data === 'object' && data != null ? (data as Record<string, unknown>)['zin'] : data;
    const zin = controleerZin(tekst, vast);
    if (zin != null) return { antwoord: zin, eigen: true, reden: null, ms };
    return { antwoord: vast.antwoord, eigen: false, reden: 'Het antwoord van het model klopte niet met de getallen, of was te lang.', ms };
  } catch (e) {
    // Geen model, te laat, of het gratis gebruik is op: dan het vaste antwoord.
    const te = /te lang over/.test((e as Error).message);
    return { antwoord: vast.antwoord, eigen: false, reden: te ? `Het model deed er langer dan ${Math.round(wachtMs / 1000)} seconden over.` : foutInWoorden(e), ms: null };
  }
}

/* ------------------------------------------------------- pauze na een fout */

/** Een fout van het model in gewone woorden, zonder de technische rest. */
export function foutInWoorden(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/^pauze: /.test(m)) return m.slice(7);
  if (/quota|exceeded|RESOURCE_EXHAUSTED|\b429\b|rate.?limit/i.test(m)) return 'Het gratis gebruik van dit model is op.';
  if (/high demand|overloaded|UNAVAILABLE|\b503\b/i.test(m)) return 'Het model heeft het nu te druk.';
  if (/insufficient funds|billing|credit/i.test(m)) return 'Er staat geen tegoed op het account van dit model.';
  if (/staat uit|geen AI-taak/i.test(m)) return 'Dit taalmodel mag de app niet gebruiken.';
  return 'Het model gaf een fout terug.';
}

/** "Please retry in 3h21m52.6s" als milliseconden, of null. */
export function opnieuwOver(m: string): number | null {
  const r = /retry in ((?:\d+h)?(?:\d+m)?(?:[\d.]+s)?)/i.exec(m)?.[1];
  if (!r) return null;
  const deel = (x: string) => Number(new RegExp(`([\\d.]+)${x}`).exec(r)?.[1] ?? 0);
  const ms = (deel('h') * 3600 + deel('m') * 60 + deel('s')) * 1000;
  return ms > 0 ? ms : null;
}

/**
 * Na een fout even niet vragen (besluit 148). Is het gratis gebruik op, of
 * heeft het model het te druk, dan heeft elke vraag daarna geen zin: zonder
 * pauze wacht iedere vraag eerst op dezelfde fout. Tijdens de pauze geeft de
 * assistent meteen het vaste antwoord.
 */
export class Pauze {
  #tot = 0;
  #reden = '';
  readonly #nu: () => number;

  constructor(nu: () => number = Date.now) {
    this.#nu = nu;
  }

  /** Tot wanneer, en waarom; null zonder pauze. */
  get stand(): { readonly tot: number; readonly reden: string } | null {
    return this.#nu() < this.#tot ? { tot: this.#tot, reden: this.#reden } : null;
  }

  /** Dezelfde vraag, maar met de pauze ervoor en erna. */
  om(vraag: Vraag): Vraag {
    return async (opdracht, velden) => {
      const s = this.stand;
      if (s) throw new Error(`pauze: ${s.reden}`);
      try {
        return await vraag(opdracht, velden);
      } catch (e) {
        this.#na(e);
        throw e;
      }
    };
  }

  #na(e: unknown): void {
    const m = e instanceof Error ? e.message : String(e);
    const reden = foutInWoorden(e);
    let ms = 0;
    if (/quota|exceeded|RESOURCE_EXHAUSTED|\b429\b|rate.?limit/i.test(m)) ms = Math.min(24 * 3600_000, opnieuwOver(m) ?? 3600_000);
    else if (/high demand|overloaded|UNAVAILABLE|\b503\b/i.test(m)) ms = 2 * 60_000;
    else if (/insufficient funds|billing|credit/i.test(m)) ms = 3600_000;
    if (ms > 0) {
      this.#tot = this.#nu() + ms;
      this.#reden = reden;
    }
  }
}

/* ------------------------------------------------------------ kiezen */

/** De vaste vragen die het model mag kiezen, met wat ze beantwoorden. */
const VRAGEN: readonly [Question['kind'], string][] = [
  ['nu', 'wat het huis nu doet'],
  ['waarom', 'waarom een kamer warm, koud of wachtend is (met kamer)'],
  ['straks', 'wat het huis straks gaat doen'],
  ['zon', 'hoeveel zon er is en nog komt'],
  ['vandaag', 'wat het huis vandaag deed'],
  ['warm', 'hoe warm het overal is'],
  ['morgen', 'het weer en de zon van morgen'],
  ['kosten', 'wat apparaten deze maand kostten'],
];

const VELDEN: Readonly<Record<string, AiTaskField>> = {
  soort: { description: 'licht, scene, scherm, vraag of niets', required: true },
  id: { description: 'het id uit de lijst, precies zoals het er staat; leeg bij een vraag of niets' },
  actie: { description: 'licht: aan, uit, zachter, feller, helderheid, warm, neutraal of koel. scherm: open, dicht, stop of stand. vraag: een van de vaste vragen' },
  waarde: { description: 'alleen bij helderheid of stand: een getal van 0 tot 100, anders leeg' },
  kamer: { description: 'alleen bij de vraag waarom: het id van de kamer' },
};

export interface Kamerlijst {
  readonly id: string;
  readonly naam: string;
}

/** De opdracht om te kiezen: de zin, wat er kan, en wat elk veld betekent. */
export function opdrachtKiezen(tekst: string, b: Bedienbaar, zones: readonly Kamerlijst[]): string {
  const regels: string[] = [
    'Je helpt een huis te begrijpen wat de bewoner bedoelt. Kies precies één ding uit de lijsten hieronder, of "niets" als het er niet bij staat of als het gevaarlijk of onduidelijk is.',
    'Bediening: kies alleen een id uit de lijst. Bij "zachter" of "feller" zonder getal: gebruik die acties. Bij een scherm: "stand" met een waarde van 0 (open) tot 100 (dicht); bij een zonnescherm is de waarde hoeveel hij uit staat. Een vraag over het huis: soort "vraag" met een van de vaste vragen.',
    `Zin van de bewoner: ${tekst}`,
  ];
  if (b.lampen.length) {
    regels.push('Lampen (soort licht):');
    for (const l of b.lampen) regels.push(`- ${l.id} | ${l.naam} | ${l.kamer}${l.dimbaar ? ' | dimbaar' : ''}${l.aan ? ` | nu aan${l.helderheidPct != null ? ` op ${l.helderheidPct}%` : ''}` : ' | nu uit'}`);
    regels.push('Kamers met licht (soort licht, alle lampen in de kamer samen):');
    for (const k of b.kamers) regels.push(`- kamer:${k.id} | ${k.naam}`);
  }
  if (b.scenes.length) {
    regels.push('Scènes (soort scene):');
    for (const s of b.scenes) regels.push(`- ${s.id} | ${s.naam} | ${s.kamer}`);
  }
  if (b.schermen.length) {
    regels.push('Schermen (soort scherm):');
    for (const s of b.schermen) {
      regels.push(`- ${s.id} | ${s.naam} | ${s.kamer}${s.zonnescherm ? ' | zonnescherm' : ''}${s.standKiezen ? ' | stand kiezen kan' : ' | alleen open, dicht en stop'}`);
    }
  }
  regels.push('Vaste vragen (soort vraag, actie is de vraag):');
  for (const [k, uitleg] of VRAGEN) regels.push(`- ${k}: ${uitleg}`);
  if (zones.length) regels.push(`Kamers voor de vraag waarom: ${zones.map((z) => `${z.id} (${z.naam})`).join(', ')}`);
  return regels.join('\n');
}

export type Keuze = { readonly soort: 'opdracht'; readonly herkend: Herkend } | { readonly soort: 'vraag'; readonly vraag: Question } | { readonly soort: 'niets' };

function veld(data: Record<string, unknown>, naam: string): string {
  const v = data[naam];
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

/**
 * Toetst wat het model koos. Alleen een id uit de lijst, alleen een actie die
 * bestaat, en een getal tussen 0 en 100; anders niets.
 */
export function vanKeuze(ruw: unknown, b: Bedienbaar, zones: readonly Kamerlijst[], lang: Lang): Keuze {
  let data = ruw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data.replace(/^```(?:json)?|```$/g, '').trim());
    } catch {
      return { soort: 'niets' };
    }
  }
  if (typeof data !== 'object' || data == null || Array.isArray(data)) return { soort: 'niets' };
  const d = data as Record<string, unknown>;
  const soort = veld(d, 'soort').toLowerCase();
  const id = veld(d, 'id');
  const actie = veld(d, 'actie').toLowerCase();
  const w = veld(d, 'waarde');
  const waarde = /^\d{1,3}$/.test(w) && Number(w) <= 100 ? Number(w) : null;

  if (soort === 'licht') {
    const acties: readonly LichtActie[] = ['aan', 'uit', 'zachter', 'feller', 'helderheid', 'warm', 'neutraal', 'koel'];
    if (!(acties as readonly string[]).includes(actie)) return { soort: 'niets' };
    if (actie === 'helderheid' && (waarde == null || waarde < 1)) return { soort: 'niets' };
    const lamp = b.lampen.find((l) => l.id === id);
    const kamer = id.startsWith('kamer:') ? b.kamers.find((k) => k.id === id.slice(6)) : undefined;
    if (!lamp && !kamer) return { soort: 'niets' };
    return { soort: 'opdracht', herkend: lichtOpdracht(lamp ? { soort: 'lamp', lamp } : { soort: 'kamer', kamer: kamer! }, actie as LichtActie, waarde, b, lang) };
  }
  if (soort === 'scene') {
    const scene = b.scenes.find((s) => s.id === id);
    return scene ? { soort: 'opdracht', herkend: sceneOpdracht(scene, b, lang) } : { soort: 'niets' };
  }
  if (soort === 'scherm') {
    const s = b.schermen.find((x) => x.id === id);
    const acties: readonly SchermActie[] = ['open', 'dicht', 'stop', 'stand'];
    if (!s || !(acties as readonly string[]).includes(actie)) return { soort: 'niets' };
    if (actie === 'stand' && waarde == null) return { soort: 'niets' };
    return { soort: 'opdracht', herkend: schermOpdracht(s, actie as SchermActie, waarde, b, lang) };
  }
  if (soort === 'vraag') {
    const kind = VRAGEN.find(([k]) => k === actie)?.[0];
    if (kind == null) return { soort: 'niets' };
    if (kind === 'waarom') {
      const kamer = veld(d, 'kamer');
      return zones.some((z) => z.id === kamer) ? { soort: 'vraag', vraag: { kind: 'waarom', kamer } } : { soort: 'niets' };
    }
    return { soort: 'vraag', vraag: { kind } as Question };
  }
  return { soort: 'niets' };
}

/** Laat het model kiezen wat een zin bedoelt; bij twijfel, fout of wachten: niets. */
export async function kies(vraagModel: Vraag, tekst: string, b: Bedienbaar, zones: readonly Kamerlijst[], lang: Lang, wachtMs = WACHT_MS): Promise<Keuze> {
  try {
    return vanKeuze(await opTijd(vraagModel(opdrachtKiezen(tekst, b, zones), VELDEN), wachtMs), b, zones, lang);
  } catch {
    return { soort: 'niets' };
  }
}
