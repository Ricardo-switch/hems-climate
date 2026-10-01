/**
 * De configuratie voor de offline gereedschappen (replay en sweep).
 *
 * Synchroon geladen: deze scripts draaien eenmalig vanaf de commandoregel, en
 * dan is een leesbare fout bij het opstarten meer waard dan asynchrone winst.
 */

import { loadSiteConfigFileSync, resolveConfigPathSync } from '../config/load.js';
import type { SiteConfig } from '../core/model.js';
import { defaultStrategies } from '../index.js';

const loaded = loadSiteConfigFileSync(resolveConfigPathSync(), {
  knownStrategies: defaultStrategies().ids,
});

export const exampleSite = loaded.config;
export const configSource = loaded.source;

/**
 * De woning zoals ze tot besluit 60 werd gemeten: de stabilisatietimer kwam van
 * het oude systeem (`timer.pv_stabilisatie`). Voor de meetscripts van eerdere
 * besluiten, zodat de getallen in DECISIONS.md uit die scripts te halen blijven.
 */
export function withLegacyStabilisation(site: SiteConfig): SiteConfig {
  return {
    ...site,
    timers: {
      ...site.timers,
      stabilisation: { adapter: 'homeassistant', id: 'timer.pv_stabilisatie' },
    },
  };
}
