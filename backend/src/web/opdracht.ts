/**
 * Bedienen met een zin (besluit 148): "doe het licht beneden wat zachter",
 * "screen dicht", "stop".
 *
 * Dit bestand maakt van een zin een opdracht voor een van de bestaande smalle
 * deuren (`/api/licht`, `/api/scene`, `/api/scherm`), met de zin die het huis
 * erbij zegt en een kaartje per apparaat. Het schakelt zelf niets: de pagina
 * stuurt de opdracht naar de deur, met dezelfde inlog, dezelfde regels voor een
 * gast en dezelfde grens op het tempo als een knop.
 *
 * Alleen wat de app mag bedienen staat in de lijst (`bedienbaar`): lampen en
 * scènes als licht bedienen aan staat, schermen als schermen bedienen aan
 * staat. Klimaat staat er nooit in, en een garagedeur is geen scherm.
 *
 * De woordzoeker hieronder herkent de gewone zinnen zelf. Wat hij niet
 * begrijpt, kan een taalmodel kiezen (`taalmodel.ts`); die keuze loopt door
 * dezelfde bouwers (`lichtOpdracht`, `schermOpdracht`, `sceneOpdracht`), zodat
 * er maar één plek is die bepaalt wat mag.
 */

import type { Fact, Lang } from './assistant.js';
import { cap } from './assistant.js';
import type { HouseReport } from './house.js';
import { gewoon } from './woordzoeker.js';
import { metLidwoord } from './kamerwoorden.js';

/* ------------------------------------------------------------ de lijst */

export interface BedienLamp {
  readonly id: string;
  readonly naam: string;
  readonly kamerId: string;
  readonly kamer: string;
  readonly dimbaar: boolean;
  readonly kleurtemp: boolean;
  readonly aan: boolean;
  readonly helderheidPct: number | null;
}

export interface BedienKamer {
  readonly id: string;
  readonly naam: string;
  readonly etageId: string;
  readonly lampen: readonly BedienLamp[];
}

export interface BedienScene {
  readonly id: string;
  readonly naam: string;
  readonly kamer: string;
}

export interface BedienScherm {
  readonly id: string;
  readonly naam: string;
  readonly kamer: string;
  readonly standKiezen: boolean;
  readonly terugmelding: boolean;
  readonly zonnescherm: boolean;
  /** Zoals Home Assistant het zegt: 100 is open. Null zonder terugmelding. */
  readonly positiePct: number | null;
}

export interface Bedienbaar {
  readonly kamers: readonly BedienKamer[];
  readonly lampen: readonly BedienLamp[];
  readonly scenes: readonly BedienScene[];
  readonly schermen: readonly BedienScherm[];
  readonly etages: readonly { readonly id: string; readonly naam: string }[];
}

/** Wat de app nu mag bedienen, uit het huis zoals het nu is. */
export function bedienbaar(house: HouseReport | null, mag: { readonly licht: boolean; readonly scenes: boolean; readonly schermen: boolean }): Bedienbaar {
  const kamers: BedienKamer[] = [];
  const scenes: BedienScene[] = [];
  const schermen: BedienScherm[] = [];
  for (const etage of house?.etages ?? []) {
    for (const r of etage.ruimtes) {
      if (mag.licht) {
        const lampen = r.apparaten
          .filter((d) => d.soort === 'licht')
          .map((d) => ({ id: d.id, naam: d.naam, kamerId: r.id, kamer: r.naam, dimbaar: d.dimbaar, kleurtemp: d.kleurtemp, aan: d.aan, helderheidPct: d.aan ? d.helderheidPct : null }));
        if (lampen.length) kamers.push({ id: r.id, naam: r.naam, etageId: etage.id, lampen });
      }
      if (mag.licht && mag.scenes) for (const s of r.scenes) scenes.push({ id: s.id, naam: s.naam, kamer: r.naam });
      if (mag.schermen) {
        for (const d of r.apparaten) {
          if (d.soort !== 'screen' || !d.scherm) continue;
          schermen.push({ id: d.id, naam: d.naam, kamer: r.naam, standKiezen: d.scherm.standKiezen, terugmelding: d.scherm.terugmelding, zonnescherm: d.scherm.zonnescherm === true, positiePct: d.positiePct });
        }
      }
    }
  }
  return {
    kamers,
    lampen: kamers.flatMap((k) => k.lampen),
    scenes,
    schermen,
    etages: mag.licht ? (house?.etages ?? []).map((e) => ({ id: e.id, naam: e.naam })) : [],
  };
}

