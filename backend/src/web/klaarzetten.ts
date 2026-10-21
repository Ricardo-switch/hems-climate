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
import type { HouseRegisters } from './house.js';
import type { SpraakKeuze } from './functies.js';

export type KlaarGroep = 'basis' | 'klimaat' | 'energie' | 'bewoners' | 'gemak' | 'praten' | 'wand';
export const KLAAR_GROEPEN: readonly [KlaarGroep, string][] = [
  ['basis', 'De basis'],
  ['klimaat', 'Klimaat'],
  ['energie', 'Zon en energie'],
  ['bewoners', 'Bewoners'],
  ['gemak', 'Gemak'],
  ['praten', 'Praten met je huis'],
  ['wand', 'De wand en je telefoon'],
];

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
  algemeen: ['/config/general', 'Instellingen › Systeem › Algemeen'],
  ruimtes: ['/config/areas/dashboard', 'Instellingen › Gebieden, etages en labels'],
  personen: ['/config/person', 'Instellingen › Personen'],
  integraties: ['/config/integrations/dashboard', 'Instellingen › Apparaten en diensten'],
  energie: ['/config/energy', 'Instellingen › Dashboards › Energie'],
  spraak: ['/config/voice-assistants/assistants', 'Instellingen › Spraakassistenten'],
  addons: ['/hassio/dashboard', 'Instellingen › Add-ons'],
} as const;

