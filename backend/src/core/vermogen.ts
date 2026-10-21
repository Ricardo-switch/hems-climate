/**
 * Wat een apparaat trekt, en of het terug te winnen is (besluit 178).
 */

import type { Actuator } from './model.js';

/** Wat een start van dit apparaat aan stroom trekt: het typeplaatje, anders de schatting (besluit 178). */
export function trekW(actuator: Pick<Actuator, 'power'>): number {
  return actuator.power.ratedW ?? actuator.power.estimatedW;
}

/**
 * Schakelt de regeling dit apparaat terug als de zon wegvalt (besluit 178)? Een
 * bijspringer, of een apparaat dat op zon mag; comfort laat de regeling aan.
 * Alleen hun verbruik is ruimte die terug te winnen is.
 */
export function terugschakelbaar(actuator: Pick<Actuator, 'role' | 'onSurplus'>): boolean {
  return actuator.role === 'assist' || actuator.onSurplus === true;
}
