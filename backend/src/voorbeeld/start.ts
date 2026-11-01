/*
 * Het proces van het voorbeeldhuis (besluit 237).
 *
 * De dienst start dit als eigen proces, pas als iemand het voorbeeld opent.
 * Hier draait de gewone dienst (main.ts), maar met een nagemaakt Home
 * Assistant (nep-ha.ts) op 127.0.0.1, een eigen tijdelijke map en de
 * configuratie van het voorbeeldhuis. Een echt Home Assistant kent dit proces
 * niet: het adres en de sleutel ervan worden niet meegegeven.
 *
 * De klok van dit proces staat waar de bezoeker hem met de dagschuif zet: op
 * 15 juli of 13 januari, op het gekozen uur, en loopt vanaf daar door. Alles in
 * de dienst (de regeling, Vandaag, de dagdelen) rekent zo met die tijd.
 *
 * Met de dienst praat dit proces via berichten:
 *   { klok: { minuut, seizoen } }  de dagschuif
 *   { terug: true }                alles vergeten wat de bezoeker zette
 *   { vraag: 'bediend' }           wat er al bediend is, voor Probeer dit
 * en het zegt { klaar: poort } zodra de app antwoordt.
 */

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Klok, type Seizoen, dagBegin } from './dag.js';

/* ---- de klok ---- */

const EchteDate = Date;
const echtNu = EchteDate.now.bind(EchteDate);
let verschuiving = 0;
let seizoen: Seizoen = 'zomer';

/** Date, maar dan op de klok van het voorbeeld. Een datum met argumenten blijft gewoon. */
class VoorbeeldDate extends EchteDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(echtNu() + verschuiving);
    else super(...(args as [string]));
  }
  static override now(): number {
    return echtNu() + verschuiving;
  }
}
globalThis.Date = VoorbeeldDate as DateConstructor;

function zetKlok(k: Klok): void {
  seizoen = k.seizoen;
  verschuiving = dagBegin(k.seizoen, echtNu()) + Math.max(0, Math.min(1439, Math.round(k.minuut))) * 60_000 - echtNu();
}

/** Waar de klok nu staat: hij loopt door vanaf waar de bezoeker hem zette. */
function klok(): Klok {
  const nu = Date.now();
  const minuut = Math.floor((nu - dagBegin(seizoen, nu)) / 60_000);
  return { minuut: ((minuut % 1440) + 1440) % 1440, seizoen };
}

const vrijePoort = () =>
  new Promise<number>((ok, fout) => {
    const s = createServer();
    s.once('error', fout);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      const p = typeof a === 'object' && a != null ? a.port : 0;
      s.close(() => ok(p));
    });
  });

/* ---- opstarten ---- */

// Waar de dienst het voorbeeld laat beginnen (de dagschuif), anders een zomermiddag.
const [beginMinuut, beginSeizoen] = (process.env['HEMS_VOORBEELD_KLOK'] ?? '').split(':');
zetKlok({ minuut: beginMinuut && Number(beginMinuut) >= 0 && Number(beginMinuut) < 1440 ? Number(beginMinuut) : 12 * 60 + 40, seizoen: beginSeizoen === 'winter' ? 'winter' : 'zomer' });

const { NepHa } = await import('./nep-ha.js');
const { VOORBEELD_SITE } = await import('./huis.js');

const ha = new NepHa({ klok, nu: () => Date.now() });
const haPoort = await ha.start();
const map = await mkdtemp(join(tmpdir(), 'sunarc-voorbeeld-'));
const sites = join(map, 'config', 'sites');
await mkdir(sites, { recursive: true });
await mkdir(join(map, 'shadow'), { recursive: true });
await writeFile(join(sites, 'voorbeeldhuis.json'), JSON.stringify(VOORBEELD_SITE, null, 2));
const webPoort = await vrijePoort();

// Niets van het echte huis gaat mee: geen adres, geen sleutel, geen Supervisor.
for (const sleutel of ['SUPERVISOR_TOKEN', 'HA_URL', 'HA_TOKEN', 'HEMS_SITE', 'HEMS_CONFIG', 'HEMS_EIGEN_POORT', 'HEMS_HA_LOGIN_URL', 'HEMS_HA_DIENST_URL', 'HEMS_HOSTS', 'HEMS_ONBOARDING']) delete process.env[sleutel];
Object.assign(process.env, {
  HA_URL: `http://127.0.0.1:${haPoort}`,
  // In de vorm van een sleutel van Home Assistant, zodat de dienst hem aanneemt; hij opent niets.
  HA_TOKEN: `${Buffer.from('{"typ":"JWT","alg":"none"}').toString('base64url')}.${Buffer.from('{"voorbeeld":true}').toString('base64url')}.voorbeeld`,
  HEMS_OPEN: '1',
  HEMS_VOORBEELD: '1',
  HEMS_WEB_HOST: '127.0.0.1',
  HEMS_WEB_PORT: String(webPoort),
  HEMS_SITES_DIR: sites,
  SHADOW_LOG_DIR: join(map, 'shadow'),
  HEMS_LIGHTS: '1',
  HEMS_SCREENS: '1',
  SHADOW_TICK_SECONDS: '30',
});
process.chdir(map);

process.on('message', (b: { klok?: Klok; terug?: boolean; vraag?: string }) => {
  if (b.klok && (b.klok.seizoen === 'zomer' || b.klok.seizoen === 'winter') && Number.isFinite(b.klok.minuut)) {
    zetKlok(b.klok);
    ha.ververs();
    process.send?.({ klok: klok() });
  }
  if (b.terug) ha.terug();
  if (b.vraag === 'bediend') process.send?.({ bediend: [...ha.bediend], klok: klok() });
});
// Zonder de dienst die ons startte, is er niemand meer om voor te spelen.
process.on('disconnect', () => process.exit(0));

// De tijd loopt door: elke halve minuut de standen van nu.
setInterval(() => ha.ververs(), 30_000).unref();

await import('../main.js');

/**
 * Het voorbeeld is al ingericht: de meters van Opbrengst uit het energiedashboard,
 * en klimaat met de hand aan. Via de eigen vragen van de dienst, met dezelfde
 * controles als bij een bewoner; wat niet lukt, blijft gewoon leeg.
 */
async function inrichten(basis: string): Promise<void> {
  const vraag = async (pad: string, body?: unknown) => {
    const r = await fetch(basis + pad, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return (await r.json().catch(() => null)) as Record<string, unknown> | null;
  };
  for (let i = 0; i < 40; i++) {
    const e = await vraag('/api/energie').catch(() => null);
    if (e?.['voorstel']) {
      await vraag('/api/energie', e['voorstel']).catch(() => null);
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  for (let i = 0; i < 40; i++) {
    const f = await vraag('/api/functies').catch(() => null);
    const basisKeuze = (f?.['instellingen'] ?? f?.['voorstel']) as Record<string, unknown> | undefined;
    if (basisKeuze) {
      const praten = { ...((basisKeuze['praten'] as Record<string, unknown> | undefined) ?? {}), klimaat: true };
      await vraag('/api/functies', { ...basisKeuze, praten }).catch(() => null);
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

// Klaar zodra de app antwoordt.
for (let i = 0; i < 120; i++) {
  const ok = await fetch(`http://127.0.0.1:${webPoort}/api/health`).then((r) => r.ok).catch(() => false);
  if (ok) {
    await inrichten(`http://127.0.0.1:${webPoort}`);
    process.send?.({ klaar: webPoort, klok: klok() });
    break;
  }
  await new Promise((r) => setTimeout(r, 250));
}