/* ------------------------------------------------------------ de opdracht */

/** Wat er veranderde, voor het kaartje onder het antwoord. */
export interface Kaartje {
  readonly soort: 'licht' | 'scene' | 'scherm';
  /** Groot op het kaartje: "40%", "Uit", "Gaat dicht". */
  readonly waarde: string;
  /** Klein eronder: "Plafonnière, was 80%". */
  readonly uitleg: string;
}

export interface Opdracht {
  readonly soort: 'licht' | 'scene' | 'scherm';
  /** De deur waar de pagina de opdracht naartoe stuurt. */
  readonly pad: 'api/licht' | 'api/scene' | 'api/scherm';
  readonly body: Readonly<Record<string, unknown>>;
  /** Wat het huis zegt als het gelukt is. */
  readonly antwoord: string;
  readonly feiten: readonly Fact[];
  readonly gedaan: readonly Kaartje[];
  /** Een scherm dat nu beweegt: dan staat "Stop het screen" erbij. */
  readonly beweegt: { readonly id: string; readonly naam: string } | null;
  /** De kamer waar het over gaat, als ruimte-id, voor de tekening. */
  readonly ruimte: string | null;
  /** Een vervolg dat nu kan, als zin om op te tikken: "Sfeerverlichting ook zachter". */
  readonly vervolg: readonly { readonly label: string; readonly tekst: string }[];
}

/** Herkend: een opdracht, of een zin waarom het niet kan (welk scherm? dat kan hij niet). */
export type Herkend = { readonly ok: true; readonly opdracht: Opdracht } | { readonly ok: false; readonly antwoord: string };

export type LichtActie = 'aan' | 'uit' | 'zachter' | 'feller' | 'helderheid' | 'warm' | 'neutraal' | 'koel';
export type SchermActie = 'open' | 'dicht' | 'stop' | 'stand';

const pct = (n: number) => `${Math.round(n)}%`;

/** Woorden die een apparaat zijn en geen eigen naam: die krijgen een lidwoord. */
const DING = /^(lamp|lampen|plafonniere|plafonnière|spot|spots|spotjes|hanglamp|staande lamp|bureaulamp|leeslamp|ledstrip|led strip|verlichting|sfeerverlichting|licht|screen|screens|zonnescherm|rolluik|markies|luifel|border)\b/i;

/** "de plafonnière", "het screen woonkamer", of een eigen naam zoals hij is. */
export function dingNaam(naam: string): string {
  if (!DING.test(naam)) return naam;
  const klein = naam.charAt(0).toLowerCase() + naam.slice(1);
  return `${/^(screen|licht|rolluik|zonnescherm|scherm)/i.test(naam) ? 'het' : 'de'} ${klein}`;
}

/** Een naam met een cijfer erin is zelf een feit: dan mag het getal in de zin, zoals hij er staat. */
function naamFeit(naam: string): Fact[] {
  if (!/\d/.test(naam)) return [];
  const vormen = new Set([naam, naam.charAt(0).toLowerCase() + naam.slice(1), naam.toLowerCase()]);
  return [...vormen].map((tekst) => ({ bron: 'naam', tekst }));
}

function kamerZin(kamer: string): string {
  return /^(beneden|boven|buiten|binnen)$/i.test(kamer) ? kamer.toLowerCase() : `in ${DING.test(kamer) ? dingNaam(kamer) : metLidwoord(kamer)}`;
}

export type LichtDoel =
  | { readonly soort: 'lamp'; readonly lamp: BedienLamp }
  | { readonly soort: 'kamer'; readonly kamer: BedienKamer }
  | { readonly soort: 'etage'; readonly id: string; readonly naam: string; readonly lampen: readonly BedienLamp[] }
  | { readonly soort: 'huis'; readonly lampen: readonly BedienLamp[] };

function lampenVan(doel: LichtDoel): readonly BedienLamp[] {
  return doel.soort === 'lamp' ? [doel.lamp] : doel.soort === 'kamer' ? doel.kamer.lampen : doel.lampen;
}

