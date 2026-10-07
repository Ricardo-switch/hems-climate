/**
 * De zoninval voor de weergave en de assistent (besluit 93).
 *
 * Waar de zon nu staat, op welke gevel hij valt en onder welke hoek, en wat de
 * panelen bij een heldere lucht zouden leveren, naast wat ze werkelijk leveren.
 * Rekent alleen met de ligging van het huis en de vlakken uit de configuratie;
 * leest niets uit Home Assistant.
 */

import type { Geometry } from '../core/model.js';
import { clearSkyOnPlaneWm2, incidenceDeg, sunOnPlane, sunPosition } from '../core/sun.js';
import { factorFor, type SolarLearned } from './solar-learn.js';

export interface Location {
  readonly latDeg: number;
  readonly lonDeg: number;
}

export interface SunReport {
  readonly tMs: number;
  readonly zon: {
    readonly hoogteGraden: number;
    readonly richtingGraden: number;
    readonly boven: boolean;
  };
  readonly gevels: readonly {
    readonly id: string;
    readonly naam: string;
    readonly richtingGraden: number;
    readonly bron: string;
    readonly inDeZon: boolean;
    /** De hoek tussen de zon en de loodlijn op de gevel, of null in de schaduw. */
    readonly invalshoekGraden: number | null;
  }[];
  readonly panelen: readonly {
    readonly id: string;
    readonly richtingGraden: number;
    readonly hellingGraden: number;
    readonly wattpiek: number;
    readonly bron: string;
    readonly heldereLuchtW: number;
  }[];
  /** Alle vlakken samen bij een heldere lucht, afgekapt op de omvormer. */
  readonly heldereLuchtW: number;
  /**
   * Waar de lijn voor een heldere lucht vandaan komt: geleerd uit de eigen
   * opbrengst, of nog een schatting (besluiten 88 en 93). `zin` is het
   * onderschrift voor de grafiek.
   */
  readonly heldereLucht: {
    readonly bron: 'geleerd' | 'geschat';
    readonly dagen: number;
    readonly zin: string;
  };
  /** Per kwartier van vandaag, van middernacht tot middernacht. */
  readonly kwartieren: readonly { readonly tMs: number; readonly heldereLuchtW: number }[];
  /**
   * De dag van de zon, voor de tekening van het huis: waar hij op de boog staat.
   * Uitgerekend in de dienst, zodat de pagina hem alleen hoeft neer te zetten (94).
   */
  readonly dag: {
    readonly opMs: number | null;
    readonly onderMs: number | null;
    /** 0 bij zonsopkomst, 1 bij zonsondergang; null als de zon onder is. */
    readonly fractie: number | null;
    /** De hoogte nu als deel van de hoogste stand van vandaag, 0 tot 1. */
    readonly hoogteDeel: number;
    /** Komt de zon op aan de kant van de voorgevel; null zonder voorgevel. */
    readonly opVoorkant: boolean | null;
  };
}

/**
 * Hoeveel van de wattpiek de panelen bij een heldere lucht halen, zolang het
 * huis het nog niet zelf heeft geleerd: warmte, kabels en de omvormer kosten
 * wat. Daarna neemt de geleerde factor per zonnestand het over (besluit 93,
 * `solar-learn.ts`).
 */
const PERFORMANCE = 0.85;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Wat alle vlakken samen bij een heldere lucht leveren, afgekapt op de omvormer. */
export function clearSkyW(geometry: Geometry, location: Location, ms: number, learned: SolarLearned | null): number {
  const sun = sunPosition(ms, location.latDeg, location.lonDeg);
  const { factor } = factorFor(learned, sun, PERFORMANCE);
  const total = geometry.solarPlanes.reduce((sum, p) => sum + (clearSkyOnPlaneWm2(sun, p) / 1000) * p.peakW * factor, 0);
  return Math.round(Math.min(total, geometry.inverterMaxW ?? Infinity));
}

