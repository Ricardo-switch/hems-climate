/**
 * De onboarding achter de weergave.
 *
 * Fase 6e stap 4. Stap 3 kan een installatie ontdekken, maar het antwoord
 * kwam in de terminal terecht — en wie een add-on installeert opent geen
 * terminal. Hier komt datzelfde voorstel op de pagina, met de twijfelgevallen
 * als keuzes, en wordt het na bevestiging weggeschreven.
 *
 * **Dit is de eerste plek waar de weergave iets schrijft.** Besluit 23 zei dat
 * dat een eigen besluit vraagt; zie besluit 42. De korte versie: schrijven mag
 * alleen wanneer we weten wie het vraagt, en dat weten we alleen achter
 * Ingress. Die grens ligt niet hier maar in `main.ts` — deze module wordt
 * simpelweg niet aangemaakt wanneer hij niet mag bestaan.
 *
 * **Wat er hier níet gebeurt.** De pagina stuurt geen JSON. Ze stuurt
 * antwoorden op vragen die deze kant heeft gesteld, en wat die antwoorden
 * betekenen voor de configuratie staat in `discovery.ts`. Zou de pagina de
 * configuratie zelf samenstellen, dan zou de vorm ervan op twee plekken
 * moeten kloppen — precies wat besluit 29 uit `mapping.ts` heeft gesloopt.
 */

import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  ontdek,
  pasKeuzesToe,
  type Registers,
  type Voorstel,
} from '../adapters/homeassistant/discovery.js';
import { parseSiteConfig } from '../config/schema.js';

export interface OnboardingOpties {
  /** Waar de registers vandaan komen. Async, want dit gaat over de socket. */
  readonly registers: () => Promise<Registers>;
  /** De map waar `<id>.json` terechtkomt. */
  readonly sitesDir: string;
  /** Welke strategieën bestaan, voor de controle. */
  readonly knownStrategies: readonly string[];
}

export type OpslaanResultaat =
  | { readonly ok: true; readonly pad: string }
  | { readonly ok: false; readonly reden: string; readonly problemen: readonly string[] };

export class Onboarding {
  readonly #opties: OnboardingOpties;
  /**
   * Het laatst uitgedeelde voorstel.
   *
   * De antwoorden verwijzen ernaar met een id, dus we moeten weten welke
   * vragen we hebben gesteld. Opnieuw ontdekken bij het opslaan zou kunnen
   * betekenen dat er inmiddels andere vragen zijn — en dan landt een antwoord
   * op de verkeerde vraag.
   */
  #laatste: Voorstel | null = null;

  constructor(opties: OnboardingOpties) {
    this.#opties = opties;
  }

  async voorstel(): Promise<Voorstel> {
    const registers = await this.#opties.registers();
    this.#laatste = ontdek(registers);
    return this.#laatste;
  }

  async opslaan(antwoorden: Readonly<Record<string, string | null>>): Promise<OpslaanResultaat> {
    const voorstel = this.#laatste;
    if (voorstel == null) {
      return {
        ok: false,
        reden: 'Er is nog geen voorstel opgehaald om te bewaren.',
        problemen: [],
      };
    }

    const config = pasKeuzesToe(voorstel, antwoorden);

    // Toetsen vóór schrijven. Een bestand dat de dienst niet kan lezen is
    // erger dan geen bestand: dan start hij niet meer, en de melding komt in
    // een logboek terecht dat niemand openslaat (besluit 33).
    const gecontroleerd = parseSiteConfig(config, {
      knownStrategies: this.#opties.knownStrategies,
    });
    if (!gecontroleerd.ok) {
      return {
        ok: false,
        reden: 'De configuratie is zo niet bruikbaar.',
        problemen: gecontroleerd.problems.map((p) =>
          p.path === '' ? p.message : `${p.path}: ${p.message}`,
        ),
      };
    }

    const naam = String(config['id'] ?? 'installatie');
    const pad = join(this.#opties.sitesDir, `${naam}.json`);

    // Nooit over een bestaande configuratie heen. Wie er al een heeft, heeft
    // daar keuzes in gemaakt die wij niet kunnen terughalen.
    const bestaat = await access(pad).then(
      () => true,
      () => false,
    );
    if (bestaat) {
      return {
        ok: false,
        reden: `${pad} bestaat al; er is niets geschreven.`,
        problemen: ['Verplaats of hernoem dat bestand eerst.'],
      };
    }

    await mkdir(this.#opties.sitesDir, { recursive: true });
    await writeFile(pad, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
    return { ok: true, pad };
  }
}
