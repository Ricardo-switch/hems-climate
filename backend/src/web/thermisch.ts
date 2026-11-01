/**
 * Hoe je huis warmte vasthoudt (besluit 231): het eerste deel van het
 * thermisch model (stap D, besluit 46), geleerd uit het beslislogboek.
 *
 * Per kwartier per zone de temperatuur, buiten, de zon en wat de apparaten
 * deden. Daaruit, per zone:
 *
 * - **Afkoelen:** stukken van minstens drie uur zonder zon en zonder dat er iets
 *   warmt of koelt. Newton: de helling is −k maal het verschil met buiten. Over
 *   het hele stuk gemeten, want per kwartier is de meter te grof (0,05°).
 * - **Zon:** overdag, niets aan: wat er na het afkoelen overblijft, per kW van
 *   de panelen.
 * - **Elk apparaat:** kwartieren waarin alleen dat apparaat iets deed: wat er na
 *   het afkoelen en de zon overblijft, per stand (warmen of koelen).
 *
 * Een apparaat doet iets als het op warmen staat met een doel boven de kamer,
 * of op koelen met een doel eronder. Of de ketel werkelijk brandt, ziet het
 * logboek niet; een warmer die zo geen merkbare warmte geeft, heet nog
 * onduidelijk in plaats van een getal dat niet klopt.
 *
 * Alleen wereldbeeld, geen beleid (besluit 46): de regeling gebruikt het nog
 * niet. Het rekent elke dag één keer, en bewaart de uitkomst naast het logboek.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { SiteConfig } from '../core/model.js';
import { findLogFiles, readMoments } from '../divergence/read.js';

const KWARTIER = 15 * 60_000;
/** Zoveel dagen terug: een huis verandert (de ventilatie), en lezen kost tijd. */
export const TERUG_DAGEN = 180;
/** Een rustig stuk is minstens zo lang, in kwartieren. */
const RUST_MIN = 12;
/** Minder zon dan dit telt als geen zon, in kW. */
const GEEN_ZON = 0.02;
/** Een kwartier met zon telt vanaf dit vermogen, in kW. */
const ZON_VANAF = 0.3;
/** Zoveel kwartieren voordat een apparaat een getal krijgt. */
const APPARAAT_MIN = 8;
/** Een warmer moet minstens zoveel graden per uur doen om als bekend te tellen, een koeler evenveel omlaag. */
const MERKBAAR = 0.2;
/** Het bestand met de uitkomst, naast het logboek. */
export const THERMISCH_FILE = 'thermisch.json';

/** Hoe zeker, van 0 tot 4 streepjes. */
export type Zeker = 0 | 1 | 2 | 3 | 4;
const zeker = (n: number, treden: readonly [number, number, number, number]): Zeker => treden.filter((t) => n >= t).length as Zeker;

export interface ThermischApparaat {
  readonly id: string;
  readonly naam: string;
  readonly stand: 'warmt' | 'koelt';
  /** Graden per uur bovenop afkoelen en zon; null zolang het niet merkbaar of te weinig gezien is. */
  readonly perUur: number | null;
  readonly kwartieren: number;
  readonly zeker: Zeker;
}

export interface ThermischZone {
  readonly id: string;
  readonly naam: string;
  /** Afkoelen per uur per graad verschil met buiten; null zonder rustige stukken. */
  readonly k: number | null;
  /** Tijdconstante in uren (1/k). */
  readonly tauUur: number | null;
  readonly rustUren: number;
  /** Graden per uur per kW van de panelen; null zonder zonnige kwartieren. */
  readonly zonPerKw: number | null;
  readonly zonKwartieren: number;
  readonly zeker: { readonly afkoelen: Zeker; readonly zon: Zeker };
  readonly apparaten: readonly ThermischApparaat[];
}

export interface ThermischRapport {
  readonly versie: 1;
  /** De dag waarop het is uitgerekend, JJJJ-MM-DD (UTC). */
  readonly dag: string;
  /** Vanaf wanneer er gemeten is. */
  readonly sindsMs: number | null;
  readonly dagen: number;
  readonly zones: readonly ThermischZone[];
  /** Leert nog tot elke zone zijn afkoelen kent en een warmer die iets merkbaars doet. */
  readonly stand: 'leert' | 'werkt';
}

