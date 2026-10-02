/**
 * De arbiter: van voorstellen naar commando's.
 *
 * Dit is de plek waar de YAML-versie er geen had. Daar zat de voorrang tussen
 * strategieën impliciet in de volgorde van `choose`-blokken, en werd
 * dubbelstarten tegengehouden met een vlag (`zolder_started_now`) die door een
 * scopingfout nooit werkte. Hier is het geen vlag maar een budget: wie het
 * eerst claimt, krijgt het, en wat op is is op.
 */

import type {
  BlockCode,
  Command,
  Intent,
  PowerBudget,
  RejectedIntent,
} from './decision.js';
import type { DecisionContext } from './context.js';
import { actuatorById } from './model.js';
import type { Action, Actuator } from './model.js';
import { isOverridden } from './override.js';
import { minutesSinceChange } from './state.js';
import type { ActuatorState } from './state.js';

/** Verschil waarboven een nieuw setpoint de moeite van sturen waard is. */
const SETPOINT_TOLERANCE_C = 0.3;

export interface ArbitrationResult {
  readonly accepted: readonly Intent[];
  readonly rejected: readonly RejectedIntent[];
  readonly commands: readonly Command[];
  readonly budget: PowerBudget;
}

function isRunning(action: string | undefined): boolean {
  return action === 'heat' || action === 'cool';
}

/** Consumeert dit voorstel vermogen? standby en off kosten per definitie niets. */
function consumesPower(intent: Intent): boolean {
  return (intent.action === 'heat' || intent.action === 'cool') && intent.budgetW > 0;
}

/**
 * Ordent voorstellen. Lagere prioriteit wint; bij gelijke prioriteit gaat de
 * belangrijkste zone voor, dan primary boven assist, dan alfabetisch zodat de
 * uitkomst reproduceerbaar is en de replay-harness kan vergelijken.
 */
function ordered(intents: readonly Intent[], ctx: DecisionContext): Intent[] {
  const zonePriority = new Map(ctx.config.zones.map((z) => [z.id, z.priority]));
  const roleRank = (id: string): number =>
    actuatorById(ctx.config, id).role === 'primary' ? 0 : 1;

  return [...intents].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const za = zonePriority.get(a.zoneId) ?? Number.MAX_SAFE_INTEGER;
    const zb = zonePriority.get(b.zoneId) ?? Number.MAX_SAFE_INTEGER;
    if (za !== zb) return za - zb;
    const ra = roleRank(a.actuatorId);
    const rb = roleRank(b.actuatorId);
    if (ra !== rb) return ra - rb;
    return a.actuatorId.localeCompare(b.actuatorId);
  });
}

/**
 * Toetst de timingregels van het apparaat zelf. Geeft null wanneer het voorstel
 * mag, en anders de reden waarom niet.
 */
function timingBlock(
  intent: Intent,
  actuator: Actuator,
  current: ActuatorState | undefined,
  ctx: DecisionContext,
): BlockCode | null {
  if (!current) return null;
  const running = isRunning(current.action.ok ? current.action.value : undefined);
  const wantsRun = intent.action === 'heat' || intent.action === 'cool';
  const minutes = minutesSinceChange(current, ctx.nowMs);

  if (running && !wantsRun && minutes < actuator.timing.minRunMinutes) {
    return 'min_run_not_elapsed';
  }
  if (!running && wantsRun) {
    if (minutes < actuator.timing.minRestMinutes) return 'min_rest_not_elapsed';
    if (ctx.stabilisationActive) return 'stabilisation_active';
  }
  if (running && wantsRun && minutes < actuator.timing.settleMinutes) {
    // Het apparaat is net geschakeld; zijn opgenomen vermogen is nog geen
    // betrouwbare basis om een tweede unit op te starten.
    const switchesAction =
      current.action.ok && current.action.value !== intent.action;
    if (switchesAction) return 'settling_after_switch';
  }
  return null;
}

/** Bouwt de commando's die nodig zijn om dit voorstel werkelijkheid te maken. */
function commandsFor(
  intent: Intent,
  actuator: Actuator,
  current: ActuatorState | undefined,
): Command[] {
  const out: Command[] = [];
  const currentAction = current?.action.ok ? current.action.value : undefined;
  if (currentAction !== intent.action) {
    out.push({ kind: 'setAction', actuatorId: intent.actuatorId, action: intent.action });
  }

  const currentActionForStandby = current?.action.ok ? current.action.value : undefined;
  const target = targetSetpoint(intent, actuator, currentActionForStandby);
  if (target != null) {
    const now = current?.setpointC.ok ? current.setpointC.value : undefined;
    if (now == null || Math.abs(now - target) > SETPOINT_TOLERANCE_C) {
      out.push({ kind: 'setSetpoint', actuatorId: intent.actuatorId, setpointC: target });
    }
  }
  return out;
}

