/**
 * De assistent die uitlegt (ONTWERP §7, fase 1).
 *
 * Twee soorten tests. Voorbeelden: in deze situatie hoort dit antwoord. En een
 * regel voor élke toestand (besluit 56 en 88): geen getal in een antwoord dat
 * niet als feit met zijn bron is vastgelegd, geen entity-ID en geen interne
 * code (besluit 45).
 */

import { describe, expect, it } from 'vitest';

import { exampleSite } from './site.js';
import { dice, entityState, generator, NOW } from './random-state.js';
import { decide } from '../src/core/decide.js';
import type { Explanation } from '../src/core/decision.js';
import { value } from '../src/core/state.js';
import { defaultStrategies } from '../src/index.js';
import { ask, findZone, LANGS, parseQuestion, residentRooms, roomStatus } from '../src/web/assistant.js';
import { inSentence } from '../src/web/assistant.js';
import type { Answer, DecisionView, Question } from '../src/web/assistant.js';
import type { TodayReport } from '../src/web/today.js';
import { decisionWords, residentFlows, residentView } from '../src/web/resident.js';

const config = exampleSite;
const zolder = config.zones.find((z) => z.id === 'zolder')!;
// 13:00 in Amsterdam, zomertijd.
const AT = Date.parse('2026-10-05T11:00:00Z');

function explanation(over: Partial<Explanation> = {}): Explanation {
  return {
    mode: 'dag',
    modeSource: 'schedule',
    occupied: true,
    budget: { availableW: 1500, allocatedW: 0, surplusW: 900, reclaimableW: 600, gridPowerW: -900 },
    failsafe: { active: false, unreliable: [] },
    perZone: [
      { zoneId: 'woonkamer', temperatureC: 21.4, humidityPct: 55, targetC: 21, demand: 'none', reason: 'zone_satisfied' },
      { zoneId: 'badkamer', temperatureC: 21.5, humidityPct: null, targetC: null, demand: 'none', reason: 'zone_satisfied' },
      { zoneId: 'zolder', temperatureC: 24.3, humidityPct: null, targetC: 23, demand: 'cool', reason: 'zone_above_setpoint' },
    ],
    outdoorTemperatureC: 17,
    solarProductionW: 1840,
    ...over,
  };
}

function view(over: Partial<DecisionView> = {}): DecisionView {
  return {
    atMs: AT,
    explanation: explanation(),
    commands: [],
    accepted: [],
    rejected: [],
    observed: { nest: 'heat@20', badkamer: 'off@18', 'ac-woonkamer': 'off', 'ac-zolder': 'cool@22' },
    ...over,
  };
}

const coolOnSun = {
  strategyId: 'pv-surplus',
  zoneId: 'zolder',
  actuatorId: 'ac-zolder',
  action: 'cool' as const,
  setpointC: 23,
  priority: 1,
  budgetW: 600,
  reason: 'surplus_available' as const,
};

function askNl(question: Question, snapshot: DecisionView | null = view(), extra: { shadow?: boolean; nowMs?: number; today?: TodayReport | null } = {}): Answer {
  return ask(question, {
    config,
    snapshot,
    today: extra.today ?? null,
    nowMs: extra.nowMs ?? AT,
    shadow: extra.shadow ?? true,
    lang: 'nl',
  });
}

describe('vragen lezen', () => {
  it('kent de vaste vragen en de taal', () => {
    expect(parseQuestion(new URLSearchParams('v=nu'))).toEqual({ ok: true, lang: 'nl', question: { kind: 'nu' } });
    expect(parseQuestion(new URLSearchParams('v=waarom&kamer=Zolder&taal=en'))).toEqual({
      ok: true,
      lang: 'en',
      question: { kind: 'waarom', kamer: 'Zolder' },
    });
    expect(parseQuestion(new URLSearchParams('v=doe&kamer=zolder&wens=koelen&temperatuur=21,5'))).toEqual({
      ok: true,
      lang: 'nl',
      question: { kind: 'doe', kamer: 'zolder', wens: 'koelen', temperatuurC: 21.5 },
    });
  });

  it('weigert wat het niet kent, met een reden', () => {
    for (const q of ['', 'v=hoi', 'v=waarom', 'v=doe&kamer=zolder', 'v=doe&kamer=zolder&wens=dansen', 'v=doe&kamer=zolder&wens=koelen&temperatuur=warm', 'v=nu&taal=fr']) {
      const p = parseQuestion(new URLSearchParams(q));
      expect(p.ok, q).toBe(false);
    }
  });

  it('vindt de kamer bij naam, id of een deel ervan', () => {
    expect(findZone(config, 'zolder')?.id).toBe('zolder');
    expect(findZone(config, 'De Woonkamer')?.id).toBe('woonkamer');
    expect(findZone(config, 'bad')?.id).toBe('badkamer');
    expect(findZone(config, 'kelder')).toBeUndefined();
  });
});

