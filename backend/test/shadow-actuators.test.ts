/**
 * Besluit 49: de schaduw meet zijn eigen geschiedenis.
 *
 * De kern van deze tests is de laatste: zonder eigen boekhouding blijft de
 * arbiter elke ronde hetzelfde commando geven en bijt de minimale draaitijd
 * nooit. Dat is geen theorie — het stond in het septemberlogboek, waar de
 * zolder-airco 430 keer schakelde met een mediane rit van 2,3 minuten tegen een
 * ingestelde ondergrens van 15.
 */

import { describe, expect, it } from 'vitest';

import { exampleSite } from './site.js';
import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import { buildSystemState } from '../src/adapters/homeassistant/mapping.js';
import { EntityStore } from '../src/adapters/homeassistant/store.js';
import { ShadowActuators } from '../src/adapters/shadow-actuators.js';
import { decide } from '../src/core/decide.js';
import type { Command } from '../src/core/decision.js';
import { defaultStrategies } from '../src/index.js';

const NOW = Date.UTC(2026, 7, 28, 12, 0, 0); // woensdagmiddag, dagmodus
const MINUTE = 60_000;

function entity(
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HaEntityState {
  // Ruim in het verleden gestempeld: dat is de schaduwmodus in één detail. Het
  // echte apparaat staat al een uur stil, dus elke draaitijdgrens is "allang om".
  const stamp = new Date(NOW - 60 * MINUTE).toISOString();
  return { entity_id, state, attributes, last_changed: stamp, last_updated: stamp };
}

/**
 * Een warme zolder, ruim overschot, en apparaten die niet bewegen.
 *
 * Dat laatste is het punt: in de schaduwmodus stuurt niemand, dus blijft
 * `climate.air_conditioning_zolder` op `off` staan wat de arbiter ook besluit.
 */
function entityState(atticC: string): HaEntityState[] {
  return [
    entity('sensor.p1_meter_power', '-2500'),
    entity('sensor.beneden_temperatuur', '21.0'),
    entity('sensor.badkamer_huidige_temperatuur', '20.0'),
    entity('sensor.hue_motion_sensor_zolder_temperatuur', atticC),
    entity('climate.beneden', 'off', { current_temperature: 21.0, hvac_action: 'off' }),
    entity('climate.thermostaat_badkamer', 'off', { temperature: 18 }),
    entity('climate.air_conditioning_woonkamer', 'off', {}),
    entity('climate.air_conditioning_zolder', 'off', {}),
    entity('sensor.air_conditioning_woonkamer_energy_current', '0'),
    entity('sensor.air_conditioning_zolder_energy_current', '0'),
    entity('person.ricardo_cornelissen', 'home'),
    entity('sun.sun', 'above_horizon'),
    entity('input_select.verwarming_modus', 'automatisch'),
    entity('input_number.temp_airco_woonkamer_koelen', '22'),
    entity('input_number.temp_airco_zolder_koelen', '22.5'),
  ];
}

/**
 * Speelt een aantal minuten af en geeft per minuut de commando's terug.
 *
 * Met `schaduw` is de boekhouding van besluit 49 actief; zonder komt de stand
 * van de apparaten uit Home Assistant, zoals het was.
 */
function loop(
  minutes: readonly string[],
  shadow: ShadowActuators | undefined,
): Command[][] {
  const store = new EntityStore();
  const strategies = defaultStrategies();
  const result: Command[][] = [];

  minutes.forEach((atticC, i) => {
    const nowMs = NOW + i * MINUTE;
    store.replaceAll(entityState(atticC));
    const state = buildSystemState(exampleSite, store, nowMs, undefined, shadow);
    const decision = decide({ config: exampleSite, state, strategies });
    shadow?.follow(decision);
    result.push([...decision.commands]);
  });

  return result;
}

function actions(commands: readonly Command[], actuatorId: string): string[] {
  return commands
    .filter((c) => c.kind === 'setAction' && c.actuatorId === actuatorId)
    .map((c) => (c.kind === 'setAction' ? c.action : ''));
}

describe('de veronderstelde stand van de apparaten', () => {
  it('onthoudt een schakeling en wanneer die viel', () => {
    const s = new ShadowActuators();
    s.apply([{ kind: 'setAction', actuatorId: 'ac-zolder', action: 'cool' }], NOW);

    expect(s.actuator('ac-zolder')).toEqual({
      action: 'cool',
      setpointC: null,
      lastChangeMs: NOW,
    });
  });

  it('schuift de laatste schakeling niet op bij hetzelfde commando nog eens', () => {
    const s = new ShadowActuators();
    s.apply([{ kind: 'setAction', actuatorId: 'ac-zolder', action: 'cool' }], NOW);
    s.apply(
      [{ kind: 'setAction', actuatorId: 'ac-zolder', action: 'cool' }],
      NOW + 5 * MINUTE,
    );

    expect(s.actuator('ac-zolder')?.lastChangeMs).toBe(NOW);
  });

  it('rekent een nieuw setpoint niet als schakeling', () => {
    // Een compressor die doorloopt op een andere doeltemperatuur is niet
    // opnieuw gestart. Home Assistant doet het net zo: `last_changed` zit op de
    // state en niet op de attributen.
    const s = new ShadowActuators();
    s.apply([{ kind: 'setAction', actuatorId: 'ac-zolder', action: 'cool' }], NOW);
    s.apply(
      [{ kind: 'setSetpoint', actuatorId: 'ac-zolder', setpointC: 20 }],
      NOW + 3 * MINUTE,
    );

    const state = s.actuator('ac-zolder');
    expect(state?.lastChangeMs).toBe(NOW);
    expect(state?.setpointC).toBe(20);
    expect(state?.action).toBe('cool');
  });

  it('verzint geen actie bij een los setpoint', () => {
    // Stond het apparaat al goed, dan komt er alleen een setpoint langs. Daar
    // valt niet uit te leiden wat het apparaat doet, dus blijft dat aan het
    // echte apparaat.
    const s = new ShadowActuators();
    s.apply([{ kind: 'setSetpoint', actuatorId: 'ac-zolder', setpointC: 21 }], NOW);

    expect(s.actuator('ac-zolder')).toEqual({
      action: null,
      setpointC: 21,
      lastChangeMs: null,
    });
  });

  it('laat los zolang de bewoner stuurt, en neemt de failsafe wel mee (besluit 49b)', () => {
    // Een echt besluit als basis, zodat de vorm klopt; alleen modus, failsafe
    // en commando's verschillen per geval.
    const store = new EntityStore();
    store.replaceAll(entityState('25.0'));
    const base = decide({
      config: exampleSite,
      state: buildSystemState(exampleSite, store, NOW),
      strategies: defaultStrategies(),
    });
    const result: Command[] = [{ kind: 'setAction', actuatorId: 'ac-zolder', action: 'off' }];

    const s = new ShadowActuators();
    s.apply([{ kind: 'setAction', actuatorId: 'ac-zolder', action: 'cool' }], NOW);

    // Handmatig: de arbiter stuurt niets, de bewoner wel. De veronderstelde
    // "koelen" mag dan niet blijven hangen — het echte apparaat is de waarheid.
    s.follow({
      ...base,
      commands: [],
      explanation: { ...base.explanation, mode: 'handmatig' },
    });
    expect(s.actuator('ac-zolder')).toBeNull();

    // Handmatig mét failsafe: die stuurt de assist-apparaten uit, ook nu.
    s.follow({
      ...base,
      atMs: NOW + MINUTE,
      commands: result,
      explanation: {
        ...base.explanation,
        mode: 'handmatig',
        failsafe: { active: true, unreliable: ['sensor.p1_meter_power'] },
      },
    });
    expect(s.actuator('ac-zolder')?.action).toBe('off');
  });

  it('laat de timercommandos aan OwnState', () => {
    const s = new ShadowActuators();
    s.apply([{ kind: 'startTimer', timerId: 'stabilisation', durationS: 300 }], NOW);

    expect(s.actuator('ac-zolder')).toBeNull();
  });
});

describe('de vertaling met een veronderstelde stand', () => {
  it('legt de eigen stand over die van Home Assistant', () => {
    const store = new EntityStore();
    store.replaceAll(entityState('25.0'));
    const s = new ShadowActuators();
    s.apply([{ kind: 'setAction', actuatorId: 'ac-zolder', action: 'cool' }], NOW);

    const state = buildSystemState(exampleSite, store, NOW + MINUTE, undefined, s);
    const a = state.actuators['ac-zolder']!;

    expect(a.action).toEqual({ ok: true, value: 'cool', atMs: NOW + MINUTE });
    expect(a.lastChangeMs).toBe(NOW);
    // Het echte apparaat staat uit, dus de vermogenssensor van 0 W meet niet
    // óns apparaat. Onbruikbaar melden laat het budget terugvallen op de
    // schatting in plaats van op een nul die er niet bij hoort.
    expect(a.powerW.ok).toBe(false);
  });

  it('houdt de gemeten waarden zodra de standen weer overeenkomen', () => {
    const store = new EntityStore();
    store.replaceAll([
      ...entityState('25.0').filter(
        (e) =>
          e.entity_id !== 'climate.air_conditioning_zolder' &&
          e.entity_id !== 'sensor.air_conditioning_zolder_energy_current',
      ),
      entity('climate.air_conditioning_zolder', 'cool', { temperature: 21 }),
      entity('sensor.air_conditioning_zolder_energy_current', '810'),
    ]);
    const s = new ShadowActuators();
    s.apply([{ kind: 'setAction', actuatorId: 'ac-zolder', action: 'cool' }], NOW);

    const a = buildSystemState(exampleSite, store, NOW + MINUTE, undefined, s)
      .actuators['ac-zolder']!;

    expect(a.powerW).toEqual({ ok: true, value: 810, atMs: NOW + MINUTE });
  });

  it('rekent het budget met wat de meter werkelijk zag (besluit 49b)', () => {
    /*
     * De veronderstelde zolder-airco draait al een halfuur; de echte staat uit,
     * en het huis voert 30 W in. Onder echte regeling zou die airco in de meter
     * zitten en het huis 780 W invoeren — dus hoort hij af te bouwen.
     *
     * Voor 49b telde het budget de 750 W van de veronderstelde airco als
     * terugwinbaar, terwijl de meter hem nooit zag: 770 W ruimte waar er 20 was.
     * Hij bleef draaien, en de schaduw schreef dat op als netstroom die de
     * arbiter zou kopen.
     */
    const store = new EntityStore();
    store.replaceAll(
      entityState('25.0').map((e) =>
        e.entity_id === 'sensor.p1_meter_power' ? entity('sensor.p1_meter_power', '30') : e,
      ),
    );
    const s = new ShadowActuators();
    s.apply([{ kind: 'setAction', actuatorId: 'ac-zolder', action: 'cool' }], NOW - 30 * MINUTE);

    const state = buildSystemState(exampleSite, store, NOW, undefined, s);
    const decision = decide({ config: exampleSite, state, strategies: defaultStrategies() });
    const budget = decision.explanation.budget;

    // Het logboek blijft de werkelijkheid: gemeten net, en wat er echt draaide.
    expect(budget.gridPowerW).toBe(30);
    expect(budget.reclaimableW).toBe(0);
    // Ruimte: 30 W invoer eraf, 50 W tolerantie erbij.
    expect(budget.availableW).toBe(20);
    // En dus bouwt hij af, naar standby.
    expect(actions(decision.commands, 'ac-zolder')).toEqual(['standby']);
  });

  it('valt terug op het echte apparaat zolang er niets gestuurd is', () => {
    const store = new EntityStore();
    store.replaceAll(entityState('25.0'));

    const plain = buildSystemState(exampleSite, store, NOW).actuators['ac-zolder']!;
    const shadowed = buildSystemState(
      exampleSite,
      store,
      NOW,
      undefined,
      new ShadowActuators(),
    ).actuators['ac-zolder']!;

    expect(shadowed).toEqual(plain);
  });
});

describe('de draaitijd bijt pas met een eigen geschiedenis', () => {
  /*
   * Twee keer dezelfde tien minuten. De zolder is de eerste vier minuten warm
   * genoeg om te koelen en zakt daarna weg, zodat de arbiter wil stoppen.
   *
   * `minRunMinutes` van ac-zolder staat op 15. Stoppen na vier minuten hoort
   * dus geblokkeerd te worden — maar alleen wanneer de arbiter weet dat hij
   * zelf vier minuten eerder gestart is.
   */
  const MINUTES = ['25.0', '25.0', '25.0', '25.0', '21.0', '21.0', '21.0', '21.0'];

  it('geeft zonder eigen stand elke ronde hetzelfde startcommando', () => {
    const rounds = loop(MINUTES, undefined);

    // Vier keer "ga koelen" voor hetzelfde apparaat, want het beweegt nooit.
    const starts = rounds.filter((r) => actions(r, 'ac-zolder').includes('cool'));
    expect(starts.length).toBe(4);
  });

  it('start één keer en laat daarna de minimale draaitijd gelden', () => {
    const shadow = new ShadowActuators();
    const rounds = loop(MINUTES, shadow);

    // Eén startcommando, niet vier.
    const starts = rounds.filter((r) => actions(r, 'ac-zolder').includes('cool'));
    expect(starts.length).toBe(1);

    // En als de vraag wegvalt, gaat hij niet meteen uit: de draaitijd van
    // 15 minuten houdt hem aan. Na acht minuten is er dus nog geen afbouw.
    const stops = rounds.filter((r) => {
      const a = actions(r, 'ac-zolder');
      return a.includes('off') || a.includes('standby');
    });
    expect(stops.length).toBe(0);
  });

  it('laat hem wél gaan zodra de draaitijd verstreken is', () => {
    // Zestien minuten koelen, daarna zakt de vraag weg. Nu is de ondergrens
    // voorbij en hoort de afbouw door te gaan.
    const long = [...Array.from({ length: 16 }, () => '25.0'), '21.0', '21.0'];
    const rounds = loop(long, new ShadowActuators());

    // De vraag valt weg op minuut 16; daar hoort de afbouw te staan. Naar
    // standby en niet uit: het apparaat blijft beschikbaar voor een korte dip
    // in de zon, en gaat pas echt uit als de stabilisatie voorbij is.
    expect(actions(rounds[16]!, 'ac-zolder')).toEqual(['standby']);
  });
});
