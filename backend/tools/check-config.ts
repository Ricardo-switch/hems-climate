/**
 * Valideert de configuratie zonder iets te starten.
 *
 *   npm run config:check
 *   npm run config:check -- ../config/sites/ander-huis.json
 */

import { ConfigError, loadSiteConfig } from '../src/config/load.js';
import { defaultStrategies } from '../src/index.js';

try {
  const { config, warnings, source } = await loadSiteConfig({
    explicitPath: process.argv[2] ?? process.env['HEMS_CONFIG'],
    siteId: process.env['HEMS_SITE'],
    knownStrategies: defaultStrategies().ids,
  });

  console.log(`In orde: ${source}`);
  console.log(`  installatie   ${config.id} (${config.timezone})`);
  console.log(`  zones         ${config.zones.map((z) => z.name).join(', ')}`);
  console.log(`  apparaten     ${config.actuators.map((a) => a.name).join(', ')}`);
  console.log(`  strategieën   ${config.enabledStrategies.join(', ')}`);
  if (warnings.length > 0) {
    console.log('');
    console.log(`Let op (${warnings.length}):`);
    for (const w of warnings) console.log(w);
  }
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.format());
    process.exit(1);
  }
  throw error;
}
