/**
 * De divergentietool.
 *
 *   npm run divergence
 *   npm run divergence -- --dagen 7
 *   npm run divergence -- --json
 *
 * Leest de beslislogboeken die van de NAS zijn opgehaald en zet ze naast wat het
 * YAML-systeem op datzelfde moment werkelijk deed.
 *
 * Er is bewust geen verbinding met Home Assistant nodig. De schaduwmodus legt de
 * waarneming vast op het moment dat hij beslist, dus het logboek is
 * zelfvoorzienend: geen token, geen netwerk, geen bewaartermijn van de recorder,
 * en dezelfde invoer geeft altijd hetzelfde rapport.
 *
 * De weergave bestaat uit drie lagen, van grof naar fijn:
 *
 *  1. Een tijdlijn per dag, één teken per kwartier. Patronen zie je hier meteen
 *     — "elke middag mis" ziet er heel anders uit dan "af en toe een hikje".
 *  2. Episodes: aaneengesloten afwijkingen, langste eerst, met de reden die de
 *     arbiter zelf opgaf. Dit is waar je naar kijkt als je wilt begrijpen wat er
 *     gebeurde.
 *  3. Totalen, onderaan, want een percentage zonder de twee lagen erboven zegt
 *     te weinig.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { analyse, type Analysis, type BucketState } from './analyse.js';
import { findLogFiles, readMoments } from './read.js';

const BUCKET_MS = 15 * 60_000;
const BUCKETS_PER_DAY = 96;

/** Eén teken per kwartier. Bewust ook zonder kleur te lezen. */
const GLYPH: Record<BucketState, string> = {
  geen: ' ',
  'beide-uit': '·',
  eens: '=',
  ruimer: '+',
  strenger: '!',
  failsafe: 'X',
};

interface Options {
  dir: string;
  days: number | null;
  json: boolean;
  minEpisodeMinutes: number;
  maxEpisodes: number;
}

function parseArgs(argv: readonly string[]): Options {
  const opts: Options = {
    dir: 'data/shadow',
    days: null,
    json: false,
    minEpisodeMinutes: 2,
    maxEpisodes: 15,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--json') opts.json = true;
    else if (arg === '--dagen' && next) {
      opts.days = Number(next);
      i++;
    } else if (arg === '--min-minuten' && next) {
      opts.minEpisodeMinutes = Number(next);
      i++;
    } else if (arg === '--max-episodes' && next) {
      opts.maxEpisodes = Number(next);
      i++;
    } else if (arg != null && !arg.startsWith('--')) {
      opts.dir = arg;
    }
  }
  return opts;
}

const fmt = (n: number, d = 0): string =>
  n.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });

const pct = (part: number, whole: number): string =>
  whole === 0 ? '—' : `${((part / whole) * 100).toFixed(1)}%`;

const dayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const clock = (ms: number): string =>
  new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

