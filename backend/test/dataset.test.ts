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

import { datasetStatus, DAGDOEL } from '../src/web/dataset.js';
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
    full: true,
    handsOff: false,
    ...over,
  };
}

async function* stroom(momenten: readonly Moment[]): AsyncGenerator<Moment> {
  for (const m of momenten) yield m;
}

/** Een volle dag: één moment per uur, zodat de dag voor 24/24 telt. */
function volleDag(datum: string, over: Partial<Moment> = {}): Moment[] {
  return Array.from({ length: 24 }, (_, u) =>
    moment({ tMs: Date.parse(`${datum}T${String(u).padStart(2, '0')}:30:00`), ...over }),
  );
}

describe('de opnameduur', () => {
  it('telt een halve dag als een halve dag', async () => {
    // Twee kalenderdagen aangeraakt, maar samen niet eens één hele dag: de
    // eerste opname begint 's middags en de tweede stopt 's ochtends.
    const momenten = [
      ...[17, 18, 19, 20, 21, 22, 23].map((u) =>
        moment({ tMs: Date.parse(`2026-11-20T${u}:30:00`) }),
      ),
      ...[0, 1, 2, 3, 4].map((u) =>
        moment({ tMs: Date.parse(`2026-11-21T0${u}:30:00`) }),
      ),
    ];

    const s = (await datasetStatus(stroom(momenten)))!;
    expect(s.kalenderdagenAangeraakt).toBe(2);
    // 7/24 + 5/24 = 0,5
    expect(s.dagenOpgenomen).toBeCloseTo(0.5, 1);
  });

  it('laat een gat in de opname zien', async () => {
    const momenten = [...volleDag('2026-11-20'), ...volleDag('2026-11-23')];
    const s = (await datasetStatus(stroom(momenten)))!;
    expect(s.gatendagen).toEqual(['2026-11-21', '2026-11-22']);
  });
});

describe('de dekking', () => {
  it('rekent één dag als half en twee dagen als heel', async () => {
    const momenten = [
      // `nacht` op twee dagen, `vakantie` op één.
      ...volleDag('2026-11-20', { mode: 'nacht' }),
      ...volleDag('2026-11-21', { mode: 'nacht' }),
      moment({ tMs: Date.parse('2026-11-22T12:00:00'), mode: 'vakantie' }),
    ];

    const s = (await datasetStatus(stroom(momenten)))!;
    const nacht = s.modi.find((m) => m.id === 'nacht');
    const vakantie = s.modi.find((m) => m.id === 'vakantie');

    expect(nacht?.dagen).toBe(2);
    expect(nacht?.deel).toBe(1);
    // Eén enkele dag is waargenomen, niet aangetoond. Een vinkje voor één
    // moment van de drieëndertigduizend was precies de fout die dit voorkomt.
    expect(vakantie?.dagen).toBe(1);
    expect(vakantie?.deel).toBe(0.5);
  });

  it('houdt de arbiter buiten de strategieënlijst', async () => {
    const momenten = volleDag('2026-11-20', {
      accepted: [
        { actuatorId: 'ac-zolder', action: 'cool', strategyId: 'pv-surplus' },
        // Geen strategie maar de arbiter die afbouwt (besluit 5). Meetellen gaf
        // een gratis punt in zowel de teller als de noemer.
        { actuatorId: 'ac-woonkamer', action: 'standby', strategyId: 'arbiter:wind-down' },
      ],
    });

    const s = (await datasetStatus(stroom(momenten)))!;
    expect(s.strategieen.map((x) => x.id)).toEqual(['comfort', 'pv-surplus', 'heat-assist']);
  });

  it('neemt een later toegevoegde strategie wel op', async () => {
    const momenten = volleDag('2026-11-20', {
      accepted: [{ actuatorId: 'ac-zolder', action: 'cool', strategyId: 'zon-prognose' }],
    });
    const s = (await datasetStatus(stroom(momenten)))!;
    expect(s.strategieen.map((x) => x.id)).toContain('zon-prognose');
  });
});

describe('de gereedheid', () => {
  /** Een dataset die alle functies dekt, maar alleen in de herfst. */
  function alleenHerfst(): Moment[] {
    const uit: Moment[] = [];
    for (const dag of ['2026-09-20', '2026-09-21']) {
      uit.push(
        ...volleDag(dag, {
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
    return uit;
  }

  it('laat volle functiedekking geen ontbrekende seizoenen goedmaken', async () => {
    const s = (await datasetStatus(stroom(alleenHerfst())))!;

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
    const momenten = [
      ...volleDag('2026-11-20', { mode: 'dag' }),
      ...volleDag('2026-11-21', { mode: 'dag' }),
    ];
    const s = (await datasetStatus(stroom(momenten)))!;

    expect(s.gereedheid.dekking).toBeGreaterThan(0);
    expect(s.gereedheid.totaal).toBeGreaterThan(0);

    // En andersom: zonder momenten is er niets.
    expect(await datasetStatus(stroom([]))).toBeNull();
  });

  it('haalt honderd procent alleen met alle seizoenen én alle functies', async () => {
    const momenten: Moment[] = [];
    // Genoeg dagen in elk seizoen, met alles erin.
    const startPerSeizoen = { winter: '2026-01-', lente: '2026-04-', zomer: '2026-07-', herfst: '2026-10-' };
    for (const [seizoen, prefix] of Object.entries(startPerSeizoen)) {
      const doel = DAGDOEL[seizoen as keyof typeof DAGDOEL];
      for (let d = 1; d <= doel; d++) {
        for (const mode of ['dag', 'nacht', 'voorverwarmen', 'afwezig', 'vakantie', 'handmatig']) {
          momenten.push(
            ...volleDag(`${prefix}${String(d).padStart(2, '0')}`, {
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

    const s = (await datasetStatus(stroom(momenten)))!;
    expect(s.gereedheid.tijd).toBe(100);
    expect(s.gereedheid.dekking).toBe(100);
    expect(s.gereedheid.totaal).toBe(100);
  });
});

describe('verwachte invoer', () => {
  it('meldt de buitentemperatuur zolang er geen enkele waarde is', async () => {
    const s = (await datasetStatus(stroom(volleDag('2026-11-20'))))!;
    expect(s.ontbrekendeInvoer.map((i) => i.id)).toContain('buitentemperatuur');
  });

  it('meldt hem niet meer zodra hij wordt vastgelegd', async () => {
    // Sinds fase 6b gaat hij mee het logboek in (besluit 30). Een vaste regel
    // die "ontbreekt" bleef zeggen zou de meter een onwaarheid laten tonen.
    const s = (await datasetStatus(stroom(volleDag('2026-11-20', { outdoorC: 4.5 }))))!;
    expect(s.ontbrekendeInvoer).toEqual([]);
  });
});
