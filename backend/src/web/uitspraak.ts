/**
 * Hoe een zin klinkt (besluit 142). Op het scherm staat "9,3 kWh om 13:45";
 * Piper leest dat letter voor letter ("kvh", "dertien vijfenveertig"). Daarom
 * gaat een zin eerst hierdoor voordat hij hardop gaat: eenheden voluit, een
 * tijd zoals je hem zegt ("kwart voor twee"), en een paar woorden zoals ze
 * klinken. Wat er staat verandert niet; alleen wat er gezegd wordt.
 */

const UREN = ['twaalf', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien', 'elf', 'twaalf'];
const MINUTEN = ['', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien', 'elf', 'twaalf', 'dertien', 'veertien'];

/** "13:45" wordt "kwart voor twee", "22:00" wordt "tien uur", "13:20" wordt "tien voor half twee". */
export function tijdInWoorden(uur: number, minuut: number): string {
  const u = (h: number) => UREN[((h % 12) + 12) % 12 || 12]!;
  const m = minuut;
  if (m === 0) return `${u(uur)} uur`;
  if (m === 15) return `kwart over ${u(uur)}`;
  if (m === 30) return `half ${u(uur + 1)}`;
  if (m === 45) return `kwart voor ${u(uur + 1)}`;
  if (m < 15) return `${MINUTEN[m]} over ${u(uur)}`;
  if (m < 30) return `${MINUTEN[30 - m]} voor half ${u(uur + 1)}`;
  if (m < 45) return `${MINUTEN[m - 30]} over half ${u(uur + 1)}`;
  return `${MINUTEN[60 - m]} voor ${u(uur + 1)}`;
}

/** Woorden die Piper anders uitspreekt dan je ze zegt. */
const KLANK: readonly (readonly [RegExp, string])[] = [
  [/\bairco's\b/gi, "erko's"],
  [/\bairco\b/gi, 'erko'],
  [/\bcv\b/gi, 'cee vee'],
  // App op zijn Engels, zoals je het zegt (besluit 166): Piper zei "ap".
  [/\bapp(s?)\b/gi, 'ep$1'],
  // Gevel met een lange e, niet als het voorvoegsel ge-: voorgeevel, niet voorge-vel.
  // Bij achter en zij knipt Piper het lange woord toch verkeerd: dan twee woorden.
  [/\b(achter|zij)gevel(s?)\b/gi, '$1 geevel$2'],
  [/\b(voor)?gevel(s?)\b/gi, '$1geevel$2'],
];

/**
 * Een Engelse zin zoals hij hardop klinkt (besluit 185): eenheden en euro's
 * voluit. Een tijd als 13:45 leest een Engelse stem zelf goed.
 */
function inHetEngels(tekst: string): string {
  let s = tekst.replace(/€\s?(\d+)(?:[.,](\d{2}))?/g, (_, e: string, c: string | undefined) => {
    const euro = Number(e);
    const cent = c == null ? 0 : Number(c);
    if (euro === 0) return `${cent} cents`;
    return cent === 0 ? `${euro} euros` : `${euro} euros ${cent}`;
  });
  s = s
    .replace(/(\d)\s?kWh\b/g, '$1 kilowatt hours')
    .replace(/(\d)\s?kWp\b/g, '$1 kilowatt peak')
    .replace(/(\d)\s?kW\b/g, '$1 kilowatts')
    .replace(/(\d)\s?Wh\b/g, '$1 watt hours')
    .replace(/(\d)\s?W\b/g, '$1 watts')
    .replace(/(\d)\s?m³/g, '$1 cubic metres')
    .replace(/(\d)\s?°C?/g, '$1 degrees')
    .replace(/(\d)\s?%/g, '$1 percent')
    .replace(/±\s?/g, 'about ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Een zin zoals hij hardop klinkt, in de taal van de app. */
export function uitspraak(tekst: string, lang: 'nl' | 'en' = 'nl'): string {
  if (lang === 'en') return inHetEngels(tekst);
  let s = tekst;
  // Tijden, maar niet in een reeks cijfers of een datum.
  s = s.replace(/(?<![\d:,.])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g, (_, h: string, m: string) => tijdInWoorden(Number(h), Number(m)));
  // Euro's: "€ 0,45" is 45 cent, "€ 62,18" is 62 euro 18.
  s = s.replace(/€\s?(\d+)(?:,(\d{2}))?/g, (_, e: string, c: string | undefined) => {
    const euro = Number(e);
    const cent = c == null ? 0 : Number(c);
    if (euro === 0) return `${cent} cent`;
    return cent === 0 ? `${euro} euro` : `${euro} euro ${cent}`;
  });
  // De komma in een getal hardop (29 oktober 2026): "21,5" klonk als "eenentwintig vijf".
  s = s.replace(/(\d),(\d)/g, '$1 komma $2');
  // Eenheden achter een getal; de langste eerst.
  s = s
    .replace(/(\d)\s?kWh\b/g, '$1 kilowattuur')
    .replace(/(\d)\s?kWp\b/g, '$1 kilowattpiek')
    .replace(/(\d)\s?kW\b/g, '$1 kilowatt')
    .replace(/(\d)\s?Wh\b/g, '$1 wattuur')
    .replace(/(\d)\s?W\b/g, '$1 watt')
    .replace(/(\d)\s?m³/g, '$1 kuub')
    .replace(/(\d)\s?°C?/g, '$1 graden')
    .replace(/(\d)\s?%/g, '$1 procent');
  s = s.replace(/±\s?/g, 'ongeveer ');
  for (const [re, klank] of KLANK) s = s.replace(re, klank);
  return s.replace(/\s+/g, ' ').trim();
}
