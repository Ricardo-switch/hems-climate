/**
 * De omgeving bij het starten (uit main.ts, besluit 180): een .env-bestand
 * lezen, en zeggen wat er mis is aan een token.
 */

import { existsSync } from 'node:fs';

/**
 * Laadt een .env-bestand, maar laat variabelen die al gezet zijn met rust.
 * Wie `HA_TOKEN=... npm run shadow` typt verwacht dat dát wint van het bestand.
 */
export function loadDotEnv(file: string): boolean {
  if (!existsSync(file)) return false;
  const fromShell = { ...process.env };
  try {
    process.loadEnvFile(file);
  } catch {
    return false;
  }
  for (const [key, v] of Object.entries(fromShell)) {
    if (v !== undefined) process.env[key] = v;
  }
  return true;
}

/**
 * Kijkt of het token er überhaupt uitziet als een JWT, voordat we Home
 * Assistant ermee lastigvallen. Een token raakt bij het plakken makkelijk
 * beschadigd — er verdwijnt een stuk, of er sluipt een teken in — en dan zegt
 * HA alleen "geweigerd". Dan weet je nog niet of je het verkeerde token hebt,
 * of het juiste half. Dit is met opzet een waarschuwing en geen weigering:
 * het formaat is niet iets waar wij over gaan.
 */
export function tokenComplaint(token: string): string | null {
  const segments = token.split('.');
  if (segments.length !== 3) {
    return `het bestaat uit ${segments.length} delen in plaats van 3 — er is een stuk kwijt of er staat een punt te veel`;
  }
  try {
    const [header] = segments as [string, string, string];
    const json = Buffer.from(header, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json) as { typ?: string };
    if (parsed.typ !== 'JWT') {
      return `de kop leest "${String(parsed.typ)}" in plaats van "JWT" — het token is beschadigd geraakt`;
    }
  } catch {
    return 'de kop is niet te lezen — het token is beschadigd geraakt bij het kopiëren';
  }
  return null;
}