/** Verkort de HTML-uitleg van het oude systeem tot iets leesbaars. */
function shortLegacy(raw: string | null): string {
  if (raw == null) return '—';
  const text = raw
    .replace(/<br\s*\/?>/gi, ' · ')
    .replace(/<[^>]+>/g, '')
    .replace(/&emsp;|&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 58 ? `${text.slice(0, 57)}…` : text;
}

function renderTimeline(analysis: Analysis, lines: string[]): void {
  const byDay = new Map<string, BucketState[]>();
  for (const [bucketMs, state] of analysis.buckets) {
    const key = dayKey(bucketMs);
    let row = byDay.get(key);
    if (!row) {
      row = new Array<BucketState>(BUCKETS_PER_DAY).fill('geen');
      byDay.set(key, row);
    }
    const midnight = new Date(bucketMs);
    midnight.setHours(0, 0, 0, 0);
    const index = Math.floor((bucketMs - midnight.getTime()) / BUCKET_MS);
    if (index >= 0 && index < BUCKETS_PER_DAY) row[index] = state;
  }

  lines.push('  Tijdlijn — één teken per kwartier');
  lines.push(`  ${' '.repeat(11)}0h      3h      6h      9h      12h     15h     18h     21h`);
  for (const [day, row] of [...byDay.entries()].sort()) {
    lines.push(`  ${day}  ${row.map((s) => GLYPH[s]).join('')}`);
  }
  lines.push('');
  lines.push(
    `  ${GLYPH['beide-uit']} beide uit   ${GLYPH.eens} eens, draait   ` +
      `${GLYPH.strenger} ik zou stoppen   ${GLYPH.ruimer} ik zou draaien   ` +
      `${GLYPH.failsafe} failsafe`,
  );
}

function renderEpisodes(analysis: Analysis, opts: Options, lines: string[]): void {
  const shown = analysis.episodes.slice(0, opts.maxEpisodes);
  if (shown.length === 0) {
    lines.push('  Geen afwijkingen langer dan ' + opts.minEpisodeMinutes + ' minuten.');
    return;
  }

  lines.push(`  Afwijkingen, langste eerst (${analysis.episodes.length} in totaal)`);
  lines.push('  ' + '─'.repeat(74));
  for (const e of shown) {
    const richting =
      e.direction === 'strenger'
        ? 'oud draaide, ik zou stoppen'
        : 'oud stond uit, ik zou draaien';
    lines.push(
      `  ${dayKey(e.fromMs)} ${clock(e.fromMs)}–${clock(e.toMs)}  ` +
        `${String(e.minutes).padStart(4)} min  ${e.actuatorId}`,
    );
    lines.push(`      ${richting}${e.mode === 'onbekend' ? '' : `, modus ${e.mode}`}`);
    if (e.blockedBy) {
      lines.push(`      mijn reden : ${e.blockedBy}`);
    }
    lines.push(`      oud zei    : ${shortLegacy(e.legacy)}`);
    lines.push(
      `      net        : gemiddeld ${fmt(e.meanGridW)} W` +
        (e.attributableWh > 1
          ? `, ${fmt(e.attributableWh / 1000, 2)} kWh toe te rekenen`
          : ''),
    );
    lines.push('');
  }
  if (analysis.episodes.length > shown.length) {
    lines.push(`  … en nog ${analysis.episodes.length - shown.length} kortere.`);
  }
}

function render(analysis: Analysis, opts: Options): string {
  const lines: string[] = [];
  const days = (analysis.toMs - analysis.fromMs) / 86_400_000;

  lines.push('═'.repeat(78));
  lines.push('  DIVERGENTIE — arbiter naast het YAML-systeem');
  lines.push('═'.repeat(78));
  lines.push(
    `  venster    ${dayKey(analysis.fromMs)} ${clock(analysis.fromMs)} ` +
      `tot ${dayKey(analysis.toMs)} ${clock(analysis.toMs)}  (${days.toFixed(1)} dagen)`,
  );
  lines.push(
    `  momenten   ${fmt(analysis.moments)}` +
      (analysis.failsafeMoments > 0
        ? `, waarvan ${fmt(analysis.failsafeMoments)} met failsafe`
        : ''),
  );
  if (analysis.momentsWithObservation === 0) {
    lines.push('');
    lines.push('  GEEN VERGELIJKING MOGELIJK');
    lines.push('  ' + '─'.repeat(74));
    lines.push('  In deze logboeken staat niet wat het oude systeem op dat moment deed.');
    lines.push('  Dat wordt pas meegeschreven sinds de schaduwmodus de waarneming');
    lines.push('  vastlegt naast het besluit. Oudere logboeken bevatten alleen de kant');
    lines.push('  van de arbiter, en daar valt niets mee te vergelijken.');
    lines.push('');
    lines.push('  Draai de schaduwmodus op de bijgewerkte versie en haal over een dag');
    lines.push('  opnieuw op met sync-logs.bat.');
    lines.push('═'.repeat(78));
    return lines.join('\n');
  }

  if (analysis.momentsWithObservation < analysis.moments) {
    lines.push(
      `  let op     ${fmt(analysis.moments - analysis.momentsWithObservation)} momenten ` +
        'zonder waarneming; die tellen niet mee',
    );
  }
  lines.push('');

  renderTimeline(analysis, lines);
  lines.push('');

  lines.push('  Overeenstemming per apparaat');
  lines.push('  ' + '─'.repeat(74));
  lines.push(
    `  ${'apparaat'.padEnd(16)}${'eens'.padStart(16)}${'ik strenger'.padStart(14)}${'ik ruimer'.padStart(13)}`,
  );
  for (const t of analysis.tallies) {
    const total = t.agree + t.stricter + t.looser;
    lines.push(
      `  ${t.actuatorId.padEnd(16)}` +
        `${`${fmt(t.agree)} / ${pct(t.agree, total)}`.padStart(16)}` +
        `${fmt(t.stricter).padStart(14)}` +
        `${fmt(t.looser).padStart(13)}`,
    );
  }
  lines.push('');

  renderEpisodes(analysis, opts, lines);

  lines.push('  Netstroom naar de airco\'s');
  lines.push('  ' + '─'.repeat(74));
  lines.push(
    `  het oude systeem besteedde        ${fmt(analysis.legacyGridWh / 1000, 2).padStart(8)} kWh`,
  );
  lines.push(
    `  daarvan zou ik hebben vermeden    ${fmt(analysis.avoidableGridWh / 1000, 2).padStart(8)} kWh` +
      `  (${pct(analysis.avoidableGridWh, analysis.legacyGridWh)})`,
  );
  lines.push('');
  lines.push(
    '  Let op: dit is wat de arbiter op elk historisch moment anders besloten',
  );
  lines.push(
    '  zou hebben, niet wat je bespaard zou hebben. Hij heeft nooit gestuurd, dus',
  );
  lines.push(
    '  de temperatuur zou anders gelopen zijn en daarmee ook de vraag erna.',
  );
  lines.push('═'.repeat(78));

  return lines.join('\n');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const dir = resolve(opts.dir);

  if (!existsSync(dir)) {
    console.error(`De map ${dir} bestaat niet.`);
    console.error('  Haal de logboeken eerst op met sync-logs.bat.');
    process.exit(1);
  }

  let files = await findLogFiles(dir);
  if (files.length === 0) {
    console.error(`Geen decisions-*.ndjson gevonden in ${dir}.`);
    console.error('  Haal de logboeken eerst op met sync-logs.bat.');
    process.exit(1);
  }
  if (opts.days != null && Number.isFinite(opts.days)) {
    files = files.slice(-Math.max(1, Math.round(opts.days)));
  }

  const analysis = await analyse(readMoments(files), {
    minEpisodeMinutes: opts.minEpisodeMinutes,
  });

  if (analysis.moments === 0) {
    console.error('De logboeken bevatten geen bruikbare regels.');
    process.exit(1);
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        { ...analysis, buckets: Object.fromEntries(analysis.buckets) },
        null,
        2,
      ),
    );
    return;
  }

  console.log(render(analysis, opts));
  console.log(`\n  ${files.length} dagbestand(en) uit ${dir}`);
}

await main();
