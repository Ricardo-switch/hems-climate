/**
 * Tests op de datasetmeter.
 *
 * Dit is een getal dat op een dashboard komt te staan en waar iemand een besluit
 * op baseert ("kunnen we al iets zeggen?"). Dan hoort de rekensom vast te
 * liggen, en niet alleen te kloppen op de dag dat hij geschreven werd.
 *
 * De eerste versie gaf 44% op een opname van vijf zomerdagen zonder één
 * verwarmingscommando. Die vier fouten staan hieronder elk als eigen test.
 */

import { describe, expect, it } from 'vitest';

import { datasetStatus, DAILY_TARGET } from '../src/web/dataset.js';
import type { Moment } from '../src/divergence/read.js';

/** Een moment, met alleen wat de meter uitleest. */
function moment(over: Partial<Moment> & { tMs: number }): Moment {
  return {
    mode: 'dag',
    budget: { availableW: 0, allocatedW: 0, surplusW: 0, reclaimableW: 0, gridPowerW: 0 },
    zones: [],
    observed: {},
    legacy: null,
    commands: [],
    rejected: [],
    accepted: [],
    arbiterAction: {},
    failsafe: false,
    outdoorC: null,
    solarW: null,
    full: true,
    handsOff: false,
    ...over,
  };
}

async function* chunks(moments: readonly Moment[]): AsyncGenerator<Moment> {
  for (const m of moments) yield m;
}

/** Een volle dag: één moment per uur, zodat de dag voor 24/24 telt. */
function fullDay(date: string, over: Partial<Moment> = {}): Moment[] {
  return Array.from({ length: 24 }, (_, u) =>
    moment({ tMs: Date.parse(`${date}T${String(u).padStart(2, '0')}:30:00`), ...over }),
  );
}

describe('de opnameduur', () => {
  it('telt een halve dag als een halve dag', async () => {
    // Twee kalenderdagen aangeraakt, maar samen niet eens één hele dag: de
    // eerste opname begint 's middags en de tweede stopt 's ochtends.
    const moments = [
      ...[17, 18, 19, 20, 21, 22, 23].map((u) =>
        moment({ tMs: Date.parse(`2026-11-20T${u}:30:00`) }),
      ),
      ...[0, 1, 2, 3, 4].map((u) =>
        moment({ tMs: Date.parse(`2026-11-21T0${u}:30:00`) }),
      ),
    ];

    const s = (await datasetStatus(chunks(moments)))!;
    expect(s.kalenderdagenAangeraakt).toBe(2);
    // 7/24 + 5/24 = 0,5
    expect(s.dagenOpgenomen).toBeCloseTo(0.5, 1);
  });

  it('laat een gat in de opname zien', async () => {
    const moments = [...fullDay('2026-11-20'), ...fullDay('2026-11-23')];
    const s = (await datasetStatus(chunks(moments)))!;
    expect(s.gatendagen).toEqual(['2026-11-21', '2026-11-22']);
  });
});

describe('de dekking', () => {
  it('rekent één dag als half en twee dagen als heel', async () => {
    const moments = [
      // `nacht` op twee dagen, `vakantie` op één.
      ...fullDay('2026-11-20', { mode: 'nacht' }),
      ...fullDay('2026-11-21', { mode: 'nacht' }),
      moment({ tMs: Date.parse('2026-11-22T12:00:00'), mode: 'vakantie' }),
    ];

    const s = (await datasetStatus(chunks(moments)))!;
    const night = s.modi.find((m) => m.id === 'nacht');
    const holiday = s.modi.find((m) => m.id === 'vakantie');

    expect(night?.dagen).toBe(2);
    expect(night?.deel).toBe(1);
    // Eén enkele dag is waargenomen, niet aangetoond. Een vinkje voor één
    // moment van de drieëndertigduizend was precies de fout die dit voorkomt.
    expect(holiday?.dagen).toBe(1);
    expect(holiday?.deel).toBe(0.5);
  });

  it('houdt de arbiter buiten de strategieënlijst', async () => {
    const moments = fullDay('2026-11-20', {
      accepted: [
        { actuatorId: 'ac-zolder', action: 'cool', strategyId: 'pv-surplus' },
        // Geen strategie maar de arbiter die afbouwt (besluit 5). Meetellen gaf
        // een gratis punt in zowel de teller als de noemer.
        { actuatorId: 'ac-woonkamer', action: 'standby', strategyId: 'arbiter:wind-down' },
      ],
    });

    const s = (await datasetStatus(chunks(moments)))!;
    expect(s.strategieen.map((x) => x.id)).toEqual(['comfort', 'pv-surplus', 'heat-assist']);
  });

  it('neemt een later toegevoegde strategie wel op', async () => {
    const moments = fullDay('2026-11-20', {
      accepted: [{ actuatorId: 'ac-zolder', action: 'cool', strategyId: 'zon-prognose' }],
    });
    const s = (await datasetStatus(chunks(moments)))!;
    expect(s.strategieen.map((x) => x.id)).toContain('zon-prognose');
  });
});

