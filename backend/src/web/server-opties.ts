/**
 * Wat de dienst aan de webserver meegeeft (uit server.ts, besluit 180): de
 * versie van het image, en per deur van de weergave waar hij zijn gegevens
 * vandaan haalt. Alleen beschrijvingen; de webserver zelf staat in server.ts.
 */

import { VERSIE } from '../version.js';
import type { Sluipverbruik } from './sluipverbruik.js';
import type { CameraNu } from './cameras.js';
import type { AanzetStand } from './assistent-aan.js';
import type { InHuisStand } from './stem-in-huis.js';
import type { SiteConfig } from '../core/model.js';
import type { LiveSnapshot } from '../adapters/homeassistant/shadow.js';
import type { DivergenceReport } from './divergence.js';
import type { Onboarding } from './onboarding.js';
import type { AnalyseExtra } from './export.js';
import type { Backup } from './gegevens.js';
import type { PowerRow } from './today.js';
import type { FeedbackLog } from './feedback.js';
import type { UitstelStore } from './uitstel.js';
import type { BufferStore } from './warmtebuffers.js';
import type { Profielen, VoorkeurenStore } from './voorkeuren.js';
import type { IntegratieStand } from './integratie.js';
import type { ConnectionStore, ConnectionView, FoundAppliance, FoundPhase } from './aansluiting.js';
import type { EnergySource, EnergyStore } from './energy.js';
import type { Punt } from './kaart.js';
import type { UpdateView } from './bijwerken.js';
import type { KlaarPunt } from './klaarzetten.js';
import type { Vraag } from './taalmodel.js';
import type { Dagtelling } from './brein.js';
import type { LuisterDeur } from './luisterpost.js';
import type { Location } from './sun.js';
import type { ForecastDay, HourColumns, WeatherLog } from './weather.js';
import type { ComfortView } from './comfort.js';
import type { HouseReport } from './house.js';
import type { Lang } from './assistant.js';
import type { Layout, LayoutStore } from './layout.js';
import type { CoverSwitch } from './covers.js';
import type { LightSwitch } from './lights.js';
import type { FunctiesGevonden, FunctiesStore } from './functies.js';
import type { Access } from './auth.js';
import type { BewonersView, Wie } from './bewoners.js';
import type { MeldingenStore } from './meldingen.js';
import type { Stem } from './stem.js';
import type { KlimaatBrug } from './klimaatbrug.js';

/** De versie die het image meekreeg bij het bouwen. */
export interface Version {
  /** Het versienummer (besluit 131), uit de code zelf. */
  readonly nummer: string;
  /** Hoe Smart Climate draait: als add-on in Home Assistant, of op een eigen server. */
  readonly installatie: 'add-on' | 'server';
  /** Korte commit-hash, of `onbekend`. */
  readonly commit: string;
  /** Bouwtijd in ISO 8601, of null. */
  readonly gebouwd: string | null;
}

export const UNKNOWN_VERSION: Version = { nummer: VERSIE, installatie: 'server', commit: 'onbekend', gebouwd: null };

/**
 * Leest de versie uit de omgeving. Het image zet `HEMS_COMMIT` en `HEMS_GEBOUWD`
 * uit bouwargumenten die `deploy.sh` meegeeft; een lege of ontbrekende waarde
 * betekent dat niemand ze meegaf.
 */
export function versionFromEnv(env: NodeJS.ProcessEnv): Version {
  const commit = env['HEMS_COMMIT']?.trim();
  const built = env['HEMS_GEBOUWD']?.trim();
  return {
    nummer: VERSIE,
    // Een add-on krijgt van de Supervisor een token mee; een eigen server niet.
    installatie: env['SUPERVISOR_TOKEN'] ? 'add-on' : 'server',
    commit: commit && commit !== '' ? commit : UNKNOWN_VERSION.commit,
    gebouwd: built && built !== '' ? built : null,
  };
}