/** De helderheid van nu: van de lamp, of de felste die aan is. Null als alles uit is. */
function helderheidNu(lampen: readonly BedienLamp[]): number | null {
  const aan = lampen.filter((l) => l.aan);
  if (!aan.length) return null;
  const h = aan.map((l) => l.helderheidPct).filter((x): x is number => x != null);
  return h.length ? Math.max(...h) : 100;
}

function wasVan(lampen: readonly BedienLamp[], lang: Lang): string {
  const h = helderheidNu(lampen);
  const nl = lang === 'nl';
  return h == null ? (nl ? 'was uit' : 'was off') : lampen.some((l) => l.dimbaar) && h < 100 ? `was ${pct(h)}` : nl ? 'was aan' : 'was on';
}

/** Een lichtopdracht, of waarom het niet kan. */
export function lichtOpdracht(doel: LichtDoel, actie: LichtActie, waarde: number | null, b: Bedienbaar, lang: Lang): Herkend {
  const nl = lang === 'nl';
  const lampen = lampenVan(doel);
  if (!lampen.length) return { ok: false, antwoord: nl ? 'Daar staan geen lampen die ik mag bedienen.' : 'There are no lights there that I may operate.' };
  const wie = doel.soort === 'lamp' ? cap(dingNaam(doel.lamp.naam)) : doel.soort === 'kamer' ? `Het licht ${kamerZin(doel.kamer.naam)}` : doel.soort === 'etage' ? `Het licht op ${doel.naam.toLowerCase()}` : 'Alle lampen';
  const wieEn = doel.soort === 'lamp' ? doel.lamp.naam : doel.soort === 'kamer' ? `The lights in ${doel.kamer.naam}` : doel.soort === 'etage' ? `The lights on ${doel.naam}` : 'All lights';
  const id = doel.soort === 'lamp' ? doel.lamp.id : doel.soort === 'kamer' ? doel.kamer.id : doel.soort === 'etage' ? doel.id : null;
  const ruimte = doel.soort === 'lamp' ? doel.lamp.kamerId : doel.soort === 'kamer' ? doel.kamer.id : null;
  const naamKaart =
    doel.soort === 'lamp' ? doel.lamp.naam
    : doel.soort === 'kamer' ? (nl ? `Licht ${doel.kamer.naam.toLowerCase()}` : `Lights ${doel.kamer.naam}`)
    : doel.soort === 'etage' ? doel.naam
    : nl ? 'Het hele huis' : 'The whole house';
  const meervoud = doel.soort !== 'lamp';
  const feitenNaam = doel.soort === 'lamp' ? naamFeit(doel.lamp.naam) : doel.soort === 'kamer' ? naamFeit(doel.kamer.naam) : doel.soort === 'etage' ? naamFeit(doel.naam) : [];
  const was = wasVan(lampen, lang);

  if (actie === 'uit') {
    return klaar(
      { doel: doel.soort, id, aan: false },
      nl ? `${wie} ${meervoud ? (doel.soort === 'huis' ? 'zijn' : 'is') : 'is'} uit.` : `${wieEn} ${meervoud ? 'are' : 'is'} off.`,
      feitenNaam,
      [{ soort: 'licht', waarde: nl ? 'Uit' : 'Off', uitleg: `${naamKaart}, ${was}` }],
    );
  }
  if (doel.soort === 'etage' || doel.soort === 'huis') {
    return { ok: false, antwoord: nl ? 'Een hele etage of het hele huis zet ik alleen uit, niet aan. Noem een kamer of een lamp.' : 'I only turn a whole floor or the house off, not on. Name a room or a light.' };
  }
  const dimbaar = lampen.some((l) => l.dimbaar);
  if (actie === 'warm' || actie === 'neutraal' || actie === 'koel') {
    if (!lampen.some((l) => l.kleurtemp)) return { ok: false, antwoord: nl ? `${wie} kan geen tint wit.` : `${wieEn} cannot change its white.` };
    const woord = nl ? { warm: 'warm wit', neutraal: 'neutraal wit', koel: 'koel wit' }[actie] : { warm: 'warm white', neutraal: 'neutral white', koel: 'cool white' }[actie];
    return klaar({ doel: doel.soort, id, aan: true, kleur: actie }, nl ? `${wie} ${meervoud ? 'is' : 'is'} nu ${woord}.` : `${wieEn} is now ${woord}.`, feitenNaam, [
      { soort: 'licht', waarde: cap(woord), uitleg: naamKaart },
    ]);
  }
  if (actie === 'aan' && waarde == null) {
    return klaar({ doel: doel.soort, id, aan: true }, nl ? `${wie} is aan.` : `${wieEn} ${meervoud ? 'are' : 'is'} on.`, feitenNaam, [{ soort: 'licht', waarde: nl ? 'Aan' : 'On', uitleg: `${naamKaart}, ${was}` }]);
  }
  if (!dimbaar) return { ok: false, antwoord: nl ? `${wie} kan alleen aan en uit.` : `${wieEn} can only go on and off.` };
  const nu = helderheidNu(lampen);
  let nieuw: number;
  if (actie === 'zachter') nieuw = nu == null ? 30 : Math.max(1, Math.round((nu * 0.5) / 5) * 5 || 5);
  else if (actie === 'feller') nieuw = nu == null ? 100 : Math.min(100, Math.max(nu + 30, Math.round((nu * 1.5) / 5) * 5));
  else nieuw = Math.min(100, Math.max(1, Math.round(waarde ?? 100)));
  const tekst = pct(nieuw);
  return klaar(
    { doel: doel.soort, id, aan: true, helderheidPct: nieuw },
    nl ? `${wie} staat op ${tekst}.` : `${wieEn} ${meervoud ? 'are' : 'is'} at ${tekst}.`,
    [...feitenNaam, { bron: 'licht.helderheid', tekst }],
    [{ soort: 'licht', waarde: tekst, uitleg: `${naamKaart}, ${was}` }],
  );

  function klaar(body: Record<string, unknown>, antwoord: string, feiten: Fact[], gedaan: Kaartje[]): Herkend {
    return { ok: true, opdracht: { soort: 'licht', pad: 'api/licht', body, antwoord, feiten, gedaan, beweegt: null, ruimte, vervolg: lichtVervolg(doel, actie, b, lang) } };
  }
}

