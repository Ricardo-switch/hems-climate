/**
 * De configuratie die de tests gebruiken.
 *
 * Een bestand en geen kopie in code: zo toetst elke test meteen dat de
 * configuratie geldig is en het model kan uitdrukken wat een woning nodig
 * heeft. Het is een naamloos voorbeeld naar het eerste huis; de configuratie
 * van een echte woning staat niet in de openbare repository (besluit 152).
 */

import { join } from 'node:path';
import { loadSiteConfigFileSync } from '../src/config/load.js';
import { defaultStrategies } from '../src/index.js';
import type { SiteConfig } from '../src/core/model.js';

/** Waar het voorbeeldhuis staat, voor tests die het ruwe bestand willen. */
export const exampleSitePath = join(import.meta.dirname, 'fixtures', 'voorbeeld-huis.json');

const loaded = loadSiteConfigFileSync(exampleSitePath, {
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
