/**
 * Gewone kamerwoorden en hun lidwoord (besluit 131): "Zolder" wordt in een zin
 * "de zolder", "Kantoor" wordt "het kantoor", en een eigen naam zoals "Beneden"
 * of "Kamer van Sam" blijft zoals hij is.
 *
 * Eén lijst voor de hele dienst; stond eerder in vijf varianten verspreid, en
 * die liepen uit elkaar. De app heeft dezelfde lijst in `frontend/src/basis.js`
 * (`KAMERWOORDEN`); een test houdt ze gelijk.
 */

export const KAMERWOORDEN: Readonly<Record<string, 'de' | 'het'>> = {
  zolder: 'de', vliering: 'de', woonkamer: 'de', huiskamer: 'de', woonkeuken: 'de', keuken: 'de', bijkeuken: 'de',
  eetkamer: 'de', zithoek: 'de', serre: 'de', slaapkamer: 'de', kinderkamer: 'de', logeerkamer: 'de', speelkamer: 'de',
  studeerkamer: 'de', werkkamer: 'de', hobbykamer: 'de', kamer: 'de', badkamer: 'de', wasruimte: 'de', hal: 'de',
  gang: 'de', entree: 'de', overloop: 'de', trap: 'de', berging: 'de', garage: 'de', kelder: 'de', meterkast: 'de',
  schuur: 'de', zone: 'de', tuin: 'de', achtertuin: 'de', voortuin: 'de', oprit: 'de', carport: 'de',
  kantoor: 'het', toilet: 'het', washok: 'het', portaal: 'het', atelier: 'het', tuinhuis: 'het', terras: 'het', balkon: 'het',
};

/** Het eerste woord van een naam, als het een gewoon kamerwoord is. */
const EERSTE = new RegExp(`^(${Object.keys(KAMERWOORDEN).join('|')})\\b`, 'i');

/** Het lidwoord van een gewone kamernaam, of null bij een eigen naam. */
export function lidwoordVan(naam: string): 'de' | 'het' | null {
  const m = EERSTE.exec(naam.trim());
  return m ? KAMERWOORDEN[m[1]!.toLowerCase()] ?? null : null;
}

/** "Zolder" → "de zolder", "Kantoor boven" → "het kantoor boven", "Beneden" blijft "Beneden". */
export function metLidwoord(naam: string): string {
  const lw = lidwoordVan(naam);
  return lw ? `${lw} ${naam.charAt(0).toLowerCase()}${naam.slice(1)}` : naam;
}