describe('waarom', () => {
  it('zegt dat hij zou koelen op zon, met de getallen uit het besluit', () => {
    const a = askNl({ kind: 'waarom', kamer: 'zolder' }, view({ accepted: [coolOnSun] }));
    expect(a.kamer).toBe('zolder');
    expect(a.antwoord).toContain('Ik zou de zolder nu laten koelen op zon: het is er 24,3°, het doel is 23°.');
    expect(a.antwoord).toContain('De panelen leveren 1,8 kW.');
    // Tijdens de schaduw ook wat het apparaat echt doet, zonder te zeggen wie het zo zette (88).
    expect(a.antwoord).toContain('In werkelijkheid staat de airco zolder op koelen naar 22°.');
    expect(a.antwoord).toContain('Ik kijk nog alleen mee');
  });

  it('zegt "staat uit" voor een apparaat dat uit staat', () => {
    const a = askNl({ kind: 'waarom', kamer: 'woonkamer' });
    expect(a.antwoord).toContain('In werkelijkheid staat de Nest (beneden) op verwarmen naar 20°, en staat de airco woonkamer uit.');
  });

  it('zegt "koelt" in plaats van "zou" zodra hij echt schakelt', () => {
    const a = askNl({ kind: 'waarom', kamer: 'zolder' }, view({ accepted: [coolOnSun] }), { shadow: false });
    expect(a.antwoord).toContain('De zolder koelt op zon');
    expect(a.antwoord).not.toContain('In werkelijkheid');
  });

  it('zegt waarom iets wacht, en wat er van het net komt', () => {
    const a = askNl(
      { kind: 'waarom', kamer: 'zolder' },
      view({
        explanation: explanation({ budget: { availableW: 300, allocatedW: 0, surplusW: 300, reclaimableW: 0, gridPowerW: -300 } }),
        rejected: [{ intent: coolOnSun, blockedBy: 'start_threshold_not_met' }],
      }),
    );
    expect(a.antwoord).toContain(
      'De zolder wil koelen (het is er 24,3°, het doel is 23°), maar dat kan nu niet, omdat er net te weinig zon over is om te starten.',
    );
    expect(a.antwoord).toContain('Er gaat nu 300 W terug naar het net.');
  });

  it('zegt bij een kamer zonder vraag tussen welke doelen hij zit', () => {
    const e = explanation();
    const perZone = e.perZone.map((z) =>
      z.zoneId === 'zolder'
        ? { ...z, temperatureC: 22.3, targetC: 20, heatTargetC: 20, coolTargetC: 22.5, demand: 'none' as const, reason: 'zone_satisfied' as const }
        : z,
    );
    const a = askNl({ kind: 'waarom', kamer: 'zolder' }, view({ explanation: { ...e, perZone } }));
    expect(a.antwoord).toContain(
      'De zolder heeft niets nodig: het is er 22,3°, tussen het doel voor verwarmen (20°) en dat voor koelen (22,5°).',
    );
  });

  it('valt bij een ouder besluit zonder beide doelen terug op het ene doel', () => {
    const a = askNl({ kind: 'waarom', kamer: 'woonkamer' });
    expect(a.antwoord).toContain('De woonkamer heeft niets nodig: het is er 21,4°, en het doel voor verwarmen is 21°.');
  });

  it('zet het werkwoord achteraan na "omdat"', () => {
    const a = askNl({ kind: 'waarom', kamer: 'zolder' }, view({ rejected: [{ intent: coolOnSun, blockedBy: 'min_rest_not_elapsed' }] }));
    expect(a.antwoord).toContain('maar dat kan nu niet, omdat het apparaat eerst even moet rusten.');
  });

  it('laat een apparaat dat de bewoner overnam met rust, en zegt tot wanneer', () => {
    const a = askNl(
      { kind: 'waarom', kamer: 'zolder' },
      view({ explanation: explanation({ overrides: [{ actuatorId: 'ac-zolder', sinceMs: AT - 600_000, untilMs: Date.parse('2026-10-05T13:00:00Z') }] }) }),
    );
    expect(a.antwoord).toContain('Je hebt de airco zolder zelf overgenomen, tot 15:00. Ik laat hem met rust.');
  });

  it('noemt bij een storing wat er onbetrouwbaar is, zonder entity-ID', () => {
    const a = askNl(
      { kind: 'waarom', kamer: 'woonkamer' },
      view({ explanation: explanation({ failsafe: { active: true, unreliable: [config.zones[0]!.temperature.id] } }) }),
    );
    expect(a.antwoord).toContain('Ik heb alles veilig gezet, want de temperatuur in de woonkamer is niet betrouwbaar.');
  });

  it('kent een kamer niet, en zegt welke wel', () => {
    const a = askNl({ kind: 'waarom', kamer: 'kelder' });
    expect(a.kamer).toBeNull();
    expect(a.antwoord).toBe('De kamer "kelder" ken ik niet. Ik ken: woonkamer, badkamer, zolder.');
  });

  it('zegt eerlijk dat er nog geen besluit is', () => {
    expect(askNl({ kind: 'waarom', kamer: 'zolder' }, null).antwoord).toContain('nog geen besluit');
  });
});

