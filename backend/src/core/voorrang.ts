import type { Zone } from './model.js';
/**
 * De voorrang van een zone voor een richting (besluit 134): verwarmen of
 * koelen, met `priority` als terugval. Lager wint.
 */
export function zonePriorityFor(zone: Pick<Zone, 'priority' | 'priorityByAction'>, action: string): number {
  if (action === 'heat') return zone.priorityByAction?.heat ?? zone.priority;
  if (action === 'cool') return zone.priorityByAction?.cool ?? zone.priority;
  return zone.priority;
}