function clearSkyCaption(learned: SolarLearned | null): SunReport['heldereLucht'] {
  if (learned != null && learned.overall != null) {
    const dagen = learned.days;
    return { bron: 'geleerd', dagen, zin: `Zon bij heldere lucht, geleerd uit ${dagen} ${dagen === 1 ? 'dag' : 'dagen'}` };
  }
  return { bron: 'geschat', dagen: learned?.days ?? 0, zin: 'Zon bij heldere lucht, nog geschat' };
}

export function sunReport(
  geometry: Geometry,
  location: Location,
  nowMs: number,
  dayStartMs: number,
  learned: SolarLearned | null = null,
): SunReport {
  const sun = sunPosition(nowMs, location.latDeg, location.lonDeg);
  const { factor } = factorFor(learned, sun, PERFORMANCE);
  const facades = geometry.facades.map((f) => {
    const plane = { azimuthDeg: f.azimuthDeg, tiltDeg: 90 };
    const angle = incidenceDeg(sun, plane);
    return {
      id: f.id,
      naam: f.name,
      richtingGraden: f.azimuthDeg,
      bron: f.source,
      inDeZon: sunOnPlane(sun, plane),
      invalshoekGraden: angle == null ? null : Math.round(angle),
    };
  });
  const planes = geometry.solarPlanes.map((p) => ({
    id: p.id,
    richtingGraden: p.azimuthDeg,
    hellingGraden: p.tiltDeg,
    wattpiek: p.peakW,
    bron: p.source,
    heldereLuchtW: Math.round((clearSkyOnPlaneWm2(sun, p) / 1000) * p.peakW * factor),
  }));
  const quarters: { tMs: number; heldereLuchtW: number }[] = [];
  for (let t = dayStartMs; t < dayStartMs + 24 * 3_600_000; t += 15 * 60_000) {
    // Het midden van het kwartier, zoals het dagoverzicht het gemiddelde neemt.
    quarters.push({ tMs: t, heldereLuchtW: clearSkyW(geometry, location, t + 7.5 * 60_000, learned) });
  }
  // Op- en ondergang en het hoogste punt van vandaag, minuut voor minuut.
  let opMs: number | null = null;
  let onderMs: number | null = null;
  let highest = 0;
  for (let t = dayStartMs; t < dayStartMs + 24 * 3_600_000; t += 60_000) {
    const p = sunPosition(t, location.latDeg, location.lonDeg);
    if (p.elevationDeg > 0) {
      opMs ??= t;
      onderMs = t;
      highest = Math.max(highest, p.elevationDeg);
    }
  }
  const up = sun.elevationDeg > 0 && opMs != null && onderMs != null && onderMs > opMs;
  const front = geometry.facades.find((f) => f.id === 'voorgevel') ?? geometry.facades[0];
  let opVoorkant: boolean | null = null;
  if (front && opMs != null) {
    const rise = sunPosition(opMs, location.latDeg, location.lonDeg).azimuthDeg;
    const diff = Math.abs((((rise - front.azimuthDeg) % 360) + 540) % 360 - 180);
    opVoorkant = diff < 90;
  }

  return {
    tMs: nowMs,
    dag: {
      opMs,
      onderMs,
      fractie: up ? Math.round(((nowMs - opMs!) / (onderMs! - opMs!)) * 1000) / 1000 : null,
      hoogteDeel: up && highest > 0 ? Math.round((sun.elevationDeg / highest) * 1000) / 1000 : 0,
      opVoorkant,
    },
    zon: {
      hoogteGraden: round1(sun.elevationDeg),
      richtingGraden: Math.round(sun.azimuthDeg),
      boven: sun.elevationDeg > 0,
    },
    gevels: facades,
    panelen: planes,
    heldereLuchtW: clearSkyW(geometry, location, nowMs, learned),
    heldereLucht: clearSkyCaption(learned),
    kwartieren: quarters,
  };
}
