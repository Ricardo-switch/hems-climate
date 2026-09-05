/**
 * De configuratie die de tests gebruiken.
 *
 * Bewust het echte bestand uit `config/sites` en geen kopie in code: zo toetst
 * elke test meteen dat de geleverde configuratie geldig is en het model kan
 * uitdrukken wat deze woning nodig heeft.
 */

import { loadSiteConfigFileSync, resolveConfigPathSync } from '../src/config/load.js';
import { defaultStrategies } from '../src/index.js';

const loaded = loadSiteConfigFileSync(resolveConfigPathSync(), {
  knownStrategies: defaultStrategies().ids,
});

export const exampleSite = loaded.config;
export const exampleWarnings = loaded.warnings;
