/*
 * Voorbeeldgegevens voor de schetsen Wand-Voortgang en Tel-Voortgang: dit huis
 * op 28 oktober 2026. Alleen wat er in Home Assistant is.
 */
// Hoe ver het huis is om het klimaat over te nemen (de datasetmeter, besluit 64).
const KLAAR = 0.5;
const KLEUR = { werkt: 'var(--mint)', kijkt: 'var(--ijs)', leert: 'var(--violet)' };
const LABEL = { werkt: 'Werkt', kijkt: 'Kijkt mee', leert: 'Leert nog' };
// Vier ringen: gevonden in Home Assistant, geleerd, kijkt mee, werkt.
const TREDEN = ['Gevonden', 'Geleerd', 'Kijkt mee', 'Werkt'];
const voortgang = (x) => window.waaier.voortgang(x.stand, x.deel, KLAAR);

// Alleen wat er in Home Assistant is; wat er nog bij kan, staat op Wat je huis kan.
const GROEPEN = [
  ['gemak', 'Gemak', [
    { id: 'licht', kort: 'Licht en scènes', titel: 'Licht en scènes', stand: 'werkt', wat: 'Lampen en scènes per kamer bedienen, ook met je stem.', weet: ['21 lampen in 7 kamers', '6 scènes uit Home Assistant'] },
    { id: 'screens', kort: 'Screens', titel: 'Screens en zonnescherm', stand: 'werkt', wat: 'Open, dicht of half, vanaf elk scherm.', weet: ['in de Woonkamer en de Achtertuin'] },
    { id: 'vraag', kort: 'Vraag het je huis', titel: 'Vraag het je huis', stand: 'werkt', wat: 'Vraag wat je wilt weten, of zeg wat het moet doen.', weet: ['verstaat Nederlands en Engels', 'antwoordt met de stem die je koos'] },
    { id: 'camera', kort: 'Camera’s', titel: 'Camera’s en deurbel', stand: 'werkt', wat: 'Beeld op elk scherm als er gebeld wordt.', weet: ['2 camera’s en de deurbel'] },
  ]],
  ['overzicht', 'Overzicht', [
    { id: 'opbrengst', kort: 'Opbrengst', titel: 'Opbrengst en kosten', stand: 'werkt', wat: 'Wat je betaalde, wat de panelen opleverden.', weet: ['37% uit je eigen panelen deze maand', 'meters sinds februari 2025'] },
    { id: 'batterijen', kort: 'Batterijen', titel: 'Batterijen en filters', stand: 'werkt', wat: 'Een seintje als een batterij bijna leeg is.', weet: ['14 sensoren met een batterij', 'de schakelaar in de badkamer is bijna leeg'] },
    { id: 'weer', kort: 'Weer en zon', titel: 'Weer en zon', stand: 'werkt', wat: 'Het weer van nu en morgen, voor het plan van de dag.', weet: ['van Open-Meteo'] },
  ]],
  ['comfort', 'Comfort', [
    { id: 'temperatuur', kort: 'Op temperatuur', titel: 'Op temperatuur', stand: 'kijkt', wat: 'Elke kamer op de temperatuur die je wilt.', weet: ['in de Woonkamer, Badkamer en Zolder', 'beslist al mee sinds 5 september'], komt: ['zelf regelen na een winter meekijken'] },
    { id: 'perkamer', kort: 'Per kamer', titel: 'Verwarmen per kamer', stand: 'kijkt', wat: 'Alleen warm waar het nodig is.', weet: ['in de Woonkamer en Badkamer'], komt: ['zelf regelen na een winter meekijken'] },
    { id: 'afwezig', kort: 'Afwezig', titel: 'Afwezig en vakantie', stand: 'kijkt', wat: 'Vanzelf zuinig als niemand thuis is.', weet: ['weet wie er thuis is via de telefoons'], komt: ['zelf regelen na een winter meekijken'] },
  ]],
  ['leert', 'Leert', [
    { id: 'optijd', kort: 'Op tijd warm', titel: 'Op tijd warm of koel', stand: 'leert', deel: 0.25, wat: 'Hoe snel elke kamer verwarmt en afkoelt, zodat het huis op tijd begint en niet te vroeg.', weet: ['54 dagen meegekeken, sinds 5 september', 'elke stand van de regeling gezien, ook verwarmen'], komt: ['een winter: 0 van 30 dagen', 'op zijn vroegst klaar eind december'], balk: { tekst: 'Winterdagen', van: 0, tot: 30 } },
    { id: 'gevoel', kort: 'Wat je prettig vindt', titel: 'Wat jij prettig vindt', stand: 'werkt', wat: 'Tik op Thuis hoe het voelt; het huis past zich aan.', weet: ['12 keer gezegd hoe het voelde', 'Woonkamer een halve graad warmer'] },
    { id: 'ligging', kort: 'Ligging panelen', titel: 'Ligging van de panelen', stand: 'leert', deel: 4 / 7, wat: 'Naar welke kant de panelen liggen en hoe schuin. Daarmee weet het hoeveel zon er komt, en wanneer.', weet: ['oost en west, helling ± 50°', '4 zonnige dagen vergeleken'], komt: ['nog 3 zonnige dagen'], balk: { tekst: 'Zonnige dagen', van: 4, tot: 7 } },
  ]],
  ['zon', 'Op zon', [
    { id: 'opzon', kort: 'Koelen op zon', titel: 'Koelen en verwarmen op zon', stand: 'kijkt', wat: 'De airco’s draaien als de panelen genoeg leveren.', weet: ['in de Woonkamer en Zolder'], komt: ['zelf regelen na een winter meekijken'] },
    { id: 'droger', kort: 'Droger', titel: 'De droger', stand: 'kijkt', wat: 'Start als er zon over is, en is klaar wanneer jij wilt.', weet: ['3 keer op zon gestart'], komt: ['zelf starten na een winter meekijken'] },
    { id: 'boiler', kort: 'Boiler', titel: 'De boiler', stand: 'kijkt', wat: 'Naar 65° op zon, eens per week 60° tegen legionella.', weet: ['nu 52°'], komt: ['zelf regelen na een winter meekijken'] },
    { id: 'jacuzzi', kort: 'Jacuzzi', titel: 'De jacuzzi', stand: 'kijkt', wat: 'Warm houden, op zon naar 38°.', weet: ['nu 35°'], komt: ['zelf regelen na een winter meekijken'] },
  ]],
  ['kosten', 'Kosten', [
    { id: 'zekering', kort: 'Zekering', titel: 'Nooit meer dan je zekering', stand: 'kijkt', wat: 'Nooit zoveel tegelijk aan dat de zekering eruit slaat.', weet: ['1 × 35 A'], komt: ['zelf regelen na een winter meekijken'] },
    { id: 'sluip', kort: 'Sluipverbruik', titel: 'Wat er altijd aan staat', stand: 'werkt', wat: 'Elke nacht gemeten uit de slimme meter.', weet: ['± 165 W, ook ’s nachts'] },
  ]],
];
const ALLES = GROEPEN.flatMap(([g, , lijst]) => lijst.map((x) => ({ ...x, groep: g, p: voortgang(x) })));
const TOTAAL = Math.round(ALLES.reduce((n, x) => n + x.p, 0) / ALLES.length * 100);
const tel = (s) => ALLES.filter((x) => x.stand === s).length;
// Zo wil de kit (waaier.js) de groepen hebben.
const W_GROEPEN = GROEPEN.map(([id, naam, lijst]) => ({ id, naam, onderwerpen: lijst.map((x) => ALLES.find((y) => y.id === x.id)) }));