export interface WebOptions {
  /** Poort om op te luisteren. */
  readonly port: number;
  /**
   * Adres om aan te binden. Standaard alle adressen, want in een container is
   * `127.0.0.1` alleen vanuit de container zelf bereikbaar en dan zie je niets.
   */
  readonly host?: string;
  /** Map met de gebouwde frontend. Ontbreekt hij, dan draait de API gewoon. */
  readonly webDir: string;
  /**
   * De configuratie, voor de namen en de eenheden in de weergave.
   *
   * Mag null zijn: bij een verse installatie is er nog niets, en dan is de
   * onboarding het enige wat deze server te bieden heeft.
   */
  readonly config: SiteConfig | null;
  /** De configuratie zoals hij nu is, als comfort uit de app hem verving (besluit 130). */
  readonly configNow?: () => SiteConfig | null;
  /**
   * Comfort uit de app (besluit 130): de temperaturen per kamer en de dagdelen.
   * Zonder dit bestaat de route niet.
   */
  readonly comfort?: {
    /** Het comfort van een bewoner (besluit 147); null is van wie er kijkt, of de hoofdgebruiker. */
    readonly view: (wie: Wie, bewoner: string | null) => ComfortView;
    readonly save: (body: unknown, wie: Wie, bewoner: string | null) => Promise<{ readonly ok: true; readonly view: ComfortView } | { readonly ok: false; readonly status: number; readonly reden: string }>;
  };
  /**
   * Bewoners (besluit 147): wie hier woont, op volgorde, en wat een bewoner
   * aan zichzelf of als hoofdgebruiker aan een ander verandert. `herken` kijkt
   * na het inloggen wie het is: een nieuwe bewoner krijgt het welkom, een
   * account zonder persoon wordt gast (besluit 151), en het eerste account de
   * vraag of het een bewoner of een scherm is.
   */
  readonly bewoners?: {
    readonly view: (wie: Wie) => BewonersView;
    readonly actie: (body: unknown, wie: Wie & { readonly naam: string }) => Promise<{ readonly ok: true; readonly view: BewonersView } | { readonly ok: false; readonly status: number; readonly reden: string }>;
    readonly herken: (account: { readonly userId: string; readonly naam: string }) => Promise<'welkom' | 'vraag' | 'gast' | null>;
    /** Is dit account een gast, en is hij thuis? Een gast kijkt, en bedient alleen thuis. */
    readonly gast?: (userId: string | null) => { readonly gast: boolean; readonly thuis: boolean | null };
  };
  /**
   * Back-up, herstel en opnieuw beginnen (besluit 151), en de export voor de
   * analyse: alleen voor de hoofdgebruiker. Zonder dit bestaan de routes niet,
   * en is de export zoals voorheen.
   */
  readonly gegevens?: {
    /** Is wie er kijkt de hoofdgebruiker? Zolang er niemand woont: een beheerder in Home Assistant. */
    readonly hoofd: (wie: Wie) => boolean;
    readonly backup: () => Promise<Backup>;
    readonly herstel: (body: unknown) => Promise<{ readonly ok: true; readonly bestanden: readonly string[]; readonly configuratie: string } | { readonly ok: false; readonly status: number; readonly reden: string }>;
    readonly opnieuw: () => Promise<{ readonly ok: true; readonly backup: string; readonly weg: readonly string[] } | { readonly ok: false; readonly status: number; readonly reden: string }>;
    /** Gaat de configuratie mee bij opnieuw beginnen? Alleen als de app hem maakte. */
    readonly configWeg: boolean;
    /** De back-ups die de dienst zelf bewaarde, de nieuwste eerst. */
    readonly bewaard: () => Promise<readonly string[]>;
    /** De instellingen en de apparaten voor de export, en welke namen eruit moeten. */
    readonly analyse: () => Promise<AnalyseExtra>;
    /** Stopt de dienst om opnieuw te starten, nadat het antwoord weg is. */
    readonly herstart: () => void;
  };
  /** De sleutel waarmee de assistent van Home Assistant zonder inlog een vraag stelt (besluit 147). */
  readonly sleutel?: string;
  /**
   * Waar Home Assistant die vraag stelt (besluit 177). In de add-on de naam van
   * de add-on in het netwerk van Home Assistant; zonder: het adres waarop de
   * beheerder de app nu opent.
   */
  readonly sleutelAdres?: string;
  /** Wat er in Home Assistant klaarstaat voor de functies van Smart Climate (besluit 179). */
  /** In de taal van de app (besluit 185). */
  readonly klaarzetten?: (lang?: Lang) => Promise<readonly KlaarPunt[]>;
  /** Levert het laatste besluit, of null zolang er nog niet gerekend is. */
  readonly latest: () => LiveSnapshot | null;
  /**
   * Levert de divergentieanalyse over de logboeken, of null.
   *
   * Los van `latest`, want het is een andere waarheid: `latest` is het besluit
   * van dit moment, dit is wat er sinds het begin van de opname is gebeurd.
   * Weglaten mag — dan is er geen analyse en zegt het eindpunt dat ook.
   */
  readonly divergence?: () => DivergenceReport | null;
  /**
   * Waar de dagbestanden staan, voor de export.
   *
   * Weglaten betekent: geen exportknop. Dat is de stand wanneer er niet
   * gelogd wordt — dan valt er ook niets te downloaden.
   */
  readonly logDir?: string;
  /**
   * De onboarding, of weg wanneer die niet mag.
   *
   * Aanwezigheid is de schakelaar. Deze server accepteert alleen een POST
   * wanneer dit is meegegeven, en `main.ts` geeft het alleen mee wanneer we
   * achter Ingress draaien. Zie besluit 42.
   */
  readonly onboarding?: Onboarding;
  /**
   * Het huis uit Home Assistant zolang er geen configuratie is, voor het welkom
   * (besluit 154). Gaat mee in het antwoord van `api/onboarding`.
   */
  readonly welkomHuis?: () => HouseReport | null;
  /**
   * Het vermogen van de panelen en het net per vijf minuten uit de statistiek
   * van Home Assistant, voor de kwartieren van Vandaag die het eigen logboek
   * nog niet heeft (17 oktober 2026). Null als die statistiek er niet is.
   */
  readonly historie?: (vanMs: number, totMs: number) => Promise<{ zon: readonly PowerRow[]; net: readonly PowerRow[] } | null>;
  /** Het sluipverbruik (besluit 192): de nachten uit de statistiek van Home Assistant. */
  readonly sluipverbruik?: Sluipverbruik;
  /**
   * Na het opslaan van de configuratie: opnieuw starten, zodat de regeling
   * hem leest (besluit 154). De add-on start dan vanzelf weer (besluit 151).
   */
  readonly naOnboarding?: () => void;
  /**
   * Gevoel en toelichting van de bewoner (besluit 84), of weg wanneer die niet
   * mogen. Zelfde schakelaar als de onboarding: zonder dit object bestaat de
   * route niet, en staat de muur er ook voor `/api/gevoel`.
   */
  readonly feedback?: FeedbackLog;
  /** "Klaar voor" bij de droger (besluit 101); zonder dit bestaat de route niet. */
  readonly uitstel?: UitstelStore;
  /** Klaar om bij de boiler en de jacuzzi (besluit 186): alleen naar `warmtebuffers.json`. */
  readonly buffers?: BufferStore;
  /** Meldingen in de app (besluit 136): wat aandacht vraagt, en Eerder. */
  readonly meldingen?: MeldingenStore;
  /** Thuis naar eigen smaak (besluit 162): kaarten en favorieten per account, en de wand. */
  readonly voorkeuren?: VoorkeurenStore;
  /**
   * De deurbel als kaart op Thuis (besluit 182): het beeld, de naam, wanneer
   * er het laatst werd aangebeld, en de andere beelden van dezelfde camera voor
   * als het gekozen beeld niets geeft; null zonder deurbel.
   */
  /** De telefoons met de app van Home Assistant (besluit 183); `eigen`: aan de persoon van wie kijkt. */
  readonly telefoons?: (userId: string | null) => readonly { readonly id: string; readonly naam: string; readonly eigen: boolean }[];
  /** Een proefmelding naar je eigen telefoon (besluit 183). */
  readonly proefmelding?: (userId: string | null) => Promise<{ readonly ok: true; readonly naam: string } | { readonly ok: false; readonly status: number; readonly reden: string }>;
  /**
   * De integratie neerzetten vanuit de add-on (besluit 184): hoe hij erbij
   * staat, met de versie die Home Assistant nu geladen heeft, en neerzetten.
   */
  readonly integratie?: {
    readonly stand: () => Promise<IntegratieStand & { readonly geladen: string | null; readonly toegevoegd: boolean | null }>;
    readonly zetNeer: () => Promise<{ readonly ok: true; readonly stand: IntegratieStand } | { readonly ok: false; readonly reden: string }>;
    /** De assistent met één knop (besluit 202): neerzetten, herstarten en toevoegen; alleen in de add-on. */
    readonly aanzetten?: { readonly stand: () => AanzetStand; readonly start: () => void };
  };
  /** Helemaal in huis (besluit 203): Whisper, Piper en openWakeWord, en de spraakassistent maken; alleen in de add-on. */
  readonly stemInHuis?: { readonly stand: () => Promise<InHuisStand>; readonly start: (lang: Lang) => void };
  readonly deurbel?: () => { readonly camera: string; readonly naam: string; readonly laatsteMs: number | null; readonly reserve?: readonly string[] } | null;
  /**
   * De kaart Camera's (besluit 201): elke camera die het huis toont, met wat hij
   * nu ziet of wanneer het laatst; de deurbel met wanneer er werd aangebeld.
   */
  readonly cameras?: () => readonly CameraNu[];
  /**
   * Het profiel (besluit 181): de bewoners op volgorde en wiens comfort geldt,
   * en of een account een scherm is. Zonder dit is de wand van het huis.
   */
  readonly profielen?: (userId: string | null) => { readonly profielen: Profielen; readonly scherm: boolean };
  /**
   * Opbrengst (besluit 102): de meters en prijzen van de app, en de statistiek
   * van Home Assistant om ze mee te lezen. Zonder dit geen terugblik.
   */
  readonly energy?: { readonly store: EnergyStore; readonly source: EnergySource };
  /** De map met scèneplaatjes van de bewoner (scene-pictures.ts); zonder dit geen route. */
  readonly scenePicturesDir?: string;
  /**
   * De zon en je aansluiting (besluit 103): antwoorden naar een eigen bestand
   * naast de dataset. Zonder dit bestaat de route niet.
   */
  readonly connection?: {
    readonly store: ConnectionStore;
    /** In de taal van de app (besluit 185): de ligging van de panelen staat erin in woorden. */
    readonly view: (lang?: Lang) => ConnectionView;
    readonly found: () => { readonly fasen: readonly FoundPhase[]; readonly apparaten: readonly FoundAppliance[] };
  };
  /**
   * Het weer van de komende dagen (besluit 105): de verwachting van Buienradar
   * uit Home Assistant, en de zonkans per dag zoals die de dag ervoor werd
   * verwacht. Zonder dit bestaat de route niet.
   */
  readonly weather?: {
    readonly forecast: () => readonly ForecastDay[];
    readonly log: WeatherLog;
    readonly bron?: () => string;
    /** Het weer per uur van Open-Meteo (besluit 128), of null. */
    readonly uren?: () => HourColumns | null;
  };
  /**
   * De camera's bekijken (besluit 106): alleen lezen, via de proxy van Home
   * Assistant, en alleen met inlog. `ids` zijn de camera's die het huis toont.
   */
  readonly camera?: { readonly base: string; readonly token: string; readonly ids: () => ReadonlySet<string> };
  /** De stem van het huis (besluit 141): Piper in Home Assistant. Zonder dit zegt de assistent niets hardop. */
  readonly stem?: Stem;
  /**
   * Camera's en de deurbel als instelling (besluit 109): wat er gevonden is, en
   * wat de bewoner vastlegde. Zonder dit bestaat `/api/functies` niet.
   */
  readonly functies?: { readonly store: FunctiesStore; readonly gevonden: () => FunctiesGevonden | null };
  /**
   * Of de bewoner licht bedienen in de app aan heeft staan (besluit 111). Kan
   * alleen iets uitzetten: zonder `lights` (HEMS_LIGHTS) is er niets aan te zetten.
   */
  readonly lichtAan?: () => boolean;
  /** Schermen bedienen staat aan bij Functies (besluit 121); weg is aan. */
  readonly schermenAan?: () => boolean;
  /**
   * Praten met je huis (besluit 148): de AI-taak die de bewoner bij Functies
   * koos, als functie die om een tekst vraagt, of null (uit). `proef` vraagt een
   * bepaalde AI-taak, voor "Nog een keer proberen". `bedienen`: of de assistent
   * licht en schermen mag bedienen met een zin. Weg: geen taalmodel, wel
   * bedienen met de woordzoeker.
   */
  readonly praten?: {
    readonly model: () => Vraag | null;
    readonly proef: (entityId: string) => Vraag;
    /** De pauze na een fout van deze AI-taak, zoals een op gebruik: tot wanneer, en waarom. */
    readonly pauze?: (entityId: string) => { readonly tot: number; readonly reden: string } | null;
    readonly bedienen: () => boolean;
    /** Hoeveel vragen er per dag naar het model gingen en hoe snel (besluit 213), nieuwste dag eerst. */
    readonly teller?: () => Promise<readonly Dagtelling[]>;
    /** Of eigen woorden nu lonen, of dat het model te traag is (29 oktober 2026); weg is altijd. */
    readonly eigenWoorden?: () => boolean;
  };
  /**
   * Praten met je stem (besluit 150): geluid van de pagina via `/api/luister`
   * naar Home Assistant, dat het wekwoord hoort en uitschrijft. Weg: geen
   * microfoon.
   */
  readonly luisteren?: LuisterDeur;
  /**
   * Welke code er draait (besluit 54). Komt uit het image; zie `versionFromEnv`.
   *
   * Zonder dit moest "draait de nieuwe versie al?" worden afgeleid uit
   * herstarts in het logboek. Weglaten geeft `onbekend`, en dat is ook een
   * antwoord: dan is het image gebouwd zonder dat iemand het zei.
   */
  readonly version?: Version;
  /**
   * De ligging van het huis op één decimaal, of null zolang Home Assistant hem
   * niet gaf. Alleen voor de stand van de zon (besluit 93).
   */
  readonly location?: () => Location | null;
  /** De omtrek van het huis op de kaart (21 oktober 2026); anders OpenStreetMap. Voor de tests. */
  readonly omtrek?: (latDeg: number, lonDeg: number) => Promise<readonly Punt[] | null>;
  /**
   * Bijwerken vanuit de app (21 oktober 2026): wat er klaarstaat en wat er nieuw
   * is, en de add-on bijwerken. Alleen in de add-on.
   */
  readonly bijwerken?: { readonly view: (magBijwerken: boolean, lang?: Lang) => Promise<UpdateView>; readonly installeer: () => Promise<{ readonly ok: boolean; readonly reden?: string }> };
  /**
   * Het huis als navigatie: etages, ruimtes en de apparaten erin (ONTWERP §4),
   * of null zolang de registers van Home Assistant nog niet gelezen zijn.
   */
  /** Het huis, met de stand in woorden in de gevraagde taal (besluit 185); zonder taal Nederlands. */
  readonly house?: (lang?: Lang) => HouseReport | null;
  /**
   * De indeling van het huis (besluit 96), of weg wanneer die niet mag. Zelfde
   * schakelaar als het gevoel: zonder dit object bestaat de route niet, en staat
   * de muur er ook voor `/api/indeling`.
   */
  readonly layout?: {
    readonly store: LayoutStore;
    /** Het voorstel uit Home Assistant, of null zolang de registers niet gelezen zijn. */
    readonly proposal: () => Layout | null;
  };
  /**
   * Licht bedienen (besluit 97), of weg wanneer dat niet mag. Zelfde schakelaar
   * als de indeling: zonder dit object bestaat de route niet, en staat de muur er
   * ook voor `/api/licht`.
   */
  readonly lights?: LightSwitch;
  /** Schermen bedienen voor de bewoner (besluit 121); weg als de installatie het niet toestaat. */
  readonly covers?: CoverSwitch;
  /**
   * De klimaatbrug (besluit 210): de knoppen van het oude systeem, tot stap B.
   * Alleen in de add-on; `aan` is de schakelaar bij Functies › Praten.
   */
  readonly klimaat?: { readonly brug: KlimaatBrug; readonly aan: () => boolean };
  /** De spraak naar tekst in huis waarmee de dienst verstaat (besluit 211), of null. */
  readonly verstaanInHuis?: () => string | null;
  /**
   * Wie mag bedienen (besluit 99): een eigen inlog via Home Assistant, Ingress
   * van de add-on, of open (alleen voor tests). Verplicht, zodat een nieuwe
   * opstelling er niet per ongeluk zonder komt te staan.
   */
  readonly access: Access;
  /**
   * Een tweede poort met een eigen inlog (besluit 160), naast Ingress: daar
   * installeer je de app los op de telefoon, via Tailscale. Wat op die poort
   * binnenkomt, krijgt deze toegang en nooit die van Ingress, en alleen als het
   * via Tailscale over https kwam.
   */
  readonly eigenPoort?: { readonly port: number; readonly access: Access };
  /** Waar meldingen naartoe gaan. Standaard de console. */
  readonly write?: (line: string) => void;
}
