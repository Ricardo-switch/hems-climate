/**
 * De gedeelde context van de webserver (besluit 180, verder geknipt op
 * 23 oktober 2026): de opties, de toegang, wie er kijkt, de live-verbinding en
 * de caches. De routes per onderwerp (`routes/`) krijgen hem mee als `d`; zo
 * staan ze in eigen bestanden zonder dat er iets aan hun werking verandert.
 */

import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Geometry, SiteConfig } from '../core/model.js';
import type { LiveSnapshot } from '../adapters/homeassistant/shadow.js';
import { TodayCache } from './today.js';
import { SolarHistory, learnSolar } from './solar-learn.js';
import type { YieldReport } from './yield.js';
import { LANGS } from './assistant.js';
import type { Lang } from './assistant.js';
import type { Punt } from './kaart.js';
import { bedienbaar, type Bedienbaar } from './opdracht.js';
import { residentView, type ResidentView } from './resident.js';
import { zonNuVan } from './assistant.js';
import { sunPosition } from '../core/sun.js';
import { weatherReport, type WeatherReport } from './weather.js';
import { kindOfCode } from './open-meteo.js';
import { SESSION_COOKIE, cookieValue, ingressVisitor, type Access, type Visitor } from './auth.js';
import type { Wie } from './bewoners.js';
import { LiveStroom } from './live.js';
import type { WebOptions } from './server-opties.js';

export interface Verzoek {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly url: URL;
  readonly path: string;
  readonly method: string;
  readonly access: Access;
}

/**
 * De taal van de pagina (besluit 185): `?taal=` of de kop `x-taal`, die de app
 * meestuurt. Niet Accept-Language: die zet de browser zelf, en dan zou de
 * uitleg wisselen met de taal van de telefoon in plaats van die van de app.
 */
export function taalVan(x: unknown): Lang {
  const t = Array.isArray(x) ? x[0] : x;
  return typeof t === 'string' && (LANGS as readonly string[]).includes(t) ? (t as Lang) : 'nl';
}

export class Diensten {
  readonly options: WebOptions & { host: string; write: (line: string) => void };
  readonly live: LiveStroom;
  /** De toegang van een verzoek op de eigen poort; de rest volgt `access`. */
  readonly toegang = new WeakMap<IncomingMessage, Access>();
  /** Het adres van de eigen poort in Tailscale, zodra iemand het gebruikte; null tot dan. */
  eigenAdres: string | null = null;
  today: TodayCache | null = null;
  /** Het weerrapport, tien minuten vastgehouden: vijf dagen zon uitrekenen kost wat. */
  weather: { atMs: number; report: WeatherReport; geometry: Geometry } | null = null;
  solar: SolarHistory | null = null;

  constructor(options: WebOptions) {
    this.options = {
      ...options,
      host: options.host ?? '0.0.0.0',
      write: options.write ?? ((line) => console.log(line)),
    };
    this.live = new LiveStroom({
      laatste: () => this.options.latest(),
      metBewoner: (snapshot, taal) => this.withResident(snapshot, taalVan(taal)),
      huis: () => this.options.house?.() ?? null,
    });
  }

  /** De toegang voor dit verzoek: die van de eigen poort, of anders die van de dienst. */
  access(req: IncomingMessage): Access {
    return this.toegang.get(req) ?? this.options.access;
  }

  /** Inlogpogingen die onderweg zijn: de waarde voor Home Assistant, met de terugweg. */
  readonly pending = new Map<string, { terug: string; untilMs: number }>();

  /**
   * Opbrengst per periode, bewaard (besluit 125). Een afgelopen periode
   * verandert niet meer: die blijft tot de meters of prijzen veranderen. De
   * lopende periode komt meteen uit de bewaarde, en wordt op de achtergrond
   * opnieuw uitgerekend als hij ouder is dan twee minuten. De sleutel is het
   * begin van de periode, zodat elke datum in hetzelfde jaar hetzelfde vindt.
   */
  readonly yieldCache = new Map<string, { atMs: number; report: YieldReport }>();
  readonly yieldBusy = new Map<string, Promise<YieldReport | null>>();

  /** Wie er kijkt (besluit 147): het account, of het een beheerder is, en de naam. Een gast is nooit beheerder. */
  async wie(req: IncomingMessage): Promise<Wie & { readonly naam: string }> {
    const access = this.access(req);
    if (access.kind === 'open') return { userId: null, beheerder: true, naam: '' };
    const v = await this.bezoeker(req);
    const gast = this.options.bewoners?.gast?.(v?.userId ?? null).gast === true;
    return { userId: v?.userId ?? null, beheerder: v?.rol === 'beheerder' && !gast, naam: v?.naam ?? '' };
  }

  /** Is wie er kijkt de hoofdgebruiker (besluit 151)? Zonder inlog (alleen in tests) mag alles. */
  async hoofd(req: IncomingMessage): Promise<boolean> {
    if (this.access(req).kind === 'open') return true;
    return this.options.gegevens?.hoofd(await this.wie(req)) === true;
  }

  /** Of wie er kijkt een gast is, en thuis (besluit 147). */
  async gast(req: IncomingMessage): Promise<{ readonly gast: boolean; readonly thuis: boolean | null } | null> {
    if (this.access(req).kind === 'open' || this.options.bewoners?.gast == null) return null;
    const v = await this.bezoeker(req);
    return this.options.bewoners.gast(v?.userId ?? null);
  }

  /** Wie er kijkt: bij een eigen inlog de sessie, achter Ingress Home Assistant (besluit 161). Zonder inlog niemand. */
  async bezoeker(req: IncomingMessage): Promise<Visitor | null> {
    const access = this.access(req);
    if (access.kind === 'sessions') return access.store.visitor(cookieValue(req, SESSION_COOKIE));
    if (access.kind === 'ingress') return ingressVisitor(req, access.beheerders);
    return null;
  }