/** Wat het leren van een moment nodig heeft. */
export interface ThermischMoment {
  readonly tMs: number;
  readonly zones: readonly { readonly id: string; readonly temperatureC: number | null }[];
  readonly observed: Readonly<Record<string, string>>;
  readonly outdoorC: number | null;
  readonly solarW: number | null;
}

interface Kwartier {
  readonly T: Map<string, number[]>;
  readonly buiten: number[];
  readonly zon: number[];
  readonly obs: Map<string, Set<string>>;
}

/** Doet het apparaat iets bij deze kamertemperatuur: `warmt`, `koelt`, `iets` (onbekend wat) of null. */
function doet(waarde: string, T: number): 'warmt' | 'koelt' | 'iets' | null {
  const [stand, doelRuw] = waarde.split('@');
  if (stand === 'off' || stand === 'onbekend' || stand === 'unavailable' || stand === 'unknown') return null;
  const doel = doelRuw == null ? NaN : Number(doelRuw);
  // Warmen en koelen met één doel (een vloerthermostaat op auto): alleen warmen ligt voor de hand.
  if (stand === 'heat' || stand === 'heat_cool' || stand === 'auto') return Number.isFinite(doel) && doel <= T + 0.3 ? null : 'warmt';
  if (stand === 'cool') return Number.isFinite(doel) && doel >= T - 0.3 ? null : 'koelt';
  return stand === 'fan_only' || stand === 'dry' ? null : 'iets';
}