/** Na het licht: de andere lampen in dezelfde kamer, en alles uit. */
function lichtVervolg(doel: LichtDoel, actie: LichtActie, b: Bedienbaar, lang: Lang): { label: string; tekst: string }[] {
  const kamer = doel.soort === 'lamp' ? b.kamers.find((k) => k.id === doel.lamp.kamerId) : doel.soort === 'kamer' ? doel.kamer : null;
  if (!kamer) return [];
  const nl = lang === 'nl';
  const uit: { label: string; tekst: string }[] = [];
  const ander = doel.soort === 'lamp' ? kamer.lampen.find((l) => l.id !== doel.lamp.id && l.aan && l.dimbaar) : null;
  if (ander && (actie === 'zachter' || actie === 'feller')) {
    const woord = nl ? actie : actie === 'zachter' ? 'dimmer' : 'brighter';
    uit.push({ label: nl ? `${ander.naam} ook ${woord}` : `${ander.naam} ${woord} too`, tekst: `${ander.naam} ${woord}` });
  }
  const scene = b.scenes.find((s) => s.kamer === kamer.naam);
  if (scene && actie !== 'uit') uit.push(nl ? { label: `Scène ${scene.naam}`, tekst: `scène ${scene.naam}` } : { label: `Scene ${scene.naam}`, tekst: `scene ${scene.naam}` });
  if (actie !== 'uit' && kamer.lampen.length > 1) uit.push(nl ? { label: `Alles ${kamerZin(kamer.naam)} uit`, tekst: `licht ${kamer.naam} uit` } : { label: `All off in ${kamer.naam}`, tekst: `lights ${kamer.naam} off` });
  if (actie === 'uit') uit.push(nl ? { label: `Licht ${kamerZin(kamer.naam)} weer aan`, tekst: `licht ${kamer.naam} aan` } : { label: `Lights in ${kamer.naam} on again`, tekst: `lights ${kamer.naam} on` });
  return uit.slice(0, 3);
}