const telling = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`;

export function klaarzetten(i: KlaarInput): KlaarPunt[] {
  const r = i.registers;
  const st = (id: string) => i.states.get(id);
  const actief = (r?.entities ?? []).filter((e) => !e.disabled_by && i.states.has(e.entity_id));
  const van = (domein: string) => actief.filter((e) => e.entity_id.startsWith(`${domein}.`));
  const klasse = (e: { entity_id: string }) => String(st(e.entity_id)?.attributes['device_class'] ?? '');
  const deviceArea = new Map((r?.devices ?? []).map((d) => [d.id, d.area_id]));
  const inRuimte = (e: { area_id?: string | null; device_id?: string | null }) => (e.area_id ?? (e.device_id ? deviceArea.get(e.device_id) : null)) != null;
  const punt = (id: string, groep: KlaarGroep, titel: string, ok: boolean, nodig: boolean, klaar: string, mist: string, pad: readonly [string, string] | null): KlaarPunt => ({
    id,
    groep,
    titel,
    stand: ok ? 'klaar' : nodig ? 'mist' : 'optioneel',
    zin: ok ? klaar : mist,
    pad: pad?.[0] ?? null,
    waar: pad?.[1] ?? '',
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
    punt('locatie', 'basis', 'Locatie en tijdzone', i.locatie, true, 'Home Assistant weet waar het huis staat: voor de zon, het weer en de gevels.', 'Zet de locatie van je huis en de tijdzone.', PAD.algemeen),
    punt(
      'ruimtes', 'basis', 'Etages en ruimtes', etages > 0 && ruimtes > 0 && zonder === 0, true,
      `${telling(ruimtes, 'ruimte', 'ruimtes')} op ${telling(etages, 'etage', 'etages')}, elk apparaat in zijn ruimte.`,
      ruimtes === 0 ? 'Maak etages en ruimtes, en zet elk apparaat in zijn ruimte. De app neemt ze over als voorstel.' : etages === 0 ? 'Zet de ruimtes op een etage; dan staat het huis goed in de tekening.' : `${telling(zonder, 'apparaat staat', 'apparaten staan')} nog in geen ruimte.`,
      PAD.ruimtes,
    ),
    punt(
      'personen', 'bewoners', 'Een persoon per bewoner', personen.length > 0 && metAccount === personen.length, true,
      `${telling(personen.length, 'persoon', 'personen')}, elk met een eigen account.`,
      personen.length === 0 ? 'Maak een persoon per bewoner, gekoppeld aan een account. Zonder persoon is iemand een gast.' : `${telling(personen.length - metAccount, 'persoon heeft', 'personen hebben')} nog geen account; koppel er een.`,
      PAD.personen,
    ),
    punt(
      'telefoon', 'bewoners', 'Thuis of weg', metTelefoon > 0, true,
      `${metTelefoon} van ${personen.length} ${personen.length === 1 ? 'persoon wordt' : 'personen worden'} gevolgd, met de app van Home Assistant.`,
      'Installeer de app van Home Assistant op elke telefoon, met locatie aan. Wie er thuis is, bepaalt het comfort.',
      PAD.personen,
    ),
    punt('klimaat', 'klimaat', 'Thermostaten en airco’s', klimaat > 0, true, `${telling(klimaat, 'apparaat', 'apparaten')} voor verwarmen of koelen.`, 'Voeg je thermostaat en airco’s toe in Home Assistant, met hun eigen koppeling.', PAD.integraties),
    punt('temperatuur', 'klimaat', 'Temperatuur per kamer', temperaturen > 0, true, `${telling(temperaturen, 'thermometer', 'thermometers')} in een ruimte.`, 'Een thermometer per kamer, in zijn ruimte, of een thermostaat die de kamertemperatuur meldt.', PAD.ruimtes),
    punt('netmeter', 'energie', 'De slimme meter', i.netMeter, true, 'De meter geeft wat er van en naar het net gaat.', 'Koppel je slimme meter (P1), liefst lokaal, met het vermogen van en naar het net.', PAD.integraties),
    punt(
      'omvormer', 'energie', 'De omvormer', i.zon.heeft, false,
      i.zon.intervalS != null && i.zon.intervalS > 120 ? `Gevonden, maar hij meldt maar eens per ${Math.round(i.zon.intervalS / 60)} minuten. Lokaal gaat sneller.` : 'De opbrengst van je panelen komt binnen.',
      'Koppel je omvormer, liefst lokaal, voor de opbrengst van nu.',
      PAD.integraties,
    ),
    punt('energiedashboard', 'energie', 'Het Energie-dashboard', i.energieDashboard, false, 'Ingevuld; Opbrengst neemt de meters over.', 'Vul het in; dan neemt Opbrengst je meters en prijzen over.', PAD.energie),
    punt('opzon', 'energie', 'Apparaten op zon', i.apparatenOpZon > 0, false, `${telling(i.apparatenOpZon, 'apparaat kan', 'apparaten kunnen')} op afstand starten.`, 'Een droger, wasmachine of vaatwasser met "op afstand starten", zoals via Home Connect, LG ThinQ, SmartThings of Miele.', PAD.integraties),
    punt('lampen', 'gemak', 'Lampen en scènes', lampen > 0, false, `${telling(lampen, 'lamp', 'lampen')}.`, 'Lampen in Home Assistant; met Philips Hue ook de kleuren van je scènes.', PAD.integraties),
    punt('schermen', 'gemak', 'Screens en zonneschermen', schermen > 0, false, `${telling(schermen, 'scherm', 'schermen')}.`, 'Screens en zonneschermen als scherm in Home Assistant.', PAD.integraties),
    punt('cameras', 'gemak', 'Camera’s en de deurbel', i.cameras > 0, false, `${telling(i.cameras, 'camera', 'camera’s')}${i.deurbel ? ', met een deurbel' : ''}.`, 'Camera’s, en een deurbel met een melder, zoals van Reolink, Ring, Nest of UniFi.', PAD.integraties),
    punt('rookmelders', 'gemak', 'Rookmelders', i.rookmelders > 0, false, `${telling(i.rookmelders, 'rookmelder', 'rookmelders')}.`, 'Rookmelders die rook, koolmonoxide of hitte melden.', PAD.integraties),
    punt('weer', 'gemak', 'Een weerbron', weer > 0, false, `${telling(weer, 'weerdienst', 'weerdiensten')}.`, 'Een weerdienst zoals Buienradar; zonder werkt Open-Meteo ook.', PAD.integraties),
    punt('spraak', 'praten', 'Een spraakassistent', metStt.length > 0, false, `${metStt.map((s) => s.naam).join(', ')}, met spraak naar tekst.`, 'Een spraakassistent met spraak naar tekst (Whisper of Home Assistant Cloud) en Piper voor de stem.', PAD.spraak),
    punt(
      'wekwoord', 'praten', 'Het wekwoord', metWekwoord.length > 0, false,
      heHuis ? 'Hé huis staat bij een spraakassistent.' : `Een wekwoord staat bij ${metWekwoord.map((s) => s.naam).join(', ')}.`,
      i.addOn ? 'Herstart de openWakeWord-add-on één keer en kies he_huis bij een spraakassistent; de add-on zette het klaar.' : 'De openWakeWord-add-on, met een wekwoord bij een spraakassistent.',
      PAD.spraak,
    ),
    punt('taalmodel', 'praten', 'Een taalmodel', taalmodellen > 0, false, `${telling(taalmodellen, 'AI-taak', 'AI-taken')}; kies er een bij Functies › Praten.`, 'Een AI-taak, zoals van OpenAI, Anthropic of Ollama, als de assistent het in eigen woorden mag zeggen.', PAD.integraties),
    punt('beweging', 'wand', 'Een bewegingsmelder', beweging > 0, false, `${telling(beweging, 'melder', 'melders')}; de wand wordt wakker als er iemand langsloopt.`, 'Een bewegingsmelder bij de wand, om hem te wekken.', PAD.integraties),
    ...(i.addOn
      ? [punt('tailscale', 'wand', 'Smart Climate op je telefoon', i.eigenPoort, false, 'De eigen poort staat open; installeer de app bij Functies › Op je startscherm.', 'Met de Tailscale-add-on en de eigen poort zet je Smart Climate als app op je telefoon.', PAD.addons)]
      : []),
  ];
}
