/**
 * Wat de apparaten zouden doen als de arbiter het stuur had.
 *
 * In de schaduwmodus stuurt de arbiter niets (besluit 15), dus blijven de
 * apparaten staan waar het oude systeem ze zet. `ActuatorState.lastChangeMs`
 * komt uit Home Assistant en is dus de laatste schakeling van het *echte*
 * apparaat. Daardoor is `minutesSinceChange` vrijwel altijd groot, en bijten
 * `minRunMinutes` en `minRestMinutes` nooit. In het logboek van september
 * schakelde de zolder-airco 430 keer waar het echte apparaat 91 keer
 * schakelde, met een mediane rit van 2,3 minuten tegen een ingestelde minimale
 * draaitijd van 15. Niet omdat de grens verkeerd staat, maar omdat hij de
 * verkeerde geschiedenis las.
 *
 * Dat raakt ook de hysterese: `currentZoneAction` in `context.ts` leest
 * dezelfde stand om te bepalen of een zone "al aan het koelen was", en las dus
 * ook het oude systeem.
 *
 * Deze klas houdt bij wat er met het apparaat zou zijn gebeurd: precies de
 * commando's die de arbiter gaf, toegepast op een eigen boekhouding. Daarmee
 * meet de schaduw zijn eigen geschiedenis en zijn de draaitijden, de rusttijd
 * en de hysterese aantoonbaar in plaats van aannemelijk.
 *
 * **Dit is niet hetzelfde als `OwnState`.** Die houdt bij wat de dienst
 * *bezit* omdat Home Assistant het niet heeft — de modus en de timers
 * (besluit 39). Dit houdt bij wat er niet is: een apparaat dat de arbiter zou
 * hebben gestuurd. Het eerste is eigendom, het tweede een veronderstelling.
 * Daarom staan ze apart.
 *
 * **De grenzen van de veronderstelling.** Wat hier niet in staat:
 *
 * - `powerW` blijft de gemeten waarde. Een geschat vermogen zou een gemeten
 *   getal vervangen door een aanname, en het budget is juist het deel dat op
 *   echte meting hoort te rusten. Wél geldt: zodra de veronderstelde stand van
 *   de gemeten stand afwijkt, meet die sensor niet ons apparaat, en dan is de
 *   meting onbruikbaar in plaats van verkeerd — zie `buildSystemState`.
 * - `producing` blijft het echte apparaat. Of een apparaat werkelijk warmte
 *   levert is natuurkunde, en die rekenen we niet door zolang er geen thermisch
 *   model is (fase 7). Dit raakt alleen heat-assist, dat op `producing` van de
 *   primary leunt.
 * - De temperatuur blijft de gemeten temperatuur. Dit is een schaduwverge-
 *   lijking en geen gesloten simulatie: we weten wat de arbiter zou schakelen,
 *   niet wat het huis daarvan zou worden.
 *
 * Zonder deze klas is de vergelijking onbedoeld scheef; met deze klas is hij
 * open waar het huis begint. Dat tweede is uit te leggen.
 */

import type { Command, Decision } from '../core/decision.js';
import type { Action } from '../core/model.js';
import { isHandsOff } from '../core/model.js';

/**
 * De veronderstelde stand van één apparaat.
 *
 * Elk veld mag null zijn: dan is er over dat veld nog niets gestuurd en geldt
 * wat het echte apparaat meldt. De boekhouding bewaart dus verschillen en geen
 * volledige toestand — een `setSetpoint` zonder `setAction` (het apparaat stond
 * al goed) zou anders een actie moeten verzinnen.
 */
export interface SchaduwApparaat {
  readonly action: Action | null;
  readonly setpointC: number | null;
  /** Wanneer de veronderstelde actie voor het laatst wisselde. */
  readonly lastChangeMs: number | null;
}

/**
 * Een leesinterface en niet de klas zelf, zodat de replay-harness dezelfde
 * boekhouding kan voeren en `buildSystemState` niets over de herkomst weet.
 */
export interface SchaduwApparatenReader {
  apparaat(actuatorId: string): SchaduwApparaat | null;
}

/** Geen veronderstelling: alles komt van het echte apparaat. */
export const GEEN_SCHADUW: SchaduwApparatenReader = { apparaat: () => null };

export class SchaduwApparaten implements SchaduwApparatenReader {
  readonly #stand = new Map<string, SchaduwApparaat>();

  apparaat(actuatorId: string): SchaduwApparaat | null {
    return this.#stand.get(actuatorId) ?? null;
  }

  /**
   * Werkt de boekhouding bij na een besluit. Dit is wat de dienst en de
   * meetscripts aanroepen; `apply` is het onderdeel ervan.
   *
   * **Zolang de bewoner stuurt, volgt de boekhouding de werkelijkheid**
   * (besluit 49b). In `handmatig` geeft de arbiter bewust geen commando's, dus
   * bleef de veronderstelde stand hangen op zijn laatste opdracht — terwijl de
   * bewoner het echte apparaat allang anders had gezet. In het septembervenster
   * gaf dat 589 minuten een veronderstelde airco die "koelde" terwijl hij uit
   * stond, en dus netstroom die niemand kocht. Onder echte regeling pakt de
   * arbiter het na handmatig op vanaf de stand waarin de bewoner het apparaat
   * achterliet; vergeten is precies dat.
   *
   * Behalve bij de failsafe: die stuurt ook in handmatig de assist-apparaten
   * uit, en die commando's gelden.
   */
  volg(decision: Decision): void {
    const { mode, failsafe } = decision.explanation;
    if (isHandsOff(mode) && !failsafe.active) {
      this.#stand.clear();
      return;
    }
    this.apply(decision.commands, decision.atMs);
  }

  /**
   * Voert de apparaatcommando's van een besluit uit op de eigen boekhouding.
   *
   * `lastChangeMs` schuift alleen op bij een werkelijke wisseling van actie.
   * Een nieuw setpoint is geen schakeling — dat volgt Home Assistant, waar
   * `last_changed` op de state zit en niet op de attributen, en het is ook wat
   * de draaitijd bedoelt: een compressor die doorloopt op een andere
   * doeltemperatuur is niet opnieuw gestart.
   *
   * De timercommando's gaan hier langs zonder iets te doen; die horen bij
   * `OwnState`.
   */
  apply(commands: readonly Command[], nowMs: number): void {
    for (const c of commands) {
      if (c.kind === 'setAction') {
        const vorig = this.#stand.get(c.actuatorId);
        if (vorig?.action === c.action) continue;
        this.#stand.set(c.actuatorId, {
          action: c.action,
          setpointC: vorig?.setpointC ?? null,
          lastChangeMs: nowMs,
        });
      } else if (c.kind === 'setSetpoint') {
        const vorig = this.#stand.get(c.actuatorId);
        this.#stand.set(c.actuatorId, {
          action: vorig?.action ?? null,
          setpointC: c.setpointC,
          lastChangeMs: vorig?.lastChangeMs ?? null,
        });
      }
    }
  }
}
