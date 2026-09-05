/**
 * De configuratie voor deze installatie.
 *
 * Er staat hier geen configuratie meer in code — alleen de weg ernaartoe.
 * De waarden leven in `config/sites/*.json`, worden bij het starten gevalideerd,
 * en komen straks uit een database of een onboarding-wizard zonder dat hier iets
 * verandert.
 */

export {
  ConfigError,
  SITES_DIR,
  loadSiteConfig,
  loadSiteConfigFile,
  loadSiteConfigFileSync,
  parseOrThrow,
  resolveConfigPath,
} from './load.js';

export {
  SCHEMA_VERSION,
  formatProblems,
  parseSiteConfig,
  type ConfigProblem,
  type ConfigResult,
} from './schema.js';