describe('nu', () => {
  it('noemt het net één keer, ook als meer kamers op zon wachten', () => {
    const wait = { ...coolOnSun, zoneId: 'woonkamer', actuatorId: 'ac-woonkamer' };
    const e = explanation({
      budget: { availableW: 100, allocatedW: 0, surplusW: 0, reclaimableW: 0, gridPowerW: 2300 },
      perZone: [
        { zoneId: 'woonkamer', temperatureC: 22.8, humidityPct: 55, targetC: 22, demand: 'cool', reason: 'zone_above_setpoint' },
        { zoneId: 'badkamer', temperatureC: 21.5, humidityPct: null, targetC: null, demand: 'none', reason: 'zone_satisfied' },
        { zoneId: 'zolder', temperatureC: 22.8, humidityPct: null, targetC: 22.5, demand: 'cool', reason: 'zone_above_setpoint' },
      ],
    });
    const a = askNl(
      { kind: 'nu' },
      view({
        explanation: e,
        rejected: [
          { intent: wait, blockedBy: 'insufficient_power_budget' },
          { intent: coolOnSun, blockedBy: 'insufficient_power_budget' },
        ],
      }),
    );
    expect(a.antwoord.split('van het net').length - 1).toBe(1);
  });


  it('noemt alleen de kamers waar iets speelt, en de stroom', () => {
    const a = askNl({ kind: 'nu' }, view({ accepted: [coolOnSun] }));
    expect(a.antwoord).toBe(
      'Ik zou de zolder nu laten koelen op zon: het is er 24,3°, het doel is 23°. De panelen leveren 1,8 kW. ' +
        'Er gaat nu 900 W terug naar het net. Ik kijk nog alleen mee en schakel zelf niets.',
    );
  });

  it('zegt dat de regeling niets doet in handmatig', () => {
    const a = askNl({ kind: 'nu' }, view({ explanation: explanation({ mode: 'handmatig', modeSource: 'override' }) }));
    expect(a.antwoord).toContain('De regeling staat op handmatig, dus ik doe niets.');
  });
});

describe('straks', () => {
  it('noemt de volgende stand van de klok', () => {
    const a = askNl({ kind: 'straks' }, view(), { nowMs: Date.parse('2026-10-05T19:30:00Z') });
    expect(a.antwoord).toContain('Om 22:00 ga ik naar de nachtstand.');
    expect(a.antwoord).toContain('Brandt er dan nog licht');
    expect(a.antwoord).toContain('een weersverwachting heb ik nog niet');
  });

  it('gaat na middernacht door naar de volgende ochtend', () => {
    const a = askNl({ kind: 'straks' }, view(), { nowMs: Date.parse('2026-10-05T21:30:00Z') });
    expect(a.antwoord).toContain('Om 06:00 ga ik naar voorverwarmen.');
  });

  it('zegt dat een stand die met de hand gezet is niet vanzelf verandert', () => {
    const a = askNl({ kind: 'straks' }, view({ explanation: explanation({ mode: 'vakantie', modeSource: 'override' }) }));
    expect(a.antwoord).toContain('De stand is met de hand op vakantie gezet');
  });
});