/**
 * Het setpoint dat op het apparaat moet komen. Bij standby is dat de
 * onbereikbare waarde uit de capabilities, zodat het apparaat aan blijft maar
 * geen vermogen vraagt.
 *
 * De richting volgt uit wat het apparaat op dit moment doet: parkeren na koelen
 * duwt het setpoint omhoog, na verwarmen omlaag. Dat uit het voorstel proberen
 * af te leiden ging mis zodra dat geen setpoint meebracht.
 */
function targetSetpoint(
  intent: Intent,
  actuator: Actuator,
  currentAction: Action | undefined,
): number | null {
  if (intent.action === 'off') return null;
  if (intent.action === 'standby') {
    const s = actuator.capabilities.standby;
    if (!s) return null;
    return currentAction === 'cool' ? s.cool : s.heat;
  }
  return intent.setpointC ?? null;
}

/**
 * Hoe een apparaat afbouwt wanneer niemand het nog wil.
 *
 * Draaiend gaat eerst naar standby: het apparaat blijft beschikbaar en hoeft
 * bij een korte dip in de zon niet opnieuw op te starten. Pas als de
 * stabilisatieperiode voorbij is en het nog steeds niet nodig blijkt, gaat het
 * echt uit.
 *
 * Een apparaat dat al uit staat blijft uit. Dat lijkt vanzelfsprekend, maar het
 * ging eerder mis: standby werd toen ook voorgesteld voor uitgeschakelde
 * apparaten, en dat is geen afbouwen maar aanzetten.
 */
function windDownIntent(
  actuator: Actuator,
  zoneId: string,
  currentAction: Action | undefined,
  stabilisationActive: boolean,
): Intent | null {
  const standby = actuator.capabilities.standby;

  if (currentAction === 'heat' || currentAction === 'cool') {
    return {
      strategyId: 'arbiter:wind-down',
      zoneId,
      actuatorId: actuator.id,
      action: standby ? 'standby' : 'off',
      priority: Number.MAX_SAFE_INTEGER,
      budgetW: 0,
      reason: 'surplus_insufficient',
    };
  }

  // Geparkeerd en nog steeds niet nodig: uitzetten zodra de rustperiode voorbij
  // is. Eerder zou de parkeerstand zinloos zijn.
  if (currentAction === 'standby' && !stabilisationActive) {
    return {
      strategyId: 'arbiter:wind-down',
      zoneId,
      actuatorId: actuator.id,
      action: 'off',
      priority: Number.MAX_SAFE_INTEGER,
      budgetW: 0,
      reason: 'zone_satisfied',
    };
  }

  return null;
}

