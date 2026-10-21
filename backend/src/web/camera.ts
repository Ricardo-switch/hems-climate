/**
 * De camera's bekijken in de app (besluit 106).
 *
 * Alleen lezen: de dienst vraagt bij Home Assistant het beeld op
 * (`/api/camera_proxy_stream` voor live, `/api/camera_proxy` voor één plaatje)
 * en geeft het door. Er gaat niets naar een camera toe. Kijken vraagt de inlog
 * van besluit 99, want het beeld van de oprit of de voordeur hoort niet open op
 * het thuisnetwerk te staan, ook al is de rest van de weergave dat wel.
 *
 * Per camera één beeld: bij voorkeur de vloeiende stream (Reolink noemt die
 * `sub`), die is licht genoeg voor de tablet. Een tweede integratie die
 * dezelfde camera nog eens aanbiedt (de Synology-NAS) telt niet dubbel.
 */

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { HaDevice, HaRegistryEntity } from '../adapters/homeassistant/discovery.js';

export interface FoundCamera {
  /** De camera-entiteit, voor de dienst; de pagina krijgt hem als id van het apparaat. */
  readonly entityId: string;
  readonly naam: string;
  readonly deviceId: string | null;
}

/** Hoe goed een stream past op de tablet: vloeiend eerst, dan het gewone beeld. */
const VOORKEUR: Readonly<Record<string, number>> = { sub: 0, main: 1 };
/** Wat geen camera is om naar te kijken: het buienradarplaatje. */
export const GEEN_BEELD: ReadonlySet<string> = new Set(['buienradar']);

export function findCameras(entities: readonly HaRegistryEntity[], devices: readonly HaDevice[], states: ReadonlyMap<string, HaEntityState>): FoundCamera[] {
  const deviceName = new Map(devices.map((d) => [d.id, (d.name_by_user ?? d.name ?? '').trim()]));
  const kandidaten = entities
    .filter((e) => e.entity_id.startsWith('camera.') && e.disabled_by == null && !GEEN_BEELD.has(e.platform ?? ''))
    .map((e) => {
      const apparaat = e.device_id ? deviceName.get(e.device_id) ?? '' : '';
      const naam = apparaat || String(states.get(e.entity_id)?.attributes['friendly_name'] ?? e.entity_id);
      return { e, naam, rang: VOORKEUR[e.translation_key ?? ''] ?? 2 };
    })
    .sort((a, b) => a.rang - b.rang);
  // Eén per apparaat, en één per naam: dezelfde camera via een tweede integratie valt weg.
  const gezien = new Set<string>();
  const uit: FoundCamera[] = [];
  for (const k of kandidaten) {
    const sleutels = [k.e.device_id ? `dev:${k.e.device_id}` : `ent:${k.e.entity_id}`, `naam:${k.naam.toLowerCase().replace(/[^a-z0-9]+/g, '')}`];
    if (sleutels.some((s) => gezien.has(s))) continue;
    for (const s of sleutels) gezien.add(s);
    uit.push({ entityId: k.e.entity_id, naam: k.naam, deviceId: k.e.device_id ?? null });
  }
  return uit.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
}

/**
 * De http(s)-basis van Home Assistant, uit wat er voor de websocket is
 * ingevuld: `ws://ha:8123/api/websocket` wordt `http://ha:8123`, en de
 * Supervisor-vorm `ws://supervisor/core/websocket` wordt `http://supervisor/core`.
 */
export function httpBase(url: string): string {
  const u = new URL(url);
  u.protocol = u.protocol === 'wss:' || u.protocol === 'https:' ? 'https:' : 'http:';
  u.pathname = u.pathname.replace(/\/+$/, '').replace(/\/api\/websocket$/, '').replace(/\/websocket$/, '');
  u.search = '';
  u.hash = '';
  return u.toString().replace(/\/+$/, '');
}

/** Een camera-entiteit zoals Home Assistant ze schrijft; alles anders komt de proxy niet door. */
export const CAMERA_ID = /^camera\.[a-z0-9_]+$/;