export function sceneOpdracht(scene: BedienScene, b: Bedienbaar, lang: Lang): Herkend {
  const kamer = b.kamers.find((k) => k.naam === scene.kamer);
  return {
    ok: true,
    opdracht: {
      soort: 'scene',
      pad: 'api/scene',
      body: { id: scene.id },
      antwoord: lang === 'nl' ? `Scène ${scene.naam} staat aan.` : `Scene ${scene.naam} is on.`,
      feiten: naamFeit(scene.naam),
      gedaan: [{ soort: 'scene', waarde: scene.naam, uitleg: lang === 'nl' ? `Scène, ${scene.kamer.toLowerCase()}` : `Scene, ${scene.kamer}` }],
      beweegt: null,
      ruimte: kamer?.id ?? null,
      vervolg: !kamer ? [] : lang === 'nl' ? [{ label: `Licht ${kamerZin(kamer.naam)} uit`, tekst: `licht ${kamer.naam} uit` }] : [{ label: `Lights in ${kamer.naam} off`, tekst: `lights ${kamer.naam} off` }],
    },
  };
}

/** De stand in woorden zoals de app hem toont: "60% dicht", of uitgevouwen bij een zonnescherm. */
function standWoord(s: BedienScherm, lang: Lang): string | null {
  if (s.positiePct == null) return null;
  const nl = lang === 'nl';
  if (s.zonnescherm) return s.positiePct <= 0 ? (nl ? 'ingeklapt' : 'retracted') : s.positiePct >= 100 ? (nl ? 'uitgevouwen' : 'extended') : `${pct(s.positiePct)} ${nl ? 'uit' : 'out'}`;
  return s.positiePct >= 100 ? 'open' : s.positiePct <= 0 ? (nl ? 'dicht' : 'closed') : `${pct(100 - s.positiePct)} ${nl ? 'dicht' : 'closed'}`;
}

/**
 * Een schermopdracht. `waarde` bij `stand` is hoeveel procent dicht, zoals de
 * app het toont (bij een zonnescherm: hoeveel uit); Home Assistant krijgt de
 * stand zoals hij hem kent (100 is open).
 */
export function schermOpdracht(s: BedienScherm, actie: SchermActie, waarde: number | null, b: Bedienbaar, lang: Lang): Herkend {
  const nl = lang === 'nl';
  const wie = cap(dingNaam(s.naam));
  const feitenNaam = naamFeit(s.naam);
  const ruimte = b.kamers.find((k) => k.naam === s.kamer)?.id ?? null;
  const was = standWoord(s, lang);
  const uitleg = was ? `${s.naam}, was ${was}` : s.naam;
  const vervolg = (lijst: [string, string][]) => lijst.map(([label, tekst]) => ({ label, tekst }));
  // Wat erna kan, als zin die de woordzoeker zelf weer verstaat.
  const heel: [string, string][] = s.zonnescherm
    ? nl ? [['Helemaal uit', `${s.naam} uit`], ['Weer in', `${s.naam} in`]] : [['All the way out', `${s.naam} out`], ['Back in', `${s.naam} in`]]
    : nl ? [['Helemaal dicht', `${s.naam} dicht`], ['Weer open', `${s.naam} open`]] : [['Fully closed', `${s.naam} close`], ['Open again', `${s.naam} open`]];
  const op = (body: Record<string, unknown>, antwoord: string, feiten: Fact[], kaart: Kaartje, beweegt: boolean, verder: [string, string][]): Herkend => ({
    ok: true,
    opdracht: { soort: 'scherm', pad: 'api/scherm', body, antwoord, feiten, gedaan: [kaart], beweegt: beweegt ? { id: s.id, naam: s.naam } : null, ruimte, vervolg: vervolg(verder) },
  });
  const zegStop = nl ? ' Zeg stop als het genoeg is.' : ' Say stop when it is enough.';
  if (actie === 'stop') {
    const zin = s.terugmelding ? (nl ? 'Gestopt.' : 'Stopped.') : nl ? `Gestopt. ${wie} meldt niet terug waar hij staat, dus kijk even of het goed is.` : `Stopped. ${s.naam} does not report where it is, so check that it is right.`;
    return op({ id: s.id, actie: 'stop', standPct: null }, zin, feitenNaam, { soort: 'scherm', waarde: nl ? 'Gestopt' : 'Stopped', uitleg: s.naam }, false, heel);
  }
  if (actie === 'stand') {
    if (!s.standKiezen) return { ok: false, antwoord: nl ? `${wie} meldt zijn stand niet terug; die kan alleen open, dicht en stop.` : `${s.naam} can only open, close and stop.` };
    const deel = Math.min(100, Math.max(0, Math.round(waarde ?? 50)));
    const positie = s.zonnescherm ? deel : 100 - deel;
    const tekst = pct(deel);
    return op(
      { id: s.id, actie: 'stand', standPct: positie },
      nl ? `${wie} gaat naar ${tekst} ${s.zonnescherm ? 'uit' : 'dicht'}.` : `${s.naam} goes to ${tekst} ${s.zonnescherm ? 'out' : 'closed'}.`,
      [...feitenNaam, { bron: 'scherm.stand', tekst }],
      { soort: 'scherm', waarde: `${tekst} ${s.zonnescherm ? (nl ? 'uit' : 'out') : nl ? 'dicht' : 'closed'}`, uitleg },
      true,
      heel,
    );
  }
  // Open is bij een zonnescherm uitvouwen, dicht is inklappen (besluit 128).
  const woord = s.zonnescherm ? (actie === 'open' ? 'vouwt uit' : 'klapt in') : actie === 'open' ? 'gaat open' : 'gaat dicht';
  const kaart = s.zonnescherm ? (actie === 'open' ? 'Vouwt uit' : 'Klapt in') : actie === 'open' ? 'Gaat open' : 'Gaat dicht';
  const doetEn = s.zonnescherm ? (actie === 'open' ? 'extending' : 'retracting') : actie === 'open' ? 'opening' : 'closing';
  const terug: [string, string] =
    actie === 'dicht'
      ? s.standKiezen ? [nl ? 'Half open' : 'Half open', `${s.naam} half`] : [nl ? 'Toch weer open' : 'Open again', `${s.naam} ${s.zonnescherm && !nl ? 'out' : 'open'}`]
      : s.zonnescherm ? [nl ? 'Weer in' : 'Back in', `${s.naam} in`] : [nl ? 'Toch weer dicht' : 'Close again', `${s.naam} ${nl ? 'dicht' : 'close'}`];
  return op(
    { id: s.id, actie, standPct: null },
    nl ? `${wie} ${woord}.${zegStop}` : `${s.naam} is ${doetEn}.${zegStop}`,
    feitenNaam,
    { soort: 'scherm', waarde: nl ? kaart : cap(doetEn), uitleg },
    true,
    [terug],
  );
}