describe('zon', () => {
  const today: TodayReport = {
    vanMs: AT - 13 * 3_600_000,
    totMs: AT,
    kwartieren: [
      { tMs: Date.parse('2026-10-05T10:00:00Z'), zonW: 1500, netW: -600 },
      { tMs: Date.parse('2026-10-05T10:15:00Z'), zonW: 1944, netW: -900 },
      { tMs: Date.parse('2026-10-05T10:30:00Z'), zonW: null, netW: null },
    ],
    zonWh: 5320,
    netAfWh: 1210,
    netTerugWh: 2860,
    apparaten: [],
    besluiten: [],
  };

  it('vat de dag samen uit het dagoverzicht', () => {
    const a = askNl({ kind: 'zon' }, view(), { today });
    expect(a.antwoord).toBe(
      'Vandaag leverden de panelen tot nu toe 5,3 kWh. Het meeste was 1,9 kW, in het kwartier van 12:15. ' +
        'Je huis leverde 2,9 kWh terug en haalde 1,2 kWh van het net. Nu leveren ze 1,8 kW.',
    );
  });

  it('zegt "nog vrijwel niets" in plaats van 0 kWh', () => {
    const a = askNl({ kind: 'zon' }, view(), { today: { ...today, zonWh: 3, netTerugWh: 0, netAfWh: 640, kwartieren: [] } });
    expect(a.antwoord).toContain('Vandaag leverden de panelen nog vrijwel niets.');
    expect(a.antwoord).toContain('Je huis leverde nog niets terug en haalde 640 Wh van het net.');
  });

  it('zegt op welke gevel de zon staat, als de ligging bekend is', () => {
    const at = (zoninval: { boven: boolean; gevels: string[] } | null) =>
      ask({ kind: 'zon' }, { config, snapshot: view(), today, nowMs: AT, shadow: true, lang: 'nl', zoninval }).antwoord;
    expect(at({ boven: true, gevels: ['Voorgevel'] })).toContain('De zon staat nu op de voorgevel.');
    expect(at({ boven: true, gevels: [] })).toContain('De zon staat nu op geen van de gevels.');
    expect(at({ boven: false, gevels: [] })).not.toContain('gevel');
    expect(at(null)).not.toContain('gevel');
  });

  it('zegt het als er geen dag wordt bijgehouden', () => {
    expect(askNl({ kind: 'zon' }).antwoord).toContain('houd ik geen dag bij');
  });
});

describe('doe (fase 1: alleen zeggen wat hij zou doen)', () => {
  it('zegt wat hij zou doen, en dat hij nog niet mag schakelen', () => {
    const a = askNl({ kind: 'doe', kamer: 'zolder', wens: 'koelen', temperatuurC: 21 });
    expect(a.antwoord).toBe(
      'Dan zou ik de airco zolder op koelen naar 21° zetten, tot het volgende dagdeel. ' +
        'Maar ik kijk nog alleen mee en mag nog niet schakelen. Wil je het nu, zet het dan zelf.',
    );
  });

  it('verwarmt eerst met wat de basiswarmte levert', () => {
    const a = askNl({ kind: 'doe', kamer: 'woonkamer', wens: 'verwarmen', temperatuurC: 21 });
    expect(a.antwoord).toContain('de Nest (beneden) op verwarmen naar 21°');
  });

  it('weet wat een apparaat niet kan', () => {
    expect(askNl({ kind: 'doe', kamer: 'badkamer', wens: 'koelen', temperatuurC: null }).antwoord).toBe(
      'De badkamer heeft geen apparaat dat kan koelen.',
    );
    expect(askNl({ kind: 'doe', kamer: 'zolder', wens: 'koelen', temperatuurC: 35 }).antwoord).toBe(
      '35° kan de airco zolder niet: hij gaat van 16° tot 30°.',
    );
  });
});

describe('Engels (besluit 86)', () => {
  it('zegt hetzelfde in het Engels', () => {
    const a = ask({ kind: 'waarom', kamer: 'zolder' }, { config, snapshot: view({ accepted: [coolOnSun] }), today: null, nowMs: AT, shadow: true, lang: 'en' });
    expect(a.antwoord).toContain('I would cool the Zolder now on solar power: it is 24.3°, the target is 23°.');
    expect(a.antwoord).toContain('The panels are producing 1.8 kW.');
  });
});

