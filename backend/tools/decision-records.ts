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
 *   npm run decisions:index     werkt de index bij
 */

export const TOPICS = [
  'visie en principes',
  'kern en regeling',
  'configuratie en onboarding',
  'meten, data en analyse',
  'weergave',
  'veiligheid',
  'uitrol en beheer',
  'kwaliteitsbewaking',
] as const;
export type Topic = (typeof TOPICS)[number];

export interface DecisionRecord {
  /** `49` of `49b`. */
  readonly id: string;
  readonly title: string;
  /** De kop zoals hij er staat, zonder de hekjes. */
  readonly heading: string;
  readonly topic: string | null;
  readonly status: string | null;
  /** Regelnummer van de kop, voor foutmeldingen. */
  readonly line: number;
}

export const INDEX_BEGIN = '<!-- index:begin -->';
export const INDEX_END = '<!-- index:einde -->';

const HEADING = /^(##|###) (\d+[a-z]?)\. (.+)$/;
const META = /^\*Onderwerp: ([^·]+?) · Status: (.+)\*$/;
const STATUS = /^(geldig|(?:gecorrigeerd|aangevuld|deels vervangen|vervangen) door (\d+[a-z]?))$/;

export function parseDecisionRecords(text: string): DecisionRecord[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const result: DecisionRecord[] = [];
  lines.forEach((line, i) => {
    const m = HEADING.exec(line);
    if (!m) return;
    // De metaregel staat direct onder de kop, na één lege regel.
    const meta = META.exec(lines[i + 2] ?? '');
    result.push({
      id: m[2]!,
      title: m[3]!,
      heading: `${m[2]}. ${m[3]}`,
      topic: meta ? meta[1]!.trim() : null,
      status: meta ? meta[2]!.trim() : null,
      line: i + 1,
    });
  });
  return result;
}

/** Wat er aan de besluiten ontbreekt of niet klopt. Leeg is goed. */
export function validate(records: readonly DecisionRecord[]): string[] {
  const ids = new Set(records.map((b) => b.id));
  const errors: string[] = [];
  for (const b of records) {
    const where = `besluit ${b.id} (regel ${b.line})`;
    if (b.topic == null || b.status == null) {
      errors.push(`${where}: geen regel "*Onderwerp: … · Status: …*" onder de kop`);
      continue;
    }
    if (!(TOPICS as readonly string[]).includes(b.topic)) {
      errors.push(`${where}: onbekend onderwerp "${b.topic}"; kies uit ${TOPICS.join(', ')}`);
    }
    const s = STATUS.exec(b.status);
    if (!s) {
      errors.push(`${where}: status "${b.status}" is geen "geldig" of "<soort> door <besluit>"`);
    } else if (s[2] != null && !ids.has(s[2])) {
      errors.push(`${where}: status verwijst naar besluit ${s[2]}, en dat bestaat niet`);
    }
  }
  return errors;
}

/** Het anker dat GitHub bij een kop maakt: letters, cijfers, spaties en streepjes. */
export function anchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]/gu, '')
    .replace(/ /g, '-');
}

export function buildIndex(records: readonly DecisionRecord[]): string {
  const blockList: string[] = [
    INDEX_BEGIN,
    '',
    '## Index',
    '',
    'Per onderwerp. Een besluit dat later is gecorrigeerd of vervangen, staat er',
    'toch in: het waarom blijft gelden voor wie het oude gedrag tegenkomt.',
    'Gemaakt met `npm run decisions:index`; een test bewaakt dat hij klopt.',
  ];
  for (const topic of TOPICS) {
    const here = records.filter((b) => b.topic === topic);
    if (here.length === 0) continue;
    blockList.push('', `**${topic[0]!.toUpperCase()}${topic.slice(1)}**`, '');
    for (const b of here) {
      const status = b.status === 'geldig' ? '' : ` — *${b.status}*`;
      blockList.push(`- [${b.heading}](#${anchor(b.heading)})${status}`);
    }
  }
  blockList.push(
    '',
    'Wat nog open staat: [Wat nog een besluit wacht](#wat-nog-een-besluit-wacht).',
    '',
    INDEX_END,
  );
  return blockList.join('\n');
}

/** Het besluitenlog met de index bijgewerkt. Voegt hem toe als hij er nog niet is. */
export function withIndex(text: string): string {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const clean = text.replace(/\r\n/g, '\n');
  const index = buildIndex(parseDecisionRecords(clean));
  const begin = clean.indexOf(INDEX_BEGIN);
  const end = clean.indexOf(INDEX_END);
  let result: string;
  if (begin >= 0 && end > begin) {
    result = clean.slice(0, begin) + index + clean.slice(end + INDEX_END.length);
  } else {
    // Vóór de eerste scheidingslijn, dus na de inleiding.
    const line = clean.indexOf('\n---\n');
    result = `${clean.slice(0, line)}\n\n${index}\n${clean.slice(line)}`;
  }
  return result.replace(/\n/g, nl);
}
