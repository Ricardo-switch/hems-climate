/**
 * Wat stroom en gas kosten, zoals een Nederlands contract het zegt (besluit 110).
 *
 * Een contract kent een normaal- en een daltarief, of één tarief; vaste posten
 * per dag, maand of jaar (vaste leveringskosten, netbeheer, en de vermindering
 * energiebelasting als aftrek); en voor teruglevering het salderen tot 2027,
 * daarna een vergoeding en terugleverkosten per kWh. Dit bestand rekent het
 * uit; het weet niets van meters of Home Assistant.
 *
 * Welke kWh dal is: bij voorkeur zegt de meter het (tarief 1 en tarief 2 van de
 * slimme meter). Anders de tijden van het daltarief: op werkdagen van 23 tot 7
 * uur (in Noord-Brabant en Limburg van 21 tot 7), en het hele weekend en de
 * feestdagen.
 *
 * Buiten Nederland (besluit 178): eigen daltijden, met of zonder het weekend en
 * zonder de Nederlandse feestdagen, en geen salderen.
 */

export type DalRegio = 'nl' | 'zuid' | 'eigen';

/** Eigen daltijden (besluit 178): van welk uur tot welk uur, en of het weekend helemaal dal is. */
export interface DalEigen {
  readonly van: number;
  readonly tot: number;
  readonly weekend: boolean;
}
export type VastPer = 'dag' | 'maand' | 'jaar';
export type VastSoort = 'stroom' | 'gas';

export interface VastePost {
  readonly naam: string;
  /** Euro; negatief voor een aftrek, zoals de vermindering energiebelasting. */
  readonly bedrag: number;
  readonly per: VastPer;
  readonly soort: VastSoort;
}

export interface Tarieven {
  /** Euro per kWh van het net, alles erin; bij dubbel tarief het normaaltarief. */
  readonly stroom: number | null;
  /** Het daltarief; null is één tarief. */
  readonly stroomDal?: number | null;
  /** Waar het huis staat, voor de tijden van het daltarief. */
  readonly dalUren?: DalRegio;
  /** De tijden bij `dalUren: 'eigen'` (besluit 178). */
  readonly dalEigen?: DalEigen | null;
  /** Of er gesaldeerd wordt (tot 2027, zoals in Nederland); false is nooit (besluit 178). Weg is wel. */
  readonly salderen?: boolean;
  /** Wat je krijgt voor wat je over een jaar meer teruglevert dan je verbruikt (zolang er gesaldeerd wordt). */
  readonly teruglevering: number | null;
  /** Vanaf 2027, als het salderen stopt. */
  readonly vanaf2027?: { readonly vergoeding: number | null; readonly kosten: number | null };
  /** Euro per m³ gas. */
  readonly gas: number | null;
  /** De vaste posten van het contract. */
  readonly vast?: readonly VastePost[];
  /**
   * De startdatum van het contract, "2025-03-15" (besluit 116). Het jaar van
   * Opbrengst en de jaarafrekening lopen dan van die dag tot dezelfde dag een
   * jaar later; zonder datum is het een kalenderjaar.
   */
  readonly contractStart?: string | null;
  /** Oud: alle vaste kosten samen per maand. Geldt alleen zolang er geen vaste posten zijn. */
  readonly vastPerMaand: number | null;
}

/** Het salderen stopt op 1 januari 2027, middernacht in Nederland. */
export const SALDEREN_TOT_MS = Date.UTC(2026, 11, 31, 23, 0, 0);

const DAG_MS = 86_400_000;

/* ---------------------------------------------------------------- daltijden */

/** Eén opmaak per tijdzone: een jaar per uur is 8760 keer, en een nieuwe opmaak is traag. */
const opmaak = new Map<string, Intl.DateTimeFormat>();
function delen(ms: number, tz: string): { y: number; m: number; d: number; h: number; wd: number } {
  let f = opmaak.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23', weekday: 'short' });
    opmaak.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p['weekday'] ?? '');
  return { y: Number(p['year']), m: Number(p['month']), d: Number(p['day']), h: Number(p['hour']), wd };
}

/** Eerste paasdag (Gregoriaans, Meeus/Jones/Butcher), als [maand, dag]. */
function pasen(y: number): [number, number] {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maand = Math.floor((h + l - 7 * m + 114) / 31);
  const dag = ((h + l - 7 * m + 114) % 31) + 1;
  return [maand, dag];
}

