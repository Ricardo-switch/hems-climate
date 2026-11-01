/*
 * De dag van het voorbeeldhuis (besluit 237): wat het huis op elk moment van
 * een zomer- of winterdag doet, als getallen. Hetzelfde verloop als de schets
 * `design/app2/voorbeeldhuis.js`; het nagemaakte Home Assistant (nep-ha.ts)
 * maakt er de standen van de apparaten van, en de regeling van SunArc rekent
 * daar gewoon op.
 */

export type Seizoen = 'zomer' | 'winter';

/** Waar de klok van het voorbeeld staat: een minuut van de dag, in de zomer of de winter. */
export interface Klok {
  readonly minuut: number;
  readonly seizoen: Seizoen;
}

/** Zonsopkomst en -ondergang in minuten, op 15 juli en 13 januari. */
export const ZON: Readonly<Record<Seizoen, readonly [number, number]>> = { zomer: [334, 1312], winter: [522, 1012] };

/** De dag van het voorbeeld in het jaar van `nuMs`: 15 juli of 13 januari, om middernacht in Amsterdam. */
export function dagBegin(seizoen: Seizoen, nuMs: number): number {
  const jaar = new Date(nuMs).getUTCFullYear();
  // Zomertijd in juli (UTC+2), wintertijd in januari (UTC+1).
  return seizoen === 'zomer' ? Date.UTC(jaar, 6, 15) - 2 * 3_600_000 : Date.UTC(jaar, 0, 13) - 3_600_000;
}

/** Het voorbeeld op één moment. */
export interface Moment {
  /** De zon boven de horizon: 0 bij opkomst, 1 bij ondergang; 0 in de nacht. */
  readonly zonStand: number;
  readonly zonHoogte: number;
  /** Wat de panelen leveren, in watt. */
  readonly zonW: number;
  readonly buitenC: number;
  readonly licht: boolean;
  readonly avond: boolean;
  /** De droger draait (op zon). */
  readonly droger: boolean;
  /** De airco in de woonkamer koelt. */
  readonly koelt: boolean;
  /** De warmtepomp verwarmt. */
  readonly verwarmt: boolean;
  readonly autoLaadt: boolean;
  readonly autoPct: number;
  readonly batterijPct: number;
  /** Positief is laden, negatief is het huis voeden. */
  readonly batterijW: number;
  readonly lampen: boolean;
  readonly screensDicht: boolean;
  /** Wat het huis zelf gebruikt, zonder auto en batterij. */
  readonly huisW: number;
  readonly temp: Readonly<Record<'woonkamer' | 'keuken' | 'badkamer' | 'slaapkamer' | 'kinderkamer' | 'zolder', number>>;
}

const rond = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** Het voorbeeldhuis op minuut `m` van de dag, in seizoen `s`. */
export function moment({ minuut: m, seizoen: s }: Klok): Moment {
  const [op, onder] = ZON[s];
  const winter = s === 'winter';
  const licht = m > op && m < onder;
  const zonStand = licht ? (m - op) / (onder - op) : 0;
  const zonHoogte = licht ? Math.sin(Math.PI * zonStand) * (winter ? 0.45 : 0.95) : 0;
  const zonW = licht ? Math.round(zonHoogte * (winter ? 1600 : 4400)) : 0;
  const avond = !licht || m > onder - 120;
  const droger = !winter && m >= 690 && m < 860;
  const koelt = !winter && licht && m > 660 && m < 1020;
  const verwarmt = winter && m > 360 && m < 1350;
  const autoLaadt = !winter && licht && m > 660 && m < 990;
  const autoPct = winter ? 55 : Math.round(Math.min(100, 40 + Math.max(0, Math.min(m, 990) - 660) / 6));
  const huisW = 260 + (droger ? 700 : 0) + (koelt ? 900 : 0) + (verwarmt ? (zonW > 800 ? 1400 : 1100) : 0) + (avond && m < 1380 ? 350 : 0);
  const over = zonW - huisW - (autoLaadt ? 1400 : 0);
  const batterijPct = Math.round(Math.max(18, Math.min(96, winter ? 40 + zonW / 100 : 30 + (Math.min(m, 1020) - 540) / 7)));
  const batterijW = over > 300 && batterijPct < 96 ? Math.min(2000, over - 100) : avond && batterijPct > 20 ? -Math.min(huisW, 1200) : 0;
  // Buiten: het koelst vlak voor zonsopkomst, het warmst rond vier uur.
  const dagGang = Math.cos(((m - 960) / 1440) * 2 * Math.PI);
  const buitenC = winter ? rond(1 + 3 * dagGang) : rond(20 + 6 * dagGang);
  const binnen = (basis: number, zon: number) => rond(basis + zon * zonHoogte);
  const temp = winter
    ? { woonkamer: verwarmt ? 20.8 : 19.4, keuken: 20.4, badkamer: 21.5, slaapkamer: 18.1, kinderkamer: 18.6, zolder: binnen(16.6, 1.4) }
    : { woonkamer: koelt ? 23.6 : binnen(23.2, 1.4), keuken: binnen(22.8, 0.8), badkamer: 23.5, slaapkamer: binnen(22.0, 1.2), kinderkamer: binnen(22.3, 1.2), zolder: binnen(23.4, 3) };
  return {
    zonStand,
    zonHoogte,
    zonW,
    buitenC,
    licht,
    avond,
    droger,
    koelt,
    verwarmt,
    autoLaadt,
    autoPct,
    batterijPct,
    batterijW: Math.round(batterijW),
    lampen: avond || (winter && m < 600),
    screensDicht: avond || (!winter && m > 780 && m < 1020),
    huisW,
    temp,
  };
}

/**
 * Wat de panelen op een willekeurige dag van het jaar per uur leveren, voor de
 * meterstanden van Opbrengst: tussen de winter- en de zomerdag in, naar de
 * stand van de zon in het jaar, met een paar bewolkte dagen.
 */
export function uurOpWelkeDag(dagVanJaar: number, uur: number): { zonWh: number; verbruikWh: number } {
  const zomer = (1 - Math.cos(((dagVanJaar - 15) / 365) * 2 * Math.PI)) / 2;
  const bewolkt = 0.45 + 0.55 * Math.abs(Math.sin(dagVanJaar * 12.9898) * 43758.5453 % 1);
  const z = moment({ minuut: uur * 60 + 30, seizoen: 'zomer' });
  const w = moment({ minuut: uur * 60 + 30, seizoen: 'winter' });
  const zonWh = Math.round((w.zonW + (z.zonW - w.zonW) * zomer) * bewolkt);
  const verbruikWh = Math.round(w.huisW + (z.huisW - w.huisW) * zomer);
  return { zonWh, verbruikWh };
}
