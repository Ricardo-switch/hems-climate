/**
 * Eén proef van het brein (besluit 213) tegen een echte AI-taak in Home
 * Assistant: de opdracht zoals de dienst hem stuurt, met een klein huis, en
 * wat er na het toetsen van overblijft. Alleen lezen; er wordt niets bediend.
 *
 *   npx tsx tools/brein-proef.ts ai_task.google_ai_task "het is hier zo donker en ik ga film kijken"
 *
 * Leest HA_URL en HA_TOKEN uit de omgeving (backend/.env).
 */
import { opdrachtDenken, vanPlan, type Situatie } from '../src/web/brein.js';
import type { Bedienbaar } from '../src/web/opdracht.js';

const [entiteit = 'ai_task.google_ai_task', zin = 'het is hier zo donker en ik ga film kijken'] = process.argv.slice(2);
const basis = (process.env['HA_URL'] ?? '').replace(/^ws/, 'http');
const token = process.env['HA_TOKEN'] ?? '';
if (!basis || !token) throw new Error('HA_URL en HA_TOKEN ontbreken');

const lamp = (id: string, naam: string, zone: string | null, aan = false) => ({ id, naam, kamerId: 'beneden', kamer: 'Woonkamer', dimbaar: true, kleurtemp: true, aan, helderheidPct: aan ? 80 : null, zone });
const lampen = [lamp('light.plafonniere', 'Plafonnière', 'zithoek', true), lamp('light.sfeerverlichting', 'Sfeerverlichting', 'zithoek'), lamp('light.keuken', 'Keuken', 'keuken', true)];
const b: Bedienbaar = {
  kamers: [{ id: 'beneden', naam: 'Woonkamer', etageId: 'beneden', lampen }],
  zones: [
    { id: 'beneden::zithoek', naam: 'Zithoek', kamerId: 'beneden', kamer: 'Woonkamer', lampen: lampen.slice(0, 2) },
    { id: 'beneden::keuken', naam: 'Keuken', kamerId: 'beneden', kamer: 'Woonkamer', lampen: lampen.slice(2) },
  ],
  lampen,
  scenes: [],
  schermen: [
    { id: 'cover.screen_klein', naam: 'Screen klein', kamer: 'Woonkamer', standKiezen: true, terugmelding: true, zonnescherm: false, positiePct: 100 },
    { id: 'cover.screen_groot', naam: 'Screen groot', kamer: 'Woonkamer', standKiezen: true, terugmelding: true, zonnescherm: false, positiePct: 100 },
  ],
  etages: [{ id: 'beneden', naam: 'Beneden' }],
  recept: null,
};
const zones = [{ id: 'woonkamer', naam: 'Woonkamer' }, { id: 'zolder', naam: 'Zolder' }];
const situatie: Situatie = {
  regels: ['Het is donderdag 29 oktober, 19:40.', 'Het is 20,5° in de woonkamer en 18° op de zolder.', 'Gisteren in Woonkamer: van 19,5° tot 21,5°.', 'Er is iemand thuis.'],
  feiten: [
    { bron: 'nu.klok', tekst: '19:40' },
    { bron: 'nu.datum', tekst: 'donderdag 29 oktober' },
    { bron: 'warm.woonkamer', tekst: '20,5°' },
    { bron: 'warm.zolder', tekst: '18°' },
    { bron: 'gisteren.min', tekst: '19,5°' },
    { bron: 'gisteren.max', tekst: '21,5°' },
  ],
};
const klimaat = [{ id: 'woonkamer', naam: 'Woonkamer' }];
const opdracht = opdrachtDenken(zin, b, zones, situatie, [], klimaat, 'nl');
const velden = {
  soort: { description: 'doen, vraag, antwoord of niets', required: true, selector: { text: {} } },
  stappen: { description: 'alleen bij doen: een JSON-lijst van 1 tot 4 stappen, elk {"soort": "licht|scene|scherm|klimaat", "id": "...", "actie": "...", "waarde": ""}', required: false, selector: { text: {} } },
  vraag: { description: 'alleen bij vraag: een van de vaste vragen', required: false, selector: { text: {} } },
  kamer: { description: 'alleen bij de vaste vraag waarom: het id van de kamer', required: false, selector: { text: {} } },
  zin: { description: 'bij doen: één korte zin wat het huis doet; bij antwoord: het antwoord, hooguit drie zinnen', required: false, selector: { text: {} } },
};
const t0 = Date.now();
const res = await fetch(`${basis}/api/services/ai_task/generate_data?return_response`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ task_name: 'brein_proef', entity_id: entiteit, instructions: opdracht, structure: velden }),
});
const ms = Date.now() - t0;
const data = ((await res.json()) as { service_response?: { data?: unknown } }).service_response?.data;
console.log(`${opdracht.length} tekens, ${(ms / 1000).toFixed(1)} s`);
console.log('model:', JSON.stringify(data));
const plan = vanPlan(data, b, zones, klimaat, situatie, 'nl');
console.log('getoetst:', JSON.stringify(plan, (k, v) => (k === 'feiten' || k === 'gedaan' || k === 'vervolg' ? undefined : v)));