/* ------------------------------------------------------- de zin lezen */

/** Een naam die in de tekst staat, als losse woorden; hoe langer, hoe beter. */
function treffer(tekst: string, naam: string): number {
  const n = gewoon(naam);
  if (n === '') return 0;
  if (` ${tekst} `.includes(` ${n} `)) return n.length + 10;
  // Alle woorden van de naam los in de zin ("lamp woonkamer" bij "Woonkamer lamp").
  const delen = n.split(' ').filter((w) => w.length > 2);
  return delen.length > 1 && delen.every((w) => ` ${tekst} `.includes(` ${w} `)) ? n.length : 0;
}

function beste<T extends { readonly naam: string }>(tekst: string, lijst: readonly T[]): T | null {
  let b: { x: T; s: number } | null = null;
  for (const x of lijst) {
    const s = treffer(tekst, x.naam);
    if (s > 0 && (b == null || s > b.s)) b = { x, s };
  }
  return b?.x ?? null;
}

const LICHT_WOORD = /\b(lamp|lampen|lampje|lampjes|licht|lichten|verlichting|spot|spots|spotjes|plafonniere|light|lights)\b/;
const SCHERM_WOORD = /\b(screen|screens|scherm|schermen|zonnescherm|zonwering|rolluik|rolluiken|markies|luifel|blind|blinds|awning|awnings|shutter|shutters|shade|shades)\b/;
const STOP = /^(stop|stoppen|stop maar|ho|halt|stop het scherm|stop het screen|stop screen|stop scherm|stop zonnescherm|stop het zonnescherm|stop it|stop the screen|stop the blinds|stop the awning|stop the shutter)$/;

/**
 * Een percentage of een los getal: "40", "op 40", "40 procent". Zonder de
 * namen van wat er bediend wordt: "spot 3 op 20" is 20, niet 3.
 */