describe('roomStatus', () => {
  it('geeft de soort en de feiten mee, voor de wand', () => {
    const s = roomStatus(config, view({ accepted: [coolOnSun] }), zolder, 'nl', true);
    expect(s.kind).toBe('cool');
    expect(s.feiten.map((f) => f.bron)).toEqual(['zone.zolder.temperatuur', 'zone.zolder.doel', 'zon.vermogen']);
  });
});

/*
 * Besluit 88 als regel voor élke toestand: haal elk vastgelegd feit uit het
 * antwoord, en er mag geen cijfer overblijven. Elk feit moet er ook echt in
 * staan. En nooit een entity-ID, een interne code of een lege plek.
 */
describe('elk getal heeft een bron, in elke toestand', () => {
  const CASES = Number(process.env['HEMS_INVARIANT_RUNS'] ?? 1_000);
  const strategies = defaultStrategies();
  const OBSERVED = ['off', 'cool@22', 'heat@21.5', 'off@18', 'fan_only', 'unavailable', 'onbekend', 'cool@25'];

  function check(a: Answer, label: string): void {
    expect(a.antwoord, label).not.toBe('');
    expect(a.antwoord, label).not.toMatch(/undefined|NaN|null|\[object/);
    expect(a.antwoord, label).not.toMatch(/\b(sensor|climate|light|binary_sensor|timer|input_\w+)\.\w/);
    expect(a.antwoord, label).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
    let rest = a.antwoord;
    for (const f of [...a.feiten].sort((x, y) => y.tekst.length - x.tekst.length)) {
      expect(a.antwoord, `${label}: feit ${f.bron}`).toContain(f.tekst);
      rest = rest.split(f.tekst).join('');
    }
    expect(rest, `${label}: getal zonder bron`).not.toMatch(/\d/);
  }

  it(`houdt voor ${CASES} toestanden`, () => {
    const k = dice(generator(20261005));
    for (let i = 0; i < CASES; i++) {
      const base = entityState(k, config);
      const state = k.chance(0.7) ? { ...base, solarProductionW: value(k.int(0, 4000), NOW) } : base;
      const d = decide({ config, state, strategies });
      const snap: DecisionView = {
        atMs: d.atMs,
        explanation: d.explanation,
        commands: d.commands,
        accepted: d.accepted,
        rejected: d.rejected,
        observed: Object.fromEntries(config.actuators.map((a) => [a.id, k.pick(OBSERVED)])),
      };
      const questions: Question[] = [
        { kind: 'nu' },
        { kind: 'straks' },
        { kind: 'zon' },
        ...config.zones.map((z) => ({ kind: 'waarom' as const, kamer: z.name })),
        ...config.zones.map((z) => ({
          kind: 'doe' as const,
          kamer: z.id,
          wens: k.pick(['koelen', 'verwarmen', 'uit'] as const),
          temperatuurC: k.chance(0.5) ? null : k.numberAttr(10, 35),
        })),
      ];
      for (const lang of LANGS) {
        for (const shadow of [true, false]) {
          for (const q of questions) {
            const a = ask(q, { config, snapshot: snap, today: null, nowMs: state.nowMs, shadow, lang });
            check(a, `geval ${i}, ${lang}, ${shadow ? 'schaduw' : 'echt'}, ${JSON.stringify(q)}`);
          }
        }
      }
    }
  });
});

describe('de stand per kamer voor de kaart (besluit 94)', () => {
  const room = (v: DecisionView, id: string) => residentRooms(config, v).find((r) => r.zoneId === id)!;

  it('zegt kort wat Smart Climate zou doen, met het apparaat erbij', () => {
    const r = room(view({ accepted: [coolOnSun] }), 'zolder');
    expect([r.soort, r.kort, r.actuatorId]).toEqual(['cool', 'Koelt op zon', 'ac-zolder']);
    expect(r.zin).toContain('Ik zou de zolder nu laten koelen op zon');
  });

  it('wacht op zon, of zegt waarom het wacht', () => {
    expect(room(view({ rejected: [{ intent: coolOnSun, blockedBy: 'insufficient_power_budget' }] }), 'zolder').kort).toBe('Wacht op meer zon');
    expect(room(view({ rejected: [{ intent: coolOnSun, blockedBy: 'insufficient_current_budget' }] }), 'zolder').kort).toBe(
      'Wacht: de hoofdzekering zou te zwaar belast worden',
    );
  });

  it('zegt wat het echte apparaat doet, of "uit"', () => {
    expect(room(view(), 'zolder').echt).toBe('Airco zolder koelen naar 22°');
    expect(room(view(), 'badkamer').echt).toBe('uit');
  });

  it('noemt een ingreep met de tijd tot wanneer', () => {
    const v = view({ explanation: explanation({ overrides: [{ actuatorId: 'ac-zolder', sinceMs: AT - 60_000, untilMs: Date.parse('2026-10-05T13:00:00Z') }] }) });
    expect(room(v, 'zolder').kort).toBe('Jij hebt het tot 15:00');
  });

  it('is in elke gegenereerde toestand gevuld, zonder interne codes', () => {
    const k = dice(generator(20261007));
    const strategies = defaultStrategies();
    for (let i = 0; i < 300; i++) {
      const state = entityState(k, config);
      const d = decide({ config, state, strategies });
      const v: DecisionView = { atMs: d.atMs, explanation: d.explanation, commands: d.commands, accepted: d.accepted, rejected: d.rejected, observed: { 'ac-zolder': 'cool@22.5', nest: 'heat@20' } };
      for (const lang of LANGS) {
        for (const r of residentRooms(config, v, lang)) {
          expect(r.kort, `${i} ${lang}`).not.toBe('');
          expect(`${r.kort} ${r.echt}`, `${i} ${lang}`).not.toMatch(/undefined|null|[a-z]+_[a-z_]+/);
        }
      }
    }
  });
});

describe('namen midden in een zin', () => {
  it('maakt alleen een gewoon woord klein, en houdt een merk of een naam', () => {
    expect(inSentence('Airco woonkamer')).toBe('airco woonkamer');
    expect(inSentence('Slaapkamer Mylan')).toBe('slaapkamer Mylan');
    expect(inSentence('Nest (beneden)')).toBe('Nest (beneden)');
    expect(inSentence('Voorgevel')).toBe('voorgevel');
  });
});

describe('het bewonerscontract voor Thuis en Waarom (besluit 94)', () => {
  it('zegt in de kop dat het huis op zon wacht, met de kamers erbij', () => {
    const v = view({ rejected: [{ intent: coolOnSun, blockedBy: 'insufficient_power_budget' }] });
    expect(residentView(config, v).kop).toEqual({
      boven: 'Nu · Dag',
      titel: 'Het huis wacht op zon',
      zin: 'De zolder wil koelen zodra er genoeg zon over is.',
    });
  });

  it('zegt welke kamer gekoeld wordt, en dat de bewoner de modus koos', () => {
    const v = view({ accepted: [coolOnSun], explanation: explanation({ modeSource: 'override' }) });
    const kop = residentView(config, v).kop;
    expect(kop.boven).toBe('Nu · Dag (gekozen)');
    expect(kop.titel).toBe('De zolder wordt gekoeld');
    expect(kop.zin).toBe('Zolder: koelt op zon.');
  });

  it('zegt "er draait niets" als geen kamer iets wil', () => {
    const kop = residentView(config, view({ explanation: explanation({ perZone: explanation().perZone.map((z) => ({ ...z, demand: 'none', reason: 'zone_satisfied' })) }) })).kop;
    expect(kop.titel).toBe('Er draait niets');
    expect(kop.zin).toBe('Geen kamer heeft iets nodig.');
  });

  it('rondt de stromen zo af dat ze optellen', () => {
    // 0,55 zon en 0,14 terug: los afgerond zou het 0,6 zon, 0,4 huis en 0,1 terug zijn.
    const f = residentFlows(view({ explanation: explanation({ solarProductionW: 550, budget: { availableW: 0, allocatedW: 0, surplusW: 140, reclaimableW: 0, gridPowerW: -140 } }) }));
    expect(f).toMatchObject({ zonKw: 0.6, netKw: -0.1, verbruikKw: 0.5, aircoKw: 0, huisKw: 0.5 });
    // Wat er minder dan 0,05 kW van het net komt, is nul, en geen "-0".
    expect(Object.is(residentFlows(view({ explanation: explanation({ budget: { ...explanation().budget, gridPowerW: -20 } }) })).netKw, 0)).toBe(true);
    // Zonder zonmeting geen verbruik.
    expect(residentFlows(view({ explanation: explanation({ solarProductionW: null }) })).verbruikKw).toBeNull();
  });

  it('telt in elke gegenereerde toestand op: zon plus net is airco plus huis', () => {
    const k = dice(generator(20261008));
    const strategies = defaultStrategies();
    for (let i = 0; i < 300; i++) {
      const d = decide({ config, state: entityState(k, config), strategies });
      const f = residentFlows({ atMs: d.atMs, explanation: d.explanation, commands: d.commands, accepted: d.accepted, rejected: d.rejected, observed: {} });
      if (f.zonKw == null || f.verbruikKw == null || f.huisKw == null) continue;
      // In tienden van een kW, zodat afronding van de som zelf geen rol speelt.
      const tenths = (n: number) => Math.round(n * 10);
      expect(tenths(f.verbruikKw), `${i}`).toBe(Math.max(0, tenths(f.zonKw) + tenths(f.netKw)));
      if (f.huisKw > 0) expect(tenths(f.aircoKw) + tenths(f.huisKw), `${i}`).toBe(tenths(f.verbruikKw));
    }
  });

  it('zegt per apparaat wat Smart Climate zou doen, en de rest op één regel', () => {
    const v = view({ accepted: [coolOnSun], rejected: [{ intent: { ...coolOnSun, zoneId: 'woonkamer', actuatorId: 'ac-woonkamer' }, blockedBy: 'insufficient_power_budget' }] });
    const b = residentView(config, v);
    expect(b.apparaten).toEqual([
      { actuatorId: 'ac-woonkamer', naam: 'Airco woonkamer', soort: 'wait', tekst: 'zou koelen, maar te weinig zon over' },
      { actuatorId: 'ac-zolder', naam: 'Airco zolder', soort: 'cool', tekst: 'koelen naar 23° · er is zon over' },
    ].sort((a, c) => config.actuators.findIndex((x) => x.id === a.actuatorId) - config.actuators.findIndex((x) => x.id === c.actuatorId)));
    expect(b.rust).toMatch(/: niets te doen$/);
  });

  it('zegt wat een besluit deed en waarom, ook voor de tijdlijn uit het logboek', () => {
    const v = view({
      accepted: [coolOnSun],
      commands: [
        { kind: 'setAction', actuatorId: 'ac-zolder', action: 'cool' },
        { kind: 'setSetpoint', actuatorId: 'ac-zolder', setpointC: 22.5 },
        { kind: 'startTimer', timerId: 'stabilisation', durationS: 300 },
      ],
    });
    expect(residentView(config, v).besluit).toEqual({
      wat: ['Airco zolder: koelen', 'Airco zolder: doel 22,5°', 'Stabiliseren, 5 minuten'],
      waarom: ['Airco zolder: er is zon over'],
    });
    expect(residentView(config, view()).besluit).toBeNull();
    expect(decisionWords(config, [], [{ actuatorId: 'ac-zolder', actie: 'off', reden: null }]).waarom).toEqual(['Airco zolder: uit']);
  });

  it('heeft in het Engels dezelfde vorm, zonder interne codes', () => {
    const v = view({ accepted: [coolOnSun] });
    const b = residentView(config, v, 'en');
    expect(b.kop.titel).toBe('The Zolder is being cooled');
    expect(JSON.stringify(b)).not.toMatch(/undefined|[a-z]+_[a-z_]+"/);
  });
});

describe('de droger in de lijst van Thuis (besluit 98)', () => {
  const withDryer = (state: 'would_start' | 'waiting' | 'not_ready', reason: string) =>
    view({ explanation: explanation({ deferrables: [{ id: 'droger', state, reason } as never] }) });

  it('zegt dat hij nu zou starten, of waarop hij wacht', () => {
    const start = residentView(config, withDryer('would_start', 'surplus_available')).apparaten.find((d) => d.actuatorId === 'droger');
    expect(start).toEqual({ actuatorId: 'droger', naam: 'Droger', soort: 'ok', tekst: 'zou nu starten: er is genoeg zon over' });
    const wait = residentView(config, withDryer('waiting', 'surplus_insufficient')).apparaten.find((d) => d.actuatorId === 'droger');
    expect(wait?.tekst).toBe('wacht op zon, uiterlijk tot 15:00');
  });

  it('staat bij "niets te doen" als hij niet klaargezet is', () => {
    const b = residentView(config, withDryer('not_ready', 'remote_start_not_allowed'));
    expect(b.apparaten.some((d) => d.actuatorId === 'droger')).toBe(false);
    expect(b.rust).toContain('Droger');
  });
});