export function arbitrate(
  intents: readonly Intent[],
  ctx: DecisionContext,
): ArbitrationResult {
  const accepted: Intent[] = [];
  const rejected: RejectedIntent[] = [];
  const commands: Command[] = [];
  const claimed = new Set<string>();
  let allocatedW = 0;
  let startedSomething = false;
  let parkedSomething = false;

  const reject = (intent: Intent, blockedBy: BlockCode, detail?: string): void => {
    rejected.push(detail == null ? { intent, blockedBy } : { intent, blockedBy, detail });
  };

  const consider = (intent: Intent): void => {
    if (claimed.has(intent.actuatorId)) {
      reject(intent, 'superseded_by_higher_priority');
      return;
    }

    // Overgenomen door de bewoner: met rust laten tot de ingreep afloopt
    // (besluit 74). De failsafe wint, net als bij handen af (besluit 8).
    if (intent.strategyId !== 'failsafe' && isOverridden(ctx.state, intent.actuatorId)) {
      reject(intent, 'resident_override');
      return;
    }

    const actuator = actuatorById(ctx.config, intent.actuatorId);
    const caps = actuator.capabilities;

    if (intent.action === 'heat' && !caps.canHeat) {
      reject(intent, 'capability_missing', 'apparaat kan niet verwarmen');
      return;
    }
    if (intent.action === 'cool' && !caps.canCool) {
      reject(intent, 'capability_missing', 'apparaat kan niet koelen');
      return;
    }
    if (intent.action === 'standby' && !caps.standby) {
      reject(intent, 'capability_missing', 'apparaat kent geen standby');
      return;
    }

    const [minC, maxC] = caps.setpointRange;
    if (intent.setpointC != null && (intent.setpointC < minC || intent.setpointC > maxC)) {
      // Bewust een afwijzing en geen stilzwijgende begrenzing: een setpoint
      // buiten bereik is een configuratiefout die zichtbaar hoort te zijn.
      reject(intent, 'setpoint_out_of_range', `${intent.setpointC} valt buiten ${minC}-${maxC}`);
      return;
    }

    const current = ctx.state.actuators[intent.actuatorId];
    const timing = timingBlock(intent, actuator, current, ctx);
    if (timing) {
      reject(intent, timing);
      return;
    }

    if (consumesPower(intent)) {
      if (allocatedW + intent.budgetW > ctx.availableW) {
        reject(
          intent,
          'insufficient_power_budget',
          `${intent.budgetW} W gevraagd, ${Math.max(0, ctx.availableW - allocatedW)} W over`,
        );
        return;
      }

      /*
       * Starten vraagt meer dan draaien (besluit 51).
       *
       * Een draaiend apparaat mag door zolang zijn opname in het budget past,
       * met `stopImportW` tolerantie. Starten op precies zoveel overschot als
       * het apparaat trekt is een gok: zakt de zon een minuut later weg, dan
       * houdt `minRunMinutes` het een kwartier aan terwijl het huis netstroom
       * koopt. `startSurplusW` is de marge die dat voorkomt — hij stond in de
       * configuratie en in het model, maar niets dwong hem af.
       *
       * Geteld zonder de tolerantie: die is er voor een apparaat dat al draait,
       * niet om een start mee te halen. Een geparkeerd apparaat (standby) valt
       * onder de lagere `resumeSurplusW`; dat is kortstondig uitvallen, geen
       * koude start.
       */
      const now = current?.action.ok ? current.action.value : undefined;
      if (!isRunning(now)) {
        /*
         * Hooguit één start op het budget per beslissing (besluit 68).
         *
         * Dekte het overschot twee airco's, dan startten ze samen, op twee
         * schattingen. De stabilisatie bestaat juist om eerst te meten wat de
         * eerste werkelijk trekt (besluit 61); een tweede start in dezelfde
         * beslissing slaat die meting over. Het oude systeem verbiedt het ook,
         * met `zolder_started_now`.
         */
        if (startedSomething) {
          reject(intent, 'stabilisation_active', 'er is deze ronde al iets gestart');
          return;
        }
        const threshold =
          now === 'standby'
            ? ctx.config.power.resumeSurplusW
            : ctx.config.power.startSurplusW;
        const free = ctx.availableW - allocatedW - ctx.config.power.stopImportW;
        if (free < threshold) {
          reject(
            intent,
            'start_threshold_not_met',
            `${Math.max(0, free)} W vrij, ${threshold} W nodig om te starten`,
          );
          return;
        }
      }
      allocatedW += intent.budgetW;
    }

    const cmds = commandsFor(intent, actuator, current);
    claimed.add(intent.actuatorId);
    accepted.push(intent);

    if (cmds.length === 0) {
      // Het apparaat staat al goed. Het voorstel is aanvaard en houdt zijn
      // aanspraak op het budget vast, maar er hoeft niets verstuurd te worden.
      return;
    }

    const wasRunning = isRunning(current?.action.ok ? current.action.value : undefined);
    const willRun = intent.action === 'heat' || intent.action === 'cool';
    if (!wasRunning && willRun) startedSomething = true;
    if (wasRunning && intent.action === 'standby') parkedSomething = true;

    commands.push(...cmds);
  };

  for (const intent of ordered(intents, ctx)) consider(intent);

  // Afbouwronde. Een apparaat waar geen enkele strategie nog iets mee wil —
  // omdat het budget op was, of omdat de vraag verdwenen is — moet terug naar
  // rust. Zonder deze ronde blijft het draaien op stroom die van het net komt,
  // of blijft het eindeloos geparkeerd staan. De timingregels gelden ook hier,
  // dus de minimale draaitijd kan het afbouwen nog even uitstellen.
  for (const zone of ctx.config.zones) {
    for (const actuatorId of zone.actuatorIds) {
      if (claimed.has(actuatorId)) continue;
      // Ook afbouwen is ingrijpen. Een overgenomen apparaat blijft staan zoals
      // de bewoner het zette.
      if (isOverridden(ctx.state, actuatorId)) continue;
      const current = ctx.state.actuators[actuatorId];
      const action = current?.action.ok ? current.action.value : undefined;

      const intent = windDownIntent(
        actuatorById(ctx.config, actuatorId),
        zone.id,
        action,
        ctx.stabilisationActive,
      );
      if (intent) consider(intent);
    }
  }

  /*
   * Ook na parkeren (besluit 61).
   *
   * Besluit 5 zegt: geparkeerd gaat na de stabilisatieperiode uit. Die periode
   * begon alleen bij een start, dus een airco die werd geparkeerd zonder dat er
   * net iets gestart was, ging de minuut erna al uit — en dan is de parkeerstand
   * zinloos. Het oude systeem start de timer bij beide, en om dezelfde reden:
   * parkeren verandert de opname net zo goed als starten, en pas na de
   * stabilisatie is de meting weer een basis voor de volgende beslissing.
   */
  if ((startedSomething || parkedSomething) && ctx.config.power.stabilisationMinutes > 0) {
    commands.push({
      kind: 'startTimer',
      timerId: 'stabilisation',
      durationS: ctx.config.power.stabilisationMinutes * 60,
    });
  }

  return {
    accepted,
    rejected,
    commands,
    budget: {
      availableW: ctx.availableW,
      allocatedW,
      surplusW: ctx.surplusW,
      reclaimableW: ctx.reclaimableW,
      gridPowerW: ctx.gridPowerW,
    },
  };
}