  /** Een vraag van de assistent van Home Assistant met de juiste sleutel (besluit 147). */
  metSleutel(req: IncomingMessage, url: URL, path: string): boolean {
    const sleutel = this.options.sleutel;
    // De vragen, en de kamers voor de zinnen van de integratie (besluit 184).
    if (sleutel == null || (path !== '/api/vraag' && path !== '/api/assist')) return false;
    const kop = String(req.headers.authorization ?? '');
    const gegeven = kop.startsWith('Bearer ') ? kop.slice(7).trim() : (url.searchParams.get('sleutel') ?? '');
    return gegeven.length === sleutel.length && timingSafeEqual(Buffer.from(gegeven), Buffer.from(sleutel));
  }

  /**
   * Het besluit onbewerkt, met het bewonerscontract ernaast (76, 94): per kamer
   * de stand in woorden, uitgerekend in de dienst. De kern blijft wat hij was;
   * de proefomgeving leest `bewoner`, de schaduwweergave de rest.
   */
  withResident(snapshot: LiveSnapshot, taal: Lang = 'nl'): LiveSnapshot & { bewoner?: ResidentView } {
    const config = this.config();
    if (config == null) return snapshot;
    // Waar de zon staat (25 oktober 2026): "wacht op zon" zegt het niet als hij onder is.
    const loc = this.options.location?.() ?? null;
    const zon = loc ? sunPosition(Date.now(), loc.latDeg, loc.lonDeg) : null;
    const metZon = zon ? { ...snapshot, zonNu: zonNuVan(zon.elevationDeg, zon.azimuthDeg) } : snapshot;
    return { ...snapshot, bewoner: residentView(config, metZon, taal) };
  }

  /** De configuratie zoals hij nu is (besluit 130). */
  config(): SiteConfig | null {
    return this.options.configNow?.() ?? this.options.config;
  }

  /**
   * Het weer van de komende dagen (besluit 105), tien minuten vastgehouden. Bewaart
   * meteen wat er voor morgen verwacht wordt, zodat het huis die verwachting na
   * die dag naast de werkelijke opbrengst kan leggen; main roept dit daarom elke
   * tien minuten aan, ook als niemand kijkt.
   */

  async weatherNow(): Promise<WeatherReport | { wachten: string }> {
    const config = this.config();
    const location = this.options.location?.() ?? null;
    const weather = this.options.weather;
    const logDir = this.options.logDir;
    if (weather == null || config?.geometry == null || location == null || logDir == null) {
      return { wachten: 'het weer komt zodra de ligging van het huis en de panelen bekend zijn' };
    }
    const now = Date.now();
    // Een andere ligging (besluit 157) rekent meteen opnieuw.
    if (this.weather != null && now - this.weather.atMs < 10 * 60_000 && this.weather.geometry === config.geometry) return this.weather.report;
    const forecast = weather.forecast();
    if (forecast.length === 0) return { wachten: 'er is nog geen weerverwachting; kies een weerbron bij Functies' };
    this.solar ??= new SolarHistory({ logDir });
    this.today ??= new TodayCache(logDir, config);
    try {
      await this.solar.refresh();
    } catch {
      // Dan met wat er al was.
    }
    await weather.log.load();
    const todayWh = await this.today.get().then(
      (t) => t.zonWh,
      () => 0,
    );
    const report = weatherReport({
      forecast,
      predicted: weather.log.current,
      expected: weather.log.expected,
      solarDays: this.solar.current,
      geometry: config.geometry,
      location,
      learned: learnSolar(this.solar.current, config.geometry, location),
      todayWh,
      nowMs: now,
      timeZone: config.timezone,
      ...(weather.bron ? { bron: weather.bron() } : {}),
      ...(weather.uren ? { uren: weather.uren(), soortVanCode: kindOfCode } : {}),
    });
    this.weather = { atMs: now, report, geometry: config.geometry };
    const morgen = report.dagen[0];
    if (morgen?.zonkansPct != null && morgen.verwachtKwh != null && morgen.kwartieren) {
      await weather.log.note(morgen.datum, morgen.zonkansPct, { kwh: morgen.verwachtKwh, kwartieren: morgen.kwartieren.map((q) => q.verwachtW) }).catch(() => {
        // Niet bewaard: de volgende keer opnieuw.
      });
    }
    return report;
  }

  /** Wat de assistent nu mag bedienen (besluit 148): dezelfde grenzen als de knoppen. */
  bedienbaar(): Bedienbaar {
    const licht = this.lichtMag();
    return bedienbaar(this.options.house?.() ?? null, { licht, scenes: licht && this.options.lights?.scenesEnabled === true, schermen: this.schermMag() });
  }

  /** Schermen bedienen: de installatie staat het toe, en het staat aan bij Functies (besluit 121). */
  schermMag(): boolean {
    return this.options.covers != null && (this.options.schermenAan?.() ?? true);
  }

  /** Licht bedienen: de installatie staat het toe, en de bewoner heeft het aan (besluit 111). */
  lichtMag(): boolean {
    return this.options.lights != null && (this.options.lichtAan?.() ?? true);
  }

  /** Wat de kaart zei, per ligging, een dag lang: OpenStreetMap is van iedereen. */
  kaart = new Map<string, { at: number; omtrek: readonly Punt[] | null }>();

  /** Hoeveel live-beelden er nu lopen; meer dan dit belast Home Assistant en de NAS te veel. */
  liveStreams = 0;
}
