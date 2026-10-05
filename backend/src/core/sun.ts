/**
 * De stand van de zon, en hoe hij op een vlak valt (besluiten 90 en 93).
 *
 * Zuiver: een tijdstip en een ligging erin, hoeken eruit. Geen klok, geen
 * Home Assistant. Dezelfde berekening dient de gevels (valt de zon nu op de
 * voorgevel?) en de panelen (wat leveren ze bij een heldere lucht?).
 *
 * De stand van de zon volgt de benadering van NOAA: binnen een halve graad,
 * ruim genoeg voor een gevel of een dakvlak. Richtingen zijn kompasgraden: 0 is
 * noord, 90 oost, 180 zuid, 270 west.
 */

export interface SunPosition {
  /** Hoogte boven de horizon in graden; negatief als hij onder is. */
  readonly elevationDeg: number;
  /** Kompasrichting van de zon in graden. */
  readonly azimuthDeg: number;
}

/** Een vlak: een gevel (helling 90) of een dakvlak met panelen. */
export interface Plane {
  /** De kompasrichting waar het vlak naartoe kijkt. */
  readonly azimuthDeg: number;
  /** 0 is plat, 90 staat rechtop. */
  readonly tiltDeg: number;
}

const RAD = Math.PI / 180;

export function sunPosition(ms: number, latDeg: number, lonDeg: number): SunPosition {
  const d = new Date(ms);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((ms - start) / 86_400_000) + 1;
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;

  // De fractie van het jaar, in radialen.
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  const eqTimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);

  const trueSolarMin = hour * 60 + eqTimeMin + 4 * lonDeg;
  const hourAngle = (trueSolarMin / 4 - 180) * RAD;
  const lat = latDeg * RAD;

  const cosZenith =
    Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
  const azimuth =
    Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat),
    ) /
      RAD +
    180;

  return { elevationDeg: 90 - zenith / RAD, azimuthDeg: ((azimuth % 360) + 360) % 360 };
}

/**
 * De cosinus van de hoek tussen de zon en de loodlijn op het vlak. Eén is
 * recht erop, nul is langs het vlak, negatief is erachter.
 */
export function cosIncidence(sun: SunPosition, plane: Plane): number {
  const e = sun.elevationDeg * RAD;
  const b = plane.tiltDeg * RAD;
  return (
    Math.sin(e) * Math.cos(b) +
    Math.cos(e) * Math.sin(b) * Math.cos((sun.azimuthDeg - plane.azimuthDeg) * RAD)
  );
}

/** Staat de zon op dit vlak: boven de horizon en aan de goede kant. */
export function sunOnPlane(sun: SunPosition, plane: Plane): boolean {
  return sun.elevationDeg > 0 && cosIncidence(sun, plane) > 0;
}

/** De hoek tussen de zon en de loodlijn op het vlak, in graden, of null als hij er niet op staat. */
export function incidenceDeg(sun: SunPosition, plane: Plane): number | null {
  if (!sunOnPlane(sun, plane)) return null;
  return Math.acos(Math.min(1, cosIncidence(sun, plane))) / RAD;
}

/**
 * De instraling op een vlak bij een heldere lucht, in W/m².
 *
 * Grof en bewust eenvoudig: de directe zon volgens Meinel (hoe dikker de lucht
 * waar hij door moet, hoe zwakker) plus een vaste fractie verstrooid licht. Een
 * eerste maat, geen voorspelling: het huis leert later hoeveel zijn panelen
 * werkelijk halen (besluit 93), en het weerbericht zegt hoe helder het wordt
 * (stap E).
 */
export function clearSkyOnPlaneWm2(sun: SunPosition, plane: Plane): number {
  if (sun.elevationDeg <= 0) return 0;
  const sinE = Math.sin(sun.elevationDeg * RAD);
  const airMass = 1 / Math.max(sinE, 0.05);
  const direct = 1361 * 0.7 ** (airMass ** 0.678);
  const beam = Math.max(0, cosIncidence(sun, plane)) * direct;
  // Verstrooid licht uit de hemel die het vlak ziet: plat ziet alles, rechtop de helft.
  const diffuse = 0.1 * direct * sinE * ((1 + Math.cos(plane.tiltDeg * RAD)) / 2);
  return beam + diffuse;
}
