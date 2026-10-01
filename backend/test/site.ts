/**
 * De configuratie die de tests gebruiken.
 *
 * Bewust het echte bestand uit `config/sites` en geen kopie in code: zo toetst
 * elke test meteen dat de geleverde configuratie geldig is en het model kan
 * uitdrukken wat deze woning nodig heeft.
 */

import { loadSiteConfigFileSync, resolveConfigPathSync } from '../src/config/load.js';
import { defaultStrategies } from '../src/index.js';
import type { SiteConfig } from '../src/core/model.js';

const loaded = loadSiteConfigFileSync(resolveConfigPathSync(), {
  knownStrategies: defaultStrategies().ids,
});

export const exampleSite = loaded.config;
export const exampleWarnings = loaded.warnings;

/**
 * Dezelfde woning, maar met de stabilisatietimer in Home Assistant — zoals de
 * configuratie tot besluit 60 was. Voor de tests die bewaken dat zo'n timer
 * wint van de eigen boekhouding (besluit 39).
 */
export const withHaStabilisation: SiteConfig = {
  ...exampleSite,
  timers: {
    ...exampleSite.timers,
    stabilisation: { adapter: 'homeassistant', id: 'timer.pv_stabilisatie' },
  },
};
