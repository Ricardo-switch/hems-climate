/**
 * Klaarzetten in Home Assistant (besluit 179): wat een huis in Home Assistant
 * nodig heeft voor de functies van Smart Climate, en of het er staat. Bij Wat
 * je huis kan, per groep, met waar je het in Home Assistant regelt.
 *
 * Alleen tellen, nooit een entity-ID in de zin (besluit 45). Wat de regeling
 * nodig heeft, is `mist` als het ontbreekt; wat een functie erbij geeft, is
 * `optioneel`.
 */

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { Lang } from './assistant.js';
import type { HouseRegisters } from './house.js';
import type { SpraakKeuze } from './functies.js';

export type KlaarGroep = 'basis' | 'klimaat' | 'energie' | 'bewoners' | 'gemak' | 'praten' | 'wand';

export interface KlaarPunt {
  readonly id: string;
  readonly groep: KlaarGroep;
  readonly titel: string;
  readonly stand: 'klaar' | 'mist' | 'optioneel';
  /** Wat er staat, of wat er nog moet. */
  readonly zin: string;
  /** Waar in Home Assistant, als pad voor de navigatie van Home Assistant, en in woorden. */
  readonly pad: string | null;
  readonly waar: string;
}

export interface KlaarInput {
  /** Of Home Assistant een locatie heeft. */
  readonly locatie: boolean;
  readonly registers: HouseRegisters | null;
  readonly states: ReadonlyMap<string, HaEntityState>;
  /** Of de netmeter in de configuratie een getal geeft. */
  readonly netMeter: boolean;
  /** De zonnesensor: of hij er is, en hoe vaak hij een nieuwe waarde geeft. */
  readonly zon: { readonly heeft: boolean; readonly intervalS: number | null };
  /** Of het Energie-dashboard een netmeter heeft. */
  readonly energieDashboard: boolean;
  readonly apparatenOpZon: number;
  readonly cameras: number;
  readonly deurbel: boolean;
  readonly rookmelders: number;
  readonly spraak: readonly SpraakKeuze[];
  /** De add-on, met of zonder eigen poort in Tailscale (besluit 160). */
  readonly addOn: boolean;
  readonly eigenPoort: boolean;
}

const PAD = {
  algemeen: '/config/general',
  ruimtes: '/config/areas/dashboard',
  personen: '/config/person',
  integraties: '/config/integrations/dashboard',
  energie: '/config/energy',
  spraak: '/config/voice-assistants/assistants',
  addons: '/hassio/dashboard',
} as const;

