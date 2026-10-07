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

/*
 * `STAND.md`: de doorsnede naast de geschiedenis. Per onderwerp hoe het nu
 * werkt, met verwijzingen als `[95]`. De links onderaan maakt deze module; een
 * test eist dat elk besluit dat nog geldt erin staat, zodat de pagina niet
 * ongemerkt achterloopt zoals `Architecture.md` ooit deed.
 */

export const LINKS_BEGIN = '<!-- links:begin -->';
export const LINKS_END = '<!-- links:einde -->';

/** Een verwijzing `[95]`, maar geen linkdefinitie `[95]:` en geen inline link `[95](…)`. */
const REF = /\[(\d+[a-z]?)\](?![(:])/g;

/** Wat nog geldt, ook als het is aangevuld of deels vervangen, moet in de stand staan. */
function stillApplies(status: string | null): boolean {
  return status != null && !/^(gecorrigeerd|vervangen) door /.test(status);
}

function withoutLinks(text: string): string {
  const begin = text.indexOf(LINKS_BEGIN);
  const end = text.indexOf(LINKS_END);
  return begin >= 0 && end > begin ? text.slice(0, begin) + text.slice(end + LINKS_END.length) : text;
}

/** De besluiten waar de stand naar verwijst, in volgorde van nummer. */
export function standReferences(stand: string): string[] {
  const ids = new Set([...withoutLinks(stand.replace(/\r\n/g, '\n')).matchAll(REF)].map((m) => m[1]!));
  return [...ids].sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
}

/** Wat er aan de stand niet klopt. Leeg is goed. */
export function validateStand(stand: string, records: readonly DecisionRecord[]): string[] {
  const errors: string[] = [];
  const known = new Set(records.map((b) => b.id));
  const refs = standReferences(stand);
  for (const id of refs) {
    if (!known.has(id)) errors.push(`de stand verwijst naar besluit ${id}, en dat bestaat niet`);
  }
  // `[15][42]` is in Markdown één link met tekst 15, niet twee verwijzingen.
  if (/\]\[/.test(withoutLinks(stand))) errors.push('twee verwijzingen staan direct naast elkaar; zet er een komma tussen');
  const mentioned = new Set(refs);
  for (const b of records) {
    if (stillApplies(b.status) && !mentioned.has(b.id)) {
      errors.push(`besluit ${b.id} (${b.status}) staat niet in de stand`);
    }
  }
  return errors;
}

/** De stand met de links onderaan bijgewerkt: één definitie per besluit waarnaar verwezen wordt. */
export function withLinks(stand: string, records: readonly DecisionRecord[]): string {
  const nl = stand.includes('\r\n') ? '\r\n' : '\n';
  const clean = stand.replace(/\r\n/g, '\n');
  const byId = new Map(records.map((b) => [b.id, b]));
  const lines = standReferences(clean)
    .filter((id) => byId.has(id))
    .map((id) => `[${id}]: DECISIONS.md#${anchor(byId.get(id)!.heading)}`);
  const block = [LINKS_BEGIN, ...lines, LINKS_END].join('\n');
  const begin = clean.indexOf(LINKS_BEGIN);
  const end = clean.indexOf(LINKS_END);
  const result =
    begin >= 0 && end > begin
      ? clean.slice(0, begin) + block + clean.slice(end + LINKS_END.length)
      : `${clean.trimEnd()}\n\n${block}\n`;
  return result.replace(/\n/g, nl);
}