const mediaan = (l: readonly number[]) => {
  const s = [...l].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const gem = (l: readonly number[]) => l.reduce((a, b) => a + b, 0) / l.length;

/** Leert uit momenten in tijdsvolgorde. */
export function leerThermisch(
  momenten: Iterable<ThermischMoment>,
  zones: readonly ThermischZoneIn[],
  nowMs: number,
): ThermischRapport {
  const kw = new Map<number, Kwartier>();
  for (const m of momenten) {
    const q = Math.floor(m.tMs / KWARTIER);
    let k = kw.get(q);
    if (!k) kw.set(q, (k = { T: new Map(), buiten: [], zon: [], obs: new Map() }));
    for (const z of m.zones) if (z.temperatureC != null) (k.T.get(z.id) ?? k.T.set(z.id, []).get(z.id)!).push(z.temperatureC);
    if (m.outdoorC != null) k.buiten.push(m.outdoorC);
    if (m.solarW != null) k.zon.push(m.solarW);
    for (const [id, v] of Object.entries(m.observed)) (k.obs.get(id) ?? k.obs.set(id, new Set()).get(id)!).add(v);
  }
  const qs = [...kw.keys()].sort((a, b) => a - b);
  const dag = new Date(nowMs).toISOString().slice(0, 10);
  const leeg: ThermischRapport = { versie: 1, dag, sindsMs: null, dagen: 0, zones: [], stand: 'leert' };
  if (qs.length < 2) return leeg;
  const tempIn = (q: number, z: string) => {
    const l = kw.get(q)?.T.get(z);
    return l?.length ? mediaan(l) : null;
  };

  const uit: ThermischZone[] = [];
  for (const zone of zones) {
    // Per paar opeenvolgende kwartieren: de helling, het verschil met buiten, de zon en wie wat deed.
    const stappen: { q: number; helling: number; dT: number; zonKw: number; doen: Map<string, string> }[] = [];
    for (let i = 1; i < qs.length; i++) {
      const a = qs[i - 1]!;
      const b = qs[i]!;
      if (b - a !== 1) continue;
      const ta = tempIn(a, zone.id);
      const tb = tempIn(b, zone.id);
      const ka = kw.get(a)!;
      const kb = kw.get(b)!;
      const buiten = [...ka.buiten, ...kb.buiten];
      if (ta == null || tb == null || buiten.length === 0) continue;
      const T = (ta + tb) / 2;
      const zon = [...ka.zon, ...kb.zon];
      const doen = new Map<string, string>();
      for (const id of new Set([...ka.obs.keys(), ...kb.obs.keys()])) {
        const wat = new Set([...(ka.obs.get(id) ?? []), ...(kb.obs.get(id) ?? [])].map((v) => doet(v, T)).filter((x) => x != null));
        if (wat.size) doen.set(id, wat.size === 1 ? [...wat][0]! : 'iets');
      }
      stappen.push({ q: a, helling: (tb - ta) * 4, dT: T - gem(buiten), zonKw: zon.length ? gem(zon) / 1000 : 0, doen });
    }

    // Afkoelen: rustige stukken, de helling over het hele stuk.
    const stukken: (typeof stappen)[] = [];
    let cur: typeof stappen = [];
    for (const s of stappen) {
      const rustig = s.doen.size === 0 && s.zonKw < GEEN_ZON;
      if (rustig && (cur.length === 0 || s.q === cur.at(-1)!.q + 1)) cur.push(s);
      else {
        if (cur.length >= RUST_MIN) stukken.push(cur);
        cur = rustig ? [s] : [];
      }
    }
    if (cur.length >= RUST_MIN) stukken.push(cur);
    let teller = 0;
    let noemer = 0;
    let rustUren = 0;
    for (const s of stukken) {
      const t0 = tempIn(s[0]!.q, zone.id)!;
      const t1 = tempIn(s.at(-1)!.q + 1, zone.id)!;
      const uren = s.length / 4;
      const dT = gem(s.map((x) => x.dT));
      teller += -((t1 - t0) / uren) * dT * uren;
      noemer += dT * dT * uren;
      rustUren += uren;
    }
    const k = noemer > 0 && teller > 0 ? teller / noemer : null;

    // Zon: niets aan, wel zon.
    const zonnig = stappen.filter((s) => s.doen.size === 0 && s.zonKw > ZON_VANAF);
    const zTeller = k == null ? 0 : zonnig.reduce((t, s) => t + (s.helling + k * s.dT) * s.zonKw, 0);
    const zNoemer = zonnig.reduce((t, s) => t + s.zonKw * s.zonKw, 0);
    const zonPerKw = k != null && zNoemer > 0 ? zTeller / zNoemer : null;

    // Elk apparaat van de zone, per stand: alleen dat apparaat deed iets.
    const apparaten: ThermischApparaat[] = [];
    for (const a of zone.apparaten) {
      for (const stand of ['warmt', 'koelt'] as const) {
        // Wat het apparaat kan, ook als het nog niet gezien is: dan zegt de app dat.
        if (!(stand === 'warmt' ? a.warmen : a.koelen)) continue;
        const rest = k == null ? [] : stappen.filter((s) => s.doen.size === 1 && s.doen.get(a.id) === stand).map((s) => s.helling + k * s.dT - (zonPerKw ?? 0) * s.zonKw);
        const v = rest.length >= APPARAAT_MIN ? gem(rest) : null;
        const merkbaar = v != null && (stand === 'warmt' ? v >= MERKBAAR : v <= -MERKBAAR / 2);
        apparaten.push({ id: a.id, naam: a.naam, stand, perUur: merkbaar ? r2(v) : null, kwartieren: rest.length, zeker: merkbaar ? zeker(rest.length, [8, 40, 160, 480]) : 0 });
      }
    }

    uit.push({
      id: zone.id,
      naam: zone.naam,
      k: k == null ? null : Math.round(k * 10_000) / 10_000,
      tauUur: k == null ? null : Math.round(1 / k),
      rustUren: Math.round(rustUren),
      zonPerKw: zonPerKw == null ? null : r2(zonPerKw),
      zonKwartieren: zonnig.length,
      zeker: { afkoelen: k == null ? 0 : zeker(rustUren, [24, 72, 168, 336]), zon: zonPerKw == null ? 0 : zeker(zonnig.length, [16, 80, 320, 1000]) },
      apparaten,
    });
  }

  const gemeten = uit.filter((z) => z.k != null);
  const klaar = gemeten.length > 0 && gemeten.every((z) => z.zeker.afkoelen >= 3 && z.apparaten.some((a) => a.stand === 'warmt' && a.zeker >= 2));
  return {
    versie: 1,
    dag,
    sindsMs: qs[0]! * KWARTIER,
    dagen: Math.round((qs.at(-1)! - qs[0]!) / 96),
    zones: gemeten,
    stand: klaar ? 'werkt' : 'leert',
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Een zone zoals het leren hem nodig heeft: zijn apparaten, en wat die kunnen. */
export interface ThermischZoneIn {
  readonly id: string;
  readonly naam: string;
  readonly apparaten: readonly { readonly id: string; readonly naam: string; readonly warmen: boolean; readonly koelen: boolean }[];
}

/** De zones van het huis met hun apparaten, zoals de configuratie ze noemt. */
export function thermischZones(config: SiteConfig): ThermischZoneIn[] {
  return config.zones.map((z) => ({
    id: z.id,
    naam: z.name,
    apparaten: z.actuatorIds.flatMap((id) => {
      const a = config.actuators.find((x) => x.id === id);
      return a ? [{ id: a.id, naam: a.name, warmen: a.capabilities.canHeat, koelen: a.capabilities.canCool }] : [];
    }),
  }));
}

const DAG_VAN = /(\d{4}-\d{2}-\d{2})\.ndjson(\.gz)?$/;

/**
 * Leert één keer per dag uit het logboek, en bewaart het naast het logboek
 * zodat een herstart het niet opnieuw hoeft te lezen.
 */
export class ThermischLeer {
  readonly #logDir: string;
  readonly #now: () => number;
  #rapport: ThermischRapport | null = null;
  #geladen = false;
  #bezig: Promise<ThermischRapport | null> | null = null;

  constructor(options: { logDir: string; now?: () => number }) {
    this.#logDir = options.logDir;
    this.#now = options.now ?? Date.now;
  }

  get current(): ThermischRapport | null {
    return this.#rapport;
  }

  /** Het rapport van vandaag; rekent als het er nog niet is, één keer tegelijk. */
  bijwerken(config: SiteConfig): Promise<ThermischRapport | null> {
    const vandaag = new Date(this.#now()).toISOString().slice(0, 10);
    if (this.#rapport?.dag === vandaag) return Promise.resolve(this.#rapport);
    this.#bezig ??= this.#reken(config, vandaag).finally(() => {
      this.#bezig = null;
    });
    return this.#bezig;
  }

  async #reken(config: SiteConfig, vandaag: string): Promise<ThermischRapport | null> {
    const bestand = join(this.#logDir, THERMISCH_FILE);
    if (!this.#geladen) {
      this.#geladen = true;
      try {
        const bewaard = JSON.parse(await readFile(bestand, 'utf-8')) as ThermischRapport;
        if (bewaard.versie === 1) this.#rapport = bewaard;
        if (bewaard.dag === vandaag) return bewaard;
      } catch {
        // Nog niet bewaard: dan uit het logboek.
      }
    }
    const vanaf = new Date(this.#now() - TERUG_DAGEN * 86_400_000).toISOString().slice(0, 10);
    const bestanden = (await findLogFiles(this.#logDir)).filter((p) => (DAG_VAN.exec(basename(p))?.[1] ?? '') >= vanaf);
    const momenten: ThermischMoment[] = [];
    for await (const m of readMoments(bestanden)) momenten.push({ tMs: m.tMs, zones: m.zones, observed: m.observed, outdoorC: m.outdoorC, solarW: m.solarW });
    const rapport = leerThermisch(momenten, thermischZones(config), this.#now());
    this.#rapport = rapport;
    const tijdelijk = `${bestand}.tmp`;
    await writeFile(tijdelijk, JSON.stringify(rapport), 'utf-8');
    await rename(tijdelijk, bestand);
    return rapport;
  }
}
