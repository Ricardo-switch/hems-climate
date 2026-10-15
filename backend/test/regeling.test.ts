/*
 * De regeling per kamer in de app (besluit 138): rollen per apparaat, de
 * eenmalige overstap uit het bestand, en een apparaat uit Home Assistant dat
 * meedoet zonder dat het in het bestand staat.
 */
import { describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import { parseSiteConfig } from '../src/config/schema.js';
import { defaultStrategies } from '../src/index.js';
import { validateLayout } from '../src/web/layout.js';
import { controleerRollen, rollenUitConfig, vermogensVan, withRegeling, type RegelKamer } from '../src/web/regeling.js';
import { exampleSite } from './site.js';

const raw = () => JSON.parse(JSON.stringify(exampleSite)) as Record<string, unknown>;
const parse = (r: Record<string, unknown>) => parseSiteConfig(r, { knownStrategies: defaultStrategies().ids });
const zonesVan = (r: Record<string, unknown>) => r['zones'] as Record<string, unknown>[];
const actuatorsVan = (r: Record<string, unknown>) => r['actuators'] as Record<string, unknown>[];

const airco: HaEntityState = {
  entity_id: 'climate.airco_slaapkamer',
  state: 'off',
  attributes: { friendly_name: 'Airco slaapkamer', hvac_modes: ['off', 'cool', 'heat', 'dry'], min_temp: 16, max_temp: 30, current_temperature: 21.4 },
  last_changed: '2026-10-15T10:00:00Z',
  last_updated: '2026-10-15T10:00:00Z',
};
const ha = (extra: Partial<Parameters<typeof withRegeling>[2]> = {}) => ({ state: (id: string) => (id === airco.entity_id ? airco : undefined), ...extra });

/** De drie kamers met een regeling, zoals de overstap ze zet. */
function overgezet(r = raw()): RegelKamer[] {
  return [
    { id: 'woonkamer', naam: 'Beneden', regelzone: 'woonkamer', rollen: rollenUitConfig(r, 'woonkamer')! },
    { id: 'badkamer', naam: 'Badkamer', regelzone: 'badkamer', rollen: rollenUitConfig(r, 'badkamer')! },
    { id: 'zolder', naam: 'Wasruimte', regelzone: 'zolder', rollen: rollenUitConfig(r, 'zolder')! },
  ];
}

describe('de regeling per kamer (besluit 138)', () => {
  it('zet het bestand eenmalig om in rollen: houdt op temperatuur en helpt op zon', () => {
    const r = raw();
    expect(rollenUitConfig(r, 'woonkamer')).toEqual({ nest: 'houdt', 'ac-woonkamer': 'zon' });
    expect(rollenUitConfig(r, 'zolder')).toEqual({ 'ac-zolder': 'zon' });
    expect(rollenUitConfig(r, null)).toBeNull();
    expect(rollenUitConfig(r, 'bestaat-niet')).toBeNull();
  });

  it('verandert niets aan de regeling als de rollen zijn zoals het bestand', () => {
    const r = raw();
    const uit = withRegeling(r, overgezet(r), ha());
    expect(uit.toegevoegd).toEqual([]);
    expect(zonesVan(uit.raw).map((z) => [z['id'], z['actuatorIds']])).toEqual(zonesVan(r).map((z) => [z['id'], z['actuatorIds']]));
    expect(parse(uit.raw).ok).toBe(true);
    // Zonder rollen: precies het bestand.
    expect(withRegeling(r, null, ha()).raw).toBe(r);
  });

  it('maakt van de airco iets dat de kamer op temperatuur houdt', () => {
    const kamers = overgezet().map((k) => (k.id === 'woonkamer' ? { ...k, rollen: { nest: 'houdt' as const, 'ac-woonkamer': 'houdt' as const } } : k));
    const uit = withRegeling(raw(), kamers, ha());
    expect(actuatorsVan(uit.raw).find((a) => a['id'] === 'ac-woonkamer')?.['role']).toBe('primary');
    const p = parse(uit.raw);
    expect(p.ok && p.config.actuators.find((a) => a.id === 'ac-woonkamer')?.role).toBe('primary');
  });

  it('haalt een kamer uit de regeling als alles alleen kijkt, en houdt het apparaat in het oog', () => {
    const kamers = overgezet().map((k) => (k.id === 'zolder' ? { ...k, rollen: { 'ac-zolder': 'kijken' as const } } : k));
    const uit = withRegeling(raw(), kamers, ha());
    expect(zonesVan(uit.raw).map((z) => z['id'])).toEqual(['woonkamer', 'badkamer']);
    expect(actuatorsVan(uit.raw).some((a) => a['id'] === 'ac-zolder')).toBe(true);
    expect(uit.toegevoegd).toContain('Wasruimte doet niet mee in de regeling');
    expect(parse(uit.raw).ok).toBe(true);
  });

  it('neemt een airco uit Home Assistant op in een nieuwe kamer, met wat Home Assistant erover zegt', () => {
    const kamers: RegelKamer[] = [...overgezet(), { id: 'slaapkamer', naam: 'Slaapkamer', regelzone: 'slaapkamer', rollen: { 'climate.airco_slaapkamer': 'zon' } }];
    const uit = withRegeling(raw(), kamers, ha({ vermogenSensor: () => 'sensor.airco_slaapkamer_vermogen' }));
    const a = actuatorsVan(uit.raw).find((x) => x['id'] === 'climate.airco_slaapkamer')!;
    expect(a).toMatchObject({
      ref: 'climate.airco_slaapkamer',
      role: 'assist',
      capabilities: { canHeat: true, canCool: true, setpointRange: [16, 30], standby: { heat: 18, cool: 25 } },
      power: { estimatedW: 1000, sensor: 'sensor.airco_slaapkamer_vermogen' },
      timing: { minRunMinutes: 15 },
    });
    const z = zonesVan(uit.raw).find((x) => x['id'] === 'slaapkamer')!;
    // Zonder eigen sensor meet hij met het apparaat zelf.
    expect(z['temperature']).toEqual({ id: 'climate.airco_slaapkamer', attribute: 'current_temperature' });
    expect(z['buffering']).toEqual({ enabled: true, bandC: 1 });
    const p = parse(uit.raw);
    expect(p.ok).toBe(true);
    expect(p.ok && p.config.zones.find((x) => x.id === 'slaapkamer')?.setpoints.dag).toEqual({ heat: 20, cool: 24 });
    expect(uit.toegevoegd).toEqual(['Airco slaapkamer doet mee in Slaapkamer', 'Slaapkamer doet mee in de regeling']);
  });

  it('slaat over wat Home Assistant niet kent, en een apparaat dat in een andere kamer staat', () => {
    const kamers: RegelKamer[] = [...overgezet(), { id: 'hal', naam: 'Hal', regelzone: 'hal', rollen: { 'climate.weg': 'houdt' } }];
    const uit = withRegeling(raw(), kamers, ha());
    expect(uit.overgeslagen).toEqual(['climate.weg: Home Assistant zegt niet wat het kan']);
    expect(zonesVan(uit.raw).some((z) => z['id'] === 'hal')).toBe(false);
    // De Nest staat volgens de indeling in de hal: dan regelt hij Beneden niet.
    const verhuisd = withRegeling(raw(), overgezet(), ha({ kamerVan: (id) => (id === 'nest' ? 'hal' : null) }));
    expect(zonesVan(verhuisd.raw).find((z) => z['id'] === 'woonkamer')?.['actuatorIds']).toEqual(['ac-woonkamer']);
    expect(parse(verhuisd.raw).ok).toBe(true);
  });

  it('leest wat een klimaatapparaat kan uit Home Assistant', () => {
    expect(vermogensVan(airco)).toEqual({ canHeat: true, canCool: true, range: [16, 30] });
    expect(vermogensVan({ ...airco, attributes: { hvac_modes: ['off', 'heat'] } })).toEqual({ canHeat: true, canCool: false, range: [7, 35] });
    expect(vermogensVan({ ...airco, attributes: { hvac_modes: ['off', 'fan_only'] } })).toBeNull();
    expect(vermogensVan(undefined)).toBeNull();
  });

  it('bewaart rollen bij de kamer, en geeft een nieuwe kamer een eigen zone', () => {
    expect(controleerRollen('x', { 'climate.a': 'zon', weg: 'houdt' }, new Set(['climate.a']))).toEqual({ ok: true, rollen: { 'climate.a': 'zon' } });
    expect(controleerRollen('x', { 'climate.a': 'baas' }, new Set(['climate.a'])).ok).toBe(false);
    const known = { deviceIds: new Set(['nest', 'climate.airco_slaapkamer']), zoneIds: new Set(['woonkamer']) };
    const kamer = (id: string, extra: Record<string, unknown> = {}) => ({ id, naam: id, etage: 'bg', zones: [], regelzone: null, haGebied: null, ...extra });
    const uit = validateLayout({ versie: 1, etages: {}, apparaten: {}, kamers: [kamer('woonkamer', { regelzone: 'woonkamer', rollen: { nest: 'houdt' } }), kamer('slaapkamer', { rollen: { 'climate.airco_slaapkamer': 'zon' } }), kamer('hal', { rollen: { 'climate.airco_slaapkamer': 'kijken' } })] }, known);
    expect(uit.ok).toBe(true);
    if (!uit.ok) return;
    expect(uit.layout.kamers.map((k) => k.regelzone)).toEqual(['woonkamer', 'slaapkamer', null]);
    // Een zone die de configuratie niet kent, mag alleen bij een kamer met rollen.
    expect(validateLayout({ versie: 1, etages: {}, apparaten: {}, kamers: [kamer('hal', { regelzone: 'hal' })] }, known).ok).toBe(false);
    expect(validateLayout({ versie: 1, etages: {}, apparaten: {}, kamers: [kamer('hal', { regelzone: 'hal', rollen: {} })] }, known).ok).toBe(true);
  });
});