/** De feestdagen waarop het daltarief de hele dag geldt. */
export function isFeestdag(y: number, m: number, d: number): boolean {
  const [pm, pd] = pasen(y);
  const paas = Date.UTC(y, pm - 1, pd);
  const dag = Date.UTC(y, m - 1, d);
  const naPasen = Math.round((dag - paas) / DAG_MS);
  // Tweede paasdag, Hemelvaart, tweede pinksterdag.
  if (naPasen === 1 || naPasen === 39 || naPasen === 50) return true;
  // Nieuwjaar, Koningsdag (op zondag een dag eerder), eerste en tweede kerstdag.
  const koningsdag = new Date(Date.UTC(y, 3, 27)).getUTCDay() === 0 ? 26 : 27;
  return (m === 1 && d === 1) || (m === 4 && d === koningsdag) || (m === 12 && (d === 25 || d === 26));
}

/** Geldt op dit moment het daltarief? */
export function isDal(ms: number, tz: string, regio: DalRegio = 'nl', eigen: DalEigen | null = null): boolean {
  const p = delen(ms, tz);
  if (regio === 'eigen' && eigen) {
    if (eigen.weekend && (p.wd === 0 || p.wd === 6)) return true;
    // Over middernacht (23 tot 7) of binnen een dag (1 tot 6).
    return eigen.van > eigen.tot ? p.h >= eigen.van || p.h < eigen.tot : p.h >= eigen.van && p.h < eigen.tot;
  }
  if (p.wd === 0 || p.wd === 6 || isFeestdag(p.y, p.m, p.d)) return true;
  return p.h < 7 || p.h >= (regio === 'zuid' ? 21 : 23);
}

/** Welk deel van [van, tot) in het daltarief valt, per uur geteld. */
export function dalAandeel(van: number, tot: number, tz: string, regio: DalRegio = 'nl', eigen: DalEigen | null = null): number {
  if (tot <= van) return 0;
  let dal = 0;
  let alle = 0;
  for (let t = van; t < tot; t += 3_600_000) {
    alle += 1;
    if (isDal(t, tz, regio, eigen)) dal += 1;
  }
  return alle ? dal / alle : 0;
}

/**
 * Telt deze meter het daltarief? Een slimme meter heeft twee telwerken; in
 * Nederland is tarief 1 het lage (dal) en tarief 2 het normale.
 */
export function raadDal(id: string): boolean {
  return /(?:tarief|tariff|tarif)[ _-]?1(?![0-9])|_t1(?![0-9a-z])|\blaag\b|\blow\b|dal[ _-]?tarief|(?:^|[^a-z])dal(?:[^a-z]|$)/i.test(id);
}

/* ---------------------------------------------------------------- de kosten */

export interface Gebruik {
  readonly afNormaal: number;
  readonly afDal: number;
  /** Teruggeleverd zolang er gesaldeerd wordt. */
  readonly terugNormaal: number;
  readonly terugDal: number;
  /** Teruggeleverd vanaf 2027. */
  readonly terugNa: number;
  readonly gasM3: number;
  /** Hoe lang de periode is, in dagen. */
  readonly dagen: number;
  /** Een heel jaar: dan telt wat je meer teruglevert dan je verbruikt apart. */
  readonly heelJaar: boolean;
}

export interface KostenRegel {
  readonly naam: string;
  readonly uitleg: string;
  readonly euro: number | null;
}