const telling = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`;

/**
 * De woorden van Klaarzetten, per taal (besluit 185). Engels is Brits; de
 * plekken in Home Assistant heten zoals in de Engelse Home Assistant.
 */
const WOORDEN = {
  nl: {
    waar: {
      algemeen: 'Instellingen › Systeem › Algemeen',
      ruimtes: 'Instellingen › Gebieden, etages en labels',
      personen: 'Instellingen › Personen',
      integraties: 'Instellingen › Apparaten en diensten',
      energie: 'Instellingen › Dashboards › Energie',
      spraak: 'Instellingen › Spraakassistenten',
      addons: 'Instellingen › Add-ons',
    },
    locatie: ['Locatie en tijdzone', 'Home Assistant weet waar het huis staat: voor de zon, het weer en de gevels.', 'Zet de locatie van je huis en de tijdzone.'],
    ruimtes: {
      titel: 'Etages en ruimtes',
      klaar: (ruimtes: number, etages: number) => `${telling(ruimtes, 'ruimte', 'ruimtes')} op ${telling(etages, 'etage', 'etages')}, elk apparaat in zijn ruimte.`,
      geen: 'Maak etages en ruimtes, en zet elk apparaat in zijn ruimte. De app neemt ze over als voorstel.',
      geenEtage: 'Zet de ruimtes op een etage; dan staat het huis goed in de tekening.',
      // In Home Assistant, niet in de app (30 oktober 2026): Inrichten noemde een ander getal voor de kamers van de app.
      zonder: (n: number) => `${telling(n, 'apparaat staat', 'apparaten staan')} in Home Assistant nog in geen ruimte.`,
    },
    personen: {
      titel: 'Een persoon per bewoner',
      klaar: (n: number) => `${telling(n, 'persoon', 'personen')}, elk met een eigen account.`,
      geen: 'Maak een persoon per bewoner, gekoppeld aan een account. Zonder persoon is iemand een gast.',
      zonder: (n: number) => `${telling(n, 'persoon heeft', 'personen hebben')} nog geen account; koppel er een.`,
    },
    telefoon: {
      titel: 'Thuis of weg',
      klaar: (met: number, van: number) => `${met} van ${van} ${van === 1 ? 'persoon wordt' : 'personen worden'} gevolgd, met de app van Home Assistant.`,
      mist: 'Installeer de app van Home Assistant op elke telefoon, met locatie aan. Wie er thuis is, bepaalt het comfort.',
    },
    klimaat: { titel: 'Thermostaten en airco’s', klaar: (n: number) => `${telling(n, 'apparaat', 'apparaten')} voor verwarmen of koelen.`, mist: 'Voeg je thermostaat en airco’s toe in Home Assistant, met hun eigen koppeling.' },
    temperatuur: { titel: 'Temperatuur per kamer', klaar: (n: number) => `${telling(n, 'thermometer', 'thermometers')} in een ruimte.`, mist: 'Een thermometer per kamer, in zijn ruimte, of een thermostaat die de kamertemperatuur meldt.' },
    netmeter: ['De slimme meter', 'De meter geeft wat er van en naar het net gaat.', 'Koppel je slimme meter (P1), liefst lokaal, met het vermogen van en naar het net.'],
    omvormer: {
      titel: 'De omvormer',
      traag: (min: number) => `Gevonden, maar hij meldt maar eens per ${min} minuten. Lokaal gaat sneller.`,
      klaar: 'De opbrengst van je panelen komt binnen.',
      mist: 'Koppel je omvormer, liefst lokaal, voor de opbrengst van nu.',
    },
    energiedashboard: ['Het Energie-dashboard', 'Ingevuld; Opbrengst neemt de meters over.', 'Vul het in; dan neemt Opbrengst je meters en prijzen over.'],
    opzon: { titel: 'Apparaten op zon', klaar: (n: number) => `${telling(n, 'apparaat kan', 'apparaten kunnen')} op zon draaien.`, mist: 'Een droger, wasmachine of vaatwasser met "op afstand starten", zoals via Home Connect, LG ThinQ, SmartThings of Miele. Of een boiler of jacuzzi die Home Assistant kan aanzetten, zoals een Intex via de koppeling Intex Spa.' },
    lampen: { titel: 'Lampen en scènes', klaar: (n: number) => `${telling(n, 'lamp', 'lampen')}.`, mist: 'Lampen in Home Assistant; met Philips Hue ook de kleuren van je scènes.' },
    schermen: { titel: 'Screens en zonneschermen', klaar: (n: number) => `${telling(n, 'scherm', 'schermen')}.`, mist: 'Screens en zonneschermen als scherm in Home Assistant.' },
    cameras: { titel: 'Camera’s en de deurbel', klaar: (n: number, deurbel: boolean) => `${telling(n, 'camera', 'camera’s')}${deurbel ? ', met een deurbel' : ''}.`, mist: 'Camera’s, en een deurbel met een melder, zoals van Reolink, Ring, Nest of UniFi.' },
    rookmelders: { titel: 'Rookmelders', klaar: (n: number) => `${telling(n, 'rookmelder', 'rookmelders')}.`, mist: 'Rookmelders die rook, koolmonoxide of hitte melden.' },
    weer: { titel: 'Een weerbron', klaar: (n: number) => `${telling(n, 'weerdienst', 'weerdiensten')}.`, mist: 'Een weerdienst zoals Buienradar; zonder werkt Open-Meteo ook.' },
    spraak: { titel: 'Een spraakassistent', klaar: (namen: string) => `${namen}, met spraak naar tekst.`, mist: 'Een spraakassistent met spraak naar tekst (Whisper of Home Assistant Cloud) en Piper voor de stem.' },
    wekwoord: {
      titel: 'Het wekwoord',
      heHuis: 'Hé huis staat bij een spraakassistent.',
      bij: (namen: string) => `Een wekwoord staat bij ${namen}.`,
      addOn: 'Herstart de openWakeWord-add-on één keer en kies he_huis bij een spraakassistent; de add-on zette het klaar.',
      mist: 'De openWakeWord-add-on, met een wekwoord bij een spraakassistent.',
    },
    taalmodel: { titel: 'Een taalmodel', klaar: (n: number) => `${telling(n, 'AI-taak', 'AI-taken')}; kies er een bij Instellingen › Assistent › Praten.`, mist: 'Een AI-taak, zoals van OpenAI, Anthropic of Ollama, als de assistent het in eigen woorden mag zeggen.' },
    beweging: { titel: 'Een bewegingsmelder', klaar: (n: number) => `${telling(n, 'melder', 'melders')}; de wand wordt wakker als er iemand langsloopt.`, mist: 'Een bewegingsmelder bij de wand, om hem te wekken.' },
    tailscale: ['Smart Climate op je telefoon', 'De eigen poort staat open; installeer de app bij Functies › Op je startscherm.', 'Met de Tailscale-add-on en de eigen poort zet je Smart Climate als app op je telefoon.'],
  },
  en: {
    waar: {
      algemeen: 'Settings › System › General',
      ruimtes: 'Settings › Areas, labels & zones',
      personen: 'Settings › People',
      integraties: 'Settings › Devices & services',
      energie: 'Settings › Dashboards › Energy',
      spraak: 'Settings › Voice assistants',
      addons: 'Settings › Add-ons',
    },
    locatie: ['Location and time zone', 'Home Assistant knows where the house is: for the sun, the weather and the walls.', 'Set the location of your house and the time zone.'],
    ruimtes: {
      titel: 'Floors and areas',
      klaar: (ruimtes: number, etages: number) => `${telling(ruimtes, 'area', 'areas')} on ${telling(etages, 'floor', 'floors')}, every device in its area.`,
      geen: 'Create floors and areas, and put every device in its area. The app takes them over as a proposal.',
      geenEtage: 'Put the areas on a floor; then the house shows properly in the drawing.',
      zonder: (n: number) => `${telling(n, 'device is', 'devices are')} not in a Home Assistant area yet.`,
    },
    personen: {
      titel: 'A person for each resident',
      klaar: (n: number) => `${telling(n, 'person', 'people')}, each with their own account.`,
      geen: 'Create a person for each resident, linked to an account. Without a person, someone is a guest.',
      zonder: (n: number) => `${telling(n, 'person has', 'people have')} no account yet; link one.`,
    },
    telefoon: {
      titel: 'Home or away',
      klaar: (met: number, van: number) => `${met} of ${van} ${van === 1 ? 'person is' : 'people are'} tracked, with the Home Assistant app.`,
      mist: 'Install the Home Assistant app on every phone, with location on. Who is home decides the comfort.',
    },
    klimaat: { titel: 'Thermostats and air conditioners', klaar: (n: number) => `${telling(n, 'device', 'devices')} for heating or cooling.`, mist: 'Add your thermostat and air conditioners in Home Assistant, each with its own integration.' },
    temperatuur: { titel: 'Temperature per room', klaar: (n: number) => `${telling(n, 'thermometer', 'thermometers')} in an area.`, mist: 'A thermometer per room, in its area, or a thermostat that reports the room temperature.' },
    netmeter: ['The smart meter', 'The meter reports what goes to and from the grid.', 'Connect your smart meter (P1), preferably locally, with the power to and from the grid.'],
    omvormer: {
      titel: 'The inverter',
      traag: (min: number) => `Found, but it only reports once every ${min} minutes. Locally is faster.`,
      klaar: 'The output of your panels is coming in.',
      mist: 'Connect your inverter, preferably locally, for the output right now.',
    },
    energiedashboard: ['The Energy dashboard', 'Filled in; Energy takes over the meters.', 'Fill it in; then Energy takes over your meters and prices.'],
    opzon: { titel: 'Appliances on sun', klaar: (n: number) => `${telling(n, 'appliance can', 'appliances can')} run on sun.`, mist: 'A dryer, washing machine or dishwasher with "remote start", for example through Home Connect, LG ThinQ, SmartThings or Miele. Or a water heater or hot tub that Home Assistant can switch on, such as an Intex through the Intex Spa integration.' },
    lampen: { titel: 'Lights and scenes', klaar: (n: number) => `${telling(n, 'light', 'lights')}.`, mist: 'Lights in Home Assistant; with Philips Hue also the colours of your scenes.' },
    schermen: { titel: 'Screens and awnings', klaar: (n: number) => `${telling(n, 'screen', 'screens')}.`, mist: 'Screens and awnings as a cover in Home Assistant.' },
    cameras: { titel: 'Cameras and the doorbell', klaar: (n: number, deurbel: boolean) => `${telling(n, 'camera', 'cameras')}${deurbel ? ', with a doorbell' : ''}.`, mist: 'Cameras, and a doorbell with a sensor, for example from Reolink, Ring, Nest or UniFi.' },
    rookmelders: { titel: 'Smoke detectors', klaar: (n: number) => `${telling(n, 'smoke detector', 'smoke detectors')}.`, mist: 'Smoke detectors that report smoke, carbon monoxide or heat.' },
    weer: { titel: 'A weather source', klaar: (n: number) => `${telling(n, 'weather service', 'weather services')}.`, mist: 'A weather service such as Buienradar; without one, Open-Meteo works too.' },
    spraak: { titel: 'A voice assistant', klaar: (namen: string) => `${namen}, with speech to text.`, mist: 'A voice assistant with speech to text (Whisper or Home Assistant Cloud) and Piper for the voice.' },
    wekwoord: {
      titel: 'The wake word',
      heHuis: 'Hé huis is set on a voice assistant.',
      bij: (namen: string) => `A wake word is set on ${namen}.`,
      addOn: 'Restart the openWakeWord add-on once and choose he_huis on a voice assistant; the add-on set it up.',
      mist: 'The openWakeWord add-on, with a wake word on a voice assistant.',
    },
    taalmodel: { titel: 'A language model', klaar: (n: number) => `${telling(n, 'AI task', 'AI tasks')}; choose one in Settings › Assistant › Talk to your house.`, mist: 'An AI task, for example from OpenAI, Anthropic or Ollama, if the assistant may put things in its own words.' },
    beweging: { titel: 'A motion sensor', klaar: (n: number) => `${telling(n, 'sensor', 'sensors')}; the wall screen wakes up when someone walks past.`, mist: 'A motion sensor by the wall screen, to wake it.' },
    tailscale: ['Smart Climate on your phone', 'Your own port is open; install the app in Features › On your home screen.', 'With the Tailscale add-on and your own port you put Smart Climate on your phone as an app.'],
  },
} as const satisfies Record<Lang, unknown>;

export function klaarzetten(i: KlaarInput, lang: Lang = 'nl'): KlaarPunt[] {
  const w = WOORDEN[lang];
  const r = i.registers;
  const st = (id: string) => i.states.get(id);
  const actief = (r?.entities ?? []).filter((e) => !e.disabled_by && i.states.has(e.entity_id));
  const van = (domein: string) => actief.filter((e) => e.entity_id.startsWith(`${domein}.`));
  const klasse = (e: { entity_id: string }) => String(st(e.entity_id)?.attributes['device_class'] ?? '');
  const deviceArea = new Map((r?.devices ?? []).map((d) => [d.id, d.area_id]));
  const inRuimte = (e: { area_id?: string | null; device_id?: string | null }) => (e.area_id ?? (e.device_id ? deviceArea.get(e.device_id) : null)) != null;
  const punt = (id: string, groep: KlaarGroep, titel: string, ok: boolean, nodig: boolean, klaar: string, mist: string, pad: keyof typeof PAD | null): KlaarPunt => ({
    id,
    groep,
    titel,
    stand: ok ? 'klaar' : nodig ? 'mist' : 'optioneel',
    zin: ok ? klaar : mist,
    pad: pad ? PAD[pad] : null,
    waar: pad ? w.waar[pad] : '',
  });

  // De basis.
  const etages = r?.floors.length ?? 0;
  const ruimtes = r?.areas.length ?? 0;
  const bedienbaar = [...van('climate'), ...van('light'), ...van('cover')];
  const zonder = bedienbaar.filter((e) => !inRuimte(e)).length;
  const personen = [...i.states.values()].filter((s) => s.entity_id.startsWith('person.'));
  const metAccount = personen.filter((s) => typeof s.attributes['user_id'] === 'string' && s.attributes['user_id'] !== '').length;
  const metTelefoon = personen.filter((s) => Array.isArray(s.attributes['device_trackers']) && (s.attributes['device_trackers'] as unknown[]).length > 0).length;

  // Klimaat.
  const klimaat = van('climate').length;
  const temperaturen = van('sensor').filter((e) => klasse(e) === 'temperature' && inRuimte(e)).length;

  // Gemak en de wand.
  const lampen = van('light').length;
  const schermen = van('cover').length;
  const beweging = van('binary_sensor').filter((e) => ['motion', 'occupancy', 'presence'].includes(klasse(e))).length;
  const weer = van('weather').length;
  const taalmodellen = van('ai_task').length;
  const metStt = i.spraak.filter((s) => s.spraakNaarTekst);
  const metWekwoord = i.spraak.filter((s) => s.wekwoord);
  const heHuis = metWekwoord.some((s) => s.wekwoord === 'he_huis');

  return [
    punt('locatie', 'basis', w.locatie[0], i.locatie, true, w.locatie[1], w.locatie[2], 'algemeen'),
    punt(
      'ruimtes', 'basis', w.ruimtes.titel, etages > 0 && ruimtes > 0 && zonder === 0, true,
      w.ruimtes.klaar(ruimtes, etages),
      ruimtes === 0 ? w.ruimtes.geen : etages === 0 ? w.ruimtes.geenEtage : w.ruimtes.zonder(zonder),
      'ruimtes',
    ),
    punt(
      'personen', 'bewoners', w.personen.titel, personen.length > 0 && metAccount === personen.length, true,
      w.personen.klaar(personen.length),
      personen.length === 0 ? w.personen.geen : w.personen.zonder(personen.length - metAccount),
      'personen',
    ),
    punt('telefoon', 'bewoners', w.telefoon.titel, metTelefoon > 0, true, w.telefoon.klaar(metTelefoon, personen.length), w.telefoon.mist, 'personen'),
    punt('klimaat', 'klimaat', w.klimaat.titel, klimaat > 0, true, w.klimaat.klaar(klimaat), w.klimaat.mist, 'integraties'),
    punt('temperatuur', 'klimaat', w.temperatuur.titel, temperaturen > 0, true, w.temperatuur.klaar(temperaturen), w.temperatuur.mist, 'ruimtes'),
    punt('netmeter', 'energie', w.netmeter[0], i.netMeter, true, w.netmeter[1], w.netmeter[2], 'integraties'),
    punt(
      'omvormer', 'energie', w.omvormer.titel, i.zon.heeft, false,
      i.zon.intervalS != null && i.zon.intervalS > 120 ? w.omvormer.traag(Math.round(i.zon.intervalS / 60)) : w.omvormer.klaar,
      w.omvormer.mist,
      'integraties',
    ),
    punt('energiedashboard', 'energie', w.energiedashboard[0], i.energieDashboard, false, w.energiedashboard[1], w.energiedashboard[2], 'energie'),
    punt('opzon', 'energie', w.opzon.titel, i.apparatenOpZon > 0, false, w.opzon.klaar(i.apparatenOpZon), w.opzon.mist, 'integraties'),
    punt('lampen', 'gemak', w.lampen.titel, lampen > 0, false, w.lampen.klaar(lampen), w.lampen.mist, 'integraties'),
    punt('schermen', 'gemak', w.schermen.titel, schermen > 0, false, w.schermen.klaar(schermen), w.schermen.mist, 'integraties'),
    punt('cameras', 'gemak', w.cameras.titel, i.cameras > 0, false, w.cameras.klaar(i.cameras, i.deurbel), w.cameras.mist, 'integraties'),
    punt('rookmelders', 'gemak', w.rookmelders.titel, i.rookmelders > 0, false, w.rookmelders.klaar(i.rookmelders), w.rookmelders.mist, 'integraties'),
    punt('weer', 'gemak', w.weer.titel, weer > 0, false, w.weer.klaar(weer), w.weer.mist, 'integraties'),
    punt('spraak', 'praten', w.spraak.titel, metStt.length > 0, false, w.spraak.klaar(metStt.map((s) => s.naam).join(', ')), w.spraak.mist, 'spraak'),
    punt(
      'wekwoord', 'praten', w.wekwoord.titel, metWekwoord.length > 0, false,
      heHuis ? w.wekwoord.heHuis : w.wekwoord.bij(metWekwoord.map((s) => s.naam).join(', ')),
      i.addOn ? w.wekwoord.addOn : w.wekwoord.mist,
      'spraak',
    ),
    punt('taalmodel', 'praten', w.taalmodel.titel, taalmodellen > 0, false, w.taalmodel.klaar(taalmodellen), w.taalmodel.mist, 'integraties'),
    punt('beweging', 'wand', w.beweging.titel, beweging > 0, false, w.beweging.klaar(beweging), w.beweging.mist, 'integraties'),
    ...(i.addOn ? [punt('tailscale', 'wand', w.tailscale[0], i.eigenPoort, false, w.tailscale[1], w.tailscale[2], 'addons')] : []),
  ];
}
