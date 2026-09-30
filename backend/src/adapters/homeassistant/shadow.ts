/**
 * Schaduwmodus.
 *
 * De arbiter beslist continu mee op de echte toestand van het huis, maar zijn
 * commando's gaan naar het log in plaats van naar Home Assistant. Zo verzamel
 * je een winter aan beslissingen naast het draaiende YAML-systeem, en zie je
 * waar de twee uiteenlopen voordat er iets overgezet wordt.
 *
 * De veiligheid zit niet in deze klasse maar een laag dieper: `HaClient` werpt
 * bij elke `callService` zolang `allowWrites` uit staat. Deze runner roept die
 * methode sowieso niet aan — de commando's belanden alleen in het logboek.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type {
  Command,
  Decision,
  Explanation,
  Intent,
  RejectedIntent,
} from '../../core/decision.js';
import { decide } from '../../core/decide.js';
import type { Mode, SiteConfig } from '../../core/model.js';
import { OwnState } from '../own-state.js';
import { SchaduwApparaten } from '../shadow-actuators.js';
import type { StrategyRegistry } from '../../core/strategy.js';
import type { HaClient, HaEntityState } from './client.js';
import {
  buildSystemState,
  configFrom,
  observedEntities,
  relevantEntities,
} from './mapping.js';
import { Historieschrijver } from './history.js';
import { EntityStore } from './store.js';

/**
 * Het laatste besluit, klaar om te tonen.
 *
 * Dit is precies wat er ook in het logboek belandt, alleen niet ingedikt: de
 * webweergave leest hetzelfde besluit als het log en de historie, en rekent
 * niets zelf uit. Zodra de weergave iets zou afleiden wat hier niet in staat,
 * ontstaat de divergentie tussen dashboard en regeling waar dit project juist
 * vandaan komt — het oude dashboard had ~500 regels JS die de state machine
 * dupliceerden.
 */
export interface LiveSnapshot {
  readonly atMs: number;
  /** Wat deze evaluatie uitlokte: 'wijziging', 'hartslag', 'start'. */
  readonly trigger: string;
  /** Of het besluit wijzigde ten opzichte van het vorige. */
  readonly changed: boolean;
  readonly explanation: Explanation;
  readonly commands: readonly Command[];
  readonly accepted: readonly Intent[];
  readonly rejected: readonly RejectedIntent[];
  /** Wat de apparaten op dat moment werkelijk deden, op actuator-id. */
  readonly observed: Readonly<Record<string, string>>;
  /** De uitleg van het oude systeem, zolang de migratie loopt. */
  readonly legacy: string | null;
}

export interface ShadowOptions {
  readonly config: SiteConfig;
  readonly strategies: StrategyRegistry;
  readonly client: HaClient;
  /** Vaste hartslag, ook als er niets verandert. */
  readonly tickSeconds?: number;
  /** Rust na een reeks wijzigingen voordat er opnieuw gerekend wordt. */
  readonly debounceMs?: number;
  /**
   * Ondergrens tussen twee evaluaties.
   *
   * De slimme meter meldt zich elke vijf seconden, en is daarmee bijna negentig
   * procent van alle wijzigingen die ons aangaan. Daarop telkens opnieuw
   * beslissen heeft geen zin: de regeling werkt met stabilisatietimers van vijf
   * minuten en minimale draaitijden van een kwartier. Het oude YAML-systeem
   * draaide eens per drie minuten. Vijftien seconden is dus al ruim.
   *
   * Nul zet de begrenzer uit; dat is wat de tests doen.
   */
  readonly minIntervalSeconds?: number;
  /**
   * Na hoeveel minuten zonder geslaagde evaluatie het proces zichzelf beëindigt.
   *
   * Een dienst die maanden moet doorlopen faalt zelden met een knal; hij blijft
   * hangen. Een websocket die dood is zonder dat 'close' afging, een
   * herverbindingslus die vastloopt — het proces leeft, de opname stopt, en dat
   * merk je pas als je de dataset gaat gebruiken. Afsluiten met een foutcode
   * laat Docker hem herstarten; dat is beter dan stil blijven staan.
   *
   * Nul zet de bewaking uit.
   */
  readonly watchdogMinutes?: number;
  /** Hoe het proces beëindigd wordt. Injecteerbaar voor de test. */
  readonly onStall?: (idleMinutes: number) => void;
  /**
   * Hoe vaak de bewaking kijkt. Standaard een derde van de bewakingstijd, met
   * dertig seconden als ondergrens: vaker kijken heeft geen zin voor een
   * controle die vrijwel altijd niets vindt. De tests zetten hem lager zodat ze
   * niet een halve minuut hoeven te wachten.
   */
  readonly watchdogCheckMs?: number;
  /** Map waarin het beslislogboek als NDJSON belandt. Leeg laten = niet loggen. */
  readonly logDir?: string;
  /** Waar de regels naartoe gaan. Standaard de console. */
  readonly write?: (line: string) => void;
  /**
   * Wordt na elk besluit aangeroepen, ook wanneer er niets wijzigde.
   *
   * Hier hangt de webweergave zich aan. Bewust een callback en geen server in
   * deze klasse: de runner hoort niet te weten dat er iemand meekijkt, en de
   * tests draaien hem zonder.
   */
  readonly onDecision?: (snapshot: LiveSnapshot) => void;
  /**
   * De klok. Standaard `Date.now`, maar injecteerbaar — de kern behandelt tijd
   * al als invoer, en dan hoort de laag eromheen dat ook te doen. Zonder dit
   * hangt de uitkomst van een test af van het uur waarop hij toevallig draait.
   */
  readonly now?: () => number;
}