export interface Kosten {
  readonly regels: readonly KostenRegel[];
  /** Stroom, teruglevering en gas samen; null zonder enige prijs. */
  readonly variabel: number | null;
  /** De vaste posten samen; null als ze niet ingesteld zijn. */
  readonly vast: number | null;
  /** Wat een kWh van het net gemiddeld kostte, voor de kosten per apparaat. */
  readonly stroomPerKwh: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Een prijs zoals op het contract: tot vijf decimalen, minstens twee. */
const eur = (n: number) => `€ ${(Math.abs(n) < 10 ? n.toFixed(5).replace(/0{1,3}$/, '') : n.toFixed(2)).replace('.', ',')}`;
const kwh = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kWh`;

/** Een vaste post over een periode van zoveel dagen. */
export function vastOver(post: VastePost, dagen: number): number {
  if (post.per === 'dag') return post.bedrag * dagen;
  if (post.per === 'maand') return (post.bedrag * dagen) / 30.4375;
  return (post.bedrag * dagen) / 365.25;
}

export function kostenVan(p: Tarieven, u: Gebruik, heeft: { readonly net: boolean; readonly terug: boolean; readonly gas: boolean }): Kosten {
  const regels: KostenRegel[] = [];
  const dubbel = p.stroomDal != null;
  const normaal = p.stroom;
  const dal = dubbel ? p.stroomDal! : p.stroom;
  let variabel: number | null = null;
  const tel = (euro: number | null) => {
    if (euro != null) variabel = (variabel ?? 0) + euro;
    return euro == null ? null : r2(euro);
  };

  // Stroom van het net.
  const af = u.afNormaal + u.afDal;
  if (heeft.net) {
    if (!dubbel) {
      regels.push({ naam: 'Stroom van het net', uitleg: normaal == null ? `${kwh(af)}, prijs nog niet ingesteld` : `${kwh(af)} × ${eur(normaal)}`, euro: tel(normaal == null ? null : af * normaal) });
    } else {
      regels.push({ naam: 'Stroom normaal', uitleg: normaal == null ? `${kwh(u.afNormaal)}, prijs nog niet ingesteld` : `${kwh(u.afNormaal)} × ${eur(normaal)}`, euro: tel(normaal == null ? null : u.afNormaal * normaal) });
      regels.push({ naam: 'Stroom dal', uitleg: `${kwh(u.afDal)} × ${eur(dal!)}`, euro: tel(u.afDal * dal!) });
    }
  }
  const afEuro = normaal == null ? null : u.afNormaal * normaal + u.afDal * (dal ?? normaal);

  // Teruglevering: salderen tegen het eigen tarief, wat er over een jaar meer
  // terugging dan je verbruikte tegen de vergoeding, en vanaf 2027 apart.
  const terugVoor = u.terugNormaal + u.terugDal;
  if (heeft.terug && terugVoor + u.terugNa > 0) {
    if (terugVoor > 0) {
      if (normaal == null) {
        regels.push({ naam: 'Teruggeleverd', uitleg: `${kwh(terugVoor)}, gesaldeerd; prijs nog niet ingesteld`, euro: null });
      } else {
        const tegenTarief = u.terugNormaal * normaal + u.terugDal * (dal ?? normaal);
        const gemiddeld = tegenTarief / terugVoor;
        const boven = u.heelJaar && p.teruglevering != null ? Math.max(0, terugVoor - af) : 0;
        if (boven > 0) {
          const gesaldeerd = terugVoor - boven;
          regels.push({ naam: 'Teruggeleverd', uitleg: `${kwh(gesaldeerd)} gesaldeerd, ${kwh(boven)} boven je verbruik × ${eur(p.teruglevering!)}`, euro: tel(-(gesaldeerd * gemiddeld + boven * p.teruglevering!)) });
        } else {
          regels.push({ naam: 'Teruggeleverd', uitleg: `${kwh(terugVoor)}, gesaldeerd tegen je stroomprijs`, euro: tel(-tegenTarief) });
        }
      }
    }
    if (u.terugNa > 0) {
      const v = p.vanaf2027?.vergoeding ?? null;
      const k = p.vanaf2027?.kosten ?? 0;
      regels.push({
        naam: 'Teruggeleverd, zonder salderen',
        uitleg: v == null ? `${kwh(u.terugNa)}, vergoeding${p.salderen === false ? '' : ' vanaf 2027'} nog niet ingesteld` : `${kwh(u.terugNa)} × ${eur(v)} vergoeding${k ? `, min ${eur(k)} kosten` : ''}`,
        euro: tel(v == null ? null : u.terugNa * (k - v)),
      });
    }
  }

  // Gas.
  if (heeft.gas) regels.push({ naam: 'Gas', uitleg: p.gas == null ? `${String(r2(u.gasM3)).replace('.', ',')} m³, prijs nog niet ingesteld` : `${String(r2(u.gasM3)).replace('.', ',')} m³ × ${eur(p.gas)}`, euro: tel(p.gas == null ? null : u.gasM3 * p.gas) });

  // Vaste posten, per soort; zonder posten de oude vaste kosten per maand.
  let vast: number | null = null;
  const posten = p.vast ?? [];
  if (posten.length) {
    for (const soort of ['stroom', 'gas'] as const) {
      const hier = posten.filter((x) => x.soort === soort);
      if (!hier.length) continue;
      const som = hier.reduce((t, x) => t + vastOver(x, u.dagen), 0);
      vast = (vast ?? 0) + som;
      regels.push({ naam: soort === 'stroom' ? 'Vaste kosten stroom' : 'Vaste kosten gas', uitleg: hier.map((x) => x.naam).join(', '), euro: r2(som) });
    }
  } else if (p.vastPerMaand != null) {
    vast = (p.vastPerMaand * u.dagen) / 30.4375;
    regels.push({ naam: 'Vaste kosten', uitleg: `${eur(p.vastPerMaand)} per maand`, euro: r2(vast) });
  } else {
    regels.push({ naam: 'Vaste kosten', uitleg: 'nog niet ingesteld', euro: null });
  }

  return {
    regels,
    variabel: variabel == null ? null : r2(variabel),
    vast: vast == null ? null : r2(vast),
    stroomPerKwh: afEuro == null || af <= 0 ? normaal : afEuro / af,
  };
}