describe('de gereedheid', () => {
  /** Een dataset die alle functies dekt, maar alleen in de herfst. */
  function autumnOnly(): Moment[] {
    const result: Moment[] = [];
    for (const day of ['2026-09-20', '2026-09-21']) {
      result.push(
        ...fullDay(day, {
          commands: [
            { kind: 'setAction', actuatorId: 'a', action: 'heat' },
            { kind: 'setAction', actuatorId: 'b', action: 'cool' },
            { kind: 'setAction', actuatorId: 'c', action: 'standby' },
            { kind: 'setAction', actuatorId: 'd', action: 'off' },
          ],
          accepted: [
            { actuatorId: 'a', action: 'heat', strategyId: 'comfort' },
            { actuatorId: 'b', action: 'cool', strategyId: 'pv-surplus' },
            { actuatorId: 'a', action: 'heat', strategyId: 'heat-assist' },
          ],
        }),
      );
    }
    return result;
  }

  it('laat volle functiedekking geen ontbrekende seizoenen goedmaken', async () => {
    const s = (await datasetStatus(chunks(autumnOnly())))!;

    // Alle richtingen en strategieën gezien op twee dagen.
    expect(s.gereedheid.dekking).toBeGreaterThan(60);
    // Maar twee herfstdagen van de veertien, en drie lege seizoenen.
    expect(s.gereedheid.tijd).toBeLessThan(10);

    // Het meetkundig gemiddelde blijft dicht bij de zwakste as. Het gewone
    // gemiddelde gaf hier ruim 35% — een getal dat suggereert dat je op een
    // derde van een bewijs zit terwijl er geen winterdag in zit.
    expect(s.gereedheid.totaal).toBeLessThan(s.gereedheid.dekking / 2);
    expect(s.gereedheid.totaal).toBeGreaterThan(s.gereedheid.tijd);
  });

  it('is nul zodra een as nul is', async () => {
    // Wel dagen, geen enkele functie afgegaan: geen commando's, geen
    // strategieën, en één modus die maar één dag voorkomt telt half.
    const moments = [
      ...fullDay('2026-11-20', { mode: 'dag' }),
      ...fullDay('2026-11-21', { mode: 'dag' }),
    ];
    const s = (await datasetStatus(chunks(moments)))!;

    expect(s.gereedheid.dekking).toBeGreaterThan(0);
    expect(s.gereedheid.totaal).toBeGreaterThan(0);

    // En andersom: zonder momenten is er niets.
    expect(await datasetStatus(chunks([]))).toBeNull();
  });

  it('haalt honderd procent alleen met alle seizoenen én alle functies', async () => {
    const moments: Moment[] = [];
    // Genoeg dagen in elk seizoen, met alles erin.
    const startPerSeason = { winter: '2026-01-', lente: '2026-04-', zomer: '2026-07-', herfst: '2026-10-' };
    for (const [season, prefix] of Object.entries(startPerSeason)) {
      const target = DAILY_TARGET[season as keyof typeof DAILY_TARGET];
      for (let d = 1; d <= target; d++) {
        for (const mode of ['dag', 'nacht', 'voorverwarmen', 'afwezig', 'vakantie', 'handmatig']) {
          moments.push(
            ...fullDay(`${prefix}${String(d).padStart(2, '0')}`, {
              mode,
              commands: (['heat', 'cool', 'standby', 'off'] as const).map((action) => ({
                kind: 'setAction',
                actuatorId: 'a',
                action,
              })),
              accepted: ['comfort', 'pv-surplus', 'heat-assist'].map((strategyId) => ({
                actuatorId: 'a',
                action: 'heat',
                strategyId,
              })),
            }),
          );
        }
      }
    }

    const s = (await datasetStatus(chunks(moments)))!;
    expect(s.gereedheid.tijd).toBe(100);
    expect(s.gereedheid.dekking).toBe(100);
    expect(s.gereedheid.totaal).toBe(100);
  });
});

describe('verwachte invoer', () => {
  it('meldt de buitentemperatuur zolang er geen enkele waarde is', async () => {
    const s = (await datasetStatus(chunks(fullDay('2026-11-20'))))!;
    expect(s.ontbrekendeInvoer.map((i) => i.id)).toContain('buitentemperatuur');
  });

  it('meldt de opbrengst van de panelen zolang die ontbreekt', async () => {
    // De maat voor instraling (besluit 47). Zonder die kolom is de derde term
    // van het thermische model niet te passen, en dat merk je pas in maart.
    const s = (await datasetStatus(chunks(fullDay('2026-11-20', { outdoorC: 4.5 }))))!;
    expect(s.ontbrekendeInvoer.map((i) => i.id)).toEqual(['opbrengst zonnepanelen']);
  });

  it('meldt ze niet meer zodra ze allebei worden vastgelegd', async () => {
    // Een vaste regel die "ontbreekt" bleef zeggen zou de meter een onwaarheid
    // laten tonen.
    const s = (await datasetStatus(
      chunks(fullDay('2026-11-20', { outdoorC: 4.5, solarW: 1800 })),
    ))!;
    expect(s.ontbrekendeInvoer).toEqual([]);
  });
});