function commandKey(commands: readonly Command[]): string {
  return commands
    .map((c) =>
      c.kind === 'setAction'
        ? `${c.actuatorId}:${c.action}`
        : c.kind === 'setSetpoint'
          ? `${c.actuatorId}:${c.setpointC.toFixed(1)}`
          : `${c.kind}:${'timerId' in c ? c.timerId : ''}`,
    )
    .sort()
    .join('|');
}

function describe(command: Command): string {
  switch (command.kind) {
    case 'setAction':
      return `${command.actuatorId} → ${command.action}`;
    case 'setSetpoint':
      return `${command.actuatorId} → ${command.setpointC.toFixed(1)} °C`;
    case 'startTimer':
      return `timer ${command.timerId} start (${command.durationS} s)`;
    case 'cancelTimer':
      return `timer ${command.timerId} stop`;
  }
}

export class ShadowRunner {
  readonly #options: Required<Omit<ShadowOptions, 'logDir'>> & {
    logDir: string | null;
  };
  readonly #store: EntityStore;
  #timer: NodeJS.Timeout | null = null;
  #debounce: NodeJS.Timeout | null = null;
  #ready = false;
  #latest: LiveSnapshot | null = null;
  #lastKey: string | null = null;
  #lastLegacy: string | null = null;
  #ticks = 0;
  #ignored = 0;
  #throttled = 0;
  #lastEvalMs = Number.NEGATIVE_INFINITY;
  #throttle: NodeJS.Timeout | null = null;
  #watchdog: NodeJS.Timeout | null = null;
  /**
   * De modus en de timers die deze dienst zelf bijhoudt.
   *
   * Bestaat altijd, ook wanneer de configuratie Home Assistant-bronnen noemt.
   * De vertaling kijkt er dan niet naar — dat scheelt een tak die alleen in de
   * ene opstelling wordt gelopen en in de andere niet.
   */
  readonly #eigen = new OwnState();

  /**
   * De veronderstelde stand van de apparaten (besluit 49).
   *
   * Zolang er niet geschakeld wordt, is de laatste wijziging van het échte
   * apparaat de geschiedenis van het oude systeem, en meten de draaitijden
   * iemand anders. Hier staat wat de arbiter zelf gedaan zou hebben. Zodra de
   * actuator-laag werkelijk schakelt hoort dit weg te vallen: dan ís het echte
   * apparaat het antwoord.
   */
  readonly #schaduwApparaten = new SchaduwApparaten();

  /**
   * De ruwe historie van de gevolgde entiteiten (besluit 52), naast het
   * beslislogboek. Alleen wanneer er een logmap is.
   */
  #historie: Historieschrijver | null = null;

  constructor(options: ShadowOptions) {
    // Bijhouden doen we allebei; alleen de eerste groep is aanleiding om
    // opnieuw te beslissen.
    const triggers = relevantEntities(options.config);
    const observed = observedEntities(options.config);
    this.#store = new EntityStore(new Set([...triggers, ...observed]), triggers);
    this.#options = {
      config: options.config,
      strategies: options.strategies,
      client: options.client,
      tickSeconds: options.tickSeconds ?? 30,
      debounceMs: options.debounceMs ?? 2_000,
      minIntervalSeconds: options.minIntervalSeconds ?? 15,
      watchdogMinutes: options.watchdogMinutes ?? 10,
      onDecision: options.onDecision ?? ((): void => {}),
      watchdogCheckMs:
        options.watchdogCheckMs ??
        Math.max(30_000, ((options.watchdogMinutes ?? 10) * 60_000) / 3),
      onStall:
        options.onStall ??
        ((idle) => {
          console.error(
            `Geen besluit meer genomen in ${idle.toFixed(1)} minuten. ` +
              'De verbinding met Home Assistant lijkt vast te zitten; ' +
              'afsluiten zodat de omgeving opnieuw kan starten.',
          );
          process.exit(1);
        }),
      logDir: options.logDir ?? null,
      write: options.write ?? ((line: string) => console.log(line)),
      now: options.now ?? (() => Date.now()),
    };
    if (this.#options.logDir != null) {
      this.#historie = new Historieschrijver(
        this.#options.logDir,
        this.#options.now,
        (error) => this.#log(`historie niet weggeschreven: ${String(error)}`),
      );
    }
  }

  start(): void {
    const { client } = this.#options;

    client.on('ready', (states: HaEntityState[]) => {
      this.#store.replaceAll(states);
      // De volledige stand bij elk (her)verbinden: daar begint de replay, en na
      // een onderbreking is dit de enige manier om te weten waar hij verdergaat.
      this.#historie?.vastleggen(
        states.filter((s) => this.#store.isRelevant(s.entity_id)),
      );
      this.#ready = true;
      this.#log(
        `verbonden — ${states.length} entiteiten in Home Assistant, ` +
          `${this.#store.size} daarvan volgen we, ` +
          `${this.#missingEntities().length} ontbreken`,
      );
      for (const missing of this.#missingEntities()) {
        this.#log(`  ontbreekt: ${missing}`);
      }
      this.#lastEvalMs = Number.NEGATIVE_INFINITY;
      void this.#evaluate('verbonden');
    });

    client.on('stateChanged', (state: HaEntityState) => {
      // Alles buiten de klimaatconfiguratie negeren we volledig: geen opslag,
      // geen herberekening, geen logregel.
      if (!this.#store.apply(state)) {
        this.#ignored += 1;
        return;
      }
      // Alles wat we volgen, ook wat geen herberekening waard is: de replay
      // leest dezelfde entiteiten als de vertaling.
      this.#historie?.vastleggen([state]);
      // Wel vastgelegd, maar geen reden om te herrekenen.
      if (!this.#store.isTrigger(state.entity_id)) return;
      if (!this.#ready) return;
      if (this.#debounce) clearTimeout(this.#debounce);
      this.#debounce = setTimeout(() => {
        this.#request('wijziging');
      }, this.#options.debounceMs);
      this.#debounce.unref?.();
    });

    client.on('disconnected', (reason: string) => {
      this.#ready = false;
      this.#log(`verbinding weg (${reason}) — opnieuw verbinden`);
    });

    client.on('error', (error: Error) => {
      this.#log(`fout: ${error.message}`);
    });

    this.#timer = setInterval(() => {
      if (this.#ready) void this.#evaluate('hartslag');
    }, this.#options.tickSeconds * 1_000);


    const watchdogMs = this.#options.watchdogMinutes * 60_000;
    if (watchdogMs > 0) {
      // Op een derde van de bewakingstijd kijken, zodat de melding niet tot een
      // vol venster op zich laat wachten.
      this.#watchdog = setInterval(() => {
        if (this.#lastEvalMs === Number.NEGATIVE_INFINITY) return;
        const idle = this.#options.now() - this.#lastEvalMs;
        if (idle > watchdogMs) {
          this.#options.onStall(idle / 60_000);
        }
      }, this.#options.watchdogCheckMs);
      this.#watchdog.unref?.();
    }

    client.connect();
  }

  /** Belooft dat de historie tot nu toe op schijf staat. */
  historieGereed(): Promise<void> {
    return this.#historie?.gereed() ?? Promise.resolve();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    if (this.#debounce) clearTimeout(this.#debounce);
    if (this.#throttle) clearTimeout(this.#throttle);
    if (this.#watchdog) clearInterval(this.#watchdog);
    this.#options.client.close();
  }

  /**
   * Zet de modus die deze dienst zelf bijhoudt.
   *
   * Alleen zinvol wanneer de configuratie geen `mode` noemt; noemt hij die
   * wel, dan wint Home Assistant en verandert dit niets. Er zit bewust nog
   * geen HTTP-eindpunt op: de weergave is read-only (besluit 23), en daar iets
   * aan veranderen is een eigen besluit waard.
   */
  setMode(mode: Mode | null): void {
    this.#eigen.setMode(mode);
    this.#request('modus');
  }

  /**
   * Vraagt een evaluatie aan, met inachtneming van de ondergrens. Te vroeg?
   * Dan wordt hij verschoven, niet weggegooid — een wijziging mag nooit
   * verdwijnen, hij mag alleen even wachten.
   */
  #request(trigger: string): void {
    const minMs = this.#options.minIntervalSeconds * 1_000;
    const waited = this.#options.now() - this.#lastEvalMs;
    if (waited >= minMs) {
      void this.#evaluate(trigger);
      return;
    }
    this.#throttled += 1;
    if (this.#throttle) return; // er staat er al een klaar
    this.#throttle = setTimeout(() => {
      this.#throttle = null;
      void this.#evaluate(trigger);
    }, minMs - waited);
    this.#throttle.unref?.();
  }

  /** Meetpunten uit de configuratie die HA niet blijkt te kennen. */
  #missingEntities(): string[] {
    const needed = new Set<string>();
    for (const ref of this.#options.config.criticalInputs) needed.add(ref.id);
    for (const zone of this.#options.config.zones) needed.add(zone.temperature.id);
    for (const actuator of this.#options.config.actuators) {
      needed.add(actuator.ref.id);
      if (actuator.power.sensor) needed.add(actuator.power.sensor.id);
    }
    return [...needed].filter((id) => !this.#store.has(id)).sort();
  }

  async #evaluate(trigger: string): Promise<void> {
    const nowMs = this.#options.now();
    this.#lastEvalMs = nowMs;
    const config = configFrom(this.#options.config, this.#store);
    const state = buildSystemState(
      config,
      this.#store,
      nowMs,
      this.#eigen,
      this.#schaduwApparaten,
    );
    const decision = decide({
      config,
      state,
      strategies: this.#options.strategies,
    });

    /*
     * De timercommando's uitvoeren.
     *
     * Dit is geen schakelen: er gaat niets naar Home Assistant (besluit 15).
     * De kern vraagt met een commando om een timer, en tot nu toe beantwoordde
     * het oude systeem die vraag door zijn eigen `timer.pv_stabilisatie` te
     * starten. Zonder dat systeem blijft de vraag onbeantwoord en zou de
     * stabilisatie nooit aanslaan — dus beantwoorden we hem zelf.
     *
     * Ná het besluit en niet ervoor: de timer die de arbiter zojuist aanvroeg
     * hoort pas bij de vólgende evaluatie te gelden.
     */
    this.#eigen.apply(decision.commands, nowMs);
    // En de veronderstelde stand van de apparaten (besluit 49, 49b): de
    // commando's erop toepassen, of loslaten zolang de bewoner stuurt. Ook ná
    // het besluit, en om dezelfde reden: wat de arbiter zojuist gestuurd zou
    // hebben, geldt pas bij de vólgende evaluatie.
    this.#schaduwApparaten.volg(decision);

    this.#ticks += 1;
    await this.#record(decision, trigger);
  }

  /**
   * Wat de apparaten op dit moment werkelijk doen, kort genoteerd.
   *
   * Dit is de grondwaarheid waartegen de divergentietool het besluit afzet. Door
   * het hier vast te leggen — op precies het moment dat de arbiter besluit —
   * heeft die tool later geen verbinding met Home Assistant nodig, geen token,
   * en geen last van de bewaartermijn van de recorder.
   */
  #observation(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const actuator of this.#options.config.actuators) {
      const s = this.#store.state(actuator.ref.id);
      if (s == null) {
        out[actuator.id] = 'onbekend';
        continue;
      }
      const setpoint = this.#store.attrNumber(actuator.ref.id, 'temperature');
      out[actuator.id] = setpoint == null ? s : `${s}@${setpoint}`;
    }
    return out;
  }

  async #record(decision: Decision, trigger: string): Promise<void> {
    const key = commandKey(decision.commands);
    const changed = key !== this.#lastKey;
    this.#lastKey = key;

    const e = decision.explanation;
    const time = new Date(decision.atMs).toLocaleTimeString('nl-NL');

    // Alleen loggen wanneer het besluit verandert. Anders staat er elke dertig
    // seconden hetzelfde, en verdwijnt het interessante in de ruis.
    if (changed) {
      const budget =
        `budget ${Math.round(e.budget.allocatedW)}/${Math.round(e.budget.availableW)} W` +
        ` (overschot ${Math.round(e.budget.surplusW)})`;
      this.#log(
        `${time}  ${e.mode.padEnd(14)} ${budget}` +
          (e.failsafe.active ? `  FAILSAFE: ${e.failsafe.unreliable.join(', ')}` : ''),
      );

      if (decision.commands.length === 0) {
        this.#log('          zou niets wijzigen');
      } else {
        for (const command of decision.commands) {
          this.#log(`          zou sturen: ${describe(command)}`);
        }
      }

      const blocked = decision.rejected.filter(
        (r) => r.blockedBy !== 'no_change_needed',
      );
      for (const r of blocked.slice(0, 4)) {
        this.#log(
          `          geblokkeerd: ${r.intent.actuatorId} ${r.intent.action}` +
            ` — ${r.blockedBy}${r.detail ? ` (${r.detail})` : ''}`,
        );
      }
    }

    const observed = this.#observation();
    const legacyRef = this.#options.config.migration?.legacyExplanation;
    const legacy = legacyRef ? this.#store.state(legacyRef.id) : null;

    // De weergave krijgt élk besluit, ook wanneer er niets wijzigde: de
    // temperaturen en het budget lopen door, en een dashboard dat pas
    // bijwerkt als de arbiter van gedachten verandert lijkt vastgelopen.
    // Het logboek doet het omgekeerde, en met reden — zie hieronder.
    this.#latest = {
      atMs: decision.atMs,
      trigger,
      changed,
      explanation: e,
      commands: decision.commands,
      accepted: decision.accepted,
      rejected: decision.rejected,
      observed,
      legacy,
    };
    // Een kapotte luisteraar mag de opname niet meeslepen. De schaduwmodus
    // draait maanden onbewaakt; het logboek is het product, de weergave niet.
    try {
      this.#options.onDecision(this.#latest);
    } catch (error) {
      this.#log(`  weergave gaf een fout door: ${String(error)}`);
    }

    if (this.#options.logDir == null) return;

    // Volledig record alleen wanneer het besluit verandert; anders een korte
    // regel met de meetwaarden. `zones` en `accepted` zijn samen tweederde van
    // een record en staan juist stil zolang er niets gebeurt — die elke dertig
    // seconden herhalen levert een logboek op waar de gebeurtenissen in
    // verdrinken.
    // De uitleg van het oude systeem alleen schrijven als hij wijzigt; hij is
    // lang en verandert een paar keer per uur. De lezer draagt hem voort.
    const legacyChanged = legacy !== this.#lastLegacy;
    this.#lastLegacy = legacy;

    const record = changed
      ? {
          t: decision.atMs,
          trigger,
          changed: true as const,
          mode: e.mode,
          modeSource: e.modeSource,
          occupied: e.occupied,
          budget: e.budget,
          buitenC: e.outdoorTemperatureC,
          zonW: e.solarProductionW,
          failsafe: e.failsafe,
          zones: e.perZone,
          commands: decision.commands,
          accepted: decision.accepted,
          rejected: decision.rejected,
          obs: observed,
          ...(legacy != null ? { legacy } : {}),
        }
      : {
          t: decision.atMs,
          changed: false as const,
          mode: e.mode,
          budget: e.budget,
          // Ook op korte records: de buitentemperatuur beweegt de hele dag door
          // en juist dat verloop is wat fase 7 nodig heeft. Hem alleen bij een
          // besluitwijziging opschrijven zou een dataset opleveren met gaten van
          // uren — precies waar de arbiter het rustigst is.
          buitenC: e.outdoorTemperatureC,
          zonW: e.solarProductionW,
          // Genoeg om de temperatuurgang te volgen zonder doelen en redenen te
          // herhalen: die staan in het laatste volledige record ervoor.
          // Ook hier de luchtvochtigheid: net als bij de buitentemperatuur is
          // juist het verloop over de dag wat een dataset bruikbaar maakt.
          zonesT: e.perZone.map((z) => [z.zoneId, z.temperatureC, z.demand, z.humidityPct]),
          obs: observed,
          ...(legacyChanged && legacy != null ? { legacy } : {}),
          ...(e.failsafe.active ? { failsafe: e.failsafe } : {}),
        };

    const day = new Date(decision.atMs).toISOString().slice(0, 10);
    const file = join(this.#options.logDir, `decisions-${day}.ndjson`);
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(record)}\n`, 'utf-8');
  }

  /** Het laatste besluit, of null zolang er nog niet is gerekend. */
  get latest(): LiveSnapshot | null {
    return this.#latest;
  }

  /** Cijfers over wat de filter tegenhoudt, voor de opstartregel en tests. */
  get stats(): {
    evaluations: number;
    ignoredEvents: number;
    throttledRequests: number;
  } {
    return {
      evaluations: this.#ticks,
      ignoredEvents: this.#ignored,
      throttledRequests: this.#throttled,
    };
  }

  #log(line: string): void {
    this.#options.write(line);
  }
}
