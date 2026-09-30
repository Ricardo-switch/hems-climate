/**
 * De index op het besluitenlog (punt 13 uit het kwaliteitsrapport).
 *
 * `DECISIONS.md` groeide chronologisch tot bijna tweeduizend regels, zonder
 * inhoudsopgave. Wie wilde weten wat er over veiligheid besloten is, of of een
 * besluit nog geldt, moest alles lezen.
 *
 * Onder elke kop staat nu één regel met onderwerp en status:
 *
 *     *Onderwerp: veiligheid · Status: deels vervangen door 42*
 *
 * Daaruit maakt deze module de index bovenaan. Een test eist dat elk besluit
 * zo'n regel heeft, dat de status naar een bestaand besluit verwijst en dat de
 * index klopt — anders veroudert hij net zo stil als `Architecture.md` deed.
 *
 *   npm run besluiten:index     werkt de index bij
 */

export const ONDERWERPEN = [
  'visie en principes',
  'kern en regeling',
  'configuratie en onboarding',
  'meten, data en analyse',
  'weergave',
  'veiligheid',
  'uitrol en beheer',
  'kwaliteitsbewaking',
] as const;
export type Onderwerp = (typeof ONDERWERPEN)[number];

export interface Besluit {
  /** `49` of `49b`. */
  readonly id: string;
  readonly titel: string;
  /** De kop zoals hij er staat, zonder de hekjes. */
  readonly kop: string;
  readonly onderwerp: string | null;
  readonly status: string | null;
  /** Regelnummer van de kop, voor foutmeldingen. */
  readonly regel: number;
}

export const INDEX_BEGIN = '<!-- index:begin -->';
export const INDEX_EINDE = '<!-- index:einde -->';

const KOP = /^(##|###) (\d+[a-z]?)\. (.+)$/;
const META = /^\*Onderwerp: ([^·]+?) · Status: (.+)\*$/;
const STATUS = /^(geldig|(?:gecorrigeerd|aangevuld|deels vervangen|vervangen) door (\d+[a-z]?))$/;

export function leesBesluiten(tekst: string): Besluit[] {
  const regels = tekst.replace(/\r\n/g, '\n').split('\n');
  const uit: Besluit[] = [];
  regels.forEach((regel, i) => {
    const m = KOP.exec(regel);
    if (!m) return;
    // De metaregel staat direct onder de kop, na één lege regel.
    const meta = META.exec(regels[i + 2] ?? '');
    uit.push({
      id: m[2]!,
      titel: m[3]!,
      kop: `${m[2]}. ${m[3]}`,
      onderwerp: meta ? meta[1]!.trim() : null,
      status: meta ? meta[2]!.trim() : null,
      regel: i + 1,
    });
  });
  return uit;
}

/** Wat er aan de besluiten ontbreekt of niet klopt. Leeg is goed. */
export function controleer(besluiten: readonly Besluit[]): string[] {
  const ids = new Set(besluiten.map((b) => b.id));
  const fouten: string[] = [];
  for (const b of besluiten) {
    const waar = `besluit ${b.id} (regel ${b.regel})`;
    if (b.onderwerp == null || b.status == null) {
      fouten.push(`${waar}: geen regel "*Onderwerp: … · Status: …*" onder de kop`);
      continue;
    }
    if (!(ONDERWERPEN as readonly string[]).includes(b.onderwerp)) {
      fouten.push(`${waar}: onbekend onderwerp "${b.onderwerp}"; kies uit ${ONDERWERPEN.join(', ')}`);
    }
    const s = STATUS.exec(b.status);
    if (!s) {
      fouten.push(`${waar}: status "${b.status}" is geen "geldig" of "<soort> door <besluit>"`);
    } else if (s[2] != null && !ids.has(s[2])) {
      fouten.push(`${waar}: status verwijst naar besluit ${s[2]}, en dat bestaat niet`);
    }
  }
  return fouten;
}

/** Het anker dat GitHub bij een kop maakt: letters, cijfers, spaties en streepjes. */
export function anker(kop: string): string {
  return kop
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]/gu, '')
    .replace(/ /g, '-');
}

export function maakIndex(besluiten: readonly Besluit[]): string {
  const blokken: string[] = [
    INDEX_BEGIN,
    '',
    '## Index',
    '',
    'Per onderwerp. Een besluit dat later is gecorrigeerd of vervangen, staat er',
    'toch in: het waarom blijft gelden voor wie het oude gedrag tegenkomt.',
    'Gemaakt met `npm run besluiten:index`; een test bewaakt dat hij klopt.',
  ];
  for (const onderwerp of ONDERWERPEN) {
    const hier = besluiten.filter((b) => b.onderwerp === onderwerp);
    if (hier.length === 0) continue;
    blokken.push('', `**${onderwerp[0]!.toUpperCase()}${onderwerp.slice(1)}**`, '');
    for (const b of hier) {
      const status = b.status === 'geldig' ? '' : ` — *${b.status}*`;
      blokken.push(`- [${b.kop}](#${anker(b.kop)})${status}`);
    }
  }
  blokken.push(
    '',
    'Wat nog open staat: [Wat nog een besluit wacht](#wat-nog-een-besluit-wacht).',
    '',
    INDEX_EINDE,
  );
  return blokken.join('\n');
}

/** Het besluitenlog met de index bijgewerkt. Voegt hem toe als hij er nog niet is. */
export function metIndex(tekst: string): string {
  const nl = tekst.includes('\r\n') ? '\r\n' : '\n';
  const schoon = tekst.replace(/\r\n/g, '\n');
  const index = maakIndex(leesBesluiten(schoon));
  const begin = schoon.indexOf(INDEX_BEGIN);
  const einde = schoon.indexOf(INDEX_EINDE);
  let uit: string;
  if (begin >= 0 && einde > begin) {
    uit = schoon.slice(0, begin) + index + schoon.slice(einde + INDEX_EINDE.length);
  } else {
    // Vóór de eerste scheidingslijn, dus na de inleiding.
    const lijn = schoon.indexOf('\n---\n');
    uit = `${schoon.slice(0, lijn)}\n\n${index}\n${schoon.slice(lijn)}`;
  }
  return uit.replace(/\n/g, nl);
}
