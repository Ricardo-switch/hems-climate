/**
 * De ene toegangspoort tot Home Assistant-entiteiten.
 *
 * Zowel de live-adapter als de replay-harness leveren deze interface. Daardoor
 * draait de vertaling van HA naar ons toestandsmodel op precies één plek: wat
 * de schaduwmodus straks live beslist, beslist de harness op historie ook. Twee
 * losse implementaties van dezelfde vertaling zouden vroeg of laat uit elkaar
 * lopen, en dat is de bugklasse waar dit hele project vandaan komt.
 */

export interface EntitySource {
  /** De ruwe state, of null bij unavailable, unknown of onbekend. */
  state(entityId: string): string | null;
  /** De state als getal, of null wanneer die niet te lezen valt. */
  number(entityId: string): number | null;
  /** De state als ja/nee — `on`, `home` en `above_horizon` gelden als waar. */
  bool(entityId: string): boolean | null;
  attr(entityId: string, key: string): string | number | null;
  attrNumber(entityId: string, key: string): number | null;
  /** Wanneer de state voor het laatst wisselde, in epoch-ms. */
  changedAt(entityId: string): number | null;
  /** De laatste `hvac_action`, of null als het apparaat die niet rapporteert. */
  hvacAction(entityId: string): string | null;
  /** Sinds wanneer die `hvac_action` onafgebroken geldt, in epoch-ms. */
  hvacActionSince(entityId: string): number | null;
}
