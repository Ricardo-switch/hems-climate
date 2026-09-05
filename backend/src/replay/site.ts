/**
 * De configuratie voor de offline gereedschappen (replay en sweep).
 *
 * Synchroon geladen: deze scripts draaien eenmalig vanaf de commandoregel, en
 * dan is een leesbare fout bij het opstarten meer waard dan asynchrone winst.
 */

import { loadSiteConfigFileSync, resolveConfigPathSync } from '../config/load.js';
import { defaultStrategies } from '../index.js';

const loaded = loadSiteConfigFileSync(resolveConfigPathSync(), {
  knownStrategies: defaultStrategies().ids,
});

export const exampleSite = loaded.config;
export const configSource = loaded.source;
