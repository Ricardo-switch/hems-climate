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
  /** Per kwartier van vandaag, van middernacht tot middernacht. */
  readonly kwartieren: readonly { readonly tMs: number; readonly heldereLuchtW: number }[];
}

/**
 * Hoeveel van de wattpiek de panelen bij een heldere lucht halen: warmte,
 * kabels en de omvormer kosten wat. Een begin; het huis leert het echte getal
 * uit zijn eigen opbrengst (besluit 93).
 */
const PERFORMANCE = 0.85;

const round1 = (n: number) => Math.round(n * 10) / 10;

function clearSkyW(geometry: Geometry, location: Location, ms: number): number {
  const sun = sunPosition(ms, location.latDeg, location.lonDeg);
  const total = geometry.solarPlanes.reduce(
    (sum, p) => sum + (clearSkyOnPlaneWm2(sun, p) / 1000) * p.peakW * PERFORMANCE,
    0,
  );
  return Math.round(Math.min(total, geometry.inverterMaxW ?? Infinity));
}

export function sunReport(
  geometry: Geometry,
  location: Location,
  nowMs: number,
  dayStartMs: number,
): SunReport {
  const sun = sunPosition(nowMs, location.latDeg, location.lonDeg);
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
    heldereLuchtW: Math.round((clearSkyOnPlaneWm2(sun, p) / 1000) * p.peakW * PERFORMANCE),
  }));
  const quarters: { tMs: number; heldereLuchtW: number }[] = [];
  for (let t = dayStartMs; t < dayStartMs + 24 * 3_600_000; t += 15 * 60_000) {
    // Het midden van het kwartier, zoals het dagoverzicht het gemiddelde neemt.
    quarters.push({ tMs: t, heldereLuchtW: clearSkyW(geometry, location, t + 7.5 * 60_000) });
  }
  return {
    tMs: nowMs,
    zon: {
      hoogteGraden: round1(sun.elevationDeg),
      richtingGraden: Math.round(sun.azimuthDeg),
      boven: sun.elevationDeg > 0,
    },
    gevels: facades,
    panelen: planes,
    heldereLuchtW: clearSkyW(geometry, location, nowMs),
    kwartieren: quarters,
  };
}
