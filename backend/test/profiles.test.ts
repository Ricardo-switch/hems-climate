/**
 * Comfort per bewoner (besluit 147): welk profiel er geldt, met de rust van
 * tien minuten, "toch die van", en dat de eigen doelen echt doorwerken.
 */

import { describe, expect, it } from 'vitest';

import { exampleSite } from './site.js';
import { buildContext, chooseProfile } from '../src/core/context.js';
import { decide } from '../src/core/decide.js';
import { defaultStrategies } from '../src/index.js';
import type { SiteConfig } from '../src/core/model.js';
import { PROFILE_SETTLE_MS } from '../src/core/model.js';
import type { SystemState } from '../src/core/state.js';
import { unavailable, value } from '../src/core/state.js';

const NOW = Date.UTC(2026, 9, 16, 17, 0, 0);
const LANG = NOW - 3 * 3_600_000;

const config: SiteConfig = {
  ...exampleSite,
  profiles: [
    { id: 'ricardo', name: 'Ricardo', occupancyIds: ['ricardo'], zones: {} },
    { id: 'noor', name: 'Noor', occupancyIds: ['noor'], zones: { woonkamer: { setpoints: { dag: { heat: 22.5, cool: 26 } } } } },
    { id: 'matts', name: 'Matts', occupancyIds: [], zones: {} },
  ],
};

/** Een toestand met wie er thuis is, en sinds wanneer. */
function state(thuis: Record<string, { thuis: boolean; sinds: number }>): SystemState {
  const healthy = Object.fromEntries(exampleSite.criticalInputs.map((r) => [r.id, true]));
  const off = { action: value('off' as const, NOW), setpointC: unavailable<number>(), powerW: value(0, NOW), lastChangeMs: NOW - 3_600_000, producing: unavailable<boolean>('missing'), producingSinceMs: null };
  return {
    nowMs: NOW,
    modeOverride: null,
    outdoorTemperatureC: unavailable<number>('missing'),
    solarProductionW: unavailable<number>('missing'),
    occupancy: Object.fromEntries(Object.entries(thuis).map(([id, t]) => [id, value(t.thuis, t.sinds)])),
    zones: { woonkamer: { temperatureC: value(21, NOW) }, badkamer: { temperatureC: value(20, NOW) }, zolder: { temperatureC: value(22, NOW) } },
    actuators: { nest: off, badkamer: off, 'ac-woonkamer': off, 'ac-zolder': off },
    power: { gridPowerW: value(200, NOW) },
    timers: { stabilisation: { endsAtMs: null }, manualOverride: { endsAtMs: null } },
    lights: {},
    sunAboveHorizon: value(true, NOW),
    inputHealth: healthy,
  };
}

describe('welk comfort geldt (besluit 147)', () => {
  it('de eerste op de lijst die thuis is', () => {
    expect(chooseProfile(config, state({ ricardo: { thuis: true, sinds: LANG }, noor: { thuis: true, sinds: LANG } }))).toMatchObject({ id: 'ricardo', reason: 'thuis', home: ['ricardo', 'noor'] });
    expect(chooseProfile(config, state({ ricardo: { thuis: false, sinds: LANG }, noor: { thuis: true, sinds: LANG } }))).toMatchObject({ id: 'noor', name: 'Noor', reason: 'thuis' });
  });

  it('niemand thuis: de hoofdgebruiker', () => {
    expect(chooseProfile(config, state({ ricardo: { thuis: false, sinds: LANG }, noor: { thuis: false, sinds: LANG } }))).toMatchObject({ id: 'ricardo', reason: 'niemand', home: [] });
  });

  it('wacht tien minuten bij weggaan: wie net weg is, telt nog als thuis', () => {
    const net = NOW - PROFILE_SETTLE_MS / 2;
    expect(chooseProfile(config, state({ ricardo: { thuis: false, sinds: net }, noor: { thuis: true, sinds: LANG } }))?.id).toBe('ricardo');
    expect(chooseProfile(config, state({ ricardo: { thuis: false, sinds: NOW - PROFILE_SETTLE_MS - 1 }, noor: { thuis: true, sinds: LANG } }))?.id).toBe('noor');
  });

  it('wie thuiskomt, telt meteen: twee die vlak na elkaar thuiskomen, wisselen het comfort niet heen en weer', () => {
    // 1 november 2026: Noor 19:33, Ricardo 19:34. Met rust bij aankomst was het
    // eerst Ricardo (niemand thuis), om 19:43 Noor en om 19:44 weer Ricardo.
    const noorThuis = NOW - 60_000;
    expect(chooseProfile(config, state({ ricardo: { thuis: false, sinds: LANG }, noor: { thuis: true, sinds: noorThuis } }))).toMatchObject({ id: 'noor', reason: 'thuis' });
    expect(chooseProfile(config, state({ ricardo: { thuis: true, sinds: NOW }, noor: { thuis: true, sinds: noorThuis } }))).toMatchObject({ id: 'ricardo', reason: 'thuis' });
  });

  it('"toch die van Ricardo" geldt tot er iemand thuiskomt of weggaat', () => {
    const held = { ...config, profileHold: { id: 'ricardo', home: ['noor'] } };
    const zo = { ricardo: { thuis: false, sinds: LANG }, noor: { thuis: true, sinds: LANG } };
    expect(chooseProfile(held, state(zo))).toMatchObject({ id: 'ricardo', reason: 'gekozen' });
    expect(chooseProfile(held, state({ ...zo, noor: { thuis: false, sinds: LANG } }))).toMatchObject({ id: 'ricardo', reason: 'niemand' });
    expect(chooseProfile(held, state({ ...zo, ricardo: { thuis: true, sinds: LANG } }))).toMatchObject({ id: 'ricardo', reason: 'thuis' });
  });

  it('zonder profielen: zoals altijd, en niets erbij in de uitleg', () => {
    const s = state({ ricardo: { thuis: true, sinds: LANG } });
    expect(chooseProfile(exampleSite, s)).toBeNull();
    expect(decide({ config: exampleSite, state: s, strategies: defaultStrategies() }).explanation.profile).toBeUndefined();
  });

  it('de eigen doelen werken door, en de uitleg zegt welk comfort gold', () => {
    const noorThuis = state({ ricardo: { thuis: false, sinds: LANG }, noor: { thuis: true, sinds: LANG } });
    const ricardoThuis = state({ ricardo: { thuis: true, sinds: LANG }, noor: { thuis: true, sinds: LANG } });
    const woon = (s: SystemState) => buildContext(config, s).zones.find((z) => z.zone.id === 'woonkamer')!;
    expect(woon(noorThuis).heatTargetC).toBe(22.5);
    expect(woon(ricardoThuis).heatTargetC).toBe(exampleSite.zones.find((z) => z.id === 'woonkamer')!.setpoints.dag.heat ?? null);
    // Een zone die het profiel niet noemt, volgt de zone zelf.
    const bad = buildContext(config, noorThuis).zones.find((z) => z.zone.id === 'badkamer')!;
    expect(bad.heatTargetC).toBe(exampleSite.zones.find((z) => z.id === 'badkamer')!.setpoints.dag.heat ?? null);
    expect(decide({ config, state: noorThuis, strategies: defaultStrategies() }).explanation.profile).toMatchObject({ id: 'noor', reason: 'thuis' });
  });
});