function getal(tekst: string, namen: readonly string[] = []): number | null {
  let t = ` ${tekst} `;
  for (const naam of namen) if (naam) t = t.split(` ${gewoon(naam)} `).join(' ');
  const m = /(?:^| )(\d{1,3})(?= |$)/.exec(t.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 100 ? n : null;
}

/**
 * Leest een opdracht in eigen woorden. Null als het geen opdracht is (dan is
 * het een vraag, of iets voor het taalmodel). `laatsteScherm` is het scherm dat
 * de pagina net liet bewegen, voor een kale "stop".
 */
export function herkenOpdracht(ruw: string, b: Bedienbaar, lang: Lang, laatsteScherm: string | null = null): Herkend | null {
  let tekst = gewoon(ruw).replace(/%/g, '');
  if (tekst === '') return null;
  // Een vraag is geen opdracht: "waarom is het licht aan?", "staat het screen dicht?".
  if (/^(waarom|wanneer|hoe|wat|welke|staat|staan|is|zijn|why|when|how|what|which)\b/.test(tekst) && !/^(wat|hoe) (zachter|feller|lager|hoger)/.test(tekst)) return null;
  const nl = lang === 'nl';

  // Stop: een genoemd scherm, het scherm dat net bewoog, of het enige van die soort.
  if (STOP.test(tekst) || (/\bstop\b/.test(tekst) && SCHERM_WOORD.test(tekst))) {
    const zonnescherm = /\b(zonnescherm|zonwering|markies|luifel|awning)\b/.test(tekst);
    const soort = SCHERM_WOORD.test(tekst) ? b.schermen.filter((x) => x.zonnescherm === zonnescherm) : b.schermen;
    const s =
      beste(tekst, b.schermen) ??
      soort.find((x) => x.id === laatsteScherm) ??
      (soort.length === 1 ? soort[0]! : null) ??
      (b.schermen.length === 1 ? b.schermen[0]! : null);
    if (s) return schermOpdracht(s, 'stop', null, b, lang);
    return STOP.test(tekst) && b.schermen.length > 1 ? { ok: false, antwoord: nl ? `Welk scherm moet stoppen: ${b.schermen.map((x) => x.naam).join(' of ')}?` : `Which one should stop: ${b.schermen.map((x) => x.naam).join(' or ')}?` } : null;
  }

  // "naar beneden" en "naar boven" zijn een richting, geen kamer.
  const omlaag = /\bnaar beneden\b|\bomlaag\b|\bneer\b|\bzakken\b|\bdown\b|\blower\b/.test(tekst);
  const omhoog = /\bnaar boven\b|\bomhoog\b|\bup\b|\braise\b/.test(tekst);
  tekst = tekst.replace(/\bnaar (beneden|boven)\b/g, ' ').replace(/\s+/g, ' ').trim();

  // Een scherm: genoemd, of een woord voor scherm.
  const scherm = beste(tekst, b.schermen);
  if (!scherm && SCHERM_WOORD.test(tekst) && !b.schermen.length) {
    return { ok: false, antwoord: nl ? 'Schermen bedienen staat niet aan. Dat zet je aan bij Instellingen, onder Functies.' : 'Operating screens is off. Turn it on under Settings, Features.' };
  }
  if (scherm || (SCHERM_WOORD.test(tekst) && b.schermen.length)) {
    const zonnescherm = /\b(zonnescherm|zonwering|markies|luifel|awning)\b/.test(tekst);
    const kandidaten = scherm ? [scherm] : b.schermen.filter((s) => (zonnescherm ? s.zonnescherm : !s.zonnescherm));
    // Bij twee de kamer die genoemd wordt; anders vragen welke.
    const s = kandidaten.length === 1 ? kandidaten[0]! : kandidaten.find((x) => treffer(tekst, x.kamer) > 0) ?? null;
    if (s == null) {
      if (!kandidaten.length) return null;
      return { ok: false, antwoord: nl ? `Welke bedoel je: ${kandidaten.map((x) => x.naam).join(' of ')}?` : `Which one: ${kandidaten.map((x) => x.naam).join(' or ')}?` };
    }
    const n = getal(tekst, [s.naam, s.kamer]);
    if (/\bhalf\b|\bhalfweg\b|\bhalverwege\b/.test(tekst)) return schermOpdracht(s, 'stand', 50, b, lang);
    if (n != null && n > 0 && n < 100) return schermOpdracht(s, 'stand', n, b, lang);
    if (s.zonnescherm) {
      // Een zonnescherm vouw je uit en klap je in.
      if (/\b(uit|uitvouwen|uitrollen|open|openen|out|extend|roll out)\b/.test(tekst) || omlaag) return schermOpdracht(s, 'open', null, b, lang);
      if (/\b(in|inklappen|inrollen|dicht|sluit|sluiten|weg|retract|close|roll in)\b/.test(tekst) || omhoog) return schermOpdracht(s, 'dicht', null, b, lang);
      return null;
    }
    if (/\b(dicht|sluit|sluiten|close|closed|shut)\b/.test(tekst) || omlaag || n === 100) return schermOpdracht(s, 'dicht', null, b, lang);
    if (/\b(open|openen|weg|opendoen|open doen)\b/.test(tekst) || omhoog || n === 0) return schermOpdracht(s, 'open', null, b, lang);
    return null;
  }

  // Een scène, bij naam: "scène film", of de naam alleen als die lang genoeg is.
  const scene = beste(tekst.replace(/\bscene\b/g, ' ').replace(/\s+/g, ' ').trim(), b.scenes.filter((s) => /\bscene\b/.test(tekst) || gewoon(s.naam).length >= 4));
  if (scene && (/\bscene\b/.test(tekst) || /\b(aan|zet|start|kies|activate|turn on|switch on)\b/.test(tekst))) return sceneOpdracht(scene, b, lang);

  // Licht: een lamp bij naam, of een kamer met een woord voor licht.
  const lamp = beste(tekst, b.lampen);
  const kamer = lamp ? null : beste(tekst, b.kamers);
  const overal = /\b(alle lampen|alles|overal|hele huis|heel het huis|in huis|all lights|all the lights|everything|whole house|every light)\b/.test(tekst);
  const etage = lamp || kamer ? null : beste(tekst, b.etages);
  if (!lamp && !(LICHT_WOORD.test(tekst) || (kamer && /\b(dimmen|dim|zachter|feller)\b/.test(tekst)))) return null;
  const actie: LichtActie | null =
    /\b(uit|uitzetten|uitdoen|off)\b/.test(tekst) ? 'uit'
    : /\b(zachter|dimmen|dim|donkerder|lager|minder fel|minder|softer|dimmer|darker|turn down|lower)\b/.test(tekst) ? 'zachter'
    : /\b(feller|harder|helderder|lichter|hoger|meer licht|brighter|brighten|turn up|more light)\b/.test(tekst) ? 'feller'
    : /\b(warm|warmer|warmwit|gezellig|cosy|cozy)\b/.test(tekst) ? 'warm'
    : /\b(koel|koeler|koud|daglicht|cool|cooler|daylight)\b/.test(tekst) ? 'koel'
    : /\b(neutraal|neutral)\b/.test(tekst) ? 'neutraal'
    : getal(tekst, [lamp?.naam ?? '', kamer?.naam ?? '']) != null ? 'helderheid'
    : /\b(aan|aanzetten|aandoen|on)\b/.test(tekst) ? 'aan'
    : null;
  if (actie == null) return null;
  let doel: LichtDoel | null = null;
  if (lamp) doel = { soort: 'lamp', lamp };
  else if (kamer) doel = { soort: 'kamer', kamer };
  else if (etage) doel = { soort: 'etage', id: etage.id, naam: etage.naam, lampen: b.kamers.filter((k) => k.etageId === etage.id).flatMap((k) => k.lampen) };
  else if (overal) doel = { soort: 'huis', lampen: b.lampen };
  if (doel == null) {
    if (!b.lampen.length) return { ok: false, antwoord: nl ? 'Licht bedienen staat niet aan. Dat zet je aan bij Instellingen, onder Functies.' : 'Operating lights is off. Turn it on under Settings, Features.' };
    return { ok: false, antwoord: nl ? 'Welk licht bedoel je? Noem een kamer of een lamp, zoals "licht keuken uit".' : 'Which light do you mean? Name a room or a light, such as "kitchen lights off".' };
  }
  const n = getal(tekst, [lamp?.naam ?? '', kamer?.naam ?? '', etage?.naam ?? '']);
  return lichtOpdracht(doel, actie, actie === 'helderheid' ? n : null, b, lang);
}
