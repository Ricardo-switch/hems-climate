/**
 * De vaste replay: één dag afspelen zoals de schaduwdienst dat doet (besluit 54).
 *
 * De bit-identieke replay was de belangrijkste regressiebewaking van dit
 * project, maar hij draaide met de hand, op één pc, tegen een dataset die buiten
 * git staat. Deze functie speelt een dag af die wél in git staat, minuut voor
 * minuut, met de veronderstelde apparaatstand van besluit 49b — dus zoals de
 * NAS werkelijk beslist, niet zoals de oude vergelijking met het YAML-systeem.
 *
 * **Een samenvatting en geen hash.** Een hash zegt dát er iets veranderde; deze
 * samenvatting zegt wát. Elk commando staat erin met zijn tijd, en de blokkades
 * en aanvaarde voorstellen als tellingen. Verandert het gedrag bewust, dan maak
 * je hem opnieuw (`npm run replay:record`) en is de diff in de commit het
 * verslag van wat er anders beslist wordt.
 */

import type { SiteConfig } from '../core/model.js';
import { decide } from '../core/decide.js';
import { ShadowActuators } from '../adapters/shadow-actuators.js';
import { defaultStrategies } from '../index.js';
import { Cursor, configAt, snapshot, type History } from './reconstruct.js';

const MINUTE = 60_000;

export interface Summary {
  readonly bron: string;
  readonly minuten: number;
  /** Elk commando, als `UU:MM apparaat actie [setpoint]` in de tijdzone van de woning. */
  readonly commandos: readonly string[];
  /** Afgewezen voorstellen per reden. */
  readonly blokkades: Readonly<Record<string, number>>;
  /** Aanvaarde voorstellen per strategie en actie. */
  readonly aanvaard: Readonly<Record<string, number>>;
}

function count(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

/** Een object met gesorteerde sleutels, zodat de vergelijking niet op volgorde struikelt. */
function sorted(r: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)));
}

export function playBack(history: History, site: SiteConfig): Summary {
  const clock = new Intl.DateTimeFormat('nl-NL', {
    timeZone: site.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const strategies = defaultStrategies();
  const cursor = new Cursor(history);
  const shadow = new ShadowActuators();

  const commands: string[] = [];
  const blocks: Record<string, number> = {};
  const accepted: Record<string, number> = {};
  let minutes = 0;

  const start = Math.ceil(history.meta.fromMs / MINUTE) * MINUTE;
  for (let t = start; t <= history.meta.toMs; t += MINUTE) {
    cursor.advanceTo(t);
    const config = configAt(site, cursor);
    const state = snapshot(config, cursor, t, undefined, shadow);
    const decision = decide({ config, state, strategies });
    shadow.follow(decision);
    minutes += 1;

    const time = clock.format(new Date(t));
    for (const c of decision.commands) {
      if (c.kind === 'setAction') commands.push(`${time} ${c.actuatorId} ${c.action}`);
      else if (c.kind === 'setSetpoint') commands.push(`${time} ${c.actuatorId} setpoint ${c.setpointC}`);
      else if (c.kind === 'startTimer') commands.push(`${time} timer ${c.timerId} ${c.durationS}s`);
      else commands.push(`${time} timer ${c.timerId} stop`);
    }
    for (const r of decision.rejected) count(blocks, r.blockedBy);
    for (const i of decision.accepted) count(accepted, `${i.strategyId}:${i.action}`);
  }

  return {
    bron: history.meta.source,
    minuten: minutes,
    commandos: commands,
    blokkades: sorted(blocks),
    aanvaard: sorted(accepted),
  };
}
